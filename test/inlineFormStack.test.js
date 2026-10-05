import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Brace walker: every leaf rule as { selector, body } in file order. */
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
const indexFor = (selector) =>
    rules.findIndex((rule) => rule.selector.split(',').some((part) => part.trim() === selector));
const flexOf = (rule) => (rule.body.match(/(?:^|[;\s])flex:\s*([^;]+);/) || [])[1]?.trim();

test('a stacked inline form keeps its fields at their natural height', () => {
    const row = indexFor('.inline-form .field');
    const stacked = indexFor('.inline-form.stack .field');
    assert.ok(row >= 0, '.inline-form .field rule missing');
    assert.ok(stacked >= 0, '.inline-form.stack .field rule missing');
    assert.equal(flexOf(rules[stacked]), '0 0 auto');
    assert.ok(stacked > row, '.inline-form.stack .field must come after .inline-form .field');
});

test('the row layout of the inline forms still gives a field a 12rem width', () => {
    const row = indexFor('.inline-form .field');
    assert.ok(row >= 0, '.inline-form .field rule missing');
    assert.equal(flexOf(rules[row]), '1 1 12rem');
});
