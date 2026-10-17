import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXls } from '../src/import/xls.js';
import { readStatementFile } from '../src/views/import.js';

const NOT_EXCEL = 'This file is not an Excel workbook.';
const DAMAGED = 'The Excel file is damaged and could not be read.';
const PROTECTED = 'This workbook is password protected. Remove the password and try again.';
const TOO_LARGE = 'This Excel file is too large to read.';
const TOO_OLD = 'This Excel file is too old to read. Open it in Excel and save it as .xlsx.';

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

const u8 = (...values) => Uint8Array.from(values);
const u16 = (value) => u8(value & 255, (value >> 8) & 255);
const u32 = (value) => u8(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
const f64 = (value) => new Uint8Array(new Float64Array([value]).buffer);
const latin1 = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 255);
const utf16 = (text) => concat(...Array.from(text, (char) => u16(char.charCodeAt(0))));

function concat(...parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function padTo(bytes, size) {
    assert.ok(bytes.length <= size, `stream is ${bytes.length} bytes, more than ${size}`);
    const out = new Uint8Array(size);
    out.set(bytes);
    return out;
}

// ---------------------------------------------------------------------------
// BIFF8 record builders
// ---------------------------------------------------------------------------

const rec = (type, ...body) => {
    const data = concat(...body);
    return concat(u16(type), u16(data.length), data);
};

const bof = (substream = 0x0010, version = 0x0600) =>
    rec(0x0809, u16(version), u16(substream), u16(0x0dbb), u16(0x07cc), u32(0), u32(6));
const eof = () => rec(0x000a);

/** XLUnicodeString: character count, flags, characters. */
const xlStr = (text, wide = /[^\u0000-ÿ]/.test(text)) =>
    concat(u16(text.length), u8(wide ? 1 : 0), wide ? utf16(text) : latin1(text));

/** An SST record; chunks[0] follows the two counts, the rest go into CONTINUE records. */
const sst = (total, unique, chunks) =>
    concat(rec(0x00fc, u32(total), u32(unique), chunks[0]), ...chunks.slice(1).map((chunk) => rec(0x003c, chunk)));

const sstFor = (strings) => sst(strings.length, strings.length, [concat(...strings.map((text) => xlStr(text)))]);

const labelSst = (row, col, index, xf = 0) => rec(0x00fd, u16(row), u16(col), u16(xf), u32(index));
const label = (row, col, text, xf = 0) => rec(0x0204, u16(row), u16(col), u16(xf), xlStr(text));
const rk = (row, col, raw, xf = 0) => rec(0x027e, u16(row), u16(col), u16(xf), u32(raw));
const number = (row, col, value, xf = 0) => rec(0x0203, u16(row), u16(col), u16(xf), f64(value));
const blank = (row, col) => rec(0x0201, u16(row), u16(col), u16(0));
const mulblank = (row, col, count) => rec(0x00be, u16(row), u16(col), u16(0), u16(col + count - 1));
const boolErr = (row, col, value, isError = false, xf = 0) =>
    rec(0x0205, u16(row), u16(col), u16(xf), u8(value, isError ? 1 : 0));
const mulrk = (row, col, raws) =>
    rec(0x00bd, u16(row), u16(col), ...raws.map((raw) => concat(u16(0), u32(raw))), u16(col + raws.length - 1));

const rkInt = (value, div100 = false) => ((value << 2) | 2 | (div100 ? 1 : 0)) >>> 0;
const rkFloat = (value, div100 = false) => {
    const high = new DataView(f64(value).buffer).getUint32(4, true);
    return (((high & 0xfffffffc) | (div100 ? 1 : 0)) >>> 0);
};

const resultString = u8(0, 0, 0, 0, 0, 0, 0xff, 0xff);
const resultEmpty = u8(3, 0, 0, 0, 0, 0, 0xff, 0xff);
const resultBool = (value) => u8(1, 0, value ? 1 : 0, 0, 0, 0, 0xff, 0xff);
const resultError = (code) => u8(2, 0, code, 0, 0, 0, 0xff, 0xff);
const formula = (row, col, result, xf = 0) =>
    rec(0x0006, u16(row), u16(col), u16(xf), result, u16(0), u32(0), u16(1), u8(0x17));
const stringRec = (text) => rec(0x0207, xlStr(text));
const shrfmla = () => rec(0x04bc, new Uint8Array(12));
const arrayRec = () => rec(0x0221, new Uint8Array(14));

const xfRec = (formatId) => rec(0x00e0, u16(0), u16(formatId), new Uint8Array(16));
const formatRec = (id, code) => rec(0x041e, u16(id), xlStr(code));
const datemode = (value) => rec(0x0022, u16(value));
const boundsheet = (offset, name, { state = 0, type = 0 } = {}) =>
    rec(0x0085, u32(offset), u8(state, type), u8(name.length, 0), latin1(name));

/**
 * A Workbook stream. sheets: [{ name?, state?, type?, body }]; BOUNDSHEET offsets are computed.
 * `pre` records come before the BOUNDSHEETs, `post` records after them (the SST goes there).
 */
function workbookStream({ pre = [], post = [], sheets }) {
    const bodies = sheets.map((sheet) =>
        concat(bof(sheet.type === 2 ? 0x0020 : 0x0010), sheet.body ?? new Uint8Array(0), eof()));
    const make = (offsets) => concat(
        bof(0x0005),
        ...pre,
        ...sheets.map((sheet, index) => boundsheet(offsets[index], sheet.name ?? `S${index + 1}`, sheet)),
        ...post,
        eof(),
    );
    let next = make(sheets.map(() => 0)).length;
    const offsets = bodies.map((body) => {
        const offset = next;
        next += body.length;
        return offset;
    });
    return concat(make(offsets), ...bodies);
}

/** One sheet whose strings come from `strings` (LABELSST indexes). */
function book(cells, strings = ['k'], { pre = [], post = [] } = {}) {
    return workbookStream({ pre, post: [sstFor(strings), ...post], sheets: [{ body: concat(...cells) }] });
}

// ---------------------------------------------------------------------------
// Compound file (OLE) writer
// ---------------------------------------------------------------------------

const END = 0xfffffffe;
const FREE = 0xffffffff;

/**
 * streams: [{ name, data }]. Streams under 4096 bytes go into the mini stream.
 * Options: shift (9 or 12) and shuffle (physical sector order reversed).
 */
function buildCfb(streams, { shift = 9, shuffle = false } = {}) {
    const sectorSize = 1 << shift;
    const perSector = sectorSize / 4;
    const small = streams.filter((stream) => stream.data.length < 4096);
    const large = streams.filter((stream) => stream.data.length >= 4096);

    const miniFat = [];
    const miniChunks = [];
    const miniStart = new Map();
    for (const stream of small) {
        const count = Math.ceil(stream.data.length / 64);
        miniStart.set(stream, count ? miniFat.length : END);
        for (let k = 0; k < count; k += 1) {
            miniFat.push(k < count - 1 ? miniFat.length + 1 : END);
        }
        miniChunks.push(padTo(stream.data, count * 64));
    }
    const miniBytes = concat(...miniChunks);

    const containerCount = Math.ceil(miniBytes.length / sectorSize);
    const largeCounts = large.map((stream) => Math.ceil(stream.data.length / sectorSize));
    const miniFatCount = Math.ceil((miniFat.length * 4) / sectorSize);
    const dirCount = Math.ceil((streams.length + 1) / (sectorSize / 128));
    const plain = containerCount + largeCounts.reduce((a, b) => a + b, 0) + miniFatCount + dirCount;

    let fatCount = 1;
    let difatCount = 0;
    for (;;) {
        difatCount = fatCount > 109 ? Math.ceil((fatCount - 109) / (perSector - 1)) : 0;
        const needed = Math.ceil((plain + fatCount + difatCount) / perSector);
        if (needed === fatCount) {
            break;
        }
        fatCount = needed;
    }

    const total = plain + fatCount + difatCount;
    const place = shuffle ? (id) => total - 1 - id : (id) => id;
    const sectors = new Array(total);
    const fat = new Array(fatCount * perSector).fill(FREE);
    let cursor = 0;

    const allocate = (count, data) => {
        const first = cursor;
        for (let k = 0; k < count; k += 1) {
            fat[cursor + k] = k < count - 1 ? cursor + k + 1 : END;
            sectors[cursor + k] = padTo(data.subarray(k * sectorSize, (k + 1) * sectorSize), sectorSize);
        }
        cursor += count;
        return count ? first : END;
    };

    const containerStart = allocate(containerCount, miniBytes);
    const largeStart = new Map();
    large.forEach((stream, index) => {
        largeStart.set(stream, allocate(largeCounts[index], stream.data));
    });
    const miniFatBytes = new Uint8Array(miniFatCount * sectorSize).fill(0xff);
    miniFat.forEach((value, index) => miniFatBytes.set(u32(value), index * 4));
    const miniFatStart = allocate(miniFatCount, miniFatBytes);

    // Directory: root entry first, then the streams as a right-leaning chain.
    const directory = new Uint8Array(dirCount * sectorSize);
    const dirView = new DataView(directory.buffer);
    const writeEntry = (index, name, type, start, size, right, child) => {
        const base = index * 128;
        for (let k = 0; k < name.length; k += 1) {
            dirView.setUint16(base + k * 2, name.charCodeAt(k), true);
        }
        dirView.setUint16(base + 64, name ? (name.length + 1) * 2 : 0, true);
        directory[base + 66] = type;
        directory[base + 67] = 1;
        dirView.setUint32(base + 68, FREE, true);
        dirView.setUint32(base + 72, right, true);
        dirView.setUint32(base + 76, child, true);
        dirView.setUint32(base + 116, start, true);
        dirView.setUint32(base + 120, size, true);
    };
    for (let index = 0; index < dirCount * (sectorSize / 128); index += 1) {
        writeEntry(index, '', 0, 0, 0, FREE, FREE);
    }
    writeEntry(0, 'Root Entry', 5, containerStart === END ? END : place(containerStart), miniBytes.length, FREE,
        streams.length ? 1 : FREE);
    streams.forEach((stream, index) => {
        const isSmall = small.includes(stream);
        const start = isSmall ? miniStart.get(stream) : place(largeStart.get(stream));
        writeEntry(index + 1, stream.name, 2, start, stream.data.length, index + 1 < streams.length ? index + 2 : FREE, FREE);
    });
    const dirStart = allocate(dirCount, directory);

    const fatStart = cursor;
    for (let k = 0; k < fatCount; k += 1) {
        fat[cursor] = 0xfffffffd;
        cursor += 1;
    }
    const difatStart = cursor;
    for (let k = 0; k < difatCount; k += 1) {
        fat[cursor] = 0xfffffffc;
        cursor += 1;
    }

    const mapId = (value) => (value >= 0xfffffffc ? value : place(value));
    const physicalFat = new Array(fat.length).fill(FREE);
    for (let id = 0; id < total; id += 1) {
        physicalFat[place(id)] = mapId(fat[id]);
    }
    for (let k = 0; k < fatCount; k += 1) {
        sectors[fatStart + k] = concat(...physicalFat.slice(k * perSector, (k + 1) * perSector).map(u32));
    }
    const fatIds = Array.from({ length: fatCount }, (_, k) => place(fatStart + k));
    for (let j = 0; j < difatCount; j += 1) {
        const ids = fatIds.slice(109 + j * (perSector - 1), 109 + (j + 1) * (perSector - 1));
        while (ids.length < perSector - 1) {
            ids.push(FREE);
        }
        ids.push(j < difatCount - 1 ? place(difatStart + j + 1) : END);
        sectors[difatStart + j] = concat(...ids.map(u32));
    }

    const out = new Uint8Array(sectorSize * (total + 1));
    const header = new DataView(out.buffer);
    out.set(u8(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 0);
    header.setUint16(24, 0x3e, true);
    header.setUint16(26, shift === 9 ? 3 : 4, true);
    header.setUint16(28, 0xfffe, true);
    header.setUint16(30, shift, true);
    header.setUint16(32, 6, true);
    header.setUint32(40, shift === 9 ? 0 : dirCount, true);
    header.setUint32(44, fatCount, true);
    header.setUint32(48, place(dirStart), true);
    header.setUint32(56, 4096, true);
    header.setUint32(60, miniFatCount ? place(miniFatStart) : END, true);
    header.setUint32(64, miniFatCount, true);
    header.setUint32(68, difatCount ? place(difatStart) : END, true);
    header.setUint32(72, difatCount, true);
    for (let k = 0; k < 109; k += 1) {
        header.setUint32(76 + k * 4, k < fatCount ? fatIds[k] : FREE, true);
    }
    sectors.forEach((sector, id) => out.set(sector, sectorSize * (1 + place(id))));

    return {
        bytes: out,
        sectorSize,
        small: small.map((stream) => stream.name),
        dirSector: place(dirStart),
        startOf: (name) => {
            const stream = streams.find((item) => item.name === name);
            return small.includes(stream) ? miniStart.get(stream) : place(largeStart.get(stream));
        },
        fatEntryOffset: (id) => sectorSize * (1 + fatIds[Math.floor(id / perSector)]) + (id % perSector) * 4,
        miniFatEntryOffset: (id) => sectorSize * (1 + place(miniFatStart)) + id * 4,
    };
}

const cfb = (data, options, name = 'Workbook') => buildCfb([{ name, data }], options);

async function rowsOf(stream, options) {
    const result = await readXls(cfb(stream, options).bytes);
    assert.equal(result.ok, true, result.reason);
    return result.rows;
}

async function reasonOf(input) {
    const result = await readXls(input);
    assert.equal(result.ok, false, 'expected a refusal');
    return result.reason;
}

const poke32 = (bytes, offset, value) => new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset, value, true);

// ---------------------------------------------------------------------------
// Fixture: citadele-like.xls (made-up data, built with LibreOffice from a CSV)
// ---------------------------------------------------------------------------

const fixtureBytes = readFileSync(new URL('./fixtures/xls/citadele-like.xls', import.meta.url));

test('fixture: reads the sheet with no empty rows and no trailing empty cells', async () => {
    const result = await readXls(fixtureBytes);
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 79);
    for (const row of result.rows) {
        assert.ok(row.length > 0);
        assert.notEqual(row[row.length - 1], '');
        assert.ok(row.every((cell) => typeof cell === 'string'));
    }
});

