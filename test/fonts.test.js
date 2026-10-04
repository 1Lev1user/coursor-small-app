import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const css = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('index.html');
const sw = read('sw.js');

const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];
const FAMILIES = [
    { name: 'Golos Text', slug: 'golos-text', weights: '400 900' },
    { name: 'Literata', slug: 'literata', weights: '200 900' },
];
const FIGURE_RULES = [
    '#screen-title',
    '.big-number',
    '.month-navigator .month-title',
    '.donut-value',
    '.home-title',
    '.home-figure-value',
    '.year-figure-value',
];
const TITLE_RULES = ['#screen-title', '.home-title', '.month-navigator .month-title'];

/** Flat leaf rules of the stylesheet: { selector, body }. */
function rules(source) {
    const found = [];
    const regex = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
        found.push({ selector: match[1].trim(), body: match[2] });
    }
    return found;
}

const allRules = rules(css);
const fontFaces = allRules.filter((rule) => rule.selector === '@font-face');
const figureRules = allRules.filter((rule) => /font-family:\s*var\(--font-figure\)/.test(rule.body));

test('no Onest or Unbounded left in css, html, service worker or fonts/', () => {
    assert.doesNotMatch(css, /onest|unbounded/i);
    assert.doesNotMatch(html, /onest|unbounded/i);
    assert.doesNotMatch(sw, /onest|unbounded/i);
    const old = readdirSync(join(root, 'fonts')).filter((name) => /^(onest|unbounded)|LICENSE-(onest|unbounded)/i.test(name));
    assert.deepEqual(old, []);
});

test('the settings rights text and the README name the new fonts', () => {
    for (const file of ['src/views/settings/rights.js', 'README.md']) {
        const text = read(file);
        assert.doesNotMatch(text, /onest|unbounded/i, file);
        assert.match(text, /Golos Text/, file);
        assert.match(text, /Literata/, file);
    }
});

for (const family of FAMILIES) {
    test(`${family.name}: four @font-face blocks, one per subset, files on disk`, () => {
        const blocks = fontFaces.filter((rule) => rule.body.includes(`font-family: '${family.name}'`));
        assert.equal(blocks.length, 4);
        const seen = [];
        for (const block of blocks) {
            assert.match(block.body, /font-style:\s*normal/);
            assert.match(block.body, /font-display:\s*swap/);
            assert.match(block.body, /unicode-range:\s*U\+/);
            assert.ok(block.body.includes(`font-weight: ${family.weights};`), `weight range ${family.weights}`);
            const src = block.body.match(/src:\s*url\(\.\/fonts\/([^)]+)\)\s*format\('woff2'\)/);
            assert.ok(src, 'src url with woff2 format');
            const subset = SUBSETS.find((name) => src[1] === `${family.slug}-${name}-wght-normal.woff2`);
            assert.ok(subset, `unexpected file name ${src[1]}`);
            seen.push(subset);
            const path = join(root, 'fonts', src[1]);
            assert.ok(existsSync(path), `${src[1]} exists`);
            assert.ok(statSync(path).size > 1000, `${src[1]} is larger than 1000 bytes`);
            assert.equal(readFileSync(path).subarray(0, 4).toString('latin1'), 'wOF2');
        }
        assert.deepEqual([...seen].sort(), [...SUBSETS].sort());
    });
}

test('font tokens name Golos Text for text and Literata for figures', () => {
    assert.match(css, /--font-body:\s*'Golos Text',/);
    assert.match(css, /--font-figure:\s*'Literata',/);
});

test('every figure rule has lining, tabular numerals and weight 600', () => {
    assert.deepEqual(figureRules.map((rule) => rule.selector).sort(), [...FIGURE_RULES].sort());
    for (const rule of figureRules) {
        assert.match(rule.body, /font-variant-numeric:\s*lining-nums tabular-nums;/, rule.selector);
        assert.match(rule.body, /font-weight:\s*600;/, rule.selector);
    }
});

test('title rules use no letter spacing', () => {
    for (const selector of TITLE_RULES) {
        const rule = figureRules.find((entry) => entry.selector === selector);
        assert.ok(rule, selector);
        assert.match(rule.body, /letter-spacing:\s*0;/, selector);
    }
});

test('the hero figure uses the new size range', () => {
    const rule = allRules.find((entry) => entry.selector === '.home-figure-value');
    assert.match(rule.body, /font-size:\s*clamp\(2\.5rem, 2rem \+ 2\.4vw, 3\.25rem\);/);
});

test('both licence files ship with the fonts', () => {
    for (const slug of ['golos-text', 'literata']) {
        const text = read(`fonts/LICENSE-${slug}.txt`);
        assert.match(text, /SIL OPEN FONT LICENSE/);
        assert.match(text, /Copyright/);
    }
});

test('index.html preloads exactly the two latin files, and they exist', () => {
    const hrefs = [...html.matchAll(/<link rel="preload" href="([^"]+)"[^>]*as="font"/g)].map((match) => match[1]);
    assert.deepEqual(hrefs, ['fonts/golos-text-latin-wght-normal.woff2', 'fonts/literata-latin-wght-normal.woff2']);
    for (const href of hrefs) assert.ok(existsSync(join(root, href)), href);
});

test('every woff2 in fonts/ is used by an @font-face rule', () => {
    const files = readdirSync(join(root, 'fonts')).filter((name) => name.endsWith('.woff2'));
    assert.equal(files.length, 8);
    for (const file of files) assert.ok(css.includes(`url(./fonts/${file})`), file);
});
