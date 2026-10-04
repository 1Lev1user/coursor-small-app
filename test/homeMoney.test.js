import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVINGS_ID, UNCATEGORISED_ID, defaultData } from '../src/model.js';
import { monthTotals } from '../src/budget.js';
import { formatEuro } from '../src/money.js';
import {
    applyBankCheck,
    checkPreview,
    perDayText,
    savedText,
    signedEuro,
} from '../src/views/homeMoney.js';
import { homeBudgetText, homeFigureModel } from '../src/views/add.js';

const NOW = new Date(2026, 9, 15);

function expense(id, date, amountCents, overrides = {}) {
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
        ...overrides,
    };
}

function income(id, date, amountCents) {
    return { id, incomeCategoryId: 'salary', amountCents, note: '', date, sourceId: '' };
}

function salarySource() {
    return {
        id: 'incsrc_a',
        name: 'Salary',
        incomeCategoryId: 'salary',
        expectedCents: 200000,
        dayOfMonth: 25,
        startDate: '2026-10-01',
        skippedMonths: [],
    };
}

/** Money now is 225000 on 15 Oct 2026. */
function fixture({ withSource = false } = {}) {
    const data = defaultData();
    data.settings.balanceStart = { cents: 100000, date: '2026-10-01' };
    data.incomes.push(income('inc_a', '2026-10-05', 150000));
    data.expenses.push(expense('exp_a', '2026-10-10', 25000));
    if (withSource) {
        data.incomeSources.push(salarySource());
    }
    return data;
}

test('signedEuro puts a plus sign on positive amounts only', () => {
    assert.equal(signedEuro(1500), `+${formatEuro(1500)}`);
    assert.equal(signedEuro(0), formatEuro(0));
    assert.equal(signedEuro(-1500), formatEuro(-1500));
});

test('perDayText automatic names the days and the next payday', () => {
    assert.equal(
        perDayText(fixture({ withSource: true }), NOW),
        `${formatEuro(22500)} a day for 10 days until payday 25 Oct`,
    );
});

test('perDayText automatic without a payday counts to the end of the month', () => {
    assert.equal(
        perDayText(fixture(), NOW),
        `${formatEuro(Math.floor(225000 / 17))} a day for 17 days until the end of the month`,
    );
});

test('perDayText says 1 day in the singular', () => {
    const data = fixture({ withSource: true });
    assert.equal(
        perDayText(data, new Date(2026, 9, 24)),
        `${formatEuro(225000)} a day for 1 day until payday 25 Oct`,
    );
});

test('perDayText says nothing is left when Money now is negative', () => {
    const data = fixture({ withSource: true });
    data.expenses.push(expense('exp_big', '2026-10-12', 300000));
    assert.equal(perDayText(data, NOW), 'Nothing left per day until payday 25 Oct');
});

test('perDayText fixed shows what is left of today, or the overspend', () => {
    const data = fixture();
    data.settings.perDayMode = 'fixed';
    data.settings.perDayFixedCents = 3000;
    data.expenses.push(expense('exp_today', '2026-10-15', 1200));
    assert.equal(perDayText(data, NOW), `${formatEuro(1800)} left of today's ${formatEuro(3000)}`);

    data.expenses.push(expense('exp_more', '2026-10-15', 3300));
    assert.equal(perDayText(data, NOW), `${formatEuro(1500)} over today's ${formatEuro(3000)}`);
});

test('perDayText and savedText are null without an anchor or before it', () => {
    const empty = defaultData();
    assert.equal(perDayText(empty, NOW), null);
    assert.equal(savedText(empty, NOW), null);
    assert.equal(perDayText(fixture(), new Date(2026, 8, 20)), null);
});

test('savedText appears only when something was put into Savings', () => {
    const data = fixture();
    assert.equal(savedText(data, NOW), null);
    data.expenses.push(expense('exp_sav', '2026-10-12', 10000, { categoryId: SAVINGS_ID }));
    assert.equal(savedText(data, NOW), `Put into Savings since 1 Oct: ${formatEuro(10000)}`);
});

