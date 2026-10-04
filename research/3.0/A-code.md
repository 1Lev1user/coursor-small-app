# My Expenses 3.0 - code discovery (A-code)

Repo: C:\Users\krilo\Desktop\Projects\coursor-small-app (read-only). Current version 2.0.0 (package.json:3), SCHEMA_VERSION 2 (src/model.js:1). 13.2k lines of JS, no dependencies.

Conventions: `file:line` are file-relative. "INFERRED" = derived by reading code, not executed. I did not run `npm test` and did not run a probe script (a probe that wrote a temp file into the repo was blocked by the permission layer, so I did not retry). Every "double counts" / "future month" claim below is therefore code-derived.

---------------------------------------------------------------------------
## 1. Inventory: what the app does today

Shell
- 4 tabs: Home (internal id `add`), Month, Chart, Settings (internal id `more`); Import is a sub-view of Settings. app.js:23-29, index.html:730-735.
- First-run Setup blocks the tabs until done: name, monthly spend budget, Savings (EUR or %), usual monthly income. setup.js:169-262, 298-368. Tabs disabled until `setupComplete` app.js:473-490.
- Toast with Undo (8 s) only on Month delete. app.js:54-84, month.js:525-537.
- Subscription "due" modal overlay on any screen once the due day has passed and nothing is logged this month: confirm amount or delete the subscription. app.js:279-403, 509-515; subscriptions.js:29-40.
- Update bar for the service worker. app.js:527-564. Storage-problem screens ("Update needed", "Data problem"). app.js:424-465.
- Persistence: whole JSON blob in localStorage key `my-expenses-v1`, written on every save. storage.js:3, 175-191. Persistent-storage request storage.js:193-215.

Home (add.js, `renderHome` 630-711)
- Big figure "left to spend" / "over budget by" = monthly budget - spent (NOT cash based). add.js:633-652.
- Buttons "Add expense", "Add income". add.js:654-669.
- Quick add: one-tap template buttons (templates are created from the Add expense form via "Save as template"). add.js:576-628, 1081-1091, 1495-1511.
- Note "Salary and subscriptions are added for you." add.js:683-687 (see section 4: inaccurate for subscriptions).
- Backup reminder card, 3 levels at 14/30/60 days, "Later" snooze 7 days (not at 60+). add.js:57-60, 497-574.
- Savings-goal card (nearest deadline) with "Add money". goalCard.js:31-165.
- Month-review card on days 1-5: previous month extra income / cash left / over budget, "Add X to Savings", "Review categories", "Change spending budget", "Not now". monthReview.js:12-44, add.js:298-407.
- "Recent": last 3 entries across expenses+incomes, "Open Month". add.js:433-478; budget.js:372-389.

Add expense (add.js `renderExpenseForm` 1017-1580)
- Category (+ inline "add category"), subcategory, amount, currency choice with foreign amount + euro amount, note (+ "add note as subcategory"), date, "Save as template". Always saves `refund: false` (add.js:1485): a refund can only be set later by editing in Month (month.js:583-593).
- "Added" confirmation screen with OK. add.js:251-286.

Add income (add.js `renderIncomeForm` 713-999)
- Category (any income category, incl. Salary), amount (EUR only, no currency fields), date, note. Title "Add extra income". add.js:116, 726-731, 737-739, 909.

Month (month.js `render` 949-968)
- Month navigator (arrows + month picker). monthNav.js:14-46.
- Summary card: "Budget left" and "Cash left" headlines, "Spent X of Y . Income Z". month.js:127-148.
- Comparison with previous month. month.js:150-163.
- Categories card: per-category spent vs limit, progress bar, "over by", "No limit" mode. month.js:165-241.
- Search panel (whole history): text (case/diacritics-insensitive), category, type, min/max amount, date range, 100-result cap, no totals. searchPanel.js:7, 211-285; search.js:58-77.
- Entries list of the month (expenses + incomes, newest first), inline Edit (incl. currency, Refund checkbox) and Delete with confirm and Undo. month.js:261-276, 540-858, 860-947. Imported entries show "Imported" tag, bank text. entryDisplay.js:30-56, month.js:872-875.

