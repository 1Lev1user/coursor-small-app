const euroFormatter = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
});

/**
 * Parses user typed money into integer cents. Returns null for invalid input.
 * By default requires a positive amount; pass `{ allowZero: true }` to accept 0.
 * Accepts thousands groups of three digits (space, 1,234.56, 1.234,56); a lone "1,234" or "1.234" stays refused.
 * @param {unknown} input
 * @param {{ allowZero?: boolean }} [options]
 * @returns {number | null}
 */
export function parseAmount(input, options = {}) {
    if (typeof input !== 'string') {
        return null;
    }

    const trimmed = input.trim();
    if (trimmed === '') {
        return null;
    }

    const spaceGroups = /^\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d{1,2})?$/.test(trimmed);
    const commaGroups = /^(\d{1,3}(?:,\d{3})+)(\.\d{1,2})?$/.exec(trimmed);
    const dotGroups = /^(\d{1,3}(?:\.\d{3})+)(,\d{1,2})?$/.exec(trimmed);
    let normalized = trimmed.replace(',', '.');
    if (spaceGroups) {
        normalized = trimmed.replace(/[ \u00A0\u202F]/g, '').replace(',', '.');
    } else if (commaGroups && (commaGroups[1].split(',').length > 2 || commaGroups[2] !== undefined)) {
        normalized = trimmed.replace(/,/g, '');
    } else if (dotGroups && (dotGroups[1].split('.').length > 2 || dotGroups[2] !== undefined)) {
        normalized = trimmed.replace(/\./g, '').replace(',', '.');
    }

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        return null;
    }

    const [wholePart, decimalPart = ''] = normalized.split('.');
    const cents = Number(wholePart) * 100 + Number(decimalPart.padEnd(2, '0'));
    const allowZero = options.allowZero === true;

    if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
        return null;
    }

    return cents;
}

/**
 * Says why `parseAmount` refused the input; returns '' when the input is accepted.
 * @param {unknown} input
 * @param {{ allowZero?: boolean }} [options]
 * @returns {string}
 */
export function amountProblem(input, { allowZero = false } = {}) {
    if (parseAmount(input, { allowZero }) !== null) {
        return '';
    }
    const trimmed = typeof input === 'string' ? input.trim() : '';
    if (trimmed === '') {
        return 'Enter an amount.';
    }
    if (trimmed.startsWith('-')) {
        return 'Amounts cannot be negative.';
    }
    if (parseAmount(trimmed, { allowZero: true }) === 0) {
        return 'Enter an amount greater than zero.';
    }
    return 'Use a number like 1234.56 or 1234,56, with at most two decimals.';
}

/**
 * Formats integer cents for display with EUR symbol.
 * @param {number} cents
 * @returns {string}
 */
export function formatEuro(cents) {
    const formatted = euroFormatter.format(cents / 100);

    if (cents < 0 && !formatted.startsWith('-')) {
        return `-${formatted.replace('-', '')}`;
    }

    return formatted;
}

/**
 * Formats integer cents with no currency symbol or thousands separator.
 * @param {number} cents
 * @param {string} [decimalSeparator='.']
 * @returns {string}
 */
export function formatPlain(cents, decimalSeparator = '.') {
    const sign = cents < 0 ? '-' : '';
    const absolute = Math.abs(cents);
    const euros = Math.floor(absolute / 100);
    const remainder = String(absolute % 100).padStart(2, '0');

    return `${sign}${euros}${decimalSeparator}${remainder}`;
}

/**
 * Splits total cents across percentage shares with no lost or invented cents.
 * @param {number} totalCents
 * @param {number[]} percentages
 * @returns {number[]}
 */
export function splitShares(totalCents, percentages) {
    if (percentages.length === 0) {
        return [];
    }

    const sumPercentages = percentages.reduce((sum, p) => sum + p, 0);
    const target = Math.round(totalCents * sumPercentages / 100);
    const each = percentages.map((p) => Math.floor(totalCents * p / 100));
    let remainder = target - each.reduce((sum, value) => sum + value, 0);

    if (remainder !== 0) {
        for (let i = percentages.length - 1; i >= 0; i -= 1) {
            if (percentages[i] > 0) {
                each[i] += remainder;
                break;
            }
        }
    }

    return each;
}
