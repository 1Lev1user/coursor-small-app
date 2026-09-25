import { buildYearCsv, yearTotals } from '../analytics.js';
import { downloadText } from '../files.js';
import { formatEuro } from '../money.js';
import { renderMonthBars } from './trends.js';

function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className !== '') {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function sharePercent(partCents, totalCents) {
    if (totalCents <= 0) {
        return '';
    }
    return `${(Math.round((partCents / totalCents) * 1000) / 10).toFixed(1)}%`;
}

/**
 * Year switcher: previous / next year buttons around the year label.
 * @param {HTMLElement} root
 * @param {number} year
 * @param {(year: number) => void} onChange
 */
export function renderYearNav(root, year, onChange) {
    const navigator = element('div', 'month-navigator year-navigator');

    const previous = element('button', 'btn month-nav-arrow', '‹');
    previous.type = 'button';
    previous.setAttribute('aria-label', `Previous year, ${year - 1}`);
    previous.addEventListener('click', () => onChange(year - 1));

    const label = element('h2', 'month-title year-title', String(year));
    label.setAttribute('aria-live', 'polite');

    const next = element('button', 'btn month-nav-arrow', '›');
    next.type = 'button';
    next.setAttribute('aria-label', `Next year, ${year + 1}`);
    next.addEventListener('click', () => onChange(year + 1));

    navigator.append(previous, label, next);
    root.append(navigator);
}

function figure(labelText, cents, extraClass = '') {
    const tile = element('div', `year-figure ${extraClass}`.trim());
    tile.append(
        element('span', 'year-figure-label', labelText),
        element('span', 'year-figure-value', formatEuro(cents)),
    );
    return tile;
}

function renderCategoryTable(totals) {
    const rows = totals.byCategory.filter(({ spentCents }) => spentCents !== 0);
    const wrap = element('div', 'bars-table-wrap');
    const table = element('table', 'data-table year-category-table');
    table.append(element('caption', 'visually-hidden', 'Spending by category for the year'));

    const head = element('thead', '');
    const headRow = element('tr', '');
    for (const text of ['Category', 'Total', 'Share']) {
        const cell = element('th', '', text);
        cell.scope = 'col';
        headRow.append(cell);
    }
    head.append(headRow);

    const body = element('tbody', '');
    for (const category of rows) {
        const row = element('tr', '');
        row.dataset.categoryId = category.id;
        const name = element('th', '', category.name);
        name.scope = 'row';
        row.append(
            name,
            element('td', 'is-number', formatEuro(category.spentCents)),
            element('td', 'is-number', sharePercent(category.spentCents, totals.spentCents)),
        );
        body.append(row);
    }

    const foot = element('tfoot', '');
    const footRow = element('tr', '');
    const footName = element('th', '', 'Total');
    footName.scope = 'row';
    footRow.append(
        footName,
        element('td', 'is-number', formatEuro(totals.spentCents)),
        element('td', 'is-number', totals.spentCents > 0 ? '100%' : ''),
    );
    foot.append(footRow);

    table.append(head, body, foot);
    wrap.append(table);
    return wrap;
}

function exportYear(ctx, year, flavour) {
    const { filename, text } = buildYearCsv(ctx.data, year, flavour);
    downloadText(filename, text, 'text/csv');
    ctx.toast(flavour === 'europe' ? 'Year CSV (Europe) downloaded' : 'Year CSV (Standard) downloaded');
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 * @param {number} year
 */
export function renderYear(root, ctx, year) {
    const totals = yearTotals(ctx.data, year);
    const hasEntries = ctx.data.expenses.some(({ date }) => date.startsWith(`${year}-`))
        || ctx.data.incomes.some(({ date }) => date.startsWith(`${year}-`));

    const section = element('section', 'stack chart-section year-view');

    if (!hasEntries) {
        const empty = element('div', 'card empty-state');
        empty.append(element('p', '', `No entries recorded in ${year}.`));
        section.append(empty);
        root.append(section);
        return;
    }

    const figures = element('div', 'card year-figures');
    const differenceCents = totals.incomeCents - totals.spentCents;
    figures.append(
        figure('Spent', totals.spentCents),
        figure('Income', totals.incomeCents),
        figure('Difference', differenceCents, differenceCents < 0 ? 'is-negative' : ''),
    );
    section.append(figures);
    section.append(element(
        'p',
        'muted',
        'Income includes usual salary from Plan. Difference is income minus spent.',
    ));

    const current = ctx.monthKey.startsWith(`${year}-`) ? Number(ctx.monthKey.slice(5, 7)) - 1 : 11;
    const chartCard = element('div', 'card chart-card');
    chartCard.append(
        element('h3', 'section-title', 'Spending per month'),
        renderMonthBars(
            totals.months.map(({ monthKey, spentCents, incomeCents, budgetCents }) => ({
                monthKey,
                spentCents,
                incomeCents,
                budgetCents,
            })),
            {
                label: `Spending per month in ${year}`,
                selectedIndex: current,
                tableCaption: `Spending, budget and income per month in ${year}`,
            },
        ),
    );
    section.append(chartCard);

    const categoryCard = element('div', 'card stack');
    categoryCard.append(element('h3', 'section-title', 'By category'));
    if (totals.byCategory.some(({ spentCents }) => spentCents !== 0)) {
        categoryCard.append(renderCategoryTable(totals));
    } else {
        categoryCard.append(element('p', 'muted', `No spending in ${year}.`));
    }
    section.append(categoryCard);

    const exportCard = element('div', 'card stack');
    exportCard.append(
        element('h3', 'section-title', 'Export the year'),
        element('p', 'muted', 'One row per month with totals per category. Europe uses ; and decimal commas.'),
    );
    const actions = element('div', 'year-export-actions');
    for (const [flavour, text] of [['europe', 'Year CSV (Europe)'], ['standard', 'Year CSV (Standard)']]) {
        const button = element('button', 'btn', text);
        button.type = 'button';
        button.dataset.flavour = flavour;
        button.addEventListener('click', () => exportYear(ctx, year, flavour));
        actions.append(button);
    }
    exportCard.append(actions);
    section.append(exportCard);

    root.append(section);
}
