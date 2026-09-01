# 03 — Fuel × Training (kind `fuel-cross`)

Audited 2026-08-30. Read-only. Coverage per standing correction 4 — the full
consumer graph was enumerated (grep on `fuelCross|fuel-cross|crossCheck|
crossContext`) and every hit opened: `server/lib/fuelCross.js` (full, 139
lines), `server/lib/coachCadence.js:100-134` (raiseFuelFindings — read in
item 01), `server/lib/briefDecisions.js` (30-110), `server/lib/inbox.js`
(1136, 1187-1191), `server/lib/findingCards.js` (kind switch),
`server/lib/morningShow.js` (1-30, PRODUCE_KINDS), `server/lib/orgContext.js`
(:67), `server/lib/learning.js` (KIND_LABEL), `server/lib/writeSlices.js`
(24-44), `server/routes/workouts.js` (45-75), `server/routes/snapshot.js`
(:28), `server/test/fuelCross.test.js` (9 tests, all read),
`src/vals/valsRecipes.js` (195-240), `src/screens/Recipes.jsx` (115-135),
`src/vals/valsInbox.js` (340-375), `src/api.js`/`src/App.jsx` (wiring).
Deliberate deferrals: cadence scheduler mechanics were audited at item 01;
the spoken decision queue (briefDecisions) lands at item 05 Dispatch; the
Morning Show beat at items 39/44/47.

## 1. What it is (verified)

The cross-reference agent Hayden called non-negotiable: training program,
goals, rotation, and food log each tell the truth about one thing, and this
lane deterministically checks the JOINS — no model, every number recomputable
(fuelCross.js:1-16).

- **Decision core** (`analyze`, 68-132; pure, 9-test suite): four findings —
  (1) rotation eaten in full undershoots the protein floor by ≥10g → high;
  (2) training days average under floor−15g protein AND no better than rest
  days+5g → high; (3) gain-goal training days ≥250 kcal under target →
  medium; (4) floor missed on ≥60% of ≥5 fully-logged days → medium.
  Honesty thresholds: ≥3 logged days per side before day-type comparisons
  speak; days under 800 kcal excluded as partial logs; missing profile
  targets silence dependent findings (24-26, 41, 91, 117-119).
- **Trigger/cadence:** computed on demand, never cached — GET
  /api/train/fuel-cross (workouts.js:51-56); the coach-cadence morning window
  raises structural findings to the Inbox at most once per week per finding
  key, skipping keys still pending (coachCadence.js:100-134); manual raise
  via POST /train/fuel-cross/raise (workouts.js:65-70).
- **Outputs / where they surface (ten consumers from 139 lines):**
  Coach chat context (`crossContext`, workouts.js:548-553); the morning
  readiness Telegram card's fuel line — high-severity first
  (coachCadence.js:84-90); Inbox records kind `fuel-cross`, mode draft,
  approving = "seen, acknowledged", no vault write (inbox.js:1187-1191),
  7-day time-value expiry (inbox.js:1136); the spoken decision queue with a
  restated question and a drawn card from the finding's data payload
  (briefDecisions.js:44, 58-61; findingCards.js:105-128); the Morning Show
  beat (morningShow.js:52); org context pending-count (orgContext.js:67);
  nightly Coach reflection context (coachReflection.js:68-69); the learning
  loop (learning.js KIND_LABEL); the Recipes screen's TRAINING × FUEL card
  with a "Draft the fix with Coach →" action that opens the Coach chat
  pre-loaded with the finding (valsRecipes.js:210-217, Recipes.jsx:118-128);
  client resync nudges whenever food-log/rotation/recipes/workouts writes
  land (writeSlices.js:33-44).

## 2. Current workflow, traced

