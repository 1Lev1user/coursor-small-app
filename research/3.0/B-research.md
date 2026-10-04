# My Expenses v3.0: research findings (B)

Date of research: 2026-10-04. Method: web fetch and web search only (no sign-in, no downloads, no forms). Read-only look at the repo (src/model.js, src/budget.js, src/import/core.js, src/views/more.js) to avoid recommending what already exists.

Evidence labels used below:
- [V] = I fetched the cited page and the claim is on it.
- [S] = the claim appears only in a search-result summary of the cited page; I did not open it.
- [U] = unverified or general knowledge; treat as a hypothesis.

Licence note: Firefly III, Budget Zen, Maybe/Sure are AGPL, Cashew is GPL-3.0, Actual and ezBookkeeping are MIT. My Expenses is "rights reserved" (SPEC.md/README). Use these products as sources of ideas only; do not copy their code.

---

## 0. What My Expenses already has (so it is not re-proposed)

From the repo (read-only):
- Settings is one long page with 9 sections (Plan, Income, Subscriptions, Categories, Goals, Import, Rules, Backup, Rights) and a row of jump links (`src/views/more.js`).
- Plan has `monthlyBudgetCents` and a single `usualMonthlyIncomeCents`; per-month plans are frozen as snapshots in `monthPlans` (`src/budget.js`, `src/model.js`). When a salary is imported for a month, the "usual income" is replaced by the real one (`hasImportedSalary`, `plannedIncomeCents`).
- Incomes are plain dated entries with an income category (default: Salary, Other). There is no account/balance concept, no opening balance, no expected-income schedule. SCHEMA_VERSION is 2.
- Import is already strong: exact duplicate by bank reference (+amount, +-5 days) or fingerprint; probable duplicate against manual entries; weak match (+-2 days); each stored entry claimed by at most one row; "ignored" marks for transfers and skipped rows; undo import; rules; saved bank layouts (`src/import/core.js`).
- The importer recognises balance/summary rows ("saldo", "opening balance", "closing balance") only to skip them (`src/import/text.js` ~line 701). It does not use statement balances.

---

## 1. Open-source and popular apps: findings

### 1.1 Actual Budget (local-first, MIT, about 29.3k stars on the GitHub page I fetched) [V]
Source: https://github.com/actualbudget/actual

- Carried-over balance: envelope model. "To Budget" = account balance minus money already allocated; unspent category balances roll over; overspending is deducted from next month's To Budget; "Hold for next month" reserves income for later months. https://actualbudget.org/docs/budgeting/ [V]
- Starting balance: a "Starting Balance" transaction is entered when an account is created (summary of earlier history). https://docs.pikapods.com/tutorials/finance/actual-1-basics/ [S, via search]; also https://actualbudget.org/docs/budgeting/credit-cards/paying-in-full [S]
- Pay periods: fixed calendar months only; no custom month start. https://getfinny.app/blog/budget-apps-custom-month-start [V] (third-party statement about Actual).
- Recurring and varying income: schedules recur on a day of month or custom frequency, with an "approximately" option that matches amounts within +-7.5% (shown with a tilde), automatic matching to real transactions within +-2 days, and optional auto-posting. https://actualbudget.org/docs/schedules [V]
- Forecast (experimental): Balance Forecast report projects account balances from posted history plus simulated future occurrences of schedules (or tracking-budget plans), daily or monthly granularity, to spot shortfalls. https://actualbudget.org/docs/experimental/balance-forecast-report/ [V]
- Budget templates (experimental, syntax in category notes): fixed amount, "by date" (large expense spread over remaining months), periodic, "percent of <income>", schedule-linked, "average of N months", remainder, with priorities. https://actualbudget.org/docs/experimental/goal-templates/ [V]
- Rules: three stages (pre/default/post), ranked least to most specific, can be applied retroactively to existing transactions, and Actual auto-creates rules from the user's repeated edits. https://actualbudget.org/docs/budgeting/rules/ [V]
- Import: CSV, QIF, OFX/QFX, CAMT. OFX transaction IDs for dedupe, otherwise fuzzy match (same amount, near date, similar payee). CSV: manual column mapping, date format and delimiter options, "flip amount", split inflow/outflow columns, a "reimport deleted transactions" checkbox, preview before commit. https://actualbudget.org/docs/transactions/importing/ [V]
- Settings organisation: a short main list (Notifications, Themes, Formatting, Language, Authentication, Encryption, Budgeting method, Export) plus a hidden "Show advanced settings" block (Budget ID, reset cache, reset sync, repair split transactions, experimental features). https://actualbudget.org/docs/settings/ [V]
- Reports: cash flow, net worth, spending analysis, summary and calendar cards, crossover point, custom reports. https://actualbudget.org/docs/reports/ [V]

