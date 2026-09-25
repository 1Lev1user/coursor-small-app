import test from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeBytes,
    parseDelimited,
    findHeaderRow,
    guessColumns,
    inferDateFormat,
    parseDateWith,
    parseAmountWith,
    rowsToStatement,
    parsePasted,
    isDirectionValue,
} from '../src/import/text.js';

function utf16Bytes(str, littleEndian) {
    const bytes = littleEndian ? [0xff, 0xfe] : [0xfe, 0xff];
    for (const ch of str) {
        const code = ch.codePointAt(0);
        if (littleEndian) {
            bytes.push(code & 0xff, (code >> 8) & 0xff);
        } else {
            bytes.push((code >> 8) & 0xff, code & 0xff);
        }
    }
    return new Uint8Array(bytes);
}

// --- decodeBytes ---

test('decodeBytes decodes plain UTF-8', () => {
    const bytes = new TextEncoder().encode('Ordinary text 12.50');
    const result = decodeBytes(bytes);
    assert.equal(result.text, 'Ordinary text 12.50');
    assert.equal(result.encoding, 'utf-8');
});

test('decodeBytes strips a UTF-8 BOM', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Datums;Summa')]);
    const result = decodeBytes(withBom);
    assert.equal(result.text, 'Datums;Summa');
    assert.equal(result.encoding, 'utf-8');
});

test('decodeBytes decodes UTF-16LE with BOM', () => {
    const result = decodeBytes(utf16Bytes('Datums;Summa', true));
    assert.equal(result.text, 'Datums;Summa');
    assert.equal(result.encoding, 'utf-16le');
});

test('decodeBytes decodes UTF-16BE with BOM', () => {
    const result = decodeBytes(utf16Bytes('Datums;Summa', false));
    assert.equal(result.text, 'Datums;Summa');
    assert.equal(result.encoding, 'utf-16be');
});

test('Node 22 TextDecoder supports the windows-1257 label', () => {
    assert.doesNotThrow(() => new TextDecoder('windows-1257', { fatal: true }));
});

test('decodeBytes falls back to windows-1257 for non UTF-8 Baltic bytes', () => {
    const bytes = new Uint8Array([0xc2, 0x20, 0xe7, 0x20, 0xf0]);
    const result = decodeBytes(bytes);
    assert.equal(result.text, 'Ā ē š');
    assert.equal(result.encoding, 'windows-1257');
});

test('decodeBytes falls back to windows-1252 when windows-1257 is unsupported', () => {
    const bytes = new Uint8Array([0xc2, 0x20, 0xe7, 0x20, 0xf0]);
    const OriginalTextDecoder = globalThis.TextDecoder;

    class StubTextDecoder {
        constructor(label, options) {
            if (label === 'windows-1257') {
                throw new RangeError('unsupported label');
            }
            return new OriginalTextDecoder(label, options);
        }
    }

    globalThis.TextDecoder = StubTextDecoder;
    try {
        const result = decodeBytes(bytes);
        assert.equal(result.encoding, 'windows-1252');
        assert.equal(typeof result.text, 'string');
    } finally {
        globalThis.TextDecoder = OriginalTextDecoder;
    }
});

// --- parseDelimited ---

test('parseDelimited detects semicolon delimiter over decimal commas', () => {
    const text = [
        'Konts;LV11HABA0000123456789',
        'Periods;01.04.2026 - 30.04.2026',
        '',
        'Datums;Apraksts;Summa;Valūta;D/K',
        '13.04.2026;RIMI MINI 1234 RIGA;12,50;EUR;D',
        '20.04.2026;Alga SIA Uznemums;1500,00;EUR;K',
    ].join('\r\n');

    const { delimiter, rows } = parseDelimited(text);
    assert.equal(delimiter, ';');
    assert.equal(rows.length, 5);
    assert.deepEqual(rows[3], ['13.04.2026', 'RIMI MINI 1234 RIGA', '12,50', 'EUR', 'D']);
});

test('parseDelimited detects comma delimiter', () => {
    const text = 'Started Date,Completed Date,Description,Amount,Currency\n2026-09-17 10:22:05,2026-09-17 10:22:10,Coffee Shop,-4.50,EUR\n';
    const { delimiter, rows } = parseDelimited(text);
    assert.equal(delimiter, ',');
    assert.equal(rows.length, 2);
});

