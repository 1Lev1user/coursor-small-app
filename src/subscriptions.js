import {
    clampDay,
    currentMonthKey,
    dayOf,
    monthKeyOf,
    todayISO,
} from './months.js';

/**
 * True if any expense in that month is tagged with subscriptionId.
 * @param {{ expenses: Array<{ date: string, subscriptionId?: string }> }} data
 * @param {string} subscriptionId
 * @param {string} monthKey
 * @returns {boolean}
 */
export function isLoggedThisMonth(data, subscriptionId, monthKey) {
    return data.expenses.some(
        (expense) => expense.subscriptionId === subscriptionId
            && monthKeyOf(expense.date) === monthKey,
    );
}

/**
 * Subscriptions that should prompt right now (current calendar month of `now`).
 * @param {{ subscriptions: Array<{ id: string, name: string, amountCents: number, dayOfMonth: number }>, expenses: Array<{ date: string, subscriptionId?: string }> }} data
 * @param {Date} [now]
 * @returns {typeof data.subscriptions}
 */
export function dueSubscriptions(data, now = new Date()) {
    const monthKey = currentMonthKey(now);
    const today = dayOf(todayISO(now));
    const subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];

    return subscriptions.filter((sub) => {
        const dueDay = clampDay(monthKey, sub.dayOfMonth);
        if (today < dueDay) {
            return false;
        }
        if ((sub.skippedMonths ?? []).includes(monthKey)) {
            return false;
        }
        return !isLoggedThisMonth(data, sub.id, monthKey);
    });
}

/**
 * Marks one month of a subscription as skipped (the key is stored once).
 * @param {{ subscriptions: Array<{ id: string, skippedMonths?: string[] }> }} data
 * @param {string} subscriptionId
 * @param {string} monthKey
 * @returns {boolean} false when the subscription does not exist
 */
export function skipSubscriptionMonth(data, subscriptionId, monthKey) {
    const subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
    const sub = subscriptions.find(({ id }) => id === subscriptionId);
    if (sub === undefined) {
        return false;
    }
    sub.skippedMonths ??= [];
    if (!sub.skippedMonths.includes(monthKey)) {
        sub.skippedMonths.push(monthKey);
    }
    return true;
}

function normalizeWords(text) {
    const words = String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    return words === '' ? '' : ` ${words} `;
}

/**
 * True when `name` appears in `text` as whole words (case, diacritics and punctuation ignored).
 * An empty name never matches.
 * @param {string} name
 * @param {string} text
 * @returns {boolean}
 */
export function nameAppearsIn(name, text) {
    const wanted = normalizeWords(name);
    return wanted !== '' && normalizeWords(text).includes(wanted);
}
