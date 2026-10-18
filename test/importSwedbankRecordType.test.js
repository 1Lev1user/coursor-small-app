import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';
import { mergeSavedColumns } from '../src/views/import.js';

// Made-up Swedbank statements (LV, EE, LT). Account numbers, names and amounts are invented.
// Record type: 10 opening balance, 20 transaction, 82 turnover, 86 closing balance, 900 unknown.

/** Text -> guessed columns and statement, the same pipeline the import screen runs. */
function runText(text) {
    const { rows } = parseDelimited(text);
    const headerRow = findHeaderRow(rows);
    const guess = guessColumns(rows[headerRow] || [], rows.slice(headerRow + 1));
    const statement = rowsToStatement(rows, headerRow, {
        columns: guess.columns,
        dateFormat: guess.dateFormat,
        decimalSeparator: guess.decimalSeparator,
    });
    return { rows, headerRow, guess, statement };
}

const run = (...lines) => runText(lines.join('\n') + '\n');
const total = (statement, direction) => statement.rows
    .filter((r) => r.direction === direction && r.currency === 'EUR')
    .reduce((sum, r) => sum + r.amountCents, 0);

const LV_HEADER = 'Klienta konts;Ieraksta tips;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts;Arhīva kods;Maksājuma veids;Refernces numurs;Dokumenta numurs';
const LV_ROWS = [
    'LV00TEST0000000000001;10;01.09.2026;;Atlikums perioda sākumā;1000,00;EUR;K;;;;',
    'LV00TEST0000000000001;20;03.09.2026;SIA PARAUGS;Rēķins 5;250,00;EUR;D;2026090301A1;MAK;REF5;D100',
    'LV00TEST0000000000001;20;14.09.2026;Anna Paraugs;Alga;300,00;EUR;K;2026090402B2;MAK;;D101',
    'LV00TEST0000000000001;82;30.09.2026;;Apgrozījums;250,00;EUR;D;;;;',
    'LV00TEST0000000000001;82;30.09.2026;;Apgrozījums;300,00;EUR;K;;;;',
    'LV00TEST0000000000001;86;30.09.2026;;Rēķins;1050,00;EUR;K;;;;',
    'LV00TEST0000000000001;10;01.09.2026;;Atlikums perioda sākumā;50,00;USD;K;;;;',
    'LV00TEST0000000000001;20;05.09.2026;Example Inc;Subscription;12,00;USD;D;2026090501C3;MAK;;D102',
    'LV00TEST0000000000001;86;30.09.2026;;Atlikums perioda beigās;38,00;USD;K;;;;',
    'LV00TEST0000000000001;900;30.09.2026;;Cits ieraksts;5,00;EUR;D;;;;',
];

test('LV: only record type 20 rows import, the other codes are skipped as summary rows', () => {
    const { guess, statement } = run(LV_HEADER, ...LV_ROWS);

    assert.equal(guess.columns.recordType, 1);
    assert.equal(statement.rows.length, 3);
    assert.deepEqual(statement.rows.map((r) => r.direction), ['out', 'in', 'out']);
    assert.equal(total(statement, 'out'), 25000);
    assert.equal(total(statement, 'in'), 30000);

    const usd = statement.rows[2];
    assert.equal(usd.currency, 'USD');
    assert.equal(usd.originalAmountCents, 1200);
    assert.equal(usd.amountCents, null);

    // Data row n of LV_ROWS is file line n + 2 (header on line 1).
    assert.deepEqual(statement.skipped, [0, 3, 4, 5, 6, 8, 9].map((n) => ({ line: n + 2, reason: 'summary row' })));
});

test('LV: a closing balance row with a date and ordinary text is still skipped', () => {
    const { statement } = run(LV_HEADER, LV_ROWS[1], LV_ROWS[5]);

    assert.equal(statement.rows.length, 1);
    assert.deepEqual(statement.skipped, [{ line: 3, reason: 'summary row' }]);
});

test('LV: a blank code cell on a data row still imports', () => {
    const { statement } = run(LV_HEADER, LV_ROWS[1], 'LV00TEST0000000000001;;14.09.2026;Anna Paraugs;Alga;300,00;EUR;K;2026090402B2;MAK;;D101');

    assert.equal(statement.rows.length, 2);
    assert.equal(statement.skipped.length, 0);
});

