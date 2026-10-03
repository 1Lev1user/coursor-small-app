---
name: grill
description: "Interrogate the user before any ambiguous task, one decision at a time, with answer options and a recommended default. Planner or lead in a main session, because subagents cannot ask the user questions."
---

# Grill

Purpose: remove ambiguity before work starts. Planner or lead, in a main session only.

## When
- The request admits more than one reading, or has missing constraints, or contradicts itself.
- Skip when the request is unambiguous and cheap to redo.

## How
1. Read the repository and existing docs first. Never ask what the code or files already answer.
2. List the open decisions silently. Order by cost of a wrong guess, highest first.
3. Ask with AskUserQuestion, 1 to 4 questions per round. Every question has 2 to 4 options, the recommended option first and marked "(Recommended)", each with a one-line consequence.
4. Run as many rounds as needed. Stop the moment the picture is complete. Three questions is a baseline, not a limit.
5. Name contradictions and weak assumptions directly and say why. Do not agree automatically.
6. Write the answers into the decisions log of anchor.md. Do not proceed on assumptions.

## Plain-language rule
The user may not know technical terms. Explain each option in plain words, and raise what they may not have considered: security, cost, maintenance.

## Exit
State the final picture in 5 lines or fewer and wait for approval before building.
