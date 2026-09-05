# My Expenses - Product Specification v1

This is the agreed specification. Every implementation task derives from this
document. Where code and this document disagree, this document wins.

## 1. Scope and platform

- Personal expense and income tracker that runs in a browser.
- Installable on a phone (PWA) and usable offline.
- Data is stored **on the device only**. No account, no server, no sync.
- Several people may use the app, but each device holds its own separate
  data. There is no shared or household ledger.
- Currency is **EUR only**. There is no currency picker.
- Interface language is **English only**.
- Hosted as a static site over HTTPS (GitHub Pages) so install and service
  workers work.

## 2. Money and dates

- Amounts are stored as **integer cents**. Never as floating point euros.
- Amount input accepts both `12.50` and `12,50`. Anything else is rejected
  with a visible message.
- Amounts are displayed as EUR with two decimals.
- Dates are local calendar dates stored as `YYYY-MM-DD` strings. No time,
  no timezone conversion.
- Months are **real calendar months**. February has 28 or 29 days.
  Navigation moves across months and years.

## 3. Data model

### Expense
- `categoryId` (required)
- `subcategoryId` (required **if** the parent category has subcategories,
  otherwise empty)
- `amount` in cents (required, greater than zero)
- `note` - free text the user writes to remember what it was
- `date` - defaults to today, user may change it to any date

### Income
- `incomeCategoryId` (required)
- `amount` in cents
- `note`
- `date`

Income categories are a separate list from expense categories. They start
as `Salary` and `Other`.

### Usual monthly income
A single amount in settings. It counts as that month's baseline income for
the current and future months. Extra income entries add on top of it.

### Subscription
- `name`
- `amount` in cents (the usual charge)
- `dayOfMonth` (1-31)

## 4. Budget model

The user types a **monthly spend budget** in EUR, for example 1000. This is
a planning number the user chooses. It is not derived from income.

Every expense category has a share of that budget expressed as a
**percentage**, and the shares are always presented as totalling 100%.

- A category is either **pinned** or **flexible**.
- A **pinned** category has a percentage the user typed, for example
  Savings 10%.
- **Flexible** categories split whatever percentage is left over, equally
  between them.
- When the user adds a category they choose pinned (and type a percentage)
  or flexible.

### Percentage rules

- The sum of pinned percentages is capped at 100%. Saving a change that
  would exceed 100% is blocked with a clear message.
- Leftover = 100% minus the sum of pinned percentages. It is split equally
  among flexible categories.
- If leftover is 0 and flexible categories exist, those categories have a
  0% budget. The app shows a warning that they have no budget. It does
  **not** silently rewrite the plan.
- If there are no flexible categories and pinned percentages total less
  than 100%, the remainder is displayed as `Unallocated`. `Unallocated` is
  a label on the remainder, not a category, and nothing can be logged to it.
- Per-category limits in cents are derived from exact shares. Rounding
  remainders are absorbed by the last category so the limits always sum to
  exactly the monthly budget.

### Going over

Exceeding a category limit does **not** change the plan for that month. The
overspend appears in the totals and the chart as over budget, and the
percentages stay as they were.

### Frozen months

Each month stores its own copy of the monthly budget and of the category
percentages. Changing the budget or the percentages affects the **current
and future** months only. Past months keep the plan they had. This is what
makes "the plan does not change" true.

## 5. Categories

Starting expense categories and their subcategories:

- **Necessary expenses** (flexible): Rent/mortgage, Groceries, Transport,
  Utilities, Insurance, Health
- **Subscriptions** (flexible): no subcategories initially
- **Random small purchases** (flexible): Eating out, Shopping, Other
- **Savings** (pinned): no subcategories

Savings is a **normal expense category**. Money moved to savings consumes
budget and appears as a slice of the spending doughnut.

### Subcategories

- Exactly **one level** deep. Subcategories have no subcategories.
- If a category has subcategories, choosing one is **required** when adding
  an expense.
- Subcategories have **no budget percentage of their own**. The percentage
  belongs to the parent category.
