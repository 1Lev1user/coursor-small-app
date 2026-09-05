import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SCHEMA_VERSION,
    UNCATEGORISED_ID,
    createId,
    defaultData,
    normalise,
    deleteCategory,
    deleteSubcategory,
} from '../src/model.js';

const expectedCategories = [
    {
        id: 'necessary',
        name: 'Necessary expenses',
        pinned: false,
        percent: 0,
        limitMode: 'percent',
        limitCents: 0,
        system: false,
        subcategories: [
            { id: 'rent', name: 'Rent/mortgage' },
            { id: 'groceries', name: 'Groceries' },
            { id: 'transport', name: 'Transport' },
            { id: 'utilities', name: 'Utilities' },
            { id: 'insurance', name: 'Insurance' },
            { id: 'health', name: 'Health' },
        ],
    },
    {
        id: 'subscriptions',
        name: 'Subscriptions',
        pinned: false,
        percent: 0,
        limitMode: 'percent',
        limitCents: 0,
        system: false,
        subcategories: [],
    },
    {
        id: 'random',
        name: 'Random small purchases',
        pinned: false,
        percent: 0,
        limitMode: 'percent',
        limitCents: 0,
        system: false,
        subcategories: [
            { id: 'eating-out', name: 'Eating out' },
            { id: 'shopping', name: 'Shopping' },
            { id: 'random-other', name: 'Other' },
        ],
    },
    {
        id: 'savings',
        name: 'Savings',
        pinned: true,
        percent: 0,
        limitMode: 'euro',
        limitCents: 0,
        system: false,
        subcategories: [],
    },
    {
        id: 'others',
        name: 'Others',
        pinned: false,
        percent: 0,
        limitMode: 'percent',
        limitCents: 0,
        system: false,
        subcategories: [],
    },
    {
        id: 'uncategorised',
        name: 'Uncategorised',
        pinned: true,
        percent: 0,
        system: true,
        subcategories: [],
    },
];

test('constants and createId use the contractual values', () => {
    assert.equal(SCHEMA_VERSION, 1);
    assert.equal(UNCATEGORISED_ID, 'uncategorised');
    assert.equal(createId('expense', () => 0), 'expense_00000000');
    assert.match(createId('x', () => 0.999999), /^x_[0-9a-z]{8}$/);
});

test('defaultData returns the exact initial data shape and seeds', () => {
    assert.deepEqual(defaultData(), {
        version: 1,
        settings: {
            userName: '',
            monthlyBudgetCents: 0,
            usualMonthlyIncomeCents: 0,
            setupComplete: false,
            lastBackupISO: null,
            othersSeeded: true,
            monthReviewDismissedFor: null,
        },
        categories: expectedCategories,
        incomeCategories: [
            { id: 'salary', name: 'Salary' },
            { id: 'income-other', name: 'Other' },
        ],
        expenses: [],
        incomes: [],
        subscriptions: [],
        monthPlans: {},
    });
});

test('defaultData returns deeply independent objects', () => {
    const first = defaultData();
    first.settings.monthlyBudgetCents = 123;
    first.categories[0].name = 'Changed';
    first.categories[0].subcategories[0].name = 'Changed child';
    first.incomeCategories[0].name = 'Changed income';

    assert.deepEqual(defaultData().categories, expectedCategories);
    assert.equal(defaultData().settings.monthlyBudgetCents, 0);
    assert.equal(defaultData().incomeCategories[0].name, 'Salary');
});

test('normalise rejects non-object roots without throwing', () => {
    for (const raw of [null, undefined, [], 'text', 2]) {
        const result = normalise(raw);
        assert.equal(result.ok, false);
        assert.match(result.reason, /object|data/i);
    }
});

test('normalise rejects missing, non-numeric, and unsupported versions', () => {
    for (const raw of [{}, { version: '1' }, { version: 2 }]) {
        const result = normalise(raw);
        assert.equal(result.ok, false);
        assert.match(result.reason, /version/i);
    }
});

test('normalise rejects each missing or non-array collection', () => {
    for (const field of [
        'categories',
        'incomeCategories',
        'expenses',
        'incomes',
        'subscriptions',
    ]) {
        for (const value of [undefined, {}]) {
            const raw = defaultData();
            if (value === undefined) {
                delete raw[field];
            } else {
                raw[field] = value;
            }
            const result = normalise(raw);
            assert.equal(result.ok, false, `${field} should be rejected`);
            assert.match(result.reason, new RegExp(field, 'i'));
        }
    }
});

test('normalise rejects missing and non-object settings', () => {
    for (const value of [undefined, null, []]) {
        const raw = defaultData();
        if (value === undefined) {
            delete raw.settings;
        } else {
            raw.settings = value;
        }
        const result = normalise(raw);
        assert.equal(result.ok, false);
        assert.match(result.reason, /settings/i);
    }
});

