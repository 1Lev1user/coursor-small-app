export const SCHEMA_VERSION = 1;
export const UNCATEGORISED_ID = 'uncategorised';
export const SAVINGS_ID = 'savings';

const UNCATEGORISED_CATEGORY = {
    id: UNCATEGORISED_ID,
    name: 'Uncategorised',
    pinned: true,
    percent: 0,
    system: true,
    subcategories: [],
};

const SAVINGS_CATEGORY = {
    id: SAVINGS_ID,
    name: 'Savings',
    pinned: true,
    percent: 0,
    limitMode: 'euro',
    limitCents: 0,
    system: false,
    subcategories: [],
};

const OTHERS_CATEGORY = {
    id: 'others',
    name: 'Others',
    pinned: false,
    percent: 0,
    limitMode: 'percent',
    limitCents: 0,
    system: false,
    subcategories: [],
};

function newOthersCategory() {
    return {
        ...OTHERS_CATEGORY,
        subcategories: [],
    };
}

function newSavingsCategory() {
    return {
        ...SAVINGS_CATEGORY,
        subcategories: [],
    };
}

function newUncategorisedCategory() {
    return {
        ...UNCATEGORISED_CATEGORY,
        subcategories: [],
    };
}

export function createId(prefix, random = Math.random) {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    let token = '';

    for (let index = 0; index < 8; index += 1) {
        token += alphabet[Math.floor(random() * alphabet.length)];
    }

    return `${prefix}_${token}`;
}

export function defaultData() {
    return {
        version: SCHEMA_VERSION,
        settings: {
            monthlyBudgetCents: 0,
            usualMonthlyIncomeCents: 0,
            setupComplete: false,
            lastBackupISO: null,
            othersSeeded: true,
        },
        categories: [
            {
                id: 'necessary',
                name: 'Necessary expenses',
                pinned: false,
                percent: 0,
                limitMode: 'percent',
                limitCents: 0,
                system: false,
                subcategories: [
                    { id: 'rent', name: 'Rent/mortgage' },
                    { id: 'groceries', name: 'Groceries' },
                    { id: 'transport', name: 'Transport' },
                    { id: 'utilities', name: 'Utilities' },
                    { id: 'insurance', name: 'Insurance' },
                    { id: 'health', name: 'Health' },
                ],
            },
            {
                id: 'subscriptions',
                name: 'Subscriptions',
                pinned: false,
                percent: 0,
                limitMode: 'percent',
                limitCents: 0,
                system: false,
                subcategories: [],
            },
            {
                id: 'random',
                name: 'Random small purchases',
                pinned: false,
                percent: 0,
                limitMode: 'percent',
                limitCents: 0,
                system: false,
                subcategories: [
                    { id: 'eating-out', name: 'Eating out' },
                    { id: 'shopping', name: 'Shopping' },
                    { id: 'random-other', name: 'Other' },
                ],
            },
            newSavingsCategory(),
            newOthersCategory(),
            newUncategorisedCategory(),
        ],
        incomeCategories: [
            { id: 'salary', name: 'Salary' },
            { id: 'income-other', name: 'Other' },
        ],
        expenses: [],
        incomes: [],
        subscriptions: [],
        monthPlans: {},
    };
}

