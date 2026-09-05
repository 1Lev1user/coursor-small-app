import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, UNCATEGORISED_ID } from '../src/model.js';
import {
    resolvePlan,
    canSetPinned,
    buildPlanSnapshot,
    getMonthPlan,
    freezeMonthPlan,
    refreshCurrentMonthPlan,
    monthTotals,
    subcategoryTotals,
    incomeBreakdown,
    percentFromEuroCents,
    euroCentsFromPercent,
    syncCategoryPlanFields,
} from '../src/budget.js';

function expense(id, categoryId, amountCents, date, subcategoryId = '') {
    return { id, categoryId, subcategoryId, amountCents, note: '', date };
}

function income(id, amountCents, date) {
    return {
        id,
        incomeCategoryId: 'income-other',
        amountCents,
        note: '',
        date,
    };
}

test('resolvePlan splits leftover equally in original order and rounds only through splitShares', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    const savings = data.categories.find(({ id }) => id === 'savings');
    savings.limitMode = 'percent';
    savings.percent = 10;

    const plan = resolvePlan(data.categories, data.settings.monthlyBudgetCents);

    assert.deepEqual(plan.entries, [
        {
            id: 'necessary',
            name: 'Necessary expenses',
            pinned: false,
            percent: 22.5,
            limitCents: 22500,
        },
        {
            id: 'subscriptions',
            name: 'Subscriptions',
            pinned: false,
            percent: 22.5,
            limitCents: 22500,
        },
        {
            id: 'random',
            name: 'Random small purchases',
            pinned: false,
            percent: 22.5,
            limitCents: 22500,
        },
        {
            id: 'savings',
            name: 'Savings',
            pinned: true,
            percent: 10,
            limitCents: 10000,
        },
        {
            id: 'others',
            name: 'Others',
            pinned: false,
            percent: 22.5,
            limitCents: 22500,
        },
    ]);
    assert.equal(plan.pinnedTotalPercent, 10);
    assert.equal(plan.leftoverPercent, 90);
    assert.equal(plan.flexibleCount, 4);
    assert.equal(plan.flexiblePercentEach, 22.5);
    assert.equal(plan.unallocatedPercent, 0);
    assert.equal(plan.unallocatedCents, 0);
    assert.deepEqual(plan.warnings, {
        flexibleWithoutBudget: false,
        pinnedOverflow: false,
    });
});

test('resolvePlan gives flexible categories zero when pinned total is 100', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 99999;
    const savings = data.categories.find(({ id }) => id === 'savings');
    savings.limitMode = 'percent';
    savings.percent = 100;
    data.categories = data.categories.filter(({ id }) => (
        id === 'necessary'
        || id === 'subscriptions'
        || id === 'savings'
        || id === UNCATEGORISED_ID
    ));

    const plan = resolvePlan(data.categories, data.settings.monthlyBudgetCents);

    assert.deepEqual(plan.entries, [
        {
            id: 'necessary',
            name: 'Necessary expenses',
            pinned: false,
            percent: 0,
            limitCents: 0,
        },
        {
            id: 'subscriptions',
            name: 'Subscriptions',
            pinned: false,
            percent: 0,
            limitCents: 0,
        },
        {
            id: 'savings',
            name: 'Savings',
            pinned: true,
            percent: 100,
            limitCents: 99999,
        },
    ]);
    assert.equal(plan.flexibleCount, 2);
    assert.equal(plan.leftoverPercent, 0);
    assert.equal(plan.warnings.flexibleWithoutBudget, true);
});

test('resolvePlan reports an unallocated remainder when there are no flexible categories', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100001;
    data.categories = data.categories.filter(({ system }) => system).concat([
        {
            id: 'only',
            name: 'Only',
            pinned: true,
            percent: 60,
            system: false,
            subcategories: [],
        },
    ]);

    const plan = resolvePlan(data.categories, data.settings.monthlyBudgetCents);

    assert.equal(plan.flexibleCount, 0);
    assert.equal(plan.flexiblePercentEach, 0);
    assert.equal(plan.unallocatedPercent, 40);
    assert.equal(plan.unallocatedCents, 40000);
    assert.deepEqual(plan.warnings, {
        flexibleWithoutBudget: false,
        pinnedOverflow: false,
    });
});

