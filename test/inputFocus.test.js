import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldSelectOnFocus, selectOnFocus } from '../src/inputFocus.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('shouldSelectOnFocus is true for a filled decimal, numeric or number field', () => {
    assert.equal(shouldSelectOnFocus({ tagName: 'INPUT', inputMode: 'decimal', value: '12.50' }), true);
    assert.equal(shouldSelectOnFocus({ tagName: 'INPUT', inputMode: 'numeric', value: '15' }), true);
    assert.equal(shouldSelectOnFocus({ tagName: 'INPUT', type: 'number', value: '5' }), true);
});

test('shouldSelectOnFocus is false for everything else', () => {
    const base = { tagName: 'INPUT', inputMode: 'decimal', value: '12.50' };
    assert.equal(shouldSelectOnFocus({ ...base, value: '' }), false);
    assert.equal(shouldSelectOnFocus({ ...base, inputMode: 'text' }), false);
    assert.equal(shouldSelectOnFocus({ ...base, inputMode: '' }), false);
    assert.equal(shouldSelectOnFocus({ ...base, tagName: 'TEXTAREA' }), false);
    assert.equal(shouldSelectOnFocus({ ...base, readOnly: true }), false);
    assert.equal(shouldSelectOnFocus({ ...base, disabled: true }), false);
    assert.equal(shouldSelectOnFocus(null), false);
    assert.equal(shouldSelectOnFocus(undefined), false);
});

function withStubs(activeElement, run) {
    const oldRaf = globalThis.requestAnimationFrame;
    const oldDoc = globalThis.document;
    globalThis.requestAnimationFrame = (fn) => fn();
    globalThis.document = { activeElement };
    try {
        run();
    } finally {
        globalThis.requestAnimationFrame = oldRaf;
        globalThis.document = oldDoc;
    }
}

function fakeField(extra = {}) {
    const field = { tagName: 'INPUT', inputMode: 'decimal', value: '12.50', calls: 0, ...extra };
    field.select = () => { field.calls += 1; };
    return field;
}

test('selectOnFocus selects a filled number field that is still active', () => {
    const field = fakeField();
    withStubs(field, () => selectOnFocus({ target: field }));
    assert.equal(field.calls, 1);
});

test('selectOnFocus does nothing when another element is active', () => {
    const field = fakeField();
    withStubs({}, () => selectOnFocus({ target: field }));
    assert.equal(field.calls, 0);
});

test('selectOnFocus does nothing for an empty or non-number field', () => {
    const empty = fakeField({ value: '' });
    const note = fakeField({ inputMode: 'text' });
    withStubs(empty, () => selectOnFocus({ target: empty }));
    withStubs(note, () => selectOnFocus({ target: note }));
    assert.equal(empty.calls, 0);
    assert.equal(note.calls, 0);
});

test('style.css hides the hint on focus, after the muted placeholder rule', () => {
    const rule = /input:focus::placeholder,\s*textarea:focus::placeholder\s*\{[^}]*color:\s*transparent/;
    const match = rule.exec(css);
    assert.ok(match, 'focus placeholder rule is missing');
    const muted = css.indexOf('.field input::placeholder');
    assert.ok(muted >= 0);
    assert.ok(match.index > muted, 'focus rule must come after .field input::placeholder (same specificity)');
});
