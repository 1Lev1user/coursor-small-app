# Bank statement shapes for 3.1 (research, 2026-10-17)

Two research agents searched open sources reachable from the cloud session: the npm registry, PyPI, RubyGems and raw.githubusercontent.com. Google, bank sites and iso20022.org were not reachable.

Labels:
- READ: a file the agent opened.
- CITED: stated in a doc that cites another source.
- UNVERIFIED: memory or inference.
- Synthetic: a developer-written fixture.

Licence rule for the app: only format facts are used. No third-party file or code is copied into the repository. Test fixtures are written fresh with made-up data in the documented shapes. Several sources are GPL or AGPL, or have no licence file.

Not found anywhere:
- Luminor (any country);
- Citadele CSV;
- SEB EE, and SEB LV header text;
- Paysera;
- any FiDAViSTA XML sample or XSD;
- any Baltic MT940 or OFX.

These stay on the generic path (column guessing plus the manual mapping) until someone sends a real anonymised file.

## CSV and Excel exports

| Bank / format | Delim | Decimal | Date | Sign | Notes | Source (label) |
|---|---|---|---|---|---|---|
| Revolut personal | `,` | `.` | `YYYY-MM-DD H:MM:SS` (one-digit hour occurs) | Amount signed | Header `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`; no preamble, no BOM | mlaitinen/ofxstatement-revolut samples and 6 other fixture repos (READ) |
| Swedbank LV | `;` | `,` | `DD.MM.YYYY` | unsigned + `D`/`K` | 12 columns `Klienta konts;Ieraksta tips;Datums;Saņēmējs/Maksātājs;Informācija saņēmējam;Summa;Valūta;Debets/Kredīts;Arhīva kods;Maksājuma veids;Refernces numurs;Dokumenta numurs` | DarthFin, skazhy/ynab-swedbank, ofxstatement-latvian (READ) |
| Swedbank EE | `;` | `,` | `DD.MM.YYYY` | unsigned + `D`/`K` | `Reatüüp, Kuupäev, Saaja/Maksja, Selgitus, Summa, Valuuta, Deebet/Kreedit, Arhiveerimistunnus, Tehingu tüüp` | ynab-swedbank aliases (READ) |
| Swedbank LT (2012) | `,`, all fields quoted | `.` | `YYYY-MM-DD` | unsigned + `D`/`K` | Empty header for the record type, trailing comma, unescaped inner quotes | ofxstatement-lithuanian (READ) |
| SEB LT | `;`, trailing `;` | `,` | `YYYY-MM-DD` | unsigned + `D`/`C` | Title line plus header repeated per account block; unique key `TRANSAKCIJOS KODAS`; payee `MOKĖTOJO ARBA GAVĖJO PAVADINIMAS` | nodm/draupnir (READ, synthetic) |
| SEB LV | `;` | `,` | `DD.MM.YYYY` | unsigned + `D`/`C` | Same 18 columns as LT; first 2 lines skipped; header text UNVERIFIED | ofxstatement-latvian sebLV.py (READ, positions only) |
| Wise balance | `,` | `.` | `DD-MM-YYYY` (+ `Date Time` with ms) | Amount signed | 20 or 23 columns incl. `Payer Name`, `Payee Name`, `Merchant`, `Total fees`, `Running Balance`; one currency per file | OSadovy/uabean, BananaAccounting/Universal (READ) |
| LHV EE | `,` | `.` | `YYYY-MM-DD` | use `D`/`C`; the sign is inconsistent between fixtures | BOM; Estonian or English header; `Kande viide` as a fallback reference | annetatargalt, robobook (READ, synthetic) |
| N26 | `,`, quoted | `.` | `YYYY-MM-DD` | signed `Amount (EUR)` | `Partner Name`, `Partner Iban`, `Payment Reference`, `Original Amount`, `Original Currency` | beancount-n26 1.6.0 (READ) |
| PayPal | `,` | locale | locale | Gross/Net signed | `Gross, Fee, Net`; foreign purchases as 4 rows sharing `Reference Txn ID`; localised headers | ofxstatement-paypal(-2) (READ) |
| Swedbank SE | `,` | UNVERIFIED | `YYYY-MM-DD` | signed `Belopp` | ISO-8859-15; one preamble line | beancountswedbank (READ) |

### Facts the import depends on
- **Revolut fees:**
  - Balance = previous Balance + Amount − Fee. This held on 80 of 80 testable rows of a real-looking export (statistics only).
  - So Amount does NOT include Fee: money out is |Amount − Fee|.
  - Type values come in SNAKE case (CARD_PAYMENT, TOPUP, TRANSFER, EXCHANGE, FEE, CARD_REFUND, ATM) and, since 2026, in Title Case ("Card Payment", "Topup").
  - State values: COMPLETED, PENDING and REVERTED (READ); DECLINED and FAILED (CITED). PENDING and REVERTED rows have an empty Completed Date and Balance. Parsers import COMPLETED only.
  - EXCHANGE appears as two rows, one per currency.
