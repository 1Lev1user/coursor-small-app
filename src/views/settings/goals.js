import {
    addGoal,
    closeGoal,
    contribute,
    deleteGoal,
    goalProgress,
    updateGoal,
} from '../../goals.js';
import { formatEuro, formatPlain, parseAmount } from '../../money.js';
import { monthLabel, todayISO } from '../../months.js';
import {
    actionButton,
    buildField,
    element,
} from './shared.js';

const createDraft = {
    name: '',
    target: '',
    deadline: '',
    error: '',
    errorField: '',
};

const state = {
    goalId: null,
    mode: null,
    draft: null,
    closedOpen: false,
    focusId: null,
};

/** '2027-03-01' -> '1 March 2027' */
export function formatDay(dateStr) {
    return `${Number(dateStr.slice(8, 10))} ${monthLabel(dateStr.slice(0, 7))}`;
}

function textInput(value, { decimal = false } = {}) {
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.value = value;
    if (decimal) {
        input.inputMode = 'decimal';
        input.placeholder = '0.00';
    }
    return input;
}

function dateInput(value) {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = value;
    return input;
}

function showError(field, message) {
    field.error.textContent = message;
    field.error.hidden = false;
    field.control.setAttribute('aria-invalid', 'true');
    field.control.setAttribute('aria-describedby', field.error.id);
}

/**
 * Progress bar and "€450.00 of €2,000.00" line for one goal.
 * @param {object} data
 * @param {object} goal
 * @returns {HTMLElement}
 */
export function renderGoalProgress(data, goal) {
    const progress = goalProgress(data, goal.id);
    const wrap = element('div', 'goal-progress');

    const track = element('div', 'goal-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `${goal.name} progress`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(progress.percent));
    track.setAttribute('aria-valuetext', `${progress.percent}%`);
    const fill = element('div', 'goal-fill');
    fill.style.width = `${progress.percent}%`;
    track.append(fill);

    const amounts = element('p', 'goal-amounts');
    amounts.append(
        element('span', 'goal-saved', `${formatEuro(progress.savedCents)} of ${formatEuro(progress.targetCents)}`),
        element('span', 'muted', `${progress.percent}%`),
    );
    wrap.append(track, amounts);

    const notes = [];
    if (progress.remainingCents === 0) {
        notes.push('Target reached.');
    }
    if (goal.deadline !== '') {
        if (progress.perMonthCents !== null) {
            notes.push(`By ${formatDay(goal.deadline)}.`);
            if (progress.remainingCents > 0) {
                notes.push(`${formatEuro(progress.perMonthCents)} a month to finish on time.`);
            }
        } else if (progress.remainingCents > 0) {
            notes.push(`Deadline ${formatDay(goal.deadline)} has passed.`);
        }
    }
    if (notes.length > 0) {
        wrap.append(element('p', 'muted goal-note', notes.join(' ')));
    }

    return wrap;
}

function openMode(ctx, goal, mode) {
    state.goalId = goal.id;
    state.mode = mode;
    state.draft = {
        amount: '',
        date: todayISO(),
        name: goal.name,
        target: formatPlain(goal.targetCents),
        deadline: goal.deadline,
        error: '',
        errorField: '',
    };
    if (mode === 'add') {
        state.focusId = `goal-amount-${goal.id}`;
    } else if (mode === 'edit') {
        state.focusId = `goal-name-${goal.id}`;
    } else {
        state.focusId = `goal-confirm-${goal.id}`;
    }
    ctx.render();
}

function closeMode(ctx, goalId, focusAction = 'add') {
    state.goalId = null;
    state.mode = null;
    state.draft = null;
    state.focusId = goalId === null ? null : `goal-action-${focusAction}-${goalId}`;
    ctx.render();
}

function finish(ctx, message, focusId) {
    state.goalId = null;
    state.mode = null;
    state.draft = null;
    state.focusId = focusId;
    if (ctx.save() !== false) {
        ctx.toast(message);
    }
}

function renderAddMoneyForm(ctx, goal) {
    const draft = state.draft;
    const form = element('form', 'inline-form goal-form');
    form.noValidate = true;

    const amount = buildField(`goal-amount-${goal.id}`, 'Amount (€)', textInput(draft.amount, { decimal: true }));
    const date = buildField(`goal-date-${goal.id}`, 'Date', dateInput(draft.date));
    if (draft.errorField === 'amount') {
        showError(amount, draft.error);
    } else if (draft.errorField === 'date') {
        showError(date, draft.error);
    }

    const submit = element('button', 'btn btn-primary', 'Add money');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        draft.amount = amount.control.value;
        draft.date = date.control.value;
        const cents = parseAmount(draft.amount);
        if (cents === null) {
            draft.errorField = 'amount';
            draft.error = 'Enter a valid amount greater than zero.';
            state.focusId = amount.control.id;
            ctx.render();
            return;
        }
        const result = contribute(ctx.data, goal.id, cents, draft.date);
        if (!result.ok) {
            draft.errorField = 'date';
            draft.error = result.reason;
            state.focusId = date.control.id;
            ctx.render();
            return;
        }
        finish(ctx, `Added ${formatEuro(cents)} to ${goal.name}`, `goal-action-add-${goal.id}`);
    });

    form.append(
        amount.wrapper,
        date.wrapper,
        element('p', 'muted goal-form-note', 'Saved as an expense in Savings.'),
        submit,
        actionButton('btn', 'Cancel', () => closeMode(ctx, goal.id, 'add')),
    );
    return form;
}

