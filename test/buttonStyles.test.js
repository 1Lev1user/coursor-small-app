import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8');

/** Index of the closing brace that matches the opening brace at openIndex. */
function blockAfter(source, openIndex) {
    let depth = 1;
    let i = openIndex + 1;
    while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        i++;
    }
    return i - 1;
}

function parseHex(body) {
    const colors = {};
    const regex = /--([^:]+):\s*#([0-9A-Fa-f]{6})(?:[;}])/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
        colors[match[1]] = match[2].toUpperCase();
    }
    return colors;
}

function luminance(hex) {
    const channel = (start) => {
        const c = parseInt(hex.substr(start, 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function ratio(hex1, hex2) {
    const l1 = luminance(hex1);
    const l2 = luminance(hex2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Exactly two :root blocks: light, then dark inside prefers-color-scheme.
const rootBlocks = [...css.matchAll(/:root\s*\{/g)];
assert.equal(rootBlocks.length, 2, 'style.css must have exactly two :root blocks');
const body = (match) => css.slice(match.index + match[0].length, blockAfter(css, match.index + match[0].length - 1));
const light = parseHex(body(rootBlocks[0]));
const darkOnly = parseHex(body(rootBlocks[1]));
const dark = { ...light, ...darkOnly };

/** Top-level-or-nested rules: returns { selector, body, inside } for every `{` block. */
function walkRules(source) {
    const rules = [];
    const stack = [];
    let start = 0;
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '{') {
            const selector = source.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
            stack.push({ selector, open: i, inside: stack.map((s) => s.selector) });
            start = i + 1;
        } else if (source[i] === '}') {
            const rule = stack.pop();
            rules.push({ ...rule, body: source.slice(rule.open + 1, i) });
            start = i + 1;
        } else if (source[i] === ';') {
            start = i + 1;
        }
    }
    return rules;
}
const rules = walkRules(css);
const rulesFor = (selector) => rules.filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector));
const REDUCED = '@media (prefers-reduced-motion: no-preference)';

test('button tokens exist in light, and the --btn-* tokens in dark', () => {
    const tokens = [
        'btn-bg', 'btn-bg-hover', 'btn-bg-press', 'btn-ink',
        'btn-2', 'btn-2-ink', 'btn-2-press', 'btn-2-on-bg',
    ];
    for (const name of tokens) {
        assert.ok(light[name], `light --${name} missing`);
        assert.ok(darkOnly[name], `dark --${name} missing`);
    }
    assert.ok(light['danger-press'], 'light --danger-press missing');
    assert.ok(darkOnly['danger-press'], 'dark --danger-press missing');
    assert.match(css, /--dur-press:\s*90ms/);
    assert.match(css, /--dur-release:\s*160ms/);
});

for (const [name, colors] of [['light', light], ['dark', dark]]) {
    test(`${name}: primary label is readable on every primary fill`, () => {
        for (const fill of ['btn-bg', 'btn-bg-hover', 'btn-bg-press']) {
            const r = ratio(colors['btn-ink'], colors[fill]);
            assert.ok(r >= 4.5, `${name} btn-ink/${fill}: ${r.toFixed(2)}`);
        }
    });

    test(`${name}: secondary label is readable on every secondary fill`, () => {
        for (const fill of ['btn-2', 'btn-2-press', 'btn-2-on-bg']) {
            const r = ratio(colors['btn-2-ink'], colors[fill]);
            assert.ok(r >= 4.5, `${name} btn-2-ink/${fill}: ${r.toFixed(2)}`);
        }
    });

    test(`${name}: danger label is readable on the danger fill`, () => {
        const r = ratio(colors['accent-ink'], colors.danger);
        assert.ok(r >= 4.5, `${name} accent-ink/danger: ${r.toFixed(2)}`);
    });
}

test('danger pressed fill keeps its label readable', () => {
    assert.ok(ratio(light['btn-ink'], light['danger-press']) >= 4.5, 'light btn-ink/danger-press');
    assert.ok(ratio(dark['accent-ink'], dark['danger-press']) >= 4.5, 'dark accent-ink/danger-press');
});

test('dark primary fill is not the dark accent', () => {
    assert.notEqual(darkOnly['btn-bg'], darkOnly.accent);
});

test('press: scale only with motion allowed, colour change always', () => {
    const active = rulesFor('.btn:active');
    assert.ok(
        active.some((r) => r.inside.includes(REDUCED) && r.body.includes('scale(0.97)')),
        '.btn:active scale(0.97) must sit inside prefers-reduced-motion: no-preference',
    );
    assert.ok(
        active.some((r) => r.inside.length === 0 && r.body.includes('background')),
        '.btn:active background must sit outside any media query',
    );
    assert.ok(
        active.every((r) => r.inside.length === 0 || !r.body.includes('background')),
        'no background change inside a media query for .btn:active',
    );
});

test('no brightness() filter is left', () => {
    assert.ok(!css.includes('brightness('));
});

test('danger buttons have their own hover and press fill', () => {
    for (const selector of ['.btn-ghost-danger:active', '.btn-danger:hover', '.btn-danger:active']) {
        const found = rulesFor(selector);
        assert.ok(found.length > 0, `${selector} rule missing`);
        assert.ok(found.some((r) => /background\s*:/.test(r.body)), `${selector} must set background`);
    }
});

test('every button :hover sits inside the hover media query', () => {
    for (const r of rules) {
        if (/\.btn[\w-]*:hover/.test(r.selector)) {
            assert.ok(
                r.inside.some((s) => s.includes('hover: hover')),
                `${r.selector} is not inside @media (hover: hover)`,
            );
        }
    }
});

test('secondary: lighter tint on the page, the card tint inside a card', () => {
    const base = rulesFor('.btn').filter((r) => r.inside.length === 0);
    assert.ok(base.some((r) => /background:\s*var\(--btn-2-on-bg\)/.test(r.body)), 'base .btn must use --btn-2-on-bg');
    const inCard = rules.filter((r) => r.selector.startsWith('.card .btn'));
    assert.ok(inCard.length > 0, '.card .btn rule missing');
    assert.ok(inCard.some((r) => /background:\s*var\(--btn-2\)/.test(r.body)), '.card .btn must use --btn-2');
});

test('no selector relies on a .view container class', () => {
    assert.ok(!rules.some((r) => r.selector.includes('.view >')), 'the page container has no .view class');
});
