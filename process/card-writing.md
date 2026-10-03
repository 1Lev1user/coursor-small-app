# Card writing

Claude (planner) only. One card is one story step slice that the owner can finish in Cursor in one sitting and Claude can check in one review.

## File
`cards/C-NNN.md`, the next free number. Frontmatter fields, all required except `slice`:

```
---
id: C-NNN
title: "Short imperative title"
story_step: S2.4
size: S | M | L
priority: P0 | P1 | P2
risk: low | medium | high
slice: 2            # optional
depends_on: []      # card ids
allowed_paths:      # folders end with /
  - src/views/month.js
  - test/entryUndo.test.js
test_edits: []      # existing test files the owner approved editing
---
```

Body sections, in this order: `## Goal`, `## Acceptance` (bullets), `## Do not touch`, `## Notes`.

No status field: the board holds the status. `npm run check:kit` rejects unknown fields.

## Classification
- Size S: one file area, about an hour, clear behaviour. M: several files, one module. L: cross-module; split it first.
- Risk high: payments, personal data, migrations, data format, publishing, security, irreversible actions.
- Priority: P0 fixes a break or blocks other cards; P1 is wanted next; P2 later.

## Acceptance
- Commands that exit 0 when the card is done, written as `` `command` exits 0 ``. `npm test` is always one of them.
- Manual checks start with "Manual (owner):" or "Manual (design-review):".
- No automatic check possible: write one first as its own card, or a manual check the reviewer can run.

## Allowed paths
- The smallest set of files or folders the card needs. CI enforces it on the pull request.
- Never planning or system files (cards/, process/, .claude/, CLAUDE.md, AGENTS.md, anchor.md, SPEC.md, STORYMAP.md, the check scripts and their workflows). `check:kit` rejects them.
- Finer limits ("lines 563-701 only") go under Do not touch as "Limit for `path`: ...".
- Existing tests are never editable unless the owner approved it; then list the file in `test_edits` and say so in Notes.

## Size guide
About 100 changed lines is a normal card; 1000 is too many. 200 lines in one file is fine; the same lines over 50 files are not (Google eng-practices, small CLs).

## UI cards
Acceptance includes the process/design-review.md checks: screenshots at 390, 768 and 1280 px, light and dark.

## Writing for the executor
The card must stand alone: Cursor sees only the repository. Give file and line references, function names, the exact messages, and what a test must assert. Label anything not checked in the code as unverified.

## Rejects
A card without a story step, acceptance or allowed paths, or with two unrelated goals, is not written.

## After writing
Add the story step to STORYMAP.md if it is new, run `npm run check:kit`, commit with the message `Plan: C-NNN title` straight to `main`, push. The board-sync Action creates the card in Backlog.
