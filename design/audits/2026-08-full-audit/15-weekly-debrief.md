# 15 — Weekly Debrief (the Coach's Sunday sit-down)

Audited 2026-08-30. Read-only. Files opened: `server/lib/weeklyDebrief.js`
(full, 358 lines); consumer greps opened at earlier items: askContext
(latestDebriefContext rides Ask Nova), learning, inbox TIME_VALUE (8d),
push, fleet, openLoops-excluded, loops routes, valsInbox/valsChrome. Test
file exists (weeklyDebrief.test.js). Carries and ANSWERS item 14's
ownership question. Deferrals: Leader agent internals (item 37), Inbox
card (48).

## 1. What it is (verified)

The week-scale model artefact: Sundays 17:00 (weekday + hour configurable,
37-38, 60-73), one pass over the whole week producing READ / WINS (1-3) /
CHANGES for next week (1-3, each with a why) / one reflective QUESTION,
plus a conditional LEADERSHIP section only when the Leader context exists
(177-198). Journal route, category training; draft or auto (+Telegram +
push); retry cap 3/week; `classifying` status with the boot reaper;
laneSkipped honoured; $1.50 budget; pinned model (246-257, 299-318).

**Context** (77-173): org block, the Coach's advice-outcomes for the week,
the Leader's week + open struggles, profile, goals, tunes, every session
with notes/pain/cut-short quoted, the program schedule, e1RM direction,
skipped work, recovery averages, bodyweight trend, nutrition-week floor
adherence, streaks, his journal week ("his own words outrank any metric"),
and — **uniquely in the fleet — its own predecessor**: last week's debrief
rides in with "hold this week against what it said" (165-171), and the
prompt demands "if last week's debrief set changes, say plainly whether
they happened" (184).

**Distribution:** latestDebriefContext hands the current debrief to Ask
Nova for discussion (330-339); the Daily Review will gain it under 02's
plan.

## 2. Current workflow, traced

Sunday 17:00-17:30 tick → no debrief this week → context builds (the week
plan drafted at 16:00 is NOT among its sections — see con 1) → model
composes → composeDebriefText validates and caps each section, an empty
debrief throws honestly (201-233) → draft: pending card; auto: filed with
undo + Telegram + push. Next Sunday, this debrief becomes the yardstick
its successor is held against.

Failure modes, as they degrade today:
- Compose fails → error record, 3/week cap, reaper coverage. **Honest.**
- Empty model output → thrown (210). **Honest.**
- Context section fails → silently absent (`add()` catch, 79) — the
  shared silent-drop family's next site. **Unnamed.**
- Slept-through Sunday → **no catch-up is possible as built**: the context
  is week-relative to `now`, so a Monday run would compose the NEW week's
  empty debrief, not the missed one. Harder than the [12] class — needs a
  week-offset compose, not a wider window.
- **"RECOVERY THIS WEEK" is not this week** (137): the week filter is
  defeated by a `|| true` — a debugging leftover that makes it a rolling
  last-7-days window. Harmless on schedule (Sunday's last 7 ≈ the week),
  wrong on any forced mid-week run, and mislabelled either way.
  `nutrition-week` (146) has the same rolling-window-labelled-“THIS WEEK”
  shape. **Label lies by a small margin.**

## 3. Pros — what genuinely works

- **The only lane in the fleet that remembers itself.** The
  last-debrief-in-context + did-the-changes-happen contract (165-171, 184)
  is exactly the follow-through loop items 02/06/09/11 were found missing
  — already designed, already shipped, here. Name it as the rail: *the
  debrief remembers* — and export it to the daily lanes rather than
  reinventing it there.
- **Advice-outcome accountability at week scale** (83-88): the Coach's
  recommendations and their fates ride in, so the sit-down covers what
  was advised, not just what happened.
- **"His own journal words outrank any metric"** (163, 192) — the right
  epistemology, stated twice so the model can't miss it.
- **Honest-changes discipline**: "one change or even none ('keep the
  pattern') is the honest answer" (186) — the anti-manufactured-insight
  rule at the week scale.
- **The leadership section's conditional contract** (omit the key
  entirely without context, 188, 198) — clean cross-domain extension
  without padding.
- **Deterministic composition with caps and an honest empty-throw**
  (201-233), configurable schedule, full trust-ladder + notification kit.

## 4. Cons and gaps (ranked by real-life cost)

1. **It never reads the drafted week plan.** Item 14's question, answered:
   the debrief holds the week against the program schedule, not against
   the plan Nova itself drafted (with its conflicts and carry-over
   placements) an hour before the week started. Plan → week → debrief is
   a broken chain at its last link. Mission axis, weekly.
2. **Its CHANGES don't reach the week they govern.** They live as prose in
   the journal text; Plan Today and the Daily Review — the surfaces
   steering Monday-Saturday — can't read them (payload carries only
   `text`, verified 276). The week→day bridge is missing in the one
   direction that matters. Mission axis, daily-from-weekly.
