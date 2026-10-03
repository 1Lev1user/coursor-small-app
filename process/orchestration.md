# Orchestration: Claude implements cards with subagents

Only when the owner asks Claude to implement cards (instead of doing them in Cursor). Claude in the main session is the **orchestrator**: it starts agents, moves cards, opens and merges pull requests. It never plans, implements or reviews a card itself.

## Three agents, three tasks (owner rule, 2026-10-03)
Every card goes through three separate agent runs. No agent does two of them, and none sees another's conversation; each gets only its inputs.

| Step | Agent | Task | Board |
|---|---|---|---|
| 1 Plan | `card-planner` (Sonnet; Opus for risk high) | Read-only: checks the card against the code, writes the plan, picks the worker tier | Status In progress, Agent = `card-planner (model)` |
| 2 Build | `worker-light` (Haiku) / `worker-standard` (Sonnet) / `worker-heavy` (Opus) | Implements the plan on `card/C-NNN-...` in its own worktree, pushes the branch | Agent = `worker-... (model)` |
| 3 Check | `reviewer` (Sonnet; Opus for risk high or an Opus worker) | Read-only: process/review.md Levels 1 to 3 on the pull request | Status In review, Agent = `reviewer (model)` |

The orchestrator then does Level 4 (process/review.md), merges, sets Status Done and clears Agent.

## Visible movement
- The board field **Agent** (text) shows who is on the card right now. The orchestrator sets it before each run and clears it at Done or Blocked.
- The pull request body holds the planner's plan and the worker's report. The reviewer's verdict is posted as a PR comment. All three are visible on GitHub.
- claude-progress.txt gets one line per card: tiers used, attempts, result.

## Escalation
- Planner READY: no → the card goes back to the planner (Claude, main role) to fix the card; it is Blocked until then.
- Worker BLOCKED or reviewer FAIL → a new worker run with the findings, same tier once, then one tier up (haiku → sonnet → opus). Ceiling: 2 attempts per tier, then Blocked and a question to the owner.
- NEEDS_HUMAN → Blocked, question to the owner at once.

## Limits
- WIP 3 cards at once; cards that share allowed_paths never run at the same time.
- Live or irreversible steps (publishing, releases) wait for the owner's explicit go, even when the card is otherwise done.
- Manual acceptance items are listed for the owner in the pull request; they are never marked done by an agent.
