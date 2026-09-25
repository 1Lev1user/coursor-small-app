import { undoImport, upsertRule, deleteRule, ruleKind } from '../../import/core.js';
import { resetImport } from '../import.js';
import { element, actionButton, persist } from './shared.js';

const RULE_KIND_LABELS = {
    expense: 'Expense',
    refund: 'Refund',
    income: 'Income',
    transfer: 'Transfer',
    skip: 'Skip',
};

const DATE_ORDER = {
    DMY: 'Day first dates',
    MDY: 'Month first dates',
    YMD: 'Year first dates',
};

const local = {
    confirmUndoId: null,
    editRuleId: null,
    ruleDraft: null,
    ruleError: '',
    confirmRuleId: null,
    confirmLayoutId: null,
    focusId: null,
};

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

function shortDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function importCountsText(counts) {
    const parts = [plural(counts.expenses ?? 0, 'expense', 'expenses')];
    if (counts.incomes) parts.push(plural(counts.incomes, 'income', 'incomes'));
    if (counts.refunds) parts.push(plural(counts.refunds, 'refund', 'refunds'));
    if (counts.transfers) parts.push(plural(counts.transfers, 'transfer', 'transfers'));
    if (counts.duplicates) parts.push(`${plural(counts.duplicates, 'duplicate', 'duplicates')} left out`);
    if (counts.skipped) parts.push(`${counts.skipped} skipped`);
    return parts.join(' · ');
}

export function ruleTargetText(data, rule) {
    const kind = ruleKind(rule);
    if (kind === 'transfer') return 'Transfer (not counted)';
    if (kind === 'skip') return 'Skip';
    if (kind === 'income') {
        const income = (data.incomeCategories ?? []).find(({ id }) => id === rule.incomeCategoryId);
        return `Income · ${income?.name ?? 'Unknown category'}`;
    }
    const category = (data.categories ?? []).find(({ id }) => id === rule.categoryId);
    const sub = category?.subcategories?.find(({ id }) => id === rule.subcategoryId);
    const names = [category?.name ?? 'Unknown category', sub?.name].filter(Boolean).join(' · ');
    return `${kind === 'refund' ? 'Refund' : 'Expense'} · ${names}`;
}

function focusLater(id) {
    local.focusId = id;
    queueMicrotask(() => {
        if (local.focusId === null) return;
        const target = document.getElementById(local.focusId);
        local.focusId = null;
        target?.focus({ preventScroll: true });
    });
}

function rerender(ctx, focusId) {
    ctx.render();
    if (focusId) focusLater(focusId);
}

function selectField(id, labelText, items, value, onChange) {
    const wrapper = element('div', 'field');
    const label = element('label', '', labelText);
    label.htmlFor = id;
    const select = document.createElement('select');
    select.id = id;
    for (const [itemValue, text] of items) {
        const node = element('option', '', text);
        node.value = itemValue;
        node.selected = itemValue === value;
        select.append(node);
    }
    select.addEventListener('change', () => onChange(select.value));
    wrapper.append(label, select);
    return wrapper;
}

function confirmBox(message, confirmLabel, onConfirm, onCancel) {
    const box = element('div', 'confirm-box');
    box.setAttribute('role', 'group');
    const cancel = actionButton('btn', 'Cancel', onCancel);
    box.append(
        element('p', 'confirm-copy', message),
        cancel,
        actionButton('btn btn-danger', confirmLabel, onConfirm),
    );
    queueMicrotask(() => cancel.focus({ preventScroll: true }));
    return box;
}

// ---------------------------------------------------------------------------
// Import log
// ---------------------------------------------------------------------------

function importItem(ctx, record) {
    const item = element('li', record.undoneAt ? 'entry-item imp-log is-undone' : 'entry-item imp-log');
    const row = element('div', 'entry-row');
    const text = element('div', 'entry-description');
    text.append(
        element('p', 'entry-name', record.source?.fileName || record.source?.format || 'Import'),
        element('p', 'muted', `Imported ${shortDate(record.createdAt)}`),
        element('p', 'muted', importCountsText(record.counts ?? {})),
    );
    if (record.periodFrom) {
        text.append(element('p', 'muted', record.periodFrom === record.periodTo
            ? `Period ${record.periodFrom}`
            : `Period ${record.periodFrom} to ${record.periodTo}`));
    }
    row.append(text);
    if (record.undoneAt) {
        row.append(element('span', 'pill', 'Undone'));
    }
    item.append(row);

    if (!record.undoneAt) {
        const entries = (record.expenseIds?.length ?? 0) + (record.incomeIds?.length ?? 0);
        if (local.confirmUndoId === record.id) {
            item.append(confirmBox(
                `Remove the ${plural(entries, 'entry', 'entries')} added by this import? Rules you saved stay.`,
                'Undo import',
                () => {
                    local.confirmUndoId = null;
                    undoImport(ctx.data, record.id);
                    if (persist(ctx)) ctx.toast('Import undone');
                },
                () => {
                    local.confirmUndoId = null;
                    rerender(ctx, `imp-undo-${record.id}`);
                },
            ));
        } else {
            const undo = actionButton('btn btn-ghost-danger', 'Undo', () => {
                local.confirmUndoId = record.id;
                ctx.render();
            });
            undo.id = `imp-undo-${record.id}`;
            undo.setAttribute('aria-label', `Undo import of ${record.source?.fileName || 'this file'}`);
            const actions = element('div', 'entry-actions');
            actions.append(undo);
            item.append(actions);
        }
    }
    return item;
}

