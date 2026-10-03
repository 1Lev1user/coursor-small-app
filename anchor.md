# Anchor: My Expenses

Context persistence file. Read at the start of every session and after every compaction.

## Goal
My Expenses lets one person track EUR expenses and income on their phone, plan the month, import bank statements and keep backups, with all data kept on the device [inferred from README]. Owner to confirm.

## Constraints
- Local-only data, no accounts, no cloud sync, no server.
- No npm dependencies; Node 22; plain ES modules, no build step.
- PWA, offline via sw.js; version in package.json and sw.js raised together.
- Live site from branch `v1` (shipped files only); work goes to `main` first.
- Budgets always EUR.
- Rights reserved.

## Decisions log
- 2026-10-03: D1, card C-001 may edit test/importCore.test.js only (add `now: NOW` to three buildImport calls). Reason: the defect is in the test, not the app.
- 2026-10-03: D2, slice 1 = C-001, C-002, C-003.
- 2026-10-03: D3, kit check is a separate script `npm run check:kit`, not inside `npm test`. Reason: app tests stay about the app.
- 2026-10-03: agent-kit integrated on branch claude/compassionate-wright-rg71w2.
- 2026-10-03: existing GitHub Project of the owner used as a one-way mirror (BOARD.md to GitHub).
- 2026-10-03: release plan items go on the board as Kind=Plan (source RELEASE_PLAN.json), with audited status mapping: done to Done, partial to In progress, not_started to Backlog, changed to Done with note "Decision changed". Not counted in WIP or metrics.
- 2026-10-03: a card in Done is never reopened. Any change to done work becomes a new Backlog card that references the original.
- 2026-10-03: roles: planner (creates and prioritises cards, sets Done after Level 4) and lead (runs cards through In progress, Verify, Review). Board column = the existing Status field of the GitHub Project.

## Progress
CHECKPOINT 1 - 2026-10-03
Goal: slice 1, import stays trustworthy (date-independent import tests, past-month plan rule and CSV quoting guarded by tests).
Steps done: agent-kit integrated; state files filled; cards C-001..C-003 written.
Current state: baseline `npm test` 355 tests, 352 pass, 3 fail (test/importCore.test.js lines 495, 538, 613; date-dependent).
Next step: owner runs `claude --agent lead`, slice 1.
Unverified: product goal and actors (inferred); DESIGN.md brief (inferred); GitHub Project number not filled.

## Open questions
- Guide scripts dependencies undocumented (pypdf, reportlab, playwright).
- `npm run serve` calls `python`.
- Goal and actors to be confirmed by owner.
