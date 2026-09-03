# August 2026 full-platform audit — completion record

What was actually done against each of the 66 reports, item by item, with the
commit that carried it and the reason for anything deferred. This lived in
`design/SESSION-HANDOFF.md` while the programme was running and grew to 547
lines; the programme finished on 3 September 2026, so it moved here — the
handoff carries live state, and this is history.

Read it when you want to know why a §6 item is not in the code: every entry
is either MET with its commit, met by another item, or deferred with the
evidence that argued against it (a detector that fired 22 days in 25, a
ledger with no transactions, a capture API the platform cannot reach
cheaply).

The audit's own reports are the numbered files beside this one; the plan
each was executed against is `99-SYNTHESIS.md`.

## Per-item record (roster order)

- Guardian snapshot bug — MET (`c804179`). `checkBackups` sorted full paths
  and crowned a 20-day-old Topics/ file "newest" (false warn for 20 days).
  Now ordered by the ISO stamp; the card names the newest write's day.
- Tier 1 staged-pass unification — MET (`5aa9b78`). `lib/stagedPass.js`;
  distill uses it; ingest gains drift refusal + receipt + undo; coach
  applyOps plans in memory and lands all-or-none.
- Tier 2 #6 couldn't-look state — MET (`d51a2d0`). `lib/sources.js`;
  seven sites (fuel cross, program audit 4th state, week plan, training
  check + heartbeat notes, Ambient 'unknown', Mission plan 'error'; Guardian
  already had it).
- Tier 2 #7 respect-the-no — MET (`1db0765`). `lib/respectTheNo.js`;
  program review (28d/20%), trust ladder (60d/25%), food scout (60d/2×,
  once), pattern scout (declined context), compost (per-key dates, 90d).
- Tier 2 #8 settle watchdog — MET (`b19cf8d`). `lib/settle.js`; 29 spawn
  sites in 27 files, per-lane minutes visible at each site; the honest
  reason lands on stderr where every site reads its failure. Interactive
  Code tab, Forge, study runner and watch script keep their own.
- Tier 2 #9 named absence — MET (`a3395af`). `lib/contextSections.js`
  (gatherContext: EMPTY vs FAILED); Daily Review, Plan Today, Ask Nova (+
  resumed refresh), quick session; Coach chat keeps its shape, shared NOTE.
- Tier 2 #10 burn on landing — MET (`b490c83`). briefState gains
  greet + rituals (server-side, cross-device); greeting asks the server on
  a new day and stamps on delivery (15-min retry backoff); rituals mark on
  reply-on-screen (onDelivered hook); Coach skipped-work cooldown stamps on
  the answer (startAskCoach onReady); follow-ups dismiss on the receipt.
- Tier 2 #11 twins — MET (`36d43ef`). cadence.js mondayOf/mondayIso (six
  copies → one); calendar.js WORKOUT_RE; dispatch.js dateHashIndex pinned
  (the client hashed the UTC date — real drift before 10:00); healthData
  yesterdayStepsShape; spacing.js (schedules pinned); Code tab's models from
  the board via a snapshot slice. `twins.test.js`.
- Tier 2 #12 path discipline — MET (`c0117df`). Three stores (not two)
  honor NOVA_DATA_DIR; studyLane's inventory resolves from import.meta.url
  (launchd cwd is nova-os/server — confirmed live; the section had run
  empty in production); intent's code job runs at the repo root.
  `pathDiscipline.test.js` scans the source.
- Tier 2 #13 truth in copy — MET (`adbe89d`). Debrief week window real
  (`|| true` gone), nutrition says LAST 7 DAYS; distill oldest-first + a
  real 30-day pruner + true messages; Galaxy caption no longer promises
  recency.
- Tier 2 #14 time-value + parity — MET (`9578a06`). meal-prep/coach-audit
  8d, cfo 14d expiries; cfo + meal-prep are DETERMINISTIC lanes on the model
  board (switch, no picker; setLanePref rejects a model for them).
- Tier 3 #16 follow-through — MET (`eb5b930`, `b6870b7`). Streaks count
  approved training checks and walk SCHEDULED days (rest days neither count
  nor break; unit 'sessions' vs 'days' on every reader — his real streak
  reads 5 sessions); the Daily Review reads yesterday's review + fate; the
  plan's top 3 can be marked DONE/SKIP on the record (POST
  /api/inbox/:id/priority) and tomorrow's plan reads the outcomes.
