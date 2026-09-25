import { parseAmount, formatEuro } from '../../money.js';
import { refreshCurrentMonthPlan, syncCategoryPlanFields } from '../../budget.js';
import {
    element,
    displayPercent,
    persist,
    buildField,
    setError,
    clearError,
    centsInputValue,
} from './shared.js';

const planDraft = {
    userName: null,
    budget: null,
    income: null,
    errorField: '',
    error: '',
};

export function renderWarnings(root, plan) {
    if (plan.leftoverPercent > 0 && plan.flexibleCount > 0) {
        const leftover = element('section', 'card plan-note');
        leftover.append(element(
            'p',
            '',
            `Leftover ${displayPercent(plan.leftoverPercent)} is split equally`
                + ` across ${plan.flexibleCount} flexible`
                + (plan.flexibleCount === 1 ? ' category' : ' categories')
                + ` (${displayPercent(plan.flexiblePercentEach)} each).`,
        ));
        root.append(leftover);
    }

    if (plan.unallocatedPercent > 0) {
        const unallocated = element('section', 'card warning-card');
        unallocated.append(element(
            'p',
            '',
            `Unallocated ${displayPercent(plan.unallocatedPercent)}`
                + ` (${formatEuro(plan.unallocatedCents)}). No flexible category`
                + ' can receive the remainder.',
        ));
        root.append(unallocated);
    }

    if (plan.warnings.flexibleWithoutBudget) {
        const warning = element('section', 'card warning-card');
        warning.append(element(
            'p',
            '',
            'Some categories have no budget because pinned shares already total 100%.',
        ));
        root.append(warning);
    }

    if (plan.warnings.pinnedOverflow) {
        const overflow = plan.pinnedTotalPercent - 100;
        const warning = element('section', 'card warning-card');
        warning.append(element(
            'p',
            '',
            `Pinned shares total ${displayPercent(plan.pinnedTotalPercent)}`
                + ` (${displayPercent(overflow)} over the 100% maximum).`,
        ));
        root.append(warning);
    }
}

function savePlan(ctx, nameField, budgetField, incomeField) {
    clearError(nameField);
    clearError(budgetField);
    clearError(incomeField);
    planDraft.error = '';
    planDraft.errorField = '';

    planDraft.userName = nameField.control.value;
    planDraft.budget = budgetField.control.value;
    planDraft.income = incomeField.control.value;

    const userName = String(planDraft.userName ?? '').trim();
    if (userName === '') {
        planDraft.errorField = 'name';
        planDraft.error = 'Enter your name.';
        setError(nameField, planDraft.error);
        nameField.control.focus();
        return;
    }

    const budgetCents = parseAmount(planDraft.budget, { allowZero: true });
    if (budgetCents === null) {
        planDraft.errorField = 'budget';
        planDraft.error = 'Enter a valid amount of zero or more.';
        setError(budgetField, planDraft.error);
        budgetField.control.focus();
        return;
    }

    const incomeCents = parseAmount(planDraft.income, { allowZero: true });
    if (incomeCents === null) {
        planDraft.errorField = 'income';
        planDraft.error = 'Enter a valid amount of zero or more.';
        setError(incomeField, planDraft.error);
        incomeField.control.focus();
        return;
    }

    ctx.data.settings.userName = userName;
    ctx.data.settings.monthlyBudgetCents = budgetCents;
    syncCategoryPlanFields(ctx.data.categories, budgetCents);
    ctx.data.settings.usualMonthlyIncomeCents = incomeCents;
    refreshCurrentMonthPlan(ctx.data);

    planDraft.userName = null;
    planDraft.budget = null;
    planDraft.income = null;
    planDraft.error = '';
    planDraft.errorField = '';

    if (persist(ctx)) {
        ctx.toast('Plan saved');
    }
}

export function renderPlanSection(ctx) {
    const settings = ctx.data.settings;
    const section = element('section', 'card stack');
    section.id = 'more-plan';
    section.append(element('h2', 'section-title', 'Plan'));

    const form = element('form', 'stack plan-form');
    form.noValidate = true;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'given-name';
    nameInput.placeholder = 'Your first name';
    nameInput.maxLength = 40;
    nameInput.value = planDraft.userName ?? settings.userName ?? '';
    const nameField = buildField('plan-name', 'Your name', nameInput);
    nameInput.addEventListener('input', () => {
        planDraft.userName = nameInput.value;
        clearError(nameField);
    });

    const budgetInput = document.createElement('input');
    budgetInput.type = 'text';
    budgetInput.inputMode = 'decimal';
    budgetInput.autocomplete = 'off';
    budgetInput.placeholder = '1000';
    budgetInput.value = centsInputValue(settings.monthlyBudgetCents, planDraft.budget);
    const budgetField = buildField('plan-budget', 'Monthly spend budget (EUR)', budgetInput);
    budgetInput.addEventListener('input', () => {
        planDraft.budget = budgetInput.value;
        clearError(budgetField);
    });

    const incomeInput = document.createElement('input');
    incomeInput.type = 'text';
    incomeInput.inputMode = 'decimal';
    incomeInput.autocomplete = 'off';
    incomeInput.placeholder = '2000';
    incomeInput.value = centsInputValue(settings.usualMonthlyIncomeCents, planDraft.income);
    const incomeField = buildField('plan-income', 'Usual monthly income (EUR)', incomeInput);
    incomeInput.addEventListener('input', () => {
        planDraft.income = incomeInput.value;
        clearError(incomeField);
    });

    if (planDraft.error !== '') {
        if (planDraft.errorField === 'name') {
            setError(nameField, planDraft.error);
        } else if (planDraft.errorField === 'budget') {
            setError(budgetField, planDraft.error);
        } else if (planDraft.errorField === 'income') {
            setError(incomeField, planDraft.error);
        }
    }

    const submit = element('button', 'btn btn-primary', 'Save plan');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        savePlan(ctx, nameField, budgetField, incomeField);
    });

    form.append(
        nameField.wrapper,
        budgetField.wrapper,
        incomeField.wrapper,
        element(
            'p',
            'muted',
            'Usual monthly income is applied automatically each month in Month totals. '
                + 'On Home, add only extra income such as a bonus or a gift. This salary is already counted.',
        ),
        submit,
    );
    section.append(form);
    return section;
}
