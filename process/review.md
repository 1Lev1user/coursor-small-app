# Review: from In review to Done

Claude (planner) only. Nothing is Done on anyone's word. Evidence is command output.

## Start
1. Read the board: which cards are In review. Review only those.
2. Find the pull request: branch `card/C-NNN-...`, title `C-NNN: ...` (`gh pr list --head card/C-NNN`). No pull request: ask the owner.
3. Check out the branch in a separate worktree (`git worktree add`), never in the owner's checkout.

## Level 1: checks
- CI on the pull request is green: `npm test`, `npm run check:kit`, `check:card`.
- Run every acceptance command of the card yourself. Record command and exit code.

## Level 2: scope
- `check:card` passed: every changed file is inside `allowed_paths`, no existing test changed unless listed in `test_edits`.
- Read the diff for things the guard cannot see: secrets, new dependencies, network calls (data stays on the device), changes outside a "Limit for" line.

## Level 3: fresh-context review
Spawn `.claude/agents/reviewer.md` with the card file path, the branch and the base. Sonnet by default; pass model opus when the card risk is high. It flags only correctness problems and requirement gaps. PASS is required.

## Level 4: acceptance
- Does the change satisfy the card Goal and its story step in STORYMAP.md?
- UI card: process/design-review.md; the owner has checked the screenshots.
- Manual items: the owner confirmed them in the pull request.

## Close
- All levels pass: merge the pull request (squash, title `C-NNN: title`), delete the branch, move the card to Done on the board, add a line to claude-progress.txt.
- Any level fails: one PR comment with numbered findings (file:line, what is wrong, why it matters), move the card back to In progress, tell the owner.
- A problem found later in Done work becomes a new card. Done is never reopened.

## Report to the owner
RESULT (merged or returned), EVIDENCE (commands and exit codes), FINDINGS if any, UNVERIFIED if any. Five lines or fewer.
