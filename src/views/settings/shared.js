import { parseAmount, formatEuro, formatPlain } from '../../money.js';
import { SAVINGS_ID } from '../../model.js';
import {
    refreshCurrentMonthPlan,
    syncCategoryPlanFields,
    canSetPinned,
    percentFromEuroCents,
    euroCentsFromPercent,
} from '../../budget.js';

export const state = {
    renameDrafts: new Map(),
    editPlanCategoryId: null,
    categoryPlanDrafts: new Map(),
    focusId: null,

    confirmCategoryId: null,
    confirmSubKey: null,
    renameCategoryId: null,
    renameSubKey: null,

    confirmIncomeCategoryId: null,
    renameIncomeCategoryId: null,
    editIncomeId: null,
    confirmIncomeEntryId: null,
    incomeEntryDraft: null,
    incomeEntrySaveError: '',
    focusIncomeEntryError: false,

    confirmSubscriptionId: null,
    editSubscriptionId: null,
    subscriptionEditDraft: null,
    subscriptionEditError: '',
    focusSubscriptionEditError: false,

    pendingImportText: null,
    pendingImportCounts: null,
    importError: '',

    confirmDeletePreUpdate: false,
    confirmDeleteRescue: false,
};

export function closeTransientUi() {
    state.confirmCategoryId = null;
    state.confirmSubKey = null;
    state.renameCategoryId = null;
    state.renameSubKey = null;
    state.confirmIncomeCategoryId = null;
    state.renameIncomeCategoryId = null;
    state.confirmSubscriptionId = null;
    state.editSubscriptionId = null;
    state.subscriptionEditDraft = null;
    state.subscriptionEditError = '';
    state.focusSubscriptionEditError = false;
    state.editIncomeId = null;
    state.confirmIncomeEntryId = null;
    state.incomeEntryDraft = null;
    state.incomeEntrySaveError = '';
    state.focusIncomeEntryError = false;
    state.pendingImportText = null;
    state.pendingImportCounts = null;
    state.importError = '';
    state.confirmDeletePreUpdate = false;
    state.confirmDeleteRescue = false;
    state.renameDrafts.clear();
    state.editPlanCategoryId = null;
    state.categoryPlanDrafts.clear();
}

export function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className !== '') {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

export function displayPercent(percent) {
    return `${Math.round(percent * 10) / 10}%`;
}

export function subKey(categoryId, subcategoryId) {
    return `${categoryId}:${subcategoryId}`;
}

export function parsePercent(value) {
    const trimmed = String(value).trim().replace(/%$/, '').replace(',', '.');
    if (trimmed === '') {
        return null;
    }
    const percent = Number(trimmed);
    return Number.isFinite(percent) ? percent : null;
}

function limitHelperText(amountRaw, limitUnit, budgetCents) {
    if (limitUnit === 'euro') {
        const cents = parseAmount(amountRaw, { allowZero: true });
        if (cents === null || budgetCents <= 0) {
            return '';
        }
        return `${displayPercent(percentFromEuroCents(cents, budgetCents))} of budget`;
    }

    const percent = parsePercent(amountRaw);
    if (percent === null || percent < 0 || budgetCents <= 0) {
        return '';
    }
    return formatEuro(euroCentsFromPercent(percent, budgetCents));
}

export function buildLimitAmountField(id, labelText, draft, ctx, onInput) {
    const wrapper = element('div', 'field limit-amount-field');
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;

    const row = element('div', 'limit-amount-row');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.placeholder = draft.limitUnit === 'euro' ? '100' : '10';
    input.value = draft.amount;
    input.id = id;
    input.required = true;

    const unitBtn = element('button', 'unit-toggle', draft.limitUnit === 'euro' ? '€' : '%');
    unitBtn.type = 'button';
    unitBtn.setAttribute(
        'aria-label',
        draft.limitUnit === 'euro' ? 'Switch to percent' : 'Switch to euro',
    );

    const error = element('p', 'error-text');
    error.id = `${id}-error`;
    error.hidden = true;

    const helper = element(
        'p',
        'muted',
        limitHelperText(draft.amount, draft.limitUnit, ctx.data.settings.monthlyBudgetCents),
    );

    const field = { wrapper, control: input, error, helper, row, unitBtn };

    input.addEventListener('input', () => {
        draft.amount = input.value;
        draft.error = '';
        clearError(field);
        helper.textContent = limitHelperText(
            draft.amount,
            draft.limitUnit,
            ctx.data.settings.monthlyBudgetCents,
        );
        onInput?.();
    });

    unitBtn.addEventListener('click', () => {
        const budget = ctx.data.settings.monthlyBudgetCents;
        const nextUnit = draft.limitUnit === 'euro' ? 'percent' : 'euro';
        if (nextUnit === 'euro' && budget <= 0) {
            setError(field, 'Save a monthly spend budget first.');
            return;
        }

        if (draft.limitUnit === 'percent') {
            const percent = parsePercent(draft.amount);
            if (percent !== null && budget > 0) {
                draft.amount = formatPlain(euroCentsFromPercent(percent, budget));
            }
        } else {
            const cents = parseAmount(draft.amount, { allowZero: true });
            if (cents !== null && budget > 0) {
                draft.amount = String(Math.round(percentFromEuroCents(cents, budget) * 10) / 10);
            }
        }

        draft.limitUnit = nextUnit;
        ctx.render();
    });

    row.append(input, unitBtn);
    wrapper.append(label, row, error, helper);
    return field;
}

export function persist(ctx) {
    if (ctx.save() === false) {
        return false;
    }
    ctx.render();
    return true;
}

export function buildField(id, labelText, control) {
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

export function setError(field, message) {
    field.error.textContent = message;
    field.error.hidden = false;
    field.control.setAttribute('aria-invalid', 'true');
    field.control.setAttribute('aria-describedby', field.error.id);
}

export function clearError(field) {
    field.error.textContent = '';
    field.error.hidden = true;
    field.control.removeAttribute('aria-invalid');
    field.control.removeAttribute('aria-describedby');
}

export function actionButton(className, label, onClick) {
    const button = element('button', className, label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
}

export function renderConfirm(message, onConfirm, onCancel) {
    const box = element('div', 'confirm-box');
    box.setAttribute('role', 'group');
    box.append(
        element('p', 'confirm-copy', message),
        actionButton('btn', 'Cancel', onCancel),
        actionButton('btn btn-danger', 'Delete', onConfirm),
    );
    return box;
}

export function renderRenameForm(id, currentValue, errorText, onSubmit, onCancel) {
    const form = element('form', 'inline-form');
    form.noValidate = true;

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.value = currentValue;
    input.required = true;
    const field = buildField(id, 'Name', input);
    if (errorText !== '') {
        setError(field, errorText);
    }

    const saveButton = element('button', 'btn btn-primary', 'Save');
    saveButton.type = 'submit';
    const cancelButton = actionButton('btn', 'Cancel', onCancel);

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        onSubmit(input.value);
    });

    form.append(field.wrapper, saveButton, cancelButton);
    return form;
}

export function option(value, text) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
    return node;
}

