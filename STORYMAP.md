# STORYMAP

Built before any card exists. Order: actors, backbone, steps, slices. Edited only by the lead and the user.

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
| S2.1 | Owner | Records entries | Adds an expense, with currency choice and euro amount | Spending recorded | P1 | exists |
| S2.2 | Owner | Records entries | Adds a frequent expense with one tap from a template | Faster entry | P2 | exists |
| S2.3 | Owner | Records entries | Adds income or a refund | Totals are right | P1 | exists |
| S3.1 | Owner | Reviews money | Sees what is left to spend this month on Home | Daily decision | P1 | exists |
| S3.2 | Owner | Reviews money | Lists and searches entries in Month | Finds any entry | P2 | exists |
| S3.3 | Owner | Reviews money | Views Chart: Spending, Income, Trends, Year (with yearly CSV) | Sees patterns | P2 | exists |
| S3.4 | Owner | Reviews money | Exports Month CSV in Europe (;) or Standard (,) format | Data in a spreadsheet | P1 | exists |
| S3.5 | Owner | Reviews money | escapeField edge cases (carriage return, delimiter) are guarded by direct tests | Export opens correctly | P1 | slice 1 |
| S4.1 | Owner | Imports bank statement | Imports CSV, pasted text, .xlsx, camt XML or FiDAViSTA XML | Entries without typing | P1 | exists |
| S4.2 | Owner | Imports bank statement | Reviews duplicates and row kinds, remembers rules | No double entries | P1 | exists |
| S4.3 | Owner | Imports bank statement | Chooses a plan once for a past month without a plan | Past months stay correct | P1 | exists |
| S4.4 | Owner | Imports bank statement | Past-month plan rule is guarded by date-independent tests | Import stays trustworthy | P0 | slice 1 |
| S4.5 | Owner | Imports bank statement | Undoes an import from Settings > Import | Mistakes are reversible | P1 | exists |
| S5.1 | Owner | Plans and saves | Sets savings goals with target and optional deadline | Saving has a target | P2 | exists |
| S5.2 | Owner | Plans and saves | Adds money to a goal (recorded as Savings expense) | Progress visible | P2 | exists |
| S6.1 | Owner | Backs up and updates | Exports and imports a JSON backup | Data survives device loss | P1 | exists |
| S6.2 | Owner | Backs up and updates | Gets a reminder after 14 and 30 days without backup | Backups happen | P2 | exists |
| S6.3 | Owner | Backs up and updates | Taps the Update bar; data converted once, old copy kept | App stays current | P1 | exists |
| S6.4 | Owner as operator | Backs up and updates | Releases via branch `v1` with version pair raised | New version ships | P2 | exists |

## Slices
- Slice 1 (thin first slice): S4.4 (C-001, C-002), S3.5 (C-003). Goal in one sentence: Import stays trustworthy: import tests are date-independent and the past-month plan rule and CSV quoting are guarded by tests.
- Slice 2: later (open questions in SPEC.md, for example guide script dependencies).

## Card map (slice 1)
| Card | Step |
|---|---|
| C-001 Make 3 import tests date-independent | S4.4 |
| C-002 Regression test: past month without plan choice is refused | S4.4 |
| C-003 Direct tests for escapeField edge cases | S3.5 |

## Rules
- Every card references one step ID.
- A step with no card is a gap. A card with no step is scope creep and goes back to the lead.