test('normalise fills optional fields, adds system category, and clones input', () => {
    const raw = defaultData();
    delete raw.monthPlans;
    delete raw.settings.lastBackupISO;
    delete raw.settings.userName;
    raw.categories = raw.categories.filter(({ id }) => id !== UNCATEGORISED_ID);

    const result = normalise(raw);

    assert.equal(result.ok, true);
    assert.deepEqual(result.data.monthPlans, {});
    assert.equal(result.data.settings.lastBackupISO, null);
    assert.equal(result.data.settings.userName, '');
    assert.deepEqual(result.data.categories.at(-1), expectedCategories.at(-1));
    assert.notEqual(result.data, raw);
    assert.notEqual(result.data.settings, raw.settings);
    result.data.categories[0].name = 'Normalised only';
    assert.equal(raw.categories[0].name, 'Necessary expenses');
});

test('normalise canonicalises every protected system-category field', () => {
    const corruptions = [
        { name: 'Renamed safety net' },
        { percent: 75 },
        { pinned: false },
        { system: false },
    ];

    for (const corruption of corruptions) {
        const raw = defaultData();
        Object.assign(
            raw.categories.find(({ id }) => id === UNCATEGORISED_ID),
            corruption,
        );

        const result = normalise(raw);

        assert.equal(result.ok, true);
        assert.deepEqual(
            result.data.categories.find(({ id }) => id === UNCATEGORISED_ID),
            expectedCategories.at(-1),
        );
    }
});

test('normalise never throws on hostile or uncloneable input', () => {
    const throwing = {};
    Object.defineProperty(throwing, 'version', {
        get() {
            throw new Error('hostile getter');
        },
    });
    assert.doesNotThrow(() => normalise(throwing));
    assert.equal(normalise(throwing).ok, false);

    const cyclic = defaultData();
    cyclic.self = cyclic;
    assert.doesNotThrow(() => normalise(cyclic));
    assert.equal(normalise(cyclic).ok, false);
});

test('deleteCategory moves matching expenses from multiple months and preserves plans', () => {
    const data = defaultData();
    data.expenses = [
        { id: 'e1', categoryId: 'random', subcategoryId: 'shopping', date: '2026-01-05' },
        { id: 'e2', categoryId: 'random', subcategoryId: 'eating-out', date: '2026-02-05' },
        { id: 'e3', categoryId: 'necessary', subcategoryId: 'rent', date: '2026-02-06' },
    ];
    data.monthPlans = {
        '2026-01': { categories: [{ id: 'random', percent: 25 }] },
    };
    const plansBefore = structuredClone(data.monthPlans);

    assert.deepEqual(deleteCategory(data, 'random'), { ok: true, movedCount: 2 });
    assert.equal(data.categories.some(({ id }) => id === 'random'), false);
    assert.deepEqual(data.expenses.slice(0, 2).map(({ categoryId, subcategoryId }) => [
        categoryId,
        subcategoryId,
    ]), [
        [UNCATEGORISED_ID, ''],
        [UNCATEGORISED_ID, ''],
    ]);
    assert.equal(data.expenses[2].categoryId, 'necessary');
    assert.deepEqual(data.monthPlans, plansBefore);
});

test('deleteCategory refuses missing and system categories without mutation', () => {
    const data = defaultData();
    const before = structuredClone(data);
    assert.equal(deleteCategory(data, 'missing').ok, false);
    assert.deepEqual(data, before);

    const result = deleteCategory(data, UNCATEGORISED_ID);
    assert.equal(result.ok, false);
    assert.match(result.reason, /cannot be deleted/i);
    assert.deepEqual(data, before);
});

test('deleteCategory refuses the protected id even if its system flag is corrupt', () => {
    const data = defaultData();
    const category = data.categories.find(({ id }) => id === UNCATEGORISED_ID);
    category.system = false;
    const before = structuredClone(data);

    const result = deleteCategory(data, UNCATEGORISED_ID);

    assert.equal(result.ok, false);
    assert.match(result.reason, /cannot be deleted/i);
    assert.deepEqual(data, before);
});

test('deleteSubcategory removes it and leaves matching expenses in their parent', () => {
    const data = defaultData();
    data.expenses = [
        { id: 'e1', categoryId: 'random', subcategoryId: 'shopping' },
        { id: 'e2', categoryId: 'random', subcategoryId: 'shopping' },
        { id: 'e3', categoryId: 'necessary', subcategoryId: 'shopping' },
    ];

    assert.deepEqual(deleteSubcategory(data, 'random', 'shopping'), {
        ok: true,
        movedCount: 2,
    });
    assert.equal(data.categories[2].subcategories.some(({ id }) => id === 'shopping'), false);
    assert.equal(data.expenses[0].categoryId, 'random');
    assert.equal(data.expenses[0].subcategoryId, '');
    assert.equal(data.expenses[1].subcategoryId, '');
    assert.equal(data.expenses[2].subcategoryId, 'shopping');
});

