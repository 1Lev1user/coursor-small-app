import { parseAmount, formatEuro, formatPlain } from '../money.js';
import { todayISO, monthKeyOf } from '../months.js';
import {
    UNCATEGORISED_ID,
    SAVINGS_ID,
    SUBSCRIPTIONS_ID,
    createId,
    deleteCategory,
    deleteSubcategory,
} from '../model.js';
import {
    canSetPinned,
    refreshCurrentMonthPlan,
    resolvePlan,
    freezeMonthPlan,
    syncCategoryPlanFields,
    percentFromEuroCents,
    euroCentsFromPercent,
} from '../budget.js';
import { exportBackup, importBackup, countRecords } from '../backup.js';
import { buildMonthCsv, csvFilename } from '../csv.js';
import { downloadText } from '../files.js';
import {
    canAddExpenseCategory,
    canAddIncomeCategory,
    canAddSubcategory,
} from '../limits.js';

const addDraft = {
    name: '',
    kind: 'flexible',
    amount: '',
    limitUnit: 'percent',
    error: '',
};

const planDraft = {
    userName: null,
    budget: null,
    income: null,
    errorField: '',
    error: '',
};

const incomeDraft = {
    incomeCategoryId: '',
    amount: '',
    date: '',
    note: '',
    errorField: '',
    error: '',
};

const addIncomeCategoryDraft = {
    name: '',
    error: '',
};

const addSubscriptionDraft = {
    name: '',
    amount: '',
    dayOfMonth: '',
    errorField: '',
    error: '',
};

const addSubDrafts = new Map();
const renameDrafts = new Map();
const categoryPlanDrafts = new Map();

let confirmCategoryId = null;
let editPlanCategoryId = null;
let confirmSubKey = null;
let renameCategoryId = null;
let renameSubKey = null;
let confirmIncomeCategoryId = null;
let renameIncomeCategoryId = null;
let confirmSubscriptionId = null;
let editIncomeId = null;
let confirmIncomeEntryId = null;
let incomeEntryDraft = null;
let incomeEntrySaveError = '';
let focusIncomeEntryError = false;
let focusId = null;
let pendingScrollId = null;
let pendingImportText = null;
let pendingImportCounts = null;
let importError = '';

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

function displayPercent(percent) {
    return `${Math.round(percent * 10) / 10}%`;
}

function userCategories(data) {
    return data.categories.filter(
        (category) => (
            category.system !== true
            && category.id !== UNCATEGORISED_ID
            && category.id !== SUBSCRIPTIONS_ID
        ),
    );
}

function subKey(categoryId, subcategoryId) {
    return `${categoryId}:${subcategoryId}`;
}

