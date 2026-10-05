# Version 3.0 Implementation Plan

> **For agentic workers:** this plan is executed through the project kit, not freehand. Every task below is one card in `cards/`; the orchestrator runs it with process/orchestration.md (card-planner, then a worker, then a reviewer, three separate agents) and closes it with process/review.md. A worker implements only its own card file; the card's Goal, Acceptance, Do not touch and Notes are the full task text, with tests first.

**Goal:** Ship My Expenses 3.0: a real money model (money now, dated income, paydays, per-day amount), a short grouped Settings page, a trustworthy bank import, number fields that never mix with hints, and the chosen visual design and motion, in 52 cards plus the user guide and the release.

**Architecture:** Plain ES modules in `src/`, no build step, no dependencies, data in the browser only (`src/storage.js`, schema in `src/model.js` with `SCHEMA_VERSION` and `MIGRATIONS`), styles as tokens at the top of `style.css`, offline cache in `sw.js`. Each card is one branch `card/C-NNN-...` and one squash-merged pull request into `main`; the GitHub Project board is the only status.

**Tech Stack:** JavaScript (browser + Node 22 for tests), `node --test`, CSS custom properties, service worker, GitHub Actions (test, check:kit, check:card, board-sync), GitHub Project board, Claude agents in `.claude/agents/`.

## Global Constraints

- Owner decisions 1-30 in research/3.0/decisions-3.0.md override anything else, including the research files.
- Interface text stays English (decision 17). Files, code, comments and commit messages in English.
- Data stays on the device: no network calls, no accounts, no analytics (AGENTS.md).
- No new dependencies in package.json. One-time downloads (fonts for C-074, Playwright for C-013) only with the owner's go and outside package.json.
- Data format change only through `SCHEMA_VERSION` + one `MIGRATIONS` step with a test (AGENTS.md); the update keeps the pre-update copy (`PRE_UPDATE_KEY`).
- Past months never change: the new counting starts at the 3.0 update (decisions 2, 9, 12).
- Colours, fonts, radii and motion only as tokens in style.css; every movement inside `@media (prefers-reduced-motion: no-preference)` (decision 29).
- Every card: `npm test` exits 0; a worker never edits an existing test unless the card lists it in `test_edits`; planning files are never in a card branch.
- Nothing is published to v1 until the release card C-026 and the owner's explicit go.

---

## 1. Scope

| Lane | Cards | What the owner gets |
|---|---|---|
| Money | C-029 to C-039 (11) | Money now, dated income per source, payday reminder, per-day amount, check against the bank, one-time 3.0 setup, plan changes from this month on |
| Settings/UX | C-040 to C-054 (15) | One Settings page of collapsing groups in the decided order, one set of words, no-limit default, safer backup restore, small usability fixes |
| Bank | C-055 to C-069 (15) | Import reads more files correctly, a check panel on every import, possible duplicates unticked, reversals as refunds, batches split |
| Design | C-070 to C-077 (8) | Hints vanish on focus, design bugs fixed, tinted-block buttons, palette fixes, Golos Text + Literata, main and quiet motion |
| Guide and release | C-013, C-014, C-026 (3) | Screenshots and PDF guide of 3.0, release 3.0.0 on v1 |

60 cards (C-084 added on 2026-10-05 from the C-046 review, C-085 from the C-014 planning; on 2026-10-04 C-041 was split into C-041 and C-078, C-035 into C-035, C-079 and C-080, C-034 into C-034, C-081 and C-082, and C-039 into C-039 and C-083). C-006 (publish workflow) stays postponed; C-010 (FiDAViSTA check) waits for the owner's anonymised file and is outside 3.0 unless the file comes.

## 2. How every card runs (the task procedure)

Each row of the table in section 4 is one task. The card file is the task text (Goal, Acceptance with exact commands, Do not touch, Notes with file:line, tests first). The orchestrator (main Claude session) runs this checklist per card; it never plans, builds or reviews a card itself (process/orchestration.md).

