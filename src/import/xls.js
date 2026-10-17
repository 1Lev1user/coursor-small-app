import { isDateFormatCode, excelSerialToDate, plainNumber } from './xlsx.js';

// Reads old Excel workbooks (.xls: BIFF8 records inside an OLE compound file).
// Formats: [MS-CFB] Compound File Binary and [MS-XLS] Excel Binary File Format.

const NOT_EXCEL = 'This file is not an Excel workbook.';
const TOO_LARGE = 'This Excel file is too large to read.';
const DAMAGED = 'The Excel file is damaged and could not be read.';
const PROTECTED = 'This workbook is password protected. Remove the password and try again.';
const TOO_OLD = 'This Excel file is too old to read. Open it in Excel and save it as .xlsx.';

// Same limits as xlsx.js; a statement is small and a crafted file must not fill memory.
const MAX_COLUMNS = 16384;
const MAX_SHEETS = 10;
const MAX_CELL_SLOTS = 4_000_000;

const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const DATE_CELL = /^\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;

class XlsError extends Error {
    constructor(reason) {
        super(reason);
        this.reason = reason;
    }
}

function fail(reason) {
    throw new XlsError(reason);
}

const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// ---------------------------------------------------------------------------
// Compound file (OLE)
// ---------------------------------------------------------------------------

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;
const MINI_SECTOR_SIZE = 64;

function hasOleSignature(bytes) {
    return bytes.length >= 8
        && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
        && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
}

function readTable(bytes, sectorSize, sectorIds, sectorOffset) {
    const perSector = sectorSize / 4;
    const table = new Uint32Array(sectorIds.length * perSector);
    sectorIds.forEach((id, index) => {
        const view = viewOf(bytes.subarray(sectorOffset(id), sectorOffset(id) + sectorSize));
        for (let k = 0; k < perSector; k += 1) {
            table[index * perSector + k] = view.getUint32(k * 4, true);
        }
    });
    return table;
}

/** Follows a chain through a FAT or mini-FAT; a loop or a bad sector number is damage. */
function chainOf(table, start) {
    const ids = [];
    let id = start;
    while (id !== END_OF_CHAIN) {
        if (id >= table.length || ids.length >= table.length) {
            fail(DAMAGED);
        }
        ids.push(id);
        id = table[id];
    }
    return ids;
}

/**
 * Opens a compound file. Returns the stream entries by name and a function that reads one.
 * @param {Uint8Array} bytes
 */