function parsePercent(value) {
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

function buildLimitAmountField(id, labelText, draft, ctx, onInput) {
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

    const unitBtn = element('button', 'unit-toggle', draft.limitUnit === 'euro' ? '\u20AC' : '%');
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

function persist(ctx) {
    if (ctx.save() === false) {
        return false;
    }
    ctx.render();
    return true;
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

function renderConfirm(message, onConfirm, onCancel) {
    const box = element('div', 'confirm-box');
    box.setAttribute('role', 'group');
    box.append(
        element('p', 'confirm-copy', message),
        actionButton('btn', 'Cancel', onCancel),
        actionButton('btn btn-danger', 'Delete', onConfirm),
    );
    return box;
}

function renderRenameForm(id, currentValue, errorText, onSubmit, onCancel) {
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

function closeTransientUi() {
    confirmCategoryId = null;
    confirmSubKey = null;
    renameCategoryId = null;
    renameSubKey = null;
    confirmIncomeCategoryId = null;
    renameIncomeCategoryId = null;
    confirmSubscriptionId = null;
    editIncomeId = null;
    confirmIncomeEntryId = null;
    incomeEntryDraft = null;
    incomeEntrySaveError = '';
    focusIncomeEntryError = false;
    pendingImportText = null;
    pendingImportCounts = null;
    importError = '';
    renameDrafts.clear();
    editPlanCategoryId = null;
    categoryPlanDrafts.clear();
}

function hasBackupWorthyData(data) {
    return data.expenses.length > 0
        || data.incomes.length > 0
        || data.subscriptions.length > 0;
}

function calendarDaysBetween(fromISO, toISO) {
    const fromParts = fromISO.split('-').map(Number);
    const toParts = toISO.split('-').map(Number);
    if (fromParts.length !== 3 || toParts.length !== 3) {
        return Number.POSITIVE_INFINITY;
    }
    const from = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const to = new Date(toParts[0], toParts[1] - 1, toParts[2]);
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function needsBackupReminder(data, now = new Date()) {
    if (!hasBackupWorthyData(data)) {
        return false;
    }
    const last = data.settings.lastBackupISO;
    if (last === null || last === undefined || last === '') {
        return true;
    }
    return calendarDaysBetween(last, todayISO(now)) > 30;
}

function replaceAppData(ctx, next) {
    for (const key of Object.keys(ctx.data)) {
        delete ctx.data[key];
    }
    Object.assign(ctx.data, next);
}

function doExportBackup(ctx) {
    const { filename, json } = exportBackup(ctx.data);
    downloadText(filename, json, 'application/json');
    ctx.data.settings.lastBackupISO = todayISO();
    if (persist(ctx)) {
        ctx.toast('Backup exported');
    }
}

function doExportMonthCsv(ctx, flavour) {
    const monthKey = ctx.monthKey;
    const text = buildMonthCsv(ctx.data, monthKey, flavour);
    downloadText(csvFilename(monthKey, flavour), text, 'text/csv');
    ctx.toast(flavour === 'europe' ? 'Europe CSV downloaded' : 'Standard CSV downloaded');
}

function beginImportBackup(ctx, file) {
    importError = '';
    if (file === undefined || file === null) {
        return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
        const rawText = String(reader.result ?? '');
        const preview = importBackup(rawText);
        if (preview.ok !== true) {
            pendingImportText = null;
            pendingImportCounts = null;
            importError = preview.reason;
            ctx.render();
            return;
        }

        pendingImportText = rawText;
        pendingImportCounts = countRecords(ctx.data);
        importError = '';
        ctx.render();
    });
    reader.addEventListener('error', () => {
        pendingImportText = null;
        pendingImportCounts = null;
        importError = 'Could not read that file.';
        ctx.render();
    });
    reader.readAsText(file);
}

function confirmImportBackup(ctx) {
    if (pendingImportText === null) {
        return;
    }

    const result = importBackup(pendingImportText);
    if (result.ok !== true) {
        importError = result.reason;
        pendingImportText = null;
        pendingImportCounts = null;
        ctx.render();
        return;
    }

    replaceAppData(ctx, result.data);
    pendingImportText = null;
    pendingImportCounts = null;
    importError = '';
    if (persist(ctx)) {
        ctx.toast('Backup imported');
    }
}

function renderBackupReminder(ctx) {
    if (!needsBackupReminder(ctx.data)) {
        return null;
    }

    const card = element('section', 'card stack backup-reminder');
    card.setAttribute('role', 'status');
    card.append(
        element('h2', 'section-title', 'Backup reminder'),
        element(
            'p',
            '',
            'Your last backup is missing or more than 30 days old. Export a JSON'
                + ' backup so you can restore your data on this or another device.',
        ),
        actionButton('btn btn-primary', 'Export backup now', () => {
            doExportBackup(ctx);
        }),
    );
    return card;
}

function renderBackupSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-backup';
    section.append(element('h2', 'section-title', 'Backup & export'));

    const backupActions = element('div', 'backup-actions');
    backupActions.append(
        actionButton('btn btn-primary', 'Export backup (JSON)', () => {
            doExportBackup(ctx);
        }),
    );

    const importLabel = element('label', 'btn backup-file-label');
    importLabel.textContent = 'Import backup';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.className = 'backup-file-input';
    fileInput.setAttribute('aria-label', 'Choose backup JSON file');
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        beginImportBackup(ctx, file);
        fileInput.value = '';
    });
    importLabel.append(fileInput);
    backupActions.append(importLabel);
    section.append(backupActions);

    if (importError !== '') {
        const error = element('p', 'error-text', importError);
        error.setAttribute('role', 'alert');
        section.append(error);
    }

    if (pendingImportText !== null && pendingImportCounts !== null) {
        const counts = pendingImportCounts;
        const message = `Replace all data? This will destroy ${counts.expenses} expenses,`
            + ` ${counts.incomes} incomes, and ${counts.subscriptions} subscriptions.`
            + ' This cannot be undone.';
        const box = element('div', 'confirm-box');
        box.setAttribute('role', 'group');
        box.append(
            element('p', 'confirm-copy', message),
            actionButton('btn', 'Cancel', () => {
                pendingImportText = null;
                pendingImportCounts = null;
                importError = '';
                ctx.render();
            }),
            actionButton('btn btn-danger', 'Replace everything', () => {
                confirmImportBackup(ctx);
            }),
        );
        section.append(box);
    }

    section.append(element(
        'h3',
        'category-name',
        `Month CSV (${ctx.monthKey})`,
    ));
    section.append(element(
        'p',
        'muted',
        'Download this month\'s expenses and incomes. Europe uses ; and comma decimals;'
            + ' Standard uses , and dot decimals.',
    ));

    const csvActions = element('div', 'backup-actions');
    csvActions.append(
        actionButton('btn', 'Europe CSV', () => {
            doExportMonthCsv(ctx, 'europe');
        }),
        actionButton('btn', 'Standard CSV', () => {
            doExportMonthCsv(ctx, 'standard');
        }),
    );
    section.append(csvActions);
    return section;
}

function option(value, text) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
    return node;
}

function openEditIncomeEntry(ctx, income) {
    closeTransientUi();
    editIncomeId = income.id;
    incomeEntryDraft = {
        incomeCategoryId: income.incomeCategoryId,
        amount: formatPlain(income.amountCents),
        note: typeof income.note === 'string' ? income.note : '',
        date: income.date,
    };
    ctx.render();
}

function saveIncomeEntryEdit(ctx, income, fields) {
    const draft = incomeEntryDraft;
    incomeEntrySaveError = '';

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

        incomeEntrySaveError = 'Could not save to this device. Nothing was changed \u2014 try again.';
        focusIncomeEntryError = true;
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
        incomeEntrySaveError = 'Could not save to this device. Nothing was deleted \u2014 try again.';
        focusIncomeEntryError = true;
        ctx.render();
        return;
    }

    closeTransientUi();
    ctx.render();
    ctx.toast('Deleted');
}

function renderIncomeEntryEditor(ctx, income) {
    const draft = incomeEntryDraft;
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

    if (incomeEntrySaveError !== '') {
        formError.textContent = incomeEntrySaveError;
        formError.hidden = false;
    }

    if (focusIncomeEntryError) {
        focusIncomeEntryError = false;
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
    values.append(element('time', 'muted', income.date));
    values.append(element('p', 'entry-amount is-ok', `+${formatEuro(income.amountCents)}`));
    row.append(description, values);
    wrap.append(row);

    if (editIncomeId === income.id) {
        wrap.append(renderIncomeEntryEditor(ctx, income));
        return wrap;
    }

    if (confirmIncomeEntryId === income.id) {
        const box = renderConfirm(
            'Delete this income? This cannot be undone.',
            () => confirmDeleteIncomeEntry(ctx, income),
            () => {
                closeTransientUi();
                ctx.render();
            },
        );
        if (incomeEntrySaveError !== '') {
            const formError = element('p', 'error-text', incomeEntrySaveError);
            formError.setAttribute('role', 'alert');
            formError.tabIndex = -1;
            box.insertBefore(formError, box.children[1] ?? null);
            if (focusIncomeEntryError) {
                focusIncomeEntryError = false;
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
            confirmIncomeEntryId = income.id;
            ctx.render();
        }),
    );
    wrap.append(actions);
    return wrap;
}

function parseDayOfMonth(value) {
    const trimmed = String(value).trim();
    if (trimmed === '' || !/^\d{1,2}$/.test(trimmed)) {
        return null;
    }
    const day = Number(trimmed);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        return null;
    }
    return day;
}

