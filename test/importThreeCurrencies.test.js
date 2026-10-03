import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import {
    defaultDecisions,
    buildImport,
} from '../src/import/core.js';
import { rowsToStatement } from '../src/import/text.js';
import { parseCamt } from '../src/import/xml.js';
import { decisionsForBuild } from '../src/views/import.js';

const NOW = new Date(2026, 8, 25, 12, 0, 0);

function row(date, amountCents, direction, description, extra = {}) {
    return statementRow({ date, amountCents, direction, description, ...extra });
}

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

function expenseDecision(categoryId = 'necessary', subcategoryId = 'groceries', extra = {}) {
    return { include: true, kind: 'expense', categoryId, subcategoryId, incomeCategoryId: '', remember: false, ...extra };
}

// Test 1: camt with three currencies (EUR, USD, GBP)
test('parseCamt reads a statement with EUR, USD and GBP amounts', () => {
    const camt = `<?xml version="1.0" encoding="UTF-8"?>
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

    const result = parseCamt(camt);
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
    const rows = [
        ['Date', 'Description', 'Amount', 'Currency', 'Amount EUR'],
        ['2026-09-22', 'Payment one', '-10.00', 'EUR', ''],
        ['2026-09-23', 'Payment two USD', '-10.00', 'USD', '-9.20'],
        ['2026-09-24', 'Payment three GBP', '-10.00', 'GBP', ''],
    ];

    const layout = {
        decimalSeparator: '.',
        dateFormat: 'YMD',
        columns: { date: 0, amount: 2, description: 1, currency: 3, eurAmount: 4, direction: -1, debit: -1, credit: -1, bankRef: -1 },
    };

    const result = rowsToStatement(rows, 0, layout);
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

// Test 3: buildImport with CSV rows requiring EUR amount for GBP
test('buildImport on CSV rows without EUR amounts gives an error for GBP', () => {
    const csvRows = [
        row('2026-09-22', 1000, 'out', 'Payment one', { currency: 'EUR' }),
        row('2026-09-23', 920, 'out', 'Payment two USD', { currency: 'USD', originalAmountCents: 1000 }),
        row('2026-09-24', null, 'out', 'Payment three GBP', { currency: 'GBP', originalAmountCents: 1000 }),
    ];

    const decisions = [
        expenseDecision(),
        expenseDecision(),
        expenseDecision(),
    ];

    const data = freshData();
    const built = buildImport(data, decisions, { rows: csvRows, format: 'csv', fileName: 'test.csv', now: NOW });
    assert.equal(built.ok, false);
    assert.equal(built.errors.length, 1);
    assert.deepEqual(built.errors[0], { index: 2, reason: 'Enter the amount in EUR for this GBP payment.' });
});

test('buildImport with decisionsForBuild and typed EUR amounts builds successfully', () => {
    const csvRows = [
        row('2026-09-22', 1000, 'out', 'Payment one', { currency: 'EUR' }),
        row('2026-09-23', 920, 'out', 'Payment two USD', { currency: 'USD', originalAmountCents: 1000 }),
        row('2026-09-24', null, 'out', 'Payment three GBP', { currency: 'GBP', originalAmountCents: 1000 }),
    ];

    const decisions = [
        expenseDecision(),
        expenseDecision(),
        expenseDecision(),
    ];

    const data = freshData();
    const eurInputs = ['', '', '11.70'];
    const finalDecisions = decisionsForBuild(csvRows, decisions, eurInputs);
    const built = buildImport(data, finalDecisions, { rows: csvRows, format: 'csv', fileName: 'test.csv', now: NOW });

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

// Test 4: parseCamt builds successfully without requiring typed amounts
test('parseCamt rows with missing EUR amounts build okay with empty EUR inputs', () => {
    const camt = `<?xml version="1.0" encoding="UTF-8"?>
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
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

    const result = parseCamt(camt);
    const camtRows = result.rows;

    const decisions = [expenseDecision()];
    const data = freshData();
    const built = buildImport(data, decisions, { rows: camtRows, format: 'camt', fileName: 'test.xml', now: NOW });

    assert.equal(built.ok, true);
    assert.equal(built.errors.length, 0);
    assert.equal(built.importRecord.counts.expenses, 1);
});
