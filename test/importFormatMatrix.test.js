import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readStatementFile, parseLayoutFor, decisionsForBuild } from '../src/views/import.js';
import { findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';
import { findDuplicates, defaultDecisions, buildImport } from '../src/import/core.js';
import { defaultData } from '../src/model.js';

// Acceptance test of slice 4: every researched bank format goes from file bytes to buildImport,
// the way the import screen does it, with no manual column mapping. All data is made up.

const NOW = new Date(2026, 9, 20, 12, 0, 0);
const GUESS_SAMPLE_ROWS = 20; // same literal as startTable in src/views/import.js

const utf8 = (text) => new TextEncoder().encode(text);
const withBom = (text) => Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(text)]);
const lines = (...rows) => rows.join('\n') + '\n';

/** Encode text into a single-byte Windows code page by inverting TextDecoder for bytes 0x80-0xFF. */
function legacyBytes(text, label) {
    const decoder = new TextDecoder(label);
    const map = new Map();
    for (let b = 0x80; b <= 0xff; b += 1) map.set(decoder.decode(Uint8Array.of(b)), b);
    return Uint8Array.from(Array.from(text), (ch) => {
        const code = ch.codePointAt(0);
        if (code < 0x80) return code;
        assert.ok(map.has(ch), `no ${label} byte for ${ch}`);
        return map.get(ch);
    });
}

/** File bytes to a built import, with the same steps as the import screen. */
async function importFile(name, bytes) {
    const read = await readStatementFile(new File([bytes], name));
    assert.equal(read.ok, true, `${name}: ${read.reason}`);
    let rows;
    let skipped = [];
    if (read.kind === 'statement') {
        rows = read.rows;
    } else {
        const table = read.rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
        const headerRow = findHeaderRow(table);
        assert.ok(headerRow >= 0, `${name}: no header row found`);
        const guess = guessColumns(table[headerRow], table.slice(headerRow + 1, headerRow + 1 + GUESS_SAMPLE_ROWS));
        assert.notEqual(guess.dateFormat, null, `${name}: date format not guessed`);
        const columns = { fee: -1, status: -1, counterparty: -1, ...guess.columns, eurAmount: -1 };
        const mode = columns.debit >= 0 || columns.credit >= 0 ? 'split' : 'single';
        const layout = parseLayoutFor({
            columns, mode, decimalSeparator: guess.decimalSeparator, dateFormat: guess.dateFormat, reverse: false,
        });
        ({ rows, skipped } = rowsToStatement(table, headerRow, layout));
    }
    const data = defaultData();
    data.settings.setupComplete = true;
    const duplicates = findDuplicates(data, rows);
    const decisions = defaultDecisions(data, rows, duplicates);
    const built = buildImport(data, decisionsForBuild(rows, decisions, rows.map(() => '')), {
        rows, format: read.format, fileName: name, now: NOW, duplicates,
    });
    const sum = (dir) => rows
        .filter((r) => r.direction === dir && Number.isInteger(r.amountCents))
        .reduce((s, r) => s + r.amountCents, 0);
    return {
        read, rows, skipped, decisions, built,
        warnings: read.warnings ?? [],
        kinds: decisions.map((d) => d.kind),
        stmtOut: sum('out'),
        stmtIn: sum('in'),
    };
}

const skippedList = (r) => r.skipped.map((s) => ({ line: s.line, reason: s.reason }));

/** The common matrix assertions. `skipped: []` means no row may be skipped. */
function assertMatrix(r, want) {
    assert.equal(r.read.format, want.format, 'format');
    if (want.encoding) assert.equal(r.read.encoding, want.encoding, 'encoding');
    assert.equal(r.rows.length, want.rows, 'row count');
    assert.equal(r.stmtOut, want.stmtOut, 'statement money out');
    assert.equal(r.stmtIn, want.stmtIn, 'statement money in');
    assert.equal(r.built.ok, true, 'built.ok');
    assert.deepEqual(r.built.errors, []);
    assert.equal(r.built.totals.totalOutCents, want.out, 'built money out');
    assert.equal(r.built.totals.totalInCents, want.in, 'built money in');
    assert.deepEqual(r.kinds, want.kinds, 'kinds');
    assert.deepEqual(skippedList(r), want.skipped, 'skipped rows');
}

