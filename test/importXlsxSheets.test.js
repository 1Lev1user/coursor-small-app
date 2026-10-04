import test from 'node:test';
import assert from 'node:assert/strict';
import { readXlsx } from '../src/import/xlsx.js';

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

// --- multi-sheet workbook helpers ---

function cellXml(ref, value) {
    return `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function sheetXml(rows) {
    const body = rows.map((row, r) => `<row r="${r + 1}">${
        row.map((value, c) => cellXml(`${String.fromCharCode(65 + c)}${r + 1}`, value)).join('')
    }</row>`).join('');
    return `<worksheet xmlns="${MAIN}"><sheetData>${body}</sheetData></worksheet>`;
}

/** sheets: [{ name, rows, state? }]; file names are deliberately not sequential. */
function multiSheetFiles(sheets) {
    const fileName = (i) => `xl/worksheets/data${(sheets.length - i) * 7}.xml`;
    const sheetTags = sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}"${
        sheet.state ? ` state="${sheet.state}"` : ''
    } r:id="rId${i + 10}"/>`).join('');
    const relTags = sheets.map((sheet, i) => `<Relationship Id="rId${i + 10}" Type="${REL}/worksheet" Target="${fileName(i).slice(3)}"/>`).join('');
    return [
        { name: '[Content_Types].xml', text: '<Types/>', stored: true },
        { name: 'xl/workbook.xml', text: `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheetTags}</sheets></workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', text: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTags}</Relationships>` },
        ...sheets.map((sheet, i) => ({ name: fileName(i), text: sheetXml(sheet.rows) })),
    ];
}

const SUMMARY = [
    ['Konts', 'LV00TEST'],
    ['Periods', '01.09.2026 - 30.09.2026'],
    ['Atlikums', '987,50'],
];
const TRANSACTIONS = [
    ['Datums', 'Apraksts', 'Summa'],
    ['13.09.2026', 'Rimi', '-12,40'],
    ['14.09.2026', 'Maxima', '-8,10'],
    ['15.09.2026', 'Alga', '1500,00'],
    ['16.09.2026', 'Circle K', '-45,00'],
    ['17.09.2026', 'Elektrum', '-30,25'],
];
const TEXT_ONLY = [['Hello', 'World'], ['Nothing', 'here']];

async function read(sheets) {
    return readXlsx(await buildZip(multiSheetFiles(sheets)));
}

// --- tests ---

test('a Summary first sheet is skipped for the Transactions sheet', async () => {
    const result = await read([
        { name: 'Summary', rows: SUMMARY },
        { name: 'Transactions', rows: TRANSACTIONS },
    ]);
    assert.deepEqual(result, { ok: true, rows: TRANSACTIONS });
});

test('a hidden first sheet is skipped for the visible one', async () => {
    const decoy = [['Datums', 'Apraksts', 'Summa'], ['01.01.2026', 'x', '1'], ['02.01.2026', 'y', '2']];
    for (const state of ['hidden', 'veryHidden']) {
        const result = await read([
            { name: 'Old', rows: decoy, state },
            { name: 'Real', rows: TRANSACTIONS },
        ]);
        assert.deepEqual(result, { ok: true, rows: TRANSACTIONS }, state);
    }
});

test('control: Transactions first, Summary second reads sheet 1', async () => {
    const result = await read([
        { name: 'Transactions', rows: TRANSACTIONS },
        { name: 'Summary', rows: SUMMARY },
    ]);
    assert.deepEqual(result, { ok: true, rows: TRANSACTIONS });
});

test('when no sheet qualifies the first visible sheet comes back unchanged', async () => {
    assert.deepEqual(await read([{ name: 'Only', rows: TEXT_ONLY }]), { ok: true, rows: TEXT_ONLY });

    const skipsHidden = await read([
        { name: 'Hidden', rows: SUMMARY, state: 'hidden' },
        { name: 'A', rows: TEXT_ONLY },
        { name: 'B', rows: [['x']] },
    ]);
    assert.deepEqual(skipsHidden, { ok: true, rows: TEXT_ONLY });

    const none = await read([
        { name: 'A', rows: SUMMARY },
        { name: 'B', rows: TEXT_ONLY },
    ]);
    assert.deepEqual(none, { ok: true, rows: SUMMARY });
});

test('an all-hidden workbook gives the first sheet', async () => {
    const result = await read([
        { name: 'A', rows: SUMMARY, state: 'hidden' },
        { name: 'B', rows: TRANSACTIONS, state: 'veryHidden' },
    ]);
    assert.deepEqual(result, { ok: true, rows: SUMMARY });
});

test('a period cell such as 01.09.2026 - 30.09.2026 is not a date', async () => {
    const period = [['Periods', '01.09.2026 - 30.09.2026'], ['Konts', 'LV00'], ['Atlikums', '1']];
    const result = await read([
        { name: 'Summary', rows: period },
        { name: 'Transactions', rows: TRANSACTIONS },
    ]);
    assert.deepEqual(result, { ok: true, rows: TRANSACTIONS });
});

test('a single-sheet workbook returns its rows as before', async () => {
    const result = await read([{ name: 'Statement', rows: TRANSACTIONS }]);
    assert.deepEqual(result, { ok: true, rows: TRANSACTIONS });
});

test('a date-styled cell counts as a date', async () => {
    const files = multiSheetFiles([
        { name: 'Summary', rows: SUMMARY },
        { name: 'Data', rows: TEXT_ONLY },
    ]);
    files[files.length - 1].text = `<worksheet xmlns="${MAIN}"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Date</t></is></c></row>
        <row r="2"><c r="A2" s="1"><v>46280</v></c></row>
        <row r="3"><c r="A3" s="1"><v>46281</v></c></row>
    </sheetData></worksheet>`;
    files.push({ name: 'xl/styles.xml', text: `<styleSheet xmlns="${MAIN}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>` });
    const result = await readXlsx(await buildZip(files));
    assert.deepEqual(result, { ok: true, rows: [['Date'], ['2026-09-15'], ['2026-09-16']] });
});
