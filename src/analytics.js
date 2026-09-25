import { monthTotals } from './budget.js';
import { formatPlain } from './money.js';
import {
    addMonths,
    compareMonthKeys,
    currentMonthKey,
    isInMonth,
    monthLabel,
} from './months.js';

/*
 * monthTotals counts the plan's usual income for any month. For history
 * and year views, only months that have happened and were in use count it:
 * not future months and not months before the app was used.
 */
function actualTotals(data, monthKey, now) {
    const totals = monthTotals(data, monthKey);
    const inUse = Object.hasOwn(data.monthPlans ?? {}, monthKey)
        || data.expenses.some(({ date }) => isInMonth(date, monthKey))
        || data.incomes.some(({ date }) => isInMonth(date, monthKey));
    const happened = compareMonthKeys(monthKey, currentMonthKey(now)) <= 0;
    if (inUse && happened) {
        return totals;
    }
    return {
        ...totals,
        usualIncomeCents: 0,
        incomeCents: totals.incomeCents - totals.usualIncomeCents,
        cashLeftCents: totals.cashLeftCents - totals.usualIncomeCents,
    };
}

/**
 * @param {object} data
 * @param {string} endMonthKey
 * @param {number} [count]
 * @returns {{ monthKey: string, spentCents: number, incomeCents: number, budgetCents: number }[]}
 */
export function monthSeries(data, endMonthKey, count = 12, now = new Date()) {
    const startMonthKey = addMonths(endMonthKey, -(count - 1));
    const series = [];
    let monthKey = startMonthKey;

    for (let index = 0; index < count; index += 1) {
        const totals = actualTotals(data, monthKey, now);
        series.push({
            monthKey,
            spentCents: totals.spentCents,
            incomeCents: totals.incomeCents,
            budgetCents: totals.budgetCents,
        });
        monthKey = addMonths(monthKey, 1);
    }

    return series;
}

function categoryMapFor(data, monthKey) {
    return new Map(monthTotals(data, monthKey).categories.map((category) => [category.id, category]));
}

function hasExpenseData(data, monthKey) {
    return data.expenses.some((expense) => isInMonth(expense.date, monthKey));
}

/**
 * Current month vs previous month, and vs the average of up to 6 preceding
 * months that have any expense data. Sorted by absolute change, largest first.
 * @param {object} data
 * @param {string} monthKey
 * @returns {{ id: string, name: string, currentCents: number, previousCents: number, averageCents: number, deltaCents: number }[]}
 */
export function categoryChanges(data, monthKey) {
    const currentMap = categoryMapFor(data, monthKey);
    const previousMonthKey = addMonths(monthKey, -1);
    const previousMap = categoryMapFor(data, previousMonthKey);

    const averageMonthMaps = [];
    for (let back = 1; back <= 6; back += 1) {
        const candidateMonthKey = addMonths(monthKey, -back);
        if (hasExpenseData(data, candidateMonthKey)) {
            averageMonthMaps.push(categoryMapFor(data, candidateMonthKey));
        }
    }

    const ids = new Set([
        ...currentMap.keys(),
        ...previousMap.keys(),
        ...averageMonthMaps.flatMap((map) => [...map.keys()]),
    ]);

    const changes = [...ids].map((id) => {
        const currentCents = currentMap.get(id)?.spentCents ?? 0;
        const previousCents = previousMap.get(id)?.spentCents ?? 0;
        const name = currentMap.get(id)?.name
            ?? previousMap.get(id)?.name
            ?? averageMonthMaps.find((map) => map.has(id))?.get(id)?.name
            ?? data.categories.find((category) => category.id === id)?.name
            ?? id;
        const averageCents = averageMonthMaps.length === 0
            ? 0
            : Math.round(
                averageMonthMaps.reduce((total, map) => total + (map.get(id)?.spentCents ?? 0), 0)
                / averageMonthMaps.length,
            );

        return {
            id,
            name,
            currentCents,
            previousCents,
            averageCents,
            deltaCents: currentCents - previousCents,
        };
    });

    changes.sort((first, second) => Math.abs(second.deltaCents) - Math.abs(first.deltaCents));

    return changes;
}

/**
 * @param {object} data
 * @param {number} year
 * @returns {{ months: object[], spentCents: number, incomeCents: number, byCategory: { id: string, name: string, spentCents: number }[] }}
 */
export function yearTotals(data, year, now = new Date()) {
    const months = [];
    for (let month = 1; month <= 12; month += 1) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        months.push(actualTotals(data, monthKey, now));
    }

    const spentCents = months.reduce((total, month) => total + month.spentCents, 0);
    const incomeCents = months.reduce((total, month) => total + month.incomeCents, 0);

    const byCategoryMap = new Map();
    for (const month of months) {
        for (const category of month.categories) {
            const existing = byCategoryMap.get(category.id);
            const name = data.categories.find((entry) => entry.id === category.id)?.name
                ?? existing?.name
                ?? category.name;
            byCategoryMap.set(category.id, {
                id: category.id,
                name,
                spentCents: (existing?.spentCents ?? 0) + category.spentCents,
            });
        }
    }

    const byCategory = [...byCategoryMap.values()]
        .sort((first, second) => second.spentCents - first.spentCents);

    return { months, spentCents, incomeCents, byCategory };
}

const BOM = '﻿';

function escapeField(value, delimiter) {
    const text = String(value ?? '');
    if (
        text.includes(delimiter)
        || text.includes('"')
        || text.includes('\n')
        || text.includes('\r')
    ) {
        return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
}

/**
 * @param {object} data
 * @param {number} year
 * @param {'europe'|'standard'} flavour
 * @returns {{ filename: string, text: string }}
 */
export function buildYearCsv(data, year, flavour, now = new Date()) {
    const delimiter = flavour === 'europe' ? ';' : ',';
    const decimalSeparator = flavour === 'europe' ? ',' : '.';
    const totals = yearTotals(data, year, now);
    const categoryIds = totals.byCategory.map((category) => category.id);

    const header = [
        'Month',
        'Spent',
        'Income',
        'Budget',
        ...totals.byCategory.map((category) => category.name),
    ].map((field) => escapeField(field, delimiter)).join(delimiter);

    const rows = totals.months.map((month) => {
        const categoriesById = new Map(month.categories.map((category) => [category.id, category]));
        const fields = [
            monthLabel(month.monthKey),
            formatPlain(month.spentCents, decimalSeparator),
            formatPlain(month.incomeCents, decimalSeparator),
            formatPlain(month.budgetCents, decimalSeparator),
            ...categoryIds.map((id) => formatPlain(categoriesById.get(id)?.spentCents ?? 0, decimalSeparator)),
        ];
        return fields.map((field) => escapeField(field, delimiter)).join(delimiter);
    });

    return {
        filename: `my-expenses-${year}-${flavour}.csv`,
        text: `${BOM}${[header, ...rows].join('\n')}\n`,
    };
}