test('fixture: preamble, period, opening balance and header rows', async () => {
    const { rows } = await readXls(fixtureBytes);
    assert.deepEqual(rows[0], ['Konts', 'XXXXXXX']);
    // LibreOffice stored the period cells as text (the CSV import does not detect dates here).
    assert.deepEqual(rows[1], ['No', '01.10.2026', 'līdz', '17.10.2026']);
    assert.deepEqual(rows[2], ['', '', '', '', 'Sākuma atlikums:', '75.31']);
    assert.deepEqual(rows[3], ['Datums', 'Veids', 'Darījuma detaļas', 'Maks. Nr.', 'Trans. Nr.', 'Debets/Kredīts']);
});

test('fixture: keeps line breaks in details, text dates and amounts', async () => {
    const { rows } = await readXls(fixtureBytes);
    assert.deepEqual(rows[4], [
        '01.10.2026',
        'PIRKUMS',
        '28/09/2026 400000******0000 MCC-5814 REF: 100001\nKAFEJNICA PARAUGS RIGA LV 10000001',
        '',
        'ET00000000000A',
        '-8.8',
    ]);
    assert.ok(rows[4][2].includes('\n'));
    assert.equal(rows[5][1], 'IENĀKOŠAIS EKS MAKSĀJUMS');
    assert.equal(
        rows[5][2],
        'Darba algas izmaksa\nPARAUGS SIA 40000000000 HABALV22 LV00HABA0000000000001\nMaksātāja reference: NOTPROVIDED',
    );
    assert.equal(rows[5][3], '2026100501');
    assert.equal(rows[5][5], '1140.41');
    assert.equal(rows[0][0], 'Konts');
    assert.equal(rows[4][0], '01.10.2026', 'a text date stays text');
    assert.equal(rows[73][5], '0');
});

