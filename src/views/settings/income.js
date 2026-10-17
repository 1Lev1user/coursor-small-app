import { parseAmount, formatEuro, formatPlain } from '../../money.js';
import { monthKeyOf, fullDate } from '../../months.js';
import { freezeMonthPlan } from '../../budget.js';
import {
    element,
    buildField,
    setError,
    clearError,
    actionButton,
    renderConfirm,
    option,
    state,
    closeTransientUi,
} from './shared.js';
import {
    incomeCategoryName,
    addIncomeCategory,
    addIncomeCategoryDraft,
    renderIncomeCategoryRow,
} from './income-categories.js';

function openEditIncomeEntry(ctx, income) {
    closeTransientUi();
    state.editIncomeId = income.id;
    state.incomeEntryDraft = {
        incomeCategoryId: income.incomeCategoryId,
        amount: formatPlain(income.amountCents),
        note: typeof income.note === 'string' ? income.note : '',
        date: income.date,
    };
    ctx.render();
}

function saveIncomeEntryEdit(ctx, income, fields) {
    const draft = state.incomeEntryDraft;
    state.incomeEntrySaveError = '';

    for (const field of Object.values(fields)) {
        clearError(field);
    }

    const incomeCategoryId = fields.category.control.value;
    const amountCents = parseAmount(fields.amount.control.value);
    const date = fields.date.control.value;
    let firstInvalid = null;

    draft.incomeCategoryId = incomeCategoryId;
    draft.amount = fields.amount.control.value;
    draft.note = fields.note.control.value;
    draft.date = date;

    if (incomeCategoryId === '') {
        setError(fields.category, 'Choose an income category.');
        firstInvalid ??= fields.category.control;
    }
    if (amountCents === null) {
        setError(fields.amount, 'Enter an amount above zero, like 12.50 or 12,50.');
        firstInvalid ??= fields.amount.control;
    }
    if (monthKeyOf(date) === null) {
        setError(fields.date, 'Choose a date.');
        firstInvalid ??= fields.date.control;
    }

    if (firstInvalid !== null) {
        firstInvalid.focus();
        return;
    }

    const snapshot = {
        incomeCategoryId: income.incomeCategoryId,
        amountCents: income.amountCents,
        note: income.note,
        date: income.date,
    };
    const oldMonthKey = monthKeyOf(snapshot.date);
    const newMonthKey = monthKeyOf(date);
    const monthChanged = newMonthKey !== oldMonthKey;
    const planWasAlreadyFrozen = Object.hasOwn(ctx.data.monthPlans, newMonthKey);

    income.incomeCategoryId = incomeCategoryId;
    income.amountCents = amountCents;
    income.note = fields.note.control.value.trim();
    income.date = date;
    if (monthChanged) {
        freezeMonthPlan(ctx.data, newMonthKey);
    }

    if (ctx.save() === false) {
        income.incomeCategoryId = snapshot.incomeCategoryId;
        income.amountCents = snapshot.amountCents;
        income.note = snapshot.note;
        income.date = snapshot.date;
        if (monthChanged && !planWasAlreadyFrozen) {
            delete ctx.data.monthPlans[newMonthKey];
        }

        state.incomeEntrySaveError = 'Could not save to this device. Nothing was changed. Try again.';
        state.focusIncomeEntryError = true;
        ctx.render();
        return;
    }

    closeTransientUi();
    ctx.render();
    ctx.toast('Updated');
}

function confirmDeleteIncomeEntry(ctx, income) {
    const index = ctx.data.incomes.findIndex(({ id }) => id === income.id);
    if (index === -1) {
        closeTransientUi();
        ctx.render();
        return;
    }

    const [removed] = ctx.data.incomes.splice(index, 1);
    if (ctx.save() === false) {
        ctx.data.incomes.splice(index, 0, removed);
        state.incomeEntrySaveError = 'Could not save to this device. Nothing was deleted. Try again.';
        state.focusIncomeEntryError = true;
        ctx.render();
        return;
    }

    closeTransientUi();
    ctx.render();
    ctx.toast('Deleted');
}

