# BOARD

Human-readable view of feature_list.json. The planner writes cards and Done; the lead writes execution statuses (see board-ops skill). GitHub Project mirror is one-way (this file to GitHub).

## Policies
- Columns: Backlog, Approved (internal status ready), In progress, Verify, Review, Done, Blocked. The owner moves Backlog -> Approved = permission to start.
- WIP limit: 3 in In progress, 2 in Review.
- A card enters Approved only with: story step, size, priority, risk, acceptance commands, allowed paths.
- Cards touching the same files do not run in parallel. Parallel cards use isolation: worktree.
- Done is set after Levels 1 to 4 by the planner, which executes in the cloud and also performs the lead role (the optional local lead stops at Review; see completion-check skill). A Done card is never reopened.
- Ladder: Haiku, Sonnet, Opus. Up to 2 attempts per tier, each in a fresh context with the previous error text. Ceiling 6 attempts for a card started on Haiku, 4 on Sonnet, 2 on Opus. Then Blocked and a question to the user.
- Pull order: priority first (P0 over P1 over P2), then older work item age first.

## Slice
Current slice: 1

## Backlog
- C-004 (P2, S, haiku) Make the template date test timezone-safe. Needs owner approval to edit test/templates.test.js.

## Approved (status ready)
(none)

## In progress
(none)

## Verify
(none)

## Review
(none)

## Done
- C-002 (P1, S, haiku) Regression test: past month without plan choice is refused.
- C-003 (P1, S, haiku) Direct tests for escapeField edge cases.
- C-001 (P0, S, haiku) Make 3 import tests date-independent.

## Blocked
(none)

## Metrics (updated by the lead at each slice end)
| Tier | Cards started | Passed first try | Escalated | First-pass rate |
|---|---|---|---|---|
| haiku | 3 | 3 | 0 | 100% (slice 1) |
| sonnet | 0 | 0 | 0 | n/a |
| opus | 0 | 0 | 0 | n/a |

Starting threshold [assumption]: if Haiku first-pass rate stays below 70 percent, start those cards on Sonnet.
