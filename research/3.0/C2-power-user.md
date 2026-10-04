# C2 - Power user (monthly routine) exploratory test: My Expenses

Persona: months of use, does a monthly routine. App at http://127.0.0.1:8123/. Date in the app: 4 Oct 2026.
Viewports: phone 390x844 and desktop 1280x800. Synthetic data only.
Screenshots: `discovery/screens/c2-NN-*.png`. Scripts: `tools/c2-*.mjs`. Downloaded files: `discovery/downloads/`.
Seed backup (built by me, imported through Settings > Backup & export): `discovery/c2-seed-backup.json` - 5 months (Jun-Oct 2026), 70 expenses, 2 extra incomes, subscription Spotify (day 5), goal Holiday 800, template Coffee 2.80, budget 1800, usual income 2200.
Bank files: `c2-bank.csv` (20 rows), `c2-bank2.csv` (6 rows), `c2-bank3.csv` (2 old-month rows).

Console errors / warnings / failed requests / page errors: captured in every script. NONE found on either viewport, in any step.
Horizontal overflow: 0 px on Home, Month, Chart (all four sub-views), Settings, import wizard at 1280 wide.

Verdict key: ok / confusing / broken / missing feature.

Method note: I read the source only to know the backup JSON shape and to confirm that something was absent from the UI (template editing). Every finding below was observed in the running app.

---

## 0. Setup and seeding

| # | ACTION | EXPECTED | ACTUAL | VERDICT |
|---|---|---|---|---|
| 0.1 | Open app on fresh profile (phone) | Setup | Setup form: name, budget, "Savings" (with unit toggle), usual income. No tab bar. No "I already have a backup" option. (c2-01-phone-first-load.png) | confusing: a user moving to a new phone must finish setup before they can find Import backup (also see 5.6) |
| 0.2 | Finish setup (Anna, 1800, 2200) | Home | Home opens straight on a card "Review after September 2026?" plus "Income above spend budget: You earned EUR 2,200, EUR 400 more than the spend budget. Choose one" on a brand-new account with no entries. (c2-02-phone-after-setup.png) | confusing: month-review prompts shown to a new user with zero history (they only make sense after a month of use). |
| 0.3 | Settings > Import backup > choose seed file | Preview of what is in the file | Prompt "What should come from this backup?" says "Your 0 expenses and 0 incomes stay" / "Your 0 expenses ... are deleted. This cannot be undone." It never says how many entries are IN the file. (c2-05-phone-after-choose-backup.png) | confusing: counts are for the device only, no preview of the incoming file |
| 0.4 | Tap "Replace everything" | Data replaced | Works, toast "Backup imported". (c2-06) | ok |

---

## 1. Monthly routine: bank statement import

CSV: semicolon, comma decimals, Latvian merchants/diacritics (Ķīpsalas, Rīgas satiksme, Čaka, Gāze...), dd.mm.yyyy, 3 rows that duplicate hand-entered rows, 1 salary 2350,00 ("Alga"), 1 shop refund +12,99, 1 person transfer, 1 row dated 30.09 (past month).

