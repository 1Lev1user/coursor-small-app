#!/usr/bin/env node
// PR guard for card branches (card/C-NNN-...). Run by CI on every pull request.
// Fails when the diff touches a file outside the card's allowed_paths, or edits, deletes or renames an existing
// test that the card does not list in test_edits. The card is read from the base branch, so a PR cannot loosen it.
// Usage: node scripts/check-card.mjs --base <ref> [--head <ref>] [--branch <name>]
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CARDS_DIR, loadCards, pathAllowed } from './cards.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD_BRANCH = /^card\/(C-\d{3})(?:-|$)/;

// changes: [{ status: 'A'|'M'|'D'|'R'..., path, oldPath? }]; testFilesAtBase: Set of test paths on the base branch.
export function checkCard({ branch, cards, changes, testFilesAtBase }) {
  const m = String(branch || '').match(CARD_BRANCH);
  if (!m) return { skipped: `"${branch}" is not a card branch (card/C-NNN-...); nothing to check.`, problems: [] };
  const id = m[1];
  const card = cards.find((c) => c.id === id);
  if (!card) return { problems: [`${id}: no card file ${CARDS_DIR}/${id}.md on the base branch.`] };

  const problems = [];
  const allowed = [...card.allowed_paths, ...card.test_edits];
  for (const ch of changes) {
    for (const p of [ch.path, ch.oldPath].filter(Boolean)) {
      if (!pathAllowed(p, allowed)) problems.push(`${p}: outside allowed_paths of ${id}.`);
    }
    const touchedTest = ch.status.startsWith('R') ? ch.oldPath : ch.status === 'A' ? null : ch.path;
    if (touchedTest && testFilesAtBase.has(touchedTest) && !card.test_edits.includes(touchedTest)) {
      problems.push(`existing test ${touchedTest} changed (${ch.status[0]}) but ${id} does not list it in test_edits.`);
    }
  }
  return { problems: [...new Set(problems)] };
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function main(argv) {
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const base = arg('--base');
  if (!base) throw new Error('--base <ref> is required.');
  const head = arg('--head', 'HEAD');
  const branch = arg('--branch', process.env.GITHUB_HEAD_REF || git(['rev-parse', '--abbrev-ref', 'HEAD']).trim());

  const names = git(['ls-tree', '--name-only', `${base}:${CARDS_DIR}`]).split('\n').filter(Boolean);
  const cards = loadCards(names, (n) => { try { return git(['show', `${base}:${CARDS_DIR}/${n}`]); } catch { return null; } });
  const testFilesAtBase = new Set(git(['ls-tree', '-r', '--name-only', base, '--', 'test']).split('\n').filter(Boolean));
  const changes = git(['diff', '--name-status', '-M', `${base}...${head}`]).split('\n').filter(Boolean).map((line) => {
    const [status, a, b] = line.split('\t');
    return status.startsWith('R') || status.startsWith('C') ? { status, oldPath: a, path: b } : { status, path: a };
  });

  const r = checkCard({ branch, cards, changes, testFilesAtBase });
  if (r.skipped) { console.log(`check-card: skipped, ${r.skipped}`); return 0; }
  if (r.problems.length) {
    console.error(`check-card: ${r.problems.length} problem(s) on ${branch}`);
    for (const p of r.problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`check-card: OK (${changes.length} changed file(s) inside the card's allowed_paths)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`check-card: ${e.message}`); process.exit(1); }
}
