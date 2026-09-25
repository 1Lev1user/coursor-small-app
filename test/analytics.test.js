import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { monthTotals, freezeMonthPlan } from '../src/budget.js';
import { monthSeries, categoryChanges, yearTotals, buildYearCsv } from '../src/analytics.js';

function expense(id, categoryId, amountCents, date, extra = {}) {
    return { id, categoryId, subcategoryId: '', amountCents, note: '', date, refund: false, ...extra };
}

function income(id, amountCents, date) {
    return { id, incomeCategoryId: 'income-other', amountCents, note: '', date };
}

test('monthSeries matches monthTotals() for every month, to the cent', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 50000;
    data.expenses = [
        expense('e1', 'necessary', 1000, '2026-07-01'),
        expense('e2', 'random', 2000, '2026-08-01'),
        expense('e3', 'random', 3000, '2026-09-01'),
    ];
    data.incomes = [income('i1', 5000, '2026-09-01')];

    const series = monthSeries(data, '2026-09', 3);

    assert.deepEqual(series.map(({ monthKey }) => monthKey), ['2026-07', '2026-08', '2026-09']);
    for (const point of series) {
        const totals = monthTotals(data, point.monthKey);
        assert.equal(point.spentCents, totals.spentCents);
        assert.equal(point.incomeCents, totals.incomeCents);
        assert.equal(point.budgetCents, totals.budgetCents);
    }
});

test('monthSeries defaults to 12 months ending at endMonthKey', () => {
    const data = defaultData();
    const series = monthSeries(data, '2026-09');
    assert.equal(series.length, 12);
    assert.equal(series[0].monthKey, '2025-10');
    assert.equal(series[11].monthKey, '2026-09');
});

test('a refund expense makes monthSeries and monthTotals agree exactly, whatever the sign convention', () => {
    const data = defaultData();
    data.expenses = [
        expense('e1', 'necessary', 1200, '2026-09-01'),
        expense('e2', 'necessary', 500, '2026-09-02', { refund: true }),
    ];

    const totals = monthTotals(data, '2026-09');
    const [point] = monthSeries(data, '2026-09', 1);

    assert.equal(point.spentCents, totals.spentCents);
});

test('once refunds subtract in budget.js, a refund reduces month and category spending', () => {
    const data = defaultData();
    data.expenses = [
        expense('e1', 'necessary', 1200, '2026-09-01'),
        expense('e2', 'necessary', 500, '2026-09-02', { refund: true }),
    ];

    const totals = monthTotals(data, '2026-09');
    const necessary = totals.categories.find(({ id }) => id === 'necessary');

    assert.equal(totals.spentCents, 700);
    assert.equal(necessary.spentCents, 700);
});

test('yearTotals sums 12 months exactly and buckets spending by category', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 10000;
    data.settings.usualMonthlyIncomeCents = 2000;
    data.expenses = [
        expense('e1', 'necessary', 1000, '2026-01-15'),
        expense('e2', 'necessary', 2000, '2026-06-15'),
        expense('e3', 'random', 500, '2026-12-31'),
        expense('outside', 'random', 999, '2025-12-31'),
    ];
    data.incomes = [income('i1', 300, '2026-03-01')];

    const totals = yearTotals(data, 2026, new Date(2027, 0, 15));

    assert.equal(totals.months.length, 12);
    const expectedSpent = totals.months.reduce((sum, month) => sum + month.spentCents, 0);
    const expectedIncome = totals.months.reduce((sum, month) => sum + month.incomeCents, 0);
    assert.equal(totals.spentCents, expectedSpent);
    assert.equal(totals.incomeCents, expectedIncome);
    assert.equal(totals.spentCents, 3500);
    // Usual income counts in the four months with entries: Jan, Mar, Jun, Dec.
    assert.equal(totals.incomeCents, 8300);

    const necessary = totals.byCategory.find(({ id }) => id === 'necessary');
    const random = totals.byCategory.find(({ id }) => id === 'random');
    assert.equal(necessary.spentCents, 3000);
    assert.equal(necessary.name, 'Necessary expenses');
    assert.equal(random.spentCents, 500);
});

