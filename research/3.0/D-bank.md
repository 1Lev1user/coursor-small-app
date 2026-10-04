# D-bank: weak spots in the bank statement import (read-only analysis)

Repo: C:\Users\krilo\Desktop\Projects\coursor-small-app, branch main-work, commit 05d1355. Nothing in the repo was edited.
Baseline: `node --test test/import*.test.js` = 165 tests, 165 pass.
Method: synthetic inputs run through the real modules (readStatementFile, parseDelimited, findHeaderRow, guessColumns, rowsToStatement, parseCamt, parseFidavista, readXlsx, findDuplicates, buildImport, applyImport, undoImport). The pipeline in `bank-probe/lib.mjs` copies what `startTable`/`parseTable` do in src/views/import.js. XLSX probes use a hand-built stored-ZIP workbook (`bank-probe/xl.mjs`).
Probe scripts: `bank-probe/p01_smoke.mjs` ... `p15_misc.mjs` (same folder as this file).

Labels: VERIFIED = I ran it and saw the result. ASSUMED = shape of a real bank file written from memory, no documented format at hand. I did not have network access, so no bank format was checked against a spec.

Severity scale: DATA WRONG (wrong or missing money in the app), REFUSED (import cannot proceed), CONFUSING (works but misleads or needs manual rescue), COSMETIC.
Size: S under half a day, M about a day, L multi-day.

---

## Ranked list (top 12)

| # | Problem | Severity | Size |
|---|---|---|---|
| 1 | Amounts with a trailing currency ("12,50 EUR", "12,50 €") are read 100x too large | DATA WRONG | S |
| 2 | Unsigned amounts + unrecognised/no direction column: every expense becomes income, no warning, no "flip sign" | DATA WRONG | M |
| 3 | Revolut-style CSV: Fee column dropped; PENDING/REVERSED rows imported as real expenses | DATA WRONG | M |
| 4 | Dated opening/closing balance rows leak in as income when the label is not in the Description column or uses an unlisted word | DATA WRONG | S |
| 5 | One stray `"` swallows the rest of the file; the loss is reported as a single "skipped" line | DATA WRONG (silent loss) | S |
| 6 | Header row not found when header width differs from the data width (trailing `;`, blank trailing cells in XLSX, split debit/credit in XLSX) | CONFUSING (manual rescue, layout never remembered) | S |
| 7 | 11 or more preamble lines break delimiter detection; a wide text-only preamble row is picked as the header | REFUSED | S-M |
| 8 | Only one text column can be mapped: payee name or details is dropped for CSV/XLSX | CONFUSING (weak rules, lost payer names) | M |
| 9 | XLSX reads only the first sheet in workbook order, including a hidden or "Summary" sheet | REFUSED/CONFUSING | S |
| 10 | camt: RvslInd ignored; batch entries collapsed to one row with one party; informational PrtryAmt read as the original currency | DATA WRONG (some banks) | M |
| 11 | Duplicates: reused bank reference hides a genuinely new payment as "Exact"; weak matches are pre-selected for import; CSV then camt of the same period doubles | DATA WRONG / CONFUSING | S-M |
| 12 | Own-account transfers import as expense + income by default (both legs counted); no pairing | DATA WRONG until the user reviews | M |

Additional, lower: 13 rule matching is substring based and the Known group is collapsed; 14 encodings (CP1251, UTF-16 without BOM); 15 HTML/SpreadsheetML ".xls" gets the generic refusal; 16 textual month dates; 17 `Math.max(...rows)` crashes at ~130k rows; 18 "12,50DR" without space; 19 cosmetic items.

---

## Detailed findings

### 1. Trailing currency breaks the decimal-separator guess (100x too large)  [VERIFIED]
- INPUT (semicolon file, comma decimals):
  ```
  Datums;Apraksts;Summa
  13.09.2026;S0;-12,50 EUR
  14.09.2026;S1;-3,20 EUR
  ```
  Same with "-12,50 €", "-12,50<nbsp>EUR", "-1 234,56 EUR".