- The chart can drill into a single category to show its subcategories.

### Uncategorised (system category)

- `Uncategorised` is a system expense category that cannot be deleted or
  renamed.
- It always has a 0% budget and never takes a share of the flexible split.
- It is hidden from the app until it actually holds an expense, and it can
  never be chosen manually in the add form.
- Its purpose: when a category is deleted, its existing expenses move here
  so past months still add up correctly.

Note: `Random small purchases` has its own ordinary subcategory called
`Other`. That is unrelated to `Uncategorised` and must not be merged with it.

### Unspecified subcategory

Expenses recorded while a category had no subcategories keep an empty
subcategory. In drill-down views they are grouped under the label
`Unspecified`. `Unspecified` is a display label, never a selectable option.

## 6. Subscriptions

- The user saves a subscription once: name, usual amount, day of month.
- The app asks for confirmation **only from that day of month onward**,
  within the current calendar month, and only while that subscription has
  not yet been logged for that month. A subscription due on the 25th is
  never raised on the 1st.
- It keeps asking on every app open until the user acts.
- There is **no skip**. The user either confirms it, or deletes the
  subscription. Deleting the subscription is how a cancellation is recorded.
- On confirming, the amount is editable. An edited amount applies to **that
  month's expense only**; the saved subscription amount is unchanged.
- Deleting a subscription never deletes expenses already logged from it.
- Subscriptions are never raised while the user browses past months.

## 7. Screens

Bottom tab bar with four tabs: **Add**, **Month**, **Chart**, **More**.

### Add (home)
The add-expense form: category, subcategory when required, amount, note,
date defaulting to today.

### Month
- Selected calendar month, with navigation across months and years.
- **Budget left** = monthly budget minus expenses.
- **Cash left** = income that month (usual + extra) minus expenses.
- Total spent and total income.
- Comparison with the previous month.
- Which categories are over their limit.
- The list of that month's expenses and income.
- Clear empty state when the month has no data.

### Chart
- Doughnut of spending by category for the selected month.
- Tap a category to drill into its subcategories, including `Unspecified`.
- Legend shows planned versus actual.
- Explicitly **not included**: predicted month-end spending.

### More
Budget and percentages, income settings, categories and subcategories,
subscriptions, backup and CSV export, install help.

## 8. Editing and deleting

Everything can be edited or deleted: expenses, income, categories,
subcategories, subscriptions, the budget, and the percentages. Every delete
asks for confirmation first.

- Changing an expense's date may move it into another month. Both months'
  totals update.
- Deleting a category moves its expenses to `Uncategorised` and returns its
  percentage to the pool.

## 9. Files

### CSV export (one month)
Two buttons, because Excel behaves differently by region:

- **Europe**: UTF-8 with BOM, `;` field separator, comma decimal separator.
- **Standard**: UTF-8 with BOM, `,` field separator, dot decimal separator.

No `sep=` line, because it cancels the BOM in Excel.

Columns: Date, Type, Category, Subcategory, Note, Amount.

### Backup
- Export the full data set (all history, categories, settings) as a JSON
  file that the app can import later or on another device.
- Import **replaces everything** after a clear warning that states how many
  records will be destroyed.
- The backup carries a schema version and an import of an unknown or
  malformed file is refused rather than partially applied.

## 10. Storage and durability

- One versioned JSON object in `localStorage`.
- The app calls `navigator.storage.persist()` on start.
- WebKit deletes site storage after about seven days without a visit.
  Installing the app to the home screen is the real protection, so the app
  should encourage installing.
- The app reminds the user to export a backup when the last export is more
  than 30 days old and data exists.

## 11. Look and feel

Clean and modern like a banking app: cards, soft shadows, blue accent
(`#2563eb`), light background. Mobile first, comfortable touch targets,
readable at arm's length.

## 12. Out of scope for v1

Sync between devices, shared or household accounts, multiple currencies,
bank connections, predicted spending, savings goals beyond the Savings
category, budget periods other than the calendar month, and any login.