export function centsInputValue(cents, draftValue) {
    if (draftValue !== null) {
        return draftValue;
    }
    if (typeof cents !== 'number' || !Number.isFinite(cents)) {
        return '';
    }
    return formatPlain(cents);
}

export function shareLabel(category, plan, budgetCents) {
    const entry = plan.entries.find(({ id }) => id === category.id);
    if (category.limitMode === 'none' || entry?.noLimit === true) {
        return 'No limit · tracks spend as % of budget';
    }
    if (category.pinned !== true) {
        if (budgetCents > 0 && entry !== undefined) {
            return `Flexible · ~${formatEuro(entry.limitCents)}`;
        }
        return 'Flexible';
    }

    const percent = category.percent;
    const limitCents = entry?.limitCents ?? category.limitCents ?? 0;
    if (category.limitMode === 'euro') {
        return `Fixed · ${formatEuro(limitCents)} · ${displayPercent(percent)}`;
    }
    return `Fixed · ${displayPercent(percent)} · ${formatEuro(limitCents)}`;
}

export function openCategoryPlanEditor(ctx, category) {
    closeTransientUi();
    state.editPlanCategoryId = category.id;
    const isSavings = category.id === SAVINGS_ID;
    const limitUnit = isSavings
        ? (category.limitMode === 'percent' ? 'percent' : 'euro')
        : (category.limitMode === 'euro' ? 'euro' : 'percent');
    let kind = 'flexible';
    if (isSavings || category.pinned) {
        kind = 'pinned';
    } else if (category.limitMode === 'none') {
        kind = 'none';
    }
    state.categoryPlanDrafts.set(category.id, {
        kind,
        limitUnit,
        amount: (isSavings || category.pinned)
            ? (limitUnit === 'euro'
                ? formatPlain(category.limitCents)
                : String(category.percent))
            : '',
        error: '',
    });
    ctx.render();
}

