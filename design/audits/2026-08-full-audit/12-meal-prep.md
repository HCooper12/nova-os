# 12 — Meal Prep

Audited 2026-08-30. Read-only. Files opened: `server/lib/mealPrep.js` (full,
166 lines), `server/lib/inbox.js` shopping route + undo (88-95, 246,
790-792), `server/lib/shoppingList.js` CATEGORIES (verified against
mealPrep's AISLE — 8/8 strings match exactly), `server/routes/loops.js`
:233 (manual run), learning/push/fleet/ops greps. The loops-card run button
was read at item 02 (valsInbox mealPrepCard). Deferrals: Shopping screen
(item 55), Recipes screen (50), Inbox card rendering (48).

## 1. What it is (verified)

The Thursday shopping-and-sanity loop — fully deterministic, no model
(mealPrep.js:6-10): keep the current rotation (his stated preference —
same meals, little variance; **stability is the feature**), verify the
plan still clears the protein floor, and draft the shopping list those
recipes need.

- **Composition** (64-117): the rotation's slots named; planned protein vs
  floor with an explicit `⚠ …SHORT` line when under; three reality
  sections added by the July sweep — recurring off-plan foods over 21 days
  ("worth stocking for"), floor-adherence reality check ("met 4/6 tracked
  days — the plan only works when the slots get eaten"), and heavy
  calendar days ahead ("grab-and-go portions matter there").
- **Shopping list** (44-62): quantity stripping ("200g chicken breast" →
  "Chicken breast"), cross-recipe dedupe, deterministic aisle guess —
  coarse on purpose, wrong guesses are a drag-free fix on the Shopping
  screen (24-26).
- **Rails** (125-150): one draft record per week (Monday-keyed guard),
  kind `meal-prep`, route `shopping`; approval validates every item's
  category against SHOPPING_CATEGORIES and files to the shopping list;
  undo removes exactly those items (inbox.js:88-95, 790-792). Empty
  rotation → honest skip with reason.
- **Scheduler** (152-166): Thursdays ≥17:00, hourly tick, heartbeat
  `mealprep` (Guardian-watched at 3h cadence), weekly dedupe inside
  runMealPrep. Manual run + force via the loops route and the Inbox
  loops card.

## 2. Current workflow, traced

Thursday 17:00: rotation holds 4 slots → planned 158g vs 180g floor → the
record's reason reads: "Keeping this week's plan… ⚠ Protein plan: 158g
against the 180g floor — 22g SHORT. Worth swapping one slot up. Off-plan
regulars (worth stocking for): Greek yoghurt ×4 · Beef jerky ×2. Reality
check: floor met 4/6 tracked days last week…" → 23 deduped items with
aisles ride the payload → pending Inbox card → approve → items land on the
Shopping screen grouped by aisle, undo available.

Failure modes, as they degrade today:
- Empty rotation → skip with reason. **Honest.**
- Reality sections fail → garnish lines silently absent; the core
  (rotation + floor + items) always computes. **Mitigated-silent.**
- Category mismatch at filing → falls back to 'Household & Other'
  (inbox.js:92) — can't currently happen since the lists match, but the
  contract is held by discipline alone: no twin comment in AISLE, no test
  pinning them. **Latent rule-7 drift risk.**
- **Mac asleep Thursday evening → no meal prep that week**: the scheduler
  fires only on `day === 4 && hour >= 17` (159); Friday's ticks skip
  entirely, and the weekly guard would have made a catch-up run safe.
  **Silent weekly absence.**
- **An unapproved meal-prep record never expires**: `meal-prep` is absent
  from TIME_VALUE_HOURS (verified against inbox.js:1136) — last week's
  undecided shopping list sits pending forever while this week's arrives
  beside it. **Queue rot.**

## 3. Pros — what genuinely works

- **Stability encoded as the feature** — the agent's core move is to
  propose *no change*, which is precisely what his stated preference asks
  for and the opposite of what a naive "suggest new meals!" agent would
  do. The best example in the fleet of a preference shaping an agent's
  entire design.
- **Plan-vs-reality composition**: floor verification of the plan, floor
  adherence of the actual week, off-plan regulars, and the week ahead's
  shape — four truths joined deterministically in ~40 lines.
- **The shopping pipeline is honest about its coarseness** (aisle guesses
  drag-free to fix) and the filing path validates + undoes cleanly.
- **Weekly guard + force + manual run** — the small-agent scheduler kit,
  correctly assembled.

## 4. Cons and gaps (ranked by real-life cost)

1. **A slept-through Thursday costs the whole week** (159) — the one
   agent whose output gates a physical errand has no catch-up window,
   though its weekly dedupe makes one free.
2. **The floor-short warning stops at "worth swapping one slot up"** — the
   recipe bank knows every alternate's macros, yet no concrete swap is
   suggested; he's left to hunt the Recipes screen's FITS filter himself.
   Mission axis, weekly.
3. **Off-plan regulars are named but not listed** — "worth stocking for:
   Greek yoghurt ×4" is advice whose action (add it to the list he's about
   to approve) is deterministic and one line away.
4. **Stale records never expire** — TIME_VALUE_HOURS omission, verified.
5. **Quantities are stripped, not aggregated** — a week's prep shop reads
   "Chicken breast" with no amount; deliberate simplification whose cost
   is real only if his recipe lines carry parseable amounts (gated on a
   real-data check).
6. **The aisle/category contract is unpinned** — matching today, by
   discipline; one added category on either side silently degrades to
   'Household & Other'.

## 5. Mission test

**Weekly: earns its keep cleanly** — it converts the rotation into a shop
with the floor structurally verified *before* the week is bought, and its
reality checks close the plan-vs-execution gap that sank naive meal
planning. **Daily: n/a by design.** **Monthly/long-term:** the recurring-
foods read is the seed of a real long-term signal (what he actually eats
migrating into the plan) — currently advisory only; plan item 3 turns it
into action. The stability-first design is itself long-term mission
alignment: adherence beats novelty.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 4, 6 REFINE; 2, 3, 5 ADD (5 gated). Rejected candidate:
model-composed meal suggestions — the stability preference makes a
suggestion engine the wrong shape entirely; the deterministic swap hint
(item 2) is the honest ceiling.

1. **[Refine] Thursday→Saturday catch-up window.**
   - **Proposal:** fire on `day >= 4 && day <= 6 && hour >= 17`; the
     existing Monday-keyed weekly guard already prevents duplicates, so a
     slept-through Thursday recovers Friday.
   - **Doctrine:** rule 4. **Impact/effort:** M-H / L.
   - **Verification:** unit test the window; scratch-clock run.
2. **[Add] Deterministic floor-fix suggestion.**
   - **Need:** the SHORT warning should carry its own fix.
   - **Proposal:** when planned < floor, scan the chosen recipes'
     alternates (and the bank) for the single swap that closes the most
     gap; append one line: "closest fix: dinner → X (+24g)". Pure
     arithmetic over data already loaded; suggest only when a swap
     actually clears or materially closes the gap — otherwise say the gap
     honestly and stop.
   - **Doctrine:** rules 1, 4; confident-guess screen (no swap invented
     when none helps). **Impact/effort:** M-H / M.
   - **Verification:** pure-function tests; run against his real bank per
     the standing detectors rule.
3. **[Add] Off-plan regulars join the list, labelled.**
   - **Proposal:** append recurring foods to `items` as
     `{name, category, note: 'off-plan regular ×4'}` — his approval still
     gates; removing one pre-shop is the Shopping screen's normal edit.
   - **Doctrine:** rules 1, 6. **Impact/effort:** M / L.
   - **Verification:** compose against real food history; item shape test.
4. **[Refine] 7-day time-value expiry** — add `'meal-prep': 7 * 24` to
   TIME_VALUE_HOURS so an undecided list expires before its successor
   arrives. **Impact/effort:** M / L.
5. **[Add, gated] Quantity aggregation.**
   - **Proposal:** GATED on a real-data read: if his recipe ingredient
     lines carry parseable amounts (g/kg/ml/x), sum per deduped item and
     render "Chicken breast — ~1.2kg"; if they don't parse cleanly, ship
     nothing (a wrong quantity is worse than none).
   - **Doctrine:** confident-guess screen is the gate.
   - **Impact/effort:** M / M.
   - **Verification:** parser replay over his real recipes first.
6. **[Refine] Pin the aisle/category twin** — comment in AISLE naming
   SHOPPING_CATEGORIES as the contract, plus a test asserting every AISLE
   output ∈ SHOPPING_CATEGORIES. **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the Inbox meal-prep card (approve → Shopping), the
loops card's run button, push. Screened against dashboard drift:

- **Floor status + item count on the card** ("23 items · plan 158g/180g
  ⚠"): the one decision the card asks for — approve this week's shop —
  currently buries its most decision-relevant number in prose. What
  changes: a SHORT week gets fixed before shopping, not discovered after.
  [Card rendering verified at item 48's pass.]
- **The suggested swap as a chip** (with plan 2): "dinner → X (+24g)"
  tappable into the Recipes screen's variant flow. What changes: the fix
  is one tap, not a hunt.
- Nothing else — the artefact is a list and a verdict; more chrome is
  drift.

## 8. Verdict

**Keep as-is / Refine** — the fleet's best example of a user preference
shaping an agent's whole design; its gaps are a fragile Thursday, advice
that stops one step short of action, and two small hygiene debts.
Highest-value next action: **the catch-up window** (plan item 1) — one
condition change that stops a slept-through Thursday costing the week's
shop.
