import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { findDuplicates, fingerprint } from '../src/import/core.js';

// Stored expense of 10.00 on 2026-03-10 with a bank reference.
function storedWith(bankRef, text, fingerprintValue) {
    const data = defaultData();
    const row = statementRow({ date: '2026-03-10', amountCents: 1000, direction: 'out', description: text, bankRef });
    data.expenses = [{
        id: 'exp_a',
        categoryId: 'random',
        subcategoryId: '',
        amountCents: 1000,
        note: text,
        date: '2026-03-10',
        bankRef,
        importId: 'imp_a',
        fingerprint: fingerprintValue ?? fingerprint(row),
    }];
    return data;
}

function incoming(date, text, bankRef, amountCents = 1000) {
    return statementRow({ date, amountCents, direction: 'out', description: text, bankRef });
}

const level = (data, row) => findDuplicates(data, [row])[0].level;

test('a reused reference with another text and a later date is not exact', () => {
    const data = storedWith('REF-1', 'SHOP A');
    assert.equal(level(data, incoming('2026-03-13', 'SHOP B', 'REF-1')), null);
});

test('a reference match within 1 day is exact whatever the text', () => {
    const data = storedWith('REF-1', 'SHOP A');
    assert.equal(level(data, incoming('2026-03-10', 'SHOP B', 'REF-1')), 'exact');
    assert.equal(level(data, incoming('2026-03-11', 'SHOP B', 'REF-1')), 'exact');
});

test('a reference match with the same text is exact up to 5 days apart', () => {
    const data = storedWith('REF-1', 'SHOP A');
    assert.equal(level(data, incoming('2026-03-15', 'SHOP A', 'REF-1')), 'exact');
});

test('a strong reference keeps the 5-day window with other text', () => {
    const data = storedWith('RF2026091400001', 'SHOP A');
    assert.equal(level(data, incoming('2026-03-15', 'SHOP B', 'RF2026091400001')), 'exact');
    assert.notEqual(level(data, incoming('2026-03-16', 'SHOP B', 'RF2026091400001')), 'exact');
});

test('a camt running number is exact only within 1 day', () => {
    const data = storedWith('1', 'SHOP A');
    assert.notEqual(level(data, incoming('2026-03-14', 'SHOP B', '1')), 'exact');
    assert.equal(level(data, incoming('2026-03-11', 'SHOP B', '1')), 'exact');
});

test('a different amount is not a reference match; an unparseable fingerprint skips the text rule', () => {
    const data = storedWith('REF-1', 'SHOP A');
    assert.notEqual(level(data, incoming('2026-03-12', 'SHOP A', 'REF-1', 2000)), 'exact');
    const old = storedWith('REF-1', 'SHOP A', 'x');
    assert.equal(level(old, incoming('2026-03-10', 'SHOP B', 'REF-1')), 'exact');
    assert.notEqual(level(old, incoming('2026-03-13', 'SHOP A', 'REF-1')), 'exact');
});

test('a row that fails the reference rule is weak when the amount is within 2 days', () => {
    const data = storedWith('REF-1', 'SHOP A');
    assert.equal(level(data, incoming('2026-03-12', 'SHOP B', 'REF-1')), 'weak');
});
