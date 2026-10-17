import test from 'node:test';
import assert from 'node:assert/strict';
import { readHtmlTable } from '../src/import/htmlTable.js';
import { readSpreadsheetMl } from '../src/import/spreadsheetml.js';
import { detectFormat } from '../src/import/detect.js';
import { findHeaderRow } from '../src/import/text.js';
import { readStatementFile } from '../src/views/import.js';

// All sample data below is made up.

const tr = (...cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;

const STATEMENT_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>td { color: red; }</style></head>
<body>
<table>
  <tr><td>Statement</td><td>Account LV00TEST0000000000000</td></tr>
  <tr><td>Period</td><td>01.09.2026 - 30.09.2026</td></tr>
</table>
<table border="1">
  <tr><th>Date</th><th>Details</th><th>Debit</th><th>Credit</th></tr>
  <tr><td>2026-09-01</td><td>Shop A</td><td>3.50</td><td></td></tr>
  <tr><td>2026-09-02</td><td>Salary</td><td></td><td>1000.00</td></tr>
  <tr><td>2026-09-03</td><td>Cafe B</td><td>12.00</td><td></td></tr>
</table>
</body></html>`;

const STATEMENT_ROWS = [
    ['Date', 'Details', 'Debit', 'Credit'],
    ['2026-09-01', 'Shop A', '3.50'],
    ['2026-09-02', 'Salary', '', '1000.00'],
    ['2026-09-03', 'Cafe B', '12.00'],
];

const SML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
    + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"'
    + ' xmlns:o="urn:schemas-microsoft-com:office:office">\n<Styles><Style ss:ID="Default"/></Styles>\n';
const sml = (rows, name = 'Sheet1') => `${SML_HEAD}<ss:Worksheet ss:Name="${name}"><Table>${rows}</Table></ss:Worksheet></Workbook>`;
const cell = (value, type = 'String') => `<Cell><Data ss:Type="${type}">${value}</Data></Cell>`;

const STATEMENT_SML = sml(
    `<Row>${cell('Date')}${cell('Details')}${cell('Amount')}</Row>`
    + `<Row>${cell('2026-09-01T00:00:00.000', 'DateTime')}${cell('Shop &amp; Co')}${cell('3.5', 'Number')}</Row>`
    + `<Row>${cell('2026-09-02T00:00:00.000', 'DateTime')}${cell('Salary')}${cell('1000', 'Number')}</Row>`
    + `<Row>${cell('2026-09-03T00:00:00.000', 'DateTime')}${cell('Cafe')}${cell('12', 'Number')}</Row>`,
);

const utf16le = (text) => {
    const out = new Uint8Array(2 + text.length * 2);
    out[0] = 0xff;
    out[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) {
        out[2 + i * 2] = text.charCodeAt(i) & 255;
        out[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    return out;
};

// ---------------------------------------------------------------------------
// HTML tables
// ---------------------------------------------------------------------------

test('readHtmlTable picks the transactions table, not the preamble table', () => {
    const result = readHtmlTable(STATEMENT_HTML);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, STATEMENT_ROWS);
});

test('readHtmlTable decodes entities once and keeps escaped tags as text', () => {
    const html = `<table>${tr('2026-09-01', 'A&nbsp;B', 'Tom &amp; Jerry', 'Riga &#257; &#x101;', '&lt;b&gt;', '&amp;nbsp;', '&nbsp;', '1&nbsp;000', 'x&euro;y')}</table>`;
    const result = readHtmlTable(html);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [
        ['2026-09-01', 'A B', 'Tom & Jerry', 'Riga ā ā', '<b>', '&nbsp;', '', '1 000', 'x€y'],
    ]);
});

test('readHtmlTable turns br into a line break and an only-br cell into an empty cell', () => {
    const html = `<table>${tr('2026-09-01', 'Line1<br>Line2', 'A<br/>B', 'C<BR>D', '<br>', 'E <br> F')}</table>`;
    const result = readHtmlTable(html);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['2026-09-01', 'Line1\nLine2', 'A\nB', 'C\nD', '', 'E\nF']]);
});

test('readHtmlTable expands colspan with empty cells and clamps odd values', () => {
    const html = '<table><tr><td colspan="2">2026-09-01</td><td>Y</td></tr>'
        + '<tr><td colspan=0>a</td><td colspan="abc">b</td><td colspan=\'3\'>c</td><td>d</td></tr></table>';
    const result = readHtmlTable(html);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['2026-09-01', '', 'Y'], ['a', 'b', 'c', '', '', 'd']]);

    const huge = readHtmlTable('<table><tr><td colspan="99999999">2026-09-01</td><td>x</td></tr></table>');
    assert.equal(huge.ok, true);
    assert.ok(huge.rows[0].length <= 1000);
});

test('readHtmlTable tolerates sloppy markup', () => {
    const html = '<TABLE><!-- <tr><td>2000-01-01</td></tr> --><script>var a = "<tr><td>";</script><style>td{}</style>'
        + '<TR><TH class=h>Date<TH>Note'
        + '<TR><TD data-x=\'a>b\' title="x>y">2026-09-01<TD>one'
        + '<TR><TD>2026-09-02<TD>two</TABLE>';
    const result = readHtmlTable(html);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['Date', 'Note'], ['2026-09-01', 'one'], ['2026-09-02', 'two']]);
});

test('readHtmlTable keeps a nested table separate from the outer cell', () => {
    const inner = `<table>${tr('Date', 'Note')}${tr('2026-09-01', 'a')}${tr('2026-09-02', 'b')}</table>`;
    const html = `<table><tr><td>Outer text${inner}after</td><td>Z</td></tr></table>`;
    const result = readHtmlTable(html);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['Date', 'Note'], ['2026-09-01', 'a'], ['2026-09-02', 'b']]);

    const outerFirst = readHtmlTable(`<table><tr><td>2026-01-01</td></tr>${tr(inner)}</table>`);
    assert.equal(outerFirst.ok, true);
    assert.equal(outerFirst.rows.length, 3);
});

test('readHtmlTable never throws and returns ok false for broken input', () => {
    const noResult = ['<table><tr><td>abc<', '<table><tr><td>text</td></tr></table>', '<tr', '', 'just text', null, 42];
    for (const input of noResult) {
        let result;
        assert.doesNotThrow(() => { result = readHtmlTable(input); }, String(input));
        assert.equal(result.ok, false, String(input));
        assert.equal(typeof result.reason, 'string');
    }
    for (const input of [
        '<table><tr><td>abc',
        '<table><tr><td data="open',
        '<table><tr><td>2026-09-01</td></tr>',
        '<script>',
        '<!-- never closed',
        undefined,
    ]) {
        assert.doesNotThrow(() => readHtmlTable(input), String(input));
    }
});

test('readHtmlTable handles an unclosed tag after a table without hanging', () => {
    const result = readHtmlTable(`<table>${tr('2026-09-01', 'a')}</table><td data="open`);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['2026-09-01', 'a']]);
});

