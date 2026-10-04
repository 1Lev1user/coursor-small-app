import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, defaultData, normalise, normaliseIncomeSource } from '../src/model.js';
import {
    STORAGE_KEY,
    PRE_UPDATE_KEY,
    open,
    readPreUpdateCopy,
    deletePreUpdateCopy,
    restorePreUpdateCopy,
} from '../src/storage.js';
import { importBackup, mergeSettingsOnly, countSettings } from '../src/backup.js';

const V2_KEY = 'my-expenses-before-v2';

function fakeStorage(initial = {}) {
    const values = { ...initial };
    return {
        values,
        getItem(key) {
            return Object.hasOwn(values, key) ? values[key] : null;
        },
        setItem(key, value) {
            values[key] = value;
        },
        removeItem(key) {
            delete values[key];
        },
    };
}

function entryFields(currency = 'EUR') {
    return { currency, importId: '', bankRef: '', bankText: '', fingerprint: '' };
}

/** Data as the 2.0 app saved it: no version 3 fields anywhere. */
function v2Fixture() {
    const data = { ...defaultData(), version: 2 };
    delete data.incomeSources;
    data.settings = {
        userName: 'Anna',
        monthlyBudgetCents: 150000,
        usualMonthlyIncomeCents: 200000,
        setupComplete: true,
        lastBackupISO: '2026-09-01T10:00:00.000Z',
        othersSeeded: true,
        monthReviewDismissedFor: '2026-08',
        backupSnoozedUntil: '',
    };
    data.expenses = [
        {
            id: 'e1',
            categoryId: 'subscriptions',
            subcategoryId: '',
            amountCents: 1599,
            note: 'Netflix',
            date: '2026-09-25',
            ...entryFields(),
            originalAmountCents: 1599,
            refund: false,
            goalId: '',
            subscriptionId: 'sub_netflix',
        },
        {
            id: 'e2',
            categoryId: 'savings',
            subcategoryId: '',
            amountCents: 5000,
            note: '',
            date: '2026-09-10',
            ...entryFields(),
            originalAmountCents: 5000,
            refund: false,
            goalId: 'goal_trip',
        },
    ];
    data.incomes = [{
        id: 'i1',
        incomeCategoryId: 'salary',
        amountCents: 200000,
        note: 'September',
        date: '2026-09-05',
        ...entryFields(),
        originalAmountCents: 200000,
    }];
    data.subscriptions = [{ id: 'sub_netflix', name: 'Netflix', amountCents: 1599, dayOfMonth: 25 }];
    data.monthPlans = {
        '2026-09': { monthlyBudgetCents: 150000, categories: [{ id: 'random', limitCents: 30000 }] },
    };
    data.goals = [{ id: 'goal_trip', name: 'Trip', targetCents: 100000, deadline: '2026-12-01', createdAt: '2026-08-01' }];
    return data;
}

/** A version 3 object with every new field broken in some way. */
function repairFixture() {
    const data = normalise(v2Fixture()).data;
    data.settings.balanceStart = { cents: '100', date: '2026-10-01' };
    data.settings.perDayMode = 'x';
    data.settings.perDayFixedCents = -5;
    data.incomeSources = [
        { name: 'No id', dayOfMonth: 5 },
        { id: 'src_a', name: 'Salary', incomeCategoryId: 'salary', expectedCents: 200000, dayOfMonth: 99 },
    ];
    data.subscriptions[0].skippedMonths = ['2026-13', '2026-10', '2026-10', 5];
    data.subscriptions.push({ id: 'sub_gym', name: 'Gym', amountCents: 3000, dayOfMonth: 1 });
    data.incomes[0].sourceId = 7;
    return data;
}

test('version 2 data reaches version 3 with every record kept and the new fields at defaults', () => {
    const fixture = v2Fixture();
    fixture.incomes.push({ ...fixture.incomes[0], id: 'i2', sourceId: 'src_a' });
    const before = JSON.parse(JSON.stringify(fixture));

    const result = normalise(fixture);

    assert.equal(result.ok, true);
    assert.deepEqual(fixture, before);
    const data = result.data;
    assert.equal(data.version, 3);
    assert.equal(SCHEMA_VERSION, 3);
    assert.deepEqual(data.expenses, before.expenses);
    assert.deepEqual(data.incomes, [
        { ...before.incomes[0], sourceId: '' },
        { ...before.incomes[1], sourceId: 'src_a' },
    ]);
    assert.deepEqual(data.subscriptions, [{ ...before.subscriptions[0], skippedMonths: [] }]);
    assert.deepEqual(data.monthPlans, before.monthPlans);
    assert.deepEqual(data.goals, before.goals);
    assert.deepEqual(data.categories, before.categories);
    assert.deepEqual(data.incomeCategories, before.incomeCategories);
    assert.deepEqual(data.settings, {
        ...before.settings,
        balanceStart: null,
        perDayMode: 'auto',
        perDayFixedCents: 0,
    });
    assert.deepEqual(data.incomeSources, []);
});

