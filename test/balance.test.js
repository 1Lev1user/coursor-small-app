import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVINGS_ID, UNCATEGORISED_ID, defaultData } from '../src/model.js';
import { monthTotals } from '../src/budget.js';
import {
    balanceAt,
    checkAgainstBank,
    monthBalance,
    moneyNow,
    nextPayday,
    parseBalanceInput,
    perDay,
    savedCents,
    setMoneyNow,
    setPerDay,
} from '../src/balance.js';

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

function income(id, date, amountCents, overrides = {}) {
    return { id, incomeCategoryId: 'salary', amountCents, note: '', date, sourceId: '', ...overrides };
}

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

function fixture() {
    const data = defaultData();
    data.settings.balanceStart = { cents: 100000, date: '2026-10-01' };
    data.incomes.push(income('inc_a', '2026-10-05', 150000));
    data.expenses.push(expense('exp_a', '2026-10-10', 25000));
    return data;
}

test('parseBalanceInput reads signed amounts and refuses the rest', () => {
    assert.equal(parseBalanceInput('-12,50'), -1250);
    assert.equal(parseBalanceInput('12,50'), 1250);
    assert.equal(parseBalanceInput('0'), 0);
    assert.equal(parseBalanceInput('abc'), null);
    assert.equal(parseBalanceInput(''), null);
    assert.equal(parseBalanceInput('-'), null);
    assert.ok(Object.is(parseBalanceInput('-0'), 0));
});

test('balanceAt and moneyNow count income and spending from the anchor date', () => {
    const data = fixture();
    assert.equal(moneyNow(data, NOW), 225000);
    assert.equal(balanceAt(data, '2026-10-15'), 225000);

    data.expenses.push(expense('exp_future', '2026-10-20', 30000));
    assert.equal(moneyNow(data, NOW), 225000);

    data.expenses.push(expense('ref', '2026-10-12', 4000, { refund: true }));
    assert.equal(moneyNow(data, NOW), 229000);
});

test('balanceAt ignores entries before the anchor, counts the anchor date, and has no value before it', () => {
    const data = fixture();
    data.expenses.push(expense('old', '2026-09-30', 7000));
    data.incomes.push(income('old_inc', '2026-09-30', 9000));
    assert.equal(moneyNow(data, NOW), 225000);

    data.expenses.push(expense('on_anchor', '2026-10-01', 1000));
    assert.equal(moneyNow(data, NOW), 224000);

    assert.equal(balanceAt(data, '2026-09-30'), null);
});

test('without an anchor there is no Money now', () => {
    const data = defaultData();
    assert.equal(moneyNow(data, NOW), null);
    assert.equal(balanceAt(data, '2026-10-15'), null);
    assert.equal(savedCents(data, NOW), null);
    assert.equal(perDay(data, NOW), null);
    assert.equal(monthBalance(data, '2026-10'), null);
});

test('setMoneyNow anchors today so Money now equals what was entered', () => {
    const data = defaultData();
    const now = new Date(2026, 9, 4);
    data.expenses.push(expense('exp_today', '2026-10-04', 1000));

    assert.deepEqual(setMoneyNow(data, 125050, now), { ok: true });
    assert.deepEqual(data.settings.balanceStart, { cents: 126050, date: '2026-10-04' });
    assert.equal(moneyNow(data, now), 125050);

    assert.deepEqual(setMoneyNow(data, 5, now), { ok: false, reason: 'Money now is already set.' });
    assert.equal(data.settings.balanceStart.cents, 126050);
});

test('setMoneyNow refuses a value that is not a whole number of cents', () => {
    for (const bad of [1.5, NaN, '100', null, Infinity]) {
        const data = defaultData();
        assert.deepEqual(setMoneyNow(data, bad, NOW), { ok: false, reason: 'Enter a valid amount.' });
        assert.equal(data.settings.balanceStart, null);
    }
});

test('checkAgainstBank with a higher bank amount adds a dated income', () => {
    const data = fixture();
    const septemberBefore = structuredClone(monthTotals(data, '2026-09'));
    const octoberBefore = monthTotals(data, '2026-10');

    const result = checkAgainstBank(data, 230000, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.differenceCents, 5000);
    assert.equal(result.type, 'income');
    assert.equal(result.monthKey, '2026-10');
    assert.equal(result.planWasAlreadyFrozen, false);
    const { id, ...fields } = result.entry;
    assert.match(id, /^inc_/);
    assert.deepEqual(fields, {
        incomeCategoryId: 'income-other',
        amountCents: 5000,
        note: 'Bank difference',
        date: '2026-10-15',
        sourceId: '',
    });
    assert.equal(data.incomes.at(-1), result.entry);

    assert.equal(moneyNow(data, NOW), 230000);
    assert.equal(monthTotals(data, '2026-10').incomeCents - octoberBefore.incomeCents, 5000);
    assert.deepEqual(monthTotals(data, '2026-09'), septemberBefore);
    assert.ok(Object.hasOwn(data.monthPlans, '2026-10'));

    data.incomes = data.incomes.filter((entry) => entry.id !== id);
    assert.equal(moneyNow(data, NOW), 225000);
});