| # | ACTION | EXPECTED | ACTUAL | VERDICT |
|---|---|---|---|---|
| 1.1 | Settings > Import > "Import a bank statement" (c2-09-phone-import-step0.png) | Wizard start | "Step 1 of 4". Choose file / Paste text. | confusing: later steps say "Step 2 of 5", "Step 4 of 5". The total changes from 4 to 5 after the first step |
| 1.2 | Choose c2-bank.csv (c2-10-phone-import-step1.png) | Columns guessed | Date=A, Amount=D, Currency=E guessed. Decimal separator set to comma correctly. Description guessed = column C "Detaļas" ("Pirkums" / "Īres maksa" = generic text), NOT column B (merchant). Column B has no selector at all. The preview table is clipped (columns C-E off screen, horizontal scroll). | confusing: default description column is the generic one; the merchant is only used if the user knows to switch Description to B. With the default, every row would be called "Pirkums" and the offered rule would be "Remember for PIRKUMS" (see c2-99-phone-import3-plan-choice.png / step 4 of 3rd import) |
| 1.3 | Switch Description to B, name bank "Swedbank", Continue | Duplicate check | Step 3 "Check for duplicates": "Probable (3) - Same date and amount as an entry you added yourself" with In the file / Already saved side by side and per-row "Import anyway" checkbox. Rent, Rimi, Cafe correctly caught even though names differ. (c2-12-phone-import-dups-B.png) | ok. Minor: dates shown ISO (2026-10-01) here but "3 Oct" elsewhere; amounts as "-EUR550.00" |
| 1.4 | Step 4 "Sort the transactions" (c2-13/14/15) | Sensible defaults, compact | 17 rows, each a full form (kind, category, subcategory, "Show as", Remember). Page is 9,508 px tall on phone, 6,302 px on desktop (c2-95-desktop-import-sort.png: desktop is one stretched column, 3 selects per row). All rows default to "Uncategorised"; only salary defaults to Income/Salary. The +12.99 Rimi refund defaults to Income / Other, not Refund. "Remember for ..." checkbox keyword is the first word: MAXIMA, CIRCLE (Circle K), RIGAS, LATVIJAS (for "Latvijas Pasts"), ANNA. SIA is stripped (LIDO, ELEKTRUM good). | confusing: (a) very long scroll, no row counter / progress, no "apply this category to all rows with the same name", no way to bulk-set; (b) refund looks like income by default and inflates income if not noticed; (c) first-word keyword is poor for multi-word merchants |
| 1.5 | Set categories for 10 rows, income Salary for Alga, Transfer for the person, tick Remember on 14 rows (c2-16-phone-sort-bottom.png), Continue | Summary | Step 5: Expenses 14, Refunds 0, Incomes 2, Transfers (not counted) 1, Duplicates left out 3, Total out 309.09, Total in 2,362.99, "14 rules will be saved: MAXIMA, NARVESEN, CIRCLE, RIGAS, ELEKTRUM, SPOTIFY, APOTHEKA, BOLT, LATVIJAS, LIDO, ALGA, RIMI, WOLT, LMT." and "There is no plan for September 2026 yet." (c2-17-phone-import-step4.png) | ok summary; the rule list is useful. "Total in" silently includes the refund booked as income |
| 1.6 | Past-month plan choice | Understandable | Radio: "Use my current budget" (default) / "Only record spending (no budget)". No explanation of the consequence. (c2-17) | confusing. Tested the second option on April/May 2026 (c2-99/100/101/102): April then shows "Budget left -EUR45.10 over budget", "Cash left -EUR45.10 more spent than came in", "Spent EUR45.10 of EUR0.00 - Income EUR0.00", "Necessary EUR45.10 of no budget - over by EUR45.10". A month recorded as "no budget" is displayed as being OVER budget in red. The usual income also disappears for that month |
| 1.7 | Import 16 entries (c2-20-phone-import-done.png) | Done | "Import finished - 16 entries", buttons Go to Month / Undo this import / Back to Settings. Past imports list shows counts and period. Home spent rose by exactly 285.69 = Oct rows only (the 30 Sep row went to September). | ok |
| 1.8 | Check Month after import (c2-22-phone-month-oct.png) | Plausible numbers | Month: "Cash left EUR1,478.12 - Spent EUR884.87 - Income EUR2,362.99". Imported 2350 salary replaced the usual 2200 for October (wizard said so: "Imported salary replaces your usual income"). Entries show an "Imported" tag; names are the bank's spelling ("Maxima Latvija" next to hand-typed "Rimi"). | ok, but see 6.x: the bank salary paid on 3 Oct for September is counted in October while September still gets the usual 2200 -> two salaries in two months for one real payment |
| 1.9 | Re-import the same file (c2-23-phone-reimport-step1.png, c2-24) | All duplicates | Saved layout "Swedbank" reused (columns step skipped). "Exact (17) - Already imported. The bank reference or every detail matches" and "Probable (3)". The transfer row says "Marked as transfer in an earlier import". Then step 4: "Nothing is left to import. Go back to include rows." with a Continue button still active. | ok (really good). Minor: 20 long rows to scroll through for a no-op |
| 1.10 | Second statement (c2-bank2.csv): Spotify AB, RIMI HIPER ORIGO, Maxima Latvija, Latvijas Gaze, Netflix dated 10 Oct, Auto serviss "-1 234,50" (c2-36..39) | Rules applied, odd values handled | "Known (3) - 3 rows were sorted by your rules" collapsed behind "Show". Spotify, Maxima OK. "Latvijas Gaze" (gas bill) was silently put into "Others" by the LATVIJAS rule (made for Latvijas Pasts). RIMI HIPER ORIGO was NOT sorted by the RIMI rule (the rule is Income/Other from the refund; it correctly did not fire on an outgoing row). Netflix dated 7 days in the FUTURE was accepted with no warning and counted in October spent. "1 234,50" with a space as thousands separator parsed correctly. | confusing: wrong auto-sort hidden in the collapsed Known list; future-dated row accepted without any warning; the stray RIMI income rule stays in Rules |
| 1.11 | Edit an imported entry (note), then Undo the import (c2-27, c2-28, c2-26, c2-29) | Undo removes imported rows | Edit form is fine. Undo confirm: "Remove the 16 entries added by this import? Rules you saved stay." After undo ALL 16 vanish, including the one I had edited; the dialog does not warn that edited entries are removed too. Toast "Import undone" with no way to redo. Home/Month return exactly to pre-import numbers. | ok for plain use; confusing for edited rows (no warning) |
| 1.12 | Rules list (Settings > Rules) | Manageable | 14 rules with Edit / "Apply to earlier imports" / Delete. Rules are only a first word, so one-off bad ones (LATVIJAS, RIMI=Income) have to be found and deleted by hand. | ok, confusing keywords |

