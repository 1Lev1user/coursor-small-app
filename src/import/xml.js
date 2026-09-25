import { statementRow, parserOk, parserFail } from './types.js';

const NOT_XML = 'The file is not valid XML.';

// ---------------------------------------------------------------------------
// Minimal non-validating XML parser
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: '\'',
};

export function decodeEntities(value) {
    if (!value.includes('&')) {
        return value;
    }
    return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body) => {
        if (body[0] === '#') {
            const code = body[1] === 'x' || body[1] === 'X'
                ? parseInt(body.slice(2), 16)
                : parseInt(body.slice(1), 10);
            if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
                return match;
            }
            return String.fromCodePoint(code);
        }
        return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match;
    });
}

function splitName(qualified) {
    const colon = qualified.indexOf(':');
    return colon === -1
        ? { prefix: '', name: qualified }
        : { prefix: qualified.slice(0, colon), name: qualified.slice(colon + 1) };
}

const ATTR_PATTERN = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

function parseAttributes(source) {
    const attrs = {};
    const namespaces = {};
    let index = 0;

    while (index < source.length) {
        while (index < source.length && /\s/.test(source[index])) {
            index += 1;
        }
        if (index >= source.length) {
            break;
        }
        ATTR_PATTERN.lastIndex = index;
        const match = ATTR_PATTERN.exec(source);
        if (!match) {
            return null;
        }
        index = ATTR_PATTERN.lastIndex;

        const qualified = match[1];
        const value = decodeEntities(match[2] ?? match[3]);
        if (qualified === 'xmlns') {
            namespaces[''] = value;
        } else if (qualified.startsWith('xmlns:')) {
            namespaces[qualified.slice(6)] = value;
        } else {
            attrs[splitName(qualified).name] = value;
        }
    }

    return { attrs, namespaces };
}

function createNode(qualified, attrs, scope) {
    const { prefix, name } = splitName(qualified);
    return {
        name,
        prefix,
        ns: scope[prefix] ?? '',
        attrs,
        children: [],
        text: '',
    };
}

/**
 * Parses XML text into a small tree. Returns null when the input is not well formed.
 * @param {string} text
 * @returns {{ name: string, prefix: string, ns: string, attrs: Record<string, string>, children: object[], text: string } | null}
 */
export function parseXml(text) {
    if (typeof text !== 'string') {
        return null;
    }

    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const stack = [];
    const scopes = [{ xml: 'http://www.w3.org/XML/1998/namespace' }];
    let root = null;
    let index = 0;

    const appendText = (value) => {
        if (stack.length > 0) {
            stack[stack.length - 1].text += value;
            return true;
        }
        return value.trim() === '';
    };

    while (index < source.length) {
        const lt = source.indexOf('<', index);
        if (lt === -1) {
            if (!appendText(decodeEntities(source.slice(index)))) {
                return null;
            }
            break;
        }
        if (lt > index && !appendText(decodeEntities(source.slice(index, lt)))) {
            return null;
        }

        if (source.startsWith('<!--', lt)) {
            const end = source.indexOf('-->', lt + 4);
            if (end === -1) {
                return null;
            }
            index = end + 3;
        } else if (source.startsWith('<![CDATA[', lt)) {
            const end = source.indexOf(']]>', lt + 9);
            if (end === -1 || stack.length === 0) {
                return null;
            }
            stack[stack.length - 1].text += source.slice(lt + 9, end);
            index = end + 3;
        } else if (source.startsWith('<?', lt)) {
            const end = source.indexOf('?>', lt + 2);
            if (end === -1) {
                return null;
            }
            index = end + 2;
        } else if (source.startsWith('<!', lt)) {
            let depth = 0;
            let cursor = lt + 2;
            while (cursor < source.length) {
                const char = source[cursor];
                if (char === '[') {
                    depth += 1;
                } else if (char === ']') {
                    depth -= 1;
                } else if (char === '>' && depth <= 0) {
                    break;
                }
                cursor += 1;
            }
            if (cursor >= source.length) {
                return null;
            }
            index = cursor + 1;
        } else if (source[lt + 1] === '/') {
            const end = source.indexOf('>', lt + 2);
            if (end === -1) {
                return null;
            }
            const qualified = source.slice(lt + 2, end).trim();
            const open = stack.pop();
            scopes.pop();
            if (!open || open.qualified !== qualified) {
                return null;
            }
            index = end + 1;
        } else {
            const end = findTagEnd(source, lt + 1);
            if (end === -1) {
                return null;
            }
            let inner = source.slice(lt + 1, end);
            const selfClosing = inner.endsWith('/');
            if (selfClosing) {
                inner = inner.slice(0, -1);
            }
            const nameMatch = /^[^\s/>]+/.exec(inner);
            if (!nameMatch || !/^[A-Za-z_:À-￿]/.test(nameMatch[0])) {
                return null;
            }
            const qualified = nameMatch[0];
            const parsed = parseAttributes(inner.slice(qualified.length));
            if (!parsed) {
                return null;
            }
            const scope = { ...scopes[scopes.length - 1], ...parsed.namespaces };
            const node = createNode(qualified, parsed.attrs, scope);

            if (stack.length > 0) {
                stack[stack.length - 1].children.push(node);
            } else if (root) {
                return null;
            } else {
                root = node;
            }

            if (!selfClosing) {
                stack.push(Object.assign(node, { qualified }));
                scopes.push(scope);
            }
            index = end + 1;
        }
    }

    if (!root || stack.length > 0) {
        return null;
    }
    stripQualified(root);
    return root;
}

