import { amountProblem, formatEuro, formatPlain } from '../../money.js';
import { currentMonthKey, shortDate } from '../../months.js';
import {
    addIncomeSource,
    deleteIncomeSource,
    incomeStatus,
    updateIncomeSource,
    validateIncomeSource,
} from '../../incomeSources.js';
import {
    element,
    persist,
    buildField,
    setError,
    clearError,
    actionButton,
    renderConfirm,
    option,
} from './shared.js';

const SAVE_FAILED = 'Could not save to this device. Nothing was changed. Try again.';
const MISSING = 'This regular income does not exist any more.';

function blankDraft() {
    return { name: '', amount: '', dayOfMonth: '', incomeCategoryId: '' };
}

/** This section's own state; Settings' shared state is not used. */
const view = {
    editId: null,
    editDraft: null,
    confirmId: null,
    addDraft: blankDraft(),
    errors: { add: '', edit: '' },
    focusError: '',
};

function closeForms() {
    view.editId = null;
    view.editDraft = null;
    view.confirmId = null;
    view.errors.edit = '';
}

/** `€2,000.00 · payday day 25` */
export function describeIncomeSource(source) {
    return `${formatEuro(source.expectedCents)} · payday day ${source.dayOfMonth}`;
}

/** The line about this month for one `incomeStatus` item; '' when the source has none. */
export function statusLine(item) {
    switch (item?.state) {
        case 'received':
            return `This month: received ${formatEuro(item.receivedCents)}`;
        case 'upcoming':
            return `This month: expected ${shortDate(item.date)}`;
        case 'due':
            return 'This month: waiting for you on Home';
        case 'skipped':
            return 'This month: skipped';
        default:
            return '';
    }
}

function defaultCategoryId(data) {
    const categories = data.incomeCategories;
    return (categories.find(({ id }) => id === 'salary') ?? categories[0])?.id ?? '';
}

/**
 * Runs one change to the list and saves it. A failed save puts the list and the open form
 * back, because the app already drew the unsaved change.
 */
function commit(ctx, kind, change, toastText) {
    const snapshot = structuredClone(ctx.data.incomeSources);
    const result = change();
    if (result.ok !== true) {
        if (kind === 'delete') {
            ctx.toast(result.reason);
        } else {
            view.errors[kind] = result.reason;
            view.focusError = kind;
            ctx.render();
        }
        return;
    }

    const { editId, editDraft, confirmId, addDraft } = view;
    if (kind === 'add') {
        view.addDraft = blankDraft();
        view.errors.add = '';
    } else {
        closeForms();
    }
    if (persist(ctx)) {
        ctx.toast(toastText);
        return;
    }

    ctx.data.incomeSources = snapshot;
    Object.assign(view, { editId, editDraft, confirmId, addDraft });
    if (kind === 'delete') {
        ctx.toast(SAVE_FAILED);
    } else {
        view.errors[kind] = SAVE_FAILED;
        view.focusError = kind;
    }
    ctx.render();
}

const found = (ok) => (ok ? { ok: true } : { ok: false, reason: MISSING });

function openEdit(ctx, source) {
    closeForms();
    view.editId = source.id;
    view.editDraft = {
        name: source.name,
        amount: formatPlain(source.expectedCents),
        dayOfMonth: String(source.dayOfMonth),
        incomeCategoryId: source.incomeCategoryId,
    };
    ctx.render();
}

