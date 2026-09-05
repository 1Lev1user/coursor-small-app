import { parseAmount, formatEuro } from '../money.js';
import { monthKeyOf, todayISO } from '../months.js';
import { UNCATEGORISED_ID, createId } from '../model.js';
import {
    freezeMonthPlan,
    syncCategoryPlanFields,
    refreshCurrentMonthPlan,
} from '../budget.js';

/** @type {'home' | 'expense' | 'income'} */
let panel = 'home';

// Survives the re-render that follows a save, so the user keeps their
// category and date while the amount and note are cleared for the next entry.
const draft = {
    categoryId: '',
    subcategoryId: '',
    amount: '',
    note: '',
    date: '',
};

const incomeDraft = {
    incomeCategoryId: '',
    amount: '',
    note: '',
    date: '',
    error: '',
    errorField: '',
};

let focusAmountOnRender = false;
let saveError = '';
let focusSaveErrorOnRender = false;

let addingCategory = false;
let addCategoryName = '';
let addCategoryError = '';
let focusAddCategoryOnRender = false;

let confirmNoteAsSub = false;

export function openAddPanel(next = 'home') {
    panel = next === 'expense' || next === 'income' ? next : 'home';
    if (panel === 'home') {
        closeQuickPanels();
        incomeDraft.error = '';
        incomeDraft.errorField = '';
    }
}

export function addScreenTitle() {
    if (panel === 'expense') {
        return 'Add expense';
    }
    if (panel === 'income') {
        return 'Add extra income';
    }
    return 'Home';
}

function selectableCategories(data) {
    return data.categories.filter(
        (category) => category.system !== true && category.id !== UNCATEGORISED_ID,
    );
}

function option(value, text) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = text;
    return element;
}

function buildField(id, labelText, control) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;

    const error = document.createElement('p');
    error.className = 'error-text';
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

function namesMatch(a, b) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function closeQuickPanels() {
    addingCategory = false;
    addCategoryName = '';
    addCategoryError = '';
    confirmNoteAsSub = false;
}

function createFlexibleCategory(ctx, name) {
    const budget = ctx.data.settings.monthlyBudgetCents;
    const category = {
        id: createId('cat'),
        name,
        pinned: false,
        percent: 0,
        limitMode: 'percent',
        limitCents: 0,
        system: false,
        subcategories: [],
    };
    ctx.data.categories.push(category);
    syncCategoryPlanFields(ctx.data.categories, budget);
    refreshCurrentMonthPlan(ctx.data);
    return category;
}

function findCategory(data, categoryId) {
    return data.categories.find(({ id }) => id === categoryId);
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function backToHomeButton(ctx) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = 'Back to Home';
    button.addEventListener('click', () => {
        openAddPanel('home');
        ctx.render();
    });
    return button;
}

function renderHome(root, ctx) {
    const layout = element('div', 'stack home-page');
    const card = element('section', 'card stack home-hero');

    card.append(
        element('h2', 'section-title', 'Track income & expenses'),
        element(
            'p',
            '',
            'This app helps you follow what you earn and what you spend. Everything stays on this device — no account and no cloud sync.',
        ),
        element(
            'p',
            'muted home-auto-note',
            'Your usual monthly income (Settings → Plan) is counted automatically each month. Subscriptions remind you on their day so you can log the charge. Here you only add day-to-day expenses and extra income (bonus, gift, side job) — not your regular salary.',
        ),
    );

    const expenseBtn = document.createElement('button');
    expenseBtn.type = 'button';
    expenseBtn.className = 'btn btn-primary';
    expenseBtn.textContent = 'Add expense';
    expenseBtn.addEventListener('click', () => {
        openAddPanel('expense');
        ctx.render();
    });

    const incomeBtn = document.createElement('button');
    incomeBtn.type = 'button';
    incomeBtn.className = 'btn btn-primary';
    incomeBtn.textContent = 'Add extra income';
    incomeBtn.addEventListener('click', () => {
        openAddPanel('income');
        ctx.render();
    });

    const actions = element('div', 'home-actions stack');
    actions.append(expenseBtn, incomeBtn);
    card.append(actions);
    layout.append(card);
    root.append(layout);
}

