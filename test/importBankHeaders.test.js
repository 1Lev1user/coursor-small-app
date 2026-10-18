import test from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeBytes, parseDelimited, findHeaderRow, guessColumns, rowsToStatement,
} from '../src/import/text.js';
import { defaultData } from '../src/model.js';
import { defaultDecisions, findDuplicates, fingerprint } from '../src/import/core.js';

// Made-up files in the documented header shapes of each bank. Names and account numbers are invented.

/** Text -> guessed columns and statement, the same pipeline the import screen runs. */
function runText(text) {
    const { rows } = parseDelimited(text);
    const headerRow = findHeaderRow(rows);
    const guess = guessColumns(rows[headerRow], rows.slice(headerRow + 1));
    const statement = rowsToStatement(rows, headerRow, {
        columns: guess.columns,
        dateFormat: guess.dateFormat,
        decimalSeparator: guess.decimalSeparator,
    });
    return { guess, statement, header: rows[headerRow] };
}

const run = (...lines) => runText(lines.join('\n') + '\n');
const summary = (statement) => statement.rows.map((r) => [r.date, r.direction, r.amountCents]);
const total = (statement, direction) => statement.rows
    .filter((r) => r.direction === direction)
    .reduce((sum, r) => sum + r.amountCents, 0);

/** Guesses for one header with a single sample row of the same width. */
function guessHeader(...header) {
    return guessColumns(header, [header.map(() => 'x')]).columns;
}

const SWEDBANK_LV_HEADER = 'Klienta konts;Ieraksta tips;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts;Arhīva kods;Maksājuma veids;Refernces numurs;Dokumenta numurs';
const SWEDBANK_LV_ROWS = [
    'LV00TEST0000000000001;20;03.09.2026;SIA PARAUGS;Rēķins 5;25,00;EUR;D;2026090301A1;MAK;REF5;D100',
    'LV00TEST0000000000001;20;03.09.2026;SWEDBANK;Komisija;0,10;EUR;D;2026090301A1;KOM;;D100',
    'LV00TEST0000000000001;20;14.09.2026;Anna Paraugs;Rent;300,00;EUR;K;2026090402B2;MAK;;D101',
];

const SEB_HEADER = '"DOK NR.";"DATA";"VALIUTA";"SUMA";"MOKĖTOJO ARBA GAVĖJO PAVADINIMAS";"MOKĖTOJO ARBA GAVĖJO IDENTIFIKACINIS KODAS";"SĄSKAITA";"KREDITO ĮSTAIGOS PAVADINIMAS";"KREDITO ĮSTAIGOS SWIFT KODAS";"MOKĖJIMO PASKIRTIS";"TRANSAKCIJOS KODAS";"DOKUMENTO DATA";"TRANSAKCIJOS TIPAS";"NUORODA";"DEBETAS/KREDITAS";"SUMA SĄSKAITOS VALIUTA";"SĄSKAITOS NR";"SĄSKAITOS VALIUTA";';
const SEB_TITLE = (n) => `"SĄSKAITOS IŠRAŠAS LT00TEST0000000000${n}";;;;;;;;;;;;;;;;;;`;
const SEB_FILE = [
    SEB_TITLE(1),
    SEB_HEADER,
    '"1";"2026-09-03";"EUR";"25,00";"UAB PAVYZDYS";"123456789";"LT000000000000000001";"BANKAS";"TESTLT00";"Saskaita 5";"TX001";"2026-09-02";"MK";"N1";"D";"25,00";"LT00TEST00000000001";"EUR";',
    '"2";"2026-09-04";"EUR";"300,00";"Jonas Jonaitis";"";"LT000000000000000002";"BANKAS";"TESTLT00";"Alga";"TX002";"2026-09-04";"MK";"N2";"C";"300,00";"LT00TEST00000000001";"EUR";',
    SEB_TITLE(2),
    SEB_HEADER,
    '"3";"2026-09-05";"EUR";"10,00";"UAB KITAS";"987654321";"LT000000000000000003";"BANKAS";"TESTLT00";"Maistas";"TX003";"2026-09-05";"MK";"N3";"D";"10,00";"LT00TEST00000000002";"EUR";',
];

