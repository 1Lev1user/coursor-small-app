import { createId } from '../../model.js';
import { canAddIncomeCategory } from '../../limits.js';
import {
    element,
    persist,
    setError,
    actionButton,
    renderConfirm,
    renderRenameForm,
    state,
    closeTransientUi,
} from './shared.js';

export const addIncomeCategoryDraft = {
    name: '',
    error: '',
};

export function incomeCategoryName(data, incomeCategoryId) {
    return data.incomeCategories.find(({ id }) => id === incomeCategoryId)?.name
        ?? incomeCategoryId;
}

function incomeCategoryInUse(data, incomeCategoryId) {
    return data.incomes.some((entry) => entry.incomeCategoryId === incomeCategoryId);
}

export function addIncomeCategory(ctx, nameField) {
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
        state.renameDrafts.set(category.id, { value: rawName, error: 'Enter a name.' });
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

export function renderIncomeCategoryRow(ctx, category) {
    const item = element('article', 'income-category-item');
    const draft = state.renameDrafts.get(category.id) ?? { value: category.name, error: '' };

    if (state.renameIncomeCategoryId === category.id) {
        item.append(renderRenameForm(
            `rename-incat-${category.id}`,
            draft.value,
            draft.error,
            (value) => {
                state.renameDrafts.set(category.id, { value, error: '' });
                applyIncomeCategoryRename(ctx, category, value);
            },
            () => {
                state.renameIncomeCategoryId = null;
                state.renameDrafts.delete(category.id);
                ctx.render();
            },
        ));
        return item;
    }

    if (state.confirmIncomeCategoryId === category.id) {
        item.append(renderConfirm(
            `Delete ${category.name}?`,
            () => confirmDeleteIncomeCategory(ctx, category),
            () => {
                state.confirmIncomeCategoryId = null;
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
            state.renameIncomeCategoryId = category.id;
            state.renameDrafts.set(category.id, { value: category.name, error: '' });
            state.focusId = `rename-incat-${category.id}`;
            ctx.render();
        }),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeTransientUi();
            state.confirmIncomeCategoryId = category.id;
            ctx.render();
        }),
    );
    head.append(actions);
    item.append(head);
    return item;
}
