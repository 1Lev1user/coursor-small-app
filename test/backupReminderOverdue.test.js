import test from 'node:test';
import assert from 'node:assert/strict';
import { backupReminder } from '../src/views/add.js';

function reminderData(lastBackupISO, backupSnoozedUntil = '', entries = 1) {
    return {
        expenses: Array.from({ length: entries }, () => ({})),
        incomes: [],
        settings: { lastBackupISO, backupSnoozedUntil },
    };
}

const NOW = new Date(2026, 8, 25);

test('backup reminder is overdue at 60 days even while snoozed', () => {
    assert.deepEqual(backupReminder(reminderData('2026-07-27', '2026-09-30'), NOW), {
        level: 'overdue',
        days: 60,
    });
});

test('backup reminder is not overdue at 59 days while snoozed', () => {
    assert.equal(backupReminder(reminderData('2026-07-28', '2026-09-30'), NOW), null);
});

test('backup reminder is overdue at 90 days when not snoozed', () => {
    assert.deepEqual(backupReminder(reminderData('2026-06-27'), NOW), {
        level: 'overdue',
        days: 90,
    });
});

test('backup reminder is not overdue when never backed up and snoozed', () => {
    assert.equal(backupReminder(reminderData(null, '2026-09-30'), NOW), null);
});
