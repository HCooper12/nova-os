# 01 — Coach (agent + Ask Coach chat lane)

Audited 2026-08-30; double-check pass same day added the coach-apply trace.
Read-only. Files opened this session: `server/lib/coach.js` (full),
`server/lib/coachCadence.js` (full), `server/lib/coachPlan.js` (full),
`server/lib/coachKnowledge.js` (1-151), `server/routes/workouts.js` (120-300,
391-720), `server/lib/claudeCode.js` (30-70, 674-814),
`server/lib/trainingAnalytics.js` (77-196 + prsInSession),
`server/lib/trainOverview.js` (30-100), `server/lib/workoutSessions.js`
(completeSession head).

## 1. What it is (verified)

The strength & conditioning agent — three layers sharing one evidence base:

- **Deterministic engines** (`coach.js`): progression suggestions calibrated to
  Hayden's measured RPE distribution (323 rated sets; RPE 9 is his normal
  working set, so effort alone carries no signal — coach.js:20-37), reading
  objective e1RM trend first (coach.js:58-79, 162-167); his mid-session notes
  suppress load increases and are quoted back (coach.js:152-185, 265-276);
  quality prescriptions instead of load on grinding lifts (187-211); double
  progression (219-229); outgrown-prescription detection for bodyweight moves
  (239-253); deload signal from HRV/sleep with honest thin-data refusal
  (290-312); repeatedly-skipped-work detection (764-790); e1RM trends
  (395-418); deterministic session receipt on the rails, draft or earned-auto
  mode (455-511).
- **Cadence** (`coachCadence.js`): deterministic proactive Telegram messages —
  morning readiness card with block/deload/fuel lines (63-94), weekly fuel
  findings to the Inbox (100-134), missed-session nudge 16:00-19:00 (137-149),
  PR celebration on save (186-199), model-composed session debrief on save
  (155-183). Half-hourly tick, morning window 7-12, once-per-day state in
  `coach-cadence.json`, `NOVA_COACH_CADENCE=off` kill switch (202-259).
- **Ask Coach chat** (`routes/workouts.js:420-666` → `claudeCode.js:716-814`):
  fresh conversations get ~25 deterministically-computed context sections
  (profile, goals, knowledge pages, block, advice outcomes, injuries,
  analytics, exercise library, sessions, e1RMs, progressions split into
  earned/held/outgrown, recovery series + deload, carryovers, nutrition,
  fuel-cross, program review, watch data, weight/sleep/VO2, eating patterns,
  streaks, skipped work with 7-day raise memory, tunes, preferences, standing
  rules, org, skills, fleet). Failed sections are NAMED to the model
  (workouts.js:441, 657-661). Read-only tools plus web (claudeCode.js:38-42,
  729-730), model pinned via `modelFor('coach')` (claudeCode.js:738-744),
  streamed output, warm process pool (44-58). The model may end with ONE
  `PROPOSE {json}` line — parsed (coach.js:540-561), validated against the
  real library/routines with honest errors (565-703), filed as an
  always-review-gated pending record (`mode: 'review-all'`, 708-733); ten
  action types incl. tune/injury/goal/learn/resource/block.

