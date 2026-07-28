# Companion inspiration — the "Jarvis reels" study (29 July 2026)

Hayden shared 20 Instagram reels as inspiration for what Nova should become
"in terms of effectiveness, capacity, ability and excitement." This is what
they depict, what Nova already does, and the real gaps worth building.

**Source honesty:** reviewed via each reel's caption + comment thread
(Instagram login-walls the video files). The captions describe the demos
plainly; no theme was ambiguous. Accounts: monopolymccann, aylablumberg.ai,
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
