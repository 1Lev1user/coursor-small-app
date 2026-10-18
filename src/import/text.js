import { statementRow } from './types.js';
import { splitBankDetails } from './details.js';

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

function hasBom(bytes, bom) {
    if (bytes.length < bom.length) {
        return false;
    }
    for (let i = 0; i < bom.length; i += 1) {
        if (bytes[i] !== bom[i]) {
            return false;
        }
    }
    return true;
}

const SNIFF_LIMIT = 4096;
const NUL_SHARE = 0.3;
const MIN_CYRILLIC = 20;
const CYRILLIC_LETTER = /[\u0400-\u04ff]/g;
// Latvian, Lithuanian and Estonian letters that windows-1257 puts in the high bytes.
const BALTIC_LETTER = /[āčēģīķļņšūžąęėįųōõäöüĀČĒĢĪĶĻŅŠŪŽĄĘĖĮŲŌÕÄÖÜ]/g;

// UTF-16 text without a BOM is mostly ASCII, so every other byte is 0x00.
function sniffUtf16WithoutBom(bytes) {
    const sample = bytes.subarray(0, SNIFF_LIMIT);
    if (sample.length < 2) {
        return null;
    }
    let oddZeros = 0;
    let evenZeros = 0;
    for (let i = 0; i < sample.length; i += 1) {
        if (sample[i] === 0) {
            if (i % 2 === 1) {
                oddZeros += 1;
            } else {
                evenZeros += 1;
            }
        }
    }
    const le = oddZeros / Math.floor(sample.length / 2);
    const be = evenZeros / Math.ceil(sample.length / 2);
    if (le >= NUL_SHARE && le >= be) {
        return 'utf-16le';
    }
    return be >= NUL_SHARE ? 'utf-16be' : null;
}

function countMatches(text, pattern) {
    return (text.match(pattern) ?? []).length;
}

// Both legacy codepages are single-byte: the one that reads as real letters wins.
function looksLikeWindows1251(bytes) {
    try {
        const sample = bytes.subarray(0, SNIFF_LIMIT);
        const cyrillic = countMatches(new TextDecoder('windows-1251').decode(sample), CYRILLIC_LETTER);
        const baltic = countMatches(new TextDecoder('windows-1257').decode(sample), BALTIC_LETTER);
        return cyrillic >= MIN_CYRILLIC && cyrillic > baltic;
    } catch {
        return false;
    }
}

/**
 * Decodes raw file bytes into text, working out the encoding.
 * Strips a BOM (UTF-8 or UTF-16) when present. Without a BOM, UTF-16 is
 * recognised by the share of 0x00 bytes. Then tries strict UTF-8, then
 * windows-1251 (Russian) when the bytes read as Cyrillic, else windows-1257
 * (Baltic) for legacy bank exports, and windows-1252 if this runtime has no
 * windows-1257 label at all.
 * @param {Uint8Array} bytes
 * @returns {{ text: string, encoding: 'utf-8'|'utf-16le'|'utf-16be'|'windows-1251'|'windows-1257'|'windows-1252' }}
 */
export function decodeBytes(bytes) {
    if (hasBom(bytes, BOM_UTF16LE)) {
        return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
    }
    if (hasBom(bytes, BOM_UTF16BE)) {
        return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
    }

    const body = hasBom(bytes, BOM_UTF8) ? bytes.subarray(3) : bytes;

    const utf16 = sniffUtf16WithoutBom(body);
    if (utf16) {
        return { text: new TextDecoder(utf16).decode(body), encoding: utf16 };
    }

    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
    } catch {
        // not valid UTF-8, fall through to the legacy codepages
    }

    if (looksLikeWindows1251(body)) {
        return { text: new TextDecoder('windows-1251').decode(body), encoding: 'windows-1251' };
    }

    try {
        return { text: new TextDecoder('windows-1257').decode(body), encoding: 'windows-1257' };
    } catch {
        return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' };
    }
}

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'];

function isBlankRow(row) {
    return row.length === 0 || (row.length === 1 && row[0].trim() === '');
}

function tokenize(text, delimiter, lenient = false) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const len = text.length;

    while (i < len) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                continue;
            }
            field += ch;
            i += 1;
            continue;
        }

        if (ch === '"' && !lenient && field.trim() === '') {
            inQuotes = true;
            i += 1;
            continue;
        }

        if (ch === delimiter) {
            row.push(field);
            field = '';
            i += 1;
            continue;
        }

        if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && text[i + 1] === '\n') {
                i += 1;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            i += 1;
            continue;
        }

        field += ch;
        i += 1;
    }

    if (inQuotes) {
        return tokenize(text, delimiter, true);
    }

    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function scoreDelimiter(text, delimiter) {
    const rows = tokenize(text, delimiter).filter((row) => !isBlankRow(row));
    const firstDate = rows.findIndex((row) => row.some((cell) => isDateLikeValue(String(cell ?? '').trim())));
    const start = firstDate > 0 ? firstDate - 1 : 0;
    const sample = rows.slice(start, start + 20);
    if (sample.length === 0) {
        return { rows, score: -1, strayQuotes: 0 };
    }

    let strayQuotes = 0;
    for (const row of sample) {
        for (const cell of row) {
            strayQuotes += String(cell ?? '').split('"').length - 1;
        }
    }

    const counts = new Map();
    for (const row of sample) {
        counts.set(row.length, (counts.get(row.length) || 0) + 1);
    }

    let dominantCount = 0;
    let dominantFreq = 0;
    for (const [count, freq] of counts) {
        if (freq > dominantFreq || (freq === dominantFreq && count > dominantCount)) {
            dominantFreq = freq;
            dominantCount = count;
        }
    }

    if (dominantCount < 2) {
        return { rows, score: 0, strayQuotes };
    }

    const consistency = dominantFreq / sample.length;
    return { rows, score: consistency + dominantCount / 1000, strayQuotes };
}

