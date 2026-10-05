# Version 3.0: owner decisions

Decided with the owner on 2026-10-04 after the 3.0 audit (research/3.0/). These decisions override any different default in the card drafts and in research/3.0/cards-*.md. Release 2.1.0 is merged into 3.0; nothing is published to v1 until the 3.0 release.

## Money model
1. Savings (goal contributions) leave "Money now"; savings shown as a separate amount.
2. Past months before 3.0 stay as they are (virtual usual salary not rewritten). From the switch on, every month's salary is its own dated entry with its own amount; it never changes earlier months.
3. Weekends ignored: payday is exactly the set date. The user postpones, skips or cancels himself (e.g. added it earlier, or quit the job).
4. No guessing: an income counts as a salary (or another source) only when the user picks that source in Add income. No amount matching.
5. On payday with no entry yet: reminder on Home "Salary expected today: EUR X" with [Received (amount editable)] [Later] [Skip this month]. Nothing is added without the user.
6. Home main number: "Money now", then the per-day amount, then the month budget.
7. Per-day amount, two modes chosen by the user: (a) a fixed amount set by the user (show what is left of today's amount); (b) automatic: Money now / days left until the next payday (or month end when no payday), recalculated after every entry.
8. "Check against the bank": tapping "Money now" opens "How much is on the card now?"; the app adds one dated difference entry; past months unchanged.
9. The new counting turns on at the 3.0 update with a short one-time setup (money now, paydays); old months unchanged.
10. Several incomes: a list of income sources in Settings (name, expected amount, payday); in Add income the sources are in the list; the picked source counts as received for that month.
11. Subscription paid via bank import: the import suggests "Is this the Spotify subscription?"; Yes marks it paid and the reminder stops.
12. Plan changes (budget, salary) apply from the current month on; past months keep their plan.

## Settings and usability
13. Settings: one page with collapsing groups (variant A), one group open at a time, each group line shows a short summary.
14. Group order: Money, Income, Monthly budget, Backup, Categories and limits, Subscriptions, Quick add, Goals, Bank import (advanced), Profile and about.
15. The list of income entries with Edit/Delete stays in Settings (Income group) as well as in Month. The separate "Add extra income" form in Settings is removed: income is added with Add income on Home.
16. New categories are created with no limit; other limits never change silently.
17. The interface stays in English in 3.0.
18. "Replace everything" from a backup: preview of the file first (dates, entry counts), then download of the current data, then replace.
19. Comparison with last month: hidden until the month has ended (no partial-month comparison).
20. A monthly budget of 0 is allowed after "Are you sure?".

## Bank import
21. The check panel (sample rows as read, total in, total out, file lines vs rows read) is shown on every import, also when a remembered layout skips the Columns step.
22. Rows that only look like already imported ones (probable duplicates) are unticked by default and labelled "possible duplicate".
23. A camt reversal (RvslInd) is imported as a refund (money back), not as a new expense.
24. A batch entry is split into one entry per payment, each with its own payee.

## Input fields
25. Example hints stay inside empty fields but disappear as soon as the field is tapped (focused), not only when typing starts; no hint text under the field. A field that already holds a value (edit forms, plan, goals) selects the whole value on focus, so the first key typed replaces it. Applies to every amount and number field (Add, Month edit, Settings, goals, subscriptions, import, search).

## Visual design (proposals in research/3.0/design-*.md, chosen on the comparison page)
26. Buttons: variant A "tinted blocks" in the current colours. Primary solid pine #1F5C45 with white text (pressed #133D2E); secondary tint #DCE7DF with pine text (pressed #CBDCD0); destructive solid #A3302A only inside a confirm step; Edit/Delete as small tinted chips (tap area 44 px); a disabled style; press feedback scale 0.97; :hover only on devices that hover; a focus ring that is visible on pine.
27. Palette: the four small fixes: field outline #6B7A70; amber "attention" colours for the backup reminder instead of red (light #F3E6CC / #7A4E00, dark #33291A / #E2B666); dark hero block #25604A; dark primary button pine #2E7D5F with white text. Chart colours unchanged.
28. Fonts: Golos Text for text and Literata for figures, both SIL OFL, self-hosted like today (Latin Extended and Cyrillic subsets), tabular figures; replaces Onest and Unbounded.
29. Motion: the main moment (after saving an entry the amount rolls from the old to the new value and the budget bar grows, about 600 ms) plus quiet motion: button press, toast slide in and out, new row highlight, row removal collapse, add sheet from the bottom, quick fade on tab switch, slide on month change. Everything off under "Reduce Motion".
30. Bugs found by the design review, fixed in 3.0: the Savings progress colour lost by a broken CSS rule (and the track-only rule after it); the toast overlapping the tab bar; the near-invisible secondary button; sticky hover on iPhone; no disabled style; the focus ring invisible on pine; the dark-mode hierarchy (mint button brighter than the hero number).

## Answers while planning (2026-10-04)
31. A bank check difference is an ordinary dated entry of the month: bank lower = expense in Uncategorised, bank higher = income in Other, note "Bank difference". It counts in that month like any entry and is edited or deleted in Month (refines 8).
32. A money-in row in a bank import near an expected payday gets the question "Is this the <source>?"; Yes ties it to the source and closes the payday reminder; nothing is tied without Yes (extends 4 and 11 to income).
33. Months before the owner's first entry show no income; every month with data stays as it is (refines 2).
34. The one-time 3.0 setup cannot be skipped; the paydays list may stay empty (refines 9).
35. In an unfinished month Trends shows no comparison card at all (refines 19).
36. "Replace everything" downloads the current data and replaces in one tap after the preview (refines 18).
37. Approved test edits: test/model.test.js (C-029), test/importCore.test.js:575-587 (C-068), test/importCheckPanel.test.js:124 (C-058), test/settingsGroups.test.js:195 (C-046, 2026-10-05), test/screenMotion.test.js:11 (C-086, 2026-10-05). Font download approved after the licence check (SIL OFL 1.1, free of charge).
38. Motion after saving (C-075, 2026-10-05): only the Money now figure rolls; no budget bar is added to Home.
39. Bank sample cards (2026-10-05): build everything else for 3.0 now; C-064, C-065, C-066, C-067 and C-069 wait until the owner sends the anonymised bank export later.
40. User guide 3.0 (2026-10-05): built exactly like the 2.0 guide, as a PDF by scripts/build_user_guide_pdf.py (reportlab, already installed); no Word document and no download. Replaces the Word plan of 2026-10-03.

## What this changes in the drafted cards
| Card | Change |
|---|---|
| C-029 | No opt-in switch field; the new counting starts at the 3.0 update after a one-time setup (decision 9). Keep the PRE_UPDATE_KEY fallback. |
| C-030 | No amount matching (no 25 % rule): an income counts for a source only when the user picks that source in Add income (decisions 4, 10). No weekend rule (decision 3). |
| C-031 | Income counted on the entry date; from the switch month on, salary only from entries (decision 2). |
| C-033 | Income sources in Settings: name, expected amount, payday; no weekend rule; the Income group also lists income entries with Edit/Delete (decisions 3, 10, 15). |
| C-034 | Setup becomes the one-time 3.0 setup (money now, paydays) shown at the update (decision 9). |
| C-035 | Subscription paid by bank: the import asks "Is this the Spotify subscription?", Yes marks it paid; no automatic match (decision 11). |
| C-036 | Payday reminder: Received (amount editable) / Later / Skip this month (decision 5). |
| C-038 | Correction = one dated difference entry from "Check against the bank", not editing the starting figure (decision 8). Per-day amount: two modes, fixed or automatic money now / days to payday (decision 7). Savings leave Money now (decision 1). |
| C-039 | Home: Money now first (tap opens Check against the bank), then the per-day amount, then the month budget (decisions 6, 8). |
| C-032 | Plan changes from the current month on (decision 12). |
| C-041, C-042 | One page with collapsing groups in the decided order (decisions 13, 14). |
| C-043 | New categories default to no limit; no silent change of other limits (decision 16). |
| C-045 | Zero budget allowed after confirmation (decision 20). |
| C-052 | Hide the comparison until the month has ended (decision 19). |
| C-053 | Preview, then download of current data, then replace (decision 18). |
| C-057 | The check panel is shown on every import, including remembered layouts (decision 21). |
| C-066 | Reversal imported as a refund (decision 23). |
| C-067 | Batch split into one entry per payment (decision 24). |
| C-068 | Also: probable duplicates unticked by default, labelled "possible duplicate" (decision 22). |

## New cards to write for these decisions
| Card | Decision |
|---|---|
| C-070 | 25: example hints disappear on focus; pre-filled values selected on focus. |
| C-071 | 30: design bug fixes (Savings colour rule, toast over tab bar, sticky hover, disabled style, focus ring on pine). |
| C-072 | 26: buttons variant A. |
| C-073 | 27: palette fixes, light and dark. |
| C-074 | 28: Golos Text + Literata, self-hosted, CORE_ASSETS in sw.js updated. |
| C-075 | 29: main motion moment (amount roll-over and budget bar). |
| C-076 | 29: quiet motion, part 1: toast, new row highlight, row collapse. Button press is in C-072. |
| C-077 | 29: quiet motion, part 2: Add screen as a sheet, tab fade, month slide. Reduce Motion off in both. |

## Still open
- The owner's bank sample file (real format, made-up data): needed for C-064, C-065, C-066, C-067, C-069.
- User guide: retake screenshots (C-013, Playwright approved) and the PDF guide (C-014) in the execution phase.
- C-006 (automatic publishing) stays postponed; C-026 becomes the 3.0 release.
