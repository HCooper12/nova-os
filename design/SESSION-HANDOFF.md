# Nova OS — Session Handoff

**Read this first, every session.** `CLAUDE.md` carries the doctrine (what Nova
is, the non-negotiables, where things live). Memory files carry durable
project facts. *This* file carries the live state of the work: what is
half-finished, what was decided and why, what is verified versus assumed, and
which dead ends are already closed.

Updated at the close of each session (`/nova-close`). Newest state on top;
the session log at the foot is append-only.

---

## CURRENT HANDOFF

**2 SEP (cont.) — TIERS 1–3 SHIPPED; PHONE-WIDTH PASS DONE (it found the staged pass diffing against the live vault — fixed); #18 IS WHAT'S LEFT.**
*(Interim update mid-session; the session log entry is written at close.)*

GOAL: execute `design/audits/2026-08-full-audit/99-SYNTHESIS.md` in tier
order — Tier 1 (staged-pass unification), then Tier 2's nine shared-helper
builds (#6–#14), then Tier 3's surface refines.

DONE CRITERIA:
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
  it). Real compose now: 34 items, 30 with amounts, 2 regulars. Next in
  roster: [13] Food Scout §6.
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

STATE:
- `server/lib/stagedPass.js` — stampPriors → checkDrift → applyChanges
  (rollback on mid-write failure, pluggable `write`) → undoChanges.
- `server/lib/sources.js` — loadSources (values + failed[]), unreadable().
- `server/lib/respectTheNo.js` — latestDeclines, respectNo, declinedContext.
- `server/lib/heartbeat.js` — note()/readNotes() in `heartbeat-notes.json`
  (sibling file; the beats' shape is untouched). ops.js agents carry
  `lastNote`.
- `workouts.js`/`exercises.js` — pure halves exported (replaceRoutineEntries,
  addExerciseIn, setMuscleGroupIn, render*File, write*Raw); writers are thin
  wrappers.
- Ingest jobs now PERSIST as 'applied'/'undone' (pruned after 30 days);
  receipt `kind:'ingest'`, undo route `ingest-apply`. A ready weave staged by
  the old server (`a25ae5e5`, 8 changes, 30 Aug) is stamped at approval.
- Coach undo shape v2: `{ kind:'coach-plan', changes, routineIds, markerKeys,
  createdExercises }`; legacy `routines:[…]` records still undo.
- Compost store: `dismissed:{key:iso}` replaces `dismissedKeys:[]` (migrated
  on load; live store had 0 legacy keys).
- Tests 727 → 801, all green. verify:shipped has nine new markers.
- Telegram now handles TEXT, PHOTO (→ food scan → pending 'food' record) and
  VOICE (→ Whisper → ask). Neither the photo nor the voice path has been
  exercised with a real message from his phone yet.
- New helpers this session: stagedPass, sources, respectTheNo, settle,
  contextSections, spacing; heartbeat notes; briefState greet/rituals.

DECISIONS:
- Coach could NOT sandbox by vault path → vaultStateFile keeps ONE cache per
  module, not per vault; a staging copy would poison the live cache for the
  10s grace window, and a raw write of its two files leaves the process
  serving the old plan. So Coach plans in memory and commits through the
  owning modules (`commitVaultState`). Forecloses path-sandboxing any
  state-file-owned file; tests that seed several scratch vaults must set
  NOVA_VAULT_GRACE_MS=0.
- Legacy ingest changes (no `prior`) are stamped AT APPROVAL → a paid weave
  is never discarded for predating a deploy → forecloses drift detection
  for that one job only.
- Coach undo restores the ROUTINES file only; the library keeps a created
  exercise (sessions may reference it) — the standing decision, kept.
- respectNo: the calendar alone never re-raises; no metric on either side →
  a no stays a no. Legacy autonomy declines therefore stay permanent;
  legacy food declines compare against MIN_COUNT.
- Guardian's "check crashed" is the couldn't-look reference — unchanged.
- Mission Control's failed plan points at the Inbox (no client run action
  exists) rather than inventing one.

