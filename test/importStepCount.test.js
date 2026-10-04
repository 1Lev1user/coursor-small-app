import test from 'node:test';
import assert from 'node:assert/strict';
import { stepCountText } from '../src/views/import.js';

test('the Load step says "Step 1" while the file format is not known', () => {
    assert.equal(stepCountText(0, 4, false), 'Step 1');
});

test('once the format is known the text counts steps of the whole list', () => {
    assert.equal(stepCountText(0, 5, true), 'Step 1 of 5');
    assert.equal(stepCountText(1, 5, true), 'Step 2 of 5');
});

test('a camt file has four steps', () => {
    assert.equal(stepCountText(2, 4, true), 'Step 3 of 4');
});
