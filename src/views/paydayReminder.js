import { confirmIncome, dueIncomes, skipIncomeMonth } from '../incomeSources.js';
import { freezeMonthPlan } from '../budget.js';
import { formatEuro, formatPlain } from '../money.js';
import { shortDate, todayISO } from '../months.js';

/** `${source.id}:${monthKey}` of reminders hidden with Later; lasts until the page is reloaded. */
const postponed = new Set();
/** Typed amount and error per reminder key, so a re-render does not lose them. */
const drafts = new Map();

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

function reminderKey(item) {
    return `${item.source.id}:${item.monthKey}`;
}

/**
 * Title of a due income: today's payday or an earlier one that was never confirmed.
 * @param {{ source: { name: string }, date: string, expectedCents: number }} item
 * @param {Date} [now]
 */
export function reminderTitle(item, now = new Date()) {
    const when = item.date === todayISO(now) ? 'today' : `on ${shortDate(item.date)}`;
    return `${item.source.name} expected ${when}: ${formatEuro(item.expectedCents)}`;
}

function receive(ctx, item, key, input, error) {
    const typed = input.value;
    const result = confirmIncome(ctx.data, item.source, item.monthKey, { amountText: typed });
    if (!result.ok) {
        drafts.set(key, { text: typed, error: result.reason });
        error.textContent = result.reason;
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', error.id);
        input.focus();
        return;
    }
    const planWasAlreadyFrozen = Object.hasOwn(ctx.data.monthPlans, item.monthKey);
    freezeMonthPlan(ctx.data, item.monthKey);
    if (ctx.save() === false) {
        ctx.data.incomes.splice(ctx.data.incomes.indexOf(result.entry), 1);
        if (!planWasAlreadyFrozen) {
            delete ctx.data.monthPlans[item.monthKey];
        }
        drafts.set(key, { text: typed, error: '' });
        ctx.render();
        return;
    }
    drafts.delete(key);
    ctx.toast('Income recorded');
}

function skip(ctx, item, key) {
    const alreadySkipped = item.source.skippedMonths.includes(item.monthKey);
    skipIncomeMonth(ctx.data, item.source.id, item.monthKey);
    if (ctx.save() === false) {
        if (!alreadySkipped) {
            const skipped = item.source.skippedMonths;
            skipped.splice(skipped.indexOf(item.monthKey), 1);
        }
        ctx.render();
        return;
    }
    drafts.delete(key);
    ctx.toast('Skipped for this month');
}

function renderReminder(ctx, item, index, now) {
    const key = reminderKey(item);
    const draft = drafts.get(key) ?? { text: formatPlain(item.expectedCents, '.'), error: '' };
    const title = reminderTitle(item, now);

    const card = element('section', 'card stack');
    card.setAttribute('aria-label', title);
    const heading = element('p', '');
    heading.append(element('strong', '', title));

    const field = element('div', 'field');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.id = `payday-amount-${index}`;
    input.value = draft.text;
    const label = element('label', '', 'Amount received (EUR)');
    label.htmlFor = input.id;
    const error = element('p', 'error-text', draft.error);
    error.id = `${input.id}-error`;
    error.hidden = draft.error === '';
    if (draft.error !== '') {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', error.id);
    }
    input.addEventListener('input', () => {
        drafts.set(key, { text: input.value, error: '' });
        error.textContent = '';
        error.hidden = true;
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
    });
    field.append(label, input, error);

    const received = element('button', 'btn btn-primary', 'Received');
    received.addEventListener('click', () => receive(ctx, item, key, input, error));
    const later = element('button', 'btn btn-ghost', 'Later');
    later.addEventListener('click', () => {
        postponed.add(key);
        ctx.render();
    });
    const skipButton = element('button', 'btn btn-ghost', 'Skip this month');
    skipButton.addEventListener('click', () => skip(ctx, item, key));
    const actions = element('div', 'home-actions');
    for (const button of [received, later, skipButton]) {
        button.type = 'button';
        actions.append(button);
    }

    card.append(heading, field, actions);
    return card;
}

/**
 * One card per payday that is due and not postponed, oldest first; null when there is none.
 * @param {object} ctx
 * @returns {HTMLElement | null}
 */
export function renderPaydayReminders(ctx) {
    const now = new Date();
    const items = dueIncomes(ctx.data, now).filter((item) => !postponed.has(reminderKey(item)));
    if (items.length === 0) {
        return null;
    }
    const container = element('div', '');
    items.forEach((item, index) => container.append(renderReminder(ctx, item, index, now)));
    return container;
}