VERIFIED (with locators):
- Guardian live: `backups | ok | 338 snapshots … Newest written 2026-09-02`.
- Staged pass: regression fails on old code (warn where ok); renderers
  reproduce his real Workout Routines.md (4) and Exercise Library.md (135)
  byte-identical (date normalised); the ready weave still listed after
  reload.
- Couldn't-look live: fuel-cross `sources.ok:true` (3 findings); audit
  sources ok (4 fired · 4 clear · 1 not-yet); a standalone compose without
  .env hit CalDAV "cannot find principalUrl" and drafted 0 clear days —
  the running server reads 43 events fine.
- Respect-the-no dry-run on real records: 1 declined program subject held,
  unrelated routines still raise; no autonomy/scout declines on record; 12
  food declines (8 = his 1 Sep clean-out) hold 60d; compost serves 11.
- Gates each ship: lint 0, build green, suite green, CI success,
  verify:shipped "genuinely live".

ASSUMED:
- No live apply/undo has run through the new staged pass yet (the waiting
  weave is his to approve; no Coach proposal pending) — proven on scratch
  vaults only.
- Client renders of the ERROR states (Fuel couldn't-check card, Ambient
  unknown, Mission plan error) still unseen — the live server had no
  failures to show during the pass; the happy paths are seen at 375px.
- Distill job file a26d3d1f.json stays 'ready' on disk after the record's
  discard (distill has no discard hook the way ingest's discardJob has);
  harmless, 245 KB, not pruned. Small follow-up.

OPEN QUESTIONS / BLOCKERS:
- `stores | alert | 15 filed records missing undo data` (8 Aug–1 Sep:
  pattern×4, coach-program×4, fuel-cross×3, coach-audit×2, model-choice×2)
  — real holes, or informational records the Guardian check shouldn't
  count? Undecided; the check still alerts.
- He has declined all 12 food-save proposals ever made — the lane's premise
  may not fit; surfaced, not acted on.
- The plan's DONE/SKIP marks have no live use yet (he has not tapped
  them); their render is seen at 375px, the write path is test-only.
- The rerun of the distillation (to redo the 1 Sep pass on the fixed diff)
  is his call or the weekly scheduler's — not run; it costs a model pass.
- His phone's Scriptable widget still runs the OLD script until re-pasted.
- The audio-session fix is spec-based (navigator.audioSession, Safari 17+);
  if music still pauses on a tap, the next suspects are the wake-word
  listener (a continuous mic holds the session by design) and the
  speechSynthesis prime — both bracketed, neither tested on the device.
- He asked to see what each exercise TARGETS before starting a workout: the
  routine detail rows already show "<muscle> · last: …" under each
  exercise; if he means the Home/Train list, that is unbuilt.
- Week-plan window semantics; `guardian: 26h`; phone-width pass — carried.

NEXT ACTION: #18 in roster order (the phone-width pass is done). Before
that, consider whether the conflict rule should extend to the drift check's
message (it already refuses; the new baseline just stops stale copies ever
entering a draft). Carried #18 items with the most
value already identified: [17] nudge-text compounding (plan 2); [24]
citation gate + retry keeps the model override (plans 1, 3); [66]
photo→scan lane (plan 2); [60] Galaxy 6–8; [07] dismiss semantics (plan 2)
+ WORKOUT_RE validation against his real calendar (plan 6); [02] review
adjustment ✓/✗ UI; [29] AUTONOMY_TARGETS registry completeness (plan 2).

DO NOT:
- Do not edit source with `perl -0pi` and a hand-escaped multi-line pattern:
  a pattern that fails to match can insert the replacement at byte 0 (it
  did — mealPrep.js line 1, caught by the suite). Use a node script with
  exact-string anchors that throw when missing.
- Do not diff a staged copy against the live vault to find "what the model
  changed" — the live vault moves during a pass; diff against the staging
  baseline (diffTreesReport) and treat a live move on a model-touched file
  as a conflict, never a merge.
- Do not open the dev app at http://127.0.0.1:5173 — the server's CORS list
  has localhost:5173 only; everything reads OFFLINE and looks like a bug.
