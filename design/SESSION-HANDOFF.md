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

**25–26 AUG — THE SHIP-VERIFICATION CRISIS, EVIDENCE-ON-SCREEN, THE
QUESTION-BY-QUESTION BRIEF CLOSE, AND COACH READING HIS OWN WORDS.**

GOAL: a very long multi-thread session, mostly reactive to him hitting real
gaps in real use. In rough order: (1) universal evidence-on-screen for
anything Nova says out loud. (2) Diagnose and fix why the phone brief was
silent/blank/looping. (3) Infographics for Coach/Fuel findings instead of
paragraphs. (4) A question-by-question close to the morning brief so he
doesn't have to remember what to act on. (5) Let Coach actually apply
program edits from the CHAT, not just the Inbox. (6) **Stop telling him
things are shipped when they are not** — this became the dominant thread
after repeated real failures eroded his trust. (7) Make Coach read, hold
load on, and coach from his per-exercise session notes.

DONE CRITERIA:
- Evidence-on-screen — MET. `inferPanelDirective` (deterministic, code
  decides the panel from the question, never the model) wired into Ask Nova
  AND Coach chat. `sessions` panel added (recent-workouts, didn't exist
  before). Every render site wrapped in `SafeVisual` — an error boundary
  that degrades to a small note instead of blanking the whole screen, which
  is what a malformed panel used to do (no boundary existed anywhere in the
  app before this session).
- Phone voice diagnosis — MET, three DISTINCT root causes found by actually
  watching his screen recordings frame-by-frame rather than guessing:
  (a) the auto/manual brief raced `liveTts` fetched in the startup batch —
  now waits (12s auto / 4s manual) before deciding it can't speak;
  (b) `stageFocus`'s full-screen blur scrim spotlit a card rendered in
  normal page flow below the fold on mobile — literally blurring nothing;
  fixed by drawing the focused card INSIDE the scrim on mobile;
  (c) `primeSpeech()`'s "unlock" element had its `.src` reassigned to every
  TTS blob as it played, so unlocking replayed his LAST sentence at full
  volume and blocked the mic ("Dictation: aborted", visible in his
  recording) — now resets to silence first.
- Infographics — MET. `findingCards.js` maps every coach/fuel finding kind
  to a bars/metric card FROM THE SAME NUMBERS the spoken line quotes (never
  invented). Fuel findings didn't expose their numbers before this session
  (baked into prose) — now do (`data: {...}` on the finding, `finding:` on
  the raised record).
- Question-by-question close — MET. `briefDecisions.js`: existing pending
  records (coach-program/fuel-cross/read-next/coach-audit), asked one at a
  time, yes/no/later maps onto the EXISTING approve/discard rails. Capped at
  5, ordered by consequence. Ships inside `/api/show`'s response.
- Coach applies from chat — MET, but the deploy-verification crisis (below)
  is WHY this took three tries to actually land for him.
- Ship-verification failsafe — MET. This is now the load-bearing
  infrastructure change of the session; see STATE and DECISIONS.
- Session notes reach every surface — MET. `sessionNotes.js` (narrow signal
  reader, suppress-only) wired into the progression engine (a note can HOLD
  a load increase, quoting his sentence), a new `findNoteSignals` detector
  (his own repeated report outranks every computed signal), the weekly
  audit, the Sunday debrief (previously dropped notes/pain/cutShort
  entirely), and both new+resumed Coach prompts.

STATE (paths):
- `src/buildCheck.js` — the whole ship-verification failsafe, client half.
  `RUNNING_BUILD` (compiled in via vite `define`), `fetchDeployedBuild()`,
  `watchForUpdate()` (polls `version.json` every 10min + on visibilitychange),
  `applyUpdate()` (unregisters SW, clears every cache, hard-reloads with a
  cache-busted URL). Wired in `src/App.jsx` (`updateReady` state, banner at
  the very top of the render tree, z-200) and `src/vals/valsMisc.js`.
- `vite.config.js` — `BUILD_ID` is `git rev-parse --short=9 HEAD` (NOT a
  timestamp — see DECISIONS), written to `dist/version.json` by a custom
  `buildStamp()` plugin, injected into the bundle via `define`.
