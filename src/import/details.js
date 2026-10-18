// Total IBAN length per country: ISO 13616, the SWIFT IBAN registry, as published in the
// npm package `ibantools` 4.5.4 (jsnext/ibantools.js, `countrySpecs`, entries with
// `IBANRegistry: true`, 97 countries). Lengths copied, no dependency. The check digits
// are not verified on purpose.
const IBAN_LENGTHS = {
    LV: 21, EE: 20, LT: 20, FI: 18, SE: 24, DE: 22, PL: 28, GB: 22, IE: 22, NL: 18,
    BE: 16, FR: 27, ES: 24, IT: 27, AT: 20, DK: 18, NO: 15, CH: 21, LU: 20, CZ: 24,
    SK: 24, PT: 25, MT: 31, CY: 28, GR: 27, HU: 28, RO: 24, BG: 22, HR: 21, SI: 19,
    AD: 24, AE: 23, AL: 28, AX: 18, AZ: 28, BA: 20, BH: 22, BR: 29, BY: 28, CR: 22,
    DO: 28, EG: 29, FO: 18, GE: 22, GF: 27, GI: 23, GL: 18, GP: 27, GT: 28, IL: 23,
    IQ: 23, IS: 26, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LY: 25, MC: 27,
    MD: 24, ME: 22, MF: 27, MK: 19, MN: 20, MQ: 27, MR: 27, MU: 30, NC: 27, NI: 28,
    OM: 23, PF: 27, PK: 24, PM: 27, PS: 29, QA: 29, RE: 27, RS: 22, RU: 33, SA: 24,
    SC: 31, SD: 18, SM: 27, SO: 23, ST: 25, SV: 28, TF: 27, TL: 23, TN: 24, TR: 26,
    UA: 29, VA: 22, VG: 24, WF: 27, XK: 20, YE: 30, YT: 27,
};
const IBAN_SOURCE = `(?:${Object.entries(IBAN_LENGTHS)
    .map(([country, length]) => `${country}\\d{2}[A-Z0-9]{${length - 4}}`)
    .join('|')})`;
const IBAN = new RegExp(`\\b${IBAN_SOURCE}\\b`);
const IBAN_ALL = new RegExp(`\\b${IBAN_SOURCE}\\b`, 'g');
const PERSONAL_CODE_ALL = /\d{6}-\d{5}/g;
// 11 digits without a hyphen are a personal code only when the line names one, or when
// they have the shape of a Latvian code and no invoice or customer word stands within the
// 3 words before them. "no" alone is no label: "Maksa no 01019012345" means "payment from".
const PERSONAL_CODE_WORD = /personas?\s+kod\p{L}*|pers\.\s?kod\p{L}*|(?<![\p{L}\d])p\.\s?k\.?(?![\p{L}])|персональн\p{L}*\s+код\p{L}*/iu;
const CODE_LABEL_WORD = /^(?:rēķin\p{L}*|invoice|inv\.?|nr\.?|№|#|klient\p{L}*|customer|līgum\p{L}*|contract|kont[as]|account|ref\.?|reference|order|pasūtījum\p{L}*|счет\p{L}*|счёт\p{L}*|договор\p{L}*|faktūr\p{L}*|faktur\p{L}*|pavadzīm\p{L}*|numur\p{L}*|номер\p{L}*|kvīt\p{L}*|čeks)[:.,;]*$/iu;
const LABEL_WORDS_BEFORE = 3;
const CARD_MASK_ALL = /\d{4,6}\*+\d{4}/g;

const CARD_LINE = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{4,6}\*+\d{4}\s+MCC-(\d{4})\s+REF:\s*\S+/;
// Swedbank LV: "PIRKUMS <card> <yyyy.mm.dd> [<hh.mm>] <amount> <CCY> (<auth>) <merchant>".
const SWEDBANK_CARD = /^PIRKUMS\s+\d{4,6}\*+\d{4}\s+(\d{4})\.(\d{2})\.(\d{2})(?:\s+\d{2}[.:]\d{2})?\s+(\d[\d.,]*)\s+([A-Z]{3})\b[^()]*?\(\w+\)\s+(.+)$/;
const SWEDBANK_FX_TAIL = /\s+(?:VALŪTAS KURSS|KONVERTĀCIJAS MAKSA|ATTIECĪBĀ PRET ECB)(?=\s|$).*$/;
// SEB: "DD/MM/YYYY HH:MM [<amount> <CCY>(<EUR amount> EUR + fee EUR(<pct>))] <card word>...nnnn <merchant>/<city>/<country> #<id>, ...".
const SEB_CARD = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}\s+(?:(\d+[.,]\d{2})\s+([A-Z]{3})\(\d+[.,]\d{2}\s+EUR\b[^)]*\([^)]*\)\)\s+)?\p{L}+\.{3}\d{4,6}\s+(.+)$/u;
const SEB_CARD_END = /\s+#\d+(?:,.*)?$|,\s*dok\.\s*nr\..*$/;
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