test('parseDelimited detects tab delimiter for pasted text', () => {
    const text = '17.09.2026\tCoffee Shop\t-4,50\tEUR\n18.09.2026\tSalary\t2500,00\tEUR\n19.09.2026\tPharmacy\t-12,90\tEUR\n';
    const { delimiter, rows } = parseDelimited(text);
    assert.equal(delimiter, '\t');
    assert.equal(rows.length, 3);
});

test('parseDelimited trims a trailing empty line', () => {
    const text = 'a;b\n1;2\n';
    const { rows } = parseDelimited(text);
    assert.equal(rows.length, 2);
});

test('parseDelimited handles a quoted field containing the delimiter and a newline', () => {
    const text = 'Datums;Apraksts;Summa\n13.04.2026;"Coffee; extra note\nsecond line";12,50\n';
    const { delimiter, rows } = parseDelimited(text);
    assert.equal(delimiter, ';');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], ['13.04.2026', 'Coffee; extra note\nsecond line', '12,50']);
});

test('parseDelimited unescapes doubled quotes', () => {
    const text = 'a;b\n1;"She said ""hi"""\n';
    const { rows } = parseDelimited(text);
    assert.deepEqual(rows[1], ['1', 'She said "hi"']);
});

// --- findHeaderRow ---

test('findHeaderRow skips bank preamble lines', () => {
    const text = [
        'Konts;LV11HABA0000123456789',
        'Periods;01.04.2026 - 30.04.2026',
        'Datums;Apraksts;Summa;Valūta;D/K',
        '13.04.2026;RIMI MINI 1234 RIGA;12,50;EUR;D',
        '20.04.2026;Alga SIA Uznemums;1500,00;EUR;K',
    ].join('\n');

    const { rows } = parseDelimited(text);
    assert.equal(findHeaderRow(rows), 2);
});

test('findHeaderRow returns -1 for headerless pasted data', () => {
    const text = '17.09.2026\tCoffee Shop\t-4,50\tEUR\n18.09.2026\tSalary\t2500,00\tEUR\n19.09.2026\tPharmacy\t-12,90\tEUR\n';
    const { rows } = parseDelimited(text);
    assert.equal(findHeaderRow(rows), -1);
});

test('parsePasted returns headerRow -1 when there is no header', () => {
    const text = '17.09.2026\tCoffee Shop\t-4,50\tEUR\n18.09.2026\tSalary\t2500,00\tEUR\n';
    const result = parsePasted(text);
    assert.equal(result.delimiter, '\t');
    assert.equal(result.headerRow, -1);
});

// --- inferDateFormat ---

test('inferDateFormat returns null when no value in the column decides', () => {
    assert.equal(inferDateFormat(['01.02.2026', '03.04.2026', '05.06.2026']), null);
});

test('inferDateFormat decides DMY when a day part exceeds 12', () => {
    assert.equal(inferDateFormat(['01.02.2026', '25.12.2026']), 'DMY');
});

test('inferDateFormat decides MDY when a month-position part exceeds 12', () => {
    assert.equal(inferDateFormat(['01/02/2026', '09/25/2026']), 'MDY');
});

test('inferDateFormat decides YMD from a 4-digit leading year', () => {
    assert.equal(inferDateFormat(['2026-09-17', '2026-09-18']), 'YMD');
});

test('inferDateFormat returns null for an empty column', () => {
    assert.equal(inferDateFormat([]), null);
});

// --- parseDateWith ---

test('parseDateWith parses DMY with dot separators', () => {
    assert.equal(parseDateWith('13.04.2026', 'DMY'), '2026-04-13');
});

test('parseDateWith parses MDY with slash separators', () => {
    assert.equal(parseDateWith('09/25/2026', 'MDY'), '2026-09-25');
});

test('parseDateWith assumes 20xx for a 2-digit year', () => {
    assert.equal(parseDateWith('13.04.26', 'DMY'), '2026-04-13');
});

test('parseDateWith parses ISO with a time part', () => {
    assert.equal(parseDateWith('2026-09-17 10:22', 'YMD'), '2026-09-17');
});

test('parseDateWith parses ISO with seconds', () => {
    assert.equal(parseDateWith('2026-09-17T10:22:05', 'YMD'), '2026-09-17');
});

