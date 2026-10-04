import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { freezeMonthPlan, incomeBreakdown, monthTotals } from '../src/budget.js';
import { getMonthReviewSuggestion } from '../src/monthReview.js';

const OCT_4 = new Date(2026, 9, 4);
const OCT_15 = new Date(2026, 9, 15);
const OCT_25 = new Date(2026, 9, 25);

function source(id, expectedCents, dayOfMonth) {
    return {
        id,
        name: id,
        incomeCategoryId: 'salary',
        expectedCents,
        dayOfMonth,
        startDate: '2026-10-01',
        skippedMonths: [],
    };
}

function income(id, date, amountCents, sourceId = '', incomeCategoryId = 'salary') {
    return { id, date, amountCents, incomeCategoryId, note: '', sourceId };
}

function expense(id, date, amountCents) {
    return { id, date, amountCents, categoryId: 'necessary', subcategoryId: 'groceries', note: '' };
}

/** Usual income 200000 stays stored; balanceStart null means the old rule. */
function dataWith({ start = '2026-10-01', sources = [], incomes = [], expenses = [] } = {}) {
    const data = defaultData();
    data.settings.usualMonthlyIncomeCents = 200000;
    data.settings.balanceStart = start === null ? null : { date: start, cents: 100000 };
    data.incomeSources = sources;
    data.incomes = incomes;
    data.expenses = expenses;
    return data;
}

const SALARY = () => source('incsrc_a', 200000, 25);

test('old rule is unchanged: without balanceStart a month with an entry keeps the usual income', () => {
    const data = dataWith({ start: null, incomes: [income('i1', '2026-10-10', 10000)] });
    const totals = monthTotals(data, '2026-10', OCT_15);
    assert.equal(totals.usualIncomeCents, 200000);
    assert.equal(totals.extraIncomeCents, 10000);
    assert.equal(totals.sourceIncomeCents, 0);
    assert.equal(totals.expectedIncomeCents, 0);
    assert.equal(totals.incomeCents, 210000);
});

test('a month with no data before the first month shows no income', () => {
    const data = dataWith({ start: null, expenses: [expense('e1', '2026-10-02', 4000)] });
    for (const monthKey of ['2026-09', '2025-09']) {
        const totals = monthTotals(data, monthKey, OCT_4);
        assert.equal(totals.usualIncomeCents, 0);
        assert.equal(totals.incomeCents, 0);
        assert.equal(totals.cashLeftCents, 0);
    }
    assert.equal(monthTotals(data, '2026-10', OCT_4).incomeCents, 200000);

    const fresh = dataWith({ start: '2026-10-04' });
    const september = monthTotals(fresh, '2026-09', OCT_4);
    assert.equal(september.incomeCents, 0);
    assert.equal(september.cashLeftCents, 0);
});

test('the month review is null for a month the owner never had', () => {
    const data = dataWith({ start: null, expenses: [expense('e1', '2026-10-02', 4000)] });
    assert.equal(getMonthReviewSuggestion(data, OCT_4), null);
    assert.equal(getMonthReviewSuggestion(dataWith({ start: '2026-10-04' }), OCT_4), null);
});

test('new counting: the usual income is not added, the payday is only expected', () => {
    const data = dataWith({ sources: [SALARY()], expenses: [expense('e1', '2026-10-02', 4000)] });
    const mid = monthTotals(data, '2026-10', OCT_15);
    assert.equal(mid.incomeCents, 0);
    assert.equal(mid.usualIncomeCents, 0);
    assert.equal(mid.expectedIncomeCents, 200000);
    assert.equal(mid.cashLeftCents, -4000);

    const payday = monthTotals(data, '2026-10', OCT_25);
    assert.equal(payday.incomeCents, 0);
    assert.equal(payday.expectedIncomeCents, 200000);
    assert.equal(payday.cashLeftCents, -4000);
});

test('an entry tied to the source is source income and ends the expectation', () => {
    const data = dataWith({
        sources: [SALARY()],
        incomes: [income('i1', '2026-10-25', 215000, 'incsrc_a')],
    });
    const totals = monthTotals(data, '2026-10', OCT_25);
    assert.equal(totals.incomeCents, 215000);
    assert.equal(totals.sourceIncomeCents, 215000);
    assert.equal(totals.extraIncomeCents, 0);
    assert.equal(totals.expectedIncomeCents, 0);
});