- Do not start a canvas loop from componentDidUpdate when the screen is a
  lazy chunk — the ref is null on that update; start it from the ref.
- Do not sandbox a vaultStateFile-owned file by path, and do not write one
  raw — go through the module (see stagedPass.js header).
- Do not match `\w{3}` for an en-GB short month — September is "Sept".
- Do not write a source-scanning test whose forbidden literal appears in
  your own explanatory comment — scan code lines only.
- Do not run verify:shipped with the next item's changes uncommitted: it
  (correctly) fails the git check for the previous item — this bit twice.
- Do not rebuild NovaBar without expecting the panel to pop on relaunch
  (it shows once on launch by design); tell him if he is at the Mac.
- Do not use a plain function name as a verify:shipped marker — the
  minifier renames it; use an object/dataset key or a string literal.
- Do not run `npm run build` before the commit whose stamp verify:shipped
  compares — build AFTER committing, or the version check fails falsely.
- Do not read a test's `applyOps` scratch vault as independent: the state
  cache is per module; set NOVA_VAULT_GRACE_MS=0 or the second vault reads
  the first's library.
- (All prior DO NOTs stand — see the session log below and the previous
  block's list, which this interim update does not repeat.)

## SESSION LOG (append-only, newest first)

### 30 August – 2 September 2026 — the full-platform audit, and shipping its top findings
Audited all 66 agents and surfaces read-only, one per turn, then executed the
synthesis in tier order. The audit's own headline finding got worse on
contact: `--allowedTools` is not enforced under bypassPermissions, and where
the item-by-item read had found three unguarded spawn sites, a mechanical
sweep found fourteen — seven of them passing `--allowedTools ''`, meaning "no
tools please", while the model could in fact write files and run shell. Fixed
by denying the complement of what each lane asks for, so the allow-list is
enforced by construction. Proved with a canary after the obvious check —
asking the model to list its tools — returned two contradictory answers a
minute apart, one naming "PowerShell"; that method note is now in the module,
because it is the sort of thing that gets re-learned expensively.

Then Tier 1. The workout save was replaying through the offline outbox and
filing a second session — double-counting exercise state and re-firing the PR
ping and the Coach debrief — now idempotent on a client-stamped key, with the
PR celebration still returned on a replay since a lost response means he never
saw it. Health Insight was retrying an uncapped $0.50 compose every hour from
06:00 to midnight whenever it failed, silently; capped at three, with the last
failure announcing itself, and the lane got its first test file. Guardian was
watching 13 loops beside a roster of 29, so sixteen agents could die
unnoticed; it now derives the watch from the roster — verified live at 29 —
and five weekly agents whose exact-day windows a sleeping Mac could miss now
stay open for the rest of their cycle.

Corrected rather than added: a health-mirror test asserted a row for the 2nd
of the current month, which the page builder correctly drops as future — so it
failed every 1st, and had already broken two Pages deploys that day before it
was noticed. The deploy pipeline, not just the test, was the casualty. Suite
went 713-with-one-failing to 727 green.

### 27–30 August 2026 — the black screen, the ambush sheet, the once-a-day brief, an ingest cap that ate a job, and food macros that compute instead of recall
Four real failures, fixed in two commits. The black screen and the ambush
review sheet turned out to share one root cause: boot-resume trusted a
job's status from the server's list without loading its preview, so
`IngestReview` rendered a "ready" branch against null and threw, taking the
whole app down — reproduced at phone size before touching anything. Open
work now surfaces in the WORKING panel instead of seizing the screen, and
the same load-before-render ordering that fixes the ambush also fixes the
crash. The brief was marking itself "delivered" only when audio actually
played, but an auto-brief has no user gesture behind it, so iOS blocked
autoplay almost every time and the retry re-read the whole brief on every
open — now marks on delivery, server-side, shared across devices.

Then two complaints in one message. A vault-ingest video hit a $3 cost cap
— sized for a pasted note, applied indiscriminately to full weaves — spent
$3.08, and was killed with nothing written; raised both budget constants to
env-overridable backstops (25/40) reframed explicitly as guards against a
runaway loop, not spending controls. And food-macro logging gave two
different totals for the identical pizza description (1050 kcal/50g, then
940/36g) — traced to the prompt telling the model to answer "from your own
knowledge, no search" for most foods, which guarantees a different
plausible number every time since LLMs don't recall numbers reliably.
Rebuilt along the platform's own line: the model now only decomposes food
into components with gram weights; a new `nutritionFacts.js` looks each up
in USDA FoodData Central, scales by weight, and derives kcal from the
Atwater factors, so a stated kcal that disagrees with its own macros is now
impossible by construction. Verified live: the same pizza returned
identical totals (2,408 kcal/129g protein) across repeat calls, all four
components matched and source-attributed. While confirming no jobs were
in-flight before this session's own restart, found that a PRIOR restart had
in fact orphaned an in-progress job — his Atomic Habits ingest — which
directly answers, in the negative, the previous handoff's open question
about whether it ever completed. 709/709, lint 0, build green both times.

### 25–26 August 2026 — evidence on screen, the phone-voice bugs, the ship-verification crisis, and Coach reading his own notes
Started from his complaint that Nova speaks a lot without anything to look
at, and ended up rebuilding how "done" gets claimed at all. Made every
spoken Ask-Nova/Coach answer infer a visual panel deterministically (code
picks the shape from the question, never the model), added a `sessions`
panel that didn't exist, and wrapped every render site in an error boundary
— there was none anywhere in the app, so one malformed panel used to blank
the whole screen. He sent screen recordings of the phone voice failing;
watching them frame-by-frame (rather than guessing) found three separate,
unrelated bugs: the brief racing a TTS-status fetch and giving up silently,
a full-screen focus blur spotlighting a card rendered below the mobile
fold, and the iOS-audio "unlock" replaying his last sentence because its
audio element still held the previous TTS blob. Built findings-as-charts
(fuel findings had never exposed the numbers their prose quoted) and a
question-by-question brief close that reuses the existing inbox
approve/discard rails rather than inventing a new one. Let Coach apply
program edits from inside the chat — the write path already existed and
was tested, it just had nowhere to say yes from.

Then he said, plainly, that he no longer trusted "shipped" as a word from
me, and he was right to: nine commits had sat unpushed behind a blocked
permission classifier while progress kept being reported, a feature landed
in the one Coach-message renderer out of three that he wasn't looking at
(twice), and his PWA was silently serving a cached bundle for days because
`autoUpdate` updates the service worker, not the running app. Built the
actual failsafe rather than apologising again: a build id compiled from
the git commit (not a timestamp — those can't equal themselves across a CI
rebuild), a `version.json` the app polls and shows an UPDATE banner
against, and `scripts/verify-shipped.mjs`, which checks the LIVE deployed
bundle rather than the working tree. Running it immediately caught two
bugs in itself — a build id that could never match, and chunk names read
from local files that 404 against CI's different content hashes — which
is exactly the point of a script instead of a claim.

Closed by confirming, and it was true: Coach's progression engine, its
weekly detectors, the program audit and the Sunday debrief all ignored his
per-exercise session notes. A note reading "struggling to move 9.1kg
without a nudge of body momentum" could not stop a load increase, because
nothing except the chat ever read it. Built a narrow, suppress-only note
reader (a signal can hold a load increase, never create one) and wired it
through every surface that reviews his training — verified live: Cable
Lateral Raise and Alternate Incline Dumbbell Curl are now held, citing his
own sentences.

### 23–24 August 2026 — Phase C, the Librarian + Library, Coach that edits and judges the plan, and Fuel fixes he asked for twice
Finished the fluidity plan: writes now tag which slices they touched, so a
todo checkbox costs 3KB instead of 996KB (measured live). Two bugs only the
browser found — routes fire their own domain broadcast beside the chokepoint
one, which silently cancelled the whole optimisation, and one write emitting
two events made it sync twice. Built the Librarian (a book title + author →
triangulated dossier → woven vault pages, provenance-labelled researched vs
read) and the visual Library shelf with real Open Library jackets cached
server-side. Coach can now APPLY its suggestions to the real program through
typed ops with full undo, always behind a confirm sheet with a free-text box;
applied two changes to his live plan while he was at the gym. Then he pushed
back that Coach was "suggesting changes for the sake of them" — his data
proved it: 227 working sets, all RPE-rated, 88% at RPE 9–10, and the default
progression path never read RPE at all, so a shoulder press he was grinding at
RPE 10 kept earning +2.5kg. Effort now gates load everywhere and grinding
lifts get a tempo/control prescription instead of a number.

CORRECTED RATHER THAN ADDED: the "HARD SETS THIS WEEK" bar was showing LAST
week's numbers every Monday. A health-push failure that looked like my deploy
was actually one missing HealthKit metric making the whole JSON body invalid —
one absent reading was discarding every other metric. My first "too many
exercises" detector measured session length and could never fire, because he
already splits routines across days; the real signal (routines he cannot
finish) was in the same data. Copy that told him to earn FEWER reps than he
was already doing, and a proposal to cut Weighted Pull-Up 30 minutes after
Coach created it — both caught by running detectors against his real log
before shipping. And a CSS bug I introduced: adding the camera button pushed
the tweak panel's ASK button outside its card at phone width, which he found
after I called the feature live, because I had only screenshotted it at
desktop width.

### 23 August 2026 — model-cost fix, Coach's self-review, a shipped crash caught and fixed
He caught Coach hitting a "Fable 5 usage" limit mid-conversation — traced
to every unpinned Claude CLI call inheriting the account's ambient
default model, which had silently become Fable 5. Pinned Coach to opus
and 12 other automated background lanes to sonnet. Built the Coach's
program review (server/lib/coachProgramReview.js): three code-driven
detectors — a lift's name contradicting its filed muscle group, a lift
flat for 3+ weeks (swap suggested to the same muscle), a goal muscle
chronically under target — raised onto the inbox rails, surfaced in the
morning brief, the Train TODAY card, and Coach's own conversation
context, nudged at 3 and 7 days then escalated to Telegram. Verified
against his real vault: raised two genuine findings (a real Face Pull
mapping error, a real stale Cable Flys swap) that are still sitting in
his Inbox, intentionally. Added coach-chat auto-scroll-to-bottom and a
temporary mid-session exercise add ("this session only", never written
to the program) — but the first ship of the latter crashed his screen
black. Reproduced it properly on an isolated scratch server (a COPY of
his vault, throwaway port/data dir, his live backend untouched) rather
than guessing: found an undefined `${M}` font reference that only threw
at render time, plus a second bug where creating a brand-new exercise
mid-session was silently routed to the wrong destination (or worse, into
his real program if a routine happened to be open behind it). Both
fixed and re-verified on the same scratch repro. Also discovered and
fixed, mid-session, a real data-loss mechanism in inboxStore.js: writing
to it from a one-off script while the live server also runs risks a
silent cross-process cache clobber — the two coach findings vanished
once before I caught it and built the proper HTTP-route fix. 415/415
tests, four deploys, every bundle hash-verified.

### 18 August 2026 — mockup parity shipped + the audit that caught a live bug
P2 cockpit + one-bar log screen-verified and deployed. Visual-claims audit:
voice dynamics and canvas panels both proven real on screen; the audit
surfaced a genuine reply-loss bug (SW-update reload mid-speech ate the
answer) — fixed the same hour. Fuel cross-reference agent (spec #11)
built end-to-end with a true first finding on his real data; decline-asks-
why shipped on all Coach advice. 348/348 tests. Three deploys, every
bundle hash-verified against the harness-verified dist.

### 13–16 August 2026 — the Forge, the spoken lane made fast, and two wrong diagnoses
He sent an Instagram reel — a hand-built watchOS app dispatching Claude and
Codex jobs from the wrist, with live status in the Mac's notch — and asked
for the same, expanded. Watched it frame by frame (60 frames + Whisper
transcript) and wrote `design/WRIST-PLAN.md`: the key finding was that Nova
already owns most of what that author built from scratch (server, auth,
inbox rails, agent lights, SSE, Siri dispatch), so the genuinely new pieces
are a job runner, a notch HUD, and wrist dispatch. Built Phase 1, **the
Forge** (`lib/forge.js`): one spoken sentence → a real running artifact,
sandboxed to `~/NovaForge/`, live tool status on the existing rails,
persisted receipts, stop, and Telegram announcements including failures.
Verified with a real snake game — $0.90, 3m32s, 22KB self-contained HTML
that the job smoke-tested itself. Two bugs were mine and are recorded: the
plan's invented "Build" department (no such thing — Platform), and a
`stopForge` that mutated a disk copy so the stop flag never reached the
child.

The bigger thread was his complaint that Ask Nova from the watch felt so
slow it defeated the point. That was measurable, not a feeling — 14.2s,
15.9s, 23.9s sat in the request log. Cause: `/ask/sync` minted a NEW
conversation per ask, paying context assembly, a cold CLI boot, and prompt
cache creation every single time, because the warm pool is keyed by session
id and a fresh id can never hit it. `lib/spokenSession.js` now keeps one
conversation with day/age/turn caps and re-states the volatile numbers per
turn: **2.1–2.2s resumed, 11.5s cold**.

Then he said Siri still wasn't answering, and I got it wrong twice. First I
found and fixed a real bug — the keepalive drip prefixing the JSON body with
spaces, which Shortcuts could not parse — and reported it as the cause. It
was not; it had only ever affected slow answers, and my post-fix tests all
returned in 2s and looked clean. He said it still failed, so I added a raw-
body receipt, and that finally showed the truth: his Shortcut had been
sending the literal words `"Provided Input"` — the variable's NAME instead
of its value. One screenshot from him confirmed it in seconds. He rebound
the variable and it now works from his phone (`"8,538 steps on August 15th,
sir."`). The server now refuses known Shortcuts variable names out loud
rather than politely asking him a question he cannot answer hands-free. Also
untracked a PDF that a careless `git add -A` swept into a commit.

### 13 August 2026 — alarm-stop confirmed live; steps-parity thread opened and paused
The alarm-stop automation fired for the first time, cleanly, at 07:25 local
— filed 12 Aug's full health payload, `stepsComplete: true`, no errors. The
whole point of the prior close's fix, proven. He noticed Nova's steps
(10,022) sat ~1.1% under Apple Health's own figure (10,139) and asked why.
Root cause, confirmed against Apple's own developer forums: the true
cross-source dedup Health shows requires `HKStatisticsQuery`, a native
HealthKit API a Shortcut cannot call — Nova's per-device MAX fold is an
honest approximation, not a bug, and this project already proved the naive
alternative (no Source filter) is worse. Built a full adapter
(`lib/autoExport.js`, route `POST /api/health-data/auto-export`) for Health
Auto Export, a real app that CAN call the proper API, reusing the existing
shared ingest gate via a new `skipDateShift` option. Gate-clean (294/294
tests), live-tested with synthetic data, committed and pushed
(`84cadb5`) — but he then found the app wants a paid subscription and
declined to buy it right now. **Thread is parked, not abandoned**: the
adapter is built and waiting, untested against a real payload, for whenever
he decides to revisit it.

### 12 August 2026 (afternoon) — closing the health thread's last gap
He added the alarm-stop trigger on his phone — the previous close's fix is
now live end to end, pending tomorrow morning's first real run. Re-verifying
the previous handoff's claims by a second route (reading the pushlog and the
JSON files directly, not trusting the prose) surfaced a live bug it hadn't
caught: `server/data/health/2026-08-12.json` was carrying 11 Aug's
`activeEnergyKcal`, `walkingRunningDistanceKm`, `restingHeartRate`, `hrv`,
and `vo2Max` — 819 kcal and 15 km logged against 163 real steps. Cause: a
drill push made during the health thread's own testing used the literal
date `2026-08-12` instead of `yesterday`, landed as the day's first push
(so even the steps guard had nothing to compare against), and the other
accumulators had no guard at all — only steps did. Fixed by generalizing
`shouldDropLowerSteps` → `shouldDropLowerReading`, applied across a new
`ACCUMULATOR_METRICS` set (steps, activeEnergyKcal, walkingRunningDistanceKm,
sleep*); point-in-time metrics (RHR, HRV, VO2 max, weight) stay unguarded on
purpose since a later reading of those is just more current. Verified live
against the running server with a scratch date, not just unit tests. Today's
file repaired by hand. Gates re-run clean (287/287); committed, pushed
(`6b8751b`), service reloaded.

### 11–12 August 2026 — the health thread (concurrent session)
The steps saga ended, and not where anyone was looking. Three faults were
stacked: iOS **encrypts Health data while the phone is locked**, so the
00:05 automation had only ever succeeded on nights he happened to be
awake; my own monotonic-steps guard **exempted the current day**, which is
how a truncated 813 overwrote a genuine 11,107; and the missed-push
sentinel only shouted at *missing* days, so a stale midday partial sat
there in silence all morning. All three are fixed, and his locked-phone
test is what proved the first — automation fired, Mac awake and serving,
nothing arrived on either channel.

The fix that shipped is a clone, not a build. Six attempts at authoring a
`.shortcut` file failed on Shortcuts' own serialization (Statistics needs
an explicit input; hand-built date filters are inert) — each one costing
him an import and a run. What worked first time was fetching **his own
automation from an iCloud share link** and changing exactly two things:
the date token → the literal word `yesterday` (the server resolves it),
and the drop filename. Verified live: the full 8-metric payload filed
against 11 Aug, with the MAX fold and monotonic guard correctly keeping
his higher manual figure while every other metric repaired the day.

