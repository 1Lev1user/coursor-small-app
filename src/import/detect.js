const DELIMITERS = [',', ';', '\t', '|'];
const MAX_SAMPLE_LINES = 60;

function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function rootElement(text) {
    let rest = text;
    for (;;) {
        rest = rest.trimStart();
        if (rest.startsWith('<?')) {
            const end = rest.indexOf('?>');
            if (end === -1) return null;
            rest = rest.slice(end + 2);
        } else if (rest.startsWith('<!--')) {
            const end = rest.indexOf('-->');
            if (end === -1) return null;
            rest = rest.slice(end + 3);
        } else if (rest.startsWith('<!')) {
            const end = rest.indexOf('>');
            if (end === -1) return null;
            rest = rest.slice(end + 1);
        } else {
            break;
        }
    }

    const match = /^<([A-Za-z_][\w.:-]*)([^>]*)>/.exec(rest);
    if (!match) return null;

    const qualified = match[1];
    const localName = qualified.includes(':') ? qualified.split(':').pop() : qualified;
    return { localName, attrs: match[2] };
}

function detectXml(text) {
    const root = rootElement(text);
    if (!root) return 'unknown';

    const name = root.localName.toLowerCase();
    const head = text.slice(0, 4000).toLowerCase();

    if (name === 'fidavista' || /fidavista/.test(root.attrs.toLowerCase())) {
        return 'fidavista';
    }
    if (
        /camt\.05[234]/.test(root.attrs.toLowerCase())
        || (name === 'document' && /bktocstmr(stmt|acctrpt|dbtcdtntfctn)/.test(head))
    ) {
        return 'camt';
    }
    return 'unknown';
}

function countOutsideQuotes(line, delimiter) {
    let count = 0;
    let quoted = false;
    for (const char of line) {
        if (char === '"') {
            quoted = !quoted;
        } else if (char === delimiter && !quoted) {
            count += 1;
        }
    }
    return count;
}

function looksDelimited(text) {
    const lines = text
        .split(/\r\n|\n|\r/)
        .filter((line) => line.trim() !== '')
        .slice(0, MAX_SAMPLE_LINES);
    if (lines.length < 2) return false;

    return DELIMITERS.some((delimiter) => {
        const frequency = new Map();
        for (const line of lines) {
            const count = countOutsideQuotes(line, delimiter);
            if (count > 0) {
                frequency.set(count, (frequency.get(count) ?? 0) + 1);
            }
        }
        const best = Math.max(0, ...frequency.values());
        return best >= 2 && best * 2 >= lines.length;
    });
}

export function detectFormat(text, fileName = '') {
    if (typeof text !== 'string') return 'unknown';

    const body = stripBom(text).trimStart();
    if (body === '') return 'unknown';

    if (body.startsWith('<')) {
        return detectXml(body);
    }
    if (/\.xml$/i.test(fileName)) {
        return 'unknown';
    }
    return looksDelimited(body) ? 'csv' : 'unknown';
}
