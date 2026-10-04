# My Expenses - frontend design proposals (proposal only, repository not edited)

Using frontend-design. Inputs read: DESIGN.md, style.css (tokens lines 75-165, buttons 846-912, toast 916-960, tab bar 278-328, forms 777-840, home hero ~1240), 5 supplied screenshots, plus my own Playwright runs against http://127.0.0.1:8123/ (390x844, light and dark). My scratch evidence is in `...\scratchpad\design\shots\`:
- `fe-buttons-light.png`, `fe-buttons-dark.png` - the three button variants below, rendered with the proposed tokens (states forced with classes).
- `fe-fonts-pairings.png` - baseline vs three font pairings on a real hero + two list rows (Latvian, Cyrillic, EUR figures).
- `fe-light-03/04-*.png`, `fe-dark-01-after-setup.png` - add form errors, focus ring, dark home.
Contrast ratios are computed by script (WCAG 2.x relative luminance), not estimated.

## 0. What the current UI gets wrong (observed, not assumed)

1. Secondary buttons are nearly invisible as buttons. `.btn` = `--surface-2` (#E6ECE3) on a card of `--surface` (#F4F7F1) is 1.11:1; on the sage ground 1.08:1. "Add income", "Later", "Cancel" read as captions. In dark, `--surface-2` #212C26 on `--surface` #18211C is 1.14:1 (same defect; see "Cancel" in the dark delete-confirm shot).
2. Inline Edit / Delete (`.btn-ghost`, `.btn-ghost-danger`) are bare coloured words with no affordance, repeated 5x per list (Month screen).
3. There is no `:disabled` rule on `.btn` at all, no pressed-state beyond `scale(.98)`, and all `:hover` colour changes apply on iPhone too (iOS sticks :hover after a tap).
4. Dark primary (`--accent` #86CBA8 fill) is the brightest object on the screen, brighter than the hero block it sits under. It competes with the number that is supposed to be the one loud thing.
5. Dark hero block `--block` #1F4E3C is only 1.93:1 against `--bg`, so the "one solid block" identity weakens in dark.
6. `--danger-line` (#D9A39C light, #7A413B dark) is 1.77:1 / 1.84:1 against `--danger-soft`: the confirm-box outline almost disappears.
7. Donut: `--cat-1` (#2d8a5f) and `--cat-4` (#1baf7a) are both mid-greens; in the chart screenshot the Necessary slice and the Savings swatch read as the same colour.
8. Unbounded is very wide: "Tess's October", the month title and "Chart/Settings" titles all shout, and the hero figure needs `.is-long` shrinking for 4-digit amounts.

DESIGN.md says "no borders or shadows on surfaces". Variant A below puts a hard under-edge on controls (not surfaces). I flag it as a conscious exception; variant C keeps the rule literally.

---

## 1. Buttons (current colours: pine #1F5C45 on sage)

Shared decisions (all variants):
- Primary and other full-width action buttons grow from 44px to 52px tall (thumb reach, one-handed use). Compact/inline stay 44px (`--tap`), matching the existing token.
- Hover only where hover exists: wrap every `:hover` in `@media (hover: hover)`. On iPhone the press state is `:active`.
- Add `-webkit-tap-highlight-color: transparent; touch-action: manipulation;` to `.btn` (removes the grey iOS flash and the 300ms double-tap-zoom wait).
- Focus ring (keep the existing global `:focus-visible`, change offset): `outline: 3px solid var(--accent); outline-offset: 3px;`. Ring vs ground: pine on sage 6.05:1, mint on dark bg 9.72:1. Offset 3px keeps the ring from touching the fill (a mint ring on a mint dark fill would be 1.41:1 if flush).
- Disabled never relies on opacity (opacity .55 on `.chart-legend-button:disabled` drops text below 4.5). Use real colours: light fill #D9E1D6 + ink #4F5D55 = 5.18:1; dark fill #2A352F + ink #A1AFA6 = 5.58:1. Prefer `aria-disabled="true"` plus showing the validation error (current form already does that, keep it) over disabling submit.

### New / changed tokens used by the variants

```css
:root {
  --field-line:     #6A7A70;  /* was #7A887F */
  --line-strong:    #52705F;  /* NEW: outline of secondary buttons */
  --danger-line:    #A8625A;  /* was #D9A39C */

  --btn-fill:       #1F5C45;  --btn-hover:  #1A5039;  --btn-press:  #174A37;
  --btn-ink:        #FFFFFF;  --btn-ledge:  #123D2D;
  --btn-sec-press-bg:#CFE3D8; --btn-sec-press-ink:#15201A;
  --btn-dis-bg:     #D9E1D6;  --btn-dis-ink:#4F5D55;
  --btn-danger:     #A3302A;  --btn-danger-hover:#8F2620;  --btn-danger-press:#7C1F1A;
  --btn-danger-ink: #FFFFFF;  --btn-danger-ledge:#5E1713;
}
@media (prefers-color-scheme: dark) {
  :root {
    --field-line:   #75847B;  /* unchanged */
    --line-strong:  #6F8678;
    --danger-line:  #A8625A;

    --btn-fill:     #5FAE87;  --btn-hover:  #6FB791;  --btn-press:  #4A9772;
    --btn-ink:      #07130D;  --btn-ledge:  #3F8B6B;
    --btn-sec-press-bg:#2F3F36; --btn-sec-press-ink:#E3EBE5;
    --btn-dis-bg:   #2A352F;  --btn-dis-ink:#A1AFA6;
    --btn-danger:   #E0766E;  --btn-danger-hover:#E98A83;  --btn-danger-press:#D06259;
    --btn-danger-ink:#1A0907; --btn-danger-ledge:#A8534B;
  }
}
```
`--accent` stays as the text/link/focus colour in both themes. Only fills move to `--btn-fill`, which is why dark primary stops being the brightest mint on screen.

Shared base (replaces `.btn` base; all variants):
```css
.btn {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  gap: var(--s2); min-height: 52px; padding: 0 var(--s5);
  font: inherit; font-weight: 600; line-height: 1.2; color: var(--text);
  background: transparent; border: 0; border-radius: 16px; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.btn:disabled, .btn[aria-disabled='true'] {
  background: var(--btn-dis-bg); color: var(--btn-dis-ink);
  box-shadow: none; transform: none; cursor: not-allowed;
}
```

### Variant A - "Slab" (RECOMMENDED): tactile, pressable, secondary gets an outline

Reason: fixes the invisible secondary button with a 4.2-5.1:1 outline and gives the app one physical gesture (press-in) that confirms every tap on a phone.
```css
.btn-primary            { color: var(--btn-ink); background: var(--btn-fill); box-shadow: 0 3px 0 var(--btn-ledge); }
.btn-primary:active     { background: var(--btn-press); box-shadow: 0 1px 0 var(--btn-ledge); transform: translateY(2px); }
@media (hover: hover) { .btn-primary:hover { background: var(--btn-hover); } }

.btn-secondary          { color: var(--text); box-shadow: inset 0 0 0 1.5px var(--line-strong); }
.btn-secondary:active   { background: var(--btn-sec-press-bg); color: var(--btn-sec-press-ink); transform: translateY(1px); }
@media (hover: hover) { .btn-secondary:hover { background: var(--surface-2); } }

.btn-danger             { color: var(--btn-danger-ink); background: var(--btn-danger); box-shadow: 0 3px 0 var(--btn-danger-ledge); }
.btn-danger:active      { background: var(--btn-danger-press); box-shadow: 0 1px 0 var(--btn-danger-ledge); transform: translateY(2px); }
@media (hover: hover) { .btn-danger:hover { background: var(--btn-danger-hover); } }

/* inline (Edit / Delete in lists): chips, visible as buttons, 44px tall */
.btn-inline             { min-height: 44px; padding: 0 14px; border-radius: 12px; font-weight: 600;
                          color: var(--accent); background: var(--surface-2); }
.btn-inline.is-danger   { color: var(--danger); background: var(--danger-soft); }
.btn-inline:active      { background: var(--btn-sec-press-bg); color: var(--btn-sec-press-ink); }
.btn-inline.is-danger:active { background: var(--danger-line); color: var(--btn-danger-ink); }
```
Use `.btn-danger` (solid) only inside the confirm-box ("Delete this income?"). A first-level Delete is `.btn-inline.is-danger`. Disabled A secondary: `box-shadow: inset 0 0 0 1.5px var(--border)`.

Computed (light / dark):
| Pair | Light | Dark |
|---|---|---|
| Primary ink on fill | #FFFFFF on #1F5C45 7.85 | #07130D on #5FAE87 7.12 |
| Primary ink on hover | on #1A5039 9.33 | #07130D on #6FB791 7.99 |
| Primary ink on pressed | on #174A37 10.14 | #07130D on #4A9772 5.38 |
| Primary fill vs ground (non-text) | #1F5C45 on #DDE4DA 6.05 | #5FAE87 on #0F1612 6.90 |
| Secondary outline vs card / ground | #52705F on #F4F7F1 5.06 / on #DDE4DA 4.21 | #6F8678 on #18211C 4.21 / on #0F1612 4.68 |
| Secondary label | #15201A on #F4F7F1 15.49 | #E3EBE5 on #18211C 13.57 |
| Secondary pressed label | #15201A on #CFE3D8 12.47 | #E3EBE5 on #2F3F36 9.17 |
| Danger ink on fill | #FFFFFF on #A3302A 6.97 | #1A0907 on #E0766E 6.43 |
| Danger hover / pressed | #FFFFFF on #8F2620 8.52 / on #7C1F1A 10.16 | #1A0907 on #E98A83 7.76 / on #D06259 5.13 |
| Inline label (accent on --surface-2) | #1F5C45 on #E6ECE3 6.53 | #86CBA8 on #26332C 6.98 |
| Inline danger on --danger-soft | #A3302A on #F6E4E1 5.68 | #F0918A on #3A2321 6.32 |
| Disabled | #4F5D55 on #D9E1D6 5.18 | #A1AFA6 on #2A352F 5.58 |
| Focus ring vs ground | #1F5C45 on #DDE4DA 6.05 | #86CBA8 on #0F1612 9.72 |

### Variant B - "Outline and ink": minimal change from today, flat, no shadow

Reason: closest to the current look and to DESIGN.md's "no shadows"; only the secondary and inline buttons change.
```css
.btn { min-height: 50px; border-radius: 12px; }
.btn-primary          { color: var(--btn-ink); background: var(--btn-fill); }
.btn-primary:active   { background: var(--btn-press); transform: scale(0.98); }
.btn-secondary        { color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); }   /* pine outline, 6.05 / 9.72 vs ground */
.btn-secondary:active { background: var(--btn-sec-press-bg); color: var(--btn-sec-press-ink); transform: scale(0.98); }
.btn-danger           { color: var(--danger); box-shadow: inset 0 0 0 2px var(--danger); }   /* outlined by default */
.btn-danger.is-solid  { color: var(--btn-danger-ink); background: var(--btn-danger); box-shadow: none; } /* confirm step only */
.btn-inline           { min-height: 44px; padding: 0 8px; color: var(--accent); text-decoration: underline;
                        text-decoration-thickness: 1.5px; text-underline-offset: 5px; }
.btn-inline.is-danger { color: var(--danger); }
```
Pros: text-link semantics for Edit/Delete, zero new visual vocabulary. Cons: a screen with three outlined buttons feels busier than A; underlines in a dense list repeat 5x.

### Variant C - "Colour tints": the literal Direction C (no borders, no shadows)

Reason: keeps "elevation from tint" strictly; secondary is a tinted block like the hero, danger is a soft red block.
```css
.btn { border-radius: 18px; }
.btn-primary          { color: var(--btn-ink); background: var(--btn-fill); }
.btn-secondary        { color: #174A37; background: var(--block-soft); }            /* light 7.55; dark: bg #26332C, color var(--accent) 6.98 */
.btn-secondary:active { background: #B9D3C4; transform: scale(0.98); }
.btn-danger           { color: var(--danger); background: var(--danger-soft); }     /* 5.68 light / 6.32 dark */
.btn-inline           { min-height: 44px; padding: 0 12px; color: var(--accent); border-radius: 0; box-shadow: inset 0 -2px 0 currentColor; }
```
Honest weakness: the secondary tint boundary is 1.04-1.24:1 against its background. Its label is 7.55:1, so WCAG 1.4.11 is arguably met (the text identifies the control), but it is the same affordance weakness as today with a stronger tone. Choose C only if the owner values the no-outline look over scannability.

Recommendation: A for primary/secondary/destructive, with the inline chips from A. B is the fallback if the owner dislikes the ledge.

---

## 2. Palette: small tweaks (sage/pine identity untouched)

Unchanged: `--bg` #DDE4DA, `--surface` #F4F7F1, `--text` #15201A, `--muted` #44524A, `--accent` #1F5C45, `--block` #1F5C45 (light); dark `--bg` #0F1612, `--surface` #18211C, `--accent` #86CBA8, `--text` #E3EBE5, `--muted` #A1AFA6. They already pass: text on bg 12.91 light / 15.1 dark, muted on surface 7.61 / 7.22, accent on surface 7.26 / 8.74.

| Token | Light old -> new | Dark old -> new | What it fixes | Contrast (new) |
|---|---|---|---|---|
| `--field-line` | #7A887F -> #6A7A70 | #75847B (keep) | Input outline was 2.86:1 on the sage ground (fails 3:1 where a field sits on `--bg`, e.g. setup screen) | #6A7A70: 4.19 on surface, 3.50 on bg, 3.77 on surface-2 |
| `--line-strong` (new) | #52705F | #6F8678 | Outline for secondary buttons / selected states | 5.06 on surface, 4.21 on bg; dark 4.21 on surface, 4.68 on bg |
| `--surface-2` | #E6ECE3 (keep) | #212C26 -> #26332C | Dark pills/inline chips were 1.14:1 vs card; now 1.25:1 (fill only, outlines carry the boundary) | muted on it 5.78, text 10.85, accent 6.98 |
| `--block` | #1F5C45 (keep) | #1F4E3C -> #245C46 | Dark hero block was 1.93:1 vs ground, now 2.36:1 and reads as "the" block | block-ink #F2F7F4 7.20; block-soft #BCD8C9 5.12 |
| `--danger-line` | #D9A39C -> #A8625A | #7A413B -> #A8625A | Confirm-box outline 1.77/1.84:1 -> 3.75 (light on soft) / 3.16 (dark on soft), 3.58 (dark on surface) | non-text >= 3:1 |
| `--btn-fill` etc. | see tokens | see tokens | Dark primary no longer the brightest object; pressed/hover states defined | table in section 1 |
| `--cat-4` (optional) | #1BAF7A -> #14808F | #199E70 -> #2BA3B4 | Two near-identical greens in the donut (cat-1 vs cat-4) | light 4.30 on surface; dark 5.50 on surface |

Caveat on `--cat-4`: I did not re-run the colour-blind separation validator (the project comment says the set was validated for colour-blind separation). Teal sits close to `--cat-2` blue for deuteranopia. Treat as optional: re-run the validator before adopting. Remaining cat colours below 3:1 against the card (cat-3 2.96, cat-4 old 2.60, cat-7 2.49, cat-8 2.00) are acceptable only because the legend repeats every value as text; keep slice gaps (the white 2px gaps in the donut) and do not use these colours for text.

Not changed on purpose: `--track` (1.43:1 vs card) is a decorative bar track; the "of EUR x" text carries the information.

---

## 3. Fonts

Constraints verified by script on the Google Fonts builds of each family: every Latvian glyph ā č ē ģ ī ķ ļ ņ š ū ž (upper and lower) and the full Russian alphabet are present, EUR sign U+20AC and minus U+2212 present, `tnum` OpenType feature present (except where noted). All are SIL OFL 1.1 (copyright lines read from github.com/google/fonts `ofl/<family>/OFL.txt`; Fontsource API reports OFL-1.1). OFL allows commercial use and embedding; keep the OFL.txt next to the files (the repo already does this for Onest and Unbounded in `fonts/`). Self-host from npm `@fontsource-variable/<name>` v5.3.0 (same file naming as the current `fonts/*-wght-normal.woff2`; subsets latin, latin-ext, cyrillic, cyrillic-ext), so the existing `@font-face` + `unicode-range` blocks only need the family name and file names swapped.

I rendered each pairing against the real hero and two list rows (`shots/fe-fonts-pairings.png`).

### Pairing P1 (RECOMMENDED): Golos Text (body) + Literata (figures)
- Golos Text, ParaType / Google Fonts, OFL. Source https://github.com/googlefonts/golos-text ; licence https://github.com/google/fonts/blob/main/ofl/golostext/OFL.txt ; npm `@fontsource-variable/golos-text` (wght 400-900; woff2 total about 97 KB for 4 subsets). Reason: Cyrillic-first UI face with a sturdy, slightly warm grotesque feel; x-height 530 equals Onest (527), so no size rework; default digits lining, `tnum` available.
- Literata, Google Play Books / TypeTogether, OFL. Source https://github.com/googlefonts/literata ; licence https://github.com/google/fonts/blob/main/ofl/literata/OFL.txt ; npm `@fontsource-variable/literata` (wght 200-900; 4 wght subsets about 133 KB; optional `opsz` files about 283 KB). Reason: a bookish serif for money figures turns "left to spend" into a ledger entry, the strongest contrast to the rejected wide-geometric Unbounded and the least fintech-generic option; default digits lining, `tnum` present, euro and minus glyphs are well-drawn.
- Combined weight about 230 KB vs about 291 KB today for Onest + Unbounded (current files 89 KB + 202 KB). Update the precache list in `sw.js` accordingly.
```css
--font-body:   'Golos Text', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-figure: 'Literata', Georgia, 'Times New Roman', serif;
.big-number, .home-figure-value { font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: lining-nums tabular-nums; }
.home-figure-value { font-size: clamp(2.5rem, 2rem + 2.4vw, 3.25rem); }   /* Literata is narrower than Unbounded; the .is-long shrink rarely fires */
#screen-title, .home-title, .month-title { font-weight: 600; letter-spacing: 0; }
```

### Pairing P2: Ysabeau Office, one family for text and figures
- Ysabeau Office, Christian Thalmann (Catharsis Fonts), OFL. Source https://github.com/CatharsisFonts/Ysabeau ; licence https://github.com/google/fonts/blob/main/ofl/ysabeauoffice/OFL.txt ; npm `@fontsource-variable/ysabeau-office` (wght 1-1000; about 120 KB for 4 subsets). Reason: humanist, Garamond-flavoured sans: the warmest and most distinctive option, fits sage/pine; digits are tabular by default (all ten digit advances are equal at 517), no feature flag needed.
- Cost: small x-height (418 vs 527), so set body to `font-size: 1.08em` or `font-size-adjust: 0.5`, and use weight 450-500 for body, 650 for figures. Risk: lower legibility than P1 at the 13px labels.
```css
--font-body: 'Ysabeau Office', system-ui, sans-serif;  --font-figure: 'Ysabeau Office', system-ui, sans-serif;
body { font-size-adjust: 0.5; }
```

### Pairing P3: Sofia Sans (body) + Sofia Sans Semi Condensed (figures)
- Sofia Sans family, Lettersoup (Sofia, Bulgaria), OFL. Source https://github.com/lettersoup/Sofia-Sans ; licences https://github.com/google/fonts/blob/main/ofl/sofiasans/OFL.txt and https://github.com/google/fonts/blob/main/ofl/sofiasanssemicondensed/OFL.txt ; npm `@fontsource-variable/sofia-sans` and `@fontsource-variable/sofia-sans-semi-condensed` (wght 1-1000; `tnum` present, lining by default). Reason: designed with Cyrillic in mind, compact and calm; the semi-condensed cut makes 6-digit EUR amounts fit on a 390px phone at hero size.
- Cost: x-height 490 and a quirky single-storey g. Looks closest to a generic "tech sans" of the three in my render, so it is the least distinctive. Choose it only if the owner wants no serif.

Rejected after checking: Schibsted Grotesk, Rethink Sans, Spline Sans, Red Hat Display, Hanken Grotesk, Instrument Sans, Mona/Hubot Sans, Reddit Sans (no Cyrillic in the Google Fonts build); Alice and Philosopher (no Latvian ģ/ķ/ļ/ņ); Commissioner, IBM Plex Sans, Wix Madefor (no `tnum` in the served build); Inter/Arial/Roboto (defaults, per brief).

---

## 4. Animation: one moment, four quiet supports

Principle: motion only where a person acts or the money state changes. No entrance fades on cards, no per-card hover effects.

### The one deliberate moment: "Spend lands" (Home hero, after saving an expense or income)
- What: the hero number rolls from the old value to the new one and a 4px strip along the bottom edge of the pine block (spent share of budget) grows to its new length. Shows exactly what changed: what is left.
- Trigger: return to Home after a successful add/edit/delete (and app open if the value differs from the last-shown value stored in memory; do not replay on every tab switch).
- Properties: number via `requestAnimationFrame` interpolating cents, formatted with the existing money formatter (tabular figures stop the width jittering); strip via `transform: scaleX()` with `transform-origin: left` (compositor only, no layout).
- Duration: 600ms number, 600ms strip, same start; easing `var(--ease)` = `cubic-bezier(0.22, 1, 0.36, 1)` (already defined).
- Reduced motion: (`prefers-reduced-motion: reduce`) set the final value and strip width immediately; no tween.
- Mark the new number for assistive tech once, after the tween, via the existing live region; do not announce every frame.

### Supporting motions (all answer an action)
| What | Trigger | Property | Duration / easing | Reduced-motion fallback |
|---|---|---|---|---|
| Button press-in (variant A) | `:active` on `.btn-primary/-danger`; secondary/inline lighter | `transform: translateY(2px)` + `box-shadow` ledge 3px -> 1px; release 160ms | down 90ms `ease-out`, up 160ms `var(--ease)` | no transform, background colour change only (instant) |
| Toast in / out | after save/delete (existing toast) | enter: `opacity 0->1` + `translateY(8px->0)`; exit: `opacity 1->0` + `translateY(0->4px)` | enter 240ms `var(--ease)` (exists); exit 160ms `ease-in` | opacity-only fade, 120ms (current rule removes the animation entirely, so the toast pops in; a short fade is allowed and gentler) |
| Row removal | Delete confirmed in Month list | `grid-template-rows: 1fr -> 0fr` (or `max-height`) + `opacity` on the row, then remove the node | 200ms `var(--ease)`, then toast with Undo | remove instantly, toast still appears |
| Tab dot | tab change | one shared dot element, `transform: translateX()` between tabs (replaces per-tab `::before`) | 240ms `var(--ease)` | jump with no transition |

Explicitly not recommended: page-load staggered card reveals, hover lift on cards (no hover on iPhone), animated donut draw on every visit, confetti/celebration on adding an expense, skeleton shimmer (all data is local and instant).

---

## Rollout order (smallest first)
1. Tokens in section 1 and 2 + `@media (hover: hover)` wrapping + `:disabled` rule (no visual risk, fixes defects 1, 3, 5, 6).
2. Variant A button CSS and `.btn-inline` markup change in `src/views` (class names `btn-ghost`/`btn-ghost-danger` -> `btn-inline`, `btn-inline is-danger`); the app uses `btn-` classes in several views, so search all of `src/views`.
3. Fonts: swap `@font-face` blocks and two `--font-*` tokens; check `.home-figure-value.is-long` and `.month-navigator .month-title` clamps, and update `sw.js` precache and `fonts/LICENSE-*.txt`.
4. "Spend lands" animation last (needs JS in the Home view).

Nothing here was applied to the repository.
