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
*Last updated: 16 August 2026*

**GOAL:** Keep Nova the one app Hayden opens daily. This session ran on two
threads he opened himself: an Instagram reel he loved (dispatching agents
from an Apple Watch, live status in the Mac's notch) → a plan plus its first
phase built; and a complaint that mattered more than the reel — *"the
shortcuts for ask and tell nova take time and I hate how long the wait is…
it defeats the purpose of trying to use nova for everything."* That became
a latency fix, then a three-round bug hunt on the spoken lane in which **the
first two diagnoses were wrong** (see DO NOT). **The video-pipeline and
health/Shortcuts builds below are unchanged from earlier closes** except
where marked.

**DONE CRITERIA (rolling):**
1. Overnight health push lands automatically — **MET, first real run
   confirmed 13 Aug.** iOS encrypts Health data while the phone is locked,
   so the 00:05 automation used to die at its first query on any night he
   was actually asleep. Fix: **Nova Health Morning**, cloned from his
   working automation's iCloud share link with the date token replaced by
   the literal `yesterday`, triggered by Automation → When Alarm is
   Stopped. Fired once, cleanly, at 07:25 local — filed the full 8-metric
   payload against 12 Aug, `stepsComplete: true`, no errors/drops/dupes.
   Residual: Nova's 10,022 vs Apple Health's own 10,139 (~1.1%, the
   per-device-MAX fold's known, honest approximation) — see the
   steps-parity thread below, now on hold.
2. Nova usable on the phone while the Mac sleeps — **met** for
   reads/queued writes; **unmet** for live conversation.
3. Companion plan Phases 1–5 shipped — **met**. Phase 6 (native wrapper)
   still parked.
4. Menu-bar Nova visible on his Mac — **blocked** (icon under the notch).
5. Live walkthrough of everything built — **unmet**, owed 5+ sessions.
6. Hands-free Siri capture + answers — **met again, after breaking.** It was
   broken for days by his Shortcut sending the literal words "Provided
   Input" (the variable NAME, not its value). He rebound the variable on 16
   Aug and it works: real question in, right answer out (locator in
   VERIFIED). **Speed still unmet on the cold path — 19.7s on that run.**
7. Produce-vs-keep corrected — **partially**: machinery ships, the 3
   trust-ladder proposals are still unapproved. **Worse this close: 60
   pending, up from 45.**
8. **Nova can watch a video and keep what matters — met, end to end,
   with his real 4-hour podcast in the vault.**
9. **Nova can BUILD something from one spoken sentence — met on the server
   side** (the Forge, verified with a real game). **Unmet from his wrist:**
   the dispatching Shortcut is not built yet.
10. Live agent status on the Mac (the notch HUD) — **unmet**, planned only.

**STATE (what exists, where):**

*The spoken lane — rebuilt for speed this close:*
- **One conversation, resumed** (`server/lib/spokenSession.js`). `/ask/sync`
  used to mint a NEW conversation per ask, paying all three expensive things
  at once: context assembly (~2.5s; `buildAskContext` returns `''` for a
  resumed session), a cold CLI boot (~2.2s; the warm pool is keyed by
  session id, so a fresh id could never hit it), and prompt-cache CREATION
  on ~18k tokens. Now: fresh session on a new local day / after 20 min /
  after 12 turns, resumed otherwise; `dropSpokenSession()` on any error so a
  dead process is never `--resume`d.
- **Freshness on resumed turns** — `todayLocalContext()` (now exported from
  `askContext.js`) re-states steps/HRV/fuel/inbox **and weight** from local
  files on every resumed turn, prepended by `buildResumedAsk()` in
  `claudeCode.js` along with a one-shot reminder for the hands-free lane.
- **`prewarmAsk(cwd, sessionId)`** (`claudeCode.js`) — boots the CLI while
  context assembles instead of after it. Booting makes no API call, so the
  overlap is free.
- **`startAskNova` takes an explicit `resume` flag** — a caller that mints
  its own session id (the spoken lane must, to record it before the turn)
  can say whether this turn opens or continues. Omitted, the old rule holds.
- **Keepalive starts at 20s, not 0s** (`routes/voice.js`) — the drip that
  keeps iOS from dropping a silent request corrupts the body it precedes.
- **The spoken lane is now instrumented**: every ask receipts timing, which
  session, the question, and the reply; a rejected one receipts the RAW
  BODY. `/ask/sync` also accepts `question|text|prompt|input|q`, a raw
  text/plain body, and JSON sent as a text File, and refuses known Shortcuts
  variable NAMES (`PLACEHOLDER_QUESTIONS`) with a spoken instruction.

*The Forge — Nova's build department (new this close):*
- `server/lib/forge.js` + routes in `routes/inbox.js`: `POST /api/forge`
  (answers in ~60ms so a wrist Shortcut gets an instant ack),
  `POST /api/forge/:id/stop`, `GET /api/forge`, `GET /api/forge/:id/proof`.
- Runs the `claude` CLI with Bash **inside `~/NovaForge/<slug>-<id>/`**
  (`NOVA_FORGE_DIR` overrides). The DIRECTORY is the containment, not the
  toolset: no vault writes, output is disposable derived data.
- Live status rides the existing inbox rails — `forgeStatus` on the record
  ("Writing index.html", "Running npm install") via `readStreamEvent` +
  `describeToolUse`, so agent lights and SSE already carry it everywhere.
- Receipts persist to `server/data/forge/<id>.json` (Distiller pattern).
  Built jobs land **pending**, never filed. `approveRecord` has a
  `forge-job` branch — these carry no `decision`, so the normal path would
  throw on approval.
- Telegram announces **built, stopped AND failed** (`composeForgeAnnouncement`);
  `forge-job` is in telegram's `ANNOUNCE_SKIP_KINDS` so it announces once.
  Failures matter most: an `error` record notifies nobody through the rails.
- Ops roster: `forge`, department **Platform** (there is no "Build"
  department; the ops test enforces names against the skills seed).

*The plan this session came from:* `design/WRIST-PLAN.md` — Phases 0–4,
with as-built notes. Phase 0 answered (Ask Nova does run from his watch),
Phase 1 built, Phase 1b (latency) done, Phases 2–4 open.

*The video pipeline (earlier close):*
- **The Watcher** (`server/lib/watcher.js`) — the quick lane. Video URL →
  local transcript via the watch-skill scripts (resolved newest-version
  from `~/.claude/plugins/cache/claude-video/watch/`; `NOVA_WATCH_DIR`
  overrides; brew python preferred, `/opt/homebrew/bin` on the spawn PATH
  for launchd) → one judgment pass → **pending record, route
  `watch-note`**. Two lanes chosen by the model: `coach` (claims audited
  against the web) or `reference` (distilled with timestamps + wikilinks).
  Triggers: Inbox **▶ WATCH**, `POST /api/video`, or a `WATCH {...}`
  directive in an Ask Nova reply. Retryable; Ops conversational agent
  `watcher` (Knowledge+Train).
- **Approving a watch** writes his own podcast convention (`inbox.js`
  `watch-note` filer): `Wiki/Sources/<Title>.md` (`type: source`, `url:`,
  `raw:` link, `training` tag on the coach lane) **plus**
  `Raw/<Title> (Transcript).md` verbatim. Undo drift-checks BOTH files
  before touching either. Transcript persisted at
  `server/data/watch/<recordId>.txt` so filing never depends on a tmp dir.
- **The deep weave** (`server/lib/ingest.js`) — the full second-brain
  lane. A bare video link (no pasted text) is enough: it fetches the
  transcript itself, then the vault-`CLAUDE.md`-governed pass drafts
  Source/Concept/Entity/Topic pages for one review. Surfaces: Inbox
  **▶▶ WATCH + ANALYSE**, the **Deep weave** button on any watch record
  (pending or filed), or Add-to-vault with only a URL.
- **Long-video digest** (`digestTranscript` / `digestTranscriptCached` in
  watcher.js): transcripts over `SINGLE_PASS_MAX_CHARS` (150k) split into
  `CHUNK_CHARS` (60k) chunks, extracted **on Sonnet** at $1.00/chunk cap,
  concurrency 3, contract = exhaustive ("anything you omit is LOST",
  chapter-aware). Notes cached at `server/data/watch/<videoId>-notes.md`
  so a retry never re-pays. Chunk passes return **plain markdown**
  (`stripPreamble`); the judgment pass keeps JSON with
  `repairJsonControlChars`. Digested weaves also run on Sonnet.
- **Anti-duplication** — `videoIdOf` + `findExistingVideoPages`
  (ingest.js) match on VIDEO ID, so `?si=` tails and youtu.be vs watch?v=
  are one identity. Re-running reuses the existing Raw/ transcript and
  instructs the model to EDIT existing pages; the watch-note filer
  refuses a second Source page for the same video.
- **Ingest jobs persist** to `server/data/ingest/<id>.json` (Distiller
  pattern) — a ready job carries its full change set, so approval needs
  neither the process nor the tmp staging tree.
- **Brain Week** (`server/lib/brainWeek.js`) — Sunday 16:00 scheduled
  agent (`brain-week`, dept Knowledge): deterministic walk of the
  knowledge folders by `created` date → grouped wikilinked digest →
  pending journal draft. Manual `POST /api/brain-week/run`. Expires after
  8 days.
- **Inbox tap-to-expand** (`fullPayload` in `valsInbox.js`,
  `inboxExpanded` map in App) — every item, pending and history, opens to
  YOU CAPTURED / WILL BE FILED with the complete route-aware payload.
- **Honest agent lights** (`valsChrome.js`) — sidebar dots also pulse
  from ANY `classifying` record on the rails, so server-side work shows
  on every device; Watcher is on the AGENTS roster (VIDEO); hover names
  the in-flight job.
- **Whisper** — his Groq key lives in `~/.config/watch/.env` (0600).

*The health/Shortcuts thread (the concurrent session's build, verified by
its author at this close):*
- **One ingest gate** — `ingestHealthPayload` (`lib/healthData.js`) is the
  single path for BOTH channels (URL route + drops folder): metric fold,
  midnight date-shift, monotonic-steps guard, receipts. It also resolves
  the literal words `yesterday`/`today` as dates, so a morning Shortcut
  needs no Adjust Date actions.
- **Monotonic steps now covers TODAY too** (`shouldDropLowerReading`, was
  `shouldDropLowerSteps`) — the rule used to exempt the current day, and on
  11 Aug a push reporting 813 overwrote a genuine 11,107 one minute later.
  Manual corrections still bypass it (his edit is the last word).
- **THIS CLOSE: the guard now covers every accumulator, not just steps**
  (`ACCUMULATOR_METRICS` in `lib/healthData.js`: steps, activeEnergyKcal,
  walkingRunningDistanceKm, sleepAsleepMinutes, sleepInBedMinutes) — a
  lower later reading of any of them is a truncated/stale one, dropped the
  same way a truncated steps reading always was. Point-in-time metrics
  (restingHeartRate, hrv, vo2Max, weightKg) are deliberately NOT in this
  set — a later reading of those is simply more current regardless of
  direction, so they keep overwriting freely. `ingestHealthPayload` returns
  `droppedKeys` (list) alongside the existing `stepsDropped` (bool, kept
  for compatibility).
- **`stepsComplete` is a fact about the clock, not the author** — a manual
  correction is AUTHORITATIVE but a same-day one is still a partial.
- **The sentinel shouts at stale days, not just missing ones**
  (`healthSentinel.js`) — nudges when yesterday's file is absent OR its
  steps never closed, names the stale figure, and states the cause from
  EVIDENCE (`serverWasAwakeAtMidnight` reads the request log's midnight
  window: "the Mac was up, the push never left the phone" only when
  provable).
- **Nova Health Morning** — `nova-health-morning-v6-unsigned.shortcut` in
  the session scratchpad; imported into his library and synced. It is his
  own 47-action automation, byte-identical except the date token
  (→ `yesterday`) and the drop filename (`morning-push.json`).
- **Second drops folder** — the scanner also drains
  `iCloud Drive/Shortcuts/Health Drops` (an automated Save File cannot
  reach the Obsidian container; only the picker can).
- Recipes and hard-won lessons: `design/SIRI-SETUP.md` §3–§4.
- **THIS CLOSE, THIRD CHANNEL — BUILT BUT ON HOLD: Health Auto Export
  adapter** (`server/lib/autoExport.js`, route `POST
  /api/health-data/auto-export` in `routes/healthData.js`). Exists to close
  the residual ~1% steps gap between Nova's per-device MAX fold and Apple
  Health's own figure (10,139 Health vs 10,022 Nova on 12 Aug) — that gap
  is Nova's honest, already-documented approximation, not a bug; a real
  fix needs Apple's own cross-source dedup (`HKStatisticsQuery`), which
  only a real HealthKit-entitled app can call, not a Shortcut. Parses the
  app's published JSON export schema defensively (unrecognized metric
  names/units dropped with a warning, never guessed); feeds each day
  through the SAME `ingestHealthPayload` gate via a new independent
  `skipDateShift` option (dates here are already real per-sample calendar
  dates, so the midnight-shift heuristic doesn't apply, but the monotonic
  guard still should). Live-tested against the running server with a
  synthetic payload — **never against a real export from the app**.
  **BLOCKED: the app wants a paid subscription; he declined to buy it for
  now.** Nothing to do until he revisits this — see OPEN QUESTIONS.

*Standing from earlier sessions:* fleet ring in `server/lib/ops.js`;
hands-free `design/SIRI-SETUP.md`; reminders via CalDAV; trust ladder
(`autonomyLedger.js`); distiller (`distill.js`); About You interview; Ops
tap-through; server binds the tailnet IP directly; request receipts in
`~/Library/Logs/nova-os-server.log`.

**DECISIONS (choice → reason → what it forecloses):**
- **Two lanes, not one** (quick WATCH vs WATCH + ANALYSE) → triage is
  cheap (~$0.50) and absorption is not (~$6 for 4 hours), and he should
  not pay absorption prices to find out a video is filler → forecloses a
  single "just do the right thing" button; he picks, or taps Deep weave
  after reading the verdict.
- **Extraction runs on Sonnet, judgment/weave too when digested** →
  measured: a 150k chunk on the default (Opus) model cost $1.46 and died
  at a $0.75 cap having written 218 tokens; 60k on Sonnet costs $0.35 and
  returns ~7k tokens of dense notes → forecloses Opus-grade nuance in the
  notes; the exhaustiveness contract + verbatim dip-ins compensate.
- **Chunk notes are plain markdown, not JSON** → a 2000-word payload in a
  JSON string is one stray newline from losing a 4-hour digest (it
  happened) → forecloses structured per-chunk metadata; the notes carry
  their own headings instead.
- **Digest notes cached per video id, transcripts per record id** →
  extraction is the expensive, deterministic-input stage → forecloses
  automatic invalidation if a video's captions are later corrected; delete
  the cache file to force a re-extract.
- **The verbatim transcript never enters a Wiki page** (paraphrase only,
  full text in `Raw/`) → the vault's own CLAUDE.md rule 11 → forecloses
  quoting at length in concept pages.
- **A watch never files itself** (always pending, like the Researcher) →
  external content is not his words → forecloses hands-free "watch and
  file"; the Inbox tap is the gate.
- **Ingest jobs persist but are never resumed** → a dead mid-flight job's
  child process is gone and cannot be reattached → forecloses resume;
  the cached digest is what makes the re-run cheap instead.
- **Health reads move to alarm-stop, not a fixed evening time** → his
  bedtime varies, so any fixed evening hour truncates the day by an
  unpredictable amount, and he needs accurate totals → forecloses a
  same-night figure on nights he sleeps early; the 00:05 automation stays
  for late nights and the monotonic rule makes the pair converge upward.
- **Clone shortcuts, never author them** → six hand-authored attempts
  failed on Shortcuts' own serialization (see DO NOT) while a clone of his
  working automation worked first time → forecloses generating novel
  Shortcut logic from scratch; new capability starts from a shared link.
- **The URL push is the primary channel; the drops file is opportunistic**
  → his phone demonstrably does not upload Shortcuts-saved files to iCloud
  (two files, 6+ minutes, never arrived) → forecloses relying on
  store-and-forward for correctness.
- **THIS CLOSE — generalize the monotonic guard to every accumulator, not
  just steps** → re-verifying the previous handoff found today's health
  file carrying 11 Aug's `activeEnergyKcal` (819 kcal),
  `walkingRunningDistanceKm` (15 km), `restingHeartRate`, `hrv`, and
  `vo2Max` against only 163 real steps. Cause: a drill push during the
  health thread's own testing used the literal date `2026-08-12` (meant
  `yesterday`) and landed as the day's FIRST push, so even the steps guard
  had nothing to compare against — and the other accumulators had no guard
  at ALL, guarded or not, so they wrote straight through → forecloses a
  second push ever silently downgrading a better accumulator reading to a
  worse one. Does **not** foreclose — and cannot prevent — a bad first push
  for a brand-new day; that is a data-entry bug (wrong date token), not a
  gap this guard closes.