function centsInputValue(cents, draftValue) {
    if (draftValue !== null) {
        return draftValue;
    }
    if (typeof cents !== 'number' || !Number.isFinite(cents)) {
        return '';
    }
    return formatPlain(cents);
}

function incomeCategoryName(data, incomeCategoryId) {
    return data.incomeCategories.find(({ id }) => id === incomeCategoryId)?.name
        ?? incomeCategoryId;
}

function incomeCategoryInUse(data, incomeCategoryId) {
    return data.incomes.some((entry) => entry.incomeCategoryId === incomeCategoryId);
}

function applyCategoryRename(ctx, category, rawName) {
    const name = rawName.trim();
    if (name === '') {
        renameDrafts.set(category.id, { value: rawName, error: 'Enter a name.' });
        ctx.render();
        return;
    }

    category.name = name;
    refreshCurrentMonthPlan(ctx.data);
    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Category renamed');
    }
}

function applySubcategoryRename(ctx, category, subcategory, rawName) {
    const key = subKey(category.id, subcategory.id);
    const name = rawName.trim();
    if (name === '') {
        renameDrafts.set(key, { value: rawName, error: 'Enter a name.' });
        ctx.render();
        return;
    }

    subcategory.name = name;
    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Subcategory renamed');
    }
}

function confirmDeleteCategory(ctx, category) {
    const result = deleteCategory(ctx.data, category.id);
    if (result.ok !== true) {
        ctx.toast(result.reason);
        return;
    }

    refreshCurrentMonthPlan(ctx.data);
    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Category deleted');
    }
}

function confirmDeleteSubcategory(ctx, category, subcategory) {
    const result = deleteSubcategory(ctx.data, category.id, subcategory.id);
    if (result.ok !== true) {
        ctx.toast(result.reason);
        return;
    }

    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Subcategory deleted');
    }
}

function addSubcategory(ctx, category, rawName, field) {
    const name = rawName.trim();
    if (name === '') {
        addSubDrafts.set(category.id, { name: rawName, error: 'Enter a name.' });
        setError(field, 'Enter a name.');
        field.control.focus();
        return;
    }

    const allowed = canAddSubcategory(ctx.data);
    if (allowed.ok !== true) {
        addSubDrafts.set(category.id, { name: rawName, error: allowed.reason });
        setError(field, allowed.reason);
        field.control.focus();
        return;
    }

    category.subcategories.push({
        id: createId('sub'),
        name,
    });
    addSubDrafts.delete(category.id);
    if (persist(ctx)) {
        ctx.toast('Subcategory added');
    }
}

function addCategory(ctx, nameField, amountField) {
    addDraft.name = nameField.control.value;
    addDraft.amount = amountField.control.value;
    addDraft.error = '';
    const name = addDraft.name.trim();
    if (name === '') {
        addDraft.error = 'Enter a name.';
        setError(nameField, addDraft.error);
        nameField.control.focus();
        return;
    }

    const allowed = canAddExpenseCategory(ctx.data);
    if (allowed.ok !== true) {
        addDraft.error = allowed.reason;
        setError(nameField, allowed.reason);
        nameField.control.focus();
        return;
    }

    const budget = ctx.data.settings.monthlyBudgetCents;
    let pinned = false;
    let limitMode = 'percent';
    let percent = 0;
    let limitCents = 0;

    if (addDraft.kind === 'pinned') {
        pinned = true;
        if (addDraft.limitUnit === 'euro') {
            if (budget <= 0) {
                addDraft.error = 'Save a monthly spend budget first.';
                setError(amountField, addDraft.error);
                amountField.control.focus();
                return;
            }

            const cents = parseAmount(addDraft.amount);
            if (cents === null) {
                addDraft.error = 'Enter a valid amount greater than zero.';
                setError(amountField, addDraft.error);
                amountField.control.focus();
                return;
            }

            limitMode = 'euro';
            limitCents = cents;
            percent = percentFromEuroCents(cents, budget);
        } else {
            percent = parsePercent(addDraft.amount);
            if (percent === null) {
                addDraft.error = 'Enter a percentage.';
                setError(amountField, addDraft.error);
                amountField.control.focus();
                return;
            }

            const check = canSetPinned(ctx.data.categories, null, percent);
            if (check.ok !== true) {
                addDraft.error = check.reason;
                setError(amountField, check.reason);
                amountField.control.focus();
                return;
            }

            limitCents = euroCentsFromPercent(percent, budget);
        }
    }

    ctx.data.categories.push({
        id: createId('cat'),
        name,
        pinned,
        percent,
        limitMode,
        limitCents,
        system: false,
        subcategories: [],
    });
    syncCategoryPlanFields(ctx.data.categories, budget);
    refreshCurrentMonthPlan(ctx.data);
    addDraft.name = '';
    addDraft.kind = 'flexible';
    addDraft.amount = '';
    addDraft.limitUnit = 'percent';
    addDraft.error = '';
    if (persist(ctx)) {
        ctx.toast('Category added');
    }
}

function renderWarnings(root, plan) {
    if (plan.leftoverPercent > 0 && plan.flexibleCount > 0) {
        const leftover = element('section', 'card plan-note');
        leftover.append(element(
            'p',
            '',
            `Leftover ${displayPercent(plan.leftoverPercent)} is split equally`
                + ` across ${plan.flexibleCount} flexible`
                + (plan.flexibleCount === 1 ? ' category' : ' categories')
                + ` (${displayPercent(plan.flexiblePercentEach)} each).`,
        ));
        root.append(leftover);
    }

    if (plan.unallocatedPercent > 0) {
        const unallocated = element('section', 'card warning-card');
        unallocated.append(element(
            'p',
            '',
            `Unallocated ${displayPercent(plan.unallocatedPercent)}`
                + ` (${formatEuro(plan.unallocatedCents)}) — no flexible categories`
                + ' to receive the remainder.',
        ));
        root.append(unallocated);
    }

    if (plan.warnings.flexibleWithoutBudget) {
        const warning = element('section', 'card warning-card');
        warning.append(element(
            'p',
            '',
            'Some categories have no budget because pinned shares already total 100%.',
        ));
        root.append(warning);
    }

    if (plan.warnings.pinnedOverflow) {
        const overflow = plan.pinnedTotalPercent - 100;
        const warning = element('section', 'card warning-card');
        warning.append(element(
            'p',
            '',
            `Pinned shares total ${displayPercent(plan.pinnedTotalPercent)}`
                + ` (${displayPercent(overflow)} over the 100% maximum).`,
        ));
        root.append(warning);
    }
}

