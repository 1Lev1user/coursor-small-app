import { parseAmount } from '../../money.js';
import {
    UNCATEGORISED_ID,
    SAVINGS_ID,
    SUBSCRIPTIONS_ID,
    createId,
    deleteCategory,
    deleteSubcategory,
} from '../../model.js';
import {
    canSetPinned,
    refreshCurrentMonthPlan,
    syncCategoryPlanFields,
    percentFromEuroCents,
    euroCentsFromPercent,
} from '../../budget.js';
import {
    canAddExpenseCategory,
    canAddSubcategory,
} from '../../limits.js';
import {
    element,
    subKey,
    parsePercent,
    persist,
    buildField,
    buildLimitAmountField,
    setError,
    clearError,
    actionButton,
    renderConfirm,
    renderRenameForm,
    state,
    closeTransientUi,
    shareLabel,
    openCategoryPlanEditor,
    renderCategoryPlanEditor,
} from './shared.js';

const addDraft = {
    name: '',
    kind: 'flexible',
    amount: '',
    limitUnit: 'percent',
    error: '',
};

const addSubDrafts = new Map();

function userCategories(data) {
    return data.categories.filter(
        (category) => (
            category.system !== true
            && category.id !== UNCATEGORISED_ID
            && category.id !== SUBSCRIPTIONS_ID
        ),
    );
}

function applyCategoryRename(ctx, category, rawName) {
    const name = rawName.trim();
    if (name === '') {
        state.renameDrafts.set(category.id, { value: rawName, error: 'Enter a name.' });
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
        state.renameDrafts.set(key, { value: rawName, error: 'Enter a name.' });
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

    if (addDraft.kind === 'none') {
        pinned = false;
        limitMode = 'none';
        percent = 0;
        limitCents = 0;
    } else if (addDraft.kind === 'pinned') {
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

function renderSubcategory(ctx, category, subcategory) {
    const key = subKey(category.id, subcategory.id);
    const item = element('li', 'subcategory-item');
    const draft = state.renameDrafts.get(key) ?? { value: subcategory.name, error: '' };

    if (state.renameSubKey === key) {
        item.append(renderRenameForm(
            `rename-sub-${subcategory.id}`,
            draft.value,
            draft.error,
            (value) => {
                state.renameDrafts.set(key, { value, error: '' });
                applySubcategoryRename(ctx, category, subcategory, value);
            },
            () => {
                state.renameSubKey = null;
                state.renameDrafts.delete(key);
                ctx.render();
            },
        ));
        return item;
    }

    if (state.confirmSubKey === key) {
        item.append(renderConfirm(
            `Delete ${subcategory.name}? Existing expenses keep this category and show as Unspecified.`,
            () => confirmDeleteSubcategory(ctx, category, subcategory),
            () => {
                state.confirmSubKey = null;
                ctx.render();
            },
        ));
        return item;
    }

    item.append(
        element('p', 'subcategory-name', subcategory.name),
        actionButton('btn btn-ghost', 'Rename', () => {
            closeTransientUi();
            state.renameSubKey = key;
            state.renameDrafts.set(key, { value: subcategory.name, error: '' });
            state.focusId = `rename-sub-${subcategory.id}`;
            ctx.render();
        }),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeTransientUi();
            state.confirmSubKey = key;
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

    if (state.renameCategoryId === category.id) {
        const draft = state.renameDrafts.get(category.id) ?? { value: category.name, error: '' };
        item.append(
            head,
            renderRenameForm(
                `rename-cat-${category.id}`,
                draft.value,
                draft.error,
                (value) => {
                    state.renameDrafts.set(category.id, { value, error: '' });
                    applyCategoryRename(ctx, category, value);
                },
                () => {
                    state.renameCategoryId = null;
                    state.renameDrafts.delete(category.id);
                    ctx.render();
                },
            ),
        );
    } else if (state.editPlanCategoryId === category.id) {
        item.append(head, renderCategoryPlanEditor(ctx, category));
    } else if (state.confirmCategoryId === category.id) {
        item.append(
            head,
            renderConfirm(
                `Delete ${category.name}? Its expenses will move to Uncategorised.`,
                () => confirmDeleteCategory(ctx, category),
                () => {
                    state.confirmCategoryId = null;
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
                state.renameCategoryId = category.id;
                state.renameDrafts.set(category.id, { value: category.name, error: '' });
                state.focusId = `rename-cat-${category.id}`;
                ctx.render();
            }),
        );
        if (category.id !== SAVINGS_ID) {
            actions.append(
                actionButton('btn btn-ghost-danger', 'Delete', () => {
                    closeTransientUi();
                    state.confirmCategoryId = category.id;
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
        { value: 'none', label: 'No limit' },
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
    if (addDraft.kind === 'none') {
        fieldset.append(element(
            'p',
            'muted',
            'No planned share. Spending still counts and shows as % of your budget.',
        ));
    }
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

export function renderCategoriesSection(ctx, plan) {
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
