import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { parseDelimited, findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';
import { statementRow } from '../src/import/types.js';
import { buildImport, defaultDecisions, upsertRule } from '../src/import/core.js';
import { mergeSavedColumns } from '../src/views/import.js';

const NOW = new Date(2026, 9, 6, 12);
const HEADER = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

/** CSV text -> guessed columns and statement, the same pipeline the import screen runs. */
function read(csv) {
    const { rows } = parseDelimited(csv);
    const headerRow = findHeaderRow(rows);
    const guess = guessColumns(rows[headerRow], rows.slice(headerRow + 1));
    const statement = rowsToStatement(rows, headerRow, {
        columns: guess.columns,
        dateFormat: guess.dateFormat,
        decimalSeparator: guess.decimalSeparator,
    });
    return { guess, statement };
}

function line(type, description, amount, state, started = '2026-09-06 6:11:59') {
    return `${type},Current,${started},${started},${description},${amount},0.00,EUR,${state},100.00`;
}

const FIXTURE = [
    HEADER,
    'CARD_PAYMENT,Current,2026-09-06 6:11:59,,AMAZON,-20.00,0.00,EUR,PENDING,866.00',
    line('CARD_PAYMENT', 'SHOP X', '-8.00', 'REVERSED', '2026-09-06 7:00:00'),
    line('CARD_PAYMENT', 'CAFE', '-3.00', 'COMPLETED', '2026-09-06 8:00:00'),
    line('EXCHANGE', 'Exchanged to USD', '-100.00', 'COMPLETED', '2026-09-05 9:00:00'),
    '',
].join('\n');

function descriptions(statement) {
    return statement.rows.map((row) => row.description);
}

test('guessColumns finds the status and type columns of a Revolut-style header', () => {
    const { columns } = read(FIXTURE).guess;
    assert.equal(columns.status, 8);
    assert.equal(columns.type, 0);
    assert.equal(columns.date, 2);
    assert.equal(columns.amount, 5);
    assert.equal(columns.description, 4);
    assert.equal(columns.currency, 7);
    assert.equal(columns.direction, -1);
});

test('pending and reversed rows are skipped as not completed, the others are imported', () => {
    const { statement } = read(FIXTURE);
    assert.deepEqual(descriptions(statement), ['CAFE', 'Exchanged to USD']);
    assert.deepEqual(statement.rows.map((row) => row.amountCents), [300, 10000]);
    assert.deepEqual(statement.skipped, [
        { line: 2, reason: 'not completed' },
        { line: 3, reason: 'not completed' },
    ]);
});

test('a REVERTED row is skipped as not completed', () => {
    const csv = [HEADER, line('CARD_PAYMENT', 'SHOP Y', '-5.00', 'REVERTED'), line('CARD_PAYMENT', 'CAFE', '-3.00', 'COMPLETED'), ''].join('\n');
    const { statement } = read(csv);
    assert.deepEqual(descriptions(statement), ['CAFE']);
    assert.deepEqual(statement.skipped, [{ line: 2, reason: 'not completed' }]);
});

test('status words match without case or diacritics', () => {
    for (const word of ['pending', 'Pending', 'Rezervēts', 'DECLINED', 'failed', 'Cancelled']) {
        const csv = [HEADER, line('CARD_PAYMENT', 'SHOP Z', '-5.00', word), line('CARD_PAYMENT', 'CAFE', '-3.00', 'COMPLETED'), ''].join('\n');
        const { statement } = read(csv);
        assert.deepEqual(descriptions(statement), ['CAFE'], word);
        assert.equal(statement.skipped[0].reason, 'not completed', word);
    }
});

test('COMPLETED, Izpildīts and an empty status import normally', () => {
    const csv = [
        HEADER,
        line('CARD_PAYMENT', 'ONE', '-1.00', 'COMPLETED'),
        line('CARD_PAYMENT', 'TWO', '-2.00', 'Izpildīts'),
        line('CARD_PAYMENT', 'THREE', '-3.00', ''),
        '',
    ].join('\n');
    const { statement } = read(csv);
    assert.deepEqual(descriptions(statement), ['ONE', 'TWO', 'THREE']);
    assert.deepEqual(statement.skipped, []);
});

test('a file without a status header has no status key, and Citadele has no type key either', () => {
    const plain = guessColumns(
        ['Started Date', 'Completed Date', 'Description', 'Amount', 'Currency'],
        [['2026-09-17 10:22:05', '2026-09-17 10:22:10', 'Coffee Shop', '-4.50', 'EUR']],
    );
    assert.equal(Object.hasOwn(plain.columns, 'status'), false);
    assert.equal(Object.hasOwn(plain.columns, 'type'), false);

    const citadele = guessColumns(
        ['Datums', 'Veids', 'Informācija', 'Summa', 'Valūta'],
        [
            ['01.10.2026', 'D', 'RIMI', '12.50', 'EUR'],
            ['02.10.2026', 'K', 'Alga', '1500.00', 'EUR'],
        ],
    );
    assert.equal(Object.hasOwn(citadele.columns, 'status'), false);
    assert.equal(Object.hasOwn(citadele.columns, 'type'), false);
});

test('"Statement details" and "Statement" are not the status column', () => {
    const sample = [['x', '2026-01-01', '1.00']];
    for (const name of ['Statement details', 'Statement']) {
        const { columns } = guessColumns([name, 'Date', 'Amount'], sample);
        assert.equal(Object.hasOwn(columns, 'status'), false, name);
    }
});

test('a Status header with Izpildīts and Rezervēts values and no Description header is the status column', () => {
    const csv = ['Datums,Status,Summa', '01.10.2026,Izpildīts,-5.00', '02.10.2026,Rezervēts,-7.00', '03.10.2026,Izpildīts,-9.00', ''].join('\n');
    const { guess, statement } = read(csv);
    assert.equal(guess.columns.status, 1);
    assert.deepEqual(statement.rows.map((row) => row.amountCents), [500, 900]);
    assert.deepEqual(statement.skipped, [{ line: 3, reason: 'not completed' }]);
});

test('mergeSavedColumns: saved keys win, a guessed status survives, a saved -1 wins', () => {
    const guessed = { date: 2, amount: 5, status: 8, type: 0 };
    assert.deepEqual(mergeSavedColumns(guessed, { date: 1, amount: 4 }), { date: 1, amount: 4, status: 8, type: 0 });
    assert.equal(mergeSavedColumns(guessed, { status: -1 }).status, -1);
});

test('statementRow adds kindHint only for transfer or refund', () => {
    const base = { date: '2026-09-06', amountCents: 100, direction: 'out', description: 'x' };
    assert.equal(statementRow({ ...base, kindHint: 'transfer' }).kindHint, 'transfer');
    assert.equal(statementRow({ ...base, kindHint: 'refund' }).kindHint, 'refund');
    for (const bad of ['income', 'expense', '', undefined, null, 5]) {
        assert.equal(Object.hasOwn(statementRow({ ...base, kindHint: bad }), 'kindHint'), false, String(bad));
    }
    assert.equal(Object.hasOwn(statementRow(base), 'kindHint'), false);
});

function hintOf(type) {
    const csv = [
        HEADER,
        line('CARD_PAYMENT', 'CAFE', '-3.00', 'COMPLETED', '2026-09-06 8:00:00'),
        line(type, 'Probe row', '-4.00', 'COMPLETED', '2026-09-06 9:00:00'),
        '',
    ].join('\n');
    const { guess, statement } = read(csv);
    assert.equal(guess.columns.type, 0, type);
    assert.equal(Object.hasOwn(statement.rows[0], 'kindHint'), false, 'CARD_PAYMENT row has no hint');
    return statement.rows[1].kindHint;
}

test('TOPUP and EXCHANGE give a transfer hint, in SNAKE and Title Case', () => {
    for (const type of ['TOPUP', 'Topup', 'EXCHANGE', 'Exchange']) {
        assert.equal(hintOf(type), 'transfer', type);
    }
});

test('TRANSFER and card payments give no hint; card refunds give a refund hint', () => {
    for (const type of ['TRANSFER', 'Transfer', 'CARD_PAYMENT', 'Card Payment']) {
        assert.equal(hintOf(type), undefined, type);
    }
    for (const type of ['CARD_REFUND', 'Card Refund']) {
        assert.equal(hintOf(type), 'refund', type);
    }
});

function hinted(direction, kindHint, description = 'PROBE') {
    return statementRow({ date: '2026-09-06', amountCents: 500, direction, description, kindHint });
}

test('defaultDecisions uses the hint: transfer, and refund only for money in', () => {
    const data = defaultData();
    const decisions = defaultDecisions(data, [
        hinted('out', 'transfer'),
        hinted('in', 'refund'),
        hinted('out', 'refund'),
        hinted('out', undefined),
        hinted('in', undefined),
    ]);
    assert.deepEqual(decisions.map((decision) => decision.kind), ['transfer', 'refund', 'expense', 'expense', 'income']);
});

test('a saved rule wins over the hint', () => {
    const data = defaultData();
    upsertRule(data, { pattern: 'PROBE', kind: 'skip' });
    const [decision] = defaultDecisions(data, [hinted('out', 'transfer')]);
    assert.equal(decision.kind, 'skip');
});

test('buildImport counts hinted transfers', () => {
    const data = defaultData();
    const rows = [hinted('out', 'transfer', 'EXCHANGE A'), hinted('out', 'transfer', 'EXCHANGE B'), hinted('out', undefined, 'CAFE')];
    const built = buildImport(data, defaultDecisions(data, rows), { rows, format: 'csv', fileName: 'r.csv', now: NOW });
    assert.equal(built.ok, true);
    assert.equal(built.importRecord.counts.transfers, 2);
    assert.equal(built.importRecord.counts.expenses, 1);
});

test('Citadele layout regression: direction column kept, no type, no status', () => {
    const csv = ['Datums,Veids,Informācija,Summa,Valūta', '01.10.2026,D,RIMI,12.50,EUR', '02.10.2026,K,Alga,1500.00,EUR', ''].join('\n');
    const { guess, statement } = read(csv);
    assert.equal(guess.columns.direction, 1);
    assert.equal(Object.hasOwn(guess.columns, 'type'), false);
    assert.equal(Object.hasOwn(guess.columns, 'status'), false);
    assert.deepEqual(statement.rows.map((row) => row.direction), ['out', 'in']);
});
