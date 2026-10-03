import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { detectFormat } from '../src/import/detect.js';
import { parseDelimited, findHeaderRow, guessColumns, rowsToStatement } from '../src/import/text.js';
import { findDuplicates, defaultDecisions, buildImport, applyImport, undoImport } from '../src/import/core.js';
import { decisionsForBuild } from '../src/views/import.js';

const NOW = new Date(2026, 8, 25, 12, 0, 0);
const PAST_MONTH = '2026-08';
const CURRENT_MONTH = '2026-09';
const ROW_COUNT = 100;
const PAST_ROWS = 60;

function pad(value) {
    return String(value).padStart(2, '0');
}

/** 100 rows: the first 60 in August (past, no plan), the last 40 in September; every fifth row is money in. */
function makeCsv() {
    const lines = ['Date;Description;Amount;Currency'];
    const expected = { out: 0, in: 0, outCents: 0, inCents: 0 };
    for (let i = 0; i < ROW_COUNT; i += 1) {
        const month = i < PAST_ROWS ? 8 : 9;
        const day = (i % 25) + 1;
        const cents = 500 + i * 37;
        const isOut = i % 5 !== 4;
        const amount = `${isOut ? '-' : ''}${Math.floor(cents / 100)},${pad(cents % 100)}`;
        lines.push(`${pad(day)}.${pad(month)}.2026;SHOP ${i};${amount};EUR`);
        if (isOut) {
            expected.out += 1;
            expected.outCents += cents;
        } else {
            expected.in += 1;
            expected.inCents += cents;
        }
    }
    return { text: lines.join('\n'), expected };
}

function startingData() {
    const data = defaultData();
    data.settings.setupComplete = true;
    data.settings.monthlyBudgetCents = 200000;
    data.settings.usualMonthlyIncomeCents = 300000;
    // A month the import does not touch, so undo has an entry that must stay.
    data.expenses.push({ id: 'exp_manual', categoryId: 'random', subcategoryId: '', amountCents: 1250, note: 'By hand', date: '2026-07-10' });
    return data;
}

function snapshotOf(data) {
    return structuredClone({
        expenses: data.expenses,
        incomes: data.incomes,
        monthPlans: data.monthPlans,
        rules: data.rules,
    });
}

test('a 100-row CSV goes through the wizard steps, imports, and undo leaves no trace', () => {
    const { text, expected } = makeCsv();

    assert.equal(detectFormat(text, 'bank.csv'), 'csv');

    const parsed = parseDelimited(text);
    const rows = parsed.rows.filter((cells) => cells.some((cell) => String(cell ?? '').trim() !== ''));
    assert.equal(rows.length, ROW_COUNT + 1);
    const headerRow = findHeaderRow(rows);
    assert.equal(headerRow, 0);
    const guess = guessColumns(rows[headerRow], rows.slice(headerRow + 1, headerRow + 21));
    assert.equal(guess.columns.date, 0);
    assert.equal(guess.columns.description, 1);
    assert.equal(guess.columns.amount, 2);
    assert.equal(guess.decimalSeparator, ',');
    assert.ok(guess.dateFormat);

    const layout = {
        columns: { ...guess.columns, eurAmount: -1, debit: -1, credit: -1 },
        decimalSeparator: guess.decimalSeparator,
        dateFormat: guess.dateFormat,
    };
    const statement = rowsToStatement(rows, headerRow, layout);
    assert.equal(statement.rows.length, ROW_COUNT);
    assert.equal(statement.skipped.length, 0);
    const outRows = statement.rows.filter(({ direction }) => direction === 'out');
    const inRows = statement.rows.filter(({ direction }) => direction === 'in');
    assert.equal(outRows.length, expected.out);
    assert.equal(inRows.length, expected.in);
    assert.equal(outRows.reduce((sum, { amountCents }) => sum + amountCents, 0), expected.outCents);
    assert.equal(inRows.reduce((sum, { amountCents }) => sum + amountCents, 0), expected.inCents);

    const data = startingData();
    const duplicates = findDuplicates(data, statement.rows);
    assert.ok(duplicates.every((duplicate) => !duplicate?.level));
    const decisions = defaultDecisions(data, statement.rows, duplicates);
    assert.equal(decisions.length, ROW_COUNT);
    assert.ok(decisions.every(({ include }) => include === true));

    const built = buildImport(
        data,
        decisionsForBuild(statement.rows, decisions, statement.rows.map(() => '')),
        { rows: statement.rows, format: 'csv', fileName: 'bank.csv', now: NOW },
    );
    assert.equal(built.ok, true);
    assert.deepEqual(built.errors, []);
    assert.equal(built.expenses.length, expected.out);
    assert.equal(built.incomes.length, expected.in);
    assert.deepEqual(built.planChoices, [PAST_MONTH]);

    const before = snapshotOf(data);
    const expenseCount = data.expenses.length;
    const incomeCount = data.incomes.length;

    const refused = applyImport(data, built, {});
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, `Choose a plan for ${PAST_MONTH}.`);
    assert.deepEqual(snapshotOf(data), before);
    assert.equal(data.imports.length, 0);

    const applied = applyImport(data, built, { [PAST_MONTH]: 'actualOnly' });
    assert.equal(applied.ok, true);
    assert.equal(data.expenses.length, expenseCount + expected.out);
    assert.equal(data.incomes.length, incomeCount + expected.in);
    assert.ok(Object.hasOwn(data.monthPlans, PAST_MONTH));
    assert.ok(Object.hasOwn(data.monthPlans, CURRENT_MONTH));
    assert.equal(data.imports.length, 1);

    const removed = undoImport(data, applied.importId, NOW);
    assert.equal(removed, ROW_COUNT);
    assert.deepEqual(snapshotOf(data), before);
    assert.equal(data.imports.length, 1);
    assert.equal(data.imports[0].id, applied.importId);
    assert.equal(data.imports[0].undoneAt, NOW.toISOString());

    const again = applyImport(data, built, { [PAST_MONTH]: 'actualOnly' });
    assert.equal(again.ok, false);
    assert.equal(again.reason, 'This import was already applied.');
    assert.deepEqual(snapshotOf(data), before);
});
