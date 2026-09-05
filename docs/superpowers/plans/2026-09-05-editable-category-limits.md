# Editable Category Limits (% ↔ €) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set each category’s spend plan as Fixed % or Fixed € (toggle), keep Flexible leftover split, seed Others, and keep Month/Chart plan-vs-actual working.

**Architecture:** Extend category records with `limitMode` (`percent` | `euro`) and `limitCents`. Sync %↔€ in `budget.js` before `resolvePlan` math. Soften overflow to warning-only (allow save). UI in More/setup: unit toggle; € requires `monthlyBudgetCents > 0`. Seed **Others** in `defaultData` + migrate in `normalise`.

**Tech Stack:** Vanilla ES modules, `node --test`, existing `localStorage` schema v1 (backwards-compatible fields via `normalise`).

**Design:** `docs/superpowers/specs/2026-09-05-editable-category-limits-design.md`

## Global Constraints

- No new dependencies; EUR only; English UI.
- Do not change expense/income schemas, subscription due rules, or freeze-once month snapshots semantics.
- Spend budget stays in `settings.monthlyBudgetCents`. Income stays separate.
- Fixed-€ keeps € when budget changes (recalc %); Fixed-% keeps % (recalc €).
- € edit blocked unless spend budget saved and > 0.
- Overflow (>100% fixed) → warning, **allow save** (stop blocking via `canSetPinned`).
- Others = user category for misc expenses; not Uncategorised; not a virtual unspent row.
- Commit per task; do not push unless asked. Bump `CACHE_NAME` in final task.

---

## File map

| File | Role |
|------|------|
| `src/budget.js` | %↔€ helpers, sync before resolve, budget-change apply, softer `canSetPinned` |
| `src/model.js` | `limitMode`/`limitCents` on seeds; Others; `normalise` migration |
| `test/budget.test.js` | resolve + sync + budget change + canSetPinned |
| `test/model.test.js` | defaultData Others + normalise fills modes / seeds Others |
| `src/views/more.js` | Plan without Savings-only %; category Fixed %↔€ toggle; add-category same |
| `src/views/setup.js` | Savings % or € after budget |
| `sw.js` | Cache bump |

---

### Task 1: Budget helpers — %↔€ sync and resolvePlan for fixed-€

**Files:**
- Modify: `src/budget.js`
- Modify: `test/budget.test.js`

**Done when:** Fixed-€ categories contribute correct % to leftover math; fixed-% unchanged; overflow still reported in `warnings.pinnedOverflow`.

- [ ] **Step 1: Add failing tests**

Append to `test/budget.test.js`:

```js
import {
    // existing imports…
    percentFromEuroCents,
    euroCentsFromPercent,
    syncCategoryPlanFields,
} from '../src/budget.js';

test('percentFromEuroCents and euroCentsFromPercent round-trip on clean numbers', () => {
    assert.equal(percentFromEuroCents(3500, 100000), 3.5);
    assert.equal(euroCentsFromPercent(3.5, 100000), 3500);
    assert.equal(percentFromEuroCents(10000, 0), 0);
    assert.equal(euroCentsFromPercent(10, 0), 0);
});

test('resolvePlan uses fixed-euro limitCents as canonical when limitMode is euro', () => {
    const data = defaultData();
    data.settings.monthlyBudgetCents = 100000; // €1000
    const savings = data.categories.find(({ id }) => id === 'savings');
    savings.pinned = true;
    savings.limitMode = 'euro';
    savings.limitCents = 10000; // €100
    savings.percent = 999; // stale — must be ignored/overwritten by sync

    const plan = resolvePlan(data.categories, data.settings.monthlyBudgetCents);
    const entry = plan.entries.find(({ id }) => id === 'savings');
    assert.equal(entry.limitCents, 10000);
    assert.equal(entry.percent, 10);
    assert.equal(plan.pinnedTotalPercent, 10);
    assert.equal(plan.leftoverPercent, 90);
});

test('syncCategoryPlanFields updates fixed-euro percent when budget changes', () => {
    const categories = [
        {
            id: 'savings',
            name: 'Savings',
            system: false,
            pinned: true,
            limitMode: 'euro',
            limitCents: 10000,
            percent: 10,
            subcategories: [],
        },
        {
            id: 'flex',
            name: 'Flex',
            system: false,
            pinned: false,
            limitMode: 'percent',
            limitCents: 0,
            percent: 0,
            subcategories: [],
        },
    ];
    syncCategoryPlanFields(categories, 200000); // budget now €2000
    assert.equal(categories[0].limitCents, 10000);
    assert.equal(categories[0].percent, 5);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test test/budget.test.js`

