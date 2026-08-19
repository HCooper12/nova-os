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

**19 AUG — DATA LOSS I CAUSED, AND THE FIX (read this first):**
During a harness run I found a parked Pull session, assumed it was my
own leftover, typed a test note into it and DISCARDED it. It was his
live workout — 6 ticked sets. Server log proves it: his phone
(100.77.255.37) mirrored that draft until 02:56:30Z, my harness saved
over it 02:56:48Z, my discard deleted it 02:57:52Z, his phone then
GET the draft twice (02:59, 03:06) after its tab was reclaimed and got
nothing. Unrecoverable: no APFS snapshot, guardian only parse-checks
(never backed it up), no tmp residue. Only surviving fragment is a
screenshot: Pull-Up 14 reps @RPE10/RIR0 and 15 @RPE9/RIR1, both
ticked (~/Desktop/lost-workout-evidence-19aug.png).
FIXES SHIPPED: discard now ARCHIVES for 7 days (archive doubles as the
stale-echo tombstone), GET …/session-draft/discarded + POST …/restore,
and Train shows 'DISCARDED WORKOUT — STILL RECOVERABLE / RESTORE IT'.
Memory rule added: the harness may READ live data, never mutate it.
*Last updated: 18 August 2026 (late afternoon)*

**GOAL:** The Train+Fuel redesign shipped to mockup parity, the coach-audit
list is fully live, and his two standing directives from this session are
discharged: (a) every visual claim is now screenshot-verified before it is
claimed (permanent-memory mandate, harness procedure in the memory file
`ui-changes-visual-verification`), and (b) the visual-claims audit he
ordered is DONE — both past claims verified real on screen, and the audit
caught a live reply-loss bug in the act (fixed same day).