---

## 2. Subscriptions and templates

| # | ACTION | EXPECTED | ACTUAL | VERDICT |
|---|---|---|---|---|
| 2.1 | Settings > Subscriptions: add Gym, "39,00", day 31 (c2-30, c2-31) | Added | Accepted (comma decimal OK, day 31 allowed). Text: "Each month on this day the app reminds you to log the charge as an expense. It only reminds you." | ok |
| 2.2 | Edit Gym day to 3 and Save (c2-32-phone-subs-edit.png) | Saved | Saved, and immediately a full-screen modal "Subscription due - Gym - Usual EUR39.00 - day 3" (c2-33-phone-due-overlay.png). | ok behaviour, but see 2.3 |
| 2.3 | Try to dismiss the due modal (Escape, tap backdrop) | Can dismiss / "Not this month" | Neither works. Only two buttons: Confirm (green) and Delete subscription (red, same size, next to it). Delete shows an inline confirm. There is no Skip / Later / "already paid". The modal blocks every tab until answered, and it also pops up after Import backup > Settings only (c2-68) and on every app start. (c2-96-desktop-due-overlay.png shows the same on desktop.) | confusing / missing feature: a user who paid by bank has to log a duplicate or delete the subscription |
| 2.4 | Confirm with amount "41,50" (c2-34, c2-35) | Expense logged | Logged under Subscriptions, dated TODAY (4 Oct), not the due day (3 Oct). Toast "Subscription logged". Month and Home updated correctly. | ok (comma accepted); minor: date = today |
| 2.5 | Subscription already paid via bank import, then time moves to 6 Oct (browser clock set, c2-40-phone-oct6-spotify-due.png) | No reminder, it is already in the month | The Spotify bank row imported on 4 Oct (category Subscriptions) is NOT linked to the subscription; on 6 Oct the app asks to log Spotify again. Confirming creates a second Spotify charge. | broken (logic gap): subscriptions and imports do not know about each other -> double count for any user who imports statements and also keeps subscriptions |
| 2.6 | Home text "Salary and subscriptions are added for you." | True | Subscriptions are NOT added for you, they only trigger a prompt; the Settings text itself says "It only reminds you." | confusing: contradictory wording |
| 2.7 | Quick add "Coffee EUR2.80" on Home (c2-41-phone-quick-add-toast.png) | One tap adds | Adds an expense dated today immediately, toast "Added Coffee" (no Undo in the toast). Double-tap adds two. Entry must be removed in Month. | ok but risky: no undo, no confirmation, no date/amount adjustment |
| 2.8 | Edit or delete the template | Some way to manage | There is no UI anywhere to edit, rename, re-price or delete a template (Settings has no Templates section; right-click / double-click do nothing, c2-42). It can only be replaced wholesale through backup import. | missing feature |
| 2.9 | Delete an entry in Month (c2-43) | Confirm | Inline Delete/Cancel confirm, no toast. | ok |