What My Expenses lacks vs Actual: account balance, income schedules with approximate matching, forecast report, advanced-settings split, tolerance-based matching of expected items.

### 1.2 Firefly III (self-hosted server; AGPL) [feature reference only]
- Opening balance: set per account with a date; "the opening balance is a transaction too"; entries dated before it make the running balance confusing. Reconciliation view: user enters the bank statement's opening and closing balance for a date range and ticks matching lines. https://docs.firefly-iii.org/explanation/financial-concepts/accounts/ and https://docs.firefly-iii.org/how-to/firefly-iii/finances/reconcile/ [S]
- Budgets per period (daily, weekly, monthly, quarterly). Auto-budget modes: reset, rollover (unspent adds to next period), adjusted rollover (overspending subtracts; floor of 1 unit). https://docs.firefly-iii.org/how-to/firefly-iii/finances/budgets/ [V]
- Recurring transactions: daily, weekly on weekday X, monthly on day N, monthly on the n-th weekday, yearly; day 31 shifts down in short months; skip every X; weekend handling (skip, move to Friday, move to Monday, keep). Known limits: no dynamic amount, no forecast preview. https://docs.firefly-iii.org/how-to/firefly-iii/finances/recurring/ [V]
- Piggy banks (savings goals) can link to recurring transactions. https://docs.firefly-iii.org/how-to/firefly-iii/finances/recurring/ [S]
- Data importer: per-run configuration file you can re-use; duplicate detection by content hash or by an identifier column (notes, external id, description, internal reference); previously deleted transactions are still blocked from re-import unless purged; false positives mostly from sparse CSVs. https://docs.firefly-iii.org/references/data-importer/duplicate-detection/ [V], https://docs.firefly-iii.org/how-to/data-importer/import/duplicates/ [V]
- Activity (stars, releases): not checked; unverified. Its newest data-importer releases listed on newreleases.io in 2026 suggest active maintenance [S]: https://newreleases.io/project/github/firefly-iii/data-importer/release/develop-20260819

### 1.3 ezBookkeeping (self-hosted, MIT, 5.7k stars on the page I fetched) [V]
Source: https://github.com/mayswind/ezbookkeeping
- Scheduled transactions, two-level accounts and categories, multi-currency, PWA, dark mode.
- Imports CSV, Excel, OFX, QFX, QIF, IIF, Camt.052, Camt.053, MT940, GnuCash, Firefly III, Beancount. My Expenses already covers camt.053 and Excel/CSV; MT940 and OFX are listed in recent cards as "shows a message only" (git log C-028).
- Settings it lists: language, date/number/currency formats, timezone, attachments. Server-oriented items (OIDC, 2FA, AI receipt recognition) are out of scope for My Expenses.

### 1.4 Cashew (Flutter, GPL-3.0, offline-capable local storage) [V]
Source: https://github.com/jameskokoska/Cashew
- Budgets with custom time periods and category limits; transaction types upcoming, subscription, repeating, debt, credit; multi-account; CSV and Google Sheets import. Offline use through local Drift SQL storage. Sync is via Google Drive/Firebase (out of scope here).
- Idea worth copying: transaction "types" that distinguish upcoming/expected (not yet real) from posted entries. Fits "income on payday" directly.

### 1.5 Money Manager Ex (desktop, local file)
- Scheduled transactions: reminders on the dashboard within 15 days of the due date; each schedule can auto-execute on its due date or prompt the user to review/adjust values first; schedules also feed cash-flow reports. https://moneymanagerex.org/docs/features/scheduled/ [V]
- Budgets for a year and/or month per category, calendar or financial year. https://moneymanagerex.org/docs/features/budgeting/ [V]
- Idea: "auto-enter" vs "ask me first" per recurring item; for a varying salary the "ask first and edit the amount" mode is the right default.

