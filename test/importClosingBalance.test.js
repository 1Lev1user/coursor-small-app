import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    readStatementFile, parseLayoutFor, checkSummary, closingBalanceText,
} from '../src/views/import.js';
import { findHeaderRow, guessColumns, rowsToStatement, parseDelimited } from '../src/import/text.js';
import { parseCamt, parseFidavista } from '../src/import/xml.js';
import { readHtmlTable } from '../src/import/htmlTable.js';
import { readSpreadsheetMl } from '../src/import/spreadsheetml.js';

// Card C-113: the closing balance a statement states at its end. All data is made up.

const GUESS_SAMPLE_ROWS = 20; // same literal as startTable in src/views/import.js
const utf8 = (text) => new TextEncoder().encode(text);
const lines = (...rows) => rows.join('\n') + '\n';

/** Table rows to a statement result, with the same steps as the import screen. */
function statementOf(allRows) {
    const table = allRows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    const headerRow = findHeaderRow(table);
    assert.ok(headerRow >= 0, 'no header row found');
    const guess = guessColumns(table[headerRow], table.slice(headerRow + 1, headerRow + 1 + GUESS_SAMPLE_ROWS));
    assert.notEqual(guess.dateFormat, null, 'date format not guessed');
    const columns = { fee: -1, status: -1, counterparty: -1, ...guess.columns, eurAmount: -1 };
    const mode = columns.debit >= 0 || columns.credit >= 0 ? 'split' : 'single';
    const layout = parseLayoutFor({
        columns, mode, decimalSeparator: guess.decimalSeparator, dateFormat: guess.dateFormat, reverse: false,
    });
    return rowsToStatement(table, headerRow, layout);
}

const fromCsv = (text) => statementOf(parseDelimited(text).rows);
const noValue = (result) => assert.equal('closingBalance' in result, false, 'no closingBalance key');

// ---------------------------------------------------------------------------
// The owner's shape: preamble, opening line, header, rows, closing line, turnover lines
// ---------------------------------------------------------------------------

const HEADER = ['Datums', 'Veids', 'Darījuma detaļas', 'Maks. Nr.', 'Trans. Nr.', 'Debets/Kredīts'];
const tx = (date, type, detail, ref, amount) => [date, type, detail, '', ref, amount];
// In 1685.37 and out 1331.53; 75.31 + 1685.37 - 1331.53 = 429.15. 17.10 is not the last row.
const OWNER_ROWS = [
    tx('01.10.2026', 'PIRKUMS', 'Test cafe one', 'ET01', '-120.00'),
    tx('05.10.2026', 'IENĀKOŠAIS EKS MAKSĀJUMS', 'Test salary', 'FT02', '1140.41'),
    tx('06.10.2026', 'PIRKUMS', 'Test shop two', 'ET03', '-80.00'),
    tx('07.10.2026', 'PIRKUMS', 'Test shop three', 'ET04', '-100.00'),
    tx('08.10.2026', 'IENĀKOŠAIS EKS MAKSĀJUMS', 'Test refund payer', 'FT05', '400.00'),
    tx('09.10.2026', 'PIRKUMS', 'Test pharmacy', 'ET06', '-100.00'),
    tx('10.10.2026', 'PIRKUMS', 'Test market', 'ET07', '-331.53'),
    tx('17.10.2026', 'IENĀKOŠAIS EKS MAKSĀJUMS', 'Test friend', 'FT08', '144.96'),
    tx('12.10.2026', 'PIRKUMS', 'Test rent part one', 'ET09', '-300.00'),
    tx('16.10.2026', 'PIRKUMS', 'Test rent part two', 'ET10', '-300.00'),
];
const label = (text, amount) => ['', '', '', '', text, amount];
const OWNER_TURNOVER = [label('Debeta apgrozījums:', '-1331.53'), label('Kredīta apgrozījums:', '1685.37')];

function ownerFile({
    preamble = [['Konts', 'XXXXXXX'], ['No', '2026-10-01', 'līdz', '2026-10-17']],
    opening = [label('Sākuma atlikums:', '75.31')],
    closing = [label('Beigu atlikums:', '429.15')],
    tail = OWNER_TURNOVER,
} = {}) {
    return [...preamble, ...opening, HEADER, ...OWNER_ROWS, ...closing, ...tail];
}

