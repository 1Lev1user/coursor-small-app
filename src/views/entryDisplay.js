import { formatEuro } from '../money.js';

function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

/**
 * Display text for an entry amount. Income shows "+", refunds show a minus;
 * both are drawn in the ok colour (`positive`).
 * @returns {{ text: string, positive: boolean }}
 */
export function entryAmountText(type, entry) {
    if (type === 'income') {
        return { text: `+${formatEuro(entry.amountCents)}`, positive: true };
    }
    if (entry.refund === true) {
        return { text: `−${formatEuro(entry.amountCents)}`, positive: true };
    }
    return { text: formatEuro(entry.amountCents), positive: false };
}

/** Tag labels for an entry: "Refund" and "Imported". */
export function entryTagLabels(type, entry) {
    const labels = [];
    if (type === 'expense' && entry.refund === true) {
        labels.push('Refund');
    }
    if (typeof entry.importId === 'string' && entry.importId !== '') {
        labels.push('Imported');
    }
    return labels;
}

/** Tag row element, or null when the entry has no tags. */
export function entryTags(type, entry) {
    const labels = entryTagLabels(type, entry);
    if (labels.length === 0) {
        return null;
    }
    const wrap = element('p', 'entry-tags');
    for (const text of labels) {
        wrap.append(element(
            'span',
            text === 'Refund' ? 'pill entry-tag is-refund' : 'pill entry-tag',
            text,
        ));
    }
    return wrap;
}
