# D-bank verification (independent reproduction)

Repo: coursor-small-app (read only, branch main-work, no edits). Node v24.19.0. Synthetic data only.
Scripts: `verify\` folder next to this file. `wiz.mjs` replays src/views/import.js: readStatementFile (csv/xlsx branch) -> startTable
(findHeaderRow, guessColumns, layout mode, layoutProblem, parseLayout) -> rowsToStatement; `zip.mjs` builds a synthetic .xlsx; c1..c8 are the probes.
UI facts read from src/views/import.js: the columns step has manual selects for every column and a Decimal separator select; skipped lines are listed as
"N line(s) were skipped: Row X: Amount not recognised"; duplicate groups show a side-by-side pair; for exact rows `include` defaults to false.

## Verdicts

| # | Verdict |
|---|---------|
| 1 | CONFIRMED (wrong guess; user can fix it with the decimal-separator select if they notice) |
| 2 | CONFIRMED (also when the user selects the direction column by hand) |
| 3 | CONFIRMED |
| 4 | CONFIRMED |
| 5 | CONFIRMED (header not found; manual mapping still possible) |
| 6 | CONFIRMED (not literally zero rows: the summary sheet's cells are read, mapping cannot succeed) |
| 7 | CONFIRMED (both parts) |
| 8 | CONFIRMED (wrong default; user can override in the duplicates step) |

## 1. Trailing currency + comma decimals -> x100 (c1.mjs)
Cause: `guessDecimalSeparator` (text.js) only matches `\d,\d{1,2}\)?-?$`, so "12,50 EUR" / "12,50 €" (currency after the number) matches neither branch and falls back to '.'.
Then `parseAmountWith('-12,50 EUR','.')` treats ',' as a thousands separator -> 125000.
Input (semicolon file, header `Datums;Apraksts;Summa`), wizard path:
- `-12,50 EUR` -> `direction out, amountCents 125000` (decimal guess ".")
- `12,50 €` -> `in, 125000`
- `12,50 € / 7,00 € / 1 234,56 €` -> 125000 / 70000 / 12345600
- Comma-delimited file with quoted `"-12,50 EUR"`: same, 125000.
- Direct: `parseAmountWith('-12,50 EUR','.') = -125000`; `parseAmountWith('-12,50 EUR',',') = -1250` (the parser is right, only the guess is wrong).
Extra: a column mixing `-12,50 EUR` and `-1.234,50 EUR` gives row 2 "unparsable amount".
No warning: the columns step says "N rows are ready to import".

## 2. Unsigned amount + direction column with +/-, Izdevumi/Ienakumi, OUT/IN -> all income (c2.mjs, c2b.mjs)
Cause: `directionOfValue` uses a fixed table (D, DR, DB, DBIT, DEBIT, DEBET(S), DEEBET, Д, ДЕБЕТ / C, K, CR, CRDT, CREDIT, KREDIT(S), KREEDIT, К, КРЕДИТ).
Other values are not recognised, so the direction column is not auto-detected and, even when set, `directionOfValue` returns null and the code falls back to the amount sign (positive -> 'in').
Input `Date;Description;Amount;Direction`, all amounts `10,00`, direction `-,+,-`:
- guessColumns: direction = -1; rows -> `in,in,in`
- Same for `Izdevumi,Ienākumi,Izdevumi` and `OUT,IN,OUT`.
- Manual selection of the direction column (c2b.mjs, columns.direction=3): still `in,in,in`, nothing skipped.
- Controls `D,K,D` and `DEBIT,CREDIT,DEBIT`: `out,in,out` (direction column detected).
The UI hint says "A column with D or K, debit or credit"; no warning when the chosen column holds unknown values.

## 3. Dated opening/closing balance row imported as income (c3.mjs)
Cause: `isSummaryRow` checks only the description column cell with `isSummaryCell` (every word must be in SUMMARY_WORDS); the keyword fallback `hasSummaryKeyword` applies only when the row has NO valid date.
Layout `Date;Type;Description;Amount`, description column = "Description", transaction rows around:
- `2026-03-31;Closing balance;;1234,56` (label in Type, Description empty) -> imported `in 123456`, nothing skipped
- `2026-03-31;Closing balance;Account EE01;1234,56` -> imported `in 123456`
- `2026-03-31;Info;Atlikums perioda beigas;1234,56` -> imported as income (word "beigas" is not in the list, the list has "beigu"). Same with "beigās" (normalises to "beigas").
- `2026-03-01;Info;Balance brought forward;1234,56` -> imported as income
- Controls skipped as "summary row": `Closing balance`, `Sākuma saldo`, `Opening balance 2026-03-01`, `Atlikums perioda sākumā` in Description; `Balance` in Type with `Closing balance` in Description.
Holds for (a) label outside the Description column and (b) wording missing from the word list.

## 4. One stray double quote swallows the rest (c4.mjs, c4b.mjs, c4c.mjs)
Cause: `tokenize` treats a `"` anywhere in a field as the start of a quoted section (not only at field start) and reads to the next `"`, which never comes.
File `Date;Description;Amount`, 30 data rows `2026-03-NN;Shop N;-N,00`, data row 5 description `Pizza 12" large`:
- parseDelimited returns 6 rows instead of 31; imported 4; skipped `[{"line":6,"reason":"unparsable amount"}]`.
  The UI says "1 line was skipped: Row 6: Amount not recognised" while 26 transactions are gone.
