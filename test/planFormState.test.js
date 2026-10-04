import test from 'node:test';
import assert from 'node:assert/strict';
import { planDraftDirty, needsZeroBudgetConfirm } from '../src/views/settings/plan.js';

const saved = { monthlyBudgetCents: 100000 };

test('planDraftDirty is false when the budget draft is null or missing', () => {
    assert.equal(planDraftDirty(saved, { budget: null }), false);
    assert.equal(planDraftDirty(saved, { budget: undefined }), false);
    assert.equal(planDraftDirty(saved, {}), false);
});

test('planDraftDirty compares money by cents when the text parses', () => {
    assert.equal(planDraftDirty(saved, { budget: '1000' }), false);
    assert.equal(planDraftDirty(saved, { budget: '1000.00' }), false);
    assert.equal(planDraftDirty(saved, { budget: '1000.50' }), true);
    assert.equal(planDraftDirty(saved, { budget: '0' }), true);
});

test('planDraftDirty treats text that does not parse as a change', () => {
    assert.equal(planDraftDirty(saved, { budget: '' }), true);
    assert.equal(planDraftDirty(saved, { budget: 'abc' }), true);
});

test('planDraftDirty: a typed 0 against a saved 0 is not a change', () => {
    assert.equal(planDraftDirty({ monthlyBudgetCents: 0 }, { budget: '0' }), false);
});

test('needsZeroBudgetConfirm is true only when a positive budget becomes 0', () => {
    assert.equal(needsZeroBudgetConfirm(100000, 0), true);
    assert.equal(needsZeroBudgetConfirm(0, 0), false);
    assert.equal(needsZeroBudgetConfirm(100000, 100), false);
    assert.equal(needsZeroBudgetConfirm(0, 500), false);
    assert.equal(needsZeroBudgetConfirm(undefined, 0), false);
});
