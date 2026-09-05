const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

function pad2(value) {
    return String(value).padStart(2, '0');
}

function isLeapYear(year) {
    if (year % 400 === 0) {
        return true;
    }
    if (year % 100 === 0) {
        return false;
    }
    return year % 4 === 0;
}

function daysInMonthParts(year, month) {
    if (month === 2) {
        return isLeapYear(year) ? 29 : 28;
    }
    if (month === 4 || month === 6 || month === 9 || month === 11) {
        return 30;
    }
    return 31;
}

function parseMonthKey(monthKey) {
    if (typeof monthKey !== 'string') {
        return null;
    }

    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
        return null;
    }

    return { year, month };
}

function parseDateStr(dateStr) {
    if (typeof dateStr !== 'string') {
        return null;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1) {
        return null;
    }

    if (day > daysInMonthParts(year, month)) {
        return null;
    }

    return { year, month, day };
}

export function todayISO(now = new Date()) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function currentMonthKey(now = new Date()) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function monthKeyOf(dateStr) {
    const parsed = parseDateStr(dateStr);
    if (!parsed) {
        return null;
    }

    return `${parsed.year}-${pad2(parsed.month)}`;
}

export function dayOf(dateStr) {
    const parsed = parseDateStr(dateStr);
    if (!parsed) {
        return null;
    }

    return parsed.day;
}

export function addMonths(monthKey, delta) {
    const parsed = parseMonthKey(monthKey);
    let { year, month } = parsed;
    month += delta;

    while (month > 12) {
        month -= 12;
        year += 1;
    }

    while (month < 1) {
        month += 12;
        year -= 1;
    }

    return `${year}-${pad2(month)}`;
}

export function daysInMonth(monthKey) {
    const parsed = parseMonthKey(monthKey);
    return daysInMonthParts(parsed.year, parsed.month);
}

export function clampDay(monthKey, day) {
    const maxDay = daysInMonth(monthKey);
    return Math.max(1, Math.min(day, maxDay));
}

export function monthLabel(monthKey) {
    const parsed = parseMonthKey(monthKey);
    return `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

export function dateInMonth(monthKey, day) {
    const parsed = parseMonthKey(monthKey);
    const clampedDay = clampDay(monthKey, day);
    return `${parsed.year}-${pad2(parsed.month)}-${pad2(clampedDay)}`;
}

export function isInMonth(dateStr, monthKey) {
    const key = monthKeyOf(dateStr);
    if (key === null) {
        return false;
    }

    return key === monthKey;
}

export function compareMonthKeys(a, b) {
    const first = parseMonthKey(a);
    const second = parseMonthKey(b);

    if (first.year !== second.year) {
        return first.year - second.year;
    }

    return first.month - second.month;
}