const repeat = (kind, n) => Array(n).fill(kind);
const summary = (...lineNumbers) => lineNumbers.map((line) => ({ line, reason: 'summary row' }));

test('Citadele .xls (existing fixture) imports end to end', async () => {
    const bytes = readFileSync(new URL('./fixtures/xls/citadele-like.xls', import.meta.url));
    const r = await importFile('citadele-like.xls', bytes);
    // 200745 / 114041 equal an independent sum of the amount column (-2007.45 / +1140.41).
    assertMatrix(r, {
        format: 'xls', rows: 69, stmtOut: 200745, stmtIn: 114041, out: 200745, in: 114041,
        kinds: ['expense', 'income', ...repeat('expense', 67)],
        skipped: [{ line: 74, reason: 'zero amount' }, ...summary(75, 76, 77, 78, 79)],
    });
});

const REVOLUT = lines(
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'CARD_PAYMENT,Current,2026-09-03 9:15:02,2026-09-04 10:00:00,Test Shop One,-12.50,0.00,EUR,COMPLETED,987.50',
    'TOPUP,Current,2026-09-05 08:00:00,2026-09-05 08:00:05,Top-up by *1234,200.00,0.00,EUR,COMPLETED,1187.50',
    'CARD_PAYMENT,Current,2026-09-06 12:30:00,,Pending Shop,-5.00,0.00,EUR,PENDING,',
    'EXCHANGE,Current,2026-09-07 07:00:00,2026-09-07 07:00:01,Exchanged to USD,-100.00,1.50,EUR,COMPLETED,1086.00',
    'EXCHANGE,Current,2026-09-07 07:00:00,2026-09-07 07:00:01,Exchanged from EUR,108.00,0.00,USD,COMPLETED,108.00',
    'Card Payment,Current,2026-09-09 14:05:00,2026-09-10 08:00:00,Test Cafe Two,-7.25,0.00,EUR,COMPLETED,1078.75',
    'CARD_REFUND,Current,2026-09-11 10:00:00,2026-09-11 10:00:00,Refund Test Shop One,4.00,0.00,EUR,COMPLETED,1082.75',
    'FEE,Current,2026-09-12 00:00:00,2026-09-12 00:00:00,Monthly plan fee,-1.00,0.00,EUR,COMPLETED,1081.75',
    'CARD_PAYMENT,Current,2026-09-13 18:00:00,,Reverted Shop,-30.00,0.00,EUR,REVERTED,',
);

test('Revolut CSV: top-up and exchange are transfers, unfinished rows are skipped', async () => {
    const r = await importFile('revolut.csv', utf8(REVOLUT));
    assertMatrix(r, {
        format: 'csv', encoding: 'utf-8', rows: 7, stmtOut: 12225, stmtIn: 20400, out: 2075, in: 400,
        kinds: ['expense', 'transfer', 'transfer', 'transfer', 'expense', 'refund', 'expense'],
        skipped: [{ line: 4, reason: 'not completed' }, { line: 10, reason: 'not completed' }],
    });
    assert.deepEqual(r.built.importRecord.counts, {
        expenses: 3, incomes: 0, refunds: 1, duplicates: 0, transfers: 3, skipped: 0,
    });
    assert.equal(r.rows[2].amountCents, 10150, 'exchange amount plus its 1.50 fee');
    assert.equal(r.rows[3].currency, 'USD');
    assert.equal(r.rows[3].amountCents, null, 'foreign currency row has no EUR amount');
    assert.equal(r.rows[4].amountCents, 725, 'Title Case "Card Payment" row');
});

