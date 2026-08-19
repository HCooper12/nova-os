# Nova — capability inventory (baseline, 19 Aug 2026)

Written from the codebase BEFORE watching any WiseTwinz material, so the
comparison that follows is against what Nova actually does — not against
a memory colored by having just watched someone else's demo.
Counts: 105 server libs · 21 routers · 25 schedulers · 17 screens.

## Voice
- **Local TTS**: Kokoro-82M on MLX via a main-thread sidecar (~0.25s),
  custom voice blends ("Nova", "Nova Light" + workshop treatments).
  Free, offline, no ElevenLabs.
- **Sentence-streamed speech**: FIFO with reveal-on-play — text appears
  as its audio starts, so voice leads and words follow. Lossless
  barge-in (interrupting reveals unspoken text rather than eating it).
- **Web Audio path**: pre-decoded AudioBufferSource (jitter-proof),
  analyser tap driving the audio-reactive core + waveform, 3s idle
  release so AirPods hand back to music.
- **Dictation**: on-device speech recognition (Inbox, Voice, and now the
  Fuel log bar).
- **Conversation mode**: hands-free back-and-forth, mic reopens after
  Nova speaks; no-button reply window.
- **Reflex layer**: deterministic sub-second answers (steps/HRV/weight/
  fuel/inbox) before any model runs; NEEDS_THOUGHT regex falls through.
- **Greeting doorman**: generated (never templated) on arrival, from
  computed facts only.
- **Morning Show / Evening Debrief**: composed receipts played
  beat-by-beat with panels revealing in sync.
- **Canvas panels**: the model NAMES a panel (training-week, exercise,
  nutrition-week, note, pulse); deterministic code draws it from the
  vault. 5 types.
- **Ambient mode**: fullscreen presence.

## Agents / model lanes
`startMessage` (Claude Code tab, file read/write, no Bash) ·
`startAskNova` (vault-read Q&A) · `startAskCoach` · `startQuickSession`
(off-program session builder) · `startGreeting` · `startSessionDebrief`
(new) · `startBreaker` (sandboxed).
Named agents: **Coach** (fitness), **Researcher** (web, citation-
required), **Watcher** (video → verdict/notes), **Studio** (content),
**CFO** (money), **Commander** (planning), **Guardian** (integrity),
**Scout** (patterns), **Distiller**, **Brain Week**, **Forge**.

## The Coach specifically (deepest agent)
Deterministic engines: progressions (incl. RPE-autoregulated + the new
OUTGROWN rule), plateau detection, PR detection, RPE drift, weekly
muscle volume vs goal-aware targets, program audit, deload signal,
readiness score, training blocks/periodization, injury log, carryovers,
skipped-work memory, progression tunes (his corrections made standing).
Knowledge: `Coaching Principles` + `What Works For Hayden` (client file
written only via approved proposals). Cadence: morning readiness,
missed-session nudge, PR celebration, post-session debrief, nightly
reflection (≤3 learn proposals, ≤1 outreach, or silence).
Cross-reference agent: training × fuel joins (his non-negotiable).

## Surfaces
Mission Control · Voice · Memory Galaxy · Claude Code · Inbox · Fuel
(recipes/rotation/macros) · Shopping · To-Do · Train (TODAY/GYM/COACH)
· Notes · Journal · Money · Stash · Ops · Settings · Ambient.
Design language: dark HUD, `--nv-*` tokens, macro colours (P cyan /
C gold / F violet / kcal green), long-press context menus (touch +
right-click), tap-to-explain glossary Terms.

## Data spine
Obsidian vault = source of truth; `server/data/` = operational.
Health: nightly iOS Shortcut push (metrics), Apple Watch workout ingest
(new), health drops folder, weight trend. Calendar: CalDAV read/write
incl. recurring-occurrence overrides. Food: rotation + off-plan log +
photo/barcode scan. Money: import + CFO. Todoist sync.

## Rails & doctrine
Everything writeable is undoable (inbox records with undoData); models
propose, deterministic code writes; honest degradation (missing data
says so); autonomy earned, never assumed; snapshot endpoint feeds every
screen in one read; offline-first PWA with cached live keys + outbox.

## Automation
25 schedulers (dispatch, daily review, week plan, plan-today, overnight,
compost, distill, brain week, pattern scout, pulse, meal prep, food
suggest, training check, weekly debrief, coach cadence, coach
reflection, health insight/mirror/drops, money import, todoist,
reminders, autonomy, guardian, CFO). Telegram out-channel.

## KNOWN FRICTION (his words, this session — the standing gap)
> "I shouldn't need to go to many different sections of the platform in
> order to ask for something like this... Ideally, this includes Claude
> Code sessions as well so I don't need to keep opening different
> terminals."

Today: watching a video, researching a link, and running a Claude Code
job are **separate surfaces with separate affordances**. There is no
single conversational front door where a pasted link + spoken intent
routes itself. Nova's capability exists; its *reachability* does not.
This is Workstream C in the study plan and is a gap independent of
anything WiseTwinz may show.
