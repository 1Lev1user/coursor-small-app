import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { buildImport, applyImport, undoImport } from '../src/import/core.js';
import { dueSubscriptions } from '../src/subscriptions.js';
import { suggestSubscription } from '../src/views/import.js';

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const SPOTIFY = { id: 'sub_spotify', name: 'Spotify', amountCents: 1199, dayOfMonth: 5 };

function freshData(subscriptions = [SPOTIFY]) {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    data.subscriptions = subscriptions;
    return data;
}

function row(extra = {}) {
    return statementRow({ date: '2026-10-04', amountCents: 5000, direction: 'out', description: 'SPOTIFY AB', ...extra });
}

function decision(extra = {}) {
    return { include: true, kind: 'expense', categoryId: 'random', subcategoryId: '', incomeCategoryId: '', remember: false, ...extra };
}

function build(data, rows, decisions) {
    return buildImport(data, decisions, { rows, format: 'csv', fileName: 's.csv', now: NOW });
}

test('suggests the subscription whose name is in the row, whatever the amount', () => {
    assert.equal(suggestSubscription(freshData(), row(), decision()), SPOTIFY);
    const named = row({ description: 'CARD PAYMENT', counterparty: 'Spotify AB' });
    assert.equal(suggestSubscription(freshData(), named, decision()), SPOTIFY);
});

test('suggests nothing once the subscription is logged that month, but not for another month', () => {
    const data = freshData();
    data.expenses.push({ id: 'e1', date: '2026-10-02', amountCents: 1199, subscriptionId: 'sub_spotify' });
    assert.equal(suggestSubscription(data, row(), decision()), null);
    assert.equal(suggestSubscription(data, row({ date: '2026-09-04' }), decision()), SPOTIFY);
});

test('suggests nothing for refunds, money in, other kinds, bad dates or partial names', () => {
    const data = freshData();
    const inRow = row({ direction: 'in' });
    assert.equal(suggestSubscription(data, inRow, decision({ kind: 'refund' })), null);
    assert.equal(suggestSubscription(data, inRow, decision()), null);
    for (const kind of ['income', 'transfer', 'skip']) {
        assert.equal(suggestSubscription(data, row(), decision({ kind })), null);
    }
    assert.equal(suggestSubscription(data, row({ date: 'soon' }), decision()), null);
    const gym = freshData([{ id: 'sub_gym', name: 'Gym', amountCents: 2000, dayOfMonth: 1 }]);
    assert.equal(suggestSubscription(gym, row({ description: 'Gymnastics club' }), decision()), null);
});

test('suggests nothing after No or Yes were already answered', () => {
    const data = freshData();
    assert.equal(suggestSubscription(data, row(), decision({ subscriptionDeclined: true })), null);
    assert.equal(suggestSubscription(data, row(), decision({ subscriptionId: 'sub_spotify' })), null);
});

test('takenKeys blocks only the same subscription in the same month', () => {
    const data = freshData();
    assert.equal(suggestSubscription(data, row(), decision(), new Set(['sub_spotify:2026-10'])), null);
    assert.equal(suggestSubscription(data, row(), decision(), new Set(['sub_spotify:2026-09'])), SPOTIFY);
    assert.equal(suggestSubscription(data, row(), decision(), new Set(['sub_other:2026-10'])), SPOTIFY);
});

test('with two matches it suggests the first one not logged that month', () => {
    const data = freshData([SPOTIFY, { id: 'sub_spotify2', name: 'Spotify', amountCents: 500, dayOfMonth: 5 }]);
    data.expenses.push({ id: 'e1', date: '2026-10-02', amountCents: 1199, subscriptionId: 'sub_spotify' });
    assert.equal(suggestSubscription(data, row(), decision()).id, 'sub_spotify2');
});

test('a row marked as the subscription stops the reminder, and undo brings it back', () => {
    const data = freshData();
    assert.deepEqual(dueSubscriptions(data, NOW).map(({ id }) => id), ['sub_spotify']);
    const built = build(data, [row()], [decision({ subscriptionId: 'sub_spotify' })]);
    assert.equal(built.expenses[0].subscriptionId, 'sub_spotify');
    const result = applyImport(data, built, {});
    assert.deepEqual(dueSubscriptions(data, NOW), []);
    undoImport(data, result.importId, NOW);
    assert.deepEqual(dueSubscriptions(data, NOW).map(({ id }) => id), ['sub_spotify']);
});

test('an unknown, empty or unusable id adds no field to the expense', () => {
    for (const subscriptionId of ['sub_missing', '']) {
        const built = build(freshData(), [row()], [decision({ subscriptionId, subscriptionDeclined: true })]);
        assert.equal('subscriptionId' in built.expenses[0], false);
        assert.equal('subscriptionDeclined' in built.expenses[0], false);
    }
    const data = freshData();
    data.subscriptions = undefined;
    const built = build(data, [row()], [decision({ subscriptionId: 'sub_spotify' })]);
    assert.equal('subscriptionId' in built.expenses[0], false);
});

test('only an expense carries the id: refunds, incomes and skipped rows do not', () => {
    const data = freshData();
    const inRow = row({ direction: 'in' });
    const refund = build(data, [inRow], [decision({ kind: 'refund', subscriptionId: 'sub_spotify' })]);
    assert.equal('subscriptionId' in refund.expenses[0], false);
    const income = build(data, [inRow], [decision({ kind: 'income', incomeCategoryId: 'salary', subscriptionId: 'sub_spotify' })]);
    assert.equal('subscriptionId' in income.incomes[0], false);
    const skipped = build(data, [row()], [decision({ kind: 'skip', subscriptionId: 'sub_spotify' })]);
    assert.equal(skipped.expenses.length, 0);
});
