# 13 — Food Scout (kind `food-suggestion`)

Audited 2026-08-30. Read-only. Files opened: `server/lib/foodSuggest.js`
(full, 80 lines), `server/lib/foodHistory.js` (full, 54 lines),
`server/lib/inbox.js` recipe route + undo (567-582, 921), learning/push/
fleet/ops greps. Tests: foodSuggest.test.js (4 tests). Deferrals: Recipes
screen (item 50), Inbox card rendering (48). foodPatterns.js (a different
consumer of the same log) is context for Coach/review, not this agent.

## 1. What it is (verified)

The recurring-food noticer: evenings after 18:00, once a day, deterministic
code finds off-plan foods logged ≥3 times in the last 21 days that are
neither in the recipe bank nor ever previously proposed, and files at most
2 Inbox proposals per run — "Save 'crumpets with Duo Penotti' to your
recipe bank?" with the count and macros in the reason (foodSuggest.js:
10-58). Approval creates a macro-only recipe (route `recipe`, category
ROTATION / SWAP MEALS, undo removes it — inbox.js:567-582, 921). **A "no
thanks" stays a no**: any prior proposal for the same normalized key —
pending, approved, or dismissed — blocks a repeat forever (21-26).
`normalizeName` is deliberately light and documents why quantities stay
distinct ("8 pretzels" ≠ "12 pretzels" — foodHistory.js:4-8). The newest
logging supplies the representative name and macros (17-20). Scheduler:
hourly tick, `>= 18` with the exact-hour-equality lesson documented,
per-day in-memory guard whose loss is harmless because the per-item dedupe
makes extra runs no-ops (61-64), heartbeat `food-suggest`.

## 2. Current workflow, traced

He logs a servo chicken wrap for the third time in two weeks → 18:00 tick
→ recurringFoods returns it (not in bank, never proposed) → one pending
record: "You've logged chicken wrap 3 times in the last few weeks (38P ·
41C · 12F · 430 kcal). Want it saved so it's one tap next time?" →
approve → macro-only recipe in the bank, one-tap loggable and visible to
the FITS filter and meal-prep's regulars line; dismiss → never asked
again.

Failure modes, as they degrade today:
- No recipe file yet → nothing to exclude, proceeds honestly (16-19).
- Restart loses the day-guard → re-run is a no-op via dedupe. **Honest.**
- History read fails → scheduler catch, console, retries next tick with
  the same idempotence. **Honest enough at this size.**
- Same food, drifting scan names → normalizeName absorbs case/punctuation;
  genuinely different names split the count (inherent limit, documented).
- **Dismissed in March, eaten daily in August → permanently invisible**
  (21-26): the no is eternal even when the behavior that earned it has
  reversed. Designed, but unbounded.
- **Newest entry's macros represent the group** (foodHistory.js:17-20): if
  portion sizes varied across the loggings, the saved recipe silently
  inherits whichever was logged last — no flag that the group disagreed.

## 3. Pros — what genuinely works

- **Near-optimal small-agent design**: honest thresholds, anti-flood cap,
  permanent no, rails + undo, documented normalization trade-offs, the
  scheduler-hygiene kit, tests. At 134 total lines this is the fleet's
  cleanest complete loop and needs almost nothing.
- **The loop actually compounds**: real eating migrates into the bank,
  which feeds one-tap logging, the FITS filter, and meal-prep's regulars
  line — a genuine data flywheel with his thumb as the gate.
- **"Never re-proposes" as a first-class contract** — respect for his
  attention encoded structurally, not as a cooldown.

## 4. Cons and gaps (ranked by real-life cost)

1. **The eternal no** — a dismissal never expires and never reconsiders,
   even when his eating has materially changed since. Mission axis,
   long-term: the flywheel has a one-way valve.
2. **Silent portion drift** — macros from the newest entry with no
   variance check; a recipe can be saved with an unrepresentative
   portion's numbers and nothing says so. Honesty axis, small.
3. Nothing else rises to a finding at this size.

## 5. Mission test

**Weekly/monthly: earns its keep** — it converts logged reality into
reusable structure, shaving friction off every future log of a food he
demonstrably eats, and it feeds two other agents. **Daily: n/a by
design.** **Long-term:** the flywheel is real but slightly throttled by
the eternal no (plan item 1). Honest verdict: a small agent doing a small
job very well.

## 6. Improvement plan (ranked; uncapped — the list is short because the
agent is near-optimal, not because effort ran out)

Change types: both REFINE. Rejected candidates: proposing where a food
fits his day (meal-timing context) — drift beyond the save-it question;
raising MAX_PER_RUN — the cap is the feature.

1. **[Refine, gated] Material-change re-proposal.**
   - **Need:** a no should stand until the behavior that earned it
     reverses — not forever after.
   - **Proposal:** a dismissed key becomes eligible again only when BOTH:
     ≥60 days since the dismissal AND the food's count in a fresh 21-day
     window ≥ 2× MIN_COUNT (i.e. he now eats it twice as often as the
     bar that prompted the original ask). The reason names the history:
     "You passed on this in March — it's now 6 logs in 3 weeks, so asking
     once more." Re-proposal capped at once total.
   - **Doctrine:** rule 6 (his word is respected — the re-ask carries the
     receipt of it); screened hard against re-nag (thresholds make it
     rare, the once-more cap makes it finite).
   - **Impact/effort:** M / L.
   - **Verification:** unit tests on the eligibility math; replay against
     his real dismissal + log history to count how often it would ever
     have fired (expect: rarely or never — that's the point).
2. **[Refine] Portion-variance honesty flag.**
   - **Need:** a saved recipe's numbers should confess when the group
     disagreed.
   - **Proposal:** when kcal across the group's entries varies >30%, the
     reason appends "portions varied across your logs — this saves the
     latest (430 kcal)"; payload unchanged.
   - **Doctrine:** rule 4. **Impact/effort:** L-M / L.
   - **Verification:** unit test with a mixed-portion fixture; replay on
     real history to see how often it triggers.

## 7. UI recommendations

Where output lands: one Inbox card. Screened against dashboard drift:

- The card's approve/dismiss is already the whole interaction and the
  reason line already carries count + macros — **no changes proposed**.
  The re-ask receipt (plan 1) rides the existing reason text; the
  variance flag (plan 2) likewise. Adding anything else to a two-button
  card would be decoration.

## 8. Verdict

**Keep as-is / Refine** — the fleet's cleanest complete loop; export its
shape (thresholds + cap + permanent-no + rails + documented trade-offs)
as the template for future noticer agents. Highest-value next action:
**material-change re-proposal** (plan item 1) — it removes the one-way
valve from an otherwise compounding flywheel.
