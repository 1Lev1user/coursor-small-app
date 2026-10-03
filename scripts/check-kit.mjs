// Validates the agent-kit files (agents, skills, state files, cards). Exit 1 with problems, 0 if OK.
// Override the repo root with KIT_ROOT (used for tests).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
let checks = 0;
const check = (ok, msg) => { checks++; if (!ok) problems.push(msg); return ok; };
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const isDir = (p) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isDirectory();
const list = (p) => (isDir(p) ? readdirSync(join(ROOT, p)).sort() : []);

// Tiny frontmatter parser: "key: value", quoted values, "- item" lists. Returns null if no frontmatter.
function frontmatter(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const out = {};
  let key = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(out[key])) out[key] = [];
      out[key].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) { key = kv[1]; out[key] = unquote(kv[2]); }
  }
  return out;
}
function unquote(v) {
  v = v.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) return v.slice(1, -1);
  return v;
}
const str = (v) => typeof v === 'string' && v.trim() !== '';

// Agents
const MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'inherit'];
const skillsWanted = [];
for (const f of list('.claude/agents').filter((x) => x.endsWith('.md'))) {
  const p = `.claude/agents/${f}`;
  const fm = frontmatter(read(p));
  if (!check(fm, `${p}: missing frontmatter`)) continue;
  check(str(fm.name), `${p}: empty name`);
  check(fm.name === basename(f, '.md'), `${p}: name "${fm.name}" != file basename`);
  check(str(fm.description), `${p}: empty description`);
  if (fm.model !== undefined) {
    check(MODELS.includes(fm.model) || fm.model.startsWith('claude-'), `${p}: bad model "${fm.model}"`);
  }
  if (Array.isArray(fm.skills)) for (const s of fm.skills) skillsWanted.push([p, s]);
}
for (const [p, s] of skillsWanted) {
  check(existsSync(join(ROOT, `.claude/skills/${s}/SKILL.md`)), `${p}: skill "${s}" has no .claude/skills/${s}/SKILL.md`);
}

// Skills
for (const d of list('.claude/skills').filter((x) => isDir(`.claude/skills/${x}`))) {
  const p = `.claude/skills/${d}/SKILL.md`;
  if (!check(existsSync(join(ROOT, p)), `${p}: missing`)) continue;
  const fm = frontmatter(read(p));
  if (!check(fm, `${p}: missing frontmatter`)) continue;
  check(fm.name === d, `${p}: name "${fm.name}" != folder "${d}"`);
  check(str(fm.description), `${p}: empty description`);
}

// Root state files
const STATE = ['CLAUDE.md', 'anchor.md', 'SPEC.md', 'STORYMAP.md', 'BOARD.md', 'feature_list.json', 'claude-progress.txt'];
for (const f of STATE) check(existsSync(join(ROOT, f)), `${f}: missing`);
if (existsSync(join(ROOT, 'CLAUDE.md'))) {
  const n = read('CLAUDE.md').split('\n').length;
  check(n < 200, `CLAUDE.md: ${n} lines, must be < 200`);
}

