import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultData } from '../src/model.js';
import { formatEuro } from '../src/money.js';
import { addIncomeSource, incomeStatus } from '../src/incomeSources.js';
import { currentMonthKey } from '../src/months.js';
import { groupSummary } from '../src/views/more.js';
import { describeIncomeSource, statusLine } from '../src/views/settings/incomeSources.js';

const NOW = new Date(2026, 9, 4);
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function item(state, overrides = {}) {
    return {
        sourceId: 'incsrc_a',
        name: 'Salary',
        incomeCategoryId: 'salary',
        date: '2026-10-25',
        expectedCents: 200000,
        receivedCents: 0,
        entryIds: [],
        state,
        ...overrides,
    };
}

function source(id) {
    return {
        id,
        name: id,
        incomeCategoryId: 'salary',
        expectedCents: 100000,
        dayOfMonth: 5,
        startDate: '2026-10-01',
        skippedMonths: [],
    };
}

function summaryText(sourceCount, entryCount) {
    const data = defaultData();
    data.incomeSources = Array.from({ length: sourceCount }, (_, i) => source(`s${i}`));
    data.incomes = Array.from({ length: entryCount }, (_, i) => ({ id: `i${i}` }));
    const summary = groupSummary('income', data, NOW);
    assert.equal(summary.warn, false);
    return summary.text;
}

test('describeIncomeSource shows the amount and the payday', () => {
    const text = describeIncomeSource({ expectedCents: 200000, dayOfMonth: 25 });
    assert.equal(text, `${formatEuro(200000)} · payday day 25`);
    assert.equal(
        describeIncomeSource({ expectedCents: 123456, dayOfMonth: 1 }),
        `${formatEuro(123456)} · payday day 1`,
    );
});

test('statusLine words the four states of this month', () => {
    assert.equal(
        statusLine(item('received', { receivedCents: 215000 })),
        `This month: received ${formatEuro(215000)}`,
    );
    assert.equal(statusLine(item('upcoming')), 'This month: expected 25 Oct');
    assert.equal(statusLine(item('due')), 'This month: waiting for you on Home');
    assert.equal(statusLine(item('skipped')), 'This month: skipped');
});

test('statusLine is empty when the source has no item this month', () => {
    assert.equal(statusLine(null), '');
    assert.equal(statusLine(undefined), '');
});

test('a source added in the setup month reads expected on its payday', () => {
    const data = defaultData();
    data.settings.balanceStart = { cents: 0, date: '2026-10-01' };
    const form = { name: 'Salary', expectedCents: 200000, dayOfMonth: 25, incomeCategoryId: 'salary' };
    const added = addIncomeSource(data, form, NOW);
    assert.equal(added.ok, true);
    const items = incomeStatus(data, currentMonthKey(NOW), NOW);
    assert.equal(statusLine(items[0]), 'This month: expected 25 Oct');
});

test('the income summary counts regular incomes and entries', () => {
    assert.equal(summaryText(0, 0), 'No income entries yet');
    assert.equal(summaryText(0, 3), '3 income entries');
    assert.equal(summaryText(1, 0), '1 regular income · no income entries yet');
    assert.equal(summaryText(1, 1), '1 regular income · 1 income entry');
    assert.equal(summaryText(2, 3), '2 regular incomes · 3 income entries');
    assert.equal(summaryText(2, 5), '2 regular incomes · 5 income entries');
});

test('the view file has no weekend wording', () => {
    const view = readFileSync(join(root, 'src/views/settings/incomeSources.js'), 'utf8');
    assert.ok(!/weekend/i.test(view));
});
