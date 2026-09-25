import { fullDate } from '../months.js';
import { searchEntries } from '../search.js';
import { parseAmount } from '../money.js';
import { describeForeign } from '../currency.js';
import { entryAmountText, entryTagLabels } from './entryDisplay.js';

const RESULT_LIMIT = 100;

/** Pure view state; survives re-renders, never saved. */
const searchUi = {
    open: false,
    text: '',
    categoryId: '',
    type: 'all',
    minAmount: '',
    maxAmount: '',
    from: '',
    to: '',
    focus: '',
};

function resetSearchUi() {
    Object.assign(searchUi, {
        open: false,
        text: '',
        categoryId: '',
        type: 'all',
        minAmount: '',
        maxAmount: '',
        from: '',
        to: '',
    });
}

function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function option(value, text) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
    return node;
}

function buildField(id, labelText, control) {
    const wrapper = element('div', 'field');
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;
    const error = element('p', 'error-text');
    error.id = `${id}-error`;
    error.hidden = true;
    control.id = id;
    wrapper.append(label, control, error);
    return { wrapper, control, error };
}

function showError(field, message) {
    field.error.textContent = message;
    field.error.hidden = message === '';
    if (message === '') {
        field.control.removeAttribute('aria-invalid');
        field.control.removeAttribute('aria-describedby');
    } else {
        field.control.setAttribute('aria-invalid', 'true');
        field.control.setAttribute('aria-describedby', field.error.id);
    }
}

function amountFilter(value) {
    const trimmed = value.trim();
    if (trimmed === '') {
        return { cents: undefined, error: '' };
    }
    const cents = parseAmount(trimmed, { allowZero: true });
    return cents === null
        ? { cents: undefined, error: 'Enter an amount like 12.50.' }
        : { cents, error: '' };
}

/**
 * Turns the typed panel values into searchEntries filters.
 * @returns {{ filters: object, errors: { minAmount: string, maxAmount: string }, active: boolean }}
 */
export function searchFiltersFrom(state) {
    const min = amountFilter(state.minAmount);
    const max = amountFilter(state.maxAmount);
    const filters = {
        text: state.text.trim(),
        categoryId: state.categoryId,
        type: state.type,
        minCents: min.cents,
        maxCents: max.cents,
        from: state.from,
        to: state.to,
    };
    const active = filters.text !== ''
        || filters.categoryId !== ''
        || filters.type !== 'all'
        || Number.isFinite(filters.minCents)
        || Number.isFinite(filters.maxCents)
        || filters.from !== ''
        || filters.to !== '';
    return { filters, errors: { minAmount: min.error, maxAmount: max.error }, active };
}

function resultTexts(data, { type, entry }) {
    const note = typeof entry.note === 'string' ? entry.note.trim() : '';
    if (type === 'income') {
        const name = data.incomeCategories.find(({ id }) => id === entry.incomeCategoryId)?.name
            ?? 'Income';
        return { name: note || name, category: `Income · ${name}` };
    }
    const category = data.categories.find(({ id }) => id === entry.categoryId);
    const categoryName = category?.name ?? 'Expense';
    const subcategory = category?.subcategories?.find(({ id }) => id === entry.subcategoryId);
    const categoryText = subcategory === undefined
        ? categoryName
        : `${categoryName} · ${subcategory.name}`;
    return { name: note || subcategory?.name || categoryName, category: categoryText };
}

function renderResult(data, item) {
    const { name, category } = resultTexts(data, item);
    const row = element('li', 'search-result');

    const text = element('div', 'search-result-text');
    text.append(element('p', 'entry-name', name));
    const tags = entryTagLabels(item.type, item.entry);
    text.append(element('p', 'muted', [category, ...tags].join(' · ')));

    const values = element('div', 'entry-values');
    const time = element('time', 'muted', fullDate(item.entry.date));
    time.setAttribute('datetime', item.entry.date);
    const { text: amountText, positive } = entryAmountText(item.type, item.entry);
    values.append(time, element('p', positive ? 'entry-amount is-ok' : 'entry-amount', amountText));
    const foreign = describeForeign(item.entry);
    if (foreign !== '') {
        values.append(element('p', 'muted entry-foreign', foreign));
    }

    row.append(text, values);
    return row;
}

function resultCountText(count) {
    return count === 1 ? '1 result' : `${count} results`;
}

function renderClosed(ctx) {
    const wrap = element('div', 'search-toggle');
    const button = element('button', 'btn', 'Search');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
        searchUi.open = true;
        searchUi.focus = 'text';
        ctx.render();
    });
    wrap.append(button);
    if (searchUi.focus === 'toggle') {
        searchUi.focus = '';
        queueMicrotask(() => button.focus());
    }
    return wrap;
}

