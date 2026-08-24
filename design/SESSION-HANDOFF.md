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

**23–24 AUG — PERFORMANCE PHASE C, THE LIBRARIAN + VISUAL LIBRARY, COACH THAT
CHANGES THE PLAN AND JUDGES IT, AND A RUN OF FUEL FIXES HE HAD TO ASK FOR TWICE.**

GOAL: a long multi-thread session. (1) Finish the fluidity plan (Phase C:
slice-tagged SSE, intent prefetch). (2) Books as first-class second-brain
knowledge + a visual Library for every source. (3) Let Coach APPLY its
suggestions to the real program, confirmed and undoable. (4) Make Coach
judge whether training is "enough / too much" and stop suggesting load for
the sake of it. (5) A run of Fuel bugs and ergonomics.

DONE CRITERIA:
- Phase C — MET. Slice-tagged SSE live (996KB → 3KB measured on his real
  server); intent prefetch on Notes rows + nav; voice/Kokoro prewarm shipped
  but marginal (see ASSUMED).
- Librarian + Library — MET. Book → dossier → vault weave, real jackets,
  provenance read/researched, daily-review + Distiller resurfacing.
- Coach applies plan changes — MET, and exercised on his REAL plan mid-gym.
- Coach judges enough/too much — MET. Six detectors; the RPE fix is the
  substantive one.
- Fuel run — MET for everything he named. See DO NOT for the two I shipped
  broken first.

STATE (paths):
- `server/lib/writeSlices.js` + `server/lib/events.js` + `routes/snapshot.js`
  (`?only=`) — slice-tagged sync. `src/App.jsx` `queueStreamRefresh`/`refreshSlices`.
- `server/lib/librarian.js`, `server/lib/library.js`, `server/lib/bookCovers.js`,
  `server/routes/library.js`, `src/screens/Library.jsx`, `src/vals/valsLibrary.js`.
  Plan: `design/LIBRARIAN-PLAN.md` (phases 2–4 unbuilt).
- `server/lib/coachPlan.js` — the ONLY thing that mutates a routine (typed ops
  + undo). `server/routes/workouts.js` `/workouts/coach-apply`.
  `src/CoachApplySheet.jsx`.
- `server/lib/coachProgramReview.js` — six detectors incl. `findEffortCeiling`,
  `findOversizedRoutines`, `findLowValueExercises`. `server/lib/coach.js` —
  RPE now gates load on the default path.
- `src/PortionSheet.jsx` + `src/portion.js` — one global "log any meal" sheet;
  three surfaces feed it.
- `server/lib/jsonRepair.js` — the health-push empty-value repair.

DECISIONS (choice → reason → what it forecloses):
- Slice tags default to NULL = full sync → under-tagging fails silently and
  would make Nova lie about the vault → forecloses aggressive narrowing;
  every new write path is full-sync until deliberately tagged.
- Librarian synthesises IDEAS, never fetches book text → piracy, and raw text
  is useless to the graph → forecloses "full transcript of a book" permanently.
- Book covers fetched + cached SERVER-side → phone never talks to
  openlibrary.org; works offline; reading list not leaked → forecloses
  client-side cover fetching.
- Coach mutates plans ONLY through typed ops in `coachPlan.js` → models decide,
  code acts → forecloses letting a model edit routine files directly.
- `junk-volume` / `routine-oversized` / `effort-ceiling` carry NO one-tap fix
  where the choice is his → a coach that silently deletes training is not one
  you keep → forecloses auto-trimming volume.
- One global PortionSheet instead of per-surface buttons → he explicitly asked
  not to keep coming back for small tweaks → adding a 4th entry point is one
  call, not a feature.

VERIFIED (with locators):
- Slice sync: live server, read-only — full snapshot 35 slices/996KB vs
  `?only=todos` 1 slice/3KB. Browser (prod build): tagged→`?only=todos`,
  untagged→full, burst→union, tagged+untagged→full.
- Librarian: real run on scratch vault (Atomic Habits, sonnet) → dossier
  honoured every honesty rule; weave produced 12 typed pages and EXTENDED the
  seeded Habit Formation concept rather than forking it. Job discarded; no
  vault touched.
- Library jackets: real 331×500 / 369×500 JPEGs cached to disk, 3ms on repeat;
  screenshot of shelf + detail.
- Coach apply: applied to his REAL plan — Push now has Incline Barbell Bench
  Press (4×10-12) + Weighted Pull-Up (3×12-12, ~5kg); Pull has Weighted
  Pull-Up. Both carry ◆ COACH markers. A real model amend run honoured
  "add the new one but don't remove the old".