function savePlan(ctx, nameField, budgetField, incomeField) {
    clearError(nameField);
    clearError(budgetField);
    clearError(incomeField);
    planDraft.error = '';
    planDraft.errorField = '';

    planDraft.userName = nameField.control.value;
    planDraft.budget = budgetField.control.value;
    planDraft.income = incomeField.control.value;

    const userName = String(planDraft.userName ?? '').trim();
    if (userName === '') {
        planDraft.errorField = 'name';
        planDraft.error = 'Enter your name.';
        setError(nameField, planDraft.error);
        nameField.control.focus();
        return;
    }

    const budgetCents = parseAmount(planDraft.budget, { allowZero: true });
    if (budgetCents === null) {
        planDraft.errorField = 'budget';
        planDraft.error = 'Enter a valid amount of zero or more.';
        setError(budgetField, planDraft.error);
        budgetField.control.focus();
        return;
    }

    const incomeCents = parseAmount(planDraft.income, { allowZero: true });
    if (incomeCents === null) {
        planDraft.errorField = 'income';
        planDraft.error = 'Enter a valid amount of zero or more.';
        setError(incomeField, planDraft.error);
        incomeField.control.focus();
        return;
    }

    ctx.data.settings.userName = userName;
    ctx.data.settings.monthlyBudgetCents = budgetCents;
    syncCategoryPlanFields(ctx.data.categories, budgetCents);
    ctx.data.settings.usualMonthlyIncomeCents = incomeCents;
    refreshCurrentMonthPlan(ctx.data);

    planDraft.userName = null;
    planDraft.budget = null;
    planDraft.income = null;
    planDraft.error = '';
    planDraft.errorField = '';

    if (persist(ctx)) {
        ctx.toast('Plan saved');
    }
}

function renderPlanSection(ctx) {
    const settings = ctx.data.settings;
    const section = element('section', 'card stack');
    section.id = 'more-plan';
    section.append(element('h2', 'section-title', 'Plan'));

    const form = element('form', 'stack plan-form');
    form.noValidate = true;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'given-name';
    nameInput.placeholder = 'Your first name';
    nameInput.maxLength = 40;
    nameInput.value = planDraft.userName ?? settings.userName ?? '';
    const nameField = buildField('plan-name', 'Your name', nameInput);
    nameInput.addEventListener('input', () => {
        planDraft.userName = nameInput.value;
        clearError(nameField);
    });

    const budgetInput = document.createElement('input');
    budgetInput.type = 'text';
    budgetInput.inputMode = 'decimal';
    budgetInput.autocomplete = 'off';
    budgetInput.placeholder = '1000';
    budgetInput.value = centsInputValue(settings.monthlyBudgetCents, planDraft.budget);
    const budgetField = buildField('plan-budget', 'Monthly spend budget (EUR)', budgetInput);
    budgetInput.addEventListener('input', () => {
        planDraft.budget = budgetInput.value;
        clearError(budgetField);
    });

    const incomeInput = document.createElement('input');
    incomeInput.type = 'text';
    incomeInput.inputMode = 'decimal';
    incomeInput.autocomplete = 'off';
    incomeInput.placeholder = '2000';
    incomeInput.value = centsInputValue(settings.usualMonthlyIncomeCents, planDraft.income);
    const incomeField = buildField('plan-income', 'Usual monthly income (EUR)', incomeInput);
    incomeInput.addEventListener('input', () => {
        planDraft.income = incomeInput.value;
        clearError(incomeField);
    });

    if (planDraft.error !== '') {
        if (planDraft.errorField === 'name') {
            setError(nameField, planDraft.error);
        } else if (planDraft.errorField === 'budget') {
            setError(budgetField, planDraft.error);
        } else if (planDraft.errorField === 'income') {
            setError(incomeField, planDraft.error);
        }
    }

    const submit = element('button', 'btn btn-primary', 'Save plan');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        savePlan(ctx, nameField, budgetField, incomeField);
    });

    form.append(
        nameField.wrapper,
        budgetField.wrapper,
        incomeField.wrapper,
        element(
            'p',
            'muted',
            'Usual monthly income is applied automatically each month in Month totals. '
                + 'Add only extra income (bonus, gift, side job) from Home — not this salary again.',
        ),
        submit,
    );
    section.append(form);
    return section;
}

function addExtraIncome(ctx, categoryField, amountField, dateField) {
    clearError(categoryField);
    clearError(amountField);
    clearError(dateField);
    incomeDraft.error = '';
    incomeDraft.errorField = '';

    incomeDraft.incomeCategoryId = categoryField.control.value;
    incomeDraft.amount = amountField.control.value;
    incomeDraft.date = dateField.control.value;

    if (incomeDraft.incomeCategoryId === '') {
        incomeDraft.errorField = 'category';
        incomeDraft.error = 'Choose an income category.';
        setError(categoryField, incomeDraft.error);
        categoryField.control.focus();
        return;
    }

    const amountCents = parseAmount(incomeDraft.amount);
    if (amountCents === null) {
        incomeDraft.errorField = 'amount';
        incomeDraft.error = 'Enter a valid amount greater than zero.';
        setError(amountField, incomeDraft.error);
        amountField.control.focus();
        return;
    }

    if (incomeDraft.date === '' || monthKeyOf(incomeDraft.date) === null) {
        incomeDraft.errorField = 'date';
        incomeDraft.error = 'Enter a valid date.';
        setError(dateField, incomeDraft.error);
        dateField.control.focus();
        return;
    }

    const noteInput = document.getElementById('extra-income-note');
    const note = noteInput?.value.trim() ?? '';

    ctx.data.incomes.push({
        id: createId('inc'),
        incomeCategoryId: incomeDraft.incomeCategoryId,
        amountCents,
        note,
        date: incomeDraft.date,
    });
    freezeMonthPlan(ctx.data, monthKeyOf(incomeDraft.date));

    incomeDraft.incomeCategoryId = '';
    incomeDraft.amount = '';
    incomeDraft.date = '';
    incomeDraft.note = '';
    incomeDraft.error = '';
    incomeDraft.errorField = '';

    if (persist(ctx)) {
        ctx.toast('Extra income added');
    }
}

