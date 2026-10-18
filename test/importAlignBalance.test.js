import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, normalise, normaliseEntry, UNCATEGORISED_ID } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import {
    buildImport,
    applyImport,
    defaultDecisions,
    undoImport,
    undoImportAndSave,
    importEditInfo,
} from '../src/import/core.js';
import {
    alignToBank,
    startMoneyFromBank,
    balanceAt,
    moneyNow,
    checkAgainstBank,
} from '../src/balance.js';

const NOW = new Date(2026, 8, 25, 12, 0, 0);
const DATE = '2026-09-20';
// 100000 + 150000 - (350 + 450 + 4250)
const BALANCE = 244950;

function row(date, amountCents, direction, description, extra = {}) {
    return statementRow({ date, amountCents, direction, description, ...extra });
}

const ROWS = [
    row('2026-09-17', 350, 'out', 'KAFIJA COFFEE RIGA', { bankRef: 'R1' }),
    row('2026-09-17', 450, 'out', 'KAFIJA COFFEE RIGA', { bankRef: 'R2' }),
    row('2026-09-18', 4250, 'out', 'RIMI MINI 1234 RIGA', { bankRef: 'R3' }),
    row('2026-09-20', 150000, 'in', 'ALGA', { counterparty: 'SIA Employer', bankRef: 'R4' }),
];

