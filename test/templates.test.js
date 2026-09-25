import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { addTemplate, deleteTemplate, templateToExpense } from '../src/templates.js';

test('addTemplate requires a trimmed non-empty name up to 40 characters', () => {
    const data = defaultData();

    assert.equal(addTemplate(data, { name: '', amountCents: 500 }).ok, false);
    assert.equal(addTemplate(data, { name: '   ', amountCents: 500 }).ok, false);
    assert.equal(addTemplate(data, { name: 'x'.repeat(41), amountCents: 500 }).ok, false);

    const result = addTemplate(data, { name: '  Coffee  ', categoryId: 'random', amountCents: 350 });
    assert.equal(result.ok, true);
    assert.equal(result.template.name, 'Coffee');
    assert.equal(data.templates.length, 1);
    assert.ok(result.template.id.startsWith('tpl_'));
});

test('addTemplate requires a positive integer amount', () => {
    const data = defaultData();

    for (const amountCents of [0, -100, 1.5, NaN, '500']) {
        assert.equal(addTemplate(data, { name: 'Coffee', amountCents }).ok, false);
    }
    assert.equal(data.templates?.length ?? 0, 0);
});

test('deleteTemplate removes an existing template and rejects an unknown id', () => {
    const data = defaultData();
    const { template } = addTemplate(data, { name: 'Coffee', amountCents: 350 });

    assert.equal(deleteTemplate(data, 'missing').ok, false);
    assert.equal(deleteTemplate(data, template.id).ok, true);
    assert.equal(data.templates.length, 0);
});

test('templateToExpense builds a v2-shaped draft defaulting to the given date', () => {
    const template = {
        id: 'tpl_1',
        name: 'Coffee',
        categoryId: 'random',
        subcategoryId: 'eating-out',
        amountCents: 350,
        note: 'Morning coffee',
    };

    const draft = templateToExpense(template, '2026-09-20');

    assert.deepEqual(draft, {
        categoryId: 'random',
        subcategoryId: 'eating-out',
        amountCents: 350,
        note: 'Morning coffee',
        date: '2026-09-20',
        currency: 'EUR',
        originalAmountCents: 350,
        refund: false,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: '',
    });
});

test('templateToExpense defaults the date to today', () => {
    const draft = templateToExpense({ categoryId: 'random', amountCents: 100 });
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(draft.date, today);
});
