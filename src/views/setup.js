import { parseAmount, formatPlain, formatEuro } from '../money.js';
import {
    refreshCurrentMonthPlan,
    percentFromEuroCents,
    euroCentsFromPercent,
} from '../budget.js';

const draft = {
    budget: '',
    savingsAmount: '',
    savingsUnit: 'euro',
    income: '',
};

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

function parsePercent(value) {
    const trimmed = String(value).trim().replace(/%$/, '').replace(',', '.');
    if (trimmed === '') {
        return null;
    }
    const percent = Number(trimmed);
    return Number.isFinite(percent) ? percent : null;
}

function displayPercent(percent) {
    return `${Math.round(percent * 10) / 10}%`;
}

function draftBudgetCents() {
    return parseAmount(draft.budget) ?? 0;
}

function savingsHelperText(amountRaw, unit, budgetCents) {
    if (unit === 'euro') {
        const cents = parseAmount(amountRaw);
        if (cents === null || budgetCents <= 0) {
            return '';
        }
        return `${displayPercent(percentFromEuroCents(cents, budgetCents))} of budget`;
    }

    const percent = parsePercent(amountRaw);
    if (percent === null || budgetCents <= 0) {
        return '';
    }
    return formatEuro(euroCentsFromPercent(percent, budgetCents));
}

function buildSavingsField(ctx) {
    const wrapper = element('div', 'field limit-amount-field');
    const label = document.createElement('label');
    label.htmlFor = 'setup-savings';
    label.textContent = 'Savings';

    const row = element('div', 'limit-amount-row');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.placeholder = draft.savingsUnit === 'euro' ? '100' : '10';
    input.value = draft.savingsAmount;
    input.id = 'setup-savings';
    input.required = true;

    const unitBtn = element('button', 'unit-toggle', draft.savingsUnit === 'euro' ? '\u20AC' : '%');
    unitBtn.type = 'button';
    unitBtn.setAttribute(
        'aria-label',
        draft.savingsUnit === 'euro' ? 'Switch to percent' : 'Switch to euro',
    );

    const error = element('p', 'error-text');
    error.id = 'setup-savings-error';
    error.hidden = true;

    const helper = element(
        'p',
        'muted',
        savingsHelperText(draft.savingsAmount, draft.savingsUnit, draftBudgetCents()),
    );

    const field = { wrapper, control: input, error, helper, row, unitBtn };

    input.addEventListener('input', () => {
        draft.savingsAmount = input.value;
        clearError(field);
        helper.textContent = savingsHelperText(
            draft.savingsAmount,
            draft.savingsUnit,
            draftBudgetCents(),
        );
    });

    unitBtn.addEventListener('click', () => {
        const budgetCents = draftBudgetCents();
        const nextUnit = draft.savingsUnit === 'euro' ? 'percent' : 'euro';
        if (nextUnit === 'euro' && budgetCents <= 0) {
            setError(field, 'Enter a monthly spend budget first.');
            return;
        }

        if (draft.savingsUnit === 'percent') {
            const percent = parsePercent(draft.savingsAmount);
            if (percent !== null && budgetCents > 0) {
                draft.savingsAmount = formatPlain(euroCentsFromPercent(percent, budgetCents));
            }
        } else {
            const cents = parseAmount(draft.savingsAmount);
            if (cents !== null && budgetCents > 0) {
                draft.savingsAmount = String(Math.round(percentFromEuroCents(cents, budgetCents) * 10) / 10);
            }
        }

        draft.savingsUnit = nextUnit;
        ctx.render();
    });

    row.append(input, unitBtn);
    wrapper.append(label, row, error, helper);
    return field;
}

function savingsCategory(data) {
    return data.categories.find(({ id }) => id === 'savings');
}