/**
 * Detects the delimiter among , ; TAB | by consistency of field counts over
 * over a window of 20 non-empty lines that starts one line above the first
 * line holding a date-like cell (so a long preamble does not hide the table),
 * and tokenizes the whole text with it. On an equal score above 0 the
 * candidate with fewer quote characters left in its fields wins.
 * Full RFC 4180 quoting: "" escapes a quote, delimiters and newlines may
 * appear inside quoted fields, CRLF and LF both work. A quote opens a quoted
 * field only at the start of a field, and an unterminated quote falls back to
 * treating every quote as an ordinary character. Empty lines (including a
 * trailing one) are dropped.
 * @param {string} text
 * @returns {{ delimiter: string, rows: string[][] }}
 */
export function parseDelimited(text) {
    const normalized = String(text ?? '').replace(/^﻿/, '');
    let best = null;
    let bestDelimiter = ',';

    for (const delimiter of DELIMITER_CANDIDATES) {
        const result = scoreDelimiter(normalized, delimiter);
        const tiedWithFewerQuotes = best
            && result.score === best.score
            && result.score > 0
            && result.strayQuotes < best.strayQuotes;
        if (!best || result.score > best.score || tiedWithFewerQuotes) {
            best = result;
            bestDelimiter = delimiter;
        }
    }

    return { delimiter: bestDelimiter, rows: best ? best.rows : [] };
}

function stripDiacritics(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeText(value) {
    return stripDiacritics(String(value ?? '')).toLowerCase().trim();
}

function isNumericOrDateCell(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
        return false;
    }
    if (!/\d/.test(trimmed)) {
        return false;
    }
    if (!/[a-zA-ZÀ-ɏЀ-ӿ]/.test(trimmed)) {
        return true;
    }
    return /^\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/.test(trimmed);
}

/** Index of the last non-blank cell plus one (trailing blank cells do not count). */
function trimmedLength(row) {
    let length = row.length;
    while (length > 0 && String(row[length - 1] ?? '').trim() === '') {
        length -= 1;
    }
    return length;
}

/**
 * A header row names at least half of the columns (a title line like
 * 'Konta izraksts;;;;' has only one filled cell) and holds no numeric or
 * date-like cell.
 */
function isTextHeaderCandidate(row, width) {
    const nonEmpty = row.filter((cell) => String(cell ?? '').trim() !== '');
    if (nonEmpty.length < Math.max(2, Math.ceil(width / 2))) {
        return false;
    }
    return !nonEmpty.some(isNumericOrDateCell);
}

/** Most frequent trimmed row length among rows of 2+ cells; ties go to the larger. */
function dominantWidth(rows) {
    const counts = new Map();
    for (const row of rows) {
        const length = trimmedLength(row);
        if (length >= 2) {
            counts.set(length, (counts.get(length) || 0) + 1);
        }
    }
    let dominant = 0;
    let dominantFreq = 0;
    for (const [length, freq] of counts) {
        if (freq > dominantFreq || (freq === dominantFreq && length > dominant)) {
            dominantFreq = freq;
            dominant = length;
        }
    }
    return dominant;
}

/**
 * Index of the first row whose cell in the date column is date-like, or -1.
 * The date column is the one with the most date-like cells (ties go to the
 * lower index), so a date inside a preamble line does not count as data.
 */
function firstDataRow(rows) {
    const hits = [];
    for (const row of rows) {
        row.forEach((cell, index) => {
            if (isDateLikeValue(String(cell ?? '').trim())) {
                hits[index] = (hits[index] || 0) + 1;
            }
        });
    }
    let dateColumn = -1;
    let best = 0;
    hits.forEach((count, index) => {
        if (count > best) {
            best = count;
            dateColumn = index;
        }
    });
    if (dateColumn < 0) {
        return -1;
    }
    return rows.findIndex((row) => isDateLikeValue(String(row[dateColumn] ?? '').trim()));
}

/** The earlier rule, kept for files where no row has a date (e.g. '17 Sep 2026'): equal row width. */
function findHeaderRowSameWidth(rows) {
    const counts = new Map();
    for (const row of rows) {
        if (row.length === 0) {
            continue;
        }
        counts.set(row.length, (counts.get(row.length) || 0) + 1);
    }

    let dominant = 0;
    let dominantFreq = 0;
    for (const [count, freq] of counts) {
        if (freq > dominantFreq) {
            dominantFreq = freq;
            dominant = count;
        }
    }
    if (dominant < 2) {
        return -1;
    }

    for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].length === dominant && isTextHeaderCandidate(rows[i], dominant)) {
            return i;
        }
    }

    return -1;
}

/**
 * Finds the header row, skipping preamble lines (account number, period,
 * bank name): the nearest all-text row above the first data row (the first
 * row with a date in the date column) that names at least half of the
 * columns. Widths are compared after trimming trailing blank cells and are
 * not required to be equal, so a header and data rows may differ in width.
 * When that finds nothing it falls back to the first all-text row of the
 * dominant width. Returns -1 when nothing looks like a header (e.g. pasted
 * data with no header row at all).
 * @param {string[][]} rows
 * @returns {number}
 */
export function findHeaderRow(rows) {
    const dominant = dominantWidth(rows);
    if (dominant >= 2) {
        for (let i = firstDataRow(rows) - 1; i >= 0; i -= 1) {
            if (isTextHeaderCandidate(rows[i], dominant)) {
                return i;
            }
        }
    }

    return findHeaderRowSameWidth(rows);
}

