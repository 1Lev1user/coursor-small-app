import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeField } from '../src/csv.js';

test('a value containing \\r is quoted', () => {
    assert.equal(escapeField('line1\rline2', ','), '"line1\rline2"');
});

test('a value containing the comma delimiter is quoted', () => {
    assert.equal(escapeField('milk, bread', ','), '"milk, bread"');
});

test('a value containing the semicolon delimiter is quoted', () => {
    assert.equal(escapeField('a;b', ';'), '"a;b"');
});

test('a value with no special characters is returned unchanged', () => {
    assert.equal(escapeField('hello', ','), 'hello');
});

test('a value with leading and trailing spaces and no special characters is returned unchanged', () => {
    assert.equal(escapeField('  hello  ', ','), '  hello  ');
});