- **A real app, not a Shortcut, for the deduped steps total** → Apple's own
  developer forums confirm the cross-source dedup the Health app shows is
  only available via `HKStatisticsQuery`/`HKStatisticsCollectionQuery`, a
  native HealthKit API; manually merging raw samples yourself (which is all
  a Shortcut can do) "is unlikely to match HealthKit's merge algorithm
  correctly" — and this project already proved that the hard way (dropping
  the Source filter double-counted) → forecloses closing this specific gap
  from Shortcuts at all, however cleverly configured; it needs an app with
  real entitlements. **Chosen app (Health Auto Export) wants a paid
  subscription; he declined to buy it for now** → forecloses any further
  work on this thread until he revisits it — see OPEN QUESTIONS. The
  server-side adapter is already built and waiting, so restarting costs him
  only the app + one real export to compare, not a new build.
- **The spoken lane reuses ONE conversation instead of minting per ask** →
  measured: minting paid context assembly + cold boot + cache creation every
  time, for 14.2s on a question whose answer was already in the injected
  context → forecloses a guaranteed-fresh full context on every ask; the
  day/age/turn caps plus a local-files live line are what keep it honest
  instead.
- **Freshness is re-stated per turn rather than the session being short** →
  a short session would just reintroduce the cost this fixed → forecloses
  slower-moving context (calendar brief, debrief, money) being current
  mid-session; only the volatile numbers are refreshed.
