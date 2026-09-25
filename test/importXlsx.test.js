import test from 'node:test';
import assert from 'node:assert/strict';
import {
    readXlsx,
    excelSerialToDate,
    plainNumber,
    isDateFormatCode,
} from '../src/import/xlsx.js';

// --- tiny ZIP writer ---

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

async function deflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function header(size) {
    const bytes = new Uint8Array(size);
    return { bytes, view: new DataView(bytes.buffer) };
}

/** files: [{ name, text, stored?, descriptor? }] */
async function buildZip(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const raw = encoder.encode(file.text);
        const data = file.stored ? raw : await deflateRaw(raw);
        const method = file.stored ? 0 : 8;
        const crc = crc32(raw);
        const flags = file.descriptor ? 0x0008 : 0;

        const local = header(30);
        local.view.setUint32(0, 0x04034b50, true);
        local.view.setUint16(4, 20, true);
        local.view.setUint16(6, flags, true);
        local.view.setUint16(8, method, true);
        local.view.setUint32(14, file.descriptor ? 0 : crc, true);
        local.view.setUint32(18, file.descriptor ? 0 : data.length, true);
        local.view.setUint32(22, file.descriptor ? 0 : raw.length, true);
        local.view.setUint16(26, name.length, true);
        parts.push(local.bytes, name, data);
        let size = 30 + name.length + data.length;

        if (file.descriptor) {
            const descriptor = header(16);
            descriptor.view.setUint32(0, 0x08074b50, true);
            descriptor.view.setUint32(4, crc, true);
            descriptor.view.setUint32(8, data.length, true);
            descriptor.view.setUint32(12, raw.length, true);
            parts.push(descriptor.bytes);
            size += 16;
        }

        const entry = header(46);
        entry.view.setUint32(0, 0x02014b50, true);
        entry.view.setUint16(4, 20, true);
        entry.view.setUint16(6, 20, true);
        entry.view.setUint16(8, flags, true);
        entry.view.setUint16(10, method, true);
        entry.view.setUint32(16, crc, true);
        entry.view.setUint32(20, data.length, true);
        entry.view.setUint32(24, raw.length, true);
        entry.view.setUint16(28, name.length, true);
        entry.view.setUint32(42, offset, true);
        central.push(entry.bytes, name);
        offset += size;
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

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN}" xmlns:r="${REL}">
  <workbookPr/>
  <sheets><sheet name="Statement" sheetId="1" r:id="rId3"/></sheets>
</workbook>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="${REL}/worksheet" Target="worksheets/data.xml"/>
</Relationships>`;

const SHARED = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="${MAIN}" count="4" uniqueCount="4">
  <si><t>Date</t></si>
  <si><t>Amount</t></si>
  <si><r><rPr><b/></rPr><t>Description</t></r><r><t xml:space="preserve"> &amp; note</t></r></si>
  <si><t>Rimi Rīga</t></si>
</sst>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="${MAIN}">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/></numFmts>
  <cellXfs count="4">
    <xf numFmtId="0"/>
    <xf numFmtId="14" applyNumberFormat="1"/>
    <xf numFmtId="164" applyNumberFormat="1"/>
    <xf numFmtId="4" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;

const SHEET = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="${MAIN}">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" s="1"><v>46280</v></c><c r="B2" s="3"><v>-12.4</v></c><c r="D2" t="s"><v>3</v></c></row>
    <row r="3"><c r="A3" s="2"><v>46281.5</v></c><c r="B3"><v>1500</v></c><c r="C3" t="inlineStr"><is><t>inline text</t></is></c><c r="E3" t="b"><v>1</v></c></row>
    <row r="5"><c r="C5"><v>1.2E-3</v></c></row>
    <row r="6"><c r="A6" s="0"/></row>
  </sheetData>
</worksheet>`;

function workbookFiles(overrides = {}) {
    return [
        { name: '[Content_Types].xml', text: '<Types/>', stored: true },
        { name: 'xl/workbook.xml', text: overrides.workbook ?? WORKBOOK },
        { name: 'xl/_rels/workbook.xml.rels', text: RELS, descriptor: true },
        { name: 'xl/sharedStrings.xml', text: SHARED },
        { name: 'xl/styles.xml', text: STYLES, stored: true },
        { name: 'xl/worksheets/data.xml', text: overrides.sheet ?? SHEET, descriptor: true },
    ];
}

// --- readXlsx ---

test('readXlsx reads strings, numbers, dates and fills gaps', async () => {
    const result = await readXlsx(await buildZip(workbookFiles()));
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [
        ['Date', 'Amount', '', 'Description & note'],
        ['2026-09-15', '-12.4', '', 'Rimi Rīga'],
        ['2026-09-16', '1500', 'inline text', '', 'TRUE'],
        ['', '', '0.0012'],
    ]);
});

