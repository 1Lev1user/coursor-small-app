import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVINGS_ID, defaultData, normalise } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { guessColumns, rowsToStatement } from '../src/import/text.js';
import { applyImport, buildImport, defaultDecisions, findDuplicates } from '../src/import/core.js';
import { alignToBank, balanceAt, savedCents } from '../src/balance.js';
import { monthTotals } from '../src/budget.js';

// A Citadele-shaped statement (made-up data): three card payments bought on 28 to 30 Sep
// and booked on 1 to 3 Oct, one plain payment, one salary, and the closing line.
const NOW = new Date(2026, 9, 18, 12, 0, 0);
const HEADER = ['Datums', 'Veids', 'Darījuma detaļas', 'Maks. Nr.', 'Trans. Nr.', 'Debets/Kredīts'];
const card = (day, ref, place) => `${day} 400000******0000 MCC-5814 REF: ${ref}\n${place} RIGA LV 10000001`;

const TRANSACTIONS = [
    ['01.10.2026', 'PIRKUMS', card('28/09/2026', '100001', 'KAFEJNICA PARAUGS'), '', 'ET00000000000A', '-10.00'],
    ['02.10.2026', 'PIRKUMS', card('29/09/2026', '100002', 'VEIKALS PARAUGS'), '', 'ET00000000000B', '-20.00'],
    ['03.10.2026', 'PIRKUMS', card('30/09/2026', '100003', 'DEGVIELA PARAUGS'), '', 'ET00000000000C', '-5.50'],
    ['05.10.2026', 'PIRKUMS', 'details\nPAVILJONS PARAUGS', '', 'ET00000000000D', '-12.00'],
    ['06.10.2026', 'IENĀKOŠAIS EKS MAKSĀJUMS', 'Darba algas izmaksa', '2026100600000001', 'FT00000000000E', '100.00'],
];
const OPENING_CENTS = 5000;
const CLOSING_CENTS = OPENING_CENTS - 1000 - 2000 - 550 - 1200 + 10000;
const FOOTER = [['', '', '', '', 'Beigu atlikums:', '102.50']];

function readStatement(transactions = TRANSACTIONS) {
    const rows = [HEADER, ...transactions, ...FOOTER];
    const guess = guessColumns(HEADER, transactions);
    return rowsToStatement(rows, 0, {
        columns: guess.columns,
        dateFormat: guess.dateFormat,
        decimalSeparator: guess.decimalSeparator,
    });
}

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    data.settings.balanceStart = { cents: OPENING_CENTS, date: '2026-10-01' };
    return data;
}

function importStatement(data, rows) {
    const decisions = defaultDecisions(data, rows);
    const built = buildImport(data, decisions, { rows, format: 'xls', fileName: 'a.xls', now: NOW });
    const result = applyImport(data, built, Object.fromEntries((built.planChoices ?? []).map((key) => [key, 'current'])));
    return { built, result };
}

test('a card row whose memo date is before the booking date carries bookedOn', () => {
    const { rows } = readStatement();
    assert.deepEqual(rows.slice(0, 3).map(({ date, bookedOn }) => [date, bookedOn]), [
        ['2026-09-28', '2026-10-01'],
        ['2026-09-29', '2026-10-02'],
        ['2026-09-30', '2026-10-03'],
    ]);
});

test('a row without a memo date, or with the booking date as memo date, has no bookedOn key', () => {
    const same = ['01.10.2026', 'PIRKUMS', card('01/10/2026', '100009', 'KAFEJNICA PARAUGS'), '', 'ET00000000000F', '-3.00'];
    const { rows } = readStatement([...TRANSACTIONS.slice(3), same]);
    assert.equal(rows.length, 3);
    for (const item of rows) {
        assert.equal(Object.hasOwn(item, 'bookedOn'), false);
    }
    assert.equal(rows[2].date, '2026-10-01');
});