test('version 1 data reaches version 3 through normalise', () => {
    const v1 = { ...defaultData(), version: 1 };
    for (const field of ['rules', 'bankLayouts', 'imports', 'templates', 'goals', 'incomeSources']) {
        delete v1[field];
    }
    for (const key of ['backupSnoozedUntil', 'balanceStart', 'perDayMode', 'perDayFixedCents']) {
        delete v1.settings[key];
    }
    v1.expenses = [{ id: 'e1', categoryId: 'random', subcategoryId: '', amountCents: 250, note: 'Coffee', date: '2026-09-01' }];
    v1.incomes = [{ id: 'i1', incomeCategoryId: 'salary', amountCents: 1000, note: '', date: '2026-09-02' }];

    const result = normalise(v1);

    assert.equal(result.ok, true);
    assert.equal(result.data.version, 3);
    assert.equal(result.data.expenses[0].note, 'Coffee');
    assert.equal(result.data.incomes[0].sourceId, '');
    assert.equal(result.data.incomes[0].originalAmountCents, 1000);
    assert.equal(result.data.settings.balanceStart, null);
    assert.equal(result.data.settings.perDayMode, 'auto');
    assert.equal(result.data.settings.perDayFixedCents, 0);
    assert.deepEqual(result.data.incomeSources, []);
    assert.deepEqual(result.data.rules, []);
});

test('normalise repairs bad values in the version 3 fields', () => {
    const repaired = normalise(repairFixture());
    assert.equal(repaired.ok, true);
    const data = repaired.data;
    assert.equal(data.settings.balanceStart, null);
    assert.equal(data.settings.perDayMode, 'auto');
    assert.equal(data.settings.perDayFixedCents, 0);
    assert.deepEqual(data.incomeSources.map(({ id }) => id), ['src_a']);
    assert.equal(data.incomeSources[0].dayOfMonth, 1);
    assert.deepEqual(data.subscriptions[0].skippedMonths, ['2026-10']);
    assert.deepEqual(data.subscriptions[1].skippedMonths, []);
    assert.equal(data.incomes[0].sourceId, '');

    const kept = normalise(v2Fixture()).data;
    kept.settings.balanceStart = { cents: -500, date: '2026-10-01' };
    kept.settings.perDayMode = 'fixed';
    kept.settings.perDayFixedCents = 2500;
    kept.incomeSources = 'nope';
    const keptData = normalise(kept).data;
    assert.deepEqual(keptData.settings.balanceStart, { cents: -500, date: '2026-10-01' });
    assert.equal(keptData.settings.perDayMode, 'fixed');
    assert.equal(keptData.settings.perDayFixedCents, 2500);
    assert.deepEqual(keptData.incomeSources, []);

    const badDate = normalise(v2Fixture()).data;
    badDate.settings.balanceStart = { cents: 100, date: '2026-02-30' };
    assert.equal(normalise(badDate).data.settings.balanceStart, null);
});

test('normaliseIncomeSource rejects records without an id and cleans the fields', () => {
    assert.equal(normaliseIncomeSource(null), null);
    assert.equal(normaliseIncomeSource('src_a'), null);
    assert.equal(normaliseIncomeSource([]), null);
    assert.equal(normaliseIncomeSource({ id: '' }), null);
    assert.equal(normaliseIncomeSource({ id: 5 }), null);

    const longName = `${'a'.repeat(39)} ${'b'.repeat(5)}`;
    assert.equal(longName.length, 45);
    assert.deepEqual(normaliseIncomeSource({
        id: 'src_a',
        name: `  ${longName}`,
        incomeCategoryId: 3,
        expectedCents: 1.5,
        dayOfMonth: 0,
        startDate: '2026-13-01',
        skippedMonths: 'x',
        extra: true,
    }), {
        id: 'src_a',
        name: 'a'.repeat(39),
        incomeCategoryId: '',
        expectedCents: 0,
        dayOfMonth: 1,
        startDate: '',
        skippedMonths: [],
    });

    assert.deepEqual(normaliseIncomeSource({
        id: 'src_b',
        name: ' Salary ',
        incomeCategoryId: 'salary',
        expectedCents: 200000,
        dayOfMonth: 31,
        startDate: '2026-10-04',
        skippedMonths: ['2026-11', '2026-11', '2026-1', '2026-12'],
    }), {
        id: 'src_b',
        name: 'Salary',
        incomeCategoryId: 'salary',
        expectedCents: 200000,
        dayOfMonth: 31,
        startDate: '2026-10-04',
        skippedMonths: ['2026-11', '2026-12'],
    });
    assert.equal(normaliseIncomeSource({ id: 'src_c', expectedCents: -1 }).expectedCents, 0);
});