test('parseDateWith rejects an impossible calendar date', () => {
    assert.equal(parseDateWith('31.02.2026', 'DMY'), null);
});

test('parseDateWith rejects unparseable text', () => {
    assert.equal(parseDateWith('not a date', 'DMY'), null);
});

// --- parseAmountWith ---

test('parseAmountWith handles space thousands with comma decimal', () => {
    assert.equal(parseAmountWith('1 234,56', ','), 123456);
});

test('parseAmountWith handles dot thousands with comma decimal', () => {
    assert.equal(parseAmountWith('1.234,56', ','), 123456);
});

test('parseAmountWith handles comma thousands with dot decimal', () => {
    assert.equal(parseAmountWith('1,234.56', '.'), 123456);
});

test('parseAmountWith handles a leading minus', () => {
    assert.equal(parseAmountWith('-12,40', ','), -1240);
});

test('parseAmountWith handles a trailing minus', () => {
    assert.equal(parseAmountWith('12,40-', ','), -1240);
});

test('parseAmountWith handles parentheses as negative', () => {
    assert.equal(parseAmountWith('(12.40)', '.'), -1240);
});

test('parseAmountWith handles a leading plus', () => {
    assert.equal(parseAmountWith('+5', '.'), 500);
});

test('parseAmountWith handles a euro symbol prefix', () => {
    assert.equal(parseAmountWith('€ 12,40', ','), 1240);
});

test('parseAmountWith handles a currency code prefix', () => {
    assert.equal(parseAmountWith('EUR 12.40', '.'), 1240);
});

test('parseAmountWith handles a non-breaking space thousands separator', () => {
    assert.equal(parseAmountWith('1 234,56', ','), 123456);
});

test('parseAmountWith rejects more than two fraction digits', () => {
    assert.equal(parseAmountWith('12.345', '.'), null);
});

test('parseAmountWith rejects non numeric text', () => {
    assert.equal(parseAmountWith('n/a', '.'), null);
});

test('parseAmountWith rejects an empty string', () => {
    assert.equal(parseAmountWith('', '.'), null);
});

// --- guessColumns: layout 1, Swedbank-like ---

test('guessColumns maps a Swedbank-like semicolon layout with decimal commas', () => {
    const header = ['Datums', 'Apraksts', 'Summa', 'Valūta', 'D/K'];
    const sampleRows = [
        ['13.04.2026', 'RIMI MINI 1234 RIGA', '12,50', 'EUR', 'D'],
        ['20.04.2026', 'Alga SIA Uznemums', '1500,00', 'EUR', 'K'],
        ['30.04.2026', 'Kopā', '1487,50', 'EUR', 'D'],
    ];

    const result = guessColumns(header, sampleRows);
    assert.deepEqual(result.columns, {
        date: 0, amount: 2, description: 1, currency: 3, direction: 4, debit: -1, credit: -1, bankRef: -1,
    });
    assert.equal(result.dateFormat, 'DMY');
    assert.equal(result.decimalSeparator, ',');
    assert.equal(result.confidence, 1);
});

// --- guessColumns: layout 2, SEB-like with separate debit/credit ---

test('guessColumns maps separate debit and credit columns', () => {
    const header = ['Datums', 'Detaļas', 'Debets', 'Kredīts', 'Valūta'];
    const sampleRows = [
        ['15.05.2026', 'Parking fee', '5.00', '', 'EUR'],
        ['16.05.2026', 'Salary', '', '2000.00', 'EUR'],
    ];

    const result = guessColumns(header, sampleRows);
    assert.equal(result.columns.date, 0);
    assert.equal(result.columns.description, 1);
    assert.equal(result.columns.debit, 2);
    assert.equal(result.columns.credit, 3);
    assert.equal(result.columns.currency, 4);
    assert.equal(result.columns.amount, -1);
    assert.equal(result.decimalSeparator, '.');
    assert.equal(result.dateFormat, 'DMY');
});

// --- guessColumns: layout 3, Revolut-like ISO datetime ---

