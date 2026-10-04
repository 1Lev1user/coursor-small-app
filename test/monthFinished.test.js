import test from 'node:test';
import assert from 'node:assert/strict';
import { isMonthFinished } from '../src/months.js';

const NOW = new Date(2026, 9, 4);

test('a past month is finished', () => {
    assert.equal(isMonthFinished('2026-09', NOW), true);
    assert.equal(isMonthFinished('2025-12', NOW), true);
});

test('the current month is not finished', () => {
    assert.equal(isMonthFinished('2026-10', NOW), false);
});

test('a future month is not finished', () => {
    assert.equal(isMonthFinished('2026-11', NOW), false);
});

test('the last day of a month does not finish it', () => {
    assert.equal(isMonthFinished('2026-10', new Date(2026, 9, 31)), false);
});

test('the first day of the next month finishes it', () => {
    assert.equal(isMonthFinished('2026-10', new Date(2026, 10, 1)), true);
});

test('the turn of the year finishes December', () => {
    assert.equal(isMonthFinished('2026-12', new Date(2027, 0, 1)), true);
});