function findTagEnd(source, start) {
    let quote = '';
    for (let cursor = start; cursor < source.length; cursor += 1) {
        const char = source[cursor];
        if (quote) {
            if (char === quote) {
                quote = '';
            }
        } else if (char === '"' || char === '\'') {
            quote = char;
        } else if (char === '>') {
            return cursor;
        } else if (char === '<') {
            return -1;
        }
    }
    return -1;
}

function stripQualified(root) {
    const pending = [root];
    while (pending.length > 0) {
        const node = pending.pop();
        delete node.qualified;
        pending.push(...node.children);
    }
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

export function child(node, name) {
    return node?.children.find((item) => item.name === name) ?? null;
}

export function children(node, name) {
    if (!node) {
        return [];
    }
    return name === undefined ? node.children : node.children.filter((item) => item.name === name);
}

/** All nodes reached by following 'A/B/C' through every matching branch. */
export function pathAll(node, route) {
    let current = node ? [node] : [];
    for (const step of route.split('/').filter(Boolean)) {
        current = current.flatMap((item) => children(item, step));
    }
    return current;
}

export function path(node, route) {
    return pathAll(node, route)[0] ?? null;
}

export function textAt(node, route) {
    const target = route ? path(node, route) : node;
    return target ? target.text.trim() : '';
}

function firstText(node, routes) {
    for (const route of routes) {
        const value = textAt(node, route);
        if (value) {
            return value;
        }
    }
    return '';
}

function descendants(node, name) {
    const found = [];
    const pending = [node];
    while (pending.length > 0) {
        const item = pending.shift();
        for (const next of item.children) {
            if (next.name === name) {
                found.push(next);
            } else {
                pending.push(next);
            }
        }
    }
    return found;
}

// ---------------------------------------------------------------------------
// Shared value parsing
// ---------------------------------------------------------------------------

/**
 * Converts a decimal string ('-12.345', '1,50') to integer cents, rounding half away from zero.
 * @param {string} value
 * @returns {number | null}
 */
export function decimalToCents(value) {
    const match = /^([+-]?)(\d*)(?:[.,](\d*))?$/.exec(String(value ?? '').trim().replace(/\s/g, ''));
    if (!match || (match[2] === '' && !match[3])) {
        return null;
    }
    const whole = match[2] || '0';
    const fraction = (match[3] ?? '').padEnd(3, '0');
    let cents = Number(whole) * 100 + Number(fraction.slice(0, 2));
    if (Number(fraction[2]) >= 5) {
        cents += 1;
    }
    if (!Number.isSafeInteger(cents)) {
        return null;
    }
    return match[1] === '-' ? -cents : cents;
}

function isoDate(value) {
    const text = String(value ?? '').trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }
    match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
    if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return '';
}

