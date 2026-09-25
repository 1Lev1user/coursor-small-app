import { categoryChanges, monthSeries } from '../analytics.js';
import { formatEuro } from '../money.js';
import {
    addMonths,
    isInMonth,
    monthLabel,
    shortMonthName,
} from '../months.js';

const TOP_CHANGES = 5;

const axisEuro = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
});

const state = {
    showAllChanges: false,
};

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

function monthShort(monthKey) {
    return shortMonthName(monthKey);
}

/**
 * Clean axis maximum and step (in cents) for a value range starting at 0.
 * @param {number} maxCents
 * @param {number} [tickCount]
 * @returns {{ maxCents: number, stepCents: number }}
 */
export function niceScale(maxCents, tickCount = 3) {
    const maxEuros = Math.max(maxCents, 0) / 100;
    if (maxEuros <= 0) {
        return { maxCents: 100 * 100, stepCents: 50 * 100 };
    }
    const raw = maxEuros / tickCount;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const residual = raw / magnitude;
    let nice = 10;
    if (residual <= 1) {
        nice = 1;
    } else if (residual <= 2) {
        nice = 2;
    } else if (residual <= 2.5) {
        nice = 2.5;
    } else if (residual <= 5) {
        nice = 5;
    }
    const stepEuros = Math.max(1, nice * magnitude);
    const steps = Math.max(1, Math.ceil(maxEuros / stepEuros));
    return {
        maxCents: Math.round(steps * stepEuros * 100),
        stepCents: Math.round(stepEuros * 100),
    };
}

function percentOf(valueCents, scaleCents) {
    const clamped = Math.max(0, Math.min(valueCents, scaleCents));
    return (clamped / scaleCents) * 100;
}

function budgetText(budgetCents) {
    return budgetCents > 0 ? formatEuro(budgetCents) : 'none';
}

function describeMonth(month) {
    return `${monthLabel(month.monthKey)}: spent ${formatEuro(month.spentCents)}, `
        + `budget ${budgetText(month.budgetCents)}, income ${formatEuro(month.incomeCents)}`;
}

function detailPart(label, value) {
    const part = element('span', 'bars-detail-part');
    part.append(element('strong', 'bars-detail-value', value), document.createTextNode(` ${label}`));
    return part;
}

function renderDetail(detail, month) {
    detail.replaceChildren(
        element('span', 'bars-detail-month', monthLabel(month.monthKey)),
        detailPart('spent', formatEuro(month.spentCents)),
        detailPart('budget', budgetText(month.budgetCents)),
        detailPart('income', formatEuro(month.incomeCents)),
    );
}

function renderKey({ showBudget, showAverage }) {
    const key = element('ul', 'bars-key');
    const item = (markClass, text) => {
        const row = element('li', 'bars-key-item');
        const mark = element('span', `bars-key-mark ${markClass}`);
        mark.setAttribute('aria-hidden', 'true');
        row.append(mark, element('span', '', text));
        return row;
    };
    key.append(item('is-bar', 'Spent'));
    if (showAverage) {
        key.append(item('is-average', 'Average'));
    }
    if (showBudget) {
        key.append(item('is-budget', 'Budget'));
    }
    return key;
}

function renderTable(series, caption) {
    const details = element('details', 'bars-table-toggle');
    details.append(element('summary', 'bars-table-summary', 'Show as table'));

    const wrap = element('div', 'bars-table-wrap');
    const table = element('table', 'data-table');
    table.append(element('caption', 'visually-hidden', caption));
    const head = element('thead', '');
    const headRow = element('tr', '');
    for (const text of ['Month', 'Spent', 'Budget', 'Income']) {
        const cell = element('th', '', text);
        cell.scope = 'col';
        headRow.append(cell);
    }
    head.append(headRow);

    const body = element('tbody', '');
    for (const month of series) {
        const row = element('tr', '');
        const name = element('th', '', monthLabel(month.monthKey));
        name.scope = 'row';
        row.append(
            name,
            element('td', 'is-number', formatEuro(month.spentCents)),
            element('td', 'is-number', month.budgetCents > 0 ? formatEuro(month.budgetCents) : 'None'),
            element('td', 'is-number', formatEuro(month.incomeCents)),
        );
        body.append(row);
    }

    table.append(head, body);
    wrap.append(table);
    details.append(wrap);
    return details;
}

