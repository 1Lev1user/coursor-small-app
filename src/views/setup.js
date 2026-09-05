import { parseAmount, formatPlain } from '../money.js';
import { canSetPinned, refreshCurrentMonthPlan } from '../budget.js';

const draft = {
    budget: '',
    savingsPercent: '',
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

function savingsCategory(data) {
    return data.categories.find(({ id }) => id === 'savings');
}

function submitSetup(ctx, budgetField, savingsField, incomeField) {
    clearError(budgetField);
    clearError(savingsField);
    clearError(incomeField);

    draft.budget = budgetField.control.value;
    draft.savingsPercent = savingsField.control.value;
    draft.income = incomeField.control.value;

    const budgetCents = parseAmount(draft.budget);
    if (budgetCents === null) {
        setError(budgetField, 'Enter a valid amount greater than zero.');
        budgetField.control.focus();
        return;
    }

    const savingsPercent = parsePercent(draft.savingsPercent);
    if (savingsPercent === null) {
        setError(savingsField, 'Enter a savings percentage from 0 to 100.');
        savingsField.control.focus();
        return;
    }

    const pinCheck = canSetPinned(ctx.data.categories, 'savings', savingsPercent);
    if (pinCheck.ok !== true) {
        setError(savingsField, pinCheck.reason);
        savingsField.control.focus();
        return;
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
    savings.percent = savingsPercent;
    ctx.data.settings.setupComplete = true;
    refreshCurrentMonthPlan(ctx.data);

    draft.budget = '';
    draft.savingsPercent = '';
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
    if (draft.savingsPercent === '') {
        const savings = savingsCategory(ctx.data);
        if (savings !== undefined && savings.percent > 0) {
            draft.savingsPercent = String(savings.percent);
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
    budgetInput.addEventListener('input', () => {
        draft.budget = budgetInput.value;
        clearError(budgetField);
    });

    const savingsInput = document.createElement('input');
    savingsInput.type = 'text';
    savingsInput.inputMode = 'decimal';
    savingsInput.autocomplete = 'off';
    savingsInput.placeholder = '10';
    savingsInput.required = true;
    savingsInput.value = draft.savingsPercent;
    const savingsField = buildField('setup-savings', 'Savings %', savingsInput);
    savingsInput.addEventListener('input', () => {
        draft.savingsPercent = savingsInput.value;
        clearError(savingsField);
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
