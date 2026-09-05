import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'guide-assets');
mkdirSync(out, { recursive: true });

const key = 'my-expenses-v1';
const data = {
    version: 1,
    settings: {
        monthlyBudgetCents: 100000,
        usualMonthlyIncomeCents: 200000,
        setupComplete: true,
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
            subcategories: [{ id: 'shopping', name: 'Shopping' }],
        },
        {
            id: 'savings',
            name: 'Savings',
            pinned: true,
            percent: 10,
            limitMode: 'percent',
            limitCents: 10000,
            system: false,
            subcategories: [],
        },
        {
            id: 'others',
            name: 'Others',
            pinned: false,
            percent: 0,
            limitMode: 'percent',
            limitCents: 0,
            system: false,
            subcategories: [],
        },
        {
            id: 'uncategorised',
            name: 'Uncategorised',
            pinned: true,
            percent: 0,
            system: true,
            subcategories: [],
        },
    ],
    incomeCategories: [
        { id: 'salary', name: 'Salary' },
        { id: 'income-other', name: 'Other' },
    ],
    expenses: [
        {
            id: 'e1',
            categoryId: 'necessary',
            subcategoryId: 'groceries',
            amountCents: 4500,
            note: 'Market',
            date: '2026-09-02',
        },
        {
            id: 'e2',
            categoryId: 'random',
            subcategoryId: 'shopping',
            amountCents: 2200,
            note: 'Soap',
            date: '2026-09-03',
        },
    ],
    incomes: [
        {
            id: 'i1',
            incomeCategoryId: 'salary',
            amountCents: 50000,
            note: '',
            date: '2026-09-01',
        },
    ],
    subscriptions: [{ id: 's1', name: 'Streaming', amountCents: 999, dayOfMonth: 28 }],
    monthPlans: {},
};

async function dismissOverlays(page) {
    await page.evaluate(() => {
        document.getElementById('due-subscription-overlay')?.remove();
    });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.evaluate(([storageKey, payload]) => {
    localStorage.setItem(storageKey, JSON.stringify(payload));
}, [key, data]);

async function shot(name, mutate) {
    if (mutate) {
        await page.evaluate(([storageKey, fnName]) => {
            const raw = JSON.parse(localStorage.getItem(storageKey));
            if (fnName === 'setup') {
                raw.settings.setupComplete = false;
            }
            if (fnName === 'ready') {
                raw.settings.setupComplete = true;
            }
            localStorage.setItem(storageKey, JSON.stringify(raw));
        }, [key, mutate]);
        await page.reload({ waitUntil: 'networkidle' });
    }
    await dismissOverlays(page);
    await page.screenshot({ path: join(out, name) });
}

await shot('screen-setup.png', 'setup');
await shot('screen-home.png', 'ready');

await page.getByRole('button', { name: 'Add expense' }).click();
await page.waitForTimeout(300);
await dismissOverlays(page);
await page.screenshot({ path: join(out, 'screen-expense.png') });

await page.getByRole('button', { name: 'Back to Home' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Add extra income' }).click();
await page.waitForTimeout(300);
await dismissOverlays(page);
await page.screenshot({ path: join(out, 'screen-income.png') });

await page.click('[data-tab="month"]');
await page.waitForTimeout(400);
await dismissOverlays(page);
await page.screenshot({ path: join(out, 'screen-month.png') });

await page.click('[data-tab="chart"]');
await page.waitForTimeout(400);
await dismissOverlays(page);
await page.screenshot({ path: join(out, 'screen-chart.png') });

await page.click('[data-tab="more"]');
await page.waitForTimeout(500);
await dismissOverlays(page);
await page.screenshot({ path: join(out, 'screen-settings.png'), fullPage: true });

await browser.close();
console.log('screenshots written to', out);
