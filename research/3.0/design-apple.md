# My Expenses: Apple-style design review (proposals only, no repo edits)

Reviewer lens: apple-design skill (WWDC fluid-interfaces, materials, typography, principles) plus the animate skill's motion rules.
Inputs read: DESIGN.md, style.css (tokens, `.btn*`, `.card`, `.tabbar/.tab`, `.toast`, `.field`, confirm box, reduced-motion rules), src/app.js (`render()`, `toast()`), sw.js font list, 5 supplied PNGs, plus my own Playwright run at 390x844 (light and dark, 2x DPR) in `scratchpad/design/shots/apple-*.png`.
All contrast ratios below are WCAG 2.x relative-luminance ratios computed by script (scratchpad/cr.py). "Estimate" or "from memory" marks anything I did not measure or verify.

## 0. What I observed in the live app (drives the proposals)

1. Press feedback is weak and slow. `.btn:active` is `scale(.98)` on a 240ms transition. Measured on mouse-down: transform `matrix(0.98...)`, background equal to the hover colour. So press looks identical to hover, and 2% scale on a 48px button is about 1px. Apple's feedback is instant (response) and clearly visible.
2. `.btn:hover` is not gated. On iOS Safari `:hover` sticks after a tap (known WebKit behaviour, from memory), so a tapped button stays in its hover colour until the next tap elsewhere.
3. The secondary button ("Add income", "Review categories", "+") uses `--surface-2` #E6ECE3. Contrast against the sage page is 1.08:1 and against a card 1.11:1. In the light screenshots it reads as an empty slot, not a button. The label carries it, but the affordance is weak.
4. Dark mode primary is flat mint #86CBA8. It is the loudest object on screen, louder than the hero number block, and it clashes inside the red-brown backup warning card (see apple-07-home-money-dark.png).
5. Dark card separation is nearly nil: surface/bg 1.11:1, surface-2/surface 1.14:1. The hero block (#1F4E3C) is only 1.74:1 from the surface, so it reads as dark grey-green, not "the pine block".
6. Motion today: buttons and tabs have colour/transform transitions only; `render()` does `viewElement.replaceChildren()` on every state change, so there is no tab, month or list transition at all (measured: 2 running animations after a tab tap, both button colour). The toast uses a keyframe in, and `node.remove()` out, with no exit animation. A second toast reuses the node, so the enter animation does not replay.
7. The bottom stack is about 86px of 844 (measured from the screenshot: tab bar 60 + the fixed copyright strip), flat opaque `--surface`. Apple uses a translucent 49pt bar. Content visibly cuts off against it (see add-form shot, submit button half hidden).
8. Fonts: Unbounded is a wide display face used for the title, hero figure and chart total. It is the main reason the app does not feel like iOS. Onest body is fine but generic.

## 1. Buttons (current pine #1F5C45 on sage, no colour change)

Principles applied: respond on pointer-down (not on release), one prominent action per screen, tinted secondary instead of a nearly invisible grey slot, destructive = red text or tint by default and a red fill only on the confirm step, hover gated to real pointers, 44px minimum hit area always.

### 1.1 New tokens (add to `:root`; dark values in the dark block)

```css
/* light */
--btn-bg: #1F5C45;            /* = --accent, white label 7.85:1 */
--btn-bg-hover: #174A37;      /* white 10.14:1 */
--btn-bg-pressed: #123A2B;    /* white 12.61:1 */
--btn-ink: #FFFFFF;
--tint: rgba(31, 92, 69, 0.12);          /* secondary fill */
--tint-pressed: rgba(31, 92, 69, 0.18);
--danger-tint: rgba(163, 48, 42, 0.10);  /* destructive tinted fill, use on cards only */
--danger-tint-pressed: rgba(163, 48, 42, 0.18);
--danger-pressed: #8A2722;    /* white 8.77:1 */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--btn-h-lg: 52px; --btn-h: 48px; --btn-h-sm: 36px;   /* visual heights */

/* dark (inside the existing prefers-color-scheme: dark block) */
--btn-bg: #2E7D5F;            /* white label 4.98:1; 3.31:1 vs surface #18211C */
--btn-bg-hover: #2A7556;      /* white 5.56:1 */
--btn-bg-pressed: #256A4E;    /* white 6.46:1 */
--btn-ink: #FFFFFF;
--tint: rgba(134, 203, 168, 0.16);       /* label --accent #86CBA8 on it: 6.06:1 on surface, 7.44:1 on bg */
--tint-pressed: rgba(134, 203, 168, 0.24);
--danger-tint: rgba(240, 145, 138, 0.16);/* label #F0918A on it: 5.26:1 */
--danger-tint-pressed: rgba(240, 145, 138, 0.24);
--danger-fill: #C4443E;       /* white 4.95:1; 3.33:1 vs surface */
--danger-pressed: #A93A35;    /* not measured, transient state, white estimate about 6:1 */
```

Why a separate `--btn-bg` instead of reusing `--accent`: in dark mode `--accent` (#86CBA8) is the text/link/focus/dot colour and must stay light; the button needs a fill that reads as pine, not mint. In light mode the two are equal, so there is no visible change.
Light secondary label is `--accent` #1F5C45 on the tint: 5.10:1 on the sage page, 6.02:1 on a card (computed with the tint blended over each). Pressed tint on the page: 4.67:1.

### 1.2 Shared base (all variants)

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: var(--btn-h);                 /* 48px */
  padding: 0 20px;                          /* vertical comes from height, not padding */
  font: inherit; font-size: 1.0625rem;      /* 17px, iOS body */
  font-weight: 600; line-height: 1.2;
  border: 0; border-radius: 14px;           /* same as fields (--radius-sm): one corner language */
  color: var(--btn-ink); background: var(--btn-bg);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent; /* kill the grey iOS flash */
  touch-action: manipulation;               /* no double-tap-zoom delay */
  user-select: none; -webkit-touch-callout: none;
  transition: transform 160ms var(--ease-out), background-color 160ms var(--ease-out), opacity 160ms var(--ease-out);
}
.btn:active {                               /* instant response on pointer-down */
  transform: scale(0.97);
  background: var(--btn-bg-pressed);
  transition-duration: 40ms;                /* in: 40ms, out: 160ms (base rule) */
}
@media (hover: hover) and (pointer: fine) { .btn:hover { background: var(--btn-bg-hover); } }
.btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }  /* pine 6.05:1 on sage, mint 8.74:1 on dark surface */
.btn:disabled, .btn[aria-disabled='true'] {
  opacity: 0.4; cursor: not-allowed; transform: none; pointer-events: none;     /* inactive controls are exempt from WCAG contrast */
}
@media (prefers-reduced-motion: reduce) {
  .btn, .btn:active { transition: background-color 120ms linear; transform: none; }  /* colour feedback stays */
}
```

Reason for 0.97 and 40ms/160ms: the animate skill puts press feedback at 100-160ms and apple-design wants highlight on touch-down; 0.97 on a 48px button is about 1.5px, visible but not toy-like. Verify on device: if `:active` does not fire in the installed PWA, add one passive `touchstart` listener on `document` (known historic iOS quirk, from memory).

### 1.3 Variant set A (recommended): filled / tinted / destructive / small

| Variant | Class | Height | Radius | Padding | Weight/size | Rest | Pressed | Hover (pointer only) | Disabled |
|---|---|---|---|---|---|---|---|---|---|
| Primary | `.btn-primary` | 52px on Home and the main form submit, else 48px | 14px | 0 20px | 600 / 17px | bg `--btn-bg`, label white, no border | bg `--btn-bg-pressed`, scale .97 | `--btn-bg-hover` | opacity .4 |
| Secondary | `.btn-secondary` (replaces plain `.btn`) | 48px | 14px | 0 20px | 600 / 17px | bg `--tint`, label `--accent` | bg `--tint-pressed`, scale .97 | `--tint-pressed` | opacity .4 |
| Destructive | `.btn-danger` (confirm step only) | 48px | 14px | 0 20px | 600 / 17px | light bg #A3302A white label 6.97:1; dark bg `--danger-fill` | `--danger-pressed` | same as pressed | opacity .4 |
| Small / inline | `.btn-sm` (with `.btn-plain` or `.btn-secondary`) | 36px visual, 44px hit | 10px | 0 14px | 600 / 15px | plain: transparent bg, label `--accent`; destructive-plain: label `--danger` | bg `--tint-pressed` (danger: `--danger-tint-pressed`) | `--tint` | opacity .4 |

```css
.btn-primary   { background: var(--btn-bg); color: var(--btn-ink); }
.btn-lg        { min-height: var(--btn-h-lg); }                       /* Home actions, main submit */
.btn-secondary { background: var(--tint); color: var(--accent); }
.btn-secondary:active { background: var(--tint-pressed); }
.btn-danger    { background: var(--danger); color: #fff; }            /* dark: background: var(--danger-fill) */
.btn-danger:active { background: var(--danger-pressed); }
.btn-sm        { min-height: var(--btn-h-sm); padding: 0 14px; font-size: 0.9375rem; border-radius: 10px; position: relative; }
.btn-sm::after { content: ''; position: absolute; inset: -4px -2px; }  /* hit area 44px tall without changing layout */
.btn-plain     { background: transparent; color: var(--accent); }
.btn-plain:active { background: var(--tint-pressed); }
.btn-plain-danger { background: transparent; color: var(--danger); }
.btn-plain-danger:active { background: var(--danger-tint-pressed); }
.confirm-box .btn-secondary { background: var(--surface); }           /* Cancel stays visible on the red-tinted box */
```

Usage rules (the important part, more than the CSS):
- One `.btn-primary` per screen state. Home already has "Add expense"; "Export backup" in the warning card and "Add EUR 1,000 to Savings" in the review card should be `.btn-secondary` unless they are the only action on screen.
- "Delete" in the entries list (`.btn-ghost-danger`) becomes `.btn-plain-danger .btn-sm`. The confirm step ("Delete this expense?") keeps the solid `.btn-danger`. The red fill appears only when the user has already asked to delete.
- The inline "+" add buttons (`.add-plus-btn`) become `.btn-secondary` squares, 48x48, radius 14px, label `--accent`, 22px/600.
- Month navigation arrows stay circular 44px but use `--tint` as the fill instead of `--surface`, so they are visible on the sage page.

### 1.4 Variant set B: capsule (iOS 26 look), deltas only

Same tokens and states as A. Change radius to `999px` for `.btn`, `.btn-sm`, `.month-nav-arrow`, segmented control pills and the toast. Heights stay 52/48/36. Cost: fields (14px) and cards (20px) stay rounded rectangles, so buttons and inputs no longer share a corner language. I do not recommend B unless the fields also move to a larger radius. Honest take: A is the safer fit for this app's "quiet blocks" direction.

### 1.5 Variant set C: text-forward, deltas only

Primary stays filled A. Every secondary action becomes `.btn-plain` (no fill, accent label, 44px hit area, pressed = `--tint-pressed` capsule). Fewer shapes on screen, most "Apple Mail". Risk: weakest affordance for the owner's one-handed, short-session use. Use C only for repeated list-row actions (Edit, Delete), which is where it is already used.

## 2. Palette (sage/pine identity unchanged)

Light: bg #DDE4DA, surface #F4F7F1, pine #1F5C45, text #15201A, muted #44524A, danger #A3302A all stay. Text contrast today is already high (text/bg 12.91, muted/bg 6.34, muted/surface 7.61, danger/surface 6.44, savings-ink/surface 5.48), so I propose no text-colour changes.

### 2.1 Light changes

| Token | Old | New | Ratio before -> after | What it fixes |
|---|---|---|---|---|
| `--field-line` | #7A887F | #6B7A70 | 2.86 -> 3.49 on sage; 3.43 -> 4.18 on surface | Input borders fail 3:1 (WCAG 1.4.11) wherever a field sits directly on the sage page; on a card it passed narrowly. More definition in sunlight. |
| `--cat-3` | #eb6834 | #D8541C | 2.96 -> 3.73 on surface | Orange donut segment/legend dot below 3:1. |
| `--cat-7` | #e87ba4 | #D04A7C | 2.49 -> 3.92 | Pink segment below 3:1. |
| new `--btn-*`, `--tint*`, `--danger-pressed`, `--danger-tint*` | n/a | see 1.1 | n/a | Button states (section 1). |
| `--surface-2` | #E6ECE3 | unchanged | 1.08 vs sage | Left as is; only the buttons that wrongly used it as a fill move to `--tint`. Pills and the backup card keep the intentional quiet tint. |
| `--track` | #C9D3C6 | unchanged | fill/track: pine 5.09, danger 4.52, savings 3.24 | The informative part is the fill; all pass 3:1. No change. |

Chart colours checked for colour-blind separation (Machado matrices, CIE76 minimum pairwise distance across all 8 categories): current light set min 6.1 (protan) / 11.8 (deutan) / 13.9 (tritan). After changing only cat-3 and cat-7: 6.2 / 7.9 / 14.6. I tried also darkening cat-4 and cat-8, which cut deutan to about 1.7-3.2, so I do NOT recommend that. Residual exception to state in DESIGN.md: cat-4 #1baf7a (2.60:1) and cat-8 #eda100 (2.00:1) remain below 3:1 on the light surface; every segment is paired with a legend label and amount, and segments are separated by a surface-coloured gap, so the information does not depend on the colour alone.

### 2.2 Dark changes

| Token | Old | New | Ratio before -> after | What it fixes |
|---|---|---|---|---|
| `--bg` | #0F1612 | #0B110E | text/bg 15.11 -> 15.70 | Deeper ground so cards lift on OLED. Also update `<meta name="theme-color">` (index.html line 9) and manifest dark background if any. |
| `--surface` | #18211C | #19231D | surface/bg 1.11 -> 1.18 | Card separation. Text on surface 13.57 -> 13.30. |
| `--surface-2` | #212C26 | #25312A | s2/surface 1.14 -> 1.19; muted on s2 6.33 -> 5.93 | Inset chips and inputs readable. |
| `--block` | #1F4E3C | #25604A | vs surface 1.74 -> 2.24; hero ink #F2F7F4 8.76 -> 6.80; `--block-soft` #BCD8C9 on it 4.84 | Hero block reads as pine, not grey-green. Small text on it still >= 4.5. |
| `--danger-soft` | #3A2321 | #331E1C | danger text on it 6.32 -> 6.79 | Less heavy brown slab behind the backup warning. |
| `--cat-4` | #199e70 | #27B5C4 | 4.84 -> 6.67 on surface; cat-1/cat-4 CVD distance 1.0 (protan, tritan) / 1.5 (deutan) before | Dark cat-1 and cat-4 are near-identical greens for colour-blind users. After the change the set minimum is 2.5 (protan, pair cat-2 blue / cat-5 lavender, an existing weakness). Optional follow-up: lighten dark cat-5. |
| new dark `--btn-*`, tints | n/a | see 1.1 | primary white 4.98:1 | Pine-lifted CTA instead of neon mint. |
| `--accent`, `--accent-ink`, text, muted, danger, field-line | unchanged | n/a | accent/surface 8.74, field-line/surface 4.20, field-line/bg 4.67 | Already pass. |

Mint option (if you prefer the current look): keep #86CBA8 with ink #0E1A14 (9.45:1). It passes; I recommend against it only for hierarchy reasons in section 0.4.

### 2.3 Material (not a hex change)

Tab bar and header as translucent layers instead of solid `--surface`/`--bg`:
```css
.tabbar { background: color-mix(in srgb, var(--surface) 82%, transparent);
          -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%);
          border-top: 0.5px solid color-mix(in srgb, var(--text) 12%, transparent); }
