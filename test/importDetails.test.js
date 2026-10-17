import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBankDetails } from '../src/import/details.js';
import { findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';

// All data below is made up, in the shape of a Citadele "Darījuma detaļas" cell.

const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;
const PERSONAL_CODE = /\d{6}-\d{5}/;
const ELEVEN_DIGITS = /\b\d{11}\b/;

function assertNoPersonalData(result) {
    for (const value of [result.description, result.counterparty]) {
        assert.doesNotMatch(value, IBAN);
        assert.doesNotMatch(value, PERSONAL_CODE);
        assert.doesNotMatch(value, ELEVEN_DIGITS);
        assert.doesNotMatch(value, /\*/);
    }
}

test('card payment: merchant, card date and MCC; the booking date is left to the caller', () => {
    const cell = '28/09/2026 400000******0000 MCC-5814 REF: 100001\nKAFEJNICA PARAUGS RIGA LV 10000001';
    assert.deepEqual(splitBankDetails(cell, '2026-10-01'), {
        description: '',
        counterparty: 'KAFEJNICA PARAUGS RIGA',
        date: '2026-09-28',
        mcc: '5814',
    });
});

test('card payment: country code and terminal id are stripped from the second line', () => {
    const cases = [
        ['Bistro Riga Riga LV GPL72580', 'Bistro Riga Riga'],
        ['BOLT.EU/R/2610061652 Tallinn EE', 'BOLT.EU/R/2610061652 Tallinn'],
        ['Hotel at Booking.com Amsterdam NL', 'Hotel at Booking.com Amsterdam'],
        ['Revolut**6588* Dublin IE', 'Revolut**6588* Dublin'],
    ];
    for (const [line2, expected] of cases) {
        const result = splitBankDetails(`28/09/2026 400000******0000 MCC-5814 REF: 100001\n${line2}`, '2026-10-01');
        assert.equal(result.counterparty, expected, line2);
        assert.equal(result.description, '');
    }
});

test('card payment: a CRLF cell and a card line without a second line', () => {
    const crlf = splitBankDetails('28/09/2026 400000******0000 MCC-5411 REF: 100002\r\nVEIKALS PARAUGS RIGA LV', '2026-10-01');
    assert.deepEqual(crlf, { description: '', counterparty: 'VEIKALS PARAUGS RIGA', date: '2026-09-28', mcc: '5411' });

    const alone = splitBankDetails('28/09/2026 400000******0000 MCC-5411 REF: 100002', '2026-10-01');
    assert.deepEqual(alone, { description: '', counterparty: '', date: '2026-09-28', mcc: '5411' });
});

test('card date window: 0 and 60 days before the booking date count, 61 days before and after do not', () => {
    const cell = (day) => `${day} 400000******0000 MCC-5814 REF: 100001\nKAFEJNICA PARAUGS RIGA LV`;
    assert.equal(splitBankDetails(cell('01/10/2026'), '2026-10-01').date, '2026-10-01');
    assert.equal(splitBankDetails(cell('02/08/2026'), '2026-10-01').date, '2026-08-02');
    assert.equal(splitBankDetails(cell('01/08/2026'), '2026-10-01').date, '');
    assert.equal(splitBankDetails(cell('02/10/2026'), '2026-10-01').date, '');
    // the merchant and the MCC survive a rejected date
    const late = splitBankDetails(cell('01/08/2026'), '2026-10-01');
    assert.equal(late.counterparty, 'KAFEJNICA PARAUGS RIGA');
    assert.equal(late.mcc, '5814');
});

test('card date window: impossible days and a bad booking date give no date; 29 February in a leap year is real', () => {
    const cell = (day) => `${day} 400000******0000 MCC-5814 REF: 100001\nKAFEJNICA PARAUGS RIGA LV`;
    assert.equal(splitBankDetails(cell('31/02/2026'), '2026-03-02').date, '');
    assert.equal(splitBankDetails(cell('28/09/2026'), '').date, '');
    assert.equal(splitBankDetails(cell('28/09/2026'), 'not a date').date, '');
    assert.equal(splitBankDetails(cell('28/09/2026'), '2026-13-40').date, '');
    assert.equal(splitBankDetails(cell('29/02/2028'), '2028-03-01').date, '2028-02-29');
    assert.equal(splitBankDetails(cell('29/02/2027'), '2027-03-01').date, '');
});

test('card date window works across a year change', () => {
    const cell = '28/12/2025 400000******0000 MCC-5814 REF: 100001\nKAFEJNICA PARAUGS RIGA LV';
    assert.equal(splitBankDetails(cell, '2026-01-02').date, '2025-12-28');
});

test('card fee: a lone card mask is left as it is', () => {
    const result = splitBankDetails('400000******0000', '2026-10-01');
    assert.deepEqual(result, { description: '400000******0000', counterparty: '', date: '', mcc: '' });
});

test('transfers: name only as counterparty, purpose as description, no codes or IBANs', () => {
    const cases = [
        // registration number + BIC + IBAN
        ['Tele2 rēķins ?514995164?\nPARAUGS SIA 40000000000 HABALV22 LV00HABA0000000000001\nMaksātāja reference: NOTPROVIDED',
            'PARAUGS SIA', 'Tele2 rēķins ?514995164?'],
        // personal code + BIC11 + IBAN
        ['Darba algas izmaksa par 2026. gada septembri\nJĀNIS ĶĒNIŅŠ 010190-12345 HABALV22XXX LV00HABA0000000000002\nMaksātāja reference: 12345',
            'JĀNIS ĶĒNIŅŠ', 'Darba algas izmaksa par 2026. gada septembri'],
        // bank phrase "AS IN LATVIA"
        ['Savstarpēji norēķini\nTELE2 SIA SWEDBANK AS IN LATVIA SWEDBANK AS LV00HABA0000000000003\nMaksātāja reference: NOTPROVIDED',
            'TELE2 SIA', 'Savstarpēji norēķini'],
        // bank phrase AS "CITADELE BANKA"
        ['Avanss\nŽANIS BĒRZIŅŠ AS "CITADELE BANKA" PARXLV22 LV00PARX0000000000004\nMaksātāja reference: NOTPROVIDED',
            'ŽANIS BĒRZIŅŠ', 'Avanss'],
    ];
    for (const [cell, counterparty, description] of cases) {
        const result = splitBankDetails(cell, '2026-10-01');
        assert.equal(result.counterparty, counterparty);
        assert.equal(result.description, description);
        assert.equal(result.date, '');
        assert.equal(result.mcc, '');
        assertNoPersonalData(result);
        assert.doesNotMatch(result.description + result.counterparty, /Maksātāja reference/);
    }
});

test('transfer without a purpose line: description is empty', () => {
    const result = splitBankDetails('PARAUGS SIA 40000000000 HABALV22 LV00HABA0000000000001\nMaksātāja reference: NOTPROVIDED', '2026-10-01');
    assert.equal(result.counterparty, 'PARAUGS SIA');
    assert.equal(result.description, '');
});

test('transfer: a capital word is not cut as a BIC unless the IBAN follows it', () => {
    const result = splitBankDetails('Rēķins\nLATVENERGO SIA 40000000000 HABALV22 LV00HABA0000000000001', '2026-10-01');
    assert.equal(result.counterparty, 'LATVENERGO SIA');
    const noBank = splitBankDetails('Rēķins\nLATVENERGO KOMPANIJA LV00HABA0000000000001', '2026-10-01');
    assert.equal(noBank.counterparty, 'LATVENERGO KOMPANIJA');
});

test('transfer: the party line is the last IBAN line; an IBAN in the purpose is scrubbed', () => {
    const cell = 'Atmaksa uz LV00HABA0000000000009 par nomu\nPARAUGS SIA 40000000000 HABALV22 LV00HABA0000000000001\nMaksātāja reference: NOTPROVIDED';
    const result = splitBankDetails(cell, '2026-10-01');
    assert.equal(result.counterparty, 'PARAUGS SIA');
    assert.equal(result.description, 'Atmaksa uz par nomu');
    assertNoPersonalData(result);
});

test('shapes that are not a card payment or a transfer stay as today, whitespace collapsed', () => {
    assert.deepEqual(
        splitBankDetails('Rent  for\n October   2026', '2026-10-01'),
        { description: 'Rent for October 2026', counterparty: '', date: '', mcc: '' },
    );
    // a single line, even with an IBAN in it, is not a transfer
    assert.deepEqual(
        splitBankDetails('Return to  LV00HABA0000000000001', '2026-10-01'),
        { description: 'Return to LV00HABA0000000000001', counterparty: '', date: '', mcc: '' },
    );
    assert.deepEqual(
        splitBankDetails('details\nKAFEJNICA PARAUGS', '2026-10-01'),
        { description: 'details KAFEJNICA PARAUGS', counterparty: '', date: '', mcc: '' },
    );
    assert.deepEqual(splitBankDetails('', '2026-10-01'), { description: '', counterparty: '', date: '', mcc: '' });
});

// A Citadele-shaped table: preamble, header at index 3, one signed amount column, footer lines.
const HEADER = ['Datums', 'Veids', 'Darījuma detaļas', 'Maks. Nr.', 'Trans. Nr.', 'Debets/Kredīts'];
const TRANSACTIONS = [
    ['01.10.2026', 'PIRKUMS', '28/09/2026 400000******0000 MCC-5814 REF: 100001\nKAFEJNICA PARAUGS RIGA LV 10000001', '', 'ET00000000000A', '-8.8'],
    ['02.10.2026', 'MAKSA PAR KARTI', '400000******0000', '', 'ET00000000000B', '-0.5'],
    ['05.10.2026', 'IENĀKOŠAIS EKS MAKSĀJUMS', 'Darba algas izmaksa\nJĀNIS PARAUGS 010190-12345 HABALV22XXX LV00HABA0000000000002\nMaksātāja reference: NOTPROVIDED', '2026100500000001', 'FT00000000000C', '1140.41'],
    ['06.10.2026', 'PIRKUMS', '05/10/2026 400000******0000 MCC-6012 REF: 100003\nRevolut**6588* Dublin IE', '', 'ET00000000000D', '-20'],
];
const FOOTER = [
    ['', '', '', '', 'Beigu atlikums:', '1000.00'],
    ['', '', '', '', 'Debeta apgrozījums:', '29.30'],
];
const ROWS = [
    ['Konts', 'XXXXXXX'],
    ['No', '01.10.2026', 'līdz', '17.10.2026'],
    ['', '', '', '', 'Sākuma atlikums:', '75.31'],
    HEADER,
    ...TRANSACTIONS,
    ...FOOTER,
];

function layoutFor(rows, sampleSize) {
    const headerRow = findHeaderRow(rows);
    const guess = guessColumns(rows[headerRow], rows.slice(headerRow + 1, headerRow + 1 + sampleSize));
    return { headerRow, layout: { columns: guess.columns, dateFormat: guess.dateFormat, decimalSeparator: guess.decimalSeparator } };
}

test('rowsToStatement on a Citadele-shaped table splits payee, text, date and MCC per row', () => {
    const { headerRow, layout } = layoutFor(ROWS, TRANSACTIONS.length);
    assert.equal(headerRow, 3);
    const { rows } = rowsToStatement(ROWS, headerRow, layout);
    assert.equal(rows.length, 4);

    assert.equal(rows[0].counterparty, 'KAFEJNICA PARAUGS RIGA');
    assert.equal(rows[0].description, '');
    assert.equal(rows[0].date, '2026-09-28');
    assert.equal(rows[0].mcc, '5814');

    assert.equal(rows[1].counterparty, '');
    assert.equal(rows[1].description, '400000******0000');
    assert.equal(rows[1].date, '2026-10-02');
    assert.equal('mcc' in rows[1], false);

    assert.equal(rows[2].counterparty, 'JĀNIS PARAUGS');
    assert.equal(rows[2].description, 'Darba algas izmaksa');
    assert.equal(rows[2].date, '2026-10-05');
    assert.equal('mcc' in rows[2], false);
    assert.equal(rows[2].bankRef, 'FT00000000000C');

    assert.equal(rows[3].counterparty, 'Revolut**6588* Dublin');
    assert.equal(rows[3].date, '2026-10-05');
    assert.equal(rows[3].mcc, '6012');
});

test('rowsToStatement leaves a table without these shapes exactly as before', () => {
    const rows = [
        ['Date', 'Description', 'Amount'],
        ['2026-10-01', 'CARD PAYMENT SHOP 1', '-12.50'],
        ['2026-10-02', 'Salary October', '1500.00'],
    ];
    const { headerRow, layout } = layoutFor(rows, 2);
    const { rows: out } = rowsToStatement(rows, headerRow, layout);
    assert.deepEqual(out, [
        {
            date: '2026-10-01', amountCents: 1250, direction: 'out', currency: 'EUR', originalAmountCents: 1250,
            description: 'CARD PAYMENT SHOP 1', counterparty: '', bankRef: '',
        },
        {
            date: '2026-10-02', amountCents: 150000, direction: 'in', currency: 'EUR', originalAmountCents: 150000,
            description: 'Salary October', counterparty: '', bankRef: '',
        },
    ]);
});
