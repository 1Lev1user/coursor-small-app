import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'guide-assets');
mkdirSync(out, { recursive: true });

const key = 'my-expenses-v1';
const data = {
    version: 2,
    settings: {
        userName: 'Alex',
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

// Earlier months, a template and a goal so Trends, Quick add and Goals have content.
for (let back = 1; back <= 6; back += 1) {
    const month = String(9 - back).padStart(2, '0');
    data.expenses.push(
        { id: `h${back}a`, categoryId: 'necessary', subcategoryId: 'groceries', amountCents: 18000 + back * 1700, note: 'Groceries', date: `2026-${month}-10` },
        { id: `h${back}b`, categoryId: 'random', subcategoryId: 'eating-out', amountCents: 4200 + back * 900, note: 'Cafe', date: `2026-${month}-18` },
    );
}
data.templates = [{ id: 't1', name: 'Coffee', categoryId: 'random', subcategoryId: 'eating-out', amountCents: 320, note: 'Coffee' }];
data.goals = [{ id: 'g1', name: 'Summer trip', targetCents: 150000, deadline: '2027-06-01', createdAt: '2026-09-01', closedAt: '' }];
data.settings.lastBackupISO = '2026-09-20';

const SAMPLE_STATEMENT = [
    'Konta izraksts;;;;',
    'Datums;Saņēmējs/Maksātājs;Apraksts;Summa;D/K',
    '02.09.2026;SIA Kārlis;Pirkums 1234;23,40;D',
    '05.09.2026;SIA Employer;Alga;2015,00;K',
    '07.09.2026;RIMI MINI;Pirkums 5678;12,80;D',
].join('\n');

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
await page.getByRole('button', { name: 'Add income' }).click();
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

await page.getByRole('button', { name: 'Trends', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, 'screen-trends.png') });
await page.getByRole('button', { name: 'Spending', exact: true }).click();

await page.click('[data-tab="more"]');
await page.waitForTimeout(500);
await dismissOverlays(page);
await page.screenshot({ path: join(out, 'screen-settings.png') });

await page.getByRole('button', { name: 'Import a bank statement' }).click();
await page.waitForTimeout(300);
await page.setInputFiles('input[type=file]', {
    name: 'statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(SAMPLE_STATEMENT, 'utf8'),
});
await page.waitForTimeout(500);
await page.screenshot({ path: join(out, 'screen-import.png') });

await browser.close();
console.log('screenshots written to', out);
