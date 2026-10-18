# My Expenses

Local-only EUR expense and income tracker (PWA). Data stays on your device: no account, no cloud sync.

Live app: https://1lev1user.github.io/coursor-small-app/
User guide (PDF): https://github.com/1Lev1user/coursor-small-app/releases/latest

## First-run setup

1. Your name, used on Home
2. Monthly budget (EUR)
3. Savings, in euro or as a % of that budget

Then the screen "Set up your money":

- The amount on the card now. A negative amount is accepted.
- Your regular incomes, if you have them. Each has a "Name", an "Expected amount (EUR)" and a "Payday (day of month)". You can leave this empty and add them later.

Earlier months stay as they were. If you already used an older version, you see the money screen once after the update.

Change your name under Settings > Profile and about, and the budget under Settings > Monthly budget.

## Everyday use

- Home shows "Money now": the amount you have on the card. Every expense lowers it and every income raises it. Under it is a per-day line, a line with the month budget, your latest entries, Quick add and your nearest savings goal. A transfer between your own accounts that comes in with a bank statement changes it too, but is never counted as spending or income. Money now counts an imported card payment on the day the bank booked it; spending and budgets keep the day you paid.
- Per-day amount: under Settings > Money > "Amount per day" choose "Automatic" (Money now divided by the days until the next payday or the end of the month) or "Fixed amount".
- Check against the bank: tap Money now and enter the amount your bank shows. A difference is added as one dated entry with the note "Bank difference". Edit or delete it in Month like any other entry. After a bank import the app can do the same with the statement's own balance (see "Importing a bank statement").
- Paydays: add them under Settings > Income > "Regular income". On the payday Home asks for the amount you received ("Received", "Later" or "Skip this month"). Nothing is added without your tap.
- Add expense has a currency choice. For a foreign purchase, enter the amount in that currency and the euro amount your bank charged. Budgets and charts always use the euro amount. Tick "Refund (money back from a shop)" for money coming back: it lowers spending and is marked Refund. Tick "Save as template" to keep an expense you repeat.
- Quick add on Home adds a template with one tap; Undo takes it back. Settings > Quick add renames, re-prices or deletes templates.
- Month lists the month's entries, where it starts and ends, and each regular income (received, expected or skipped). Search covers your whole history by text, category, type, amount and dates. The comparison with last month appears once the month is over.
- Chart has four views: Spending, Income, Trends (12 months, average and the biggest category changes) and Year (totals and a yearly CSV).
- Settings is one page of groups, one open at a time: Money, Income, Monthly budget, Backup, Categories and limits, Subscriptions, Quick add, Goals, Bank import (advanced), Profile and about.
- Settings > Goals: savings goals with a target and an optional deadline. Money added to a goal is recorded as a Savings expense.

## Importing a bank statement

Settings > Bank import (advanced) > Import a bank statement. The file is read on this device and nothing is uploaded.

- Formats: CSV, text pasted from internet banking, Excel .xls and .xlsx (also an ".xls" that is really a web page table or an Excel 2003 XML workbook), ISO 20022 camt.052/053/054 XML and FiDAViSTA XML (Latvian banks). Text files in UTF-8, UTF-16, windows-1257 (Baltic) and windows-1251 (Russian) are read.
- CSV, Excel and pasted text: the app guesses the columns and shows the first rows. Correct them once; the layout is remembered under the bank name.
- Dates: day-first, month-first and year-first dates are read, and so are dates with a month name, such as "17 Sep 2026" (choose "Day and month name (17 Sep 2026)" if the app asks for the date format). A date column that Excel stores as plain day numbers is read as dates.
- Rows dated more than a year ahead or more than 15 years back are listed under "Dated far from today" and start unticked; tick "Import anyway" to bring one back.
- Duplicates: rows already in the app are found by the bank reference, by an exact match of the same file, or by the same amount on the same or a nearby date. Nothing is merged or deleted without your choice.
- Before importing, "Check what was read" shows the totals money in and money out. If your bank shows spending as positive numbers, tick "Reverse money in and out".
- Possible duplicates are not imported unless you tick "Import anyway".
- Each row can be an expense, a refund, income, a transfer between your own accounts (not counted as spending or income, but it changes Money now) or skipped. "Remember" turns the choice into a rule, so the next import only asks about new shops. Rules are listed in the same Settings group. A rule matches whole words only (the rule RIMI does not catch RIMINI). Rows your rules sorted are folded into a "Known" group that shows how many went to which category.
- Status column: rows marked pending, reverted or declined (for example Revolut State) are skipped and listed as "Not completed (pending, reverted or declined)". Revolut Topup and Exchange rows start as Transfer; a card refund coming in starts as Refund.
- Fee column: on euro rows a fee is added to money out and taken off money in. For a file with one signed Amount column and a Balance column, the fee is not added when the Balance shows the amount already includes it, and the Columns step says so. Compare the totals with your bank. A Gross, Fee and Net file without separate money-out and money-in columns uses Net as the amount.
- Payee or sender column: if the shop or sender has its own column, the app uses it for the entry text and for rules.
- Transfers between your own accounts: in one import, a money-out row and a money-in row with the same amount of 10.00 euro or more, no more than one day apart, both start as Transfer. You can change them. Card payments, rows that match a saved rule, bank-marked rows and possible duplicates are never paired; both rows must be in the same currency. An imported transfer is kept for Money now only: it changes Money now and the start and end amounts of each month, and it does not change the budget, Home spending, charts, income totals or savings goals. It is not listed in Month. A currency exchange (a euro row and a row in another currency) is not stored. Transfers from imports made before version 3.1.1 are not stored; "Align with the bank" corrects Money now.
- Bank text: card payments are named after the shop and, when the bank text gives the card date, dated on the day you paid (the bank books them a few days later). Personal codes, IBANs and card numbers in a transfer's text are left out of the entry text when the app recognises the bank's layout. Until you have a rule for a shop, the app suggests a category for money you spent from the shop type the card network reports (for example Groceries for a supermarket); you can change it.
- Swedbank files: only transaction lines become rows; the opening balance and turnover lines are skipped, and the closing balance line gives the bank balance (see below).
- Bank balance: when the statement states the money on the account at its end, "Check what was read" shows a line such as "Bank balance on 17 Oct 2026: €429.15". It is read from a line "Closing balance", "Ending balance" or "Beigu atlikums" (also "Конечный остаток", "Lõppsaldo", "Galutinis likutis") in CSV, Excel and pasted text; from a Balance column (for example Revolut and Wise); from the closing balance line of Swedbank files; from camt XML; and from FiDAViSTA XML. Only euro balances are read. The date is the end of the statement period, or the last booking when the file does not name a period. A file without any of these shows no balance and the import works as before.
- Align with the bank: after the import, the last screen compares that balance with the money My Expenses shows for the same day ("Bank balance on 17 Oct: €429.15. My Expenses on that day: €X."). When they are equal it says "Matches the bank." When they differ, tap "Align with the bank" to add one entry that makes them equal, or "Not now" to leave it. The entry has the note "Bank difference", is dated on the statement's last day, is an income in Other when the bank shows more and an expense in Uncategorised when it shows less (it counts in that month), and can be edited or deleted in Month. If the statement ends before the day Money now starts, the screen shows the balance and says the statement is not compared. If the balance date is in the future it only shows the balance.
- camt files: an entry the bank marks as a reversal that comes as money in starts as Refund, and the import says how many entries are reversals. A payment and its reversal (opposite direction, same currency and amount, and the same bank reference or the same party) cancel out and both start as Skip, unless a saved rule or an earlier import decides otherwise. A reversal of money out stays an expense. An entry that bundles several payments is split into one row per payment when the parts add up to the entry; if they do not, it stays one row and a note says so.
- A row near a payday or a subscription may ask "Is this the ...?". Yes ties the row to that regular income or subscription.
- For a past month that has no plan yet, the app asks once: use the current budget, or record only the actual spending.
- Every import can be undone from Settings > Bank import (advanced). Undo removes that import's entries, its transfers and its Bank difference entry, and keeps your rules and manual entries. If you changed some of the entries after the import, it says how many ("3 of 42 entries were changed after the import") and offers "Remove all" or "Keep the 3 changed".
- An .xlsx file saved by a program that never calculated its formulas has empty cells; the app warns "This file has formulas that were never calculated. Open it in Excel and save it again."
- A file that holds only a header line says "This file has a header but no transactions. Check the period you exported."