function renderIncomeForm(root, ctx) {
    if (incomeDraft.date === '') {
        incomeDraft.date = todayISO();
    }

    const form = document.createElement('form');
    form.id = 'add-income-form';
    form.className = 'card stack';
    form.noValidate = true;

    form.append(
        element(
            'p',
            'muted home-auto-note',
            'Extra income only. Your usual salary from Plan is applied automatically each month — do not enter it again here.',
        ),
    );

    const categorySelect = document.createElement('select');
    categorySelect.required = true;
    categorySelect.append(option('', 'Choose a category'));
    for (const category of ctx.data.incomeCategories) {
        categorySelect.append(option(category.id, category.name));
    }
    categorySelect.value = incomeDraft.incomeCategoryId;
    const categoryField = buildField('home-income-category', 'Income category', categorySelect);
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
    const amountField = buildField('home-income-amount', 'Amount (\u20ac)', amountInput);
    amountInput.addEventListener('input', () => {
        incomeDraft.amount = amountInput.value;
        clearError(amountField);
    });

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = incomeDraft.date;
    const dateField = buildField('home-income-date', 'Date', dateInput);
    dateInput.addEventListener('input', () => {
        incomeDraft.date = dateInput.value;
        clearError(dateField);
    });

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.value = incomeDraft.note;
    const noteField = buildField('home-income-note', 'Note (optional)', noteInput);
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

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-primary';
    submit.textContent = 'Add extra income';

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        clearError(categoryField);
        clearError(amountField);
        clearError(dateField);
        incomeDraft.error = '';
        incomeDraft.errorField = '';

        incomeDraft.incomeCategoryId = categorySelect.value;
        incomeDraft.amount = amountInput.value;
        incomeDraft.date = dateInput.value;
        incomeDraft.note = noteInput.value;

        if (incomeDraft.incomeCategoryId === '') {
            incomeDraft.errorField = 'category';
            incomeDraft.error = 'Choose an income category.';
            setError(categoryField, incomeDraft.error);
            categorySelect.focus();
            return;
        }

        const amountCents = parseAmount(incomeDraft.amount);
        if (amountCents === null) {
            incomeDraft.errorField = 'amount';
            incomeDraft.error = 'Enter a valid amount greater than zero.';
            setError(amountField, incomeDraft.error);
            amountInput.focus();
            return;
        }

        if (incomeDraft.date === '' || monthKeyOf(incomeDraft.date) === null) {
            incomeDraft.errorField = 'date';
            incomeDraft.error = 'Enter a valid date.';
            setError(dateField, incomeDraft.error);
            dateInput.focus();
            return;
        }

        ctx.data.incomes.push({
            id: createId('inc'),
            incomeCategoryId: incomeDraft.incomeCategoryId,
            amountCents,
            note: incomeDraft.note.trim(),
            date: incomeDraft.date,
        });
        freezeMonthPlan(ctx.data, monthKeyOf(incomeDraft.date));

        incomeDraft.incomeCategoryId = '';
        incomeDraft.amount = '';
        incomeDraft.date = todayISO();
        incomeDraft.note = '';
        incomeDraft.error = '';
        incomeDraft.errorField = '';

        if (ctx.save() === false) {
            ctx.data.incomes.pop();
            ctx.toast('Could not save to this device');
            return;
        }

        openAddPanel('home');
        ctx.render();
        ctx.toast('Extra income added');
    });

    form.append(
        categoryField.wrapper,
        amountField.wrapper,
        dateField.wrapper,
        noteField.wrapper,
        submit,
        backToHomeButton(ctx),
    );
    root.append(form);
}