function openCompoundFile(bytes) {
    if (bytes.length < 512) {
        fail(DAMAGED);
    }
    const header = viewOf(bytes);
    const shift = header.getUint16(30, true);
    if (header.getUint16(28, true) !== 0xfffe || (shift !== 9 && shift !== 12) || header.getUint16(32, true) !== 6) {
        fail(DAMAGED);
    }
    const sectorSize = 1 << shift;
    if (bytes.length < sectorSize) {
        fail(DAMAGED);
    }
    const sectorCount = Math.floor(bytes.length / sectorSize) - 1;
    const sectorOffset = (id) => {
        if (id >= sectorCount) {
            fail(DAMAGED);
        }
        return (id + 1) * sectorSize;
    };
    const sector = (id) => bytes.subarray(sectorOffset(id), sectorOffset(id) + sectorSize);

    // The FAT sector numbers: 109 in the header, the rest in a chain of DIFAT sectors.
    const fatSectors = [];
    for (let k = 0; k < 109; k += 1) {
        const id = header.getUint32(76 + k * 4, true);
        if (id !== FREE_SECTOR && id !== END_OF_CHAIN) {
            fatSectors.push(id);
        }
    }
    const difatCount = header.getUint32(72, true);
    if (difatCount > sectorCount) {
        fail(DAMAGED);
    }
    let difat = header.getUint32(68, true);
    for (let n = 0; n < difatCount; n += 1) {
        const view = viewOf(sector(difat));
        const perSector = sectorSize / 4 - 1;
        for (let k = 0; k < perSector; k += 1) {
            const id = view.getUint32(k * 4, true);
            if (id !== FREE_SECTOR && id !== END_OF_CHAIN) {
                fatSectors.push(id);
            }
        }
        difat = view.getUint32(perSector * 4, true);
    }
    if (fatSectors.length > sectorCount) {
        fail(DAMAGED);
    }
    const fat = readTable(bytes, sectorSize, fatSectors, sectorOffset);

    const readSectors = (start, size) => {
        const ids = chainOf(fat, start);
        const needed = Math.ceil(size / sectorSize);
        if (size > bytes.length || ids.length < needed) {
            fail(DAMAGED);
        }
        const out = new Uint8Array(needed * sectorSize);
        for (let k = 0; k < needed; k += 1) {
            out.set(sector(ids[k]), k * sectorSize);
        }
        return out.subarray(0, size);
    };

    // Directory: 128-byte entries, UTF-16 names whose length counts the terminator.
    const directory = [];
    for (const id of chainOf(fat, header.getUint32(48, true))) {
        const view = viewOf(sector(id));
        for (let base = 0; base < sectorSize; base += 128) {
            const type = view.getUint8(base + 66);
            if (type === 0) {
                continue;
            }
            const nameLength = Math.min(view.getUint16(base + 64, true), 64);
            let name = '';
            for (let k = 0; k + 2 < nameLength; k += 2) {
                name += String.fromCharCode(view.getUint16(base + k, true));
            }
            directory.push({ name, type, start: view.getUint32(base + 116, true), size: view.getUint32(base + 120, true) });
        }
    }
    const root = directory.find((entry) => entry.type === 5);
    if (!root) {
        fail(DAMAGED);
    }

    const cutoff = header.getUint32(56, true);
    let miniFat = null;
    let miniStream = null;
    const readMini = (entry) => {
        miniFat ??= readTable(bytes, sectorSize, chainOf(fat, header.getUint32(60, true)), sectorOffset);
        miniStream ??= readSectors(root.start, root.size);
        const ids = chainOf(miniFat, entry.start);
        const needed = Math.ceil(entry.size / MINI_SECTOR_SIZE);
        if (ids.length < needed) {
            fail(DAMAGED);
        }
        const out = new Uint8Array(needed * MINI_SECTOR_SIZE);
        for (let k = 0; k < needed; k += 1) {
            const offset = ids[k] * MINI_SECTOR_SIZE;
            if (offset >= miniStream.length) {
                fail(DAMAGED);
            }
            out.set(miniStream.subarray(offset, offset + MINI_SECTOR_SIZE), k * MINI_SECTOR_SIZE);
        }
        return out.subarray(0, entry.size);
    };

    return {
        find: (name) => directory.find((entry) => entry.type === 2 && entry.name.toLowerCase() === name.toLowerCase()),
        read: (entry) => (entry.size < cutoff ? readMini(entry) : readSectors(entry.start, entry.size)),
    };
}

// ---------------------------------------------------------------------------
// BIFF8 records
// ---------------------------------------------------------------------------

const BOF = 0x0809;
const EOF = 0x000a;
const CONTINUE = 0x003c;
const FILEPASS = 0x002f;
const DATEMODE = 0x0022;
const FORMAT = 0x041e;
const XF = 0x00e0;
const BOUNDSHEET = 0x0085;
const SST = 0x00fc;
const LABELSST = 0x00fd;
const LABEL = 0x0204;
const RK = 0x027e;
const MULRK = 0x00bd;
const NUMBER = 0x0203;
const FORMULA = 0x0006;
const STRING = 0x0207;
const BOOLERR = 0x0205;
const SHRFMLA = 0x04bc;
const ARRAY = 0x0221;
const TABLEOP = 0x0236;

class Records {
    constructor(stream, position = 0) {
        this.stream = stream;
        this.view = viewOf(stream);
        this.position = position;
    }