const SAME_ROWS_TOTALS = { rows: 10 };
const sums = (rows) => ({
    in: rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amountCents, 0),
    out: rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amountCents, 0),
});

test('owner shape: the closing line gives 42915 on the period end, rows and totals stay as they are', () => {
    const result = statementOf(ownerFile());
    assert.deepEqual(result.closingBalance, { cents: 42915, date: '2026-10-17' });
    assert.equal(result.rows.length, SAME_ROWS_TOTALS.rows);
    assert.deepEqual(sums(result.rows), { in: 168537, out: 133153 });
    assert.deepEqual(result.skipped, [
        { line: 15, reason: 'summary row' }, { line: 16, reason: 'summary row' }, { line: 17, reason: 'summary row' },
    ]);
});

test('owner shape without the closing line gives no value', () => {
    const result = statementOf(ownerFile({ closing: [], tail: [] }));
    noValue(result);
    assert.equal(result.rows.length, SAME_ROWS_TOTALS.rows);
});

test('period end: dotted date in a separate cell, in the same cell, ISO in the same cell', () => {
    for (const preamble of [
        [['Konts', 'XXXXXXX'], ['No', '01.10.2026', 'līdz', '17.10.2026']],
        [['Konts', 'XXXXXXX'], ['No 01.10.2026 līdz 17.10.2026']],
        [['Konts', 'XXXXXXX'], ['No 2026-10-01 līdz 2026-10-17']],
    ]) {
        assert.deepEqual(statementOf(ownerFile({ preamble })).closingBalance, { cents: 42915, date: '2026-10-17' });
    }
});

test('period end: a period end later than the last booking is the date, not the latest row', () => {
    const preamble = [['Konts', 'XXXXXXX'], ['No', '2026-10-01', 'līdz', '2026-10-31']];
    assert.deepEqual(statementOf(ownerFile({ preamble })).closingBalance, { cents: 42915, date: '2026-10-31' });
});

test('English preamble "from ... to ..." with a "Closing balance,429.15" line', () => {
    const result = statementOf(ownerFile({
        preamble: [['Account', 'XXXXXXX'], ['from', '01.10.2026', 'to', '17.10.2026']],
        closing: [['Closing balance', '429.15']],
        tail: [],
    }));
    assert.deepEqual(result.closingBalance, { cents: 42915, date: '2026-10-17' });
});

test('the label may come with or without a colon', () => {
    for (const text of ['Beigu atlikums', 'Beigu atlikums:', 'BEIGU ATLIKUMS :']) {
        const result = statementOf(ownerFile({ closing: [label(text, '429.15')] }));
        assert.deepEqual(result.closingBalance, { cents: 42915, date: '2026-10-17' }, text);
    }
});

test('no preamble line: the latest booking date of the rows is the date', () => {
    const result = statementOf(ownerFile({ preamble: [] }));
    assert.deepEqual(result.closingBalance, { cents: 42915, date: '2026-10-17' });
    const earlier = statementOf([HEADER, ...OWNER_ROWS.slice(0, 7), ...OWNER_ROWS.slice(8), label('Beigu atlikums:', '429.15')]);
    assert.deepEqual(earlier.closingBalance, { cents: 42915, date: '2026-10-16' }, 'latest of the rows read, not the last in file order');
});

test('other languages: Lõppsaldo, Конечный остаток, Galutinis likutis, Ending balance', () => {
    for (const text of ['Lõppsaldo', 'Конечный остаток', 'Galutinis likutis:', 'Ending balance']) {
        const result = statementOf(ownerFile({ closing: [label(text, '429.15')], tail: [] }));
        assert.deepEqual(result.closingBalance, { cents: 42915, date: '2026-10-17' }, text);
    }
});

test('two label lines: the last one wins', () => {
    const result = statementOf(ownerFile({ closing: [label('Beigu atlikums:', '429.15'), label('Closing balance:', '100.00')] }));
    assert.deepEqual(result.closingBalance, { cents: 10000, date: '2026-10-17' });
});

