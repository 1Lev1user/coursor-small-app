import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { MAX_INCOME_SOURCES, canAddIncomeSource } from '../src/limits.js';
import {
    CATCH_UP_MONTHS,
    PAYDAY_MATCH_DAYS,
    addIncomeSource,
    countingStartMonth,
    deleteIncomeSource,
    dueIncomes,
    earliestDataMonth,
    firstTrackedMonth,
    incomeStatus,
    monthIncomeSplit,
    paydayDate,
    skipIncomeMonth,
    suggestIncomeSource,
    updateIncomeSource,
    usesNewCounting,
    validateIncomeSource,
} from '../src/incomeSources.js';

function source(overrides = {}) {
    return {
        id: 'incsrc_a',
        name: 'Main job',
        incomeCategoryId: 'salary',
        expectedCents: 200000,
        dayOfMonth: 25,
        startDate: '2026-10-01',
        skippedMonths: [],
        ...overrides,
    };
}

function income(id, date, amountCents, sourceId = '', categoryId = 'salary') {
    return { id, date, amountCents, categoryId, note: '', sourceId };
}

function dataWith({ start = '2026-10-01', sources = [source()], incomes = [] } = {}) {
    const data = defaultData();
    data.settings.balanceStart = start === null ? null : { date: start, cents: 100000 };
    data.incomeSources = sources;
    data.incomes = incomes;
    return data;
}

const FORM = { name: 'Main job', amount: '2000', dayOfMonth: '25', incomeCategoryId: 'salary' };

test('limit is 10 sources and the 11th is refused with a reason', () => {
    assert.equal(MAX_INCOME_SOURCES, 10);
    const data = defaultData();
    data.incomeSources = Array.from({ length: 9 }, (_, i) => source({ id: `s${i}` }));
    assert.deepEqual(canAddIncomeSource(data), { ok: true });
    data.incomeSources.push(source({ id: 's9' }));
    assert.deepEqual(canAddIncomeSource(data), {
        ok: false,
        reason: 'You can have at most 10 income sources.',
    });
});

test('counting starts in the month of balanceStart and not before', () => {
    const none = dataWith({ start: null });
    assert.equal(countingStartMonth(none), '');
    assert.equal(usesNewCounting(none, '2026-10'), false);
    assert.equal(usesNewCounting(none, '2030-01'), false);

    const data = dataWith({ start: '2026-10-15' });
    assert.equal(countingStartMonth(data), '2026-10');
    assert.equal(usesNewCounting(data, '2026-09'), false);
    assert.equal(usesNewCounting(data, '2026-10'), true);
    assert.equal(usesNewCounting(data, '2027-01'), true);
    assert.equal(usesNewCounting(data, null), false);
    assert.equal(usesNewCounting(data, 'bad'), false);
});

test('paydayDate is the set date, clamped to the month length', () => {
    assert.equal(paydayDate('2026-11', source({ dayOfMonth: 31 })), '2026-11-30');
    assert.equal(paydayDate('2027-02', source({ dayOfMonth: 30 })), '2027-02-28');
    assert.equal(paydayDate('2026-10', source({ dayOfMonth: 25 })), '2026-10-25');
    // 2026-11-01 is a Sunday: the date stays the date.
    assert.equal(paydayDate('2026-11', source({ dayOfMonth: 1 })), '2026-11-01');
});

test('incomeStatus: upcoming before payday, due on payday', () => {
    const data = dataWith();
    const early = incomeStatus(data, '2026-10', new Date(2026, 9, 15));
    assert.deepEqual(early, [{
        sourceId: 'incsrc_a',
        name: 'Main job',
        incomeCategoryId: 'salary',
        date: '2026-10-25',
        expectedCents: 200000,
        receivedCents: 0,
        entryIds: [],
        state: 'upcoming',
    }]);
    assert.equal(incomeStatus(data, '2026-10', new Date(2026, 9, 25))[0].state, 'due');
    assert.equal(incomeStatus(data, '2026-10', new Date(2026, 9, 26))[0].state, 'due');
});

test('incomeStatus is empty before balanceStart or without it, and keeps source order', () => {
    const now = new Date(2026, 9, 15);
    assert.deepEqual(incomeStatus(dataWith(), '2026-09', now), []);
    assert.deepEqual(incomeStatus(dataWith({ start: null }), '2026-10', now), []);
    assert.deepEqual(incomeStatus(dataWith(), 'bad', now), []);

    const data = dataWith({
        sources: [source({ id: 'incsrc_b', name: 'B', dayOfMonth: 25 }), source({ id: 'incsrc_c', name: 'C', dayOfMonth: 5 })],
    });
    assert.deepEqual(incomeStatus(data, '2026-10', now).map((item) => item.sourceId), ['incsrc_b', 'incsrc_c']);
});

