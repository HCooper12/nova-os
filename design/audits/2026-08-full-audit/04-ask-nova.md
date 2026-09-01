# 04 — Ask Nova (the conversational lane)

Audited 2026-08-30. Read-only. Full-surface enumeration per standing
correction 4; files opened this session: `server/lib/askContext.js` (full),
`server/routes/voice.js` (full), `server/lib/claudeCode.js` (163-560: ask
prompt, resumed ask, askArgs, prewarm, startAskNova + finishTurn),
`server/lib/reflex.js` (full), `server/lib/spokenSession.js` (full),
`server/lib/spokenLog.js` (full), `server/lib/platformActivity.js` (full),
`server/lib/voiceActions.js` (full), `server/lib/rituals.js` (full),
`server/lib/panels.js` (structure + directive contract). Test suites
enumerated: reflex, spokenLog, spokenSession, spokenVoice, voice,
voiceActions, claudeStream, platformActivity, lens. Deliberate deferrals:
the Voice screen UI (item 47), Greeting (item 10), Morning Show composition
(items 39/47), TTS engines (item 47), Telegram bridge (item 66), the Claude
Code message lane `startMessage` (item 62).

## 1. What it is (verified)

Nova's front-door conversation — a read-only model session over the vault
that answers in the persona register and routes work to the fleet. Three
entry lanes share one brain:

- **PWA Voice ask** (POST /api/ask, voice.js:30-57): reflex-first, then a
  persistent session (client-held sessionId, resumed turns get a volatile
  refresh line).
- **Siri hands-free** (POST /api/ask/sync, voice.js:181-328): tolerant body
  parsing with placeholder-name detection (17-20, 199-231), reflex-first,
  one shared spoken session with three freshness guards (new-day, 20-min
  age-out, 12-turn cap — spokenSession.js:36-69), keepalive drip only past
  20s (260-266), spoken-friendly errors, a per-ask latency receipt in the
  log (310).
- **Rituals** (POST /api/ask/ritual + rituals.js): morning brief / evening
  reflection / About-You interview as structured questions riding the same
  session — model narrates, dispatch counts.

**Layers, outermost first:**
- **Reflex layer** (reflex.js): deterministic <1s answers for small talk and
  direct number asks (steps, HRV, weight, protein/kcal, inbox count) —
  strict patterns, analytical words fall through (NEEDS_THOUGHT, :33),
  missing data returns null rather than guessing, answers logged to
  spokenLog (voice.js:41).
