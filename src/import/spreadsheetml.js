import { parseXml, child, children } from './xml.js';
import { plainNumber } from './xlsx.js';

// Reads an Excel 2003 XML workbook ("SpreadsheetML", saved as ".xls" by some banks).

const MAX_COLUMNS = 16384;
const NOT_WORKBOOK = 'The file is not a readable Excel XML workbook.';
const NO_ROWS = 'No rows were found in this Excel XML workbook.';
const TOO_WIDE = 'This Excel XML workbook is too wide to read.';

/** Text of a node and of everything below it. */
function allText(node) {
    let out = '';
    const pending = [node];
    while (pending.length > 0) {
        const item = pending.pop();
        out += item.text;
        for (let i = item.children.length - 1; i >= 0; i -= 1) pending.push(item.children[i]);
    }
    return out.trim();
}

function cellValue(data) {
    if (!data) return '';
    const raw = allText(data);
    switch (data.attrs.Type) {
        case 'DateTime':
            return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw;
        case 'Number':
            return plainNumber(raw);
        case 'Boolean':
            return raw === '1' ? 'TRUE' : 'FALSE';
        default:
            return raw;
    }
}

function wholeNumber(value) {
    return /^\d+$/.test(String(value ?? '').trim()) ? Number(value) : 0;
}

function readRow(row) {
    const out = [];
    let cursor = 0;
    for (const cell of children(row, 'Cell')) {
        const index = wholeNumber(cell.attrs.Index);
        if (index >= 1 && index - 1 >= cursor) cursor = index - 1;
        if (cursor >= MAX_COLUMNS) return null;
        while (out.length < cursor) out.push('');
        out[cursor] = cellValue(child(cell, 'Data'));
        cursor += 1 + Math.min(wholeNumber(cell.attrs.MergeAcross), MAX_COLUMNS);
    }
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out;
}

/**
 * Reads the first worksheet of a SpreadsheetML workbook.
 * @param {string} text
 * @returns {{ ok: true, rows: string[][] } | { ok: false, reason: string }}
 */
export function readSpreadsheetMl(text) {
    try {
        const root = parseXml(text);
        if (!root || root.name !== 'Workbook') return { ok: false, reason: NOT_WORKBOOK };

        const table = child(children(root, 'Worksheet')[0], 'Table');
        const rows = [];
        for (const row of children(table, 'Row')) {
            const values = readRow(row);
            if (!values) return { ok: false, reason: TOO_WIDE };
            if (values.length > 0) rows.push(values);
        }
        return rows.length > 0 ? { ok: true, rows } : { ok: false, reason: NO_ROWS };
    } catch {
        return { ok: false, reason: NOT_WORKBOOK };
    }
}
