# CLAUDE.md: My Expenses

## Delivery system (agent-kit)

This project is delivered by a lead agent (Opus) and worker agents. Start every session with `claude --agent lead`. This is the only supported way, because it pins the lead to Opus.

Files that carry state across sessions (read at session start, in this order): anchor.md, SPEC.md, STORYMAP.md, BOARD.md, feature_list.json, claude-progress.txt.

Rules for every agent:
- Think first (think-first skill): goal, options including ones the request did not name, recommendation, then act. Out-of-scope options are proposed, not built.
- Short replies (terse skill). Explain or detail only when the user asks.
- Work only on a card. No card, no edit. Cards live in feature_list.json.
- Edit only the card allowed_paths. Never edit or delete existing tests to make checks pass.
  - Exception: a card may edit an existing test only when its allowed_paths and forbidden fields name that test file explicitly and the owner approved it (decision D1, 2026-10-03).
- Only the lead writes BOARD.md and feature_list.json and sets Done.
- Never claim success without command output.
- Irreversible actions (delete, force-push, secrets, production data) go to the user first.
- Unverified facts are labelled as unverified. Do not invent numbers, sources or API details.

Routing: S + low risk + automatic check goes to Haiku; M or L goes to Sonnet; high risk or architecture goes to Opus. Escalation ladder Haiku, Sonnet, Opus; 2 attempts per tier; ceiling 6 / 4 / 2 by start tier; then Blocked and a question to the user.

Long runs: set a goal with /goal, for example "All cards of slice 1 are in Done in BOARD.md, <test command> exits 0, or stop after 40 turns." Use auto mode for unattended runs.

## Project conventions

Source: README.md "Development" section, unless marked [inferred].

- Tests: `npm test` runs all tests (`node --test`, Node 22, no packages to install). GitHub runs them on every push and pull request.
- Kit check: `npm run check:kit` (separate from `npm test`, decision D3).
- Release: raise `version` in package.json and `VERSION` in sw.js together. test/serviceWorker.test.js fails if they differ or if a file in `src/` or `fonts/` is missing from `CORE_ASSETS` in sw.js.
- Data format change: raise `SCHEMA_VERSION` in src/model.js and add one step to `MIGRATIONS` that lifts the previous version by exactly one, with a test.
- Branches: the live site is published from branch `v1`, which holds only shipped files. Work goes to `main` first.
- Design: colours, fonts, radii and motion are design tokens at the top of style.css, with the dark theme below them. No raw colours outside tokens [inferred]. See DESIGN.md and the design-review skill.
- Data stays on the device: no network calls, no accounts, no analytics [inferred from README "Data stays on your device"].
- State files at the root (anchor.md, SPEC.md, STORYMAP.md, BOARD.md, feature_list.json, claude-progress.txt, DESIGN.md, CLAUDE.md) are not shipped to `v1`.
- Tests that depend on dates must pass a fixed `now` (for example `buildImport(..., { now: NOW })`). Lesson from C-001.
