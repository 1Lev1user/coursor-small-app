# Bank import "works without breaking": cards C-055 to C-069 (draft, slice 3)

Sources: D-bank.md (analysis, "D#" below = its problem number), D-bank-verify.md (independent re-run of 8 claims, "V#" = its item number), C2-power-user.md, B-research.md section 3. All inputs synthetic. Nothing here depends on a real bank format except the cards marked "sample".

## Cards
| id | title | size | prio | depends_on | why (source, confirmed?) |
|---|---|---|---|---|---|
| C-055 | Guess the decimal separator when the currency follows the amount | S | P0 | - | "-12,50 EUR" read 100x too large, no warning. D1, confirmed V1 |
| C-056 | Read money direction from more words and from a D/C mark without a space | S | P1 | - | +/-, OUT/IN, Izdevumi/Ienakumi rows all become income; "12,50DR" loses the mark. D2 confirmed V2; D18 (suffix) D-bank only |
| C-057 | Show a check panel in the Columns step: sample rows, totals, line count | M | P0 | - | Totals in/out, first/last rows, file lines vs rows read; catches D1, D2, D4, D5, D6 by eye. D-bank recommendation; underlying problems confirmed V1-V5 |
| C-058 | Add a Reverse money in and out switch to the Columns step | S | P1 | C-057 | Bank with positive expenses gives the opposite result, no way to flip. D2/E7, D-bank only |
| C-059 | Skip dated balance lines wherever the label sits in the row | S | P1 | - | Opening/closing balance with a date imported as income. D4, confirmed V3 |
| C-060 | Do not let one stray quote mark swallow the rest of a CSV file | S | P0 | - | 12" pizza row loses 25 of 30 rows, UI says "1 line skipped". D5, confirmed V4 |
| C-061 | Find the header row when the header and data rows differ in width | S | P1 | - | Trailing `;` or trimmed XLSX cells: no header, layout never remembered. D6 confirmed V5; wide-preamble part (D7) D-bank only |
| C-062 | Detect the delimiter when the file starts with a long preamble | S | P1 | - | 11+ preamble lines give 0 rows. D7, D-bank only; planner re-ran it on current code (reproduced) |
| C-063 | Excel import: read the sheet that holds the transactions | S | P1 | - | Summary/hidden first sheet read instead of transactions. D9, confirmed V6 |
| C-064 | Add a Status column that skips pending, reversed and declined rows | M | P1 | C-057 | PENDING/REVERSED imported as spending. D3 on an ASSUMED Revolut shape, not independently confirmed; sample |
| C-065 | Add an optional Fee column that is added to the amount | S | P1 | C-064 | Fee column dropped, money out understated. D3, ASSUMED shape, not confirmed; sample (does Amount include Fee?) |
| C-066 | camt: do not import reversal entries as new payments | S | P1 | - | RvslInd never read, reversal counted as a second payment. D10, confirmed V7 (bank semantics unverified); sample |
| C-067 | camt: split batch entries into one row per payment | M | P1 | C-066 | One Ntry with 3 TxDtls becomes one row with the first payee. D10, confirmed V7; sample |
| C-068 | Do not hide a new payment as Exact when only a reused bank reference matches | S | P1 | - | Same ref + amount within 5 days = Exact, left out by default. D11a, confirmed V8 (wrong default, overridable) |
| C-069 | Add an optional Payee column so the merchant name is not lost | M | P1 | C-065 | Only one text column: every row "Pirkums", rule "PIRKUMS". D8 on ASSUMED headers, not confirmed; C2 finding 1.2/6; sample |

Suggested order: C-057 first (makes every later fix visible), then C-055, C-060, C-056, C-059 (P0/P1 S cards, independent, parallel-safe except for text.js merge conflicts in neighbouring regions), then C-061, C-062, C-063, C-068, then the sample-dependent C-064 to C-067, C-058, C-069 after the owner's file is seen. C-064, C-065, C-069 touch the same Columns-step code and each other's saved-layout merge helper, hence the chain.