export function saveCategoryPlan(ctx, category, draft, amountField) {
    const budget = ctx.data.settings.monthlyBudgetCents;
    clearError(amountField);
    draft.error = '';

    if (category.id === SAVINGS_ID) {
        draft.kind = 'pinned';
        if (draft.limitUnit !== 'euro' && draft.limitUnit !== 'percent') {
            draft.limitUnit = 'euro';
        }
    }

    if (draft.kind === 'none') {
        category.pinned = false;
        category.limitMode = 'none';
        category.percent = 0;
        category.limitCents = 0;
        syncCategoryPlanFields(ctx.data.categories, budget);
        refreshCurrentMonthPlan(ctx.data);
        closeTransientUi();
        if (persist(ctx)) {
            ctx.toast('Plan updated');
        }
        return;
    }

    if (draft.kind === 'flexible') {
        category.pinned = false;
        category.limitMode = 'percent';
        category.limitCents = 0;
        syncCategoryPlanFields(ctx.data.categories, budget);
        refreshCurrentMonthPlan(ctx.data);
        closeTransientUi();
        if (persist(ctx)) {
            ctx.toast('Plan updated');
        }
        return;
    }

    if (draft.limitUnit === 'euro') {
        if (budget <= 0) {
            draft.error = 'Save a monthly spend budget first.';
            setError(amountField, draft.error);
            amountField.control.focus();
            return;
        }

        const cents = parseAmount(draft.amount, {
            allowZero: category.id === SAVINGS_ID,
        });
        if (cents === null) {
            draft.error = category.id === SAVINGS_ID
                ? 'Enter a valid amount of zero or more.'
                : 'Enter a valid amount greater than zero.';
            setError(amountField, draft.error);
            amountField.control.focus();
            return;
        }

        if (category.id === SAVINGS_ID && cents > budget) {
            draft.error = 'Savings cannot exceed the monthly spend budget.';
            setError(amountField, draft.error);
            amountField.control.focus();
            return;
        }

        category.pinned = true;
        category.limitMode = 'euro';
        category.limitCents = cents;
        category.percent = percentFromEuroCents(cents, budget);
    } else {
        const percent = parsePercent(draft.amount);
        if (percent === null) {
            draft.error = 'Enter a percentage.';
            setError(amountField, draft.error);
            amountField.control.focus();
            return;
        }

        if (category.id === SAVINGS_ID && (percent < 0 || percent > 100)) {
            draft.error = 'Savings must be from 0% to 100% of the monthly spend budget.';
            setError(amountField, draft.error);
            amountField.control.focus();
            return;
        }

        if (percent < 0) {
            draft.error = 'Enter a percentage of zero or more.';
            setError(amountField, draft.error);
            amountField.control.focus();
            return;
        }

        const check = canSetPinned(ctx.data.categories, category.id, percent);
        if (check.ok !== true) {
            draft.error = check.reason;
            setError(amountField, check.reason);
            amountField.control.focus();
            return;
        }

        category.pinned = true;
        category.limitMode = 'percent';
        category.percent = percent;
        category.limitCents = euroCentsFromPercent(percent, budget);
    }

    syncCategoryPlanFields(ctx.data.categories, budget);
    refreshCurrentMonthPlan(ctx.data);
    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Plan updated');
    }
}

export function renderCategoryPlanKindChoice(draft, amountField, ctx, { allowFlexible = true } = {}) {
    const fieldset = element('fieldset', 'choice-set');
    const legend = document.createElement('legend');
    legend.textContent = 'Share';
    fieldset.append(legend);

    const row = element('div', 'choice-row');
    const options = [
        ...(allowFlexible ? [
            { value: 'flexible', label: 'Flexible' },
            { value: 'none', label: 'No limit' },
        ] : []),
        { value: 'pinned', label: 'Fixed' },
    ];

    for (const option of options) {
        const choice = element('label', 'choice');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `edit-plan-kind-${state.editPlanCategoryId}`;
        radio.value = option.value;
        radio.checked = draft.kind === option.value;
        radio.addEventListener('change', () => {
            draft.kind = option.value;
            amountField.wrapper.hidden = draft.kind !== 'pinned';
            if (draft.kind !== 'pinned') {
                clearError(amountField);
            }
            ctx.render();
        });
        choice.append(radio, document.createTextNode(option.label));
        row.append(choice);
    }

    fieldset.append(row);
    if (draft.kind === 'none') {
        fieldset.append(element(
            'p',
            'muted',
            'No planned share. Spending still counts in Month and Chart, and shows as % of your budget.',
        ));
    }
    return fieldset;
}

export function renderCategoryPlanEditor(ctx, category) {
    const isSavings = category.id === SAVINGS_ID;
    const draft = state.categoryPlanDrafts.get(category.id) ?? {
        kind: 'pinned',
        limitUnit: 'euro',
        amount: '',
        error: '',
    };
    if (isSavings) {
        draft.kind = 'pinned';
        if (draft.limitUnit !== 'percent') {
            draft.limitUnit = 'euro';
        }
    }

    const form = element('form', 'inline-form category-plan-form');
    form.noValidate = true;

    const amountField = buildLimitAmountField(
        `edit-plan-amount-${category.id}`,
        isSavings ? 'Savings amount' : 'Fixed amount',
        draft,
        ctx,
    );
    amountField.wrapper.hidden = draft.kind !== 'pinned';
    if (draft.error !== '') {
        setError(amountField, draft.error);
    }

    const saveButton = element('button', 'btn btn-primary', 'Save');
    saveButton.type = 'submit';
    const cancelButton = actionButton('btn', 'Cancel', () => {
        closeTransientUi();
        ctx.render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveCategoryPlan(ctx, category, draft, amountField);
    });

    form.append(
        renderCategoryPlanKindChoice(draft, amountField, ctx, { allowFlexible: !isSavings }),
        amountField.wrapper,
        saveButton,
        cancelButton,
    );
    return form;
}
