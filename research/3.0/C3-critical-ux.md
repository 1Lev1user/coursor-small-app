# C3 - Critical UX and QA review: Settings and the money picture (v3.0 input)

App: My Expenses at http://127.0.0.1:8123/ (served build, not modified).
Method: Playwright (Chromium), fresh isolated contexts, service worker blocked, timezone Europe/Riga, locale en-GB.
Clock: real date 2026-10-04 for first run; `page.clock` fixed at 2026-10-15 10:00 for the money scenario (2026-10-26 for the salary test).
Viewports: phone 390x844, desktop 1280x800, narrow 320x640; light and dark (`prefers-color-scheme: dark`).
Data: synthetic only. User "Tess", budget 1000, usual income 2000, savings 0.
Scripts: `scratchpad/tools/c3-*.mjs`. Screenshots: `scratchpad/discovery/screens/c3-NN-*.png`.
Console: no errors in any run (only the expected "Service Worker registration blocked by Playwright" warning).

Facts are from screenshots, page text dumps or the source in `src/budget.js` and `src/subscriptions.js` (read-only). Estimates are labelled.

---

## 1. Verdict on the other tester's claim

Claim (C1 report): "Left to spend" answers "how much money do I have now".
**Refuted.**

Scenario (2026-10-15): budget 1000, usual income 2000, expenses 550 (1 Oct) + 62.40 (5 Oct) + 18.90 (9 Oct) + 30 (14 Oct) = 661.30, extra income 150 (12 Oct).

| Screen | Label | Value | What it actually is |
|---|---|---|---|
| Home hero | left to spend | €338.70 | budget 1000 - spent 661.30. Ignores all income. |
| Month card | Budget left | €338.70 | same as Home |
| Month card | Cash left | €1,488.70 | 2000 + 150 - 661.30 |
| Chart > Year | Difference | €1,488.70 | same as Cash left |

Evidence: c3-13-money-home.png, c3-14-money-month.png, c3-17-chart-year.png. Source: `monthTotals()` in `src/budget.js` computes `budgetLeftCents = budget - spent` and `cashLeftCents = income - spent`.

"Left to spend" is a budget allowance, not money. The user has €2,150 of income and the hero shows €338.70. Change the budget to 600 and the hero flips to "over budget by €61.30" while the user still has more than €1,400 by the app's own count (c3-21-home-income-below-spend.png).

"Cash left" (Month only) is closer, but it is also not a balance:
- it starts from zero every month. There is no opening balance and nothing carries over from the previous month.
- it counts the full usual income from the 1st of the month, before payday (see F3).
- it double counts when the user logs the real salary (see F2).

**None of the three owner questions can be answered:**
- "How much money do I have now": no screen shows it (F1).
- "How much may I spend per day until payday": no per-day figure and no payday anywhere (F9).
- "What did I start the month with": no opening balance concept (F1).

---

## 2. Findings (ranked)

Severity scale: blocker / major / minor / cosmetic.

### F1 - No current balance anywhere; the hero number is a budget allowance - BLOCKER
- WHERE: Home hero "left to spend"; Month "Budget left / Cash left".
- ACTION: Set up with budget 1000 and income 2000. Add 4 expenses and 1 extra income. Look for "money I have now".
- EXPECTED: One clear "Money now" figure (opening balance + income received to date - spending to date), and a starting figure for the month.
- ACTUAL: The Home hero shows €338.70 (budget minus spent). Cash left €1,488.70 appears only on Month and resets every month. There is no opening balance and no carry-over. c3-13-money-home.png, c3-14-money-month.png.
- SUGGESTION: v3 needs a real balance model: a starting balance entered once, monthly carry-over, and income counted on its date. Make "Money now" the Home hero. Show "left to spend in budget" as a secondary line.

### F2 - Logging the real salary double counts it; "Salary" is offered in the "extra income" form - BLOCKER
- WHERE: Home > Add income (also Settings > Income > Add extra income), category dropdown.
- ACTION: Add income: category Salary, €2,000, 25 Oct, note "October salary".
- EXPECTED: The app either replaces the usual income for that month or warns "Your usual salary is already counted".
- ACTUAL: The toast reads "Extra income added €2,000.00 Salary". Month income becomes €4,150 and Cash left €3,488.70. Chart Income lists "Usual salary (Plan) €2,000" and "Salary €2,000" side by side. c3-48-salary-logged-double.png, c3-49-salary-double-chart-income.png. Source: `plannedIncomeCents()` drops the planned salary only when the salary row came from a bank import (`importId` set). It never does this for a manual entry.
- SUGGESTION: In v3, salary is a dated income entry: generated as "expected" on payday and confirmed or edited by the user. Remove the planned-vs-logged duality. Until then, remove "Salary" from the extra-income dropdown, or treat a manual Salary entry like an imported one.