Two things were corrected rather than added. I wrote 11,107 back into
11 Aug from the pushlog without checking the window it was captured over —
it spanned midday-to-midday across two days and was never a valid daily
total; his manual 10,218 was right and mine was wrong. And I proposed a
fixed 22:30 push as a fix, which he correctly rejected: his bedtime
varies, so a fixed hour truncates the day unpredictably. Alarm-stop is the
only trigger that is both unlocked and after the day is complete.

### 10–12 August 2026
Nova learned to watch. The `/watch` skill became an agent — the Watcher —
and then a whole pipeline: a link in, transcript pulled locally, and either
a quick verdict (the Coach auditing a fitness video's claims against the
literature) or the full second-brain weave (Source, Concept, Entity and
Topic pages, wikilinked, verbatim transcript in `Raw/`). It ships with two
buttons because absorption costs ~$6 and triage costs ~$0.50, and he should
not pay the former to discover a video was filler.

Almost everything of value came from the failures, not the build. His first
real video — a 4-hour Hormozi podcast, 575k characters — broke the pipeline
four separate ways in sequence, and each break was a real bug: a budget cap
set by guess rather than measurement (a 150k chunk on the default Opus model
cost $1.46 against a $0.75 cap and died having written 218 tokens); a
2000-word payload wrapped in a JSON string that one raw newline destroyed;
an error handler that read stderr before stdout and so reported a harmless
"no stdin data" warning as the cause of a fifteen-minute failure; and the
weave itself dying at its own $8 cap on Opus. Measuring instead of guessing
fixed all of it — 60k chunks on Sonnet cost $0.35 and return 7k tokens of
dense notes — and the digest is now cached per video id so a retry never
re-pays. His question "will this duplicate anything?" was asked at exactly
the right moment: it would have, twice over, and video identity (by ID, not
URL) now prevents it.

