# Nova Full-Platform Audit — August 2026

Read-only audit, one item per session turn. Doctrine: `design/NOVA-METHOD.md`
(rules 1–7, change bar §3, anti-patterns §6). Context brief:
`NOVA-CONTEXT-FOR-CLAUDE-CHAT.md` (read 2026-08-30; code wins on conflict).
**AUDIT COMPLETE** — all 66 items done; program of work + decided open
questions in `99-SYNTHESIS.md`.
Roster built from code: `server/lib/fleetContext.js` KIND_AGENT map
(fleetContext.js:15-28), the scheduler block in `server/index.js:249-292`,
conversational lanes in `server/lib/claudeCode.js` and consumers of
`askContext`/`fleetContext` (voice.js, workouts.js, telegram.js), and
`src/screens/*.jsx`.

## Roster — Agents (ordered by load-bearing weight to daily life)

| # | Item | Source anchor | Status |
|---|------|---------------|--------|
| 01 | Coach (agent + Ask Coach chat lane) | lib/coach.js, routes/workouts.js | done |
| 02 | Daily Review | lib/dailyReview.js | done |
| 03 | Fuel × Training | kind `fuel-cross` | done |
| 04 | Ask Nova (conversational lane) | routes/voice.js, lib/askContext.js | done |
| 05 | Dispatch | lib/dispatch.js | done |
| 06 | Plan Today | lib/planToday.js | done |
| 07 | Training Check | kind `training-check` | done |
| 08 | Quick Session | routes/workouts.js | done |
| 09 | Session Debrief | lib/claudeCode.js:586, lib/coachCadence.js | done |
| 10 | Greeting | lib/claudeCode.js:625 | done |
| 11 | Health Insight | startHealthInsightScheduler | done |
| 12 | Meal Prep | kind `meal-prep` | done |
| 13 | Food Scout | kind `food-suggestion` | done |
| 14 | Week Plan | kind `week-plan` | done |
| 15 | Weekly Debrief | lib/weeklyDebrief.js | done |
| 16 | Coach Reflection | lib/coachReflection.js | done |
| 17 | Program Review | lib/coachProgramReview.js | done |
| 18 | Program Audit | lib/coachProgramAudit.js | done |
| 19 | Money | kind `money` | done |
| 20 | Money Import | kind `money-import` | done |
| 21 | CFO | lib/cfoReport.js | done |
| 22 | Guardian | startGuardianScheduler | done |
| 23 | Commander (follow-ups) | kind `followup` | done |
| 24 | Researcher | kind `research` | done |
| 25 | Studio | routes: studioRouter | done |
| 26 | Distiller | lib/distill.js | done |
| 27 | Compost | lib/compost.js | done |
| 28 | Pattern Scout | lib/patternScout.js | done |
| 29 | Trust Ladder (autonomy) | lib/autonomyLedger.js | done |
| 30 | Librarian | kind `read-next` | done |
| 31 | Brain Week | lib/brainWeek.js | done |
| 32 | Study Lane | kind `study` | done |
| 33 | Watcher | kind `video` | done |
| 34 | Forge | kind `forge-job` | done |
| 35 | Breaker | lib/claudeCode.js:985 | done |
| 36 | Scout | kind `scout` | done |
| 37 | Leader | kind `leader-reflect` | done |
| 38 | Pulse | lib/pulse.js | done |
| 39 | Brief Warm | lib/briefWarm.js | done |
| 40 | Health Mirror + Health Drops | lib/healthMirror.js | done |
| 41 | Reminders | lib/reminders.js | done |
| 42 | Todoist Sync | startTodoistScheduler | done |
| 43 | Overnight | startOvernightScheduler | done |
| 44 | Calendar Watch | lib/calendarWatch.js | done |

## Roster — Surfaces

