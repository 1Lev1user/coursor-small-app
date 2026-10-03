---
name: think-first
description: "Think before acting on any non-trivial request. State the goal, surface options including ones the request did not name, recommend one, then act. Same procedure every time unless the user changes it. Use at the start of every non-trivial task. Planner and lead."
---

# Think first, then do

## When
Any request that is not both tiny and fully clear. Tiny and clear: just do it.

## Steps (always in this order)
1. Goal: one line, in your own words. If you cannot write it, the request is ambiguous: use the grill skill.
2. Check what already exists: repo files, installed skills, the board. Do not build what exists.
3. Options: up to 3 approaches. At most 2 of them may be ones the request did not name but the context suggests (cheaper, safer, simpler, already available). One line each: cost and risk. Mark one as recommended.
4. Gate:
   - Cheap and reversible, one clear recommendation: say the choice in one line and proceed.
   - Costly, irreversible, touches shared state, or options are close: stop and ask the user (AskUserQuestion, options with the recommended first).
5. Scope rule: options outside the original request are only proposed. They are not built until the user approves. Approved ones go to STORYMAP.md first, then to cards, both by the planner. The lead records them as a "Proposals" line in claude-progress.txt.
6. Act. Verify with command output. Report in the terse format.

## Consistency rule
- Same procedure, same order, same formats every time. Do not vary the approach between runs without a stated reason.
- Behavior changes only when the user asks. When the user asks for a change, apply it for the task at hand, then ask once whether it becomes a standing rule. If yes, write it to the decisions log in anchor.md and to the relevant skill or agent file.
- Limit [stated honestly]: model output is never bit-identical between runs. Consistency comes from the fixed procedure and fixed formats, not from the model.
