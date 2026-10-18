import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, UNCATEGORISED_ID } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { applyImport, buildImport, defaultDecisions, upsertRule } from '../src/import/core.js';
import { suggestionLabel } from '../src/views/import.js';

const NOW = new Date(2026, 9, 6, 12);
const LABEL = 'From earlier imports';

const PLAIN = {
    include: true,
    kind: 'expense',
    categoryId: UNCATEGORISED_ID,
    subcategoryId: '',
    incomeCategoryId: 'income-other',
    remember: false,
    ruleId: '',
    showAs: '',
};

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

let counter = 0;
/** Pushes a stored entry that looks like one made by an earlier import. */
function stored(data, fields) {
    const {
        type = 'expense', text, date = '2026-09-01', categoryId = 'necessary', subcategoryId = '',
        refund = false, incomeCategoryId = 'income-other', importId = 'imp_old',
    } = fields;
    counter += 1;
    const base = { id: `e${counter}`, amountCents: 500, note: '', date, importId, bankText: text };
    if (type === 'income') data.incomes.push({ ...base, incomeCategoryId });
    else data.expenses.push({ ...base, categoryId, subcategoryId, refund });
    return data;
}

function out(description, extra = {}) {
    return statementRow({ date: '2026-10-05', amountCents: 840, direction: 'out', description, bankRef: `O-${description}`, ...extra });
}

function inRow(description, extra = {}) {
    return statementRow({ date: '2026-10-05', amountCents: 840, direction: 'in', description, bankRef: `I-${description}`, ...extra });
}

function one(data, row) {
    return defaultDecisions(data, [row])[0];
}

const HISTORY = (fields) => ({ source: 'history', ...fields });

