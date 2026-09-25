# Agent models — audit, 25 Sep 2026

Scope: the model board (`server/lib/modelPrefs.js`), the weekly fail-safe
(`modelWatch.js`), the Opus-or-Sonnet gate (`modelChoice.js`), every CLI
spawn site under `server/lib`, the saved prefs (`server/data/model-prefs.json`),
the server log, and the flags the installed CLI (2.1.282) actually offers.
Read-only except for eleven probe calls on Sonnet (`--tools ''`, no vault,
about $0.15 in total) to measure effort.

A peer session was live on the repo during this audit (it added the
`exercise-research` lane and `lib/exerciseResearch.js`, uncommitted at the
time of writing). Nothing here reads its work-in-progress as a fault.

## What is sound (verified this session)

- Every lane id named in code exists on the board; the regression test
  (`test/modelPrefs.test.js:176`) still walks every `spawn(CLAUDE_BIN` site
  and refuses a missing `--model` or a bare literal.
- The probe ran on 24 Sep 21:35 UTC and resolved all four aliases
  (opus → `claude-opus-5-5`, sonnet → `claude-sonnet-5`, haiku →
  `claude-haiku-4-5-20251001`, fable → `claude-fable-5-1`), matching
  `NEWEST_KNOWN`. No movement recorded.
- The prefs file parses; 16 lanes are customised, none to an invalid id.
- The `spawn(bin, …)` sites in mediaLane / studyLane / repertoireLane are
  yt-dlp and ffmpeg, not the model; `claudeSessionsLive.js` only lists
  sessions.

## Faults

### F1. The Opus-or-Sonnet gate contradicts the board he has set

`modelChoice.js` hard-codes `STRONG_MODEL = 'opus'` and
`DEFAULT_MODEL_CHOICE = 'sonnet'`, and the gate fires for every research or
watch directive Ask Nova emits (`claudeCode.js:533-536`, `:557-560`) without
consulting the board. His board already sets researcher, watcher-verdict,
scout, librarian and planner to **opus**. Consequences:

- The question "Want Opus for this research, or is Sonnet fine?" describes a
  choice that no longer exists for those lanes.
- "Sonnet is fine", "no", "go ahead", "keep it" (`parseSpokenGateReply`) send
  `model: 'sonnet'` to `startResearch`, and `researcher.js:265`
  `model || modelFor('researcher')` then runs Sonnet, *below* his standing
  setting. An unreadable reply falls to `DEFAULT_MODEL_CHOICE` (Sonnet) too.
- The weekly cards for pattern-scout and distill are consistent (their board
  default is still Sonnet); only the lanes he has raised are affected.

Verified by reading the paths, not by a live turn. Fix: gate only when
`modelFor(lane)` is not already the strong model; otherwise run without asking.
The question text should name the lane's real default rather than "Sonnet".

### F2. Three lanes pass a caller-supplied model to `--model` unvalidated

- forge: `routes/inbox.js:139` → `startForge({ model })` → `forge.js:253`
- planner: `routes/intent.js:32` → `startPlan({ model })` → `planner.js:168`
- scout, via ingest: `routes/ingest.js:48,72` → `runPersonResearch` →
  `scout.js:198`

researcher, watcher, pattern-scout and distill validate with `isGateModel`;
the Code tab validates with `isValidModel`. The board's own rule is "an
unrecognised model is a 400, never a silent fall-through". A mistyped model
here reaches the CLI and fails with the CLI's words; `fable` passes and runs
at 2.5× Opus. Low severity (token-protected API, his own Shortcuts); a
one-line `isValidModel` check at each entry.

### F3. The usage limit is recognised on one path only

`usageLimitNotice` lives in `spawnWarm` (the conversation lanes: Coach, Ask
Nova, Leader, Code). Every one-shot lane gets `is_error` from the CLI and
throws the CLI's raw text. The server log shows the limit has landed 13
times, all in **pulse** (overnight is when it bites): "You've hit your weekly
limit · resets 6am (Australia/Melbourne)", "…session limit · resets 4am…".

- Wording differs by lane: Nova's own sentence in chat, the CLI's in every
  record or error field elsewhere.
- A scheduled lane skipped by the limit leaves no line he sees. Pulse says
  "nothing fetched" honestly; daily review marks its record failed
  (`reviewFailed`); the rest log to the server file only.
- Nothing counts limit hits, so the fallback he asked for (handoff, 25 Sep
  item 2) has no trigger and no evidence of how often it would fire.

