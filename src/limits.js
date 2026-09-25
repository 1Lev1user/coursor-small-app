/** Soft caps so lists and charts stay usable on a phone. */
export const MAX_EXPENSE_CATEGORIES = 50;
export const MAX_INCOME_CATEGORIES = 50;
export const MAX_SUBCATEGORIES = 500;

export function userExpenseCategoryCount(data) {
    return data.categories.filter((category) => category.system !== true).length;
}

export function incomeCategoryCount(data) {
    return data.incomeCategories.length;
}

export function subcategoryCount(data) {
    return data.categories.reduce(
        (total, category) => total + (category.subcategories?.length ?? 0),
        0,
    );
}

export function canAddExpenseCategory(data) {
    if (userExpenseCategoryCount(data) >= MAX_EXPENSE_CATEGORIES) {
        return {
            ok: false,
            reason: `You can have at most ${MAX_EXPENSE_CATEGORIES} expense categories.`,
        };
    }
    return { ok: true };
}

export function canAddIncomeCategory(data) {
    if (incomeCategoryCount(data) >= MAX_INCOME_CATEGORIES) {
        return {
            ok: false,
            reason: `You can have at most ${MAX_INCOME_CATEGORIES} income categories.`,
        };
    }
    return { ok: true };
}

export function canAddSubcategory(data) {
    if (subcategoryCount(data) >= MAX_SUBCATEGORIES) {
        return {
            ok: false,
            reason: `You can have at most ${MAX_SUBCATEGORIES} subcategories in total.`,
        };
    }
    return { ok: true };
}
