import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, UNCATEGORISED_ID } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { defaultDecisions, upsertRule } from '../src/import/core.js';

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

function row(direction, date, amountCents, extra = {}) {
    return statementRow({
        date,
        amountCents,
        direction,
        description: `${direction} ${amountCents} ${date}`,
        bankRef: `${direction}-${date}-${amountCents}`,
        ...extra,
    });
}

function kinds(rows, data = freshData()) {
    return defaultDecisions(data, rows, rows.map(() => null)).map(({ kind }) => kind);
}

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

test('same amount out and in on the same day or the next day are both Transfer', () => {
    assert.deepEqual(kinds([row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10000)]), ['transfer', 'transfer']);
    assert.deepEqual(kinds([row('out', '2026-10-05', 10000), row('in', '2026-10-06', 10000)]), ['transfer', 'transfer']);
    assert.deepEqual(kinds([row('in', '2026-10-04', 10000), row('out', '2026-10-05', 10000)]), ['transfer', 'transfer']);
});

test('two days apart is not paired', () => {
    assert.deepEqual(kinds([row('out', '2026-10-05', 10000), row('in', '2026-10-07', 10000)]), ['expense', 'income']);
});

test('different amounts are not paired', () => {
    assert.deepEqual(kinds([row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10001)]), ['expense', 'income']);
});

test('two outs and one in make only one pair, the first out wins a tie', () => {
    const rows = [row('out', '2026-10-05', 10000), row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10000)];
    assert.deepEqual(kinds(rows), ['transfer', 'expense', 'transfer']);
});

test('the nearest date wins over an earlier row', () => {
    const rows = [row('out', '2026-10-04', 10000), row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10000)];
    assert.deepEqual(kinds(rows), ['expense', 'transfer', 'transfer']);
});

test('a saved rule on one leg wins and the other leg is not paired', () => {
    const data = freshData();
    upsertRule(data, { pattern: 'OUT 10000', kind: 'expense', categoryId: 'random' });
    const rows = [row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10000)];
    const decisions = defaultDecisions(data, rows, [null, null]);
    assert.equal(decisions[0].kind, 'expense');
    assert.equal(decisions[0].ruleId, data.rules[0].id);
    assert.equal(decisions[1].kind, 'income');
});

test('amounts under 10.00 EUR are never paired, with different or the same text', () => {
    assert.deepEqual(kinds([row('out', '2026-10-05', 450), row('in', '2026-10-05', 450)]), ['expense', 'income']);
    const coffee = { description: 'COFFEE HOUSE', bankRef: '' };
    assert.deepEqual(kinds([row('out', '2026-10-05', 450, coffee), row('in', '2026-10-05', 450, coffee)]), ['expense', 'income']);
    assert.deepEqual(kinds([row('out', '2026-10-05', 999), row('in', '2026-10-05', 999)]), ['expense', 'income']);
    assert.deepEqual(kinds([row('out', '2026-10-05', 1000), row('in', '2026-10-05', 1000)]), ['transfer', 'transfer']);
});

test('rows without a pair keep exactly the decisions they have today', () => {
    const rows = [row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10001)];
    assert.deepEqual(defaultDecisions(freshData(), rows, [null, null]), [PLAIN, { ...PLAIN, kind: 'income' }]);
});

test('a paired row differs from its unpaired decision only in kind', () => {
    const rows = [row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10000)];
    assert.deepEqual(
        defaultDecisions(freshData(), rows, [null, null]),
        [{ ...PLAIN, kind: 'transfer' }, { ...PLAIN, kind: 'transfer' }],
    );
});

test('different currencies and rows without an EUR amount are not paired', () => {
    assert.deepEqual(
        kinds([row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10000, { currency: 'USD' })]),
        ['expense', 'income'],
    );
    const exchange = (direction) => ({ ...row(direction, '2026-10-05', 10000, { currency: 'USD' }), amountCents: null });
    assert.deepEqual(kinds([exchange('out'), exchange('in')]), ['expense', 'income']);
});

test('rows with a bank kind hint are kept and do not take a partner', () => {
    assert.deepEqual(
        kinds([row('out', '2026-10-05', 10000, { kindHint: 'transfer' }), row('in', '2026-10-05', 10000)]),
        ['transfer', 'income'],
    );
    assert.deepEqual(
        kinds([row('in', '2026-10-05', 10000, { kindHint: 'refund' }), row('out', '2026-10-05', 10000)]),
        ['refund', 'expense'],
    );
});

test('card payments with an MCC are never paired', () => {
    assert.deepEqual(
        kinds([row('out', '2026-10-05', 2499, { mcc: '5411' }), row('in', '2026-10-05', 2499)]),
        ['expense', 'income'],
    );
    assert.deepEqual(
        kinds([row('out', '2026-10-05', 12499, { mcc: '5411' }), row('in', '2026-10-05', 12499)]),
        ['expense', 'income'],
    );
});

test('a duplicate leg stays unticked and is not paired', () => {
    const rows = [row('out', '2026-10-05', 10000), row('in', '2026-10-05', 10000)];
    const decisions = defaultDecisions(freshData(), rows, [{ level: 'exact' }, null]);
    assert.equal(decisions[0].include, false);
    assert.equal(decisions[0].kind, 'expense');
    assert.equal(decisions[1].kind, 'income');
});

test('rows from separate account blocks of one import are paired', () => {
    const rows = [
        row('out', '2026-10-05', 50000, { counterparty: 'Own savings' }),
        row('in', '2026-10-05', 50000, { counterparty: 'Own current account' }),
        row('out', '2026-10-06', 1234),
    ];
    assert.deepEqual(kinds(rows), ['transfer', 'transfer', 'expense']);
});

test('an unparsable date is never paired', () => {
    assert.deepEqual(kinds([row('out', 'nope', 10000), row('in', 'nope', 10000)]), ['expense', 'income']);
});
