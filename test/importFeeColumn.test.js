import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';
import { mergeSavedColumns, feeNoteText } from '../src/views/import.js';

const HEADER = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

/** One Revolut-style line: the day number keeps the rows in date order. */
function line(day, amount, fee, balance = '', { currency = 'EUR', type = 'CARD_PAYMENT', state = 'COMPLETED' } = {}) {
    const date = `2026-09-${String(day).padStart(2, '0')} 09:00:00`;
    return `${type},Current,${date},${date},Row ${day},${amount},${fee},${currency},${state},${balance}`;
}

/** CSV text -> guessed columns and statement, the same pipeline the import screen runs. */
function read(csv, { columns = {}, reverse = false } = {}) {
    const { rows } = parseDelimited(csv);
    const headerRow = findHeaderRow(rows);
    const guess = guessColumns(rows[headerRow], rows.slice(headerRow + 1));
    const statement = rowsToStatement(rows, headerRow, {
        columns: { ...guess.columns, ...columns },
        dateFormat: guess.dateFormat,
        decimalSeparator: guess.decimalSeparator,
        ...(reverse ? { reverse: true } : {}),
    });
    return { guess, statement };
}

const csvOf = (...lines) => [HEADER, ...lines, ''].join('\n');
const moved = (statement) => statement.rows.map((row) => `${row.direction}:${row.amountCents}`);

test('a Revolut EXCHANGE row with a fee is money out of amount plus fee', () => {
    const { guess, statement } = read(csvOf(line(18, '-100.00', '1.50', '886.00', { type: 'EXCHANGE' })));
    assert.equal(guess.columns.fee, 6);
    assert.equal(statement.rows[0].direction, 'out');
    assert.equal(statement.rows[0].amountCents, 10150);
    assert.equal(statement.rows[0].originalAmountCents, 10150);
});

test('a fee of 0.00 or an empty fee leaves the amount unchanged', () => {
    const { statement } = read(csvOf(line(1, '-20.00', '0.00'), line(2, '-20.00', '')));
    assert.deepEqual(moved(statement), ['out:2000', 'out:2000']);
});

test('money in is net of the fee', () => {
    const { statement } = read(csvOf(line(1, '500.00', '1.00', '', { type: 'TOPUP' }), line(2, '100.00', '1.00')));
    assert.deepEqual(moved(statement), ['in:49900', 'in:9900']);
});

test('a fee equal to money in skips the row as zero amount', () => {
    const { statement } = read(csvOf(line(1, '5.00', '5.00')));
    assert.equal(statement.rows.length, 0);
    assert.deepEqual(statement.skipped, [{ line: 2, reason: 'zero amount' }]);
});

test('a fee larger than money in turns the row into money out of the difference', () => {
    const { statement } = read(csvOf(line(1, '5.00', '6.00')));
    assert.deepEqual(moved(statement), ['out:100']);
});

test('a foreign-currency row keeps its original amount and has no EUR amount', () => {
    const { statement } = read(csvOf(line(1, '-50.00', '0.50', '', { currency: 'USD' })));
    assert.equal(statement.rows[0].originalAmountCents, 5000);
    assert.equal(statement.rows[0].amountCents, null);
});

test('with an EUR amount column the EUR cell is used and no fee is added', () => {
    const csv = [
        'Type,Product,Started Date,Description,Amount,Fee,Currency,EUR charged',
        'CARD_PAYMENT,Current,2026-09-01 09:00:00,Shop,-50.00,0.50,USD,45.00',
        '',
    ].join('\n');
    const { guess, statement } = read(csv, { columns: { eurAmount: 7 } });
    assert.equal(guess.columns.fee, 5);
    assert.equal(statement.rows[0].amountCents, 4500);
    assert.equal(statement.rows[0].originalAmountCents, 5000);
});

test('Fee type, Free text, Total fees and Fees are not the fee column', () => {
    for (const name of ['Fee type', 'Free text', 'Total fees', 'Fees']) {
        const { columns } = guessColumns(['Date', 'Description', 'Amount', name], [['2026-09-01', 'Shop', '-5.00', '1.00']]);
        assert.equal(Object.hasOwn(columns, 'fee'), false, name);
    }
});

