import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, SAVINGS_ID } from '../src/model.js';
import {
    getMonthReviewSuggestion,
    dismissMonthReview,
    applySurplusToSavings,
} from '../src/monthReview.js';

function withPreviousMonthActivity(data) {
    data.settings.monthlyBudgetCents = 100000;
    data.settings.usualMonthlyIncomeCents = 80000;
    data.incomes = [
        {
            id: 'i1',
            incomeCategoryId: 'income-other',
            amountCents: 70000,
            note: 'Bonus',
            date: '2026-08-10',
        },
    ];
    data.expenses = [
        {
            id: 'e1',
            categoryId: 'necessary',
            subcategoryId: 'groceries',
            amountCents: 40000,
            note: '',
            date: '2026-08-12',
        },
    ];
    return data;
}

test('month review shows only on days 1–5 of the new month', () => {
    const data = withPreviousMonthActivity(defaultData());

    assert.notEqual(
        getMonthReviewSuggestion(data, new Date(2026, 8, 1)),
        null,
    );
    assert.notEqual(
        getMonthReviewSuggestion(data, new Date(2026, 8, 5)),
        null,
    );
    assert.equal(
        getMonthReviewSuggestion(data, new Date(2026, 8, 6)),
        null,
    );
    assert.equal(
        getMonthReviewSuggestion(data, new Date(2026, 8, 20)),
        null,
    );
});

test('month review stays hidden after dismiss even within the first 5 days', () => {
    const data = withPreviousMonthActivity(defaultData());
    const now = new Date(2026, 8, 3);
    const suggestion = getMonthReviewSuggestion(data, now);
    assert.equal(suggestion.previousKey, '2026-08');
    dismissMonthReview(data, suggestion.previousKey);
    assert.equal(getMonthReviewSuggestion(data, now), null);
});

test('month review flags income above spend budget', () => {
    const data = withPreviousMonthActivity(defaultData());
    const suggestion = getMonthReviewSuggestion(data, new Date(2026, 8, 2));
    assert.equal(suggestion.earnedAboveSpendBudget, true);
    assert.equal(suggestion.incomeOverSpendCents, 50000);
    assert.equal(suggestion.totals.incomeCents, 150000);
    assert.equal(suggestion.totals.budgetCents, 100000);
});

test('applySurplusToSavings raises Savings without exceeding budget', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000;
    const savings = data.categories.find(({ id }) => id === SAVINGS_ID);
    savings.limitMode = 'euro';
    savings.limitCents = 10000;
    savings.percent = 10;

    const result = applySurplusToSavings(data, 50000);
    assert.deepEqual(result, { appliedCents: 50000, savingsLimitCents: 60000 });
    assert.equal(savings.limitCents, 60000);

    const capped = applySurplusToSavings(data, 999999);
    assert.equal(capped.appliedCents, 40000);
    assert.equal(savings.limitCents, 100000);
});