**VERIFIED THIS SESSION (all by screenshot or live endpoint, receipts in
`~/Desktop/nova-design-history/2026-08-18-{p1,p2,audit,p3}/`):**
0. HIS MID-SESSION FEEDBACK ("gym tab still needs work to be more like
   the mockup") — root cause was the missing ON TODAY'S CARD hero.
   Shipped + screen-verified: PUSH / 10 exercises · ~85 min · last time
   tonnage / ▶ BEGIN SESSION; live bundle hash-verified after deploy.
   Also shipped + screen-verified same batch: the LONG-PRESS SYSTEM
   (routine cards, session exercises, rotation meal cards; right-click
   = same menu on Mac; bottom sheet on phone), ▶ FORM chips + Coach
   'resource' proposal action (inbox rails, undoable), and the
   Mobility dimension (group excluded from hypertrophy volume, 14-day
   adherence line, prompt contract).
1. P2 session cockpit on screen: RIR column, WK/BO/WU chips, note+ANOMALY+
   PAIN row, full pain sheet (exercise-relevant areas, sides, timing,
   Other…, free text, ASK COACH triage), finishing-early chips; Fuel
   one-bar log. Deployed bundle hash matched the verified dist.
2. Voice animation dynamics REAL (SPEAKING state, waveform differing
   between frames mid-brief); canvas panels REAL (asked "show my training
   week" → TRAINING WEEK · LIVE FROM YOUR LOG rendered mid-conversation).
3. Fuel cross-reference agent (spec #11, non-negotiable): fuelCross.js
   pure analyze() core + 9 honesty tests; surfaces in Coach context,
   morning cadence line, and Inbox ('fuel-cross' records, weekly cooldown,
   7-day expiry, approve=acknowledge). First real run: "150g protein floor
   missed on 11 of last 12 fully-logged days" — record c7488663 pending in
   his Inbox now. GET /api/train/fuel-cross + POST …/raise live-verified.
4. Decline-asks-why: WHY PASS? panel on Coach-advice discards (chips +
   free text + discard-anyway + keep-it, screen-verified on the live
   fuel-cross card); declineReason rides the record; adviceContext
   instructs: reasoned decline → never re-ask, one counter-case allowed;
   unreasoned → ask once. 348/348 server tests.

**FIXED THIS SESSION (bugs found by verifying):**
- REPLY LOSS: a service-worker update (fires on EVERY deploy) reloading the
  page mid-spoken-answer permanently ate the reply+panel — askJob receipt
  was cleared at fetch-time, commit rides the speech queue seconds later.
  Now cleared only at on-screen commit; plus a duration+3s watchdog in
  playSpeechBuffer frees the FIFO when a gestureless AudioContext stalls.
- Coach context failure labels were shifted one block (failed nutrition
  reported as 'recovery') — every label now names its own section.
- Stray untracked `src/App 2.jsx` / `src/Voice 2.jsx` Finder duplicates
  quarantined to scratchpad (never committed).

**ASSUMED (unverified):**
- The morning cadence's new fuel line + weekly inbox raise will fire in
  tomorrow's 7–12 window (code path tested via the on-demand endpoints;
  the scheduler tick itself not observed).
- The SW-update reload can no longer eat a reply — fix verified by
  re-attach logic reading, not by reproducing the reload race live.

**OPEN (next session, in priority order):**
1. Apple Health workout ingest — BLOCKED on ~10 min with his phone.
2. First real long-press use on HIS iPhone (harness verified touch via
   contextmenu parity + the sheet; a physical-device hold is the last
   confirmation).
3. Coach 'resource' action end-to-end with a real web find (rails and
   prompt shipped; not yet exercised by a live Coach turn).

**19 AUG PM2 — cockpit ergonomics + instant resume + the built Shortcut:**
- Set row FLEXES at 390px (tick was pushed off — his report); RPE/RIR/TYPE
  headers are tap-to-explain Terms; SET TYPE glossary entry added.
- Notes are auto-growing textareas (long note verified at phone width).
- PARKED SESSION renders from device state alone — session view + tab bar
  no longer gated on usingLiveWorkouts (the 12s snapshot was the wait);
  TODAY hero shows gold SESSION IN PROGRESS / ▶ RESUME instead of BEGIN.
- Workout durations parse minutes, seconds, and clock strings (Apple's
  Duration detail serialises unpredictably) — tested all dialects.
- THE SHORTCUT IS BUILT AND SIGNED: 'Nova Workout Push signed.shortcut'
  ON HIS DESKTOP, import sheet already open in Shortcuts on the Mac —
  ONE CLICK ('Add Shortcut') imports; iCloud syncs it to the iPhone.
  Property names verified against Apple's dyld cache (Workout Type /
  Active Energy Burned / Duration); latest-10-idempotent design avoids
  fragile date filters. He then adds the 'when a workout ends'
  automation on the phone. ALSO: an osascript accessibility prompt from
  my probe may still be up — DENY it, it's not needed.

**19 AUG LATE — Apple Health workout ingest: server side LIVE, phone next:**
- healthWorkouts.js + POST/GET /api/health-data/workouts: Shortcut-shaped
  tolerance, own-date grouping, idempotent merge (live-verified twice on a
  synthetic past date, then removed), pushlog receipts kind:'workouts'.
- Flows: TODAY hero 'Watch today' line (absent until a push — no zeros);
  Coach context + nightly reflection get APPLE WATCH WORKOUTS with the
  logged-vs-tracked JOIN check (watch strength day with no Nova session →
  raised once, gently).
- CI lesson: workout dates resolve in the SERVER'S zone; tests pin
  Australia/Sydney or a UTC runner asserts the wrong day.
- HIS 10 MINUTES: design/APPLE-HEALTH-WORKOUTS.md — exact Shortcut
  (same host+token as the nightly health push) + 'when a workout ends'
  automation. THE BOARD IS OTHERWISE EMPTY.

**19 AUG NIGHT — item 2 SHIPPED AND OBSERVED LIVE; the flake is dead:**
- coachReflection.js: nightly (03:00-05:00, once/day) the Coach reviews
  the week unasked. Outputs bounded by the rails: ≤3 learn proposals
  (approval-gated), ≤1 Telegram outreach, or recorded silence.
  POST /train/reflection/run {force:true} for on-demand.
- FIRST LIVE RUN (forced, 19 Aug ~13:00): raised 2 genuinely sharp
  learnings ("he does not self-progress load — stalled prescriptions
  sit until the Coach moves them", "the 150g floor functions as a
  ceiling", both evidence-cited) + sent 1 outreach to Telegram. The
  once/day state means tonight's window skips; normal from tomorrow.
- inboxRetry flake ROOT-CAUSED: test.after rm raced a trailing store
  write → ENOTEMPTY killed the FILE. Cleanup settles+retries now;
  two consecutive 355/355 full-suite runs.
- The expertise plan (items 1, 2, 3) is now fully live. Still open:
  Apple Health ingest (his phone), long-press on his physical iPhone.

**19 AUG EVE — overflow glitch + Coach expertise items 1+3 SHIPPED:**
- Fuel left-shift glitch: 5 icons + input overflowed 390px → page scrolled
  sideways. Bar is now input+mic+camera+barcode (camera = iOS action sheet,
  shoot OR library). Verified: 0px horizontal overflow.
- GHOST SESSIONS: debounced draft upload in flight when he discards landed
  AFTER the server clear → immortal 'Workout in progress' banner. Fixed
  with a clear-tombstone; saves captured strictly before it are dropped.
  (CI caught a same-ms tie-break bug in v1 — strictly-before is the rule.)
- ITEM 1: coachKnowledge.js — 'Coaching Principles' (seeded doctrine, his
  to edit) + 'What Works For Hayden' (client file, written ONLY via the
  new 'learn' proposal action, undo removes the exact line). Both ride
  every Coach conversation; BOTH PAGES SEEDED IN HIS REAL VAULT.
- ITEM 3: sessionDebrief — saving a session fires a composition-only
  model call (greeting architecture, sonnet default) over computed facts;
  Telegram delivers the coach's unprompted reaction. NOT yet observed
  live (fires on his next real session save).
- Remaining from his expertise ask: item 2, the nightly reflection agent
  (review week → update client file → open at most one conversation).

**19 AUG PM — three more of his reports, fixed + screen-verified:**
- "Coach still only adds reps to pull-ups": OUTGROWN engine kind — every
  set ≥ target-high+2 twice running stops rep suggestions, gold chip is
  a doorway to the Coach, TODAY focus leads with it, context carries an
  unprompted-raise order with a concrete-alternative requirement. Tested.
- Fuel ≠ mockup: renamed Recipes→FUEL (labels only, route unchanged);
  hero holds side-by-side on phone; TRAINING × FUEL cross-check card ON
  the Fuel screen (snapshot slice fuelCross in BOTH maps); one bar with
  dictation mic; day chips + manual macros folded away (manual auto-
  opens when a photo-scan lands numbers). Phone-width screen receipts
  in ~/Desktop/nova-design-history/2026-08-19-fuel/.
- His open question (answered in chat, roadmap pending his pick):
  how to give Coach deeper standing expertise + self-initiated
  behaviour. Candidate lanes: curated knowledge pages the Coach reads
  (principles per goal, his response history), a nightly reflection
  agent that reviews the week and OPENS conversations via inbox/
  Telegram, and a post-session debrief turn. NOT built yet.

**19 AUG — HIS TWO BUG REPORTS, both fixed + screen-verified same day:**
- "FORM not in my actual platform but you said it was" — TRUE claim
  failure: chip required a curated link, none existed. Now: FORM on
  EVERY exercise (cyan=curated, dim=honest search fallback), and all
  30 program exercises carry REAL curated videos (web-searched this
  session — Nippard/RP/Athlean-X etc., filed via the knowledge
  endpoint). Lesson for the ledger: a supply line without supply is a
  false claim on his screen even when the code is 'done'.
- "Can't switch to coach tab mid-workout" — the session pinned
  trainTab. Unpinned; green ● on GYM marks the live session; GYM→
  COACH→GYM round-trip verified with session intact.
5. Test flake: server/test/inboxRetry.test.js fails ~2/3 of full parallel
   suite runs, passes isolated — shared data-dir contention suspected.
6. His two harness test questions ("put my training week up…") remain in
   the harness context's transcript only — his devices unaffected.

**DO NOT:**
- Do not claim any visual change without a harness screenshot (permanent
  memory). The harness MUST unregister service workers in ITS context —
  a stale SW mid-session reloaded the page and both fooled verification
  AND ate a live reply this very session.
- Do not write to inbox.json from a side process while the server runs —
  inboxStore caches in-memory per process; a side write gets clobbered on
  the server's next persist. Go through the running server's endpoints.
- Do not use grep NOVA_TOKEN in server/.env — the token var is API_TOKEN.
- The Pages URL is hcooper12.github.io/nova-os (not haydencooper).


## SESSION LOG (append-only, newest first)

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
