import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, rowsToStatement } from '../src/import/text.js';
import {
    checkWarnings,
    layoutFitsSample,
    layoutRecord,
    parseLayoutFor,
} from '../src/views/import.js';

function columns(overrides = {}) {
    return {
        date: -1, amount: -1, description: -1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1,
        ...overrides,
    };
}

function read(text, layout) {
    const { rows } = parseDelimited(text);
    return rowsToStatement(rows, 0, layout).rows;
}

const E7_TEXT = [
    'Datums;Apraksts;Summa',
    '13.09.2026;RIMI;12,50',
    '14.09.2026;ALGA;-900,00',
].join('\n');

const E7_LAYOUT = {
    columns: columns({ date: 0, description: 1, amount: 2 }),
    decimalSeparator: ',',
    dateFormat: 'DMY',
};

function pick(rows) {
    return rows.map(({ description, direction, amountCents }) => [description, direction, amountCents]);
}

test('E7: a bank that shows spending as positive reads the opposite way until reverse is set', () => {
    const plain = [['RIMI', 'in', 1250], ['ALGA', 'out', 90000]];
    assert.deepEqual(pick(read(E7_TEXT, E7_LAYOUT)), plain);
    assert.deepEqual(pick(read(E7_TEXT, { ...E7_LAYOUT, reverse: false })), plain);
    assert.deepEqual(pick(read(E7_TEXT, { ...E7_LAYOUT, reverse: true })), [['RIMI', 'out', 1250], ['ALGA', 'in', 90000]]);
});

test('reverse flips a direction column too', () => {
    const text = ['Datums;Apraksts;Summa;D/K', '13.09.2026;RIMI;12,50;D', '14.09.2026;ALGA;900,00;K'].join('\n');
    const layout = {
        columns: columns({ date: 0, description: 1, amount: 2, direction: 3 }),
        decimalSeparator: ',',
        dateFormat: 'DMY',
    };
    assert.deepEqual(pick(read(text, layout)), [['RIMI', 'out', 1250], ['ALGA', 'in', 90000]]);
    assert.deepEqual(pick(read(text, { ...layout, reverse: true })), [['RIMI', 'in', 1250], ['ALGA', 'out', 90000]]);
});

test('parseLayoutFor drops reverse in split mode and keeps it in single mode', () => {
    const split = parseLayoutFor({
        mode: 'split',
        reverse: true,
        columns: columns({ date: 0, description: 1, amount: 2, direction: 3, debit: 2, credit: 3 }),
        decimalSeparator: ',',
        dateFormat: 'DMY',
    });
    assert.notEqual(split.reverse, true);
    assert.equal(split.columns.amount, -1);
    assert.equal(split.columns.direction, -1);

    const text = ['Datums;Apraksts;Debets;Kredits', '13.09.2026;RIMI;12,50;', '14.09.2026;ALGA;;900,00'].join('\n');
    assert.deepEqual(pick(read(text, split)), [['RIMI', 'out', 1250], ['ALGA', 'in', 90000]]);

    const single = parseLayoutFor({ mode: 'single', reverse: true, ...E7_LAYOUT });
    assert.equal(single.reverse, true);
    assert.deepEqual(pick(read(E7_TEXT, single)), [['RIMI', 'out', 1250], ['ALGA', 'in', 90000]]);
    assert.notEqual(parseLayoutFor({ mode: 'single', ...E7_LAYOUT }).reverse, true);
});

test('layoutRecord writes reverse only for single mode with reverse on', () => {
    const base = { name: 'Bank', signature: 'a|b', headerRow: 0 };
    const layout = { mode: 'single', columns: columns({ date: 0, amount: 2 }), decimalSeparator: ',', dateFormat: 'DMY' };
    assert.equal(layoutRecord({ ...base, layout: { ...layout, reverse: true } }).reverse, true);
    for (const other of [
        { ...layout, reverse: false },
        { ...layout },
        { ...layout, mode: 'split', reverse: true },
    ]) {
        assert.equal(Object.hasOwn(layoutRecord({ ...base, layout: other }), 'reverse'), false);
    }
});

test('layoutFitsSample ignores reverse', () => {
    const sample = parseDelimited(E7_TEXT).rows.slice(1);
    const saved = layoutRecord({
        name: 'Bank', signature: 'a|b', headerRow: 0,
        layout: { mode: 'single', ...E7_LAYOUT },
    });
    assert.equal(layoutFitsSample(saved, sample), true);
    assert.equal(layoutFitsSample({ ...saved, reverse: true }, sample), true);
    const wrong = { ...saved, decimalSeparator: '.' };
    assert.equal(layoutFitsSample(wrong, sample), layoutFitsSample({ ...wrong, reverse: true }, sample));
});

test('checkWarnings points to the reverse switch where it can be used', () => {
    const mostlyIn = { mostlyIn: true, inCount: 28, read: 30, lineMismatch: null };
    const columnsWarning = checkWarnings(mostlyIn, 'columns');
    assert.equal(columnsWarning.length, 1);
    assert.match(columnsWarning[0], /Reverse money in and out below/);

    const saved = checkWarnings(mostlyIn, 'saved');
    assert.equal(saved.length, 1);
    assert.match(saved[0], /Change columns/);
    assert.match(saved[0], /Reverse money in and out/);
    assert.doesNotMatch(saved[0], /below/);

    assert.deepEqual(checkWarnings(mostlyIn, 'file'), []);
    assert.deepEqual(checkWarnings({ ...mostlyIn, mostlyIn: false }, 'columns'), []);

    const mismatch = { ...mostlyIn, lineMismatch: { fileLines: 42, tableRows: 31 } };
    const both = checkWarnings(mismatch, 'columns');
    assert.equal(both.length, 2);
    assert.match(both[1], /The file has 42 lines but 31 rows were read\./);
});

test('a restored saved layout with reverse reads reversed', () => {
    const record = layoutRecord({
        name: 'Bank', signature: 'a|b', headerRow: 0,
        layout: { mode: 'single', reverse: true, ...E7_LAYOUT },
    });
    // Same shape startTable builds when it restores a record.
    const restored = {
        mode: record.columns.debit >= 0 || record.columns.credit >= 0 ? 'split' : 'single',
        columns: { ...columns(), ...record.columns },
        decimalSeparator: record.decimalSeparator,
        dateFormat: record.dateFormat,
        reverse: record.reverse === true,
    };
    assert.deepEqual(pick(read(E7_TEXT, parseLayoutFor(restored))), [['RIMI', 'out', 1250], ['ALGA', 'in', 90000]]);
});
