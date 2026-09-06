import { splitShares } from './money.js';
import { currentMonthKey, isInMonth } from './months.js';

export function percentFromEuroCents(limitCents, monthlyBudgetCents) {
    if (!Number.isFinite(limitCents) || !Number.isFinite(monthlyBudgetCents) || monthlyBudgetCents <= 0) {
        return 0;
    }
    return (limitCents * 100) / monthlyBudgetCents;
}

export function euroCentsFromPercent(percent, monthlyBudgetCents) {
    if (!Number.isFinite(percent) || !Number.isFinite(monthlyBudgetCents) || monthlyBudgetCents <= 0) {
        return 0;
    }
    return splitShares(monthlyBudgetCents, [percent])[0];
}

export function isNoLimitCategory(category) {
    return category?.system !== true
        && category?.pinned !== true
        && category?.limitMode === 'none';
}

/** Mutates user categories in place: sync percent ↔ limitCents from limitMode. */
export function syncCategoryPlanFields(categories, monthlyBudgetCents) {
    for (const category of categories) {
        if (category.system === true) continue;
        if (category.limitMode === 'none') {
            category.pinned = false;
            category.percent = 0;
            category.limitCents = 0;
            continue;
        }
        if (category.pinned !== true) {
            if (category.limitMode !== 'percent' && category.limitMode !== 'euro') {
                category.limitMode = 'percent';
            }
            continue;
        }
        if (category.limitMode === 'euro') {
            category.percent = percentFromEuroCents(category.limitCents, monthlyBudgetCents);
        } else {
            category.limitMode = 'percent';
            category.limitCents = euroCentsFromPercent(category.percent, monthlyBudgetCents);
        }
    }
}

export function resolvePlan(categories, monthlyBudgetCents) {
    syncCategoryPlanFields(categories, monthlyBudgetCents);
    const included = categories.filter(({ system }) => system !== true);
    const pinnedTotalPercent = included
        .filter(({ pinned }) => pinned === true)
        .reduce((total, { percent }) => total + percent, 0);
    const leftoverPercent = Math.max(0, 100 - pinnedTotalPercent);
    const flexibleCount = included.filter(
        (category) => category.pinned !== true && category.limitMode !== 'none',
    ).length;
    const flexiblePercentEach = flexibleCount === 0
        ? 0
        : leftoverPercent / flexibleCount;
    const noLimitCount = included.filter(isNoLimitCategory).length;

    const entries = included.map(({ id, name, pinned, percent, limitMode }) => {
        const noLimit = pinned !== true && limitMode === 'none';
        return {
            id,
            name,
            pinned: pinned === true,
            noLimit,
            percent: pinned === true
                ? percent
                : (noLimit ? 0 : flexiblePercentEach),
        };
    });
    const limits = splitShares(
        monthlyBudgetCents,
        entries.map(({ percent }) => percent),
    );
    entries.forEach((entry, index) => {
        entry.limitCents = entry.noLimit === true ? 0 : limits[index];
    });

    const unallocatedPercent = flexibleCount === 0 ? leftoverPercent : 0;
    const unallocatedCents = unallocatedPercent === 0
        ? 0
        : splitShares(monthlyBudgetCents, [unallocatedPercent])[0];

    return {
        entries,
        pinnedTotalPercent,
        leftoverPercent,
        flexibleCount,
        flexiblePercentEach,
        noLimitCount,
        unallocatedPercent,
        unallocatedCents,
        warnings: {
            flexibleWithoutBudget: flexibleCount > 0 && leftoverPercent === 0,
            pinnedOverflow: pinnedTotalPercent > 100,
        },
    };
}

export function canSetPinned(categories, categoryId, percent) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return {
            ok: false,
            reason: 'Pinned percentage must be a number from 0% to 100%.',
        };
    }

    const otherPinnedTotal = categories.reduce((total, category) => {
        if (
            category.system === true
            || category.pinned !== true
            || category.id === categoryId
        ) {
            return total;
        }
        return total + category.percent;
    }, 0);
    const pinnedTotalPercent = otherPinnedTotal + percent;

    return {
        ok: true,
        pinnedTotalPercent,
        overflow: pinnedTotalPercent > 100,
    };
}

export function buildPlanSnapshot(data) {
    const resolved = resolvePlan(
        data.categories,
        data.settings.monthlyBudgetCents,
    );

    return {
        monthlyBudgetCents: data.settings.monthlyBudgetCents,
        usualMonthlyIncomeCents: data.settings.usualMonthlyIncomeCents,
        entries: resolved.entries,
        unallocatedPercent: resolved.unallocatedPercent,
        unallocatedCents: resolved.unallocatedCents,
    };
}

function copyPlanSnapshot(plan) {
    return {
        ...plan,
        entries: plan.entries.map((entry) => ({ ...entry })),
    };
}

export function getMonthPlan(data, monthKey) {
    if (Object.hasOwn(data.monthPlans, monthKey)) {
        return copyPlanSnapshot(data.monthPlans[monthKey]);
    }

    return buildPlanSnapshot(data);
}

export function freezeMonthPlan(data, monthKey) {
    if (!Object.hasOwn(data.monthPlans, monthKey)) {
        data.monthPlans[monthKey] = buildPlanSnapshot(data);
    }

    return copyPlanSnapshot(data.monthPlans[monthKey]);
}

