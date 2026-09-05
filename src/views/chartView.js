import { monthTotals, subcategoryTotals, incomeBreakdown } from '../budget.js';
import { PALETTE, renderDonut } from '../donut.js';
import { formatEuro } from '../money.js';
import { monthLabel } from '../months.js';
import { renderMonthNav } from './monthNav.js';

let selectedCategoryId = null;
let renderedMonthKey = null;

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

function overviewItems(categories) {
    const spending = categories.filter(({ spentCents }) => spentCents > 0);
    const empty = categories.filter(({ spentCents }) => spentCents <= 0);
    return [...spending, ...empty];
}

function renderLegend(rows, { drillInto, showPlanned } = {}) {
    const legend = element('div', 'chart-legend');

    rows.forEach((rowData, index) => {
        const amountCents = rowData.spentCents ?? 0;
        const row = drillInto === undefined
            ? element('div', 'chart-legend-row')
            : element('button', 'chart-legend-row chart-legend-button');
        const swatch = element('span', 'chart-swatch');
        swatch.style.backgroundColor = PALETTE[index % PALETTE.length];
        swatch.setAttribute('aria-hidden', 'true');

        const details = element('span', 'chart-legend-details');
        details.append(element('span', 'chart-legend-name', rowData.name));
        if (showPlanned) {
            details.append(element(
                'span',
                'muted',
                rowData.limitCents === 0
                    ? 'no budget'
                    : `planned ${formatEuro(rowData.limitCents)}`,
            ));
        } else if (rowData.fromPlan === true) {
            details.append(element('span', 'muted', 'from Settings → Plan'));
        }

        row.append(
            swatch,
            details,
            element('span', 'chart-legend-amount', formatEuro(amountCents)),
        );

        if (drillInto !== undefined) {
            row.type = 'button';
            row.disabled = amountCents <= 0;
            row.addEventListener('click', () => drillInto(rowData.id));
        }

        legend.append(row);
    });

    return legend;
}

function showCategory(ctx, categoryId) {
    selectedCategoryId = categoryId;
    ctx.render();
}

function renderSpendingOverview(layout, ctx, totals) {
    const section = element('section', 'stack chart-section');
    section.append(element('h2', 'section-title chart-heading', 'Spending'));
    section.append(element(
        'p',
        'muted',
        'Spend budget stays fixed from Plan for this month. Extra income does not raise it.',
    ));

    if (totals.spentCents === 0) {
        const empty = element('div', 'card empty-state');
        empty.append(element(
            'p',
            '',
            `No spending recorded in ${monthLabel(ctx.monthKey)}.`,
        ));
        const add = element('button', 'btn btn-primary', 'Add an expense');
        add.type = 'button';
        add.addEventListener('click', () => ctx.goTo('add', { panel: 'expense' }));
        empty.append(add);
        section.append(empty);
        layout.append(section);
        return;
    }

    const categories = overviewItems(totals.categories);
    const spendingItems = categories
        .filter(({ spentCents }) => spentCents > 0)
        .map(({ id, name, spentCents }) => ({ id, label: name, valueCents: spentCents }));
    const card = element('div', 'card chart-card');
    card.append(renderDonut(spendingItems, {
        centreLabel: 'spent',
        centreValue: formatEuro(totals.spentCents),
    }));
    card.append(renderLegend(categories, {
        drillInto: (categoryId) => showCategory(ctx, categoryId),
        showPlanned: true,
    }));
    section.append(card);
    layout.append(section);
}

function renderSpendingDrillDown(layout, ctx, category) {
    const section = element('section', 'stack chart-section');
    const back = element('button', 'btn btn-ghost chart-back', 'All spending');
    back.type = 'button';
    back.addEventListener('click', () => {
        selectedCategoryId = null;
        ctx.render();
    });

    const subcategories = overviewItems(subcategoryTotals(ctx.data, ctx.monthKey, category.id));
    const items = subcategories.map(({ id, name, spentCents }) => ({
        id,
        label: name,
        valueCents: spentCents,
    }));
    const card = element('div', 'card chart-card');
    card.append(
        element('h2', 'section-title chart-heading', category.name),
        renderDonut(items, {
            centreLabel: category.name,
            centreValue: formatEuro(category.spentCents),
        }),
        renderLegend(subcategories, { showPlanned: false }),
    );
    section.append(back, card);
    layout.append(section);
}

function renderIncomeOverview(layout, ctx, income) {
    const section = element('section', 'stack chart-section');
    section.append(element('h2', 'section-title chart-heading', 'Income'));
    section.append(element(
        'p',
        'muted',
        'Usual salary from Plan plus extra income you logged. This raises Cash left, not the spend budget.',
    ));

    if (income.totalCents === 0) {
        const empty = element('div', 'card empty-state');
        empty.append(element(
            'p',
            '',
            `No income for ${monthLabel(ctx.monthKey)}. Set usual salary in Settings → Plan or add extra income from Home.`,
        ));
        const add = element('button', 'btn btn-primary', 'Add extra income');
        add.type = 'button';
        add.addEventListener('click', () => ctx.goTo('add', { panel: 'income' }));
        empty.append(add);
        section.append(empty);
        layout.append(section);
        return;
    }

    const chartItems = income.entries.map(({ id, name, amountCents }) => ({
        id,
        label: name,
        valueCents: amountCents,
    }));
    const card = element('div', 'card chart-card');
    card.append(renderDonut(chartItems, {
        centreLabel: 'income',
        centreValue: formatEuro(income.totalCents),
    }));
    card.append(renderLegend(
        income.entries.map(({ id, name, amountCents, fromPlan }) => ({
            id,
            name,
            spentCents: amountCents,
            fromPlan,
        })),
        { showPlanned: false },
    ));
    section.append(card);
    layout.append(section);
}

export function render(root, ctx) {
    if (renderedMonthKey !== ctx.monthKey) {
        selectedCategoryId = null;
        renderedMonthKey = ctx.monthKey;
    }

    const totals = monthTotals(ctx.data, ctx.monthKey);
    const income = incomeBreakdown(ctx.data, ctx.monthKey);
    const selectedCategory = totals.categories.find(({ id }) => id === selectedCategoryId);
    if (selectedCategory === undefined || selectedCategory.spentCents <= 0) {
        selectedCategoryId = null;
    }

    const layout = element('div', 'stack');
    renderMonthNav(layout, ctx);

    if (selectedCategoryId === null) {
        renderSpendingOverview(layout, ctx, totals);
    } else {
        renderSpendingDrillDown(layout, ctx, selectedCategory);
    }
    renderIncomeOverview(layout, ctx, income);

    root.append(layout);
}
