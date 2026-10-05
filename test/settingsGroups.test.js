import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SETTINGS_GROUPS,
    SECTION_RENDERERS,
    groupForSection,
    activeSectionIds,
    visibleTitleIds,
    groupSummary,
} from '../src/views/more.js';
import { renderProfileSection } from '../src/views/settings/plan.js';
import { defaultData } from '../src/model.js';
import { formatEuro } from '../src/money.js';

const NOW = new Date(2026, 9, 4);

const GROUP_TABLE = [
    ['money', 'Money', ['more-balance']],
    ['income', 'Income', ['more-income-sources', 'more-income']],
    ['budget', 'Monthly budget', ['more-plan']],
    ['backup', 'Backup', ['more-backup']],
    ['categories', 'Categories and limits', ['more-categories']],
    ['subscriptions', 'Subscriptions', ['more-subscriptions']],
    ['templates', 'Quick add', ['more-templates']],
    ['goals', 'Goals', ['more-goals']],
    ['advanced', 'Bank import (advanced)', ['more-import', 'more-rules', 'more-layouts']],
    ['profile', 'Profile and about', ['more-profile', 'more-rights']],
];

const group = (id) => SETTINGS_GROUPS.find((item) => item.id === id);

function dataWith(changes = {}, settings = {}) {
    const data = defaultData();
    Object.assign(data, changes);
    Object.assign(data.settings, settings);
    return data;
}

const oneExpense = [{ id: 'e1' }];

test('every section id belongs to exactly one group', () => {
    const seen = new Map();
    for (const item of SETTINGS_GROUPS) {
        for (const id of item.sectionIds) {
            assert.ok(!seen.has(id), `${id} is in two groups`);
            seen.set(id, item.id);
        }
    }
    for (const [id, groupId] of seen) {
        assert.equal(groupForSection(id), groupId);
    }
    assert.equal(groupForSection('more-layouts'), 'advanced');
    assert.equal(groupForSection('more-plan'), 'budget');
    assert.equal(groupForSection('more-balance'), 'money');
    assert.equal(groupForSection('more-templates'), 'templates');
    assert.equal(groupForSection('nope'), null);
});

test('every renderer key is listed in a group and is a function', () => {
    for (const [id, renderer] of Object.entries(SECTION_RENDERERS)) {
        assert.notEqual(groupForSection(id), null, `${id} is not in a group`);
        assert.equal(typeof renderer, 'function');
    }
    assert.ok('more-profile' in SECTION_RENDERERS);
});

test('groups keep the decided order, titles and sections', () => {
    const ids = GROUP_TABLE.map(([id]) => id);
    const listed = SETTINGS_GROUPS.filter((item) => ids.includes(item.id));
    assert.deepEqual(listed.map((item) => item.id), ids);
    for (const [id, title, sectionIds] of GROUP_TABLE) {
        assert.equal(group(id).title, title);
        assert.deepEqual(group(id).sectionIds, sectionIds);
    }
    assert.deepEqual(group('income').hiddenTitleIds, ['more-income']);
});

test('activeSectionIds skips sections without a renderer', () => {
    const renderers = {
        'more-import': () => null,
        'more-rules': () => null,
        'more-layouts': () => null,
    };
    assert.deepEqual(activeSectionIds(group('money'), renderers), []);
    assert.deepEqual(activeSectionIds(group('templates'), renderers), []);
    assert.deepEqual(
        activeSectionIds(group('advanced'), renderers),
        ['more-import', 'more-rules', 'more-layouts'],
    );
});

test('visibleTitleIds hides the title of a lone section and the hidden ids', () => {
    assert.deepEqual(
        visibleTitleIds(group('income'), ['more-income-sources', 'more-income']),
        ['more-income-sources'],
    );
    assert.deepEqual(visibleTitleIds(group('income'), ['more-income']), []);
    assert.deepEqual(
        visibleTitleIds(group('advanced'), ['more-import', 'more-rules', 'more-layouts']),
        ['more-import', 'more-rules', 'more-layouts'],
    );
    assert.deepEqual(
        visibleTitleIds(group('profile'), ['more-profile', 'more-rights']),
        ['more-profile', 'more-rights'],
    );
});