### F3 - Usual income is credited on the 1st, whatever the payday - MAJOR
- WHERE: Month "Cash left", Chart Income/Year.
- ACTION: View October on 15 Oct (before a typical payday of the 25th).
- EXPECTED: Income appears on payday. Before payday it is shown as "expected on 25 Oct", not as money.
- ACTUAL: The full €2,000 is counted for the whole month from day 1. There is no payday setting and the salary never appears as a dated entry in Month > Entries (only the €150 extra income does). c3-14-money-month.png. Source: `monthTotals()` adds `plan.usualMonthlyIncomeCents` with no date.
- SUGGESTION: Income sources with a payday (day of month, with a weekend rule) and an amount per month, plus several sources per month. These are the owner's v3 goals. Show expected income as a dated "pending" row in Month.

### F4 - Phantom income in every past month, including months before the app was installed - MAJOR
- WHERE: Month, previous-month arrow.
- ACTION: Go from October 2026 back to September 2026, then back to September 2025.
- EXPECTED: Months with no data show nothing, or "before you started".
- ACTUAL: Every month shows "Income €2,000.00 · Cash left €2,000.00". c3-18-month-september.png, c3-19-month-sept-2025.png. If cash carried over naively in v3, these phantom months would invent about €24,000 a year.
- SUGGESTION: Store a start date. Months before it show nothing. Carry-over must be built only from real or confirmed income entries.

### F5 - Month and Year disagree on income - MAJOR
- WHERE: Chart > Year vs Month.
- ACTION: Compare 2026 totals.
- EXPECTED: The Year income equals the sum of the Month incomes.
- ACTUAL: Year 2026 shows Income €2,150 and Difference €1,488.70 (c3-17-chart-year.png). Month shows €2,000 income for September, August and every other 2026 month (c3-18). Summed, that is €20,150.
- SUGGESTION: One function for "income in month", used by every view, with the start-date rule from F4.

### F6 - Saving the plan silently rewrites past months - MAJOR
- WHERE: Settings > Plan > Save plan.
- ACTION: On 15 Oct change the budget 1000→600 and the income 2000→500. Save. Open September and August.
- EXPECTED: Past months keep the plan they had, or the user is asked "Apply from this month / also to past months?".
- ACTUAL: The only feedback is a "Plan saved" toast. September changed from budget €1,000 / income €2,000 to €600 / €500. August changed the same way. c3-20-plan-saved-feedback.png, c3-22-month-income-below-spend.png. Cause: past months without a frozen `monthPlans` snapshot read the live settings.
- SUGGESTION: Make plans effective-dated ("from October 2026"). Freeze every month that has any data. The confirmation should state the month the change applies from. This is a precondition for "salary varies by month".

### F7 - First-run Home shows a review of a month the user never had - MAJOR
- WHERE: Home, immediately after setup (real date 4 Oct).
- ACTION: Complete setup and land on Home.
- EXPECTED: No review card. September has no data.
- ACTUAL: The card reads "Review after September 2026? Last month: cash left €2,000.00 · income €2,000.00 above spend budget". It offers "Add €1,000.00 to Savings" and "Change spending budget". c3-02-home-after-setup.png.
- SUGGESTION: Show the month review only for months after the start date that have at least one entry.

### F8 - Settings is 9 phone screens long; Backup sits behind every category - MAJOR
- WHERE: Settings.
- MEASURED: phone scroll height 7,638 px (9.0 screens); desktop 6,336 px (7.9 screens). Section tops on phone: Plan 342, Income 871, Subscriptions 1,888, Categories 2,665, Goals 5,160, Import 5,727, Rules 5,971, Bank layouts 6,171, Backup 6,351, Rights 6,797.
- To reach Backup, the user scrolls past the Plan form, the full extra-income form, the subscription form, 4 categories with 13 subcategory rows (about 2,500 px, 3 screens), the goal form, Import, Rules and Bank layouts.
- The chip navigation helps but is static (not sticky). After a jump it is off screen and there is no back-to-top. c3-03-settings-phone-full.png, c3-04-settings-phone-top.png, c3-10-settings-phone-chip-backup.png.
- SUGGESTION: See section 3. Use collapsed rows that open detail sheets, a sticky section index (or an index page with sub-pages), Backup near the top, and bank import behind "Advanced".