### 1.6 GnuCash scheduled transactions
- "Since Last Run" assistant runs at startup and enters everything that fell due while the app was closed; per-item "create in advance" and "remind in advance" days; reminders can be promoted to "create now". https://code.gnucash.org/docs/C/gnucash-manual/trans-sched-slr.html [S]
- Direct fit for a PWA that is only open sometimes: on open, catch up all missed expected incomes and subscriptions since the last visit, with a review screen.

### 1.7 hledger (plain-text accounting)
- Forecast: periodic rules generate future transactions that appear in reports as if real; forecasting starts after the last real transaction so projections and actuals never overlap. https://www.hledger.org/budgeting-and-forecasting.html [V]
- CSV rules files (fields, skip lines, date-format, conditional "if" blocks); re-import safety through a `.latest` date watermark per file. https://hledger.org/hledger.html [V]
- Two portable ideas: (a) "forecast only after the last real entry"; (b) a per-layout last-imported-date watermark.

### 1.8 Budget Zen, Maybe Finance, Sure
- Budget Zen: AGPL, end-to-end encrypted, self-hostable from v3.0, recurring billing. Marked "no longer maintained" in the search summary. Not a useful source of new features. https://alternativeto.net/software/budgetzen/ [S] and https://github.com/BrunoBernardino/budgetzen-web [U]
- Maybe Finance: archived repo (2 Feb 2024), AGPL, focuses on net worth, investments, debt and retirement forecasting; a community fork "Sure" continues it. Features are wealth-management oriented; little to borrow for a one-person expense tracker. https://github.com/maybe-finance/maybe-archive [V]; fork mention https://github.com/vinteo/sure [S]
- Net worth and investment views are out of scope (single EUR cash account tracker).

### 1.9 Commercial apps (reference for views and calculations)
- YNAB: four rules incl. "age your money"; Age of Money = average days between earning and spending money, computed on the last ten cash outflows. https://support.ynab.com/en_us/age-of-money-H1ZS84W1s.md [V]
- YNAB targets: weekly/monthly/yearly/custom; monthly target has "Set aside another" (accumulates) vs "Refill up to" (tops up what was used). https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks.md [V], https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC [S]
- YNAB variable income guidance: budget from the lowest income month; keep a variable-income fund that absorbs lean and good months; aim for a one-month buffer so you live on last month's income. https://support.ynab.com/en_us/using-ynab-with-variable-income-an-overview-BynJaHZ09.md [S]
- Toshl: "left to spend" and "left per day" = left-to-spend divided by days remaining in the financial month; planned expenses/income can be included or excluded by a toggle. https://toshl.com/blog/left-to-spend-the-gist-of-your-finances-in-one-number-web-app/ [V]
- "Safe to spend" apps divide money left after scheduled bills by days until the next paycheck. https://apps.apple.com/us/app/-/id6758524287 [S]
- Lunch Money: recurring items for both income and expenses, fixed amount or amount range, automatic matching of imported transactions, detects recurring patterns in imported data and suggests items. https://support.lunchmoney.app/finances/recurring-items/creating-recurring-items [S]
- Custom month start: Goodbudget (change period type and start date; "on payday" option), Lunch Money (weekly/biweekly), Finny (day 1-28). YNAB, Monarch, Copilot, EveryDollar, Actual are calendar-month only. Day cap 28 because 29-31 are not in every month. https://getfinny.app/blog/budget-apps-custom-month-start [V]; https://forums.goodbudget.com/t/making-the-budget-period-run-paycheck-to-paycheck-rather-than-from-the-1st-of-each-month/1652 [V]
- Monefy: choose first day of week and of month; recurring records; budget by day/week/month/year (some features Pro). https://apps.apple.com/gb/app/id1212024409 [S]
- Wallet by BudgetBakers: planned (recurring) payments created automatically; budgets combining several categories, daily monitoring. https://apps.apple.com/us/app/-/id1032467659 [S]
- Money Lover: budgets with predicted spending, recurring bills with reminders. https://www.comparehero.my/blog/money-lover-app-review-track-your-expenses [S] (low-quality secondary source).
- Spendee: custom period overview; wallets; bank connection (out of scope). [S] via https://www.comparehero.my/articles/free-budgeting-apps

---

## 2. Calculators and views that fit a single-user local app