- **Context builder** (askContext.js, shared by all lanes so they can never
  drift, :6-8): ~18 concurrent sections on per-section deadlines (profile,
  preferences, standing rules, skills, today-local numbers + spoken-log
  tail, morning+evening dispatch, open loops, fleet receipts, platform
  ledger, pending-drafts digest in full text, fleet roster self-knowledge,
  reminders, latest weekly debrief, today's daily review, money month,
  Leader's idea, Coach + Leader real transcripts via agentSessions).
  90s TTL cache filled by the mic-open prewarm; a failed assembly is never
  cached (101-108, 184-188).
- **Model turn** (claudeCode.js): read-only tools, pinned `modelFor
  ('ask-nova')`, streamed deltas, warm process pool; resumed turns send only
  a live line + question (274-290). The prompt (226-272) sets the spoken
  register, front-door identity, org-reading, and seven directive contracts.
- **Directive post-processing** (finishTurn, 367-539) — all deterministic:
  SHOW panels built by code from the vault, with question-inferred panels
  when the model names none (386-404); PROPOSE → six validated pending-
  record kinds via voiceActions (capture via the standard classifier,
  calendar via the confirm-first command flow, routine-edit via Coach's
  validator, rotation-variant resolved against the real rotation,
  preference → Standing Instructions, profile → About You merge — all
  review-gated, all with undo); RESEARCH and WATCH behind the model-choice
  gate except overnight/direct (422-489); PLAY resolving a channel's newest
  upload (490-508); CARD clamped by spokenCards (509-516); honest fallback
  prose for directive-only replies (517-526).
- **Spoken log** (spokenLog.js): every code-authored utterance rides the
  context so the model owns lines "it" said — the two-brains-one-face fix.

## 2. Current workflow, traced

Real Siri ask, cold: he says "Hey Siri, Ask Nova — how's my protein today?"
→ Shortcut POSTs /ask/sync → body sweep finds the question → reflex matches
`fuel-protein` → code answers "82 grams of protein so far today, across 3
entries." in <1s, logged to spokenLog, no model spawned. Analytical follow-up
("should I be worried?") → NEEDS_THOUGHT falls through → takeSpokenSession
resumes the morning's conversation → warm process, volatile live line only →
model answers in ~2s from context it already holds. A PWA ask days into a
session: resumedRefreshContext injects today's numbers + the platform ledger
+ pending-draft digest, so "what was the last video I gave you?" answers
from the record, not chat memory (the 20-Aug failure, fixed). "Move gym to
6pm" → PROPOSE calendar → runCalendarCommand interprets against real events
→ pending record with APPLY on his reply.

Failure modes, as they degrade today:
- Empty/placeholder Shortcut body → spoken diagnosis naming which end broke
  (voice.js:209-231). **Honest — the best input-validation pattern in Nova.**
- Job error/timeout → spoken error text, session dropped so the next ask
  starts clean (313-323). **Honest.**
- Bad SHOW/PROPOSE/RESEARCH/WATCH/CARD directive → each parse error strips
  the line and appends an honest "nothing was changed" note. **Honest.**
- Failed greeting/context assembly → never cached, prompt says
  "(unavailable)". **Honest at the whole-context level.**
- **A single context section times out or throws → resolves to null,
  unnamed** (askContext.js:26-31, 176-182). With 18 sections, the model
  cannot distinguish "no drafts" from "the digest failed" — same silent-drop
  family as Daily Review (cross-cutting [01→02]), on the surface that
  claims to be the platform's memory. **Dishonest degradation risk.**
- **PLAY resolve-but-fail-to-open → `openInBrowser` failure is swallowed
  (claudeCode.js:501) and the flow still sets `played`, emits a "NOW
  PLAYING" card (528-532) and in-character "it's playing" prose** — the
  glass can claim a video is playing when nothing opened. **Dishonest.**
- Days-old PWA session → volatile refresh only; changed standing rules,
  preferences, profile, goals never reach it, and no turn/age cap exists on
  the PWA session at all (guards live only in the spoken lane). **Partially
  honest** — cross-cutting [01] confirmed for this lane.

## 3. Pros — what genuinely works

- **The latency architecture is the best engineering in the fleet**: reflex
  → warm resumed session → prewarm-during-speech → cold, every layer
  measured (14.2s → ~1-2s receipts in comments and logs), every accelerator
  a pure accelerator whose loss degrades to a paid boot, never a broken
  conversation. The ask/sync latency receipt (310) makes "why was that slow"
  answerable from the log.
- **One context builder for every conversational surface** (askContext.js:
  6-8) is doctrine rule 7 done right — Voice, Siri, and Telegram cannot
  drift.
- **The front-door memory stack** (platformActivity + inboxDigest +
  agentSessions + fleetContext + spokenLog) is a genuine answer to Hayden's
  named #1 friction: one conversation that knows what the whole platform
  did, can read his drafts aloud, and can speak for Coach and the Leader
  from their real transcripts. This is the rail the "single front door"
  should keep extending.
- **Directive post-processing is models-decide-code-acts at its widest**:
  seven directive types, every one validated/built/clamped by code, every
  failure an honest note, at most one action per reply, review-gated
  throughout.
- **The reflex layer's contract** (strict match, never guess, analytical
  falls through, rotation not randomness) makes speed honest — and small
  talk never wakes a model.
- **Input tolerance with named blame** on the Siri lane (raw-body logging,
  field sweep, placeholder detection) — hard-won lessons encoded where they
  happened.

## 4. Cons and gaps (ranked by real-life cost)

1. **Silent context-section absence** (askContext.js:26-31). The
   self-described "front door of the whole platform" can answer with
   confident wrongness when a section silently vanished — worst on ledger
   questions ("what did I give you?") where absence reads as "nothing".
   General axis; the shared named-failures helper (cross-cutting [01→02])
   belongs here too.
2. **PLAY claims playing on a failed open** (claudeCode.js:499-532).
   Verified one-line hole; costs trust in the exact "it just works" moment
   the lane is built for.
