import { load, save as saveToStorage, requestPersistence } from './storage.js';
import { currentMonthKey, monthKeyOf, todayISO } from './months.js';
import { parseAmount, formatEuro, formatPlain } from './money.js';
import { createId } from './model.js';
import { freezeMonthPlan } from './budget.js';
import { dueSubscriptions } from './subscriptions.js';
import { render as renderAdd, openAddPanel, addScreenTitle } from './views/add.js';
import { render as renderMonth } from './views/month.js';
import { render as renderChart } from './views/chartView.js';
import { render as renderMore } from './views/more.js';
import { render as renderSetup } from './views/setup.js';

const TOAST_MS = 2000;

const views = {
    add: { render: renderAdd },
    month: { title: 'Month', render: renderMonth },
    chart: { title: 'Chart', render: renderChart },
    more: { title: 'Settings', render: renderMore },
};

const app = {
    data: load(),
    tab: 'add',
    monthKey: currentMonthKey(),
};

const titleElement = document.getElementById('screen-title');
const viewElement = document.getElementById('view');
const tabbarElement = document.getElementById('tabbar');
const tabButtons = [...tabbarElement.querySelectorAll('[data-tab]')];

let toastTimer = null;

const duePrompt = {
    subscriptionId: null,
    amount: null,
    error: '',
    deleting: false,
};

function toast(message) {
    let node = document.getElementById('toast');

    if (node === null) {
        node = document.createElement('div');
        node.id = 'toast';
        node.className = 'toast';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        document.body.append(node);
    }

    node.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), TOAST_MS);
}

function save() {
    const saved = saveToStorage(app.data);
    if (!saved) {
        toast('Could not save to this device');
    }
    render();
    return saved;
}

function setMonthKey(key) {
    app.monthKey = key;
    render();
}

function goTo(tab, options = {}) {
    if (!app.data.settings.setupComplete) {
        return;
    }
    if (!Object.hasOwn(views, tab)) {
        return;
    }

    if (tab === 'add') {
        openAddPanel(options.panel ?? 'home');
    }

    app.tab = tab;
    render();
}

function context() {
    return {
        data: app.data,
        save,
        render,
        monthKey: app.monthKey,
        setMonthKey,
        goTo,
        toast,
    };
}

function resetDuePrompt(subscription) {
    duePrompt.subscriptionId = subscription?.id ?? null;
    duePrompt.amount = subscription === undefined
        ? null
        : formatPlain(subscription.amountCents, '.');
    duePrompt.error = '';
    duePrompt.deleting = false;
}

function matchingSubcategoryId(name) {
    const category = app.data.categories.find(({ id }) => id === 'subscriptions');
    if (category === undefined) {
        return '';
    }
    const match = category.subcategories.find((sub) => sub.name === name);
    return match?.id ?? '';
}

function removeDueOverlay() {
    document.getElementById('due-subscription-overlay')?.remove();
}

function confirmDueSubscription(subscription, amountField) {
    const amountCents = parseAmount(amountField.control.value);
    if (amountCents === null) {
        duePrompt.amount = amountField.control.value;
        duePrompt.error = 'Enter a valid amount greater than zero.';
        render();
        return;
    }

    const date = todayISO();
    const monthKey = monthKeyOf(date);
    const planWasAlreadyFrozen = Object.hasOwn(app.data.monthPlans, monthKey);
    const expense = {
        id: createId('exp'),
        categoryId: 'subscriptions',
        subcategoryId: matchingSubcategoryId(subscription.name),
        amountCents,
        note: subscription.name,
        date,
        subscriptionId: subscription.id,
    };

    app.data.expenses.push(expense);
    freezeMonthPlan(app.data, monthKey);

    if (save() === false) {
        const index = app.data.expenses.indexOf(expense);
        if (index !== -1) {
            app.data.expenses.splice(index, 1);
        }
        if (!planWasAlreadyFrozen) {
            delete app.data.monthPlans[monthKey];
        }
        duePrompt.subscriptionId = subscription.id;
        duePrompt.amount = amountField.control.value;
        duePrompt.error = '';
        duePrompt.deleting = false;
        render();
        return;
    }

    toast('Subscription logged');
}

function deleteDueSubscription(subscription) {
    const index = app.data.subscriptions.findIndex(({ id }) => id === subscription.id);
    if (index === -1) {
        resetDuePrompt();
        render();
        return;
    }

    const removed = app.data.subscriptions.splice(index, 1)[0];

    if (save() === false) {
        app.data.subscriptions.splice(index, 0, removed);
        duePrompt.subscriptionId = subscription.id;
        duePrompt.deleting = true;
        render();
        return;
    }

    toast('Subscription deleted');
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

const DUE_FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

function attachDueTrap(overlay, onEscape) {
    const nodes = [...overlay.querySelectorAll(DUE_FOCUSABLE)];
    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onEscape();
            return;
        }
        if (event.key !== 'Tab' || nodes.length === 0) {
            if (event.key === 'Tab') event.preventDefault();
            return;
        }
        const current = nodes.indexOf(document.activeElement);
        let next;
        if (current === -1) {
            next = event.shiftKey ? nodes.length - 1 : 0;
        } else if (event.shiftKey) {
            next = current === 0 ? nodes.length - 1 : current - 1;
        } else {
            next = current === nodes.length - 1 ? 0 : current + 1;
        }
        event.preventDefault();
        nodes[next].focus();
    });
}