function cleanRef(value) {
    const text = String(value ?? '').trim();
    return text.toUpperCase() === 'NOTPROVIDED' ? '' : text;
}

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

function skippedWarnings(counts) {
    const warnings = [];
    if (counts.pending > 0) {
        warnings.push(`Skipped ${plural(counts.pending, 'entry that is', 'entries that are')} not booked yet.`);
    }
    if (counts.noDate > 0) {
        warnings.push(`Skipped ${plural(counts.noDate, 'entry', 'entries')} without a date.`);
    }
    if (counts.noAmount > 0) {
        warnings.push(`Skipped ${plural(counts.noAmount, 'entry', 'entries')} without a valid amount.`);
    }
    if (counts.noDirection > 0) {
        warnings.push(`Skipped ${plural(counts.noDirection, 'entry', 'entries')} without a debit or credit mark.`);
    }
    return warnings;
}

function amountWithCurrency(node) {
    if (!node) {
        return null;
    }
    const cents = decimalToCents(node.text);
    if (cents === null) {
        return null;
    }
    return { cents, currency: (node.attrs.Ccy ?? '').trim().toUpperCase() };
}

// ---------------------------------------------------------------------------
// ISO 20022 camt.052 / camt.053 / camt.054
// ---------------------------------------------------------------------------

const CAMT_CONTAINERS = [
    ['BkToCstmrStmt', 'Stmt'],
    ['BkToCstmrAcctRpt', 'Rpt'],
    ['BkToCstmrDbtCdtNtfctn', 'Ntfctn'],
];

function camtStatements(root) {
    const base = root.name === 'Document' ? root : { children: [root] };
    for (const [message, statement] of CAMT_CONTAINERS) {
        const container = child(base, message);
        if (container) {
            return children(container, statement);
        }
    }
    return null;
}

function camtStatus(entry) {
    const status = child(entry, 'Sts');
    if (!status) {
        return 'BOOK';
    }
    return (textAt(status, 'Cd') || textAt(status)).toUpperCase();
}

function camtDate(entry) {
    for (const route of ['BookgDt/Dt', 'BookgDt/DtTm', 'ValDt/Dt', 'ValDt/DtTm']) {
        const date = isoDate(textAt(entry, route));
        if (date) {
            return date;
        }
    }
    return '';
}

function camtCounterAmounts(entry) {
    const found = [];
    for (const base of ['AmtDtls', 'NtryDtls/TxDtls/AmtDtls']) {
        for (const kind of ['InstdAmt', 'TxAmt', 'CntrValAmt', 'AnncdPstngAmt', 'PrtryAmt']) {
            for (const node of pathAll(entry, `${base}/${kind}/Amt`)) {
                const amount = amountWithCurrency(node);
                if (amount && amount.currency) {
                    found.push({ ...amount, kind });
                }
            }
        }
    }
    return found;
}

function camtParty(entry, direction) {
    const role = direction === 'out' ? 'Cdtr' : 'Dbtr';
    const ultimate = direction === 'out' ? 'UltmtCdtr' : 'UltmtDbtr';
    return firstText(entry, [
        `NtryDtls/TxDtls/RltdPties/${role}/Nm`,
        `NtryDtls/TxDtls/RltdPties/${role}/Pty/Nm`,
        `NtryDtls/TxDtls/RltdPties/${ultimate}/Nm`,
        `NtryDtls/TxDtls/RltdPties/${ultimate}/Pty/Nm`,
    ]);
}

function camtDescription(entry) {
    const lines = pathAll(entry, 'NtryDtls/TxDtls/RmtInf/Ustrd')
        .map((node) => node.text.trim())
        .filter(Boolean);
    if (lines.length > 0) {
        return lines.join(' ');
    }
    return firstText(entry, ['AddtlNtryInf', 'NtryDtls/TxDtls/AddtlTxInf']);
}

function camtBankRef(entry) {
    for (const route of [
        'AcctSvcrRef',
        'NtryRef',
        'NtryDtls/TxDtls/Refs/AcctSvcrRef',
        'NtryDtls/TxDtls/Refs/EndToEndId',
    ]) {
        const value = cleanRef(textAt(entry, route));
        if (value) {
            return value;
        }
    }
    return '';
}

