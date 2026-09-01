# 46 — Workouts (Train: TODAY / GYM / COACH)

Audited 2026-08-31. Read-only. Files opened: `src/vals/valsWorkouts.js`
(40-425 line-by-line of 565), `src/CoachApplySheet.jsx` (full),
`src/App.jsx` finish/carryover/outbox flow (2637-2745 by grep+read),
TrainToday.jsx/VerdictCard.jsx/Workouts.jsx render layers [mapped —
1,000+ lines of style-heavy JSX rendering the view model; logic lives in
vals, which is where the audit dug]. Phone-width render: blocked by the
[45] resize limitation — carried as the open verification item.

## 1. What it is (verified)

The training surface, three tabs from the mockup: **TODAY** (the
overview: readiness, momentum, volume bars, deload, week strip with
carry-overs overlaid on their real dates), **GYM** (routines editor +
exercise picker + the live session cockpit), **COACH** (the chat, item
01's lane). A live session DEFAULTS to GYM but never locks him there —
"'can't switch tabs during a workout' was his bug report, 19 Aug" — the
session parks in state and the ● LIVE chip on GYM leads back (58-63).

**Item 01's deferred renderings, now all VERIFIED in the view model:**
- Progression chips: `COACH +2.5KG` / `+1 REP` / `HOLD & CONTROL`
  (quality deliberately carries no number — "a chip reading '+0KG' would
  be nonsense") / `OUTGROWN →` as a doorway that opens the Coach with the
  prescription-change conversation pre-asked (195-203).
- Evidence rides every chip; ◆ COACH highlights (coachAdded) with why +
  start weight; focus notes; last-session shown VERBATIM "so a
  coach-raised prefill is a visible choice, not a silent replacement of
  what he actually lifted" (289-291).
- ▶ FORM on EVERY lift — curated link when filed, otherwise an honest
  deterministic search, "never a dead chip, never a pretend curation"
  (264-268).
- Long-press menus (spec #13) per exercise: form / anomaly flag / report
  pain (per-muscle area lists) / skip today / ask Coach / and remove ONLY
  for ad-hoc extras — "a programmed one is skipped, never deleted"
  (271-284).
- The **CoachApplySheet**: his rule verbatim in the header comment
  ("always confirm… give me an opportunity to type"); a note routes
  through Coach's amend lane and "your instruction wins"; the sheet names
  the ◆ highlight and where undo lives. Proper dialog semantics
  (role/aria-modal).
- Verdict-first cards: plateau/tired/peak open a VERDICT (drawn evidence)
  before any advice; starter chips composed from LIVE signals, "never
  canned filler" (46-49, 64-76).
- The library is the authority for muscle groups, not the session's
  frozen copy — with the reason (258-263).

**The finish flow** (App.jsx:2637-2745): cut-short reason captured,
carry-over cleared on completion, PR celebration from the save response —
and **session saves ride the offline outbox** (2711).

## 2. Current workflow, traced

Push day: BEGIN from TODAY → the cockpit prefills last loads with the
coach chip showing "+2.5KG" and its evidence on tap → mid-set his
shoulder pinches → long-press → Report pain → area chips (Shoulder/Neck/
Elbow for a Shoulders lift) → the note rides the session → he finishes
cut-short → the missed exercises push forward as a carry-over that then
overlays Thursday on the week strip → PRs celebrate on save → the [01]
receipt/debrief chain fires.

Failure modes (surface level):
- Offline finish → **the outbox replays the save later** — which,
  combined with [01]'s verified no-dedupe in completeSession, makes the
  duplicate-session risk a REAL exercisable path, not an inference. [01]
  plan 1's priority upgrades accordingly.
- Session parked across tabs/reloads → server-side session-draft rails
  (01's read). **Honest.**
- Live vs demo → usingLiveWorkouts gate throughout. **Honest.**
- The Session Debrief has NO in-app rendering — confirming [09]'s
  finding: the coach's reaction to a logged session exists only in
  Telegram; session history here shows the deterministic receipt only.

## 3. Pros — what genuinely works

- **The cockpit is the doctrine's showroom**: every deterministic engine
  from item 01 surfaces as a tappable, evidenced, honest chip; prefills
  are visible choices; skip≠delete; pain is one long-press away and
  becomes coaching data.
- **Doorway chips over number chips** for outgrown prescriptions — the
  UI understands that some findings are conversations.
- **The apply sheet** is consent design done right: confirm-first, note
  reroutes to the model with his words winning, undo location named.
- **Verdict-before-advice** on the overview cards.
- **View-model discipline**: 1,900 lines of screen where every behavior
  lives in a testable vals file.

## 4. Cons and gaps (ranked by real-life cost)

1. **The outbox-replay duplicate path** — this surface supplies the
   trigger for [01]'s highest-priority fix; until completeSession
   dedupes, a flaky-network finish can double-log a session.
2. **[09] lands here**: no "Coach said" on session history.
3. **Phone-width unverified** ([45] carry).
4. Nothing else new — the screen's flaws are its agents' flaws, already
   owned.

## 5. Mission test

**Daily: the platform's deepest earn** — logging is where the mission's
training half becomes data, and this surface makes the honest path the
easy path (prefills, chips, one-tap pain/skip/anomaly). The cockpit
design directly protects data quality, which every engine above depends
on.

## 6. Improvement plan (ranked)

1. **[Owned by 01, urgency upgraded] Idempotent session save** — the
   trigger is confirmed; ship 01 plan 1 first among all Coach-family
   fixes.
2. **[Owned by 09] The "Coach said" line on session history + the carry
   chip above the next same-routine session.**
3. **[Verify] Phone-width pass** when a resizable client exists —
   priority spots: the cockpit's set rows, long-press targets ≥40px, the
   week strip's 7 columns at 375px.

## 7. UI recommendations

- **None new** — this surface already renders everything the audit asked
  other items to build toward. It is the reference UI for the fleet.

## 8. Verdict

**Keep as-is** — ninth clean keep, and the reference surface: the place
where doctrine, engines, and consent design all visibly meet. Next
action: ship [01]'s idempotent save — this screen is where the duplicate
would happen.