const KEYWORDS = {
    date: ['datums', 'дата', 'kuupaev', 'data', 'date', 'laikas'],
    debit: ['debit', 'debets', 'debetas', 'дебет', 'deebet', 'исходящ'],
    credit: ['credit', 'kredit', 'кредит', 'kreedit'],
    amount: ['amount', 'summa', 'сумма', 'suma', 'value'],
    direction: ['d/k', 'd/c', 'db/cr', 'debit/credit', 'debets/kredits', 'direction', 'tips', 'veids', 'zime', 'sign', 'тип', 'type'],
    currency: ['currency', 'valuta', 'валюта', 'valuuta', 'valiuta'],
    // Only the bank's own unique id: a payer 'reference' repeats every month (rent).
    bankRef: [
        'transaction id', 'transaction reference', 'bank reference', 'arhiva kods', 'arhiva numurs',
        'dokumenta nr', 'dokumenta numurs', 'doc no', 'id транзакции', 'номер документа',
        'trans. nr', 'trans nr', 'transakcijas nr', 'transakcijas numurs', 'darijuma nr', 'номер транзакции',
        'arhiveerimistunnus', 'archiving code', 'kande viide', 'transakcijos kodas', 'transferwise id',
    ],
    description: ['description', 'details', 'detalas', 'apraksts', 'назначение', 'описание', 'selgitus', 'paskirtis', 'narrative', 'memo', 'purpose', 'komentars', 'informacija'],
    counterparty: ['payee', 'counterparty', 'beneficiary', 'partneris', 'nosaukums', 'sanemejs', 'maksatajs', 'получатель', 'плательщик', 'saaja', 'saaja/maksja nimi', 'partner name', 'gavejo pavadinimas', 'sender/receiver name'],
};

// An account's name or number is not the shop or person ('Konta nosaukums', 'Account name').
const NOT_COUNTERPARTY_WORDS = ['account', 'konta', 'konto', 'konts', 'iban', 'kods', 'code', 'number', 'saskaita'];
const NOT_COUNTERPARTY_TOKENS = ['nr'];
// The details header only when no other header names them ('Payment Reference' in N26).
const FALLBACK_DESCRIPTION_WORD = 'payment reference';
const NOT_SIDE_WORDS = ['istaig', 'original'];

const CATEGORY_ORDER = ['date', 'debit', 'credit', 'amount', 'direction', 'currency', 'bankRef', 'description', 'counterparty', 'status'];

// Exact words after normalisation: 'Statement details' must not match.
const STATUS_HEADERS = ['status', 'state', 'statuss', 'statusas', 'olek', 'состояние', 'статус'];
const TYPE_HEADER_WORDS = ['type', 'tips', 'veids', 'тип'];
// Transaction types of a Revolut-style export; a type column is taken only when a sample is one of these.
const REVOLUT_TYPES = ['CARD PAYMENT', 'TOPUP', 'EXCHANGE', 'CARD REFUND', 'ATM'];
// TRANSFER is not hinted: it also covers payments to other people, which are real spending.
const KIND_HINT_BY_TYPE = { TOPUP: 'transfer', EXCHANGE: 'transfer', 'CARD REFUND': 'refund' };
// Swedbank record type column: 20 is a transaction; 10, 82, 86 and 900 are balance and turnover lines.
const RECORD_TYPE_HEADERS = ['ieraksta tips', 'reatuup', 'kirje tuup', 'record type'];
const RECORD_TYPE_CODES = ['10', '20', '82', '86', '900'];
// Status words (normalised, lower case) of rows whose money did not move; any other value imports.
const NOT_COMPLETED = ['pending', 'reverted', 'reversed', 'declined', 'failed', 'cancelled', 'canceled', 'rejected', 'rezervets'];

// Exact words after normalisation: 'Fee type', 'Free text' and 'Total fees' (a breakdown) must not match.
const FEE_HEADERS = ['fee', 'komisija', 'komisijas maksa', 'mokestis', 'tasu', 'комиссия'];
// PayPal lists Gross, Fee and Net: Net is already the money moved.
const NET_HEADERS = ['net'];
const BALANCE_HEADERS = ['balance', 'running balance', 'saldo', 'atlikums', 'likutis', 'jaak', 'остаток', 'баланс'];

function isStatusHeader(normalized) {
    return STATUS_HEADERS.includes(normalized) || normalized.startsWith('status ');
}

