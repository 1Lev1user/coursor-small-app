import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { buildImport } from '../src/import/core.js';
import {
    headerSignature,
    findSavedLayout,
    refineColumns,
    markForeignRows,
    kindsForDirection,
    patternFor,
    samePatternIndexes,
    copyChoice,
    decisionsForBuild,
    layoutRecord,
    upsertLayout,
    dateQuestion,
    layoutFitsSample,
} from '../src/views/import.js';
import { importCountsText, ruleTargetText } from '../src/views/settings/importSettings.js';

function row(date, amountCents, direction, description, extra = {}) {
    return statementRow({ date, amountCents, direction, description, ...extra });
}

function columns(overrides = {}) {
    return {
        date: -1, amount: -1, description: -1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1,
        ...overrides,
    };
}

test('headerSignature lowercases, trims and joins cells with |', () => {
    assert.equal(headerSignature([' Datums ', 'Summa', 'D/K']), 'datums|summa|d/k');
    assert.equal(headerSignature([]), '');
    assert.equal(headerSignature(undefined), '');
});

test('findSavedLayout matches the exact signature and ignores an empty one', () => {
    const layouts = [{ id: 'a', signature: 'date|amount' }, { id: 'b', signature: 'datums|summa' }];
    assert.equal(findSavedLayout(layouts, 'datums|summa').id, 'b');
    assert.equal(findSavedLayout(layouts, 'datums|summa|x'), null);
    assert.equal(findSavedLayout(layouts, ''), null);
    assert.equal(findSavedLayout(undefined, 'date|amount'), null);
});

test('refineColumns turns a D/K debit guess into the direction column', () => {
    const sample = [
        ['03.08.2026', '20', 'RIMI', '23,45', 'D'],
        ['15.08.2026', '20', 'Alga', '1850,00', 'K'],
    ];
    const result = refineColumns(columns({ date: 0, direction: 1, description: 2, amount: 3, debit: 4 }), sample);
    assert.equal(result.direction, 4);
    assert.equal(result.debit, -1);
    assert.equal(result.amount, 3);
});

test('refineColumns drops a Type column that is not a direction', () => {
    const sample = [['CARD_PAYMENT', '-18.27'], ['TOPUP', '500.00']];
    const result = refineColumns(columns({ direction: 0, amount: 1 }), sample);
    assert.equal(result.direction, -1);
});

test('refineColumns keeps real debit and credit amount columns', () => {
    const sample = [['12,00', ''], ['', '50,00']];
    const result = refineColumns(columns({ debit: 0, credit: 1 }), sample);
    assert.equal(result.debit, 0);
    assert.equal(result.credit, 1);
});

test('markForeignRows clears the EUR amount of foreign rows only', () => {
    const rows = markForeignRows([
        row('2026-09-10', 5000, 'out', 'Amazon', { currency: 'USD' }),
        row('2026-09-11', 1200, 'out', 'Lidl'),
    ]);
    assert.equal(rows[0].amountCents, null);
    assert.equal(rows[0].originalAmountCents, 5000);
    assert.equal(rows[1].amountCents, 1200);
});

test('kindsForDirection offers only kinds valid for the money direction', () => {
    assert.deepEqual(kindsForDirection('out'), ['expense', 'transfer', 'skip']);
    assert.deepEqual(kindsForDirection('in'), ['refund', 'income', 'transfer', 'skip']);
});

test('samePatternIndexes finds other included rows with the same merchant and direction', () => {
    const rows = [
        row('2026-08-03', 2345, 'out', 'PIRKUMS 4567***1234 RIMI MINI 17 RIGA 03.08'),
        row('2026-08-07', 6102, 'out', 'PIRKUMS 4567***1234 RIMI HIPERMARKETS 07.08'),
        row('2026-08-14', 499, 'in', 'RIMI refund'),
        row('2026-08-15', 900, 'out', 'LIDO'),
        row('2026-08-16', 700, 'out', 'RIMI MINI'),
    ];
    const decisions = rows.map((_, index) => ({ include: index !== 4 }));
    assert.equal(patternFor(rows[0]), 'RIMI');
    assert.deepEqual(samePatternIndexes(rows, decisions, 0), [1]);
    assert.deepEqual(samePatternIndexes(rows, decisions, 3), []);
});

test('copyChoice copies kind and categories only', () => {
    const target = { include: true, kind: 'expense', categoryId: 'x', subcategoryId: '', incomeCategoryId: 'salary', remember: true };
    copyChoice(target, { include: false, kind: 'refund', categoryId: 'necessary', subcategoryId: 'groceries', incomeCategoryId: 'income-other', remember: false });
    assert.deepEqual(target, {
        include: true, kind: 'refund', categoryId: 'necessary', subcategoryId: 'groceries', incomeCategoryId: 'income-other', remember: true,
    });
});

