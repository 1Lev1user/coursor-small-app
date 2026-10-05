import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultData, SCHEMA_VERSION } from '../src/model.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'guide-assets');
mkdirSync(out, { recursive: true });

const key = 'my-expenses-v1';
const preUpdateKey = `my-expenses-before-v${SCHEMA_VERSION}`;
const NOW = new Date('2026-09-24T12:00:00Z');

function expense(id, categoryId, subcategoryId, amountCents, note, date, extra = {}) {
    return {
        id, categoryId, subcategoryId, amountCents, note, date,
        currency: 'EUR', originalAmountCents: amountCents, refund: false,
        importId: '', bankRef: '', fingerprint: '', goalId: '', ...extra,
    };
}

function income(id, incomeCategoryId, amountCents, note, date) {
    return {
        id, incomeCategoryId, amountCents, note, date,
        currency: 'EUR', originalAmountCents: amountCents,
        importId: '', bankRef: '', fingerprint: '', sourceId: '',
    };
}

// Sample data: the clock is fixed at 24 Sep 2026, Money now starts at 200.00 on 1 Sep.
const data = defaultData();
Object.assign(data.settings, {
    userName: 'Alex',
    monthlyBudgetCents: 100000,
    usualMonthlyIncomeCents: 200000,
    setupComplete: true,
    lastBackupISO: '2026-09-20',
    balanceStart: { cents: 20000, date: '2026-09-01' },
});
const savings = data.categories.find((category) => category.id === 'savings');
Object.assign(savings, { pinned: true, percent: 10, limitMode: 'percent', limitCents: 10000 });

data.expenses.push(
    expense('e1', 'necessary', 'groceries', 4500, 'Market', '2026-09-02'),
    expense('e2', 'random', 'shopping', 2200, 'Soap', '2026-09-03'),
    expense('e3', 'necessary', 'rent', 22000, 'Rent', '2026-09-05'),
    expense('e4', 'random', 'eating-out', 1850, 'Lunch', '2026-09-12'),
    expense('e5', 'random', 'shopping', 1500, 'Returned shoes', '2026-09-14', { refund: true }),
);
// Salary has no September income tied to it, so its payday reminder is due on the 24th.
data.incomeSources.push(
    { id: 'src1', name: 'Salary', incomeCategoryId: 'salary', expectedCents: 200000, dayOfMonth: 20, startDate: '', skippedMonths: [] },
    { id: 'src2', name: 'Side job', incomeCategoryId: 'salary', expectedCents: 30000, dayOfMonth: 28, startDate: '', skippedMonths: [] },
);
data.incomes.push(
    income('i1', 'income-other', 5000, 'Gift', '2026-09-08'),
    income('i2', 'income-other', 30000, 'Freelance', '2026-09-10'),
);
data.subscriptions.push({ id: 's1', name: 'Streaming', amountCents: 999, dayOfMonth: 28, skippedMonths: [] });

// Earlier months, a template and a goal so Trends, Quick add and Goals have content.
for (let back = 1; back <= 6; back += 1) {
    const month = String(9 - back).padStart(2, '0');
    data.expenses.push(
        expense(`h${back}a`, 'necessary', 'groceries', 18000 + back * 1700, 'Groceries', `2026-${month}-10`),
        expense(`h${back}b`, 'random', 'eating-out', 4200 + back * 900, 'Cafe', `2026-${month}-18`),
    );
    data.incomes.push(income(`hi${back}`, 'salary', 200000, '', `2026-${month}-25`));
}
data.templates = [{ id: 't1', name: 'Coffee', categoryId: 'random', subcategoryId: 'eating-out', amountCents: 320, note: 'Coffee' }];
data.goals = [{ id: 'g1', name: 'Summer trip', targetCents: 150000, deadline: '2027-06-01', createdAt: '2026-09-01', closedAt: '' }];

// A copy saved before the 3.0 update, so Settings shows the Restore button.
const preUpdateCopy = { ...structuredClone(data), version: 2 };

const firstRun = structuredClone(data);
firstRun.settings.setupComplete = false;
firstRun.settings.balanceStart = null;

const moneyOnly = structuredClone(data);
Object.assign(moneyOnly, { incomeSources: [], incomes: [], expenses: [], subscriptions: [] });
moneyOnly.settings.balanceStart = null;

const SAMPLE_STATEMENT = [
    'Konta izraksts;;;;',
    'Datums;Saņēmējs/Maksātājs;Apraksts;Summa;D/K',
    '02.09.2026;SIA Kārlis;Pirkums 1234;23,40;D',
    '05.09.2026;SIA Employer;Alga;2015,00;K',
    '07.09.2026;RIMI MINI;Pirkums 5678;12,80;D',
].join('\n');

const browser = await chromium.launch();
const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    timezoneId: 'UTC',
    locale: 'en-GB',
});
await page.clock.setFixedTime(NOW);
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });

async function load(payload, preUpdate = null) {
    await page.evaluate(([storageKey, value, copyKey, copy]) => {
        localStorage.clear();
        localStorage.setItem(storageKey, JSON.stringify(value));
        if (copy) {
            localStorage.setItem(copyKey, JSON.stringify(copy));
        }
    }, [key, payload, preUpdateKey, preUpdate]);
    await page.reload({ waitUntil: 'networkidle' });
}

async function shot(name) {
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        document.getElementById('due-subscription-overlay')?.remove();
    });
    await page.screenshot({ path: join(out, `${name}.png`) });
}

await load(firstRun);
await shot('screen-setup');

await load(moneyOnly);
await page.fill('#money-setup-money', '200.00');
await page.fill('#money-setup-day-0', '20');
await shot('screen-money-setup');

await load(data, preUpdateCopy);
await shot('screen-home');

await page.click('#home-money-figure');
await page.fill('#home-money-amount', '232.50');
await shot('screen-bank-check');
await page.keyboard.press('Escape');

await page.getByRole('button', { name: 'Add expense' }).click();
await shot('screen-expense');

await page.getByRole('button', { name: 'Back to Home' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Add income' }).click();
await shot('screen-income');

await page.click('[data-tab="month"]');
await shot('screen-month');

await page.click('[data-tab="chart"]');
await shot('screen-chart');

await page.getByRole('button', { name: 'Trends', exact: true }).click();
await shot('screen-trends');
await page.getByRole('button', { name: 'Spending', exact: true }).click();

await page.click('[data-tab="more"]');
await shot('screen-settings');

await page.click('#settings-row-income');
await shot('screen-settings-income');

await page.click('#settings-row-backup');
await shot('screen-settings-backup');

await page.click('#settings-row-advanced');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Import a bank statement' }).click();
await page.waitForTimeout(500);
await page.setInputFiles('input[type=file]', {
    name: 'statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(SAMPLE_STATEMENT, 'utf8'),
});
await page.selectOption('#imp-date-format', 'DMY');
await page.getByText('Check what was read').scrollIntoViewIfNeeded();
await shot('screen-import');

await browser.close();
console.log('screenshots written to', out);