| # | Item | Source anchor | Status |
|---|------|---------------|--------|
| 45 | Mission Control | screens/MissionControl.jsx | done |
| 46 | Workouts | screens/Workouts.jsx | done |
| 47 | Voice | screens/Voice.jsx | done |
| 48 | Inbox | screens/Inbox.jsx | done |
| 49 | Todos | screens/Todos.jsx | done |
| 50 | Recipes | screens/Recipes.jsx | done |
| 51 | Money (screen) | screens/Money.jsx | done |
| 52 | Journal | screens/Journal.jsx | done |
| 53 | Library | screens/Library.jsx | done |
| 54 | Notes | screens/Notes.jsx | done |
| 55 | Shopping | screens/Shopping.jsx | done |
| 56 | Stash | screens/Stash.jsx | done |
| 57 | Ops | screens/Ops.jsx | done |
| 58 | Settings | screens/Settings.jsx | done |
| 59 | Leader (screen) | screens/Leader.jsx | done |
| 60 | Galaxy | screens/Galaxy.jsx | done |
| 61 | Ambient | screens/Ambient.jsx | done |
| 62 | ClaudeCode | screens/ClaudeCode.jsx | done |
| 63 | MissionStructured | screens/MissionStructured.jsx | done |
| 64 | NovaBar (Mac) | mac/NovaBar | done |
| 65 | Phone widget | widgets/nova-widget.js | done |
| 66 | Telegram bridge | lib/telegram.js | done |

## Cross-cutting findings

- **[22] +1 micro-site:** MissionStructured's three time-band order arrays (259-263) over one section roster — a key missing from one array silently drops that section in that time band only. Fix: dev assert each order is a permutation of Object.keys(sections). 63 plan 1.
- **[22] +1 site (client edition):** codeModelOptions (valsMisc.js:299-304) hand-duplicates the model board's aliases, comment-mitigated with its own recorded incident ("'Opus 4.8' sat here after Opus 5 shipped"). Fix: serve MODEL_CHOICES once, both pickers derive. 62 plan 1.
- **[30] donor confirmed:** DISALLOWED_TOOLS at claudeCode.js:31 is the constant the SPAWN_BOUNDARY sweep should export — the Code tab's lanes all use it; the three unsafe lanes never import it.
- **[03] +1 site (Ambient):** GATE sub reads 'clear' and the room washes cyan when ops data is null (Ambient.jsx:89, valsOps.js:197) — couldn't-check renders as clean on the surface designed to run unattended. 61 plan 1-2.
- **[31] UI-copy-vs-code drift (new site, joins the comment-vs-code drift class):** Galaxy.jsx:24 "BRIGHTER = RECENTLY TOUCHED" — the render loop encodes no recency (App.jsx:4338-4341). First confirmed case of the drift class in user-facing chrome rather than comments. Fix at 60 plan 4.
- **[32] Armed silent cap:** Galaxy MAX_NODES 400 (App.jsx:4286) vs full-count header label (valsMisc.js:48); demo already claims 385 stars, so the real vault is near the trip point. 60 plan 5.

(accumulates across items — do not resolve inside one item)