/**
 * Column chart of monthly spending with optional budget ticks and average line.
 * @param {{ monthKey: string, spentCents: number, incomeCents: number, budgetCents: number }[]} series
 * @param {{ label: string, averageCents?: number | null, selectedIndex?: number, tableCaption?: string }} options
 * @returns {HTMLElement}
 */
export function renderMonthBars(series, options) {
    const { label, averageCents = null, tableCaption = label } = options;
    let selectedIndex = Math.min(
        Math.max(options.selectedIndex ?? series.length - 1, 0),
        series.length - 1,
    );

    const showBudget = series.some(({ budgetCents }) => budgetCents > 0);
    const showAverage = averageCents !== null;
    const maxCents = Math.max(
        ...series.map(({ spentCents }) => spentCents),
        ...(showBudget ? series.map(({ budgetCents }) => budgetCents) : []),
        showAverage ? averageCents : 0,
    );
    const scale = niceScale(maxCents);

    const figure = element('figure', 'bars-chart');
    figure.dataset.scaleCents = String(scale.maxCents);

    const frame = element('div', 'bars-frame');
    const axis = element('div', 'bars-axis');
    axis.setAttribute('aria-hidden', 'true');
    const plot = element('div', 'bars-plot');
    const grid = element('div', 'bars-grid');
    grid.setAttribute('aria-hidden', 'true');

    for (let tick = 0; tick <= scale.maxCents; tick += scale.stepCents) {
        const bottom = `${percentOf(tick, scale.maxCents)}%`;
        const line = element('span', 'bars-gridline');
        line.style.bottom = bottom;
        grid.append(line);
        const tickLabel = element('span', 'bars-tick', axisEuro.format(tick / 100));
        tickLabel.style.bottom = bottom;
        axis.append(tickLabel);
    }

    const columns = element('div', 'bars-columns');
    columns.setAttribute('role', 'group');
    columns.setAttribute('aria-label', label);
    const xLabels = element('div', 'bars-xlabels');
    xLabels.setAttribute('aria-hidden', 'true');
    const detail = element('p', 'bars-detail');
    detail.setAttribute('aria-live', 'polite');

    const buttons = series.map((month, index) => {
        const button = element('button', 'bars-column');
        button.type = 'button';
        button.dataset.monthKey = month.monthKey;
        button.dataset.spentCents = String(month.spentCents);
        button.setAttribute('aria-label', describeMonth(month));

        const bar = element('span', 'bars-bar');
        bar.style.height = `${percentOf(month.spentCents, scale.maxCents)}%`;
        button.append(bar);

        if (month.budgetCents > 0) {
            const budget = element('span', 'bars-budget');
            budget.style.bottom = `${percentOf(month.budgetCents, scale.maxCents)}%`;
            button.append(budget);
        }

        button.addEventListener('pointerenter', () => select(index, false));
        button.addEventListener('click', () => select(index, false));
        button.addEventListener('focus', () => select(index, false));
        button.addEventListener('keydown', (event) => {
            const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: series.length - 1 - index };
            if (!Object.hasOwn(moves, event.key)) {
                return;
            }
            event.preventDefault();
            select(Math.min(Math.max(index + moves[event.key], 0), series.length - 1), true);
        });

        const xLabel = element('span', 'bars-xlabel');
        xLabel.append(
            element('span', 'bars-xlabel-long', monthShort(month.monthKey)),
            element('span', 'bars-xlabel-short', monthShort(month.monthKey).charAt(0)),
        );
        xLabels.append(xLabel);

        columns.append(button);
        return button;
    });

    function select(index, moveFocus) {
        selectedIndex = index;
        buttons.forEach((button, buttonIndex) => {
            const isSelected = buttonIndex === index;
            button.classList.toggle('is-selected', isSelected);
            button.tabIndex = isSelected ? 0 : -1;
        });
        [...xLabels.children].forEach((node, nodeIndex) => {
            node.classList.toggle('is-selected', nodeIndex === index);
        });
        renderDetail(detail, series[index]);
        if (moveFocus) {
            buttons[index].focus();
        }
    }

    plot.append(grid);
    if (showAverage) {
        const average = element('span', 'bars-average');
        average.setAttribute('aria-hidden', 'true');
        average.style.bottom = `${percentOf(averageCents, scale.maxCents)}%`;
        plot.append(average);
    }
    plot.append(columns);

    frame.append(axis, plot, element('span', 'bars-corner'), xLabels);
    figure.append(frame, detail, renderKey({ showBudget, showAverage }));
    figure.append(renderTable(series, tableCaption));

    select(selectedIndex, false);
    return figure;
}