test('opening and turnover lines are not a closing balance', () => {
    noValue(statementOf(ownerFile({ closing: [], tail: OWNER_TURNOVER })));
});

// ---------------------------------------------------------------------------
// The existing made-up Citadele-like .xls
// ---------------------------------------------------------------------------

test('Citadele-like .xls fixture: Beigu atlikums 1000.5 on 2026-10-17', async () => {
    const bytes = readFileSync(new URL('./fixtures/xls/citadele-like.xls', import.meta.url));
    const read = await readStatementFile(new File([bytes], 'citadele-like.xls'));
    assert.equal(read.ok, true);
    assert.equal('closingBalance' in read, false, 'a table result carries no value');
    const result = statementOf(read.rows);
    assert.deepEqual(result.closingBalance, { cents: 100050, date: '2026-10-17' });
    assert.equal(result.rows.length, 69);
    assert.deepEqual(result.skipped.map((s) => s.line), [74, 75, 76, 77, 78, 79]);
});

// ---------------------------------------------------------------------------
// A Balance / Running Balance column
// ---------------------------------------------------------------------------

const REVOLUT_HEAD = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';
const REVOLUT_LINES = [
    'CARD_PAYMENT,Current,2026-09-03 9:15:02,2026-09-04 10:00:00,Test Shop One,-12.50,0.00,EUR,COMPLETED,987.50',
    'TOPUP,Current,2026-09-05 08:00:00,2026-09-05 08:00:05,Top-up by *1234,200.00,0.00,EUR,COMPLETED,1187.50',
    'CARD_PAYMENT,Current,2026-09-06 12:30:00,,Pending Shop,-5.00,0.00,EUR,PENDING,',
    'EXCHANGE,Current,2026-09-07 07:00:00,2026-09-07 07:00:01,Exchanged to USD,-100.00,1.50,EUR,COMPLETED,1086.00',
    'EXCHANGE,Current,2026-09-07 07:00:00,2026-09-07 07:00:01,Exchanged from EUR,108.00,0.00,USD,COMPLETED,108.00',
    'Card Payment,Current,2026-09-09 14:05:00,2026-09-10 08:00:00,Test Cafe Two,-7.25,0.00,EUR,COMPLETED,1078.75',
    'CARD_REFUND,Current,2026-09-11 10:00:00,2026-09-11 10:00:00,Refund Test Shop One,4.00,0.00,EUR,COMPLETED,1082.75',
    'FEE,Current,2026-09-12 00:00:00,2026-09-12 00:00:00,Monthly plan fee,-1.00,0.00,EUR,COMPLETED,1081.75',
    'CARD_PAYMENT,Current,2026-09-13 18:00:00,,Reverted Shop,-30.00,0.00,EUR,REVERTED,',
];
const revolut = (dataLines) => fromCsv(lines(REVOLUT_HEAD, ...dataLines));

test('Revolut oldest first: the balance on the latest completed EUR row, not the USD or pending rows', () => {
    const result = revolut(REVOLUT_LINES);
    assert.deepEqual(result.closingBalance, { cents: 108175, date: '2026-09-12' });
    assert.equal(result.rows.length, 7);
});

test('Revolut newest first gives the same value', () => {
    const result = revolut([...REVOLUT_LINES].reverse());
    assert.deepEqual(result.closingBalance, { cents: 108175, date: '2026-09-12' });
});

const tieA = 'CARD_PAYMENT,Current,2026-09-14 08:00:00,2026-09-14 08:00:00,Test Tie One,-10.00,0.00,EUR,COMPLETED,1071.75';
const tieB = 'CARD_PAYMENT,Current,2026-09-14 09:00:00,2026-09-14 09:00:00,Test Tie Two,-20.00,0.00,EUR,COMPLETED,1051.75';
const pendingLater = 'CARD_PAYMENT,Current,2026-09-20 12:30:00,,Pending Later,-5.00,0.00,EUR,PENDING,';
const usdLater = 'EXCHANGE,Current,2026-09-21 07:00:00,2026-09-21 07:00:01,Exchanged from EUR,50.00,0.00,USD,COMPLETED,158.00';

