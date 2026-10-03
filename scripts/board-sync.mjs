#!/usr/bin/env node
// Mirrors the card files (cards/C-NNN.md), PROJECT_MAP.json and RELEASE_PLAN.json to an existing GitHub Project (v2).
// Run by .github/workflows/board-sync.yml on push to main. No dependencies: global fetch against the GraphQL API.
// The board's Status column is the only status source: Status is set once, when an item is created, and never
// changed afterwards. Default (diff) mode touches only items whose text or fields changed between --base and the
// working tree. Never deletes or archives items.
// Usage: node scripts/board-sync.mjs [--base <ref>] | --all [--force]  [--dry-run]
// Env: PROJECT_TOKEN, PROJECT_OWNER (user or organization), PROJECT_NUMBER.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CARDS_DIR, loadCards, readCards } from './cards.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com/graphql';

export const FILES = ['PROJECT_MAP.json', 'RELEASE_PLAN.json'];
// The board's columns (process/board.md). Other options (for example an old "Ready" or "Approved") are ignored.
export const STATUS_OPTIONS = ['Backlog', 'In progress', 'In review', 'Done'];
export const ACTIVITIES = ['Sets up', 'Records entries', 'Reviews money', 'Imports bank statement', 'Plans and saves', 'Backs up and updates'];
const SS = 'SINGLE_SELECT';

// Fields we ensure. Existing fields are never modified; missing options give warnings.
export const FIELD_SPECS = [
  { name: 'Kind', type: SS, options: ['Map', 'Work', 'Plan'] },
  { name: 'Blocked', type: SS, options: ['yes'] },
  { name: 'Priority', type: SS, options: ['P0', 'P1', 'P2'] },
  { name: 'Size', type: SS, options: ['S', 'M', 'L'] },
  { name: 'Risk', type: SS, options: ['low', 'medium', 'high'] },
  { name: 'Activity', type: SS, options: ACTIVITIES },
  { name: 'Release', type: SS, options: ['2.0', '2.1', '2.2', 'next'] },
  ...['Card ID', 'Story step', 'Depends on', 'Files', 'Progress'].map((name) => ({ name, type: 'TEXT' })),
  // Board-only: set by the orchestrator (process/orchestration.md), never written by this sync.
  { name: 'Agent', type: 'TEXT' },
  { name: 'Slice', type: 'NUMBER' },
];
const SPEC = Object.fromEntries(FIELD_SPECS.map((s) => [s.name, s]));
SPEC.Status = { name: 'Status', type: SS, options: STATUS_OPTIONS };

const bullets = (a) => (Array.isArray(a) && a.length ? a.map((x) => '- `' + x + '`').join('\n') : '- (none)');
const text = (v) => (v == null || v === '' ? null : String(v));
const prefix = (title) => String(title || '').split(' ')[0];

// Board items wanted by the files: Map key -> { key, kind, title, body, status, values }.
// files.cards: parsed card files (scripts/cards.mjs). status is used only when the item is created.
export function buildItems(files, warnings = []) {
  const out = new Map();
  for (const c of files?.cards ?? []) {
    if (c.invalid || !c.id) { warnings.push(`${c.file}: ${c.invalid ?? 'no id'}, skipped`); continue; }
    out.set(c.id, {
      key: c.id, kind: 'Work', title: `${c.id} ${c.title}`, status: 'Backlog',
      body: `${c.body.trim()}\n\n**Allowed paths**\n${bullets(c.allowed_paths)}`
        + (c.test_edits.length ? `\n\n**Existing tests this card may edit**\n${bullets(c.test_edits)}` : '')
        + `\n\nSource: ${c.file}. Edit the file, not this card. Branch: card/${c.id}-<short-name>.`,
      values: {
        'Card ID': c.id, 'Story step': text(c.story_step), Priority: text(c.priority), Size: text(c.size), Risk: text(c.risk),
        'Depends on': text(c.depends_on.join(', ')), Slice: c.slice,
      },
    });
  }
  for (const i of files?.['PROJECT_MAP.json']?.items ?? []) {
    out.set(i.id, {
      key: i.id, kind: 'Map', title: `${i.id} ${i.title}`, status: 'Done',
      body: `**What**\n${i.what}\n\n**Where in the app**\n${i.where_in_app}\n\n**Files**\n${bullets(i.files)}\n\n**Tests**\n${bullets(i.tests)}`
        + (i.notes ? `\n\n**Notes**\n${i.notes}` : '') + `\n\nStory step: ${i.story_step}. Mirrored from PROJECT_MAP.json; edit the file, not this card.`,
      values: { Activity: text(i.activity), 'Story step': text(i.story_step), Files: text((i.files ?? []).join(', ')) },
    });
  }
  for (const i of files?.['RELEASE_PLAN.json']?.items ?? []) {
    const known = STATUS_OPTIONS.includes(i.board_status);
    if (!known) warnings.push(`${i.id}: unknown board_status "${i.board_status}", Status not set`);
    const parts = [['Evidence', i.evidence], ['Missing', i.missing], ['Note', i.note], ['Follow-up of', i.follow_up_of]].filter(([, v]) => v);
    out.set(i.id, {
      key: i.id, kind: 'Plan', title: `${i.id} ${i.title}`, status: known ? i.board_status : null,
      body: parts.map(([k, v]) => `**${k}**\n${v}`).join('\n\n')
        + `\n\nRelease: ${i.release}. Mirrored from RELEASE_PLAN.json; edit the file, not this card.`,
      values: {
        Release: text(i.release), 'Story step': text(i.story_step),
        Progress: text([i.status, i.missing].filter(Boolean).join(': ').slice(0, 200)),
      },
    });
  }
  return out;
}

