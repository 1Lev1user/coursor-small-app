import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subcategoryCountText, isCategoryOpen } from '../src/views/settings/categories.js';
import { state, closeTransientUi } from '../src/views/settings/shared.js';

const CSS = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const CATEGORIES_JS = readFileSync(
    new URL('../src/views/settings/categories.js', import.meta.url),
    'utf8',
);

function resetOpenState() {
    closeTransientUi();
    state.openCategoryId = null;
}

function ruleBody(selector) {
    const start = CSS.indexOf(`\n${selector} {`);
    assert.notEqual(start, -1, `${selector} rule exists`);
    return CSS.slice(start, CSS.indexOf('}', start));
}

test('subcategoryCountText words 0, 1 and many', () => {
    assert.equal(subcategoryCountText(0), 'No subcategories');
    assert.equal(subcategoryCountText(1), '1 subcategory');
    assert.equal(subcategoryCountText(2), '2 subcategories');
});

test('openCategoryId is null by default', () => {
    assert.equal(Object.hasOwn(state, 'openCategoryId'), true);
    assert.strictEqual(state.openCategoryId, null);
});

test('closeTransientUi keeps the open category', () => {
    state.openCategoryId = 'cat_x';
    closeTransientUi();
    assert.strictEqual(state.openCategoryId, 'cat_x');
    resetOpenState();
});

test('a category is closed when nothing points at it', () => {
    resetOpenState();
    assert.equal(isCategoryOpen({ id: 'catA' }), false);
});

test('a category is open when openCategoryId points at it', () => {
    resetOpenState();
    state.openCategoryId = 'catA';
    assert.equal(isCategoryOpen({ id: 'catA' }), true);
    assert.equal(isCategoryOpen({ id: 'catB' }), false);
    resetOpenState();
});

test('an open form forces its category open', () => {
    for (const field of ['renameCategoryId', 'editPlanCategoryId', 'confirmCategoryId']) {
        resetOpenState();
        state[field] = 'catA';
        assert.equal(isCategoryOpen({ id: 'catA' }), true, field);
        assert.equal(isCategoryOpen({ id: 'catB' }), false, field);
    }
    resetOpenState();
});

test('a subcategory form forces its category open, matching the whole id', () => {
    for (const field of ['renameSubKey', 'confirmSubKey']) {
        resetOpenState();
        state[field] = 'catA:sub1';
        assert.equal(isCategoryOpen({ id: 'catA' }), true, field);
        assert.equal(isCategoryOpen({ id: 'catB' }), false, field);
        assert.equal(isCategoryOpen({ id: 'cat' }), false, field);
    }
    resetOpenState();
});

test('subcategory rows stay on one line and only the name shrinks', () => {
    assert.match(ruleBody('.subcategory-item'), /flex-wrap:\s*nowrap/);
    assert.match(ruleBody('.subcategory-name'), /min-width:\s*0/);
    assert.match(ruleBody('.subcategory-item > .btn'), /flex:\s*none/);
});

test('the category toggle exposes its state to assistive tech', () => {
    assert.match(CATEGORIES_JS, /aria-expanded/);
    assert.match(CATEGORIES_JS, /aria-controls/);
});