export function renderImportSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-import';
    section.append(
        element('h2', 'section-title', 'Import'),
        element('p', 'muted', 'Add transactions from a bank statement file. The file is read on this device. Nothing is uploaded.'),
        actionButton('btn btn-primary', 'Import a bank statement', () => {
            resetImport();
            ctx.goTo('import');
        }),
    );

    const records = [...(ctx.data.imports ?? [])]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (records.length === 0) {
        section.append(element('p', 'muted', 'No imports yet.'));
        return section;
    }
    section.append(element('h3', 'category-name', 'Past imports'));
    const list = element('ul', 'entry-list imp-list');
    for (const record of records) list.append(importItem(ctx, record));
    section.append(list);
    return section;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function startEdit(ctx, rule) {
    local.editRuleId = rule.id;
    local.confirmRuleId = null;
    local.ruleError = '';
    local.ruleDraft = {
        kind: ruleKind(rule),
        categoryId: rule.categoryId,
        subcategoryId: rule.subcategoryId,
        incomeCategoryId: rule.incomeCategoryId,
    };
    rerender(ctx, `rule-kind-${rule.id}`);
}

function ruleEditForm(ctx, rule) {
    const draft = local.ruleDraft;
    const form = element('div', 'stack imp-rule-form');
    const data = ctx.data;
    form.append(selectField(
        `rule-kind-${rule.id}`,
        'What is it?',
        Object.entries(RULE_KIND_LABELS),
        draft.kind,
        (value) => {
            draft.kind = value;
            if ((value === 'expense' || value === 'refund') && !draft.categoryId) {
                draft.categoryId = data.categories[0]?.id ?? '';
            }
            if (value === 'income' && !draft.incomeCategoryId) {
                draft.incomeCategoryId = data.incomeCategories[0]?.id ?? '';
            }
            rerender(ctx, `rule-kind-${rule.id}`);
        },
    ));
    if (draft.kind === 'expense' || draft.kind === 'refund') {
        const category = data.categories.find(({ id }) => id === draft.categoryId);
        form.append(
            selectField(
                `rule-cat-${rule.id}`,
                'Category',
                [['', 'Choose'], ...data.categories.map(({ id, name }) => [id, name])],
                draft.categoryId,
                (value) => {
                    draft.categoryId = value;
                    draft.subcategoryId = '';
                    rerender(ctx, `rule-cat-${rule.id}`);
                },
            ),
            selectField(
                `rule-sub-${rule.id}`,
                'Subcategory',
                [['', 'No subcategory'], ...(category?.subcategories ?? []).map(({ id, name }) => [id, name])],
                draft.subcategoryId,
                (value) => {
                    draft.subcategoryId = value;
                },
            ),
        );
    } else if (draft.kind === 'income') {
        form.append(selectField(
            `rule-income-${rule.id}`,
            'Income category',
            data.incomeCategories.map(({ id, name }) => [id, name]),
            draft.incomeCategoryId,
            (value) => {
                draft.incomeCategoryId = value;
            },
        ));
    }
    if (local.ruleError !== '') {
        const error = element('p', 'error-text', local.ruleError);
        error.setAttribute('role', 'alert');
        form.append(error);
    }
    const buttons = element('div', 'more-actions');
    buttons.append(
        actionButton('btn btn-primary', 'Save rule', () => {
            if ((draft.kind === 'expense' || draft.kind === 'refund') && !draft.categoryId) {
                local.ruleError = 'Choose a category.';
                rerender(ctx, `rule-cat-${rule.id}`);
                return;
            }
            const result = upsertRule(data, {
                id: rule.id,
                pattern: rule.pattern,
                kind: draft.kind === 'refund' ? 'expense' : draft.kind,
                refund: draft.kind === 'refund',
                categoryId: draft.categoryId,
                subcategoryId: draft.subcategoryId,
                incomeCategoryId: draft.incomeCategoryId,
            });
            if (!result.ok) {
                local.ruleError = result.reason;
                ctx.render();
                return;
            }
            local.editRuleId = null;
            local.ruleDraft = null;
            local.ruleError = '';
            if (persist(ctx)) {
                ctx.toast('Rule saved');
                focusLater(`rule-edit-${rule.id}`);
            }
        }),
        actionButton('btn', 'Cancel', () => {
            local.editRuleId = null;
            local.ruleDraft = null;
            local.ruleError = '';
            rerender(ctx, `rule-edit-${rule.id}`);
        }),
    );
    form.append(buttons);
    return form;
}

