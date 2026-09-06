import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, createId } from '../src/model.js';
import {
    MAX_EXPENSE_CATEGORIES,
    MAX_INCOME_CATEGORIES,
    MAX_SUBCATEGORIES,
    canAddExpenseCategory,
    canAddIncomeCategory,
    canAddSubcategory,
    userExpenseCategoryCount,
    subcategoryCount,
} from '../src/limits.js';

test('limits allow normal seeded data', () => {
    const data = defaultData();
    assert.equal(canAddExpenseCategory(data).ok, true);
    assert.equal(canAddIncomeCategory(data).ok, true);
    assert.equal(canAddSubcategory(data).ok, true);
    assert.ok(userExpenseCategoryCount(data) < MAX_EXPENSE_CATEGORIES);
});

test('expense and income category caps are 50', () => {
    const data = defaultData();
    while (userExpenseCategoryCount(data) < MAX_EXPENSE_CATEGORIES) {
        data.categories.push({
            id: createId('cat'),
            name: `Cat ${data.categories.length}`,
            pinned: false,
            percent: 0,
            limitMode: 'percent',
            limitCents: 0,
            system: false,
            subcategories: [],
        });
    }
    assert.equal(canAddExpenseCategory(data).ok, false);

    data.incomeCategories = Array.from({ length: MAX_INCOME_CATEGORIES }, (_, index) => ({
        id: `incat_${index}`,
        name: `Income ${index}`,
    }));
    assert.equal(canAddIncomeCategory(data).ok, false);
});

test('subcategory cap is 500', () => {
    assert.equal(MAX_SUBCATEGORIES, 500);
    const data = defaultData();
    const host = data.categories.find((category) => category.system !== true);
    while (subcategoryCount(data) < MAX_SUBCATEGORIES) {
        host.subcategories.push({
            id: createId('sub'),
            name: `Sub ${host.subcategories.length}`,
        });
    }
    assert.equal(canAddSubcategory(data).ok, false);
});
