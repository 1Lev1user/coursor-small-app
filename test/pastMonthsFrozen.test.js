import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { freezeElapsedMonths, freezeMonthPlan, monthTotals } from '../src/budget.js';
import { monthsNeedingPlanChoice } from '../src/import/core.js';

const NOW = new Date(2026, 9, 4);

function expense(id, amountCents, date) {
    return { id, categoryId: 'necessary', subcategoryId: '', amountCents, note: '', date };
}

function augustData() {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    data.settings.usualMonthlyIncomeCents = 200000;
    data.expenses.push(expense('e1', 1500, '2026-08-12'), expense('e0', 700, '2026-09-03'));
    return data;
}

function view(data, monthKey) {
    const totals = monthTotals(data, monthKey, NOW);
    return {
        budgetCents: totals.budgetCents,
        usualIncomeCents: totals.usualIncomeCents,
        budgetLeftCents: totals.budgetLeftCents,
        limits: totals.categories.map(({ id, limitCents }) => [id, limitCents]),
    };
}

test('freezes the elapsed months that have entries, not the current one', () => {
    const data = augustData();
    assert.equal(freezeElapsedMonths(data, NOW), 2);
    assert.deepEqual(Object.keys(data.monthPlans), ['2026-08', '2026-09']);
});

test('an elapsed month without entries between two months with entries stays unfrozen', () => {
    const data = defaultData();
    data.expenses.push(expense('e1', 1500, '2026-05-12'));
    data.incomes.push({ id: 'i1', categoryId: 'income-other', amountCents: 9000, note: '', date: '2026-09-25' });
    assert.equal(freezeElapsedMonths(data, NOW), 2);
    assert.deepEqual(Object.keys(data.monthPlans).sort(), ['2026-05', '2026-09']);
});

test('an empty past month still gets the import plan choice after the freeze', () => {
    const data = defaultData();
    data.expenses.push(expense('e1', 1500, '2026-05-12'), expense('e2', 900, '2026-09-12'));
    freezeElapsedMonths(data, NOW);
    const rows = [{ date: '2026-07-10' }, { date: '2026-05-20' }, { date: '2026-09-02' }];
    assert.deepEqual(monthsNeedingPlanChoice(data, rows, NOW), ['2026-07']);
});

test('a later plan change leaves elapsed months alone and applies to the current month', () => {
    const data = augustData();
    freezeElapsedMonths(data, NOW);
    const before = { aug: view(data, '2026-08'), sep: view(data, '2026-09') };
    assert.equal(before.aug.budgetCents, 100000);
    assert.equal(before.aug.usualIncomeCents, 200000);

    data.settings.monthlyBudgetCents = 60000;
    data.settings.usualMonthlyIncomeCents = 50000;

    assert.deepEqual(view(data, '2026-08'), before.aug);
    assert.deepEqual(view(data, '2026-09'), before.sep);
    const october = view(data, '2026-10');
    assert.equal(october.budgetCents, 60000);
    assert.equal(october.usualIncomeCents, 50000);
});

test('a second call creates nothing and changes nothing', () => {
    const data = augustData();
    freezeElapsedMonths(data, NOW);
    const before = structuredClone(data);
    assert.equal(freezeElapsedMonths(data, NOW), 0);
    assert.deepEqual(data, before);
});

test('never freezes a month before the first tracked month', () => {
    const fresh = defaultData();
    fresh.settings.balanceStart = { date: '2026-10-04', cents: 100000 };
    assert.equal(freezeElapsedMonths(fresh, NOW), 0);
    assert.deepEqual(fresh.monthPlans, {});

    const older = defaultData();
    older.settings.balanceStart = { date: '2026-08-04', cents: 100000 };
    assert.equal(freezeElapsedMonths(older, NOW), 0);
    assert.deepEqual(older.monthPlans, {});
});

test('an already frozen month is not overwritten', () => {
    const data = augustData();
    freezeMonthPlan(data, '2026-08');
    data.monthPlans['2026-08'].monthlyBudgetCents = 77700;
    data.expenses.push(expense('e2', 500, '2026-08-20'));

    assert.equal(freezeElapsedMonths(data, NOW), 1);
    assert.equal(data.monthPlans['2026-08'].monthlyBudgetCents, 77700);
    assert.equal(data.monthPlans['2026-09'].monthlyBudgetCents, 100000);
});

test('entries only in the current and a future month freeze nothing', () => {
    const data = defaultData();
    data.expenses.push(expense('e1', 1500, '2026-10-02'), expense('e2', 900, '2026-12-01'));
    assert.equal(freezeElapsedMonths(data, NOW), 0);
    assert.deepEqual(data.monthPlans, {});
});
