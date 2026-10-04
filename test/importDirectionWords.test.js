import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseDelimited,
    guessColumns,
    rowsToStatement,
    parseAmountWith,
    isDirectionValue,
} from '../src/import/text.js';

const LAYOUT = { dateFormat: 'DMY', decimalSeparator: ',' };

/** Runs a delimited text through guessColumns and rowsToStatement. */
function read(text, columnOverrides = {}) {
    const { rows } = parseDelimited(text);
    const guess = guessColumns(rows[0], rows.slice(1));
    const columns = { ...guess.columns, ...columnOverrides };
    const result = rowsToStatement(rows, 0, { ...LAYOUT, columns });
    return { guess, result };
}

const signed = (result) => result.rows.map((row) => `${row.direction}:${row.amountCents}`);

test('a Zime column of + and - gives the money direction', () => {
    const { guess, result } = read(
        'Datums;Apraksts;Summa;Zīme\n13.09.2026;RIMI;12,50;-\n14.09.2026;ALGA;900,00;+',
    );
    assert.equal(guess.columns.amount, 2);
    assert.equal(guess.columns.direction, 3);
    assert.deepEqual(signed(result), ['out:1250', 'in:90000']);
});

test('expense and income words are read in several languages', () => {
    const pairs = [
        ['Veids', 'Izdevumi', 'Ienākumi'],
        ['Direction', 'OUT', 'IN'],
        ['Direction', 'IZMAKSA', 'IEMAKSA'],
        ['Direction', 'EXPENSE', 'INCOME'],
        ['Direction', 'РАСХОД', 'ПРИХОД'],
    ];
    for (const [header, outWord, inWord] of pairs) {
        const { guess, result } = read(
            `Datums;Apraksts;Summa;${header}\n13.09.2026;RIMI;12,50;${outWord}\n14.09.2026;ALGA;900,00;${inWord}`,
        );
        assert.equal(guess.columns.direction, 3, `${header} ${outWord}`);
        assert.deepEqual(signed(result), ['out:1250', 'in:90000'], `${header} ${outWord}`);
    }
});

test('the same amount with - + - gives out, in, out', () => {
    const { result } = read(
        'Date;Description;Amount;Direction\n01.09.2026;A;10,00;-\n02.09.2026;B;10,00;+\n03.09.2026;C;10,00;-',
    );
    assert.deepEqual(signed(result), ['out:1000', 'in:1000', 'out:1000']);
});

test('D/K and DEBIT/CREDIT columns still give out, in, out', () => {
    for (const [debit, credit] of [['D', 'K'], ['DEBIT', 'CREDIT']]) {
        const { result } = read(
            `Date;Description;Amount;Direction\n01.09.2026;A;10,00;${debit}\n02.09.2026;B;10,00;${credit}\n03.09.2026;C;10,00;${debit}`,
        );
        assert.deepEqual(signed(result), ['out:1000', 'in:1000', 'out:1000'], debit);
    }
});

test('a hand-set direction column with an unknown word skips unsigned rows', () => {
    const { result } = read(
        'Date;Description;Amount;Kind\n'
        + '01.09.2026;A;10,00;WEIRD\n02.09.2026;B;-10,00;WEIRD\n03.09.2026;C;10,00;',
        { direction: 3 },
    );
    assert.deepEqual(result.skipped, [{ line: 2, reason: 'unknown direction' }]);
    assert.deepEqual(signed(result), ['out:1000', 'in:1000']);
});

test('an unknown direction word on a zero amount reports a zero amount', () => {
    const { result } = read(
        'Date;Description;Amount;Kind\n01.09.2026;A;0,00;WEIRD',
        { direction: 3 },
    );
    assert.deepEqual(result.skipped, [{ line: 2, reason: 'zero amount' }]);
});

test('a D/C mark glued to the amount is read, currency codes are not marks', () => {
    assert.equal(parseAmountWith('12,50DR', ','), -1250);
    assert.equal(parseAmountWith('12,50CR', ','), 1250);
    assert.equal(parseAmountWith('12,50 DR', ','), -1250);
    assert.equal(parseAmountWith('12,50 D', ','), -1250);
    for (const code of ['USD', 'CAD', 'DKK', 'CZK', 'EUR']) {
        assert.equal(parseAmountWith(`12,50 ${code}`, ','), 1250, code);
    }
});

test('D/C mark shapes that were read before still are (values taken from main)', () => {
    const expected = {
        '(12,50) D': -1250,
        '12,50- D': -1250,
        '12,50 EUR D': -1250,
        '12,50 € D': -1250,
        '(12,50) CR': -1250,
        '12,50- CR': -1250,
    };
    for (const [text, cents] of Object.entries(expected)) {
        assert.equal(parseAmountWith(text, ','), cents, text);
    }
});

test('a column of one repeated sign is not a direction column by content', () => {
    const { guess, result } = read(
        'Date;Description;Amount;Reference\n01.09.2026;A;-10,00;-\n02.09.2026;B;2000,00;-',
    );
    assert.equal(guess.columns.direction, -1);
    assert.deepEqual(signed(result), ['out:1000', 'in:200000']);
    const plus = read('Date;Description;Amount;Reference\n01.09.2026;A;10,00;+\n02.09.2026;B;20,00;+');
    assert.equal(plus.guess.columns.direction, -1);
});

test('an unnamed column with both + and - is still a direction column', () => {
    const { guess } = read('Date;Description;Amount;Reference\n01.09.2026;A;10,00;-\n02.09.2026;B;20,00;+');
    assert.equal(guess.columns.direction, 3);
});

test('a transaction type column is still not a direction column', () => {
    const { guess } = read(
        'Type,Product,Started Date,Description,Amount,Currency\n'
        + 'CARD_PAYMENT,Current,2026-09-13 10:00:00,RIMI,-12.50,EUR\n'
        + 'TOPUP,Current,2026-09-14 10:00:00,ALGA,900.00,EUR',
    );
    assert.equal(guess.columns.direction, -1);
});

test('isDirectionValue accepts direction words and rejects numbers and empties', () => {
    assert.equal(isDirectionValue('20'), false);
    assert.equal(isDirectionValue(''), false);
    assert.equal(isDirectionValue('+'), true);
    assert.equal(isDirectionValue('-'), true);
    assert.equal(isDirectionValue('Ienākumi'), true);
});