// A Latvian personal code: 32... (new format), or DDMMYY, a century digit 0/1/2, then 4 digits.
function isPersonalCode11(digits) {
    if (digits.startsWith('32')) {
        return true;
    }
    const century = digits[6];
    if (century !== '0' && century !== '1' && century !== '2') {
        return false;
    }
    const year = 1800 + 100 * Number(century) + Number(digits.slice(4, 6));
    return utcDay(year, Number(digits.slice(2, 4)), Number(digits.slice(0, 2))) !== null;
}

function labelBefore(text) {
    return text.split(/\s+/).filter((word) => word !== '').slice(-LABEL_WORDS_BEFORE)
        .some((word) => CODE_LABEL_WORD.test(word.replace(/^[^\p{L}\p{N}№#]+/u, '')));
}

function scrubPersonalCodes11(line) {
    const named = PERSONAL_CODE_WORD.test(line);
    return line.replace(/\b\d{11}\b/g, (digits, offset, whole) => (
        named || (isPersonalCode11(digits) && !labelBefore(whole.slice(0, offset))) ? ' ' : digits
    ));
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

// "1,024.90" or "24.90" to cents; null when it is not an amount or is zero.
function amountCents(text) {
    const m = /^(\d{1,3}(?:[.,]\d{3})+|\d+)[.,](\d{2})$/.exec(text);
    if (!m) {
        return null;
    }
    const cents = Number(m[1].replace(/[.,]/g, '')) * 100 + Number(m[2]);
    return cents > 0 ? cents : null;
}

function withOriginal(result, amountText, currency) {
    const cents = amountCents(amountText);
    return currency !== 'EUR' && cents !== null ? { ...result, original: { cents, currency } } : result;
}

// Removes IBANs, personal codes and card masks from one line of text.
function scrubLine(line) {
    return scrubPersonalCodes11(line.replace(IBAN_ALL, ' ').replace(PERSONAL_CODE_ALL, ' ')).replace(CARD_MASK_ALL, ' ');
}

// Lines after the card line are the description; the merchant and them are scrubbed.
function cardResult(merchant, lines, date) {
    return {
        description: collapse(lines.slice(1).map(scrubLine).join(' ')),
        counterparty: collapse(scrubLine(merchant)),
        date,
        mcc: '',
    };
}

function splitSwedbankCard(m, lines, bookingDate) {
    const result = cardResult(m[6].replace(SWEDBANK_FX_TAIL, ''), lines, cardDate(m[3], m[2], m[1], bookingDate));
    return withOriginal(result, m[4], m[5]);
}

function splitSebCard(m, lines, bookingDate) {
    const merchant = m[6].replace(SEB_CARD_END, '').replace(/\/[^/]+\/[A-Z]{3}$/, '');
    return withOriginal(cardResult(merchant, lines, cardDate(m[1], m[2], m[3], bookingDate)), m[4] ?? '', m[5]);
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
        .filter((line, index) => index !== partyIndex && !PAYER_REFERENCE.test(line))
        .map(scrubLine)
        .join(' ');

    return { description: collapse(description), counterparty: collapse(party.slice(0, end)), date: '', mcc: '' };
}

/**
 * Splits the bank's multi-line "details" cell into the payee, the payment text,
 * the day a card payment was really made and its merchant category code.
 * Card payment: "DD/MM/YYYY mask MCC-nnnn REF: n" then the merchant line.
 * Transfer: a line with NAME [code] [bank] [BIC] IBAN (a real IBAN of a registry
 * country and length) is the payee; the other lines, before and after it, are the
 * description, without IBANs, personal codes and card masks. A personal code is
 * NNNNNN-NNNNN, or 11 digits when the line says "personas kods" / "p.k." or the digits
 * are a valid Latvian code not labelled as an invoice, customer or contract number.
 * Only the payer
 * reference line is dropped. Anything else keeps the whole text as the description.
 * Swedbank card text "PIRKUMS <card> <yyyy.mm.dd> ... <amount> <CCY> (<auth>) <merchant>" and
 * SEB card text "DD/MM/YYYY HH:MM [<amount> <CCY>(...)] <card word>...nnnn <merchant>/<city>/<country> #..."
 * give the merchant, the card date and no mask. For a currency other than EUR the result also
 * has `original: { cents, currency }`; it is absent otherwise.
 * `date` is 'YYYY-MM-DD' only for a real card date 0 to 60 days before `bookingDate`.
 * @param {string} text
 * @param {string} bookingDate YYYY-MM-DD
 * @returns {{ description: string, counterparty: string, date: string, mcc: string,
 *   original?: { cents: number, currency: string } }}
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

    const first = lines[0] ?? '';
    const swedbank = SWEDBANK_CARD.exec(first);
    if (swedbank) {
        return splitSwedbankCard(swedbank, lines, bookingDate);
    }
    const seb = SEB_CARD.exec(first);
    if (seb) {
        return splitSebCard(seb, lines, bookingDate);
    }

    const transfer = lines.length >= 2 ? splitTransfer(lines) : null;
    return transfer ?? { description: collapse(lines.join(' ')), counterparty: '', date: '', mcc: '' };
}
