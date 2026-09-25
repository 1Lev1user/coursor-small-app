import { parseAmount, formatEuro, formatPlain } from '../../money.js';
import { SUBSCRIPTIONS_ID, createId } from '../../model.js';
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
    shareLabel,
    openCategoryPlanEditor,
    renderCategoryPlanEditor,
} from './shared.js';

const addSubscriptionDraft = {
    name: '',
    amount: '',
    dayOfMonth: '',
    errorField: '',
    error: '',
};

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

function openEditSubscription(ctx, subscription) {
    closeTransientUi();
    state.editSubscriptionId = subscription.id;
    state.subscriptionEditDraft = {
        name: subscription.name,
        amount: formatPlain(subscription.amountCents),
        dayOfMonth: String(subscription.dayOfMonth),
    };
    state.subscriptionEditError = '';
    state.focusSubscriptionEditError = false;
    ctx.render();
}

function saveSubscriptionEdit(ctx, subscription, fields) {
    const draft = state.subscriptionEditDraft;
    state.subscriptionEditError = '';

    for (const field of Object.values(fields)) {
        clearError(field);
    }

    const name = fields.name.control.value.trim();
    const amountCents = parseAmount(fields.amount.control.value);
    const dayOfMonth = parseDayOfMonth(fields.day.control.value);
    let firstInvalid = null;

    draft.name = fields.name.control.value;
    draft.amount = fields.amount.control.value;
    draft.dayOfMonth = fields.day.control.value;

    if (name === '') {
        setError(fields.name, 'Enter a name.');
        firstInvalid ??= fields.name.control;
    }
    if (amountCents === null) {
        setError(fields.amount, 'Enter a valid amount greater than zero.');
        firstInvalid ??= fields.amount.control;
    }
    if (dayOfMonth === null) {
        setError(fields.day, 'Enter a day from 1 to 31.');
        firstInvalid ??= fields.day.control;
    }

    if (firstInvalid !== null) {
        firstInvalid.focus();
        return;
    }

    const snapshot = {
        name: subscription.name,
        amountCents: subscription.amountCents,
        dayOfMonth: subscription.dayOfMonth,
    };

    subscription.name = name;
    subscription.amountCents = amountCents;
    subscription.dayOfMonth = dayOfMonth;

    if (ctx.save() === false) {
        subscription.name = snapshot.name;
        subscription.amountCents = snapshot.amountCents;
        subscription.dayOfMonth = snapshot.dayOfMonth;
        state.subscriptionEditError = 'Could not save to this device. Nothing was changed. Try again.';
        state.focusSubscriptionEditError = true;
        ctx.render();
        return;
    }

    closeTransientUi();
    ctx.render();
    ctx.toast('Subscription updated');
}

function renderSubscriptionEditor(ctx, subscription) {
    const draft = state.subscriptionEditDraft;

    const form = element('form', 'inline-form entry-edit-form stack');
    form.noValidate = true;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.required = true;
    nameInput.value = draft.name;
    const nameField = buildField(`edit-subscription-name-${subscription.id}`, 'Name', nameInput);

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.required = true;
    amountInput.value = draft.amount;
    const amountField = buildField(
        `edit-subscription-amount-${subscription.id}`,
        'Usual amount (EUR)',
        amountInput,
    );

    const dayInput = document.createElement('input');
    dayInput.type = 'number';
    dayInput.min = '1';
    dayInput.max = '31';
    dayInput.inputMode = 'numeric';
    dayInput.required = true;
    dayInput.value = draft.dayOfMonth;
    const dayField = buildField(
        `edit-subscription-day-${subscription.id}`,
        'Day of month',
        dayInput,
    );

    const formError = element('p', 'error-text');
    formError.id = `edit-subscription-form-error-${subscription.id}`;
    formError.setAttribute('role', 'alert');
    formError.tabIndex = -1;
    formError.hidden = true;

    nameInput.addEventListener('input', () => {
        draft.name = nameInput.value;
        clearError(nameField);
    });
    amountInput.addEventListener('input', () => {
        draft.amount = amountInput.value;
        clearError(amountField);
    });
    dayInput.addEventListener('input', () => {
        draft.dayOfMonth = dayInput.value;
        clearError(dayField);
    });

    const saveButton = element('button', 'btn btn-primary', 'Save');
    saveButton.type = 'submit';
    const cancelButton = actionButton('btn', 'Cancel', () => {
        closeTransientUi();
        ctx.render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveSubscriptionEdit(ctx, subscription, {
            name: nameField,
            amount: amountField,
            day: dayField,
        });
    });

    form.append(
        nameField.wrapper,
        amountField.wrapper,
        dayField.wrapper,
        formError,
        saveButton,
        cancelButton,
    );

    if (state.subscriptionEditError !== '') {
        formError.textContent = state.subscriptionEditError;
        formError.hidden = false;
    }

    queueMicrotask(() => {
        if (state.focusSubscriptionEditError) {
            state.focusSubscriptionEditError = false;
            formError.focus();
        } else {
            nameInput.focus();
        }
    });

    return form;
}

function renderSubscriptionRow(ctx, subscription) {
    const item = element('article', 'subscription-item');

    if (state.confirmSubscriptionId === subscription.id) {
        item.append(renderConfirm(
            `Delete ${subscription.name}? Past charges stay in your history.`,
            () => confirmDeleteSubscription(ctx, subscription),
            () => {
                state.confirmSubscriptionId = null;
                ctx.render();
            },
        ));
        return item;
    }

    if (state.editSubscriptionId === subscription.id && state.subscriptionEditDraft !== null) {
        item.append(renderSubscriptionEditor(ctx, subscription));
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
        actionButton('btn btn-ghost', 'Edit', () => {
            openEditSubscription(ctx, subscription);
        }),
        actionButton('btn btn-ghost-danger', 'Delete', () => {
            closeTransientUi();
            state.confirmSubscriptionId = subscription.id;
            ctx.render();
        }),
    );
    head.append(actions);
    item.append(head);
    return item;
}

export function renderSubscriptionsSection(ctx, plan) {
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

        if (state.editPlanCategoryId === category.id) {
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
            + 'It only reminds you. It does not add income.',
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