test('Revolut ties on the latest day: oldest first takes the last row in file order', () => {
    const result = revolut([...REVOLUT_LINES, tieA, tieB, pendingLater, usdLater]);
    assert.deepEqual(result.closingBalance, { cents: 105175, date: '2026-09-14' });
});

test('Revolut ties on the latest day: newest first takes the first row in file order', () => {
    const result = revolut([usdLater, pendingLater, tieB, tieA, ...[...REVOLUT_LINES].reverse()]);
    assert.deepEqual(result.closingBalance, { cents: 105175, date: '2026-09-14' });
});

test('Wise Running Balance gives 53646 on the last row date', () => {
    const wise = lines(
        '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference","Running Balance","Total fees"',
        'CARD-100001,03-09-2026,"03-09-2026 10:15:00.123",-10.34,EUR,"Card transaction of 10.00 EUR issued by Test Shop","",489.66,0.34',
        'TRANSFER-100002,05-09-2026,"05-09-2026 09:00:00.000",100.00,EUR,"Received money from Test Payer",Rent,589.66,0.00',
        'TRANSFER-100003,07-09-2026,"07-09-2026 11:30:00.000",-45.00,EUR,"Sent money to Test Landlord",Invoice 4,544.66,0.00',
        'CARD-100004,15-09-2026,"15-09-2026 18:45:10.456",-8.20,EUR,"Card transaction of 8.00 EUR issued by Test Cafe","",536.46,0.20',
    );
    assert.deepEqual(fromCsv(wise).closingBalance, { cents: 53646, date: '2026-09-15' });
});

test('a Balance column whose rows are all in USD gives no value', () => {
    const csv = lines(
        'Date,Description,Amount,Currency,Balance',
        '2026-09-03,Test Shop,-10.00,USD,90.00',
        '2026-09-04,Test Cafe,-5.00,USD,85.00',
        '2026-09-05,Test Salary,20.00,USD,105.00',
    );
    noValue(fromCsv(csv));
});

// ---------------------------------------------------------------------------
// Swedbank record type 86
// ---------------------------------------------------------------------------

const LV_HEAD = 'Klienta konts;Ieraksta tips;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts;Arhīva kods;Maksājuma veids;Refernces numurs;Dokumenta numurs';
const lvLines = (closing = ['LV00TEST0000000000001;86;30.09.2026;;Atlikums perioda beigās;1049,90;EUR;K;;;;']) => [
    LV_HEAD,
    'LV00TEST0000000000001;10;01.09.2026;;Atlikums perioda sākumā;1000,00;EUR;K;;;;',
    'LV00TEST0000000000001;20;03.09.2026;SIA PARAUGS;Rēķins 5;250,00;EUR;D;2026090301A1;MAK;REF5;D100',
    'LV00TEST0000000000001;20;03.09.2026;SWEDBANK;Komisija;0,10;EUR;D;2026090301A1;KOM;;D100',
    'LV00TEST0000000000001;20;14.09.2026;Anna Paraugs;Alga;300,00;EUR;K;2026091402B2;MAK;;D101',
    'LV00TEST0000000000001;82;30.09.2026;;Apgrozījums;250,10;EUR;D;;;;',
    'LV00TEST0000000000001;82;30.09.2026;;Apgrozījums;300,00;EUR;K;;;;',
    ...closing,
];

test('Swedbank LV: the 86 line with K is positive, on its own date', () => {
    const result = fromCsv(lines(...lvLines()));
    assert.deepEqual(result.closingBalance, { cents: 104990, date: '2026-09-30' });
    assert.equal(result.rows.length, 3);
});

test('Swedbank: a D line is negative', () => {
    const result = fromCsv(lines(...lvLines(['LV00TEST0000000000001;86;30.09.2026;;Atlikums perioda beigās;49,90;EUR;D;;;;'])));
    assert.deepEqual(result.closingBalance, { cents: -4990, date: '2026-09-30' });
});