function renderIncomeEntryEditor(ctx, income) {
    const draft = state.incomeEntryDraft;
    if (!ctx.data.incomeCategories.some(({ id }) => id === draft.incomeCategoryId)) {
        draft.incomeCategoryId = '';
    }

    const form = element('form', 'inline-form entry-edit-form');
    form.noValidate = true;

    const categorySelect = document.createElement('select');
    categorySelect.required = true;
    categorySelect.setAttribute('aria-required', 'true');
    categorySelect.append(
        option('', 'Choose a category'),
        ...ctx.data.incomeCategories.map(({ id, name }) => option(id, name)),
    );
    categorySelect.value = draft.incomeCategoryId;
    const categoryField = buildField(
        `more-edit-inc-category-${income.id}`,
        'Income category',
        categorySelect,
    );

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '12.50 or 12,50';
    amountInput.required = true;
    amountInput.setAttribute('aria-required', 'true');
    amountInput.value = draft.amount;
    const amountField = buildField(
        `more-edit-inc-amount-${income.id}`,
        'Amount (EUR)',
        amountInput,
    );

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.placeholder = 'Optional';
    noteInput.value = draft.note;
    const noteField = buildField(`more-edit-inc-note-${income.id}`, 'Note (optional)', noteInput);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.required = true;
    dateInput.setAttribute('aria-required', 'true');
    dateInput.value = draft.date;
    const dateField = buildField(`more-edit-inc-date-${income.id}`, 'Date', dateInput);

    const formError = element('p', 'error-text');
    formError.id = `more-edit-inc-form-error-${income.id}`;
    formError.setAttribute('role', 'alert');
    formError.tabIndex = -1;
    formError.hidden = true;

    categorySelect.addEventListener('change', () => {
        draft.incomeCategoryId = categorySelect.value;
        clearError(categoryField);
    });
    amountInput.addEventListener('input', () => {
        draft.amount = amountInput.value;
        clearError(amountField);
    });
    noteInput.addEventListener('input', () => {
        draft.note = noteInput.value;
    });
    dateInput.addEventListener('change', () => {
        draft.date = dateInput.value;
        clearError(dateField);
    });

    const saveButton = element('button', 'btn btn-primary', 'Save');
    saveButton.type = 'submit';
    const cancelButton = actionButton('btn', 'Cancel', () => {
        closeTransientUi();
        ctx.render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveIncomeEntryEdit(ctx, income, {
            category: categoryField,
            amount: amountField,
            note: noteField,
            date: dateField,
        });
    });

    form.append(
        categoryField.wrapper,
        amountField.wrapper,
        noteField.wrapper,
        dateField.wrapper,
        formError,
        saveButton,
        cancelButton,
    );

    if (state.incomeEntrySaveError !== '') {
        formError.textContent = state.incomeEntrySaveError;
        formError.hidden = false;
    }

    if (state.focusIncomeEntryError) {
        state.focusIncomeEntryError = false;
        queueMicrotask(() => formError.focus());
    }

    return form;
}

function renderIncomeEntryRow(ctx, income) {
    const wrap = element('div', 'entry-item');
    const row = element('div', 'entry-row');
    const description = element('div', 'entry-description');
    description.append(
        element('p', 'entry-name', incomeCategoryName(ctx.data, income.incomeCategoryId)),
    );
    if (typeof income.note === 'string' && income.note.trim() !== '') {
        description.append(element('p', 'muted', income.note));
    }
    const values = element('div', 'entry-values');
    const dateText = element('time', 'muted', fullDate(income.date));
    dateText.dateTime = income.date;
    values.append(dateText);
    values.append(element('p', 'entry-amount is-ok', `+${formatEuro(income.amountCents)}`));
    row.append(description, values);
    wrap.append(row);

    if (state.editIncomeId === income.id) {
        wrap.append(renderIncomeEntryEditor(ctx, income));
        return wrap;
    }

    if (state.confirmIncomeEntryId === income.id) {
        const box = renderConfirm(
            'Delete this income? This cannot be undone.',
            () => confirmDeleteIncomeEntry(ctx, income),
            () => {
                closeTransientUi();
                ctx.render();
            },
        );
        if (state.incomeEntrySaveError !== '') {
            const formError = element('p', 'error-text', state.incomeEntrySaveError);
            formError.setAttribute('role', 'alert');
            formError.tabIndex = -1;
            box.insertBefore(formError, box.children[1] ?? null);
            if (state.focusIncomeEntryError) {
                state.focusIncomeEntryError = false;
                queueMicrotask(() => formError.focus());
            }
        }
        wrap.append(box);
        return wrap;
    }

    const actions = element('div', 'entry-actions');
    actions.append(
        actionButton('btn btn-ghost', 'Edit', () => {
            openEditIncomeEntry(ctx, income);
        }),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeTransientUi();
            state.confirmIncomeEntryId = income.id;
            ctx.render();
        }),
    );
    wrap.append(actions);
    return wrap;
}

export function renderIncomeSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-income';
    section.append(element('h2', 'section-title', 'Income'));

    section.append(element('h3', 'category-name', 'Income entries'));
    const list = element('div', 'entry-list income-entry-list');
    if (ctx.data.incomes.length === 0) {
        list.append(element('p', 'muted', 'No income entries yet.'));
    } else {
        const sorted = [...ctx.data.incomes].sort((first, second) => {
            if (first.date !== second.date) {
                return first.date < second.date ? 1 : -1;
            }
            return 0;
        });
        for (const income of sorted) {
            list.append(renderIncomeEntryRow(ctx, income));
        }
    }
    section.append(list);

    section.append(element('h3', 'category-name', 'Income categories'));
    const categories = element('div', 'category-list');
    for (const category of ctx.data.incomeCategories) {
        categories.append(renderIncomeCategoryRow(ctx, category));
    }

    const addCategoryForm = element('form', 'inline-form');
    addCategoryForm.noValidate = true;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.value = addIncomeCategoryDraft.name;
    const nameField = buildField('add-income-category', 'Add income category', nameInput);
    if (addIncomeCategoryDraft.error !== '') {
        setError(nameField, addIncomeCategoryDraft.error);
    }
    nameInput.addEventListener('input', () => {
        addIncomeCategoryDraft.name = nameInput.value;
        addIncomeCategoryDraft.error = '';
        clearError(nameField);
    });
    const addCategoryButton = element('button', 'btn btn-primary', 'Add');
    addCategoryButton.type = 'submit';
    addCategoryForm.addEventListener('submit', (event) => {
        event.preventDefault();
        addIncomeCategory(ctx, nameField);
    });
    addCategoryForm.append(nameField.wrapper, addCategoryButton);
    section.append(categories, addCategoryForm);

    return section;
}