test('backup summary', () => {
    const summary = (data) => groupSummary('backup', data, NOW);
    assert.deepEqual(summary(defaultData()), { text: 'Nothing to back up yet', warn: false });
    assert.deepEqual(
        summary(dataWith({ expenses: oneExpense }, { lastBackupISO: null })),
        { text: 'No backup yet', warn: true },
    );
    const withBackup = (lastBackupISO) => summary(
        dataWith({ expenses: oneExpense }, { lastBackupISO }),
    );
    assert.deepEqual(withBackup('2026-10-04'), { text: 'Last backup today', warn: false });
    assert.deepEqual(withBackup('2026-10-03'), { text: 'Last backup yesterday', warn: false });
    assert.deepEqual(withBackup('2026-08-01'), { text: 'Last backup 64 days ago', warn: true });
    assert.deepEqual(withBackup('2026-09-04'), { text: 'Last backup 30 days ago', warn: false });
    assert.deepEqual(withBackup('2026-09-03'), { text: 'Last backup 31 days ago', warn: true });
    assert.deepEqual(withBackup('2026-10-20'), { text: 'Last backup today', warn: false });
});

test('budget summary', () => {
    const data = dataWith({}, { monthlyBudgetCents: 100000 });
    assert.deepEqual(
        groupSummary('budget', data, NOW),
        { text: `${formatEuro(100000)} a month`, warn: false },
    );
    assert.equal(
        groupSummary('budget', dataWith({}, { monthlyBudgetCents: 0 }), NOW).text,
        'No budget set',
    );
});

test('income summary', () => {
    const text = (count) => groupSummary(
        'income',
        dataWith({ incomes: Array.from({ length: count }, (_, i) => ({ id: `i${i}` })) }),
        NOW,
    ).text;
    assert.equal(text(0), 'No income entries yet');
    assert.equal(text(1), '1 income entry');
    assert.equal(text(3), '3 income entries');
});

test('categories summary', () => {
    const data = defaultData();
    assert.equal(groupSummary('categories', data, NOW).text, '4 categories');
    data.categories = data.categories.slice(0, 1);
    assert.equal(groupSummary('categories', data, NOW).text, '1 category');
});

test('subscriptions summary', () => {
    assert.equal(groupSummary('subscriptions', defaultData(), NOW).text, 'None yet');
    const data = dataWith({ subscriptions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    assert.equal(groupSummary('subscriptions', data, NOW).text, '3 recurring');
});

test('goals summary counts closed by closedAt', () => {
    const data = dataWith({
        goals: [{ id: 'g1', closedAt: '' }, { id: 'g2', closedAt: '2026-09-01' }],
    });
    assert.equal(groupSummary('goals', data, NOW).text, '1 open · 1 closed');
    const open = dataWith({ goals: [{ id: 'g1', closedAt: '' }] });
    assert.equal(groupSummary('goals', open, NOW).text, '1 open · 0 closed');
});

test('advanced summary treats a missing array as empty', () => {
    const data = dataWith({ imports: [{ id: 'a' }, { id: 'b' }], rules: new Array(14).fill({}) });
    assert.equal(groupSummary('advanced', data, NOW).text, '2 past imports · 14 rules');
    const missing = defaultData();
    delete missing.imports;
    delete missing.rules;
    assert.equal(groupSummary('advanced', missing, NOW).text, '0 past imports · 0 rules');
});

test('profile summary', () => {
    assert.equal(
        groupSummary('profile', dataWith({}, { userName: 'Tess' }), NOW).text,
        'Tess · Rights and privacy',
    );
    assert.equal(
        groupSummary('profile', dataWith({}, { userName: '' }), NOW).text,
        'Name not set · Rights and privacy',
    );
});

test('unknown and slot groups give an empty summary', () => {
    const empty = { text: '', warn: false };
    assert.deepEqual(groupSummary('nope', defaultData(), NOW), empty);
    assert.deepEqual(groupSummary('money', defaultData(), NOW), empty);
});

test('renderProfileSection is exported', () => {
    assert.equal(typeof renderProfileSection, 'function');
});
