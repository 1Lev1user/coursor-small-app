import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import {
    exportBackup,
    importBackup,
    markBackedUp,
    describeBackup,
    restoredLastBackup,
} from '../src/backup.js';
import { state, closeTransientUi } from '../src/views/settings/shared.js';

const NOW = new Date(2026, 9, 4);

test('markBackedUp sets the day and returns the previous value', () => {
    const data = defaultData();
    assert.equal(markBackedUp(data, NOW), null);
    assert.equal(data.settings.lastBackupISO, '2026-10-04');

    data.settings.lastBackupISO = '2026-09-01';
    assert.equal(markBackedUp(data, NOW), '2026-09-01');
    assert.equal(data.settings.lastBackupISO, '2026-10-04');
});

test('markBackedUp returns null when the setting is absent', () => {
    const data = defaultData();
    delete data.settings.lastBackupISO;
    assert.equal(markBackedUp(data, NOW), null);
    assert.equal(data.settings.lastBackupISO, '2026-10-04');
});

test('an export made after markBackedUp keeps the backup date', () => {
    const data = defaultData();
    markBackedUp(data, NOW);
    const { json } = exportBackup(data, NOW);
    const imported = importBackup(json);
    assert.equal(imported.ok, true);
    assert.equal(imported.data.settings.lastBackupISO, '2026-10-04');
});

test('describeBackup counts entries and finds the extreme dates over both lists', () => {
    const data = defaultData();
    data.expenses = [{ date: '2026-07-10' }, { date: '2026-08-02' }, { date: '2026-06-02' }];
    data.incomes = [{ date: '2026-10-03' }];
    data.subscriptions = [{ id: 's1' }];
    assert.deepEqual(describeBackup(data), {
        expenses: 3,
        incomes: 1,
        subscriptions: 1,
        firstDate: '2026-06-02',
        lastDate: '2026-10-03',
    });
});

test('describeBackup on empty data gives zero counts and empty dates', () => {
    assert.deepEqual(describeBackup(defaultData()), {
        expenses: 0,
        incomes: 0,
        subscriptions: 0,
        firstDate: '',
        lastDate: '',
    });
});

test('describeBackup ignores entries without a date', () => {
    const data = defaultData();
    data.expenses = [{ date: '2026-07-10' }, {}, { date: '' }];
    data.incomes = [{ date: undefined }];
    const described = describeBackup(data);
    assert.equal(described.expenses, 3);
    assert.equal(described.incomes, 1);
    assert.equal(described.firstDate, '2026-07-10');
    assert.equal(described.lastDate, '2026-07-10');
});

test('restoredLastBackup keeps a real date and falls back to today', () => {
    assert.equal(restoredLastBackup('2026-09-01', '2026-10-04'), '2026-09-01');
    assert.equal(restoredLastBackup(null, '2026-10-04'), '2026-10-04');
    assert.equal(restoredLastBackup('', '2026-10-04'), '2026-10-04');
    assert.equal(restoredLastBackup(undefined, '2026-10-04'), '2026-10-04');
});

test('pendingImportIncoming is null by default and reset by closeTransientUi', () => {
    assert.strictEqual(state.pendingImportIncoming, null);
    state.pendingImportIncoming = { expenses: 1 };
    closeTransientUi();
    assert.strictEqual(state.pendingImportIncoming, null);
});
