import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const more = readFileSync(join(root, 'src/views/more.js'), 'utf8');

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
const settingsRules = rules.filter((rule) => /\.settings-/.test(rule.selector));

test('style.css has the Settings group rules', () => {
    for (const selector of [
        '.settings-groups',
        '.settings-row',
        '.settings-row-summary',
        '.settings-row-summary.is-warning',
        '.settings-row-chevron',
        '.settings-group-body',
    ]) {
        assert.ok(rulesFor(selector).length > 0, `${selector} rule missing`);
    }
});

test('the chevron turns 90 degrees when the row is expanded', () => {
    const open = rules.filter((rule) =>
        rule.selector.includes('[aria-expanded="true"]') && rule.selector.includes('.settings-row-chevron'));
    assert.ok(open.length > 0, 'no expanded chevron rule');
    assert.ok(open.some((rule) => rule.body.includes('rotate(')));
});

test('the .settings-* rules use tokens only, no raw colours and no :hover', () => {
    assert.ok(settingsRules.length >= 6);
    for (const rule of settingsRules) {
        assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(rule.body), `${rule.selector} has a raw colour`);
        assert.ok(!rule.selector.includes(':hover'), `${rule.selector} uses :hover`);
    }
});

test('the warning summary uses the danger token and weight 600', () => {
    const warning = rulesFor('.settings-row-summary.is-warning');
    assert.ok(warning.some((rule) => rule.body.includes('var(--danger)') && /font-weight:\s*600/.test(rule.body)));
});

test('the jump list and the dead extra-income form are gone', () => {
    for (const [name, source] of [['style.css', css], ['more.js', more]]) {
        assert.ok(!source.includes('more-jump'), `${name} still has more-jump`);
        assert.ok(!source.includes('add-extra-income-form'), `${name} still has add-extra-income-form`);
    }
    assert.ok(!more.includes('renderWarnings'));
});

test('the scroll-margin-top list includes the profile section and the group wrapper', () => {
    const list = rules.filter((rule) =>
        rule.body.includes('scroll-margin-top') && rule.selector.split(',').some((part) => part.trim() === '#more-plan'));
    assert.equal(list.length, 1);
    const parts = list[0].selector.split(',').map((part) => part.trim());
    assert.ok(parts.includes('#more-profile'));
    assert.ok(parts.includes('.settings-group'));
});

test('more.js builds accessible, collapsing group rows', () => {
    for (const text of [
        'aria-expanded',
        'aria-controls',
        "'region'",
        'closeTransientUi',
        'aria-labelledby',
        'settings-row-',
        'settings-group-',
    ]) {
        assert.ok(more.includes(text), `more.js must contain ${text}`);
    }
});
