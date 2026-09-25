# My Expenses

Local-only EUR expense and income tracker (PWA). Data stays on your device: no account, no cloud sync.

Live app: https://1lev1user.github.io/coursor-small-app/

## First-run setup

1. Your name, used on Home
2. Monthly spend budget (EUR)
3. Savings, in euro or as a % of that budget
4. Usual monthly income (EUR)

Change these later under Settings > Plan.

## Everyday use

- Home shows what is left to spend this month, your latest entries, expense templates (one tap adds a frequent expense) and your nearest savings goal.
- Add expense has a currency choice. For a foreign purchase, enter the amount in that currency and the euro amount your bank charged. Budgets and charts always use the euro amount.
- Month lists the month's entries. Search covers your whole history by text, category, type, amount and dates. Refunds lower spending and are marked Refund.
- Chart has four views: Spending, Income, Trends (12 months, average and the biggest category changes) and Year (totals and a yearly CSV).
- Settings > Goals: savings goals with a target and an optional deadline. Money added to a goal is recorded as a Savings expense.

## Importing a bank statement

Settings > Import > Import a bank statement. The file is read on this device and nothing is uploaded.

- Formats: CSV, text pasted from internet banking, Excel .xlsx, ISO 20022 camt.052/053/054 XML and FiDAViSTA XML (Latvian banks). Old .xls files must be saved as .xlsx or CSV first.
- CSV, Excel and pasted text: the app guesses the columns and shows the first rows. Correct them once; the layout is remembered under the bank name.
- Duplicates: rows already in the app are found by the bank reference, by an exact match of the same file, or by the same amount on the same or a nearby date. Nothing is merged or deleted without your choice.
- Each row can be an expense, a refund, income, a transfer between your own accounts (not counted) or skipped. "Remember" turns the choice into a rule, so the next import only asks about new shops. Rules are listed under Settings > Rules.
- For a past month that has no plan yet, the app asks once: use the current budget, or record only the actual spending.
- Every import can be undone from Settings > Import. Undo removes exactly that import's entries and keeps your rules and manual entries.

The FiDAViSTA reader was written without access to the official specification. If a FiDAViSTA file is not recognised, use the CSV export of the same statement.

## Backup, import, and CSV

Under Settings > Backup & export:

- Export backup (JSON): full restore file for this or another device
- Import backup: replaces local data after confirmation. Backups from older versions are updated automatically.
- Month CSV: Europe or Standard format, with currency and original amount columns

Home reminds you when the last backup is 14 days old and more strongly after 30 days. Browsers can clear site data, so keep a backup.

## Updates

When a new version is ready, the app shows an Update bar; tap it to reload into the new version. Version 2.0 changed the data format. Your data is converted once, and the untouched old copy stays on the device (Settings > Backup & export > Download pre-update copy).

## Install on phone

Open the link in Safari (iPhone) or Chrome (Android), then Add to Home Screen / Install app.

## Development

- `npm test` runs all tests (Node 22, no packages to install). GitHub runs them on every push and pull request.
- Releasing: raise `version` in `package.json` and `VERSION` in `sw.js` together. A test fails if they differ or if a file in `src/` or `fonts/` is missing from the offline cache list in `sw.js`.
- Data format changes: raise `SCHEMA_VERSION` in `src/model.js` and add one step to `MIGRATIONS` that lifts the previous version by exactly one, with a test.
- The live site is published from the `v1` branch, which holds only the shipped files. Work goes to `main` first.
- Colours, fonts, radii and motion are design tokens at the top of `style.css`, with a dark theme below them.

## Rights

© Ļevs Krilovs. All rights reserved. The code is public to read, but sharing, copying, distributing or republishing it needs his permission.

The fonts in `fonts/` (Onest and Unbounded) are under the SIL Open Font License 1.1; see `fonts/LICENSE-*.txt`.
