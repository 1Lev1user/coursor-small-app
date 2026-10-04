import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseDelimited,
    findHeaderRow,
    guessColumns,
    rowsToStatement,
} from '../src/import/text.js';
import { layoutFitsSample } from '../src/views/import.js';

function run(...amounts) {
    const text = [
        'Datums;Apraksts;Summa',
        ...amounts.map((amount, i) => `${13 + i}.09.2026;S${i};${amount}`),
    ].join('\n');
    const parsed = parseDelimited(text);
    const header = findHeaderRow(parsed.rows);
    const guess = guessColumns(parsed.rows[header], parsed.rows.slice(header + 1));
    const result = rowsToStatement(parsed.rows, header, {
        columns: guess.columns,
        decimalSeparator: guess.decimalSeparator,
        dateFormat: guess.dateFormat,
    });
    return { guess, result };
}

const cents = (result) => result.rows.map((t) => t.amountCents);

test('currency code after the amount: comma decimals are guessed', () => {
    const { guess, result } = run('-12,50 EUR', '-3,20 EUR');
    assert.equal(guess.decimalSeparator, ',');
    assert.deepEqual(cents(result), [1250, 320]);
    assert.deepEqual(result.rows.map((t) => t.direction), ['out', 'out']);
});

test('currency symbol, non-breaking space and space thousands after the amount', () => {
    const symbol = run('12,50 €', '1,00 €');
    assert.equal(symbol.guess.decimalSeparator, ',');
    assert.equal(symbol.result.rows[0].amountCents, 1250);
    assert.equal(symbol.result.rows[0].direction, 'in');

    const nbsp = run('-12,50\u00A0EUR', '-3,20\u00A0EUR');
    assert.equal(nbsp.guess.decimalSeparator, ',');
    assert.equal(nbsp.result.rows[0].amountCents, 1250);
    assert.equal(nbsp.result.rows[0].direction, 'out');

    const thousands = run('-1 234,56 EUR', '-3,20 EUR');
    assert.equal(thousands.guess.decimalSeparator, ',');
    assert.equal(thousands.result.rows[0].amountCents, 123456);
    assert.equal(thousands.result.rows[0].direction, 'out');
});

test('mixed column with a thousands dot is read with comma decimals', () => {
    const { guess, result } = run('-12,50 EUR', '-1.234,50 EUR');
    assert.equal(guess.decimalSeparator, ',');
    assert.deepEqual(cents(result), [1250, 123450]);
    assert.deepEqual(result.skipped, []);
});

test('no regression: dot decimals and leading currency forms', () => {
    const dots = run('-12.50 EUR', '-3.20 EUR');
    assert.equal(dots.guess.decimalSeparator, '.');
    assert.deepEqual(cents(dots.result), [1250, 320]);

    const code = run('EUR -12,50', 'EUR -3,20');
    assert.equal(code.guess.decimalSeparator, ',');
    assert.equal(code.result.rows[0].amountCents, 1250);

    const symbol = run('€12,50', '€3,20');
    assert.equal(symbol.guess.decimalSeparator, ',');
    assert.equal(symbol.result.rows[0].amountCents, 1250);
});

test('layoutFitsSample rejects a dot layout for amounts with a trailing currency', () => {
    const rows = [['13.09.2026', 'S0', '-12,50 EUR']];
    const layout = { dateFormat: 'DMY', columns: { date: 0, amount: 2 } };
    assert.equal(layoutFitsSample({ ...layout, decimalSeparator: '.' }, rows), false);
    assert.equal(layoutFitsSample({ ...layout, decimalSeparator: ',' }, rows), true);
});

test('a cell that decides nothing does not flip the guess', () => {
    const { guess, result } = run('-1,234 EUR', '-3,20 EUR');
    assert.equal(guess.decimalSeparator, ',');
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].line, 2);
    assert.equal(result.skipped[0].reason, 'unparsable amount');
    assert.deepEqual(cents(result), [320]);
});
