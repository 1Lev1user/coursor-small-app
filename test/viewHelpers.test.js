import test from 'node:test';
import assert from 'node:assert/strict';
import { niceScale } from '../src/views/trends.js';
import { pickHomeGoal } from '../src/views/goalCard.js';

test('niceScale rounds the top of the axis up to a clean step', () => {
    const scale = niceScale(187000);
    assert.ok(scale.maxCents >= 187000);
    assert.equal(scale.maxCents % scale.stepCents, 0);
    assert.equal(niceScale(0).maxCents > 0, true);
});

test('pickHomeGoal prefers the nearest upcoming deadline among open goals', () => {
    const data = {
        goals: [
            { id: 'a', name: 'A', targetCents: 100, deadline: '', createdAt: '2026-01-01', closedAt: '' },
            { id: 'b', name: 'B', targetCents: 100, deadline: '2027-06-01', createdAt: '2026-01-01', closedAt: '' },
            { id: 'c', name: 'C', targetCents: 100, deadline: '2026-12-01', createdAt: '2026-01-01', closedAt: '' },
            { id: 'd', name: 'D', targetCents: 100, deadline: '2026-10-01', createdAt: '2026-01-01', closedAt: '2026-09-01' },
        ],
        expenses: [],
    };
    assert.equal(pickHomeGoal(data, '2026-09-25').id, 'c');
    data.goals = data.goals.filter(({ id }) => id === 'a');
    assert.equal(pickHomeGoal(data, '2026-09-25').id, 'a');
    data.goals = [];
    assert.equal(pickHomeGoal(data, '2026-09-25') ?? null, null);
});
