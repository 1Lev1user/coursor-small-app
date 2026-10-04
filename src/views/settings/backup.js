import { todayISO, fullDate } from '../../months.js';
import {
    exportBackup,
    importBackup,
    countRecords,
    mergeSettingsOnly,
    markBackedUp,
    describeBackup,
    restoredLastBackup,
} from '../../backup.js';
import { buildMonthCsv, csvFilename } from '../../csv.js';
import { downloadText } from '../../files.js';
import {
    readPreUpdateCopy,
    deletePreUpdateCopy,
    restorePreUpdateCopy,
    readRescueCopy,
    deleteRescueCopy,
} from '../../storage.js';
import {
    element,
    persist,
    actionButton,
    renderConfirm,
    state,
} from './shared.js';

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

function needsBackupReminder(data, now = new Date()) {
    if (!hasBackupWorthyData(data)) {
        return false;
    }
    const last = data.settings.lastBackupISO;
    if (last === null || last === undefined || last === '') {
        return true;
    }
    return calendarDaysBetween(last, todayISO(now)) > 30;
}

function replaceAppData(ctx, next) {
    for (const key of Object.keys(ctx.data)) {
        delete ctx.data[key];
    }
    Object.assign(ctx.data, next);
}

function countLabel(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}

/*
 * Downloads a full backup and records today as the last backup day. The day
 * is set before the file is made, so the file carries it too.
 */
export function doExportBackup(ctx) {
    const previous = markBackedUp(ctx.data);
    const { filename, json } = exportBackup(ctx.data);
    downloadText(filename, json, 'application/json');
    if (!persist(ctx)) {
        ctx.data.settings.lastBackupISO = previous;
        ctx.render();
        return;
    }
    ctx.toast('Backup exported');
}

function doExportMonthCsv(ctx, flavour) {
    const monthKey = ctx.monthKey;
    const text = buildMonthCsv(ctx.data, monthKey, flavour);
    downloadText(csvFilename(monthKey, flavour), text, 'text/csv');
    ctx.toast(flavour === 'europe' ? 'Europe CSV downloaded' : 'Standard CSV downloaded');
}

function beginImportBackup(ctx, file) {
    state.importError = '';
    if (file === undefined || file === null) {
        return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
        const rawText = String(reader.result ?? '');
        const preview = importBackup(rawText);
        if (preview.ok !== true) {
            state.pendingImportText = null;
            state.pendingImportCounts = null;
            state.pendingImportIncoming = null;
            state.importError = preview.reason;
            ctx.render();
            return;
        }

        state.pendingImportText = rawText;
        state.pendingImportCounts = countRecords(ctx.data);
        state.pendingImportIncoming = describeBackup(preview.data);
        state.importError = '';
        ctx.render();
    });
    reader.addEventListener('error', () => {
        state.pendingImportText = null;
        state.pendingImportCounts = null;
        state.pendingImportIncoming = null;
        state.importError = 'Could not read that file.';
        ctx.render();
    });
    reader.readAsText(file);
}

function confirmImportBackup(ctx, mode = 'all') {
    if (state.pendingImportText === null) {
        return;
    }

    const result = importBackup(state.pendingImportText);
    if (result.ok !== true) {
        state.importError = result.reason;
        state.pendingImportText = null;
        state.pendingImportCounts = null;
        state.pendingImportIncoming = null;
        ctx.render();
        return;
    }

    if (mode === 'settings') {
        replaceAppData(ctx, mergeSettingsOnly(ctx.data, result.data));
        state.pendingImportText = null;
        state.pendingImportCounts = null;
        state.pendingImportIncoming = null;
        state.importError = '';
        if (persist(ctx)) {
            ctx.toast('Settings imported');
        }
        return;
    }

    // Everything: download the current data first, then replace it. If the
    // save fails, the current data is put back; save() already reported it.
    const json = JSON.stringify(ctx.data, null, 2);
    const before = JSON.parse(json);
    if (hasBackupWorthyData(ctx.data)) {
        downloadText(`my-expenses-before-replace-${todayISO()}.json`, json, 'application/json');
    }
    result.data.settings.lastBackupISO = restoredLastBackup(
        result.data.settings.lastBackupISO,
        todayISO(),
    );
    replaceAppData(ctx, result.data);
    state.pendingImportText = null;
    state.pendingImportCounts = null;
    state.pendingImportIncoming = null;
    state.importError = '';
    if (!persist(ctx)) {
        replaceAppData(ctx, before);
        ctx.render();
        return;
    }
    ctx.toast('Backup imported');
}