3. **PWA-session freshness has no guards** — the spoken lane earned three
   (day/age/turns) and the PWA session got none; deep context (standing
   rules, profile, preferences, goals) drifts for days and an unbounded
   transcript eventually makes every turn slower. Mission axis: corrections
   he gives today silently don't govern a chat he opened Tuesday.
4. **Reflex coverage stops short of its own data**: sleep last night and
   RHR sit in the same healthData file already loaded; "what's on today"
   (warm calendar cache) is among the commonest asks a voice assistant
   gets. Each miss pays ~2s+ of model for a number code already holds.
   Daily-cadence mission axis.
5. **Reflex answers put nothing on the glass** — text only ({text,
   reflex:true}, voice.js:42), while his standing rule is that spoken
   answers show what they say (nova-visuals-always). The numbers most often
   spoken are the ones never drawn. [Inferred client-side: no card in the
   reflex response shape.]
6. **inboxDigest's cap is silent about the total** (platformActivity.js:
   34-36): 14 pending renders as "10 shown" with no "of 14" — a small
   silent-cap violation, softened by todayLocalContext carrying the true
   count.

## 5. Mission test

**Daily: earns its keep decisively** — this is the surface that makes Nova
feel like an OS: sub-second numbers, ~2s conversational answers, briefs and
captures and calendar moves from one mouth. **Weekly:** rituals (evening
reflection → journal drafts) and debrief discussion give the week a
conversational spine. **Monthly/long-term:** the preference/profile PROPOSE
loops are the platform's compounding-understanding mechanism — corrections
land once and govern every agent. The long-term gap is reachability, not
capability: Claude Code sessions — his own named friction — still cannot be
dispatched from this conversation, so the front door covers the whole house
except the workshop.

## 6. Improvement plan (ranked)

Change types (cap lifted per standing correction 4): items 1, 2, 3, 5, 7,
8 REFINE existing behavior; item 4 ADDS coverage on the reflex rail; item 6
is the flagged strategic ADD. No capability is removed; nothing here needs a
new model lane.