const LHV_ET_HEADER = '"Kliendi konto","Kuupäev","Saaja/maksja konto","Saaja/maksja nimi","Deebet/Kreedit (D/C)","Summa","Arhiveerimistunnus","Selgitus","Valuuta","Isikukood või registrikood","Kande viide"';
const LHV_EN_HEADER = 'Customer account no, Date, Sender/receiver account, Sender/receiver name, Debit/Credit (D/C), Amount, Archiving code, Description, Currency, Personal code or register code, Transaction reference';

const WISE_HEADER = '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"';

const N26_HEADER = '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"';

test('Revolut: Started Date is the date, fee and state are found, a pending row is skipped', () => {
    const { guess, statement } = run(
        'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
        'CARD_PAYMENT,Current,2026-09-03 9:15:02,2026-09-04 10:00:00,Shop One,-12.50,0.00,EUR,COMPLETED,987.50',
        'TOPUP,Current,2026-09-05 08:00:00,2026-09-05 08:00:05,Top-up,200.00,0.00,EUR,COMPLETED,1187.50',
        'CARD_PAYMENT,Current,2026-09-06 12:30:00,,Pending Shop,-5.00,0.00,EUR,PENDING,',
        'EXCHANGE,Current,2026-09-07 07:00:00,2026-09-07 07:00:01,Exchanged to USD,-100.00,1.50,EUR,COMPLETED,1086.00',
    );
    const c = guess.columns;
    assert.deepEqual([c.date, c.description, c.amount, c.fee, c.currency, c.status], [2, 4, 5, 6, 7, 8]);
    assert.equal('counterparty' in c, false);
    assert.equal(c.direction, -1);
    assert.equal(c.bankRef, -1);
    assert.deepEqual(summary(statement), [
        ['2026-09-03', 'out', 1250],
        ['2026-09-05', 'in', 20000],
        ['2026-09-07', 'out', 10150],
    ]);
    assert.deepEqual(statement.skipped, [{ line: 4, reason: 'not completed' }]);
});

