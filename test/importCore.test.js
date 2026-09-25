import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, UNCATEGORISED_ID } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import {
    fingerprint,
    makeFingerprints,
    findDuplicates,
    extractPattern,
    applyRules,
    upsertRule,
    deleteRule,
    monthsNeedingPlanChoice,
    defaultDecisions,
    buildImport,
    applyImport,
    undoImport,
    summarise,
} from '../src/import/core.js';

const NOW = new Date(2026, 8, 25, 12, 0, 0);

function row(date, amountCents, direction, description, extra = {}) {
    return statementRow({ date, amountCents, direction, description, ...extra });
}

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

function expenseDecision(categoryId = 'necessary', subcategoryId = 'groceries', extra = {}) {
    return { include: true, kind: 'expense', categoryId, subcategoryId, incomeCategoryId: '', remember: false, ...extra };
}

function incomeDecision(extra = {}) {
    return { include: true, kind: 'income', categoryId: '', subcategoryId: '', incomeCategoryId: 'salary', remember: false, ...extra };
}

function importRows(data, rows, decisions, planChoices = {}, fileName = 'statement.csv') {
    const built = buildImport(data, decisions, { rows, format: 'csv', fileName, now: NOW });
    const result = applyImport(data, built, planChoices);
    return { built, result };
}

const SEPTEMBER = [
    row('2026-09-17', 350, 'out', 'KAFIJA COFFEE RIGA', { bankRef: 'R1' }),
    row('2026-09-17', 350, 'out', 'KAFIJA COFFEE RIGA', { bankRef: 'R2' }),
    row('2026-09-18', 4250, 'out', 'RIMI MINI 1234 RIGA 17.09', { bankRef: 'R3' }),
    row('2026-09-20', 150000, 'in', 'ALGA', { counterparty: 'SIA Employer', bankRef: 'R4' }),
];

function septemberDecisions() {
    return [
        expenseDecision('random', 'eating-out'),
        expenseDecision('random', 'eating-out'),
        expenseDecision(),
        incomeDecision(),
    ];
}

test('fingerprint combines date, amount, direction and normalised text', () => {
    const first = row('2026-09-17', 350, 'out', 'Kafija  coffee');
    const second = row('2026-09-17', 350, 'out', 'KAFIJA COFFEE');
    assert.equal(fingerprint(first), fingerprint(second));
    assert.notEqual(fingerprint(first), fingerprint({ ...first, direction: 'in' }));
    assert.notEqual(fingerprint(first), fingerprint({ ...first, amountCents: 351 }));
});

test('makeFingerprints keeps identical rows in one file distinct', () => {
    const coffee = row('2026-09-17', 350, 'out', 'COFFEE');
    const prints = makeFingerprints([coffee, coffee, row('2026-09-17', 400, 'out', 'COFFEE'), coffee]);
    assert.equal(prints[0], fingerprint(coffee));
    assert.equal(prints[1], `${fingerprint(coffee)}#2`);
    assert.equal(prints[3], `${fingerprint(coffee)}#3`);
    assert.equal(new Set(prints).size, 4);
});

test('extractPattern follows the documented first-word rule', () => {
    assert.equal(extractPattern('RIMI MINI 1234 RIGA 17.09'), 'RIMI');
    assert.equal(extractPattern('Maxima X 55 Jurmala'), 'MAXIMA');
    assert.equal(extractPattern('SIA Circle K Latvia'), 'CIRCLE K');
    assert.equal(extractPattern('PAYPAL *SPOTIFY'), 'PAYPAL SPOTIFY');
    assert.equal(extractPattern('PAYPAL *SPOTIFY 4029357733 LU'), 'PAYPAL SPOTIFY');
    assert.equal(extractPattern('PIRKUMS 4111********1111 17.09.2026 12:34 LIDL LATVIJA RIGA'), 'LIDL');
    assert.equal(extractPattern('Wolt *1234 2026-09-17 17/09'), 'WOLT');
    assert.equal(extractPattern('12345 17.09 RĪGA LV'), '');
});

