import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDelimited, findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';

function dataLines(suffix, count = 10) {
    const lines = [];
    for (let i = 1; i <= count; i += 1) {
        const day = String(i).padStart(2, '0');
        lines.push(`2026-03-${day};Shop ${i};-${i},00${suffix}`);
    }
    return lines;
}

function csvRows(lines) {
    return parseDelimited(lines.join('\n')).rows;
}

const PREAMBLE = ['Konts;LV00TEST', 'Periods;2026-03'];

test('header of 3 cells over data rows with a trailing ; (4 cells) is found', () => {
    const rows = csvRows(['Date;Description;Amount', ...dataLines(';')]);
    assert.equal(findHeaderRow(rows), 0);
});

test('header with a trailing ; (4 cells) over 3-cell data rows is found', () => {
    const rows = csvRows(['Date;Description;Amount;', ...dataLines('')]);
    assert.equal(findHeaderRow(rows), 0);
});

test('header of 3 cells over 4-cell data rows is found below two preamble lines', () => {
    const rows = csvRows([...PREAMBLE, 'Date;Description;Amount', ...dataLines(';')]);
    assert.equal(findHeaderRow(rows), 2);
});

test('header of 4 cells over 3-cell data rows is found below two preamble lines', () => {
    const rows = csvRows([...PREAMBLE, 'Date;Description;Amount;', ...dataLines('')]);
    assert.equal(findHeaderRow(rows), 2);
});

test('XLSX-shaped header of 4 over data rows trimmed to 3 cells is found', () => {
    const rows = [['Datums', 'Apraksts', 'Summa', 'Atsauce']];
    for (let i = 1; i <= 8; i += 1) {
        rows.push([`2026-09-0${i}`, 'RIMI', '-12,50']);
    }
    assert.equal(findHeaderRow(rows), 0);
});

test('XLSX-shaped split Debets/Kredits sheet (3-cell and 4-cell rows) has its header found', () => {
    const rows = [['Datums', 'Apraksts', 'Debets', 'Kredīts']];
    for (let i = 1; i <= 6; i += 1) {
        rows.push([`2026-09-0${i}`, 'RIMI', '12,50']);
    }
    for (let i = 7; i <= 10; i += 1) {
        const day = String(i).padStart(2, '0');
        rows.push([`2026-09-${day}`, 'Alga', '', '100,00']);
    }
    assert.equal(findHeaderRow(rows), 0);
});

test('a wide text-only preamble row is not taken as the header', () => {
    const rows = [
        ['Klients', 'Jānis Bērziņš', 'Konts', 'LV00TEST', '', '', '', ''],
        ['Datums', 'Apraksts', 'Debets', 'Kredīts', 'Valūta', 'Atsauce', 'Konts', 'Piezīmes'],
    ];
    for (let i = 1; i <= 5; i += 1) {
        rows.push([`2026-09-0${i}`, 'RIMI', '12,50', '', 'EUR', 'R1', 'LV1', 'x']);
    }
    assert.equal(findHeaderRow(rows), 1);
});

test('end to end: after a width mismatch the columns are guessed and every row is imported', () => {
    const rows = csvRows(['Date;Description;Amount', ...dataLines(';')]);
    const headerRow = findHeaderRow(rows);
    assert.equal(headerRow, 0);
    const guess = guessColumns(rows[headerRow], rows.slice(headerRow + 1, headerRow + 21));
    assert.ok(guess.columns.date >= 0);
    assert.ok(guess.columns.description >= 0);
    assert.ok(guess.columns.amount >= 0);
    const statement = rowsToStatement(rows, headerRow, {
        columns: { ...guess.columns },
        decimalSeparator: guess.decimalSeparator,
        dateFormat: guess.dateFormat,
    });
    assert.equal(statement.rows.length, 10);
    assert.equal(statement.skipped.length, 0);
});

test('controls: headerless data is -1 and a padded title line is not the header', () => {
    const headerless = parseDelimited(
        '17.09.2026\tCoffee Shop\t-4,50\tEUR\n18.09.2026\tSalary\t2500,00\tEUR\n19.09.2026\tPharmacy\t-12,90\tEUR\n',
    ).rows;
    assert.equal(findHeaderRow(headerless), -1);

    const titled = csvRows([
        'Konta izraksts;;;;',
        'Datums;Saņēmējs/Maksātājs;Apraksts;Summa;D/K',
        '02.09.2026;SIA Kārlis;Pirkums 1234;23,40;D',
        '05.09.2026;SIA Employer;Alga;2015,00;K',
    ]);
    assert.equal(findHeaderRow(titled), 1);
});

test('a date inside a preamble row does not move the header search above the real header', () => {
    const withPrintDate = csvRows(['Izdrukas datums;17.09.2026', 'Date;Description;Amount', ...dataLines('')]);
    assert.equal(findHeaderRow(withPrintDate), 1);

    const withTwoLines = csvRows(['Konts;LV1', 'Izdrukas datums;17.09.2026', 'Date;Description;Amount', ...dataLines('')]);
    assert.equal(findHeaderRow(withTwoLines), 2);
});
