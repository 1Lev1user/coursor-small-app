import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { escapeAction, openAddPanel, takeFocusRequest } from '../src/views/add.js';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

// Module state persists across tests, so every test starts from a clean Home panel.
function fresh() {
    openAddPanel('home');
    takeFocusRequest();
}

test('Home never asks for focus', () => {
    fresh();
    openAddPanel('home');
    assert.equal(takeFocusRequest(), false);
});

test('opening the expense form asks for focus once', () => {
    fresh();
    openAddPanel('expense');
    assert.equal(takeFocusRequest(), true);
    assert.equal(takeFocusRequest(), false);
});

test('opening the expense form again while on it asks for nothing', () => {
    fresh();
    openAddPanel('expense');
    takeFocusRequest();
    openAddPanel('expense');
    assert.equal(takeFocusRequest(), false);
});

test('opening the income form from Home asks for focus', () => {
    fresh();
    openAddPanel('income');
    assert.equal(takeFocusRequest(), true);
});

test('switching from the expense form to the income form asks for focus', () => {
    fresh();
    openAddPanel('expense');
    takeFocusRequest();
    openAddPanel('income');
    assert.equal(takeFocusRequest(), true);
});

test('the added confirmation and Home ask for nothing', () => {
    fresh();
    openAddPanel('added');
    assert.equal(takeFocusRequest(), false);
    openAddPanel('home');
    assert.equal(takeFocusRequest(), false);
});

test('a failed save (added -> form) does not ask for focus or scroll', () => {
    fresh();
    openAddPanel('expense');
    takeFocusRequest();
    openAddPanel('added');
    openAddPanel('expense');
    assert.equal(takeFocusRequest(), false);

    openAddPanel('income');
    takeFocusRequest();
    openAddPanel('added');
    openAddPanel('income');
    assert.equal(takeFocusRequest(), false);
});

test('an untaken request is cleared by a following Home or added call', () => {
    fresh();
    openAddPanel('expense');
    openAddPanel('home');
    assert.equal(takeFocusRequest(), false);

    openAddPanel('expense');
    openAddPanel('added');
    assert.equal(takeFocusRequest(), false);
});

test('escapeAction: Escape goes Home, or closes an open quick panel', () => {
    assert.equal(escapeAction({ key: 'Escape' }, false), 'home');
    assert.equal(escapeAction({ key: 'Escape' }, true), 'close-panel');
});

test('escapeAction ignores other keys, handled events and IME composition', () => {
    assert.equal(escapeAction({ key: 'a' }, false), null);
    assert.equal(escapeAction({ key: 'Escape', defaultPrevented: true }, false), null);
    assert.equal(escapeAction({ key: 'Escape', isComposing: true }, true), null);
});

test('the date picker button has a visible focus ring from tokens', () => {
    const rule = css.match(
        /\.field input\[type='date'\]::-webkit-calendar-picker-indicator:focus-visible\s*\{([^}]*)\}/,
    );
    assert.notEqual(rule, null);
    assert.match(rule[1], /outline:\s*3px solid var\(--focus\)/);
    assert.doesNotMatch(rule[1], /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
});

test('goTo scrolls to the top only when the tab changed, before render', () => {
    const body = appSource.slice(appSource.indexOf('function goTo('), appSource.indexOf('function context('));
    assert.match(body, /const changed = tab !== app\.tab;/);
    const tabSet = body.indexOf('app.tab = tab');
    const scroll = body.indexOf('window.scrollTo(0, 0)');
    const draw = body.lastIndexOf('render()');
    assert.ok(tabSet !== -1 && scroll > tabSet && draw > scroll);
    assert.match(body, /if \(changed\) \{\s*window\.scrollTo\(0, 0\);/);
});

test('render and setMonthKey do not scroll (saves and month changes keep position)', () => {
    const renderStart = appSource.indexOf('function render()');
    assert.notEqual(renderStart, -1);
    const renderBody = appSource.slice(renderStart, appSource.indexOf('\nfunction ', renderStart + 1));
    assert.doesNotMatch(renderBody, /scrollTo/);
    const monthStart = appSource.indexOf('function setMonthKey(');
    assert.notEqual(monthStart, -1);
    const monthBody = appSource.slice(monthStart, appSource.indexOf('function goTo('));
    assert.doesNotMatch(monthBody, /scrollTo/);
});
