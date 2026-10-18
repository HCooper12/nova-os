# Core study: what Ghost's personal AI computer demonstrates, and how Nova and Wren get there

**Sources.** Two Instagram reels of the same launch film, watched frame by
frame with a Whisper transcript: a 56 s cut by @socket.ai
(https://www.instagram.com/reel/DeKLFNyNKS9/) and the 2:24 cut by
@thebillionetai (https://www.instagram.com/reel/DeJ1HmaS3bK/). Product
research: ghost.ai, Product Hunt, TechCrunch via secondary reports,
TechRadar, i-scoop, launchboosts, explainx, aiweekly (links at the end).
**His brief (18 Oct 2026):** extract every capability the product shows
that Nova and Wren lack, with each partner's own role respected (Wren has no
business with health data), then research the product so we can design
backwards from it. This week is the first proper Science Atlas week in a
while; Wren must be at full capacity with no room for unseen failure.

What is OBSERVED was seen or heard in the film. What is REPORTED comes from
the sources. What is INFERRED is my reading. Nothing below about Core is
verified by use: no independent review exists yet; the first batch ships
31 Oct 2026.

---

## 1. What the film shows, beat by beat

**0:00–0:30, the keynote room.** Zain Javaid (the reels' captions say
"Zane"; every written source says Zain) introduces Core: "a personal AI
computer. It pulls in context from your entire life and uses it to take
action in the world around you with models that run entirely on-device."
"The most capable personal AI will be the one with the most access to your
life. Core connects to everything from wearables and smart home devices to
apps and screen history."

**0:30–0:40, the health inference.** A thin mono line top-left, dimmed as it
completes: *Inspecting recent WHOOP trends… Checking recent computer
activity… Reviewing seasonal illness activity…* A card: **HEART RATE, 81
BPM**, a sparkline with the elevated point marked in red. A Google Doc
(the keynote script) with a timestamp proving he was up late. A callout:
**SEASONAL CONTEXT / SAN FRANCISCO: Respiratory illness activity typically
rises during this time of year. Flu season is beginning**, stamped **OCT 4
2026 | 1:28 AM**, drawn with a thin leader line to him. Spoken: "Core sees
that my resting heart rate is elevated, saw that I was up late last night,
and flagged that it's flu season, so I might be coming down with something.
It suggested to buy magnesium and vitamin C."

**0:44–0:55, the camera.** *Inspecting kitchen inventory…* over a wide
camera shot, with boxed labels **COCONUT WATER**, **GINGER**, **LEMON** on the
counter and a timecode. "It sees from the camera that I have the
ingredients to make an immunity shot, and shows me the process to make one
while I wait for supplements to arrive."

**1:02–1:43, the task.** "Core is a full computer. It has its own browser,
its own file system and access to all your tools. Anything you can do on a
normal computer, Core can do for you." He asks, at a laptop: "Is there
anything I'm missing for this week?" *Inspecting calendar events…* A
calendar card: October 2026, the 6th highlighted, **Design Review, Mon Oct
6, 2:00–3:00 PM, Internal, 4 attendees**; *Reviewed upcoming commitments*.
Reply, as a line of HUD text and voice: "You have a demo on Monday, but
you're still missing the GPU." "Can you find me one that comes by Friday?"
A checklist narrates the run: *Finding a compatible GPU before Friday…*
*Checking vendor inventory…* *Reaching out to vendors…* Then: **Found 3
options that can arrive before Friday**, three product cards with photo,
name and price (RTX PRO 4000 Blackwell SFF $2,999.00; RTX PRO 4000
$2,899.99; a third), one tagged **available for pickup on Wednesday**, and
one question: "Want me to order it?" "Yeah, go for it."

**1:46–2:08, recall.** On a sofa with his phone: *Looking through camera
footage from yesterday…* a camera frame with a bounding box on a drawer, and
the answer: **You put your key in the TV cabinet left drawer at 4:16 PM last
night.** Voice-over: "Agents that continually grow and learn alongside us in
the background, constantly getting better over time. Models that understand
our preferences deeply and take action just as we would."

**2:08–2:24.** The device: a small slab with one glowing edge. "In the future,
every home will have a Core. We're opening our first batch of orders today."

---

## 2. Thirty-four things the product does or claims, that matter to us

Context and memory
1. OBSERVED. Context arrives from many sources at once (a wearable, computer
   activity, the calendar, a camera) and ONE inference joins them: elevated
   HR + late night + flu season → "you might be coming down with something".
2. OBSERVED. Every fact it uses is shown as evidence with its source and a
   timestamp (the 1:28 AM document, the WHOOP sparkline, the seasonal note).
3. OBSERVED. It remembers the physical world from a camera and answers
   "where did I put my key" with the frame, the place and the minute.
4. REPORTED. "The longer you use Core, the better it gets": continuous
   context building, 24/7, not only when asked.
5. REPORTED. Integrations listed: email, calendar, finances, files,
   recordings, browser, screen history; lights, fridge, speaker, cameras;
   health records, Whoop, Oura, Eight Sleep.
6. INFERRED. The context store is the product; the model is replaceable
   (four open-weight models are preinstalled, more from Hugging Face).

Proactivity
7. OBSERVED. It speaks first when something crosses a threshold, with a
   reason chain and a suggestion ("buy magnesium and vitamin C").
8. REPORTED (ghost.ai). A timeline feed of small time-stamped cards grouped
   morning / afternoon / night: recovery score higher than usual (6:48 AM), a
   package arriving, groceries low and rain on the commute (2:15 PM), "tacos
   four days in a row", higher stress on Sunday nights, a pickup window
   between errands, an earlier departure for a weekend trip.
9. REPORTED. Kitchen-scene suggestions: an apple because you said you want
   more fruit; water after the second coffee; your keys.
10. OBSERVED. A suggestion comes WITH the way to act on it (the immunity
    shot recipe while the supplements arrive).

Working in the open
11. OBSERVED. A running trace of what it is doing right now, one line per
    step, in a quiet mono, each line dimming when done ("Inspecting calendar
    events…", "Checking vendor inventory…", "Reaching out to vendors…").
12. OBSERVED. The trace is written in plain verbs about the world, never
    about tools ("Reaching out to vendors", not "calling fetch").
13. OBSERVED. The first spoken word comes after the trace has shown the
    work, so the answer never feels like a guess.
14. OBSERVED. The HUD stays visually quiet: thin lines, small caps labels,
    one accent colour per card (red for the heart rate), leader lines to the
    thing in the room. Nothing bounces.

Acting
15. OBSERVED. A multi-step task (find → check inventory → contact vendors)
    runs to a RESULT, and the result is a choice: three ranked option cards
    with price and availability, one marked best, and a single confirm.
16. OBSERVED. The confirm is spoken ("Yeah, go for it") and the act is
    external (an order), so the loop is closed in the world.
17. REPORTED. "Own browser, own file system, access to all your tools";
    agents research the web, and (per one caption) make phone calls.
18. REPORTED. The user controls how much autonomy agents have; a credential
    firewall to govern agents' use of logins is still being built.
19. INFERRED. Nothing in the film shows a failure state, a refusal, or a
    wrong inference. Trust is asserted by the trace, not demonstrated by a
    record.

Perception
20. OBSERVED. Live camera understanding with object labels and timecodes.
21. REPORTED. Text, image, audio and live video processed in real time.
22. REPORTED. Screen history as a context source.

Speed and locality
23. OBSERVED. Replies arrive within a sentence of the question; no visible
    wait beyond the trace.
24. REPORTED. All inference on-device: RTX PRO 4000 Blackwell 24 GB, Ryzen 5
    7600, 64 GB DDR5, 1 TB NVMe; Qwen 3.8-Next, Qwen 3.8-27B, Gemma 4-31B,
    Muse-Glimmer-30B. One caption claims 87 tok/s on the 27B; Ghost has
    published no numbers.
25. REPORTED. No subscription, no per-token cost, no cloud dependency for
    inference; web search, email and updates still need the internet.
26. REPORTED. Encrypted on-device, keys held by the user; works if the
    company shuts down.

Interaction
27. REPORTED. No screen on the device: phone app, web app and voice through
    the app (one caption also says iMessage).
28. OBSERVED. One voice, calm, short sentences, the answer first ("You have a
    demo on Monday, but you're still missing the GPU.").
29. OBSERVED. The physical device has one status signal: a glowing edge.

What the film does not show
30. No numbers that could be checked against anything; every card is a
    staged example.
31. No visible receipts: what it did last night, what it got wrong, what it
    spent.
32. No way to see or edit what it remembers.
33. No handling of a conflict between sources (WHOOP says one thing, the
    calendar another).
34. No independent review exists; shipping starts 31 Oct 2026.

---

## 3. The product, as researched

- **Company.** Ghost, San Francisco, out of stealth 5 Oct 2026, $11M seed
  led by Andreessen Horowitz (with Abstract, Audacious Ventures, SV Angel and
  Nova). Founder Zain Javaid, 19, a former quant; team of four. Units
  assembled in San Francisco. Core is $3,499, 30-day returns, no
  subscription; batch 1 sold out within hours; register interest for the
  next.
- **Positioning.** "Intelligence you own." A "brain in a box": source code,
  logic and model weights live on the device; "the user owns all of it".
- **Hardware.** NVIDIA RTX PRO 4000 Blackwell SFF (24 GB GDDR7 ECC, 432
  GB/s), AMD Ryzen 5 7600, 64 GB DDR5, 1 TB NVMe. Practical ceiling: ~30B
  dense models at 4–5-bit quantisation; a 70B would need CPU offload.
- **Software, as far as anyone knows.** Preinstalled open-weight models,
  more installable from Hugging Face; continuous background agents; a
  context store built from apps, files, screen history and devices; a phone
  and web app with voice through the app; proactive cards; autonomy set by
  the user; a credential firewall not yet built; a firewall on outgoing
  requests; OTA updates. One caption names local agent harnesses (OpenCode,
  OpenClaw, Hermes); Ghost does not.
- **What is unknown or thin.** How memory is stored, retained or deleted;
  how local and remote work split (web search, email and updates leave the
  home); permissions in detail; power and noise; any measured accuracy.
  Every commentator says the same thing: it is a promise until reviewed, and
  trust will come from "transparent logs, clear permissions and a track
  record of small tasks done right."

**The honest reading for us.** Core's film is a design target, not a
capability we lack by much. Nova already has most of the machinery (a 24/7
server, ~44 code-driven loops, alerts with an anatomy, a running glass, an
inbox with undo, hands that act). What Core demonstrates and we do not yet do
well is the SHAPE of it: context joined across sources into one inference,
evidence with provenance on every card, a live trace while work happens,
options instead of a yes/no, a time-ordered feed instead of a drawer, and a
closed loop in the world. The one place Core is categorically ahead is
perception (camera, screen history) and the one place it is categorically
behind is accountability (no receipts, no record of being wrong).

---

## 4. Where Nova stands against it

| Core shows | Nova today | Gap |
|---|---|---|
| Joined inference across sources | Each loop reads its own slice (healthSentinel, calendarWatch, coachCadence…); Coach gets training analytics; Ask Nova gets 20 context sections | No code that correlates HRV + sleep + calendar + load into ONE finding with a reason chain. `correlate.js` exists; it is not wired to the alert layer. |
| Evidence with source and time on every card | Alert cards carry LABEL/WHAT/WHERE/SOURCE; running-glass VIS kinds (metric, bars, list…); time only when a composer puts it in `where` | No system-wide "as of" + source stamp; no sparkline-with-source card for a sensor; no leader lines from a card to its subject. |
| Running trace, one line per step, dimming | Researcher stages (jobBeats.js), Code builder stages, Form check stages; island toast "asking…"; `stageLine` for a slow consult | Coarse, once-only beats, three lanes only. Tool calls inside a Claude turn are never shown. |
| Proactive timeline feed | Morning/evening dispatch, the Morning Show, IslandFeed, alerts now/next/later, inbox cards | No chronological feed of small contextual cards across the day; proactive things land in five different places. |
| Options + one confirm | Inbox yes/no with undo; verbs `confirm` tier; modelChoice two-option gate; Coach PROPOSE cards | No "found three, which one" card; no checklist that ends in an external act. |
| Closed loop in the world | Hands: Shortcuts, the Mac, the browser hand (stops before anything that commits), Telegram | Nothing orders or books; by design the browser hand stops before a commit. |
| Recall from recorded context | Conversation record, vault recall, local embeddings, food/health/workout logs | Digital record only. No camera, no screen history (both are decisions, see §7). |
| Connectors | iCloud calendar, HealthKit + Shortcut, Telegram, Notion, Todoist, bank CSV, Spotify, YouTube | No email, no wearable API (HealthKit covers Watch), no live finance, no cameras. |
| Local inference | Kokoro TTS, Whisper, Ollama embeddings, reflex/verbs/capture by code; `localModel.js` built and measured, never wired | No local LLM lane in production; every judgment stops at the Claude limit. |
| Failure visibility | Ops screen heartbeats, Guardian, SYSTEM alerts, inbox error records | Scheduler start failures reach a log and a stale heartbeat, not him. |

## 5. Where Wren stands against it (project scope only)

| Core shows | Wren today | Gap |
|---|---|---|
| Joined inference | ~20 deterministic noticers (approvals, repairs, stale sources, git, uncommitted work, failing checkers, night watch…) | Each notice is one fact. Nothing joins "night watch found X" + "phase Y is blocked" + "decision Z is open" into one morning finding with a reason chain. |
| Evidence with provenance | Citations `path:line` required and now resolved; `/api/cite`; freshness "3.6 hours old" per source; notices carry `noticedAt` | The ask path emits a `sources` event the dock never renders; timestamps sit on notices, not on each fact in an answer. |
| Running trace | Builds stream every tool call into a drawer log (the closest thing to Core's trace anywhere in either product); answers show one `stage` line | Answers do not show the Reads/Greps as they happen; no dimming trace on the pill. |
| Proactive feed | Notices drawer + orb badge; weekly ideas (Sunday 05:10); night watch at 03:40 | No morning card that opens the day ("overnight: X measured, Y broke, Z needs you"); nothing spoken first, ever. |
| Options + one confirm | Builder brief read-back + token; approvals one-tap; decisions yes; phases one at a time | No alternatives presented for a choice; no "three ways to close this phase, pick one". |
| Closed loop in the world | Builds run Claude Code sessions; Notion boards written | Fine for the project; nothing external is needed. |
| Recall | transcripts, standing.md, profile, BM25 brain over the repo, worldDelta since last turn | Recall only started working this week (budget bug); no record of "what did Wren decide last Tuesday and why". |
| Connectors | git, state files, Notion REST + MCP, Mission Control, Claude Code sessions | None missing for its role. |
| Local inference | Kokoro, Whisper, reflex, all noticers by code | Answers, builds, repairs, ideas all stop at the Claude limit; the night verdict degrades to a code note (good). |
| Failure visibility | Notices for noticer failures, repairs, night-watch silence; RATE LIMIT / ERROR / OFFLINE cards | Auto-act, build-queue and ideas failures go to the log unless a noticer happens to cover them; the launchd night-watch plist is NOT installed (the in-process timer does the work: a single point of failure that only `night:silent` would reveal, the next day). |

---

## 6. Designing backwards: the architecture Core implies, and ours

Core's stack, inferred: **perception → context store with timestamps →
noticers (code) → inferences (model, over the store) → proposals with one
confirm → hands that act → a trace and a feed that make all of it visible.**
Nova's stack is the same shape with two weak joints (inference across
sources; the visible layer) and Wren's has the same two. So the plan is
not a new product; it is five capabilities added to the joints, each
honouring the house rules: deterministic first, undoable, honest
degradation, autonomy earned, no fake data, no guessing.

### 6.1 The working trace (both)
A job narrates every step it takes, in world-verbs, as it takes it.
- **Server:** every model job already streams `stream-json`; each
  `tool_use` becomes a trace line written by CODE from the tool and its
  input (`Read Wiki/Health/Workouts/2026-10-14.md` → "Reading Tuesday's
  session"; `Grep "bench"` → "Searching your workout log for bench";
  `WebSearch` → "Searching the web for …"; a consult → "Asking the
  Researcher"). Lines carry `at`, `done`, `ms`. Nova: `server/lib/trace.js`
  fed from `claudeCode.js`'s stream loop, exposed on the job poll as
  `trace[]`. Wren: the builder's `describeTool` already does this; lift it
  to `lib/ask.mjs` as a `trace` SSE event.
- **Client:** a quiet mono list under the island / on the pill, newest at
  the bottom, each line dimming to 55% when done, the whole list folding into
  "3 steps" when the first sentence is spoken (keynote-motion: one hero, a
  held after-state; `prefers-reduced-motion` honoured). Nova:
  `src/WorkingTrace.jsx`, the island activity; Wren: `dock.js` pill.
- **Rule:** never a line the code cannot vouch for. A tool call that fails is
  a line too ("Could not read the calendar cache").
- **Verify:** the receipt gains `traceSteps` and `firstTraceMs`; the bench
  shows a line within 1 s of the ask.

### 6.2 Evidence cards with provenance (both)
Every fact Nova or Wren shows carries where it came from and when.
- **Shared contract:** an evidence object `{ what, value, source, asOf,
  ref }` where `source` is a closed list (Apple Health, your calendar, your
  workout log, the vault note X, the Researcher brief Y, node-status.json,
  STATE.md:212) and `ref` opens it. Nova: extend `panels.js` so every VIS
  kind and every alert carries `source` + `asOf`; render a footer line "from
  Apple Health · as of 06:48" on every card (`CardHead` meta). A new
  `metric` variant draws the sparkline with the flagged point (the HR card).
  Wren: render the `sources` event the dock already receives as a sources
  strip under the answer, each chip `path:line` → `/api/cite`; the
  `freshness` age joins the chip.
- **Rule:** a fact without a source is not shown (honest degradation: "no
  reading since Tuesday" is itself a card).

### 6.3 Joined inference with a reason chain (Nova: health + training; Wren: the project)
The one thing Core does that neither of ours does: read several sources and
say one thing with its reasons.
- **Nova, code first:** `server/lib/correlate.js` becomes the morning
  "findings" pass: rules over the evidence store (HRV vs 14-day baseline,
  sleep debt, yesterday's load, today's calendar density, a cold-season flag
  from the date) producing at most ONE finding a day with a chain of evidence
  cards and a suggestion that is a verb he can tap ("Make today's session a
  B-session"; "Add magnesium to the list"). The model is used only to word
  the finding from the chain, never to find it (his rule: models interpret,
  code decides). Tier `next`; receipts via the alert layer; demotion by the
  pattern scout if he ignores it.
- **Wren, code first:** `lib/findings.mjs`: the morning join of night watch
  + notices + plan check + open decisions + git, producing ONE "today's
  first thing" card with the chain (the night report line, the blocked
  phase, the open decision, the stale source) and a single action (open the
  phase / answer the decision / run the repair). Spoken once at his first
  spoken turn of the day as "One thing first: …" (Nova's alert layer already
  has this move). Nothing proactive speaks on a clock; it waits for him.

### 6.4 Options and one confirm (both)
- A proposal may carry `options[]` (2–3), each `{ label, detail, cost?, when?,
  best? }`, rendered as option cards with the best one marked; the confirm is
  one tap or one word ("the second one"). Nova: a new inbox record kind
  `choice` with `undoData` per option; verbs grammar "the first/second one".
  Wren: the Builder brief read-back gains alternatives ("Three ways to close
  this phase"); the decision yes takes a choice.
- Multi-step runs end in a result card, never a paragraph: the checklist
  trace above folds into "Done: found 3 options" and the options appear.

### 6.5 The feed (Nova) and the morning card (Wren)
- **Nova:** one chronological **Today feed** on Home (Summary style), small
  cards stamped with the time they were raised, grouped morning / afternoon
  / night, fed from the alert layer, the dispatch, the Coach cadence and the
  findings pass; each card has the anatomy and ONE action; tapping away
  leaves a receipt. The island remains the interrupt; the feed is the
  record. Banner-blindness rule: it is content, not a banner.
- **Wren:** the dock's first card of the day is the finding (6.3); the notice
  drawer stays as the full list.

### 6.6 Closed loop in the world (Nova only, later)
Core orders a GPU. Nova's browser hand stops before anything commits, by
design. Keep that. The honest step is a **cart, not a purchase**: the hand
fills the basket and hands him the checkout, as an option card. Any change
to this is his decision alone.

### 6.7 Perception (Nova only, his decision)
Camera and screen history are what make Core's recall possible. For Nova
they are a privacy decision, not a feature gap to close by default. If he
wants either: (a) screen history on the Mac via a local, searchable
timeline (Rewind-style; the Mac hand already runs on his Mac); (b) a camera
only in the gym for form checks, which exists as upload today. Not
proposed for this week.

### 6.8 Using them without worrying about Claude's limit
What Core sells is zero dependence on a cloud model. What we can do
honestly on a 16 GB M1 Pro:
- **Already independent of Claude:** every code loop (44 in Nova, all of
  Wren's noticers, freshness, night-watch passes), reflex answers, verbs,
  acks, capture (`captureLocal.js`), food description fallback, Kokoro,
  Whisper, embeddings. These never stop.
- **What stops at the limit today:** every judgment lane (Ask Nova, Coach,
  Leader, Researcher, planToday, dailyReview, Wren answers, builds, repairs,
  ideas). Nova hands the question back with the limit notice; Wren raises a
  RATE LIMIT card.
- **Option A, a second door (recommended for this week):** route the
  conversational lanes through an API key when the subscription limit is
  hit, with a visible "metered" label and a per-day ceiling he sets. Same
  models, same quality, pay-per-token instead of stopping. Needs: an
  `ANTHROPIC_API_KEY` in both `.env`s, a fallback in `claudeCode.js` /
  `claude.mjs` that re-runs the turn through the Agent SDK or `claude -p`
  with the key, a Settings switch and a spend meter. Honest cost: a Wren
  Advisor turn is $0.03–0.22; a Coach turn $0.2–1.5.
- **Option B, a local lane for the small jobs:** wire `localModel.js`
  (mlx_lm, Qwen3-4B measured 25 Sep: 65% route agreement with Haiku, 2.5 s
  median, 2.5 GB RSS) for classification, acks, summaries, the night
  verdict's wording, the Pulse; never for Coach/Leader/Builder judgment. A
  ~8B 4-bit model is the ceiling on this Mac; it is not a Claude substitute.
- **Option C, hardware:** a Core, a DGX Spark, or a Mac Studio (64–128 GB)
  would run a 27–31B model locally at usable speed; that is the only path to
  Core's "no limit, ever", and it is a purchase decision.

### 6.9 No unseen failure (Wren first, this week)
- **Preflight at every open and every morning:** a code-written systems
  check surfaced as the first dock card: Notion reachable, git clean/dirty,
  night watch ran (and when), auto-act queue state, last build result,
  sidecar ready, Claude limit state, uncommitted work count. Faults first,
  "all green" in one line otherwise. (Nova has `run checks`; Wren gets
  `preflight`.)
- **Every background path reports to him, not the log:** auto-act start
  failure, build-queue failure, the ideas run failing → notices with a
  "Read why" action.
- **Install the night-watch plist** or declare the in-process timer the
  owner and have `night:silent` fire at 07:00 the same morning, not the next
  day.
- **Receipts are read weekly:** `tools/voice-latency.mjs` (ask receipts:
  attempts, rejections, cost per ask, spawn overhead) and the repair ledger.
- **The Builder cannot test or commit** (standing); every build ends with
  the check it ran and its result on the card.

---

## 7. Build order

**Week of 20 Oct (Wren first, because the Atlas week is now):**
1. Wren preflight card + background failures as notices (6.9).
2. Wren sources strip + trace lines on answers (6.1, 6.2; the builder's
   `describeTool` is the pattern).
3. Wren morning finding (6.3) with "One thing first".
4. The metered second door for both (6.8 A), off by default until he turns
   it on.

**Then Nova:** the working trace (6.1), provenance on every card (6.2), the
Today feed (6.5), the findings pass (6.3), choice cards (6.4).

**His decisions, listed at the end of the session recap.**

---

## Sources
- Ghost product page: https://ghost.ai
- Product Hunt: https://www.producthunt.com/products/ghost-core
- TechCrunch coverage via Yahoo: https://tech.yahoo.com/ai/apple-intelligence/articles/19-founder-raises-11-million-180707350.html
- TechRadar: https://www.techradar.com/ai-platforms-assistants/teen-founder-reveals-personal-ai-computer-for-running-local-agents-usd3-499-mac-mini-rival-runs-on-nvidia-rtx-pro-4000-gpu-and-promises-to-be-a-subscription-free-brain-in-a-box
- i-scoop: https://www.i-scoop.eu/ghost-ai-pc-core/
- launchboosts: https://launchboosts.com/blog/ghost-core-personal-ai-computer-specs-explained
- explainx: https://explainx.ai/blog/ghost-core-personal-ai-computer-on-device-3499-2026
- aiweekly: https://aiweekly.co/alerts/ghost-raises-11m-to-sell-3499-core-pc-running-local-ai-agents
- FourWeekMBA (support-page caveats, not fetched: 403): https://fourweekmba.com/ai-ghost-core-3499-personal-ai-computer-models-on-device-web-se/
- Digg summary: https://digg.com/ai/b4pjnza7