export function render(root, ctx) {
    if (panel === 'home') {
        renderHome(root, ctx);
        return;
    }
    if (panel === 'income') {
        renderIncomeForm(root, ctx);
        return;
    }
    renderExpenseForm(root, ctx);
}

function renderExpenseForm(root, ctx) {
    const categories = selectableCategories(ctx.data);

    if (draft.date === '') {
        draft.date = todayISO();
    }
    if (!categories.some(({ id }) => id === draft.categoryId)) {
        draft.categoryId = '';
        draft.subcategoryId = '';
    }

    const form = document.createElement('form');
    form.id = 'add-form';
    form.className = 'card stack';
    form.noValidate = true;

    const categorySelect = document.createElement('select');
    categorySelect.required = true;
    categorySelect.setAttribute('aria-required', 'true');
    categorySelect.append(
        option('', 'Choose a category'),
        ...categories.map(({ id, name }) => option(id, name)),
    );
    categorySelect.value = draft.categoryId;

    const categoryPlus = document.createElement('button');
    categoryPlus.type = 'button';
    categoryPlus.className = 'add-plus-btn';
    categoryPlus.setAttribute('aria-label', 'Add category');
    categoryPlus.textContent = '+';

    const categoryRow = document.createElement('div');
    categoryRow.className = 'add-field-row';
    categoryRow.append(categorySelect, categoryPlus);

    const categoryField = buildField('add-category', 'Category', categoryRow);
    // Label targets the select, not the row wrapper.
    categoryField.wrapper.querySelector('label').htmlFor = 'add-category';
    categorySelect.id = 'add-category';
    categoryField.control = categorySelect;

    const subcategorySelect = document.createElement('select');
    const subcategoryField = buildField('add-subcategory', 'Subcategory', subcategorySelect);

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '12.50 or 12,50';
    amountInput.required = true;
    amountInput.setAttribute('aria-required', 'true');
    amountInput.value = draft.amount;
    const amountField = buildField('add-amount', 'Amount (\u20ac)', amountInput);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.placeholder = 'Optional';
    noteInput.value = draft.note;

    const notePlus = document.createElement('button');
    notePlus.type = 'button';
    notePlus.className = 'add-plus-btn';
    notePlus.setAttribute('aria-label', 'Add note as subcategory');
    notePlus.textContent = '+';
    notePlus.hidden = draft.note.trim() === '';

    const noteRow = document.createElement('div');
    noteRow.className = 'add-field-row';
    noteRow.append(noteInput, notePlus);

    const noteField = buildField('add-note', 'Note \u2014 what was it?', noteRow);
    noteField.wrapper.querySelector('label').htmlFor = 'add-note';
    noteInput.id = 'add-note';
    noteField.control = noteInput;

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.required = true;
    dateInput.setAttribute('aria-required', 'true');
    dateInput.value = draft.date;
    const dateField = buildField('add-date', 'Date', dateInput);

    const formError = document.createElement('p');
    formError.id = 'add-form-error';
    formError.className = 'error-text';
    formError.setAttribute('role', 'alert');
    formError.tabIndex = -1;
    formError.hidden = true;

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'Add expense';

    function subcategoriesOf(categoryId) {
        return findCategory(ctx.data, categoryId)?.subcategories ?? [];
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

    categoryPlus.addEventListener('click', () => {
        confirmNoteAsSub = false;
        addingCategory = true;
        addCategoryError = '';
        ctx.render();
    });

    notePlus.addEventListener('click', () => {
        const noteName = noteInput.value.trim();
        if (noteName === '') {
            return;
        }
        if (categorySelect.value === '') {
            setError(categoryField, 'Choose a category first.');
            categorySelect.focus();
            return;
        }
        addingCategory = false;
        addCategoryError = '';
        confirmNoteAsSub = true;
        ctx.render();
    });

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
        notePlus.hidden = noteInput.value.trim() === '';
        if (noteInput.value.trim() === '') {
            confirmNoteAsSub = false;
        }
    });
    dateInput.addEventListener('change', () => {
        draft.date = dateInput.value;
        clearError(dateField);
    });

    const categoryPanelHost = document.createElement('div');
    categoryPanelHost.className = 'add-quick-panel-host';

    if (addingCategory) {
        const panel = document.createElement('div');
        panel.className = 'add-quick-panel stack';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Add category');

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.autocomplete = 'off';
        nameInput.placeholder = 'Category name';
        nameInput.value = addCategoryName;
        nameInput.id = 'add-quick-category-name';
        const nameField = buildField('add-quick-category-name', 'New category name', nameInput);
        if (addCategoryError !== '') {
            setError(nameField, addCategoryError);
        }

        nameInput.addEventListener('input', () => {
            addCategoryName = nameInput.value;
            addCategoryError = '';
            clearError(nameField);
        });

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn';
        cancelBtn.textContent = 'Cancel';

        const actions = document.createElement('div');
        actions.className = 'add-quick-actions';
        actions.append(cancelBtn, saveBtn);

        cancelBtn.addEventListener('click', () => {
            closeQuickPanels();
            ctx.render();
        });

        saveBtn.addEventListener('click', () => {
            const name = addCategoryName.trim();
            if (name === '') {
                addCategoryError = 'Enter a name.';
                setError(nameField, addCategoryError);
                nameInput.focus();
                return;
            }

            const existing = selectableCategories(ctx.data).find(({ name: n }) => namesMatch(n, name));
            if (existing !== undefined) {
                draft.categoryId = existing.id;
                draft.subcategoryId = '';
                closeQuickPanels();
                if (ctx.save() !== false) {
                    ctx.toast('Category already exists');
                }
                ctx.render();
                return;
            }

            const category = createFlexibleCategory(ctx, name);
            draft.categoryId = category.id;
            draft.subcategoryId = '';
            closeQuickPanels();

            if (ctx.save() === false) {
                ctx.data.categories.splice(ctx.data.categories.indexOf(category), 1);
                syncCategoryPlanFields(
                    ctx.data.categories,
                    ctx.data.settings.monthlyBudgetCents,
                );
                refreshCurrentMonthPlan(ctx.data);
                saveError = 'Could not save to this device. Try again.';
                focusSaveErrorOnRender = true;
                ctx.render();
                return;
            }

            ctx.render();
            ctx.toast('Category added');
        });

        panel.append(nameField.wrapper, actions);
        categoryPanelHost.append(panel);
    }

    const notePanelHost = document.createElement('div');
    notePanelHost.className = 'add-quick-panel-host';

    if (confirmNoteAsSub) {
        const noteName = draft.note.trim();
        const parent = findCategory(ctx.data, draft.categoryId);
        const panel = document.createElement('div');
        panel.className = 'add-quick-panel stack';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Add subcategory from note');

        const copy = document.createElement('p');
        copy.className = 'confirm-copy';
        const parentLabel = parent?.name ?? 'this category';
        copy.textContent = `Add \u201c${noteName}\u201d as a subcategory of ${parentLabel}?`;

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-primary';
        addBtn.textContent = 'Add';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn';
        cancelBtn.textContent = 'Cancel';

        const actions = document.createElement('div');
        actions.className = 'add-quick-actions';
        actions.append(cancelBtn, addBtn);

        cancelBtn.addEventListener('click', () => {
            confirmNoteAsSub = false;
            ctx.render();
        });

        addBtn.addEventListener('click', () => {
            if (draft.categoryId === '' || parent === undefined) {
                confirmNoteAsSub = false;
                setError(categoryField, 'Choose a category first.');
                categorySelect.focus();
                return;
            }

            const existing = parent.subcategories.find(({ name }) => namesMatch(name, noteName));
            if (existing !== undefined) {
                draft.subcategoryId = existing.id;
                confirmNoteAsSub = false;
                ctx.render();
                ctx.toast('Subcategory already exists');
                return;
            }

            const subcategory = {
                id: createId('sub'),
                name: noteName,
            };
            parent.subcategories.push(subcategory);
            draft.subcategoryId = subcategory.id;
            confirmNoteAsSub = false;

            if (ctx.save() === false) {
                parent.subcategories.splice(parent.subcategories.indexOf(subcategory), 1);
                draft.subcategoryId = '';
                saveError = 'Could not save to this device. Try again.';
                focusSaveErrorOnRender = true;
                ctx.render();
                return;
            }

            ctx.render();
            ctx.toast('Subcategory added');
        });

        panel.append(copy, actions);
        notePanelHost.append(panel);
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        saveError = '';
        formError.textContent = '';
        formError.hidden = true;

        const categoryId = categorySelect.value;
        const subcategories = subcategoriesOf(categoryId);
        const subcategoryId = subcategories.length > 0 ? subcategorySelect.value : '';
        const amountCents = parseAmount(amountInput.value);
        const date = dateInput.value;
        let firstInvalid = null;

        for (const field of [categoryField, subcategoryField, amountField, dateField]) {
            clearError(field);
        }

        if (categoryId === '') {
            setError(categoryField, 'Choose a category.');
            firstInvalid ??= categorySelect;
        }
        if (subcategories.length > 0 && subcategoryId === '') {
            setError(subcategoryField, 'Choose a subcategory.');
            firstInvalid ??= subcategorySelect;
        }
        if (amountCents === null) {
            setError(amountField, 'Enter an amount above zero, like 12.50 or 12,50.');
            firstInvalid ??= amountInput;
        }
        if (monthKeyOf(date) === null) {
            setError(dateField, 'Choose a date.');
            firstInvalid ??= dateInput;
        }

        if (firstInvalid !== null) {
            firstInvalid.focus();
            return;
        }

        const monthKey = monthKeyOf(date);
        const planWasAlreadyFrozen = Object.hasOwn(ctx.data.monthPlans, monthKey);
        const expense = {
            id: createId('exp'),
            categoryId,
            subcategoryId,
            amountCents,
            note: noteInput.value.trim(),
            date,
        };

        ctx.data.expenses.push(expense);
        freezeMonthPlan(ctx.data, monthKey);

        if (ctx.save() === false) {
            ctx.data.expenses.splice(ctx.data.expenses.indexOf(expense), 1);
            if (!planWasAlreadyFrozen) {
                delete ctx.data.monthPlans[monthKey];
            }

            saveError = 'Could not save to this device. Nothing was recorded \u2014 your entry is'
                + ' still here, try again.';
            focusSaveErrorOnRender = true;
            ctx.render();
            return;
        }

        draft.categoryId = categoryId;
        draft.subcategoryId = subcategoryId;
        draft.amount = '';
        draft.note = '';
        draft.date = date;
        closeQuickPanels();
        focusAmountOnRender = true;

        ctx.render();
        ctx.toast('Added');
    });

    form.append(
        categoryField.wrapper,
        categoryPanelHost,
        subcategoryField.wrapper,
        amountField.wrapper,
        noteField.wrapper,
        notePanelHost,
        dateField.wrapper,
        formError,
        submitButton,
        backToHomeButton(ctx),
    );
    rebuildSubcategories();
    root.append(form);

    if (saveError !== '') {
        formError.textContent = saveError;
        formError.hidden = false;
    }

    if (focusSaveErrorOnRender) {
        focusSaveErrorOnRender = false;
        formError.focus();
    } else if (focusAddCategoryOnRender || addingCategory) {
        focusAddCategoryOnRender = false;
        document.getElementById('add-quick-category-name')?.focus();
    } else if (focusAmountOnRender) {
        focusAmountOnRender = false;
        amountInput.focus();
    }
}
