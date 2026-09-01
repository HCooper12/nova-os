# 55 — Shopping

Audited 2026-09-01. Read-only. Files opened: `server/lib/shoppingList.js`
(30-130 + structure; CATEGORIES read at 12), `src/vals/valsMisc.js`
shopping section (9-58), Shopping.jsx [mapped]. The vaultStateFile shared
helper (cache + iCloud staleness + external-edit detection) noted as a
rail. Phone-width carried ([45]).

## 1. What it is (verified)

The vault shopping list as a screen — grouped by supermarket-layout
categories, checked counts, quantity steppers, and the filing target for
captures, meal-prep, and recipe adds.

**The amount fix, with its incident** (90-119): "He added the Chicken
Caesar and the chicken came back as plain 'chicken breast' with no
weight, which is useless at the shops" — the categorising model's prompt
had "helpfully deleted the 1kg". The fix "takes the amount out of the
model's reach entirely": code splits the leading amount first, the model
only sees the food, the amount re-attaches after — "Models decide the
category; **code keeps the number**." The splitter guards the bare-unit
backtrack case ("'500g' on its own is the item"); quantities are whole,
floored, and capped ("a slipped keypress cannot ask for four thousand
yoghurts", MAX_QTY 99). Adds return ids so undo is precise.

## 2. Cross-item finding — [12] plan 5, SHARPENED

Meal Prep's `toShoppingItems` STRIPS quantities ([12] con 5) — but this
module already keeps them: `addItemsDirect` splits any "1kg raw chicken
breast" it receives "so no add path can drop the number" (56-64). The
meal-prep path loses amounts BEFORE reaching the keeper. [12]'s gated
M-effort aggregation item therefore simplifies to: **stop stripping —
pass the raw ingredient lines through and let addItemsDirect do its
job.** Effort drops to L; the gate (parseability) is already answered by
AMOUNT_RE's unit table.

## 3-4. Pros / Cons

Pros: the number-out-of-the-model's-reach pattern (the scanFood/USDA
fix's sibling, at the shopping layer); precise undo ids; the qty cap's
phrasing; supermarket-order grouping.
Cons: none of its own — the [12] simplification is the finding.

## 5. Mission test

**Weekly: earns its keep** — the list the meal-prep loop fills and the
shop consumes, with amounts that survive to the aisle.

## 6-7. Plan / UI

1. **[Refine — revises 12 plan 5]** Meal Prep passes raw ingredient
   lines; the aggregation gate dissolves. **Impact/effort:** M / L.
- UI: none.

## 8. Verdict

**Keep as-is** — eighteenth clean keep; and its main output is making an
earlier item's plan cheaper.