test('statementRow keeps only a valid bookedOn that differs from date', () => {
    const base = { date: '2026-09-28', amountCents: 100, direction: 'out' };
    assert.equal(statementRow({ ...base, bookedOn: '2026-10-01' }).bookedOn, '2026-10-01');
    for (const bookedOn of ['2026-09-28', 'bad', '2026-02-31', 5, undefined, null]) {
        assert.equal(Object.hasOwn(statementRow({ ...base, bookedOn }), 'bookedOn'), false, String(bookedOn));
    }
});

test('owner-shaped import: Money now at the end equals the closing balance and the bank difference is 0', () => {
    const data = freshData();
    const statement = readStatement();
    assert.equal(statement.closingBalance.cents, CLOSING_CENTS);
    const { result } = importStatement(data, statement.rows);
    assert.equal(result.ok, true);
    assert.equal(data.expenses.length, 4);
    assert.equal(data.incomes.length, 1);
    assert.equal(balanceAt(data, '2026-10-17'), CLOSING_CENTS);

    const before = structuredClone(data);
    const aligned = alignToBank(data, CLOSING_CENTS, '2026-10-17', NOW, { alignedBy: 'imp_x' });
    assert.equal(aligned.ok, true);
    assert.equal(aligned.differenceCents, 0);
    assert.equal(aligned.entry, null);
    assert.deepEqual(data, before);
});

test('without bookedOn the purchase dates before the anchor are left out of Money now (the old shape)', () => {
    const data = freshData();
    importStatement(data, readStatement().rows);
    for (const entry of data.expenses) delete entry.bookedOn;
    assert.equal(balanceAt(data, '2026-10-17'), CLOSING_CENTS + 3550);
});

test('a purchase before the statement end but booked after it is not in balanceAt(end)', () => {
    const data = freshData();
    const late = {
        ...statementRow({ date: '2026-10-16', amountCents: 700, direction: 'out', description: 'details KAFEJNICA PARAUGS', bankRef: 'late-1' }),
        bookedOn: '2026-10-19',
    };
    importStatement(data, [late]);
    assert.equal(data.expenses.length, 1);
    assert.equal(data.expenses[0].date, '2026-10-16');
    assert.equal(balanceAt(data, '2026-10-17'), OPENING_CENTS);
    assert.equal(balanceAt(data, '2026-10-18'), OPENING_CENTS);
    assert.equal(balanceAt(data, '2026-10-19'), OPENING_CENTS - 700);
});

test('spending, fingerprints and duplicates keep the purchase date', () => {
    const data = freshData();
    const { rows } = readStatement();
    importStatement(data, rows);
    assert.equal(monthTotals(data, '2026-09', NOW).spentCents, 3550);
    assert.equal(monthTotals(data, '2026-10', NOW).spentCents, 1200);
    const bought = data.expenses.filter((entry) => entry.bookedOn);
    assert.deepEqual(bought.map(({ date }) => date).sort(), ['2026-09-28', '2026-09-29', '2026-09-30']);
    for (const entry of bought) {
        assert.ok(entry.fingerprint.startsWith(entry.date), entry.fingerprint);
    }
    const duplicates = findDuplicates(data, rows);
    assert.equal(duplicates.size ?? duplicates.length, 5);
});

test('buildImport copies bookedOn to expenses and incomes only when the row has it', () => {
    const data = freshData();
    const rows = [
        { ...statementRow({ date: '2026-09-30', amountCents: 400, direction: 'out', description: 'details A PARAUGS', bankRef: 'b-1' }), bookedOn: '2026-10-02' },
        statementRow({ date: '2026-10-03', amountCents: 500, direction: 'out', description: 'details B PARAUGS', bankRef: 'b-2' }),
        { ...statementRow({ date: '2026-09-29', amountCents: 900, direction: 'in', description: 'Darba algas izmaksa', bankRef: 'b-3' }), bookedOn: '2026-10-04' },
        statementRow({ date: '2026-10-05', amountCents: 800, direction: 'in', description: 'Darba algas izmaksa', bankRef: 'b-4' }),
    ];
    const built = buildImport(data, defaultDecisions(data, rows), { rows, format: 'csv', fileName: 'a.csv', now: NOW });
    const byRef = new Map([...built.expenses, ...built.incomes].map((entry) => [entry.bankRef, entry]));
    assert.equal(byRef.get('b-1').bookedOn, '2026-10-02');
    assert.equal(byRef.get('b-3').bookedOn, '2026-10-04');
    assert.equal(Object.hasOwn(byRef.get('b-2'), 'bookedOn'), false);
    assert.equal(Object.hasOwn(byRef.get('b-4'), 'bookedOn'), false);
});