/** 'CARD_PAYMENT' and 'Card Payment' (older and newer exports) both become 'CARD PAYMENT'. */
function typeKey(value) {
    return String(value ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function emptyColumns() {
    return { date: -1, amount: -1, description: -1, currency: -1, direction: -1, debit: -1, credit: -1, bankRef: -1 };
}

function usedIndexes(columns) {
    return new Set(Object.values(columns).filter((index) => index >= 0));
}

function columnSamples(sampleRows, index) {
    return sampleRows
        .map((row) => (index >= 0 && index < row.length ? String(row[index] ?? '').trim() : ''))
        .filter((value) => value !== '');
}

function isDateLikeValue(value) {
    return /^\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/.test(value);
}

const OUT_VALUES = ['D', 'DR', 'DB', 'DBIT', 'DEBIT', 'DEBET', 'DEBETS', 'DEEBET', 'Д', 'ДЕБЕТ', 'OUT', '-', 'IZDEVUMI', 'IZMAKSA', 'EXPENSE', 'РАСХОД'];
const IN_VALUES = ['C', 'K', 'CR', 'CRDT', 'CREDIT', 'KREDIT', 'KREDITS', 'KREEDIT', 'К', 'КРЕДИТ', 'IN', '+', 'IENAKUMI', 'IEMAKSA', 'INCOME', 'ПРИХОД'];
const DIRECTION_BY_VALUE = new Map([
    ...OUT_VALUES.map((value) => [value, 'out']),
    ...IN_VALUES.map((value) => [value, 'in']),
]);

/** 'out', 'in' or null for a direction cell; detection and use share this table. */
function directionOfValue(value) {
    return DIRECTION_BY_VALUE.get(stripDiacritics(String(value ?? '')).trim().toUpperCase()) ?? null;
}

/**
 * A direction cell holds a D/C/K letter or a debit/credit word, never a
 * transaction type such as CARD_PAYMENT or TOPUP.
 * @param {string} value
 * @returns {boolean}
 */
export function isDirectionValue(value) {
    return directionOfValue(value) !== null;
}

function isAmountLikeValue(value) {
    return parseAmountWith(value, '.') !== null || parseAmountWith(value, ',') !== null;
}

function guessDecimalSeparator(sampleRows, columns) {
    const indexes = [columns.amount, columns.debit, columns.credit].filter((index) => index >= 0);
    for (const index of indexes) {
        for (const value of columnSamples(sampleRows, index)) {
            const match = /\d([.,])\d{1,2}\)?-?$/.exec(stripAmountDecoration(value).text);
            if (match) {
                return match[1];
            }
        }
    }
    return '.';
}

/** First unused column whose header is exactly one of the words and whose samples all look like amounts, or -1. */
function findExactColumn(normalizedHeader, words, used, sampleRows) {
    for (let i = 0; i < normalizedHeader.length; i += 1) {
        if (!used.has(i) && words.includes(normalizedHeader[i]) && columnSamples(sampleRows, i).every(isAmountLikeValue)) {
            return i;
        }
    }
    return -1;
}

/**
 * Compares the Balance column with the amounts of neighbouring rows of one
 * currency, to tell whether the fee is added to the amount (balance moves by
 * amount minus fee) or already included in it (balance moves by the amount).
 * Both row orders (oldest or newest first) are tried and the better one is
 * used; only rows with a non-zero fee can tell the two apart. Only a signed
 * single Amount column is checked. A tie keeps the fee ('added').
 * @param {string[]} header
 * @param {string[][]} sampleRows
 * @param {object} columns
 * @param {'.'|','} decimalSeparator
 * @returns {{ mode: 'added'|'included'|'unknown', added: number, included: number, checked: number }}
 */
export function checkFeeAgainstBalance(header, sampleRows, columns, decimalSeparator) {
    const unknown = { mode: 'unknown', added: 0, included: 0, checked: 0 };
    if (columns.amount < 0 || columns.debit >= 0 || columns.credit >= 0 || columns.fee < 0) {
        return unknown;
    }
    const normalizedHeader = header.map(normalizeText);
    const balanceIndex = findExactColumn(normalizedHeader, BALANCE_HEADERS, usedIndexes(columns), sampleRows);
    if (balanceIndex < 0) {
        return unknown;
    }

    const points = [];
    for (const row of sampleRows) {
        const balance = parseAmountWith(cellAt(row, balanceIndex), decimalSeparator);
        const amount = parseAmountWith(cellAt(row, columns.amount), decimalSeparator);
        if (balance === null || amount === null) {
            continue;
        }
        const fee = Math.abs(parseAmountWith(cellAt(row, columns.fee), decimalSeparator) ?? 0);
        const currency = cellAt(row, columns.currency).trim().toUpperCase();
        points.push({ balance, amount, fee, currency });
    }

    const oldestFirst = countBalanceFits(points, true);
    const newestFirst = countBalanceFits(points, false);
    const best = newestFirst.added + newestFirst.included > oldestFirst.added + oldestFirst.included ? newestFirst : oldestFirst;
    if (best.added + best.included > 0) {
        best.mode = best.included > best.added ? 'included' : 'added';
    }
    return best;
}

/** A row's balance moves by its own amount from the older row's balance; the rows are listed oldest or newest first. */
function countBalanceFits(points, oldestFirst) {
    const count = { mode: 'unknown', added: 0, included: 0, checked: 0 };
    for (let i = 0; i + 1 < points.length; i += 1) {
        const [older, newer] = oldestFirst ? [points[i], points[i + 1]] : [points[i + 1], points[i]];
        if (older.currency !== newer.currency || newer.fee === 0) {
            continue;
        }
        const delta = newer.balance - older.balance;
        count.checked += 1;
        if (delta === newer.amount - newer.fee) count.added += 1;
        if (delta === newer.amount) count.included += 1;
    }
    return count;
}

/**
 * Guesses which column holds what, by keyword (EN/LV/RU/ET/LT, case and
 * diacritics insensitive), then by content when no header word matches:
 * a column where every sample parses as a date, or as a 2-decimal amount;
 * description falls back to the longest text column with the most distinct
 * values.
 * @param {string[]} header
 * @param {string[][]} allSampleRows rows under the header; repeats of the header line are ignored
 * @returns {{ columns: object, dateFormat: string|null, decimalSeparator: string, confidence: number }}
 */
export function guessColumns(header, allSampleRows) {
    const normalizedHeader = header.map(normalizeText);
    const sampleRows = allSampleRows.filter((row) => !isHeaderRepeat(row, header));
    const columns = emptyColumns();
    let dateVia = null;
    let amountVia = null;
    let descriptionVia = null;

    for (const category of CATEGORY_ORDER) {
        const keywords = KEYWORDS[category];
        const used = usedIndexes(columns);
        for (let i = 0; i < normalizedHeader.length; i += 1) {
            if (used.has(i)) {
                continue;
            }
            const isDateHeader = KEYWORDS.date.some((keyword) => normalizedHeader[i].includes(keyword));
            if (category !== 'date' && isDateHeader) {
                // 'Value date' is a date, never the amount.
                continue;
            }
            if (
                category === 'amount'
                && !columnSamples(sampleRows, i).every(isAmountLikeValue)
            ) {
                continue;
            }
            const matches = category === 'status'
                ? isStatusHeader(normalizedHeader[i])
                : keywords.some((keyword) => normalizedHeader[i].includes(keyword));
            if (matches && category === 'counterparty'
                && (NOT_COUNTERPARTY_WORDS.some((word) => normalizedHeader[i].includes(word))
                    || normalizedHeader[i].split(/[^\p{L}]+/u).some((word) => NOT_COUNTERPARTY_TOKENS.includes(word)))) {
                continue;
            }
            if (matches && ['debit', 'credit', 'currency'].includes(category)
                && NOT_SIDE_WORDS.some((word) => normalizedHeader[i].includes(word))) {
                continue;
            }
            if (matches) {
                columns[category] = i;
                if (category === 'date') {
                    dateVia = 'keyword';
                }
                if (category === 'amount') {
                    amountVia = 'keyword';
                }
                if (category === 'description') {
                    descriptionVia = 'keyword';
                }
                break;
            }
        }
    }

    if (columns.description === -1) {
        const used = usedIndexes(columns);
        const index = normalizedHeader.findIndex((h, i) => !used.has(i) && h.includes(FALLBACK_DESCRIPTION_WORD));
        if (index >= 0) {
            columns.description = index;
            descriptionVia = 'keyword';
        }
    }

    if (normalizedHeader.includes('payer name') && normalizedHeader.includes('payee name')) {
        delete columns.counterparty;
    }

    for (const key of ['debit', 'credit']) {
        const samples = columnSamples(sampleRows, columns[key]);
        // One column named after both sides ('Debets/Kredīts') with signed amounts is the Amount column.
        if (columns[key] >= 0 && columns.amount === -1 && samples.length > 0
            && KEYWORDS.debit.some((word) => normalizedHeader[columns[key]].includes(word))
            && KEYWORDS.credit.some((word) => normalizedHeader[columns[key]].includes(word))
            && samples.every(isAmountLikeValue) && !samples.every(isDirectionValue)) {
            columns.amount = columns[key];
            columns[key] = -1;
            amountVia = 'keyword';
            continue;
        }
        if (columns[key] >= 0 && samples.length > 0 && samples.every(isDirectionValue)) {
            columns.direction = columns[key];
            columns[key] = -1;
        }
    }
    if (columns.direction >= 0) {
        const samples = columnSamples(sampleRows, columns.direction);
        if (samples.length > 0 && !samples.every(isDirectionValue)) {
            columns.direction = -1;
        }
    }

    // The bank's transaction type (Revolut: CARD_PAYMENT, TOPUP, ...), only with a known sample and never a direction column.
    const usedByType = usedIndexes(columns);
    for (let i = 0; i < normalizedHeader.length; i += 1) {
        const words = normalizedHeader[i].split(/[^\p{L}]+/u);
        const samples = columnSamples(sampleRows, i);
        if (!usedByType.has(i) && words.some((word) => TYPE_HEADER_WORDS.includes(word))
            && samples.some((value) => REVOLUT_TYPES.includes(typeKey(value)))
            && !samples.every(isDirectionValue)) {
            columns.type = i;
            break;
        }
    }

    // Swedbank record type: a named column whose samples are all known codes, or an unnamed one that also holds a 20.
    const usedByRecordType = usedIndexes(columns);
    const hasMoneyColumn = columns.amount >= 0 || columns.debit >= 0 || columns.credit >= 0;
    for (let i = 0; i < header.length; i += 1) {
        const named = RECORD_TYPE_HEADERS.includes(normalizedHeader[i]);
        if (usedByRecordType.has(i) || !(named || normalizedHeader[i] === '')) {
            continue;
        }
        const samples = columnSamples(sampleRows, i);
        if (samples.length > 0 && samples.every((value) => RECORD_TYPE_CODES.includes(value))
            && (named || (hasMoneyColumn && samples.includes('20')))) {
            columns.recordType = i;
            break;
        }
    }

    // Fee and Net: with a Net column (and no debit/credit) Net is the amount and no fee is added on top.
    const netIndex = findExactColumn(normalizedHeader, NET_HEADERS, usedIndexes(columns), sampleRows);
    if (netIndex >= 0 && columns.debit === -1 && columns.credit === -1) {
        columns.amount = netIndex;
        amountVia = 'keyword';
    } else {
        const feeIndex = findExactColumn(normalizedHeader, FEE_HEADERS, usedIndexes(columns), sampleRows);
        if (feeIndex >= 0) {
            columns.fee = feeIndex;
        }
    }

    if (columns.date === -1) {
        const used = usedIndexes(columns);
        for (let i = 0; i < (sampleRows[0] || []).length; i += 1) {
            if (used.has(i)) {
                continue;
            }
            const samples = columnSamples(sampleRows, i);
            if (samples.length > 0 && samples.every(isDateLikeValue)) {
                columns.date = i;
                dateVia = 'content';
                break;
            }
        }
    }

    if (columns.amount === -1 && columns.debit === -1 && columns.credit === -1) {
        const used = usedIndexes(columns);
        for (let i = 0; i < (sampleRows[0] || []).length; i += 1) {
            if (used.has(i)) {
                continue;
            }
            const samples = columnSamples(sampleRows, i);
            if (samples.length > 0 && samples.every(isAmountLikeValue)) {
                columns.amount = i;
                amountVia = 'content';
                break;
            }
        }
    }

    if (columns.description === -1) {
        const used = usedIndexes(columns);
        let bestIndex = -1;
        let bestScore = 0;
        const width = sampleRows[0] ? sampleRows[0].length : 0;
        for (let i = 0; i < width; i += 1) {
            if (used.has(i)) {
                continue;
            }
            const samples = columnSamples(sampleRows, i);
            if (samples.length === 0 || samples.every((value) => isDateLikeValue(value) || isAmountLikeValue(value))) {
                continue;
            }
            const avgLength = samples.reduce((sum, value) => sum + value.length, 0) / samples.length;
            const distinct = new Set(samples).size;
            const score = avgLength * distinct;
            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }
        if (bestIndex >= 0) {
            columns.description = bestIndex;
            descriptionVia = 'content';
        }
    }

    if (columns.direction === -1 && columns.debit === -1 && columns.credit === -1) {
        const used = usedIndexes(columns);
        const width = sampleRows[0] ? sampleRows[0].length : 0;
        for (let i = 0; i < width; i += 1) {
            const samples = columnSamples(sampleRows, i);
            // One repeated '-' or '+' is a placeholder column, not a direction.
            const onlyOneSign = samples.every((value) => value === samples[0]) && /^[+-]$/.test(samples[0]);
            if (!used.has(i) && samples.length > 0 && !onlyOneSign && samples.every(isDirectionValue)) {
                columns.direction = i;
                break;
            }
        }
    }

    const dateSamples = columns.date >= 0 ? columnSamples(sampleRows, columns.date) : [];
    // Day-first is the only dotted order in the LV/EE/LT bank formats seen; UNVERIFIED for banks outside them.
    // Slash and dash dates stay ambiguous (null) unless a day above 12 settles it.
    const dateFormat = columns.date >= 0
        ? inferDateFormat(dateSamples)
            ?? (dateSamples.length > 0 && dateSamples.every((value) => /^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(value)) ? 'DMY' : null)
        : null;
    const decimalSeparator = guessDecimalSeparator(sampleRows, columns);
    const feeCheck = columns.fee >= 0 ? checkFeeAgainstBalance(header, sampleRows, columns, decimalSeparator) : null;
    if (feeCheck?.mode === 'included') {
        // The balance moves by the amount alone: the amount already contains the fee.
        delete columns.fee;
    }

    let confidence = 0;
    if (dateVia === 'keyword') {
        confidence += 0.3;
    } else if (dateVia === 'content') {
        confidence += 0.15;
    }
    if (amountVia === 'keyword') {
        confidence += 0.3;
    } else if (amountVia === 'content') {
        confidence += 0.15;
    } else if (columns.debit >= 0 || columns.credit >= 0) {
        confidence += 0.3;
    }
    if (descriptionVia === 'keyword') {
        confidence += 0.2;
    } else if (descriptionVia === 'content') {
        confidence += 0.1;
    }
    if (columns.currency >= 0) {
        confidence += 0.1;
    }
    if (columns.direction >= 0 || columns.debit >= 0 || columns.credit >= 0) {
        confidence += 0.1;
    }

    const result = { columns, dateFormat, decimalSeparator, confidence: Math.min(1, confidence) };
    if (feeCheck) {
        result.feeCheck = feeCheck;
    }
    return result;
}

function splitDateParts(value) {
    const match = String(value ?? '').trim().match(/^(\d{1,4})[.\-/](\d{1,2})[.\-/](\d{1,4})/);
    return match ? [match[1], match[2], match[3]] : null;
}

/**
 * Looks at the whole column to decide DMY vs MDY vs YMD. A value is only
 * decisive when one of its day/month parts is > 12. Returns null when
 * nothing in the column decides (ambiguous, the UI should ask).
 * @param {string[]} values
 * @returns {'DMY'|'MDY'|'YMD'|null}
 */
export function inferDateFormat(values) {
    const nonEmpty = (values || []).map((value) => String(value ?? '').trim()).filter((value) => value !== '');
    if (nonEmpty.length === 0) {
        return null;
    }

    let sawYmd = false;
    let sawDmy = false;
    let sawMdy = false;

    for (const value of nonEmpty) {
        const parts = splitDateParts(value);
        if (!parts) {
            continue;
        }
        const [a, b] = parts;

        if (a.length === 4) {
            sawYmd = true;
            continue;
        }

        const first = Number(a);
        const second = Number(b);
        if (first > 12 && second <= 12) {
            sawDmy = true;
        } else if (second > 12 && first <= 12) {
            sawMdy = true;
        }
    }

    if (sawYmd && !sawDmy && !sawMdy) {
        return 'YMD';
    }
    if (sawDmy && !sawMdy) {
        return 'DMY';
    }
    if (sawMdy && !sawDmy) {
        return 'MDY';
    }
    return null;
}

function isValidCalendarDate(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31) {
        return false;
    }
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Parses a single date value with a known format into 'YYYY-MM-DD'.
 * Supports separators . / -, 2-digit years (assumed 20xx), and ISO with a
 * time part ('2026-09-17 10:22').
 * @param {string} value
 * @param {'DMY'|'MDY'|'YMD'} format
 * @returns {string|null}
 */
export function parseDateWith(value, format) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
        return null;
    }

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})([ T]\d{2}:\d{2}(:\d{2})?)?$/);
    if (isoMatch) {
        const [, y, mo, d] = isoMatch;
        return isValidCalendarDate(y, mo, d) ? `${y}-${mo}-${d}` : null;
    }

    const match = trimmed.match(/^(\d{1,4})[.\-/](\d{1,2})[.\-/](\d{1,4})/);
    if (!match) {
        return null;
    }
    const [, a, b, c] = match;

    let year;
    let month;
    let day;

    if (format === 'YMD') {
        [year, month, day] = [a, b, c];
    } else if (format === 'MDY') {
        [month, day, year] = [a, b, c];
    } else if (format === 'DMY') {
        [day, month, year] = [a, b, c];
    } else {
        return null;
    }

    if (year.length === 2) {
        year = `20${year}`;
    }
    year = year.padStart(4, '0');
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');

    return isValidCalendarDate(year, month, day) ? `${year}-${month}-${day}` : null;
}

