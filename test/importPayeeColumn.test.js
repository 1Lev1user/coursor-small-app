import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';
import { patternFor, mergeSavedColumns } from '../src/views/import.js';
import { fingerprint } from '../src/import/core.js';

/** CSV text -> guessed columns and statement, the same pipeline the import screen runs. */
function run(...lines) {
    const { rows } = parseDelimited(lines.join('\n') + '\n');
    const headerRow = findHeaderRow(rows);
    const guess = guessColumns(rows[headerRow], rows.slice(headerRow + 1));
    const statement = rowsToStatement(rows, headerRow, {
        columns: guess.columns,
        dateFormat: guess.dateFormat,
        decimalSeparator: guess.decimalSeparator,
    });
    return { guess, statement };
}

const CITADELE_LIKE = 'Datums;Saņēmēja/Maksātāja nosaukums;Maksājuma detaļas;Summa;Valūta;Atlikums';

test('a payee column feeds the counterparty and the rule keyword, the details stay the description', () => {
    const { guess, statement } = run(CITADELE_LIKE, '13.09.2026;SIA RIMI LATVIJA;Pirkums;-12,50;EUR;987,50');
    assert.equal(guess.columns.counterparty, 1);
    assert.equal(guess.columns.description, 2);
    const row = statement.rows[0];
    assert.equal(row.counterparty, 'SIA RIMI LATVIJA');
    assert.equal(row.description, 'Pirkums');
    assert.equal(patternFor(row), 'RIMI');
});

test('a Swedbank-like layout finds the payee, the details, the direction and the amount', () => {
    const { guess, statement } = run(
        'Klienta konts;Ieraksta tips;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts',
        'LV00TEST0000000000000;20;13.09.2026;SIA RIMI LATVIJA;Pirkums;12,50;EUR;D',
        'LV00TEST0000000000000;20;14.09.2026;Anna Paraugs;Rent;300,00;EUR;K',
    );
    assert.equal(guess.columns.date, 2);
    assert.equal(guess.columns.counterparty, 3);
    assert.equal(guess.columns.description, 4);
    assert.equal(guess.columns.amount, 5);
    assert.equal(guess.columns.direction, 7);
    assert.deepEqual(statement.rows.map((r) => [r.direction, r.amountCents, r.counterparty, r.description]), [
        ['out', 1250, 'SIA RIMI LATVIJA', 'Pirkums'],
        ['in', 30000, 'Anna Paraugs', 'Rent'],
    ]);
});

test('a file with no payee-like header has no counterparty key', () => {
    const { guess } = run('Datums;Apraksts;Summa;Valūta;D/K', '13.09.2026;Pirkums;12,50;EUR;D');
    assert.equal('counterparty' in guess.columns, false);
    const citadele = guessColumns(
        ['Datums', 'Veids', 'Darījuma detaļas', 'Maks. Nr.', 'Trans. Nr.', 'Debets/Kredīts'],
        [['13.09.2026', 'Card', 'Pirkums', '1', '2', '-12,50']],
    );
    assert.equal('counterparty' in citadele.columns, false);
});

test('account name headers are not taken as the payee', () => {
    for (const name of ['Konta nosaukums', 'Account name']) {
        const guess = guessColumns(['Date', name, 'Description', 'Amount'], [['2026-09-13', 'Main', 'Shop', '-5.00']]);
        assert.equal('counterparty' in guess.columns, false, name);
        assert.equal(guess.columns.description, 2);
    }
});

test('the Payee header does not become the bank reference', () => {
    const { guess } = run('Date;Payee;Reference;Amount', '2026-09-13;Shop One;Ref 1;-5.00');
    assert.equal(guess.columns.bankRef, -1);
    assert.equal(guess.columns.counterparty, 1);
});

test('Cyrillic payee headers are found', () => {
    for (const name of ['Получатель', 'Плательщик']) {
        const guess = guessColumns(['Дата', name, 'Назначение', 'Сумма'], [['13.09.2026', 'ООО Ромашка', 'Оплата', '-5,00']]);
        assert.equal(guess.columns.counterparty, 1, name);
        assert.equal(guess.columns.description, 2, name);
    }
});

test('a payee-only file keeps the payee without a description', () => {
    const { guess, statement } = run('Date;Payee;Amount', '2026-09-13;Shop One;-5.00');
    assert.equal(guess.columns.counterparty, 1);
    assert.equal(guess.columns.description, -1);
    assert.equal(statement.rows[0].counterparty, 'Shop One');
    assert.equal(patternFor(statement.rows[0]), 'SHOP');
});

test('rows with the same text and different payees get different fingerprints', () => {
    const { statement } = run(
        CITADELE_LIKE,
        '13.09.2026;SIA RIMI LATVIJA;Pirkums;-12,50;EUR;987,50',
        '13.09.2026;SIA MAXIMA LATVIJA;Pirkums;-12,50;EUR;975,00',
        '13.09.2026;SIA RIMI LATVIJA;Pirkums;-12,50;EUR;962,50',
    );
    const [a, b, c] = statement.rows.map(fingerprint);
    assert.notEqual(a, b);
    assert.equal(a, c);
});

test('an empty payee cell falls back to the counterparty found in the card text', () => {
    const { statement } = run(
        'Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa',
        '13.09.2026;SIA RIMI LATVIJA;PIRKUMS 400000******0000 2026.09.12 12.34 5.00 EUR (123456) KAFEJNICA PARAUGS;-5,00',
        '14.09.2026;;PIRKUMS 400000******0000 2026.09.13 12.34 5.00 EUR (123456) KAFEJNICA PARAUGS;-5,00',
    );
    assert.equal(statement.rows[0].counterparty, 'SIA RIMI LATVIJA');
    assert.equal(statement.rows[1].counterparty, 'KAFEJNICA PARAUGS');
});

test('a saved layout without a payee column does not inherit the guessed one', () => {
    const guessed = { date: 0, counterparty: 1, description: 2 };
    assert.equal(mergeSavedColumns(guessed, { date: 0, description: 2 }).counterparty, -1);
    assert.equal(mergeSavedColumns(guessed, { date: 0, counterparty: 2 }).counterparty, 2);
    assert.equal(mergeSavedColumns({ date: 0, counterparty: -1 }, { date: 0 }).counterparty, -1);
    assert.equal('counterparty' in mergeSavedColumns({ date: 0 }, { date: 0 }), false);
});