test('checkPreview reports a match, a higher and a lower amount', () => {
    const data = fixture();
    assert.deepEqual(checkPreview(data, '2250.00', NOW), {
        ok: true,
        enteredCents: 225000,
        moneyCents: 225000,
        differenceCents: 0,
        text: 'Matches the app. Nothing will be added.',
    });

    const higher = checkPreview(data, '2300.00', NOW);
    assert.equal(higher.differenceCents, 5000);
    assert.equal(
        higher.text,
        `The app shows ${formatEuro(225000)}. The difference ${signedEuro(5000)} is added as an income in Other dated today, and counts in this month.`,
    );

    const lower = checkPreview(data, '2200.00', NOW);
    assert.equal(lower.differenceCents, -5000);
    assert.ok(lower.text.includes(`The difference ${signedEuro(-5000)} is added as an expense in Uncategorised`));
});

test('checkPreview refuses bad text and a missing anchor, and never changes the data', () => {
    const data = fixture();
    assert.deepEqual(checkPreview(data, 'abc', NOW), {
        ok: false,
        reason: 'Enter an amount such as 1250.00 or -40.00.',
    });
    assert.deepEqual(checkPreview(defaultData(), '10', NOW), {
        ok: false,
        reason: 'Set up Money now first.',
    });

    const before = JSON.stringify(data);
    checkPreview(data, '2300.00', NOW);
    checkPreview(data, '2200.00', NOW);
    assert.equal(JSON.stringify(data), before);
});

test('homeBudgetText reads left to spend and over budget', () => {
    const left = { budgetLeftCents: 40000, budgetSpentCents: 60000, budgetCents: 100000, outsideBudgetCents: 0 };
    assert.equal(
        homeBudgetText(homeFigureModel(left)),
        `Month budget: ${formatEuro(40000)} left to spend · ${formatEuro(60000)} spent of ${formatEuro(100000)}`,
    );

    const over = { ...left, budgetLeftCents: -2500, budgetSpentCents: 102500, outsideBudgetCents: 10000 };
    assert.equal(
        homeBudgetText(homeFigureModel(over)),
        `Month budget: over budget by ${formatEuro(2500)} · ${formatEuro(102500)} spent of ${formatEuro(100000)} · ${formatEuro(10000)} saved`,
    );
});

test('homeBudgetText works on real month totals', () => {
    const text = homeBudgetText(homeFigureModel(monthTotals(fixture(), '2026-10')));
    assert.ok(text.startsWith('Month budget: '));
});

test('applyBankCheck keeps the entry when the save works', () => {
    const data = fixture();
    const result = applyBankCheck(data, '2200.00', () => true, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.differenceCents, -5000);
    assert.equal(data.expenses.length, 2);
    assert.equal(data.expenses[1].categoryId, UNCATEGORISED_ID);
    assert.ok(Object.hasOwn(data.monthPlans, '2026-10'));
});

test('applyBankCheck rolls back a lower amount when the save fails', () => {
    const data = fixture();
    const result = applyBankCheck(data, '2200.00', () => false, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.rolledBack, true);
    assert.equal(data.expenses.length, 1);
    assert.equal(data.incomes.length, 1);
    assert.equal(Object.hasOwn(data.monthPlans, '2026-10'), false);
});

test('applyBankCheck rolls back a higher amount when the save fails', () => {
    const data = fixture();
    const result = applyBankCheck(data, '2300.00', () => false, NOW);
    assert.equal(result.ok, false);
    assert.equal(data.incomes.length, 1);
    assert.equal(data.expenses.length, 1);
    assert.equal(Object.hasOwn(data.monthPlans, '2026-10'), false);
});

test('applyBankCheck keeps a month plan that was frozen before', () => {
    const probe = fixture();
    applyBankCheck(probe, '2200.00', () => true, NOW);
    const frozen = probe.monthPlans['2026-10'];

    const data = fixture();
    data.monthPlans['2026-10'] = frozen;
    applyBankCheck(data, '2200.00', () => false, NOW);
    assert.equal(data.monthPlans['2026-10'], frozen);
    assert.equal(data.expenses.length, 1);
});

test('applyBankCheck adds nothing and does not save when the amounts match', () => {
    const data = fixture();
    let saves = 0;
    const result = applyBankCheck(data, '2250.00', () => { saves += 1; return true; }, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.differenceCents, 0);
    assert.equal(saves, 0);
    assert.equal(data.expenses.length, 1);
    assert.equal(data.incomes.length, 1);
});

test('applyBankCheck refuses bad text without changing anything', () => {
    const data = fixture();
    const result = applyBankCheck(data, 'abc', () => true, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'Enter an amount such as 1250.00 or -40.00.');
    assert.equal(data.expenses.length, 1);
});
