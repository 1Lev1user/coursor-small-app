const IBAN_SOURCE = '[A-Z]{2}\\d{2}[A-Z0-9]{11,30}';
const IBAN = new RegExp(`\\b${IBAN_SOURCE}\\b`);
const IBAN_ALL = new RegExp(`\\b${IBAN_SOURCE}\\b`, 'g');
const PERSONAL_CODE_ALL = /\d{6}-\d{5}/g;

const CARD_LINE = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{4,6}\*+\d{4}\s+MCC-(\d{4})\s+REF:\s*\S+/;
const PAYER_REFERENCE = /^Maksātāja reference:/i;
const MAX_CARD_DATE_AGE_DAYS = 60;

// Where the party line stops being a name: the first of these marks the end.
const PARTY_NAME_END = [
    /\d{6}-\d{5}/,
    /\b\d{11}\b/,
    /\b[A-Z]+ AS IN LATVIA\b/,
    /\bAS "?[A-Z]+ BANKA"?/,
    new RegExp(`\\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?(?=\\s+${IBAN_SOURCE}\\b)`),
    IBAN,
];

function collapse(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function utcDay(year, month, day) {
    const ms = Date.UTC(year, month - 1, day);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        return null;
    }
    return ms / 86400000;
}

function cardDate(day, month, year, bookingDate) {
    const booking = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(bookingDate ?? ''));
    if (!booking) {
        return '';
    }
    const bookingDay = utcDay(Number(booking[1]), Number(booking[2]), Number(booking[3]));
    const cardDay = utcDay(Number(year), Number(month), Number(day));
    if (bookingDay === null || cardDay === null) {
        return '';
    }
    const age = bookingDay - cardDay;
    return age >= 0 && age <= MAX_CARD_DATE_AGE_DAYS ? `${year}-${month}-${day}` : '';
}

function splitCardPayment(lines, card, bookingDate) {
    const merchant = (lines[1] ?? '').replace(/\s+[A-Z]{2}(?:\s+\S+)?$/, '');
    return {
        description: '',
        counterparty: collapse(merchant),
        date: cardDate(card[1], card[2], card[3], bookingDate),
        mcc: card[4],
    };
}

function splitTransfer(lines) {
    let partyIndex = -1;
    lines.forEach((line, index) => {
        if (!PAYER_REFERENCE.test(line) && IBAN.test(line)) {
            partyIndex = index;
        }
    });
    if (partyIndex < 0) {
        return null;
    }

    const party = lines[partyIndex];
    const end = Math.min(...PARTY_NAME_END.map((pattern) => {
        const match = pattern.exec(party);
        return match ? match.index : party.length;
    }));

    const description = lines
        .slice(0, partyIndex)
        .filter((line) => !PAYER_REFERENCE.test(line))
        .map((line) => line.replace(IBAN_ALL, ' ').replace(PERSONAL_CODE_ALL, ' '))
        .join(' ');

    return { description: collapse(description), counterparty: collapse(party.slice(0, end)), date: '', mcc: '' };
}

/**
 * Splits the bank's multi-line "details" cell into the payee, the payment text,
 * the day a card payment was really made and its merchant category code.
 * Card payment: "DD/MM/YYYY mask MCC-nnnn REF: n" then the merchant line.
 * Transfer: purpose lines, then a line with NAME [code] [bank] [BIC] IBAN, then
 * an optional payer reference. Anything else keeps the whole text as the description.
 * `date` is 'YYYY-MM-DD' only for a real card date 0 to 60 days before `bookingDate`.
 * @param {string} text
 * @param {string} bookingDate YYYY-MM-DD
 * @returns {{ description: string, counterparty: string, date: string, mcc: string }}
 */
export function splitBankDetails(text, bookingDate) {
    const lines = String(text ?? '')
        .split(/\r\n|\r|\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');

    const card = lines.length > 0 ? CARD_LINE.exec(lines[0]) : null;
    if (card) {
        return splitCardPayment(lines, card, bookingDate);
    }

    const transfer = lines.length >= 2 ? splitTransfer(lines) : null;
    return transfer ?? { description: collapse(lines.join(' ')), counterparty: '', date: '', mcc: '' };
}