test('Swedbank: a USD 86 line before the EUR one is ignored', () => {
    const result = fromCsv(lines(...lvLines([
        'LV00TEST0000000000001;86;30.09.2026;;Atlikums perioda beigās;5,00;USD;K;;;;',
        'LV00TEST0000000000001;86;30.09.2026;;Atlikums perioda beigās;1049,90;EUR;K;;;;',
    ])));
    assert.deepEqual(result.closingBalance, { cents: 104990, date: '2026-09-30' });
});

test('Swedbank: the 10, 82 and 20 records alone give no value', () => {
    noValue(fromCsv(lines(...lvLines([]))));
});

test('Swedbank EE: "-860,06" with K stays negative and the 86 date beats the label rule', () => {
    const result = fromCsv(lines(
        'Reatüüp;Kuupäev;Saaja/Maksja;Selgitus;Summa;Valuuta;Deebet/Kreedit;Arhiveerimistunnus;Tehingu tüüp',
        '10;01.09.2026;;Algsaldo;100,00;EUR;K;;',
        '20;03.09.2026;OÜ NÄIDIS;Arve 7;25,50;EUR;D;2026090301A1;MK',
        '20;14.09.2026;Mari Maasikas;Üür;300,00;EUR;K;2026091402B2;MK',
        '20;15.09.2026;Test Pood;Ost;1234,56;EUR;D;2026091503C3;MK',
        '82;30.09.2026;;Käive;1260,06;EUR;D;;',
        '86;30.09.2026;;Lõppsaldo;-860,06;EUR;K;;',
    ));
    assert.deepEqual(result.closingBalance, { cents: -86006, date: '2026-09-30' });
});

test('Swedbank LT: 362.20 with C gives 36220 on the 86 date', () => {
    const result = fromCsv(lines(
        '"","Data","Gavėjas","Paskirtis","Suma","Valiuta","D/K","Kodas",',
        '"10","2026-09-01","","Pradinis likutis","100.00","EUR","C","",',
        '"20","2026-09-03","UAB PAVYZDYS","Sąskaita 5","25.50","EUR","D","X1",',
        '"20","2026-09-04","Jonas Jonaitis","Alga","300.00","EUR","C","X2",',
        '"20","2026-09-05","UAB "PAVYZDYS" 2","Pirkinys","12.30","EUR","D","X3",',
        '"86","2026-09-30","","Galutinis likutis","362.20","EUR","C","",',
    ));
    assert.deepEqual(result.closingBalance, { cents: 36220, date: '2026-09-30' });
});

// ---------------------------------------------------------------------------
// Several sources in one file, and non-EUR labels
// ---------------------------------------------------------------------------

test('a label line wins over a Balance column that disagrees', () => {
    const csv = lines(
        'Date,Description,Amount,Balance',
        '2026-09-03,Test Shop,-10.00,90.00',
        '2026-09-04,Test Cafe,-5.00,85.00',
        '2026-09-05,Test Salary,20.00,105.00',
        ',Closing balance,500.00,',
    );
    assert.deepEqual(fromCsv(csv).closingBalance, { cents: 50000, date: '2026-09-05' });
});

test('a label line in another currency gives no value', () => {
    const csv = lines(
        'Date,Description,Amount,Currency',
        '2026-09-03,Test Shop,-10.00,USD',
        '2026-09-04,Test Cafe,-5.00,USD',
        ',Closing balance,500.00,USD',
    );
    noValue(fromCsv(csv));
});

// ---------------------------------------------------------------------------
// camt
// ---------------------------------------------------------------------------

const camtBal = ({ cd = 'CLBD', ccy = 'EUR', amount = '429.15', ind = 'CRDT', date = '<Dt>2026-09-30</Dt>' } = {}) =>
    `<Bal><Tp><CdOrPrtry><Cd>${cd}</Cd></CdOrPrtry></Tp><Amt Ccy="${ccy}">${amount}</Amt><CdtDbtInd>${ind}</CdtDbtInd><Dt>${date}</Dt></Bal>`;
const camtNtry = (ref, amount, date) =>
    `<Ntry><NtryRef>${ref}</NtryRef><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>${date}</Dt></BookgDt></Ntry>`;