- EXPECTED: -1250 and -320 cents; decimal separator ",".
- ACTUAL: decimalSeparator "." is guessed, amounts are -125000 and -32000 (EUR 1250.00 and 320.00). "1.234,56 EUR" is dropped as unparsable. Probe: `p05_dec.mjs`, `p03_csv2.mjs` B14 (value -12345600).
- Why: `guessDecimalSeparator` tests `/\d,\d{1,2}\)?-?$/` on the raw cell; the trailing " EUR" stops the match, so the default "." wins. Then `parseAmountWith(..., '.')` treats "," as a thousands separator. The same end-anchored regex is `DECIMAL_TAIL` in `layoutFitsSample`, so a saved wrong layout is later treated as "fits" and the Columns step is skipped (startTable 583-599).
- Note: leading forms ("EUR -12,50", "€12,50") work. Only the trailing form fails.
- SEVERITY: DATA WRONG. The Columns step shows raw cells, not parsed amounts, so the error is not visible until Categorise.
- FIX (S): in guessDecimalSeparator strip currency symbols/codes and the D/C/CR/DR suffix before the regex (reuse the normalisation at the top of parseAmountWith); decide by the last separator in the cell, not by "first sample that matches"; same change in DECIMAL_TAIL. Add a Columns-step preview of 3 parsed rows with sign and EUR value, plus total in/out for the file.
- FILE: src/import/text.js:311-324, 619-699; src/views/import.js:79-97.

### 2. Direction not recognised: all rows become income  [VERIFIED]
- INPUT A (unsigned amounts, indicator column with +/-):
  ```
  Datums;Apraksts;Summa;Zīme
  13.09.2026;RIMI;12,50;-
  14.09.2026;ALGA;900,00;+
  ```
  INPUT B: same with a "Veids" column of Izdevumi/Ienākumi. INPUT C: values OUT/IN. INPUT D: unsigned amounts, no direction information at all.
- EXPECTED: RIMI out, ALGA in; or at least a warning that every row is money in.
- ACTUAL: all rows direction "in" (+1250 +90000 +320). Default kind = income for each. No warning in the Columns or Duplicates step (`p10_dir.mjs` E1-E4).
- Related: E7, a bank that shows expenses as positive and income as negative gives the exact opposite and there is no "reverse signs" option anywhere in the Columns step.
- Vocabulary today (text.js:285-286): D/DR/DB/DBIT/DEBIT/DEBET/DEBETS/DEEBET and C/K/CR/CRDT/CREDIT/KREDIT/KREDITS/KREEDIT plus Cyrillic. Missing: OUT/IN, +/-, Izdevumi/Ienākumi/Izmaksa, Расход/Приход.
- SEVERITY: DATA WRONG (a month of spending shows as income). Probability depends on the bank; unverified for any specific one.
- FIX (M): (a) extend vocabulary; (b) in the Columns step, if more than 90 percent of parsed rows have one direction, show a warning and a "Reverse money in/out" switch stored in the saved layout; (c) show total in/out of the parsed file.
- FILE: src/import/text.js:285-295, 813-827; src/views/import.js:825-954 (Columns step).

### 3. Revolut-style CSV: Fee ignored, State ignored  [VERIFIED on an ASSUMED shape]
- ASSUMED shape (from memory of Revolut personal CSV, not documented here): `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`.
- INPUT rows (abridged):
  ```
  EXCHANGE,Current,2026-09-18 09:00:00,2026-09-18 09:00:00,Exchanged to USD,-100.00,1.50,EUR,COMPLETED,886.00
  CARD_PAYMENT,Current,2026-09-19 10:22:33,,AMAZON,-20.00,0.00,EUR,PENDING,866.00
  CARD_PAYMENT,Current,2026-09-19 12:00:00,2026-09-19 12:00:00,SHOP X,-8.00,0.00,EUR,REVERSED,866.00
  ```
- EXPECTED: exchange costs 101.50; PENDING not imported yet; REVERSED not imported.
- ACTUAL: -10000 (fee lost), AMAZON -2000 imported, SHOP X -800 imported (`p03_csv2.mjs` B7). Column guess itself is right (Type correctly not taken as direction, Currency picked, ISO datetimes parsed; foreign USD row asks for EUR).
- SEVERITY: DATA WRONG for any Revolut user (fees missing, reversed/pending money counted).
- FIX (M): add an optional "Status" column with skip values (PENDING, REVERSED, DECLINED, FAILED, CANCELLED, Rezervēts); add an optional "Fee" column added to the amount; default EXCHANGE/TOPUP/TRANSFER type values to kind "transfer". Needs a real Revolut sample to confirm names.
- FILE: src/import/text.js:250-265 (KEYWORDS), 766-870 (rowsToStatement); src/views/import.js:859-891 (column pickers).

