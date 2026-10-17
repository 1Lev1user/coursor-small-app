import { parseAmount, amountProblem, formatEuro, formatPlain } from '../../money.js';
import { deleteTemplate, updateTemplate } from '../../templates.js';
import {
    element,
    persist,
    buildField,
    setError,
    clearError,
    actionButton,
    renderConfirm,
    state,
    closeTransientUi,
} from './shared.js';

function openEditTemplate(ctx, template) {
    closeTransientUi();
    state.editTemplateId = template.id;
    state.templateEditDraft = { name: template.name, amount: formatPlain(template.amountCents) };
    ctx.render();
}

function saveTemplateEdit(ctx, template, nameField, amountField) {
    const draft = state.templateEditDraft;
    state.templateEditError = '';
    clearError(nameField);
    clearError(amountField);
    draft.name = nameField.control.value;
    draft.amount = amountField.control.value;

    const problem = amountProblem(draft.amount);
    if (problem !== '') {
        setError(amountField, problem);
        amountField.control.focus();
        return;
    }

    const snapshot = { name: template.name, amountCents: template.amountCents };
    const result = updateTemplate(ctx.data, template.id, {
        name: draft.name,
        amountCents: parseAmount(draft.amount),
    });
    if (!result.ok) {
        setError(nameField, result.reason);
        nameField.control.focus();
        return;
    }

    if (ctx.save() === false) {
        template.name = snapshot.name;
        template.amountCents = snapshot.amountCents;
        state.templateEditError = 'Could not save to this device. Nothing was changed. Try again.';
        ctx.render();
        return;
    }

    closeTransientUi();
    ctx.render();
    ctx.toast('Template updated');
}

function confirmDeleteTemplate(ctx, template) {
    const index = ctx.data.templates.indexOf(template);
    if (!deleteTemplate(ctx.data, template.id).ok) {
        ctx.toast('Template does not exist.');
        return;
    }

    closeTransientUi();
    if (persist(ctx)) {
        ctx.toast('Template deleted');
        return;
    }
    ctx.data.templates.splice(index, 0, template);
    ctx.render();
}

function renderTemplateEditor(ctx, template) {
    const draft = state.templateEditDraft;
    const form = element('form', 'inline-form entry-edit-form stack');
    form.noValidate = true;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.required = true;
    nameInput.value = draft.name;
    const nameField = buildField(`edit-template-name-${template.id}`, 'Name', nameInput);

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.required = true;
    amountInput.value = draft.amount;
    const amountField = buildField(`edit-template-amount-${template.id}`, 'Amount (EUR)', amountInput);

    nameInput.addEventListener('input', () => {
        draft.name = nameInput.value;
        clearError(nameField);
    });
    amountInput.addEventListener('input', () => {
        draft.amount = amountInput.value;
        clearError(amountField);
    });

    const formError = element('p', 'error-text', state.templateEditError);
    formError.setAttribute('role', 'alert');
    formError.hidden = state.templateEditError === '';

    const saveButton = element('button', 'btn btn-primary', 'Save');
    saveButton.type = 'submit';
    const cancelButton = actionButton('btn', 'Cancel', () => {
        closeTransientUi();
        ctx.render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveTemplateEdit(ctx, template, nameField, amountField);
    });

    form.append(
        nameField.wrapper,
        amountField.wrapper,
        element('p', 'muted', 'To change the category, delete the template and save a new one from Add expense.'),
        formError,
        saveButton,
        cancelButton,
    );
    queueMicrotask(() => nameInput.focus());
    return form;
}

function renderTemplateRow(ctx, template) {
    const item = element('div', 'entry-item');
    const categoryName = ctx.data.categories.find(({ id }) => id === template.categoryId)?.name
        ?? 'Uncategorised';

    const row = element('div', 'entry-row');
    const description = element('div', 'entry-description');
    description.append(
        element('p', 'entry-name', template.name),
        element('p', 'muted', categoryName),
    );
    const values = element('div', 'entry-values');
    values.append(element('p', 'entry-amount', formatEuro(template.amountCents)));
    row.append(description, values);
    item.append(row);

    if (state.editTemplateId === template.id && state.templateEditDraft !== null) {
        item.append(renderTemplateEditor(ctx, template));
    } else if (state.confirmTemplateId === template.id) {
        item.append(renderConfirm(
            `Delete ${template.name}? Entries you already added stay.`,
            () => confirmDeleteTemplate(ctx, template),
            () => {
                closeTransientUi();
                ctx.render();
            },
        ));
    } else {
        const actions = element('div', 'entry-actions');
        actions.append(
            actionButton('btn btn-ghost', 'Edit', () => openEditTemplate(ctx, template)),
            actionButton('btn btn-ghost-danger', 'Delete', () => {
                closeTransientUi();
                state.confirmTemplateId = template.id;
                ctx.render();
            }),
        );
        item.append(actions);
    }
    return item;
}

export function renderTemplatesSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-templates';
    section.append(
        element('h2', 'section-title', 'Quick add'),
        element('p', 'muted', 'Templates are saved from Add expense with "Save as template".'),
    );

    const templates = Array.isArray(ctx.data.templates) ? ctx.data.templates : [];
    if (templates.length === 0) {
        section.append(element('p', 'muted', 'No templates yet.'));
    }
    for (const template of templates) {
        section.append(renderTemplateRow(ctx, template));
    }
    return section;
}
