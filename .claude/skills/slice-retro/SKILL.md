---
name: slice-retro
description: "Short review at the end of a slice: what shipped, what escalated, what to change in routing or cards. Use when all cards of a slice are Done or Blocked. Lead only."
---

# Slice retro

Keep it short. The output is a few lines in claude-progress.txt and changes to the board policy if justified.

1. Compare the slice against its goal in STORYMAP.md and SPEC.md. Run the full checks.
2. Read the metrics: first-pass rate per tier, escalations, Blocked cards, work item age.
3. For every escalated or blocked card find the cause: unclear card, missing check, wrong tier, real difficulty.
4. Decide changes: adjust start tier rules (for example Haiku first-pass under 70 percent means start on Sonnet), split big cards, add missing checks.
5. Update anchor.md with a checkpoint and the next slice goal. Set a /goal condition for the next slice in SPEC.md.
6. Report to the user: what works (with proof commands), what is blocked, what changed in the process.

Only changes backed by the numbers from this slice are applied. Everything else stays as is.
