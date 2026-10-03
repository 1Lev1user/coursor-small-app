// Card files: cards/C-NNN.md, one card per file. Frontmatter holds the fields, the body holds Goal, Acceptance, Notes.
// Cards never hold a status: the GitHub Project Status column is the only status source.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const CARDS_DIR = 'cards';
const CARD_ID = 'C-\\d{3}';
export const CARD_FILE = new RegExp(`^${CARD_ID}\\.md$`);
export const CARD_BRANCH = new RegExp(`^card/(${CARD_ID})(?:-|$)`);

// Files only the planner changes. No card may list them, and a card branch may not touch them.
export const SYSTEM_PATHS = ['cards/', 'process/', '.claude/', 'CLAUDE.md', 'AGENTS.md', 'anchor.md', 'SPEC.md', 'STORYMAP.md',
  'scripts/cards.mjs', 'scripts/check-card.mjs', 'scripts/check-kit.mjs', 'scripts/board-sync.mjs',
  '.github/workflows/test.yml', '.github/workflows/board-sync.yml'];

const unquote = (v) => {
  v = v.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) return v.slice(1, -1);
  return v;
};

// Tiny frontmatter parser: "key: value", quoted values, inline lists "[a, b]", block lists "- item".
// Returns { data, body } or null when the text has no frontmatter.
export function parseFrontmatter(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const data = {};
  let key = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const raw = kv[2].trim();
    const inline = raw.match(/^\[(.*)\]$/);
    data[key] = inline ? inline[1].split(',').map(unquote).filter(Boolean) : unquote(raw);
  }
  return { data, body: lines.slice(end + 1).join('\n').replace(/^\n+/, '') };
}

const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Bullets under "## Acceptance" until the next heading.
function acceptanceOf(body) {
  const out = [];
  let inside = false;
  for (const line of body.split('\n')) {
    if (/^##\s/.test(line)) { inside = /^##\s+Acceptance\s*$/i.test(line); continue; }
    const b = inside && line.match(/^\s*-\s+(.*)$/);
    if (b) out.push(b[1].trim());
  }
  return out;
}

export function parseCard(text, file = '') {
  const fm = parseFrontmatter(text);
  if (!fm) return { file, invalid: 'missing frontmatter' };
  const d = fm.data;
  return {
    file,
    fields: Object.keys(d),
    id: d.id, title: d.title, story_step: d.story_step, size: d.size, priority: d.priority, risk: d.risk,
    slice: d.slice == null || d.slice === '' ? null : Number(d.slice),
    depends_on: list(d.depends_on), allowed_paths: list(d.allowed_paths), test_edits: list(d.test_edits),
    body: fm.body, acceptance: acceptanceOf(fm.body),
  };
}

// names: card file names; read(name) returns the file text or null.
export function loadCards(names, read) {
  return names.filter((n) => CARD_FILE.test(n)).sort()
    .map((n) => [n, read(n)]).filter(([, t]) => t != null)
    .map(([n, t]) => parseCard(t, `${CARDS_DIR}/${n}`));
}

export function readCards(root) {
  const dir = join(root, CARDS_DIR);
  if (!existsSync(dir)) return [];
  return loadCards(readdirSync(dir), (n) => readFileSync(join(dir, n), 'utf8'));
}

// An allowed_paths entry ending in "/" allows everything under that folder; any other entry allows that exact file.
export function pathAllowed(path, allowed) {
  return allowed.some((a) => (a.endsWith('/') ? path.startsWith(a) : path === a));
}

// True when two allowed_paths-style entries share any file (either may be a folder).
export const pathsOverlap = (a, b) => pathAllowed(a, [b]) || pathAllowed(b, [a]);
export const isSystemPath = (p) => SYSTEM_PATHS.some((s) => pathsOverlap(p, s));