test('the version 2 step rejects a non-object income and drops non-object subscriptions', () => {
    const badIncome = v2Fixture();
    badIncome.incomes = ['x'];
    assert.equal(normalise(badIncome).ok, false);

    const junkSubscriptions = v2Fixture();
    const validSub = junkSubscriptions.subscriptions[0];
    junkSubscriptions.subscriptions = [null, 'x', validSub];
    const result = normalise(junkSubscriptions);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.subscriptions, [{ ...validSub, skippedMonths: [] }]);

    const fixture = v2Fixture();
    const data = normalise(fixture).data;
    assert.deepEqual(data.expenses, fixture.expenses);
    assert.deepEqual(data.incomes, [{ ...fixture.incomes[0], sourceId: '' }]);
    assert.deepEqual(data.subscriptions, [{ ...fixture.subscriptions[0], skippedMonths: [] }]);
});

test('normalise is idempotent on version 2 data and on repaired data', () => {
    for (const fixture of [v2Fixture(), repairFixture()]) {
        const once = normalise(fixture).data;
        assert.deepEqual(normalise(once).data, once);
    }
});

test('opening version 2 data keeps a before-v3 copy and the older copy stays readable', () => {
    assert.equal(PRE_UPDATE_KEY, 'my-expenses-before-v3');

    const raw = JSON.stringify(v2Fixture());
    const storage = fakeStorage({ [STORAGE_KEY]: raw, [V2_KEY]: 'old 1.x copy' });
    const result = open(storage);
    assert.equal(result.status, 'ok');
    assert.equal(result.migratedFrom, 2);
    assert.equal(storage.getItem(PRE_UPDATE_KEY), raw);
    assert.equal(storage.getItem(V2_KEY), 'old 1.x copy');
    assert.equal(readPreUpdateCopy(storage), raw);

    const onlyOld = fakeStorage({ [V2_KEY]: 'old 1.x copy' });
    assert.equal(readPreUpdateCopy(onlyOld), 'old 1.x copy');
    assert.equal(readPreUpdateCopy(fakeStorage()), null);

    assert.equal(deletePreUpdateCopy(storage), true);
    assert.equal(storage.getItem(PRE_UPDATE_KEY), null);
    assert.equal(storage.getItem(V2_KEY), null);
    assert.equal(readPreUpdateCopy(storage), null);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 3);
});

test('a version 2 copy stored under the older key restores to version 3', () => {
    const storage = fakeStorage({ [V2_KEY]: JSON.stringify(v2Fixture()) });
    const result = restorePreUpdateCopy(storage);
    assert.equal(result.ok, true);
    assert.equal(result.data.version, 3);
    assert.equal(result.data.incomes[0].sourceId, '');
    assert.equal(storage.getItem(V2_KEY), JSON.stringify(v2Fixture()));
});

test('settings-only import keeps the local money start and the sources local incomes use', () => {
    const current = normalise(v2Fixture()).data;
    current.settings.balanceStart = { cents: 12000, date: '2026-10-01' };
    current.incomeSources = [
        { id: 'src_used', name: 'Salary', incomeCategoryId: 'salary', expectedCents: 200000, dayOfMonth: 5, startDate: '2026-10-01', skippedMonths: [] },
        { id: 'src_unused', name: 'Side job', incomeCategoryId: 'income-other', expectedCents: 5000, dayOfMonth: 15, startDate: '', skippedMonths: [] },
    ];
    current.incomes[0].sourceId = 'src_used';

    const backup = normalise(v2Fixture()).data;
    backup.settings.balanceStart = { cents: 99, date: '2026-01-01' };
    backup.settings.perDayMode = 'fixed';
    backup.settings.perDayFixedCents = 1500;
    backup.incomeSources = [
        { id: 'src_backup', name: 'Pension', incomeCategoryId: 'income-other', expectedCents: 40000, dayOfMonth: 20, startDate: '', skippedMonths: [] },
    ];

    const merged = mergeSettingsOnly(current, backup);

    assert.deepEqual(merged.settings.balanceStart, { cents: 12000, date: '2026-10-01' });
    assert.equal(merged.settings.perDayMode, 'fixed');
    assert.equal(merged.settings.perDayFixedCents, 1500);
    assert.deepEqual(merged.incomeSources.map(({ id }) => id), ['src_backup', 'src_used']);
    assert.notEqual(merged.incomeSources[1], current.incomeSources[0]);
    assert.equal(countSettings(merged).incomeSources, 2);

    const withoutSources = normalise(v2Fixture()).data;
    delete withoutSources.incomeSources;
    const mergedEmpty = mergeSettingsOnly(current, withoutSources);
    assert.deepEqual(mergedEmpty.incomeSources.map(({ id }) => id), ['src_used']);
    assert.equal(countSettings({ ...defaultData(), incomeSources: undefined }).incomeSources, 0);
});

test('a backup file written by the 2.0 app imports with no money start', () => {
    const result = importBackup(JSON.stringify(v2Fixture(), null, 2));
    assert.equal(result.ok, true);
    assert.equal(result.data.version, 3);
    assert.equal(result.data.settings.balanceStart, null);
    assert.equal(result.data.expenses.length, 2);
    assert.equal(result.data.expenses[0].subscriptionId, 'sub_netflix');
    assert.equal(result.data.expenses[1].goalId, 'goal_trip');
});
