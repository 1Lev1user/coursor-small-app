/**
 * @typedef {object} StatementRow
 * @property {string} date YYYY-MM-DD
 * @property {number|null} amountCents EUR actually charged or received; null when the file only has a foreign amount
 * @property {'out'|'in'} direction
 * @property {string} currency ISO 4217 code of the original amount
 * @property {number} originalAmountCents amount in `currency`
 * @property {string} description
 * @property {string} counterparty
 * @property {string} bankRef
 */

export const FORMATS = ['fidavista', 'camt', 'csv', 'xlsx', 'paste'];

export function statementRow(fields) {
    const currency = typeof fields.currency === 'string' && /^[A-Z]{3}$/.test(fields.currency)
        ? fields.currency
        : 'EUR';
    const original = Number.isInteger(fields.originalAmountCents)
        ? Math.abs(fields.originalAmountCents)
        : Math.abs(fields.amountCents ?? 0);
    const amount = Number.isInteger(fields.amountCents)
        ? Math.abs(fields.amountCents)
        : (currency === 'EUR' ? original : null);

    return {
        date: fields.date,
        amountCents: amount,
        direction: fields.direction === 'in' ? 'in' : 'out',
        currency,
        originalAmountCents: original,
        description: String(fields.description ?? '').replace(/\s+/g, ' ').trim(),
        counterparty: String(fields.counterparty ?? '').replace(/\s+/g, ' ').trim(),
        bankRef: String(fields.bankRef ?? '').trim(),
    };
}

export function parserOk(format, rows, warnings = []) {
    return { ok: true, format, rows, warnings };
}

export function parserFail(reason) {
    return { ok: false, reason };
}
