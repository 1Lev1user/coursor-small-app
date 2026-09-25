import { parseXml, child, children } from './xml.js';

const OLD_XLS = 'This is an old Excel file (.xls). Save it as .xlsx or CSV and try again.';
const NOT_EXCEL = 'This file is not an Excel workbook.';
const TOO_LARGE = 'This Excel file is too large to read.';
const DAMAGED = 'The Excel file is damaged and could not be read.';
const PROTECTED = 'This workbook is password protected. Remove the password and try again.';

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

function u16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function findEndOfDirectory(bytes) {
    const stop = Math.max(0, bytes.length - 22 - 0xffff);
    for (let offset = bytes.length - 22; offset >= stop; offset -= 1) {
        if (u32(bytes, offset) === 0x06054b50) {
            return offset;
        }
    }
    return -1;
}

/**
 * Lists ZIP entries from the central directory. Returns null when the bytes are not a ZIP archive.
 * @param {Uint8Array} bytes
 * @returns {Map<string, { method: number, compressedSize: number, localOffset: number }> | null}
 */
export function readZipDirectory(bytes) {
    if (bytes.length < 22) {
        return null;
    }
    const end = findEndOfDirectory(bytes);
    if (end === -1) {
        return null;
    }
    const count = u16(bytes, end + 10);
    let offset = u32(bytes, end + 16);
    const entries = new Map();

    for (let index = 0; index < count; index += 1) {
        if (offset + 46 > bytes.length || u32(bytes, offset) !== 0x02014b50) {
            return null;
        }
        const nameLength = u16(bytes, offset + 28);
        const extraLength = u16(bytes, offset + 30);
        const commentLength = u16(bytes, offset + 32);
        const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
        entries.set(name, {
            method: u16(bytes, offset + 10),
            compressedSize: u32(bytes, offset + 20),
            localOffset: u32(bytes, offset + 42),
        });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

// A statement is small; these limits stop a crafted file from filling memory.
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_COLUMNS = 16384;

class TooLargeError extends Error {}

async function inflateRaw(data) {
    const reader = new Blob([data]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.length;
        if (total > MAX_ENTRY_BYTES) {
            await reader.cancel();
            throw new TooLargeError();
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

async function readZipEntry(bytes, entry) {
    const local = entry.localOffset;
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) {
        throw new Error('Bad local header');
    }
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (data.length !== entry.compressedSize) {
        throw new Error('Truncated entry');
    }
    if (entry.method === 0) {
        return data;
    }
    if (entry.method === 8) {
        return inflateRaw(data);
    }
    throw new Error(`Unsupported compression method ${entry.method}`);
}

// ---------------------------------------------------------------------------
// Workbook parts
// ---------------------------------------------------------------------------

function resolveTarget(target) {
    const raw = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const parts = [];
    for (const part of raw.split('/')) {
        if (part === '..') {
            parts.pop();
        } else if (part && part !== '.') {
            parts.push(part);
        }
    }
    return parts.join('/');
}

function firstSheetPath(workbook, rels) {
    const sheet = child(child(workbook, 'sheets'), 'sheet');
    const relId = sheet?.attrs.id;
    if (relId && rels) {
        const rel = children(rels, 'Relationship').find((item) => item.attrs.Id === relId);
        if (rel?.attrs.Target) {
            return resolveTarget(rel.attrs.Target);
        }
    }
    return 'xl/worksheets/sheet1.xml';
}

function isDate1904(workbook) {
    const value = String(child(workbook, 'workbookPr')?.attrs.date1904 ?? '').toLowerCase();
    return value === '1' || value === 'true';
}

function richText(node) {
    const plain = child(node, 't');
    if (plain) {
        return plain.text;
    }
    return children(node, 'r').map((run) => child(run, 't')?.text ?? '').join('');
}

function readSharedStrings(sst) {
    return sst ? children(sst, 'si').map(richText) : [];
}

const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export function isDateFormatCode(code) {
    const stripped = String(code)
        .replace(/"[^"]*"/g, '')
        .replace(/\\./g, '')
        .replace(/\[(?:h+|m+|s+)\]/gi, 'h')
        .replace(/\[[^\]]*\]/g, '')
        .split(';')[0];
    if (/[dy]/i.test(stripped)) {
        return true;
    }
    return /m/i.test(stripped) && !/[hs]/i.test(stripped);
}

function readDateStyles(styleSheet) {
    const dateStyles = new Set();
    if (!styleSheet) {
        return dateStyles;
    }
    const customDates = new Set(
        children(child(styleSheet, 'numFmts'), 'numFmt')
            .filter((item) => isDateFormatCode(item.attrs.formatCode ?? ''))
            .map((item) => Number(item.attrs.numFmtId)),
    );
    children(child(styleSheet, 'cellXfs'), 'xf').forEach((xf, index) => {
        const id = Number(xf.attrs.numFmtId ?? 0);
        if (BUILT_IN_DATE_FORMATS.has(id) || customDates.has(id)) {
            dateStyles.add(index);
        }
    });
    return dateStyles;
}

// ---------------------------------------------------------------------------
// Cell values
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

/**
 * Converts an Excel serial day number to 'YYYY-MM-DD'.
 * @param {number} serial
 * @param {boolean} [date1904]
 */
export function excelSerialToDate(serial, date1904 = false) {
    const days = Math.floor(serial);
    let epoch;
    if (date1904) {
        epoch = Date.UTC(1904, 0, 1);
    } else if (days === 60) {
        // Excel's fictional 1900-02-29; the nearest real day keeps the value usable.
        return '1900-02-28';
    } else {
        epoch = days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
    }
    return new Date(epoch + days * DAY_MS).toISOString().slice(0, 10);
}

function expandExponent(text) {
    const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
    if (!match) {
        return text;
    }
    const [, sign, whole, fraction = '', exponentText] = match;
    const digits = whole + fraction;
    const point = whole.length + Number(exponentText);
    let result;
    if (point <= 0) {
        result = `0.${'0'.repeat(-point)}${digits}`;
    } else if (point >= digits.length) {
        result = digits + '0'.repeat(point - digits.length);
    } else {
        result = `${digits.slice(0, point)}.${digits.slice(point)}`;
    }
    return sign + result;
}

/**
 * Formats a stored numeric cell value as a plain decimal string, as Excel shows it
 * (15 significant digits, no exponent).
 * @param {string} raw
 */
export function plainNumber(raw) {
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) {
        return raw.trim();
    }
    if (value === 0) {
        return '0';
    }
    let text = expandExponent(value.toPrecision(15));
    if (text.includes('.')) {
        text = text.replace(/0+$/, '').replace(/\.$/, '');
    }
    text = text.replace(/^(-?)0+(?=\d)/, '$1');
    return text === '-0' ? '0' : text;
}

function columnIndex(ref) {
    const letters = /^[A-Z]+/i.exec(ref ?? '')?.[0];
    if (!letters) {
        return -1;
    }
    let index = 0;
    for (const letter of letters.toUpperCase()) {
        index = index * 26 + (letter.charCodeAt(0) - 64);
        if (index > MAX_COLUMNS) {
            throw new Error('Column out of range');
        }
    }
    return index - 1;
}

function cellValue(cell, context) {
    const type = cell.attrs.t ?? 'n';
    const raw = child(cell, 'v')?.text ?? '';

    switch (type) {
        case 's':
            return context.sharedStrings[Number(raw)] ?? '';
        case 'inlineStr':
            return richText(child(cell, 'is'));
        case 'str':
            return raw;
        case 'b':
            return raw.trim() === '1' ? 'TRUE' : 'FALSE';
        case 'e':
            return raw.trim();
        case 'd':
            return raw.trim().slice(0, 10);
        default: {
            if (raw.trim() === '') {
                return '';
            }
            const style = Number(cell.attrs.s ?? 0);
            const serial = Number(raw);
            if (context.dateStyles.has(style) && Number.isFinite(serial) && serial >= 0) {
                return excelSerialToDate(serial, context.date1904);
            }
            return plainNumber(raw);
        }
    }
}

function readRows(sheet, context) {
    const rows = [];
    for (const row of children(child(sheet, 'sheetData'), 'row')) {
        const values = [];
        let next = 0;
        for (const cell of children(row, 'c')) {
            const position = columnIndex(cell.attrs.r);
            const index = position >= 0 ? position : next;
            while (values.length < index) {
                values.push('');
            }
            values[index] = cellValue(cell, context);
            next = index + 1;
        }
        while (values.length > 0 && values[values.length - 1] === '') {
            values.pop();
        }
        if (values.length > 0) {
            rows.push(values);
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function isOleFile(bytes) {
    return bytes.length >= 8
        && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
        && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
}

function isEncryptedPackage(bytes) {
    const marker = 'EncryptedPackage';
    const limit = Math.min(bytes.length, 1 << 20);
    outer: for (let offset = 0; offset + marker.length * 2 <= limit; offset += 1) {
        for (let index = 0; index < marker.length; index += 1) {
            if (bytes[offset + index * 2] !== marker.charCodeAt(index) || bytes[offset + index * 2 + 1] !== 0) {
                continue outer;
            }
        }
        return true;
    }
    return false;
}

function toBytes(input) {
    if (input instanceof Uint8Array) {
        return input;
    }
    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return null;
}

/**
 * Reads the first worksheet of an .xlsx file into rows of strings.
 * @param {Uint8Array} input
 * @returns {Promise<{ ok: true, rows: string[][] } | { ok: false, reason: string }>}
 */
export async function readXlsx(input) {
    const bytes = toBytes(input);
    if (!bytes) {
        return { ok: false, reason: NOT_EXCEL };
    }
    if (isOleFile(bytes)) {
        return { ok: false, reason: isEncryptedPackage(bytes) ? PROTECTED : OLD_XLS };
    }

    const entries = readZipDirectory(bytes);
    if (!entries) {
        return { ok: false, reason: NOT_EXCEL };
    }

    const readXml = async (name) => {
        const entry = entries.get(name);
        if (!entry) {
            return null;
        }
        const tree = parseXml(new TextDecoder().decode(await readZipEntry(bytes, entry)));
        if (!tree) {
            throw new Error(`Bad XML in ${name}`);
        }
        return tree;
    };

    try {
        const workbook = await readXml('xl/workbook.xml');
        if (!workbook && !entries.has('xl/worksheets/sheet1.xml')) {
            return { ok: false, reason: NOT_EXCEL };
        }
        const rels = await readXml('xl/_rels/workbook.xml.rels');
        const sheetPath = workbook ? firstSheetPath(workbook, rels) : 'xl/worksheets/sheet1.xml';
        const sheet = await readXml(sheetPath) ?? await readXml('xl/worksheets/sheet1.xml');
        if (!sheet) {
            return { ok: false, reason: NOT_EXCEL };
        }

        const context = {
            sharedStrings: readSharedStrings(await readXml('xl/sharedStrings.xml')),
            dateStyles: readDateStyles(await readXml('xl/styles.xml')),
            date1904: workbook ? isDate1904(workbook) : false,
        };
        return { ok: true, rows: readRows(sheet, context) };
    } catch (error) {
        return { ok: false, reason: error instanceof TooLargeError ? TOO_LARGE : DAMAGED };
    }
}
