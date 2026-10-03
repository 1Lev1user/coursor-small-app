// planSync tests for scripts/board-sync.mjs. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planSync, makeClient, FILES, FIELD_SPECS, STATUS_OPTIONS } from '../scripts/board-sync.mjs';
import { readCards } from '../scripts/cards.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const real = {
  cards: readCards(ROOT),
  ...Object.fromEntries(FILES.map((f) => [f, JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))])),
};
const base = () => structuredClone(real);
const card = (files, id) => files.cards.find((c) => c.id === id);

let n = 0;
const opts = (names) => names.map((name) => ({ id: `opt${n++}`, name }));
function fullFields(status = STATUS_OPTIONS) {
  return [
    { id: 'F_status', name: 'Status', dataType: 'SINGLE_SELECT', options: opts(status) },
    ...FIELD_SPECS.map((s) => ({ id: `F_${s.name}`, name: s.name, dataType: s.type, options: s.options ? opts(s.options) : [] })),
  ];
}

// Board that already holds every item of the given files.
function boardFrom(files) {
  const titles = [
    ...files.cards.map((c) => `${c.id} ${c.title}`),
    ...files['PROJECT_MAP.json'].items.map((i) => `${i.id} ${i.title}`),
    ...files['RELEASE_PLAN.json'].items.map((i) => `${i.id} ${i.title}`),
  ];
  return titles.map((title, i) => ({ id: `ITEM_${i}`, title, isDraft: true, contentId: `DI_${i}` }));
}

const val = (action, field) => action.values.find((v) => v.field === field)?.value;
const kindOf = (a) => val(a, 'Kind');

test('all mode on an empty board creates every work, map and plan item; new work cards start in Backlog', () => {
  const files = base();
  const statusOnly = [{ id: 'F_status', name: 'Status', dataType: 'SINGLE_SELECT', options: opts(STATUS_OPTIONS) }];
  const r = planSync({ newFiles: files, boardItems: [], fields: statusOnly, mode: 'all' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.actions.filter((a) => a.type === 'createField').length, FIELD_SPECS.length);
  const made = r.actions.filter((a) => a.type === 'createItem');
  const work = made.filter((a) => kindOf(a) === 'Work');
  const map = made.filter((a) => kindOf(a) === 'Map');
  const plan = made.filter((a) => kindOf(a) === 'Plan');
  assert.equal(work.length, files.cards.length);
  assert.equal(map.length, files['PROJECT_MAP.json'].items.length);
  assert.equal(plan.length, files['RELEASE_PLAN.json'].items.length);
  assert.equal(r.summary.created, made.length);
  for (const a of work) assert.equal(val(a, 'Status'), 'Backlog');
  const c1 = work.find((a) => a.key === 'C-001');
  assert.equal(c1.title, `C-001 ${card(files, 'C-001').title}`);
  assert.match(c1.body, /## Acceptance/);
  assert.match(c1.body, /Source: cards\/C-001\.md/);
  for (const a of map) assert.equal(val(a, 'Status'), 'Done');
  for (const a of plan) {
    const src = files['RELEASE_PLAN.json'].items.find((i) => i.id === a.key);
    assert.equal(val(a, 'Status'), src.board_status);
    assert.ok(val(a, 'Progress').length <= 200);
  }
});

test('all mode without --force leaves existing items alone', () => {
  const files = base();
  const r = planSync({ newFiles: files, boardItems: boardFrom(files), fields: fullFields(), mode: 'all' });
  assert.equal(r.actions.length, 0);
  assert.equal(r.summary.skipped, boardFrom(files).length);
});

test('diff mode: a changed card text updates title, body and fields, never Status', () => {
  const oldFiles = base();
  const newFiles = base();
  Object.assign(card(newFiles, 'C-004'), { title: 'Renamed card', priority: 'P0', body: `${card(newFiles, 'C-004').body}\nMore notes.\n` });
  const r = planSync({ oldFiles, newFiles, boardItems: boardFrom(newFiles), fields: fullFields(), mode: 'diff' });
  assert.equal(r.actions.length, 1);
  const [a] = r.actions;
  assert.equal(a.type, 'updateItem');
  assert.equal(a.key, 'C-004');
  assert.equal(a.title, 'C-004 Renamed card');
  assert.match(a.body, /More notes\./);
  assert.deepEqual(a.values, [{ field: 'Priority', value: 'P0' }]);
});

test('all-force rewrites text and fields of existing items but never their Status', () => {
  const files = base();
  const r = planSync({ newFiles: files, boardItems: boardFrom(files), fields: fullFields(), mode: 'all-force' });
  assert.ok(r.actions.length > 0);
  for (const a of r.actions) assert.ok(!a.values.some((v) => v.field === 'Status'), `${a.key} sets Status`);
});

test('a card the owner moved on the board is left alone when its file did not change', () => {
  const r = planSync({ oldFiles: base(), newFiles: base(), boardItems: boardFrom(base()), fields: fullFields(), mode: 'diff' });
  assert.equal(r.actions.length, 0);
});

test('a new card file in the push is created in Backlog, nothing else touched', () => {
  const oldFiles = base();
  const newFiles = base();
  newFiles.cards.push({ ...structuredClone(card(newFiles, 'C-003')), id: 'C-099', title: 'New card', file: 'cards/C-099.md', depends_on: ['C-001'] });
  const r = planSync({ oldFiles, newFiles, boardItems: boardFrom(oldFiles), fields: fullFields(), mode: 'diff' });
  assert.equal(r.actions.length, 1);
  const [a] = r.actions;
  assert.equal(a.type, 'createItem');
  assert.equal(a.title, 'C-099 New card');
  assert.equal(val(a, 'Kind'), 'Work');
  assert.equal(val(a, 'Status'), 'Backlog');
  assert.equal(val(a, 'Depends on'), 'C-001');
});

test('an unparseable card file is skipped with a warning', () => {
  const files = base();
  files.cards.push({ file: 'cards/C-098.md', invalid: 'missing frontmatter' });
  const r = planSync({ newFiles: files, boardItems: [], fields: fullFields(), mode: 'all' });
  assert.ok(r.warnings.some((w) => w.includes('cards/C-098.md: missing frontmatter')));
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

test('Status missing a required column is an error and plans nothing', () => {
  const r = planSync({ newFiles: base(), boardItems: [], fields: fullFields(['Backlog', 'Done']), mode: 'all' });
  assert.equal(r.actions.length, 0);
  assert.match(r.errors[0], /In progress, In review/);
});

test('an extra Status option such as Approved is allowed', () => {
  const r = planSync({ newFiles: base(), boardItems: [], fields: fullFields([...STATUS_OPTIONS, 'Approved']), mode: 'all' });
  assert.deepEqual(r.errors, []);
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