function importedData({ anchor = { cents: 100000, date: '2026-09-01' }, rows = ROWS, data = defaultData() } = {}) {
    data.rules = [];
    data.imports = data.imports ?? [];
    if (anchor) data.settings.balanceStart = { ...anchor };
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

function manualExpense(id, date, amountCents) {
    return {
        id,
        categoryId: 'necessary',
        subcategoryId: '',
        amountCents,
        note: '',
        date,
        currency: 'EUR',
        originalAmountCents: amountCents,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: '',
    };
}

const alignedEntries = (data, importId) => [...data.expenses, ...data.incomes]
    .filter((entry) => entry.alignedBy === importId);

test('alignToBank with equal balances adds nothing', () => {
    const { data, importId } = importedData();
    assert.equal(balanceAt(data, DATE), BALANCE);
    const before = JSON.stringify(data);
    const result = alignToBank(data, BALANCE, DATE, NOW, { alignedBy: importId });
    assert.deepEqual(result, { ok: true, differenceCents: 0, entry: null });
    assert.equal(JSON.stringify(data), before);
});

test('alignToBank with a higher bank balance adds an income on the statement date', () => {
    const { data, importId } = importedData();
    const nowBefore = moneyNow(data, NOW);
    const result = alignToBank(data, 250000, DATE, NOW, { alignedBy: importId });
    assert.equal(result.ok, true);
    assert.equal(result.differenceCents, 5050);
    assert.equal(result.type, 'income');
    assert.equal(result.monthKey, '2026-09');
    assert.equal(result.planWasAlreadyFrozen, true);
    const { id, ...fields } = result.entry;
    assert.match(id, /^inc_/);
    assert.deepEqual(fields, {
        incomeCategoryId: 'income-other',
        amountCents: 5050,
        note: 'Bank difference',
        date: DATE,
        sourceId: '',
        alignedBy: importId,
    });
    assert.equal(data.incomes.at(-1), result.entry);
    assert.equal(balanceAt(data, DATE), 250000);
    assert.equal(moneyNow(data, NOW), nowBefore + 5050);
});

test('alignToBank with a lower bank balance adds an Uncategorised expense', () => {
    const { data, importId } = importedData();
    const nowBefore = moneyNow(data, NOW);
    const result = alignToBank(data, 240000, DATE, NOW, { alignedBy: importId });
    assert.equal(result.ok, true);
    assert.equal(result.differenceCents, -4950);
    assert.equal(result.type, 'expense');
    const { id, ...fields } = result.entry;
    assert.match(id, /^exp_/);
    assert.deepEqual(fields, {
        categoryId: UNCATEGORISED_ID,
        subcategoryId: '',
        amountCents: 4950,
        note: 'Bank difference',
        date: DATE,
        currency: 'EUR',
        originalAmountCents: 4950,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: '',
        alignedBy: importId,
    });
    assert.equal(data.expenses.at(-1), result.entry);
    assert.equal(balanceAt(data, DATE), 240000);
    assert.equal(moneyNow(data, NOW), nowBefore - 4950);
});

test('alignToBank refuses bad input and adds nothing', () => {
    const { data } = importedData();
    const before = JSON.stringify(data);
    const cases = [
        [BALANCE, '2026-08-31', 'before the setup date'],
        [BALANCE, '2026-09-26', 'after today'],
        [null, DATE, 'null cents'],
        [12.5, DATE, 'fractional cents'],
        [BALANCE, '2026-13-40', 'bad date'],
        [BALANCE, 'soon', 'bad text'],
    ];
    for (const [cents, date, label] of cases) {
        const result = alignToBank(data, cents, date, NOW);
        assert.equal(result.ok, false, label);
        assert.equal(typeof result.reason, 'string', label);
        assert.equal(JSON.stringify(data), before, label);
    }
    assert.equal(alignToBank(data, null, DATE, NOW).reason, 'Enter a valid amount.');

    const unset = importedData({ anchor: null }).data;
    assert.deepEqual(alignToBank(unset, BALANCE, DATE, NOW), { ok: false, reason: 'Set up Money now first.' });
    assert.equal(unset.settings.balanceStart, null);
});

test('alignToBank counts entries on the statement date and keeps later ones in Money now', () => {
    const { data, importId } = importedData();
    data.expenses.push(manualExpense('exp_same', DATE, 1000), manualExpense('exp_later', '2026-09-22', 2000));
    assert.equal(balanceAt(data, DATE), BALANCE - 1000);
    const result = alignToBank(data, 240000, DATE, NOW, { alignedBy: importId });
    assert.equal(result.differenceCents, 240000 - (BALANCE - 1000));
    assert.equal(balanceAt(data, DATE), 240000);
    assert.equal(moneyNow(data, NOW), 240000 - 2000);
});

test('startMoneyFromBank anchors the statement date on the bank balance', () => {
    const { data } = importedData({ anchor: null });
    const result = startMoneyFromBank(data, 42915, DATE, NOW);
    assert.deepEqual(result, { ok: true });
    assert.equal(data.settings.balanceStart.date, DATE);
    assert.equal(balanceAt(data, DATE), 42915);
    // Only the entry dated on the statement date is folded into the anchor.
    assert.equal(data.settings.balanceStart.cents, 42915 - 150000);
    assert.equal(moneyNow(data, NOW), 42915);

    // An entry after the statement date flows into Money now.
    const later = importedData({ anchor: null }).data;
    later.expenses.push(manualExpense('exp_later', '2026-09-22', 2000));
    startMoneyFromBank(later, 42915, DATE, NOW);
    assert.equal(balanceAt(later, DATE), 42915);
    assert.equal(moneyNow(later, NOW), 42915 - 2000);

    // An entry on the statement date is counted in the anchor, so the bank balance still matches.
    const same = importedData({ anchor: null }).data;
    same.expenses.push(manualExpense('exp_same', DATE, 700));
    startMoneyFromBank(same, 42915, DATE, NOW);
    assert.equal(balanceAt(same, DATE), 42915);
});

test('startMoneyFromBank refuses when set, or on bad input', () => {
    const { data } = importedData();
    const before = JSON.stringify(data.settings);
    assert.deepEqual(startMoneyFromBank(data, 5000, DATE, NOW), { ok: false, reason: 'Money now is already set.' });
    assert.equal(JSON.stringify(data.settings), before);

    const unset = importedData({ anchor: null }).data;
    for (const [cents, date] of [[null, DATE], [1.5, DATE], [5000, 'soon'], [5000, '2026-09-26']]) {
        const result = startMoneyFromBank(unset, cents, date, NOW);
        assert.equal(result.ok, false);
        assert.equal(typeof result.reason, 'string');
        assert.equal(unset.settings.balanceStart, null);
    }
});

test('aligning again, or after a second import, adds only what is missing', () => {
    const { data, importId } = importedData();
    const first = alignToBank(data, 250000, DATE, NOW, { alignedBy: importId });
    assert.equal(first.entry.alignedBy, importId);

    assert.deepEqual(alignToBank(data, 250000, DATE, NOW, { alignedBy: importId }), { ok: true, differenceCents: 0, entry: null });
    assert.equal(alignedEntries(data, importId).length, 1);

    const second = importedData({ anchor: null, data, rows: [row('2026-09-22', 1000, 'out', 'NARVESEN RIGA', { bankRef: 'R9' })] });
    const result = alignToBank(data, 240000, '2026-09-22', NOW, { alignedBy: second.importId });
    assert.equal(result.differenceCents, 240000 - (250000 - 1000));
    assert.equal(result.entry.alignedBy, second.importId);
    assert.notEqual(second.importId, importId);
    assert.equal(alignedEntries(data, importId).length, 1);
});

test('undoing the import removes its Bank difference entry but does not count it', () => {
    for (const type of ['income', 'expense']) {
        const { data, importId } = importedData();
        alignToBank(data, type === 'income' ? 250000 : 240000, DATE, NOW, { alignedBy: importId });
        assert.equal(alignedEntries(data, importId).length, 1);
        assert.equal(undoImport(data, importId, NOW), 4);
        assert.equal(alignedEntries(data, importId).length, 0);
        assert.equal(data.expenses.length + data.incomes.length, 0);
    }

    const other = importedData();
    alignToBank(other.data, 250000, DATE, NOW, { alignedBy: other.importId });
    assert.deepEqual(undoImportAndSave(other.data, other.importId, () => true), { ok: true, removed: 4 });
    assert.equal(alignedEntries(other.data, other.importId).length, 0);
});

test('undo with keepEdited still removes the Bank difference entry', () => {
    const { data, importId } = importedData();
    alignToBank(data, 250000, DATE, NOW, { alignedBy: importId });
    data.expenses[0].editedAt = '2026-09-26T09:00:00.000Z';
    assert.deepEqual(importEditInfo(data, importId), { total: 4, edited: 1 });
    const result = undoImportAndSave(data, importId, () => true, { keepEdited: true });
    assert.deepEqual(result, { ok: true, removed: 3, kept: 1 });
    assert.equal(alignedEntries(data, importId).length, 0);
    assert.equal(data.expenses.length, 1);
});

test('a failed save puts the Bank difference entry back; other Bank differences stay', () => {
    const { data, importId } = importedData();
    alignToBank(data, 250000, DATE, NOW, { alignedBy: importId });
    assert.deepEqual(undoImportAndSave(data, importId, () => false), { ok: false, removed: 0 });
    assert.equal(alignedEntries(data, importId).length, 1);
    assert.equal(data.expenses.length + data.incomes.length, 5);

    alignToBank(data, 260000, DATE, NOW, { alignedBy: 'imp_other' });
    const manual = checkAgainstBank(data, moneyNow(data, NOW) + 100, NOW);
    assert.equal(Object.hasOwn(manual.entry, 'alignedBy'), false);
    undoImport(data, importId, NOW);
    assert.equal(alignedEntries(data, 'imp_other').length, 1);
    assert.ok(data.incomes.some((entry) => entry.id === manual.entry.id));
});

test('importEditInfo ignores the Bank difference entry', () => {
    const { data, importId } = importedData();
    assert.deepEqual(importEditInfo(data, importId), { total: 4, edited: 0 });
    const { entry } = alignToBank(data, 250000, DATE, NOW, { alignedBy: importId });
    assert.equal(entry.importId, undefined);
    assert.deepEqual(importEditInfo(data, importId), { total: 4, edited: 0 });
    entry.note = 'edited by hand';
    entry.editedAt = '2026-09-26T09:00:00.000Z';
    assert.deepEqual(importEditInfo(data, importId), { total: 4, edited: 0 });
});

test('a plan frozen by the align is recorded and removed by the undo', () => {
    const { data, importId } = importedData();
    // A statement date in a month the import did not touch.
    data.settings.balanceStart = { cents: 100000, date: '2026-08-01' };
    const record = data.imports.find(({ id }) => id === importId);
    assert.equal(Object.hasOwn(data.monthPlans, '2026-08'), false);

    const result = alignToBank(data, 90000, '2026-08-15', NOW, { alignedBy: importId });
    assert.equal(result.planWasAlreadyFrozen, false);
    assert.equal(result.monthKey, '2026-08');
    assert.ok(Object.hasOwn(data.monthPlans, '2026-08'));
    assert.equal(record.createdPlans.filter((key) => key === '2026-08').length, 1);

    undoImport(data, importId, NOW);
    assert.equal(Object.hasOwn(data.monthPlans, '2026-08'), false);

    // The usual case: the import already froze the month.
    const usual = importedData();
    const plans = [...usual.data.imports[0].createdPlans];
    const again = alignToBank(usual.data, 250000, DATE, NOW, { alignedBy: usual.importId });
    assert.equal(again.planWasAlreadyFrozen, true);
    assert.deepEqual(usual.data.imports[0].createdPlans, plans);
});

test('alignedBy survives normaliseEntry and a save-and-load round trip', () => {
    assert.equal(normaliseEntry({ amountCents: 100, alignedBy: 'imp_1' }, true).alignedBy, 'imp_1');
    assert.equal(normaliseEntry({ amountCents: 100, alignedBy: 'imp_1' }, false).alignedBy, 'imp_1');

    const { data, importId } = importedData();
    alignToBank(data, 250000, DATE, NOW, { alignedBy: importId });
    alignToBank(data, 90000, '2026-09-18', NOW, { alignedBy: importId });
    const loaded = normalise(JSON.parse(JSON.stringify(data)));
    assert.equal(loaded.ok, true);
    assert.equal(alignedEntries(loaded.data, importId).length, 2);
    assert.ok(loaded.data.incomes.some((entry) => entry.alignedBy === importId));
    assert.ok(loaded.data.expenses.some((entry) => entry.alignedBy === importId));
});

test('checkAgainstBank keeps its entry shape and adds no alignedBy key', () => {
    const { data } = importedData();
    const today = moneyNow(data, NOW);
    assert.deepEqual(checkAgainstBank(data, today, NOW), { ok: true, differenceCents: 0, entry: null });

    const up = checkAgainstBank(data, today + 700, NOW);
    assert.equal(up.entry.date, '2026-09-25');
    assert.equal(Object.hasOwn(up.entry, 'alignedBy'), false);
    assert.deepEqual(Object.keys(up.entry), ['id', 'incomeCategoryId', 'amountCents', 'note', 'date', 'sourceId']);

    const down = checkAgainstBank(data, today + 700 - 300, NOW);
    assert.equal(down.type, 'expense');
    assert.equal(Object.hasOwn(down.entry, 'alignedBy'), false);

    const unset = importedData({ anchor: null }).data;
    assert.deepEqual(checkAgainstBank(unset, 100, NOW), { ok: false, reason: 'Set up Money now first.' });
});
