// planSync tests for scripts/board-sync.mjs. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSync, makeClient, FILES, FIELD_SPECS, STATUS_OPTIONS } from '../scripts/board-sync.mjs';

const real = Object.fromEntries(FILES.map((f) => [f, JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))]));
const clone = () => structuredClone(real);
const card = (files, id) => files['feature_list.json'].cards.find((c) => c.id === id);

// Fixture with fixed card statuses, independent of the current board state.
function base() {
  const f = clone();
  const status = { 'C-001': 'ready', 'C-002': 'backlog', 'C-003': 'ready' };
  for (const c of f['feature_list.json'].cards) c.status = status[c.id] ?? 'backlog';
  return f;
}

let n = 0;
const opts = (names) => names.map((name) => ({ id: `opt${n++}`, name }));
function fullFields() {
  return [
    { id: 'F_status', name: 'Status', dataType: 'SINGLE_SELECT', options: opts(STATUS_OPTIONS) },
    ...FIELD_SPECS.map((s) => ({ id: `F_${s.name}`, name: s.name, dataType: s.type, options: s.options ? opts(s.options) : [] })),
  ];
}

// Board that already holds every item of the given files.
function boardFrom(files) {
  const titles = [
    ...files['feature_list.json'].cards.map((c) => `${c.id} ${c.title}`),
    ...files['PROJECT_MAP.json'].items.map((i) => `${i.id} ${i.title}`),
    ...files['RELEASE_PLAN.json'].items.map((i) => `${i.id} ${i.title}`),
  ];
  return titles.map((title, i) => ({ id: `ITEM_${i}`, title, isDraft: true, contentId: `DI_${i}` }));
}

const val = (action, field) => action.values.find((v) => v.field === field)?.value;
const kindOf = (a) => val(a, 'Kind');

test('all mode on an empty board creates every work, map and plan item with mapped Status', () => {
  const files = base();
  const statusOnly = [{ id: 'F_status', name: 'Status', dataType: 'SINGLE_SELECT', options: opts(STATUS_OPTIONS) }];
  const r = planSync({ newFiles: files, boardItems: [], fields: statusOnly, mode: 'all' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.actions.filter((a) => a.type === 'createField').length, FIELD_SPECS.length);
  const made = r.actions.filter((a) => a.type === 'createItem');
  const work = made.filter((a) => kindOf(a) === 'Work');
  const map = made.filter((a) => kindOf(a) === 'Map');
  const plan = made.filter((a) => kindOf(a) === 'Plan');
  // 3 + 19 + 38 today; tied to the files so new cards do not break the test.
  assert.equal(work.length, files['feature_list.json'].cards.length);
  assert.equal(map.length, files['PROJECT_MAP.json'].items.length);
  assert.equal(plan.length, files['RELEASE_PLAN.json'].items.length);
  assert.equal(made.length, work.length + map.length + plan.length);
  assert.equal(r.summary.created, made.length);
  assert.equal(val(work.find((a) => a.key === 'C-001'), 'Status'), 'Ready');
  assert.equal(val(work.find((a) => a.key === 'C-002'), 'Status'), 'Backlog');
  assert.equal(work.find((a) => a.key === 'C-001').title, `C-001 ${card(files, 'C-001').title}`);
  for (const a of map) assert.equal(val(a, 'Status'), 'Done');
  for (const a of plan) {
    const src = files['RELEASE_PLAN.json'].items.find((i) => i.id === a.key);
    assert.equal(val(a, 'Status'), src.board_status);
    assert.equal(val(a, 'Release'), src.release);
    assert.ok(val(a, 'Progress').length <= 200);
  }
});

test('all mode without --force leaves existing items alone', () => {
  const files = base();
  const r = planSync({ newFiles: files, boardItems: boardFrom(files), fields: fullFields(), mode: 'all' });
  assert.equal(r.actions.length, 0);
  assert.equal(r.summary.skipped, boardFrom(files).length);
});

test('diff mode: only C-001 changed ready -> review, only C-001 is updated', () => {
  const oldFiles = base();
  const newFiles = base();
  card(newFiles, 'C-001').status = 'review';
  const r = planSync({ oldFiles, newFiles, boardItems: boardFrom(newFiles), fields: fullFields(), mode: 'diff' });
  assert.equal(r.actions.length, 1);
  const [a] = r.actions;
  assert.equal(a.type, 'updateItem');
  assert.equal(a.key, 'C-001');
  assert.equal(a.itemId, 'ITEM_0');
  assert.deepEqual(a.values, [{ field: 'Status', value: 'In review' }]);
  assert.equal(r.summary.updated, 1);
  assert.equal(r.summary.created, 0);
});

test('owner moved C-002 by hand (board differs, file unchanged): no action for C-002', () => {
  const files = base();
  const board = boardFrom(files).map((b) => (b.title.startsWith('C-002 ') ? { ...b, status: 'In progress' } : b));
  const r = planSync({ oldFiles: base(), newFiles: base(), boardItems: board, fields: fullFields(), mode: 'diff' });
  assert.equal(r.actions.length, 0);
  assert.ok(!r.actions.some((a) => a.key === 'C-002'));
});

test('blocked card sets Blocked=yes and keeps Status; unblocking clears Blocked', () => {
  const oldFiles = base();
  const newFiles = base();
  card(newFiles, 'C-003').status = 'blocked';
  const r = planSync({ oldFiles, newFiles, boardItems: boardFrom(newFiles), fields: fullFields(), mode: 'diff' });
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].key, 'C-003');
  assert.deepEqual(r.actions[0].values, [{ field: 'Blocked', value: 'yes' }]);

  const back = base();
  card(back, 'C-003').status = 'in_progress';
  const r2 = planSync({ oldFiles: newFiles, newFiles: back, boardItems: boardFrom(back), fields: fullFields(), mode: 'diff' });
  assert.deepEqual(r2.actions[0].values, [{ field: 'Status', value: 'In progress' }, { field: 'Blocked', value: null }]);

  // A new blocked card goes to Backlog with Blocked=yes.
  const fresh = planSync({ newFiles, boardItems: [], fields: fullFields(), mode: 'all' });
  const c3 = fresh.actions.find((a) => a.key === 'C-003');
  assert.equal(val(c3, 'Status'), 'Backlog');
  assert.equal(val(c3, 'Blocked'), 'yes');
});

