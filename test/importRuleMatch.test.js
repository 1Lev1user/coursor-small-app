import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { applyRules, applyRuleToExisting, defaultDecisions, extractPattern } from '../src/import/core.js';
import { knownSummaryText } from '../src/views/import.js';

function rule(pattern, extra = {}) {
    return { id: `r-${pattern}`, pattern, kind: 'expense', categoryId: 'necessary', subcategoryId: '', ...extra };
}

function matches(pattern, text) {
    const row = statementRow({ date: '2026-09-01', amountCents: 500, direction: 'out', description: text });
    return applyRules([rule(pattern)], row) !== null;
}

test('RIMI matches whole words only', () => {
    assert.equal(matches('RIMI', 'PRIMI PIATTI RESTORANS'), false);
    assert.equal(matches('RIMI', 'RIMINI PIZZA'), false);
    assert.equal(matches('RIMI', 'RIMI SHM ORIGO'), true);
    assert.equal(matches('RIMI', 'IEPIRKUMS RIMI'), true);
    assert.equal(matches('rimi', 'Rimi, Riga'), true);
});

test('BOLT does not match BOLTON but matches the Bolt shapes', () => {
    assert.equal(matches('BOLT', 'BOLTON FURNITURE'), false);
    assert.equal(matches('BOLT', 'BOLT.EU/R/123'), true);
});

test('a name with a digit keeps its boundary', () => {
    assert.equal(matches('TELE2', 'TELE2 SIA'), true);
    assert.equal(matches('TELE2', 'TELE25 SIA'), false);
    assert.equal(matches('TELE', 'TELE2 SIA'), false);
});

test('a saved rule still matches the glued reference shape', () => {
    assert.equal(matches('BOLT.EU', 'BOLT.EUR2610011807 TALLINN'), true);
    assert.equal(matches('BOLT.EU', 'BOLT.EUO2610011807'), true);
    assert.equal(matches('BOLT.EUR', 'BOLT.EUR2610011807'), true);
    assert.equal(matches('BOLT.EU', 'BOLT.EURO SHOP'), false);
    assert.equal(matches('BOLT.EU', 'BOLT.EU12'), false);
    assert.equal(matches('TELE2', 'TELE2XY12345'), false);
});

test('Latvian letters count as letters', () => {
    assert.equal(matches('ĶEKAVAS', 'Ķekavas pagasts'), true);
    assert.equal(matches('ĶEKAVAS', 'ĶEKAVASX'), false);
    assert.equal(matches('KEKAVAS', 'ĶEKAVAS PAGASTS'), true);
});

test('a keyword that occurs twice matches on the second occurrence', () => {
    assert.equal(matches('RIMI', 'PRIMI RIMI'), true);
});

test('stop-list keywords are never matched', () => {
    const stop = [
        'POS', 'PAR', 'UN', 'AR', 'NO', 'UZ', 'MAKSAJUMS', 'MAKSĀJUMS', 'PAYMENT', 'PIRKUMS', 'CARD', 'KARTE',
        'SIA', 'AS', 'OU', 'OÜ', 'UAB', 'LTD', 'LLC', 'GMBH', 'AB', 'IK', 'MB', 'VSIA', 'PSIA', 'INC',
    ];
    for (const word of stop) {
        assert.equal(matches(word, 'SIA POS MAKSAJUMS CARD RIMI AR UN PAR NO UZ AS OU'), false, word);
    }
    assert.equal(matches('SIA RIMI', 'SIA RIMI RIGA'), true);
});

test('a keyword needs 3 characters other than spaces', () => {
    assert.equal(matches('NS', 'NS TRADE'), false);
    assert.equal(matches('O2', 'O2 LATVIA'), false);
    assert.equal(matches('AB', 'AB SHOP'), false);
    assert.equal(matches('T-C', 'T-C SHOP'), true);
    assert.equal(matches('H&M', 'H&M RIGA'), true);
    assert.equal(matches('MAX', 'MAX CAFE'), true);
});

test('the longest matching keyword still wins', () => {
    const row = statementRow({ date: '2026-09-01', amountCents: 500, direction: 'out', description: 'RIMI MINI RIGA' });
    assert.equal(applyRules([rule('RIMI'), rule('RIMI MINI')], row).pattern, 'RIMI MINI');
    const primi = statementRow({ date: '2026-09-01', amountCents: 500, direction: 'out', description: 'PRIMI PIATTI' });
    assert.equal(applyRules([rule('RIMI'), rule('PRIMI')], primi).pattern, 'PRIMI');
});