- **[30] RESOLVED — shipped 2026-09-01 (commit b8f70d4, live on the server).**
  The sweep found the class was WIDER than the item-by-item audit: **14**
  spawn sites had an allow-list with no enforcement, not 3 (the extra 11:
  calendarCommand, distill, inbox, ingest, journalPrompt, noteSummaries,
  scanFood's photo lane, scanRecipe, shoppingList, studyLane, tweakRecipe).
  Seven passed `--allowedTools ''` — "no tools please" — while the model
  could write files and run shell. VERIFIED FUNCTIONALLY with a canary,
  not a self-report: old args wrote the probe file, `boundaryArgs('')` did
  not; a control lane allowed Read returned the canary, proving the probe.
  **Method note for future audits: asking a model to list its own tools is
  worthless** — the same prompt returned two different lists a minute
  apart, one naming "PowerShell". Fix: `server/lib/spawnBoundary.js` —
  lanes declare what they need, the module denies the complement, so the
  allow-list is enforced by construction. Replaced three drifted hand-lists
  (missing ListAgents/Workflow). `server/test/spawnBoundary.test.js` sweeps
  every spawn site so a 15th cannot appear.
- **[33] NEW (found while shipping [30]) — `healthMirror` page-builder test
  fails on the 1st of every month:** it seeds a row for the 2nd of the
  current month and asserts the partial marker renders, but the builder
  correctly drops future rows (test/healthMirror.test.js:24-34). A real
  test defect, unrelated to the boundary work; 712/713 otherwise green.
- [34] Named reference: Forge's failure-announcement design solves the
  [05] silent-auto-fail family ("dispatch-and-never-hear is the worst
  possible behaviour") — built/failed/stopped all announce with cost.
  Copy its shape to the auto-fail sites.
- [37] Named rail: *the honest middle* (leader.js:459-464) — "an approval
  he reflexively taps is not consent, it is friction pretending to be a
  gate. Auto-file with a real undo is the honest middle." Cite it whenever
  a new write path picks its mode.
- [37] Spaced-repetition now has two acknowledged, unshared implementations
  (librarySpacing, leader spacing). Joins the [12] twins sweep.

- [seeded from NOVA-CONTEXT §8, to verify per-item] No single conversational
  front door: watching a video, researching a link, and running a Claude Code
  job are separate surfaces with separate affordances. Hayden's own words.
  UPDATE at item 04: Ask Nova now routes captures, calendar, routine edits,
  rotation variants, preferences, profile, research, watch, and play from one
  conversation — the front door exists and works; the remaining gap is Claude
  Code dispatch (flagged as 04 plan item 6, decide at cross-cutting level).
- [01] Proactive Telegram sends bypass the rails/spokenLog inconsistently
  (Coach cadence: debrief logs, morning/missed/PR don't). Check every
  Telegram-sending agent for the same receipt gap.
- [09] Composition gated on transport: sessionDebrief skips composing
  entirely when Telegram is unconfigured — the artefact's existence depends
  on its delivery channel. Check every Telegram-delivered agent for the
  same conflation (compose-then-deliver should be the shape).
- [09] Named rail: the *sealed-facts call* (zero tools, all facts computed
  — sessionDebrief + greeting). Any future react-to-event lane should be
  held to it.
- [01] Event-driven sends triggered by a POST have no idempotency story
  (session save → PR/debrief). TRIGGER CONFIRMED at 46: session saves ride
  the offline outbox (App.jsx:2711) — a flaky-network finish replays the
  POST into a store with no dedupe. [01] plan 1 is now the Coach family's
  #1 ship. Check every save-triggered agent hook for the same.
- [01] Long-lived model sessions (Coach chat persists for days) refresh only a
  thin volatile line on resume. CONFIRMED for Ask Nova's PWA session at item
  04 (no day/age/turn guards at all, unlike the Siri spoken session). Check
  Leader / ClaudeCode tab for the same.
- [01] Multi-step vault writes are not atomic and their failure paths file no
  receipt (applyOps torn-write). Check every multi-file/multi-op write path
  (meal prep, money import, distill, compost) for the same hole.
- [01→02] Context assembly failure handling is inconsistent across model
  lanes: Coach names failed sections to the model; Daily Review swallows them
  silently. Audit every model lane's context builder for which side of this
  line it sits on; the named-failures NOTE should become a shared helper.
  Sites so far: dailyReview (02), askContext (04), planToday (06),
  quick-session route (08). Coach chat is the good twin.
- [08] Context rails are unevenly wired across sibling lanes: the injury
  log, deload signal, and block context reach Coach chat but not the lane
  that DESIGNS sessions. When auditing any model lane, diff its context
  list against its nearest sibling's.
- [02] Agents that propose actions rarely learn whether the action happened
  (Daily Review adjustments are fire-and-forget; Coach's adviceContext is the
  exception). CONFIRMED at item 06 for Plan Today — the most-decided kind on
  the board has no completion loop at all. Check Training Check, Meal Prep.
- [06] The flagship morning artefacts are mutually blind: the 07:00 plan and
  08:00 review compose over near-identical pictures with no cross-feed
  either direction. Open question for the synthesis: should they stay two
  records (two approvals) or become one morning artefact? Do NOT merge
  inside any single item's fix. EXPANDED at 11: by 08:30 four voices have
  spoken about recovery (brief, Coach card, morning insight, review) —
  three model-composed. The synthesis owns the morning-crowding question.
- [11] Retry-cap coverage is uneven across scheduled model lanes: review
  and plan cap at 3/day; health-insight retries hourly all day at $0.50 a
  try. Check every scheduled model lane for a missing cap (weekly debrief,
  brain week, CFO, meal prep, distill).
- [11] Model lanes without test files: healthInsight has none. Note any
  other untested lane found.
- [12] Exact-day scheduler windows with no catch-up: mealPrep fires only on
  Thursday (a slept Mac costs the week); weekly-guard-protected lanes can
  widen their windows for free. CONFIRMED sites: 12 mealPrep (Thursday),
  14 weekPlan (Sunday), 18 program audit (Monday), 21 CFO (1st-of-month —
  the most expensive: a slept 1st costs a whole month), 26 distill
  (Saturday). 15 weeklyDebrief needs the harder week-offset variant. Still
  to check: brain week, read-next Monday. THE FIX SHAPE, named at 27:
  Compost's age-based scheduler ("run when older than the cadence, tick
  daily") — immune by construction; adopt it fleet-wide.
- [27] Two agents, one population, no coordination: Compost can propose
  archiving captures the Distiller hasn't woven yet. When two loops share
  a population, check who yields.
- [21] TIME_VALUE_HOURS omissions now: meal-prep (12), coach-audit (18),
  cfo (21). One sweep adds all three.
- [21] The CFO is the only scheduled agent with no off/mode config — check
  remaining scheduled lanes for config parity as they're audited.
- [14] WORKOUT_RE duplicated verbatim in trainingCheck.js and weekPlan.js —
  unpinned twin; item 07's tightening must land in both or in one extracted
  module. Joins the [12] unpinned-twins sweep.
- [14] Open ownership question for item 15: ANSWERED — the Weekly Debrief
  does NOT read the filed week plan (holds the week against the program
  schedule only). Fix owned by 15 plan 1. Plan→week→debrief chain closes
  there.
- [15] Named rail: *the debrief remembers* (last-debrief-in-context +
  did-the-changes-happen contract, weeklyDebrief.js:165-171,184) — the
  follow-through loop 02/06/09/11 lack, already shipped here. Export it;
  don't reinvent per-lane.
- [15] Debugging-leftover class: a `|| true` defeats the week filter
  (weeklyDebrief.js:137) — "THIS WEEK" labels on rolling windows. Sweep
  filters for always-true/always-false leftovers.
- [16] Writer/reader state-shape mismatches inside one module
  (coachReflection stores boolean, reads it as message text — with a
  comment asserting the opposite). Round-trip tests for every state file.
- [16] NOVA_DATA_DIR honored by 44 lib files but NOT coachReflection or
  coachCadence (healthInsight's own fix comment names the lesson). Sweep
  all data-dir path builders. AT 32: a cwd-relative repo path
  (studyLane INVENTORY_REL) joins the path-discipline sweep — likely
  blanking the study brief's capability-diff section under launchd.
- [16] Silence-with-a-receipt (quiet_reason) — a template-worthy pattern:
  agents that may stay quiet should record why. Joins the noticer-loop
  template list. SECOND FORM at 28: the pattern scout's zero-proposal run
  marker files "nothing cleared the bar this week" as an auditable record
  — receipted silence at record level. Same pattern, two shapes; export
  together.
- [12] TIME_VALUE_HOURS coverage is partial: meal-prep records never expire.
  Check every recurring record kind for a missing expiry.
- [12] Unpinned cross-module category/format twins held by discipline alone
  (mealPrep AISLE vs SHOPPING_CATEGORIES; the review-pick hash at 05).
  Sweep for shared literals without a pinning test.
- [13] Named template: the *noticer loop* (foodSuggest — thresholds +
  anti-flood cap + permanent-no + rails/undo + documented trade-offs +
  tests, 134 lines). Future noticer agents should be held to it. Also:
  permanent-no blocklists with no material-change escape valve — check
  Pattern Scout and read-next for the same one-way valve. AT 17: the
  opposite pole found — week-keyed findings re-raise after an argued-down
  no (under/junk kinds). Both poles want the same material-change +
  cooldown design; fix once, apply per-lane.
- [17] Records whose display text is mutated in place (nudgeLine rewrites
  record.text; nudge 2 wraps nudge 1). Keep original lines immutable;
  derive display text. Check every nudging/re-raising agent.
- [19] Correct-once coverage is uneven: standing instructions, progression
  tunes, and coach learnings compound; ledger category fixes do not
  (setTransactionCategory teaches nothing). When auditing any surface with
  a manual-fix affordance, ask whether the fix compounds.
- [40] Named exemplar: the shared-gate comment (healthDrops — "a guard
  living in only one writer is how the 9→10 Aug clobber happened") is rule
  7's best statement; and store-and-forward via iCloud drops is THE answer
  to the sleeping-Mac class at the data layer — the [12] scheduler fixes
  are its scheduling-layer siblings.
- [19] Named rail: *dedupeKey as exported contract* (money.js — one
  identity shared by imports/captures/scans/undo, returns-only-inserted).
  The idempotence shape 01's session-save fix should copy.
- [20] Counted-but-unseen drops: "K unparseable lines skipped" names a loss
  without showing it (moneyImport reason line). When a process reports a
  drop count, check whether the dropped content is inspectable anywhere.
- [20] Silent value-defaulting on parse failure (scanStatement stamps TODAY
  on bad dates) — a confident guess in a key field that also defeats
  dedupe. Check every normalizer's fallback values for guess-vs-drop.
- [22] Hand-maintained coverage lists rot: Guardian's LOOP_CADENCE_HOURS
  (13 of 20+ beats) and STORE_FILES (re-drifted after its own recorded
  fix). SHARPENED at 57: ops.js's SCHEDULED roster (29 entries, with the
  drift incidents in its comments) IS the registry — export it with
  cadences; Guardian, the ring, and fleetRosterContext share one list.
  Check KIND_AGENT, push labels, learning KIND_LABEL, and TIME_VALUE for
  the same drift class — every kind-keyed map is a suspect.
- [22] The yesterday-partial health logic is an unpinned twin (dispatch
  steps-gap vs guardian health-feed). Joins the [12] twins sweep.
- [06] Home-surface state filters that exclude `error` render failures as
  absence (valsMission planRec filter). Check every Mission Control card's
  status filter for the same hole.
- [45] Naming collision on the home screen: the "DAILY REVIEW · CONCEPT"
  card is the spaced concept-revisit, not the Daily Review agent — whose
  artefact has no home presence at all. Names should follow the flagship.
- [45] Phone-width verification could not be captured this pass (browser
  window refused sub-desktop resize); mob branches code-verified only.
  Open item for every surface audit until a resizable client or the real
  phone is used. Demo-mode honesty trifecta VERIFIED pixel-real.
- [03] Deterministic checkers whose source reads fail silently render
  "couldn't check" identically to "checked and clean" (fuelCross catch-to-
  empty). CONFIRMED 4th site at item 07 (trainingCheck 'no workout data'
  skip); 5th at 14 (weekPlan calendar → "clear week" in the vault); 6th at
  18 (the audit itself — source failures wear the young-data costume).
  NAMED RAIL at 18: *the three-state receipt* (fired/clear-with-number/
  not-yet-with-gap) + the proposed fourth state (couldn't-look). This is
  the platform-wide fix shape. Check Guardian, pattern scout, money import.
- [18] mondayOf now counted at 3 copies (dispatch, weeklyDebrief,
  coachProgramAudit) beside trainingAnalytics's canonical export whose own
  comment claims to be the single key. Joins the [12] twins sweep as its
  largest instance.
- [07] Streak semantics: workoutStreak counts consecutive DAYS, so rest
  days reset it — a perfect Push/rest/Pull week reads as streak 1, and the
  missed-nudge calls it a "session streak". Schedule-aware streak proposed
  (07 plan 7); check every streak-quoting surface once fixed.
- [07] Reconciliation records exist but downstream engines ignore them
  (filed training-checks don't count toward streaks). When an agent
  confirms a fact onto the rails, check who else should be reading it.
- [10] Burn-before-delivery: state marking an event "done" is written when
  work is DISPATCHED, not when it lands (greeting localStorage, coach
  raise-marker, fuel-cross raise timing; 4th site at 23 — the follow-up
  proposal dismisses before its receipt lands). Check every
  once-per-day/once-per-week guard for which side it writes on.
- [23] Ephemeral client-side rails where durable records were the point:
  the calendar follow-up questions live only in view-model state, today
  only. Check other client-computed proposals (compost nudge, etc.) for
  behaviors that should be records.
- [23] Keyword detectors: WORKOUT_RE ×2, TASK_HINTS, CATEGORY_HINTS (49 —
  lowest stakes), plus money's CATEGORY_KEYWORDS (19, has the override fix
  planned). One extraction + one real-data replay covers the calendar-
  facing three; the category guessers stay local but get listed.
- [49] ANSWERS [14] plan 7's gate: the to-do line format has NO due-date
  field (verified). The weekPlan deadline-placement idea either gets a
  scoped 42/49 build (map Todoist due dates into todoLine, both
  directions) or gets dropped honestly. Synthesis decides.
- [24] Spawn-and-settle model jobs have no runtime watchdog — a hung child
  leaves 'classifying' until the next boot reaper (researcher confirmed;
  review/plan/debrief/insight share the shape). One shared settle-timeout
  helper covers the family. DONOR SHAPE found at 43: overnight's 8-min
  per-item poll timeout with the honest "may still land" message.
- [26] Named rail: *the staged pass* (distill — model writes freely in a
  sandbox; code diffs, stamps priors, applies behind all-files-first drift
  refusal, full undo). How every future vault-wide model edit should work —
  and the all-then-write ordering applyOps ([01]) should converge on.
  AT 33: the rail's most powerful consumer (ingest deep weave) has NONE of
  it — no drift check, no priors, no undo record, no rails receipt
  (approveJob verified). Doctrine rule 2's "no exceptions" has an
  exception. One shared apply/undo helper unifies distill + ingest +
  applyOps — three write paths, one shape. SYNTHESIS-READY.
- [26] Error messages describing behavior that doesn't exist (distill's
  "may have pruned it" — no pruner exists). Sweep error strings against
  reality.
- [26] Comment-vs-code sort mismatch ("oldest first" vs alphabetical) —
  joins the [15] debugging-leftover / comment-drift class.
- [10] Once-a-day memories still living per-device in localStorage after
  the briefState lesson (greeting confirmed; ritualDone CONFIRMED at 47 —
  the morning invitation can re-offer on a second device. One server-side
  delivered-state migration covers greet + ritualDone together).
- [47] Verification-culture evidence: Voice.jsx carries five comments
  citing recorded real failures with fixes in place — the standing
  visual-verification rule demonstrably operates. The [39] TTS-cache
  question RESOLVED (bounded, 160 entries, reasoned).
- [03] Decline reasons are captured by the why-chips but consumed by almost
  nothing (fuel-cross re-raises identically; only Coach's advice loop reads
  them). Check every re-raising agent for capture-without-consumption.
- [48] Two independent autonomy engines exist: the server-side agent-mode
  ladder ([29]) and the client-side inbox-mode ladder with its own
  step-back proposals (valsInbox:160-195). Deliberate twins, different
  stores — synthesis should decide whether to unify or explicitly pin them.
- [29] SYNTHESIS-READY: the respect-the-no family is now four confirmed
  sites — foodSuggest eternal-no (13), program review week-key re-raise
  (17), pattern scout re-propose (28), autonomy weekly re-nag (29, the
  worst: guaranteed cadence). One shared cooldown+material-change helper,
  four consumers. Compost's arbitrary 200-slice (27) makes five.
- [03] Finding-history state exists (raise dates) but persistence/trend is
  never computed — agents report the same red finding weekly with no memory
  of how long it has been red. Check program review and Guardian for the
  same thrown-away longitudinal signal.
- [05] Auto-mode failure fallbacks land work in the pending queue without
  notifying — but auto-mode users don't watch the queue (dispatch auto-file
  catch; Daily Review's error path similar). Check every auto-capable lane's
  failure notification story.
- [05] The written morning brief (composeDispatch) and the spoken Morning
  Show (composeShow) are sibling composers over the same sources — same-
  morning drift is possible. At items 39/47, diff a real morning's outputs;
  extract shared fact-helpers only if they actually diverge.

## Verdict table

| # | Item | Verdict | Highest-value next action |
|---|------|---------|---------------------------|
| 01 | Coach | Keep as-is / Refine | Idempotent session save + once-per-session PR/debrief guard |
| 02 | Daily Review | Refine | Review continuity + adjustment follow-through (extend adviceContext rail) |
| 03 | Fuel × Training | Keep as-is / Refine | Honest source-failure reporting (couldn't-check ≠ all-clear) |
| 04 | Ask Nova | Keep as-is / Refine | Named absent context sections (shared helper with 02) |
| 05 | Dispatch | Keep as-is / Refine | Afternoon protein-pace nudge (rescue the floor while food can fix it) |
| 06 | Plan Today | Refine | Priority completion loop + cross-feed with Daily Review (one build) |
| 07 | Training Check | Refine | Approved checks preserve the streak (one Set union in computeStreaks) |
| 08 | Quick Session | Keep as-is / Refine | Injuries in the design context (safety-shaped one-line add) |
| 09 | Session Debrief | Keep as-is / Refine | Carry-forward memory (the pointed carry must meet the next session) |
| 10 | Greeting | Keep as-is / Refine | Server-side greeting memory (apply the briefState lesson to its sibling) |
| 11 | Health Insight | Refine | Retry cap parity — the one silent failure that spends real money all day |
| 12 | Meal Prep | Keep as-is / Refine | Thursday→Saturday catch-up window (a slept Mac shouldn't cost the week's shop) |
| 13 | Food Scout | Keep as-is / Refine | Material-change re-proposal (remove the one-way valve from the flywheel) |
| 14 | Week Plan | Keep as-is / Refine | Honest calendar-failure line (a filed plan must not assert a week it couldn't see) |
| 15 | Weekly Debrief | Keep as-is / Refine | Structured CHANGES reaching Plan Today + Daily Review (the weekly→daily bridge) |
| 16 | Coach Reflection | Keep as-is / Refine | Fix the outreach state shape (boolean-as-message-text corrupts its own memory) |
| 17 | Program Review | Keep as-is / Refine | Honour the argued-down promise across weeks (the module's own manners contract) |
| 18 | Program Audit | Keep as-is / Refine | The fourth state: couldn't-look (the founding rule applied to its own plumbing) |
| 19 | Money | Keep as-is / Refine | Merchant-override learning (correct-once doctrine, extended to the ledger) |
| 20 | Money Import | Keep as-is / Refine | Show the skipped lines (the one place approved data loss can hide) |
| 21 | CFO | Keep as-is / Refine | Mid-month pace check — the platform's first mid-course money signal |
| 22 | Guardian | Keep as-is / Refine | Derive the loop watch from reality (the watcher covers half the fleet) |
| 23 | Commander | Refine | Server-side follow-up sweep (Training Check's shape, applied to calendar tasks) |
| 24 | Researcher | Keep as-is / Refine | Citation integrity validation (check what the gate claims to guarantee) |
| 25 | Studio | Keep as-is / Refine | Enforce the Drawn-from contract (the honesty claim, made structural) |
| 26 | Distiller | Keep as-is / Refine | Leave-alone memory (stop re-paying $3/week for pages already declined) |
| 27 | Compost | Keep as-is / Refine | Sequence Compost behind the Distiller (hygiene must never outrun weaving) |
| 28 | Pattern Scout | Keep as-is / Refine | Never re-propose a declined proposal (start learning from his "no") |
| 29 | Trust Ladder | Keep as-is / Refine | Decline memory as the shared respect-the-no helper (worst of 4 family sites) |
| 30 | Librarian | Keep as-is / Refine | URGENT: the disallowed-list sweep (three lanes' tool boundaries may not be real) |
| 31 | Brain Week | Keep as-is | Fold the Sunday-window widening into the fleet-wide [12] fix |
| 32 | Study Lane | Keep as-is / Refine | Fix the cwd-relative inventory path + verify live (the diff section may be blank in prod) |
| 33 | Watcher | Keep as-is / Refine | Unify the staged-pass apply — rule 2's last open door, at the largest writes |
| 34 | Forge | Keep as-is / Refine | Scoped proof capture (the full-screen screenshot is a privacy hole) |
| 35 | Breaker | Keep as-is | Seed the focus with the real git diff, whenever the Code tab is next touched |
| 36 | Scout | Keep as-is | Tighten existing-page matching (guard the deepen-don't-fork promise) |
| 37 | Leader | Keep as-is / Refine | A leaderLiveLine — the continuing conversation should know its own morning |
| 38 | Pulse | Keep as-is / Refine | Novelty memory — repeats must not wear fresh labels |
| 39 | Brief Warm | Keep as-is / Refine | Warm the evening — the killed incident still happens nightly at 21:00 |
| 40 | Health Mirror + Drops | Keep as-is | Mirror the month a late correction lands in (one queued set away) |
| 41 | Reminders | Keep as-is | Late-fire honesty — a missed nudge should say it was missed |
| 42 | Todoist Sync | Keep as-is | Gated deleted-vs-completed check (deleted ≠ done) |
| 43 | Overnight | Keep as-is / Refine | The failed-item story: retry once, reconcile late landings, fix the line |
| 44 | Calendar Watch | Keep as-is | Nothing to fix — the agent roster closes clean |
| 45 | Mission Control | Keep as-is / Refine | Land [06] error state + [11] age chips; fix the review naming collision |
| 46 | Workouts | Keep as-is | Ship [01]'s idempotent save first — the outbox replay trigger is CONFIRMED here |
| 47 | Voice | Keep as-is | Land [04]'s three fixes — this glass is where they'll be felt |
| 48 | Inbox | Keep as-is | Land the five owned UI halves (02/03/06/20/23) in one pass |
| 49 | Todos | Keep as-is | The due-date decision, now precisely posed (map from Todoist or drop [14]'s idea) |
| 50 | Recipes (Fuel) | Keep as-is | Land [03]'s card items; §8's USDA macro fix VERIFIED at its source |
| 51 | Money (screen) | Keep as-is | Honest 120-row cap note; [19]/[21] land here with no UI change |
| 52 | Journal | Keep as-is | Nothing proposed — a quiet, correct surface |
| 53 | Library | Keep as-is | Provenance-first shelf; [30]'s gap→research wiring lands in its add flow |
| 54 | Notes | Keep as-is | The prefetch comment is a model of engineering honesty; nothing new |
| 55 | Shopping | Keep as-is | SHARPENS [12] plan 5: stop stripping amounts — the keeper already exists |
| 56 | Stash | Keep as-is | Nothing proposed |
| 57 | Ops | Keep as-is | The [22] registry lives here already — export SCHEDULED, Guardian consumes it |
| 58 | Settings | Keep as-is | The model board is the registry pattern [22]/[57] want for the scheduler fleet |
| 59 | Leader (screen) | Keep as-is / Refine | Staleness ages shown to the model but not to him — chips should carry their age |
| 60 | Galaxy | Refine | No layout algorithm — random stars over real edges; caption fiction; armed silent cap at 400 |
| 61 | Ambient | Keep as-is / Refine | Numbers honest via CountUp's null contract; captions and room wash conflate couldn't-check with clear |
| 62 | ClaudeCode | Keep as-is / Refine | CAN/CAN'T card verified true against the real boundary; codeModelOptions is a hand-duplicated twin of the board |
| 63 | MissionStructured | Keep as-is | Time-banded ordering is a top mission-alignment idea; three hand order arrays need a one-line permutation assert |
| 64 | NovaBar (Mac) | Keep as-is / Refine | Model thin shell, verified running; origin-blind mic grant + no quit menu + blank-panel failure state, all L |
| 65 | Phone widget | Keep as-is / Refine | Honesty rules survive a third-party runtime; dead top3 payload fields and a missing #/leader deep-link |
| 66 | Telegram bridge | Keep as-is / Refine | The human gate as buttons on the same rails; non-text messages get silence — the one honest-degradation miss |
