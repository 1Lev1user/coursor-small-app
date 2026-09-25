import { normalise } from './model.js';
import { todayISO } from './months.js';

export function countRecords(data) {
    return {
        expenses: data.expenses.length,
        incomes: data.incomes.length,
        subscriptions: data.subscriptions.length,
    };
}

export function exportBackup(data, now) {
    return {
        filename: `my-expenses-backup-${todayISO(now)}.json`,
        json: JSON.stringify(data, null, 2),
    };
}

export function importBackup(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        return { ok: false, reason: 'File is not valid JSON.' };
    }

    const result = normalise(parsed);
    if (!result.ok) {
        return { ok: false, reason: result.reason };
    }

    return { ok: true, data: result.data };
}

const LOCAL_SETTINGS = ['userName', 'lastBackupISO', 'backupSnoozedUntil', 'monthReviewDismissedFor'];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

/*
 * Takes plan, categories, subscriptions, rules, templates, goals and bank
 * layouts from a backup and keeps this device's entries, month plans and
 * import history. Categories, subcategories, income categories and goals
 * that local entries still use are kept, so no entry loses its category.
 */
export function mergeSettingsOnly(current, backup) {
    const next = clone(current);
    const incoming = clone(backup);

    next.settings = { ...incoming.settings, setupComplete: true };
    for (const key of LOCAL_SETTINGS) {
        if (Object.hasOwn(current.settings, key)) {
            next.settings[key] = current.settings[key];
        }
    }
    if (String(current.settings.userName ?? '').trim() === '') {
        next.settings.userName = incoming.settings.userName ?? '';
    }

    next.categories = incoming.categories;
    for (const expense of current.expenses) {
        let category = next.categories.find(({ id }) => id === expense.categoryId);
        if (category === undefined) {
            const local = current.categories.find(({ id }) => id === expense.categoryId);
            if (local === undefined) {
                continue;
            }
            category = { ...clone(local), subcategories: [] };
            const systemIndex = next.categories.findIndex(({ system }) => system === true);
            next.categories.splice(systemIndex === -1 ? next.categories.length : systemIndex, 0, category);
        }
        if (
            expense.subcategoryId
            && !category.subcategories.some(({ id }) => id === expense.subcategoryId)
        ) {
            const localCategory = current.categories.find(({ id }) => id === expense.categoryId);
            const localSub = localCategory?.subcategories.find(({ id }) => id === expense.subcategoryId);
            if (localSub !== undefined) {
                category.subcategories.push(clone(localSub));
            }
        }
    }

    next.incomeCategories = incoming.incomeCategories;
    for (const income of current.incomes) {
        if (!next.incomeCategories.some(({ id }) => id === income.incomeCategoryId)) {
            const local = current.incomeCategories.find(({ id }) => id === income.incomeCategoryId);
            if (local !== undefined) {
                next.incomeCategories.push(clone(local));
            }
        }
    }

    next.goals = incoming.goals ?? [];
    for (const expense of current.expenses) {
        if (expense.goalId && !next.goals.some(({ id }) => id === expense.goalId)) {
            const local = (current.goals ?? []).find(({ id }) => id === expense.goalId);
            if (local !== undefined) {
                next.goals.push(clone(local));
            }
        }
    }

    next.subscriptions = incoming.subscriptions;
    next.rules = incoming.rules ?? [];
    next.templates = incoming.templates ?? [];
    next.bankLayouts = incoming.bankLayouts ?? [];
    return next;
}

export function countSettings(data) {
    return {
        categories: data.categories.filter(({ system }) => system !== true).length,
        subscriptions: data.subscriptions.length,
        rules: (data.rules ?? []).length,
        templates: (data.templates ?? []).length,
        goals: (data.goals ?? []).length,
    };
}
