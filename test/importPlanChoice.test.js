import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import {
    buildImport,
    applyImport,
} from '../src/import/core.js';

function row(date, amountCents, direction, description, extra = {}) {
    return statementRow({ date, amountCents, direction, description, ...extra });
}

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

function expenseDecision(categoryId = 'necessary', subcategoryId = 'groceries', extra = {}) {
    return { include: true, kind: 'expense', categoryId, subcategoryId, incomeCategoryId: '', remember: false, ...extra };
}

test('Choose a plan for past month when past month rows exist with no plan choice', () => {
    const data = freshData();
    const rows = [
        row('2026-09-05', 1000, 'out', 'September expense'),
    ];
    const decisions = rows.map(() => expenseDecision());

    // now is October 15, 2026 - a later month than September
    const now = new Date(2026, 9, 15, 12);
    const built = buildImport(data, decisions, { rows, now });

    // Expect planChoices to require 2026-09
    assert.ok(built.planChoices.includes('2026-09'));

    // Apply without providing plan choice for 2026-09
    const result = applyImport(data, built, {});

    // Should fail with specific reason
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'Choose a plan for 2026-09.');
    assert.equal(result.errors[0].monthKey, '2026-09');
    assert.equal(result.errors[0].reason, 'Plan choice is missing.');

    // Data should remain unchanged
    assert.equal(data.expenses.length, 0);
    assert.deepEqual(data.monthPlans, {});
});

test('Import succeeds when rows and now are in the same month', () => {
    const data = freshData();
    data.settings.monthlyBudgetCents = 200000;
    const rows = [
        row('2026-09-05', 1000, 'out', 'September expense'),
    ];
    const decisions = rows.map(() => expenseDecision());

    // now is September 25, 2026 - same month as row
    const now = new Date(2026, 8, 25, 12);
    const built = buildImport(data, decisions, { rows, now });

    // Current month should not require a plan choice
    assert.ok(!built.planChoices.includes('2026-09'));

    // Apply with empty plan choices (not needed for current month)
    const result = applyImport(data, built, {});

    // Should succeed
    assert.equal(result.ok, true);
    assert.ok(data.expenses.length > 0);
});