const SWEDBANK_LV = lines(
    'Klienta konts;Ieraksta tips;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts;Arhīva kods;Maksājuma veids;Refernces numurs;Dokumenta numurs',
    'LV00TEST0000000000001;10;01.09.2026;;Atlikums perioda sākumā;1000,00;EUR;K;;;;',
    'LV00TEST0000000000001;20;03.09.2026;SIA PARAUGS;Rēķins 5;250,00;EUR;D;2026090301A1;MAK;REF5;D100',
    'LV00TEST0000000000001;20;03.09.2026;SWEDBANK;Komisija;0,10;EUR;D;2026090301A1;KOM;;D100',
    'LV00TEST0000000000001;20;14.09.2026;Anna Paraugs;Alga;300,00;EUR;K;2026091402B2;MAK;;D101',
    'LV00TEST0000000000001;82;30.09.2026;;Apgrozījums;250,10;EUR;D;;;;',
    'LV00TEST0000000000001;82;30.09.2026;;Apgrozījums;300,00;EUR;K;;;;',
    'LV00TEST0000000000001;86;30.09.2026;;Atlikums perioda beigās;1049,90;EUR;K;;;;',
);

test('Swedbank LV CSV: opening, turnover and closing records are skipped', async () => {
    const r = await importFile('swedbank-lv.csv', utf8(SWEDBANK_LV));
    assertMatrix(r, {
        format: 'csv', encoding: 'utf-8', rows: 3, stmtOut: 25010, stmtIn: 30000, out: 25010, in: 30000,
        kinds: ['expense', 'expense', 'income'], skipped: summary(2, 6, 7, 8),
    });
    assert.equal(r.rows[1].amountCents, 10, 'commission row');
    assert.equal(r.built.importRecord.counts.duplicates, 0, 'commission shares the archive code but is no duplicate');
});

const SWEDBANK_EE = lines(
    'Reatüüp;Kuupäev;Saaja/Maksja;Selgitus;Summa;Valuuta;Deebet/Kreedit;Arhiveerimistunnus;Tehingu tüüp',
    '10;01.09.2026;;Algsaldo;100,00;EUR;K;;',
    '20;03.09.2026;OÜ NÄIDIS;Arve 7;25,50;EUR;D;2026090301A1;MK',
    '20;14.09.2026;Mari Maasikas;Üür;300,00;EUR;K;2026091402B2;MK',
    '20;15.09.2026;Test Pood;Ost;1234,56;EUR;D;2026091503C3;MK',
    '82;30.09.2026;;Käive;1260,06;EUR;D;;',
    '86;30.09.2026;;Lõppsaldo;-860,06;EUR;K;;',
);

test('Swedbank EE CSV imports, a thousand-sized amount stays exact', async () => {
    const r = await importFile('swedbank-ee.csv', utf8(SWEDBANK_EE));
    assertMatrix(r, {
        format: 'csv', encoding: 'utf-8', rows: 3, stmtOut: 126006, stmtIn: 30000, out: 126006, in: 30000,
        kinds: ['expense', 'income', 'expense'], skipped: summary(2, 6, 7),
    });
    assert.equal(r.rows[2].amountCents, 123456);
});

const SWEDBANK_LT = lines(
    '"","Data","Gavėjas","Paskirtis","Suma","Valiuta","D/K","Kodas",',
    '"10","2026-09-01","","Pradinis likutis","100.00","EUR","C","",',
    '"20","2026-09-03","UAB PAVYZDYS","Sąskaita 5","25.50","EUR","D","X1",',
    '"20","2026-09-04","Jonas Jonaitis","Alga","300.00","EUR","C","X2",',
    '"20","2026-09-05","UAB "PAVYZDYS" 2","Pirkinys","12.30","EUR","D","X3",',
    '"86","2026-09-30","","Galutinis likutis","362.20","EUR","C","",',
);