- **Plan-change applier** (`coachPlan.js`): the only code that mutates
  routines — seven typed ops (swap/add/remove/prescribe/remap/new-exercise/
  weighted-variant, coachPlan.js:67-87); the deterministic path (he confirms
  as-is) maps a structured fix to ops with no model (`opsFromFix`, 257-268,
  deliberately refusing set-cuts a model shouldn't silently make); the amend
  path (he typed a note on APPLY) hands his words + the real plan to a pinned,
  read-only, ops-only model job (276-352). Every application snapshots prior
  entries per routine and returns full undo (routines + markers + created
  exercises, 105-253). COACH markers are presentation metadata in
  `server/data`, never program truth (35-59).
- **Analytics engines** (`trainingAnalytics.js`, all consumed via
  `analyticsContext` into the chat context and cadence): plateau detection
  with anomaly exclusion and ≤0.5%-gain flatness test (77-106); RPE drift
  (112-134); weekly hard-sets per muscle excluding warm-ups and Mobility
  (160-180); deterministic program-coherence audit (187+). Readiness score
  0-100 with honest `basis` naming what it's built from
  (trainOverview.js:42-63); deterministic daily focus with a coaching
  priority order, meaningful-or-absent (trainOverview.js:70-99).

Output surfaces: progression + focus + coachAdded annotations on
GET /workouts/routines (workouts.js:141-172); Inbox records; Telegram; the
Workouts screen chat (client rendering [Inferred] from the route shapes —
screens audited separately at item 46).

## 2. Current workflow, traced

One real day: he logs a Push session → POST /workouts/sessions
(workouts.js:272-297) → `completeSession` writes the vault file under a write
lock with local-date stamping (workoutSessions.js) → PRs computed synchronously
so the save response can celebrate instantly → `draftSessionSummary` files the
receipt on the rails (draft by default; auto mode files + Telegrams, falling
back to a pending draft on error — coach.js:501-509) → `celebratePRs` Telegrams
any PRs → `sessionDebrief` builds a fact sheet (every set, his notes, pain
flags, cut-short reason, previous volume) and has the model react via Telegram,
logged to spokenLog (coachCadence.js:155-183, claudeCode.js:617). Next morning
7-12: readiness card with deload verdict and the top fuel-cross finding. If he
asks Coach "how's my bench" mid-session, the live session state rides the
prompt (coach.js:519-530) and a deterministic panel is inferred from the
question, never by the model (claudeCode.js:771-783).

Failure modes, as they degrade today:
- Context section throws → named in a NOTE the model must not blame on thin
  logging (workouts.js:657-661). **Honest.**
- PROPOSE drifts into prose → caught, stripped, honest "ask again" line
  (coach.js:544-553, claudeCode.js:764-766). **Honest.**
- Proposal fails validation → honest inline error (claudeCode.js:761-763). **Honest.**
- Deload signal under-data → refuses with counts (coach.js:296-298). **Honest.**
- Telegram unconfigured → every cadence send silently returns false, nothing
  is marked sent, and no surface ever says the cadence is mute
  (coachCadence.js:37-42). **Silent absence.**
- Duplicate/replayed save POST → `completeSession` mints a fresh UUID with no
  idempotency check, so the session double-writes (double volume, streak, PR
  history), and `celebratePRs`/`sessionDebrief` have no once-per-session guard
  (unlike morning/missed) so both re-fire. Trigger via retry/outbox replay is
  [Inferred]; the absence of guards is verified. **Silent corruption.**
- Multi-op plan change fails mid-list → `applyOps` writes each routine as it
  goes (coachPlan.js:136-240); an op that throws at position N leaves ops
  1..N-1 applied, and both callers' error paths (`startCoachAmend`
  coachPlan.js:344-347; the coach-apply route [Inferred] from its 400 shape)
  file no record and no undo — even though the rollback snapshots (`touched`)
  already sit in memory. **Torn write, no receipt — a one-way door in the
  failure path.**
- Resumed chat (days old) → volatile picture recomputed via `coachLiveLine` +
  capability reminder (workouts.js:429-437, claudeCode.js:705-714,
  coach.js:314-339) — but only date/recovery/deload/last-session/streak;
  everything else stays frozen at turn 1. **Partially honest.**

## 3. Pros — what genuinely works

- **The progression engine is the best evidence-discipline pattern in the
  fleet.** Thresholds measured from his real log, not textbook defaults
  (coach.js:20-37); the metric chosen after a real false-regression on his own
  data (58-67); his own sentences outrank numbers and are quoted back
  (152-185); a guard against advice that reads as nonsense (191-195). Name it
  as a rail: *measured-on-his-data-first* — any future detector should be held
  to this standard (memory rule "run detectors on real data first" made code).
- **Named-failure context assembly** (workouts.js:441, 657-661) is honest
  degradation done properly and should be the template for every model lane.
- **The proposal rails are doctrine rules 1/2/6 in miniature**: model decides,
  code validates against reality, always review-gated, receipts + undo, and
  the advice-outcome loop (coach.js:741-752) holds the Coach to what happened
  to its own advice using existing records — no new store.
- **The ops vocabulary is the right shape for model-mediated writes**: "a
  change you cannot express in these does not happen" (coachPlan.js:291), an
  empty array is a legitimate answer (300), and `opsFromFix` deliberately
  refuses to automate set-cutting decisions that are his to make (265-267).
  The restraint is as good as the capability.
