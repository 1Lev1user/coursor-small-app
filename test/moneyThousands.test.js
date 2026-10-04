import test from 'node:test';
import assert from 'node:assert/strict';
import { amountProblem, parseAmount } from '../src/money.js';

const NBSP = '\u00A0';
const NARROW = '\u202F';

test('parseAmount accepts thousands separators', () => {
    const cases = [
        ['1 234', 123400],
        ['1 234,50', 123450],
        ['12 345.6', 1234560],
        ['1,234.56', 123456],
        ['1,234,567.89', 123456789],
        ['1,234,567', 123456700],
        ['1.234,56', 123456],
        ['1.234.567', 123456700],
        ['12,345.67', 1234567],
        ['12.50', 1250],
        ['12,50', 1250],
        ['1234.5', 123450],
        [`1${NBSP}234`, 123400],
        [`1${NARROW}234,50`, 123450],
        [`12${NBSP}345.6`, 1234560],
        [`1${NARROW}234${NARROW}567`, 123456700],
    ];
    for (const [input, cents] of cases) {
        assert.equal(parseAmount(input), cents, JSON.stringify(input));
    }
});

test('parseAmount rejects ambiguous or malformed grouping', () => {
    const cases = [
        '1,234', '1.234', '12.345', '1,2,3', '1.2.3', '1 2', '12 34', '1,23,456', ',234',
        '1,234.567', '1 234 5', '1.234,5,6', '1,234,56', '1234,567', '12€', '1,234.', '-1,234.50',
    ];
    for (const input of cases) {
        assert.equal(parseAmount(input), null, JSON.stringify(input));
    }
});

test('parseAmount allowZero with grouped input', () => {
    assert.equal(parseAmount('0'), null);
    assert.equal(parseAmount('0', { allowZero: true }), 0);
    assert.equal(parseAmount('1 000'), 100000);
    assert.equal(parseAmount('1 000', { allowZero: true }), 100000);
});

test('parseAmount keeps the result of every input that parsed before', () => {
    const inputs = ['0', '12', '12.5', '12,5', '12.50', '12,50', '0.99', '  12.50  ', '1234', '1234.56'];
    for (const s of inputs) {
        const expected = Math.round(Number(s.trim().replace(',', '.')) * 100);
        assert.equal(parseAmount(s, { allowZero: s === '0' }), expected, JSON.stringify(s));
    }
});

test('amountProblem names what is wrong', () => {
    const format = 'Use a number like 1234.56 or 1234,56, with at most two decimals.';
    for (const input of ['', '   ', null, 12]) {
        assert.equal(amountProblem(input), 'Enter an amount.', JSON.stringify(input));
    }
    assert.equal(amountProblem('-3'), 'Amounts cannot be negative.');
    assert.equal(amountProblem('0'), 'Enter an amount greater than zero.');
    assert.equal(amountProblem('0', { allowZero: true }), '');
    assert.equal(amountProblem('abc'), format);
    assert.equal(amountProblem('12.345'), format);
    assert.equal(amountProblem('12.50'), '');
    assert.equal(amountProblem('1 200,00'), '');
});