- **The keepalive drip starts at 20s instead of immediately** → it corrupts
  the body it precedes, and answers are now fast enough that almost nothing
  needs it → forecloses protection for a 20s+ request, where a live
  connection with a stray space still beats a dropped one.
- **A broken spoken request answers 200 with SPOKEN text, never a bare 400**
  → a 400 makes Siri say "I can't help with that", which describes nothing
  and sent this hunt down the wrong path twice → forecloses correct HTTP
  semantics on that route; the caller is a voice assistant, not a client
  that reads status codes.
- **The Forge's containment is its DIRECTORY, not its toolset** → it needs
  real Bash to build anything, and `--allowedTools` is documentation only
  under bypassPermissions (verified empirically, see claudeCode.js) →
  forecloses fine-grained per-tool policy inside a job; the sandbox dir and
  the disallowed list are the boundary.
- **Forge output is disposable derived data, never vault truth** → a built
  artifact is not knowledge and has nothing to undo → forecloses undo for
  forge jobs; approve means "I'm keeping this", and discard leaves the
  directory on disk rather than destroying files he can see.
- **Forge budget cap $4.00, set AFTER measuring $0.90** → the DO NOT about
  unmeasured caps → forecloses cheap failure on a big job; it errs high
  because a killed job wastes the entire run.