### 4. Dated balance rows imported as income  [VERIFIED]
- INPUT A (label in a column that is not the mapped Description):
  ```
  Datums;Partneris;Apraksts;Summa;Debets/Kredīts
  01.09.2026;Sākuma atlikums;;1000,00;K
  03.09.2026;SIA RIMI;Pirkums;12,50;D
  30.09.2026;Beigu atlikums;;1887,50;K
  ```
- INPUT B (unlisted wording, dated): `30.09.2026;Atlikums perioda beigās;987,50`.
- EXPECTED: balance rows skipped.
- ACTUAL: A imports +1000.00 and +1887.50 as income (`p03_csv2.mjs` B3). B imports +987.50 (`p04_csv3.mjs` B5). Same-wording rows in the Description column ARE caught (B2/B4: "Sākuma atlikums", "Closing balance", "Sākuma saldo").
- Why: isSummaryRow checks only the Description cell when one is mapped (labelCells), and the whitelist needs every word to be known: "beigās" and "beigas" are missing (only "beigu" is listed). Rows with a date are never treated as summary by keyword.
- Real-bank relevance: UNVERIFIED. I assumed Swedbank-like row types 10/20/82/86 (ASSUMED); in that shape the label sat in the description column and was caught.
- SEVERITY: DATA WRONG when it hits (balance counted as income, large amounts).
- FIX (S): test every non-numeric, non-date cell of the row for a summary label; add forms (beigas, beigās, sākumā, atlikums + any word); in the review step flag any row whose text contains atlikum/saldo/balance/apgroz with an "Looks like a balance line" note and default to Skip; warn on rows whose amount is larger than 10x the file median.
- FILE: src/import/text.js:701-748.
- Minor related: a merchant whose whole description is "TOTAL" or "Balance" with a date is dropped as a summary row (`p13_more.mjs` G3). It is listed under skipped, so low.