---

## 3. Savings goal

| # | ACTION | EXPECTED | ACTUAL | VERDICT |
|---|---|---|---|---|
| 3.1 | New goal: Laptop, target "1 200,00" (c2-44-phone-goals-settings.png) | Accepted | Red error "Enter a valid amount greater than zero." Same for "1,200.00" and "1.200,00". Only "1200,00" / "1200.00" work. The error does not say what format is accepted. The bank import accepts "1 234,50" and Month displays "EUR1,234.50", so the app reads thousand separators but refuses to take them. | confusing (inconsistent number parsing / unhelpful error) |
| 3.2 | Home > Add money on Holiday (c2-45-phone-goal-add-money.png) | Contribute | Inline form: Amount only, no date or note. Save 150 -> "Added EUR150.00 to Holiday", progress 19%, "EUR216.67 a month to finish on time" recalculated. (c2-46) | ok |
| 3.3 | Look at Month/Home after contribution | Savings are not "spending" | The 150 appears as an expense in category Savings; Savings has no budget, so Month shows "Savings EUR150.00 of no budget - over by EUR150.00", Home flips to "over budget by EUR329.86" (with the other test data) and the Budget-left bar goes red. Saving money makes the budget look overspent unless a Savings budget is configured. | confusing |
| 3.4 | Close goal (c2-47-phone-goal-close-confirm.png) | Closed | Confirm "Close this goal? It moves to Closed goals. Money you added stays in Savings." Works; goal moves to a collapsed "Closed goals (1)" section (c2-50) which offers only Delete. | ok; missing: reopen / withdraw money from a goal |
| 3.5 | Home goal card with several goals | All visible | Home shows only one goal card (the first open goal); the second goal appears on Home only after the first is closed. | minor |

---

## 4. Review money