test('EE: header "Reatüüp" is the record type column', () => {
    const { guess, statement } = run(
        'Reatüüp;Kuupäev;Saaja/Maksja;Selgitus;Summa;Valuuta;Deebet/Kreedit;Arhiveerimistunnus;Tehingu tüüp',
        '10;01.09.2026;;Algsaldo;100,00;EUR;K;;',
        '20;03.09.2026;OÜ NÄIDIS;Arve 7;25,50;EUR;D;A1;MK',
        '82;30.09.2026;;Käive;25,50;EUR;D;;',
        '86;30.09.2026;;Lõppsaldo;74,50;EUR;K;;',
    );

    assert.equal(guess.columns.recordType, 0);
    assert.equal(statement.rows.length, 1);
    assert.equal(statement.rows[0].direction, 'out');
    assert.equal(statement.rows[0].amountCents, 2550);
    assert.equal(statement.skipped.length, 3);
});

test('the headers "Kirje tüüp" and "Record type" are detected', () => {
    for (const name of ['Kirje tüüp', 'Record type']) {
        const { guess } = run(`${name};Date;Description;Amount;Debit/Credit`, '10;01.09.2026;Opening;100,00;C', '20;03.09.2026;Shop;25,50;D', '86;30.09.2026;Closing;74,50;C');
        assert.equal(guess.columns.recordType, 0, name);
    }
});

test('LT: an empty header cell holding only record codes is the record type column', () => {
    const { guess, statement } = run(
        '"","Data","Gavėjas","Paskirtis","Suma","Valiuta","D/K","Kodas",',
        '"10","2026-09-01","","Pradinis likutis","100.00","EUR","C","",',
        '"20","2026-09-03","UAB PAVYZDYS","Sąskaita 5","25.50","EUR","D","X1",',
        '"20","2026-09-04","Jonas Jonaitis","Alga","300.00","EUR","C","X2",',
        '"86","2026-09-30","","Galutinis likutis","374.50","EUR","C","",',
    );

    assert.equal(guess.columns.recordType, 0);
    assert.equal(statement.rows.length, 2);
    assert.equal(total(statement, 'out'), 2550);
    assert.equal(total(statement, 'in'), 30000);
    assert.equal(statement.skipped.length, 2);
});

test('files without a record type column are unchanged', () => {
    const cases = {
        'LV rows without the column': [
            'Klienta konts;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts',
            'LV00TEST0000000000001;03.09.2026;SIA PARAUGS;Rēķins 5;25,00;EUR;D',
            'LV00TEST0000000000001;14.09.2026;Anna Paraugs;Alga;300,00;EUR;K',
        ],
        'Amount column of 10/20/10': [
            'Date;Description;Amount',
            '01.09.2026;a;10', '02.09.2026;b;20', '03.09.2026;c;10',
        ],
        'payment kind column of 20/10': [
            'Datums;Apraksts;Summa;Maksājuma veids',
            '01.09.2026;a;10,50;20', '02.09.2026;b;20,25;10', '03.09.2026;c;5,00;20',
        ],
        'Record type column with text': [
            'Date;Record type;Amount;Description',
            '01.09.2026;CARD;10,50;x', '02.09.2026;TOPUP;20,25;y',
        ],
        'blank header but no money column': [
            'Datums;Apraksts;',
            '01.09.2026;a;10', '02.09.2026;b;20', '03.09.2026;c;10',
        ],
    };
    for (const [name, lines] of Object.entries(cases)) {
        const { guess, statement } = run(...lines);
        assert.equal('recordType' in guess.columns, false, name);
        assert.equal(statement.skipped.length, 0, name);
        assert.equal(statement.rows.length, lines.length - 1, name);
    }
});

test('a file without a header row gets no record type', () => {
    const guess = guessColumns([], [['01.09.2026', 'a', '10,50', '20'], ['02.09.2026', 'b', '20,25', '10']]);

    assert.equal('recordType' in guess.columns, false);
});

test('a saved layout from before keeps the guessed record type', () => {
    const { rows, headerRow, guess } = run(LV_HEADER, ...LV_ROWS);
    const { recordType, ...oldSaved } = guess.columns;
    assert.equal(recordType, 1);

    const merged = mergeSavedColumns(guess.columns, oldSaved);
    assert.equal(merged.recordType, 1);

    const statement = rowsToStatement(rows, headerRow, {
        columns: merged,
        dateFormat: guess.dateFormat,
        decimalSeparator: guess.decimalSeparator,
    });
    assert.equal(statement.rows.length, 3);
});

test('a saved layout that reads the record type column for another field ignores the record type', () => {
    const rows = [
        ['Date', 'Description', 'Code'],
        ['01.09.2026', 'a', '20'],
        ['02.09.2026', 'b', '10'],
        ['03.09.2026', 'c', '86'],
    ];
    const statement = rowsToStatement(rows, 0, {
        columns: { date: 0, description: 1, amount: 2, recordType: 2 },
        dateFormat: 'DMY',
        decimalSeparator: ',',
    });

    assert.equal(statement.rows.length, 3);
    assert.equal(statement.skipped.length, 0);
});