Expected: FAIL (exports missing / behaviour wrong).

- [ ] **Step 3: Implement helpers and wire resolvePlan**

In `src/budget.js`:

```js
export function percentFromEuroCents(limitCents, monthlyBudgetCents) {
    if (!Number.isFinite(limitCents) || !Number.isFinite(monthlyBudgetCents) || monthlyBudgetCents <= 0) {
        return 0;
    }
    return (limitCents / monthlyBudgetCents) * 100;
}

export function euroCentsFromPercent(percent, monthlyBudgetCents) {
    if (!Number.isFinite(percent) || !Number.isFinite(monthlyBudgetCents) || monthlyBudgetCents <= 0) {
        return 0;
    }
    return splitShares(monthlyBudgetCents, [percent])[0];
}

/** Mutates user categories in place: sync percent ↔ limitCents from limitMode. */
export function syncCategoryPlanFields(categories, monthlyBudgetCents) {
    for (const category of categories) {
        if (category.system === true) continue;
        if (category.pinned !== true) {
            if (category.limitMode !== 'percent' && category.limitMode !== 'euro') {
                category.limitMode = 'percent';
            }
            continue;
        }
        if (category.limitMode === 'euro') {
            category.percent = percentFromEuroCents(category.limitCents, monthlyBudgetCents);
        } else {
            category.limitMode = 'percent';
            category.limitCents = euroCentsFromPercent(category.percent, monthlyBudgetCents);
        }
    }
}
```

At the start of `resolvePlan`:

```js
export function resolvePlan(categories, monthlyBudgetCents) {
    syncCategoryPlanFields(categories, monthlyBudgetCents);
    // …existing body unchanged…
}
```

**Note:** `resolvePlan` currently mutates nothing on category objects except via this sync — that is intentional so stored fixed-€ `%` stays fresh when budget changes at resolve/save time.

- [ ] **Step 4: Soften `canSetPinned`**

Change overflow from hard fail to soft ok (design: allow save with warning). Keep invalid single percent as fail:

```js
export function canSetPinned(categories, categoryId, percent) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return {
            ok: false,
            reason: 'Pinned percentage must be a number from 0% to 100%.',
        };
    }
    const otherPinnedTotal = /* same reduce as today */;
    return {
        ok: true,
        pinnedTotalPercent: otherPinnedTotal + percent,
        overflow: otherPinnedTotal + percent > 100,
    };
}
```

Update any tests that expected `ok: false` for total > 100% to expect `ok: true` and `overflow: true` (or rely on `resolvePlan` warnings only).

- [ ] **Step 5: Full budget tests pass**

Run: `node --test test/budget.test.js`  
Expected: PASS (update existing assertions if they required blocking overflow).

- [ ] **Step 6: Commit**

```bash
git add src/budget.js test/budget.test.js
git commit -m "feat: sync fixed-euro category limits into resolvePlan"
```

---

### Task 2: Model — limitMode, Others seed, normalise migration

**Files:**
- Modify: `src/model.js`
- Modify: `test/model.test.js`

**Done when:** New installs include Others + `limitMode`/`limitCents`; old backups load and get fields filled; Others seeded once if missing (case-insensitive name among non-system categories).

- [ ] **Step 1: Failing tests**

