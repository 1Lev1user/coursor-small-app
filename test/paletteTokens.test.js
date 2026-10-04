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

// Parse color tokens
const rootBlocks = [...css.matchAll(/:root\s*\{/g)];
assert.equal(rootBlocks.length, 2, 'style.css must have exactly two :root blocks');
const body = (match) => css.slice(match.index + match[0].length, blockAfter(css, match.index + match[0].length - 1));
const light = parseHex(body(rootBlocks[0]));
const darkOnly = parseHex(body(rootBlocks[1]));
const dark = { ...light, ...darkOnly };
const rules = walkRules(css);

// Test a: light --field-line vs --bg >= 3 and vs --surface >= 3
test('light: --field-line contrast >= 3 on --bg and --surface', () => {
    const fieldLineRatio = ratio(light['field-line'], light['bg']);
    assert.ok(fieldLineRatio >= 3, `light --field-line/--bg: ${fieldLineRatio.toFixed(2)} (need >= 3)`);
    const surfaceRatio = ratio(light['field-line'], light['surface']);
    assert.ok(surfaceRatio >= 3, `light --field-line/--surface: ${surfaceRatio.toFixed(2)} (need >= 3)`);
});

// Test b: per theme warn tokens exist and have proper contrast
for (const [name, colors] of [['light', light], ['dark', dark]]) {
    test(`${name}: warn-soft, warn-ink, warn-line exist`, () => {
        assert.ok(colors['warn-soft'], `${name} --warn-soft missing`);
        assert.ok(colors['warn-ink'], `${name} --warn-ink missing`);
        assert.ok(colors['warn-line'], `${name} --warn-line missing`);
    });

    test(`${name}: warn-ink on warn-soft >= 4.5 and text on warn-soft >= 4.5`, () => {
        const warnRatio = ratio(colors['warn-ink'], colors['warn-soft']);
        assert.ok(warnRatio >= 4.5, `${name} --warn-ink/--warn-soft: ${warnRatio.toFixed(2)}`);
        const textRatio = ratio(colors['text'], colors['warn-soft']);
        assert.ok(textRatio >= 4.5, `${name} --text/--warn-soft: ${textRatio.toFixed(2)}`);
    });
}

// Test c: dark --block equals 25604A
test('dark: --block equals #25604A', () => {
    assert.equal(dark['block'], '25604A', `dark --block is ${dark['block']}, expected 25604A`);
});

// Test d: .home-backup rules contain warn tokens and no danger tokens
test('.home-backup rules use warn tokens and not danger tokens', () => {
    const backupRules = rules.filter((r) => r.selector.includes('.home-backup'));
    assert.ok(backupRules.length > 0, '.home-backup rules found');

    const combinedBody = backupRules.map((r) => r.body).join(' ');
    assert.ok(combinedBody.includes('--warn-soft') || combinedBody.includes('--warn-ink') || combinedBody.includes('--warn-line'),
        '.home-backup rules must contain at least one warn token');
    assert.ok(!combinedBody.includes('--danger'), '.home-backup rules must not contain --danger tokens');
    assert.ok(backupRules.some((r) => r.selector.includes('.is-strong')), 'at least one .home-backup selector must have .is-strong');
});

// Test e: guard - .home-figure.is-over still has danger colors
test('.home-figure.is-over guard: still contains danger colors', () => {
    const overRules = rules.filter((r) => r.selector.includes('.home-figure.is-over'));
    assert.ok(overRules.length > 0, '.home-figure.is-over rules found');

    const combinedBody = overRules.map((r) => r.body).join(' ');
    assert.ok(combinedBody.includes('--danger-soft'), '.home-figure.is-over must contain var(--danger-soft)');
    assert.ok(combinedBody.includes('--danger'), '.home-figure.is-over must contain var(--danger)');
});
