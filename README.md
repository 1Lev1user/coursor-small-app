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

- Home shows "Money now": the amount you have on the card. Every expense lowers it and every income raises it. Under it is a per-day line, a line with the month budget, your latest entries, Quick add and your nearest savings goal.
- Per-day amount: under Settings > Money > "Amount per day" choose "Automatic" (Money now divided by the days until the next payday or the end of the month) or "Fixed amount".
- Check against the bank: tap Money now and enter the amount your bank shows. A difference is added as one dated entry with the note "Bank difference". Edit or delete it in Month like any other entry.
- Paydays: add them under Settings > Income > "Regular income". On the payday Home asks for the amount you received ("Received", "Later" or "Skip this month"). Nothing is added without your tap.
- Add expense has a currency choice. For a foreign purchase, enter the amount in that currency and the euro amount your bank charged. Budgets and charts always use the euro amount. Tick "Refund (money back from a shop)" for money coming back: it lowers spending and is marked Refund. Tick "Save as template" to keep an expense you repeat.
- Quick add on Home adds a template with one tap; Undo takes it back. Settings > Quick add renames, re-prices or deletes templates.
- Month lists the month's entries, where it starts and ends, and each regular income (received, expected or skipped). Search covers your whole history by text, category, type, amount and dates. The comparison with last month appears once the month is over.
- Chart has four views: Spending, Income, Trends (12 months, average and the biggest category changes) and Year (totals and a yearly CSV).
- Settings is one page of groups, one open at a time: Money, Income, Monthly budget, Backup, Categories and limits, Subscriptions, Quick add, Goals, Bank import (advanced), Profile and about.
- Settings > Goals: savings goals with a target and an optional deadline. Money added to a goal is recorded as a Savings expense.

## Importing a bank statement

Settings > Bank import (advanced) > Import a bank statement. The file is read on this device and nothing is uploaded.

- Formats: CSV, text pasted from internet banking, Excel .xlsx, ISO 20022 camt.052/053/054 XML and FiDAViSTA XML (Latvian banks). Old .xls files must be saved as .xlsx or CSV first.
- CSV, Excel and pasted text: the app guesses the columns and shows the first rows. Correct them once; the layout is remembered under the bank name.
- Duplicates: rows already in the app are found by the bank reference, by an exact match of the same file, or by the same amount on the same or a nearby date. Nothing is merged or deleted without your choice.
- Before importing, "Check what was read" shows the totals money in and money out. If your bank shows spending as positive numbers, tick "Reverse money in and out".
- Possible duplicates are not imported unless you tick "Import anyway".
- Each row can be an expense, a refund, income, a transfer between your own accounts (not counted) or skipped. "Remember" turns the choice into a rule, so the next import only asks about new shops. Rules are listed in the same Settings group.
- A row near a payday or a subscription may ask "Is this the ...?". Yes ties the row to that regular income or subscription.
- For a past month that has no plan yet, the app asks once: use the current budget, or record only the actual spending.
- Every import can be undone from Settings > Bank import (advanced). Undo removes exactly that import's entries and keeps your rules and manual entries.

The FiDAViSTA reader was written without access to the official specification. If a FiDAViSTA file is not recognised, use the CSV export of the same statement.

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
