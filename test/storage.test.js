import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import {
    STORAGE_KEY,
    RESCUE_KEY,
    open,
    load,
    save,
    storedIsNewer,
    requestPersistence,
} from '../src/storage.js';

function fakeStorage(initial = {}) {
    const values = { ...initial };
    return {
        getItem(key) {
            return Object.hasOwn(values, key) ? values[key] : null;
        },
        setItem(key, value) {
            values[key] = value;
        },
    };
}

test('load returns defaults when storage is absent or key is absent', () => {
    assert.deepEqual(load(null), defaultData());
    assert.deepEqual(load(fakeStorage()), defaultData());
});

test('save and load round-trip data through the contractual key', () => {
    const storage = fakeStorage();
    const data = defaultData();
    data.settings.monthlyBudgetCents = 120000;
    data.expenses.push({
        id: 'expense_1',
        categoryId: 'necessary',
        subcategoryId: 'groceries',
        amountCents: 1234,
        note: '',
        date: '2026-09-05',
    });

    assert.equal(STORAGE_KEY, 'my-expenses-v1');
    assert.equal(save(data, storage), true);
    assert.deepEqual(load(storage), data);
});

test('load falls back to fresh defaults for corrupt or rejected data', () => {
    const corrupt = fakeStorage({ [STORAGE_KEY]: '{bad json' });
    const wrongVersion = fakeStorage({
        [STORAGE_KEY]: JSON.stringify({ ...defaultData(), version: 2 }),
    });
    assert.deepEqual(load(corrupt), defaultData());
    assert.deepEqual(load(wrongVersion), defaultData());

    const loaded = load(corrupt);
    loaded.categories[0].name = 'Changed';
    assert.equal(load(corrupt).categories[0].name, 'Necessary expenses');
});

test('load never throws when storage access throws', () => {
    const storage = {
        getItem() {
            throw new Error('blocked');
        },
    };
    assert.doesNotThrow(() => load(storage));
    assert.deepEqual(load(storage), defaultData());
});

test('save returns false when storage is absent or setItem throws', () => {
    const throwingStorage = {
        setItem() {
            throw new Error('quota exceeded');
        },
    };
    assert.equal(save(defaultData(), null), false);
    assert.doesNotThrow(() => save(defaultData(), throwingStorage));
    assert.equal(save(defaultData(), throwingStorage), false);
});

test('open reports ok for usable data and for an empty device', () => {
    const storage = fakeStorage();
    assert.deepEqual(open(storage), { status: 'ok', data: defaultData() });

    const data = defaultData();
    data.settings.monthlyBudgetCents = 50000;
    save(data, storage);
    assert.deepEqual(open(storage), { status: 'ok', data });
    assert.equal(storage.getItem(RESCUE_KEY), null);
});

test('open reports newer data and keeps a rescue copy', () => {
    const raw = JSON.stringify({ ...defaultData(), version: 2 });
    const storage = fakeStorage({ [STORAGE_KEY]: raw });

    const result = open(storage);
    assert.equal(result.status, 'newer');
    assert.equal(result.version, 2);
    assert.equal(result.raw, raw);
    assert.deepEqual(result.data, defaultData());
    assert.equal(storage.getItem(RESCUE_KEY), raw);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('open reports unreadable data and keeps the first rescue copy', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{bad json' });
    const result = open(storage);
    assert.equal(result.status, 'unreadable');
    assert.equal(result.raw, '{bad json');
    assert.equal(storage.getItem(RESCUE_KEY), '{bad json');

    storage.setItem(STORAGE_KEY, '{other bad json');
    open(storage);
    assert.equal(storage.getItem(RESCUE_KEY), '{bad json');
});

test('save refuses to overwrite data saved by a newer version', () => {
    const raw = JSON.stringify({ ...defaultData(), version: 2 });
    const storage = fakeStorage({ [STORAGE_KEY]: raw });

    assert.equal(storedIsNewer(storage), true);
    assert.equal(save(defaultData(), storage), false);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('save may replace damaged data after the rescue copy exists', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{bad json' });
    open(storage);

    assert.equal(storedIsNewer(storage), false);
    assert.equal(save(defaultData(), storage), true);
    assert.deepEqual(load(storage), defaultData());
    assert.equal(storage.getItem(RESCUE_KEY), '{bad json');
});

test('storedIsNewer is false for missing, current or unreadable data', () => {
    assert.equal(storedIsNewer(null), false);
    assert.equal(storedIsNewer(fakeStorage()), false);
    assert.equal(storedIsNewer(fakeStorage({ [STORAGE_KEY]: JSON.stringify(defaultData()) })), false);
    assert.equal(storedIsNewer(fakeStorage({ [STORAGE_KEY]: 'null' })), false);
});

test('requestPersistence returns false when persistence API is unavailable', async () => {
    assert.equal(await requestPersistence(null), false);
    assert.equal(await requestPersistence({}), false);
    assert.equal(await requestPersistence({ storage: {} }), false);
});

test('requestPersistence skips persist when already persisted', async () => {
    let persistCalls = 0;
    const nav = {
        storage: {
            async persisted() {
                return true;
            },
            async persist() {
                persistCalls += 1;
                return true;
            },
        },
    };

    assert.equal(await requestPersistence(nav), true);
    assert.equal(persistCalls, 0);
});

test('requestPersistence asks for persistence and returns grant result', async () => {
    const calls = [];
    const granted = {
        storage: {
            async persisted() {
                calls.push('persisted');
                return false;
            },
            async persist() {
                calls.push('persist');
                return true;
            },
        },
    };
    const denied = {
        storage: {
            async persist() {
                return false;
            },
        },
    };

    assert.equal(await requestPersistence(granted), true);
    assert.deepEqual(calls, ['persisted', 'persist']);
    assert.equal(await requestPersistence(denied), false);
});

test('requestPersistence never throws when persistence calls reject', async () => {
    const persistedRejects = {
        storage: {
            async persisted() {
                throw new Error('denied');
            },
            async persist() {
                return true;
            },
        },
    };
    const persistRejects = {
        storage: {
            async persisted() {
                return false;
            },
            async persist() {
                throw new Error('denied');
            },
        },
    };

    await assert.doesNotReject(() => requestPersistence(persistedRejects));
    assert.equal(await requestPersistence(persistedRejects), false);
    assert.equal(await requestPersistence(persistRejects), false);
});