const NBSP_RE = /[  ]/g;

/**
 * Strips what surrounds an amount: non-breaking spaces, unicode minus signs,
 * a trailing D/C/K mark (D means negative) and a leading or trailing currency
 * code or symbol ('€ -12.50', 'EUR -12.50', '-12,50 EUR').
 * @param {string} value
 * @returns {{ text: string, negative: boolean }}
 */
export function stripAmountDecoration(value) {
    let text = value.replace(NBSP_RE, ' ').trim();
    let negative = false;

    text = text.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-');
    const trailingMark = text.match(/(?:(?<=\d)\s*|\s+)(DR|CR|D|C|K)$/i);
    if (trailingMark) {
        negative = /^D/i.test(trailingMark[1]);
        text = text.slice(0, trailingMark.index).trim();
    }
    text = text.replace(/^(?:[A-Z]{3}|[€$£¥₽])\s*/i, '').replace(/\s*(?:[A-Z]{3}|[€$£¥₽])$/i, '').trim();
    return { text, negative };
}

/**
 * Parses a money string into signed integer cents. Handles thousands and
 * decimal separators, leading/trailing minus, parentheses for negative,
 * a leading plus, and currency symbols/codes. Never uses floating-point
 * arithmetic on the fractional part. Returns null when the value is not a
 * parseable amount.
 * @param {string} value
 * @param {'.'|','} decimalSeparator
 * @returns {number|null}
 */
