import { amountProblem, parseAmount, formatEuro } from '../../money.js';
import { refreshCurrentMonthPlan, syncCategoryPlanFields } from '../../budget.js';
import {
    element,
    displayPercent,
    persist,
    buildField,
    setError,
    clearError,
    centsInputValue,
    actionButton,
} from './shared.js';

const planDraft = {
    budget: null,
    confirmZero: false,
    errorField: '',
    error: '',
};

export function needsZeroBudgetConfirm(savedCents, newCents) {
    return savedCents > 0 && newCents === 0;
}

export function planDraftDirty(settings, draft) {
    if (draft?.budget === null || draft?.budget === undefined) {
        return false;
    }
    const cents = parseAmount(draft.budget, { allowZero: true });
    return cents === null ? true : cents !== settings.monthlyBudgetCents;
}

const profileDraft = {
    userName: null,
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

function savePlan(ctx, budgetField, confirmed = false) {
    clearError(budgetField);
    planDraft.error = '';
    planDraft.errorField = '';

    planDraft.budget = budgetField.control.value;

    const budgetCents = parseAmount(planDraft.budget, { allowZero: true });
    if (budgetCents === null) {
        planDraft.confirmZero = false;
        planDraft.errorField = 'budget';
        planDraft.error = amountProblem(planDraft.budget, { allowZero: true });
        setError(budgetField, planDraft.error);
        budgetField.control.focus();
        return;
    }

    if (!confirmed && needsZeroBudgetConfirm(ctx.data.settings.monthlyBudgetCents, budgetCents)) {
        planDraft.confirmZero = true;
        ctx.render();
        return;
    }

    ctx.data.settings.monthlyBudgetCents = budgetCents;
    syncCategoryPlanFields(ctx.data.categories, budgetCents);
    refreshCurrentMonthPlan(ctx.data);

    planDraft.budget = null;
    planDraft.confirmZero = false;
    planDraft.error = '';
    planDraft.errorField = '';

    if (persist(ctx)) {
        ctx.toast('Budget saved');
    }
}

function saveProfile(ctx, nameField) {
    clearError(nameField);
    profileDraft.error = '';
    profileDraft.userName = nameField.control.value;

    const userName = String(profileDraft.userName ?? '').trim();
    if (userName === '') {
        profileDraft.error = 'Enter your name.';
        setError(nameField, profileDraft.error);
        nameField.control.focus();
        return;
    }

    ctx.data.settings.userName = userName;
    profileDraft.userName = null;
    profileDraft.error = '';

    if (persist(ctx)) {
        ctx.toast('Name saved');
    }
}

export function renderPlanSection(ctx) {
    const settings = ctx.data.settings;
    const section = element('section', 'card stack');
    section.id = 'more-plan';
    section.append(element('h2', 'section-title', 'Monthly budget'));

    const form = element('form', 'stack plan-form');
    form.noValidate = true;

    const budgetInput = document.createElement('input');
    budgetInput.type = 'text';
    budgetInput.inputMode = 'decimal';
    budgetInput.autocomplete = 'off';
    budgetInput.placeholder = '1000';
    budgetInput.value = centsInputValue(settings.monthlyBudgetCents, planDraft.budget);
    const budgetField = buildField('plan-budget', 'Monthly budget (EUR)', budgetInput);

    const marker = element('p', 'plan-unsaved', 'Unsaved changes');
    marker.setAttribute('role', 'status');
    const discard = actionButton('btn btn-ghost', 'Discard', () => {
        planDraft.budget = null;
        planDraft.confirmZero = false;
        planDraft.error = '';
        planDraft.errorField = '';
        ctx.render();
    });
    const syncDirty = () => {
        const dirty = planDraftDirty(settings, planDraft);
        marker.hidden = !dirty;
        discard.hidden = !dirty;
    };

    let confirmBox = null;
    budgetInput.addEventListener('input', () => {
        planDraft.budget = budgetInput.value;
        planDraft.confirmZero = false;
        confirmBox?.remove();
        confirmBox = null;
        clearError(budgetField);
        syncDirty();
    });
    syncDirty();

    if (planDraft.error !== '') {
        if (planDraft.errorField === 'budget') {
            setError(budgetField, planDraft.error);
        }
    }

    const draftCents = parseAmount(planDraft.budget ?? '', { allowZero: true });
    if (planDraft.confirmZero && needsZeroBudgetConfirm(settings.monthlyBudgetCents, draftCents)) {
        confirmBox = element('div', 'confirm-box');
        confirmBox.setAttribute('role', 'group');
        confirmBox.append(
            element(
                'p',
                'confirm-copy',
                'Are you sure? A budget of 0 makes every expense show as over budget.',
            ),
            actionButton('btn', 'Cancel', () => {
                planDraft.confirmZero = false;
                ctx.render();
            }),
            actionButton('btn btn-danger', 'Save budget 0', () => savePlan(ctx, budgetField, true)),
        );
    }

    const submit = element('button', 'btn btn-primary', 'Save budget');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        savePlan(ctx, budgetField);
    });

    form.append(
        budgetField.wrapper,
        element(
            'p',
            'muted',
            'Income is counted when it arrives: add regular incomes under Settings > Income, '
                + 'and anything else with Add income on Home.',
        ),
        marker,
        discard,
        ...(confirmBox ? [confirmBox] : []),
        submit,
    );
    section.append(form);
    return section;
}

export function renderProfileSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-profile';
    section.append(element('h2', 'section-title', 'Your name'));

    const form = element('form', 'stack plan-form');
    form.noValidate = true;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'given-name';
    nameInput.placeholder = 'Your first name';
    nameInput.maxLength = 40;
    nameInput.value = profileDraft.userName ?? ctx.data.settings.userName ?? '';
    const nameField = buildField('profile-name', 'Your name', nameInput);
    nameInput.addEventListener('input', () => {
        profileDraft.userName = nameInput.value;
        clearError(nameField);
    });

    if (profileDraft.error !== '') {
        setError(nameField, profileDraft.error);
    }

    const submit = element('button', 'btn btn-primary', 'Save name');
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveProfile(ctx, nameField);
    });

    form.append(nameField.wrapper, submit);
    section.append(form);
    return section;
}