test('Swedbank LT CSV: quoted fields, trailing comma and unescaped inner quotes', async () => {
    const r = await importFile('swedbank-lt.csv', utf8(SWEDBANK_LT));
    assertMatrix(r, {
        format: 'csv', encoding: 'utf-8', rows: 3, stmtOut: 3780, stmtIn: 30000, out: 3780, in: 30000,
        kinds: ['expense', 'income', 'expense'], skipped: summary(2, 6),
    });
    assert.equal(r.rows[2].amountCents, 1230, 'row with unescaped inner quotes');
});

const SEB_HEADER = '"DOK NR.";"DATA";"VALIUTA";"SUMA";"MOKĖTOJO ARBA GAVĖJO PAVADINIMAS";"MOKĖTOJO ARBA GAVĖJO IDENTIFIKACINIS KODAS";"SĄSKAITA";"KREDITO ĮSTAIGOS PAVADINIMAS";"KREDITO ĮSTAIGOS SWIFT KODAS";"MOKĖJIMO PASKIRTIS";"TRANSAKCIJOS KODAS";"DOKUMENTO DATA";"TRANSAKCIJOS TIPAS";"NUORODA";"DEBETAS/KREDITAS";"SUMA SĄSKAITOS VALIUTA";"SĄSKAITOS NR";"SĄSKAITOS VALIUTA";';
const sebTitle = (n) => `"SĄSKAITOS IŠRAŠAS LT00TEST0000000000${n}";;;;;;;;;;;;;;;;;;`;
const SEB_LT = lines(
    sebTitle(1),
    SEB_HEADER,
    '"1";"2026-09-03";"EUR";"25,00";"UAB PAVYZDYS";"123456789";"LT000000000000000001";"BANKAS";"TESTLT00";"Saskaita 5";"TX001";"2026-09-02";"MK";"N1";"D";"25,00";"LT00TEST00000000001";"EUR";',
    '"2";"2026-09-04";"EUR";"300,00";"Jonas Jonaitis";"";"LT000000000000000002";"BANKAS";"TESTLT00";"Alga";"TX002";"2026-09-04";"MK";"N2";"C";"300,00";"LT00TEST00000000001";"EUR";',
    '"3";"2026-09-06";"EUR";"50,00";"Savas pavedimas";"";"LT000000000000000009";"BANKAS";"TESTLT00";"Tarp saskaitu";"TX004";"2026-09-06";"MK";"N4";"D";"50,00";"LT00TEST00000000001";"EUR";',
    sebTitle(2),
    SEB_HEADER,
    '"4";"2026-09-05";"EUR";"10,00";"UAB KITAS";"987654321";"LT000000000000000003";"BANKAS";"TESTLT00";"Maistas 12/09/2026 14:30";"TX003";"2026-09-05";"MK";"N3";"D";"10,00";"LT00TEST00000000002";"EUR";',
    '"5";"2026-09-06";"EUR";"50,00";"Savas pavedimas";"";"LT000000000000000001";"BANKAS";"TESTLT00";"Tarp saskaitu";"TX005";"2026-09-06";"MK";"N5";"C";"50,00";"LT00TEST00000000002";"EUR";',
);

test('SEB LT CSV: two account blocks, the own-account pair becomes transfers', async () => {
    const r = await importFile('seb-lt.csv', utf8(SEB_LT));
    assertMatrix(r, {
        format: 'csv', encoding: 'utf-8', rows: 5, stmtOut: 8500, stmtIn: 35000, out: 3500, in: 30000,
        kinds: ['expense', 'income', 'transfer', 'expense', 'transfer'],
        skipped: [{ line: 6, reason: 'unparsable date' }, { line: 7, reason: 'summary row' }],
    });
    assert.equal(r.built.importRecord.counts.transfers, 2);
});