- [ ] **Ready check:** every `depends_on` card is Done; no card sharing an `allowed_paths` entry is in Build; the card's owner gate (column Gate) is cleared.
- [ ] **Plan:** board Status In progress, Agent `card-planner (<model>)`. Spawn `card-planner` with the card path; it returns READY yes/no, the plan and the worker tier. READY no: the main session fixes the card on `main` (planning commit), then re-plans.
- [ ] **Build:** Agent `worker-<tier> (<model>)`. The worker gets the card and the plan, works in its own worktree on `card/C-NNN-<short-name>` from up-to-date `main`, writes the failing tests first, implements, runs every Acceptance command and `npm test`, pushes the branch and reports with real output.
- [ ] **Pull request:** the orchestrator opens `C-NNN: <title>` with the plan, the worker's report and the Manual items as unchecked boxes.
- [ ] **Check:** Status In review, Agent `reviewer (<model>)`. Spawn `reviewer` (Levels 1-3 of process/review.md; `check-card` with the local branch name). It posts PASS or numbered findings as a PR comment.
- [ ] **Escalate on failure:** FAIL or BLOCKED: same tier once more with the findings, then one tier up; two failures on a tier: Blocked and a question to the owner.
- [ ] **Close:** Level 4 by the orchestrator (Goal and story step met, UI screenshots per process/design-review.md), squash merge, delete the branch, Status Done, clear Agent, one line in claude-progress.txt, `npm test` on `main` exits 0.

Conveyor: at most 3 agents at once, any mix of plan, build and check. When a slot frees, the next step of any ready card starts. A planner may plan the next card of a chain while its predecessor is in Check, but that card's worker starts only after the predecessor is merged (the plan is re-checked against the merged code at the start of Build).

Retro (process/retro.md) after each lane is complete and after wave 9.

## 3. Shared files (why the order is what it is)

Cards that share a file never build at the same time. The files that force the order:

| File | Cards |
|---|---|
| style.css | C-039, C-041, C-042, C-045, C-050, C-051, C-057, C-070, C-071, C-072, C-073, C-074, C-075, C-076, C-077 |
| sw.js (one CORE_ASSETS line each) | C-030, C-033, C-034, C-036, C-038, C-039, C-046, C-070, C-074, C-075 |
| src/views/add.js | C-034, C-036, C-037, C-039, C-040, C-043, C-047, C-048, C-050, C-075 |
| src/views/import.js | C-034, C-035, C-055, C-056, C-057, C-058, C-064, C-065, C-068, C-069 |
| src/import/text.js | C-055, C-056, C-058, C-059, C-060, C-061, C-062, C-064, C-065, C-069 |
| src/app.js | C-032, C-034, C-035, C-050, C-070, C-076, C-077 |
| src/views/more.js | C-033, C-039, C-040, C-041, C-046 |
| src/views/settings/plan.js | C-034, C-040, C-041, C-044, C-045 |
| src/budget.js | C-031, C-032, C-037, C-043 |
| src/views/month.js | C-037, C-039, C-052, C-076 |

Settings slot contract (C-041): C-033, C-039 and C-046 each add one `SECTION_RENDERERS` entry, one import and one `groupSummary` case in src/views/more.js and never edit `SETTINGS_GROUPS`.

## 4. Waves

A wave is up to three cards that share no file and whose dependencies are in earlier waves. It is the order the conveyor follows, not a fixed batch: a card of a later wave starts as soon as its own conditions hold. Ordered by priority, then by the longest chain of cards waiting behind it. Computed from the cards' `depends_on` and `allowed_paths` on 2026-10-04.

