import { createId, markEdited, UNCATEGORISED_ID } from '../model.js';
import { buildPlanSnapshot, freezeMonthPlan } from '../budget.js';
import { compareMonthKeys, currentMonthKey, monthKeyOf } from '../months.js';
import { subcategoryForMcc } from './mcc.js';
import { pairReversals } from './types.js';

export const KINDS = ['expense', 'income', 'refund', 'transfer', 'skip'];
export const RULE_KINDS = ['expense', 'income', 'transfer', 'skip'];
export const PLAN_CHOICES = ['current', 'actualOnly'];

const NOTE_MAX = 120;
const WEAK_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const OWN_TRANSFER_MIN_CENTS = 1000;
const OWN_TRANSFER_DAYS = 1;

const LEGAL_FORMS = new Set([
    'SIA', 'AS', 'UAB', 'OU', 'OÜ', 'AB', 'IK', 'MB', 'VSIA', 'PSIA', 'LTD', 'GMBH', 'LLC', 'INC',
]);
const PROCESSORS = new Set(['PAYPAL', 'SUMUP', 'SQ', 'IZ', 'ZETTLE', 'STRIPE', 'GOOGLE']);
const LEADING_NOISE = new Set([
    'POS', 'CARD', 'PURCHASE', 'PAYMENT', 'PIRKUMS', 'KARTE', 'KARTES', 'MAKSAJUMS', 'MAKSĀJUMS',
]);
const TRAILING_PLACES = new Set([
    'RIGA', 'RĪGA', 'JURMALA', 'JŪRMALA', 'LIEPAJA', 'LIEPĀJA', 'DAUGAVPILS',
    'VILNIUS', 'TALLINN', 'KAUNAS', 'TARTU',
    'LV', 'LT', 'EE', 'LVA', 'LTU', 'EST',
    'LATVIA', 'LATVIJA', 'LITHUANIA', 'LIETUVA', 'ESTONIA', 'EESTI',
]);

function matchText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const STOP_WORDS = new Set([
    ...LEGAL_FORMS,
    'POS', 'PAR', 'UN', 'AR', 'NO', 'UZ', 'MAKSAJUMS', 'MAKSĀJUMS', 'PAYMENT', 'PIRKUMS', 'CARD', 'KARTE',
    'SIA', 'AS', 'OU', 'UAB', 'LTD', 'LLC', 'GMBH',
].map(matchText));
const MIN_KEYWORD_LENGTH = 3;

/** The normalised keyword, or '' when it is a stop word or has under 3 characters other than spaces. */
function usableKeyword(value) {
    const keyword = matchText(value);
    if (STOP_WORDS.has(keyword)) return '';
    return keyword.replace(/ /g, '').length >= MIN_KEYWORD_LENGTH ? keyword : '';
}

/**
 * True when keyword occurs in text (both already matchText-normalised) on word boundaries: the characters
 * around it are not letters or digits. One exception: after a keyword that does not end in a digit, a glued
 * reference code is allowed: up to 2 letters and then 4 or more digits ('BOLT.EU' and 'BOLT.EUR' in
 * 'BOLT.EUR2610011807'), the shape extractPattern cuts.
 */
function hasKeyword(text, keyword) {
    if (keyword === '') return false;
    const glued = /\P{N}$/u.test(keyword);
    for (let at = text.indexOf(keyword); at !== -1; at = text.indexOf(keyword, at + 1)) {
        if (/[\p{L}\p{N}]$/u.test(text.slice(0, at))) continue;
        const after = text.slice(at + keyword.length);
        if (!/^[\p{L}\p{N}]/u.test(after)) return true;
        if (glued && /^\p{L}{0,2}\d{4,}(?![\p{L}\p{N}])/u.test(after)) return true;
    }
    return false;
}

function rowText(row) {
    return matchText(`${row.counterparty ?? ''} ${row.description ?? ''}`);
}

function amountKey(row) {
    return Number.isInteger(row.amountCents)
        ? String(row.amountCents)
        : `${row.currency}${row.originalAmountCents}`;
}

export function fingerprint(row) {
    return [row.date, amountKey(row), row.direction, rowText(row)].join('|');
}