function renderSourceForm(ctx, kind, source) {
    const isEdit = kind === 'edit';
    const draft = isEdit ? view.editDraft : view.addDraft;
    const idPrefix = isEdit ? `edit-income-source-${source.id}` : 'add-income-source';
    const categories = ctx.data.incomeCategories;
    if (!categories.some(({ id }) => id === draft.incomeCategoryId)) {
        draft.incomeCategoryId = isEdit ? '' : defaultCategoryId(ctx.data);
    }

    const form = element('form', isEdit ? 'inline-form entry-edit-form stack' : 'stack add-subscription-form');
    form.noValidate = true;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.value = draft.name;
    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.value = draft.amount;
    const dayInput = document.createElement('input');
    dayInput.type = 'text';
    dayInput.inputMode = 'numeric';
    dayInput.autocomplete = 'off';
    dayInput.value = draft.dayOfMonth;
    const categorySelect = document.createElement('select');
    if (draft.incomeCategoryId === '') {
        categorySelect.append(option('', 'Choose a category'));
    }
    categorySelect.append(...categories.map(({ id, name }) => option(id, name)));
    categorySelect.value = draft.incomeCategoryId;

    const fields = {
        name: buildField(`${idPrefix}-name`, 'Name', nameInput),
        amount: buildField(`${idPrefix}-amount`, 'Expected amount (EUR)', amountInput),
        day: buildField(`${idPrefix}-day`, 'Payday (day of month)', dayInput),
        category: buildField(`${idPrefix}-category`, 'Income category', categorySelect),
    };
    fields.day.wrapper.append(element('p', 'muted', 'In a shorter month the last day is used.'));

    const formError = element('p', 'error-text');
    formError.id = `${idPrefix}-form-error`;
    formError.setAttribute('role', 'alert');
    formError.tabIndex = -1;
    formError.hidden = view.errors[kind] === '';
    formError.textContent = view.errors[kind];

    const bind = (control, key, field) => {
        control.addEventListener('input', () => {
            draft[key] = control.value;
            clearError(field);
            view.errors[kind] = '';
            formError.hidden = true;
        });
    };
    bind(nameInput, 'name', fields.name);
    bind(amountInput, 'amount', fields.amount);
    bind(dayInput, 'dayOfMonth', fields.day);
    categorySelect.addEventListener('change', () => {
        draft.incomeCategoryId = categorySelect.value;
        clearError(fields.category);
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        for (const field of Object.values(fields)) {
            clearError(field);
        }
        const result = validateIncomeSource(draft);
        if (result.ok !== true) {
            const field = fields[result.field];
            setError(
                field,
                result.field === 'amount' ? amountProblem(draft.amount) || result.reason : result.reason,
            );
            field.control.focus();
            return;
        }
        if (isEdit) {
            commit(
                ctx,
                'edit',
                () => found(updateIncomeSource(ctx.data, source.id, result.value)),
                'Regular income saved',
            );
        } else {
            commit(ctx, 'add', () => addIncomeSource(ctx.data, result.value), 'Regular income added');
        }
    });

    const submit = element('button', 'btn btn-primary', isEdit ? 'Save' : 'Add regular income');
    submit.type = 'submit';
    form.append(
        ...(isEdit ? [] : [element('h3', 'category-name', 'Add regular income')]),
        ...Object.values(fields).map(({ wrapper }) => wrapper),
        formError,
        submit,
    );
    if (isEdit) {
        form.append(actionButton('btn', 'Cancel', () => {
            closeForms();
            ctx.render();
        }));
    }

    queueMicrotask(() => {
        if (view.focusError === kind) {
            view.focusError = '';
            formError.focus();
        } else if (isEdit) {
            nameInput.focus();
        }
    });
    return form;
}

function renderRow(ctx, source, item) {
    const row = element('article', 'subscription-item');

    if (view.confirmId === source.id) {
        row.append(renderConfirm(
            `Delete ${source.name}? Income you already recorded stays.`,
            () => commit(
                ctx,
                'delete',
                () => found(deleteIncomeSource(ctx.data, source.id)),
                'Regular income deleted',
            ),
            () => {
                view.confirmId = null;
                ctx.render();
            },
        ));
        return row;
    }

    if (view.editId === source.id && view.editDraft !== null) {
        row.append(renderSourceForm(ctx, 'edit', source));
        return row;
    }

    const head = element('div', 'more-category-head');
    const titles = element('div', 'more-category-titles');
    titles.append(
        element('h3', 'category-name', source.name),
        element('p', 'muted', describeIncomeSource(source)),
    );
    const status = statusLine(item);
    if (status !== '') {
        titles.append(element('p', 'muted', status));
    }
    head.append(titles);

    const actions = element('div', 'more-actions');
    actions.append(
        actionButton('btn btn-ghost', 'Edit', () => openEdit(ctx, source)),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeForms();
            view.confirmId = source.id;
            ctx.render();
        }),
    );
    head.append(actions);
    row.append(head);
    return row;
}

export function renderIncomeSourcesSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-income-sources';
    section.append(
        element('h2', 'section-title', 'Regular income'),
        element(
            'p',
            'muted',
            'Add each regular income with the day it arrives. On that day Home asks you to confirm '
                + 'what really arrived, so a different amount each month is fine. '
                + 'Nothing is added without you.',
        ),
    );

    const items = new Map(
        incomeStatus(ctx.data, currentMonthKey(), new Date()).map((item) => [item.sourceId, item]),
    );
    const list = element('div', 'subscription-list');
    if (ctx.data.incomeSources.length === 0) {
        list.append(element('p', 'muted', 'No regular income yet.'));
    }
    for (const source of ctx.data.incomeSources) {
        list.append(renderRow(ctx, source, items.get(source.id)));
    }
    section.append(
        list,
        renderSourceForm(ctx, 'add'),
        element(
            'p',
            'muted',
            'Asks from your next payday. If it already arrived this month, add it with Add income on Home.',
        ),
    );
    return section;
}
