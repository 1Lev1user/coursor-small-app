# BOARD

Human-readable view of feature_list.json. The planner writes cards and Done; the lead writes execution statuses (see board-ops skill). GitHub Project mirror is one-way (this file to GitHub).

## Policies
- Columns: Backlog, Ready, In progress, Verify, Review, Done, Blocked.
- WIP limit: 3 in In progress, 2 in Review.
- A card enters Ready only with: story step, size, priority, risk, acceptance commands, allowed paths.
- Cards touching the same files do not run in parallel. Parallel cards use isolation: worktree.
- Done is set only by the planner after Levels 1 to 4; the lead moves cards up to Review (see completion-check skill).
- Ladder: Haiku, Sonnet, Opus. Up to 2 attempts per tier, each in a fresh context with the previous error text. Ceiling 6 attempts for a card started on Haiku, 4 on Sonnet, 2 on Opus. Then Blocked and a question to the user.
- Pull order: priority first (P0 over P1 over P2), then older work item age first.

## Slice
Current slice: 1

## Backlog
- C-002 (P1, S, haiku) Regression test: past month without plan choice is refused. Waits for C-001.

## Ready
- C-001 (P0, S, haiku) Make 3 import tests date-independent.
- C-003 (P1, S, haiku) Direct tests for escapeField edge cases.

Note: C-001 and C-002 do not share files, but C-002 acceptance (`npm test` exits 0) needs C-001 done first.

## In progress
(none)

## Verify
(none)

## Review
(none)

## Done
(none)

## Blocked
(none)

## Metrics (updated by the lead at each slice end)
| Tier | Cards started | Passed first try | Escalated | First-pass rate |
|---|---|---|---|---|
| haiku | 0 | 0 | 0 | n/a |
| sonnet | 0 | 0 | 0 | n/a |
| opus | 0 | 0 | 0 | n/a |

Starting threshold [assumption]: if Haiku first-pass rate stays below 70 percent, start those cards on Sonnet.
