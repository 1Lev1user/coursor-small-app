import { monthTotals, subcategoryTotals } from '../budget.js';
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

function renderLegend(categories, { drillInto, showPlanned }) {
    const legend = element('div', 'chart-legend');

    categories.forEach((category, index) => {
        const row = drillInto === undefined
            ? element('div', 'chart-legend-row')
            : element('button', 'chart-legend-row chart-legend-button');
        const swatch = element('span', 'chart-swatch');
        swatch.style.backgroundColor = PALETTE[index % PALETTE.length];
        swatch.setAttribute('aria-hidden', 'true');

        const details = element('span', 'chart-legend-details');
        details.append(element('span', 'chart-legend-name', category.name));
        if (showPlanned) {
            details.append(element(
                'span',
                'muted',
                category.limitCents === 0
                    ? 'no budget'
                    : `planned ${formatEuro(category.limitCents)}`,
            ));
        }

        row.append(
            swatch,
            details,
            element('span', 'chart-legend-amount', formatEuro(category.spentCents)),
        );

        if (drillInto !== undefined) {
            row.type = 'button';
            row.disabled = category.spentCents <= 0;
            row.addEventListener('click', () => drillInto(category.id));
        }

        legend.append(row);
    });

    return legend;
}

function showCategory(ctx, categoryId) {
    selectedCategoryId = categoryId;
    ctx.render();
}

function renderOverview(layout, ctx, totals) {
    if (totals.spentCents === 0) {
        const empty = element('section', 'card empty-state');
        empty.append(element(
            'p',
            '',
            `No spending recorded in ${monthLabel(ctx.monthKey)}.`,
        ));
        const add = element('button', 'btn btn-primary', 'Add an expense');
        add.type = 'button';
        add.addEventListener('click', () => ctx.goTo('add'));
        empty.append(add);
        layout.append(empty);
        return;
    }

    const categories = overviewItems(totals.categories);
    const spendingItems = categories
        .filter(({ spentCents }) => spentCents > 0)
        .map(({ id, name, spentCents }) => ({ id, label: name, valueCents: spentCents }));
    const card = element('section', 'card chart-card');
    card.append(renderDonut(spendingItems, {
        centreLabel: 'spent',
        centreValue: formatEuro(totals.spentCents),
    }));
    card.append(renderLegend(categories, {
        drillInto: (categoryId) => showCategory(ctx, categoryId),
        showPlanned: true,
    }));
    layout.append(card);
}

function renderDrillDown(layout, ctx, totals, category) {
    const back = element('button', 'btn btn-ghost chart-back', 'All categories');
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
    const card = element('section', 'card chart-card');
    card.append(
        element('h2', 'section-title chart-heading', category.name),
        renderDonut(items, {
            centreLabel: category.name,
            centreValue: formatEuro(category.spentCents),
        }),
        renderLegend(subcategories, { showPlanned: false }),
    );
    layout.append(back, card);
}

export function render(root, ctx) {
    if (renderedMonthKey !== ctx.monthKey) {
        selectedCategoryId = null;
        renderedMonthKey = ctx.monthKey;
    }

    const totals = monthTotals(ctx.data, ctx.monthKey);
    const selectedCategory = totals.categories.find(({ id }) => id === selectedCategoryId);
    if (selectedCategory === undefined || selectedCategory.spentCents <= 0) {
        selectedCategoryId = null;
    }

    const layout = element('div', 'stack');
    renderMonthNav(layout, ctx);
    if (selectedCategoryId === null) {
        renderOverview(layout, ctx, totals);
    } else {
        renderDrillDown(layout, ctx, totals, selectedCategory);
    }
    root.append(layout);
}
