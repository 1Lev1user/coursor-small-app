# My Expenses: impeccable design direction (proposal only)

DEGRADED: single-context. The caller did not allow sub-agents, so the critique's two isolated assessments (design review, detector) ran in one context. Nothing in the repository was edited, and no critique snapshot was written to `.impeccable/`.

Method. I read `DESIGN.md` and `style.css` (tokens on lines 80-168; buttons 846-912; toast 916-961; forms 777-842; tab bar 278-326). I looked at the 5 supplied screenshots, then drove the running app at 390x844 in light and dark (`shots/imp-01..17`). Font candidates were rendered side by side (`shots/imp-18`, `imp-19`). Contrast was computed with the WCAG 2.x relative-luminance formula (`design/contrast.js`).
Detector: `detect.mjs --json index.html` returned `[]`. That proves little, because `index.html` is a 33-line shell and every screen is rendered by JS.

Mode: **Operate** (app UI, one-handed, short sessions). Brand belongs in the details, not in decoration.

---

## 0. Verdict in one paragraph

The sage/pine "colour blocks" direction is a real point of view and it works on the Home hero. Everything around the hero is still default-app: text-only tab bar with a 5px dot, a grey secondary button that disappears into the sage, a red/green alert, Edit/Delete repeated on every row, duplicate screen titles, and a copyright strip under the tab bar. The best move is not more colour. Make the money read like money (a figure face with ledger character) and make every button one coherent family. Two real bugs were found along the way (section 5, items 1 and 2).

Design health (Nielsen, 0-4): Status 3 · Real world 3 · Control 3 · **Consistency 2** · Error prevention 3 · Recognition 3 · Efficiency 3 · **Aesthetic/minimal 2** · Error recovery 3 · Help 3 = **28/40 (Good)**. Validation copy is already strong ("Enter an amount above zero, like 12.50 or 12,50").

---

## 1. Buttons (current colours: pine #1F5C45 on sage)

### What is wrong now (measured)
- The secondary `.btn` (`--surface-2 #E6ECE3`) is **1.08:1** against the sage `--bg` and **1.11:1** against card `--surface`. "Add income" on Home and "Back to Home" on Add both read as a smudge, not a control.
- There is no `:disabled` style for `.btn` at all, yet the code disables buttons (`add.js:370` savings button, `import.js:947/1442`, `app.js:542`).
- Press feedback reuses the 240ms colour transition, so a tap feels laggy. `scale(0.98)` is too small to notice under a thumb.
- `.btn-danger:hover` uses `filter: brightness(0.92)`. That is a filter on a token colour, so no exact pressed value exists.
- The focus ring is `3px var(--accent)`. On the pine `.update-bar` and the pine hero block it is pine on pine: **1.00:1, invisible**.
- Inline Edit/Delete are full 44px `.btn-ghost` blocks. Five entries make ten heavy controls (`shots/imp-10`).

### Shared tokens (add to :root and the dark block)
```css
/* light */
--accent-press: #133D2E;      /* white on it 12.11:1 */
--danger-press: #872520;      /* white on it 9.07:1 */
--btn-2: #DCE7DF;             /* pine-wash secondary inside cards; pine text 6.18:1 */
--btn-2-on-bg: #F4F7F1;       /* secondary on sage ground; pine text 7.26:1 */
--btn-2-press: #CBDCD0;       /* pine text 5.49:1 */
--btn-off: #D3DBCF;           /* disabled fill */
--btn-off-ink: #56635B;       /* 4.44:1 on --btn-off (disabled is exempt; still legible) */
--focus: #1F5C45;             /* 6.05:1 vs bg, 7.26:1 vs surface */
--dur-press: 90ms;
--dur-release: 160ms;

/* dark */
--accent-press: #6DB892;      /* ink #0E1A14 on it 7.58:1 */
--danger-press: #E2776F;      /* ink on it 6.04:1 */
--btn-2: #22362C;             /* mint-wash; #9FD8BB text 7.97:1 */
--btn-2-on-bg: #22362C;
--btn-2-press: #2B4436;       /* #9FD8BB text 6.56:1 */
--btn-2-ink: #9FD8BB;
--btn-off: #2E3A33;
--btn-off-ink: #7F8C84;       /* 3.38:1 */
--focus: #86CBA8;
```
On pine surfaces (`.home-figure`, `.update-bar`, `.added-box` if made pine), set `--focus: #FFFFFF` locally. White on pine is 7.85:1 light and 7.38:1 dark (on the proposed dark block).