const camtStmt = (bals = '', ccy = 'EUR') => `<Stmt><Id>S1</Id><Acct><Id><IBAN>LV00TEST0000000000001</IBAN></Id><Ccy>${ccy}</Ccy></Acct>${bals}${camtNtry('E1', '25.00', '2026-09-03')}</Stmt>`;
const camtDoc = (...statements) => '<?xml version="1.0" encoding="UTF-8"?>'
    + `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt>${statements.join('')}</BkToCstmrStmt></Document>`;

test('camt: CLBD with CRDT is positive, with DBIT negative', () => {
    assert.deepEqual(parseCamt(camtDoc(camtStmt(camtBal()))).closingBalance, { cents: 42915, date: '2026-09-30' });
    assert.deepEqual(parseCamt(camtDoc(camtStmt(camtBal({ ind: 'DBIT' })))).closingBalance, { cents: -42915, date: '2026-09-30' });
});

test('camt: OPBD and ITBD are ignored, the CLBD among them is read', () => {
    const bals = camtBal({ cd: 'OPBD', amount: '1.00' }) + camtBal({ cd: 'ITBD', amount: '2.00' }) + camtBal();
    assert.deepEqual(parseCamt(camtDoc(camtStmt(bals))).closingBalance, { cents: 42915, date: '2026-09-30' });
    const only = parseCamt(camtDoc(camtStmt(camtBal({ cd: 'OPBD' }) + camtBal({ cd: 'ITBD' }))));
    noValue(only);
});

test('camt: the date can come from Dt/DtTm', () => {
    const bal = camtBal({ date: '<DtTm>2026-09-29T23:59:59</DtTm>' });
    assert.deepEqual(parseCamt(camtDoc(camtStmt(bal))).closingBalance, { cents: 42915, date: '2026-09-29' });
});

test('camt: two statements, the last EUR one wins; a USD CLBD is ignored', () => {
    const first = camtStmt(camtBal({ amount: '100.00', date: '<Dt>2026-08-31</Dt>' }));
    const second = camtStmt(camtBal({ amount: '200.00', date: '<Dt>2026-09-30</Dt>' }));
    const usd = camtStmt(camtBal({ amount: '999.00', ccy: 'USD' }));
    assert.deepEqual(parseCamt(camtDoc(first, second)).closingBalance, { cents: 20000, date: '2026-09-30' });
    assert.deepEqual(parseCamt(camtDoc(first, second, usd)).closingBalance, { cents: 20000, date: '2026-09-30' });
    noValue(parseCamt(camtDoc(usd)));
});

test('camt: a statement without Bal gives no key', () => {
    const result = parseCamt(camtDoc(camtStmt()));
    assert.equal(result.ok, true);
    noValue(result);
});

// ---------------------------------------------------------------------------
// FiDAViSTA (element names unverified, see the header comment in xml.js)
// ---------------------------------------------------------------------------

const fidaTrx = (ref, date) => `<TrxSet><TypeCode>OUTP</TypeCode><BookDate>${date}</BookDate><BankRef>${ref}</BankRef><CorD>D</CorD><AccAmt>45.00</AccAmt><PmtInfo>Test</PmtInfo></TrxSet>`;
const fidaCcy = (ccy, close, trx) => `<CcyStmt><Ccy>${ccy}</Ccy><OpenBal>100.00</OpenBal>${trx}${close === null ? '' : `<CloseBal>${close}</CloseBal>`}</CcyStmt>`;
const fida = ({ period = '<Period><StartDate>2026-09-01</StartDate><EndDate>2026-09-30</EndDate></Period>', ccys }) =>
    `<?xml version="1.0" encoding="UTF-8"?><FIDAVISTA xmlns="http://www.bankasoc.lv/fidavista/fidavista0102.xsd"><Statement>${period}<AccountSet><IBAN>LV00TEST0000000000001</IBAN>${ccys}</AccountSet></Statement></FIDAVISTA>`;
const eurStmt = fidaCcy('EUR', '534.50', fidaTrx('FV-001', '2026-09-03') + fidaTrx('FV-002', '2026-09-28'));