test('incomeStatus: only tagged entries count as received', () => {
    const now = new Date(2026, 9, 28);
    const tagged = dataWith({ incomes: [income('i1', '2026-10-25', 215000, 'incsrc_a')] });
    const [item] = incomeStatus(tagged, '2026-10', now);
    assert.equal(item.state, 'received');
    assert.equal(item.receivedCents, 215000);
    assert.deepEqual(item.entryIds, ['i1']);

    const twice = dataWith({
        incomes: [income('i1', '2026-10-25', 100000, 'incsrc_a'), income('i2', '2026-10-26', 50000, 'incsrc_a')],
    });
    const [sum] = incomeStatus(twice, '2026-10', now);
    assert.equal(sum.receivedCents, 150000);
    assert.deepEqual(sum.entryIds, ['i1', 'i2']);

    // Same category and amount, but no tag: no guessing.
    const untagged = dataWith({ incomes: [income('i3', '2026-10-25', 200000)] });
    const [open] = incomeStatus(untagged, '2026-10', now);
    assert.equal(open.state, 'due');
    assert.equal(open.receivedCents, 0);

    // A tag of a deleted or unknown source is received for nobody.
    const orphan = dataWith({ incomes: [income('i4', '2026-10-25', 200000, 'incsrc_gone')] });
    assert.equal(incomeStatus(orphan, '2026-10', now)[0].state, 'due');

    // An entry of another month does not count.
    const other = dataWith({ incomes: [income('i5', '2026-11-02', 200000, 'incsrc_a')] });
    assert.equal(incomeStatus(other, '2026-10', now)[0].state, 'due');
});

test('incomeStatus: no item on or before startDate, an item the next month', () => {
    const data = dataWith({ sources: [source({ startDate: '2026-10-25' })] });
    const now = new Date(2026, 10, 3);
    assert.deepEqual(incomeStatus(data, '2026-10', now), []);
    const [november] = incomeStatus(data, '2026-11', now);
    assert.equal(november.date, '2026-11-25');
    assert.equal(november.state, 'upcoming');

    const empty = dataWith({ sources: [source({ startDate: '' })] });
    assert.equal(incomeStatus(empty, '2026-10', now).length, 1);
});

test('skipIncomeMonth marks the month skipped, once, and hides it from dueIncomes', () => {
    const data = dataWith();
    const now = new Date(2026, 9, 28);
    assert.equal(skipIncomeMonth(data, 'incsrc_a', '2026-10'), true);
    assert.equal(skipIncomeMonth(data, 'incsrc_a', '2026-10'), true);
    assert.deepEqual(data.incomeSources[0].skippedMonths, ['2026-10']);
    assert.equal(incomeStatus(data, '2026-10', now)[0].state, 'skipped');
    assert.deepEqual(dueIncomes(data, now), []);
    assert.equal(skipIncomeMonth(data, 'incsrc_none', '2026-10'), false);
    assert.equal(skipIncomeMonth(data, 'incsrc_a', 'bad'), false);
});

test('dueIncomes catches up a payday that passed while the app was closed', () => {
    const data = dataWith();
    const due = dueIncomes(data, new Date(2026, 10, 3));
    assert.equal(due.length, 1);
    assert.equal(due[0].source.id, 'incsrc_a');
    assert.equal(due[0].monthKey, '2026-10');
    assert.equal(due[0].date, '2026-10-25');
    assert.equal(due[0].expectedCents, 200000);
    assert.deepEqual(dueIncomes(dataWith({ start: null }), new Date(2026, 10, 3)), []);
});

test('dueIncomes lists the oldest payday first across sources', () => {
    const data = dataWith({
        sources: [source({ id: 'incsrc_a', dayOfMonth: 25 }), source({ id: 'incsrc_b', dayOfMonth: 5 })],
    });
    const due = dueIncomes(data, new Date(2026, 10, 10));
    assert.deepEqual(
        due.map((item) => item.date),
        ['2026-10-05', '2026-10-25', '2026-11-05'],
    );
    assert.deepEqual(due.map((item) => item.source.id), ['incsrc_b', 'incsrc_a', 'incsrc_b']);
});

test('dueIncomes looks back at most CATCH_UP_MONTHS months', () => {
    assert.equal(CATCH_UP_MONTHS, 12);
    const due = dueIncomes(dataWith(), new Date(2028, 2, 10));
    assert.equal(due[0].monthKey, '2027-04');
    assert.equal(due.length, 11);
    assert.equal(due.at(-1).monthKey, '2028-02');
});

