# WiseTwinz — capture notes (Phase 3 evidence)

Method: all 21 long-form videos transcribed (captions via yt-dlp) — cleaned
copies archived privately in `~/Desktop/nova-design-history/wisetwinz-study/`.
Frames: YouTube blocked programmatic video download (HTTP 403), so UI frames
were captured by viewing the videos in a controlled browser instead; the key
UI artefact is `wt-frame-330.png`. Playback was throttled partway through the
second capture attempt — noted rather than hidden. Instagram reel: not fetched
separately; its content is the same JARVIS demo published as `MxMpcOqB8_o`
(same week, same build, same voice demo), so it is covered by that entry —
recorded here as a substitution, not a silent skip.

Who: two brothers (Luke + Rowan), channel "Wise Twins", ~4.8k subs, posting
near-daily. Their system is called **ROWZY** in-app ("Intelligence Core /
Subject: Luke"), sold/marketed as **Vitality**.

---

## The headline artefact — `wt-frame-330.png` (MxMpcOqB8_o @ 5:30)

Their answer to "Why am I tired?" is not a chat reply. It is a **full-screen
cinematic verdict card**:

- Header rail: `ROWZY · INTELLIGENCE CORE · SUBJECT: LUKE`, with nav
  BREACH / ACQUIRE / SLEEP-DEMAND / ARCHITECTURE / AUTONOMIC / HISTORY /
  SYNTHESIS.
- Eyebrow: `WHY AM I TIRED? // JARVIS VERDICT` → title
  **PHYSIOLOGICAL STABILITY SIGNAL**.
- A large animated dual-arc ring: SLEEP NEED vs DEBT ARC, centre reads
  `14.9 br/min — VERIFIED SIGNAL`, flanked by RECORDED / MISSING.
- **The equation is shown, not hidden**:
  `NEED 10H 33M − RECORDED 8H 48M = SHORTFALL 1H 45M`.
- Numbered evidence tiles: `01 // SLEEP SHORTFALL 1H 45M (below recorded
  need)`, `02 // SLEEP DEBT 2H 08M (inside recorded need)`.
- Honesty labels baked into the design: `MEASURED ALIGNMENT // NOT A
  DIAGNOSIS`, `JARVIS VERDICT // EVIDENCE COMPLETE`, `updated 3.6h ago`.
- A spoken verdict line printed under it: *"Luke, the strongest measured clue
  is an overnight stability shift. Physiological stability was 0.5 br/min
  above the recent median. A secondary sleep architecture signal also
  appeared."*

This is the single most transferable idea in the whole channel.

## Their build/ops stack (w7hDGVUIeQg, OhpwmdSEIyo)
GitHub (source + collaboration) → Supabase (accounts/permissions/data) →
Vercel (live site, phone + desktop) → Claude Code **and** Codex driving all
three via connectors. WHOOP OAuth v2 with cron key + webhook, syncing daily
"without fail"; a 5:00am job refreshes all live metrics. Distribution is a
**forkable repo**: viewers fork, deploy to Vercel, paste two SQL blocks into
Supabase, add keys — running dashboard in ~10 minutes.

`wt-frame-312.png` shows their Claude Code session mid-build: a worktree at
`/private/tmp/jarvis-voice-quality`, feature branch `codex/jarvis-five-card-
story`, **"32 working, 58 done" subagents**, and an 11-round merge process
between two humans and two AI tools. Their own video description: *"Codex
couldn't handle the visuals, so we funneled the whole project into Claude
Code (Fable 5) and it saved the build in two hours."*

## Feature inventory (with sources)

1. **Cinematic verdict cards** (MxMpcOqB8_o) — above.
2. **Five canonical question templates** (MxMpcOqB8_o @1:01): they mocked up
   five hypothetical questions, built *real equations* to answer them, then
   map "hundreds, if not thousands" of other questions onto those five so
   tone and animation stay consistent. Design-system thinking for ANSWERS.
3. **Peak Tracker** (7JY45PsBSPs): predicts, through the day, what percentage
   you'll perform at, how to raise it, and *when to schedule hard work* —
   factoring HRV, RHR, sleep, plus logged caffeine/supplements/food/meds.
4. **Live AI coach via MCP** (MSlG_mfLbPg): an "open in Claude" button from
   inside the workout screen hands the model live app state (current sets,
   vitals, supplement history, WHOOP recovery) so it coaches *between sets*.
   Their words: "a personal mentor to talk to in between sets live."
5. **Workout tracker depth** (l_xk-lToaCA, MSlG_mfLbPg): per-lift progressive-
   overload graphs over months; star/reward animation when you beat the
   graph; exercise library with per-lift info + visual demo; **swap** that
   auto-regulates the weight to the substituted lift; **tune** baseline
   (weight × sets × reps × rest interval) with "missed" marking; **deload
   mode** that turns the whole UI blue and drops the weights; a one-tap
   **overload** shortcut (+2.5 kg / +1 rep) "for a burst of motivation".
6. **Own Rocket Money** (nPSh3KJQ894, nTMWldBDKHQ): bank/finance tracking that
   gives financial advice, explicitly to stop paying for finance apps.
7. **Cross-domain correlation** (MxMpcOqB8_o @0:11): health + business +
   social-media metrics (YouTube/TikTok/Instagram API keys) cross-referenced
   in one context. Their pitch: ChatGPT can't see these; ours can.
8. **Snap-a-meal → mentor knows** (lfW0q_LRSdQ): photo logging feeding the
   same mentor that sees workouts, then asking "what should I do next / what
   supplements given my metrics".
9. **Tile-based dashboard** (tvMNmLPIQ4A): add any capability as a "tile";
   they even demo dropping in an HTML file and asking Claude to make it a
   tile. Composable-by-prompt UI.
10. **Design-before-prompt ritual** (MxMpcOqB8_o @0:47, w7hDGVUIeQg @0:52):
    Canva mockups + Maven UI inspiration *before* any prompting — "sharpen
    the axe before you chop down the tree".

## Honest notes on their system
- Cloud-hosted and multi-user (Supabase accounts) — but that means health
  data sits in someone else's database; Nova's vault-on-his-Mac is a
  deliberate, stronger privacy position.
- Their reliability story is thin: the videos are candid about 404/401
  storms, broken deployments, "the sleep data was missing", 11-round merges.
  Nova's determinism-first rails exist precisely to avoid that class.
- Much of the channel is *tutorial* content (fork this, paste that) rather
  than novel capability — T2 shorts largely restate the long-form builds.
