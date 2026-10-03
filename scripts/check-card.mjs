#!/usr/bin/env node
// PR guard for card branches (card/C-NNN-...). Run by CI on pull requests from card branches.
// Fails when the diff touches a file outside the card's allowed_paths, touches a system file, or edits, deletes or
// renames an existing test that the card does not list in test_edits. The card is read from the base branch, so a
// PR cannot loosen it.
// Usage: node scripts/check-card.mjs --base <ref> [--head <ref>] [--branch <name>]
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CARDS_DIR, CARD_BRANCH, parseCard, pathAllowed, isSystemPath } from './cards.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// card: the parsed card or null; changes: [{ status: 'A'|'M'|'D'|'R...', path, oldPath? }];
// existedAtBase(path): true when the file exists on the base branch.
export function checkCard({ id, card, changes, existedAtBase }) {
  if (!card) return [`${id}: no card file ${CARDS_DIR}/${id}.md on the base branch.`];
  const problems = [];
  const allowed = [...card.allowed_paths, ...card.test_edits];
  for (const ch of changes) {
    for (const p of [ch.path, ch.oldPath].filter(Boolean)) {
      if (isSystemPath(p)) problems.push(`${p}: system file, only the planner changes it.`);
      else if (!pathAllowed(p, allowed)) problems.push(`${p}: outside allowed_paths of ${id}.`);
    }
    const touched = ch.status.startsWith('R') ? ch.oldPath : ch.status === 'A' ? null : ch.path;
    if (touched?.startsWith('test/') && !card.test_edits.includes(touched) && existedAtBase(touched)) {
      problems.push(`existing test ${touched} changed (${ch.status[0]}) but ${id} does not list it in test_edits.`);
    }
  }
  return [...new Set(problems)];
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
  const id = branch.match(CARD_BRANCH)?.[1];
  if (!id) { console.log(`check-card: skipped, "${branch}" is not a card branch (card/C-NNN-...).`); return 0; }

  const file = `${CARDS_DIR}/${id}.md`;
  let card = null;
  try { card = parseCard(git(['show', `${base}:${file}`]), file); } catch { card = null; }
  const existedAtBase = (p) => { try { git(['cat-file', '-e', `${base}:${p}`]); return true; } catch { return false; } };
  const changes = git(['diff', '--name-status', '-M', `${base}...${head}`]).split('\n').filter(Boolean).map((line) => {
    const [status, a, b] = line.split('\t');
    return status.startsWith('R') || status.startsWith('C') ? { status, oldPath: a, path: b } : { status, path: a };
  });

  const problems = checkCard({ id, card, changes, existedAtBase });
  if (problems.length) {
    console.error(`check-card: ${problems.length} problem(s) on ${branch}`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`check-card: OK (${changes.length} changed file(s) inside the allowed_paths of ${id})`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`check-card: ${e.message}`); process.exit(1); }
}