const LHV = lines(
    '"Kliendi konto","Kuupäev","Saaja/maksja konto","Saaja/maksja nimi","Deebet/Kreedit (D/C)","Summa","Arhiveerimistunnus","Selgitus","Valuuta","Isikukood või registrikood","Kande viide"',
    '"EE000000000000000001","2026-09-03","EE000000000000000002","OÜ Näidis","D","25.00","A100","Arve 7","EUR","12345678","R1"',
    '"EE000000000000000001","2026-09-14","EE000000000000000003","Mari Maasikas","C","300.00","A101","Üür","EUR","","R2"',
    '"EE000000000000000001","2026-09-15","EE000000000000000004","Test Pood","D","-12.40","","Ost","EUR","","R3"',
);

test('LHV CSV with a BOM: D/C column, a negative amount on a D row, an empty archive code', async () => {
    const r = await importFile('lhv.csv', withBom(LHV));
    assertMatrix(r, {
        format: 'csv', rows: 3, stmtOut: 3740, stmtIn: 30000, out: 3740, in: 30000,
        kinds: ['expense', 'income', 'expense'], skipped: [],
    });
    assert.equal(r.rows[2].direction, 'out');
    assert.equal(r.rows[2].amountCents, 1240);
});

const WISE = lines(
    '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"',
    'CARD-100001,03-09-2026,"03-09-2026 10:15:00.123",-10.34,EUR,"Card transaction of 10.00 EUR issued by Test Shop","",489.66,,,,,,,Test Shop,1234,Test Person,,,0.34,,DEBIT,CARD',
    'TRANSFER-100002,05-09-2026,"05-09-2026 09:00:00.000",100.00,EUR,"Received money from Test Payer",Rent,589.66,,,,Test Payer,Test Person,,,,,,,0.00,,CREDIT,TRANSFER',
    'TRANSFER-100003,07-09-2026,"07-09-2026 11:30:00.000",-45.00,EUR,"Sent money to Test Landlord",Invoice 4,544.66,,,,Test Person,Test Landlord,LV00TEST0000000000002,,,,,,0.00,,DEBIT,TRANSFER',
    // A day above 12 keeps DMY and MDY apart, so the date format is guessed without a question.
    'CARD-100004,15-09-2026,"15-09-2026 18:45:10.456",-8.20,EUR,"Card transaction of 8.00 EUR issued by Test Cafe","",536.46,,,,,,,Test Cafe,1234,Test Person,,,0.20,,DEBIT,CARD',
);

test('Wise CSV: "Total fees" is not added to the amount', async () => {
    const r = await importFile('wise.csv', utf8(WISE));
    assertMatrix(r, {
        format: 'csv', encoding: 'utf-8', rows: 4, stmtOut: 6354, stmtIn: 10000, out: 6354, in: 10000,
        kinds: ['expense', 'income', 'expense', 'expense'], skipped: [],
    });
    assert.equal(r.rows[0].amountCents, 1034);
    assert.deepEqual(r.rows.map((x) => x.bankRef), ['CARD-100001', 'TRANSFER-100002', 'TRANSFER-100003', 'CARD-100004']);
});

const N26 = lines(
    '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"',
    '"2026-09-03","2026-09-03","Test Supermarket","","Debit Mastercard","","Main Account","-23.40","","",""',
    '"2026-09-05","2026-09-05","Test Employer","DE00TEST000000000001","Income","Salary September","Main Account","1500.00","","",""',
    '"2026-09-07","2026-09-08","Test Store NY","","Debit Mastercard","","Main Account","-22.50","-25.00","USD","1.1111"',
);

test('N26 CSV: the EUR amount is imported, not the original foreign amount', async () => {
    const r = await importFile('n26.csv', utf8(N26));
    assertMatrix(r, {
        format: 'csv', encoding: 'utf-8', rows: 3, stmtOut: 4590, stmtIn: 150000, out: 4590, in: 150000,
        kinds: ['expense', 'income', 'expense'], skipped: [],
    });
    assert.equal(r.rows[2].currency, 'EUR');
    assert.equal(r.rows[2].amountCents, 2250);
});

