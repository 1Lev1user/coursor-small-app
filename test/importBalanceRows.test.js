import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, rowsToStatement } from '../src/import/text.js';

/** Helper to build a columns object with all indices set to -1, then apply overrides. */
function columns(overrides = {}) {
    return {
        date: -1,
        amount: -1,
        description: -1,
        currency: -1,
        direction: -1,
        debit: -1,
        credit: -1,
        bankRef: -1,
        ...overrides,
    };
}

/** Helper to parse delimited lines and convert to statement. */
function read(lines, layout) {
    const text = lines.join('\n');
    const parsed = parseDelimited(text);
    return rowsToStatement(parsed.rows, 0, layout);
}

// Test 1: case 1 - label in Partneris column (index 1), Description at index 2
test('case 1: balance rows with label in non-description column (Partneris)', () => {
    const lines = [
        'Datums;Partneris;Apraksts;Summa;Debets/Kredīts',
        '01.09.2026;Sākuma atlikums;;1000,00;K',
        '03.09.2026;SIA RIMI;Pirkums;12,50;D',
        '30.09.2026;Beigu atlikums;;1887,50;K',
    ];

    const layout = {
        columns: columns({
            date: 0,
            description: 2,
            amount: 3,
            direction: 4,
        }),
        decimalSeparator: ',',
        dateFormat: 'DMY',
    };

    const result = read(lines, layout);

    // Only SIA RIMI transaction imported (12,50 = 1250 cents, direction D = out)
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].description, 'Pirkums');
    assert.equal(result.rows[0].amountCents, 1250);
    assert.equal(result.rows[0].direction, 'out');

    // Lines 2 and 4 skipped as summary rows
    assert.deepEqual(result.skipped, [
        { line: 2, reason: 'summary row' },
        { line: 4, reason: 'summary row' },
    ]);
});

// Test 2: case 2 - unlisted wording in Description column (beigās, beigas)
test('case 2: balance rows with variants of summary words in Description', () => {
    const lines = [
        'Datums;Partneris;Apraksts;Summa;Debets/Kredīts',
        '30.09.2026;Atlikums perioda beigās;;987,50;K',
        '30.09.2026;Atlikums perioda beigas;;987,50;K',
        '03.09.2026;SIA RIMI;Pirkums;12,50;D',
    ];

    const layout = {
        columns: columns({
            date: 0,
            description: 2,
            amount: 3,
            direction: 4,
        }),
        decimalSeparator: ',',
        dateFormat: 'DMY',
    };

    const result = read(lines, layout);

    // Only SIA RIMI imported
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].description, 'Pirkums');

    // Lines 2 and 3 skipped as summary rows
    assert.deepEqual(result.skipped, [
        { line: 2, reason: 'summary row' },
        { line: 3, reason: 'summary row' },
    ]);
});

// Test 3: case 3 - ISO dates, label in Type column, empty Description
test('case 3: closing balance with label in Type column, empty Description (YMD)', () => {
    const lines = [
        'Date;Type;Description;Amount',
        '2026-03-31;Closing balance;;1234,56',
        '2026-03-12;Card;Coffee;-4,00',
    ];

    const layout = {
        columns: columns({
            date: 0,
            description: 2,
            amount: 3,
        }),
        decimalSeparator: ',',
        dateFormat: 'YMD',
    };

    const result = read(lines, layout);

    // Only Coffee imported
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].description, 'Coffee');

    // Line 2 (Closing balance) skipped
    assert.deepEqual(result.skipped, [
        { line: 2, reason: 'summary row' },
    ]);
});

// Test 4: case 4 - brought, forward, carried qualifiers
test('case 4: balance rows with "brought", "forward", "carried" qualifiers', () => {
    const lines = [
        'Date;Type;Description;Amount',
        '2026-03-31;Closing balance;Account EE01;1234,56',
        '2026-03-01;Info;Balance brought forward;1234,56',
        '2026-03-01;Info;Balance carried forward;1234,56',
    ];

    const layout = {
        columns: columns({
            date: 0,
            description: 2,
            amount: 3,
        }),
        decimalSeparator: ',',
        dateFormat: 'YMD',
    };

    const result = read(lines, layout);

    // No rows imported
    assert.equal(result.rows.length, 0);

    // All 3 lines skipped as summary rows
    assert.deepEqual(result.skipped, [
        { line: 2, reason: 'summary row' },
        { line: 3, reason: 'summary row' },
        { line: 4, reason: 'summary row' },
    ]);
});

// Test 5: case 5 - controls that must stay imported (TotalEnergies, Saldo Bakery)
test('case 5: merchants with summary words in name are still imported', () => {
    const lines = [
        'Date;Type;Merchant;Amount;Currency;Direction',
        '2026-03-12;Info;TotalEnergies Riga;40,00;EUR;D',
        '2026-03-13;Info;Saldo Bakery;3,20;EUR;D',
    ];

    const layout = {
        columns: columns({
            date: 0,
            description: 2,
            amount: 3,
            currency: 4,
            direction: 5,
        }),
        decimalSeparator: ',',
        dateFormat: 'YMD',
    };

    const result = read(lines, layout);

    // Both rows imported
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].description, 'TotalEnergies Riga');
    assert.equal(result.rows[1].description, 'Saldo Bakery');

    // No skips
    assert.deepEqual(result.skipped, []);
});

// Test 6: case 6 - controls skipped in Description column (as before)
test('case 6: various summary phrases in Description column are still skipped', () => {
    const lines = [
        'Date;Merchant;Description;Amount',
        '2026-03-12;SIA RIMI;Closing balance;1234,56',
        '2026-03-12;SIA RIMI;Sākuma saldo;1234,56',
        '2026-03-12;SIA RIMI;Opening balance 2026-03-01;1234,56',
        '2026-03-12;SIA RIMI;Atlikums perioda sākumā;1234,56',
        '2026-03-12;SIA RIMI;Coffee;-4,00',
    ];

    const layout = {
        columns: columns({
            date: 0,
            description: 2,
            amount: 3,
        }),
        decimalSeparator: ',',
        dateFormat: 'YMD',
    };

    const result = read(lines, layout);

    // Only Coffee imported
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].description, 'Coffee');

    // Lines 2-5 skipped as summary rows
    assert.deepEqual(result.skipped, [
        { line: 2, reason: 'summary row' },
        { line: 3, reason: 'summary row' },
        { line: 4, reason: 'summary row' },
        { line: 5, reason: 'summary row' },
    ]);
});