### Banks the import reads

Checked with a real export:

- Citadele (.xls)

Built from public descriptions of the file layout (made-up test files, no real export yet; please report what you see):

- Revolut (CSV)
- Swedbank Latvia, Estonia and Lithuania (CSV)
- SEB Lithuania (CSV)
- LHV (CSV)
- Wise (CSV)
- N26 (CSV)
- camt.052 and camt.053 XML (camt.054 is read the same way but not tested)

FiDAViSTA XML (Latvian banks): written from the element names other open readers use; no sample file was available.

Other banks (for example Luminor, Citadele CSV, Paysera, SEB Latvia): no sample file was available, so pick the columns by hand. Choose the file as usual, then on the Columns step pick each column: Date, Amount (or "Money out and money in columns", or one amount column with a Direction column), Payee or sender, Description, Currency, Bank reference, Status and Fee. Set the Decimal separator and the date format if asked, and type the Bank name. The layout is remembered, so the next file from that bank needs no setup. If a file is not recognised, send an anonymised copy so it can be added.

The FiDAViSTA reader was also written without access to the official specification. If a FiDAViSTA file is not recognised, use the CSV export of the same statement.

## Backup, import, and CSV

Under Settings > Backup:

- Export backup (JSON): full restore file for this or another device
- Import backup: shows what the file holds, then offers "Settings only" or "Replace everything". Replace everything downloads your current data first. Backups from older versions are updated automatically.
- Data from before the last update: download or restore the old copy kept at the update
- Month CSV: Europe or Standard format, with currency and original amount columns

Home reminds you when the last backup is 14 days old and more strongly after 30 days. Browsers can clear site data, so keep a backup.

## Updates

When a new version is ready, the app shows an Update bar; tap it to reload into the new version. Version 3.0 converts your data once and keeps the old copy on the device (Settings > Backup > Data from before the last update).

## Install on phone

Open the link in Safari (iPhone) or Chrome (Android), then Add to Home Screen / Install app.

## Development

- `npm test` runs all tests (Node 22, no packages to install). GitHub runs them on every push and pull request.
- Releasing: run `npm version <new version>`; it raises `version` in `package.json`, syncs `VERSION` in `sw.js` (`scripts/sync-version.mjs`) and commits both. A test fails if they differ or if a file in `src/` or `fonts/` is missing from the offline cache list in `sw.js`.
- Data format changes: raise `SCHEMA_VERSION` in `src/model.js` and add one step to `MIGRATIONS` that lifts the previous version by exactly one, with a test.
- The live site is published from the `v1` branch, which holds only the shipped files. Work goes to `main` first.
- Colours, fonts, radii and motion are design tokens at the top of `style.css`, with a dark theme below them.

## Rights

© Ļevs Krilovs. All rights reserved. The code is public to read, but sharing, copying, distributing or republishing it needs his permission.

The fonts in `fonts/` (Golos Text and Literata) are under the SIL Open Font License 1.1; see `fonts/LICENSE-*.txt`.
