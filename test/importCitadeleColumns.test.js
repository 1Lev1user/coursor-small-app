import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findHeaderRow,
    guessColumns,
    inferDateFormat,
    rowsToStatement,
} from '../src/import/text.js';

// A Citadele statement in the owner's shape (synthetic, made-up data):
// preamble, header at index 3, one signed "Debets/Kredīts" amount column,
// footer lines with the label in column 4 and the number in column 5.
const HEADER = ['Datums', 'Veids', 'Darījuma detaļas', 'Maks. Nr.', 'Trans. Nr.', 'Debets/Kredīts'];

const TRANSACTIONS = [
    ['01.10.2026', 'PIRKUMS', 'details\nKAFEJNICA PARAUGS', '', 'ET00000000000A', '-8.8'],
    ['05.10.2026', 'IENĀKOŠAIS EKS MAKSĀJUMS', 'Darba algas izmaksa', '2026100500000001', 'FT00000000000B', '1140.41'],
    ['12.10.2026', 'PIRKUMS', 'details\nVEIKALS PARAUGS', '', 'ET00000000000C', '-52.17'],
    ['14.10.2026', 'PIRKUMS', 'details\nDEGVIELA PARAUGS', '', 'ET00000000000D', '-3.5'],
];

const FOOTER = [
    ['', '', '', '', 'Beigu atlikums:', '1000.00'],
    ['', '', '', '', 'Debeta apgrozījums:', '64.47'],
    ['', '', '', '', 'Kredīta apgrozījums:', '1140.41'],
    ['', '', '', '', 'Komisiju summa', '0.00'],
    ['', '', '', '', 'Kopējā izejošo maksājumu summa bez komisijām', '64.47'],
];

const ROWS = [
    ['Konts', 'XXXXXXX'],
    ['No', '01.10.2026', 'līdz', '17.10.2026'],
    ['', '', '', '', 'Sākuma atlikums:', '75.31'],
    HEADER,
    ...TRANSACTIONS,
    ...FOOTER,
];

function guessed() {
    const headerRow = findHeaderRow(ROWS);
    const guess = guessColumns(ROWS[headerRow], ROWS.slice(headerRow + 1, headerRow + 1 + TRANSACTIONS.length));
    return {
        headerRow,
        guess,
        layout: { columns: guess.columns, dateFormat: guess.dateFormat, decimalSeparator: guess.decimalSeparator },
    };
}

test('findHeaderRow skips the preamble and finds the header at index 3', () => {
    assert.equal(findHeaderRow(ROWS), 3);
});

test('guessColumns: Debets/Kredīts with signed amounts is the Amount column, Trans. Nr. the bank reference', () => {
    const { columns } = guessColumns(HEADER, TRANSACTIONS);
    assert.equal(columns.date, 0);
    assert.equal(columns.description, 2);
    assert.equal(columns.amount, 5);
    assert.equal(columns.bankRef, 4);
    assert.equal(columns.debit, -1);
    assert.equal(columns.credit, -1);
    assert.equal(columns.direction, -1);
});

test('rowsToStatement: signed amounts give the direction, Trans. Nr. is the bank reference', () => {
    const { headerRow, layout } = guessed();
    const { rows } = rowsToStatement(ROWS, headerRow, layout);
    assert.equal(rows.length, 4);

    assert.equal(rows[0].direction, 'out');
    assert.equal(rows[0].amountCents, 880);
    assert.equal(rows[0].bankRef, 'ET00000000000A');

    assert.equal(rows[1].direction, 'in');
    assert.equal(rows[1].amountCents, 114041);
    assert.equal(rows[1].bankRef, 'FT00000000000B');
});

test('rowsToStatement: every footer line is a summary row', () => {
    const { headerRow, layout } = guessed();
    const { skipped } = rowsToStatement(ROWS, headerRow, layout);
    assert.equal(skipped.length, FOOTER.length);
    for (const entry of skipped) {
        assert.equal(entry.reason, 'summary row');
    }
    const firstFooterLine = headerRow + 1 + TRANSACTIONS.length + 1;
    assert.deepEqual(skipped.map((entry) => entry.line), FOOTER.map((_, i) => firstFooterLine + i));
});

test('rowsToStatement: a dated row that mentions summa stays a transaction', () => {
    const { layout } = guessed();
    const rows = [
        HEADER,
        ['14.10.2026', 'PIRKUMS', 'details\nSUMMA KAFE PARAUGS', '', 'ET00000000000E', '-4.2'],
        ['14.10.2026', 'PIRKUMS', 'Summa', '', 'ET00000000000F', '-1.1'],
        ['14.10.2026', 'PIRKUMS', 'Komisiju summa', '', 'ET00000000000G', '-0.5'],
        ['', '', '', '', 'Komisiju summa', '0.00'],
    ];
    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows.map((row) => row.amountCents), [420, 110, 50]);
    assert.deepEqual(result.skipped, [{ line: 5, reason: 'summary row' }]);
});

test('money in and money out match the sum of the positive and of the negative amounts', () => {
    const { headerRow, layout } = guessed();
    const { rows } = rowsToStatement(ROWS, headerRow, layout);
    const amounts = TRANSACTIONS.map((row) => Math.round(Number(row[5]) * 100));
    const expectedIn = amounts.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const expectedOut = amounts.filter((v) => v < 0).reduce((a, b) => a - b, 0);
    const moneyIn = rows.filter((r) => r.direction === 'in').reduce((a, r) => a + r.amountCents, 0);
    const moneyOut = rows.filter((r) => r.direction === 'out').reduce((a, r) => a + r.amountCents, 0);
    assert.equal(moneyIn, expectedIn);
    assert.equal(moneyOut, expectedOut);
    assert.equal(moneyIn, 114041);
    assert.equal(moneyOut, 880 + 5217 + 350);
});

test('regression: Debit/Credit with D/C letters is still the direction column', () => {
    const samples = [
        ['01.10.2026', 'Shop', 'D'],
        ['02.10.2026', 'Salary', 'C'],
        ['03.10.2026', 'Cafe', 'D'],
    ];
    const { columns } = guessColumns(['Date', 'Description', 'Debit/Credit'], samples);
    assert.equal(columns.direction, 2);
    assert.equal(columns.amount, -1);
    assert.equal(columns.debit, -1);
});

test('regression: Amount plus Debit/Credit letters keeps amount and direction apart', () => {
    const samples = [
        ['01.10.2026', 'Shop', '12.50', 'D'],
        ['02.10.2026', 'Salary', '900.00', 'C'],
        ['03.10.2026', 'Cafe', '3.20', 'D'],
    ];
    const { columns } = guessColumns(['Date', 'Description', 'Amount', 'Debit/Credit'], samples);
    assert.equal(columns.amount, 2);
    assert.equal(columns.direction, 3);
});

test('dates: dotted day-first samples with every day 12 or less guess DMY', () => {
    const samples = [
        ['01.10.2026', 'A', '-1.00'],
        ['05.10.2026', 'B', '-2.00'],
        ['12.10.2026', 'C', '-3.00'],
    ];
    assert.equal(guessColumns(['Datums', 'Apraksts', 'Summa'], samples).dateFormat, 'DMY');
});

test('dates: inferDateFormat stays null for ambiguous slash and dotted samples', () => {
    assert.equal(inferDateFormat(['01/10/2026', '05/10/2026']), null);
    assert.equal(inferDateFormat(['01.02.2026', '03.04.2026']), null);
});
