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

CHECKPOINT 2 - 2026-10-03 (session paused by owner; work stops at the cards that are done)
Goal: finish all open work (Backlog, Approved, In progress, Review) card by card, then plan new tasks with the owner.
Steps done:
- agent-kit integrated, PR #4 merged to main (f69eb0b).
- Board sync Action live: 60 items on the owner's GitHub Project (number 1); updates verified on the real board.
- Slice 1 done on branch slice-1: C-001, C-002, C-003 Done (haiku workers, sonnet reviewers PASS, planner acceptance). npm test 374/374.
- PR #5 slice-1 -> main is open; the owner merges it.
- Draft cards for the 16 open RELEASE_PLAN items: CARD_DRAFTS.json (C-005..C-026) and CARD_DRAFTS.md (analysis; ids there are draft ids, add 1).
Current state:
- Roles: the cloud planner session executes cards with kit agents (one worker per card, then a reviewer); owner approves by moving Backlog -> Approved (Status option Ready renamed to Approved by owner; board-sync accepts both).
- Rule: a Done card is never reopened; changes become new Backlog cards.
- Backlog: C-004 (template test timezone), needs owner approval to edit test/templates.test.js.
Owner decisions taken 2026-10-03 (apply to CARD_DRAFTS before cards go to Backlog):
- A2 deploy gate: publish to v1 automatically on push to main after npm test passes (NOT manual workflow_dispatch; change draft C-006 accordingly).
- A5: one-button "Restore pre-update copy" in Settings > Backup (downloads current data first). Not on the Data problem screen.
- C6/C7: do not build MT940 or OFX parsers; only recognise them and show "export CSV or camt" (keep draft C-008; drop C-018..C-021; close P-C6/P-C7 as "Decision changed").
- D3: after 60 days without a backup the reminder cannot be snoozed (draft C-012, 60 days).
Open owner decisions (ask next session, recommended defaults in CARD_DRAFTS.md): E1 who regenerates the PDF; F1 version source; F2 undo after delete (toast 8 s, Month only); F3 keep noindex; F4 move PDF out of repo to a Release; R17 contrast method and chart colours; R20 keep typing EUR when the file has none; B6 import log record may stay after undo; C4 anonymised FiDAViSTA file; C-004 test edit approval; release version number.
Next step: answer the open decisions, move the adjusted drafts into feature_list.json as Backlog cards (with STORYMAP rows S1.3, S2.4, S3.6, S6.5, S6.6), owner approves, planner executes wave 1.
Unverified: token cost of the multi-agent run (/usage not available in the cloud session).

## Open questions
- Guide scripts dependencies undocumented (pypdf, reportlab, playwright).
- `npm run serve` calls `python`.
- Goal and actors to be confirmed by owner.
