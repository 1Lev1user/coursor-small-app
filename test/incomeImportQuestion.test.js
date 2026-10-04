import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { buildImport, applyImport, undoImport } from '../src/import/core.js';
import { dueIncomes, incomeStatus, suggestIncomeSource } from '../src/incomeSources.js';

const NOW = new Date(2026, 9, 26, 12, 0, 0);
const OLD_KEYS = [
    'amountCents', 'bankRef', 'bankText', 'currency', 'date', 'fingerprint', 'id', 'importId',
    'incomeCategoryId', 'note', 'originalAmountCents',
];

function source(overrides = {}) {
    return {
        id: 'incsrc_a',
        name: 'Salary',
        incomeCategoryId: 'salary',
        expectedCents: 150000,
        dayOfMonth: 25,
        startDate: '2026-10-01',
        skippedMonths: [],
        ...overrides,
    };
}

function freshData({ start = '2026-10-01', sources = [source()] } = {}) {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    data.settings.balanceStart = start === null ? null : { date: start, cents: 100000 };
    data.incomeSources = sources;
    return data;
}

function row(extra = {}) {
    return statementRow({ date: '2026-10-24', amountCents: 150000, direction: 'in', description: 'SIA Employer', ...extra });
}

function decision(extra = {}) {
    return { include: true, kind: 'income', categoryId: '', subcategoryId: '', incomeCategoryId: 'salary', remember: false, ...extra };
}

function build(data, rows, decisions) {
    return buildImport(data, decisions, { rows, format: 'csv', fileName: 's.csv', now: NOW });
}

test('an income row marked as a source carries its id', () => {
    const built = build(freshData(), [row()], [decision({ sourceId: 'incsrc_a' })]);
    assert.equal(built.incomes[0].sourceId, 'incsrc_a');
});

test('a row tied to the source closes the payday reminder, and undo brings it back', () => {
    const data = freshData();
    assert.deepEqual(dueIncomes(data, NOW).map(({ source }) => source.id), ['incsrc_a']);
    const built = build(data, [row()], [decision({ sourceId: 'incsrc_a' })]);
    const result = applyImport(data, built, {});
    assert.equal(incomeStatus(data, '2026-10', NOW)[0].state, 'received');
    assert.deepEqual(dueIncomes(data, NOW), []);
    undoImport(data, result.importId, NOW);
    assert.deepEqual(dueIncomes(data, NOW).map(({ source }) => source.id), ['incsrc_a']);
});

test('without a source id the income keeps exactly the old keys', () => {
    const built = build(freshData(), [row()], [decision()]);
    assert.deepEqual(Object.keys(built.incomes[0]).sort(), OLD_KEYS);
});

test('an unknown, empty or unusable id adds no field to the income', () => {
    for (const sourceId of ['incsrc_missing', '']) {
        const built = build(freshData(), [row()], [decision({ sourceId, sourceDeclined: true })]);
        assert.deepEqual(Object.keys(built.incomes[0]).sort(), OLD_KEYS);
    }
    const data = freshData();
    data.incomeSources = undefined;
    const built = build(data, [row()], [decision({ sourceId: 'incsrc_a' })]);
    assert.deepEqual(Object.keys(built.incomes[0]).sort(), OLD_KEYS);
});

test('only an income carries the id: expenses, refunds and skipped rows do not', () => {
    const data = freshData();
    const expense = build(data, [row({ direction: 'out' })], [decision({ kind: 'expense', categoryId: 'random', sourceId: 'incsrc_a' })]);
    assert.equal('sourceId' in expense.expenses[0], false);
    const refund = build(data, [row()], [decision({ kind: 'refund', categoryId: 'random', sourceId: 'incsrc_a' })]);
    assert.equal('sourceId' in refund.expenses[0], false);
    const skipped = build(data, [row()], [decision({ kind: 'skip', sourceId: 'incsrc_a' })]);
    assert.equal(skipped.incomes.length + skipped.expenses.length, 0);
});

test('suggests the source within five days of its payday, not beyond', () => {
    const data = freshData();
    assert.equal(suggestIncomeSource(data, row(), new Set(), NOW).id, 'incsrc_a');
    assert.equal(suggestIncomeSource(data, row({ date: '2026-10-30' }), new Set(), NOW).id, 'incsrc_a');
    assert.equal(suggestIncomeSource(data, row({ date: '2026-10-31' }), new Set(), NOW), null);
    assert.equal(suggestIncomeSource(data, row({ direction: 'out' }), new Set(), NOW), null);
});

test('takenKeys blocks only the same source in the same month', () => {
    const data = freshData();
    assert.equal(suggestIncomeSource(data, row(), new Set(['incsrc_a:2026-10']), NOW), null);
    assert.equal(suggestIncomeSource(data, row(), new Set(['incsrc_a:2026-09']), NOW).id, 'incsrc_a');
});

test('suggests nothing without the new counting, or once the income is received', () => {
    assert.equal(suggestIncomeSource(freshData({ start: null }), row(), new Set(), NOW), null);
    assert.equal(suggestIncomeSource(freshData({ sources: [source({ startDate: '2026-10-26' })] }), row(), new Set(), NOW), null);
    const data = freshData();
    applyImport(data, build(data, [row()], [decision({ sourceId: 'incsrc_a' })]), {});
    assert.equal(suggestIncomeSource(data, row(), new Set(), NOW), null);
});

test('with two sources it picks the nearer payday', () => {
    const data = freshData({ sources: [source(), source({ id: 'incsrc_b', name: 'Side job', dayOfMonth: 22 })] });
    assert.equal(suggestIncomeSource(data, row({ date: '2026-10-23' }), new Set(), NOW).id, 'incsrc_b');
    assert.equal(suggestIncomeSource(data, row({ date: '2026-10-24' }), new Set(), NOW).id, 'incsrc_a');
});
