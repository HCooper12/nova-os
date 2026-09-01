# 07 — Training Check

Audited 2026-08-30. Read-only. Files opened this session:
`server/lib/trainingCheck.js` (full, 113 lines), `server/lib/streaks.js`
(1-40), consumer greps opened: inbox.js:1136 (48h time-value expiry),
guardian.js:160 (2h heartbeat cadence watch), learning.js (KIND_LABEL
'training checks'), openLoops.js:11 (excluded from loop-nagging),
push.js:105, valsInbox.js:16 (TRAINING chip), fleetContext/ops/autonomy
(kind registration), dispatch.js:119-126 (the shared active-rest reader
note). Related-but-separate: Coach's missedSessionNudge (16:00-19:00
Telegram rescue, audited at item 01) — the two are complementary layers
(rescue before, reconcile after), not duplicates.

## 1. What it is (verified)

The evening reconciler: from 19:00, once per day, code cross-checks the
Train schedule AND the calendar against what's actually logged; when a
workout was planned but nothing's in Train, it files a pending Inbox
question — "Did ${plannedName} happen today?" (trainingCheck.js:9-27,
77-95). Approve journals a reconciliation line (undoable, category
training); dismiss means didn't-happen/swapped-for-active-rest. Fully
deterministic, no model. Details:

- Schedule read shares the active-rest disambiguation contract with the
  briefs (37-40, noted twin at dispatch.js:119-126).
- Calendar workouts matched by keyword regex (`WORKOUT_RE`, :15).
- Mismatch labelling: on-calendar-but-not-Train and vice versa (64-66).
- Carry-over awareness: names waiting debt, or points at Train's
  push-forward flow (70-75).
- Once-a-day guard by record kind + local date (25-28); `>= 19` not
  `=== 19` with the tick-drift lesson in a comment (98-100); hourly tick,
  heartbeat watched by Guardian at a 2h cadence.
- 48h time-value expiry keeps stale questions out of the queue.

## 2. Current workflow, traced

A real evening: Push was scheduled, he trained at a mate's gym and never
logged it. 19:00 tick → no check yet today → schedule says Push, sessions
show nothing today, calendar had "Gym 6pm" → record files: "Did Push happen
today?" with the schedule/calendar picture and the carry-over line. He
approves → a journal line "Training reconciled 2026-08-30: completed Push
(confirmed from the schedule)." files with undo. If he swapped it for a
walk, he dismisses; if he ignores it, the question expires in 48h.

Failure modes, as they degrade today:
- Already logged / nothing planned → skips silently, correct (54-57).
  **Honest.**
- Calendar read fails → proceeds on schedule alone (49-52). **Honest.**
- Workout-data read fails → returns `{skipped: 'no workout data'}` — the
  scheduler discards the return, nothing logs, nothing surfaces: a broken
  vault read produces the same silence as a clean rest day. The [03]
  couldn't-check-vs-clean conflation, in its fourth home. **Silent.**
- Evening session still ahead → the check fires at 19:00 regardless of the
  calendar event's time; a 20:30 session gets asked about before it happens
  (50-51 never compares `calWorkout.time` to now). **Wrong question,
  honestly asked.**
- Regex false positives → `WORKOUT_RE` (:15) matches `\bsession\b` and
  `\bback\b` — "Therapy session" or "Back-to-school night" on the calendar
  would trigger "Did Therapy session happen today?" as a workout.
  [Inferred: depends on his real event names — exactly why the standing
  rule says run detectors on real data.] **Plausible false fire.**
- Approve → journal line only. `computeStreaks` reads sessions exclusively
  (streaks.js:30-37, verified), so a reconciled off-app workout still
  breaks the workout streak the morning brief and missed-nudge quote back
  at him. **The reconciliation doesn't reconcile.**
- Dismiss → a bare discard: didn't-happen, swapped-for-active-rest, and
  doing-it-at-9pm all collapse into one signal, no reason captured, no
  miss recorded anywhere, no carryover proposed. **Lossy.**

## 3. Pros — what genuinely works