function submitSetup(ctx, budgetField, savingsField, incomeField) {
    clearError(budgetField);
    clearError(savingsField);
    clearError(incomeField);

    draft.budget = budgetField.control.value;
    draft.savingsAmount = savingsField.control.value;
    draft.income = incomeField.control.value;

    const budgetCents = parseAmount(draft.budget);
    if (budgetCents === null) {
        setError(budgetField, 'Enter a valid amount greater than zero.');
        budgetField.control.focus();
        return;
    }

    const savingsRaw = draft.savingsAmount;
    const unit = draft.savingsUnit;
    let limitMode;
    let savingsPercent;
    let savingsLimitCents;

    if (unit === 'euro') {
        if (budgetCents <= 0) {
            setError(budgetField, 'Enter a valid amount greater than zero.');
            budgetField.control.focus();
            return;
        }

        const cents = parseAmount(savingsRaw);
        if (cents === null) {
            setError(savingsField, 'Enter a valid amount greater than zero.');
            savingsField.control.focus();
            return;
        }
        if (cents > budgetCents) {
            setError(savingsField, 'Savings cannot exceed the monthly spend budget.');
            savingsField.control.focus();
            return;
        }

        limitMode = 'euro';
        savingsLimitCents = cents;
        savingsPercent = percentFromEuroCents(cents, budgetCents);
    } else {
        savingsPercent = parsePercent(savingsRaw);
        if (savingsPercent === null || savingsPercent < 0 || savingsPercent > 100) {
            setError(savingsField, 'Enter a savings percentage from 0 to 100.');
            savingsField.control.focus();
            return;
        }

        limitMode = 'percent';
        savingsLimitCents = euroCentsFromPercent(savingsPercent, budgetCents);
    }

    const incomeCents = parseAmount(draft.income);
    if (incomeCents === null) {
        setError(incomeField, 'Enter a valid amount greater than zero.');
        incomeField.control.focus();
        return;
    }

    const savings = savingsCategory(ctx.data);
    if (savings === undefined) {
        setError(savingsField, 'Savings category is missing.');
        savingsField.control.focus();
        return;
    }

    ctx.data.settings.monthlyBudgetCents = budgetCents;
    ctx.data.settings.usualMonthlyIncomeCents = incomeCents;
    savings.pinned = true;
    savings.limitMode = limitMode;
    savings.percent = savingsPercent;
    savings.limitCents = savingsLimitCents;
    ctx.data.settings.setupComplete = true;
    refreshCurrentMonthPlan(ctx.data);

    draft.budget = '';
    draft.savingsAmount = '';
    draft.savingsUnit = 'euro';
    draft.income = '';

    if (ctx.save() !== false) {
        ctx.goTo('add');
        ctx.toast('Setup complete');
    }
}

export function render(root, ctx) {
    const settings = ctx.data.settings;
    if (draft.budget === '' && settings.monthlyBudgetCents > 0) {
        draft.budget = formatPlain(settings.monthlyBudgetCents);
    }
    if (draft.income === '' && settings.usualMonthlyIncomeCents > 0) {
        draft.income = formatPlain(settings.usualMonthlyIncomeCents);
    }
    if (draft.savingsAmount === '') {
        const savings = savingsCategory(ctx.data);
        if (savings !== undefined) {
            if (savings.limitMode === 'euro' && savings.limitCents > 0) {
                draft.savingsAmount = formatPlain(savings.limitCents);
                draft.savingsUnit = 'euro';
            } else if (savings.percent > 0) {
                draft.savingsAmount = String(savings.percent);
                draft.savingsUnit = 'percent';
            }
        }
    }

    const layout = element('div', 'stack setup-page');
    layout.append(
        element('h2', 'section-title', 'Welcome'),
        element(
            'p',
            'muted',
            'Set your monthly plan once. You can change these numbers later in More.',
        ),
    );

    const form = element('form', 'card stack setup-form');
    form.noValidate = true;

    const budgetInput = document.createElement('input');
    budgetInput.type = 'text';
    budgetInput.inputMode = 'decimal';
    budgetInput.autocomplete = 'off';
    budgetInput.placeholder = '1000';
    budgetInput.required = true;
    budgetInput.value = draft.budget;
    const budgetField = buildField('setup-budget', 'Monthly spend budget (EUR)', budgetInput);

    const savingsField = buildSavingsField(ctx);

    budgetInput.addEventListener('input', () => {
        draft.budget = budgetInput.value;
        clearError(budgetField);
        savingsField.helper.textContent = savingsHelperText(
            draft.savingsAmount,
            draft.savingsUnit,
            draftBudgetCents(),
        );
    });

    const incomeInput = document.createElement('input');
    incomeInput.type = 'text';
    incomeInput.inputMode = 'decimal';
    incomeInput.autocomplete = 'off';
    incomeInput.placeholder = '2000';
    incomeInput.required = true;
    incomeInput.value = draft.income;
    const incomeField = buildField('setup-income', 'Usual monthly income (EUR)', incomeInput);
    incomeInput.addEventListener('input', () => {
        draft.income = incomeInput.value;
        clearError(incomeField);
    });

    const submit = element('button', 'btn btn-primary', 'Continue');
    submit.type = 'submit';

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitSetup(ctx, budgetField, savingsField, incomeField);
    });

    form.append(
        budgetField.wrapper,
        savingsField.wrapper,
        element('p', 'muted', 'Example: 10% of a €1000 budget pins €100 to Savings.'),
        incomeField.wrapper,
        submit,
    );
    layout.append(form);
    root.append(layout);
    budgetInput.focus();
}
