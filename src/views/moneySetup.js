import { parseBalanceInput, setMoneyNow } from '../balance.js';
import { addIncomeSource, validateIncomeSource } from '../incomeSources.js';
import { MAX_INCOME_SOURCES } from '../limits.js';
import { amountProblem, formatPlain } from '../money.js';

function isBlankRow(row) {
    return [row.name, row.amount, row.dayOfMonth].every((value) => String(value ?? '').trim() === '');
}

/**
 * The one-time setup: validates the card amount and the payday rows, and only then writes
 * money now and the income sources. Nothing is written when anything fails.
 */
export function applyMoneySetup(data, fields, now = new Date()) {
    const cents = parseBalanceInput(fields.moneyText);
    if (cents === null) {
        return { ok: false, field: 'money', reason: 'Enter an amount such as 1250.00 or -40.00.' };
    }

    const kept = fields.rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row }) => !isBlankRow(row));
    if (data.incomeSources.length + kept.length > MAX_INCOME_SOURCES) {
        return {
            ok: false,
            field: 'limit',
            reason: `You can have at most ${MAX_INCOME_SOURCES} income sources.`,
        };
    }

    const categoryId = data.incomeCategories.some((category) => category.id === 'salary')
        ? 'salary'
        : (data.incomeCategories[0]?.id ?? '');
    const values = [];
    for (const { row, rowIndex } of kept) {
        const checked = validateIncomeSource({
            name: row.name,
            amount: row.amount,
            dayOfMonth: row.dayOfMonth,
            incomeCategoryId: categoryId,
        });
        if (!checked.ok) {
            return { ok: false, field: checked.field, rowIndex, reason: checked.reason };
        }
        values.push(checked.value);
    }

    if (data.settings.balanceStart) {
        return { ok: false, field: 'money', reason: 'Money now is already set.' };
    }

    setMoneyNow(data, cents, now);
    for (const value of values) {
        addIncomeSource(data, value, now);
    }
    return { ok: true };
}

const draft = { moneyText: '', rows: [] };
let seeded = false;
let focusTarget = null;

function resetDraft() {
    draft.moneyText = '';
    draft.rows = [];
    seeded = false;
    focusTarget = null;
}

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

function buildField(id, labelText, control) {
    const wrapper = element('div', 'field');
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;

    const error = element('p', 'error-text');
    error.id = `${id}-error`;
    error.hidden = true;

    control.id = id;
    wrapper.append(label, control, error);
    return { wrapper, control, error };
}

function setError(field, message) {
    field.error.textContent = message;
    field.error.hidden = false;
    field.control.setAttribute('aria-invalid', 'true');
    field.control.setAttribute('aria-describedby', field.error.id);
}

function clearError(field) {
    field.error.textContent = '';
    field.error.hidden = true;
    field.control.removeAttribute('aria-invalid');
    field.control.removeAttribute('aria-describedby');
}

function buildInput(inputMode, value) {
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    if (inputMode !== '') {
        input.inputMode = inputMode;
    }
    input.value = value;
    return input;
}

function buildRow(ctx, row, index) {
    const inputs = {
        name: buildInput('', row.name),
        amount: buildInput('decimal', row.amount),
        dayOfMonth: buildInput('numeric', row.dayOfMonth),
    };
    inputs.name.maxLength = 40;
    const fields = {
        name: buildField(`money-setup-name-${index}`, 'Name', inputs.name),
        amount: buildField(`money-setup-amount-${index}`, 'Expected amount (EUR)', inputs.amount),
        dayOfMonth: buildField(`money-setup-day-${index}`, 'Payday (day of month)', inputs.dayOfMonth),
    };
    for (const key of Object.keys(inputs)) {
        inputs[key].addEventListener('input', () => {
            row[key] = inputs[key].value;
            clearError(fields[key]);
        });
    }

    const remove = element('button', 'btn btn-ghost', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => {
        draft.rows.splice(index, 1);
        focusTarget = 'money-setup-money';
        ctx.render();
    });

    const wrapper = element('div', 'stack');
    wrapper.append(fields.name.wrapper, fields.amount.wrapper, fields.dayOfMonth.wrapper, remove);
    return { wrapper, fields };
}

