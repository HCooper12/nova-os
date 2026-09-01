# 02 — Daily Review

Audited 2026-08-30. Read-only. Files opened this session:
`server/lib/dailyReview.js` (full), `server/lib/learning.js` (1-45),
`server/routes/loops.js` (grep: routes 129-146), `src/vals/valsInbox.js`
(465-520), `src/App.jsx` (grep: state/actions), `server/index.js` (scheduler
registration, from item 01's read).

## 1. What it is (verified)

The flagship once-a-day intelligent surface: a model reasons across the whole
life picture through NOVA_LENS and produces a 2-3 sentence honest READ plus
1-3 concrete same-day ADJUSTMENTS (dailyReview.js:23-29, 181-200).

- **Trigger/cadence:** half-hourly scheduler; runs once per day after the
  configured hour (default 8), heartbeats `review`, retries a failed compose
  at most 3×/day (330-346, 223-233). Manual RUN NOW via
  POST /api/daily-review/run (loops.js:146); lane switch-off outranks even a
  forced run (297-302).
- **Inputs:** ~15 deterministically-computed sections — profile, learned
  tendencies, standing rules, morning + evening dispatch composition, recent
  sessions, earned progressions, deload signal, streaks, open to-dos, fitness
  goals, carryovers, bodyweight/sleep-efficiency/VO2 trends, eating patterns,
  week-ahead calendar (event *counts* per day only, 131-140), spaced library
  resurfacing with a widening-gap picker (141-167), month money summary
  (168-175).
- **Model run:** read-only tools, pinned model via `modelFor('daily-review')`,
  $1 budget cap, JSON-only output contract; deterministic code composes the
  final text and caps adjustments at 3 (203-219, 235-251).
- **Outputs:** an inbox record `kind:'review'` — draft mode: pending card he
  approves into the journal (category personal, labelled); auto mode: filed
  with undo + Telegram + push (265-287); off: silent.
- **Where it surfaces:** the Inbox screen's review card (mode toggles, hour
  picker 5-11, RUN NOW, honest status line incl. classifying/pending/filed/
  error — valsInbox.js:475-495); the pending record itself as a normal Inbox
  card; journal after approval; push/Telegram in auto.
- **Learning loop:** his approve/discard decisions on `review` records feed
  kind-level "tends to" stats back into future reviews
  (learning.js:20-33, `KIND_LABEL.review`).

## 2. Current workflow, traced

A real morning: 08:00-08:30 tick fires → no review record today →
`runDailyReview` → `buildReviewContext` assembles the picture (each section
independently) → record created `status:'classifying'` (the Inbox card shows
"Nova is reasoning across your day…") → detached claude job composes JSON →
`composeReviewText` builds "Daily Review — Saturday 30 August" with Read +
numbered Adjustments → draft mode: record flips to `pending`, surfaces as an
Inbox card; he approves → files to journal with undo. Auto mode: filed
directly + Telegram + push, because a flagship read landing silently defeats
its purpose (277-284).

Failure modes, as they degrade today:
- Compose job errors/dies → record flips to `error`; up to 2 more attempts
  today; the Inbox card says "hit an error — try RUN NOW" (288-294, 223-233,
  valsInbox.js:491). **Honest.**
- Server restart mid-compose → boot reaper flips orphaned `classifying` to
  error before schedulers tick (index.js:228-234). **Honest.**
- Model returns junk/empty → thrown ("the review came back empty"), error
  record (210, 263). **Honest.**
- Whole context empty → prompt says "(context unavailable — say so and keep
  it brief)" (198). **Honest.**
- **Any single context section throws → silently vanishes**
  (`add()` is `.catch(() => {})`, dailyReview.js:85). The model cannot
  distinguish "no money logged" from "money section crashed" — and the
  prompt orders it to name gaps honestly, which it now does *wrongly*
  ("no protein logged — can't tell if you skipped or didn't log" when the
  truth is the section failed). **Dishonest degradation** — and the sibling
  lane already solved this exact problem (Coach's named-failures NOTE,
  workouts.js:441, 657-661).
- Duplicate same-day run → `todayReviewRecord` guard (303-304). **Honest.**

## 3. Pros — what genuinely works

- **The orchestration is the cleanest model-lane skeleton in the fleet**:
  review-gated or auto-with-receipts, undo on file, retry-capped, orphan-
  reaped, budget-capped, model pinned, JSON contract with deterministic
  composition, lane switch honoured above `force`. As a *lifecycle* pattern
  this is the rail new model lanes should copy.
- **The prompt's discipline section** (191-195) directly encodes the
  anti-manufactured-insight rule — "if the day is unremarkable, say so
  plainly" — which is what makes a daily surface trustworthy enough to open.
- **Spaced library resurfacing** (141-167) is a genuinely excellent design:
  deterministic spaced picker with a memory, vault-link reconnection jumping
  the queue, marked-on-entry so one unused idea can't block it, and the model
  only decides *if* it connects. Best knowledge-compounding pattern in Nova.
