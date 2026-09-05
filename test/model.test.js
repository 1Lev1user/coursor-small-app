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
        system: false,
        subcategories: [],
    },
    {
        id: 'random',
        name: 'Random small purchases',
        pinned: false,
        percent: 0,
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
            monthlyBudgetCents: 0,
            usualMonthlyIncomeCents: 0,
            setupComplete: false,
            lastBackupISO: null,
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
    raw.categories = raw.categories.filter(({ id }) => id !== UNCATEGORISED_ID);

    const result = normalise(raw);

    assert.equal(result.ok, true);
    assert.deepEqual(result.data.monthPlans, {});
    assert.equal(result.data.settings.lastBackupISO, null);
    assert.deepEqual(result.data.categories.at(-1), expectedCategories.at(-1));
    assert.notEqual(result.data, raw);
    assert.notEqual(result.data.settings, raw.settings);
    result.data.categories[0].name = 'Normalised only';
    assert.equal(raw.categories[0].name, 'Necessary expenses');
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