- RPE fix: his real log — 227 working sets, ALL RPE-rated, 88–94% at RPE 9–10;
  Dumbbell Shoulder Press (Single Arm) 22.5kg @ RPE 9/9/10 with reps flat was
  being told +2.5kg. Now returns `quality`. Live server confirms mix.
- Health push repair: live log line "repaired 2 empty value(s) in POST
  /api/health-data" (~/Library/Logs/nova-os-server.log).
- Fuel: variant logged at ½ stored 15P/12C/11F/210kcal (exactly half its own
  30/24/22/420) with recipe untouched; 21 cards carry ＋ LOG THIS; ASK button
  right edge 340 vs card 357 at a 375px-constrained panel.
- This close: lint 0 errors, build green, 528/528 tests, git clean and pushed,
  backend 200, no stray processes, no dist/pc.json, deploy 32721579584 success.

ASSUMED (not verified):
- That his RPE logging is CALIBRATED. The 88% figure assumes "9" means one rep
  in reserve, not "that felt hard". If it is habit-rating, the effort-ceiling
  finding overstates the case. Flagged to him; needs his judgement, not code.
- Voice/Kokoro prewarm value. The SpeechSynthesisVoice cache measured
  0.0020ms → 0.0015ms per sentence (negligible) and index.js already boots the
  sidecar at startup — the added ping only helps if the sidecar died. Kept as
  hygiene, NOT claimed as a win.
- That his phone has picked up any of this. Every fix ships to GitHub Pages,
  but his device runs a cached bundle until the app is fully closed/reopened.

OPEN QUESTIONS / BLOCKERS:
- Librarian phases 2–4 unbuilt: owned-book files (EPUB/PDF need exporting to
  text first — no native extraction), spaced resurfacing beyond the two hooks,
  read-next graph-gap analysis. `design/LIBRARIAN-PLAN.md`.
- The `stale` detector still fires on Cable Flys Low Position even though it
  was swapped OUT of Push — it reads session HISTORY, not current membership.
  Filtered in practice by the `seen` findingKey guard, but a re-raise would
  propose swapping an exercise no longer in any routine, and `applyOps` would
  throw "not in any routine". Not hit yet; worth a membership check.
- `findJunkVolume`, `findLowValueExercises`, `findLongTenure` have NEVER fired
  on his real data — unit-tested only. Their thresholds are unproven in the field.
- He is mid-Push-session as of the last check (draft with 10 exercises logged).
  Plan changes applied take effect NEXT Push, not that one.

NEXT ACTION: ask him whether his RPE scale is calibrated (one-rep-in-reserve
vs "felt hard"). If calibrated, the effort-ceiling finding is the highest-
leverage change available to him and should be surfaced hard; if not, raise
`GRIND_RPE`/`EFFORT_CEILING_SHARE` in `server/lib/coach.js` +
`coachProgramReview.js`. Expected observation if handled: the progression mix
from `/api/workouts/routines` stops being 14/14 `quality` and shows a spread
of weight/reps/quality.

DO NOT:
- Do not verify a UI change at desktop width only. The ASK button escaped its
  card at phone width and he found it AFTER I called the feature live — twice
  now this class of miss. Constrain the panel (a style injection works) or
  emulate; a row that fits at 1000px proves nothing about a phone.
- Do not trust a browser measurement without confirming the page runs the code
  you just wrote. A hash-only navigation does NOT re-execute modules, and the
  service worker serves the previous build — this produced a precise,
  believable, WRONG measurement (two requests exactly 3001ms apart) that
  nearly had me "fix" working code. Clear SW + caches, change the QUERY string,
  pass ignoreCache.
- Do not add a detector without running it against his REAL log first. Two
  shipped-then-corrected in one session: a session-length ceiling that could
  never fire (he already splits routines across days), and copy that told him
  to "earn 9 clean reps" on a lift he was already doing 12 of.
- Do not let Coach propose cutting an exercise it added itself — it offered to
  drop Weighted Pull-Up 30 minutes after creating it. Guarded by the 21-day
  `justAdded` marker check; keep that guard if the detector is refactored.
- Do not assume `--allowedTools` restricts anything under bypassPermissions;
  only `--disallowedTools` is enforced.
- Do not run a scratch server on port 4199 while `npm test` runs — EADDRINUSE
  breaks the suite (hit again this session).
- Do not write to inbox.json from a side process while the server runs; go
  through its endpoints. (Seeding a record with the server STOPPED is fine.)
- Do not grep NOVA_TOKEN in server/.env — it is API_TOKEN. And note
  `ensureApiToken()` APPENDS a generated token to the real .env if it is unset.
- The Pages URL is hcooper12.github.io/nova-os (not haydencooper).


## SESSION LOG (append-only, newest first)

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