- **The learning loop closes at kind level**: his real approve/discard
  history on reviews measurably tunes future ones (learning.js), and the
  July-sweep fix note shows the discipline of running it on real decision
  counts (332 records).
- **The Inbox card renders every state honestly**, including error-with-
  recovery-action (valsInbox.js:486-492).

## 4. Cons and gaps (ranked by real-life cost)

1. **Silent context-section drops** (dailyReview.js:85). The flagship surface
   can present a confidently wrong read built on a partial picture, and its
   own prompt makes it verbalise the wrong explanation for the hole. General-
   effectiveness axis; the fix already exists one lane over.
2. **No memory of its own past reviews.** Yesterday's review — and whether he
   approved, discarded, or acted on its adjustments — never enters today's
   context. The one surface built for continuity restarts from zero every
   morning; adjustments are fire-and-forget, so the mission's *compounding*
   value (weekly/monthly arcs) leaks away. Coach's `adviceContext`
   (coach.js:741-752) is the named rail: review records already carry status
   on the rails.
3. **Calendar input is counts-only** (131-140). "busiest 2026-09-02 with 4"
   cannot produce "train before your 18:00 dinner" — the weakest input on the
   surface whose whole point is cross-domain connection.
4. **The "evening" dispatch section runs at 8am** (91): "HOW TODAY IS GOING"
   composed at the review hour is mostly empty-day content; at best wasted
   context, at worst it invites "you haven't eaten" reads minutes after he
   wakes. Minor but daily.
5. **Discard reasons aren't captured for reviews.** learning.js counts the
   discard, but *why* a review missed never gets asked — the Coach's
   declined-with-reason pattern (coach.js:749) doesn't reach the flagship.
   Lower cost: the kind-level stat still moves.

## 5. Mission test

**Daily: earns its keep** — a grounded read plus ≤3 concrete, today-actionable
adjustments changes what he does before noon, and the empty-day discipline
protects the habit of opening it. **Weekly/monthly: underperforms by design
gap** — with no memory of its own past reads and no adjustment follow-through,
it cannot build an arc ("third short-sleep Tuesday running"), so medium-term
compounding lives only in his journal, unread by the agent that wrote it.
**Long-term:** contributes only via the learning loop's kind-level stats. The
single change that would most raise its mission value is closing the
continuity loop (plan item 2).

## 6. Improvement plan (ranked)

Change types (cap lifted per standing correction 4): items 1, 3, 4, 7, 8
are REFINEMENTS; items 2, 5, 6 ADD capability on existing rails.
Capability-gap note: a weekly meta-layer is deliberately NOT proposed here —
that is the Weekly Debrief's job (item 15); duplicating it would be a
parallel rail. One candidate was evaluated and rejected: a
nothing-to-report suppression mode (skip composing on unremarkable days) —
rejected because the prompt's empty-day discipline already handles it more
honestly than a deterministic pre-filter could.

1. **[Refine] Named failures in `buildReviewContext`.**
   - **Need:** the model must never explain a code failure as a life gap.
   - **Proposal:** port the Coach chat's failures rail verbatim: `add()`
     collects failed labels, and a final NOTE section names them with the
     same "an error, NOT thin logging" instruction (workouts.js:657-661 is
     the twin — note the pairing in a comment per doctrine rule 7).
   - **Doctrine:** rule 4; screened against silent cap and parallel rail
     (it *is* the existing rail, extended).
   - **Failure modes:** the NOTE itself is deterministic string-building —
     nothing to fail.
   - **Impact/effort:** H / L.
   - **Verification:** unit test with a throwing section asserting the NOTE
     names it; then a live context build against the real vault reading the
     assembled prompt (read-only).
2. **[Add] Review continuity + adjustment follow-through.**
   - **Need:** today's review should know what yesterday's said and what he
     did about it — that is what makes a coach, and a weekly arc, possible.
   - **Proposal:** one new context section reading the last ~5 `review`
     records off the rails (text + status + declineReason if present) —
     extending Coach's `adviceContext` pattern — plus one prompt line:
     follow up on yesterday's adjustments briefly when the data shows
     follow-through or its absence; never re-issue a discarded adjustment
     unchanged.
   - **Doctrine:** rules 1 (deterministic read), 4 (statuses are facts on
     record); screened against parallel rail (reuses inbox records — no new
     store) and confident guess (follow-through claims stay grounded in
     logged data).
   - **Failure modes:** no prior records → section absent; listRecords
     throws → named by item 1's rail.
   - **Impact/effort:** H / L-M — this is the mission-cadence fix.
   - **Verification:** live context build against his real records; check the
     section quotes real statuses; regression test for the discarded-
     adjustment-not-repeated instruction reaching the prompt.