```js
test('defaultData seeds Others as flexible user category and limitMode on all user categories', () => {
    const data = defaultData();
    const others = data.categories.find(({ name }) => name.toLowerCase() === 'others');
    assert.ok(others);
    assert.equal(others.system, false);
    assert.equal(others.pinned, false);
    assert.equal(others.limitMode, 'percent');
    assert.equal(others.limitCents, 0);
    for (const category of data.categories.filter(({ system }) => !system)) {
        assert.ok(category.limitMode === 'percent' || category.limitMode === 'euro');
        assert.equal(typeof category.limitCents, 'number');
    }
});

test('normalise fills limitMode and limitCents and seeds Others when missing', () => {
    const raw = defaultData();
    // strip new fields to simulate old backup
    raw.categories = raw.categories
        .filter(({ name }) => name.toLowerCase() !== 'others')
        .map(({ limitMode, limitCents, ...rest }) => rest);
    raw.categories.find(({ id }) => id === 'savings').percent = 10;
    raw.settings.monthlyBudgetCents = 100000;

    const result = normalise(raw);
    assert.equal(result.ok, true);
    const savings = result.data.categories.find(({ id }) => id === 'savings');
    assert.equal(savings.limitMode, 'percent');
    assert.equal(savings.limitCents, 10000);
    assert.ok(result.data.categories.some(({ name }) => name.toLowerCase() === 'others'));
});

test('normalise does not recreate Others if user deleted it', () => {
    const raw = defaultData();
    raw.categories = raw.categories.filter(({ name }) => name.toLowerCase() !== 'others');
    raw.settings._othersSeeded = true; // see implementation note below
    // Prefer: if any category ever had id 'others' tombstone is YAGNI —
    // Spec: seed only when absent at migrate. Use settings.othersSeeded flag set true after first seed.
    const result = normalise(raw);
    assert.equal(result.ok, true);
    // After first normalise without Others, seed once and set flag; second load without Others keeps deleted.
});
```

**Clarify Others delete rule in implementation (match design):**

- Add `settings.othersSeeded` boolean (default `false` in `defaultData`, `true` once Others has been seeded).
- `normalise`: if no non-system category with name `/^others$/i` and `othersSeeded !== true` → append flexible Others and set `othersSeeded = true`.
- If user deletes Others later, flag stays true → do not recreate.
- Fresh `defaultData()` includes Others and `othersSeeded: true`.

Adjust the third test accordingly (two-step: old backup without flag gets Others; data with `othersSeeded: true` and no Others stays without).

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/model.test.js`

- [ ] **Step 3: Implement model changes**

In `defaultData()` settings add `othersSeeded: true`.  
On every user category add `limitMode: 'percent'`, `limitCents: 0`.  
Savings stays `pinned: true`, `limitMode: 'percent'`.  
Insert Others before Uncategorised:

```js
{
    id: 'others',
    name: 'Others',
    pinned: false,
    percent: 0,
    limitMode: 'percent',
    limitCents: 0,
    system: false,
    subcategories: [],
},
```

In `normalise`, after validating arrays, for each non-system category:

```js
if (category.limitMode !== 'percent' && category.limitMode !== 'euro') {
    category.limitMode = 'percent';
}
if (typeof category.limitCents !== 'number' || !Number.isFinite(category.limitCents)) {
    category.limitCents = 0;
}
if (category.pinned === true && category.limitMode === 'percent') {
    // fill limitCents from budget × percent if limitCents is 0 and percent > 0
    const budget = data.settings.monthlyBudgetCents;
    if (category.limitCents === 0 && category.percent > 0 && budget > 0) {
        category.limitCents = euroCentsFromPercent(category.percent, budget);
    }
}
```

Import `euroCentsFromPercent` from `budget.js` **only if it does not create a cycle**. If `budget.js` imports `model.js`, duplicate a 3-line cents calc inline in `normalise` instead:

```js
category.limitCents = Math.round(budget * category.percent / 100);
```

(Accept 1¢ rounding difference vs `splitShares` for migration only.)

Others seed + `othersSeeded` as above. Ensure `settings.othersSeeded` defaults to `false` when missing on old data before seed logic runs.

- [ ] **Step 4: Tests pass + `npm test`**

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/model.test.js
git commit -m "feat: add Others category and limitMode migration"
```

