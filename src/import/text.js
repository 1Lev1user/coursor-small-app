import { statementRow } from './types.js';

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

/**
 * Decodes raw file bytes into text, working out the encoding.
 * Strips a BOM (UTF-8 or UTF-16) when present. Tries strict UTF-8 first,
 * then falls back to windows-1257 (Baltic) for legacy bank exports, and
 * to windows-1252 if this runtime has no windows-1257 label at all.
 * @param {Uint8Array} bytes
 * @returns {{ text: string, encoding: 'utf-8'|'utf-16le'|'utf-16be'|'windows-1257'|'windows-1252' }}
 */
export function decodeBytes(bytes) {
    if (hasBom(bytes, BOM_UTF16LE)) {
        return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
    }
    if (hasBom(bytes, BOM_UTF16BE)) {
        return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
    }

    const body = hasBom(bytes, BOM_UTF8) ? bytes.subarray(3) : bytes;

    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
    } catch {
        // not valid UTF-8, fall through to the Baltic legacy codepage
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

function tokenize(text, delimiter) {
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

        if (ch === '"') {
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

    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function scoreDelimiter(text, delimiter) {
    const rows = tokenize(text, delimiter).filter((row) => !isBlankRow(row));
    const sample = rows.slice(0, 20);
    if (sample.length === 0) {
        return { rows, score: -1 };
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
        return { rows, score: 0 };
    }

    const consistency = dominantFreq / sample.length;
    return { rows, score: consistency + dominantCount / 1000 };
}

/**
 * Detects the delimiter among , ; TAB | by consistency of field counts over
 * the first 20 non-empty lines, and tokenizes the whole text with it.
 * Full RFC 4180 quoting: "" escapes a quote, delimiters and newlines may
 * appear inside quoted fields, CRLF and LF both work. Empty lines (including
 * a trailing one) are dropped.
 * @param {string} text
 * @returns {{ delimiter: string, rows: string[][] }}
 */
export function parseDelimited(text) {
    const normalized = String(text ?? '').replace(/^﻿/, '');
    let best = null;
    let bestDelimiter = ',';

    for (const delimiter of DELIMITER_CANDIDATES) {
        const result = scoreDelimiter(normalized, delimiter);
        if (!best || result.score > best.score) {
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

/**
 * Finds the header row, skipping preamble lines (account number, period,
 * bank name): the first row whose non-empty cell count equals the dominant
 * count across all rows and whose cells are entirely non numeric/date-like.
 * Returns -1 when nothing looks like a header (e.g. pasted data with no
 * header row at all).
 * @param {string[][]} rows
 * @returns {number}
 */
export function findHeaderRow(rows) {
    if (rows.length === 0) {
        return -1;
    }

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
        const row = rows[i];
        if (row.length !== dominant) {
            continue;
        }
        const nonEmpty = row.filter((cell) => cell.trim() !== '');
        const numericCount = nonEmpty.filter(isNumericOrDateCell).length;
        if (numericCount === 0) {
            return i;
        }
    }

    return -1;
}

const KEYWORDS = {
    date: ['datums', 'дата', 'kuupaev', 'data', 'date', 'laikas'],
    debit: ['debit', 'debets', 'дебет', 'deebet', 'isxodящ'],
    credit: ['credit', 'kredit', 'кредит', 'kreedit'],
    amount: ['amount', 'summa', 'сумма', 'suma', 'value'],
    direction: ['d/k', 'd/c', 'db/cr', 'debit/credit', 'debets/kredits', 'direction', 'tips', 'veids', 'тип', 'type'],
    currency: ['currency', 'valuta', 'валюта', 'valuuta', 'valiuta'],
    bankRef: ['reference', 'ref', 'arhiva kods', 'dokumenta nr', 'transaction id'],
    description: ['description', 'details', 'detalas', 'apraksts', 'назначение', 'описание', 'selgitus', 'paskirtis', 'narrative', 'memo', 'purpose', 'komentars'],
};

const CATEGORY_ORDER = ['date', 'debit', 'credit', 'amount', 'direction', 'currency', 'bankRef', 'description'];

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

const DIRECTION_VALUES = new Set([
    'D', 'C', 'K', 'DR', 'CR', 'DB', 'DBIT', 'CRDT', 'DEBIT', 'CREDIT', 'DEBET', 'KREDIT',
    'DEBETS', 'KREDITS', 'DEEBET', 'KREEDIT', 'ДЕБЕТ', 'КРЕДИТ',
]);

/**
 * A direction cell holds a D/C/K letter or a debit/credit word, never a
 * transaction type such as CARD_PAYMENT or TOPUP.
 * @param {string} value
 * @returns {boolean}
 */
export function isDirectionValue(value) {
    return DIRECTION_VALUES.has(stripDiacritics(String(value ?? '')).trim().toUpperCase());
}

function isAmountLikeValue(value) {
    return parseAmountWith(value, '.') !== null || parseAmountWith(value, ',') !== null;
}

function guessDecimalSeparator(sampleRows, columns) {
    const indexes = [columns.amount, columns.debit, columns.credit].filter((index) => index >= 0);
    for (const index of indexes) {
        for (const value of columnSamples(sampleRows, index)) {
            if (/\d,\d{1,2}\)?-?$/.test(value)) {
                return ',';
            }
            if (/\d\.\d{1,2}\)?-?$/.test(value)) {
                return '.';
            }
        }
    }
    return '.';
}

/**
 * Guesses which column holds what, by keyword (EN/LV/RU/ET/LT, case and
 * diacritics insensitive), then by content when no header word matches:
 * a column where every sample parses as a date, or as a 2-decimal amount;
 * description falls back to the longest text column with the most distinct
 * values.
 * @param {string[]} header
 * @param {string[][]} sampleRows
 * @returns {{ columns: object, dateFormat: string|null, decimalSeparator: string, confidence: number }}
 */
export function guessColumns(header, sampleRows) {
    const normalizedHeader = header.map(normalizeText);
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
            if (keywords.some((keyword) => normalizedHeader[i].includes(keyword))) {
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

    for (const key of ['debit', 'credit']) {
        const samples = columnSamples(sampleRows, columns[key]);
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
            if (!used.has(i) && samples.length > 0 && samples.every(isDirectionValue)) {
                columns.direction = i;
                break;
            }
        }
    }

    const dateFormat = columns.date >= 0 ? inferDateFormat(columnSamples(sampleRows, columns.date)) : null;
    const decimalSeparator = guessDecimalSeparator(sampleRows, columns);

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

    return { columns, dateFormat, decimalSeparator, confidence: Math.min(1, confidence) };
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

    let text = value.replace(NBSP_RE, ' ').trim();
    if (text === '') {
        return null;
    }

    let negative = false;

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
    'sakuma', 'beigu', 'sakotnejais', 'galigais', 'konta', 'perioda', 'debets', 'kredits',
    'debit', 'credit', 'algus', 'lopp', 'pradinis', 'galutinis', 'laikotarpio',
    'начальное', 'конечное', 'входящий', 'исходящий', 'за', 'период', 'на', 'по', 'счету',
].map(normalizeText);

const SUMMARY_WORDS = new Set([...SUMMARY_CORE_WORDS, ...SUMMARY_QUALIFIERS]);

function summaryWords(value) {
    return normalizeText(value).split(/[^\p{L}]+/u).filter((word) => word !== '');
}

/** The whole cell is a summary label such as 'Kopā', 'Closing balance' or 'Sākuma saldo'. */
function isSummaryCell(value) {
    const words = summaryWords(value);
    return words.length > 0
        && words.every((word) => SUMMARY_WORDS.has(word))
        && words.some((word) => SUMMARY_CORE_WORDS.includes(word));
}

function hasSummaryKeyword(row) {
    return row.some((cell) => {
        const normalized = normalizeText(cell);
        return normalized !== '' && SUMMARY_KEYWORDS.some((keyword) => normalized.includes(keyword));
    });
}

/**
 * A summary row has a description that is only a summary label, or mentions a
 * summary word and has no valid date. 'TotalEnergies' with a date stays a transaction.
 */
function isSummaryRow(row, descriptionIndex, hasDate) {
    const labelCells = descriptionIndex >= 0 ? [cellAt(row, descriptionIndex)] : row;
    if (labelCells.some(isSummaryCell)) {
        return true;
    }
    return !hasDate && hasSummaryKeyword(row);
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

    for (let i = dataStart; i < rows.length; i += 1) {
        const row = rows[i];
        const line = i + 1;

        if (row.every((cell) => cell.trim() === '')) {
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

        let amountCents = null;
        let direction = null;

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
                    const directionCell = stripDiacritics(cellAt(row, columns.direction)).trim().toUpperCase();
                    const firstLetter = directionCell.charAt(0);
                    if (firstLetter === 'D') {
                        direction = 'out';
                    } else if (firstLetter === 'C' || firstLetter === 'K') {
                        direction = 'in';
                    }
                }

                if (!direction) {
                    direction = parsed < 0 ? 'out' : 'in';
                }
            }
        }

        if (amountCents === null || !direction) {
            skipped.push({ line, reason: 'unparsable amount' });
            continue;
        }

        let currency = 'EUR';
        if (columns.currency >= 0) {
            const currencyValue = cellAt(row, columns.currency).trim().toUpperCase();
            if (/^[A-Z]{3}$/.test(currencyValue)) {
                currency = currencyValue;
            }
        }

        let euroCents = amountCents;
        if (currency !== 'EUR') {
            const eurIndex = columns.eurAmount ?? -1;
            const eurValue = cellAt(row, eurIndex);
            const eur = eurIndex >= 0 && eurValue.trim() !== '' ? parseAmountWith(eurValue, decimalSeparator) : null;
            euroCents = eur !== null && eur !== 0 ? Math.abs(eur) : null;
        }

        const description = cellAt(row, columns.description);
        const bankRef = cellAt(row, columns.bankRef);

        statementRows.push(statementRow({
            date,
            amountCents: euroCents,
            direction,
            currency,
            originalAmountCents: amountCents,
            description,
            counterparty: '',
            bankRef,
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
