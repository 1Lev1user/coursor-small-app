import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import {
    MAX_EXPENSE_CATEGORIES,
    MAX_INCOME_CATEGORIES,
    MAX_SUBCATEGORIES,
    canAddExpenseCategory,
    canAddIncomeCategory,
    canAddSubcategory,
    userExpenseCategoryCount,
} from '../src/limits.js';

test('user expense categories exclude the system category', () => {
    const data = defaultData();
    const userCount = data.categories.filter(({ system }) => system !== true).length;
    assert.equal(userExpenseCategoryCount(data), userCount);
});

test('adding expense categories stops at the cap', () => {
    const data = defaultData();
    assert.equal(canAddExpenseCategory(data).ok, true);

    while (userExpenseCategoryCount(data) < MAX_EXPENSE_CATEGORIES) {
        data.categories.push({ id: `c${data.categories.length}`, system: false, subcategories: [] });
    }
    const result = canAddExpenseCategory(data);
    assert.equal(result.ok, false);
    assert.match(result.reason, /at most 50/);
});

test('adding income categories stops at the cap', () => {
    const data = defaultData();
    data.incomeCategories = Array.from({ length: MAX_INCOME_CATEGORIES }, (_, index) => ({
        id: `i${index}`,
        name: `I${index}`,
    }));
    assert.equal(canAddIncomeCategory(data).ok, false);
    data.incomeCategories.pop();
    assert.equal(canAddIncomeCategory(data).ok, true);
});

test('subcategories are capped across all categories', () => {
    const data = defaultData();
    const subcategories = Array.from({ length: MAX_SUBCATEGORIES }, (_, index) => ({
        id: `s${index}`,
        name: `S${index}`,
    }));
    data.categories[0].subcategories = subcategories;
    data.categories.slice(1).forEach((category) => {
        category.subcategories = [];
    });
    assert.equal(canAddSubcategory(data).ok, false);
    subcategories.pop();
    assert.equal(canAddSubcategory(data).ok, true);
});