| Calculation | Definition (source) | Fit |
|---|---|---|
| Safe to spend per day | Money left in the plan after planned bills, divided by days until next payday or month end (Toshl, https://toshl.com/blog/left-to-spend-the-gist-of-your-finances-in-one-number-web-app/ [V]) | Very high. Pure arithmetic from data already held. |
| 50/30/20 check | Needs 50 / wants 30 / savings and debt repayment 20, of after-tax income; framework is a starting point only (https://www.nerdwallet.com/article/finance/nerdwallet-budget-calculator [V]) | High. App default groups (Necessary, Random, Savings) map to it; show actual split vs this reference. Do not force it. |
| Emergency fund target | CFPB gives no fixed number of months; advises sizing from your own likely unexpected costs and automating contributions (https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/ [V]). "3 to 6 months of expenses" is a common rule of thumb [U, not on the CFPB page]. | Medium-high. Calculate from the user's own average Necessary spending; show months covered by current balance. |
| Savings goal planner | Monthly set-aside = (target - saved) / months to deadline; Actual's "by date" template does the same (https://actualbudget.org/docs/experimental/goal-templates/ [V]) | Goals already exist; add "needed per month" and "date reached at current rate" if not present (not checked in code). |
| Runway / buffer | YNAB "age of money" idea simplified: balance / average daily spend = days of runway (YNAB definition https://support.ynab.com/en_us/age-of-money-H1ZS84W1s.md [V]; the simplification is mine [U]) | High once a carried balance exists. Easier to explain than FIFO age. |
| End-of-month projected balance | Current balance + remaining expected income - remaining subscriptions - (typical daily spend x days left); forecast only beyond last real entry (hledger [V], Actual forecast [V]) | High, same prerequisites. Label as an estimate. |
| Debt payoff (snowball vs avalanche) | Snowball: smallest balance first; avalanche: highest rate first (https://wealthtender.com/?p=19089 [S] among several consumer-finance explainers) | Low for this user: the app has no debt model and the owner did not ask. Add only if debts matter to the owner. |
| Average / lowest income of last N months | Actual "average N months" template [V]; YNAB "lowest month" guidance [S] | High for varying salary: suggests a safe planning income. |

---

## 3. Importing bank statements: patterns worth copying

Already present in My Expenses (no work needed): bank reference + amount + date window; stored fingerprint; claim-once matching of identical rows; weak and probable levels; ignored marks for transfers; undo import; saved layouts; rules.

Gaps and ideas:
1. Use statement balances (camt.053): every camt.053 statement carries an opening booked balance (OPBD) and closing booked balance (CLBD); the sum rule OPBD + credits - debits = CLBD must hold, and OPBD equals the previous closing balance. Use it to (a) verify the parser read every entry, (b) propose or check the opening balance in the app, (c) detect a gap between two imported statements. Source: https://www.sepaforcorporates.com/swift-for-corporates/a-practical-guide-to-the-bank-statement-camt-053-format/ [S], https://docs.numeral.io/docs/camt053-xsd-business-logic [S]. Currently the app throws balances away (text.js).
2. Coverage and continuity check per bank layout: store the last imported date (hledger `.latest` idea [V]) and warn when a new file starts after that date + 1 day (gap) or overlaps heavily (already handled by dedupe).
3. Balance column on CSV: when a CSV has a running-balance column, use the last row as a check value, as Firefly's reconcile view uses statement balances [S].
4. Deleted-entry memory: Actual offers "reimport deleted transactions" (default on) [V]; Firefly keeps blocking deleted ones until purged [V]. Decide the app's behaviour explicitly and show it as a checkbox. Whether My Expenses remembers deleted imported rows was not checked in the code.
5. Column mapping extras seen in Actual: flip amount sign, separate inflow/outflow columns, date-format and delimiter override [V]. Check whether `bankLayouts` already holds each of these (not verified).
6. Rules: stage ordering and specificity ranking, apply a rule retroactively to existing entries, and offer to create a rule when the user recategorises the same payee repeatedly [V, Actual]. Which of these the app's rules already do was not checked.
7. Suggest recurring items from imports: after an import, detect repeated payee + similar amount at regular intervals and offer to create a subscription or an expected income (Lunch Money [S]). This is the bridge between import and the new payday/income-source feature.
8. Same-day identical rows: BeanHub builds an import id from file name and line number and notes it only works for stably ordered files [V: https://beanhub-import-docs.beanhub.io/how-it-works/unique-import-id/]. The app's claim-once approach is already better for the local use case; do not adopt line-number ids.
9. Float errors: Firefly's duplicate misses include 12.00000001 vs 12.00 [V]. The app stores integer cents, so this is already avoided; keep it that way in any new code.

---

## 4. Proposed model for the owner's headline requests

These are design suggestions (my synthesis), not claims about the apps.

### 4.1 Carried-over current balance
- Add one setting `openingBalance { dateISO, cents }` (the money on hand at the start of tracking). Current balance = opening + all incomes on/after that date - all expenses on/after that date (refunds handled as today). Compute, never store, so edits and imports cannot desync it.
- Month carry-over = balance at the end of the previous month; show "Carried over" on the month screen next to the budget. Entries before the opening date are ignored in the balance (Firefly shows what goes wrong otherwise [S]).
- Keep "balance" separate from "budget": the existing monthly budget stays a spending plan. Optional later: per-category rollover (Firefly rollover and adjusted rollover [V], Actual rollover [V]).
- Reconcile action: "My bank says X on date Y" -> app shows the difference and offers an adjustment entry (Firefly reconcile idea [S]); autofill from camt.053 CLBD.
- Decision for the owner: is the balance one pool (cash plus bank) or should savings money be excluded? Recommendation: one pool first; goals/savings category amounts shown as "of which set aside".

### 4.2 Income on payday, several incomes, varying salary
- New list `incomeSources[]`: name, income category, schedule (monthly day N / last working day / weekly / yearly / one-off), expected amount or range, weekend rule (keep / earlier working day / next working day; Firefly's list [V]), active from/to.
- Each month the app materialises "expected" income items. An expected item becomes "received" when (a) the user confirms it (edit the amount), or (b) an imported income matches by amount tolerance and +-2 days (Actual approx +-7.5% and +-2 days [V]; Lunch Money matching [S]); the app's existing `hasImportedSalary` logic generalises to "per source".
- Auto-confirm vs ask-first, per source (MMEX [V]); default ask-first for a varying salary.
- Catch-up on app open for missed paydays, with a review list (GnuCash Since Last Run [S]).
- Varying salary: planning income = user-chosen of {expected amount, average of last N months, lowest of last N months} (Actual average [V], YNAB lowest month [S]); per-month override already fits the frozen `monthPlans`.
- Expected-but-not-yet-received income must count in the forecast and "safe to spend" but not in the current balance (Cashew's upcoming type [V]; hledger forecast-after-last-real-entry [V]).
- Weekend/holiday rule: the app would need a Latvian public-holiday list for "previous working day"; bundling that is a maintenance cost. Alternative: weekend-only rule, holidays left to manual edit.

### 4.3 Settings
Current: one long scroll of 9 sections with jump links.
Options, from the comparison with Actual's settings page [V]:
1. Group the nine sections into 4 headed groups: Money (Plan, Income sources, Opening balance, Goals), Categories and subscriptions, Data (Import, Rules, Layouts, Backup), App (Appearance/format, About/Rights). Keep jump links but per group.
2. Move rarely used or risky items behind "Show advanced settings" (reset, repair, schema info, diagnostics), as Actual does [V].
3. Make groups collapsible and remember the open state; add a settings search box when the list passes about 15 items [U].
4. Add a "Formatting" block (date format, week start, first day of month cut-off) similar to Actual/Monefy [V/S].
Recommendation: 1 + 2 now; 3 and 4 optional.

### 4.4 Custom month start (payday-based month)
Goodbudget, Finny, Lunch Money support it; Actual, YNAB do not [V]. Applies to every month-based screen (plan snapshots, trends, year view, CSV export) so it is a cross-cutting change. Cheaper route that covers most of the benefit: keep calendar months, but compute "safe to spend per day" and "days until payday" against the next payday. Recommendation: do the cheap route in 3.0; defer true shifted months.

---

## 5. Ranked ideas

Value: H/M/L for this owner (single person, Latvia, EUR, local-only). Effort: S (a few hours to a day), M (a few days, touches model/UI/tests), L (a week or more, cross-cutting or needs migration).

| # | Idea | Value | Effort | Depends on | Evidence |
|---|---|---|---|---|---|
| 1 | Opening balance + derived current balance + "carried over" line on the month screen | H | M | schema v3 migration | Firefly [S], Actual [V/S] |
| 2 | Income sources list: several incomes per month, each with day, amount or range, category | H | M | 1 optional | Lunch Money [S], MMEX [V], Actual schedules [V] |
| 3 | Expected vs received income; auto-match imported salary by amount tolerance and +-2 days; ask-first confirmation with editable amount (varying salary) | H | M | 2 | Actual [V], MMEX [V] |
| 4 | "Safe to spend per day" until next payday (or month end) on the main screen | H | S | 1, 2 (works without them using usual income) | Toshl [V], SafeToSpend [S] |
| 5 | Settings regrouping into 4 groups + advanced block | H | S | none | Actual settings [V] |
| 6 | Planning income helper: average / lowest of last N months for a varying salary | M-H | S | 3 | Actual [V], YNAB [S] |
| 7 | Catch-up on open for missed paydays/subscriptions (review list) | M | M | 2, 3 | GnuCash [S] |
| 8 | Projected end-of-month balance (estimate) and "will the balance dip below zero before payday" warning | M-H | M | 1, 2, 4 | Actual forecast [V], hledger [V] |
| 9 | Use camt.053 opening/closing balances: parser self-check, suggest opening balance, reconcile difference, gap warning between statements | M-H | M | 1 | camt.053 spec [S], Firefly reconcile [S] |
| 10 | Runway: days of spending covered by current balance | M | S | 1 | YNAB age of money [V] (simplified [U]) |
| 11 | 50/30/20 comparison card (actual split vs reference) | M | S | none | NerdWallet [V] |
| 12 | Emergency fund calculator from own Necessary-spending average and months covered | M | S | 1 optional | CFPB [V] |
| 13 | Suggest subscription or income source from repeated imported rows | M | M | 2 | Lunch Money [S] |
| 14 | Per-layout last-imported-date watermark with gap warning | M | S | none | hledger [V] |
| 15 | Rules upgrades: retroactive apply, auto-suggest rule after repeated recategorisation, specificity ranking | M | M | check current rules | Actual [V] |
| 16 | Weekend rule for paydays (earlier working day / next / keep) | M | S | 2 | Firefly [V] |
| 17 | Per-category rollover of unspent budget (reset / rollover / adjusted) | M | M-L | 1 | Firefly [V], Actual [V] |
| 18 | Sinking funds: yearly bills spread into a monthly set-aside with a "by date" target | M | M | goals | Actual by-date template [V], YNAB yearly targets [V] |
| 19 | Custom month start day (payday-based month, 1-28) | M | L | touches all month logic | Goodbudget/Finny [V] |
| 20 | Import column-mapping extras (flip sign, split in/out columns, date format/delimiter override) if missing from layouts | L-M | S-M | verify layouts | Actual [V] |
| 21 | Debt payoff calculator (snowball/avalanche) | L | M | new debt model | [S] |
| 22 | Latvian public-holiday table for payday rules | L | M (+ yearly upkeep) | 16 | [U] |

Suggested v3.0 slices (each independently shippable):
- A: #1, #4, #10 (balance and a first useful number).
- B: #2, #3, #6, #16 (income model).
- C: #5 (settings) can ship at any point; do it with A or B because both add settings.
- D: #8, #9, #7, #13 (forecast and import reconciliation).
- Later: #11, #12, #14, #15, #17, #18, #19.

---

## 6. Risks and open questions for the owner

1. Is "current balance" meant to equal the real bank balance (needs a reconcile step) or just "money I track in this app"? Changes whether #9 is core or optional.
2. Does money in savings goals count as spent? Affects 4.1 and runway.
3. Salary reality: paid on a fixed day, on the last working day, or irregular? Several employers or only one plus occasional extras?
4. Should future-dated incomes count in "balance now"? Recommendation: no; they count only in forecast.
5. Schema change: SCHEMA_VERSION 2 -> 3 needs a migration and a backup-restore compatibility test (JSON backup must still import old files). This is the main risk in #1 and #2.
6. Derived balance depends on every historic entry being correct; after a bank import with a wrong parse, the balance is wrong. #9 is the safety net.
7. Third-party product facts above were gathered 2026-10-04 from public pages; features can change. Items marked [S] or [U] should be rechecked before they are cited in user-facing text.
8. I did not check GitHub star counts or release dates for Firefly III, Cashew, Money Manager Ex or ezBookkeeping's latest release; only the numbers on the pages I fetched are quoted.
