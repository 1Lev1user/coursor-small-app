import test from 'node:test';
import assert from 'node:assert/strict';
import { readXlsx } from '../src/import/xlsx.js';
import {
    parseDateWith,
    inferDateFormat,
    findHeaderRow,
    guessColumns,
    rowsToStatement,
} from '../src/import/text.js';
import { readStatementFile } from '../src/views/import.js';

const WARNING = 'This file has formulas that were never calculated. Open it in Excel and save it again.';

// --- tiny ZIP writer (stored entries only) ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function header(size) {
    const bytes = new Uint8Array(size);
    return { bytes, view: new DataView(bytes.buffer) };
}

/** files: [{ name, text }] */
function buildZip(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const data = encoder.encode(file.text);
        const crc = crc32(data);

        const local = header(30);
        local.view.setUint32(0, 0x04034b50, true);
        local.view.setUint16(4, 20, true);
        local.view.setUint32(14, crc, true);
        local.view.setUint32(18, data.length, true);
        local.view.setUint32(22, data.length, true);
        local.view.setUint16(26, name.length, true);
        parts.push(local.bytes, name, data);

        const entry = header(46);
        entry.view.setUint32(0, 0x02014b50, true);
        entry.view.setUint16(4, 20, true);
        entry.view.setUint16(6, 20, true);
        entry.view.setUint32(16, crc, true);
        entry.view.setUint32(20, data.length, true);
        entry.view.setUint32(24, data.length, true);
        entry.view.setUint16(28, name.length, true);
        entry.view.setUint32(42, offset, true);
        central.push(entry.bytes, name);
        offset += 30 + name.length + data.length;
    }

    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = header(22);
    end.view.setUint32(0, 0x06054b50, true);
    end.view.setUint16(8, files.length, true);
    end.view.setUint16(10, files.length, true);
    end.view.setUint32(12, centralSize, true);
    end.view.setUint32(16, offset, true);

    const all = [...parts, ...central, end.bytes];
    const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
    let cursor = 0;
    for (const part of all) {
        out.set(part, cursor);
        cursor += part.length;
    }
    return out;
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** sheets: [{ name, rowsXml }]. Cells use inline strings, so there is no sharedStrings part. */
function workbookBytes(sheets) {
    const sheetTags = sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
    const relTags = sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('');
    return buildZip([
        { name: '[Content_Types].xml', text: '<Types/>' },
        {
            name: 'xl/workbook.xml',
            text: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheetTags}</sheets></workbook>`,
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            text: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTags}</Relationships>`,
        },
        ...sheets.map((sheet, i) => ({
            name: `xl/worksheets/sheet${i + 1}.xml`,
            text: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${MAIN}"><sheetData>${sheet.rowsXml}</sheetData></worksheet>`,
        })),
    ]);
}