test('resolvePlan reports pinned overflow and never gives negative leftover shares', () => {
    const categories = [
        { id: 'a', name: 'A', pinned: true, percent: 70, system: false },
        { id: 'b', name: 'B', pinned: true, percent: 50, system: false },
        { id: 'c', name: 'C', pinned: false, percent: 0, system: false },
    ];

    const plan = resolvePlan(categories, 100000);

    assert.equal(plan.pinnedTotalPercent, 120);
    assert.equal(plan.leftoverPercent, 0);
    assert.equal(plan.entries[2].percent, 0);
    assert.equal(plan.warnings.pinnedOverflow, true);
    assert.equal(plan.warnings.flexibleWithoutBudget, true);
});

test('resolvePlan handles a zero budget and excludes the system category from every calculation', () => {
    const data = defaultData();
    const system = data.categories.find(({ id }) => id === UNCATEGORISED_ID);
    system.pinned = true;
    system.percent = 100;
    const savings = data.categories.find(({ id }) => id === 'savings');
    savings.limitMode = 'percent';
    savings.percent = 10;

    const plan = resolvePlan(data.categories, 0);

    assert.equal(plan.entries.some(({ id }) => id === UNCATEGORISED_ID), false);
    assert.equal(plan.pinnedTotalPercent, 10);
    assert.deepEqual(plan.entries.map(({ percent }) => percent), [22.5, 22.5, 22.5, 10, 22.5]);
    assert.deepEqual(plan.entries.map(({ limitCents }) => limitCents), [0, 0, 0, 0, 0]);
});

test('resolvePlan assigns fractional-share rounding remainder to the last positive entry', () => {
    const categories = [
        { id: 'a', name: 'A', pinned: false, percent: 0, system: false },
        { id: 'b', name: 'B', pinned: false, percent: 0, system: false },
        { id: 'c', name: 'C', pinned: false, percent: 0, system: false },
    ];

    assert.deepEqual(
        resolvePlan(categories, 100).entries.map(({ limitCents }) => limitCents),
        [33, 33, 34],
    );
});

test('canSetPinned rejects invalid percentages', () => {
    const categories = defaultData().categories;

    for (const percent of [NaN, Infinity, -1, 101, '10', null]) {
        const result = canSetPinned(categories, 'savings', percent);
        assert.equal(result.ok, false, `${String(percent)} should be rejected`);
        assert.equal(typeof result.reason, 'string');
        assert.ok(result.reason.length > 0);
    }
});

test('canSetPinned computes replacement and new-category totals while ignoring system categories', () => {
    const data = defaultData();
    data.categories.find(({ id }) => id === 'savings').percent = 40;
    data.categories.push({
        id: 'second',
        name: 'Second',
        pinned: true,
        percent: 30,
        system: false,
        subcategories: [],
    });
    data.categories.find(({ id }) => id === UNCATEGORISED_ID).percent = 100;

    assert.deepEqual(canSetPinned(data.categories, 'savings', 70), {
        ok: true,
        pinnedTotalPercent: 100,
        overflow: false,
    });
    assert.deepEqual(canSetPinned(data.categories, null, 30), {
        ok: true,
        pinnedTotalPercent: 100,
        overflow: false,
    });
    assert.deepEqual(canSetPinned(data.categories, 'savings', 71), {
        ok: true,
        pinnedTotalPercent: 101,
        overflow: true,
    });
});

test('percentFromEuroCents and euroCentsFromPercent round-trip on clean numbers', () => {
    assert.equal(percentFromEuroCents(3500, 100000), 3.5);
    assert.equal(euroCentsFromPercent(3.5, 100000), 3500);
    assert.equal(percentFromEuroCents(10000, 0), 0);
    assert.equal(euroCentsFromPercent(10, 0), 0);
});

test('resolvePlan uses fixed-euro limitCents as canonical when limitMode is euro', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000; // €1000
    const savings = data.categories.find(({ id }) => id === 'savings');
    savings.pinned = true;
    savings.limitMode = 'euro';
    savings.limitCents = 10000; // €100
    savings.percent = 999; // stale — must be ignored/overwritten by sync

    const plan = resolvePlan(data.categories, data.settings.monthlyBudgetCents);
    const entry = plan.entries.find(({ id }) => id === 'savings');
    assert.equal(entry.limitCents, 10000);
    assert.equal(entry.percent, 10);
    assert.equal(plan.pinnedTotalPercent, 10);
    assert.equal(plan.leftoverPercent, 90);
});

