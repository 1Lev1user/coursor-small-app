# Design review

For every card that changes UI, and at the end of a UI slice. The card's Acceptance names the checks; the owner takes the screenshots in Cursor or the browser, Claude checks them in review.

Labels: [verified] means checked at the primary source. [assumption] means the owner's own rule.

## Before UI work
- A design brief exists: DESIGN.md at the repo root. It holds: users, the job of the interface, character in 3 adjectives, 3 examples wanted, 3 examples not wanted. No brief means no UI card starts.
- Colours, fonts, sizes, spacing and radii come only from design tokens. In this project the tokens are the CSS custom properties at the top of style.css. No raw values outside tokens [assumption].

## Per UI card
- Screenshots at three widths: phone 390, tablet 768, desktop 1280 px [assumption].
- The owner checks the screenshots.

## Review order (owner's assembly [assumption])
1. Goals from the brief.
2. Squint test: blur the screen and check that groups and hierarchy still show [NN/g, verified].
3. Pass over the 10 NN/g usability heuristics [verified].
4. Objective thresholds last.

## Objective thresholds
| Check | Threshold | Source |
|---|---|---|
| Text contrast (AA) | 4.5:1; large text (18pt or 14pt bold) 3:1 | W3C WCAG 2.2 Contrast Minimum https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html |
| UI components and graphics | 3:1 against adjacent colours | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html |
| Target size (AA) | at least 24x24 CSS px | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html |
| Reflow | no horizontal scroll at 320 CSS px width | https://www.w3.org/WAI/WCAG22/Understanding/reflow.html |
| Core Web Vitals, 75th percentile | LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 | https://web.dev/articles/vitals |
| Lighthouse performance | 90-100 is good | https://developer.chrome.com/docs/lighthouse/performance/performance-scoring |

## Solo owner
Two review passes on different days. NN/g recommends 3-5 evaluators; the two passes are an [assumption].

## Avoid the generic AI look
Source: Anthropic blog "Improving frontend design through skills" [verified, paraphrased].
- No default fonts such as Arial or Inter.
- Dominant colours with sharp accents, not an even pale palette.
- One deliberate motion moment, not scattered effects.

## Third-party design skills
Impeccable is installed for Claude on the owner's machine. Use it for ideas only; the thresholds above decide.