test('an untagged Salary entry is extra income and does not end the expectation', () => {
    const data = dataWith({
        sources: [SALARY()],
        incomes: [income('i1', '2026-10-25', 200000, '', 'salary')],
    });
    const totals = monthTotals(data, '2026-10', OCT_25);
    assert.equal(totals.incomeCents, 200000);
    assert.equal(totals.extraIncomeCents, 200000);
    assert.equal(totals.sourceIncomeCents, 0);
    assert.equal(totals.expectedIncomeCents, 200000);
});

test('a bonus adds to extra income only', () => {
    const data = dataWith({
        sources: [SALARY()],
        incomes: [
            income('i1', '2026-10-25', 215000, 'incsrc_a'),
            income('i2', '2026-10-26', 10000, '', 'bonus'),
        ],
    });
    const totals = monthTotals(data, '2026-10', OCT_25);
    assert.equal(totals.sourceIncomeCents, 215000);
    assert.equal(totals.extraIncomeCents, 10000);
    assert.equal(totals.incomeCents, 225000);
    assert.equal(totals.expectedIncomeCents, 0);
});

test('the month before the setup month keeps the old rule', () => {
    const data = dataWith({
        sources: [SALARY()],
        incomes: [income('i1', '2026-09-10', 10000)],
    });
    const totals = monthTotals(data, '2026-09', OCT_15);
    assert.equal(totals.usualIncomeCents, 200000);
    assert.equal(totals.incomeCents, 210000);
    assert.equal(totals.expectedIncomeCents, 0);
});

test('expected income is the sources not yet received', () => {
    const data = dataWith({
        sources: [source('incsrc_a', 150000, 5), source('incsrc_b', 50000, 25)],
        incomes: [income('i1', '2026-10-05', 150000, 'incsrc_a')],
    });
    const totals = monthTotals(data, '2026-10', OCT_15);
    assert.equal(totals.incomeCents, 150000);
    assert.equal(totals.expectedIncomeCents, 50000);
});

test('a future month on the new counting shows expected income only', () => {
    const data = dataWith({ sources: [source('incsrc_a', 150000, 5), source('incsrc_b', 50000, 25)] });
    const totals = monthTotals(data, '2026-11', OCT_15);
    assert.equal(totals.incomeCents, 0);
    assert.equal(totals.expectedIncomeCents, 200000);
    assert.equal(totals.cashLeftCents, 0);
});

test('an entry tagged with a deleted source counts as extra income', () => {
    const data = dataWith({
        sources: [SALARY()],
        incomes: [income('i1', '2026-10-25', 200000, 'incsrc_gone')],
    });
    const totals = monthTotals(data, '2026-10', OCT_25);
    assert.equal(totals.extraIncomeCents, 200000);
    assert.equal(totals.sourceIncomeCents, 0);
    assert.equal(totals.expectedIncomeCents, 200000);
});

test('incomeBreakdown on the new counting has no plan row and extra is the untagged total', () => {
    const data = dataWith({
        sources: [SALARY()],
        incomes: [
            income('i1', '2026-10-25', 215000, 'incsrc_a'),
            income('i2', '2026-10-26', 10000, '', 'bonus'),
        ],
    });
    const breakdown = incomeBreakdown(data, '2026-10', OCT_25);
    assert.equal(breakdown.entries.some(({ fromPlan }) => fromPlan), false);
    assert.equal(breakdown.usualIncomeCents, 0);
    assert.equal(breakdown.extraIncomeCents, 10000);
    assert.equal(breakdown.totalCents, 225000);
    assert.deepEqual(Object.keys(breakdown), ['monthKey', 'usualIncomeCents', 'extraIncomeCents', 'totalCents', 'entries']);
});

test('a gap month between two data months keeps the old usual income', () => {
    const data = dataWith({
        start: null,
        expenses: [expense('e1', '2026-07-02', 1000), expense('e2', '2026-10-02', 1000)],
    });
    const totals = monthTotals(data, '2026-09', OCT_4);
    assert.equal(totals.usualIncomeCents, 200000);
    assert.equal(totals.incomeCents, 200000);
});

test('a month with a frozen plan keeps the old usual income', () => {
    const data = dataWith({ start: null, expenses: [expense('e1', '2026-10-02', 1000)] });
    freezeMonthPlan(data, '2026-08');
    assert.equal(monthTotals(data, '2026-08', OCT_4).usualIncomeCents, 200000);
});

test('monthTotals still works without now', () => {
    const data = dataWith({ start: null, incomes: [income('i1', '2026-10-10', 10000)] });
    const totals = monthTotals(data, '2026-10');
    assert.equal(totals.usualIncomeCents, 200000);
    assert.equal(totals.incomeCents, 210000);
    assert.equal(incomeBreakdown(data, '2026-10').totalCents, 210000);
});
