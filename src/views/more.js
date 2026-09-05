import { parseAmount, formatEuro, formatPlain } from '../money.js';
import { todayISO, monthKeyOf } from '../months.js';
import { UNCATEGORISED_ID, createId, deleteCategory, deleteSubcategory } from '../model.js';
import {
    canSetPinned,
    refreshCurrentMonthPlan,
    resolvePlan,
    freezeMonthPlan,
} from '../budget.js';

const addDraft = {
    name: '',
    kind: 'flexible',
    percent: '',
    error: '',
};

const planDraft = {
    budget: null,
    savingsPercent: null,
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

const addSubDrafts = new Map();
const renameDrafts = new Map();

let confirmCategoryId = null;
let confirmSubKey = null;
let renameCategoryId = null;
let renameSubKey = null;
let confirmIncomeCategoryId = null;
let renameIncomeCategoryId = null;
let focusId = null;

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
        (category) => category.system !== true && category.id !== UNCATEGORISED_ID,
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
    renameDrafts.clear();
}

function savingsCategory(data) {
    return data.categories.find(({ id }) => id === 'savings');
}

function centsInputValue(cents, draftValue) {
    if (draftValue !== null) {
        return draftValue;
    }
    if (!cents) {
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

    category.subcategories.push({
        id: createId('sub'),
        name,
    });
    addSubDrafts.delete(category.id);
    if (persist(ctx)) {
        ctx.toast('Subcategory added');
    }
}

function addCategory(ctx, nameField, percentField) {
    addDraft.name = nameField.control.value;
    addDraft.percent = percentField.control.value;
    addDraft.error = '';
    const name = addDraft.name.trim();
    if (name === '') {
        addDraft.error = 'Enter a name.';
        setError(nameField, addDraft.error);
        nameField.control.focus();
        return;
    }

    let percent = 0;
    if (addDraft.kind === 'pinned') {
        percent = parsePercent(addDraft.percent);
        if (percent === null) {
            addDraft.error = 'Enter a percentage.';
            setError(percentField, addDraft.error);
            percentField.control.focus();
            return;
        }

        const check = canSetPinned(ctx.data.categories, null, percent);
        if (check.ok !== true) {
            addDraft.error = check.reason;
            setError(percentField, check.reason);
            percentField.control.focus();
            return;
        }
    }

    ctx.data.categories.push({
        id: createId('cat'),
        name,
        pinned: addDraft.kind === 'pinned',
        percent,
        system: false,
        subcategories: [],
    });
    refreshCurrentMonthPlan(ctx.data);
    addDraft.name = '';
    addDraft.kind = 'flexible';
    addDraft.percent = '';
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

function savePlan(ctx, budgetField, savingsField, incomeField) {
    clearError(budgetField);
    clearError(savingsField);
    clearError(incomeField);
    planDraft.error = '';
    planDraft.errorField = '';

    planDraft.budget = budgetField.control.value;
    planDraft.savingsPercent = savingsField.control.value;
    planDraft.income = incomeField.control.value;

    const budgetCents = parseAmount(planDraft.budget);
    if (budgetCents === null) {
        planDraft.errorField = 'budget';
        planDraft.error = 'Enter a valid amount greater than zero.';
        setError(budgetField, planDraft.error);
        budgetField.control.focus();
        return;
    }

    const savingsPercent = parsePercent(planDraft.savingsPercent);
    if (savingsPercent === null) {
        planDraft.errorField = 'savings';
        planDraft.error = 'Enter a savings percentage from 0 to 100.';
        setError(savingsField, planDraft.error);
        savingsField.control.focus();
        return;
    }

    const pinCheck = canSetPinned(ctx.data.categories, 'savings', savingsPercent);
    if (pinCheck.ok !== true) {
        planDraft.errorField = 'savings';
        planDraft.error = pinCheck.reason;
        setError(savingsField, pinCheck.reason);
        savingsField.control.focus();
        return;
    }

    const incomeCents = parseAmount(planDraft.income);
    if (incomeCents === null) {
        planDraft.errorField = 'income';
        planDraft.error = 'Enter a valid amount greater than zero.';
        setError(incomeField, planDraft.error);
        incomeField.control.focus();
        return;
    }

    const savings = savingsCategory(ctx.data);
    if (savings === undefined) {
        planDraft.errorField = 'savings';
        planDraft.error = 'Savings category is missing.';
        setError(savingsField, planDraft.error);
        savingsField.control.focus();
        return;
    }

    ctx.data.settings.monthlyBudgetCents = budgetCents;
    ctx.data.settings.usualMonthlyIncomeCents = incomeCents;
    savings.pinned = true;
    savings.percent = savingsPercent;
    refreshCurrentMonthPlan(ctx.data);

    planDraft.budget = null;
    planDraft.savingsPercent = null;
    planDraft.income = null;
    planDraft.error = '';
    planDraft.errorField = '';

    if (persist(ctx)) {
        ctx.toast('Plan saved');
    }
}

function renderPlanSection(ctx) {
    const settings = ctx.data.settings;
    const savings = savingsCategory(ctx.data);
    const section = element('section', 'card stack');
    section.append(element('h2', 'section-title', 'Plan'));

    const form = element('form', 'stack plan-form');
    form.noValidate = true;

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

    const savingsInput = document.createElement('input');
    savingsInput.type = 'text';
    savingsInput.inputMode = 'decimal';
    savingsInput.autocomplete = 'off';
    savingsInput.placeholder = '10';
    savingsInput.value = planDraft.savingsPercent !== null
        ? planDraft.savingsPercent
        : String(savings?.percent ?? 0);
    const savingsField = buildField('plan-savings', 'Savings %', savingsInput);
    savingsInput.addEventListener('input', () => {
        planDraft.savingsPercent = savingsInput.value;
        clearError(savingsField);
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
        if (planDraft.errorField === 'budget') {
            setError(budgetField, planDraft.error);
        } else if (planDraft.errorField === 'savings') {
            setError(savingsField, planDraft.error);
        } else if (planDraft.errorField === 'income') {
            setError(incomeField, planDraft.error);
        }
    }

    const submit = element('button', 'btn btn-primary', 'Save plan');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        savePlan(ctx, budgetField, savingsField, incomeField);
    });

    form.append(
        budgetField.wrapper,
        savingsField.wrapper,
        incomeField.wrapper,
        submit,
    );
    section.append(form);
    return section;
}

function saveUsualIncome(ctx, incomeField) {
    clearError(incomeField);
    const amountCents = parseAmount(incomeField.control.value);
    if (amountCents === null) {
        setError(incomeField, 'Enter a valid amount greater than zero.');
        incomeField.control.focus();
        return;
    }

    ctx.data.settings.usualMonthlyIncomeCents = amountCents;
    refreshCurrentMonthPlan(ctx.data);
    planDraft.income = null;
    if (persist(ctx)) {
        ctx.toast('Usual income saved');
    }
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

function renderIncomeSection(ctx) {
    const settings = ctx.data.settings;
    const section = element('section', 'card stack');
    section.append(element('h2', 'section-title', 'Income'));

    const usualForm = element('form', 'stack');
    usualForm.noValidate = true;
    const usualInput = document.createElement('input');
    usualInput.type = 'text';
    usualInput.inputMode = 'decimal';
    usualInput.autocomplete = 'off';
    usualInput.placeholder = '2000';
    usualInput.value = centsInputValue(settings.usualMonthlyIncomeCents, planDraft.income);
    const usualField = buildField('usual-income', 'Usual monthly income (EUR)', usualInput);
    usualInput.addEventListener('input', () => {
        planDraft.income = usualInput.value;
        clearError(usualField);
    });
    const usualSave = element('button', 'btn btn-primary', 'Save usual income');
    usualSave.type = 'submit';
    usualForm.addEventListener('submit', (event) => {
        event.preventDefault();
        saveUsualIncome(ctx, usualField);
    });
    usualForm.append(usualField.wrapper, usualSave);
    section.append(usualForm);

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
            list.append(row);
        }
    }
    section.append(list);

    if (incomeDraft.date === '') {
        incomeDraft.date = todayISO();
    }

    const addForm = element('form', 'stack add-extra-income-form');
    addForm.noValidate = true;
    addForm.append(element('h3', 'category-name', 'Add extra income'));

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

function shareLabel(category, plan) {
    if (category.pinned === true) {
        return `Pinned · ${displayPercent(category.percent)}`;
    }
    return `Flexible · ${displayPercent(plan.flexiblePercentEach)}`;
}

function renderCategory(ctx, category, plan) {
    const item = element('article', 'category-item more-category');
    const head = element('div', 'more-category-head');
    const titles = element('div', 'more-category-titles');
    titles.append(
        element('h3', 'category-name', category.name),
        element('p', 'muted', shareLabel(category, plan)),
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
            actionButton('btn btn-ghost', 'Rename', () => {
                closeTransientUi();
                renameCategoryId = category.id;
                renameDrafts.set(category.id, { value: category.name, error: '' });
                focusId = `rename-cat-${category.id}`;
                ctx.render();
            }),
            actionButton('btn btn-ghost-danger', 'Delete', () => {
                closeTransientUi();
                confirmCategoryId = category.id;
                ctx.render();
            }),
        );
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

function renderKindChoice(percentField) {
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
            percentField.wrapper.hidden = addDraft.kind !== 'pinned';
            if (addDraft.kind !== 'pinned') {
                clearError(percentField);
            }
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

    const percentInput = document.createElement('input');
    percentInput.type = 'text';
    percentInput.inputMode = 'decimal';
    percentInput.autocomplete = 'off';
    percentInput.placeholder = '10';
    percentInput.value = addDraft.percent;
    const percentField = buildField('add-category-percent', 'Percent', percentInput);
    percentField.wrapper.hidden = addDraft.kind !== 'pinned';
    percentInput.addEventListener('input', () => {
        addDraft.percent = percentInput.value;
        addDraft.error = '';
        clearError(percentField);
    });

    if (addDraft.error !== '') {
        if (addDraft.kind === 'pinned' && addDraft.error !== 'Enter a name.') {
            setError(percentField, addDraft.error);
        } else {
            setError(nameField, addDraft.error);
        }
    }

    const submit = element('button', 'btn btn-primary', 'Add category');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        addCategory(ctx, nameField, percentField);
    });

    form.append(
        nameField.wrapper,
        renderKindChoice(percentField),
        percentField.wrapper,
        submit,
    );
    return form;
}

export function render(root, ctx) {
    const plan = resolvePlan(ctx.data.categories, ctx.data.settings.monthlyBudgetCents);
    const layout = element('div', 'stack more-page');
    layout.append(element('h2', 'section-title', 'More'));
    renderWarnings(layout, plan);
    layout.append(renderPlanSection(ctx), renderIncomeSection(ctx));

    const section = element('section', 'card stack');
    section.append(element('h2', 'section-title', 'Categories'));

    const list = element('div', 'category-list');
    for (const category of userCategories(ctx.data)) {
        list.append(renderCategory(ctx, category, plan));
    }
    section.append(list, renderAddCategory(ctx));
    layout.append(section);
    root.append(layout);

    if (focusId !== null) {
        const target = document.getElementById(focusId);
        focusId = null;
        target?.focus();
        target?.select?.();
    }
}
