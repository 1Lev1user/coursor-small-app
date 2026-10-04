# UX cards for 3.0 (C-040 to C-054)

Scope: Settings restructure and the usability findings that are not about the money model or the bank import. All cards are slice 3, written against `main-work` at 05d1355. Every card names its sources (C2, C3, A) in its Notes. Nothing here was run in the app; line numbers must be re-checked before each card is implemented (each card says so).

## Cards
| id | title | size | priority | depends_on | why (source) |
|---|---|---|---|---|---|
| C-040 | Settings: say each thing once, in one set of words | M | P1 | - | duplicate Add extra income form, double "Settings" heading, orphan note, "Edit plan"/"Budget share"/"spend budget" labels (C3 F12, F16, F24, F28) |
| C-041 | Settings opens as a short list of groups, one line each | M | P1 | C-040 | 7,638 px page, Backup at 6,351 px (C3 F8; A 4.3; B 4.3) |
| C-042 | Categories list: collapsed rows, one open at a time | M | P1 | C-041 | Categories is about 2,500 px; subcategory buttons wrap (C3 F8, F17) |
| C-043 | Adding a category says which other limits it changes | S | P1 | C-042 | silent cut of every flexible limit from 333.33 to 250.00 (C3 F11) |
| C-044 | Amount fields accept 1,234.50 and say what format they want | S | P1 | C-040 | "1 200,00" refused while import accepts it (C2 3.1; C3 F13) |
| C-045 | Plan form: confirm a zero budget and show unsaved edits | S | P2 | C-044 | budget 0 saved silently; typed 1234 looks saved (C3 F13, F15) |
| C-046 | Settings > Quick add: rename, re-price and delete templates | M | P2 | C-041 | templates cannot be edited or deleted (A gap 4; C2 2.8) |
| C-047 | Quick add: Undo in the toast and no second entry from a double tap | S | P1 | - | double tap adds two, no Undo (C2 2.7) |
| C-048 | Add expense: mark it as a refund when you add it | S | P2 | C-040, C-047 | `refund: false` hard-coded (A gap 5; add.js:1485) |
| C-049 | Search shows the total of the results | S | P2 | - | no sum in search (C2 4.1, 6.3; A gap 19) |
| C-050 | Screens open at the top; Add forms start in the first field and close on Escape | M | P2 | C-048 | Month opens 587 px down; focus lost on open; Escape does nothing (C2 7.1; C3 F14) |
| C-051 | Readable on every width and theme: content width, Year table, faded rows | S | P2 | - | 1,216 px inputs on desktop; Year table clipped at 320 px; faded rows 2.61:1 (C3 F26, F21, F18; C2 7.2) |
| C-052 | Compare an unfinished month with the same days of last month | M | P2 | - | 4-day October against full September; "up" with no data (C2 4.4; C3 F30) |
| C-053 | Restoring a backup: show what is in the file, keep a safety copy, keep the backup date | M | P1 | - | no preview, no safety copy, `lastBackupISO` null in the file (C2 0.3, 5.1-5.3) |
| C-054 | Reopen a closed savings goal | S | P2 | - | Closed goals offer only Delete (C2 3.4) |

Suggested order: C-040, C-041, C-042, C-043 (Settings chain); C-044 then C-045; C-047, C-048, C-050 (all touch add.js, so in this order); C-046 after C-041. C-049, C-051, C-052, C-053, C-054 are independent and can go in parallel.

## Proposed new STORYMAP rows
Numbers are high on purpose so they do not collide with rows other agents propose; renumber freely.
| ID | Actor | Activity | Step | Value | Priority | Status |
|---|---|---|---|---|---|---|
| S1.10 | Owner | Sets up | Finds and changes any setting in a short grouped Settings list, in one set of words | Settings found fast | P1 | planned |
| S2.10 | Owner | Records entries | Renames, re-prices or deletes a quick-add template | Quick add stays tidy | P2 | planned |
| S3.10 | Owner | Reviews money | Each screen opens at its top; Add forms start in the first field and close on Escape | Orientation and keyboard use | P2 | planned |
| S3.11 | Owner | Reviews money | Reads every screen from 320 px to desktop width, faded rows included | Readable | P2 | planned |
Existing rows used: S1.2 (C-043, C-045), S2.1 (C-044), S2.2 (C-047), S2.3 (C-048), S3.2 (C-049), S3.3 (C-052), S5.1 (C-054), S6.1 (C-053). Slices section: add "Slice 3 (planned, release 3.0): cards C-029 to C-069".

