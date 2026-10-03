# MIGRATION_REPORT: agent-kit into My Expenses

Date: 2026-10-03. Branch: `claude/compassionate-wright-rg71w2` (9 commits, 33 files, +1690/-1). Plan: MIGRATION_PLAN.md (approved, D1-D3).

## Result
agent-kit is integrated. App code, tests, CI and shipped files are unchanged. Checks are equal to the baseline.

## Checks before and after
| Check | Before | After |
|---|---|---|
| `npm test` | 355 tests, 352 pass, 3 fail (importCore.test.js 495, 538, 613) | same: 352 pass, same 3 fail |
| `FROZEN_DATE=2026-09-25 node --import ./scripts/frozen-date.mjs --test` | not available | 355 pass, 0 fail (proves the 3 failures are date-dependent tests, not app bugs) |
| `npm run check:kit` | not available | OK (446 checks) |
| `bash -n` on scripts/gh-board-*.sh | n/a | exit 0 |

The 3 failures are card C-001 (slice 1), not a migration regression.

## What changed
- `.claude/agents` (7) and `.claude/skills` (10): kit as shipped, plus:
  - design-review skill (WCAG 2.2 thresholds, 3 screenshot widths, review order);
  - big-project rules in lead, card-writing, slice-retro and completion-check;
  - D1 test-edit exception in every worker, reviewer and check rule;
  - planner/lead role split;
  - reviewer maxTurns raised from 15 to 30.
- `CLAUDE.md` (37 lines): kit block, role split and project conventions from README.
- State files at the root:
  - SPEC.md;
  - STORYMAP.md (6 activities, 21 steps);
  - BOARD.md;
  - feature_list.json (C-001 to C-003);
  - anchor.md;
  - claude-progress.txt;
  - DESIGN.md (brief, inferred, owner to confirm);
  - PROJECT_MAP.json (19 existing features with UI path, files and tests).
- Scripts:
  - `gh-board-setup.sh`: kit, plus the Kind field;
  - `gh-board-attach.sh`: kit fields for an existing project, using its Status column;
  - `gh-board-map.sh`: map cards as Kind=Map, Status=Done;
  - `check-kit.mjs`;
  - `frozen-date.mjs`.
- `package.json`: added `check:kit` script only.
- Moved to `_removed/`: nothing (all inventory items KEEP).

## Decisions taken during the migration (owner, 2026-10-03)
- D1: C-001 may edit test/importCore.test.js only. D2: slice 1 = C-001, C-002, C-003. D3: kit check is a separate script.
- Map cards for existing features (PROJECT_MAP.json) with Kind=Map and a separate Map view.
- Roles:
  - Planner (cloud orchestrator session with the owner): cards, priority, size, Level 4 acceptance, Done.
  - Lead (`claude --agent lead` on the owner's Windows machine): executes Ready cards up to Review.
- Mirror uses the existing project's Status column (Backlog, Ready, In progress, In review, Done) plus a Blocked flag.
- Migration goes to main by pull request; slices run on `slice-N` branches from main.

## Fresh-context review
- Reviewer: Opus, read-only. First verdict FAIL with 7 findings, all fixed:
  1. D1 exception missing from the worker files.
  2. C-001 had no frozen-date check.
  3. C-003 duplicated existing tests (narrowed).
  4. C-002 and C-003 checks passed on empty files.
  5. gh field-list had no limit.
  6. setup.sh had no Kind field.
  7. MIGRATION_PLAN.md status was out of date.
- No second full review was run after the fixes. Covered instead by check-kit, `npm test` and `bash -n`.

## Unverified
- gh scripts were tested only against a fake `gh`, never against the real GitHub Project. The project's fields (Priority, Size options) are unverified.
- Whether `claude --agent lead` runs the main session on Opus: not confirmed in docs. Check with `/status` at start.
- Real token cost of the multi-agent setup: not measured. Check `/usage` after slice 1.
- DESIGN.md content is inferred from style.css and needs owner confirmation.

## Open questions
- Goal and actors in SPEC.md: owner to confirm (integration step 4).
- Guide scripts dependencies (pypdf, reportlab, playwright) undocumented; `npm run serve` calls `python`.

## Board sync (added 2026-10-03)
- First real run of `.github/workflows/board-sync.yml` (run 37110338226): created 60 items (3 Work, 19 Map, 38 Plan), 14 fields, 0 warnings.
- Not yet verified: diff-mode update of an existing card on the real board (first card move will test it).