test('checkAgainstBank with a lower bank amount adds an Uncategorised expense', () => {
    const data = fixture();
    const result = checkAgainstBank(data, 220000, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.differenceCents, -5000);
    assert.equal(result.type, 'expense');
    const { id, ...fields } = result.entry;
    assert.match(id, /^exp_/);
    assert.deepEqual(fields, {
        categoryId: UNCATEGORISED_ID,
        subcategoryId: '',
        amountCents: 5000,
        note: 'Bank difference',
        date: '2026-10-15',
        currency: 'EUR',
        originalAmountCents: 5000,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: '',
    });
    assert.equal(data.expenses.at(-1), result.entry);
    assert.equal(moneyNow(data, NOW), 220000);
});

test('checkAgainstBank with the same amount adds nothing', () => {
    const data = fixture();
    const result = checkAgainstBank(data, 225000, NOW);
    assert.deepEqual(result, { ok: true, differenceCents: 0, entry: null });
    assert.equal(data.incomes.length, 1);
    assert.equal(data.expenses.length, 1);
    assert.deepEqual(data.monthPlans, {});
});

test('checkAgainstBank refuses without setup or with a bad number', () => {
    assert.deepEqual(checkAgainstBank(defaultData(), 1000, NOW), {
        ok: false,
        reason: 'Set up Money now first.',
    });
    const data = fixture();
    assert.deepEqual(checkAgainstBank(data, 10.5, NOW), { ok: false, reason: 'Enter a valid amount.' });
    assert.deepEqual(checkAgainstBank(data, null, NOW), { ok: false, reason: 'Enter a valid amount.' });
    assert.equal(data.incomes.length, 1);
    assert.equal(data.expenses.length, 1);
});

test('checkAgainstBank reports whether the month plan was already frozen', () => {
    const data = fixture();
    assert.equal(checkAgainstBank(data, 230000, NOW).planWasAlreadyFrozen, false);
    assert.equal(checkAgainstBank(data, 100000, NOW).planWasAlreadyFrozen, true);
});

test('savings lower Money now and are reported on their own', () => {
    const data = fixture();
    data.expenses.push(expense('sav', '2026-10-12', 10000, { categoryId: SAVINGS_ID }));
    assert.equal(moneyNow(data, NOW), 215000);
    assert.equal(savedCents(data, NOW), 10000);

    data.expenses.push(expense('sav_ref', '2026-10-13', 2000, { categoryId: SAVINGS_ID, refund: true }));
    assert.equal(moneyNow(data, NOW), 217000);
    assert.equal(savedCents(data, NOW), 8000);

    data.expenses.push(expense('sav_future', '2026-10-20', 5000, { categoryId: SAVINGS_ID }));
    data.expenses.push(expense('sav_old', '2026-09-20', 5000, { categoryId: SAVINGS_ID }));
    assert.equal(savedCents(data, NOW), 8000);
});

test('nextPayday is the earliest upcoming payday after today', () => {
    const data = fixture();
    assert.equal(nextPayday(data, NOW), null);

    data.incomeSources = [source()];
    assert.deepEqual(nextPayday(data, NOW), { date: '2026-10-25', sourceId: 'incsrc_a', name: 'Salary' });

    data.incomeSources.push(source({ id: 'incsrc_b', name: 'Side job', dayOfMonth: 20 }));
    assert.deepEqual(nextPayday(data, NOW), { date: '2026-10-20', sourceId: 'incsrc_b', name: 'Side job' });

    data.incomeSources[1].dayOfMonth = 25;
    assert.equal(nextPayday(data, NOW).sourceId, 'incsrc_a');
});

test('nextPayday skips today, received and skipped paydays', () => {
    const data = fixture();
    data.incomeSources = [source()];

    assert.equal(nextPayday(data, new Date(2026, 9, 25)).date, '2026-11-25');

    data.incomes.push(income('inc_salary', '2026-10-24', 200000, { sourceId: 'incsrc_a' }));
    assert.equal(nextPayday(data, NOW).date, '2026-11-25');

    data.incomes = data.incomes.filter((entry) => entry.id !== 'inc_salary');
    data.incomeSources[0].skippedMonths = ['2026-10'];
    assert.equal(nextPayday(data, NOW).date, '2026-11-25');
});

test('nextPayday rolls over from December to January', () => {
    const data = fixture();
    data.incomeSources = [source()];
    assert.equal(nextPayday(data, new Date(2026, 11, 10)).date, '2026-12-25');
    assert.equal(nextPayday(data, new Date(2026, 11, 26)).date, '2027-01-25');
});

test('perDay auto without payday runs to the month end', () => {
    const data = fixture();
    data.settings.perDayFixedCents = 9999;
    assert.deepEqual(perDay(data, NOW), {
        mode: 'auto',
        amountCents: 13235,
        days: 17,
        untilDate: '2026-11-01',
        untilKind: 'monthEnd',
        paydayName: '',
        moneyCents: 225000,
    });
});

