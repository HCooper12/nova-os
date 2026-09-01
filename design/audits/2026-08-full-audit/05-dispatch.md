# 05 — Dispatch (the briefs)

Audited 2026-08-30. Read-only. Full-surface enumeration per standing
correction 5; files opened this session: `server/lib/dispatch.js` (full, 623
lines), `server/lib/briefState.js` (full), `server/lib/briefWarm.js` (full —
also pre-reads item 39), `server/lib/briefDecisions.js` (full, read at item
03), `server/routes/loops.js` (dispatch routes), consumers verified by grep +
open: telegram.js:177-179 (/brief command), planToday.js:81, dailyReview.js:
90-91, askContext.js:122-131, autonomyLedger/ops/openLoops (kind references),
`src/vals/valsChrome.js` (Commander grouping), valsInbox loops card
[status-shape verified via 02's read]. Tests: loops.test.js (9 tests) exists;
dispatch composition is exercised there and via morningBrief.test.
Deliberate deferrals: morningShow spoken composition (items 39/47 — a
*sibling* composer, see con 6), Plan Today (06), the Inbox loops card UI (48).

## 1. What it is (verified)

The deterministic brief engine — three slots, no model anywhere
(dispatch.js:20-25):

- **Morning Dispatch** (default 07:00): recovery with HRV-vs-baseline and
  stale-data self-labeling plus the steps-gap detector with its fix path
  (134-171); today's calendar (173-181); fuel plan vs floor with
  eaten-so-far (183-195); training slot with active-rest disambiguation and
  the Coach's deload advisory (197-215); carry-overs due/overdue (217-227);
  training-vs-calendar conflicts (229-236); open to-dos capped-with-count
  (238-246); subscriptions expected ≤3 days (248-259); overnight-queue
  results (261-266); topic pulses (268-273); open loops (275-280); streaks
  (282-285); the Leader's line (287-294); the daily review concept via a
  date-hash pick mirrored client-side (90-101, 296-301).
- **Evening Debrief** (default 21:00): fuel reality vs floor; training
  logged-vs-scheduled; today's steps; tomorrow's first 3 events + training;
  streaks (307-383).
- **Weekly Review** (Sundays, default 17:00): this week vs last on sessions/
  sets, protein-floor adherence, steps average, vault pages touched, spend,
  inbox throughput, streaks (387-478).

**Rails:** each run files an inbox record kind `dispatch` with per-slot
trust ladder (off/draft/auto), journal route, `category: system` (516-567);
per-day (per-week for weekly) guards on LOCAL dates with a 3-error retry cap
(495-513); force supersedes an unactioned draft by discarding it with a
receipt (524-526); auto mode files with undo + Telegrams the text, and an
auto-file failure falls back to a pending record carrying the error
(554-565). Scheduler every 15 min, heartbeat `dispatch` (615-623).
**Delivered-state** is server-side and cross-device (briefState.js — the
Mac-briefs-over-book-analysis fix). **Consumers of the composition:** Ask
Nova context, Daily Review context, Plan Today, the Telegram /brief command
— the written brief doubles as the fleet's shared "today picture".

## 2. Current workflow, traced

A real morning: 07:00-07:15 tick → no morning record today →
`runDispatch('morning')` → composeMorning reads eleven+ sources, each in its
own try/catch → record files. Draft mode: pending in the Inbox, approve →
journal. Auto mode: filed with undo + full text to Telegram. The spoken
Morning Show is a separate composition (items 39/47) — briefState marks
"briefed today" once either device delivers it. His 27-Aug TTS warm pipeline
(briefWarm) pre-synthesizes the spoken lines 05:00-10:00 so the glass never
sits silent.

Failure modes, as they degrade today:
- Any section source missing → a NAMED honest line in the brief itself
  ("**Recovery.** Unavailable.", "Calendar unavailable") — **the best
  composer-side degradation in Nova**; garnish sections go silently absent
  by design (optional try/catches). **Honest.**
- Stale health data → self-labels with age and cause (150-152); yesterday's
  steps missing or partial → named with the correction path (154-165) — the
  steps-incident lesson, encoded. **Honest.**
- Compose crashes → error record, 3 retries/day, then the slot stays quiet
  for the day (508-512). Status is visible on the loops card. **Honest.**
- Auto-file fails → falls back to a pending record with the error string —
  but **nothing notifies him**: an auto-mode user doesn't watch the Inbox,
  so the brief silently waits where he never looks (562-564). **Silent
  absence.**
- Same-day re-run → guarded; forced → supersedes with receipt. **Honest.**
- UTC/local date guard (497-502) prevents the re-composing-every-tick bug.

## 3. Pros — what genuinely works

- **Per-section honest degradation inside the output itself** — the brief
  says what it cannot see, in the exact spot the number would have been.
  This is the composer-side counterpart of Coach's named-failures NOTE and
  should be named as the third rail: *the honest composer*.
- **Stale-data self-labeling + the steps-gap detector with a fix path**
  (150-165) — doctrine rule 4 at its sharpest; the brief doesn't just admit
  a gap, it tells him the two-tap correction.
- **Cross-domain reach**: carry-overs, conflicts, subscriptions due,
  overnight results, pulses, open loops, the Leader — the morning brief is
  a genuine day-ahead composite, not a health readout.
- **The slot machinery is exemplary rails usage**: local-date guards,
  error-capped retries, forced-supersede receipts, per-slot trust ladders,
  atomic config writes, auto-with-undo.
- **One composition, many mouths** (Ask Nova, Daily Review, Plan Today,
  Telegram) — rule 7 respected where it costs the most.
- **Cross-device delivered-state** (briefState) killed a real
  double-briefing failure.

## 4. Cons and gaps (ranked by real-life cost)

1. **Auto-file failure is silent to an auto-mode user** (562-564). The one
   failure mode of the flagship morning artefact leaves it stranded in a
   queue he has been told he doesn't need to check. General axis.
2. **The evening debrief arrives too late to act on its sharpest line.**
   "168g against the 180g floor — 12g short" at 21:00 is a verdict, not a
   nudge; nothing in Dispatch (or the cadence) checks protein *pace* while
   the kitchen is still open. Mission axis, daily. (The Recipes fuel hero
   shows pace live — but only if he opens the screen.)
3. **The evening debrief never closes the day's to-dos.** Morning lists
   them; evening says nothing about what got checked or what rolls over —
   the day's open-loop closure lives nowhere. Mission axis, daily.
4. **The Weekly Review omits recovery and bodyweight** — the two
   slowest-moving, most goal-relevant trends (HRV/sleep averages WoW, weight
   trend) are absent while vault-pages-touched made the cut. Data is already
   loaded (loadRecentDays(14), 429). Mission axis, weekly/monthly.
5. **The daily-review concept pick is a duplicated hash contract**
   (90-101): server and client each implement the same date-hash + sort;
   the comment notes the twin but no test pins them together — rule 7 kept
   by discipline alone.
6. **Two sibling morning composers** (composeDispatch written vs
   composeShow spoken) read the same sources independently — same-morning
   drift (different event lists, different fuel numbers minutes apart) is
   possible and only softened by spokenLog. No fix proposed sight-unseen;
   flagged cross-cutting to check at items 39/47 with real outputs
   side-by-side.
7. **Small silent caps**: tomorrow's events slice(0,3) with no "+N more"
   (365); weekly vault names 3 of N without the N-3 remainder label (446).
   Minor; the to-dos cap already does it right (244).

## 5. Mission test

**Daily: earns its keep twice over** — the morning brief changes the day's
first decisions (deload advisory, conflicts to move, carry-overs to clear,
subscriptions landing) and the evening debrief closes fuel/training reality
against plan. Its blind spot is the actionable afternoon (cons 2-3).
**Weekly: earns its keep** — the Sunday WoW comparison is the platform's
only deterministic week-scale mirror, but it under-reports the body (con 4).
**Monthly/long-term:** deliberately delegated (CFO for money, Brain Week for
knowledge, Daily Review/Debrief for arcs) — correct division, no finding.

## 6. Improvement plan (ranked; cap lifted per standing correction 4)

Change types: 1, 5, 6, 7 REFINE; 2, 3, 4 ADD on the existing composer;
nothing is worth REMOVING — every current section pays rent.

1. **[Refine] Notify on auto-file failure.**
   - **Need:** an auto-mode brief must reach him even when filing breaks.
   - **Proposal:** in the auto catch (562-564), send the push the pending
     path relies on ("today's brief hit a snag — it's waiting in your
     Inbox") via the existing push.js rail; same for the Daily Review's
     equivalent fallback if 02's fixes land.
   - **Doctrine:** rule 4/6. **Failure modes:** push itself fails →
     catch-and-drop, as elsewhere. **Impact/effort:** M-H / L.
   - **Verification:** unit test forcing fileDecision to throw; live check
     of push delivery on a scratch server.
2. **[Add] Afternoon protein-pace nudge.**
   - **Need:** the floor must be rescuable while food can still fix it.
   - **Proposal:** a deterministic pace check in the coach-cadence 16:00-19:00
     window (the existing missed-session window + markSent rail): if
     protein-so-far < ~50% of floor, one Telegram line with the gap and the
     rotation's unconsumed cover (the fuel hero's gap-fill logic, reused
     from valsRecipes — extract the shared helper, note the twin). Silent
     when on-pace or floor already hit; once per day.
   - **Doctrine:** rules 1, 6; screened hard against nagging (single
     threshold, single message, silence is the norm). *Run on his real
     log first* to tune the threshold so it wouldn't have fired on
     on-track days.
   - **Impact/effort:** H / M. **Verification:** pure-function tests +
     replay against his real logged days counting would-have-fired days.
3. **[Add] Evening to-do closure line.**
   - **Need:** the day's open loops deserve a closing line where the day
     closes.
   - **Proposal:** composeEvening gains "**To-dos.** N checked today · M
     still open (oldest: X)" from listTodos — same shape as the morning
     line, reality-facing.
   - **Doctrine:** rule 1. **Impact/effort:** M / L.
   - **Verification:** compose against the real vault; unit test.
4. **[Add] Weekly recovery + bodyweight lines.**
   - **Need:** the week-scale mirror should show the body, not just the
     work.
   - **Proposal:** composeWeekly adds HRV and sleep averages WoW (from the
     already-loaded 14 days) and the weightTrendLine (healthData rail).
     Honest below data thresholds like every sibling.
   - **Doctrine:** rules 1, 4. **Impact/effort:** M / L.
   - **Verification:** compose against real vault; unit test with thin
     data asserting silence.
5. **[Refine] Pin the review-pick twin with a test.**
   - **Need:** a duplicated hash contract must not drift silently.
   - **Proposal:** a regression test computing the pick for a fixed date +
     page pool against a stored expectation, with a comment naming the
     client twin (and the same fixture mirrored in a client test if the
     harness allows).
   - **Doctrine:** rule 7. **Impact/effort:** L / L.
6. **[Refine] Honest small caps.**
   - **Proposal:** tomorrow's events "+N more"; weekly vault "latest 3 of
     N". **Doctrine:** silent-cap screen. **Impact/effort:** L / L.
7. **[Refine, gated] Shared fact-helpers for the sibling composers.**
   - **Need:** the written brief and spoken show must never disagree about
     the same morning.
   - **Proposal:** GATED on evidence — at items 39/47, diff a real morning's
     composeDispatch vs composeShow outputs; only if facts diverge, extract
     the shared helpers (fuel line, event list) both call. No speculative
     refactor.
   - **Doctrine:** rules 7, and §3.2 (read before writing).
   - **Impact/effort:** M / M (if warranted). **Verification:** the diff
     itself.

## 7. UI recommendations

Where output lands: the journal entry, the Inbox record + loops card,
Telegram, and embedded context in other lanes. Screened against dashboard
drift:

- **Auto-fail push** (plan 1) is itself the UI change: the failure state
  becomes a notification he acts on. What changes: a broken morning gets
  fixed at 7am, not discovered at noon.
- **Pending-brief chip on Mission Control** (shared pattern with 02's
  recommendation — build once for both kinds): when a draft brief waits,
  one line deep-links to it. What changes: draft-mode briefs get read at
  brief-time.
- **Protein-pace nudge lands in Telegram, not a new screen** (plan 2) — no
  new surface; the existing thread he already reads. What changes: he eats
  the gap, not reads about it.
- **The brief's own rendering**: bold-section markdown in the journal is
  legible and consistent with the token system; no changes proposed —
  restraint is the right call on a text artefact.
- **Accessibility:** the steps-gap line references "tap the Steps ring" —
  when the Workouts/Mission audits (45/46) run, verify that target is
  reachable at phone width per the standing verification rule; noted for
  those items.

## 8. Verdict

**Keep as-is / Refine** — the honest-composer rail the rest of the platform
already leans on; its gaps are afternoon actionability and a silent
auto-fail, not architecture. Highest-value next action: **afternoon
protein-pace nudge** (plan item 2) — it converts the evening's most common
bad-news line into a same-day save, which is the mission difference between
reporting the day and changing it.
