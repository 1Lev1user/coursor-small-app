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
        return !isLoggedThisMonth(data, sub.id, monthKey);
    });
}
