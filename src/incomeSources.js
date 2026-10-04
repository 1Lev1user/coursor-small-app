import {
    addMonths,
    compareMonthKeys,
    currentMonthKey,
    dateInMonth,
    isInMonth,
    monthKeyOf,
    todayISO,
} from './months.js';
import { createId } from './model.js';
import { parseAmount } from './money.js';
import { canAddIncomeSource } from './limits.js';

/** How many months back a payday that was never confirmed is still offered. */
export const CATCH_UP_MONTHS = 12;
/** A bank-import income row may be the payday of a source when it falls this many days from it. */
export const PAYDAY_MATCH_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

function isMonthKey(value) {
    return typeof value === 'string' && monthKeyOf(`${value}-01`) === value;
}

function utcDay(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

function daysBetween(first, second) {
    return Math.round(Math.abs(utcDay(first) - utcDay(second)) / DAY_MS);
}

function findSource(data, id) {
    return data.incomeSources.find((source) => source.id === id);
}

function sourceBody({ name, expectedCents, dayOfMonth, incomeCategoryId }) {
    return { name, expectedCents, dayOfMonth, incomeCategoryId };
}

/** 'YYYY-MM' of the one-time setup, or '' when the new counting is not set up. */
export function countingStartMonth(data) {
    return monthKeyOf(data.settings.balanceStart?.date) ?? '';
}

/** True from the setup month on; earlier months keep the old rule. */
export function usesNewCounting(data, monthKey) {
    const start = countingStartMonth(data);
    return start !== '' && isMonthKey(monthKey) && compareMonthKeys(monthKey, start) >= 0;
}

/** Smallest month with an expense, an income or a plan, '' when there is none. */
export function earliestDataMonth(data) {
    const months = [
        ...data.expenses.map((entry) => monthKeyOf(entry.date)),
        ...data.incomes.map((entry) => monthKeyOf(entry.date)),
        ...Object.keys(data.monthPlans ?? {}),
    ].filter(isMonthKey);
    return months.reduce(
        (earliest, month) => (earliest === '' || compareMonthKeys(month, earliest) < 0 ? month : earliest),
        '',
    );
}

/** First month the owner has had: its data, else the setup month, else this month. */
export function firstTrackedMonth(data, now = new Date()) {
    return earliestDataMonth(data) || countingStartMonth(data) || currentMonthKey(now);
}

/** The payday is the set date, clamped to the month length. */
export function paydayDate(monthKey, source) {
    return dateInMonth(monthKey, source.dayOfMonth);
}

function statusItem(data, monthKey, source, today) {
    const date = paydayDate(monthKey, source);
    const entries = data.incomes.filter(
        (entry) => entry.sourceId === source.id && isInMonth(entry.date, monthKey),
    );
    let state = 'due';
    if (entries.length > 0) {
        state = 'received';
    } else if (source.skippedMonths.includes(monthKey)) {
        state = 'skipped';
    } else if (source.startDate !== '' && date <= source.startDate) {
        return null;
    } else if (date > today) {
        state = 'upcoming';
    }
    return {
        sourceId: source.id,
        name: source.name,
        incomeCategoryId: source.incomeCategoryId,
        date,
        expectedCents: source.expectedCents,
        receivedCents: entries.reduce((sum, entry) => sum + entry.amountCents, 0),
        entryIds: entries.map((entry) => entry.id),
        state,
    };
}

/** One item per source for the month, in source order; empty before the new counting starts. */
export function incomeStatus(data, monthKey, now = new Date()) {
    if (!usesNewCounting(data, monthKey)) {
        return [];
    }
    const today = todayISO(now);
    return data.incomeSources
        .map((source) => statusItem(data, monthKey, source, today))
        .filter((item) => item !== null);
}

/** Paydays that passed without being confirmed or skipped, oldest first. */
export function dueIncomes(data, now = new Date()) {
    const start = countingStartMonth(data);
    if (start === '') {
        return [];
    }
    const thisMonth = currentMonthKey(now);
    const windowStart = addMonths(thisMonth, 1 - CATCH_UP_MONTHS);
    const first = compareMonthKeys(start, windowStart) > 0 ? start : windowStart;
    const due = [];
    for (let month = first; compareMonthKeys(month, thisMonth) <= 0; month = addMonths(month, 1)) {
        for (const item of incomeStatus(data, month, now)) {
            if (item.state === 'due') {
                due.push({
                    source: findSource(data, item.sourceId),
                    monthKey: month,
                    date: item.date,
                    expectedCents: item.expectedCents,
                });
            }
        }
    }
    return due.sort((a, b) => a.date.localeCompare(b.date));
}

/** Income of the month that is tied to an existing source, and the rest. */
export function monthIncomeSplit(data, monthKey) {
    let sourceIncomeCents = 0;
    let extraIncomeCents = 0;
    for (const entry of data.incomes) {
        if (!isInMonth(entry.date, monthKey)) {
            continue;
        }
        if (findSource(data, entry.sourceId) !== undefined) {
            sourceIncomeCents += entry.amountCents;
        } else {
            extraIncomeCents += entry.amountCents;
        }
    }
    return { sourceIncomeCents, extraIncomeCents, totalCents: sourceIncomeCents + extraIncomeCents };
}

/**
 * The source an import income row might be the payday of, or null. It only suggests;
 * nothing is tied until the owner confirms, and the amount is never looked at.
 */
export function suggestIncomeSource(data, row, takenKeys = new Set(), now = new Date()) {
    const monthKey = monthKeyOf(row?.date);
    if (monthKey === null || row.direction !== 'in') {
        return null;
    }
    let best = null;
    let bestDistance = PAYDAY_MATCH_DAYS + 1;
    for (const item of incomeStatus(data, monthKey, now)) {
        if (item.state === 'received' || takenKeys.has(`${item.sourceId}:${monthKey}`)) {
            continue;
        }
        const distance = daysBetween(item.date, row.date);
        if (distance < bestDistance) {
            best = item.sourceId;
            bestDistance = distance;
        }
    }
    return best === null ? null : findSource(data, best);
}

/** Checks the raw form strings; the value has no id, startDate or skippedMonths. */
export function validateIncomeSource(fields) {
    const name = String(fields.name ?? '').trim();
    if (name === '' || name.length > 40) {
        return { ok: false, field: 'name', reason: 'Enter a name.' };
    }
    const expectedCents = parseAmount(String(fields.amount ?? ''));
    if (expectedCents === null) {
        return { ok: false, field: 'amount', reason: 'Enter a valid amount greater than zero.' };
    }
    const dayText = String(fields.dayOfMonth ?? '').trim();
    const dayOfMonth = Number(dayText);
    if (!/^\d+$/.test(dayText) || dayOfMonth < 1 || dayOfMonth > 31) {
        return { ok: false, field: 'day', reason: 'Enter a day from 1 to 31.' };
    }
    const incomeCategoryId = String(fields.incomeCategoryId ?? '').trim();
    if (incomeCategoryId === '') {
        return { ok: false, field: 'category', reason: 'Choose an income category.' };
    }
    return { ok: true, value: { name, expectedCents, dayOfMonth, incomeCategoryId } };
}

export function addIncomeSource(data, value, now = new Date()) {
    const allowed = canAddIncomeSource(data);
    if (!allowed.ok) {
        return allowed;
    }
    const source = {
        id: createId('incsrc'),
        ...sourceBody(value),
        startDate: todayISO(now),
        skippedMonths: [],
    };
    data.incomeSources.push(source);
    return { ok: true, source };
}

/** Replaces name, amount, day and category; keeps startDate and skippedMonths. */
export function updateIncomeSource(data, id, value) {
    const source = findSource(data, id);
    if (source === undefined) {
        return false;
    }
    Object.assign(source, sourceBody(value));
    return true;
}

/** Removes the source; its entries stay and then belong to no source. */
export function deleteIncomeSource(data, id) {
    const index = data.incomeSources.findIndex((source) => source.id === id);
    if (index === -1) {
        return false;
    }
    data.incomeSources.splice(index, 1);
    return true;
}

export function skipIncomeMonth(data, id, monthKey) {
    const source = findSource(data, id);
    if (source === undefined || !isMonthKey(monthKey)) {
        return false;
    }
    if (!source.skippedMonths.includes(monthKey)) {
        source.skippedMonths.push(monthKey);
    }
    return true;
}
