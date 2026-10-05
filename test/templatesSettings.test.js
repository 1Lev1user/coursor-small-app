import test from 'node:test';
import assert from 'node:assert/strict';
import { addTemplate, updateTemplate } from '../src/templates.js';
import { defaultData } from '../src/model.js';
import {
    SETTINGS_GROUPS,
    SECTION_RENDERERS,
    activeSectionIds,
    visibleTitleIds,
    groupSummary,
} from '../src/views/more.js';

const NOW = new Date(2026, 9, 4);

function dataWithTemplate() {
    const data = defaultData();
    const added = addTemplate(data, {
        name: 'Coffee',
        categoryId: 'cat-food',
        subcategoryId: 'sub-1',
        amountCents: 350,
        note: 'oat milk',
    });
    return { data, record: added.template };
}

const templatesGroup = () => SETTINGS_GROUPS.find(({ id }) => id === 'templates');

test('updateTemplate renames and re-prices, keeping the other fields', () => {
    const { data, record } = dataWithTemplate();
    const before = { ...record };
    const result = updateTemplate(data, record.id, { name: '  Tea  ', amountCents: 275 });
    assert.equal(result.ok, true);
    assert.equal(result.template, record);
    assert.deepEqual(record, { ...before, name: 'Tea', amountCents: 275 });
});

test('updateTemplate with only one field keeps the other', () => {
    const { data, record } = dataWithTemplate();
    assert.equal(updateTemplate(data, record.id, { name: 'Latte' }).ok, true);
    assert.deepEqual([record.name, record.amountCents], ['Latte', 350]);
    assert.equal(updateTemplate(data, record.id, { amountCents: 400 }).ok, true);
    assert.deepEqual([record.name, record.amountCents], ['Latte', 400]);
});

test('updateTemplate refuses bad values and leaves the record untouched', () => {
    const { data, record } = dataWithTemplate();
    const snapshot = structuredClone(record);
    const bad = [
        { name: '' },
        { name: '   ' },
        { name: 'x'.repeat(41) },
        { amountCents: 0 },
        { amountCents: 1.5 },
        { amountCents: -5 },
        { amountCents: Number.NaN },
        { amountCents: '500' },
    ];
    for (const patch of bad) {
        const result = updateTemplate(data, record.id, patch);
        assert.equal(result.ok, false, JSON.stringify(patch));
        assert.equal(typeof result.reason, 'string');
        assert.deepEqual(record, snapshot, JSON.stringify(patch));
    }
    assert.equal(updateTemplate(data, record.id, { name: 'x'.repeat(40) }).ok, true);
});

test('updateTemplate gives the unknown-id reason, also without a templates list', () => {
    const { data } = dataWithTemplate();
    const missing = { ok: false, reason: 'Template does not exist.' };
    assert.deepEqual(updateTemplate(data, 'nope', { name: 'A' }), missing);
    const legacy = defaultData();
    delete legacy.templates;
    assert.deepEqual(updateTemplate(legacy, 'nope', { name: 'A' }), missing);
    assert.equal('templates' in legacy, false);
});

test('updateTemplate does not change category or note', () => {
    const { data, record } = dataWithTemplate();
    updateTemplate(data, record.id, { name: 'Tea', categoryId: 'other', note: 'changed' });
    assert.equal(record.categoryId, 'cat-food');
    assert.equal(record.note, 'oat milk');
});

test('groupSummary counts templates', () => {
    const data = defaultData();
    const summary = () => groupSummary('templates', data, NOW);
    assert.deepEqual(summary(), { text: 'None yet', warn: false });
    for (const count of [1, 3]) {
        while (data.templates.length < count) {
            addTemplate(data, { name: `T${data.templates.length}`, categoryId: 'c', amountCents: 100 });
        }
        assert.deepEqual(summary(), { text: count === 1 ? '1 template' : '3 templates', warn: false });
    }
    delete data.templates;
    assert.equal(summary().text, 'None yet');
});

test('the templates group is filled and keeps its place', () => {
    assert.equal(typeof SECTION_RENDERERS['more-templates'], 'function');
    assert.deepEqual(activeSectionIds(templatesGroup()), ['more-templates']);
    assert.deepEqual(visibleTitleIds(templatesGroup(), ['more-templates']), []);
    const ids = SETTINGS_GROUPS.map(({ id }) => id);
    assert.equal(ids.indexOf('templates'), ids.indexOf('subscriptions') + 1);
    assert.equal(ids.indexOf('templates'), ids.indexOf('goals') - 1);
});
