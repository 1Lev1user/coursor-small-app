import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, normalise, normaliseEntry, markEdited, restoreEditedAt } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import {
    buildImport,
    applyImport,
    defaultDecisions,
    undoImport,
    undoImportAndSave,
    importEditInfo,
    applyRuleToExisting,
} from '../src/import/core.js';

const NOW = new Date(2026, 8, 25, 12, 0, 0);
const LATER = new Date(2026, 9, 1, 9, 30, 0);
const EDITED = '2026-10-01T09:00:00.000Z';

function row(date, amountCents, direction, description, extra = {}) {
    return statementRow({ date, amountCents, direction, description, ...extra });
}

const ROWS = [
    row('2026-09-17', 350, 'out', 'KAFIJA COFFEE RIGA', { bankRef: 'R1' }),
    row('2026-09-17', 450, 'out', 'KAFIJA COFFEE RIGA', { bankRef: 'R2' }),
    row('2026-09-18', 4250, 'out', 'RIMI MINI 1234 RIGA', { bankRef: 'R3' }),
    row('2026-09-20', 150000, 'in', 'ALGA', { counterparty: 'SIA Employer', bankRef: 'R4' }),
];

function importedData(rows = ROWS) {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    const decisions = defaultDecisions(data, rows).map((decision, index) => (
        rows[index].direction === 'in'
            ? { ...decision, include: true, kind: 'income', incomeCategoryId: 'salary' }
            : { ...decision, include: true, kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries' }
    ));
    const built = buildImport(data, decisions, { rows, format: 'csv', fileName: 'a.csv', now: NOW });
    const result = applyImport(data, built, {});
    assert.equal(result.ok, true);
    return { data, importId: result.importId };
}

test('normaliseEntry keeps a string editedAt, drops other values and never adds the key', () => {
    assert.equal(normaliseEntry({ amountCents: 100, editedAt: EDITED }, true).editedAt, EDITED);
    assert.equal(normaliseEntry({ amountCents: 100, editedAt: EDITED }, false).editedAt, EDITED);

    for (const bad of [5, null, true, {}, []]) {
        assert.equal(Object.hasOwn(normaliseEntry({ amountCents: 100, editedAt: bad }, true), 'editedAt'), false);
    }
    assert.equal(Object.hasOwn(normaliseEntry({ amountCents: 100 }, true), 'editedAt'), false);
    assert.equal(Object.hasOwn(normaliseEntry({ amountCents: 100 }, false), 'editedAt'), false);
});

test('normalise keeps editedAt on loaded entries and buildImport does not set it', () => {
    const { data } = importedData();
    for (const entry of [...data.expenses, ...data.incomes]) {
        assert.equal(Object.hasOwn(entry, 'editedAt'), false);
    }
    data.expenses[0].editedAt = EDITED;
    data.incomes[0].editedAt = EDITED;
    const result = normalise(JSON.parse(JSON.stringify(data)));
    assert.equal(result.ok, true);
    const loaded = result.data;
    assert.equal(loaded.expenses[0].editedAt, EDITED);
    assert.equal(loaded.incomes[0].editedAt, EDITED);
    assert.equal(Object.hasOwn(loaded.expenses[1], 'editedAt'), false);
});

test('importEditInfo counts entries still present and those marked edited', () => {
    const { data, importId } = importedData();
    assert.deepEqual(importEditInfo(data, importId), { total: 4, edited: 0 });

    data.expenses[0].editedAt = EDITED;
    data.expenses[1].editedAt = '';
    data.incomes[0].editedAt = EDITED;
    assert.deepEqual(importEditInfo(data, importId), { total: 4, edited: 2 });

    data.expenses.splice(2, 1);
    assert.deepEqual(importEditInfo(data, importId), { total: 3, edited: 2 });

    assert.deepEqual(importEditInfo(data, 'unknown'), { total: 0, edited: 0 });
    undoImport(data, importId, NOW);
    assert.deepEqual(importEditInfo(data, importId), { total: 0, edited: 0 });
});

test('markEdited marks a real change of each tracked field and nothing else', () => {
    const base = {
        importId: 'imp_1',
        categoryId: 'necessary',
        subcategoryId: 'groceries',
        amountCents: 500,
        note: 'Milk',
        date: '2026-09-17',
        currency: 'EUR',
        originalAmountCents: 500,
        refund: false,
    };
    const changes = {
        categoryId: 'random',
        subcategoryId: 'rent',
        amountCents: 600,
        note: 'Bread',
        date: '2026-09-18',
        currency: 'USD',
        originalAmountCents: 700,
        refund: true,
    };
    for (const [field, value] of Object.entries(changes)) {
        const entry = { ...base, [field]: value };
        assert.equal(markEdited(entry, { ...base }, LATER), true, field);
        assert.equal(entry.editedAt, LATER.toISOString(), field);
    }

    const same = { ...base };
    assert.equal(markEdited(same, { ...base }, LATER), false);
    assert.equal(Object.hasOwn(same, 'editedAt'), false);

    assert.equal(markEdited({ ...base, note: 'Milk' }, { ...base, note: '  Milk ' }, LATER), false);
    assert.equal(markEdited({ ...base, note: '' }, { ...base, note: undefined }, LATER), false);

    const income = { importId: 'imp_1', incomeCategoryId: 'gift', amountCents: 100, note: '', date: '2026-09-20' };
    const incomeBefore = { incomeCategoryId: 'salary', amountCents: 100, note: '', date: '2026-09-20' };
    assert.equal(markEdited(income, incomeBefore, LATER), true);
    assert.equal(income.editedAt, LATER.toISOString());
});

test('markEdited skips manual entries and absent snapshot fields, and a repeat edit moves the timestamp', () => {
    const manual = { importId: '', amountCents: 200 };
    assert.equal(markEdited(manual, { amountCents: 100 }, LATER), false);
    assert.equal(Object.hasOwn(manual, 'editedAt'), false);
    assert.equal(markEdited({ amountCents: 200 }, { amountCents: 100 }, LATER), false);

    const entry = { importId: 'imp_1', amountCents: 100, currency: 'USD', note: 'a' };
    assert.equal(markEdited(entry, { amountCents: 100, note: 'a' }, LATER), false);

    entry.amountCents = 150;
    markEdited(entry, { amountCents: 100 }, NOW);
    assert.equal(entry.editedAt, NOW.toISOString());
    entry.amountCents = 175;
    markEdited(entry, { amountCents: 150 }, LATER);
    assert.equal(entry.editedAt, LATER.toISOString());
});

test('undoImport with keepEdited removes only unedited entries and keeps the rest with their importId', () => {
    const { data, importId } = importedData();
    data.expenses[1].editedAt = EDITED;
    data.incomes[0].editedAt = EDITED;
    const keptIds = [data.expenses[1].id, data.incomes[0].id].sort();

    const removed = undoImport(data, importId, LATER, { keepEdited: true });
    assert.equal(removed, 2);
    assert.deepEqual([...data.expenses, ...data.incomes].map(({ id }) => id).sort(), keptIds);
    for (const entry of [...data.expenses, ...data.incomes]) {
        assert.equal(entry.importId, importId);
    }
    assert.equal(data.imports[0].undoneAt, LATER.toISOString());
});

test('undoImport with keepEdited keeps a created month plan only while a kept entry is in that month', () => {
    const withKept = importedData();
    withKept.data.imports[0].createdPlans = ['2026-09'];
    withKept.data.monthPlans['2026-09'] = { monthlyBudgetCents: 1, entries: [] };
    withKept.data.expenses[0].editedAt = EDITED;
    undoImport(withKept.data, withKept.importId, LATER, { keepEdited: true });
    assert.ok(Object.hasOwn(withKept.data.monthPlans, '2026-09'));

    const none = importedData();
    none.data.imports[0].createdPlans = ['2026-09'];
    none.data.monthPlans['2026-09'] = { monthlyBudgetCents: 1, entries: [] };
    undoImport(none.data, none.importId, LATER, { keepEdited: true });
    assert.equal(Object.hasOwn(none.data.monthPlans, '2026-09'), false);
});

test('undoImport keeping every entry removes nothing but still marks the import undone', () => {
    const { data, importId } = importedData();
    for (const entry of [...data.expenses, ...data.incomes]) entry.editedAt = EDITED;
    assert.equal(undoImport(data, importId, LATER, { keepEdited: true }), 0);
    assert.equal(data.expenses.length + data.incomes.length, 4);
    assert.equal(data.imports[0].undoneAt, LATER.toISOString());
});

test('undoImport without keepEdited removes every entry, edited or not', () => {
    for (const options of [undefined, {}, { keepEdited: false }]) {
        const { data, importId } = importedData();
        data.expenses[0].editedAt = EDITED;
        const removed = options === undefined
            ? undoImport(data, importId, LATER)
            : undoImport(data, importId, LATER, options);
        assert.equal(removed, 4);
        assert.equal(data.expenses.length + data.incomes.length, 0);
    }
});

test('undoImportAndSave passes keepEdited on and reports how many entries were kept', () => {
    const { data, importId } = importedData();
    data.expenses[0].editedAt = EDITED;
    data.incomes[0].editedAt = EDITED;
    const result = undoImportAndSave(data, importId, () => true, { keepEdited: true });
    assert.deepEqual(result, { ok: true, removed: 2, kept: 2 });
    assert.equal(data.expenses.length + data.incomes.length, 2);
});

test('undoImportAndSave without keepEdited keeps its exact result shape', () => {
    const { data, importId } = importedData();
    data.expenses[0].editedAt = EDITED;
    assert.deepEqual(undoImportAndSave(data, importId, () => true), { ok: true, removed: 4 });
});

test('a failing save puts every entry and its editedAt back', () => {
    const { data, importId } = importedData();
    data.expenses[0].editedAt = EDITED;
    const snapshot = JSON.stringify(data);
    assert.deepEqual(undoImportAndSave(data, importId, () => false, { keepEdited: true }), { ok: false, removed: 0 });
    assert.equal(JSON.stringify(data), snapshot);
    assert.deepEqual(undoImportAndSave(data, importId, () => false), { ok: false, removed: 0 });
    assert.equal(JSON.stringify(data), snapshot);
});

test('applyRuleToExisting marks only imported entries whose category or note really changed', () => {
    const { data } = importedData([
        row('2026-09-10', 2340, 'out', 'SIA Karlis veikals 12', { counterparty: 'SIA Karlis', bankRef: 'K1' }),
        row('2026-09-11', 1000, 'out', 'SIA Karlis veikals 12', { counterparty: 'SIA Karlis', bankRef: 'K2' }),
    ]);
    // The first entry already looks like the rule's result; the second does not.
    data.expenses[0].note = 'Produkti';
    data.expenses[1].categoryId = 'random';
    data.expenses[1].subcategoryId = '';
    data.expenses[1].note = 'Karlis';
    data.rules = [{
        id: 'r1', pattern: 'KARLIS', kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries',
        incomeCategoryId: '', note: 'Produkti', refund: false,
    }];

    assert.equal(applyRuleToExisting(data, 'r1', LATER), 2);
    assert.equal(Object.hasOwn(data.expenses[0], 'editedAt'), false);
    assert.equal(data.expenses[1].editedAt, LATER.toISOString());
    assert.equal(data.expenses[1].note, 'Produkti');
});

test('restoreEditedAt puts the previous mark back, or removes the key when there was none', () => {
    const entry = { editedAt: LATER.toISOString() };
    restoreEditedAt(entry, { editedAt: EDITED });
    assert.equal(entry.editedAt, EDITED);
    restoreEditedAt(entry, {});
    assert.equal(Object.hasOwn(entry, 'editedAt'), false);
    restoreEditedAt(entry, { editedAt: undefined });
    assert.equal(Object.hasOwn(entry, 'editedAt'), false);
});
