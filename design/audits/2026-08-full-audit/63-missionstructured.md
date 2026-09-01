# 63 — MissionStructured (the Apple layout)

Audited 2026-09-01. Read-only. Files opened:
`src/screens/MissionStructured.jsx` (1-294, full);
MissionControl.jsx:76-77 (the switch); the shared view model
(valsMission.js) audited at 06 — this item judges the bones, not the
data. Phone-width carried ([45]).

## 1. What it is (verified)

Mission Control rendered as a grouped Apple-style stack — "same view
model as the classic screen" (11-16), selected by `v.structured` at
MissionControl.jsx:77. **One view model, two renderers: the doctrine-
clean way to ship a layout variant** — no parallel rail, no second data
path, "identical data and actions, different bones."

Its one original idea: **the day decides the order** (257-263).
Morning (<10h): vitals lead — "the body report is the news." Midday:
Suggested Focus + Today lead — "what to do next is the news." Evening:
focus/plan first, vitals step back. The hero shrinks outside the
morning ("the core keeps its presence, not its acreage", 54). All
deterministic, no model calls.

## 2. Workflow traced

Render computes `hour` → picks one of three order arrays → maps over
`sections`, `.filter(Boolean)` dropping empty groups (no work running →
no WORKING group; no leader idea → no Lead card). Honest states ride
through from 06's view model: plan's classifying line, Today's
stale-label in warn, noticed's live/empty/demo three-way.

## 3. Pros

- **WORKING is first in ALL THREE orders**, with its incident comment
  (93-96): "a book analysis ran 40 minutes with no sign of life
  anywhere: any agent doing work is visible on the home screen,
  always, without him going to look for it." The [24] visibility
  instinct, made a standing layout rule.
- The reorder idea genuinely serves the mission's daily cadence — the
  screen answers a different question at 7am than at 7pm, without a
  model deciding anything.
- aria-labels on the core button and shuffle; safe empty-group
  collapse; mobile column counts handled per group.

## 4. Cons

1. **Three hand-maintained order arrays over one section roster**
   (259-263) — the [22] drift class in miniature. All twelve keys must
   appear in all three arrays; a key forgotten in one time-band is
   silently `.filter(Boolean)`-ed away, so the bug would present as "X
   only disappears in the afternoon" — nasty to spot, trivial to
   prevent (a dev-time assert that each order is a permutation of
   `Object.keys(sections)`).
2. The calCmd input is a bare `<input>` with no focusStyle parity with
   the app's Interactive inputs — cosmetic inconsistency.
3. The 10:00/17:00 band edges cause a full section reflow on the first
   re-render after crossing — acceptable, noted only.

## 5. Mission test

**Daily: this IS the daily driver** (when the structured layout is
chosen) — and the time-banded ordering is one of the platform's best
mission-alignment ideas: it encodes "what matters right now" without
spending a token or guessing.

## 6. Improvement plan

1. **[Refine — [22] micro]** One-line dev assert that every order
   array covers every section key; the silent-drop class ends.
   **Impact/effort:** M / L.
2. **[Owned]** All data/content findings live at 06 (vitals, focus,
   deck, noticed) and their agent items.
3. **[Empty categories]** No ADD items — a home screen accretes; this
   one's discipline (empty groups vanish, demo strictly gated) is the
   point. No other REFINE found.

## 7. UI recommendations

Plan 2's focusStyle parity for the calendar command input (L). Nothing
else — the dashboard-drift screen is this layout's own design
language: sections that render nothing when there's nothing.

## 8. Verdict

**Keep as-is** — twenty-first clean keep. The variant earns its
existence the right way (shared view model, different bones), and its
one latent defect is a one-line assert away from impossible.
