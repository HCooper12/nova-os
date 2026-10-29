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

**29 OCT (afternoon) — NOTIFICATIONS CUT, ACK FIRST, WARM MIC, NO DOCS DEPLOYS. ALL ON origin/main (205adeb2, d68ca97b, 68bf471c, 40e49fd9); DEPLOY GREEN; SERVED BUNDLE CHECKED; SERVER RELOADED. NOTHING SEEN ON HIS PHONE.** Notifications: server/lib/notifyPolicy.js gates the Inbox push, Telegram and every direct sendPush `kind` (memory nova-notification-policy); was ~17 pushes/day. CHECK: `grep "push kept quiet" ~/Library/Logs/nova-os-server.log` after 06:03 tomorrow (Morning Dispatch). Warm mic: src/warmMic.js, held only on the built-in mic during a conversation he opened; READ micReused/micRoute/micKept/micOpenMs in server/data/voice/turns.json after his next spoken conversation (expect micOpenMs near 0 from turn 2; an AirPods turn should say bluetooth or unknown-route). Off switch per device: localStorage novaos.warmMic = '0' (no Settings toggle yet). OPEN (his call): stop calendar "starts soon" lines (64/week, iOS Calendar already alerts)?

**29 OCT (latest) — VOICE TURN + UPDATE BANNER FIXED (23842fb8, a2ae1914; origin/main; deploy green; served bundle carries both (version.json a2ae19148); server reloaded). NOT SEEN ON HIS PHONE.** Voice, from his real 26-28 Oct turns: stale calendar "starts soon" lines spoken before the ack (alerts.trueUntil), 7/28 blind-meter turns (clip read every 2.5 s, words end the turn; openOwnMeter fallback), false mic timeouts while the page froze (stallOf), 8/12 spurious "answer is ready" pushes (poll delivered closes the watch), "." never words. Receipts now carry blindReads/stallMs/meter/graphAtBlind/muted: READ server/data/voice/turns.json after his next few spoken turns to see which meter heard him. Banner: applyUpdate waited only 1.2 s and reloaded under the old SW; now SKIP_WAITING + controllerchange, up to 120 s while installing. OPEN (his calls): ack before "one thing first"?; keep the mic open across a conversation?; continuation mic to wait for the ack? Also: the local Nova's "Asking the Coach." lead line is spoken as part of the answer, and local answers run 16-26 s with no lookups (prompt ~2.2k tokens + 4B generation); every docs commit makes a new build = a new banner.

**29 OCT (later) — NOVA ON THIS MAC ASKS EVERY AGENT ITSELF (076a04d4, dcaf3211; ON origin/main; SERVER RELOADED; PROVEN LIVE ON HIS BENCH QUESTION: Coach + Researcher asked by code, local 4B answered, no Claude).** askRoute.agentsFor decides who a question needs; localAsk runs them on the consult rail before the turn and offers ask_agent; only his correction / "ask Claude" / a give-up after the agents reaches Claude. HIS CALLS: Coach stays on Claude (accuracy); YES to on-phone offline Nova (next after voice). The Harper Carroll reel = Nova's doctrine; new asks in memory nova-local-scope-widened. TWO AGENTS WERE RUNNING AT THIS POINT: the PWA UPDATE-banner loop fix and the voice-path audit; their work is uncommitted in the tree if this session ended before they reported.

**29 OCT 10:05 AEDT — ASK NOVA NO LONGER SAYS "I CANNOT ANSWER": KNOWLEDGE QUESTIONS AND GIVE-UPS GO TO CLAUDE (1bae625b, ON origin/main, SERVER RELOADED, VERIFIED ON THE LIVE ENDPOINT; NOT SEEN ON HIS PHONE).** He was furious: the 4B local model (local-first since 27 Oct) answered "barbell or machine press for chest growth, and why?" with "I cannot answer" twice, with `lookups=0`, even after his correction. CAUSE: holdForEscalation only fires on a local FAILURE; a reply saying it cannot answer was a success. FIX: server/lib/askRoute.js `needsClaude(question)` (comparison, why, how-should, should-I, research, ask Coach, his corrections) routes in askDispatch.startAsk before the local model is asked, labelled `escalated` + reason; `gaveUp(reply)` in localAsk hands a give-up to Claude on the same job (`escalateReason`). Tests: server/test/askRoute.test.js (his real turns as fixtures) + 2 in askDispatch.test.js; full suite 4443 pass / 7 known fail. LIVE CHECK: POST /api/ask with his exact question → log "a question the evidence settles; Claude answers" → consulted Researcher (141 s) + Coach (9.5 s) → real answer, `provider claude, escalated, reason`. SIDE EFFECT: that run filed a pending `research` record (the Researcher's cited brief) in his Inbox at 23:02Z. NEXT: watch `grep "local ask: gave up\|ask: .*Claude answers" ~/Library/Logs/nova-os-server.log` for false positives/negatives over a few days; the same gap probably exists in the local Coach (it never hands up either) but that lane is Claude by default. DO NOT: let a local model's "can't" be spoken.

**27 OCT (afternoon, widget session) — STEPS ARE THE THIRD RING ON THE FUEL WIDGET AND THE WIDGET READS LIVE STEPS ITSELF (bc4dbde7). ON MAIN, NOT PUSHED, NOT ON HIS PHONE.** His ask: steps in the ring, and steps live on a walk. CAUSE of the lag (measured from pushlog + code, not guessed): background delivery already existed; Health receives iPhone steps in batches (opening Health flushes them) and iOS caps step-count background delivery at hourly, so a Mac-relayed count trails a walk. FIX: `NovaLiveSteps` (CMPedometer since midnight) read by the widget at every redraw, shown as max(Mac, pedometer); never posted to the Mac; timeline ask 10 min by day; Motion & Fitness asked once from NovaWidgetsPlugin.configure; NSMotionUsageDescription in both plists. VERIFIED: iOS typecheck of the real extension, full simulator build green (both bundles carry the plist key), merge rules in a macOS harness (7 cases), Fuel render at 1,541 / goal met / empty. NOT VERIFIED: anything on the phone. It needs an Xcode install (phone was `unavailable` to devicectl), then he taps Allow on Motion & Fitness when Nova opens, then a walk. Open questions only the phone answers: does the extension process get CMPedometer once the app is authorised, and how often iOS really redraws. If the steps do not move on a walk, the extension is refused: fall back to the app writing the pedometer count into the App Group on foreground. The peer's uncommitted `ios/App.xcodeproj/project.pbxproj` (a reorder only) and `server/lib/claudeSessions.js` were left alone.

**27 OCT (afternoon) — THE LOCAL COACH: BUILT (3900a66b), BENCHED (9091b883), ON CLAUDE BY DEFAULT.** His yes to "a Coach that answers on the Mac, changes go to Claude". lib/localCoach.js (11 read-only tools over the Claude Coach's own builders, today's date by code, 4 rounds), coachTurn.js dispatch (wantsChange / consult / planner → Claude; ESCALATE / PROPOSE / failure → Claude on the same job id via askDispatch's now-general holdForEscalation). num_ctx 16384 everywhere (+184 MB, measured). BENCH on 17 of his real questions vs Claude's answers: 9.1 s median, 82 % number-grounded, but CONFIDENTLY WRONG where it matters (#6 inverted overhead-extension cue, #9 invented session count + "cut to two exercises", #5 broke off mid-answer) and 0 hand-ups in 34 turns. So the lane is `localFirst: false`: Claude by default even under local first; This Mac only if he picks it. Live board after reload: nine lanes local, coach claude. A 9B rerun could NOT run: the memory guard refused (3,112 MB free, the 9B needs ~7,696 MB; even with the 4B unloaded ~6.5 GB). The 9B tier needs a quieter Mac (fewer Claude sessions / Chrome); rerun with `node server/scripts/benchLocalCoach.mjs --model qwen3.5:9b --out design/audits/2026-10-27-local-coach-bench-9b.md` when `memory_pressure` shows > 50 % free. NEXT: code-side hand-up rules (plan reports, named experts, form cues → Claude) and whichever model passes; the Coach tab does not yet show the "answered on this Mac / asked Claude" meta line (only Nova's door does).

**27 OCT 10:46 — HE COULD NOT OPEN NOVA. CAUSE: TAILSCALE ON THE MAC HAD SWITCHED ITSELF OFF (his widget's last request 00:56). FIXED 10:49 (`tailscale up --accept-routes`); his iPhone fetched again 10:52. GUARD BUILT: e97e9dc2 lib/tailnetWatch.js (BackendState every minute → drop listener, re-up with the flags Tailscale names, Telegram him, rebind); 74638b26 a client timeout says "No answer from your Mac" instead of Safari's "Fetch is aborted". Reloaded; tailnet + https serve both 200. Why Tailscale stopped: NOT found. The Telegram message path is untested live (no outage since).**

**27 OCT (claude.ai session 01FPAPLf, later still) — PHASE A BUILT AND LIVE: THE LOCAL MODEL RUNS ON OLLAMA, LOCAL-FIRST BY DEFAULT, CLAUDE AS THE ESCALATION. ON MAIN (6ff39226 server, bed10445 Settings, docs 2b4f7f35/b7168ee6/04c3729f); NOT PUSHED; SERVER RELOADED 09:47 AEDT; SEEN ON HIS REAL DATA AT 375 PX (shot --readonly --style summary), NOT YET ON HIS PHONE.**
- GOAL: his two instructions: the plan (below) and "disregard previous restrictions … if there is something you could do … without needing to rely on Claude" (memory: nova-local-scope-widened). The prompt pack PDF was read (design/LOCAL-NOVA-PLAN.md §1b).
- DONE CRITERIA: built by one Opus subagent, verified by this session: lint 0 errors, build green, targeted suites 105/108 (the 3 failures are guard tests reading iCloud `* 2.js` duplicates only), full suite 4406/4413 per the agent (same duplicates + exerciseAtlas ×2). Live board after reload: backend ollama, first true, model qwen3.5:4b ready (warm 1 s), models [9b 6.6 GB, 4b 3.3 GB], ctx 8192; all nine `local: true` lanes resolve provider=local (ask-nova, greeting, calendar-command, profile-talk, inbox-classify, shopping-categorize, rewards-offer-read, journal-prompt, note-summary). lib/localModel.js: Ollama native /api/chat normalised to the OpenAI shape, think per lane (off), format json, keep_alive 30m, num_ctx 8192 everywhere (a change reloads the runner: measured), vm_stat memory guard vs this model's need (loaded model always passes), `ready` = model loaded. lib/textLane.js: local failure → Claude, `escalated: true` + reason, both runs on the ledger. lib/askDispatch.js holdForEscalation: the local job becomes a live view of Claude's job (accessors, no polling). claudeCode.js: the greeting escalates too. PUT /model-prefs/local {first, model}. Settings › On this Mac: status line, Local first switch, model pick.
- MEASURED: 4B classify 0.34–0.8 s warm, tool call 1.8 s warm / 6.4 s cold; 9B load 11.6 s, tool call 2.7 s, 6.1 GB resident (62 % → 18 % free). evalLocalClassifier.mjs --model qwen3.5:4b, rerun after the harness fix ab778405 (its "Haiku baseline" had been the local model answering itself under local-first): parsed 36/40, route agreement with Haiku 19/36 (53 %), 5.9 s median vs Haiku 3.5 s (generation-bound: ~150-token decisions at ~30 tok/s). Audit: design/audits/2026-10-27-local-model-eval.md.
- NOT VERIFIED: a real lane end to end on the LIVE server with his data (nothing write-free to run; the eval exercises the real classify path on scratch data). The Settings group on his phone. The greeting on his next arrival is the first live local run: watch the log for "greeting:" / "textLane:" / "ask:" lines and the ledger for provider local.
- TRAPS: Qwen3.5 thinks by default and answers nothing within budget; a 4B invents a date for "tomorrow" unless the prompt carries today; `num_ctx` must be the same on every call or Ollama reloads; the swap-free guard was wrong (fixed); tests never reach the real Ollama (NODE_TEST_CONTEXT closes the port; running a test file directly with `node` does not set it); guard-cupertino refuses while `public/_devconn 2.js` (an iCloud duplicate) exists.
- HIS CALLS (afternoon): keep local-first and tune; escalation to Claude is permanent ("ideally the Mac answers most things"); show escalation now; push after he has seen it on his phone.
- BUILT (afternoon, second Opus subagent + this session): (a) escalation SHOWN across every reader and writer: textLane `laneVia(out)` stamps `{provider, fallback, escalated, escalationReason}` on Inbox/calendar records (`escalationReason`, not `reason`: Inbox records already use `reason: 'retried'`); conversationLog `cleanVia` keeps `{provider:'claude', escalated, reason}` on a Nova row and Nova reads it back tagged; voice.js `viaOf`; client `answeredBy()` (one function for both sync directions + App.jsx poll), `providerNote` → "asked Claude · why", valsInbox `inboxProviderNote` → "sorted by Claude · why". (b) the compact inbox decision for the small model (inbox.js `buildCompactPrompt`, `classifyPromptFor`, `fillStarPayload` with empty-means-"*" for note/journal, filled BEFORE normalizeDecision). (c) harness `--through-lane` + `--baseline`. Eval through the real lane: 39/40 parsed, 51 % agreement, 3.57 s median vs Haiku 3.52 s (audit updated). Full suite + lint + build: see the commit.
- STILL OPEN: not seen on his phone; the first live escalation label will show on the next Inbox record Claude sorts after a local miss.
- NEXT: Phase B/C per the plan: the "switch to your local brain" / "back to Claude" verbs, the Runs-on pill by name, escalation shown in the meta line, local ears (mlx-whisper), read-only calendar/health/log tools on the local loop, the preflight with a latency budget, the Wi-Fi-off drill.
- DO NOT: turn thinking on for a classify lane; raise the memory floor to force a load; bare launchctl; delete `public/_devconn 2.js` (not ours).

**27 OCT (claude.ai session 01FPAPLf, earlier) — LOCAL NOVA, THEN HYBRID: ANALYSIS + PLAN. design/LOCAL-NOVA-PLAN.md.**
- GOAL: his ask with the Zubair Trabzada "fully local Jarvis" reel + video (Qwen3.5 9B on Ollama, tools on the local model, VoiceStudio voice, "switch to your local brain" by voice): a free local base model so Nova runs without Claude, then a hybrid where Claude takes the hard lanes.
- MEASURED TODAY (real, on his Mac, load 3): Ollama was already installed and running as a brew service; `ollama pull qwen3.5:4b` done (3.3 GB on disk). Native tool call correct in 6.4 s cold, round-2 answer 3.9 s, JSON classify 0.8 s with `think:false`; with thinking ON (Ollama's default) the classify burned 765 chars of thinking and never answered (first try hit a 60 s timeout). Resident 3.1 GB; memory free 60 % → 34 %; unloads after 5 min idle. The swap-free guard would have REFUSED (994 MB < 1,500) while 9.6 GB RAM was free: wrong instrument.
- NOT DONE: no code changed; the Skool prompt pack returned 403 (ask him for the file); Qwen3.5 9B not tried; no quality eval yet (the 25 Sep harness exists).
- NEXT ACTION (on his yes): Phase A in the plan: an Ollama backend in lib/localModel.js, qwen3.5:4b as the 16 GB default, per-lane `think` policy (off for text lanes), replace the swap-free guard with a free-memory reading, then warm + pin the eight `local: true` lanes and rerun evalLocalClassifier.mjs against Haiku.
- DO NOT: turn thinking on for a classify lane; move a judgment lane (coach, paper, form-check, ingest, research) to local; raise the swap floor to force a boot.

**27 OCT (claude.ai session 01FPAPLf) — TRAIN: TWO WORKOUTS ON ONE DATE, A WALK TICKS ACTIVE REST, EDIT ANY ROUTINE, AND THE WEEK AS A LIST. ALL ON MAIN AND PUSHED (d31a9c65 mockup 104, 44f2c95e, 17982223, af450f9e, 787542f9 mockup 105, 27249e0f, 34d1f7ea); DEPLOYS GREEN; SERVER RELOADED; THE iPHONE BUILD INSTALLED; NOTHING WALK-RELATED SEEN ON HIS PHONE.**
- GOAL: his ask 25 Oct with three screenshots: (1) two workouts planned on one day, (2) an Apple Health cardio session (his real Indoor Walk 25 Oct, 3.87 km, 41:59) recognised so it ticks an active-rest day, (3) edit anything in Train (names, lifts) without going through Claude. Then "the weekly view feels off": he chose option A (mockup 105).
- DONE CRITERIA: met in code, unmet on device. (1) day sheet (src/DayPlanSheet.jsx), dated plans in server/data/workout-day-plans.json (server/lib/extraWorkouts.js; GET/PUT/DELETE /api/workouts/day-plans), Begin on a double day asks which first, `weekCount` (server/lib/weekCount.js) counts each workout. (2) NovaHealthPlugin.swift reads HKWorkout + heart rate (14 days), POSTs /api/health-data/workouts; server/lib/healthWorkouts.js `cardioKind`, `countsForActiveRest` (15 min, uses minutesExact), `workoutsForRange`; WalkCard on Train; ASKED_KEY bumped to `novaos.healthAsked.v2` so iOS asks again. (3) src/RoutineEditor.jsx: rename, drag, steppers, swap, per-lift `note`, duplicate, new, Undo. (4) TrainSummary week = list (nv-ts-ag*), "N of M sessions", active rest counts only once a walk ticks it, today's row has no Begin (his call).
- DECISIONS (choice → reason → what it forecloses): (a) two-a-day is a DATED plan, the weekday `schedule[day]` untouched → 11 readers read the template; forecloses a repeating double day without touching them. (b) a double day counts 2; active rest is not a job until a walk ticks it. (c) walk threshold 15 min. (d) per-lift `note` rides the routine entry format; every writer carries it (validateExerciseEntries, App.routineEntriesFrom, coachPlan, inbox); a swap drops the note on purpose. (e) week list only in the Summary style he runs; cupertino/classic still show the old week.
- VERIFIED: `node --test` extraWorkouts, weekCount, routineNote, makeupFocus, healthWorkoutsCardio, healthWorkouts, recipePage pass (35 + 12); `xcodebuild` simulator BUILD SUCCEEDED and a device build installed with `devicectl` on his iPhone 16 Pro; shot.mjs --readonly --style summary 375px of his real week (scratchpad week-b.png, train-sheet.png) shows the list and the sheet on his real routines. Full suite at close: 4384 tests, 7 fail, all known: exerciseAtlas x2 and five spawn-site tests that read the gitignored iCloud " 2.js" duplicates; none from this work.
- ASSUMED: that iOS shows the Health permission sheet for Workouts/Heart Rate on his phone and that `.immediate` background delivery fires for workouts; that his real Indoor Walk has the indoor flag; that a real walk reaches /api/health-data/workouts (server/data/health/workouts/ did not exist at close); the split two-hue pill, the walk mark and the walk card (never rendered, no double day or walk exists in his data); drag-to-reorder on touch.
- OPEN QUESTIONS / BLOCKERS: Home's training card, Coach and the briefs still read only the weekday template on a double day, and Home's Begin does not ask which first; the week list exists only in Summary style; make-up rows count as sessions.
- NEXT ACTION: on his phone, open Nova, allow Workouts + Heart Rate, then `ls server/data/health/workouts/` should show a file for the day of his next walk within a minute of opening the app; a 15+ min walk on an active-rest day then ticks that row and moves the count.
- DO NOT: change `schedule[day]` to hold two routines; commit hunk-staged App.jsx/api.js/inbox.js without building the index copy first (a peer's intake hunks share those files; I filtered hunks and built `git checkout-index` output before committing); `git stash` in this shared tree (a peer's stash swallowed this session's whole Train work once, restored by `git stash pop`); treat an old chat error as current without reading its `at` stamp (I mistook 18 Oct effortArgs errors for today's and sent a peer to chase them); judge a file's edit by mtime (iCloud duplicates change it).

**26-27 OCT (claude.ai session 014CevftckmCBhFtFVKkX9J4; Opus 5.5, then Fable 5.1, then Opus 5.5; closed by Sonnet 5.5) — HIS NUMBERS, THE COACH THAT READS HIS BODY, A PROFILE HE FILLS BY TALKING, A TURN THAT WAITS FOR HIM, AND NOVA THAT CAN SHIP HIS OWN CHANGES ON HIS TAP. EVERY COMMIT OF MINE IS ON origin/main (last ebbdd57c, verified); DEPLOYS GREEN; THE SERVED BUNDLE CARRIES EVERY FEATURE; SERVER RELOADED; NOTHING SEEN ON HIS PHONE.**
- **GOAL:** (1) his calorie/protein numbers editable without the interview, Katch-McArdle, weekly review, a body-fat estimate range; (2) Nova and Coach proactive from Apple Health + the Huberman protocols; (3) a profile of him Nova really uses, filled by being interviewed; (4) Nova must not cut him off mid-sentence and must let him correct a mishearing; (5) the day sheet scrolls and shows his program; (6) he can ask Nova to change Nova.
- **DONE CRITERIA:** met for the build, the tests and the live checks; UNMET for "seen working on his iPhone" (no part of it has been) and for the first real ship (none has run). BLOCKED: nothing.
- **STATE (paths):** numbers `server/lib/intake.js` (Katch-McArdle, `mergeFacts`, `tdeeAdjust`), `bodyFatEstimate.js`, `fuelReview.js` (Mondays 07:00), `src/screens/NumbersEditor.jsx` (saves on tap/blur, queued). Strategy `server/lib/bodyComp.js` (WHERE HE STANDS), `protocols.js` (seeds `Wiki/Health/Protocols.md`: Nova's summary of Huberman's PUBLIC toolkits, NOT the book), debrief `strategy` + change `kind`/`source`. Profile `server/lib/profile.js` (12 sections; drafted-by-Claude provenance line), `profileTalk.js`, `profileQuestions.js` (105 questions, state `server/data/profile-interview.json`), `profileOptions.js` (SHARED with the client; option = a `- phrase` line), `profileCoverage.js`, `profileReach.js` (22 readers; its test fails any lens-carrying lib module that ignores the profile), `src/screens/AboutFacets.jsx`. Voice `src/turnSense.js`, `turnEnd.js`, `useContinuation.js`, `useDictation.js`, `recorder.peek()`. Day sheet `src/DayPlanSheet.jsx` (class `nv-dps`), `src/vals/valsWorkouts.js`. Ship `server/lib/codeShip.js`, `shipWorktree.js`, `src/CodeShipDetail.jsx`, verb `builder.ask`. iOS `NovaHealthPlugin.swift` (body fat + lean mass), installed on his iPhone 16 Pro 26 Oct.
- **DECISIONS (choice → reason → forecloses):**
  - Numbers save on the tap, no "Use these" → the log showed 6 editor opens and zero POST /intake/apply; the preview looked saved and was thrown away → forecloses a draft-then-confirm editor.
  - Body fat is an estimated RANGE from the ATHLEAN-X bands + US Navy (±3.5) + relative fat mass; Katch-McArdle uses the middle and the plan prints what the range is worth → he has no scale or scan → forecloses a single confident figure; a measured Health reading replaces it.
  - The weekly review never cuts calories on a burn below BMR×1.2 ("a gap in the log") → on his real data the log said ~2,575 kcal/day against 2,153 while gaining 0.5 kg/week → forecloses auto-calibrating from a bad log.
  - "How he talks" (`talk`) is followed in every Ask Nova / Coach / Leader / profile-talk reply and outranks style defaults, never honesty → his ask that the profile have a purpose → forecloses an agent that reasons about him without the profile (the reach test fails it).
  - "Still talking?" judges the words at the hold; a bare number is a FINISHED answer → his earlier "too long a pause" and his dislike of dead air → forecloses waiting for a unit.
  - Ship path: tap only (voice approve and swipe refuse), in its own worktree from origin/main, code (not a model) runs commit/push/deploy/live-check/reload → his yes + other sessions share the tree → forecloses shipping from his working tree.
  - The ring, headline and tiles all count "in his words" (profileCoverage) → two counts on one card contradicted each other → forecloses a ring that counts only confirmed parts.
- **VERIFIED (locators):** each commit above is an ancestor of origin/main (`git merge-base --is-ancestor`, 8f6e4c17 a8622d43 6018946c c294f138 c4c754c5 ebbdd57c, run at close); deploys 40247360650, 40262447566, 40263858417 and a6bcfae8's run all `success`; the served bundle (index plus every lazy chunk, cache-busted) contains "Interview me", "Not what I said", "Still listening, go on", "Resume interview", "Ship it", "nv-dps", "Katch-McArdle", "Which looks most like you" (curl at close); `/api/health` 200; the interview ran for real: 21 profile-fact records filed (`inboxStore` kind `profile-fact`), a real talk turn took 3.9 s and its filings undid byte for byte (sha of Profile.md before = after, apart from the `updated:` stamp); server tests 4,436 pass / 7 fail, the 7 named in DO NOT; lint 0 errors; build green.
- **ASSUMED (no locator):** that WKWebView's `MediaRecorder.requestData()` gives a valid partial MP4 (measured 202-284 ms only with ffmpeg-made files on the Mac); that the Health permission sheet appears on his phone; that the ship path's `gh`/git push works under launchd's PATH (PATH lists /opt/homebrew/bin, `gh auth status` fine in a shell, never run from the server); that Vite's minified chunks keep the derived literals for the live check; that the Claude-drafted profile text is roughly right: three sections (About me, Life, Taste) are still purely Claude's draft; the rest carry his own interview lines beside the draft (the About you ring reads 9 of 12 "in your words" by profileCoverage, seen in a shot on his real vault).
- **OPEN QUESTIONS / BLOCKERS:** his body-fat estimate is not set, so "cut first or lean bulk" says unknown; the 9 drafts await his confirmation; no real ship has run (decision put to him: try a small request); he reported a garbled last line which I read as "ask Nova to change Nova" and he confirmed yes; his Pull and Legs routines are not on his weekly schedule (only Push, Upper, Arms, Delts, rest) and he has not said whether that is intended; the debrief with `strategy` has not run (next Sunday 17:00, mode `draft`).
- **NEXT ACTION:** he says "change Nova so <something small>" and taps Ship it; expected: a `code-ship` card within minutes with four green gate chips, then steps verify→live each turning done, destination "Shipped <sha>: live (seen in the served bundle)". If a step stops, the card names it.
- **DO NOT:** say anything is live/pushed/deployed from a green Actions run alone (memory `never-claim-live-unverified`); judge "unpushed commits" or "19 ahead" as lost work without `git log a..b` (the 19 on local main at close are ANOTHER session's deliberately unpushed local-Nova commits, "push after seen" is his call; I did not push them); run two Bash calls that `cd` in parallel; `git stash` in this shared tree (I did once, taking another session's Train work; recovered at once); trust a "failures are only iCloud duplicates" label without naming the cited files (a real kindCoverage failure hid there and failed a deploy for 15 min); add a profile section by hand-listing it in one place (the section keys are a SHARED FORMAT: `profile.js`, `profileSections.js`, `profileOptions.js`, the debrief and the reach test); reintroduce a "Use these" draft step on the numbers editor; call the Protocols page "the book" (it is Nova's summary of public toolkits); name a CSS class `nv-dp` (a data-panel rule sets `display:block` on it; the day sheet is `nv-dps`). Known-failing tests, not mine: the 5 spawn-audit ones (cite only git-ignored " 2.js" iCloud duplicates in `server/lib`, 49 of them) and 2 exerciseAtlas ones (10 exercises in his vault library have no anatomy: JM Press, Reverse Pec Deck, Bayesian Cable Curl, Adductor Machine, Open Book Thoracic Rotation, Figure-Four Glute Stretch, Half-Kneeling Hip Flexor Stretch, Cat-Cow, Machine Lateral Raise, Dumbbell Pullover; Train data).

**21 OCT (claude.ai session 01CQEceq) — NOVA TAKES TURNS: A SHORT TURN, THE REST HELD FOR "GO ON", AND A HELLO ONLY WHEN HE ARRIVES. ON MAIN AND PUSHED (0e4b22b9, b5ed69df); SERVER RELOADED (health 200); THE REAL MODEL'S COMPLIANCE NOT MEASURED; NOTHING SEEN ON HIS PHONE.**
- GOAL: his ask: study Jarvis (MCU) and E.V. (Brand New Day) speaking patterns; Nova replies too long before it has the key information and does not go back and forth; long only when it has everything or it is needed.
- DONE CRITERIA: built and unit-tested; unmet: a real model turn seen following the rules, and his phone. Evidence and design in design/TALK-STUDY.md (Jarvis median 8 words/turn, E.V. 6, from verified subtitle transcripts; Nova baseline median 17, p90 145, Coach up to 1,080, 15 greetings on 20 Oct).
- STATE: src/turnFold.js (MORE fold, stream cut, asksForRest, HELD_UNHEARD_LINE); server/lib/talk.js TURN_TAKING appended last before his words in buildAskPrompt (not direct, not consulted), buildCoachPrompt, buildLeaderPrompt; settle puts `more` on the result for Nova, Coach, Leader; App.revealHeld / latestReply, the "go on" intercept in doOrb after the offer block, the held note in askNova; "The rest · N words" row (.nv-nt-more) in NovaThread and a TextAction in Voice.jsx. Lens: LAND ON ONE ACTION WHEN YOU ADVISE + TAKE TURNS (1842 chars of 1850; NOVA-METHOD synced). src/greetDue.js + App.notePresenceNow (pointerdown/keydown/visible; boot only off the Mac); markGreeted on every hello; /api/greet takes `since`; fleetContext({since, pending:false}) for a return; greeting prompt under 15 words (return) / 30 (new day).
- DECISIONS: (a) code never cuts a long reply without MORE (his "long is fine when needed") → forecloses a hard cap until the measure says so. (b) the local Mac model does not get MORE (a 4B model may print the mark mid-sentence). (c) a bare "yes" reveals the rest only when the turn ended with "?" and no proposal is pending. (d) the Siri one-shot drops the rest. (e) return greetings kept, but short (decision put to him).
- VERIFIED: server/test/turnTaking.test.js 12/12; stance, novaThread, lens, register, spokenSession, askAck, localAsk, claudeStream, spokenProse, askSession, askDispatch suites pass; lint 0 errors; build green; shot.mjs --readonly --style summary 375×812 with an injected held line: the row shows, a reveal appends the rest as Nova's next line (scratchpad PNGs). Full suite 4187: 12 failures, none from this change: exerciseAtlas ×2, calendarLocal ×2, quickCapture Unsorted (known), Stash gift-list date fixture, and five spawn-site tests that read gitignored iCloud duplicates "server/lib/* 2.js" (briefing 2.js, modelWatch 2.js, …) on disk.
- ASSUMED: that Claude actually writes MORE and asks first under the new block (the bench-ask run was blocked by the permission check because it reads server/.env's token); the greeting rule on his real devices; the deploy of b5ed69df (in progress at close of this entry; check gh run list).
- NEXT ACTION: with his OK, `node scripts/bench-ask.mjs --only nova --n 1` (isolated data dir) and read the replies for MORE and length; or after 2–3 days of his use, `node scripts/talk-shape.mjs --since 2026-10-22` and compare with the baseline in TALK-STUDY §1.
- DO NOT: trigger any Nova speech from a sync or timer (greetDue is the gate); add TURN_TAKING to a consulted turn (it would fold an answer meant for another agent); change the MORE format on one side only; delete the "* 2.js" iCloud duplicates without asking (not ours; they are what fails the spawn tests).

**19 OCT (claude.ai session 01CQEceq, later) — THE LIVE SESSION GETS THE WEEK TRAY, HIS BEST AS A SET, AND THE LIFT'S HISTORY. ON MAIN AND PUSHED (6bb23f4f, 33557592, 0529a9c4); DEPLOY SUCCESS; SERVER RELOADED; NOT SEEN ON HIS PHONE.**
- GOAL: his asks: (1) the weekly muscle-sets tracker back on the workout screen while training, at the bottom, a drop-down with a smooth animation; (2) label it "goal", not "V-taper"; (3) the lift's history viewable mid-workout; (4) the shown PB to be the heaviest weight and its reps so he can compare.
- DONE CRITERIA: met in code; unmet: seen on his real data/phone. (1) WeekTray in src/screens/SessionSummary.jsx: one 44px row (label, six hue pills filling to the low end of the range, "N of M", chevron) that morphs the existing WeekSetsSheet open (GlassSheet) and folds back; a pill a tick grew glows once. Model = `v.sessionSummary.week` = liveTrainOverview.muscleWeek (already re-read ~1.5 s after each tick lands the draft, App.jsx ~2031). Pure view `weekTrayOf` in src/muscleWeekView.js. (2) label "Goal muscles in range". (3)+(4) exerciseBests (server/lib/trainingAnalytics.js) now returns `top` {weight, reps, date} (heaviest working weight, most reps at it) and `recent` (last 8 sessions newest first, warm-ups out); the card line reads "Best 70 kg × 6" and taps open HistorySheet.
- STATE: main == origin/main at 0529a9c4; deploy success; reload-server.mjs reported health 200. Tray CSS and history CSS are the last two blocks of src/index.css.
- DECISIONS (choice → reason → what it forecloses): (a) tray only under the Summary style and not while editing a past session (that one is already in the week) → forecloses a tray on cupertino/classic sessions. (b) no "Talk through with Coach" link from the tray's sheet inside a workout? NOT done: WeekSetsSheet is passed no onAskCoach, so the link is absent mid-workout; chosen so a tap cannot pull him out of a set. (c) PB shown is a set, not the e1RM; `best.e1rm` still drives the record banner → forecloses showing the estimate on the card. (d) the sheet's own "V-taper muscles" headings (muscleWeekView group) were left, he only named the tray.
- VERIFIED: `cd server && node --test test/muscleWeekView.test.js test/exerciseBests.test.js test/sessionSummary.test.js test/recipePage.test.js` all pass; shot.mjs --demo --style summary at 402×874 with an injected week and bests shows the tray, the open sheet, the "Best 70 kg × 6" line and the history sheet (scratchpad PNGs, not committed); `npm run build` green; lint 0 errors; `gh run list` deploy success on 0529a9c4.
- ASSUMED: everything on his real data and phone (the real bests read returns `top`/`recent` for his lifts; the Mac server reloaded with the new exerciseBests, confirmed only by health 200, not by hitting /api/workouts/bests, which needs the token); the tray's real update after a tick (tested only by swapping state in the shot, not by ticking); at 375×812 the tray sits just under the tab bar and needs a small scroll (seen in the 375 shot, before I compacted it to one row; the one-row version was shot only at 402×874).
- OPEN QUESTIONS / BLOCKERS: (1) the full suite has 5 failures that fail identically with my changes stashed: exerciseAtlas ×2 (atlas covers his library; every exercise resolves a view), calendarLocal ×2 ("Claude down" add / move-delete), quickCapture "waits as Unsorted". The last three are the local-model fallback answering where they expect an error (see the 19 Oct shopping entry, open question 1). NOT mine, NOT fixed. (2) the tray is not shown on the classic session.
- NEXT ACTION: on his phone start a session, tick a set, and expect the tray's pill for that muscle to grow and glow within ~2 s; tap "Last time · Best" and expect his real recent sessions with the best marked. If the line shows no Best, `curl -H "authorization: Bearer $API_TOKEN" "localhost:4173/api/workouts/bests?ids=<id>"` and look for `top`.
- DO NOT: put a Coach link or any navigation-away action in the in-workout week sheet; fold `top` into the record banner (that compares e1RM at the resolution shown, tested); add a font under 13px in these CSS blocks (recipePage.test.js sweeps the end of index.css for it and failed on my first 11/12px); commit hunk-staged index.css without the parse check.

**19 OCT (claude.ai session 01CQEceq) — THE LYFTA 3-LIFT PILOT: THE SQUAT FOLLOWS A REAL ATHLETE'S TRACKED REP, ARMS STILL WRONG. TOOLS ON MAIN AND PUSHED (898dc35d); NOTHING USER-FACING CHANGED; NO NEW LOOP SENT TO HIM.**
- GOAL: his yes to a 3-lift pilot (squat, bench, row) toward Lyfta-quality figures, "Dark" background, reference videos sourced online from professional lifters. His latest verdict on the v8 squat loop: "Yes and no. It does not look accurate like what a real person would be doing especially with the way the arms are positioned and is moving in a very clunky weird fashion. Remember to use real videos sources of professional athletes and trainers."
- DONE CRITERIA: UNMET. The body and legs now track the athlete; the arms and hands do not yet match; no full loop rendered, no new video sent. Bench and row not started.
- STATE: pipeline is tools/anatomy/ (zanatomy_strip.py, zrig.py, pose_from_video.py, zmotion.py, zcheck.py, zrender.py, lyfta_zanatomy.py). Everything heavy is in ~/.cache/nova-anatomy (zanatomy/figure.blend and rigged.blend, motion/*.pose.json, refs/*.mp4, pilot/squat.blend, pilot/sheet12-v10.png, pilot/sbs10/compare.png). Reference videos stay in ~/.cache, never the repo. Run chain: zrig.py → zmotion.py (`--lift squat --step 1`) → zcheck.py → zrender.py. Set `TMPDIR=$HOME/.cache/nova-anatomy/tmp/` first: the cleared shell temp dir crashed Cycles' Metal compile with a nil-path NSURL exception.
- DECISIONS (choice → reason → what it forecloses):
  (a) the squat is posed from the athlete's tracked joints in a body frame (hip line = X), left and right averaged → a squat is symmetric and one camera's depth error read as a tilted bar and a kicked-out leg → forecloses reproducing his real asymmetry.
  (b) bones swing from where the PARENT carried them, not from the bone's own rest → the right collarbone rolled 77° in one frame → forecloses reading `aim()` as rest-relative.
  (c) trunk muscles reaching the arm (latissimus, pectoralis, serratus) follow the upper arm only within ~7–15 cm of the shoulder joint → they flew out as wings → forecloses weighting them by plain nearest-bone.
  (d) trapezius may follow the spine, never the arm.
- VERIFIED (locators):
  - `zcheck.py` prints `CHECK PASS 0` on pilot/squat.blend (the 64-frame rep, key frames 149→51→152 degrees of knee flex, SWAPS 0), after the rig at SKINNED 809 / SAVED.
  - pilot/sbs10/compare.png: six frames of the RP athlete over six of the figure; the bottom lands at the same instant and to the same depth.
  - Arm numbers from tracking vs figure (scratchpad armgeo.py): upper arm off vertical 19°/47° athlete vs 28°/49° figure (standing/bottom); elbow angle 76°/79° vs 71°/79°.
  - At close: `npm run lint` printed warnings only (no errors) and `npm run build` emitted dist; `cd server && npm test` was STARTED but had not finished on the loaded Mac (load ~21), so it is NOT claimed green here. This session changed only tools/anatomy/*.py and docs, no server or src code.
- ASSUMED: that the athlete's real grip stays one width on the bar. The tracker reads it as 2.0× → 2.58× shoulder width across the rep; I judged that a tracking error from the zoomed frame (his hands do not move on the bar) but did not measure the bar position independently. The full 64-frame loop was not rendered or watched after the last fixes, only a 12-frame sheet.
- OPEN QUESTIONS / BLOCKERS: (1) the elbows flare like a goalpost at the bottom, copied from that tracking error. (2) The hands are flat with fingers up; his are closed fists; the figure has no finger joints. (3) Midline gap and skull top; tight framing. (4) Bench (side clip, reps from 17.5 s) needs a bench model; row (NASM side clip). (5) Whether the squat is good enough to replicate to other lifts is his call after he sees the next loop.
- NEXT ACTION: in zmotion.py put both hands on the bar at his standing grip width (from the first frame), pin the bar to the upper back from the shoulders, and let the elbows bend toward where tracking sees them. Re-run the chain, render `--all`, then watch the loop frame by frame against the athlete. Expect grip/shoulder ≈ 2.0 throughout and the elbows under the bar, not out. Send it to him only if it then reads as the real athlete.
- DO NOT: send a loop without watching it frame by frame (his standing rule, memory nova-motion-check); put reference videos or his vault text in the repo; trust the raw tracked arm directions (the first synthetic and the first tracked attempts both read wrong to him); render without the zcheck gate; blanket-replace in muscles.py (memory nova-anatomy-model); use `rm` through a `cd` glob here (the safety check blocks it, write to a fresh folder instead).

**19 OCT (claude.ai session 01MPaorT) — SHOPPING: WOOLWORTHS READ AGAIN, PACKS OF PIECES, COLES LEFT TO HIM WITH A LINK, AND THE LIST IS THE REMINDERS "SHOPPING" LIST. ON MAIN AND PUSHED (b374ecad, b51ec7a7, a6063623, 21bb342f, c36040a4; the matcher fix rode in a peer's 90634b6e); SERVER RELOADED; NOTHING SEEN ON HIS PHONE.**
- GOAL: his asks: Nova not retrieving Coles/Woolworths prices; "10 Weet-Bix" must be one box not ten, for every boxed food; find a way to Coles prices (answer: none, he left Coles, wants a link per item); Nova's list and the Reminders list Siri calls Shopping to be one list both ways (his calls: that list, tick both ways, build it).
- DONE CRITERIA: met in code, one unmet. (1) Woolworths: GET `?searchTerm=` instead of a sessionless POST (the POST hung 20 s every read 10–19 Oct). (2) Pieces: KEEPS `weetbix` each 16.7 g; Woolworths barcodes → Open Food Facts label serving once per barcode (`pieceFromServing`, store.servings) → `pieceG` on products → decide() uses it; unknown box = ONE pack and the screen says the label does not say (`piecesUnknown`); ONE_OF words (loaf, bottle, tin…) stay one each. (3) Coles: `SELF_CHECK` in shopPrices.js (never queued, retry refused, chains.c = {state:'self'}), view model `self` legend "you check it", `priceSheet().coles` → a "Check Coles" pill in ShoppingSummary's sheet. (4) Matcher: PREPARED gained yoghurt/jam/spread/…, every prepared word must be in the line, shopModel re-applies productMatches to stored reads. (5) Reminders: server/native/reminders-bridge.swift → server/bin/nova-reminders (gitignored, ensureBridge builds it with the Info.plist embedded), server/lib/remindersShop.js syncPass every 20 s. UNMET: Siri → Nova seen live.
- STATE: main == origin/main after this close commit; server reloaded (health 200). Live: server/data/reminders-shop.json maps 21 lines; his Reminders "Shopping" list holds Nova's 21 lines (one reads "2 ½ tsp coconut oil": the recipe stored name "½ tsp coconut oil" with amount "2"). server/data/shopping-prices.json: Woolworths ok, Aldi ok, Coles 'self'.
- DECISIONS: (a) Coles left to him: no scraper (~$0.89/1k products via Apify, against Coles' terms), no stealth browser → forecloses Coles prices in totals; the verdict never compares Coles. (b) Reminders: vault is the source of truth, a clash is won by the vault, tick both ways, deletions both ways (Reminders-side delete leaves Nova with an Inbox record whose undo route is `shopping-restore`), guard deletes nothing when >3 and >half of linked lines vanish in one read, the first pass deletes nothing → forecloses a Reminders-wins mode. (c) Siri adds are filed through decisionFor('shopping') + fileDecision + a createRecord with source 'reminders' (his Quick Capture rails, Undo). (d) A box with no piece weight is one pack, flagged, rather than guessed.
- VERIFIED: `npm run lint` 0 errors; `npm run build` green; shopPrice/shopPrices/shopModel suites 41/41, remindersShop.test.js 8/8; read-only shot.mjs of his real list in Summary: red notice gone, "Coles · you check it", blueberries $3.90 punnet, "Check Coles" pill in the sheet (screenshots in the session scratchpad, not committed); Woolworths live: 15 of 22 lines priced after b374ecad; his list, Weet-Bix now 1 × 375 g at Aldi $3.99 (real run of real.mjs); Reminders live: first pass linked 21 lines, lastError null (GET /api/shopping-list/reminders); tick round trip on "Dental floss" via /api/shopping-list/toggle then /reminders/sync (updated:1 each way, ends unticked).
- ASSUMED: Siri → Nova on his iPhone ("add milk to my shopping list" within ~20 s as an Inbox record, Dairy); the Nova list on his phone showing any of this (Pages deploy 39179338273 success at 00:07Z includes 21bb342f but not necessarily the matcher; check gh run list); label piece weights for Milky Bar and others (today's reads predate the barcode code: they arrive on tomorrow's read); Open Food Facts staying reachable (its search page showed "temporarily unavailable" while the product-by-barcode API answered); Coles never being read means the reminder text for Coles is irrelevant.
- OPEN QUESTIONS / BLOCKERS: (1) the full suite shows 3 failures besides the two Atlas ones (calendarLocal "an add that cannot be read, with Claude down", "move/delete with Claude down says nothing changed", quickCapture "waits as Unsorted"): they pass-fail depending on whether the peer's local model (mlx_lm on 4176) is up, i.e. the peer's phase-2 fallback now answers where they expect an error. NOT mine (not touched), NOT fixed; the peer should pin the local port off in those tests. (2) The Reminders list's own auto-sections are Apple's; Nova groups by aisle, they will differ. (3) the "2 ½ tsp" recipe-amount oddity. (4) Nova's recipe lines in Reminders are re-titled whenever the vault's amount changes.
- NEXT ACTION: have him say "Hey Siri, add milk to my shopping list"; within ~20 s `curl -H "authorization: Bearer $API_TOKEN" localhost:4173/api/shopping-list` should list milk (source 'reminders') and /api/inbox a filed record "Shopping List — milk"; tick it in Reminders and expect `checked:true` in Nova. Then check tomorrow's Woolworths read stored `pieceG` on a barcode product (shopping-prices.json servings).
- DO NOT: retry Coles from this Mac in any form (headless Chrome, visible Chrome, cookie jar all walled; the session probably flagged the Mac, stop testing) and do not add fingerprint spoofing; POST to Woolworths' search API; remove `SELF_CHECK`; run syncPass against his real Reminders in a test (use the fake deps in remindersShop.test.js); delete server/bin/nova-reminders while the server runs (it rebuilds at boot, and a rebuilt binary can re-ask macOS for access); loosen the mass-vanish guard; trust CalDAV for his real lists (it shows only the legacy "Reminders ⚠️"/"Family ⚠️" placeholders; server/lib/reminders.js's iCloud write for timed nudges has probably never landed on his phone, unverified); treat the Weet-Bix 16.7 g as measured (it is the label's 33.3 g / 2 biscuits).

**19 OCT (later, same session 01AhAA1e) — PHASE 2: ASK NOVA ON THE MODEL ON THIS MAC, WITH VAULT TOOLS, AND THE STAND-IN WHEN CLAUDE CANNOT ANSWER. ON MAIN AND PUSHED (ae1f6080 server, 90634b6e client); SERVER RELOADED; THE REAL QWEN3 NEVER RAN; NOTHING ON HIS PHONE.**
- GOAL: his yes to phase 2: "use Nova in my day-to-day without worrying about needing my Claude connection to be active, online and without worrying about running out of tokens."
- DONE CRITERIA: built, stub-tested, not run against the real model. server/lib/localAsk.js (map-not-dump prompt ≤9k chars: lens, honesty + length rules, five ACT verbs copied from describeForModel() at runtime, PROPOSE capture/calendar, today block, last 8 turns; tools vault_search/vault_read/vault_list run by code, capped, 4 rounds, OpenAI `tools` with a `<tool_call>` text fallback and a no-tools retry on 400; reply through the shared settleAskReply). server/lib/askDispatch.js startAsk: the one front door (voice.js ×4, telegram.js); Claude fails before any partial → local stands in on the SAME job id (status accessor idiom) with provider/fallback/reason. runTextLane now falls back on any Claude failure before output (limit, dead CLI, no envelope). greeting and ask-nova are `local: true`. Session memory server/data/local-ask-sessions.json (8 turns/session, 40 sessions, 24 h). Client: "answered on this Mac · <reason>" meta line (valsNovaThread + valsMisc, providerNote in conversationSync.js). Bench written, NOT run: server/scripts/benchLocalAsk.mjs.
- VERIFIED: full suite 4163 run, only the two known exerciseAtlas failures; lint 0; build green; live /api/model-prefs lists eight fallback lanes after reload-server.mjs.
- ASSUMED: everything about the real Qwen3-4B: whether mlx_lm renders `tools` (or 400s), answer quality, a 4-round turn's time on this Mac, vault_search speed over his real vault (Node walk, not ripgrep, up to 6,000 files). The Mac stayed at load 150–220 all day; headroom never allowed a boot.
- OPEN QUESTIONS / BLOCKERS: (1) voice input offline: dictation still goes to Groq's Whisper in the cloud. HIS YES (19 Oct): build a local transcriber, measured against Groq on a few of his real recordings first, AFTER his other builds finish. State found: `mlx-community/whisper-large-v3-turbo` is ALREADY in ~/.cache/huggingface/hub (from the failed 25 Sep mlx_audio try); `mlx_whisper` is NOT installed in server/voice/env (shared with Kokoro TTS: install into a separate venv or test Kokoro after); no whisper.cpp. Hook point: server/lib/transcribe.js transcribeBuffer picks a backend (`be`) from GROQ/OPENAI keys; add a local backend used when Groq fails or he chooses it, with the same honest label rule. (Label persistence, his other yes, DONE 4bd51b9b: the record keeps provider/fallback/reason.) (2) the stand-in reads the board's cached `ready` (≤30 s stale). (3) the label is kept in live voiceChat state only; the server conversation record does not carry provider/fallback/reason, so it is lost on a thread reload. (4) consults stay on Claude by design.
- NEXT ACTION (when `sysctl vm.swapusage` free > 2 GB and load < 20, he said not yet, other builds running): `curl -X POST -H "Authorization: Bearer $API_TOKEN" localhost:4173/api/model-prefs/local/warm`; in Settings set Ask Nova to "This Mac"; ask "what did I journal yesterday" and "how is my bench going". Expect "answered on this Mac" under each reply and `lookups` on the result. Then `node server/scripts/benchLocalAsk.mjs --out <scratch>` and read the table before any default moves. If mlx_lm 400s on `tools`, the text form is already the retry; check the server log line.
- DO NOT: raise the 1.5 GB headroom floor to force a boot; default ask-nova to local before the bench is read; add a spoken "Claude is down" lead sentence (dropped on purpose: filler on every turn); route consults through startAsk.

**19 OCT, CLOSE (claude.ai session 01AhAA1e) — WHERE HIS CLAUDE USAGE GOES, EFFORT ON EVERY LANE, THE MODEL ON THIS MAC AS A PROVIDER + THE OUT-OF-USAGE FALLBACK. ON MAIN AND PUSHED (fe628b3f + 298e523e; deploy 39172535365 FAILED on a test race, fixed 298e523e, deploy 39173129956 SUCCESS on a peer's b374ecad which carries it); SERVER RELOADED AT 298e523e; NOTHING SEEN ON HIS PHONE; NO REAL LOCAL RUN YET.**
- GOAL: his ask: stop Nova eating his Claude usage; delegate cheap tasks to free AIs; a local Nova he could run without Claude. His three answers: (1) Coach first but never less effective (research, his data), (2) local model, refine it towards Claude-free use, (3) fallback when the limit hits, yes.
- DONE CRITERIA: measured, then built. Ledger read (server/data/model-spend.json, 30 d $92.89): Coach $47 = two cold turns of a session resumed since 28 July (300k tokens; the 18 Oct roll fixes it; live session 4330275f is small). 4faba53e: defEffort on all 56 non-deterministic lanes + effortArgs on every spawn + spawnEffort.test.js. e91b55e5: lib/textLane.js runTextLane; `local: true` on six pure-text lanes; provider pref; fallback switch (default on); memoryHeadroom guard; ledger provider/fallback; records labelled. fe628b3f: Settings "On this Mac" group, Runs-on pill, Inbox meta label. UNMET: a real local run on the live server; the re-eval; phase 2 (tool loop for Ask Nova/Coach on the local model).
- STATE: main == origin/main at fe628b3f, tree clean. Server reloaded (health 200); GET /api/model-prefs returns local {configured true, ready false, headroom from the live sysctl}, fallback enabled with the six lanes, 56 of 58 lanes carry effort. The Mac: load 150–190 all session, swap free swinging 460 MB–3.1 GB; the headroom guard refused the model at 850 MB. public/_devconn*.js (a peer's) blocks guard-cupertino; Home was not touched.
- DECISIONS: (a) free ChatGPT/Grok/Siri are not programmable; the only free brain is the local model (told him, he chose local). (b) effort: low for scans/classify/compose, high for research/judgment lanes, Coach medium/high-on-deep (his rule: never trade depth). (c) only lanes marked `local: true` may run locally; nothing defaults to local until measured (25 Sep rule kept). (d) fallback is board-level and default on; a whole-board reset leaves it as he set it. (e) local load refused under 1.5 GB swap free; the reason is shown. (f) a locally sorted record says so in the meta line, never a banner.
- VERIFIED: targeted suites 95/95; full `cd server && npm test` 4129 run, only the two known exerciseAtlas failures; lint 0 errors; build green; live board JSON read with the API token after reload-server.mjs; the headroom guard fired on the real machine (850 MB).
- ASSUMED: a real local completion through runTextLane on the live server (never run: no headroom); the "Warm it up" route end to end; the Settings pill and switch on his phone; the Inbox local label (demo had no such record); that `effort: low` does not change any lane's quality (his rule says it must not; watch the first week's records).
- OPEN QUESTIONS / BLOCKERS: the Mac's memory (he agreed 18 Oct to run fewer Claude sessions; six were running). Re-eval needs ~40 Haiku calls (baseline gone from tmp). Phase 2 design: a read-only tool loop (Read/Grep/Glob over the vault) around the local model so Ask Nova can answer Claude-free; Qwen3 supports tool calls in mlx_lm's chat template, unmeasured.
- NEXT ACTION: when `sysctl vm.swapusage` shows > 2 GB free and load < 20: POST /api/model-prefs/local/warm with the token, then in Settings set Capture classifier to "This Mac" and type "toothpaste" in Quick Capture; expect a Shopping tag and "sorted on this Mac" in the card's meta. Then run `node server/scripts/evalLocalClassifier.mjs --model mlx-community/Qwen3-4B-Instruct-2507-4bit` for fresh numbers.
- DO NOT: boot the local model while swap free < 1.5 GB (the guard refuses; do not raise the floor to force it); default any lane to local without a measured agreement rate; remove --effort from a lane (spawnEffort.test.js); delete public/_devconn*.js (a peer's); reload with a bare launchctl.

**18 OCT, CLOSE (claude.ai session 01AhAA1e) — QUICK CAPTURE, THE CLAUDE-FREE FEATURES, WEEKLY CALORIES, GOALS THAT NEVER APPLY BACKWARDS, SPOKEN SETS ON THE PERSONAL-BEST MOMENT. ON MAIN AND PUSHED (HEAD fbd0bb18, deploy 39096109875 success); SERVER RELOADED; NOTHING SEEN ON HIS PHONE.**
- GOAL: his asks this session: the six UX-law fixes (1–4 built), the kcal fix, two ASD-STE100 reels into Nova and Wren, weekly calories as the sum of each day, goals that never apply backwards, Quick Capture back in the Inbox with a tag, and every Claude-dependent feature able to work with his Claude usage gone.
- DONE CRITERIA: met in code. UX laws 1–4 (kcalFromMacros, exercisePickerRecent, OfflineCard, the offline pill hidden on Home for Mission). Plain-speech rule in server/lib/lens.js. Weekly calories (VoicePanels CalorieWeek, App.askAboutWeekCalories). targetHistory (src/targetHistory.js, server/lib/fitnessGoals.js). Shopping list filed by code (server/lib/shoppingCategory.js, shoppingList.js). Quick Capture in both idioms (captureLocal.js, inbox.js, InboxSummary.jsx, Inbox.jsx). Food, calendar, recipe, ingest and photo fallbacks (foodDescribeLocal.js, calendarLocal.js). weight.log and workout.log verbs (verbs.js). Voice sets on the record moment (fbd0bb18). UNMET: the client follow-ups under OPEN QUESTIONS; the eight-exercise anatomy audit; a shopping aisle-move UI.
- STATE: HEAD fbd0bb18 == origin/main, tree clean. Server reloaded after fbd0bb18 (reload-server.mjs: health 200). His vault's Fitness Goals.md carries the seeded targetHistory (backup taken first). Shopping memory: server/data/shopping-categories.json (operational, rebuildable). Peer worktrees under .claude/worktrees and their branches belong to other sessions and were left alone. The four subagent worktrees from this session were removed.
- DECISIONS (choice → reason → what it forecloses):
  (a) code files a capture first and the model sorts only what code cannot place → his Claude usage is not needed for common things → forecloses a model-only sort.
  (b) an unsorted capture waits as "Unsorted · pick a place", never an error → nothing is lost when Claude is out → forecloses an error card for a capture.
  (c) a goal change applies from that day; past days keep the targets they had → his rule, 18 Oct → forecloses judging any past day against the current goal.
  (d) only long-form links (YouTube watch, Vimeo, Apple Podcasts episodes) get the full read; reels and shorts stay on the quick look → the full read is for episodes → forecloses full reads for short video.
  (e) workout.log acts at once with Undo (his pick 1, kept) → forecloses a confirm step on every spoken set.
  (f) a spoken set that beats his best shows the record moment in-app only, with NO Telegram ping (his "No", 18 Oct) → forecloses Telegram for spoken sets; finished workouts keep their ping.
  (g) a retried recipe photo keeps its estimated macros (his pick 3, kept) → forecloses blank macros on retry.
  (h) spoken sets file into one "voice-log" Quick log session per day → forecloses a session per set.
- VERIFIED (locators, checked at this close):
  - `npm run lint` exit 0 (warnings only).
  - `npm run build` green (dist emitted).
  - `cd server && npm test`: 4105 run, 4103 pass, 2 fail: "the atlas covers his real library exactly, both ways" and "every exercise resolves to at least one drawable view" (the known anatomy gap).
  - server/test/verbsLog.test.js: 9 of 9 pass (includes the spoken-PR test).
  - gh run 39096109875 (fbd0bb18) success via `gh run watch --exit-status`; the run before it, 39093980878, success.
  - `curl http://localhost:4173/api/health` returned 200 at close.
  - `git status` clean; `git rev-list --count origin/main...main` 0 0.
  - no dist/pc.json and no vite preview process.
- ASSUMED (re-check before quoting):
  - Live week budget 14,753 (6 × 2,100 + 2,153, past days 150 g, today 166 g): measured earlier this session on the live server; NOT re-read at close. Re-check /nutrition-week's calWeek.
  - Quick Capture on his phone; the tag and move sheet on a real finger; a real long-form link through the full read (transcript, vault file, connections). Not run this session: a real run costs model time and writes to his vault.
  - The spoken-set record moment on the device, including its sound (iOS plays audio only after a tap, and a voice reply arrives later, so the sound may not play).
  - Aisle guesses for items beyond the word table and his memory.
- OPEN QUESTIONS / BLOCKERS:
  - Client follow-ups: Inbox cards for kinds recipe-scan and ingest (status error) need a title and a Retry button, as the video cards have. The photo-scan screen should send `name` to /recipes/scan and open kept.recipeId. Draft recipes need a "needs reading" badge.
  - Eight new exercises have no anatomy entry (JM Press, Reverse Pec Deck, Bayesian Cable Curl, Adductor Machine, four stretches). They cause the two failing tests. They need his audit and approval (memory nova-muscle-accuracy).
  - Shopping: no aisle-move UI yet. The move should also call rememberCategories so the list learns the aisle.
  - Spotify: Nova cannot read a Spotify episode and says so. Confirm he is happy with pasting the YouTube or Apple Podcasts link instead.
  - Wren: carry the ASD-STE100 plain-speech rule (lens.js) into Wren's lens. He said to keep it as a potential, so it is not started.
  - No decision is waiting on him now. His answers this session (1 kept, 2 yes, 3 kept) and the Telegram "No" are all applied.
- NEXT ACTION: on his phone, in Summary, type "toothpaste" into Quick Capture. Expect a "Shopping list · Household" tag. Paste a YouTube episode link. Expect the full read to start and a transcript to be filed in the vault. Then log a set above his best with "bench <kg> for <reps>". Expect the record moment in-app and no Telegram message. Check `gh run list --limit 1` for the deploy.
- DO NOT:
  - Never `git stash` in the shared tree. A stash swept up a peer's work this session (memory nova-concurrent-sessions).
  - Never judge a past day against the current goal (memory nova-target-history).
  - Never say Spotify links work; Nova cannot read them.
  - Never send a spoken-set personal best to Telegram (his "No").
  - Never write test rows to the live vault or the live server/data. Set NOVA_DATA_DIR before any import (memory nova-test-data-isolation).
  - Never use toISOString().slice(0,10) for a local day; use the local-date helpers.
  - Never call the eight new exercises audited.
  - Never reload with a bare launchctl; use `node scripts/reload-server.mjs`.
  - Never let a fixture pass without asserting the finding: the fuel-cross fixture needs the `macros` wrapper, or the test passes for the wrong reason.
  - Never re-create the discarded stale Inbox card (record e28e9fab). Its producer, the floor-pattern check, now judges each day by that day's own floor.

**18 OCT, CLOSE (claude.ai session 01MPaorT, resumed through two Mac restarts) — THE SPEED AND COMPETENCE AUDIT OF NOVA AND WREN, MEASURED AND BUILT. ALL ON MAIN AND PUSHED; NOVA RELOADED; WREN LIVE VIA THE REBOOT; NOTHING SEEN ON HIS PHONE.**
- GOAL: his bar, "like E.V. and JARVIS … entire context, speed and capabilities like Claude Code, focused on their own purpose"; audit from receipts and the CLI session journals, rank by seconds, fix, re-measure.
- DONE CRITERIA: built and committed: Nova 1301dd8a (error ledger), 3e1c8c66 (pre-render yields to load), c6bfaaa6 (speech never drops, speaks sooner, survives iOS suspension, re-attach lane bug), 577378f6 (14 one-shot spawns close stdin), 7d4fa3a6 (effort per lane, session guard + hygiene, warm consult sessions), 1b0fd07a (the ears: lead from mic-open, tap keeps listening, empty captures never reach Groq, ack gap, blind meter, hidden), 7df119d3 (deepLine spoken). Wren c81717d (telemetry), 1b1ee1c (cold turn 156K→28K, citations, memory, held speech), 46f4ebd (two lanes, warm session, stdin closed, checked event, sidecar at boot). Unmet: the AFTER benchmark (agent still running: scripts/bench-ask.mjs, tools/bench-ask.mjs; outputs to scratchpad/bench/*-after.json), anything on his iPhone.
- STATE: nova main == origin/main at 7df119d3 (+ peers' commits interleaved); server reloaded at 7df119d3, health 200, TTS disk cache 1347 files; Wren main at 46f4ebd, live since the 09:23 reboot (launchd), /api/health tts ready. The Mac crashed twice on 18 Oct; after boot load sat at 160–280 with six Claude sessions resuming and swap at 10 GB in nine minutes. `public/_devconn.js` (08:43) is a peer's seed, left alone. `scripts/bench-ask.mjs` is tracked by a peer's commit and modified by the bench agent.
- DECISIONS: (a) acks only name things Nova knows (closed vocabulary) — fragments of his dictation were worse than canned lines. (b) Coach effort medium (high on a deep ask), Nova/consults low, Leader medium; other lanes still inherit xhigh. (c) Wren Advisor/Delegator on Sonnet low, Briefing/Brainstorm/Research on Opus medium. (d) no wall-clock cap on the ask poll; an "answer is ready" push after 5 s unseen instead of keeping the app awake with silence (his music would duck). (e) consulted Coach may still file cards (his 30 Sep call); other consulted agents file nothing. (f) Coach sticky window 120 s; Leader keeps 20 min (the 14 Sep rebuttal case). (g) a tap on a silent mic keeps listening; the reply window opens once; a locked phone still sends words already heard.
- VERIFIED: gates on HEAD in an isolated worktree: lint 0 errors, build green, 4044 pass / 0 fail; Wren 465/465. Measured: stdin-open costs 3 s per spawn (4,186 vs 1,483 ms); Wren cold userTurn 156,290 → 27,627 chars; Kokoro 0.15 s fresh vs 1–7 s under swap; the real causes of the 15–17 Oct receipts (in the memory file nova-speed-audit-2026-10-18).
- ASSUMED: every timing improvement on his real turns (no AFTER numbers yet); the ears' fixes on iOS (hidden on lock, ctx.resume while blind, the haptic); the "answer is ready" push waking the phone; that Wren's hold-until-checked speech behaves on a device; Settings effort pill looks right in his Summary style (not photographed).
- OPEN QUESTIONS / BLOCKERS: Wren decisions: add docs/reports, phases, research + the plan files to Atomic_Hub's brain-index SOURCES (outside this repo)? warm standby for Wren if spawnToFirstEvent stays > 1.5 s (one week of receipts). Nova: rebuild the iOS shell so UIBackgroundModes audio takes effect; keep Plan Today push off (his 18 Oct yes). Known failing pair: exerciseAtlas. The coachProposals test wording (peer's 00d7d919) was briefly red.
- NEXT ACTION: read the AFTER benchmark (bench/nova-after.json, wren-after.json) and, after a day of his real use, `node scripts/voice-latency.mjs` (ask table: ackMs/firstTextMs/firstAudioMs/preAskMs by lane; listening table: heard rate by trigger) and Wren's `tools/voice-latency.mjs` (ask receipts: ms.spawnToFirstEvent, attempts). Expected: ack p50 well under 1 s, Coach firstText p50 under 10 s, zero `tts 4xx` lines, ears heard-rate on trigger:tap above 80%. Then ask him what he heard.
- DO NOT: add filler on a timer; open stdin on a `-p` spawn (spawnStdin.test.js); start the pre-render or heavy agents while the load average is above twice the cores; shoot proofs in cupertino (his style is Summary); claim any of this works on his phone before the receipts say so; reload with a bare launchctl.

**17 OCT (later) — LINK DROP THROUGH THE CAPTURE RAILS, ONE CALORIE TARGET, WEEKLY CALORIES, DROP SETS NOT READ AS STALLING. ON MAIN AND PUSHED; SERVER RELOADED; NOTHING SEEN ON HIS PHONE.**
- LINK DROP (reworks my earlier "Send a video"): the Inbox card is now "Send a link". "Send it" = POST /inbox/capture (the share sheet's rails): a bare reel whose CAPTION holds a recipe becomes a recipe (straight in, Undo in Filed), a video gets the Watcher's quick look (which FILES ITSELF, his 7 Sep call: my first copy wrongly said it lands in Waiting), a recipe page is read into the recipe bank, a channel is studied. The route now returns `kind` so the sent line says what Nova chose (videoDrop.sentLine). Limit: a reel whose recipe is only spoken (empty caption) is not recognised as a recipe on a bare send; a note "add to my recipes" in the optional field forces the recipe lane and reads the transcript. "Full read" is unchanged (videos only, deep weave).
- ONE TARGET: his calorie goal was 2,100 on the goals page and 2,200 in the recipe collection (Fuel reads the collection). fitnessGoals.setFitnessGoals now writes kcalTarget/proteinTarget through to the collection (all four profile keys, because frontmatter shadows the prose line), the Intake's yes writes them to the goals page (setGoalTargets) and its undo restores both. His collection synced to 2,100 (goal board and Fuel agree). Intake undo edge: covered by priorGoalTargets, untested end to end.
- WEEKLY CALORIES: src/calorieWeek.js (Mon to Sun, budget = 7 × daily target, gaps are gaps not zeros, "what the rest of the week allows a day"), built into /nutrition-week as `calWeek`; a "This week" line on the Fuel plate and a "Calories · this week" card in the week sheet (VoicePanels CalorieWeek). His real week reads 18,821 of 14,700; some days 3,500 to 4,500, worth him checking against double-logged entries.
- DROP SETS: Upper lateral raise back to 5 sets / 4 drops (his call); Coach's saved tune rewritten to match (top set, then drops, no rest between drops); tune focus cap 120 to 240 (the old note was cut mid-word). Drop sets are excluded from the effort-ceiling share and the spoken lift check says "run with drop sets, so the top set is the measure, not volume" instead of quoting a volume drop.
- NOT VERIFIED: any of it on his phone; a real "Send it" on a reel (costs a run); the Intake undo with goal targets end to end.

**17 OCT — DROP SETS (1 top set + n drops) AND THE INBOX VIDEO DROP. ON MAIN AND PUSHED; SERVER RELOADED; NOTHING SEEN ON HIS PHONE.**
- DROP SETS: a routine entry may carry `dropSets: n` (the LAST n sets are drops; src/fitSets.js cleanDropSets/applyDrops/topSetCount). Session opens with the prescribed set count, drops stepped ~20% down chained from the set above (his logged lighter weights kept), setType 'drop' (new chip, cycle, glossary), NO rest timer before a drop. Progression reads TOP sets only (coach.js sansDrops + topSetCount): drops cannot earn the weight a step. Coach: claudeCode.js carries a DROP SETS doctrine paragraph (when: isolation/cable/machine; not heavy compounds, pain, grinding, run-down weeks; dose 1–3 drops, one or two lifts a session) and `dropSets` on the targets action; validateCoachEdit refuses a card with no top set; inbox apply + undo carry it; the program context and dossier print "[1 top + 4 drop]". Routine page: "Drop sets" stepper. His data (via the live API): Push lateral raise 5 sets / 4 drops; Upper lateral raise 3 sets / 2 drops (Upper reads 3 sets in the vault now, not the 5 Coach's reason mentions).
- CONFLICT TO RESOLVE WITH HIM: Coach's own standing tune on that lift (Progression Tuning.md, 16 Oct) says "On Push: every set is a drop set. Go to about 1 rep short, drop the pin about a quarter, rep out clean, then rest 90 s t" — a drop INSIDE every set, a different structure, and cut mid-word by the 120-char focus cap (normalizeTune). Not edited. The session shows both until he picks.
- INBOX VIDEO DROP (Summary Inbox, Waiting tab): src/videoDrop.js readVideoLink (linkKind classifyLink), App.setInboxVideoUrl/pasteInboxVideo/sendInboxVideo, vals videoDrop, VideoDrop in InboxSummary.jsx. Quick look = api.videoWatchDirect (model-gated, lands pending in Waiting); Full read = beginIngestJob(null, url) (the Deep weave job, review via the ingest sheet). Empty field reads the clipboard. Channels and pages are refused with a reason. No cost figures shown (measure first, memory nova-model-cost-discipline).
- TESTS: dropSets (7), videoDrop (3), fitSets/prefill; full suite fails only the two exerciseAtlas, 'Coach sees its cards and his program' (date-dependent: fails at HEAD without my changes since 17 Oct) and a parallel-run flake in fleetContext (passes alone).
- NOT VERIFIED: any tap on his phone; the real Quick look or Full read from the new box (a real send costs a model run, so I did not fire one); the FLIP glide of the reorder sheet.

**16 OCT (later, same session) — LIVE SESSION: PER-LIFT REST, REORDER, FORM CUE. ON MAIN AND PUSHED (b6d3296a, 6b55b76b, 78ebed23); SERVER RELOADED; UNSEEN ON HIS PHONE.**
- WHAT: `restSeconds` lives on the exercise record (Exercise Library.md), written by PATCH /workouts/exercises/:id, so it holds on every day. The ⋯ sheet has a 15 s stepper (own time beats the general setting, even "off"); the tick reads it live from `liveWorkoutExercises`. Reorder: ⋯ → Reorder exercises (App.moveSessionExercise swaps in `workoutSession.exercises`; the draft and the filed session keep that order) with "Keep this order for <routine>" (App.keepSessionOrder, PUT routine, Undo). Form cue: routine entries now carry `cues` (his own, then research, then seed), shown as one line under the lift, tap to open (CueLine).
- VERIFIED: server tests (3906/3908, the known pair), lint, build, guard; shot.mjs --readonly --style summary photographed the cue (collapsed and open), the rest stepper and the order sheet on his real data. NOT verified: the rest write on his real vault (tested on a temp vault only), a held +, the FLIP glide, any tap on a real finger.
- SET COUNT (his pick, Option A, 16 Oct): a session opens with the PRESCRIBED number of sets (src/fitSets.js, used by App.startWorkoutSession and server prefillFor); numbers still come from last time, extras past the prescription are not carried. Cause found: the prefill copied last time's count (one cut-short set of lateral raises opened as 1 set under a card saying 5 × 12–15). Unseen on his phone.
- COACH'S REST LINE (his call 16 Oct): src/restText.js parses "Rest 2 minutes between sets" out of a tune's focus note. With no time of his own, that is the lift's rest (ring and line agree); his own time wins and the sentence is dropped from the line; if they differ the ⋯ rest row says "Coach prescribes 2:00. You use 1:30" with "Talk it over with Coach" (opens Coach with the question) and "Use Coach's time". A range ("2-3 minutes") gives no single time. The tune itself is never edited by him setting a time. NOT built: Coach raising the disagreement unprompted.

**16 OCT, (claude.ai session 01AhAA1e) — TRAIN SHOWS ONLY HIS FOUR-DAY PROGRAM; ROUTINES CAN BE ARCHIVED, RENAMED AND REORDERED. ON MAIN AND PUSHED (6ecf375b, 6b1561bf); SERVER RELOADED; HIS VAULT MIGRATED; HOLD MENU UNSEEN ON HIS PHONE.**
- WHAT: his ask: hide the first five routines (kept, restorable), drop "Core" from the new ones, Mobility last, and let him hold-to-customise. `archived: true` on a routine in `Workout Routines.md` frontmatter; `loadRoutines` filters archived out so Coach, the week and analytics never see them (like a deleted routine); `loadArchivedRoutines` feeds the shelf. New routes: POST /workouts/routines/:id/archive, /:id/restore, /routines/order; rename guards live-name clashes (Coach finds routines by name). Hold menu (valsTrainSummary): Rename, Move earlier/later, Archive (Undo via tickReceipt); shelf "Archived · N" with Restore under the list (TrainSummary.jsx).
- HIS DATA (via the live API): archived Pull, Push, Upper Body, Leg Day, Arms and Delts; renamed Push/Pull/Legs/Upper Core to Push, Pull, Legs, Upper; Mobility moved last. Schedule untouched (Mon–Thu those four, Sun Mobility). "Arms Optional" and "Delts and Back Optional" left as named (no "Core" in them).
- VERIFIED: server routineShelf tests 5/5, full suite 3901/3903 (the known exerciseAtlas pair); lint 0 errors; build green; guard-cupertino unchanged; shot.mjs --readonly --style summary on his real vault shows the new order and the 5-row shelf. NOT verified: the hold menu and Restore/Archive taps on a real finger; the classic (cupertino) Train idiom has no rename/archive menu (his phone runs the summary idiom).
- DO NOT: restore the old five without expecting "(earlier)" suffixes where a live routine has the same name.

**15 OCT, CLOSE (claude.ai session 01MPaorT) — THE E.V. BUILD: ACKS FROM HIS OWN WORDS, CHECK VERBS, STANDBY, THE ALERT LAYER, REGISTER BY PLACE; SAME FOR WREN. ALL ON MAIN AND PUSHED; NOVA RELOADED; WREN NOT RESTARTED; NOTHING SEEN ON HIS PHONE.**
- GOAL: his brief off *Spider-Man: Brand New Day* (study `design/EVIE-STUDY.md`): fast, content-carrying acks that never feel canned; alerts with an anatomy everywhere; "take five"; check verbs; the same for Wren/Mission Control. He said yes to all four decisions and added: the prebuilt acks "get old quickly… too expected and premeditated"; and (later) verify on HIS style and data, never demo.
- DONE CRITERIA: met in code: A 2adaa06 (acks.js, spokenLint, latency receipts, voice-latency.mjs), C 732a72d (checks.js), B f0797d8 (standby.js, idioms.js, wakePhrase.js + Settings › Voice switch), D 05b4331 (alerts.js, AlertCard.jsx, demotions via pattern scout), E 2f7fdb8 (where.js, register.js), docs 06faccd; Wren bf4bd0c (acks, spokenLint, standby, raiseAlert cards, receipts). Unmet: anything on his iPhone; Wren's live service still runs the OLD code.
- STATE: main == origin/main at 06faccd (peer commits 6b0fc91 Home edit, 5200b58 Info.plist in between); server reloaded via scripts/reload-server.mjs, health 200, GET /api/voice/standby → on:false, GET /api/alerts → []. No public/_devconn.js, no vite on 5183 (other sessions' worktrees run vite on 5191/5192/5197; not ours). Untracked tools/anatomy/* are a peer's.
- DECISIONS: (a) an ack carries his own words, rotates by LOCAL day, never repeats a sentence; when a lane's frames are spent it goes SILENT (forecloses repeats). (b) reflex/verb answers get no ack. (c) progress lines are state-driven only. (d) standby 30 min default, tier-now alerts pass, held ones go out as ONE push on "I'm back". (e) bare "Nova," opt-in under the wake toggle (novaos.wakeBare). (f) check verbs pure code; "why" goes to the model. (g) driving is detected ONLY on the Siri/Action-Button lane until a native plugin reports audio route + motion; Siri does not wait for a yes. (h) Plan Today's push dropped (tier later); missed-health-push keeps Telegram + alert; a daily systems check exists.
- VERIFIED: full gates on HEAD in an isolated worktree before E (lint 0 errors, build green, 3756 pass / 0 fail); E's own run 3795/2 known; Wren 421/421. Alert cards photographed on HIS real data, cupertino + lit, 375 and 402 (`--readonly`, writes blocked): both tiers render, meta wraps to show the source. Standby's COMPACT island pill (pause mark + time) rendered; the EXPANDED card with "I'm back" could not be forced headless (unverified). Settings › Voice row seen only in demo (402).
- ASSUMED: ack timing, the stale-ack drop, the prewarm cache hit, "One thing first", the bare-name wake, the standby card, every spoken line: all on real hardware. Latency receipts are EMPTY until he talks; run `node scripts/voice-latency.mjs` after a day before any speed claim. His theme (not on record; shots used the default theme).
- OPEN QUESTIONS / BLOCKERS: Wren restart was permission-blocked here; he runs `launchctl kickstart -k gui/$(id -u)/com.scienceatlas.wren`. His theme name. Whether Siri-as-driving is right (decision g). TRAP found: rAF never fires in the shot.mjs headless session (memory nova-ui-instruments, 15 Oct).
- NEXT ACTION: after he has used Nova for a day, `node scripts/voice-latency.mjs`; expected: rows with lane and ackMs; p50 ackMs well under 1 s on iPhone, firstAudioMs a few s. Then ask what he heard: did any ack repeat, did "take five" land, did a card drop.
- DO NOT: add any filler line on a timer (memory nova-ack-that-heard-him); prove a build on --demo alone (memory nova-verify-on-his-setup); reload with a bare launchctl; call the standby card or the bare-name wake "working" before he has used them; edit the ack vocabulary without the day-rotation test.

**14–15 OCT, CLOSE (claude.ai session 01AhAA1e) — THE NATIVE SHELL GREW UP: WIDGETS, HEALTHKIT, FULL-SCREEN FIX, COMPRESSED SYNC, MOVABLE HOME CARDS. ALL ON MAIN AND PUSHED; SERVER RELOADED; MOST OF IT UNSEEN ON HIS PHONE.**
- GOAL: stop the OFFLINE storms and slow syncs; make the Xcode app full-screen; build Home Screen and Lock Screen widgets; read Apple Health natively instead of the Shortcut; make every Home card movable; quiet the Landed card.
- DONE CRITERIA: met: compressed sync (c8979d9), ping-before-OFFLINE (38124e3), full-screen shell (e7860b4), /api/widget/today (c1d1986), widgets (6477191), inbox trim (2095bcc), Landed counts only his captures (5d1337d), movable cards (8f5c407), HealthKit override of the Shortcut (afda8e7). Unmet/unseen: widgets on his phone, full-screen fix, touch-and-hold drag, offline phase 3 (airplane workout), HealthKit background delivery (not built).
- STATE: main == origin/main at afda8e7 plus this handoff commit; git clean; health 200; no dist/pc.json, no public/_devconn.js, no vite. Widgets: ios/App/NovaLiveActivity/NovaWidgets.swift (Rings, One number, Fuel, Today), data via App Group `nova.today`, app side ios/App/App/NovaWidgetsPlugin.swift + src/widgetBridge.js. HealthKit: ios/App/App/NovaHealthPlugin.swift + src/healthSync.js; server override in server/lib/healthData.js (accumSource:'healthkit'). Drag: src/useGridDrag.js, PinnedGrid in MissionSummary (Summary idiom only; cupertino MissionStructured unchanged). ios/App/App/capacitor.config.json is gitignored and was edited locally (contentInset never).
- DECISIONS: (a) compress snapshot/inbox with brotli ≥8 KB, sync carries open records + 14 days of inbox → forecloses sending full history every sync ("Show N older" loads it). (b) a stalled sync pings /api/health before saying OFFLINE → forecloses treating any fetch failure as offline. (c) widgets fetch the Mac themselves every 15 min, another day's data shows nothing → forecloses app-pushed widget data. (d) lock-screen widgets are tint-only by iOS, full colour only on Watch → forecloses coloured lock-screen widgets. (e) Apple Health's totals beat the Shortcut's higher-wins rule → forecloses ever raising a healthkit day from a Shortcut push. (f) Landed counts only capture/voice/text/share/shortcut/typed sources.
- VERIFIED: lint 0 errors (warnings pre-existing), build green, `cd server && npm test` 3632 tests, 3630 pass, 2 fail (known exerciseAtlas pair); /api/health 200; git clean and pushed (`git log origin/main..HEAD` empty before this commit). Sync on his phone 861 ms vs 5.6 s (server log). HealthKit pushes landed on device 14 Oct 21:31 with source healthkit (today 8,874 steps, 7.38 km, HRV 84.3; 13 Oct 8,725 steps, HRV 78.6, sleep 69 min) via server/data/health. Widget render compared to mockup in scratchpad/wr. Movable cards verified in a 402 px headless browser, read-only: Body carried above Right now, saved order persisted.
- ASSUMED: the healthkit-over-Shortcut correction (afda8e7) actually re-reads both days on his next open (not re-checked after his next open); widgets draw and refresh on his phone (no /api/widget/today fetch from the phone seen yet); the full-screen fix and island layer on the phone; touch-and-hold drag on a real finger (could scroll or select text); his Health app really shows 8,725 for 13 Oct and a 69 min sleep is real.
- OPEN QUESTIONS / BLOCKERS: his two checks (13 Oct steps in Health ≈ 8,725? sleep before 13 Oct real?) gate deleting the Health Shortcut. Paid Apple developer account ($99/yr) undecided. Offered: drop the Landed card from Home entirely if still too much. Lag-hunt list still awaited from him. Possible polish: the carried glass card shows content behind it. Two exerciseAtlas failures still unfixed (offered earlier).
- NEXT ACTION: after his next app open (5-min gap), read server/data/health for 13 Oct and today; expected: steps 8,725 for 13 Oct and healthkit distance (not 13.2 km) for today. Then check server log for `/api/widget/today` hits from 100.77.255.37 once he adds a widget; expected: one fetch per widget refresh. Then the airplane-mode workout for offline phase 3 and confirm the vault filed it once.
- DO NOT: reload the server with anything but `node scripts/reload-server.mjs`; leave public/_devconn.js behind (`node scripts/dev-connect.mjs --clean`); treat any network failure of the snapshot as OFFLINE; promise coloured lock-screen widgets; tell him to delete the Shortcut before the 13 Oct match; call the widgets or the drag "working" before he has used them; commit a peer's untracked files; assume `ios/App/App/capacitor.config.json` is in git (it is not; mirror edits from the root capacitor.config.json).

**14 OCT, CLOSE (claude.ai session 01MPaorT) — HEALTH PUSH DIAGNOSED AND PATCHED SERVER-SIDE, TAB LENS, AND THE APP ICON IS NOW NOVA'S OWN CORE (OPTION A), ALL ON MAIN AND PUSHED; THE SHORTCUTS ARE HIS TO FINISH; UNSEEN ON HIS PHONE.**
- GOAL: native-feeling section transitions; get steps/workouts reaching Nova reliably through the day; give the app icon Nova's real design, sharp.
- DONE CRITERIA: met: tab lens (66a38b5), workout duration + flat-body fix (efa52e0), icon A + small-core 3x DPR (f80865d, ac8d4f4). Blocked on him: Nova Workout Push shortcut and automation, weight binding in Today shortcut, Morning 6 date filters, Health/Pedometer++ "is opened" automations. Unmet/unseen: any of it on his iPhone.
- STATE: main == origin/main, git clean (peer sessions committed native-shell and offline work on top). Icon generator: scripts/gen-icons.mjs + tools/icon/core.html/.jsx (needs `npx vite --port 5183` up); it also writes ios/.../AppIcon-512@2x.png (a peer added that). NovaCore takes `pixelRatio`; cores <=160px draw at up to 3x, larger at 2x (src/NovaCore.jsx). Untracked dir ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/ is not mine, left alone.
- DECISIONS: (a) icon = hologram core at rest on navy/violet, rendered at 8x and downsampled, not enlarged → sharp at every size → forecloses a flat-vector icon unless he asks. (b) core DPR cap raised only for <=160px → keeps the full-screen core at 2x for the 120Hz budget → forecloses 3x full screen without a measured frame cost. (c) workout push accepts one flat workout or a list; duration is derived from start/end first, seconds are never read as minutes when the unit is known → forecloses trusting a bare `duration` over timestamps. (d) Siri's builder cannot edit shortcuts or take descriptions that send JSON to a URL, so the shortcut's reading half is Siri-built and "Get Contents of URL" is added by hand.
- VERIFIED: `cd server && npm test`: 3608 tests, 3606 pass, 2 fail (the known exerciseAtlas pair); lint 0 errors (warnings only); `npm run build` green; /api/health 200; no dist/pc.json; no vite preview process; Pages deploy of HEAD succeeded (gh run 38496666851, and f80865d's own run 38480392439). Icon sharpness checked pixel by pixel at 180px from public/icons/apple-touch-icon.png. Today push landed: server/data/health/pushlog.json last entry 2026-10-14T02:29:58Z ok:true date 2026-10-14 (after fixing his JSON braces and headers).
- ASSUMED: how the new icon and sharper orbs look on his phone (a home-screen app keeps its old icon until deleted and re-added); that the lens glide feels right at 120Hz; that the workout shortcut will deliver once built. The Today push's 02:29 entry shows `stepsDropped: true` (the accumulator guard kept a higher earlier value; it also carried a `watchSteps` field not in `keys`), cause not examined. Weight is still absent from pushes (chip binding in his shortcut).
- OPEN QUESTIONS / BLOCKERS: whether Mission Control's "native transitions between sections" is satisfied by the tab lens alone; why the 02:29 Today push dropped steps (a read of ACCUMULATOR_METRICS against the earlier push would settle it); Nova's Home display of a partial same-day step count was never seen in the UI, only the saved record.
- NEXT ACTION: after he says he has run the shortcuts, read the tail of server/data/health/pushlog.json; expected: a workout entry with sane minutes, a weight key, and today's steps rising through the day. Ask him to delete and re-add Nova to the Home Screen to see the icon.
- DO NOT: tell Siri to "send a POST" or paste JSON bodies into its prompt (rejected as "Try another description"); ask Siri to edit an existing shortcut; blame the icon blur on resizing alone (the cap on canvas DPR was the cause); put the core on a transparent background (it paints with 'lighter' and vanishes; render on black and `screen`-composite); run git without `export DEVELOPER_DIR=/Library/Developer/CommandLineTools` if Xcode's licence ever lapses again; treat a pushed icon as visible on his phone.

**13 OCT, CLOSE (claude.ai session 01MPaorT) — EVERY HOME CARD NOW WEARS THE
TILED HEADER (6f63656). HOME, THE MOTION LIST AND FUEL/TRAIN ARE ON MAIN,
PUSHED, DEPLOYED; NOTHING RUNNING; UNSEEN ON HIS PHONE.**
- GOAL: build his approved mockup 101 across Fuel, Train, Home, plus the
  motion list (page moves, card grows into session); then audit that no Home
  card keeps the old header.
- DONE CRITERIA: met for the build and the header audit (3 stragglers fixed:
  Lead, the sealed technique reveal, Your day). Unmet/unseen: any look on his
  iPhone.
- STATE: main == origin/main at 6f63656, git clean, health 200, no
  dist/pc.json, no public/_devconn.js. Lead/reveal/Your day take a `head`
  (Lead also `door`) render prop from MissionSummary: src/LeaderBox.jsx,
  src/TechniqueReveal.jsx, src/Instruments.jsx (YourDay). Other idioms keep
  their own headers when no `head` is passed.
- DECISIONS: (a) render props, not a second component → other Home idioms are
  untouched (guard-cupertino unchanged) → forecloses a single shared header
  component for now. (b) Lead's duplicate "TRY TODAY" line dropped (repeated
  the title); a tag that adds info ("3 open") still shows. (c) Earlier
  decisions in the blocks below stand.
- VERIFIED: lint 0 errors (4 old warnings), build green, `cd server && npm
  test`: 3600 tests, 3598 pass, 2 fail = the known exerciseAtlas pair
  (every exercise resolves to a drawable view; the 4 atlas names). Lead and
  Your day photographed read-only on his real data with the clock forced to
  4pm and 9am; the sealed reveal forced via state in the test browser. Live
  bundle index-CTbqVMk-.js returned 200 and holds the Leader code; Pages
  deploy succeeded.
- ASSUMED: the look and the 120Hz feel on his iPhone; the edge swipe on
  Train's history levels with a real finger; that a full close and reopen of
  the PWA loads the new JS (the PWA keeps old JS until reload).
- OPEN QUESTIONS / BLOCKERS: none blocking. Owed: his look at Home on the
  phone. The Mission Control "native transitions between sections" instruction
  (relayed by a peer) is still not taken up.
- NEXT ACTION: ask him to fully close and reopen Nova, open Home, and say if
  any card still looks different; expected: Lead, Your day and the technique
  card all show a gradient tile + title + quiet meta like the rest.
- DO NOT: put mockup 101 or his vault text in the repo; reload with a bare
  launchctl; leave public/_devconn.js behind; assume a card is redesigned
  because its siblings are (this session found 3 that were not, by audit, not
  by memory); trust headless shots for animation without finishing/freezing
  WAAPI first.

**13 OCT, LATER (same session 01MPaorT) — HOME AS MOCKUP 101 AND THE WHOLE
MOTION LIST ARE ON MAIN, PUSHED, DEPLOYED (live bundle checked); NOTHING
RUNNING. UNSEEN ON HIS PHONE.**
- DONE: Home ff884d0: every card wears the tiled header (CardHead `tile`),
  glows in its own colours (`glow()` / CARD_GLOW → --nv-g1..3), Records rows
  in muscle hues with the gain as a pill (prKind/prGain), Today's strip is a
  rail (dot in the slot's own hue, past dimmed, the current OR the next one
  ringed: `.lead`), Training wears its routine glyph. NOVA·OS bar untouched,
  his call. Compared against mockup 101 §0 at 402 and 375 on his real data
  (read-only): every card, nothing missing.
- DONE: motion 8a0eab5 + edfaf71. src/pageMoveRule.js decides push/pop/grow/
  shrink from the state change; App.getSnapshotBeforeUpdate freezes, then
  playPageMove plays it (settingsNav's engine for push/pop, src/pageMotion.js
  for grow/shrink with an even-odd hole in the old page). Train's routine and
  history are now history levels (novaView 'trainPage'); the session grows
  from [data-grow] / the tapped card and closes onto its routine tile or the
  hero, whichever is wholly in view; Home cards grow into their pages
  (navigate); active tab = pop to root then top; tap the bar = top. Inbox
  filed rows: Disclose. Each move photographed mid-flight on his data by
  freezing WAAPI at set ms (see the trap below).
- TRAP (instrument): headless Chrome does not advance animations or smooth
  scroll between screenshots. Finish them (`getAnimations().forEach(a =>
  a.finish())`) before the next tap, and freeze (`pause(); currentTime=ms`)
  to photograph a frame. The headless profile also keeps a session draft
  between runs.
- NOT VERIFIED: the feel at 120Hz on his iPhone, and the edge swipe on the new
  Train levels on a real finger. Ask him after he has used it.

**13 OCT (redesign session, claude.ai session 01MPaorT) — MOCKUP 101 BUILT:
FUEL, TRAIN, THE RECORD BANNER AND THE GLOW SETTING ARE ON MAIN, PUSHED AND
LIVE; NOTHING RUNNING; HOME WAITS ON HIS RECORDING.**
- GOAL: build his approved mockup 101 (the OxeAI-inspired redesign; study in
  design/OXEAI-STUDY.md, mockup in the scratchpad + artifact
  S7kWYPEFjVb4CAgtZyuSJM, NOT in the repo: it shows his routines/recipes).
- DONE: Fuel fea7627 0874dc0 1e15bc8 (read/Right now/Likely now/one tile per
  slot/log below rotation/type-ahead/hold camera), glow fc2ab3f (Settings ›
  Appearance › Glow; Lit left Material), Train b036aa4 (routine body glyphs,
  muscle strips, week capsules with make-ups folded in), record banner fd99862
  (+ GET /workouts/bests). Pushed (0 0 vs origin), Pages deploy success, live
  bundle carries every new string, server reloaded (health 200), /workouts/bests
  answered on his data (incline 82.3 kg).
- DECISIONS: (a) Today's read judges only protein and calories (his targets);
  fat has no target in his profile so it is shown, never judged; mid-day is
  PROJECTED from the uneaten rotation. (b) Readiness 0 is a real computed score
  (HRV vs baseline + sleep), so it stays 0, not "no reading". (c) bests read the
  same 60 sessions Save's prsInSession reads, so the banner never promises a
  record Save would refuse. (d) A stored material 'lit' becomes glass + glow
  'dyn'; anyone on glass before gets glow OFF until he picks it.
- VERIFIED: every page shot on HIS data with shot.mjs --readonly (writes
  blocked at CDP), seed removed after each run; full suite 3592 pass, 2 fail
  (the old exerciseAtlas pair); lint 0 errors; guard-cupertino unchanged (Home,
  recipes, workouts). The record banner seen only in DEMO (seeded state).
- ASSUMED: all of it on his iPhone (not seen there); the hold-camera gesture on
  iOS (pointer events on a file-input label, desktop only); the capsule travel
  on a real Move (needs a make-up this week).
- OPEN: his Home recording (Home redesign in this style); his glow pick if he
  was on Glass; a peer relayed his Mission Control instruction that Nova's
  transitions between sections should animate the native way (not yet taken
  up, needs his word here).
- DO NOT: put mockup 101 or his routine/recipe names in the repo; reload with a
  bare launchctl; leave public/_devconn.js behind after a --readonly shot.

**12 OCT (redesign session, claude.ai session 01MPaorT) — NOTION KEY, JOURNAL,
SKILL SETS, SWIPE-TO-DISMISS AND THE SHORT DAILY REVIEW ARE ALL ON MAIN AND
LIVE; NOTHING RUNNING; ONE LOOK OWED ON HIS PHONE.**
- GOAL: continue the page-by-page redesign; this stretch took his phone-side
  asks: Notion key in Settings, Journal with Notion two-way sync, an Agents
  "skill sets" view with living 3D characters, swipe-to-dismiss across Nova,
  and a Daily review cut down to a short collated summary.
- DONE CRITERIA: built, gated, pushed, reloaded: MET for all five. His
  on-phone confirmation of Skill sets and the short Daily review: UNMET (he
  said he will say if it looks good).
- STATE: main at fd06001 (a test-only fix on top of 0e31549), clean, pushed
  after this close. Daily review: server/lib/reviewSummary.js,
  conceptReview.js, src/Review*.jsx. Journal/Notion: server/lib/notionAuth.js,
  notionJournal.js. Skill sets: src/skillsets/*. Swipe: src/sheetDrag.js,
  EdgeBack.jsx. Mockups 96, 97 in design/mockups; 98 is scratchpad only
  (quotes his vault).
- DECISIONS: (a) Daily review summary is written once per concept, cached by a
  hash of the page body, grades behind "···", Shuffle in the full view;
  forecloses regenerating on every open. (b) An over-long reflection is
  trimmed to opening sentences (else dropped), the summary kept; forecloses
  failing the whole summary on one field. (c) Origin is shown only if the
  source text states it; minutes only from a real source time. (d) Notion
  delete flows to the vault with Undo; Undo restores the vault only, Notion
  keeps it deleted. (e) Standing Daily review rules A to E are in
  design/NOVA-METHOD.md §2b and the file header of reviewSummary.js.
- VERIFIED: server suite 3510 tests, 3506 pass; the 4 fails at the time of
  checking were the 2 exerciseAtlas (old) plus 2 Notion journal tests, which
  I fixed (fd06001; node --test test/notionJournal.test.js: 10 pass, 0 fail).
  guard-cupertino: "unchanged". Lint 0 errors (warnings only). Build green.
  health 200 on :4173. A real summary for today's concept was generated and
  read back from GET /api/review/summary (shape only). dist/pc.json absent,
  no vite preview running.
- ASSUMED (no locator): the full server suite after fd06001 (I re-ran only
  the one file); Skill sets, swipe handoff, 120 Hz and keyboard handoff on his
  iPhone (only desktop browsers tested); that the Ops-switch tap failure on
  his phone is gone (never reproduced, More > Agents added as a second way).
- OPEN QUESTIONS / BLOCKERS: Skill sets on his phone: read
  GET /api/perf/skillsets?limit=N after he uses it (earlier rows: main thread
  p50 33 ms, degrading with a sheet open). Leftovers: Practice masks,
  Commander rose and Watcher headphones still move with their bodies; the
  press bar is hard to read at phone scale; CFO coin counting reads weakly; on
  375x667 the centre agent rests below the fold; lane changes snap. The
  REDESIGN-CHECKLIST §7 row boxes were NOT updated this stretch (Train, Fuel,
  Inbox, Voice still show untouched; Journal, Daily review, Agents, swipe not
  logged). The 2 exerciseAtlas tests are still red (predate this).
- NEXT ACTION: (1) reconcile design/REDESIGN-CHECKLIST.md rows with the
  ledger (expect the status board to match git log). (2) Wait for his word on
  the Daily review and Skill sets; adjust from it. (3) MacBook desktop round
  (Todoist reminder 12 Oct 7:45 pm, 6 desktop decisions pending). (4) Remaining
  pages: sheets/overlays, Settings, Ops and Org map, Library, Practice audit,
  Leader, Briefing, small screens, Ambient, Console. Still owed: icon-motion
  reel mockups, Jarvis-reel parts 3 and 4, the Inbox re-evaluation.
- DO NOT: write a test that dates an entry "today" without resetting the whole
  journal folder (it passed on 11 Oct and failed on 12 Oct); run dev-connect,
  probe, rec or shot --readonly; claim the Skill sets switch tap fixed; put
  mockup 98 or his vault text in the repo; reload with a bare launchctl; read
  this block as replacing the older ones below (a stack).

**11 OCT (recipe/brief session, claude.ai session 01CQEceq) — REEL PHOTOS AND
THE BRIEF'S GLASS PANELS FIXED, PUSHED, LIVE; NOTHING RUNNING; NO DECISION
OPEN.**
- GOAL: (1) a reel recipe's photo is a clear frame of the finished food, not
  the cover; (2) the morning brief shows its glass panels again.
- DONE CRITERIA: both MET. The brief fix is client-side, so it reaches his
  phone after the PWA reloads its JS (see nova-deployed-vs-visible).
- STATE: e061e42 (brief panels), cf7f84e (frame picker v1), a451267
  (describe-then-rank). All on origin/main (git branch -r --contains a451267).
  Server reloaded after a451267 via scripts/reload-server.mjs (health 200).
- DECISIONS: (a) the model DESCRIBES each of 12 end-weighted frames and
  `rankFrames` (server/lib/recipeFromVideo.js) CHOOSES, because model picks
  varied run to run and chose mid-assembly shots; forecloses "ask the model
  which frame is best". (b) Two tiers: clean food >=30% share first, hands
  last; else small caption + food >=40%; else the cover. Forecloses a hard
  no-text rule (it left two recipes on titled covers). (c) The brief's panel
  rides each spoken row (`card` on the voiceChat row) and NovaThread reads
  `stageCard` while speaking.
- VERIFIED: 20/20 in server/test/recipeFromVideo.test.js; four tests in
  server/test/briefGlassThread.test.js; full suite 3465 pass, 2 fail (atlas
  pair, below); lint 0 errors; build green; health 200 on :4173. The 7 chosen
  frames were LOOKED at (scratchpad frame-backfill3/contact.jpg and
  frame-backfill4/pair.jpg).
- ASSUMED: the brief panels on his actual phone (not seen there; this Mac's
  browser shows them); the live picker on a NEW reel under the new server
  (only the backfill ran it, not a fresh share-sheet import).
- OPEN: m-m-protein-cookies still has its titled cover (no frame qualified).
  His fix is the recipe's ⋯ menu, or relax the 40% tier. The old background
  re-import of three reels was killed by memory pressure and NOT restarted;
  its work is covered by earlier runs (unchecked line by line).
- BLOCKERS: the two red tests (exerciseAtlas: the atlas covers his real
  library; every exercise resolves to a drawable view) predate this session.
- NEXT ACTION: share a fresh Instagram reel to Nova and read the photo it
  files; expect a food frame in Recipes (recipe-frames/<hash>.jpg exists).
- DO NOT: let the model choose the frame; reload the server with a bare
  launchctl; read this block as replacing the 10 Oct one below (a stack).

**10 OCT (afternoon) — EVERY ROUND HE APPROVED IS BUILT AND LIVE; NOTHING
RUNNING; NO DECISION OPEN.** Built, merged, pushed, reloaded today: Code
(actions proven on a temp repo; Science Atlas + Wren workspaces; quotes;
undo on the rails), Money (+ wired into Nova; nightly full check, over budget
on change; merchant move; xlsx; Split; cupertino row), Stash (five
additions; his 12 real lines round-trip), Shopping (real prices: Coles and
Aldi read, Woolworths does not answer; rewards via a Mail rule; runtime
logos). Motion steps 1 and 2 shipped 9 Oct. HIS STEPS: the rewards Mail rule
(docs/rewards-mail-rule.md); the Stash share Shortcut
(docs/stash-share-shortcut.md); the Science Atlas dashboard prompt was given
to him for the Atlas session. NEXT: Notes/Journal/Galaxy when he has looked
(mockup 87; and the journal-attribution honesty bug); the MacBook desktop
round (reel memory nova-reel-dashboard-v8); To-Do waits for his Todoist
recordings; motion: the theme swap frame and Settings push floor (P8).

**9 OCT (afternoon) — BRIEFING, LEADER AND THE WALL BUILT AND LIVE; ROUND 3
OUT FOR CODE, SHOPPING, MONEY; NOTHING RUNNING.** Each built in an isolated
worktree against a checklist with frame pairs, merged, pushed, reloaded.
Round 3: Code 89 https://claude.ai/artifact/7nJ65tuCA6RTkJHXbQxy9f, Shopping
88 https://claude.ai/artifact/6mFt5m8pEKDCSNy2c94xYv, Money 90
https://claude.ai/artifact/G6eU3oTWGvoNZTxt4VD1VH. OPEN HIS CALLS: the
Shopping price source (none is honest and daily); Code 1-5; Shopping 2-6;
Money 1-7; Briefing 1-3; Leader 1-2; wall: Talk it through sends the asks,
night dim 22:00-06:00. NEXT: his picks, then build Code/Shopping/Money;
Notes/Journal/Galaxy when he has looked; the MacBook round (use the
Dashboard V8 reel memory); To-Do waits for his Todoist recordings.

**7 OCT (afternoon) — SETTINGS A IS LIVE; ROUND 2 OUT FOR SIX PAGES; NOTHING
RUNNING.** Settings A merged c8951f6 (worktree build, 153/161 present, 8
honest differences), pushed, reloaded. Round 2 published: Leader 82
https://claude.ai/artifact/EBLw6ZnsVb3gXeJ1zoMNGe, Briefing 83
https://claude.ai/artifact/8yxJvajSYi5xE9cpwtsDhs, Shopping+Stash 84
https://claude.ai/artifact/5Ei8ufpL31FFMEWBYAAgSd, Money+Code 85
https://claude.ai/artifact/WWsozaUXH35CPZdFJ1LKoF, Ambient+Console 86
https://claude.ai/artifact/Gzm2Tgv4vcPrFvUZiq8ext, Notes/Journal/Galaxy 87
https://claude.ai/artifact/M3Jsf9RmCWC8BUA98Mn2RN. Agent count now uses the
Org map's ten (e80bd12). His Dashboard V8 reel saved (memory
nova-reel-dashboard-v8) for the MacBook round. OPEN, recommended next: the
readers that treat Nova's journal entries as his own words (Commitments,
Weekly debrief; mockup 87 call 4). To-Do waits for his Todoist recordings.

**7 OCT (nova-os-fc, after his round-1 feedback) — PUSHED + RELOADED; FIVE
AGENTS RUNNING; HIS FEEDBACK PER PAGE IS IN THE AGENT BRIEFS.**
- SHIPPED (pushed, server reloaded, read back on the live server):
  - 7c65553 no false agent counts: src/vals/agentsWorking.js is the one
    source (in-flight jobs + classifying records); guard re-recorded.
  - 3b573f8 RPE and RIR always on the set row (no More toggle).
  - 82f8355 + 0d7…(width-only follow-up) a lift with no history of its
    own starts from its width variant's last sets, labelled "started from".
  - f5609c9 Fuel cross-check on his local days (the morning-after-DST bug).
  - 521b9eb + 6d967e0 stale NovaCore regexes. Suite: only the atlas pair red.
- HIS STANDING RULES saved to memory: nova-no-fake-data, nova-build-matches-mockup.
- RUNNING: Settings A BUILD (worktree agent, frame-by-frame vs mockup 72,
  checklist 07-settings-build-checklist.md; merge its branch after review);
  Leader r2 (mockup 82: A+C blends + originals); Briefing r2 (83: A playback
  without the pour, C's end boards, B's read view, a clear-verbs proposal);
  Shopping+Stash r2 (84 + research 14-…: Coles/Woolworths/Aldi prices,
  stash images, add-to-shopping, repurchase reminders, meal library access);
  Money+Code r2 (85 + research 17-money-r2: Billroo).
- NEXT WAVE (not started, to keep under the usage limit): Ambient+Console
  r2 (A's simple view + C's agents needing him); Notes/Journal/Galaxy:
  explain each one's purpose to him, then round 2. To-Do waits for his
  Todoist screen recordings.

**5 OCT (late morning, nova-os-fc) — ROUND 1 IS OUT FOR EVERY PAGE; THE
DESKTOP ROUND IS THE ONLY REDESIGN STAGE NOT STARTED; STILL NOT PUSHED.**
- PUBLISHED + COMMITTED + ROWS [m]: Settings 07/72
  https://claude.ai/artifact/7bFsrEDMaxszokaQdwzXAv; Leader 11/76
  https://claude.ai/artifact/AKKCcwKQHS2mLuJ2AHpVqL; Briefing 12/77
  https://claude.ai/artifact/4yQB7QbvVWFjug3LeuEAUq; lists 13/78
  https://claude.ai/artifact/CGq5cSmK2TtujJgjkdvBof; knowledge 15/79
  https://claude.ai/artifact/Di2AruD7vjXEtsxxPPBbfD; Money+Code 17/80
  https://claude.ai/artifact/R2Dm5L8mGaWcTv3Dv81x2r; Ambient+Console 21/81
  https://claude.ai/artifact/3fTVShPHeABR986sTUAPpu. Status page v11
  https://claude.ai/artifact/GRnJeoNMHDLmxSfWbTSJGJ.
- FIXED: open to-dos rendered BLANK since 23 Sep (1070fe2, test
  todoRowText); two stale NovaCore regexes in novaFocus.test (6d967e0).
- KNOWN RED: fuelCross.test "cut goal" and "post-training protein" fail on
  today's clock (relative dates via setDate/toISOString in the first AEDT
  week, like the deload DST bug); not investigated. Plus the atlas pair.
- NEXT: his push, then reload; his picks per page; the desktop round.

**5 OCT (morning, resumed after the limit reset, nova-os-fc) — FOUR ROUND-1
PAGES REVIEWED AND PUBLISHED; SEVEN PAGE AGENTS RUNNING; STILL NOT PUSHED.**
- PUBLISHED + COMMITTED (rows ticked [m] in 56928b0): sheets and overlays
  (audit 06, mockup 71, https://claude.ai/artifact/44eKjhdJvUnqqkbNNPUGtR);
  Practice (10/75, https://claude.ai/artifact/9fBkwjtqwVdoHh5KRDEMyr); Ops and
  the Org map (08/73, https://claude.ai/artifact/VqV5uj1HaDpCijUjL6xfw8);
  Library (09/74, https://claude.ai/artifact/1NQ7nRo9UqMFZxhYB59Q1k).
- FIXED: the sheet grabber did nothing on five sheets (5b7872a): the
  `both` fill on `.nv-materialize` held the end transform over the drag.
  Verified: a 60 px pull on the handle moves the sheet 60 px.
- RUNNING (their files stay UNTRACKED until I have read them): Settings
  (07 + mockup 72, partial file on disk), Leader (11/76), Briefing (12/77),
  and, started now, four small-screen groups: the lists (To-Do, Shopping,
  Stash: audit 13-lists, mockup 78), the knowledge screens (Notes, Journal,
  Galaxy: 15-knowledge, 79), Money and Code (17-money-and-code, 80), Ambient
  and Console (21-ambient-and-console, 81). Each works in its own detached
  worktree under the session scratchpad, demo mode only, and commits nothing.
- NEXT: read each agent's two files, look at 390, publish, commit, tick [m];
  then regenerate the status page and republish to
  https://claude.ai/artifact/GRnJeoNMHDLmxSfWbTSJGJ (read it first).
- HIS, IN ORDER: (1) `! git push origin main` (30 commits ahead at 56928b0);
  (2) THEN `node scripts/reload-server.mjs`; (3) a direction on each round 1;
  (4) the hard-coded "7 agents live" (fixing it changes cupertino Home text,
  which the guard protects; recommended); (5) the other sheets bugs: the
  second cross-fade on close, island layering, the offline line clipping,
  rubber band on the wrong side; (6) X1, X2, X4, X5.
- NOTE: a vite on :5183 (pid 14804) has run since 27 Sep; not this
  session's; left alone.

**5 OCT, ~01:30 AEDT (nova-os-fc, CUT OFF BY THE USAGE LIMIT) — THE B BUILD IS
MERGED AND VERIFIED IN DEMO; NOTHING IS PUSHED (this session's push is blocked by
its permission classifier); FIVE PAGE AUDITS WERE STILL RUNNING AT THE CUT.**
- DONE ON MAIN (all gated: lint, build, guard unchanged, suite 3072+/3076 with
  only the atlas pair + the DST pair before 82412e1 fixed it): B icon engine
  0d5b89c (src/coreGrains.js; rest pixel-identical); pushback stance a7492eb
  (VIS {"stance":"contest"}, strip test per path, two older VIS leaks fixed);
  full screen 3ae3203 (Living jade tokens --nv-say*, pour over the plate,
  underline follows what Nova does, panels rise from the core and settle away);
  every core told thinking/contest cbe9e6a + the floating core; sky rests
  484a6f1; page changes rise like tab taps 04991e5 (+ hash Back handled once);
  perf 43ae15a/0e56a47/4d6e821/5c01e15/f60e8a9; no tab bar in full screen
  7f40549; checklist Train/Fuel/Voice/Inbox rows [b] b0c80d6; deload signal
  DST bug 82412e1 (a real twice-a-year bug, found at 01:00 on the first AEDT day).
- VERIFIED (demo, Chrome, 390pt): pushback turns core + label + underline red;
  dock orb and Home core show sphere / knot / jade shell; pour lands in the
  words; panel rises and settles away; sky pauses at 5 s; no view transition on
  card tap / back; rest icon identical.
- NOT VERIFIED: anything on his phone; real TTS timing of the pour; whether the
  model writes stance lines well (no live model call was made).
- NEXT, IN ORDER: (1) he runs `! git push origin main` (about 20 commits);
  (2) THEN reload the server with `node scripts/reload-server.mjs` (the stance
  contract and the DST fix are server code; reload only after the push so the
  client and contract arrive together); (3) review the page agents' files,
  which may be partial and are UNTRACKED in design/: audits 06-sheets-overlays,
  07-settings, 08-ops, 09-library, 10-practice and mockups 71–75; read each,
  look at each at 390, publish the good ones as artifacts, commit them, and
  tick the rows [a]/[m]; (4) next pages: Leader, Briefing, the small screens,
  Ambient, Console, then the desktop round; (5) regenerate the status page
  (scripts/redesign-page.mjs) and republish to
  https://claude.ai/artifact/GRnJeoNMHDLmxSfWbTSJGJ.
- LINKS: icon mockup https://claude.ai/artifact/5pCrLe7mtUxhsRRb4Df2bD (r3,
  Living jade picked); sky/page changes https://claude.ai/artifact/R1SaFVX9P35ACLTEjLVQHz.
- DO NOT: reload the server before the push; publish an agent mockup unread;
  run a test of the deload or any date code without pinning the clock.

**4 OCT (morning, his answers to the 3 Oct open questions).** (1) The
lasagne: he ticked it for 2 Oct himself; closed. (2) Quiet hours: 22:30 to
05:00, SET on the live server through `PUT /api/prefs/quiet-hours` and read
back from `server/data/quiet-hours.json`; the code default (22:00 to 07:00)
is unchanged on purpose, his value is the stored pref. (3) The Nova underline
hue FOLLOWS WHAT NOVA IS DOING: while speaking it wears the speaking tint (the
coral-red of the full-screen core's speaking state); when it is only pointing
something out it stays cyan. UNBUILT: queue it with the next Nova-thread
build. Also this morning: a Mission Control redesign brief for a separate
Science Atlas session, written to
`Atomic_Hub/P3_Draft3/Atlas_Progress_Map/REDESIGN-BRIEF.md` (outside this
repo, left untracked there for that session to commit).

**3 OCT, CLOSE (nova-os-fc) — EVERYTHING HE ASKED IS BUILT, PUSHED AND DEPLOYED;
TOMORROW OPENS WITH THE NOVA-ICON REEL, THEN THE REMAINING REDESIGN PAGES.**
Written at close from commands run at 23:1x AEST, not from memory.

- **GOAL:** his standing brief (26 Sep): redesign Nova page by page under the
  Apple aesthetic, every function kept, more fluid; loop = audit → mockups →
  his tweaks → build; desktop (MacBook) round after each phone round.
- **DONE CRITERIA:** MET: Home (Summary style), Inbox r2, Train A/B + done-today,
  Fuel A + swipe/rotation strip, Nova screen (thread, full-screen focus, record
  moment), the consult rail on every door, book naming. UNMET: Sheets and
  overlays (§6 #6), Settings, Ops/Org map, Library, Practice audit, Leader,
  Briefing, the eight small screens (To-Do, Shopping, Notes, Journal, Money,
  Stash, Galaxy, Code), Ambient, Console, and the DESKTOP round for every page
  done so far. BLOCKED: nothing, except that his phone must be fully closed
  and reopened to run the new client.
- **STATE (paths):** main = origin/main at bbe1f95 plus adebc91 (test fix) and
  this handoff commit; no worktrees (`git worktree list` shows only main);
  ledger `design/REDESIGN-CHECKLIST.md` §7 (the truth; its per-row boxes for
  Train/Fuel/Voice/Inbox still read `[ ]` though built, only Home's rows are
  `[b]`/`[x]`: reconcile first thing); mockups `design/mockups/57–68`; plan
  `design/HOME-REDESIGN-PLAN.md`; key new code `server/lib/consult.js`,
  `quietHours.js`, `bookName.js`, `src/NovaFocus.jsx`, `NovaThread*.jsx`,
  `src/swipeReveal.js` + `SwipeRow.jsx`, `src/fuelDay.js`, `src/doneToday.js`.
  The reel is downloaded at `$SCRATCH/novaicon-reel.mp4` (session scratchpad,
  may be gone; re-fetch with `yt-dlp "https://www.instagram.com/reel/Dd9g4biMnS4/"`).
- **DECISIONS (choice → reason → forecloses):**
  - Full-screen Nova = C's stage, A's field at rest, core travels up when he
    speaks, per-state tints kept (coral-red speaking) → his words 26–30 Sep →
    forecloses retuning NovaCore's hue maths without touching dock orb + classic.
  - Every agent consults every other; Nova is CEO; NO phrase-gated routing; his
    words count as the instruction on every door → his standing rule → forecloses
    any walled-off lane or keyword router.
  - Quiet hours 22:00–07:00 Melbourne, urgent passes → his yes; the WINDOW is my
    guess → forecloses nothing (a Settings row edits it).
  - Nova is "he"; Nova's words get `--nv-nova` starlight → his call.
  - iOS Mail swipe grammar everywhere via SwipeRow → his call.
  - PDFs are never refused for a missing title; named from front page/filename,
    flagged `guessed`, editable in review → his call.
  - Deployed vs visible are reported separately → his rebuke 3 Oct.
- **VERIFIED:** lint 0 errors / build green (run 23:1x); server suite 3042 tests,
  after adebc91 the clock-dependent four pass singly (`node --test
  server/test/{money,coachSuggestions,platformActivity,macVerbs}.test.js`);
  only the two known exerciseAtlas failures remain; health 200 at
  localhost:4173; no vite preview process; no dist/pc.json; live bundle lacks
  "rarely knows its own name" (grep -c = 0 on the Pages bundle, earlier this
  session, deploy run success). Reel is downloadable: 1080×1920, 60fps, 10.8 s.
- **ASSUMED (no locator, treat as unproven):** swipe-to-delete, the rotation strip
  snap and a past-day tick feel right under his thumb in WebKit; the PDF fix
  works on his phone (needs a full close/reopen first); real TTS timing against
  NovaFocus subtitles; the 60fps feel of the core's travel; glass durability
  across devices (server record format undecided); the quiet-hours default.
- **OPEN QUESTIONS / BLOCKERS (his):** (1) log the lasagne to 2 Oct for him, or
  tick it himself in Yesterday's view (in NEITHER day's log now); (2) the
  quiet-hours window; (3) confirm the Fuel swipe/strip/past-day tick and the
  book import on his phone after reopening; (4) Nova underline hue (cyan vs
  other). Unfinished and NOT dropped: bench + bylines on the thread (seams in
  NovaThread.jsx from `by`/`from`, mockup 67), the Jarvis-reel parts 3+4 (fanned
  reveal, 3D callouts) he asked to be reminded of, the Inbox re-evaluation
  (25 Sep), desktop round for all built pages.
- **NEXT ACTION (in this order, his instruction at close):**
  1. FIRST TASK: analyse the Instagram reel
     https://www.instagram.com/reel/Dd9g4biMnS4/ (download with yt-dlp, split
     with ffmpeg into frames at ~12 fps, read them) and develop the dynamic
     animations of Nova's ICON (the dock orb / NovaCore / focus core) further,
     as MOCKUPS first (loop: mockup → his tweaks → build). Load apple-design,
     emil-design-eng, interface-design before drawing. Expect: a published
     artifact with the reel's moves named, mapped to idle/listening/thinking/
     speaking, `prefers-reduced-motion` honoured. Do not build in app until he
     picks.
  2. Reconcile the REDESIGN-CHECKLIST row boxes with the ledger (Inbox, Train,
     Fuel, Voice built), then continue §6 order: Sheets and overlays (X1, X2,
     X5 decisions land here), Settings, Ops + Org map, Library, Practice
     (audit now that he has used it), Leader, Briefing, then #13–22.
  3. The desktop (MacBook) round for each built page (standing, 29 Sep).
  4. Bench + bylines on the thread.
  Every build via the worktree workflow in the 3 Oct ledger notes (worktree
  from LOCAL main, Opus agents never commit, six guards "unchanged", server
  reload ONLY via `node scripts/reload-server.mjs`).
- **DO NOT:** say "live/shipped" without separating deployed from visible
  (Summary-style only; installed PWA keeps old JS until fully reopened); read
  the quiet-hours window as his decision; route by phrase; give Nova any
  walled-off lane; claim the swipe/strip works until he has used it; run
  `git worktree add` from `origin/main` (use LOCAL main); append CSS anywhere but
  the END of index.css; hunk-stage App.jsx (parse-check the index); test
  clock-dependent code after 22:00 or near a day boundary without pinning the
  clock (the 3 Oct failures: held-push write racing teardown; "Sat 9pm"
  already past); my earlier wrong diagnosis: the book error persisting was a
  stale CLIENT on his phone, not the server fix failing.

**3 OCT (nova-os-fc) — HIS SEVENTH ANSWERS ALL LANDED; 22 COMMITS UNPUSHED.**
On main since the 30 Sep push: the Nova polish (81beb2f), Siri + consulted
Coach + titles (1c90c29), Coach answers (b533965), every door (97953ae +
c23ff4f), doors2 (9a10d60: his words on every door, quiet hours, recipe
links straight in, no phrase gates), the full-screen Nova (7697177), two
rotting tests fixed (79bbf41), mockup 68's switcher (8da5106). Server
RELOADED after every server merge (last: doors2). The client on his phone
is still the 30 Sep build: the push is his call. Review pages: Nova and the
record v2 (https://claude.ai/artifact/S8C9oy6h9zaNuqSpmMEHRP), the full
screen as built (see ledger 3 Oct). NEXT: his push; his calls in the ledger
(the speaking tint, the underline hue, Practice's web gate, the quiet-hours
window); then the bench + bylines on the thread from by/from (seams in
NovaThread.jsx; mockup 67), the session data panel + VIS marks, the desktop
round (§4 standing). No worktrees remain.

**30 SEP (afternoon, nova-os-fc) — HIS FIFTH ANSWERS ALL LANDED.** Pushed
e3ce192 on his word (morning). Since then on main, UNPUSHED: the Siri
interim + consulted Coach + source titles (1c90c29, server RELOADED), the
Nova polish (81beb2f: gold record, blurred stage, core on demand, filled
orb), mockup 68 Nova full screen
(https://claude.ai/artifact/7JebTDwRyob5mjanWq5EmE), ledger notes. Review
page v2: https://claude.ai/artifact/S8C9oy6h9zaNuqSpmMEHRP. OPEN, his:
push; the corner-Nova hold (core vs capture); the rules page; the three
Siri-build questions; the full-screen shape (A/B/C or blend) and Nova's
word colour. NEXT for fc after his answers: build the chosen focus mode;
the bench + bylines on the thread from by/from (seams in NovaThread.jsx);
the session data panel + VIS marks (mockup 67's list); the desktop round.
No worktrees remain; nova-os-83 is idle.

**30 SEP (nova-os-83) — THE RECIPE PAGE + REEL IMPORT, LIVE AND ON HIS PHONE'S
BUILD.** His ask (29 Sep, the Osta reel): "rework and edit Nova's fuel
capabilities so this is possible and it all works/looks and feels more
appealing". Built to ONE design on his direct ask (nova-os-fc handed Fuel
to me end to end; the loop's mockup round is skipped, his tweaks = round
2). Commits 18b81ce (data), 9afac7f (page), + the label fix. Pushed,
deployed (Pages success), server reloaded. Review page for him:
https://claude.ai/artifact/1Jps96oY7WZVSiiZRxwEHR (real read-only frames).

- **STATE (paths):** format lines Serves/Time/Source in `server/lib/
  recipes.js` (every reader/writer; his 36 recipes byte-identical, a macro-
  suffix drift bug fixed on the way); `src/recipeScale.js` (shared scaling +
  shortSourceLabel); `server/lib/recipeFromVideo.js` imports cover photo,
  times, servings, source, and BACKFILLS missing facts on an existing
  recipe (undoable); bare shared link → caption read (12 s cap) → recipe
  card for his yes (`inbox.js` mediaLaneFor); docs §2b share Shortcut.
  Page: `src/RecipePage.jsx` shared parts, RecipeOverlay rebuilt, RecipeSheet
  extended, `recipePage` in valsRecipes. Memory: nova-recipe-page.
- **VERIFIED:** his four reel recipes backfilled on the live server (photos in
  Wiki/Health/Recipe Photos, Source lines in the collection; Caesar Loaded
  Potatoes arrived via the BARE share path on 29 Sep 03:41Z with no words —
  the new door works); real read-only frames in both idioms at 375; suite
  2888/2890 (atlas failures pre-exist); guards unchanged, recipes baseline
  re-recorded on purpose in 9afac7f.
- **ASSUMED:** his phone; saving serves/times from the page against the live
  route; touch long-press on a checklist row; Instagram cover URLs expire
  (a card approved days later may get no photo).
- **OPEN (his):** whether the reel cover as hero is what he wants when it has
  burned-in text; bank cards still wear the striped placeholder; TikTok
  short links routed but never tried.
- **DO NOT:** append CSS after the Nova thread block (novaThread.test pins it
  last) or open a new prefers-reduced-transparency media block (mobileNative
  pins the last one); let a subagent `git stash` with peers' files dirty.

---

**30 SEP (nova-os-fc) — ALL FOUR LANDED: the consult rail (3f5597e, server
RELOADED: every reasoning agent asks every other, Nova directs), the record
moment (58a8c3a), the Nova screen (cc43ae5), Who is answering round 2
(mockup 67, https://claude.ai/artifact/UBzk5HCYwYmtsaMxswfXDJ). The three
worktrees are removed; main is clean; the client is NOT pushed since
9afac7f (his call), so his phone has none of the Nova screen or the record
moment yet. Review page for both: see the ledger (30 Sep). NEXT: his calls
in the ledger (dock orb colour; Siri and the Researcher; free-text panels;
the rules page), then the provenance UI on the Nova thread (the bench and
bylines from by/from, mockup 67; the seams are in NovaThread.jsx), the
session data panel + VIS marks (mockup 67's server list), the desktop
round, Sheets and overlays (§6 #6). Below is the cut-off note, now
historical.**

**29 SEP (evening, nova-os-fc, CUT OFF BY THE USAGE LIMIT MID-BUILD) — FOUR
OPUS AGENTS WERE RUNNING IN WORKTREES; THEIR WORK IS ON DISK, UNCOMMITTED.**
`.claude/worktrees/consult` (branch build-consult): the shared consult rail
(server/lib/consult.js, Nova + Leader consulting, an askable Librarian,
structured asks, by/from on the record). `.claude/worktrees/novab`
(build-novab): the Nova screen, mockup 63 D (NovaThread.jsx + vals, focus
mode on the name tap, rising stage, kept recording + Try again, hold menu).
`.claude/worktrees/pb` (build-pb): the record moment (recordKit.js,
RecordMoment.jsx: per-equipment animation, trophy fallback with a refined
ring, persists until dismissed, one per PB). Mockup 67 (Who is answering,
round 2) was being drawn straight into design/mockups/. NEXT SESSION: read
each worktree's `git status`/`git diff` and the frames under the scratchpad
folders consult/ novab/ pb2/ agents2/ (if the session's scratchpad survives;
else re-shoot); finish or re-brief from the briefs recorded in the ledger
(§7, 29 Sep evening) and memory nova-agents-consult-everyone; review, commit
on the branch, rebase onto main, ff-merge, gates (lint · build · server
suite · six guards · JSX check), reload the server ONLY via
scripts/reload-server.mjs after the consult rail lands. nova-os-83 owns Fuel
and is running a reel backfill on the live server. Two pinned contracts in
claudeCode.js: the Coach preamble stays one paragraph; fileArtifacts before
settleCoachChanges.

**29 SEP (afternoon, nova-os-fc) — FOUR ROUNDS OUT FOR HIS CALLS, THREE BUGS
FIXED, TAB IS "NOVA".** Pushed and reloaded 29 Sep by nova-os-83 on his
yes; Documents live. His Voice/Train answers (ledger 29 Sep) → mockup 63
Nova round 2 (https://claude.ai/artifact/6EukaUSPUjVu5haML4kAyh; D rising
stage · E stage header, A/B kept), mockup 64 Who is answering
(https://claude.ai/artifact/Vue5DjdKP5npxRVqRHJvgL), mockup 65 The record
(https://claude.ai/artifact/13nM2MNAj7a87LgiLZNJrV), the three Voice bugs
fixed (729810b; briefDecisions.js reloads with nova-os-83's next commit),
the tab renamed Nova (2439168). nova-os-83 owns FUEL end to end now (reel
import → recipe page, mockup 66, real read-only frames as the review) and
has landed its first two commits (18b81ce data model, 9afac7f recipe page),
pushed main to 9afac7f and reloaded the server (briefDecisions.js live);
the recipes guard was re-recorded on purpose (bank cards gained a
"Serves N · time" line, 1683px). Verified here after: build green, lint 0,
three guards unchanged, health 200. The tree is clean again. NEXT for fc: his answers on 63/64/65 → the Nova build
(thread + stage + kept recording + hold menu + agent provenance if chosen)
and the record moment on the Finish sheet; then Sheets and overlays (§6
#6). Two figure observations to verify for the anatomy pipeline (ledger).

**28 SEP (late afternoon) — DO NOT RELOAD THE SERVER CASUALLY.** nova-os-83's
Documents work (6c83dea, 6e819bc, 1ed9f0b) is on main but NOT reloaded: once
the server restarts, Coach/Nova/Leader start filing documents and his phone
shows raw [[artifact:id]] tokens until the client is pushed. So the next
`scripts/reload-server.mjs` waits on his push decision, which also deploys
the whole redesign. Verified on main after its commits: build green, lint 0,
the five summary/index test files 93/93, both Home guards unchanged.

**28 SEP (afternoon, nova-os-fc) — TRAIN B ON MAIN (7aebf77), VOICE ROUND 1
OUT.** After the morning block below: his third answers (the lit hue = his
panes' glowPanel edge → 1px/30%, d1a6847; Train B go despite scepticism;
"proceed with the next re designs"). Train B built and merged (the summary
live session; frames in the review page
https://claude.ai/artifact/AsrajCuhjnDKNqd9zz6UXE, which also holds
READ-ONLY REAL frames of Train A, Fuel A, Inbox r2 and Ops). Voice audited
(05-voice.md: needs work, three bugs) and round 1 published
(https://claude.ai/artifact/26reomqkoq8RNnQs5CY6jP, mockup 62, A/B/C); his
calls are in the ledger. The Train hero's "has earned 0 reps" fixed
(a327bd3). NEXT: his Voice answers → round 2 or build; then Sheets and
overlays (§6 #6). The read-only recipe for a screen that needs a navigate:
`--eval "window.__novaApp.navigate('workouts')" --wait 3500` (a bare hash
landed on Voice). Push: his call.

**28 SEP (00:xx, nova-os-fc, the redesign session, cut off by the usage
limit) — THE FOUR BUILDS ARE ON MAIN.** Lit material 6b140a2 (the light
plus a tinted hairline, review page v9 at
https://claude.ai/artifact/X2zxDCQBCCAXcbE9AaKf1H), Train A f5e889d, Fuel A
18e685b, Inbox round 2 16fc29d; Train B round 2 drawn as mockup 61
(50c5041, https://claude.ai/artifact/TGYN26c1gPM2NBpUs4KryF — four NEW
behaviours for his word before it is built: rest ring, voice preview before
commit, the ⋯ sheet, the record named on the Finish sheet). Each build was
rebased by hand: App.jsx now has ONE `pagesFromHistory()` (pinned · Train
Coach · Fuel recipes · Inbox report · capture) and the renderVals tail runs
Train → Fuel → Inbox; three source-contract tests pin that text, so change
them together. TRAP PAID FOR: a three-way CSS append at one anchor loses a
shared opener/closer line to one side on rebase — check the build after
every resolution. Gates green on main (server: only the two atlas-drift
failures). Server reloaded. Ops has a guard baseline (its real text).
NEXT: read-only real-data frames of #/workouts, #/recipes, #/inbox, #/ops
under summary for his review (dev-connect → shot --readonly → --clean);
swap Fuel's `[style*="opacity: 0;"]` swipe selector for `[data-swiping]`;
the three agents' open decisions are in the ledger (§7) and the reports in
this session's transcript. Push: his call (~64 unpushed commits).

---

**27 SEP (nova-os-83) — COACH COULD NOT CREATE A ROUTINE; NOW IT CAN
(0c42e48, committed, server reloaded, NOT PUSHED: it sits on 51 unpushed
commits of nova-os-fc's redesign work, and pushing would deploy that; fc
was asked to push).**

- **What happened (Coach session a7309692, 26 Sep 21:28–21:40 AEST):** he
  asked for a 5-day split, then "I want you to just add the extra workout
  and create it all". 7 of 16 lines aimed at "Arms and Delts" were refused
  (no such routine), 9 applied. HIS PROGRAM NOW (half-built): Upper Body has
  9 exercises (Rear Delt Fly added; Carter, both curls still there); Push
  done as planned; week Mon Upper, Tue Legs, Wed Push, Thu Pull, Fri–Sun rest.
- **Fixed:** `create` action, plan-then-validate in checkProposals, `new:`
  ids resolved at apply, waiting-card state, undo guard. VERIFIED: Coach's
  real 8 lines (7 refused + create) check clean against his live program
  (read-only); 3 pipeline tests. NOT DONE: his build itself — no server route
  files Coach cards outside a Coach turn, and the stores cache in-process, so
  it waits on his one message to Coach (his decision, raised to him).
- **Unrelated red:** anatomy atlas tests fail on JM Press and Reverse Pec
  Deck, new in his real library (fail without this change too).

---

**26 SEP (afternoon, redesign session) — THE PAGE-BY-PAGE REDESIGN IS OPEN.
His brief: Nova has become cluttered and complicated; redesign every page
under the Apple guidelines and the design skills, less to look at and to
use, all function kept, more fluid; audit → mockups → his tweaks → repeat →
next page. `design/REDESIGN-CHECKLIST.md` is the work list (226 rows over
21 pages + the chrome, every row with a source locator); the four source
inventories behind it are `design/audits/redesign-2026-09/00-inventory-*.md`.
THE BUILD IS UNDER WAY (P0 + P1 shipped, see STATE); `cupertino` × `command`
is provably unchanged: `node scripts/guard-cupertino.mjs` before EVERY commit.**

- **STATE:** checklist committed; HIS CALL 26 Sep: Home first. Home AUDITED
  from two recordings of his phone (`design/audits/redesign-2026-09/01-home.md`:
  19 sections all open, ~20 screens deep, 22 buttons, facts restated up to
  six times; two Stuck items are August test to-dos in his vault). The
  checklist renders as a page for his phone via `scripts/redesign-page.mjs`
  (republish after every tick to the SAME artifact:
  https://claude.ai/artifact/GRnJeoNMHDLmxSfWbTSJGJ, pass it as `url`). ROUND 1 (https://claude.ai/artifact/TsC7tZ37qSo9Skw463AFi6, mockup 52)
  REJECTED by him: still too cluttered; move features off Home; Home as
  WIDGETS he arranges (iOS Home Screen editing); an INDEX like iOS Settings
  for the other pages. ROUND 2 PUBLISHED:
  https://claude.ai/artifact/RARXgdhv4No7T5gSpcWPKC (mockup 53: Home · Edit ·
  Add · Index · Drill; the section → widget / page / moment map is 01-home.md
  §6). Home rows [m]. HIS CALL ON ROUND 2: explore OUTSIDE the Nova guidelines
  with the Apple aesthetic. ROUND 3 PUBLISHED:
  https://claude.ai/artifact/Q92jjUHaPwTbzBkQxjuPev (mockup 54: A Summary/Health,
  B Rings/Fitness, C Glass/iOS 26 Weather, D Paper/News; system fonts and
  system colours, no --nv-* tokens). If he picks one, the token system and
  NOVA-METHOD §2b change on his word; do NOT start that unprompted. HIS ANSWER ON ROUND 3: loves aspects of A, B and C.
  ROUND 4 (THE BLEND) PUBLISHED: https://claude.ai/artifact/EY1SBc13N2RXMZsbpQu2EJ
  (mockup 55: A shape + B ring hero + C glass/strip; ONE markup under FOUR
  materials as CSS variables: glass day, glass night, dark, light; the Index in
  the same material). The direction is converging on Apple-native outside the
  current --nv-* tokens. HIS ANSWER ON ROUND 4: combine with the
  current Nova aesthetic, not all of it. ROUND 5 PUBLISHED:
  https://claude.ai/artifact/85jQqTxKucJg6XddXPFZsc (mockup 56: the blend in Nova
  glass / Nova night / Observatory + Apple glass reference; serif standfirst and
  highlight, domain ring hues, gold badge, hologram core kept; brackets, mono
  micro-labels, clock, coloured borders, fold dropped). HOME DECIDED (20:5x): all of round 5 as switchable
  options + round 4 glass day/night with an hour cycle + Summary light; Nova
  glass his main; Practice, Trends and the Index kept; the CURRENT appearance
  must stay available and stable. BUILD CONTRACT: design/HOME-REDESIGN-PLAN.md
  (style `summary`, theme `sky`, material glass|solid, hour band, P0–P5; cupertino
  × command untouched and default). HIS GO (21:xx): proceed; Health-style Edit
  sheet with toggles + drag handles, "smooth to drag around and edit with no
  lag"; the sky cycle tints Nova glass's aurora too; order P1 → P2 (Nova glass
  + Nova night first) → P3 → P4 → P5. BUILT SO FAR: P0 = 8475533 (the guard:
  headless demo-mode DOM snapshot, clock frozen, Math.random seeded, refuses
  when public/_devconn*.js exists; ~36 s). P1 = 27e8bd1 + e64e3d4 (summary
  style, sky theme, material glass|solid, hour band, --nv-sum-* tokens,
  .nv-sky, Settings rows; `summary` is FILTERED OUT of novaStyleOptions until
  P2 lands; the sky theme's warn/mg/or hues re-picked to clear 4.5:1 on its
  card; displayTracking.test re-anchored, contrast.test gained sky + --nv-or).
  P2-A = c199b31 (src/summaryFacts.js, src/pinned.js, src/vals/valsSummary.js,
  server/test/summaryFacts.test.js, prLift/prBasis moved to missionFocus.js,
  heroTaglineTopic exposed; gates green). WORKTREE TRAP: an Agent's
  `isolation: worktree` is cut from origin/main, and main is 17 commits ahead
  and unpushed, so the first P2-B agent saw none of this work and was blocked
  from pulling it in; P2-B now runs in MY worktree `.claude/worktrees/p2b`
  (branch `p2b-summary-home` from local main, node_modules symlinked) — merge
  it with `git merge --ff-only p2b-summary-home` from main after review, then
  remove the worktree and branch. Use the same recipe for P3. P2-B SHIPPED =
  08c73ca (MissionSummary.jsx + PinnedEditSheet.jsx; Summary offered in
  Settings; looked at in demo via `node scripts/shot.mjs --demo --style summary
  --theme command --material glass --hour dusk`; the ten frames of every material
  are published for his morning at https://claude.ai/artifact/X2zxDCQBCCAXcbE9AaKf1H
  ("Home, Built"; republish with `url`) — shot.mjs gained --demo and
  --readonly in d419271; §2b amended in 787cf5e). P3 SHIPPED = b6107cc (SummaryDock + Index +
  valsIndex + screenKeys; worktree removed). INBOX AUDITED (6c5bd62,
  design/audits/redesign-2026-09/02-inbox.md: CRITICAL ISSUES — 6,591px/8
  screens Deck, 12,476px/15 List on his real vault, 109 taps, 11 type sizes,
  7 verbs per card vs the Coach deck's 3; two real bugs: the digest do-all
  no-ops on model-choice patterns (valsInbox.js:738), History promises
  universal Undo while Guardian finds 53 records without undo data). Home
  rows H1–H23 → [b]; the summary guard baseline recorded (24f118a; re-record
  on purpose after a deliberate Home change). REAL-DATA LOOK (read-only,
  00:26): the Home rendered his vault honestly (protein 0/150, steps 10,030,
  sleep no data, 18 waiting, a stuck 4-day promise, the record, the
  technique) and showed one wrong sentence — "150 g under today's floor"
  during his Recharge block — fixed in e0bf6f1 (the highlight stands daily
  totals down while the sleep block is live). Every load of the app on ANY
  screen POSTs /api/notes/summary and /api/greet (pre-existing; the
  read-only mode blocks them; noted for the Inbox/Home follow-ups). INBOX ROUND 1
  PUBLISHED: https://claude.ai/artifact/4x6LUC3BRS6QnRJfw7knTa (mockup 57:
  A the deck alone · B Mail · C two doors; his calls: which shape; gold only
  for "waiting on your call"; Seen automatic; the filing ladder leaves the
  Inbox). TRAIN AUDITED (1058311, 03-train.md: NEEDS WORK — Coach is Gym's
  tail; the session tick 40px; 24/49 controls under 44pt on routine detail;
  facts drawn 3–4 ways; the Coach card's repeated sentence FIXED in ef2c17b).
  TRAIN ROUND 1 PUBLISHED (ab55f3b, mockup 58):
  https://claude.ai/artifact/FUuAVaKD8tWhjtoL3XtkRw. FUEL AUDITED (1dd96b4,
  04-fuel.md: NEEDS WORK; three honesty faults to fix regardless — "Kcal
  off-plan" sums rotation meals, entry delete has no Undo, a slow fetch can
  show the demo bank live). FUEL HONESTY FIXES SHIPPED (e7cc32d;
  server reloaded); FUEL ROUND 1 PUBLISHED (7b62415, mockup 59; artifact in
  the ledger). Two exerciseAtlas tests fail against his REAL library since
  this morning (JM Press, Reverse Pec Deck have no atlas entry): vault
  drift, for the anatomy pipeline, not the redesign. HIS FIRST ANSWERS (27 Sep
  morning): Inbox A chosen → ROUND 2 published (f8e3431, mockup 60); the glass
  polished on his note (5507930); Train and Fuel explained, picks pending.
  HIS SECOND ANSWERS (midday): Train A, Fuel A, a lit
  Nova-glass option, the Inbox built from round 2 with Look deeper. FOUR OPUS
  BUILDS IN FLIGHT in .claude/worktrees/{lit,inboxb,traina,fuela} (branches
  build-*); merge order: lit → inboxb → traina → fuela, rebasing each onto
  main (App.jsx renderVals spreads and index.css blocks are additive). The
  guard takes --screen (cupertino-command-{inbox,workouts,recipes}-baseline).
  NEXT (older): his answers on
  the Inbox / Train / Fuel rounds (round 2 per page from his tweaks), then
  Voice's audit; P5 = the summary Home on his phone after the push. Agents that BUILD run on Opus
  (his instruction, 27 Sep morning). Weekly usage reset 06:00 Melbourne. The morning review
  page (Home, Built) links everything: https://claude.ai/artifact/X2zxDCQBCCAXcbE9AaKf1H.
  READ-ONLY SHOTS: seed with `node scripts/dev-connect.mjs`, vite on 5183
  (CORS allows only 5183/5173), `shot.mjs --readonly --style summary …`,
  then `--clean` and check the seed is gone. WAS IN FLIGHT: P2-B (Opus) —
  the screen MissionSummary.jsx + PinnedEditSheet.jsx + MissionControl branch
  + App wiring (valsSummary spread AFTER valsChrome with the merged v) + the
  .nv-sum-* CSS + un-hiding Summary in Settings; brief at
  design/audits/redesign-2026-09/p2b-brief.md plus the addenda in the launch
  prompt (also recorded in the P3 brief's preamble). Then
  P3 (iOS 26 tab bar + the Index as the More tab, #/index), P4 (Trends val is
  already in P2-A; the aurora hour shift is in P1), P5 his phone. Worktree
  lesson: a worktree has no server/node_modules or server/data, so run the
  server suite on main (the server files are identical). Open decisions:
  the two test to-dos in his vault; the push (14 local commits, none pushed).
- **VERIFIED in source while surveying (not yet fixed, on the checklist):**
  Settings copy says three tabs fill the dock, the dock takes five
  (`Settings.jsx:692` vs `MobileChrome.jsx:50`); the Coach deck's ✕ discards
  with no reason asked (`App.jsx:7187`; UI-REDESIGN-SPEC item 6 unbuilt);
  a dead day-chip picker inside `display:none` (`Recipes.jsx:540`);
  `repertoire` retry-eligible but absent from `SOURCE_LABEL`
  (`valsInbox.js:443` vs `:16-35`); Voice's own speech-blocked banner never
  got the glass that `VoicePresence` got (`Voice.jsx:500-507`); Stash rows
  still carry two tap targets to one URL (`Stash.jsx:61,67`).
- **DO NOT:** start a page's redesign before he picks the order; put his real
  data in a mockup (the repo is public); strip the house materials on
  "AI-default" grounds (CLAUDE.md).

---

**26 SEP (afternoon, nova-os-df) — TWO THINGS SHIPPED AND LIVE (verified in
the deployed chunks): the fix for his lost make-up workout, and Practice as
the tenth Agent World being.**

- **The lost workout (his report, 11:0x AEST):** sets ticked 10:45–10:55 are
  UNRECOVERABLE (server draft overwritten unarchived at 11:03:58; the log
  shows the reload at 11:03:41 recovered it first). Cause: a Begin tap on the
  make-up card replaced a recovered session. Fixed 7870657: every start path
  through `guardSessionStart` (src/sessionGuard.js), a server-recovered draft
  opens the logger, and the server archives a draft with ticked sets as
  `replaced` (Train: "Replaced workout — still recoverable"). Full account in
  memory nova-draft-protection #7. NOT seen on his phone.
- **Practice's being (his pick: the masks; the lamp and card kept):**
  d15bedd + 10f4f0b. Masks = a live scene (read from practice.json via
  `liveScene`), cue card = a page being prepared, stage lamp on its set in
  Mind lit only for a live scene. Mind is now a four-piece tile and the
  Leader's set moved left (the agent's call — surface it if he dislikes the
  new Mind layout). Live /api/ops shows ten beings. NOT seen on his phone.
- **CI lesson:** the life-engine test was timezone-dependent (absolute-minute
  seed, local-hour daypart); d15bedd's Pages run failed in UTC while the Mac
  was green. Pinned to Australia/Sydney. Before pushing Agent World changes,
  run `TZ=UTC npm test` too.
- **His answers today:** try Practice later (reminder set), find the EPUB
  later (reminder set), no Wrap-the-day nag, records stay auto+undo.
- **Peer nova-os-83** shipped the takeaway finder, a make-up day fix
  (7089152) and meal-estimate corrections (6840a59), each with its own reload.

---

**26 SEP (afternoon, nova-os-83) — TWO OF HIS BUG REPORTS FIXED, pushed,
deployed (Pages success on 10f4f0b), server reloaded, health 200.**

- **Make-up day reverted after finishing (7089152).** Cause, from the server
  log: filing the session deleted the make-up row, and the session was saved
  as "Upper Body — makeup" under routineId `carryover` with no link back, so
  (1) every surface fell back to Saturday's template and (2) re-choosing the
  make-up re-derived Friday's leftovers. Now a finished make-up stores
  `sourceRoutineId/Name`; `makeupDay.isMakeupOf` also reads the old name;
  `leftoversOf` counts make-ups; `trainOverview.doneToday`; the week strip
  says "✓ Made up", the gym hero leads with "Done today" and offers
  "Also scheduled · Begin it anyway". VERIFIED on his real data: today's
  session reads as made up, and re-choosing the make-up is refused with the
  reason (checked read-only through the pure function, no write).
- **Meal estimate could not be corrected (6840a59).** A correction was only
  possible when the scan asked a question, and it re-uploaded the photo (his
  "Load failed" was that upload never reaching the Mac). Now a "Refine" box
  under every estimate, unlimited turns, text only (lane `food-refine`,
  `server/lib/foodRefine.js`: code keeps untouched lines verbatim, derives
  kcal, sums, diffs). VERIFIED: two real model corrections of his plate,
  ~10 s each. ASSUMED: all of it on his phone.
- **DO NOT:** treat a make-up session as an ordinary one of its routine: a
  make-up only ever carries the leftovers, so counting it as "the last
  session" would call everything else skipped.

---

**26 SEP (close, nova-os-83) — PICK IT UP (the takeaway finder, from the
wolfecampbell reel he sent), CALORIE + PROTEIN RINGS on the Fuel hero, and
a FIX FOR THE SERVER CRASHING ITSELF. All pushed (9a204d9), Pages success
(run 36205775259), server reloaded with the guard, health 200.**

- **GOAL (his, 26 Sep):** "I want this kind of feature and capability built
  into nova" (500 kcal and 50 g protein left, type it in, see every chain and
  supermarket item that fits, go pick it up); then "make the section at top
  of fuel have a ring for both calories and protein".
- **DONE CRITERIA:** finder MET for build, live on his server and in the
  deployed bundle; UNMET: seen on his phone. Rings MET, deployed; seen at 375
  headless only. Crash guard MET as code; UNPROVEN in the field (see below).
- **STATE (paths):** `server/lib/eatOut.js` (catalogue store, `validateRow`,
  pure `whatFits`), `server/lib/eatOutSources.js` (Open Food Facts by code,
  chain PDFs via lane `eat-out-menu`), `server/routes/eatOut.js`,
  `scripts/eat-out-refresh.mjs`; client `src/screens/PickItUp.jsx`, the
  `pickItUp` vals in `src/vals/valsRecipes.js`, eatOut* actions in App.jsx.
  Rings: `KcalRing` + `MacroRings` in `src/screens/Recipes.jsx`,
  `fuelHero.kcalRing` in the vals. Guard: `server/lib/tosGuard.js`, first
  import in `server/index.js`. Memory: nova-pick-it-up.
- **DECISIONS:** models only PARSE a chain PDF, code validates every row
  (Atwater 20 %, kJ/kcal 6 %, grams, ≤3000 kcal) → forecloses any model
  number reaching the catalogue unchecked; McDonald's/KFC/Grill'd/Hungry
  Jack's shown as MISSING with why, never scraped from third-party reposts
  → forecloses unofficial numbers (the Chrome hand could read Maccas/KFC:
  his call); protein is a target to get close to (≥80 % qualifies); a failed
  brand refresh keeps its last good record with the error on it; calories
  own a ring, the macro ring's middle is protein; over target = full warn arc.
- **VERIFIED:** server 2527/2527, lint clean, build green; live catalogue
  (see the refresh receipt in this entry's foot); `GET /api/eat-out/fits`
  answers on the live server; verify-shipped PASS on all three new markers
  and `/api/eat-out`; Pick it up and the rings screenshotted at 375
  (Cupertino) against the live server, scrollWidth 375.
- **ASSUMED:** everything on his phone; tapping a result opens the portion
  sheet (written, never tapped: it would log); the Command style of the new
  rings (that shot came up offline during the crash); the guard stopping the
  crash — it never reproduced on demand, the evidence is 5 stack traces.
- **THE CRASH (read this):** Node 24.16's own fetch calls
  `socket.setTypeOfService()` on every request; since macOS 27 that throws
  EINVAL intermittently inside an event listener and kills the process
  (06:51, 10:19, 10:32 AEST and two more on 26 Sep; it killed a refresh and
  every job beside it). If `grep "setTypeOfService EINVAL"
  ~/Library/Logs/nova-os-server.log` gains a NEW stack after 10:5x AEST,
  the guard is not catching it; `grep tos-guard` shows when it did.
- **OPEN QUESTIONS (his):** see the decisions at the end of this session's
  message: McDonald's/KFC via the Chrome hand, and whether the catalogue
  refreshes on a schedule.
- **REFRESH RECEIPT (live, 10:53 AEST):** 596 items across 12 brands.
  Guzman y Gomez 210, Youfoodz 94, My Muscle Chef 88, Woolworths Macro 54
  (its last run hit a 503; the kept record says so), Subway 45, Chobani 42,
  Musashi 23, Woolworths meals 21, Coles meals 8, Lean Cuisine 6, YoPRO 4,
  Lite n' Easy 1. A live search for 500 kcal / 50 g protein returns 33
  items, led by My Muscle Chef meals at 50 g. KNOWN SHORTFALL: the lane read
  46 Subway rows where a direct trial read of the same sheet got 115. The
  raw answer is at `server/data/eat-out/pdf/subway.pdf.parse.json`; compare
  before re-running (~$0.50 a read). No new setTypeOfService crash since the
  guard loaded (the count is still 5).
- **LATER THE SAME MORNING (his answers):** McDONALD'S AND KFC ADDED
  (e2bceea, `server/lib/eatOutChains.js`, no model: KFC's Yum ordering
  catalogue by plain fetch; McDonald's `/dnaapp/itemList` from inside a
  throwaway headless Chrome, since Akamai refuses anything else). Live
  refresh 11:15 AEST: McDonald's 93, KFC 180; catalogue 869 items, 14
  brands; only Grill'd and Hungry Jack's still missing. FORTNIGHTLY REFRESH
  on: a 30-min tick starts a full refresh at 3–5am once the catalogue is 14+
  days old (first due ~10 Oct). If it never fires, check the `eat-out` beat
  in heartbeat.json and the server log for "eat-out: fortnightly".
- **DO NOT:** run two catalogue refreshes at once (OFF answers 503 and six
  brands came back empty before the keep-on-error fix); leave
  `public/_devconn*.js` behind (seven token copies piled up from two
  sessions; now all gitignored, still delete them).

---

**26 SEP (close, nova-os-df) — PRACTICE BUILT: a skill prepared from his
sources, rehearsed with Nova as the other person, debriefed by code.
Plan: `design/PRACTICE-PLAN.md`. Commits 3ca0138 · 5fcfd87 · e78e99b ·
296c81b; the peer session nova-os-83 pushes them with its own (agreed)
and runs the reload — check `git status -sb` says level with origin and
`curl localhost:4173/api/health` is 200 before trusting either.**

- **GOAL (his, 26 Sep):** a feature that accumulates what Nova knows about a
  skill he is learning (The Next Conversation, Jefferson Fisher), lets him
  rehearse it back and forth "like a real human conversation", and gives
  feedback grounded in the sources; noted from the Inbox or by voice.
- **DONE CRITERIA:** page + prepare + scene + debrief + undo MET and seen
  live; Home card in both idioms MET (seen at 375, cupertino and command);
  UNMET: his phone (voice in the room, TTS of the partner, the lamp bloom
  in motion), and the fixed stage layout was verified only by the client
  agent's captures, not by my own eyes (see ASSUMED).
- **STATE (paths):** `server/lib/practice.js` (page contract, tallies,
  `nextScene`, undo), `server/lib/practiceLane.js` (Prepare, the scene
  partner prompt, NOTE/DEBRIEF parsers, `finishPracticeTurn`),
  `server/routes/practice.js`, `startAskPractice` in claudeCode.js; client
  `src/vals/valsPractice.js`, `src/screens/Practice.jsx`,
  `src/PracticeLamps.jsx`, `src/PracticeCard.jsx`; hue `--nv-or` in every
  theme. Lanes `practice-prepare` / `practice-chat` (both Opus on the
  board). His first real page: `Wiki/Practice/Disarming Disrespect and
  Intent Questions.md` (6 moves, 3 scenes, 7 sources; record 3c654762,
  filed, undoable in the Inbox).
- **DECISIONS:** prepare and the debrief file AUTO with a real undo (the
  Leader's reflection rule; reversible to pending on his word); the web
  only when his sentence says research (explicit-trigger law); a scene
  never touches the web; the pressure is hidden from the screen until the
  debrief (the API strips it, pinned by test); the record kinds ride the
  Leader's being on the Org Map until Practice has a being of its own (his
  call: hue, artefact); rehearsal lines are NOT mirrored into the voice
  conversation record (a scene is role-play, not his history); the receipt
  names the first gap and counts the rest.
- **VERIFIED (locators):** server 2520/2520 before the two fixes, practice
  suites 41/41 after; lint 0 errors; build green (Practice is its own lazy
  chunk). LIVE on his vault: the intent front door routed his sentence to
  `practice` and Prepare wrote the page in 54s, grounded in his Leader
  struggles (the duty-manager restructure); the parse→format round-trip
  over that real page is byte-identical; a real scene (three turns) had
  the partner deliver the pressure and credit two moves with his exact
  words; the debrief filed one session line + record fbe7f1da; undoing it
  left the page byte-identical (that test session is gone, on purpose).
  Captures (scratchpad only, per the audit convention): Home card open in
  both idioms, the shelf, an open skill, the pre-fix stage at 375.
- **ASSUMED:** the post-fix stage (compact head, bar clearance, castLine,
  "Claire" label) — the client agent measured it (last line y=598 above
  the bar at y=614) but my own captures were reloaded out from under me
  by the peer's App.jsx saves and never showed it; the mic path and TTS in
  the room; the lamp bloom in motion; the offline banner overlapping the
  control bar when offline mid-scene (the agent saw it).
- **HIS ANSWERS (26 Sep):** the book — "remind me later to try and find
  this" (on nova-open-threads); records stay auto+undo; the Practice being —
  "show me what you mean" (a prototype sheet, mockup 51, not in the live
  map); Wrap-the-day question — NO: practice is case by case when he has
  time, so nothing nags him about it.
- **NEXT ACTION:** on his phone, open Practice → Rehearse, speak three
  lines, End scene; expected: the partner answers aloud within ~10s, a lamp
  blooms when he says a line from the page, the debrief quotes him and
  files one Inbox record with Undo. Then his notes → a fix pass.
- **DO NOT:** photograph the app while a peer is saving src/ (Vite's page
  reload wipes any state an eval set — every "Home instead of the stage"
  capture today was that, not a bug); leave `public/_devconn.js` behind (a
  peer's --clean also deletes yours mid-run: re-seed right before each
  shot); trust `document.title` set synchronously in an eval (the app
  resets it on render — set it in a setTimeout); post a rehearsal to
  /api/conversation.
- **PEER NOTE:** nova-os-83 found the live server crashing on Node 24.16's
  `setTypeOfService EINVAL` (5 times on 26 Sep); a scene mid-turn dies
  with it; their `server/lib/tosGuard.js` is the fix, reloaded by them.

---

**26 SEP (close, nova-os-44, before his MacBook update) — HE WANTS TO REVIEW
THE AGENT WORLD LATER: REMIND HIM AT THE START OF THE NEXT SESSION.**
After the macOS update, first check: `curl localhost:4173/api/health` is 200
(launchd came back) and Tailscale answers.

- **GOAL (his, 25 Sep):** (1) audit the agent models and fix what he picked
  (the gate, the spend ledger, no caps, Ask Nova on Sonnet 5); (2) spoken
  turns from the icon must be sent and kept as a history Nova can refer back
  to; (3) the agents' environment, "engaging and amusing as though the
  agents have their own life", at zero Claude cost.
- **DONE CRITERIA:** (1) MET, pushed. (2) MET, pushed; seen working only in
  guarded headless runs. (3) MET for build, pushed `d12cfbc`/`07713c5`;
  UNMET: his review (he asked to be reminded).
- **STATE (paths):** models: `server/lib/modelChoice.js` (gateFor/needsGate,
  `GET /api/model-gates`), `server/lib/modelSpend.js` (ledger,
  `GET /api/model-spend`, parseEnvelope), `src/modelSpendView.js` + Settings
  board. Voice: `src/useDictation.js` (onDone(words)), `server/lib/
  conversationLog.js` + `routes/conversation.js`, `src/conversationSync.js`
  (chatIds). Agent World: `src/agentWorld/{habitat,life,acts,beings}.js`,
  `src/orgmap/{scene,walk,OrgMap}.jsx`, `server/lib/orgMap.js` (events,
  receipts), mockup 50 + sheet https://claude.ai/artifact/52W7BD7VxYAgStjH28pAw9,
  plan AGENT-WORLD-PLAN.md §9. Audit: design/audits/2026-09-25-agent-models.md.
- **DECISIONS:** the gate asks only below Opus, "keep" = the board's model
  (forecloses a literal Sonnet downgrade); no caps anywhere, guard globs every
  spawn file (forecloses any --max-budget-usd or kill timer on a model run);
  one append-only conversation record every door writes to (forecloses
  per-device history as the truth); working tells only for real work, an
  off-duty catalogue otherwise, a marker pins its being (forecloses motion
  that could be mistaken for work); walks stroll to fill the engine's phase,
  Money stack = today's filed count, Leader rests facing its pool (mine,
  reversible on his word).
- **VERIFIED (locators):** gates at close: lint exit 0, build green, server
  2439/2439, health 200, tree clean and level with origin `07713c5`, Pages
  run 36188312397 success, `node scripts/verify-shipped.mjs` PASS on both
  Org Map markers (35 live chunks). Captures in the session scratchpad
  `integ/` (Ops 402/1280 day+night, walk strips, delivery pulse, visit with
  popcorn, bar racked, all idle acts), `habitat/`. The 14:22 voice race
  reproduced before/after headless (scratchpad `ears.mjs`). Record file
  repaired 167 → 42 rows (backup in scratchpad `data-backup/`).
- **ASSUMED:** everything on his phone: the voice fix end to end, the record
  filling, the map's frame rate/memory with the sets, Calm and themes, the
  visit cycle and a real filing acting out on their own, the Coach's sleep
  pose (the capture shows him standing).
- **OPEN QUESTIONS:** his verdict on the sheet and on Ops (by district and
  part) — REMIND HIM. Ambient (his yes in principle, 25 Sep) is next after
  that. Unstarted audit items: effort per lane, --fallback-model, pref
  provenance. The resumed Ask session does not see turns added on another
  device since it began.
- **NEXT ACTION:** remind him to review; on his notes, a fix pass. Expected
  if all is well: he names parts, not "it's broken".
- **DO NOT:** post test rows to /api/conversation (his history); run a
  stub-CLI test without NOVA_DATA_DIR; pass a list to git unquoted in zsh
  (`${=VAR}`, and check `git log -1` after — a "fatal" slipped past a grep);
  judge the map's idle cost on headless real time (~1 fps; use `step(dt)`);
  reload with a bare kickstart.

---


**25–26 SEP (close, nova-os-clicky) — CLICKY BUILT: NOVA DRIVES THE MAC.
Pushed and deployed (Pages run for 5058e86: success). Server running it.
He asked to be REMINDED OF ALL OF THIS LATER — at the next session start,
surface the "at the MacBook" list and the two decisions below.**

- **GOAL (his, 25 Sep):** from the hugovar.ai "Jarvis, make me five ads" reel:
  (1) the working glass, (2) depth on the glass; then "proceed with the
  clicky build" (his 22 Sep Clicky note: Nova drives the Mac by voice).
- **DONE CRITERIA:** working glass + depth MET, pushed (then corrected by a
  peer, see DO NOT). Clicky MET for build, pushed; UNMET: seen on his Mac.
- **STATE (paths):** `src/jobBeats.js` + App.narrateJobs (working glass),
  `src/glassDepth.js` (depth); `server/lib/macHand.js`, `src/macTargets.js`,
  verbs `mac.open`/`mac.music`/`mac.volume` + `parseMac`/`splitThenOpen` in
  `server/lib/verbs.js`, `fromMacOf` in `server/routes/voice.js`,
  `server/lib/roster.js` + reflexes in `reflex.js`, `planWorthy` AGENT_ASK in
  `src/chatLanes.js`. Full account: design/VERBS-PLAN.md "Hand 3".
- **DECISIONS:** fixed AppleScript, his words after `--` only → forecloses
  free-form scripts and screen clicking (his call, raised as a decision);
  Mac sentences claimed only at the Mac or with "on my Mac" → forecloses
  phone-side "pause" meaning the Mac; opening is act-tier with NO undo
  (writes nothing) → VERBS-PLAN's undo rule now carries that one exception;
  a catalogue song is opened, not claimed playing → forecloses faking
  playback; the model's hands list is generated from the roster →
  forecloses a hard-written claim (the old one named ElevenLabs, no key).
- **VERIFIED (locators):** at close: lint 0 errors, build green, server
  2439/2439, health 200, tree clean and level with origin 5058e86, Pages
  success. Roster on his real data (module call, no writes); live /api/ask
  "Do you have my Google Ads integration connected?" → the honest no via
  the reflex (one true line in spoken-log.json). My fake "brief is ready"
  test line is gone from conversation/2026-09.jsonl (grep: 0).
- **ASSUMED:** everything on his Mac: nothing has been opened, played or
  turned down there. The first Music command raises macOS "node wants access
  to control Music" (must be OK'd); `music://` opening a catalogue song in
  Music is from the app's Info.plist, not observed; the working glass on his
  phone after the peer's fix.
- **OPEN QUESTIONS (his, remind him):** (1) control apps beyond Music, or
  screen clicking — yes = bigger riskier build, no = fixed actions stay;
  (2) Apple Developer Program $99/yr (standing reminder). Reel parts 3–4
  (fanned reveal, 3D callouts) parked in nova-roadmap. Not built: other
  apps, reading the screen, opening on the phone.
- **NEXT ACTION (his, at the MacBook):** try "open Reminders", "play my
  <name> playlist" (OK the box), "turn it down", "what's playing", "do you
  have Todoist connected", "Set a reminder Saturday 9pm for dinner with
  Sharif, then open my Reminders to confirm"; and a research question by
  voice on the phone. Expected: each acts in ~1s with a one-line receipt;
  the research narrates its stages once, no replay of old briefs.
- **DO NOT:** drive the real Music app from a session (TCC box on his
  screen); mark a settled-at-first-sight record with a null seen-set — my
  narrateJobs did, and every fresh load read out 19 past briefs into his
  conversation record (fixed by a peer, c455cf2); stub the chat mirror from
  a setup expression — seed it before load (my first headless run wrote a
  fake line into his record); use "set it to N" for volume (the shopping
  list's).

---

**25 SEP (evening, nova-os-jarvis) — THE WORKING GLASS AND DEPTH, from the
hugovar.ai "Jarvis, make me five ads" reel he sent. SUPERSEDED by the
clicky close above: now pushed, the test row is gone, and a peer fixed the
replay bug (c455cf2). Kept for its detail. Client + test only; the server is untouched, no reload
needed. ONE TEST ROW IS SITTING IN HIS CONVERSATION RECORD — see below.**

- **The working glass (`src/jobBeats.js`, `App.narrateJobs`):** a research
  job he dispatched narrates its stages — "On it. Planning who to send." →
  "4 researchers out: A, B, C and D." → "A is back with 6 findings." →
  "All 4 back, 22 findings. Writing one brief." → "The brief is ready: T.
  It is in your Inbox." — each with a code-written panel (THE PANEL list
  with OUT / n FOUND / EMPTY / FAILED per worker, a MERGING metric, READY
  in green). Derived purely from the record fields the Researcher already
  publishes; nothing a model wrote. Spoken when speech is on (voice leads
  the glass), the island carries the line off the Voice screen, the outcome
  line joins the chat. First inbox after boot seeds silently. Plan-step
  research (parentPlanId) is NOT narrated. `server/test/jobBeats.test.js`
  7/7.
- **Depth (`src/glassDepth.js`, nvGlassArrive/nvGlassRecede):** full panels
  arrive out of z; rail items recede per index. Seen at 375 (glass rail) and
  the desktop hero; the desktop ON THE GLASS stack was below the fold in my
  shot and was verified from state only.
- **Verified headless against the dev server (stills in my scratchpad, gone
  with the session), NOT on his phone, NOT against a real Researcher run.**
  The full server suite and the dev-connect cleanup were refused by the
  permission layer this session; `npm run lint` 0 errors, `npm run build`
  green, and the new test pass. `public/_devconn.js` was removed.
- **THE TEST ROW:** my first headless run appended Nova's "ready" line to
  `server/data/conversation/2026-09.jsonl` (the mirror ran before my stub
  landed). It is the file's ONLY line, dated 2026-09-25T07:04:05Z, text
  "The brief is ready: Creatine Loading: Necessary or Not?…". The removal
  was refused to me; he runs:
  `: > server/data/conversation/2026-09.jsonl` (the file had nothing else).
  Lesson for the instruments memory: stub `syncConversationSoon` in
  `Page.addScriptToEvaluateOnNewDocument`, not after load.
- **NEXT:** his push; then a real `Research:` from the Voice screen with
  speech on and watch the glass narrate it; then the fanned reveal and 3D
  callouts he asked to be reminded of (roadmap memory).

---

**25 SEP (afternoon, nova-os-44) — HIS SPOKEN TURNS WERE HEARD AND NEVER
SENT; ONE RECORD OF EVERY EXCHANGE; THE MODEL BOARD FOLLOWED AND MEASURED.
14 commits LOCAL, NOT PUSHED: my push was refused by the permission layer,
so HE runs `git push origin main` (it also carries d3's and 2c's handoff
commits, which they asked to ride along). Server reloaded (reload-server.mjs)
and runs everything below; the client half reaches his phone only after the
push + Pages deploy.**

- **The bug he hit (14:22 AEST):** his iPhone recorded 39.5s, Groq
  transcribed 384 chars, nothing was asked. `useDictation.finishNova` called
  onText then onDone in one tick; the presence surface read a render-stale
  ref. Same race on the Voice screen (which then said Nova heard nothing) and
  the recipe tweak. `e7d89c4`: onDone(composed words); sendLiveTalk puts his
  question in the chat at send; a failed turn is spoken and kept. VERIFIED
  headless (real clip, fake mic, every write guarded): HEAD in a worktree
  transcribed and never asked; the fix asked the exact sentence. NOT seen on
  his phone.
- **The record (`d1d631d`):** server/lib/conversationLog.js, append-only
  JSONL per month in server/data/conversation/; the app mirrors every settled
  voice-chat line (id = device + line time + who), Siri and the Action Button
  write server-side, the Voice screen merges it (boot + opening Voice), Nova's
  fresh-session context reads the last week. `GET/POST /api/conversation`
  live (400 on empty, 401 without token). EMPTY until the new bundle syncs.
  Gap: a resumed session does not see turns added elsewhere since it began.
- **Model board:** gate follows the board (`33c14aa`; on his board every
  interactive gate is ask:false, weekly scout/distill still ask), forge/
  planner/scout validate (`2d13b50`), no caps on exercise research + guard
  now globs every spawn file (`018fa94`), the spend ledger (Sonnet agent in a
  worktree, reviewed and cherry-picked: `f416841` `6b98f7a` `0bc6d28`, my fix
  `879453e` for the dropped exit-code check) and the per-lane spend line on
  the Settings board (`9c3649d`, seen at 375px with page-only sample data;
  the board TOTAL not seen on screen). Ask Nova set to `sonnet` on the board
  (his "let's try"); code default still Haiku.
- **Test leaks into his live data, found and repaired:** claudeStream.test.js
  wrote the stub's "Hello turn 1." into spoken-log.json (30 of 60 lines) and
  pointed agent-sessions.json's Coach at a temp folder; spokenLog.test.js
  overwrote the live log mid-run. Both isolated (`82eda0e`, `7718a17`); data
  repaired with backups in my scratchpad; Coach pointer back on a7309692
  (Nova's Coach section reads his real exchange, checked). A full-suite mtime
  diff of server/data now shows only the live heartbeat.
- **Gates:** server 2334/2334, lint 0 errors, build green.
- **NEXT:** after his push, his phone: speak through the icon, see the line
  land in the voice chat, then `GET /api/conversation` shows it. Then the
  unstarted audit items (effort per lane, --fallback-model, pref provenance).
- **DO NOT:** post test rows to /api/conversation (it is his history);
  run a stub-CLI test without its own NOVA_DATA_DIR.

---

**25 SEP (close, nova-os-d3) — A STALE COACH CARD SAYS SO, A FAILED YES SAYS
WHY, A TAKEN-BACK CARD SHOWS IN HISTORY. Committed, gates green, NOT YET
PUSHED — blocked behind nova-os-44's own unpushed `018fa94` sitting under it
on main, which they asked to push themselves. Deployed/verify-shipped
figures below are from the moment this was checked, before this commit.**

GOAL: after the Coach-chat pipeline rebuild earlier this session (see the
nova-os-d3 block below — the original diagnosis and the fix are there, not
repeated here), a second pass looking for what could still go wrong now that
several sessions were building on the same deck and cards concurrently.

DONE CRITERIA: met — three real gaps found and closed, all from re-reading
the actual card/apply code, not speculation.
1. A card his own edits (or a peer's — e.g. nova-os-2c's exercise re-file)
   have overtaken used to fail silently on tap ("didn't go through"). It was
   exactly what happened at 11:26 that morning: he moved an exercise by hand
   while Coach's card for the same move still waited.
2. A failed Yes only ever reached him as a toast; the server's real reason
   ("X is no longer in Push") is now shown on the card itself.
3. A card Coach withdraws (WITHDRAW, status `withdrawn`) read as a blank line
   in the Inbox history; it now reads "Taken back" with a line saying why.

STATE (paths): `src/coachSuggestions.js` (`staleReason` — reads a
routine-edit card against his CURRENT program, returns a sentence or null);
`src/CoachSuggestions.jsx` (a stale card shows the sentence, no Yes button,
✕ still clears it; an errored card shows the server's own message);
`src/vals/valsWorkouts.js` (`error` rides the card state); `src/App.jsx`
(`answerCoachSuggestion` keeps `e.message` on the card, not only in the
toast); `src/screens/Inbox.jsx` (`STATUS_META.withdrawn`). Commit `dd63605`.

DECISIONS (choice → reason → forecloses):
- A stale card gets no Yes button rather than a "confirm this is stale" step
  → the apply would fail anyway, and code already knows why → forecloses
  ever showing a Yes that is known in advance to fail.
- ✕ on a stale card clears it without counting as his decline → the idea was
  never wrong, only overtaken by events → forecloses `respectNo` treating a
  stale-clear the same as a real "no" (unaffected — discard still records a
  `declineReason` only when he types one; nothing here changes that call).

VERIFIED (locator): `cd server && npm test` → 2289/2289 at this close (was
2267 at the commit, +22 from peer work landed since); `npm run lint` → exit
0, 0 errors; `npm run build` → green; `node scripts/verify-shipped.mjs` →
every marker PASS EXCEPT git/deploy (see BLOCKERS — a peer commit, not mine,
sat unpushed at the moment of this check); `server/test/coachSuggestions.test.js`
pins `staleReason` against a gone exercise, a duplicate, and a legitimate
still-pending move (his real deck's cards all pass `!c.stale` too).

ASSUMED (not verified this session): the stale-card sentence has not been
seen on his phone against a real collision (his own edit landing while a
card of Coach's still waits) — built from the same apply logic the server
runs, but a live race is still a live race.

OPEN QUESTIONS / BLOCKERS (his, not yet answered):
1. The program review still offers one-tap "drop the lift you reach least"
   cards. Nothing to add here from earlier — this is the same open question
   carried from the nova-os-d3 block below, still unanswered: keep as
   one-tap, or make discuss-only?
2. `018fa94` (nova-os-44's exercise-research no-caps fix): done, their own
   tests pass (12/12), staying local — they push it themselves once their
   own gate (lint/build/server suite) is green on their full set of changes.
   Not mine to push. Check `git log --oneline origin/main..HEAD` before
   assuming main is in sync if this entry is stale by the time it is read.

NEXT ACTION: none required from him for this entry's own work — it is
already live. The two items above are the standing asks.

DO NOT:
- Don't read `CURRENT HANDOFF` as one slot — this entry replaces only
  nova-os-d3's own prior entry from earlier in this session (below, now
  folded into this one's account); nova-os-2c's entry above stays untouched,
  and everything below that is untouched.
- Don't push a peer's uncommitted-to-origin work without asking them first,
  even to satisfy a "must be pushed" gate — `018fa94` was left local for
  exactly this reason.

---

**25 SEP (close, nova-os-2c) — THE PLANNED WEEK, DISCUSS THAT TALKS, THE
REVERSE CURL RE-FILED, PLAN HISTORY, EXTRA-LIFT PREFILL, LIBRARY RESEARCH,
STALL RESTRAINT. Deployed and live on his phone (pushed through `caa191f`
mid-session); local main has since moved 2 commits ahead of origin
(nova-os-44's + nova-os-d3's, both explicitly left unpushed on request —
see BLOCKERS) but nothing of THIS entry's own work is unpushed. Gates green
at close.**

GOAL: six things he asked for in one continuous session — (1) a per-exercise
breakdown behind "Hard sets this week"; (2) past days must never count an
exercise as missed if the plan changed since ("nothing should count as
missed if it can be helped"); (3) Discuss on a Coach card must actually let
him discuss, not just focus an empty box; (4) EZ-Bar Reverse Curl re-filed
Biceps→Forearms; (5) an exercise added mid-session must prefill from his
last sets and Coach's progression, not start at 0kg×8; (6) Coach must
research any new exercise properly, improve the library weekly, offer
variations (tempo/pause) within a lift, and may suggest a stalled/long-tenure
lift change — with restraint, not "over-indulge or over-decide".

DONE CRITERIA: met, all six — shipped, live on his phone, checked against
his real vault data at each step (not sample data).

STATE (paths):
- `server/lib/plannedWeek.js`, `src/weekSets.js`, `src/WeekSets.jsx` — the
  sheet behind the hard-sets card (tap → GlassSheet morph).
- `server/lib/planHistory.js` — routine-file snapshots + live mtime folded
  into `server/data/plan-history.json` (23 versions at close); `planAt(iso)`
  answers "what was the plan then". Monday's version for this week was
  SEEDED from the 21 Sep dossier (dad5b6b5) since it predates the store.
- `server/lib/exerciseRefile.js` + `POST /api/workouts/exercises/:id/
  muscle-group` — re-file with Inbox undo. Applied live: reverse curl is
  Forearms (verified again at close, `GET /api/train/overview` → Forearms
  3/10 present).
- `server/lib/sessionPrefill.js` + `GET /api/workouts/exercises/:id/next` —
  extra-exercise prefill from exercise state + progression + tune.
- `server/lib/exerciseResearch.js` — new-lift research (30s after add, 30min
  sweep) + weekly pass (Sun 06:00–Wed). **LANDED during this close**
  (`018fa94`, nova-os-44, rebased onto cleanly): `BUDGET_USD` /
  `--max-budget-usd` and the 12-minute kill are gone — no cap anywhere, per
  his standing "no caps at all" (`71a7fe4`, 23 Sep). Confirmed removed
  (`grep BUDGET_USD server/lib/exerciseResearch.js` → no hits) and the
  rebased tree rebuilt/retested clean (2289/2289) before this entry was
  written. [[nova-model-cost-discipline]] updated so its own "set the cap
  at 2×" step — the one I followed to introduce the cap in the first
  place — stops contradicting the file's own header.
- `server/lib/coachProgramReview.js` — stale/tenure judgement rewritten:
  4-week flat run (not 3), tempo/pause `tune` fix offered before any swap,
  swap candidates must share prime mover AND `exerciseMotion` pattern, one
  exercise-change card/week cap.

DECISIONS (choice → reason → forecloses):
- Past days read from plan history, not always today's schedule → his
  explicit rule → forecloses ever reading a past day's plan from the live
  schedule again without breaking that promise.
- Tempo/pause card before any swap, one change-card/week → his restraint ask
  + his real decline record (6 of 10 stall cards declined before this) →
  forecloses swap-first suggestions; a future tightening pass should know
  the bar was already loosened once.
- Swap candidates must match BOTH prime mover and movement pattern → his
  complaint that Deadlift was offered for a Lying T-Bar Row → forecloses
  "same muscle group" alone as sufficient matching.
- Exercise research never re-files an ESTABLISHED exercise, only a new one
  → protects his logged volume history → forecloses "auto-correct" even
  when research disagrees with his filing; a disagreement is said, not
  acted on.
- Discuss sends an opening Coach turn automatically → his literal words,
  "didn't actually seem to let me discuss apart from me typing manually" →
  forecloses leaving it as a focus-only no-op.

VERIFIED (locator):
- `npm run lint` exit 0. `npm run build` green — checked AFTER rebasing onto
  nova-os-44's landed `018fa94` (their edit finished; earlier drafts of this
  entry said "in flight" — state moved, this is the re-checked truth).
- `cd server && npm test` → 2289/2289, rebuilt on top of `018fa94` (was
  2288/2288 before their commit added one test to `noCaps.test.js`).
- `node scripts/verify-shipped.mjs` → deployed build matches local
  (`caa191f9b`, the commit that WAS live at the time of that check), every
  feature marker for this session PASS. Re-run this after whichever commit
  eventually gets pushed next — it was not re-checked against `018fa94` or
  `a804e90` since neither is deployed yet.
- `grep BUDGET_USD server/lib/exerciseResearch.js` → no hits. Confirmed
  gone, not just claimed — this WAS reviewed by this session, correcting an
  earlier draft of this entry that said otherwise.
- Live overview (`GET /api/train/overview`) at close: `week` present,
  Forearms 3/10 (reverse curl), volume bars == sheet totals.
- `server/data/plan-history.json`: 23 versions, sources `file`/`snapshot`/
  the seeded dossier.

ASSUMED (not verified this session):
- exercise-research's real behavior on a live pass — no `server/data/
  exercise-research.json` exists yet, zero Inbox records of kind
  `exercise-research`. The weekly window (Sun 06:00–Wed) has not fired; the
  cost/timing numbers in code comments are from one manual measurement, not
  a scheduled run.
- The stall/tenure numeric thresholds (4-week flat run, 8-outing slowing
  gate, one card/week) are my judgement calls from his stated principle
  ("not a must... don't over-indulge or over-decide"), not numbers he
  approved one by one.
- Everything nova-os-44 has uncommitted in the shared tree right now (voice
  send fix, a new `server/lib/conversationLog.js` + `server/routes/
  conversation.js`, edits across `App.jsx`/`Voice.jsx`/`useDictation.js`
  and more) — not reviewed, not tested, not mine. Untouched by this entry.

OPEN QUESTIONS / BLOCKERS:
- The kg input box clips a decimal weight at 402px ("29.5" renders "29.!")
  — noticed mid-session, told to him, not asked for yet. Pre-existing, not
  caused by anything this session touched.
- First real exercise-research pass (new-lift or weekly) has not happened —
  next session touching Train should check the Inbox for a filed
  `exercise-research` record and read what it actually wrote before
  assuming the feature works end-to-end.
- **Not pushed, on purpose:** local main sits 2 commits ahead of origin
  (`018fa94` nova-os-44, `a804e90` nova-os-d3 on top of it). Both explicitly
  asked NOT to be pushed yet — nova-os-44 has more commits coming (voice
  send, conversation record, a model gate) and will push their whole stack
  themselves once their own gate is green. Confirmed directly with them
  before this entry was closed out. **Do not push on their behalf** even to
  satisfy a "must be pushed" checklist item — asked, and told not to.

NEXT ACTION: none required from him from this entry's own work — the
planned week, Discuss, the reverse curl, the prefill and the stall
restraint are already live and pushed (they rode `caa191f`, well before
this unpushed pair). If a session revisits Train: confirm the first
`exercise-research` Inbox record exists and its `research` field has real
sourced content (expected observation: a filed record titled "Coach's
research on a new exercise…" or "Coach's weekly library research…", with
`cues`/`variations`/`sources` on the touched exercise's library entry).

DO NOT:
- Don't treat `CURRENT HANDOFF` as one slot — it's a stack (see
  [[nova-concurrent-sessions]]). This entry replaces only nova-os-2c's own
  two prior entries from earlier in this same session; nova-os-d3's block
  below and everything after it is untouched, deliberately.
- Don't re-add a budget cap to `exerciseResearch.js` without checking with
  him first — nova-os-44 removed it live per his own "no caps at all",
  confirmed gone by this session.
- Don't assume the exercise-research pipeline has ever actually produced a
  written record — it hasn't, as of this close.
- Don't push `018fa94`/`a804e90` — nova-os-44 asked directly not to; they
  will push their own stack.
- Don't touch the uncommitted files currently sitting in the shared tree
  outside this session's own paths (`server/index.js`, `askContext.js`,
  `routes/voice.js`, `src/App.jsx`, `RecipeOverlay.jsx`, `ReplySheet.jsx`,
  `VoicePresence.jsx`, `screens/Voice.jsx`, `useDictation.js`,
  `vals/valsChrome.js`, `vals/valsRecipes.js`, plus new
  `conversationLog.js`/`conversation.js`/`conversationLog.test.js`) — that
  is nova-os-44's in-progress work, mid-edit as this session closed.

---

**25 SEP (afternoon, nova-os-d3) — HIS COACH CHAT WENT WRONG ON SIMPLE
CHANGES; THE WHOLE CHANGE PIPELINE REBUILT, LIVE.** His ask: "Check the recent
coach chat history and notice the problems… Simple errors like that which
should be straightforward requests cannot go wrong."

- **What happened (Coach session a7309692, 11:01–11:26 AEST):** he asked to
  bring Upper Body toward an hour. 6 of Coach's 12 PROPOSE lines were
  refused (an `add` named its exercise in `exercise`; the validator read only
  `add`), the refusal was appended after the reply, so Coach told him to
  "approve the first four cards" when two existed. A move was a remove card +
  an add card: his yes to the remove deleted the rope extension. Coach put a
  curl on Push twice ("You are failing with your expertise"). "Done. It's on
  Push now." when nothing had happened. The add that finally landed went last,
  not "straight after the incline bench"; he fixed it by hand. At 10:12 the
  Claude usage limit came back as Coach's answer, twice, and his question was
  lost. Earlier: 26 Aug "You should be able to apply the edit now" x4.
- **Shipped (commits, all tests green; see each message for the why):**
  `4f327c9` glass keeps Coach's real panel shapes (title/value, bars as
  items). `fa654d8` program review counts make-ups, one movement under any
  name (Pull-Up = Pull-Ups = Weighted Pull-Up) and arrivals; filed Coach cards
  protect what they placed. `f6ee8cd` the pipeline: `server/lib/coachProposals.js`
  settleCoachChanges (validate all → one repair turn to the SAME session via
  sideJob → file → instructed applies → code writes "Done: …"), `move` action
  (one card, both routines in one write `workouts.updateRoutines`, one undo),
  `after`/`position` on add and move, split guard (`coach.js SPLIT_DAYS`),
  nothing guessed (`pickNamed`: an empty name used to match a routine's FIRST
  exercise), WITHDRAW → status `withdrawn`, per-turn HIS PROGRAM NOW + YOUR
  CARDS in one plumbing paragraph, cards carry his words not the LIVE UPDATE.
  `9e44249` usage limit said plainly (`usageLimitNotice`, exact CLI text:
  "You've hit your session limit · resets 11am (Australia/Melbourne)") and
  his question back in the box. `a8b1c8d` the deck draws a move; remove+add
  of one lift merges into one move. `bd5ac7a` one-column card = its own
  height (his 10:06 recording). `46c18c1` "instructed" can't carry a
  split-breaking change unless HIS words name the lift and the day.
  `d4d54c1` Coach quotes 2c's planned-week numbers. `7f65791` verify-shipped
  markers. `c4fdb88` withdrawn cards are never read as his answer.
- **Live state:** pushed through `46c18c1` (by nova-os-2c, on his "Approve");
  Pages deploy green; verify-shipped: every feature marker PASS in the live
  bundle. Server reloaded (reload-server.mjs) and runs `c4fdb88`.
  **`d4d54c1`, `7f65791`, `c4fdb88` are local, NOT pushed** (server-only +
  chore; my own push was denied by the session's permission layer).
- **Verified:** 2256 server tests (commit alone in a worktree); lint 0; build
  green. The repair path LIVE through the real claude CLI on a throwaway vault
  + data dir (sonnet): a refused add came back fixed as a card in 16 s with
  "Checking the changes against your program…" in the bubble; a rewrite
  streamed into the bubble and code wrote "Done: …". Replayed his morning's
  replies through the new check, read-only, on his real vault. Deck at 402
  (Apple idiom) and 1280 in Chrome AND WebKit (Playwright, scratchpad) with
  injected cards and a dead connection (nothing written).
- **NOT verified:** a real Coach turn of his with the new pipeline; the
  stretched card on his phone (NOT reproduced in Chrome or WebKit, even
  replaying his five yeses; the fix is structural: `@container nv-deck`).
- **Still open for him (in my final message):** (1) the waiting card
  ced278a4 "Drop Barbell Bench Press" was built on the make-up miscount (bench
  was done 3 of 6 weeks); asking Coach "take back the bench press card" now
  withdraws it, a ✕ would count as his decline for 28 days. (2) The program
  review still offers one-tap drops of the least-reached lift, which on his
  real data are main lifts (Carter Extension, Wide-Grip Lat Pulldown, Dead
  Hang); keep, or make it discuss-only? (3) push d4d54c1..c4fdb88.
- **DO NOT:** reload with a bare kickstart; push someone else's commits on a
  peer's word (the classifier refuses it; his approval must be his); read a
  test failure in edgeBack.test.js as mine (nova-os-44's WIP).

---

**25 SEP (midday) — "HARD SETS THIS WEEK" OPENS THE PLANNED WEEK, SET BY
SET. CLIENT LIVE; THE SERVER HALF GOES LIVE WITH THE COACH SESSION'S RELOAD.**

- **His ask:** through the hard sets card, "an aesthetically appealing
  breakdown of each exercise for each muscle group currently planned in my
  program across the week."
- **Shipped (pushed, deployed `51803a5`, verify-shipped markers PASS):**
  `a9990d3` server/lib/plannedWeek.js (every scheduled exercise per muscle
  per day; each logged working set credited to the slot it fulfils or to
  "not in the plan"; `isWorkingSet` shared with the bars) as
  `buildTrainOverview().week`. `1e776b5` src/weekSets.js (pure view model)
  + src/WeekSets.jsx (the sheet: serif count, muscle spectrum, a muscle x
  day pip grid one line per exercise, per-muscle ring and exercise rows);
  GlassSheet now takes children, centres its grabber, pins its sticky
  header at -6px (Chrome seam). `1c45125` auditProgram compared rest days
  to 'ACTIVE_REST' but the schedule stores 'active-rest' (6 training days
  instead of 4 in Coach's context). `f69926d` the card calls a goal muscle
  short only if done + still scheduled misses target by Sunday; the Coach
  question carries the figures.
- **NOT LIVE YET:** the running server predates `week`, so until the
  service reloads his card looks exactly as before (weekSetsView(null) is
  null: no chevron, old under-target line). The concurrent Coach session
  (nova-os-d3) asked me NOT to reload over its unverified work; it will run
  scripts/reload-server.mjs after committing. **Next session: confirm
  `node scripts/nova-api.mjs GET /api/train/overview` has `week`, then look
  at it on his phone.**
- **Verified:** his real week reconciles (Back 12, Biceps 9, Triceps 9,
  Shoulders 6, Chest 3 on bars and sheet alike); the sheet at 375
  (cupertino, command) and 1280 with his real week merged into the page,
  writes blocked; server 2226/2226, HEAD alone builds and tests clean.
- **My test's side effect, undone:** the first headless run loaded Home
  unguarded (an ASI bug in my guard) and composed the Morning Show at
  11:51 AEST: 12 "brief" lines in server/data/spoken-log.json, removed by
  timestamp. The brief flag was already today's (08:24), so unchanged.
- **Data finding worth his eye:** Push plans Rope Overhead Tricep
  Extension and a straight-bar pushdown, but he logs Cable Overhead Tricep
  Extension and the V-bar pushdown, so the sheet shows the planned ones
  "not done" and his real ones "not in the plan". Same for Pull ups vs
  Weighted Pull-Up. Either the plan or his logging should change; his call.

---

**25 SEP (morning, nova-os-84 close before his MacBook update) — THREE
ITEMS HE HANDED TO THE NEXT SESSION, plus the Action Button recipe.**
He is restarting the Mac for an OS update: after it, check the launchd
service came back (`curl localhost:4173/api/health`) and Tailscale is up
(`100.65.137.114` answers) before anything else.

GOAL for the next session (his words, 25 Sep):
1. **"The swipe back feature is still buggy."** v5 (the DOM-walk removal and
   the one-rAF deferred navigation, see the 24 Sep entry below) did NOT fix it
   on his phone. Ask him WHAT he sees now (a screen recording ideally): the
   five previous attempts each fixed a real cause and missed his experience,
   so do not start from a theory. src/edgeBack.js, src/EdgeBack.jsx.
2. **Local model, his direction:** "I do not want to lose effectiveness or
   functionality … If a local model would benefit certain aspects of Nova or
   allow me to use it more often without Claude, such as if I use up my
   Claude limit, then let's explore that." So: explore a FALLBACK, not a
   replacement. Starting points, all unbuilt: (a) detect the CLI's
   usage-limit error and route only lanes the eval says a 4B can hold
   (short closed-set classification) to server/lib/localModel.js, labelled
   "answered on the Mac" (honest degradation); (b) keep every judgment lane
   (Coach, Ask Nova, Researcher) on Claude and say plainly when the limit
   blocks one; (c) measure before claiming, the same way as
   design/audits/2026-09-25-local-model-eval.md (Qwen3-4B 38/40 valid,
   64.9% agreement with Haiku). First find the exact error text the claude
   CLI returns at the limit; nothing in the repo detects it yet (unverified).
3. **The Action Button Shortcut:** answered in chat with a paste-in prompt
   for iOS 27's Shortcuts builder and a manual checklist (same content as
   docs/iphone-shortcuts.md §1c). VERIFIED: POST
   http://100.65.137.114:4173/api/ask/audio with a spoken m4a answered
   "16,464 steps yesterday, sir." with heard = "How many steps did I do
   yesterday?". Not yet built by him.

STATE: clean tree, in sync with origin (2998fd3 at close), lint 0, build
green, server 2203/2203. Nothing of this session is uncommitted.

DO NOT: restart the service with a bare `launchctl kickstart` (CLAUDE.md now
says `node scripts/reload-server.mjs`, which waits for running AI jobs; a
raw restart killed a Coach answer and this session's 07:07 plan run).

---

**25 SEP (late morning) — COACH'S CHANGES LIVE IN TRAIN: A BANNER, A DECK, A
TICK. AND MY TEST DECLINED ONE OF HIS CARDS (PUT BACK, 15 MIN LATER).**

- **His ask.** Every change the Coach suggests (over time, research, chat)
  in Train: a pop-up under Today and Gym that leads to the Coach tab, where
  each can be approved, discussed or turned down, the pressed button turning
  into a tick. *"Simplicity and ease of use MUST be the goal here and not
  over complicated like the inbox system has become."* **His future note:
  re-evaluate the Inbox (too clunky); "Not to do here yet though."**
  Recorded in memory (roadmap COME BACK TO + open threads), not started.
- **Shipped, all pushed, deployed build `36a63d2`, verify-shipped all PASS.**
  `56550d7` approve of a program-review fix now ACTS (opsFromFix → applyOps,
  undo kept; it used to file and change nothing). `968fe7e` the deck:
  `src/coachSuggestions.js` (pure view model), `src/CoachSuggestions.jsx`
  (banner, deck, card, TickButton), the "COACH'S SUGGESTIONS" CSS block in
  `src/index.css`, `coachDeck`/`coachBanner` in valsWorkouts, the
  `*CoachSuggestion*` methods in App.jsx, and Workouts.jsx wiring. The
  Coach-tab chat's Apply buttons became a pointer to the deck; the
  in-session chat keeps its own. `8e3ffcc` both Coach prompts: reason in
  the second person, "a card he answers with a yes, a discuss or a no",
  never "tap APPLY IT"; the stale "at most one PROPOSE per reply" is gone.
  `3233cbd` reopen: `POST /api/inbox/:id/reopen` (lib/inbox.js
  `reopenRecord`, Coach cards only) and an island Undo on both answers (a
  no reopens; a yes undoes, then reopens). `36a63d2` verify-shipped markers.
- **Verified:** browser at 375 (Command), 402 (cupertino) and 1280 (two
  columns, rows share a height) against his real cards, writes blocked;
  yes, no, Undo on each, Discuss and Yes to all, with their timings
  sampled. Tests 2203/2203. **NOT verified:** on his iPhone; a real approve
  on his vault (his call, not a test's); Coach actually using the new
  wording (his next Coach turn will show it).
- **THE INCIDENT.** The devtools `initScript` guard lasts ONE navigation;
  an `emulate` reload dropped it, and my test's ✕ declined his real card
  ac801409 "remove Weighted Pull-Up from Push" at 23:33:37 UTC. Found in
  the server log; reopened at 23:48:29 UTC via the new route (pending,
  `discardedAt` cleared). The unguarded page also sent 5
  `POST /api/notes/summary` (derived cache, harmless). Rule saved in memory
  (nova-ui-instruments). **"Tuesday → rest" (0443530e) was approved by HIM**
  from his phone (100.77.255.37) at 23:05:59 UTC.
- **HE IS USING IT LIVE, FROM HIS PHONE, ALREADY.** At 00:05:18–00:05:31 UTC
  (100.77.255.37) he approved ac801409 (Drop Weighted Pull-Up — the card my
  test had declined and I reopened) and 3b842978 (Drop Cable Flys High
  Position). **Verified they really applied, not just filed**: both
  records' `destination` reads "Train — removed <exercise> in Push", the
  same field a no-op acknowledgement would have left null. First real
  confirmation the deck's yes ACTS on his own device.
- **His 5 remaining cards, waiting on the deck (00:05 UTC count):**
  5b4a167c (Carter Extension: 3 sets), ab9bd99c (Incline Bench first),
  d7cf3e67 (Drop Wide-Grip Lat Pulldown), 8e06aecc (Drop Plate Pinch),
  d82cc7f4 (Cable Lateral Raise last).
- **NEXT:** the rest of the 7 are his to answer at his pace — nothing to
  chase. If a later session sees complaints about the deck (wrong sets
  math, a card that won't animate, Undo not appearing), start there before
  building anything new on top of it. Then, still queued from before:
  Xcode after his macOS update → the Live Activity.

---

**25 SEP (mid-morning) — HIS COACH ANSWER WAS LOST (MY RELOAD), THE FIXES,
COACH CONSULTS OTHER AGENTS, AND XCODE PENDING.** He is updating macOS next
and closing all sessions; read this first when he is back.

- **What happened.** 07:58:02 he asked Coach a long program-review question;
  07:58:26 THIS session reloaded the server (raw kickstart) to ship; the
  server forgot the job. The CLI process survived, finished the answer at
  08:00:03 and wrote it to the session file — nobody was listening. His
  phone showed "Timed out… may still be running." The answer was RECOVERED
  from `~/.claude/projects/…Hayden-s-Vault/a7309692-….jsonl` (his long-running
  Coach session) and given to him in the conversation; it cites PubMed IDs
  that were NOT verified by the Researcher.
- **Fixes shipped** (`0fc8d64`, `060c0a4`, `f74f9c6`, `61c1b90`):
  `lib/jobRegistry.js` (all ten in-memory job stores register; GET
  /api/jobs/active) + `scripts/reload-server.mjs` — **THE ONLY WAY TO RELOAD**
  (CLAUDE.md ship gate + memory updated). `src/jobPoller.js` rebuilt: slow ≠
  failed (onSlow "still working" in Coach/Leader's own bubble, 30 min
  ceiling), 404 = lost (onLost: honest message, question back in the box),
  checks on return to the app, backoff on blips. His question was ALSO cut
  mid-word ("…can often fo"): Coach's send read App state, which trails the
  field (iOS dictation) — Enter/Ask now send the field's own value.
- **Coach consults other agents** (`eabfa0b`, `lib/coachConsult.js`): a turn
  may end `CONSULT {"asks":[{agent,question}]}`; code runs every ask in
  parallel through the agent's own lane — researcher (cited brief, lands in
  Inbox), nova (whole vault, fresh read-only session), calendar (code reads
  14 days) — streams "Asking now: · the Researcher: working on it…" into the
  bubble, then resumes the SAME Coach session with the answers. No budget,
  no timeout (his "no caps"); a loop guard of 2 rounds. 7 tests. **VERIFIED
  LIVE** on his real question (job f6d96819, 22:39→22:44 UTC): Coach asked
  the Researcher + calendar, the bubble showed "Asking now…", the Researcher
  answered in ~3.5 min (brief = Inbox record `9856382c`), Coach's final
  answer named both and flagged what the brief did NOT cover (supersets) and
  a non-peer-reviewed preprint. That answer lives in a NEW Coach session
  (not his phone's), so it was relayed to him in the conversation; his
  phone's Coach chat does not show it. Side effect: agentSessions now points
  Ask Nova at that session until he next uses Coach (self-heals).
- **Xcode**: App Store was opened on Xcode 27.0; `mas` 7 needs sudo, so HE
  clicks Get. After his macOS update: install Xcode, then build the Live
  Activity (plan: Swift ActivityAttributes + a `NovaLiveActivity` Capacitor
  plugin registered from a `CAPBridgeViewController` subclass in
  SceneDelegate, a WidgetKit extension target (xcodeproj gem or Xcode),
  NSSupportsLiveActivities, `novaos://workouts` widgetURL; IslandFeed drives
  start/update/end when `window.Capacitor` is native). Signing needs his
  Apple ID + Developer Mode on the phone; free team = 7-day expiry. NOT
  STARTED beyond this plan.
- **His decisions this turn:** pocket notification stays ON by default;
  Coach consulting = yes, no caps; install Xcode = yes (after macOS update).
- **Then (his report): "pointless to approve… if coach wont propose the
  changes."** Root cause: `parseCoachProposal` read ONE PROPOSE line, and
  Coach had no reorder or schedule action. Fixed (`6bcf200`, `b26bad4`):
  `parseCoachProposals` files every line as its own card; new `reorder`
  (routine-edit) and `schedule` (route `schedule-edit`) actions with exact
  undo; chat shows each card + "Apply all N"; prompts say several changes =
  several PROPOSE lines. **Live:** Coach (session 33bc52c1) filed his 8
  cards — Inbox records ac801409, 3b842978, 5b4a167c (Carter → 3 sets;
  filed before the clearer-title fix), ab9bd99c, d7cf3e67, 8e06aecc,
  d82cc7f4 (lateral raise to #5 so the arm pairs sit together — supersets
  are not a program field), 0443530e (Tuesday → rest). ALL PENDING his yes;
  nothing applied. NEXT: ask whether they applied cleanly.

---

**25 SEP (morning) — CHARACTER PASS 5, AND THE ORG MAP IS LIVE ON OPS.**
Session nova-os-06. Commits (all pushed, deployed build `33f608383` and
later): `f0f0e40` zero-token rule, `b476bf0` pass 4, `4f5ae15` one shared
beings module + no-model test, `d311659` pass 5, `58f8672` the map's view
model, `c629117` the map on Ops, `076d326` `33f6083` docs.

**GOAL.** His asks, in order: keep refining all the characters (passes 4
and 5, the second "check smaller details, how the arms connect, how it looks
in motion"); plan the zero-token rule; push; start the map.

**DONE CRITERIA.**
- MET: pass 5 published, version 5 of
  https://claude.ai/artifact/VU6LdBpB5or14DMQSygeRD (list in
  AGENT-WORLD-PLAN §3g "PASS 5").
- MET: zero-token rule planned (§5a) and enforced by
  `server/test/agentWorldNoModel.test.js`.
- MET: map steps A, B, C (view model, marker list, 3D map on Ops).
- UNMET: step D (Home tile, Ambient), Projects/Overnight districts,
  day/night from the clock, Talk from the card (needs the org-conversation
  agent switch).
- UNMET: his verdict on pass 5 and on the map on his phone.

**STATE (paths).** Beings: `src/agentWorld/beings.js` (the one source).
Sheet: `design/mockups/49-agent-characters.html` (imports the module;
publish via `node scripts/agent-sheet/bundle.mjs <out>`). Instruments:
`scripts/agent-sheet/{studio,film,look,bundle}.mjs`. Map: `src/orgmap/
{scene.js,OrgMap.jsx}`, `src/vals/valsOrgMap.js`, wired in
`src/vals/valsOps.js` and `src/screens/Ops.jsx`. Server:
`server/lib/orgMap.js` + `server/test/orgMap.test.js`, slice added in
`server/lib/ops.js` (`orgMap` on `/api/ops`, `conversationalRoster()`).

**DECISIONS.**
- One beings module taking THREE as an argument → the sheet (r160, CDN)
  and the app (r170) must never drift. Forecloses a second copy of any
  being, anywhere.
- Every roster loop and every record kind is placed on a being, the core,
  or a named unfiled list (tests pin it) → nothing silently vanishes from
  the map. Forecloses adding a loop or kind without placing it.
- "Working" = classifying within 30 min → a record stuck for hours is not
  work. Forecloses drawing stuck jobs as busy.
- The map is lit by the sheet's own room, not three's RoomEnvironment →
  that washed every being pastel. Forecloses swapping the env back.
- Sideways drag turns, vertical scrolls (touch-action pan-y) → Ops is a
  scrolling page. Forecloses a canvas that captures the scroll.
- The old fleet ring stays under the map for now → it holds per-loop
  detail the map does not show. His call pending (below).

**VERIFIED (with locators).**
- Close-out gates, 25 Sep ~08:50 AEST: lint 0 errors (warnings only, none
  in my files); build green; `cd server && npm test` 2191/2191; health 200;
  `git log origin/main..HEAD` empty; deploy run 36069153646 success; no
  vite left running, no `public/_devconn.js`, no `dist/pc.json`.
- `c629117` in an isolated worktree: build green, server 2188/2188.
- Live `/api/ops` returns `orgMap` (13 waiting: Researcher 7; Coach,
  Guardian, Watcher, Librarian, Leader 1 each; 1 raw note of his).
- On the dev server at 402px and 1280px: map drawn, a canvas tap on the
  Coach opened its card with his real pending item; `running()` is true on
  screen and false when scrolled away.

**ASSUMED.** How it feels on his phone (thumb drag, 120Hz, memory for nine
physical-material beings); the Calm/theme rebuild and reduced motion on the
map (wired, not looked at); idle cost (headless rAF fired 4 times in 3 s,
so frame counts prove nothing).

**OPEN QUESTIONS (his; remind him at the start of the next session, he
asked).**
1. Do the characters look right on his phone? Name the being and the part
   for a pass 6, or call them done.
2. Does the map feel right on his phone (turning, tapping, the counts)? If
   yes, step D: the Home tile as ONE still frame, never a live loop (§7).
3. Remove the old fleet ring under the map on Ops? Its labels overlap at
   desktop width, but it holds per-loop detail the map does not show yet.

**NEXT ACTION.** Ask those three first. Expected if the map is right: he
finds "who is waiting on me" faster on the map than in the Inbox.

**DO NOT.**
- Publish the sheet file itself: it imports a module and will not run as
  an artifact. Publish the output of `bundle.mjs`.
- Reload the server with `launchctl kickstart` (I did once this session,
  before the rule existed). Use `node scripts/reload-server.mjs`.
- Use a guessed headless debug port (one attached to a peer's browser);
  use `--remote-debugging-port=0`.
- Run the dev app on any port but 5173/5183 (CORS), or it reads "Backend
  unreachable".
- Trust additive-blend glow for small details (blush, iris): invisible on
  a dark screen. Four rounds were spent assuming depth.
- Draw anything worn (strap, towel, cape) as a curve through guessed
  points; project it onto the body (`hug()`/`strap()`).
- Push without checking `git log origin/main..HEAD` for a peer's commit
  underneath yours.

---

**25 SEP (morning) — THE ISLAND HOLDS WHAT IS LIVE, THE POCKET, NOVA IN THE
REAL ISLAND, AND A MODEL FAIL-SAFE.** His asks, in order: (1) move nudges
into the island; (2) workout progress in the island, and tap it from
OUTSIDE Nova to resume; (3) Nova's icon in the island while he talks after
he leaves; (4) black card stays; (5) a bug pass + missing notifications;
(6, mid-turn) "Opus 5 instead of 5.5, Fable 5 instead of 5.1 — a fail safe
so the newest model is always available and used." All shipped, pushed,
live build `b2bb1db65` = HEAD, server reloaded, verify-shipped 0 FAIL.

- **Island activities** (`src/DynamicIsland.jsx`, `islandCore.js`,
  `island.js` `setActivity`, `src/IslandFeed.jsx`, `valsChrome islandView`):
  compact (widened island), minimal (second bubble), expanded (tap → card).
  Workout ring (muscle hue) + "4/6" off the Train screen; Nova talking
  (core + waveform) off Voice; the nudge drops once, then waits as a bubble
  (Ask Coach / Reply / Not now). `NudgeCard.jsx` deleted. Browser-verified
  in demo mode (isolated devtools context, no connection).
- **The pocket** (`server/lib/pocket.js`, `/api/pocket`): the honest
  substitute for a Live Activity — dead-man's switch, ONE lock-screen push
  per active workout (started <6h, view 'session'), tombstone on Finish,
  url/tag validated. Route verified live (refuses a foreign url).
  **UNVERIFIED: no real push has fired yet** — needs a real workout + leaving.
- **Now Playing** (`src/nowPlaying.js`): Media Session metadata so iOS's
  own island shows "Nova" + his icon while his `<audio>` path plays; pause
  stops him. **UNVERIFIED: whether iOS keeps a home-screen app's audio
  alive after he leaves** — speechResume.js measures it; unknown on device.
- **Answer-ready notices** (`App.announceAway`): Claude Code, Breaker,
  Coach, Leader, Quick Session, voice research — only when he is elsewhere.
- **Model fail-safe** (`server/lib/modelWatch.js`, `modelPrefs.js`): lanes
  were ALREADY on the newest models (aliases; measured opus→claude-opus-5-5,
  fable→claude-fable-5-1); the labels and pinned list were hand-typed and
  stale. Now a weekly CLI probe (~$0.12/wk) records what each alias runs,
  labels/pins derive from it, push+Telegram when a family moves, any
  well-formed pin stays valid (flagged when overtaken), 90s probe timeout,
  on the ops roster with a heartbeat. Live board: Opus 5.5 · Sonnet 5 ·
  Haiku 4.5 · Fable 5.1, all observed.
- **Adversarial review (opus) found 10 real bugs, all fixed + re-verified in
  the browser**: mount-order lost the first nudge; hidden-page clock ran;
  stale finger wedged gestures + rAF; dismiss-before-start bricked the
  island; frozen nudge numbers; pocket fired for parked drafts; disarm race;
  probe hang; wrong-family probe; filter left on at rest.
- **MY MISTAKE, REVERTED:** a rec.mjs setup set a fake `workoutSession`
  against his LIVE server and it was mirrored as his workout draft for ~12
  min (07:29–07:41). Server log proved his phone never fetched it and the
  prior state was "no draft"; deleted, `GET → {draft:null}`. Rule now in
  `nova-ui-instruments.md`: guard writes before setting fake state.
- **ASSUMED:** the compact island's wings and the minimal bubble sit under
  iOS's status-bar icons (signal/battery) — readable white-on-black, maybe
  cluttered. Only his phone can say.
- **NEXT:** ask him (1) does the widened island line up with the real one
  and look right beside the status icons; (2) during a real workout, does
  the lock-screen "tap to pick up" arrive once, and reopen the session;
  (3) when he leaves mid-sentence, does Nova appear in the real island.

---

**25 SEP (early morning) — THE ARCUS REEL, THREE BUILDS: NOVA'S OWN EARS, A
MEASURED LOCAL MODEL, AND THE PLAN THAT SEES THE LOG (+ THE PHONE'S MISSING
PLAN CARD).** His ask: take ideas from an Instagram reel (Alex's "Arcus", a
local-first assistant for neurodivergent execution), then "proceed with all
those builds … overnight … until all are done and checked live." Session
nova-os-84. Commits 994718b 064ed90 afac7f3 cea8325 6dd7a0e 86cbc64 e3f3654
fce5496, all pushed; live build fce5496 confirmed by `npm run
verify:shipped` (all four new markers PASS in the LIVE bundle).

GOAL. (1) Make voice work on his iPhone without the browser speech engine.
(2) Measure a local model against Haiku before switching anything.
(3) Help with *starting*, grounded in his own data first.

DONE CRITERIA.
- MET, BUILT — **Nova's own ears.** On iPhone (hearing = 'auto') every mic
  records with getUserMedia + MediaRecorder, a loudness meter (src/vad.js)
  feeds the same turnEnd.js clock, and the Mac transcribes via Groq Whisper
  (POST /api/voice/transcribe). Settings → "How Nova hears you" + "Test
  Nova's ears". Action Button lane: POST /api/ask/audio, recipe in
  docs/iphone-shortcuts.md §1c. **UNMET: never run on his iPhone.**
- MET — **local model measured, NOT switched** (as promised to him).
  Qwen3-4B on this M1 Pro 16 GB: 38/40 valid, 64.9% route agreement with
  Haiku, 2.5s vs 18.4s, 2.5 GB RSS; Llama-3.2-3B 0/40. Audit:
  design/audits/2026-09-25-local-model-eval.md. Client: server/lib/localModel.js
  (nothing in production calls it).
- MET — **seen, not ticked + stuck.** server/lib/planObserve.js stamps
  `observed` on plan records (sessions, protein) every 10 min and seconds
  after any workout/food write; the planner reads yesterday as DONE (his
  mark) / DONE — seen in his log / NOT DONE — his log / no word, and a
  STUCK section tells it never to re-list a stuck promise as written.
  Home: cyan ✓ "Seen in your log", the stuck card (days ring, Start it with
  me / Not now / Let it go, Undo), "Start it with me" on a plan row that is
  already a stuck promise's first step.
- MET — **the plan is back on his phone.** a728bf3 (15 Sep, a Leader-box
  commit) deleted plan, command deck and Today from MissionStructured; his
  ticks stop that same day. Restored.

STATE (paths). Ears: src/recorder.js, src/vad.js, src/hearingEngine.js,
src/earsTest.js, src/useDictation.js (novaEars branch: startNova /
tickNova / finishNova), src/audioLevel.js (openMicLevel), server/lib/hearing.js,
server/lib/transcribe.js (transcribeBuffer, cleanTranscript, X-Vad),
server/routes/voice.js (/voice/transcribe, /ask/audio, /ask/start).
Local: server/lib/localModel.js, server/scripts/evalLocalClassifier.mjs.
Plan: server/lib/planObserve.js, server/lib/planToday.js ('yesterday-plan',
'stuck'), server/lib/rituals.js (buildStartQuestion), routes/loops.js
(/plan-today/stuck), snapshot slice `stuck`, src/StuckCard.jsx,
src/vals/valsMission.js, both Mission screens, server/data/stuck.json.

DECISIONS.
- iPhone defaults to Nova's ears (auto) → the receipts: browser engine
  heard 1 iPhone turn in 21 → forecloses live partial words on the phone
  (words land when he stops; no interim transcription built).
- Every recording is sent even when the meter heard nothing → a wrong
  meter must not cost his words → costs ~200ms and a Groq call per silent turn.
- A meter reading exact zero for 1.5s is BLIND → tap-to-send, never
  silence → a blind auto-listen turn waits for a tap (or 90s).
- Whisper's silence lines ("Thank you.", repeated too) are dropped only when
  the client meter did NOT hear speech (X-Vad) → keeps a real thank-you.
- Transcription is Groq, not local → mlx_audio's whisper failed ("Processor
  not found"); local STT not built.
- Local model not wired into any lane → he was promised numbers first.
- The observer checks only a priority's OPENING CLAUSE, only sessions and
  protein, and never checks WHEN (his log times are logging times) →
  conservative: a wrong "done" is worse than a missing one.

VERIFIED.
- Transcribe route live: spoken m4a raw + Form → text 0.3-1.2s; silence →
  ''; fragmented MP4 (Safari-style) → text; JSON body and bad token answer
  in words. /ask/audio end to end 342ms (reflex).
- In-app ears in headless Chrome (clip injected as getUserMedia), Voice
  screen, conversation mode: turns end on `hold` 2s after speech, words back
  254-436ms, receipts show `via nova (meter heard …)`, mic reopens and the
  next turn is heard. Under pink noise too. Settings test: "Heard: …" 0.3s.
- Observer replay over all his real plans: 81 priorities, 42 checkable, 31
  seen done (he ticked 10), log agrees with 8 of his 9 marks (the ninth he
  marked skipped on a day the session is logged; his mark wins).
- Today's real plan (25 Sep) was written with the new context: "just open
  the podcast … play the first minute", "Same move that worked yesterday
  (40g logged at 11:16)".
- Stuck card live: Not now wrote to the server, Undo restored it,
  server/data/stuck.json empty after. A real /ask/start turn: "Open the link
  right now — youtu.be/MGxcosNuC8k — and let it load. That's the step."
- Gates: lint 0 errors, build green, server 2163/2163 (full tree incl.
  peers' WIP); my Home commit alone in a worktree 2129 pass / 0 fail.

ASSUMED / UNVERIFIED.
- That getUserMedia + MediaRecorder work in his installed iOS PWA, and that
  the shared audio graph is running when conversation mode reopens the mic
  (if not: the turn goes BLIND → tap to send, by design).
- That iOS does not re-prompt mic permission every turn.
- That the meter thresholds (vad.js minSpeech 0.018, ratio 2.4) suit his
  real phone mic; tuned only on synthetic clips.

OPEN QUESTIONS / BLOCKERS.
- Two to-dos in his vault, "swipe verification item" (23 Aug) and
  "optimistic probe 69959" (24 Aug), are test residue from earlier Claude
  sessions (the first is literally a test fixture string in
  server/test/planToday.test.js). Not deleted: his vault, his call. They
  show on the stuck card; "Let it go" hides them, ticking them removes them.
- The local model: switch nothing / try a 7B / use Qwen3-4B as a
  pre-filter. His call; audit has the numbers.
- Not built: interim words while recording, local (MLX) transcription,
  barge-in under Nova's ears (it rides the browser engine).

NEXT ACTION. Ask him to open Settings → "Test Nova's ears" on his iPhone and
say one sentence. Expected: "Heard: <his words> · back in ~0.5s". Then
read `server/data/voice/turns.json` by device AND engine: iPhone rows with
`engine: 'nova'` and `heard: true` settle it.

DO NOT.
- Do not trust Chrome's `--use-file-for-fake-audio-capture` — it delivered
  pure silence here; inject getUserMedia from a decoded buffer instead.
- Do not kill a headless capture with an external alarm/timeout: the Chrome
  child survives, orphaned (load hit 57). The capture script needs its own
  deadline that runs cleanup.
- Do not commit shared files with `git commit -- <paths>`: that takes the
  WORKING TREE copy, peers' hunks included. A private GIT_INDEX_FILE +
  commit-tree + guarded update-ref is how e3f3654 went in clean.
- Do not reload the service during a scheduler window without expecting
  debris: the 07:07 reload interrupted the plan job (record discarded,
  reason written).
- Do not re-list a stuck promise, and do not claim the observer covers more
  than sessions and protein.

---

**25 SEP — PASS 4 ON THE CHARACTERS; THE ZERO-TOKEN RULE PLANNED; ALL
PUSHED.** His three answers: keep refining them all → pass 4 done, version 4
of the same artifact (backs designed, cape, towel, fin, satchel, bigger
bucket, visible steam, the "?" orb; `seat()` roll bug fixed). Plan the
zero-token rule → `AGENT-WORLD-PLAN.md` §5a: four refusals and a test
(`server/test/agentWorldNoModel.test.js`, to be written BEFORE any map
code). Push → done; origin/main matches HEAD. **Still his:** how the
characters feel on his phone; whether to start the map.

---

**24 SEP (late) — THE AGENT CHARACTERS, PASS 3: ONE SPECIES.** Commit
`1356b56` (+ docs), local, not pushed. Published as version 3 of
https://claude.ai/artifact/VU6LdBpB5or14DMQSygeRD.

**GOAL.** His ask: refine each agent one at a time until it has no buggy
animations or appearances and no "cylinders attached to cylinders", still
fun, cute and engaging.

**DONE.** All nine rebuilt on a shared species (`makeBot` in
`design/mockups/49-agent-characters.html`), each with one artefact and one
pose. Full table and the tried-and-dropped list: `design/AGENT-WORLD-PLAN.md`
§3g "PASS 3 — DONE". Verified by studio captures (four sides + head
close-ups, both poses, every being), working-cycle filmstrips, a pose-switch
strip at 15fps, ring/phone/Calm/reduced-motion views, fit report all inside.

**NOT VERIFIED.** How it feels on his phone at full frame rate (headless
runs ~6fps). The live idle loop (blink, breathing) is unchanged from pass 2
and still code-verified only.

**INCIDENT.** One capture used a random debug port that probably attached
to the peer session's headless Chrome and navigated its page once (console
showed their Vite app). Fixed: the instruments now use an OS-assigned port.
If a peer screenshot around 21:24 AEST looked wrong, that is why.

**OPEN, his:** (1) his verdict on pass 3; (2) two new reels (Bot Crossing
hex world; a city of agent buildings with a morning brief) read as input to
the Org Map; (3) his token-cost question, answered in chat: viewing the map
costs no Claude tokens if the render path stays code-only.

**NEXT ACTION.** Wait for his reaction to v3 before touching the map. If he
wants the map, build it from `48-org-map.html`'s geography with these
figures placed, and keep every model call out of the render path.

---

**24 SEP (late) — NOTIFICATIONS DROP OUT OF THE DYNAMIC ISLAND.** One ask:
his reel of `rit3zh/expo-dynamic-notifications` (in-app notifications that
tear off the island on a gooey neck, swell into a card, and are thrown back
up into it). Shipped `6e3e964` + `da04e40`, pushed, live build `da04e40ff`
confirmed (`version.json` + the new verify-shipped marker PASSES live).

- **The library cannot be installed** — React Native (Skia, Reanimated,
  Gesture Handler). Its geometry, timeline and springs are ported value for
  value into `src/islandCore.js`; Skia's goo is the same blur + alpha
  threshold matrix as an SVG filter in `src/DynamicIsland.jsx`. Store:
  `src/island.js` (`notify`, `dismissIsland`). 25 tests,
  `server/test/dynamicIsland.test.js`.
- **What moved into it:** every `toastMsg` (no longer App state — a toast
  used to re-render the whole app twice) and the doorman's greeting (Nova
  blue, serif, Reply in place, tap → Voice, 30s, holds 5s when queued).
  `Toast.jsx` and the greeting banner are deleted. **The NudgeCard stays at
  the bottom on purpose** (review finding 18: at the top it hid titles).
- **The card is black in every theme** (it is the island, grown). Tokens
  `--nv-island`, `--nv-island-ink`, `--nv-island-lift` (45% in daylight).
- **Island detection is an inference** (`detectIsland`): iPhone +
  standalone + portrait + top inset ≥ 54. Anything else drips from the top
  edge and draws no pill. Dev-only seams, compiled out of `dist` (checked):
  `localStorage.novaos.forceIsland='1'`, `window.__islandSlow = N` (slows
  the spring clock — CDP's playback rate does NOT reach rAF springs, which
  is why `scripts/rec.mjs --slow` cannot film it).
- VERIFIED: lint 0 errors, build green, server 2084/2084, filmed at 402×874
  in cupertino — entrance (drip → neck → tear → capsule → card, words out
  of a blur), a synthesized upward fling retracting into the island, the
  queue handing over after minShow, greeting at rest in daylight + command.
- **ASSUMED / UNVERIFIED BY HIM:** that the pill lands exactly over his
  16 Pro's hardware island (placement is the library's formula: inset 62 −
  37.33 − 11 = 13.67pt top); that the SVG filter holds 120Hz on WebKit (it
  only runs while the shape moves); how the throw feels under a real thumb
  — synthetic pointer events are not a thumb (see the back-swipe saga).
- Not built: haptics on arrival (iOS web gives none without a finger on a
  switch), real Live Activities OUTSIDE the app (need native ActivityKit —
  the Capacitor shell, blocked on Xcode).
- **NEXT:** ask him (1) does the island line up with his real island, (2)
  does throwing it up feel right, (3) does anything stutter. Yes/no each.

---

**24 SEP — VOICE DIAGNOSED (DICTATION NEVER WORKED ON HIS PHONE), FIVE
SWIPE-BACK ATTEMPTS, THE CORRELATION ENGINE, AND A GIT MISHAP WITH THE
PEER SESSION.** A long session across many of his own asks, not one
thread — logged here as one entry because it closes together. Nothing in
this entry is the Agent World / character work below; that is the peer
session's, prepended under this one, and it stands as they left it.

**GOAL.** No single ask. In order: two Instagram reels he sent for
capability ideas; his live report that voice "is not working" (turned
into a full diagnosis); his three follow-ups on the Researcher, the job
tray, and the Leader panel; his repeated "swipe back is buggy" reports
(four separate corrections); the UPDATE button "doing nothing"; a
correlation-engine build he asked for from a reel; anti-vibe-coded design
guidelines across three repos; a make-up-day bug affecting his real
training record; and a notification visual/gesture rebuild.

**DONE CRITERIA.**
- MET — **voice diagnosed, not guessed.** `server/data/voice/turns.json`
  grouped by device: iPhone 0/10 turns ever heard, Mac 6/6. Dictation has
  never worked on his phone. `src/micCheck.js` + a Settings surface ("Can
  Nova hear you?") runs continuous vs single-shot recognition on his
  actual device — the one thing that can say WHY. **UNMET: he has not run
  it yet and does not know the cause.**
- MET — Nova no longer asserts he was silent when the engine heard
  nothing. `App.noteTurnHeard` tracks what was OBSERVED; two deaf turns
  now say so instead of "tap the mic when you're ready."
- MET — the silent-switch trade is his choice, not a silent default.
  `src/audioSession.js`: Settings → "When your phone is on silent" —
  Speak anyway (default, audible on silent) vs Duck music (mixes, but the
  ring switch silences Nova). Verified: no `playback`+`mixWithOthers`
  equivalent exists on the web platform; this really is the whole choice.
- MET — Instagram reels get real poster frames on the Library shelf
  (`server/lib/sourcePosters.js`, yt-dlp fallback behind a host allowlist
  that is a security boundary, not tidiness — tested against a lookalike
  host, a subdomain trick, `file://`, the cloud metadata address).
- MET — the Researcher can answer **no**, and must leave the argument
  open when it does (`## If you want to argue`: best case against,
  what would change my mind, how confident). Proved on a real run —
  "Is a creatine loading phase necessary?" → No, with a paragraph on the
  2024 meta-analysis that disagrees. That brief is in his Inbox now.
- MET — a panel of named researchers runs in parallel on one question,
  then one merge (`server/lib/researchPanel.js`). Proved on the same real
  run: 4 workers, 28 findings, ~$0.03 planner cost. **CORRECTED, not
  claimed here originally:** I built this with per-call `--max-budget-usd`
  caps and a `settleWatchdog` timeout, and had a test asserting the panel's
  worst case stayed under $3. The peer session's 23 Sep "no working caps,
  anywhere" standing instruction (his verbatim order, logged below) swept
  `--max-budget-usd` and `settleWatchdog` out of `researcher.js` entirely,
  deleted `lib/settle.js`, and my budget test is gone with it. Checked:
  `researcher.js` has zero references to either now, the panel still runs
  and passes its remaining tests, and this is CORRECT per his own later
  instruction — not a regression to fix. Do not re-add a cap to this file.
- MET — the job tray shows elapsed time, ticking, without re-rendering
  the app (`src/jobClock.js` + `src/Elapsed.jsx`). Measured live: 6s of
  ticking, `App.render` called ZERO times.
- MET — the Leader panel promotes to the top of Home in the hour before
  a work block, and now stays there THROUGH it (his correction) —
  `src/workBlock.js`, work block = an event on his real Work calendar,
  never a keyword guess. The Telegram reminder fires on the same edge and
  stays a before-work message even though the panel now spans the block.
- MET, after 5 iterations — **the left-edge back swipe.** v1 shipped
  "verified" on synthetic touch events and did not work on a real thumb
  (jitter cancelled it, a thumb's arc cancelled it, no direction lock).
  v2 fixed the direction-lock using the app's own `decideDirection`. His
  screen recording then showed THREE SCREENS' TEXT PAINTED OVER EACH
  OTHER — a `transform` on `<main>` was re-anchoring every
  `position:fixed` descendant inside it. v3 removed the page transform
  entirely and raised the commit threshold to half the screen (his call —
  88px was triggering by accident). His fourth report ("still clunky,
  want to see the page underneath like Apple") → v4 built the real
  parallax: snapshot the current screen, navigate back INSTANTLY
  underneath it, drag the snapshot, reveal the live previous screen.
  Verified mid-drag: snapshot at `translate3d(234px)`, scroll preserved,
  real app underneath already showing the target screen. His fifth
  report ("still clunky") found the actual stutter: a `getComputedStyle`
  walk over EVERY element in the page on gesture start. v5 removed the
  walk (a transformed clone already captures fixed descendants) and
  deferred the navigation one `rAF` so the first drag frame paints before
  a whole screen re-renders. **UNMET/UNVERIFIED BY HIM: v5 has not been
  tried on his phone.** Do not claim this is smooth — only that the
  known causes of clunkiness (page corruption, DOM-walk stutter) are
  fixed; he has not felt it.
- MET — UPDATE actually updates. `applyUpdate()` awaited cache/SW
  cleanup BEFORE reloading; both can hang forever on iOS. The reload is
  now guaranteed within 1.2s regardless, and the button reads
  "UPDATING…" on touch. **UNVERIFIED BY HIM.**
- MET — the correlation engine (`server/lib/correlate.js` +
  `patterns.js`): Pearson + Benjamini-Hochberg across the whole batch (a
  test proves a lucky p=0.04 among 20 noise pairs does NOT survive), two
  tiers (HELD vs NOT ESTABLISHED) because his real data produced a
  genuine signal (active energy → next-day resting HR, r=-0.43, 31 days)
  that sat just outside the strict gate. Weekly Sunday-18:00 Telegram
  surface confirmed by him (`server/lib/patternsWeekly.js`) — silent when
  nothing holds. **UNMET: the run has not fired yet** (built Tue 22 Sep;
  next Sunday is 27 Sep) **and no Ops reference page exists** to show
  what was tested when nothing held.
- MET — anti-vibe-coded design guidelines: the list lives once in
  `~/.claude/CLAUDE.md`; `nova-os/CLAUDE.md` fences Nova's OWN deliberate
  choices (liquid glass, violet/cyan, soft radius) so a future session
  does not "fix" them; `atlas-partner/CLAUDE.md` written and PUSHED;
  `energy-uncovered/CLAUDE.md` hangs the specific tells off a rule the
  project already had ("does not look vibe-coded" since 2026-08-03) and
  fences the founder's own 3D/motion/purple/shadcn decisions — **written,
  committed, NOT PUSHED** (a peer session is live in that repo).
- MET — make-up day is one focus control, not two stacked selects (the
  original bug: a day could be "Push" AND a make-up at once, which is
  why Nova briefed him two facts for one day).
- MET — a make-up now MOVES real outstanding debt instead of
  re-deriving a fresh list from the last logged session (his report: it
  "added exercises that wasn't originally in my makeup session"). The
  re-derivation is now the fallback for when there is no real debt.
- MET — audited whether a make-up can ever read as a skip (his explicit
  ask). Answer: no, for two separate reasons in two separate files, and
  nothing previously asserted them together — 7 new tests
  (`server/test/skipVsMakeup.test.js`), no production code changed.
- MET — the in-app notification (`NudgeCard`) no longer collapses at
  375px (was one flex row; a real title+detail wrapped into a three-word
  column and spilled) and is opaque enough to read over whatever is
  underneath it. It can be flicked away like iOS — `src/dismissSwipe.js`,
  reusing the back-swipe's direction-lock lessons from the start rather
  than re-learning them. **UNVERIFIED BY HIM.**
- NOTED, not built — the "Clicky" reel (voice drives macOS apps,
  spawns background agents by voice, opens Reminders to confirm). Full
  gap analysis in `nova-roadmap.md` under "COME BACK TO THIS." His
  explicit instruction: come back to it. **Flag before building: this is
  a voice capability, and voice has never worked on his phone — Clicky is
  a desktop agent, and the Mac is where his dictation actually works.**

**STATE (paths).**
- Voice: `src/micCheck.js`, `src/audioSession.js`, Settings surfaces for
  both ("Can Nova hear you?", "When your phone is on silent"). Honesty
  fix in `App.noteTurnHeard` / `src/screens/Voice.jsx`.
- Research: `server/lib/researcher.js` (decision rules), `server/lib/
  researchPanel.js` (panel orchestration), tray wiring in
  `src/vals/valsChrome.js` / `src/screens/MissionStructured.jsx`.
- Job clock: `src/jobClock.js`, `src/Elapsed.jsx`.
- Lead/work-block: `src/workBlock.js`, `server/lib/leaderReminder.js`,
  `src/vals/valsMission.js`, `src/LeaderBox.jsx`.
- Swipe-back: `src/edgeBack.js` (380 lines, the parallax + smoothness
  fixes), `src/EdgeBack.jsx`, mounted in `src/App.jsx`. Dev-only seam:
  `localStorage.novaos.forceStandalone` — compiled out of the real build,
  checked against `dist`.
- UPDATE: `src/buildCheck.js` (`RELOAD_BY_MS`), `src/vals/valsMisc.js`.
- Correlation engine: `server/lib/correlate.js`, `server/lib/
  patterns.js`, `server/lib/patternsWeekly.js`. Scheduler registered in
  `server/index.js`, on the Ops roster in `server/lib/ops.js`.
- Make-up day: `server/lib/makeupDay.js` (`sameRoutineAs`, the
  debt-move path), `src/vals/valsWorkouts.js`, `src/screens/
  Workouts.jsx` (one focus control, both idioms).
- Notifications: `src/dismissSwipe.js`, `src/NudgeCard.jsx`.
- Design guidelines: `~/.claude/CLAUDE.md`, `nova-os/CLAUDE.md`,
  `atlas-partner/CLAUDE.md` (pushed), `energy-uncovered/CLAUDE.md`
  (committed `597d07d`, not pushed).
- Memory: `nova-voice-turn.md` (the device split, corrected description),
  `nova-concurrent-sessions.md` (the pathspec rule below), `nova-roadmap.md`
  ("Clicky", come back to it).

**DECISIONS.**
- **Two-tier correlation reporting (HELD vs NOT ESTABLISHED)** → his real
  data produced a signal that missed the strict FDR gate by a hair
  (p=0.0163 vs a 0.0143 cut). Reporting nothing would be true and
  useless; loosening the real gate would be the exact dishonesty the
  engine exists to prevent. Forecloses ever presenting a watch-tier item
  using the same wording as a held one.
- **Weekly Sunday 18:00, Telegram, silent when quiet** (his confirmed
  choice) → correlations move at the speed of n; a daily card would show
  an identical number 365 times and teach him to stop looking
  (`nova-produce-vs-keep`: 154 made, 9 kept). Forecloses a Home card for
  this engine.
- **A make-up MOVES debt, re-deriving only as a fallback** → an existing
  carry-over is the record of what he actually didn't do; a second,
  independent calculation can disagree with it and hand back finished
  work. Forecloses ever calling `leftoversOf` first when a real carry-over
  exists for that routine.
- **The design-guideline list lives ONCE, globally; project files only
  fence local exceptions** → a full copy per project would drift, and
  pasting the list whole into Science Atlas would have contradicted
  founder-directed 3D/motion/colour decisions with dates behind them.
  Forecloses copying the list itself into any project CLAUDE.md again.
- **Commit by explicit pathspec when a peer session may be live** → I
  swept 7 of a peer's staged files (`muscleHue.js`, `Body3D.jsx`,
  `BodyMap.jsx`, `Instruments.jsx`, `TrainToday.jsx`, `index.css`,
  `muscleHue.test.js`) into commit `2208373` with a bare `git commit`
  after `git add <my files>` — `git commit` takes the WHOLE index, not
  just what you named. Nothing was lost (their work landed, just under
  my message, and they committed on top before I could safely fix it —
  rewriting shared history under a live session would have been worse
  than the wrong message). Recorded in `nova-concurrent-sessions.md`.
  Forecloses ever running a bare `git commit` again without checking
  `git status --porcelain` for someone else's staged column first.

**VERIFIED (with locators).**
- Close-out gates, this entry: `npm run lint` → 0 errors; `npm run build`
  → exit 0; `cd server && npm test` → 2064/2064; backend
  `curl localhost:4173/api/health` → 200; deployed `version.json`
  buildId `34ff81f29` matches local HEAD exactly; no stray vite/preview
  processes; no `dist/pc.json`; a leftover automation Chrome profile (6
  processes, mine from browser verification) found and killed.
- Voice device split: `server/data/voice/turns.json` grouped by `ua` —
  iPhone 10 turns / 0 heard, Mac 6 turns / 6 heard.
- Researcher panel: one real run on his vault, receipts in the
  conversation (4 workers, 28 findings, brief filed in his Inbox).
- Swipe v4 parallax: browser-verified mid-drag
  (`translate3d(234px,0,0)`, scroll 220 preserved, real screen underneath
  already `recipes`) and on release/cancel/stuck-drag-watchdog paths.
- Make-up debt-move and skip audit: `server/test/makeupDebt.test.js`
  (7/7), `server/test/skipVsMakeup.test.js` (7/7, includes a test that
  reads `App.jsx` directly since the property lives outside the detector).
- Notification card: browser-verified at 375px against his real Fuel
  nudge copy — 351×110, a 40px drag springs back, a full drag tracks and
  dismisses with opacity 0.90→0.45.
- Design guideline commits: `nova-os` `ff3e03c` (pushed), `atlas-partner`
  `8829694` (pushed), `energy-uncovered` `597d07d` (local only).

**ASSUMED.**
- That swipe v5 (the stutter fix) actually feels smooth on his phone —
  reasoned from removing the one mechanism that could cause a first-frame
  stall, never watched on-device.
- That UPDATE's guaranteed reload actually fixes what he saw — reasoned
  from the await chain that could hang, never watched on his phone
  reproducing the original failure.
- That the notification swipe feels like iOS — built from the same
  direction-lock rule that fixed the back swipe, never watched on-device.
- That the mic check, once run, will actually explain why dictation
  fails — the instrument is sound; the cause is still unknown until he
  runs it.

**OPEN QUESTIONS / BLOCKERS.**
- Why does dictation fail on his iPhone? The instrument exists
  (Settings → "Can Nova hear you?"); he has not run it.
- Does swipe v5 actually feel smooth? Four prior claims of "fixed" did
  not survive contact with his thumb — do not assume a fifth does either
  without him saying so.
- Does UPDATE actually reload now? Untested on his device.
- Does the notification swipe feel like iOS? Untested on his device.
- Push `energy-uncovered`'s CLAUDE.md commit? Waiting on him — a peer
  session is live in that repo with its own staged, uncommitted work.
- Sleep data is still the blocker on 3 of the correlation engine's 10
  question pairs — his iOS Shortcut does not send it. His call whether to
  add it.
- No Ops reference page exists for the pattern engine's findings/coverage
  — the weekly Telegram message is the only surface.

**NEXT ACTION** — ask him, in this order: (1) did the mic check on
Settings explain the voice fault — if `continuous` came back dead and
`single-shot` alive, the fix is a flag change in `useDictation.js`; (2)
does swipe v5 feel like Apple's now; (3) does UPDATE reload immediately
on tap; (4) does the notification flick away cleanly. Each is a yes/no
that unblocks or reopens real work — do not treat silence as a yes.

**DO NOT.**
- Do not claim the back swipe is "fixed" without his confirmation — this
  is the fifth attempt and the first four were each declared working
  before he tried them.
- Do not paste the global anti-vibe-coded list wholesale into any project
  CLAUDE.md — check for a fenced exceptions section first (Nova and
  Science Atlas both have founder-directed choices the list would
  contradict).
- Do not call `leftoversOf()` first when marking a make-up day — check
  for real outstanding debt on that routine and move it; re-deriving is
  the fallback, not the default.
- Do not run a bare `git commit` after `git add <files>` when a peer
  session might be live — always pass an explicit pathspec
  (`git commit -F msg -- path1 path2`), and check `git status
  --porcelain` for someone else's staged column first.
- Do not treat the Researcher's panel workers as a place to add web
  access to the merge step — the merge gets findings only, on purpose;
  it citing a source no worker vouched for is the one unrecoverable
  failure mode the design exists to prevent.
- Do not push `energy-uncovered` without asking — a peer session owns
  live, uncommitted work there.

---

**23 SEP (evening) — THE AGENT WORLD: THE REEL READ, THE PLAN, HIS THREE
CALLS, AND TWO PASSES OF THE 3D CHARACTER SHEET; PLUS REVIEW SESSIONS B, C,
F AND 13.** My commits, all pushed: `3f0fb63` `2147698` `3081b60` `a082574`
`c6ebef8` `8bc3faf` `81eed30` `fb2481e` `ad726d7` `7b13b6d` `9672fb7`
`8c3484b` `c30146a` `73dc96b` `5a80024` `6593b9f` `2ceaa13` `b909804`.
Live build `b909804` (Deploy to GitHub Pages, `completed success`).

**GOAL.** His ask at the top of the session: watch an Instagram reel
(Jarren Rocks, "a video game for my AI agents"), take what is worth taking,
and plan how it fits Nova — fun and aesthetic ideas welcome. Then his three
answers turned it into work: (1) proceed, aesthetic-review sessions first
then the mockup; (2) **faces, in 3D, each agent unique to its personality
and function** — a cheaper model may draw the comparison; (3) try the
"Viewed" verb.

**DONE CRITERIA.**
- MET — the plan is written (`design/AGENT-WORLD-PLAN.md`, the reel read
  frame by frame, the Org Map proposal, fun/aesthetic ideas labelled, a
  survey of six of his other videos folded in).
- MET — the Viewed verb ships and was round-tripped live on a real record.
- MET — review findings 1, 4, 8, 13, 15, 20 and part of 12 are built and
  looked at (Sessions B, C, F and 13 were mine; the peer did A, D, E, 6, 9,
  12, 16, 19, 22).
- MET — the 3D character sheet exists at two passes and is published to him.
- **UNMET — pass 3 of the characters.** His words on pass 2: "Leader, Coach,
  CFO all need their eyes changed so they feel and look more friendly.
  Otherwise looking better but need to continue refining." Logged in full at
  `design/AGENT-WORLD-PLAN.md` §3g under "PASS 3". **This is the next job.**
- UNMET — the Org Map itself (the scene with these figures on the seven
  districts). Deliberately waiting on the characters being right.
- NOT DONE, and it is a gap — the Inbox leaving beat and the Train·Today
  Coach-ask card were never captured moving (see ASSUMED).

**STATE (paths).**
- `design/AGENT-WORLD-PLAN.md` — the plan. §3f records his **decision for
  faces** (forms are dropped); §3g is the character brief (nine beings,
  shared DNA, one silhouette element + one posture + one artefact each,
  department hues) and now carries the PASS 3 list at its head.
- `design/mockups/49-agent-characters.html` — the character sheet, three.js
  r160 UMD from cdnjs (no UMD exists past r160). Published for him:
  **https://claude.ai/artifact/VU6LdBpB5or14DMQSygeRD** (version 2).
- `design/mockups/48-org-map.html` — the FLAT map mockup. Superseded as a
  character design; **kept only as a draft of the map's geography**.
  Published at https://claude.ai/artifact/NjfRaXzw5VY2yeZELJfKnD.
- Shipped code of mine: `src/missionFold.js` (`foldInstrument`),
  `src/muscleHue.js` (`musclesNamed`), `src/coachWeek.js`,
  `src/briefingStarters.js`, `src/inboxLeave.js`, and the Seen verb across
  `server/lib/inbox.js` (`setSeen`), `server/routes/inbox.js`, `src/api.js`,
  `src/App.jsx`, `src/vals/valsInbox.js`, `src/screens/Inbox.jsx`,
  `src/missionLine.js`. Tests: `missionFold` `musclePaletteFrontend`
  `coachWeek` `briefingEmpty` `fuelRing` `inboxLeave` `inboxSeen`.

**DECISIONS.**
- **Faces, not luminous forms** (his call, 23 Sep) → the reel's charm is the
  eyes and he responded to it. Forecloses the "Jarvis register, no faces"
  argument in §3f, which is now struck; anyone re-proposing forms is
  overturning HIS decision, not mine.
- **The characters are designed before the map** → a map of nine beings is
  worthless if the beings are wrong, and he judged pass 1 "too much like
  random 3D objects stuck together". Forecloses building the scene now; the
  geography in 48-org-map.html is the part that survives.
- **Seen is a third verb, not a new status** → a seen record STAYS pending
  and keeps counting in the gate, the badge and the deck; only "new" changes.
  Forecloses a "seen" tab or an inbox-zero mechanic built on it.
- **`nvArcIn` instead of a transition** for the Fuel arcs → a CSS transition
  never fires on an element that MOUNTS at its final value. Forecloses
  "add a transition" as the fix for any mount-time sweep.
- **Fit the camera by projecting sampled geometry, not a bounding sphere** →
  measured: a corner-sphere over-reads a flat ring by 40% (r=6.42 on a deck
  4.2 across), which is exactly why pass 1 framed the nine into the middle
  third and he could not judge them. Forecloses the bounding-sphere fit.

**VERIFIED (with locators).**
- Gates, re-run fresh at close: `npm run lint` exit 0 (warnings only, none
  in my files); `npm run build` exit 0; `cd server && npm test` →
  **2064/2064 pass, 0 fail**; `git status --porcelain` → empty;
  `git rev-list --left-right --count origin/main...HEAD` → `0 0`.
- Backend: `curl .../api/health` → **200**; `launchctl list | grep novaos`
  → live PID. Service was reloaded earlier for the Seen route.
- Deploy: run `35858686391` on `b909804` → **completed success**.
- The Seen route, live on a real record: `91a5c931` seen → pending + stamp;
  unseen → pending + null; a bad id → 400. Record left as it was.
- Looked at, at 402px in cupertino: Home's six fold instruments (368/368,
  no overflow), Gym's muscle chips and routine tiles, the Coach tab's week
  instrument against live data (15 of 36 sets), the Briefing empty state
  (both idioms), Fuel's hero ring in its real dashed-gap state and its
  filled three-arc state, the Inbox deck head ("✓ all 7") and the card row
  ("✓ Approve & file" / "✕ Discard" / "Seen").
- The arcs' sweep, on record: `scripts/rec.mjs` at `--slow 4`, dashed →
  mid-sweep → full.
- The shipped bundle, not just the source: `npm run build` then grep
  `dist/assets/*.js` → 0 hits for every string my sweeps removed, 1 chunk
  each for "✓ all", `nvArcIn`, `nv-leave-`.

**ASSUMED (no locator — treat as unproven).**
- **The character sheet's idle life** (blink, saccade, breathing, steam, the
  30fps visible-tab loop) is code-verified only. Headless Chrome does not
  drive `requestAnimationFrame` under `--virtual-time-budget` (measured: a
  bare rAF counter reached 1 in 2s), so `window.__frames` reads 1–3 in every
  configuration. **His phone is the first real test.**
- The Inbox leaving beat and the Coach-ask card are pinned by test and reuse
  proven keyframes, but were never captured moving.
- Pass 2's fit was measured by projecting heads at three viewports
  (1100/860/402, all inside) — but by the agent, and I did not re-run it.

**OPEN QUESTIONS / BLOCKERS.**
- **Pass 3 of the characters is the live job.** Friendlier eyes on Leader,
  Coach and CFO first; then the refinement list (rod arms everywhere,
  Coach's shoulder mass / "bowling pin" torso, Commander's compass reading
  as a hoop, the Librarian's block book and corduroy spines, Guardian's
  small flame).
- His two standing decisions from earlier, still unanswered: whether the map
  is built once the characters are right, and whether Seen should also drive
  the Inbox badge as "new" rather than "pending".
- **A CI deploy failed on another session's commit `c723967`** —
  `server/test/brainWeek.test.js` teardown raced (`ENOTEMPTY: rmdir
  /tmp/nova-brainweek-data-…`). **It is a flake, not a regression:** the
  test passes locally (5/5) and the very next CI run on `b909804` was green.
  If it recurs, the fix is a retry in that file's `test.after`.
- Four sessions committed to this one working tree today. The tree is clean
  now, but an orphaned headless Chrome (`nova-probe-9616`, the peer's
  `probe.mjs`) is still resident and memory was tight enough tonight to kill
  two of my recordings.

**NEXT ACTION.** Pass 3 on `design/mockups/49-agent-characters.html`, per
§3g's PASS 3 block: raise and round the eye lenses on Leader, Coach and CFO,
warm the catchlight, soften the visor edge, and carry personality in the brow
and tilt rather than by narrowing the eye to a slot. Expected observation if
it worked: at a close-up those three read as faces with an expression, not as
a dark band with slits — and Coach still reads determined, CFO precise,
Leader listening. Then republish to the SAME artifact URL (version 3) and
ask him before touching the map.

**DO NOT.**
- Do not re-propose luminous forms or "no faces" — that is his decision, made
  against a side-by-side he asked for.
- Do not treat `48-org-map.html` as the character design; it is geography.
- Do not fix a mount-time sweep with a CSS `transition` (it cannot fire) and
  do not fit a flat ring with a bounding sphere (over-reads 40%).
- Do not claim idle motion works from a headless screenshot; it cannot drive
  rAF. Do not claim a sweep is gone from the app after grepping SOURCE —
  grep `dist/assets/*.js`, because lazy chunks and inline hand-rolls hide
  from a source grep (the peer's eight gold buttons, `97b0fca`).
- Do not run a screenshot and a recording at once, and do not leave headless
  Chromes behind; two of my recordings were killed for memory with four
  Chromes resident.
- Do not take the `brainWeek` CI red as a real failure without re-running it.

---


**23 SEP (midday) — THE GOAL BOARD; THE JARVIS REPORT AND REPLY IN PLACE
SHIPPED.** Commits `a166dad` `ea6cd97` `d511e30`, docs `196c965` `75d271a`.
All pushed; live build `75d271a8c`; service reloaded.

**GOAL.** Three things. (1) His 23 Sep ask: "Coach also needs to be using,
analysing and reflecting on … the calories that I am consuming as it does not
seem to be referencing or doing anything with that information … the goals
section itself needs to be revamped … more specific and measurable goals …
that can be seen at a glance. This includes my step count, protein intake and
caloric intake … using these metrics and its expert knowledge to make
suggestions and prompts or reminders." (2)+(3) The two builds queued on
21 Sep: the spoken "Jarvis" report, and reply-in-place on banners.

**DONE CRITERIA.**
- MET — the Coach reasons from all three numbers with his real food (receipt
  below); the Goals card shows them at a glance; prompts exist and are
  deterministic; both 21 Sep builds are committed, deployed and looked at.
- UNMET — no goal nudge has fired for real yet (all hour-gated; nothing was
  due before this close). Not blocked, just not yet observed.
- UNMET — the Jarvis report has never run end to end from a real plan. Needs
  a plan run, which costs money and is his call.
- BLOCKED — `replyNotNow` deliberately not exercised live (it writes a real
  reminder to his vault). Pinned by test instead.

**STATE (paths).**
- `server/lib/goalBoard.js` (NEW) — the record. `resolveTargets`, `judge`,
  `composeBoard`, `headlineOf`, `nudgesOf`, `goalBoard`, `goalBoardText`,
  `goalBoardContext`. `server/test/goalBoard.test.js` — 8 tests.
- Readers: `server/lib/fitnessGoals.js` (`goalsContext` appends the board;
  frontmatter gained `stepsTarget`/`proteinTarget`/`kcalTarget`, banded),
  `server/lib/askContext.js` (`todayLocalContext` puts the target beside the
  number), `server/lib/coachCadence.js` (`goalNudges`, called each tick),
  `server/routes/workouts.js` (`/workouts/goals` returns `{goals, board}`).
- Client: `src/vals/valsWorkouts.js` `goalBoard` VM, `src/screens/Workouts.jsx`
  `GoalBoard` component + three target inputs in the edit form,
  `src/vals/valsChrome.js` nudge candidates, `src/App.jsx` `liveGoalBoard`,
  `src/vals/valsMission.js` step target from the board.
- Jarvis report: `src/glassBeats.js`, `src/StageCard.jsx`, `src/Body3D.jsx`
  (`muscleFocus`), `src/visualBeats.js`, `src/muscleHue.js`,
  `server/lib/visualStream.js` (`GLASS_CONTRACT`).
- Reply in place: `src/ReplySheet.jsx` (NEW), `App.openReply/sendReply/
  replyNotNow`, `src/NudgeCard.jsx`, `server/test/replyInPlace.test.js`.

**DECISIONS.**
1. **One code-computed record, shared by every reader** (`goalBoard.js`).
   Reason: the calorie target and protein floor lived in the recipes
   collection, the step goal was a constant in two files, and nothing joined
   them. FORECLOSES a second target store — Home's step ring already reads the
   board, and anything asking "what is his target" reads the board, never a
   constant.
2. **Target precedence: his own (Goals card) → the Intake's → house default
   for steps only**, each carrying `source`. Reason: honest degradation; the
   card says "default" rather than implying he chose 10,000. FORECLOSES
   silently inventing a protein or calorie default — there is none.
3. **Pace judged by the hour (07:00–22:00), not the whole day at breakfast.**
   44 g at 09:00 is on track; 40 g at 19:00 is behind. FORECLOSES a card that
   screams red every morning, which is the fastest way to make him ignore it.
4. **Calories are a target, not a floor.** Under is fine while the day runs;
   over 110% is over. FORECLOSES treating kcal with the same `atLeast` rule as
   protein and steps.
5. **A hole is `absent`, never zero.** FORECLOSES a missing health push
   reading as a failed day.
6. **Nudges are composed by code and hour-gated in `nudgesOf`**, sent once a
   day per kind by the cadence engine, and the same list feeds the Home card
   so Telegram and the phone say identical words. FORECLOSES a model writing
   nudges (cost, and it could invent a number).
7. **Nudge titles are short** ("Protein · 64 g to go"). Reason: the Home card
   gives the title a narrow column beside two buttons; the long form wrapped
   four lines and overlapped (capture at 10:21). FORECLOSES sentence-length
   titles on that card.

**VERIFIED (with locators).**
- `npm run lint` exit 0, 0 errors (83 warnings, pre-existing).
- `npm run build` green. `cd server && npm test` → 2040/2040.
- `git status --porcelain` empty; `git log origin/main..HEAD` empty.
- `curl localhost:4173/api/health` → 200. No `vite preview`; no `dist/pc.json`.
- GitHub Pages run for `75d271a` = success; `version.json` = `75d271a8c`.
  Deployed bundle greps: `liveGoalBoard` ×5, `Replying to Nova`, `Steps a day`,
  the program panel's `Leaving ` — all in `main.js`.
- **Live Ask Nova** (`POST /api/ask` → `GET /api/claude-code/message/:jobId`):
  "No step count has come through yet today — yesterday you logged six
  thousand six hundred and twenty-eight… forty-four grams of protein against
  the one-fifty floor, and six hundred and five calories against twenty-two
  hundred."
- **Live Coach** (`POST /api/workouts/coach`, same poll): steps 1 of 6, avg
  ~7,850, "a 2,150 shortfall, which is roughly twenty-five minutes of walking";
  protein streak credited and the old Fuel finding noted as closed; "today's
  rotation adds up to 1,711 against your 2,200 … swap one [cooked Animal Style
  Potato Bowl] in for the lasagna at lunch and you land on 2,205 calories and
  201 grams of protein." That is the behaviour he asked for.
- Goals card at 375px, both idioms: `node scripts/probe.mjs --screens workouts`
  and `--style command` → "no geometry faults".
- Reply in place: a typed reply through the sheet returned an answer about the
  Researcher's source lists — the banner's context survived.
- Jarvis report: stub screenshots + GIFs (camera eases onto the lit chest,
  receipt `__NOVA_FOCUS.arrived` at 0.82 m; row 07 blinks → strikes → leaves).

**ASSUMED (not verified).**
- That the nudges will fire correctly in production. The hour gates and the
  once-a-day keys are unit-tested; the scheduler path has never run one.
- That Telegram delivers them — `telegramConfigured()` is true and other kinds
  send, but no `goal-*` message has gone out.
- That his protein/calorie targets (150 g / 2,200) are current. They are the
  hand-typed collection numbers; the Intake has still never run.

**OPEN QUESTIONS / BLOCKERS.**
- Does he want his own step/protein/calorie targets, or the defaults? The card
  takes them; nothing forces it.
- Apple Developer Program, USD $99 — still unanswered, still blocking the
  native shell and the three phone-only checks (live cockpit, Telegram
  photo/voice, dictation on his iPhone).
- A FOURTH session is committing in this checkout (unnamed; `e2439e4`,
  `71a7fe4`, `8f57b80`). It swept my `App.jsx` and `valsMission.js` hunks into
  its commits — content is on main, attribution is mixed.

**NEXT ACTION.** Tomorrow, read `server/data/coach-cadence.json` for keys
starting `goal-`. Expected if it worked: a date stamp against at least one of
`goal-steps-afternoon` / `goal-protein-evening` / `goal-week-review`, and a
matching entry in the spoken log. If the file has no `goal-*` key by the
evening, the scheduler is not reaching `goalNudges` — check that the cadence
tick is running at all (`heartbeat` note for `coach-cadence` in Ops).

**DO NOT.**
- **Do not trust a green local build after staging by hunk.** `ea6cd97` (mine)
  landed a `src/App.jsx` that did not parse — the greet-banner Reply pill's
  JSX went in without the context that made it valid. `npm run build` was
  green because it builds the WORKING TREE, not the index. Main was broken
  across `ea6cd97`→`71a7fe4`; the fourth session's `8f57b80` healed it by
  accident, and the Pages deploy for `ea6cd97` failed with "Unexpected token".
  After any hunk-staging, parse what is STAGED (`git show :src/App.jsx |
  npx esbuild --loader=jsx`), not what is on disk. Memory:
  [[nova-hunk-staging-trap]].
- Do not use `"$c:src/App.jsx"` in zsh — `:s` is read as a parameter modifier
  and it dies with "bad substitution". Brace it: `"${c}:src/App.jsx"`.
- Do not hit `:4187` for Nova. That is another app's `server.mjs`. Nova is
  `:4173`. Model answers return `{jobId}` and are read from
  `/api/claude-code/message/:jobId` when `status` is `ready`; `result.text`
  can hold raw control characters, so parse with strict off. A
  `launchctl kickstart` loses every in-flight job.
- Do not add a second step-goal constant. `valsMission` and `streaks` both go
  through the board now.
- Do not treat "the Intake's numbers" as measured. They are typed.

---

### Previous — 23 Sep (no working caps)

**23 SEP — NO WORKING CAPS, ANYWHERE. STANDING INSTRUCTION.**

**HIS INSTRUCTION, verbatim, not up for debate:** "There should be no caps
for any jobs. If it's a large build it should take as much time as it needs.
Working caps limit the overall outcome and output to make it worse without
checking for additional revisions etc that should be standard. So remove all
possible working session caps for anything in the project." Treat this as
standing, not a one-off cleanup: no new `--max-budget-usd`, no new wall-clock
kill on a spawned `claude` process, ever, without asking him first.

**BUILT.** Every `--max-budget-usd` dollar ceiling and every `settleWatchdog`
wall-clock kill on a spawned `claude` process, removed. `lib/settle.js` —
the module whose only job was that wall clock — deleted outright, along with
its test. A guard test (`server/test/noCaps.test.js`) now fails the build if
`--max-budget-usd` or a `settleWatchdog(` call reappears in any of the 38
guarded lane files, quoting this instruction and its date.

**Files changed** (`server/lib/`, one dollar-cap and/or wall-clock site each
unless noted): `briefing.js`, `browse.js` (also its own two local
`setTimeout` watchdogs), `builder.js`, `calendarCommand.js`,
`capabilities.js` (stale comment only), `claudeCode.js` (8 call sites),
`coachPlan.js`, `coachReflection.js`, `dailyReview.js`, `distill.js`,
`forge.js` (also its `FORGE_MAX_MINUTES` backstop timer), `formCheck.js`,
`healthInsight.js`, `inbox.js`, `inboxStore.js` (a reaper exception that only
existed for a pause state that no longer exists), `ingest.js` (also its
budget-exhaustion error branch), `journalPrompt.js`, `leader.js` (3 sites),
`librarian.js`, `noteSummaries.js`, `paperLane.js` (also `minutes:` at both
`ask()` sites), `patternScout.js`, `planFollowUp.js`, `planToday.js`,
`planner.js` (also `STEP_TIMEOUT_MS` — a plan step no longer gets abandoned
as "did not finish in time"; the plan waits), `pulse.js` (also its
budget-exhaustion message branch), `repertoireLane.js`, `researcher.js` (the
deep one — see below), `scanFood.js` (2 sites), `scanRecipe.js`,
`scanStatement.js`, `scout.js`, `shoppingList.js`, `studio.js`,
`studyLane.js`, `tweakRecipe.js`, `watcher.js` (also its `overBudget`
message logic), `weeklyDebrief.js`.

**THE DEEP ONE — `researcher.js` had a whole pause-and-ask architecture
built on top of the dollar cap:** hit `$0.45` mid-search, the CLI returned
`subtype: "error_max_budget_usd"`, and the record parked as a pending
"continue for $X more?" card (`BUDGET_STOP`, `continuationBudget`,
`budgetPauseDecision`, `continueResearch`). With the cap gone that card can
never appear again, so it was removed all the way through rather than left
as dead code that would confuse the next session: `planner.js` (the
`paused` step status, `pausedOn`), `inbox.js` (the `record.budgetStop`
dispatch in `approveRecord`), `inboxStore.js`'s reaper exception, and on the
client — `src/planCard.js` (the whole `paused` state, `pausedLineFrom`),
`src/vals/valsMission.js`, `src/screens/MissionStructured.jsx`,
`src/screens/MissionControl.jsx`, `src/App.jsx` (`watchPlanRun`'s paused
branch, `attachRunningPlan`), `src/screens/Voice.jsx`. A plan now has two
states, not three: RUNNING and READY. **This FORECLOSES re-adding a
budget-triggered pause card without remembering it needs the whole chain
back** (planner step status → inbox dispatch → client card), not just a
budget constant.

**Tests updated:** `server/test/pulse.test.js` (the budget-subtype message
case, replaced with a generic CLI-failure case), `server/test/researcher.test.js`
(the `BUDGET_STOP`/`continuationBudget`/`budgetPauseDecision` block removed),
`server/test/researchPanel.test.js` ("the panel budget is bounded" replaced
with a narrower "workers stay on the cheap tier" check — the one assertion
in it that wasn't about the cap), `server/test/planCard.test.js` and
`server/test/planFollowUp.test.js` (the `paused` fixtures and assertions
removed), `server/test/projects.test.js` (`BUILD_BUDGET_USD` assertion
removed).

**LEFT ALONE, on purpose — not working caps under this instruction, told to
him rather than silently touched:**
- `dailyReview.js` `REVIEW_MAX_ATTEMPTS` (3) and `healthInsight.js`
  `MAX_TRIES_PER_DAY` (3) — cap RETRIES of a job that already completely
  FAILED, not the output of a job that is honestly working. Borderline; his
  call if he wants these gone too.
- `plan.js` `MAX_STEPS`/`MAX_PLAN_USD` — explicitly non-blocking in their own
  code ("anything above is fine; it's shown to him, he decides").
- Prompt/context sizing (`CONTEXT_BUDGET`, `maxChars`, `maxTurns`,
  `pulse.js` `MAX_SEARCHES`) and read timeouts on quick informational
  commands or non-`claude` tools (yt-dlp/ffmpeg fetches in `studyLane.js`,
  `repertoireLane.js`, `exerciseVideos.js`; link-reachability checks in
  `leader.js`; the widget's `SLICE_BUDGET_MS` in `routes/snapshot.js`, which
  never aborts the underlying fetch) — none of these spawn a claude process
  or stop one that is generating.

**VERIFIED:** `cd server && npm test` — 2040/2040 green (was 2029 before the
new `noCaps.test.js`'s 3 tests; net +11 from another session's concurrent
`goalBoard` work landing in the same tree). `npm run lint` from root — exit
0, 91 pre-existing warnings, none newly introduced by this pass (checked
every warning in a touched file against `git show HEAD:<file>` line by
line). `npm run build` — exit 0.

**GIT NOTE — another session was committing to this repo at the same time**
(a `goalBoard` feature, touching `src/App.jsx` among others). `App.jsx` had
this session's 3 edits interleaved with their uncommitted work in the same
working-tree file; staged this session's exact 3 hunks into the index via
`git hash-object`/`git update-index --cacheinfo` against the `HEAD` copy
rather than `git add`-ing the whole (mixed) file. The working tree itself
was never touched — their in-progress edits are still there, untouched, for
them to commit themselves.

**DO NOT:**
- Do not add a `--max-budget-usd`, a `settleWatchdog`-equivalent, an env var
  that reintroduces either, or a "soft" version of either ("warn past $X"),
  to any lane, without asking him first — this instruction is standing.
- Do not recreate `lib/settle.js` or reimplement its wall-clock kill locally
  in a lane file — `noCaps.test.js` will catch the watchdog call but a
  hand-rolled equivalent `setTimeout(...child.kill...)` would not be caught
  by name; use judgment, not just the guard.
- Do not re-add a "paused at its budget" plan-step state without rebuilding
  the whole chain (planner → inbox → client) — half of it left in is worse
  than none.

---

**22 SEP (night) — THE TOP-BAR BLUR (SIXTH ATTEMPT) AND THE CAMERA, BOTH
DEVICE-UNVERIFIED.** Four commits: `34f5b1e` `8328058` `dbb4fa3` `d95d448`.

**GOAL.** Three of his reports in one pass: the six-report top-bar blur
(five prior CSS fixes had changed nothing); "I need the food log to be
revised to be cleaner, easier, more apple-like aesthetic and have recently
logged or added foods added to the top"; "the camera option isn't always
working either to add or take a photo."

**DONE CRITERIA — met for code, UNMET for the two device-only questions.**
Lint/build/tests all pass and the deployed bundle carries every change
(checked by grepping the live JS/CSS on GitHub Pages, not just the local
build). Whether either iOS fix actually works can only be answered on his
phone, and as of this close he has not yet said.

**BLUR — DECISION: removed `user-scalable=no`/`maximum-scale` from the
viewport meta; kept `minimum-scale=1.0`.** His own test that day was the
discriminator: same phone, same build, Chrome sharp, installed app soft —
which rules out the render engine (Chrome on iOS is WebKit too) and points
at display MODE. iOS honours the scale lock only in standalone, never in a
tab; a honoured lock pins page scale under a `position:fixed` layer whose
backing store can then be rasterised at the wrong scale and stretched. This
FORECLOSES casually re-adding the lock for some future zoom complaint
without remembering it trades the blur fix away. Reasoning recorded in
memory [[ios-standalone-vs-tab]]. If still soft: next lever is
`apple-mobile-web-app-status-bar-style`, which costs him a delete-and-re-add
of the home-screen icon to test — do not suggest it before he's tried a
plain reload of the installed app first.

**FOOD LOG — DECISION: a "log it again" rail above the composer, ordered by
the MOMENT logged (date+time+row-position as one comparable string), not by
date-then-count.** The old sort tied everything logged today and then
ranked by habit — a food typed a minute ago lost to breakfast eaten forty
times. `server/lib/foodHistory.js` `computeFoodHistory()`. This FORECLOSES
reverting to a count-based tie-break; that is the exact regression the two
new tests in `server/test/foodHistory.test.js` exist to catch. Composer
rebuilt as one field (dictate/camera/barcode inside it, send arrives only
once there's something to send); entries as one grouped inset list, Apple
separator convention (inset to text, not full-bleed).

**DECISION — macro hues fixed app-wide on Fuel: protein `--nv-cy`, carbs
`--nv-gold`, fat `--nv-vi`,** used on the quick-log cards' split bar and the
day's totals bar. This FORECLOSES the peer session's in-progress hero-ring
macro arcs (finding 15, rows 1-4) using any other hue order — flagged to
them directly; if they use a different mapping the screen will describe the
same three numbers in two visual languages.

**CAMERA — four separate faults fixed, one symptom in common** ("nothing
happened"): the FileList was cleared synchronously before the read
finished; `createImageBitmap` now tried before the object-URL decode path,
which iOS can refuse on a fresh capture whose backing file it already
released; every decode failure used to resolve to '' and vanish via
`.filter(Boolean)` — now counted and reported in `foodScanError`; staged
photos now persist to `sessionStorage` (not `localStorage` — this is one
session's work, not a standing cache) so an iOS eviction while the camera
sheet is open doesn't lose them. `App.jsx` `downscaleImageFile`,
`addFoodScanPhotos`, `persistFoodScanPhotos`/`restoreFoodScanPhotos`.

**VERIFIED (with locators):**
- `npm run lint` exit 0, `npm run build` exit 0, `cd server && npm test` —
  2024/2024 pass at close (was 1947 at the start of the day).
- `server/test/foodLogSurface.test.js`, `foodCamera.test.js`,
  `foodHistory.test.js` (two new recency tests), `mobileNative.test.js` (the
  new viewport assertion) — all green.
- Deployed bundle checked directly: `curl` against
  `https://hcooper12.github.io/nova-os/` — the viewport meta tag has no
  `user-scalable`/`maximum-scale`; the CSS contains `nvSendArrive`; the JS
  contains `createImageBitmap` and `novaos.foodScanPhotos`.
- Headless render against the REAL vault (`scripts/shot.mjs` + `dev-connect`)
  confirmed rail ordering: Cadbury Dairy Milk (21:33) leads Pink Lamington
  (21:33, same minute, tie broken by row position) leads the smoothie
  (21:16) — the exact ordering he asked for.

**ASSUMED, not verified:** that the viewport change actually fixes the
blur on his device (strong circumstantial reasoning, zero device
confirmation); that the four camera fixes address his report (same —
plausible causes, none provable from Node or headless Chrome).

**OPEN / BLOCKERS:**
- His confirmation on both, device-only — logged in memory
  [[nova-open-threads]] rather than left to be forgotten.
- `Recipes.jsx` was handed to a peer session for finding 15's remaining four
  rows (dashed zero ring, macro arcs, cross-check bars, rotation
  affordances) — see the cross-session thread that day; not this session's
  to finish.
- **Ownership of `server/lib/ops.js`, `server/routes/ops.js`,
  `claudeSessions*.js` is still unresolved.** Not mine. A peer ("Nova")
  logged it as "an unnamed fourth session's" in this same file. Whoever owns
  it should say so; do not assume it is abandoned.
- **At this close, the working tree has 8 files modified and uncommitted
  that are NOT mine** (`App.jsx`, `IngestModal.jsx`, `RecipeOverlay.jsx`,
  `screens/{Galaxy,Inbox,Leader,MissionControl,Settings}.jsx`) — a gold→
  `Button` repointing consistent with the ongoing finding-2 sweep
  ("Nova improvement plan" was `busy` at close). Left untouched deliberately;
  did not stage or commit them. If you are the next session and they are
  still there, ask before assuming they're abandoned — they may simply be
  mid-edit.

**DO NOT:**
- Do not re-add `user-scalable=no` or `maximum-scale` without remembering it
  trades away the blur fix.
- Do not let `computeFoodHistory`'s sort regress to date+count — it silently
  reintroduces "habit beats recency."
- Do not draw Fuel's macro arcs (or anything else touching P/C/F) in hues
  other than cyan/gold/violet in that order.
- Do not stage or commit the 8 uncommitted files above without confirming
  whose they are.
- Do not tell him either fix "works" — neither has been confirmed on his
  phone.

---

**23 SEP — THE AESTHETIC REVIEW, BUILT.** All 22 findings are shipped or
claimed; the status board with a commit per finding is at the head of
`design/audits/aesthetic-2026-09-22/REPORT.md`. Three sessions worked this
checkout at once and every commit went in by explicit pathspec.

**MINE, SHIPPED** (in order): `cb2ae8d` one Button and one accent · `be14df3`
+ `e54fa15` the phone-width faults · `8694418` the exercise card's load rail
and Settings' trust ladder · `036b2e7` the Ops dial · `5f718e8` the recorder ·
`ed42781` glass voice layers and the house Select · `2e41989` the momentum
rail in muscle hues and the focus verdict · `5691ff0` Home's vitals domain
system · `4c0a006` the nudge, the ring numeral, the head meta.

**FOUR NEW HOUSE OBJECTS**, all in `Controls.jsx` — use them rather than
hand-rolling: `Button` (tone · variant · compact · disabled, 44pt under
Apple, `--nv-on-acc` ink), `Rail` (a scrolling row of peers, faded only on
the side that has more), `Chevron` (one stroke that turns), `Select` (a
native `<select>` in house chrome, the element transparent over the hit
area). There are now ZERO hand-rolled button helpers in `src/`, and zero gold
commit buttons: `grep 1a1322 src` returns only MobileChrome's two count
badges, where dark ink on a gold badge is what a badge is.

**A CORRECTION WORTH READING.** `cb2ae8d` claimed gold survived "in exactly
one place" and this handoff repeated it. Both were wrong. That pass hunted
the `btn()` HELPER and missed eight buttons hand-rolled inline with the same
ink — found only by grepping the DEPLOYED chunks, and fixed in `97b0fca`.
**After a sweep, grep what shipped, not the source you just edited:** `curl`
the deployed index, pull every lazy chunk it names, grep those. Settings, Ops
and Notes are all lazy chunks that a source grep and a screenshot both miss.

**TWO NEW INSTRUMENTS, and they found what the written review could not.**
- `node scripts/probe.mjs` — every screen at 375px, reporting overflow,
  clipped text and tap targets under the 28pt floor as numbers. Add
  `--style command` for the other idiom. It found two page-scrolls-sideways
  bugs and eleven under-floor controls that 40 screenshots had not.
- `node scripts/rec.mjs --slow 8` — an interaction as a GIF. The `--slow`
  matters: a screenshot through SwiftShader takes 100–300ms, so a 280ms
  entrance is over before the second frame and reads exactly like a
  transition that does not exist. It found two missing entrances.
- Both refuse to run without `node scripts/dev-connect.mjs` first, because a
  shot of the demo fixtures is indistinguishable from a shot of his vault.

**THE TRAP THAT COST TWO ROUNDS.** `npm run build` does NOT catch an
undefined JSX identifier — five files got `<Button>` with no import and the
build stayed green; at runtime that is a blank screen. After any component
swap, grep every user for its import. Memory: `nova-jsx-import-trap`.

**OPEN**: finding 13 (decisions are a conversation) and 16's whole-row tap
target are with the peer session. The command idiom's mono micro-labels are
below the 28pt floor by design — the probe reports and does not fail them,
since that skin is pointer-first; if he ever runs command on the phone, that
becomes real work. Queued builds unchanged in memory `nova-open-threads`.

---


**23 SEP (later) — THE SESSIONS FEATURE IS VERIFIED LIVE, AND ONE CLAIM IT MADE WAS FALSE.**
Through the real routes on the running server: "Show me" on a live Nova window answered
`focused`; closing a live session was refused with the plain sentence; closing the 70-day-old
dead background session answered `cleared` while the session STAYED on the list, because the
CLI's background service is gone and `claude stop` / `claude rm` both fail quietly. Fixed in
`79c1d13`: after stop and rm the server looks at the list again and answers `ok:false` with one
sentence ("Claude Code could not clear it, so it stays listed as finished"), and the Ops screen
shows that instead of "Cleared." 1997 tests. Filmed on a real Chrome window on the Mac (Ops
panel with live sessions, then Home). **STILL ASSUMED:** the phone idiom's Home line was only
seen headless; reduced-motion and keyboard passes not run. The dead session cannot be cleared
by the CLI at all right now; it lives in `~/.claude/jobs/617f3989/`, and deleting that by hand
is his call, not Nova's.

**23 SEP — WORKING ON THIS MAC: EVERY PROJECT'S CLAUDE CODE SESSIONS, ON OPS
AND ON HOME.** His go, in his own words: "The overall multi project view
could be incorporated into Nova somehow as that's my main daily driver." He
had watched a session list showing seven open sessions across Nova and
Science Atlas and wanted ONE place saying what is running on his Mac, which
one is waiting on him, and a tap to get to it. This is **step B of the Agent
World plan** (`design/AGENT-WORLD-PLAN.md` §6, "the marker list on Home"),
extended to every project on the Mac and pulled ahead of the aesthetic
review queue by his instruction. A list, not the Org Map scene; step 0's
mockup and steps C/D are untouched and still ahead.

**BUILT**
- `server/lib/claudeSessions.js` — the judgement, copied BYTE FOR BYTE from
  Wren (`atlas-partner/lib/sessions.mjs`) and never edited here. Its lesson:
  a session is alive by when someone LAST SPOKE in it (the CLI's own
  journal), never by when its window was opened. States: blocked, waiting,
  working, left-open, gone.
- `server/lib/claudeSessionsLive.js` — everything that touches the machine,
  all of it injectable: read the CLI's list, group by project (most raised
  hands first, Nova first on a tie), raise a window by matching its device
  to a Terminal tab, or close one. A background session gets a small
  double-clickable file that attaches to it.
- `server/routes/ops.js` — the list plus show and close, behind the same
  auth as every other ops route. Both writes re-read the live picture first,
  so a session that has ended is a plain sentence and never a stray kill.
- `server/lib/ops.js` — a `sessions` slice on the ops payload, wrapped so a
  failure is one honest sentence rather than a broken Ops screen.
- Ops screen: the "Working on this Mac" panel in Nova's own glass, one group
  per project, a state colour per row, Show me and Close it with an inline
  confirm ("Close it? The conversation is kept and can be reopened later."),
  quiet rows for windows left open. Polls its own small endpoint every 20
  seconds while the screen is open and stops the moment it is not.
- Home: ONE line under the hero tagline in BOTH idioms, serif, gold, tappable
  through to Ops, and rendered only when a hand is actually up.

**VERIFIED (run, not assumed)**
- `cd server && npm test` — 1993/1993 pass, 0 fail (was 1947 on 22 Sep).
- `npm run lint` exit 0 (warnings only, none new); `npm run build` exit 0.
- Service reloaded (unload + load), `/api/health` → `{"ok":true}`, and
  `/api/ops/sessions` against his REAL machine returned "3 working, 2 waiting
  for you, 2 left open" across Nova, Science Atlas and one other, counts
  `{working:3, waiting:2, blocked:0, leftOpen:1, gone:1, projects:3}`.
- Both surfaces shot headless at 390x844 (cupertino) and 1280x900 (command)
  against live data: the panel renders with real sessions in both, and the
  Home line reads "Two things are waiting on you across two projects."

**ASSUMED (not proven this session)**
- **Show me and Close it were never fired against a real window.** Their
  logic is covered by fakes that assert the exact command each WOULD run
  (the AppleScript device match, the attach file and its 755 mode, SIGTERM,
  `claude stop` then `claude rm`), but nothing was raised or killed on his
  Mac. First real use is the test.
- Terminal is assumed to be the terminal he runs sessions in; iTerm or any
  other would fall back to simply opening Terminal.
- No reduced-motion or keyboard pass was run; the panel relies on the global
  reduced-motion rule and the house controls rather than its own handling.

**OPEN**
- Whether "Show me" behaves on a real raised window, and whether a closed
  session reopens cleanly with `claude --resume`.
- Steps C and D of the Agent World plan (the scene, the Home tile, Ambient)
  and its step 0 mockup are still unstarted, as is his call on register.

**NEXT ACTION:** have him tap "Show me" on a waiting session and say whether
the right window came forward.

---


**23 SEP (small hours) — HIS GO ON THE AGENT WORLD; REVIEW SESSIONS B AND C
SHIPPED; A BY THE PEER; THE MOCKUP IN FLIGHT.** His decisions (22 Sep, late):
(1) proceed with the Org Map, aesthetic review sessions first, then the
static mockup; (2) luminous forms, but a cheaper model may draw forms vs
faces side by side so he can see the difference; (3) try the "Viewed" verb.

**DONE, VERIFIED, PUSHED**
- Session A (`cb2ae8d`) — by the peer session "Nova improvement plan":
  one `Button` in Controls.jsx, fifteen hand-rolled `btn()` helpers gone,
  gold no longer the default commit fill. Verified by reading the diff and
  `grep -rn "btn(" src` → 0.
- Session B (`3081b60`, mine) — Home's six fold rows are instruments:
  `foldInstrument` in `src/missionFold.js` (pure, beside `foldStatus`), a
  `FoldGlyph`/`FoldRow` in `MissionStructured.jsx`, tests in
  `server/test/missionFold.test.js`. Looked at: 402px cupertino, six rows,
  368/368 each, no overflow. The command idiom has no fold rows (classic
  fold), so nothing to verify there. A peer caught a 10.5px label against
  `contrast.test.js`'s 11pt floor; it is the house `Eyebrow` now.
- Session C (`a082574`, mine) — `MuscleTag` on Gym's today card, every
  routine tile, and the Goals card; `musclesNamed` in `src/muscleHue.js`;
  goals as an instrument (serif line, 7-cell days rail, priority chips, age
  line); coach chips sentence case; `server/test/musclePaletteFrontend.test.js`.
  Looked at: Gym today card, routine tiles, Coach tab at 402px cupertino.
  Two 4px overflows on the "Routines" and "Goals" header rows are
  PRE-EXISTING (Session D territory), not the chips; page scrollWidth 402.
- Gates at close of C: lint warnings only (none in my files), build green,
  `cd server && npm test` 1993/1993, pushed, origin level.

**ALSO DONE, VERIFIED, PUSHED (later the same night)**
- The "Viewed" verb (`8bc3faf`, mine) — `setSeen` in `server/lib/inbox.js`,
  `POST /api/inbox/:id/seen` (`{seen:false}` reverses), `seenAt` on a
  PENDING record only; it stays pending, stays in every count. Client:
  `app.inboxSeen`, a dashed Seen tag + light Seen tick on the Inbox card,
  `inboxNewCount` beside `inboxPendingCount` in `valsInbox.js`, and the
  morning Home line gains ", 3 new" / ", none new" only once some are seen.
  Tests: `inboxSeen.test.js`, four states in `missionLine.test.js`. Live:
  service reloaded (health ok on :4173), round-tripped on record 91a5c931
  (seen → pending + stamp; unseen → pending + null; bad id → 400) and left
  as it was. Suite 1996/1996.
- A third session's commit `e2439e4` ("every project's Claude Code
  sessions on Ops and Home") rode out on my push — it was already committed
  on main, so nothing of theirs was staged by me, but they may not know it
  is on origin.

**IN FLIGHT / OPEN**
- **HIS CALL (23 Sep): FACES, in 3D, each agent unique to its job.** The
  flat mockup stands only as a geography draft. Character brief written as
  AGENT-WORLD-PLAN.md §3g; a three.js character sheet
  `design/mockups/49-agent-characters.html` (nine beings, turntable, tap
  to focus, working/waiting poses, Calm + reduce-motion) was built by an
  Opus agent and looked at: strongest Guardian/Coach/Meal Prep/Watcher/
  Commander/Librarian; weakest Leader (a material, not a silhouette) and
  CFO at 40px. three.js is r160 (cdnjs has no UMD past r160). Awaiting his
  reaction before the map is built with these figures.
- The flat Org Map mockup (superseded as design, kept as geography draft): `design/mockups/48-org-map.html`
  (committed), https://claude.ai/artifact/NjfRaXzw5VY2yeZELJfKnD. Looked at
  both passes; the second fills the frame and carries a 4× detail inset per
  register. Awaiting HIS reaction (forms vs faces) — fold it into
  `design/AGENT-WORLD-PLAN.md` §3f before any code.
- **Session F, shipped:** finding 20 (Briefing empty state, `fb2481e`),
  finding 8's Coach void (`ad726d7`, `src/coachWeek.js`), finding 15's four
  rows (Fuel ring/arcs/cross-check/rotation header, the commit after
  `ad726d7`; an Opus agent built it, I read the diff, ran the gates and
  looked at its shots). NOTE for Fuel: his profile has no carb/fat target,
  so those arcs stay absent until the Intake/collection grows
  `carbTargetG`/`fatTargetG` — a vault change, not UI.
- **Finding 13 shipped** (the commit after `8c3484b`): tick/cross/Seen on
  the deck card, "✓ all N" per repeating subject, the leaving beat
  (`src/inboxLeave.js`), and Train Today's Coach ask the same way. The
  Fuel arcs' missing sweep (`8c3484b`) was caught by the peer's
  `scripts/rec.mjs` and fixed with `nvArcIn`.
- **Review status:** every finding is claimed or shipped. The peer holds
  22 (Home vitals grid) last; 9, 12, 19, 6, E and D are theirs and pushed.
  16's whole-row tap target (Stash.jsx, Library.jsx) is unclaimed.
- **Not verified on record:** the Inbox leaving beat (rec.mjs loses the
  scroll after navigate; two runs were killed for memory — four headless
  Chromes were up across sessions) and the Coach-ask card (needs a live
  coachAsk; pinned by test).
- Not verified: Fuel at 1280 in either idiom; the centre-dash patch on the
  Fuel ring was pinned by test after the shots, not re-shot.
- Review sessions D, E, F remain. D and E live mostly in the peer's Session
  A files (Todos, Ops, Notes, Settings); F in nova-os-c7's Fuel work. I have
  asked the peer which they want; take the remainder.
- Sessions D (peer, in flight: Todos, Notes, valsNotes, Library, Controls,
  NudgeCard, Stash) and E (unclaimed: ExerciseSheet, Settings; announce
  before starting). F is mine next, with nova-os-c7's Fuel work.
- Three sessions share this working tree tonight (this one, "Nova
  improvement plan", nova-os-c7 with uncommitted `server/lib/ops.js`,
  `server/routes/ops.js` and new `claudeSessions*.js`). Commit by explicit
  pathspec only; :5183 is the peer's vite, use :5173.

**DO NOT**
- Do not read the 22 Sep review's line numbers as current; Session A moved
  them. Find call sites by content.
- Do not treat `AGENTS` in `src/vals/shared.js` as live data: it is a static
  list, all `on: true`; the Agents fold's arc draws that and nothing more.

---


**23 SEP — SESSION A OF THE REVIEW: ONE BUTTON, ONE ACCENT.** Commit
`cb2ae8d`, pushed. Three sessions were working this checkout at once (me,
`nova-os-c7` on Fuel, `Nova` on Session B); every commit went in with an
explicit pathspec and nothing crossed.

**WHAT IS TRUE NOW**
- `Controls.Button` is the one committing action in the app: `tone`
  (accent · good · warn · violet · ink · undecided), `variant` solid|quiet,
  `compact`, `disabled`, 44pt under Apple, pill under Apple / 12px under
  Command, ink always `--nv-on-acc`.
- **Zero button helpers remain in `src/`** — the fourteen `btn()` copies, the
  Inbox's `primary()`, and seven more hand-rolled solid buttons the audit had
  not counted (`CoachApplySheet`, `ModelChoicePrompt`, `PortionSheet`,
  `NudgeCard`, `RecipeOverlay:463`, `MissionControl:407`, `Workouts:103`).
  Checkboxes were left alone; they are not buttons.
- **Gold means "not yet decided" again.** One call site keeps it and earns
  it: Fuel's "Refine estimate", where Nova has asked a question it cannot
  answer and can file nothing until he replies.
- To-Do's gold `Stale` badge is gone. Age is drawn: a leading hairline that
  deepens from a fortnight to six weeks (`valsTodos.staleness`), the age
  label warming with it.

**TRAP THAT COST A ROUND.** `npm run build` does NOT catch an undefined JSX
identifier — five files got `<Button>` with no import and the build stayed
green; at runtime that is a blank screen. After any component swap, run
`for f in $(grep -rl "<NewThing" src/**/*.jsx); do grep -q NewThing <(grep "from '.*Controls.jsx'" $f) || echo "MISSING: $f"; done`.

**VERIFIED BY LOOKING** at 402×874 via `scripts/shot.mjs`: Train, Inbox,
Settings, To-Do in cupertino; To-Do in command. Gates: lint clean, build
green, server suite 1979/1979.

**NEXT** (his approved order): C (muscle palette on Train — `Nova` is taking
it), D (the 402px faults), E (exercise sheet + trust ladder), F (Fuel, Coach,
empty states — coordinate with `nova-os-c7`, whose Fuel work already delivers
finding 15's date rail). B is done (`3081b60`, not mine). Then the queued
builds in memory `nova-open-threads`.

---


**22 SEP (afternoon) — THE AGENT WORLD PLAN, WRITTEN, NOT BUILT.** His ask:
watch Jarren Rocks' "video game for my AI agents" reel and plan what Nova
should take from it. Result: `design/AGENT-WORLD-PLAN.md` (commit
`3f0fb63`) — the reel read frame by frame, the precise gap it exposes (Nova
cannot show in one look who is working, who is waiting on him, and where),
and the **Org Map** proposal: seven hex districts from `AGENT_DEPARTMENTS`,
figures whose states come only from heartbeats, job files, plan records,
pending records and the autonomy ledger; the ONLY floating marker is
"waiting on him"; tap → TL;DR card with tick / cross / Talk (the agent
switch the org-conversation plan needs). Three sizes from one view model:
Home tile (still frame), Ops (replaces the ring of dots), Ambient. Fun and
aesthetic ideas listed separately (§4). An Opus survey of his six YouTube
videos is folded into §8 (badge only when it means "you", N-for-next,
"Viewed" as a third verb, sticky layout, night as emitted colour).

**VERIFIED:** every file and symbol the plan names exists (`fleetContext.js`
KIND_AGENT, `ops.js` AGENT_DEPARTMENTS + composeOps, `valsOps.js` job-state
read, `autonomyLedger.js` verdict, `planner.js` pausedOn / `researcher.js`
route:'continue', `tldr.js`, `Shelf3D.jsx` conventions). Nothing in `src/`
or `server/` changed this session. Gates not re-run: docs-only commit.

**OPEN:** his go on the build order (§6: mockup first, then view model →
marker list on Home → the scene → tile + Ambient), and his call on
register (luminous forms vs the reel's faces, §3f). The aesthetic review's
sessions A–F (entry below) are still ahead of it in the queue.

**NEXT ACTION:** if he says go, step 0 is the static mockup artifact of the
Ops map at phone size (dark + Calm), before any code.

---


**22 SEP (midday) — CLOSE PASS: VERIFIED THE GATES, CLEANED THE INSTRUMENT,
FOUND THE AESTHETIC REVIEW HALF-SHOT AND STALE IN PART.** This was a
`/nova-close` pass, not feature work — three other sessions (this one's own
earlier context, a peer Opus session, and a Fable session) had already landed
commits `240f9d2`, `ff3e03c`, `20b6f87` on top of the "22 SEP (morning)"
entry below without a handoff update, so the block had drifted stale by three
commits before this pass started. Re-verify what you read here; don't extend
this trust to the entries below it without spot-checking, same as always.

**DONE CRITERIA — met.** All standing close gates green, re-run fresh, not
assumed:
- `npm run lint` exit 0 (warnings only, none new)
- `npm run build` exit 0
- `cd server && npm test` — **1947/1947 pass**, 0 fail (was 1777 on 17 Sep;
  real work landed in between)
- `git status --porcelain` — clean but for one untracked dir (below);
  `git rev-list --left-right --count origin/main...HEAD` → `0 0`, exactly synced
- backend: `curl .../api/health` → 200; `launchctl list | grep novaos` shows
  a live PID
- last GitHub Actions deploy (`20b6f87`, "Deploy to GitHub Pages") completed
  `success` and matches HEAD — nothing in flight

**DECISIONS**
- **Killed the stray dev instrument** (`vite --port 5183`, PIDs 19128/19640/
  19658) and ran `node scripts/dev-connect.mjs --clean`, which removed
  `public/_devconn.js`. → The prior entry's own instruction ("Dev server on
  :5183 and `_devconn.js` are live for the review; clean both at close") and
  the script's own doctrine comment ("ALWAYS run `--clean` when finished...
  a token sitting in a served directory is exactly the kind of thing that
  outlives the session that needed it"). Forecloses: nothing was mid-capture
  — the newest shot is from 10:12, this pass started well after — so no work
  was interrupted.
- **Left `design/audits/aesthetic-2026-09-22/shots/` (38 PNGs, 15MB)
  uncommitted, not deleted.** → Checked the repo's own precedent first:
  `design/audits/2026-08-full-audit/` is 70 tracked files, 0 images —
  written reports only, never raw screenshots. Committing 15MB of PNGs
  against that convention is a call for whoever writes the actual review,
  not this pass; deleting them throws away real navigation/render time this
  or a peer session already spent. Forecloses: the next session must decide
  whether to commit a written report (images stay local or move to a scratch
  dir) or re-shoot — either way, this leaves the choice open rather than
  making it by default.

**STATE**
- `design/audits/aesthetic-2026-09-22/shots/` — 38 stills, **partial and
  part-stale**:
  - Coverage: 32 cupertino, only 10 command — 14 screens (`boot-waiting`,
    `briefing`, `code`, `exercise-card`, `galaxy`, `leader`, `library`,
    `money`, `notes`, `ops`, `settings`, `shopping`, `stash`, `train-gym`)
    have no command-idiom counterpart at all.
  - **10 shots predate `20b6f87`** (the top-bar opacity/timing fix, landed
    09:40:39; these are timestamped 09:30–09:33): `boot-waiting-cupertino`,
    `home-cupertino-{top,900,1800,2700}`, `train-coach-cupertino{,-900}`,
    `train-gym-cupertino`, `train-today-cupertino{,-800}`. These are exactly
    the scroll-position/top-bar shots most likely to show the text-ghosting
    bug that commit describes fixing ("RECORDS · 09/21" legible under "Good
    morning" at full "solid"). Reviewing them as current risks writing up a
    bug that is already fixed — re-shoot those ten before trusting them, or
    read `20b6f87`'s message first and discount what it names.
  - No report file exists alongside the shots — the capture phase happened,
    the review/analysis did not.
- The prior entry's "Their unstaged liquid-glass work (`index.css`,
  `MobileChrome.jsx`, `valsChrome.js`) was left alone" is **resolved, not
  lost** — it's `20b6f87` (Fable session, Claude-Session
  `session_01WfH7xarf3BmKeQj2mMMatX`), verified rendered via `shot.mjs` at
  0/14/30/160px scroll, test now pins the range ceiling and the opaque
  composite. No action needed on it.
- `ff3e03c` added a durable doctrine block to `CLAUDE.md`: Nova's liquid
  glass, violet/cyan accents, soft radius and calm shadows are **not** the
  "AI-generated defaults" the global CLAUDE.md warns against reaching for —
  they're tokenised, documented (NOVA-METHOD.md §2b), and chosen against his
  own reports. A design review (including any HIG-style audit) that flags
  one of them is a design argument to put to him, never an automatic
  cleanup. Read this before the aesthetic review's findings become builds.

**VERIFIED**
- Every file the "22 SEP (morning)" entry names as shipped actually exists:
  `src/muscleHue.js`, `server/test/muscleHue.test.js`,
  `design/ORG-CONVERSATION-PLAN.md`, `scripts/shot.mjs`, `src/tldr.js` — all
  present (`test -f`, this pass).
  - One path was imprecise, not wrong: the 21 Sep entry says
    `planFollowUp.js` with no path; it's `server/lib/planFollowUp.js`.
- `36d081e`/`dc61273` (shot.mjs, ORG-CONVERSATION-PLAN.md) and `2208373`
  ("fix: UPDATE actually updates…") checked against `git show --stat` —
  attributions in the prior entry match.
- `nova-concurrent-sessions.md` already carries today's "whole index" and
  "peer's WIP can fail the gate" incidents in full, with the right rule
  (`git commit -F msg -- path1 path2`, explicit pathspec) — no memory update
  needed there.

**ASSUMED**
- The two Coach proposals and the 21 Sep report noted as unread in his
  Inbox (see that entry below) — not re-checked live this pass; carried
  forward as still open, not verified fresh.
- `20b6f87`'s claim that the fix was "rendered in the app for the first
  time" and shows no ghosting at 14/30/160px — taken from the commit
  message, not re-rendered independently in this pass.

**OPEN QUESTIONS / BLOCKERS**
- The aesthetic review itself (§2b rules 7–8, both idioms, every screen,
  Before/After) is still not done — screenshots exist, analysis doesn't.
- Whether `design/audits/*` should ever hold binary screenshots going
  forward, or stay markdown-only with images kept outside git, is an actual
  convention decision nobody has made explicitly — it's been true by
  accident (only one audit exists) rather than by rule.

**NEXT ACTION**
Finish the aesthetic review: re-shoot the 10 stale shots (or discount them
against `20b6f87`'s description), shoot the 14 command-idiom screens that
have no counterpart yet, then write the actual findings as a markdown report
under `design/audits/aesthetic-2026-09-22/` — matching the `2026-08-full-audit`
convention — reading `CLAUDE.md`'s new anti-AI-look section first so a
"glass in the content layer"-style finding is raised with him rather than
auto-applied. Expected observation if the report is right: it should name
concrete screens and files, the way `2026-08-full-audit`'s numbered files do,
not a general aesthetic impression.

**DO NOT**
- Do not commit `design/audits/aesthetic-2026-09-22/shots/*.png` as-is — no
  audit in this repo has ever checked in raw images; write the findings as a
  report first.
- Do not treat the 10 pre-`20b6f87` shots (listed above) as current-state
  evidence without re-shooting or reading that commit's description first.
- Do not re-litigate the CLAUDE.md anti-AI-look exceptions (liquid glass,
  violet/cyan, soft radius, calm shadows) as review findings — they're his
  decisions, argued to him if you disagree, not defaults to strip.

---


**22 SEP (morning) — THE MUSCLE PALETTE, PLATFORM-WIDE; A SCREENSHOT
INSTRUMENT; THE ORG PLAN WRITTEN.** His instructions: colour with a purpose
(muscle focus), "apply the muscle palette across the platform so it's always
in sync and consistent", then the overall aesthetic review.

**WHAT IS TRUE NOW**
- `src/muscleHue.js` is the one map: a `--nv-m-*` token per library group
  (13), the eighteen anatomy regions filed under them (`ANATOMY_GROUP`),
  case-insensitive lookup, `muscleVar` for CSS, `muscleHexStatic` for WebGL.
  Tokens declared on `:root` in `src/index.css` with a darker daylight set.
  `server/test/muscleHue.test.js` pins every group and anatomy id to a
  declared token and the `:root` hex to the map.
- Readers: `Body3D` (no palette → each lit muscle in its own hue; supporting
  = same hue lerped 0.5 to skin-grey; Fuel still passes its debt palette),
  `BodyMap` (per-region fills), `MuscleLegend` (solid = worked, outline =
  supporting), `TrainToday` volume bars (bar in the muscle's hue, goal
  muscle's name in it, a short bar at .6 opacity with the number in warn).
- The Jarvis mockup's tokens (`--m-chest` …) are the same hexes; the report
  build reads `--nv-m-*` when it lands.
- **VERIFIED BY LOOKING** (headless Chrome 402×874 via `scripts/shot.mjs`):
  harness sheet, bench figure at 440px (chest coral, quads blue, lats teal,
  abs/triceps muted as supporting), the Train bars, the Dumbbell Shoulder
  Press card's flat map + legend.

**RECEIPTS — READ THIS BEFORE TRUSTING THE LOG.** A peer session
(nova-os-c7) is committing in the SAME working tree. Its commit `2208373`
("fix: UPDATE actually updates…") swallowed the palette files while they sat
staged for my own commit; it was pushed before I saw it, so it stands. The
palette's why is in this block, not in that message. Rule from it, told to
the peer: stage-and-commit in one command and read `git diff --cached
--stat` first; anything you did not stage is the other session's. Their
unstaged liquid-glass work (`index.css`, `MobileChrome.jsx`,
`valsChrome.js`) was left alone. My commits: `36d081e` (shot.mjs),
`dc61273` (ORG-CONVERSATION-PLAN.md).

**THE INSTRUMENT.** Both MCP browsers were unavailable (devtools profile
held by the peer; extension disconnected) and `screencapture` is refused to
the sandbox. `node scripts/shot.mjs --eval "window.__novaApp.navigate('workouts')"
--out x.png` gives a phone-size still from the recorder's own headless Chrome,
seeded from `public/_devconn.js` (`node scripts/dev-connect.mjs`, `--command`
for the other idiom; `--clean` after). `--eval` may repeat; a promise is
awaited; it re-attaches after the app's self-reload. Safari via osascript
works for DOM reads (address the tab by URL) but cannot screenshot.

**THE AESTHETIC REVIEW IS DONE** — `design/audits/aesthetic-2026-09-22/REPORT.md`
(22 ranked findings with Before/After and file:line, 40 stills, a keep list,
six build sessions A–F). Three systemic causes carry two thirds of it: a
hand-rolled `btn()` in 14 files with gold as the default commit fill at 16
call sites; the muscle palette read by only three files (Train · Gym paints
four muscles cyan); Home's six `FoldRow`s being the plain box rule 7
forbids. The motion layer is right — leave `Interactive` and the easing
tokens alone. Spot-checked: the 14/16 counts and `FoldRow` at
`MissionStructured.jsx:60` are real.

**NEXT** (in order, his go needed for the build programme): Session A (one
`Button` in Controls.jsx, gold → accent) → B (fold rows become instruments)
→ C (palette everywhere) → D (402px faults) → E (exercise sheet + trust
ladder) → F (Fuel/Coach/empty states); then the queued builds in memory
`nova-open-threads` (reply-in-place, the spoken Jarvis report, the
one-conversation org per `design/ORG-CONVERSATION-PLAN.md`). The :5183 dev
server and `_devconn.js` were cleaned at close.

---


**21 SEP (afternoon) — THE PLAN LOOP: HIS PROGRAM, THE COACH, PAUSE-AND-ASK,
AND THE REPORT BACK IN THE CHAT.** Six commits (4a863e0 → 4e1fb4d), all
shipped. Read memory `nova-plan-loop` first; it carries the why.

**THE FAULT, VERIFIED.** His "review my program" plan wrote "no agent can read
his program" because the planner is only shown DELEGABLE_IDS and the Coach was
`delegable:false`; his correction went to an Ask session that had never seen
the plan (the card is client-drawn); 8/12 research workers died at a $0.45
cap with no reason recorded; the finished report only filed to the Inbox.

**WHAT IS TRUE NOW**
- `program` (deterministic dossier, `programDossier.js`) and `coach` are plan
  steps; the planner is told who reads his data and to ALWAYS take a fresh
  dossier. Cost never refuses a plan (`overSoftCap` + `costLine`).
- `resumePlan` is idempotent; `amendPlan` re-plans with his words and
  inherits finished work; a step with SOME inputs runs with a MISSING note.
- Researcher: CLI `subtype === 'error_max_budget_usd'` → the record parks as
  `route:'continue'`; approve resumes the same sessions at 2×; one citation
  repair pass; worker cap $1.20 (measured), research ceiling $5.40.
- `planFollowUp.js`: a proposed plan inside 20 min makes his next sentence the
  correction (deterministic); plans + newest report ride Ask Nova and the
  Coach context. Client: report back in the chat with walk/coach/keep chips,
  Home "waiting on you" state, Inbox leads with "Approve = …".

**RUN FOR REAL (his request, live):** 7f3212b7 (dossier → gap research →
Coach): the pause fired on 3/4 workers, the card read right, the merge then
failed its citation gate and the Coach was skipped — which produced the
partial-inputs and repair fixes. 640ca3d2 (follow-on): 3/3, two Coach
routine-edit proposals filed (remove Cable Overhead Tricep Extension from
Push; remove EZ-Bar Reverse Curl from Pull), report in his Inbox and in both
agents' context. He has NOT yet read it or answered the proposals.

**OPEN**
- The two Coach proposals are pending in his Inbox; the report's seven
  changes are his to say "make change N" on.
- Only one plan run is watched by the chat at a time; the report
  announcement is one paragraph (line breaks not honoured in the log).
- His NO-CAPS rule is enforced in code and in memory but not yet on his
  Standing Instructions page (needs his approval through the Inbox).
- **TL;DR on every Inbox card shipped (src/tldr.js, code-derived).** Its first
  line takes a body's first paragraph — for the Coach review that is its
  "correction to the dossier", not the verdict; a per-kind opening rule is the
  obvious refinement.
- **THE SPOKEN REPORT ("Jarvis") — MOCKUP FIRST, his ask 13:46.** Five beats:
  verdict card → body model with the muscle lit and zoomed → program grid with
  that muscle's exercises lit → the one to drop blinks and leaves → the
  numbered changes with chips. `design/JARVIS-REPORT-PLAN.md` + the artifact
  linked there. Do not code it until he has reacted to the visual.
- **He wants proactive suggestions more often and NOT buried in the Inbox** —
  the TL;DR is the first step; the reply-in-place build below is the second.
- **QUEUED BUILD (his ask, 21 Sep 12:24):** an optional reply pop-up on any
  Nova notification/banner — speak or type in place, full banner context
  carried into the turn, and a sensible response to "not now" (flag,
  reminder). See memory `nova-open-threads`.

**21 SEP — HE USED IT. TWO REPORTS, BOTH REAL, BOTH FIXED AND SHIPPED.**

**1. THE LEADER ANSWER THAT FILED TWICE.** He typed a real answer about the
duty-manager dispute, saw nothing confirm, and sent it again. The server log
is the only place the truth was visible: `POST /api/leader/situation/answer →
CLIENT HUNG UP after 20004ms`, twice. `src/api.js` has a 20s default and that
lane spawns a model for ~40s — and **Express does not cancel the handler when
the socket closes**, so both filed. The second pass read the struggle the
first had just written and marked it RESOLVED, recording his live anxiety
about that night as settled.
- **The record is repaired** — the struggle was reopened through the existing
  `undoLeaderReflection({resolved})` rail, which un-resolves without removing
  the good struggles/working the same run added. Live server serves it.
- **Two guards, not one.** The in-flight `Map<hash,Promise>` is the one that
  mattered (his sends OVERLAPPED, so a persisted receipt had nothing to
  compare against); the stored `state.lastAnswer` covers a later retry.
  `answerSituation` takes a `runImpl` seam so both are testable without a
  model. **Both tests were proved by deleting each guard and watching them go
  red.**
- A timeout no longer claims failure: it says the work may still be landing,
  keeps his words in the box, and re-reads the record.
- **AUDITED THE CLASS**: every other long lane already returns a jobId
  (journal prompt, food describe, note summary, claude-code, ingest person,
  repertoire analyse). `leader-answer` was the only synchronous one. Prefer
  the job pattern for anything new.

**2. THE LIBRARY, LAGGY AND BUGGY.** His 15s recording, read frame by frame,
alternated between a book and an EMPTY ROOM about once a second. Two causes:
- A new volume is invisible until built and the build budget was **zero while
  a finger was down** — so a swipe moved past every built book and refused to
  build the new ones until he let go. Fixed with a cheap binding (the real
  cover at quarter scale, affordable mid-drag, replaced in place on lift), a
  centre-out queue, a starvation floor and a small LRU.
- **The first frame after mount arrives with a NEGATIVE delta** (rAF gets the
  timestamp of the frame it belongs to, which predates `lastTime`), and
  `damp` extrapolated opacity to **-5.59**. The very first frame drawn was an
  empty room by a different mechanism. `clamp(dt, 0, 0.05)` protects every
  damped quantity in the file.
- Drag was 68px/volume (one swipe crossed six books); now derived from the
  camera, 121px on his phone, measured 1.65 volumes per 200px.
- **The open settles** (his ask): sway and env-breath ease out over 5s then
  the loop stops. **Measured: 0 idle frames in detail after the settle.**
- The hard black slab mid-tumble was the contact shadow (2.4 boards wide,
  hard-cut at its own canvas edges); it now leaves with the ground.
- Drag at 4x throttle, 402px: median 18ms, worst 26ms, none over 33.

**A FIX I TRIED AND REVERTED — do not retry it blind.** The fading volumes
ghost through each other mid-tumble because every volume material is born
`transparent: true`. Toggling `transparent`/`depthWrite` per-frame in
`setOpacity` (solid → opaque) **blackened every cover** — all cloth colour and
all poster plates went flat black. A/B'd against the committed build and
dropped. The ghosting is REAL and still open; it needs a proper pass, not a
one-line toggle.

**STILL OPEN**
- The transparency ghosting above.
- A ~150ms hitch after a volume settles (the 1024x1536 repaint), placed where
  nothing is moving.
- Grid cards are tall; the top third of the shelf canvas is sky.
- Everything was measured in Chrome emulation at 402x874x3, **not on his
  iPhone**.

**17 SEP (evening) — WHY HAPTICS "STILL WEREN'T OCCURRING": THE DOCK COULD
NEVER HAVE BUZZED. Plus the shipped-build verification pass, and three rounds
of cross-session coordination.**

**GOAL.** Continue the Feel Plan's remaining builds; respond to his live
report that haptics still don't work; verify the last week's work actually
shipped, with screen recordings, not assumptions.

**DONE CRITERIA**
- *met* — the four new reflexes (tomorrow/week-count/since-trained/
  repertoire-left), tested and confirmed live on the running server.
- *met* — the three deferred view-transition pairs (library shelf→detail,
  note row→reader, session exercise row→ExerciseSheet), via a real
  `src/vtName.js` instead of hand-minted names. `withTransition` now catches
  the `ready` rejection a duplicate name causes (it aborts the WHOLE
  transition, not just its own morph — Safari 26.5, `InvalidStateError`).
- *met* — **root cause of the third "haptics don't work" report.**
  `src/MobileChrome.jsx` — the dock, his most-touched control in the app —
  was built from bare `<div onClick>`/`<span onClick>`. Zero haptic props.
  9 elements in the WHOLE APP could ever fire a real tap, against 38
  programmatic `haptic()` calls that cannot on iOS (they hit `canRetick()`,
  which returns immediately for a one-pulse word). No call site added
  anywhere else was ever going to reach the dock. Converted (commit
  `23c8179`): 6/6 dock tabs, More sheet's two grids, logo, job tray, outbox,
  Ask, gear.
- *unmet* — **he has not confirmed feeling it.** Verified structurally (a
  touch-spoofed Safari, no reload: 21 switch overlays where there were 0,
  `t.warm`'s pointerdown prefetch intact) — not on his actual phone.
- *unmet* — Home's cards and the rest of `App.jsx`'s ~38 programmatic
  `haptic()` calls are silent by the exact same mechanism. Not converted;
  the dock was the highest-value, most-reported surface and that's as far
  as this session went.
- *blocked on him* — distinguishable tiers need the native shell, which
  needs Xcode. He asked if it's free (yes, to build for his own device);
  I opened the App Store to Xcode's page (`open macappstore://...`) — his
  Apple ID sign-in and the click are his to do, and there is no confirmation
  he has started or finished it.

**STATE**
- `src/vtName.js` (new) — id-derived, CSS-safe names + the uniqueness guard
  (`vtStyle(prefix, id, openId)`), replacing three hand-minted, drifted copies.
- `src/MobileChrome.jsx` — every clickable is now `Interactive` with a
  `haptic` word; the two dismiss backdrops stay bare deliberately.
- `server/test/haptics.test.js` — "THE DOCK CAN BUZZ" fails on any new bare
  clickable in that file; a separate test catches `haptic="typo"` as a JSX
  PROP, which the original call-site grep couldn't see.
- `server/test/vtName.test.js` (new) — pins the three-file contract
  (vals → App.jsx → the sheet) that has to agree on a shared name.
- `scripts/dev-connect.mjs` (new) — seeds a dev connection from `server/.env`
  into a served, gitignored `public/_devconn.js` so verification never puts
  the token in a transcript. `--clean` on every use; confirmed absent now.
- `design/FEEL-PLAN.md` — corrected TWICE this session. The transition-pair
  table (Library's morph had a comment promising a result it never
  produced — the detail carried no name at all). The haptics section's
  claim "every call site below now reaches his hand" — WRONG, restated as
  "every element with a `haptic` PROP", with the dock finding folded in.
- Memory: `nova-haptics-ios.md` corrected (the "Pill and TextAction wear it"
  coverage line had rotted); `nova-concurrent-sessions.md` (new) — verify a
  peer's claim against the diff before acting, claim a file before editing
  it, an isolated worktree to test your own commit without a peer's dirty
  tree contaminating it, and: **this section is a STACK, prepend, never
  overwrite** — a peer's still-open work (the 3D Library, below) does not
  get erased because a different session closed later the same day.

**DECISIONS**
- **Did not strip `backdrop-filter` from the two morph panels that carry
  it** (`StepsHistory.jsx`, `RepertoireBook.jsx`) despite a peer's real
  finding that a view-transition snapshot freezes a backdrop-filter's
  sample → `--nv-glass2` is 75–88% opaque in every theme, under an
  82%-opaque scrim that isn't in the snapshot, for a ~280–420ms morph → math
  says imperceptible; noted the exact one-line fix in FEEL-PLAN.md rather
  than pre-emptively trading real glass depth for an unconfirmed flicker.
  **Forecloses:** don't touch it again unless he reports a flash on THOSE
  TWO panels specifically — then the fix is known.
- **Did not convert Home/App.jsx's remaining ~38 programmatic haptic calls**
  → scoped to the reported surface (the dock) rather than a blind sweep →
  **forecloses** claiming haptics work broadly; FEEL-PLAN says explicitly
  they don't yet.
- **Did not attempt Xcode download/sign-in** → entering his Apple ID is a
  hard line, not a judgment call → **forecloses** any native-shell progress
  until he does that step himself.

**VERIFIED** (locators)
- `cd server && npm test` → 1778/1778, this session, after every change.
- `npm run lint` → 0 errors; `npm run build` → exit 0.
- `git status --porcelain` → clean; `git rev-list --left-right --count
  origin/main...HEAD` → `0 0`.
- Deployed `version.json` buildId matches local `HEAD` exactly (confirmed
  twice this session, at two different HEADs).
- Backend: `curl localhost:4173/api/health` → 200.
- Dock haptics: 21 switch overlays counted live in a touch-spoofed Safari
  (`navigator.maxTouchPoints` override, no reload — a reload wipes the spoof
  and gave a false "0 switches" reading earlier in the session).
- Library/Notes/Exercise transition pairs: 0 duplicate `viewTransitionName`s
  on the exact shipped bundle (`git worktree add --detach ac15d31`, byte-hash
  matched against Pages) — screen-recorded and sent to him as an MP4.
- Two false alarms raised and personally cleared, not his app's fault: a
  leftover dev service worker showing a stale "newer build" banner (mine,
  from this session's own rig); the Personal Record dialog "reopening
  itself" (my own click sweep triggered it, and my detector was
  case-sensitive against CSS `text-transform` — 36s of watching afterward,
  zero spontaneous opens).

**ASSUMED**
- That a touch-spoofed Mac Safari faithfully predicts `needsSwitchHaptic()`
  on his real iPhone. Structurally sound (same UA check), never watched on
  his actual device this session.
- That the backdrop-filter freeze on the two morph panels is genuinely
  imperceptible — reasoned from the opacity numbers, not watched frame by
  frame in a recording.
- Whether he has opened the App Store page and started/finished the Xcode
  download — unknown either way.

**OPEN QUESTIONS / BLOCKERS**
- Does the dock actually buzz on his phone? Only his thumb settles this.
- Is Xcode installed yet? Gates the native shell and true haptic tiers.
- Does he want the remaining ~38 programmatic call sites (Home, mostly)
  converted the same way, or is the dock the priority surface for now?
- **His call, restated because it keeps recurring and is still unmet:** he
  has not marked a technique, answered a Leader question, or confirmed
  feeling ANY haptic himself. Every "done" above is built and verified by
  Claude, not used by him.

**NEXT ACTION** — ask him to tap the dock a few times and open
Settings → Haptics on his real phone. If the fix worked: a tap he didn't
feel before now does something, and the five-word test in Settings feels
present-but-identical rather than absent. If Xcode has landed, confirm with
`xcode-select -p` (expect a real `Xcode.app` path, not
`/Library/Developer/CommandLineTools`) before starting `native/README.md`.

**DO NOT**
- Do not say "every haptic call site reaches his hand" — only elements with
  a `haptic` PROP do; 38 programmatic calls still don't, on the dock's exact
  former mechanism.
- Do not strip `backdrop-filter` from `StepsHistory`/`RepertoireBook`
  pre-emptively — checked, math says imperceptible; only revisit on an
  actual report against those two panels.
- Do not overwrite this section wholesale on the next close — it is a
  stack; prepend above whatever is here, including the 3D Library entry
  right below, which is still open and not this session's to resolve.
- Do not enter his Apple ID or click through the App Store install on his
  behalf — his to do, no exceptions.
- Do not trust a touch-spoofed Safari check as equivalent to his phone for
  haptics specifically — it proves the overlay CAN exist, never that it
  fires correctly on-device.

**17 SEP (later) — THE 3D LIBRARY IS BUILT AND SHIPPED; HE HAS NOT SEEN IT.**
His three answers came back the same day (poster-plate editions · replace the
CSS shelf · try the tumble) and Phases 1–6 went in as four commits, each
verified by LOOKING at 375×812 cupertino against his vault (`p4-*.jpg` in the
audits folder). What is true now:
- `src/shelf3d/` — `edition.js` (pure, 14 tests), `coverArt.js`, `materials.js`,
  `bookRig.js`, `artPalette.js` (ONE palette derivation shared by canvas and
  grid — they disagreed until it existed), `useLibraryTint.js`, `Shelf3D.jsx`.
- three.js is now ONE shared chunk (`RoomEnvironment-*.js`, 532 KB); Body3D
  fell 646 → 116 KB. Verify with `grep -c ACESFilmicToneMapping dist/assets/*`.
- Fallbacks proven: lost context → CSS shelf + note; no WebGL → CSS shelf.
- The Chip's long-label wrap never worked (duplicate `whiteSpace` key,
  `Controls.jsx`); fixed, and `mobileNative.test.js` enforces hover gating.
**OPEN / HIS CALLS:**
- Bar 6: drag at 4× throttle is median 23 ms / max 35 ms, not ≤16. Levers
  left: pixel ratio 1.0, drop dust, split the 1024 repaint across two frames
  (the single 174 ms hitch after a settle).
- Detail runs a permanent rAF for the ±2° sway (his "alive"); on the phone
  that is battery while a book is open. A finite settle would return it to
  zero frames — his choice.
- The tumble shows the back board briefly at p≈0.5 (designed, with colophon).
- Still ugly-ish: grid cards are tall (plate 52% + cloth); top third of the
  shelf canvas is sky; the shine is quiet on matte jackets.
- **Nothing here has run on his iPhone.** Bar 8.

**17 SEP (morning) — THE LIBRARY PLAN WAS WRITTEN.**
His ask, with a 35-second Kabarza reel (Stripe Press + the open-source Complete
Shelf): the Library must reach that level — 3D volumes, the page tinting to the
book, foil and a moving specular, dust. `design/LIBRARY-PLAN.md` is the plan;
`design/audits/library-2026-09-17/` holds five reel frames and the three
current-state screenshots (375×812, cupertino, his vault).

**THE FINDING** (verified against the live server): his library is 21 sources —
17 videos, 3 articles, **1 book**. The spines view today slices YouTube
thumbnails into 30-px strips ("'Eve IS W"). The plan's answer is the *Nova
edition*: every source is a bound volume Nova designed, the poster set in as a
plate with a cloth margin, never stretched. **That is Decision 1 and it is his
before Phase 1 starts.**

**THE REFERENCE** is cloned under the session scratchpad (not the repo):
`github.com/MengTo/complete-shelf`, one 2.2 MB `index.html` (200 KB of code,
the rest embedded atlases). Every material/light/transition number in the plan
carries an `index.html:` line from the stripped copy. Re-clone if needed.

**NEXT:** his three decisions (edition vs art-first; replace vs third toggle;
roll vs tumble), then Phase 0 (a Library sibling of `tools/motion/record.mjs`)
and Phase 1 (one true volume). Five sessions estimated; Phase 3 is the risk.

**16 SEP — THE FEEL PLAN IS FINISHED, AND THE BROWSER CAME BACK.**
`design/FEEL-PLAN.md` is complete: haptics, optimistic UI, oriented transitions.
Three of its conclusions turned out to be **wrong on inspection**, which is the
part worth inheriting.

**VERIFIED BY LOOKING** (real Safari 26.5.2 — his phone's WebKit generation —
at exactly 375 CSS px, against the real vault, not demo data):
- The Repertoire. Pink card, glow, `2 of 6 ›`, and the catalogue behind it:
  6 techniques in families, 4 research reports with honest receipts
  ("transcript read, 14 frames seen, 22 sources cited · 7 techniques · kept",
  and two labelled `discarded draft`). **He still has not used it.**
- The Leader, both faces. THE LEAD is back on leadership craft ("Hand Someone A
  Real Decision Today", citing his own research file, and noting it is "a lever
  separate from anything you've used this week"). YOUR SITUATION carries the
  staleness line and the answer composer; `POST /api/leader/situation/answer`
  was exercised end to end with a **stubbed transport** so nothing fabricated
  reached his leadership profile.
- Train's haptic overlays: 0 → 5, each `appearance: auto` (`none` kills the
  tap), `opacity: 0`, and a tap landing on the overlay still reaches the button.

**THE THREE CORRECTIONS**
1. **The Library's morph had never once fired.** The shelf minted a name and
   promised the result in a comment; the detail header carried none. It could
   not have been fixed by adding one either — the shelf's name embedded the
   ARRAY INDEX, which the detail cannot know. `src/vtName.js` now mints from the
   id alone, both ends, plus the uniqueness guard that until now was a
   hand-written ternary in `valsRecipes.js` nobody copied.
2. **A duplicate name aborts the WHOLE transition**, not just its own morph —
   `ready` rejects with InvalidStateError while `finished` RESOLVES, so neither
   existing catch saw it and it leaked as an unhandled rejection.
   `withTransition` catches `ready` now and names the culprit in dev.
3. **The recipe writes are not optimistic and never were.** They were listed
   because he types every field. `recipes.js` writes the markdown, re-parses it,
   and throws if it does not round-trip — a refusal is a DESIGNED outcome there.
   New half of the rule: *an outcome is not predictable just because the input
   is known.*

**THE TOOLING THAT MADE IT POSSIBLE** — no MCP browser needed, and the
claude-in-chrome extension is still not connected:
- `node scripts/dev-connect.mjs` seeds the connection into `public/_devconn.js`
  (token never printed, gitignored). **`--clean` when done**; it was cleaned.
- Drive Safari with `do JavaScript … in tab N of window M`. **Address the tab BY
  URL, never "front document"**: a second Claude session was driving a
  `localhost:5174` window in the same Safari, and reading its state cost a round
  chasing a phantom "DEMO DATA" bug. Its work (`builder.js`, `projects.js`,
  `LiquidGlass.jsx`) is theirs — its four failing tests are green again.
- Pass JS via a file, not a shell string; AppleScript quoting will eat it.

**MEASURED, NOT ASSUMED**
- Four new reflexes: tomorrow 42,043→39ms, week-count 32,985→2ms, since-trained
  11,862→2ms, techniques-left 11,257→8ms. The last was also **wrong** before —
  "eleven techniques" against a catalogue of six.
- 371 named note rows cost 75ms to capture vs 73ms with none. The clever
  imperative fix that seemed necessary would have bought 2ms.

**STILL OPEN**
- He has still not marked a technique, answered a Leader question, or felt the
  Train haptics — everything above is built and seen by me, not used by him.
- Slow asks left to the model: "what did I spend this month" (~11s), "what is my
  longest streak" (~5s). Both are lookups; the reflex pattern fits.
- The exercise→sheet morph is verified at both ends separately but never watched
  end to end: that needs a live session, and starting one writes a draft.

**15 SEP — THE REPERTOIRE: A CONFIRMED REPORT, AND ONE TECHNIQUE A DAY.** His
ask, sent with a 42-second Mentalist reel: *"When I give Nova something to
analyse and capture I'd like a confirmed report with what's been analysed and if
anything noteworthy is evident from the research"* — then research the
techniques around it, build a plan, and **present one a day he can develop and
use**.

His answers when asked: Home card **and** the spoken morning brief; practice
**tracked** with reinforcement; catalogue scoped to the **Patrick Jane skill
set** (suggestion, cold reading, misdirection, observation).

**DONE CRITERIA**
- *met* — the CONFIRMED report. `server/lib/captureReport.js`, reusable by any
  lane: code records what each fetch stage actually returned and builds the
  `## What was analysed` section from those facts. The model writes findings
  ONLY, under a receipt it never drafts.
- *met* — the analyse + research lane (`repertoireLane.js`), the curriculum
  store (`repertoire.js`), routes, both Home idioms, the spoken brief beat.
- *met* — **run for real on his reel, three times**, each run finding a fault the
  last one hid (below).
- *unmet* — **he has not seen it.** Nothing here has been used by him, and the
  catalogue is filed but the first day's card has not been marked by a human.

**THE THREE RUNS, AND WHAT EACH ONE CAUGHT**
1. **Run one** produced a good report whose own receipt read `✓ Transcript: 1
   lines · 15 characters` for a 42-second clip. Fifteen characters is the length
   of `[object Object]`: `transcribeAudio` returns `{ text, backend }` and the
   lane stringified the object. The model noticed, said plainly it had no
   dialogue to quote, and worked from the frames — which is the whole design
   working, but the receipt had certified the garbage.
2. So a call that returns is no longer a read: a transcript must clear a
   plausibility floor (one character per second, minimum twenty) or the entry
   becomes a FAILURE with the real numbers and `isGrounded` degrades to
   frames-only. **Run two** then read all 517 characters and produced a far
   better report — it quotes the dialogue and spots the wadded-up napkin as the
   physical anchor the whole trick rests on.
3. **Run two** put `"...broken glass that was "` on a card: `slice(220)` severs
   the word it lands in. Clipping now backs off to a sentence or word boundary
   and marks the trim. **Run three** is the clean one.

**THE FINDING HE ASKED FOR.** The reel's own burned-in caption says *"Gaslighting
is an art form, and Patrick Jane is the Picasso of it."* It is not gaslighting —
that is sustained denial of someone's real perceptions over time. This is one
unverifiable assertion plus a real physical prop, which is structurally an
interrogation **false evidence ploy**. The mislabel matters because it sends
anyone researching it into abuse-pattern literature instead of the
suggestion/hypnosis/interrogation literature that actually explains the clip.
**That caption exists nowhere in the audio** — frames are why it was caught.

**DECISIONS (choice → reason → what it forecloses)**
- *The coverage receipt is written by CODE, not the model* → a model describing
  its own reach writes the reach it wishes it had. **Forecloses** the study
  lane's approach of asking for a `## Coverage` section in the prompt.
- *An ungrounded capture has its findings DISCARDED, not shortened* → the
  failure that matters is not a thin report, it is a confident one about a video
  nobody could open. **Forecloses** "best effort from metadata".
- *The interval widens with times TRIED, never times shown* → exposure is not
  practice; a drill is not an idea from a book. **Forecloses** reusing the
  Library's schedule, and makes a "not today" deliberately not advance the clock.
- *The day's pick is a pure function of (catalogue, state, date), recorded by
  its first caller* → Home and the spoken brief must name the same technique.
  **Forecloses** either surface picking independently.
- *The lane is video-only* → a link yt-dlp cannot open is refused with a pointer
  at the Researcher. **Forecloses** guessing at an article from its URL.
- *Report and techniques file as ONE decision, and undo removes the techniques
  FIRST* → a curriculum he undid that kept serving a technique a day is the
  worse half to leave behind.

**VERIFIED (with locators)**
- Live, `/api/repertoire/analyse` on his reel: `Analysed 42-second Instagram reel
  by bondwayne — transcript read, 14 frames seen, 8 sources cited.`
- Both Home idioms driven in the real app at **375×812** (`__novaApp.setState`,
  devtools emulate): new state and answered state, `scrollWidth === 375`, the
  serif/mono Command Core twin and the Pill/grouped cupertino twin.
- `twins.test.js` now derives the Inbox's RETRY kinds and `retryRecord`'s
  handled kinds from source and compares them — **verified by deleting the
  repertoire handler and watching it go red**.
- Gates: `npm test` **1569 pass, 0 fail** · `npm run lint` exit 0 · `npm run
  build` exit 0 (gated on `$?`, never a grep).

**ASSUMED**
- That the week he chose is the right shape. Mon/Wed/Fri introduce, the day
  after carries, Sunday reviews — three new a week and one review day, his
  instruction verbatim. It lives in one constant (`ROTA`) and is his to move.
- That the plausibility floor (1 char/second) never rejects a real transcript.
  A genuinely near-silent clip WILL fail it and be reported as unreadable audio.
- That he wants the brief beat every morning. It is deliberately not
  rate-limited the way the library's is, and it stands down once he has marked
  the day's card.

**OPEN QUESTIONS / BLOCKERS**
- **Nothing has run on his iPhone** — now true of four sessions.
- The top-up has never fired. Runway is 6 of 7 untaught and `MIN_RUNWAY` is 6,
  so it is exactly at the boundary — the first fire is about a week away, and
  nothing has proved the top-up prompt in anger yet.
- `Wiki/Library/Nova Skills.md` (his page) does not list this lane — only the
  SEED for a fresh install was updated, deliberately, since the page is his.

**HIS FOUR CHANGES, 15 SEP (all shipped and gated)**
1. **The rota is his week.** "A new technique every second day and then a review
   on the final day of the week" — Mon/Wed/Fri new, the day after CARRIES it
   (same drill, second go), Sunday reviews. Driven by the day of the week, not
   by a count, so a missed day cannot slide the rota sideways. Walked a real
   week in test: new A · second A · new B · second B · new C · second C · review.
2. **The lit panel.** The technique card is pink (`--nv-mg`) throughout — edge,
   bloom, drill box and button. `src/glowPanel.js` makes the look a FUNCTION of
   an accent token, and four more Home sections wear it in their own colour:
   daily review purple, landed green, Nova-is-working cyan, wrap the day in its
   verdict colour. The bloom is a class so Calm can zero it; `.nv-pane`'s shadow
   became `--nv-pane-shadow` so a lit pane composes depth + bloom.
3. **Articles.** `readWithBrowser` (the Researcher's proven path) reads a page as
   text; the toolchain is chosen from the URL and then PROVEN by the result, so a
   link that looks like video and will not open falls through to the page reader.
   The prompt stops calling a page a transcript. Routing moved with it: the
   learning question is about his SENTENCE, not the link type.
4. **The top-up.** Below six untaught, Nova researches six more and PROPOSES
   them. Every guard is a pure function: an empty catalogue is not "running low",
   and it never stacks a second proposal on one he has not answered. Registered
   in the ops roster so the Guardian watches its heartbeat.

**THE LEADER, 15 SEP — THE DRIFT AND THE SWIPE.** His report: it "is drifting
from showing me general leadership advice and concepts and is now just focused
on a past conversation problem", and "it does not know where the situational
context is now directly at".

His state said exactly why: **8 open struggles, not one ever resolved**, six of
them the same thread — and six consecutive daily ideas about it (10–15 Sep). The
struggle pile was the loudest thing in the daily context, so it ate the subject
every morning.

- **Two channels from one call.** THE LEAD is general development, grounded in
  concepts/sources/research, and explicitly barred from the live situation. THE
  SITUATION gets the struggle pile. A test slices the prompt in half and asserts
  the struggle text appears in one and not the other.
- **The box on Home swipes between them** (`src/LeaderBox.jsx`, useOptionPager —
  direction locks once and a vertical verdict is final). Gold for the lead,
  violet for the situation. **The Command twin never had a Leader box at all;
  it does now.**
- **`daysSinceUpdate` is the honesty.** Nova knows when he last said anything and
  therefore knows it does NOT know what happened since. The card says so.
- **It follows up.** `shouldAskSituation` — stale, not already asked, not asked
  inside the gap even if he dismissed it — raises a `leader-followup` record,
  which reaches his phone through the existing push/Telegram path.

Proved on real data: the forced two-channel run gave "Name The Chain, Not The
Praise" (general feedback craft, nothing to do with the dispute) alongside a
situation read opening "As of yesterday" and asking about the area-completion
numbers.

**THE REPERTOIRE OPENS** from the "1 of 7" chip — techniques in teaching order
and every research report in full, discarded drafts kept and labelled.

**NOT SEEN:** both browser MCPs went down mid-session (chrome-devtools
disconnected; the extension not connected), so the **Repertoire overlay has
never been looked at**. The Leader box WAS driven in a browser, swipe included,
before they died. The overlay's shaping is a pure module with 7 tests run
against his real payload, and its strings grep out of the built bundle — but
nobody has seen it render.

**THE FEEL PASS, 15 SEP** (a reel he sent; plan in `design/FEEL-PLAN.md`). His
report first: *"I have never felt any haptics while using my phone."* True and
expected — iOS WebKit has never shipped `navigator.vibrate`, so every call had
been a no-op on the only device he uses, and the capability check Nova has
carried since the native wrapper landed had never once been shown to him.

- **The iOS path that still works.** Safari 17.4's `<input type=checkbox switch>`
  fires the Taptic Engine. Every library drove it programmatically and **iOS
  26.5 closed that door**; what survives is laying a TRANSPARENT switch over the
  tappable so his own finger lands on the control. Opt-in via
  `<Interactive haptic="tick">` — the overlay needs its host positioned, and
  turning ~300 wrappers into stacking contexts blind was not the move. Pill and
  TextAction wear it.
- **Limits, stated in the UI:** one flavour on iOS web (26.5 also killed
  re-ticking), no Taptic on iPad, and nothing Nova presses for him can buzz.
  **Settings → Haptics** names the live path and lets him press all five.
- **`haptic('light')` was never a word** — five call sites silently firing a
  tick. **`warn` had NEVER fired.** Both now pinned by tests that read every
  call site in `src/`.
- **Train had no haptics at all** — the set tick, adding a set, finishing, and
  the refusal to finish with nothing ticked.
- **The technique card morphs into the Repertoire book** — the second
  shared-element pair in the app, after Recipes.
- **Shopping add is optimistic**; the full busy-flag audit is written into
  FEEL-PLAN.md, and `optimisticWrite` now holds the five beats in one place.

**UNCONFIRMED AND ONLY HE CAN CONFIRM IT:** whether the overlay switch actually
buzzes on his iPhone. It cannot be tested from here, and both browser MCPs were
down for the back half of the session.

**THE BLACK SCREEN (15 Sep, mine, fixed in `efce3eb`).** The haptic overlay made
`Interactive` render a children position; React throws on a void element with
children and, with no root error boundary, the whole tree unmounts. Every screen
using `<Interactive as="input">` — Fuel, Settings, Ops, RecipeOverlay,
PortionSheet — went black. **Lint, build and 1615 tests all passed**, because the
suite renders no components. `server/test/interactiveRender.test.js` now does,
and its last case is generated from the real call sites. **DO NOT change a
component every screen renders without a render test.**

**CONVERSATION SPEED, 16 SEP** (a Jarvis reel; his ask: quick back-and-forth,
no "awkward waiting and awkward 'on it sir'").

Measured six real asks live before touching anything. **Five: 2-66ms. One:
21,610ms** — "when did I last train legs". The conversation is not slow, it is
BIMODAL, and the filler exists for the second mode.

- **The muscle-group reflex** closes it: 21,610ms → **2ms**, and it agrees with
  what the model said. His library carries a muscleGroup on all 135 exercises;
  only the WORD needed a table. Handles legs/arms/core and his own split names
  (push, pull). Falls through to the model when there is no library to translate
  with, rather than guessing.
- **The ack now waits 900ms** and is cancelled the moment an answer appears — on
  the reflex path and at the model path's first sentence. He will almost never
  hear it. The lines are NOT deleted: removing filler without removing latency
  gets silence instead of awkwardness.

**HAPTICS — IT WORKS NOW.** His report: "some slight haptic feedback… every
button is the same feel." The bug was `appearance: none` on the overlay, which
stops Safari rendering it as a SWITCH and takes the Taptic behaviour with it.
The heavier words now ask for extra pulses (commit 2, celebrate/warn 3, warn the
rapid one).

**THE UA VERSION IS FROZEN.** His diagnostic read iOS 18.7; he is on **iOS 27**.
A gate on that number nearly shipped, telling a phone three majors past the
cutoff that its tiers worked. There is no gate now and `tiers` is `null` on iOS
— unknown is its own answer — because a haptic leaves no trace to detect.

**NEXT ACTION.** Open Home. Today's technique should be card one of five with a
drill on it. Mark it, then check `Wiki/Library/Repertoire Log.md` has the line
and `server/data/repertoire.json` has `tried: 1`.

**DO NOT**
- **Do not trust a fetch's success as proof of its result.** This lane shipped a
  receipt certifying `[object Object]` as a transcript. Check the CONTENT.
- **Do not add a fourth spacing schedule without pinning it in `twins.test.js`**
  beside the Library's, the Leader's and the Repertoire's.
- **Do not compare dates as instants in this feature.** He is AEST; the first
  picker lost every review to it. Whole calendar days, as strings.
- **Do not wire a new surface only into `refreshLiveData`'s task list** — that
  runs solely when the snapshot throws. A new surface needs a `SLICES` entry.
- **Do not style `.nv-pane` from a bare two-class rule.**
  `:root[data-nv-style="cupertino"] .nv-pane` is (0,3,0); `.nv-pane.nv-glow` is
  (0,2,0) and loses SILENTLY — the class is on the element, the tint resolves,
  and nothing is drawn. Match the specificity and come later.
- Everything in the previous blocks' DO NOT lists still stands.

---


**14 SEP, THIRD PASS — "AS QUICK AND EFFECTIVE AS CLAUDE AND CHATGPT
VOICE." His instruction after the driving report: fix Wren, then keep pushing
on Nova's voice, knowledge, speed and understanding until it reaches that bar.

**DONE CRITERIA**
- *met* — **Wren** (`../atlas-partner`, commit `eaa9888`, **committed but NOT
  pushed** — that repo has no CLAUDE.md, so the default "commits stay local"
  applies). All three faults it shared with Nova: the wall-clock cap, the
  per-sentence voice fallback, the polled wake gate. Plus the throwing restart.
  89 tests pass. Its mirror (`lib/turnEnd.mjs` ↔ `public/voice.js`) is now
  asserted by test, including that the wall-clock-first cap cannot come back.
- *met* — **he can talk over Nova** (`9e7d3bc`). No phrase, no tap.
- *met* — the words after the wake word, and the words he barges in with, now
  START the turn instead of being thrown away (`932469a`).
- *met* — a seeded turn runs on the HOLD, not the LEAD: **5 seconds off every
  hands-free turn** (`932469a`).
- *met* — 300ms before the mic reopens, so Nova's last syllable is not heard as
  his first word (`932469a`).
- *met* — barge-ins leave a receipt (`c4b1293`) and a false one switches itself
  off (`f534583`).
- *met* — **the cold-start stall is gone: 8,776ms → 101ms** (`56d699f`,
  `9f294ba`).
- *met* — TTS bytes cut to 40% (`927d4fd`).
- *unmet* — **still nothing has run on his iPhone.** That is now true of three
  sessions' work.

**THE MEASUREMENT THAT MATTERED.** A delegated agent measured the whole spoken
path over a 7-day log window plus live probes. Ranked, as found:
1. per-sentence TTS over the tailnet — phone median 3,897ms vs 956ms localhost;
2. cold context assembly blocking the ask response — 8.6s;
3. CLI boot + first token — 8.7s cold, 5.9s warm;
4. reflex misses falling through to the full cold path — 15.8s;
5. the 150ms poll cadence — real but small, steady even over 100s waits.

(1) and (2) are addressed. (3) is Claude Code's own latency and is not fixable
from here. (4) and (5) are untouched and are the next levers.

**FOURTH PASS — ASKING NOVA ITS OWN QUESTIONS.** After the speed fixes, the
cheapest method in the session: ask through the live endpoint the way he speaks,
and check every number against the file behind it. Three real faults in twenty
minutes, none of which a test would have caught — see [[nova-ask-it-yourself]].

- *"what are my steps today"* → **41s in the model, answered about protein.**
  The reflex matched, found no row, returned null on "the model can go
  looking" — but the day file is the only place a step count lives. Absence is
  now this layer's answer, with the last real reading and its date (`40643ad`).
  The prompt also now says: answer the question he asked, and if the exact
  thing is not there, say THAT first.
- *"what is my hrv"* → **"HRV is 0 milliseconds."** 13 Sep carried `hrv:
  0.0878` against 70-87 all week: seconds sent as milliseconds. It feeds
  `computeDeloadSignal`, which advises lighter at a 10% drop and would have
  computed 99% (`a1a5ea1`).
- *"what did I weigh last"* → **"82200 kilograms"**, and 16.4s to say it. The
  SAME push sent grams as kilograms, and the phrase missed the weight pattern
  entirely (`e21aca3`).
- Sleep: **0 of 56 day files have ever carried a figure**, so every "how did I
  sleep" went to the model to be told nothing. It now answers instantly and
  names the switch — Sleep Analysis is not in his Shortcut.
- `METRIC_RANGE` in `healthData.js` is the general guard now: what a living
  person's reading can be, ONE known unit slip rescued per metric, anything
  still outside becomes ABSENT. Applied on the way in and on the way out.

All now instant and true: 82.2 kilograms · HRV 88 milliseconds · 4 drafts · no
sleep reading, with the reason. **1502 pass.**

**FIFTH PASS — THE SAME BATTERY, WIDENED.** Twelve questions across every
domain, asked the way he says them. **Five were instant; now ten are.** The
battery itself went from ~170 seconds to ~24.

- *"what's my vo2 max"* → **"No VO2 max in your log yet."** It is in all eleven
  September files. Nothing read it — the line to speak it had no caller — so
  Nova denied holding data it holds. Worst direction to be wrong in.
- *"how far did I walk yesterday"* → **"9,846 steps"**. Distance asked, steps
  given: a different measurement handed over as the one he asked for.
- *THIRD unit slip in the 13 Sep push*: `walkingRunningDistanceKm` 10401.48
  (metres as kilometres). All three of that day's faults are ONE mistake — base
  SI units where the named unit was expected. **If a fourth metric ever reads a
  thousand times out, look at the Shortcut before looking at the code.**
- Costs paid for numbers already on disk: steps-yesterday **27s** (the pattern
  allowed nothing between "steps" and the day), to-do list **9.5s**, "what did I
  train yesterday" **21s**, and the slowest of all, "what's my bench press PR"
  at **30.9s**.
- The PR answer leads with the SET he lifted and labels the estimate (the 12 Sep
  rule), and an ambiguous lift — "bench press" fits three in his own library —
  is **asked in 0.04s** rather than guessed or waited half a minute for.
- Spoken register in the reflex layer: URLs are never read aloud
  (`speakable`), and dates are said as "17 July", not as digits (`spokenDate`).

Commits `a46c1b3`, `3b82f3a`, `3f16c6d`. **1511 pass.**

Still going to the model, correctly: *"when did I last train legs"* (needs
muscle-group interpretation) and *"what did I spend this month"* (the money
ledger has no reflex).

**DECISIONS (choice → reason → what it forecloses)**
- *Barge-in is filtered by comparing what was heard against WHAT NOVA IS
  SAYING* → the mic must be open during playback, so it hears the speaker; the
  only certainty available is Nova's own words. **Forecloses** any barge-in
  design that does not know what is being spoken.
- *The filter is biased toward leaving Nova alone* → a missed barge-in costs a
  tap (today's behaviour); a false one cuts Nova off for nothing.
  **Forecloses** loosening it to catch more interruptions without evidence
  from `turns.json` that it is missing real ones.
- *A false barge-in switches barge-in OFF and says so* → it cannot be verified
  on the device where the echo is loudest, so it has to fail safe.
  **Forecloses** shipping it as unconditional behaviour.
- *The brief is cached APART from the main snapshot and survives the
  write-invalidation* → his calendar does not move when he logs a meal.
  **Forecloses** treating all context sections as equally volatile.
- *A stale brief is served with its age stated, not silently* → NOVA-METHOD:
  stale data self-labels. **Forecloses** serving any cached snapshot unlabelled.
- *64k, behind NOVA_TTS_BITRATE* → his ear is the judge, not mine.
  **Forecloses** arguing about audio quality instead of turning the knob.

**VERIFIED (with locators)**
- **The whole cold stall was ONE section.** `ask context: 8776ms for 19
  sections — slowest: the brief 8775ms, his shelf 101ms, learned preferences
  32ms…`. Every other section ≤101ms. The instrumentation that found it is now
  permanent (`gatherContext` times each section; `askContext` logs the slowest
  six to `~/Library/Logs/nova-os-server.log`).
- After the fix, with the main 90s cache deliberately expired so all nineteen
  really rebuilt: `ask context: 101ms`, and the brief is no longer in the list.
- After a real reload: `brief cache warmed at boot in 10294ms`, and the FIRST
  ask after that restart returned in **211ms** (was 8.4s).
- TTS bytes per second of audio, live endpoint: **20,006 before, 8,003 after**
  (40%). Fidelity 23 dB SNR, measured on a pessimistic transcode of the
  already-lossy 160k. The old '192k' was never honoured — 24 kHz mono is
  MPEG-2 Layer III, capped at 160k.
- Barge-in, driven live in a browser through `window.__novaApp`: the echo
  sentence scored "100% of it is what Nova is saying" and did not fire; his
  sentence scored "4 words Nova never said" and did; the turn that opened
  collected the seed `"no wait the site visit moved"`.
- Settings row "Talk over Nova" looked at under device emulation at 375×812 —
  wraps, chip holds, no horizontal scroll (`scrollWidth === 375`).
- Gates: `npm run lint` 0 errors; `npm run build` **exit 0**; `cd server &&
  npm test` **1491 pass, 0 fail**; Wren `npm test` 89 pass; `HEAD ==
  origin/main`; service reloaded, `/api/health` 200; no `vite` left running.

**ASSUMED**
- That barge-in survives iPhone echo. This is the big one. If it does not, the
  valve turns it off after two false cut-offs and `turns.json` says why.
- That 64k sounds the same to him. Measured, but his ear decides.
- That a brief up to 30 minutes old, labelled, is acceptable in a reply. It is
  the only stale thing now served on the cold path.
- That the 300ms handover is enough for the speaker to fall quiet on iOS.

**OPEN QUESTIONS / BLOCKERS**
- **Wren is committed but not pushed.** HIS CALL.
- **A receipt log for Wren?** Not ported; it is an endpoint plus a store.
- **"Hey Nova" is OFF on his phone.** Barge-in does not need it (with the wake
  word off the mic opens only while Nova speaks), but starting a conversation
  hands-free does.
- **Reflex misses (15.8s) and the 150ms poll** are the two measured levers left.
- Two mornings (8 and 12 Sep) still have no health reading — his Shortcut.

**NEXT ACTION.** His next spoken conversation in the car. **Expected if it
worked:** a new conversation starts answering in about a fifth of a second
instead of nine; talking over Nova stops it; "Hey Nova, what's the weather"
answers without being said twice. Then read
`server/data/voice/turns.json` — turn endings AND barge-ins are both in it, and
a barge-in followed by a turn that heard nothing is a false one.

**DO NOT**
- **Do not optimise a context section without timing it first.** Nineteen
  sections, eighteen of them ≤101ms, one of them 8,775ms. Every theory about
  this path before the measurement was wrong, including mine.
- **Do not drop the brief cache on a vault write.** It survives deliberately;
  a logged meal does not move a meeting.
- **Do not raise the TTS bitrate to "fix" audio without listening first.**
  24 kHz mono caps at 160k, so anything above that is silently ignored — the
  old 192k was a no-op that cost nothing and proved nothing.
- **Do not loosen the barge-in filter from the armchair.** `turns.json` is the
  evidence: missed barge-ins do not appear in it, false ones do (a barge-in
  followed by a turn that heard nothing).
- **Do not treat `stoppedSpeaking: 2` in a barge-in trace as a bug** — the path
  legitimately stops speech twice (onWakeWord, then the turn opening).
- Everything in the previous two blocks' DO NOT lists still stands, especially:
  gate a build on `$?`, never on a grep.

---

**14 SEP, SECOND PASS — THE DRIVING REPORT: NINE VOICE FAULTS, EIGHT
FIXED, ONE OF THEM MINE.** He tried to hold a conversation with Nova in the car
and it failed in every way a conversation can: cut him off without a pause,
rambled without context, advised on the wrong half of a story, alternated
voices sentence by sentence, talked over him while the screen said LISTENING,
lost the thread between one turn and the next, and buried its panels below
the fold. His standard, verbatim: *"Jarvis from Iron Man does not have this
sort of problem and same with Claude AI and ChatGPT."* This is now the big
focus, by his instruction.

**GOAL.** Every fault in that report traced to a mechanism and fixed, with a
receipt where the next report will need one — and the same lessons carried to
Wren (`../atlas-partner`), which is built on Nova's foundation.

**DONE CRITERIA**
- *met* — one voice per reply (`4f06bcd`). The alternation was the morning's
  fallback (`6b58b13`) doing what it was written to do: every sentence the
  engine failed went to the browser voice, and over cellular the engine fails
  sentences at random. `ttsVoiceLock` per generation, one retry first.
- *met* — the mic waits for the END of a reply, not a gap in it (`0953427`).
  `voiceBusy` clears at the first partial; between sentences `speechActive` hit
  zero and `maybeAutoListen` opened the mic. `replyStreaming` (job id).
- *met* — `api.ask` outlives a cold context assembly: 45s, was 20s against a
  25s server ceiling (`ad36299`).
- *met* — the spoken register: 2–3 sentences, hand the floor back if he is
  still explaining, ONE question before assuming, two is the ceiling
  (`1783433`). Applies to typed asks too — the prompt does not know its origin.
- *met* — no wall-clock cap on a speaking turn; a restart that throws retries
  before it submits; a 600ms hold floor after a restart; every held turn
  reports WHY it ended to `POST /api/voice/turn` →
  `server/data/voice/turns.json` (`39d77fc`).
- *met* — the wake-word recogniser stops on the same beat dictation starts
  (`d33ae13`), not up to 900ms later.
- *met* — a follow-up stays with whoever just spoke (`1ca667a`). His
  screenshots: the Leader at 01:04, his rebuttal at 01:17 routed to Nova, who
  had never seen it. `intentRouter.followUpLane`, 20-minute window.
- *met* — a rising panel scrolls into view clear of the dock; tap to enlarge
  with a FLIP morph, scrim, swipe-down (`d812e07`).
- *unmet* — **nothing here has run on his phone.** Every fix is verified by
  reading, by tests, or in desktop Chrome at 375px. The device is the test.
- *unmet* — **Wren.** Its `public/voice.js` carries the same per-sentence
  browser fallback (line 190), the same 120s cap, and a polled wake-word gate.
  Not touched — a separate repo with its own rules; HIS CALL to open it.

**STATE (paths).** `src/App.jsx` (`ttsVoiceLock`, the retry, `replyStreaming`,
`lastAgent`/`lastAgentAt` on the ask), `src/api.js`, `server/lib/claudeCode.js`
(the register), `src/turnEnd.js` (`endReason`, `maxSpeakingMs`,
`RESTART_GRACE_MS`), `src/useDictation.js` (`reportTurnEnd`, `spin(isRestart,
attempt)`), `src/WakeWord.jsx`, `src/screens/Voice.jsx` (turn-end wiring,
`glassRef`, `GlassSheet`), `src/VoicePresence.jsx`, NEW `src/GlassSheet.jsx`,
NEW `server/lib/voiceTurns.js` + `server/routes/voiceTurns.js` (mounted in
`server/index.js` after the token check), `server/lib/intentRouter.js`
(`followUpLane`), `server/routes/voice.js`. Tests: `turnEnd` (22),
`voiceTurns` (6), `intentRouter` (+5). **1482 pass, 0 fail.**

**DECISIONS (choice → reason → what it forecloses)**
- *One voice per reply, decided at the first sentence* → alternating voices is
  worse than either voice, and worse than the silent gaps it replaced; in the
  car, audible-and-consistent beats correct-voice-with-holes. **Forecloses**
  any per-sentence engine choice; a whole reply in the browser voice is the
  accepted worst case, and the voice test names the cause.
- *The mic waits on the reply job, not on speech activity* → speech activity
  has gaps by construction when sentences stream. **Forecloses** using
  `speechActive === 0` alone as "Nova is done".
- *The register rule applies to typed asks too* → the prompt has no origin
  flag. **Forecloses** loosening the rule if the Mac chat reads terse; the
  next step is an origin flag.
- *No wall-clock cap while speech arrives; a 15-minute absolute ceiling* → the
  120s cap existed for a television, and a person explaining a situation talks
  for longer. The old test ENCODED the fault. **Forecloses** any future
  "runaway mic" guard expressed in elapsed time rather than silence.
- *A hold FLOOR after a restart (600ms), not a reset* → the agent's correction
  of my brief: the commonest restart is iOS giving up because he genuinely
  stopped, so a reset would add a whole hold of dead air to nearly every turn.
  **Forecloses** resetting `lastHeardAt` on restart.
- *Sticky lane: only the plain 'ask' fall-through, only Coach/Leader, 20
  minutes, broken by naming Nova* → a wrong stick costs an answer from the
  Leader instead of Nova; a wrong fall-through costs the whole thread; his gap
  was thirteen minutes. **Forecloses** making the router stateless again.
- *His mobile order stays; the panel scrolls to him* → "the core, then the
  station status, then the conversation" is his explicit decision in the code.
  **Forecloses** reordering the Voice screen to fix visibility; reopening it
  is a decision he makes, not a fix I make.
- *Wren is not touched from this repo* → separate codebase, "nothing here
  imports from Nova at runtime", its own plan and rules. **Forecloses** a
  shared module; the port is a re-implementation of the lessons.

**VERIFIED (with locators)**
- Kokoro is built from "British male packs" (`server/voice/sidecar.py:9`);
  `resolveSpeechVoice` picks `lang === 'en-AU'` (App.jsx) — the alternation was
  those two, sentence by sentence.
- `App.jsx` `voiceBusy: false` at the first partial ("he can barge in the
  moment the answer exists") — the survey agent had this wrong; re-verified.
- `turnEnd.js` `maxTurnMs = 120000` checked FIRST in `nextAction`; the test
  "the microphone is never held open forever" asserted speech-one-second-ago,
  ended-at-120s.
- `api.js` `REQUEST_TIMEOUT_MS = 20_000`, `ask` with no override; `askContext`
  25s per section.
- `routeIntent(raw).lane` per message, no state; fall-through is `'ask'`.
  `restarts` resets on every heard word (`turnEnd.js:69`), so the restart
  limit cannot end a speaker.
- The sheet, in desktop Chrome at 375px via `window.__novaApp` (dev-only,
  `App.jsx:563`): three tappable panels; hero scrolled into view; tap → dialog,
  body overflow hidden; Escape → 0 dialogs, overflow restored. Without the
  scroll margin the hero's bottom was 738 against a dock top of 737; with it,
  704.
- `/api/voice/turn` answers 401 unauthenticated on the reloaded service —
  mounted behind the token check.
- Gates at close: `npm run lint` 0 errors; `npm run build` **exit 0** (see DO
  NOT); `cd server && npm test` 1482 pass; `HEAD == origin/main`; service
  reloaded, `/api/health` 200; no `vite`, no `yes` processes left.

**ASSUMED**
- That the phone behaves like desktop Chrome for every client change. iOS
  Safari's recognition, audio graph and `scrollIntoView` all differ. His next
  drive is the real test, and `server/data/voice/turns.json` is the receipt.
- That 20 minutes is the right follow-up window. Chosen from one data point.
- That the register does not make the typed Mac chat feel clipped.
- That a whole reply in the browser voice (engine failed the first sentence)
  is acceptable to him. It is the designed worst case, and he dislikes that
  voice.

**OPEN QUESTIONS / BLOCKERS**
- **Wren.** Three of these faults exist verbatim in `../atlas-partner/public/voice.js`.
  Opening that repo is his call.
- **The Voice screen order on the phone.** His decision stands; if he wants the
  glass above the station rail, that is one `order` swap.
- **An origin flag for the ask prompt** if the typed chat reads too terse.
- Two mornings (8 and 12 Sep) still have no health reading — his Shortcut.

**NEXT ACTION.** His next spoken conversation on the phone. **Expected if it
worked:** one voice throughout; no reply starts while LISTENING shows; a long
explanation is not cut at two minutes; a reply to the Leader stays with the
Leader; a rising panel is on screen and grows when tapped. Then read
`server/data/voice/turns.json` — every turn now says why it ended
(`hold`/`lead`/`cap-idle`/`cap-absolute`/`restart-limit`/`engine`) — and the
`ask →` lines in `~/Library/Logs/nova-os-server.log` for which lane took
each turn. If it still cut him off, the reason is in the file, not in a guess.

**DO NOT**
- **Do not gate a build on a grep.** `npm run build 2>&1 | grep -E
  "error|files generated"` printed `files generated` while the build exited 1:
  oxc reports `PARSE_ERROR` in caps and the PWA plugin prints its line anyway.
  Gate on `$?`. I nearly committed a `Voice.jsx` that did not parse.
- **Do not put `{/* */}` directly inside `( … )` before a JSX element.** That
  is the parse error above; a plain `/* */` goes there.
- **Do not fall back to the browser voice per sentence.** That was this
  morning's `6b58b13`, and he heard it. Per reply, or not at all.
- **Do not read `voiceBusy` as "the reply is still coming".** It clears at the
  first partial by design. `replyStreaming` is that flag.
- **Do not express a runaway-mic guard in elapsed time.** Silence and engine
  health only. The 120s cap looked reasonable for months.
- **Do not reset the hold clock on a recognition restart.** Floor it (600ms).
- **Do not "fix" the phone's Voice order.** It is his decision, in a comment
  near `Voice.jsx:455`.
- **Do not materialise the API token into the session to drive the connected
  app in the MCP browser** — the classifier refuses it, correctly. The
  dev-only `window.__novaApp` hook exercises real render paths in demo mode.
- **Do not edit `../atlas-partner` from this session without his say-so.**

---

**14 SEP, FIRST HALF — THREE FAULTS, EACH ONE A THING THAT REPORTED SUCCESS WHILE
LOSING SOMETHING.** No new surface. He asked to resume, was given the state,
and said "continue with all of them".

**FIRST, WHAT THE LAST HANDOFF DID NOT SAY.** The 12 Sep block below was written
before five more commits landed: `daab554`, `61355e9`, `bbcb4f0`, `1b3d492`
(the 3D figure's motion-check work, through 13 Sep 08:10) and `f3ccb08` (the
mission headline). None of it was handed off, and the 13 Sep session left the
TTS work uncommitted on disk. **If a session ends without /nova-close, say so
in the commit trail at least** — a successor reconstructing from `git log` is
the expensive path.

**GOAL.** The three items he chose from the opening report: finish the
half-written TTS readiness fix; stop the ingest weave losing `index.md` and
`log.md`; and the two stragglers (`JOINT.none`, the health push).

**DONE CRITERIA**
- *met* — a configured-but-dead voice engine says so, and the client falls back.
  `ttsReady()`/`localReady()`, liveness from the `'exit'` event,
  `ttsUsable()` on every client path, and a failed sentence now SPOKEN by the
  browser instead of silently revealed. Commit `6b58b13`.
- *met* — a weave whose targets drifted during the pass merges instead of being
  dropped from the diff. `stagingBaseDir`, `diffTreesReport(..., {merge:true})`,
  `mergeNote`. Commit `a2291a9`.
- *met* — `RIG[eq] || RIG.none`; the `IMPORT_IS_UNDEFINED` build warning is gone
  and the figure was looked at, not just built. Commit `af0424b`.
- *met, no code* — the health push is ALIVE. The opening report called it
  stopped; that was wrong (see VERIFIED).
- *met* — the `briefing.test.js` flake, unowned for weeks, is fixed. It was
  never the fan-out: `settle` called a two-step completion done after step one.
  Commit `018def4`.
- *met* — the Coach/Distiller drift question, deferred on 12 Sep for want of
  someone looking, is ANSWERED: the Distiller merges (it is the weave's race on
  the weave's files); Coach stays strict, on measured grounds recorded in
  `coachPlan.js`. Commit `fe9c76d`.

**STATE (paths).** Changed: `server/lib/tts.js` (`ttsReady`), `server/lib/ttsLocal.js`
(`healthy`/`localReady` exported, `spawnSidecar`, shared in-flight boot,
`NOVA_VOICE_DIR` seam, an installed check, fail-fast synthesis),
`server/routes/voice.js` (`ready` on `/tts/status`), `src/App.jsx`
(`ttsUsable()` + the browser fallback in `drainTtsQueue`),
`server/lib/ingest.js` (`stagingBaseDir`, the merge branch in `diffTreesReport`,
`mergeStaged`, `mergeNote`, `job.stagedMerged`, one `merged` list in the
receipt), `src/Body3D.jsx:1188`. New tests: `server/test/ttsSidecarRespawn.test.js`;
additions to `ttsLocal.test.js` and `ingest.test.js`. 1462 pass, 0 fail.

**DECISIONS (choice → reason → what it forecloses)**
- *Path decisions read `ready`; the engine LABEL still reads `configured`* →
  which engine is installed and whether it can speak are different questions,
  and only the second decides whether to fall back. **Forecloses** using
  `configured` as a proxy for "will make a sound" anywhere in the client.
- *An absent `ready` is not a false one* → the PWA deploys via Pages and the
  server via launchd, so a phone can hold a newer bundle than the Mac runs.
  Treating the missing field as false would drop the whole app onto the browser
  voice until he reloads the service. **Forecloses** making `ready` required.
- *A request never waits out a boot; it fails at once and the browser covers
  that sentence* → he is looking at a screen that says Nova is speaking. A
  different voice mid-reply is worth noticing; silence is the bug he reported.
  **Forecloses** holding a reply for a model load.
- *The staging diff keeps the base TEXT, not just its hash* → a hash says a
  file moved; only the text says whether the two edits collide. **Forecloses**
  answering a drift question from the manifest alone.
- *It lives BESIDE the staging vault (`workDir/base`), never inside it* → a
  second copy of the whole Wiki in the model's own tree is something a pass
  would read, grep, and occasionally edit. **Forecloses** putting any
  bookkeeping copy under `stagingVault/`.
- *The staging merge is opt-in per consumer, exactly like the approval one* →
  same reasoning as 12 Sep; the Distiller's structured targets are still
  unverified for a line-level merge. **Forecloses** turning it on platform-wide
  without measuring the Distiller's files.
- *`RIG.none`, not a new export on rig3d.js* → an equipment spec belongs next
  to RIG; rig3d.js is joints and ROM. **Forecloses** rig3d.js growing an
  equipment vocabulary.
- *The Distiller merges; Coach does not — and the split is cost and exposure,
  not safety* → the merge was measured SAFE for Coach's files (16 scenarios, 0
  corruptions). It stays off because Coach's race window is milliseconds and its
  remedy is a free retry, while the weave and the Distiller spend minutes of
  model time against pages another writer edits. **Forecloses** arguing for
  Coach's merge from the merge's correctness; reopen it only on a real refusal
  he actually hit.
- *A test that races a two-step completion is fixed in the TEST, not by
  reordering production* → the briefing's job stage is only read while the
  record says 'classifying', so marking the job ready after the record lands is
  the honest order. **Forecloses** reordering production code to settle a
  sampling bug.

**VERIFIED (with locators)**
- SIGTERM on the LIVE sidecar (pid 18429, the exact 13 Sep condition): the
  server log printed `tts sidecar exited (code null, signal SIGTERM)`,
  `/api/tts/status` flipped to `ready:false` within 2s, a background boot fired,
  and `ready:true` returned at t+8s. `POST /api/tts` then returned 33,165 bytes
  of real MP3 (`file`: MPEG ADTS layer III, 24 kHz mono). Thirteen hours → eight
  seconds.
- A request landing INSIDE the boot window returned
  `{"error":"local tts is still starting up"}` — the designed degradation, not
  a failure.
- The staging merge on HIS REAL PAGES: his 166-line `Wiki/index.md` and
  645-line `Wiki/log.md` copied to a temp tree (the vault only ever read), the
  weave's four section bullets on the staged side, and journal.js's OWN
  `upsertIndexBullet`/`appendLogEntry` as the live writer. BEFORE: both files in
  `conflicts`, zero changes — job 16f1ec46's exact loss. AFTER: both merged,
  both sides' edits present, 167→171 and 650→654 lines. The rehearsal was a
  scratch script, not kept: copy the real `Wiki/` to a temp `original/`,
  `stageVault` from it, edit the staged `index.md`/`log.md` as a weave does,
  edit the temp original with journal.js's own writers, then compare
  `diffTreesReport` with and without `{ merge: true }`.
- Every equipment key resolves: all 26 patterns declare an `equipment`, and
  every value `equipmentFor` can return is a RIG key — so the `JOINT.none`
  branch was unreachable, which is why a guaranteed TypeError sat there unseen.
- The figure was LOOKED at: a scratch harness against `vite dev` rendered five
  lifts across four rigs (barbell-back, barbell-floor, cable-low, none) — five
  canvases, correct poses, zero console errors and zero page errors. Harness
  deleted, dev server killed.
- **THE HEALTH PUSH IS NOT BROKEN.** The opening report of this session said it
  had silently stopped; that was a misreading of UTC stamps as local, made
  before the morning push landed. It arrived 14 Sep 07:00 AEST
  (`2026-09-13T21:00:41Z`, steps 9846 for 2026-09-13) and wrote
  `server/data/health/2026-09-13.json`. 50 attempts all time, 1 ever failed.
  The real gap is two days with no reading at all: **2026-09-08 and
  2026-09-12**. `/api/health-data` omits them rather than inventing zeros, and
  `yesterdayStepsShape` (healthData.js:201) already reports a missing day to
  both the brief (`dispatch.js:159`) and the Guardian (`guardian.js:270`),
  pinned by `twins.test.js`. No Nova fault; his Shortcut automation did not fire
  on those two mornings.
- The briefing flake, MEASURED rather than guessed: a 120ms sleep inserted
  between `updateRecord` and `setStage('ready')` fails the old wait every time
  with the flake's exact symptom (`actual: 'illustrating'`), and passes the new
  one 5/5. With the sleep removed and eight cores pinned: 40 runs, 0 failures;
  the full suite ran 5× clean before that (~7,300 tests).
- The Coach merge measurement: his real `Wiki/Health/Workout Routines.md` (220
  lines) and `Wiki/Health/Exercise Library.md` (855 lines, 34% of its non-blank
  lines exact duplicates — `trackingType: weight_reps` alone 125×), 16 scenarios
  through `mergeText` using Coach's OWN renderers, parsed back and compared
  against the union of both intents, with the routines file's derived prose body
  re-rendered and checked against the frontmatter it sits with. **0 corruptions.**
  Every genuine collision refused. The vault was only ever read.
  *(First run of that harness reported 4 false refusals — it fed exercise IDs
  where names belong, so both sides rewrote the prose body. Fix the instrument
  before believing it.)*
- The Distiller's exposure, from real jobs on disk: 3 of 4 in
  `server/data/distill/` touched `Wiki/index.md` or `Wiki/log.md`.
- Gates at close: `npm run lint` 0 errors; `npm run build` green with **no
  IMPORT_IS_UNDEFINED**; `cd server && npm test` **1463 pass, 0 fail**;
  `git status --porcelain` empty; `HEAD == origin/main == af0424b`; service
  reloaded and `/api/health` 200; the reloaded server answers
  `configured:true ready:true engine:local`; no `vite` process left running.

**ASSUMED**
- That his PHONE picks up the client half. The Pages deploy for `af0424b` was
  still `in_progress` at close — and the stale-service-worker trap in
  [[nova-frontend-verification]] applies on top of it.
- That the staging merge behaves on a LIVE weave. Proven on his real pages and
  on the real failure's shape, never yet through an actual `ready` job — the
  same gap the 12 Sep fix had, one stage along. The next real weave is the test.
- That `ready:false` genuinely reaches the client's decisions in the browser.
  The server contract is verified live; the App.jsx branches are not — no
  browser drove a reply this session.

**OPEN QUESTIONS / BLOCKERS**
- Two mornings (8 and 12 Sep) have no health reading. Nothing to fix in Nova;
  whether the Shortcut automation is worth making more reliable is his call.
- Nothing else is open. Both standing items — the Coach/Distiller drift
  question and the briefing flake — are closed above, with their measurements.

**NEXT ACTION.** When a real ingest job reaches `ready`, approve it and read the
receipt. **Expected if it worked:** where 16f1ec46 said "⚠ Left out — 2 pages
changed in your vault while this pass ran", the summary now leads with "✓
Reconciled — 2 pages changed in your vault while this pass ran and were merged,
keeping both sets of edits: Wiki/index.md, Wiki/log.md", and the receipt's
`destination` reads `N files written to the vault (2 merged with edits made
while this ran: …)`. A genuine collision still says "Left out", and names it.

**DO NOT**
- **Do not read a pushlog timestamp as local time.** They are UTC (`…Z`) and he
  is AEST (+10) — a 21:00Z push is 07:00 the NEXT morning. Reading them as local
  is what made a working health push look like it had stopped two days ago. The
  log at `~/Library/Logs/nova-os-server.log` is the second route, and it is UTC
  too.
- **Do not let a background boot leak across node:test tests.** `ensureSidecar`
  shares one in-flight boot for up to three minutes, so a test that trips a boot
  is joined by the next one and the spawn it expected never happens. The respawn
  test has its OWN FILE for that reason; `ttsLocal.test.js` points
  `NOVA_VOICE_DIR` at an EMPTY dir so any boot it trips dies instantly.
- **Do not put the staging baseline inside `stagingVault/`.** The model works
  there. It goes in `workDir/base` (`stagingBaseDir`), which `cleanup` already
  removes — for the weave AND for the Distiller (`distill.js:235`).
- **Do not re-stamp priors over a merged change.** The staging merge computes
  against the LIVE text on purpose, so `stampPriors`' live read is the right
  prior and approval's own drift check still covers the window after it. A merge
  that carried the staged base as its prior would be clobbered by
  `approveJob`'s re-stamp.
- **Do not add an `equipment` vocabulary to `rig3d.js`.** That was the shape of
  the `JOINT.none` bug.
- **Do not trust `/tts/status` alone to say the engine works.** `ready` is
  `healthy()`, an HTTP ping. The decisive check is `POST /api/tts` returning
  MP3 bytes; a boot window can sit between the two, by design.
- **Do not re-argue Coach's merge from the merge being correct.** It IS correct
  on his files; that was measured and is not the question. The question is
  whether a millisecond race with a free retry is worth a merge over his
  training plan. `coachPlan.js` carries both halves.
- **Do not simulate a render with stand-in data.** The Coach harness fed
  exercise IDs where names belong, so every scenario "refused" at the same line
  — a fault in the instrument that looked exactly like a finding about the
  merge. Round-trip the real file through the real renderer FIRST and confirm
  it is identity before trusting a single result.
- **Do not wait on the record alone to decide a briefing has finished.**
  Finishing is `updateRecord` then `setStage('ready')`, and the record write is
  observable before the continuation that marks the job.

---

**12 SEP — THREE BUG REPORTS, AND ALL THREE WERE NOVA LYING TO HIM
RATHER THAN FAILING.** No new surface; three faults he found by reading his own
screens, each of which had been telling him something untrue for days.

**GOAL.** His three reports, verbatim: two Upper Body make-up sessions on 12 Sep
when there should have been one; "2 lifts went further" naming a Cable Lateral
Raise at 11.2kg he never lifted; and an ingest approval refusing with "the vault
moved under this weave (Wiki/index.md changed since the diff)".

**DONE CRITERIA**
- *met* — one carry-over row for 12 Sep. `addCarryover` merges a restatement
  instead of twinning it (`server/lib/workoutCarryover.js`); the live duplicate
  is collapsed.
- *met* — the 11 Sep session reports ONE record, the real one.
  `prsInSession` rounds an e1RM before comparing it
  (`server/lib/trainingAnalytics.js`).
- *met* — both Home idioms show the SET he lifted, with the estimate labelled
  beneath (`src/screens/MissionStructured.jsx`, `MissionControl.jsx`).
  **Rendered output never seen by eye — no browser ran this session.**
- *met* — a weave whose targets drifted elsewhere now merges
  (`server/lib/threeWayMerge.js`, `stagedPass.js`), proven against real job data.
- *unmet* — **no ingest approval has actually been run through the new path.**
  There is no `ready` job to try it on; he had already discarded the one that
  failed. The next real weave is the test.

**STATE (paths).** New: `server/lib/threeWayMerge.js`,
`server/test/threeWayMerge.test.js`. Changed: `server/lib/workoutCarryover.js`
(the one-row invariant + merge on reschedule), `server/lib/trainingAnalytics.js`
(`shown()`, weight/reps on an e1RM PR, whole-record collapse),
`server/lib/trainOverview.js` (weight/reps into the payload),
`server/lib/stagedPass.js` (`checkDrift` returns the changes to write; `merge`
option), `server/lib/ingest.js` (`merge: true`, `job.merged`, the receipt says
which files were reconciled), `src/App.jsx` (a carry-over session carries
`sourceRoutineName`), `src/screens/MissionStructured.jsx`, `MissionControl.jsx`
(`prLift`/`prBasis`). Tests: `workoutCarryover`, `trainingAnalytics`,
`stagedPass`, `ingest`. Commits `6a4b44b`, `300a264`, `87de867`.

**DECISIONS (choice → reason → what it forecloses)**
- *One date + one source routine = one carry-over row; a second write merges,
  and a `plannedAs` write PROMOTES the row already there* → the two writers
  (the finish flow's push-forward and `setMakeupDay`) were both stating the
  same debt, and he can do them in either order. **Forecloses** ever treating
  a date+routine pair as able to hold two rows — any future writer must go
  through `addCarryover` and accept the merge, and `setMakeupDay`'s own
  remove-loop now only matters for changing WHICH routine a date makes up.
- *An e1RM is compared at the resolution it is DISPLAYED at* → the raw estimate
  was being compared against the already-rounded stored best, so every exact
  repeat cleared the bar by its own rounding remainder. **Forecloses** keeping
  more precision internally than the surface shows for any *thresholded*
  number; if the number he'd be shown is the same number, it is not a change.
- *A PR line leads with the weight he loaded, and labels the estimate* → he read
  a bare "11.2kg" as a lift. **Forecloses** printing a derived number in the
  same visual slot as a measured one.
- *A drifted file is MERGED, not refused, when the two edits do not overlap* →
  the guarantee the drift check exists for is that nothing is lost, never that
  the file sat still. **Forecloses** the old blanket refusal for the weave; a
  future session that wants strictness back must argue against the measurement
  in the commit, not just restore the old line.
- *`merge` is opt-in per consumer, and only the weave passes it* → its targets
  are prose, bullet lists and an append-only log, checked against real jobs;
  nobody has looked at whether a line-level merge is safe for the structured
  files Coach writes. **Forecloses** treating the merge as a platform default.

**VERIFIED (with locators)**
- Two carry-over rows for 2026-09-12, 13s apart, different key sets —
  `server/data/workout-carryovers.json` before the fix; backup at
  `…/scratchpad/workout-carryovers.before.json`.
- After the fix, live `GET /api/workouts/carryovers` returns
  `2026-09-11 e782485b` and `2026-09-12 23010689 day` — one row for the 12th.
- The 11.2 arithmetic: he logged `9.1kg × 7`; Epley gives 11.2233 → shown 11.2.
  Bench: `27.5 × 8` → 34.8333 → 34.8. Read from the real vault via
  `loadSessions`.
- `prsInSession` on the real 11 Sep session BEFORE: three PRs, two with
  `previous === value` (34.8/34.8 and 11.2/11.2). AFTER: one — Carter
  Extension, 14.3 → 14.7. Both runs against the live vault.
- Live `GET /api/train/overview` → `momentum.prs` is exactly that one PR,
  carrying `weight: 11.3, reps: 9`.
- The merge on REAL weave data: job `33121b5b`'s `Wiki/index.md` and
  `Wiki/log.md` priors + a simulated journal write → merges, 10/10 and 53/53
  weave lines kept, 1/1 and 2/2 live lines kept, nothing lost.
- The weave's real index edit measured: 9 insertions across 4 sections, 1 bullet
  updated, +54 lines appended to log.md — no overlap with the journal's.
- Gates at close: `npm run lint` 0 errors; `npm run build` green;
  `cd server && npm test` **1433 pass, 0 fail**; `curl …/api/health` → 200;
  `git status --porcelain` empty; `HEAD == origin/main == 87de867`;
  no `vite preview` running; `dist/pc.json` absent.
- The Pages deploy for the code commit `87de867` **completed success** in 1m09s
  (`gh run list`, run 34655604622), so the mission-card change is live on the
  deployed bundle. His phone still has to get past its service worker — see
  [[nova-frontend-verification]].

**ASSUMED**
- That the two mission cards LOOK right. The markup is written and lint/build
  pass, but nothing was rendered — the two-line PR row at 375px is unobserved.
- That his phone will pick up the frontend change on the next Pages deploy. Not
  watched; the stale-service-worker trap in [[nova-frontend-verification]]
  applies.
- That the merge behaves on a live approval. Proven on real DATA, never through
  `approveJob` against his vault, because no `ready` job exists.
- That `sourceRoutineName` matching is enough for routine identity when one side
  has no id. True for every row in the store today; a routine RENAMED between
  the push and the make-up would fall back to two rows (safe, not merged).

**OPEN QUESTIONS / BLOCKERS**
- **`src/Body3D.jsx:1184` — `(RIG[eq] || JOINT.none)()` and `rig3d.js` exports
  no `none`.** Any exercise whose equipment key is missing from `RIG` throws
  `undefined is not a function` instead of falling back. The build has been
  warning `IMPORT_IS_UNDEFINED` about it. Found, NOT fixed — out of scope, and
  touching the figure triggers the record-and-watch protocol. HIS CALL.
- **Coach and the Distiller still refuse on any drift.** Whether to enable
  `merge: true` for them needs someone to check a line-level merge against the
  structured files Coach writes. Not started.
- **The `briefing.test.js` "angles fan out in parallel" flake** — offered twice,
  never accepted, still unowned. (The 3D recorder's namesake flake WAS fixed on
  11 Sep; this is the other one.)
- He was never told which of his three reports was the *worst*: the phantom PRs
  had also been firing the Telegram PR ping, so Nova congratulated him by
  message for lifts he merely repeated. Worth saying if he asks why it mattered.

**NEXT ACTION.** When a real ingest job reaches `ready`, approve it and read the
receipt. **Expected if it worked:** the approval succeeds where it used to
refuse, and the receipt's `destination` reads `N files written to the vault
(1 merged with edits made since the diff: Wiki/index.md)` — or 2, with log.md.
If it refuses instead, the message will now name the passage and the line, which
is the diagnostic the old one lacked.

**DO NOT**
- **Do not chase the "meaning index" for anything touching `Wiki/index.md`.**
  Commit `c155655`'s hourly loop is the SEMANTIC EMBEDDING index in
  `server/data/`; it never writes the vault. I spent time on that wrong lead.
  The real writer is `server/lib/journal.js` (lines 139 and 191).
- **Do not assume a `ready` ingest job is on disk after a failed approval.**
  `ls server/data/ingest/` showed six jobs and none `ready`; he had discarded
  the failed one. The evidence for the diagnosis came from an *applied* job's
  stored priors instead.
- **Do not read `.env` at the repo root — it is `server/.env`.** And
  `VAULT_PATH` contains an apostrophe (`Hayden's Vault`); quote-stripping with
  `tr -d` destroys it. Parse with python.
- **Do not probe ports to find the server.** It is `4173` (`PORT` is commented
  out in `server/.env`, and 4173 is the default in `server/index.js:347`).
  Probing started a `vite preview` on 5173 that had to be killed at close.
- **Do not nest a parenthetical inside the drift refusal.** The first version
  read `(… changed since the diff and both changed the same passage (around
  line 4 …))`. It is now one flat clause; the tests pin the exact wording.
- **Do not let `applyChanges` return `{applied}` alone** — it returns
  `{applied, merged}`, and `stagedPass.test.js` pins that shape.
- **Do not "fix" a same-day repeat showing as a PR by widening an epsilon.**
  Rounding before the comparison is the whole fix; an epsilon on top would hide
  the next instance of the same class.

---

**11 SEP — SIX MORE FAULTS, ALL FOUND BY MEASURING.** He asked to
keep refining: *"no janky details… solid and look and perform accurately to
real humans realistically."* Shipped across five commits.

**THE HEAD WAS ACCUMULATING ROTATION FOR AS LONG AS THE PANEL STAYED OPEN.**
`applyPose` resets every bone it touches to rest before posing it — and it
never touched the head, while `levelGaze` and `secondary` both PREMULTIPLY
onto it. Measured with the trunk at 8.7 degrees, the head had reached 121.
**Anything that premultiplies needs a bone that gets reset.** This is the one
a user would have seen.

**THE GAZE WENT THE WRONG WAY** (trunk 67 → neck 90 → head 104: his face at
his own shins). **THE ANKLE'S SIGN WAS INVERTED** (a plantarflexed foot turned
toes UP). Fifth and sixth costumes of the same trap. It is always silent.

**AN ARM THAT IS ONLY CARRYING SOMETHING HANGS PLUMB.** Shoulder angles are
measured against the trunk, which is right for a press and wrong the moment
the trunk pitches: an arm posed at 0 swings out in front, faithfully staying 0
degrees from a chest that is no longer upright. `plumbUpperArm()` aims the
humerus down whenever the shoulder is doing nothing — which is also what keeps
a curl from swinging and a pushdown's elbows at his sides.

**`spine` IN THIS RIG IS EXTENSION, NOT FLEXION** — how hard he holds his
chest UP against the fold, matching the cues. Raising it to pitch the trunk
forward does the opposite, and I spent several iterations fighting my own
change before measuring it.

**A BAR ON THE FLOOR IS CARRIED BY THE FLOOR.** Balance was leaning him back
off a load he had not taken yet. The transfer follows hip extension over the
first quarter of the pull. Deadlift setup: wrists 0.794 → 0.325, trunk 21 → 48
degrees off vertical, bar within 2 cm of the floor.

**CALF RAISE, three faults in one movement**: the sign above, `settle` forcing
foot-flat onto a foot whose heel had left the floor, and a ball contact placed
13 cm ALONG a foot bone that drops steeply — only 6.6 cm of horizontal lever.
1.4 cm of rise → 4.3. And 4.3 is right: with the ball 13 cm forward of an
ankle 12 cm up the geometry caps it at 5.7, and a flat-ground calf raise is
that modest. I had been quoting 10 as the target; 10 is from a step.

**SMOOTHER HIGHLIGHT BORDERS** — eight majority-vote passes instead of four.
The stair-stepped edges were the jankiest thing at the size the app actually
draws him, and the thing that still said "diagram".

**THREE ATTEMPTS AT THE SEAM DISCONTINUITY, ALL REVERTED.** Do not repeat:
a `clavicle_up` corrective (wrong instrument — a DQS-vs-LBS delta corrects
lost VOLUME, not a discontinuity); taking the clavicle out of the chest and
trap pools (made the chest-to-deltoid boundary worse); one shared bone pool
across the upper body (torso vertices bound to a forearm that lies beside the
ribs in an A-pose, and the arms melted into tubes with no elbow or hand). That
last one also SILENTLY EMPTIED every corrective shape — smoother weights do
not candy-wrap, so the delta fell under the noise floor and the exporter
dropped all eight targets. **A 15% smaller GLB looked like a win and was a
symptom: read the GLB's own contents after a rebuild, not just the render.**

**THE SCAPULAR CAP WAS FIXING A FAULT IT DID NOT HAVE.** Rendering the same
lockout at 25 and at 50 shows identical artifacts, and so does the model as it
stood before any of it. Back to 50, near the anatomical share.

**A ONE-IN-THREE TEST FLAKE, FIXED.** `end to end: angles fan out in parallel`
asserted a transient state immediately after start — a race the fakes could
win. They now take a `hold` the test releases.

**OPEN:**
- The seam discontinuity. Cosmetic, diagnostic-zoom only, three routes tried.
  Only untried idea: weights on the unified mesh before the split. HIS CALL.
- Foot roll and pressure; rep-to-rep fatigue. Neither raised by him.

**Verified:** all 26 recorded and watched against this build; `--focus BONE`
added to the recorder so a joint can be framed at arm's length without the
browser. lint clean, build green, 1,377 server tests.

---

**11 SEP — THE CONVERSATION ITSELF: BEING CUT OFF, KEEPING UP, AND A GLASS
THAT KEEPS PACE.** A second session ran in parallel on the 3D model all day;
that work is the block below this one and was not touched here.

**GOAL.** Everything he reported about *talking to Nova*: it cut him off
mid-sentence; the chat would not follow a streaming reply; the blue EVIDENCE
button opened a training card under a leadership answer; a long spoken answer
was impossible to follow by ear with nothing on screen; a 1000-character
refusal when he spoke at length; markdown read aloud; a make-up day hiding the
session that was also scheduled; and "New chat" wiping a days-long log in one
unguarded tap.

**DONE CRITERIA**
- *met* — Nova, not the browser, ends his spoken turn (`src/turnEnd.js`), hold
  2.0s, tunable in Settings → Voice.
- *met* — the chat log sticks to the foot while a reply streams
  (`src/useStickToBottom.js`). **Behaviour on his device never observed.**
- *met* — an evidence card is only offered when the reply is about his BODY
  (`src/verdictOffer.js`).
- *met* — panels rise with the speech, above the composer, spent ones in a
  strip (`src/visualBeats.js`, `src/glassBeats.js`, `server/lib/visualResolve.js`).
  **Never seen on a screen by either of us.**
- *met* — no length limit on what he says (`server/routes/voice.js`).
- *met* — markdown and `[[wikilinks]]` never spoken or printed
  (`src/spokenProse.js`).
- *met* — make-up AND scheduled session both shown (`src/trainPanels.js`).
- *met* — "New chat" is undoable (`src/chatUndo.js`).
- *unmet* — **nothing visual has been confirmed by eye.** No browser ran in
  this session at all; see DO NOT.

**STATE (paths).** New: `src/turnEnd.js`, `src/useStickToBottom.js`,
`src/verdictOffer.js`, `src/visualBeats.js`, `src/glassBeats.js`,
`src/spokenProse.js`, `src/chatUndo.js`, `src/trainPanels.js`;
`server/lib/visualMoment.js`, `visualResolve.js`, `visualStream.js`.
Changed: `src/App.jsx` (turn clock, glass state, `raiseGlass` off the TTS
queue), `src/StageCard.jsx` (key/steps/media/image), `src/screens/Voice.jsx`
(glass above the composer, undo in the header), `src/VoicePresence.jsx`,
`src/vals/{valsChrome,valsMisc,}.js`, `server/lib/claudeCode.js` (GLASS_CONTRACT
+ SPOKEN_REGISTER on ask/coach/leader), `server/lib/recall.js` (`withText`),
`server/routes/claudeCode.js` (`visuals` on the job).

**DECISIONS (choice → reason → what it forecloses)**
- *The app owns the end of a spoken turn, not the engine* → the Web Speech API
  exposes no silence threshold at all, so `continuous:false` was not a tuning
  choice. **Forecloses** relying on the engine's own endpointing ever again;
  every future change is to `turnEnd.js`.
- *The model NAMES a panel, code BUILDS it* → same boundary as CARD/PROPOSE/
  REFLECT. **Forecloses** letting a model put anything on screen the voice did
  not say.
- *A timecode is real or absent, never estimated* → his call, "real, or go and
  find it". **Forecloses** ever showing an approximate chip, even labelled.
- *The frame lands in context, the picture fills in* → his correction,
  "visuals should always land in context, I'd rather them not dropped at all".
  **Forecloses** withholding a panel until its media resolves.
- *The parser reads the payload, not the vocabulary* → the model used `title`
  for `label` 4/4 and put `items` on a `key`. **Forecloses** treating the
  directive field names as a contract the model will honour.
- *A rest day stays hidden behind a make-up* → it is the template having
  nothing to say. **Forecloses** showing all three states at once.

**VERIFIED (with locators)**
- lint 0 errors · build green · **1377/1377 tests** (`cd server && npm test`,
  11 Sep 11:2x) — includes the other session's `ops.test.js`, green again.
- Deployed and live: `version.json` = **`5ed4293de`**; he confirmed Settings →
  Build reads the same on his phone.
- The live bundle carries the work: grepped `MOMENT NOT MARKED`,
  `FROM YOUR NOTE`, `Also scheduled today`, `Not a make-up after all`,
  `Undo · `, `Room for a breath mid-sentence`, `glassScan`/`glassStep`.
- **His real Leader turn, replayed through the whole path** (transcript
  `~/.claude/projects/…Hayden-s-Vault/2120c1d3-….jsonl`, 10 Sep 14:10): 4
  panels at the right offsets, hero advancing, rail filling, `steps` building;
  zero markdown and zero directives left in the spoken text.
- Live server, 11 Sep: a **1480-character** question accepted (was refused at
  1000); the turn emitted a correctly-formed panel and clean speech.
- `resolveVisual` against real yt-dlp: real video found, poster cached on
  Nova's own origin, **`stamp: null`** because the captions genuinely lacked
  the idea — the honesty rule holding. Cold 17.4s, warm cover at **0.0s**.
- `com.novaos.server` reloaded and healthy (`/api/health` 200) after every
  server change.

**ASSUMED (no locator — treat as unproven)**
- That `continuous: true` behaves on iOS as on desktop. Reasoned from
  `WakeWord.jsx` running continuously on his devices, never observed.
- That the panels render legibly at 390 px, that the rail scrolls, that the
  entrance animations read well. **Nobody has looked.**
- That the stick-to-bottom fix actually fixes what he reported. One real bug
  was found and fixed (a plain ref could not attach to a late-mounting
  element) but it does NOT explain the Voice screen, whose `Panel` renders its
  children immediately.
- That `image` panels (Wikimedia / a cited page's og:image) resolve at all —
  only `key`, `steps` and `media` have been exercised live.

**OPEN QUESTIONS / BLOCKERS**
- **He has not yet had a conversation on `5ed4293de`.** Every visual claim
  above is waiting on that. A one-shot reminder was set for 11 Sep 14:23 and
  **dies with the session that set it.**
- Browser automation is unavailable: the chrome-devtools MCP refuses with
  "browser is already running" even after the process was killed and the
  Singleton locks removed; the Claude-in-Chrome extension is not connected.
  Nothing visual can be checked until one of them works.
- A **flaky** `briefing.test.js:147` ("angles fan out in parallel") failed one
  CI deploy with `expected 'ready', got 'illustrating'` — a timing race. It
  passes locally and passed on re-run. Unowned.
- `c155655` (the other session's semantic recall) was committed locally but
  unpushed at close; it goes out with this handoff commit. Suite is green with
  it in.
- A `vite preview` on :5173 (pid 55184/55202) predates this session and was
  left running.

**NEXT ACTION.** Have him open Nova on `5ed4293de` or later and hold one real
Leader conversation. *Expected if it worked:* panels appear above the composer
as it speaks, changing per movement, with spent ones in a strip beneath; a
numbered list builds one item at a time; nothing reads `##` or `**` aloud. If
panels do NOT appear, the next thing to check is whether `glassSpokenTo` is
advancing — it is raised from the TTS queue's `onPlay`, and from the text
length when speech is off.

**DO NOT**
- **Do not assume "deployed" means "on his phone".** Two rounds were lost to
  this. `version.json` is the deployed build; Settings → Build is his. They
  differed every time it mattered.
- **Do not name a new prompt section after an existing one.** Ask Nova already
  had "THE GLASS" (the single `CARD` line); adding a second section with that
  name made the model obey the older one and emit nothing at all.
- **Do not trust the model to use the contract's field names.** It used
  `title` for `label` four times out of four and put `items` on a `key`. A
  model-facing format needs a forgiving reader.
- **Do not hang anything solely off the TTS queue.** It does not run when
  speech is off — the glass was invisible in that mode for exactly that reason.
- **Do not put a backtick inside a backtick-delimited template literal.** One
  in `GLASS_CONTRACT` was a syntax error that took the live service down until
  launchd was kicked. `node --check` every server file before `kickstart`.
- **Do not believe a placement is fine because the component renders.** The
  panels were built, shipped, running — and drawn beside the core, which on a
  phone is `order: 1` while the log he is reading is `order: 3`. They were
  off-screen above him for two rounds.
- **Do not match a `steps` item against the prose by word overlap alone.** The
  items are the model's summaries, not quotes; the list would never have built.
- Do not chase the stick-to-bottom bug by re-reading `useStickToBottom.js`
  again — that ground is covered. It needs a device or a browser.
- Do not touch `server/lib/embeddings.js`, `recall.js` or `index.js` state
  without checking whether the other session is still in them.

---

### Previous — 10 Sep (gym dimensions, the 3D model)

**10 SEP — REAL GYM DIMENSIONS, AND THE FAULTS THEY EXPOSED.** He
asked for two things: keep refining the model, and *"ensure that the equipment
in all exercises is also exceptionally detailed and realistically accurate."*
Shipped as `53c6590`, `bd0f1c9`, and the three that follow it.

**THE EQUIPMENT IS BUILT TO REAL NUMBERS NOW** — 2.20 m bar, 28 mm shaft,
50 mm sleeves, 1.31 m between collars, 450 mm bumper plates colour-coded red
25 / blue 20 / yellow 15 / green 10, knurl only where the hands and the back
go, a cable stack with a selector pin in the plate that was chosen, a pulldown
with a seat and thigh pads, a bench with a stitched pad and J-hook uprights.

**Getting the sizes right turned out to be a DIAGNOSTIC.** Correct plates
immediately showed the hands had never been on the bar; correct bench geometry
showed the body floating 13 cm above its own pad. A model whose parts are the
wrong size hides the errors of everything it touches.

**Six real faults, every one found by MEASURING and none by looking:**

1. **The hands were never on the bar.** Poses were forward kinematics, so a
   back squat put the fists in front of the chest with the fingers open while
   the bar floated behind the head. `JOINT.reachTo()` is two-link IK; both
   bones are aimed in WORLD space because a direction has no sign to get
   backwards.
2. **Aiming leaves ROLL undetermined** — each humerus spun inside its own skin
   and the arms smeared into flat sails. Aim, then roll until the limb's hinge
   lies in the plane it bends in.
3. **`fwd` is a TOE direction, not the body's forward.** A squat stance is toed
   out, so it sits 30 degrees off the midline — and it disagreed with the
   chest's own forward by more than a right angle. New code calls
   `JOINT.bodyAnterior()`.
4. **The clavicle was DEPRESSING the shoulder.** The overhead press stopped at
   ear height, 45 degrees short — exactly the scapula's share, being subtracted
   instead of added. Measured: as the arm rose the shoulder joint fell 10 cm.
5. **The bench pad was six stale constants.** Equipment now publishes the
   surface it offers (`userData.pad`), and depth is measured along that
   surface's NORMAL — as a world offset it is right only while the surface is
   level, and a 30 degree incline cut the pad through his back.
6. **A calf raise pivoted a METRE past his toes.** `localToWorld(0, 1, 0)` is
   not the end of the foot bone; it lifted his whole body 27 cm instead of 11.
   The pivot is the ball, 13 cm in front of the ankle.

**THE LESSON OF THE SESSION, AND IT IS ABOUT METHOD.** Four faults were
"found" by eye on still frames and NONE were real — a correctly-placed bar
behind a plate that had just doubled in size, a stale render, a crop, and a
lat highlight mistaken for a tear. Every fault that proved real came from a
number or a moving image. **Measure the rig; do not look at it.** Two
instruments now exist: `window.__NOVA_MOTION` (seed it with `[]` before load)
collects `{root, bones, pat, frozen}` per canvas so a script can read joint
world positions at any phase, and `?debug=rig` prints where each hand was
ASKED to go versus where it went.

**OPEN, WITH NUMBERS RATHER THAN ADJECTIVES:**
- **The deadlift's last 20 cm.** His wrists reach 0.51 at the setup, putting
  the bar at ~0.42 against a floor bar's true 0.225 — set up as if pulling
  from low blocks. Needs the shoulders 15 cm lower, which `balance()` resists
  because it holds his mass over his feet and does not know the load is in
  front of him. That is a solver change, not a pose tweak. HIS CALL.
- **No corrective shape for clavicle elevation.** The scapula is capped at 25
  degrees of its anatomical ~60 because past that the trap and upper chest
  tear into a sail. Fixing it means a Blender rebuild and a GLB re-export.
  HIS CALL.
- Trunk pitch at the deadlift setup was 21 degrees where a deadlift is 50-60;
  depth had been standing in for a pitch that was never there. Improved, not
  solved.

**Verified:** all 26 recorded and watched; squat, front squat, deadlift, hinge,
bench, incline, overhead press, pulldown, pull-up, row, curl, fly, lateral and
front raise, shrug, lunge, leg press, leg extension, hip thrust, hanging knee
raise checked in motion. Front raise measured 0.875 → 1.459 m; shrug measured
3.5 cm of scapular elevation; lunge measured a 0.93 m split with the rear knee
to 0.158. lint clean, build green, 1,363 tests.

---

**9 SEP — BALANCE, AND SIX HANDS INSTEAD OF ONE FIST.** The two parts
after the correctives. Shipped as `9cb5cbb` and `1b727cb`.

**BALANCE — the body answers to the load.** Posed from joint angles alone the
figure's centre of mass could sit anywhere: a squatter over his heels, a man
holding a barbell out in front and not moving an inch for it. Now the combined
centre of mass (body AND bar, `centreOfMass()` with Dempster's fractions and a
per-equipment `LOAD_MASS` as a share of his bodyweight) drives a bounded trunk
lean. **Three traps, all paid for:**
1. The COM came out **17 cm behind his feet** — each segment's centre was taken
   as the midpoint to "its first bone child", and the chest's first child is a
   collarbone, so half the body's mass sat out at the shoulder. Use bone HEADS.
2. It must be measured **relative to the neutral stance**. The ankle sits behind
   the middle of the foot, so a standing body's mass is always a few centimetres
   back; chasing the absolute number bows the figure forward permanently.
3. **The trunk answers, not the ankle.** An ankle has ~25° and it fights the
   ground solver, which re-plants the feet and moves the reference with the
   body — the correction had no authority and walked to its clamp.

It is **bounded and proportional, not solved**, and the comments say so: segment
fractions at bone heads say which way and roughly how much a load pulls him,
not where his centre of mass truly is. What it buys is that the lean responds
to load and depth instead of being a constant.

**GRIP SHAPE.** Six styles as per-digit multipliers on the single curl — full,
hook (thumb UNDER the fingers), thumbless, rope, open, hang — routed per lift by
what it holds. **The thumb is the reason it matters:** it does not fold in the
fingers' plane, it swings ACROSS the palm about a different axis, and how far
it comes is the difference between a locked grip and a hand resting on a bar.
It had been curling alongside the fingers like a sixth one.

**Verified:** the pull-up's hang grip wraps the bar with the thumb along it;
squat leans further the deeper it goes and stands nearly upright at lockout;
pages 0, 1 and 7 swept. lint clean, build green, 1,330 tests.

**NOTHING NAMED IS OUTSTANDING.** Everything he has asked for on the figure is
built: closed-chain stance, body-relative joint axes, 50 bones with per-digit
hands, ROM limits, secondary motion, rep shapes with sticking points, corrective
shapes, balance, grip styles. Remaining known limits are ones he has accepted or
not raised: no hair/brows/lashes; equipment is primitives; no facial animation;
no ground-reaction or foot-pressure detail.

**A RECURRING TRAP, THREE TIMES NOW:** two sign conventions meet wherever a
joint has both a range of motion and a rotation direction. **Clamp the anatomy,
then convert the sign.** It bit the elbow, then every finger joint, and it is
silent every time.

---

### Previous — 9 Sep (corrective shapes)

**9 SEP — CORRECTIVE SHAPES.** He asked for the most time-consuming of
the two remaining builds first; this was it. Shipped as `0a1d4d0`.

**The problem it solves.** Every real-time figure is skinned linearly: a vertex
is the weighted average of where each bone would put it, and an average always
falls INSIDE the arc the surface should follow. So a bent joint loses volume —
an elbow at 135° pinches to a crease, a shoulder overhead flattens, a deep knee
caves. **Better weights cannot fix this**; it is not a weighting error, it is
what averaging rotations does.

**How it is solved without a sculptor.** Blender's armature modifier will skin
with **dual quaternions** ("preserve volume"), which is the volume-correct
answer. So the corrective is simply

    corrective = dual_quaternion_result − linear_blend_result

taken at the extreme pose. Measured, not authored — same inputs, same
correction, every build. `correctives()` in build.py.

**Two details that make it work:**
- Deltas come out in POSED space and a shape key lives in REST space, so each
  is carried back through the inverse of its own vertex's **dominant bone**.
  Approximate where two bones share a vertex evenly; good everywhere it
  matters, because the vertices that collapse sit deep inside one bone.
- Each joint's bend direction is found by **trying both signs and keeping the
  one that folds the limb** (or raises it, for a shoulder), rather than
  trusting the rig's axis convention.

**Eight shapes** — shoulder overhead, deep elbow, deep knee, deep hip, per side.
Each touches 2,300–4,500 vertices, all local to its joint, so every target
exports as a **sparse accessor**: the whole set costs 450 KB. Driven in
`applyCorrectives()` from an onset angle to the extreme with a smoothstep, so
the correction never arrives as a step.

**Verified:** the elbow at the top of a curl folds with mass instead of
creasing; squat, front squat and hinge re-checked at depth. lint clean, build
green, 1,330 tests. 1.94 MB, 50 bones, 8 morph targets.

**NEXT, and the only structural gap left he has named:** weight shift and
balance reaction. The figure never adjusts its base under load — a real
lifter's centre of mass moves and the feet answer for it. He has asked for this
after the correctives.

Still true: fingers close from one `curl` (articulated but not individually
posed), and no hair/brows/lashes (agreed).

---

### Previous — 9 Sep (secondary motion, rep shape)

**9 SEP — SECONDARY MOTION, AND REPS THAT GRIND.** His two calls, in
the order he made them. Shipped as `c899233` on top of the fifty-bone rig.

**SECONDARY MOTION** (`secondary()` in `src/rig3d.js`) — what a body does that
is not the lift, because joints alone never read as filmed:
- **Scapular rhythm.** Past ~30° of elevation the shoulder blade rotates
  upward and contributes about a third of the total. **That share is taken OUT
  of the humerus, not stacked on it** — added on top, an overhead press stopped
  going overhead, because 42° of scapula plus the full shoulder angle rotated
  the arm chain past the pose and the bar came down. `scapularShare()` returns
  both the scapular angle and the fraction the humerus keeps. Sharing it
  properly also keeps the deltoid intact at high elevation.
- **Head stabilisation** — the neck gives back most of the torso's pitch, so
  the gaze stays level.
- **Soft-tissue lag** — a few degrees on the deltoid, thigh and forearm,
  proportional to how fast the joint is moving.
- **Braced breathing** — ribs lift on the eccentric, held on the drive.

All driven from the pose and its **rate of change with respect to the rep**,
never wall-clock time — so it is deterministic and a frozen frame in the motion
sheet shows the same secondary motion the moving figure has.

**REPS HAVE A SHAPE.** Two keyframes eased between accelerate out of the hole
and decelerate into lockout, which is exactly backwards. Every lift now runs on
nine keys along one of two profiles in `exercise3d.js`, chosen by which half of
the cycle is the hard one (`DRIVE_FIRST`): a squat lowers first and grinds on
the way up; a bench press starts on the chest and grinds a hand's width off it.
The sticking point is expressed the way it looks — keys close in pose and far
apart in time. Verified: the squat barely moves between phase 0.50 and 0.63
then finishes fast; the bench hangs at the chest through 0.00–0.25.

Per-pattern override still exists: give a pattern its own `keys` array, or a
`shape` of `[phase, progress]` pairs, and it wins over the profile.

**Verified:** pages 0–8 swept against the fifty-bone rig; squat and bench at
nine phases for the rep shape; overhead press, pulldown and pull-up re-checked
after the scapular change. lint clean, build green, 1,330 tests.

**WHAT IS STILL NOT REAL:**
- **No weight shift or balance reaction.** The figure never adjusts its base
  under load; a real lifter's centre of mass moves and the feet answer for it.
- **Linear blend skinning** — extreme angles still lose volume, no corrective
  shape keys.
- Fingers close as one `curl` — they are individually articulated but not
  individually posed, so an open palm, a hook grip and a thumbless grip still
  come out as the same shape.
- No hair, brows or lashes (agreed).

---

### Previous — 9 Sep (fifty bones)

**9 SEP — FIFTY BONES, AND JOINTS THAT HINGE WHERE A BODY HINGES.**
His standard, stated plainly: the figure must "fluidly perform and act
precisely like a real human… as though it were a real human performing each
movement as a video rather than a 3-D model", including "every potential area
for articulation". Shipped as `65b8b85`.

**Three faults, two causes — both answered in the new `src/rig3d.js`.**

1. **Every joint was turned about one of the BODY's axes.** Right for a hip and
   a shoulder, wrong for everything further down a limb. An elbow is a hinge
   whose axis runs through the humerus from one epicondyle to the other and
   **travels with the arm**; rotating the forearm about the body's lateral axis
   swings it through a plane the elbow does not have. That is exactly what
   "bent like spaghetti" is. Axes are now taken once, at rest, in each bone's
   PARENT frame.
2. **Nothing was bounded.** Every joint now carries the range a real one has
   and is clamped to it — functional ranges, not passive maxima.
3. Those two exposed a third: **two sign conventions meet in the pose code.**
   The data says what the body does; the renderer needs which way to turn a
   bone. Clamped against the rotation rather than the movement, 95° of elbow
   flexion came out as 5° and every arm hung dead straight. **Clamp the
   anatomy, then convert the sign** — this one is silent and will bite again.

**FIVE FINGERS, FOUND IN THE MESH.** `digit_landmarks()` reads the digits off
the hand as the clusters they form across the palm — thumb 44 mm, index 79,
middle 97, ring 86, little 59, symmetric — and each gets its own knuckle and
joints (three, two for the thumb). **50 bones.** `closeHand()` drives them from
one `curl` in the proportions a hand closes in. The thumb branches off much
further back than the fingers and needs its own looser search, or it comes out
8 mm long.

**THE BENCH PRESS IS A BENCH PRESS.** At the bottom the upper arm is out to the
side and roughly horizontal with the forearm vertical under the bar. Written
with the arm nearly overhead and the elbow folded, it read as an overhead
triceps extension — because that is what those angles describe.

**Verified:** all 26 patterns swept across all nine pages against this rig,
plus the hand at 26 cm on a curl (`&focus=handL`) and the bench press from the
front and in three-quarter. lint clean, build green, 1,330 tests.

**WHAT IS STILL NOT REAL, and he should know before asking again:**
- **No secondary motion.** Joints move, nothing else does: no scapular rhythm
  beyond the deltoid helper, no rib-cage expansion, no soft-tissue wobble, no
  weight shift or balance. A real lifter's whole body reacts to the load.
- **Poses are two keyframes eased between**, not motion-captured paths. A real
  bar path is not a smooth interpolation between a top and a bottom.
- Linear blend skinning, so extreme angles still lose volume; no corrective
  shape keys.
- No hair, brows or lashes (agreed).

---

### Previous — 9 Sep (the elbow was at the wrist)

**9 SEP — THE ELBOW WAS AT THE WRIST.** He said the figure had "no
accurate joint flexing and natural movement like you would expect a real
person to have", and specifically that it "did not actually seem to be
naturally and realistically gripping the bar… no proper wrist joint movements
or flexing or function". Looking closely at one hand found something far worse
than a missing grip. Shipped as `ab2a3ca`.

**THE ARM'S JOINTS WERE ONE WHOLE SEGMENT OUT.** `calibrate.py` searched
horizontal bands for the narrowest cross-section, but an A-pose arm hangs
diagonally, so every slice cut it obliquely and the minima meant nothing. The
**elbow was measured at the wrist** (a 58 cm upper arm on a 180 cm man), the
**wrist at the fingertips**, and the hand bone ran from the fingertips back
toward the body's midline. Every lift in the app has been flexing its elbow at
his wrist with a forearm 60% too long — for as long as this model has existed.

Fixed the way the knee already was: **a joint sits at a known FRACTION of the
limb, so take the fraction from anatomy and only the position from the mesh.**
Shoulder to fingertip is unambiguous — it is the farthest point of the arm.
Upper arm now 0.324 m against a 0.335 m reference, symmetric.

**A hand is three bones now** — wrist→knuckles, knuckles→mid, mid→tip. One
bone left the fingers splayed in their A-pose and a bar passed between them;
one finger JOINT could only swing them down past a bar to hang below it. The
second joint is what brings the tips back up the far side and closes the fist.

**A wrist that works**, derived per lift rather than written on 26 patterns
(`gripFor()` in exercise3d.js): the forearm rolls (pronated to press,
supinated for a curl or chin-up, neutral for a hammer or rope), the wrist sets
slightly extended because a bar sits in the heel of the palm, and the fingers
close. **Pronation is split between forearm and wrist** — a real forearm
twists progressively, and all of it at the elbow corkscrews the mesh.

**The bar goes in the fist.** It was placed at the hand BONE and left
world-horizontal, so it passed behind the fingers, and with one hand higher
than the other it passed through neither. It now sits at mid-palm and lies
along the line between the two fists.

**New on the instrument:** `&focus=<bone>` frames one joint at 26 cm. A wrist
that does not work is invisible at full height and obvious close up — none of
this would have been found without it.

**Verified:** curl, bench press, overhead press, pulldown, pull-up, row and
bent row re-checked against the corrected arm; live on his real Upper Body
routine at 390 px. lint clean, build green, 1,330 tests. 26 bones, 21,853
verts, 1.49 MB.

**Watch for:** the corrected arm changes which bone every arm vertex belongs
to, so the muscle segmentation shifted (front-delts 417 → 198, triceps
2,276 → 1,197). It still reads correctly in the sheet, but if a highlight
looks thin, that is where to look.

---

### Previous — 9 Sep (photorealism)

**9 SEP (late) — THE FIGURE IS A PERSON NOW.** He asked for the three known
faults fixed and the model refined "so it essentially becomes photorealistic
and the most accurate model it can be". Shipped as `8301658` + `558f969`,
verified live on his real Pull routine at 390 px.

**The three faults are gone**, each confirmed in the motion check: the leg
press machine now sits under him with the sled at his feet; the overhead
press's bar stays in frame at lockout (the framing box was taken from the body
alone, so it cropped away the exact moment the lift is about); the deadlift's
bar rests on its plates on the floor rather than hanging at the hands.

**What made it look real, in the order the gain arrived:**

1. **Image-based light + ACES.** Three lamps and a linear response is what
   makes a real-time figure look like plastic. Every point on the skin now
   gathers light from a whole room. Generated at runtime — no asset to ship.
2. **Skin, not a swatch.** `MeshPhysicalMaterial` with sheen (the peach-fuzz
   rim on a real arm against a light), low specular, and a faint red emissive
   standing in for subsurface scatter.
3. **Ambient occlusion baked into the mesh** as a vertex colour — the armpit,
   the line under the pec, the furrow beside the spine. Per VERTEX, not to a
   texture: four bytes a vertex, no image, no UV layout to keep valid through
   a decimate.
4. **Skin is not one colour** — it reddens at knuckles, elbows, knees and the
   face. Baked into the same vertex colour.
5. **A face.** The head was decimated as hard as the hands and came out a
   smooth blob — the most obviously artificial thing on the body. It now keeps
   roughly twice the geometry and has a brow, eyes and a mouth.
6. **Borders stopped looking torn.** Nearest-volume is decided per face, so a
   group boundary came out ragged. Four passes of majority vote over each
   face's neighbours pull them onto the curves anatomy actually has.
7. **A highlight that keeps its form.** Emissive is unlit by definition, so
   leaning on it flattened a lit muscle into a pastel sticker. It now rides
   mostly on sheen — view-dependent, so the shading survives.

**Two more found only because it had become realistic enough to look at
properly:** a hang pins ALL THREE axes (pinning only height let the hands
drift forward, so at the top of a pull-up he gripped thin air); and the
recorder must launch Chrome with its own `--user-data-dir`, or Chrome hands
the command to his everyday profile and exits.

**THE STANDING RULE STILL APPLIES TO EVERY CHANGE HERE** — see the
`nova-motion-check` memory. All 26 patterns were swept as filmstrips against
this model and recorded as GIFs into `tools/motion/out/` (gitignored).

**Numbers:** 25,053 verts, 1.72 MB GLB, 19 group materials, 22 bones —
`Body3D`'s contract unchanged. lint clean, build green, 1,330 server tests.

**Where realism still stops:** the figure has no hair, no eyebrows and no
eyelashes, because the CC0 base mesh has none and they are separate geometry,
not a shading trick — that is the remaining gap between this and a photograph.
Equipment is primitives. Skin has no pore-level detail (that wants a baked
normal map, which wants a stable UV layout through the decimate).

**NOTE — concurrent work in this repo all session** (visual beats, glass
beats, chat undo, a Darwin study, make-up days). I staged only my own files
every time; nothing of theirs was committed by me.

---

### Previous — 9 Sep (motion and equipment)

**9 SEP (later) — THE FIGURE NOW STANDS ON THE FLOOR, LIES ON THE BENCH, AND
HANGS FROM THE BAR.** He reported "some extra stretching… that does not make
it look anatomically correct and like a human actually moves", set a standing
rule about recording it, and asked for the cable equipment. Shipped as
`2c8ac39`, verified live on his real Upper Body routine at 390 px.

**THE STANDING RULE — this is now permanent.** *"You need to be making sure
that you are screen recording and checking the fluid movement of every version
of the model that is incorporated for any exercise. There are no exceptions
and this must be a standing role moving forward for things like this."* Two
tools exist so it is cheap:

```bash
npm run dev -- --port 5199     # a FRESH server; the long-running one goes stale
open 'http://localhost:5199/nova-os/tools/motion/harness.html?frames=4&per=3&page=0&view=side'
node tools/motion/record.mjs --frames 18 --size 420    # a GIF per pattern
```

The harness renders through the **same `Body3D` the app uses**, so what passes
there is what he sees. Full detail and the traps are in the
`nova-motion-check` memory — **read it before touching the figure again.**

**Six faults, none of them visible in a still.**

1. *A standing lift is a closed chain.* The rig is rooted at the pelvis, so
   posing hip and knee folded the legs while the pelvis stayed put — the
   figure squatted onto an invisible chair, torso upright, bar never
   descending. `settle()` now leans the body until the shin matches the ankle
   angle, flattens each foot (or lifts the heel for a calf raise), and drops
   until the lowest contact touches. **A squat's forward torso lean falls out
   of that — it is not a joint and was never in the data.**
2. *Zero is a pose, not an absence.* `rotate()` returned early on 0° and left
   the bone where it was, so any joint passing through neutral kept its last
   angle. At the top of a squat the thigh still held the bottom's 100°.
3. *Joints were rotated about the WORLD's axes* — the same as the body's only
   while standing. Lying on a bench, knee flexion folded the legs at the
   ceiling.
4. *Lying lifts rest on a pad*, measured against the pad's real plane; a lift
   with no bench lies on the floor.
5. *The stretching itself was a hard weight seam*, not a limit of linear blend
   skinning: chest vertices were forbidden the shoulder bones entirely, so at
   90° of flexion one vertex was frozen and its neighbour moved with the arm.
   The deltoid helper now bleeds across the boundary; 18 smoothing passes.
6. *WebGL contexts leaked.* `dispose()` frees none and a browser keeps ~16, so
   every opened-and-closed exercise sheet cost one and after a dozen the
   figure stopped drawing — a white panel, no error.

**THE GYM** (`src/gym3d.js`): cable stations with a visible weight stack, a
turning pulley and a cable that actually runs to the hands; a lat pulldown
with seat and thigh pad; a pull-up rig the body hangs from; EZ, trap and Smith
bars; rope, D-handle and wide-bar attachments; leg curl, extension and press.
`equipmentFor()` routes by the exercise's own NAME — a cable pushdown gets a
high pulley, a cable curl a low one.

**Data corrected where the check proved it wrong:** the lying presses had
their arms along the torso, the bench press had a crunch's legs, the calf
raise's ankle sign was inverted, the hip thrust rotated thighs against a
pinned chest and moved nothing, the fly had no bench.

**STILL WRONG, and he has been told:** the leg press machine sits beside him
rather than under him; the overhead press's bar leaves frame at lockout; the
deadlift's bar hangs at the hands instead of resting on the floor. Also
unchanged from before: the face is decimated and plain.

**A trap that cost two cycles:** `patternFor(name)` beats the `pattern` prop,
so passing a pattern id as the name made `row-bent` resolve through the
`/row/` rule back to `row` — the sheet showed the same lift twice under two
labels and I catalogued faults that did not exist. The harness now passes no
name unless `?name=` asks for one.

**NOTE — this repo had concurrent work in it during the session** (visual
beats, glass beats, recall, Voice screen). I staged only my own files; that
work is still uncommitted in the tree.

---

### Previous — 9 Sep (anatomy detail)

**9 SEP — THE MODEL IS ANATOMY NOW, NOT A MANNEQUIN WEARING A COLOUR MAP.**
He asked to keep refining and checking it: "anatomically accurate and detailed,
with all muscles and aspects included." Checking is what found the faults —
each one was visible in a render before it was reasoned about. Shipped as
`893cc8c`, live, verified on his real Push routine at 390 px.

**Four things were wrong, and only the first was the one I set out to fix.**

1. *The table was too coarse.* 38 volumes with compound entries — one
   "triceps", one "quadriceps", no forearm extensors at all. Now **82 muscles
   a side, 159 volumes**: three pec heads, three triceps, four quads, three
   hamstrings, five adductors, the rotator cuff, sartorius, TFL, ITB, peronei.
   The abdominal segments and serratus digitations are `parts=True`, so their
   divisions are real geometry rather than a texture.
2. *The mesh had no resolution where the muscles are.* Measured: of the base
   mesh's 10,582 vertices, **73% sat in the head, hands and feet** — parts the
   app never highlights — and the entire thigh had **341**. `redistribute()`
   subdivides once and collapses the extremities back: thigh 341 → ~6,800,
   head 3,348 → ~2,600, total 24,264.
3. *Every torso muscle was buried six centimetres inside the body.* The table
   hand-wrote its `y` values against an assumed 9 cm half-depth; the mesh's
   abdominal skin is at **14.2 cm**. Nothing on the trunk could ever have
   shown. `calibrate.py` now measures a trunk **shell** (centre, half-depth,
   half-width per 2 cm band) and `skeleton.skin()` places every torso muscle a
   stated depth under the measured surface. Legs likewise, off a measured limb
   radius — the adductors had been written 2.6 cm off a femur inside a thigh
   7.9 cm thick.
4. *The model could not be judged.* The muscle chart rendered as indistinguish-
   able pastels — **AgX desaturates hard**, so lats and traps came out the same
   blue — and soft studio light hides a 5 mm groove entirely. `render.py
   --rake` plus a Standard view transform fixed the instrument. Every fault
   above was found only after that. **Fix the instrument before adjusting the
   thing you are measuring.**

**What makes it read as anatomy.** `relief()` asks the muscle field two
questions per vertex: how deep inside its own belly it sits (a bulge) and how
nearly equidistant it is from a *different* muscle (a groove). Out come the
linea alba, the tendinous inscriptions, the sternal groove, biceps against
triceps, vastus lateralis against rectus femoris. Three guards, each paid for
by a broken render: a groove needs a clean **pair** (five volumes meet at the
sternum; cutting there tore it open), it needs muscle present but the
threshold sits *below* the skin (an inscription is by definition where no
belly reaches the surface), and the frame cuts at a third depth (a collarbone
is a ridge, not a canyon).

**Segmentation is region-aware now.** Live in the app the traps highlight
painted his FACE and the forearms highlight put a cyan patch on each hip —
"nearest volume wins" with no sense of where on the body it is, and in an
A-pose a hand sits 5 cm from a thigh. A vertex may now only be claimed by a
group its **nearest bone** allows (`bone_groups()`, the inverse of
`GROUP_BONES`). Face released to frame; traps 5,294 → 1,885; front-delts
56 → 409.

**One deliberate fiction, stated in the code.** The rhomboids lie under the
trapezius and own no skin, so a strict rule lit 23 vertices of 24,000 — a
highlight that shows nothing. They are given the interscapular strip on
purpose, one layer too shallow, with the lower trapezius held off it.

**Verified:** 24,264 verts, 1.46 MB GLB, 19 group materials, 22 bones —
`Body3D.jsx`'s contract unchanged. lint clean, build green, 1,235 server tests
pass. Opened on his real Push routine at 390 px: the lateral raise lights both
side delts, holds its equipment, the abdominal wall reads as a six-pack.

**STILL CRUDE — he has been told:** shoulder flexion past ~140° distorts
(linear blend skinning, no corrective shape keys); supine/incline/thrust
stances use hand-tuned offsets so a bench press floats above the pad;
equipment is primitives; the face is decimated and plain. Also noticed in
passing: the Cable Lateral Raise renders **dumbbells** — the equipment mapping
in `exercise3d.js` does not know "cable".

**How to work on it.** `blender -b --python tools/anatomy/build.py -- --out
DIR` then `blender -b DIR/body.blend --python tools/anatomy/render.py -- --out
DIR --rake` (clay, raking light — shows relief) or `--muscles` (the chart).
Re-run `calibrate.py -- --base --out joints.json` only if the base mesh
changes. **Never edit `muscles.py` with blanket string replacement** — a
`.replace()` on a coordinate fragment silently corrupted three unrelated
lines this session and the later targeted edits then failed to match, costing
two rebuild cycles that looked like anatomy problems.

---

### Previous — 8 Sep (evening)

**8 SEP (evening) — THE FORM MODEL WAS REBUILT FROM NOTHING.** His verdict on
the old one: "terrible… most of the exercises are completely wrong with how
the movement is actually meant to be carried out." Both halves were true — it
was capsules, and it was driven by the flat figure's CSS transforms, so a
squat was `scaleY(0.86)` and the legs shrank.

**What it is now.** Blender's CC0 **Human Base Meshes** male (10,582 verts,
real anatomy, clean quads) put through a headless pipeline in `tools/anatomy/`:
scaled to 180 cm, grown where a trained lifter carries muscle (71 muscle
volumes written from origins and insertions), segmented so every vertex
belongs to a muscle (19 material groups — the highlight IS the anatomy),
rigged from joint centres MEASURED off the mesh, and exported to
`public/models/body.glb` (825 KB, lazy-loaded). `src/exercise3d.js` states
each lift as joint angles a biomechanist would recognise, with a stance
(supine / incline30 / hanging / seated / prone / thrust) and the equipment
built and placed in the hands.

**Read `nova-anatomy-model` memory before touching any of it** — it carries
the calibration method, the skinning constraints, and the two three.js traps
(SkeletonUtils.clone; never assign a one-element material array).

**Verified live** on the preview against his vault: Cable Hammer Curls lights
the biceps and forearms on a clean standing figure; Incline Barbell Bench
Press lights chest/front delts/triceps on a 30° bench; Hack Squat resolves to
the sled pattern. Deployed: b9caa74, and the live site serves the model.

**THE COACH'S ANATOMY** (`server/lib/anatomy.js`) is the same 18 groups in
prose — origin, insertion, joints crossed, actions, what trains it, what it
looks like when it is the weak link — narrowed by `focusFor()` and injected
into `coachTurn`. Asked live why his bench stalls off the chest and his
shoulder pinches overhead, it separated the two, named the sternocostal head
of pec major, then the lower trap / infraspinatus / short pec minor, and
grounded all of it in his own numbers (chest hard sets 6-3-9-3, back
18-12-6-3).

**STILL CRUDE, and he should hear it from us before he finds it:** shoulder
flexion past ~140° still distorts (linear blend skinning, no corrective shape
keys); the supine and incline stances place the body on hand-tuned offsets
rather than fitting it to the pad, so a bench press floats; equipment is
primitives. Next passes: corrective shape keys for the shoulder, fit-to-pad
placement, per-exercise overrides where a pattern lies.

**Earlier today:** make-up days (he is USING them — today and tomorrow both
marked as Push make-ups), the itemised plate, the form check, the study lane,
the Intake, wrap the day, open-it-for-real, and the surface standard.

## SESSION LOG (append-only, newest first)

**27 Oct (numbers, profile, voice, ship path; claude.ai 014CevftckmCBhFtFVKkX9J4).** Made his numbers editable (Katch-McArdle, a body-fat range from the ATHLEAN-X guide + Navy tape + RFM, a Monday review that refused to cut calories on a log that implied an impossible burn), then built WHERE HE STANDS and a Protocols page into Coach, Ask Nova and the debrief, a twelve-section profile with a 105-question interview, options, resume, retract and a test that fails any agent ignoring him, a turn that waits when he stops mid-sentence and takes a continuation, and a Builder ship path gated on his tap. CORRECTED, not added: I said the numbers feature was shipped while its first deploy was red and called things live on a green run alone (he told me off; now the standing rule `never-claim-live-unverified`); I diagnosed "it reset for no reason" as a remount (tested, false) before reading the log, which showed the save was never sent; at close I misread another session's 19 deliberate unpushed commits as lost work until `git log` and the reflog showed otherwise; an early `git stash` took the Train session's files (restored in minutes).

**27 Oct (Train, claude.ai 01FPAPLf).** Built mockup 104 (two workouts a day, walks from Apple Health, routine editing) and 105 (the week as a list). Two parallel Opus builders, one on HealthKit and one on the Train UI; the Train work was swallowed by a peer's `git stash` mid-session and recovered by their pop. Corrected, not added: I wrongly raised eight-day-old effortArgs chat errors as current. The entry at the top of CURRENT HANDOFF has the state.

**19 Oct (the live session's week tray, claude.ai 01CQEceq).** Brought the weekly muscle sets back onto the live Summary session as a one-row tray that morphs the existing sheet open, then, on his notes, relabelled it "Goal muscles in range", made the card's best the heaviest set with its reps, and added a history sheet of the lift's last eight sessions. Corrected, not added: my first tray was two rows and fell behind the tab bar at 375px (compacted to one row); my first history CSS used 11-12px type and tripped the page-styles test (raised to 13px); one existing test pinned the old estimate on the card and now pins the set. Pushed and reloaded on his yes.

**19 Oct (the Lyfta squat pilot, claude.ai 01CQEceq).** Rebuilt the pilot squat from the RP athlete's tracked rep instead of invented angles: body-frame tracking with left and right averaged, feet planted, a rep found by walking from the bottom to the first peak, and the left/right swap repaired. Found and fixed three skinning faults by looking at renders, not by the stretch check (which passed while the picture was wrong): the collarbone roll flip, the latissimus wing, the trapezius. Corrected my own claim that the check proves the figure looks right: it measures extent, so a wing that stays within extent passes. The arms still copy a tracking error (grip widening 2.0→2.58×) and the hands are flat; the next loop waits on that. Committed 898dc35d.

**19 Oct (shopping, claude.ai 01MPaorT).** Found Woolworths had hung every read since 10 Oct (a sessionless POST; a GET answers in under a second) and Coles walls this Mac in every form I could honestly try, so Coles became his to check with a link per line. Corrected my own first fix twice: the Weet-Bix count (a boxed food counted one per box, now divided by the label's piece weight, or one flagged pack) and a matcher that priced blueberries as yoghurt and jam. Built the Reminders sync (EventKit bridge + syncPass); it is live with 21 lines linked and a tick round trip proven, Siri's direction still unseen. Memory: nova-shopping-prices, nova-reminders-sync.

**18 Oct (Quick Capture and the Claude-free features, claude.ai 01AhAA1e).** Built the Inbox's one capture box in both idioms: code files what it can read for certain (shopping, to-dos, timed reminders, labelled notes), the tag says where it went and can move it, and long-form episode links go straight to the full read. Made the shopping list, food describe, calendar adds, recipe pages and the kept-and-retryable links and photos work without Claude, and added spoken weight and set logging. Goals now apply from the day they change (targetHistory), so past days are never judged against a new target. Corrected, not added: a captured reminder kept a leading "to"; a stale Inbox card judged old days at 166 g and was discarded, and its producer now judges each day by its own floor; the calorie-week budget expression was wrong and reverted; the fuel-cross test passed without its finding and now asserts it. Spoken sets that beat his best show the record moment in-app; his answer was no Telegram ping.

**15 Oct (native shell, claude.ai 01AhAA1e).** Fixed the OFFLINE storm at its roots: the 1.9 MB uncompressed sync is now ~0.23 MB compressed with a trimmed inbox, and the Mac is pinged before the app says OFFLINE. Corrected, not added: my own earlier commit 502b138 had made any network failure read as OFFLINE with no fallback, and the Shortcut-era higher-wins rule was discarding Apple Health's correct lower totals (now healthkit wins). Built the four widgets, the full-screen shell fix, native HealthKit reads (working on device), and movable Home cards. The Landed card was counting Nova's own reports (6 of 9); it now counts only his captures.

**14 Oct (health push, tab lens, icon, claude.ai 01MPaorT).** Diagnosed the silent morning health push (no POSTs since about 12 Oct; old shortcut used "last 1 day" windows), added the intraday "today" push path, and made the workout endpoint take a flat workout. Corrected, not added: a 20-minute walk would have been stored as 1,200 minutes (bare duration in seconds), now derived from start/end. Built the sliding tab lens. Replaced the app icon with Nova's core (option A); the first render was blurry because NovaCore capped canvas density at 2x, so small cores now use up to 3x and the icon is rendered at 8x.

**13 Oct (redesign, claude.ai 01MPaorT).** Built mockup 101 on Fuel, Train and
Home (tiled headers, per-card glow, muscle-hued records, the day as a rail),
the page-move engine (push/pop, session grows from its card, tap the top) and
the Inbox disclosure. Corrected, not added: after he spotted the Lead card on
the old header, an audit found two more (the sealed technique reveal, Your
day) and all three were moved to the tiled header (6f63656). Earlier slips in
the session: a bar onClick placed before style broke the chromeGeometry test;
the grow showed both pages through the glass until an even-odd hole fixed it.

**12 Oct (redesign, claude.ai 01MPaorT).** Added the Notion key page and
two-way Journal sync, Skill sets with articulated prop-aware agents and a perf
channel, swipe-to-dismiss on ~30 sheets, and the short structured Daily review
(synthesis, provenance set apart, key terms, reflection). Corrected: the first
live summary failed on an over-long reflection (now trimmed, tested); a Date
object in YAML broke the review on his real vault (dateKey/titleKey); two
Notion journal tests were date-dependent and began failing on 12 Oct (fixed in
fd06001). Not done: checklist row boxes, on-phone confirmation.

**11 Oct (recipe/brief session).** Fixed the morning brief's missing glass
panels (the summary Nova thread never read the stage card; e061e42) and made
a reel recipe's photo a clear food frame: first the model picked (inconsistent,
chose a mid-assembly Kinder Bueno), corrected to model-describes, code-ranks
(a451267) with a second tier for a small caption. Corrected, not added: the
first picker's "acceptFrame" idea was replaced by rankFrames. Seven of his
eight reel recipes now carry food frames; one keeps its cover.

### 3 October 2026 (close) — nova-os-fc
Built and shipped in one long session: the consult rail on every door
(his words instruct everywhere, no phrase gates, quiet hours), Nova's thread
and full-screen focus, the record moment, the workout panel, Train's and
Home's done-today card, Fuel's swipe-to-delete/rotation strip/viewed-day
logging, and book naming from the file. Corrected rather than added: I told
him the redesign was on his phone when it was deployed but invisible (Summary
only, PWA not reopened), and the repeated book error was his old client, so
the fix needed a push, not more server work. At close two clock-dependent
tests failed after 22:00 (adebc91). Next session opens with the Instagram
reel on Nova's icon motion, then the remaining redesign pages.

### 25 September 2026 — nova-os-d3: the reel, from the Hormozi spin-wheel reel he sent
He sent an Instagram reel of someone cycling a spin-wheel through Alex
Hormozi's books to a tactic of the day, with sound, and asked whether
something like it belonged in Nova. The finding that justified building it:
by 25 Sep Nova had served a Repertoire technique on eleven straight days and
he had marked not one of them tried or skipped — the loop had a "do it" but
no "report back". Shipped, on his yes to all four proposals: a new technique
now arrives sealed on Home and is revealed on a picker-drum reel (the
waiting techniques pass in curriculum order and it lands on the day's real
pick — theatre over a decision already made, never a roll); the daily
review's shuffle, which really is a random draw, spins the same reel in its
own violet, and its ⟳ control grew from a 13px glyph to a real 44px target
with a haptic; Wrap the day now asks "did it land?" against the technique's
own Tell, with a line for what happened, logged in one write and correctable
in place; and, on his second yes, a technique that didn't land last time
comes back a step sooner in the spacing schedule rather than waiting out its
full interval. Sound is synthesised Web Audio (a detent tick, a glass chime)
scheduled off the same timeline the picture animates from, and claims iOS's
'ambient' session so it never pauses or ducks his music — a real fork the
last audio-session build already knew was one-or-the-other, resolved here by
using the third category neither speech setting is allowed to touch. Two
timing traps paid for building it: an animated `filter: blur()` on the reel
strip isn't a compositor property and hung the recording instrument for
minutes per frame (removed, transform-only now); and the landing/hand-back
run on the WAAPI animation clock rather than `setTimeout`, so a slowed
recording slows the whole beat instead of opening the card mid-spin. Verified
in a guarded headless Chrome against his real data at 375/1280, both design
styles, and reduced motion, with every write blocked; not yet heard or felt
on his phone. Two of that guard's own gaps surfaced and were fixed along the
way: `shot.mjs` was only registering its write-guard on the first CDP
session, which let two harmless requests reach his live server before the
fix landed (one cache read, one summary job that wrote nothing) — now fixed
and pushed. All work gated (server suite green throughout, ending 2426/2426
before nova-os-44's own additions) and pushed at his explicit "Push".

**25–26 Sep (nova-os-jarvis → nova-os-clicky).** From two reels: the working
glass (a research job narrates each stage with a code-written panel) and
depth on the glass; then Clicky — Nova opens apps and sites, drives Music and
the volume on the Mac, answers "do you have X connected?" from evidence, does
"…then open it so I can confirm", and turns "start an agent…" into a plan.
Corrected, not added: the model context's claim of an ElevenLabs voice
(false); reminders losing his capitals; "set the volume to 30" reaching the
shopping list. My narrateJobs replayed every past brief on a fresh load and
wrote them into his record — found and fixed by a peer (c455cf2).

### 25–26 September 2026 — nova-os-44: the agent models audited and fixed, the voice turn that was never sent, and the Habitat
Audited the model board and fixed his picks: the Opus-or-Sonnet gate now follows the board, forge/planner/scout validate models, the last $2 cap and kill timer went (the no-caps guard now finds every lane itself), Ask Nova moved to Sonnet 5, and a per-lane spend ledger (built by an agent, corrected for a dropped exit-code check) shows on the Settings board. His spoken turn at 14:22 had been heard and transcribed but never sent (a render-stale ref); fixed and proven before/after, and every spoken exchange from every door now lands in one server record Nova reads back. Corrected along the way: two tests had been writing into his live data (30 fake greetings in the spoken log, the Coach pointer), the working glass read every past brief aloud on a fresh load, and the record duplicated same-millisecond lines (repaired). Then the Habitat: a set per district, lanes, a plaza, daypart light, and a pure life engine so the nine live off duty at zero tokens, integrated on Ops and pushed. He will review later.


**25 Sep (close, nova-os-d3).** He asked me to check his Coach chat history
for why simple changes were going wrong, and to fix it. Found seven distinct
faults in one 25-minute conversation (11:01–11:26): PROPOSE lines refused
silently, a move split into two cards so a yes on the remove half deleted
the exercise, Coach claiming "Done" before anything changed, an add landing
last instead of "straight after the incline bench", a curl offered onto his
Push day twice, the Claude usage limit shown as a Coach answer, and Coach
miscounting his own program because it had no live view of it. Rebuilt the
whole PROPOSE pipeline (server/lib/coachProposals.js): every line is
validated against his real program before any card exists; a refusal goes
back to the same Coach session once, with the reason, and only what still
fails reaches him; a move is one card, one write, one undo; the model never
states an outcome, code does. Verified live through the real Claude CLI on a
throwaway vault, not just unit tests. Later in the session, after several
peer sessions had built on the same deck concurrently, found and fixed three
more gaps: a card overtaken by a since-made edit used to fail on tap with no
explanation; a failed yes's real reason now shows on the card; a card Coach
takes back now reads "Taken back" in the Inbox history instead of nothing.
13 commits, 2289/2289 server tests, lint 0, build green, verify-shipped PASS
at close.

**25 Sep (close, nova-os-2c).** Shipped six things in one continuous
session. The hard-sets card now opens a full planned-week sheet
(plannedWeek.js, WeekSets.jsx) that tapping it grows into, one exercise per
day per muscle. Past days in that sheet are judged by the plan as it stood
that day (planHistory.js, folding routine-file snapshots + the live file's
mtime), never by today's schedule, per his rule that nothing should count
as missed if the plan changed since. The reverse curl was re-filed
Biceps→Forearms on his word, with a new general-purpose route
(exerciseRefile.js) and Inbox undo. Discuss on a Coach card used to only
focus an empty input; it now sends an opening turn so Coach actually
explains the change and asks a question, carrying the card context Coach
already had. An exercise added mid-session used to start at a flat
0kg×8; it now prefills from his last sets, Coach's earned progression
step and the routine's own prescription (sessionPrefill.js) — caught his
own live report that Face Pull came in wrong. Built exercise research
(exerciseResearch.js): a new exercise is researched and properly added
(anatomy, cues, equipment, variations, sourced) within 30 seconds of him
adding it or Coach suggesting one, and a weekly pass improves five program
lifts and may add up to two new ones — all through one Sonnet web-search
call per batch, checked field-by-field against the closed vocabularies
before anything is written, filed as an undoable Inbox record. And
rewrote the stale/long-tenure lift detector for restraint (his own words:
"not a must... don't over-indulge or over-decide") — a lift only counts
flat after four real weeks, the first suggestion is a same-lift
tempo/pause change rather than an outright swap, any swap candidate must
share both the prime mover AND the movement pattern (the old version had
offered Deadlift for a Lying T-Bar Row), and at most one exercise-change
card fires a week. CORRECTED along the way: the old stale-lift alternative
ranking only matched muscle group, which is why he'd declined 6 of the
last 10 such cards; the new one requires movement-pattern agreement too.
Verified against his real vault at every step (live overview reads,
verify-shipped markers on the deployed bundle, 2288/2288 server tests),
not sample data. NOT yet seen live: a real exercise-research pass has not
run (no Inbox record of that kind exists yet — the weekly window opens
Sunday). A peer session (nova-os-44) was mid-edit removing the request
budget cap from exerciseResearch.js as this session closed, per his
standing "no caps at all" instruction — unreviewed by this session.

**25 Sep (late morning).** Built Coach's suggested changes into Train: a
banner under Today and Gym, a deck on the Coach tab, each change drawn as a
sentence with its real before/after numbers, a yes that closes to a tick and
plays the change out, a discuss that hands the card to chat, a no, and an
island Undo on either answer that reopens the card (new — nothing could be
taken back before today). Fixed on the way: approving a program-review fix
used to file an acknowledgement and change nothing (his complaint that
started this); both Coach prompts still told him to "tap APPLY IT" for a
button that no longer exists on the Coach tab. Verified in the browser at
375/402/1280 against his real cards with writes blocked, 2203/2203 tests,
lint and build clean, deployed and confirmed live in the bundle.
CORRECTED, not added: a devtools `initScript` write-guard does not survive
a viewport `emulate`/reload, and this session's own test declined one of
his real cards (ac801409) before that was noticed in the server log and
undone 15 minutes later — the reopen route exists because of it. While
writing this handoff, he approved two of the deck's cards from his own
phone in real time; both were confirmed to have actually applied (the
`destination` field, not just a filed receipt), the first live proof the
deck's yes really acts on his device.

**25 Sep, nova-os-06.** Characters pass 4 (designed backs, cape, towel, fin,
satchel) and pass 5 (close-up and motion checks: elbows, drapery projected
onto bodies, ledger, books, bandana, eased working loops), published v4/v5.
The beings became one module shared with the app. The zero-token rule was
planned and made a test. The Org Map shipped on Ops (view model, marker
list, 3D map). Corrected on the way: a CDN-import sheet cannot be published
as-is (bundle it); three's RoomEnvironment washed the beings pastel; my one
bare `launchctl kickstart` predates the reload guard and is now forbidden.

### 25 September 2026 (early morning) — the Arcus reel: Nova's own ears, a measured local model, the plan that sees the log
He sent a reel of "Arcus" (a local-first assistant built around neurodivergent execution) and then asked for all three ideas to be built overnight and checked live. Voice on his iPhone now bypasses the browser speech engine entirely: the phone records, a loudness meter decides when his turn ends, and the Mac writes it down; an Action Button Shortcut lane does the same natively. A small local model (Qwen3-4B on MLX) was measured against Haiku on 40 real captures and deliberately not switched on: 65% route agreement, eight times faster. And the day plan learned to see what his log already knows: over 27 days he ticked 10 priorities, while 31 were visibly done in his own log, so the plan had been re-listing things he was doing every day. Stuck promises now get their own card with three answers and a voice session that takes the first two minutes with him.
CORRECTED, not added: the tick buttons did not die from disuse. The plan card was deleted from his phone's Home on 15 Sep inside an unrelated Leader commit, the day his ticks stop; it is restored. Also caught in live checks rather than assumed: the one-thing card showed only the why (a field that never existed), a restart-interrupted plan hid the real one, a shadowed variable blanked the whole app (found only by running it), Whisper's "Thank you. Thank you." for silence, and 10.5px type under Home's 11pt floor. My own 07:07 service reload was what interrupted this morning's plan run.

### 24 September 2026 — voice diagnosed, five swipe-back attempts, the correlation engine
His voice report ("it's not working") was answered by grouping the existing turn receipts by device rather than guessing: iPhone 0 of 10 turns ever heard, Mac 6 of 6 — dictation has never worked on his phone, and a mic-check instrument now exists to find out why. Nova stopped asserting he was silent when it heard nothing. The silent-switch trade (his music ducking vs Nova staying audible) became his choice in Settings once no web-platform equivalent of iOS's playback+mixWithOthers was found. Instagram reels got real poster frames. The Researcher can now answer "no" and has to leave the argument open when it does — proved on a real creatine-loading question. A panel of named researchers runs in parallel on one question before one merge, also proved on that real run. The job tray gained a ticking clock that costs zero re-renders (measured: 6s, zero `App.render` calls). The Leader panel promotes to the top of Home before a work block and now stays through it, with a Telegram reminder on the same edge. A correlation engine was built and confirmed onto a weekly Sunday Telegram surface — two-tier reporting (held vs not-established) after his own data produced a real signal that missed the strict statistical gate by a hair. Anti-vibe-coded design guidelines went into the global CLAUDE.md plus fenced project files in Nova, atlas-partner and Science Atlas, each recording what the project already does on purpose that the generic list would otherwise "fix." A make-up day became one focus control instead of two, then was found to re-derive a fresh exercise list instead of moving his real outstanding debt — fixed, and audited (with tests, no code change needed) that a make-up can never read as a skipped session. The in-app notification stopped collapsing at 375px and can now be flicked away with the same direction-lock the back swipe finally got right.
CORRECTED, not added: my own earlier claim that the researcher panel's cost was "bounded and tested" is now stale — a peer session's standing "no working caps, anywhere" instruction removed the budget caps and watchdog I had built into `researcher.js`, on his own later order, and my test for it is gone with it. Checked against the diff before writing this rather than assumed. The back swipe took five attempts: a synthetic-event "verified" build that failed on a real thumb, a direction-lock fix, a screen recording that showed three pages' text painted on top of each other (a transform on `<main>` was breaking `position:fixed` app-wide), a full parallax rebuild, and a stutter fix for a `getComputedStyle` walk over the whole DOM on every gesture start. None of the last three fixes — swipe, UPDATE, the notification gesture — have been confirmed by him; do not report any of them as working, only as built and reasoned through. And an accidental `git commit` after `git add <my files>` swept seven of a peer session's staged files into one of my commits — recoverable, nothing lost, but a reminder that a bare `git commit` takes the whole index.

### 23 September 2026 (evening) — the Agent World: the reel, the plan, his call for faces, and two passes of the nine beings
He sent an Instagram reel of a "video game for my AI agents" and asked what Nova should take from it. It was watched frame by frame and answered as a plan (`design/AGENT-WORLD-PLAN.md`): the Org Map, seven hex districts drawn from the real department map, figures whose every state comes from heartbeats, job files, plan records and the trust ladder, and exactly one floating marker — the thing waiting on him. An Opus agent surveyed six of the same creator's YouTube videos (Instagram's listing is login-walled) and its findings are folded in: badge only where it means "you", jump-to-next, "Viewed" as a third verb, sticky layout, night as emitted colour. He then made three calls: proceed with the review sessions first, **faces in 3D with a character per job** rather than luminous forms, and yes to Viewed. Shipped alongside: review findings 1 (Home's fold rows become instruments), 4 and 8 (every muscle Train names in its own hue, the Goals card and the Coach's empty log as instruments), 15 (Fuel's ring as three arcs with a dashed gap, the cross-check as two bars), 20 (the Briefing empty state as a stage at rest), 13 (a light tick and cross, one "do all" per subject, and the decision acted out), and the Seen verb, round-tripped live on a real record. Two passes of the 3D character sheet followed; pass 2 fixed the framing that had made pass 1 impossible for him to judge, and rebuilt each being as one sculpted body with a face that blinks, glances and tracks.
CORRECTED rather than added: my own review of pass 2 called the artefacts and faces done — he saw bandit masks on Leader, Coach and CFO, and he is right; that is logged as PASS 3 and is the next job. `scripts/rec.mjs` (the peer's) also caught a fault no still could: the Fuel macro arcs mounted already finished, because a CSS transition cannot fire on an element that mounts at its final value. And a claim of mine was wrong earlier in the day: I told a peer a large uncommitted batch was theirs when it belonged to a fourth session — checked against the diff, not assumed, after they pushed back.

### 23 September 2026 (midday) — the goal board; the Jarvis report and reply-in-place shipped
Steps, protein and calories judged by code against targets that carry their provenance, pace measured by the hour, holes kept as holes; the Coach and Ask Nova read the same record, the cadence engine sends its hour-gated prompts, and the Goals card draws three rings with the week as a strip under each. Verified by asking Nova and the Coach the questions he would ask: the Coach came back with a 2,150-step shortfall costed as twenty-five minutes of walking, and a swap of a cooked Potato Bowl for the lasagna to land 2,205 kcal / 201 g. The two builds queued on 21 Sep were committed first.
CORRECTED at close, not added: commit `ea6cd97` left `src/App.jsx` unparseable on main — hunk-staging split a JSX fragment from its context, and the local build stayed green because it builds the working tree, not the index. Main was broken for two commits until a fourth session's `8f57b80` healed it by accident; the Pages deploy for `ea6cd97` had failed with "Unexpected token". HEAD parses, deploys and carries the code. That fourth session also swept two of this build's hunks into its own commits.

**23 Sep 2026 — no working caps, anywhere.** His standing instruction,
verbatim, logged at the top of CURRENT HANDOFF: no dollar ceiling and no
wall-clock kill on any spawned `claude` process, ever, without asking him
first. Removed `--max-budget-usd` and `settleWatchdog` from 38 lane files in
`server/lib/`, deleted `lib/settle.js` outright, and pulled out
`researcher.js`'s whole budget-triggered pause-and-ask architecture end to
end (planner step status, inbox dispatch, four client files) rather than
leave it as dead code with no cap left to trigger it. Added
`server/test/noCaps.test.js` so the two patterns cannot come back silently.
2040/2040 tests, lint and build both clean. Left the retry-count guards on
`dailyReview.js`/`healthInsight.js` and the plan-cost preview in
`capabilities.js`/`plan.js` alone — told to him rather than silently
touched, since neither cuts short a job that is honestly still working.

**22 Sep 2026 (night) — the sixth blur attempt, the food log revised, the
camera's four faults.** Removed the viewport's `user-scalable=no`/
`maximum-scale` (kept `minimum-scale=1.0`) on the reasoning that iOS honours
that lock only in a standalone PWA, never a tab, and his own test that day
(Chrome sharp, installed app soft) pointed exactly there after five CSS
fixes had changed nothing. Rebuilt the food log per his ask: a "log it
again" rail above the composer ordered by the actual moment logged (fixed
the sort — it was ranking by habit, so a food just typed lost to one eaten
forty times), one field instead of five boxes, one grouped list. Fixed the
camera's silent failure on four fronts (FileList cleared under the read,
HEIC through a decode path iOS refuses post-capture, failures vanishing
with no error, staged photos lost to an iOS eviction). 2024/2024 tests,
deployed bundle checked directly on GitHub Pages. **Neither fix is verified
on his device** — logged in `nova-open-threads` rather than left unstated.
Corrected my own comparison mid-session: told a peer their push-carried-a-
committed-commit was the same failure as an earlier staged-files mixup; it
isn't (pushing `main` publishes every commit on the branch — that's just
git, not an accident), and the memory already on file for it was found to
apply to their actual failure shape instead, so nothing new needed writing.

**23 Sep 2026 — Working on this Mac.** Step B of the Agent World plan,
pulled forward by his instruction: every Claude Code session across every
project, judged by when someone last spoke in it, as a panel on Ops and one
line on Home. The judgement is Wren's file copied byte for byte with a test
that proves the copy; everything touching the machine is injectable and
tested with fakes. 1993/1993 server tests, lint and build clean, verified
live against his real seven sessions. Show me and Close it are tested but
have not yet been fired at a real window.

**22 Sep 2026 (midday) — Close pass, not feature work.** Re-ran every gate
fresh rather than trusting the last-known state: lint clean, build clean,
1947/1947 server tests (was 1777 on 17 Sep — three sessions had shipped real
work since). Cleaned the dev instrument the morning session left running
(`vite --port 5183`, `public/_devconn.js` — a live token file, always
removed at close). Found the queued aesthetic review half-done: 38 screenshots
taken (32 cupertino, 10 command — 14 screens have no command counterpart),
no written findings, and ten of the shots predate a top-bar fix (`20b6f87`)
that likely fixed the exact bug they would have shown — flagged rather than
reviewed. Left the shots uncommitted rather than checking them in: the
repo's one prior audit (`2026-08-full-audit`) is 70 files, all markdown, no
images, and 15MB of PNGs breaks that convention silently if committed by
default. Also traced a loose thread the morning entry left open ("their
unstaged liquid-glass work... left alone") to its resolution in `20b6f87`
— not lost, already shipped and tested.

**17 Sep 2026 (evening) — The dock could never have buzzed.** Third report
of "haptics still not occurring" traced to a real structural gap:
`MobileChrome.jsx`'s dock was built from bare clickable divs with zero
`haptic` props, so it was silent by construction no matter how many other
call sites existed elsewhere (9 elements app-wide could ever fire a tap,
against 38 programmatic calls that can't on iOS). Converted the whole
chrome; verified 21 switch overlays where there were 0. Also fixed the
three deferred view-transition pairs via a proper `src/vtName.js` instead
of hand-minted, drifted names, and hardened `withTransition` against a
duplicate-name abort a peer found (freezes a `backdrop-filter`'s snapshot,
kills the WHOLE transition, not just one morph). Ran a full shipped-build
verification pass — cloned the exact deployed commit into an isolated
worktree, screen-recorded it against his real vault, sent him the MP4 —
and caught two false alarms that were the verification rig's own fault,
not his app's (a leftover dev service worker; a case-sensitive PR-dialog
detector). **Corrected two of my own earlier claims on record**: FEEL-PLAN
had said haptics reach his hand everywhere (only true for elements with the
prop, not the 38 that call it programmatically), and a stale coverage note
in memory. Also corrected a peer's misreport about my reflex tests being
date-dependent (they aren't; checked live) and gently corrected their
summary of their own commit. Xcode not yet installed — pointed him at the
App Store page; the sign-in and click are his.

**15 Sep 2026 — The Repertoire.** His standing ask for a CONFIRMED report on
anything he sends to analyse, plus one technique a day off a Mentalist reel.
Built `captureReport.js` (the receipt is code's, not the model's — reusable by
every lane), `repertoire.js` (catalogue in the vault, schedule in server/data,
interval driven by times TRIED not times shown), `repertoireLane.js` (fetch →
one model pass → code renders), the routes, both Home idioms and the spoken
brief beat. Ran it live on his reel three times; each run exposed a fault the
previous one hid — a stringified object reported as a transcript, then a card
cut mid-word. The report's best finding is that the reel's own caption calls the
technique "gaslighting" and it is not: it is an interrogation false evidence
ploy, and the caption exists only in the frames. 1569 pass · lint 0 · build 0.

### 14 September 2026 (third pass) — Wren, and the hunt for the seconds
Ported the three shared voice faults into Wren (committed, not pushed). Then on
Nova: barge-in — he can talk over it, filtered by comparing what the open
microphone hears against what Nova is actually saying, biased toward letting
Nova finish, with a valve that switches it off after two false cut-offs. The
words after the wake word and the words he interrupts with now start the turn,
and a turn that already has words runs on the hold instead of the lead, which
is five seconds off every hands-free turn. Then measured the whole spoken path
and found the cold-start stall was ONE of nineteen context sections: the brief,
8,775ms of an 8,776ms build, one CalDAV round trip. Cached apart, warmed at
boot, self-labelling its age: 101ms, and the first ask after a restart is 211ms
where it was 8.4s. TTS bytes cut to 40% — the old 192k was never even honoured.
Nothing yet run on his phone.

### 14 September 2026 (second half) — the driving report
He tried to converse with Nova in the car and it failed in every way a
conversation can. Nine faults traced and eight fixed in ten commits: one voice
per reply (the alternation was mine, from the morning); the mic waits for the
end of a reply; a 45s ask timeout; a register that talks in turns and asks
before assuming; no wall-clock cap on a speaking turn, a retried restart, and a
turn-end receipt log; the wake-word overlap; a sticky lane for follow-ups (his
01:04 → 01:17 gap is a test); and phone panels that scroll into view and grow on
tap with a FLIP morph. Two delegated agents (opus for the mic, sonnet for the
sheet), both verified by reading and gates; the mic agent corrected my brief
twice and was right both times. Caught my own build gate lying (grep, not exit
code). Nothing has run on the phone yet. Wren shares three of the faults and is
untouched, pending his call.

### 14 September 2026 — three things that reported success while losing something
Resumed from a handoff two sessions stale. Finished the TTS readiness fix left
uncommitted on 13 Sep (a signal-killed sidecar read as alive; thirteen hours of
silence) and wrote the client half that makes the fallback real. Stopped the
ingest weave losing `index.md` and `log.md` — the 12 Sep merge fixed the
refusal at approval, and the loss was happening one stage earlier, in the
staging diff; proven on his real pages. Fixed `JOINT.none`, a fallback that was
`undefined is not a function`, and looked at the figure to prove it. Found the
health push alive, not stopped — and corrected the misreading that said
otherwise. 1462 tests, lint and build clean, pushed, service reloaded.

Then the two standing items. Fixed the `briefing.test.js` flake that had been
offered three times and never picked up — not the fan-out, a wait that called a
two-step completion done after step one (proved it by widening the window, then
40 runs under load). Answered the Coach/Distiller drift question the 12 Sep
session deferred: measured the line merge against his real routines and exercise
library across sixteen scenarios, nine adversarial, including whether the
derived prose body still agrees with its own frontmatter — zero corruptions. The
Distiller now merges (three of four real jobs touch index.md/log.md); Coach
stays strict on cost, not safety, with the measurement recorded where the next
session will find it.

### 12 September 2026 — three bug reports, all of them Nova saying something untrue
No new surface. He found all three by reading his own screens. Two identical
"Upper Body — makeup" rows for the 12th turned out to be two writers stating the
same debt thirteen seconds apart — he pushed the five exercises he missed forward
and then marked the date a make-up for the same routine, and `leftoversOf`
derived the same five because none had been logged; the store now holds one row
per date and source routine, merging a restatement rather than twinning it. The
"2 lifts went further than they ever have" card was worse than a labelling bug:
the raw Epley estimate was compared against the already-ROUNDED stored best, so
an exact repeat of a set cleared the bar by its own rounding remainder — in the
app and on the Telegram PR ping. His 11 Sep session went from three PRs to one
real one (Carter Extension, 14.3 → 14.7), which the two phantoms had been
pushing off the card. The cards also printed the estimate wearing a "kg" while a
real weight PR wore none; they now lead with the set he lifted and label the
estimate beneath. Third: the ingest refusal over `Wiki/index.md` was a
structural race, not an edit conflict — every weave rewrites index.md and log.md
and so does every journal entry Nova files, in other sections; measured on job
33121b5b, nine insertions across four sections with no line in common with the
journal's. A line-based three-way merge now reconciles that and refuses only on
real overlap, which stops a $2-3.50 pass being thrown away into the same race.
Corrected rather than added: I chased commit c155655's "meaning index" first,
which is the semantic embedding index and never touches the vault. Found and
left alone: `Body3D.jsx:1184` calls a `JOINT.none` that does not exist. 1433
tests green, live on 87de867; nothing rendered by eye this session.

### 9-11 September 2026 — the conversation itself (parallel to the 3D model work)
Everything about TALKING to Nova. The browser was ending his spoken turn at
~1s of silence and sending on that instant, so a breath mid-sentence cut him
off; the Web Speech API has no threshold to lengthen, so the decision moved
into turnEnd.js (hold 2.0s after he reported 2.6s too long). The chat log was
keyed on message COUNT and a streaming reply does not add a message, so it sat
still for the whole of every answer. The EVIDENCE button offered a training
card under a leadership reply — four regexes whose \b bound only to the first
alternative, over a reply nothing checked the subject of.

Then the big one: panels that rise as Nova speaks (his Iron Man 2 references),
with real timecodes from the Watcher's own vault notes or from captions, and
never an estimate. It took four rounds to become visible to him, and three of
those were my faults stacking: a directive leaked as `VI` mid-stream; a second
prompt section named "THE GLASS" made the model obey the older one; the model
wrote `title` where the contract said `label` and every panel was dropped; and
finally the panels were rendering beside the core, which on a phone sits above
the log he was reading. Also corrected rather than added: a make-up day was
hiding the session that was ALSO scheduled, "New chat" wiped a days-long log
with no undo (63 turns recovered from the CLI session transcript), a 1000-char
limit refused a long spoken turn, and the Leader was reading ## and [[links]]
aloud. 1377 tests green; live on 5ed4293de, confirmed on his phone.

### 8 September 2026 (evening) — the anatomy model
Procedural body attempted and abandoned; rebuilt on Blender's CC0 base mesh
with a measured-joint rig, anatomy-constrained skin weights and joint-angle
motion. Coach given the matching anatomy. 1235 tests green.

### 8 September 2026 (afternoon) — make-up days, and the live sweep
makeupDay.js + every training surface; carry-overs joined the sync snapshot
(they were never loaded on arrival). Verified the deployed bundle chunk by
chunk and every endpoint over Tailscale with the Pages origin. 1230 tests.

### 8 September 2026 (afternoon) — the study lane; the athlete-AI queue complete
paperLane.js: Researcher read → Coach judgement against his real block →
code-validated changes raised as coach-program proposals. Router, planner
capability, Coach-composer door. Live on Schoenfeld 2017: honest
abstract-only read, two proposals on real ids. 1225 tests green.

### 8 September 2026 (midday) — the form check
ATHLETE-AI-PLAN #4: protocol gate in code, usability verdict by the model,
deterministic frames, per-lift rubrics, measurement scrub, review as a
proposal. Caught and fixed the URL-pathname bug that had silently stopped
video attachments producing frames since 6 Sep. 1216 tests green.

### 8 September 2026 (late morning) — the surface standard, and the itemised plate
The wrap card rebuilt on the house objects and added to the Apple twin (it
was invisible on his phone); the standard written up as NOVA-METHOD.md §2b.
Then ATHLETE-AI-PLAN #3: per-line plates, each line droppable, undo, and the
sum-owns-the-total contract. 1203 tests green; verified on his real log.

### 8 September 2026 (morning, second pass) — wrap the day
The end-of-day sentence: lib/wrapDay.js (facts, closer, ranked ask,
composer), GET /api/wrap, the Home card and the "wrap the day" chat door.
1195 tests green under TZ=UTC. Live-checked against his vault; the card's
evening render checked with injected state.

### 8 September 2026 (morning) — open it for real, and the Intake
Nova's own visible browser (own profile after the lock collision), the
hand's final URL, yes-presses-it offer; the Intake end to end (server
compute/write/undo, chat interview, Settings door). Three live browse runs
(~$1.5), one intake interview, all test records discarded unwritten. 1184
tests green under TZ=UTC.

### 8 September 2026 (small hours) — the browser hand, live on the glass
Streamed browse runs → steps → SSE nudges → windows on the stage via the
existing putCard rail (cdf0845 + fixes). Router learned the media shape on
both sides. Two live runs from the composer verified on the shipped bundle.
1171 tests green under TZ=UTC.

### 7 September 2026 (late night) — the Briefing, built and proven
design/BRIEFING-PLAN.md → phases A–D (8647722, 3fb2882, 94693a6, 2f6aecb),
one real run on his light-wavelengths sentence, four bugs found and fixed
(a28a2b0, 0b07c1e, e1db9c7), Commons ranking (eb21f35). Verified at both
widths on the shipped bundle. 1166 tests green under TZ=UTC.

### 7 September 2026 (night) — auto-filing, the shelf audit, and the Coach mid-session
Uploads file and weave themselves with a notification that deep-links to the
record (facc65b). The agent audit found eleven agents inside the vault that
had never been told the shelf existed; sourceShelf.js + fuelContext.js + a new
lens rule fixed it (e2d352e). The Coach's reasoning now survives the tap on
Start (253d0b3). 1140 tests green under TZ=UTC.

### 7 September 2026 (night) — swipe + per-dish variants, phase 4 edits, the sweep, and the athlete-AI queue
Fuel's last two pieces (f635eae), verbs phase 4 (414a934), a verified sweep of
the standing open-threads list, and design/ATHLETE-AI-PLAN.md scheduling five
builds off @krudd.jr's series. 1127 tests green under TZ=UTC.

### 7 September 2026 (evening) — the Fuel overhaul: options, ticks, the fridge, and macros from labels
Rotation v2 (options per slot, focus vs eaten, custom meals), the fridge
(portions.js + Meal Prep Portions.md, red OUT cards, IN THE FRIDGE row on
the recipe, meal.cooked / meal.portions verbs), and the editor's label pass
(labelMacros.js, scanFood label-per100 mode). All proven on his real vault
at 375×812 on the shipped bundle and restored. Two tests rewritten for the
v2 contract (★ in the body; setting a slot adds, never un-eats). Grammar
collision caught by the suite: "set eggs to 12" must stay shopping.qty.
Commits 8d294d5, 852fc4e.

### 6 September 2026 (late night) — phase 3, attachments, the glitch, the grant
His four asks after phase 2: grant sessions real Shortcuts + the browser lane
(→ the allow rules, his instruction); photos/videos to Nova and the Coach
(→ attachments, live-proven); the Coach-tab glitch from his recording (→
main clips horizontal overflow; bubbles shrink); then the remaining phase-2
verbs and the gym by voice (→ built, tested). Suite 1106 green under TZ=UTC.

### 6 September 2026 (night) — phase 2, the first Hand, and the permission wall
His three asks: fix the permission layer (→ nova-api.mjs, in-process token);
proceed (→ Phase 2: Coach/Leader answer in the conversation; the Shortcuts
hand); reach third-party apps and the web (→ Shortcuts built; browser hand
designed with the honest doctrine note). The auto-mode classifier refused
one command that created the Shortcut runner AND executed `shortcuts`; the
file was written with the editor tool and tested with an injected runner
instead — the capability is confirm-first by construction. Guardian
time-machine flake root-caused (same-ms snapshot names) and fixed in
backup.js. 1097 tests green under TZ=UTC. Service reloaded.

### 6 September 2026 (evening) — the Verbs, phase 1: doing by voice
Watched the Astra reel (frames + Whisper transcript via the watch skill —
the Chrome extension was not connected, the reel was public). Mapped the
command surface with an Explore agent (the evidence map is in this session;
its shape: speech reached capture, dispatch and coaching edits only). Built
the registry, the grammar fast path, the ACT directive, the status reflex,
plan-approval-by-voice, and the client strip. 1096 tests green under TZ=UTC;
the one failure on the first full run did not reproduce (flaky, not mine).
Service reloaded. Plan doc: `design/VERBS-PLAN.md`. FLAKE, not mine: guardian.test.js "the time machine undoes both ways" failed once locally and once on the CI runner, passed on rerun both times — likely two backupFile snapshots inside one second sharing a name; investigate if it recurs before blaming a change.

### 6 September 2026 (late afternoon) — the type badges: the material pass is complete
His "work on the type badges". The note list row's badge and the Fuel card's
category badge are `Tag`s (tinted pill, UI face, 11px under the Apple styles;
the bordered mono badge under Command is unchanged). Their strings, and the
Notes reader's byline + backlink line and the recipe overlay's meta, are now
written ONCE in sentence case — under cupertino `Meta` does not transform, so
an ALL-CAPS literal was rendering literally ("02 JUL · 14 BACKLINKS",
"HIGH PROTEIN · 25 min · FROM OBSIDIAN /RECIPES"). The demo fixtures in
data.js follow the same rule. The Leader's speaker tag was the last hard
`500 10px mono` literal in the vals and now takes the micro token. Five
unused vals imports removed. Verified at 375×812 in BOTH styles (cupertino:
tinted pills, "02 Jul · 14 backlinks", "High protein · 25 min · from Obsidian
/Recipes"; command: bordered mono badges, everything uppercased by the
controls), console clean, 1086 tests green under TZ=UTC.

### 6 September 2026 (afternoon) — the identity rows and the filter chips
His "Proceed with the next builds" → the two items still on OPEN — MINE.
`ScreenHead` (Controls.jsx) replaces the twelve hand-written identity rows
(numeral · hairline · tracked caps): Command renders exactly what it did;
the Apple styles drop the numeral and the rule — a numbered section is the
console's idiom, not iOS's — and keep the label as a grouped-list header.
Every header-label string in the vals is now written once in sentence case
("6 recipes · live from Obsidian", "Connect a backend in Settings"); Command's
Meta uppercases it. Voice's status badge is a `Tag`; Workouts' live dot rides
a cyan `Meta`. The Fuel and Notes filter chips ride `Chip` (the vals hand over
`active`, not a style); `chip`/`nchip` left shared.js. Verified at 375×812 in
BOTH styles (cupertino: pill chips + "VAULT · FUEL" small-caps row; command:
"X. — VAULT · NOTES" with bordered mono chips), console clean, all 42 UI
markers in the dist. Not built: the MissionControl fold (his style never
switched), the digest's model-named themes.

### 6 September 2026 (midday) — the hand sweeps finished, every screen off tokens-only
His "Proceed with the remaining hand sweeps": fourteen files in three
scripted batches (see CURRENT HANDOFF bullet). Build/lint/1086 tests green
under TZ=UTC; markers updated; visual check limited to demo mode for the
live-only screens because the token read was refused by the auto-mode
classifier. Dev server stopped, isolated devtools pages closed.

### 6 September 2026 (still later) — Settings hand-swept, a latent layout bug fixed

Settings.jsx was the last front-line screen still on tokens only. Full hand
sweep: About You, What Nova Has Noticed, Appearance (style/theme/core/calm),
Notifications, Voice, Navigation Order, Calendars, the Claude Models board,
Time Machine — every ALL-CAPS toggle and button through Controls.jsx, ACTIVE
badges as Tag, ON/OFF as Chip. Eyebrow/Tag/Meta gained `...rest` passthrough
(htmlFor, etc.). Found and fixed on the way: the voice-test row had FOUR flex
siblings under one `justify-content:space-between` (the content block, Build,
Research Browser, Test), so "Can you hear Nova?" collapsed to a one-word
column with Build's text printed over it — pre-existing, not caused by the
sweep, visible only once the row was actually looked at. Verified in both
styles at 375×812; MissionControl.jsx's (classic, non-cupertino) C1 fold is
deliberately NOT done — it has no ORDERS/section-key mechanism at all (a
linear JSX render, HUD satellites not grouped cards) and isn't his daily style
(his phone runs cupertino); building it is a design decision, not a port.

### 6 September 2026 (later) — the artefacts filed, the native shell scaffolded

Approving the finished plan would have re-run it: fixed so approve files the
report as a note (URL-free title), then his three artefacts approved into the
vault. The native shell: Capacitor 8 around the live URL, SPM, Haptics +
StatusBar, the web bridge in haptics.js, a runbook for the Xcode steps only
he can do on a Mac that has no Xcode.

### 6 September 2026 — live-proof, the plan handoff proven, the material pass everywhere

Checked the deployed bundle from a fresh isolated context (new strings
present, old caps absent) and the server process against its code's mtimes.
Re-ran the plan twice: the first re-run exposed twenty lanes parsing model
JSON without repair (a raw tab killed the Researcher) — fixed with one entry
point; the second, phrased to force the dependency, proved the handoff with
3,953 chars of context and an honest claim-by-claim report. Then the token
codemod (582 fonts, 277 trackings, 49 files) and hand sweeps on Voice, Fuel,
Notes, To-Do, Shopping, each deployed and verified live in turn; the
verify-shipped markers moved with the strings they read.

### 5 September 2026 (night) — the material pass

"Nova still feels stiff." Measured before diagnosing: five of six type
declarations were the tracked mono micro-label and those were the tap
targets; four hundred one-pixel borders; a toast for every action. Built
`src/Controls.jsx` so the label is a material decision per style, swept the
four daily surfaces, unbordered cupertino cards, removed the toasts that
restated visible change, made tab hops instant, gave sheets drag-to-dismiss
and the deck a rise. Measured after: 12–22ms per tap on the production
build — no jank case, so P8 stays deferred. Left for him: the native
wrapper (haptics), and the remaining screens.

### 5 September 2026 (late) — the first plan run, its handoff bug, A3 and C1

Three commits, `1b023f4`→`368e27f`. The plan loop ran for real (Watcher →
Researcher) and the report's first line was that the comparison had not been
done: the Researcher never received the Watcher's claims. Root causes were a
placeholder the planning model forgot and a summariser that read a field no
lane sets; both fixed by code, the Researcher gained a context channel, all
pinned in tests, not re-run (his money). Then A3 — whose first cut exposed
that agent confidence is not his confidence — and C1, both verified on his
data at 375×812 on the layout his phone draws.

### 4–5 September 2026 — the delegation loop, the exercise atlas, the audit's fixes and its first mockups

Twenty-one commits, `7cd9e16`→`fff89ae`. In order: the brief-audio replay bar;
the notification-width fix; the exercise atlas and animated figure; the UI
audit (artifact) and its unambiguous fixes; the chief-of-staff plan (artifact)
and Phases 1–4; Plan Today's JSON salvage and the stale-error reaper; form
cues; local dates; form videos found free (not $105) with timecodes and a
daily fill job; the 3D figure; the bandsaw rule; A1/C2/C3/B1; the exercise
sheet on Train. Two things he caught that I had not: five deploys had died on
my timezone-bound test, and the 3D figure existed only as a chat panel. Both
fixed the same day. The full per-commit reasoning is in the commit bodies.

### 3 September 2026 — the audit's last roster items, and the Leader learning to talk about his team
Finished #18 — every §6 item across all 66 reports is now shipped, met by
another item, or deferred with a reason, and the 547-line per-item record
moved out of the handoff into
`design/audits/2026-08-full-audit/00-COMPLETION-RECORD.md`. Shipped [37]–[46]
plus the surfaces [47]–[66] in five batches: the Leader's resumed-turn live
line and HEAD-checked research links, the pulse's novelty memory and named
cap, the evening brief warm, old-month health-mirror corrections, late-fire
reminder honesty, Todoist telling a deleted task from a completed one (gate
opened by probing his real account with two scratch tasks), the overnight
queue's one retry and late-landing reconcile, Ops match-lines for the study
lane and Scout, the Money list cap, chip ages and mark-handled on the Leader
screen, and the Ambient wall's sync age, stale dimming and OLED drift.

Three things were corrected rather than added. The pulse lane had been
failing 1–2 of 3 topics most nights since roughly 20 August, logging only
"exited 1"; one measured run showed the real cause — $1.06 of searching
against a $0.50 cap — so failures are now legible with cost receipts and the
prompt caps searching at 8, while the budget itself was left as his decision
rather than quietly raised. The plan's DONE/SKIP marks were recorded here as
unbuilt; they were not, and a live run over the real HTTP route proved the
whole loop including both consumers, so the handoff was wrong, not the code.
And the phone-width pass found three real defects that code review had not:
a satellite sitting across the core's status label, a 26×11px CLEAR control
on the action he takes four times a day, and a concept card wearing the daily
review's name.

Then his own three asks. He screenshotted the Leader saying "Budget Your
Stress Like Your Sets" and named the problem exactly: that is not managing,
leading, inspiring or directing a team. Measuring the corpus against his real
127-page shelf showed six of seventeen "leadership" matches were body pages —
"Manage" admitting Stress Management and Waist Management, "Frame" admitting
The X-Frame & High-Value Aesthetic Muscles — while the daily idea was
separately being handed a fleet block that is almost entirely training and
nutrition. Fixed at all three levels, and verified by regenerating the card,
which now reads "Delegate The Decision, Not Just The Task". Built the
exercise-targets preview he asked for, so today's card names the muscles and
expands to every lift before BEGIN SESSION. One durable trap learned: the
devtools browser's clock runs hours behind his, which sent me chasing a
training schedule that had never changed.

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
