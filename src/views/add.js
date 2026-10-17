import { parseAmount, formatEuro, formatPlain } from '../money.js';
import {
    currentMonthKey,
    monthKeyOf,
    monthLabel,
    shortDate,
    todayISO,
} from '../months.js';
import { UNCATEGORISED_ID, createId, removeEntry, restoreEntry } from '../model.js';
import { addTemplate, templateToExpense, isRepeatTap } from '../templates.js';
import { describeForeign } from '../currency.js';
import {
    freezeMonthPlan,
    newNoLimitCategory,
    syncCategoryPlanFields,
    refreshCurrentMonthPlan,
    monthTotals,
    recentEntries,
} from '../budget.js';
import {
    getMonthReviewSuggestion,
    dismissMonthReview,
    applySurplusToSavings,
    savingsRoomCents,
} from '../monthReview.js';
import {
    canAddExpenseCategory,
    canAddIncomeCategory,
    canAddSubcategory,
} from '../limits.js';
import { openSettingsSection } from './more.js';
import { doExportBackup } from './settings/backup.js';
import { renderGoalCard } from './goalCard.js';
import { renderPaydayReminders } from './paydayReminder.js';
import { renderMoneyBlock } from './homeMoney.js';
import { moneyNow } from '../balance.js';
import { rollNumber } from '../motion.js';
import { entryAmountText } from './entryDisplay.js';
import {
    amountErrorText,
    buildCurrencyFields,
    originalErrorText,
} from './currencyFields.js';

/** @type {'home' | 'expense' | 'income' | 'added'} */
let panel = 'home';

// Keep category/date after a successful save; clear amount and note for the next entry.
const draft = {
    categoryId: '',
    subcategoryId: '',
    amount: '',
    note: '',
    date: '',
    currency: 'EUR',
    originalAmount: '',
    saveTemplate: false,
    templateName: '',
    refund: false,
};

const TEMPLATE_NAME_MAX = 40;
const SOFT_BACKUP_DAYS = 14;
const STRONG_BACKUP_DAYS = 30;
const OVERDUE_BACKUP_DAYS = 60;
const SNOOZE_DAYS = 7;

const incomeDraft = {
    sourceId: '',
    incomeCategoryId: '',
    amount: '',
    note: '',
    date: '',
    error: '',
    errorField: '',
};

let focusAmountOnRender = false;
let saveError = '';
let focusSaveErrorOnRender = false;

let addingCategory = false;
let addCategoryName = '';
let addCategoryError = '';

let confirmNoteAsSub = false;

let addingIncomeCategory = false;
let addIncomeCategoryName = '';
let addIncomeCategoryError = '';

/** @type {null | { kind: 'expense' | 'income', amountCents: number, label: string, details?: string[], refund?: boolean }} */
let lastAdded = null;

let focusFormRequested = false;

/** Returns true once after an Add form was opened from Home or the other form; then clears. */
export function takeFocusRequest() {
    const requested = focusFormRequested;
    focusFormRequested = false;
    return requested;
}

/** @returns {'close-panel' | 'home' | null} */
export function escapeAction(event, quickPanelOpen) {
    if (event.key !== 'Escape' || event.defaultPrevented === true || event.isComposing === true) {
        return null;
    }
    return quickPanelOpen ? 'close-panel' : 'home';
}

function onFormEscape(event, quickPanelOpen, ctx) {
    const action = escapeAction(event, quickPanelOpen);
    if (action === null) {
        return;
    }
    event.preventDefault();
    if (action === 'close-panel') {
        closeQuickPanels();
    } else {
        openAddPanel('home');
    }
    ctx.render();
}

export function openAddPanel(next = 'home') {
    const previous = panel;
    // Never from 'added': a failed save re-opens the form and must not move scroll or focus.
    focusFormRequested =
        (next === 'expense' || next === 'income') && next !== previous && previous !== 'added';
    if (focusFormRequested && typeof window !== 'undefined') {
        window.scrollTo(0, 0);
    }
    if (next === 'expense' || next === 'income' || next === 'added') {
        panel = next;
    } else {
        panel = 'home';
        lastAdded = null;
    }
    if (panel === 'home') {
        closeQuickPanels();
        incomeDraft.error = '';
        incomeDraft.errorField = '';
    } else if (panel === 'income') {
        addingCategory = false;
        addCategoryName = '';
        addCategoryError = '';
        confirmNoteAsSub = false;
    } else if (panel === 'expense') {
        addingIncomeCategory = false;
        addIncomeCategoryName = '';
        addIncomeCategoryError = '';
    }
}

export function addScreenTitle() {
    if (panel === 'expense') {
        return 'Add expense';
    }
    if (panel === 'income') {
        return 'Add income';
    }
    if (panel === 'added') {
        if (lastAdded?.kind === 'income') {
            return 'Income added';
        }
        return lastAdded?.refund === true ? 'Refund added' : 'Expense added';
    }
    return 'Home';
}

function selectableCategories(data) {
    return data.categories.filter(
        (category) => category.system !== true && category.id !== UNCATEGORISED_ID,
    );
}

function option(value, text) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = text;
    return element;
}

function buildField(id, labelText, control) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;

    const error = document.createElement('p');
    error.className = 'error-text';
    error.id = `${id}-error`;
    error.hidden = true;

    control.id = id;
    wrapper.append(label, control, error);

    return { wrapper, control, error };
}

function setError(field, message) {
    field.error.textContent = message;
    field.error.hidden = false;
    field.control.setAttribute('aria-invalid', 'true');
    field.control.setAttribute('aria-describedby', field.error.id);
}

function clearError(field) {
    field.error.textContent = '';
    field.error.hidden = true;
    field.control.removeAttribute('aria-invalid');
    field.control.removeAttribute('aria-describedby');
}

function namesMatch(a, b) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function closeQuickPanels() {
    addingCategory = false;
    addCategoryName = '';
    addCategoryError = '';
    confirmNoteAsSub = false;
    addingIncomeCategory = false;
    addIncomeCategoryName = '';
    addIncomeCategoryError = '';
}

function createNoLimitCategory(ctx, name) {
    const allowed = canAddExpenseCategory(ctx.data);
    if (allowed.ok !== true) {
        return null;
    }
    const budget = ctx.data.settings.monthlyBudgetCents;
    const category = newNoLimitCategory(createId('cat'), name);
    ctx.data.categories.push(category);
    syncCategoryPlanFields(ctx.data.categories, budget);
    refreshCurrentMonthPlan(ctx.data);
    return category;
}

function createIncomeCategory(ctx, name) {
    const allowed = canAddIncomeCategory(ctx.data);
    if (allowed.ok !== true) {
        return null;
    }
    const category = {
        id: createId('incat'),
        name,
    };
    ctx.data.incomeCategories.push(category);
    return category;
}

