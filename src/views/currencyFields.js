import { CURRENCIES } from '../currency.js';
import { formatPlain, parseAmount } from '../money.js';

const EURO_LABEL = 'Amount (€)';

function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

function option(value, text) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = text;
    return element;
}

function field(id, labelText, control) {
    const wrapper = node('div', 'field');
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;

    const error = node('p', 'error-text');
    error.id = `${id}-error`;
    error.hidden = true;

    control.id = id;
    wrapper.append(label, control, error);
    return { wrapper, control, error, label };
}

function clearFieldError(target) {
    target.error.textContent = '';
    target.error.hidden = true;
    target.control.removeAttribute('aria-invalid');
    target.control.removeAttribute('aria-describedby');
}

/** Currency and original-amount draft values for an existing entry. */
export function currencyDraftFrom(entry) {
    const currency = typeof entry?.currency === 'string' && entry.currency !== ''
        ? entry.currency
        : 'EUR';
    return {
        currency,
        originalAmount: currency === 'EUR' || !Number.isInteger(entry?.originalAmountCents)
            ? ''
            : formatPlain(entry.originalAmountCents),
    };
}

/**
 * Parses the typed amounts. EUR keeps originalAmountCents equal to amountCents.
 * @returns {{ currency: string, amountCents: number|null, originalAmountCents: number|null }}
 */
export function readCurrencyAmounts(currency, amountText, originalText) {
    const amountCents = parseAmount(amountText);
    if (currency === 'EUR') {
        return { currency, amountCents, originalAmountCents: amountCents };
    }
    return { currency, amountCents, originalAmountCents: parseAmount(originalText) };
}

export function amountErrorText(currency) {
    return currency === 'EUR'
        ? 'Enter an amount above zero, like 12.50 or 12,50.'
        : 'Enter the euro amount from your bank, like 12.50.';
}

export function originalErrorText(currency) {
    return `Enter the amount in ${currency}, like 12.50.`;
}

/**
 * Adds a currency select and an "Amount in <CUR>" field next to an existing
 * euro amount field. The euro field is relabelled "Charged in EUR" when a
 * foreign currency is chosen. `draft` needs `currency` and `originalAmount`.
 */
export function buildCurrencyFields({ idPrefix, amountField, draft }) {
    const codes = CURRENCIES.includes(draft.currency)
        ? CURRENCIES
        : [...CURRENCIES, draft.currency];

    const select = document.createElement('select');
    select.append(...codes.map((code) => option(code, code)));
    select.value = draft.currency;
    const currencyField = field(`${idPrefix}-currency`, 'Currency', select);

    const originalInput = document.createElement('input');
    originalInput.type = 'text';
    originalInput.inputMode = 'decimal';
    originalInput.autocomplete = 'off';
    originalInput.placeholder = '50.00';
    originalInput.required = true;
    originalInput.setAttribute('aria-required', 'true');
    originalInput.value = draft.originalAmount;
    const originalField = field(`${idPrefix}-original`, '', originalInput);

    const amountLabel = amountField.wrapper.querySelector('label');
    const amountLabelText = node('span', '', EURO_LABEL);
    const hint = node('span', 'muted field-hint', 'The euro amount from your bank');
    amountLabel.replaceChildren(amountLabelText, hint);

    function sync() {
        const foreign = select.value !== 'EUR';
        originalField.wrapper.hidden = !foreign;
        originalField.label.textContent = `Amount in ${select.value}`;
        amountLabelText.textContent = foreign ? 'Charged in EUR' : EURO_LABEL;
        hint.hidden = !foreign;
    }

    select.addEventListener('change', () => {
        draft.currency = select.value;
        clearFieldError(originalField);
        clearFieldError(amountField);
        sync();
    });
    originalInput.addEventListener('input', () => {
        draft.originalAmount = originalInput.value;
        clearFieldError(originalField);
    });
    sync();

    return {
        currencyField,
        originalField,
        read() {
            return readCurrencyAmounts(
                select.value,
                amountField.control.value,
                originalInput.value,
            );
        },
    };
}
