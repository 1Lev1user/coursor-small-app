import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { parseXml } from '../src/import/xml.js';
import { readSpreadsheetMl } from '../src/import/spreadsheetml.js';
import { applyImport, defaultDecisions, findDuplicates } from '../src/import/core.js';
import { widestRow } from '../src/views/import.js';

const BIG = 130000;

test('widestRow finds the widest of 200 000 rows without a stack overflow', () => {
    const rows = [];
    for (let index = 0; index < 200000; index += 1) rows.push(new Array(3).fill('x'));
    rows[12345] = new Array(7).fill('x');
    rows[199999] = new Array(5).fill('x');
    assert.equal(widestRow(rows), 7);
});

test('widestRow is 0 for no rows and the length for one row', () => {
    assert.equal(widestRow([]), 0);
    assert.equal(widestRow([['a', 'b']]), 2);
});

test('parseXml reads a node with 130 000 children', () => {
    const root = parseXml(`<a>${'<b/>'.repeat(BIG)}</a>`);
    assert.equal(root.children.length, BIG);
    assert.equal(root.children[0].qualified, undefined);
});

test('readSpreadsheetMl reads 130 000 rows', () => {
    const head = '<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
        + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
    const row = '<Row><Cell><Data ss:Type="String">2026-09-01</Data></Cell><Cell><Data ss:Type="Number">1</Data></Cell></Row>';
    const result = readSpreadsheetMl(`${head}<Worksheet ss:Name="S"><Table>${row.repeat(BIG)}</Table></Worksheet></Workbook>`);
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, BIG);
});

test('applyImport adds 130 000 built expenses and 130 000 incomes', () => {
    const data = defaultData();
    const make = (prefix, index) => ({ id: `${prefix}${index}`, date: '2026-10-01', amountCents: 100 });
    const expenses = [];
    const incomes = [];
    for (let index = 0; index < BIG; index += 1) {
        expenses.push(make('e', index));
        incomes.push(make('i', index));
    }
    const built = {
        importRecord: {
            id: 'imp_big',
            source: { format: 'csv', fileName: 'big.csv' },
            counts: {},
            expenseIds: expenses.map(({ id }) => id),
            incomeIds: incomes.map(({ id }) => id),
        },
        expenses,
        incomes,
        rules: [],
        planChoices: [],
    };
    const before = { expenses: data.expenses.length, incomes: data.incomes.length };
    const result = applyImport(data, built, {});
    assert.equal(result.ok, true);
    assert.equal(data.expenses.length - before.expenses, BIG);
    assert.equal(data.incomes.length - before.incomes, BIG);
    assert.notEqual(data.expenses.at(-1), expenses.at(-1));
    assert.deepEqual(data.expenses.at(-1), expenses.at(-1));
});

// --- own-transfer pairing -------------------------------------------------

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

function transferRow(direction, day, amountCents, extra = {}) {
    const date = new Date(Date.UTC(2026, 8, 1 + day)).toISOString().slice(0, 10);
    return statementRow({ date, amountCents, direction, description: `row ${direction} ${amountCents} ${day}`, ...extra });
}

function transferKinds(rows) {
    return defaultDecisions(freshData(), rows, rows.map(() => null)).map(({ kind }) => kind === 'transfer');
}

/** The pairing as it was before the window: every out-row against every in-row, sorted, greedy. */
function referenceTransfers(rows) {
    const eligible = rows.map((row) => !row.mcc && row.amountCents >= 1000);
    const buckets = new Map();
    rows.forEach((row, index) => {
        if (!eligible[index]) return;
        const key = `${row.currency}|${row.amountCents}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(index);
    });
    const days = rows.map((row) => Date.parse(row.date) / 86400000);
    const candidates = [];
    for (const indexes of buckets.values()) {
        for (const out of indexes.filter((index) => rows[index].direction === 'out')) {
            for (const inn of indexes.filter((index) => rows[index].direction === 'in')) {
                const gap = Math.abs(days[out] - days[inn]);
                if (gap <= 1) candidates.push({ out, inn, gap });
            }
        }
    }
    candidates.sort((a, b) => a.gap - b.gap
        || Math.min(a.out, a.inn) - Math.min(b.out, b.inn)
        || Math.max(a.out, a.inn) - Math.max(b.out, b.inn));
    const paired = new Set();
    for (const { out, inn } of candidates) {
        if (paired.has(out) || paired.has(inn)) continue;
        paired.add(out);
        paired.add(inn);
    }
    return rows.map((row, index) => paired.has(index));
}

function seeded(seed) {
    let state = seed;
    return (limit) => {
        state = (state + 0x6D2B79F5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return Math.floor(((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296 * limit);
    };
}

test('own-transfer pairs equal the all-against-all reference on random small cases', () => {
    const random = seeded(101);
    let paired = 0;
    for (let round = 0; round < 400; round += 1) {
        const count = 2 + random(30);
        const span = 1 + random(8);
        const rows = [];
        for (let index = 0; index < count; index += 1) {
            const extra = {};
            if (random(10) === 0) extra.mcc = '5411';
            if (random(8) === 0) extra.currency = 'USD';
            rows.push(transferRow(random(2) === 0 ? 'out' : 'in', random(span), [500, 1000, 2500][random(3)], extra));
        }
        const kinds = transferKinds(rows);
        assert.deepEqual(kinds, referenceTransfers(rows), `round ${round}`);
        paired += kinds.filter(Boolean).length;
    }
    assert.ok(paired > 1000, 'the random cases must contain many pairs');
});

test('own-transfer pairs: nearest day first, then lower index, each row once', () => {
    const rows = [
        transferRow('out', 0, 5000),
        transferRow('in', 1, 5000),
        transferRow('in', 0, 5000),
        transferRow('out', 2, 5000),
    ];
    assert.deepEqual(transferKinds(rows), [true, true, true, true]);
    assert.deepEqual(transferKinds(rows), referenceTransfers(rows));
});

test('10 000 rows of one amount are paired quickly, spread over days or on one day', () => {
    const spread = [];
    const sameDay = [];
    for (let index = 0; index < 10000; index += 1) {
        const direction = index % 2 === 0 ? 'out' : 'in';
        spread.push(transferRow(direction, Math.floor(index / 40), 2500));
        sameDay.push(transferRow(direction, 0, 2500));
    }
    for (const rows of [spread, sameDay]) {
        const start = performance.now();
        const kinds = transferKinds(rows);
        assert.ok(performance.now() - start < 5000, 'pairing took too long');
        assert.equal(kinds.every(Boolean), true);
    }
});

test('findDuplicates with many stored entries sharing one amount and reference is not quadratic', () => {
    const data = freshData();
    for (let index = 0; index < 40000; index += 1) {
        data.expenses.push({
            id: `x${index}`, date: '2026-08-01', amountCents: 1234, bankRef: 'REF', categoryId: 'random', fingerprint: `fp${index}`,
        });
    }
    const rows = [];
    for (let index = 0; index < 5; index += 1) {
        rows.push(statementRow({ date: '2026-09-15', amountCents: 1234, direction: 'out', description: `n${index}`, bankRef: 'REF' }));
    }
    const start = performance.now();
    const result = findDuplicates(data, rows);
    assert.equal(result.length, rows.length);
    assert.ok(performance.now() - start < 5000, 'findDuplicates took too long');
});
