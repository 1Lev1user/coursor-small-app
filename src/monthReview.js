import { currentMonthKey, addMonths, monthLabel } from './months.js';
import {
    monthTotals,
    syncCategoryPlanFields,
    refreshCurrentMonthPlan,
    euroCentsFromPercent,
    percentFromEuroCents,
} from './budget.js';
import { SAVINGS_ID } from './model.js';

/** Soft Home review of the previous month — only on days 1–5. */
export function getMonthReviewSuggestion(data, now = new Date()) {
    if (now.getDate() > 5) {
        return null;
    }

    const previousKey = addMonths(currentMonthKey(now), -1);
    if (data.settings.monthReviewDismissedFor === previousKey) {
        return null;
    }

    const totals = monthTotals(data, previousKey);
    if (totals.spentCents <= 0 && totals.incomeCents <= 0) {
        return null;
    }

    const earnedAboveSpendBudget = totals.incomeCents > totals.budgetCents;
    if (
        totals.extraIncomeCents <= 0
        && totals.cashLeftCents <= 0
        && totals.budgetLeftCents >= 0
        && !earnedAboveSpendBudget
    ) {
        return null;
    }

    return {
        previousKey,
        previousLabel: monthLabel(previousKey),
        totals,
        earnedAboveSpendBudget,
        incomeOverSpendCents: Math.max(0, totals.incomeCents - totals.budgetCents),
    };
}

export function dismissMonthReview(data, previousKey) {
    data.settings.monthReviewDismissedFor = previousKey;
}

function currentSavingsLimitCents(data) {
    const savings = data.categories.find(({ id }) => id === SAVINGS_ID);
    const budget = data.settings.monthlyBudgetCents;
    if (savings === undefined || !Number.isFinite(budget)) {
        return 0;
    }
    return savings.limitMode === 'euro'
        ? savings.limitCents
        : euroCentsFromPercent(savings.percent, budget);
}

export function savingsRoomCents(data) {
    const budget = data.settings.monthlyBudgetCents;
    if (!Number.isFinite(budget) || budget <= 0) {
        return 0;
    }
    return Math.max(0, budget - currentSavingsLimitCents(data));
}

/** Raise Savings by up to surplusCents, capped at the monthly spend budget. */
export function applySurplusToSavings(data, surplusCents) {
    const amount = Math.floor(Number(surplusCents));
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    const savings = data.categories.find(({ id }) => id === SAVINGS_ID);
    if (savings === undefined) {
        return null;
    }

    const budget = data.settings.monthlyBudgetCents;
    const appliedCents = Math.min(amount, savingsRoomCents(data));
    if (appliedCents <= 0) {
        return null;
    }

    const nextLimit = currentSavingsLimitCents(data) + appliedCents;
    savings.pinned = true;
    savings.limitMode = 'euro';
    savings.limitCents = nextLimit;
    savings.percent = percentFromEuroCents(nextLimit, budget);
    syncCategoryPlanFields(data.categories, budget);
    refreshCurrentMonthPlan(data);

    return { appliedCents, savingsLimitCents: nextLimit };
}
