import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseXml,
    child,
    children,
    path,
    pathAll,
    textAt,
    decimalToCents,
    parseCamt,
    parseFidavista,
} from '../src/import/xml.js';

// --- parseXml ---

test('parseXml builds a tree with local names, prefixes and namespaces', () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>
<!-- statement -->
<ns2:Document xmlns:ns2="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02" xmlns:x="urn:x">
    <ns2:Amt Ccy="EUR" x:kind="a">12.50</ns2:Amt>
    <ns2:Empty/>
    <?pi ignored?>
</ns2:Document>`);
    assert.equal(root.name, 'Document');
    assert.equal(root.prefix, 'ns2');
    assert.equal(root.ns, 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02');
    assert.equal(children(root).length, 2);
    const amount = child(root, 'Amt');
    assert.deepEqual(amount.attrs, { Ccy: 'EUR', kind: 'a' });
    assert.equal(amount.text, '12.50');
    assert.equal(child(root, 'Empty').children.length, 0);
});

test('parseXml decodes entities and keeps CDATA as raw text', () => {
    const root = parseXml('<a t="&quot;x&quot; &amp; y">Tom &amp; Jerry &lt;3 &#65;&#x42; &apos;q&gt;<![CDATA[<raw> & ]]></a>');
    assert.equal(root.attrs.t, '"x" & y');
    assert.equal(root.text, 'Tom & Jerry <3 AB \'q><raw> & ');
});

test('parseXml returns null for malformed input', () => {
    assert.equal(parseXml('<a><b></a>'), null);
    assert.equal(parseXml('<a>'), null);
    assert.equal(parseXml('not xml at all'), null);
    assert.equal(parseXml('<a></a><b></b>'), null);
    assert.equal(parseXml('<a x=1></a>'), null);
    assert.equal(parseXml(''), null);
});

test('path helpers follow every matching branch', () => {
    const root = parseXml('<A><B><C>1</C></B><B><C>2</C><C>3</C></B></A>');
    assert.equal(textAt(root, 'B/C'), '1');
    assert.deepEqual(pathAll(root, 'B/C').map((node) => node.text), ['1', '2', '3']);
    assert.equal(path(root, 'B/D'), null);
    assert.equal(textAt(root, 'X/Y'), '');
});

test('decimalToCents avoids floating point error', () => {
    assert.equal(decimalToCents('0.29'), 29);
    assert.equal(decimalToCents('1.005'), 101);
    assert.equal(decimalToCents('-12.4'), -1240);
    assert.equal(decimalToCents('1234567.89'), 123456789);
    assert.equal(decimalToCents('12'), 1200);
    assert.equal(decimalToCents('abc'), null);
});

// --- camt.053 ---

const CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STMT-1</MsgId><CreDtTm>2026-09-20T08:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>1</Id>
      <Acct><Id><IBAN>LV80BANK0000435195001</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Ntry>
        <NtryRef>N-1</NtryRef>
        <Amt Ccy="EUR">46.12</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-14</Dt></BookgDt>
        <ValDt><Dt>2026-09-15</Dt></ValDt>
        <AcctSvcrRef>RF2026091400001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
            <AmtDtls>
              <InstdAmt><Amt Ccy="USD">49.99</Amt></InstdAmt>
              <TxAmt><Amt Ccy="EUR">46.12</Amt></TxAmt>
            </AmtDtls>
            <RltdPties><Cdtr><Nm>AMAZON US</Nm></Cdtr></RltdPties>
            <RmtInf><Ustrd>Card 4111********1111</Ustrd><Ustrd>AMAZON.COM SEATTLE</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">2150.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><DtTm>2026-09-10T09:12:00+03:00</DtTm></BookgDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>SAL-2026-09</EndToEndId></Refs>
            <RltdPties>
              <Dbtr><Pty><Nm>Acme SIA &amp; Co</Nm></Pty></Dbtr>
              <Cdtr><Nm>Jane Doe</Nm></Cdtr>
            </RltdPties>
            <RmtInf><Ustrd>Salary September</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">9.99</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>PDNG</Sts>
        <BookgDt><Dt>2026-09-16</Dt></BookgDt>
        <AddtlNtryInf>Pending card hold</AddtlNtryInf>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

test('parseCamt reads a camt.053 statement', () => {
    const result = parseCamt(CAMT053);
    assert.equal(result.ok, true);
    assert.equal(result.format, 'camt');
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.warnings, ['Skipped 1 entry that is not booked yet.']);

    assert.deepEqual(result.rows[0], {
        date: '2026-09-14',
        amountCents: 4612,
        direction: 'out',
        currency: 'USD',
        originalAmountCents: 4999,
        description: 'Card 4111********1111 AMAZON.COM SEATTLE',
        counterparty: 'AMAZON US',
        bankRef: 'RF2026091400001',
    });

    assert.deepEqual(result.rows[1], {
        date: '2026-09-10',
        amountCents: 215000,
        direction: 'in',
        currency: 'EUR',
        originalAmountCents: 215000,
        description: 'Salary September',
        counterparty: 'Acme SIA & Co',
        bankRef: 'SAL-2026-09',
    });
});

test('parseCamt reads a prefixed camt.052 report and falls back to value date', () => {
    const xml = `<?xml version="1.0"?>
<ns2:Document xmlns:ns2="urn:iso:std:iso:20022:tech:xsd:camt.052.001.02">
  <ns2:BkToCstmrAcctRpt>
    <ns2:Rpt>
      <ns2:Ntry>
        <ns2:NtryRef>R-77</ns2:NtryRef>
        <ns2:Amt Ccy="EUR">3.40</ns2:Amt>
        <ns2:CdtDbtInd>DBIT</ns2:CdtDbtInd>
        <ns2:Sts>BOOK</ns2:Sts>
        <ns2:ValDt><ns2:Dt>2026-09-03</ns2:Dt></ns2:ValDt>
        <ns2:AddtlNtryInf>RIMI MINI 1234 RIGA</ns2:AddtlNtryInf>
      </ns2:Ntry>
    </ns2:Rpt>
  </ns2:BkToCstmrAcctRpt>
</ns2:Document>`;
    const result = parseCamt(xml);
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].date, '2026-09-03');
    assert.equal(result.rows[0].amountCents, 340);
    assert.equal(result.rows[0].bankRef, 'R-77');
    assert.equal(result.rows[0].description, 'RIMI MINI 1234 RIGA');
    assert.deepEqual(result.warnings, []);
});

test('parseCamt leaves amountCents null for a foreign entry without EUR amount', () => {
    const xml = `<Document><BkToCstmrStmt><Stmt><Acct><Ccy>USD</Ccy></Acct>
      <Ntry><Amt Ccy="USD">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOKED</Sts>
      <BookgDt><Dt>2026-09-01</Dt></BookgDt></Ntry>
      <Ntry><Amt Ccy="USD">20.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
      <BookgDt><Dt>2026-09-02</Dt></BookgDt>
      <NtryDtls><TxDtls><AmtDtls><CntrValAmt><Amt Ccy="EUR">18.20</Amt></CntrValAmt></AmtDtls></TxDtls></NtryDtls></Ntry>
    </Stmt></BkToCstmrStmt></Document>`;
    const result = parseCamt(xml);
    assert.equal(result.ok, true);
    assert.equal(result.rows[0].currency, 'USD');
    assert.equal(result.rows[0].originalAmountCents, 1000);
    assert.equal(result.rows[0].amountCents, null);
    assert.equal(result.rows[1].amountCents, 1820);
    assert.equal(result.rows[1].originalAmountCents, 2000);
});

test('parseCamt fails clearly on malformed or unrelated XML', () => {
    assert.deepEqual(parseCamt('<Document><BkToCstmrStmt></Document>'), {
        ok: false,
        reason: 'The file is not valid XML.',
    });
    assert.equal(parseCamt('<Other/>').ok, false);
});

// --- FiDAViSTA ---

const FIDAVISTA = `<?xml version="1.0" encoding="UTF-8"?>
<FIDAVISTA xmlns="http://www.bankasoc.lv/fidavista/fidavista0102.xsd">
  <Header><Timestamp>20260920080000000</Timestamp><From>BANK</From></Header>
  <Statement>
    <Period><StartDate>2026-09-01</StartDate><EndDate>2026-09-19</EndDate></Period>
    <AccountSet>
      <IBAN>LV80BANK0000435195001</IBAN>
      <CcyStmt>
        <Ccy>EUR</Ccy>
        <TrxSet>
          <TypeCode>CARD</TypeCode>
          <TypeName>Card payment</TypeName>
          <BookDate>2026-09-05</BookDate>
          <ValueDate>2026-09-04</ValueDate>
          <BankRef>FV-001</BankRef>
          <DocNo>123</DocNo>
          <CorD>D</CorD>
          <AccAmt>12.35</AccAmt>
          <PmtInfo>MAXIMA X123 RIGA</PmtInfo>
          <CPartySet><AccHolder><Name>MAXIMA LATVIJA SIA</Name></AccHolder></CPartySet>
        </TrxSet>
        <TrxSet>
          <TypeCode>INP</TypeCode>
          <BookDate>2026-09-10</BookDate>
          <CorD>C</CorD>
          <AccAmt>500.00</AccAmt>
          <PmtInfo>Parāds &quot;atmaksa&quot;</PmtInfo>
          <CPartyName>Jānis Bērziņš</CPartyName>
        </TrxSet>
        <TrxSet>
          <BookDate>2026-09-11</BookDate>
          <CorD>D</CorD>
          <AccAmt>9.00</AccAmt>
          <PmtInfo>Netflix</PmtInfo>
          <CPartySet><Name>NETFLIX</Name><Ccy>USD</Ccy><Amt>10.49</Amt></CPartySet>
        </TrxSet>
        <TrxSet>
          <CorD>D</CorD>
          <AccAmt>1.00</AccAmt>
        </TrxSet>
      </CcyStmt>
    </AccountSet>
  </Statement>
</FIDAVISTA>`;

test('parseFidavista reads the assumed FiDAViSTA structure', () => {
    const result = parseFidavista(FIDAVISTA);
    assert.equal(result.ok, true);
    assert.equal(result.format, 'fidavista');
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.warnings, ['Skipped 1 entry without a date.']);

    assert.deepEqual(result.rows[0], {
        date: '2026-09-05',
        amountCents: 1235,
        direction: 'out',
        currency: 'EUR',
        originalAmountCents: 1235,
        description: 'MAXIMA X123 RIGA',
        counterparty: 'MAXIMA LATVIJA SIA',
        bankRef: 'FV-001',
    });
    assert.equal(result.rows[1].direction, 'in');
    assert.equal(result.rows[1].amountCents, 50000);
    assert.equal(result.rows[1].description, 'Parāds "atmaksa"');
    assert.equal(result.rows[1].counterparty, 'Jānis Bērziņš');
    assert.equal(result.rows[2].currency, 'USD');
    assert.equal(result.rows[2].originalAmountCents, 1049);
    assert.equal(result.rows[2].amountCents, 900);
});

test('parseFidavista fails when no transactions are found', () => {
    const result = parseFidavista('<FIDAVISTA><Statement><AccountSet/></Statement></FIDAVISTA>');
    assert.equal(result.ok, false);
    assert.match(result.reason, /No transactions/);
});

test('parseFidavista fails on malformed XML', () => {
    assert.deepEqual(parseFidavista('<FIDAVISTA><Statement>'), {
        ok: false,
        reason: 'The file is not valid XML.',
    });
});
