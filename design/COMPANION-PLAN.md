# The Companion Plan — Nova as a real back-and-forth assistant

*Written 28 July 2026 from Hayden's brief: "operate like Jarvis — sit there
with voice on, talk back and forth like a real conversation, see what it's
talking about on screen, confirm changes, and have it act." This is the
build plan: phased, grounded in what exists, honest about platform limits.*

## What already exists (the foundations this stands on)

- **Voice Q&A with memory**: Ask Nova spawns a read-only Claude session over
  the vault with `--resume` continuity (`novaos.voiceSession`) — the
  conversation already survives across days. Dictation pause-sends works.
- **TTS**: ElevenLabs proxy is built (`lib/tts.js`) but **no API key yet** —
  browser speech is the fallback. This is step zero for the Jarvis feel.
- **Hands, on the rails**: the Coach PROPOSE mechanism (typed JSON line →
  deterministic validation → pending inbox record → approve applies, undo
  restores). The pattern generalises to every writeable surface.
- **Context**: composeDispatch (morning/evening), coach context (goals,
  sessions, e1RMs, recovery, nutrition, weight trend, streaks, carryovers),
  the home-screen context ladders. Rich, deterministic, already assembled.
- **Streaming**: the CLI supports `--output-format=stream-json` (verified) —
  replies can render word-by-word on the subscription, no API key needed.
- **Researcher**: WebSearch-enabled, citation-required, review-gated.

## The honest ceilings

- **Latency**: each turn spawns a CLI process + model time (~3–8s to first
  token). Streaming + sentence-chunked TTS makes this feel like a thoughtful
  conversation partner, not instant banter. True sub-second speech-to-speech
  needs the realtime API — per-minute cost, big architecture shift; parked
  unless Hayden wants to pay for it later.
- **Always-listening / wake word**: not feasible in a PWA (iOS background
  mic). Conversation mode = the Voice screen open, hands-free turn-taking.
  The native wrapper (roadmap) unlocks proper speech APIs + backgrounding.
- **Speech recognition**: iOS WebSpeech is what it is. Tuning (auto-restart,
  retry, longer silence windows) helps; the native wrapper is the real fix.
- **Voice quality**: gated on the ElevenLabs key (Hayden's action).

## The phases

### Phase 1 — Conversation mode (the loop feels alive)
The Voice screen gains a CONVERSATION toggle: Nova speaks → mic auto-opens →
pause sends → Nova streams the reply (stream-json) rendering word-by-word →
TTS speaks sentence-by-sentence as text arrives → mic reopens. Tap to
interrupt. Silence >2 turns → gentle "still here" then idle. ElevenLabs key
in; dictation tuning (auto-restart on transient errors, punctuation pass).
*Everything here is subscription-CLI; no new costs.*

### Phase 2 — The canvas (see what it's saying)
The conversational agent gains typed `SHOW {"panel":"...", ...}` directives —
same doctrine as PROPOSE: the model NAMES a panel, deterministic code renders
it from live data only. First panels: `training-week` (sessions + schedule +
carryovers), `exercise` (name, muscle group, tracking type, his history +
e1RM trend for it), `nutrition-week` (protein floor adherence, kcal vs
target), `weight-trend`, `todos-open`, `review-concept`, `calendar-day`.
Desktop: voice transcript left, canvas right. Phone: panels render as cards
inline in the transcript. Panels are REAL views of vault data — never
model-drawn numbers.

### Phase 3 — Hands across every domain (confirm by voice)
Generalise PROPOSE beyond Coach: the conversation can draft calendar events
(existing confirm-first flow), to-dos, rotation today-variants, stash links,
journal entries — each a typed proposal landing as a pending record, shown
as a confirm chip in the transcript. Saying "yes, do it" approves the
record (the agent replies with the record id; affirmation approves it
deterministically — the model never writes). Everything undoable. Autonomy
stays earned-per-loop per the Method.

### Phase 4 — References while talking
"Show me the research" → the agent cites vault notes inline (it already
reads the vault) and can trigger a Researcher job mid-conversation; results
arrive as a sources panel (citation-required, review-gated as today).
Desktop extra: link-out cards (videos, articles, images) the canvas renders
as previews — Nova surfaces, Hayden clicks; the PWA never auto-opens tabs.

### Phase 5 — Rituals (the conversations that structure the day)
- **Morning**: opening the conversation before 10am starts from the morning
  dispatch — Nova speaks the brief, asks ONE question ("protein was short
  yesterday — want the rotation adjusted?").
- **Night**: a guided reflection — Nova walks the evening debrief, asks how
  the day actually went, files the reflection as a journal entry (rails,
  category 'personal') and surfaces the daily-review concept to close on.
- Both are invitations (nudges), never interruptions.

### Phase 6 — The ceiling movers (when wanted)
- **Native wrapper** (Capacitor, already on roadmap): real speech APIs,
  background audio, Dynamic Island live activity for conversation mode.
- **Realtime speech-to-speech API**: the true Jarvis latency, at per-minute
  API cost — decision gated on Hayden's appetite after Phase 1–3 living.
- **Work domain**: when work enters Nova, it's new context builders + panels
  on the same spine — no new architecture.

## Doctrine checkpoints (unchanged by any phase)
Models decide, code acts — SHOW and PROPOSE are typed decisions, code
renders/writes. Everything writeable rides the rails, undoable. Panels
render only real data; missing data says so. Calendar stays confirm-first.
Autonomy is earned from history, proposed, never assumed.

## Recommended build order
1. **Phase 1 + first three Phase-2 panels** (training-week, exercise,
   nutrition-week) — one focused build; the conversation becomes real.
2. Phase 3 (voice-confirmed actions) next — it reuses the Phase-1 loop.
3. Phases 4–5 as follow-ups; Phase 6 decisions after living with it.

*Prerequisite from Hayden: the ElevenLabs API key (paste via `!` +
pbpaste so it never appears in chat).*