test('fixture: Latvian letters are intact', async () => {
    const { rows } = await readXls(fixtureBytes);
    assert.equal(rows[73][2], 'Pārskaitījums uz uzkrājumu kontu: ēdināšana, ļoti, žetons');
    const everything = rows.flat().join('\n');
    for (const letter of ['ā', 'ē', 'ī', 'ļ', 'š', 'ž']) {
        assert.ok(everything.includes(letter), letter);
    }
});

test('fixture: footer labels are in column 4 and the numbers in column 5', async () => {
    const { rows } = await readXls(fixtureBytes);
    const footer = rows.slice(74);
    assert.equal(footer.length, 5);
    assert.deepEqual(footer.map((row) => row[4]), [
        'Beigu atlikums:',
        'Debeta apgrozījums:',
        'Kredīta apgrozījums:',
        'Komisiju summa',
        'Kopējā izejošo maksājumu summa bez komisijām',
    ]);
    assert.deepEqual(footer.map((row) => row[5]), ['1000.5', '-215.81', '1140.41', '-0.5', '-215.31']);
    assert.ok(footer.every((row) => row.length === 6));
});

test('readStatementFile reads the fixture as an xls table', async () => {
    const expected = await readXls(fixtureBytes);
    const result = await readStatementFile(new File([fixtureBytes], 'citadele-like.xls'));
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'table');
    assert.equal(result.format, 'xls');
    assert.equal(result.delimiter, '');
    assert.equal(result.encoding, '');
    assert.deepEqual(result.rows, expected.rows);
});

