import { addMonths, monthLabel } from '../months.js';

function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className !== '') {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

export function renderMonthNav(root, ctx) {
    const navigator = element('div', 'row month-navigator');
    const previous = element('button', 'btn btn-ghost', '\u2039');
    previous.type = 'button';
    previous.setAttribute('aria-label', 'Previous month');
    previous.addEventListener('click', () => ctx.setMonthKey(addMonths(ctx.monthKey, -1)));

    const label = element('h2', 'month-title', monthLabel(ctx.monthKey));

    const next = element('button', 'btn btn-ghost', '\u203a');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next month');
    next.addEventListener('click', () => ctx.setMonthKey(addMonths(ctx.monthKey, 1)));

    navigator.append(previous, label, next);
    root.append(navigator);
}