function addIncomeCategory(ctx, nameField) {
    addIncomeCategoryDraft.name = nameField.control.value;
    addIncomeCategoryDraft.error = '';
    const name = addIncomeCategoryDraft.name.trim();
    if (name === '') {
        addIncomeCategoryDraft.error = 'Enter a name.';
        setError(nameField, addIncomeCategoryDraft.error);
        nameField.control.focus();
        return;
    }

    const allowed = canAddIncomeCategory(ctx.data);
    if (allowed.ok !== true) {
        addIncomeCategoryDraft.error = allowed.reason;
        setError(nameField, allowed.reason);
        nameField.control.focus();
        return;
    }

    ctx.data.incomeCategories.push({
        id: createId('incat'),
        name,
    });
    addIncomeCategoryDraft.name = '';
    addIncomeCategoryDraft.error = '';
    if (persist(ctx)) {
        ctx.toast('Income category added');
    }
}

function applyIncomeCategoryRename(ctx, category, rawName) {
    const name = rawName.trim();
    if (name === '') {
        renameDrafts.set(category.id, { value: rawName, error: 'Enter a name.' });
        ctx.render();
        return;
    }

    category.name = name;
    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Income category renamed');
    }
}

function confirmDeleteIncomeCategory(ctx, category) {
    if (incomeCategoryInUse(ctx.data, category.id)) {
        ctx.toast('This income category is in use and cannot be deleted.');
        closeTransientUi();
        ctx.render();
        return;
    }

    const index = ctx.data.incomeCategories.findIndex(({ id }) => id === category.id);
    if (index === -1) {
        ctx.toast('Income category does not exist.');
        return;
    }

    ctx.data.incomeCategories.splice(index, 1);
    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Income category deleted');
    }
}

function renderIncomeCategoryRow(ctx, category) {
    const item = element('article', 'income-category-item');
    const draft = renameDrafts.get(category.id) ?? { value: category.name, error: '' };

    if (renameIncomeCategoryId === category.id) {
        item.append(renderRenameForm(
            `rename-incat-${category.id}`,
            draft.value,
            draft.error,
            (value) => {
                renameDrafts.set(category.id, { value, error: '' });
                applyIncomeCategoryRename(ctx, category, value);
            },
            () => {
                renameIncomeCategoryId = null;
                renameDrafts.delete(category.id);
                ctx.render();
            },
        ));
        return item;
    }

    if (confirmIncomeCategoryId === category.id) {
        item.append(renderConfirm(
            `Delete ${category.name}?`,
            () => confirmDeleteIncomeCategory(ctx, category),
            () => {
                confirmIncomeCategoryId = null;
                ctx.render();
            },
        ));
        return item;
    }

    const head = element('div', 'more-category-head');
    head.append(element('h3', 'category-name', category.name));
    const actions = element('div', 'more-actions');
    actions.append(
        actionButton('btn btn-ghost', 'Rename', () => {
            closeTransientUi();
            renameIncomeCategoryId = category.id;
            renameDrafts.set(category.id, { value: category.name, error: '' });
            focusId = `rename-incat-${category.id}`;
            ctx.render();
        }),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeTransientUi();
            confirmIncomeCategoryId = category.id;
            ctx.render();
        }),
    );
    head.append(actions);
    item.append(head);
    return item;
}

function addSubscription(ctx, nameField, amountField, dayField) {
    clearError(nameField);
    clearError(amountField);
    clearError(dayField);
    addSubscriptionDraft.error = '';
    addSubscriptionDraft.errorField = '';

    addSubscriptionDraft.name = nameField.control.value;
    addSubscriptionDraft.amount = amountField.control.value;
    addSubscriptionDraft.dayOfMonth = dayField.control.value;

    const name = addSubscriptionDraft.name.trim();
    if (name === '') {
        addSubscriptionDraft.errorField = 'name';
        addSubscriptionDraft.error = 'Enter a name.';
        setError(nameField, addSubscriptionDraft.error);
        nameField.control.focus();
        return;
    }

    const amountCents = parseAmount(addSubscriptionDraft.amount);
    if (amountCents === null) {
        addSubscriptionDraft.errorField = 'amount';
        addSubscriptionDraft.error = 'Enter a valid amount greater than zero.';
        setError(amountField, addSubscriptionDraft.error);
        amountField.control.focus();
        return;
    }

    const dayOfMonth = parseDayOfMonth(addSubscriptionDraft.dayOfMonth);
    if (dayOfMonth === null) {
        addSubscriptionDraft.errorField = 'day';
        addSubscriptionDraft.error = 'Enter a day from 1 to 31.';
        setError(dayField, addSubscriptionDraft.error);
        dayField.control.focus();
        return;
    }

    ctx.data.subscriptions.push({
        id: createId('subs'),
        name,
        amountCents,
        dayOfMonth,
    });

    addSubscriptionDraft.name = '';
    addSubscriptionDraft.amount = '';
    addSubscriptionDraft.dayOfMonth = '';
    addSubscriptionDraft.error = '';
    addSubscriptionDraft.errorField = '';

    if (persist(ctx)) {
        ctx.toast('Subscription added');
    }
}