- *(Standing: tailnet IP direct; fast spoken context; 90s calendar cache;
  autonomy proposed never applied; distillation refuses wholesale on
  drift; "I ate dinner" marks the planned meal.)*

**VERIFIED (16 Aug close, re-run at this close, with locators):**
- Gates, just now: `npm run lint` **0 errors**; `npm run build` green
  (`dist/sw.js` emitted); `cd server && npm test` **312 pass / 0 fail**;
  `git status --porcelain` **empty**; `HEAD == origin/main` at `b12a417`;
  `curl localhost:4173/api/health` → **200**; `com.novaos.server` loaded;
  no `vite preview`; `dist/pc.json` absent.
- **His Shortcut works again, from his phone** — the decisive log line:
  `ask/sync 12770ms session=fresh (aged-out) q="What was my step count
  yesterday?" reply=32ch "8,538 steps on August 15th, sir."` /
  `req 2026-08-16T12:43:29.921Z POST /api/ask/sync ← 100.77.255.37 → 200 in
  19676ms`. A real dictated question arrived and the right answer went back.
- **The cause of the outage is proven from the wire, not inferred**:
  `ask/sync REJECTED: variable name sent as the question.
  raw="{\"question\":\"Provided Input\"}"` — the Shortcut had been sending
  the variable's NAME. His screenshot showed the same thing (the JSON body
  row rendered as plain text, not a variable chip).
- **Latency, measured live on the same question**: 14.2s before → **11.5s
  cold / 2.1–2.2s resumed** after. Receipts in the log
  (`ask/sync 2078ms session=resumed turn 3`, etc.).