    peek() {
        return this.position + 4 <= this.stream.length ? this.view.getUint16(this.position, true) : -1;
    }

    next() {
        if (this.position + 4 > this.stream.length) {
            fail(DAMAGED);
        }
        const type = this.view.getUint16(this.position, true);
        const size = this.view.getUint16(this.position + 2, true);
        const end = this.position + 4 + size;
        if (end > this.stream.length) {
            fail(DAMAGED);
        }
        const data = this.stream.subarray(this.position + 4, end);
        this.position = end;
        return { type, data };
    }

    /** The body of a record plus the bodies of the CONTINUE records that follow it. */
    chunks(data) {
        const chunks = [data];
        while (this.peek() === CONTINUE) {
            chunks.push(this.next().data);
        }
        return chunks;
    }
}

/**
 * Reads one logical byte sequence stored in a record and its CONTINUE records. A character array
 * that crosses into a CONTINUE record restarts with a one-byte flags field; nothing else does.
 */
class ChunkReader {
    constructor(chunks) {
        this.chunks = chunks;
        this.index = 0;
        this.position = 0;
    }

    ready() {
        while (this.position >= this.chunks[this.index].length) {
            this.index += 1;
            this.position = 0;
            if (this.index >= this.chunks.length) {
                fail(DAMAGED);
            }
        }
        return this.chunks[this.index];
    }

    byte() {
        const chunk = this.ready();
        this.position += 1;
        return chunk[this.position - 1];
    }

    u16() {
        return this.byte() | (this.byte() << 8);
    }

    u32() {
        return (this.u16() | (this.u16() << 16)) >>> 0;
    }

    skip(count) {
        let left = count;
        while (left > 0) {
            const chunk = this.ready();
            const taken = Math.min(left, chunk.length - this.position);
            this.position += taken;
            left -= taken;
        }
    }

    text(count, wide) {
        let isWide = wide;
        let out = '';
        let left = count;
        while (left > 0) {
            if (this.position >= this.chunks[this.index].length) {
                this.ready();
                isWide = (this.byte() & 1) === 1;
                continue;
            }
            const chunk = this.chunks[this.index];
            const width = isWide ? 2 : 1;
            const taken = Math.min(left, Math.floor((chunk.length - this.position) / width));
            if (taken === 0) {
                fail(DAMAGED);
            }
            const codes = [];
            for (let k = 0; k < taken; k += 1) {
                codes.push(isWide ? chunk[this.position] | (chunk[this.position + 1] << 8) : chunk[this.position]);
                this.position += width;
            }
            out += String.fromCharCode(...codes);
            left -= taken;
        }
        return out;
    }

    /** An XLUnicodeString: character count, flags, characters. */
    string() {
        const count = this.u16();
        return this.text(count, (this.byte() & 1) === 1);
    }
}

function readSharedStrings(chunks) {
    const reader = new ChunkReader(chunks);
    reader.skip(4);
    const unique = reader.u32();
    const strings = [];
    for (let k = 0; k < unique; k += 1) {
        const count = reader.u16();
        const flags = reader.byte();
        const runs = flags & 0x08 ? reader.u16() : 0;
        const extra = flags & 0x04 ? reader.u32() : 0;
        strings.push(reader.text(count, (flags & 0x01) === 1));
        reader.skip(runs * 4 + extra);
    }
    return strings;
}

function readBof(records) {
    const { type, data } = records.next();
    if (type !== BOF || data.length < 4) {
        fail(DAMAGED);
    }
    if (viewOf(data).getUint16(0, true) !== 0x0600) {
        fail(TOO_OLD);
    }
}