test('extractPattern never offers a stop word or a short keyword', () => {
    for (const text of ['SIA', 'PAR', 'POS', 'NO', 'AS 1234', 'AB']) {
        assert.equal(extractPattern(text), '', text);
    }
    assert.equal(extractPattern('RIMI SHM ORIGO (RIGA) RIGA'), 'RIMI');
    assert.equal(extractPattern('BOLT.EUR2610011807 Tallinn'), 'BOLT.EUR');
    assert.equal(extractPattern('TELE2 SIA'), 'TELE2');
    assert.equal(extractPattern('SIA Circle K Latvia'), 'CIRCLE K');
    assert.equal(extractPattern('T-C SHOP'), 'T-C');
});

test('applyRuleToExisting follows the same matching', () => {
    const data = defaultData();
    data.expenses = ['RIMI SHM ORIGO', 'PRIMI PIATTI RESTORANS', 'RIMINI PIZZA', 'BOLTON FURNITURE'].map((text, i) => ({
        id: `e${i}`, importId: 'imp', bankText: text, note: text, refund: false,
        categoryId: 'random', subcategoryId: '', amountCents: 100, date: '2026-09-01',
    }));
    data.rules = [
        rule('RIMI', { id: 'a', subcategoryId: 'groceries' }),
        rule('BOLT', { id: 'b' }),
        rule('SIA', { id: 'c' }),
    ];
    assert.equal(applyRuleToExisting(data, 'a'), 1);
    assert.deepEqual(data.expenses.map((e) => e.categoryId), ['necessary', 'random', 'random', 'random']);
    assert.equal(applyRuleToExisting(data, 'b'), 0);
    assert.equal(applyRuleToExisting(data, 'c'), 0);
});

test('applyRuleToExisting respects boundaries for income', () => {
    const data = defaultData();
    data.incomes = ['ALGA SIA', 'ALGAS'].map((text, i) => ({
        id: `i${i}`, importId: 'imp', bankText: text, note: text, incomeCategoryId: 'income-other', amountCents: 100, date: '2026-09-01',
    }));
    data.rules = [{ id: 'a', pattern: 'ALGA', kind: 'income', incomeCategoryId: 'salary', categoryId: '', subcategoryId: '' }];
    assert.equal(applyRuleToExisting(data, 'a'), 1);
    assert.deepEqual(data.incomes.map((e) => e.incomeCategoryId), ['salary', 'income-other']);
});

test('defaultDecisions only sorts rows by a rule on a whole word', () => {
    const data = defaultData();
    data.rules = [rule('RIMI', { id: 'rimi', categoryId: 'random', subcategoryId: 'shopping' })];
    const rows = ['PRIMI PIATTI', 'RIMI SHM ORIGO'].map((description, i) => statementRow({
        date: `2026-09-0${i + 1}`, amountCents: 500 + i, direction: 'out', description,
    }));
    const [wrong, right] = defaultDecisions(data, rows);
    assert.equal(wrong.ruleId, '');
    assert.notEqual(wrong.categoryId, 'random');
    assert.equal(right.ruleId, 'rimi');
    assert.equal(right.categoryId, 'random');
});

function decision(extra) {
    return { include: true, kind: 'expense', categoryId: 'necessary', subcategoryId: '', incomeCategoryId: 'salary', ...extra };
}

test('knownSummaryText counts rows per category', () => {
    const data = defaultData();
    const decisions = [
        ...Array.from({ length: 5 }, () => decision({ subcategoryId: 'groceries' })),
        ...Array.from({ length: 3 }, () => decision({ subcategoryId: 'transport' })),
        decision({ categoryId: 'uncategorised' }),
    ];
    assert.equal(
        knownSummaryText(data, decisions, decisions.map((_, i) => i)),
        '9 rows sorted by your rules: Groceries 5, Transport 3, Uncategorised 1',
    );
    assert.equal(knownSummaryText(data, decisions, [0]), '1 row sorted by your rules: Groceries 1');
    assert.equal(knownSummaryText(data, decisions, [0, 5]), '2 rows sorted by your rules: Groceries 1, Transport 1');
    assert.equal(knownSummaryText(data, decisions, []), '');
});

test('knownSummaryText names income, refund, transfer and skip rows', () => {
    const data = defaultData();
    const decisions = [
        decision({ kind: 'income' }),
        decision({ kind: 'refund', subcategoryId: 'groceries' }),
        decision({ kind: 'transfer' }),
        decision({ kind: 'transfer' }),
        decision({ kind: 'skip' }),
    ];
    assert.equal(
        knownSummaryText(data, decisions, [0, 1, 2, 3, 4]),
        '5 rows sorted by your rules: Transfer 2, Salary 1, Refund Groceries 1, Skip 1',
    );
});