- **The keepalive corruption was reproduced and fixed against the bytes**:
  `od -c` on a slow response showed four leading spaces before `{"text"`;
  after the change the same slow path starts at `{`.
- **The Forge built something real**: record `4cbfed90`, receipt
  `server/data/forge/4cbfed90.json` — `state: built`, **$0.90**, 3m32s,
  artifact `~/NovaForge/build-a-retro-aesthetic-snake-game-that--4cbfed90/
  index.html` (22,357 bytes, canvas + AudioContext + localStorage high
  score, structurally inspected). Stop verified separately on job
  `b5d158d7`: reported "stopped by you", not a crash.
- Live counts now: **230 records, 60 pending**; forge records `4cbfed90`
  pending, `b5d158d7` discarded.

**VERIFIED (12 Aug afternoon close, with locators):**
- Gates re-run cold, by a second route (not by re-reading the previous
  handoff): `git status --porcelain` **empty**, `HEAD == origin/main` at
  `6b8751b`; `com.novaos.server` loaded (`launchctl list`) and
  `curl localhost:4173/api/health` → **200**; `cd server && npm test` →
  **287 pass / 0 fail** (285 baseline + 2 new for the generalized guard);
  `npm run lint` **0 errors** (warnings only, same set as before); `npm run
  build` green; no stray `vite preview`; `dist/pc.json` absent.
- **13 Aug, same-day follow-on (auto-export adapter)**: gates re-run again
  at `84cadb5` — `cd server && npm test` **294 pass / 0 fail** (287 + 7 new
  for `lib/autoExport.js` and the `skipDateShift` option); lint/build
  unchanged/clean; `git status --porcelain` empty; server reloaded and
  `curl localhost:4173/api/health` → 200. The new route verified live
  (not just unit tests) with a synthetic Health-Auto-Export-shaped payload
  on a scratch date: 9.7 mi correctly became 15.61 km, an unrecognized
  metric name was flagged and dropped rather than stored. Scratch data
  removed after.
- **The alarm-stop trigger fired for real, 13 Aug 07:25 local** — the
  whole point of the fix, confirmed: exactly one pushlog entry
  (`2026-08-12T21:25:12Z` UTC), `"date":"yesterday"` resolved correctly to
  `2026-08-12`, full 8-metric payload, `steps: 10022, stepsComplete: true`.
  No errors, no drops, no duplicate pushes. Sentinel `lastNudgeDay` still
  `2026-08-11` (correctly quiet — the push landed before its 09:00 check).
- Inbox and pushlog checked directly against the JSON files on disk
  (`server/data/inbox.json`, `server/data/health/pushlog.json`) rather than
  the API, which needs a bearer token and returns `{"error":"unauthorized"}`
  that silently parses as empty if the caller doesn't check `.error` first
  (see DO NOT): **192 records / 45 pending**, unchanged from the prior
  close; pushlog held 50 attempts, newest `2026-08-12T02:42:28Z` (the
  163-step manual correction).
- **The stale-metrics bug reconstructed from the pushlog, not guessed**:
  the entry at `2026-08-12T00:05:20Z` carries `"date":"2026-08-12"` with
  `activeEnergyKcal:819.379`, `walkingRunningDistanceKm:15.0984…` — figures
  matching 11 Aug's real numbers — and it was the day's FIRST push, so
  `existing` was `null` and no guard fired for any field.
- **The generalized guard verified live against the running server**, not
  just unit tests: POST'd a higher `activeEnergyKcal`/
  `walkingRunningDistanceKm`/`hrv` for a scratch date (2019-06-15), then a
  lower set of all three. Result: the two accumulators were refused (held
  at 900 kcal / 18 km) while `hrv` overwrote to the lower, later figure
  (55) — exactly the intended split. Scratch day and its pushlog entries
  removed after.
- `server/data/health/2026-08-12.json` repaired by hand: the five stale
  11-Aug-shaped fields removed; `steps: 163` and `weightKg: 82.7` (his own
  manual push) kept. Confirmed unaffected by the subsequent
  `launchctl kickstart -k gui/501/com.novaos.server`.
- Pages deploy: `gh run list` → last runs completed/success (unchanged,
  not re-checked this close).

*The health/Shortcuts thread:*
- **The locked-phone cause is PROVEN, not inferred**: he fired the
  automation with the phone locked while the Mac was awake and serving
  (278 requests logged in the 00:00–00:15 window) — **nothing arrived on
  either channel**. Every historical midnight success (3, 4, 7, 10 Aug)
  was a night the phone was in use; the first-ever success ran at 23:45,
  awake.
- **Nova Health Morning works end to end** — its run filed the full
  8-metric payload against **2026-08-11**: `steps 9,626 · watchSteps 9,985
  · RHR 61 · HRV 60.4 · energy 819.4 kcal · distance 15.3 km · weight 82.7
  · VO₂ 48.5` (pushlog `2026-08-12T02:17:03Z`).
- **The guards fired correctly on real data**: the MAX fold took 9,985,
  found his stored 10,218 higher, and dropped the incoming figure while
  every other metric repaired 11 Aug's midday partials (28 kcal → 819;
  0.17 km → 15.3). A deliberately-lower 813 was refused with the honest
  note; a higher reading was accepted.
- **The drops channel drains and is guarded** — a test drop written to the
  real `iCloud Drive/Shortcuts/Health Drops` was consumed within the 2-min
  tick, refused by the monotonic guard, archived to `Processed/`, and
  receipted `source:"drop", stepsDropped:true`.