3. **The `|| true` week-window defeat** (137) + rolling nutrition window
   labelled "THIS WEEK" — small, verified, and exactly the class a
   regression test should pin.
4. **No missed-week catch-up**, and unlike [12]'s free fixes this one
   needs real work (week-offset compose).
5. **Silent context drops** — shared-family site; the helper chain
   (01→02→04→06→08→15) keeps growing.
6. **Auto-failure notification absent** — same parity gap as 02 plan 8.
7. Streak line quotes the [07] broken-semantics workoutStreak — inherits
   that fix when it lands.

## 5. Mission test

**Weekly: the platform's strongest artefact** — plan-vs-actual, strength
direction, recovery, fuel, his own words, last week's promises checked,
and one question to sit with; this is the mission's "continually develop
week over week" made concrete. **Monthly/long-term: earns real keep** —
the self-chaining (each debrief held against the last) builds the only
genuine longitudinal arc in the fleet today. **Daily: currently nothing**
— by design, except that its CHANGES *should* be steering the days and
can't (con 2). Fixing cons 1-2 completes the plan→week→debrief→next-week
loop end to end.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2 ADD on existing rails; 3, 5, 6 REFINE; 4 gated REFINE.

1. **[Add] Read the drafted week plan.**
   - **Proposal:** one context section: this week's `week-plan` record
     (payload.text — or the filed vault note if approved), with a prompt
     line: "hold the week against the plan Nova drafted — training days
     planned vs done, flagged conflicts vs what actually collided,
     carry-overs placed vs cleared." Closes 14's chain at its last link.
   - **Doctrine:** rules 1, 7 (reads the rails, no new store).
   - **Impact/effort:** H / L-M.
   - **Verification:** live context build on a week with a filed plan;
     section quotes it.
2. **[Add] Structured CHANGES that reach the week.**
   - **Proposal:** store the parsed changes array in the record payload
     (`payload.changes` beside `text` — composeDebriefText already has
     the objects); Plan Today and Daily Review contexts gain one line
     reading the current week's changes ("standing changes this week —
     check adherence, don't re-litigate"). The exact mechanism plan-today
     already uses for priorities (06), pointed the other way.
   - **Doctrine:** rules 1, 7; the follow-through family's keystone fix —
     the daily lanes inherit the debrief's memory instead of building
     their own.
   - **Impact/effort:** H / L-M.
   - **Verification:** payload shape test; live context builds of both
     daily lanes quoting real changes.
3. **[Refine] Fix the week windows + label honestly.**
   - **Proposal:** delete the `|| true` (137) so recovery is genuinely
     week-bounded on scheduled runs — or, if the rolling window is the
     better metric near week's end, keep it and label "last 7 days";
     same decision for nutrition-week. Either way the label matches the
     window, and a regression test pins it (the debugging-leftover class).
   - **Doctrine:** rule 4; §4 (the test that encodes the lesson).
   - **Impact/effort:** M / L.
4. **[Refine, gated] Missed-week catch-up with week-offset compose.**
   - **Proposal:** GATED on clean date handling: if the configured weekday
     has passed and no debrief exists for the *prior* week (Monday-keyed
     check against the previous Monday), compose with `weekStart` overridden
     to that prior Monday through context + title (the `now` parameter
     already threads; the weekStart derivation needs the override). Tests
     first — week boundaries are where this platform has been burned.
   - **Doctrine:** rules 4; §3.4. **Impact/effort:** M / M.
5. **[Refine] Named absent sections** — next consumer of the shared
   helper. **Impact/effort:** L / trivial once built.
6. **[Refine] Final-failure push** — parity with 02 plan 8, same helper.
   **Impact/effort:** L-M / L.

## 7. UI recommendations

Where output lands: Inbox card → journal; Ask Nova discussion context;
Telegram/push in auto. Screened against dashboard drift:

- **Changes as checkable rows** — deliberately NOT proposed as new UI:
  with plan 2, the changes reach Plan Today and the Daily Review, whose
  existing (02/06-planned) ✓/✗ affordances become the interaction point.
  Building a second checklist on the debrief card would be a parallel
  rail.
- **"Discuss this" affordance on the filed debrief card** — one tap into
  Voice (latestDebriefContext already arms the conversation; the tap is
  the missing bridge). What changes: the sit-down becomes a conversation
  the same evening instead of a document.
- Nothing else — the artefact is a journal entry and reads well as one.

## 8. Verdict

**Keep as-is / Refine** — the platform's strongest weekly artefact and the
one lane that already remembers itself; its two gaps are bridges, not
flaws: it doesn't read the plan that opened the week, and its changes
can't steer the days that follow. Highest-value next action: **structured
CHANGES reaching Plan Today and the Daily Review** (plan item 2) — one
payload field that completes the weekly→daily loop the mission runs on.
