# Story map: from a wish to steps

Claude (planner) only, with the owner. Every card belongs to a step; every new idea goes to the map before it becomes a card.

1. Restate the wish in one sentence and check it against SPEC.md (goal, out of scope, constraints). A wish that breaks a constraint goes back to the owner with the conflict named.
2. Ambiguous wish: ask the owner, one round of questions with options and a recommended default.
3. Find the activity in STORYMAP.md (backbone: Actor, Activity, Value). A new activity is added only with the owner's approval.
4. Add the steps under that activity: ID (S<activity>.<n>), actor, step, value, priority. Most important first.
5. Cut the steps into cards (process/card-writing.md). One step may need several cards; every card names exactly one step.
6. Order: P0 first, then cards others depend on, then the rest. Cards that share files are not taken at the same time.
7. Tell the owner which cards are new and the suggested order.

A step with no card is a gap. A card with no step is scope creep.