function str(ref, text) {
    return `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
}

const HEADER_ROW = `<row r="1">${str('A1', 'Date')}${str('B1', 'Amount')}${str('C1', 'Details')}</row>`;

/** Three transactions; the date cells are plain numbers (General format, no style). */
function serialSheet(cellB2 = '<c r="B2"><v>-12.5</v></c>') {
    return HEADER_ROW
        + `<row r="2"><c r="A2"><v>46296</v></c>${cellB2}${str('C2', 'Rimi')}</row>`
        + `<row r="3"><c r="A3"><v>46297</v></c><c r="B3"><v>-3.2</v></c>${str('C3', 'Coffee')}</row>`
        + `<row r="4"><c r="A4"><v>46300</v></c><c r="B4"><v>1500</v></c>${str('C4', 'Pay')}</row>`;
}

/** Three transactions with dates as text, so the sheet looks like a statement. */
const DATED_SHEET = HEADER_ROW
    + `<row r="2">${str('A2', '01.10.2026')}<c r="B2"><v>-12.5</v></c>${str('C2', 'Rimi')}</row>`
    + `<row r="3">${str('A3', '02.10.2026')}<c r="B3"><v>-3.2</v></c>${str('C3', 'Coffee')}</row>`
    + `<row r="4">${str('A4', '05.10.2026')}<c r="B4"><v>1500</v></c>${str('C4', 'Pay')}</row>`;

function statementOf(tableRows) {
    const headerRow = findHeaderRow(tableRows);
    const guess = guessColumns(tableRows[headerRow], tableRows.slice(headerRow + 1));
    const statement = rowsToStatement(tableRows, headerRow, {
        columns: guess.columns,
        decimalSeparator: guess.decimalSeparator,
        dateFormat: guess.dateFormat,
    });
    return { headerRow, guess, statement };
}

// --- inferDateFormat / parseDateWith ---

test('inferDateFormat returns SERIAL only when every sample is a whole day number from 20000 to 80000', () => {
    assert.equal(inferDateFormat(['46296', '46297', '46300']), 'SERIAL');
    assert.equal(inferDateFormat(['46296', '', ' 46297 ']), 'SERIAL');
    assert.equal(inferDateFormat(['20000']), 'SERIAL');
    assert.equal(inferDateFormat(['80000']), 'SERIAL');
    for (const value of ['19999', '80001', '100000', '46296.5', '4629', 'abc']) {
        assert.notEqual(inferDateFormat([value]), 'SERIAL', value);
    }
    assert.notEqual(inferDateFormat(['46296', '2026-10-01']), 'SERIAL');
    assert.equal(inferDateFormat(['46296', '17 Sep 2026']), null);
    assert.equal(inferDateFormat(['17 Sep 2026', '3 Oct 2026']), 'TEXT');
    assert.equal(inferDateFormat(['17.09.2026', '18.09.2026']), 'DMY');
    assert.equal(inferDateFormat(['2026-09-17', '2026-09-18']), 'YMD');
});

test('parseDateWith reads Excel day numbers only with the SERIAL format', () => {
    assert.equal(parseDateWith('46296', 'SERIAL'), '2026-10-01');
    assert.equal(parseDateWith(' 46296 ', 'SERIAL'), '2026-10-01');
    assert.equal(parseDateWith('20000', 'SERIAL'), '1954-10-03');
    assert.equal(parseDateWith('80000', 'SERIAL'), '2119-01-11');
    for (const value of ['19999', '80001', '46296.5', 'abc', '']) {
        assert.equal(parseDateWith(value, 'SERIAL'), null, value);
    }
    for (const format of ['DMY', 'MDY', 'YMD', 'TEXT']) {
        assert.equal(parseDateWith('46296', format), null, format);
    }
    assert.equal(parseDateWith('17.09.2026', 'DMY'), '2026-09-17');
});

// --- the column guess ---

test('a table with serial dates is read through guessColumns and rowsToStatement', () => {
    const { headerRow, guess, statement } = statementOf([
        ['Date', 'Amount', 'Details'],
        ['46296', '-12.50', 'Rimi'],
        ['46297', '-3.20', 'Coffee'],
        ['46300', '1500.00', 'Pay'],
    ]);
    assert.equal(headerRow, 0);
    assert.equal(guess.columns.date, 0);
    assert.equal(guess.dateFormat, 'SERIAL');
    assert.deepEqual(statement.rows.map((row) => row.date), ['2026-10-01', '2026-10-02', '2026-10-05']);
    assert.deepEqual(statement.skipped, []);
});

test('an amount column of 5-digit numbers is not turned into dates', () => {
    const dated = statementOf([
        ['Date', 'Amount', 'Details'],
        ['2026-10-01', '25000', 'Car'],
        ['2026-10-02', '30000', 'Flat'],
    ]);
    assert.equal(dated.guess.columns.amount, 1);
    assert.equal(dated.guess.dateFormat, 'YMD');

    const undated = statementOf([
        ['Ref', 'Total', 'Notes'],
        ['46296', '25000', 'Car'],
        ['46297', '30000', 'Flat'],
    ]);
    assert.equal(undated.guess.columns.date, -1);
    assert.equal(undated.guess.dateFormat, null);
});

// --- xlsx ---

test('an xlsx with plain-number dates is read as serial dates', async () => {
    const result = await readXlsx(workbookBytes([{ name: 'Statement', rowsXml: serialSheet() }]));
    assert.equal(result.ok, true);
    assert.equal('warnings' in result, false);
    assert.equal(result.rows[1][0], '46296');
    const { guess, statement } = statementOf(result.rows);
    assert.equal(guess.dateFormat, 'SERIAL');
    assert.equal(statement.rows[0].date, '2026-10-01');
});

test('a formula cell with no calculated value gives a warning, the rows are still returned', async () => {
    for (const cell of [
        '<c r="B2"><f>SUM(A1:A1)</f></c>',
        '<c r="B2"><f>SUM(A1:A1)</f><v/></c>',
        '<c r="B2"><f>SUM(A1:A1)</f><v></v></c>',
    ]) {
        const result = await readXlsx(workbookBytes([{ name: 'Statement', rowsXml: serialSheet(cell) }]));
        assert.equal(result.ok, true, cell);
        assert.deepEqual(result.warnings, [WARNING], cell);
        assert.equal(result.rows.length, 4, cell);
        assert.deepEqual(result.rows[1], ['46296', '', 'Rimi'], cell);
    }
});

test('formulas with a calculated value, or an empty text result, give no warnings key', async () => {
    for (const cell of [
        '<c r="B2"><f>-12.5</f><v>-12.5</v></c>',
        '<c r="B2"><f t="shared" si="0"/><v>-12.5</v></c>',
        '<c r="B2" t="str"><f>"" &amp; ""</f><v></v></c>',
        '<c r="B2"><v>-12.5</v></c>',
    ]) {
        const result = await readXlsx(workbookBytes([{ name: 'Statement', rowsXml: serialSheet(cell) }]));
        assert.equal(result.ok, true, cell);
        assert.equal('warnings' in result, false, cell);
    }
});

test('the warning counts only the sheet that is returned', async () => {
    const formulaOnly = HEADER_ROW + '<row r="2"><c r="B2"><f>1+1</f></c></row>';

    // The first sheet has an uncalculated formula but is not a statement; the second one is chosen.
    const chosenLater = await readXlsx(workbookBytes([
        { name: 'Notes', rowsXml: formulaOnly },
        { name: 'Statement', rowsXml: DATED_SHEET },
    ]));
    assert.equal(chosenLater.ok, true);
    assert.equal(chosenLater.rows.length, 4);
    assert.equal('warnings' in chosenLater, false);

    // No sheet looks like a statement: the first sheet is returned, with its own count.
    const fallback = await readXlsx(workbookBytes([
        { name: 'Notes', rowsXml: formulaOnly },
        { name: 'More', rowsXml: HEADER_ROW },
    ]));
    assert.equal(fallback.ok, true);
    assert.deepEqual(fallback.warnings, [WARNING]);

    const fallbackClean = await readXlsx(workbookBytes([
        { name: 'More', rowsXml: HEADER_ROW },
        { name: 'Notes', rowsXml: formulaOnly },
    ]));
    assert.equal('warnings' in fallbackClean, false);
});

// --- the wizard path ---

test('readStatementFile carries the formula warning of an xlsx', async () => {
    const withFormula = workbookBytes([{ name: 'Statement', rowsXml: serialSheet('<c r="B2"><f>SUM(A1:A1)</f></c>') }]);
    const result = await readStatementFile(new File([withFormula], 'statement.xlsx'));
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'table');
    assert.deepEqual(result.warnings, [WARNING]);

    const clean = await readStatementFile(new File([workbookBytes([{ name: 'Statement', rowsXml: serialSheet() }])], 'statement.xlsx'));
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.warnings ?? [], []);
});
