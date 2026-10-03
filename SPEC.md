# SPEC

Source of truth for what the project is. Only the owner and the planner (Claude) edit this file.

## Product goal
My Expenses lets one person track EUR expenses and income on their phone, plan the month, import bank statements and keep backups, with all data kept on the device [inferred from README]. To be confirmed by the owner.

## Users (actors)
- Owner: sole user of the app on the phone, and product owner. Needs a quick, trustworthy view of what is left to spend [inferred].
- Owner as operator: releases the app via branch `v1` and keeps backups [inferred].

## Out of scope
- Accounts and sign-in.
- Cloud sync.
- Any server.
- Multi-currency budgets: budgets are always EUR (foreign purchases keep the original amount, budgets use the euro amount).

## Constraints
- Local-only data: nothing leaves the device.
- No npm dependencies.
- Node 22 for tests.
- Plain ES modules, no build step.
- PWA, offline via sw.js.
- Rights reserved (README "Rights"); fonts under SIL OFL 1.1.

## Definition of Done (project level)
- Every card in Done passed process/review.md and its pull request is merged into `main`.
- Every story map step in the current slice has a Done card.
- Checks that must exit 0: `npm test`, `npm run check:kit`; on pull requests also `npm run check:card`.

## Board
- GitHub Project '@1Lev1user's Expenses app project' (owner 1Lev1user, number 1). Its Status column (Backlog, In progress, In review, Done) is the only status of a card. Details: process/board.md.
- Sync: .github/workflows/board-sync.yml with the secret PROJECT_TOKEN creates and updates items from cards/, PROJECT_MAP.json and RELEASE_PLAN.json; it never changes Status.

## Open questions
- Guide scripts (scripts/build_user_guide_pdf.py, scripts/capture_guide_screens.js) have undocumented dependencies: pypdf, reportlab, playwright. Owner, 2026-10-03.
- `npm run serve` calls `python`, which is `python3` on many Linux and macOS machines. Owner, 2026-10-03.
- Product goal and actors above are inferred; owner to confirm. Owner, 2026-10-03.
