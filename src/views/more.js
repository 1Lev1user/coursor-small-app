import { resolvePlan } from '../budget.js';
import { formatEuro } from '../money.js';
import { todayISO } from '../months.js';
import { closeTransientUi, element, state } from './settings/shared.js';
import { renderPlanSection, renderProfileSection } from './settings/plan.js';
import { renderIncomeSection } from './settings/income.js';
import { renderIncomeSourcesSection } from './settings/incomeSources.js';
import { renderSubscriptionsSection } from './settings/subscriptions.js';
import { renderTemplatesSection } from './settings/templates.js';
import { renderCategoriesSection, userCategories } from './settings/categories.js';
import { renderBackupReminder, renderBackupSection } from './settings/backup.js';
import { renderRightsSection } from './settings/rights.js';
import { renderGoalsSection } from './settings/goals.js';
import { moneySummary, renderBalanceSection } from './settings/balance.js';
import {
    renderImportSection,
    renderRulesSection,
    renderLayoutsSection,
} from './settings/importSettings.js';

export const SETTINGS_GROUPS = [
    { id: 'money', title: 'Money', sectionIds: ['more-balance'] },
    {
        id: 'income',
        title: 'Income',
        sectionIds: ['more-income-sources', 'more-income'],
        hiddenTitleIds: ['more-income'],
    },
    { id: 'budget', title: 'Monthly budget', sectionIds: ['more-plan'] },
    { id: 'backup', title: 'Backup', sectionIds: ['more-backup'] },
    { id: 'categories', title: 'Categories and limits', sectionIds: ['more-categories'] },
    { id: 'subscriptions', title: 'Subscriptions', sectionIds: ['more-subscriptions'] },
    { id: 'templates', title: 'Quick add', sectionIds: ['more-templates'] },
    { id: 'goals', title: 'Goals', sectionIds: ['more-goals'] },
    {
        id: 'advanced',
        title: 'Bank import (advanced)',
        sectionIds: ['more-import', 'more-rules', 'more-layouts'],
    },
    { id: 'profile', title: 'Profile and about', sectionIds: ['more-profile', 'more-rights'] },
];

export const SECTION_RENDERERS = {
    'more-balance': (ctx) => renderBalanceSection(ctx),
    'more-plan': (ctx) => renderPlanSection(ctx),
    'more-income-sources': (ctx) => renderIncomeSourcesSection(ctx),
    'more-income': (ctx) => renderIncomeSection(ctx),
    'more-subscriptions': (ctx, plan) => renderSubscriptionsSection(ctx, plan),
    'more-templates': (ctx) => renderTemplatesSection(ctx),
    'more-categories': (ctx, plan) => renderCategoriesSection(ctx, plan),
    'more-goals': (ctx) => renderGoalsSection(ctx),
    'more-import': (ctx) => renderImportSection(ctx),
    'more-rules': (ctx) => renderRulesSection(ctx),
    'more-layouts': (ctx) => renderLayoutsSection(ctx),
    'more-backup': (ctx) => renderBackupSection(ctx),
    'more-profile': (ctx) => renderProfileSection(ctx),
    'more-rights': () => renderRightsSection(),
};

export function groupForSection(sectionId) {
    return SETTINGS_GROUPS.find((group) => group.sectionIds.includes(sectionId))?.id ?? null;
}

export function activeSectionIds(group, renderers = SECTION_RENDERERS) {
    return group.sectionIds.filter((id) => id in renderers);
}

export function visibleTitleIds(group, activeIds) {
    if (activeIds.length <= 1) {
        return [];
    }
    return activeIds.filter((id) => !(group.hiddenTitleIds ?? []).includes(id));
}

function hasBackupWorthyData(data) {
    return data.expenses.length > 0
        || data.incomes.length > 0
        || data.subscriptions.length > 0;
}

