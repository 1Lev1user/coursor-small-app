import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    COLLAPSE_MS,
    EASE_OUT,
    afterMotion,
    collapseKeyframes,
    entryIdSet,
    findNewEntryId,
} from '../src/motion.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)';

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
const ruleFor = (selector, ancestors = []) => rules.find(
    (rule) => rule.selector === selector && rule.ancestors.join('|') === ancestors.join('|'),
);
const declaration = (rule, property) =>
    rule.body.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1].replace(/\s+/g, ' ').trim();
const token = (name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

test('toast: the shown state is a class, the keyframe is gone', () => {
    const shown = ruleFor('.toast.is-shown');
    assert.ok(shown, '.toast.is-shown missing');
    assert.equal(declaration(shown, 'opacity'), '1');
    assert.match(declaration(shown, 'transform'), /^translate\(-50%,\s*0\)$/);
    assert.ok(!css.includes('@keyframes toast-in'), 'toast-in keyframe still defined');
    assert.ok(!/animation:\s*toast-in/.test(css), 'toast still uses toast-in');
});

test('toast: outside no-preference it only fades, with no offset', () => {
    for (const selector of ['.toast', '.toast.is-shown']) {
        const rule = ruleFor(selector);
        assert.match(declaration(rule, 'transform'), /^translate\(-50%,\s*0\)$/, selector);
    }
    const base = ruleFor('.toast');
    assert.equal(declaration(base, 'opacity'), '0');
    assert.equal(declaration(base, 'transition'), 'opacity var(--dur-toast-reduced) linear');
});

test('toast: the slide lives inside no-preference, enter on .is-shown, exit on the base', () => {
    const start = ruleFor('.toast', [NO_PREFERENCE]);
    const shown = ruleFor('.toast.is-shown', [NO_PREFERENCE]);
    assert.ok(start && shown, 'no-preference toast rules missing');
    assert.equal(declaration(start, 'transform'), 'translate(-50%, var(--s2))');
    assert.match(declaration(start, 'transition'), /var\(--dur-toast-out\) var\(--ease-in\)/);
    assert.equal(declaration(shown, 'transform'), 'translate(-50%, 0)');
    assert.match(declaration(shown, 'transition'), /var\(--dur-toast-in\) var\(--ease\)/);
});

test('every transition that moves transform sits inside no-preference', () => {
    const moving = rules.filter((rule) => /transition[^;]*transform/.test(rule.body));
    assert.ok(moving.length > 0);
    for (const rule of moving) {
        assert.ok(rule.ancestors.includes(NO_PREFERENCE), `${rule.selector} moves transform outside no-preference`);
    }
});

test('new row: background colour transition from --row-new to transparent', () => {
    const fresh = ruleFor('.entry-item.is-new');
    const settled = ruleFor('.entry-item.is-new.is-settled');
    assert.ok(fresh && settled, 'is-new rules missing');
    assert.equal(declaration(fresh, 'background-color'), 'var(--row-new)');
    assert.equal(
        declaration(fresh, 'transition'),
        'background-color var(--dur-new-fade) var(--ease) var(--dur-new-hold)',
    );
    assert.equal(declaration(settled, 'background-color'), 'transparent');
    const reduced = ruleFor('.entry-item.is-new', ['@media (prefers-reduced-motion: reduce)']);
    assert.equal(declaration(reduced, 'transition-duration'), 'var(--dur-new-fade-reduced)');
});

test('motion tokens are defined once, in the base :root', () => {
    assert.equal(token('--ease-in'), 'cubic-bezier(0.4, 0, 1, 1)');
    assert.equal(token('--dur-toast-in'), '200ms');
    assert.equal(token('--dur-toast-out'), '150ms');
    assert.equal(token('--dur-toast-reduced'), '120ms');
    assert.equal(token('--dur-collapse'), '200ms');
    assert.equal(token('--dur-new-hold'), '150ms');
    assert.equal(token('--dur-new-fade'), '900ms');
    assert.equal(token('--dur-new-fade-reduced'), '400ms');
    assert.equal(token('--row-new'), 'color-mix(in srgb, var(--accent) 22%, transparent)');
    assert.equal((css.match(/--row-new:/g) || []).length, 1);
    assert.equal((css.match(/^\s*:root\s*\{/gm) || []).length, 2);
});

test('JS constants match the CSS tokens', () => {
    assert.equal(`${COLLAPSE_MS}ms`, token('--dur-collapse'));
    assert.equal(EASE_OUT, token('--ease'));
});

/** A stand-in for a Web Animations Animation: only the event surface. */
function fakeAnimation() {
    const target = new EventTarget();
    let listeners = 0;
    return {
        addEventListener(type, fn) { listeners += 1; target.addEventListener(type, fn); },
        removeEventListener(type, fn) { listeners -= 1; target.removeEventListener(type, fn); },
        fire: (type) => target.dispatchEvent(new Event(type)),
        get listeners() { return listeners; },
    };
}

test('afterMotion resolves on finish and removes its listeners', async () => {
    const animation = fakeAnimation();
    const done = afterMotion(animation, 1000);
    animation.fire('finish');
    await done;
    assert.equal(animation.listeners, 0);
});

test('afterMotion resolves on cancel', async () => {
    const animation = fakeAnimation();
    const done = afterMotion(animation, 1000);
    animation.fire('cancel');
    await done;
});

test('afterMotion resolves after the fallback when no event arrives', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const animation = fakeAnimation();
        let resolved = false;
        const done = afterMotion(animation, 350).then(() => { resolved = true; });
        mock.timers.tick(349);
        await Promise.resolve();
        assert.equal(resolved, false);
        mock.timers.tick(1);
        await done;
        assert.equal(resolved, true);
        assert.equal(animation.listeners, 0);
    } finally {
        mock.timers.reset();
    }
});

test('afterMotion resolves once and stops its timer when finished', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const animation = fakeAnimation();
        let calls = 0;
        const done = afterMotion(animation, 350).then(() => { calls += 1; });
        animation.fire('finish');
        await done;
        mock.timers.tick(1000);
        await Promise.resolve();
        assert.equal(calls, 1);
    } finally {
        mock.timers.reset();
    }
});

const data = (expenses, incomes) => ({
    expenses: expenses.map((id) => ({ id })),
    incomes: incomes.map((id) => ({ id })),
});

test('findNewEntryId returns the one new expense or income id', () => {
    const before = entryIdSet(data(['e1'], ['i1']));
    assert.equal(findNewEntryId(before, data(['e1', 'e2'], ['i1'])), 'e2');
    assert.equal(findNewEntryId(before, data(['e1'], ['i1', 'i2'])), 'i2');
});

test('findNewEntryId returns null for no change, many new ids, or only deletions', () => {
    const before = entryIdSet(data(['e1', 'e2'], ['i1']));
    assert.equal(findNewEntryId(before, data(['e1', 'e2'], ['i1'])), null);
    assert.equal(findNewEntryId(before, data(['e1', 'e2', 'e3', 'e4'], ['i1'])), null);
    assert.equal(findNewEntryId(before, data(['e1', 'e2', 'e3'], ['i1', 'i2'])), null);
    assert.equal(findNewEntryId(before, data(['e1'], [])), null);
});

test('collapseKeyframes moves only grid rows, opacity, padding and border', () => {
    const frames = collapseKeyframes();
    assert.equal(frames.length, 1);
    assert.deepEqual(frames[0], {
        gridTemplateRows: '0fr',
        opacity: 0,
        paddingBlock: '0px',
        borderTopWidth: '0px',
    });
});
