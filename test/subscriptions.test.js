import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { dueSubscriptions, isLoggedThisMonth } from '../src/subscriptions.js';

function dataWith(subs, expenses = []) {
    const data = defaultData();
    data.subscriptions = subs;
    data.expenses = expenses;
    return data;
}

test('dueSubscriptions returns empty list when there are no subscriptions', () => {
    assert.deepEqual(dueSubscriptions(dataWith([])), []);
});

test('subscription is not due before its day of month', () => {
    const data = dataWith([
        { id: 'sub_netflix', name: 'Netflix', amountCents: 1599, dayOfMonth: 25 },
    ]);
    const now = new Date(2026, 8, 1); // 1 Sep 2026
    assert.deepEqual(dueSubscriptions(data, now), []);
});

test('subscription is due on its day of month when not logged', () => {
    const sub = { id: 'sub_netflix', name: 'Netflix', amountCents: 1599, dayOfMonth: 25 };
    const data = dataWith([sub]);
    const now = new Date(2026, 8, 25);
    assert.deepEqual(dueSubscriptions(data, now), [sub]);
});

test('subscription is due after its day of month when not logged', () => {
    const sub = { id: 'sub_netflix', name: 'Netflix', amountCents: 1599, dayOfMonth: 25 };
    const data = dataWith([sub]);
    const now = new Date(2026, 8, 30);
    assert.deepEqual(dueSubscriptions(data, now), [sub]);
});

test('subscription is not due when an expense with that subscriptionId exists this month', () => {
    const sub = { id: 'sub_netflix', name: 'Netflix', amountCents: 1599, dayOfMonth: 25 };
    const data = dataWith([sub], [
        {
            id: 'exp_1',
            categoryId: 'subscriptions',
            subcategoryId: '',
            amountCents: 1599,
            note: 'Netflix',
            date: '2026-09-25',
            subscriptionId: 'sub_netflix',
        },
    ]);
    const now = new Date(2026, 8, 30);
    assert.deepEqual(dueSubscriptions(data, now), []);
});

test('day 31 subscription is due on 28 Feb 2026 via clamp', () => {
    const sub = { id: 'sub_rent', name: 'Rent', amountCents: 90000, dayOfMonth: 31 };
    const data = dataWith([sub]);
    const now = new Date(2026, 1, 28); // 28 Feb 2026 (non-leap)
    assert.deepEqual(dueSubscriptions(data, now), [sub]);
});

test('isLoggedThisMonth is true only for matching subscriptionId in that month', () => {
    const data = dataWith([], [
        {
            id: 'exp_1',
            categoryId: 'subscriptions',
            subcategoryId: '',
            amountCents: 1000,
            note: 'A',
            date: '2026-09-10',
            subscriptionId: 'sub_a',
        },
        {
            id: 'exp_2',
            categoryId: 'subscriptions',
            subcategoryId: '',
            amountCents: 1000,
            note: 'B',
            date: '2026-08-10',
            subscriptionId: 'sub_b',
        },
    ]);

    assert.equal(isLoggedThisMonth(data, 'sub_a', '2026-09'), true);
    assert.equal(isLoggedThisMonth(data, 'sub_a', '2026-08'), false);
    assert.equal(isLoggedThisMonth(data, 'sub_b', '2026-09'), false);
    assert.equal(isLoggedThisMonth(data, 'sub_missing', '2026-09'), false);
});
