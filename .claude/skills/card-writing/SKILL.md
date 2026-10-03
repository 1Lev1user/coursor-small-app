---
name: card-writing
description: "Turn a story map step into a board card with size, priority, risk, start tier, acceptance commands and allowed paths. Use before a card enters Ready. Planner only."
---

# Card writing

Planner only. The lead never creates cards; it records new ideas as a "Proposals" line in claude-progress.txt.

One card equals one story step slice that one worker can finish and one reviewer can check.

## Fields
id, story_step, title, size (S, M, L), priority (P0, P1, P2), risk (low, medium, high), start_tier, attempts, acceptance, allowed_paths, forbidden, depends_on, status, evidence.

## Classification
- Size S: one file area, under about an hour of human work, clear behavior. M: several files, one module. L: cross-module. If a card is L, try to split it first.
- Risk high: auth, payments, personal data, migrations, public API, security, irreversible actions.
- start_tier:
  - S + low risk + an automatic check exists: haiku.
  - M or L, or S without an automatic check: sonnet.
  - High risk, architecture, or ambiguity: opus.
- Priority: P0 blocks the thin first slice or fixes a break; P1 is in the current slice; P2 later.

## Acceptance
- Commands that exit 0 when the card is done (test, lint, build, a curl against a local server). No command means no Haiku.
- If no automatic check exists, write one first as a separate card or write a manual check the reviewer can run.

## UI cards
- Acceptance includes the design-review skill checks: screenshots at 3 widths and the thresholds that apply.
- The reviewer gets the design-review skill.

## Size guide
- About 100 changed lines is a normal card. 1000 is too many.
- 200 lines in one file is fine. The same lines spread over 50 files are not.
- Source: Google eng-practices, small CLs [verified]. Applied to agent work [assumption].

## Allowed paths
Smallest set of directories or files the worker may edit. Cards that share paths do not run in parallel.

## Rejects
Send back a card that has no story step, no acceptance, no allowed paths, or two unrelated goals.