function camtEntry(entry, fallbackCurrency, counts) {
    if (!['BOOK', 'BOOKED'].includes(camtStatus(entry))) {
        counts.pending += 1;
        return null;
    }

    const indicator = textAt(entry, 'CdtDbtInd').toUpperCase();
    const direction = indicator === 'CRDT' ? 'in' : indicator === 'DBIT' ? 'out' : '';
    if (!direction) {
        counts.noDirection += 1;
        return null;
    }

    const date = camtDate(entry);
    if (!date) {
        counts.noDate += 1;
        return null;
    }

    const amount = amountWithCurrency(child(entry, 'Amt'));
    if (!amount || amount.cents === 0) {
        counts.noAmount += 1;
        return null;
    }
    const entryCurrency = amount.currency || fallbackCurrency;
    const others = camtCounterAmounts(entry);

    let amountCents = Math.abs(amount.cents);
    let currency = 'EUR';
    let originalAmountCents = amountCents;

    if (entryCurrency === 'EUR') {
        const foreign = others.find((item) => item.kind === 'InstdAmt' && item.currency !== 'EUR')
            ?? others.find((item) => item.currency !== 'EUR');
        if (foreign) {
            currency = foreign.currency;
            originalAmountCents = Math.abs(foreign.cents);
        }
    } else {
        const euro = others.find((item) => item.currency === 'EUR');
        currency = entryCurrency;
        originalAmountCents = Math.abs(amount.cents);
        amountCents = euro ? Math.abs(euro.cents) : null;
    }

    return statementRow({
        date,
        amountCents,
        direction,
        currency,
        originalAmountCents,
        description: camtDescription(entry),
        counterparty: camtParty(entry, direction),
        bankRef: camtBankRef(entry),
    });
}

/**
 * Parses an ISO 20022 camt.053 statement or camt.052 account report.
 * @param {string} text
 */
export function parseCamt(text) {
    const root = parseXml(text);
    if (!root) {
        return parserFail(NOT_XML);
    }
    const statements = camtStatements(root);
    if (!statements) {
        return parserFail('This XML file is not a camt.052 or camt.053 bank statement.');
    }

    const counts = { pending: 0, noDate: 0, noAmount: 0, noDirection: 0 };
    const rows = [];
    let entryCount = 0;

    for (const statement of statements) {
        const accountCurrency = (textAt(statement, 'Acct/Ccy') || 'EUR').toUpperCase();
        for (const entry of children(statement, 'Ntry')) {
            entryCount += 1;
            const row = camtEntry(entry, accountCurrency, counts);
            if (row) {
                rows.push(row);
            }
        }
    }

    if (entryCount === 0) {
        return parserFail('The statement has no transactions.');
    }
    return parserOk('camt', rows, skippedWarnings(counts));
}

// ---------------------------------------------------------------------------
// FiDAViSTA 1.1 / 1.2
// ---------------------------------------------------------------------------
//
// Written from memory without access to the official FiDAViSTA XSD. Every element
// name below is ASSUMED and UNVERIFIED against the spec:
//   Root and containers: FIDAVISTA, Statement, AccountSet, CcyStmt, TrxSet
//   Also accepted as entry containers: Trx, Transaction
//   Statement currency: CcyStmt/Ccy (also Ccy or Currency on AccountSet)
//   Entry currency: TrxSet/Ccy, TrxSet/Currency
//   Dates: BookDate, then ValueDate, then RegDate
//   Direction: CorD ('C' or 'D'; also tolerated: 'K', 'CR', 'CRDT', 'DR', 'DBIT');
//     when missing, the sign of the amount decides
//   Amount: AccAmt, then Amount, then Amt
//   Description: PmtInfo, then TypeName, then Details
//   Counterparty: CPartySet/AccHolder/Name, CPartySet/Name, CPartyName, CPartySet/AccHolder
//   Counterparty amount: CPartySet/Ccy with CPartySet/Amt (original currency when not
//     the account currency)
//   Bank reference: BankRef, then DocNo, then ExtId
//   Type code (not used for import decisions): TypeCode

