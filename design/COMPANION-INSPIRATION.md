# Companion inspiration — the "Jarvis reels" study (29 July 2026)

Hayden shared 20 Instagram reels as inspiration for what Nova should become
"in terms of effectiveness, capacity, ability and excitement." This is what
they depict, what Nova already does, and the real gaps worth building.

**Source honesty:** first pass via captions + comments (login-walled);
second pass 29 July with Hayden signed in — videos watched frame-by-frame
(no audio; visuals + subtitles). The frames confirmed every caption theme
and added the "what it looks like" layer recorded below. Accounts: monopolymccann, aylablumberg.ai,
techentrepruneur, huwprosser, dex_prm, dhaibuilds, _no_hype_ai, xuztin,
lukebuildsai, luispdoesai, martim.saragoca, alexandra.kassis,
reznikov_engineering, rowanthislebrooke (×2), hex.gar, realgfutures, raycfu.

## What the reels actually depict — seven clusters

1. **Always-on Jarvis with a voice and manners** — 24/7 on its own server,
   live data, back-and-forth voice/chat, "sir" address, greeting on arrival.
   (monopolymccann, dhaibuilds, rowanthislebrooke, techentrepruneur)
2. **The orb persona + chief-of-staff framing** — a named agent with a face
   (glowing orb UI) who "texts the morning brief" and "lives in my pocket."
   (aylablumberg.ai)
3. **A second brain that ACTS, not stores** — folders with standing rules,
   the agent moves files / drafts outreach / briefs you when done, and
   **remembers corrections**: "correct it once and it writes that down."
   (luispdoesai — the sharpest articulation in the set)
4. **Overnight autonomy with approval gates** — work drafted while you
   sleep, a morning briefing landing in a PWA with things to review and
   approve; persistent episodic memory. (alexandra.kassis)
5. **Visible agent operations** — a dashboard showing every agent/workflow
   and what each is doing in real time; zoomable "agent universe"; workflow
   maps with human-in-the-loop checkpoints. (aylablumberg.ai,
   reznikov_engineering, _no_hype_ai)
6. **Research assistant over Obsidian** — ask, it researches, files sourced
   notes into the vault. (raycfu, _no_hype_ai)
7. **Trigger novelty** — double-clap / gesture starts a workflow.
   (hex.gar, huwprosser)

Worth keeping in view: the comment threads on several of these call out the
demos as staged or hollow ("fancy UI," "show it producing or it's fake").
The differentiator is not the look — it's whether the thing verifiably acts
on real data with receipts. That is already Nova's doctrine.

## Where Nova already stands (per cluster)

1. ✅ 24/7 launchd server + Tailscale + PWA; conversation mode (streaming,
   sentence-speech, hands-free loop); voice-confirmed actions. Greeting
   layer shipped 29 July ("Good morning/afternoon/evening, sir" on arrival,
   "Welcome back, sir" after a gap; "sir" woven into the prompt register).
2. ✅ NovaCore orb; morning/evening dispatches; rituals (Phase 5). The
   "texts me my brief" part = web push (shipped) rather than SMS.
3. ✅/⚠️ Rails act on the vault with undo everywhere; agents propose edits.
   **Gap: corrections memory** — "correct it once, it writes it down" is on
   the ledger (free-text learning memory) and not yet built.
4. ✅/⚠️ Dispatch/daily-review crons draft overnight; inbox is the approval
   queue. **Gap: scheduled agent WORK beyond summaries** (e.g. a queued
   Researcher question running overnight, Studio drafts waiting at dawn).
5. ⚠️ **Gap: no live agent-operations surface.** Nova's agents leave
   receipts (inbox records, logs) but there is no one screen showing "what
   ran, what it produced, what's pending, what failed" as a living view.
6. ✅ Researcher (citation-required, review-gated) + Phase 4 in-conversation
   dispatch + sources panels.
7. ◻️ Novelty tier; possible later via iOS Shortcuts triggers. Not a
   priority — excitement should come from substance.