### Variant A: "Tinted blocks" (recommended)
This extends Direction C literally: no borders, no shadows, the hierarchy comes from tint.
```css
.btn {
  min-height: 48px;                 /* 44 stays the floor via --tap; 48 for form submits */
  padding: 0 20px;
  border: 0;
  border-radius: 14px;              /* keep --radius-sm; cards stay 20px */
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: 0;
  color: var(--accent);             /* light #1F5C45 | dark use --btn-2-ink #9FD8BB */
  background: var(--btn-2);         /* #DCE7DF | dark #22362C */
  transition: background-color var(--dur-release) ease-out, transform var(--dur-release) ease-out;
}
.view > .btn, .home-actions .btn { background: var(--btn-2-on-bg); }  /* #F4F7F1 on sage */
.btn:active { background: var(--btn-2-press); transform: scale(0.97); transition-duration: var(--dur-press); }

.btn-primary { color: var(--accent-ink); background: var(--accent); }          /* #FFF on #1F5C45 7.85:1 */
.btn-primary:active { background: var(--accent-press); }                       /* #133D2E */

.btn-danger { color: #FFFFFF; background: var(--danger); }                     /* 6.97:1 */
.btn-danger:active { background: var(--danger-press); }                        /* #872520 */
/* dark: .btn-danger { color:#0E1A14; background:#F0918A } 7.75:1 ; active #E2776F */

.btn:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

.btn:disabled, .btn[aria-disabled='true'] {
  background: var(--btn-off); color: var(--btn-off-ink);
  cursor: not-allowed; transform: none;
}

/* Inline (row actions, "Open Month", "Later", "Not now") */
.btn-inline {
  min-height: 44px; padding: 0 4px; background: none;
  color: var(--accent); font-weight: 600; font-size: 0.9375rem;
  text-decoration: underline; text-decoration-color: transparent;
  text-underline-offset: 4px; text-decoration-thickness: 2px;
}
.btn-inline:active { text-decoration-color: currentColor; background: none; transform: none; }
.btn-inline.is-danger { color: var(--danger); }                                /* 6.44:1 on surface */
```
Why A: it keeps the "no borders" rule and costs the fewest tokens. Light/dark parity is clean. Its risk is that the secondary still has no edge on cards (1.17:1). That passes WCAG, because the pine label identifies the control, but it relies on the label colour.

### Variant B: "Outline pill"
```css
.btn { border-radius: 999px; min-height: 48px; padding: 0 22px; background: transparent;
       border: 1.5px solid var(--accent); color: var(--accent); }   /* edge 6.05:1 on bg, 7.26:1 on surface */
.btn:active { background: #DFE8E0; }            /* pine 10% on surface; on bg #CAD6CB. Pine text 6.11 / 5.28 */
/* dark: border/text #86CBA8; :active background #273930 (cards) / #202F27 (bg); text 6.73+ */
.btn-primary { border-color: transparent; background: #1F5C45; color: #FFF; }  .btn-primary:active { background: #133D2E; }
.btn-danger  { border-color: #A3302A; color: #A3302A; background: transparent; }   /* step 1 of delete */
.btn-danger.is-confirm { background: #A3302A; color: #FFF; }                      /* step 2 */
.btn-danger:active { background: #F6E4E1; }  .btn-danger.is-confirm:active { background: #872520; }
disabled: border-color #D3DBCF; color #56635B; background transparent.
focus: outline 3px var(--focus), offset 3px (pills need the extra gap).
```
Why B: every secondary is visible on any ground (3:1+ edge everywhere). Against: outline pills are the most generic app look there is, and 999px pills next to 20px cards add a third shape family.