// feature_list.json
const SETS = {
  size: ['S', 'M', 'L'],
  priority: ['P0', 'P1', 'P2'],
  risk: ['low', 'medium', 'high'],
  start_tier: ['haiku', 'sonnet', 'opus'],
  status: ['backlog', 'ready', 'in_progress', 'verify', 'review', 'done', 'blocked'],
};
const nonEmptyArr = (v) => Array.isArray(v) && v.length > 0;
let data = null;
if (existsSync(join(ROOT, 'feature_list.json'))) {
  try { data = JSON.parse(read('feature_list.json')); } catch (e) { check(false, `feature_list.json: invalid JSON (${e.message})`); }
}
if (data && check(Array.isArray(data.cards), 'feature_list.json: "cards" is not an array')) {
  const ids = new Set();
  const board = existsSync(join(ROOT, 'BOARD.md')) ? read('BOARD.md') : '';
  const story = existsSync(join(ROOT, 'STORYMAP.md')) ? read('STORYMAP.md') : '';
  for (const c of data.cards) ids.add(c && c.id);
  const seen = new Set();
  data.cards.forEach((c, i) => {
    const w = `feature_list.json card #${i + 1}${c && c.id ? ` (${c.id})` : ''}`;
    if (!check(c && typeof c === 'object', `${w}: not an object`)) return;
    check(typeof c.id === 'string' && /^C-\d{3}$/.test(c.id), `${w}: bad id "${c.id}" (want C-NNN)`);
    check(!seen.has(c.id), `${w}: duplicate id`);
    seen.add(c.id);
    check(str(c.story_step), `${w}: empty story_step`);
    check(str(c.title), `${w}: empty title`);
    for (const k of Object.keys(SETS)) check(SETS[k].includes(c[k]), `${w}: ${k} "${c[k]}" not in ${SETS[k].join('|')}`);
    check(nonEmptyArr(c.acceptance), `${w}: acceptance must be a non-empty array`);
    check(nonEmptyArr(c.allowed_paths), `${w}: allowed_paths must be a non-empty array`);
    check(Array.isArray(c.attempts), `${w}: attempts must be an array`);
    for (const d of Array.isArray(c.depends_on) ? c.depends_on : []) check(ids.has(d), `${w}: depends_on "${d}" does not exist`);
    if (c.status === 'done') check(c.evidence != null, `${w}: done card has null evidence`);
    if (str(c.id)) check(board.includes(c.id), `${w}: id not found in BOARD.md`);
    if (str(c.story_step)) check(story.includes(c.story_step), `${w}: story_step "${c.story_step}" not found in STORYMAP.md`);
  });
}

// PROJECT_MAP.json (optional): map of existing features, mirrored to the GitHub Project as Kind=Map cards
if (existsSync(join(ROOT, 'PROJECT_MAP.json'))) {
  let map = null;
  try { map = JSON.parse(read('PROJECT_MAP.json')); } catch (e) { check(false, `PROJECT_MAP.json: invalid JSON (${e.message})`); }
  if (map && check(Array.isArray(map.items), 'PROJECT_MAP.json: "items" is not an array')) {
    const story = existsSync(join(ROOT, 'STORYMAP.md')) ? read('STORYMAP.md') : '';
    const activities = new Set();
    for (const line of story.split('\n')) {
      const m = line.match(/^\|\s*Owner[^|]*\|\s*([^|]+?)\s*\|\s*Owner:/);
      if (m) activities.add(m[1]);
    }
    check(activities.size > 0, 'PROJECT_MAP.json: no backbone activities found in STORYMAP.md');
    const mapIds = new Set();
    map.items.forEach((it, i) => {
      const w = `PROJECT_MAP.json item #${i + 1}${it && it.id ? ` (${it.id})` : ''}`;
      if (!check(it && typeof it === 'object', `${w}: not an object`)) return;
      check(typeof it.id === 'string' && /^M-S\d+\.\d+$/.test(it.id), `${w}: bad id "${it.id}" (want M-S<n>.<n>)`);
      check(!mapIds.has(it.id), `${w}: duplicate id`);
      mapIds.add(it.id);
      check(str(it.story_step) && new RegExp(`^\\|\\s*${String(it.story_step).replace(/\./g, '\\.')}\\s*\\|`, 'm').test(story), `${w}: story_step "${it.story_step}" not found in STORYMAP.md`);
      check(activities.has(it.activity), `${w}: activity "${it.activity}" is not a backbone activity in STORYMAP.md`);
      for (const k of ['title', 'what', 'where_in_app']) check(str(it[k]), `${w}: empty ${k}`);
      for (const k of ['files', 'tests']) {
        if (!check(Array.isArray(it[k]), `${w}: ${k} must be an array`)) continue;
        for (const f of it[k]) check(str(f) && existsSync(join(ROOT, f)), `${w}: ${k} path "${f}" does not exist`);
      }
      check(Array.isArray(it.files) && it.files.length > 0, `${w}: files must not be empty`);
    });
  }
}

if (problems.length) {
  console.error(`check-kit: ${problems.length} problem(s) in ${checks} checks`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-kit: OK (${checks} checks)`);