## What the FRAMES added (29 July, logged-in pass)

- **The wake debrief** (monopolymccann): on walking in, Jarvis *speaks what
  it did while he was away* — "I scanned your competitors over the last 48
  hours… three brand emails came in overnight" — HUD side-panels appearing
  per item. The greeting isn't a hello; it's a hello + receipts.
- **Ambient idle presence** (5 of the reels): the assistant lives on an
  always-on display even when idle — arc-reactor ring, hex HUD, green ring,
  particle orb with a live revenue ticker. Presence in the room is most of
  the "excitement."
- **The org map that breathes** (reznikov, aylablumberg): the best UIs are
  not tables — a central orb with radial domain nodes (Researcher, Chief of
  staff, Calendar, Memory, Email…), nodes glowing while active, a SPEAKING
  waveform under the core, click-to-zoom into any agent's live log.
- **The Stream** (xuztin): a chronological "touched" ledger — what surface
  changed, when, by which agent — plus an Agent Registry pane. The receipts
  unified in one place.
- **The human gate as centerpiece** (_no_hype_ai): their diagram celebrates
  "STAGE 05 — Human gate — the only checkpoint · approve / reject." Nova's
  inbox rails ARE this; the ops surface should show the gate count proudly.
- **Expressive persona states** (dhaibuilds): the HUD face has moods —
  reaction images, a "serious mode." Garnish, but it reads as personality.

Net for the build menu: item B (ops panel) should be **orb-centred map +
activity stream + pending-gate count**, not a settings-style list; and the
greeting layer grows a **deterministic wake debrief line** ("Welcome back,
sir — two items await your review"). An **ambient/wall mode** (fullscreen
idle Nova on the Mac or a spare screen) joins the menu as a cheap
high-feel candidate.

## The build menu this suggests (in value order)

A. **Corrections memory** — when Hayden corrects Nova (chat or rails), the
   correction files as a standing preference the agents' contexts load.
   Highest effectiveness-per-effort; directly the luispdoesai line.
B. **Agent operations panel** — one surface (Mission Control section or
   screen XIII+) listing recent agent runs: dispatches, reviews, Researcher
   jobs, Guardian alerts, loops — status, product, receipts, pending
   approvals. Makes the invisible machinery visible = the "excitement"
   these reels sell, but honest.
C. **Overnight work queue** — "queue this for tonight": scheduled
   Researcher/Studio jobs whose drafts land review-gated by morning.
D. **Reach (textable Nova)** — a Telegram-bot bridge to the ask pipeline so
   Nova is reachable without the PWA. Decision needed (new surface, token
   security, doctrine review). Parked unless Hayden wants it.
E. Greeting/persona layer — ✅ shipped 29 July (this commit).

Phase-6 items (native wrapper, realtime speech) remain the ceiling movers
for latency and polish; the ElevenLabs key remains the single biggest
"feel" upgrade available today.

## Addendum (30 July) — Topic Pulse, from the huwprosser wall-Jarvis reel

Hayden's ask: the brief with a LIVE visual feed — not world news, but
"news on a specific topic or things it knows I'm interested in", displayed
as cards/videos while Nova talks. The honest Nova shape:

- **Interests registry** — a small vault page (his to edit) listing topics
  he cares about, loaded like the skills/standing pages.
- **Pulse jobs** — a Researcher-lite run per topic (web-read-only, budget-
  capped): 3–5 current items, each with title + URL + source, citation
  rules unchanged. On demand ("what's new in X") or scheduled with the
  overnight queue so the morning brief carries fresh pulses.
- **Pulse panels** — rendered as link-out cards in the transcript (the
  SourcesPanel pattern; video links included, tap to open, nothing
  auto-plays) and as a rotating strip on Ambient mode — the wall display
  that talks AND shows.
- Dispatch garnish: "**Pulse.** 3 new on hybrid training; 2 on Claude."

Deterministic spine: models fetch and cite; code stores, renders, rotates.
Nothing enters the vault without review, as ever.