- **`stepsComplete` honesty fixed and re-stamped**: today's file now reads
  `steps 163, stepsComplete false` (was `true` from a manual same-day
  correction, which would have silenced tomorrow's sentinel).
- Health day files: **11 Aug complete** (10,218 steps, all metrics);
  12 Aug open (163, partial). Sentinel state `lastNudgeDay: 2026-08-11`.
- My work survives the concurrent commits — grepped in `git show HEAD:`:
  `watcher.js::digestTranscriptCached`, `ingest.js::persistJob` (×6),
  `brainWeek.js::composeBrainWeek`, `valsInbox.js::fullPayload`,
  `Inbox.jsx::WILL BE FILED`, `ops.js::watcher`.
- **The Hormozi weave is IN THE VAULT**: 41 changes applied with backups;
  `Wiki/Concepts/` now holds **52** files including *You're Not Behind
  You're Early*, *Tragedy Plus Time*, *Undeniable Proof*;
  `Wiki/Sources/33 Brutal Truths (…).md` and
  `Raw/33 Brutal Truths (…) (Transcript).md` both exist.
  Recall indexed it: `GET /api/recall?q=lonely chapter` returns
  *The Lonely Chapter*.
- Caches on disk: `server/data/watch/bbc39448.txt` (575,807 bytes),
  `server/data/watch/-AdkwqkE20M-notes.md` (168,675 bytes).
  `server/data/ingest/` is empty — correct, every job settled.
- Job persistence drilled for real: fabricated ready job → **actual
  `launchctl kickstart`** → recovered over HTTP with changes intact →
  discarded clean, file removed.
- Live records now: 192 total, **45 pending**; `bbc39448` video **filed**;
  `8ba46f76` video **undone** (the old Wiki/Inbox-format filing);
  `775ade9d` IHA coach verdict **pending**; `d7d16872` Brain Week
  **pending**.
- Measured costs (CLI `total_cost_usd`): 150k chunk on default model
  **$1.46** (killed at $0.75); 60k chunk on Sonnet **$0.35**; digested
  weave on Opus **$8.15** (killed at $8); the same weave on Sonnet
  **$6.11** with 37 staged changes.
- Groq key authenticates: `GET api.groq.com/openai/v1/models` → 200;
  `setup.py --json` → `status: ready`, `whisper_backend: groq`.

**ASSUMED (treat as open):**
- **That the Whisper fallback actually transcribes.** The key
  authenticates; no captionless video has ever been run through it.
- **That the weave's page content is good.** I read the change LIST and
  spot-checked frontmatter on one page — the 41 files' prose was NOT
  reviewed. Backups exist for every overwrite.
- That the exhaustiveness contract genuinely loses nothing. The notes are
  dense and chapter-aware, but no one diffed transcript against notes to
  prove coverage.
- That Brain Week's Sunday tick fires on schedule — only the manual
  `POST /api/brain-week/run` has ever run.
- That the tap-to-expand UI renders correctly on his phone — built and
  deployed, never seen on screen by me.
- That WATCH + ANALYSE works from the app UI. Every deep weave this
  session was started via `POST /api/ingest` from the shell; the button
  wiring is only inspected, not exercised.
- That a rolling "last 1 day" window at alarm-stop is an honest stand-in
  for yesterday's calendar day. Confirmed once (13 Aug: steps landed close
  to Health's own figure, ~1.1% off — see the steps-parity thread) but
  n=1; worth another look after a few more mornings.
- That his phone's iCloud upload stall is confined to the Shortcuts
  folder — never diagnosed, only observed twice.
- **The entire Health Auto Export adapter (`lib/autoExport.js`) is
  unverified against reality.** Written from the app's published wiki
  schema, live-tested only with data I fabricated to match my own reading
  of that schema. The metric name strings, unit strings, and — the whole
  premise — whether "Summarize Data: ON" truly triggers HealthKit's proper
  cross-source aggregation rather than the app's own manual sum, are all
  assumptions. Untestable until he installs the app and it's moot until he
  decides to.
- **That Siri actually SPOKE the 16 Aug answer.** The server returned the
  right text in 19.7s and he has not said what he heard. The whole outage
  was "server fine, phone silent", so a 200 is not proof he was answered.
- **That the 20s keepalive threshold is right.** Chosen against a DO NOT
  saying iOS drops silent requests past ~25s. The 19.7s run sat just under
  it, so the drip has never actually fired since the change — the >20s path
  is untested.
- **That the Forge's game runs.** Verified structurally and by the job's own
  smoke tests; never rendered. The browser extension cannot open `file://`
  and a local static server failed to bind under the sandbox.
- **That the proof screenshot works at all.** It has only ever returned its
  honest "Screen Recording permission may be needed" note; the capture path
  has never once produced an image.
- **That a forge job survives a server restart sensibly.** `launchctl
  kickstart` during a run was never tested; the boot reaper flips
  `classifying` records to error, which would mark a job failed while its
  child may still be running.
- **That `--model` works on a forge job.** The parameter is plumbed and
  never exercised.
- (Standing: autonomy proposals reducing noise; distiller link choices;
  food-slot path from the phone; Scriptable widget; About You invite.)

**OPEN QUESTIONS / BLOCKERS:**
- **60 pending records, up from 45 four days ago** — the produce-vs-keep
  problem is getting measurably worse, not better, and this close added to
  it (a forge record now sits in there too). The trust ladder was built for
  exactly this and its 3 proposals are still unapproved.
- **The cold spoken ask is still slow: 19.7s on his real run.** That is
  under the 20s drip and the ~25s iOS cutoff, but not by much, and a slower
  vault or calendar could push a real ask over both. The remaining cost is
  model time on a fresh ~18k-token prompt plus ~7s of context assembly on a
  cold vault — not fixed, just no longer the dominant cost on repeat asks.
- **Nothing dispatches the Forge from his wrist yet.** The server side is
  done and the Shortcut is not built — so the feature he actually asked for
  (build something from the watch) is not usable by him today.
- **The live walkthrough — 5+ sessions owed.** Now overdue enough that he
  has features he has never seen (Deep weave, Brain Week, tap-to-expand).
- Whether he wants the deep weave to run automatically for trusted
  channels (his phrasing: "less friction, less to remember").
- About You is still empty; every agent reasons without it.
- **The alarm-stop trigger is added but unrun** — tomorrow morning is the
  first real observation. If nothing lands, check the request log and the
  09:00 sentinel's Telegram before assuming the trigger itself is broken.
- **His phone does not upload Shortcuts-saved files to iCloud.** Two files
  (`midnight-push.json`, a shared `.shortcut`) never arrived after 6+
  minutes, while the Mac's iCloud was idle with zero backlog. The URL
  channel carries everything; this is only a lost redundancy.
- **ElevenLabs is still not configured** (`server/.env` has no
  `ELEVENLABS_API_KEY`), so Nova speaks with the system voice — and the
  audio-reactive core and waveform cannot animate, because there is no
  measurable audio stream. He was asked for the key and hasn't added it.
- MacBook often on battery overnight — any night is unreliable regardless.
- **Steps-parity thread is ON HOLD — he won't pay for Health Auto Export
  right now.** The server-side adapter (`lib/autoExport.js` + `POST
  /api/health-data/auto-export`) is built, gate-clean, and live-tested with
  synthetic data, but has never seen a real payload from the app and
  nothing about it can be confirmed until he does. **Come back to this
  when he raises it again** — do not re-propose it unprompted; he made a
  cost call, not a "not now, ask me later" one. When he does: get one real
  export from the app, compare the route's response and the day file
  against what Apple Health itself shows for the same day, and expect to
  fix at least the metric-name/unit-string guesses in `lib/autoExport.js`
  against whatever the app actually sent.

**NEXT ACTION (spoken lane — ask him one question before building
anything):** *when you asked Siri on the 16th, did it SPEAK the answer?*
The server returned "8,538 steps on August 15th, sir." in 19.7s, but the
entire outage was "server healthy, phone silent", so a 200 proves nothing
about what he heard. Expected observation if it is genuinely fixed: Siri
reads the step count aloud within ~20s. If it went quiet again, the log now
carries the raw body and the reply — read those FIRST, before touching code.

**SECOND ACTION (the Forge, his actual ask):** build the "Nova Forge"
dispatch Shortcut — clone the now-working Ask Nova (iCloud share-link
method), change the URL path to `/api/forge` and the body key to `prompt`.
Expected observation: dictating "build me a countdown timer page" from the
watch returns "The Forge has it" within a second, the Forge dot pulses in
the app, and Telegram announces the result with its cost a few minutes
later. **Do not hand-author it** — clone.

**THIRD ACTION (cheap, unblocks a built feature):** grant Screen Recording
to the server so forge proof shots work. Expected observation: a finished
job's receipt carries `proof: "<id>.png"` instead of the permission note,
and `GET /api/forge/:id/proof` returns an image.

**SECOND ACTION (video):** ask him to run **▶▶ WATCH + ANALYSE from the
app** on a short video (not the shell). Expected observation: the review
overlay shows *Fetching the video transcript…* then a change list within
~3 minutes, and approving it writes Source + Concept pages — proving the
button wiring and the app-side approve path.

**DO NOT (dead ends already paid for):**
- Do **not** use `new URL(import.meta.url).pathname` for a path in this
  repo — the repo path contains a space, so it stays percent-encoded and
  silently writes a parallel `Claude%20Projects` tree. Four call sites did
  this; use `fileURLToPath`.
- Do **not** wrap a long model payload (notes, transcripts, page bodies)
  in a JSON string field. One raw newline = "Bad control character" and
  the whole expensive pass is lost. Ask for markdown.
- Do **not** read stderr before stdout when a `claude` child fails. A
  harmless "no stdin data received in 3s" warning was reported as the
  cause of a 15-minute failure; the real reason (is_error +
  `total_cost_usd`) is in stdout. Also pass `stdio: ['ignore', …]`.
- Do **not** set a budget cap without measuring the pass first. Two kills
  ($0.75 vs $1.46 actual, $8 vs $8.15 actual) cost ~$10 and an evening.
  Run one pass by hand, read `total_cost_usd`, then set the cap.
- Do **not** assume the CLI's default model is cheap — it is Opus, and
  bulk reading on it is 5× Sonnet.
- Do **not** hold an expensive, user-approvable artifact only in memory.
  Ready ingest jobs died with the process twice; they persist now.
- Do **not** diff a staged tree against `Wiki/` alone — `Raw/` must be in
  the `before` set or every transcript reads as "new".
- Do **not** write to `server/data/inbox.json` from a SECOND node process
  while the server runs — `inboxStore` caches it in memory. Trigger
  in-process via an endpoint.
- Do **not** hand-author Health actions in a `.shortcut` file. Six
  attempts failed: `is.workflow.actions.statistics` returns NOTHING
  without an explicit `Input` attachment (OutputName "Health Samples") and
  must be referenced by its OPERATION name ("Sum"/"Average"); hand-built
  relative date filters were **inert** even when byte-identical to a
  working shortcut's (changing 1 day → 2 days changed no value).
  **Clone instead**: an automation can't be duplicated in the app but CAN
  be shared as an iCloud link — `curl
  icloud.com/shortcuts/api/records/<id>` → `fields.shortcut.value
  .downloadURL` → the full plist, editable and re-signable with
  `shortcuts sign --mode anyone`.
- Do **not** propose a fixed evening push time as "accurate". His bedtime
  varies by hours; any fixed hour truncates the day unpredictably. He said
  so, plainly, after it was suggested.
- Do **not** treat `manual: true` as meaning "complete". It means
  authoritative. Stamping a same-day correction complete silences the
  next morning's sentinel.
- Do **not** write a health figure back from the pushlog without checking
  the WINDOW it was captured over. An 11,107 reading taken at 13:19 spans
  midday-to-midday across two days — it was restored as an 11 Aug total
  and was simply wrong; his manual 10,218 was right.
- Do **not** rely on his phone reaching iCloud Drive/Shortcuts. Files
  saved there by Shortcuts have twice failed to arrive.
- Do **not** document an HTTP header as `Authorization: Bearer <token>`
  on one line for a Shortcuts recipe — it gets pasted literally.
- Do **not** assume a Shortcuts failure is the Shortcut. Read the request
  log FIRST.
- Do **not** chase iOS "network connection was lost" without checking
  latency (>25s and iOS drops it).
- Do **not** add a slow external call into a spoken path without a
  deadline.
- Do **not** trust `tailscale serve` alone for phone→Mac.
- Do **not** claim an agent "ran" from a pending record alone.
- Do **not** assume a stray dated push is harmless because ONE metric got
  guarded. Only steps had a monotonic guard until 12 Aug; a drill push with
  a wrong literal date (`2026-08-12` instead of `yesterday`) wrote real
  11-Aug energy/distance/RHR/HRV/VO2 numbers straight into 12 Aug's file
  because those fields had no guard at all. Check every metric key, not
  just the one you're testing.
- Do **not** trust a GET to `/api/*` without the bearer token as evidence
  of empty state. It returns `{"error":"unauthorized"}`, and code that
  reads `.records`/`.items` off that without checking `.error` first sees
  an empty list, not a rejection — read the JSON files on disk directly
  when verifying from outside the app.
- Do **not** diagnose a Shortcut failure from the server side without first
  reading the RAW BODY it sent — and if there is no receipt of that, add one
  before writing any fix. This close cost THREE rounds and two wrong
  diagnoses: a real (but unrelated) keepalive-whitespace bug was found and
  fixed and confidently reported as the cause, twice, while the actual fault
  was his Shortcut sending the literal words "Provided Input". The evidence
  that settled it took one grep once the receipt existed.
- Do **not** ask "is it broken?" when you can ask to SEE it. One screenshot
  of the Shortcut ended a multi-day hunt in seconds. Ask for it early.
- Do **not** trust `→ 200` as proof a spoken surface worked. The server can
  answer perfectly while the phone gets nothing usable — that happened twice
  here, once from body corruption and once from a nonsense question.
- Do **not** test only the fast path after a performance fix. The keepalive
  drip corrupts SLOW responses only; every post-fix test returned in ~2s and
  looked pristine, which is precisely why the bug survived being "verified".
- Do **not** believe "leading whitespace is legal JSON so Shortcuts will
  parse it". It is legal, and Shortcuts did not. That comment sat in the
  code as an assumption dressed as a fact.
- Do **not** answer a voice surface with a bare 4xx. Siri renders any
  failure as "I can't help with that", which is indistinguishable from
  a dozen other causes. Answer 200 with spoken `text` naming the real fault.
- Do **not** run `git add -A` in this repo without reading the file list —
  it swept a PDF of his reading material into a commit this close (now
  untracked, `*.pdf` ignored, file untouched on disk).
- Do **not** invent an agent department. `AGENT_DEPARTMENTS` names are a
  contract with the seed in `skills.js` (Train/Fuel/Mind/Money/Knowledge/
  Logistics/Platform) and the ops test enforces it — the Forge plan said
  "Build" and had to become Platform.
- Do **not** give a new inbox `kind` a pending status without checking
  `approveRecord`. A forge job carries no `decision`, so Yes would have
  thrown on a record that had already shipped Yes/Leave buttons to Telegram.
- Do **not** mutate a job object read back from disk and expect a running
  child to see it. `stopForge` did exactly that on first write, so the stop
  flag never reached the process; the live object has to be the one in the
  running map.
- Do **not** assume you're the only session writing this repo. Two sessions
  wrote it concurrently on 11-12 Aug and one swept the other's files into
  its commit (`0210290`) — nothing was lost, but check `git log` before
  assuming a change is yours if it happens again.
- Everything in the previous DO NOT list still applies (Vite stale
  modules; `$` in `/m` regex over vault markdown; fixture-only tests for
  vault writers; verifying the PWA against the deployed Pages build in
  the MCP Chrome; `CACHED_LIVE_KEYS` for new live slices;
  Vercel/serverless; the steps Source filter; view-transition CDP evals).
---

## SESSION LOG (append-only, newest first)

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
