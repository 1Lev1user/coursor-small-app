function normaliseText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

function textParts(entry, type, data) {
    if (type === 'expense') {
        const category = data.categories.find(({ id }) => id === entry.categoryId);
        const subcategory = category?.subcategories.find(({ id }) => id === entry.subcategoryId);
        return [entry.note, entry.bankText, category?.name, subcategory?.name];
    }

    const incomeCategory = data.incomeCategories.find(({ id }) => id === entry.incomeCategoryId);
    return [entry.note, entry.bankText, incomeCategory?.name];
}

function matchesEntry(entry, type, data, filters, normalisedText) {
    if (filters.type && filters.type !== 'all' && filters.type !== type) {
        return false;
    }
    if (normalisedText !== '') {
        const found = textParts(entry, type, data)
            .some((part) => part && normaliseText(part).includes(normalisedText));
        if (!found) {
            return false;
        }
    }
    if (filters.categoryId) {
        const entryCategoryId = type === 'expense' ? entry.categoryId : entry.incomeCategoryId;
        if (entryCategoryId !== filters.categoryId) {
            return false;
        }
    }
    if (Number.isFinite(filters.minCents) && entry.amountCents < filters.minCents) {
        return false;
    }
    if (Number.isFinite(filters.maxCents) && entry.amountCents > filters.maxCents) {
        return false;
    }
    if (filters.from && entry.date < filters.from) {
        return false;
    }
    if (filters.to && entry.date > filters.to) {
        return false;
    }

    return true;
}

/**
 * Full-text, case- and diacritics-insensitive search across the whole history.
 * @param {object} data
 * @param {{ text?: string, categoryId?: string, minCents?: number, maxCents?: number, from?: string, to?: string, type?: 'all'|'expense'|'income' }} filters
 * @returns {{ type: 'expense'|'income', entry: object }[]}
 */
export function searchEntries(data, filters = {}) {
    const normalisedText = normaliseText(filters.text ?? '').trim();

    const expenses = data.expenses.map((entry, index) => ({ type: 'expense', entry, index }));
    const incomes = data.incomes.map((entry, index) => ({ type: 'income', entry, index }));

    return [...expenses, ...incomes]
        .filter(({ type, entry }) => matchesEntry(entry, type, data, filters, normalisedText))
        .sort((first, second) => {
            const byDate = second.entry.date.localeCompare(first.entry.date);
            if (byDate !== 0) {
                return byDate;
            }
            if (first.type !== second.type) {
                return first.type === 'expense' ? -1 : 1;
            }
            return second.index - first.index;
        })
        .map(({ type, entry }) => ({ type, entry }));
}