### Variant C: "Ledger keys" (tactile)
```css
.btn-primary { background: #1F5C45; color: #FFF; border-radius: 12px;
               box-shadow: inset 0 -3px 0 #133D2E; }
.btn-primary:active { background: #1A5240; box-shadow: inset 0 -1px 0 #133D2E; transform: translateY(2px); } /* white 9.03:1 */
.btn { background: #F4F7F1; color: #15201A; box-shadow: inset 0 -2px 0 #C9D3C6; border-radius: 12px; }      /* 15.49:1 */
.btn:active { background: #CBDCD0; box-shadow: none; transform: translateY(2px); }                             /* 11.72:1 */
.btn-danger { background: #A3302A; color: #FFF; box-shadow: inset 0 -3px 0 #6E1E1A; }
.btn-danger:active { background: #872520; box-shadow: none; transform: translateY(2px); }
/* dark: primary #86CBA8 / band #5FA683; secondary #22362C / band #15231C; danger #F0918A / band #C9625B */
disabled: box-shadow none; #D3DBCF / #56635B.
```
Why C: it reads as physical calculator keys, which suits a money app and gives the most "authored" character. Against: it breaks the DESIGN.md line "No borders or shadows on surfaces". That line is about surfaces rather than controls, but the owner should decide.

**Recommendation: A**, plus the structural fixes in section 5 (rows lose their inline Edit/Delete).

---

## 2. Palette: small tweaks only

Already good: body text 12.9-15.5:1, muted 6.3-7.6:1, pine button 7.85:1, danger 5.7-6.97:1. Dark mode is solid (text 13.6-15.1:1). The changes below are the only ones I would make.

| # | Token | Light now -> proposed | Dark now -> proposed | What it fixes | Ratio after |
|---|---|---|---|---|---|
| 1 | `--field-line` | #7A887F -> **#6B7A71** | #75847B (keep) | Input edge is 3.43:1 on cards, but **2.86:1 on sage** (search/month picker contexts). New value has margin in both. | 4.18 (surface) / 3.48 (bg); dark 4.20 |
| 2 | `--block` (dark only) | - | #1F4E3C -> **#24604A** | In dark the mint "Add expense" button outshines the hero block (block is only 1.93:1 vs bg), so the hero number stops being the loudest thing (`shots/imp-11`). | block-ink 6.81:1, block-soft 4.85:1 (was 6.24) |
| 3 | new `--warn-soft`, `--warn-ink`, `--warn-line` | **#F3E6CC / #7A4E00 / #C9A66B** | **#33291A / #E2B666 / #6E5630** | The backup reminder uses the *danger* red, the same as "over budget" and "Delete". A missing backup is a caution, not an error. Amber also stops the red-card-with-green-button clash. | ink 5.83:1 light, 7.55:1 dark; body text on it 13.56 / 11.73 |
| 4 | `--savings` | #9A6408 -> **#8A5A00** (= current `--savings-ink`) | keep #D6A04A | Merges two near-identical tokens. As a fill on `--track` it goes from 3.24 to 3.84:1. Only matters once bug 5.2 is fixed (savings bars are pine today). | 5.48 on surface |
| 5 | button tokens | see section 1 | see section 1 | Pressed/disabled/focus need exact values. | listed above |

Deliberately **not** changed:
- `--surface`, `--bg`, `--accent`, `--danger`, `--muted`. These are the identity, and they pass.
- Chart categories `--cat-*`. In light mode cat-3 #eb6834 (2.96), cat-4 #1baf7a (2.60), cat-7 #e87ba4 (2.49) and cat-8 #eda100 (2.00) are below 3:1 against the card. That is acceptable only because every segment has a text legend row with its amount. The comment says the set was validated for colour-blind separation, so do not darken single values without re-running that check. The actual chart problem is semantic (section 5, item 6).
- `--border` #D3DBCF (1.31:1). These are decorative hairlines, so no requirement applies.

---

## 3. Fonts (owner dislikes Onest + Unbounded)