test('a row takes the category of an earlier import with the same shop keyword', () => {
    const data = stored(freshData(), { text: 'NARVESEN RIGA · NARVESEN 12', categoryId: 'necessary', subcategoryId: 'groceries' });
    const decision = one(data, out('NARVESEN 14 RIGA'));
    assert.deepEqual(decision, {
        ...PLAIN,
        categoryId: 'necessary',
        subcategoryId: 'groceries',
        suggestion: HISTORY({ kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries', incomeCategoryId: 'income-other' }),
    });
});

test('the keyword of a stored entry is cut from its first segment, like a rule', () => {
    const data = stored(freshData(), { text: 'SIA Kārlis · SIA Kārlis veikals 12', categoryId: 'random', subcategoryId: 'shopping' });
    const decision = one(data, out('KĀRLIS VEIKALS 7'));
    assert.equal(decision.categoryId, 'random');
    assert.equal(decision.subcategoryId, 'shopping');
});

test('the latest entry date wins; equal dates keep the later list position', () => {
    const early = { text: 'NARVESEN 1', date: '2026-08-01', categoryId: 'necessary', subcategoryId: 'groceries' };
    const late = { text: 'NARVESEN 2', date: '2026-09-20', categoryId: 'random', subcategoryId: 'eating-out' };
    for (const order of [[early, late], [late, early]]) {
        const data = freshData();
        for (const fields of order) stored(data, fields);
        assert.equal(one(data, out('NARVESEN 14')).subcategoryId, 'eating-out');
    }
    const data = freshData();
    stored(data, { text: 'NARVESEN 1', date: '2026-09-01', categoryId: 'necessary', subcategoryId: 'health' });
    stored(data, { text: 'NARVESEN 2', date: '2026-09-01', categoryId: 'random', subcategoryId: 'shopping' });
    assert.equal(one(data, out('NARVESEN 14')).subcategoryId, 'shopping');
});

test('no match leaves the plain decision with no suggestion key', () => {
    const data = stored(freshData(), { text: 'NARVESEN RIGA · NARVESEN 12' });
    assert.deepEqual(one(data, out('LIDL RIGA')), PLAIN);

    const noImport = freshData();
    stored(noImport, { text: 'NARVESEN RIGA', importId: '' });
    noImport.expenses.push({ id: 'x', amountCents: 100, date: '2026-09-01', categoryId: 'random', subcategoryId: '', note: 'NARVESEN', refund: false });
    assert.deepEqual(one(noImport, out('NARVESEN 14')), PLAIN);

    const noText = stored(freshData(), { text: '' });
    assert.deepEqual(one(noText, out('NARVESEN 14')), PLAIN);
});

test('a saved rule beats the history', () => {
    const data = stored(freshData(), { text: 'NARVESEN 12', categoryId: 'necessary', subcategoryId: 'groceries' });
    upsertRule(data, { pattern: 'NARVESEN', kind: 'expense', categoryId: 'random', subcategoryId: 'shopping' });
    const decision = one(data, out('NARVESEN 14'));
    assert.equal(decision.categoryId, 'random');
    assert.equal(decision.subcategoryId, 'shopping');
    assert.notEqual(decision.ruleId, '');
    assert.equal('suggestion' in decision, false);
});

test('the history beats the MCC suggestion; without history the MCC still applies', () => {
    const row = out('RIMI 123 RIGA', { mcc: '5411' });
    assert.equal(one(freshData(), row).subcategoryId, 'groceries');

    const data = stored(freshData(), { text: 'RIMI 77', categoryId: 'necessary', subcategoryId: 'health' });
    const decision = one(data, row);
    assert.equal(decision.subcategoryId, 'health');
    assert.equal(decision.suggestion.source, 'history');

    const gone = stored(freshData(), { text: 'RIMI 77', categoryId: 'deleted-cat' });
    const fallback = one(gone, row);
    assert.equal(fallback.subcategoryId, 'groceries');
    assert.equal('suggestion' in fallback, false);
});

test('stop words, short keywords and partial words never match', () => {
    for (const text of ['POS', 'SIA', 'AB', 'NO']) {
        const data = stored(freshData(), { text });
        assert.deepEqual(one(data, out('POS SIA AB NO')), PLAIN, text);
    }
    const narvesen = stored(freshData(), { text: 'NARVESEN 12' });
    assert.deepEqual(one(narvesen, out('NARVESENX 3')), PLAIN);

    const rimi = stored(freshData(), { text: 'RIMI 12' });
    assert.deepEqual(one(rimi, out('PRIMI 3')), PLAIN);
    assert.equal(one(rimi, out('RIMI SHM')).suggestion.source, 'history');
});

test('nothing is written to the data; a rule appears only with Remember', () => {
    const data = stored(freshData(), { text: 'NARVESEN 12', categoryId: 'necessary', subcategoryId: 'groceries' });
    const rows = [out('NARVESEN 14')];
    const before = JSON.stringify(data);
    const decisions = defaultDecisions(data, rows);
    assert.equal(JSON.stringify(data), before);
    assert.deepEqual(data.rules, []);

    const built = buildImport(data, decisions, { rows, now: NOW });
    assert.equal(built.ok, true);
    assert.deepEqual(built.rules, []);
    assert.equal(built.expenses[0].categoryId, 'necessary');
    assert.equal(built.expenses[0].subcategoryId, 'groceries');

    const remembered = buildImport(data, [{ ...decisions[0], remember: true, pattern: 'NARVESEN' }], { rows, now: NOW });
    assert.equal(remembered.rules.length, 1);
});

test('money in uses refund and income entries; money out uses plain expenses', () => {
    const refund = stored(freshData(), { text: 'ZARA 1', refund: true, categoryId: 'random', subcategoryId: 'shopping' });
    const refunded = one(refund, inRow('ZARA 9'));
    assert.equal(refunded.kind, 'refund');
    assert.equal(refunded.categoryId, 'random');
    assert.equal(refunded.subcategoryId, 'shopping');
    assert.equal(refunded.suggestion.kind, 'refund');
    assert.deepEqual(one(refund, out('ZARA 9')), PLAIN);

    const income = stored(freshData(), { type: 'income', text: 'ACME PAYROLL 1', incomeCategoryId: 'salary' });
    const paid = one(income, inRow('ACME PAYROLL 9'));
    assert.equal(paid.kind, 'income');
    assert.equal(paid.incomeCategoryId, 'salary');
    assert.equal(paid.suggestion.kind, 'income');
    assert.deepEqual(one(income, out('ACME PAYROLL 9')), PLAIN);

    const shop = stored(freshData(), { text: 'ZARA 1', categoryId: 'random', subcategoryId: 'shopping' });
    assert.deepEqual(one(shop, inRow('ZARA 9')), { ...PLAIN, kind: 'income' });
});

test('entries in Uncategorised or in deleted categories are not sources', () => {
    const data = freshData();
    stored(data, { text: 'NARVESEN 1', date: '2026-08-01', categoryId: 'necessary', subcategoryId: 'groceries' });
    stored(data, { text: 'NARVESEN 2', date: '2026-09-01', categoryId: UNCATEGORISED_ID });
    stored(data, { text: 'NARVESEN 3', date: '2026-09-02', categoryId: 'necessary', subcategoryId: 'gone-sub' });
    stored(data, { text: 'NARVESEN 4', date: '2026-09-03', categoryId: 'gone-cat' });
    assert.equal(one(data, out('NARVESEN 14')).subcategoryId, 'groceries');

    const none = freshData();
    stored(none, { text: 'NARVESEN 2', categoryId: UNCATEGORISED_ID });
    assert.deepEqual(one(none, out('NARVESEN 14')), PLAIN);

    const income = stored(freshData(), { type: 'income', text: 'ACME PAYROLL 1', incomeCategoryId: 'gone-income' });
    assert.deepEqual(one(income, inRow('ACME PAYROLL 9')), { ...PLAIN, kind: 'income' });
});

test('transfers are not sources', () => {
    const data = freshData();
    data.transfers = [{ id: 't1', direction: 'out', amountCents: 500, date: '2026-09-01', note: '', importId: 'imp_old', bankText: 'NARVESEN 12' }];
    assert.deepEqual(one(data, out('NARVESEN 14')), PLAIN);
});

test('only the row\'s own keyword counts, never one found inside its text', () => {
    const data = freshData();
    stored(data, { text: 'ORIGO', date: '2026-10-11', categoryId: 'subscriptions' });
    stored(data, { text: 'RIMI', date: '2026-10-01', categoryId: 'necessary', subcategoryId: 'groceries' });
    const decision = one(data, out('RIMI ORIGO', { counterparty: 'RIMI ORIGO' }));
    assert.equal(decision.categoryId, 'necessary');
    assert.equal(decision.subcategoryId, 'groceries');

    const onlyMall = stored(freshData(), { text: 'ORIGO', categoryId: 'subscriptions' });
    assert.deepEqual(one(onlyMall, out('RIMI ORIGO', { counterparty: 'RIMI ORIGO' })), PLAIN);

    const processor = stored(freshData(), { text: 'PAYPAL 1', categoryId: 'necessary', subcategoryId: 'groceries' });
    assert.deepEqual(one(processor, out('PAYPAL SPOTIFY 9')), PLAIN);
    stored(processor, { text: 'PAYPAL SPOTIFY 1', categoryId: 'random', subcategoryId: 'shopping' });
    assert.equal(one(processor, out('PAYPAL SPOTIFY 9')).categoryId, 'random');
});

test('the counterparty decides the keyword; the description is used only when it gives none', () => {
    const data = stored(freshData(), { text: 'NARVESEN 1', categoryId: 'necessary', subcategoryId: 'groceries' });
    stored(data, { text: 'LIDL 1', categoryId: 'random', subcategoryId: 'shopping' });
    assert.equal(one(data, out('LIDL RIGA', { counterparty: 'NARVESEN 5' })).subcategoryId, 'groceries');
    assert.equal(one(data, out('NARVESEN 5', { counterparty: 'SIA' })).subcategoryId, 'groceries');
});

test('a row whose own keyword is empty gets no history', () => {
    const data = stored(freshData(), { text: 'NARVESEN 12', categoryId: 'necessary', subcategoryId: 'groceries' });
    assert.deepEqual(one(data, out('SIA')), PLAIN);
    assert.deepEqual(one(data, out('SIA', { counterparty: 'POS' })), PLAIN);
});

test('a hint, reversal or skip kind gets no history', () => {
    const data = stored(freshData(), { text: 'NARVESEN 12', categoryId: 'necessary', subcategoryId: 'groceries' });
    const hinted = one(data, out('NARVESEN 14', { kindHint: 'transfer' }));
    assert.equal(hinted.kind, 'transfer');
    assert.equal('suggestion' in hinted, false);
    assert.equal(hinted.categoryId, UNCATEGORISED_ID);

    const reversal = one(data, out('NARVESEN 14', { reversal: true }));
    assert.equal('suggestion' in reversal, false);
    assert.equal(reversal.categoryId, UNCATEGORISED_ID);

    const rows = [
        out('NARVESEN 14', { reversal: true, bankRef: 'P1' }),
        inRow('NARVESEN 14', { reversal: true, bankRef: 'P1' }),
    ];
    for (const decision of defaultDecisions(data, rows)) {
        assert.equal('suggestion' in decision, false);
        assert.equal(decision.categoryId, UNCATEGORISED_ID);
    }
});

test('a history row can still be paired as an own transfer', () => {
    const data = stored(freshData(), { text: 'SAVINGS TOPUP 1', categoryId: 'necessary', subcategoryId: 'rent' });
    const rows = [
        out('SAVINGS TOPUP 2', { amountCents: 150000 }),
        inRow('SAVINGS TOPUP 2', { amountCents: 150000, date: '2026-10-06' }),
    ];
    const decisions = defaultDecisions(data, rows);
    assert.deepEqual(decisions.map(({ kind }) => kind), ['transfer', 'transfer']);
    assert.equal(suggestionLabel(decisions[0]), '');
});

test('a duplicate row is unticked but still carries the suggestion', () => {
    const data = stored(freshData(), { text: 'NARVESEN 12', categoryId: 'necessary', subcategoryId: 'groceries' });
    const rows = [out('NARVESEN 14')];
    const chosen = [{ ...defaultDecisions(data, rows)[0], categoryId: 'necessary', subcategoryId: 'groceries' }];
    applyImport(data, buildImport(data, chosen, { rows, now: NOW }));
    const again = defaultDecisions(data, rows)[0];
    assert.equal(again.include, false);
    assert.equal(again.suggestion.source, 'history');
});

test('suggestionLabel shows only while the choice equals the suggestion', () => {
    const data = stored(freshData(), { text: 'NARVESEN 12', categoryId: 'necessary', subcategoryId: 'groceries' });
    const decision = one(data, out('NARVESEN 14'));
    assert.equal(suggestionLabel(decision), LABEL);
    for (const change of [{ categoryId: 'random' }, { subcategoryId: '' }, { kind: 'refund' }, { kind: 'transfer' }]) {
        assert.equal(suggestionLabel({ ...decision, ...change }), '', JSON.stringify(change));
    }

    const income = stored(freshData(), { type: 'income', text: 'ACME PAYROLL 1', incomeCategoryId: 'salary' });
    const paid = one(income, inRow('ACME PAYROLL 9'));
    assert.equal(suggestionLabel(paid), LABEL);
    assert.equal(suggestionLabel({ ...paid, incomeCategoryId: 'income-other' }), '');

    assert.equal(suggestionLabel(PLAIN), '');
    assert.equal(suggestionLabel({ ...PLAIN, ruleId: 'r1' }), '');
});

test('scale: thousands of stored entries and rows stay fast', () => {
    const name = (i) => `SHOP${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + (Math.floor(i / 26) % 26))}${i % 7} X`;
    const data = freshData();
    for (let i = 0; i < 3000; i += 1) stored(data, { text: name(i) });
    const rows = [];
    for (let i = 0; i < 1000; i += 1) rows.push(out(name(i), { bankRef: `B${i}`, amountCents: 100 + i }));
    const started = Date.now();
    const decisions = defaultDecisions(data, rows);
    assert.ok(Date.now() - started < 5000);
    assert.ok(decisions.some((decision) => decision.suggestion));
});

test('a history entry that changes nothing gives no suggestion', () => {
    const other = stored(freshData(), { type: 'income', text: 'ACME PAYROLL 1', incomeCategoryId: 'income-other' });
    assert.deepEqual(one(other, inRow('ACME PAYROLL 9')), { ...PLAIN, kind: 'income' });

    const row = out('RIMI 123 RIGA', { mcc: '5411' });
    const same = stored(freshData(), { text: 'RIMI 77', categoryId: 'necessary', subcategoryId: 'groceries' });
    assert.deepEqual(one(same, row), one(freshData(), row));
    assert.equal('suggestion' in one(same, row), false);
    assert.equal(one(same, row).subcategoryId, 'groceries');

    const differs = stored(freshData(), { text: 'RIMI 77', categoryId: 'necessary', subcategoryId: 'health' });
    assert.equal(one(differs, row).suggestion.subcategoryId, 'health');
});
