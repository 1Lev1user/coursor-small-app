import { decodeEntities } from './xml.js';

// Reads the tables of an HTML page (many banks save an HTML table as ".xls").
// A small tolerant scanner, not a full HTML parser: no DOM, so it runs in tests too.

const MAX_ROWS = 200000;
const MAX_COLUMNS = 1000;
const MAX_SPAN = 100;
const MAX_DEPTH = 20;

const TOO_LARGE = 'This file is too large to read.';
const NO_TABLE = 'No table of transactions was found in this file.';

// Mirrors DATE_CELL in xlsx.js (not exported there).
const DATE_CELL = /^\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;

// Named entities that xml.js decodeEntities does not know.
const HTML_ENTITIES = {
    nbsp: ' ',
    ensp: ' ',
    emsp: ' ',
    thinsp: ' ',
    euro: '€',
    pound: '£',
    ndash: '–',
    mdash: '—',
    middot: '·',
    laquo: '«',
    raquo: '»',
    hellip: '…',
};

class LimitError extends Error {}

function decodeText(chunk) {
    if (!chunk.includes('&')) return chunk;
    return chunk.replace(/&(?:#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match) => {
        const name = match.slice(1, -1);
        return Object.hasOwn(HTML_ENTITIES, name) ? HTML_ENTITIES[name] : decodeEntities(match);
    });
}

/** Index of the '>' that ends the tag starting at `start`, skipping quoted values; -1 when none. */
function findTagEnd(source, start) {
    let quote = '';
    for (let cursor = start; cursor < source.length; cursor += 1) {
        const char = source[cursor];
        if (quote) {
            if (char === quote) quote = '';
        } else if (char === '"' || char === '\'') {
            quote = char;
        } else if (char === '>') {
            return cursor;
        }
    }
    // An unbalanced quote: fall back to the first plain '>'.
    return source.indexOf('>', start);
}

function newContext() {
    return { rows: [], row: null, cell: null, span: 1 };
}

function closeCell(ctx) {
    if (ctx.cell === null) return;
    const text = ctx.cell.join('').replace(/ +/g, ' ').replace(/ *\n */g, '\n').trim();
    ctx.cell = null;
    ctx.row ??= [];
    ctx.row.push(text);
    for (let i = 1; i < ctx.span; i += 1) ctx.row.push('');
    if (ctx.row.length > MAX_COLUMNS) throw new LimitError();
}

function closeRow(ctx) {
    closeCell(ctx);
    const row = ctx.row;
    ctx.row = null;
    if (!row) return;
    while (row.length > 0 && row[row.length - 1] === '') row.pop();
    if (row.length === 0) return;
    ctx.rows.push(row);
    if (ctx.rows.length > MAX_ROWS) throw new LimitError();
}

function spanOf(tag) {
    const match = /\bcolspan\s*=\s*["']?(\d+)/i.exec(tag);
    if (!match) return 1;
    return Math.min(Math.max(Number(match[1]), 1), MAX_SPAN);
}

function scanTables(source) {
    const tables = [];
    const stack = [];
    let index = 0;

    const skipTo = (pattern, from) => {
        pattern.lastIndex = from;
        const found = pattern.exec(source);
        return found ? found.index + found[0].length : source.length;
    };

    while (index < source.length) {
        const lt = source.indexOf('<', index);
        const textEnd = lt === -1 ? source.length : lt;
        const top = stack[stack.length - 1];
        if (top?.cell && textEnd > index) {
            top.cell.push(decodeText(source.slice(index, textEnd)).replace(/\s+/g, ' '));
        }
        if (lt === -1) break;

        const next = source[lt + 1] ?? '';
        if (next === '!' || next === '?') {
            index = source.startsWith('<!--', lt)
                ? skipTo(/-->/g, lt + 4)
                : skipTo(/>/g, lt + 2);
            continue;
        }
        if (!/[a-zA-Z/]/.test(next)) {
            // A lone '<' is text.
            if (top?.cell) top.cell.push('<');
            index = lt + 1;
            continue;
        }

        const end = findTagEnd(source, lt + 1);
        if (end === -1) break;
        const tag = source.slice(lt, end + 1);
        index = end + 1;

        const name = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(tag)?.[1].toLowerCase() ?? '';
        const closing = next === '/';

        if (closing) {
            if (name === 'table' && stack.length > 0) {
                closeRow(top);
                tables.push(stack.pop().rows);
            } else if (top && (name === 'td' || name === 'th')) {
                closeCell(top);
            } else if (top && name === 'tr') {
                closeRow(top);
            }
        } else if (name === 'table') {
            if (stack.length >= MAX_DEPTH) throw new LimitError();
            stack.push(newContext());
        } else if (name === 'script' || name === 'style') {
            index = skipTo(new RegExp(`</${name}[\\s>]`, 'gi'), index);
        } else if (top && name === 'tr') {
            closeRow(top);
            top.row = [];
        } else if (top && (name === 'td' || name === 'th')) {
            closeCell(top);
            top.cell = [];
            top.span = spanOf(tag);
        } else if (top?.cell && name === 'br') {
            top.cell.push('\n');
        }
    }

    while (stack.length > 0) {
        const open = stack.pop();
        closeRow(open);
        tables.push(open.rows);
    }
    return tables;
}

function hasDate(rows) {
    return rows.some((row) => row.some((cell) => DATE_CELL.test(cell.trim())));
}

/**
 * Reads the table with the most rows that holds a date, out of an HTML page.
 * @param {string} text
 * @returns {{ ok: true, rows: string[][] } | { ok: false, reason: string }}
 */
export function readHtmlTable(text) {
    if (typeof text !== 'string') return { ok: false, reason: NO_TABLE };
    try {
        let best = null;
        for (const rows of scanTables(text)) {
            if (hasDate(rows) && (!best || rows.length > best.length)) best = rows;
        }
        return best ? { ok: true, rows: best } : { ok: false, reason: NO_TABLE };
    } catch (error) {
        return { ok: false, reason: error instanceof LimitError ? TOO_LARGE : NO_TABLE };
    }
}