function findCategory(data, categoryId) {
    return data.categories.find(({ id }) => id === categoryId);
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function expenseEntryLabel(data, categoryId, subcategoryId) {
    const category = data.categories.find(({ id }) => id === categoryId);
    const categoryName = category?.name ?? 'Expense';
    if (subcategoryId === '' || subcategoryId === undefined) {
        return categoryName;
    }
    const subcategory = category?.subcategories?.find(({ id }) => id === subcategoryId);
    return subcategory === undefined
        ? categoryName
        : `${categoryName} \u00b7 ${subcategory.name}`;
}

function incomeEntryLabel(data, incomeCategoryId) {
    return data.incomeCategories.find(({ id }) => id === incomeCategoryId)?.name
        ?? 'Income';
}

function renderAddedConfirm(root, ctx) {
    if (lastAdded === null) {
        openAddPanel('home');
        renderHome(root, ctx);
        return;
    }

    const layout = element('div', 'stack home-page');
    const card = element('section', 'card stack added-box');
    card.setAttribute('role', 'status');

    const ok = element('button', 'btn btn-primary', 'OK');
    ok.type = 'button';
    ok.addEventListener('click', () => {
        lastAdded = null;
        openAddPanel('home');
        ctx.render();
    });

    card.append(
        element(
            'h2',
            'section-title',
            lastAdded.kind === 'income'
                ? 'Income added'
                : (lastAdded.refund === true ? 'Refund added' : 'Expense added'),
        ),
        element('p', 'big-number', formatEuro(lastAdded.amountCents)),
        element('p', 'muted', lastAdded.label),
    );
    for (const line of lastAdded.details ?? []) {
        card.append(element('p', 'muted', line));
    }
    card.append(ok);
    layout.append(card);
    root.append(layout);
    queueMicrotask(() => ok.focus());
}

function backToHomeButton(ctx) {
    const button = element('button', 'btn', 'Back to Home');
    button.type = 'button';
    button.addEventListener('click', () => {
        openAddPanel('home');
        ctx.render();
    });
    return button;
}

function renderMonthReviewCard(ctx, suggestion) {
    const { totals } = suggestion;
    const card = element('section', 'card stack home-review');
    card.setAttribute('aria-label', 'Month review suggestion');

    const bits = [];
    if (totals.extraIncomeCents > 0) {
        bits.push(`extra income ${formatEuro(totals.extraIncomeCents)}`);
    }
    if (totals.cashLeftCents > 0) {
        bits.push(`cash left ${formatEuro(totals.cashLeftCents)}`);
    }
    if (totals.budgetLeftCents < 0) {
        bits.push(`over spend budget by ${formatEuro(-totals.budgetLeftCents)}`);
    }
    if (suggestion.earnedAboveSpendBudget) {
        bits.push(
            `income ${formatEuro(totals.incomeCents)} above spend budget`,
        );
    }

    card.append(
        element('h2', 'section-title', `Review after ${suggestion.previousLabel}?`),
        element(
            'p',
            '',
            `Last month: ${bits.join(' · ')}. Spend budget was ${formatEuro(totals.budgetCents)}.`,
        ),
        element('p', 'muted', 'Shown only in the first 5 days of the month.'),
    );

    const section1 = element('div', 'stack home-review-section');
    section1.append(element('h3', 'home-review-subtitle', 'Categories & plan'));
    section1.append(element(
        'p',
        'muted',
        'Retune category limits if spending felt tight or loose.',
    ));

    const section1Actions = element('div', 'home-review-actions stack');
    const categoriesBtn = element('button', 'btn', 'Review categories');
    categoriesBtn.type = 'button';
    categoriesBtn.addEventListener('click', () => {
        openSettingsSection('more-categories');
        ctx.goTo('more');
    });
    section1Actions.append(categoriesBtn);
    section1.append(section1Actions);
    card.append(section1);

    if (suggestion.earnedAboveSpendBudget) {
        const over = suggestion.incomeOverSpendCents;
        const section2 = element('div', 'stack home-review-section');
        section2.append(element('h3', 'home-review-subtitle', 'Income above spend budget'));
        section2.append(element(
            'p',
            '',
            `You earned ${formatEuro(totals.incomeCents)}, `
                + `${formatEuro(over)} more than the spend budget of `
                + `${formatEuro(totals.budgetCents)}. Choose one:`,
        ));

        const section2Actions = element('div', 'home-review-actions stack');
        const applyAmount = Math.min(over, savingsRoomCents(ctx.data));
        const savingsBtn = element(
            'button',
            'btn btn-primary',
            applyAmount > 0
                ? `Add ${formatEuro(applyAmount)} to Savings`
                : 'Add to Savings',
        );
        savingsBtn.type = 'button';
        savingsBtn.disabled = applyAmount <= 0;
        savingsBtn.addEventListener('click', () => {
            const result = applySurplusToSavings(ctx.data, applyAmount);
            if (result === null) {
                ctx.toast('Savings is already at the spend budget cap');
                return;
            }
            dismissMonthReview(ctx.data, suggestion.previousKey);
            if (ctx.save() === false) {
                return;
            }
            ctx.toast(`Savings raised by ${formatEuro(result.appliedCents)}`);
        });

        const budgetBtn = element('button', 'btn', 'Change spending budget');
        budgetBtn.type = 'button';
        budgetBtn.addEventListener('click', () => {
            openSettingsSection('more-plan');
            ctx.goTo('more');
        });

        section2Actions.append(savingsBtn, budgetBtn);
        section2.append(section2Actions);
        card.append(section2);
    }

    const dismissBtn = element('button', 'btn btn-ghost', 'Not now');
    dismissBtn.type = 'button';
    dismissBtn.addEventListener('click', () => {
        dismissMonthReview(ctx.data, suggestion.previousKey);
        if (ctx.save() !== false) {
            ctx.toast('Review dismissed');
        }
    });
    card.append(dismissBtn);

    return card;
}

function recentTexts(data, { type, entry }) {
    const note = typeof entry.note === 'string' ? entry.note.trim() : '';
    if (type === 'income') {
        const name = data.incomeCategories.find(({ id }) => id === entry.incomeCategoryId)?.name
            ?? 'Income';
        return note === ''
            ? { title: name, detail: 'Income' }
            : { title: note, detail: `Income \u00b7 ${name}` };
    }

    const category = data.categories.find(({ id }) => id === entry.categoryId);
    const categoryName = entry.refund === true
        ? `Refund \u00b7 ${category?.name ?? 'Expense'}`
        : category?.name ?? 'Expense';
    const subcategory = category?.subcategories?.find(({ id }) => id === entry.subcategoryId);
    if (note !== '') {
        return { title: note, detail: categoryName };
    }
    return {
        title: subcategory?.name ?? categoryName,
        detail: subcategory === undefined ? '' : categoryName,
    };
}

function renderRecent(ctx) {
    const items = recentEntries(ctx.data, 3);
    if (items.length === 0) {
        return null;
    }

    const section = element('section', 'stack home-recent');
    section.setAttribute('aria-labelledby', 'home-recent-title');
    const title = element('h2', 'home-recent-title', 'Recent');
    title.id = 'home-recent-title';

    const list = element('ul', 'home-recent-list');
    for (const item of items) {
        const { title: itemTitle, detail } = recentTexts(ctx.data, item);
        const row = element('li', 'home-recent-item');
        const text = element('div', 'home-recent-text');
        text.append(element('p', 'home-recent-name', itemTitle));
        if (detail !== '') {
            text.append(element('p', 'muted', detail));
        }

        const values = element('div', 'home-recent-values');
        const amount = entryAmountText(item.type, item.entry);
        values.append(element(
            'p',
            amount.positive ? 'home-recent-amount is-ok' : 'home-recent-amount',
            amount.text,
        ));
        const time = element('time', 'muted', shortDate(item.entry.date));
        time.setAttribute('datetime', item.entry.date);
        values.append(time);

        row.append(text, values);
        list.append(row);
    }

    const allButton = element('button', 'btn btn-ghost home-recent-all', 'Open Month');
    allButton.type = 'button';
    allButton.addEventListener('click', () => {
        ctx.setMonthKey(currentMonthKey());
        ctx.goTo('month');
    });

    section.append(title, list, allButton);
    return section;
}

function isoDay(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match === null ? null : Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDaysISO(dateISO, days) {
    const [year, month, day] = dateISO.split('-').map(Number);
    return todayISO(new Date(year, month - 1, day + days));
}

/**
 * Home backup reminder state. Hidden while snoozed or with no entries.
 * @returns {null | { level: 'soft' | 'strong' | 'overdue', days: number | null }}
 */
export function backupReminder(data, now = new Date()) {
    if (data.expenses.length + data.incomes.length === 0) {
        return null;
    }
    const today = todayISO(now);

    const last = isoDay(data.settings.lastBackupISO);
    const snoozedUntil = data.settings.backupSnoozedUntil;
    const isSnoozed = typeof snoozedUntil === 'string' && snoozedUntil !== '' && today < snoozedUntil;

    if (last === null) {
        if (isSnoozed) {
            return null;
        }
        return { level: 'strong', days: null };
    }

    const days = Math.round((isoDay(today) - last) / 86_400_000);
    if (days >= OVERDUE_BACKUP_DAYS) {
        return { level: 'overdue', days };
    }

    if (isSnoozed) {
        return null;
    }

    if (days >= STRONG_BACKUP_DAYS) {
        return { level: 'strong', days };
    }
    if (days >= SOFT_BACKUP_DAYS) {
        return { level: 'soft', days };
    }
    return null;
}

function renderBackupReminder(ctx, reminder) {
    const overdue = reminder.level === 'overdue';
    const strong = reminder.level === 'strong' || overdue;
    const card = element('section', strong ? 'home-backup is-strong' : 'home-backup');
    card.setAttribute('aria-labelledby', 'home-backup-title');

    let message;
    if (!strong) {
        message = `Last backup ${reminder.days} days ago`;
    } else if (reminder.days === null) {
        message = 'No backup yet. If this phone is lost, your data is gone.';
    } else {
        message = `No backup for ${reminder.days} days. If this phone is lost, your data is gone.`;
    }
    const title = element('p', 'home-backup-title', message);
    title.id = 'home-backup-title';

    const exportBtn = element('button', strong ? 'btn btn-primary' : 'btn', 'Export backup');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', () => doExportBackup(ctx));

    const actions = element('div', 'home-backup-actions');
    actions.append(exportBtn);

    if (!overdue) {
        const laterBtn = element('button', 'btn btn-ghost', 'Later');
        laterBtn.type = 'button';
        laterBtn.addEventListener('click', () => {
            const previous = ctx.data.settings.backupSnoozedUntil;
            ctx.data.settings.backupSnoozedUntil = addDaysISO(todayISO(), SNOOZE_DAYS);
            if (ctx.save() === false) {
                ctx.data.settings.backupSnoozedUntil = previous;
                ctx.render();
                return;
            }
            ctx.toast('Reminder snoozed for 7 days');
        });
        actions.append(laterBtn);
    }

    card.append(title, actions);
    return card;
}

function templateButtonText(template) {
    return `${template.name} \u00b7 ${formatEuro(template.amountCents)}`;
}

let lastQuickAdd = null;

function addFromTemplate(ctx, template) {
    const nowMs = Date.now();
    if (isRepeatTap(lastQuickAdd, template.id, nowMs)) {
        return;
    }
    lastQuickAdd = { id: template.id, at: nowMs };

    const date = todayISO();
    const monthKey = monthKeyOf(date);
    const expense = { id: createId('exp'), ...templateToExpense(template, date) };
    const category = findCategory(ctx.data, expense.categoryId);
    if (category === undefined) {
        expense.categoryId = UNCATEGORISED_ID;
        expense.subcategoryId = '';
    } else if (!category.subcategories.some(({ id }) => id === expense.subcategoryId)) {
        expense.subcategoryId = '';
    }

    const planWasAlreadyFrozen = Object.hasOwn(ctx.data.monthPlans, monthKey);
    ctx.data.expenses.push(expense);
    freezeMonthPlan(ctx.data, monthKey);

    if (ctx.save() === false) {
        ctx.data.expenses.splice(ctx.data.expenses.indexOf(expense), 1);
        if (!planWasAlreadyFrozen) {
            delete ctx.data.monthPlans[monthKey];
        }
        ctx.render();
        return;
    }
    ctx.toast(`Added ${template.name}`, {
        label: 'Undo',
        onClick: () => {
            const removed = removeEntry(ctx.data, 'expense', expense.id);
            if (removed === null) {
                return;
            }
            if (ctx.save() === false) {
                restoreEntry(ctx.data, 'expense', removed.entry, removed.index);
                ctx.render();
                return;
            }
            ctx.render();
            ctx.toast(`Removed ${template.name}`);
        },
    });
}

function renderTemplates(ctx) {
    const templates = Array.isArray(ctx.data.templates) ? ctx.data.templates : [];
    if (templates.length === 0) {
        return null;
    }

    const section = element('section', 'home-templates');
    section.setAttribute('aria-labelledby', 'home-templates-title');
    const title = element('h2', 'home-recent-title', 'Quick add');
    title.id = 'home-templates-title';

    const list = element('div', 'home-template-list');
    for (const template of templates) {
        const button = element('button', 'btn home-template-btn', templateButtonText(template));
        button.type = 'button';
        button.addEventListener('click', () => addFromTemplate(ctx, template));
        list.append(button);
    }

    section.append(title, list);
    return section;
}

/** The Home figure: what is left to spend, with savings kept outside the spend budget. */
export function homeFigureModel(totals) {
    const over = totals.budgetLeftCents < 0;
    let sub = `${formatEuro(totals.budgetSpentCents)} spent of ${formatEuro(totals.budgetCents)}`;
    if (totals.outsideBudgetCents > 0) {
        sub += ` \u00b7 ${formatEuro(totals.outsideBudgetCents)} saved`;
    }
    return {
        over,
        label: over ? 'over budget by' : 'left to spend',
        valueCents: Math.abs(totals.budgetLeftCents),
        sub,
    };
}

/** The muted month-budget line under Money now. */
export function homeBudgetText(model) {
    const amount = formatEuro(model.valueCents);
    return model.over
        ? `Month budget: ${model.label} ${amount} · ${model.sub}`
        : `Month budget: ${amount} ${model.label} · ${model.sub}`;
}

/** Money now as last shown on Home; null until the first Home render since app start. */
let lastMoneyNowCents = null;

function renderHome(root, ctx) {
    const layout = element('div', 'stack home-page');
    const monthKey = currentMonthKey();
    const totals = monthTotals(ctx.data, monthKey);
    const userName = String(ctx.data.settings.userName ?? '').trim();
    const monthName = monthLabel(monthKey).split(' ')[0];
    const heading = userName === '' ? monthLabel(monthKey) : `${userName}\u2019s ${monthName}`;

    const figureModel = homeFigureModel(totals);
    const { over, label, valueCents, sub } = figureModel;
    const figureText = formatEuro(valueCents);
    const figure = element('section', over ? 'home-figure is-over' : 'home-figure');
    figure.setAttribute('aria-labelledby', 'home-figure-label');
    const figureLabel = element('p', 'home-figure-label', label);
    figureLabel.id = 'home-figure-label';
    figure.append(
        figureLabel,
        element('p', figureText.length > 9 ? 'home-figure-value is-long' : 'home-figure-value', figureText),
        element('p', 'home-figure-sub', sub),
    );

    const expenseBtn = element('button', 'btn btn-primary', 'Add expense');
    expenseBtn.type = 'button';
    expenseBtn.addEventListener('click', () => {
        openAddPanel('expense');
        ctx.render();
    });

    const incomeBtn = element('button', 'btn', 'Add income');
    incomeBtn.type = 'button';
    incomeBtn.addEventListener('click', () => {
        openAddPanel('income');
        ctx.render();
    });

    const actions = element('div', 'home-actions');
    actions.append(expenseBtn, incomeBtn);

    let figureArea = [figure];
    const moneyCents = moneyNow(ctx.data);
    if (moneyCents !== null) {
        const budgetClass = over ? 'muted home-budget is-over' : 'muted home-budget';
        const from = lastMoneyNowCents;
        lastMoneyNowCents = moneyCents;
        const rolls = from !== null && from !== moneyCents;
        const moneyBlock = renderMoneyBlock(ctx, rolls ? from : null);
        if (rolls) {
            const value = moneyBlock.querySelector('.home-figure-value');
            rollNumber({
                from,
                to: moneyCents,
                onFrame: (cents) => {
                    value.textContent = formatEuro(cents);
                },
            });
        }
        figureArea = [moneyBlock, element('p', budgetClass, homeBudgetText(figureModel))];
    }
    layout.append(element('h2', 'home-title', heading), ...figureArea);

    const paydayReminders = renderPaydayReminders(ctx);
    if (paydayReminders !== null) {
        layout.append(paydayReminders);
    }

    layout.append(actions);

    const templates = renderTemplates(ctx);
    if (templates !== null) {
        layout.append(templates);
    }

    layout.append(
        element(
            'p',
            'muted home-auto-note',
            'Paydays and subscriptions remind you when they are due. Nothing is added until you confirm it. Everything stays on this device.',
        ),
    );

    const reminder = backupReminder(ctx.data);
    if (reminder !== null) {
        layout.append(renderBackupReminder(ctx, reminder));
    }

    const goal = renderGoalCard(ctx);
    if (goal !== null) {
        layout.append(goal);
    }

    const review = getMonthReviewSuggestion(ctx.data);
    if (review !== null) {
        layout.append(renderMonthReviewCard(ctx, review));
    }

    const recent = renderRecent(ctx);
    if (recent !== null) {
        layout.append(recent);
    }

    root.append(layout);
}

/** The line above the Add income form. */
export function incomeFormNote(data) {
    return data.incomeSources.length > 0
        ? 'Pick the regular income this is, so it counts as received for that month. Choose Other income for a bonus or a gift.'
        : 'Add any income here, such as a bonus or a gift.';
}

function renderIncomeForm(root, ctx) {
    if (incomeDraft.date === '') {
        incomeDraft.date = todayISO();
    }
    if (!ctx.data.incomeSources.some(({ id }) => id === incomeDraft.sourceId)) {
        incomeDraft.sourceId = '';
    }
    if (!ctx.data.incomeCategories.some(({ id }) => id === incomeDraft.incomeCategoryId)) {
        incomeDraft.incomeCategoryId = '';
    }

    const form = document.createElement('form');
    form.id = 'add-income-form';
    form.className = 'card stack';
    form.noValidate = true;
    form.addEventListener('keydown', (event) => {
        onFormEscape(event, addingIncomeCategory || addingCategory || confirmNoteAsSub, ctx);
    });

    form.append(element('p', 'muted home-auto-note', incomeFormNote(ctx.data)));

    const sourceSelect = document.createElement('select');
    sourceSelect.append(option('', 'Other income (bonus, gift, ...)'));
    for (const incomeSource of ctx.data.incomeSources) {
        sourceSelect.append(option(incomeSource.id, incomeSource.name));
    }
    sourceSelect.value = incomeDraft.sourceId;
    const sourceField = buildField('home-income-source', 'Income from', sourceSelect);
    sourceSelect.addEventListener('change', () => {
        incomeDraft.sourceId = sourceSelect.value;
        const picked = ctx.data.incomeSources.find(({ id }) => id === sourceSelect.value);
        if (picked !== undefined) {
            incomeDraft.incomeCategoryId = picked.incomeCategoryId;
            if (incomeDraft.amount.trim() === '') {
                incomeDraft.amount = formatPlain(picked.expectedCents, '.');
            }
        }
        ctx.render();
    });

    const categorySelect = document.createElement('select');
    categorySelect.required = true;
    categorySelect.append(option('', 'Choose a category'));
    for (const category of ctx.data.incomeCategories) {
        categorySelect.append(option(category.id, category.name));
    }
    categorySelect.value = incomeDraft.incomeCategoryId;

    const categoryPlus = document.createElement('button');
    categoryPlus.type = 'button';
    categoryPlus.className = 'add-plus-btn';
    categoryPlus.setAttribute('aria-label', 'Add income category');
    categoryPlus.textContent = '+';

    const categoryRow = document.createElement('div');
    categoryRow.className = 'add-field-row';
    categoryRow.append(categorySelect, categoryPlus);

    const categoryField = buildField('home-income-category', 'Income category', categoryRow);
    categoryRow.removeAttribute('id');
    categorySelect.id = 'home-income-category';
    categoryField.control = categorySelect;
    categorySelect.addEventListener('change', () => {
        incomeDraft.incomeCategoryId = categorySelect.value;
        clearError(categoryField);
    });
    categoryPlus.addEventListener('click', () => {
        addingIncomeCategory = true;
        addIncomeCategoryError = '';
        ctx.render();
    });

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '100';
    amountInput.value = incomeDraft.amount;
    const amountField = buildField('home-income-amount', 'Amount (\u20ac)', amountInput);
    amountInput.addEventListener('input', () => {
        incomeDraft.amount = amountInput.value;
        clearError(amountField);
    });

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = incomeDraft.date;
    const dateField = buildField('home-income-date', 'Date', dateInput);
    dateInput.addEventListener('input', () => {
        incomeDraft.date = dateInput.value;
        clearError(dateField);
    });

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.value = incomeDraft.note;
    const noteField = buildField('home-income-note', 'Note (optional)', noteInput);
    noteInput.addEventListener('input', () => {
        incomeDraft.note = noteInput.value;
    });

    if (incomeDraft.error !== '') {
        if (incomeDraft.errorField === 'category') {
            setError(categoryField, incomeDraft.error);
        } else if (incomeDraft.errorField === 'amount') {
            setError(amountField, incomeDraft.error);
        } else if (incomeDraft.errorField === 'date') {
            setError(dateField, incomeDraft.error);
        }
    }

    const categoryPanelHost = document.createElement('div');
    categoryPanelHost.className = 'add-quick-panel-host';

    if (addingIncomeCategory) {
        const panelEl = document.createElement('div');
        panelEl.className = 'add-quick-panel stack';
        panelEl.setAttribute('role', 'group');
        panelEl.setAttribute('aria-label', 'Add income category');

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.autocomplete = 'off';
        nameInput.placeholder = 'Category name';
        nameInput.value = addIncomeCategoryName;
        nameInput.id = 'add-quick-income-category-name';
        const nameField = buildField(
            'add-quick-income-category-name',
            'New income category',
            nameInput,
        );
        if (addIncomeCategoryError !== '') {
            setError(nameField, addIncomeCategoryError);
        }
        nameInput.addEventListener('input', () => {
            addIncomeCategoryName = nameInput.value;
            addIncomeCategoryError = '';
            clearError(nameField);
        });

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn';
        cancelBtn.textContent = 'Cancel';

        const actions = document.createElement('div');
        actions.className = 'add-quick-actions';
        actions.append(cancelBtn, saveBtn);

        cancelBtn.addEventListener('click', () => {
            addingIncomeCategory = false;
            addIncomeCategoryName = '';
            addIncomeCategoryError = '';
            ctx.render();
        });

        saveBtn.addEventListener('click', () => {
            const name = addIncomeCategoryName.trim();
            if (name === '') {
                addIncomeCategoryError = 'Enter a name.';
                setError(nameField, addIncomeCategoryError);
                nameInput.focus();
                return;
            }

            const existing = ctx.data.incomeCategories.find(({ name: n }) => namesMatch(n, name));
            if (existing !== undefined) {
                incomeDraft.incomeCategoryId = existing.id;
                addingIncomeCategory = false;
                addIncomeCategoryName = '';
                addIncomeCategoryError = '';
                if (ctx.save() !== false) {
                    ctx.toast('Category already exists');
                }
                ctx.render();
                return;
            }

            const category = createIncomeCategory(ctx, name);
            if (category === null) {
                addIncomeCategoryError = canAddIncomeCategory(ctx.data).reason;
                setError(nameField, addIncomeCategoryError);
                nameInput.focus();
                return;
            }
            incomeDraft.incomeCategoryId = category.id;
            addingIncomeCategory = false;
            addIncomeCategoryName = '';
            addIncomeCategoryError = '';

            if (ctx.save() === false) {
                ctx.data.incomeCategories.splice(ctx.data.incomeCategories.indexOf(category), 1);
                incomeDraft.incomeCategoryId = '';
                ctx.render();
                ctx.toast('Could not save to this device');
                return;
            }

            ctx.render();
            ctx.toast('Income category added');
        });

        panelEl.append(nameField.wrapper, actions);
        categoryPanelHost.append(panelEl);
    }

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-primary';
    submit.textContent = 'Add income';

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        clearError(categoryField);
        clearError(amountField);
        clearError(dateField);
        incomeDraft.error = '';
        incomeDraft.errorField = '';

        incomeDraft.incomeCategoryId = categorySelect.value;
        incomeDraft.amount = amountInput.value;
        incomeDraft.date = dateInput.value;
        incomeDraft.note = noteInput.value;

        if (incomeDraft.incomeCategoryId === '') {
            incomeDraft.errorField = 'category';
            incomeDraft.error = 'Choose an income category.';
            setError(categoryField, incomeDraft.error);
            categorySelect.focus();
            return;
        }

        const amountCents = parseAmount(incomeDraft.amount);
        if (amountCents === null) {
            incomeDraft.errorField = 'amount';
            incomeDraft.error = 'Enter a valid amount greater than zero.';
            setError(amountField, incomeDraft.error);
            amountInput.focus();
            return;
        }

        if (incomeDraft.date === '' || monthKeyOf(incomeDraft.date) === null) {
            incomeDraft.errorField = 'date';
            incomeDraft.error = 'Enter a valid date.';
            setError(dateField, incomeDraft.error);
            dateInput.focus();
            return;
        }

        const incomeCategoryId = incomeDraft.incomeCategoryId;
        const sourceId = ctx.data.incomeSources.some(({ id }) => id === incomeDraft.sourceId)
            ? incomeDraft.sourceId
            : '';
        ctx.data.incomes.push({
            id: createId('inc'),
            incomeCategoryId,
            amountCents,
            note: incomeDraft.note.trim(),
            date: incomeDraft.date,
            sourceId,
        });
        freezeMonthPlan(ctx.data, monthKeyOf(incomeDraft.date));

        incomeDraft.sourceId = '';
        incomeDraft.incomeCategoryId = '';
        incomeDraft.amount = '';
        incomeDraft.date = todayISO();
        incomeDraft.note = '';
        incomeDraft.error = '';
        incomeDraft.errorField = '';
        addingIncomeCategory = false;
        addIncomeCategoryName = '';
        addIncomeCategoryError = '';

        lastAdded = {
            kind: 'income',
            amountCents,
            label: incomeEntryLabel(ctx.data, incomeCategoryId),
        };
        openAddPanel('added');
        if (ctx.save() === false) {
            ctx.data.incomes.pop();
            lastAdded = null;
            openAddPanel('income');
            ctx.render();
            ctx.toast('Could not save to this device');
            return;
        }
    });

    if (ctx.data.incomeSources.length > 0) {
        form.append(sourceField.wrapper);
    }
    form.append(
        categoryField.wrapper,
        categoryPanelHost,
        amountField.wrapper,
        dateField.wrapper,
        noteField.wrapper,
        submit,
        backToHomeButton(ctx),
    );
    root.append(form);

    const focusForm = takeFocusRequest();
    if (addingIncomeCategory) {
        document.getElementById('add-quick-income-category-name')?.focus();
    } else if (focusForm) {
        (ctx.data.incomeSources.length > 0 ? sourceSelect : categorySelect).focus();
    }
}