- Tier 3 #17 pocket set — MET (`76bab3c`). Telegram answers non-text with
  one honest line (photo→scan and voice→ask remain named gaps); large
  widget renders top3 (his phone's script must be re-pasted — mac/README);
  NovaBar: origin-scoped mic grant, right-click Reload · URL · Quit, inline
  "NOVA UNREACHABLE — Retry". Rebuilt with swiftc, relaunched (running from
  the new binary).
- Tier 3 #15 Galaxy — MET (`b66093a`). `src/galaxyLayout.js` seeded force
  layout at build time (tested from node), degree-sized stars, selection
  lights its neighbourhood, honest cap label. Plan items 6–8 — MET (2 Sep,
  after the phone pass): pinch-zoom + one-finger pan (pure view maths in
  galaxyLayout.js, tested: the star under the fingers stays put, the graph
  can never be panned out of frame, 1×–6×), wheel zoom on desktop, double-
  tap or RESET VIEW to return; legend chips are filters (multi-select, CLEAR
  FILTER); overlays RECENCY (each page's own date → brightness; undated dim,
  said so) and COMPOST (the live candidates lit in the warn colour, count on
  the HUD, honest under a filter). Stars scale sub-linearly with zoom;
  labels are placed greedily without overlap (selection, its 8 best
  neighbours, then on-screen hubs, ≤40). A REVIEW-DUE overlay is NOT
  offered: no due data reaches the client (the study lane has none), and a
  chip that never lights would be a dashboard lie — named gap.
- Tier 3 #18 per-item remainder — IN PROGRESS. Shipped so far: [17] nudge
  text no longer compounds (`e3b99e4`); [24] citation gate checks integrity
  (every cited number → a Sources entry with a URL) + retry keeps the gate's
  model (`e3b99e4`); [07] plan 6 WORKOUT_RE VALIDATED on his real calendar
  (736 events/120d, 115 matches, all "Workout"/"Workout / Steps 👟", zero
  false positives — left as is, pinned) (`e3b99e4`); [66] plan 2 Telegram
  photo → food scan → pending 'food' record with ✓/✕ (`11abed0`); [29]
  plan 2 Weekly Debrief on the trust ladder + twin notes on every mode
  config (`0d9e899`); [66] plan 3 Telegram voice note → Whisper (Groq first,
  OpenAI fallback, keys from ~/.config/watch/.env) → "Heard: …" → answerAsk
  (`b06b449`). Phone-width path now exists (devtools emulate). [60]
  Galaxy 6–8 shipped (see Tier 3 #15). [07] plan 2 + a minimal plan 3 — MET (2 Sep): the
  training-check card's Discard asks WHAT HAPPENED with four chips, each
  consumed on the server (trainingCheck.resolveTrainingCheck via
  inbox.discardRecord, which now takes { vaultPath }): "Swapped for active
  rest" journals an undoable active-rest receipt (kind journal, parentId =
  the check) while the check stays declined (a walk is not a session);
  "Logged elsewhere" files the check as trained with the truth in the line;
  "Doing it tonight" carries — tomorrow's check names the promise, and with
  nothing planned tomorrow a check is still raised for yesterday's session
  (payload.date = yesterday; streaks read payload.date, twin note); "Didn't
  happen" feeds the MISS MEMORY (missMemory: scheduled weekday vs
  logged-or-reconciled over 4 weeks, ≥2 misses → a line for the Coach chat
  context and the Week Plan). Free text stays a plain declineReason. Legacy
  checks parse name/date from title/createdAt. Card render at 375 UNSEEN
  (no pending check existed during the pass — the panel is the existing
  why-chips UI with new strings). [02] plan 7 + the §7 per-adjustment rows — MET (2 Sep):
  discarding a review asks why once (Off-base / Already knew / Not
  actionable / Too busy today; free text too) — the reason already rode the
  yesterday-review section; the review record now carries
  payload.adjustments structured (compose returns them), each row on the
  Inbox card takes DONE / NOT TODAY through the same POST
  /inbox/:id/priority (dispatched by kind → dailyReview.setAdjustmentOutcome,
  twin of planToday's), and tomorrow's context quotes HIS MARKS with a
  never-re-issue-a-NOT-TODAY-unchanged rule. Reviews composed before 2 Sep
  have no structured adjustments → no rows (nothing to mark). Card render
  at 375 UNSEEN (today's review predates the change). #18 roster: [01] Coach §6 — MET
  (2 Sep): items 1, 2, 6 were already shipped (idempotent save + replay
  guard, atomic applyOps, raise-marker on the answer); built now: 3 the
  resumed-turn live line carries open injuries, active tunes (held lifts
  named), the last 7 days' proposal outcomes with his decline reasons, and
  the progression engine's current earned/held counts (each read names its
  own failure); 4 every cadence send leaves a spokenLog receipt
  (coach-morning / coach-missed / coach-pr) and the scheduler notes ARMED,
  NO CHANNEL on the heartbeat when Telegram is unconfigured; 5 the quality
  hold-and-coach reaches RPE-tuned lifts (grinding at RPE 10 with flat or
  backwards e1RM); 7 the auto session receipt is write-then-flip and a
  failed flip after a successful write marks the record 'error' naming the
  torn state (settleAutoReceipt, injected fns, tested) — approving can
  never write the line twice; 8 resting heart rate joins the deload signal
  at ≥8% (3-day avg vs 7-day baseline; REPLAYED on his real history first:
  fired 21 Aug beside a 13% HRV drop and 28 Aug alone, while 4–6% caught
  single-day noise); 9 the morning card names an open moderate/serious
  injury (niggles stay chat-only). [02] Daily Review §6 — MET (2 Sep): 1 was
  already the gatherContext rail, 2 and 7 shipped earlier today; built now:
  3 today + tomorrow as HH:MM lines, capped PER DAY (4) and naming the cap
  (his real 2 Sep had 8 events by noon — one shared cap hid tomorrow
  entirely; caught on the live context build); 4 the "HOW TODAY IS GOING"
  evening section rides only on runs ≥ 15:00; 5 the latest weekly debrief
  section (twin: askContext.js); 6 the fleet's 48h receipts (fleetContext);
  8 the day's third failed compose sends one push naming the retry
  (reviewFailed → failedAttemptsToday, REVIEW_MAX_ATTEMPTS=3). Live context
  build (read-only, env loaded): calendar detail present, debrief present,
  fleet present, zero FAILED sections. [03] Fuel-cross §6 — MET (2 Sep): 1 was Tier 2's
  couldn't-look; built now: 2 cut-goal joins (goalWantsCut — a recomp
  matches both sides; rest days out-eating training days ≥300 kcal, and
  training days ≥250 over target on a cut); 3 persistence — every raise is
  remembered (coach-cadence.json fuelRaisedHistory), three consecutive
  weekly raises append "Nth week running" and lift severity one step, and a
  finding red ≥2 weeks that stops firing earns one filed "closed" receipt
  (fuelClosed, once per closing); 4 his reasoned no waits 28 days unless the
  finding's own metric moved ≥15% (respectNo; every finding now carries
  `metric`), and fuel-cross records ride the Coach's advice-outcome context;
  5 floor-most-days carries data + a card; 6 the protein-timing join
  (post-training-protein: timed entries only, ≥5 timed training days, ≥50%
  under 25g within 3h) — FEASIBILITY READ FIRST: 111 of 137 entries carry a
  clock time; REAL-DATA RUN: fires on 5 of 8 timed training days, and the
  cut join fires at 872 kcal (rest 2888 vs training 2017). Three cards added
  (floor-pattern, kcal-days, post-training). Both new findings will land in
  his Inbox on tomorrow's 07–12h cadence tick. [04] Ask Nova §6 — MET (2 Sep): 1 was Tier
  2's gatherContext; 6 (CODE directive) DECLINED by the synthesis (the Forge
  is the front door); built now: 2 PLAY says "FOUND — COULDN'T OPEN" (warn
  tone, link in the foot, prose says so) when the browser open fails
  instead of NOW PLAYING; 3 the PWA /ask session is guarded like the spoken
  one (lib/askSession.js: new day / >24h / 40 turns → fresh session, id
  dropped, client persists the minted one) and resumed turns now carry his
  CURRENT standing rules + learned preferences (resumedRefreshContext takes
  vaultPath); 4 reflexes for sleep last night, resting heart rate, and
  "what's on today" / "what's next" from the WARM calendar cache only
  (calendar.peekCachedEventsForDay; cold → the model) — the server log shows
  his real reflex asks were HRV ×2, steps, protein; 5 every numeric reflex
  carries a metricCard the client puts on the glass (resp.card on the two
  voice call sites); 7 ledger/digest say "8 of N shown — the rest are on the
  Ops screen" / "10 of M shown — the rest are in his Inbox"; 8
  dropAskContextCache() on every successful write (index.js chokepoint).
  Live reflex replies and the reflex card render UNSEEN at 375 (a live
  /ask check follows the deploy). [05] Dispatch §6 — MET with one REJECTION (2–3 Sep): 1
  an auto brief that fails to file now pushes "hit a snag — waiting in your
  Inbox"; 3 the evening brief closes the day's loops ("N still open —
  oldest: … (added …) · M ticked off"; "checked today" is NOT claimed — the
  to-do line records no completion date); 4 the weekly brief shows the body
  (HRV + sleep averages week-on-week at ≥3 logged days a side; bodyweight
  trend line) — live: "HRV averaging 65 ms (last week 66) over 3 days",
  "82 kg, −0.7 kg over 26 days"; 5 was already pinned (twins.test.js); 6
  tomorrow's events say "+N more" and the weekly vault line says "latest 3
  of N"; 7 GATED — the real-morning diff of composeDispatch vs composeShow
  showed no shared fact diverging (steps identical; the show simply speaks
  fewer beats), so no helper extraction. 2 (afternoon protein-pace nudge)
  REJECTED ON HIS REAL LOG: at every hour 16:00–21:00 and threshold 40–70%
  it would have fired on 22–25 of 25 logged days (his protein lands late;
  the floor is missed 21 of 25 days regardless) — daily nagging with no
  discriminating signal; the weekly floor-most-days finding and the Fuel
  hero's gap coaching already carry the truth. [06] Plan Today §6 — MET (3 Sep): 1, 3, 6 were
  in; built now: 2 the morning siblings cross-feed both ways (the review's
  context carries TODAY'S PLAN with marks; the plan's context carries THE
  LAST DAILY REVIEW, ≤2 calendar days old); 4 goals in the plan context; 5
  learned preferences in the plan context + why-chips on a declined plan
  (Too ambitious / Wrong focus / Already planned / Not today) consumed by
  the yesterday-plan section ("his reason: … never re-issue what he
  declined unchanged"); 7 the third failed plan of the day pushes (parity
  with the review); 8 GATED → shipped containment-only: replayed on his 28
  real plans (84 priorities), every correct match was a to-do named
  verbatim inside a priority and every token-overlap match was a paraphrase,
  so a priority carries todoLines only by whole-text containment and a DONE
  tap ticks those to-dos through the to-do rail (never unticks; the record
  says checkedTodos). [07] — MET: 1, 5, 6 were in (Tier 2/3), 2, 3, 7
  shipped 2 Sep; built now: 4 the check waits while today's calendar
  workout is ahead or under way (90 min assumed without an end), capped at
  21:30 — the likely cause of his 15-for-15 dismissals (asked at 19:00
  before an evening session). [08] Quick Session §6 — MET (3 Sep): 5 was the
  gatherContext rail; built now: 1 the injury log rides the design context
  (twin of the Coach chat's) and the prompt says work AROUND it and name the
  substitution; 2 the recovery section carries the deload VERDICT (design
  LIGHT when yes) and the training-block phase; 3 muscle groups on every
  library and recent-session exercise line (the don't-hammer rule's fact);
  4 the Coach's one-line rationale rides the session — client session
  object → finish payload → completeSession persists it (≤300) → the
  session debrief quotes "why this session existed". [09] Session Debrief §6 — MET (3 Sep): 5 was the
  replay guard; built now: 1 carry-forward memory (lib/debriefMemory.js,
  server/data/debrief-memory.json: per routine + per session; the next
  same-routine fact sheet quotes YOUR LAST DEBRIEF FOR THIS ROUTINE, never
  its own; the Coach chat gets WHAT YOU SAID AT THE RACK); 2 in-app delivery
  — the debrief composes regardless of Telegram (kill-switch kept), GET
  /workouts/sessions attaches coachSaid, the history row renders COACH SAID
  (+ a CUT SHORT line); 3 one recovery line in the facts; 4 a cut-short
  session names what was pushed forward and when it is due. debriefFacts is
  extracted and tested with injected deps. History render at 375 UNSEEN.
  [10] Greeting §6 — already MET (1, 2 in Tier 2
  #10; 3 the banner already opens Voice on tap). [11] Health Insight §6 —
  MET (3 Sep): 1 (retry cap) and 6 (test file) were in; built now: 4 insight
  memory — the last insights ride the same insight.json (history, keep 6)
  and the context carries the last three with the never-repeat / follow-up-
  once rule; 2 three honest empty states on the Home card (no health data ·
  "Nothing worth flagging today — signals look steady." on a fresh quiet run
  · not yet today); 3 age chips on insight items (fresh = none; "YESTERDAY
  EVENING"); 5 TALK IT THROUGH → opens Voice with the insight as the
  question's subject (askAboutInsight → sendLiveTalk). Card render at 375
  checked on the dev server — and that check surfaced an honesty gap
  in the client's connection rule, PARTLY explained: the dev tab (a long-
  lived document — hash-only navigations never reload; use type:'reload')
  sat on "OFFLINE · Backend unreachable — showing data saved 23:45" for
  hours while every request answered 200 and full snapshots kept landing
  every 5 min. The rule: okCount > tasks/2 (30 tasks; the snapshot serves 38
  slices, each on a 6s budget — a cold server's calendar slice took 7.9s in
  the log). A snapshot that ANSWERED can therefore still read as
  "unreachable" — a lie about a server that spoke. FIXED (3 Sep): reachable
  ≠ fully synced — a 200 snapshot keeps the chip LIVE; if most slices missed
  the banner says "Backend answering slowly — N of M sections refreshed,
  fetching the rest…" (st.syncDegraded) and a bounded 5s re-sync (≤3)
  fetches the rest; only a failed snapshot AND a fan-out with nothing
  fulfilled reads offline. A REAL reload against a freshly restarted server
  came up "connected" within a second with no degraded banner, so the
  hours-long OFFLINE was the stale document (HMR-patched across several
  service reloads), not a clean reproduction — the fix stands on the
  mechanism, not on that tab. [12] Meal Prep §6 — MET (3 Sep): 1 (Thu→Sun
  catch-up window), 4 (expiry, 8d), 6 (aisle twin pinned) were in; built now:
  2 the SHORT warning carries a computed fix (floorFix: the one swap from the
  bank or the slot's alternates that closes the most gap, suggested only
  when it clears the gap or half of it — else "the gap stands"); 3 off-plan
  regulars join the items labelled source "off-plan regular ×N", excluding
  anything already a chosen recipe (his yoghurt-pouch snack is on-plan, not
  a regular); 5 quantities, GATED and shipped: his lines carry a leading
  amount 78% of the time; the same ingredient is summed only when every
  occurrence shares a unit (1kg+500g → ~1.5kg; 10+2 slices → 12 slices),
  otherwise no number; amounts ride the shopping list's own `amount` field
  and the card preview. AND A BUG the real compose exposed: recipe
  ingredient lines are { qty, name } objects, and toShoppingItems treated
  them as strings — every meal-prep list would have been one "[object
  Object]" item (no meal-prep record has ever been filed, so nobody saw
  it). Real compose now: 34 items, 30 with amounts, 2 regulars. [13] Food Scout §6 — MET (3 Sep): 1 was Tier 2's
  respectNo (60d / 2× / once); built now: 2 the portion-variance flag — the
  food history keeps every logged portion's kcal and carries the LATEST
  portion's macros (it used to keep the first seen); a >30% spread appends
  "Portions varied across your logs (min–max kcal) — this saves the latest";
  REPLAYED on his real recurring foods: every one is steady (rotation slots
  log fixed macros), so it will rarely fire — correctly. [14] Week Plan §6 —
  MET: 1 (couldn't-read calendar), 4 (shared WORKOUT_RE) were in; 3 flagged
  to [15]; 7 (deadline to-dos) DROPPED by the synthesis; built now: 2 the
  Sunday-16:00 window extends to Monday before noon (weekPlanWindowOpen)
  and a Monday-morning plan targets THIS Monday (planTargetMonday — the old
  nextMonday would have planned the week after); 5 a discarded draft no
  longer blocks a re-run; 6 tests for the window, the target Monday and the
  discarded-draft guard. [15] Weekly Debrief §6 — MET (3 Sep): 3 was Tier
  2 #13; built now: 1 the drafted week plan rides the debrief's context for
  its week (discarded drafts excluded) and the prompt holds the week against
  it; 2 the debrief's CHANGES ride the record structured (payload.changes)
  and Plan Today reads STANDING CHANGES THIS WEEK (the Daily Review already
  carries the whole debrief); 4 the missed-week catch-up, GATED ON TESTS
  and shipped: debriefWeekFor is pure — this week once the slot has passed,
  LAST week for two days after a slept-through slot (title and context keyed
  to the week it is FOR: record.weekStart, payload.weekStart; legacy
  records key by their own Monday) — and the test caught a real ordering
  bug on the first pass (getDay() ordering read Saturday as "after a
  Sunday slot"; Monday-first indices fix it); 5 buildDebriefContext is on
  the gatherContext rail; 6 the third failed compose for a week pushes.
  [16] Coach Reflection §6 — MET (3 Sep): 3 was
  Tier 2 #12; built now: 1 the state round-trip is one pure reader
  (lastReflectionLine) of the shape the writer now stores — outreach TEXT
  + `delivered` — the old boolean-as-text ("reached out about: true") is
  pinned by test; 2 compose-then-deliver: the outreach exists without
  Telegram as a pending Inbox record (kind coach, journal route, "Coach — a
  word for tonight"); sent ones leave a spokenLog receipt; 4 the window is
  03:00–09:00; 5 validator-rejected learnings are counted and noted on the
  heartbeat for Ops; 6 dedupe against the What Works page — normalised
  containment either way (isKnownLearning), counted as learningsKnown;
  fuzzy matching waits for evidence; 7 coachReflection.test.js. [17] Program Review §6 — MET (3 Sep): 1 (respectNo
  28d/20%), 2 (nudge text), 4 (flagged → 18's couldn't-look) were in; built
  now: 3 GATED → exact-match shipped: alternatives named in the What Works
  "Avoid / does not land" section sink to the bottom with the file's reason
  ("skipping X — your file says: …"); his real page names two shoulder
  lifts, and today's six stale findings (arms/chest/back) demote none —
  correctly. [18] Program Audit §6 — MET: 1 (fourth state), 2 (Monday-onward
  window), 4 (8d expiry), 5 (mondayOf) were in; built now: 3 week-over-week
  on clear lines — the junk-volume check carries a metric on its receipt
  and a ≥20% move or crossing half the headroom appends "— was N last week,
  trending toward the ceiling" (or "easing off"); steady weeks stay silent.
  [19]/[20]/[21] Money family — MET where the data
  allows (3 Sep). THE LEDGER IS EMPTY: 0 transactions in 14 months, no
  budgets — so the two detector-tuning items (19.2 subscription gap
  consistency, 21.2 mid-month pace) have nothing to tune against and are
  DEFERRED with that reason (build them when a month of data exists; both
  are pure-arithmetic additions). Built now: 19.1 merchant overrides — a
  category fix on one transaction holds for the merchant (one config file
  for budgets + overrides, read/written whole; categorize consults the cache
  first; the CSV scan loads it before parsing); 19.3 a month file that
  will not parse is quarantined (.corrupt-<stamp>), said on the heartbeat,
  never read as an empty month; 19.4 no client copy of the categories
  exists (checked). 20.1 the import record names the first skipped raw
  lines; 20.2 the pending/error block keys on file + content hash — a
  replaced export re-scans and supersedes the old record with a receipt;
  20.3 a statement-scan row with an unreadable date is DROPPED and named
  (confidence low) instead of stamped with today's date; 20.4 workDir
  cleanup was already there. 21.1 (any-day catch-up) and 21.4 (14d expiry)
  were in; 21.3 the off ramp — three empty closed months pause the report
  (cfoPaused, heartbeat note; force still drafts). [22] Guardian §6 — MET (3 Sep): 1 (loop watch from
  the roster) and 5 (yesterday-partial twin) were Tier 1/2; built now: 2
  stores are FOUND, not listed — every *.json at the data root plus one
  level under money/, health/, distill/ (temps and quarantines excluded;
  the hand list had rotted twice); 3 per-check degradation — any check
  worse than its predecessor notifies (worsenedChecks), not just a worsened
  roll-up; 4 the monthly report catches up any day from the 1st; 6 the
  restore undo routes round-trip on a scratch vault (both 'restore' and
  'restore-created'). [23] Commander §6 — MET: 3 (dismiss on the receipt)
  was already so; 2 TASK_HINTS replayed on his real calendar — 744 events,
  4 task labels, zero false positives — and now lives on the server
  (lib/followUps.js) with a test pinning the client's list identical; 1 the
  server-side follow-up sweep: evening (≥19:00) files pending 'followup'
  records for today's task events, morning (07–11) asks once about
  yesterday's leftovers; dedupe by key against any follow-up record and
  open to-dos; the client's live proposal stands down when a record exists
  (same records rail); registered in index.js and the ops roster
  ('followups'). [24] Researcher §6 — already MET (citation
  integrity, settle watchdog, retry keeps the model — all shipped 2 Sep).
  [25] Studio §6 — MET (3 Sep): 2 (watchdog) was in; built now: 1 the
  Drawn-from contract is enforced like the Researcher's citation gate — an
  outline that names no sources (or does not say the vault had nothing) is
  an error with the retry, not a draft; 3 the idea's format is read from
  frontmatter (formatOf) instead of a regex over the raw page. [26] Distiller §6 — MET (3 Sep): 2 (oldest-first),
  3 (rollback), 4 (Sat window), 5 (pruner), 6 (test file) were in; built now:
  1 leave-alone memory — a job records its candidate list; a candidate not
  among the job's changes was read and left alone and is skipped for 4
  weeks (leftAloneRecently, from the job files); the cap is said ("8 of 19
  orphans this pass — the rest queue for next week", title "Distill 8 of
  19 captures"). [27] Compost §6 — MET: 3 (per-key 90d) and 5 (tests) were
  in; built now: 1 Compost runs BEHIND the Distiller — an unlinked capture
  the distiller has not read waits 28 days (two cycles); one it has seen
  and left alone, or a linked one, composts at 14; 2 the whole idea
  pipeline is guarded (outlining/scripting stall at 45 days, status-aware
  wording; resolves 25's flag); 4 the orphan cap is said on the first
  island ("8 of 23 islands shown"). [28] Pattern Scout §6 — MET: 1
  (declined context) and 3 (watchdog) were in; built now: 2 discarded
  agent drafts carry his reasons grouped ("coach ×5 — "Too aggressive" ×3,
  "Not now" ×1") and the prompt aims at the stated why; 4 the Saturday
  window is Saturday-onward (weeklyWindowOpen). [29] Trust Ladder §6 — MET (3 Sep): 1 (respectNo), 2
  (registry + twins), 4 (round-trip test) were in; built now: 3 the Sunday
  slot catches up on Monday morning (cadence.sundayCatchUpOpen — a Sunday
  slot is the LAST of its week, so weeklyWindowOpen could never catch it
  up; weekOfSundayRun keys a Monday run to the week that ended). [30]
  Librarian §6 — MET: 1 (boundary sweep) and 4 (cadence) were in; built
  now: 2 the read-next card carries RESEARCH THE BOOKS — one tap dispatches
  the Researcher with the concept verbatim (the Library's add-book flow is
  one step from that brief); 3 a declined gap re-raises only when the graph
  has grown around it by ≥2 sources, naming the history (readNextEligible);
  an accepted one never. [31] Brain Week §6 — MET: 1 the Sunday digest
  catches up on Monday under LAST week's key; 2 a knowledge folder that
  cannot be walked is a skip with the reason on the heartbeat, never a
  partial digest that looks complete. [32] Study Lane §6 — already MET (1
  inventory path Tier 2 #12; 2 settle; 3 tests exist for enumerateSources
  and rolling captions). [33] Watcher §6 — MET (3 Sep): 1 (staged pass) and 3
  (settle) were in; built now: 2 the model-choice answer rides the video
  record and a retry keeps it; 4 digest notes open with the ask they were
  extracted under (a cached digest reused for another question no longer
  reads neutral). [34] Forge §6 — MET: 1 proof hygiene — the receipt says
  "full-screen capture" honestly (window-scoped capture needs a CGWindowID
  the platform cannot get cheaply — not built), the proof PNG goes when the
  artifacts are discarded, and PNGs ride the retention sweep; 2 the same
  prompt twice, or a third build on two, is refused naming the running jobs
  (duplicateRunning, MAX 2); 3 a 25-minute wall-clock backstop rides the
  stopped path and the record says "timed out after 25 minutes"; 4 pruneForge
  at boot keeps the newest 20 receipts + proofs and artifact dirs under 30
  days (running ones aside). [35] Breaker §6 — MET: 1 the prompt carries the
  repository's own record of the newest work (last commit subject + git
  diff --stat HEAD; nothing for a vault workspace); 2 settle was in. [36]
  Scout §6 — MET: 1 existing-page matching — a flattened needle under five
  characters matches exactly only; a frontmatter URL/handle hit leads the
  list; every candidate is returned. [37] Leader §6 — MET (3 Sep,
  `fb2d294`): 1 leaderLiveLine — a resumed chat turn prepends today's idea
  + why, open struggles (count + newest) and the latest resolution, the
  Coach's fix twinned; 2 research runs Sat OR Sun (researchWindowOpen; the
  6-day gap dedupes); 3 was already in (spacing.js twins); 4 every research
  URL is HEAD-checked (GET when HEAD is refused, 5s) — failures KEPT and
  marked "(link unverified)" in the woven page (verifyInsightUrls,
  researchBody). [38] Pulse §6 — MET: 1 novelty memory — the URLs already
  shown ride the prompt as an exclude list AND code judges novelty against
  them; nothing new → yesterday's items stay marked seen, newCount 0, and
  the panel ("nothing new — last items from <date>"), the morning line
  ("nothing new since <date>") and the ops list say so; 2 late catch-up —
  pulseRunDue: 03:30–06:30 once, else once after 09:00; lastRunDay lives IN
  pulse.json (claimed before the run); 3 over-cap topics are listed in the
  cache (overCap), never run, and the panel says "past the 6-topic limit".
  REAL FINDING while here: the lane fails 1–2 of 3 topics most nights —
  log says only `pulse "Hypertrophy…" failed: exited 1` (result and stderr
  both empty); haiku at $0.50 budget. Diagnostic run in flight (see OPEN).
  [39] Brief Warm §6 — MET: 1 warmBrief(vaultPath,{variant}) with an evening
  window 19–22 beside the morning 05–10 (warmVariantFor); 2 three
  consecutive all-failed runs put ONE heartbeat note ("brief warm has failed
  since 05:30 — first open will be slow"), cleared by the first warm. [40]
  Health Mirror §6 — MET: 1 healthData.saveDay and nutritionLog.saveDay note
  the date; a month that is not the current one is regenerated on the next
  mirror tick (noteHealthWrite / drainPendingMirrors); daysBackTo makes the
  loaders reach the first of ANY month (62 was only right for this month);
  2 Processed/ drop archives older than 60 days are pruned at boot
  (pruneProcessedDrops — his two real Processed folders hold one file each,
  both recent). [41] Reminders §6 — MET: reminderFireText — more than 90
  minutes late reads "⏰ from 16:00, missed while the Mac slept: …" (day
  named when it is not today), push title "Missed reminder — Nova";
  firedAt/firedLate on the record. [42] Todoist §6 — MET, gate OPENED by a
  real probe (2 scratch tasks in his "Old" project, created/closed/deleted
  and confirmed gone): v1 GET /tasks/{id} answers 200 for completed AND
  deleted — checked:true vs is_deleted:true; moved = neither. taskFate →
  deleted leaves the vault line OPEN and holds it back from re-push
  (state.heldBack, released when the line closes/changes; lastResult.note
  "1 task deleted in Todoist — its line stays open in the vault"); moved
  keeps the pair; unknown (404/network) falls back to checking the line.
  [43] Overnight §6 — MET (3 Sep): (a) an errored item goes back to queued
  with attempts 2 and runs once more the next night, then stays error with
  failedTwice (requeueFailed, MAX_ATTEMPTS 2); (b) before re-running, the
  runner reconciles — a kept recordId that now reads pending/filed is marked
  done "landed late", no second run spent; (c) the morning line matches
  reality: "1 run failed — it will retry tonight" / "failed twice — re-queue
  it from Ops if it still matters" (the "still queued thinking, not lost"
  fiction is gone). [44] Calendar Watch — clean keep, nothing to do. [45]
  Mission Control §6 — MET: 1, 2, 5 were landed by their owners; 3 the
  concept card is CONCEPT REVISIT (freeing "DAILY REVIEW" for the Inbox's
  review card); 4 phone-width pass DONE at 375×812 (devtools emulate) —
  hero, TODAY list, DRAFT row, single-column body all read right; one real
  defect found and fixed: the PROTEIN satellite (bottom:64px) sat across the
  core's "NOVA · LISTENING" label — both lower satellites now sit at
  bottom:8px on phones, verified clear by screenshot. [46] Workouts §6 —
  1 and 2 were landed by their owners; 3 phone pass: TODAY tab (readiness
  ring + HRV/Sleep/RHR, STALLED/STREAK two-up, hard-sets bars) and GYM tab
  (week strip scrolls horizontally inside its own container, routine cards
  full-width) read right at 375; the live cockpit's set rows and long-press
  targets were NOT exercised (starting a session writes a draft — not done
  on his real vault). PULSE, REAL FINDING RESOLVED TO A DECISION (3 Sep):
  one real run of the Hypertrophy topic on haiku cost $1.06 over 20 web
  searches in 267s — twice the $0.50 cap — so 1–2 of 3 topics died most
  nights as "exited 1" with the $0.50 spent for nothing. Shipped: the CLI
  envelope's subtype is now words ("budget of $0.5 exhausted after $0.50
  and 11 searches — the run was cut off before it answered"), the failure
  is written on the topic's cache entry (lastError) so the panel says "last
  refresh failed: …" (outranking "nothing new"), every successful run logs
  its cost/searches/seconds receipt (entry.run), and the prompt caps the
  model at 8 searches. NOT raised: the budget itself — his call (see OPEN).
  SURFACES [47]–[66] — CLOSED (3 Sep). [47] Voice, [52] Journal, [53]
  Library, [54] Notes, [56] Stash, [58] Settings: owned/nothing — no action.
  [48] Inbox: 3 phone pass at 375 OK (capture card, wrapped action row, step
  cards); history is already capped honestly (historyLimit + hidden count).
  [49] To-dos: 1 is a synthesis flag (due dates — his call); 2 DEFERRED — no
  shared keyword-detector module exists to join (CATEGORY_HINTS stays in
  todos.js; TASK_HINTS in followUps.js). [50] Recipes: 2 phone pass — the
  rotation cards are 172×140 with a 44px tick, but CLEAR under each slot
  measured 26×11px (the action taken 4× a day was the smallest thing on the
  screen) → CLEAR and UNDO VARIANT are now 32px-tall targets (measured
  49×32 after). [51] Money: 1 "showing 120 of N · older in the export" line
  above the list (moneyListNote, MONEY_LIST_CAP) — a missing const here
  black-screened the dev app for one reload; caught by the devtools console,
  fixed; 2 (HUD idiom) left for the next touch. [55] Shopping: 1 MET by the
  [12] route already shipped — toShoppingItems keeps and aggregates amounts
  (the audit's "pass raw lines" was the cheaper alternative to the same end).
  [57] Ops: 1 was MET by d8cdc97 (one roster, Guardian consumes it); 2 the
  three conversational match-lines exist — study (kind study), read-next
  (kind read-next), scout (an ingest receipt whose payload names a person;
  receiptFor now stamps payload.person / payload.book so Ops can attribute a
  weave), all mapped to Knowledge. [59] Leader screen: 1 chips carry age
  ("· 12d", "today"); 2 tap a WORKING AGAINST chip → HANDLED → the reflect
  route's resolved path (api.leaderReflect, app.leaderResolve; same undoable
  receipt as the chat). [61] Ambient: 1 was in ('unknown' → no wash); 2
  sync age in the TOP-right corner ("SYNCED 3M AGO"; past 15 min the tiles
  dim to .55 and it reads "LAST SYNCED 23M AGO" in warn) — first placed
  bottom-right, where at 375 it sat on the pulse strip; 3 a 3600s translate
  drift of ±3px against OLED burn-in. [62] Claude Code: 1 was MET
  (codeModelOptions derives from liveModelPrefs.models). [63] Structured
  home: 1 ORDERS + assertOrdersCover — the dev build logs any section a
  morning/day/evening order drops or invents. [64] NovaBar: not in this
  repository (the macOS shell) — nothing done here. [65] Widget: 1 and 2 were
  MET (large renders top3; accessory sizes deep-link #/leader). [66]
  Telegram: 1–3 were MET earlier; 4 the at-most-once offset choice is now a
  comment at the poll loop. THE ROSTER (#18) IS COMPLETE — every report
  01→66 has its §6 items shipped, met by another item, or deferred with the
  reason above / in OPEN.
- HIS THREE LIVE ISSUES (2 Sep afternoon) — MET (`8ef99b1`, `127b55c`):
  (1) "DISCARDED WORKOUT — STILL RECOVERABLE" was a FINISHED session — the
  draft clear now carries finish|discard; legacy tombstones are recognised
  by a saved session of the same routine within 30 min; live offer → null.
  No data was lost or duplicated (checked the vault: one file per session;
  the only same-day dupes are a 2 Aug bulk import). (2) Coach "tap APPLY IT"
  with no card: the chat had no retag action, Coach bent `tune`, validation
  refused. Now `remap` is a real action (route exercise-remap, undo kind
  exercise-muscle-group), and `instructed:true` on a PROPOSE applies on the
  spot through approveRecord — his standing grant, `coach-edits.json`
  direct:true, GET/POST /api/train/coach-edits. (3) Music pausing on a tap:
  tapUnlockH no longer primes on generic taps; `src/audioSession.js` asks
  Safari 17+ for a 'transient' (mixing) session and yields to 'auto' while
  the mic is open; `data-nova-audio` on <html> shows the live mode.
  Device behaviour UNVERIFIED — he tests at the gym.
- Phone-width (375px) pass — MET (chrome-devtools MCP `emulate` 375×812×3,
  dev server at http://localhost:5173 — NOT 127.0.0.1, which the server's
  CORS list does not allow). Seen live: Home (plan card DONE/SKIP, Command
  Deck, Nova-is-working), Settings deterministic lanes (switch, no picker),
  Galaxy, Train Today/GYM/routine detail (rows read "<muscle> · last: …";
  Dead Hang now Forearms), Fuel, Inbox. Two defects found and fixed:
  (1) GALAXY WAS BLANK ON THE FIRST VISIT after a cold load since the 23 Aug
  bundle split — the screen is a lazy chunk, so componentDidUpdate's
  startGalaxy ran before the canvas existed and bailed; now a callback ref
  starts the loop when the canvas mounts (verified: cold load at #/galaxy
  paints 1023×1254, ~17.8k lit samples). Also: neighbour labels capped to
  the selection + its 8 best-connected (36 piled up unreadably) and clamped
  inside the canvas; legend plurals (entitys→entities, analysiss→analyses);
  job-tray labels end in … when cut.
  (2) THE STAGED PASS DIFFED AGAINST THE VAULT *NOW* — the pending distill
  record 652c45c8 (1 Sep, "17 files touched") would have REVERTED concurrent
  live edits to five pages (the Journal's Guardian + CFO entries, five
  "What Works" observations, a whole Studio outline, a standing instruction,
  the Skills backlog) and written four .nova-backups/*.bak files. Root
  cause: diffTrees compared staged vs live, so any live file that moved
  during the pass read as a model change carrying the stale staged copy.
  Fixed in ingest.js (shared by distill): stageVault writes a baseline
  manifest (sha256 of every staged Wiki/ file + live Raw/), diffTreesReport
  reports only files the MODEL changed and refuses — by name, first line of
  the summary — any model-touched file whose live copy also moved
  (conflicts); .nova-backups is never staged. Legacy stagings without a
  manifest keep the old compare. Identity check on his real vault: 246
  files staged in 280 ms, 0 changes, 0 conflicts, no backups. The unsafe
  record was DISCARDED through the rails (reason recorded); today's drift
  check would have refused it anyway (5 of 17 files moved since) — but two
  of the reverted pages had NOT moved, so a quieter day would have applied
  the deletions.