export function refreshCurrentMonthPlan(data, now = new Date()) {
    const monthKey = currentMonthKey(now);
    if (!Object.hasOwn(data.monthPlans, monthKey)) {
        return undefined;
    }

    data.monthPlans[monthKey] = buildPlanSnapshot(data);
    return copyPlanSnapshot(data.monthPlans[monthKey]);
}

export function monthTotals(data, monthKey) {
    const plan = getMonthPlan(data, monthKey);
    const monthExpenses = data.expenses.filter(({ date }) => isInMonth(date, monthKey));
    const spendingByCategory = new Map();

    for (const { categoryId, amountCents } of monthExpenses) {
        spendingByCategory.set(
            categoryId,
            (spendingByCategory.get(categoryId) ?? 0) + amountCents,
        );
    }

    const categoriesById = new Map(
        data.categories.map((category) => [category.id, category]),
    );
    const categoryTotals = plan.entries.map((entry) => {
        const spentCents = spendingByCategory.get(entry.id) ?? 0;
        spendingByCategory.delete(entry.id);
        return categoryTotal(entry, spentCents);
    });

    for (const [id, spentCents] of spendingByCategory) {
        categoryTotals.push(categoryTotal({
            id,
            name: categoriesById.get(id)?.name ?? id,
            percent: 0,
            limitCents: 0,
        }, spentCents));
    }

    const spentCents = monthExpenses.reduce(
        (total, expense) => total + expense.amountCents,
        0,
    );
    const extraIncomeCents = data.incomes
        .filter(({ date }) => isInMonth(date, monthKey))
        .reduce((total, entry) => total + entry.amountCents, 0);
    const usualIncomeCents = plan.usualMonthlyIncomeCents;
    const incomeCents = usualIncomeCents + extraIncomeCents;
    const budgetCents = plan.monthlyBudgetCents;

    return {
        monthKey,
        budgetCents,
        spentCents,
        usualIncomeCents,
        extraIncomeCents,
        incomeCents,
        budgetLeftCents: budgetCents - spentCents,
        cashLeftCents: incomeCents - spentCents,
        categories: categoryTotals,
    };
}

function categoryTotal(entry, spentCents) {
    const noLimit = entry.noLimit === true;
    const limitCents = noLimit ? 0 : entry.limitCents;
    const over = noLimit ? false : spentCents > limitCents;
    return {
        id: entry.id,
        name: entry.name,
        percent: entry.percent,
        limitCents,
        noLimit,
        spentCents,
        remainingCents: noLimit ? 0 : limitCents - spentCents,
        over,
        overByCents: noLimit ? 0 : Math.max(0, spentCents - limitCents),
    };
}

export function subcategoryTotals(data, monthKey, categoryId) {
    const category = data.categories.find(({ id }) => id === categoryId);
    if (!category) {
        return [];
    }

    const subcategoriesById = new Map(
        category.subcategories.map((subcategory) => [subcategory.id, subcategory]),
    );
    const spendingBySubcategory = new Map();

    for (const expense of data.expenses) {
        if (
            expense.categoryId !== categoryId
            || !isInMonth(expense.date, monthKey)
        ) {
            continue;
        }

        const id = subcategoriesById.has(expense.subcategoryId)
            ? expense.subcategoryId
            : '';
        spendingBySubcategory.set(
            id,
            (spendingBySubcategory.get(id) ?? 0) + expense.amountCents,
        );
    }

    return [...spendingBySubcategory].map(([id, spentCents]) => ({
        id,
        name: id === '' ? 'Unspecified' : subcategoriesById.get(id).name,
        spentCents,
    })).sort((first, second) => second.spentCents - first.spentCents);
}

/**
 * Income analytics: usual Plan salary plus extra income by category.
 */
export function incomeBreakdown(data, monthKey) {
    const plan = getMonthPlan(data, monthKey);
    const knownIds = new Set(data.incomeCategories.map(({ id }) => id));
    const amountsByCategory = new Map();

    for (const income of data.incomes) {
        if (!isInMonth(income.date, monthKey)) {
            continue;
        }
        const id = knownIds.has(income.incomeCategoryId) ? income.incomeCategoryId : '';
        amountsByCategory.set(
            id,
            (amountsByCategory.get(id) ?? 0) + income.amountCents,
        );
    }

    const entries = [];
    const usualIncomeCents = plan.usualMonthlyIncomeCents;
    if (usualIncomeCents > 0) {
        entries.push({
            id: 'usual-plan',
            name: 'Usual salary (Plan)',
            amountCents: usualIncomeCents,
            fromPlan: true,
        });
    }

    for (const category of data.incomeCategories) {
        const amountCents = amountsByCategory.get(category.id) ?? 0;
        if (amountCents <= 0) {
            continue;
        }
        entries.push({
            id: category.id,
            name: category.name,
            amountCents,
            fromPlan: false,
        });
    }

    const orphanCents = amountsByCategory.get('') ?? 0;
    if (orphanCents > 0) {
        entries.push({
            id: '',
            name: 'Unspecified',
            amountCents: orphanCents,
            fromPlan: false,
        });
    }

    entries.sort((first, second) => second.amountCents - first.amountCents);

    const totalCents = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
    return {
        monthKey,
        usualIncomeCents,
        extraIncomeCents: Math.max(0, totalCents - usualIncomeCents),
        totalCents,
        entries,
    };
}
