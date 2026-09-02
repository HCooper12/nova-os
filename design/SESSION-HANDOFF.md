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

**2 SEP (cont.) — EXECUTING THE AUDIT'S PROGRAMME: TIERS 1 AND 2 DONE, TIER 3 NEXT.**
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
- Tier 3 (#15 Galaxy rebuild, #16 follow-through loops, #17 pocket set,
  #18 per-item remainder) — UNMET. #16 recon started (streaks reconcile,
  review continuity, plan completion loop).
- Phone-width (375px) pass — still BLOCKED (browser tool resize lies); every
  client change this session is code-read + bundle-marker only.

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
- Tests 727 → 783, all green. verify:shipped has six new markers.
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
- Client renders (Fuel couldn't-check card, Ambient unknown, Mission error
  state) unseen at any width.

OPEN QUESTIONS / BLOCKERS:
- `stores | alert | 15 filed records missing undo data` (8 Aug–1 Sep:
  pattern×4, coach-program×4, fuel-cross×3, coach-audit×2, model-choice×2)
  — real holes, or informational records the Guardian check shouldn't
  count? Undecided; the check still alerts.
- He has declined all 12 food-save proposals ever made — the lane's premise
  may not fit; surfaced, not acted on.
- Week-plan window semantics; `guardian: 26h`; phone-width pass — carried.

NEXT ACTION: Tier 3 — recommended order #16 server-side first (streaks
count approved training checks + schedule-aware; the Daily Review reads
yesterday's review and its fate), then #16's plan-completion loop and #17
(UI — needs a phone-width path), then #15 Galaxy rebuild (UI, gated on
verification), then #18 per-item remainder.

DO NOT:
- Do not sandbox a vaultStateFile-owned file by path, and do not write one
  raw — go through the module (see stagedPass.js header).
- Do not match `\w{3}` for an en-GB short month — September is "Sept".
- Do not write a source-scanning test whose forbidden literal appears in
  your own explanatory comment — scan code lines only.
- Do not run verify:shipped with the next item's changes uncommitted: it
  (correctly) fails the git check for the previous item.
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
