# 09 — Session Debrief

Audited 2026-08-30. Read-only. Files opened: `server/lib/claudeCode.js`
571-622 (prompt + job, this turn), `server/lib/coachCadence.js` 155-183
(fact sheet + trigger, read in full at item 01), `server/routes/workouts.js`
272-297 (the save-hook chain, item 01), `server/lib/spokenLog.js` (full,
item 04). Trigger, Telegram delivery, and the duplicate-fire exposure were
all verified at item 01 and are cross-referenced, not re-derived.
Deferrals: session history UI (item 46), Telegram bridge mechanics (66).

## 1. What it is (verified)

The coach at the rack: the moment a session is saved, deterministic code
builds a complete fact sheet — every set with RPE, his notes/pain/anomaly/
skipped flags quoted, cut-short reason, previous same-routine volume, PRs
with a don't-re-announce instruction (coachCadence.js:163-177) — and a
**composition-only** model call reacts to it: 2-4 sentences, one thing that
mattered, at most one pointed carry for next time, concerns named plainly
(buildDebriefPrompt, claudeCode.js:576-583). Delivery: Telegram ("Coach —
…"), receipt to spokenLog (617). Fresh session, pinned
`modelFor('session-debrief')` (with the unpinned-lesson comment, 601-604),
budget-capped, and — uniquely in the fleet — **zero tools**: Read/Grep/Glob
are disallowed on top of everything else (594-595), so the model cannot
fetch a single fact beyond what code computed.

## 2. Current workflow, traced

He saves Push → the save-hook fires sessionDebrief fire-and-forget
(workouts.js:292) → kill-switch and telegramConfigured checks → fact sheet
from the freshly-reloaded session (including his mid-session note "left
shoulder pinched on last set" tagged as PAIN) → model composes → "Coach —
Solid Push. The 80kg bench for 8 is the number that matters... that
shoulder note: if it pinches again next session, we swap the movement." →
Telegram delivers, spokenLog records it so Ask Nova owns the words.

Failure modes, as they degrade today:
- Any failure anywhere → silence, by documented design ("a missing debrief
  is a non-event, never an error he sees", 152-154). **Honest as absence**,
  though a dead lane and a quiet week look identical (no heartbeat — it's
  event-driven; acceptable at this size).
- Telegram unconfigured → early return: **no debrief is even composed**
  (157-158). The gate is on the transport, not the composition.
- Session re-save → re-fires with no per-session guard — covered as item
  01 plan 1; not re-counted here.
- Model junk → the reply is whatever it is; with zero tools and all facts
  supplied, the hallucination surface is as small as a model call gets.

## 3. Pros — what genuinely works

- **The zero-tool composition call is the strongest honesty pattern in the
  fleet** — every fact arrives computed, the model literally cannot invent
  a lookup. Name it as a rail: *the sealed-facts call* — any future
  react-to-an-event lane (greeting already matches it) should be built
  this way.
- **The fact sheet is a model of evidence discipline**: his own sentences
  ride in tagged, PRs arrive pre-deduped with an explicit
  don't-re-announce, cut-short carries its reason.
- **The only cadence send with a receipt** (spokenLog, 617) — the
  two-brains fix applied where model prose actually goes out.
- **The prompt's register rules** (never a cheerleader, ONE pointed carry,
  concerns said plainly) encode exactly what makes a debrief worth
  reading daily instead of muting.

## 4. Cons and gaps (ranked by real-life cost)

1. **The carry evaporates.** The "one pointed thing to carry into next
   time" is the entire coaching payload, and nothing remembers it: the
   next same-routine debrief composes cold, the Coach chat doesn't see it,
   and whether he actually did the thing is never checked. The
   follow-through family (cross-cutting [02]), at the exact moment
   coaching lands hardest. Mission axis, weekly.
2. **Telegram is the only mouth.** No Telegram → no debrief exists at all
   (composition gated on transport, 157-158); with Telegram → the reaction
   to a session he logged in the app lives outside the app, invisible from
   the session he's looking at. Reachability, both axes.
3. **The facts are recovery-blind.** The coach at the rack can't see that
   this was a 5-hour-sleep day — one line every other training surface
   already computes (HRV/sleep) is absent from the sheet, so "good session
   given the day" judgments can't be made.
4. **Cut-short facts stop at the reason** — what the finish flow pushed
   forward (the carryover actually created) isn't named, so the debrief
   can't say "the missed pulldowns are already on Thursday's card."
5. **Duplicate-fire on re-save** — verified at item 01, fixed by its plan
   item 1; listed for completeness only.

## 5. Mission test

**Daily: earns its keep** — immediate, grounded reinforcement plus one
correction at the moment of maximum receptivity is textbook
behavior-change; the register rules keep it from decaying into noise.
**Weekly: currently leaks its own value** — the carries would compound into
a genuine coaching thread if anything remembered them; today each one is
spoken once and gone. **Monthly/long-term:** via spokenLog only (6h
retention — effectively nothing). Plan item 1 is the mission fix.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2, 3, 4 ADD on existing rails; 5 is a cross-referenced
refine owned by item 01. Rejected candidate: making the debrief
conversational (reply-to-debrief in Telegram) — the Ask Coach lane already
resumes with full context; a second conversational mouth is a parallel
rail.

1. **[Add] Carry-forward memory.**
   - **Need:** last debrief's pointed carry must meet the next same-routine
     session.
   - **Proposal:** persist the debrief text per routineId in a small
     operational state file (server/data — derived, not vault truth); the
     next same-routine fact sheet includes "YOUR LAST DEBRIEF FOR THIS
     ROUTINE (follow up on the carry if the data speaks to it, once,
     naturally): …". No extraction needed — the whole message is 2-4
     sentences. Same state feeds one line into Coach chat context so the
     chat and the rack agree.
   - **Doctrine:** rules 1, 3 (operational state in data/), 7 (extends the
     fact-sheet rail). Screened: capture-without-consumption (two named
     consumers).
   - **Failure modes:** state unreadable → cold compose, today's behavior.
   - **Impact/effort:** H / M.
   - **Verification:** two scratch saves same routine; second debrief's
     facts quote the first; live read of the state file.
2. **[Add] In-app delivery.**
   - **Need:** the reaction must exist where the session was logged, and
     exist at all without Telegram.
   - **Proposal:** compose regardless of Telegram (drop the transport gate;
     keep the kill-switch); store the text on the same per-routine state
     (item 1's file) keyed also by session id; the session history/detail
     view renders a "Coach said" line (UI lands at item 46). Telegram
     remains the push mouth when configured.
   - **Doctrine:** rules 4, 6. **Impact/effort:** M-H / M (server L, UI at
     46).
   - **Verification:** scratch save with Telegram unset → text present via
     API; screenshot at item 46's pass.
3. **[Add] One recovery line in the facts.**
   - **Proposal:** "Recovery today: HRV n (date), sleep n.nh" from
     loadRecentDays — the same line the quick-session context uses.
   - **Doctrine:** rules 1, 7. **Impact/effort:** M / L.
   - **Verification:** fact-sheet unit test.
4. **[Add] Name the carryover in cut-short facts.**
   - **Proposal:** when the session was cut short, read today's carryover
     (listCarryovers) and add "pushed forward: X, Y (due <date>)" so the
     debrief can close the loop in words.
   - **Doctrine:** rule 1. **Impact/effort:** L-M / L.
   - **Verification:** fact-sheet unit test with a carryover fixture.
5. **[Refine, owned by 01] Once-per-session guard** — item 01 plan 1;
   no separate work here.

## 7. UI recommendations

Where output lands: Telegram today; session history view if plan 2 ships.
Screened against dashboard drift:

- **"Coach said" line on the logged session** (plan 2): the debrief
  appears under the session it reacts to, permanently. What changes: the
  carry gets re-read before the next same-routine session instead of
  scrolling away in a chat thread — and Telegram-less days still get
  coached.
- **Carry chip on the next session's pre-view** (companion to plan 1,
  build at item 46): when a carry exists for today's routine, one line
  above the session editor ("Last time: own the eccentric on lateral
  raises"). What changes: the correction is in front of him at the moment
  it applies, which is the entire point of a carry.
- No other UI: the message itself is the product; decorating it would be
  drift.

## 8. Verdict

**Keep as-is / Refine** — the fleet's sealed-facts exemplar with exactly
one structural flaw: its most valuable sentence has no memory. Highest-
value next action: **carry-forward memory** (plan item 1) — it converts a
daily nicety into a compounding coaching thread for one small state file.