| # | ACTION | EXPECTED | ACTUAL | VERDICT |
|---|---|---|---|---|
| 4.1 | Month > Search (c2-55, c2-56, c2-57) | Filtered list | Panel "Search all entries" (all months): text, type, category (top level only), amount from/to, date from/to. Text matches notes AND category/subcategory names ("groceries" finds 18). "rimi" Jul-Oct: 9 results. Works well and is fast. BUT: no total / sum of the results, so "how much on X" needs a calculator. Also the unfiltered month "Entries" list stays below the results and repeats on the page. Date inputs use the browser locale (mm/dd/yyyy in this browser). | ok search; missing feature: result total; confusing: duplicate list below |
| 4.2 | Chart > Spending (c2-51-phone-chart.png) | Donut | Donut + legend with planned vs spent. Tap a category = one-month subcategory breakdown (c2-83-phone-chart-drilldown.png: Rent 550, Groceries 206.11, ...). Month-by-month only. | ok |
| 4.3 | Chart > Income (c2-58) | Income | "Usual salary (Plan) EUR2,200" + extra income lines. | ok |
| 4.4 | Chart > Trends (c2-59-phone-chart-trends.png) | Trends | 12-month bars, average, budget line, "Changes vs last month". Comparison uses the unfinished current month: on 4 Oct it says Necessary "down EUR284.45", Random "down", Subscriptions "down EUR11.99" (Spotify not yet due). Also Month header: "EUR365.03 less than September 2026". Partial month vs full month is misleading. Average text correct ("counts only the 5 months with spending"). | confusing |
| 4.5 | Chart > Year (c2-60, c2-89-desktop-chart-year.png) | Year totals | Spent 4,769.91, Income 11,270.00, Difference 6,500.09 (income correctly counts usual 2200 x 5 months + 150 + 120). Table by category, Year CSV buttons. Months with no data (Jan-May) show no income. | ok |
| 4.6 | Month CSV Europe/Standard (downloads: phone-monthcsv-eu..., -std..., phone-aug-expenses-2026-08-europe.csv) | Correct content | UTF-8 with BOM; Europe: `;` and `550,00`; Standard: `,` and `550.00`; columns Date;Type;Category;Subcategory;Note;Amount;Currency;Original amount; Income rows included (e.g. `2026-08-06;Income;Other;;Bonus;150,00`). Sorted by date. Month follows the month last viewed in Month (button label "Month CSV (2026-08)"). File name "expenses-2026-08-europe.csv" although it contains incomes. The usual salary is NOT in the file, so CSV income does not match the Income figure on screen (150 vs 2,350 for August). | ok content; confusing: hidden dependency on last viewed month, salary missing |
| 4.5b | Year CSV (downloads: phone-yearcsv0/1-*) | Per-month totals | `Month;Spent;Income;Budget;<one column per category>`; 12 rows incl. empty months with Budget 1800 and zeros ("January 2026;0,00;0,00;1800,00;..."). Month names in English text. Income column includes usual salary. | ok |

---

## 5. Backup

| # | ACTION | EXPECTED | ACTUAL | VERDICT |
|---|---|---|---|---|
| 5.1 | Export backup (JSON) (c2-52-phone-after-export-json.png) | File + reminder cleared | `my-expenses-backup-2026-10-04.json`, toast "Backup exported", reminder disappears. But the file itself contains `settings.lastBackupISO: null`, so after restoring that file the app again says "No backup yet. If this phone is lost, your data is gone." (c2-69). The wording says "phone" on desktop too (c2-96). No "last backed up on <date>" anywhere. | confusing |
| 5.2 | Import backup, "Settings only" (c2-67) | Keep entries, take settings | Subscriptions, goals, rules, templates replaced; entries kept; "Settings imported". Side effect: a subscription from the backup (Gym) is due again at once -> blocking modal on next screen (c2-68). Past imports list is not part of settings, so imported rules exist with "No imports yet". | ok, with the due-modal side effect (see 2.3) |
| 5.3 | Import backup, "Replace everything" over existing data (c2-53, c2-71) | Safety net | "This cannot be undone." Replaced immediately. localStorage afterwards has only `my-expenses-v1` (no rescue / pre-update copy is made). The user must export first (the dialog does not offer to). | confusing: wording is honest, but no automatic safety copy |
| 5.4 | Round trip: export -> reset to seed -> import everything | Identical | After Replace everything: same 81 expenses / goals / subs / rules, numbers identical to the export state (c2-69). | ok |
| 5.5 | "Pre-update copy" (simulated an old version-1 save in localStorage, c2-62, c2-63, c2-64) | User told | App migrates silently; Home shows nothing about the update. Only at the very bottom of Settings > Backup: "Data from before version 2.0 - This device kept a copy of your data as it was before the 2.0 update..." with Download / Restore / Delete. Restore warns: "Entries added since the update are removed. Your current data is downloaded first." | ok content; confusing discoverability (no notice at migration time, buried at the bottom of a 7,000 px page; no explanation of what "pre-update" means for a normal user until they find it) |
| 5.6 | "Rescue copy" (truncated saved JSON to simulate damage, c2-65, c2-66) | Recoverable | Screen "Saved data could not be read ... A copy is kept on this device. Download it before you start again." Buttons Download saved data / Start again. "Start again" goes straight to the empty Setup with no confirmation (the copy stays and later appears in Settings as "rescue copy"). Setup has no "import a backup" shortcut. | ok; confusing: no confirm on "Start again", no restore path from Setup |

