import { resolvePlan } from '../budget.js';
import { formatEuro } from '../money.js';
import { todayISO } from '../months.js';
import { element, state } from './settings/shared.js';
import { renderPlanSection, renderProfileSection } from './settings/plan.js';
import { renderIncomeSection } from './settings/income.js';
import { renderSubscriptionsSection } from './settings/subscriptions.js';
import { renderCategoriesSection, userCategories } from './settings/categories.js';
import { renderBackupReminder, renderBackupSection } from './settings/backup.js';
import { renderRightsSection } from './settings/rights.js';
import { renderGoalsSection } from './settings/goals.js';
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
    'more-plan': (ctx) => renderPlanSection(ctx),
    'more-income': (ctx) => renderIncomeSection(ctx),
    'more-subscriptions': (ctx, plan) => renderSubscriptionsSection(ctx, plan),
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
        case 'budget':
            text = settings.monthlyBudgetCents > 0
                ? `${formatEuro(settings.monthlyBudgetCents)} a month`
                : 'No budget set';
            break;
        case 'income':
            text = data.incomes.length === 0
                ? 'No income entries yet'
                : plural(data.incomes.length, 'income entry', 'income entries');
            break;
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

export function openSettingsSection(sectionId) {
    pendingScrollId = sectionId;
}

export function render(root, ctx) {
    const plan = resolvePlan(ctx.data.categories, ctx.data.settings.monthlyBudgetCents);
    const layout = element('div', 'stack more-page');

    const jumps = element('nav', 'more-jumps');
    jumps.setAttribute('aria-label', 'Settings sections');
    for (const [id, label] of [
        ['more-plan', 'Plan'],
        ['more-income', 'Income'],
        ['more-subscriptions', 'Subscriptions'],
        ['more-categories', 'Categories'],
        ['more-goals', 'Goals'],
        ['more-import', 'Import'],
        ['more-rules', 'Rules'],
        ['more-backup', 'Backup'],
        ['more-rights', 'Rights'],
    ]) {
        const link = element('a', 'more-jump', label);
        link.href = `#${id}`;
        jumps.append(link);
    }
    layout.append(jumps);

    const reminder = renderBackupReminder(ctx);
    layout.append(
        renderPlanSection(ctx),
        renderProfileSection(ctx),
        renderIncomeSection(ctx),
        renderSubscriptionsSection(ctx, plan),
        renderCategoriesSection(ctx, plan),
        renderGoalsSection(ctx),
        renderImportSection(ctx),
        renderRulesSection(ctx),
        renderLayoutsSection(ctx),
    );
    if (reminder !== null) {
        layout.append(reminder);
    }
    layout.append(
        renderBackupSection(ctx),
        renderRightsSection(),
    );
    root.append(layout);

    if (pendingScrollId !== null) {
        const section = document.getElementById(pendingScrollId);
        pendingScrollId = null;
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (state.focusId !== null) {
        const target = document.getElementById(state.focusId);
        state.focusId = null;
        target?.focus();
        target?.select?.();
    }
}