## Improvements, ranked

### I1. A spend ledger per lane (the instrument the cost rule assumes)

Only 8 of ~45 spawn sites read `total_cost_usd`; nothing aggregates. Every
`--output-format json` envelope carries `total_cost_usd`, `duration_ms`,
`usage` and `modelUsage` (the model that actually answered). The board asks
him to choose a model per lane with no number beside any lane.

Also: the memory note claiming every agent runs under `--max-budget-usd` was
stale. `71a7fe4` (23 Sep, "no working caps, anywhere") removed every cap.
Nothing bounds a runaway lane now except the account limit, which then takes
Coach down with it (25 Sep 10:12). The peer's new exercise-research lane
reintroduces a $2 cap, so the repo now holds both policies.

Proposal: `server/lib/modelSpend.js` with one `parseEnvelope()` shared by
the one-shot sites (also settling F3's wording, and classifying a limit hit)
and `recordRun(lane, envelope)` appending to `server/data/model-spend.json`
(per lane, 30-day window: runs, dollars, median seconds, tokens, the model
that ran, limit hits). The board then shows 7-day dollars and seconds per
lane and "last answered by". Measured, never priced from a table.

### I2. Effort is unset everywhere, and the ambient setting is `xhigh`

`~/.claude/settings.json` carries `"effortLevel": "xhigh"` plus per-model
overrides. No lane passes `--effort`. This is the same class as the 21 Aug
ambient-model leak: an account setting deciding what a lane costs.

Measured on Sonnet (`--tools ''`, two runs each):

| prompt | effort | output tokens | wall time | cost |
|---|---|---|---|---|
| counting puzzle | `--effort low` | 163, 171 | 2.1–2.9 s | $0.004 warm |
| counting puzzle | default | 256, 279 | 3.4 s | $0.005 warm |
| counting puzzle | `--effort xhigh` | 299, 306 | 3.1–3.5 s | $0.006 warm |
| note-summary gist | any | 41–49 | 1.3–3.0 s | $0.003 warm / $0.0385 cold |

So the default is not low and sits nearer xhigh; whether it is the inherited
setting or the CLI's own default the envelope does not say (no effort
field), so that part is inconclusive. What is measured: on a small prompt
effort changes nothing, and the cost is the CLI's ~12.7k-token system prompt,
13× dearer on a cold cache. Cache warmth, not effort, is the lever on the
many small lanes (note summaries fired 5× in one page load on 25 Sep).

Proposal: `effort` on the board per lane, passed explicitly so the ambient
setting cannot decide; `low` for the mechanical lanes (inbox-classify,
calendar-command, shopping-categorize, the scans, note-summary, greeting),
the CLI default for judgment lanes until a real Coach turn is measured.

### I3. `--fallback-model` is available and unused

CLI 2.1.282: "automatic fallback to specified model(s) when the default
model is overloaded or not available; comma-separated, tried in order". Opus
lanes could fall to Sonnet on an overload instead of failing, and
`modelUsage` names who answered, so it can be labelled honestly ("answered
on Sonnet; Opus was overloaded"). This is not a usage-limit fallback; that
still needs the local path.

### I4. The board shows no cost signal, and Ask Nova runs on the oldest model

Fable is offered with the hint "always the newest Fable" and nothing about
its price. The probe already measures each alias ($0.003 haiku … $0.07
fable on the same one-line prompt, ~23×), so a relative "×" per choice is
free and measured. Current list price (Claude API table, 25 Sep): Haiku 4.5
$1/$5, Sonnet 5 $2/$10, Opus 5.5 $4/$20, Fable 5.1 $10/$50 per MTok.

Haiku 4.5 is a previous-generation model. Ask Nova, the front door, runs on
it by default; he has already moved three Haiku lanes up (scan-food-label,
pulse, briefing-plan). A question for him with the numbers, not a change.

### I5. Prefs carry no provenance

`model-prefs.json` stores `{ model }` per lane; nothing says when or from
where (board tap, migration, a session). Add `changedAt` and `by`.

### I6. Two conditional `--model` pushes

`briefing.js:63` `if (m) args.push('--model', m)` and `watcher.js:500` the
same. Safe today because `modelFor` never returns empty, but it is the shape
that let the ambient model in on 21 Aug. Make the push unconditional, or
throw when the model is missing.

## Not changed by this audit

Nothing in `server/lib` was edited. The memory note on cost discipline was
corrected (caps removed 23 Sep; the effort measurement recorded).