test('readHtmlTable refuses too many rows, too many columns and too deep nesting', () => {
    const many = `<table>${'<tr><td>2026-09-01</td></tr>'.repeat(200001)}</table>`;
    assert.equal(readHtmlTable(many).ok, false);

    const deep = '<table><tr><td>'.repeat(500) + '2026-09-01';
    assert.doesNotThrow(() => readHtmlTable(deep));
    assert.equal(readHtmlTable(deep).ok, false);

    const wide = `<table><tr>${'<td>2026-09-01</td>'.repeat(1500)}</tr></table>`;
    assert.equal(readHtmlTable(wide).ok, false);
});

// ---------------------------------------------------------------------------
// SpreadsheetML
// ---------------------------------------------------------------------------

test('readSpreadsheetMl reads rows, dates, numbers, entities and nested text', () => {
    const result = readSpreadsheetMl(STATEMENT_SML);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [
        ['Date', 'Details', 'Amount'],
        ['2026-09-01', 'Shop & Co', '3.5'],
        ['2026-09-02', 'Salary', '1000'],
        ['2026-09-03', 'Cafe', '12'],
    ]);

    const rich = readSpreadsheetMl(sml(`<Row><Cell><Data ss:Type="String">Hello <B>bold</B></Data></Cell>${cell('2026-09-01T13:45:00.000', 'DateTime')}</Row>`));
    assert.equal(rich.ok, true);
    assert.equal(rich.rows[0][0], 'Hello bold');
    assert.equal(rich.rows[0][1], '2026-09-01');
});

test('readSpreadsheetMl honours ss:Index gaps, empty cells and MergeAcross', () => {
    const rows = '<Row ss:Index="1"><Cell ss:Index="2"><Data ss:Type="String">B</Data></Cell>'
        + '<Cell ss:Index="5"><Data ss:Type="String">E</Data></Cell><Cell ss:Index="6"/></Row>'
        + `<Row>${cell('x')}<Cell ss:MergeAcross="1"><Data ss:Type="String">y</Data></Cell>${cell('z')}<Cell ss:Index="5"/></Row>`
        + '<Row><Cell/><Cell/></Row>';
    const result = readSpreadsheetMl(sml(rows));
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['', 'B', '', '', 'E'], ['x', 'y', '', 'z']]);
});

test('readSpreadsheetMl reads only the first worksheet', () => {
    const second = '<ss:Worksheet ss:Name="Two"><Table><Row><Cell><Data ss:Type="String">other</Data></Cell></Row></Table></ss:Worksheet>';
    const text = sml(`<Row>${cell('first')}</Row>`).replace('</Workbook>', `${second}</Workbook>`);
    const result = readSpreadsheetMl(text);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['first']]);
});