function showResultError(result, moneyField, rowFields, generalError) {
    if (result.field === 'limit') {
        generalError.textContent = result.reason;
        generalError.hidden = false;
        generalError.focus();
        return;
    }
    const key = { category: 'name', day: 'dayOfMonth' }[result.field] ?? result.field;
    const field = rowFields[result.rowIndex]?.[key] ?? moneyField;
    const message = result.field === 'amount'
        ? amountProblem(draft.rows[result.rowIndex].amount) || result.reason
        : result.reason;
    setError(field, message);
    field.control.focus();
}

function submitMoneySetup(ctx, moneyField, rowFields, generalError) {
    clearError(moneyField);
    for (const fields of rowFields) {
        Object.values(fields).forEach(clearError);
    }
    generalError.textContent = '';
    generalError.hidden = true;

    const before = {
        start: ctx.data.settings.balanceStart,
        sources: [...ctx.data.incomeSources],
    };
    const result = applyMoneySetup(
        ctx.data,
        { moneyText: draft.moneyText, rows: draft.rows },
        new Date(),
    );
    if (!result.ok) {
        showResultError(result, moneyField, rowFields, generalError);
        return;
    }

    if (ctx.save() === false) {
        ctx.data.settings.balanceStart = before.start;
        ctx.data.incomeSources = before.sources;
        ctx.render();
        return;
    }
    resetDraft();
    ctx.toast('Money setup complete');
}

export function render(root, ctx) {
    if (!seeded) {
        seeded = true;
        const usual = ctx.data.settings.usualMonthlyIncomeCents;
        if (usual > 0) {
            draft.rows = [{ name: 'Salary', amount: formatPlain(usual), dayOfMonth: '' }];
        }
    }

    const layout = element('div', 'stack setup-page');
    layout.append(
        element('h2', 'section-title', 'Set up your money'),
        element(
            'p',
            'muted',
            'This version keeps track of the money on your card. Enter it once: after that every expense lowers it and every income raises it. Months before today stay as they are.',
        ),
    );

    const form = element('form', 'card stack setup-form');
    form.noValidate = true;

    const moneyInput = buildInput('', draft.moneyText);
    moneyInput.required = true;
    const moneyField = buildField('money-setup-money', 'How much is on the card now? (EUR)', moneyInput);
    moneyInput.addEventListener('input', () => {
        draft.moneyText = moneyInput.value;
        clearError(moneyField);
    });

    const rows = draft.rows.map((row, index) => buildRow(ctx, row, index));
    const rowFields = rows.map(({ fields }) => fields);

    const addButton = element('button', 'btn btn-ghost', 'Add another income');
    addButton.type = 'button';
    addButton.hidden = draft.rows.length >= MAX_INCOME_SOURCES;
    addButton.addEventListener('click', () => {
        draft.rows.push({ name: '', amount: '', dayOfMonth: '' });
        focusTarget = `money-setup-name-${draft.rows.length - 1}`;
        ctx.render();
    });

    const generalError = element('p', 'error-text');
    generalError.id = 'money-setup-error';
    generalError.setAttribute('role', 'alert');
    generalError.tabIndex = -1;
    generalError.hidden = true;

    const submit = element('button', 'btn btn-primary', 'Start');
    submit.type = 'submit';

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitMoneySetup(ctx, moneyField, rowFields, generalError);
    });

    form.append(
        moneyField.wrapper,
        element('h3', 'section-title', 'Regular income'),
        element(
            'p',
            'muted',
            'Add each income with the day it usually arrives. On that day Home asks you to confirm what arrived. Nothing is added without you. You can skip this and add incomes later in Settings > Income.',
        ),
        ...rows.map(({ wrapper }) => wrapper),
        addButton,
        element('p', 'muted', "If this month's income has already arrived, add it from Home with Add income."),
        generalError,
        submit,
    );
    layout.append(form);
    root.append(layout);

    (document.getElementById(focusTarget) ?? moneyInput).focus();
    focusTarget = null;
}