test('monthIncomeSplit separates tagged from untagged income', () => {
    const data = dataWith({
        incomes: [
            income('i1', '2026-10-25', 200000, 'incsrc_a'),
            income('i2', '2026-10-12', 3000),
            income('i3', '2026-10-13', 700, 'incsrc_gone'),
            income('i4', '2026-11-01', 999, 'incsrc_a'),
        ],
    });
    assert.deepEqual(monthIncomeSplit(data, '2026-10'), {
        sourceIncomeCents: 200000,
        extraIncomeCents: 3700,
        totalCents: 203700,
    });
    assert.deepEqual(monthIncomeSplit(data, '2026-09'), {
        sourceIncomeCents: 0,
        extraIncomeCents: 0,
        totalCents: 0,
    });
});

test('suggestIncomeSource matches within 5 days of payday in the same month, any amount', () => {
    assert.equal(PAYDAY_MATCH_DAYS, 5);
    const data = dataWith();
    const now = new Date(2026, 9, 31);
    const row = (date, extra = {}) => ({ date, direction: 'in', amountCents: 300000, ...extra });
    assert.equal(suggestIncomeSource(data, row('2026-10-22', { amountCents: 300 }), new Set(), now).id, 'incsrc_a');
    assert.equal(suggestIncomeSource(data, row('2026-10-30'), new Set(), now).id, 'incsrc_a');
    assert.equal(suggestIncomeSource(data, row('2026-10-20'), new Set(), now).id, 'incsrc_a');
    assert.equal(suggestIncomeSource(data, row('2026-10-31'), new Set(), now), null);
    assert.equal(suggestIncomeSource(data, row('2026-10-19'), new Set(), now), null);
    assert.equal(suggestIncomeSource(data, row('2026-10-10'), new Set(), now), null);
    assert.equal(suggestIncomeSource(data, row('2026-10-25', { direction: 'out' }), new Set(), now), null);
    assert.equal(suggestIncomeSource(data, row('2026-09-25'), new Set(), now), null);
    assert.equal(suggestIncomeSource(data, row('not a date'), new Set(), now), null);
    assert.equal(suggestIncomeSource(data, row(undefined), new Set(), now), null);
    // 1 Nov is 7 days from 25 Oct: paydays are not matched across months.
    assert.equal(suggestIncomeSource(data, row('2026-11-01'), new Set(), new Date(2026, 10, 1)), null);
});

test('suggestIncomeSource asks once per month and not for a received payday', () => {
    const now = new Date(2026, 9, 31);
    const row = { date: '2026-10-25', direction: 'in' };
    const tied = dataWith({ incomes: [income('i1', '2026-10-25', 200000, 'incsrc_a')] });
    assert.equal(suggestIncomeSource(tied, row, new Set(), now), null);

    const data = dataWith();
    assert.equal(suggestIncomeSource(data, row, new Set(['incsrc_a:2026-10']), now), null);
    assert.equal(suggestIncomeSource(data, row, new Set(['incsrc_a:2026-11']), now).id, 'incsrc_a');

    const skipped = dataWith({ sources: [source({ skippedMonths: ['2026-10'] })] });
    assert.equal(suggestIncomeSource(skipped, row, new Set(), now).id, 'incsrc_a');
    // Upcoming (now is before payday) may ask as well.
    assert.equal(suggestIncomeSource(data, row, new Set(), new Date(2026, 9, 1)).id, 'incsrc_a');
});

test('suggestIncomeSource picks the closest payday, the earlier source on a tie', () => {
    const now = new Date(2026, 9, 31);
    const data = dataWith({
        sources: [source({ id: 'incsrc_a', dayOfMonth: 20 }), source({ id: 'incsrc_b', dayOfMonth: 25 })],
    });
    assert.equal(suggestIncomeSource(data, { date: '2026-10-24', direction: 'in' }, new Set(), now).id, 'incsrc_b');
    assert.equal(suggestIncomeSource(data, { date: '2026-10-21', direction: 'in' }, new Set(), now).id, 'incsrc_a');
    // 22 Oct is 2 days from both day 24 and day 20.
    const tie = dataWith({
        sources: [source({ id: 'incsrc_a', dayOfMonth: 24 }), source({ id: 'incsrc_b', dayOfMonth: 20 })],
    });
    assert.equal(suggestIncomeSource(tie, { date: '2026-10-22', direction: 'in' }, new Set(), now).id, 'incsrc_a');
});

