# Board

The GitHub Project '@1Lev1user's Expenses app project' (owner 1Lev1user, number 1) is the only place where a card's status lives.

## Columns (built-in Status field)
| Column | Who moves a card here | When |
|---|---|---|
| Backlog | board-sync Action | a new card file reached `main` |
| In progress | owner | he starts the card in Cursor; also Claude, when a review returns it |
| In review | owner | the pull request is open |
| Done | Claude | after the merge (process/review.md) |

- Blocked is a field (Blocked = yes) on any column, with the reason as a PR or item comment.
- Agent is a text field: which agent works on the card right now (process/orchestration.md). Board-only, never synced.
- An old Status option such as Ready or Approved may stay on the board; nothing uses it. The owner can delete it in Project settings > Status.
- Pull order for the owner: priority (P0, P1, P2), then cards others depend on.
- Hygiene: a card In progress for more than a week gets split or blocked.

## Sync Action (files to board, text only)
`.github/workflows/board-sync.yml` runs `scripts/board-sync.mjs` on every push to `main` that changes cards/, PROJECT_MAP.json or RELEASE_PLAN.json.
- New card file: creates a draft item with Status = Backlog and the fields Kind=Work, Card ID, Story step, Priority, Size, Risk, Depends on, Slice.
- Changed card file: updates the item title, body and fields. **It never changes Status**, so board moves are never overwritten.
- PROJECT_MAP.json: Kind=Map items (existing features), created in Done. RELEASE_PLAN.json: Kind=Plan items, created with their audited status.
- Items are matched by the title prefix (C-001, M-S1.1, P-A2). Items with other prefixes are never touched. Nothing is deleted or archived.
- Manual run (Actions > Board sync): `all` creates missing items; `all-force` also rewrites text and fields of existing ones (still never Status); `diff` syncs the last commit.
- Needs the repository secret PROJECT_TOKEN (project scope).
- Fields that are no longer synced (Start tier, Current tier, Attempts) can be deleted in Project settings.

## Reading and moving from Claude's session
- Read: `gh project item-list 1 --owner 1Lev1user --format json --limit 500`.
- Move: `gh project item-edit --project-id <id> --id <item id> --field-id <Status field id> --single-select-option-id <option id>`; ids from `gh project view 1 --owner 1Lev1user --format json` and `gh project field-list 1 --owner 1Lev1user --format json`.
- Needs the gh `project` scope on the owner's machine (`gh auth refresh -s project`).
