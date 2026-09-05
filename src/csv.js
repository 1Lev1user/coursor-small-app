import { formatPlain } from './money.js';
import { isInMonth } from './months.js';

const BOM = '\uFEFF';
const HEADER_FIELDS = ['Date', 'Type', 'Category', 'Subcategory', 'Note', 'Amount'];

export function csvFilename(monthKey, flavour) {
    return `expenses-${monthKey}-${flavour}.csv`;
}

function escapeField(value, delimiter) {
    const text = String(value ?? '');
    if (
        text.includes(delimiter)
        || text.includes('"')
        || text.includes('\n')
        || text.includes('\r')
    ) {
        return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
}

function expenseCategoryName(data, expense) {
    const category = data.categories.find(({ id }) => id === expense.categoryId);
    return category?.name ?? expense.categoryId;
}

function incomeCategoryName(data, income) {
    const category = data.incomeCategories.find(({ id }) => id === income.incomeCategoryId);
    return category?.name ?? income.incomeCategoryId;
}

function expenseSubcategoryName(data, expense) {
    if (!expense.subcategoryId) {
        return '';
    }

    const category = data.categories.find(({ id }) => id === expense.categoryId);
    const subcategory = category?.subcategories.find(
        ({ id }) => id === expense.subcategoryId,
    );
    return subcategory?.name ?? expense.subcategoryId;
}

function monthRows(data, monthKey) {
    const rows = [];

    for (const expense of data.expenses) {
        if (!isInMonth(expense.date, monthKey)) {
            continue;
        }
        rows.push({
            date: expense.date,
            type: 'Expense',
            typeOrder: 0,
            id: expense.id,
            category: expenseCategoryName(data, expense),
            subcategory: expenseSubcategoryName(data, expense),
            note: expense.note ?? '',
            amountCents: expense.amountCents,
        });
    }

    for (const income of data.incomes) {
        if (!isInMonth(income.date, monthKey)) {
            continue;
        }
        rows.push({
            date: income.date,
            type: 'Income',
            typeOrder: 1,
            id: income.id,
            category: incomeCategoryName(data, income),
            subcategory: '',
            note: income.note ?? '',
            amountCents: income.amountCents,
        });
    }

    rows.sort((left, right) => {
        if (left.date !== right.date) {
            return left.date < right.date ? -1 : 1;
        }
        if (left.typeOrder !== right.typeOrder) {
            return left.typeOrder - right.typeOrder;
        }
        if (left.id !== right.id) {
            return left.id < right.id ? -1 : 1;
        }
        return 0;
    });

    return rows;
}

export function buildMonthCsv(data, monthKey, flavour) {
    const delimiter = flavour === 'europe' ? ';' : ',';
    const decimalSeparator = flavour === 'europe' ? ',' : '.';
    const header = HEADER_FIELDS.join(delimiter);
    const rows = monthRows(data, monthKey).map((row) => [
        row.date,
        row.type,
        row.category,
        row.subcategory,
        row.note,
        formatPlain(row.amountCents, decimalSeparator),
    ].map((field) => escapeField(field, delimiter)).join(delimiter));

    return `${BOM}${[header, ...rows].join('\n')}\n`;
}
