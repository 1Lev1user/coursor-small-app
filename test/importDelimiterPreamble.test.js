import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, findHeaderRow } from '../src/import/text.js';

function plain(n) {
    return Array.from({ length: n }, (_, i) => `Bank statement line ${i + 1}`);
}

function keyValue(n) {
    return Array.from({ length: n }, (_, i) => `Key ${i + 1};Value ${i + 1}`);
}

function semicolonTable(rowCount) {
    const lines = ['Datums;Apraksts;Summa;Valuta'];
    for (let i = 0; i < rowCount; i += 1) {
        lines.push(`13.09.2026;S${i};-12,50;EUR`);
    }
    return lines;
}

function parseWith(preamble, table) {
    return parseDelimited([...preamble, ...table].join('\n'));
}

for (const count of [11, 12, 15]) {
    test(`${count} plain preamble lines before a semicolon table`, () => {
        const { delimiter, rows } = parseWith(plain(count), semicolonTable(30));
        assert.equal(delimiter, ';');
        assert.equal(rows.length, count + 31);
        assert.equal(findHeaderRow(rows), count);
        assert.deepEqual(rows[count + 1], ['13.09.2026', 'S0', '-12,50', 'EUR']);
    });
}

test('25 key;value preamble lines keep the four-field table winning', () => {
    const { delimiter, rows } = parseWith(keyValue(25), semicolonTable(30));
    assert.equal(delimiter, ';');
    assert.equal(findHeaderRow(rows), 25);
});

for (const [count, dataRows] of [[25, 30], [40, 30], [40, 5]]) {
    test(`${count} plain preamble lines and ${dataRows} data rows`, () => {
        const { delimiter, rows } = parseWith(plain(count), semicolonTable(dataRows));
        assert.equal(delimiter, ';');
        assert.equal(rows.length, count + dataRows + 1);
        assert.equal(findHeaderRow(rows), count);
    });
}

for (const count of [10, 0]) {
    test(`${count} preamble lines still work`, () => {
        const { delimiter, rows } = parseWith(plain(count), semicolonTable(30));
        assert.equal(delimiter, ';');
        assert.equal(findHeaderRow(rows), count);
    });
}

test('tab-separated rows after 15 plain preamble lines', () => {
    const table = [0, 1, 2].map((i) => `${17 + i}.09.2026\tCoffee Shop\t-4,50\tEUR`);
    const { delimiter, rows } = parseWith(plain(15), table);
    assert.equal(delimiter, '\t');
    assert.equal(rows.length, 18);
    assert.equal(rows[15].length, 4);
});

test('comma-delimited file after 12 plain preamble lines', () => {
    const table = ['Started Date,Completed Date,Description,Amount,Currency'];
    for (let i = 1; i <= 10; i += 1) {
        const day = String(i).padStart(2, '0');
        table.push(`2026-09-${day},2026-09-${day},Shop ${i},-4.50,EUR`);
    }
    const { delimiter, rows } = parseWith(plain(12), table);
    assert.equal(delimiter, ',');
    assert.equal(rows.length, 23);
    assert.equal(findHeaderRow(rows), 12);
});

test('headerless all-quoted file with commas inside the fields keeps ";"', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `"13.04.2026";"Shop, ${i + 1}";"-${i + 1},50"`);
    const { delimiter, rows } = parseDelimited(lines.join('\n'));
    assert.equal(delimiter, ';');
    assert.equal(rows.length, 25);
    assert.ok(rows.every((row) => row.length === 3));
    assert.deepEqual(rows[0], ['13.04.2026', 'Shop, 1', '-1,50']);
});