function changeText(deltaCents) {
    if (deltaCents > 0) {
        return `up ${formatEuro(deltaCents)}`;
    }
    if (deltaCents < 0) {
        return `down ${formatEuro(-deltaCents)}`;
    }
    return 'no change';
}

function renderChangeItems(list, changes) {
    const visible = state.showAllChanges ? changes : changes.slice(0, TOP_CHANGES);
    list.replaceChildren(...visible.map((change) => {
        const item = element('li', 'changes-item');
        const text = element('div', 'changes-text');
        text.append(
            element('span', 'changes-name', change.name),
            element('span', 'muted', `Average ${formatEuro(change.averageCents)}`),
        );
        const values = element('div', 'changes-values');
        values.append(
            element('span', 'changes-current', formatEuro(change.currentCents)),
            element('span', 'changes-delta', changeText(change.deltaCents)),
        );
        item.append(text, values);
        return item;
    }));
}

function renderChanges(ctx) {
    const section = element('section', 'card stack changes-card');
    section.append(element('h3', 'section-title', 'Changes vs last month'));
    section.append(element(
        'p',
        'muted',
        `${monthLabel(ctx.monthKey)} compared with ${monthLabel(addMonths(ctx.monthKey, -1))}. `
            + 'Average covers up to 6 earlier months with spending.',
    ));

    const changes = categoryChanges(ctx.data, ctx.monthKey)
        .filter(({ currentCents, previousCents }) => currentCents !== 0 || previousCents !== 0);
    if (changes.length === 0) {
        section.append(element('p', 'muted', 'No spending in either month.'));
        return section;
    }

    const list = element('ul', 'changes-list');
    list.id = 'trends-changes-list';
    renderChangeItems(list, changes);
    section.append(list);

    if (changes.length > TOP_CHANGES) {
        const toggle = element('button', 'btn btn-ghost changes-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-controls', list.id);
        const syncToggle = () => {
            toggle.textContent = state.showAllChanges ? 'Show top 5' : `Show all ${changes.length}`;
            toggle.setAttribute('aria-expanded', String(state.showAllChanges));
        };
        toggle.addEventListener('click', () => {
            state.showAllChanges = !state.showAllChanges;
            renderChangeItems(list, changes);
            syncToggle();
        });
        syncToggle();
        section.append(toggle);
    }

    return section;
}

function monthHasSpending(data, monthKey) {
    return data.expenses.some((expense) => isInMonth(expense.date, monthKey));
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export function renderTrends(root, ctx) {
    const series = monthSeries(ctx.data, ctx.monthKey, 12);
    const firstMonthKey = series[0].monthKey;
    const rangeText = `${monthLabel(firstMonthKey)} to ${monthLabel(ctx.monthKey)}`;

    const section = element('section', 'stack chart-section');
    section.append(element('h2', 'section-title chart-heading', 'Trends'));
    section.append(element('p', 'muted', `Spending per month, ${rangeText}.`));

    const monthsWithData = series.filter(({ monthKey }) => monthHasSpending(ctx.data, monthKey));
    if (monthsWithData.length === 0) {
        const empty = element('div', 'card empty-state');
        empty.append(element('p', '', `No spending recorded from ${rangeText}.`));
        const add = element('button', 'btn btn-primary', 'Add an expense');
        add.type = 'button';
        add.addEventListener('click', () => ctx.goTo('add', { panel: 'expense' }));
        empty.append(add);
        section.append(empty);
        root.append(section);
        return;
    }

    const averageCents = Math.round(
        monthsWithData.reduce((total, { spentCents }) => total + spentCents, 0) / monthsWithData.length,
    );

    const card = element('div', 'card chart-card');
    card.append(renderMonthBars(series, {
        label: `Spending per month, ${rangeText}`,
        averageCents,
        tableCaption: `Spending, budget and income per month, ${rangeText}`,
    }));
    const monthsWord = monthsWithData.length === 1 ? 'month' : 'months';
    card.append(element(
        'p',
        'muted bars-caption',
        `Average ${formatEuro(averageCents)} counts only the ${monthsWithData.length} ${monthsWord} with spending. `
            + 'Tap a bar for details.',
    ));
    section.append(card, renderChanges(ctx));
    root.append(section);
}