function readGlobals(stream) {
    const records = new Records(stream);
    readBof(records);
    const globals = { date1904: false, formats: new Map(), xfFormats: [], sheets: [], strings: [] };
    for (;;) {
        const { type, data } = records.next();
        switch (type) {
            case EOF:
                return globals;
            case FILEPASS:
                throw new XlsError(PROTECTED);
            case DATEMODE:
                globals.date1904 = viewOf(data).getUint16(0, true) === 1;
                break;
            case FORMAT: {
                const reader = new ChunkReader([data]);
                const id = reader.u16();
                globals.formats.set(id, reader.string());
                break;
            }
            case XF:
                globals.xfFormats.push(viewOf(data).getUint16(2, true));
                break;
            case BOUNDSHEET: {
                const view = viewOf(data);
                globals.sheets.push({ offset: view.getUint32(0, true), state: data[4] & 3, type: data[5] });
                break;
            }
            case SST:
                globals.strings = readSharedStrings(records.chunks(data));
                break;
            default:
        }
    }
}

/** The set of XF indexes whose number format is a date. A FORMAT record wins over a built-in id. */
function dateXfs(globals) {
    const result = new Set();
    globals.xfFormats.forEach((id, index) => {
        const code = globals.formats.get(id);
        if (code === undefined ? BUILT_IN_DATE_FORMATS.has(id) : isDateFormatCode(code)) {
            result.add(index);
        }
    });
    return result;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

const ERROR_TEXT = new Map([
    [0x00, '#NULL!'], [0x07, '#DIV/0!'], [0x0f, '#VALUE!'], [0x17, '#REF!'],
    [0x1d, '#NAME?'], [0x24, '#NUM!'], [0x2a, '#N/A'],
]);

/** Excel's RK number: a 30-bit integer or the top 30 bits of a double, optionally divided by 100. */
function decodeRk(raw) {
    let value;
    if (raw & 2) {
        value = (raw | 0) >> 2;
    } else {
        const view = new DataView(new ArrayBuffer(8));
        view.setUint32(4, (raw & 0xfffffffc) >>> 0, true);
        value = view.getFloat64(0, true);
    }
    return raw & 1 ? value / 100 : value;
}

function looksLikeTransactions(rows) {
    return rows.length >= 3 && rows.some((row) => row.some((cell) => DATE_CELL.test(cell.trim())));
}

function readSheetRows(stream, offset, globals, dateStyles) {
    const records = new Records(stream, offset);
    readBof(records);

    const cells = new Map();
    const put = (row, col, text) => {
        if (col >= MAX_COLUMNS) {
            fail(DAMAGED);
        }
        if (!cells.has(row)) {
            cells.set(row, new Map());
        }
        cells.get(row).set(col, text);
    };
    const numberText = (value, xf) => {
        if (!Number.isFinite(value)) {
            return '';
        }
        if (dateStyles.has(xf) && value >= 0 && value < 2958466) {
            return excelSerialToDate(value, globals.date1904);
        }
        return plainNumber(String(value));
    };

    let depth = 1;
    let waitingForString = null;
    while (depth > 0) {
        const { type, data } = records.next();
        if (type === BOF) {
            depth += 1;
        } else if (type === EOF) {
            depth -= 1;
        }
        if (depth !== 1 || type === BOF) {
            continue;
        }

        if (type === STRING && waitingForString) {
            const reader = new ChunkReader(records.chunks(data));
            put(waitingForString.row, waitingForString.col, reader.string());
        }
        if (type !== SHRFMLA && type !== ARRAY && type !== TABLEOP) {
            waitingForString = null;
        }

        const view = viewOf(data);
        switch (type) {
            case LABELSST:
                put(view.getUint16(0, true), view.getUint16(2, true), globals.strings[view.getUint32(6, true)] ?? '');
                break;
            case LABEL: {
                const reader = new ChunkReader(records.chunks(data));
                reader.skip(6);
                put(view.getUint16(0, true), view.getUint16(2, true), reader.string());
                break;
            }
            case RK:
                put(view.getUint16(0, true), view.getUint16(2, true),
                    numberText(decodeRk(view.getUint32(6, true)), view.getUint16(4, true)));
                break;
            case MULRK: {
                const row = view.getUint16(0, true);
                const first = view.getUint16(2, true);
                for (let k = 0; 4 + (k + 1) * 6 + 2 <= data.length; k += 1) {
                    put(row, first + k,
                        numberText(decodeRk(view.getUint32(6 + k * 6, true)), view.getUint16(4 + k * 6, true)));
                }
                break;
            }
            case NUMBER:
                put(view.getUint16(0, true), view.getUint16(2, true),
                    numberText(view.getFloat64(6, true), view.getUint16(4, true)));
                break;
            case BOOLERR: {
                const value = data[6];
                put(view.getUint16(0, true), view.getUint16(2, true),
                    data[7] ? (ERROR_TEXT.get(value) ?? '#ERROR') : (value ? 'TRUE' : 'FALSE'));
                break;
            }
            case FORMULA: {
                const row = view.getUint16(0, true);
                const col = view.getUint16(2, true);
                const kind = data[6];
                if (view.getUint16(12, true) !== 0xffff) {
                    put(row, col, numberText(view.getFloat64(6, true), view.getUint16(4, true)));
                } else if (kind === 0) {
                    put(row, col, '');
                    waitingForString = { row, col };
                } else if (kind === 1) {
                    put(row, col, data[8] ? 'TRUE' : 'FALSE');
                } else if (kind === 2) {
                    put(row, col, ERROR_TEXT.get(data[8]) ?? '#ERROR');
                } else {
                    put(row, col, '');
                }
                break;
            }
            default:
        }
    }

    const rows = [];
    let slots = 0;
    for (const index of [...cells.keys()].sort((a, b) => a - b)) {
        const row = cells.get(index);
        let width = 0;
        for (const [col, text] of row) {
            if (text !== '' && col >= width) {
                width = col + 1;
            }
        }
        if (width === 0) {
            continue;
        }
        slots += width;
        if (slots > MAX_CELL_SLOTS) {
            fail(TOO_LARGE);
        }
        const values = new Array(width).fill('');
        for (const [col, text] of row) {
            if (col < width) {
                values[col] = text;
            }
        }
        rows.push(values);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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
 * Reads one worksheet of an .xls file into rows of strings: the first visible worksheet (of the
 * first 10) with at least 3 rows and a date-like cell, else the first visible one, else the first.
 * @param {Uint8Array} input
 * @returns {Promise<{ ok: true, rows: string[][] } | { ok: false, reason: string }>}
 */
export async function readXls(input) {
    const bytes = toBytes(input);
    if (!bytes || !hasOleSignature(bytes)) {
        return { ok: false, reason: NOT_EXCEL };
    }
    try {
        const file = openCompoundFile(bytes);
        if (file.find('EncryptedPackage')) {
            return { ok: false, reason: PROTECTED };
        }
        const entry = file.find('Workbook') ?? file.find('Book');
        if (!entry) {
            return { ok: false, reason: NOT_EXCEL };
        }
        const stream = file.read(entry);
        const globals = readGlobals(stream);
        const dateStyles = dateXfs(globals);

        const worksheets = globals.sheets.filter((sheet) => sheet.type === 0);
        if (worksheets.length === 0) {
            return { ok: false, reason: NOT_EXCEL };
        }
        const visible = worksheets.filter((sheet) => sheet.state === 0);
        const candidates = visible.length > 0 ? visible.slice(0, MAX_SHEETS) : worksheets.slice(0, 1);
        let fallback = null;
        for (const sheet of candidates) {
            const rows = readSheetRows(stream, sheet.offset, globals, dateStyles);
            if (looksLikeTransactions(rows)) {
                return { ok: true, rows };
            }
            fallback ??= rows;
        }
        return { ok: true, rows: fallback };
    } catch (error) {
        return { ok: false, reason: error instanceof XlsError ? error.reason : DAMAGED };
    }
}
