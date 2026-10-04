import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDelimited } from '../src/import/text.js';

const pad = (n) => String(n).padStart(2, '0');

function build(strayRow) {
    const lines = ['Date;Description;Amount'];
    for (let n = 1; n <= 30; n += 1) {
        lines.push(
            n === strayRow
                ? `2026-03-${pad(n)};Pizza 12" large;-${n},00`
                : `2026-03-${pad(n)};Shop ${n};-${n},00`
        );
    }
    return lines.join('\n') + '\n';
}

test('a stray quote on row 5 does not swallow the following rows', () => {
    const { delimiter, rows } = parseDelimited(build(5));
    assert.equal(delimiter, ';');
    assert.equal(rows.length, 31);
    assert.deepEqual(rows[5], ['2026-03-05', 'Pizza 12" large', '-5,00']);
});

for (const strayRow of [2, 15, 28]) {
    test(`a stray quote on data row ${strayRow} keeps all 31 rows`, () => {
        const { rows } = parseDelimited(build(strayRow));
        assert.equal(rows.length, 31);
        for (const row of rows) {
            assert.equal(row.length, 3);
        }
        assert.equal(rows[strayRow][1], 'Pizza 12" large');
    });
}

test('the D-bank variant with a currency column keeps 31 rows of 4 fields', () => {
    const lines = ['Date;Description;Amount;Currency'];
    for (let n = 1; n <= 30; n += 1) {
        lines.push(
            n === 5
                ? '17.09.2026;PIZZA 12" MARGARITA;-12,50;EUR'
                : `17.09.2026;Shop ${n};-${n},00;EUR`
        );
    }
    const { delimiter, rows } = parseDelimited(lines.join('\n') + '\n');
    assert.equal(delimiter, ';');
    assert.equal(rows.length, 31);
    for (const row of rows) {
        assert.equal(row.length, 4);
    }
    assert.equal(rows[5][1], 'PIZZA 12" MARGARITA');
});

test('comma delimiter with quoted amounts and one stray quote stays readable', () => {
    const lines = ['Date,Description,Amount'];
    for (let n = 1; n <= 30; n += 1) {
        lines.push(
            n === 5
                ? `2026-03-${pad(n)},Pizza 12" large,"-${n},00"`
                : `2026-03-${pad(n)},Shop ${n},"-${n},00"`
        );
    }
    const { delimiter, rows } = parseDelimited(lines.join('\n') + '\n');
    assert.equal(delimiter, ',');
    assert.equal(rows.length, 31);
    for (const row of rows) {
        assert.equal(row.length, 3);
    }
    assert.equal(rows[6][2], '-6,00');
});

test('controls: multi-line quoted field and doubled quotes still work', () => {
    const multi = parseDelimited(
        'Datums;Apraksts;Summa\n13.04.2026;"Coffee; extra note\nsecond line";12,50\n'
    );
    assert.equal(multi.rows.length, 2);
    assert.equal(multi.rows[1][1], 'Coffee; extra note\nsecond line');

    const doubled = parseDelimited('a;b\n1;"She said ""hi"""\n');
    assert.equal(doubled.rows[1][1], 'She said "hi"');
});

test('controls: a space before the opening quote still reads one field', () => {
    const { rows } = parseDelimited('a;b\n1; "x;y"\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].length, 2);
    assert.equal(rows[1][1].trim(), 'x;y');
});

test('an unterminated quote falls back to line structure', () => {
    const { rows } = parseDelimited('a;b\n1;"never closed\n2;x\n');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[2], ['2', 'x']);
});