test('validateIncomeSource checks name, amount, day and category in that order', () => {
    const fail = (fields, field, reason) => assert.deepEqual(
        validateIncomeSource({ ...FORM, ...fields }),
        { ok: false, field, reason },
    );
    fail({ name: '' }, 'name', 'Enter a name.');
    fail({ name: '   ' }, 'name', 'Enter a name.');
    fail({ name: 'x'.repeat(41) }, 'name', 'Enter a name.');
    fail({ amount: '0' }, 'amount', 'Enter a valid amount greater than zero.');
    fail({ amount: 'abc' }, 'amount', 'Enter a valid amount greater than zero.');
    for (const day of ['0', '32', '7.5', '', 'x']) {
        fail({ dayOfMonth: day }, 'day', 'Enter a day from 1 to 31.');
    }
    fail({ incomeCategoryId: '' }, 'category', 'Choose an income category.');
    fail({ name: '', amount: '', dayOfMonth: '', incomeCategoryId: '' }, 'name', 'Enter a name.');
    fail({ amount: '', dayOfMonth: '', incomeCategoryId: '' }, 'amount', 'Enter a valid amount greater than zero.');
    fail({ dayOfMonth: '', incomeCategoryId: '' }, 'day', 'Enter a day from 1 to 31.');

    assert.deepEqual(validateIncomeSource({ ...FORM, name: ` ${'x'.repeat(40)} ` }).value.name, 'x'.repeat(40));
    assert.deepEqual(validateIncomeSource({ ...FORM, name: '  Side job ', amount: '1500,50', dayOfMonth: '31' }), {
        ok: true,
        value: { name: 'Side job', expectedCents: 150050, dayOfMonth: 31, incomeCategoryId: 'salary' },
    });
});

test('addIncomeSource sets startDate and refuses the 11th source', () => {
    const data = defaultData();
    const value = { name: 'Main job', expectedCents: 200000, dayOfMonth: 25, incomeCategoryId: 'salary' };
    const copy = { ...value };
    const result = addIncomeSource(data, value, new Date(2026, 9, 4));
    assert.equal(result.ok, true);
    assert.match(result.source.id, /^incsrc_/);
    assert.equal(result.source.startDate, '2026-10-04');
    assert.deepEqual(result.source.skippedMonths, []);
    assert.deepEqual(data.incomeSources, [result.source]);
    assert.deepEqual(value, copy);
    assert.equal(Object.keys(result.source).some((key) => /weekend/i.test(key)), false);

    for (let i = 1; i < MAX_INCOME_SOURCES; i += 1) {
        assert.equal(addIncomeSource(data, value, new Date(2026, 9, 4)).ok, true);
    }
    const refused = addIncomeSource(data, value, new Date(2026, 9, 4));
    assert.deepEqual(refused, { ok: false, reason: 'You can have at most 10 income sources.' });
    assert.equal(data.incomeSources.length, 10);
});

test('updateIncomeSource keeps startDate and skippedMonths; deleteIncomeSource keeps the entries', () => {
    const data = dataWith({
        sources: [source({ skippedMonths: ['2026-10'] })],
        incomes: [income('i1', '2026-10-25', 200000, 'incsrc_a')],
    });
    const body = { name: 'New name', expectedCents: 300000, dayOfMonth: 1, incomeCategoryId: 'income-other' };
    assert.equal(updateIncomeSource(data, 'incsrc_a', body), true);
    assert.deepEqual(data.incomeSources[0], {
        id: 'incsrc_a',
        ...body,
        startDate: '2026-10-01',
        skippedMonths: ['2026-10'],
    });
    assert.equal(updateIncomeSource(data, 'incsrc_none', body), false);

    assert.equal(deleteIncomeSource(data, 'incsrc_none'), false);
    assert.equal(deleteIncomeSource(data, 'incsrc_a'), true);
    assert.deepEqual(data.incomeSources, []);
    assert.equal(data.incomes.length, 1);
    assert.deepEqual(monthIncomeSplit(data, '2026-10').extraIncomeCents, 200000);
});

test('earliestDataMonth and firstTrackedMonth', () => {
    const now = new Date(2026, 9, 4);
    const nothing = dataWith({ start: null });
    assert.equal(earliestDataMonth(nothing), '');
    assert.equal(firstTrackedMonth(nothing, now), '2026-10');

    const startOnly = dataWith({ start: '2026-08-10' });
    assert.equal(earliestDataMonth(startOnly), '');
    assert.equal(firstTrackedMonth(startOnly, now), '2026-08');

    const planOnly = dataWith({ start: null });
    planOnly.monthPlans = { '2026-06': {}, '2026-07': {}, junk: {} };
    assert.equal(earliestDataMonth(planOnly), '2026-06');
    assert.equal(firstTrackedMonth(planOnly, now), '2026-06');

    const withData = dataWith({ start: '2026-08-10', incomes: [income('i1', '2026-05-02', 100)] });
    withData.expenses = [{ id: 'e1', date: '2026-03-09', amountCents: 5 }, { id: 'e2', date: 'bad', amountCents: 5 }];
    withData.monthPlans = { '2026-09': {} };
    assert.equal(earliestDataMonth(withData), '2026-03');
    assert.equal(firstTrackedMonth(withData, now), '2026-03');
});
