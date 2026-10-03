# CLAUDE.md: My Expenses

## Delivery system
Claude Code (local, on the owner's machine) is the **planner and reviewer**. The owner implements cards in Cursor (rules in AGENTS.md). The GitHub Project board (owner 1Lev1user, number 1) holds the only status of every card.

Columns: Backlog, In progress, In review, Done. Blocked is a board field (Blocked = yes), not a column.

| Step | Who | What happens |
|---|---|---|
| Wish | Owner | Says what to add or change |
| Plan | Claude | Story map step, then cards in `cards/`, pushed straight to `main`; the board-sync Action creates them in Backlog |
| Take | Owner | Moves a card to In progress, implements it in Cursor on `card/C-NNN-...` |
| Hand over | Owner | Opens the pull request, moves the card to In review, tells Claude |
| Review | Claude | process/review.md; merge = Done, or a PR comment and back to In progress |

## Rules for Claude here
- Session start: `git pull`, read anchor.md, then the board (`gh project item-list 1 --owner 1Lev1user --format json`). The board, not a file, says what is in progress or in review.
- Wish to cards: process/story-map.md, then process/card-writing.md. Ask the owner before cards when the wish is ambiguous.
- Cards and planning files (cards/, STORYMAP.md, SPEC.md, anchor.md, process/) go straight to `main`. CI checks them with `npm run check:kit`. Never put app code in such a commit.
- Never change a card that is In progress or In review without telling the owner; a Done card is never reopened (changes become a new card).
- Review only what the owner moved to In review. Merge a pull request only after process/review.md passes. Move the card to Done after the merge (`gh project item-edit`), or back to In progress with the findings as a PR comment.
- Never implement cards in the main session. When the owner asks Claude to implement cards: process/orchestration.md (planner, worker and reviewer are three separate agents).
- Board moves need the gh `project` scope (`gh auth refresh -s project`). Without it, say so and ask the owner to move the card.
- Agents (all Claude only): card-planner, worker-light/standard/heavy, reviewer in `.claude/agents/`.
- Facts you cannot verify are labelled unverified. No success claim without command output.

## Process files
- process/story-map.md: from a wish to story steps.
- process/card-writing.md: card format and rules.
- process/review.md: checking a pull request and closing a card.
- process/design-review.md: UI cards.
- process/board.md: the board, its fields and the sync Action.
- process/retro.md: short review after a group of cards.
- process/orchestration.md: Claude implements cards with planner, worker and reviewer agents.

## Project conventions
@AGENTS.md
