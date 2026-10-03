import test from 'node:test';
import assert from 'node:assert/strict';
import { state, closeTransientUi } from '../src/views/settings/shared.js';

test('state declares the pre-update restore confirm flag, closed by default', () => {
    assert.equal(Object.hasOwn(state, 'confirmRestorePreUpdate'), true);
    assert.strictEqual(state.confirmRestorePreUpdate, false);
});

test('closeTransientUi closes the restore, delete and rescue confirms together', () => {
    state.confirmRestorePreUpdate = true;
    state.confirmDeletePreUpdate = true;
    state.confirmDeleteRescue = true;
    closeTransientUi();
    assert.strictEqual(state.confirmRestorePreUpdate, false);
    assert.strictEqual(state.confirmDeletePreUpdate, false);
    assert.strictEqual(state.confirmDeleteRescue, false);
});