test('applyRules picks the longest matching pattern for the row direction', () => {
    const rules = [
        { id: 'r1', pattern: 'RIMI', kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries', refund: false },
        { id: 'r2', pattern: 'RIMI MINI', kind: 'expense', categoryId: 'random', subcategoryId: 'shopping', refund: false },
        { id: 'r3', pattern: 'RIMI', kind: 'income', incomeCategoryId: 'income-other' },
        { id: 'r4', pattern: 'SAVINGS', kind: 'transfer' },
    ];
    assert.equal(applyRules(rules, row('2026-09-18', 100, 'out', 'rimi mini riga'))?.id, 'r2');
    assert.equal(applyRules(rules, row('2026-09-18', 100, 'out', 'RIMI HYPER'))?.id, 'r1');
    assert.equal(applyRules(rules, row('2026-09-18', 100, 'in', 'RIMI MINI'))?.id, 'r3');
    assert.equal(applyRules(rules, row('2026-09-18', 100, 'in', 'To SAVINGS'))?.id, 'r4');
    assert.equal(applyRules(rules, row('2026-09-18', 100, 'out', 'LIDL')), null);
    assert.equal(
        applyRules(rules, row('2026-09-18', 100, 'out', 'Payment', { counterparty: 'Rimi Mini' }))?.id,
        'r2',
    );
});

test('upsertRule replaces by pattern per direction and deleteRule removes', () => {
    const data = defaultData();
    const first = upsertRule(data, { pattern: 'rimi', kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries' });
    assert.equal(first.ok, true);
    assert.equal(data.rules[0].pattern, 'RIMI');

    upsertRule(data, { pattern: 'RIMI', kind: 'expense', categoryId: 'random', subcategoryId: '' });
    assert.equal(data.rules.length, 1);
    assert.equal(data.rules[0].id, first.rule.id);
    assert.equal(data.rules[0].categoryId, 'random');

    upsertRule(data, { pattern: 'RIMI', kind: 'expense', categoryId: 'necessary', refund: true });
    assert.equal(data.rules.length, 2);

    assert.equal(upsertRule(data, { pattern: ' ', kind: 'expense' }).ok, false);
    assert.equal(deleteRule(data, first.rule.id), true);
    assert.equal(deleteRule(data, first.rule.id), false);
    assert.equal(data.rules.length, 1);
});

test('findDuplicates reports exact, probable and weak levels', () => {
    const data = freshData();
    data.expenses.push(
        { id: 'exp_bank', categoryId: 'random', subcategoryId: '', amountCents: 999, note: '', date: '2026-09-01', bankRef: 'BR-1', importId: 'imp_old', fingerprint: 'x' },
        { id: 'exp_manual', categoryId: 'random', subcategoryId: '', amountCents: 1200, note: 'Lunch', date: '2026-09-10' },
        { id: 'exp_sub', categoryId: 'subscriptions', subcategoryId: '', amountCents: 1599, note: 'Netflix', date: '2026-09-05', subscriptionId: 'sub_1' },
        { id: 'exp_near', categoryId: 'random', subcategoryId: '', amountCents: 800, note: '', date: '2026-09-12' },
    );
    const rows = [
        row('2026-09-01', 999, 'out', 'Whatever text', { bankRef: 'BR-1' }),
        row('2026-09-10', 1200, 'out', 'CAFE'),
        row('2026-09-05', 1599, 'out', 'NETFLIX.COM'),
        row('2026-09-14', 800, 'out', 'SHOP'),
        row('2026-09-15', 800, 'out', 'SHOP'),
        row('2026-09-10', 1200, 'in', 'CAFE'),
    ];
    const result = findDuplicates(data, rows);
    assert.deepEqual(result.map(({ level }) => level), ['exact', 'probable', 'probable', 'weak', null, null]);
    assert.equal(result[0].matchId, 'exp_bank');
    assert.equal(result[1].matchId, 'exp_manual');
    assert.equal(result[1].matchType, 'expense');
    assert.equal(result[2].matchId, 'exp_sub');
    assert.equal(result[3].matchId, 'exp_near');
});

test('findDuplicates matches income and refunds by direction', () => {
    const data = freshData();
    data.incomes.push({ id: 'inc_1', incomeCategoryId: 'salary', amountCents: 150000, note: '', date: '2026-09-20' });
    data.expenses.push({ id: 'exp_r', categoryId: 'random', subcategoryId: '', amountCents: 500, note: '', date: '2026-09-21', refund: true });
    const result = findDuplicates(data, [
        row('2026-09-20', 150000, 'in', 'ALGA'),
        row('2026-09-21', 500, 'in', 'RIMI RETURN'),
        row('2026-09-21', 500, 'out', 'RIMI'),
    ]);
    assert.deepEqual(result.map(({ level, matchType }) => [level, matchType]), [
        ['probable', 'income'],
        ['probable', 'expense'],
        [null, ''],
    ]);
});

test('re-importing the same file marks every row as exact', () => {
    const data = freshData();
    importRows(data, SEPTEMBER, septemberDecisions());
    const rowsWithoutRefs = SEPTEMBER.map((entry) => ({ ...entry, bankRef: '' }));
    assert.deepEqual(findDuplicates(data, SEPTEMBER).map(({ level }) => level), ['exact', 'exact', 'exact', 'exact']);
    assert.deepEqual(findDuplicates(data, rowsWithoutRefs).map(({ level }) => level), ['exact', 'exact', 'exact', 'exact']);
    const defaults = defaultDecisions(data, SEPTEMBER);
    assert.deepEqual(defaults.map(({ include }) => include), [false, false, false, false]);
});

test('overlapping statements: shared rows are exact, new rows are clean', () => {
    const data = freshData();
    const first = [
        row('2026-09-10', 350, 'out', 'COFFEE'),
        row('2026-09-17', 350, 'out', 'COFFEE'),
        row('2026-09-17', 350, 'out', 'COFFEE'),
    ];
    importRows(data, first, first.map(() => expenseDecision('random', 'eating-out')));

    const second = [
        row('2026-09-17', 350, 'out', 'COFFEE'),
        row('2026-09-17', 350, 'out', 'COFFEE'),
        row('2026-09-17', 350, 'out', 'COFFEE'),
        row('2026-09-24', 2000, 'out', 'LIDL'),
    ];
    const levels = findDuplicates(data, second).map(({ level }) => level);
    assert.deepEqual(levels, ['exact', 'exact', null, null]);
});

test('buildImport and applyImport create v2 entries and counts', () => {
    const data = freshData();
    const built = buildImport(data, septemberDecisions(), { rows: SEPTEMBER, format: 'csv', fileName: 'sep.csv', now: NOW });
    assert.equal(built.ok, true);
    assert.deepEqual(built.planChoices, []);
    assert.deepEqual(summarise(built), {
        expenses: 3,
        incomes: 1,
        refunds: 0,
        duplicates: 0,
        transfers: 0,
        skipped: 0,
        totalOutCents: 4950,
        totalInCents: 150000,
        periodFrom: '2026-09-17',
        periodTo: '2026-09-20',
    });
    assert.equal(data.expenses.length, 0);

    const result = applyImport(data, built, {});
    assert.equal(result.ok, true);
    assert.equal(result.counts.expenses, 3);
    assert.equal(data.expenses.length, 3);
    assert.equal(data.incomes.length, 1);
    assert.ok(Object.hasOwn(data.monthPlans, '2026-09'));

    const importId = result.importId;
    const expense = data.expenses[2];
    assert.deepEqual(Object.keys(expense).sort(), [
        'amountCents', 'bankRef', 'bankText', 'categoryId', 'currency', 'date', 'fingerprint', 'goalId',
        'id', 'importId', 'note', 'originalAmountCents', 'refund', 'subcategoryId',
    ]);
    assert.match(expense.id, /^exp_/);
    assert.equal(expense.categoryId, 'necessary');
    assert.equal(expense.subcategoryId, 'groceries');
    assert.equal(expense.amountCents, 4250);
    assert.equal(expense.originalAmountCents, 4250);
    assert.equal(expense.currency, 'EUR');
    assert.equal(expense.refund, false);
    assert.equal(expense.importId, importId);
    assert.equal(expense.bankRef, 'R3');
    assert.equal(expense.goalId, '');
    assert.equal(expense.note, 'RIMI MINI 1234 RIGA 17.09');
    assert.equal(expense.fingerprint, makeFingerprints(SEPTEMBER)[2]);
    assert.notEqual(data.expenses[0].fingerprint, data.expenses[1].fingerprint);

    const income = data.incomes[0];
    assert.deepEqual(Object.keys(income).sort(), [
        'amountCents', 'bankRef', 'bankText', 'currency', 'date', 'fingerprint', 'id', 'importId',
        'incomeCategoryId', 'note', 'originalAmountCents',
    ]);
    assert.match(income.id, /^inc_/);
    assert.equal(income.note, 'SIA Employer');
    assert.equal(income.incomeCategoryId, 'salary');

    const record = data.imports[0];
    assert.equal(record.id, importId);
    assert.equal(record.source.fileName, 'sep.csv');
    assert.equal(record.undoneAt, '');
    assert.equal(record.createdAt, NOW.toISOString());
    assert.deepEqual(record.expenseIds, data.expenses.map(({ id }) => id));
    assert.deepEqual(record.incomeIds, [income.id]);
});

test('buildImport does not mutate input rows or decisions', () => {
    const data = freshData();
    const rows = SEPTEMBER.map((entry) => ({ ...entry }));
    const decisions = septemberDecisions();
    const rowsCopy = structuredClone(rows);
    const decisionsCopy = structuredClone(decisions);
    const dataCopy = structuredClone(data);
    buildImport(data, decisions, { rows, format: 'csv', fileName: 'a.csv', now: NOW });
    assert.deepEqual(rows, rowsCopy);
    assert.deepEqual(decisions, decisionsCopy);
    assert.deepEqual(data, dataCopy);
});

test('refunds are stored as expenses with refund true and transfers are only counted', () => {
    const data = freshData();
    const rows = [
        row('2026-09-12', 1999, 'in', 'RIMI RETURN', { counterparty: 'SIA Rimi Latvia' }),
        row('2026-09-13', 50000, 'out', 'To own savings account'),
        row('2026-09-13', 50000, 'in', 'From own current account'),
        row('2026-09-14', 100, 'out', 'Bank fee'),
    ];
    const decisions = [
        { include: true, kind: 'refund', categoryId: 'necessary', subcategoryId: 'groceries', remember: true },
        { include: true, kind: 'transfer', remember: true, pattern: 'OWN SAVINGS' },
        { include: true, kind: 'transfer', remember: false },
        { include: true, kind: 'skip', remember: false },
    ];
    const { built, result } = importRows(data, rows, decisions);
    assert.equal(result.ok, true);
    assert.deepEqual(built.importRecord.counts, {
        expenses: 0, incomes: 0, refunds: 1, duplicates: 0, transfers: 2, skipped: 1,
    });
    assert.equal(summarise(built).totalInCents, 1999);
    assert.equal(summarise(built).totalOutCents, 0);
    assert.equal(data.expenses.length, 1);
    assert.equal(data.incomes.length, 0);
    assert.equal(data.expenses[0].refund, true);
    assert.equal(data.expenses[0].categoryId, 'necessary');
    assert.equal(data.expenses[0].note, 'SIA Rimi Latvia');

    const patterns = data.rules.map(({ pattern, kind, refund }) => [pattern, kind, refund]);
    assert.deepEqual(patterns, [['RIMI', 'expense', true], ['OWN SAVINGS', 'transfer', false]]);
    assert.equal(applyRules(data.rules, row('2026-10-01', 1, 'in', 'RIMI'))?.refund, true);
});

test('defaultDecisions uses rules, suggests refunds for shop money in, and skips exact duplicates', () => {
    const data = freshData();
    upsertRule(data, { pattern: 'LIDL', kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries' });
    const decisions = defaultDecisions(data, [
        row('2026-09-12', 500, 'out', 'LIDL RIGA'),
        row('2026-09-12', 500, 'in', 'LIDL RIGA'),
        row('2026-09-12', 500, 'out', 'UNKNOWN SHOP'),
        row('2026-09-12', 500, 'in', 'SOMEONE'),
    ]);
    assert.deepEqual(decisions.map(({ kind, categoryId }) => [kind, categoryId]), [
        ['expense', 'necessary'],
        ['refund', 'necessary'],
        ['expense', UNCATEGORISED_ID],
        ['income', UNCATEGORISED_ID],
    ]);
    assert.equal(decisions[3].incomeCategoryId, 'income-other');
    assert.ok(decisions.every(({ include }) => include === true));
});

test('excluded duplicate rows count as duplicates, other excluded rows as skipped', () => {
    const data = freshData();
    data.expenses.push({ id: 'exp_m', categoryId: 'random', subcategoryId: '', amountCents: 350, note: '', date: '2026-09-17' });
    const rows = [row('2026-09-17', 350, 'out', 'COFFEE'), row('2026-09-18', 100, 'out', 'X')];
    const built = buildImport(data, [{ include: false }, { include: false }], { rows, now: NOW });
    assert.equal(built.importRecord.counts.duplicates, 1);
    assert.equal(built.importRecord.counts.skipped, 1);
});

test('foreign currency rows need an EUR amount decision', () => {
    const data = freshData();
    const rows = [row('2026-09-15', null, 'out', 'AMAZON.COM', { currency: 'USD', originalAmountCents: 5000 })];
    assert.equal(rows[0].amountCents, null);

    const rejected = buildImport(data, [expenseDecision('random', 'shopping')], { rows, now: NOW });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.errors[0].index, 0);
    assert.match(rejected.errors[0].reason, /EUR/);

    const built = buildImport(data, [expenseDecision('random', 'shopping', { amountCents: 4620 })], { rows, now: NOW });
    assert.equal(built.ok, true);
    assert.equal(applyImport(data, built).ok, true);
    const [entry] = data.expenses;
    assert.equal(entry.amountCents, 4620);
    assert.equal(entry.currency, 'USD');
    assert.equal(entry.originalAmountCents, 5000);
});

test('applyImport is all-or-nothing when a decision is invalid', () => {
    const data = freshData();
    const before = structuredClone(data);
    const decisions = septemberDecisions();
    decisions[1] = expenseDecision('no-such-category', '');
    decisions[0].remember = true;
    const { built, result } = importRows(data, SEPTEMBER, decisions);
    assert.equal(built.ok, false);
    assert.equal(built.errors.length, 1);
    assert.equal(built.errors[0].index, 1);
    assert.equal(result.ok, false);
    assert.deepEqual(data, before);
});

test('buildImport rejects kinds that contradict the money direction', () => {
    const data = freshData();
    const rows = [
        row('2026-09-12', 500, 'in', 'LIDL'),
        row('2026-09-12', 500, 'out', 'LIDL'),
        row('2026-09-12', 500, 'out', 'LIDL'),
    ];
    const built = buildImport(data, [
        expenseDecision(),
        { include: true, kind: 'refund', categoryId: 'necessary' },
        incomeDecision(),
    ], { rows, now: NOW });
    assert.deepEqual(built.errors.map(({ index }) => index), [0, 1, 2]);
});

test('monthsNeedingPlanChoice lists only past months without a plan', () => {
    const data = freshData();
    data.monthPlans['2026-06'] = { monthlyBudgetCents: 1, entries: [] };
    const rows = [
        row('2026-06-10', 100, 'out', 'A'),
        row('2026-07-10', 100, 'out', 'B'),
        row('2026-05-10', 100, 'out', 'C'),
        row('2026-07-11', 100, 'out', 'D'),
        row('2026-09-10', 100, 'out', 'E'),
        row('2026-10-01', 100, 'out', 'F'),
    ];
    assert.deepEqual(monthsNeedingPlanChoice(data, rows, NOW), ['2026-05', '2026-07']);
});

test('plan choices freeze past months as current or actual only; current month is never asked', () => {
    const data = freshData();
    data.settings.monthlyBudgetCents = 200000;
    data.settings.usualMonthlyIncomeCents = 250000;
    const rows = [
        row('2026-07-10', 1000, 'out', 'JULY'),
        row('2026-08-10', 1000, 'out', 'AUGUST'),
        row('2026-09-10', 1000, 'out', 'SEPTEMBER'),
    ];
    const decisions = rows.map(() => expenseDecision());
    const built = buildImport(data, decisions, { rows, now: NOW });
    assert.deepEqual(built.planChoices, ['2026-07', '2026-08']);

    const missing = applyImport(data, built, { '2026-07': 'current' });
    assert.equal(missing.ok, false);
    assert.equal(data.expenses.length, 0);
    assert.deepEqual(data.monthPlans, {});

    const result = applyImport(data, built, { '2026-07': 'current', '2026-08': 'actualOnly' });
    assert.equal(result.ok, true);

    const july = data.monthPlans['2026-07'];
    assert.equal(july.monthlyBudgetCents, 200000);
    assert.equal(july.actualOnly, undefined);

    const august = data.monthPlans['2026-08'];
    assert.equal(august.actualOnly, true);
    assert.equal(august.monthlyBudgetCents, 0);
    assert.ok(august.entries.length > 0);
    assert.ok(august.entries.every(({ limitCents, percent }) => limitCents === 0 && percent === 0));

    const september = data.monthPlans['2026-09'];
    assert.equal(september.monthlyBudgetCents, 200000);
    assert.equal(september.actualOnly, undefined);
});

test('existing month plans are left untouched by an import', () => {
    const data = freshData();
    const frozen = { monthlyBudgetCents: 123, usualMonthlyIncomeCents: 0, entries: [] };
    data.monthPlans['2026-07'] = frozen;
    const rows = [row('2026-07-10', 1000, 'out', 'JULY')];
    const built = buildImport(data, [expenseDecision()], { rows, now: NOW });
    assert.deepEqual(built.planChoices, []);
    assert.equal(applyImport(data, built, { '2026-07': 'actualOnly' }).ok, true);
    assert.equal(data.monthPlans['2026-07'], frozen);
});

test('undoImport removes exactly the batch, keeps manual entries and rules', () => {
    const data = freshData();
    data.expenses.push({ id: 'exp_manual', categoryId: 'random', subcategoryId: '', amountCents: 350, note: 'Coffee', date: '2026-09-17' });
    const decisions = septemberDecisions();
    decisions[2].remember = true;
    const { result } = importRows(data, SEPTEMBER, decisions);

    const other = importRows(data, [row('2026-09-22', 700, 'out', 'LIDL')], [expenseDecision()]);
    assert.equal(other.result.ok, true);

    data.expenses.find(({ importId }) => importId === result.importId).amountCents = 999;
    data.expenses.find(({ importId }) => importId === result.importId).note = 'Edited';

    const removed = undoImport(data, result.importId, NOW);
    assert.equal(removed, 4);
    assert.deepEqual(data.expenses.map(({ id }) => id), ['exp_manual', data.imports[1].expenseIds[0]]);
    assert.equal(data.incomes.length, 0);
    assert.equal(data.rules.length, 1);
    assert.equal(data.rules[0].pattern, 'RIMI');
    assert.equal(data.imports[0].undoneAt, NOW.toISOString());
    assert.equal(data.imports[1].undoneAt, '');

    assert.equal(undoImport(data, result.importId, NOW), 0);
    assert.equal(undoImport(data, 'imp_missing', NOW), 0);
    assert.equal(data.expenses.length, 2);
});

test('applyImport works on a v1-shaped object without v2 arrays', () => {
    const data = defaultData();
    delete data.rules;
    delete data.imports;
    const decisions = septemberDecisions();
    decisions[3].remember = true;
    const { result } = importRows(data, SEPTEMBER, decisions);
    assert.equal(result.ok, true);
    assert.equal(data.imports.length, 1);
    assert.equal(data.rules.length, 1);
    assert.equal(data.rules[0].kind, 'income');
});

test('the same built import cannot be applied twice', () => {
    const data = freshData();
    const built = buildImport(data, septemberDecisions(), { rows: SEPTEMBER, now: NOW });
    assert.equal(applyImport(data, built).ok, true);
    const snapshot = structuredClone(data);
    assert.equal(applyImport(data, built).ok, false);
    assert.deepEqual(data, snapshot);
});

test('Show as text becomes the note and is remembered on the rule', async () => {
    const { applyRuleToExisting } = await import('../src/import/core.js');
    const data = defaultData();
    const rows = [statementRow({
        date: '2026-09-10',
        amountCents: 2340,
        direction: 'out',
        description: 'SIA Kārlis veikals 12',
        counterparty: 'SIA Kārlis',
    })];
    const decisions = defaultDecisions(data, rows);
    decisions[0].categoryId = 'necessary';
    decisions[0].subcategoryId = 'groceries';
    decisions[0].showAs = 'Produkti';
    decisions[0].remember = true;
    decisions[0].pattern = 'KARLIS';

    const built = buildImport(data, decisions, { rows, format: 'csv', fileName: 'a.csv' });
    const applied = applyImport(data, built, {});
    assert.equal(applied.ok, true);
    assert.equal(data.expenses[0].note, 'Produkti');
    assert.equal(data.expenses[0].bankText, 'SIA Kārlis · SIA Kārlis veikals 12');
    assert.equal(data.rules[0].note, 'Produkti');

    const next = defaultDecisions(data, [statementRow({ ...rows[0], date: '2026-09-20' })]);
    assert.equal(next[0].showAs, 'Produkti');
    assert.equal(next[0].subcategoryId, 'groceries');

    data.expenses.push({
        ...data.expenses[0],
        id: 'exp_old',
        categoryId: 'random',
        subcategoryId: '',
        note: 'SIA Kārlis',
    });
    data.expenses.push({ ...data.expenses[0], id: 'exp_manual', importId: '', note: 'Kārlis by hand', bankText: '' });
    assert.equal(applyRuleToExisting(data, data.rules[0].id), 2);
    const old = data.expenses.find(({ id }) => id === 'exp_old');
    assert.equal(old.categoryId, 'necessary');
    assert.equal(old.note, 'Produkti');
    assert.equal(data.expenses.find(({ id }) => id === 'exp_manual').note, 'Kārlis by hand');
});

test('transfers and skipped rows are recognised on the next import of the same file', () => {
    const data = defaultData();
    const rows = [
        statementRow({ date: '2026-09-02', amountCents: 50000, direction: 'out', description: 'To my savings', bankRef: 'T-1' }),
        statementRow({ date: '2026-09-03', amountCents: 120, direction: 'out', description: 'Bank fee' }),
        statementRow({ date: '2026-09-04', amountCents: 900, direction: 'out', description: 'RIMI' }),
    ];
    const decisions = defaultDecisions(data, rows);
    decisions[0].kind = 'transfer';
    decisions[1].kind = 'skip';
    const built = buildImport(data, decisions, { rows, format: 'csv', fileName: 'a.csv' });
    assert.equal(applyImport(data, built, {}).ok, true);

    const again = findDuplicates(data, rows);
    assert.deepEqual(again.map(({ level }) => level), ['exact', 'exact', 'exact']);
    assert.equal(again[0].matchType, 'ignored');
    assert.equal(again[0].ignoredKind, 'transfer');
    assert.equal(again[1].ignoredKind, 'skip');
    assert.equal(defaultDecisions(data, rows, again).every(({ include }) => include === false), true);

    undoImport(data, data.imports[0].id);
    assert.deepEqual(findDuplicates(data, rows).map(({ level }) => level), [null, null, null]);
});

test('a reused bank reference is not a duplicate when the amount or date differs', () => {
    const data = defaultData();
    data.expenses = [{
        id: 'rent_aug', categoryId: 'necessary', subcategoryId: '', amountCents: 50000, note: 'Rent',
        date: '2026-08-01', bankRef: 'RENT', importId: 'imp_a', fingerprint: 'fp-aug',
    }];
    const september = statementRow({ date: '2026-09-01', amountCents: 50000, direction: 'out', description: 'Rent', bankRef: 'RENT' });
    const sameAgain = statementRow({ date: '2026-08-02', amountCents: 50000, direction: 'out', description: 'Rent', bankRef: 'RENT' });
    const [first] = findDuplicates(data, [september]);
    assert.notEqual(first.level, 'exact');
    assert.equal(findDuplicates(data, [sameAgain])[0].level, 'exact');
});

test('probable duplicates of manual entries start excluded, weak ones included', () => {
    const data = defaultData();
    data.expenses = [
        { id: 'm1', categoryId: 'random', subcategoryId: '', amountCents: 320, note: 'Coffee', date: '2026-09-10' },
        { id: 'm2', categoryId: 'random', subcategoryId: '', amountCents: 999, note: 'Book', date: '2026-09-10' },
    ];
    const rows = [
        statementRow({ date: '2026-09-10', amountCents: 320, direction: 'out', description: 'KAFIJA' }),
        statementRow({ date: '2026-09-12', amountCents: 999, direction: 'out', description: 'BOOKS' }),
    ];
    const duplicates = findDuplicates(data, rows);
    assert.deepEqual(duplicates.map(({ level }) => level), ['probable', 'weak']);
    assert.deepEqual(defaultDecisions(data, rows, duplicates).map(({ include }) => include), [false, true]);
});

test('undo removes month plans the import created when the month is empty again', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    const rows = [statementRow({ date: '2025-03-05', amountCents: 1000, direction: 'out', description: 'OLD SHOP' })];
    const decisions = defaultDecisions(data, rows);
    const built = buildImport(data, decisions, { rows, format: 'csv', fileName: 'old.csv' });
    const applied = applyImport(data, built, { '2025-03': 'actualOnly' });
    assert.equal(applied.ok, true);
    assert.equal(data.monthPlans['2025-03'].actualOnly, true);

    undoImport(data, applied.importId);
    assert.equal(Object.hasOwn(data.monthPlans, '2025-03'), false);
});

test('applyRuleToExisting does nothing when the rule points to a deleted category', async () => {
    const { applyRuleToExisting } = await import('../src/import/core.js');
    const data = defaultData();
    data.rules = [{ id: 'r1', pattern: 'SHOP', kind: 'expense', categoryId: 'gone', subcategoryId: '', incomeCategoryId: '', refund: false, note: '' }];
    data.expenses = [{ id: 'e1', categoryId: 'random', subcategoryId: '', amountCents: 100, note: 'SHOP', bankText: 'SHOP', importId: 'imp', date: '2026-09-01' }];
    assert.equal(applyRuleToExisting(data, 'r1'), 0);
    assert.equal(data.expenses[0].categoryId, 'random');
});

test('undoImportAndSave puts everything back when saving fails', async () => {
    const { undoImportAndSave } = await import('../src/import/core.js');
    const data = defaultData();
    const rows = [statementRow({ date: '2026-09-05', amountCents: 700, direction: 'out', description: 'SHOP' })];
    const built = buildImport(data, defaultDecisions(data, rows), { rows, format: 'csv', fileName: 'a.csv' });
    const applied = applyImport(data, built, {});
    const snapshot = JSON.stringify(data);

    assert.deepEqual(undoImportAndSave(data, applied.importId, () => false), { ok: false, removed: 0 });
    assert.equal(JSON.stringify(data), snapshot);

    assert.deepEqual(undoImportAndSave(data, applied.importId, () => true), { ok: true, removed: 1 });
    assert.equal(data.expenses.length, 0);
});
