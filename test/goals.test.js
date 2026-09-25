import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, SAVINGS_ID } from '../src/model.js';
import {
    addGoal,
    updateGoal,
    closeGoal,
    deleteGoal,
    goalProgress,
    contribute,
} from '../src/goals.js';

test('addGoal validates name and target, and stores createdAt/closedAt', () => {
    const data = defaultData();

    assert.equal(addGoal(data, { name: '', targetCents: 1000 }).ok, false);
    assert.equal(addGoal(data, { name: 'Trip', targetCents: 0 }).ok, false);
    assert.equal(addGoal(data, { name: 'Trip', targetCents: -100 }).ok, false);
    assert.equal(addGoal(data, { name: 'Trip', targetCents: 1.5 }).ok, false);
    assert.equal(addGoal(data, { name: 'Trip', targetCents: 100000, deadline: 'not-a-date' }).ok, false);

    const now = new Date(2026, 8, 25);
    const result = addGoal(data, { name: '  Trip to Rome  ', targetCents: 100000, deadline: '2026-12-01' }, now);

    assert.equal(result.ok, true);
    assert.equal(result.goal.name, 'Trip to Rome');
    assert.equal(result.goal.createdAt, '2026-09-25');
    assert.equal(result.goal.closedAt, '');
    assert.ok(result.goal.id.startsWith('goal_'));
    assert.equal(data.goals.length, 1);
});

test('updateGoal merges fields and re-validates, deleteGoal removes it', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000 });

    assert.equal(updateGoal(data, 'missing', { name: 'X' }).ok, false);
    assert.equal(updateGoal(data, goal.id, { name: '' }).ok, false);

    const updated = updateGoal(data, goal.id, { targetCents: 200000, deadline: '2027-01-01' });
    assert.equal(updated.ok, true);
    assert.equal(updated.goal.targetCents, 200000);
    assert.equal(updated.goal.deadline, '2027-01-01');
    assert.equal(updated.goal.name, 'Trip');

    assert.equal(deleteGoal(data, 'missing').ok, false);
    assert.equal(deleteGoal(data, goal.id).ok, true);
    assert.equal(data.goals.length, 0);
});

test('closeGoal sets closedAt', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000 });

    assert.equal(closeGoal(data, 'missing', '2026-09-25').ok, false);

    const closed = closeGoal(data, goal.id, '2026-09-25');
    assert.equal(closed.ok, true);
    assert.equal(closed.goal.closedAt, '2026-09-25');
});

test('deleteGoal clears goalId on its expenses but keeps the money saved', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000 });
    contribute(data, goal.id, 5000, '2026-09-01');
    contribute(data, goal.id, 3000, '2026-09-02');
    data.expenses.push({
        id: 'other',
        categoryId: 'random',
        subcategoryId: '',
        amountCents: 100,
        note: 'unrelated',
        date: '2026-09-01',
        goalId: '',
    });

    const result = deleteGoal(data, goal.id);

    assert.equal(result.ok, true);
    assert.equal(result.unlinkedCount, 2);
    assert.equal(data.expenses.length, 3);
    assert.ok(data.expenses.every((expense) => expense.goalId === ''));
    assert.equal(data.expenses.reduce((sum, expense) => sum + expense.amountCents, 0), 8100);
});

test('contribute creates a Savings expense tagged with the goal', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'New laptop', targetCents: 100000 });

    assert.equal(contribute(data, 'missing', 5000, '2026-09-01').ok, false);
    assert.equal(contribute(data, goal.id, 0, '2026-09-01').ok, false);
    assert.equal(contribute(data, goal.id, -100, '2026-09-01').ok, false);
    assert.equal(contribute(data, goal.id, 1.5, '2026-09-01').ok, false);
    assert.equal(contribute(data, goal.id, 5000, 'not-a-date').ok, false);

    const result = contribute(data, goal.id, 5000, '2026-09-01');
    assert.equal(result.ok, true);
    assert.deepEqual(result.expense, {
        id: result.expense.id,
        categoryId: SAVINGS_ID,
        subcategoryId: '',
        amountCents: 5000,
        note: 'Goal: New laptop',
        date: '2026-09-01',
        currency: 'EUR',
        originalAmountCents: 5000,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: goal.id,
    });
    assert.equal(data.expenses.length, 1);
});

test('goalProgress sums only this goal\'s expenses and reports percent/remaining', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000 });
    contribute(data, goal.id, 30000, '2026-09-01');
    contribute(data, goal.id, 45000, '2026-09-15');
    data.expenses.push({
        id: 'unrelated', categoryId: SAVINGS_ID, subcategoryId: '', amountCents: 999999,
        note: '', date: '2026-09-10', goalId: '',
    });

    const progress = goalProgress(data, goal.id, new Date(2026, 8, 25));

    assert.equal(progress.savedCents, 75000);
    assert.equal(progress.targetCents, 100000);
    assert.equal(progress.percent, 75);
    assert.equal(progress.remainingCents, 25000);
});

test('goalProgress computes perMonthCents from a future deadline, ceiling the division', () => {
    const data = defaultData();
    const now = new Date(2026, 8, 25); // 2026-09-25
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000, deadline: '2026-12-01' }, now);
    contribute(data, goal.id, 10000, '2026-09-01');

    const progress = goalProgress(data, goal.id, now);

    // remaining 90000 over Sep, Oct, Nov, Dec = 4 months
    assert.equal(progress.monthsLeft, 4);
    assert.equal(progress.perMonthCents, 22500);
});

test('goalProgress reports monthsLeft/perMonthCents as null without a future deadline', () => {
    const data = defaultData();
    const now = new Date(2026, 8, 25);

    const noDeadline = addGoal(data, { name: 'A', targetCents: 1000 }, now).goal;
    assert.equal(goalProgress(data, noDeadline.id, now).monthsLeft, null);
    assert.equal(goalProgress(data, noDeadline.id, now).perMonthCents, null);

    const pastDeadline = addGoal(data, { name: 'B', targetCents: 1000, deadline: '2026-01-01' }, now).goal;
    assert.equal(goalProgress(data, pastDeadline.id, now).monthsLeft, null);

    assert.equal(goalProgress(data, 'missing', now), null);
});

test('contribute freezes the month plan and reports whether it was new', async () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    const { goal } = addGoal(data, { name: 'Car', targetCents: 500000 });
    const result = contribute(data, goal.id, 2500, '2026-03-10');
    assert.equal(result.ok, true);
    assert.equal(result.monthKey, '2026-03');
    assert.equal(result.planWasAlreadyFrozen, false);
    assert.equal(Object.hasOwn(data.monthPlans, '2026-03'), true);
    assert.equal(contribute(data, goal.id, 100, '2026-03-11').planWasAlreadyFrozen, true);
});

test('goal progress counts refunded contributions as money back', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Bike', targetCents: 10000 });
    contribute(data, goal.id, 3000, '2026-09-01');
    data.expenses.push({ ...data.expenses[0], id: 'back', amountCents: 1000, refund: true });
    assert.equal(goalProgress(data, goal.id).savedCents, 2000);
});
