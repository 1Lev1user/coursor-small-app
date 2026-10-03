import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8');

/**
 * Find the closing brace for an opening brace at openIndex.
 * Counts nested braces to handle nested blocks.
 */
function blockAfter(source, openIndex) {
    let depth = 1;
    let i = openIndex + 1;
    while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        i++;
    }
    return i - 1; // Return the index of the closing brace
}

/**
 * Parse CSS variable declarations from a block.
 * Extracts --name: #RRGGBB; pairs (case-insensitive hex, 6-digit only).
 * Skips --cat-* variables per decision R17.
 */
function parseHex(body) {
    const colors = {};
    const regex = /--([^:]+):\s*#([0-9A-Fa-f]{6})(?:[;}])/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
        const name = match[1];
        // Skip --cat-* color categories per decision R17
        if (!name.startsWith('cat-')) {
            colors[name] = match[2].toUpperCase();
        }
    }
    return colors;
}

/**
 * Calculate relative luminance (sRGB).
 * Formula: (0.03928 / 12.92 for dark, 1.055^2.4 for light components)
 * Weights: 0.2126 (R), 0.7152 (G), 0.0722 (B)
 */
function luminance(hex) {
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio: (max + 0.05) / (min + 0.05)
 */
function ratio(hex1, hex2) {
    const l1 = luminance(hex1);
    const l2 = luminance(hex2);
    const max = Math.max(l1, l2);
    const min = Math.min(l1, l2);
    return (max + 0.05) / (min + 0.05);
}

// Extract light theme: :root block (first one)
const lightRootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
assert.ok(lightRootMatch, ':root block not found');
const lightColors = parseHex(lightRootMatch[1]);

// Extract dark theme: :root inside @media (prefers-color-scheme: dark)
assert.ok(css.includes('prefers-color-scheme: dark'), 'prefers-color-scheme: dark not found in style.css');
const darkMediaMatch = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\}(?=\s*(@|\/\*|$))/);
assert.ok(darkMediaMatch, '@media (prefers-color-scheme: dark) block not found');
const darkRootMatch = darkMediaMatch[1].match(/:root\s*\{([\s\S]*?)\}/);
assert.ok(darkRootMatch, ':root block not found inside dark media query');
const darkColors = parseHex(darkRootMatch[1]);

// Merge dark overrides onto light
const mergedDark = { ...lightColors, ...darkColors };

test('luminance helper sanity', () => {
    // #000000 (black) should have luminance near 0
    const blackLum = luminance('000000');
    assert.ok(blackLum < 0.01, `black luminance ${blackLum} should be near 0`);

    // #FFFFFF (white) should have luminance 1
    const whiteLum = luminance('FFFFFF');
    assert.ok(whiteLum > 0.99, `white luminance ${whiteLum} should be near 1`);

    // #777777 (mid-gray) should be around 0.18-0.19
    const grayLum = luminance('777777');
    assert.ok(grayLum > 0.18 && grayLum < 0.19, `gray luminance ${grayLum} should be around 0.18`);
});

test('ratio helper sanity', () => {
    // Black vs white should be 21:1
    const bwRatio = ratio('000000', 'FFFFFF');
    assert.ok(Math.abs(bwRatio - 21) < 0.1, `black vs white ratio ${bwRatio} should be ~21`);

    // Same color should be 1:1
    const sameRatio = ratio('777777', '777777');
    assert.ok(Math.abs(sameRatio - 1) < 0.01, `same color ratio ${sameRatio} should be ~1`);

    // #777777 vs white should be around 4.48
    const grayWhiteRatio = ratio('777777', 'FFFFFF');
    assert.ok(Math.abs(grayWhiteRatio - 4.48) < 0.2, `gray vs white ratio ${grayWhiteRatio} should be ~4.48`);
});

test('parser reads light theme', () => {
    assert.ok(lightColors.bg, 'bg not found in light colors');
    assert.ok(lightColors.text, 'text not found in light colors');
    assert.ok(lightColors.surface, 'surface not found in light colors');
    assert.ok(lightColors['text'], 'text not found');
    assert.ok(!lightColors['cat-1'], 'cat-1 should be skipped per R17');
});

test('parser reads dark theme and overrides light', () => {
    assert.ok(darkColors.bg, 'bg not found in dark colors');
    assert.ok(darkColors.text, 'text not found in dark colors');
    assert.ok(mergedDark.bg, 'bg not found in merged dark');
    assert.ok(darkColors.bg !== lightColors.bg, 'dark bg should differ from light');
    assert.ok(!darkColors['cat-1'], 'cat-1 should be skipped per R17');
});

test('light theme meets WCAG AA', (t) => {
    const pairs = [
        ['text', 'bg', 4.5],
        ['text', 'surface', 4.5],
        ['text', 'surface-2', 4.5],
        ['muted', 'bg', 4.5],
        ['muted', 'surface', 4.5],
        ['muted', 'surface-2', 4.5],
        ['accent', 'surface', 4.5],
        ['accent', 'bg', 4.5],
        ['accent-ink', 'accent', 4.5],
        ['block-ink', 'block', 4.5],
        ['block-soft', 'block', 4.5],
        ['danger', 'surface', 4.5],
        ['danger', 'danger-soft', 4.5],
        ['savings-ink', 'surface', 4.5],
        ['bg', 'text', 4.5], // toast: background: text, color: bg
        ['field-line', 'surface', 3],
        ['accent', 'track', 3],
    ];

    const failures = [];
    for (const [color1, color2, minRatio] of pairs) {
        if (!lightColors[color1] || !lightColors[color2]) {
            failures.push(`Missing color: ${color1} or ${color2}`);
            continue;
        }
        const r = ratio(lightColors[color1], lightColors[color2]);
        if (r < minRatio) {
            failures.push(`Light ${color1}/${color2}: ${r.toFixed(2)} < ${minRatio}`);
        }
        t.diagnostic(`light ${color1}/${color2}: ${r.toFixed(2)}`);
    }
    assert.deepEqual(failures, []);
});

test('dark theme meets WCAG AA', (t) => {
    const pairs = [
        ['text', 'bg', 4.5],
        ['text', 'surface', 4.5],
        ['text', 'surface-2', 4.5],
        ['muted', 'bg', 4.5],
        ['muted', 'surface', 4.5],
        ['muted', 'surface-2', 4.5],
        ['accent', 'surface', 4.5],
        ['accent', 'bg', 4.5],
        ['accent-ink', 'accent', 4.5],
        ['block-ink', 'block', 4.5],
        ['block-soft', 'block', 4.5],
        ['danger', 'surface', 4.5],
        ['danger', 'danger-soft', 4.5],
        ['savings-ink', 'surface', 4.5],
        ['bg', 'text', 4.5], // toast: background: text, color: bg
        ['field-line', 'surface', 3],
        ['accent', 'track', 3],
    ];

    const failures = [];
    for (const [color1, color2, minRatio] of pairs) {
        if (!mergedDark[color1] || !mergedDark[color2]) {
            failures.push(`Missing color in dark: ${color1} or ${color2}`);
            continue;
        }
        const r = ratio(mergedDark[color1], mergedDark[color2]);
        if (r < minRatio) {
            failures.push(`Dark ${color1}/${color2}: ${r.toFixed(2)} < ${minRatio}`);
        }
        t.diagnostic(`dark ${color1}/${color2}: ${r.toFixed(2)}`);
    }
    assert.deepEqual(failures, []);
});
