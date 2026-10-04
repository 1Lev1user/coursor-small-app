import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { formatEuro } from '../src/money.js';
import { shortDate } from '../src/months.js';
import {
    confirmIncome,
    dueIncomes,
    incomeStatus,
    skipIncomeMonth,
} from '../src/incomeSources.js';
import { reminderTitle } from '../src/views/paydayReminder.js';
import { incomeFormNote } from '../src/views/add.js';

const NOW = new Date(2026, 9, 26, 12);
const NOW2 = new Date(2026, 10, 3, 12);
const PAYDAY_TODAY = new Date(2026, 9, 25, 12);
const WRONG_AMOUNT = {
    ok: false,
    field: 'amount',
    reason: 'Enter a valid amount greater than zero.',
};

function source(overrides = {}) {
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

function dataWith({ sources = [source()], incomes = [] } = {}) {
    const data = defaultData();
    data.settings.balanceStart = { date: '2026-10-01', cents: 100000 };
    data.incomeSources = sources;
    data.incomes = incomes;
    return data;
}

test('confirmIncome pushes one tagged entry dated the payday and returns it', () => {
    const data = dataWith();
    const result = confirmIncome(data, data.incomeSources[0], '2026-10', { amountText: '2150,00' });
    assert.equal(result.ok, true);
    assert.equal(data.incomes.length, 1);
    assert.equal(data.incomes[0], result.entry);
    assert.match(result.entry.id, /^inc/);
    assert.deepEqual(
        { ...result.entry, id: 'x' },
        {
            id: 'x',
            incomeCategoryId: 'salary',
            amountCents: 215000,
            note: 'Salary',
            date: '2026-10-25',
            sourceId: 'incsrc_a',
        },
    );
});

test('a confirmed month is received with the typed amount and leaves dueIncomes', () => {
    const data = dataWith();
    assert.equal(dueIncomes(data, NOW).length, 1);
    confirmIncome(data, data.incomeSources[0], '2026-10', { amountText: '2150.00' });
    const [item] = incomeStatus(data, '2026-10', NOW);
    assert.equal(item.state, 'received');
    assert.equal(item.receivedCents, 215000);
    assert.deepEqual(dueIncomes(data, NOW), []);
});

test('a missed month is dated its payday, not the day it was confirmed', () => {
    const data = dataWith();
    assert.equal(dueIncomes(data, NOW2).length, 1);
    const { entry } = confirmIncome(data, data.incomeSources[0], '2026-10', { amountText: '2000' });
    assert.equal(entry.date, '2026-10-25');
    assert.equal(incomeStatus(data, '2026-10', NOW2)[0].state, 'received');
});

test('a zero, a word or an empty amount is refused and nothing is pushed', () => {
    for (const amountText of ['0', 'abc', '']) {
        const data = dataWith();
        const result = confirmIncome(data, data.incomeSources[0], '2026-10', { amountText });
        assert.deepEqual(result, WRONG_AMOUNT);
        assert.deepEqual(data.incomes, []);
    }
});

test('skipping a month removes the item from dueIncomes', () => {
    const data = dataWith();
    assert.equal(skipIncomeMonth(data, 'incsrc_a', '2026-10'), true);
    assert.deepEqual(dueIncomes(data, NOW), []);
});

test('reminderTitle names the payday today and the date of an earlier one', () => {
    const data = dataWith();
    const [today] = dueIncomes(data, PAYDAY_TODAY);
    assert.equal(today.date, '2026-10-25');
    assert.equal(reminderTitle(today, PAYDAY_TODAY), `Salary expected today: ${formatEuro(200000)}`);
    const [earlier] = dueIncomes(data, NOW);
    assert.equal(
        reminderTitle(earlier, NOW),
        `Salary expected on ${shortDate('2026-10-25')}: ${formatEuro(200000)}`,
    );
});

test('incomeFormNote differs with and without regular incomes', () => {
    assert.equal(
        incomeFormNote(dataWith()),
        'Pick the regular income this is, so it counts as received for that month. Choose Other income for a bonus or a gift.',
    );
    assert.equal(
        incomeFormNote(dataWith({ sources: [] })),
        'Add any income here, such as a bonus or a gift.',
    );
});

test('an untagged entry or one tagged with another source does not close the item', () => {
    const untagged = {
        id: 'inc_1',
        date: '2026-10-25',
        amountCents: 200000,
        incomeCategoryId: 'salary',
        note: '',
        sourceId: '',
    };
    const other = { ...untagged, id: 'inc_2', sourceId: 'incsrc_other' };
    const data = dataWith({ incomes: [untagged, other] });
    assert.equal(dueIncomes(data, NOW).length, 1);
    assert.equal(incomeStatus(data, '2026-10', NOW)[0].state, 'due');
});

test('confirmIncome accepts a comma amount and never touches monthPlans', () => {
    const data = dataWith();
    const before = JSON.stringify(data.monthPlans);
    const { entry } = confirmIncome(data, data.incomeSources[0], '2026-10', { amountText: '1999,99' });
    assert.equal(entry.amountCents, 199999);
    assert.equal(JSON.stringify(data.monthPlans), before);
});
