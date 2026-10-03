import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, defaultData } from '../src/model.js';
import {
    STORAGE_KEY,
    PRE_UPDATE_KEY,
    restorePreUpdateCopy,
} from '../src/storage.js';

function fakeStorage(initial = {}) {
    const values = { ...initial };
    const writes = { setItem: 0, removeItem: 0 };
    return {
        values,
        writes,
        getItem(key) {
            return Object.hasOwn(values, key) ? values[key] : null;
        },
        setItem(key, value) {
            writes.setItem += 1;
            values[key] = value;
        },
        removeItem(key) {
            writes.removeItem += 1;
            delete values[key];
        },
    };
}

function versionOneCopy() {
    const v1 = { ...defaultData(), version: 1 };
    for (const field of ['rules', 'bankLayouts', 'imports', 'templates', 'goals']) {
        delete v1[field];
    }
    delete v1.settings.backupSnoozedUntil;
    v1.expenses = [{
        id: 'e1',
        categoryId: 'random',
        subcategoryId: '',
        amountCents: 250,
        note: 'Coffee',
        date: '2026-09-01',
    }];
    return JSON.stringify(v1);
}

test('restorePreUpdateCopy migrates a version 1 copy to current data', () => {
    const storage = fakeStorage({ [PRE_UPDATE_KEY]: versionOneCopy() });
    const result = restorePreUpdateCopy(storage);
    assert.equal(result.ok, true);
    assert.equal(result.data.version, SCHEMA_VERSION);
    assert.equal(result.data.expenses[0].note, 'Coffee');
    assert.equal(result.data.expenses[0].currency, 'EUR');
    assert.deepEqual(result.data.rules, []);
});

test('restorePreUpdateCopy reports a missing copy without throwing', () => {
    const missing = { ok: false, reason: 'No pre-update copy on this device.' };
    assert.deepEqual(restorePreUpdateCopy(fakeStorage()), missing);
    assert.deepEqual(restorePreUpdateCopy(null), missing);
    assert.deepEqual(restorePreUpdateCopy(undefined), missing);
});

test('restorePreUpdateCopy rejects a damaged copy', () => {
    const storage = fakeStorage({ [PRE_UPDATE_KEY]: '{bad json' });
    assert.deepEqual(restorePreUpdateCopy(storage), {
        ok: false,
        reason: 'Pre-update copy is not valid JSON.',
    });
});

test('restorePreUpdateCopy passes on the reason when the copy cannot be used', () => {
    const storage = fakeStorage({ [PRE_UPDATE_KEY]: JSON.stringify({ version: 'x' }) });
    const result = restorePreUpdateCopy(storage);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'Schema version is missing or invalid.');
});

test('restorePreUpdateCopy writes nothing and keeps the copy', () => {
    const copy = versionOneCopy();
    const current = JSON.stringify(defaultData());
    const storage = fakeStorage({ [STORAGE_KEY]: current, [PRE_UPDATE_KEY]: copy });
    assert.equal(restorePreUpdateCopy(storage).ok, true);
    assert.equal(storage.values[STORAGE_KEY], current);
    assert.equal(storage.values[PRE_UPDATE_KEY], copy);
    assert.deepEqual(storage.writes, { setItem: 0, removeItem: 0 });
});