test('FiDAViSTA: CloseBal of the EUR statement on the period end', () => {
    assert.deepEqual(parseFidavista(fida({ ccys: eurStmt })).closingBalance, { cents: 53450, date: '2026-09-30' });
});

test('FiDAViSTA: a USD CcyStmt next to the EUR one is ignored', () => {
    const usd = fidaCcy('USD', '99.00', fidaTrx('FV-003', '2026-09-29'));
    assert.deepEqual(parseFidavista(fida({ ccys: usd + eurStmt })).closingBalance, { cents: 53450, date: '2026-09-30' });
    assert.deepEqual(parseFidavista(fida({ ccys: eurStmt + usd })).closingBalance, { cents: 53450, date: '2026-09-30' });
});

test('FiDAViSTA: no Period/EndDate falls back to the latest row date; no CloseBal gives no key', () => {
    assert.deepEqual(parseFidavista(fida({ period: '', ccys: eurStmt })).closingBalance, { cents: 53450, date: '2026-09-28' });
    noValue(parseFidavista(fida({ ccys: fidaCcy('EUR', null, fidaTrx('FV-001', '2026-09-03')) })));
});

// ---------------------------------------------------------------------------
// Formats without a balance, and readStatementFile
// ---------------------------------------------------------------------------

test('no value: LHV, N26, SEB LT, HTML and SpreadsheetML tables', () => {
    noValue(fromCsv(lines(
        '"Kliendi konto","Kuupäev","Saaja/maksja konto","Saaja/maksja nimi","Deebet/Kreedit (D/C)","Summa","Arhiveerimistunnus","Selgitus","Valuuta"',
        '"EE000000000000000001","2026-09-03","EE000000000000000002","OÜ Näidis","D","25.00","A100","Arve 7","EUR"',
        '"EE000000000000000001","2026-09-14","EE000000000000000003","Mari Maasikas","C","300.00","A101","Üür","EUR"',
    )));
    noValue(fromCsv(lines(
        '"Booking Date","Value Date","Partner Name","Type","Account Name","Amount (EUR)"',
        '"2026-09-03","2026-09-03","Test Supermarket","Debit Mastercard","Main Account","-23.40"',
        '"2026-09-05","2026-09-05","Test Employer","Income","Main Account","1500.00"',
    )));
    noValue(fromCsv(lines(
        '"DOK NR.";"DATA";"VALIUTA";"SUMA";"MOKĖJIMO PASKIRTIS";"DEBETAS/KREDITAS"',
        '"1";"2026-09-03";"EUR";"25,00";"Saskaita 5";"D"',
        '"2";"2026-09-04";"EUR";"300,00";"Alga";"C"',
    )));
});

test('no value: HTML saved as .xls and SpreadsheetML', () => {
    const html = readHtmlTable(`<html><body><table><tr><td>Period</td><td>01.09.2026 - 30.09.2026</td></tr></table>
<table><tr><th>Date</th><th>Details</th><th>Debit</th><th>Credit</th></tr>
<tr><td>2026-09-01</td><td>Shop A</td><td>3.50</td><td></td></tr>
<tr><td>2026-09-02</td><td>Salary</td><td></td><td>1000.00</td></tr>
<tr><td>Total</td><td></td><td>3.50</td><td>1000.00</td></tr></table></body></html>`);
    assert.equal(html.ok, true);
    noValue(statementOf(html.rows));

    const cell = (value, type = 'String') => `<Cell><Data ss:Type="${type}">${value}</Data></Cell>`;
    const sml = readSpreadsheetMl('<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'
        + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles/>'
        + `<ss:Worksheet ss:Name="Sheet1"><Table><Row>${cell('Date')}${cell('Details')}${cell('Amount')}</Row>`
        + `<Row>${cell('2026-09-01T00:00:00.000', 'DateTime')}${cell('Shop')}${cell('-3.5', 'Number')}</Row>`
        + `<Row>${cell('2026-09-02T00:00:00.000', 'DateTime')}${cell('Salary')}${cell('1000', 'Number')}</Row>`
        + '</Table></ss:Worksheet></Workbook>');
    assert.equal(sml.ok, true);
    noValue(statementOf(sml.rows));
});

