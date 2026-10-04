import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import {
    dueSubscriptions,
    nameAppearsIn,
    skipSubscriptionMonth,
} from '../src/subscriptions.js';

const NOW = new Date(2026, 9, 6, 12); // 6 Oct 2026

function dataWith(subs, expenses = []) {
    const data = defaultData();
    data.subscriptions = subs;
    data.expenses = expenses;
    return data;
}

function spotify() {
    return { id: 'sub_spotify', name: 'Spotify', amountCents: 1199, dayOfMonth: 5 };
}

function charge(date) {
    return {
        id: `exp_${date}`,
        categoryId: 'subscriptions',
        subcategoryId: '',
        amountCents: 1199,
        note: 'Spotify',
        date,
        subscriptionId: 'sub_spotify',
    };
}

test('a subscription past its day with no charge is listed', () => {
    const sub = spotify();
    assert.deepEqual(dueSubscriptions(dataWith([sub]), NOW), [sub]);
});

test('a charge tagged with the subscription id this month removes the reminder', () => {
    const data = dataWith([spotify()], [charge('2026-10-04')]);
    assert.deepEqual(dueSubscriptions(data, NOW), []);
});

test('a charge from last month does not remove the reminder', () => {
    const sub = spotify();
    const data = dataWith([sub], [charge('2026-09-04')]);
    assert.deepEqual(dueSubscriptions(data, NOW), [sub]);
});

test('skipSubscriptionMonth hides the reminder for that month only', () => {
    const sub = { ...spotify(), skippedMonths: [] };
    const data = dataWith([sub]);
    assert.equal(skipSubscriptionMonth(data, 'sub_spotify', '2026-10'), true);
    assert.deepEqual(sub.skippedMonths, ['2026-10']);
    assert.deepEqual(dueSubscriptions(data, NOW), []);
    assert.deepEqual(dueSubscriptions(data, new Date(2026, 9, 31, 12)), []);
    assert.deepEqual(dueSubscriptions(data, new Date(2026, 10, 1, 12)), []);
    assert.deepEqual(dueSubscriptions(data, new Date(2026, 10, 5, 12)), [sub]);
});

test('skipSubscriptionMonth returns false for an unknown id and changes nothing', () => {
    const sub = { ...spotify(), skippedMonths: [] };
    const data = dataWith([sub]);
    assert.equal(skipSubscriptionMonth(data, 'sub_missing', '2026-10'), false);
    assert.deepEqual(sub.skippedMonths, []);
});

test('skipSubscriptionMonth adds the key once and returns true the second time too', () => {
    const sub = { ...spotify(), skippedMonths: [] };
    const data = dataWith([sub]);
    assert.equal(skipSubscriptionMonth(data, 'sub_spotify', '2026-10'), true);
    assert.equal(skipSubscriptionMonth(data, 'sub_spotify', '2026-10'), true);
    assert.deepEqual(sub.skippedMonths, ['2026-10']);
});

test('a subscription without skippedMonths still works', () => {
    const sub = spotify();
    const data = dataWith([sub]);
    assert.deepEqual(dueSubscriptions(data, NOW), [sub]);
    assert.equal(skipSubscriptionMonth(data, 'sub_spotify', '2026-10'), true);
    assert.deepEqual(sub.skippedMonths, ['2026-10']);
    assert.deepEqual(dueSubscriptions(data, NOW), []);
});

test('nameAppearsIn matches whole words, ignoring case, marks and punctuation', () => {
    assert.equal(nameAppearsIn('Spotify', 'SPOTIFY AB STOCKHOLM'), true);
    assert.equal(nameAppearsIn('Rīgas satiksme', 'RIGAS SATIKSME 12'), true);
    assert.equal(nameAppearsIn('Rīgas satiksme', 'RIGAS-SATIKSME 12'), true);
    assert.equal(nameAppearsIn('Gym', 'Gymnastics club'), false);
    assert.equal(nameAppearsIn('Gym', 'My Gym, Riga'), true);
});

test('nameAppearsIn never matches an empty name', () => {
    assert.equal(nameAppearsIn('', 'SPOTIFY AB'), false);
    assert.equal(nameAppearsIn('   ', 'SPOTIFY AB'), false);
    assert.equal(nameAppearsIn('-', 'SPOTIFY AB'), false);
});