---

## 6. Real questions

| # | QUESTION | HOW FAR THE APP GETS | VERDICT |
|---|---|---|---|
| 6.1 | "How much do I have right now?" | Home headline is "left to spend EUR1,200.82" = budget (1800) minus spent. Month has "Cash left EUR1,600.82" = this month's income (usual 2200, counted as if already received on 1 Oct) minus this month's spending. There is no account balance, no carry-over from earlier months and no "money actually available today". Before payday the app already counts the salary (Oct 4, payday Oct 5). The two numbers ("left to spend" vs "Cash left") are on different screens with different meanings. (c2-08, c2-22) | missing feature / confusing |
| 6.2 | "Can I afford X before payday?" | No payday date, no forecast, no what-if. Add expense form (c2-70) shows no remaining budget while typing. User must do the arithmetic from Home "left to spend" (budget based, not cash based) and from subscriptions not yet due (not shown anywhere as upcoming). | missing feature |
| 6.3 | "What did I spend on food in the last 3 months?" | Possible only by hand: Search text "groceries" (18 results, 3 months) + "Eating out" (12) with date range, then add the results up yourself. No total in search. Chart drill-down and Trends are per month / top-level category ("Necessary expenses" includes rent). (c2-56, c2-57, c2-83) | missing feature (totals for a search / sub-category over a period) |
| 6.4 | "My salary was different this month - how do I record it?" | Four routes, all with a catch. (a) Add income with category "Salary" (offered in "Add extra income", c2-73): income becomes 4,550 (usual 2,200 + 2,350) - double counted (c2-74, c2-75, c2-76). (b) The note under the form says "Extra income only... Your salary is added automatically" - so the intended way is to add only the difference as "Other"; not obvious that the Salary category in the same dropdown is a trap. (c) Change Settings > Plan > Usual monthly income: changes every month that has no entries yet (in my seeded data September jumped 2,200 -> 2,350 as well, because no plan was frozen; months that already have a frozen plan keep the old figure - I checked August) and becomes the new default going forward; there is no "this month only" override. (d) Import the bank statement: the imported Salary row replaces the usual income for that month (works, with a clear hint on the sort step). | confusing: Salary category should not be offered in "extra income"; no per-month salary override |

---

## 7. Layout and wording at both widths

| # | ITEM | VERDICT |
|---|---|---|
| 7.1 | Switching tabs keeps the scroll position: after scrolling Settings to the bottom and tapping Month, Month opens 587 px down (phone) / 650 px (desktop) with the totals out of view; Home does the same (c2-91, c2-92; also visible in c2-85, c2-86 where Home and Month start mid-page). | broken (minor): tab change should reset to top |
| 7.2 | Desktop 1280: single stretched column; full-width buttons ("Add EUR400 to Savings" is a 1,200 px wide bar), tabs spread over the full width, entry lists with the amount far from the title (c2-85, c2-86, c2-87, c2-89). No max width, no multi-column. Usable but not designed for desktop. | confusing |
| 7.3 | Phone: bottom tab bar plus the copyright line take ~85 px of every screen; long forms (import sort) end with Continue below the fold. Settings is one 7,500 px page with anchor chips at top (they work, c2-103, c2-104). | ok / minor |
| 7.4 | Home on phone stacks up to five cards (backup warning, goal, "Review after September", "Categories & plan", "Income above spend budget") before Recent entries; the "Review ..." and "Income above spend budget" cards sit on the Home for the first 5 days of every month, with "Not now" as the only dismissal (c2-08). | confusing (noise right when the monthly routine happens) |
| 7.5 | Wording: "Step n of 4/5", "left to spend" vs "Budget left" vs "Cash left", "No backup yet. If this phone is lost" on desktop, "Remember for LATVIJAS", "Only record spending (no budget)" resulting in "over budget". | confusing |
| 7.6 | Number formatting is consistent everywhere I looked (EUR symbol before amount, comma thousands, dot decimals, -EUR for negatives, "+EUR" for income) and the CSV exports follow the chosen locale. Input fields accept comma decimals everywhere ("39,00", "41,50", "5,5", "2350,00") but not thousand separators (3.1). | ok |

