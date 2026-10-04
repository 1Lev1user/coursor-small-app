import { checkAgainstBank, moneyNow, parseBalanceInput, perDay, savedCents } from '../balance.js';
import { formatEuro } from '../money.js';
import { shortDate } from '../months.js';
import { actionButton, buildField, clearError, element, setError } from './settings/shared.js';

const BAD_AMOUNT = 'Enter an amount such as 1250.00 or -40.00.';
const FIGURE_ID = 'home-money-figure';
const INPUT_ID = 'home-money-amount';

/** Check sheet state; lives until the page is reloaded, like the payday reminder drafts. */
let checking = false;
let checkDraft = '';
let checkError = '';
/** Id to focus after the next render (the block is not attached yet while it is built). */
let focusTarget = null;

/** '+€5.00' for positive amounts, plain formatEuro otherwise. */
export function signedEuro(cents) {
    return cents > 0 ? `+${formatEuro(cents)}` : formatEuro(cents);
}

/** The per-day line under Money now; null without Money now. */
export function perDayText(data, now = new Date()) {
    const info = perDay(data, now);
    if (info === null) {
        return null;
    }
    if (info.mode === 'fixed') {
        return info.leftTodayCents >= 0
            ? `${formatEuro(info.leftTodayCents)} left of today's ${formatEuro(info.amountCents)}`
            : `${formatEuro(-info.leftTodayCents)} over today's ${formatEuro(info.amountCents)}`;
    }
    const untilText = info.untilKind === 'payday' ? `payday ${shortDate(info.untilDate)}` : 'the end of the month';
    if (info.amountCents < 0) {
        return `Nothing left per day until ${untilText}`;
    }
    return `${formatEuro(info.amountCents)} a day for ${info.days === 1 ? '1 day' : `${info.days} days`} until ${untilText}`;
}

/** What was put into Savings since the anchor; null when nothing was. */
export function savedText(data, now = new Date()) {
    const saved = savedCents(data, now);
    if (saved === null || saved <= 0) {
        return null;
    }
    return `Put into Savings since ${shortDate(data.settings.balanceStart.date)}: ${formatEuro(saved)}`;
}

/** What saving the typed amount would do. Reads only, never changes the data. */
export function checkPreview(data, text, now = new Date()) {
    const moneyCents = moneyNow(data, now);
    if (moneyCents === null) {
        return { ok: false, reason: 'Set up Money now first.' };
    }
    const enteredCents = parseBalanceInput(text);
    if (enteredCents === null) {
        return { ok: false, reason: BAD_AMOUNT };
    }
    const differenceCents = enteredCents - moneyCents;
    const kind = differenceCents < 0 ? 'an expense in Uncategorised' : 'an income in Other';
    return {
        ok: true,
        enteredCents,
        moneyCents,
        differenceCents,
        text:
            differenceCents === 0
                ? 'Matches the app. Nothing will be added.'
                : `The app shows ${formatEuro(moneyCents)}. The difference ${signedEuro(differenceCents)} is added as ${kind} dated today, and counts in this month.`,
    };
}

/**
 * Adds the bank difference and calls save(); when save() returns false the entry
 * and a month plan frozen by it are removed again.
 */
export function applyBankCheck(data, text, save, now = new Date()) {
    const enteredCents = parseBalanceInput(text);
    if (enteredCents === null) {
        return { ok: false, reason: BAD_AMOUNT };
    }
    const result = checkAgainstBank(data, enteredCents, now);
    if (!result.ok || result.entry === null || save() !== false) {
        return result;
    }
    const list = result.type === 'expense' ? data.expenses : data.incomes;
    list.splice(list.indexOf(result.entry), 1);
    if (!result.planWasAlreadyFrozen) {
        delete data.monthPlans[result.monthKey];
    }
    return { ok: false, reason: '', rolledBack: true, differenceCents: result.differenceCents };
}

function closeSheet(ctx) {
    checking = false;
    checkDraft = '';
    checkError = '';
    focusTarget = FIGURE_ID;
    ctx.render();
}

function submitCheck(ctx, text) {
    checkDraft = text;
    checkError = '';
    // ctx.save() renders before it returns, so the sheet must already be closed.
    checking = false;
    focusTarget = FIGURE_ID;
    const result = applyBankCheck(ctx.data, text, () => ctx.save(), new Date());
    if (!result.ok) {
        checking = true;
        checkError = result.reason;
        focusTarget = INPUT_ID;
        ctx.render();
        return;
    }
    checkDraft = '';
    if (result.differenceCents === 0) {
        ctx.render();
        ctx.toast('Matches your bank. Nothing added.');
        return;
    }
    ctx.toast(`Difference added: ${signedEuro(result.differenceCents)}`);
}

function renderCheckSheet(ctx) {
    const form = element('form', 'card stack');
    form.noValidate = true;
    form.setAttribute('aria-label', 'How much is on the card now?');
    const heading = element('p', '');
    heading.append(element('strong', '', 'How much is on the card now?'));

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = checkDraft;
    const field = buildField(INPUT_ID, 'Amount on the card (EUR)', input);
    if (checkError !== '') {
        setError(field, checkError);
    }

    const previewOf = (text) => {
        const preview = checkPreview(ctx.data, text);
        return preview.ok ? preview.text : '';
    };
    const preview = element('p', 'muted', previewOf(checkDraft));
    preview.setAttribute('aria-live', 'polite');
    input.addEventListener('input', () => {
        checkDraft = input.value;
        checkError = '';
        clearError(field);
        preview.textContent = previewOf(input.value);
    });
    form.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeSheet(ctx);
        }
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitCheck(ctx, input.value);
    });

    const save = element('button', 'btn btn-primary', 'Save');
    save.type = 'submit';
    const actions = element('div', 'home-actions');
    actions.append(save, actionButton('btn', 'Cancel', () => closeSheet(ctx)));

    form.append(heading, field.wrapper, preview, actions);
    return form;
}

/** Money now as a button, the check sheet when open, then the per-day and Savings lines. */
export function renderMoneyBlock(ctx) {
    const moneyCents = moneyNow(ctx.data, new Date());
    const valueText = formatEuro(moneyCents);
    const block = element('div', 'stack home-money');

    const figure = element('button', moneyCents < 0 ? 'home-figure home-money-figure is-over' : 'home-figure home-money-figure');
    figure.type = 'button';
    figure.id = FIGURE_ID;
    figure.setAttribute('aria-expanded', String(checking));
    figure.append(
        element('span', 'home-figure-label', 'Money now'),
        element('span', valueText.length > 9 ? 'home-figure-value is-long' : 'home-figure-value', valueText),
        element('span', 'home-figure-sub', 'Tap to check against your bank'),
    );
    figure.addEventListener('click', () => {
        if (!checking) {
            checking = true;
            checkDraft = '';
            checkError = '';
        }
        focusTarget = INPUT_ID;
        ctx.render();
    });
    block.append(figure);

    if (checking) {
        block.append(renderCheckSheet(ctx));
    }
    for (const line of [perDayText(ctx.data), savedText(ctx.data)]) {
        if (line !== null) {
            block.append(element('p', 'muted home-money-line', line));
        }
    }

    if (focusTarget !== null) {
        const id = focusTarget;
        focusTarget = null;
        queueMicrotask(() => document.getElementById(id)?.focus());
    }
    return block;
}