- **The right question at the right layer**: deterministic, costs nothing,
  fires only when plan and reality disagree, and silence is the success
  state. With Coach's 16:00 rescue nudge it forms a clean two-stage
  evening: save the session while it's saveable, reconcile it after.
- **Cross-source reconciliation** (schedule + calendar + sessions +
  carry-overs) with mismatch labelling — a small agent that reads four
  truths and names their disagreement.
- **Scheduler hygiene** — the `>= 19` comment, per-day store guard,
  heartbeat-before-work, Guardian cadence watch, and time-value expiry are
  all the platform's best small-agent practices in one place.
- **The carry-over line teaches the rail** — a dismissed session is told
  where recorded training debt lives, so the miss has a path instead of a
  shrug.

## 4. Cons and gaps (ranked by real-life cost)

1. **An approved check doesn't preserve the streak.** Nova confirms he
   trained; every streak surface still says he didn't (verified,
   streaks.js:36). The platform disagrees with its own reconciliation —
   trust cost lands exactly where honesty was the point. General axis.
2. **Dismissal is semantically overloaded and teaches nothing.** Three
   different realities collapse into one discard; no reason, no miss
   record, no proposed carryover. The check reconciles the day but the
   *pattern of misses* is invisible to everything downstream. Mission
   axis, weekly.
3. **No miss memory.** Nobody counts scheduled-but-unlogged days per
   weekday — "Thursday sessions die 3 weeks running" is exactly the
   skipped-work signal Coach gets for exercises (coach.js:764-790) and
   never gets for days. Mission axis, weekly/monthly.
4. **Time-blind evening check** — asks about sessions still ahead.
5. **Couldn't-check reads as clean** (43-45) — fourth confirmed site of
   the cross-cutting conflation.
6. **`WORKOUT_RE` is false-positive-prone** (`session`, `back`) and has
   never been validated against his real calendar history.
7. **Workout-streak semantics are broken for any program with rest days**
   (streaks.js:19-27: consecutive *days*, so Push/rest/Pull reads as
   streak 1) — surfaced here because this agent's domain is
   plan-vs-reality; the fix belongs to streaks and benefits the briefs and
   the missed-nudge too.

## 5. Mission test

**Daily: earns its keep** — one honest evening question that keeps the
training record true, which every engine above it (progressions, volume,
debriefs) depends on. **Weekly/monthly: currently contributes nothing** —
misses leave no trace, so the recurring-miss shape of his week is invisible
to Coach, Week Plan, and the debrief. **Long-term:** only via record
accept/skip stats. The mission upgrade is turning reconciliation events
into pattern signal (plan items 2-3).

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 4, 5, 6, 7 REFINE; 2, 3 ADD on existing rails. Nothing to
remove — the agent is lean and every line pays.

1. **[Refine] Approved checks preserve the streak.**
   - **Need:** the platform must not contradict its own reconciliation.
   - **Proposal:** `computeStreaks` unions session dates with dates of
     FILED `training-check` records (a deterministic read off the rails;
     one Set union at streaks.js:36). The morning brief, missed-nudge, and
     weekly review all inherit the fix for free.
   - **Doctrine:** rules 1, 3 (the record IS the truth he confirmed);
     screened against parallel rail (reads existing records, no new store).
   - **Failure modes:** records unreadable → falls back to sessions-only,
     today's behavior.
   - **Impact/effort:** M-H / L.
   - **Verification:** streaks unit test with a filed-check fixture; live
     computeStreaks against his real records.
2. **[Add] Dismiss-with-reason, consumed.**
   - **Need:** three realities need three signals, and each needs a
     consumer.
   - **Proposal:** why-chips on the training-check card (didn't happen /
     swapped for active rest / doing it tonight / logged elsewhere).
     Consumers, wired same change: "swapped" journals an active-rest line
     (undoable); "tonight" suppresses nothing but re-arms tomorrow's
     carry-over line; "didn't happen" feeds item 3's miss ledger. The
     why-chips rail exists (valsInbox advice set — third kind added this
     audit after 02's review and 06's plan).
   - **Doctrine:** rules 1, 6; [03] capture-without-consumption screen
     passed (every chip has a named consumer).
   - **Impact/effort:** M-H / M.
   - **Verification:** chip-path unit tests; scratch-server dismiss flows.
