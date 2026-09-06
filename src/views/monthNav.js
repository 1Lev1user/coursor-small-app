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
    const navigator = element('div', 'month-navigator');

    const previous = element('button', 'btn btn-ghost month-nav-arrow', '\u2039');
    previous.type = 'button';
    previous.setAttribute('aria-label', 'Previous month');
    previous.addEventListener('click', () => ctx.setMonthKey(addMonths(ctx.monthKey, -1)));

    const label = element('span', 'month-title', monthLabel(ctx.monthKey));
    label.setAttribute('aria-hidden', 'true');

    const picker = document.createElement('input');
    picker.type = 'month';
    picker.className = 'month-picker-input';
    picker.value = ctx.monthKey;
    picker.setAttribute('aria-label', `Choose month, currently ${monthLabel(ctx.monthKey)}`);
    picker.addEventListener('change', () => {
        if (picker.value) {
            ctx.setMonthKey(picker.value);
        }
    });

    const center = element('div', 'month-nav-center');
    center.append(label, picker);

    const next = element('button', 'btn btn-ghost month-nav-arrow', '\u203a');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next month');
    next.addEventListener('click', () => ctx.setMonthKey(addMonths(ctx.monthKey, 1)));

    navigator.append(previous, center, next);
    root.append(navigator);
}
