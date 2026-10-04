import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUICK_ADD_REPEAT_MS, isRepeatTap, templateToExpense } from '../src/templates.js';
import { createId, defaultData, removeEntry, restoreEntry } from '../src/model.js';

test('the repeat window is 1.5 seconds', () => {
    assert.equal(QUICK_ADD_REPEAT_MS, 1500);
});

test('isRepeatTap is false when there was no earlier tap', () => {
    assert.equal(isRepeatTap(null, 'a', 1000), false);
});

test('isRepeatTap is true for the same template inside the window', () => {
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 1500), true);
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 1000), true);
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 1000 + QUICK_ADD_REPEAT_MS - 1), true);
});

test('isRepeatTap is false exactly at the window and after it', () => {
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 1000 + QUICK_ADD_REPEAT_MS), false);
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 5000), false);
});

test('isRepeatTap is false for a different template', () => {
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'b', 1100), false);
});

test('isRepeatTap is false when the clock went backwards', () => {
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 999), false);
});

test('isRepeatTap respects a custom window', () => {
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 1200, 100), false);
    assert.equal(isRepeatTap({ id: 'a', at: 1000 }, 'a', 1050, 100), true);
});

test('a quick-add expense removed by Undo goes back to the same place', () => {
    const data = defaultData();
    const template = { categoryId: '', amountCents: 250, note: 'Coffee' };
    const first = { id: createId('exp'), ...templateToExpense(template, '2026-01-10') };
    const second = { id: createId('exp'), ...templateToExpense(template, '2026-01-10') };
    data.expenses.push(first, second);
    const snapshot = structuredClone(data.expenses);

    const removed = removeEntry(data, 'expense', first.id);
    assert.equal(removed.entry, first);
    assert.equal(removed.index, 0);
    assert.deepEqual(data.expenses, [second]);

    assert.equal(restoreEntry(data, 'expense', removed.entry, removed.index), true);
    assert.deepEqual(data.expenses, snapshot);
});

test('the Home quick-add handler uses the guard and offers Undo', () => {
    const source = readFileSync(new URL('../src/views/add.js', import.meta.url), 'utf8');
    assert.ok(source.includes('isRepeatTap('));
    assert.ok(source.includes("label: 'Undo'"));
});