function calendarDaysBetween(fromISO, toISO) {
    const fromParts = fromISO.split('-').map(Number);
    const toParts = toISO.split('-').map(Number);
    if (fromParts.length !== 3 || toParts.length !== 3) {
        return Number.POSITIVE_INFINITY;
    }
    const from = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const to = new Date(toParts[0], toParts[1] - 1, toParts[2]);
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

function backupSummary(data, now) {
    if (!hasBackupWorthyData(data)) {
        return { text: 'Nothing to back up yet', warn: false };
    }
    const last = data.settings.lastBackupISO;
    if (last === null || last === undefined || last === '') {
        return { text: 'No backup yet', warn: true };
    }
    const days = calendarDaysBetween(last, todayISO(now));
    let text = `Last backup ${days} days ago`;
    if (days <= 0) {
        text = 'Last backup today';
    } else if (days === 1) {
        text = 'Last backup yesterday';
    }
    return { text, warn: days > 30 };
}

/** One line under the group title: `{ text, warn }`; empty text means no line. */
export function groupSummary(groupId, data, now = new Date()) {
    const settings = data.settings;
    let text = '';
    switch (groupId) {
        case 'money':
            text = moneySummary(data, now);
            break;
        case 'budget':
            text = settings.monthlyBudgetCents > 0
                ? `${formatEuro(settings.monthlyBudgetCents)} a month`
                : 'No budget set';
            break;
        case 'income': {
            const sources = data.incomeSources.length;
            const entries = data.incomes.length === 0
                ? 'No income entries yet'
                : plural(data.incomes.length, 'income entry', 'income entries');
            text = sources === 0
                ? entries
                : `${plural(sources, 'regular income', 'regular incomes')} · ${entries.toLowerCase()}`;
            break;
        }
        case 'backup':
            return backupSummary(data, now);
        case 'categories':
            text = plural(userCategories(data).length, 'category', 'categories');
            break;
        case 'subscriptions':
            text = data.subscriptions.length === 0
                ? 'None yet'
                : `${data.subscriptions.length} recurring`;
            break;
        case 'templates': {
            const count = (data.templates ?? []).length;
            text = count === 0 ? 'None yet' : plural(count, 'template', 'templates');
            break;
        }
        case 'goals': {
            const closed = data.goals.filter((goal) => goal.closedAt !== '').length;
            text = `${data.goals.length - closed} open · ${closed} closed`;
            break;
        }
        case 'advanced':
            text = plural((data.imports ?? []).length, 'past import', 'past imports')
                + ' · '
                + plural((data.rules ?? []).length, 'rule', 'rules');
            break;
        case 'profile': {
            const name = String(settings.userName ?? '').trim();
            text = `${name === '' ? 'Name not set' : name} · Rights and privacy`;
            break;
        }
        default:
            break;
    }
    return { text, warn: false };
}

let pendingScrollId = null;
let openGroupId = null;

export function openSettingsSection(sectionId) {
    pendingScrollId = sectionId;
    openGroupId = groupForSection(sectionId);
}

/** Section titles become h3 under the group's h2; hidden ones stay in the DOM as focus targets. */
function convertHeadings(node, visible) {
    for (const old of node.querySelectorAll('h2')) {
        const heading = element('h3', old.className, old.textContent);
        if (old.id !== '') {
            heading.id = old.id;
        }
        if (old.hasAttribute('tabindex')) {
            heading.tabIndex = old.tabIndex;
        }
        if (!visible) {
            heading.classList.add('visually-hidden');
        }
        old.replaceWith(heading);
    }
}

function renderGroupHeader(ctx, group, summary, isOpen) {
    const rowId = `settings-row-${group.id}`;
    const row = element('button', 'settings-row');
    row.type = 'button';
    row.id = rowId;
    row.setAttribute('aria-expanded', String(isOpen));
    row.setAttribute('aria-controls', `settings-body-${group.id}`);
    row.append(element('span', 'settings-row-title', group.title));
    if (summary.text !== '') {
        row.append(element(
            'span',
            summary.warn ? 'settings-row-summary is-warning' : 'settings-row-summary',
            summary.text,
        ));
    }
    const chevron = element('span', 'settings-row-chevron', '›');
    chevron.setAttribute('aria-hidden', 'true');
    row.append(chevron);
    row.addEventListener('click', () => {
        openGroupId = isOpen ? null : group.id;
        closeTransientUi();
        state.focusId = rowId;
        if (!isOpen) {
            pendingScrollId = `settings-group-${group.id}`;
        }
        ctx.render();
    });
    const title = element('h2', 'settings-group-title');
    title.append(row);
    return title;
}

function renderGroupBody(ctx, group, activeIds, plan) {
    const body = element('div', 'settings-group-body');
    body.id = `settings-body-${group.id}`;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-labelledby', `settings-row-${group.id}`);
    if (group.id === 'backup') {
        const reminder = renderBackupReminder(ctx);
        if (reminder !== null) {
            convertHeadings(reminder, false);
            body.append(reminder);
        }
    }
    const visibleIds = visibleTitleIds(group, activeIds);
    for (const id of activeIds) {
        const section = SECTION_RENDERERS[id](ctx, plan);
        convertHeadings(section, visibleIds.includes(id));
        body.append(section);
    }
    return body;
}

export function render(root, ctx) {
    const plan = resolvePlan(ctx.data.categories, ctx.data.settings.monthlyBudgetCents);
    const shown = SETTINGS_GROUPS
        .map((group) => ({ group, activeIds: activeSectionIds(group) }))
        .filter(({ activeIds }) => activeIds.length > 0);
    if (!shown.some(({ group }) => group.id === openGroupId)) {
        openGroupId = null;
    }

    const groups = element('div', 'settings-groups');
    for (const { group, activeIds } of shown) {
        const isOpen = group.id === openGroupId;
        const wrapper = element('div', 'settings-group');
        wrapper.id = `settings-group-${group.id}`;
        wrapper.append(renderGroupHeader(
            ctx,
            group,
            groupSummary(group.id, ctx.data),
            isOpen,
        ));
        if (isOpen) {
            wrapper.append(renderGroupBody(ctx, group, activeIds, plan));
        }
        groups.append(wrapper);
    }
    const layout = element('div', 'stack more-page');
    layout.append(groups);
    root.append(layout);

    if (pendingScrollId !== null) {
        const section = document.getElementById(pendingScrollId);
        pendingScrollId = null;
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (state.focusId !== null) {
        const target = document.getElementById(state.focusId);
        const isRow = state.focusId.startsWith('settings-row-');
        state.focusId = null;
        target?.focus(isRow ? { preventScroll: true } : undefined);
        target?.select?.();
    }
}