// The text part of a stored fingerprint (date|amount|direction|text, optional #n).
// The text may contain '|', so only the first three are separators. Returns the
// candidates to compare with a row's text, or [] when the fingerprint is not in that form.
function storedTexts(fp) {
    if (typeof fp !== 'string') return [];
    let start = -1;
    for (let i = 0; i < 3; i += 1) {
        start = fp.indexOf('|', start + 1);
        if (start === -1) return [];
    }
    const tail = fp.slice(start + 1);
    return [tail, tail.replace(/#\d+$/, '')];
}

// A bank transaction id such as RF2026091400001; running numbers and short references are reused.
function isStrongReference(ref) {
    return ref.length >= 12 && !/^\d+$/.test(ref);
}

export function makeFingerprints(rows) {
    const seen = new Map();
    return rows.map((row) => {
        const base = fingerprint(row);
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        return count === 1 ? base : `${base}#${count}`;
    });
}

function dayNumber(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function storedEntries(data) {
    const expenses = (data.expenses ?? []).map((entry) => ({
        entry,
        type: 'expense',
        direction: entry.refund === true ? 'in' : 'out',
    }));
    const incomes = (data.incomes ?? []).map((entry) => ({
        entry,
        type: 'income',
        direction: 'in',
    }));
    return [...expenses, ...incomes];
}

function isManual(entry) {
    return typeof entry.importId !== 'string' || entry.importId === '';
}

/**
 * Exact: same stored fingerprint, or same non-empty bankRef with the same amount and either a date
 *   within 1 day, equal text, or a strong reference (not purely digits, 12+ characters) within 5 days.
 * Probable: a manual or subscription-logged entry (no importId) with the same date, amount and direction.
 * Weak: any stored entry with the same amount and direction within +-2 days.
 * Each stored entry is claimed by at most one row, so two identical rows against one stored entry
 * yield one match and one clean row.
 */
export function findDuplicates(data, rows) {
    const stored = storedEntries(data);
    const fingerprints = makeFingerprints(rows);
    const byBankRef = new Map();
    const byFingerprint = new Map();
    for (const item of stored) {
        if (item.entry.bankRef) {
            const key = `${item.direction}|${item.entry.bankRef}`;
            if (!byBankRef.has(key)) byBankRef.set(key, []);
            byBankRef.get(key).push(item);
        }
        if (item.entry.fingerprint) byFingerprint.set(item.entry.fingerprint, item);
    }
    // A bank reference only proves a duplicate together with the same amount and
    // a close date, the same text or a strong reference: some banks reuse references.
    const byReference = (row) => {
        if (!row.bankRef) return undefined;
        const day = dayNumber(row.date);
        const text = rowText(row);
        return (byBankRef.get(`${row.direction}|${row.bankRef}`) ?? []).find(({ entry }) => {
            const entryDay = dayNumber(entry.date);
            if (!(entry.amountCents === row.amountCents || entry.originalAmountCents === row.originalAmountCents)
                || day === null || entryDay === null) return false;
            const gap = Math.abs(day - entryDay);
            return gap <= 1
                || (text !== '' && storedTexts(entry.fingerprint).includes(text))
                || (gap <= 5 && isStrongReference(row.bankRef));
        });
    };

    const results = rows.map(() => ({ level: null, matchId: '', matchType: '' }));
    const claimed = new Set();
    const claim = (index, level, item) => {
        claimed.add(item.entry.id);
        results[index] = { level, matchId: item.entry.id, matchType: item.type };
    };

    const ignored = new Map();
    for (const record of data.imports ?? []) {
        if (record.undoneAt) continue;
        for (const mark of record.ignored ?? []) {
            if (mark.bankRef) ignored.set(`ref|${mark.direction}|${mark.bankRef}`, mark.kind);
            if (mark.fingerprint) ignored.set(`fp|${mark.fingerprint}`, mark.kind);
        }
    }

    rows.forEach((row, index) => {
        const item = byReference(row) || byFingerprint.get(fingerprints[index]);
        if (item && !claimed.has(item.entry.id)) {
            claim(index, 'exact', item);
            return;
        }
        const ignoredKind = (row.bankRef && ignored.get(`ref|${row.direction}|${row.bankRef}`))
            || ignored.get(`fp|${fingerprints[index]}`);
        if (ignoredKind) {
            // A transfer or skipped row from an earlier import: nothing was stored for it.
            results[index] = { level: 'exact', matchId: '', matchType: 'ignored', ignoredKind };
        }
    });

    // Group stored entries by direction and amount once, so large histories
    // and long statements are not compared entry by entry for every row.
    const byAmount = new Map();
    for (const item of stored) {
        const key = `${item.direction}|${item.entry.amountCents}`;
        if (!byAmount.has(key)) byAmount.set(key, []);
        byAmount.get(key).push(item);
    }
    const sameAmount = (row) => byAmount.get(`${row.direction}|${row.amountCents}`) ?? [];

    rows.forEach((row, index) => {
        if (results[index].level !== null || !Number.isInteger(row.amountCents)) return;
        const item = sameAmount(row).find(({ entry }) => !claimed.has(entry.id)
            && isManual(entry)
            && entry.date === row.date);
        if (item) claim(index, 'probable', item);
    });

    rows.forEach((row, index) => {
        if (results[index].level !== null || !Number.isInteger(row.amountCents)) return;
        const day = dayNumber(row.date);
        if (day === null) return;
        let best = null;
        let bestDistance = Infinity;
        for (const item of sameAmount(row)) {
            if (claimed.has(item.entry.id)) continue;
            const other = dayNumber(item.entry.date);
            if (other === null) continue;
            const distance = Math.abs(other - day);
            if (distance <= WEAK_DAYS && distance < bestDistance) {
                best = item;
                bestDistance = distance;
            }
        }
        if (best) claim(index, 'weak', best);
    });

    return results;
}

function stripNoise(upper) {
    return upper
        .replace(/\b\d{4,}[*X]{2,}\d{2,}\b/g, ' ')
        .replace(/\*+\d{2,}/g, ' ')
        .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
        .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g, ' ')
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
        .replace(/(?<![\p{L}\p{N}.'&-])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![\p{L}\p{N}])/gu, ' ')
        .replace(/(?<![\p{L}\p{N}.'&-])(?:EUR|USD|GBP|SEK|NOK|DKK|PLN|CHF|CZK|HUF|RON|BGN|TRY|UAH|RUB|JPY|CNY)\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu, ' ')
        .replace(/(?<![\p{L}\p{N}.'&-])\d+(?:[.,]\d+)?(?:EUR|USD|GBP|SEK|NOK|DKK|PLN|CHF|CZK|HUF|RON|BGN|TRY|UAH|RUB|JPY|CNY)(?![\p{L}\p{N}])/gu, ' ');
}

function keepName(token) {
    if (!/\d/.test(token)) return token;
    const name = token.replace(/\d{4,}$/, '').replace(/[.'-]+$/g, '');
    return name.replace(/[^\p{L}]/gu, '').length >= 2 ? name : '';
}

/**
 * Rule: take the first meaningful word. Leading noise words (POS, PIRKUMS, CARD) are skipped.
 * After a legal form (SIA, AS, UAB, OU) up to two name words are kept: 'SIA Circle K Latvia' -> 'CIRCLE K'.
 * After a payment processor (PAYPAL, SUMUP, SQ, IZ) the merchant is kept too: 'PAYPAL *SPOTIFY' -> 'PAYPAL SPOTIFY'.
 * All-digit tokens are dropped. A name with digits is kept ('TELE2 SIA' -> 'TELE2'); a trailing run of
 * 4 or more digits is cut ('BOLT.EUR2610011807' -> 'BOLT.EUR'). A legal form on its own gives ''.
 * Card masks, dates, times, trailing Baltic cities and country codes are dropped. IBANs, amounts glued to a currency
 * and reference codes glued to digits (TERM1234, NR1234) are dropped too, unless they are the only tokens left.
 * A stop word (POS, PAR, SIA...) or a keyword under 3 characters gives ''.
 */
export function extractPattern(description) {
    const cleaned = stripNoise(String(description ?? '').toUpperCase())
        .replace(/[^\p{L}\p{N}&'.-]+/gu, ' ');
    const items = cleaned
        .split(' ')
        .map((raw) => {
            const token = raw.replace(/^[.'-]+|[.'-]+$/g, '');
            return { name: keepName(token), ref: /^(?:NR|NO|ID|TERM|TID|MID|TRN|TRX|DOC|REF)\d{4,}$/.test(token) };
        })
        .filter((item) => item.name !== '');

    while (items.length > 0 && TRAILING_PLACES.has(items[items.length - 1].name)) {
        items.pop();
    }
    const named = items.filter((item) => !item.ref);
    if (named.length > 0 && named.length < items.length) {
        items.splice(0, items.length, ...named);
    }
    while (items.length > 1 && LEADING_NOISE.has(items[0].name)) {
        items.shift();
    }
    const tokens = items.map((item) => item.name);
    if (tokens.length === 0) return '';

    const first = tokens[0];
    let pattern;
    if (LEGAL_FORMS.has(first) && tokens.length > 1) {
        pattern = tokens.slice(1, 3).join(' ');
    } else if (PROCESSORS.has(first) && tokens.length > 1) {
        pattern = tokens.slice(0, 2).join(' ');
    } else {
        pattern = LEGAL_FORMS.has(first) ? '' : first;
    }
    return usableKeyword(pattern) === '' ? '' : pattern;
}

export function ruleKind(rule) {
    return rule.kind === 'expense' && rule.refund === true ? 'refund' : rule.kind;
}

function ruleSide(rule) {
    const kind = ruleKind(rule);
    if (kind === 'expense') return 'out';
    if (kind === 'refund' || kind === 'income') return 'in';
    return 'any';
}

function ruleFitsDirection(rule, direction) {
    const side = ruleSide(rule);
    return side === 'any' || side === direction;
}

/** Longest matching pattern wins; rules whose kind cannot apply to the row direction are ignored; ties keep list order. */
export function applyRules(rules, row) {
    const haystack = rowText(row);
    let best = null;
    let bestLength = 0;
    for (const rule of rules ?? []) {
        const pattern = usableKeyword(rule.pattern);
        if (
            pattern === ''
            || !hasKeyword(haystack, pattern)
            || !ruleFitsDirection(rule, row.direction)
        ) continue;
        if (pattern.length > bestLength) {
            best = rule;
            bestLength = pattern.length;
        }
    }
    return best;
}

function cleanNote(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

function cleanRule(rule) {
    const kind = RULE_KINDS.includes(rule.kind) ? rule.kind : null;
    const pattern = String(rule.pattern ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!kind) return { ok: false, reason: 'Choose what this rule does.' };
    if (pattern === '') return { ok: false, reason: 'Enter the text to match.' };
    return {
        ok: true,
        rule: {
            id: typeof rule.id === 'string' && rule.id !== '' ? rule.id : '',
            pattern,
            kind,
            categoryId: kind === 'expense' ? String(rule.categoryId ?? '') : '',
            subcategoryId: kind === 'expense' ? String(rule.subcategoryId ?? '') : '',
            incomeCategoryId: kind === 'income' ? String(rule.incomeCategoryId ?? '') : '',
            refund: kind === 'expense' && rule.refund === true,
            note: cleanNote(rule.note),
        },
    };
}

/**
 * Same id, or same pattern for the same money direction, replaces the stored rule in place.
 * So 'RIMI' as a groceries expense and 'RIMI' as a refund can live side by side.
 */
export function upsertRule(data, rule) {
    const cleaned = cleanRule(rule);
    if (!cleaned.ok) return cleaned;
    data.rules ??= [];

    const next = cleaned.rule;
    let index = next.id ? data.rules.findIndex(({ id }) => id === next.id) : -1;
    if (index === -1) {
        index = data.rules.findIndex((stored) => matchText(stored.pattern) === matchText(next.pattern)
            && ruleSide(stored) === ruleSide(next));
    }
    if (index === -1) {
        next.id = next.id || createId('rule');
        data.rules.push(next);
    } else {
        next.id = data.rules[index].id;
        data.rules[index] = next;
    }
    return { ok: true, rule: next };
}

export function deleteRule(data, id) {
    const index = (data.rules ?? []).findIndex((rule) => rule.id === id);
    if (index === -1) return false;
    data.rules.splice(index, 1);
    return true;
}

function pastMonthsWithoutPlan(data, dates, now) {
    const current = currentMonthKey(now);
    const months = new Set();
    for (const date of dates) {
        const key = monthKeyOf(date);
        if (
            key !== null
            && compareMonthKeys(key, current) < 0
            && !Object.hasOwn(data.monthPlans ?? {}, key)
        ) {
            months.add(key);
        }
    }
    return [...months].sort(compareMonthKeys);
}

/** Pass only the rows that will be stored; the current and future months never need a choice. */
export function monthsNeedingPlanChoice(data, rows, now = new Date()) {
    return pastMonthsWithoutPlan(data, rows.map(({ date }) => date), now);
}

function defaultIncomeCategoryId(data) {
    const categories = data.incomeCategories ?? [];
    return categories.find(({ id }) => id === 'income-other')?.id ?? categories[0]?.id ?? '';
}

function suggestedRule(rules, row) {
    const rule = applyRules(rules, row);
    if (rule || row.direction !== 'in') return { rule, kind: rule ? ruleKind(rule) : '' };
    const shop = applyRules(rules, { ...row, direction: 'out' });
    return shop ? { rule: shop, kind: 'refund' } : { rule: null, kind: '' };
}

/** The category the card payment's MCC points to, when the row is money out and that subcategory still exists. */
function mccSuggestion(data, row) {
    const subcategoryId = row.direction === 'out' ? subcategoryForMcc(row.mcc) : '';
    if (subcategoryId === '') return null;
    const category = (data.categories ?? []).find(
        ({ subcategories }) => (subcategories ?? []).some(({ id }) => id === subcategoryId),
    );
    return category ? { categoryId: category.id, subcategoryId } : null;
}

/** The kind the bank's own transaction type points to; a refund only makes sense for money in. */
function hintedKind(row) {
    if (row.kindHint === 'transfer') return 'transfer';
    return row.kindHint === 'refund' && row.direction === 'in' ? 'refund' : '';
}

/** A reversal of money out comes back as money in: a refund. Money out stays a visible expense. */
function reversalKind(row) {
    return row.reversal === true && row.direction === 'in' ? 'refund' : '';
}

/**
 * Indexes of eligible rows paired as money moved between own accounts: a money-out and a money-in row
 * with the same currency and amount, at most OWN_TRANSFER_DAYS apart. Nearest date first, then lower row index.
 *
 * Same result as listing every out/in pair, sorting by (gap, lower index, higher index) and taking pairs greedily,
 * without listing them: for one gap, the lowest-index row that still has a partner takes the lowest-index free
 * row of the opposite direction on a day that far away. Rows are visited in index order, per bucket and per gap.
 */
function ownTransferPairs(rows, eligible) {
    const buckets = new Map();
    rows.forEach((row, index) => {
        if (!eligible[index]) return;
        const key = `${row.currency}|${row.amountCents}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(index);
    });

    const paired = new Set();
    for (const indexes of buckets.values()) {
        // Free rows by direction and day, in index order; `head` skips rows already paired.
        const queues = { out: new Map(), in: new Map() };
        for (const index of indexes) {
            const { direction } = rows[index];
            const day = dayNumber(rows[index].date);
            if (!queues[direction]) continue;
            if (!queues[direction].has(day)) queues[direction].set(day, { list: [], head: 0 });
            queues[direction].get(day).list.push(index);
        }
        const firstFree = (direction, day) => {
            const queue = queues[direction].get(day);
            if (!queue) return -1;
            while (queue.head < queue.list.length && paired.has(queue.list[queue.head])) queue.head += 1;
            return queue.head < queue.list.length ? queue.list[queue.head] : -1;
        };

        for (let gap = 0; gap <= OWN_TRANSFER_DAYS; gap += 1) {
            const offsets = gap === 0 ? [0] : [-gap, gap];
            for (const index of indexes) {
                if (paired.has(index)) continue;
                const { direction, date } = rows[index];
                if (!queues[direction]) continue;
                const day = dayNumber(date);
                let partner = -1;
                for (const offset of offsets) {
                    const free = firstFree(direction === 'out' ? 'in' : 'out', day + offset);
                    if (free !== -1 && (partner === -1 || free < partner)) partner = free;
                }
                if (partner === -1) continue;
                paired.add(index);
                paired.add(partner);
            }
        }
    }
    return paired;
}

/**
 * Pre-filled decisions for the wizard: rules applied, rows that look like a saved entry start unticked.
 * Money in that only matches a shop expense rule is suggested as a refund in that category.
 * Money out without a saved rule gets the category its card MCC points to, if any; nothing is remembered from it.
 * A money-out and a money-in row of the same amount a day apart, with no rule, hint or MCC, are both set to Transfer.
 * A camt reversal and the payment it cancels (see pairReversals) are both set to Skip; a reversal of money out is a Refund.
 */
export function defaultDecisions(data, rows, duplicates = findDuplicates(data, rows)) {
    const eligible = [];
    const suggestions = rows.map((row) => suggestedRule(data.rules, row));
    const reversalSkips = new Set(pairReversals(rows, (i) => !duplicates[i]?.level && !suggestions[i].rule).flat());
    const decisions = rows.map((row, index) => {
        const { rule, kind: ruleKindName } = suggestions[index];
        const hint = rule ? null : mccSuggestion(data, row);
        const hinted = hintedKind(row);
        eligible[index] = !rule && !hinted && !row.reversal && !reversalSkips.has(index) && !duplicates[index]?.level && !row.mcc
            && Number.isInteger(row.amountCents) && row.amountCents >= OWN_TRANSFER_MIN_CENTS
            && dayNumber(row.date) !== null;
        const kind = ruleKindName || (reversalSkips.has(index) ? 'skip' : '') || reversalKind(row) || hinted
            || (row.direction === 'in' ? 'income' : 'expense');
        return {
            include: !duplicates[index]?.level,
            kind,
            categoryId: rule?.categoryId || hint?.categoryId || UNCATEGORISED_ID,
            subcategoryId: rule?.subcategoryId ?? hint?.subcategoryId ?? '',
            incomeCategoryId: rule?.incomeCategoryId || defaultIncomeCategoryId(data),
            remember: false,
            ruleId: rule?.id ?? '',
            showAs: rule?.note ?? '',
        };
    });
    for (const index of ownTransferPairs(rows, eligible)) decisions[index].kind = 'transfer';
    return decisions;
}

/** The bank's own words for a row: counterparty and description, without repeats. */
function bankTextOf(row) {
    const parts = [row.counterparty, row.description]
        .map((part) => String(part ?? '').replace(/\s+/g, ' ').trim())
        .filter((part) => part !== '');
    const unique = parts.filter((part, index) => index === 0 || !parts[0].includes(part));
    return unique.join(' \u00b7 ');
}

/** Entry note: an explicit note, else the "Show as" text, else the bank's own text. */
function noteFor(row, decision) {
    if (typeof decision.note === 'string') {
        return cleanNote(decision.note);
    }
    const showAs = cleanNote(decision.showAs);
    return showAs !== '' ? showAs : cleanNote(row.counterparty || row.description || '');
}

function validateDecision(data, row, decision) {
    if (!decision || typeof decision !== 'object') return 'Decision is missing.';
    if (!KINDS.includes(decision.kind)) return 'Choose what this row is.';
    if (decision.kind === 'transfer' || decision.kind === 'skip') return '';
    if (monthKeyOf(row.date) === null) return 'Date is not valid.';

    const amount = Number.isInteger(row.amountCents) ? row.amountCents : decision.amountCents;
    if (!Number.isInteger(amount) || amount <= 0) {
        return `Enter the amount in EUR for this ${row.currency} payment.`;
    }

    if (decision.kind === 'expense' && row.direction !== 'out') {
        return 'Money in cannot be an expense. Choose refund or income.';
    }
    if (decision.kind === 'refund' && row.direction !== 'in') {
        return 'Money out cannot be a refund.';
    }
    if (decision.kind === 'income' && row.direction !== 'in') {
        return 'Money out cannot be income.';
    }
    if (decision.kind === 'income') {
        if (!(data.incomeCategories ?? []).some(({ id }) => id === decision.incomeCategoryId)) {
            return 'Choose an income category.';
        }
        return '';
    }

    const category = (data.categories ?? []).find(({ id }) => id === decision.categoryId);
    if (!category) return 'Choose a category.';
    const sub = decision.subcategoryId ?? '';
    if (sub !== '' && !(category.subcategories ?? []).some(({ id }) => id === sub)) {
        return 'Subcategory does not belong to this category.';
    }
    return '';
}

function ruleFromDecision(row, decision) {
    const pattern = String(decision.pattern ?? '').trim()
        || extractPattern(row.counterparty || row.description);
    if (pattern === '') return null;
    const refund = decision.kind === 'refund';
    return {
        pattern: pattern.toUpperCase(),
        kind: refund ? 'expense' : decision.kind,
        categoryId: decision.categoryId ?? '',
        subcategoryId: decision.subcategoryId ?? '',
        incomeCategoryId: decision.incomeCategoryId ?? '',
        refund,
        note: cleanNote(decision.showAs),
    };
}

function emptyCounts() {
    return { expenses: 0, incomes: 0, refunds: 0, duplicates: 0, transfers: 0, skipped: 0 };
}

/**
 * meta: { rows, format, fileName, duplicates?, now? }.
 * Returns { ok, errors, importRecord, expenses, incomes, rules, planChoices, totals }.
 * planChoices lists past month keys without a frozen plan; applyImport needs a choice for each.
 */
export function buildImport(data, decisions, meta) {
    const rows = meta?.rows ?? [];
    const now = meta?.now ?? new Date();
    const duplicates = meta?.duplicates ?? findDuplicates(data, rows);
    const fingerprints = makeFingerprints(rows);
    const importId = createId('imp');
    const counts = emptyCounts();
    const errors = [];
    const expenses = [];
    const incomes = [];
    const rulesByPattern = new Map();
    const ignored = [];
    let totalOutCents = 0;
    let totalInCents = 0;

    rows.forEach((row, index) => {
        const decision = decisions?.[index];
        if (!decision || decision.include !== true) {
            if (duplicates[index]?.level) counts.duplicates += 1;
            else counts.skipped += 1;
            return;
        }

        const reason = validateDecision(data, row, decision);
        if (reason) {
            errors.push({ index, reason });
            return;
        }

        if (decision.remember === true) {
            const rule = ruleFromDecision(row, decision);
            if (rule) rulesByPattern.set(rule.pattern, rule);
        }

        if (decision.kind === 'transfer' || decision.kind === 'skip') {
            counts[decision.kind === 'transfer' ? 'transfers' : 'skipped'] += 1;
            ignored.push({
                kind: decision.kind,
                direction: row.direction,
                bankRef: row.bankRef ?? '',
                fingerprint: fingerprints[index],
            });
            return;
        }

        const amountCents = Number.isInteger(row.amountCents) ? row.amountCents : decision.amountCents;
        const shared = {
            amountCents,
            note: noteFor(row, decision),
            date: row.date,
            currency: row.currency || 'EUR',
            originalAmountCents: row.currency === 'EUR' || !row.currency
                ? amountCents
                : row.originalAmountCents,
            importId,
            bankRef: row.bankRef ?? '',
            bankText: bankTextOf(row),
            fingerprint: fingerprints[index],
        };

        if (decision.kind === 'income') {
            incomes.push({
                id: createId('inc'),
                incomeCategoryId: decision.incomeCategoryId,
                ...shared,
                ...(decision.sourceId
                    && (data.incomeSources ?? []).some(({ id }) => id === decision.sourceId)
                    ? { sourceId: decision.sourceId }
                    : {}),
            });
            counts.incomes += 1;
            totalInCents += amountCents;
            return;
        }

        const refund = decision.kind === 'refund';
        expenses.push({
            id: createId('exp'),
            categoryId: decision.categoryId,
            subcategoryId: decision.subcategoryId ?? '',
            ...shared,
            refund,
            goalId: '',
            ...(decision.kind === 'expense' && decision.subscriptionId
                && (data.subscriptions ?? []).some(({ id }) => id === decision.subscriptionId)
                ? { subscriptionId: decision.subscriptionId }
                : {}),
        });
        if (refund) {
            counts.refunds += 1;
            totalInCents += amountCents;
        } else {
            counts.expenses += 1;
            totalOutCents += amountCents;
        }
    });

    const dates = rows.map(({ date }) => date).filter((date) => monthKeyOf(date) !== null).sort();
    const importRecord = {
        id: importId,
        createdAt: now.toISOString(),
        source: { format: meta?.format ?? '', fileName: meta?.fileName ?? '' },
        counts,
        periodFrom: dates[0] ?? '',
        periodTo: dates[dates.length - 1] ?? '',
        expenseIds: expenses.map(({ id }) => id),
        incomeIds: incomes.map(({ id }) => id),
        ignored,
        undoneAt: '',
    };

    return {
        ok: errors.length === 0,
        errors,
        importRecord,
        expenses,
        incomes,
        rules: [...rulesByPattern.values()],
        planChoices: pastMonthsWithoutPlan(
            data,
            [...expenses, ...incomes].map(({ date }) => date),
            now,
        ),
        totals: { totalOutCents, totalInCents },
    };
}

function actualOnlyPlan(data) {
    const plan = buildPlanSnapshot(data);
    return {
        ...plan,
        monthlyBudgetCents: 0,
        usualMonthlyIncomeCents: 0,
        unallocatedPercent: 0,
        unallocatedCents: 0,
        entries: plan.entries.map((entry) => ({ ...entry, limitCents: 0, percent: 0 })),
        actualOnly: true,
    };
}

/** All-or-nothing: validates first, then mutates. Returns { ok, importId, counts } or { ok: false, reason, errors }. */
export function applyImport(data, built, planChoices = {}) {
    if (!built || !built.importRecord) {
        return { ok: false, reason: 'Nothing to import.', errors: [] };
    }
    if (built.errors?.length > 0) {
        return { ok: false, reason: 'Some rows need attention before import.', errors: built.errors };
    }
    if ((data.imports ?? []).some(({ id }) => id === built.importRecord.id)) {
        return { ok: false, reason: 'This import was already applied.', errors: [] };
    }

    const pending = new Set(built.planChoices ?? []);
    for (const monthKey of pending) {
        if (Object.hasOwn(data.monthPlans ?? {}, monthKey)) continue;
        if (!PLAN_CHOICES.includes(planChoices?.[monthKey])) {
            return {
                ok: false,
                reason: `Choose a plan for ${monthKey}.`,
                errors: [{ monthKey, reason: 'Plan choice is missing.' }],
            };
        }
    }

    const cleanedRules = [];
    for (const rule of built.rules ?? []) {
        const cleaned = cleanRule(rule);
        if (!cleaned.ok) {
            return { ok: false, reason: cleaned.reason, errors: [] };
        }
        cleanedRules.push(cleaned.rule);
    }

    const months = new Set(
        [...built.expenses, ...built.incomes].map(({ date }) => monthKeyOf(date)),
    );
    const planWrites = [];
    for (const monthKey of [...months].sort(compareMonthKeys)) {
        if (Object.hasOwn(data.monthPlans ?? {}, monthKey)) continue;
        planWrites.push([
            monthKey,
            pending.has(monthKey) && planChoices[monthKey] === 'actualOnly' ? 'actualOnly' : 'current',
        ]);
    }

    data.monthPlans ??= {};
    data.rules ??= [];
    data.imports ??= [];
    data.expenses ??= [];
    data.incomes ??= [];

    for (const [monthKey, choice] of planWrites) {
        if (choice === 'actualOnly') {
            data.monthPlans[monthKey] = actualOnlyPlan(data);
        } else {
            freezeMonthPlan(data, monthKey);
        }
    }
    for (const entry of built.expenses) data.expenses.push({ ...entry });
    for (const entry of built.incomes) data.incomes.push({ ...entry });
    for (const rule of cleanedRules) {
        upsertRule(data, rule);
    }
    const record = {
        ...built.importRecord,
        source: { ...built.importRecord.source },
        counts: { ...built.importRecord.counts },
        expenseIds: [...built.importRecord.expenseIds],
        incomeIds: [...built.importRecord.incomeIds],
        createdPlans: planWrites.map(([monthKey]) => monthKey),
    };
    data.imports.push(record);

    return { ok: true, importId: record.id, counts: { ...record.counts } };
}

const isEdited = (entry) => typeof entry.editedAt === 'string' && entry.editedAt !== '';

function removeByIds(list, ids, keepEdited = false) {
    let removed = 0;
    for (let index = list.length - 1; index >= 0; index -= 1) {
        if (ids.has(list[index].id) && !(keepEdited && isEdited(list[index]))) {
            list.splice(index, 1);
            removed += 1;
        }
    }
    return removed;
}

/** Removes the "Bank difference" entries the done screen aligned for this import; not counted. */
function removeAligned(list, importId) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
        if (importId !== '' && list[index].alignedBy === importId) {
            list.splice(index, 1);
        }
    }
}

/**
 * How many entries of an import are still present (`total`) and how many of
 * them were changed after the import (`edited`). 0 and 0 when unknown or undone.
 */
export function importEditInfo(data, importId) {
    const record = (data.imports ?? []).find(({ id }) => id === importId);
    if (!record || record.undoneAt) return { total: 0, edited: 0 };
    const expenseIds = new Set(record.expenseIds);
    const incomeIds = new Set(record.incomeIds);
    const present = [
        ...(data.expenses ?? []).filter(({ id }) => expenseIds.has(id)),
        ...(data.incomes ?? []).filter(({ id }) => incomeIds.has(id)),
    ];
    return { total: present.length, edited: present.filter(isEdited).length };
}

/**
 * Returns the number of entries removed; 0 when unknown or already undone.
 * With `keepEdited`, entries changed after the import stay.
 */
export function undoImport(data, importId, now = new Date(), { keepEdited = false } = {}) {
    const record = (data.imports ?? []).find(({ id }) => id === importId);
    if (!record || record.undoneAt) return 0;

    const removed = removeByIds(data.expenses ?? [], new Set(record.expenseIds), keepEdited)
        + removeByIds(data.incomes ?? [], new Set(record.incomeIds), keepEdited);
    removeAligned(data.expenses ?? [], importId);
    removeAligned(data.incomes ?? [], importId);
    // Plans this import created go too, unless the month has other entries now.
    for (const monthKey of record.createdPlans ?? []) {
        const used = [...(data.expenses ?? []), ...(data.incomes ?? [])]
            .some(({ date }) => monthKeyOf(date) === monthKey);
        if (!used && data.monthPlans) {
            delete data.monthPlans[monthKey];
        }
    }
    record.undoneAt = now.toISOString();
    return removed;
}

/**
 * Undoes an import and saves; if saving fails, puts every list back as it was.
 * `save` returns false on failure (like ctx.save / persist).
 * With `keepEdited` the result also says how many changed entries were kept.
 */
export function undoImportAndSave(data, importId, save, options = {}) {
    const keys = ['expenses', 'incomes', 'monthPlans', 'imports'];
    const before = JSON.parse(JSON.stringify(Object.fromEntries(keys.map((key) => [key, data[key]]))));
    const { total } = importEditInfo(data, importId);
    const removed = undoImport(data, importId, new Date(), options);
    if (save() === false) {
        Object.assign(data, before);
        return { ok: false, removed: 0 };
    }
    return options.keepEdited ? { ok: true, removed, kept: total - removed } : { ok: true, removed };
}

export function summarise(built) {
    const counts = built.importRecord.counts;
    return {
        ...counts,
        totalOutCents: built.totals?.totalOutCents ?? 0,
        totalInCents: built.totals?.totalInCents ?? 0,
        periodFrom: built.importRecord.periodFrom,
        periodTo: built.importRecord.periodTo,
    };
}

/**
 * Re-applies one rule to entries imported earlier whose bank text matches it:
 * sets the category (and subcategory) and, when the rule has one, the "Show as" note.
 * Manual entries are never touched. Returns how many entries changed.
 */
export function applyRuleToExisting(data, ruleId, now = new Date()) {
    const rule = (data.rules ?? []).find(({ id }) => id === ruleId);
    if (!rule) return 0;
    if (rule.kind === 'expense' && !(data.categories ?? []).some(({ id }) => id === rule.categoryId)) {
        return 0;
    }
    if (rule.kind === 'income' && !(data.incomeCategories ?? []).some(({ id }) => id === rule.incomeCategoryId)) {
        return 0;
    }
    const pattern = usableKeyword(rule.pattern);
    if (pattern === '') return 0;

    let changed = 0;
    const matches = (entry) => entry.importId
        && hasKeyword(matchText(entry.bankText || entry.note || ''), pattern);

    if (rule.kind === 'expense') {
        for (const expense of data.expenses ?? []) {
            if (!matches(expense) || expense.refund !== (rule.refund === true)) continue;
            const before = { categoryId: expense.categoryId, subcategoryId: expense.subcategoryId, note: expense.note };
            expense.categoryId = rule.categoryId || expense.categoryId;
            expense.subcategoryId = rule.categoryId ? (rule.subcategoryId ?? '') : expense.subcategoryId;
            if (rule.note) expense.note = rule.note;
            markEdited(expense, before, now);
            changed += 1;
        }
    } else if (rule.kind === 'income') {
        for (const income of data.incomes ?? []) {
            if (!matches(income)) continue;
            const before = { incomeCategoryId: income.incomeCategoryId, note: income.note };
            income.incomeCategoryId = rule.incomeCategoryId || income.incomeCategoryId;
            if (rule.note) income.note = rule.note;
            markEdited(income, before, now);
            changed += 1;
        }
    }
    return changed;
}
