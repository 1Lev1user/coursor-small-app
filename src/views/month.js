import { monthTotals, freezeMonthPlan } from '../budget.js';
import { formatEuro, formatPlain, parseAmount } from '../money.js';
import { addMonths, isInMonth, monthKeyOf, monthLabel } from '../months.js';
import { UNCATEGORISED_ID } from '../model.js';
import { renderMonthNav } from './monthNav.js';

const SHORT_MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

/** @type {{ mode: null | 'edit' | 'confirm-delete', type: null | 'expense' | 'income', id: null | string, draft: object | null, saveError: string, focusError: boolean }} */
const entryUi = {
    mode: null,
    type: null,
    id: null,
    draft: null,
    saveError: '',
    focusError: false,
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

function shortDate(date) {
    const [, month, day] = date.split('-').map(Number);
    return `${day} ${SHORT_MONTH_NAMES[month - 1]}`;
}

function displayPercent(percent) {
    return `${Math.round(percent * 10) / 10}%`;
}

function closeEntryUi() {
    entryUi.mode = null;
    entryUi.type = null;
    entryUi.id = null;
    entryUi.draft = null;
    entryUi.saveError = '';
    entryUi.focusError = false;
}

function isActiveEntry(type, id) {
    return entryUi.type === type && entryUi.id === id;
}

function selectableCategories(data) {
    return data.categories.filter(
        (category) => category.system !== true && category.id !== UNCATEGORISED_ID,
    );
}

function option(value, text) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
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

function actionButton(className, label, onClick) {
    const button = element('button', className, label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
}

function headline(caption, amountCents, negativeMessage) {
    const wrapper = element('div', 'month-headline');
    const label = element('p', 'muted', caption);
    const amount = element('p', 'big-number', formatEuro(amountCents));
    if (amountCents < 0) {
        amount.classList.add('is-danger');
        wrapper.append(label, amount, element('p', 'danger-note', negativeMessage));
    } else {
        wrapper.append(label, amount);
    }
    return wrapper;
}

function renderSummary(root, totals) {
    const card = element('section', 'card stack');
    const headlines = element('div', 'month-headlines');
    headlines.append(
        headline('Budget left', totals.budgetLeftCents, 'over budget'),
        headline('Cash left', totals.cashLeftCents, 'more spent than came in'),
    );
    card.append(
        headlines,
        element(
            'p',
            'muted',
            `Spent ${formatEuro(totals.spentCents)} of ${formatEuro(totals.budgetCents)}`
                + ` \u00b7 Income ${formatEuro(totals.incomeCents)}`,
        ),
    );
    root.append(card);
}

function comparisonText(currentTotals, previousTotals, previousMonthKey) {
    const previousLabel = monthLabel(previousMonthKey);
    if (previousTotals.spentCents === 0) {
        return `No spending recorded in ${previousLabel}`;
    }

    const difference = currentTotals.spentCents - previousTotals.spentCents;
    if (difference === 0) {
        return `Same as ${previousLabel}`;
    }

    const direction = difference > 0 ? 'more' : 'less';
    return `${formatEuro(Math.abs(difference))} ${direction} than ${previousLabel}`;
}

function renderCategories(root, categories) {
    const card = element('section', 'card stack');
    card.append(element('h2', 'section-title', 'Categories'));

    const list = element('div', 'category-list');
    for (const category of categories) {
        const item = element('div', 'category-item');
        const heading = element('div', 'row category-heading');
        heading.append(
            element('h3', 'category-name', category.name),
            element(
                'p',
                'category-amount',
                `${formatEuro(category.spentCents)} of `
                    + (category.limitCents === 0 ? 'no budget' : formatEuro(category.limitCents)),
            ),
        );

        const track = element('div', 'progress-track');
        const fill = element('div', 'progress-fill');
        const width = category.limitCents === 0
            ? 0
            : Math.min(100, Math.max(0, category.spentCents / category.limitCents * 100));
        fill.style.width = `${width}%`;
        fill.setAttribute('aria-hidden', 'true');
        if (category.over) {
            fill.classList.add('is-over');
        }
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', category.name);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(Math.round(width)));
        if (category.over) {
            track.setAttribute('aria-valuetext', `Over by ${formatEuro(category.overByCents)}`);
        }
        track.append(fill);

        const details = element('div', 'row category-details');
        details.append(element('span', 'muted', displayPercent(category.percent)));
        if (category.over) {
            details.append(
                element(
                    'span',
                    'pill pill-danger',
                    `over by ${formatEuro(category.overByCents)}`,
                ),
            );
        }

        item.append(heading, track, details);
        list.append(item);
    }

    card.append(list);
    root.append(card);
}

function expenseLabel(data, expense) {
    const category = data.categories.find(({ id }) => id === expense.categoryId);
    const categoryName = category?.name ?? expense.categoryId;
    if (expense.subcategoryId === '') {
        return categoryName;
    }

    const subcategory = category?.subcategories?.find(
        ({ id }) => id === expense.subcategoryId,
    );
    return `${categoryName} \u00b7 ${subcategory?.name ?? 'Unspecified'}`;
}

function incomeLabel(data, income) {
    return data.incomeCategories.find(({ id }) => id === income.incomeCategoryId)?.name
        ?? income.incomeCategoryId;
}

function monthEntries(data, monthKey) {
    const expenses = data.expenses
        .map((entry, insertionIndex) => ({ entry, insertionIndex, type: 'expense' }))
        .filter(({ entry }) => isInMonth(entry.date, monthKey));
    const incomes = data.incomes
        .map((entry, insertionIndex) => ({ entry, insertionIndex, type: 'income' }))
        .filter(({ entry }) => isInMonth(entry.date, monthKey));

    return [...expenses, ...incomes].sort((first, second) => {
        const byDate = second.entry.date.localeCompare(first.entry.date);
        if (byDate !== 0) {
            return byDate;
        }
        return second.insertionIndex - first.insertionIndex;
    });
}

function openEditExpense(ctx, expense) {
    closeEntryUi();
    entryUi.mode = 'edit';
    entryUi.type = 'expense';
    entryUi.id = expense.id;
    entryUi.draft = {
        categoryId: expense.categoryId,
        subcategoryId: expense.subcategoryId ?? '',
        amount: formatPlain(expense.amountCents),
        note: typeof expense.note === 'string' ? expense.note : '',
        date: expense.date,
    };
    ctx.render();
}

function openEditIncome(ctx, income) {
    closeEntryUi();
    entryUi.mode = 'edit';
    entryUi.type = 'income';
    entryUi.id = income.id;
    entryUi.draft = {
        incomeCategoryId: income.incomeCategoryId,
        amount: formatPlain(income.amountCents),
        note: typeof income.note === 'string' ? income.note : '',
        date: income.date,
    };
    ctx.render();
}

function openConfirmDelete(ctx, type, id) {
    closeEntryUi();
    entryUi.mode = 'confirm-delete';
    entryUi.type = type;
    entryUi.id = id;
    ctx.render();
}

function saveExpenseEdit(ctx, expense, fields) {
    const draft = entryUi.draft;
    entryUi.saveError = '';

    for (const field of Object.values(fields)) {
        clearError(field);
    }

    const categories = selectableCategories(ctx.data);
    const categoryId = fields.category.control.value;
    const category = categories.find(({ id }) => id === categoryId);
    const subcategories = category?.subcategories ?? [];
    const subcategoryId = subcategories.length > 0 ? fields.subcategory.control.value : '';
    const amountCents = parseAmount(fields.amount.control.value);
    const date = fields.date.control.value;
    let firstInvalid = null;

    draft.categoryId = categoryId;
    draft.subcategoryId = subcategoryId;
    draft.amount = fields.amount.control.value;
    draft.note = fields.note.control.value;
    draft.date = date;

    if (categoryId === '') {
        setError(fields.category, 'Choose a category.');
        firstInvalid ??= fields.category.control;
    }
    if (subcategories.length > 0 && subcategoryId === '') {
        setError(fields.subcategory, 'Choose a subcategory.');
        firstInvalid ??= fields.subcategory.control;
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
        categoryId: expense.categoryId,
        subcategoryId: expense.subcategoryId,
        amountCents: expense.amountCents,
        note: expense.note,
        date: expense.date,
    };
    const oldMonthKey = monthKeyOf(snapshot.date);
    const newMonthKey = monthKeyOf(date);
    const monthChanged = newMonthKey !== oldMonthKey;
    const planWasAlreadyFrozen = Object.hasOwn(ctx.data.monthPlans, newMonthKey);

    expense.categoryId = categoryId;
    expense.subcategoryId = subcategoryId;
    expense.amountCents = amountCents;
    expense.note = fields.note.control.value.trim();
    expense.date = date;
    if (monthChanged) {
        freezeMonthPlan(ctx.data, newMonthKey);
    }

    if (ctx.save() === false) {
        expense.categoryId = snapshot.categoryId;
        expense.subcategoryId = snapshot.subcategoryId;
        expense.amountCents = snapshot.amountCents;
        expense.note = snapshot.note;
        expense.date = snapshot.date;
        if (monthChanged && !planWasAlreadyFrozen) {
            delete ctx.data.monthPlans[newMonthKey];
        }

        entryUi.saveError = 'Could not save to this device. Nothing was changed \u2014 try again.';
        entryUi.focusError = true;
        ctx.render();
        return;
    }

    closeEntryUi();
    ctx.render();
    ctx.toast('Updated');
}

function saveIncomeEdit(ctx, income, fields) {
    const draft = entryUi.draft;
    entryUi.saveError = '';

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

        entryUi.saveError = 'Could not save to this device. Nothing was changed \u2014 try again.';
        entryUi.focusError = true;
        ctx.render();
        return;
    }

    closeEntryUi();
    ctx.render();
    ctx.toast('Updated');
}

function confirmDeleteEntry(ctx, type, entry) {
    const list = type === 'expense' ? ctx.data.expenses : ctx.data.incomes;
    const index = list.findIndex(({ id }) => id === entry.id);
    if (index === -1) {
        closeEntryUi();
        ctx.render();
        return;
    }

    const [removed] = list.splice(index, 1);
    if (ctx.save() === false) {
        list.splice(index, 0, removed);
        entryUi.saveError = 'Could not save to this device. Nothing was deleted \u2014 try again.';
        entryUi.focusError = true;
        ctx.render();
        return;
    }

    closeEntryUi();
    ctx.render();
    ctx.toast('Deleted');
}

function renderExpenseEditor(ctx, expense) {
    const draft = entryUi.draft;
    const categories = selectableCategories(ctx.data);
    if (!categories.some(({ id }) => id === draft.categoryId)) {
        draft.categoryId = '';
        draft.subcategoryId = '';
    }

    const form = element('form', 'inline-form entry-edit-form');
    form.noValidate = true;

    const categorySelect = document.createElement('select');
    categorySelect.required = true;
    categorySelect.setAttribute('aria-required', 'true');
    categorySelect.append(
        option('', 'Choose a category'),
        ...categories.map(({ id, name }) => option(id, name)),
    );
    categorySelect.value = draft.categoryId;
    const categoryField = buildField(`edit-exp-category-${expense.id}`, 'Category', categorySelect);

    const subcategorySelect = document.createElement('select');
    const subcategoryField = buildField(
        `edit-exp-subcategory-${expense.id}`,
        'Subcategory',
        subcategorySelect,
    );

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '12.50 or 12,50';
    amountInput.required = true;
    amountInput.setAttribute('aria-required', 'true');
    amountInput.value = draft.amount;
    const amountField = buildField(`edit-exp-amount-${expense.id}`, 'Amount (\u20ac)', amountInput);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.placeholder = 'Optional';
    noteInput.value = draft.note;
    const noteField = buildField(`edit-exp-note-${expense.id}`, 'Note \u2014 what was it?', noteInput);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.required = true;
    dateInput.setAttribute('aria-required', 'true');
    dateInput.value = draft.date;
    const dateField = buildField(`edit-exp-date-${expense.id}`, 'Date', dateInput);

    const formError = element('p', 'error-text');
    formError.id = `edit-exp-form-error-${expense.id}`;
    formError.setAttribute('role', 'alert');
    formError.tabIndex = -1;
    formError.hidden = true;

    function subcategoriesOf(categoryId) {
        return categories.find(({ id }) => id === categoryId)?.subcategories ?? [];
    }

    function rebuildSubcategories() {
        const subcategories = subcategoriesOf(categorySelect.value);
        const hasSubcategories = subcategories.length > 0;

        subcategorySelect.replaceChildren(
            option('', 'Choose a subcategory'),
            ...subcategories.map(({ id, name }) => option(id, name)),
        );
        subcategorySelect.required = hasSubcategories;
        subcategorySelect.setAttribute('aria-required', String(hasSubcategories));
        subcategorySelect.value = subcategories.some(({ id }) => id === draft.subcategoryId)
            ? draft.subcategoryId
            : '';
        draft.subcategoryId = subcategorySelect.value;
        subcategoryField.wrapper.hidden = !hasSubcategories;
        clearError(subcategoryField);
    }

    categorySelect.addEventListener('change', () => {
        draft.categoryId = categorySelect.value;
        draft.subcategoryId = '';
        clearError(categoryField);
        rebuildSubcategories();
    });
    subcategorySelect.addEventListener('change', () => {
        draft.subcategoryId = subcategorySelect.value;
        clearError(subcategoryField);
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
        closeEntryUi();
        ctx.render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveExpenseEdit(ctx, expense, {
            category: categoryField,
            subcategory: subcategoryField,
            amount: amountField,
            note: noteField,
            date: dateField,
        });
    });

    form.append(
        categoryField.wrapper,
        subcategoryField.wrapper,
        amountField.wrapper,
        noteField.wrapper,
        dateField.wrapper,
        formError,
        saveButton,
        cancelButton,
    );
    rebuildSubcategories();

    if (entryUi.saveError !== '') {
        formError.textContent = entryUi.saveError;
        formError.hidden = false;
    }

    if (entryUi.focusError) {
        entryUi.focusError = false;
        queueMicrotask(() => formError.focus());
    }

    return form;
}

function renderIncomeEditor(ctx, income) {
    const draft = entryUi.draft;
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
        `edit-inc-category-${income.id}`,
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
    const amountField = buildField(`edit-inc-amount-${income.id}`, 'Amount (\u20ac)', amountInput);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.placeholder = 'Optional';
    noteInput.value = draft.note;
    const noteField = buildField(`edit-inc-note-${income.id}`, 'Note (optional)', noteInput);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.required = true;
    dateInput.setAttribute('aria-required', 'true');
    dateInput.value = draft.date;
    const dateField = buildField(`edit-inc-date-${income.id}`, 'Date', dateInput);

    const formError = element('p', 'error-text');
    formError.id = `edit-inc-form-error-${income.id}`;
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
        closeEntryUi();
        ctx.render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveIncomeEdit(ctx, income, {
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

    if (entryUi.saveError !== '') {
        formError.textContent = entryUi.saveError;
        formError.hidden = false;
    }

    if (entryUi.focusError) {
        entryUi.focusError = false;
        queueMicrotask(() => formError.focus());
    }

    return form;
}

function renderDeleteConfirm(ctx, type, entry) {
    const box = element('div', 'confirm-box');
    box.setAttribute('role', 'group');

    const message = type === 'expense'
        ? 'Delete this expense? This cannot be undone.'
        : 'Delete this income? This cannot be undone.';

    const formError = element('p', 'error-text');
    formError.setAttribute('role', 'alert');
    formError.tabIndex = -1;
    formError.hidden = true;
    if (entryUi.saveError !== '') {
        formError.textContent = entryUi.saveError;
        formError.hidden = false;
    }

    box.append(
        element('p', 'confirm-copy', message),
        formError,
        actionButton('btn', 'Cancel', () => {
            closeEntryUi();
            ctx.render();
        }),
        actionButton('btn btn-danger', 'Delete', () => {
            confirmDeleteEntry(ctx, type, entry);
        }),
    );

    if (entryUi.focusError) {
        entryUi.focusError = false;
        queueMicrotask(() => formError.focus());
    }

    return box;
}

function renderEntry(ctx, item) {
    const { entry, type } = item;
    const wrap = element('div', 'entry-item');
    const row = element('div', 'entry-row');
    const description = element('div', 'entry-description');
    const label = type === 'expense'
        ? expenseLabel(ctx.data, entry)
        : incomeLabel(ctx.data, entry);
    description.append(element('p', 'entry-name', label));
    if (typeof entry.note === 'string' && entry.note.trim() !== '') {
        description.append(element('p', 'muted', entry.note));
    }

    const values = element('div', 'entry-values');
    const time = element('time', 'muted', shortDate(entry.date));
    time.setAttribute('datetime', entry.date);
    values.append(time);
    const amountText = type === 'income'
        ? `+${formatEuro(entry.amountCents)}`
        : formatEuro(entry.amountCents);
    const amount = element('p', type === 'income' ? 'entry-amount is-ok' : 'entry-amount', amountText);
    values.append(amount);

    row.append(description, values);
    wrap.append(row);

    if (isActiveEntry(type, entry.id) && entryUi.mode === 'edit') {
        wrap.append(
            type === 'expense'
                ? renderExpenseEditor(ctx, entry)
                : renderIncomeEditor(ctx, entry),
        );
        return wrap;
    }

    if (isActiveEntry(type, entry.id) && entryUi.mode === 'confirm-delete') {
        wrap.append(renderDeleteConfirm(ctx, type, entry));
        return wrap;
    }

    const actions = element('div', 'entry-actions');
    actions.append(
        actionButton('btn btn-ghost', 'Edit', () => {
            if (type === 'expense') {
                openEditExpense(ctx, entry);
            } else {
                openEditIncome(ctx, entry);
            }
        }),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            openConfirmDelete(ctx, type, entry.id);
        }),
    );
    wrap.append(actions);
    return wrap;
}

function renderEntries(root, ctx, entries, label) {
    if (entries.length === 0) {
        const empty = element('section', 'card empty-state');
        const message = element('p', '', `Nothing recorded in ${label}.`);
        const button = element('button', 'btn btn-primary', 'Add an expense');
        button.type = 'button';
        button.addEventListener('click', () => ctx.goTo('add', { panel: 'expense' }));
        empty.append(message, button);
        root.append(empty);
        return;
    }

    const card = element('section', 'card stack');
    card.append(element('h2', 'section-title', 'Entries'));
    const list = element('div', 'entry-list');
    for (const item of entries) {
        list.append(renderEntry(ctx, item));
    }
    card.append(list);
    root.append(card);
}

export function render(root, ctx) {
    const totals = monthTotals(ctx.data, ctx.monthKey);
    const previousMonthKey = addMonths(ctx.monthKey, -1);
    const previousTotals = monthTotals(ctx.data, previousMonthKey);
    const label = monthLabel(ctx.monthKey);
    const entries = monthEntries(ctx.data, ctx.monthKey);

    const layout = element('div', 'stack');
    renderMonthNav(layout, ctx);
    renderSummary(layout, totals);
    layout.append(element('p', 'muted month-comparison', comparisonText(
        totals,
        previousTotals,
        previousMonthKey,
    )));
    renderCategories(layout, totals.categories);
    renderEntries(layout, ctx, entries, label);
    root.append(layout);
}
