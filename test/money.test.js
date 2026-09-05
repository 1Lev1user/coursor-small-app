import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseAmount,
    formatEuro,
    formatPlain,
    splitShares,
} from '../src/money.js';

// --- parseAmount: valid inputs ---

test('parseAmount accepts dot decimal separator', () => {
    assert.equal(parseAmount('12.50'), 1250);
});

test('parseAmount accepts comma decimal separator', () => {
    assert.equal(parseAmount('12,50'), 1250);
});

test('parseAmount accepts whole number', () => {
    assert.equal(parseAmount('12'), 1200);
});

test('parseAmount accepts one decimal digit', () => {
    assert.equal(parseAmount('12.5'), 1250);
});

test('parseAmount accepts leading zero form', () => {
    assert.equal(parseAmount('0.99'), 99);
});

test('parseAmount trims surrounding whitespace', () => {
    assert.equal(parseAmount('  12.50  '), 1250);
});

// --- parseAmount: rejected inputs ---

test('parseAmount rejects empty string', () => {
    assert.equal(parseAmount(''), null);
});

test('parseAmount rejects whitespace only', () => {
    assert.equal(parseAmount('   '), null);
});

test('parseAmount rejects non-numeric text', () => {
    assert.equal(parseAmount('abc'), null);
});

test('parseAmount rejects more than two decimal places', () => {
    assert.equal(parseAmount('12.345'), null);
});

test('parseAmount rejects negative values', () => {
    assert.equal(parseAmount('-5'), null);
});

test('parseAmount rejects zero whole number', () => {
    assert.equal(parseAmount('0'), null);
});

test('parseAmount rejects zero with decimals', () => {
    assert.equal(parseAmount('0.00'), null);
});

test('parseAmount rejects multiple dot separators', () => {
    assert.equal(parseAmount('1.2.3'), null);
});

test('parseAmount rejects multiple comma separators', () => {
    assert.equal(parseAmount('1,2,3'), null);
});

test('parseAmount rejects currency symbol suffix', () => {
    assert.equal(parseAmount('12€'), null);
});

test('parseAmount rejects embedded space', () => {
    assert.equal(parseAmount('1 2'), null);
});

test('parseAmount rejects null', () => {
    assert.equal(parseAmount(null), null);
});

test('parseAmount rejects undefined', () => {
    assert.equal(parseAmount(undefined), null);
});

test('parseAmount rejects number type', () => {
    assert.equal(parseAmount(12), null);
});

test('parseAmount rejects oversized whole number', () => {
    assert.equal(parseAmount('90071992547410'), null);
});

test('parseAmount rejects very long digit string', () => {
    assert.equal(parseAmount('1'.repeat(400)), null);
});

// --- formatEuro ---

test('formatEuro formats standard amount', () => {
    assert.equal(formatEuro(1250), '€12.50');
});

test('formatEuro formats amount with thousands separator', () => {
    assert.equal(formatEuro(123456), '€1,234.56');
});

test('formatEuro formats zero', () => {
    assert.equal(formatEuro(0), '€0.00');
});

test('formatEuro formats negative with leading minus', () => {
    assert.equal(formatEuro(-500), '-€5.00');
});

// --- formatPlain ---

test('formatPlain with dot separator', () => {
    assert.equal(formatPlain(123456, '.'), '1234.56');
});

test('formatPlain with comma separator', () => {
    assert.equal(formatPlain(123456, ','), '1234,56');
});

test('formatPlain pads small amounts', () => {
    assert.equal(formatPlain(5, '.'), '0.05');
});

test('formatPlain defaults to dot separator', () => {
    assert.equal(formatPlain(123456), '1234.56');
});

// --- splitShares ---

test('splitShares splits evenly by percentage', () => {
    assert.deepEqual(splitShares(100000, [50, 30, 20]), [50000, 30000, 20000]);
});

test('splitShares sums to total with fractional percentages', () => {
    const result = splitShares(100000, [33.333, 33.333, 33.334]);
    assert.equal(result.reduce((a, b) => a + b, 0), 100000);
});

test('splitShares adds remainder to last non-zero share', () => {
    assert.deepEqual(splitShares(100, [33.333, 66.667, 0]), [33, 67, 0]);
});

test('splitShares handles partial allocation', () => {
    assert.deepEqual(splitShares(100000, [10]), [10000]);
});

test('splitShares returns empty array for empty percentages', () => {
    assert.deepEqual(splitShares(100000, []), []);
});

test('splitShares returns zeros for all-zero percentages', () => {
    assert.deepEqual(splitShares(100000, [0, 0]), [0, 0]);
});

test('splitShares returns zeros when total is zero', () => {
    assert.deepEqual(splitShares(0, [50, 50]), [0, 0]);
});
