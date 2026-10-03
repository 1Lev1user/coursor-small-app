# Retro

Claude (planner) only, with the owner. After a group of related cards (a slice) is Done, or every two weeks, whichever comes first. Keep it short: a few lines in claude-progress.txt and process changes only if the numbers back them.

1. Run `npm test` and `npm run check:kit` on `main`. Use the slice end to end on the live site or locally, not card by card; gaps appear at the seams.
2. From the board and the merged pull requests: cards done, cards returned from review (and why), cards blocked, days from In progress to Done.
3. For every returned or blocked card name the cause: unclear card, missing check, wrong allowed_paths, real difficulty.
4. Change only what the causes point to: clearer card notes, an extra acceptance check, smaller cards, a new rule in AGENTS.md.
5. UI slice: second design-review pass, on a different day from the first.
6. Update anchor.md (checkpoint, next goal) and tell the owner: what works now (with the proof command), what is blocked, what changed in the process.
