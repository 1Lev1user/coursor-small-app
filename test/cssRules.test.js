import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Text found between two closing braces: a rule whose selector line was lost. */
function strayText(source) {
    const stray = [];
    const regex = /\}([^{}]*)\}/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
        if (match[1].trim() !== '') stray.push(match[1].trim());
        regex.lastIndex = match.index + 1; // the closing brace may start the next match
    }
    return stray;
}

/** Brace walker: every leaf rule as { selector, body, ancestors } (ancestors are at-rule preludes). */
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
                rules.push({
                    selector: open.prelude,
                    body: source.slice(open.bodyStart, i),
                    ancestors: stack.map((entry) => entry.prelude),
                });
            }
            start = i + 1;
        }
    }
    return rules;
}

const rules = parse(css);
const rulesFor = (selector) =>
    rules.filter((rule) => rule.selector.split(',').some((part) => part.trim() === selector));

test('style.css has balanced braces and no stray text between closing braces', () => {
    const open = (css.match(/\{/g) || []).length;
    const close = (css.match(/\}/g) || []).length;
    assert.equal(open, close, 'unequal { and } counts');
    assert.deepEqual(strayText(css), []);
});

test('the stray-text check finds the old orphan-declaration bug', () => {
    assert.notDeepEqual(strayText('.a{x:1}\n background: var(--savings);\n}\n.b{y:2}'), []);
});

test('the Savings progress fill is coloured and the track-only fill is not dropped', () => {
    const savings = rulesFor('.progress-fill.is-savings');
    assert.ok(savings.length > 0, '.progress-fill.is-savings rule missing');
    assert.ok(savings.some((rule) => rule.body.includes('var(--savings)')));
    assert.ok(rulesFor('.progress-fill.is-track-only').length > 0, '.progress-fill.is-track-only rule missing');
});

test('every :hover rule sits inside @media (hover: hover)', () => {
    const hover = rules.filter((rule) => rule.selector.includes(':hover'));
    assert.ok(hover.length >= 11, `only ${hover.length} :hover rules seen`);
    for (const rule of hover) {
        assert.ok(
            rule.ancestors.some((prelude) => /^@media\s*\(hover:\s*hover\)/.test(prelude)),
            `${rule.selector} is not inside @media (hover: hover)`,
        );
    }
});

test('disabled buttons and the focus ring use their tokens', () => {
    const disabled = rules.find((rule) => rule.selector.split(',').some((part) => part.trim() === '.btn:disabled'));
    assert.ok(disabled, '.btn:disabled rule missing');
    assert.match(disabled.body, /background:\s*var\(--btn-off\)/);
    assert.match(disabled.body, /color:\s*var\(--btn-off-ink\)/);

    const roots = rules.filter((rule) => rule.selector === ':root');
    assert.equal(roots.length, 2, 'expected a light and a dark :root block');
    for (const block of roots) {
        assert.match(block.body, /--btn-off:/);
        assert.match(block.body, /--btn-off-ink:/);
    }
    assert.ok(roots.some((block) => /--focus:/.test(block.body)), '--focus token missing');

    const focus = rules.find((rule) => rule.selector === ':focus-visible');
    assert.ok(focus, ':focus-visible rule missing');
    assert.ok(focus.body.includes('outline: 3px solid var(--focus)'));
});

test('the toast clears the rights strip above the tab bar', () => {
    const toast = rules.find((rule) => rule.selector === '.toast');
    assert.ok(toast, '.toast rule missing');
    const bottom = toast.body.match(/bottom:\s*([^;]+);/);
    assert.ok(bottom && bottom[1].includes('1.6rem'), '.toast bottom lacks 1.6rem');
});