test('readXlsx respects the 1904 date system', async () => {
    const workbook = WORKBOOK.replace('<workbookPr/>', '<workbookPr date1904="1"/>');
    const sheet = `<worksheet xmlns="${MAIN}"><sheetData>
        <row r="1"><c r="A1" s="1"><v>0</v></c><c r="B1" s="1"><v>44818</v></c></row>
    </sheetData></worksheet>`;
    const result = await readXlsx(await buildZip(workbookFiles({ workbook, sheet })));
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [['1904-01-01', '2026-09-15']]);
});

test('readXlsx falls back to sheet1 when there is no workbook part', async () => {
    const bytes = await buildZip([
        { name: 'xl/worksheets/sheet1.xml', text: `<worksheet><sheetData><row><c t="str"><v>a</v></c><c><v>2</v></c></row></sheetData></worksheet>` },
    ]);
    const result = await readXlsx(bytes);
    assert.deepEqual(result, { ok: true, rows: [['a', '2']] });
});

test('readXlsx rejects an old .xls file', async () => {
    const bytes = new Uint8Array(512);
    bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const result = await readXlsx(bytes);
    assert.deepEqual(result, {
        ok: false,
        reason: 'This is an old Excel file (.xls). Save it as .xlsx or CSV and try again.',
    });
});

test('readXlsx rejects garbage and non-Excel ZIP files', async () => {
    const garbage = await readXlsx(new TextEncoder().encode('Date;Amount\n2026-09-01;12,00\n'));
    assert.deepEqual(garbage, { ok: false, reason: 'This file is not an Excel workbook.' });

    const empty = await readXlsx(new Uint8Array(0));
    assert.equal(empty.ok, false);

    const otherZip = await readXlsx(await buildZip([{ name: 'readme.txt', text: 'hello' }]));
    assert.deepEqual(otherZip, { ok: false, reason: 'This file is not an Excel workbook.' });
});

test('readXlsx reports a damaged workbook', async () => {
    const bytes = await buildZip(workbookFiles({ sheet: '<worksheet><sheetData>' }));
    const result = await readXlsx(bytes);
    assert.equal(result.ok, false);
    assert.match(result.reason, /damaged/);
});

// --- helpers ---

test('excelSerialToDate handles the 1900 leap year bug', () => {
    assert.equal(excelSerialToDate(1), '1900-01-01');
    assert.equal(excelSerialToDate(59), '1900-02-28');
    assert.equal(excelSerialToDate(61), '1900-03-01');
    assert.equal(excelSerialToDate(45292), '2024-01-01');
    assert.equal(excelSerialToDate(46280), '2026-09-15');
    assert.equal(excelSerialToDate(46280.99), '2026-09-15');
});

test('plainNumber avoids exponents and float noise', () => {
    assert.equal(plainNumber('-12.4'), '-12.4');
    assert.equal(plainNumber('0.30000000000000004'), '0.3');
    assert.equal(plainNumber('1.2E-3'), '0.0012');
    assert.equal(plainNumber('1E+21'), '1000000000000000000000');
    assert.equal(plainNumber('12.399999999999999'), '12.4');
    assert.equal(plainNumber('100'), '100');
    assert.equal(plainNumber('0'), '0');
});

test('isDateFormatCode tells dates from times and numbers', () => {
    assert.equal(isDateFormatCode('dd/mm/yyyy;@'), true);
    assert.equal(isDateFormatCode('mmm yy'), true);
    assert.equal(isDateFormatCode('[$-409]d-mmm-yy'), true);
    assert.equal(isDateFormatCode('h:mm:ss'), false);
    assert.equal(isDateFormatCode('[h]:mm'), false);
    assert.equal(isDateFormatCode('#,##0.00 "EUR"'), false);
    assert.equal(isDateFormatCode('0.00'), false);
});

test('readXlsx refuses huge column references instead of padding rows', async () => {
    const bytes = await buildZip([
        { name: 'xl/worksheets/sheet1.xml', text: '<worksheet><sheetData><row r="1"><c r="ZZZZZZZ1" t="str"><v>x</v></c></row></sheetData></worksheet>' },
    ]);
    assert.deepEqual(await readXlsx(bytes), { ok: false, reason: 'The Excel file is damaged and could not be read.' });
});

test('readXlsx stops reading an entry that inflates past the size limit', async () => {
    const filler = 'A'.repeat(1024 * 1024);
    const text = `<worksheet><sheetData>${`<!--${filler}-->`.repeat(52)}</sheetData></worksheet>`;
    const bytes = await buildZip([{ name: 'xl/worksheets/sheet1.xml', text }]);
    assert.ok(bytes.length < 2 * 1024 * 1024);
    assert.deepEqual(await readXlsx(bytes), { ok: false, reason: 'This Excel file is too large to read.' });
});
