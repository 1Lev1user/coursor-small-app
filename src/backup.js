import { normalise } from './model.js';
import { todayISO } from './months.js';

export function countRecords(data) {
    return {
        expenses: data.expenses.length,
        incomes: data.incomes.length,
        subscriptions: data.subscriptions.length,
    };
}

export function exportBackup(data, now) {
    return {
        filename: `my-expenses-backup-${todayISO(now)}.json`,
        json: JSON.stringify(data, null, 2),
    };
}

export function importBackup(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        return { ok: false, reason: 'File is not valid JSON.' };
    }

    const result = normalise(parsed);
    if (!result.ok) {
        return { ok: false, reason: result.reason };
    }

    return { ok: true, data: result.data };
}