- **The resumed-turn fixes** (coachLiveLine, COACH_TURN_REMINDER with exact
  JSON syntax) each encode a real production failure and its lesson in place.
- **Cadence is deterministic, costed at zero, kill-switched, and
  once-per-day** — the right way to speak first.

## 4. Cons and gaps (ranked by real-life cost)

1. **No idempotent session save + unguarded event sends.** A replayed or
   double-tapped save corrupts the training history every engine above reads,
   and double-Telegrams. Verified: no dedupe in `completeSession`; no
   per-session guard in `celebratePRs`/`sessionDebrief`.
2. **`applyOps` is not atomic and its failure path files nothing.** A multi-op
   plan change that throws mid-list leaves the program half-changed with no
   receipt and no undo (coachPlan.js:136-240, 344-347) — the one place Coach
   actually mutates his program is the one place a failure becomes a one-way
   door. The rollback data already exists in memory (`touched`).
3. **Resumed conversations reason from a stale deep picture.** New injuries,
   declined proposals, changed tunes, and fresh progressions since turn 1
   never reach a days-old session (workouts.js:429-437). The prompt says
   "trust it over stale pages" (claudeCode.js:699) — pointed at exactly the
   wrong thing once the conversation ages.
4. **Cadence leaves no receipts.** Morning card, missed nudge, and PR
   celebration go straight to Telegram; only the debrief logs to spokenLog.
   The rails — and therefore fleetContext, Ops, and every other agent — are
   blind to Coach's most visible daily behaviour. Doctrine rule 6 tension.
5. **The RPE-tuned path goes silent exactly where the default path coaches.**
   `model:'rpe'` skips entirely when top RPE > 8 (coach.js:118) — no quality
   hold, no tempo prescription. His most deliberately-tuned lifts get *less*
   coaching on grind days than untuned ones (187-211 shows what they should get).
6. **Skipped-work raise-memory burns before delivery.** The 7-day cooldown
   marker is written during context assembly (workouts.js:615), before the
   model has answered; a failed job consumes the window silently.
7. **Telegram-unconfigured cadence is invisible.** Armed-but-mute forever,
   with no honest line anywhere (coachCadence.js:37-42).

## 5. Mission test

Coach passes decisively on both axes — it is the most load-bearing agent in
the platform, and it earns its keep at every cadence. **Daily:** the specific
load/reps he lifts (prefilled progressions, quality holds), whether he trains
at all (16:00 missed nudge), and how hard (morning deload advisory).
**Weekly:** muscle-volume vs targets, the Monday program audit, fuel-cross
findings, and skipped-work conversations reshape the week's plan. **Monthly:**
training blocks, plateau detection over ≥21-day windows, and e1RM direction
drive prescription changes. **Long-term:** the approval-gated What Works For
Hayden client file and progression tunes mean corrections given once hold
forever — the platform's clearest compounding asset. The audit found nothing
here that merely displays.

## 6. Improvement plan (ranked)

Change types (cap lifted per standing correction 4): items 1, 2, 3, 6, 7
REFINE existing behavior; items 4, 8, 9 ADD capability on existing rails;
item 5 closes a CAPABILITY GAP between the two progression models. The
agent's capability surface is already the fleet's largest — the additions
below extend signals it already computes, not new domains.

1. **[Refine] Idempotent save + once-per-session event guard.**
   - **Need:** a retried save must never corrupt the history every engine reads
     or double-ping him.
   - **Proposal:** client-minted session id (or `dedupeKey` of
     date+routineId+set signature) checked inside `completeSession`'s existing
     write lock — a duplicate returns the existing session honestly.
     `celebratePRs`/`sessionDebrief` record the session id in
     `coach-cadence.json` (extending the existing `markSent` rail) and skip
     seen ids.
   - **Doctrine:** rule 7 (`dedupeKey` is the named contract — extend it, don't
     invent a sibling), rule 4 (a dedupe hit answers honestly, not silently).
     Screened against: silent cap (the dedupe response says so), parallel rail
     (reuses markSent + dedupeKey idioms).
   - **Failure modes:** state file unreadable → fail open to sending once (a
     duplicate ping beats a swallowed PR); lock contention already handled.
   - **Impact/effort:** H / M — protects the single source of training truth.
   - **Verification:** regression test replaying the same payload twice; then a
     live double-POST against a scratch-vault server (never the live vault —
     standing rule), reading the vault file count and Telegram log.
