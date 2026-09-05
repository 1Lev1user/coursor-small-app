import { parseAmount } from '../money.js';
import { monthKeyOf, todayISO } from '../months.js';
import { UNCATEGORISED_ID, createId } from '../model.js';
import { freezeMonthPlan } from '../budget.js';

// Survives the re-render that follows a save, so the user keeps their
// category and date while the amount and note are cleared for the next entry.
const draft = {
    categoryId: '',
    subcategoryId: '',
    amount: '',
    note: '',
    date: '',
};

let focusAmountOnRender = false;

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

export function render(root, ctx) {
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

    // aria-required rather than required: validation is ours, and a native
    // required control reports itself invalid before the user has touched it.
    const categorySelect = document.createElement('select');
    categorySelect.setAttribute('aria-required', 'true');
    categorySelect.append(
        option('', 'Choose a category'),
        ...categories.map(({ id, name }) => option(id, name)),
    );
    categorySelect.value = draft.categoryId;
    const categoryField = buildField('add-category', 'Category', categorySelect);

    const subcategorySelect = document.createElement('select');
    const subcategoryField = buildField('add-subcategory', 'Subcategory', subcategorySelect);

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '12.50 or 12,50';
    amountInput.setAttribute('aria-required', 'true');
    amountInput.value = draft.amount;
    const amountField = buildField('add-amount', 'Amount (\u20ac)', amountInput);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.placeholder = 'Optional';
    noteInput.value = draft.note;
    const noteField = buildField('add-note', 'Note \u2014 what was it?', noteInput);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.setAttribute('aria-required', 'true');
    dateInput.value = draft.date;
    const dateField = buildField('add-date', 'Date', dateInput);

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'Add expense';

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

    form.addEventListener('submit', (event) => {
        event.preventDefault();

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

        ctx.data.expenses.push({
            id: createId('exp'),
            categoryId,
            subcategoryId,
            amountCents,
            note: noteInput.value.trim(),
            date,
        });
        freezeMonthPlan(ctx.data, monthKeyOf(date));

        draft.categoryId = categoryId;
        draft.subcategoryId = subcategoryId;
        draft.amount = '';
        draft.note = '';
        draft.date = date;
        focusAmountOnRender = true;

        // ctx.save() reports its own failure, so only confirm a real write.
        if (ctx.save() !== false) {
            ctx.toast('Added');
        }
    });

    form.append(
        categoryField.wrapper,
        subcategoryField.wrapper,
        amountField.wrapper,
        noteField.wrapper,
        dateField.wrapper,
        submitButton,
    );
    rebuildSubcategories();
    root.append(form);

    if (focusAmountOnRender) {
        focusAmountOnRender = false;
        amountInput.focus();
    }
}
