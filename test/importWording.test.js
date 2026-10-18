import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { findDuplicates, defaultDecisions } from '../src/import/core.js';
import { parseDelimited, rowsToStatement } from '../src/import/text.js';
import {
    DUPLICATE_GROUPS,
    HEADER_ONLY_FILE,
    SKIP_REASONS,
    isHeaderOnly,
    readStatementFile,
} from '../src/views/import.js';

// All sample data below is made up.

const HEADER_ONLY_TEXT = 'This file has a header but no transactions. Check the period you exported.';

const read = (content, name) => readStatementFile(new File([content], name));

test('every skip reason the reader can give has a plain sentence, including zero amount', () => {
    assert.equal(SKIP_REASONS['zero amount'], 'Amount is zero');
    const text = [
        'Date;Amount;Description;Status',
        '2026-09-01;5.00;Shop;done',
        'Total;;;',
        'not a date;5.00;Shop;done',
        '2026-09-02;5.00;Shop;pending',
        '2026-09-03;0.00;Shop;done',
        '2026-09-04;abc;Shop;done',
    ].join('\n');
    const { rows } = parseDelimited(text);
    const layout = {
        columns: { date: 0, amount: 1, description: 2, status: 3, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1 },
        decimalSeparator: '.',
        dateFormat: 'YMD',
    };
    const { skipped } = rowsToStatement(rows, 0, layout);
    const reasons = new Set(skipped.map(({ reason }) => reason));
    for (const reason of ['summary row', 'unparsable date', 'not completed', 'zero amount', 'unparsable amount']) {
        assert.ok(reasons.has(reason), `the sample should skip a row as "${reason}"`);
    }
    for (const reason of [...reasons, 'unknown direction']) {
        assert.ok(SKIP_REASONS[reason], `"${reason}" needs a plain sentence`);
        assert.notEqual(SKIP_REASONS[reason], reason);
    }
});

test('a CSV that holds only a header line says it has no transactions', async () => {
    const samples = [
        'Date;Amount;Description\n',
        'Date;Amount;Description',
        'Date,Amount,Description\r\n\r\n',
        '﻿Date;Amount;Description\n',
        'Datums;Summa\n',
        'Date;Amount;Description;\n',
    ];
    for (const sample of samples) {
        const result = await read(sample, 'a.csv');
        assert.equal(result.ok, false, JSON.stringify(sample));
        assert.equal(result.reason, HEADER_ONLY_TEXT, JSON.stringify(sample));
    }
    assert.equal(HEADER_ONLY_FILE, HEADER_ONLY_TEXT);
});

test('other short files keep the "does not look like a bank statement" message', async () => {
    for (const [sample, name] of [['Hello, world\n', 'a.csv'], ['a;b\n', 'a.csv'], ['<note>hi</note>', 'a.xml']]) {
        const result = await read(sample, name);
        assert.equal(result.ok, false, sample);
        assert.match(result.reason, /^This file does not look like a bank statement\./, sample);
    }
    const withData = await read('Date;Amount;Description\n2026-09-01;5.00;Shop\n', 'a.csv');
    assert.equal(withData.ok, true);
    assert.equal(withData.kind, 'table');
});

const sml = (rows) => '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
    + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table>'
    + `${rows}</Table></Worksheet></Workbook>`;
const smlRow = (...cells) => `<Row>${cells.map((c) => `<Cell><Data ss:Type="String">${c}</Data></Cell>`).join('')}</Row>`;

test('a SpreadsheetML file with only a header row says it has no transactions', async () => {
    const headerOnly = await read(sml(smlRow('Date', 'Amount', 'Desc')), 'a.xls');
    assert.equal(headerOnly.ok, false);
    assert.equal(headerOnly.reason, HEADER_ONLY_TEXT);
    const withData = await read(sml(smlRow('Date', 'Amount', 'Desc') + smlRow('2026-09-01', '5.00', 'Shop')), 'a.xls');
    assert.equal(withData.ok, true);
    assert.equal(withData.kind, 'table');
});

// --- a minimal stored ZIP with one part ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(name, text) {
    const nameBytes = new TextEncoder().encode(name);
    const raw = new TextEncoder().encode(text);
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, raw.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, raw.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, 46 + nameBytes.length, true);
    end.setUint32(16, 30 + nameBytes.length + raw.length, true);
    const parts = [
        new Uint8Array(local.buffer), nameBytes, raw,
        new Uint8Array(entry.buffer), nameBytes,
        new Uint8Array(end.buffer),
    ];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let cursor = 0;
    for (const part of parts) {
        out.set(part, cursor);
        cursor += part.length;
    }
    return out;
}

const xlsxRow = (...cells) => `<row>${cells.map((c) => `<c t="str"><v>${c}</v></c>`).join('')}</row>`;
const xlsx = (rows) => storedZip('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${rows}</sheetData></worksheet>`);

test('an xlsx file with only a header row says it has no transactions', async () => {
    const headerOnly = await read(xlsx(xlsxRow('Date', 'Amount', 'Desc')), 'a.xlsx');
    assert.equal(headerOnly.ok, false);
    assert.equal(headerOnly.reason, HEADER_ONLY_TEXT);
    const withData = await read(xlsx(xlsxRow('Date', 'Amount', 'Desc') + xlsxRow('2026-09-01', '5.00', 'Shop')), 'a.xlsx');
    assert.equal(withData.ok, true);
    assert.equal(withData.kind, 'table');
});

test('isHeaderOnly is true only when the last non-blank row is the header', () => {
    assert.equal(isHeaderOnly([['Date', 'Amount', 'Description']]), true);
    assert.equal(isHeaderOnly([['Date', 'Amount', 'Description'], ['', '', '']]), true);
    assert.equal(isHeaderOnly([['Date', 'Amount', 'Description'], ['2026-09-01', '5.00', 'Shop']]), false);
    assert.equal(isHeaderOnly([['2026-09-01', '5.00', 'Shop']]), false);
    assert.equal(isHeaderOnly([['', ''], ['', '']]), false);
    assert.equal(isHeaderOnly([]), false);
});

test('rows that look like a saved entry start unticked, so the duplicate boxes stay "Import anyway"', () => {
    const data = defaultData();
    data.expenses = [
        { id: 'e1', categoryId: 'random', subcategoryId: '', amountCents: 999, note: '', date: '2026-09-01', bankRef: 'BR-1', importId: 'imp_old', fingerprint: 'x' },
        { id: 'e2', categoryId: 'random', subcategoryId: '', amountCents: 1200, note: 'Lunch', date: '2026-09-10' },
        { id: 'e3', categoryId: 'random', subcategoryId: '', amountCents: 800, note: '', date: '2026-09-12' },
    ];
    const rows = [
        statementRow({ date: '2026-09-01', amountCents: 999, direction: 'out', description: 'Whatever', bankRef: 'BR-1' }),
        statementRow({ date: '2026-09-10', amountCents: 1200, direction: 'out', description: 'CAFE' }),
        statementRow({ date: '2026-09-14', amountCents: 800, direction: 'out', description: 'SHOP' }),
        statementRow({ date: '2026-09-20', amountCents: 4400, direction: 'out', description: 'NEW' }),
    ];
    const duplicates = findDuplicates(data, rows);
    assert.deepEqual(duplicates.map(({ level }) => level), ['exact', 'probable', 'weak', null]);
    assert.deepEqual(defaultDecisions(data, rows, duplicates).map(({ include }) => include), [false, false, false, true]);
    assert.deepEqual(DUPLICATE_GROUPS.map(([level]) => level), ['exact', 'probable', 'weak']);
});
