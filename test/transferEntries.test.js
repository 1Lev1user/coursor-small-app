import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, normalise, SCHEMA_VERSION } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import {
    applyImport,
    buildImport,
    defaultDecisions,
    findDuplicates,
    importEditInfo,
    summarise,
    undoImport,
    undoImportAndSave,
} from '../src/import/core.js';
import {
    alignToBank,
    balanceAt,
    monthBalance,
    moneyNow,
    perDay,
    savedCents,
} from '../src/balance.js';
import { incomeBreakdown, monthTotals, subcategoryTotals } from '../src/budget.js';
import { monthIncomeSplit } from '../src/incomeSources.js';
import { searchEntries, searchTotals } from '../src/search.js';
import { addGoal, goalProgress } from '../src/goals.js';
import { monthSeries } from '../src/analytics.js';

const NOW = new Date(2026, 9, 18, 12, 0, 0);
const ANCHOR = { cents: 100000, date: '2026-10-01' };

function row(date, amountCents, direction, description, extra = {}) {
    return statementRow({ date, amountCents, direction, description, bankRef: `${direction}-${date}-${amountCents}`, ...extra });
}

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    data.settings.balanceStart = { ...ANCHOR };
    return data;
}

const EXPENSE = { include: true, kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries', remember: false };
const INCOME = { include: true, kind: 'income', incomeCategoryId: 'salary', remember: false };
const TRANSFER = { include: true, kind: 'transfer', remember: false };

const ROWS = [
    row('2026-10-05', 2500, 'out', 'RIMI RIGA'),
    row('2026-10-06', 150000, 'in', 'ALGA', { counterparty: 'SIA Employer' }),
    row('2026-10-10', 50000, 'out', 'To Revolut'),
    row('2026-10-12', 20000, 'in', 'From savings'),
];
const DECISIONS = [EXPENSE, INCOME, TRANSFER, TRANSFER];

function importRows(data, rows = ROWS, decisions = DECISIONS) {
    const built = buildImport(data, decisions.map((decision) => ({ ...decision })), {
        rows, format: 'csv', fileName: 'a.csv', now: NOW,
    });
    const result = applyImport(data, built, {});
    return { built, result };
}

/** The same data with the transfers left out, to show they change nothing else. */
function withoutTransfers(data) {
    const copy = structuredClone(data);
    copy.transfers = [];
    return copy;
}

test('imported transfers are stored in data.transfers, not as expenses or incomes', () => {
    const data = freshData();
    const { built, result } = importRows(data);
    assert.equal(result.ok, true);
    assert.equal(data.transfers.length, 2);
    const [out, into] = data.transfers;
    assert.equal(out.direction, 'out');
    assert.equal(out.amountCents, 50000);
    assert.equal(out.date, '2026-10-10');
    assert.equal(into.direction, 'in');
    assert.equal(into.amountCents, 20000);
    assert.equal(into.date, '2026-10-12');
    for (const transfer of data.transfers) {
        assert.match(transfer.id, /^trf_/);
        assert.equal(transfer.importId, result.importId);
        assert.notEqual(transfer.fingerprint, '');
    }
    assert.deepEqual(data.imports[0].transferIds, data.transfers.map(({ id }) => id));
    assert.equal(data.expenses.length, 1);
    assert.equal(data.incomes.length, 1);
    assert.equal(result.counts.transfers, 2);
    assert.equal(summarise(built).totalOutCents, 2500);
    assert.equal(summarise(built).totalInCents, 150000);
});

test('transfers change balanceAt and Money now; a transfer before the start date does not count', () => {
    const data = freshData();
    const rows = [...ROWS, row('2026-09-30', 9900, 'out', 'To Revolut early')];
    importRows(data, rows, [...DECISIONS, TRANSFER]);
    assert.equal(data.transfers.length, 3);
    assert.equal(balanceAt(data, '2026-10-09'), 100000 + 150000 - 2500);
    assert.equal(balanceAt(data, '2026-10-10'), 100000 + 150000 - 2500 - 50000);
    assert.equal(balanceAt(data, '2026-10-12'), 100000 + 150000 - 2500 - 50000 + 20000);
    assert.equal(moneyNow(data, NOW), 100000 + 150000 - 2500 + 20000 - 50000);
    assert.equal(moneyNow(withoutTransfers(data), NOW), 100000 + 150000 - 2500);
});

test('monthBalance closing and the next opening move by the net transfer', () => {
    const data = freshData();
    importRows(data);
    const plain = withoutTransfers(data);
    const october = monthBalance(data, '2026-10');
    const november = monthBalance(data, '2026-11');
    assert.equal(october.openingCents, ANCHOR.cents);
    assert.equal(october.closingCents, monthBalance(plain, '2026-10').closingCents - 30000);
    assert.equal(november.openingCents, monthBalance(plain, '2026-11').openingCents - 30000);
    assert.equal(november.openingCents, october.closingCents);
});

test('budget month totals, charts and Home spending are unchanged by transfers', () => {
    const data = freshData();
    importRows(data);
    const plain = withoutTransfers(data);
    assert.deepEqual(monthTotals(data, '2026-10', NOW), monthTotals(plain, '2026-10', NOW));
    assert.deepEqual(monthSeries(data, '2026-10', 3, NOW), monthSeries(plain, '2026-10', 3, NOW));
    const totals = monthTotals(data, '2026-10', NOW);
    assert.equal(totals.spentCents, 2500);
    assert.equal(totals.incomeCents, 150000);
});

test('per-day: spent today ignores a transfer dated today; the auto amount follows Money now', () => {
    const data = freshData();
    const rows = [...ROWS, row('2026-10-18', 7000, 'out', 'To savings today')];
    importRows(data, rows, [...DECISIONS, TRANSFER]);
    const plain = withoutTransfers(data);

    data.settings.perDayMode = 'fixed';
    data.settings.perDayFixedCents = 2000;
    plain.settings.perDayMode = 'fixed';
    plain.settings.perDayFixedCents = 2000;
    assert.equal(perDay(data, NOW).spentTodayCents, perDay(plain, NOW).spentTodayCents);
    assert.equal(perDay(data, NOW).spentTodayCents, 0);

    data.settings.perDayMode = 'auto';
    const auto = perDay(data, NOW);
    assert.equal(auto.moneyCents, moneyNow(data, NOW));
    assert.equal(auto.amountCents, Math.floor(moneyNow(data, NOW) / auto.days));
});

test('income totals, subcategories, search totals, goals and savings are unchanged by transfers', () => {
    const data = freshData();
    const goal = addGoal(data, { name: 'Trip', targetCents: 100000 }, NOW).goal;
    importRows(data);
    const plain = withoutTransfers(data);
    assert.deepEqual(incomeBreakdown(data, '2026-10', NOW), incomeBreakdown(plain, '2026-10', NOW));
    assert.deepEqual(subcategoryTotals(data, '2026-10', 'necessary'), subcategoryTotals(plain, '2026-10', 'necessary'));
    assert.deepEqual(monthIncomeSplit(data, '2026-10'), monthIncomeSplit(plain, '2026-10'));
    assert.deepEqual(searchTotals(searchEntries(data, {})), searchTotals(searchEntries(plain, {})));
    assert.equal(searchEntries(data, {}).length, 2);
    assert.deepEqual(goalProgress(data, goal.id, NOW), goalProgress(plain, goal.id, NOW));
    assert.equal(savedCents(data, NOW), savedCents(plain, NOW));
});

test('re-importing the same rows marks the transfers as duplicates and stores nothing new', () => {
    const data = freshData();
    importRows(data);
    const duplicates = findDuplicates(data, ROWS);
    for (const index of [2, 3]) {
        assert.equal(duplicates[index].level, 'exact');
        assert.equal(duplicates[index].matchType, 'ignored');
        assert.equal(duplicates[index].ignoredKind, 'transfer');
    }
    const decisions = defaultDecisions(data, ROWS, duplicates);
    assert.equal(decisions[2].include, false);
    assert.equal(decisions[3].include, false);
    const { result } = importRows(data, ROWS, decisions);
    assert.equal(result.ok, true);
    assert.equal(data.transfers.length, 2);
});

test('undo removes the import transfers and counts them; importEditInfo counts them too', () => {
    const data = freshData();
    const { result } = importRows(data);
    assert.deepEqual(importEditInfo(data, result.importId), { total: 4, edited: 0 });
    assert.equal(undoImport(data, result.importId, NOW), 4);
    assert.deepEqual(data.transfers, []);
    assert.equal(moneyNow(data, NOW), ANCHOR.cents);
    assert.ok(findDuplicates(data, ROWS).every(({ level }) => level === null));

    const again = freshData();
    const second = importRows(again).result;
    assert.equal(undoImport(again, second.importId, NOW, { keepEdited: true }), 4);
    assert.deepEqual(again.transfers, []);
});

test('undoImportAndSave puts the transfers back when saving fails', () => {
    const data = freshData();
    const { result } = importRows(data);
    const before = JSON.stringify(data);
    const undone = undoImportAndSave(data, result.importId, () => false);
    assert.equal(undone.ok, false);
    assert.equal(JSON.stringify(data), before);

    const kept = undoImportAndSave(data, result.importId, () => true, { keepEdited: true });
    assert.deepEqual(kept, { ok: true, removed: 4, kept: 0 });
    assert.deepEqual(data.transfers, []);
});

test('undoImportAndSave does not add a transfers key to data that has none', () => {
    const data = freshData();
    delete data.transfers;
    const { result } = importRows(data, ROWS.slice(0, 2), DECISIONS.slice(0, 2));
    const undone = undoImportAndSave(data, result.importId, () => false);
    assert.equal(undone.ok, false);
    assert.equal(Object.hasOwn(data, 'transfers'), false);
});

test('foreign transfers, exchange pairs and transfers with a bad date are not stored', () => {
    const data = freshData();
    const rows = [
        row('2026-10-07', null, 'in', 'Exchanged from EUR', { currency: 'USD', originalAmountCents: 10800 }),
        row('2026-10-07', 10150, 'out', 'Exchanged to USD'),
        row('2026-10-08', null, 'out', 'To USD pocket', { currency: 'USD', originalAmountCents: 5000 }),
        row('not a date', 3000, 'out', 'To savings'),
        row('2026-10-09', 20000, 'in', 'Top-up'),
    ];
    const { built, result } = importRows(data, rows, rows.map(() => TRANSFER));
    assert.equal(result.ok, true);
    assert.equal(built.importRecord.counts.transfers, 5);
    assert.equal(data.imports[0].ignored.length, 5);
    assert.deepEqual(data.transfers.map(({ amountCents, direction }) => [amountCents, direction]), [[20000, 'in']]);
});

test('a 3.1.0 backup without transfers loads unchanged', () => {
    const imported = freshData();
    importRows(imported, ROWS.slice(0, 2), DECISIONS.slice(0, 2));
    // What 3.1.0 saves: normalised data without the transfers list or transferIds.
    const source = normalise(imported).data;
    delete source.transfers;
    for (const record of source.imports) delete record.transferIds;
    const moneyBefore = moneyNow(source, NOW);

    const loaded = normalise(structuredClone(source));
    assert.equal(loaded.ok, true);
    assert.equal(loaded.data.version, SCHEMA_VERSION);
    assert.deepEqual(loaded.data, source);
    assert.equal(moneyNow(loaded.data, NOW), moneyBefore);
    // No list means no transfers; defaultData keeps its locked shape.
    assert.equal(Object.hasOwn(defaultData(), 'transfers'), false);
    assert.deepEqual(normalise(defaultData()).data, defaultData());
});

test('normalise drops invalid transfers and is idempotent', () => {
    const data = freshData();
    importRows(data);
    const valid = structuredClone(data.transfers);
    data.transfers.push(
        'not an object',
        { direction: 'out', amountCents: 100, date: '2026-10-02' },
        { id: 'trf_zero', direction: 'out', amountCents: 0, date: '2026-10-02' },
        { id: 'trf_neg', direction: 'in', amountCents: -5, date: '2026-10-02' },
        { id: 'trf_frac', direction: 'in', amountCents: 1.5, date: '2026-10-02' },
        { id: 'trf_date', direction: 'in', amountCents: 100, date: '2026-13-40' },
        { id: 'trf_dir', direction: 'sideways', amountCents: 100, date: '2026-10-02' },
    );
    const once = normalise(data);
    assert.equal(once.ok, true);
    assert.deepEqual(once.data.transfers, valid);
    const twice = normalise(structuredClone(once.data));
    assert.deepEqual(twice.data, once.data);

    const notList = normalise({ ...structuredClone(data), transfers: 'x' });
    assert.deepEqual(notList.data.transfers, []);
});

test('normalise drops transfers of an undone import but keeps those whose record is missing', () => {
    const data = freshData();
    const { result } = importRows(data);
    // As 3.1 undoes it: the record is marked undone, the transfers stay behind.
    data.imports[0].undoneAt = NOW.toISOString();
    const orphan = { ...structuredClone(data.transfers[0]), id: 'trf_other', importId: 'imp_missing' };
    data.transfers.push(orphan);
    const loaded = normalise(data);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.data.transfers.map(({ id }) => id), ['trf_other']);
    assert.ok(result.ok);
});

test('an import of only transfers applies without freezing any month plan', () => {
    const data = freshData();
    const plansBefore = structuredClone(data.monthPlans);
    const rows = [row('2026-08-10', 4000, 'out', 'To Revolut')];
    const { built, result } = importRows(data, rows, [TRANSFER]);
    assert.deepEqual(built.planChoices, []);
    assert.equal(result.ok, true);
    assert.deepEqual(data.monthPlans, plansBefore);
    assert.equal(data.transfers.length, 1);
});

test('alignToBank after an import with a transfer only corrects the remaining difference', () => {
    const data = freshData();
    const { result } = importRows(data);
    // The bank says 217500 on 2026-10-12: start + salary - groceries - 50000 + 20000.
    const aligned = alignToBank(data, 217500, '2026-10-12', NOW, { alignedBy: result.importId });
    assert.equal(aligned.ok, true);
    assert.equal(aligned.differenceCents, 0);
    const off = alignToBank(data, 217000, '2026-10-12', NOW, { alignedBy: result.importId });
    assert.equal(off.differenceCents, -500);
    assert.equal(balanceAt(data, '2026-10-12'), 217000);
});
