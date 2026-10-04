import { SAVINGS_ID, UNCATEGORISED_ID, createId } from './model.js';
import { freezeMonthPlan, spendCents } from './budget.js';
import { incomeStatus } from './incomeSources.js';
import {
    addMonths,
    compareMonthKeys,
    currentMonthKey,
    dateInMonth,
    daysInMonth,
    monthKeyOf,
    todayISO,
} from './months.js';
import { parseAmount } from './money.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(dateISO) {
    const [year, month, day] = dateISO.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

/** Signed whole days from one ISO date to another. */
function daysBetween(fromISO, toISO) {
    return Math.round((utcDay(toISO) - utcDay(fromISO)) / DAY_MS);
}

function lastDayOf(monthKey) {
    return dateInMonth(monthKey, daysInMonth(monthKey));
}

/** True when the entry's date is a real date inside [fromISO, toISO]. */
function inRange(entry, fromISO, toISO) {
    return monthKeyOf(entry.date) !== null && entry.date >= fromISO && entry.date <= toISO;
}

/** '-12,50' -> -1250. Integer cents, or null when the text is not an amount. */
export function parseBalanceInput(text) {
    if (typeof text !== 'string') {
        return null;
    }
    const trimmed = text.trim();
    const negative = trimmed.startsWith('-');
    const cents = parseAmount(negative ? trimmed.slice(1) : trimmed, { allowZero: true });
    if (cents === null) {
        return null;
    }
    return negative && cents !== 0 ? -cents : cents;
}

/** The money at the end of dateISO, or null before the anchor or without one. */
export function balanceAt(data, dateISO) {
    const anchor = data.settings.balanceStart;
    if (!anchor || dateISO < anchor.date) {
        return null;
    }
    const earned = data.incomes
        .filter((entry) => inRange(entry, anchor.date, dateISO))
        .reduce((sum, entry) => sum + entry.amountCents, 0);
    const spent = data.expenses
        .filter((entry) => inRange(entry, anchor.date, dateISO))
        .reduce((sum, entry) => sum + spendCents(entry), 0);
    return anchor.cents + earned - spent;
}

export function moneyNow(data, now = new Date()) {
    return balanceAt(data, todayISO(now));
}

/** The one-time setup: anchors today so that Money now equals what was entered. */
export function setMoneyNow(data, enteredCents, now = new Date()) {
    if (data.settings.balanceStart) {
        return { ok: false, reason: 'Money now is already set.' };
    }
    if (!Number.isSafeInteger(enteredCents)) {
        return { ok: false, reason: 'Enter a valid amount.' };
    }
    const today = todayISO(now);
    data.settings.balanceStart = { cents: 0, date: today };
    const net = balanceAt(data, today);
    data.settings.balanceStart.cents = enteredCents - net;
    return { ok: true };
}

/** Adds one ordinary dated entry for the difference between the bank and Money now. */
export function checkAgainstBank(data, enteredCents, now = new Date()) {
    const currentCents = moneyNow(data, now);
    if (currentCents === null) {
        return { ok: false, reason: 'Set up Money now first.' };
    }
    if (!Number.isSafeInteger(enteredCents)) {
        return { ok: false, reason: 'Enter a valid amount.' };
    }
    const differenceCents = enteredCents - currentCents;
    if (differenceCents === 0) {
        return { ok: true, differenceCents: 0, entry: null };
    }

    const date = todayISO(now);
    const monthKey = monthKeyOf(date);
    const planWasAlreadyFrozen = Object.hasOwn(data.monthPlans, monthKey);
    let entry;
    let type;
    if (differenceCents < 0) {
        type = 'expense';
        entry = {
            id: createId('exp'),
            categoryId: UNCATEGORISED_ID,
            subcategoryId: '',
            amountCents: -differenceCents,
            note: 'Bank difference',
            date,
            currency: 'EUR',
            originalAmountCents: -differenceCents,
            refund: false,
            importId: '',
            bankRef: '',
            fingerprint: '',
            goalId: '',
        };
        data.expenses.push(entry);
    } else {
        type = 'income';
        entry = {
            id: createId('inc'),
            incomeCategoryId: 'income-other',
            amountCents: differenceCents,
            note: 'Bank difference',
            date,
            sourceId: '',
        };
        data.incomes.push(entry);
    }
    freezeMonthPlan(data, monthKey);

    return { ok: true, differenceCents, entry, type, monthKey, planWasAlreadyFrozen };
}