Agent tiers: planner Sonnet (Opus for risk high). Worker light = Haiku, only for pure one-file changes (slice 2 lesson: Haiku ran out of turns on 3 of 5 cards); standard = Sonnet; heavy = Opus for risk high and for C-039, which joins five cards and may reach 300 lines. Reviewer Sonnet (Opus for risk high or an Opus worker). C-026 has risk high because of publishing; its code change is two lines, so the worker is standard and the publish itself is done by the orchestrator after the owner's go.

| Wave | Card | Title | Lane | Size | Prio | Risk | Depends on | Planner | Worker | Reviewer | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| W1 | C-029 | Data format 3: fields for income sources, money now and the per-day amount | Money | M | P0 | high | - | opus | heavy (opus) | opus | test edit (cleared) |
| W1 | C-071 | Fix the design bugs: Savings bar colour, toast over the tab bar, sticky hover, disabled and focus styles | Design | S | P0 | low | - | sonnet | standard (sonnet) | sonnet | - |
| W1 | C-055 | Guess the decimal separator when the currency follows the amount | Bank | S | P0 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W2 | C-030 | Income sources: payday dates, expected and received income (logic only) | Money | M | P0 | medium | C-029 | sonnet | standard (sonnet) | sonnet | - |
| W2 | C-057 | Show a check panel on every import: sample rows, totals, line count | Bank | M | P0 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W2 | C-060 | Do not let one stray quote mark swallow the rest of a CSV file | Bank | S | P0 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W3 | C-031 | Month income counts only entries from the 3.0 setup on, never a month the owner never had | Money | M | P0 | medium | C-029, C-030 | sonnet | standard (sonnet) | sonnet | - |
| W3 | C-040 | Settings: say each thing once, in one set of words | Settings/UX | M | P1 | low | - | sonnet | standard (sonnet) | sonnet | - |
| W3 | C-038 | Money now, bank check, savings and the per-day amount (logic only) | Money | M | P1 | medium | C-029, C-030 | sonnet | standard (sonnet) | sonnet | - |
| W4 | C-041 | Settings groups: the group list, one-line summaries and the Profile split | Settings/UX | M | P1 | low | C-040 | sonnet | standard (sonnet) | sonnet | - |
| W4 | C-078 | Settings page renders as collapsing groups, one open at a time | Settings/UX | M | P1 | low | C-041 | sonnet | standard (sonnet) | sonnet | - |
| W4 | C-036 | Payday reminder on Home (Received, Later, Skip this month) and the income source in Add income | Money | M | P1 | medium | C-030, C-040 | sonnet | standard (sonnet) | sonnet | - |
| W4 | C-032 | Plan changes apply from the current month on; past months keep their plan | Money | S | P1 | medium | C-030, C-031 | sonnet | standard (sonnet) | sonnet | - |
| W5 | C-044 | Amount fields accept 1,234.50 and say what format they want | Settings/UX | S | P1 | medium | C-041 | sonnet | standard (sonnet) | sonnet | - |
| W5 | C-072 | Buttons: tinted blocks in the current colours | Design | M | P1 | low | C-071 | sonnet | standard (sonnet) | sonnet | - |
| W5 | C-037 | No red over-budget for months without a budget or for money put into Savings | Money | M | P1 | medium | C-031 | sonnet | standard (sonnet) | sonnet | - |
| W6 | C-034 | Money setup logic: applyMoneySetup writes money now and the paydays | Money | M | P1 | medium | C-030, C-038, C-040, C-041, C-044 | sonnet | standard (sonnet) | sonnet | - |
| W6 | C-081 | Money setup screen shown before Home until money now is set | Money | M | P1 | medium | C-034 | sonnet | standard (sonnet) | sonnet | - |
| W6 | C-082 | Income wording tells what the app does now | Money | M | P1 | medium | C-081, C-033 | sonnet | standard (sonnet) | sonnet | - |
| W6 | C-073 | Palette: firmer field outline, amber backup reminder, brighter dark hero block | Design | S | P1 | low | C-072 | sonnet | light (haiku) | sonnet | - |
| W6 | C-053 | Restoring a backup: show what is in the file, keep a safety copy, keep the backup date | Settings/UX | M | P1 | medium | C-029 | sonnet | standard (sonnet) | sonnet | - |
| W7 | C-047 | Quick add: Undo in the toast and no second entry from a double tap | Settings/UX | S | P1 | low | - | sonnet | standard (sonnet) | sonnet | - |
| W7 | C-074 | Fonts: Golos Text for text, Literata for figures | Design | M | P1 | medium | C-073 | sonnet | standard (sonnet) | sonnet | font download (cleared) |
| W7 | C-035 | The subscription reminder can be postponed or skipped | Money | M | P1 | medium | C-029, C-030 | sonnet | standard (sonnet) | sonnet | - |
| W7 | C-079 | Bank import asks whether a row is a subscription's payment | Money | M | P1 | medium | C-035 | sonnet | standard (sonnet) | sonnet | - |
| W7 | C-080 | Bank import asks whether a money-in row is a regular income | Money | M | P1 | medium | C-079 | sonnet | standard (sonnet) | sonnet | - |
| W8 | C-039 | Home shows Money now, the per-day amount and the month budget; check against the bank | Money | M | P1 | medium | C-034, C-036, C-037, C-038, C-081, C-082 | sonnet | standard (sonnet) | sonnet | - |
| W8 | C-083 | Settings > Money and the Month lines: what the month started and ended with, and each regular income | Money | M | P1 | medium | C-039, C-041, C-078 | sonnet | standard (sonnet) | sonnet | - |
| W13 | C-084 | Settings edit forms: fields sit at their natural height | Design | S | P2 | low | C-046 | sonnet | standard (sonnet) | sonnet | - |
| W13 | C-085 | README describes version 3.0 | Guide/Release | S | P2 | low | C-084 | sonnet | standard (sonnet) | sonnet | - |
| W8 | C-056 | Read money direction from more words and from a D/C mark without a space | Bank | S | P1 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W8 | C-063 | Excel import: read the sheet that holds the transactions | Bank | S | P1 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W9 | C-042 | Categories and limits: collapsed rows, one category open at a time | Settings/UX | M | P1 | low | C-041 | sonnet | standard (sonnet) | sonnet | - |
| W9 | C-033 | Settings: list of regular incomes with name, expected amount and payday | Money | M | P1 | medium | C-030, C-041 | sonnet | standard (sonnet) | sonnet | - |
| W9 | C-058 | Add a Reverse money in and out switch to the Columns step | Bank | S | P1 | medium | C-057 | sonnet | standard (sonnet) | sonnet | - |
| W10 | C-043 | New categories start with no limit; a limit that would move others says so first | Settings/UX | S | P1 | low | C-042 | sonnet | standard (sonnet) | sonnet | - |
| W10 | C-059 | Skip dated balance lines wherever the label sits in the row | Bank | S | P1 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W10 | C-068 | Duplicates: a reused reference is not Exact, and possible duplicates start unticked | Bank | M | P1 | medium | - | sonnet | standard (sonnet) | sonnet | test edit (cleared) |
| W11 | C-061 | Find the header row when the header and data rows differ in width | Bank | S | P1 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W11 | C-070 | Number fields: example hint goes on focus, an existing value is selected | Design | S | P1 | low | - | sonnet | standard (sonnet) | sonnet | - |
| W11 | C-048 | Add expense: mark it as a refund when you add it | Settings/UX | S | P2 | low | C-040, C-047 | sonnet | standard (sonnet) | sonnet | - |
| W12 | C-062 | Detect the delimiter when the file starts with a long preamble | Bank | S | P1 | medium | - | sonnet | standard (sonnet) | sonnet | - |
| W12 | C-050 | Screens open at the top; Add forms start in the first field and close on Escape | Settings/UX | M | P2 | low | C-048 | sonnet | standard (sonnet) | sonnet | - |
| W12 | C-046 | Settings > Quick add: rename, re-price and delete templates | Settings/UX | M | P2 | low | C-041 | sonnet | standard (sonnet) | sonnet | - |
| W13 | C-075 | Motion: after saving, Money now rolls to the new amount | Design | M | P2 | low | C-039, C-074 | sonnet | standard (sonnet) | sonnet | - |
| W13 | C-049 | Search shows the total of the results | Settings/UX | S | P2 | low | - | sonnet | standard (sonnet) | sonnet | - |
| W13 | C-052 | Show the comparison with last month only after the month has ended | Settings/UX | S | P2 | low | - | sonnet | standard (sonnet) | sonnet | - |
| W14 | C-076 | Quiet motion: toast slides in and out, new row highlight, removed row collapses | Design | M | P2 | low | C-075, C-050 | sonnet | standard (sonnet) | sonnet | - |
| W14 | C-054 | Reopen a closed savings goal | Settings/UX | S | P2 | low | - | sonnet | light (haiku) | sonnet | - |
| W15 | C-045 | Monthly budget: ask \"Are you sure?\" before a zero budget, and show unsaved edits | Settings/UX | S | P2 | low | C-044 | sonnet | standard (sonnet) | sonnet | - |
| W16 | C-051 | Readable on every width and theme: content width, Year table, faded rows | Settings/UX | S | P2 | low | - | sonnet | standard (sonnet) | sonnet | - |
| W17 | C-077 | Quiet motion: Add screen rises from the bottom, tabs fade, months slide | Design | M | P2 | low | C-076 | sonnet | standard (sonnet) | sonnet | - |
| G-bank | C-064 | Add a Status column that skips pending, reversed and declined rows | Bank | M | P1 | medium | C-057 | sonnet | standard (sonnet) | sonnet | bank sample file |
| G-bank | C-065 | Add an optional Fee column that is added to the amount | Bank | S | P1 | medium | C-064 | sonnet | standard (sonnet) | sonnet | bank sample file |
| G-bank | C-069 | Add an optional Payee column so the merchant name is not lost | Bank | M | P1 | medium | C-065 | sonnet | standard (sonnet) | sonnet | bank sample file |
| G-bank | C-066 | camt: import reversal entries as a refund, not as a new payment | Bank | M | P1 | medium | - | sonnet | standard (sonnet) | sonnet | bank sample file |
| G-bank | C-067 | camt: split batch entries into one row per payment | Bank | M | P1 | medium | C-066 | sonnet | standard (sonnet) | sonnet | bank sample file |
| G-guide | C-013 | Retake the user guide screenshots of version 3.0 | Guide/Release | M | P2 | low | all slice 3 cards (see card) | sonnet | standard (sonnet) | sonnet | Playwright (approved) |
| G-guide | C-014 | User guide 3.0 as a PDF, built like the 2.0 guide | Guide/Release | M | P2 | low | C-013, C-025 | sonnet | standard (sonnet) | sonnet | - |
| R | C-026 | Release 3.0.0: raise the version pair and publish v1 | Guide/Release | S | P1 | high | all slice 3 cards (see card) | opus | standard (sonnet) | opus | owner go to publish |

