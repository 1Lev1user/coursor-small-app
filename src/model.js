export const SCHEMA_VERSION = 1;
export const UNCATEGORISED_ID = 'uncategorised';

const UNCATEGORISED_CATEGORY = {
    id: UNCATEGORISED_ID,
    name: 'Uncategorised',
    pinned: true,
    percent: 0,
    system: true,
    subcategories: [],
};

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
        },
        categories: [
            {
                id: 'necessary',
                name: 'Necessary expenses',
                pinned: false,
                percent: 0,
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
                system: false,
                subcategories: [],
            },
            {
                id: 'random',
                name: 'Random small purchases',
                pinned: false,
                percent: 0,
                system: false,
                subcategories: [
                    { id: 'eating-out', name: 'Eating out' },
                    { id: 'shopping', name: 'Shopping' },
                    { id: 'random-other', name: 'Other' },
                ],
            },
            {
                id: 'savings',
                name: 'Savings',
                pinned: true,
                percent: 0,
                system: false,
                subcategories: [],
            },
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
        if (!data.categories.some(({ id }) => id === UNCATEGORISED_ID)) {
            data.categories.push(newUncategorisedCategory());
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

    if (data.categories[categoryIndex].system === true) {
        return { ok: false, reason: 'System category cannot be deleted.' };
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