Chart (chartView.js)
- 4 views: Spending (donut + legend, drill into subcategories), Income (donut; "Usual salary (Plan)" + extra income by category), Trends, Year. chartView.js:9-14, 90-206.
- Trends: 12-month spending bars with budget ticks and average line, "Show as table" fallback, "Changes vs last month" top 5 categories vs previous month and 6-month average. trends.js:154-275, 306-346, 356-397; analytics.js:74-121.
- Year: year navigator, Spent / Income / Difference, bars, by-category table with share, Year CSV (Europe/Standard). year.js:115-189; analytics.js:128-197.

Import (views/import.js, src/import/*) - out of scope (another agent).

Settings (more.js:24-65): see section 4 for every sub-section.

Domain model (model.js:69-142)
- settings{userName, monthlyBudgetCents, usualMonthlyIncomeCents, setupComplete, lastBackupISO, othersSeeded, monthReviewDismissedFor, backupSnoozedUntil}; categories (with subcategories, pinned/percent/limitMode/limitCents), incomeCategories (default Salary, Other), expenses, incomes, subscriptions, monthPlans{}, rules, bankLayouts, imports, templates, goals.
- Expense: id, categoryId, subcategoryId, amountCents (always EUR), note, date, currency, originalAmountCents, refund, importId, bankRef, bankText, fingerprint, goalId, subscriptionId (the last only set by the due prompt, app.js:173). Income: same minus refund/goal (model.js:155-172). Created without those fields in several places and filled by `normalise` on load.
- Month plan snapshot `monthPlans[YYYY-MM]` = budget + usual income + resolved category entries, frozen the first time any entry lands in that month (freezeMonthPlan, budget.js:182-188) and refreshed for the current month on Plan save (budget.js:190-198; plan.js:111-112).
- Calculations: `monthTotals` budget.js:200-252; `incomeBreakdown` 309-369; plan resolution 69-123. Money is integer cents; `splitShares` avoids lost cents (money.js:75-95). Dates are 'YYYY-MM-DD' strings, month key 'YYYY-MM'.

Quality baseline: 44 test files (test/), skip link (index.html:727), aria-live toasts (app.js:61-62), focus trap in modal (app.js:253-277), reduced-motion and dark theme in CSS (style.css:134, 894, 957), automated contrast test, chart data tables for screen readers (trends.js:118-152), schema migration framework with tested steps (model.js:174-217; storage.js:39-49).

---------------------------------------------------------------------------
## 2. Gaps (ranked by user value, then effort; S <= 1 card, M = 2-4 cards, L = 5+)

| # | Gap | Evidence | Value | Effort |
|---|-----|----------|-------|--------|
| 1 | No balance / carry-over (money on hand), no payday, one flat "usual income" with no day; salary forecast vs actual only via bank import | see section 3 | Very high (owner's 4 features) | L |
| 2 | Home figure ignores income and balance; no "per day left" | add.js:633-652. `daysInMonth` exists months.js:127 so "X per day for N days" is cheap | High | S |
| 3 | Settings is one 9-section, ~1500-line-of-UI scroll with confusing names | section 4 | High | M |
| 4 | Quick-add templates cannot be edited or deleted anywhere in the UI. `deleteTemplate` exists (templates.js:54) and is tested (test/templates.test.js:30) but no view imports it (grep over src/views: only add.js uses addTemplate/templateToExpense). The list also has no cap | add.js:607-628 | Medium (clutter grows forever) | S |
| 5 | Cannot record a refund when adding an expense (hard-coded `refund: false`) | add.js:1485 vs month.js:583-593 | Medium | S |
| 6 | Manual "Salary" income double counts with the plan income: `hasImportedSalary` requires `importId` (budget.js:26-31) and the Add income category list offers Salary (add.js:737-739). INFERRED from code, not executed | budget.js:34-36, 237-238 | High (silent wrong number) | S-M (folds into feature c) |
| 7 | Future months show the usual income as if received: `monthTotals` has no "has this month started" guard (budget.js:237); only history/year views strip it (analytics.js:17-32). So Month and Chart>Income for next month show a full salary and Cash left. INFERRED | budget.js:237 vs analytics.js:22-31 | Medium | S (folds into b) |
| 8 | Month CSV omits plan income, Year CSV includes it: the same month gives two different income numbers across exports. csv.js:65-119 (entries only) vs analytics.js:186 (monthTotals) | | Medium | S |
| 9 | No export of the whole history, no search-result export, no CSV re-import of the app's own export | csv.js:121; year.js:104-108 | Medium | M |
| 10 | Data validation: `normalise` checks only that top-level fields are arrays/object (model.js:231-249), not entry shapes (amountCents integer, date format, ids). A hand-edited or damaged backup with a bad `date` would reach `.localeCompare` (budget.js:378, search.js:67) and break screens. INFERRED | model.js:219-356; backup.js:20-34 | Medium (robustness) | M |
| 11 | No per-month budget override / one-off plan change. Month plans are frozen and nothing in views edits them (grep monthPlans in src/views: only freeze/rollback) | budget.js:182-188 | Medium | M |
| 12 | Number/locale: money always formatted `en-IE` (money.js:1-4) and UI is English only, while the owner uses RU/LV/EN. Decimal comma input is accepted (money.js:23) but not displayed | | Medium | M-L (i18n is L) |
| 13 | Storage: whole-JSON rewrite on every save into localStorage (storage.js:186). Typical ~5 MB browser quota (INFERRED, not measured). No size indicator, no warning near the limit. A bank-import-heavy user will grow this | | Medium, rises with import use | M (indicator S, IndexedDB L) |
| 14 | No version shown anywhere in the app (grep of src/views for version: none besides update texts) | | Low-Med (support) | S |
| 15 | Reminders exist only while the app is open (due prompt at render, app.js:509-515); missed months are never caught up (`dueSubscriptions` looks at the current month only, subscriptions.js:29-40). A payday prompt reusing this pattern would inherit the same limit | | Medium | M |
| 16 | No auto-backup / share-sheet export; JSON download via anchor click (files.js:1-9). On iPhone a standalone PWA download may be awkward (INFERRED) | | Medium | M |
| 17 | No "delete all data" / reset (grep: no match for delete/erase/reset all) | | Low-Med (privacy at hand-over) | S |
| 18 | No app lock / privacy screen | | Low | M |
| 19 | Search: no sum of results, results read-only, 100 cap | searchPanel.js:269-276 | Low | S |
| 20 | Undo only on Month delete (owner decision F2, anchor.md); Settings income delete says "cannot be undone" (income.js:278) | | Low | S |
| 21 | Recurring expenses only remind (do not auto-create); no recurring income at all | subscriptions.js; settings/subscriptions.js:372-373 | Medium | M (feature d) |
| 22 | Reports beyond Chart: no net-worth, no category budgets history, no per-category yearly trend, no custom date range report | analytics.js | Low-Med | M |

Out of scope per SPEC.md:115-119: accounts, cloud sync, server, multi-currency budgets.

Accessibility: baseline is good (see section 1). Weak points: the long Settings page with only anchor links (more.js:27-41); three different editors for the same entry (below); not tested with a screen reader (INFERRED - no evidence either way).

---------------------------------------------------------------------------
## 3. The four named 3.0 features

### Shared facts that drive all four

1. There is NO income entry for the usual salary. It is a virtual number: `settings.usualMonthlyIncomeCents` (model.js:75), copied into each month's frozen plan snapshot (budget.js:158-164) and added to the month's income inside `monthTotals` (budget.js:237-238):
   `incomeCents = usualIncomeCents + extraIncomeCents`, `cashLeftCents = incomeCents - spentCents` (budget.js:249).
   It has no date, so it never appears in the Month entry list (month.js:261-276 lists only `data.incomes`/`data.expenses`), not in Search (search.js:61-62), not in Month CSV (csv.js:65-103), but it does appear in Chart>Income as "Usual salary (Plan)" (budget.js:326-334), in Year CSV and Year totals (analytics.js:128-157, 186) and in the month review (monthReview.js:22-43).
2. The only "forecast vs actual" mechanism: if any income in category `salary` with a non-empty `importId` exists in the month, the usual income for that month becomes 0 (budget.js:23-36; test/budget.test.js:735-749). Import UI tells the user "Imported salary replaces your usual income" (import.js:1138-1144) and suggests Salary for money in within 15% of the usual income (import.js:148-160).
3. `monthTotals(data, monthKey)` takes no `now`; it cannot know whether the payday has passed. Date-dependent tests must pass a fixed `now` (AGENTS.md:101).
4. Savings contributions and goal money are ordinary expenses in the Savings category (goals.js:187-219), so they reduce Cash left (budget.js:230-233).
5. Subscriptions already model "an item that recurs on a day of the month, with an amount, that prompts to confirm and then creates a real entry linked back with `subscriptionId`" (subscriptions.js:16-40; app.js:154-196). That is the closest existing pattern for payday income.
6. Schema machinery: bump `SCHEMA_VERSION`, add one `MIGRATIONS[n]` step lifting by exactly one, with a test (README.md:60, AGENTS.md:96; model.js:178-217). Backups go through `normalise`, so old backups auto-upgrade (backup.js:20-34).

### a. Current balance (opening money carried month to month)

Today
- No balance concept anywhere. Closest: per-month `cashLeftCents` (budget.js:249), shown as "Cash left" on Month only (month.js:135-137). It does not carry over: January's leftover is not in February. Home shows budget-based "left to spend" only (add.js:633-652).
- Month review can convert a surplus into a higher Savings limit (monthReview.js:70-95) - a plan change, not a balance.

What must change
- Data: an anchor in settings, e.g. `settings.balanceStart = { cents, date }` (date, not month: the owner may enter "100" on 15 Oct; entries before that date must be excluded). Recommended: store ONLY the anchor and derive each month's opening/closing, never store closing balances (edits to past entries, Undo, bank-import undo and restore would make stored closings drift). Optional later: signed "balance adjustment" entries to reconcile with the bank.
- Calculation: new pure function (budget.js or new balance.js) `balanceFor(data, monthKey, now)` = anchor + sum over days >= anchor.date, months <= monthKey of (income - spend). `monthTotals` is month-granular (`isInMonth`, budget.js:202, 234); the anchor date needs entry-level `date >= anchor.date` filtering in the first month. Add `openingCents`, `closingCents` to the `monthTotals` result.
- Decisions the code cannot answer: (i) does balance count only actual entries or also expected-but-not-yet-received income (see b/c)? (ii) Savings expenses: leave the balance (current behaviour) or stay as the user's money? (iii) bank-import "transfer" rows are not counted (README.md:32) - OK. (iv) months before the anchor: show no balance.
- Screens: Plan or Setup field "Money on hand now (EUR)" plus date (setup.js:335-346, plan.js:158-168); Month summary adds "Starts with / Ends with" (month.js:127-148); optional Home line "Balance now"; Chart>Year maybe a closing-balance line; "editable" requirement -> editing the anchor changes every derived balance, so show a one-line warning.
- Schema: SCHEMA_VERSION 2 -> 3; `MIGRATIONS[2]` adds `settings.balanceStart = null` (and whatever fields b/c/d add); `normalise` default (model.js:261-283 pattern). Update `defaultData` (model.js:72-81).
- Backup "Settings only" merge copies `incoming.settings` wholesale except LOCAL_SETTINGS (backup.js:36, 52-56). A balance anchor is bound to local entries, so it must be added to LOCAL_SETTINGS or the merge will pair another device's anchor with this device's entries.
- Side effect to handle: `PRE_UPDATE_KEY` is `my-expenses-before-v${SCHEMA_VERSION}` (storage.js:5). Raising the schema to 3 makes the key `...before-v3`: the existing `my-expenses-before-v2` copy (from the 1->2 upgrade) is no longer read, shown or deletable and stays in localStorage (quota). Backup UI hard-codes "Data from before version 2.0" and filenames `before-2.0` (backup.js:276-281, 320). Needs generalising (INFERRED from storage.js:5-6, 51-57 and backup.js; not executed).
- Tests to change/add: test/model.test.js (default shape, ~line 98), migration test for step 2->3 (new), test/budget.test.js (monthTotals 407-455), test/analytics.test.js (74, 184), test/backup.test.js (merge), test/monthReview.test.js. Balance tests need fixed `now`.
- Size: L (calc + migration + 3 screens + tests); the calculation itself is M.

### b. Income on payday instead of from the 1st

Today
- Whole usual income counts for the month from day 1: Month "Cash left" on 1 Oct already includes the full October salary (budget.js:237-238, month.js:135-137). Future months too (no guard, budget.js:237; INFERRED) - only analytics.js:17-32 strips it for months not yet happened or not in use.
- No payday setting exists. Only recurring-day concept is `subscription.dayOfMonth` (settings/subscriptions.js; subscriptions.js:35).
- Home's "left to spend" does not use income, so this problem shows only in Cash left, Chart>Income, Year totals/CSV and the month review - not on the Home figure. Ask the owner whether the Home figure should become balance-aware.

What must change (two options)
1. Light: add `settings.paydayDay` (1-31, clamped by `clampDay`, months.js:132). Count the usual income only when `today >= payday` for the current month, always for past months, never for future. Needs `monthTotals(data, monthKey, now)`. Small, but the income is still virtual (still invisible in entries/search/CSV) and still cannot hold a different actual amount.
2. Recommended: replace the virtual number with scheduled income (see d): an expected-income item with a day; on/after that day the app prompts "Salary arrived? confirm amount" (same overlay mechanism as subscriptions, app.js:279-403) and creates a real `incomes` entry dated that day. Until then the amount is "expected", shown separately (not in Cash left or balance). This fixes b, c and d with one concept and removes the invisible-income problem.
- Migration question for the owner: past months were counted with a virtual salary (analytics.js:17-32). Either keep the old rule for months before the cut-over month (frozen plans keep `usualMonthlyIncomeCents`, budget.js:158-164) or write real income entries for them. The second changes entry counts, CSV and totals and cannot be undone by a simple Undo; the first keeps history identical and needs two code paths for the old months.
- Missed paydays: `dueSubscriptions` only looks at the current month (subscriptions.js:29-40); a skipped month would be silently lost, so scheduled income needs catch-up for months after install.
- Interaction to rewrite: imported-salary replacement (budget.js:26-36) must match the schedule (link by `scheduleId`/category+window like `subscriptionId`, subscriptions.js:16-18) instead of "any imported salary".

### c. Salary differs month to month (forecast vs actual)

Today
- One number for all months. Editing it in Plan changes the current month's frozen snapshot and all unfrozen future months (plan.js:111-112, budget.js:190-198); past (frozen) months keep theirs and no UI edits a past/other month's snapshot (grep of src/views: monthPlans only appears in freeze/rollback code).
- The only way a real figure replaces the forecast is a bank-imported Salary entry (budget.js:26-36). A manually entered Salary entry does NOT replace it, because `hasImportedSalary` requires `importId`; so forecast + manual actual are both counted (INFERRED from budget.js:26-31 + add.js:737-739). The Add income form text says "Extra income only ... salary is added automatically" (add.js:726-731) yet Salary is selectable in the category list (add.js:737-739).
- Plan snapshot stores `usualMonthlyIncomeCents` (budget.js:158-164, asserted by test/budget.test.js:312-331).

What must change
- Per-month expected amount: e.g. `monthPlans[key].expectedIncomeCents` (override) editable on Month ("Expected income this month"); or, in the scheduled-income design, an expected amount per schedule per month.
- Rule generalised from "imported salary" to "received income linked to that schedule/category in that month replaces the expectation" (works for manual entries too). Show both numbers: "Expected 2,000 / Received 2,150 (+150)".
- Calculation: `monthTotals` returns `expectedIncomeCents`, `receivedIncomeCents`, `incomeCents` (= received + still-expected-not-yet-due only if the owner wants a projection) and variance; `incomeBreakdown` (budget.js:309-369) and Year view (year.js:130-142) read them.
- Schema: new optional field per month plan snapshot; `buildPlanSnapshot` lists its fields explicitly (budget.js:158-164) while `copyPlanSnapshot` spreads (budget.js:167-172); `actualOnlyPlan` in import/core.js:569-580 sets `usualMonthlyIncomeCents: 0` and must be updated. Migration: no existing month needs the new field if absent = "use schedule default".
- Tests: test/budget.test.js:312-331 (frozen shape), 407-455, 571-640, 735-749; test/importCore.test.js:402; test/importEndToEnd.test.js:45; test/importUi.test.js:184-195 (`suggestSalary`).
- Strings to rewrite (all say "usual income is counted automatically"): setup.js:365, plan.js:194, add.js:686, 730, income.js:406, chartView.js:96, 166, 174, year.js:141, import.js:1138-1144.

### d. Several incomes per month on different days

Today
- Already possible for one-off entries: `data.incomes` is a dated array; any number per month is summed (add.js:950-957; budget.js:234-236). Entries can be edited/deleted in Month (month.js:706, 507-538), and in Settings>Income (income.js:142-312).
- Not possible for regular incomes: only one usual income (no name, no day, no category). A second regular income (advance on the 10th, partner, benefit) must be typed by hand each month with no reminder.

What must change
- New array in data, same shape idea as `subscriptions`: `incomeSources = [{ id, name, expectedCents, dayOfMonth, incomeCategoryId, active }]`; actual entries carry `sourceId` (like `subscriptionId`). `usualMonthlyIncomeCents` stays as legacy for migration/past months (migration: if > 0 create one source "Salary", day 1 or the owner's payday).
- UI: Settings>Income becomes an "Income sources" list with add/edit/delete (copy the subscriptions section pattern, settings/subscriptions.js:280-438); Setup step income field (setup.js:335-346) and Plan field (plan.js:158-168) are replaced by a pointer or a first source; Home "Add income" form gets a "From: <source / one-off>" choice (add.js:713-999); due prompt generalised from subscriptions (app.js:279-403) to income.
- `limits.js` has caps for categories (limits.js:2-4); add a cap for sources.
- Backup merge: add `incomeSources` to the "settings" part of `mergeSettingsOnly` (backup.js:106-109) and to `countSettings` (backup.js:115-123); add to `V2_ARRAYS`-style list for normalise (model.js:144, 254-258).

Recommended packaging: treat a-d as one release feature "Cash flow": (1) income sources + real income entries (b, c, d), (2) balance anchor and carry-over (a). Do (1) first; (2) depends on real income entries to be meaningful.

---------------------------------------------------------------------------
## 4. Settings: structure, problems, proposal

### 4.1 Today (more.js:24-65; one scrolling page, order as rendered)

Top: h2 "Settings" (more.js:25, duplicates the h1 "Settings" from app.js:494) -> jump-link row (9 links: Plan, Income, Subscriptions, Categories, Goals, Import, Rules, Backup, Rights; more.js:29-39) -> plan warning cards (leftover split / unallocated / no budget / pinned overflow; plan.js:21-68) rendered ABOVE Plan although they are caused by category shares.

1. Plan (id more-plan; plan.js:125-201): name, "Monthly spend budget (EUR)", "Usual monthly income (EUR)", note, "Save plan". Savings is NOT here (it is set at Setup, setup.js:89-163, but edited under Categories).
2. Income (more-income; income.js:374-514), three sub-blocks:
   - "Extra income": list of ALL income entries ever (income.js:384-393; no cap), Edit (4 fields; no currency fields, income.js:148-253) and Delete ("cannot be undone", income.js:278).
   - "Add extra income" form (4 fields) - duplicate of the Home form.
   - "Income categories": list with Rename/Delete, "Add income category" form.
3. Subscriptions (more-subscriptions; settings/subscriptions.js:328-438): "Budget share" with "Edit plan" for the Subscriptions category, "Recurring" list (Edit/Delete), "Add subscription" (name, usual amount, day) with the text "It only reminds you" (372-373).
4. Categories (more-categories; categories.js:504-515): every user category as a card: share line, Edit plan / Rename / Delete (not Savings), its subcategory list with rename/delete and its own "Add subcategory" form (categories.js:325-407); then "Add category" form (name, "Share" radio Flexible / No limit / Fixed, amount with EUR/% toggle; categories.js:409-502). Subscriptions category is filtered out (categories.js:50-58) and lives in section 3. Caps: 50 categories, 500 subcategories (limits.js:2-4) -> potentially a very long page.
5. Goals (more-goals; settings/goals.js:419-466): intro, open goals (Add money, Edit, Close goal, Delete), "New goal" form (name, target, deadline), collapsible "Closed goals (n)" (the only `<details>` in Settings).
6. Import (more-import; importSettings.js:170-193): description, "Import a bank statement" button (goes to Import view), "Past imports" list with Undo (no cap).
7. Rules (more-rules; importSettings.js:402-418): description, list with Edit / "Apply to earlier imports" / Delete.
8. Bank layouts (more-layouts; importSettings.js:465-481): list with Delete only. NOT in the jump-link row (more.js:30-38 has no more-layouts).
9. [conditional] Backup reminder card (more.js:58-60; backup.js:159-179) - sits between Bank layouts and Backup.
10. Backup & export (more-backup; backup.js:181-377): "Export backup (JSON)"; "Import backup" -> choice "Settings only" / "Replace everything" / Cancel (219-248); "Month CSV (YYYY-MM)" with "Europe CSV" / "Standard CSV" (250-271; the month is whatever Month last showed); conditional "Data from before version 2.0" (Download / Restore / Delete, 273-335); conditional "Saved data from a failed start" (Download / Delete, 337-375).
11. Rights & privacy (more-rights; rights.js:3-51): licence text, data statement; the same copyright line is also in the page footer on every screen (index.html:736).

### 4.2 Hard to find, inconsistent or confusing (with evidence)

1. One 11-block scroll page; only jump links, no collapsing (just Closed goals is a `<details>`, goals.js:447). Order mixes daily-use settings with rare tools: Rights sits last, Rules/Layouts (rare) before Backup (important).
2. Income is configured in three sections: usual income in Plan (plan.js:158-168), extra income + income categories in Income (income.js:374-514), and entries can also be added on Home (add.js:713-999) and edited in Month (month.js:706). The "Extra income" list actually shows every income entry including imported salaries (income.js:384) - mislabelled.
3. Same entry, two delete behaviours: Month has an Undo toast (month.js:525-537), Settings says "This cannot be undone" (income.js:278). Two editors with different field sets (Month income editor has currency fields; Settings does not).
4. The word "plan" means three things: Settings>Plan (name/budget/income), category "Edit plan" (categories.js:372; toast "Plan updated" shared.js:359), and the frozen month plan (budget.js:152-165). Budget is called "Monthly spend budget", "spend budget", "Budget left", "left to spend". Chart text points to "Settings -> Plan" for usual salary (chartView.js:64).
5. Category vocabulary: UI "Share: Flexible / No limit / Fixed" (categories.js:411-419; shared.js:453-466) vs code `pinned/percent/euro/none`; "Fixed" can be EUR or %; "Share" is not explained as "share of the monthly budget" except in helper text.
6. Savings: set during Setup (setup.js:89-163) and README says change it "under Settings > Plan" (README.md:8-15), but the Plan form has no Savings field (plan.js:187-198); it is only under Categories > Savings > Edit plan. Subscriptions' share is edited in Subscriptions, not Categories (categories.js:50-58). Goals say money goes to Savings (goals.js:433).
7. "Salary and subscriptions are added for you." (add.js:683-687) is wrong for subscriptions: they only remind (settings/subscriptions.js:372-373; app.js:279-403). Salary is "added" only virtually (section 3).
8. Three different "Import" things: section "Import" (bank statement), "Import backup" (Backup section), and the Import view. Import-related settings are split over 3 sections (Import, Rules, Bank layouts), with Bank layouts missing from the jump row.
9. Labels differ between nav and heading: "Backup" vs "Backup & export"; "Rights" vs "Rights & privacy" (more.js:37-38 vs backup.js:184, rights.js:6). Internal id `more` vs visible "Settings" (app.js:27, index.html:734). Double heading "Settings" (more.js:25 + app.js:494).
10. Backup wording: "Settings only" actually means plan, categories, subscriptions, rules, templates, goals and layouts, without entries (backup.js:43-48, 224-225) - closer to "Setup without entries". "Replace everything" is correct. "Europe CSV / Standard CSV" is technical (separator/decimal) without a plain explanation on the buttons.
11. Backup reminders disagree: Home 14/30/60 days with snooze (add.js:57-60) vs Settings card ">30 days" with no snooze (backup.js:50, 159-179); button texts differ ("Export backup", "Export backup now", "Export backup (JSON)").
12. Exports are split: Month CSV in Settings (backup.js:250-271), Year CSV in Chart>Year (year.js:173-187); Month CSV excludes plan income, Year CSV includes it (gap 8).
13. Unbounded lists: income entries, past imports, rules, categories+subcategories (income.js:384-393; importSettings.js:182-191, 409-416; limits.js:2-4).
14. Hidden/missing: Quick-add templates have no management UI (gap 4); no "delete all data"; no version/About; Bank layouts cannot be renamed/edited, only deleted (importSettings.js:424-463). Name is under "Plan" (plan.js:134-144) - app preference stored with money settings.
15. Recovery tools (pre-update copy, rescue copy) appear in the normal Backup section as conditional blocks and say "version 2.0" (backup.js:276-281, 320). They will be wrong in 3.0 (see a: `PRE_UPDATE_KEY`).

### 4.3 Suggested structure (5 groups; Settings home = list of groups, each opens its own page or collapsible card; "Home" shows only what changes weekly)

1. Money plan: Budget (monthly spend budget, Savings share), Income (3.0: income sources with payday, expected vs received; opening balance), Categories (incl. Subscriptions' share and Savings in the same list, with one plain-language explanation of Flexible / No limit / Fixed), Plan warnings shown here, directly under categories.
2. Regular things: Subscriptions, Quick-add templates (new management list), Savings goals.
3. Bank import: one section with 3 collapsed parts: Past imports, Rules, Bank layouts; one entry button.
4. Backup and export: Back up now / Restore (one place, with "Settings only" renamed "Setup only, keep my entries"), all CSV exports (month, year, all) together, collapsed "Recovery copies" for pre-update and rescue copies, Delete all data (new, with double confirm).
5. About: your name, version number, rights and privacy, link to the guide.

Rules: one add-income form (Home) and one entry editor (Month) - remove the duplicate list/form from Settings; unify Undo; cap or page long lists (show 10, "Show all"); keep section ids stable so the Home month-review deep links keep working (`openSettingsSection('more-categories')`, add.js:341, 387; more.js:12-14).

---------------------------------------------------------------------------
## 5. Facts that constrain a 3.0 plan (for the planner)

- Card workflow: tests are never edited unless the card lists `test_edits`; `allowed_paths` limit files (AGENTS.md:79-90). Features a-d change many existing tests (list above), so those cards need `test_edits` and bigger `allowed_paths`.
- Every schema change needs its own tested migration step (README.md:60). Release tooling: `npm version` syncs sw.js (README.md:59); new files under src/ must be added to the offline list in sw.js (guard test, README.md:59).
- SPEC.md:119 keeps budgets EUR-only; SPEC.md:115-118 forbids accounts/sync/server.
- Open owner decisions needed before building a-d: (1) balance counts Savings or not, (2) real income entries vs virtual for old months, (3) should Home's figure use balance, (4) payday prompt behaviour for missed months, (5) is "editable balance" a single anchor or adjustment entries, (6) opening balance date vs month, (7) keep or remove "Add extra income" duplicates in Settings.

Not verified: no test run, no browser run, no timing/size measurements (quota, performance). All behaviour statements come from reading source.