// ---------------------------------------------------------------------------
// Shared strings and CONTINUE records
// ---------------------------------------------------------------------------

const oneRow = (count) => Array.from({ length: count }, (_, index) => labelSst(0, index, index));

test('SST: compressed text continues as UTF-16 across a CONTINUE record', async () => {
    const chunk1 = concat(xlStr('ab'), u16(5), u8(0), latin1('xy'));
    const chunk2 = concat(u8(1), utf16('ĀēŠ'));
    const stream = workbookStream({ post: [sst(2, 2, [chunk1, chunk2])], sheets: [{ body: concat(...oneRow(2)) }] });
    assert.deepEqual(await rowsOf(stream), [['ab', 'xyĀēŠ']]);
});

test('SST: UTF-16 text continues as compressed across a CONTINUE record', async () => {
    const chunk1 = concat(u16(4), u8(1), utf16('Āē'));
    const chunk2 = concat(u8(0), latin1('xy'), xlStr('zz'));
    const stream = workbookStream({ post: [sst(2, 2, [chunk1, chunk2])], sheets: [{ body: concat(...oneRow(2)) }] });
    assert.deepEqual(await rowsOf(stream), [['Āēxy', 'zz']]);
});

test('SST: a boundary exactly between two strings has no flags byte', async () => {
    const stream = workbookStream({
        post: [sst(3, 3, [xlStr('ab'), xlStr('cd'), xlStr('Āž')])],
        sheets: [{ body: concat(...oneRow(3)) }],
    });
    assert.deepEqual(await rowsOf(stream), [['ab', 'cd', 'Āž']]);
});

test('SST: rich-text runs and extended data are skipped across record boundaries', async () => {
    const runs = u8(1, 2, 3, 4, 5, 6, 7, 8);
    const ext = u8(9, 8, 7, 6, 5);
    const chunk1 = concat(u16(4), u8(0x08), u16(2), latin1('abcd'), runs.subarray(0, 4));
    const chunk2 = concat(runs.subarray(4), u16(3), u8(0x04), u32(5), latin1('xyz'), ext.subarray(0, 2));
    const chunk3 = concat(ext.subarray(2), u16(3), u8(0x0d), u16(1), u32(3), utf16('Ā'));
    const chunk4 = concat(u8(1), utf16('ēŠ'), runs.subarray(0, 4), ext.subarray(0, 3), xlStr('end'));
    const stream = workbookStream({
        post: [sst(4, 4, [chunk1, chunk2, chunk3, chunk4])],
        sheets: [{ body: concat(...oneRow(4)) }],
    });
    assert.deepEqual(await rowsOf(stream), [['abcd', 'xyz', 'ĀēŠ', 'end']]);
});