test('a file without a fee column has no fee key and no feeCheck', () => {
    const guess = guessColumns(['Date', 'Description', 'Amount'], [['2026-09-01', 'Shop', '-5.00']]);
    assert.equal(Object.hasOwn(guess.columns, 'fee'), false);
    assert.equal(Object.hasOwn(guess, 'feeCheck'), false);
});

test('a comma-decimal file adds the fee', () => {
    const csv = 'Datums;Apraksts;Summa;Komisija\n13.09.2026;Valūtas maiņa;-100,00;1,50\n';
    const { guess, statement } = read(csv);
    assert.equal(guess.columns.fee, 3);
    assert.deepEqual(moved(statement), ['out:10150']);
});

test('every fee keyword is recognised', () => {
    for (const name of ['Fee', 'Komisija', 'Komisijas maksa', 'Mokestis', 'Tasu', 'Комиссия', 'KOMISIJA']) {
        const { columns } = guessColumns(['Date', 'Description', 'Amount', name], [['2026-09-01', 'Shop', '-5.00', '1.00']]);
        assert.equal(columns.fee, 3, name);
    }
});

test('PayPal Gross, Fee, Net: the amount is Net and there is no fee', () => {
    const csv = 'Date,Name,Gross,Fee,Net,Currency\n2026-09-01,Customer,100.00,-3.50,96.50,EUR\n';
    const { guess, statement } = read(csv);
    assert.equal(guess.columns.amount, 4);
    assert.equal(Object.hasOwn(guess.columns, 'fee'), false);
    assert.equal(Object.hasOwn(guess, 'feeCheck'), false);
    assert.deepEqual(moved(statement), ['in:9650']);
});

test('Amount, Fee and Net also uses Net', () => {
    const csv = 'Date,Name,Amount,Fee,Net\n2026-09-01,Customer,100.00,3.50,96.50\n';
    const { guess } = read(csv);
    assert.equal(guess.columns.amount, 4);
    assert.equal(Object.hasOwn(guess.columns, 'fee'), false);
});

test('a Net column whose cells are not amounts is ignored', () => {
    const csv = 'Date,Name,Amount,Fee,Net\n2026-09-01,Customer,-100.00,1.50,none\n';
    const { guess } = read(csv);
    assert.equal(guess.columns.amount, 2);
    assert.equal(guess.columns.fee, 3);
});

test('split debit and credit columns: a debit gets plus fee, a credit gets minus fee', () => {
    const csv = 'Date,Description,Debit,Credit,Fee\n2026-09-01,Pay,10.00,,1.00\n2026-09-02,Top up,,20.00,1.00\n';
    const { guess, statement } = read(csv);
    assert.equal(guess.columns.fee, 4);
    assert.deepEqual(moved(statement), ['out:1100', 'in:1900']);
});

test('the fee follows the direction after Reverse', () => {
    const { statement } = read(csvOf(line(1, '100.00', '1.00'), line(2, '-100.00', '1.00')), { reverse: true });
    assert.deepEqual(moved(statement), ['out:10100', 'in:9900']);
});

test('an amount of 0 with a fee is still a zero amount; an unparsable fee is ignored', () => {
    const { statement } = read(csvOf(line(1, '0.00', '1.00'), line(2, '-10.00', 'n/a')), { columns: { fee: 6 } });
    assert.deepEqual(statement.skipped, [{ line: 2, reason: 'zero amount' }]);
    assert.deepEqual(moved(statement), ['out:1000']);
});

test('balance check: balance = previous + amount - fee keeps the fee as added', () => {
    const csv = csvOf(
        line(1, '-100.00', '1.50', '898.50'),
        line(2, '-20.00', '0.50', '878.00'),
        line(3, '-10.00', '0.00', '868.00'),
        line(4, '-5.00', '', ''),
        line(5, '-30.00', '1.00', '837.00'),
    );
    const { guess, statement } = read(csv);
    assert.equal(guess.feeCheck.mode, 'added');
    assert.equal(guess.feeCheck.added, 2);
    assert.equal(guess.feeCheck.included, 0);
    assert.equal(guess.columns.fee, 6);
    assert.deepEqual(moved(statement), ['out:10150', 'out:2050', 'out:1000', 'out:500', 'out:3100']);
});

