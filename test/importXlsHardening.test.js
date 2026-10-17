import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXls } from '../src/import/xls.js';

const DAMAGED = 'The Excel file is damaged and could not be read.';
const NOT_EXCEL = 'This file is not an Excel workbook.';
const END = 0xfffffffe;
const FREE = 0xffffffff;
const SECTOR = 512;

const u16 = (value) => [value & 255, (value >> 8) & 255];
const u32 = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
const rec = (type, body) => Uint8Array.from([...u16(type), ...u16(body.length), ...body]);
const cat = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));

/** A one-sheet workbook whose only cell, A1, holds `text` (a LABEL record). */
function workbook(text) {
    const bof = (substream) => rec(0x0809, [...u16(0x0600), ...u16(substream), ...u16(0x0dbb), ...u16(0x07cc), ...u32(0), ...u32(6)]);
    const boundsheet = (offset) => rec(0x0085, [...u32(offset), 0, 0, 2, 0, 0x53, 0x31]);
    const eof = rec(0x000a, []);
    const label = rec(0x0204, [...u16(0), ...u16(0), ...u16(0), ...u16(text.length), 0, ...Array.from(text, (c) => c.charCodeAt(0))]);
    const head = cat(bof(0x0005), boundsheet(0), eof);
    return cat(bof(0x0005), boundsheet(head.length), eof, bof(0x0010), label, eof);
}

const padTo = (bytes, size) => {
    const out = new Uint8Array(size);
    out.set(bytes);
    return out;
};

/**
 * Minimal compound file. entries[0] is the root; every other entry is
 * { name, type, left, right, child, data? } with explicit directory ids. All data goes through the FAT,
 * so each data block is padded to 4096 bytes.
 */
function cfb(entries, { cutoff = 4096, patch } = {}) {
    const blocks = entries.map((entry) => (entry.data ? padTo(entry.data, Math.max(4096, Math.ceil(entry.data.length / SECTOR) * SECTOR)) : null));
    const fat = [];
    const sectors = [];
    const starts = blocks.map((block) => {
        if (!block) return END;
        const first = sectors.length;
        for (let k = 0; k < block.length / SECTOR; k += 1) {
            fat[sectors.length] = k < block.length / SECTOR - 1 ? sectors.length + 1 : END;
            sectors.push(block.subarray(k * SECTOR, (k + 1) * SECTOR));
        }
        return first;
    });
    const dirSectors = Math.ceil(entries.length / 4);
    const dir = new Uint8Array(dirSectors * SECTOR);
    const view = new DataView(dir.buffer);
    entries.forEach((entry, index) => {
        const base = index * 128;
        for (let k = 0; k < entry.name.length; k += 1) view.setUint16(base + k * 2, entry.name.charCodeAt(k), true);
        view.setUint16(base + 64, (entry.name.length + 1) * 2, true);
        dir[base + 66] = entry.type;
        view.setUint32(base + 68, entry.left ?? FREE, true);
        view.setUint32(base + 72, entry.right ?? FREE, true);
        view.setUint32(base + 76, entry.child ?? FREE, true);
        view.setUint32(base + 116, starts[index], true);
        view.setUint32(base + 120, entry.size ?? blocks[index]?.length ?? 0, true);
    });
    const dirStart = sectors.length;
    for (let k = 0; k < dirSectors; k += 1) {
        fat[sectors.length] = k < dirSectors - 1 ? sectors.length + 1 : END;
        sectors.push(dir.subarray(k * SECTOR, (k + 1) * SECTOR));
    }
    const fatSector = sectors.length;
    fat[fatSector] = 0xfffffffd;
    const fatBytes = new Uint8Array(SECTOR).fill(0xff);
    const fatView = new DataView(fatBytes.buffer);
    assert.ok(fat.length <= SECTOR / 4);
    fat.forEach((value, index) => fatView.setUint32(index * 4, value, true));
    sectors.push(fatBytes);

    const out = new Uint8Array(SECTOR * (sectors.length + 1));
    const header = new DataView(out.buffer);
    out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
    header.setUint16(24, 0x3e, true);
    header.setUint16(26, 3, true);
    header.setUint16(28, 0xfffe, true);
    header.setUint16(30, 9, true);
    header.setUint16(32, 6, true);
    header.setUint32(44, 1, true);
    header.setUint32(48, dirStart, true);
    header.setUint32(56, cutoff, true);
    header.setUint32(60, END, true);
    header.setUint32(68, END, true);
    for (let k = 0; k < 109; k += 1) header.setUint32(76 + k * 4, k === 0 ? fatSector : FREE, true);
    sectors.forEach((sector, index) => out.set(sector, SECTOR * (index + 1)));
    patch?.(out, { dirStart });
    return out;
}