test('guessColumns maps a Revolut-like comma layout with ISO datetimes', () => {
    const header = ['Started Date', 'Completed Date', 'Description', 'Amount', 'Currency'];
    const sampleRows = [
        ['2026-09-17 10:22:05', '2026-09-17 10:22:10', 'Coffee Shop', '-4.50', 'EUR'],
        ['2026-09-18 09:00:00', '2026-09-18 09:00:05', 'Salary', '2500.00', 'EUR'],
    ];

    const result = guessColumns(header, sampleRows);
    assert.equal(result.columns.date, 0);
    assert.equal(result.columns.amount, 3);
    assert.equal(result.columns.description, 2);
    assert.equal(result.columns.currency, 4);
    assert.equal(result.dateFormat, 'YMD');
    assert.equal(result.decimalSeparator, '.');
});

// --- guessColumns: layout 4, pasted tab-separated text without a header ---

test('guessColumns falls back to content matching for headerless pasted text', () => {
    const sampleRows = [
        ['17.09.2026', 'Coffee Shop', '-4,50', 'EUR'],
        ['18.09.2026', 'Salary', '2500,00', 'EUR'],
        ['19.09.2026', 'Pharmacy', '-12,90', 'EUR'],
    ];

    const result = guessColumns([], sampleRows);
    assert.equal(result.columns.date, 0);
    assert.equal(result.columns.amount, 2);
    assert.equal(result.columns.description, 1);
    assert.equal(result.dateFormat, 'DMY');
    assert.equal(result.decimalSeparator, ',');
});

// --- rowsToStatement ---

test('rowsToStatement builds rows from a Swedbank-like layout and skips the summary row', () => {
    const text = [
        'Konts;LV11HABA0000123456789',
        'Periods;01.04.2026 - 30.04.2026',
        'Datums;Apraksts;Summa;Valūta;D/K',
        '13.04.2026;RIMI MINI 1234 RIGA;12,50;EUR;D',
        '20.04.2026;Alga SIA Uznemums;1500,00;EUR;K',
        '30.04.2026;Kopā;1487,50;EUR;D',
    ].join('\n');

    const { rows } = parseDelimited(text);
    const headerRow = findHeaderRow(rows);
    assert.equal(headerRow, 2);

    const layout = {
        delimiter: ';',
        decimalSeparator: ',',
        dateFormat: 'DMY',
        columns: { date: 0, amount: 2, description: 1, currency: 3, direction: 4, debit: -1, credit: -1, bankRef: -1 },
    };

    const result = rowsToStatement(rows, headerRow, layout);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows[0], {
        date: '2026-04-13',
        amountCents: 1250,
        direction: 'out',
        currency: 'EUR',
        originalAmountCents: 1250,
        description: 'RIMI MINI 1234 RIGA',
        counterparty: '',
        bankRef: '',
    });
    assert.equal(result.rows[1].direction, 'in');
    assert.equal(result.rows[1].amountCents, 150000);
    assert.deepEqual(result.skipped, [{ line: 6, reason: 'summary row' }]);
});

test('rowsToStatement uses separate debit and credit columns for direction', () => {
    const rows = [
        ['Datums', 'Detaļas', 'Debets', 'Kredīts', 'Valūta'],
        ['15.05.2026', 'Parking fee', '5.00', '', 'EUR'],
        ['16.05.2026', 'Salary', '', '2000.00', 'EUR'],
    ];
    const layout = {
        decimalSeparator: '.',
        dateFormat: 'DMY',
        columns: { date: 0, amount: -1, description: 1, currency: 4, direction: -1, debit: 2, credit: 3, bankRef: -1 },
    };

    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].direction, 'out');
    assert.equal(result.rows[0].amountCents, 500);
    assert.equal(result.rows[1].direction, 'in');
    assert.equal(result.rows[1].amountCents, 200000);
    assert.equal(result.skipped.length, 0);
});

test('rowsToStatement parses Revolut-like ISO datetimes and signed amounts', () => {
    const rows = [
        ['Started Date', 'Completed Date', 'Description', 'Amount', 'Currency'],
        ['2026-09-17 10:22:05', '2026-09-17 10:22:10', 'Coffee Shop', '-4.50', 'EUR'],
        ['2026-09-18 09:00:00', '2026-09-18 09:00:05', 'Salary', '2500.00', 'EUR'],
    ];
    const layout = {
        decimalSeparator: '.',
        dateFormat: 'YMD',
        columns: { date: 0, amount: 3, description: 2, currency: 4, direction: -1, debit: -1, credit: -1, bankRef: -1 },
    };

    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].date, '2026-09-17');
    assert.equal(result.rows[0].direction, 'out');
    assert.equal(result.rows[0].amountCents, 450);
    assert.equal(result.rows[1].direction, 'in');
    assert.equal(result.rows[1].amountCents, 250000);
});