test('new card added in the push is created, nothing else touched', () => {
  const oldFiles = base();
  const newFiles = base();
  newFiles['feature_list.json'].cards.push({
    ...structuredClone(card(newFiles, 'C-003')), id: 'C-099', title: 'New card', status: 'backlog', depends_on: ['C-001'],
  });
  const r = planSync({ oldFiles, newFiles, boardItems: boardFrom(oldFiles), fields: fullFields(), mode: 'diff' });
  assert.equal(r.actions.length, 1);
  const [a] = r.actions;
  assert.equal(a.type, 'createItem');
  assert.equal(a.title, 'C-099 New card');
  assert.equal(val(a, 'Kind'), 'Work');
  assert.equal(val(a, 'Status'), 'Backlog');
  assert.equal(val(a, 'Depends on'), 'C-001');
});

test('Kind without option Plan: warning, plan items skipped, others created', () => {
  const files = base();
  const fields = fullFields().map((f) => (f.name === 'Kind' ? { ...f, options: opts(['Map', 'Work']) } : f));
  const r = planSync({ newFiles: files, boardItems: [], fields, mode: 'all' });
  assert.deepEqual(r.errors, []);
  assert.ok(!r.actions.some((a) => a.type === 'createItem' && kindOf(a) === 'Plan'));
  assert.ok(r.actions.some((a) => kindOf(a) === 'Work'));
  assert.ok(r.actions.some((a) => kindOf(a) === 'Map'));
  assert.ok(r.warnings.some((w) => w.includes('Field "Kind" lacks option "Plan"')));
  assert.equal(r.summary.skipped, files['RELEASE_PLAN.json'].items.length);
});

test('Status missing an option is an error and plans nothing', () => {
  const fields = fullFields().map((f) => (f.name === 'Status' ? { ...f, options: opts(['Backlog', 'Ready', 'Done']) } : f));
  const r = planSync({ newFiles: base(), boardItems: [], fields, mode: 'all' });
  assert.equal(r.actions.length, 0);
  assert.match(r.errors[0], /In progress, In review/);
});

test('Status with "Approved" instead of "Ready": ready card maps to Approved', () => {
  const approved = STATUS_OPTIONS.map((o) => (o === 'Ready' ? 'Approved' : o));
  const fields = fullFields().map((f) => (f.name === 'Status' ? { ...f, options: opts(approved) } : f));
  const files = base();
  const r = planSync({ newFiles: files, boardItems: [], fields, mode: 'all' });
  assert.deepEqual(r.errors, []);
  assert.equal(val(r.actions.find((a) => a.key === 'C-001'), 'Status'), 'Approved');
  assert.equal(val(r.actions.find((a) => a.key === 'C-002'), 'Status'), 'Backlog');
  assert.ok(!r.warnings.some((w) => /lacks option/.test(w)));

  const oldFiles = base();
  const newFiles = base();
  card(newFiles, 'C-002').status = 'ready';
  const d = planSync({ oldFiles, newFiles, boardItems: boardFrom(newFiles), fields, mode: 'diff' });
  assert.deepEqual(d.actions.map((a) => a.key), ['C-002']);
  assert.deepEqual(d.actions[0].values, [{ field: 'Status', value: 'Approved' }]);
});

test('Status with neither Approved nor Ready is an error', () => {
  const fields = fullFields().map((f) => (f.name === 'Status' ? { ...f, options: opts(['Backlog', 'In progress', 'In review', 'Done']) } : f));
  const r = planSync({ newFiles: base(), boardItems: [], fields, mode: 'all' });
  assert.equal(r.actions.length, 0);
  assert.match(r.errors[0], /Approved \(or Ready\)/);
});

test('items whose title prefix is not ours are never touched', () => {
  const files = base();
  const board = [...boardFrom(files), { id: 'X', title: 'Buy milk', isDraft: true }, { id: 'Y', title: 'C-999 Someone else', isDraft: true }];
  const r = planSync({ newFiles: files, boardItems: board, fields: fullFields(), mode: 'all-force' });
  assert.ok(!r.actions.some((a) => a.itemId === 'X' || a.itemId === 'Y'));
  assert.equal(r.summary.updated, boardFrom(files).length);
});

test('a rejected token gives a clear error without the token', async () => {
  const secret = 'ghp_secretvalue123';
  const gql = makeClient(secret, { fetchFn: async () => new Response('{"message":"Bad credentials"}', { status: 401 }) });
  await assert.rejects(gql('query { viewer { login } }'), (e) => /401/.test(e.message) && !e.message.includes(secret));
});
