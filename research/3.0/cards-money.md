# Money model cards (slice 3, release 3.0): C-029 to C-039

Planning draft for the planner. Nothing here is committed. Sources: A = code discovery, B = research, C2 = power-user test, C3 = critical UX test (all in the scratchpad `discovery/` folder). All card files passed a local parse with `scripts/cards.mjs` (fields, headings, system paths, test_edits exist, depends_on exist). `story_step` ids S1.4, S1.5, S2.5, S2.6, S3.7, S3.8 are new and must be added to STORYMAP.md before `npm run check:kit` passes.

## Cards
| id | title | size | priority | depends_on | why (source) |
|---|---|---|---|---|---|
| C-029 | Data format 3: fields for payday income, balance and reminders | M | P0 | none | One schema step for the whole slice; also fixes the PRE_UPDATE_KEY orphan and backup merge (A 3a, A 3 shared facts 6) |
| C-030 | Income sources: payday dates, expected and received income (logic only) | M | P0 | C-029 | Owner: payday, several incomes per month, varying salary; income model first, balance second (A recommendation, B 4.2) |
| C-031 | Month income counts on payday, never twice, never before the first month | M | P0 | C-029, C-030 | Fixes salary double count, phantom income in past months, review card for a month never had (C2 6.4, C3 F2/F3/F4/F7, A gap 6, 7) |
| C-032 | Past months keep their plan when the plan or categories change | S | P1 | C-030, C-031 | Saving the plan rewrites past months (C3 F6) |
| C-033 | Settings: regular income with payday, amount and weekend rule | M | P1 | C-030, C-031 | The screen for owner decisions 2, 3, 4; one-button switch for 2.0 users (A 3b, 3d; C3 section 3) |
| C-034 | Setup asks for payday; income wording tells the truth on every screen | M | P1 | C-030, C-031, C-033 | Home copy "added for you" is wrong; Setup would keep new users on the old rule (C2 2.6, C3 F10, A 3c strings list) |
| C-035 | Subscription reminder: paid bank rows count as paid, and it can be skipped or postponed | M | P1 | C-029 | Due modal cannot be dismissed; imported Spotify row not linked, second charge (C2 2.3, 2.5) |
| C-036 | Payday reminder: confirm the real amount, skip, or postpone | M | P1 | C-030, C-031, C-033, C-035 | Forecast vs actual: the owner types what arrived; catch-up for missed paydays (A 3b, 3c; B 4.2, GnuCash/MMEX) |
| C-037 | No red over-budget for months without a budget or for money put into Savings | M | P1 | C-031 | "Only record spending" month shown over budget; goal money shown over budget (C2 1.6, 3.3) |
| C-038 | Balance: money now, month start and end carried over, safe amount per day (logic only) | M | P1 | C-029, C-030, C-035 | Owner decision 1; derive, never store closing balances (A 3a, B 4.1); per-day until payday (C3 F9, B 2) |
| C-039 | Show money now, month start and end, expected vs received income, and per-day amount | M | P1 | C-033, C-036, C-037, C-038 | The screens: Settings > Money now, Home lines, Month lines (C3 F1; A 3a screens) |

Merge in id order: add.js (C-034, C-037, C-039), month.js (C-037, C-039), more.js (C-033, C-039), app.js (C-032, C-035, C-036) and budget.js (C-031, C-032, C-037) are shared files, so parallel branches would conflict. C-039 is the largest card (about 250 lines estimated); its Notes tell the executor to stop and ask for a split at 300 lines (Settings screen vs Home and Month lines). If the planner splits it, ids above C-039 are needed.

Test edits needing owner approval: only `test/model.test.js` in C-029 (SCHEMA_VERSION literal 2 and the defaultData deep-equal). Every other card keeps existing tests unchanged by design (the old income rule stays byte-for-byte for `incomeSourcesFrom === ''`); C-031, C-037 and C-029 Notes say to stop and ask if an existing test fails.

Release consequence: C-029 makes the schema 3 and the pre-update key `my-expenses-before-v3`. The 2.0 copy under `before-v2` is still read as a fallback and deleted together with the new one. C-007's restore, backup labels and the release card C-026 must ship together with C-029 (all in the same release).

## STORYMAP rows to add (Value and Priority are proposals)
| ID | Actor | Activity | Step | Value | Priority | Status |
|---|---|---|---|---|---|---|
| S1.4 | Owner | Sets up | Lists regular income with payday, usual amount and weekend rule | Knows when each income arrives | P1 | planned |
| S1.5 | Owner | Sets up | Enters the money on hand once and corrects it to the bank figure | Starts from the real figure | P1 | planned |
| S2.5 | Owner | Records entries | Confirms income on its payday with the real amount, skips or postpones it | Actual income recorded, forecast stays a forecast | P1 | planned |
| S2.6 | Owner | Records entries | Skips or postpones a subscription reminder; a paid bank row counts as paid | No double entries | P1 | planned |
| S3.7 | Owner | Reviews money | Sees money now, month start and end carried over, and a safe amount per day until payday | Can decide a purchase today | P1 | planned |
| S3.8 | Owner | Reviews money | Reads each month's income as received on its date; months he never had show nothing | Numbers can be trusted | P1 | planned |