test('rowsToStatement builds rows from headerless pasted content via content-guessed columns', () => {
    const text = '17.09.2026\tCoffee Shop\t-4,50\tEUR\n18.09.2026\tSalary\t2500,00\tEUR\n19.09.2026\tPharmacy\t-12,90\tEUR\n';
    const parsed = parsePasted(text);
    assert.equal(parsed.headerRow, -1);

    const guessed = guessColumns([], parsed.rows);
    const layout = {
        decimalSeparator: guessed.decimalSeparator,
        dateFormat: guessed.dateFormat,
        columns: guessed.columns,
    };

    const result = rowsToStatement(parsed.rows, parsed.headerRow, layout);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows.map((row) => row.currency), ['EUR', 'EUR', 'EUR']);
    assert.deepEqual(result.rows.map((row) => row.direction), ['out', 'in', 'out']);
    assert.deepEqual(result.rows.map((row) => row.date), ['2026-09-17', '2026-09-18', '2026-09-19']);
});

test('rowsToStatement skips rows with an unparsable date', () => {
    const rows = [
        ['Datums', 'Apraksts', 'Summa'],
        ['not a date', 'Something', '12,50'],
        ['13.04.2026', 'Coffee', '4,00'],
    ];
    const layout = {
        decimalSeparator: ',',
        dateFormat: 'DMY',
        columns: { date: 0, amount: 2, description: 1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1 },
    };

    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.skipped, [{ line: 2, reason: 'unparsable date' }]);
});

test('rowsToStatement skips rows with an unparsable amount', () => {
    const rows = [
        ['Datums', 'Apraksts', 'Summa'],
        ['13.04.2026', 'Something', 'n/a'],
        ['14.04.2026', 'Coffee', '4,00'],
    ];
    const layout = {
        decimalSeparator: ',',
        dateFormat: 'DMY',
        columns: { date: 0, amount: 2, description: 1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1 },
    };

    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.skipped, [{ line: 2, reason: 'unparsable amount' }]);
});

test('rowsToStatement skips Russian and generic summary rows', () => {
    const rows = [
        ['Datums', 'Apraksts', 'Summa'],
        ['30.04.2026', 'Итого', '100,00'],
        ['30.04.2026', 'Opening balance', '500,00'],
        ['30.04.2026', 'Closing balance', '600,00'],
        ['13.04.2026', 'Coffee', '4,00'],
    ];
    const layout = {
        decimalSeparator: ',',
        dateFormat: 'DMY',
        columns: { date: 0, amount: 2, description: 1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1 },
    };

    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows.length, 1);
    assert.equal(result.skipped.length, 3);
    assert.ok(result.skipped.every((entry) => entry.reason === 'summary row'));
});

test('rowsToStatement defaults currency to EUR when there is no currency column', () => {
    const rows = [
        ['Datums', 'Apraksts', 'Summa'],
        ['13.04.2026', 'Coffee', '4,00'],
    ];
    const layout = {
        decimalSeparator: ',',
        dateFormat: 'DMY',
        columns: { date: 0, amount: 2, description: 1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1 },
    };

    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows[0].currency, 'EUR');
});

test('rowsToStatement reads a bank reference column', () => {
    const rows = [
        ['Date', 'Description', 'Amount', 'Reference'],
        ['13.04.2026', 'Coffee', '4.00', 'TXN-99881'],
    ];
    const layout = {
        decimalSeparator: '.',
        dateFormat: 'DMY',
        columns: { date: 0, amount: 2, description: 1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: 3 },
    };

    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows[0].bankRef, 'TXN-99881');
});

// --- direction columns, foreign currency and summary rows ---

