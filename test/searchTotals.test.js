import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { formatEuro } from '../src/money.js';
import { searchEntries, searchTotals } from '../src/search.js';
import { searchSummaryText } from '../src/views/searchPanel.js';

function expense(id, amountCents, extra = {}) {
    return {
        id, categoryId: 'necessary', subcategoryId: '', amountCents, note: 'rimi', date: '2026-09-01', ...extra,
    };
}

function income(id, amountCents, extra = {}) {
    return {
        id, incomeCategoryId: 'salary', amountCents, note: 'rimi', date: '2026-09-01', ...extra,
    };
}

function dataWith(expenses, incomes = []) {
    const data = defaultData();
    data.expenses = expenses;
    data.incomes = incomes;
    return data;
}

test('searchTotals sums expenses and counts a refund as negative', () => {
    const data = dataWith([expense('e1', 1000), expense('e2', 250), expense('e3', 300, { refund: true })]);
    const totals = searchTotals(searchEntries(data, { text: 'rimi' }));
    assert.deepEqual(totals, { expenseCount: 3, incomeCount: 0, expenseCents: 950, incomeCents: 0 });
});

test('searchTotals sums incomes', () => {
    const data = dataWith([], [income('i1', 500)]);
    const totals = searchTotals(searchEntries(data, { text: 'rimi' }));
    assert.deepEqual(totals, { expenseCount: 0, incomeCount: 1, expenseCents: 0, incomeCents: 500 });
});

test('searchTotals of no results is all zeros', () => {
    assert.deepEqual(searchTotals([]), { expenseCount: 0, incomeCount: 0, expenseCents: 0, incomeCents: 0 });
});

test('searchTotals covers every result, not only the first 100', () => {
    const expenses = Array.from({ length: 150 }, (_, index) => expense(`e${index}`, 100));
    const results = searchEntries(dataWith(expenses), { text: 'rimi' });
    assert.equal(results.length, 150);
    const totals = searchTotals(results);
    assert.equal(totals.expenseCents, 15000);
    assert.equal(totals.expenseCount, 150);
});

test('searchSummaryText shows only the count for no results', () => {
    assert.equal(searchSummaryText([]), '0 results');
});

test('searchSummaryText adds the spent total when only expenses match', () => {
    const results = searchEntries(dataWith([expense('e1', 1000), expense('e2', 250)]), { text: 'rimi' });
    assert.equal(searchSummaryText(results), `2 results · Spent ${formatEuro(1250)}`);
});

test('searchSummaryText adds the income total when only incomes match', () => {
    const results = searchEntries(dataWith([], [income('i1', 500)]), { text: 'rimi' });
    assert.equal(searchSummaryText(results), `1 result · Income ${formatEuro(500)}`);
});

test('searchSummaryText adds both totals when expenses and incomes match', () => {
    const results = searchEntries(dataWith([expense('e1', 1000)], [income('i1', 500)]), { text: 'rimi' });
    assert.equal(searchSummaryText(results), `2 results · Spent ${formatEuro(1000)} · Income ${formatEuro(500)}`);
});
