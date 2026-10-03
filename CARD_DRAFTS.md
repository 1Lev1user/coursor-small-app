# Card drafts for the 16 open release-plan items (2026-10-03)

DRAFT from the planning agent (Opus, read-only). Card ids in this text are the ORIGINAL draft ids: add 1 to get the ids in CARD_DRAFTS.json (draft C-004 = C-005 ... draft C-025 = C-026). Owner decisions taken so far are in anchor.md (CHECKPOINT 2); they override the defaults below.

## Plan: cards to finish the 16 open release-plan items (read-only planning; no files were changed)

**What I checked:**
- I read all the files you listed, plus `src/`, `test/`, `scripts/`, the workflows and the `origin/v1` tree.
- I computed the colour contrast ratios once with a `node -e` command that changes no files.
- I confirmed that `node --test <missing file>` exits 1. So every new-test-file acceptance check fails today.

**Preconditions:**
1. Every card's "npm test exits 0" check needs C-001 merged first (the baseline is 352/355 passing).
2. `npm run check:kit` requires every card id to be in BOARD.md and every story_step to be in STORYMAP.md. The planner must add those in the same commit as the cards.

**New story steps to add to STORYMAP:**

| ID | Actor | Activity | Step | Value | Priority |
|---|---|---|---|---|---|
| S1.3 | Owner | Sets up | Learns the app from the PDF guide, including import | Uses every feature without help | P2 |
| S2.4 | Owner | Records entries | Undoes an accidental delete of an entry | Mistakes are reversible | P2 |
| S3.6 | Owner | Reviews money | Reads every screen in light and dark theme at WCAG AA contrast | Readable | P2 |
| S6.5 | Owner as operator | Backs up and updates | The live site changes only after tests pass | No broken release | P1 |
| S6.6 | Owner as operator | Backs up and updates | Decides whether search engines may index the live site | Privacy | P2 |

## (1) Per-item table

| Plan | Cards (size, tier) | Owner decision needed (recommended option first) | Manual checks |
|---|---|---|---|
| P-A2 | C-004 Ship list + guard test (S, sonnet); C-005 Publish workflow gated by tests (M, opus) | How to gate v1: **(a) a publish workflow that is started by hand, runs npm test, then pushes the ship list to v1**; (b) switch Pages to deploy from Actions (you change the Pages setting, v1 becomes an archive); (c) a local release script only; (d) policy only, close the item as "Decision changed". Also the trigger: **manual start** / every push to main / tag. | A run with a red test leaves v1 unchanged; a green run gives one commit "Release x" and the live site updates. Optional: a branch rule that limits who can push to v1. |
| P-A5 | C-006 One-button restore of the pre-update copy (M, opus) | Rollback scope: **(a) a button in Settings > Backup that restores the pre-update copy into the current version, after downloading the current data**; (b) also offer it on the Data problem screen (app.js:409-447); (c) also restore the rescue copy; (d) no button, document the 2-step path. Rolling back the app code itself is not possible on the device: a service-worker update replaces the files, so that is a v1 revert (P-A2). | Design review (screenshots); a restore on a real device with a pre-update copy. |
| P-B2 | C-007 Recognise MT940 and OFX/QFX by content (M, sonnet) | Until parsers exist: **(a) a specific "MT940/OFX not supported yet, export CSV" message**; (b) leave as unknown and close as "Decision changed". The wording depends on the P-C6/C7 decision. | none |
| P-B6 | C-008 End-to-end test: 100-row CSV import and undo leave no trace (M, sonnet) | Does "without traces" allow the import log record with `undoneAt` to stay? **(a) yes, Settings > Import history is by design**; (b) no, remove the record too (a src change, new card). | none |
| P-C4 | C-009 Check the FiDAViSTA reader against an anonymised real file (M, opus, blocked until the file exists) | **(a) you export a real FiDAViSTA statement and anonymise it**; (b) you obtain the official spec/XSD (availability unverified); (c) keep best effort with the README caveat and close as "Decision changed"; (d) remove FiDAViSTA. | Code part: the parser and a fixture test. Manual part: totals match the bank's statement; the fixture holds no personal data. 1.1 vs 1.2 is only distinguishable with the file or the spec. |
| P-C8 | C-010 Excel: a "save as CSV" message when the browser cannot unzip (S, haiku) | none (only which phones to check) | Device check: a real bank .xlsx on iPhone Safari / Android Chrome. |
| P-D3 | C-011 Backup reminder: no "Later" after 60 days without a backup (S, haiku) | Browsers cannot write files silently. **(a) an "overdue" level at 60 days or more, which cannot be snoozed; never-backed-up users keep "Later"**; (b) also cover never-backed-up users (needs an edit to test/uiHelpers.test.js:19,25, which needs your approval); (c) automatic save to a chosen folder via the File System Access API (desktop Chromium only, not iOS/Android; unverified); (d) accept today's behaviour, "Decision changed". Threshold: **60** or 45 days. | Design review of Home. |
| P-E1 | C-012 Guide builder: import and Trends pages, current text (M, sonnet); C-013 Regenerate the PDF (S, sonnet) | Who regenerates (needs python3 with reportlab and pypdf; this container has python3 but no reportlab): **(a) you, on your machine**; (b) a cloud session allowed to pip install; (c) drop the PDF and make the README the guide. Also: do C-011/C-022 UI changes require new screenshots (playwright)? Order with P-F4. | A new user imports a statement using only the guide; you read the PDF on the phone. |
| P-R17 | C-014 Automated WCAG contrast test for tokens, light and dark (S, haiku); C-015 Light chart colours to 3:1 (M, sonnet, only if chosen) | Method: **(a) the automated token test plus manual screenshots**; (b) a manual Lighthouse/axe run recorded in DESIGN.md; (c) both. Chart colours in the light theme are below 3:1 against the surface: cat-3 2.96, cat-4 2.60, cat-7 2.49, cat-8 2.00. **(a) accept, because the legend gives text values (check on screen)**; (b) fix them (C-015); (c) add separators between segments. | Screenshots at 390/768/1280 in both themes. |
| P-R20 | C-016 Test: import with EUR, USD and GBP rows (S, haiku) | When a file has no EUR amount: **(a) keep manual typing (no network rates, local-only), finish with the test**; (b) also derive EUR from a camt exchange-rate element (new M card, low value); (c) an offline rate table (stale, not recommended). | none |
| P-C6 | C-017 MT940 parser (M, sonnet); C-018 Import MT940 in the wizard (S, haiku) | Build at all? **(a) only if your bank exports MT940 and you provide a sample**; (b) build from public bank guides with synthetic fixtures only; (c) drop it, "Decision changed" (C-007 message stays). | A real MT940 file from your bank: totals match. |
| P-C7 | C-019 OFX/QFX parser (M, sonnet); C-020 Import OFX in the wizard (S, haiku) | Same question as P-C6. **Recommend dropping it (c)**: OFX is mainly a US/UK format (unverified for Latvian banks). | A real OFX file, if built. |
| P-F1 | C-021 Single version source: `npm version` updates sw.js (S, haiku) | **(a) an `npm version` hook: package.json is the source, sw.js is synced automatically**; (b) remove the version from package.json and keep sw.js only (needs an edit to test/serviceWorker.test.js, which needs your approval); (c) keep today's test-synced pair and close. Also: is the git tag that `npm version` creates OK? | none |
| P-F2 | C-022 Undo after deleting an entry in Month (M, sonnet) | **(a) a toast with Undo for 8 s, Month only, keep the confirm step**; (b) Undo and drop the confirm step; (c) also cover the Settings > Income list (settings/income.js:278). Duration: 5, **8** or 10 s. | Design review; delete, Undo, reload on the phone. |
| P-F3 | C-023 Record the noindex decision with a guard test (S, haiku) | **(a) keep noindex (private app, "share only with permission")**; (b) allow indexing (remove index.html:11). A project site cannot use its own robots.txt (it is read only from the host root), so the meta tag is the only control. The PDF on v1 cannot carry it. | none |
| P-F4 | C-024 Move the built PDF out of the repository tree (S, sonnet) | **(a) remove the PDF from the tree and publish it as a GitHub Release asset; keep guide-assets**; (b) also convert the 4 install photos (720 KB) to JPEG/WebP (needs a tool); (c) move docs to a separate branch or repo; (d) rewrite history: irreversible force push, not recommended. Should v1 keep `docs/`? | You create the Release with the PDF before merge. |
| (release) | C-025 Release: raise the version pair and publish v1 (S, opus) | Version number: 2.0.1 or **2.1.0**. Which cards go into it. | The installed app shows the Update bar and keeps its data. |