function renderDuePrompt(subscription) {
    removeDueOverlay();

    if (duePrompt.subscriptionId !== subscription.id) {
        resetDuePrompt(subscription);
    }

    const overlay = document.createElement('div');
    overlay.id = 'due-subscription-overlay';
    overlay.className = 'due-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'due-subscription-title');

    const card = document.createElement('div');
    card.className = 'due-card stack';

    const title = document.createElement('h2');
    title.id = 'due-subscription-title';
    title.className = 'section-title';
    title.textContent = 'Subscription due';

    const name = document.createElement('p');
    name.className = 'due-name';
    name.textContent = subscription.name;

    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `Usual ${formatEuro(subscription.amountCents)} · day ${subscription.dayOfMonth}`;

    if (duePrompt.deleting) {
        const confirmBox = document.createElement('div');
        confirmBox.className = 'confirm-box';
        confirmBox.setAttribute('role', 'group');

        const copy = document.createElement('p');
        copy.className = 'confirm-copy';
        copy.textContent = `Delete ${subscription.name}? Past charges stay in your history.`;

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
            duePrompt.deleting = false;
            render();
        });

        const confirmDelete = document.createElement('button');
        confirmDelete.type = 'button';
        confirmDelete.className = 'btn btn-danger';
        confirmDelete.textContent = 'Delete';
        confirmDelete.addEventListener('click', () => {
            deleteDueSubscription(subscription);
        });

        confirmBox.append(copy, cancel, confirmDelete);
        card.append(title, name, meta, confirmBox);
        overlay.append(card);
        document.body.append(overlay);
        attachDueTrap(overlay, () => {
            if (!duePrompt.deleting) return;
            duePrompt.deleting = false;
            render();
        });
        confirmDelete.focus();
        return;
    }

    const form = document.createElement('form');
    form.className = 'stack';
    form.noValidate = true;

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.value = duePrompt.amount ?? formatPlain(subscription.amountCents, '.');
    const amountField = buildField('due-subscription-amount', 'Amount (EUR)', amountInput);
    if (duePrompt.error !== '') {
        setError(amountField, duePrompt.error);
    }
    amountInput.addEventListener('input', () => {
        duePrompt.amount = amountInput.value;
        duePrompt.error = '';
    });

    const actions = document.createElement('div');
    actions.className = 'due-actions';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.className = 'btn btn-primary';
    confirmButton.textContent = 'Confirm';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-danger';
    deleteButton.textContent = 'Delete subscription';
    deleteButton.addEventListener('click', () => {
        duePrompt.amount = amountInput.value;
        duePrompt.deleting = true;
        duePrompt.error = '';
        render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        duePrompt.amount = amountInput.value;
        confirmDueSubscription(subscription, amountField);
    });

    actions.append(confirmButton, deleteButton);
    form.append(amountField.wrapper, actions);
    card.append(title, name, meta, form);
    overlay.append(card);
    document.body.append(overlay);
    attachDueTrap(overlay, () => {
        if (!duePrompt.deleting) return;
        duePrompt.deleting = false;
        render();
    });
    amountInput.focus();
    amountInput.select();
}

function render() {
    const setupComplete = app.data.settings.setupComplete === true;
    document.body.classList.toggle('is-setup', !setupComplete);
    tabbarElement.hidden = !setupComplete;

    for (const button of tabButtons) {
        button.disabled = !setupComplete;
    }

    viewElement.replaceChildren();

    if (!setupComplete) {
        removeDueOverlay();
        resetDuePrompt();
        titleElement.textContent = 'Setup';
        document.title = 'Setup - My Expenses';
        renderSetup(viewElement, context());
        return;
    }

    const view = views[app.tab];

    titleElement.textContent = app.tab === 'add' ? addScreenTitle() : view.title;
    document.title = `${titleElement.textContent} - My Expenses`;

    for (const button of tabButtons) {
        const isActive = button.dataset.tab === app.tab;
        button.classList.toggle('is-active', isActive);
        if (isActive) {
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    }

    view.render(viewElement, context());

    const due = dueSubscriptions(app.data);
    if (due.length > 0) {
        renderDuePrompt(due[0]);
    } else {
        removeDueOverlay();
        resetDuePrompt();
    }
}

tabbarElement.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (button !== null && !button.disabled) {
        goTo(button.dataset.tab);
    }
});

requestPersistence();

if (
    (location.protocol === 'http:' || location.protocol === 'https:')
    && 'serviceWorker' in navigator
) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
