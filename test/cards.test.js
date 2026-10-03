// Tests for scripts/cards.mjs (card files) and scripts/check-card.mjs (PR guard). No git, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, parseCard, pathAllowed } from '../scripts/cards.mjs';
import { checkCard } from '../scripts/check-card.mjs';

const CARD = `---
id: C-042
title: Example card
story_step: S1.1
size: S
priority: P1
risk: low
slice: 2
depends_on: []
allowed_paths:
  - src/example/
  - test/example.test.js
test_edits:
  - test/old.test.js
---

## Goal
Do one thing.

## Acceptance
- \`npm test\` exits 0.
- The example works.

## Notes
None.
`;

test('parseFrontmatter reads scalars, quoted values, inline and block lists', () => {
  const fm = parseFrontmatter('---\na: 1\nb: "x: y"\nc: []\nd: [p, q]\ne:\n  - one\n  - two\n---\nbody text\n');
  assert.deepEqual(fm.data, { a: '1', b: 'x: y', c: [], d: ['p', 'q'], e: ['one', 'two'] });
  assert.equal(fm.body, 'body text\n');
  assert.equal(parseFrontmatter('no frontmatter'), null);
});

test('parseCard returns typed fields, body and acceptance bullets', () => {
  const c = parseCard(CARD, 'cards/C-042.md');
  assert.equal(c.id, 'C-042');
  assert.equal(c.slice, 2);
  assert.deepEqual(c.depends_on, []);
  assert.deepEqual(c.allowed_paths, ['src/example/', 'test/example.test.js']);
  assert.deepEqual(c.test_edits, ['test/old.test.js']);
  assert.deepEqual(c.acceptance, ['`npm test` exits 0.', 'The example works.']);
  assert.match(c.body, /^## Goal/);
});

test('pathAllowed: a trailing slash allows a folder, otherwise the exact file', () => {
  const allowed = ['src/example/', 'test/example.test.js'];
  assert.equal(pathAllowed('src/example/a.js', allowed), true);
  assert.equal(pathAllowed('src/example2/a.js', allowed), false);
  assert.equal(pathAllowed('test/example.test.js', allowed), true);
  assert.equal(pathAllowed('test/example.test.js.bak', allowed), false);
});

const card = parseCard(CARD, 'cards/C-042.md');
const run = (over) => checkCard({ branch: 'card/C-042-example', cards: [card], changes: [], testFilesAtBase: new Set(['test/old.test.js', 'test/other.test.js']), ...over });

test('checkCard skips branches that are not card branches', () => {
  const r = run({ branch: 'system/cursor-flow', changes: [{ status: 'M', path: 'anything.js' }] });
  assert.match(r.skipped, /not a card branch/);
  assert.deepEqual(r.problems, []);
});

test('checkCard passes a diff inside allowed_paths, including an approved test edit and a new test', () => {
  const r = run({ changes: [{ status: 'M', path: 'src/example/a.js' }, { status: 'A', path: 'test/example.test.js' }, { status: 'M', path: 'test/old.test.js' }] });
  assert.deepEqual(r.problems, []);
});

test('checkCard flags files outside allowed_paths and a missing card', () => {
  const r = run({ changes: [{ status: 'M', path: 'src/app.js' }] });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /src\/app\.js.*outside allowed_paths/);
  const missing = run({ branch: 'card/C-777-x', changes: [] });
  assert.match(missing.problems[0], /C-777.*no card file/);
});

test('checkCard flags edits, deletes and renames of existing tests not listed in test_edits', () => {
  const c = { ...card, allowed_paths: ['test/'] };
  const r = run({ cards: [c], changes: [{ status: 'M', path: 'test/other.test.js' }, { status: 'D', path: 'test/other.test.js' }, { status: 'R', oldPath: 'test/other.test.js', path: 'test/moved.test.js' }] });
  assert.equal(r.problems.length, 3);
  for (const p of r.problems) assert.match(p, /existing test test\/other\.test\.js/);
});