export function parseAmountWith(value, decimalSeparator = '.') {
    if (typeof value !== 'string') {
        return null;
    }

    if (value.trim() === '') {
        return null;
    }

    const decorated = stripAmountDecoration(value);
    let text = decorated.text;
    let negative = decorated.negative;

    if (/^\(.*\)$/.test(text)) {
        negative = true;
        text = text.slice(1, -1).trim();
    }

    if (text.startsWith('-')) {
        negative = true;
        text = text.slice(1).trim();
    } else if (text.endsWith('-')) {
        negative = true;
        text = text.slice(0, -1).trim();
    }

    if (text.startsWith('+')) {
        text = text.slice(1).trim();
    }

    text = text.replace(/[^0-9.,\s]/g, '').trim();
    if (text === '') {
        return null;
    }

    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    let digits = text.split(thousandsSeparator).join('');
    digits = digits.split(' ').join('');
    if (digits === '') {
        return null;
    }

    const decimalIndex = digits.lastIndexOf(decimalSeparator);
    let wholePart;
    let fractionPart;

    if (decimalIndex === -1) {
        wholePart = digits;
        fractionPart = '';
    } else {
        wholePart = digits.slice(0, decimalIndex);
        fractionPart = digits.slice(decimalIndex + 1);
    }
    wholePart = wholePart.split(decimalSeparator).join('');

    if (!/^\d*$/.test(wholePart) || !/^\d*$/.test(fractionPart) || fractionPart.length > 2) {
        return null;
    }
    if (wholePart === '' && fractionPart === '') {
        return null;
    }

    wholePart = wholePart === '' ? '0' : wholePart;
    fractionPart = fractionPart.padEnd(2, '0');

    const cents = Number(wholePart) * 100 + Number(fractionPart);
    if (!Number.isSafeInteger(cents)) {
        return null;
    }

    return negative ? -cents : cents;
}

