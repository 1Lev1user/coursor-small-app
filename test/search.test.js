import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { searchEntries } from '../src/search.js';

function expense(id, categoryId, amountCents, date, extra = {}) {
    return { id, categoryId, subcategoryId: '', amountCents, note: '', date, ...extra };
}

function income(id, incomeCategoryId, amountCents, date, extra = {}) {
    return { id, incomeCategoryId, amountCents, note: '', date, ...extra };
}

function fixture() {
    const data = defaultData();
    data.expenses = [
        expense('e1', 'necessary', 1200, '2026-09-01', { note: 'Rimi groceries', subcategoryId: 'groceries' }),
        expense('e2', 'random', 500, '2026-09-05', { note: 'Café latte', subcategoryId: 'eating-out' }),
        expense('e3', 'random', 3000, '2026-08-15', { note: 'New shoes', subcategoryId: 'shopping' }),
        expense('e4', 'necessary', 8000, '2026-09-10', { note: '', subcategoryId: 'rent' }),
    ];
    data.incomes = [
        income('i1', 'salary', 250000, '2026-09-01', { note: 'September pay' }),
        income('i2', 'income-other', 5000, '2026-09-05', { note: 'Refund from cafe' }),
    ];
    return data;
}

test('searchEntries matches note text case- and diacritics-insensitively', () => {
    const data = fixture();
    const results = searchEntries(data, { text: 'cafe' });
    assert.deepEqual(results.map(({ entry }) => entry.id), ['e2', 'i2']);

    const results2 = searchEntries(data, { text: 'CAFÉ' });
    assert.deepEqual(results2.map(({ entry }) => entry.id), ['e2', 'i2']);
});

test('searchEntries matches expense category and subcategory names', () => {
    const data = fixture();
    const byCategory = searchEntries(data, { text: 'necessary' });
    assert.deepEqual(byCategory.map(({ entry }) => entry.id).sort(), ['e1', 'e4']);

    const bySubcategory = searchEntries(data, { text: 'rent' });
    assert.deepEqual(bySubcategory.map(({ entry }) => entry.id), ['e4']);
});

test('searchEntries matches income category names', () => {
    const data = fixture();
    const results = searchEntries(data, { text: 'salary' });
    assert.deepEqual(results.map(({ entry }) => entry.id), ['i1']);
});

test('searchEntries combines filters with AND', () => {
    const data = fixture();
    const results = searchEntries(data, {
        type: 'expense',
        categoryId: 'random',
        minCents: 1000,
    });
    assert.deepEqual(results.map(({ entry }) => entry.id), ['e3']);
});

test('searchEntries filters by amount range and date range', () => {
    const data = fixture();
    assert.deepEqual(
        searchEntries(data, { minCents: 1000, maxCents: 5000 }).map(({ entry }) => entry.id).sort(),
        ['e1', 'e3', 'i2'],
    );
    assert.deepEqual(
        searchEntries(data, { from: '2026-09-01', to: '2026-09-05' }).map(({ entry }) => entry.id).sort(),
        ['e1', 'e2', 'i1', 'i2'],
    );
});

test('searchEntries filters by type', () => {
    const data = fixture();
    assert.equal(searchEntries(data, { type: 'income' }).every(({ type }) => type === 'income'), true);
    assert.equal(searchEntries(data, { type: 'expense' }).every(({ type }) => type === 'expense'), true);
    assert.equal(searchEntries(data, { type: 'all' }).length, 6);
    assert.equal(searchEntries(data, {}).length, 6);
});

test('searchEntries sorts newest first, ties broken by insertion order desc', () => {
    const data = defaultData();
    data.expenses = [
        expense('e1', 'random', 100, '2026-09-05'),
        expense('e2', 'random', 200, '2026-09-05'),
        expense('e3', 'random', 300, '2026-09-01'),
    ];
    data.incomes = [];

    assert.deepEqual(
        searchEntries(data, {}).map(({ entry }) => entry.id),
        ['e2', 'e1', 'e3'],
    );
});

test('searchEntries covers the whole history, not just one month', () => {
    const data = fixture();
    assert.deepEqual(
        searchEntries(data, { text: 'shoes' }).map(({ entry }) => entry.id),
        ['e3'],
    );
});

test('searchEntries also finds the original bank text of imported entries', () => {
    const data = defaultData();
    data.expenses = [{
        id: 'e1',
        categoryId: 'necessary',
        subcategoryId: 'groceries',
        amountCents: 2340,
        note: 'Produkti',
        bankText: 'SIA Kārlis',
        date: '2026-09-10',
    }];
    assert.deepEqual(searchEntries(data, { text: 'karlis' }).map(({ entry }) => entry.id), ['e1']);
});
