import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import {
    defaultDecisions,
    buildImport,
} from '../src/import/core.js';
import { rowsToStatement } from '../src/import/text.js';
import { parseCamt } from '../src/import/xml.js';
import { decisionsForBuild } from '../src/views/import.js';

const NOW = new Date(2026, 8, 25, 12, 0, 0);

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

const THREE_CURRENCY_CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STMT-1</MsgId><CreDtTm>2026-09-25T12:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>1</Id>
      <Acct><Id><IBAN>LV80BANK0000435195001</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Ntry>
        <NtryRef>N-1</NtryRef>
        <Amt Ccy="EUR">10.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-22</Dt></BookgDt>
        <ValDt><Dt>2026-09-22</Dt></ValDt>
        <AcctSvcrRef>RF202609220001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>EUR-PAYMENT</EndToEndId></Refs>
            <RmtInf><Ustrd>Payment one</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <NtryRef>N-2</NtryRef>
        <Amt Ccy="EUR">9.20</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-23</Dt></BookgDt>
        <ValDt><Dt>2026-09-23</Dt></ValDt>
        <AcctSvcrRef>RF202609230001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>USD-PAYMENT</EndToEndId></Refs>
            <AmtDtls>
              <InstdAmt><Amt Ccy="USD">10.00</Amt></InstdAmt>
              <TxAmt><Amt Ccy="EUR">9.20</Amt></TxAmt>
            </AmtDtls>
            <RmtInf><Ustrd>Payment two USD</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <NtryRef>N-3</NtryRef>
        <Amt Ccy="EUR">11.70</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-24</Dt></BookgDt>
        <ValDt><Dt>2026-09-24</Dt></ValDt>
        <AcctSvcrRef>RF202609240001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>GBP-PAYMENT</EndToEndId></Refs>
            <AmtDtls>
              <InstdAmt><Amt Ccy="GBP">10.00</Amt></InstdAmt>
              <TxAmt><Amt Ccy="EUR">11.70</Amt></TxAmt>
            </AmtDtls>
            <RmtInf><Ustrd>Payment three GBP</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

const CSV_ROWS = [
    ['Date', 'Description', 'Amount', 'Currency', 'Amount EUR'],
    ['2026-09-22', 'Payment one', '-10.00', 'EUR', ''],
    ['2026-09-23', 'Payment two USD', '-10.00', 'USD', '-9.20'],
    ['2026-09-24', 'Payment three GBP', '-10.00', 'GBP', ''],
];

const CSV_LAYOUT = {
    decimalSeparator: '.',
    dateFormat: 'YMD',
    columns: { date: 0, amount: 2, description: 1, currency: 3, eurAmount: 4, direction: -1, debit: -1, credit: -1, bankRef: -1 },
};

// Test 1: camt with three currencies (EUR, USD, GBP)
test('parseCamt reads a statement with EUR, USD and GBP amounts', () => {
    const result = parseCamt(THREE_CURRENCY_CAMT);
    assert.equal(result.ok, true);
    assert.equal(result.format, 'camt');
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.warnings, []);

    assert.deepEqual(result.rows[0], {
        date: '2026-09-22',
        amountCents: 1000,
        direction: 'out',
        currency: 'EUR',
        originalAmountCents: 1000,
        description: 'Payment one',
        counterparty: '',
        bankRef: 'RF202609220001',
    });

    assert.deepEqual(result.rows[1], {
        date: '2026-09-23',
        amountCents: 920,
        direction: 'out',
        currency: 'USD',
        originalAmountCents: 1000,
        description: 'Payment two USD',
        counterparty: '',
        bankRef: 'RF202609230001',
    });

    assert.equal(result.rows[2].currency, 'GBP');
    assert.equal(result.rows[2].amountCents, 1170);
    assert.equal(result.rows[2].originalAmountCents, 1000);
    assert.equal(result.rows[2].direction, 'out');
});

