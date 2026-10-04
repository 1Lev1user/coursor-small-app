import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { moneyNow } from '../src/balance.js';
import { usesNewCounting } from '../src/incomeSources.js';
import { applyMoneySetup } from '../src/views/moneySetup.js';

const NOW = new Date(2026, 9, 4);
const MONEY_REASON = 'Enter an amount such as 1250.00 or -40.00.';

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

function freshData() {
    const data = defaultData();
    data.expenses.push(expense('exp_a', '2026-10-04', 1000));
    return data;
}

function row(name, amount, dayOfMonth) {
    return { name, amount, dayOfMonth };
}

test('writes money now and one payday source', () => {
    const data = freshData();
    const result = applyMoneySetup(data, { moneyText: '1250,50', rows: [row('Salary', '2000', '25')] }, NOW);
    assert.equal(result.ok, true);
    assert.equal(moneyNow(data, NOW), 125050);
    assert.equal(data.settings.balanceStart.date, '2026-10-04');
    assert.equal(data.incomeSources.length, 1);
    const [source] = data.incomeSources;
    assert.equal(source.expectedCents, 200000);
    assert.equal(source.dayOfMonth, 25);
    assert.equal(source.startDate, '2026-10-04');
    assert.equal(source.incomeCategoryId, 'salary');
    assert.equal(usesNewCounting(data, '2026-10'), true);
    assert.equal(usesNewCounting(data, '2026-09'), false);
});

test('an unreadable amount fails on the money field and writes nothing', () => {
    const data = freshData();
    const before = structuredClone(data);
    const result = applyMoneySetup(data, { moneyText: 'abc', rows: [row('Salary', '2000', '25')] }, NOW);
    assert.deepEqual(result, { ok: false, field: 'money', reason: MONEY_REASON });
    assert.deepEqual(data, before);
});

test('a bad day names the row and writes nothing', () => {
    const data = freshData();
    const before = structuredClone(data);
    const result = applyMoneySetup(data, { moneyText: '100', rows: [row('Salary', '2000', '32')] }, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.field, 'day');
    assert.equal(result.rowIndex, 0);
    assert.deepEqual(data, before);
});

test('rows with name, amount and day all empty are ignored', () => {
    const data = freshData();
    const result = applyMoneySetup(
        data,
        { moneyText: '100', rows: [row('', '', ''), row('  ', ' ', '')] },
        NOW,
    );
    assert.equal(result.ok, true);
    assert.equal(data.incomeSources.length, 0);
    assert.equal(moneyNow(data, NOW), 10000);
});

test('a second call says money now is already set and changes nothing', () => {
    const data = freshData();
    applyMoneySetup(data, { moneyText: '100', rows: [row('Salary', '2000', '25')] }, NOW);
    const before = structuredClone(data);
    const result = applyMoneySetup(data, { moneyText: '500', rows: [row('Rent', '300', '1')] }, NOW);
    assert.deepEqual(result, { ok: false, field: 'money', reason: 'Money now is already set.' });
    assert.deepEqual(data, before);
});

test('more than ten non-empty rows fail on the limit and write nothing', () => {
    const data = freshData();
    const before = structuredClone(data);
    const rows = Array.from({ length: 11 }, (_, index) => row(`Job ${index}`, '100', '5'));
    const result = applyMoneySetup(data, { moneyText: '100', rows }, NOW);
    assert.deepEqual(result, {
        ok: false,
        field: 'limit',
        reason: 'You can have at most 10 income sources.',
    });
    assert.deepEqual(data, before);
});

test('the usual monthly income is never changed', () => {
    const data = freshData();
    data.settings.usualMonthlyIncomeCents = 180000;
    const result = applyMoneySetup(data, { moneyText: '100', rows: [row('Salary', '2000', '25')] }, NOW);
    assert.equal(result.ok, true);
    assert.equal(data.settings.usualMonthlyIncomeCents, 180000);
});

test('a failing second row of three leaves no balance and no sources', () => {
    const data = freshData();
    const rows = [row('Salary', '2000', '25'), row('Rent', 'x', '1'), row('Gift', '50', '10')];
    const result = applyMoneySetup(data, { moneyText: '100', rows }, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.field, 'amount');
    assert.equal(result.rowIndex, 1);
    assert.equal(data.settings.balanceStart, null);
    assert.equal(data.incomeSources.length, 0);
});

test('rowIndex counts the original rows, blank ones included', () => {
    const data = freshData();
    const rows = [row('', '', ''), row('Salary', '2000', '25'), row('', '', ''), row('Rent', '300', '99')];
    const result = applyMoneySetup(data, { moneyText: '100', rows }, NOW);
    assert.equal(result.field, 'day');
    assert.equal(result.rowIndex, 3);
});

test('without the salary category the first income category is used', () => {
    const data = freshData();
    data.incomeCategories = data.incomeCategories.filter((category) => category.id !== 'salary');
    const first = data.incomeCategories[0].id;
    const result = applyMoneySetup(data, { moneyText: '100', rows: [row('Pay', '2000', '25')] }, NOW);
    assert.equal(result.ok, true);
    assert.equal(data.incomeSources[0].incomeCategoryId, first);
});

test('the limit counts sources that already exist', () => {
    const data = freshData();
    for (let index = 0; index < 10; index += 1) {
        data.incomeSources.push({
            id: `incsrc_${index}`,
            name: `Old ${index}`,
            incomeCategoryId: 'salary',
            expectedCents: 100,
            dayOfMonth: 1,
            startDate: '2026-01-01',
            skippedMonths: [],
        });
    }
    const result = applyMoneySetup(data, { moneyText: '100', rows: [row('One more', '100', '5')] }, NOW);
    assert.equal(result.field, 'limit');
    assert.equal(data.settings.balanceStart, null);
});
