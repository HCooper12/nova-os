# 23 — Commander (follow-ups + open loops)

Audited 2026-08-31. Read-only. Files opened: `server/lib/openLoops.js`
(full, 64 lines), `server/routes/inbox.js` /followups (67-98),
`src/vals/valsInbox.js` calendar follow-up detection (250-280),
`src/App.jsx` answerFollowupDone/moveFollowupToTodo (3353-3368),
push.js:98-100 + telegram.js:66 (followup transit-skip), valsChrome
Commander grouping. The Commander is a composite label (KIND_AGENT
`followup` → 'Commander') fronting two behaviors, both audited here.
Deferrals: Inbox proposals rail rendering (48), calendar lib (44).

## 1. What it is (verified)

Two follow-up-until-closed behaviors:

- **Open Loops** (openLoops.js): deterministic, no model — pending records
  ≥3 days old (time-value kinds excluded: "expiry already handles them" —
  a clean division of labour) plus overdue training carry-overs, sorted by
  age, capped at 6. Surfaces: one morning-brief line and an Ask Nova
  context block; **silence is the reward for a closed board** (52-54).
- **Calendar follow-ups**: after 18:00 the client scans today's calendar
  for task-like events (TASK_HINTS keyword list, valsInbox:256) and asks
  "'Meal prep' was on today's calendar at 17:00 — did it actually
  happen?" — encoding his stated need ("I don't always follow my calendar
  exactly", 253-255). Answers: **Done ✓** → POST /followups files an
  instant journal receipt (the tap IS the approval — mode auto, undoable,
  inbox.js:67-98); **Move to To-Do** carries it forward; dismiss skips.
  Deduped against already-answered-today and open to-dos; push and
  Telegram deliberately skip `followup` records because they transit
  'pending' for milliseconds (push.js:98-100 — documented).

## 2. Current workflow, traced

19:30, app open: "Groceries" (task hint) sat on today's calendar,
unanswered, not an open to-do → the proposal card appears → he taps
Done ✓ → journal receipt "✓ Groceries (17:00 on the calendar) — done."
filed with undo, toast confirms. Next morning, a research brief pending 4
days and a carry-over 2 days past its date make the brief's line: "**Open
loops.** 2 things aging: …" — and Ask Nova can answer "what am I sitting
on?" from the same computation.

Failure modes, as they degrade today:
- Clean board → silence, both surfaces. **Honest.**
- Records store unreadable → loops report what they can (21). **Honest.**
- Done-tap fails → toast with the error, proposal already dismissed —
  minor: the proposal is gone even though the receipt failed
  (App.jsx:3356 dismisses before the POST resolves). **Small
  burn-before-delivery** ([10] family, 4th site).
- **The evening question only exists if the app is open**: detection
  lives in the client view-model, computed from live state after 18:00 —
  no server sweep, no push, no Telegram. Miss the evening and the
  question never fires; **yesterday's unanswered task events are gone
  forever** (answeredToday keys to today only). The feature's premise is
  that he doesn't follow the calendar exactly — but it only works if he
  follows the app exactly. **Ephemeral where durable was the point.**
- TASK_HINTS is another unvalidated keyword list ([07]/[14] class) —
  client-side, unpinned, never replayed against his real event history.

## 3. Pros — what genuinely works

- **The division of labour with expiry is exactly right**: time-value
  drafts die quietly; content that deserves an answer ages loudly. One
  sentence in the header (4-8) settles a design question most systems
  never ask.
- **Tap-is-approval with undo** on the Done receipt — the zero-friction
  happy path with the receipt intact (rule 6 in one route).
- **The three-way answer** (done / move forward / let go) matches the
  three true states of an unfollowed calendar item — and Move-to-To-Do
  means "not today" doesn't mean "never".
- **The transit-skip comments** in push/telegram — a record that exists
  for milliseconds earning no notification is the kind of edge nobody
  handles until it pages someone; here it's handled and documented.
- **Cap + silence discipline** in openLoops — six loops maximum, nothing
  when clean, the top three in the brief line.

## 4. Cons and gaps (ranked by real-life cost)

1. **The follow-up sweep is ephemeral and phone-gated** — client-only
   detection, today-only memory. The one agent whose job is "nothing
   silently rots" lets its own questions rot at midnight. Mission axis,
   daily.
2. **TASK_HINTS unvalidated and unpinned** — the third keyword-detector
   in the platform (with WORKOUT_RE ×2) with no real-data replay and no
   shared home.
3. **Proposal dismissed before the receipt lands** (App.jsx:3356) — a
   failed POST loses the question (burn-before-delivery, 4th site).
4. **Commander is a name without a seam** — openLoops surfaces carry no
   agent attribution while `followup` records do; cosmetic, noted for the
   fleet-roster's self-knowledge accuracy only.

## 5. Mission test

**Daily: earns its keep twice** — the evening question converts calendar
intentions into receipts or carried tasks (the task-side sibling of
Training Check), and the morning loops line keeps decisions from rotting
unseen. **Weekly/monthly:** indirectly — closed loops are what keep the
Inbox trustworthy enough that its counts mean something. The mission gap
is con 1: the behavior that exists is right; it just evaporates when the
evening does.

## 6. Improvement plan (ranked; uncapped)

Change types: 1 ADD (server-side durability for an existing behavior);
2, 3 REFINE. Rejected candidate: per-kind stale thresholds in openLoops —
plausible, but no evidence yet that 3 flat days misfires; revisit only if
the loops line reads wrong in practice.

1. **[Add] Server-side follow-up sweep.**
   - **Need:** the evening question must survive an unopened app and ask
     about yesterday.
   - **Proposal:** mirror Training Check's shape (item 07's rails): an
     evening tick (≥19:00) scans today's calendar for task-hint events
     with no followup record and no matching open to-do, and files real
     pending records ("did it happen?") — Done/Move/Skip become the
     card's actions; a morning pass asks about yesterday's leftovers
     once. The client's live proposals become the fast path over the
     same records instead of a parallel ephemeral rail.
   - **Doctrine:** rules 1, 6; screened against parallel rail (this
     REPLACES the ephemeral rail with the records rail, not adds beside
     it) and against nagging (one record per event, dedupe carried over).
   - **Impact/effort:** M-H / M.
   - **Verification:** scratch-vault evening run; unit tests on the
     dedupe; phone-width card check at item 48's pass.
2. **[Refine] Extract + validate the keyword detectors.**
   - **Proposal:** one shared module for TASK_HINTS + WORKOUT_RE (the
     [14] plan-4 companion), replayed against his real calendar history
     before shipping (standing memory rule), with the false positives
     found becoming the regression fixtures.
   - **Impact/effort:** M / L-M.
3. **[Refine] Dismiss on success, not on tap** — move
   dismissInboxProposal into the .then() (keep a busy state so
   double-taps stay safe); a failed receipt keeps the question.
   **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the Inbox proposals rail (evening cards), the
morning-brief line, Ask Nova context, journal receipts. Screened against
dashboard drift:

- **With plan 1, the evening card gains a push/Telegram presence** —
  the question reaches him where he is at 19:00 instead of waiting in an
  app he didn't open. What changes: calendar reconciliation happens on
  missed-evening days, which are exactly the days it matters.
- Nothing else — the three-button card is already the right size, and
  the loops line already names ages.

## 8. Verdict

**Refine** — the right two behaviors with the right manners, one of them
built on sand: ephemeral, phone-gated detection for the platform's
anti-rot agent. Highest-value next action: **the server-side follow-up
sweep** (plan item 1) — Training Check's proven shape, applied to the
calendar's tasks.