const root = (child) => ({ name: 'Root Entry', type: 5, child });
const rows = (text) => [[text]];

test('a cutoff other than 4096 is damaged and returns at once', async () => {
    const bytes = cfb([root(1), { name: 'Workbook', type: 2, data: workbook('x'), size: 0xfffffff0 }], { cutoff: 0xffffffff });
    const started = performance.now();
    const result = await readXls(bytes);
    assert.deepEqual(result, { ok: false, reason: DAMAGED });
    assert.ok(performance.now() - started < 1000);
});

test('a declared stream size larger than the file is damaged', async () => {
    const bytes = cfb([root(1), { name: 'Workbook', type: 2, data: workbook('x'), size: 0x7ffffff0 }]);
    assert.deepEqual(await readXls(bytes), { ok: false, reason: DAMAGED });
});

test('a Workbook inside an embedded storage is ignored; the root Workbook is read', async () => {
    // Directory order: root, Embedded storage (1) with its own Workbook (2), then the root Workbook (3).
    const bytes = cfb([
        root(1),
        { name: 'Embedded', type: 1, right: 3, child: 2 },
        { name: 'Workbook', type: 2, data: workbook('embedded') },
        { name: 'Workbook', type: 2, data: workbook('root') },
    ]);
    assert.deepEqual(await readXls(bytes), { ok: true, rows: rows('root') });
});

test('a Workbook that is only inside an embedded storage is not Excel', async () => {
    const bytes = cfb([root(1), { name: 'Embedded', type: 1, child: 2 }, { name: 'Workbook', type: 2, data: workbook('embedded') }]);
    assert.deepEqual(await readXls(bytes), { ok: false, reason: NOT_EXCEL });
});

test('sibling ids that form a loop are damaged', async () => {
    const bytes = cfb([
        root(1),
        { name: 'A', type: 2, right: 2, data: new Uint8Array(10) },
        { name: 'Workbook', type: 2, right: 1, data: workbook('x') },
    ]);
    assert.deepEqual(await readXls(bytes), { ok: false, reason: DAMAGED });
    const self = cfb([root(1), { name: 'Workbook', type: 2, left: 1, data: workbook('x') }]);
    assert.deepEqual(await readXls(self), { ok: false, reason: DAMAGED });
});

test('the Workbook may sit anywhere in the root tree (left, right, deeper)', async () => {
    const bytes = cfb([
        root(1),
        { name: 'M', type: 2, left: 2, right: 3, data: new Uint8Array(10) },
        { name: 'L', type: 2, left: 4, data: new Uint8Array(10) },
        { name: 'R', type: 2, data: new Uint8Array(10) },
        { name: 'Workbook', type: 2, data: workbook('deep') },
    ]);
    assert.deepEqual(await readXls(bytes), { ok: true, rows: rows('deep') });
});

test('fixture: citadele-like.xls still reads 79 rows', async () => {
    const result = await readXls(readFileSync(new URL('./fixtures/xls/citadele-like.xls', import.meta.url)));
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 79);
});