### 5. Stray quote swallows the rest of the file  [VERIFIED]
- INPUT (30 rows, the 5th has a 12" pizza, unquoted field):
  `17.09.2026;PIZZA 12" MARGARITA;-12,50;EUR`
- EXPECTED: 30 rows, or a clear "file has unbalanced quotes" refusal.
- ACTUAL: tokenizer sees 5 data rows, 4 parsed, skipped list = one line "Row 6: Amount not recognised". 25 rows vanish; the UI says "1 line was skipped". A quote at row 28 of 30 loses rows 29-30 the same way (`p14b.mjs`).
- Why: tokenize() opens a quoted section at any `"`, not only at the start of a field (RFC 4180).
- SEVERITY: DATA WRONG (silent loss). Likelihood: depends on whether the bank quotes embedded quotes. Unverified.
- FIX (S): treat `"` as an opening quote only at field start; if end of input is reached while quoted, fall back to the lenient reading; always compare physical line count with parsed+skipped and warn on mismatch ("42 lines in the file, 40 read").
- FILE: src/import/text.js:56-118 (quote handling 67-87).

### 6. Header detection requires exactly the dominant width  [VERIFIED]
- INPUT CSV: header without trailing `;`, data rows with trailing `;`:
  ```
  Datums;Apraksts;Summa;Valuta
  17.09.2026;RIMI;-12,50;EUR;
  ```
  (and the reverse).
  INPUT XLSX: header `Datums | Apraksts | Summa | Atsauce`, most data rows leave the last cell blank (XLSX writer trims trailing blanks, xlsx.js:270-272). Also XLSX with split `Debets | Kredīts` columns: debit rows have 3 cells, credit rows 4, header 4.
- EXPECTED: header found at row 1, columns guessed, layout remembered.
- ACTUAL: headerRow -1, nothing guessed (confidence 0.1), "Choose the date column", signature empty so "Remember these columns" never saves (`p02_csv.mjs` A1/A2, `p06_xlsx.mjs` X5 and X8).
- The user can still map columns by hand (letters A, B, C) and answer the date question, and the header line is skipped as "Date not recognised". It works but every import repeats the manual mapping.
- SEVERITY: CONFUSING (REFUSED-looking, rescue possible). Split debit/credit XLSX is a very normal shape.
- FIX (S): in findHeaderRow accept rows with length >= dominant (or pad all rows to max width first, in readRows and after CSV tokenize); choose the header as the first row above the first data row (row with a parsable date) that is all text.
- FILE: src/import/text.js:205-248 (equality at 232); src/import/xlsx.js:258-276.

### 7. Delimiter detection samples the first 20 lines; wide preamble row taken as header  [VERIFIED]
- INPUT: 11 or more preamble lines without delimiters, then header + 30 rows (`p03_csv2.mjs` preamble loop): up to 10 preamble lines OK; 11, 12, 15 lines give 0 rows (all delimiters score 0, "," wins, amounts split on their decimal comma). Preamble lines of the `key;value;` kind are fine up to 20 lines.
- INPUT: preamble row `Klients;Jānis Bērziņš;Konts;LV00TEST;;;;` above an 8-column header: picked as header (4 of 8 cells filled, all text), 0 rows, no useful message (`p13_more.mjs` G1). Short files with many 3-field preamble rows can do the same (`p02_csv.mjs` A4).
- EXPECTED: header found after the preamble.
- SEVERITY: REFUSED. Likelihood unknown; I do not know how many preamble lines real exports carry.
- FIX (S-M): score delimiters over all non-empty lines (or the lines after the likeliest header), not the first 20; pick header as the last text-only row before the first row that has a parsable date.
- FILE: src/import/text.js:120-147, 205-248.

### 8. Only one text column is mapped  [VERIFIED]
- ASSUMED Swedbank-like shape (headers "Saņēmējs/Maksātājs", "Informācija saņēmējam") and Citadele-like shape ("Saņēmēja/Maksātāja nosaukums", "Maksājuma detaļas"):
  ```
  Datums;Saņēmēja/Maksātāja nosaukums;Maksājuma detaļas;Summa;Valūta;Atlikums
  13.09.2026;SIA RIMI LATVIJA;Pirkums;-12,50;EUR;987,50
  ```
- ACTUAL: description = "Pirkums"; the payee "SIA RIMI LATVIJA" is not kept anywhere (`p04_csv3.mjs` B6, B2). For Swedbank-like input the details column is chosen by the content fallback because "Informācija" is not in the description keywords. Rules, "Remember", note text and fingerprints are built from this single text.
- camt and FiDAViSTA rows carry counterparty and description separately, so this is a CSV/XLSX-only gap.
- SEVERITY: CONFUSING; payer names (employer for salary) lost.
- FIX (M): add an optional "Payee / counterparty" column picker (statementRow already has `counterparty`); add keywords informacija, nosaukums, saņēmējs, maksātājs, partneris.
- FILE: src/import/text.js:262, 854, 864; src/views/import.js:870-873.

### 9. XLSX: first sheet only  [VERIFIED]
- INPUT: workbook with sheet 1 "Summary" (Konts/Periods/Atlikums), sheet 2 "Transactions"; or a hidden first sheet with the active tab on sheet 2.
- EXPECTED: the sheet with transactions (or a choice).
- ACTUAL: first `<sheet>` element is read; zero rows, "No rows could be read" style dead end, nothing says other sheets exist (`p06_xlsx.mjs` X2, X3).
- Related (X4): dates stored as General numbers (no date style) are not converted, the date question is asked and all rows then fail "Date not recognised".
- Related (X6): formula cell without cached value reads empty and the row is skipped as "Amount not recognised". Excel always caches values, other generators may not. Low.
- SEVERITY: REFUSED/CONFUSING.
- FIX (S): readXlsx returns all visible sheets; pick the first with at least 3 rows and a date-like column, or offer a sheet picker when more than one qualifies.
- FILE: src/import/xlsx.js:116-127, 396-433.

### 10. camt.053 semantics  [VERIFIED behaviour; real-bank semantics UNVERIFIED]
- Reversals (`p07_camt.mjs` C2, `p11_camt2.mjs` C2b): `RvslInd` is never read. An entry with RvslInd=true is imported as an ordinary new expense or income. How banks set CdtDbtInd on reversal entries differs by guideline and I cannot verify it offline. Either way a reversal pair double counts or has the wrong sign. Needs a real sample.
- Batch entries (C4): `NtryDtls` with 3 `TxDtls` (10+20+30) become one row of 60.00 whose counterparty is the first party (SHOP A) and whose description is all three remittance texts joined. A "Remember" click would create a rule SHOP A for the whole batch.
- Batch with one foreign TxAmt (C5): the 60.00 EUR row is labelled USD with original amount 35.00, because `camtCounterAmounts` takes the first non-EUR amount from any TxDtls.
- Informational amounts (C17): a `PrtryAmt` in GBP next to a EUR `TxAmt` is read as the original currency (GBP 8.00) and the row then shows "Paid GBP 8.00". PrtryAmt is in the list at xml.js:424.
- Own transfers across accounts in one file (C1): both legs import (see 12).
- Charges (C6): `Chrgs/TtlChrgsAndTaxAmt` is not read; a separate fee entry is imported as its own expense, which is fine. Whether a bank includes the charge inside the main Amt is bank-specific and unverified.
- Structured remittance (C12): `Strd/AddtlRmtInf` and creditor reference are not read; description empty. Low.
- Pending entries (C3, C18): PDNG/INFO/FUTR are skipped with a visible warning. Good. Missing Sts is treated as booked. Good.
- Works: Sts as text or `<Cd>`, DtTm fallback, comma decimals, lowercase CdtDbtInd, CDATA, numeric entities, camt.052/054 containers, several `Stmt` per file, USD account with EUR counter amount (C7), NOTPROVIDED refs.
- SEVERITY: DATA WRONG for banks that use reversals or batches (unverified which).
- FIX (M): read RvslInd and show such entries in a "Reversal, check" group defaulting to skip; split batch entries into one row per TxDtls when their amounts sum to the entry amount, otherwise keep one row with the party "Several payees"; drop PrtryAmt from foreign candidates.
- FILE: src/import/xml.js:386-527.

### 11. Duplicate detection  [VERIFIED]
What works (`p09_dups.mjs`): same file twice gives all Exact (D1); after Undo the same file imports clean (D2); same amount, same day, two shops are kept apart; two identical rows in one file are matched one to one through the `#2` suffix (D3, D4); transfers/skips are remembered as "ignored" and re-offered with "Import anyway" until the import is undone (D12); a manual entry on the same day and amount is "Probable" and excluded by default (D9); foreign rows dedupe through currency+original amount (D10).
Weak spots:
- a) Reused bank reference (D7, D8): a stored entry with ref TOPUP / amount 10.00 on 10 Sep makes a NEW row with the same ref and amount on 13 Sep "Exact", default excluded, labelled "Already imported". The same happens with a camt NtryRef that is only a running number per statement ("1", "2", ...) when two different payments of equal amount fall within 5 days (D8). camtBankRef prefers AcctSvcrRef, then NtryRef, then EndToEndId (xml.js:457-470), so which one is used is bank-specific and unverified.
- b) Weak matches are pre-selected for import (D5, D6) and the checkbox in the group still says "Import anyway" while checked. A CSV imported first and the camt of the same period afterwards have different bank text, so every row is only "Weak" and is imported again unless the user unticks each one. Different-cafe-next-day is also "Weak".
- c) Unticking a weak match leaves no memory (D13): the next overlapping import asks again. Acceptable.
- d) Fingerprint includes bank text, so changing which column is mapped as Description, or importing the same period from another export format, breaks Exact matching.
- SEVERITY: DATA WRONG (a, silently missing payment) / CONFUSING (b).
- FIX (S-M): for ref-based Exact also require same date or same normalised text unless the reference is longer than ~10 characters and not purely numeric; label groups differently ("Keep both" pre-checked for Weak vs "Add anyway" unchecked for Exact); when the file is from another source/format than the earlier import, say so ("Same amount and date as an entry from another file, probably the same payment").
- FILE: src/import/core.js:50-58, 91-182; src/views/import.js:52-56, 1014-1046.