### F9 - No "per day until payday" figure exists - MAJOR
- WHERE: Home, Month, Chart.
- ACTION: Look for a daily allowance.
- EXPECTED: "€X per day for N days until payday" on Home.
- ACTUAL: Absent everywhere. `grep` for per-day or daily logic in `src` finds nothing. c3-13, c3-14, c3-15.
- SUGGESTION: Once payday and balance exist: (money now - committed bills before payday) / days to payday. Show it under the hero.

### F10 - Home says subscriptions are "added for you"; Settings says they are only reminders - MAJOR (trust)
- WHERE: Home helper line vs Settings > Subscriptions > Add subscription.
- ACTUAL: Home reads "Salary and subscriptions are added for you." (c3-13, c3-45). Settings reads "It only reminds you." (c3-08-settings-phone-chip-subscriptions.png). The code confirms reminders only (`dueSubscriptions()` in `src/subscriptions.js`). The Home line also says "salary is added", yet salary is never added as an entry (F3).
- SUGGESTION: Fix the copy now: "Your usual salary is counted automatically. Subscriptions remind you on their day."

### F11 - Adding a category silently cuts every other category's limit - MAJOR
- WHERE: Settings > Categories > Add category (Share: Flexible, the default).
- ACTION: Add a 5th category mid-month.
- EXPECTED: A preview such as "This lowers Necessary, Random, Others from €333.33 to €250.00", or a choice of share.
- ACTUAL: All flexible limits drop from €333.33 to €250.00 in the current month with no notice. "Necessary expenses over by" goes from €309.07 to €392.40. c3-25-extreme-month.png vs c3-14-money-month.png.
- SUGGESTION: Show the redistribution before saving. Consider "No limit" as the default share for new categories.

### F12 - The same words mean different things - MINOR (high confusion cost)
- "Plan" (Settings section) is name + budget + usual income. "Edit plan" (on each category and on Subscriptions) edits a category's share of the budget. "Usual salary (Plan)" on Chart is income. c3-04, c3-47-desktop-subscriptions-editplan.png, c3-16-chart-income.png.
- "Income" (Settings section) holds only the extra-income form and the list of extra entries. The usual income lives under "Plan".
- "Extra income" is the button label even when the category is Salary (F2).
- "Budget share" under Subscriptions shows "No limit · tracks spend as % of budget", which describes a category, not the recurring list under it.
- "Spend budget", "monthly spend budget", "budget" and "planned" are all used for the same number.
- SUGGESTION: Use one vocabulary: "Monthly budget", "Category limit" (button "Limit"), and "Income" for all money in (sources, payday, entries). Drop "Plan" as a user-facing word.

### F13 - Plan validation: 0 accepted, thousands separator rejected with a wrong message - MINOR
- ACTION: Budget "0" → saved, toast "Plan saved". "12,345.67" → "Enter a valid amount of zero or more." c3-23-plan-invalid-budget.png.
- EXPECTED: 0 should be refused or confirmed (it makes every expense "over budget"). The error message should say the format is the problem, not the sign. The Add expense placeholder itself says "12.50 or 12,50", so users will type commas.
- SUGGESTION: Accept a thousands separator when the input is unambiguous. Otherwise use "Use 12345.67 or 12345,67".

### F14 - Add-expense form: focus is lost on open, Escape does nothing - MINOR (a11y)
- ACTION: Keyboard only. Tab to "Add expense" and press Enter.
- ACTUAL: Focus lands on `<body>`, so the next Tab restarts from the top of the form. Escape does not close the form. One stop inside the date field (the picker button) has no visible outline. Otherwise the tab order is logical (category → + → subcategory → currency → amount → note → + → date → template → submit), outlines are 2-3 px solid green, and Enter in the note field submits. Validation then focuses the missing subcategory with an inline message, which is good. c3-39-kbd-focus-add-button.png, c3-40-kbd-focus-amount.png, c3-41-kbd-after-submit.png.
- SUGGESTION: Focus the Category select (or the form heading) on open. Make Escape go back to Home. Add a focus style to the date picker indicator.