Three things were corrected rather than added. The Watcher's first filing
put its note in `Wiki/Inbox` with `type: raw` and threw the transcript away,
so it never appeared under his Sources filter — it now writes his own
podcast convention. Four modules resolved a ghost `Claude%20Projects`
directory because the repo path contains a space (`URL.pathname` instead of
`fileURLToPath`), silently stranding a transcript and emptying the stream
feed's heartbeat reads. And ready ingest jobs lived only in memory, so a
$6 diff died on a server restart and had to be applied out-of-band — they
persist to disk now, drilled with a real `launchctl kickstart`. The 4-hour
conversation is in the vault: 41 changes, 19 new concepts, 11 existing
pages deepened rather than forked.

### 7–9 August 2026
The session split in two. First, a long Shortcuts saga: Ask Nova and Tell
Nova failed for hours through five different causes — a stale POST body, a
missing `text` field, a literal "Provided Input" placeholder, a colon in the
auth header (my documentation's fault), and finally requests that never left
the phone. Fixing it properly meant adding request receipts to the server,
binding the tailnet IP directly, and cutting a spoken answer from 26s to 12s
by caching CalDAV reads and parallelising the ask context. The health-push
root cause was also found and closed — the Shortcut's Request Body, not its
queries — though the automation has since stopped firing again for two
nights, which is HIS to check.

Second, the build wave: reminders (with real Apple Reminders alarms),
proactive Telegram, open loops, the fuel scorecard, Ambient v2, the widget
endpoint, the Ops tap-through (delegated to a subagent), the health mirror,
the pattern scout, the About You interview, and the distiller. The turn that
mattered most came from reading the data rather than the backlog: 30 days of
receipts showed Nova produced ~154 drafts and he kept 9, with the flagship
briefs aging out unread. That produced the trust ladder — autonomy computed
from real history and proposed on the rails — whose first pass filed three
proposals that are still waiting. Two things were corrected rather than
added: Nova was inventing macros for "I ate dinner" instead of marking the
planned meal, and a distill record was silently clobbered by writing to the
inbox store from a second process (now in DO NOT, with an in-process
endpoint as the fix).


### 3–4 August 2026
Customisability. Fixed the bug in his screenshot — an ingredients-only tweak
could not be saved because the alternate validator demanded a method it was
never going to have. Made a follow-up refine the version on screen instead of
restarting from the stored recipe, and put a mic beside the ask box so the
whole exchange can be spoken, with the answer read back from the preview
only. Built `editRecipe`: ingredients, method and macros, on any recipe or
any variant, reachable from ✎ EDIT THIS MEAL.

Two things were corrected rather than added. The first cut of the section
writer passed every test while drifting his file — it ate a blank line
between a recipe's `---` and the next heading, and stripped the bold from
steps he never touched; the identity round-trip over his real collection is
what caught it, and the writer now rewrites only the lines that changed.
Second, I spent three rounds chasing a wiring bug that did not exist: the
edit button was absent from the running app only because Vite was serving a
cached module. Both are now in DO NOT. The overnight push also fired a
second consecutive night (12,619 steps filed for 3 Aug), so that criterion
moved from one data point to two.

### 3 August 2026
Closed the steps saga: first fully automatic overnight push landed
(8,295 for 2 Aug). Verified the pmset changes he ran. Corrected my own
diagnosis — both the sleeping Mac *and* a non-firing phone automation were
real, on different nights. Made a sleeping Mac survivable: added this week's
four screens to the offline cache and made "mark meal eaten" queue via the
Outbox. Answered the hosting question (frontend already on Pages; backend
cannot move to serverless). Established this handoff system.

### 2 August 2026
NovaBar diagnosed and fixed (empty icon image, unplaceable status item,
off-screen panel) — it now opens on launch and via ⌥Space. Phone dock made
symmetrical: three each side of the core, Train and Recipes in the default
slots, plus a FREQUENT row in the More sheet. Spread view transitions to
notes/routines/sessions and gave every clickable press physics.

### 1–2 August 2026
Presence, motion and latency: NovaBar built (Swift, no Xcode project),
shared-element transitions on recipes, instant spoken acknowledgement to fill
the 5–8s think gap, CountUp numbers. Topic Pulse shipped. Describe-it food
logging shipped. Recipe promote-duplication bug fixed and his vault repaired.
Variant rename, in-session exercise skip, Coach skip-awareness.

### 30–31 July 2026
Companion Phases 3–5 (voice-confirmed actions, references/research, rituals),
the doorman greetings, skill registry, Nova Operations screen, overnight
queue, Telegram bridge, ambient wall mode, inbox expiry, and the food-log
write-race fix.