test('readSpreadsheetMl returns ok false for unreadable workbooks and never throws', () => {
    const bad = [
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet>',
        '<Other xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>',
        `${SML_HEAD}</Workbook>`,
        sml(''),
        sml('<Row><Cell/></Row>'),
        sml('<Row><Cell ss:Index="99999999"><Data ss:Type="String">x</Data></Cell></Row>'),
        '',
        'not xml',
        null,
        7,
    ];
    for (const input of bad) {
        let result;
        assert.doesNotThrow(() => { result = readSpreadsheetMl(input); }, String(input));
        assert.equal(result.ok, false, String(input));
        assert.equal(typeof result.reason, 'string');
    }
});

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

test('detectFormat recognises SpreadsheetML', () => {
    assert.equal(detectFormat(STATEMENT_SML), 'spreadsheetml');
    assert.equal(detectFormat(`﻿  ${STATEMENT_SML}`, 'x.xls'), 'spreadsheetml');
    assert.equal(detectFormat('<Workbook><Worksheet/></Workbook>'), 'unknown');
    assert.equal(detectFormat('<?xml version="1.0"?><Workbook xmlns="urn:other"/>'), 'unknown');
});

test('detectFormat recognises HTML tables and leaves plain pages alone', () => {
    assert.equal(detectFormat(STATEMENT_HTML), 'html');
    assert.equal(detectFormat(`﻿ \n ${STATEMENT_HTML}`, 'a.xls'), 'html');
    assert.equal(detectFormat('<table><tr><td>2026-09-01</td></tr></table>'), 'html');
    assert.equal(detectFormat(`<TABLE>${tr('x')}</TABLE>`), 'html');
    assert.equal(detectFormat('some banner text\n<table><tr><td>x</td></tr></table>'), 'html');
    assert.equal(detectFormat('<html><body>Hi</body></html>'), 'unknown');
    assert.equal(detectFormat('<html><body><table></table></body></html>'), 'unknown');
    assert.equal(detectFormat('<root><item>1</item></root>'), 'unknown');
});

test('detectFormat keeps the other formats unchanged', () => {
    assert.equal(detectFormat('<FIDAVISTA><Statement/></FIDAVISTA>'), 'fidavista');
    assert.equal(detectFormat('Date;Amount\n2026-09-01;3\n2026-09-02;4\n'), 'csv');
    assert.equal(detectFormat('OFXHEADER:100\n<OFX></OFX>'), 'ofx');
});

// ---------------------------------------------------------------------------
// readStatementFile
// ---------------------------------------------------------------------------

test('readStatementFile reads an HTML .xls as a table and the header row is found', async () => {
    const result = await readStatementFile(new File([STATEMENT_HTML], 'stmt.xls'));
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'table');
    assert.equal(result.format, 'html');
    assert.equal(result.delimiter, '');
    assert.equal(result.encoding, '');
    assert.equal('lineCount' in result, false);
    assert.deepEqual(result.rows, STATEMENT_ROWS);
    assert.equal(findHeaderRow(result.rows), 0);
});

test('readStatementFile reads a SpreadsheetML .xls as a table and the header row is found', async () => {
    const result = await readStatementFile(new File([STATEMENT_SML], 'stmt.xls'));
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'table');
    assert.equal(result.format, 'spreadsheetml');
    assert.equal(result.delimiter, '');
    assert.equal(result.encoding, '');
    assert.equal('lineCount' in result, false);
    assert.equal(result.rows.length, 4);
    assert.equal(findHeaderRow(result.rows), 0);
});

test('readStatementFile gives a reason for broken HTML and does not throw', async () => {
    for (const text of ['<table><tr><td>x', '<table><tr><td>abc<', '<html><body>Hi</body></html>']) {
        const result = await readStatementFile(new File([text], 'stmt.xls'));
        assert.equal(result.ok, false, text);
        assert.equal(typeof result.reason, 'string');
    }
});

test('readStatementFile decodes UTF-16 and windows-1257 HTML files', async () => {
    const html = `<table>${tr('Datums', 'Apraksts')}${tr('2026-09-01', 'Pirkums')}${tr('2026-09-02', 'Maksājums')}</table>`;
    const utf16Result = await readStatementFile(new File([utf16le(html)], 'a.xls'));
    assert.equal(utf16Result.ok, true);
    assert.equal(utf16Result.format, 'html');
    assert.equal(utf16Result.rows[2][1], 'Maksājums');

    // 0xE2 is "ā" in windows-1257 and makes the bytes invalid UTF-8
    const bytes = Uint8Array.from(html.replace('ā', 'â'), (char) => char.charCodeAt(0));
    const legacy = await readStatementFile(new File([bytes], 'b.xls'));
    assert.equal(legacy.ok, true);
    assert.equal(legacy.rows[2][1], 'Maksājums');
});