test('balance check: balance = previous + amount means the amount includes the fee', () => {
    const csv = csvOf(
        line(1, '-100.00', '1.50', '900.00'),
        line(2, '-20.00', '0.50', '880.00'),
        line(3, '-10.00', '1.00', '870.00'),
    );
    const { guess, statement } = read(csv);
    assert.equal(guess.feeCheck.mode, 'included');
    assert.equal(Object.hasOwn(guess.columns, 'fee'), false);
    assert.deepEqual(moved(statement), ['out:10000', 'out:2000', 'out:1000']);
});

test('balance check: a newest-first sample is detected', () => {
    const csv = csvOf(
        line(3, '-10.00', '1.00', '868.50'),
        line(2, '-20.00', '0.50', '879.50'),
        line(1, '-100.00', '1.50', '900.00'),
    );
    const { guess } = read(csv);
    assert.equal(guess.feeCheck.mode, 'added');
    assert.equal(guess.feeCheck.added, 2);
    assert.equal(guess.columns.fee, 6);
});

test('balance check: no Balance column keeps the fee', () => {
    const guess = guessColumns(['Date', 'Description', 'Amount', 'Fee'], [['2026-09-01', 'A', '-5.00', '1.00']]);
    assert.equal(guess.feeCheck.mode, 'unknown');
    assert.equal(guess.columns.fee, 3);
});

test('balance check: a tie keeps the fee as added', () => {
    const { guess } = read(csvOf(
        line(1, '-10.00', '1.00', '100.00'),
        line(2, '-10.00', '1.00', '89.00'),
        line(3, '-10.00', '1.00', '79.00'),
    ));
    assert.equal(guess.feeCheck.mode, 'added');
    assert.equal(guess.columns.fee, 6);
});

test('balance check: one row, or rows in different currencies, cannot be compared and keep the fee', () => {
    const single = read(csvOf(line(1, '-10.00', '1.00', '100.00'))).guess;
    assert.equal(single.feeCheck.mode, 'unknown');
    assert.equal(single.columns.fee, 6);

    const mixed = read(csvOf(
        line(1, '-10.00', '1.00', '100.00'),
        line(2, '-10.00', '1.00', '90.00', { currency: 'USD' }),
    )).guess;
    assert.equal(mixed.feeCheck.checked, 0);
    assert.equal(mixed.columns.fee, 6);
});

test('mergeSavedColumns: a layout saved without a fee gets no fee', () => {
    const guessed = { date: 2, amount: 5, fee: 6, status: 8 };
    assert.equal(mergeSavedColumns(guessed, { date: 1, amount: 4 }).fee, -1);
});

test('mergeSavedColumns: a saved fee wins, saved keys win, a guessed status survives', () => {
    const guessed = { date: 2, amount: 5, fee: 6, status: 8 };
    assert.deepEqual(
        mergeSavedColumns(guessed, { date: 1, amount: 4, fee: 4 }),
        { date: 1, amount: 4, fee: 4, status: 8 },
    );
    assert.equal(mergeSavedColumns(guessed, { fee: -1 }).fee, -1);
});

test('feeNoteText: nothing without a balance check', () => {
    assert.equal(feeNoteText(6, null), '');
    assert.equal(feeNoteText(-1, undefined), '');
});

test('feeNoteText: the amount already includes the fee', () => {
    const check = { mode: 'included', added: 0, included: 3, checked: 3 };
    assert.match(feeNoteText(-1, check), /already includes the fee/);
    assert.match(feeNoteText(6, check), /already includes the fee/);
});

test('feeNoteText: added names how many rows fit, and only while a fee column is chosen', () => {
    const check = { mode: 'added', added: 4, included: 0, checked: 5 };
    assert.match(feeNoteText(6, check), /4 of 5 rows/);
    assert.equal(feeNoteText(-1, check), '');
});

test('feeNoteText: unknown asks to compare totals, only while a fee column is chosen', () => {
    const check = { mode: 'unknown', added: 0, included: 0, checked: 0 };
    assert.match(feeNoteText(6, check), /Compare the totals/);
    assert.equal(feeNoteText(-1, check), '');
});
