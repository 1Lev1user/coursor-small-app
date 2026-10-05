import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWithTransition, transitionKind } from '../src/motion.js';
import { addScreenTitle, openAddPanel } from '../src/views/add.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const appSource = readFileSync(join(root, 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)';
const KINDS = ['tab', 'month-next', 'month-prev', 'sheet-open', 'sheet-close'];

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
const token = (name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

/** A fake document whose startViewTransition runs `update` at once; finish()/fail() settle `finished`. */
function fakeDocument({ supported = true } = {}) {
    const doc = { documentElement: { dataset: {} }, calls: [], transitions: [] };
    if (supported) {
        doc.startViewTransition = (update) => {
            doc.calls.push({ kind: doc.documentElement.dataset.transition });
            update();
            let finish;
            let fail;
            const finished = new Promise((resolve, reject) => {
                finish = resolve;
                fail = reject;
            });
            doc.transitions.push({ finish, fail });
            return { finished };
        };
    }
    return doc;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('runWithTransition without startViewTransition: update once, synchronously, no attribute', () => {
    const doc = fakeDocument({ supported: false });
    let count = 0;
    assert.equal(runWithTransition('tab', () => count++, { doc, reduce: () => false }), false);
    assert.equal(count, 1);
    assert.equal(doc.documentElement.dataset.transition, undefined);
});

test('runWithTransition under Reduce Motion: update once, startViewTransition never called', () => {
    const doc = fakeDocument();
    let count = 0;
    runWithTransition('tab', () => count++, { doc, reduce: () => true });
    assert.equal(count, 1);
    assert.equal(doc.calls.length, 0);
    assert.equal(doc.documentElement.dataset.transition, undefined);
});

test('runWithTransition with kind null: plain update', () => {
    const doc = fakeDocument();
    let count = 0;
    runWithTransition(null, () => count++, { doc, reduce: () => false });
    assert.equal(count, 1);
    assert.equal(doc.calls.length, 0);
});

test('runWithTransition reads Reduce Motion on every call', () => {
    const doc = fakeDocument();
    let reduce = false;
    runWithTransition('tab', () => {}, { doc, reduce: () => reduce });
    reduce = true;
    runWithTransition('tab', () => {}, { doc, reduce: () => reduce });
    assert.equal(doc.calls.length, 1);
});

test('runWithTransition sets the kind before the browser call and clears it when finished', async () => {
    const doc = fakeDocument();
    let count = 0;
    assert.equal(runWithTransition('sheet-open', () => count++, { doc, reduce: () => false }), true);
    assert.equal(count, 1);
    assert.deepEqual(doc.calls, [{ kind: 'sheet-open' }]);
    assert.equal(doc.documentElement.dataset.transition, 'sheet-open');
    doc.transitions[0].finish();
    await settle();
    assert.equal(doc.documentElement.dataset.transition, undefined);
});

test('runWithTransition clears the kind when finished rejects, without an unhandled rejection', async () => {
    const doc = fakeDocument();
    runWithTransition('tab', () => {}, { doc, reduce: () => false });
    doc.transitions[0].fail(new Error('skipped'));
    await settle();
    assert.equal(doc.documentElement.dataset.transition, undefined);
});

test('runWithTransition: an older transition finishing does not clear the newer kind', async () => {
    const doc = fakeDocument();
    runWithTransition('tab', () => {}, { doc, reduce: () => false });
    runWithTransition('month-next', () => {}, { doc, reduce: () => false });
    doc.transitions[0].fail(new Error('skipped'));
    await settle();
    assert.equal(doc.documentElement.dataset.transition, 'month-next');
    doc.transitions[1].finish();
    await settle();
    assert.equal(doc.documentElement.dataset.transition, undefined);
});

test('runWithTransition: a throwing startViewTransition falls back to one plain update', () => {
    const doc = fakeDocument();
    doc.startViewTransition = () => {
        throw new Error('unsupported');
    };
    let count = 0;
    runWithTransition('tab', () => count++, { doc, reduce: () => false });
    assert.equal(count, 1);
    assert.equal(doc.documentElement.dataset.transition, undefined);
});

const screen = (tab, title = null, monthKey = '2026-05') => ({ tab, title, monthKey });

test('transitionKind: no previous screen is plain', () => {
    assert.equal(transitionKind(null, screen('add', 'Home')), null);
});

test('transitionKind: a tab change is tab, also when the month changed too', () => {
    assert.equal(transitionKind(screen('month'), screen('chart')), 'tab');
    assert.equal(transitionKind(screen('add', 'Home'), screen('more')), 'tab');
    assert.equal(transitionKind(screen('month', null, '2026-05'), screen('chart', null, '2026-06')), 'tab');
});

test('transitionKind: same screen is plain', () => {
    assert.equal(transitionKind(screen('month'), screen('month')), null);
    assert.equal(transitionKind(screen('add', 'Home'), screen('add', 'Home')), null);
    assert.equal(transitionKind(screen('more'), screen('more')), null);
});

test('transitionKind: month arrows slide in the direction of travel on Month and Chart', () => {
    for (const tab of ['month', 'chart']) {
        assert.equal(transitionKind(screen(tab, null, '2026-05'), screen(tab, null, '2026-06')), 'month-next');
        assert.equal(transitionKind(screen(tab, null, '2026-05'), screen(tab, null, '2026-04')), 'month-prev');
        assert.equal(transitionKind(screen(tab, null, '2025-12'), screen(tab, null, '2026-01')), 'month-next');
    }
});

test('transitionKind: setMonthKey on the Add tab (before goTo) does not slide', () => {
    assert.equal(transitionKind(screen('add', 'Home', '2026-05'), screen('add', 'Home', '2026-06')), null);
});

test('transitionKind: Home to a form opens the sheet', () => {
    assert.equal(transitionKind(screen('add', 'Home'), screen('add', 'Add expense')), 'sheet-open');
    assert.equal(transitionKind(screen('add', 'Home'), screen('add', 'Add income')), 'sheet-open');
});

test('transitionKind: a form to Home or to a saved screen closes the sheet', () => {
    for (const from of ['Add expense', 'Add income']) {
        for (const to of ['Home', 'Expense added', 'Income added', 'Refund added']) {
            assert.equal(transitionKind(screen('add', from), screen('add', to)), 'sheet-close', `${from} -> ${to}`);
        }
    }
});

test('transitionKind: saved screen to Home and a failed save re-opening the form are plain', () => {
    assert.equal(transitionKind(screen('add', 'Expense added'), screen('add', 'Home')), null);
    assert.equal(transitionKind(screen('add', 'Expense added'), screen('add', 'Add expense')), null);
    assert.equal(transitionKind(screen('add', 'Add expense'), screen('add', 'Add income')), null);
});

test('addScreenTitle still returns the strings transitionKind recognises', () => {
    const titles = {};
    for (const next of ['home', 'expense', 'income', 'added']) {
        openAddPanel(next);
        titles[next] = addScreenTitle();
    }
    openAddPanel('home');
    assert.equal(titles.home, 'Home');
    assert.equal(titles.expense, 'Add expense');
    assert.equal(titles.income, 'Add income');
    assert.match(titles.added, /^(Expense|Income|Refund) added$/);
    assert.equal(transitionKind(screen('add', titles.home), screen('add', titles.expense)), 'sheet-open');
    assert.equal(transitionKind(screen('add', titles.income), screen('add', titles.added)), 'sheet-close');
});

test('tab bar and app header are named so they stay still, inside no-preference', () => {
    for (const selector of ['.tabbar', '.app-header']) {
        const named = rules.filter(
            (rule) => rule.selector === selector && /view-transition-name:\s*[\w-]+;/.test(rule.body),
        );
        assert.equal(named.length, 1, `${selector} needs one view-transition-name`);
        assert.ok(named[0].ancestors.includes(NO_PREFERENCE), `${selector} name outside no-preference`);
    }
});

test('every view-transition rule sits inside no-preference, and the text appears nowhere else', () => {
    const involved = rules.filter(
        (rule) => rule.selector.includes('view-transition') || rule.body.includes('view-transition-name'),
    );
    assert.ok(involved.length > 0);
    for (const rule of involved) {
        assert.ok(rule.ancestors.includes(NO_PREFERENCE), `${rule.selector} outside no-preference`);
    }
    for (const rule of rules.filter((r) => !r.ancestors.includes(NO_PREFERENCE))) {
        assert.ok(!rule.selector.includes('view-transition') && !rule.body.includes('view-transition'), rule.selector);
    }
});

test('every kind has a data-transition rule', () => {
    for (const kind of KINDS) {
        assert.ok(
            rules.some((rule) => rule.selector.includes(`html[data-transition='${kind}']`)),
            `${kind} missing`,
        );
    }
});

test('the transition tokens are in the base :root', () => {
    const expected = {
        '--dur-tab-out': '120ms',
        '--dur-tab-in': '160ms',
        '--dur-month': '200ms',
        '--dur-sheet-open': '280ms',
        '--dur-sheet-close': '200ms',
        '--ease-sheet': 'cubic-bezier(0.32, 0.72, 0, 1)',
        '--shift-month': '12px',
        '--shift-sheet': '24px',
    };
    const base = rules.find((rule) => rule.selector === ':root');
    for (const [name, value] of Object.entries(expected)) {
        assert.equal(token(name), value, name);
        assert.ok(base.body.includes(`${name}:`), `${name} not in the base :root`);
    }
});

test('view-transition rules use tokens, no raw durations, offsets or curves', () => {
    const involved = rules.filter(
        (rule) => rule.selector.includes('view-transition') || rule.selector.includes('data-transition'),
    );
    const keyframes = rules.filter((rule) => rule.ancestors.some((entry) => entry.startsWith('@keyframes vt-')));
    for (const rule of [...involved, ...keyframes]) {
        assert.doesNotMatch(rule.body, /\d+ms|\d+px|cubic-bezier\(/, rule.selector);
    }
});

test('app.js: render() decides the kind and defers; goTo, setMonthKey and the tab handler are untouched', () => {
    const start = appSource.indexOf('function render()');
    const body = appSource.slice(start, appSource.indexOf('\nfunction ', start + 1));
    assert.match(body, /runWithTransition\(/);
    assert.match(body, /renderPending/);
    assert.match(body, /transitionKind\(/);
    assert.doesNotMatch(body, /scrollTo/);
    assert.match(appSource, /function renderNow\(\)/);
    const goTo = appSource.slice(appSource.indexOf('function goTo('), appSource.indexOf('function context('));
    assert.match(goTo, /\n {4}render\(\);\n\}\n*$/);
    assert.match(
        appSource,
        /tabbarElement\.addEventListener\('click'[\s\S]*?goTo\(button\.dataset\.tab\);/,
    );
});
