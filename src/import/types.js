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
 * @property {string} [mcc] four-digit merchant category code of a card payment; absent otherwise
 * @property {'transfer'|'refund'} [kindHint] what the bank's own transaction type suggests; absent otherwise
 * @property {true} [reversal] the bank marks this entry as a reversal (camt only); absent otherwise
 */

/**
 * The money the bank says is on the account at the end of the statement. Optional on a reader result:
 * the key is absent when the file has no EUR balance.
 * @typedef {object} ClosingBalance
 * @property {number} cents signed EUR cents (a negative balance is below zero)
 * @property {string} date YYYY-MM-DD
 */

export const FORMATS = ['fidavista', 'camt', 'csv', 'xlsx', 'xls', 'paste'];

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
        ...(/^\d{4}$/.test(fields.mcc ?? '') ? { mcc: fields.mcc } : {}),
        ...(fields.kindHint === 'transfer' || fields.kindHint === 'refund' ? { kindHint: fields.kindHint } : {}),
        ...(fields.reversal === true ? { reversal: true } : {}),
    };
}

function pairText(value) {
    return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function pairDay(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 : NaN;
}

function pairAmount(row) {
    return Number.isInteger(row.amountCents) ? `${row.amountCents}` : `${row.currency}${row.originalAmountCents}`;
}

/**
 * Reversal rows paired with the row they cancel: [reversalIndex, originalIndex] pairs.
 * The original is not a reversal itself, goes the other way, has the same currency and amount, and shares a
 * non-empty bank reference or counterparty with the reversal. Two passes over all reversals: reference matches
 * first, then counterparty-only matches among the rows still free. Within a pass the nearest date wins, then the
 * lower row index. A row is used at most once. `eligible(index)` can exclude rows.
 * @param {StatementRow[]} rows
 * @param {(index: number) => boolean} [eligible]
 * @returns {Array<[number, number]>}
 */
export function pairReversals(rows, eligible = () => true) {
    const candidates = [];
    rows.forEach((reversal, r) => {
        if (reversal.reversal !== true || !eligible(r)) return;
        const party = pairText(reversal.counterparty);
        rows.forEach((original, o) => {
            if (o === r || original.reversal === true || !eligible(o)) return;
            if (original.direction === reversal.direction || original.currency !== reversal.currency
                || pairAmount(original) !== pairAmount(reversal)) return;
            const byRef = reversal.bankRef !== '' && original.bankRef === reversal.bankRef;
            if (!byRef && (party === '' || pairText(original.counterparty) !== party)) return;
            const gap = Math.abs(pairDay(original.date) - pairDay(reversal.date)) || 0;
            candidates.push({ r, o, byRef, gap });
        });
    });
    candidates.sort((a, b) => b.byRef - a.byRef || a.gap - b.gap || a.r - b.r || a.o - b.o);

    const used = new Set();
    const pairs = [];
    for (const { r, o } of candidates) {
        if (used.has(r) || used.has(o)) continue;
        used.add(r);
        used.add(o);
        pairs.push([r, o]);
    }
    return pairs;
}

/** @param {ClosingBalance|null} [closingBalance] added to the result only when it is valid */
export function parserOk(format, rows, warnings = [], closingBalance = null) {
    const valid = closingBalance !== null && Number.isSafeInteger(closingBalance.cents)
        && /^\d{4}-\d{2}-\d{2}$/.test(closingBalance.date);
    return { ok: true, format, rows, warnings, ...(valid ? { closingBalance } : {}) };
}

export function parserFail(reason) {
    return { ok: false, reason };
}