- `scripts/verify-shipped.mjs` — `npm run verify:shipped` (add `-- --server`
  for backend route checks). Checks git push state (via `ls-remote`, not
  `fetch` — sandbox-safe), deployed build id vs local, and a `FEATURES`
  array of marker-strings fetched from the LIVE bundle (entry + every lazy
  chunk it imports, discovered from the live entry's own text — NOT local
  dist filenames, which 404 against a CI rebuild's different hashes).
- `server/lib/sessionNotes.js` — `signalsIn()` (regex-based, suppress-only:
  form-breakdown/pain/fatigue/too-easy), `readExerciseNote`,
  `recurringSignal` (min=2 within=6, pain min=1), `recentNotes`,
  `notesContextLines`. Consumed by `server/lib/coach.js`
  (`computeProgressions` — holds load, attaches `.note`/`.noteDate` to every
  suggestion), `server/lib/coachProgramReview.js` (`findNoteSignals`,
  ranked ABOVE every other finding kind), `server/lib/coachProgramAudit.js`
  (`reported-form` check), `server/lib/weeklyDebrief.js`,
  `server/lib/claudeCode.js` (Coach prompt + `COACH_TURN_REMINDER` for
  resumed turns).
- `server/lib/findingCards.js` — `findingCard()`, `auditCard()`,
  `proteinWeekCard()`. Fed by `.finding`/`.data` fields added to records in
  `coachProgramReview.js` (`out.push({..., finding: {...f, line:undefined,
  fix:undefined}})`) and `fuelCross.js` (`.data.kind`).
- `server/lib/briefDecisions.js` — `buildQueue()` (pure), `questionFor()`,
  `cardFor()`. Driven client-side by `App.jsx` `startBriefQueue` /
  `askBriefQuestion` / `answerBriefQuestion` / `advanceBriefQueue`
  (state: `briefQueue`, `briefQueueIdx`, `briefQueueRemaining`).
- `src/SafeVisual.jsx` — the error boundary. Wraps every `<VoicePanel>` /
  `<StageCard>` render site (6 of them found; 3 duplicate coach-message
  renderers exist in `src/screens/Workouts.jsx` — mid-session, demo, AND
  the actual Coach tab — a new coach-surface feature must patch ALL THREE
  or it silently doesn't appear where he's actually looking).
- `server/lib/claudeCode.js` — `COACH_TURN_REMINDER`, prepended to every
  RESUMED coach turn (the prompt itself only sends on turn 1; his coach
  conversation persists across days, so a session started before a prompt
  change keeps arguing from the old rules — this is CONFIRMED as the cause
  of him being told "I don't have write access in this session").

DECISIONS (choice → reason → what it forecloses):
- Build id is the git SHORT SHA, not a timestamp → a timestamp regenerates
  on every CI rebuild of the SAME commit, so local-vs-deployed could NEVER
  match and the freshness check would cry wolf forever → forecloses any
  clock-based versioning scheme; the sha is the only thing guaranteed
  identical between his machine and CI.
- verify-shipped discovers lazy chunk names from the LIVE entry bundle's own
  text, never from local `dist/` filenames → content hashes differ between
  a local build and a CI rebuild of the same source, so local filenames
  404 against the deployed site (this cost 3 false FAILs on three shipped
  features on the FIRST run of the script) → forecloses trusting
  `dist/assets/*.js` as a proxy for what's actually deployed.
- `git ls-remote` instead of `git fetch` for the push check → `fetch`
  writes to `.git` and is refused in some sandboxes; comparing SHAs
  directly is also a stronger claim than a possibly-stale local ref →
  forecloses relying on `origin/main` being fresh without an explicit sync.
- `sessionNotes.js` signals may ONLY suppress a load increase, never create
  one, and every regex has an explicit positive-report override ("form was
  good" cancels the form-breakdown match) → a false positive costs one
  cautious week, a false negative risks reinforcing an injury → forecloses
  ANY signal in this file ever being read as grounds to increase load or
  volume; that direction stays numeric-only.
- `findNoteSignals` carries NO one-tap fix (`fix: null`), same as
  junk-volume/routine-oversized → what to DO about his technique is a
  Coach conversation, not a silent plan edit → forecloses auto-swapping an
  exercise because a note pattern fired.
- The brief's question queue reuses the EXISTING coach-program/fuel-cross
  inbox records and their EXISTING approve/discard handlers rather than a
  new write path → the apply/undo logic already existed and was tested;
  duplicating it would be two things to keep in sync → forecloses any
  future "decision" kind that doesn't already have an inbox route.
- On mobile, `StageCard`'s focused rendering moved INSIDE the `stageFocus`
  scrim rather than fixing its position in the normal-flow layout →
  the normal-flow position is correct and used on desktop; only mobile's
  viewport is short enough to push it below the fold → forecloses a single
  shared DOM position for the focused card across breakpoints.

VERIFIED (with locators):
- verify:shipped, full run this session: git clean+pushed, deployed build
  `9e55ceb5b` == local, 21 live chunks fetched, ALL 13 feature markers PASS
  in the live bundle he downloads, 6/6 backend routes 200. Independently
  re-checked at close: `curl https://hcooper12.github.io/nova-os/version.json`
  → `9e55ceb5b`, matching `git rev-parse --short=9 HEAD`.
- Phone voice bugs: diagnosed from his actual screen recordings via the
  `/watch` skill (frame-by-frame + Whisper transcript), not inferred. The
  transcript proved audio hardware/routing was fine (ruled out several
  wrong hypotheses) before the src-reassignment bug was found.
- Panel inference + findingCards: run against his REAL vault read-only —
  "pull up my recent upper body sessions" → 13 matched, 5 shown, real
  weights (27.5kg×7 etc). Upper Body 9-listed/4.4-finished, Push 10/5, Pull
  9/5.6 all charted from live data.
- Session notes: `findNoteSignals` independently re-run at session close
  (separate node invocation from the one that built it) → still fires
  exactly once, on Cable Lateral Raise, same as when built. Progression
  engine: Cable Lateral Raise (9.1kg) and Alternate Incline Dumbbell Curl
  (20kg) both HELD citing his exact sentences, live on his real vault.
- All mobile UI (update banner, brief-close answer bar, focused stage card,
  Coach apply buttons) screenshotted at a REAL 375px device-emulated
  viewport (not a style-injected clamp — the `stageFocus` scrim is
  `position:fixed` and escapes a `#root` width clamp entirely, which
  produced a false "it overflows" reading earlier in the session before
  switching to `mcp__chrome-devtools__emulate`).
- 671/671 server tests, lint 0 errors, build green at every ship point this
  session (checked repeatedly, not just at close).

ASSUMED (not verified):
- That he has actually seen the update banner and tapped UPDATE. The
  mechanism is deployed and verified live; whether HIS device has crossed
  the poll interval / foregrounded since is not observable from here.
- That the Coach-tab proposal buttons read correctly on a REAL phone rather
  than the emulated 375px viewport used this session — device emulation is
  not the same hardware, and Safari/iOS PWA rendering has surprised this
  project before (see prior DO NOT entries, now folded into memory).
- That `findNoteSignals`' thresholds (min=2 within=6 sessions for form,
  min=1 for pain) are the right cadence for HIM specifically — chosen from
  first principles (twice is a pattern, pain is never worth waiting on),
  not tuned against a real recurrence yet because he doesn't have one on
  record besides the lateral raise.

OPEN QUESTIONS / BLOCKERS:
- He was mid-way through re-adding the Atomic Habits PDF when this session
  picked up the notes work — never confirmed whether the ingest actually
  completed after the update banner should have refreshed his bundle.
  Worth asking directly next session rather than assuming.
- The existing coach-program/fuel-cross records raised BEFORE this
  session's `.finding`/`.data` fields were added will show text-only cards
  in the brief's question queue, not charts, until each is naturally
  re-raised. Not a bug — just means the charted close won't look complete
  on his very next brief for records already sitting in his Inbox.
- `findNoteSignals` has fired exactly once, ever (Cable Lateral Raise). Like
  the volume detectors before it, its behavior on a SECOND real recurrence
  is unproven — worth watching, not re-tuning pre-emptively.

NEXT ACTION: ask him directly (a) did the Atomic Habits PDF ingest actually
finish once his phone updated, and (b) how did the Coach-tab apply buttons
and the brief's question-by-question close actually read on his real
device. Both are the kind of claim this session's whole failsafe exists
to stop taking on faith — confirm with him, don't assume from the emulator.
Expected observation if the update banner is doing its job: he reports
seeing "A newer Nova is ready" rather than a feature silently appearing.

DO NOT:
- Do not tell him ANYTHING is shipped without running `npm run
  verify:shipped` first and reading a clean pass. This is now written to
  memory (`never-claim-shipped-unverified.md`) because it was said,
  wrongly, MULTIPLE times this session before the failsafe existed — nine
  commits sat unpushed behind a blocked permission classifier at one point
  while "done" kept being reported.
- Do not assume `registerType: 'autoUpdate'` means his device is current.
  It updates the SERVICE WORKER in the background; the RUNNING app keeps
  its old JS until a genuine reload, which in an installed PWA he doesn't
  force-quit can be days. This is why the update banner exists — do not
  remove it or downgrade it to something dismissable-forever.
- Do not add a coach-chat-facing feature and patch only ONE renderer.
  `src/screens/Workouts.jsx` has THREE separate coach-message render
  blocks (mid-session / demo / the actual Coach tab) built from the same
  `coachMsgs` view-model but rendered independently. This session shipped
  a "fix" that only worked in the surface he wasn't looking at, TWICE
  in one session (panels, then proposal buttons) before catching the
  pattern. Grep for all render sites before calling a coach UI change done.
- Do not verify a mobile overlay with a `#root` width-clamp style
  injection if the overlay might be `position:fixed` — it escapes the
  clamp entirely and produces a false "doesn't overflow" or false
  "overflows" reading depending on which way you get unlucky. Use real
  viewport emulation (`mcp__chrome-devtools__emulate`).
- Do not read `this.state.X` immediately after calling `this.setState({X:
  ...})` in the same synchronous block — React has not committed yet. Hit
  this exact bug in `startBriefQueue`/`askBriefQuestion`: the first
  question silently produced an answer bar with no card and no words asked.
  Read from a `setState` callback or pass the value down explicitly.
- Do not let a session-note signal regex match on the bare presence of a
  word without a negative-report override. "Form was good" contains
  "form"; matching on that alone would have inverted the entire feature's
  meaning on a genuinely positive report.
- Do not add a build-id scheme based on wall-clock time. It cannot equal
  itself between a local build and a CI rebuild of the same commit.
- Do not verify a UI change at desktop width only. The ASK button escaped
  its card at phone width and he found it AFTER I called the feature live
  — this class of miss recurred again this session (the update banner, the
  brief answer bar) before every mobile check moved to real device
  emulation. See the width-clamp DO NOT above for the deeper trap.
- Do not trust a browser measurement without confirming the page runs the
  code you just wrote. A hash-only navigation does NOT re-execute modules,
  and the service worker serves the previous build.
- Do not add a detector without running it against his REAL log first.
  `findNoteSignals` was checked against his 5 real notes AND a set of
  negative cases before shipping, per this standing rule.
- Do not let Coach propose cutting an exercise it added itself — guarded
  by the 21-day `justAdded` marker check; keep that guard if the detector
  is refactored.
- Do not assume `--allowedTools` restricts anything under
  bypassPermissions; only `--disallowedTools` is enforced.
- Do not run a scratch server on port 4199 while `npm test` runs —
  EADDRINUSE breaks the suite.
- Do not write to inbox.json from a side process while the server runs; go
  through its endpoints. (This session's `runWeeklyAudit` bug — a record
  written via `createRecord` with no `id` and no `createdAt` — was caught
  live and required stopping the server, patching the file, then
  KICKSTARTING so it reloaded from disk rather than clobbering it from its
  own stale in-memory state on next write.)
- Do not grep NOVA_TOKEN in server/.env — it is API_TOKEN.
- The Pages URL is hcooper12.github.io/nova-os (not haydencooper).


## SESSION LOG (append-only, newest first)

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
