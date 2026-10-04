import { moneyNow, setPerDay } from '../../balance.js';
import { formatEuro, formatPlain } from '../../money.js';
import { fullDate } from '../../months.js';
import { savedText } from '../homeMoney.js';
import { buildField, clearError, element, persist, setError } from './shared.js';

const AMOUNT_ID = 'per-day-fixed-amount';

/** Per-day form draft; null until the owner touches the form, so a re-render keeps the choice. */
let draft = null;

/** The one line under the Money group title; empty without Money now. */
export function moneySummary(data, now = new Date()) {
    const cents = moneyNow(data, now);
    return cents === null ? '' : `Money now ${formatEuro(cents)}`;
}

function renderPerDayForm(ctx) {
    const settings = ctx.data.settings;
    const current = draft ?? {
        mode: settings.perDayMode,
        amount: settings.perDayFixedCents > 0 ? formatPlain(settings.perDayFixedCents) : '',
    };

    const form = element('form', 'inline-form');
    form.noValidate = true;
    const fieldset = element('fieldset', 'choice-set');
    const legend = document.createElement('legend');
    legend.textContent = 'Amount per day';
    fieldset.append(legend);

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = current.amount;
    const field = buildField(AMOUNT_ID, 'Fixed amount per day (EUR)', input);
    field.wrapper.hidden = current.mode !== 'fixed';
    input.addEventListener('input', () => {
        draft = { mode: 'fixed', amount: input.value };
        clearError(field);
    });

    const row = element('div', 'choice-row');
    const options = [
        { value: 'auto', label: 'Automatic' },
        { value: 'fixed', label: 'Fixed amount' },
    ];
    for (const { value, label } of options) {
        const choice = element('label', 'choice');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'per-day-mode';
        radio.value = value;
        radio.checked = current.mode === value;
        radio.addEventListener('change', () => {
            draft = { mode: value, amount: input.value };
            field.wrapper.hidden = value !== 'fixed';
            clearError(field);
        });
        choice.append(radio, document.createTextNode(label));
        row.append(choice);
    }
    fieldset.append(
        row,
        element('p', 'muted', 'Automatic: Money now divided by the days until your next payday, or until the end of the month.'),
    );

    const saveButton = element('button', 'btn btn-primary', 'Save');
    saveButton.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const mode = form.elements['per-day-mode'].value;
        const oldMode = settings.perDayMode;
        const oldCents = settings.perDayFixedCents;
        const result = setPerDay(ctx.data, mode, input.value);
        if (!result.ok) {
            setError(field, result.reason);
            input.focus();
            return;
        }
        draft = null;
        if (persist(ctx)) {
            ctx.toast('Per-day amount saved');
            return;
        }
        draft = { mode, amount: input.value };
        settings.perDayMode = oldMode;
        settings.perDayFixedCents = oldCents;
        ctx.render();
    });

    form.append(fieldset, field.wrapper, saveButton);
    return form;
}

export function renderBalanceSection(ctx) {
    const anchor = ctx.data.settings.balanceStart;
    const cents = moneyNow(ctx.data, new Date());
    const section = element('section', 'card stack');
    section.id = 'more-balance';
    const title = element('h2', 'section-title', 'Money now');
    title.id = 'balance-title';
    title.tabIndex = -1;
    section.append(title);

    if (cents === null) {
        section.append(element('p', 'muted', 'Money now is not set up yet.'));
        return section;
    }

    section.append(
        element('p', '', `Money now ${formatEuro(cents)}`),
        element(
            'p',
            'muted',
            `Counting since ${fullDate(anchor.date)}, starting from ${formatEuro(anchor.cents)}. Savings you put aside leave this figure.`,
        ),
    );
    const saved = savedText(ctx.data);
    if (saved !== null) {
        section.append(element('p', 'muted', saved));
    }
    section.append(renderPerDayForm(ctx));
    return section;
}