test('SST: a boundary inside the characters of a rich-text string', async () => {
    const chunk1 = concat(u16(4), u8(0x08), u16(1), latin1('ab'));
    const chunk2 = concat(u8(0), latin1('cd'), u8(1, 2, 3, 4), xlStr('next'));
    const stream = workbookStream({ post: [sst(2, 2, [chunk1, chunk2])], sheets: [{ body: concat(...oneRow(2)) }] });
    assert.deepEqual(await rowsOf(stream), [['abcd', 'next']]);
});

test('SST: bytes 0x80 and 0xE9 of a compressed string are U+0080 and e-acute', async () => {
    const strings = concat(u16(2), u8(0), u8(0x80, 0xe9));
    const stream = workbookStream({ post: [sst(1, 1, [strings])], sheets: [{ body: concat(...oneRow(1)) }] });
    assert.deepEqual(await rowsOf(stream), [['\u0080é']]);
});

test('LABELSST with an index past the table gives an empty cell', async () => {
    const rows = await rowsOf(book([labelSst(0, 0, 0), labelSst(0, 1, 99), labelSst(0, 2, 0)]));
    assert.deepEqual(rows, [['k', '', 'k']]);
});

// ---------------------------------------------------------------------------
// Cell records
// ---------------------------------------------------------------------------

test('RK cells: integers, integer/100, floats and float/100', async () => {
    const rows = await rowsOf(book([
        rk(0, 0, rkInt(5)),
        rk(0, 1, rkInt(-3)),
        rk(0, 2, rkInt(12345, true)),
        rk(0, 3, rkFloat(1.5)),
        rk(0, 4, rkFloat(-880, true)),
        number(1, 0, 0.1 + 0.2),
        number(1, 1, 1140.41),
        number(1, 2, 0),
    ]));
    assert.deepEqual(rows, [['5', '-3', '123.45', '1.5', '-8.8'], ['0.3', '1140.41', '0']]);
});

test('MULRK starting at a non-zero column', async () => {
    const rows = await rowsOf(book([labelSst(0, 0, 0), mulrk(0, 2, [rkInt(1), rkInt(2), rkInt(3)])]));
    assert.deepEqual(rows, [['k', '', '1', '2', '3']]);
});

test('FORMULA results: number, string, boolean, error and empty string', async () => {
    const rows = await rowsOf(book([
        labelSst(0, 0, 0), formula(0, 1, f64(42.5)),
        labelSst(1, 0, 0), formula(1, 1, resultString), stringRec('hello'),
        labelSst(2, 0, 0), formula(2, 1, resultString), shrfmla(), arrayRec(), stringRec('Pasaule Ā'),
        labelSst(3, 0, 0), formula(3, 1, resultBool(true)),
        labelSst(4, 0, 0), formula(4, 1, resultError(0x2a)),
        labelSst(5, 0, 0), formula(5, 1, resultEmpty),
        labelSst(6, 0, 0), formula(6, 1, resultString), stringRec(''),
    ]));
    assert.deepEqual(rows, [
        ['k', '42.5'], ['k', 'hello'], ['k', 'Pasaule Ā'], ['k', 'TRUE'], ['k', '#N/A'], ['k'], ['k'],
    ]);
});

test('BOOLERR, LABEL and blank cells', async () => {
    const rows = await rowsOf(book([
        boolErr(0, 0, 1), boolErr(0, 1, 0), boolErr(0, 2, 0x2a, true), boolErr(0, 3, 0x07, true),
        label(1, 0, 'plain label'), label(1, 1, 'café'),
        labelSst(2, 0, 0), blank(2, 1), labelSst(2, 2, 0), mulblank(2, 3, 4),
    ]));
    assert.deepEqual(rows, [['TRUE', 'FALSE', '#N/A', '#DIV/0!'], ['plain label', 'café'], ['k', '', 'k']]);
});

test('a cell record in column 16384 or beyond is damaged, column 16383 is fine', async () => {
    assert.equal(await reasonOf(cfb(book([labelSst(0, 16384, 0)])).bytes), DAMAGED);
    assert.equal(await reasonOf(cfb(book([mulrk(0, 16383, [rkInt(1), rkInt(2)])])).bytes), DAMAGED);
    const rows = await rowsOf(book([labelSst(0, 16383, 0)]));
    assert.equal(rows[0].length, 16384);
    assert.equal(rows[0][16383], 'k');
});

test('too many cell slots is refused as too large', async () => {
    const cells = Array.from({ length: 300 }, (_, row) => labelSst(row, 16383, 0));
    assert.equal(await reasonOf(cfb(book(cells)).bytes), TOO_LARGE);
});

