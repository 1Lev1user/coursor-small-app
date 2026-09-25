import { contribute } from '../goals.js';
import { formatEuro, parseAmount } from '../money.js';
import { todayISO } from '../months.js';
import { renderGoalProgress } from './settings/goals.js';

const state = {
    goalId: null,
    open: false,
    amount: '',
    error: '',
    focusId: null,
};

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

/**
 * Open goal with the nearest upcoming deadline, else the first open goal.
 * @param {object} data
 * @param {string} [today]
 * @returns {object | null}
 */
export function pickHomeGoal(data, today = todayISO()) {
    const open = (data.goals ?? []).filter(({ closedAt }) => closedAt === '');
    if (open.length === 0) {
        return null;
    }
    const upcoming = open
        .filter(({ deadline }) => deadline !== '' && deadline >= today)
        .sort((first, second) => first.deadline.localeCompare(second.deadline));
    return upcoming[0] ?? open[0];
}

function setFocus(id) {
    state.focusId = id;
}

function renderAmountForm(ctx, goal) {
    const form = element('form', 'inline-form goal-form');
    form.noValidate = true;

    const field = element('div', 'field');
    const label = element('label', '', 'Amount (€)');
    label.htmlFor = 'home-goal-amount';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.placeholder = '0.00';
    input.id = 'home-goal-amount';
    input.value = state.amount;
    const error = element('p', 'error-text', state.error);
    error.id = 'home-goal-amount-error';
    error.hidden = state.error === '';
    if (state.error !== '') {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', error.id);
    }
    field.append(label, input, error);

    const submit = element('button', 'btn btn-primary', 'Save');
    submit.type = 'submit';
    const cancel = element('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
        Object.assign(state, { open: false, amount: '', error: '' });
        setFocus('home-goal-add');
        ctx.render();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        state.amount = input.value;
        const cents = parseAmount(state.amount);
        if (cents === null) {
            state.error = 'Enter a valid amount greater than zero.';
            setFocus(input.id);
            ctx.render();
            return;
        }
        const result = contribute(ctx.data, goal.id, cents, todayISO());
        if (!result.ok) {
            state.error = result.reason;
            setFocus(input.id);
            ctx.render();
            return;
        }
        Object.assign(state, { open: false, amount: '', error: '' });
        setFocus('home-goal-add');
        if (ctx.save() !== false) {
            ctx.toast(`Added ${formatEuro(cents)} to ${goal.name}`);
        }
    });

    form.append(field, submit, cancel);
    return form;
}

/**
 * Home card for the most pressing open goal, or null when there is none.
 * @param {object} ctx
 * @returns {HTMLElement | null}
 */
export function renderGoalCard(ctx) {
    const goal = pickHomeGoal(ctx.data);
    if (goal === null) {
        return null;
    }
    if (state.goalId !== goal.id) {
        Object.assign(state, { goalId: goal.id, open: false, amount: '', error: '' });
    }

    const card = element('section', 'card stack goal-card');
    card.setAttribute('aria-labelledby', 'home-goal-title');
    const head = element('div', 'goal-card-head');
    head.append(element('p', 'goal-card-label', 'Savings goal'));
    const title = element('h2', 'goal-name', goal.name);
    title.id = 'home-goal-title';
    head.append(title);
    card.append(head, renderGoalProgress(ctx.data, goal));

    if (state.open) {
        card.append(renderAmountForm(ctx, goal));
    } else {
        const add = element('button', 'btn btn-primary goal-card-add', 'Add money');
        add.type = 'button';
        add.id = 'home-goal-add';
        add.setAttribute('aria-expanded', 'false');
        add.addEventListener('click', () => {
            state.open = true;
            setFocus('home-goal-amount');
            ctx.render();
        });
        card.append(add);
    }

    if (state.focusId !== null) {
        const focusId = state.focusId;
        state.focusId = null;
        queueMicrotask(() => document.getElementById(focusId)?.focus());
    }

    return card;
}