test('yearTotals falls back to the plan name when a category was deleted', () => {
    const data = defaultData();
    data.expenses = [expense('e1', 'later-deleted', 700, '2026-05-01')];
    freezeMonthPlan(data, '2026-05');
    // simulate the category being removed after the month was frozen
    data.monthPlans['2026-05'].entries.push({
        id: 'later-deleted', name: 'Later Deleted', pinned: false, noLimit: false, percent: 0, limitCents: 0,
    });

    const totals = yearTotals(data, 2026);
    const entry = totals.byCategory.find(({ id }) => id === 'later-deleted');
    assert.equal(entry.name, 'Later Deleted');
});

test('buildYearCsv produces europe and standard flavours with month/spent/income/budget plus category columns', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 10000;
    data.categories = data.categories.filter(({ id }) => id === 'necessary' || id === 'random' || id === 'uncategorised');
    data.expenses = [
        expense('e1', 'necessary', 1234, '2026-03-15'),
        expense('e2', 'random', 500, '2026-03-20'),
    ];

    const standard = buildYearCsv(data, 2026, 'standard');
    assert.equal(standard.filename, 'my-expenses-2026-standard.csv');
    assert.ok(standard.text.startsWith('﻿'));
    const standardHeader = standard.text.split('\n')[0].replace('﻿', '');
    assert.deepEqual(standardHeader.split(','), ['Month', 'Spent', 'Income', 'Budget', 'Necessary expenses', 'Random small purchases']);
    assert.ok(standard.text.includes('12.34'));

    const europe = buildYearCsv(data, 2026, 'europe');
    assert.equal(europe.filename, 'my-expenses-2026-europe.csv');
    const europeHeader = europe.text.split('\n')[0].replace('﻿', '');
    assert.deepEqual(europeHeader.split(';'), ['Month', 'Spent', 'Income', 'Budget', 'Necessary expenses', 'Random small purchases']);
    assert.ok(europe.text.includes('12,34'));
});

test('categoryChanges compares current month to previous month and to the average of prior months with data, sorted by |delta| desc', () => {
    const data = defaultData();
    data.expenses = [
        expense('a1', 'necessary', 1000, '2026-06-01'),
        expense('a2', 'necessary', 3000, '2026-07-01'),
        expense('a3', 'necessary', 2000, '2026-08-01'),
        expense('a4', 'necessary', 9000, '2026-09-01'),
        expense('b1', 'random', 500, '2026-08-01'),
        expense('b2', 'random', 500, '2026-09-01'),
    ];

    const changes = categoryChanges(data, '2026-09');
    const necessary = changes.find(({ id }) => id === 'necessary');
    const random = changes.find(({ id }) => id === 'random');

    assert.equal(necessary.currentCents, 9000);
    assert.equal(necessary.previousCents, 2000);
    assert.equal(necessary.averageCents, 2000); // avg of 1000, 3000, 2000 over 3 months with data
    assert.equal(necessary.deltaCents, 7000);

    assert.equal(random.currentCents, 500);
    assert.equal(random.previousCents, 500);
    assert.equal(random.deltaCents, 0);

    assert.deepEqual(
        [...changes].sort((first, second) => Math.abs(second.deltaCents) - Math.abs(first.deltaCents)),
        changes,
    );
    assert.equal(changes[0].id, 'necessary');
});

test('categoryChanges excludes prior months with no expense data from the average', () => {
    const data = defaultData();
    data.expenses = [
        expense('a1', 'necessary', 1000, '2026-09-01'),
        expense('a2', 'necessary', 4000, '2026-08-01'),
    ];

    const changes = categoryChanges(data, '2026-09');
    const necessary = changes.find(({ id }) => id === 'necessary');

    assert.equal(necessary.averageCents, 4000); // only August has data among the prior 6 months
});

test('planned income counts only for months that happened and were in use', () => {
    const data = defaultData();
    data.settings.usualMonthlyIncomeCents = 200000;
    data.expenses = [{ id: 'e1', categoryId: 'random', subcategoryId: '', amountCents: 1000, note: '', date: '2026-09-03' }];
    const now = new Date(2026, 8, 25);

    const year = yearTotals(data, 2026, now);
    assert.equal(year.incomeCents, 200000);
    assert.equal(year.months[8].incomeCents, 200000);
    assert.equal(year.months[9].incomeCents, 0);
    assert.equal(year.months[0].incomeCents, 0);

    const series = monthSeries(data, '2026-10', 3, now);
    assert.deepEqual(series.map(({ incomeCents }) => incomeCents), [0, 200000, 0]);
});