/** Net Savings-category spending from the anchor date to today; reported apart from Money now. */
export function savedCents(data, now = new Date()) {
    const anchor = data.settings.balanceStart;
    if (!anchor) {
        return null;
    }
    const today = todayISO(now);
    return data.expenses
        .filter((entry) => entry.categoryId === SAVINGS_ID && inRange(entry, anchor.date, today))
        .reduce((sum, entry) => sum + spendCents(entry), 0);
}

/** The earliest upcoming payday after today, this month or next; null when there is none. */
export function nextPayday(data, now = new Date()) {
    const today = todayISO(now);
    const thisMonth = currentMonthKey(now);
    let best = null;
    for (const monthKey of [thisMonth, addMonths(thisMonth, 1)]) {
        for (const item of incomeStatus(data, monthKey, now)) {
            if (item.state === 'upcoming' && item.date > today && (best === null || item.date < best.date)) {
                best = { date: item.date, sourceId: item.sourceId, name: item.name };
            }
        }
    }
    return best;
}

/** The per-day amount: Money now over the days to the next payday or month end, or a fixed amount. */
export function perDay(data, now = new Date()) {
    const moneyCents = moneyNow(data, now);
    if (moneyCents === null) {
        return null;
    }
    const today = todayISO(now);

    if (data.settings.perDayMode === 'fixed') {
        const amountCents = data.settings.perDayFixedCents;
        const spentTodayCents = data.expenses
            .filter((entry) => entry.date === today && entry.categoryId !== SAVINGS_ID)
            .reduce((sum, entry) => sum + spendCents(entry), 0);
        return {
            mode: 'fixed',
            amountCents,
            spentTodayCents,
            leftTodayCents: amountCents - spentTodayCents,
            moneyCents,
        };
    }

    const payday = nextPayday(data, now);
    const untilDate = payday ? payday.date : dateInMonth(addMonths(currentMonthKey(now), 1), 1);
    const days = Math.max(1, daysBetween(today, untilDate));
    return {
        mode: 'auto',
        amountCents: Math.floor(moneyCents / days),
        days,
        untilDate,
        untilKind: payday ? 'payday' : 'monthEnd',
        paydayName: payday ? payday.name : '',
        moneyCents,
    };
}

export function setPerDay(data, mode, amountText) {
    if (mode !== 'auto' && mode !== 'fixed') {
        return { ok: false, reason: 'Choose a mode.' };
    }
    if (mode === 'fixed') {
        const cents = parseAmount(amountText);
        if (cents === null) {
            return { ok: false, reason: 'Enter a valid amount greater than zero.' };
        }
        data.settings.perDayFixedCents = cents;
    }
    data.settings.perDayMode = mode;
    return { ok: true };
}

/** Opening and closing money of a month; each opening equals the previous closing. */
export function monthBalance(data, monthKey) {
    const anchor = data.settings.balanceStart;
    if (!anchor) {
        return null;
    }
    const anchorMonth = monthKeyOf(anchor.date);
    const order = compareMonthKeys(monthKey, anchorMonth);
    if (order < 0) {
        return null;
    }
    const closingCents = balanceAt(data, lastDayOf(monthKey));
    if (order === 0) {
        return { openingCents: anchor.cents, closingCents, startsOn: anchor.date };
    }
    return {
        openingCents: balanceAt(data, lastDayOf(addMonths(monthKey, -1))),
        closingCents,
        startsOn: dateInMonth(monthKey, 1),
    };
}