3. **[Refine] Real calendar lines in context.**
   - **Need:** cross-domain adjustments need event names and times, not
     day-counts.
   - **Proposal:** for today + tomorrow, include up to 6 events as
     `HH:MM title` lines (shape of `fetchEventsForRange`'s events
     [Assumed — verify fields at implementation]); keep the count summary
     for the rest of the week.
   - **Doctrine:** rule 4 (calendar-unsynced already degrades via the
     dispatch composer); screened against silent cap (says "first 6" when
     truncating).
   - **Failure modes:** fetch fails → section named-failed via item 1.
   - **Impact/effort:** M / L.
   - **Verification:** live context build on a day with real events; read the
     lines against Calendar.
4. **[Refine] Hour-honest dispatch sections.**
   - **Need:** an 8am review shouldn't reason from an "evening" composition
     of a day that hasn't happened.
   - **Proposal:** include the evening section only when the run hour ≥ 15
     (late manual runs keep it); otherwise skip — the morning section already
     carries the day's plan.
   - **Doctrine:** rule 4. **Impact/effort:** L-M / L.
   - **Verification:** context build at a morning hour lacks the section; at
     a forced evening run, has it.

5. **[Add] Latest weekly debrief in the review context.**
   - **Need:** the daily read should reason inside the week's frame — Ask
     Nova already gets `latestDebriefContext` (askContext.js:146); the
     surface built for cross-domain reads does not.
   - **Proposal:** one context section via the same helper (note the twin).
   - **Doctrine:** rules 1, 7. **Impact/effort:** M / L.
   - **Verification:** live context build; confirm the section quotes the
     real latest debrief.
6. **[Add] Fleet receipts in the review context.**
   - **Need:** "the Watcher's verdict on that video landed overnight" is
     exactly the cross-domain connection the review exists to make, and it
     cannot see the rails today (buildReviewContext has no fleetContext
     section — verified against dailyReview.js:83-176).
   - **Proposal:** add `fleetContext()` (the shared-brain rail every
     conversational agent already reads).
   - **Doctrine:** rules 1, 7. **Impact/effort:** M / L.
   - **Verification:** live context build against real records.
7. **[Refine] Ask-why-once when a review is discarded.**
   - **Need:** con 5 — a discarded review is the loudest feedback the
     flagship gets, and no reason is ever captured; the why-chips rail
     exists one kind over (valsInbox.js:348-360 covers coach advice +
     fuel-cross).
   - **Proposal:** add kind `review` to the isAdvice set with
     review-appropriate chips (off-base / already knew / not actionable /
     too busy today); reasons feed plan item 2's continuity section.
   - **Doctrine:** rule 6; capture-with-consumption (the continuity section
     is the consumer, so this avoids the [03] capture-without-consumption
     trap). **Impact/effort:** M / L.
   - **Verification:** discard flow on a scratch record; reason visible in
     the next day's context build.
8. **[Refine] Push on the day's final failed attempt.**
   - **Need:** cross-cutting [05] — in auto mode a review that errors three
     times dies silently; he learns at night that the flagship never spoke.
   - **Proposal:** when the third error record of the day is written
     (todayReviewRecord's cap, dailyReview.js:223-233), send one push:
     "today's review couldn't compose — tap to retry." via the existing
     push rail.
   - **Doctrine:** rule 4. **Impact/effort:** M / L.
   - **Verification:** unit test the third-failure branch; scratch-server
     forced failures.

## 7. UI recommendations

Where output lands: the Inbox review card (config + status), the pending
record card, the journal entry, push/Telegram. Screened for dashboard drift —
each names what he does differently:

- **Per-adjustment ✓/✗ on the review card** (supports plan item 2): render
  the 1-3 adjustments as tappable rows — done / not today — writing a tiny
  receipt on the record. What changes: follow-through becomes a logged fact
  tomorrow's review (and the learning loop) can read, instead of evaporating;
  one tap replaces a journal edit. Must ride the existing record-update
  rails, not a new store.
- **Ask-why-once on discard** (supports con 5): discarding a review offers an
  optional one-tap reason chip (off-base / already knew / too busy) — the
  Coach lane's declined-reason pattern surfaced in UI. What changes: his
  objection becomes standing context instead of a silent skip.
- **Reachability:** in draft mode the review lives below the fold of the
  Inbox behind its status line; when status is `pending`, Mission Control
  should surface a one-line "today's review is waiting" chip that deep-links
  to the card. What changes: the flagship read gets seen the hour it lands
  rather than whenever he next opens the Inbox. (Mission Control's stage-card
  slot machinery exists — valsMission.js:466-471 shows the pattern
  [Inferred from the concept-review card].)
- **Aesthetics/honest-state:** the card's status strings already cover every
  state honestly; no change proposed — adding more chrome here would be
  decoration.

## 8. Verdict

**Refine** — the right skeleton, the right discipline, one dishonest failure
mode and one missing loop. Highest-value next action: **review continuity +
adjustment follow-through** (plan item 2) — it converts a good daily read
into a compounding coaching arc, which is the mission difference between
"informed today" and "better this month".
