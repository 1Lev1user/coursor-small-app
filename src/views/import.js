import { formatEuro, parseAmount } from '../money.js';
import { monthKeyOf, monthLabel } from '../months.js';
import { createId } from '../model.js';
import { formatMoney } from '../currency.js';
import { detectFormat } from '../import/detect.js';
import {
    decodeBytes,
    parseDelimited,
    findHeaderRow,
    guessColumns,
    parseDateWith,
    rowsToStatement,
} from '../import/text.js';
import { parseCamt, parseFidavista } from '../import/xml.js';
import { readXlsx } from '../import/xlsx.js';
import {
    findDuplicates,
    defaultDecisions,
    extractPattern,
    buildImport,
    applyImport,
    undoImport,
    summarise,
} from '../import/core.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PREVIEW_ROWS = 5;
const GUESS_SAMPLE_ROWS = 20;
const SKIPPED_SHOWN = 20;
const TABULAR_FORMATS = ['csv', 'xlsx', 'paste'];

const KIND_LABELS = {
    expense: 'Expense',
    refund: 'Refund',
    income: 'Income',
    transfer: 'Transfer',
    skip: 'Skip',
};

const KIND_HINTS = {
    transfer: 'Money between your own accounts. Not counted.',
    skip: 'This row will not be imported.',
};

const SKIP_REASONS = {
    'summary row': 'Summary or balance line',
    'unparsable date': 'Date not recognised',
    'unparsable amount': 'Amount not recognised',
};

const DUPLICATE_GROUPS = [
    ['exact', 'Exact', 'Already imported. The bank reference or every detail matches.'],
    ['probable', 'Probable', 'Same date and amount as an entry you added yourself.'],
    ['weak', 'Weak', 'Same amount within 2 days of a saved entry.'],
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function headerSignature(header) {
    if (!Array.isArray(header) || header.length === 0) return '';
    return header.map((cell) => String(cell ?? '').trim().toLowerCase()).join('|');
}

export function findSavedLayout(layouts, signature) {
    if (!signature) return null;
    return (layouts ?? []).find((layout) => layout.signature === signature) ?? null;
}

function samplesAt(sampleRows, index) {
    if (index < 0) return [];
    return sampleRows
        .map((row) => String(row[index] ?? '').trim())
        .filter((value) => value !== '');
}

const DECIMAL_TAIL = /\d([.,])\d{1,2}\)?-?$/;

/** False when the sample clearly uses another decimal separator or dates the saved layout cannot read. */
export function layoutFitsSample(saved, sampleRows) {
    const columns = saved.columns ?? {};
    const other = saved.decimalSeparator === ',' ? '.' : ',';
    let own = 0;
    let foreign = 0;
    for (const key of ['amount', 'debit', 'credit']) {
        for (const value of samplesAt(sampleRows, columns[key] ?? -1)) {
            const match = DECIMAL_TAIL.exec(value);
            if (match?.[1] === other && !value.includes(saved.decimalSeparator)) foreign += 1;
            else if (match) own += 1;
        }
    }
    if (foreign > 0 && own === 0) return false;
    return samplesAt(sampleRows, columns.date ?? -1)
        .every((value) => parseDateWith(value, saved.dateFormat) !== null);
}

export function kindsForDirection(direction) {
    return direction === 'in'
        ? ['refund', 'income', 'transfer', 'skip']
        : ['expense', 'transfer', 'skip'];
}

export function patternFor(row) {
    return extractPattern(row.counterparty || row.description);
}

/** Other included rows with the same merchant pattern and money direction. */
export function samePatternIndexes(rows, decisions, index) {
    const pattern = patternFor(rows[index]);
    if (pattern === '') return [];
    const result = [];
    rows.forEach((row, other) => {
        if (
            other !== index
            && decisions[other]?.include === true
            && row.direction === rows[index].direction
            && patternFor(row) === pattern
        ) {
            result.push(other);
        }
    });
    return result;
}

export function copyChoice(target, source) {
    target.kind = source.kind;
    target.categoryId = source.categoryId;
    target.subcategoryId = source.subcategoryId;
    target.incomeCategoryId = source.incomeCategoryId;
    target.showAs = source.showAs ?? '';
    return target;
}

function categoryPath(data, categoryId, subcategoryId) {
    const category = (data.categories ?? []).find(({ id }) => id === categoryId);
    const sub = category?.subcategories?.find(({ id }) => id === subcategoryId);
    return [category?.name ?? 'Uncategorised', sub?.name].filter(Boolean).join(' \u00b7 ');
}

/** 'Next time: RIMI → Necessary expenses · Groceries as "Produkti"' */
export function rememberHint(data, decision) {
    const pattern = String(decision.pattern ?? '').trim().toUpperCase() || 'this text';
    let target;
    if (decision.kind === 'transfer') {
        target = 'Transfer';
    } else if (decision.kind === 'skip') {
        target = 'Skip';
    } else if (decision.kind === 'income') {
        const income = (data.incomeCategories ?? []).find(({ id }) => id === decision.incomeCategoryId);
        target = income?.name ?? 'Income';
    } else {
        const path = categoryPath(data, decision.categoryId, decision.subcategoryId);
        target = decision.kind === 'refund' ? `Refund to ${path}` : path;
    }
    const showAs = String(decision.showAs ?? '').trim();
    const counted = decision.kind !== 'transfer' && decision.kind !== 'skip';
    const suffix = counted && showAs !== '' ? ` as "${showAs}"` : '';
    return `Next time: ${pattern} \u2192 ${target}${suffix}`;
}

export function bankTextOf(row) {
    return String(row.counterparty || row.description || '').replace(/\s+/g, ' ').trim();
}

/** Decisions as buildImport expects them: typed EUR amounts for foreign rows, pattern only when remembered. */
export function decisionsForBuild(rows, decisions, eurInputs) {
    return decisions.map((decision, index) => {
        const next = { ...decision };
        if (!Number.isInteger(rows[index].amountCents)) {
            next.amountCents = parseAmount(String(eurInputs[index] ?? '')) ?? undefined;
        }
        if (decision.remember !== true) delete next.pattern;
        return next;
    });
}