- Quote on data row 2: imported 1; on row 15: imported 14. Control without the quote: 31 rows, 30 imported.
- Comma-delimited variant with quoted amounts: the swallowed block also breaks the amount-column guess ("Choose the amount column", 0 imported).

## 5. Header width differs from data rows (c5.mjs, c5b.mjs)
Cause: `findHeaderRow` only accepts a row whose length equals the dominant row length.
- Header `Date;Description;Amount` (3 cells), 10 data rows ending with `;` (4 cells) -> headerRow -1, no date/amount guess ("Choose the date column."), imported 0, no skipped list.
- Header with trailing `;` (4 cells), data rows 3 cells -> same.
- With 2 preamble lines before the header: still -1.
- Controls (both with trailing ';', or neither): headerRow 0, 10 imported.
Manual mapping works: date=0, description=1, amount=2, decimal ',', YMD, headerRow -1 -> 10 rows, the header line skipped as "unparsable date" (c5b.mjs). Columns are labelled "Column A" etc.

## 6. xlsx with a summary first sheet (c6.mjs, zip.mjs)
Cause: `readXlsx` always reads the first `<sheet>` of workbook.xml (`firstSheetPath`); the view has no sheet picker and no sheet-related message.
Synthetic workbook, sheet 1 "Summary" (opening/closing balance rows), sheet 2 "Transactions" (header + 5 rows):
- `readXlsx` -> ok:true, 3 rows (the summary); wizard: headerRow -1, "Choose the date column.", imported 0. Nothing says other sheets exist.
- Sheet 1 with one title row: 1 row, same outcome.
- Control, transactions as sheet 1: 6 rows, 5 imported.

## 7. camt.053 RvslInd and batch TxDtls (c7.mjs)
`grep -ri "RvslInd\|reversal" src/` returns nothing: the flag is never read.
- Original DBIT 25.00 (RvslInd false) plus a second entry RvslInd true, DBIT 25.00 -> two rows `out 2500` (total -50.00, reversal counted as another expense).
  RvslInd true + CRDT -> `in 2500`. How CdtDbtInd is meant on reversals differs between bank guidelines (some keep the original direction); I could not verify the ISO rule offline. The flag is ignored either way.
- Batch: one Ntry, Amt 60.00 DBIT, three TxDtls (10/20/30, parties Alpha/Beta/Gamma) -> ONE row: `out 6000`, description "Invoice A Invoice B Invoice C", counterparty "Alpha" only, bankRef "B1". No warning.
- Control without RvslInd: one row.

## 8. Reused bank reference + same amount within 5 days = exact duplicate (c8.mjs)
Stored expense 10.00, 2026-03-10, bankRef REF-1, importId set. New row: out 10.00, bankRef REF-1, description of a completely different shop:
- +0, +2 and +5 days -> `level: exact` (matchId e1), `include` default false.
- +6 days -> no duplicate (control); different amount at +2 days -> no duplicate (control).
Cause: `byReference` in findDuplicates (core.js) ignores description and counterparty: reference + direction + amount + |days| <= 5 is enough.
A genuine new payment reusing the reference (e.g. a standing order with a fixed reference) is unticked by default; the user sees the pair in the duplicates step and can override, so it is a wrong default rather than silent loss.