test('a transfer row with bookedOn is stored on the booking date and Money now follows it', () => {
    const data = freshData();
    const rows = [{
        ...statementRow({ date: '2026-09-29', amountCents: 2500, direction: 'out', description: 'To Revolut', bankRef: 't-1' }),
        bookedOn: '2026-10-02',
    }];
    const decisions = [{ include: true, kind: 'transfer', remember: false }];
    const built = buildImport(data, decisions, { rows, format: 'csv', fileName: 'a.csv', now: NOW });
    assert.equal(built.transfers.length, 1);
    assert.equal(built.transfers[0].date, '2026-10-02');
    applyImport(data, built, {});
    assert.equal(balanceAt(data, '2026-10-01'), OPENING_CENTS);
    assert.equal(balanceAt(data, '2026-10-02'), OPENING_CENTS - 2500);
});

test('savedCents keeps the purchase date while balanceAt follows the booking date', () => {
    const data = freshData();
    data.expenses.push({
        id: 'exp_sav',
        categoryId: SAVINGS_ID,
        subcategoryId: '',
        amountCents: 3000,
        note: '',
        date: '2026-09-30',
        bookedOn: '2026-10-01',
        currency: 'EUR',
        originalAmountCents: 3000,
        refund: false,
        goalId: '',
    });
    assert.equal(savedCents(data, NOW), 0);
    assert.equal(balanceAt(data, '2026-10-01'), OPENING_CENTS - 3000);
});

test('normalise keeps a valid bookedOn and drops an invalid or missing one', () => {
    const data = defaultData();
    const entry = (id, extra) => ({
        id,
        categoryId: 'necessary',
        subcategoryId: '',
        amountCents: 100,
        note: '',
        date: '2026-09-30',
        currency: 'EUR',
        originalAmountCents: 100,
        refund: false,
        goalId: '',
        ...extra,
    });
    data.expenses = [
        entry('e1', { bookedOn: '2026-10-01' }),
        entry('e2', { bookedOn: 'bad' }),
        entry('e3', { bookedOn: 5 }),
        entry('e4', { bookedOn: '2026-02-31' }),
        entry('e5', {}),
    ];
    data.incomes = [{
        id: 'i1',
        incomeCategoryId: 'salary',
        amountCents: 100,
        note: '',
        date: '2026-09-30',
        bookedOn: '2026-10-01',
        currency: 'EUR',
        originalAmountCents: 100,
    }];
    const { data: clean } = normalise(data);
    assert.equal(clean.expenses[0].bookedOn, '2026-10-01');
    for (const index of [1, 2, 3, 4]) {
        assert.equal(Object.hasOwn(clean.expenses[index], 'bookedOn'), false, `e${index + 1}`);
    }
    assert.equal(clean.incomes[0].bookedOn, '2026-10-01');
    assert.deepEqual(normalise(defaultData()).data, defaultData());
});

test('editing the purchase date later leaves bookedOn, and Money now still follows it', () => {
    const data = freshData();
    importStatement(data, readStatement().rows);
    const entry = data.expenses.find((item) => item.bookedOn === '2026-10-01');
    entry.date = '2026-09-27';
    assert.equal(entry.bookedOn, '2026-10-01');
    assert.equal(balanceAt(data, '2026-10-17'), CLOSING_CENTS);
});
