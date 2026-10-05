import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Brace walker: every leaf rule as { selector, body } (same technique as test/cssRules.test.js). */
function parse(source) {
    const rules = [];
    const stack = [];
    let start = 0;
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '{') {
            stack.push({ prelude: source.slice(start, i).trim(), bodyStart: i + 1, nested: false });
            if (stack.length > 1) stack[stack.length - 2].nested = true;
            start = i + 1;
        } else if (source[i] === '}') {
            const open = stack.pop();
            if (open && !open.nested) {
                rules.push({ selector: open.prelude, body: source.slice(open.bodyStart, i) });
            }
            start = i + 1;
        }
    }
    return rules;
}

const rules = parse(css);
const bodiesFor = (selector) =>
    rules
        .filter((rule) => rule.selector.split(',').some((part) => part.trim() === selector))
        .map((rule) => rule.body);
const bodyOf = (selector) => {
    const bodies = bodiesFor(selector);
    assert.ok(bodies.length > 0, `no rule for ${selector}`);
    return bodies.join('\n');
};

test(':root defines the content width token', () => {
    assert.ok(bodiesFor(':root').some((body) => /--content-max:\s*46rem;/.test(body)));
});

test('#view is a centred column of --content-max', () => {
    const body = bodyOf('#view');
    assert.match(body, /max-width:\s*var\(--content-max\)/);
    assert.match(body, /margin-inline:\s*auto/);
});

test('header and tab bar centre their content on the same column', () => {
    for (const selector of ['.app-header', '.tabbar']) {
        const line = bodyOf(selector).match(/padding-inline:[^;]*;/);
        assert.ok(line, `${selector} has no padding-inline`);
        assert.match(line[0], /max\(/, selector);
        assert.match(line[0], /var\(--content-max\)/, selector);
    }
});

test('the toast and the rights mark stay out of the column', () => {
    for (const selector of ['.toast', '.rights-mark']) {
        assert.doesNotMatch(bodyOf(selector), /content-max/, selector);
    }
});

test('a disabled legend row keeps full text contrast: only the swatch fades', () => {
    const row = bodyOf('.chart-legend-button:disabled');
    assert.doesNotMatch(row, /opacity/);
    assert.match(row, /cursor:\s*default/);
    assert.match(bodyOf('.chart-legend-button:disabled .chart-swatch'), /opacity:\s*0\.45/);
});

test('the by-category table scrolls instead of squeezing its name column', () => {
    const th = bodyOf('.data-table tbody th');
    assert.doesNotMatch(th, /overflow-wrap:\s*anywhere/);
    assert.match(th, /overflow-wrap:\s*break-word/);
    assert.match(th, /min-width:\s*7rem/);
    assert.match(bodyOf('.year-category-table'), /min-width:\s*17rem/);
});