test('deleteSubcategory refuses missing parent and missing child', () => {
    const data = defaultData();
    assert.equal(deleteSubcategory(data, 'missing', 'shopping').ok, false);
    assert.equal(deleteSubcategory(data, 'random', 'missing').ok, false);
});

test('defaultData seeds Others as flexible user category and limitMode on all user categories', () => {
    const data = defaultData();
    const others = data.categories.find(({ name }) => name.toLowerCase() === 'others');
    assert.ok(others);
    assert.equal(others.system, false);
    assert.equal(others.pinned, false);
    assert.equal(others.limitMode, 'percent');
    assert.equal(others.limitCents, 0);
    const savings = data.categories.find(({ id }) => id === 'savings');
    assert.equal(savings.limitMode, 'euro');
    for (const category of data.categories.filter(({ system }) => !system)) {
        assert.ok(category.limitMode === 'percent' || category.limitMode === 'euro');
        assert.equal(typeof category.limitCents, 'number');
    }
});

test('normalise fills limitMode and limitCents and seeds Others when missing', () => {
    const raw = defaultData();
    raw.categories = raw.categories
        .filter(({ name }) => name.toLowerCase() !== 'others')
        .map(({ limitMode, limitCents, ...rest }) => rest);
    raw.categories.find(({ id }) => id === 'savings').percent = 10;
    raw.settings.monthlyBudgetCents = 100000;
    delete raw.settings.othersSeeded;

    const result = normalise(raw);
    assert.equal(result.ok, true);
    const savings = result.data.categories.find(({ id }) => id === 'savings');
    assert.equal(savings.limitMode, 'percent');
    assert.equal(savings.limitCents, 10000);
    assert.ok(result.data.categories.some(({ name }) => name.toLowerCase() === 'others'));
    assert.equal(result.data.settings.othersSeeded, true);
    const uncategorisedIndex = result.data.categories.findIndex(({ id }) => id === UNCATEGORISED_ID);
    assert.equal(result.data.categories[uncategorisedIndex - 1]?.id, 'others');
    assert.equal(result.data.categories.at(-1)?.id, UNCATEGORISED_ID);
});

test('normalise backfills othersSeeded when Others already present', () => {
    const raw = defaultData();
    delete raw.settings.othersSeeded;

    const result = normalise(raw);
    assert.equal(result.ok, true);
    assert.equal(result.data.settings.othersSeeded, true);
    assert.equal(
        result.data.categories.filter(({ name }) => name.toLowerCase() === 'others').length,
        1,
    );

    const afterDelete = structuredClone(result.data);
    afterDelete.categories = afterDelete.categories.filter(
        ({ name }) => name.toLowerCase() !== 'others',
    );
    const second = normalise(afterDelete);
    assert.equal(second.ok, true);
    assert.ok(!second.data.categories.some(({ name }) => name.toLowerCase() === 'others'));
});

test('normalise does not recreate Others if user deleted it', () => {
    const raw = defaultData();
    raw.categories = raw.categories
        .filter(({ name }) => name.toLowerCase() !== 'others')
        .map(({ limitMode, limitCents, ...rest }) => rest);
    delete raw.settings.othersSeeded;

    const first = normalise(raw);
    assert.equal(first.ok, true);
    assert.ok(first.data.categories.some(({ name }) => name.toLowerCase() === 'others'));
    assert.equal(first.data.settings.othersSeeded, true);

    const secondRaw = structuredClone(first.data);
    secondRaw.categories = secondRaw.categories.filter(
        ({ name }) => name.toLowerCase() !== 'others',
    );

    const second = normalise(secondRaw);
    assert.equal(second.ok, true);
    assert.ok(!second.data.categories.some(({ name }) => name.toLowerCase() === 'others'));
});

test('deleteCategory refuses Savings', () => {
    const data = defaultData();
    const result = deleteCategory(data, 'savings');
    assert.equal(result.ok, false);
    assert.match(result.reason, /Savings cannot be deleted/i);
    assert.ok(data.categories.some(({ id }) => id === 'savings'));
});

test('normalise restores missing Savings as fixed euro', () => {
    const raw = defaultData();
    raw.categories = raw.categories.filter(({ id }) => id !== 'savings');
    const result = normalise(raw);
    assert.equal(result.ok, true);
    const savings = result.data.categories.find(({ id }) => id === 'savings');
    assert.ok(savings);
    assert.equal(savings.pinned, true);
    assert.equal(savings.limitMode, 'euro');
    assert.equal(savings.limitCents, 0);
});
