import { createId, UNCATEGORISED_ID } from '../model.js';
import { buildPlanSnapshot, freezeMonthPlan } from '../budget.js';
import { compareMonthKeys, currentMonthKey, monthKeyOf } from '../months.js';

export const KINDS = ['expense', 'income', 'refund', 'transfer', 'skip'];
export const RULE_KINDS = ['expense', 'income', 'transfer', 'skip'];
export const PLAN_CHOICES = ['current', 'actualOnly'];

const NOTE_MAX = 120;
const WEAK_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Exact: same non-empty bankRef or same stored fingerprint.
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
            byBankRef.set(key, [...(byBankRef.get(key) ?? []), item]);
        }
        if (item.entry.fingerprint) byFingerprint.set(item.entry.fingerprint, item);
    }
    // A bank reference only proves a duplicate together with the same amount
    // and a date within a few days: some banks reuse references.
    const byReference = (row) => {
        if (!row.bankRef) return undefined;
        const day = dayNumber(row.date);
        return (byBankRef.get(`${row.direction}|${row.bankRef}`) ?? []).find(({ entry }) => {
            const entryDay = dayNumber(entry.date);
            return (entry.amountCents === row.amountCents || entry.originalAmountCents === row.originalAmountCents)
                && day !== null && entryDay !== null && Math.abs(day - entryDay) <= 5;
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

    rows.forEach((row, index) => {
        if (results[index].level !== null || !Number.isInteger(row.amountCents)) return;
        const item = stored.find(({ entry, direction }) => !claimed.has(entry.id)
            && isManual(entry)
            && direction === row.direction
            && entry.date === row.date
            && entry.amountCents === row.amountCents);
        if (item) claim(index, 'probable', item);
    });

    rows.forEach((row, index) => {
        if (results[index].level !== null || !Number.isInteger(row.amountCents)) return;
        const day = dayNumber(row.date);
        if (day === null) return;
        let best = null;
        let bestDistance = Infinity;
        for (const item of stored) {
            if (
                claimed.has(item.entry.id)
                || item.direction !== row.direction
                || item.entry.amountCents !== row.amountCents
            ) continue;
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
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
}

/**
 * Rule: take the first meaningful word. Leading noise words (POS, PIRKUMS, CARD) are skipped.
 * After a legal form (SIA, AS, UAB, OU) up to two name words are kept: 'SIA Circle K Latvia' -> 'CIRCLE K'.
 * After a payment processor (PAYPAL, SUMUP, SQ, IZ) the merchant is kept too: 'PAYPAL *SPOTIFY' -> 'PAYPAL SPOTIFY'.
 * Tokens with digits, card masks, dates, times, trailing Baltic cities and country codes are dropped.
 */
export function extractPattern(description) {
    const cleaned = stripNoise(String(description ?? '').toUpperCase())
        .replace(/[^\p{L}\p{N}&'.-]+/gu, ' ');
    const tokens = cleaned
        .split(' ')
        .map((token) => token.replace(/^[.'-]+|[.'-]+$/g, ''))
        .filter((token) => token !== '' && !/\d/.test(token));

    while (tokens.length > 0 && TRAILING_PLACES.has(tokens[tokens.length - 1])) {
        tokens.pop();
    }
    while (tokens.length > 1 && LEADING_NOISE.has(tokens[0])) {
        tokens.shift();
    }
    if (tokens.length === 0) return '';

    const first = tokens[0];
    if (LEGAL_FORMS.has(first) && tokens.length > 1) {
        return tokens.slice(1, 3).join(' ');
    }
    if (PROCESSORS.has(first) && tokens.length > 1) {
        return tokens.slice(0, 2).join(' ');
    }
    return first;
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
        const pattern = matchText(rule.pattern);
        if (
            pattern === ''
            || !haystack.includes(pattern)
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

/**
 * Pre-filled decisions for the wizard: rules applied, exact duplicates excluded.
 * Money in that only matches a shop expense rule is suggested as a refund in that category.
 */
export function defaultDecisions(data, rows, duplicates = findDuplicates(data, rows)) {
    return rows.map((row, index) => {
        const { rule, kind: ruleKindName } = suggestedRule(data.rules, row);
        const kind = ruleKindName || (row.direction === 'in' ? 'income' : 'expense');
        return {
            include: duplicates[index]?.level !== 'exact' && duplicates[index]?.level !== 'probable',
            kind,
            categoryId: rule?.categoryId || UNCATEGORISED_ID,
            subcategoryId: rule?.subcategoryId ?? '',
            incomeCategoryId: rule?.incomeCategoryId || defaultIncomeCategoryId(data),
            remember: false,
            ruleId: rule?.id ?? '',
            showAs: rule?.note ?? '',
        };
    });
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
    data.expenses.push(...built.expenses.map((entry) => ({ ...entry })));
    data.incomes.push(...built.incomes.map((entry) => ({ ...entry })));
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

function removeByIds(list, ids) {
    let removed = 0;
    for (let index = list.length - 1; index >= 0; index -= 1) {
        if (ids.has(list[index].id)) {
            list.splice(index, 1);
            removed += 1;
        }
    }
    return removed;
}

/** Returns the number of entries removed; 0 when unknown or already undone. */
export function undoImport(data, importId, now = new Date()) {
    const record = (data.imports ?? []).find(({ id }) => id === importId);
    if (!record || record.undoneAt) return 0;

    const removed = removeByIds(data.expenses ?? [], new Set(record.expenseIds))
        + removeByIds(data.incomes ?? [], new Set(record.incomeIds));
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
export function applyRuleToExisting(data, ruleId) {
    const rule = (data.rules ?? []).find(({ id }) => id === ruleId);
    if (!rule) return 0;
    if (rule.kind === 'expense' && !(data.categories ?? []).some(({ id }) => id === rule.categoryId)) {
        return 0;
    }
    if (rule.kind === 'income' && !(data.incomeCategories ?? []).some(({ id }) => id === rule.incomeCategoryId)) {
        return 0;
    }
    const pattern = matchText(rule.pattern);
    if (pattern === '') return 0;

    let changed = 0;
    const matches = (entry) => entry.importId
        && matchText(entry.bankText || entry.note || '').includes(pattern);

    if (rule.kind === 'expense') {
        for (const expense of data.expenses ?? []) {
            if (!matches(expense) || expense.refund !== (rule.refund === true)) continue;
            expense.categoryId = rule.categoryId || expense.categoryId;
            expense.subcategoryId = rule.categoryId ? (rule.subcategoryId ?? '') : expense.subcategoryId;
            if (rule.note) expense.note = rule.note;
            changed += 1;
        }
    } else if (rule.kind === 'income') {
        for (const income of data.incomes ?? []) {
            if (!matches(income)) continue;
            income.incomeCategoryId = rule.incomeCategoryId || income.incomeCategoryId;
            if (rule.note) income.note = rule.note;
            changed += 1;
        }
    }
    return changed;
}
