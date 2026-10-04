import { parseBalanceInput, setMoneyNow } from '../balance.js';
import { addIncomeSource, validateIncomeSource } from '../incomeSources.js';
import { MAX_INCOME_SOURCES } from '../limits.js';

function isBlankRow(row) {
    return [row.name, row.amount, row.dayOfMonth].every((value) => String(value ?? '').trim() === '');
}

/**
 * The one-time setup: validates the card amount and the payday rows, and only then writes
 * money now and the income sources. Nothing is written when anything fails.
 */
export function applyMoneySetup(data, fields, now = new Date()) {
    const cents = parseBalanceInput(fields.moneyText);
    if (cents === null) {
        return { ok: false, field: 'money', reason: 'Enter an amount such as 1250.00 or -40.00.' };
    }

    const kept = fields.rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row }) => !isBlankRow(row));
    if (data.incomeSources.length + kept.length > MAX_INCOME_SOURCES) {
        return {
            ok: false,
            field: 'limit',
            reason: `You can have at most ${MAX_INCOME_SOURCES} income sources.`,
        };
    }

    const categoryId = data.incomeCategories.some((category) => category.id === 'salary')
        ? 'salary'
        : (data.incomeCategories[0]?.id ?? '');
    const values = [];
    for (const { row, rowIndex } of kept) {
        const checked = validateIncomeSource({
            name: row.name,
            amount: row.amount,
            dayOfMonth: row.dayOfMonth,
            incomeCategoryId: categoryId,
        });
        if (!checked.ok) {
            return { ok: false, field: checked.field, rowIndex, reason: checked.reason };
        }
        values.push(checked.value);
    }

    if (data.settings.balanceStart) {
        return { ok: false, field: 'money', reason: 'Money now is already set.' };
    }

    setMoneyNow(data, cents, now);
    for (const value of values) {
        addIncomeSource(data, value, now);
    }
    return { ok: true };
}
