import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat } from '../src/import/detect.js';

const CAMT_053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt><Stmt><Id>1</Id></Stmt></BkToCstmrStmt>
</Document>`;

const CAMT_052_PREFIXED = `﻿<?xml version="1.0"?>
<!-- exported -->
<ns2:Document xmlns:ns2="urn:iso:std:iso:20022:tech:xsd:camt.052.001.06">
  <ns2:BkToCstmrAcctRpt/>
</ns2:Document>`;

const CAMT_NO_NS = `<Document><BkToCstmrStmt><Stmt/></BkToCstmrStmt></Document>`;

const FIDAVISTA = `<?xml version="1.0" encoding="UTF-8"?>
<FIDAVISTA xmlns="http://bankasoc.lv/fidavista/fidavista0101.xsd">
  <Header><Timestamp>20260917</Timestamp></Header>
  <Statement/>
</FIDAVISTA>`;

const CSV_SEMICOLON = `Datums;Summa;Apraksts
17.09.2026;-3,50;RIMI RIGA
18.09.2026;-12,00;"MAXIMA; JURMALA"
`;

const CSV_WITH_PREAMBLE = `Account statement
Account: LV00HABA0000000000000
Date,Amount,Description,Currency
2026-09-17,-3.50,Coffee,EUR
2026-09-18,-12.00,Lunch,EUR
2026-09-19,1500.00,Salary,EUR
`;

test('detectFormat recognises camt.053 by namespace', () => {
    assert.equal(detectFormat(CAMT_053, 'statement.xml'), 'camt');
});

test('detectFormat recognises prefixed camt.052 with BOM and comment', () => {
    assert.equal(detectFormat(CAMT_052_PREFIXED), 'camt');
});

test('detectFormat recognises camt without namespace by its content', () => {
    assert.equal(detectFormat(CAMT_NO_NS), 'camt');
});

test('detectFormat recognises FiDAViSTA root element', () => {
    assert.equal(detectFormat(FIDAVISTA, 'izraksts.xml'), 'fidavista');
});

test('detectFormat recognises semicolon CSV with quoted delimiter', () => {
    assert.equal(detectFormat(CSV_SEMICOLON, 'export.csv'), 'csv');
});

test('detectFormat tolerates bank preamble lines in CSV', () => {
    assert.equal(detectFormat(CSV_WITH_PREAMBLE), 'csv');
});

test('detectFormat recognises tab separated text', () => {
    assert.equal(detectFormat('Date\tAmount\n2026-09-17\t-3.50\n'), 'csv');
});

test('detectFormat returns unknown for other XML, plain text and empty input', () => {
    assert.equal(detectFormat('<html><body>Hi</body></html>'), 'unknown');
    assert.equal(detectFormat('Just one line of text'), 'unknown');
    assert.equal(detectFormat('Hello there\nNo delimiters here\n'), 'unknown');
    assert.equal(detectFormat(''), 'unknown');
    assert.equal(detectFormat(null), 'unknown');
    assert.equal(detectFormat('a,b\nc,d', 'broken.xml'), 'unknown');
});
