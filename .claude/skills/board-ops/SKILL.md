---
name: board-ops
description: "Operate the kanban board: move cards, enforce WIP limits, keep feature_list.json and BOARD.md in sync, mirror to a GitHub Project. Lead only."
---

# Board operations

Source of truth: feature_list.json. BOARD.md is the readable view. The GitHub Project is a one-way mirror.

## Moving a card
1. Check preconditions for the target column (Ready needs a complete card; Verify needs DONE from a worker; Done needs all four completion levels).
2. Check WIP: 3 in In progress, 2 in Review. Do not start new work above the limit; finish work first.
3. Check conflicts: cards with overlapping allowed_paths do not run in parallel. Parallel cards run in isolation: worktree.
4. Update feature_list.json, then regenerate the card lists in BOARD.md, then append to claude-progress.txt.

## Pull order
Priority first (P0, P1, P2), then the oldest work item age.

## Attempts
Append each attempt to the card: tier, result, error text. Respect the ceiling per start tier (haiku 6, sonnet 4, opus 2). After the ceiling set Blocked and ask the user.

## Metrics
At slice end update the metrics table: cards started per tier, passed on first try, escalated. Use them to adjust the start tier rules.

## GitHub Project mirror (one way, file to GitHub)
Created once per project with scripts/gh-board-setup.sh. The project number and owner are recorded in SPEC.md under "Board mirror". Fields: Stage, Priority, Size, Risk, Start tier, Current tier, Card ID, Story step, Depends on, Slice, Attempts. The built-in Status field is not used.

Sync with the gh CLI (needs the project scope):
- New card: `gh project item-create <number> --owner <owner> --title "C-014 title" --body "<acceptance>" --format json`, keep the returned item id in the card as `mirror_id` in feature_list.json.
- Change a field: look up ids with `gh project field-list <number> --owner <owner> --format json` and `gh project view <number> --owner <owner> --format json` (project id), then `gh project item-edit --id <mirror_id> --project-id <project-id> --field-id <field-id> --single-select-option-id <option-id>`. One field per call.
- Never read card state back from GitHub into the board. If they differ, the file wins.
- If gh is not logged in or lacks the project scope, skip the mirror, say so once, and continue with files only.

## Hygiene
Card in In progress for more than 2 sessions: review it, split it, or block it.