Waves 14 to 17 run one card at a time because they all edit style.css; the free slots go to the gated cards (bank sample, guide) if their gates are cleared by then.

## 5. Owner gates

| Gate | Needed before | What the owner does |
|---|---|---|
| G1 Test edits | C-029 (wave 1), C-068 (wave 10) | Cleared 2026-10-04: test/model.test.js in C-029 and test/importCore.test.js:575-587 in C-068 approved |
| G2 Answers to section 6 | C-030, C-031, C-034, C-038 | Cleared 2026-10-04 (section 6) |
| G3 Font download | C-074 (wave 7) | Cleared 2026-10-04 after the licence check: Golos Text and Literata are SIL OFL 1.1 (google/fonts OFL.txt, npm licence field OFL-1.1), free of charge, bundling allowed with the licence file |
| G4 Bank sample file | C-064 to C-067, C-069 | A real export from the owner's bank with made-up data (CSV or Excel, and camt XML if the bank offers it) |
| G5 Guide tools | C-013, C-014 | Playwright is approved (2026-10-04); the PDF guide needs no download (decision 40) |
| G6 Manual checks | release | Tick the Manual items of each merged card on the iPhone (listed in each pull request); they gate the release, not the merge |
| G7 Publish | C-026 | Explicit go to publish 3.0.0 to v1, and whether 3.0 waits for the G4 cards |

