---
name: minimal-code
description: "Write the smallest change that satisfies the card. Use when implementing any card. No extra features, abstractions, or dependencies."
---

# Minimal code

Write the least code that makes the acceptance commands pass and the behavior correct.

Rules:
1. Read the card acceptance list. Do exactly that.
2. Reuse what exists. Search before writing a helper.
3. No new dependency unless the card says so. If you think one is needed, report BLOCKED with the reason.
4. No speculative parameters, options, config, or abstractions for hypothetical future use.
5. No unrelated refactors, renames, or formatting changes. They hide the real diff from the reviewer.
6. Prefer deleting code over adding it when both satisfy the card.
7. Never edit existing tests to make them pass. Add new tests only when acceptance requires them.
8. Keep functions short enough to read at once; keep error handling at real boundaries (input, network, files), not everywhere.

After tests are green, the lead may run the built-in /simplify once per card, then reruns the tests. Never run /simplify before tests are green.
