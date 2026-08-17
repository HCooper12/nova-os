# The Morning Show — making Nova feel like the reel

*Source: two Instagram reels watched frame-by-frame on 17 Aug 2026 (JARVIS
builder: architecture explainer DcBf4F6MeNl; morning-brief demo Db6D1UGsc8k).
Hayden: "THIS is closer to what I want from Nova when truly interacting with
it. I idealise starting and ending my days talking to it without typing."*

## The finding

The demo's speed is not computation — it is **prepared work choreographed at
playback**. The overnight system finishes everything hours earlier; the
morning brief is a narrated slideshow of receipts, each spoken beat backed by
a visual pane (post artwork → bug before/after → analytics chart → drafted
reply), ending in a voice approval of ONE staged action ("say the word and
I'll send it"). The architecture reel states the other half plainly: a
"reflex" layer above the model "so most of what he asks never reaches deep
thought at all — that is the speed people assume is edited."

Nova already owns most of the parts: SHOW panels, the sentence-TTS FIFO,
doorman greeting, proposal rails with voice yes/no, the overnight window,
per-agent receipts. What is missing is the reflex layer, per-sentence panel
sequencing, and a composer that turns receipts into a show.

## Phase 1 — The Reflex Layer *(biggest feel-per-effort win)*

A deterministic answerer IN FRONT of the model for questions whose answers
are already in the live context: steps, HRV, weight, sleep, next event,
today's meals, pending count, streak. Match → templated spoken reply
(persona-voiced, varied) in <1s, never spawning the CLI. No match → the
normal ask path, unchanged. Misses must fall through silently — a reflex
that guesses is worse than none. Contract-tested against the live-context
shape; every reflex answer receipted like any ask.

## Phase 2 — The Morning Show / Evening Debrief

BRIEF ME and the arrival greeting become a composed sequence
`[{ say, panel? }]`: each sentence paired with optional visual evidence,
panes swapping in sync with the TTS queue (per-sentence hook on the existing
FIFO, replacing one-SHOW-per-reply for this surface). Content is receipts,
never invented: sleep/health numbers, what agents produced overnight
(forge/watcher/researcher/distiller records), calendar shape, and THE one
pending item most worth attention — closing with "say the word" wired to the
existing voicePendingProposal approve. Composer is code; the model only
polishes phrasing inside the persona register. Same machinery, evening
variant: day's receipts, tomorrow's shape, anything awaiting him.

## Phase 3 — The Foreman

Generalize the overnight window into a night worker: read the day's
receipts, inbox, and vault deltas; decide what is worth doing (bounded
list, budget-capped, per the trust ladder — everything lands pending);
stage results so Phase 2 has fresh material every morning. The reel
hand-waves approval; Nova's autonomy ledger is the honest version.

## Explicitly not taken

- Twilio phone calls — Telegram + the Siri lane already reach him.
- ElevenLabs — settled; the local Kokoro stack is the voice.
- The "$2.50/month" cost claim — not credible at this scope; Nova's own
  measured costs remain the guide.
