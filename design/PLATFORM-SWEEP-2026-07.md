# Platform Sweep — July 2026

A full-platform audit against the goal Hayden set: *Nova holds one ongoing
picture of who I am, what I'm doing, and what I'm aiming for; makes intelligent
recommendations from all the data; and I can jump on across the day without
interference or uncertainty.*

**Method.** Five parallel deep-dives, all read-only: (1) the agent "brain" —
what every reasoning surface actually sees; (2) the client — every screen,
state, and interaction; (3) the inbox rails — every kind, route, undo, push,
broadcast; (4) the data layer — every store, contract, and cache; (5) the
doctrine docs vs what's actually built. Findings verified against real code
with file:line references; a handful checked empirically against live data.
Limits: static analysis (tap sizes computed from styles, not measured on
device); nothing was changed.

---

## The verdict

**The foundation is trustworthy.** The most important safety property was
verified outright: calendar/recipe/training writes can **never** auto-approve
under any inbox mode — two independent code locks (`inbox.js:31,75` route
clamping + draft records only filing through the approve endpoint). Every
fileable route has a working undo. Model output never writes unmediated. The
recipe-format pipeline is exemplary (one parser, sanity re-parse before every
write). The doctrine holds where it matters most.

**The gap is connective tissue, not architecture.** Nova *collects* nearly
everything but its reasoning surfaces see narrow slices: the newest data
(carryovers, food history, calendar range) reaches almost no agent; two loops
can't learn from Hayden's decisions; and a dozen client details leak
uncertainty (buried approvals, false empty states, demo fiction reachable
live). Nothing here is a rebuild — it's wiring.

---

## A · Trust & honesty breaches (fix first — these create the "uncertainty")

- **A1. Stuck records are unkillable and block daily loops.** `error` status
  has no exit (approve/discard both demand `pending`; UI renders no button;
  store never trims unresolved). A broken CSV import spawns a **new** error
  record every 5-minute tick. Worse: a server restart mid-compose orphans
  records in `classifying` forever — and the per-day dedupe guards match stuck
  records, so an orphaned Daily Review **blocks that day's review from
  re-running**. (`inboxStore.js:19`, `moneyImport.js:111,130`,
  `dailyReview.js:164`.) Fix: allow discarding error records; startup reaper
  flips stale `classifying` → `error`; dedupe born-error imports per file.
- **A2. An iCloud write wears a "NOTE" badge.** `ROUTE_META` lacks `calendar`
  and `recipe`, so calendar proposals (real iCloud writes) and recipe
  proposals display as notes, with broken payload previews.
  (`valsInbox.js:7-17,25-44`.)
- **A3. Demo fiction reachable while connected.** A workouts fetch failure
  renders `MockWorkouts` — a fictional plan under a pulsing "COACH IS LIVE"
  chip, with a demo toast claiming "written to vault ✓".
  (`Workouts.jsx:590-594`, `App.jsx:2401`.) Violates "demo content is
  demoMode-only".
- **A4. Invented protein floor.** When the human-authored Profile line fails
  to parse, live mode silently substitutes a fictional **180 g** floor —
  the one true honest-degradation breach found. (`valsRecipes.js:60`.)
- **A5. Recovery advice can claim recency the data doesn't have.**
  `loadRecentDays` returns the last N *files*, not calendar days; after
  automation misses, the deload signal's "three nights running" may span
  weeks, and the sleep/HRV satellites show old values with no age label
  (only steps has `staleHint`). (`healthData.js:56`, `coach.js:70-91`,
  `valsMission.js:77-95`.)
- **A6. Nothing proactively flags a dead health feed.** Missing yesterday is
  visible only passively (a brief clause, the steps hint). Guardian has no
  health-freshness check; no push, no record. Empirical state during the
  sweep: 07-17, 07-18, 07-21 all absent. (`guardian.js:199-207`.)