### 12. Own-account transfers  [VERIFIED]
- INPUT: one camt with two `Stmt` (accounts A and B): DBIT 100.00 in A and CRDT 100.00 in B, same date and text (`p07_camt.mjs` C1). Same for two CSVs of two accounts.
- EXPECTED: both legs default to Transfer, or a hint that they pair up.
- ACTUAL: one expense of 100.00 and one income of 100.00 by default. Revolut TOPUP/EXCHANGE rows (E8) also default to income/expense.
- SEVERITY: DATA WRONG until the user reviews every row; there is no pairing detection.
- FIX (M): in a multi-statement camt, match CdtrAcct/DbtrAcct IBAN against the file's own account IBANs; in any import pair out+in with equal amount within 1 day and show them as "Looks like a transfer"; map Type values (EXCHANGE, TOPUP, TRANSFER) to transfer.
- FILE: src/import/core.js:354-369 (defaultDecisions); src/import/xml.js:436-445.

### 13. Rule matching is a substring, Known rows are hidden  [VERIFIED]
- `applyRules` uses `haystack.includes(pattern)` with no word boundary (core.js:250). Rule RIMI matches "PRIMI PIATTI RESTORANS" and "RIMINI PIZZA"; rule BOLT matches "BOLTON FURNITURE" (`p12_rules.mjs`).
- `extractPattern("Maksājums par pakalpojumu")` returns "PAR", which would then match PARKING, PARDOSANA, etc.
- Rows sorted by a rule go into the "Known" group, collapsed by default (`knownOpen: false`, import.js:303, 1286-1306), so a wrong rule match is not seen before Import.
- SEVERITY: wrong category (CONFUSING). FIX (S): match on word boundaries; skip patterns shorter than 4 characters or in a stop list (PAR, UN, MAKSAJUMS, PAYMENT); show Known rows with a one-line summary of category counts.
- FILE: src/import/core.js:199-259; src/views/import.js:1286-1306.