// camt.053 builders: trimmed copies of those in importCamtReversal.test.js and importCamtBatch.test.js.
const camtEntry = ({ ref, direction, amount, date, reversal = null, party = '', parts = [], batch = false, acctRef = '' }) => {
    const rvsl = reversal === null ? '' : `<RvslInd>${reversal}</RvslInd>`;
    const side = direction === 'DBIT' ? 'Cdtr' : 'Dbtr';
    const parties = party ? `<RltdPties><${side}><Nm>${party}</Nm></${side}></RltdPties>` : '';
    const details = parts.length || batch || parties
        ? `<NtryDtls>${batch ? `<Btch><NbOfTxs>${parts.length}</NbOfTxs></Btch>` : ''}${parts.join('')}${parties ? `<TxDtls>${parties}</TxDtls>` : ''}</NtryDtls>` : '';
    return `<Ntry><NtryRef>${ref}</NtryRef><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>${direction}</CdtDbtInd>${rvsl}<Sts>BOOK</Sts>`
        + `<BookgDt><Dt>${date}</Dt></BookgDt><ValDt><Dt>${date}</Dt></ValDt>${acctRef ? `<AcctSvcrRef>${acctRef}</AcctSvcrRef>` : ''}${details}</Ntry>`;
};
const camtPart = (ref, amount, party, text) => `<TxDtls><Refs><AcctSvcrRef>${ref}</AcctSvcrRef></Refs><AmtDtls><TxAmt><Amt Ccy="EUR">${amount}</Amt></TxAmt></AmtDtls>`
    + `<RltdPties><Cdtr><Nm>${party}</Nm></Cdtr></RltdPties><RmtInf><Ustrd>${text}</Ustrd></RmtInf></TxDtls>`;
const CAMT = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Id>S1</Id>'
    + '<Acct><Id><IBAN>LV00TEST0000000000001</IBAN></Id><Ccy>EUR</Ccy></Acct>'
    + camtEntry({ ref: 'E1', direction: 'DBIT', amount: '25.00', date: '2026-09-03', party: 'SIA Paraugs', acctRef: 'AS1' })
    + camtEntry({ ref: 'E2', direction: 'CRDT', amount: '300.00', date: '2026-09-04', party: 'Anna Paraugs', acctRef: 'AS2' })
    + camtEntry({ ref: 'E3', direction: 'CRDT', amount: '40.00', date: '2026-09-05', party: 'Test Debtor', acctRef: 'AS3' })
    + camtEntry({ ref: 'E4', direction: 'DBIT', amount: '40.00', date: '2026-09-08', reversal: 'true', party: 'Test Debtor', acctRef: 'AS4' })
    + camtEntry({ ref: 'E5', direction: 'DBIT', amount: '60.00', date: '2026-09-10', batch: true, acctRef: 'AS5', parts: [
        camtPart('B1', '10.00', 'Test Supplier One', 'Invoice 1'),
        camtPart('B2', '20.00', 'Test Supplier Two', 'Invoice 2'),
        camtPart('B3', '30.00', 'Test Supplier Three', 'Invoice 3')] })
    + '</Stmt></BkToCstmrStmt></Document>';

test('camt.053: a reversal pair starts as skip, a batch splits into its parts', async () => {
    const r = await importFile('camt.xml', utf8(CAMT));
    assertMatrix(r, {
        format: 'camt', rows: 7, stmtOut: 12500, stmtIn: 34000, out: 8500, in: 30000,
        kinds: ['expense', 'income', 'skip', 'skip', 'expense', 'expense', 'expense'], skipped: [],
    });
    assert.deepEqual(r.warnings, [
        '1 payment and its reversal were found; they cancel out and start as Skip unless a rule or an earlier import decides otherwise.',
    ]);
    assert.deepEqual(r.rows.slice(4).map((x) => x.bankRef), ['B1', 'B2', 'B3']);
    assert.deepEqual(r.rows.slice(4).map((x) => x.amountCents), [1000, 2000, 3000]);
    assert.equal(r.built.importRecord.counts.skipped, 2);
});

