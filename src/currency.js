import { formatEuro } from './money.js';

export const CURRENCIES = [
    'EUR',
    'USD',
    'GBP',
    'SEK',
    'NOK',
    'DKK',
    'PLN',
    'CHF',
    'CZK',
    'HUF',
    'RON',
    'BGN',
    'TRY',
    'UAH',
    'RUB',
    'JPY',
    'CNY',
];

/**
 * @param {unknown} code
 * @returns {boolean}
 */
export function isCurrencyCode(code) {
    return typeof code === 'string' && CURRENCIES.includes(code.toUpperCase());
}

/**
 * Formats integer cents in the given ISO currency.
 * EUR renders exactly like money.js formatEuro. Other currencies render as
 * '<CODE> <amount>' with a comma thousands separator and two decimals.
 * @param {number} cents
 * @param {string} currency
 * @returns {string}
 */
export function formatMoney(cents, currency) {
    if (currency === 'EUR') {
        return formatEuro(cents);
    }

    const sign = cents < 0 ? '-' : '';
    const amount = Math.abs(cents) / 100;
    const formatted = amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    return `${currency} ${sign}${formatted}`;
}

/**
 * Short label for a foreign-currency entry, '' when the entry is EUR
 * or has no currency recorded.
 * @param {{ currency?: string, originalAmountCents?: number }} entry
 * @returns {string}
 */
export function describeForeign(entry) {
    if (!entry || !entry.currency || entry.currency === 'EUR') {
        return '';
    }

    return formatMoney(entry.originalAmountCents ?? 0, entry.currency);
}
