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
Fields are created by scripts/gh-board-setup.sh for a new project or scripts/gh-board-attach.sh for an existing one. The lead keeps the mirror in sync. The project number and owner are recorded in SPEC.md under "Board mirror".

Column field:
- Existing template project (this one): the built-in Status field, options Backlog, Ready, In progress, In review, Done. Mapping from feature_list.json status: backlog to Backlog, ready to Ready, in_progress and verify to In progress, review to In review, done to Done. blocked keeps the current Status and sets the single select Blocked=yes; clear Blocked when unblocked.
- Project made with gh-board-setup.sh: the Stage field (Backlog, Ready, In progress, Verify, Review, Done, Blocked), Status is not used.

Other fields: Kind (Map, Work), Blocked (yes), Priority, Size, Risk, Start tier, Current tier, Card ID, Story step, Depends on, Slice, Attempts. Priority and Size may be the template's own fields; attach only warns if options are missing.

Sync with the gh CLI (needs the project scope):
- New card: `gh project item-create <number> --owner <owner> --title "C-014 title" --body "<acceptance>" --format json`, keep the returned item id in the card as `mirror_id` in feature_list.json.
- Change a field: look up ids with `gh project field-list <number> --owner <owner> --format json` and `gh project view <number> --owner <owner> --format json` (project id), then `gh project item-edit --id <mirror_id> --project-id <project-id> --field-id <field-id> --single-select-option-id <option-id>`. One field per call.
- Kind field: every work card gets Kind=Work.
- Map cards (Kind=Map, Status=Done or Stage=Done, one per existing feature) come from PROJECT_MAP.json via `scripts/gh-board-map.sh <number>`. They are not work: not counted in metrics or WIP, and the work view filters them out with `-kind:Map`.
- Never read card state back from GitHub into the board. If they differ, the file wins.
- If gh is not logged in or lacks the project scope, skip the mirror, say so once, and continue with files only.

## Hygiene
Card in In progress for more than 2 sessions: review it, split it, or block it.