test('guessColumns treats a Debets/Kredīts column of D/K letters as the direction', () => {
    const header = ['Klienta konts', 'Ieraksta tips', 'Datums', 'Informācija saņēmējam', 'Summa', 'Valūta', 'Debets/Kredīts'];
    const sampleRows = [
        ['LV12', '20', '03.08.2026', 'RIMI MINI 17 RĪGA', '23,45', 'EUR', 'D'],
        ['LV12', '20', '15.08.2026', 'Alga par jūliju', '1850,00', 'EUR', 'K'],
    ];
    const result = guessColumns(header, sampleRows);
    assert.equal(result.columns.direction, 6);
    assert.equal(result.columns.debit, -1);
    assert.equal(result.columns.credit, -1);
    assert.equal(result.columns.amount, 4);
});

test('guessColumns treats a combined Debit/Credit column of C/D letters as the direction', () => {
    const header = ['Date', 'Details', 'Amount', 'Debit/Credit'];
    const sampleRows = [['03.08.2026', 'Shop', '10.00', 'D'], ['04.08.2026', 'Salary', '900.00', 'C']];
    const result = guessColumns(header, sampleRows);
    assert.equal(result.columns.direction, 3);
    assert.equal(result.columns.debit, -1);
});

test('guessColumns does not take a Revolut Type column as the direction', () => {
    const header = ['Type', 'Product', 'Started Date', 'Description', 'Amount', 'Currency'];
    const sampleRows = [
        ['CARD_PAYMENT', 'Current', '2026-09-02 08:14:22', 'Lidl', '-18.27', 'EUR'],
        ['TOPUP', 'Current', '2026-09-01 12:00:00', 'Top-up', '500.00', 'EUR'],
        ['EXCHANGE', 'Current', '2026-09-03 12:00:00', 'Exchanged to USD', '-20.00', 'EUR'],
        ['TRANSFER', 'Current', '2026-09-04 12:00:00', 'To Savings', '-100.00', 'EUR'],
    ];
    const result = guessColumns(header, sampleRows);
    assert.equal(result.columns.direction, -1);
    assert.equal(result.columns.amount, 4);
});

test('guessColumns finds an unnamed direction column by its D/K values', () => {
    const sampleRows = [['03.08.2026', 'Shop', '10,00', 'D'], ['04.08.2026', 'Salary', '900,00', 'K']];
    const result = guessColumns([], sampleRows);
    assert.equal(result.columns.direction, 3);
});

test('isDirectionValue accepts D/C/K letters and debit/credit words only', () => {
    for (const value of ['D', 'k', ' C ', 'Debets', 'Kredīts', 'CRDT', 'Дебет']) {
        assert.equal(isDirectionValue(value), true, value);
    }
    for (const value of ['CARD_PAYMENT', 'TOPUP', 'TRANSFER', 'EXCHANGE', '20', '']) {
        assert.equal(isDirectionValue(value), false, value);
    }
});

const FOREIGN_LAYOUT = {
    decimalSeparator: '.',
    dateFormat: 'YMD',
    columns: { date: 0, amount: 2, description: 1, currency: 3, direction: -1, debit: -1, credit: -1, bankRef: -1 },
};

test('rowsToStatement leaves the EUR amount empty for a foreign-currency row', () => {
    const rows = [
        ['Date', 'Description', 'Amount', 'Currency'],
        ['2026-09-10', 'Amazon.com', '-50.00', 'USD'],
        ['2026-09-11', 'Lidl', '-12.00', 'EUR'],
    ];
    const result = rowsToStatement(rows, 0, FOREIGN_LAYOUT);
    assert.equal(result.rows[0].currency, 'USD');
    assert.equal(result.rows[0].amountCents, null);
    assert.equal(result.rows[0].originalAmountCents, 5000);
    assert.equal(result.rows[0].direction, 'out');
    assert.equal(result.rows[1].amountCents, 1200);
    assert.equal(result.rows[1].originalAmountCents, 1200);
});

test('rowsToStatement takes the EUR amount from a mapped EUR column for foreign rows', () => {
    const rows = [
        ['Date', 'Description', 'Amount', 'Currency', 'Amount EUR'],
        ['2026-09-10', 'Amazon.com', '-50.00', 'USD', '-46.20'],
        ['2026-09-12', 'Hotel', '-80.00', 'GBP', ''],
    ];
    const layout = { ...FOREIGN_LAYOUT, columns: { ...FOREIGN_LAYOUT.columns, eurAmount: 4 } };
    const result = rowsToStatement(rows, 0, layout);
    assert.equal(result.rows[0].amountCents, 4620);
    assert.equal(result.rows[0].originalAmountCents, 5000);
    assert.equal(result.rows[1].amountCents, null);
});