export function render(root, ctx) {
    if (panel === 'home') {
        renderHome(root, ctx);
        return;
    }
    if (panel === 'income') {
        renderIncomeForm(root, ctx);
        return;
    }
    if (panel === 'added') {
        renderAddedConfirm(root, ctx);
        return;
    }
    renderExpenseForm(root, ctx);
}

export function newExpenseRecord({
    categoryId,
    subcategoryId,
    amountCents,
    note,
    date,
    currency,
    originalAmountCents,
    refund,
}) {
    return {
        id: createId('exp'),
        categoryId,
        subcategoryId,
        amountCents,
        note,
        date,
        currency,
        originalAmountCents,
        refund: refund === true,
        importId: '',
        bankRef: '',
        fingerprint: '',
        goalId: '',
    };
}

function renderExpenseForm(root, ctx) {
    const categories = selectableCategories(ctx.data);

    if (draft.date === '') {
        draft.date = todayISO();
    }
    if (!categories.some(({ id }) => id === draft.categoryId)) {
        draft.categoryId = '';
        draft.subcategoryId = '';
    }

    const form = document.createElement('form');
    form.id = 'add-form';
    form.className = 'card stack';
    form.noValidate = true;
    form.addEventListener('keydown', (event) => {
        onFormEscape(event, addingCategory || confirmNoteAsSub || addingIncomeCategory, ctx);
    });

    const categorySelect = document.createElement('select');
    categorySelect.required = true;
    categorySelect.setAttribute('aria-required', 'true');
    categorySelect.append(
        option('', 'Choose a category'),
        ...categories.map(({ id, name }) => option(id, name)),
    );
    categorySelect.value = draft.categoryId;

    const categoryPlus = document.createElement('button');
    categoryPlus.type = 'button';
    categoryPlus.className = 'add-plus-btn';
    categoryPlus.setAttribute('aria-label', 'Add category');
    categoryPlus.textContent = '+';

    const categoryRow = document.createElement('div');
    categoryRow.className = 'add-field-row';
    categoryRow.append(categorySelect, categoryPlus);

    const categoryField = buildField('add-category', 'Category', categoryRow);
    categoryRow.removeAttribute('id');
    categorySelect.id = 'add-category';
    categoryField.control = categorySelect;

    const subcategorySelect = document.createElement('select');
    const subcategoryField = buildField('add-subcategory', 'Subcategory', subcategorySelect);

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.autocomplete = 'off';
    amountInput.placeholder = '12.50 or 12,50';
    amountInput.required = true;
    amountInput.setAttribute('aria-required', 'true');
    amountInput.value = draft.amount;
    const amountField = buildField('add-amount', 'Amount (\u20ac)', amountInput);
    const currency = buildCurrencyFields({ idPrefix: 'add', amountField, draft });

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.autocomplete = 'off';
    noteInput.placeholder = 'Optional';
    noteInput.value = draft.note;

    const templateCheck = document.createElement('input');
    templateCheck.type = 'checkbox';
    templateCheck.id = 'add-save-template';
    templateCheck.checked = draft.saveTemplate;
    const templateCheckLabel = document.createElement('label');
    templateCheckLabel.className = 'check-row';
    templateCheckLabel.htmlFor = 'add-save-template';
    templateCheckLabel.append(templateCheck, element('span', '', 'Save as template'));

    const templateNameInput = document.createElement('input');
    templateNameInput.type = 'text';
    templateNameInput.autocomplete = 'off';
    templateNameInput.maxLength = TEMPLATE_NAME_MAX;
    templateNameInput.value = draft.templateName;
    const templateNameField = buildField('add-template-name', 'Template name', templateNameInput);
    templateNameField.wrapper.hidden = draft.refund || !draft.saveTemplate;
    templateCheckLabel.hidden = draft.refund;

    const refundCheck = document.createElement('input');
    refundCheck.type = 'checkbox';
    refundCheck.id = 'add-refund';
    refundCheck.checked = draft.refund;
    const refundLabel = document.createElement('label');
    refundLabel.className = 'check-row';
    refundLabel.htmlFor = 'add-refund';
    refundLabel.append(refundCheck, element('span', '', 'Refund (money back from a shop)'));

    const notePlus = document.createElement('button');
    notePlus.type = 'button';
    notePlus.className = 'add-plus-btn';
    notePlus.setAttribute('aria-label', 'Add note as subcategory');
    notePlus.textContent = '+';
    notePlus.hidden = draft.note.trim() === '';

    const noteRow = document.createElement('div');
    noteRow.className = 'add-field-row';
    noteRow.append(noteInput, notePlus);

    const noteField = buildField('add-note', 'Note (what was it?)', noteRow);
    noteRow.removeAttribute('id');
    noteInput.id = 'add-note';
    noteField.control = noteInput;

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.required = true;
    dateInput.setAttribute('aria-required', 'true');
    dateInput.value = draft.date;
    const dateField = buildField('add-date', 'Date', dateInput);

    const formError = document.createElement('p');
    formError.id = 'add-form-error';
    formError.className = 'error-text';
    formError.setAttribute('role', 'alert');
    formError.tabIndex = -1;
    formError.hidden = true;

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'Add expense';

    function subcategoriesOf(categoryId) {
        return findCategory(ctx.data, categoryId)?.subcategories ?? [];
    }

    function rebuildSubcategories() {
        const subcategories = subcategoriesOf(categorySelect.value);
        const hasSubcategories = subcategories.length > 0;

        subcategorySelect.replaceChildren(
            option('', 'Choose a subcategory'),
            ...subcategories.map(({ id, name }) => option(id, name)),
        );
        subcategorySelect.required = hasSubcategories;
        subcategorySelect.setAttribute('aria-required', String(hasSubcategories));
        subcategorySelect.value = subcategories.some(({ id }) => id === draft.subcategoryId)
            ? draft.subcategoryId
            : '';
        draft.subcategoryId = subcategorySelect.value;
        subcategoryField.wrapper.hidden = !hasSubcategories;
        clearError(subcategoryField);
    }

    categoryPlus.addEventListener('click', () => {
        confirmNoteAsSub = false;
        addingCategory = true;
        addCategoryError = '';
        ctx.render();
    });

    notePlus.addEventListener('click', () => {
        const noteName = noteInput.value.trim();
        if (noteName === '') {
            return;
        }
        if (categorySelect.value === '') {
            setError(categoryField, 'Choose a category first.');
            categorySelect.focus();
            return;
        }
        addingCategory = false;
        addCategoryError = '';
        confirmNoteAsSub = true;
        ctx.render();
    });

    categorySelect.addEventListener('change', () => {
        draft.categoryId = categorySelect.value;
        draft.subcategoryId = '';
        clearError(categoryField);
        rebuildSubcategories();
    });
    subcategorySelect.addEventListener('change', () => {
        draft.subcategoryId = subcategorySelect.value;
        clearError(subcategoryField);
    });
    amountInput.addEventListener('input', () => {
        draft.amount = amountInput.value;
        clearError(amountField);
    });
    noteInput.addEventListener('input', () => {
        draft.note = noteInput.value;
        notePlus.hidden = noteInput.value.trim() === '';
        if (noteInput.value.trim() === '') {
            confirmNoteAsSub = false;
        }
    });
    dateInput.addEventListener('change', () => {
        draft.date = dateInput.value;
        clearError(dateField);
    });

    function defaultTemplateName() {
        const note = noteInput.value.trim();
        const name = note !== ''
            ? note
            : expenseEntryLabel(ctx.data, categorySelect.value, subcategorySelect.value)
                .split(' \u00b7 ')
                .pop();
        return categorySelect.value === '' && note === '' ? '' : name.slice(0, TEMPLATE_NAME_MAX);
    }

    templateCheck.addEventListener('change', () => {
        draft.saveTemplate = templateCheck.checked;
        templateNameField.wrapper.hidden = refundCheck.checked || !templateCheck.checked;
        clearError(templateNameField);
        if (templateCheck.checked && templateNameInput.value.trim() === '') {
            templateNameInput.value = defaultTemplateName();
            draft.templateName = templateNameInput.value;
        }
    });
    refundCheck.addEventListener('change', () => {
        draft.refund = refundCheck.checked;
        templateCheckLabel.hidden = refundCheck.checked;
        templateNameField.wrapper.hidden = refundCheck.checked || !templateCheck.checked;
        clearError(templateNameField);
    });
    templateNameInput.addEventListener('input', () => {
        draft.templateName = templateNameInput.value;
        clearError(templateNameField);
    });

    const categoryPanelHost = document.createElement('div');
    categoryPanelHost.className = 'add-quick-panel-host';

    if (addingCategory) {
        const panel = document.createElement('div');
        panel.className = 'add-quick-panel stack';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Add category');

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.autocomplete = 'off';
        nameInput.placeholder = 'Category name';
        nameInput.value = addCategoryName;
        nameInput.id = 'add-quick-category-name';
        const nameField = buildField('add-quick-category-name', 'New category name', nameInput);
        if (addCategoryError !== '') {
            setError(nameField, addCategoryError);
        }

        nameInput.addEventListener('input', () => {
            addCategoryName = nameInput.value;
            addCategoryError = '';
            clearError(nameField);
        });

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn';
        cancelBtn.textContent = 'Cancel';

        const actions = document.createElement('div');
        actions.className = 'add-quick-actions';
        actions.append(cancelBtn, saveBtn);

        cancelBtn.addEventListener('click', () => {
            closeQuickPanels();
            ctx.render();
        });

        saveBtn.addEventListener('click', () => {
            const name = addCategoryName.trim();
            if (name === '') {
                addCategoryError = 'Enter a name.';
                setError(nameField, addCategoryError);
                nameInput.focus();
                return;
            }

            const existing = selectableCategories(ctx.data).find(({ name: n }) => namesMatch(n, name));
            if (existing !== undefined) {
                draft.categoryId = existing.id;
                draft.subcategoryId = '';
                closeQuickPanels();
                if (ctx.save() !== false) {
                    ctx.toast('Category already exists');
                }
                ctx.render();
                return;
            }

            const category = createNoLimitCategory(ctx, name);
            if (category === null) {
                addCategoryError = canAddExpenseCategory(ctx.data).reason;
                setError(nameField, addCategoryError);
                nameInput.focus();
                return;
            }
            draft.categoryId = category.id;
            draft.subcategoryId = '';
            closeQuickPanels();

            if (ctx.save() === false) {
                ctx.data.categories.splice(ctx.data.categories.indexOf(category), 1);
                syncCategoryPlanFields(
                    ctx.data.categories,
                    ctx.data.settings.monthlyBudgetCents,
                );
                refreshCurrentMonthPlan(ctx.data);
                saveError = 'Could not save to this device. Try again.';
                focusSaveErrorOnRender = true;
                ctx.render();
                return;
            }

            ctx.render();
            ctx.toast('Category added');
        });

        panel.append(nameField.wrapper, actions);
        categoryPanelHost.append(panel);
    }

    const notePanelHost = document.createElement('div');
    notePanelHost.className = 'add-quick-panel-host';

    if (confirmNoteAsSub) {
        const noteName = draft.note.trim();
        const parent = findCategory(ctx.data, draft.categoryId);
        const panel = document.createElement('div');
        panel.className = 'add-quick-panel stack';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Add subcategory from note');

        const copy = document.createElement('p');
        copy.className = 'confirm-copy';
        const parentLabel = parent?.name ?? 'this category';
        copy.textContent = `Add \u201c${noteName}\u201d as a subcategory of ${parentLabel}?`;

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-primary';
        addBtn.textContent = 'Add';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn';
        cancelBtn.textContent = 'Cancel';

        const actions = document.createElement('div');
        actions.className = 'add-quick-actions';
        actions.append(cancelBtn, addBtn);

        cancelBtn.addEventListener('click', () => {
            confirmNoteAsSub = false;
            ctx.render();
        });

        addBtn.addEventListener('click', () => {
            if (draft.categoryId === '' || parent === undefined) {
                confirmNoteAsSub = false;
                setError(categoryField, 'Choose a category first.');
                categorySelect.focus();
                return;
            }

            const existing = parent.subcategories.find(({ name }) => namesMatch(name, noteName));
            if (existing !== undefined) {
                draft.subcategoryId = existing.id;
                confirmNoteAsSub = false;
                ctx.render();
                ctx.toast('Subcategory already exists');
                return;
            }

            const allowed = canAddSubcategory(ctx.data);
            if (allowed.ok !== true) {
                confirmNoteAsSub = false;
                saveError = allowed.reason;
                focusSaveErrorOnRender = true;
                ctx.render();
                return;
            }

            const subcategory = {
                id: createId('sub'),
                name: noteName,
            };
            parent.subcategories.push(subcategory);
            draft.subcategoryId = subcategory.id;
            confirmNoteAsSub = false;

            if (ctx.save() === false) {
                parent.subcategories.splice(parent.subcategories.indexOf(subcategory), 1);
                draft.subcategoryId = '';
                saveError = 'Could not save to this device. Try again.';
                focusSaveErrorOnRender = true;
                ctx.render();
                return;
            }

            ctx.render();
            ctx.toast('Subcategory added');
        });

        panel.append(copy, actions);
        notePanelHost.append(panel);
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        saveError = '';
        formError.textContent = '';
        formError.hidden = true;

        const categoryId = categorySelect.value;
        const subcategories = subcategoriesOf(categoryId);
        const subcategoryId = subcategories.length > 0 ? subcategorySelect.value : '';
        const amounts = currency.read();
        const { amountCents } = amounts;
        const date = dateInput.value;
        const wantsTemplate = templateCheck.checked && !refundCheck.checked;
        const templateName = wantsTemplate
            ? (templateNameInput.value.trim() || defaultTemplateName())
            : '';
        let firstInvalid = null;

        for (const field of [
            categoryField,
            subcategoryField,
            currency.originalField,
            amountField,
            dateField,
            templateNameField,
        ]) {
            clearError(field);
        }

        if (categoryId === '') {
            setError(categoryField, 'Choose a category.');
            firstInvalid ??= categorySelect;
        }
        if (subcategories.length > 0 && subcategoryId === '') {
            setError(subcategoryField, 'Choose a subcategory.');
            firstInvalid ??= subcategorySelect;
        }
        if (amounts.originalAmountCents === null) {
            setError(currency.originalField, originalErrorText(amounts.currency));
            firstInvalid ??= currency.originalField.control;
        }
        if (amountCents === null) {
            setError(amountField, amountErrorText(amounts.currency));
            firstInvalid ??= amountInput;
        }
        if (monthKeyOf(date) === null) {
            setError(dateField, 'Choose a date.');
            firstInvalid ??= dateInput;
        }
        if (wantsTemplate && templateName === '') {
            setError(templateNameField, 'Enter a template name.');
            firstInvalid ??= templateNameInput;
        } else if (templateName.length > TEMPLATE_NAME_MAX) {
            setError(
                templateNameField,
                `Template name must be ${TEMPLATE_NAME_MAX} characters or fewer.`,
            );
            firstInvalid ??= templateNameInput;
        }

        if (firstInvalid !== null) {
            firstInvalid.focus();
            return;
        }

        const monthKey = monthKeyOf(date);
        const planWasAlreadyFrozen = Object.hasOwn(ctx.data.monthPlans, monthKey);
        const expense = newExpenseRecord({
            categoryId,
            subcategoryId,
            amountCents,
            note: noteInput.value.trim(),
            date,
            currency: amounts.currency,
            originalAmountCents: amounts.originalAmountCents,
            refund: refundCheck.checked,
        });

        ctx.data.expenses.push(expense);
        freezeMonthPlan(ctx.data, monthKey);

        let template = null;
        if (wantsTemplate) {
            const added = addTemplate(ctx.data, {
                name: templateName,
                categoryId,
                subcategoryId,
                amountCents,
                note: expense.note,
            });
            template = added.ok ? added.template : null;
        }

        const details = [describeForeign(expense)];
        if (template !== null) {
            details.push(`Saved as template \u201c${template.name}\u201d`);
        }
        lastAdded = {
            kind: 'expense',
            amountCents,
            refund: expense.refund,
            label: expenseEntryLabel(ctx.data, categoryId, subcategoryId),
            details: details.filter((line) => line !== ''),
        };
        closeQuickPanels();
        openAddPanel('added');

        if (ctx.save() === false) {
            ctx.data.expenses.splice(ctx.data.expenses.indexOf(expense), 1);
            if (!planWasAlreadyFrozen) {
                delete ctx.data.monthPlans[monthKey];
            }
            if (template !== null) {
                ctx.data.templates.splice(ctx.data.templates.indexOf(template), 1);
            }

            lastAdded = null;
            openAddPanel('expense');
            saveError = 'Could not save to this device. Nothing was recorded.'
                + ' Your entry is still here, so you can try again.';
            focusSaveErrorOnRender = true;
            ctx.render();
            return;
        }

        draft.categoryId = categoryId;
        draft.subcategoryId = subcategoryId;
        draft.amount = '';
        draft.note = '';
        draft.date = date;
        draft.currency = 'EUR';
        draft.originalAmount = '';
        draft.saveTemplate = false;
        draft.templateName = '';
        draft.refund = false;
    });

    form.append(
        categoryField.wrapper,
        categoryPanelHost,
        subcategoryField.wrapper,
        currency.currencyField.wrapper,
        currency.originalField.wrapper,
        amountField.wrapper,
        refundLabel,
        noteField.wrapper,
        notePanelHost,
        dateField.wrapper,
        templateCheckLabel,
        templateNameField.wrapper,
        formError,
        submitButton,
        backToHomeButton(ctx),
    );
    rebuildSubcategories();
    root.append(form);

    const focusForm = takeFocusRequest();
    if (saveError !== '') {
        formError.textContent = saveError;
        formError.hidden = false;
    }

    if (focusSaveErrorOnRender) {
        focusSaveErrorOnRender = false;
        formError.focus();
    } else if (addingCategory) {
        document.getElementById('add-quick-category-name')?.focus();
    } else if (focusAmountOnRender) {
        focusAmountOnRender = false;
        amountInput.focus();
    } else if (focusForm) {
        categorySelect.focus();
    }
}