const SUMMARY_KEYWORDS = ['total', 'kopa', 'итого', 'saldo', 'opening balance', 'beginning balance', 'closing balance'];

const SUMMARY_CORE_WORDS = [
    'total', 'totals', 'kopa', 'kopsumma', 'kokku', 'viso', 'итого', 'всего',
    'saldo', 'balance', 'atlikums', 'likutis', 'jaak', 'algsaldo', 'loppsaldo', 'сальдо', 'остаток',
    'apgrozijums', 'apgrozijumi', 'turnover', 'käive', 'apyvarta', 'оборот', 'обороты',
].map(normalizeText);

const SUMMARY_QUALIFIERS = [
    'opening', 'closing', 'beginning', 'starting', 'ending', 'final', 'initial', 'account', 'period',
    'available', 'booked', 'of', 'the', 'for', 'and', 'on', 'un', 'ja', 'ir',
    'sakuma', 'beigu', 'beigas', 'sakotnejais', 'galigais', 'konta', 'perioda', 'debets', 'kredits',
    'debit', 'credit', 'algus', 'lopp', 'pradinis', 'galutinis', 'laikotarpio',
    'brought', 'forward', 'carried',
    'debeta', 'kredita', 'komisiju', 'kopeja', 'izejoso', 'ienakoso', 'maksajumu', 'bez', 'komisijam',
    'начальное', 'конечное', 'входящий', 'исходящий', 'за', 'период', 'на', 'по', 'счету',
].map(normalizeText);

const SUMMARY_WORDS = new Set([...SUMMARY_CORE_WORDS, ...SUMMARY_QUALIFIERS]);

function summaryWords(value) {
    return normalizeText(value).split(/[^\p{L}]+/u).filter((word) => word !== '');
}

/**
 * The whole cell is a summary label such as 'Kopā', 'Closing balance' or 'Sākuma saldo'.
 * With footer true (a row without a date) the bare word 'summa' also counts, as in 'Komisiju summa'.
 */
function isSummaryCell(value, footer = false) {
    const words = summaryWords(value);
    return words.length > 0
        && words.every((word) => SUMMARY_WORDS.has(word) || (footer && word === 'summa'))
        && words.some((word) => SUMMARY_CORE_WORDS.includes(word) || (footer && word === 'summa'));
}

function hasSummaryKeyword(row) {
    return row.some((cell) => {
        const normalized = normalizeText(cell);
        return normalized !== '' && SUMMARY_KEYWORDS.some((keyword) => normalized.includes(keyword));
    });
}

/**
 * A summary row has any cell that consists only of summary words and includes at least one core word,
 * or mentions a summary keyword and has no valid date. 'TotalEnergies' with a date stays a transaction.
 */
function isSummaryRow(row, descriptionIndex, hasDate) {
    if (row.some((cell) => isSummaryCell(cell))) {
        return true;
    }
    if (!hasDate && row.some((cell) => isSummaryCell(cell, true))) {
        return true;
    }
    return !hasDate && hasSummaryKeyword(row);
}

function isHeaderRepeat(row, header) {
    const length = trimmedLength(header);
    return length >= 2 && trimmedLength(row) === length
        && header.slice(0, length).every((cell, index) => normalizeText(cell) === normalizeText(row[index]));
}

function cellAt(row, index) {
    return index >= 0 && index < row.length ? String(row[index] ?? '') : '';
}

/**
 * Turns raw delimited rows into normalised statement rows, using a saved
 * or guessed column layout. Direction comes from the amount's sign, a D/C
 * column, or separate debit/credit columns. Rows whose date or amount does
 * not parse are skipped and reported, as are obvious summary rows.
 * A row in another currency gets amountCents null (the UI asks for the EUR
 * charged) unless layout.columns.eurAmount points at a EUR amount column.
 * layout.reverse === true flips every row's direction (a bank that shows spending as positive).
 * layout.columns.fee: the fee of a EUR row is added to money out and taken off money in (a fee above
 * the money in turns it into money out of the difference; an equal fee skips the row as zero amount).
 * @param {string[][]} rows
 * @param {number} headerRow
 * @param {object} layout
 * @returns {{ rows: object[], skipped: { line: number, reason: string }[] }}
 */
