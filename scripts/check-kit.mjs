// Validates the delivery-system files (Claude-only agents and skills, rule files, cards). Exit 1 with problems, 0 if OK.
// Override the repo root with KIT_ROOT (used for tests).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, readCards, CARD_FILE, isSystemPath } from './cards.mjs';

const ROOT = process.env.KIT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
let checks = 0;
const check = (ok, msg) => { checks++; if (!ok) problems.push(msg); return ok; };
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const isDir = (p) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isDirectory();
const list = (p) => (isDir(p) ? readdirSync(join(ROOT, p)).sort() : []);
const frontmatter = (text) => parseFrontmatter(text)?.data ?? null;
const str = (v) => typeof v === 'string' && v.trim() !== '';

// Cursor loads .claude/agents and .claude/skills too (compatibility). Everything there must say it is for Claude only,
// so the executor in Cursor does not pick up planner or reviewer work.
const CLAUDE_ONLY = /^Claude only\b/;

// Agents
const MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'inherit'];
for (const f of list('.claude/agents').filter((x) => x.endsWith('.md'))) {
  const p = `.claude/agents/${f}`;
  const fm = frontmatter(read(p));
  if (!check(fm, `${p}: missing frontmatter`)) continue;
  check(str(fm.name), `${p}: empty name`);
  check(fm.name === basename(f, '.md'), `${p}: name "${fm.name}" != file basename`);
  check(CLAUDE_ONLY.test(fm.description ?? ''), `${p}: description must start with "Claude only"`);
  if (fm.model !== undefined) {
    check(MODELS.includes(fm.model) || fm.model.startsWith('claude-'), `${p}: bad model "${fm.model}"`);
  }
  for (const s of Array.isArray(fm.skills) ? fm.skills : []) {
    check(existsSync(join(ROOT, `.claude/skills/${s}/SKILL.md`)), `${p}: skill "${s}" has no .claude/skills/${s}/SKILL.md`);
  }
}

// Skills
for (const d of list('.claude/skills').filter((x) => isDir(`.claude/skills/${x}`))) {
  const p = `.claude/skills/${d}/SKILL.md`;
  if (!check(existsSync(join(ROOT, p)), `${p}: missing`)) continue;
  const fm = frontmatter(read(p));
  if (!check(fm, `${p}: missing frontmatter`)) continue;
  check(fm.name === d, `${p}: name "${fm.name}" != folder "${d}"`);
  check(CLAUDE_ONLY.test(fm.description ?? ''), `${p}: description must start with "Claude only"`);
}

// Rule and state files. BOARD.md and feature_list.json belonged to the old file-driven board; the GitHub Project
// Status column is now the only status source, so they must not come back.
for (const f of ['CLAUDE.md', 'AGENTS.md', 'anchor.md', 'SPEC.md', 'STORYMAP.md']) check(existsSync(join(ROOT, f)), `${f}: missing`);
for (const f of ['BOARD.md', 'feature_list.json']) check(!existsSync(join(ROOT, f)), `${f}: retired, statuses live on the board only`);
for (const f of ['CLAUDE.md', 'AGENTS.md'].filter((x) => existsSync(join(ROOT, x)))) {
  const text = read(f);
  const n = text.split('\n').length;
  check(n < 200, `${f}: ${n} lines, must be < 200`);
  for (const ref of new Set(text.match(/\bprocess\/[\w-]+\.md\b/g) ?? [])) check(existsSync(join(ROOT, ref)), `${f}: refers to missing ${ref}`);
}