test('syncCategoryPlanFields updates fixed-euro percent when budget changes', () => {
    const categories = [
        {
            id: 'savings',
            name: 'Savings',
            system: false,
            pinned: true,
            limitMode: 'euro',
            limitCents: 10000,
            percent: 10,
            subcategories: [],
        },
        {
            id: 'flex',
            name: 'Flex',
            system: false,
            pinned: false,
            limitMode: 'percent',
            limitCents: 0,
            percent: 0,
            subcategories: [],
        },
    ];
    syncCategoryPlanFields(categories, 200000); // budget now €2000
    assert.equal(categories[0].limitCents, 10000);
    assert.equal(categories[0].percent, 5);
});

test('buildPlanSnapshot has the frozen shape and does not store anything', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 12345;
    data.settings.usualMonthlyIncomeCents = 54321;
    const savings = data.categories.find(({ id }) => id === 'savings');
    savings.limitMode = 'percent';
    savings.percent = 10;

    const snapshot = buildPlanSnapshot(data);

    assert.deepEqual(Object.keys(snapshot), [
        'monthlyBudgetCents',
        'usualMonthlyIncomeCents',
        'entries',
        'unallocatedPercent',
        'unallocatedCents',
    ]);
    assert.equal(snapshot.monthlyBudgetCents, 12345);
    assert.equal(snapshot.usualMonthlyIncomeCents, 54321);
    assert.deepEqual(snapshot.entries.map(({ percent }) => percent), [22.5, 22.5, 22.5, 10, 22.5]);
    assert.deepEqual(data.monthPlans, {});
});

test('getMonthPlan returns a stored plan or an unstored current snapshot', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 1000;
    const stored = buildPlanSnapshot(data);
    data.monthPlans['2026-08'] = stored;

    assert.deepEqual(getMonthPlan(data, '2026-08'), stored);
    assert.notEqual(getMonthPlan(data, '2026-08'), stored);
    const current = getMonthPlan(data, '2026-09');
    assert.equal(current.monthlyBudgetCents, 1000);
    assert.equal(Object.hasOwn(data.monthPlans, '2026-09'), false);
});

test('freezeMonthPlan stores once and never overwrites an existing frozen plan', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;

    const first = freezeMonthPlan(data, '2026-09');
    data.settings.monthlyBudgetCents = 200000;
    const second = freezeMonthPlan(data, '2026-09');

    assert.notEqual(first, data.monthPlans['2026-09']);
    assert.notEqual(second, data.monthPlans['2026-09']);
    assert.equal(second.monthlyBudgetCents, 100000);
});

test('month plan APIs return deep copies that cannot mutate frozen storage', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;

    const frozen = freezeMonthPlan(data, '2026-09');
    frozen.monthlyBudgetCents = 1;
    frozen.entries[0].limitCents = 1;
    assert.equal(data.monthPlans['2026-09'].monthlyBudgetCents, 100000);
    assert.notEqual(data.monthPlans['2026-09'].entries[0].limitCents, 1);

    const fetched = getMonthPlan(data, '2026-09');
    fetched.monthlyBudgetCents = 2;
    fetched.entries[0].limitCents = 2;
    assert.equal(data.monthPlans['2026-09'].monthlyBudgetCents, 100000);
    assert.notEqual(data.monthPlans['2026-09'].entries[0].limitCents, 2);

    data.settings.monthlyBudgetCents = 200000;
    const refreshed = refreshCurrentMonthPlan(data, new Date(2026, 8, 15));
    refreshed.monthlyBudgetCents = 3;
    refreshed.entries[0].limitCents = 3;
    assert.equal(data.monthPlans['2026-09'].monthlyBudgetCents, 200000);
    assert.notEqual(data.monthPlans['2026-09'].entries[0].limitCents, 3);
});