- **A7. Active rest reads as "Rest day" in the briefs.** `scheduledRoutineFor`
  resolves the `active-rest` sentinel to null → the Morning Dispatch calls an
  active-rest day a rest day. Two readers of one schedule value tell
  different stories. (`dispatch.js:113-117,180-182` vs `trainingCheck.js:38`.)
  *(Introduced with the active-rest feature — dispatch wasn't updated.)*
- **A8. False empty states.** Loading and fetch-failure both render as
  "empty": Inbox history, Journal, the 14-day calendar ("Nothing scheduled"
  on a network blip), Settings calendar list, note details stuck on
  "Loading…". Keep `null`=loading, `[]`=empty, add an error state.
  (`Inbox.jsx:358`, `Journal.jsx:53`, `App.jsx:1923,1963,1245`.)
- **A9. Health Insight runs without the lens or profile** — a model agent
  outside the doctrine every model surface is promised to follow; its morning
  framing also references "today's calendar" while the context contains only
  *yesterday's*. (`healthInsight.js` vs NOVA-METHOD §1; `:85-110,133-134`.)
- **A10. Exact-hour schedulers can silently skip a day.** foodSuggest
  (`=== 18`) and trainingCheck (`=== 19`) fire only when an hourly tick lands
  inside that hour — interval drift or a restart skips the whole day, with no
  catch-up (unlike dispatch/review's `>= hour` + per-day guard). Same failure
  class as the steps-automation misses. (`foodSuggest.js:64`,
  `trainingCheck.js:94`.)

## B · Intelligence gaps (the "one ongoing picture" wiring)

Ranked by recommendation value per effort:

- **B1. Carryovers are invisible to every reasoning surface.** The explicitly
  recorded training debt (`workout-carryovers.json`) is read only by the Train
  UI. Quick Session's own prompt says "fill the gap the program leaves" while
  the recorded gap sits unread; Daily Review, briefs, Coach, trainingCheck
  all blind. One import each. (`workoutCarryover.js:50`.)
- **B2. Daily Review never receives fitness goals.** The surface built to
  "reason toward his goals" lacks `goalsContext` — the model must guess to go
  read the vault page. (`dailyReview.js:82-115` vs `fitnessGoals.js:50-59`.)
- **B3. Coach has zero nutrition data** while claiming protein expertise;
  also lacks streaks, learning signals ("protein slips on weekends"), and
  `lastWorkoutDate`. (`routes/workouts.js:192-221`.)
- **B4. Calendar range is used by no agent.** `fetchEventsForRange` exists;
  every agent still reads single days. "Heavy week + HRV trending down" —
  the exact cross-domain adjustment the lens promises — is impossible today.
  Week-aware Daily Review / weekly review / Thursday meal prep are one call
  each. (`calendar.js:264`.)
- **B5. Bodyweight never arrives.** `weightKg` is supported but the Shortcut
  has never sent it (0 of 5 real day files — verified empirically; one agent
  report claiming it "arrives daily" was wrong). The Method names bodyweight
  trend the nutrition loop-closer. Needs: add Body Mass to the Shortcut, then
  a trend line into Coach + Daily Review.
- **B6. The two newest loops can't learn.** `learning.js` KIND_LABEL covers 6
  kinds; decisions on `food-suggestion`, `training-check` (and coach receipts)
  never feed preferences. (`learning.js:14-17`.)
- **B7. Morning brief has no to-dos section** — the "day ahead" brief omits
  open tasks entirely; `listTodos` is ready. (`composeMorning`,
  `todos.js:57`.)
- **B8. Money is invisible to daily surfaces** beyond a sub-due line; the
  ledger lives in `data/` where vault-cwd agents can't self-serve, so Ask
  Nova genuinely cannot answer "how's my spending this month". Inject a
  one-line month summary into Daily Review + Ask Nova context.
- **B9. Food history reaches only foodSuggest**; meal prep re-proposes the
  rotation with no view of what he actually ate or which slot keeps failing.
- **B10. trainingCheck can't push work forward.** A confirmed miss never
  offers "push those exercises to tomorrow" even though carryovers exist as
  a mechanism — the two features this week never met.

## C · Daily-use friction (client)

- **C1. Pending approvals buried** below ~2 screens of loop config on the
  Inbox screen; **no pending indicator anywhere on mobile** (count exists
  only on desktop sidebar + icon badge). The daily action is the hardest to
  reach. (`Inbox.jsx:322`, `valsChrome.js:96-101`.)
- **C2. "✦ ASK" can't ask.** The palette has no Ask-Nova action; Enter runs
  the first substring-matched nav command — typing a question navigates to a
  random screen. (`valsChrome.js:25-75,263`.)
- **C3. Toasts cover the bottom tab bar** (fixed `bottom:26px`, no safe-area;
  ~every action toasts for 3.6 s). (`Toast.jsx:5`.)
- **C4. Gym-flow ergonomics:** 22 px set-tick targets, ~13 px remove, and no
  `inputMode` on weight/reps (full keyboard instead of number pad) — in the
  app's most-repeated interaction. Same for macro inputs. (`Workouts.jsx:445`.)
- **C5. Chats are in-memory only.** Ask Nova / Coach / Code transcripts and
  any in-flight answer die on an iOS tab reclaim, while the UI claims
  "CONVERSATION · CONTINUES ACROSS DAYS" (the session id does persist).
  Mirror to localStorage + re-attach the poll, like the workout session
  already does. (`App.jsx:124-146`.)
- **C6. One hung fetch wedges sync forever.** No timeouts anywhere in
  `api.js`; `refreshInFlight` returns the stuck promise to every future
  caller; chip still says LIVE. Add `AbortSignal.timeout` + clear the flag.
  (`App.jsx:423`.)
- **C7. ~25 HTTP requests per sync pass** (every open, every 5 min, every SSE
  ping) — latency + battery over Tailscale. Structural: batched
  `/api/snapshot` or ETags.
- **C8. Offline inconsistencies:** Money renders a blank page under a header
  claiming to show the ledger; profile/learning are *hidden* offline instead
  of shown stale; `liveDailyReview`/`liveProfile`/`liveLearning` are fetched
  every sync but excluded from the offline cache (blank on reload for no
  benefit). (`Money.jsx:29`, `valsChrome.js:193-213`, `App.jsx:91-97`.)
- **C9. Impromptu + makeup sessions are write-only** — no history surface can
  show `routineId:'impromptu'|'carryover'` sessions; they can never be
  viewed, edited, or deleted. Add "All sessions". (`App.jsx:1226`.)
- **C10. Scroll position bleeds across screens** (single scroller, never
  reset on navigate). (`App.jsx:307,2500`.)
- **C11. Stale day-scoped cache renders as "today"** (rotation, food log,
  calendar) with only the global banner as disclaimer; steps already has the
  right per-card pattern. (`valsMission.js:194-198`.)
- **C12. Autonomy mode is per-device** (localStorage) — phone and desktop can
  run different trust levels; the ladder should be server-side like dispatch
  config. (`App.jsx:99-100`.)
- **C13. Smaller items:** ledger delete is an ~11 px ✕ with no confirm/undo;
  `window.prompt` for budgets; silent dictation-permission failure; barcode
  busy-flag leak on no-conn; note selection yanked during sync; recipe cards
  keyed by name; "6 AGENTS LIVE" overstates; Voice screen buries its input on
  mobile; calm mode doesn't pause the core; settings URL field lacks
  autocapitalize-off; tab rows ~34 px tall.

## D · Robustness (will bite later)

- **D1. Push notifications don't name the new kinds** — training-check,
  food-suggestion, calendar drafts push as generic "Waiting for review";
  born-error imports never push at all; the followup tap pushes a stray
  notification about itself. (`push.js:98-101`, `routes/inbox.js:39-50`.)
- **D2. Broadcast coverage is ~half** of what `events.js` claims — foodLog,
  shopping, journal, recipes, rotation, workouts, notes, profile, ingest
  never broadcast; a second open device stays stale until its next poll.
- **D3. To-Do file: 4 writer modules, 3 hand-copied parsers, no shared lock.**
  Duplicate category vocabularies; compost accepts `- [X]` (capital) that the
  other parsers can't see; concurrent Todoist pull vs UI toggle is a real
  (small-window) lost-update race. Extract one shared todoLine module + lock.
- **D4. Backup holes:** workout session files are written/updated/deleted
  with **no backupFile**; journal's `index.md`/`log.md` bookkeeping writes are
  unbacked, and `addEntry`'s index update **throws unguarded** after the
  journal write already landed. `food-log/` day files are the only store with
  neither atomic writes nor backups.
- **D5. Guardian's nets are narrower than its report claims:** parse-checks 4
  of ~13 stores; 4 of 11 loops are outside the heartbeat watch (cfo and
  health-insight never beat; food-suggest and training-check beat but aren't
  in `LOOP_CADENCE_HOURS`, so their stalls are invisible).
- **D6. `NOVA_DATA_DIR` ignored by two stores** (`healthInsight.js:17`,
  `noteSummaries.js:10`) — under the test env override they still write the
  real data dir. Summaries cache has no GC (orphans persist forever).
- **D7. Write-only signal:** foodLog `entry.source` provenance is flattened —
  scan/barcode entries save as `'manual'` because those flows prefill the
  manual form; the field's vocabulary is fiction today. Ad-hoc quick-session
  exercise state (`adhoc-*`) accumulates in the vault forever, unread.
- **D8. Guardian restore of a previously-missing file files with
  `undoData:null`** — the one write on the rails with no undo.

## E · Doctrine & plan drift

- NOVA-METHOD §5 still lists the operating profile and the model-composed
  daily reflection as unbuilt — both shipped (profile.js, dailyReview.js).
  §1's agent list omits Daily Review; Health Insight violates it (A9).
- AGENTS-PLAN still mandates calendar "propose-only forever / .ics handoff" —
  superseded by the shipped confirm-first CalDAV write path (create/move/
  delete, undoable). Update the doc to the achieved design.
- Plan backlog still unbuilt and newly cheap: **week-plan draft** (Sunday),
  **training-vs-calendar conflict detection** (morning, deterministic),
  **focus-session timer**, **session summary line**, CFO subscription
  registry.
- Context-ledger items still open: RPE/reps-in-reserve, training age,
  equipment constraints, injury flags, e1RM trends, calorie target tied to
  goal, food preferences, bodyweight trend (B5).

---

## Recommended sequence

1. **Trust pass (A1–A10):** stuck-record exits + reaper; calendar/recipe
   badges; demo gating; protein-floor honesty; missing-day honesty + a
   Guardian health-freshness check; active-rest in dispatch; scheduler
   catch-up windows; empty-vs-error states; lens into Health Insight.
2. **Connection pass (B1–B10):** carryovers + goals + nutrition + calendar
   range + month-money into the agent contexts; learning covers all kinds;
   to-dos into the morning brief; trainingCheck offers carryover pushes.
   *(Plus: add Body Mass to the Shortcut — B5 needs data before code.)*
3. **Fluency pass (C1–C13):** approvals-first Inbox + mobile pending chip;
   palette Ask action; toast offset; gym tap targets + number pads; chat
   persistence; fetch timeouts; offline parity; all-sessions history.
4. **Robustness pass (D1–D8):** push labels; broadcast coverage; todo-line
   contract module; session/journal backups; Guardian coverage; data-dir
   compliance.
5. **Docs (E):** sync NOVA-METHOD + AGENTS-PLAN to reality; then the newly
   cheap plan items (week-plan draft, conflict detection).

*Sweep completed 2026-07-22. Sources: five parallel audits (agent context,
client UX, inbox rails, data layer, doctrine) — static analysis with targeted
live verification; no code changed during the sweep.*