Each card's new test file holds the research's synthetic failing input as a regression test. Seven fixes (C-055, C-056, C-059, C-060, C-061, C-062 on text.js, C-068 on core.js) were prototyped by the planner on a scratch copy; the existing importText (67 tests) and importCore (30 tests) suites stayed green. C-057, C-058, C-063 to C-067 and C-069 were not prototyped.

Existing tests to edit (needs owner approval): none. Two traps recorded in the cards instead: adding keys to `emptyColumns()` would break the deepEqual at importText.test.js:288 (new optional columns are added only when found); `layoutRecord` gets `reverse` only when true so its key checks stay valid.

## Proposed STORYMAP rows (add before `npm run check:kit`)
| ID | Actor | Activity | Step | Value | Priority | Status |
|---|---|---|---|---|---|---|
| S4.6 | Owner | Imports bank statement | Gets amounts, directions, dates, columns and sheets of any CSV or Excel file read correctly | Money in the app equals the bank's | P0 | planned |
| S4.7 | Owner | Imports bank statement | Sees a check of what was read (sample rows, totals in and out, line count) before continuing | Errors are caught by eye | P0 | planned |
| S4.8 | Owner | Imports bank statement | Balance lines, pending or reversed rows, fees and batch entries are not counted as ordinary money | Only real money is imported | P1 | planned |
| S4.9 | Owner | Imports bank statement | A new payment is not hidden as an already-imported duplicate | No missing payments | P1 | planned |
Slices line: "Slice 3 (planned, release 3.0): bank import hardening, cards C-055 to C-069."

## Open owner decisions
1. Which real bank is the sample from, and which format? Options: (a) Revolut CSV, (b) Latvian bank CSV, (c) camt.053, (d) FiDAViSTA. Recommended: send the file; cards C-064 to C-067 and C-069 are written for assumed shapes and must say "verify with the owner's sample" before they start. Until then do C-055, C-056, C-057, C-059 to C-063, C-068 (format independent).
2. Does the Revolut Amount already include the Fee (C-065)? Options: add the fee (card default), or leave the Fee column to be picked by hand only. Recommended: decide from the sample's Balance column (previous balance + amount - fee = next balance).
3. camt reversals (C-066): skip and warn (card), or net the pair, or import the reversal as a refund. Recommended: skip and warn now; decide after the sample shows how the bank sets the direction on a reversal.
4. Weak duplicate matches are pre-ticked for import (same amount within 2 days): a CSV and a camt of the same period then double. Options: keep (no missing payments, but doubles), or untick Weak by default with a "Probably the same payment" label. Recommended: untick by default and label it, but only after C-057 exists so totals are visible. Not carded.
5. Show the check panel (C-057) also when a saved layout skips the Columns step? Options: yes, above the Duplicates list; no. Recommended: yes, as a follow-up card, because a bank can change its format under a saved layout.
6. C-067 changes what a batch looks like: a statement imported earlier with one combined row and imported again shows the split rows as new. Options: accept (batches are rare), or keep the old single row unless sums match. Recommended: accept.

## Found but not carded (next wave, all lower)
Own-account transfers import as expense plus income (D12, M; pair out and in with equal amount within a day, map Revolut Type EXCHANGE/TOPUP/TRANSFER to transfer); rule matching by substring, Known rows collapsed (D13, S); future-dated or century-old rows accepted without a warning (D16 and C2 1.10, S); `Math.max(...rows)` crash at about 130,000 rows (D17, S); HTML or SpreadsheetML ".xls" gets the generic refusal (D15, S); textual month dates such as "17 Sep 2026" (D16, S); `PrtryAmt` read as an original currency in camt (D10, S); windows-1251 and UTF-16 without BOM (D14, rare); Excel dates stored as plain numbers (X4) and formulas without cached values (X6); undo of an import also removes edited entries without a warning (C2 1.11); sort step length and refund default (C2 1.4, UX topic). B-research ideas (camt.053 balance reconciliation, per-layout last-imported-date gap warning) need the opening-balance model from the money topic first.