A real week: he logs food and trains Mon/Wed/Fri. Wednesday 07:30 tick →
`raiseFuelFindings` → `crossCheck` recomputes from the vault → finding
`training-day-protein` is new this week → an Inbox record files with the
finding's numbers as a data payload. His morning readiness Telegram carries
the line. On the Fuel screen the TRAINING × FUEL card shows the same
sentence; tapping "Draft the fix with Coach →" jumps to the Coach chat with
the finding pre-loaded and asks for a concrete PROPOSE — the finding-to-fix
loop closed in two taps. In the Inbox, approving acknowledges; discarding
asks why with reason chips because fuel-cross counts as coach advice
(valsInbox.js:348-360). Unactioned records expire after 7 days rather than
rot (inbox.js:1136).

Failure modes, as they degrade today:
- Thin data on either side of a comparison → the finding stays silent, by
  design and by test (fuelCross.test.js). **Honest.**
- Missing profile floor/target → dependent findings silent, tested. **Honest.**
- Partial-log days → excluded at 800 kcal, tested. **Honest.**
- Duplicate raise → weekly cooldown per key + pending-dedupe
  (coachCadence.js:111-112). **Honest.**
- **Any source read fails → `crossCheck` catches to empty/null
  (fuelCross.js:50-59), `analyze` sees no data, returns no findings — and
  every surface renders exactly what "all clear" looks like** (the Recipes
  card hides, crossContext is empty, the morning card has no fuel line).
  "Couldn't check" is indistinguishable from "checked and clean" — the
  precise failure the weekly program audit was built to fix one module over
  (coachCadence.js:229-232). **Dishonest degradation.**
- Declined with a reason → the reason rides the record, and nothing consumes
  it: next week the identical finding re-raises once the 7-day cooldown
  passes. **Capture without consumption.**

## 3. Pros — what genuinely works

- **The purest expression of doctrine rule 1 in the fleet.** A 139-line pure
  decision core, every threshold named and justified in comments, silence
  over noise as a contract, and a 9-test suite exercising exactly the honesty
  rules (thin data, missing targets, partial logs, out-eating earns silence).
  With Coach's *measured-on-his-data-first*, this is the second rail worth
  naming: *the join-checker* — small, deterministic, exhaustively distributed.
- **Best distribution-to-size ratio in Nova**: ten consumers reuse one
  `crossCheck`, always recomputed (no stale-cache class of bug), with
  writeSlices keeping the client picture fresh after every relevant write.
- **The Recipes card's "Draft the fix with Coach →"** converts a finding into
  a Coach proposal in two taps — the finding→decision→change loop actually
  closes, which is what separates this from a dashboard line.
- **The finding data payload draws** (findingCards.js) — the spoken brief
  shows the numbers it speaks, honouring the "show what it says" rule.
- **Decline-asks-why** on its Inbox records (valsInbox.js:348-351) — the
  advice pattern extended to a deterministic agent's findings.

## 4. Cons and gaps (ranked by real-life cost)

