import { monthTotals } from '../budget.js';
import { formatEuro } from '../money.js';
import { addMonths, isInMonth, monthLabel } from '../months.js';

const SHORT_MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

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

function shortDate(date) {
    const [, month, day] = date.split('-').map(Number);
    return `${day} ${SHORT_MONTH_NAMES[month - 1]}`;
}

function displayPercent(percent) {
    return `${Math.round(percent * 10) / 10}%`;
}

function renderNavigator(root, ctx) {
    const navigator = element('div', 'row month-navigator');
    const previous = element('button', 'btn btn-ghost', '\u2039');
    previous.type = 'button';
    previous.setAttribute('aria-label', 'Previous month');
    previous.addEventListener('click', () => ctx.setMonthKey(addMonths(ctx.monthKey, -1)));

    const label = element('h2', 'month-title', monthLabel(ctx.monthKey));

    const next = element('button', 'btn btn-ghost', '\u203a');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next month');
    next.addEventListener('click', () => ctx.setMonthKey(addMonths(ctx.monthKey, 1)));

    navigator.append(previous, label, next);
    root.append(navigator);
}

function headline(caption, amountCents, negativeMessage) {
    const wrapper = element('div', 'month-headline');
    const label = element('p', 'muted', caption);
    const amount = element('p', 'big-number', formatEuro(amountCents));
    if (amountCents < 0) {
        amount.classList.add('is-danger');
        wrapper.append(label, amount, element('p', 'danger-note', negativeMessage));
    } else {
        wrapper.append(label, amount);
    }
    return wrapper;
}

function renderSummary(root, totals) {
    const card = element('section', 'card stack');
    const headlines = element('div', 'month-headlines');
    headlines.append(
        headline('Budget left', totals.budgetLeftCents, 'over budget'),
        headline('Cash left', totals.cashLeftCents, 'more spent than came in'),
    );
    card.append(
        headlines,
        element(
            'p',
            'muted',
            `Spent ${formatEuro(totals.spentCents)} of ${formatEuro(totals.budgetCents)}`
                + ` \u00b7 Income ${formatEuro(totals.incomeCents)}`,
        ),
    );
    root.append(card);
}

function comparisonText(currentTotals, previousTotals, previousMonthKey) {
    const previousLabel = monthLabel(previousMonthKey);
    if (previousTotals.spentCents === 0) {
        return `No spending recorded in ${previousLabel}`;
    }

    const difference = currentTotals.spentCents - previousTotals.spentCents;
    if (difference === 0) {
        return `Same as ${previousLabel}`;
    }

    const direction = difference > 0 ? 'more' : 'less';
    return `${formatEuro(Math.abs(difference))} ${direction} than ${previousLabel}`;
}

function renderCategories(root, categories) {
    const card = element('section', 'card stack');
    card.append(element('h2', 'section-title', 'Categories'));

    const list = element('div', 'category-list');
    for (const category of categories) {
        const item = element('div', 'category-item');
        const heading = element('div', 'row category-heading');
        heading.append(
            element('h3', 'category-name', category.name),
            element(
                'p',
                'category-amount',
                `${formatEuro(category.spentCents)} of `
                    + (category.limitCents === 0 ? 'no budget' : formatEuro(category.limitCents)),
            ),
        );

        const track = element('div', 'progress-track');
        const fill = element('div', 'progress-fill');
        const width = category.limitCents === 0
            ? 0
            : Math.min(100, Math.max(0, category.spentCents / category.limitCents * 100));
        fill.style.width = `${width}%`;
        if (category.over) {
            fill.classList.add('is-over');
        }
        track.append(fill);

        const details = element('div', 'row category-details');
        details.append(element('span', 'muted', displayPercent(category.percent)));
        if (category.over) {
            details.append(
                element(
                    'span',
                    'pill pill-danger',
                    `over by ${formatEuro(category.overByCents)}`,
                ),
            );
        }

        item.append(heading, track, details);
        list.append(item);
    }

    card.append(list);
    root.append(card);
}

function expenseLabel(data, expense) {
    const category = data.categories.find(({ id }) => id === expense.categoryId);
    const categoryName = category?.name ?? expense.categoryId;
    if (expense.subcategoryId === '') {
        return categoryName;
    }

    const subcategory = category?.subcategories?.find(
        ({ id }) => id === expense.subcategoryId,
    );
    return `${categoryName} \u00b7 ${subcategory?.name ?? 'Unspecified'}`;
}

function incomeLabel(data, income) {
    return data.incomeCategories.find(({ id }) => id === income.incomeCategoryId)?.name
        ?? income.incomeCategoryId;
}

function monthEntries(data, monthKey) {
    const expenses = data.expenses
        .map((entry, insertionIndex) => ({ entry, insertionIndex, type: 'expense' }))
        .filter(({ entry }) => isInMonth(entry.date, monthKey));
    const incomes = data.incomes
        .map((entry, insertionIndex) => ({ entry, insertionIndex, type: 'income' }))
        .filter(({ entry }) => isInMonth(entry.date, monthKey));

    return [...expenses, ...incomes].sort((first, second) => {
        const byDate = second.entry.date.localeCompare(first.entry.date);
        if (byDate !== 0) {
            return byDate;
        }
        return second.insertionIndex - first.insertionIndex;
    });
}

function renderEntry(data, item) {
    const { entry, type } = item;
    const row = element('div', 'entry-row');
    const description = element('div', 'entry-description');
    const label = type === 'expense'
        ? expenseLabel(data, entry)
        : incomeLabel(data, entry);
    description.append(element('p', 'entry-name', label));
    if (typeof entry.note === 'string' && entry.note.trim() !== '') {
        description.append(element('p', 'muted', entry.note));
    }

    const values = element('div', 'entry-values');
    values.append(element('time', 'muted', shortDate(entry.date)));
    const amountText = type === 'income'
        ? `+${formatEuro(entry.amountCents)}`
        : formatEuro(entry.amountCents);
    const amount = element('p', type === 'income' ? 'entry-amount is-ok' : 'entry-amount', amountText);
    values.append(amount);

    row.append(description, values);
    return row;
}

function renderEntries(root, ctx, entries, label) {
    if (entries.length === 0) {
        const empty = element('section', 'card empty-state');
        const message = element('p', '', `Nothing recorded in ${label}.`);
        const button = element('button', 'btn btn-primary', 'Add an expense');
        button.type = 'button';
        button.addEventListener('click', () => ctx.goTo('add'));
        empty.append(message, button);
        root.append(empty);
        return;
    }

    const card = element('section', 'card stack');
    card.append(element('h2', 'section-title', 'Entries'));
    const list = element('div', 'entry-list');
    for (const item of entries) {
        list.append(renderEntry(ctx.data, item));
    }
    card.append(list);
    root.append(card);
}

export function render(root, ctx) {
    const totals = monthTotals(ctx.data, ctx.monthKey);
    const previousMonthKey = addMonths(ctx.monthKey, -1);
    const previousTotals = monthTotals(ctx.data, previousMonthKey);
    const label = monthLabel(ctx.monthKey);
    const entries = monthEntries(ctx.data, ctx.monthKey);

    const layout = element('div', 'stack');
    renderNavigator(layout, ctx);
    renderSummary(layout, totals);
    layout.append(element('p', 'muted month-comparison', comparisonText(
        totals,
        previousTotals,
        previousMonthKey,
    )));
    renderCategories(layout, totals.categories);
    renderEntries(layout, ctx, entries, label);
    root.append(layout);
}
