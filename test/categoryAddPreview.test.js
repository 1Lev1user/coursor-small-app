import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultData } from '../src/model.js';
import {
    isNoLimitCategory,
    newNoLimitCategory,
    previewAddCategory,
    resolvePlan,
} from '../src/budget.js';
import { DEFAULT_NEW_CATEGORY_KIND } from '../src/views/settings/categories.js';

const budget = 100000;
const clone = (value) => JSON.parse(JSON.stringify(value));
const FLEXIBLE = { pinned: false, percent: 0, limitMode: 'percent', limitCents: 0 };

function beforeLimits() {
    const { entries } = resolvePlan(clone(defaultData().categories), budget);
    return new Map(entries.map((entry) => [entry.id, entry.limitCents]));
}

test('new categories default to No limit', () => {
    assert.equal(DEFAULT_NEW_CATEGORY_KIND, 'none');
});

test('newNoLimitCategory builds a no-limit category that moves no other limit', () => {
    const created = newNoLimitCategory('c1', 'Gifts');
    assert.deepEqual(created, {
        id: 'c1',
        name: 'Gifts',
        pinned: false,
        percent: 0,
        limitMode: 'none',
        limitCents: 0,
        system: false,
        subcategories: [],
    });
    assert.equal(isNoLimitCategory(created), true);

    const before = beforeLimits();
    const categories = clone(defaultData().categories);
    categories.push(created);
    const { entries } = resolvePlan(categories, budget);
    for (const entry of entries) {
        if (entry.id === 'c1') continue;
        assert.equal(entry.limitCents, before.get(entry.id), entry.id);
    }
});

test('a flexible candidate lists the three flexible categories at 25000', () => {
    const categories = clone(defaultData().categories);
    const before = beforeLimits();
    const changed = previewAddCategory(categories, budget, FLEXIBLE);
    assert.equal(changed.length, 3);
    for (const item of changed) {
        assert.equal(item.afterCents, 25000);
        assert.equal(item.beforeCents, before.get(item.id));
        assert.notEqual(item.beforeCents, item.afterCents);
    }
    assert.deepEqual(
        changed.map(({ id }) => id).sort(),
        resolvePlan(clone(categories), budget).entries
            .filter((entry) => !entry.pinned && !entry.noLimit)
            .map(({ id }) => id)
            .sort(),
    );
});

test('a none candidate changes nothing', () => {
    const categories = clone(defaultData().categories);
    const candidate = { pinned: false, percent: 0, limitMode: 'none', limitCents: 0 };
    assert.deepEqual(previewAddCategory(categories, budget, candidate), []);
});

test('a pinned 20 percent candidate shrinks the three flexible limits to about 80000 in total', () => {
    const categories = clone(defaultData().categories);
    const candidate = { pinned: true, percent: 20, limitMode: 'percent', limitCents: 0 };
    const changed = previewAddCategory(categories, budget, candidate);
    assert.equal(changed.length, 3);
    // splitShares gives the rounding remainder (2 cents) to the last entry, the new category.
    const total = changed.reduce((sum, item) => sum + item.afterCents, 0);
    assert.ok(Math.abs(total - 80000) <= 2, `total ${total}`);
    assert.ok(changed.every((item) => item.afterCents === 26666));
});

test('budget 0 changes nothing', () => {
    const categories = clone(defaultData().categories);
    assert.deepEqual(previewAddCategory(categories, 0, FLEXIBLE), []);
});

test('previewAddCategory does not mutate its input', () => {
    const categories = clone(defaultData().categories);
    const copy = clone(categories);
    previewAddCategory(categories, budget, FLEXIBLE);
    previewAddCategory(categories, budget, { pinned: true, percent: 20, limitMode: 'percent', limitCents: 0 });
    assert.deepEqual(categories, copy);
});

test('both create paths build No limit categories', () => {
    const addSource = readFileSync(new URL('../src/views/add.js', import.meta.url), 'utf8');
    assert.ok(addSource.includes('newNoLimitCategory('));
    assert.ok(!addSource.includes('createFlexibleCategory'));
    const categoriesSource = readFileSync(
        new URL('../src/views/settings/categories.js', import.meta.url),
        'utf8',
    );
    assert.ok(!categoriesSource.includes("kind: 'flexible'"));
    assert.ok(!categoriesSource.includes("kind = 'flexible'"));
});
