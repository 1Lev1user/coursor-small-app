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
- 2026-10-03: D1, card C-001 may edit test/importCore.test.js (add `now: NOW` to three buildImport calls). Reason: the defect is in the test, not the app.
- 2026-10-03: D3, the system check is a separate script `npm run check:kit`, not inside `npm test`. Reason: app tests stay about the app.
- 2026-10-03: delivery system: the owner implements cards in Cursor (AGENTS.md); Claude Code on the owner's machine plans (wish to cards) and reviews (In review to Done or back). Claude implements a card only when the owner asks for that card.
- 2026-10-03: the GitHub Project Status column is the only status source. Columns Backlog, In progress, In review, Done; Blocked is a field. Cards are files cards/C-NNN.md without a status; board-sync creates items in Backlog and never changes Status.
- 2026-10-03: one card = branch card/C-NNN-... + pull request; CI runs check:card on pull requests. Planning files go straight to main.
- 2026-10-03: delivery system = agent-kit 2.0.0; master copy in claude-code-setup/agent-kit (README there: install and update).
- 2026-10-03: release plan items stay on the board as Kind=Plan (RELEASE_PLAN.json); existing features as Kind=Map (PROJECT_MAP.json).
- 2026-10-03: a card in Done is never reopened. Any change to done work becomes a new card that references the original.
- 2026-10-03: owner decisions for slice 2: A2 publish to v1 automatically on push to main after npm test; A5 one-button restore of the pre-update copy in Settings > Backup, current data downloaded first; C6/C7 no MT940/OFX parsers, only recognise them (P-C6/P-C7 "Decision changed"); D3 no snooze after 60 days without a backup; E1 the owner regenerates the PDF on his machine; F1 package.json is the version source, `npm version` syncs sw.js; F2 Undo toast 8 s, Month only, confirm step stays; F3 keep noindex; F4 the PDF leaves the repository for a GitHub Release asset; R17 automated token contrast test plus screenshots, light chart colours accepted; R20 typing EUR by hand stays; B6 the import log record may stay after undo; C4 the owner exports an anonymised FiDAViSTA file; C-004 may edit test/templates.test.js; release 2.1.0.

- 2026-10-04: version 3.0 started; release 2.1.0 postponed and merged into 3.0. 3.0 owner decisions: current balance entered once and carried over month to month (editable); income on payday instead of from the 1st; salary may differ each month (forecast vs actual); several incomes per month; clearer Settings. Bank import: fixes after the owner's sample file (real bank format, made-up data). Playwright download approved; the user guide is redone in the execution phase (C-013, C-014).
- 2026-10-04: 3.0 research by agents (code analysis, comparable apps, three exploratory testers, bank analysis with independent verification) in research/3.0/; cards C-029 to C-069 drafted from it, waiting for owner approval and the open decisions listed in research/3.0/cards-*.md.

## Progress
CHECKPOINT 3 - 2026-10-03
Goal: the owner states wishes, Claude writes cards, the owner implements in Cursor and moves cards to In review, Claude reviews and closes.
Steps done: slice 1 (C-001 to C-003) done in PR #5; delivery system rebuilt for the Cursor flow (AGENTS.md, CLAUDE.md, process/, cards/, check-card guard in CI, board-sync text-only); slice 2 cards C-004 to C-026 written from the release plan and the owner decisions (C-016 and C-018 to C-021 dropped by decisions R17 and C6/C7).
Current state: `npm test` and `npm run check:kit` pass. Board: old Ready/Approved option and the fields Start tier, Current tier, Attempts are unused and may be deleted by the owner.
Next step: the owner takes the first card (suggested: C-004, then C-009, C-011, C-012, C-015, C-017, C-024).
Unverified: C-010 waits for the owner's anonymised FiDAViSTA file (set Blocked = yes on the board).

## Open questions
- Guide scripts dependencies undocumented (pypdf, reportlab, playwright).
- `npm run serve` calls `python`.
- Goal and actors to be confirmed by owner.