function confirmDeleteSubscription(ctx, subscription) {
    const index = ctx.data.subscriptions.findIndex(({ id }) => id === subscription.id);
    if (index === -1) {
        ctx.toast('Subscription does not exist.');
        return;
    }

    ctx.data.subscriptions.splice(index, 1);
    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Subscription deleted');
    }
}

function renderSubscriptionRow(ctx, subscription) {
    const item = element('article', 'subscription-item');

    if (confirmSubscriptionId === subscription.id) {
        item.append(renderConfirm(
            `Delete ${subscription.name}? Past charges stay in your history.`,
            () => confirmDeleteSubscription(ctx, subscription),
            () => {
                confirmSubscriptionId = null;
                ctx.render();
            },
        ));
        return item;
    }

    const head = element('div', 'more-category-head');
    const titles = element('div', 'more-category-titles');
    titles.append(
        element('h3', 'category-name', subscription.name),
        element(
            'p',
            'muted',
            `${formatEuro(subscription.amountCents)} · day ${subscription.dayOfMonth}`,
        ),
    );
    head.append(titles);

    const actions = element('div', 'more-actions');
    actions.append(
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeTransientUi();
            confirmSubscriptionId = subscription.id;
            ctx.render();
        }),
    );
    head.append(actions);
    item.append(head);
    return item;
}

function openCategoryPlanEditor(ctx, category) {
    closeTransientUi();
    editPlanCategoryId = category.id;
    const isSavings = category.id === SAVINGS_ID;
    const limitUnit = isSavings
        ? (category.limitMode === 'percent' ? 'percent' : 'euro')
        : (category.limitMode === 'euro' ? 'euro' : 'percent');
    categoryPlanDrafts.set(category.id, {
        kind: isSavings || category.pinned ? 'pinned' : 'flexible',
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

function renderSubscriptionsSection(ctx, plan) {
    const section = element('section', 'card stack');
    section.id = 'more-subscriptions';
    section.append(element('h2', 'section-title', 'Subscriptions'));

    const category = ctx.data.categories.find(({ id }) => id === SUBSCRIPTIONS_ID);
    if (category !== undefined) {
        const budgetCents = ctx.data.settings.monthlyBudgetCents;
        const planBlock = element('div', 'stack subscription-plan');
        planBlock.append(
            element('h3', 'category-name', 'Budget share'),
            element('p', 'muted', shareLabel(category, plan, budgetCents)),
        );

        if (editPlanCategoryId === category.id) {
            planBlock.append(renderCategoryPlanEditor(ctx, category));
        } else {
            planBlock.append(
                actionButton('btn btn-ghost', 'Edit plan', () => {
                    openCategoryPlanEditor(ctx, category);
                }),
            );
        }
        section.append(planBlock);
    }

    section.append(element('h3', 'category-name', 'Recurring'));

    const list = element('div', 'subscription-list');
    if (ctx.data.subscriptions.length === 0) {
        list.append(element('p', 'muted', 'No subscriptions yet.'));
    } else {
        for (const subscription of ctx.data.subscriptions) {
            list.append(renderSubscriptionRow(ctx, subscription));
        }
    }
    section.append(list);

    const form = element('form', 'stack add-subscription-form');
    form.noValidate = true;
    form.append(element('h3', 'category-name', 'Add subscription'));
    form.append(element(
        'p',
        'muted',
        'Each month on this day the app reminds you to log the charge as an expense. '
            + 'It does not create income — only a due reminder for the subscription amount.',
    ));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.value = addSubscriptionDraft.name;
    const nameField = buildField('add-subscription-name', 'Name', nameInput);
    nameInput.addEventListener('input', () => {
        addSubscriptionDraft.name = nameInput.value;
        addSubscriptionDraft.error = '';
        clearError(nameField);
    });

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '12.50';
    amountInput.value = addSubscriptionDraft.amount;
    const amountField = buildField('add-subscription-amount', 'Usual amount (EUR)', amountInput);
    amountInput.addEventListener('input', () => {
        addSubscriptionDraft.amount = amountInput.value;
        addSubscriptionDraft.error = '';
        clearError(amountField);
    });

    const dayInput = document.createElement('input');
    dayInput.type = 'text';
    dayInput.inputMode = 'numeric';
    dayInput.autocomplete = 'off';
    dayInput.placeholder = '1–31';
    dayInput.value = addSubscriptionDraft.dayOfMonth;
    const dayField = buildField('add-subscription-day', 'Day of month', dayInput);
    dayInput.addEventListener('input', () => {
        addSubscriptionDraft.dayOfMonth = dayInput.value;
        addSubscriptionDraft.error = '';
        clearError(dayField);
    });

    if (addSubscriptionDraft.error !== '') {
        if (addSubscriptionDraft.errorField === 'name') {
            setError(nameField, addSubscriptionDraft.error);
        } else if (addSubscriptionDraft.errorField === 'amount') {
            setError(amountField, addSubscriptionDraft.error);
        } else if (addSubscriptionDraft.errorField === 'day') {
            setError(dayField, addSubscriptionDraft.error);
        }
    }

    const submit = element('button', 'btn btn-primary', 'Add subscription');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        addSubscription(ctx, nameField, amountField, dayField);
    });

    form.append(
        nameField.wrapper,
        amountField.wrapper,
        dayField.wrapper,
        submit,
    );
    section.append(form);
    return section;
}

function renderIncomeSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-income';
    section.append(element('h2', 'section-title', 'Income'));

    section.append(element('h3', 'category-name', 'Extra income'));
    const list = element('div', 'entry-list income-entry-list');
    if (ctx.data.incomes.length === 0) {
        list.append(element('p', 'muted', 'No extra income yet.'));
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

    if (incomeDraft.date === '') {
        incomeDraft.date = todayISO();
    }

    const addForm = element('form', 'stack add-extra-income-form');
    addForm.noValidate = true;
    addForm.append(element('h3', 'category-name', 'Add extra income'));
    addForm.append(element(
        'p',
        'muted',
        'Extra income only. Usual salary from Plan is automatic each month — do not enter it here again.',
    ));

    const categorySelect = document.createElement('select');
    categorySelect.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a category';
    categorySelect.append(placeholder);
    for (const category of ctx.data.incomeCategories) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.append(option);
    }
    categorySelect.value = incomeDraft.incomeCategoryId;
    const categoryField = buildField('extra-income-category', 'Income category', categorySelect);
    categorySelect.addEventListener('change', () => {
        incomeDraft.incomeCategoryId = categorySelect.value;
        clearError(categoryField);
    });

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '100';
    amountInput.value = incomeDraft.amount;
    const amountField = buildField('extra-income-amount', 'Amount (EUR)', amountInput);
    amountInput.addEventListener('input', () => {
        incomeDraft.amount = amountInput.value;
        clearError(amountField);
    });

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = incomeDraft.date;
    const dateField = buildField('extra-income-date', 'Date', dateInput);
    dateInput.addEventListener('input', () => {
        incomeDraft.date = dateInput.value;
        clearError(dateField);
    });

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.value = incomeDraft.note;
    const noteField = buildField('extra-income-note', 'Note (optional)', noteInput);
    noteInput.addEventListener('input', () => {
        incomeDraft.note = noteInput.value;
    });

    if (incomeDraft.error !== '') {
        if (incomeDraft.errorField === 'category') {
            setError(categoryField, incomeDraft.error);
        } else if (incomeDraft.errorField === 'amount') {
            setError(amountField, incomeDraft.error);
        } else if (incomeDraft.errorField === 'date') {
            setError(dateField, incomeDraft.error);
        }
    }

    const addSubmit = element('button', 'btn btn-primary', 'Add extra income');
    addSubmit.type = 'submit';
    addForm.addEventListener('submit', (event) => {
        event.preventDefault();
        addExtraIncome(ctx, categoryField, amountField, dateField);
    });
    addForm.append(
        categoryField.wrapper,
        amountField.wrapper,
        dateField.wrapper,
        noteField.wrapper,
        addSubmit,
    );
    section.append(addForm);

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

function renderSubcategory(ctx, category, subcategory) {
    const key = subKey(category.id, subcategory.id);
    const item = element('li', 'subcategory-item');
    const draft = renameDrafts.get(key) ?? { value: subcategory.name, error: '' };

    if (renameSubKey === key) {
        item.append(renderRenameForm(
            `rename-sub-${subcategory.id}`,
            draft.value,
            draft.error,
            (value) => {
                renameDrafts.set(key, { value, error: '' });
                applySubcategoryRename(ctx, category, subcategory, value);
            },
            () => {
                renameSubKey = null;
                renameDrafts.delete(key);
                ctx.render();
            },
        ));
        return item;
    }

    if (confirmSubKey === key) {
        item.append(renderConfirm(
            `Delete ${subcategory.name}? Existing expenses keep this category and show as Unspecified.`,
            () => confirmDeleteSubcategory(ctx, category, subcategory),
            () => {
                confirmSubKey = null;
                ctx.render();
            },
        ));
        return item;
    }

    item.append(
        element('p', 'subcategory-name', subcategory.name),
        actionButton('btn btn-ghost', 'Rename', () => {
            closeTransientUi();
            renameSubKey = key;
            renameDrafts.set(key, { value: subcategory.name, error: '' });
            focusId = `rename-sub-${subcategory.id}`;
            ctx.render();
        }),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeTransientUi();
            confirmSubKey = key;
            ctx.render();
        }),
    );
    return item;
}