- **Wise fees:** Amount already includes the fee in the current format. `Total fees` is a breakdown and must not be added (CITED).
- **PayPal:** Net = Gross − Fee.
- **Swedbank record types:** `Ieraksta tips` 10 = opening balance, 20 = transaction, 82 = turnover, 86 = closing balance, 900 = unknown (ignored by tools). Only 20 is a transaction.
- **Swedbank references:**
  - `Arhīva kods` is not unique: commission rows (`Maksājuma veids` KOM) reuse the main row's code.
  - Card memo shape: `PIRKUMS <masked card> <yyyy.mm.dd> <hh.mm> <amount> <CCY> (<auth>) <merchant>`. The date inside is the purchase date.
- **SEB:**
  - Card text carries `DD/MM/YYYY HH:MM`.
  - Foreign card text looks like `299.00 NOK(25.67 EUR + mokestis 0.68 EUR(2.65%))`.
  - Own-account transfers appear as a D row in one block and a C row in another.

## camt.052/053/054 (ISO 20022)

| Source | Licence | Shows |
|---|---|---|
| gem `camt` 1.0.0 `spec/sample_files/camt.xml` (ABN AMRO NL) | MIT | 2 reversals DBIT + RvslInd true; batches with NbOfTxs 2/7/10, with and without TxDtls; reconciles |
| viafintech/camt_parser `spec/fixtures/053/valid_example_v4.xml`, `054/valid_example.xml`, `053/valid_example_v8.xml`, `053/valid_example_with_instdamt.xml` (CH) | MIT | Reversals DBIT + RvslInd true with RtrInf MD06; Btch with one TxDtls; InstdAmt + TxAmt + CcyXchg; PrtryAmt Tp IBS |
| kedder/ofxstatement-iso20022 `tests/samples/simple.xml` (DNB Bankas LT) | GPLv3 | Only Baltic sample: AmtDtls has InstdAmt = TxAmt = PrtryAmt (Tp EQUIVALENT), same EUR value |
| genkgo/camt `test/data/*.xml` (29 files, 052/053/054 versions) | MIT | Version coverage; entry and detail can disagree |
| gem `camt` `camt_germany_01.xml` (German DK) | MIT | Btch NbOfTxs 3 with 3 TxDtls; USD on EUR account: InstdAmt USD, TxAmt EUR, CntrValAmt + CcyXchg |

Facts:
- **Reversals:**
  - In every sample the reversal entry is `CdtDbtInd DBIT` + `RvslInd true`, undoing a credit: a returned or refunded direct debit the holder collected. Seen in 7 independent files.
  - CdtDbtInd is the direction of the booking on this account. Two reconciling files prove it: the reversals count as debits.
  - A reversal of a debit as `CRDT` + `RvslInd true` is UNVERIFIED by any file.
  - RvslInd is an xs:boolean (`true`, `1`), optional.
- **Batches:**
  - One Ntry with `NtryDtls/Btch/NbOfTxs` and several TxDtls. The parts are in `TxDtls/AmtDtls/TxAmt/Amt` or `TxDtls/Amt`. Btch may also appear with no TxDtls, or with one TxDtls.
  - NbOfTxs need not equal the number of TxDtls.
  - Safe rule (as @ekwo-ai/camt053 does): split only when every part has an amount in the entry currency and the parts sum exactly to the entry. Otherwise keep one row and warn.
- **PrtryAmt:**
  - Bank-specific and informational, with a mandatory Tp (EQUIVALENT, IBS seen). Never an original-currency amount.
  - The booked amount is always `Ntry/Amt`.
  - InstdAmt in another currency is the original amount; TxAmt and CntrValAmt carry the conversion.
- **Other:**
  - Opening balance code PRCD (older) or OPBD (newer).
  - Dates are Dt or DtTm.
  - Sts is plain `BOOK` up to v07 and `<Sts><Cd>BOOK</Cd></Sts>` from v08; PDNG exists.

## FiDAViSTA, MT940, OFX
- **FiDAViSTA:**
  - Element names in two independent readers (ofxstatement-latvian citadeleLV.py READ, GPLv3; mrgarry/yii2-omj-fidavista READ, MIT): Statement/Period, AccountSet/AccNo, CcyStmt/OpenBal, CloseBal, TrxSet with TypeCode, BookDate, CorD, AccAmt, BankRef, PmtInfo, CPartySet.
  - TypeCode values: CHOU (ATM), MEMD (fee), OUTP (payment), INP (transfer in).
  - The app's reader (src/import/xml.js ~570-680) already uses these names.
- **MT940:** samples exist (mt940js Apache-2.0, wolph/mt940 BSD-3). The app only recognises MT940 by owner decision C6/C7, and this is unchanged.
- **OFX/QFX:** samples exist (npm ofx MIT, ofxparse MIT). The app only recognises them; unchanged.