## 6. Owner answers (2026-10-04)

| # | Card | Question | Answer |
|---|---|---|---|
| Q1 | C-030, C-035 | A salary that arrives through a bank import: should the import ask "Is this the <source>?" as for subscriptions? | Yes. The import asks for a money-in row near an expected payday; Yes ties it to the source and closes the payday reminder; nothing is tied without Yes |
| Q2 | C-031 | Hide income in empty months before the first entry; months with data unchanged? | Yes, keep the guard |
| Q3 | C-034 | Can the one-time 3.0 setup be skipped? | No skip |
| Q4 | C-029, C-038, C-039 | How does a bank check difference count? | As an ordinary dated entry of the month: bank lower = expense in Uncategorised, bank higher = income in Other, note "Bank difference"; it counts in the month like any entry and is edited or deleted in Month |
| Q5 | C-052 | What does Trends show in an unfinished month instead of the comparison? | Nothing |
| Q6 | C-053 | Second confirmation between the safety download and Replace? | No, one tap after the preview |

## 7. Risks

- Size: C-039 (Home, about 300 lines) and C-041 (Settings groups) are the largest. The planner step decides; a card that does not fit is split into new ids above C-077 before Build, not during it.
- Long serial tail on style.css (waves 13-17). If it is the bottleneck, the owner may allow cards that only add one line to sw.js to build in parallel; nothing in this plan assumes that.
- The data format change (C-029, risk high) is the base of the Money lane: Opus planner, worker and reviewer, and the pre-update copy stays.
- Usage limits stopped agents twice on 2026-10-04. The board is the state: after a stop, the orchestrator reads the board and resumes each card at its stage; worktrees are kept until the card is merged.
- GitHub GraphQL rate limit: board moves use the cached item ids; pull requests and comments use REST.
- Unverified in the cards, to be checked during Build: iOS select-on-focus timing (C-070), View Transitions in the owner's Safari (C-077), the fontsource file names (C-074), the camt reversal direction (C-066, with the sample file).

## 8. Done for 3.0

- Every card in section 4 is Done on the board (or the owner moved the G4 cards out of 3.0).
- `npm test` and `npm run check:kit` exit 0 on `main`.
- The owner has ticked the Manual items (G6) and given the publish go (G7).
- v1 head is `Release 3.0.0`; GitHub Release 3.0.0 holds the Word guide and the PDF.

## 9. Self-review (2026-10-04)

- Decisions coverage: 1, 7, 8 in C-038 and C-039; 2, 9 in C-029, C-031, C-034; 3, 4, 10 in C-030, C-033, C-036; 5 in C-036; 6 in C-039; 11 in C-035; 12 in C-032; 13, 14 in C-041 with the C-033, C-039, C-046 slots; 15 in C-040 and C-041; 16 in C-043; 17 in all cards; 18 in C-053; 19 in C-052; 20 in C-045; 21 in C-057; 22 in C-068; 23 in C-066; 24 in C-067; 25 in C-070; 26 in C-072; 27 in C-072 (dark button) and C-073; 28 in C-074; 29 in C-075, C-076, C-077; 30 in C-071, C-072, C-073.
- `npm run check:kit` exits 0 with all cards; every card's story step exists in STORYMAP.md.
- Order check: no card depends on a card in a later wave.