const FIDAVISTA_ENTRY_NAMES = ['TrxSet', 'Trx', 'Transaction'];
const CURRENCY_NAMES = ['Ccy', 'Currency'];

function fidavistaEntries(root) {
    const entries = [];
    const walk = (node, currency) => {
        let scoped = currency;
        for (const name of CURRENCY_NAMES) {
            const value = textAt(node, name).toUpperCase();
            if (/^[A-Z]{3}$/.test(value) && !FIDAVISTA_ENTRY_NAMES.includes(node.name)) {
                scoped = value;
                break;
            }
        }
        for (const item of node.children) {
            if (FIDAVISTA_ENTRY_NAMES.includes(item.name)) {
                entries.push({ node: item, currency: scoped });
            } else if (item.children.length > 0) {
                walk(item, scoped);
            }
        }
    };
    walk(root, 'EUR');
    return entries;
}

function fidavistaDirection(node, cents) {
    const mark = textAt(node, 'CorD').toUpperCase();
    if (['C', 'K', 'CR', 'CRDT'].includes(mark)) {
        return 'in';
    }
    if (['D', 'DR', 'DBIT'].includes(mark)) {
        return 'out';
    }
    if (!mark && cents !== 0) {
        return cents < 0 ? 'out' : 'in';
    }
    return '';
}

function fidavistaEntry({ node, currency: statementCurrency }, counts) {
    const date = isoDate(firstText(node, ['BookDate', 'ValueDate', 'RegDate']));
    if (!date) {
        counts.noDate += 1;
        return null;
    }

    const cents = decimalToCents(firstText(node, ['AccAmt', 'Amount', 'Amt']));
    if (cents === null || cents === 0) {
        counts.noAmount += 1;
        return null;
    }

    const direction = fidavistaDirection(node, cents);
    if (!direction) {
        counts.noDirection += 1;
        return null;
    }

    const accountCurrency = (firstText(node, CURRENCY_NAMES) || statementCurrency).toUpperCase();
    const partyCurrency = textAt(node, 'CPartySet/Ccy').toUpperCase();
    const partyCents = decimalToCents(textAt(node, 'CPartySet/Amt'));

    let amountCents = Math.abs(cents);
    let currency = 'EUR';
    let originalAmountCents = amountCents;

    if (accountCurrency === 'EUR') {
        if (/^[A-Z]{3}$/.test(partyCurrency) && partyCurrency !== 'EUR' && partyCents) {
            currency = partyCurrency;
            originalAmountCents = Math.abs(partyCents);
        }
    } else {
        currency = accountCurrency;
        originalAmountCents = Math.abs(cents);
        amountCents = partyCurrency === 'EUR' && partyCents ? Math.abs(partyCents) : null;
    }

    return statementRow({
        date,
        amountCents,
        direction,
        currency,
        originalAmountCents,
        description: firstText(node, ['PmtInfo', 'TypeName', 'Details']),
        counterparty: firstText(node, [
            'CPartySet/AccHolder/Name',
            'CPartySet/Name',
            'CPartyName',
            'CPartySet/AccHolder',
        ]),
        bankRef: firstText(node, ['BankRef', 'DocNo', 'ExtId']),
    });
}

/**
 * Parses a FiDAViSTA statement (Latvian banks association XML).
 * @param {string} text
 */
export function parseFidavista(text) {
    const root = parseXml(text);
    if (!root) {
        return parserFail(NOT_XML);
    }
    if (root.name.toUpperCase() !== 'FIDAVISTA' && descendants(root, 'Statement').length === 0) {
        return parserFail('This XML file is not a FiDAViSTA bank statement.');
    }

    const entries = fidavistaEntries(root);
    if (entries.length === 0) {
        return parserFail('No transactions were found in this FiDAViSTA file. It may use a layout this app does not know yet.');
    }

    const counts = { pending: 0, noDate: 0, noAmount: 0, noDirection: 0 };
    const rows = entries.map((entry) => fidavistaEntry(entry, counts)).filter(Boolean);
    return parserOk('fidavista', rows, skippedWarnings(counts));
}
