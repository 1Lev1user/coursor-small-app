import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, SAVINGS_ID, UNCATEGORISED_ID } from '../src/model.js';
import { formatEuro } from '../src/money.js';
import { buildPlanSnapshot, monthTotals } from '../src/budget.js';
import { getMonthReviewSuggestion } from '../src/monthReview.js';
import { homeFigureModel } from '../src/views/add.js';

const NOW = new Date(2026, 4, 2);

function expense(id, categoryId, amountCents, date) {
    return { id, categoryId, subcategoryId: '', amountCents, note: '', date };
}

function income(id, amountCents, date) {
    return { id, incomeCategoryId: 'income-other', amountCents, note: '', date };
}

function dataWithBudget(budgetCents, savingsLimitCents = 0) {
    const data = defaultData();
    data.settings.monthlyBudgetCents = budgetCents;
    const savings = data.categories.find(({ id }) => id === SAVINGS_ID);
    savings.limitMode = 'euro';
    savings.limitCents = savingsLimitCents;
    return data;
}

/** The plan the import stores for "Only record spending (no budget)". */
function actualOnlySnapshot(data) {
    const plan = buildPlanSnapshot(data);
    return {
        ...plan,
        monthlyBudgetCents: 0,
        usualMonthlyIncomeCents: 0,
        unallocatedPercent: 0,
        unallocatedCents: 0,
        entries: plan.entries.map((entry) => ({ ...entry, limitCents: 0, percent: 0 })),
        actualOnly: true,
    };
}

function row(totals, id) {
    return totals.categories.find((category) => category.id === id);
}

function noBudgetData() {
    const data = dataWithBudget(100000);
    data.monthPlans['2026-04'] = actualOnlySnapshot(data);
    data.expenses = [
        expense('e1', 'necessary', 4510, '2026-04-10'),
        expense('e2', UNCATEGORISED_ID, 1200, '2026-04-11'),
    ];
    return data;
}

test('a no-budget month has no budget and no category is over', () => {
    const totals = monthTotals(noBudgetData(), '2026-04', NOW);

    assert.equal(totals.hasBudget, false);
    assert.equal(totals.spentCents, 5710);
    assert.equal(row(totals, 'necessary').spentCents, 4510);
    assert.equal(row(totals, UNCATEGORISED_ID).spentCents, 1200);
    assert.ok(totals.categories.every(({ over, overByCents }) => over === false && overByCents === 0));
    assert.ok(totals.categories.every(({ noLimit }) => noLimit === true));
});

test('Savings without a share is outside the spend budget and never over', () => {
    const data = dataWithBudget(100000);
    data.expenses = [
        expense('e1', SAVINGS_ID, 15000, '2026-04-10'),
        expense('e2', 'necessary', 20000, '2026-04-11'),
    ];

    const totals = monthTotals(data, '2026-04', NOW);

    assert.equal(totals.hasBudget, true);
    assert.equal(totals.budgetSpentCents, 20000);
    assert.equal(totals.outsideBudgetCents, 15000);
    assert.equal(totals.budgetLeftCents, 80000);
    assert.equal(totals.spentCents, 35000);
    assert.equal(row(totals, SAVINGS_ID).over, false);
    assert.equal(row(totals, SAVINGS_ID).overByCents, 0);
    assert.equal(row(totals, SAVINGS_ID).noLimit, true);
});

test('Savings with a share counts against the budget and can be over its limit', () => {
    const data = dataWithBudget(100000, 10000);
    data.expenses = [expense('e1', SAVINGS_ID, 15000, '2026-04-10')];

    const totals = monthTotals(data, '2026-04', NOW);

    assert.equal(totals.outsideBudgetCents, 0);
    assert.equal(totals.budgetSpentCents, 15000);
    assert.equal(totals.budgetLeftCents, 85000);
    assert.equal(row(totals, SAVINGS_ID).noLimit, false);
    assert.equal(row(totals, SAVINGS_ID).over, true);
    assert.equal(row(totals, SAVINGS_ID).overByCents, 5000);
});

test('homeFigureModel leaves savings out of the left-to-spend figure', () => {
    const data = dataWithBudget(100000);
    data.expenses = [
        expense('e1', SAVINGS_ID, 15000, '2026-04-10'),
        expense('e2', 'necessary', 20000, '2026-04-11'),
    ];

    const figure = homeFigureModel(monthTotals(data, '2026-04', NOW));

    assert.equal(figure.over, false);
    assert.equal(figure.label, 'left to spend');
    assert.equal(figure.valueCents, 80000);
    assert.equal(
        figure.sub,
        `${formatEuro(20000)} spent of ${formatEuro(100000)} \u00b7 ${formatEuro(15000)} saved`,
    );
});

test('homeFigureModel says over budget with the absolute value and no saved part without savings', () => {
    const data = dataWithBudget(100000);
    data.expenses = [expense('e1', 'necessary', 130000, '2026-04-10')];

    const figure = homeFigureModel(monthTotals(data, '2026-04', NOW));

    assert.equal(figure.over, true);
    assert.equal(figure.label, 'over budget by');
    assert.equal(figure.valueCents, 30000);
    assert.doesNotMatch(figure.sub, /saved/);
});

test('no month review for an actual-only previous month with spending and extra income', () => {
    const data = noBudgetData();
    data.incomes = [income('i1', 30000, '2026-04-05')];

    assert.equal(getMonthReviewSuggestion(data, NOW), null);
});

test('a default plan has a budget and budget spending equals all spending', () => {
    const data = dataWithBudget(100000);
    data.expenses = [
        expense('e1', 'necessary', 20000, '2026-04-10'),
        expense('e2', UNCATEGORISED_ID, 700, '2026-04-11'),
    ];

    const totals = monthTotals(data, '2026-04', NOW);

    assert.equal(totals.hasBudget, true);
    assert.equal(totals.outsideBudgetCents, 0);
    assert.equal(totals.budgetSpentCents, totals.spentCents);
    assert.equal(row(totals, UNCATEGORISED_ID).over, true);
    assert.equal(row(totals, UNCATEGORISED_ID).noLimit, false);
});

test('Savings missing from the plan snapshot counts as having no share', () => {
    const data = dataWithBudget(100000);
    data.monthPlans['2026-04'] = buildPlanSnapshot(data);
    data.monthPlans['2026-04'].entries = data.monthPlans['2026-04'].entries
        .filter(({ id }) => id !== SAVINGS_ID);
    data.expenses = [
        expense('e1', SAVINGS_ID, 15000, '2026-04-10'),
        expense('e2', 'necessary', 20000, '2026-04-11'),
    ];

    const totals = monthTotals(data, '2026-04', NOW);

    assert.equal(totals.outsideBudgetCents, 15000);
    assert.equal(totals.budgetSpentCents, 20000);
    assert.equal(row(totals, SAVINGS_ID).noLimit, true);
    assert.equal(row(totals, SAVINGS_ID).over, false);
});