test('refreshCurrentMonthPlan only refreshes an already-frozen current month', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    freezeMonthPlan(data, '2026-09');
    freezeMonthPlan(data, '2026-10');
    data.settings.monthlyBudgetCents = 200000;

    const refreshed = refreshCurrentMonthPlan(data, new Date(2026, 9, 15));

    assert.notEqual(refreshed, data.monthPlans['2026-10']);
    assert.equal(data.monthPlans['2026-09'].monthlyBudgetCents, 100000);
    assert.equal(data.monthPlans['2026-10'].monthlyBudgetCents, 200000);

    const untouched = defaultData();
    untouched.settings.monthlyBudgetCents = 200000;
    assert.equal(refreshCurrentMonthPlan(untouched, new Date(2026, 9, 15)), undefined);
    assert.deepEqual(untouched.monthPlans, {});
    assert.equal(getMonthPlan(untouched, '2026-10').monthlyBudgetCents, 200000);
    assert.deepEqual(untouched.monthPlans, {});
});

test('monthTotals calculates budget, cash, incomes, and strict over-limit category totals', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    data.settings.usualMonthlyIncomeCents = 150000;
    const savings = data.categories.find(({ id }) => id === 'savings');
    savings.limitMode = 'percent';
    savings.percent = 10;
    freezeMonthPlan(data, '2026-09');
    data.expenses = [
        expense('e1', 'necessary', 30001, '2026-09-01', 'rent'),
        expense('e2', 'subscriptions', 30000, '2026-09-02'),
        expense('e3', 'random', 10000, '2026-09-03', 'shopping'),
        expense('outside', 'random', 99999, '2026-10-03', 'shopping'),
    ];
    data.incomes = [
        income('i1', 20000, '2026-09-04'),
        income('outside', 99999, '2026-08-04'),
    ];

    const totals = monthTotals(data, '2026-09');

    assert.equal(totals.monthKey, '2026-09');
    assert.equal(totals.budgetCents, 100000);
    assert.equal(totals.spentCents, 70001);
    assert.equal(totals.usualIncomeCents, 150000);
    assert.equal(totals.extraIncomeCents, 20000);
    assert.equal(totals.incomeCents, 170000);
    assert.equal(totals.budgetLeftCents, 29999);
    assert.equal(totals.cashLeftCents, 99999);
    assert.deepEqual(totals.categories[0], {
        id: 'necessary',
        name: 'Necessary expenses',
        percent: 22.5,
        limitCents: 22500,
        spentCents: 30001,
        remainingCents: -7501,
        over: true,
        overByCents: 7501,
    });
    assert.equal(totals.categories[1].spentCents, 30000);
    assert.equal(totals.categories[1].remainingCents, -7500);
    assert.equal(totals.categories[1].over, true);
    assert.equal(totals.categories[1].overByCents, 7500);
    assert.equal(totals.categories[2].over, false);
});

test('monthTotals returns zero totals without data and does not throw', () => {
    const totals = monthTotals(defaultData(), '2026-09');

    assert.equal(totals.budgetCents, 0);
    assert.equal(totals.spentCents, 0);
    assert.equal(totals.usualIncomeCents, 0);
    assert.equal(totals.extraIncomeCents, 0);
    assert.equal(totals.incomeCents, 0);
    assert.equal(totals.budgetLeftCents, 0);
    assert.equal(totals.cashLeftCents, 0);
    assert.equal(totals.categories.length, 5);
    assert.ok(totals.categories.every((category) => (
        category.limitCents === 0
        && category.spentCents === 0
        && category.remainingCents === 0
        && category.over === false
        && category.overByCents === 0
    )));
});