Measured in the running app: both current fonts *do* have working `tnum` (width of "1111" = "0000" = 124.8px for Unbounded with tabular-nums). Swapping is a taste decision, not a fix. Unbounded's real problem is that it is a wide display face also used for every screen title ("Home", "Month", "Settings"), so headers shout. Numbers should own that face alone.

All candidates below were checked for: SIL OFL 1.1 (commercial use and self-hosting allowed; the fonts must not be sold on their own); Latin Extended plus Cyrillic subsets (Fontsource API); Latvian ā č ē ģ ī ķ ļ ņ š ū ž and Russian rendering (`shots/imp-19`); and tabular figures, by the same width test in a headless browser.

### A. Golos Text (body) + Martian Mono (figures) **(recommended)**
- Character: Golos is a calm, sturdy grotesque, very even in Cyrillic, quieter than Onest. Martian Mono gives the amounts a receipt or bank-ledger voice, which is the "money" signal the app currently lacks.
- Figures: mono, so tabular by construction (1111 = 0000 = 112px). Use the width axis for scale: hero `font-stretch: 75%; font-weight: 650; letter-spacing: -0.02em`, list amounts `font-stretch: 87.5%; font-weight: 600`. At 100-112.5% width the comma and point take a full cell and the hero looks gappy (`shots/imp-18`, row A). 75% fixes that (`imp-19`, A2).
- Coverage: Golos Text has cyrillic, cyrillic-ext, latin, latin-ext. Martian Mono has the same set; its README marks Bulgarian/Serbian/Macedonian localized forms as work in progress. That does not matter here because the face would only set digits, €, +, −, comma and point.
- Weights/axes: Golos Text variable wght 400-900. Martian Mono variable wght 100-800 plus wdth 75-112.5.
- Licence/source: OFL 1.1. https://github.com/google/fonts (ofl/golostext, ofl/martianmono) · upstream https://github.com/evilmartians/mono · https://fonts.google.com/specimen/Golos+Text
- Cost: two families, the same as today. Self-host as variable woff2, latin + latin-ext + cyrillic subsets with `unicode-range`, as is done now.

### B. Ysabeau Office (one family, body + figures)
- Character: a humanist sans with calligraphic stroke, warm and bookish. It is the most distinctive of the three and the least "tech".
- Figures: the README states Ysabeau Office has **tabular lining figures by default** (verified: 1111 = 0000 = 82.7px without any feature switch). Hero at `font-weight: 800; letter-spacing: -0.015em`.
- Caveat: it reads light and small at 15px. Body must be `font-weight: 500` and probably `font-size` +1px. Test on the phone before committing.
- Coverage: cyrillic, cyrillic-ext, greek, latin, latin-ext, vietnamese. Variable wght 100-900.
- Licence/source: OFL 1.1. https://github.com/CatharsisFonts/Ysabeau · https://github.com/google/fonts (ofl/ysabeauoffice)
- Cost: one family, the lowest payload of the three.

### C. Geologica (one family, two voices via axes)
- Character: a friendly grotesque with a "Sharp" axis (SHRP 0-100) for crisp ink-trap terminals. Body at SHRP 0, figures at SHRP 100 / wght 650. It is the nearest to today's feel. Choose it only if A and B feel too different. The owner may find it "Onest again".
- Figures: has `tnum`; proportional by default (69.4 vs 108.7px), equal with tabular-nums (103.7px). Keep `font-variant-numeric: tabular-nums` on every amount.
- Coverage: cyrillic, cyrillic-ext, greek, latin, latin-ext, vietnamese. Axes: wght 100-900, SHRP 0-100, CRSV 0-1, slnt 0 to -12.
- Licence/source: OFL 1.1. https://github.com/googlefonts/geologica · https://github.com/google/fonts (ofl/geologica)

Type roles under any option:
- Figure face **only on amounts**: hero, big-number, list amounts, donut centre.
- Screen titles, month title and section titles move to the body face at 650-700.
- `font-variant-numeric: tabular-nums` stays on every amount (`.entry-amount`, `.home-recent-amount`, `.chart-legend-amount` already have it).
- Unverified: woff2 file sizes after subsetting. Measure them when self-hosting.