/*
 * Checks the copy first, downloads the current data, then replaces it.
 * If the save fails, the current data is put back; save() already
 * reported the error.
 */
function restorePreUpdate(ctx) {
    state.confirmRestorePreUpdate = false;
    const result = restorePreUpdateCopy();
    if (result.ok !== true) {
        ctx.toast(result.reason);
        ctx.render();
        return;
    }

    const json = JSON.stringify(ctx.data, null, 2);
    const before = JSON.parse(json);
    downloadText(`my-expenses-before-restore-${todayISO()}.json`, json, 'application/json');
    replaceAppData(ctx, result.data);
    if (!persist(ctx)) {
        replaceAppData(ctx, before);
        ctx.render();
        return;
    }
    ctx.toast('Pre-update copy restored');
}

export function renderBackupReminder(ctx) {
    if (!needsBackupReminder(ctx.data)) {
        return null;
    }

    const card = element('section', 'card stack backup-reminder');
    card.setAttribute('role', 'status');
    card.append(
        element('h2', 'section-title', 'Backup reminder'),
        element(
            'p',
            '',
            'Your last backup is missing or more than 30 days old. Export a JSON'
                + ' backup so you can restore your data on this or another device.',
        ),
        actionButton('btn btn-primary', 'Export backup now', () => {
            doExportBackup(ctx);
        }),
    );
    return card;
}