1. **[Refine] Named absent sections in `buildAskContext`.**
   - **Need:** absence must be distinguishable from emptiness on the surface
     claiming to be the platform's memory.
   - **Proposal:** label each section; `withDeadline` reports timeout/error
     per label; append the Coach-style NOTE ("these sections FAILED/timed
     out — say the data could not be loaded, never that there is none").
     Build it as the shared helper the Daily Review fix (02, plan 1) also
     uses — one rail, three consumers.
   - **Doctrine:** rule 4; rule 7 (one helper, noted twins). Screened:
     silent cap, parallel rail.
   - **Failure modes:** helper is pure string-building.
   - **Impact/effort:** H / L-M.
   - **Verification:** unit test (timeout section → NOTE names it); live
     context build against the real vault confirming all-ok today.
2. **[Refine] Honest PLAY outcome.**
   - **Need:** "NOW PLAYING" must mean playing.
   - **Proposal:** await `openInBrowser` result; on failure keep the resolve
     (`played.opened = false`), caption the card "FOUND — couldn't open"
     and let the prose say the link is on the glass instead.
   - **Doctrine:** rule 4. **Impact/effort:** M / L.
   - **Verification:** unit test both branches; live PLAY with the Mac
     browser available.
3. **[Refine] PWA-session freshness guards.**
   - **Need:** deep context and transcript length must be bounded on the
     lane that persists for days.
   - **Proposal:** generalise the spoken lane's guard triple (spokenSession
     is the rail): server-side new-day/age(~24h)/turn(~40) checks in /ask
     that mint a fresh session (returning the new id; the client already
     persists whatever comes back), plus standing/preference deltas added to
     `resumedRefreshContext` so corrections reach live sessions immediately.
   - **Doctrine:** rules 4, 7. Screened: parallel rail (extends
     spokenSession's pattern rather than a second scheme).
   - **Failure modes:** guard state lost → next ask simply starts fresh
     (today's cost, once).
   - **Impact/effort:** M-H / M.
   - **Verification:** voice.test additions; live resume across a simulated
     day boundary reading the minted session receipt.
4. **[Add] Reflex coverage: sleep, RHR, today's calendar.**
   - **Need:** the commonest direct asks should never pay model latency.
   - **Proposal:** sleep-last-night and RHR from the already-loaded
     healthData days; "what's on today / what's next" from the warm calendar
     cache only (cold cache → null → model, honestly). Same strict-match,
     never-guess contract; same spokenLog receipt.
   - **Doctrine:** rule 1; *run detectors on real data first* — check
     patterns against the ask/sync question log lines before shipping.
   - **Impact/effort:** M / L.
   - **Verification:** reflex.test additions per pattern; live asks.
5. **[Refine] Reflex answers carry a card** (with §7): attach a clamped
   metricCard (steps/HRV/weight/protein/kcal/inbox) built by the same code
   that speaks the number.
   - **Doctrine:** his standing visuals rule; code decides the panel.
   - **Impact/effort:** M / L. **Verification:** response-shape test + a
     phone-width screenshot at item 47's pass.
6. **[Add, flagged strategic] CODE directive — dispatch a Claude Code job
   from the conversation.**
   - **Need:** his own words (context doc §8): the front door should reach
     Claude Code sessions too.
   - **Proposal (smallest honest step):** a `CODE {"task":...}` directive
     routed to the existing `startMessage` lane behind the model-choice
     gate, result landing as a pending record like research does. Scoped
     deliberately small; the full "one front door" design spans several
     items and should be decided once, at the cross-cutting level, not
     smuggled in here.
   - **Doctrine:** rules 5, 6 (explicit trigger, review-gated receipts).
   - **Impact/effort:** H / M-H.
   - **Verification:** directive parse tests; live dispatch of a trivial
     read-only task.

7. **[Refine] Honest totals on the context digests.**
   - **Need:** con 6 — 14 pending drafts render as "10 shown" with the
     total lost (platformActivity.js:34-36 slices before counting), and the
     activity ledger's 8-item cap is silent entirely (MAX_ITEMS, :22).
   - **Proposal:** count before slicing; phrase both blocks "N of M shown —
     the rest are in his Inbox/on the Ops screen".
   - **Doctrine:** silent-cap screen. **Impact/effort:** L / L.
   - **Verification:** platformActivity.test additions with >cap fixtures.
8. **[Refine] Write-triggered context-cache invalidation.**
   - **Need:** the 90s context cache (askContext.js:107-112) can serve a
     picture from just before a draft approval or food log — a bounded but
     real staleness window on the surface that says "trust it over stale
     pages".
   - **Proposal:** export a `dropAskContextCache()` and call it from the
     inbox approve/discard and food-log write paths (the writeSlices map
     already names exactly which writes touch which context — reuse its
     route tags rather than inventing a second mapping).
   - **Doctrine:** rules 4, 7 (extends the writeSlices contract; note the
     twin). Honest impact: LOW — the TTL already bounds the lie at 90s;
     ranked last accordingly.
   - **Impact/effort:** L / L-M.
   - **Verification:** unit test: write → cache dropped → next build fresh.

## 7. UI recommendations

Output lands on the Voice screen (glass cards, panels — full UI audit at
item 47), Siri's spoken channel, and Inbox records. Lane-level, screened
against dashboard drift:

- **Reflex cards** (plan 5): the numbers he asks for most get drawn the
  moment they're spoken. What changes: he reads the number he half-heard,
  and the glass stops going dark exactly on the fastest answers.
- **Degraded-context chip** (plan 1's client half): when the NOTE reports
  failed sections, the reply carries a small "partial context" marker. What
  changes: he re-asks instead of trusting a hole.
- **PLAY honest states** (plan 2): "NOW PLAYING" vs "FOUND — tap to open".
  What changes: he taps instead of waiting for audio that never starts.
- **Accessibility note for item 47's pass:** spoken errors are already
  voiced; ensure the same text always lands visibly in the transcript so a
  muted phone still shows what went wrong. [Deferred to 47 for
  verification.]

## 8. Verdict

**Keep as-is / Refine** — the platform's real front door and its best-
engineered lane; the gaps are honesty edges and reach, not architecture.
Highest-value next action: **named absent sections in `buildAskContext`**
(plan item 1) — built as the shared helper so 02 and every other model lane
close the same hole at once.
