import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, defaultData } from '../src/model.js';
import { countRecords, exportBackup, importBackup } from '../src/backup.js';

test('exportBackup stringifies data without mutating it', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    const before = structuredClone(data);

    const result = exportBackup(data, new Date(2026, 8, 5));

    assert.deepEqual(data, before);
    assert.equal(result.filename, 'my-expenses-backup-2026-09-05.json');
    assert.equal(result.json, JSON.stringify(data, null, 2));
    assert.equal(data.settings.lastBackupISO, null);
});

test('importBackup round-trips defaultData through stringify', () => {
    const data = defaultData();
    const { json } = exportBackup(data, new Date(2026, 8, 5));
    const imported = importBackup(json);

    assert.equal(imported.ok, true);
    assert.deepEqual(imported.data, data);
});

test('importBackup rejects an empty object', () => {
    const result = importBackup('{}');
    assert.equal(result.ok, false);
    assert.match(result.reason, /version/i);
});

test('importBackup rejects an unsupported schema version', () => {
    const raw = JSON.stringify({ ...defaultData(), version: SCHEMA_VERSION + 1 });
    const result = importBackup(raw);
    assert.equal(result.ok, false);
    assert.match(result.reason, /version/i);
});

test('importBackup rejects truncated JSON', () => {
    const result = importBackup('{"version":1,');
    assert.equal(result.ok, false);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
});

test('countRecords reports expenses, incomes, and subscriptions', () => {
    const data = defaultData();
    data.expenses = [{ id: 'e1' }, { id: 'e2' }];
    data.incomes = [{ id: 'i1' }];
    data.subscriptions = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];

    assert.deepEqual(countRecords(data), {
        expenses: 2,
        incomes: 1,
        subscriptions: 3,
    });
});

test('importBackup accepts a version 1 backup and migrates it', () => {
    const old = { ...defaultData(), version: 1 };
    delete old.rules;
    old.incomes = [{ id: 'i1', incomeCategoryId: 'salary', amountCents: 1000, note: '', date: '2026-01-02' }];
    const result = importBackup(JSON.stringify(old));
    assert.equal(result.ok, true);
    assert.equal(result.data.version, SCHEMA_VERSION);
    assert.equal(result.data.incomes[0].originalAmountCents, 1000);
    assert.deepEqual(result.data.rules, []);
});