---

## 4. Animations (short list)

New tokens: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` (the current `--ease`), `--ease-in: cubic-bezier(0.4, 0, 1, 1)`, `--ease-sheet: cubic-bezier(0.32, 0.72, 0, 1)`. No bounce, no shake anywhere.

| # | What | Trigger | Property | Duration / easing | Reduced-motion fallback |
|---|---|---|---|---|---|
| 1 | Button press | `:active` | `transform: scale(0.97)` + background to `*-press` | 90ms in (`ease-out`), 160ms release | background change only, no scale |
| 2 | Progress bars fill | Month render, category list | `transform: scaleX(0 -> 1)`, `transform-origin: left` (the fill already has an inline `width: N%`, so scaling it keeps the value exact) | 480ms `--ease-out`, stagger 30ms per row, max 6 rows | none, bars appear at final width |
| 3 | Hero "left to spend" update | after an expense is added and Home re-renders | number tween old -> new value (JS, requestAnimationFrame, `tabular-nums` prevents jitter) + hero background flash `--block` -> `#2A6A50` -> `--block` | 420ms `--ease-out`; flash 600ms | instant value; no flash |
| 4 | New row highlight | the entry just added appears in Recent / Month | `background-color: var(--block-soft) -> var(--surface)` | 900ms `ease-out` after a 150ms hold | keep it (colour, not motion), 400ms |
| 5 | Toast | show / hide | in: `opacity 0->1`, `translateY(8px -> 0)`; out: `opacity -> 0` (currently removed with no exit) | in 200ms `--ease-out`; out 150ms `--ease-in` | opacity only, 120ms |
| 6 | Bottom sheet (due-subscription overlay) | open / close | sheet `translateY(100% -> 0)`; scrim `opacity 0 -> 1` | sheet 320ms `--ease-sheet`; scrim 200ms linear; close 220ms `--ease-in` | sheet and scrim fade 150ms, no translate |
| 7 | Month switch (‹ ›) | arrow tap | content `translateX(±12px) + opacity 0 -> 1` in the tap direction | 200ms `--ease-out` | none |
| 8 | Inline confirm (Delete this entry?) | Delete tap | `grid-template-rows: 0fr -> 1fr` + opacity | 220ms `--ease-out` | instant |
| 9 | Tab change | tab tap | `#view` `opacity 0.6 -> 1` (no movement) | 140ms linear | none |

Don't animate: the donut (it is redrawn on data change, and animated arcs only delay reading the number), the over-budget state (state changes must not look playful), and anything on the Setup flow.

---

## 5. Generic or unfinished, ranked (most damaging first)