test('whitespace inside cell text is kept, empty rows and trailing cells are dropped', async () => {
    const rows = await rowsOf(book(
        [labelSst(0, 0, 0), labelSst(0, 1, 1), labelSst(0, 2, 2), labelSst(1, 0, 2), labelSst(3, 0, 1)],
        ['k', '  two  spaces\r\nand\ttab ', ''],
    ));
    assert.deepEqual(rows, [['k', '  two  spaces\r\nand\ttab '], ['  two  spaces\r\nand\ttab ']]);
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const fillers = [xfRec(0), xfRec(0), xfRec(0)];

test('a custom date format turns a serial into YYYY-MM-DD', async () => {
    const pre = [formatRec(164, 'dd\\.mm\\.yyyy'), ...fillers, xfRec(164)];
    assert.deepEqual(await rowsOf(book([number(0, 0, 46296, 3)], ['k'], { pre })), [['2026-10-01']]);
});

test('built-in date format 14 is a date, built-in format 2 stays a number', async () => {
    const pre = [...fillers, xfRec(14), xfRec(2)];
    const rows = await rowsOf(book([number(0, 0, 46296, 3), number(0, 1, 46296, 4), rk(0, 2, rkInt(46296), 3)], ['k'], { pre }));
    assert.deepEqual(rows, [['2026-10-01', '46296', '2026-10-01']]);
});

test('a FORMAT record that redefines id 14 as 0.00 is not a date', async () => {
    const pre = [formatRec(14, '0.00'), xfRec(14)];
    assert.deepEqual(await rowsOf(book([number(0, 0, 46296, 0)], ['k'], { pre })), [['46296']]);
});

test('a time-only format is not a date', async () => {
    const pre = [formatRec(170, 'hh:mm'), xfRec(170)];
    assert.deepEqual(await rowsOf(book([number(0, 0, 0.5, 0)], ['k'], { pre })), [['0.5']]);
});

test('the 1904 date system', async () => {
    const pre = [datemode(1), xfRec(14)];
    assert.deepEqual(await rowsOf(book([number(0, 0, 46296, 0)], ['k'], { pre })), [['2030-10-02']]);
});

test('a formula with a date format gives a date', async () => {
    const pre = [xfRec(14)];
    assert.deepEqual(await rowsOf(book([formula(0, 0, f64(46296), 0)], ['k'], { pre })), [['2026-10-01']]);
});

// ---------------------------------------------------------------------------
// Compound file layouts
// ---------------------------------------------------------------------------

const longText = 'abcdefghij'.repeat(300);
const sampleCells = [labelSst(0, 0, 0), labelSst(0, 1, 1), rk(1, 0, rkInt(7))];
const sampleBook = () => book(sampleCells, ['first', longText]);
const sampleRows = [['first', longText], ['7']];

test('a workbook under 4096 bytes is read from the mini stream', async () => {
    const stream = sampleBook();
    assert.ok(stream.length > 2000 && stream.length < 4096, `stream is ${stream.length} bytes`);
    const layout = cfb(stream);
    assert.deepEqual(layout.small, ['Workbook']);
    assert.deepEqual(await rowsOf(stream), sampleRows);
});

test('streams of 4095 and exactly 4096 bytes', async () => {
    const stream = sampleBook();
    const mini = cfb(padTo(stream, 4095));
    const regular = cfb(padTo(stream, 4096));
    assert.deepEqual(mini.small, ['Workbook']);
    assert.deepEqual(regular.small, []);
    assert.deepEqual((await readXls(mini.bytes)).rows, sampleRows);
    assert.deepEqual((await readXls(regular.bytes)).rows, sampleRows);
});

test('shuffled sectors, several FAT sectors and 4096-byte sectors', async () => {
    const stream = padTo(sampleBook(), 100000);
    for (const options of [{ shuffle: true }, { shift: 12 }, { shift: 12, shuffle: true }, {}]) {
        assert.deepEqual(await rowsOf(stream, options), sampleRows, JSON.stringify(options));
    }
    assert.deepEqual(await rowsOf(sampleBook(), { shuffle: true }), sampleRows);
});

test('more than 109 FAT sectors are found through the DIFAT chain', async () => {
    const stream = padTo(sampleBook(), 7_300_000);
    assert.deepEqual(await rowsOf(stream, { shuffle: true }), sampleRows);
});

test('the Workbook stream is found by any letter case, and Book is accepted', async () => {
    assert.deepEqual((await readXls(cfb(sampleBook(), {}, 'WORKBOOK').bytes)).rows, sampleRows);
    const extra = { name: '\u0005SummaryInformation', data: new Uint8Array(100) };
    const result = await readXls(buildCfb([extra, { name: 'workbook', data: sampleBook() }]).bytes);
    assert.deepEqual(result.rows, sampleRows);
});

test('input may be a Uint8Array, an ArrayBuffer or a Buffer view with an offset', async () => {
    const { bytes } = cfb(sampleBook());
    const buffer = Buffer.concat([Buffer.alloc(13, 0xaa), Buffer.from(bytes)]);
    const view = buffer.subarray(13);
    assert.equal(view.byteOffset % 8 === 0, false);
    assert.deepEqual((await readXls(bytes)).rows, sampleRows);
    assert.deepEqual((await readXls(bytes.buffer.slice(0))).rows, sampleRows);
    assert.deepEqual((await readXls(view)).rows, sampleRows);
    assert.deepEqual((await readXls(new DataView(view.buffer, view.byteOffset, view.byteLength))).rows, sampleRows);
});

// ---------------------------------------------------------------------------
// Sheet choice
// ---------------------------------------------------------------------------

const withDate = (marker) => concat(
    labelSst(0, 0, 2 + marker), labelSst(1, 0, 3), labelSst(2, 0, 1),
);
const STRINGS = ['x', '01.10.2026', 'one', 'two'];

function sheetBook(sheets) {
    return workbookStream({ post: [sstFor(STRINGS)], sheets });
}

test('the first visible sheet with at least 3 rows and a date wins', async () => {
    const rows = await rowsOf(sheetBook([
        { body: labelSst(0, 0, 0) },
        { body: withDate(0) },
        { body: withDate(1) },
    ]));
    assert.deepEqual(rows, [['one'], ['two'], ['01.10.2026']]);
});

test('a hidden first sheet is skipped', async () => {
    const rows = await rowsOf(sheetBook([
        { state: 1, body: withDate(0) },
        { state: 2, body: withDate(0) },
        { body: withDate(1) },
    ]));
    assert.deepEqual(rows, [['two'], ['two'], ['01.10.2026']]);
});

test('the first visible sheet is used when none looks like transactions', async () => {
    const rows = await rowsOf(sheetBook([
        { state: 1, body: withDate(0) },
        { body: labelSst(0, 0, 2) },
        { body: labelSst(0, 0, 3) },
    ]));
    assert.deepEqual(rows, [['one']]);
});

test('when all sheets are hidden, the first is read', async () => {
    const rows = await rowsOf(sheetBook([
        { state: 1, body: labelSst(0, 0, 2) },
        { state: 1, body: withDate(1) },
    ]));
    assert.deepEqual(rows, [['one']]);
});

test('a chart sheet is never read', async () => {
    const poison = labelSst(0, 20000, 0);
    const rows = await rowsOf(sheetBook([
        { type: 2, name: 'Chart', body: poison },
        { body: labelSst(0, 0, 2) },
    ]));
    assert.deepEqual(rows, [['one']]);
    assert.equal(await reasonOf(cfb(sheetBook([{ type: 2, name: 'Chart', body: poison }])).bytes), NOT_EXCEL);
    assert.equal(await reasonOf(cfb(sheetBook([{ type: 2, state: 1, body: poison }])).bytes), NOT_EXCEL);
});

test('only the first 10 sheets are considered', async () => {
    const sheets = Array.from({ length: 11 }, (_, index) => ({
        body: index === 10 ? withDate(1) : labelSst(0, 0, 2 + (index % 2)),
    }));
    assert.deepEqual(await rowsOf(sheetBook(sheets)), [['one']]);
});

test('a nested BOF/EOF inside a sheet does not end it', async () => {
    const body = concat(
        labelSst(0, 0, 2),
        bof(0x0020), labelSst(5, 0, 3), eof(),
        labelSst(1, 0, 3),
    );
    assert.deepEqual(await rowsOf(sheetBook([{ body }])), [['one'], ['two']]);
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test('a FILEPASS record means a password protected workbook', async () => {
    const filepass = rec(0x002f, u16(0), u16(1), u16(1), new Uint8Array(48));
    const stream = book(sampleCells, ['first', 'second'], { pre: [filepass] });
    assert.deepEqual(await readXls(cfb(stream).bytes), { ok: false, reason: PROTECTED });
});

test('an EncryptedPackage entry means a password protected workbook', async () => {
    const bytes = buildCfb([
        { name: 'EncryptionInfo', data: new Uint8Array(200) },
        { name: 'EncryptedPackage', data: new Uint8Array(5000) },
    ]).bytes;
    assert.deepEqual(await readXls(bytes), { ok: false, reason: PROTECTED });
});

test('a Book stream with BOF version 0x0500 is too old', async () => {
    const stream = concat(bof(0x0005, 0x0500), eof());
    assert.deepEqual(await readXls(cfb(stream, {}, 'Book').bytes), { ok: false, reason: TOO_OLD });
    assert.deepEqual(await readXls(cfb(stream, {}, 'Workbook').bytes), { ok: false, reason: TOO_OLD });
});

test('an OLE file without a Workbook or Book stream is not Excel', async () => {
    const bytes = buildCfb([{ name: 'WordDocument', data: new Uint8Array(1000) }]).bytes;
    assert.deepEqual(await readXls(bytes), { ok: false, reason: NOT_EXCEL });
});

test('text, a ZIP header, empty bytes and non-bytes are not Excel', async () => {
    const inputs = [
        new TextEncoder().encode('Date;Amount\n01.10.2026;5\n'),
        u8(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0),
        new Uint8Array(0),
        u8(0xd0, 0xcf, 0x11),
        'a string',
        null,
        undefined,
        42,
        {},
    ];
    for (const input of inputs) {
        assert.deepEqual(await readXls(input), { ok: false, reason: NOT_EXCEL });
    }
});

test('truncated files are damaged', async () => {
    const { bytes } = cfb(padTo(sampleBook(), 9000));
    for (const length of [8, 100, 511, 512, 700, bytes.length - 512, bytes.length - 1]) {
        assert.deepEqual(await readXls(bytes.slice(0, length)), { ok: false, reason: DAMAGED }, `length ${length}`);
    }
});

test('a record that runs past the end of the stream is damaged', async () => {
    const whole = sampleBook();
    for (const cut of [whole.length - 1, whole.length - 5, whole.length - 20]) {
        assert.equal(await reasonOf(cfb(whole.slice(0, cut)).bytes), DAMAGED, `cut ${cut}`);
    }
    // The Workbook stream ends cleanly but without a closing EOF record.
    assert.equal(await reasonOf(cfb(whole.slice(0, whole.length - 4)).bytes), DAMAGED);
});

test('a looping or out-of-range FAT chain is damaged', async () => {
    const stream = padTo(sampleBook(), 9000);
    const layout = cfb(stream);
    const start = layout.startOf('Workbook');

    const looping = layout.bytes.slice();
    poke32(looping, layout.fatEntryOffset(start), start);
    assert.equal(await reasonOf(looping), DAMAGED);

    const loopingLater = layout.bytes.slice();
    poke32(loopingLater, layout.fatEntryOffset(start + 3), start + 1);
    assert.equal(await reasonOf(loopingLater), DAMAGED);

    const outOfRange = layout.bytes.slice();
    poke32(outOfRange, layout.fatEntryOffset(start + 1), 0x7fffffff);
    assert.equal(await reasonOf(outOfRange), DAMAGED);

    const free = layout.bytes.slice();
    poke32(free, layout.fatEntryOffset(start + 1), FREE);
    assert.equal(await reasonOf(free), DAMAGED);

    const short = layout.bytes.slice();
    poke32(short, layout.fatEntryOffset(start + 1), END);
    assert.equal(await reasonOf(short), DAMAGED);
});

test('a looping or out-of-range mini chain is damaged', async () => {
    const layout = cfb(sampleBook());
    const looping = layout.bytes.slice();
    poke32(looping, layout.miniFatEntryOffset(2), 1);
    assert.equal(await reasonOf(looping), DAMAGED);
    const outOfRange = layout.bytes.slice();
    poke32(outOfRange, layout.miniFatEntryOffset(2), 100000);
    assert.equal(await reasonOf(outOfRange), DAMAGED);
});

test('a looping directory chain or a bad header is damaged', async () => {
    const layout = cfb(padTo(sampleBook(), 9000));
    const looping = layout.bytes.slice();
    poke32(looping, layout.fatEntryOffset(layout.dirSector), layout.dirSector);
    assert.equal(await reasonOf(looping), DAMAGED);

    const badDirectory = layout.bytes.slice();
    poke32(badDirectory, 48, 99999);
    assert.equal(await reasonOf(badDirectory), DAMAGED);

    const badFat = layout.bytes.slice();
    poke32(badFat, 76, 99999);
    assert.equal(await reasonOf(badFat), DAMAGED);

    const badByteOrder = layout.bytes.slice();
    badByteOrder[28] = 0;
    assert.equal(await reasonOf(badByteOrder), DAMAGED);

    const badShift = layout.bytes.slice();
    badShift[30] = 10;
    assert.equal(await reasonOf(badShift), DAMAGED);
});

test('an SST count that exceeds the data is damaged', async () => {
    const stream = workbookStream({
        post: [sst(1000, 1000, [concat(xlStr('a'), xlStr('b'))])],
        sheets: [{ body: labelSst(0, 0, 0) }],
    });
    assert.equal(await reasonOf(cfb(stream).bytes), DAMAGED);
    const huge = workbookStream({
        post: [sst(0xffffffff, 0xffffffff, [xlStr('a')])],
        sheets: [{ body: labelSst(0, 0, 0) }],
    });
    assert.equal(await reasonOf(cfb(huge).bytes), DAMAGED);
});

test('a BOUNDSHEET offset outside the stream is damaged', async () => {
    const stream = sampleBook();
    const broken = stream.slice();
    // The BOUNDSHEET follows the globals BOF (20 bytes); its offset field starts after its 4-byte header.
    new DataView(broken.buffer).setUint32(24, 0x00ffffff, true);
    assert.equal(await reasonOf(cfb(broken).bytes), DAMAGED);
});

test('readXls never throws on damaged input', async () => {
    const original = cfb(padTo(sampleBook(), 6000)).bytes;
    let seed = 12345;
    const random = (limit) => {
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        return seed % limit;
    };
    for (let round = 0; round < 300; round += 1) {
        const copy = original.slice();
        for (let k = 0; k < 1 + random(4); k += 1) {
            copy[random(copy.length)] = random(256);
        }
        const input = round % 7 === 0 ? copy.slice(0, random(copy.length)) : copy;
        const result = await readXls(input);
        assert.equal(typeof result.ok, 'boolean');
        assert.ok(result.ok ? Array.isArray(result.rows) : typeof result.reason === 'string');
    }
});