export function layoutRecord({ name, signature, delimiter, encoding, headerRow, layout }) {
    const columns = { ...layout.columns };
    if (layout.mode === 'split') {
        columns.amount = -1;
        columns.direction = -1;
    } else {
        columns.debit = -1;
        columns.credit = -1;
    }
    return {
        id: createId('layout'),
        name,
        signature,
        delimiter: delimiter ?? '',
        decimalSeparator: layout.decimalSeparator === ',' ? ',' : '.',
        dateFormat: layout.dateFormat,
        encoding: encoding ?? '',
        headerRow,
        columns,
    };
}

/** Same signature replaces the stored layout and keeps its id. */
export function upsertLayout(data, record) {
    data.bankLayouts ??= [];
    const index = data.bankLayouts.findIndex(({ signature }) => signature === record.signature);
    if (index === -1) {
        data.bankLayouts.push(record);
        return record;
    }
    const kept = { ...record, id: data.bankLayouts[index].id };
    data.bankLayouts[index] = kept;
    return kept;
}

function ordinal(day) {
    const tens = day % 100;
    if (tens >= 11 && tens <= 13) return `${day}th`;
    return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export function dateQuestion(sample) {
    const dmy = parseDateWith(sample, 'DMY');
    const mdy = parseDateWith(sample, 'MDY');
    if (!dmy || !mdy || dmy === mdy) return 'Which date format does this file use?';
    const [, dm, dd] = dmy.split('-').map(Number);
    const [, mm, md] = mdy.split('-').map(Number);
    return `Is ${sample} the ${ordinal(dd)} of ${MONTH_NAMES[dm - 1]} or ${MONTH_NAMES[mm - 1]} ${ordinal(md)}?`;
}

function columnLetter(index) {
    let value = index + 1;
    let letters = '';
    while (value > 0) {
        const rest = (value - 1) % 26;
        letters = String.fromCharCode(65 + rest) + letters;
        value = Math.floor((value - 1) / 26);
    }
    return letters;
}

function entryCountText(count) {
    return count === 1 ? '1 entry' : `${count} entries`;
}

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

function freshState() {
    return {
        step: 'load',
        pasteOpen: false,
        pasteText: '',
        loading: false,
        loadError: '',
        token: 0,
        fileName: '',
        format: '',
        encoding: '',
        table: null,
        layout: null,
        askDate: false,
        dateSample: '',
        savedLayoutName: '',
        layoutMismatch: '',
        bankName: '',
        rememberLayout: true,
        rows: [],
        skipped: [],
        warnings: [],
        rowsKey: '',
        duplicates: [],
        decisions: [],
        eurInputs: [],
        touched: new Set(),
        knownOpen: false,
        rowErrors: new Map(),
        categoriseError: '',
        built: null,
        planChoices: {},
        applyError: '',
        result: null,
        undoneCount: null,
        focusId: '',
        focusStep: false,
    };
}

let state = freshState();

export function resetImport() {
    const token = state.token + 1;
    state = freshState();
    state.token = token;
}

function isTabular() {
    return TABULAR_FORMATS.includes(state.format);
}

function stepList() {
    return isTabular()
        ? ['load', 'columns', 'duplicates', 'categorise', 'confirm']
        : ['load', 'duplicates', 'categorise', 'confirm'];
}

const STEP_NAMES = {
    load: 'Load',
    columns: 'Columns',
    duplicates: 'Duplicates',
    categorise: 'Categorise',
    confirm: 'Confirm',
};

function goStep(ctx, step) {
    state.step = step;
    state.focusStep = true;
    ctx.render();
}

function refresh(ctx, focusId = '') {
    state.focusId = focusId;
    ctx.render();
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(className, label, onClick) {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
}

function option(value, text, selected) {
    const node = element('option', '', text);
    node.value = String(value);
    node.selected = selected === true;
    return node;
}

function buildField(id, labelText, control, hint) {
    const wrapper = element('div', 'field');
    const label = element('label', '', labelText);
    label.htmlFor = id;
    control.id = id;
    wrapper.append(label, control);
    if (hint) {
        const note = element('p', 'muted', hint);
        note.id = `${id}-hint`;
        control.setAttribute('aria-describedby', note.id);
        wrapper.append(note);
    }
    return wrapper;
}

function selectOf(items, value, onChange) {
    const select = document.createElement('select');
    for (const [itemValue, text] of items) {
        select.append(option(itemValue, text, String(itemValue) === String(value)));
    }
    select.addEventListener('change', () => onChange(select.value, select));
    return select;
}

function checkRow(id, labelText, checked, onChange) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked, input));
    const label = element('label', 'imp-check');
    label.htmlFor = id;
    label.append(input, element('span', '', labelText));
    return label;
}

function actions(...nodes) {
    const row = element('div', 'imp-actions');
    row.append(...nodes.filter(Boolean));
    return row;
}

function alertText(message, id) {
    const node = element('p', 'error-text', message);
    node.setAttribute('role', 'alert');
    if (id) node.id = id;
    return node;
}

function amountText(row) {
    if (!Number.isInteger(row.amountCents)) {
        const sign = row.direction === 'out' ? '-' : '+';
        return `${sign}${formatMoney(row.originalAmountCents, row.currency)}`;
    }
    return row.direction === 'out' ? formatEuro(-row.amountCents) : `+${formatEuro(row.amountCents)}`;
}