1. **[P1 bug] Savings and "track-only" progress bars are unstyled.** `style.css` lines 577-587: the selector line `.progress-fill.is-savings {` has been lost, leaving an orphan `background: var(--savings); }`. Under CSS parsing, the orphan text becomes part of the *next* rule's selector, so `.progress-fill.is-track-only` is dropped as well. Verified in the live app: both `is-savings` and `is-track-only` fills compute to `rgb(31, 92, 69)` (pine) in light and `rgb(134, 203, 168)` in dark. Fix: restore `.progress-fill.is-savings {` above line 581. The standing rule is to run a CSS parse/lint check over `style.css` in the test run, so a stray declaration fails the build instead of silently dropping the next rule. Which tool to use is not decided here.
2. **[P1 bug] The toast overlaps the tab bar.** The toast's `bottom` is `tabbar-height + 1rem` (76px), but the tab bar sits 1.6rem (26px) higher because of the rights strip. Measured: tab bar top at y=758, toast bottom at y=768, so 10px of overlap, visible in `c1-04-04-add-expense.png`. Fix: add `+ 1.6rem` to the toast's `bottom`, exactly as `.update-bar` already does.
3. **The tab bar floats on a permanent copyright strip.** Text-only tabs, a 5px dot as the only active cue, and "© Ļevs Krilovs · All rights reserved · Share only with permission" on every screen, below the thumb zone. It reads unfinished and spends 26px of the most valuable area. Proposal: anchor the tab bar to the bottom edge (safe-area padded) and move the notice to Settings › Rights and the About text. Give the active tab a pine-wash pill (`#DCE7DF`, pine text 6.18:1) instead of the dot. *Owner question: is there a legal reason the notice must be on every screen?*
4. **Edit/Delete on every Month row.** Ten controls for five entries, with red "Delete" as the loudest repeated word on the screen. Make the whole row tappable to open the edit form, put Delete inside the edit form as a `btn-inline is-danger`, and keep the existing inline confirm. Optionally add swipe-left later.
5. **Duplicate titles.** Header "Settings" plus h2 "Settings". Header "Home" plus "Tess's October". Header "Month" plus "October 2026". Drop the sticky header text on the four tab roots, since the tab bar already says where you are. Keep it only on pushed screens (Add expense, Import).
6. **The chart paints the over-budget category in a friendly brand green.** "Necessary expenses" is €309 over, yet it is the big calm green ring (`cat-1 #2d8a5f`, 1.84:1 from pine, so it reads as "the app's colour = fine"). Add the danger signal in the legend: an "over by €309.07" pill (reuse `.pill-danger`) and a 3px `--danger` tick on that segment's outer edge. Zero-amount legend rows are disabled at `opacity: 0.55`, so their text drops to about 2.8:1. Show them at full colour under a "No spending yet" subheading instead.
7. **The backup alert is red with a green button.** It uses the error colour for a caution and puts the safe action in pine inside a red box. Switch it to the amber `--warn-*` tokens (section 2, item 3), keep the pine primary, and make "Later" a `btn-inline`.
8. **Secondary buttons vanish** (1.08:1). Fixed by section 1.
9. **Orphan lines on the sage ground.** "No spending recorded in September 2026" floats between cards, and "Search" sits alone, right-aligned, outside any card (`c3-14`). Move comparison text inside the Month summary card as its last line, and put Search as a `btn-inline` in the Entries card header.
10. **Dark-mode hierarchy is inverted.** The mint primary button is brighter than the pine hero. Fixed by section 2, item 2 (`--block` #24604A).
11. **Settings opens with a wall of 9 jump chips** (Plan, Income, Subscriptions, Categories, Goals, Import, Rules, Backup, Rights). Group them into 3 rows with labels (Money: Plan, Income, Subscriptions · Organise: Categories, Goals, Rules · Data: Import, Backup, Rights) or a plain grouped list. That is 4 or fewer choices per group.
12. **The select chevron is drawn with two CSS gradients** and the date field is the raw native control. They are fine functionally, but the chevron is the one place that looks hand-rolled. Replace it with an inline SVG chevron in `--muted`.

---

## 6. Persona red flags
- **Casey (one-handed, interrupted):** after "Add expense" the toast hides under/over the tab bar (item 2). The primary action on Month (edit an entry) needs two precise taps on 44px words in the middle of the screen.
- **Sam (VoiceOver, low vision):** the focus ring is invisible on pine surfaces (1.00:1). Disabled legend rows drop to about 2.8:1. Each Month row announces "Edit, button, Delete, button" five times.
- **Owner on day 30:** the hero turns `danger-soft` with red ink when over budget, and the backup card is also red, so two red blocks stack on Home. Only the first should be red.

## 7. Questions for the owner
1. Must the copyright line stay on every screen (legal), or can it live in Settings › Rights?
2. Button variant: A (tinted, keeps "no borders") or C (tactile keys, bends that rule)?
3. Font: A (Golos + Martian Mono ledger figures), B (Ysabeau Office, warmer), or C (Geologica, closest to today)? Look at `shots/imp-19-font-specimen-tuned.png`.

Evidence files (scratchpad): `design/shots/imp-01..17` (light/dark screens, focus, errors, edit, delete-confirm), `imp-18`/`imp-19` (font specimens), `design/contrast.js`, `tools/imp-01..04.mjs`.
