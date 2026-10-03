---
name: board-ops
description: "Operate the kanban board: move cards, enforce WIP limits, keep feature_list.json and BOARD.md in sync, mirror to a GitHub Project. Planner and lead, each on its own columns."
---

# Board operations

Source of truth: feature_list.json. BOARD.md is the readable view. The GitHub Project is a one-way mirror.

## Who moves which column
- Planner: creates cards in Backlog, sets priority, size, risk and start_tier, moves Backlog to Ready, moves Review to Done after Level 4.
- Lead: Ready to In progress, In progress to Verify, Verify to Review after Levels 1 to 3, any of these to Blocked. Writes attempts and evidence. Never creates cards, never sets Done.
- One side writes the state files at a time. Run `git pull` before starting, push when done.

## Moving a card
1. Check preconditions for the target column (Ready needs a complete card; Verify needs DONE from a worker; Review needs Levels 1 to 3; Done needs Level 4 by the planner).
2. Check WIP: 3 in In progress, 2 in Review. Do not start new work above the limit; finish work first.
3. Check conflicts: cards with overlapping allowed_paths do not run in parallel. Parallel cards run in isolation: worktree.
4. Update feature_list.json, then regenerate the card lists in BOARD.md, then append to claude-progress.txt.

## Pull order
Priority first (P0, P1, P2), then the oldest work item age.

## Attempts
Append each attempt to the card: tier, result, error text. Respect the ceiling per start tier (haiku 6, sonnet 4, opus 2). After the ceiling set Blocked and ask the user.

## Metrics
At slice end update the metrics table: cards started per tier, passed on first try, escalated. The planner uses them to adjust the start tier rules.

## GitHub Project mirror (one way, file to GitHub)
Primary: the Board sync Action (.github/workflows/board-sync.yml, scripts/board-sync.mjs) mirrors feature_list.json, PROJECT_MAP.json and RELEASE_PLAN.json on every push that changes them. The project number and owner are recorded in SPEC.md under "Board mirror".
- Planner and lead move cards by editing the files and pushing. Nobody needs GitHub Projects access in the session.
- The owner may move cards by hand on the board and tells the planner, who writes the move into the files. The Action touches only items whose synced values changed in the push, so manual moves are never overwritten.
- Manual run (Actions > Board sync): `all` creates missing items and leaves existing ones; `all-force` resets existing items to the files; `diff` syncs the last commit.
- Fallback without the Action: scripts/gh-board-attach.sh (fields) and scripts/gh-board-map.sh (map cards) with the gh CLI and the project scope.

Column field: the built-in Status (Backlog, Ready, In progress, In review, Done). Mapping from feature_list.json status: backlog to Backlog, ready to Ready, in_progress and verify to In progress, review to In review, done to Done. blocked keeps the current Status and sets Blocked=yes; Blocked is cleared when unblocked. A project made with gh-board-setup.sh uses a Stage field instead and is not synced by the Action.

Items (matched by the title prefix, e.g. "C-001"; draft issues; never deleted or archived; items with other prefixes are never touched):
- Work cards from feature_list.json: Kind=Work, Card ID, Story step, Priority, Size, Risk, Start tier, Current tier, Attempts, Depends on, Slice.
- Map cards from PROJECT_MAP.json: Kind=Map, Status=Done, Activity, Story step, Files. Not work: the work view filters them out with `-kind:Map`.
- Plan items from RELEASE_PLAN.json: Kind=Plan, Status=board_status, Release, Story step, Progress. Not work: filter with `-kind:Plan`.
- Owner rule (2026-10-03): a card in Done is never reopened. Any change to done work becomes a new Backlog card or item that references the original (`follow_up_of` for plan items, `depends_on` or the title for cards).
- Never read card state back from GitHub into the files. The Action report (created, updated, skipped, warnings) is in the workflow run log.

## Hygiene
Card in In progress for more than 2 sessions: review it, split it, or block it.
