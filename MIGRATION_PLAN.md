# MIGRATION_PLAN: agent-kit into My Expenses (coursor-small-app)

Status: approved by the owner on 2026-10-03 (D1, D2, D3 approved). Applied on branch claude/compassionate-wright-rg71w2; results in MIGRATION_REPORT.md.
Branch: `claude/compassionate-wright-rg71w2` (rollback = do not merge it; `main` stays untouched).
Date: 2026-10-03.

## Baseline (step 1)
- `npm test` (Node 22.22.0): 355 tests, 352 pass, 3 fail.
- Failing: `test/importCore.test.js` lines 495, 538, 613.
- Root cause (verified): the three tests call `buildImport` without `now` (test lines 512, 548, 617), so it uses today's date. Their rows are dated 2026-09; since 2026-10-01 September is a past month without a plan, so `applyImport` correctly refuses with "Choose a plan for 2026-09." (`src/import/core.js` 317-332, ~600-612). With the date frozen at 2026-09-25 the full suite passes 355/355. The app code is correct; the tests are date-dependent.
- No lint, no typecheck, no build step. CI: `.github/workflows/test.yml` runs `npm test` on push and pull_request.
- No existing CLAUDE.md, AGENTS.md, .claude/, .cursor/ or .superpowers/ in the tree. History: process docs (`docs/spec.md`, `docs/superpowers/...`) were removed on 2026-09-05 (commits 579c8f3, cdd20a3).

## Classification (step 2)
| Item | Decision | Reason and evidence |
|---|---|---|
| `src/` (about 20k lines), `index.html`, `style.css`, `sw.js`, `manifest.json`, `icons/`, `fonts/` | KEEP | Shipped app. No change in migration. |
| `test/` (26 files) | KEEP | Project checks. Fix of 3 tests goes through the board as card C-001, not in migration. |
| `.github/workflows/test.yml` | KEEP | Only CI, runs `npm test`. |
| `README.md` | KEEP | Its "Development" rules are copied into CLAUDE.md as project conventions. |
| `docs/` (user guide PDF, 13 PNG) | KEEP | User documentation. |
| `scripts/build_user_guide_pdf.py`, `scripts/capture_guide_screens.js` | KEEP | Guide tooling. Undocumented dependencies (pypdf, reportlab, playwright) recorded as an open question, not fixed now. |
| `.gitignore` line `.superpowers/` | KEEP | Unreferenced (grep), but harmless; it stops a local plugin folder from being committed. |
| `src/import/types.js:13` export `FORMATS` | KEEP | Only fully unused export (grep). Removing code is a card for a later slice, not migration. |
| 15 exports used only inside their own module | KEEP | Not dead code; only the `export` keyword is unneeded. |
| agent-kit `.claude/agents` (7) and `.claude/skills` (9) | ADD | Delivery system. |
| agent-kit templates (anchor.md, SPEC.md, STORYMAP.md, BOARD.md, feature_list.json, claude-progress.txt) | ADD at root | State files. Not shipped: the live site is built from branch `v1`. |
| `CLAUDE.block.md` | MERGE into new `CLAUDE.md` | Plus project rules from README (version pair, SCHEMA_VERSION, sw.js cache list, `v1` branch, design tokens). Under 200 lines. |
| `scripts/gh-board-setup.sh` | ADD | Kept for new projects. |
| New `scripts/gh-board-attach.sh` | ADD | Adds kit fields to the owner's existing GitHub Project by number. |
| Kit README, prompts/integration.md, INSTALL-EXTERNAL.md | NOT COPIED | Kit sources stay in agent-kit.zip; CLAUDE.md carries what agents need. |

## Additions from the "big project" document (gaps in the kit)
1. New skill `design-review`: brief goals, squint test, NN/g 10 heuristics, objective thresholds (WCAG 2.2 AA contrast 4.5:1 and 3:1, non-text 3:1, target 24x24 CSS px, reflow at 320 px, Core Web Vitals), screenshots at 3 widths for UI cards.
2. New `DESIGN.md`: half-page design brief. Drafted from style.css tokens ("Direction C, Colour blocks"), marked inferred; owner confirms.
3. card-writing: UI cards need design-review acceptance; card target about 100 changed lines.
4. slice-retro: end-to-end run of the whole slice, `/usage` check, slice not longer than one week.
5. lead: `/clear` between cards; two corrections on one point means `/clear` and a sharper card; reviewer model not weaker than the worker that wrote the card.
6. CLAUDE.md line limit 200, enforced by the kit check script.

## Model reconstruction (step 4, after approval)
- SPEC.md: goal, actors (owner as sole user and developer), out of scope (accounts, cloud sync), constraints (local-only, no dependencies, Node 22, `v1` publish branch), Definition of Done (`npm test` exits 0).
- STORYMAP.md: backbone from README (set up, add, review month, import statement, back up, update).
- feature_list.json, slice 1 (proposed):
  - C-001 Make 3 import tests date-independent. S, low, haiku. Allowed path `test/importCore.test.js` only. Exception to "never edit existing tests" needed (see D1). Acceptance: `npm test` exits 0, and the suite passes with the date frozen to a later month.
  - C-002 Regression test: import into a past month without a plan choice is refused with "Choose a plan for <month>." S, low, haiku. New test file only.
  - C-003 Tests for CSV field quoting (`escapeField`, delimiter, quote, newline, Europe and Standard formats). S, low, haiku. New test file only. Narrowed after review to "Direct tests for escapeField edge cases" (carriage return, delimiter for ',' and ';', unchanged plain value, spaces): `test/csv.test.js` already covers quotes, newline and both flavours.
- Added after approval at owner request: PROJECT_MAP.json (19 existing features) and scripts/gh-board-map.sh (Kind=Map cards).

## Order of changes (step 5, one commit each)
1. Copy `.claude/agents` and `.claude/skills` unchanged.
2. Kit additions from the big-project document.
3. CLAUDE.md.
4. State files: anchor.md, SPEC.md, STORYMAP.md, BOARD.md, feature_list.json, claude-progress.txt, DESIGN.md.
5. Scripts: gh-board-setup.sh, gh-board-attach.sh, `scripts/check-kit.mjs` (structure check, no dependencies; `npm run check:kit`).
6. MIGRATION_REPORT.md.
After each commit: `npm test` (must stay 352/355 pass) and `npm run check:kit` once it exists.

## Verification (step 6)
- `npm test` equal to baseline: 352 pass, the same 3 fail (fixed later by C-001 on the owner's machine).
- `npm run check:kit`: agent frontmatter fields, skills referenced by agents exist, feature_list.json is valid JSON with required card fields, CLAUDE.md under 200 lines.
- Agent frontmatter fields checked against current Claude Code documentation.

## Risks
- Real token use of the multi-agent setup is not measured. Check `/usage` after slice 1.
- The GitHub Project cannot be seen from the cloud session; mirror sync runs only from the owner's machine with `gh` and the project scope.
- Haiku first-pass rate unknown; the 70 percent threshold is an assumption.

## Decisions needed
- D1 (Approved): allow C-001 to edit `test/importCore.test.js` (only adding `now` to three calls). Recommended: yes, because the defect is in the test.
- D2 (Approved): slice 1 = C-001, C-002, C-003. Recommended: yes.
- D3 (Approved): kit check as a separate script, not inside `npm test`. Recommended: yes, so app tests stay about the app.

## Open questions
- Python and Playwright dependencies of the guide scripts are undocumented (later card).
- `npm run serve` calls `python`, which is `python3` on many Linux and macOS machines.