### F15 - Unsaved Plan edits survive leaving Settings - MINOR
- ACTION: Type 1234 into the budget, switch to Home, return to Settings.
- ACTUAL: The field still shows 1234 while the saved budget is 600. There is no unsaved marker and no warning.
- SUGGESTION: Reset fields to the saved values on re-entry, or mark them "Unsaved changes" and offer Save or Discard.

### Further findings
| # | WHERE | ACTUAL | Sev | Screenshot | Suggestion |
|---|---|---|---|---|---|
| F16 | Settings top | "Settings" appears twice (H1 + H2). An orphan note "Leftover 100% is split equally across 3 flexible categories" sits above Plan, with no context. | cosmetic | c3-04 | Remove the H2. Move the note into Categories. |
| F17 | Settings > Categories, subcategory rows | "Rename" sits on the right and "Delete" wraps to its own line on the left. Each subcategory takes about 123 px. | cosmetic (adds about 800 px) | c3-09-settings-phone-chip-categories.png, c3-38 | One row per subcategory with an overflow menu, or edit inside a category sheet. |
| F18 | Chart > Spending legend | Zero-value rows faded to opacity 0.55. Effective contrast: "no limit" 2.61:1 light / 3.15:1 dark, names 3.71:1 (light). Fails WCAG 4.5:1. | minor | c3-15-money-chart.png | Use a muted colour that meets 4.5:1 instead of opacity. |
| F19 | Chart > Spending | Necessary €642.40 vs "planned €333.33" has no over-limit marker. Month shows a red bar and "over by". | minor | c3-15 vs c3-14 | Same over state in both views. |
| F20 | Defaults | With savings 0, the 3 flexible categories get €333.33 each. Rent (550) makes "Necessary" "over by" on day 1. | minor | c3-14 | Ask for fixed costs in setup, or default Necessary higher. |
| F21 | 320 px Chart > Year | The by-category table is 346 px in a 288 px card. The "Share" column is clipped ("Shar", "100.0" cut) and names break mid-word ("Necessar y expense s"). Triggered by a large amount column. | minor | c3-31-narrow-year.png | `overflow-wrap:anywhere` only on names, `white-space:nowrap` on numbers, a horizontal scroll wrapper. |
| F22 | 320 px Home hero | The amount breaks mid-number ("€99,999,661.3" / "0"). "Add income" wraps to 2 lines. The footer takes 2 lines on top of the tab bar. | minor (extreme amounts) / cosmetic | c3-27-narrow-light-home.png | Fluid font-size for the hero. Never wrap inside a number. |
| F23 | Add expense amount | €99,999,999.99 accepted with no sanity check. | minor | c3-24-extreme-home.png | Confirm amounts over a threshold (e.g. 10x the monthly budget). |
| F24 | Settings > Income list | Date shown as "2026-10-12". Everywhere else it is "12 Oct". | cosmetic | c3-23 | Use one date format. |
| F25 | Home | A permanent red "No backup yet. If this phone is lost..." banner takes prime space. It reads "phone" on desktop. A second backup reminder also appears as an overlay in Settings. | minor | c3-13, c3-45 | Use one calm reminder with a snooze. Use device-neutral copy. |
| F26 | Desktop 1280 | No max-width. Name/budget inputs are 1,216 px wide. A mobile bottom tab bar is used on desktop. | cosmetic | c3-06-settings-desktop-top.png, c3-45-desktop-home.png | Cap content at about 720 px. Consider a side nav at ≥1024 px. |
| F27 | Settings > Add category, Share radios | Native radios are 13x13 px. Their labels are 87-103 x 44 px, so the tap target is acceptable. | none (verified OK) | c3-47 | - |
| F28 | Settings > Income | A second "Add extra income" form duplicates Home > Add income. Settings is the wrong place for a transaction. | minor | c3-07-settings-phone-chip-income.png | Remove it from Settings. Keep the income sources definition there. |
| F29 | Category delete | The inline confirmation is good ("Delete Others? Its expenses will move to Uncategorised.") but does not say how many expenses are affected. | cosmetic | c3-42-confirm-category-Delete.png | "12 expenses will move to Uncategorised." |
| F30 | Trends | "October 2026 compared with September 2026": September has no data, yet it shows "up €642.40". | cosmetic | (text dump, c3-07 run) | Hide the comparison when the previous month is empty. |

