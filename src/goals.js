import { createId, SAVINGS_ID } from './model.js';
import { todayISO } from './months.js';

function monthsBetweenInclusive(fromMonthKey, toMonthKey) {
    const [fromYear, fromMonth] = fromMonthKey.split('-').map(Number);
    const [toYear, toMonth] = toMonthKey.split('-').map(Number);
    return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
}

function ensureGoals(data) {
    if (!Array.isArray(data.goals)) {
        data.goals = [];
    }
    return data.goals;
}

function validateGoalFields({ name, targetCents, deadline }) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (trimmedName === '') {
        return { ok: false, reason: 'Goal name is required.' };
    }
    if (!Number.isInteger(targetCents) || targetCents <= 0) {
        return { ok: false, reason: 'Target amount must be a positive number.' };
    }
    if (deadline !== undefined && deadline !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
        return { ok: false, reason: 'Deadline must be a date or empty.' };
    }

    return { ok: true, name: trimmedName };
}

/**
 * @param {object} data
 * @param {{ name: string, targetCents: number, deadline?: string }} goal
 * @param {Date} [now]
 * @returns {{ ok: true, goal: object } | { ok: false, reason: string }}
 */
export function addGoal(data, goal, now = new Date()) {
    const validated = validateGoalFields(goal);
    if (!validated.ok) {
        return validated;
    }

    const goals = ensureGoals(data);
    const record = {
        id: createId('goal'),
        name: validated.name,
        targetCents: goal.targetCents,
        deadline: goal.deadline ?? '',
        createdAt: todayISO(now),
        closedAt: '',
    };
    goals.push(record);

    return { ok: true, goal: record };
}

/**
 * @param {object} data
 * @param {string} id
 * @param {{ name?: string, targetCents?: number, deadline?: string }} patch
 * @returns {{ ok: true, goal: object } | { ok: false, reason: string }}
 */
export function updateGoal(data, id, patch) {
    const goals = ensureGoals(data);
    const goal = goals.find((entry) => entry.id === id);
    if (!goal) {
        return { ok: false, reason: 'Goal does not exist.' };
    }

    const merged = {
        name: patch.name ?? goal.name,
        targetCents: patch.targetCents ?? goal.targetCents,
        deadline: patch.deadline ?? goal.deadline,
    };
    const validated = validateGoalFields(merged);
    if (!validated.ok) {
        return validated;
    }

    goal.name = validated.name;
    goal.targetCents = merged.targetCents;
    goal.deadline = merged.deadline;

    return { ok: true, goal };
}

/**
 * @param {object} data
 * @param {string} id
 * @param {string} [date]
 * @returns {{ ok: true, goal: object } | { ok: false, reason: string }}
 */
export function closeGoal(data, id, date = todayISO()) {
    const goals = ensureGoals(data);
    const goal = goals.find((entry) => entry.id === id);
    if (!goal) {
        return { ok: false, reason: 'Goal does not exist.' };
    }

    goal.closedAt = date;
    return { ok: true, goal };
}

/**
 * Removes the goal and clears goalId on its expenses. The money stays saved
 * (expenses are not touched otherwise).
 * @param {object} data
 * @param {string} id
 * @returns {{ ok: true, unlinkedCount: number } | { ok: false, reason: string }}
 */
export function deleteGoal(data, id) {
    const goals = ensureGoals(data);
    const index = goals.findIndex((entry) => entry.id === id);
    if (index === -1) {
        return { ok: false, reason: 'Goal does not exist.' };
    }

    goals.splice(index, 1);
    let unlinkedCount = 0;
    for (const expense of data.expenses) {
        if (expense.goalId === id) {
            expense.goalId = '';
            unlinkedCount += 1;
        }
    }

    return { ok: true, unlinkedCount };
}

/**
 * @param {object} data
 * @param {string} goalId
 * @param {Date} [now]
 * @returns {{ savedCents: number, targetCents: number, percent: number, remainingCents: number, monthsLeft: number | null, perMonthCents: number | null } | null}
 */
export function goalProgress(data, goalId, now = new Date()) {
    const goal = (data.goals ?? []).find((entry) => entry.id === goalId);
    if (!goal) {
        return null;
    }

    const savedCents = data.expenses
        .filter((expense) => expense.goalId === goalId)
        .reduce((total, expense) => total + expense.amountCents, 0);

    const targetCents = goal.targetCents;
    const remainingCents = Math.max(0, targetCents - savedCents);
    const percent = targetCents > 0
        ? Math.min(100, Math.round((savedCents / targetCents) * 100))
        : 0;

    let monthsLeft = null;
    const todayStr = todayISO(now);
    if (goal.deadline && goal.deadline >= todayStr) {
        const currentMonthKey = todayStr.slice(0, 7);
        const deadlineMonthKey = goal.deadline.slice(0, 7);
        monthsLeft = Math.max(1, monthsBetweenInclusive(currentMonthKey, deadlineMonthKey));
    }

    const perMonthCents = monthsLeft === null
        ? null
        : Math.ceil(remainingCents / monthsLeft);

    return {
        savedCents,
        targetCents,
        percent,
        remainingCents,
        monthsLeft,
        perMonthCents,
    };
}

/**
 * Adds an expense in the Savings category, tagged with this goal.
 * @param {object} data
 * @param {string} goalId
 * @param {number} amountCents
 * @param {string} date
 * @returns {{ ok: true, expense: object } | { ok: false, reason: string }}
 */
export function contribute(data, goalId, amountCents, date) {
    const goal = (data.goals ?? []).find((entry) => entry.id === goalId);
    if (!goal) {
        return { ok: false, reason: 'Goal does not exist.' };
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return { ok: false, reason: 'Amount must be a positive number.' };
    }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { ok: false, reason: 'Date is required.' };
    }

    const expense = {
        id: createId('exp'),
        categoryId: SAVINGS_ID,
        subcategoryId: '',
        amountCents,
        note: `Goal: ${goal.name}`,
        date,
        currency: 'EUR',
        originalAmountCents: amountCents,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId,
    };
    data.expenses.push(expense);

    return { ok: true, expense };
}