// Pure planner: returns { actions, warnings, errors, summary }. No network.
// mode: 'diff' | 'all' | 'all-force'. boardItems/fields null = unknown (dry run without token).
export function planSync({ oldFiles = {}, newFiles, boardItems = null, fields = null, mode = 'diff' }) {
  const warnings = [];
  const errors = [];
  const actions = [];
  const summary = { created: 0, updated: 0, skipped: 0, warnings: 0 };
  const wanted = buildItems(newFiles, warnings);
  const old = mode === 'diff' ? buildItems(oldFiles) : new Map();
  const byName = fields ? new Map(fields.map((f) => [f.name, f])) : null;
  const badType = new Set();

  if (byName) {
    const st = byName.get('Status');
    if (!st || st.dataType !== SS) errors.push('Field "Status" (single select) not found in the project. It must be the built-in Status column.');
    else {
      // Only the statuses new items are created with must exist; the sync never moves items between columns.
      const needed = new Set([...wanted.values()].map((i) => i.status).filter(Boolean));
      const miss = [...needed].filter((o) => !st.options?.some((x) => x.name === o));
      if (miss.length) errors.push(`Status is missing option(s): ${miss.join(', ')}. Add them in Project settings > Status; nothing was changed.`);
    }
    for (const s of FIELD_SPECS) {
      const f = byName.get(s.name);
      if (!f) { actions.push({ type: 'createField', name: s.name, dataType: s.type, options: s.options }); continue; }
      if (f.dataType !== s.type) { badType.add(s.name); warnings.push(`Field "${s.name}" is ${f.dataType}, expected ${s.type}; its values are skipped.`); }
    }
  }
  if (errors.length) return { actions: [], warnings, errors, summary: { ...summary, warnings: warnings.length } };

  // Missing options: grouped warnings with the affected ids.
  const lacks = new Map();
  const note = (field, value, key) => {
    const k = `Field "${field}" lacks option "${value}"`;
    if (!lacks.has(k)) lacks.set(k, []);
    lacks.get(k).push(key);
  };
  const ok = (field, value) => {
    if (!byName || value == null) return true;
    const f = byName.get(field);
    if (!f) return true; // created with our options
    if (badType.has(field)) return false;
    return f.dataType !== SS || f.options.some((o) => o.name === value);
  };
  const keep = (vals, key) => vals.filter(({ field, value }) => {
    if (badType.has(field)) return false;
    if (ok(field, value)) return true;
    note(field, value, key);
    return false;
  });

  const board = new Map();
  for (const b of boardItems ?? []) {
    const k = prefix(b.title);
    if (!wanted.has(k)) continue; // not ours: never touched
    if (board.has(k)) { warnings.push(`Duplicate board items for ${k}; only the first is synced.`); continue; }
    board.set(k, b);
  }

  for (const [key, it] of wanted) {
    if (!ok('Kind', it.kind)) { note('Kind', it.kind, key); summary.skipped++; continue; }
    const b = board.get(key);
    let how;
    if (boardItems) how = !b ? 'create' : mode === 'all-force' ? 'full' : mode === 'all' ? 'skip' : old.has(key) ? 'diff' : 'full';
    else how = mode === 'diff' ? (old.has(key) ? 'diff' : 'create') : 'create';
    if (how === 'skip') { summary.skipped++; continue; }

    const vals = how === 'diff' ? [] : [{ field: 'Kind', value: it.kind }];
    if (how === 'create') {
      vals.push({ field: 'Status', value: it.status ?? 'Backlog' });
      for (const [field, value] of Object.entries(it.values)) if (value != null) vals.push({ field, value });
      actions.push({ type: 'createItem', key, title: it.title, body: it.body, values: keep(vals, key) });
      summary.created++;
      continue;
    }
    const act = { type: 'updateItem', key, itemId: b?.id ?? null, contentId: b?.contentId ?? null, values: [] };
    const prev = how === 'diff' ? old.get(key) : null;
    if (!prev || prev.title !== it.title) act.title = it.title;
    if (!prev || prev.body !== it.body) act.body = it.body;
    for (const [field, value] of Object.entries(it.values)) if (!prev || prev.values[field] !== value) vals.push({ field, value });
    act.values = keep(vals, key);
    if ((act.title || act.body) && b && b.isDraft === false) {
      warnings.push(`${key} is not a draft issue; title and body not updated.`);
      delete act.title; delete act.body;
    }
    if (!act.title && !act.body && !act.values.length) { summary.skipped++; continue; }
    actions.push(act);
    summary.updated++;
  }

  for (const [k, ids] of lacks) {
    const list = ids.length > 5 ? `${ids.slice(0, 5).join(', ')} and ${ids.length - 5} more` : ids.join(', ');
    warnings.push(k.startsWith('Field "Kind"')
      ? `${k}: skipped ${ids.length} item(s) (${list}). Add the option in Project settings > Kind.`
      : `${k}: value skipped for ${list}.`);
  }
  summary.warnings = warnings.length;
  return { actions, warnings, errors, summary };
}

