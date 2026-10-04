# STORYMAP

Every card names one step here. Order: actors, backbone, steps, slices. Edited by the planner (Claude) with the owner; see process/story-map.md.

Steps marked "exists" describe current behaviour from README.md. Slice 1 steps are new. Value and Priority of "exists" steps are [inferred].

## Backbone (who does what for whom)
| Actor | Activity (left to right in time order) | Value for whom |
|---|---|---|
| Owner | Sets up | Owner: a plan for the month |
| Owner | Records entries | Owner: spending is known |
| Owner | Reviews money | Owner: sees what is left and trends |
| Owner | Imports bank statement | Owner: entries without typing |
| Owner | Plans and saves | Owner: reaches savings goals |
| Owner | Backs up and updates | Owner: data is safe and app is current |

## Steps under each activity (top = more important)
| ID | Actor | Activity | Step | Value | Priority | Status |
|---|---|---|---|---|---|---|
| S1.1 | Owner | Sets up | Enters name, monthly budget, savings, usual income on first run | Plan exists | P1 | exists |
| S1.2 | Owner | Sets up | Changes the plan under Settings > Plan | Plan stays current | P2 | exists |
| S1.3 | Owner | Sets up | Learns the app from the PDF guide, including import | Uses every feature without help | P2 | planned |
| S1.4 | Owner | Sets up | Lists regular income with payday, usual amount and weekend rule | Knows when each income arrives | P1 | planned |
| S1.5 | Owner | Sets up | Enters the money on hand once and corrects it to the bank figure | Starts from the real figure | P1 | planned |
| S1.10 | Owner | Sets up | Finds and changes any setting in a short grouped Settings list, in one set of words | Settings found fast | P1 | planned |
| S2.1 | Owner | Records entries | Adds an expense, with currency choice and euro amount | Spending recorded | P1 | exists |
| S2.2 | Owner | Records entries | Adds a frequent expense with one tap from a template | Faster entry | P2 | exists |
| S2.3 | Owner | Records entries | Adds income or a refund | Totals are right | P1 | exists |
| S2.4 | Owner | Records entries | Undoes an accidental delete of an entry | Mistakes are reversible | P2 | planned |
| S2.5 | Owner | Records entries | Confirms income on its payday with the real amount, skips or postpones it | Actual income recorded, forecast stays a forecast | P1 | planned |
| S2.6 | Owner | Records entries | Skips or postpones a subscription reminder; a paid bank row counts as paid | No double entries | P1 | planned |
| S2.10 | Owner | Records entries | Renames, re-prices or deletes a quick-add template | Quick add stays tidy | P2 | planned |
| S3.1 | Owner | Reviews money | Sees what is left to spend this month on Home | Daily decision | P1 | exists |
| S3.2 | Owner | Reviews money | Lists and searches entries in Month | Finds any entry | P2 | exists |
| S3.3 | Owner | Reviews money | Views Chart: Spending, Income, Trends, Year (with yearly CSV) | Sees patterns | P2 | exists |
| S3.4 | Owner | Reviews money | Exports Month CSV in Europe (;) or Standard (,) format | Data in a spreadsheet | P1 | exists |
| S3.5 | Owner | Reviews money | escapeField edge cases (carriage return, delimiter) are guarded by direct tests | Export opens correctly | P1 | exists (slice 1) |
| S3.6 | Owner | Reviews money | Reads every screen in light and dark theme at WCAG AA contrast | Readable | P2 | planned |
| S3.7 | Owner | Reviews money | Sees money now, month start and end carried over, and a safe amount per day until payday | Can decide a purchase today | P1 | planned |
| S3.8 | Owner | Reviews money | Reads each month's income as received on its date; months he never had show nothing | Numbers can be trusted | P1 | planned |
| S3.10 | Owner | Reviews money | Each screen opens at its top; Add forms start in the first field and close on Escape | Orientation and keyboard use | P2 | planned |
| S3.11 | Owner | Reviews money | Reads every screen from 320 px to desktop width, faded rows included | Readable | P2 | planned |
| S4.1 | Owner | Imports bank statement | Imports CSV, pasted text, .xlsx, camt XML or FiDAViSTA XML | Entries without typing | P1 | exists |
| S4.2 | Owner | Imports bank statement | Reviews duplicates and row kinds, remembers rules | No double entries | P1 | exists |
| S4.3 | Owner | Imports bank statement | Chooses a plan once for a past month without a plan | Past months stay correct | P1 | exists |
| S4.4 | Owner | Imports bank statement | Past-month plan rule is guarded by date-independent tests | Import stays trustworthy | P0 | exists (slice 1) |
| S4.5 | Owner | Imports bank statement | Undoes an import from Settings > Import | Mistakes are reversible | P1 | exists |
| S4.6 | Owner | Imports bank statement | Gets amounts, directions, dates, columns and sheets of any CSV or Excel file read correctly | Money in the app equals the bank's | P0 | planned |
| S4.7 | Owner | Imports bank statement | Sees a check of what was read (sample rows, totals in and out, line count) before continuing | Errors are caught by eye | P0 | planned |
| S4.8 | Owner | Imports bank statement | Balance lines, pending or reversed rows, fees and batch entries are not counted as ordinary money | Only real money is imported | P1 | planned |
| S4.9 | Owner | Imports bank statement | A new payment is not hidden as an already-imported duplicate | No missing payments | P1 | planned |
| S5.1 | Owner | Plans and saves | Sets savings goals with target and optional deadline | Saving has a target | P2 | exists |
| S5.2 | Owner | Plans and saves | Adds money to a goal (recorded as Savings expense) | Progress visible | P2 | exists |
| S6.1 | Owner | Backs up and updates | Exports and imports a JSON backup | Data survives device loss | P1 | exists |
| S6.2 | Owner | Backs up and updates | Gets a reminder after 14 and 30 days without backup | Backups happen | P2 | exists |
| S6.3 | Owner | Backs up and updates | Taps the Update bar; data converted once, old copy kept | App stays current | P1 | exists |
| S6.4 | Owner as operator | Backs up and updates | Releases via branch `v1` with version pair raised | New version ships | P2 | exists |
| S6.5 | Owner as operator | Backs up and updates | The live site changes only after tests pass | No broken release | P1 | planned |
| S6.6 | Owner as operator | Backs up and updates | Keeps the live site out of search engines | Privacy | P2 | planned |

## Slices
- Slice 1 (done): S4.4 and S3.5, cards C-001 to C-003. Import stays trustworthy: import tests are date-independent and the past-month plan rule and CSV quoting are guarded by tests.
- Slice 2 (release 2.1.0 postponed, merged into 3.0): cards C-004 to C-028; open: C-006, C-010, C-013, C-014, C-026.
- Slice 3 (planned, release 3.0): money model C-029 to C-039, Settings and usability C-040 to C-054, bank import C-055 to C-069. Research behind them: research/3.0/.

## Rules
- Every card references one step ID.
- A step with no card is a gap. A card with no step is scope creep and is not written.