3. **[Add] Miss memory — the skipped-days detector.**
   - **Need:** recurring miss-days are the highest-leverage weekly
     training signal the fleet doesn't have.
   - **Proposal:** deterministic count of scheduled-but-unreconciled days
     per weekday over the last 4 weeks (sessions + filed checks both count
     as done); ≥2 misses on the same weekday → one context line for Coach
     and Week Plan ("Thursday sessions have missed 3 of the last 4 —
     schedule or life?"), the exact sibling of `detectSkippedExercises`
     with the same raise-once cooldown pattern.
   - **Doctrine:** rule 1; *run on his real log first* (tune thresholds so
     historical fires match real patterns, not noise).
   - **Impact/effort:** H / M.
   - **Verification:** pure-function tests; replay over his real
     schedule + session history counting would-have-fired weeks.
4. **[Refine] Time-aware check.**
   - **Proposal:** when the matched calendar workout's start time is later
     than now, skip this tick (the next hourly tick after it ends asks);
     cap at 21:30 so a late event still gets asked about before the 48h
     expiry window makes it stale.
   - **Doctrine:** rule 4 (don't ask a question the day hasn't answered).
   - **Impact/effort:** M / L.
   - **Verification:** unit tests around the time compare; scratch run.
5. **[Refine] Honest couldn't-check.**
   - **Proposal:** on the workout-data load failure, log with the reason
     and let the Ops/loops status carry "last check: couldn't run
     (<reason>)" — the same one-line honesty the [03] fix gives fuelCross.
   - **Impact/effort:** L-M / L.
6. **[Refine] Validate + tighten `WORKOUT_RE` on his real calendar.**
   - **Proposal:** replay the regex over his event history; drop or guard
     the over-broad tokens (`session`, `back`) based on what actually
     appears; add the regression test naming any real false positive
     found.
   - **Doctrine:** standing memory rule (detectors on real data first).
   - **Impact/effort:** M / L.
7. **[Refine] Schedule-aware workout streak** (home: streaks.js; raised
   here, benefits briefs + missed-nudge + weekly review).
   - **Need:** a streak that resets on every rest day measures nothing he
     controls.
   - **Proposal:** count consecutive *scheduled* training days completed
     (sessions ∪ filed checks), skipping rest/active-rest days — "5
     scheduled sessions in a row" is the metric a coach would actually
     quote. Keep the old daily streak for steps/sleep where daily is real.
   - **Doctrine:** rule 1; prefer the measurable-and-meaningful.
   - **Impact/effort:** M-H / M.
   - **Verification:** unit tests against his real schedule shape; replay
     over session history to sanity-check the numbers quoted.

## 7. UI recommendations

Where output lands: the Inbox training-check card (TRAINING chip), the
journal line, and — indirectly — every streak surface. Screened against
dashboard drift:

- **Why-chips on the card** (plan 2): one tap per reality. What changes:
  his dismissals start steering carry-overs and the miss ledger instead of
  evaporating.
- **"Log it now" deep-link on the card**: approve says "it happened" but
  the highest-fidelity outcome is a real logged session — a second action
  ("Open Train to log it") next to Approve routes to the session editor.
  What changes: reconciliations become real data when he has two minutes,
  keeping the progression engines fed. (The card currently offers only
  approve/dismiss — verified in the record shape; rendering confirmed at
  item 48's pass.)
- **Miss-pattern line lands in existing surfaces** (plan 3): Coach chat
  and Week Plan context — no new screen, deliberately.
- **Accessibility:** chip targets ≥40px at phone width when built; verify
  at ~375px per standing rule.

## 8. Verdict

**Refine** — a lean, honest reconciler whose answers currently vanish into
a journal line while the platform's streaks and patterns ignore them.
Highest-value next action: **approved checks preserve the streak** (plan
item 1) — one Set union that stops Nova contradicting its own
reconciliation everywhere streaks are quoted.
