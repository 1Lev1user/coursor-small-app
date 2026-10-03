---
name: completion-check
description: "Four-level verification before a card or slice is marked Done. Use at Verify and Review stages. Lead only sets Done."
---

# Completion check

Nothing is Done on a worker's word. Evidence is command output.

## Level 1: commands
Run the card acceptance commands and the project checks from SPEC.md (types, lint, build, tests). Record command, exit code, output tail in the card evidence field. Any non-zero exit means fail.

## Level 2: tamper guard
- `git diff <base>...<card-branch> --name-only`: every file must be under allowed_paths.
- No existing test file edited, renamed or deleted. No lockfile, CI or secret change unless the card allows it.
- Any violation fails the card and counts as an attempt.

## Level 3: fresh-context review
Spawn the reviewer agent (Sonnet; Opus when risk is high) with card, branch, base. The reviewer flags only correctness problems and requirement gaps. PASS is required. FAIL findings go back to the next attempt as error text.

## Level 4: lead acceptance
- Card: does it satisfy its story step in STORYMAP.md? Is the value for the actor visible?
- Slice end: does the slice satisfy SPEC.md and the anchor goal? Run the full check commands on the merged branch.
- Only now: set status done, write evidence, update BOARD.md, claude-progress.txt.

## Final visibility
At slice end give the user a short report: what works now (with the command that proves it), what was blocked, what escalated, cost or attempt counts from the board metrics, unverified items.

## Failure handling
A failed level is an attempt. Follow the escalation ladder in BOARD.md. After the ceiling, set Blocked and ask the user one precise question.