2. **[Refine] Atomic `applyOps` with failure-path receipts.**
   - **Need:** a half-applied program change must never exist — the vault's
     program is the truth every session and engine reads.
   - **Proposal:** on a mid-list throw, restore every touched routine from the
     `touched` snapshots already held in memory (coachPlan.js:124-130), clear
     any markers set, remove created exercises, then rethrow — turning a torn
     write into a clean, honestly-reported no-op. Smallest honest fix; no new
     structure.
   - **Doctrine:** rule 2 (no one-way doors — this closes the failure-path
     hole in an otherwise exemplary undo design); rule 4. Screened against:
     parallel rail (reuses the existing snapshot/undo shapes).
   - **Failure modes:** rollback itself fails → file an error record naming
     exactly which routines may be inconsistent, so the damage is visible.
   - **Impact/effort:** H / L — the data to fix it already exists in the
     function.
   - **Verification:** unit test injecting a failing op at position 3 of 5,
     asserting the vault routines byte-match their prior state; run against a
     scratch vault, never live.
3. **[Refine] Resumed-turn context delta.**
   - **Need:** a days-old Coach chat must see what changed since turn 1.
   - **Proposal:** extend `coachLiveLine` (the existing rail, coach.js:320-339)
     with deterministic deltas: open injuries, tunes, proposal outcomes ≤7d,
     current earned/held progression keys. ~8 lines, local files only.
   - **Doctrine:** rules 1 and 4; screened against confident guess (all
     computed) and parallel rail (same function, same call site).
   - **Failure modes:** each sub-read already try/caught with a named FAILED
     line (coach.js:332, 337) — extend the same pattern.
   - **Impact/effort:** M-H / L — directly prevents re-arguing declined advice
     and missing new injuries.
   - **Verification:** resume a real conversation on the live server (read-only
     context build), read the emitted live line against the inbox records.
