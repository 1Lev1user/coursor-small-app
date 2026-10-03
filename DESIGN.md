# DESIGN

Half-page design brief. Drafted from style.css comments and tokens; every statement is [inferred] until the owner confirms. Used by the design-review skill.

## Users
- The owner, on a phone, often one-handed, in short sessions [inferred].

## Job of the interface
- Show at a glance what is left to spend this month, and make adding an entry fast [inferred].

## Direction
"C Colour blocks" [inferred], quoted from style.css (lines 75-79):
> Design tokens. Direction C "Colour blocks": sage ground, quiet tinted surfaces, one solid pine block for the number that matters. No borders or shadows on surfaces; elevation comes from tint.

## Type
- Body: Onest (`--font-body`) [inferred].
- Figures (amounts, key numbers): Unbounded (`--font-figure`) [inferred].
- Fonts are self-hosted in fonts/, SIL OFL 1.1.

## Tokens
- Location: `:root` at the top of style.css [inferred].
- Groups [inferred]: surfaces and text (`--bg`, `--surface`, `--surface-2`, `--text`, `--muted`); accent and block (`--accent*`, `--block*`); status (`--danger*`, `--ok`, `--savings*`); lines (`--border`, `--field-line`, `--track`, `--scrim`); chart categories `--cat-1`..`--cat-8` (fixed order, comment says validated for colour-blind separation); fonts; radii (`--radius` 20px, `--radius-sm` 14px); motion (`--ease`, `--dur` 240ms); spacing `--s1`..`--s5`; layout (`--tabbar-height`, `--tap`).
- Rule: no raw colours outside tokens [inferred].

## Themes and access
- Dark theme via `@media (prefers-color-scheme: dark)` redefining the same tokens [inferred].
- Tap target token `--tap: 44px` [inferred].
- Reduced motion supported (`prefers-reduced-motion` queries in style.css) [inferred].

## Character (3 adjectives)
(owner to fill)

## 3 examples wanted
(owner to fill)

## 3 not wanted
(owner to fill)