test('decisionsForBuild adds typed EUR amounts and keeps patterns only when remembered', () => {
    const rows = [
        row('2026-09-10', null, 'out', 'Amazon', { currency: 'USD', originalAmountCents: 5000 }),
        row('2026-09-11', 1200, 'out', 'Lidl'),
    ];
    const decisions = [
        { include: true, kind: 'expense', categoryId: 'random', subcategoryId: '', remember: false, pattern: 'AMAZON' },
        { include: true, kind: 'expense', categoryId: 'random', subcategoryId: '', remember: true, pattern: 'LIDL' },
    ];
    const result = decisionsForBuild(rows, decisions, ['46,20', '']);
    assert.equal(result[0].amountCents, 4620);
    assert.equal('pattern' in result[0], false);
    assert.equal(result[1].pattern, 'LIDL');
    assert.equal('amountCents' in result[1], false);
    assert.equal(decisions[0].pattern, 'AMAZON');

    const empty = decisionsForBuild(rows, decisions, ['', '']);
    assert.equal(empty[0].amountCents, undefined);
    const built = buildImport(defaultData(), empty, { rows, now: new Date(2026, 8, 25) });
    assert.equal(built.ok, false);
    assert.equal(built.errors[0].index, 0);
});

test('layoutRecord clears the unused amount columns for each mode', () => {
    const layout = {
        mode: 'single',
        columns: columns({ date: 2, amount: 5, description: 4, direction: 7, debit: 3 }),
        decimalSeparator: ',',
        dateFormat: 'DMY',
    };
    const record = layoutRecord({ name: 'Swedbank', signature: 'a|b', delimiter: ';', encoding: 'windows-1257', headerRow: 3, layout });
    assert.equal(record.columns.debit, -1);
    assert.equal(record.columns.amount, 5);
    assert.equal(record.columns.direction, 7);
    assert.equal(record.decimalSeparator, ',');
    assert.match(record.id, /^layout_/);

    const split = layoutRecord({ name: 'X', signature: 's', headerRow: 0, layout: { ...layout, mode: 'split' } });
    assert.equal(split.columns.amount, -1);
    assert.equal(split.columns.direction, -1);
    assert.equal(split.columns.debit, 3);
});

test('upsertLayout replaces a layout with the same signature and keeps its id', () => {
    const data = { bankLayouts: [] };
    const first = upsertLayout(data, { id: 'l1', name: 'Swedbank', signature: 'a|b' });
    const second = upsertLayout(data, { id: 'l2', name: 'Swedbank LV', signature: 'a|b' });
    upsertLayout(data, { id: 'l3', name: 'Revolut', signature: 'c|d' });
    assert.equal(first.id, 'l1');
    assert.equal(second.id, 'l1');
    assert.equal(data.bankLayouts.length, 2);
    assert.equal(data.bankLayouts[0].name, 'Swedbank LV');
});

test('dateQuestion spells out both readings of an ambiguous date', () => {
    assert.equal(dateQuestion('03.04.2026'), 'Is 03.04.2026 the 3rd of April or March 4th?');
    assert.equal(dateQuestion('11.12.2026'), 'Is 11.12.2026 the 11th of December or November 12th?');
    assert.equal(dateQuestion('05.05.2026'), 'Which date format does this file use?');
    assert.equal(dateQuestion(''), 'Which date format does this file use?');
});

test('importCountsText lists non-zero counts', () => {
    assert.equal(
        importCountsText({ expenses: 5, incomes: 1, refunds: 0, transfers: 2, duplicates: 3, skipped: 0 }),
        '5 expenses · 1 income · 2 transfers · 3 duplicates left out',
    );
    assert.equal(importCountsText({ expenses: 1 }), '1 expense');
});

test('ruleTargetText names the kind and category', () => {
    const data = defaultData();
    assert.equal(
        ruleTargetText(data, { kind: 'expense', categoryId: 'necessary', subcategoryId: 'groceries', refund: false }),
        'Expense · Necessary expenses · Groceries',
    );
    assert.equal(
        ruleTargetText(data, { kind: 'expense', categoryId: 'random', subcategoryId: '', refund: true }),
        'Refund · Random small purchases',
    );
    assert.equal(ruleTargetText(data, { kind: 'income', incomeCategoryId: 'salary' }), 'Income · Salary');
    assert.equal(ruleTargetText(data, { kind: 'transfer' }), 'Transfer (not counted)');
});

test('layoutFitsSample rejects a saved layout whose decimals or dates do not fit the file', () => {
    const saved = { columns: columns({ date: 0, amount: 2 }), decimalSeparator: ',', dateFormat: 'DMY' };
    assert.equal(layoutFitsSample(saved, [['03.09.2026', 'x', '-15,60'], ['11.09.2026', 'y', '20,00']]), true);
    assert.equal(layoutFitsSample(saved, [['2026-09-20', 'x', '-30.10'], ['2026-09-21', 'y', '-4.50']]), false);
    assert.equal(layoutFitsSample(saved, [['2026/31/12', 'x', '-1,00']]), false);
    assert.equal(layoutFitsSample(saved, [['03.09.2026', 'x', '-1.234,50']]), true);
    assert.equal(layoutFitsSample(saved, [['03.09.2026', 'x', '-15']]), true);
});
