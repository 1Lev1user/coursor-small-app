# AGENTS.md: My Expenses

Rules for the agent that implements cards (Cursor). The planner and reviewer (Claude Code) follow CLAUDE.md, which imports the project conventions below.

## How work flows
1. The owner takes a card from the board (GitHub Project, column Backlog) and moves it to **In progress**.
2. You implement that one card on branch `card/C-NNN-short-name`, created from an up-to-date `main`.
3. You open a pull request titled `C-NNN: <card title>` into `main`. The owner moves the card to **In review**.
4. The planner reviews and merges (Done) or comments and moves the card back to In progress.

## Rules for implementing a card
- The card is the file `cards/C-NNN.md`. Read all of it first: Goal, Acceptance, Do not touch, Notes, `allowed_paths`, `test_edits`.
- One card per branch and per pull request. No work without a card.
- Edit only files under `allowed_paths` (a path ending in `/` means that folder). CI fails the pull request otherwise (`scripts/check-card.mjs`).
- Never edit, rename or delete an existing test, unless the card lists that file in `test_edits`. You may add new test files inside `allowed_paths`.
- Never edit planning files: `cards/`, `process/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`, `anchor.md`, `SPEC.md`, `STORYMAP.md`, and the check scripts and workflows. If the card looks wrong, stop and tell the owner; the planner changes the card.
- Write the smallest change that meets the acceptance list. No extra features, no unrelated refactors or renames, no new dependencies.
- Run every acceptance command and `npm test` before opening the pull request. Paste the real output tail into the pull request description, with the exit codes.
- Manual acceptance items (marked Manual) are for the owner. List them in the pull request description as unchecked boxes.
- Something irreversible, a secret, or data outside the repository: stop and ask the owner.
- Do not move cards on the board and do not merge. The owner moves cards; the planner merges.
- Skills and subagents under `.claude/` and `~/.claude/` belong to the Claude planner. Do not use them here.

## Project conventions (everyone)
- Tests: `npm test` runs all tests (`node --test`, Node 22, no packages to install). GitHub runs them on every push and pull request.
- System checks: `npm run check:kit` (cards and rule files) and `npm run check:card -- --base origin/main` (the card guard, also run by CI on pull requests).
- Release: raise `version` in package.json and `VERSION` in sw.js together. test/serviceWorker.test.js fails if they differ or if a file in `src/` or `fonts/` is missing from `CORE_ASSETS` in sw.js.
- Data format change: raise `SCHEMA_VERSION` in src/model.js and add one step to `MIGRATIONS` that lifts the previous version by exactly one, with a test.
- Branches: the live site is published from branch `v1`, which holds only shipped files. Work goes to `main` first.
- Design: colours, fonts, radii and motion are design tokens at the top of style.css, with the dark theme below them. No raw colours outside tokens. See DESIGN.md and process/design-review.md.
- Data stays on the device: no network calls, no accounts, no analytics.
- Tests that depend on dates pass a fixed `now` (for example `buildImport(..., { now: NOW })`).
- Commands with `TZ=...`: on Windows run them from PowerShell (`$env:TZ='...'`); Git Bash does not pass TZ to Node.
- Planning and rule files (cards/, process/, CLAUDE.md, AGENTS.md, anchor.md, SPEC.md, STORYMAP.md, DESIGN.md) are not shipped to `v1`.