const FIDAVISTA = `<?xml version="1.0" encoding="UTF-8"?>
<FIDAVISTA xmlns="http://www.bankasoc.lv/fidavista/fidavista0102.xsd">
  <Header><Timestamp>20260930080000000</Timestamp><From>TESTBANK</From></Header>
  <Statement>
    <Period><StartDate>2026-09-01</StartDate><EndDate>2026-09-30</EndDate></Period>
    <AccountSet>
      <IBAN>LV00TEST0000000000001</IBAN>
      <CcyStmt>
        <Ccy>EUR</Ccy>
        <OpenBal>100.00</OpenBal>
        <TrxSet><TypeCode>OUTP</TypeCode><BookDate>2026-09-03</BookDate><BankRef>FV-001</BankRef><CorD>D</CorD><AccAmt>45.00</AccAmt><PmtInfo>Rēķins 12</PmtInfo><CPartySet><AccHolder><Name>SIA PARAUGS</Name></AccHolder></CPartySet></TrxSet>
        <TrxSet><TypeCode>INP</TypeCode><BookDate>2026-09-10</BookDate><BankRef>FV-002</BankRef><CorD>C</CorD><AccAmt>500.00</AccAmt><PmtInfo>Alga</PmtInfo><CPartyName>Jānis Paraugs</CPartyName></TrxSet>
        <TrxSet><TypeCode>CHOU</TypeCode><BookDate>2026-09-11</BookDate><BankRef>FV-003</BankRef><CorD>D</CorD><AccAmt>20.00</AccAmt><PmtInfo>Skaidrās naudas izņemšana</PmtInfo></TrxSet>
        <TrxSet><TypeCode>MEMD</TypeCode><BookDate>2026-09-30</BookDate><BankRef>FV-004</BankRef><CorD>D</CorD><AccAmt>0.50</AccAmt><PmtInfo>Komisija</PmtInfo></TrxSet>
        <CloseBal>534.50</CloseBal>
      </CcyStmt>
    </AccountSet>
  </Statement>
</FIDAVISTA>`;

test('FiDAViSTA XML imports every transaction set', async () => {
    const r = await importFile('fidavista.xml', utf8(FIDAVISTA));
    assertMatrix(r, {
        format: 'fidavista', rows: 4, stmtOut: 6550, stmtIn: 50000, out: 6550, in: 50000,
        kinds: ['expense', 'income', 'expense', 'expense'], skipped: [],
    });
    assert.deepEqual(r.rows.map((x) => x.bankRef), ['FV-001', 'FV-002', 'FV-003', 'FV-004']);
});

const HTML_XLS = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>td { color: red; }</style></head>
<body>
<table><tr><td>Statement</td><td>Account LV00TEST0000000000000</td></tr><tr><td>Period</td><td>01.09.2026 - 30.09.2026</td></tr></table>
<table border="1">
  <tr><th>Date</th><th>Details</th><th>Debit</th><th>Credit</th></tr>
  <tr><td>2026-09-01</td><td>Shop A &amp; Co</td><td>3.50</td><td></td></tr>
  <tr><td>2026-09-02</td><td>Salary</td><td></td><td>1000.00</td></tr>
  <tr><td>2026-09-03</td><td>Cafe B</td><td>12.00</td><td></td></tr>
  <tr><td>Total</td><td></td><td>15.50</td><td>1000.00</td></tr>