export function renderBackupSection(ctx) {
    const section = element('section', 'card stack');
    section.id = 'more-backup';
    section.append(element('h2', 'section-title', 'Backup & export'));

    const backupActions = element('div', 'backup-actions');
    backupActions.append(
        actionButton('btn btn-primary', 'Export backup (JSON)', () => {
            doExportBackup(ctx);
        }),
    );

    const importLabel = element('label', 'btn backup-file-label');
    importLabel.textContent = 'Import backup';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.className = 'backup-file-input';
    fileInput.setAttribute('aria-label', 'Choose backup JSON file');
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        beginImportBackup(ctx, file);
        fileInput.value = '';
    });
    importLabel.append(fileInput);
    backupActions.append(importLabel);
    section.append(backupActions);

    if (state.importError !== '') {
        const error = element('p', 'error-text', state.importError);
        error.setAttribute('role', 'alert');
        section.append(error);
    }

    if (
        state.pendingImportText !== null
        && state.pendingImportCounts !== null
        && state.pendingImportIncoming !== null
    ) {
        const counts = state.pendingImportCounts;
        const incoming = state.pendingImportIncoming;
        const fileDates = incoming.firstDate === ''
            ? ''
            : ` · ${fullDate(incoming.firstDate)} to ${fullDate(incoming.lastDate)}`;
        const box = element('div', 'confirm-box');
        box.setAttribute('role', 'group');
        box.append(
            element(
                'p',
                '',
                `This file: ${countLabel(incoming.expenses, 'expense', 'expenses')},`
                    + ` ${countLabel(incoming.incomes, 'income', 'incomes')},`
                    + ` ${countLabel(incoming.subscriptions, 'subscription', 'subscriptions')}`
                    + fileDates,
            ),
            element('p', 'confirm-copy', 'What should come from this backup?'),
            element(
                'p',
                '',
                `Settings only: plan, categories, subscriptions, rules, templates and goals.`
                    + ` Your ${counts.expenses} expenses and ${counts.incomes} incomes stay.`,
            ),
            actionButton('btn btn-primary', 'Settings only', () => {
                confirmImportBackup(ctx, 'settings');
            }),
            element(
                'p',
                '',
                `Everything: replaces all data. Your ${counts.expenses} expenses,`
                    + ` ${counts.incomes} incomes and ${counts.subscriptions} subscriptions`
                    + ' on this device are deleted. Your current data is downloaded first,'
                    + ' then replaced. This cannot be undone.',
            ),
            actionButton('btn btn-danger', 'Replace everything', () => {
                confirmImportBackup(ctx, 'all');
            }),
            actionButton('btn', 'Cancel', () => {
                state.pendingImportText = null;
                state.pendingImportCounts = null;
                state.pendingImportIncoming = null;
                state.importError = '';
                ctx.render();
            }),
        );
        section.append(box);
    }

    section.append(element(
        'h3',
        'category-name',
        `Month CSV (${ctx.monthKey})`,
    ));
    section.append(element(
        'p',
        'muted',
        'Download this month\'s expenses and incomes. Europe uses ; and comma decimals;'
            + ' Standard uses , and dot decimals.',
    ));

    const csvActions = element('div', 'backup-actions');
    csvActions.append(
        actionButton('btn', 'Europe CSV', () => {
            doExportMonthCsv(ctx, 'europe');
        }),
        actionButton('btn', 'Standard CSV', () => {
            doExportMonthCsv(ctx, 'standard');
        }),
    );
    section.append(csvActions);

    const preUpdate = readPreUpdateCopy();
    if (preUpdate !== null) {
        section.append(
            element('h3', 'category-name', 'Data from before the last update'),
            element(
                'p',
                'muted',
                'This device kept a copy of your data as it was before the last update.'
                    + ' If something looks wrong, use Restore pre-update copy to go back to it, or download it first.',
            ),
        );
        if (state.confirmDeletePreUpdate) {
            section.append(renderConfirm(
                'The copy is removed from this device. Your current data is not affected.',
                () => {
                    deletePreUpdateCopy();
                    state.confirmDeletePreUpdate = false;
                    ctx.toast('Pre-update copy deleted');
                    ctx.render();
                },
                () => {
                    state.confirmDeletePreUpdate = false;
                    ctx.render();
                },
            ));
        } else if (state.confirmRestorePreUpdate) {
            const box = element('div', 'confirm-box');
            box.setAttribute('role', 'group');
            box.append(
                element(
                    'p',
                    'confirm-copy',
                    'Entries added since the update are removed. Your current data is downloaded first.',
                ),
                actionButton('btn', 'Cancel', () => {
                    state.confirmRestorePreUpdate = false;
                    ctx.render();
                }),
                actionButton('btn btn-danger', 'Restore', () => {
                    restorePreUpdate(ctx);
                }),
            );
            section.append(box);
        } else {
            const preUpdateActions = element('div', 'backup-actions');
            preUpdateActions.append(
                actionButton('btn', 'Download pre-update copy', () => {
                    downloadText(`my-expenses-before-update-${todayISO()}.json`, preUpdate, 'application/json');
                }),
                actionButton('btn', 'Restore pre-update copy', () => {
                    state.confirmDeletePreUpdate = false;
                    state.confirmRestorePreUpdate = true;
                    ctx.render();
                }),
                actionButton('btn btn-ghost-danger', 'Delete this copy', () => {
                    state.confirmRestorePreUpdate = false;
                    state.confirmDeletePreUpdate = true;
                    ctx.render();
                }),
            );
            section.append(preUpdateActions);
        }
    }

    const rescue = readRescueCopy();
    if (rescue !== null) {
        section.append(
            element('h3', 'category-name', 'Saved data from a failed start'),
            element(
                'p',
                'muted',
                'This device kept a copy of data it could not read when the app last started.'
                    + ' If something looks wrong, download it and restore it with Import backup.',
            ),
        );
        if (state.confirmDeleteRescue) {
            section.append(renderConfirm(
                'The copy is removed from this device. Your current data is not affected.',
                () => {
                    deleteRescueCopy();
                    state.confirmDeleteRescue = false;
                    ctx.toast('Rescue copy deleted');
                    ctx.render();
                },
                () => {
                    state.confirmDeleteRescue = false;
                    ctx.render();
                },
            ));
        } else {
            const rescueActions = element('div', 'backup-actions');
            rescueActions.append(
                actionButton('btn', 'Download rescue copy', () => {
                    downloadText(`my-expenses-rescue-${todayISO()}.json`, rescue, 'application/json');
                }),
                actionButton('btn btn-ghost-danger', 'Delete this copy', () => {
                    state.confirmDeleteRescue = true;
                    ctx.render();
                }),
            );
            section.append(rescueActions);
        }
    }
    return section;
}