export function normalise(raw) {
    try {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            return { ok: false, reason: 'Data must be an object.' };
        }

        const data = JSON.parse(JSON.stringify(raw));

        if (typeof data.version !== 'number') {
            return { ok: false, reason: 'Schema version is missing or invalid.' };
        }
        if (data.version !== SCHEMA_VERSION) {
            return {
                ok: false,
                reason: `Unsupported schema version ${data.version}.`,
            };
        }

        for (const field of [
            'categories',
            'incomeCategories',
            'expenses',
            'incomes',
            'subscriptions',
        ]) {
            if (!Array.isArray(data[field])) {
                return { ok: false, reason: `${field} must be an array.` };
            }
        }

        if (
            data.settings === null
            || typeof data.settings !== 'object'
            || Array.isArray(data.settings)
        ) {
            return { ok: false, reason: 'settings must be an object.' };
        }

        if (!Object.hasOwn(data, 'monthPlans')) {
            data.monthPlans = {};
        }
        if (!Object.hasOwn(data.settings, 'lastBackupISO')) {
            data.settings.lastBackupISO = null;
        }
        if (!Object.hasOwn(data.settings, 'othersSeeded')) {
            data.settings.othersSeeded = false;
        }

        const budget = data.settings.monthlyBudgetCents;
        for (const category of data.categories) {
            if (category?.system === true) {
                continue;
            }
            if (category.limitMode !== 'percent' && category.limitMode !== 'euro') {
                category.limitMode = 'percent';
            }
            if (typeof category.limitCents !== 'number' || !Number.isFinite(category.limitCents)) {
                category.limitCents = 0;
            }
            if (category.pinned === true && category.limitMode === 'percent') {
                if (category.limitCents === 0 && category.percent > 0 && budget > 0) {
                    category.limitCents = Math.round(budget * category.percent / 100);
                }
            }
        }

        const hasOthers = data.categories.some(
            (category) => category?.system !== true && /^others$/i.test(category?.name ?? ''),
        );
        if (hasOthers) {
            data.settings.othersSeeded = true;
        } else if (data.settings.othersSeeded !== true) {
            const uncategorisedIndex = data.categories.findIndex(
                (category) => category?.id === UNCATEGORISED_ID,
            );
            const insertIndex = uncategorisedIndex === -1
                ? data.categories.length
                : uncategorisedIndex;
            data.categories.splice(insertIndex, 0, newOthersCategory());
            data.settings.othersSeeded = true;
        }

        if (!data.categories.some((category) => category?.id === SAVINGS_ID)) {
            const othersIndex = data.categories.findIndex(
                (category) => category?.id === 'others'
                    || (category?.system !== true && /^others$/i.test(category?.name ?? '')),
            );
            const uncategorisedIndex = data.categories.findIndex(
                (category) => category?.id === UNCATEGORISED_ID,
            );
            const insertIndex = othersIndex !== -1
                ? othersIndex
                : uncategorisedIndex === -1
                    ? data.categories.length
                    : uncategorisedIndex;
            data.categories.splice(insertIndex, 0, newSavingsCategory());
        }

        const uncategorisedIndex = data.categories.findIndex(
            (category) => category?.id === UNCATEGORISED_ID,
        );
        if (uncategorisedIndex === -1) {
            data.categories.push(newUncategorisedCategory());
        } else {
            data.categories[uncategorisedIndex] = newUncategorisedCategory();
        }

        return { ok: true, data };
    } catch {
        return { ok: false, reason: 'Data could not be read.' };
    }
}

export function deleteCategory(data, categoryId) {
    const categoryIndex = data.categories.findIndex(({ id }) => id === categoryId);
    if (categoryIndex === -1) {
        return { ok: false, reason: 'Category does not exist.' };
    }

    if (
        categoryId === UNCATEGORISED_ID
        || categoryId === SAVINGS_ID
        || data.categories[categoryIndex].system === true
    ) {
        return {
            ok: false,
            reason: categoryId === SAVINGS_ID
                ? 'Savings cannot be deleted.'
                : 'System category cannot be deleted.',
        };
    }

    let movedCount = 0;
    for (const expense of data.expenses) {
        if (expense.categoryId === categoryId) {
            expense.categoryId = UNCATEGORISED_ID;
            expense.subcategoryId = '';
            movedCount += 1;
        }
    }
    data.categories.splice(categoryIndex, 1);

    return { ok: true, movedCount };
}

export function deleteSubcategory(data, categoryId, subcategoryId) {
    const category = data.categories.find(({ id }) => id === categoryId);
    if (!category) {
        return { ok: false, reason: 'Category does not exist.' };
    }

    const subcategoryIndex = category.subcategories.findIndex(
        ({ id }) => id === subcategoryId,
    );
    if (subcategoryIndex === -1) {
        return { ok: false, reason: 'Subcategory does not exist.' };
    }

    let movedCount = 0;
    for (const expense of data.expenses) {
        if (
            expense.categoryId === categoryId
            && expense.subcategoryId === subcategoryId
        ) {
            expense.subcategoryId = '';
            movedCount += 1;
        }
    }
    category.subcategories.splice(subcategoryIndex, 1);

    return { ok: true, movedCount };
}