1. **Source failure reads as all-clear** (fuelCross.js:50-59 + every
   consumer's empty-state). The agent whose header promises "no finding is
   ever padded in" has the inverse hole: a broken food-log read silently
   produces a clean bill. Both axes: general honesty, and mission (he eats
   as if the check passed).
2. **Goal coverage is asymmetric — cut goals are invisible.** Only
   `goalWantsGain` exists (30-32); the kcal join fires solely for gain goals
   (102). On a cut, rest-day overshoot or a week averaging above target —
   the exact joins that sink a cut — produce nothing. The agent checks the
   goal he had, not any goal he might set. Mission axis, monthly.
3. **No persistence memory.** `fuelRaised` already stores when each key was
   last raised (coachCadence.js state), but findings never say "third week
   running" and severity never escalates — a structural join can stay red
   forever at the same volume. Mission axis: the monthly/long-term signal is
   computed, then thrown away weekly.
4. **Decline reasons are captured and consumed by nothing.** The why-chips
   feed the record; `raiseFuelFindings` re-raises the identical finding a
   week later regardless, and fuel-cross isn't in Coach's `adviceContext`
   COACH_ROUTES (coach.js:743), so even the Coach never sees his stated
   objection to a fuel finding.
5. **`floor-most-days` carries no data payload** (122-127 vs 78-84) — the
   one finding that can't be drawn in the brief; it falls back to a generic
   list card (briefDecisions.js:58-61). Inconsistent with the show-what-it-
   says rule.
6. **The Recipes card shows only `findings[0]`** (valsRecipes.js:211) with no
   hint others exist; the Inbox fuel-cross card lacks the draft-fix action
   the Recipes card has (verified absent in valsInbox's record mapping).

## 5. Mission test

**Daily: earns its keep** — the morning Telegram fuel line and the Fuel
screen card change what he eats before the day's misses happen, sited exactly
where eating decisions are made. **Weekly: earns its keep** — structural
findings become Inbox decisions once per week, and the draft-fix action
converts them into program/rotation changes. **Monthly/long-term: currently
contributes nothing** — no finding history, no persistence, no trend; a join
that has been red for six weeks reads identically to one that went red
yesterday, and a closed join is never celebrated as closed. Plan items 2-3
are the mission-cadence fixes.

## 6. Improvement plan (ranked)

Change types: items 1, 4, 5 REFINE existing behavior; items 2, 3 ADD joins/
capability on the existing core; item 6 is a flagged ADD candidate.
Capability-gap note: no model is proposed anywhere — every gap here has a
writable rule, so deterministic wins throughout (doctrine rule 1).

1. **[Refine] Honest source-failure reporting.**
   - **Need:** "couldn't check" must never render as "all clear".
   - **Proposal:** `crossCheck` returns `sources: {sessions, foodLog,
     recipes, goals, rotation}` marking each ok/failed (the catch sites
     already exist, 50-59); `crossContext` opens with a one-line warning when
     any failed; the Recipes card and morning line render "fuel cross-check
     couldn't run (food log unreadable)" instead of hiding; `raiseFuelFindings`
     skips raising on failed sources rather than concluding cleanliness.
   - **Doctrine:** rule 4; the program-audit "checked-and-clean vs quietly
     broken" lesson applied to its neighbour. Screened against silent cap.
   - **Failure modes:** the sources map is built from the same try/catches —
     nothing new to fail.
   - **Impact/effort:** H / L.
   - **Verification:** unit test with a throwing loader asserting the failed
     flag and the warning line; live GET against the real vault confirming
     `sources` all-ok today.
2. **[Add] Cut-goal joins.**
   - **Need:** the agent must check the joins for whatever goal he actually
     has, not only gain.
   - **Proposal:** `goalWantsCut` (diet/cut/lean/lose/deficit regex) mirroring
     `goalWantsGain`; two findings: training-week average kcal ≥250 over
     target on a cut (medium), and rest days out-eating training days by
     ≥300 kcal on a cut (medium). Same MIN_LOGGED_DAYS/partial-log honesty
     bars; same pure-core tests.
   - **Doctrine:** rule 1; *run detectors on real data first* (standing
     memory rule): before shipping, run against his real log and read what
     fires.
   - **Failure modes:** no goal text → both regexes false → silence, as now.
   - **Impact/effort:** M-H / L.
   - **Verification:** pure-core tests per threshold + a live crossCheck read
     with his current goal.
3. **[Add] Persistence tagging on findings.**
   - **Need:** "how long has this been true" is the difference between a blip
     and a pattern — the monthly signal the mission asks for.
   - **Proposal:** `raiseFuelFindings` keeps per-key raise history (extend
     the existing `fuelRaised` map to an array of dates — same file, same
     rail); findings raised ≥3 consecutive weeks append "— Nth week running"
     to the line and lift severity one step. A key that stops firing after
     ≥2 weeks red earns a one-time "closed: <finding> no longer true" record
     — the win receipt.
   - **Doctrine:** rules 1, 6 (the win receipt is a receipt); screened
     against parallel rail (extends coach-cadence.json, no new store).
   - **Failure modes:** state unreadable → treat as first raise (degrades to
     today's behavior).
   - **Impact/effort:** M / L.
   - **Verification:** unit tests on the history logic; inspect
     coach-cadence.json after a live raise.
4. **[Refine] Consume decline reasons.**
   - **Need:** a reasoned "no" must change what happens next week.
   - **Proposal:** `raiseFuelFindings` checks the most recent discarded
     record per key: declined-with-reason → cooldown extends to 28 days
     unless the finding's numbers have materially moved (>15% on its primary
     metric); and add `fuel-cross` records to the Coach's advice-outcome
     query so his stated reason rides Coach context (extend COACH_ROUTES
     handling in coach.js:741-752 — kind-based, one line).
   - **Doctrine:** rule 6 (his word is on record — honour it); the Coach's
     declined-proposal etiquette extended to its sibling.
   - **Failure modes:** no reason recorded → current 7-day behavior stands.
   - **Impact/effort:** M-H / L-M.
   - **Verification:** unit test the cooldown branch; live check listRecords
     for a real declined fuel-cross record and the computed next-raise date.
5. **[Refine] Data payload for `floor-most-days`.**
   - **Need:** every spoken finding should draw its own numbers.
   - **Proposal:** add `data: { kind: 'floor-pattern', under, of, floor }`
     (122-127) and the matching findingCards case, shaped like its three
     siblings.
   - **Doctrine:** the show-what-it-says rule (nova-visuals-always).
   - **Impact/effort:** L-M / L.
   - **Verification:** findingCards unit test + brief render against a
     constructed record.
6. **[Add, flagged] Protein-timing join (pre/post-training).**
   - **Need:** *when* protein lands on training days is the next real join;
     foodPatterns already knows his day starts at 13:30.
   - **Proposal:** join session `finishedAt` times with food-entry times to
     flag "training days where <25g protein landed within 3h of the session".
     [Assumed] food-log entries carry usable timestamps — verify before
     committing; if they don't, this waits, honestly, rather than guessing
     from day-level totals.
   - **Doctrine:** rule 1; confident-guess screen is the reason for the
     assumption flag. **Impact/effort:** M / M.
   - **Verification:** feasibility read of foodLog entry shape first; then
     real-log run per the standing memory rule.

## 7. UI recommendations

Where output lands: Recipes TRAINING × FUEL card, morning Telegram line,
Inbox record card, spoken brief card, Coach context. Screened for dashboard
drift:

- **Failure state on the Recipes card** (supports plan 1): when sources
  failed, show the card with "couldn't check today — <source> unreadable"
  instead of hiding. What changes: he fixes the source or distrusts the
  silence, instead of reading absence as a clean bill.
- **Inbox fuel-cross card gains "Draft the fix with Coach →"** (parity with
  the Recipes card, verified absent): the place he reviews findings weekly
  becomes a place he can act on them in one tap. What changes: findings
  reviewed in the Inbox convert to proposals at the same rate as ones seen
  on the Fuel screen.
- **"+N more" chip on the Recipes card** when `findings.length > 1`, opening
  the remaining lines inline. What changes: a second high finding stops
  being invisible behind the first.
- **Persistence badge** ("3rd week" — supports plan 3) on both the Recipes
  and Inbox cards. What changes: he prioritises the chronic join over the
  new blip.
- **Aesthetics/accessibility:** the card is coherent with the HUD token
  system (nv-vi accent, mono microlabel) and the action is a proper
  Interactive with hover state; no changes proposed — the surface is already
  minimal and honest. Long-press: none needed; the card has exactly one
  action.

## 8. Verdict

**Keep as-is / Refine** — the fleet's model join-checker; its size,
honesty-tested core, and distribution should be the template for every future
cross-domain agent. Highest-value next action: **honest source-failure
reporting** (plan item 1) — the one place this agent can currently lie, in
the direction that costs the mission most.