## Open owner decisions
| # | Question | Options | Recommended default |
|---|---|---|---|
| D1 | Words: what does "Plan" mean in Settings? | A: "Plan" stays the name of the section (name, budget, usual income); "Edit plan" becomes "Limit", "Budget share" becomes "Category limit", "spend budget" becomes "monthly budget", income entries are "Income". B: drop "Plan" everywhere ("Budget"; C3 F12). | A now (C-040 is written for A); revisit when the money cards move usual income out of Plan |
| D2 | Settings order and where Backup sits | Backup third, after Plan and Income (written); Backup first; Backup after all money rows | Third. The money cards add their rows above it, so backup stays within the first screen of rows |
| D3 | One page with collapsing groups, or sub-pages with a Back button? | Collapsing groups (C-041/C-042); separate pages (3-4 cards, needs navigation state) | Collapsing groups: no router, deep links keep working |
| D4 | Settings > Income still lists every income entry with Edit and Delete ("cannot be undone"), while Month edits entries with Undo | Keep (C-040 keeps it); remove it so entries live only in Month (about 250 lines out) | Decide after the money cards settle how income entries are edited |
| D5 | Default share for a new category | Flexible plus the notice (C-043); No limit by default (C3 F11) | Flexible plus notice |
| D6 | Budget set to 0 | Ask for confirmation (C-045); refuse. Setup allows 0 on purpose | Confirm |
| D7 | Safety copy before "Replace everything" | Download the current data first (C-053, as restorePreUpdate does); hidden copy in localStorage (quota risk); both | Download |
| D8 | Unfinished month in Month and Trends | Compare with the same days of last month (C-052); hide the comparison until month end | Same days |
| D9 | Desktop layout | Centred column of 46 rem (C-051); side navigation at 1024 px and up (C3) | Centred column first |

## Not carded, with reason
- Step counter "Step 1 of 4" then "Step 2 of 5" (C2 1.1): it is in the bank import wizard, `src/views/import.js`, which the bank cards edit. Hand-off text for the first bank card that touches import.js: `stepHeader` (:662-669) builds `Step ${index + 1} of ${list.length}` from `stepList()` (:329-333), which returns the 4-step list until `state.format` is set (it is `''` on the load step) and the 5-step list for csv, xlsx and paste. Fix: while `state.format === ''` print `Step 1` without a total, afterwards `Step n of N`; extract a pure `stepCountText(index, total, formatKnown)` and test the three cases in a new test file.
- Seen but outside the list you gave (add as cards if wanted): one calm backup reminder instead of the Home banner plus a Settings overlay, and device-neutral wording ("phone" on desktop) (C3 F25); hero amount wraps inside the number at 320 px (C3 F22); sanity check for huge amounts (C3 F23); same over-limit marker in Chart as in Month (C3 F19); "12 expenses will move to Uncategorised" count in the category delete text (C3 F29); defaults make Necessary over by on day 1 (C3 F20); Month CSV follows the month last viewed (C2 4.6); delete-all-data and a version line in About (A gaps 14, 17); undo-import wording about edited rows (C2 1.11, bank).

## Conflicts to watch when other agents' cards are merged
- `src/budget.js`: C-043 only adds one function; money cards rewrite `monthTotals`.
- `src/views/month.js` and `src/analytics.js`: C-052 touches `render`/`comparisonText` and `categoryChanges`; money cards change Month totals and `actualTotals`.
- `src/views/add.js`: C-040 (four strings), C-047, C-048, C-050 are chained; money cards change the income form and the explanatory sentences (C-040 lists the strings it must not touch).
- `src/views/more.js`, `src/views/settings/plan.js`, `shared.js`, `style.css`: shared by several cards in this set and by money cards that add Settings sections; C-041's `SETTINGS_GROUPS` array is the single place a new group is added, and its test checks relative order only so later groups do not break it.
- Schema changes by money cards raise `SCHEMA_VERSION`; the backup block "Data from before version 2.0" (backup.js:273-335) is deliberately untouched by C-053.
- `sw.js`: C-046 adds one module to `CORE_ASSETS`; `npm version` handles the version line separately.