---

### Task 3: Apply budget change when Plan saves

**Files:**
- Modify: `src/views/more.js` (`savePlan`)
- Optionally export a thin wrapper already covered by Task 1’s `syncCategoryPlanFields`

**Done when:** Changing monthly spend budget recalculates fixed-% € and fixed-€ % before persist; `refreshCurrentMonthPlan` still called as today.

- [ ] **Step 1: In `savePlan`, after parsing new budget cents and before/after writing settings**

```js
ctx.data.settings.monthlyBudgetCents = budgetCents;
syncCategoryPlanFields(ctx.data.categories, budgetCents);
// existing savings handling: REMOVE Plan-level Savings % field (Task 4 moves Savings edit to category row).
// For this task: if Plan still has savings % temporarily, set savings.limitMode = 'percent' and percent, then sync.
refreshCurrentMonthPlan(ctx.data);
```

Import `syncCategoryPlanFields` from `../budget.js`.

- [ ] **Step 2: Manual note in report** — change budget €1000→€2000 with Savings fixed-€ €100 → shows 5%.

- [ ] **Step 3: `npm test` + commit**

```bash
git commit -m "fix: resync category limits when spend budget changes"
```

(If Task 4 removes Savings from Plan in the same session, fold this into Task 4’s commit instead — prefer **one More commit** spanning Task 3+4 if implementing back-to-back.)

---

### Task 4: More UI — Plan cleanup + category %↔€ toggle

**Files:**
- Modify: `src/views/more.js`
- Modify: `style.css` (minimal toggle styles)

**Done when:** Plan edits budget + usual income only (no Savings %). Each Fixed category (incl. Savings, Others) has amount + unit toggle; Flexible has no amount; add-category supports the same; € without budget shows error.

- [ ] **Step 1: Remove Savings % from `renderPlanSection` / `savePlan`**

Keep budget + usual income fields and warnings from `resolvePlan`.

- [ ] **Step 2: Category summary line**

Replace `Pinned · X%` with:

- Flexible: `Flexible` + optional ` · ~${formatEuro(planEntry.limitCents)}` when budget > 0  
- Fixed %: `Fixed · ${displayPercent(percent)} · ${formatEuro(limitCents)}`  
- Fixed €: `Fixed · ${formatEuro(limitCents)} · ${displayPercent(percent)}`

- [ ] **Step 3: Edit Fixed amount with unit toggle**

Per category edit UI (extend existing rename/edit patterns — add a small “Edit plan” control or inline editor):

Draft state per category (module-level map or fields on existing drafts):

```js
// limitUnit: 'percent' | 'euro'
```

Markup sketch:

```js
const unitBtn = element('button', 'unit-toggle', unit === 'euro' ? '€' : '%');
unitBtn.type = 'button';
unitBtn.addEventListener('click', () => {
    // flip unit; convert displayed value using current budget
    const budget = ctx.data.settings.monthlyBudgetCents;
    if (nextUnit === 'euro' && budget <= 0) {
        setError(amountField, 'Save a monthly spend budget first.');
        return;
    }
    // convert draft string percent ↔ euro using percentFromEuroCents / euroCentsFromPercent
    unit = nextUnit;
    ctx.render();
});
const helper = element('p', 'muted', unit === 'euro'
    ? `${displayPercent(percentFromEuroCents(parsedCents, budget))} of budget`
    : formatEuro(euroCentsFromPercent(parsedPercent, budget)));
```

On save Fixed:

```js
if (unit === 'euro') {
    if (budget <= 0) { /* error */ return; }
    const cents = parseAmount(raw);
    if (cents === null) { /* error */ return; }
    category.pinned = true;
    category.limitMode = 'euro';
    category.limitCents = cents;
    category.percent = percentFromEuroCents(cents, budget);
} else {
    const percent = parsePercent(raw);
    if (percent === null) { /* error */ return; }
    category.pinned = true;
    category.limitMode = 'percent';
    category.percent = percent;
    category.limitCents = euroCentsFromPercent(percent, budget);
}
syncCategoryPlanFields(ctx.data.categories, budget);
refreshCurrentMonthPlan(ctx.data);
persist…
```

Flexible save: `pinned = false`; clear amount UI.

- [ ] **Step 4: Add category form**

Reuse unit toggle; same validation; new categories get `limitMode`/`limitCents` set; `subcategories: []`.

- [ ] **Step 5: CSS**

```css
.unit-toggle {
    min-height: var(--tap);
    min-width: var(--tap);
    padding: var(--s2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
}
```

Place toggle beside the amount field (row layout).

- [ ] **Step 6: Manual checklist**

1. Set budget €1000.  
2. Savings Fixed €100 → helper ~10%.  
3. Subscriptions Fixed 5% → helper €50.  
4. Clear budget / set 0 → € toggle errors.  
5. Budget → €2000 with Savings fixed-€ → still €100, ~5%.  
6. Overflow fixed 60%+60% → warning, still saves.  
7. Others appears; can log expense to it from Add.

- [ ] **Step 7: `npm test` + commit**

```bash
git add src/views/more.js style.css
git commit -m "feat: edit category plans in percent or euro"
```

---

### Task 5: Setup — Savings % or € after budget

**Files:**
- Modify: `src/views/setup.js`

**Done when:** Setup asks budget first; Savings accepts % or € (toggle); € requires budget in the form draft > 0; writes `limitMode` correctly; Others already from `defaultData`.

- [ ] **Step 1: Add unit toggle next to Savings field** (same helpers as More).

On Continue:

```js
savings.pinned = true;
if (unit === 'euro') {
    const cents = parseAmount(savingsRaw);
    // validate budgetCents > 0 and cents
    savings.limitMode = 'euro';
    savings.limitCents = cents;
    savings.percent = percentFromEuroCents(cents, budgetCents);
} else {
    const savingsPercent = parsePercent(savingsRaw);
    // validate
    savings.limitMode = 'percent';
    savings.percent = savingsPercent;
    savings.limitCents = euroCentsFromPercent(savingsPercent, budgetCents);
}
```

Do not call blocking overflow fail — allow continue; warnings appear later in More.

- [ ] **Step 2: Manual** — setup with € budget 1000 and Savings €100 completes; Savings shows fixed-€.

- [ ] **Step 3: Commit**

```bash
git add src/views/setup.js
git commit -m "feat: allow Savings setup in percent or euro"
```

---

### Task 6: SW bump + full verify

**Files:**
- Modify: `sw.js`

- [ ] **Step 1:** `CACHE_NAME = 'my-expenses-v1-limits1'`

- [ ] **Step 2:** `npm test` — all PASS.

- [ ] **Step 3:** Manual regression — Add expense to Others; Month plan vs actual; Chart; due dialog still works; Plan budget resync.

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: bump service worker cache for category limit modes"
```

- [ ] **Step 5:** Stop — do not push unless asked.

---

## Out of scope

- Virtual unspent analytics row; income auto-budget; Chart redesign; recreating Others after user delete.

## Spec coverage

| Design item | Task |
|-------------|------|
| Fixed % / Fixed € / Flexible | 1, 4 |
| Sync on budget change | 1, 3, 4 |
| € requires budget | 4, 5 |
| Overflow warning allow save | 1 |
| Others seed + migrate once | 2 |
| Plan without Savings-only field | 4 |
| Setup %/€ | 5 |
| Analytics uses limitCents | 1 (resolve) — Month/Chart unchanged |
| SW bump | 6 |