function describeRow(row) {
    const parts = [row.counterparty, row.description].filter((part) => part && part !== '');
    const unique = parts.filter((part, index) => parts.indexOf(part) === index);
    return unique.join(' · ') || 'No description';
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function isZip(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function isOldExcel(bytes) {
    return bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

const UNKNOWN_FILE = 'This file does not look like a bank statement.'
    + ' Use a CSV, Excel (.xlsx), camt.053 or FiDAViSTA XML file.';

async function readStatementFile(file) {
    if (file.size > MAX_FILE_BYTES) {
        return { ok: false, reason: 'This file is larger than 10 MB. Export a shorter period.' };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0) {
        return { ok: false, reason: 'This file is empty.' };
    }
    if (isZip(bytes) || isOldExcel(bytes)) {
        const sheet = await readXlsx(bytes);
        if (!sheet.ok) return sheet;
        return { ok: true, kind: 'table', format: 'xlsx', rows: sheet.rows, delimiter: '', encoding: '' };
    }

    const { text, encoding } = decodeBytes(bytes);
    const format = detectFormat(text, file.name);
    if (format === 'camt' || format === 'fidavista') {
        const parsed = format === 'camt' ? parseCamt(text) : parseFidavista(text);
        if (!parsed.ok) return parsed;
        return { ok: true, kind: 'statement', format, rows: parsed.rows, warnings: parsed.warnings ?? [] };
    }
    if (format === 'csv') {
        const { delimiter, rows } = parseDelimited(text);
        return { ok: true, kind: 'table', format: 'csv', rows, delimiter, encoding };
    }
    return { ok: false, reason: UNKNOWN_FILE };
}

async function loadFile(ctx, file) {
    const token = state.token + 1;
    state.token = token;
    state.loading = true;
    state.loadError = '';
    refresh(ctx);

    let result;
    try {
        result = await readStatementFile(file);
    } catch {
        result = { ok: false, reason: 'Could not read that file.' };
    }
    if (state.token !== token) return;
    state.loading = false;
    if (!result.ok) {
        state.loadError = result.reason;
        refresh(ctx, 'imp-file');
        return;
    }
    state.fileName = file.name;
    acceptLoaded(ctx, result);
}

function loadPaste(ctx) {
    const text = state.pasteText;
    if (text.trim() === '') {
        state.loadError = 'Paste the rows from your bank first.';
        refresh(ctx, 'imp-paste');
        return;
    }
    const { delimiter, rows } = parseDelimited(text);
    if (rows.length === 0 || rows.every((row) => row.length < 2)) {
        state.loadError = 'Could not find columns in this text. Copy the table from your bank, including the header row.';
        refresh(ctx, 'imp-paste');
        return;
    }
    state.loadError = '';
    state.fileName = 'Pasted text';
    acceptLoaded(ctx, { ok: true, kind: 'table', format: 'paste', rows, delimiter, encoding: '' });
}

function acceptLoaded(ctx, result) {
    state.format = result.format;
    state.encoding = result.encoding ?? '';
    state.savedLayoutName = '';
    if (result.kind === 'statement') {
        state.table = null;
        state.layout = null;
        if (result.rows.length === 0) {
            state.loadError = 'No transactions were found in this file.';
            refresh(ctx, 'imp-file');
            return;
        }
        enterReview(ctx, result.rows, [], result.warnings);
        return;
    }
    startTable(ctx, result);
}

function startTable(ctx, result) {
    const rows = result.rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
    if (rows.length === 0) {
        state.loadError = 'No rows were found in this file.';
        refresh(ctx, 'imp-file');
        return;
    }
    const headerRow = findHeaderRow(rows);
    const header = headerRow >= 0 ? rows[headerRow] : [];
    const sample = rows.slice(headerRow + 1, headerRow + 1 + GUESS_SAMPLE_ROWS);
    const guess = guessColumns(header, sample);
    const columns = { ...guess.columns, eurAmount: -1 };
    const signature = headerSignature(header);

    state.table = { rows, headerRow, header, delimiter: result.delimiter ?? '', signature };
    state.layout = {
        mode: columns.debit >= 0 || columns.credit >= 0 ? 'split' : 'single',
        columns,
        decimalSeparator: guess.decimalSeparator,
        dateFormat: guess.dateFormat,
    };
    state.askDate = guess.dateFormat === null;
    state.dateSample = samplesAt(sample, columns.date)[0] ?? '';
    state.bankName = '';
    state.rememberLayout = signature !== '';

    state.layoutMismatch = '';
    const saved = findSavedLayout(ctx.data.bankLayouts, signature);
    if (saved && !layoutFitsSample(saved, sample)) {
        state.layoutMismatch = saved.name;
        state.bankName = saved.name;
    } else if (saved) {
        const savedColumns = { ...state.layout.columns, ...saved.columns };
        state.layout = {
            mode: savedColumns.debit >= 0 || savedColumns.credit >= 0 ? 'split' : 'single',
            columns: savedColumns,
            decimalSeparator: saved.decimalSeparator,
            dateFormat: saved.dateFormat,
        };
        state.askDate = false;
        state.bankName = saved.name;
        const parsed = parseTable();
        if (parsed.rows.length > 0) {
            state.savedLayoutName = saved.name;
            enterReview(ctx, parsed.rows, parsed.skipped, []);
            return;
        }
    }
    goStep(ctx, 'columns');
}

function parseLayout() {
    const { columns, mode } = state.layout;
    const effective = { ...columns };
    if (mode === 'split') {
        effective.amount = -1;
        effective.direction = -1;
    } else {
        effective.debit = -1;
        effective.credit = -1;
    }
    return {
        columns: effective,
        decimalSeparator: state.layout.decimalSeparator,
        dateFormat: state.layout.dateFormat,
    };
}

function layoutProblem() {
    const { columns, mode, dateFormat } = state.layout;
    if (columns.date < 0) return 'Choose the date column.';
    if (mode === 'single' && columns.amount < 0) return 'Choose the amount column.';
    if (mode === 'split' && columns.debit < 0 && columns.credit < 0) return 'Choose the money out and money in columns.';
    if (!dateFormat) return 'Answer the date question above.';
    return '';
}

function parseTable() {
    if (layoutProblem() !== '') return { rows: [], skipped: [] };
    const result = rowsToStatement(state.table.rows, state.table.headerRow, parseLayout());
    return { rows: result.rows, skipped: result.skipped };
}

function enterReview(ctx, rows, skipped, warnings) {
    state.skipped = skipped;
    state.warnings = warnings;
    const key = JSON.stringify(rows);
    if (key !== state.rowsKey) {
        state.rowsKey = key;
        state.rows = rows;
        state.duplicates = findDuplicates(ctx.data, rows);
        state.decisions = defaultDecisions(ctx.data, rows, state.duplicates)
            .map((decision, index) => ({ ...decision, pattern: patternFor(rows[index]) }));
        state.eurInputs = rows.map(() => '');
        state.touched = new Set();
        state.rowErrors = new Map();
        state.categoriseError = '';
        state.knownOpen = false;
        state.planChoices = {};
    }
    goStep(ctx, 'duplicates');
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function stepHeader(title) {
    const wrap = element('div', 'stack imp-head');
    const list = stepList();
    const index = list.indexOf(state.step);
    if (index >= 0) {
        const indicator = element('p', 'imp-steps');
        indicator.append(element('span', 'imp-steps-count', `Step ${index + 1} of ${list.length}`));
        const dots = element('span', 'imp-dots');
        dots.setAttribute('aria-hidden', 'true');
        list.forEach((step, dotIndex) => {
            const dot = element('span', 'imp-dot');
            if (dotIndex < index) dot.classList.add('is-done');
            if (dotIndex === index) dot.classList.add('is-current');
            dot.title = STEP_NAMES[step];
            dots.append(dot);
        });
        indicator.append(dots);
        wrap.append(indicator);
    }
    const heading = element('h2', 'section-title', title);
    heading.id = 'imp-step-title';
    heading.tabIndex = -1;
    wrap.append(heading);
    return wrap;
}

function cancelButton(ctx) {
    return button('btn btn-ghost', 'Cancel', () => {
        resetImport();
        ctx.goTo('more');
    });
}

function renderLoad(ctx) {
    const card = element('section', 'card stack');
    card.append(stepHeader('Import a bank statement'));
    card.append(element(
        'p',
        '',
        'Download a statement from your online bank as CSV, Excel (.xlsx) or XML (camt.053 or FiDAViSTA), then choose it here.',
    ));

    const fileLabel = element('label', 'btn btn-primary imp-file-label');
    fileLabel.htmlFor = 'imp-file';
    fileLabel.append(element('span', '', state.loading ? 'Reading the file...' : 'Choose file'));
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'imp-file';
    input.className = 'imp-file-input';
    input.accept = '.csv,.txt,.xlsx,.xls,.xml';
    input.disabled = state.loading;
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = '';
        if (file) loadFile(ctx, file);
    });
    fileLabel.append(input);

    const pasteToggle = button('btn', state.pasteOpen ? 'Hide paste box' : 'Paste text', () => {
        state.pasteOpen = !state.pasteOpen;
        state.loadError = '';
        refresh(ctx, state.pasteOpen ? 'imp-paste' : 'imp-paste-toggle');
    });
    pasteToggle.id = 'imp-paste-toggle';
    pasteToggle.setAttribute('aria-expanded', String(state.pasteOpen));
    card.append(actions(fileLabel, pasteToggle));

    if (state.pasteOpen) {
        const area = document.createElement('textarea');
        area.className = 'imp-textarea';
        area.rows = 8;
        area.spellcheck = false;
        area.value = state.pasteText;
        area.placeholder = 'Date\tDescription\tAmount';
        area.addEventListener('input', () => {
            state.pasteText = area.value;
        });
        card.append(
            buildField('imp-paste', 'Rows copied from your bank', area, 'Copy the table on the bank website, including the header row.'),
            actions(button('btn btn-primary', 'Use this text', () => loadPaste(ctx))),
        );
    }

    if (state.loadError !== '') {
        card.append(alertText(state.loadError, 'imp-load-error'));
    }
    card.append(element('p', 'muted', 'The file is read on this device. Nothing is uploaded.'));
    card.append(actions(cancelButton(ctx)));
    return card;
}

function columnOptions(includeUnused) {
    const width = Math.max(...state.table.rows.map((row) => row.length));
    const items = includeUnused ? [[-1, 'Not used']] : [[-1, 'Choose a column']];
    for (let index = 0; index < width; index += 1) {
        const name = String(state.table.header[index] ?? '').trim();
        items.push([index, name ? `${columnLetter(index)}: ${name}` : `Column ${columnLetter(index)}`]);
    }
    return items;
}

function previewTable() {
    const { rows, headerRow, header } = state.table;
    const width = Math.max(...rows.map((row) => row.length));
    const data = rows.slice(headerRow + 1, headerRow + 1 + PREVIEW_ROWS);

    const wrap = element('div', 'imp-table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Preview of the first rows');
    const table = element('table', 'imp-table');
    const head = element('thead');
    const headRow = element('tr');
    for (let index = 0; index < width; index += 1) {
        const th = element('th');
        th.scope = 'col';
        th.append(element('span', 'imp-col-letter', columnLetter(index)));
        const name = String(header[index] ?? '').trim();
        if (name) th.append(element('span', '', ` ${name}`));
        headRow.append(th);
    }
    head.append(headRow);
    const body = element('tbody');
    for (const row of data) {
        const tr = element('tr');
        for (let index = 0; index < width; index += 1) {
            tr.append(element('td', '', String(row[index] ?? '')));
        }
        body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
    return wrap;
}

function columnSelect(ctx, key, labelText, includeUnused, hint) {
    const id = `imp-col-${key}`;
    const select = selectOf(columnOptions(includeUnused), state.layout.columns[key], (value) => {
        state.layout.columns = { ...state.layout.columns, [key]: Number(value) };
        if (key === 'date') {
            const sample = samplesAt(state.table.rows.slice(state.table.headerRow + 1), Number(value));
            state.dateSample = sample[0] ?? '';
        }
        refresh(ctx, id);
    });
    return buildField(id, labelText, select, hint);
}

function renderSkipped(skipped) {
    const box = element('div', 'stack imp-skipped');
    box.append(element('p', 'muted', `${plural(skipped.length, 'line was', 'lines were')} skipped:`));
    const list = element('ul', 'imp-skipped-list');
    for (const item of skipped.slice(0, SKIPPED_SHOWN)) {
        list.append(element('li', 'muted', `Row ${item.line}: ${SKIP_REASONS[item.reason] ?? item.reason}`));
    }
    if (skipped.length > SKIPPED_SHOWN) {
        list.append(element('li', 'muted', `And ${skipped.length - SKIPPED_SHOWN} more.`));
    }
    box.append(list);
    return box;
}

function renderColumns(ctx) {
    const card = element('section', 'card stack');
    card.append(stepHeader('Check the columns'));
    const lines = state.table.rows.length - (state.table.headerRow + 1);
    card.append(element(
        'p',
        '',
        `${state.fileName}: ${plural(lines, 'row', 'rows')}. Check the guessed columns against the preview.`,
    ));
    if (state.layoutMismatch !== '') {
        card.append(element('p', 'imp-strong', `The saved layout "${state.layoutMismatch}" does not fit this file, so the columns were guessed again.`));
    }
    card.append(previewTable());

    const mode = element('fieldset', 'choice-set');
    mode.append(element('legend', '', 'How does the file show amounts?'));
    const modeRow = element('div', 'choice-row');
    for (const [value, text] of [['single', 'One amount column'], ['split', 'Money out and money in columns']]) {
        const label = element('label', 'choice');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'imp-amount-mode';
        radio.id = `imp-mode-${value}`;
        radio.value = value;
        radio.checked = state.layout.mode === value;
        radio.addEventListener('change', () => {
            state.layout.mode = value;
            refresh(ctx, radio.id);
        });
        label.append(radio, element('span', '', text));
        modeRow.append(label);
    }
    mode.append(modeRow);
    card.append(mode);

    const grid = element('div', 'imp-grid');
    grid.append(columnSelect(ctx, 'date', 'Date', false));
    if (state.layout.mode === 'split') {
        grid.append(
            columnSelect(ctx, 'debit', 'Money out (debit)', true),
            columnSelect(ctx, 'credit', 'Money in (credit)', true),
        );
    } else {
        grid.append(columnSelect(ctx, 'amount', 'Amount', false));
    }
    grid.append(
        columnSelect(ctx, 'description', 'Description', true),
        columnSelect(ctx, 'currency', 'Currency (optional)', true),
    );
    if (state.layout.mode === 'single') {
        grid.append(columnSelect(ctx, 'direction', 'Direction column (optional)', true, 'A column with D or K, debit or credit.'));
    }
    if (state.layout.columns.currency >= 0) {
        grid.append(columnSelect(ctx, 'eurAmount', 'Amount in EUR (optional)', true, 'For rows in another currency.'));
    }
    grid.append(columnSelect(ctx, 'bankRef', 'Bank reference (optional)', true));

    const decimal = selectOf(
        [['.', 'Dot (12.50)'], [',', 'Comma (12,50)']],
        state.layout.decimalSeparator,
        (value) => {
            state.layout.decimalSeparator = value;
            refresh(ctx, 'imp-decimal');
        },
    );
    grid.append(buildField('imp-decimal', 'Decimal separator', decimal));
    card.append(grid);

    if (state.askDate) {
        const dateSelect = selectOf(
            [['', 'Choose'], ['DMY', 'Day first (day.month.year)'], ['MDY', 'Month first (month.day.year)'], ['YMD', 'Year first (year.month.day)']],
            state.layout.dateFormat ?? '',
            (value) => {
                state.layout.dateFormat = value === '' ? null : value;
                refresh(ctx, 'imp-date-format');
            },
        );
        card.append(buildField('imp-date-format', dateQuestion(state.dateSample), dateSelect));
    }

    const problem = layoutProblem();
    const parsed = parseTable();
    const status = element('div', 'stack imp-parse-status');
    status.setAttribute('aria-live', 'polite');
    if (problem !== '') {
        status.append(element('p', 'imp-strong', problem));
    } else {
        status.append(element(
            'p',
            parsed.rows.length > 0 ? 'imp-strong' : 'error-text',
            parsed.rows.length > 0
                ? `${plural(parsed.rows.length, 'row is', 'rows are')} ready to import.`
                : 'No rows could be read with these columns.',
        ));
        if (parsed.skipped.length > 0) status.append(renderSkipped(parsed.skipped));
    }
    card.append(status);

    if (state.table.signature !== '') {
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.autocomplete = 'off';
        nameInput.maxLength = 40;
        nameInput.placeholder = 'For example Swedbank';
        nameInput.value = state.bankName;
        nameInput.addEventListener('input', () => {
            state.bankName = nameInput.value;
        });
        card.append(
            buildField('imp-bank-name', 'Bank name', nameInput),
            checkRow('imp-remember-layout', 'Remember these columns for this bank', state.rememberLayout, (checked) => {
                state.rememberLayout = checked;
            }),
        );
    }

    const next = button('btn btn-primary', 'Continue', () => {
        const again = parseTable();
        if (again.rows.length === 0) return;
        state.savedLayoutName = '';
        enterReview(ctx, again.rows, again.skipped, []);
    });
    next.disabled = parsed.rows.length === 0;
    card.append(actions(
        button('btn', 'Back', () => goStep(ctx, 'load')),
        next,
        cancelButton(ctx),
    ));
    return card;
}

function storedEntry(data, duplicate) {
    const list = duplicate.matchType === 'income' ? data.incomes : data.expenses;
    return (list ?? []).find(({ id }) => id === duplicate.matchId) ?? null;
}

function entrySummary(title, date, amount, note) {
    const box = element('div', 'imp-side');
    box.append(element('p', 'imp-side-title', title));
    box.append(element('p', 'imp-strong', amount));
    box.append(element('p', 'muted', date));
    box.append(element('p', 'imp-note', note || 'No note'));
    return box;
}

function renderDuplicates(ctx) {
    const card = element('section', 'card stack');
    card.append(stepHeader('Check for duplicates'));

    if (state.savedLayoutName !== '') {
        const note = element('div', 'imp-note-row');
        note.append(
            element('p', '', `Using saved layout "${state.savedLayoutName}".`),
            button('btn btn-ghost imp-link', 'Change columns', () => goStep(ctx, 'columns')),
        );
        card.append(note);
    }
    card.append(element('p', '', `${state.fileName}: ${plural(state.rows.length, 'transaction', 'transactions')}.`));
    for (const warning of state.warnings) {
        card.append(element('p', 'muted', warning));
    }
    if (state.skipped.length > 0) card.append(renderSkipped(state.skipped));

    const flagged = state.duplicates.some(({ level }) => level);
    if (!flagged) {
        card.append(element('p', 'imp-strong', 'No duplicates found.'));
    } else {
        for (const [level, title, explain] of DUPLICATE_GROUPS) {
            const indexes = state.duplicates
                .map((duplicate, index) => (duplicate.level === level ? index : -1))
                .filter((index) => index >= 0);
            if (indexes.length === 0) continue;
            const group = element('section', 'stack imp-group');
            const groupTitle = element('h3', 'category-name', `${title} (${indexes.length})`);
            group.append(groupTitle, element('p', 'muted', explain));
            const list = element('ul', 'entry-list imp-list');
            for (const index of indexes) {
                const row = state.rows[index];
                const match = storedEntry(ctx.data, state.duplicates[index]);
                const item = element('li', 'entry-item stack imp-dup');
                const duplicate = state.duplicates[index];
                if (duplicate.matchType === 'ignored') {
                    const earlier = element('div', 'imp-pair');
                    earlier.append(
                        entrySummary('In the file', row.date, amountText(row), describeRow(row)),
                        element('p', 'imp-side imp-note', duplicate.ignoredKind === 'transfer'
                            ? 'Marked as transfer in an earlier import'
                            : 'Skipped in an earlier import'),
                    );
                    item.append(earlier, checkRow(
                        `imp-dup-${index}`,
                        'Import anyway',
                        state.decisions[index].include === true,
                        (checked) => {
                            state.decisions[index].include = checked;
                        },
                    ));
                    list.append(item);
                    continue;
                }
                const pair = element('div', 'imp-pair');
                pair.append(
                    entrySummary('In the file', row.date, amountText(row), describeRow(row)),
                    match
                        ? entrySummary(
                            'Already saved',
                            match.date,
                            state.duplicates[index].matchType === 'income' || match.refund
                                ? `+${formatEuro(match.amountCents)}`
                                : formatEuro(-match.amountCents),
                            match.note,
                        )
                        : entrySummary('Already saved', '', '', ''),
                );
                item.append(pair, checkRow(
                    `imp-dup-${index}`,
                    'Import anyway',
                    state.decisions[index].include === true,
                    (checked) => {
                        state.decisions[index].include = checked;
                    },
                ));
                list.append(item);
            }
            group.append(list);
            card.append(group);
        }
    }

    card.append(actions(
        button('btn', 'Back', () => goStep(ctx, isTabular() ? 'columns' : 'load')),
        button('btn btn-primary', 'Continue', () => {
            state.rowErrors = new Map();
            state.categoriseError = '';
            goStep(ctx, 'categorise');
        }),
        cancelButton(ctx),
    ));
    return card;
}

function categoryItems(data) {
    return data.categories.map((category) => [category.id, category.name]);
}

function subcategoryItems(data, categoryId) {
    const category = data.categories.find(({ id }) => id === categoryId);
    return [['', 'No subcategory'], ...(category?.subcategories ?? []).map((sub) => [sub.id, sub.name])];
}

function renderDecisionRow(ctx, index) {
    const row = state.rows[index];
    const decision = state.decisions[index];
    const item = element('li', 'entry-item stack imp-row');
    item.id = `imp-row-${index}`;

    const head = element('div', 'entry-row');
    const text = element('div', 'entry-description');
    text.append(element('p', 'entry-name imp-desc', describeRow(row)), element('p', 'muted', row.date));
    if (row.currency !== 'EUR' && Number.isInteger(row.amountCents)) {
        text.append(element('p', 'muted', `Paid ${formatMoney(row.originalAmountCents, row.currency)}`));
    }
    const amount = element('p', row.direction === 'in' ? 'entry-amount is-ok' : 'entry-amount', amountText(row));
    head.append(text, amount);
    item.append(head);

    const grid = element('div', 'imp-grid');
    const kinds = kindsForDirection(row.direction);
    const kindId = `imp-kind-${index}`;
    const kindSelect = selectOf(
        kinds.map((kind) => [kind, KIND_LABELS[kind]]),
        decision.kind,
        (value) => {
            decision.kind = value;
            state.touched.add(index);
            state.rowErrors.delete(index);
            refresh(ctx, kindId);
        },
    );
    grid.append(buildField(kindId, 'What is it?', kindSelect, KIND_HINTS[decision.kind]));

    if (decision.kind === 'expense' || decision.kind === 'refund') {
        const categoryId = `imp-cat-${index}`;
        const subId = `imp-sub-${index}`;
        const categorySelect = selectOf(categoryItems(ctx.data), decision.categoryId, (value) => {
            decision.categoryId = value;
            decision.subcategoryId = '';
            state.touched.add(index);
            state.rowErrors.delete(index);
            refresh(ctx, categoryId);
        });
        const subSelect = selectOf(subcategoryItems(ctx.data, decision.categoryId), decision.subcategoryId, (value) => {
            decision.subcategoryId = value;
            state.touched.add(index);
            refresh(ctx, subId);
        });
        grid.append(
            buildField(categoryId, decision.kind === 'refund' ? 'Refund to category' : 'Category', categorySelect),
            buildField(subId, 'Subcategory', subSelect),
        );
    } else if (decision.kind === 'income') {
        const incomeId = `imp-income-${index}`;
        const incomeSelect = selectOf(
            ctx.data.incomeCategories.map((category) => [category.id, category.name]),
            decision.incomeCategoryId,
            (value) => {
                decision.incomeCategoryId = value;
                state.touched.add(index);
                state.rowErrors.delete(index);
                refresh(ctx, incomeId);
            },
        );
        grid.append(buildField(incomeId, 'Income category', incomeSelect));
    }

    const counted = decision.kind !== 'transfer' && decision.kind !== 'skip';
    if (counted && !Number.isInteger(row.amountCents)) {
        const eurId = `imp-eur-${index}`;
        const eurInput = document.createElement('input');
        eurInput.type = 'text';
        eurInput.inputMode = 'decimal';
        eurInput.autocomplete = 'off';
        eurInput.placeholder = '12.50';
        eurInput.value = state.eurInputs[index];
        eurInput.required = true;
        eurInput.addEventListener('input', () => {
            state.eurInputs[index] = eurInput.value;
        });
        grid.append(buildField(
            eurId,
            'Charged in EUR',
            eurInput,
            `The file shows ${formatMoney(row.originalAmountCents, row.currency)} only. Enter what your bank took in euros.`,
        ));
    }
    item.append(grid);

    const hint = element('p', 'muted imp-hint', rememberHint(ctx.data, decision));
    hint.id = `imp-hint-${index}`;
    const updateHint = () => {
        hint.textContent = rememberHint(ctx.data, decision);
    };

    const applySlot = element('div', 'imp-apply-slot');
    const offerApplyAll = () => {
        if (applySlot.childElementCount > 0) return;
        const others = samePatternIndexes(state.rows, state.decisions, index);
        if (others.length === 0) return;
        applySlot.append(button(
            'btn btn-ghost imp-link',
            `Apply to all ${plural(others.length + 1, 'row', 'rows')} with ${patternFor(row)}`,
            () => {
                for (const other of others) {
                    copyChoice(state.decisions[other], decision);
                    state.rowErrors.delete(other);
                }
                ctx.toast(`Applied to ${plural(others.length, 'more row', 'more rows')}`);
                state.touched.delete(index);
                refresh(ctx, kindId);
            },
        ));
    };

    if (counted) {
        const showAsInput = document.createElement('input');
        showAsInput.type = 'text';
        showAsInput.autocomplete = 'off';
        showAsInput.maxLength = 120;
        showAsInput.placeholder = bankTextOf(row);
        showAsInput.value = decision.showAs ?? '';
        showAsInput.addEventListener('input', () => {
            decision.showAs = showAsInput.value;
            state.touched.add(index);
            updateHint();
            offerApplyAll();
        });
        item.append(buildField(
            `imp-showas-${index}`,
            'Show as',
            showAsInput,
            'The note on the entry. Leave empty to keep the bank text.',
        ));
    }

    const pattern = decision.pattern ?? '';
    if (pattern !== '' || decision.remember) {
        const remember = checkRow(
            `imp-remember-${index}`,
            `Remember for ${pattern || 'this text'}`,
            decision.remember === true,
            (checked) => {
                decision.remember = checked;
                refresh(ctx, `imp-remember-${index}`);
            },
        );
        item.append(remember);
        if (decision.remember) {
            const patternInput = document.createElement('input');
            patternInput.type = 'text';
            patternInput.autocomplete = 'off';
            patternInput.maxLength = 60;
            patternInput.value = pattern;
            patternInput.addEventListener('input', () => {
                decision.pattern = patternInput.value.toUpperCase();
                remember.querySelector('span').textContent = `Remember for ${decision.pattern.trim() || 'this text'}`;
                updateHint();
            });
            item.append(buildField(`imp-pattern-${index}`, 'Match text', patternInput), hint);
            patternInput.setAttribute('aria-describedby', hint.id);
        }
    }

    item.append(applySlot);
    if (state.touched.has(index)) offerApplyAll();

    const error = state.rowErrors.get(index);
    if (error) item.append(alertText(error, `imp-row-error-${index}`));
    return item;
}

function tryBuild(ctx) {
    const built = buildImport(
        ctx.data,
        decisionsForBuild(state.rows, state.decisions, state.eurInputs),
        {
            rows: state.rows,
            format: state.format,
            fileName: state.fileName,
            duplicates: state.duplicates,
        },
    );
    state.rowErrors = new Map(built.errors.map(({ index, reason }) => [index, reason]));
    return built;
}

function renderCategorise(ctx) {
    const card = element('section', 'card stack');
    card.append(stepHeader('Sort the transactions'));

    const included = state.decisions
        .map((decision, index) => (decision.include === true ? index : -1))
        .filter((index) => index >= 0);
    if (included.length === 0) {
        card.append(element('p', '', 'Nothing is left to import. Go back to include rows.'));
    }

    const known = included.filter((index) => state.decisions[index].ruleId);
    const fresh = included.filter((index) => !state.decisions[index].ruleId);

    if (state.categoriseError !== '') {
        card.append(alertText(state.categoriseError, 'imp-categorise-error'));
    }

    if (known.length > 0) {
        const group = element('section', 'stack imp-group');
        const head = element('div', 'imp-note-row');
        head.append(element('h3', 'category-name', `Known (${known.length})`));
        const toggle = button('btn btn-ghost imp-link', state.knownOpen ? 'Hide' : 'Show', () => {
            state.knownOpen = !state.knownOpen;
            refresh(ctx, 'imp-known-toggle');
        });
        toggle.id = 'imp-known-toggle';
        toggle.setAttribute('aria-expanded', String(state.knownOpen));
        toggle.setAttribute('aria-controls', 'imp-known-list');
        head.append(toggle);
        group.append(head, element('p', 'muted', `${plural(known.length, 'row was', 'rows were')} sorted by your rules.`));
        if (state.knownOpen) {
            const list = element('ul', 'entry-list imp-list');
            list.id = 'imp-known-list';
            for (const index of known) list.append(renderDecisionRow(ctx, index));
            group.append(list);
        }
        card.append(group);
    }

    if (fresh.length > 0) {
        const group = element('section', 'stack imp-group');
        group.append(element('h3', 'category-name', `New (${fresh.length})`));
        const list = element('ul', 'entry-list imp-list');
        for (const index of fresh) list.append(renderDecisionRow(ctx, index));
        group.append(list);
        card.append(group);
    }

    card.append(actions(
        button('btn', 'Back', () => goStep(ctx, 'duplicates')),
        button('btn btn-primary', 'Continue', () => {
            const built = tryBuild(ctx);
            if (!built.ok) {
                state.categoriseError = `${plural(built.errors.length, 'row needs', 'rows need')} attention.`;
                const first = built.errors[0].index;
                if (state.decisions[first].ruleId) state.knownOpen = true;
                refresh(ctx, `imp-row-${first}`);
                return;
            }
            state.categoriseError = '';
            state.built = built;
            state.applyError = '';
            for (const monthKey of built.planChoices) {
                state.planChoices[monthKey] ??= 'current';
            }
            goStep(ctx, 'confirm');
        }),
        cancelButton(ctx),
    ));
    return card;
}

function summaryList(items) {
    const list = element('dl', 'imp-summary');
    for (const [term, value] of items) {
        const row = element('div', 'imp-summary-row');
        row.append(element('dt', '', term), element('dd', '', value));
        list.append(row);
    }
    return list;
}

function renderPlanChoice(ctx, monthKey) {
    const set = element('fieldset', 'choice-set');
    set.append(element('legend', '', `There is no plan for ${monthLabel(monthKey)} yet.`));
    const row = element('div', 'choice-row');
    for (const [value, text] of [['current', 'Use my current budget'], ['actualOnly', 'Only record spending (no budget)']]) {
        const label = element('label', 'choice');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `imp-plan-${monthKey}`;
        radio.id = `imp-plan-${monthKey}-${value}`;
        radio.value = value;
        radio.checked = state.planChoices[monthKey] === value;
        radio.addEventListener('change', () => {
            state.planChoices[monthKey] = value;
        });
        label.append(radio, element('span', '', text));
        row.append(label);
    }
    set.append(row);
    return set;
}

function periodText(from, to) {
    if (!from) return 'None';
    return from === to ? from : `${from} to ${to}`;
}

function applyBuilt(ctx) {
    const built = state.built;
    const result = applyImport(ctx.data, built, state.planChoices);
    if (!result.ok) {
        state.applyError = result.reason;
        refresh(ctx, 'imp-apply-error');
        return;
    }
    if (isTabular() && state.rememberLayout && state.table?.signature) {
        const fallback = state.format === 'paste' ? 'Pasted table' : state.fileName.replace(/\.[^.]+$/, '');
        const name = state.bankName.trim() || fallback || 'My bank';
        upsertLayout(ctx.data, layoutRecord({
            name,
            signature: state.table.signature,
            delimiter: state.table.delimiter,
            encoding: state.encoding,
            headerRow: state.table.headerRow,
            layout: state.layout,
        }));
    }
    const count = built.expenses.length + built.incomes.length;
    const saved = ctx.save();
    state.result = {
        importId: result.importId,
        count,
        periodTo: built.importRecord.periodTo,
        saved: saved !== false,
    };
    state.undoneCount = null;
    if (saved !== false) ctx.toast(`Imported ${entryCountText(count)}`);
    goStep(ctx, 'done');
}

function renderConfirm(ctx) {
    const built = state.built;
    const card = element('section', 'card stack');
    card.append(stepHeader('Confirm the import'));
    const sum = summarise(built);
    card.append(summaryList([
        ['Expenses', String(sum.expenses)],
        ['Refunds', String(sum.refunds)],
        ['Incomes', String(sum.incomes)],
        ['Transfers (not counted)', String(sum.transfers)],
        ['Skipped', String(sum.skipped)],
        ['Duplicates left out', String(sum.duplicates)],
        ['Total out', formatEuro(sum.totalOutCents)],
        ['Total in', formatEuro(sum.totalInCents)],
        ['Period', periodText(sum.periodFrom, sum.periodTo)],
    ]));
    if (built.rules.length > 0) {
        card.append(element('p', 'muted', `${plural(built.rules.length, 'rule', 'rules')} will be saved: ${built.rules.map(({ pattern }) => pattern).join(', ')}.`));
    }
    if (isTabular() && state.rememberLayout && state.table?.signature && state.savedLayoutName === '') {
        card.append(element('p', 'muted', 'The column layout will be saved for this bank.'));
    }

    for (const monthKey of built.planChoices) {
        card.append(renderPlanChoice(ctx, monthKey));
    }

    if (state.applyError !== '') card.append(alertText(state.applyError, 'imp-apply-error'));

    const count = built.expenses.length + built.incomes.length;
    const apply = button('btn btn-primary', `Import ${entryCountText(count)}`, () => applyBuilt(ctx));
    apply.disabled = count === 0 && built.rules.length === 0;
    if (count === 0) {
        card.append(element('p', 'muted', 'No entries will be added.'));
    }
    card.append(actions(
        button('btn', 'Back', () => goStep(ctx, 'categorise')),
        apply,
        cancelButton(ctx),
    ));
    return card;
}

function renderDone(ctx) {
    const card = element('section', 'card stack');
    card.setAttribute('role', 'status');
    const { result } = state;
    const heading = element('h2', 'section-title', state.undoneCount === null ? 'Import finished' : 'Import undone');
    heading.id = 'imp-step-title';
    heading.tabIndex = -1;
    card.append(heading);

    const toSettings = button('btn', 'Back to Settings', () => {
        resetImport();
        ctx.goTo('more');
    });

    if (state.undoneCount !== null) {
        card.append(element('p', '', `${entryCountText(state.undoneCount)} removed. Rules you saved stay.`));
        card.append(actions(toSettings));
        return card;
    }

    card.append(element('p', 'big-number', entryCountText(result.count)));
    if (!result.saved) {
        card.append(alertText('The import is in memory but could not be saved on this device.'));
    }
    card.append(actions(
        button('btn btn-primary', 'Go to Month', () => {
            const monthKey = monthKeyOf(result.periodTo);
            resetImport();
            if (monthKey) ctx.setMonthKey(monthKey);
            ctx.goTo('month');
        }),
        button('btn', 'Undo this import', () => {
            const removed = undoImport(ctx.data, result.importId);
            ctx.save();
            state.undoneCount = removed;
            ctx.toast('Import undone');
            state.focusStep = true;
            ctx.render();
        }),
        toSettings,
    ));
    return card;
}

const RENDERERS = {
    load: renderLoad,
    columns: renderColumns,
    duplicates: renderDuplicates,
    categorise: renderCategorise,
    confirm: renderConfirm,
    done: renderDone,
};

function restoreFocus() {
    if (state.focusStep) {
        state.focusStep = false;
        state.focusId = '';
        window.scrollTo(0, 0);
        document.getElementById('imp-step-title')?.focus({ preventScroll: true });
        return;
    }
    if (state.focusId) {
        const id = state.focusId;
        state.focusId = '';
        document.getElementById(id)?.focus({ preventScroll: true });
    }
}

export function render(root, ctx) {
    if (state.step === 'columns' && !state.table) state.step = 'load';
    if (['duplicates', 'categorise'].includes(state.step) && state.rows.length === 0) state.step = 'load';
    if (state.step === 'confirm' && !state.built) state.step = 'load';
    if (state.step === 'done' && !state.result) state.step = 'load';

    const page = element('div', 'stack imp-page');
    page.append(RENDERERS[state.step](ctx));
    root.append(page);
    queueMicrotask(restoreFocus);
}
