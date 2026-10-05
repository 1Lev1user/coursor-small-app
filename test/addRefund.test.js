import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultData } from '../src/model.js';
import { monthTotals, spendCents } from '../src/budget.js';
import { newExpenseRecord } from '../src/views/add.js';

const NOW = new Date(2026, 9, 15);

function record(amountCents, refund) {
    return newExpenseRecord({
        categoryId: 'necessary',
        subcategoryId: '',
        amountCents,
        note: 'Shoes',
        date: '2026-10-10',
        currency: 'EUR',
        originalAmountCents: amountCents,
        refund,
    });
}

test('newExpenseRecord keeps refund true when asked', () => {
    assert.equal(record(1299, true).refund, true);
});

test('newExpenseRecord gives refund false for false, undefined and a missing key', () => {
    assert.equal(record(1299, false).refund, false);
    assert.equal(record(1299, undefined).refund, false);
    const { refund, ...withoutRefund } = {
        categoryId: 'necessary',
        subcategoryId: '',
        amountCents: 1299,
        note: '',
        date: '2026-10-10',
        currency: 'EUR',
        originalAmountCents: 1299,
        refund: true,
    };
    assert.equal(refund, true);
    assert.equal(newExpenseRecord(withoutRefund).refund, false);
});

test('newExpenseRecord only accepts the boolean true as a refund', () => {
    assert.equal(record(1299, 'yes').refund, false);
    assert.equal(record(1299, 1).refund, false);
});

test('newExpenseRecord carries the given fields and blank import fields', () => {
    const rec = record(1299, false);
    assert.match(rec.id, /^exp_/);
    assert.equal(rec.categoryId, 'necessary');
    assert.equal(rec.subcategoryId, '');
    assert.equal(rec.amountCents, 1299);
    assert.equal(rec.note, 'Shoes');
    assert.equal(rec.date, '2026-10-10');
    assert.equal(rec.currency, 'EUR');
    assert.equal(rec.originalAmountCents, 1299);
    assert.equal(rec.importId, '');
    assert.equal(rec.bankRef, '');
    assert.equal(rec.fingerprint, '');
    assert.equal(rec.goalId, '');
});

test('spendCents of a refund record is the negative amount', () => {
    assert.equal(spendCents(record(1299, true)), -1299);
    assert.equal(spendCents(record(1299, false)), 1299);
});

test('a refund record lowers the month spent total', () => {
    const data = defaultData();
    data.expenses.push(record(5000, false), record(1299, true));
    assert.equal(monthTotals(data, '2026-10', NOW).spentCents, 3701);
});

test('add.js wires the refund checkbox and the confirmation title', () => {
    const source = readFileSync(new URL('../src/views/add.js', import.meta.url), 'utf8');
    assert.ok(source.includes("'add-refund'"));
    assert.ok(source.includes('Refund added'));
    assert.ok(source.includes('newExpenseRecord('));
    assert.ok(source.includes("'Income added'"));
});
