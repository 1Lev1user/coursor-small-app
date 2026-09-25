import { resolvePlan } from '../budget.js';
import { element, state } from './settings/shared.js';
import { renderWarnings, renderPlanSection } from './settings/plan.js';
import { renderIncomeSection } from './settings/income.js';
import { renderSubscriptionsSection } from './settings/subscriptions.js';
import { renderCategoriesSection } from './settings/categories.js';
import { renderBackupReminder, renderBackupSection } from './settings/backup.js';
import { renderRightsSection } from './settings/rights.js';

let pendingScrollId = null;

export function openSettingsSection(sectionId) {
    pendingScrollId = sectionId;
}

export function render(root, ctx) {
    const plan = resolvePlan(ctx.data.categories, ctx.data.settings.monthlyBudgetCents);
    const layout = element('div', 'stack more-page');
    layout.append(element('h2', 'section-title', 'Settings'));

    const jumps = element('nav', 'more-jumps');
    jumps.setAttribute('aria-label', 'Settings sections');
    for (const [id, label] of [
        ['more-plan', 'Plan'],
        ['more-income', 'Income'],
        ['more-subscriptions', 'Subscriptions'],
        ['more-categories', 'Categories'],
        ['more-backup', 'Backup'],
        ['more-rights', 'Rights'],
    ]) {
        const link = element('a', 'more-jump', label);
        link.href = `#${id}`;
        jumps.append(link);
    }
    layout.append(jumps);

    const reminder = renderBackupReminder(ctx);
    renderWarnings(layout, plan);
    layout.append(
        renderPlanSection(ctx),
        renderIncomeSection(ctx),
        renderSubscriptionsSection(ctx, plan),
        renderCategoriesSection(ctx, plan),
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