Also add to "Slices": `Slice 3 (planned, release 3.0): money model, cards C-029 to C-039.` Existing steps reused: S1.1 (C-034), S1.2 (C-032), S3.1 (C-037), S6.3 (C-029).

## Open owner decisions (they shape the cards; each card lists its defaults)
| # | Question | Options | Recommended default | Where it bites |
|---|---|---|---|---|
| 1 | Does money put into Savings or a goal leave the balance? | a) leaves (set aside, not spendable) b) stays in the balance | a) leaves. One constant `SAVINGS_LEAVES_BALANCE` in C-038 reverses it | C-038, C-039 per-day figure |
| 2 | Past months: keep the virtual salary or write real income entries? | a) keep the old rule for months before the switch month b) write one entry per past month from the frozen plans | a) keep. Nothing is written, history identical; the switch is explicit (C-033 button) | C-029 `incomeSourcesFrom`, C-031 |
| 3 | Weekend payday rule | keep the day / day before (Friday) / day after (Monday), weekend only; or also a Latvian holiday table | Weekend-only rule, default "keep", no holiday table (needs yearly upkeep, B 4.2) | C-030 `paydayDate`, C-033 select |
| 4 | Missed paydays after the app was closed | a) ask for every month since the source started, max 12 b) only the current month | a) ask, oldest first | C-030 `dueIncomes`, C-036 |
| 5 | Home hero | a) keep "left to spend" (budget) and add "Money now" and per-day lines under it b) make "Money now" the hero (C3 F1) | a) for now; reconsider after living with it a month | C-039 |
| 6 | How is the balance corrected? | a) edit the single starting figure (all months shift) b) signed adjustment entries | a) single figure, with a confirm that says months shift | C-038 `correctBalance`, C-039 |
| 7 | Meaning of the starting date | a) money at the start of that date (that day's entries count) b) at the end of that date | a) start of the date; the screen says so | C-038 `balanceAt` |
| 8 | Does an unconfirmed or typed salary count as the source's income? | a) auto-match a Salary-category entry within 25 % of the expected amount (manual and bank-imported) b) only entries created from the reminder | a) auto-match, otherwise typing the salary by hand double counts | C-030 `matchIncomes` |
| 9 | Subscription paid by bank: how to recognise it | a) name as whole words in note or bank text and amount within 25 % b) link by an import rule | a) read-only match, no data changed | C-035 |
| 10 | Old pre-update copy (2.0) after the 3.0 update | a) keep it, show only the newest, delete both on Delete b) delete the old one automatically | a) keep; nothing deleted without a click | C-029 |
| 11 | Savings without a budget share: counted against the spend budget? | a) no (shown as "saved, not part of the spend budget") b) yes, as today | a) no; with a share it counts as today | C-037 |
| 12 | Users on the 2.0 income rule | a) explicit switch in Settings > Paydays b) automatic switch on update with payday day 1 | a) explicit. Until switched their numbers are exactly as in 2.0 | C-033 |

## Not carded (decided out of this slice; need ids above C-039 if wanted)
- Per-month forecast override ("November salary will be 2,350"), "use this amount as the new usual", planning income as average of last N months (B ideas 6): the confirm screen already takes the real amount; an override field would need another schema step.
- Balance from bank statements: opening and closing balance of camt.053 for a reconcile check (B idea 9, now ignored by the importer).
- Closing-balance line in Chart > Year; Month CSV including expected income; projected end-of-month and "dips below zero before payday" warning (B ideas 8, 10).
- A manual Salary entry on a month still on the 2.0 rule still double counts (C3 F2): fixed only after the owner switches (C-033, C-031); a hint in the Add income form for 2.0 users was left out on purpose.
- Add category lowers every other limit silently (C3 F11) and the Settings regrouping (C3 section 3, B 4.3): other topics.

## Risks to check before building
- Nothing was executed; every claim about existing tests staying green is reasoned from reading budget.test.js, analytics.test.js, monthReview.test.js, importUi.test.js and storage.test.js. `npm test` is the first step of every card.
- Cards C-031 to C-033 add a rule keyed on today's date; each new test file passes a fixed `now` and has a `FROZEN_DATE` acceptance line (AGENTS.md rule).
- `src/incomeSources.js` and `src/balance.js` are new modules: both cards edit sw.js, otherwise test/serviceWorker.test.js fails.
- C-036 may hit an ES-module import cycle (budget.js imports incomeSources.js since C-031, and `confirmIncome` needs `freezeMonthPlan`); the card gives the fallback (freeze in app.js).