test('readStatementFile forwards the value for camt and FiDAViSTA, and adds nothing to tables', async () => {
    const withBal = await readStatementFile(new File([utf8(camtDoc(camtStmt(camtBal())))], 'camt.xml'));
    assert.equal(withBal.kind, 'statement');
    assert.deepEqual(withBal.closingBalance, { cents: 42915, date: '2026-09-30' });

    const without = await readStatementFile(new File([utf8(camtDoc(camtStmt()))], 'camt.xml'));
    assert.equal('closingBalance' in without, false);
    assert.deepEqual(without.rows, withBal.rows, 'the rows do not change');

    const fidaRead = await readStatementFile(new File([utf8(fida({ ccys: eurStmt }))], 'fidavista.xml'));
    assert.equal(fidaRead.kind, 'statement');
    assert.deepEqual(fidaRead.closingBalance, { cents: 53450, date: '2026-09-30' });
    assert.equal(fidaRead.rows.length, 2);

    const csv = await readStatementFile(new File([utf8(lines('Date,Description,Amount', '2026-09-03,Test,-1.00'))], 'a.csv'));
    assert.equal('closingBalance' in csv, false);
});

// ---------------------------------------------------------------------------
// The check panel
// ---------------------------------------------------------------------------

test('checkSummary carries the closing balance, null by default', () => {
    assert.equal(checkSummary([], []).closingBalance, null);
    const closingBalance = { cents: 42915, date: '2026-10-17' };
    assert.deepEqual(checkSummary([], [], { closingBalance }).closingBalance, closingBalance);
});

test('closingBalanceText', () => {
    assert.equal(closingBalanceText({ cents: 42915, date: '2026-10-17' }), 'Bank balance on 17 Oct 2026: €429.15');
    assert.equal(closingBalanceText({ cents: -86006, date: '2026-09-30' }), 'Bank balance on 30 Sep 2026: -€860.06');
});

// ---------------------------------------------------------------------------
// A header row outside the rows, and the balance chain for files without a date order
// ---------------------------------------------------------------------------

test('a header row outside the rows reads nothing and adds no value', () => {
    const layout = { columns: { date: 0, amount: 1 }, decimalSeparator: '.', dateFormat: 'DMY' };
    assert.deepEqual(rowsToStatement([], 0, layout), { rows: [], skipped: [] });
    assert.deepEqual(rowsToStatement([['a']], 3, layout), { rows: [], skipped: [] });
});

const oneDay = (...rows) => fromCsv(lines(
    'Date,Description,Amount,Currency,Balance',
    ...rows.map(([description, amount, balance]) => `2026-09-14,${description},${amount},EUR,${balance}`),
));

test('single-day Balance file, newest first (the chain says so): the first row', () => {
    const result = oneDay(['Test Shop', '-1.00', '9.00'], ['Test Salary', '10.00', '10.00']);
    assert.deepEqual(result.closingBalance, { cents: 900, date: '2026-09-14' });
});

test('single-day Balance file, oldest first (the chain says so): the last row', () => {
    const result = oneDay(['Test Salary', '10.00', '10.00'], ['Test Shop', '-1.00', '9.00']);
    assert.deepEqual(result.closingBalance, { cents: 900, date: '2026-09-14' });
    // Two rows that fit both orders do not decide anything.
    noValue(oneDay(['Test Shop', '-1.00', '9.00'], ['Test Salary', '1.00', '10.00']));
});

test('single-day Balance file the chain cannot decide gives no value from the column', () => {
    noValue(oneDay(['Test Shop', '-5.00', '9.00'], ['Test Salary', '5.00', '10.00']));
    noValue(oneDay(['Test Shop', '-1.00', '50.00'], ['Test Salary', '3.00', '10.00']));
    // One row on the latest day needs no order.
    assert.deepEqual(oneDay(['Test Shop', '-1.00', '9.00']).closingBalance, { cents: 900, date: '2026-09-14' });
});