@media (prefers-reduced-transparency: reduce) { .tabbar { background: var(--surface); backdrop-filter: none; } }
```
Muted tab label on the blended light bar: 7.39:1. Reason: apple-design section 12, content scrolls under chrome, no opaque strip. Also consider 49px bar height plus removing the fixed copyright strip from the always-visible stack (move to Settings > Rights, which already exists). That is a product call for the owner; it returns about 40px of screen.

## 3. Font

Coverage required: Latvian ā č ē ģ ī ķ ļ ņ š ū ž (and capitals) are all in Latin Extended-A (U+0100-017F); Cyrillic basic and extended. I could not inspect glyph tables without downloading font binaries, so before adopting any family run fontTools (cmap for those 22 code points, GSUB for `tnum`) on the exact files. Subset names below come from Fontsource metadata (api.fontsource.org) and the designers' pages.

### Option 1 (recommended): the iPhone's own SF Pro, Inter as fallback, same family for figures

- What: `-apple-system` resolves to SF Pro on iPhone, with automatic Text/Display switching and Apple's tracking tables, Latin Extended and Cyrillic included, `tnum` supported. Zero bytes, zero licence cost for use on the device (nothing is embedded or redistributed). Non-Apple browsers (your Windows dev machine, Android) fall back to self-hosted Inter so previews and screenshots still look right.
- Licence of fallback: Inter, SIL OFL 1.1. Source: https://rsms.me/inter/ and https://github.com/rsms/inter (OFL-1.1 confirmed on the GitHub page; 147 languages per rsms.me, incl. Cyrillic and Latin Extended).
- CSS:
```css
--font-body:   -apple-system, BlinkMacSystemFont, 'Inter', system-ui, 'Segoe UI', Roboto, sans-serif;
--font-figure: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;  /* same family, no Unbounded */
.big-number, .hero-figure, .entry-amount { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
```
- Do not set `letter-spacing` for SF (WebKit applies SF's own tracking). Set the Inter tracking values from section 3.4 only where the system font is absent: `@supports not (font: -apple-system-body) { ... }` (WebKit-only keyword; verify on device, from memory).
- Optional 1b for figures only: `font-family: ui-rounded, 'SF Pro Rounded', -apple-system, 'Inter', sans-serif;` (SF Pro Rounded, Safari-only generic, from memory). Friendlier digits that match the rounded pine blocks. Test on the phone; if Cyrillic digits/signs misbehave, drop it. Figures are only digits, EUR sign, plus/minus, separators, so script coverage matters little there.
- Optional Dynamic Type: `font: -apple-system-body` on body scales with the iOS text-size setting (Safari-only, verify in the installed PWA). The app already sizes in rem, so layout should follow.
- Cost: you lose the distinctive Unbounded look; you gain native feel, faster first paint, net 4 fewer woff2 files (Onest and Unbounded 8 out, Inter fallback 4 in; sw.js precaches Onest and Unbounded files at lines 19-26; those entries would change to Inter's four subset files). Risk: the app looks different on iPhone vs desktop (SF vs Inter), by design.

### Option 2: Inter everywhere (self-hosted variable), identical on every device

- Licence: SIL OFL 1.1. Sources: https://rsms.me/inter/ (InterVariable.woff2 with weight and optical-size axes, per rsms.me) and https://github.com/rsms/inter. Fontsource build `@fontsource-variable/inter` is OFL-1.1 with subsets cyrillic, cyrillic-ext, latin, latin-ext, greek, vietnamese, but Fontsource lists it as weight-only; take the rsms.me file if you want the optical-size axis.
- Keep your four-way `unicode-range` split (latin, latin-ext, cyrillic, cyrillic-ext) exactly as for Onest, so no extra bytes load for English-only users.
- Figures: same family, `font-variant-numeric: tabular-nums`, weight 700, optical size auto (large sizes use the tighter "display" design), tracking from 3.4.
- Cost vs Option 1: about the same number of files as today (4 instead of 8), still a download on first load; feels "iOS-like" but is not SF.

### Option 3: Inter body, Manrope for the hero figure only (warmer, fintech character)

- Manrope licence: SIL OFL 1.1 (Fontsource metadata: OFL-1.1, version v20, subsets Cyrillic, Cyrillic Extended, Greek, Latin, Latin Extended, Vietnamese, variable weights). Sources: https://fonts.google.com/specimen/Manrope , source repo listed by Fontsource as https://github.com/google/fonts . The Google Fonts page states tabular figures are included; verify `tnum` in the file before adopting (my GitHub lookup of the designer repo returned 404, so I did not confirm there).
- Use only on `.big-number`, hero amount, chart total: `font-family: 'Manrope', 'Inter', sans-serif; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em`.
- Reason to pick it: geometric, slightly wide digits that echo Unbounded without its extreme width. Weakness: not native on iPhone; two families to ship. Choose this only if the owner wants to keep some personality in the numbers.
- Considered and not proposed: Geist (OFL-1.1, Fontsource lists Cyrillic and Latin-ext, but tabular numerals not verified and the character is developer-tool, not iPhone); Nunito (OFL, rounded, Cyrillic and Latin Extended per Fontsource, `tnum` not verified).

### 3.4 Type scale and tracking (px, 390pt-wide iPhone, works for Option 1 fallback or Option 2)

| Role | Size/line | Weight | Tracking (Inter; SF handles itself) |
|---|---|---|---|
| Hero figure (left to spend) | 44/48 | 700 | -0.022em |
| Number in card / chart total | 28/32 | 700 | -0.021em |
| Screen title (home-title) | 24/30 | 700 | -0.019em |
| Header "Home" | 17/22 | 600 | -0.011em |
| Body, buttons | 17/24 | 400 / 600 | -0.011em (Inter at 17px, about -0.0105em) |
| Secondary text (muted) | 15/20 | 400 | -0.008em |
| Footnote, tab label | 13/18 | 500 | 0 |

Tracking values follow Inter's published size-dependent curve (about -0.0223 + 0.185*e^(-0.1745*size) em, from memory). Mechanism: apple-design section 15, tighten large text, leave small text near zero, leading tight on large, loose on body.

## 4. Animation proposals

Shared tokens (extend existing `--ease`, `--dur`; do not fork):
```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);       /* strong ease-out for entrances/exits */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);    /* iOS-like sheet/slide curve */
--dur-press: 160ms; --dur-fast: 180ms; --dur-base: 240ms; --dur-sheet: 340ms;
```
Pattern for reduced motion on every item: write the movement inside `@media (prefers-reduced-motion: no-preference)`; outside it keep an opacity or colour change only (reduced motion is gentler, not zero). Never `ease-in`, never `transition: all`, only transform and opacity (the single exception is the list-row height collapse, as for accordions).

| # | What moves | Trigger and frequency tier | Property | Duration and easing | Reduced-motion fallback | Why |
|---|---|---|---|---|---|---|
| 1 | Button press | pointer-down on any `.btn`; tens per day, feedback | `transform: scale(.97)` + background colour | in 40ms, out 160ms, `--ease-out` | no scale, colour only 120ms linear | apple-design 1: respond on touch-down; makes the press visibly different from hover. CSS in 1.2. |
| 2 | Toast in/out | after save; occasional, feedback | `opacity`, `transform: translate(-50%, 16px) scale(.98)` to `translate(-50%, 0) scale(1)` as a class transition, not a keyframe | in 280ms `--ease-drawer` (opacity 180ms); out 180ms `--ease-out`, same path (down) then remove on `transitionend` | opacity only, 150ms | Fixes: keyframe does not replay on a second toast; abrupt removal; asymmetric path. Optional: drag-down dismiss with pointer capture, dismiss at 40px or 0.5px/ms release velocity. |
| 3 | Hero number change (left to spend, cash left) | after add/edit/delete an entry only, not on first render; several per day, state indication | JS count of integer cents from old to new, `tabular-nums` so width never jitters | 320ms, ease-out (rAF, cubic ease-out `1 - (1-t)^3`) | instant swap | Confirms the delta (338.70 to 308.70) where the user is looking. Keep a static value for screen readers: animated span `aria-hidden="true"`, final value in the `aria-live` text. Under 300ms rule bent by 20ms for a numeric roll. |
| 4 | Tab switch and month arrows content | tab tap / month arrow; tens per day, preventing a jarring change | whole-view swap via `document.startViewTransition(() => render())`; old view fades out, new fades in; month arrows add `translateX(+-10px)` in the direction of travel | 140ms out, 180ms in, `--ease-out` | no view transition (skip the call when `matchMedia('(prefers-reduced-motion: reduce)').matches`) | `render()` rebuilds the DOM so CSS transitions cannot run; a same-document view transition is the cheapest tool (Safari 18+ supports it, from memory; elsewhere it degrades to the current instant swap). Give `.tabbar` and `.app-header` their own `view-transition-name` so they do not fade. Tens per day, so opacity-first and short. |
| 5 | Segmented control thumb (Spending / Income / Trends / Year) and tab dot | tap; occasional | `transform: translateX()` on one thumb element; dot slides between tabs | 260ms `--ease-drawer` | thumb jumps, label colour changes 120ms | Moves the selection instead of re-colouring boxes; spatial continuity. Needs one extra thumb element in the markup. |
| 6 | Bottom sheet (due-subscription overlay today; also the form if Add expense ever becomes a sheet) | open/close; occasional | sheet `transform: translateY(100%)` to `0`; scrim `opacity` 0 to 1 | open 340ms `--ease-drawer` (spring equivalent: response .3, damping .8 only if flicked); close 260ms `--ease-out` along the same path; scrim 240ms `--ease-out` | sheet fades 200ms, no translate; scrim still fades | Apple drawer values. If drag-to-dismiss is added: pointer capture, 1:1 tracking from the grab offset, project the endpoint with `v/1000 * 0.998/(1-0.998)`, hand velocity to the settle, rubber-band at the top. Transform-origin irrelevant (modal, centred horizontally). |
| 7 | New list row (after add) | save; several per day, state indication | row `opacity 0, translateY(-8px)` to final; row background `--tint` fading to transparent | row 260ms `--ease-out`; highlight 900ms ease-out | opacity-only 150ms, highlight stays | Shows where the entry landed. Needs the new row's id passed to the next `render()`. |
| 8 | Delete row | confirm tap; occasional | row `opacity` 1 to 0 (160ms), then `grid-template-rows: 1fr to 0fr` collapse (220ms) before running delete and `render()` | 160 + 220ms `--ease-out` | instant removal; the existing Undo toast stays | Layout property tolerated here because there is no transform equivalent for a collapsing row. Play with WAAPI before calling `render()`. |
| 9 | Inline confirm box and inline error text | tap Delete / invalid submit; occasional | `grid-template-rows 0fr to 1fr` plus `opacity` | 200ms `--ease-out` | opacity 150ms | Today they pop in and push content down. No shake on error (colour + text already carry it). |
| 10 | Category progress bars and donut draw | first view of Month or Chart per session; rare, delight tier but data stays honest | bar: `transform: scaleX(0)` to final, `transform-origin: left`; donut: `stroke-dashoffset` | 450ms `--ease-out`, 40ms stagger per row, play once per session (not on every `render()`) | no animation, final state | Bar width becomes a transform value so it stays on the compositor. Cap the whole thing under 600ms. Skip entirely if it ever feels like waiting. |
| 11 | Input focus | focus; tens per day | `border-color`, ring | 120ms `ease` | same (no movement) | Already close to this; keep it a colour-only change. |

Not animated on purpose: keyboard actions and anything the user performs hundreds of times (typing, scrolling lists), the hero block itself on load, theme switches (let the system flip it), and error messages (no shake).

Verification I could not do: feel (bounce, count-up timing, view-transition crossfade) needs a real iPhone and a 2-5x slow playback; the iOS `:active`, `-apple-system-body`, `ui-rounded` and view-transition behaviours are from memory and flagged above.

## 5. Suggested order if the owner approves

1. Buttons plus the new tokens (section 1 and 2, light first): highest visible gain, smallest risk, pure CSS.
2. Dark palette tweaks and `theme-color` meta.
3. Font Option 1 with Inter fallback, then device check.
4. Toast rewrite and view-transition tab switch (items 2 and 4).
5. Everything else in section 4 as separate small cards.

## Files

- This report: `C:\Users\krilo\AppData\Local\Temp\claude\C--Users-krilo--claude\02311143-6d54-4d0c-a60c-7694f6d2d53d\scratchpad\design\apple.md`
- My screenshots: `...\scratchpad\design\shots\apple-01..10-*.png`; my scripts: `...\scratchpad\tools\apple-*.mjs`; contrast helper: `...\scratchpad\cr.py` (plus run1-3.py).