function ruleItem(ctx, rule) {
    const item = element('li', 'entry-item');
    const row = element('div', 'entry-row');
    const text = element('div', 'entry-description');
    text.append(
        element('p', 'entry-name imp-pattern', rule.pattern),
        element('p', 'muted', ruleTargetText(ctx.data, rule)),
    );
    row.append(text);
    item.append(row);

    if (local.editRuleId === rule.id) {
        item.append(ruleEditForm(ctx, rule));
        return item;
    }
    if (local.confirmRuleId === rule.id) {
        item.append(confirmBox(
            `Delete the rule for ${rule.pattern}? Entries already imported stay.`,
            'Delete',
            () => {
                local.confirmRuleId = null;
                deleteRule(ctx.data, rule.id);
                if (persist(ctx)) ctx.toast('Rule deleted');
            },
            () => {
                local.confirmRuleId = null;
                rerender(ctx, `rule-delete-${rule.id}`);
            },
        ));
        return item;
    }
    const edit = actionButton('btn btn-ghost', 'Edit', () => startEdit(ctx, rule));
    edit.id = `rule-edit-${rule.id}`;
    edit.setAttribute('aria-label', `Edit rule ${rule.pattern}`);
    const remove = actionButton('btn btn-ghost-danger', 'Delete', () => {
        local.confirmRuleId = rule.id;
        local.editRuleId = null;
        ctx.render();
    });
    remove.id = `rule-delete-${rule.id}`;
    remove.setAttribute('aria-label', `Delete rule ${rule.pattern}`);
    const actions = element('div', 'entry-actions');
    actions.append(edit, remove);
    item.append(actions);
    return item;
}

export function renderRulesSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-rules';
    section.append(
        element('h2', 'section-title', 'Rules'),
        element('p', 'muted', 'Rules sort imported rows by text in their description. The longest matching text wins.'),
    );
    const rules = [...(ctx.data.rules ?? [])].sort((a, b) => a.pattern.localeCompare(b.pattern));
    if (rules.length === 0) {
        section.append(element('p', 'muted', 'No rules yet. Tick Remember while importing to add one.'));
        return section;
    }
    const list = element('ul', 'entry-list imp-list');
    for (const rule of rules) list.append(ruleItem(ctx, rule));
    section.append(list);
    return section;
}

// ---------------------------------------------------------------------------
// Bank layouts
// ---------------------------------------------------------------------------

function layoutItem(ctx, layout) {
    const item = element('li', 'entry-item');
    const row = element('div', 'entry-row');
    const text = element('div', 'entry-description');
    const decimal = layout.decimalSeparator === ',' ? 'comma decimals' : 'dot decimals';
    text.append(
        element('p', 'entry-name', layout.name || 'Bank'),
        element('p', 'muted', `${DATE_ORDER[layout.dateFormat] ?? 'Dates'}, ${decimal}`),
    );
    row.append(text);
    item.append(row);

    if (local.confirmLayoutId === layout.id) {
        item.append(confirmBox(
            `Delete the saved columns for ${layout.name || 'this bank'}? You will be asked to check the columns next time.`,
            'Delete',
            () => {
                local.confirmLayoutId = null;
                const index = ctx.data.bankLayouts.findIndex(({ id }) => id === layout.id);
                if (index !== -1) ctx.data.bankLayouts.splice(index, 1);
                if (persist(ctx)) ctx.toast('Layout deleted');
            },
            () => {
                local.confirmLayoutId = null;
                rerender(ctx, `layout-delete-${layout.id}`);
            },
        ));
        return item;
    }
    const remove = actionButton('btn btn-ghost-danger', 'Delete', () => {
        local.confirmLayoutId = layout.id;
        ctx.render();
    });
    remove.id = `layout-delete-${layout.id}`;
    remove.setAttribute('aria-label', `Delete layout ${layout.name || 'Bank'}`);
    const actions = element('div', 'entry-actions');
    actions.append(remove);
    item.append(actions);
    return item;
}

export function renderLayoutsSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-layouts';
    section.append(
        element('h2', 'section-title', 'Bank layouts'),
        element('p', 'muted', 'Saved columns for CSV and Excel files, so the next import skips the columns step.'),
    );
    const layouts = ctx.data.bankLayouts ?? [];
    if (layouts.length === 0) {
        section.append(element('p', 'muted', 'No saved layouts yet.'));
        return section;
    }
    const list = element('ul', 'entry-list imp-list');
    for (const layout of layouts) list.append(layoutItem(ctx, layout));
    section.append(list);
    return section;
}
