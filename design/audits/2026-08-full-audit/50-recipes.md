# 50 — Recipes (Fuel)

Audited 2026-08-31. Read-only. Files opened: `src/vals/valsRecipes.js`
(1-240 line-by-line across this pass + item 03; 624 total, remainder
[mapped]), `server/lib/scanFood.js` (the breakdown prompt + compute path
— verifying the context doc's §8 fix), Recipes.jsx 115-135 (03) +
[mapped], modals/sheets [mapped]. Rails audited earlier: rotation/foodLog/
recipes (12/13), fuelCross card (03), USDA compute (here). Phone-width
carried ([45]).

## 1. What it is (verified)

The Fuel screen: the daily rotation (tick-card meal slots that WRITE the
food log), the fuel hero (ring + gap-fill line), the TRAINING × FUEL
card (03), the off-plan log with retro past-day tracking, the recipe
bank with search + FITS filter, the recipe overlay with alternates and
the tweak chat, portion sheet, barcode/photo/spoken food capture.

**Honesty verified line-by-line:**
- **One sum, no double-count**: rotation ticks write log entries
  (source: 'rotation'); consumed slots only count when the log doesn't
  already carry them; the legacy-day back-add is scoped to today and
  documented (76-91).
- **Never invent a floor**: a missing Profile line makes the protein
  target honestly null — "a fictional 180 here once meant the gauge
  tracked a number Hayden never set" (104-107). Demo keeps its scripted
  180 under the banner.
- **FITS from real remaining kcal** — "the genuinely useful question at
  8pm is 'what can I still eat tonight?'" — and the filter is "hidden
  entirely when no target is set (never invent a budget)" (115-121,
  return block).
- **The §8 macro fix, CONFIRMED at the source** (scanFood.js:96-117,
  239-246): "YOUR JOB IS THE BREAKDOWN, NOT THE ARITHMETIC… a remembered
  number is exactly what this replaces" — the twice-asked-pizza incident
  (1050 kcal/50g vs 940/36) documented in the prompt; components looked
  up in USDA FoodData Central and summed BY CODE. Models decide, code
  acts, at the data-entry layer.
- Long-press meal cards for variants/eaten/clear — "direct manipulation,
  never a chat" (spec #13); macro-color discipline (slot hues avoid the
  four macro colors, with the reason); view-transition-name collision
  handling; no serving-scaling for live recipes with the honest reason
  (free-text ingredients).

## 2. Current workflow, traced

Lunch: he ticks the rotation card → the log gains a rotation entry → the
hero climbs and the gap-fill line recomputes ("54g to go — dinner covers
44, the pouch does the last 10"). A servo pie: photo → breakdown →
USDA-computed macros → portion sheet → logged. 8pm: FITS shows only what
the remaining 380 kcal allows. The TRAINING × FUEL card carries the
cross-check's sharpest finding with its draft-fix doorway.

Failure modes: the vals' documented incidents ARE the catalogue — the
fictional floor, the double-count, the remembered macros — each fixed
with its story attached. Remaining gaps are landings:
- [03]'s card items (couldn't-check state, +N more, persistence badge).
- [12]'s suggested-swap chip when the plan runs short.

## 3. Pros / 4. Cons

Pros: the eaten-today truth is ONE computation shared with the home
gauges (ctx.assign — no drift possible); the three data-entry paths all
end in deterministic macros; the 8pm question answered from real
arithmetic; incident-documented honesty throughout.

Cons: only the owned landings above; phone-width carried. Nothing new —
this surface, like Workouts, already renders what its agents need.

## 5. Mission test

**Daily: the nutrition half's Workouts** — logging friction low enough
to sustain (one tick for planned meals, one photo for everything else),
gauges that never lie about targets, and the evening FITS answer. Data
quality protected at entry is why fuelCross/Coach/insight can reason at
all.

## 6. Improvement plan

1. **[Owned]** [03]'s three card items + [12]'s swap chip land here.
2. **[Verify]** phone-width pass (the rotation tick-cards are "the
   action taken 4× a day" — target size matters most here).

## 7. UI recommendations

- **None new.**

## 8. Verdict

**Keep as-is** — thirteenth clean keep; the §8 doctrine fix verified at
its source, and the screen's honesty features all carry their incident
stories. Next action: land [03]'s card items.