function categorySelect(data) {
    const select = document.createElement('select');
    select.append(option('', 'All categories'));
    const expenseGroup = document.createElement('optgroup');
    expenseGroup.label = 'Expenses';
    expenseGroup.append(...data.categories.map(({ id, name }) => option(id, name)));
    const incomeGroup = document.createElement('optgroup');
    incomeGroup.label = 'Income';
    incomeGroup.append(...data.incomeCategories.map(({ id, name }) => option(id, name)));
    select.append(expenseGroup, incomeGroup);
    const known = [...data.categories, ...data.incomeCategories]
        .some(({ id }) => id === searchUi.categoryId);
    if (!known) {
        searchUi.categoryId = '';
    }
    select.value = searchUi.categoryId;
    return select;
}

function textInput(type, value, extra = {}) {
    const input = document.createElement('input');
    input.type = type;
    input.autocomplete = 'off';
    input.value = value;
    Object.assign(input, extra);
    return input;
}

/** Search and filter panel over the whole history, collapsed behind a Search button. */
export function renderSearchPanel(ctx) {
    if (!searchUi.open) {
        return renderClosed(ctx);
    }

    const panel = element('section', 'card stack search-panel');
    panel.setAttribute('aria-labelledby', 'search-title');
    const title = element('h2', 'section-title', 'Search all entries');
    title.id = 'search-title';

    const text = buildField(
        'search-text',
        'Text',
        textInput('search', searchUi.text, { placeholder: 'Note or category' }),
    );
    const category = buildField('search-category', 'Category', categorySelect(ctx.data));
    const typeSelect = document.createElement('select');
    typeSelect.append(
        option('all', 'All'),
        option('expense', 'Expenses'),
        option('income', 'Income'),
    );
    typeSelect.value = searchUi.type;
    const type = buildField('search-type', 'Type', typeSelect);
    const decimal = { inputMode: 'decimal', placeholder: '0.00' };
    const minAmount = buildField(
        'search-min',
        'Amount from (€)',
        textInput('text', searchUi.minAmount, decimal),
    );
    const maxAmount = buildField(
        'search-max',
        'Amount to (€)',
        textInput('text', searchUi.maxAmount, decimal),
    );
    const from = buildField('search-from', 'Date from', textInput('date', searchUi.from));
    const to = buildField('search-to', 'Date to', textInput('date', searchUi.to));

    const grid = element('div', 'search-grid');
    grid.append(
        type.wrapper,
        category.wrapper,
        minAmount.wrapper,
        maxAmount.wrapper,
        from.wrapper,
        to.wrapper,
    );

    const count = element('p', 'search-count');
    count.setAttribute('role', 'status');
    const list = element('ul', 'search-results');
    const more = element('p', 'muted');

    function update() {
        const { filters, errors, active } = searchFiltersFrom(searchUi);
        showError(minAmount, errors.minAmount);
        showError(maxAmount, errors.maxAmount);
        if (!active) {
            count.textContent = 'Type a word or set a filter.';
            count.classList.add('muted');
            list.replaceChildren();
            more.hidden = true;
            return;
        }
        const results = searchEntries(ctx.data, filters);
        count.textContent = resultCountText(results.length);
        count.classList.remove('muted');
        list.replaceChildren(
            ...results.slice(0, RESULT_LIMIT).map((item) => renderResult(ctx.data, item)),
        );
        more.hidden = results.length <= RESULT_LIMIT;
        more.textContent = `Showing the newest ${RESULT_LIMIT}. Narrow the search to see more.`;
    }

    const bindings = [
        [text, 'text', 'input'],
        [category, 'categoryId', 'change'],
        [type, 'type', 'change'],
        [minAmount, 'minAmount', 'input'],
        [maxAmount, 'maxAmount', 'input'],
        [from, 'from', 'change'],
        [to, 'to', 'change'],
    ];
    for (const [field, key, eventName] of bindings) {
        field.control.addEventListener(eventName, () => {
            searchUi[key] = field.control.value;
            update();
        });
    }

    const clear = element('button', 'btn', 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', () => {
        resetSearchUi();
        searchUi.focus = 'toggle';
        ctx.render();
    });

    panel.append(title, text.wrapper, grid, clear, count, list, more);
    update();

    if (searchUi.focus === 'text') {
        searchUi.focus = '';
        queueMicrotask(() => text.control.focus());
    }
    return panel;
}
