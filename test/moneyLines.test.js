import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { formatEuro } from '../src/money.js';
import { signedEuro } from '../src/views/homeMoney.js';
import { groupSummary } from '../src/views/more.js';
import { monthMoneyLines } from '../src/views/month.js';
import { moneySummary } from '../src/views/settings/balance.js';

const NOW = new Date(2026, 9, 15);
const AFTER_PAYDAY = new Date(2026, 9, 26);

function expense(id, date, amountCents) {
    return {
        id,
        categoryId: 'necessary',
        subcategoryId: '',
        amountCents,
        note: '',
        date,
        currency: 'EUR',
        originalAmountCents: amountCents,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: '',
    };
}

function income(id, date, amountCents, overrides = {}) {
    return { id, incomeCategoryId: 'salary', amountCents, note: '', date, sourceId: '', ...overrides };
}

function salarySource(overrides = {}) {
    return {
        id: 'incsrc_a',
        name: 'Salary',
        incomeCategoryId: 'salary',
        expectedCents: 200000,
        dayOfMonth: 25,
        startDate: '2026-10-01',
        skippedMonths: [],
        ...overrides,
    };
}

/** Money now is 225000 on 15 Oct 2026; Salary 200000 is due on the 25th. */
function fixture({ withSource = true } = {}) {
    const data = defaultData();
    data.settings.balanceStart = { cents: 100000, date: '2026-10-01' };
    data.incomes.push(income('inc_a', '2026-10-05', 150000));
    data.expenses.push(expense('exp_a', '2026-10-10', 25000));
    if (withSource) {
        data.incomeSources.push(salarySource());
    }
    return data;
}

test('the anchor month names where it starts, what it started with and what it ends with', () => {
    const lines = monthMoneyLines(fixture(), '2026-10', NOW);
    assert.equal(lines[0], `Starts with ${formatEuro(100000)} (from 1 Oct) · Ends with ${formatEuro(225000)}`);
    assert.equal(lines[1], `Salary: expected ${formatEuro(200000)} on 25 Oct`);
    assert.equal(lines.length, 2);
});

test('a payday that brought more than expected shows the signed difference', () => {
    const data = fixture();
    data.incomes.push(income('inc_b', '2026-10-25', 215000, { sourceId: 'incsrc_a' }));
    const lines = monthMoneyLines(data, '2026-10', AFTER_PAYDAY);
    assert.equal(
        lines[1],
        `Salary: received ${formatEuro(215000)} (expected ${formatEuro(200000)}, ${signedEuro(15000)})`,
    );
});

test('a payday that brought less than expected shows the negative difference', () => {
    const data = fixture();
    data.incomes.push(income('inc_b', '2026-10-25', 190000, { sourceId: 'incsrc_a' }));
    const lines = monthMoneyLines(data, '2026-10', AFTER_PAYDAY);
    assert.ok(lines[1].includes(`(expected ${formatEuro(200000)}, ${signedEuro(-10000)})`), lines[1]);
});

test('a payday that brought exactly the expected amount has no expected note', () => {
    const data = fixture();
    data.incomes.push(income('inc_b', '2026-10-25', 200000, { sourceId: 'incsrc_a' }));
    const lines = monthMoneyLines(data, '2026-10', AFTER_PAYDAY);
    assert.equal(lines[1], `Salary: received ${formatEuro(200000)}`);
    assert.ok(!lines[1].includes('(expected'));
});

test('a payday that passed without an entry reads as due', () => {
    const lines = monthMoneyLines(fixture(), '2026-10', AFTER_PAYDAY);
    assert.equal(lines[1], 'Salary: expected since 25 Oct');
});

test('a skipped month says so', () => {
    const data = fixture({ withSource: false });
    data.incomeSources.push(salarySource({ skippedMonths: ['2026-10'] }));
    const lines = monthMoneyLines(data, '2026-10', NOW);
    assert.equal(lines[1], 'Salary: skipped this month');
});

test('a month before the anchor has no lines', () => {
    assert.deepEqual(monthMoneyLines(fixture(), '2026-09', NOW), []);
});

test('the month after the anchor starts with the closing of the one before, without a from note', () => {
    const lines = monthMoneyLines(fixture(), '2026-11', NOW);
    assert.equal(lines[0], `Starts with ${formatEuro(225000)} · Ends with ${formatEuro(225000)}`);
    assert.ok(!lines[0].includes('(from'));
});

test('a source that has not started yet adds no income line', () => {
    const data = fixture({ withSource: false });
    data.incomeSources.push(salarySource({ startDate: '2026-10-25' }));
    assert.equal(monthMoneyLines(data, '2026-10', NOW).length, 1);
});

test('without an anchor the month has no lines', () => {
    assert.deepEqual(monthMoneyLines(defaultData(), '2026-10', NOW), []);
});

test('moneySummary reads Money now, and nothing without an anchor or before it', () => {
    assert.equal(moneySummary(fixture(), NOW), `Money now ${formatEuro(225000)}`);
    assert.equal(moneySummary(defaultData(), NOW), '');
    assert.equal(moneySummary(fixture(), new Date(2026, 8, 20)), '');
});

test('groupSummary for money is the money summary without a warning', () => {
    const data = fixture();
    assert.deepEqual(groupSummary('money', data, NOW), { text: moneySummary(data, NOW), warn: false });
    assert.deepEqual(groupSummary('money', defaultData(), NOW), { text: '', warn: false });
});