4. **[Add] Cadence receipts + armed-but-mute honesty.**
   - **Need:** proactive sends must be inspectable and fleet-visible.
   - **Proposal:** after a successful `send()`, log morning/missed/PR lines to
     `spokenLog` exactly as the debrief already does (claudeCode.js:617 is the
     named twin) — smallest honest step; a full rails record only if the Ops
     stream needs kind-attribution later. Fold in the armed-but-mute case:
     when the scheduler ticks with `!telegramConfigured()`, beat a distinct
     heartbeat state so Ops can render "cadence armed, no channel" — the
     silent-absence failure mode becomes one honest line.
   - **Doctrine:** rule 6 (receipts); screened against parallel rail (spokenLog
     is the existing channel for spoken/sent lines).
   - **Failure modes:** log write fails → send still stands, catch-and-drop as
     the debrief does.
   - **Impact/effort:** M / L.
   - **Verification:** trigger morningReadiness on the live server in its
     window (it sends a real message he'd see anyway), read spokenLog.
5. **[Gap] Quality path for RPE-tuned lifts.**
   - **Need:** tuned lifts deserve the same hold-and-coach on grind days.
   - **Proposal:** in the `model:'rpe'` branch, when topped out at RPE ≥
     GRIND_RPE with flat/backward e1RM, emit the same `kind:'quality'` object
     the default path builds (coach.js:187-211) instead of `continue`.
   - **Doctrine:** rule 1 (deterministic rule exists — write it); measured-on-
     his-data-first rail (reuses the calibrated thresholds).
   - **Failure modes:** no RPE logged → existing honest skip stands.
   - **Impact/effort:** M / L.
   - **Verification:** run the engine against his real logged sessions
     (read-only) and diff suggestions before/after; regression test named for
     the gap.
6. **[Refine] Move the skipped-work raise-marker into `finishTurn`.**
   - **Need:** the cooldown must track what he actually saw.
   - **Proposal:** pass the candidate exerciseId through the job and write the
     marker on `status:'ready'` in `finishTurn` (claudeCode.js:748-790, the
     existing post-processing rail).
   - **Doctrine:** rule 4; screened against silent cap.
   - **Impact/effort:** L-M / L.
   - **Verification:** kill a coach job mid-run on a scratch server, confirm
     the marker file is unchanged.
7. **[Refine] File-then-record ordering in the auto session receipt.**
   - **Need:** an auto-filed receipt must never be able to double-file.
   - **Proposal:** in `draftSessionSummary`'s auto branch (coach.js:501-509),
     the journal write (`fileDecision`) succeeds, Telegram fires, and only
     then does `updateRecord` flip the record to filed — if that last step
     throws, the catch falls back to a PENDING draft whose later approval
     files the same receipt into the journal a second time. Reorder: flip
     the record first (or, on updateRecord failure after a successful file,
     mark the record `error` naming the torn state) so approval can never
     re-run a write that already happened.
   - **Doctrine:** rules 2, 4; screened against one-way door (this closes a
     duplicate-write door, not opens one).
   - **Failure modes:** record flip fails before filing → degrades to
     today's pending-draft behavior, which is then safe.
   - **Impact/effort:** M / L.
   - **Verification:** unit test injecting an updateRecord failure and
     asserting no path leads to two journal entries; scratch-vault replay.
8. **[Add] Resting heart rate in the deload signal.**
   - **Need:** the deload advisory reads HRV and sleep but ignores the third
     classic overreach signal already sitting in the same loaded days —
     elevated RHR (coach.js:290-312 uses hrv/sleepAsleepMinutes only;
     restingHeartRate is loaded and displayed but never computed on).
   - **Proposal:** add an RHR-elevated condition (recent avg vs baseline,
     threshold tuned on his real history first — the *measured-on-his-data-
     first* rail) with the same honest thin-data refusal and a reason string
     naming the numbers.
   - **Doctrine:** rule 1; standing memory rule (run detectors on real data
     before shipping — pick the threshold so historical fire-days line up
     with days he actually felt run-down, not a textbook cutoff).
   - **Failure modes:** under data threshold → existing honest refusal path.
   - **Impact/effort:** M / L.
   - **Verification:** replay against his full health history counting
     would-have-fired days; unit tests per threshold branch.
9. **[Add] Active-injury line on the morning readiness card.**
   - **Need:** a moderate/serious open injury should meet him at the moment
     he plans the session, not only inside a chat he may not open
     (morningReadiness composes routine/block/deload/fuel — no injury read,
     coachCadence.js:63-94).
   - **Proposal:** one line when an open injury of severity ≥ moderate
     exists and today holds a session: "Open injury on file: <area>
     (<severity>) — train around it." from the existing injuryLog. Silent
     otherwise; niggles stay chat-only to keep the card lean.
   - **Doctrine:** rules 1, 4; screened against nagging (severity gate,
     training days only).
   - **Failure modes:** injury read fails → no line, as with every optional
     card section.
   - **Impact/effort:** M / L.
   - **Verification:** unit test with a fixture injury; live card compose on
     a scratch server.

## 7. UI recommendations

Coach's output lands on the Workouts COACH chat, session-view chips, Inbox
cards, and Telegram (chip rendering [Inferred] from route shapes; the screens
get their own audits). Two proposals that survive the dashboard-drift screen:

- **Cadence lines in the Ops/Stream feed** (follows from plan item 3): the
  morning card visible in-app means a missed Telegram doesn't mean a missed
  readiness verdict — what he does differently: adjusts the day's session from
  the app when Telegram is buried.
- **Honest under-informed marker in chat**: when the failures NOTE is non-empty,
  the reply carries a small "some context failed to load this turn" chip —
  what he does differently: re-asks or distrusts a thin answer instead of
  acting on it. (The model is told to say so, but only "if one matters to the
  question" — the chip is the deterministic backstop.)

Nothing else; the surface is already dense with earned, actionable chips.

## 8. Verdict

**Keep as-is / Refine** — the fleet's reference agent; its evidence discipline
should be exported, not changed. Highest-value next action: **idempotent
session save + once-per-session debrief/PR guard** (plan item 1) — it protects
the training truth every other engine reasons from — with **atomic `applyOps`**
(plan item 2) a close second at a fraction of the effort.