// Cards (cards/C-NNN.md)
const SETS = { size: ['S', 'M', 'L'], priority: ['P0', 'P1', 'P2'], risk: ['low', 'medium', 'high'] };
const FIELDS = ['id', 'title', 'story_step', 'size', 'priority', 'risk', 'slice', 'depends_on', 'allowed_paths', 'test_edits'];
const story = existsSync(join(ROOT, 'STORYMAP.md')) ? read('STORYMAP.md') : '';
const stepRow = (s) => new RegExp(`^\\|\\s*${String(s).replace(/\./g, '\\.')}\\s*\\|`, 'm').test(story);
check(isDir('cards'), 'cards/: missing');
const cards = readCards(ROOT);
const ids = new Set(cards.map((c) => c.id));
for (const f of list('cards').filter((x) => x.endsWith('.md'))) check(CARD_FILE.test(f), `cards/${f}: file name must be C-NNN.md`);
for (const c of cards) {
  const w = c.file;
  if (!check(!c.invalid, `${w}: ${c.invalid}`)) continue;
  check(c.id === basename(w, '.md'), `${w}: id "${c.id}" != file name`);
  for (const k of c.fields) check(FIELDS.includes(k), `${w}: unknown field "${k}" (a card holds no status; the board does)`);
  check(str(c.title), `${w}: empty title`);
  for (const k of Object.keys(SETS)) check(SETS[k].includes(c[k]), `${w}: ${k} "${c[k]}" not in ${SETS[k].join('|')}`);
  check(c.slice === null || Number.isInteger(c.slice), `${w}: slice must be a whole number`);
  check(str(c.story_step) && stepRow(c.story_step), `${w}: story_step "${c.story_step}" not found in STORYMAP.md`);
  check(c.acceptance.length > 0, `${w}: needs at least one bullet under "## Acceptance"`);
  check(c.allowed_paths.length > 0, `${w}: allowed_paths must not be empty`);
  for (const p of new Set([...c.allowed_paths, ...c.test_edits])) {
    check(!isSystemPath(p), `${w}: allowed path "${p}" covers a system file (planner only)`);
  }
  for (const t of c.test_edits) check(t.startsWith('test/') && existsSync(join(ROOT, t)), `${w}: test_edits "${t}" is not an existing file under test/`);
  for (const d of c.depends_on) check(ids.has(d), `${w}: depends_on "${d}" has no card file`);
}

// PROJECT_MAP.json (optional): map of existing features, mirrored to the GitHub Project as Kind=Map cards
if (existsSync(join(ROOT, 'PROJECT_MAP.json'))) {
  let map = null;
  try { map = JSON.parse(read('PROJECT_MAP.json')); } catch (e) { check(false, `PROJECT_MAP.json: invalid JSON (${e.message})`); }
  if (map && check(Array.isArray(map.items), 'PROJECT_MAP.json: "items" is not an array')) {
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
      check(str(it.story_step) && stepRow(it.story_step), `${w}: story_step "${it.story_step}" not found in STORYMAP.md`);
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

// RELEASE_PLAN.json (optional): release plan steps with audited progress, mirrored to the GitHub Project as Kind=Plan items
if (existsSync(join(ROOT, 'RELEASE_PLAN.json'))) {
  let plan = null;
  try { plan = JSON.parse(read('RELEASE_PLAN.json')); } catch (e) { check(false, `RELEASE_PLAN.json: invalid JSON (${e.message})`); }
  if (plan && check(Array.isArray(plan.items), 'RELEASE_PLAN.json: "items" is not an array')) {
    const BOARD_STATUS = { done: 'Done', partial: 'In progress', not_started: 'Backlog', changed: 'Done' };
    const planIds = new Set(plan.items.map((it) => it && it.id));
    const seenPlan = new Set();
    plan.items.forEach((it, i) => {
      const w = `RELEASE_PLAN.json item #${i + 1}${it && it.id ? ` (${it.id})` : ''}`;
      if (!check(it && typeof it === 'object', `${w}: not an object`)) return;
      check(typeof it.id === 'string' && /^P-[A-Z]+\d+$/.test(it.id), `${w}: bad id "${it.id}" (want P-<letters><n>)`);
      check(!seenPlan.has(it.id), `${w}: duplicate id`);
      seenPlan.add(it.id);
      check(Object.hasOwn(BOARD_STATUS, it.status), `${w}: status "${it.status}" not in ${Object.keys(BOARD_STATUS).join('|')}`);
      check(Object.hasOwn(BOARD_STATUS, it.status) && it.board_status === BOARD_STATUS[it.status], `${w}: board_status "${it.board_status}" does not match status "${it.status}" (want ${BOARD_STATUS[it.status]})`);
      check(['2.0', '2.1', '2.2', 'next'].includes(it.release), `${w}: release "${it.release}" not in 2.0|2.1|2.2|next`);
      check(str(it.title), `${w}: empty title`);
      check(it.story_step === null || (str(it.story_step) && stepRow(it.story_step)), `${w}: story_step "${it.story_step}" not found in STORYMAP.md`);
      check(it.follow_up_of === null || planIds.has(it.follow_up_of), `${w}: follow_up_of "${it.follow_up_of}" is not an existing item id`);
    });
  }
}

if (problems.length) {
  console.error(`check-kit: ${problems.length} problem(s) in ${checks} checks`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-kit: OK (${checks} checks)`);