---

## Top findings (also the closing summary)

1. Subscription due modal cannot be dismissed (no Skip / Later), Delete sits beside Confirm - 2.3, c2-33-phone-due-overlay.png, c2-96-desktop-due-overlay.png.
2. Imported bank payments are not linked to subscriptions: Spotify imported on 4 Oct is asked again on 6 Oct, a double entry - 2.5, c2-40-phone-oct6-spotify-due.png.
3. Salary double count: "Add extra income" offers the Salary category and income becomes 4,550 instead of 2,200/2,350; no per-month salary override - 6.4, c2-74-phone-salary-added-as-income.png, c2-75-phone-month-after-salary.png.
4. No answer to "how much do I have / can I afford before payday": only budget-left and this-month "Cash left" that assumes the salary already arrived - 6.1, 6.2, c2-08-phone-home-seeded-v2.png, c2-22-phone-month-oct.png.
5. Search has no total; food over 3 months needs manual addition - 4.1, 6.3, c2-56-phone-search-rimi-3m.png.
6. Import wizard defaults: Description column picks the generic "Detaļas" text, merchants in column B are ignored; rule keyword is the first word (LATVIJAS silently sorted a gas bill into Others, "PIRKUMS" would match everything) - 1.2, 1.4, 1.10, c2-10-phone-import-step1.png, c2-38-phone-import2-known-shown.png.
7. Sort step is a 9,500 px scroll of 17 full forms, refund defaults to Income/Other, everything Uncategorised, no bulk action - 1.4, c2-13-phone-import-step3.png, c2-95-desktop-import-sort.png.
8. Past-month "Only record spending (no budget)" makes the month look over budget and drops income - 1.6, c2-101-phone-month-2026-04-actualonly.png.
9. Templates cannot be edited or deleted anywhere; Quick add has no undo - 2.7, 2.8, c2-41-phone-quick-add-toast.png.
10. Amount fields reject thousand separators ("1 200,00", "1,200.00") with a generic error while import accepts them - 3.1, c2-44-phone-goals-settings.png.
11. Replace everything: no incoming-file preview, no automatic safety copy; exported file stores lastBackupISO null so "No backup yet" returns after restore; pre-update copy is migrated silently and only explained at the bottom of Settings - 0.3, 5.1, 5.3, 5.5, c2-05-phone-after-choose-backup.png, c2-63-phone-v1-settings-backup.png.
12. Tab switch keeps scroll position (Month opens 587 px down), desktop is one stretched column, Trends compares a 4-day October with full September ("down EUR284.45") - 7.1, 7.2, 4.4, c2-91-phone-scroll-kept-after-tab.png, c2-89-desktop-chart-year.png, c2-59-phone-chart-trends.png.

Other, smaller: undo-import removes edited rows without warning (1.11); future-dated bank row accepted silently (1.10); step counter 4 vs 5 (1.1); Savings goal contributions show as "over budget" (3.3); goal cannot be reopened (3.4); new user sees month-review prompts immediately (0.2); Home line "Salary and subscriptions are added for you" is false for subscriptions (2.6).

## Not tested / limits
- Real clock: I used Playwright's clock to reach 6 Oct for the subscription reminder. Everything else ran on the system date (4 Oct 2026).
- Plans: my seed had no frozen month plans, so the Plan-income change test (6.4c) also shows the effect on never-touched months; frozen months were confirmed to keep their income.
- Not tested: foreign currency rows, XLSX/XML/MT940 files, paste text import, offline/service worker, dark mode.
- Time-boxed to the journeys requested; no accessibility audit (keyboard/screen reader).
