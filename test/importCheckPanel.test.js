import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, rowsToStatement } from '../src/import/text.js';
import { checkSummary, checkPanelPlacement, checkWarnings } from '../src/views/import.js';

const COLUMNS = {
    date: 0,
    description: 1,
    amount: 2,
    debit: -1,
    credit: -1,
    direction: -1,
    currency: -1,
    eurAmount: -1,
    bankRef: -1,
};

function statement(text, decimalSeparator, columns = COLUMNS) {
    const { rows } = parseDelimited(text);
    return rowsToStatement(rows, 0, { columns, decimalSeparator, dateFormat: 'DMY' });
}

function rowsOf(count, direction, amountCents = 1250) {
    return Array.from({ length: count }, (_, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, '0')}`,
        description: `Shop ${index}`,
        counterparty: '',
        direction,
        amountCents,
    }));
}

const FILE = 'Datums;Apraksts;Summa\n13.09.2026;S0;-12,50 EUR\n14.09.2026;S1;-3,20 EUR\n';

test('a wrong decimal separator shows up as the totals of the rows it was given', () => {
    const wrong = statement(FILE, '.');
    const right = statement(FILE, ',');
    const wrongSummary = checkSummary(wrong.rows, wrong.skipped);
    const rightSummary = checkSummary(right.rows, right.skipped);
    assert.equal(wrongSummary.totalOutCents, wrong.rows.reduce((sum, row) => sum + row.amountCents, 0));
    assert.equal(wrongSummary.totalOutCents, 157000);
    assert.equal(rightSummary.totalOutCents, 1570);
    assert.equal(rightSummary.totalInCents, 0);
    assert.equal(rightSummary.sample[0], right.rows[0]);
    assert.equal(rightSummary.read, 2);
});

test('mostlyIn needs at least 5 rows and at least 90 percent money in', () => {
    const mostlyIn = (rows) => checkSummary(rows, []).mostlyIn;
    assert.equal(mostlyIn(rowsOf(6, 'in')), true);
    assert.equal(mostlyIn(rowsOf(5, 'in')), true);
    assert.equal(mostlyIn([...rowsOf(9, 'in'), ...rowsOf(1, 'out')]), true);
    assert.equal(mostlyIn([...rowsOf(3, 'in'), ...rowsOf(3, 'out')]), false);
    assert.equal(mostlyIn(rowsOf(4, 'in')), false);
    assert.equal(mostlyIn(rowsOf(6, 'out')), false);
    assert.equal(checkSummary(rowsOf(6, 'in'), []).inCount, 6);
});

test('unsigned amounts with an empty direction cell are read as money in', () => {
    const text = 'Date;Description;Amount;Type\n'
        + ['RIMI', 'MAXIMA', 'LIDL', 'NARVESEN', 'ELVI', 'DEPO']
            .map((name, index) => `0${index + 1}.03.2026;${name};12,50;`)
            .join('\n');
    const result = statement(text, ',', { ...COLUMNS, direction: 3 });
    assert.equal(result.rows.length, 6);
    assert.equal(checkSummary(result.rows, result.skipped).mostlyIn, true);
});

test('lineMismatch reports the handed-in numbers only when they differ', () => {
    const rows = rowsOf(2, 'out');
    assert.deepEqual(checkSummary(rows, [], { fileLines: 31, tableRows: 6 }).lineMismatch, { fileLines: 31, tableRows: 6 });
    assert.equal(checkSummary(rows, [], { fileLines: 31, tableRows: 31 }).lineMismatch, null);
    assert.equal(checkSummary(rows, [], { fileLines: null, tableRows: 5 }).lineMismatch, null);
    assert.equal(checkSummary(rows, [], { fileLines: 5, tableRows: null }).lineMismatch, null);
    assert.equal(checkSummary(rows, []).lineMismatch, null);
});

test('an opening balance read as income appears in the money in total', () => {
    const rows = [
        { date: '2026-03-01', description: 'Sakuma atlikums', counterparty: '', direction: 'in', amountCents: 100000 },
        { date: '2026-03-02', description: 'RIMI', counterparty: '', direction: 'out', amountCents: 1250 },
    ];
    const summary = checkSummary(rows, []);
    assert.equal(summary.totalInCents, 100000);
    assert.equal(summary.totalOutCents, 1250);
    assert.equal(summary.inCount, 1);
});

test('rows without an EUR amount are left out of the totals and counted', () => {
    const rows = [
        ...rowsOf(2, 'out', 500),
        { date: '2026-03-09', description: 'USD shop', counterparty: '', direction: 'out', amountCents: null, originalAmountCents: 900, currency: 'USD' },
    ];
    const summary = checkSummary(rows, [{ line: 9, reason: 'summary row' }]);
    assert.equal(summary.totalOutCents, 1000);
    assert.equal(summary.foreignCount, 1);
    assert.equal(summary.read, 3);
    assert.equal(summary.skippedCount, 1);
});

test('sample is the first three rows plus the last one when there are more than four', () => {
    const ten = rowsOf(10, 'out');
    assert.deepEqual(checkSummary(ten, []).sample, [ten[0], ten[1], ten[2], ten[9]]);
    for (const count of [3, 4]) {
        const rows = rowsOf(count, 'out');
        assert.deepEqual(checkSummary(rows, []).sample, rows);
    }
    const five = rowsOf(5, 'out');
    assert.deepEqual(checkSummary(five, []).sample, [five[0], five[1], five[2], five[4]]);
});

test('checkPanelPlacement names where the panel is drawn', () => {
    assert.equal(checkPanelPlacement('columns', { tabular: true, savedLayoutName: '' }), 'columns');
    assert.equal(checkPanelPlacement('duplicates', { tabular: true, savedLayoutName: 'Swedbank' }), 'saved');
    assert.equal(checkPanelPlacement('duplicates', { tabular: true, savedLayoutName: '' }), null);
    assert.equal(checkPanelPlacement('duplicates', { tabular: false, savedLayoutName: '' }), 'file');
    assert.equal(checkPanelPlacement('categorise', { tabular: true, savedLayoutName: 'Swedbank' }), null);
    assert.equal(checkPanelPlacement('load', { tabular: false, savedLayoutName: '' }), null);
});

test('checkWarnings words the money-in and line-count warnings per placement', () => {
    const summary = checkSummary([...rowsOf(28, 'in'), ...rowsOf(2, 'out')], []);
    assert.deepEqual(checkWarnings(summary, 'columns'), [
        'Almost every row is money in (28 of 30). If your bank shows spending as positive numbers, check the Direction column.',
    ]);
    const saved = checkWarnings(summary, 'saved');
    assert.equal(saved.length, 1);
    assert.match(saved[0], /^Almost every row is money in \(28 of 30\)\./);
    assert.match(saved[0], /Change columns/);
    assert.deepEqual(checkWarnings(summary, 'file'), []);

    const mismatch = checkSummary(rowsOf(3, 'out'), [], { fileLines: 42, tableRows: 31 });
    for (const placement of ['columns', 'saved', 'file']) {
        assert.deepEqual(checkWarnings(mismatch, placement), [
            'The file has 42 lines but 31 rows were read. Some lines may have been joined together; look for a stray quote mark.',
        ]);
    }
    assert.deepEqual(checkWarnings(checkSummary(rowsOf(3, 'out'), []), 'columns'), []);
});
