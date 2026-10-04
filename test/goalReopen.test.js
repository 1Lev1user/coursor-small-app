import assert from 'node:assert/strict';
import test from 'node:test';

import { addGoal, closeGoal, contribute, goalProgress, reopenGoal } from '../src/goals.js';
import { defaultData } from '../src/model.js';

test('reopenGoal sets closedAt back to an empty string', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000 });
    closeGoal(data, goal.id, '2026-09-25');
    assert.equal(data.goals[0].closedAt, '2026-09-25');

    const reopened = reopenGoal(data, goal.id);
    assert.equal(reopened.ok, true);
    assert.equal(reopened.goal.closedAt, '');
    assert.equal(data.goals[0].closedAt, '');
});

test('reopenGoal refuses a goal that is already open', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000 });

    assert.deepEqual(reopenGoal(data, goal.id), { ok: false, reason: 'Goal is already open.' });
    assert.equal(data.goals[0].closedAt, '');
});

test('reopenGoal refuses an unknown goal', () => {
    const data = defaultData();

    assert.deepEqual(reopenGoal(data, 'missing'), { ok: false, reason: 'Goal does not exist.' });
});

test('reopening keeps the saved money and the goalId on the contributions', () => {
    const data = defaultData();
    const { goal } = addGoal(data, { name: 'Trip', targetCents: 100000 });
    contribute(data, goal.id, 5000, '2026-09-01');
    const before = goalProgress(data, goal.id);

    closeGoal(data, goal.id, '2026-09-25');
    reopenGoal(data, goal.id);

    const after = goalProgress(data, goal.id);
    assert.equal(after.savedCents, 5000);
    assert.deepEqual(after, before);
    assert.equal(data.expenses.length, 1);
    assert.equal(data.expenses[0].goalId, goal.id);
});