### Verified as working (no finding)
- Reload persistence: an expense added by keyboard ("Bread") survives a reload. All states survive new contexts (localStorage).
- Expense amount validation: 0, -5, 0.001 and "abc" are refused with inline messages. €0.01 is accepted.
- Delete confirmations are inline with Cancel for categories, subcategories and entries (c3-42, c3-43-confirm-subcategory-Delete.png, c3-44-confirm-entry-delete.png).
- Text contrast: automated scan of every text node on Home, Month, Chart, Settings and Add in light and dark: 0 failures, apart from the opacity-faded rows in F18.
- Tap targets: everything is 44 px or larger except native radios and the checkbox, whose labels are large enough.
- Dark mode is readable and consistent (c3-33-phone-dark-home.png, c3-34, c3-35, c3-36, c3-37, c3-38).
- 320 px: no horizontal page scroll on any main screen (only the Year table issue, F21).
- Long category names and notes wrap without overflow at 390 px (c3-25).

---

## 3. Proposed Settings structure (v3)

Principle: Settings defines how money behaves (balance, income, budget). Transactions belong on Home and Month. Rarely used bank-import machinery goes behind "Advanced". Every section is a collapsed row with a one-line summary that opens a detail sheet. The index fits on one phone screen.

| Order | Section (row summary) | Contains | Why moved |
|---|---|---|---|
| 1 | **Money now** - "€1,488.70 on 15 Oct" | Starting balance (once), "correct balance" action | Answers the owner's first question. A balance needs one place to set and fix it. |
| 2 | **Income** - "2 sources · next payday 25 Oct" | List of income sources: name, usual amount, payday rule, per-month override ("November: €2,350") | Payday, varying salary and several incomes all live here. Replaces "Usual monthly income" under Plan. |
| 3 | **Monthly budget** - "€1,000 · from Oct 2026" | Budget amount with effective-from month | Effective-dating fixes F6. Separate from income because they mean different things. |
| 4 | **Categories & limits** - "5 categories · 2 over" | Collapsed category rows; tap → sheet with limit, subcategories, rename, delete; the leftover-split note | Removes about 2,500 px. "Limit" replaces "Edit plan" (F12). Subscriptions' "budget share" becomes a normal category limit. |
| 5 | **Recurring payments** - "3 · next: Spotify 5 Nov" | Subscriptions list/add | Kept but simplified; the copy matches behaviour (F10). |
| 6 | **Goals** - "1 open" | Goals | Unchanged, collapsed. |
| 7 | **Backup & data** - "Last backup: never" | Export/import JSON, month CSV, last backup date | Moved from screen 7.5 to the first screen. Data loss is the app's biggest risk. |
| 8 | **Advanced: bank import** (collapsed) | Import statement, Rules, Bank layouts | Three power-user sections; most users never open them. |
| 9 | **Profile & appearance** | Name, (future: theme) | Name is not part of the money plan. |
| 10 | **About & rights** | Rights, privacy | Reference text at the bottom. |

Removed from Settings: the "Add extra income" form (F28), the duplicate "Settings" H2 and the orphan leftover note (F16).
Index behaviour: sticky, or an index page with back navigation. Each detail has its own Save, with "Unsaved changes" handling (F15).

---

## 4. Scripts and evidence index
- `tools/c3-lib.mjs` - helper (isolated context, screenshot counter, control/heading dumps)
- `c3-01/02` setup and first Home · `c3-03/04` Settings measurement and chip jumps · `c3-05` forms
- `c3-06` money scenario · `c3-07` Chart income/year/trends and past months · `c3-08` plan changes and validation
- `c3-09` extremes and long names · `c3-10` 320 px and dark · `c3-11` keyboard and reload · `c3-12/16` contrast and targets (light/dark)
- `c3-13` confirmations · `c3-14` desktop and Edit plan · `c3-15` salary double count · `c3-17` faded-row contrast
- Saved states: `discovery/c3-state/{fresh,money,extreme}.json`
