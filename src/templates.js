import { createId } from './model.js';
import { todayISO } from './months.js';

const MAX_NAME_LENGTH = 40;

export const QUICK_ADD_REPEAT_MS = 1500;

/**
 * True when the same template is tapped again inside the repeat window.
 * @param {{ id: string, at: number } | null} last
 * @param {string} templateId
 * @param {number} nowMs
 * @param {number} [windowMs]
 * @returns {boolean}
 */
export function isRepeatTap(last, templateId, nowMs, windowMs = QUICK_ADD_REPEAT_MS) {
    if (last === null || last.id !== templateId) {
        return false;
    }
    const gap = nowMs - last.at;
    return gap >= 0 && gap < windowMs;
}

function validateTemplate({ name, amountCents }) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (trimmedName === '') {
        return { ok: false, reason: 'Template name is required.' };
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
        return { ok: false, reason: `Template name must be ${MAX_NAME_LENGTH} characters or fewer.` };
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return { ok: false, reason: 'Amount must be a positive number.' };
    }

    return { ok: true, name: trimmedName };
}

/**
 * @param {object} data
 * @param {{ name: string, categoryId: string, subcategoryId?: string, amountCents: number, note?: string }} template
 * @returns {{ ok: true, template: object } | { ok: false, reason: string }}
 */
export function addTemplate(data, template) {
    const validated = validateTemplate(template);
    if (!validated.ok) {
        return validated;
    }

    if (!Array.isArray(data.templates)) {
        data.templates = [];
    }

    const record = {
        id: createId('tpl'),
        name: validated.name,
        categoryId: template.categoryId ?? '',
        subcategoryId: template.subcategoryId ?? '',
        amountCents: template.amountCents,
        note: template.note ?? '',
    };
    data.templates.push(record);

    return { ok: true, template: record };
}

/**
 * Renames and/or re-prices a template. Category and note are not editable here.
 * @param {object} data
 * @param {string} id
 * @param {{ name?: string, amountCents?: number }} patch
 * @returns {{ ok: true, template: object } | { ok: false, reason: string }}
 */
export function updateTemplate(data, id, patch) {
    const record = Array.isArray(data.templates)
        ? data.templates.find((template) => template.id === id)
        : undefined;
    if (record === undefined) {
        return { ok: false, reason: 'Template does not exist.' };
    }

    const candidate = {
        name: patch.name ?? record.name,
        amountCents: patch.amountCents ?? record.amountCents,
    };
    const validated = validateTemplate(candidate);
    if (!validated.ok) {
        return validated;
    }

    record.name = validated.name;
    record.amountCents = candidate.amountCents;
    return { ok: true, template: record };
}

/**
 * @param {object} data
 * @param {string} id
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function deleteTemplate(data, id) {
    if (!Array.isArray(data.templates)) {
        data.templates = [];
    }

    const index = data.templates.findIndex((template) => template.id === id);
    if (index === -1) {
        return { ok: false, reason: 'Template does not exist.' };
    }

    data.templates.splice(index, 1);
    return { ok: true };
}

/**
 * Builds an expense draft from a template, ready to prefill the add-expense form.
 * @param {{ categoryId: string, subcategoryId?: string, amountCents: number, note?: string }} template
 * @param {string} [date]
 * @returns {object}
 */
export function templateToExpense(template, date = todayISO()) {
    return {
        categoryId: template.categoryId ?? '',
        subcategoryId: template.subcategoryId ?? '',
        amountCents: template.amountCents,
        note: template.note ?? '',
        date,
        currency: 'EUR',
        originalAmountCents: template.amountCents,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: '',
    };
}
