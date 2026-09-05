# Editable category limits (% ↔ €) — Design

**Date:** 2026-09-05  
**Status:** Approved for implementation planning (pending user review of this file)  
**App:** My Expenses (local PWA)

## Problem

Category spend plans are awkward today: only pinned **%** of the monthly spend budget (or flexible leftover). Users think in both **€** and **%**, want to edit every category (including Savings), and want analytics to compare plan vs actual. They also need a place for misc spending (**Others**).

## Goals

- Keep three money layers: **income** (received), **spend budget** (want to spend), **category plans** (how to distribute), then **expenses** → analytics.
- Every user category (including Savings and Others) can be **Flexible** or **Fixed**.
- Fixed categories edit in **% or €** via a unit toggle; € only after spend budget is saved (> 0).
- On spend-budget change: **fixed-%** keeps % (recalc €); **fixed-€** keeps € (recalc %) — user choice A.
- Under-allocation → leftover to **flexible** categories; if none → existing unallocated warning.
- Over-allocation → **warning**, allow save.
- **Others** is a real category for logging misc expenses only — not a virtual “unspent budget” row.

## Non-goals

- Auto-linking income to spend budget.
- Multi-currency.
- Virtual analytics row for total unspent budget.
- Redesigning Chart beyond using updated plan limits.

## Core model

### Layers

| Layer | Meaning | Source today / after |
|-------|---------|----------------------|
| Income | What I received | Usual monthly + extras (unchanged) |
| Spend budget | What I want to spend | `settings.monthlyBudgetCents` (kept) |
| Category plan | Distribution of spend budget | Categories with flexible / fixed-% / fixed-€ |
| Actual | What I spent | Expenses → Month / Chart plan vs actual |

### Category kinds

1. **Flexible** (`pinned === false`) — equal share of leftover % after all fixed categories (same math as today).
2. **Fixed %** (`pinned === true`, `limitMode: 'percent'`) — stored `percent` is canonical; € = `percent/100 * budget`.
3. **Fixed €** (`pinned === true`, `limitMode: 'euro'`) — stored `limitCents` is canonical; `% = limitCents/budget*100` when budget > 0.

`resolvePlan` always exposes both `percent` and `limitCents` for UI and analytics.

### Budget change

When `monthlyBudgetCents` changes:

- Fixed-% → recompute `limitCents` from `percent`.
- Fixed-€ → recompute `percent` from `limitCents` (clamp/warn if budget is 0).
- Flexible → recompute equal leftover shares as today.

### Leftover / overflow

- Leftover after fixed → split across flexible (unchanged).
- No flexible → `unallocatedPercent` / warning (unchanged).
- Pinned total > 100% → `pinnedOverflow` warning; still allow save (unchanged product rule).

### Others category

- Seed a user category **Others** (not system Uncategorised).
- Default: flexible, no subcategories (or empty list).
- Purpose: log misc expenses. User may later set Fixed %/€ like any other category.
- Distinct from system **Uncategorised** (deleted-category expense sink).

## UI

### Plan (More)

- Keep **Monthly spend budget (EUR)** and usual income.
- Savings edited in Categories list (or Plan) with the same Fixed %/€ control — not a dead-end “Savings % only” that ignores € mode.
- Show summary: fixed total, leftover for flexible, overflow/unallocated warnings.

### Category row (More → Categories)

For each category including Savings and Others:

- Name; Flexible vs Fixed control (existing pinned/flexible choice, clarified labels).
- If Fixed: amount field + **tap unit toggle `%` ↔ `€`**.
  - Helper line shows the other unit when budget known (e.g. `€35` → `3.5% of budget`).
  - € mode with no budget → inline error: save spend budget first.
  - Save in € → `limitMode: 'euro'`; save in % → `limitMode: 'percent'`.
- If Flexible: no amount field; optional muted `~€X each` when budget and leftover known.

### Add category

Same Flexible / Fixed + %/€ toggle as edit.

### Setup

- Ask spend budget, then Savings as % or € (€ only after budget entered), then usual income.
- Seed Others on first run / migration.

### Analytics (Month / Chart)

- Continue planned vs actual per category using `limitCents` from resolved plan.
- Over/under markers unchanged in spirit; no new virtual leftover row.

## Data shape

Extend category objects:

```js
{
  id, name, system, pinned, percent,
  limitMode: 'percent' | 'euro', // ignored when pinned === false
  limitCents: number,            // canonical when limitMode === 'euro'; required synced for resolve
  subcategories: [...]
}
```

`settings.monthlyBudgetCents` unchanged.

Frozen month snapshots already store per-entry `percent` and `limitCents`; keep writing both at freeze time from `resolvePlan`.

## Migration

1. Existing `pinned: true` → `limitMode: 'percent'`; set `limitCents` from current budget × percent (or 0 if no budget).
2. Existing flexible → `limitMode` unused / default `'percent'`; no behaviour change.
3. If no category named Others (case-insensitive) among user categories → add flexible Others.
4. Do not rename or remove Uncategorised.

Schema `version` bump only if normalise already keys off version; otherwise extend `normalise` to fill defaults for missing `limitMode` / `limitCents` without rejecting old backups.

## Edge cases

- Budget = 0: € entry blocked; fixed-€ categories show % as n/a or 0 until budget set; resolve limits stay 0.
- Switching unit in UI without save only changes display/draft; `limitMode` updates on successful save.
- Rounding: reuse `splitShares` / existing percent rounding; when deriving % from €, use enough precision for display (1 decimal) and store percent consistent with resolvePlan.
- Delete Others: allowed like other user categories (expenses → Uncategorised); migration may recreate only if missing at load — do not force recreate after user delete (YAGNI: recreate only when absent at migrate-once / first seed).

## Testing focus

- resolvePlan: fixed-%, fixed-€, flexible leftover, overflow, zero budget.
- Budget change updates fixed-€ percents and fixed-% cents.
- canSetPinned / validation when entering € without budget.
- Migration fills `limitMode` and seeds Others once.
- UI unit toggle (manual checklist): %↔€, helper text, Savings and Others editable.

## Implementation notes

- Prefer extending `src/budget.js` + `src/model.js` + More/setup views; avoid new frameworks.
- No new dependencies.
- Bump `CACHE_NAME` in `sw.js` when shipping shell changes.