function readGoalFields(nameField, targetField, deadlineField) {
    const name = nameField.control.value.trim();
    if (name === '') {
        return { ok: false, errorField: 'name', error: 'Enter a name.' };
    }
    const targetCents = parseAmount(targetField.control.value);
    if (targetCents === null) {
        return { ok: false, errorField: 'target', error: 'Enter a valid amount greater than zero.' };
    }
    return { ok: true, name, targetCents, deadline: deadlineField.control.value };
}

function goalFields(prefix, draft) {
    const fields = {
        name: buildField(`${prefix}-name`, 'Name', textInput(draft.name)),
        target: buildField(`${prefix}-target`, 'Target amount (€)', textInput(draft.target, { decimal: true })),
        deadline: buildField(`${prefix}-deadline`, 'Deadline (optional)', dateInput(draft.deadline)),
    };
    if (draft.errorField !== '' && fields[draft.errorField] !== undefined) {
        showError(fields[draft.errorField], draft.error);
    }
    return fields;
}

function syncDraft(draft, fields) {
    draft.name = fields.name.control.value;
    draft.target = fields.target.control.value;
    draft.deadline = fields.deadline.control.value;
}

function renderEditForm(ctx, goal) {
    const draft = state.draft;
    const form = element('form', 'inline-form goal-form');
    form.noValidate = true;
    const fields = goalFields(`goal-${goal.id}`, draft);

    const submit = element('button', 'btn btn-primary', 'Save');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        syncDraft(draft, fields);
        const read = readGoalFields(fields.name, fields.target, fields.deadline);
        const result = read.ok
            ? updateGoal(ctx.data, goal.id, { name: read.name, targetCents: read.targetCents, deadline: read.deadline })
            : read;
        if (!result.ok) {
            draft.errorField = read.ok ? 'deadline' : read.errorField;
            draft.error = result.error ?? result.reason;
            state.focusId = fields[draft.errorField].control.id;
            ctx.render();
            return;
        }
        finish(ctx, 'Goal updated', `goal-action-edit-${goal.id}`);
    });

    form.append(
        fields.name.wrapper,
        fields.target.wrapper,
        fields.deadline.wrapper,
        submit,
        actionButton('btn', 'Cancel', () => closeMode(ctx, goal.id, 'edit')),
    );
    return form;
}

function renderConfirmBox(ctx, goal, { message, confirmLabel, confirmClass, onConfirm, cancelAction }) {
    const box = element('div', 'confirm-box goal-confirm');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', message);
    const confirm = actionButton(confirmClass, confirmLabel, onConfirm);
    confirm.id = `goal-confirm-${goal.id}`;
    box.append(
        element('p', 'confirm-copy', message),
        actionButton('btn', 'Cancel', () => closeMode(ctx, goal.id, cancelAction)),
        confirm,
    );
    return box;
}

function renderCloseConfirm(ctx, goal) {
    return renderConfirmBox(ctx, goal, {
        message: 'Close this goal? It moves to Closed goals. Money you added stays in Savings.',
        confirmLabel: 'Close goal',
        confirmClass: 'btn btn-primary',
        cancelAction: 'close',
        onConfirm: () => {
            closeGoal(ctx.data, goal.id, todayISO());
            finish(ctx, 'Goal closed', 'goals-title');
        },
    });
}

function renderDeleteConfirm(ctx, goal) {
    return renderConfirmBox(ctx, goal, {
        message: 'Delete this goal? Money you added stays in Savings as normal expenses.',
        confirmLabel: 'Delete',
        confirmClass: 'btn btn-danger',
        cancelAction: 'delete',
        onConfirm: () => {
            deleteGoal(ctx.data, goal.id);
            finish(ctx, 'Goal deleted', 'goals-title');
        },
    });
}

function goalAction(ctx, goal, mode, label, className = 'btn') {
    const button = actionButton(className, label, () => {
        if (state.goalId === goal.id && state.mode === mode) {
            closeMode(ctx, goal.id, mode);
            return;
        }
        openMode(ctx, goal, mode);
    });
    button.id = `goal-action-${mode}-${goal.id}`;
    button.setAttribute('aria-expanded', String(state.goalId === goal.id && state.mode === mode));
    return button;
}