export function rowsToStatement(rows, headerRow, layout) {
    const columns = layout.columns || {};
    const decimalSeparator = layout.decimalSeparator || '.';
    const dateFormat = layout.dateFormat;
    const dataStart = headerRow >= 0 ? headerRow + 1 : 0;

    const statementRows = [];
    const skipped = [];

    // A record type column that another field also reads is not one (a saved layout may use that column for the amount).
    const recordTypeIndex = (columns.recordType ?? -1) >= 0
        && !Object.entries(columns).some(([key, index]) => key !== 'recordType' && index === columns.recordType)
        ? columns.recordType : -1;

    for (let i = dataStart; i < rows.length; i += 1) {
        const row = rows[i];
        const line = i + 1;

        if (row.every((cell) => cell.trim() === '')) {
            continue;
        }

        if (headerRow >= 0 && isHeaderRepeat(row, rows[headerRow])) {
            skipped.push({ line, reason: 'summary row' });
            continue;
        }

        const recordType = cellAt(row, recordTypeIndex).trim();
        if (recordType !== '' && recordType !== '20') {
            skipped.push({ line, reason: 'summary row' });
            continue;
        }

        const dateValue = cellAt(row, columns.date);
        const date = dateFormat ? parseDateWith(dateValue, dateFormat) : null;

        if (isSummaryRow(row, columns.description ?? -1, date !== null)) {
            skipped.push({ line, reason: 'summary row' });
            continue;
        }

        if (!date) {
            skipped.push({ line, reason: 'unparsable date' });
            continue;
        }

        if (NOT_COMPLETED.includes(normalizeText(cellAt(row, columns.status)))) {
            skipped.push({ line, reason: 'not completed' });
            continue;
        }

        let amountCents = null;
        let direction = null;
        let unknownDirection = false;

        const hasSplitColumns = columns.debit >= 0 || columns.credit >= 0;
        if (hasSplitColumns) {
            const debitValue = cellAt(row, columns.debit);
            const creditValue = cellAt(row, columns.credit);
            const debitAmount = debitValue.trim() === '' ? null : parseAmountWith(debitValue, decimalSeparator);
            const creditAmount = creditValue.trim() === '' ? null : parseAmountWith(creditValue, decimalSeparator);

            if (debitAmount !== null && debitAmount !== 0) {
                amountCents = Math.abs(debitAmount);
                direction = 'out';
            } else if (creditAmount !== null && creditAmount !== 0) {
                amountCents = Math.abs(creditAmount);
                direction = 'in';
            }
        } else {
            const amountValue = cellAt(row, columns.amount);
            const parsed = parseAmountWith(amountValue, decimalSeparator);
            if (parsed !== null) {
                amountCents = Math.abs(parsed);

                if (columns.direction >= 0) {
                    const directionValue = cellAt(row, columns.direction);
                    direction = directionOfValue(directionValue);
                    // A word we do not know is not a reason to guess money in: only an explicit minus decides.
                    unknownDirection = !direction && directionValue.trim() !== '' && parsed >= 0;
                }

                if (!direction) {
                    direction = parsed < 0 ? 'out' : 'in';
                }
            }
        }

        if (amountCents === 0) {
            skipped.push({ line, reason: 'zero amount' });
            continue;
        }
        if (unknownDirection) {
            skipped.push({ line, reason: 'unknown direction' });
            continue;
        }
        if (amountCents === null || !direction) {
            skipped.push({ line, reason: 'unparsable amount' });
            continue;
        }

        if (layout.reverse === true) direction = direction === 'in' ? 'out' : 'in';

        let currency = 'EUR';
        if (columns.currency >= 0) {
            const currencyValue = cellAt(row, columns.currency).trim().toUpperCase();
            if (/^[A-Z]{3}$/.test(currencyValue)) {
                currency = currencyValue;
            }
        }

        // A fee is part of the money moved: added to money out, taken off money in. Other currencies are left alone.
        const feeCents = currency === 'EUR' && columns.fee >= 0
            ? Math.abs(parseAmountWith(cellAt(row, columns.fee), decimalSeparator) ?? 0)
            : 0;
        if (feeCents > 0 && direction === 'out') {
            amountCents += feeCents;
        } else if (feeCents > 0) {
            const net = amountCents - feeCents;
            if (net === 0) {
                skipped.push({ line, reason: 'zero amount' });
                continue;
            }
            if (net < 0) direction = 'out';
            amountCents = Math.abs(net);
        }

        let euroCents = amountCents;
        if (currency !== 'EUR') {
            const eurIndex = columns.eurAmount ?? -1;
            const eurValue = cellAt(row, eurIndex);
            const eur = eurIndex >= 0 && eurValue.trim() !== '' ? parseAmountWith(eurValue, decimalSeparator) : null;
            euroCents = eur !== null && eur !== 0 ? Math.abs(eur) : null;
        }

        const split = splitBankDetails(cellAt(row, columns.description), date);
        const bankRef = cellAt(row, columns.bankRef);
        const payee = cellAt(row, columns.counterparty);

        // A foreign card payment booked in EUR: show the original currency, keep the EUR amount charged.
        const original = currency === 'EUR' && split.original ? split.original : null;

        statementRows.push(statementRow({
            date: split.date || date,
            amountCents: euroCents,
            direction,
            currency: original ? original.currency : currency,
            originalAmountCents: original ? original.cents : amountCents,
            description: split.description,
            counterparty: payee.trim() !== '' ? payee : split.counterparty,
            bankRef,
            mcc: split.mcc,
            kindHint: KIND_HINT_BY_TYPE[typeKey(cellAt(row, columns.type))],
        }));
    }

    return { rows: statementRows, skipped };
}

/**
 * Convenience pipeline for text pasted from a spreadsheet or web page
 * (usually tab-separated): delimiter detection + header detection. When
 * there is no header at all, headerRow is -1 and guessColumns should work
 * from content alone.
 * @param {string} text
 * @returns {{ delimiter: string, rows: string[][], headerRow: number }}
 */
export function parsePasted(text) {
    const { delimiter, rows } = parseDelimited(text);
    const headerRow = findHeaderRow(rows);
    return { delimiter, rows, headerRow };
}