test('rowsToStatement keeps merchants whose name contains a summary word', () => {
    const rows = [
        ['Datums', 'Apraksts', 'Summa'],
        ['13.04.2026', 'TotalEnergies Riga', '-40,00'],
        ['14.04.2026', 'Saldo Bakery', '-3,20'],
        ['30.04.2026', 'Sākuma saldo', '500,00'],
        ['30.04.2026', 'Apgrozījums kopā', '100,00'],
        ['', 'Total', '100,00'],
        ['', 'Kopā par periodu 1234', '100,00'],
    ];
    const layout = {
        decimalSeparator: ',',
        dateFormat: 'DMY',
        columns: { date: 0, amount: 2, description: 1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1 },
    };
    const result = rowsToStatement(rows, 0, layout);
    assert.deepEqual(result.rows.map((row) => row.description), ['TotalEnergies Riga', 'Saldo Bakery']);
    assert.equal(result.skipped.length, 4);
    assert.ok(result.skipped.every((entry) => entry.reason === 'summary row'));
});

test('amount signs survive currency marks, real minus signs and DR/CR marks', () => {
    assert.equal(parseAmountWith('€ -12.50', '.'), -1250);
    assert.equal(parseAmountWith('EUR -12.50', '.'), -1250);
    assert.equal(parseAmountWith('−12.50', '.'), -1250);
    assert.equal(parseAmountWith('–12,50', ','), -1250);
    assert.equal(parseAmountWith('12.50 DR', '.'), -1250);
    assert.equal(parseAmountWith('12,50 D', ','), -1250);
    assert.equal(parseAmountWith('12.50 CR', '.'), 1250);
    assert.equal(parseAmountWith('12.40 EUR', '.'), 1240);
});

test('a payer reference column is not taken as the bank transaction id', () => {
    const { columns } = guessColumns(
        ['Date', 'Payee', 'Reference', 'Amount'],
        [['01.09.2026', 'Landlord', 'RENT', '-500.00']],
    );
    assert.equal(columns.bankRef, -1);
    const withId = guessColumns(
        ['Datums', 'Apraksts', 'Summa', 'Arhīva kods'],
        [['01.09.2026', 'Rimi', '-5,00', 'A123']],
    );
    assert.equal(withId.columns.bankRef, 3);
});

test('a value date column is never the amount', () => {
    const { columns } = guessColumns(
        ['Booking date', 'Value date', 'Amount', 'Details'],
        [['01.09.2026', '02.09.2026', '-12.50', 'Coffee']],
    );
    assert.equal(columns.amount, 2);
});

test('Cyrillic direction values set the direction and zero amounts are skipped', () => {
    const rows = [
        ['Дата', 'Описание', 'Сумма', 'Тип'],
        ['01.09.2026', 'RIMI', '12,00', 'Д'],
        ['02.09.2026', 'SALARY', '900,00', 'КРЕДИТ'],
        ['03.09.2026', 'HOLD', '0,00', 'Д'],
    ];
    const layout = {
        delimiter: ';',
        decimalSeparator: ',',
        dateFormat: 'DMY',
        columns: { date: 0, description: 1, amount: 2, direction: 3, currency: -1, debit: -1, credit: -1, bankRef: -1 },
    };
    const result = rowsToStatement(rows, 0, layout);
    assert.deepEqual(result.rows.map(({ description, direction }) => `${description}:${direction}`), ['RIMI:out', 'SALARY:in']);
    assert.equal(result.skipped[0].reason, 'zero amount');
});

test('a title line padded with delimiters is not taken as the header', () => {
    const { rows } = parseDelimited([
        'Konta izraksts;;;;',
        'Datums;Saņēmējs/Maksātājs;Apraksts;Summa;D/K',
        '02.09.2026;SIA Kārlis;Pirkums 1234;23,40;D',
        '05.09.2026;SIA Employer;Alga;2015,00;K',
    ].join('\n'));
    assert.equal(findHeaderRow(rows), 1);
});
