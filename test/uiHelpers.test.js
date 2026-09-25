import test from 'node:test';
import assert from 'node:assert/strict';
import { backupReminder } from '../src/views/add.js';
import { readCurrencyAmounts } from '../src/views/currencyFields.js';
import { searchFiltersFrom } from '../src/views/searchPanel.js';
import { entryAmountText, entryTagLabels } from '../src/views/entryDisplay.js';

function reminderData(lastBackupISO, backupSnoozedUntil = '', entries = 1) {
    return {
        expenses: Array.from({ length: entries }, () => ({})),
        incomes: [],
        settings: { lastBackupISO, backupSnoozedUntil },
    };
}

const NOW = new Date(2026, 8, 25);

test('backup reminder stays quiet without entries, while snoozed and before 14 days', () => {
    assert.equal(backupReminder(reminderData(null, '', 0), NOW), null);
    assert.equal(backupReminder(reminderData(null, '2026-09-30'), NOW), null);
    assert.equal(backupReminder(reminderData('2026-09-20'), NOW), null);
});

test('backup reminder is soft from 14 days and strong from 30 days or never', () => {
    assert.equal(backupReminder(reminderData('2026-09-11'), NOW).level, 'soft');
    assert.equal(backupReminder(reminderData('2026-08-26'), NOW).level, 'strong');
    assert.deepEqual(backupReminder(reminderData(null), NOW), { level: 'strong', days: null });
});

test('currency amounts keep EUR and original apart for foreign expenses', () => {
    assert.deepEqual(readCurrencyAmounts('USD', '18,40', '20.00'), {
        currency: 'USD',
        amountCents: 1840,
        originalAmountCents: 2000,
    });
    assert.deepEqual(readCurrencyAmounts('EUR', '12.40', ''), {
        currency: 'EUR',
        amountCents: 1240,
        originalAmountCents: 1240,
    });
});

test('search filters parse amounts and report whether any filter is active', () => {
    const empty = {
        text: '',
        categoryId: '',
        type: 'all',
        minAmount: '',
        maxAmount: '',
        from: '',
        to: '',
    };
    assert.equal(searchFiltersFrom(empty).active, false);

    const result = searchFiltersFrom({ ...empty, text: ' kafe ', minAmount: '5,50' });
    assert.equal(result.active, true);
    assert.equal(result.filters.text, 'kafe');
    assert.equal(result.filters.minCents, 550);

    const invalid = searchFiltersFrom({ ...empty, maxAmount: 'abc' });
    assert.notEqual(invalid.errors.maxAmount, '');
});

test('refunds read as money back and imported entries are tagged', () => {
    const refund = entryAmountText('expense', { amountCents: 1200, refund: true });
    assert.equal(refund.positive, true);
    assert.match(refund.text, /12\.00/);

    const labels = entryTagLabels('expense', { refund: true, importId: 'imp_1' });
    assert.ok(labels.includes('Refund'));
    assert.ok(labels.includes('Imported'));
    assert.deepEqual(entryTagLabels('expense', { refund: false, importId: '' }), []);
});