test('monthTotals uses frozen entries and appends categories with later spending at zero limit', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 90000;
    data.categories.find(({ id }) => id === 'savings').percent = 10;
    freezeMonthPlan(data, '2026-09');
    data.categories.push({
        id: 'later',
        name: 'Added later',
        pinned: false,
        percent: 0,
        system: false,
        subcategories: [],
    });
    data.expenses = [
        expense('e1', 'later', 500, '2026-09-01'),
        expense('e2', UNCATEGORISED_ID, 700, '2026-09-02'),
        expense('e3', 'deleted-id', 900, '2026-09-03'),
    ];

    const totals = monthTotals(data, '2026-09');

    assert.deepEqual(totals.categories.slice(0, 5).map(({ id }) => id), [
        'necessary',
        'subscriptions',
        'random',
        'savings',
        'others',
    ]);
    assert.deepEqual(totals.categories.slice(5), [
        {
            id: 'later',
            name: 'Added later',
            percent: 0,
            limitCents: 0,
            spentCents: 500,
            remainingCents: -500,
            over: true,
            overByCents: 500,
        },
        {
            id: UNCATEGORISED_ID,
            name: 'Uncategorised',
            percent: 0,
            limitCents: 0,
            spentCents: 700,
            remainingCents: -700,
            over: true,
            overByCents: 700,
        },
        {
            id: 'deleted-id',
            name: 'deleted-id',
            percent: 0,
            limitCents: 0,
            spentCents: 900,
            remainingCents: -900,
            over: true,
            overByCents: 900,
        },
    ]);
    assert.equal(totals.spentCents, 2100);
    assert.equal(data.monthPlans['2026-09'].entries.some(({ id }) => id === 'later'), false);
});

test('subcategoryTotals groups unspecified and deleted subcategories and sorts descending', () => {
    const data = defaultData();
    data.expenses = [
        expense('e1', 'random', 300, '2026-09-01', 'shopping'),
        expense('e2', 'random', 700, '2026-09-02', 'shopping'),
        expense('e3', 'random', 400, '2026-09-03', ''),
        expense('e4', 'random', 500, '2026-09-04', 'deleted-subcategory'),
        expense('e5', 'random', 9999, '2026-10-04', 'eating-out'),
        expense('e6', 'necessary', 8888, '2026-09-04', 'rent'),
    ];

    assert.deepEqual(subcategoryTotals(data, '2026-09', 'random'), [
        { id: '', name: 'Unspecified', spentCents: 900 },
        { id: 'shopping', name: 'Shopping', spentCents: 1000 },
    ].sort((a, b) => b.spentCents - a.spentCents));
});

test('subcategoryTotals omits unused subcategories and returns empty for an unknown category', () => {
    const data = defaultData();
    data.expenses = [
        expense('e1', 'random', 100, '2026-09-01', 'shopping'),
    ];

    assert.deepEqual(subcategoryTotals(data, '2026-09', 'random'), [
        { id: 'shopping', name: 'Shopping', spentCents: 100 },
    ]);
    assert.deepEqual(subcategoryTotals(data, '2026-09', 'missing'), []);
});

test('incomeBreakdown includes Plan salary and groups extra income by category', () => {
    const data = defaultData();
    data.settings.usualMonthlyIncomeCents = 200000;
    data.incomes = [
        {
            id: 'i1',
            incomeCategoryId: 'income-other',
            amountCents: 5000,
            note: 'Gift',
            date: '2026-09-02',
        },
        {
            id: 'i2',
            incomeCategoryId: 'income-other',
            amountCents: 2500,
            note: '',
            date: '2026-09-10',
        },
        {
            id: 'i3',
            incomeCategoryId: 'salary',
            amountCents: 1000,
            note: 'Bonus',
            date: '2026-09-15',
        },
        {
            id: 'i4',
            incomeCategoryId: 'income-other',
            amountCents: 999,
            note: 'skip',
            date: '2026-10-01',
        },
    ];

    const breakdown = incomeBreakdown(data, '2026-09');
    assert.equal(breakdown.usualIncomeCents, 200000);
    assert.equal(breakdown.extraIncomeCents, 8500);
    assert.equal(breakdown.totalCents, 208500);
    assert.deepEqual(breakdown.entries, [
        {
            id: 'usual-plan',
            name: 'Usual salary (Plan)',
            amountCents: 200000,
            fromPlan: true,
        },
        {
            id: 'income-other',
            name: 'Other',
            amountCents: 7500,
            fromPlan: false,
        },
        {
            id: 'salary',
            name: 'Salary',
            amountCents: 1000,
            fromPlan: false,
        },
    ]);
});

test('incomeBreakdown is empty when there is no Plan salary and no extras', () => {
    const data = defaultData();
    data.settings.usualMonthlyIncomeCents = 0;
    assert.deepEqual(incomeBreakdown(data, '2026-09'), {
        monthKey: '2026-09',
        usualIncomeCents: 0,
        extraIncomeCents: 0,
        totalCents: 0,
        entries: [],
    });
});