### 14. Encodings  [VERIFIED]
- UTF-8 BOM, UTF-16LE/BE with BOM, windows-1257 (Latvian letters come out right: "Ķekava Šķūnis", "Žūpu iela") work. Strict UTF-8 first, then 1257, so text.js:27-48 is sound for LV banks.
- UTF-16 without BOM: decoded as UTF-8 with NUL characters, header not matched, 0 rows (A8). Rare.
- windows-1251 (Russian-language bank) is decoded as 1257 and gives mojibake with no warning (A10). Low for a Latvian owner.
- XML `encoding=` declaration is ignored; harmless for UTF-8/1257.

### 15. Excel-named files that are not xlsx  [VERIFIED]
- HTML table saved as ".xls" and SpreadsheetML 2003 XML both get "This file does not look like a bank statement" (`p11_camt2.mjs` F1, F2) with no hint to save as CSV/xlsx. ZIP that is not a workbook: "not an Excel workbook". Old OLE .xls has its own clear message. MT940 and OFX are recognised with a clear message.
- FIX (S): when the file is HTML or SpreadsheetML (or an .xls name), say "Save this file as .xlsx or CSV" and, better, read an HTML table.
- FILE: src/views/import.js:454-490; src/import/detect.js:37-55.

### 16. Dates  [VERIFIED]
- Work: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YY (20xx assumed), ISO with time/T/Z/offset (date part used, no timezone shift), XLSX serials with date styles, 1904 option.
- Textual months ("17 Sep 2026", "17-Sep-26") fail: date question is asked with three formats that all fail, every row "Date not recognised" (A15c).
- Format is inferred from the first 20 rows only; all days <= 12 asks the user, even for dotted DD.MM.YYYY (A15d). Fine but slightly annoying.
- No sanity range: 13.09.2062 and 14.09.1926 import silently; the 1926 month would get a frozen plan if chosen (`p08_fuzz.mjs`).
- FIX (S): month-name parser; warn when a row is more than 1 year in the future or 15 years in the past.

### 17. Large files  [VERIFIED]
- 140,000 rows (3.5 MB): parse 1.3 s, duplicate check 0.4 s, fine.
- `Math.max(...state.table.rows.map(...))` in columnOptions and previewTable throws RangeError at about 130,000 rows (`p08_fuzz.mjs`), so the Columns step would crash for a very large file (10 MB limit allows it). Real statements are far smaller. FIX (S): reduce loop instead of spread.
- FILE: src/views/import.js:755, 766.

