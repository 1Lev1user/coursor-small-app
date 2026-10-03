import test from 'node:test';
import assert from 'node:assert/strict';
import { removeEntry, restoreEntry } from '../src/model.js';

function sample() {
    return {
        expenses: [
            { id: 'e1', amount: 100, note: 'a' },
            { id: 'e2', amount: 200, note: 'b' },
            { id: 'e3', amount: 300, note: 'c' },
        ],
        incomes: [
            { id: 'i1', amount: 1000 },
            { id: 'i2', amount: 2000 },
            { id: 'i3', amount: 3000 },
        ],
    };
}

test('expense remove and restore round trip keeps order', () => {
    const data = sample();
    const snapshot = structuredClone(data);

    const removed = removeEntry(data, 'expense', 'e2');
    assert.equal(removed.index, 1);
    assert.equal(removed.entry.id, 'e2');
    assert.deepEqual(data.expenses.map(({ id }) => id), ['e1', 'e3']);

    assert.equal(restoreEntry(data, 'expense', removed.entry, removed.index), true);
    assert.deepEqual(data, snapshot);
});

test('income round trip at first, middle and last position', () => {
    for (const id of ['i1', 'i2', 'i3']) {
        const data = sample();
        const snapshot = structuredClone(data);
        const removed = removeEntry(data, 'income', id);
        assert.equal(data.incomes.length, 2);
        assert.equal(restoreEntry(data, 'income', removed.entry, removed.index), true);
        assert.deepEqual(data, snapshot);
    }
});

test('restoring twice does not duplicate the entry', () => {
    const data = sample();
    const removed = removeEntry(data, 'expense', 'e1');
    assert.equal(restoreEntry(data, 'expense', removed.entry, removed.index), true);
    assert.equal(restoreEntry(data, 'expense', removed.entry, removed.index), false);
    assert.equal(data.expenses.filter(({ id }) => id === 'e1').length, 1);
    assert.equal(data.expenses.length, 3);
});

test('unknown id or type returns null and leaves data unchanged', () => {
    const data = sample();
    const snapshot = structuredClone(data);
    assert.equal(removeEntry(data, 'expense', 'nope'), null);
    assert.equal(removeEntry(data, 'income', 'e1'), null);
    assert.equal(removeEntry(data, 'other', 'e1'), null);
    assert.deepEqual(data, snapshot);
    assert.equal(restoreEntry(data, 'other', { id: 'x' }, 0), false);
    assert.deepEqual(data, snapshot);
});

test('restore clamps an out-of-range index', () => {
    const data = sample();
    const { entry } = removeEntry(data, 'expense', 'e2');
    restoreEntry(data, 'expense', entry, 99);
    assert.deepEqual(data.expenses.map(({ id }) => id), ['e1', 'e3', 'e2']);

    const second = removeEntry(data, 'expense', 'e2');
    restoreEntry(data, 'expense', second.entry, 0);
    assert.deepEqual(data.expenses.map(({ id }) => id), ['e2', 'e1', 'e3']);
});

test('lists are independent and the returned entry is the same object', () => {
    const data = sample();
    const original = data.expenses[0];
    const removed = removeEntry(data, 'expense', 'e1');
    assert.equal(removed.entry, original);
    assert.equal(data.incomes.length, 3);
    assert.equal(data.expenses.length, 2);
});
