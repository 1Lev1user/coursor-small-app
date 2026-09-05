import { UNCATEGORISED_ID, createId, deleteCategory, deleteSubcategory } from '../model.js';
import { canSetPinned, refreshCurrentMonthPlan, resolvePlan } from '../budget.js';

const addDraft = {
    name: '',
    kind: 'flexible',
    percent: '',
    error: '',
};

const addSubDrafts = new Map();
const renameDrafts = new Map();

let confirmCategoryId = null;
let confirmSubKey = null;
let renameCategoryId = null;
let renameSubKey = null;
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
    renameDrafts.clear();
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