test('Swedbank LV: the columns are found and rows sharing the archive code are all kept', () => {
    const { guess, statement } = run(SWEDBANK_LV_HEADER, ...SWEDBANK_LV_ROWS);
    const c = guess.columns;
    assert.deepEqual(
        [c.date, c.counterparty, c.description, c.amount, c.currency, c.direction, c.bankRef],
        [2, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(summary(statement), [
        ['2026-09-03', 'out', 2500],
        ['2026-09-03', 'out', 10],
        ['2026-09-14', 'in', 30000],
    ]);
    assert.equal(statement.rows[0].bankRef, statement.rows[1].bankRef);
    assert.equal(total(statement, 'in'), 30000);
    assert.equal(total(statement, 'out'), 2510);
});

test('Swedbank LV: a KOM commission with the payment archive code is not a duplicate of the payment', () => {
    const { statement } = run(SWEDBANK_LV_HEADER, ...SWEDBANK_LV_ROWS);
    const [payment, commission] = statement.rows;
    const entry = (row, id) => ({
        id,
        categoryId: 'random',
        subcategoryId: '',
        amountCents: row.amountCents,
        note: row.description,
        date: row.date,
        bankRef: row.bankRef,
        importId: 'imp_a',
        fingerprint: fingerprint(row),
    });

    const paymentOnly = defaultData();
    paymentOnly.expenses = [entry(payment, 'e1')];
    assert.deepEqual(findDuplicates(paymentOnly, statement.rows).map((m) => m.level), ['exact', null, null]);

    const both = defaultData();
    both.expenses = [entry(payment, 'e1'), entry(commission, 'e2')];
    const result = findDuplicates(both, statement.rows);
    assert.deepEqual(result.map((m) => m.level), ['exact', 'exact', null]);
    assert.deepEqual(result.slice(0, 2).map((m) => m.matchId), ['e1', 'e2']);
});

test('Swedbank EE: the header with spaces after the separators gives payee and archive code', () => {
    const { guess, statement } = run(
        'Reatüüp; Kuupäev; Saaja/Maksja; Selgitus; Summa; Valuuta; Deebet/Kreedit; Arhiveerimistunnus; Tehingu tüüp',
        '20;03.09.2026;OU PARAGRAF;Arve 5;25,00;EUR;D;2026090301A1;MK',
        '20;14.09.2026;Mari Maasikas;Rent;300,00;EUR;K;2026090402B2;MK',
    );
    const c = guess.columns;
    assert.deepEqual(
        [c.date, c.counterparty, c.description, c.amount, c.currency, c.direction, c.bankRef],
        [1, 2, 3, 4, 5, 6, 7],
    );
    assert.deepEqual(summary(statement), [['2026-09-03', 'out', 2500], ['2026-09-14', 'in', 30000]]);
    assert.deepEqual(statement.rows.map((r) => [r.counterparty, r.bankRef]), [
        ['OU PARAGRAF', '2026090301A1'],
        ['Mari Maasikas', '2026090402B2'],
    ]);
});

test('SEB LT: columns of the 18-column header, with a title line, a trailing separator and a second account', () => {
    const { guess, statement, header } = run(...SEB_FILE);
    assert.equal(header[1], 'DATA');
    const c = guess.columns;
    assert.deepEqual(
        [c.date, c.currency, c.amount, c.counterparty, c.description, c.bankRef, c.direction],
        [1, 2, 3, 4, 9, 10, 14],
    );
    assert.equal(c.debit, -1);
    assert.equal(c.credit, -1);
    assert.equal(guess.decimalSeparator, ',');
    assert.deepEqual(summary(statement), [
        ['2026-09-03', 'out', 2500],
        ['2026-09-04', 'in', 30000],
        ['2026-09-05', 'out', 1000],
    ]);
    assert.deepEqual(statement.rows.map((r) => r.bankRef), ['TX001', 'TX002', 'TX003']);
    assert.equal(total(statement, 'in'), 30000);
    assert.equal(total(statement, 'out'), 3500);
});

test('SEB LT: the repeated title and header lines are skipped, the header as a summary row', () => {
    const { statement } = run(...SEB_FILE);
    assert.equal(statement.rows.length, 3);
    assert.deepEqual(statement.skipped, [
        { line: 5, reason: 'unparsable date' },
        { line: 6, reason: 'summary row' },
    ]);
});

test('LHV (Estonian, with a BOM): payee, archive code and the direction from D/C whatever the sign of Summa', () => {
    const body = [
        LHV_ET_HEADER,
        '"EE000000000000000001","2026-09-03","EE000000000000000002","OU PARAGRAF","D","25.00","A1","Arve 5","EUR","12345678","R1"',
        '"EE000000000000000001","2026-09-04","EE000000000000000003","Mari Maasikas","C","-300.00","A2","Palk","EUR","","R2"',
        '"EE000000000000000001","2026-09-05","EE000000000000000004","Kaupmees","D","-12.40","A3","Ost","EUR","","R3"',
        '"EE000000000000000001","2026-09-06","EE000000000000000005","Tagastus","C","10.00","A4","Tagasimakse","EUR","","R4"',
    ].join('\n') + '\n';
    const bytes = Uint8Array.from([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(body)]);
    const { text } = decodeBytes(bytes);
    const { guess, statement } = runText(text);
    const c = guess.columns;
    assert.deepEqual(
        [c.date, c.counterparty, c.direction, c.amount, c.bankRef, c.description, c.currency],
        [1, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(summary(statement), [
        ['2026-09-03', 'out', 2500],
        ['2026-09-04', 'in', 30000],
        ['2026-09-05', 'out', 1240],
        ['2026-09-06', 'in', 1000],
    ]);
    assert.deepEqual(statement.rows.map((r) => [r.counterparty, r.bankRef]), [
        ['OU PARAGRAF', 'A1'], ['Mari Maasikas', 'A2'], ['Kaupmees', 'A3'], ['Tagastus', 'A4'],
    ]);
    assert.equal(total(statement, 'in'), 31000);
    assert.equal(total(statement, 'out'), 3740);
});

test('LHV (English): the archiving code is the bank reference, the transaction reference is the fallback', () => {
    const { guess, statement } = run(
        LHV_EN_HEADER,
        'EE000000000000000001,2026-09-03,EE000000000000000002,PARAGRAF OU,D,-25.00,A1,Invoice 5,EUR,12345678,R1',
        'EE000000000000000001,2026-09-04,EE000000000000000003,Mari Maasikas,C,300.00,A2,Salary,EUR,,R2',
    );
    const c = guess.columns;
    assert.deepEqual([c.counterparty, c.direction, c.amount, c.bankRef, c.description], [3, 4, 5, 6, 7]);
    assert.deepEqual(summary(statement), [['2026-09-03', 'out', 2500], ['2026-09-04', 'in', 30000]]);
    assert.deepEqual(statement.rows.map((r) => r.bankRef), ['A1', 'A2']);

    assert.equal(guessHeader('Date', 'Amount', 'Debit/Credit (D/C)', 'Transaction reference').bankRef, 3);
    assert.equal(guessHeader('Kuupäev', 'Summa', 'Kande viide').bankRef, 2);
});

test('Wise: amount is the signed Amount, no payee or fee column, TransferWise ID is the reference', () => {
    const { guess, statement } = run(
        WISE_HEADER,
        'CARD-1,13-09-2026,"2026-09-03 10:00:00.123",-12.50,EUR,"Card transaction of 12.50 EUR issued by SHOP ONE",,987.50,,,,,,,SHOP ONE,1234,Test Person,,,0.25,,DEBIT,CARD',
        'TRANSFER-2,14-09-2026,"2026-09-04 11:00:00.000",-30.00,EUR,"Sent money to Anna Paraugs",rent,957.50,,,,,Anna Paraugs,EE000000000000000009,,,,,,0.00,,DEBIT,TRANSFER',
        'TRANSFER-3,15-09-2026,"2026-09-05 12:00:00.000",200.00,EUR,"Received money from Jonas Jonaitis",,1157.50,,,,Jonas Jonaitis,,,,,,,,0.00,,CREDIT,TRANSFER',
    );
    const c = guess.columns;
    assert.equal(guess.dateFormat, 'DMY');
    assert.deepEqual([c.date, c.amount, c.currency, c.description, c.bankRef], [1, 3, 4, 5, 0]);
    assert.equal('counterparty' in c, false);
    assert.equal('fee' in c, false);
    assert.deepEqual(summary(statement), [
        ['2026-09-13', 'out', 1250],
        ['2026-09-14', 'out', 3000],
        ['2026-09-15', 'in', 20000],
    ]);
    assert.equal(total(statement, 'in'), 20000);
    assert.equal(total(statement, 'out'), 4250);
    assert.equal(statement.rows[0].description, 'Card transaction of 12.50 EUR issued by SHOP ONE');
});

test('N26: Amount (EUR) is the amount, Booking Date the date, the partner name the payee, a foreign row stays EUR', () => {
    const { guess, statement } = run(
        N26_HEADER,
        '2026-09-13,2026-09-13,"Shop One","DE00000000000000000001","Presentation","","Main",-12.50,,,',
        '2026-09-14,2026-09-15,"Hotel Oslo","NO0000000000001","Presentation","Room","Main",-25.67,-299.00,NOK,0.0858',
        '2026-09-15,2026-09-15,"Anna Paraugs","DE00000000000000000002","Income","Rent","Main",300.00,,,',
    );
    const c = guess.columns;
    assert.deepEqual([c.date, c.counterparty, c.description, c.amount], [0, 2, 5, 7]);
    assert.equal(c.currency, -1);
    assert.deepEqual(summary(statement), [
        ['2026-09-13', 'out', 1250],
        ['2026-09-14', 'out', 2567],
        ['2026-09-15', 'in', 30000],
    ]);
    assert.equal(statement.rows[1].currency, 'EUR');
    assert.equal(statement.rows[1].counterparty, 'Hotel Oslo');
    assert.equal(total(statement, 'in'), 30000);
    assert.equal(total(statement, 'out'), 3817);
});

test('account and code headers are never the payee', () => {
    for (const name of [
        'Saaja/maksja konto',
        'Partner Iban',
        'Payee Account Number',
        'MOKĖTOJO ARBA GAVĖJO IDENTIFIKACINIS KODAS',
        'Sender/receiver account',
        'Payee Nr',
        'SĄSKAITA',
    ]) {
        const columns = guessHeader('Date', name, 'Amount');
        assert.equal('counterparty' in columns, false, name);
    }
});

test('the payee header words of the banks give the counterparty', () => {
    for (const name of ['Saaja', 'Saaja/maksja nimi', 'Partner Name', 'GAVĖJO PAVADINIMAS', 'Sender/receiver name']) {
        const columns = guessHeader('Date', name, 'Amount');
        assert.equal(columns.counterparty, 1, name);
    }
});

test('a header with both Payer Name and Payee Name maps no payee', () => {
    const columns = guessHeader('Date', 'Amount', 'Description', 'Payer Name', 'Payee Name', 'Merchant');
    assert.equal('counterparty' in columns, false);
});

test('Original Currency is not the currency column, and a repeated header among the samples is ignored', () => {
    const columns = guessHeader('Booking Date', 'Amount (EUR)', 'Original Amount', 'Original Currency');
    assert.equal(columns.currency, -1);

    const header = ['Datums', 'Summa', 'Apraksts'];
    const guess = guessColumns(header, [header, ['13.09.2026', '12,50', 'Pirkums'], header, ['14.09.2026', '5,00', 'Kafija']]);
    assert.equal(guess.columns.date, 0);
    assert.equal(guess.columns.amount, 1);
});

test('Payment reference is the description only when no other header names the details', () => {
    assert.equal(guessHeader('Date', 'Payment reference', 'Details', 'Amount').description, 2);
    assert.equal(guessHeader('Date', 'Payment reference', 'Amount').description, 1);
});

// --- foreign card payments (details.js `original`) ---

const SWEDBANK_FX = 'PIRKUMS 400000******0000 2026.09.02 12.34 24.90 CHF VALŪTAS KURSS 1.0712 KONVERTĀCIJAS MAKSA 0.52 EUR (123456) SHOP PARAUGS';
const SWEDBANK_EUR = 'PIRKUMS 400000******0000 2026.09.03 12.34 5.00 EUR (123456) KAFEJNICA';
const SEB_FX = '28/09/2026 18:02 299.00 NOK(25.67 EUR + mokestis 0.68 EUR(2.65%)) kortelė...000000 ALLE PARAUGS!/OSLO/NOR #468544, dok. nr. CLR2';

test('Swedbank foreign card payment booked in EUR shows the original currency and keeps the EUR amount', () => {
    const { statement } = run(
        'Klienta konts;Ieraksta tips;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts;Arhīva kods',
        `LV00TEST0000000000001;20;13.09.2026;;${SWEDBANK_FX};23,77;EUR;D;A1`,
        `LV00TEST0000000000001;20;14.09.2026;;${SWEDBANK_EUR};5,00;EUR;D;A2`,
    );
    const [foreign, plain] = statement.rows;
    assert.equal(foreign.amountCents, 2377);
    assert.equal(foreign.currency, 'CHF');
    assert.equal(foreign.originalAmountCents, 2490);
    assert.equal(foreign.counterparty, 'SHOP PARAUGS');
    assert.equal(plain.currency, 'EUR');
    assert.equal(plain.amountCents, 500);
    assert.equal(plain.originalAmountCents, 500);
    assert.equal(plain.counterparty, 'KAFEJNICA');
});

test('SEB foreign card payment booked in EUR shows the original currency and keeps the EUR amount', () => {
    const { statement } = run(
        'DATA;SUMA;VALIUTA;MOKĖJIMO PASKIRTIS;DEBETAS/KREDITAS',
        `2026-09-28;26,35;EUR;${SEB_FX};D`,
    );
    const [row] = statement.rows;
    assert.equal(row.amountCents, 2635);
    assert.equal(row.currency, 'NOK');
    assert.equal(row.originalAmountCents, 29900);
    assert.equal(row.direction, 'out');
});

test('a foreign card payment without a currency column behaves like EUR, and a real non-EUR row is unchanged', () => {
    const noCurrency = run(
        'Datums;Informācija saņēmējam;Summa;Debets/Kredīts',
        `13.09.2026;${SWEDBANK_FX};23,77;D`,
    );
    const [converted] = noCurrency.statement.rows;
    assert.equal(converted.currency, 'CHF');
    assert.equal(converted.amountCents, 2377);
    assert.equal(converted.originalAmountCents, 2490);

    const { statement } = run(
        'Datums;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts',
        `13.09.2026;${SWEDBANK_FX};24,90;CHF;D`,
    );
    const [row] = statement.rows;
    assert.equal(row.currency, 'CHF');
    assert.equal(row.amountCents, null);
    assert.equal(row.originalAmountCents, 2490);
});

test('a foreign card payment is a normal expense in the default decisions, not a foreign row', () => {
    const { statement } = run(
        'DATA;SUMA;VALIUTA;MOKĖJIMO PASKIRTIS;DEBETAS/KREDITAS',
        `2026-09-28;26,35;EUR;${SEB_FX};D`,
    );
    const [decision] = defaultDecisions(defaultData(), statement.rows, statement.rows.map(() => null));
    assert.notEqual(decision.kind, 'foreign');
});