function renderAddSubcategory(ctx, category) {
    const draft = addSubDrafts.get(category.id) ?? { name: '', error: '' };
    const form = element('form', 'inline-form add-sub-form');
    form.noValidate = true;

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.value = draft.name;
    const field = buildField(`add-sub-${category.id}`, 'Add subcategory', input);
    if (draft.error !== '') {
        setError(field, draft.error);
    }

    input.addEventListener('input', () => {
        addSubDrafts.set(category.id, { name: input.value, error: '' });
        clearError(field);
    });

    const button = element('button', 'btn btn-primary', 'Add');
    button.type = 'submit';

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        addSubcategory(ctx, category, input.value, field);
    });

    form.append(field.wrapper, button);
    return form;
}

function shareLabel(category, plan, budgetCents) {
    const entry = plan.entries.find(({ id }) => id === category.id);
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

function saveCategoryPlan(ctx, category, draft, amountField) {
    const budget = ctx.data.settings.monthlyBudgetCents;
    clearError(amountField);
    draft.error = '';

    if (category.id === SAVINGS_ID) {
        draft.kind = 'pinned';
        if (draft.limitUnit !== 'euro' && draft.limitUnit !== 'percent') {
            draft.limitUnit = 'euro';
        }
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

function renderCategoryPlanKindChoice(draft, amountField, ctx, { allowFlexible = true } = {}) {
    const fieldset = element('fieldset', 'choice-set');
    const legend = document.createElement('legend');
    legend.textContent = 'Share';
    fieldset.append(legend);

    const row = element('div', 'choice-row');
    const options = [
        ...(allowFlexible ? [{ value: 'flexible', label: 'Flexible' }] : []),
        { value: 'pinned', label: 'Fixed' },
    ];

    for (const option of options) {
        const choice = element('label', 'choice');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `edit-plan-kind-${editPlanCategoryId}`;
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
    return fieldset;
}

function renderCategoryPlanEditor(ctx, category) {
    const isSavings = category.id === SAVINGS_ID;
    const draft = categoryPlanDrafts.get(category.id) ?? {
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

function renderCategory(ctx, category, plan) {
    const budgetCents = ctx.data.settings.monthlyBudgetCents;
    const item = element('article', 'category-item more-category');
    const head = element('div', 'more-category-head');
    const titles = element('div', 'more-category-titles');
    titles.append(
        element('h3', 'category-name', category.name),
        element('p', 'muted', shareLabel(category, plan, budgetCents)),
    );
    head.append(titles);

    if (renameCategoryId === category.id) {
        const draft = renameDrafts.get(category.id) ?? { value: category.name, error: '' };
        item.append(
            head,
            renderRenameForm(
                `rename-cat-${category.id}`,
                draft.value,
                draft.error,
                (value) => {
                    renameDrafts.set(category.id, { value, error: '' });
                    applyCategoryRename(ctx, category, value);
                },
                () => {
                    renameCategoryId = null;
                    renameDrafts.delete(category.id);
                    ctx.render();
                },
            ),
        );
    } else if (editPlanCategoryId === category.id) {
        item.append(head, renderCategoryPlanEditor(ctx, category));
    } else if (confirmCategoryId === category.id) {
        item.append(
            head,
            renderConfirm(
                `Delete ${category.name}? Its expenses will move to Uncategorised.`,
                () => confirmDeleteCategory(ctx, category),
                () => {
                    confirmCategoryId = null;
                    ctx.render();
                },
            ),
        );
    } else {
        const actions = element('div', 'more-actions');
        actions.append(
            actionButton('btn btn-ghost', 'Edit plan', () => {
                openCategoryPlanEditor(ctx, category);
            }),
            actionButton('btn btn-ghost', 'Rename', () => {
                closeTransientUi();
                renameCategoryId = category.id;
                renameDrafts.set(category.id, { value: category.name, error: '' });
                focusId = `rename-cat-${category.id}`;
                ctx.render();
            }),
        );
        if (category.id !== SAVINGS_ID) {
            actions.append(
                actionButton('btn btn-ghost-danger', 'Delete', () => {
                    closeTransientUi();
                    confirmCategoryId = category.id;
                    ctx.render();
                }),
            );
        }
        head.append(actions);
        item.append(head);
    }

    const subs = element('ul', 'subcategory-list');
    if (category.subcategories.length === 0) {
        const empty = element('li', 'subcategory-empty muted', 'No subcategories');
        subs.append(empty);
    } else {
        for (const subcategory of category.subcategories) {
            subs.append(renderSubcategory(ctx, category, subcategory));
        }
    }
    item.append(subs, renderAddSubcategory(ctx, category));
    return item;
}

function renderKindChoice(amountField, ctx) {
    const fieldset = element('fieldset', 'choice-set');
    const legend = document.createElement('legend');
    legend.textContent = 'Share';
    fieldset.append(legend);

    const row = element('div', 'choice-row');
    const options = [
        { value: 'flexible', label: 'Flexible' },
        { value: 'pinned', label: 'Fixed' },
    ];

    for (const option of options) {
        const choice = element('label', 'choice');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'add-category-kind';
        radio.value = option.value;
        radio.checked = addDraft.kind === option.value;
        radio.addEventListener('change', () => {
            addDraft.kind = option.value;
            amountField.wrapper.hidden = addDraft.kind !== 'pinned';
            if (addDraft.kind !== 'pinned') {
                clearError(amountField);
            }
            ctx.render();
        });
        choice.append(radio, document.createTextNode(option.label));
        row.append(choice);
    }

    fieldset.append(row);
    return fieldset;
}

function renderAddCategory(ctx) {
    const form = element('form', 'stack add-category-form');
    form.noValidate = true;
    form.append(element('h3', 'category-name', 'Add category'));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.value = addDraft.name;
    nameInput.required = true;
    const nameField = buildField('add-category-name', 'Name', nameInput);
    nameInput.addEventListener('input', () => {
        addDraft.name = nameInput.value;
        addDraft.error = '';
        clearError(nameField);
    });

    const amountField = buildLimitAmountField(
        'add-category-amount',
        'Fixed amount',
        addDraft,
        ctx,
        () => {
            addDraft.error = '';
        },
    );
    amountField.wrapper.hidden = addDraft.kind !== 'pinned';

    if (addDraft.error !== '') {
        if (addDraft.kind === 'pinned' && addDraft.error !== 'Enter a name.') {
            setError(amountField, addDraft.error);
        } else {
            setError(nameField, addDraft.error);
        }
    }

    const submit = element('button', 'btn btn-primary', 'Add category');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        addCategory(ctx, nameField, amountField);
    });

    form.append(
        nameField.wrapper,
        renderKindChoice(amountField, ctx),
        amountField.wrapper,
        submit,
    );
    return form;
}

function renderCategoriesSection(ctx, plan) {
    const section = element('section', 'card stack');
    section.id = 'more-categories';
    section.append(element('h2', 'section-title', 'Categories'));

    const list = element('div', 'category-list');
    for (const category of userCategories(ctx.data)) {
        list.append(renderCategory(ctx, category, plan));
    }
    section.append(list, renderAddCategory(ctx));
    return section;
}

export function openSettingsSection(sectionId) {
    pendingScrollId = sectionId;
}

export function render(root, ctx) {
    const plan = resolvePlan(ctx.data.categories, ctx.data.settings.monthlyBudgetCents);
    const layout = element('div', 'stack more-page');
    layout.append(element('h2', 'section-title', 'Settings'));

    const jumps = element('nav', 'more-jumps');
    jumps.setAttribute('aria-label', 'Settings sections');
    for (const [id, label] of [
        ['more-plan', 'Plan'],
        ['more-income', 'Income'],
        ['more-subscriptions', 'Subscriptions'],
        ['more-categories', 'Categories'],
        ['more-backup', 'Backup'],
    ]) {
        const link = element('a', 'more-jump', label);
        link.href = `#${id}`;
        jumps.append(link);
    }
    layout.append(jumps);

    const reminder = renderBackupReminder(ctx);
    if (reminder !== null) {
        layout.append(reminder);
    }

    renderWarnings(layout, plan);
    layout.append(
        renderPlanSection(ctx),
        renderIncomeSection(ctx),
        renderSubscriptionsSection(ctx, plan),
        renderCategoriesSection(ctx, plan),
        renderBackupSection(ctx),
    );
    root.append(layout);

    if (pendingScrollId !== null) {
        const section = document.getElementById(pendingScrollId);
        pendingScrollId = null;
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (focusId !== null) {
        const target = document.getElementById(focusId);
        focusId = null;
        target?.focus();
        target?.select?.();
    }
}