// Test 2: CSV with three currencies via rowsToStatement
test('rowsToStatement processes CSV rows with EUR, USD and GBP with Amount EUR column', () => {
    const result = rowsToStatement(CSV_ROWS, 0, CSV_LAYOUT);
    assert.equal(result.rows.length, 3);
    assert.equal(result.skipped.length, 0);

    assert.deepEqual(result.rows[0].currency, 'EUR');
    assert.deepEqual(result.rows[0].amountCents, 1000);
    assert.deepEqual(result.rows[0].originalAmountCents, 1000);

    assert.deepEqual(result.rows[1].currency, 'USD');
    assert.deepEqual(result.rows[1].amountCents, 920);
    assert.deepEqual(result.rows[1].originalAmountCents, 1000);

    assert.deepEqual(result.rows[2].currency, 'GBP');
    assert.deepEqual(result.rows[2].amountCents, null);
    assert.deepEqual(result.rows[2].originalAmountCents, 1000);
});

// Test 3: buildImport on the rows rowsToStatement returned
test('buildImport with defaultDecisions on parsed CSV rows asks for the EUR amount of the GBP row', () => {
    const { rows } = rowsToStatement(CSV_ROWS, 0, CSV_LAYOUT);
    const data = freshData();
    const decisions = defaultDecisions(data, rows);
    const built = buildImport(data, decisions, { rows, format: 'csv', fileName: 'test.csv', now: NOW });
    assert.equal(built.ok, false);
    assert.equal(built.errors.length, 1);
    assert.deepEqual(built.errors[0], { index: 2, reason: 'Enter the amount in EUR for this GBP payment.' });
});

test('buildImport with decisionsForBuild and a typed GBP EUR amount builds three expenses', () => {
    const { rows } = rowsToStatement(CSV_ROWS, 0, CSV_LAYOUT);
    const data = freshData();
    const decisions = defaultDecisions(data, rows);
    const eurInputs = ['', '', '11.70'];
    const finalDecisions = decisionsForBuild(rows, decisions, eurInputs);
    const built = buildImport(data, finalDecisions, { rows, format: 'csv', fileName: 'test.csv', now: NOW });

    assert.equal(built.ok, true);
    assert.deepEqual(built.errors, []);
    assert.deepEqual(built.planChoices, []);
    assert.equal(built.importRecord.counts.expenses, 3);

    // Check the three expenses are correct
    assert.equal(built.expenses.length, 3);

    const eur = built.expenses[0];
    assert.equal(eur.amountCents, 1000);
    assert.equal(eur.currency, 'EUR');
    assert.equal(eur.originalAmountCents, 1000);

    const usd = built.expenses[1];
    assert.equal(usd.amountCents, 920);
    assert.equal(usd.currency, 'USD');
    assert.equal(usd.originalAmountCents, 1000);

    const gbp = built.expenses[2];
    assert.equal(gbp.amountCents, 1170);
    assert.equal(gbp.currency, 'GBP');
    assert.equal(gbp.originalAmountCents, 1000);

    // Check totals
    assert.equal(built.totals.totalOutCents, 3090);
});

// Test 4: camt rows already carry the EUR amount, so nothing has to be typed
test('buildImport on parsed camt rows with EUR, USD and GBP needs no typed EUR amounts', () => {
    const { rows } = parseCamt(THREE_CURRENCY_CAMT);
    const data = freshData();
    const decisions = defaultDecisions(data, rows);
    const built = buildImport(data, decisions, { rows, format: 'camt', fileName: 'test.xml', now: NOW });

    assert.equal(built.ok, true);
    assert.equal(built.errors.length, 0);
    assert.equal(built.importRecord.counts.expenses, 3);
    assert.deepEqual(
        built.expenses.map((expense) => [expense.currency, expense.amountCents, expense.originalAmountCents]),
        [
            ['EUR', 1000, 1000],
            ['USD', 920, 1000],
            ['GBP', 1170, 1000],
        ],
    );
});