// One line per planned mutation group (used by --dry-run).
export function describe(a) {
  const vals = (v) => v.map(({ field, value }) => (value == null ? `clear ${field}` : `${field}=${value}`)).join('; ');
  if (a.type === 'createField') return `createProjectV2Field "${a.name}" ${a.dataType}${a.options ? ` [${a.options.join(', ')}]` : ''}`;
  if (a.type === 'createItem') return `addProjectV2DraftIssue "${a.title}" + updateProjectV2ItemFieldValue: ${vals(a.values)}`;
  const parts = [];
  if (a.title || a.body) parts.push(`updateProjectV2DraftIssue (${[a.title && 'title', a.body && 'body'].filter(Boolean).join(', ')})`);
  if (a.values.length) parts.push(`field values: ${vals(a.values)}`);
  return `update ${a.key} ${a.itemId ?? '(item id from board)'}: ${parts.join(' + ')}`;
}

// ---- GitHub GraphQL (thin executor) ----

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeClient(token, { delayMs = 0, fetchFn = globalThis.fetch } = {}) {
  const redact = (s) => (token ? String(s).split(token).join('***') : String(s));
  return async function gql(query, variables = {}, write = false) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(API, {
        method: 'POST',
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'board-sync' },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 401) throw new Error('GitHub rejected PROJECT_TOKEN (401). Check the secret value and that it has the project scope.');
      const raw = await res.text();
      const limited = res.status === 429 || (res.status === 403 && (res.headers.get('retry-after') || /rate limit/i.test(raw)));
      if (limited && attempt < 3) {
        const wait = Number(res.headers.get('retry-after')) || 60;
        console.log(`Rate limited, waiting ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
      let json = null;
      try { json = JSON.parse(raw); } catch { json = null; }
      if (!res.ok || !json) throw new Error(`GitHub API error ${res.status}${json?.message ? `: ${redact(json.message)}` : ''}.`);
      if (json.errors?.length) {
        const err = new Error(redact(json.errors.map((e) => e.message).join('; ')));
        err.data = json.data;
        throw err;
      }
      if (write && delayMs) await sleep(delayMs);
      return json.data;
    }
  };
}

async function loadProject(gql, owner, number) {
  const why = [];
  for (const type of ['user', 'organization']) {
    try {
      const d = await gql(`query($o: String!, $n: Int!) { ${type}(login: $o) { projectV2(number: $n) { id title } } }`, { o: owner, n: number });
      if (d?.[type]?.projectV2) return d[type].projectV2;
    } catch (e) {
      if (/401/.test(e.message)) throw e;
      why.push(`${type}: ${e.message}`);
    }
  }
  throw new Error(`Project ${number} not found for owner ${owner} (PROJECT_TOKEN needs the project scope). ${why.join(' | ')}`);
}

async function pages(gql, query, vars, pick) {
  const out = [];
  let after = null;
  do {
    const conn = pick(await gql(query, { ...vars, after }));
    out.push(...conn.nodes.filter(Boolean));
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);
  return out;
}

async function loadFields(gql, projectId) {
  const q = `query($p: ID!, $after: String) { node(id: $p) { ... on ProjectV2 { fields(first: 100, after: $after) {
    nodes { ... on ProjectV2FieldCommon { id name dataType } ... on ProjectV2SingleSelectField { options { id name } } }
    pageInfo { hasNextPage endCursor } } } } }`;
  return (await pages(gql, q, { p: projectId }, (d) => d.node.fields)).map((f) => ({ ...f, options: f.options ?? [] }));
}

async function loadItems(gql, projectId) {
  const q = `query($p: ID!, $after: String) { node(id: $p) { ... on ProjectV2 { items(first: 100, after: $after) {
    nodes { id type content { ... on DraftIssue { id title } ... on Issue { title } ... on PullRequest { title } } }
    pageInfo { hasNextPage endCursor } } } } }`;
  return (await pages(gql, q, { p: projectId }, (d) => d.node.items)).map((n) => ({
    id: n.id, title: n.content?.title ?? '', isDraft: n.type === 'DRAFT_ISSUE', contentId: n.type === 'DRAFT_ISSUE' ? n.content?.id : null,
  }));
}

async function setValues(gql, projectId, itemId, values, fields) {
  if (!values.length) return;
  const byName = new Map(fields.map((f) => [f.name, f]));
  const decl = ['$p: ID!', '$i: ID!'];
  const body = [];
  const vars = { p: projectId, i: itemId };
  values.forEach(({ field, value }, n) => {
    const f = byName.get(field);
    if (!f) throw new Error(`Field "${field}" not found after setup.`);
    decl.push(`$f${n}: ID!`);
    vars[`f${n}`] = f.id;
    if (value == null) {
      body.push(`c${n}: clearProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f${n} }) { clientMutationId }`);
      return;
    }
    let v;
    if (f.dataType === SS) v = { singleSelectOptionId: f.options.find((o) => o.name === value)?.id };
    else if (f.dataType === 'NUMBER') v = { number: Number(value) };
    else v = { text: String(value) };
    if (v.singleSelectOptionId === undefined && f.dataType === SS) throw new Error(`Option "${value}" not found in field "${field}".`);
    decl.push(`$v${n}: ProjectV2FieldValue!`);
    vars[`v${n}`] = v;
    body.push(`u${n}: updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f${n}, value: $v${n} }) { clientMutationId }`);
  });
  await gql(`mutation(${decl.join(', ')}) { ${body.join('\n')} }`, vars, true);
}

export async function execute(gql, projectId, actions, fields) {
  for (const a of actions.filter((x) => x.type === 'createField')) {
    const input = { projectId, dataType: a.dataType, name: a.name };
    if (a.options) input.singleSelectOptions = a.options.map((name) => ({ name, color: 'GRAY', description: '' }));
    await gql('mutation($in: CreateProjectV2FieldInput!) { createProjectV2Field(input: $in) { clientMutationId } }', { in: input }, true);
    console.log(`Field created: ${a.name}`);
  }
  if (actions.some((x) => x.type === 'createField')) fields = await loadFields(gql, projectId);
  for (const a of actions) {
    if (a.type === 'createItem') {
      const d = await gql('mutation($p: ID!, $t: String!, $b: String) { addProjectV2DraftIssue(input: { projectId: $p, title: $t, body: $b }) { projectItem { id } } }',
        { p: projectId, t: a.title, b: a.body }, true);
      await setValues(gql, projectId, d.addProjectV2DraftIssue.projectItem.id, a.values, fields);
      console.log(`Created: ${a.title}`);
    } else if (a.type === 'updateItem') {
      if ((a.title || a.body) && a.contentId) {
        const input = { draftIssueId: a.contentId };
        if (a.title) input.title = a.title;
        if (a.body) input.body = a.body;
        await gql('mutation($in: UpdateProjectV2DraftIssueInput!) { updateProjectV2DraftIssue(input: $in) { clientMutationId } }', { in: input }, true);
      }
      await setValues(gql, projectId, a.itemId, a.values, fields);
      console.log(`Updated: ${a.key}${a.values.length ? ` (${a.values.map((x) => x.field).join(', ')})` : ''}`);
    }
  }
}

// ---- CLI ----

function readFiles(read, cards) {
  const out = { cards };
  for (const f of FILES) {
    const raw = read(f);
    out[f] = raw == null ? null : JSON.parse(raw);
  }
  return out;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}

async function main(argv) {
  const has = (f) => argv.includes(f);
  const bi = argv.indexOf('--base');
  let base = bi >= 0 ? argv[bi + 1] ?? '' : 'HEAD~1';
  const dryRun = has('--dry-run');
  if (has('--force') && !has('--all')) throw new Error('--force works only with --all.');
  let mode = has('--all') ? (has('--force') ? 'all-force' : 'all') : 'diff';
  const notes = [];

  const newFiles = readFiles((f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : null), readCards(ROOT));
  let oldFiles = {};
  if (mode === 'diff') {
    let valid = base && !/^0+$/.test(base);
    if (valid) { try { git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]); } catch { valid = false; } }
    if (!valid) {
      notes.push(`Base "${base || '(none)'}" not usable; running as --all (existing items left as they are).`);
      mode = 'all';
    } else {
      for (const f of FILES) {
        let raw = null;
        try { raw = git(['show', `${base}:${f}`]); } catch { raw = null; }
        try { oldFiles[f] = raw == null ? null : JSON.parse(raw); } catch { oldFiles[f] = null; notes.push(`${f} at ${base} is not valid JSON; treated as empty.`); }
      }
      let names = [];
      try { names = git(['ls-tree', '--name-only', `${base}:${CARDS_DIR}`]).split('\n').filter(Boolean); } catch { names = []; }
      oldFiles.cards = loadCards(names, (n) => { try { return git(['show', `${base}:${CARDS_DIR}/${n}`]); } catch { return null; } });
    }
  }

  const token = process.env.PROJECT_TOKEN || '';
  const owner = process.env.PROJECT_OWNER || '1Lev1user';
  const number = Number(process.env.PROJECT_NUMBER);
  if (!dryRun && !token) throw new Error('PROJECT_TOKEN is not set.');
  if (token && !(number > 0) && !dryRun) throw new Error('PROJECT_NUMBER is not set or not a number.');

  let gql = null, project = null, fields = null, boardItems = null;
  if (token && number > 0) {
    gql = makeClient(token, { delayMs: Number(process.env.BOARD_SYNC_DELAY_MS ?? 700) });
    project = await loadProject(gql, owner, number);
    fields = await loadFields(gql, project.id);
    boardItems = await loadItems(gql, project.id);
    console.log(`Project: ${project.title} (#${number}, ${boardItems.length} items, ${fields.length} fields)`);
  } else {
    notes.push('No PROJECT_TOKEN/PROJECT_NUMBER: plan from files alone (board and fields not read).');
  }

  const plan = planSync({ oldFiles, newFiles, boardItems, fields, mode });
  for (const n of notes) console.log(`Note: ${n}`);
  console.log(`Mode: ${mode}${mode === 'diff' ? ` (base ${base})` : ''}${dryRun ? ', dry run' : ''}`);
  if (plan.errors.length) {
    for (const e of plan.errors) console.error(`ERROR: ${e}`);
    return 1;
  }
  if (dryRun) for (const a of plan.actions) console.log(describe(a));
  else await execute(gql, project.id, plan.actions, fields);
  for (const w of plan.warnings) console.log(`WARNING: ${w}`);
  const s = plan.summary;
  const fieldsMade = plan.actions.filter((a) => a.type === 'createField').length;
  console.log(`Summary${dryRun ? ' (planned)' : ''}: created ${s.created}, updated ${s.updated}, skipped ${s.skipped}, warnings ${s.warnings}, fields created ${fieldsMade}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    const token = process.env.PROJECT_TOKEN;
    const msg = String(e?.message ?? e);
    console.error(`board-sync: ${token ? msg.split(token).join('***') : msg}`);
    process.exit(1);
  });
}