test('perDay auto runs to the next payday when there is one', () => {
    const data = fixture();
    data.incomeSources = [source()];
    const result = perDay(data, NOW);
    assert.equal(result.days, 10);
    assert.equal(result.amountCents, 22500);
    assert.equal(result.untilKind, 'payday');
    assert.equal(result.untilDate, '2026-10-25');
    assert.equal(result.paydayName, 'Salary');
});

test('perDay auto looks past an unconfirmed, received or skipped payday', () => {
    const data = fixture();
    data.incomeSources = [source()];
    assert.equal(perDay(data, new Date(2026, 9, 25)).days, 31);

    data.incomes.push(income('inc_salary', '2026-10-14', 200000, { sourceId: 'incsrc_a' }));
    assert.equal(perDay(data, NOW).days, 41);

    data.incomes = data.incomes.filter((entry) => entry.id !== 'inc_salary');
    data.incomeSources[0].skippedMonths = ['2026-10'];
    assert.equal(perDay(data, NOW).days, 41);
});

test('perDay auto has at least one day and rounds a negative amount down', () => {
    const data = fixture();
    assert.equal(perDay(data, new Date(2026, 9, 31)).days, 1);

    const negative = defaultData();
    negative.settings.balanceStart = { cents: -1, date: '2026-10-01' };
    assert.equal(perDay(negative, NOW).amountCents, -1);
});

test('perDay fixed shows what is left of today, without savings', () => {
    const data = fixture();
    data.settings.perDayMode = 'fixed';
    data.settings.perDayFixedCents = 3000;
    data.expenses.push(
        expense('t1', '2026-10-15', 1200),
        expense('t2', '2026-10-15', 200, { refund: true }),
        expense('t3', '2026-10-15', 5000, { categoryId: SAVINGS_ID }),
        expense('t4', '2026-10-14', 900),
        expense('t5', '2026-10-16', 900),
    );
    assert.deepEqual(perDay(data, NOW), {
        mode: 'fixed',
        amountCents: 3000,
        spentTodayCents: 1000,
        leftTodayCents: 2000,
        moneyCents: moneyNow(data, NOW),
    });

    data.settings.perDayFixedCents = 500;
    assert.equal(perDay(data, NOW).leftTodayCents, -500);
});

test('setPerDay saves a mode and a fixed amount, and refuses bad input', () => {
    const data = defaultData();
    assert.deepEqual(setPerDay(data, 'fixed', '30'), { ok: true });
    assert.equal(data.settings.perDayMode, 'fixed');
    assert.equal(data.settings.perDayFixedCents, 3000);

    const reason = 'Enter a valid amount greater than zero.';
    assert.deepEqual(setPerDay(data, 'fixed', '0'), { ok: false, reason });
    assert.deepEqual(setPerDay(data, 'fixed', 'abc'), { ok: false, reason });
    assert.equal(data.settings.perDayFixedCents, 3000);
    assert.equal(data.settings.perDayMode, 'fixed');

    assert.deepEqual(setPerDay(data, 'auto', ''), { ok: true });
    assert.equal(data.settings.perDayMode, 'auto');
    assert.equal(data.settings.perDayFixedCents, 3000);

    assert.deepEqual(setPerDay(data, 'x', '30'), { ok: false, reason: 'Choose a mode.' });
    assert.equal(data.settings.perDayMode, 'auto');
});

test('monthBalance opens and closes each month from the anchor', () => {
    const data = fixture();
    data.expenses.push(expense('later', '2026-10-20', 30000));
    assert.deepEqual(monthBalance(data, '2026-10'), {
        openingCents: 100000,
        closingCents: 195000,
        startsOn: '2026-10-01',
    });
    assert.deepEqual(monthBalance(data, '2026-11'), {
        openingCents: 195000,
        closingCents: 195000,
        startsOn: '2026-11-01',
    });
    assert.equal(monthBalance(data, '2026-09'), null);
});

test('monthBalance starts at the anchor date when the anchor is mid-month', () => {
    const data = defaultData();
    data.settings.balanceStart = { cents: 50000, date: '2026-10-10' };
    data.incomes.push(income('early', '2026-10-05', 99999));
    data.expenses.push(expense('after', '2026-10-12', 1000));
    assert.deepEqual(monthBalance(data, '2026-10'), {
        openingCents: 50000,
        closingCents: 49000,
        startsOn: '2026-10-10',
    });
    assert.equal(monthBalance(data, '2026-11').openingCents, 49000);
});

test('monthBalance chains: each opening equals the previous closing', () => {
    const data = fixture();
    data.expenses.push(expense('nov', '2026-11-03', 12000), expense('dec', '2026-12-31', 3000));
    data.incomes.push(income('dec_inc', '2026-12-01', 8000));
    const oct = monthBalance(data, '2026-10');
    const nov = monthBalance(data, '2026-11');
    const dec = monthBalance(data, '2026-12');
    assert.equal(nov.openingCents, oct.closingCents);
    assert.equal(dec.openingCents, nov.closingCents);
    assert.equal(nov.closingCents, 213000);
    assert.equal(dec.closingCents, 218000);
});