function renderOpenGoal(ctx, goal) {
    const item = element('li', 'goal-item');
    item.dataset.goalId = goal.id;
    item.append(element('h3', 'goal-name', goal.name));
    item.append(renderGoalProgress(ctx.data, goal));

    const actions = element('div', 'more-actions goal-actions');
    actions.append(
        goalAction(ctx, goal, 'add', 'Add money', 'btn btn-primary'),
        goalAction(ctx, goal, 'edit', 'Edit'),
        goalAction(ctx, goal, 'close', 'Close goal'),
        goalAction(ctx, goal, 'delete', 'Delete', 'btn btn-ghost-danger'),
    );
    item.append(actions);

    if (state.goalId === goal.id) {
        if (state.mode === 'add') {
            item.append(renderAddMoneyForm(ctx, goal));
        } else if (state.mode === 'edit') {
            item.append(renderEditForm(ctx, goal));
        } else if (state.mode === 'close') {
            item.append(renderCloseConfirm(ctx, goal));
        } else if (state.mode === 'delete') {
            item.append(renderDeleteConfirm(ctx, goal));
        }
    }
    return item;
}

function renderClosedGoal(ctx, goal) {
    const item = element('li', 'goal-item is-closed');
    item.dataset.goalId = goal.id;
    const progress = goalProgress(ctx.data, goal.id);
    item.append(
        element('h4', 'goal-name', goal.name),
        element('p', 'goal-amounts', `${formatEuro(progress.savedCents)} of ${formatEuro(progress.targetCents)}`),
        element('p', 'muted', `Closed ${formatDay(goal.closedAt)}.`),
    );
    const actions = element('div', 'more-actions goal-actions');
    actions.append(goalAction(ctx, goal, 'delete', 'Delete', 'btn btn-ghost-danger'));
    item.append(actions);
    if (state.goalId === goal.id && state.mode === 'delete') {
        item.append(renderDeleteConfirm(ctx, goal));
    }
    return item;
}

function renderCreateForm(ctx) {
    const form = element('form', 'stack goal-create-form');
    form.noValidate = true;
    form.append(element('h3', 'goal-subtitle', 'New goal'));
    const fields = goalFields('goal-new', createDraft);

    const submit = element('button', 'btn btn-primary', 'Add goal');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        syncDraft(createDraft, fields);
        const read = readGoalFields(fields.name, fields.target, fields.deadline);
        const result = read.ok
            ? addGoal(ctx.data, { name: read.name, targetCents: read.targetCents, deadline: read.deadline })
            : read;
        if (!result.ok) {
            createDraft.errorField = read.ok ? 'deadline' : read.errorField;
            createDraft.error = result.error ?? result.reason;
            state.focusId = fields[createDraft.errorField].control.id;
            ctx.render();
            return;
        }
        Object.assign(createDraft, { name: '', target: '', deadline: '', error: '', errorField: '' });
        finish(ctx, 'Goal added', `goal-action-add-${result.goal.id}`);
    });

    form.append(fields.name.wrapper, fields.target.wrapper, fields.deadline.wrapper, submit);
    return form;
}

/**
 * Settings card: list, create, edit, contribute to, close and delete goals.
 * @param {object} ctx
 * @returns {HTMLElement}
 */
export function renderGoalsSection(ctx) {
    const goals = ctx.data.goals ?? [];
    const open = goals.filter(({ closedAt }) => closedAt === '');
    const closed = goals.filter(({ closedAt }) => closedAt !== '');

    const section = element('section', 'card stack goals-section');
    section.id = 'more-goals';
    const title = element('h2', 'section-title', 'Goals');
    title.id = 'goals-title';
    title.tabIndex = -1;
    section.append(title);
    section.append(element(
        'p',
        'muted',
        'Save towards something. Money you add goes into the Savings category.',
    ));

    if (open.length === 0) {
        section.append(element('p', 'muted', 'No open goals yet.'));
    } else {
        const list = element('ul', 'goal-list');
        list.append(...open.map((goal) => renderOpenGoal(ctx, goal)));
        section.append(list);
    }

    section.append(renderCreateForm(ctx));

    if (closed.length > 0) {
        const details = element('details', 'goal-closed');
        details.open = state.closedOpen;
        details.addEventListener('toggle', () => {
            state.closedOpen = details.open;
        });
        details.append(element('summary', 'goal-closed-summary', `Closed goals (${closed.length})`));
        const list = element('ul', 'goal-list');
        list.append(...closed.map((goal) => renderClosedGoal(ctx, goal)));
        details.append(list);
        section.append(details);
    }

    if (state.focusId !== null) {
        const focusId = state.focusId;
        state.focusId = null;
        queueMicrotask(() => document.getElementById(focusId)?.focus());
    }

    return section;
}