### 18. Smaller amount-format gaps  [VERIFIED]
- "12,50DR" / "12,50CR" without a space: the D/C suffix is ignored (letters are stripped at text.js:658), so a debit becomes money in (A12 case F). FIX (S): allow optional space in trailingMark regex (text.js:634).
- Three or more decimals ("-1,005") are rejected, row listed as "Amount not recognised". Fine.
- `-1.234` with "," decimal reads as 1234.00 (thousands). Correct by convention.
- Mixed header "Summa" twice (amount and balance): first one used, correct in the probe (G5).
- Saldo/Atlikums running-balance column is not mistaken for the amount (B10, B6).

### 19. Cosmetic
- Skip reason "zero amount" has no friendly label in SKIP_REASONS (import.js:46-50); camt zero amounts are reported as "without a valid amount".
- File with only a header line says "does not look like a bank statement" (detect.js:80).
- Weak group checkbox says "Import anyway" while pre-checked.
- Summary row reason for a row without a date is "Date not recognised" for footers like "Atlikums perioda beigās" (still skipped).

---

## FiDAViSTA  [UNVERIFIED]
xml.js:565-585 says the element names are assumed from memory and I could not check them. I wrote my own sample from my memory of the format (FIDAVISTA / Statement / AccountSet / CcyStmt / TrxSet with BookDate, CorD, AccAmt, PmtInfo, CPartySet/AccHolder/Name, BankRef) and the parser reads it (`p07_camt.mjs` C14, C15). That only proves the parser matches the same memory. Risks that cannot be tested without a real file: OpenBal/CloseBal or total elements being picked up as entries (the walker takes only TrxSet/Trx/Transaction, so probably not), amounts that are signed vs unsigned, a different date element when BookDate is missing, merchant text living in a different element than PmtInfo. Card C-010 already covers this ("check against an anonymised real statement"). Recommend asking the owner to prefer camt.053 or CSV and keep FiDAViSTA as a bonus.

## Typical Latvian bank shapes (all ASSUMED, none from a documented spec)
- Swedbank-like: semicolon, comma decimals, columns Klienta konts; Ieraksta tips (10 opening, 20 transaction, 82 turnover, 86 closing); Datums; Saņēmējs/Maksātājs; Informācija saņēmējam; Summa; Valūta; Debets/Kredīts; Arhīva kods; Maksājuma veids; Refernces numurs; Dokumenta numurs. Result: dates, amount, D/K direction, Arhīva kods as bank ref, balance rows skipped (label in Informācija); payee column lost (problem 8).
- Citadele-like: Datums; Saņēmēja/Maksātāja nosaukums; Maksājuma detaļas; Summa; Valūta; Atlikums. Result: parsed, payee lost (8).
- Luminor / SEB: no shape assumed; I do not remember them well enough to guess without inventing a layout.
- Revolut: see 3.
So until a real file is seen, problems 1, 2, 4, 5, 6, 8 are the generic ones most likely to bite; 3 only if the file is Revolut; 10 only if it is camt.

## Suggested fix order when the real file arrives
1. Get the file (anonymised) and run it through `bank-probe/lib.mjs` `fromFile` to see which of 1-8 applies.
2. S fixes first: 1 (decimal guess), 4 (balance rows), 5 (quote tokenizer + line-count check), 6 (header width), 9 (sheets), 18 (DR/CR). Each is a few lines plus a test.
3. Add a Columns-step "check" panel (parsed sample rows, total in, total out, row count vs file lines). It would have caught 1, 2, 4, 5 and 6 by eye.
4. M items: 2 (reverse signs + vocabulary), 8 (payee column), 3 (status and fee), 10 (reversals and batches), 12 (transfer pairing), 11 (duplicate wording and ref rule).

## Index of probe scripts (bank-probe/)
lib.mjs (pipeline helper), xl.mjs (xlsx builder), p01 smoke, p02 CSV delimiters/quotes/encodings/amount and date formats, p03 preamble thresholds and bank shapes, p04 footers and header variants, p05 decimal separator with currency suffix, p06 XLSX, p07 camt + FiDAViSTA, p08 edge/fuzz (3000 random inputs, no exceptions), p09 duplicates/undo, p10 direction, p11 camt extras and file types, p12 rules, p13 more CSV, p14 stray quote, p15 misc/large.
All data in these scripts is made up.