</table>
</body></html>`;

test('HTML saved as .xls: preamble table is passed over, the Total row is a summary', async () => {
    const r = await importFile('statement.xls', utf8(HTML_XLS));
    assertMatrix(r, {
        format: 'html', rows: 3, stmtOut: 1550, stmtIn: 100000, out: 1550, in: 100000,
        kinds: ['expense', 'income', 'expense'], skipped: summary(5),
    });
    assert.equal(r.rows[0].description, 'Shop A & Co');
});

const SML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office">\n<Styles><Style ss:ID="Default"/></Styles>\n';
const cell = (value, type = 'String') => `<Cell><Data ss:Type="${type}">${value}</Data></Cell>`;
const SPREADSHEETML = `${SML_HEAD}<ss:Worksheet ss:Name="Sheet1"><Table>`
    + `<Row>${cell('Date')}${cell('Details')}${cell('Amount')}</Row>`
    + `<Row>${cell('2026-09-01T00:00:00.000', 'DateTime')}${cell('Shop &amp; Co')}${cell('-3.5', 'Number')}</Row>`
    + `<Row>${cell('2026-09-02T00:00:00.000', 'DateTime')}${cell('Salary')}${cell('1000', 'Number')}</Row>`
    + `<Row>${cell('2026-09-03T00:00:00.000', 'DateTime')}${cell('Cafe')}${cell('-12', 'Number')}</Row>`
    + '</Table></ss:Worksheet></Workbook>';

test('SpreadsheetML saved as .xls: DateTime and Number cells with signed amounts', async () => {
    const r = await importFile('statement2.xls', utf8(SPREADSHEETML));
    assertMatrix(r, {
        format: 'spreadsheetml', rows: 3, stmtOut: 1550, stmtIn: 100000, out: 1550, in: 100000,
        kinds: ['expense', 'income', 'expense'], skipped: [],
    });
    assert.equal(r.rows[0].description, 'Shop & Co');
});

const LV_1257 = lines(
    'Datums;Saņēmējs;Informācija;Summa;Valūta;Debets/Kredīts',
    '03.09.2026;SIA Ķekava;Pārskaitījums par pirkumu;25,00;EUR;D',
    '14.09.2026;Anna Bērziņa;Alga;300,00;EUR;K',
    '15.09.2026;Ģimenes aptieka;Zāles;7,40;EUR;D',
);

test('windows-1257 CSV: Latvian letters survive', async () => {
    const r = await importFile('lv-1257.csv', legacyBytes(LV_1257, 'windows-1257'));
    assertMatrix(r, {
        format: 'csv', encoding: 'windows-1257', rows: 3, stmtOut: 3240, stmtIn: 30000, out: 3240, in: 30000,
        kinds: ['expense', 'income', 'expense'], skipped: [],
    });
    assert.deepEqual(r.rows.map((x) => x.description), ['Pārskaitījums par pirkumu', 'Alga', 'Zāles']);
    assert.deepEqual(r.rows.map((x) => x.counterparty), ['SIA Ķekava', 'Anna Bērziņa', 'Ģimenes aptieka']);
});

// The Russian text is fully Cyrillic on purpose: the 1251 reading must clearly beat the 1257 reading.
const RU_1251 = lines(
    'Дата;Описание;Сумма;Валюта',
    '03.09.2026;Оплата в магазине Продукты;-25,00;EUR',
    '14.09.2026;Перевод от Иван Петров за аренду;300,00;EUR',
    '15.09.2026;Оплата услуг связи Мобильный интернет;-7,40;EUR',
    '16.09.2026;Покупка в аптеке Здоровье;-12,60;EUR',
);

test('windows-1251 CSV: Russian text is detected and read', async () => {
    const r = await importFile('ru-1251.csv', legacyBytes(RU_1251, 'windows-1251'));
    assertMatrix(r, {
        format: 'csv', encoding: 'windows-1251', rows: 4, stmtOut: 4500, stmtIn: 30000, out: 4500, in: 30000,
        kinds: ['expense', 'income', 'expense', 'expense'], skipped: [],
    });
    assert.equal(r.rows[0].description, 'Оплата в магазине Продукты');
});