Measured facts behind P-F4 and P-R17:
- `docs/` is 2.3 MB in the tree (PDF 1.2 MB). The `docs/` files total 13.5 MB across the whole git history.
- Nothing in `src/`, `index.html` or README links to the PDF.
- Every text token pair passes in both themes. The lowest is light field-line on surface at 3.43, a non-text pair with a 3:1 threshold.

## (3) Recommended order

**Wave 0: your decisions.** A2, A5, C4 (needs your file), C6/C7, D3, E1, F1, F2, F3, F4, R17, R20. They can all be answered in one sitting.

**Wave 1** (can start now on the recommended defaults; no shared files; WIP limit 3):
- First: C-008 (test file only), C-010 (xlsx.js), C-011 (add.js).
- Then: C-014 (test only), C-016 (test only), C-023 (test only).

**Wave 2:**
- C-004, then C-005: the deploy gate.
- C-006 (storage.js and settings/backup.js).
- C-007 (detect.js and views/import.js).
- These touch separate files and can run in parallel.

**Wave 3:**
- C-022 (app.js, month.js, model.js, style.css). Not in parallel with C-015, which also edits style.css.
- C-015 after C-014, if you choose to fix the chart colours.

**Cards that must run one at a time because they share files:**
- README.md: C-021, then C-012, then C-024, then C-018, then C-020. C-009 also edits README and can go in anywhere, but not alongside the others.
- sw.js: C-017, then C-019, then C-025.
- views/import.js and types.js: C-007, then C-018, then C-020.
- docs/My-Expenses-User-Guide.pdf: C-024 and C-013. Settle the P-F4 decision first. If the PDF leaves the repo, change C-013 to produce a Release asset.
- scripts/ship-files.txt: C-004, then C-024.

**Blocked on you:** C-009 (anonymised FiDAViSTA file). C-017 to C-020 only if you decide to build MT940/OFX.

**Last:** C-025 (release), after C-005, C-021 and every code card you choose to ship.

**Existing tests:** no card edits an existing test file. Two alternative options would need your approval because they change one:
- D3 option (b) changes test/uiHelpers.test.js.
- F1 option (b) changes test/serviceWorker.test.js.

### Critical Files for Implementation
- /home/user/coursor-small-app/src/views/import.js
- /home/user/coursor-small-app/src/import/detect.js
- /home/user/coursor-small-app/src/storage.js
- /home/user/coursor-small-app/src/views/settings/backup.js
- /home/user/coursor-small-app/sw.js
- /home/user/coursor-small-app/src/views/add.js
- /home/user/coursor-small-app/scripts/build_user_guide_pdf.py
