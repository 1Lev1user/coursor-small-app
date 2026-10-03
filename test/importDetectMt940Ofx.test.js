import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat } from '../src/import/detect.js';
import { readStatementFile } from '../src/views/import.js';

// All samples below are synthetic: fake IBAN, BIC and amounts.

const MT940_BODY = [
    ':20:STMT0001',
    ':25:LV00FAKE0000000000001',
    ':28C:1/1',
    ':60F:C260901EUR1000,00',
    ':61:2609250925D12,50NTRFNONREF',
    ':86:Synthetic shop purchase',
    ':61:2609260926C100,00NTRFNONREF',
    ':86:Synthetic refund',
    ':62F:C260930EUR1087,50',
].join('\n');

const SWIFT_HEADER = '{1:F01FAKEBICXAXXX0000000000}{2:O9401200260930FAKEBICXAXXX00000000002609301201N}{4:\n';

const OFX_SGML = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '',
    '<OFX>',
    '<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260925<TRNAMT>-12.50<NAME>Synthetic shop',
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>',
    '</OFX>',
].join('\n');

const OFX_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
    <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260925</DTPOSTED><TRNAMT>-12.50</TRNAMT></STMTTRN>
  </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const CSV_SAMPLE = [
    'Date,Description,Amount',
    '2026-09-25,Synthetic shop,-12.50',
    '2026-09-26,Synthetic refund,100.00',
].join('\n');

const MT940_MESSAGE = 'This looks like an MT940 statement. The app cannot read MT940 yet.'
    + ' Export the same statement as CSV or camt.053 XML.';
const OFX_MESSAGE = 'This looks like an OFX/QFX statement. The app cannot read OFX/QFX yet.'
    + ' Export the same statement as CSV or camt.053 XML.';

test('MT940 without a SWIFT header is recognised', () => {
    assert.equal(detectFormat(MT940_BODY), 'mt940');
    assert.equal(detectFormat(MT940_BODY, 'stmt.sta'), 'mt940');
});

test('MT940 with a SWIFT header is recognised with LF and CRLF', () => {
    assert.equal(detectFormat(SWIFT_HEADER + MT940_BODY + '\n-}'), 'mt940');
    const crlf = (SWIFT_HEADER + MT940_BODY + '\n-}').replace(/\n/g, '\r\n');
    assert.equal(detectFormat(crlf), 'mt940');
});

test('MT940 with :60M: opening balance is recognised', () => {
    assert.equal(detectFormat(MT940_BODY.replace(':60F:', ':60M:')), 'mt940');
});

test('MT940 lines with commas are not mistaken for csv', () => {
    const text = [
        ':20:STMT0001',
        ':25:LV00FAKE0000000000001',
        ':60F:C260901EUR1000,00',
        ':61:2609250925D12,50NTRFNONREF',
        ':61:2609260926C100,00NTRFNONREF',
        ':61:2609270927D5,00NTRFNONREF',
    ].join('\n');
    assert.equal(detectFormat(text), 'mt940');
});

test('text with only some MT940 tags is not MT940', () => {
    assert.notEqual(detectFormat(':20:STMT0001\n:25:LV00FAKE0000000000001\n'), 'mt940');
    assert.notEqual(detectFormat(':25:X\n:60F:Y\n:20:Z\n'), 'mt940');
});

test('OFX 1.x SGML is recognised, also with BOM, blank lines and .ofx name', () => {
    assert.equal(detectFormat(OFX_SGML), 'ofx');
    assert.equal(detectFormat('﻿\n\n' + OFX_SGML, 'export.ofx'), 'ofx');
});

test('OFX 2.x XML and QFX are recognised, also with an .xml name', () => {
    assert.equal(detectFormat(OFX_XML), 'ofx');
    assert.equal(detectFormat(OFX_XML, 'export.xml'), 'ofx');
    assert.equal(detectFormat(OFX_SGML, 'export.qfx'), 'ofx');
});

test('CSV and plain text are detected as before', () => {
    assert.equal(detectFormat(CSV_SAMPLE), 'csv');
    assert.equal(detectFormat('just a note'), 'unknown');
});

test('readStatementFile refuses an MT940 file with the final message', async () => {
    const result = await readStatementFile(new File([MT940_BODY], 'stmt.sta'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, MT940_MESSAGE);
    assert.match(result.reason, /MT940/);
});

test('readStatementFile refuses OFX and QFX files with the final message', async () => {
    for (const [body, name] of [[OFX_SGML, 'stmt.ofx'], [OFX_XML, 'stmt.qfx']]) {
        const result = await readStatementFile(new File([body], name));
        assert.equal(result.ok, false);
        assert.equal(result.reason, OFX_MESSAGE);
    }
});

test('readStatementFile still reads a CSV file', async () => {
    const result = await readStatementFile(new File([CSV_SAMPLE], 'stmt.csv'));
    assert.equal(result.ok, true);
    assert.equal(result.format, 'csv');
});
