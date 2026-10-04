import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const income = read('src/views/settings/income.js');
const more = read('src/views/more.js');
const shared = read('src/views/settings/shared.js');
const categories = read('src/views/settings/categories.js');
const subscriptions = read('src/views/settings/subscriptions.js');
const plan = read('src/views/settings/plan.js');
const setup = read('src/views/setup.js');
const chartView = read('src/views/chartView.js');
const add = read('src/views/add.js');

function assertNone(source, name, strings) {
    for (const text of strings) {
        assert.ok(!source.includes(text), `${name} must not contain "${text}"`);
    }
}

test('income.js has no duplicate add form and names the list Income entries', () => {
    assertNone(income, 'income.js', ['add-extra-income-form', 'Add extra income']);
    assert.ok(income.includes('Income entries'));
});

test('more.js has no second Settings heading and no orphan warnings', () => {
    assert.ok(!/element\('h2', 'section-title', 'Settings'\)/.test(more));
    assert.ok(!more.includes('renderWarnings'));
});

test('categories.js shows the limit warnings', () => {
    assert.match(categories, /import\s*\{[^}]*renderWarnings[^}]*\}\s*from '\.\/plan\.js'/);
});

test('old plan and share labels are gone from the settings sections', () => {
    for (const [name, source] of [
        ['shared.js', shared],
        ['categories.js', categories],
        ['subscriptions.js', subscriptions],
    ]) {
        assertNone(source, name, ['Edit plan', 'Plan updated', 'Budget share']);
    }
});

test('"spend budget" is gone from the budget form and settings sections', () => {
    for (const [name, source] of [
        ['plan.js', plan],
        ['setup.js', setup],
        ['categories.js', categories],
        ['shared.js', shared],
    ]) {
        assertNone(source, name, ['spend budget']);
    }
});

test('chart, Home and setup use the new income and budget words', () => {
    assertNone(chartView, 'chartView.js', ['fixed from Plan', 'Add extra income']);
    assertNone(add, 'add.js', ['Add extra income', 'Extra income added']);
    assertNone(setup, 'setup.js', ['monthly plan']);
});

test('the new strings exist', () => {
    assert.ok(shared.includes('Limit updated'));
    assert.ok(subscriptions.includes('Category limit'));
    assert.ok(add.includes('Income added'));
    assert.ok(plan.includes('Monthly budget (EUR)'));
    assert.ok(setup.includes('Monthly budget (EUR)'));
});
