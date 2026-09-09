# Darwin vs Nova — study, diff, and roadmap

Sources: all **8** Instagram posts on `@darwinaiassistant` (the whole account —
the profile's own metadata says 8 posts), read frame-by-frame from burned-in
subtitles; plus the product site in full, including a changelog that annotates
**43 releases between 13 June and 7 September 2026**. Evidence and method:
`design/darwin/NOTES.md`. Baseline written before viewing:
`design/darwin/NOVA-BASELINE.md`.

**Caveat that governs everything below:** Darwin was never run. Every claim
about it comes from its own marketing, changelog and demo reels — a vendor
describing itself. Treat the feature list as *what they say they do*.

---

## The one-paragraph answer

Darwin is the closest thing to a true peer Nova has yet been measured against —
same dream (JARVIS, personally owned), same architecture instinct (**plain
Markdown files on your own disk as the source of truth, an index derived from
them**), even the same plumbing (Tailscale, Claude Code as a flat-rate brain,
Groq for speech-to-text, Obsidian-compatible `[[links]]`). It is a commercial
Windows product by a working engineer who built it for himself first, and it
has shipped 43 releases in 12 weeks. **Nova is deeper where it matters most to
Hayden** — a real coach with deterministic engines over years of his own logged
history, undo rails on every write, honest degradation as doctrine, and a body
of domain knowledge Darwin has no equivalent of. **Darwin is ahead on being a
general-purpose operating layer**: it reaches email, arbitrary documents, the
smart home and other applications; its memory recalls by *meaning* rather than
by keyword; its agents are user-creatable, role-bounded objects with their own
memory; its automations are built by the user rather than compiled into the
codebase; and it can *write itself a new tool mid-conversation*. The single
largest gap is not a feature — it is that **Nova's capabilities are fixed at
build time and Darwin's are not**. Everything Nova can do, Hayden asked a
session to write. Everything Darwin can do, its owner can add himself.

---

## Where Nova is already ahead

| | Nova | Darwin |
|---|---|---|
| Depth in one domain | a real coach: progressions, RPE autoregulation, plateau/PR detection, volume vs goal targets, deload, readiness, periodised blocks, injury log, carryovers, make-up days, form check against his own lifts | no domain depth — a general assistant |
| Grounding | years of his own logged training, food, health, money, calendar | whatever you put in this week |
| Undo | everything writeable is undoable, on inbox rails with `undoData` | "a backup first" on documents; no undo story |
| Determinism | models decide, **code acts**; a model's output never writes unmediated | model narrates and acts, guarded by an access code |
| Honest degradation | doctrine-level: missing data says so, stale data self-labels | good instincts, ad-hoc (though see §"where they're honest" — it is better than most) |
| Cost governance | per-capability **ceilings** that cannot be exceeded, shown before approval | live cost counter — visibility, not a limit |
| Test discipline | 192 suites, 1,296 tests | unknown; 1,359 commits in 12 weeks suggests speed over suites |
| Its own doctrine | `NOVA_LENS` shared by every agent; `NOVA-METHOD.md`; a session handoff | `DARWIN-DEV.md` for your own Claude Code — the same idea, thinner |
| Voice cost | local Kokoro-82M on MLX, free, offline | ElevenLabs, metered, and it runs out (they ship a "voice failed" path for exactly that) |
| Platform | macOS/iOS, a PWA he can install | Windows only |

Nova also already has several things Darwin sells as headline features: a
memory galaxy, themes, a Telegram bridge, Tailscale reach, sentence-streamed
speech with barge-in, deterministic sub-second answers with no model in the
loop, and a research/watch/study agent family.

---

## Where Darwin is ahead — the real list

### 1. Memory that recalls by meaning (the biggest single gap)
Darwin runs a **local embedder** (`nomic-embed-text` via Ollama, visible in the
install reel) over the vault. Before *every* answer it automatically pulls the
**6 nearest** pieces of memory — no command, no special mode. Nova's
`recall.js` is deterministic **lexical** search: it tokenises and scores by
term overlap. Their own pitch line is the exact failure Nova has: *"forgot what
you called that note? it recalls by meaning, not by words."*

Three refinements they have thought about and Nova has not:
- **The sieve.** Bulk content (documents, standards, scans) may occupy **at
  most half** the recall slots, so an archive cannot steamroll hand-written
  notes.
- **Conversation memory is a second-class source.** They keep conversations,
  but rank them below notes, with a stated reason: *"a conversation contains
  things that later turned out to be wrong, and Darwin must not recycle his own
  old guess as a fact. What should hold permanently belongs in a note — a
  conversation is a record, not a conclusion."*
- **A write gate**: a new fact **replaces** the old one, rather than
  accumulating contradictions.

### 2. Agents as objects the owner creates, not lanes a developer compiles
In Darwin an agent is a thing you make by voice — *"create an agent called
Engineer"* — give a role written like a job description, hand folders of
knowledge (drag a folder onto its memory card), and assign a working folder it
may write to versus knowledge folders it may only read. Each agent has its own
**locked memory core** (a diary it writes itself, protected from deletion), its
own brain, voice, face and personality. Nova's twelve-plus agents are excellent
and entirely **fixed in code**.

### 3. The agent that said no
The best thirty seconds on the whole account. He asked his existing agent to
run videos for his personal Instagram. It refused — *"Not 'I can't' — 'don't
mix projects like this, create a dedicated agent for that account.'"* Then it
proposed the right structure, and a few seconds later the new agent existed.
**An agent that declines out-of-role work and proposes the correct
organisation** is a genuinely novel autonomy primitive, and it is squarely
inside Nova's doctrine (propose, never assume) — Nova simply has no notion of
an agent having a *role boundary it can reason about*.

### 4. It writes itself the tool it is missing
Pro tier: *"Ask for something he has no way of doing yet, and instead of 'I
can't do that', he writes the tool, adds it to himself, and uses it — in the
same conversation."* And then: **a button for it appears on the dashboard by
itself** (plugin pages, since 2.0.18). Nova has `forge.js`, `skills.js` and
`patternScout` proposing skills — but the loop from "missing capability" to
"working, surfaced capability" still runs through Hayden opening a session.

### 5. User-built automations with real-world triggers
Processes trigger on a **schedule, a changed folder, a specific e-mail, a
calendar event, or a day of the month (1–31 or "last day")**. They chain, run
review-then-approve, respect active hours, survive restarts, and keep readable
run logs. Nova's 32 schedulers are superb and **hard-coded**; Hayden cannot
make a new one without a build.

Two details worth stealing outright:
- **Unattended automation is sandboxed** — it cannot reach the web or mail out.
- **The morning brief reads out what your own processes did overnight.** Nova's
  dispatch reports his data; it does not report Nova's own work back to him.

### 6. Approvals that reach him, and that he can answer in words
Approval buttons on the phone, synced with the PC, plus **approval by e-mail
from anywhere** (counted only from his own verified address). And the detail
that makes it: a **third button, ✍ Feedback** — answer an approval *in your own
words*, typed or spoken, at full length, saying what to change. Nova's
proposals wait in an inbox for him to come to them; they are approve/decline.

### 7. Email — the whole domain is absent from Nova
Gmail and Outlook, multiple mailboxes, triage, drafts *in your tone*, invoice
filing, sending from a specific company address, and caps (mails per read, days
back, characters per mail) so a mailbox cannot blow the context. Nova has no
email at all. For "the one app he opens every day", this is the largest missing
surface after memory.

### 8. Reach into other applications, and into the house
- **EasyCAD/AutoCAD bridge**, and the pattern is the interesting part: the
  little Darwin **polls** ("got anything for me?" every ~5s) so AutoCAD is
  **never a server** — no open ports, no firewall rules; tasks **queue** while
  the app is closed; remote tasks run in an **isolated context** so they never
  mix into the conversation open on screen; and it **shares one semantic index**
  rather than building a second.
- **The house as a live 3D model** — rooms, pool, garden, heating circuit,
  buffer tank, heat-pump output, hot water — with readings rendered *where they
  belong in the model*, lights toggled inside it, and a radar view. Nova has a
  3D anatomy model driven by real data; this is the same idea pointed at a
  different domain.

### 9. Choice of brain, including a free local one
Four brains — own API key, Claude Code flat-rate, GPT/Codex subscription, local
Ollama — one toolset across all of them, switchable mid-day, with **only brains
that actually work offered** during setup, and a local model that *"leaves
heavy work to the cloud, and says so honestly."* Nova is Claude-only with no
offline brain.

### 10. Presentation and instrumentation
- **Live hardware telemetry** in the cockpit: CPU, GPU, VRAM, RAM, disk, GPU
  and disk temperatures, link, uptime, version, session length.
- **A cost/session HUD**: turns, tokens ↑↓, cost Σ, which brain, which voice.
- **A particle face** that lip-syncs to speech, per-agent faces, six named
  themes, a settings surface of **37 sections with search**.
- **A guided tour of the settings, narrated in the assistant's own voice.**
- **The assistant narrates its own installation in first person** — *"Hello,
  Darwin here. You've just made an excellent decision and I'm about to move
  in."*

### 11. Small things that are cheap and good
Automatic reply language (answer in the language he spoke, while briefings and
reports stay in the interface language); a **standard test line** for comparing
voices; voice failure that *finishes in text and says exactly what broke*
rather than hanging in "speaking"; a locked phone screen no longer killing a
turn; an update that shows the notes of every version you skipped; world
clocks; *"surprise me with a game"* building a playable Snake or Breakout in
your colours; a **"no tools, writes text only"** mode for agents that talk to
strangers.

---

## Where Darwin is weaker than it looks

- **It is marketing.** 43 releases in 12 weeks with 1,359 commits, and the
  changelog is full of fixes for things that were broken in the wild
  ("safeguards from the first support wave", "a broken automation entry no
  longer takes the scheduler down", voice that "fails gracefully"). Shipping
  fast is not the same as shipping solid.
- **No undo.** Documents get "a backup first"; nothing describes reversing an
  action after the fact. Nova's inbox rails are a genuine structural advantage.
- **No determinism story.** The model acts; the guard is an access code and an
  approval prompt, not tested code standing between intent and disk.
- **No domain depth.** It is a horizontal assistant. It has nothing like the
  Coach.
- **Metered voice.** ElevenLabs runs out — they ship a failure path for it.
- **Gestures are admitted theatre.** Their own caption: *"gestures — useless,
  but fancy :)"*.
- **Windows only**, and the memory-sharing story leans on OneDrive/NAS.

---

## Where they are more honest than most, and Nova should notice

They publish the real numbers (107,000+ memory pieces on one instance, ~1s
search); they say the local brain is weaker and *when* it will defer; they warn
buyers off the genre's own hype — *"Ignore the 'whole app from one prompt'
clips — feeds distort"*, *"Real tasks take real minutes"*; and they give away
four Claude Code prompts to build a toy version, then tell you exactly what
you've got: *"the skeleton does not read your mail, does not touch your files,
does not remember across months — and nothing in it stops it from doing
something you never asked for. The rest is Darwin: the guardrails, the mistakes
already made."* That last sentence is the best articulation of Nova's own value
that this study found, written by a competitor.

---

# The full mapping — every idea, and where Nova stands

`HAVE` = shipped in Nova · `PART` = partially there · `GAP` = absent.

### Memory
| # | Idea | Nova |
|---|---|---|
| 1 | Markdown notes on own disk, Obsidian-compatible, `[[links]]` | HAVE |
| 2 | Vault is truth, index is derived and rebuildable | HAVE |
| 3 | Local embedder turns memory into vectors | **GAP** |
| 4 | Automatic semantic recall of N nearest pieces, every turn | **GAP** |
| 5 | 3D memory graph, orbit, focus-a-branch, open the note | PART (Galaxy) |
| 6 | Separate "map of meanings" embedding-space view | **GAP** |
| 7 | Five memory layers (facts / vault / agent / process / semantic) | PART |
| 8 | Per-agent memory card: locked self-written diary + assigned knowledge | **GAP** |
| 9 | Assign knowledge by dragging a folder onto an agent | **GAP** |
| 10 | Process memory: an automation's own context + past-run log | PART |
| 11 | Write gate — a new fact replaces the old | PART (`standing.js`) |
| 12 | A "forget" tool that really deletes | **GAP** |
| 13 | Conversations kept but ranked below notes, with a stated reason | **GAP** |
| 14 | The sieve — bulk content capped at half the recall slots | **GAP** |
| 15 | General OCR for scans and photographed documents | PART (targeted only) |
| 16 | Document libraries browsed level by level | PART |
| 17 | Memory shared across devices via his own storage | **GAP** |
| 18 | Published memory-scale telemetry (size, latency, cost) | **GAP** |
| 19 | Fix a wrong memory by editing one line | HAVE |

### Agents
| # | Idea | Nova |
|---|---|---|
| 20 | A team of specialists, each with own memory/voice/face/personality | PART |
| 21 | Create an agent by voice | **GAP** |
| 22 | Edit an agent by voice (rename, voice, brain, role) | **GAP** |
| 23 | Role written like a job description, by the owner | **GAP** |
| 24 | **Agent declines out-of-role work and proposes a dedicated agent** | **GAP** |
| 25 | Projects: nested, aliases, write-folder vs read-only knowledge folders | **GAP** |
| 26 | "No tools — writes text only" mode for outward-facing agents | **GAP** |
| 27 | Route to a specialist by matching roles *before* spending a model call | PART |
| 28 | Per-agent brain (cloud or local) | PART (`modelPrefs`) |
| 29 | An agent mailbox | **GAP** |
| 30 | New agents start on a capable model, not the cheapest | HAVE |
| 31 | An agent with a read-only folder says exactly what it lacks | HAVE |
| 32 | Agents working in parallel on one job | PART (`planner`) |

### Automation
| # | Idea | Nova |
|---|---|---|
| 33 | **User-created automations** (no code change) | **GAP** |
| 34 | Triggers: changed folder, specific e-mail, calendar event, day-of-month | **GAP** |
| 35 | Chained processes | PART |
| 36 | Review-then-approve on a process | HAVE |
| 37 | Active hours | PART (`cadence.js`) |
| 38 | Readable full run logs | PART (`ops`, `streamFeed`) |
| 39 | **Morning brief reports what Nova's own processes did** | **GAP** |
| 40 | A broken entry cannot take the scheduler down | PART |
| 41 | **Unattended automation sandboxed from web and outbound mail** | **GAP** |

### Reach and approvals
| # | Idea | Nova |
|---|---|---|
| 42 | Approval buttons on the phone, synced with desktop | PART |
| 43 | **Approve by e-mail, only from his verified address** | **GAP** |
| 44 | **✍ Feedback — answer an approval in his own words** | **GAP** |
| 45 | E2E-encrypted phone channel with voice notes, files, approvals | **GAP** |
| 46 | Telegram with voice notes | HAVE (**broken — see below**) |
| 47 | Result finds him anywhere: on-screen, push, and a durable chat record | PART |
| 48 | A locked phone screen doesn't kill the turn | PART |
| 49 | Trusted-device pairing; unpaired devices get only a pairing card | **GAP** |
| 50 | Own tunnel on one click, or Tailscale | HAVE |

### Email, documents, media
| # | Idea | Nova |
|---|---|---|
| 51 | **Gmail/Outlook, multiple mailboxes** | **GAP** |
| 52 | **Inbox triage + drafts in his tone + invoice filing, he approves** | **GAP** |
| 53 | Mail caps: per read, days back, characters per mail | **GAP** |
| 54 | Create/edit 9 document formats with a backup first | PART |
| 55 | Read whole documents and archives | PART |
| 56 | Video → scenes + timed transcript + description into memory | PART (in flight) |
| 57 | Dub/translate a video, re-sync lips, generate subtitles | **GAP** |
| 58 | Generate images and video | **GAP** |
| 59 | Turn a macro-laden spreadsheet into a browser app | PART (`forge`) |

### Integrations and the physical world
| # | Idea | Nova |
|---|---|---|
| 60 | Smart-home devices (Tuya/Kasa) by voice, dashboard or phone | **GAP** |
| 61 | **The house as a live 3D model with readings placed in it** | **GAP** |
| 62 | Bridge into a desktop app via a **polling queue, never a server** | **GAP** |
| 63 | Queued tasks survive the target app being closed | **GAP** |
| 64 | Remote tasks run in an isolated context, never mixing conversations | **GAP** |
| 65 | One shared semantic index across integrations | **GAP** |
| 66 | Spotify / music by voice | **GAP** |
| 67 | Social DMs with every reply approved | **GAP** |
| 68 | Calendar read/write | HAVE |

### Brains, cost, security
| # | Idea | Nova |
|---|---|---|
| 69 | Several brains incl. a **free local model**, switchable any time | PART |
| 70 | Only brains that actually work are offered at setup | **GAP** |
| 71 | Local brain defers heavy work and says so | **GAP** |
| 72 | Cheap probe instead of a full turn to check a metered brain | **GAP** |
| 73 | **Live cost/token/turn HUD** | PART (ceilings, no live HUD) |
| 74 | Cost ceilings that cannot be exceeded | HAVE (ahead) |
| 75 | Access code enforced server-side on sensitive actions | PART |
| 76 | Local audit log | PART |
| 77 | **Credential vault that verifies domain + certificate before filling** | **GAP** |
| 78 | Passwords never in chat | HAVE |
| 79 | Service log that never records speech or secrets | PART |
| 80 | Remote component signature-verified before start; rate-limited unlock | **GAP** |
| 81 | Read-only, expiring support mode | **GAP** |

### Interface and presence
| # | Idea | Nova |
|---|---|---|
| 82 | **Live hardware telemetry (CPU/GPU/VRAM/temps/uptime/version)** | **GAP** |
| 83 | Particle face that lip-syncs; per-agent faces | PART (reactive core) |
| 84 | Named themes + a single accent colour for the whole cockpit | HAVE |
| 85 | Settings with search across many sections | PART |
| 86 | Capabilities individually switched on/off by the owner | PART |
| 87 | **Guided settings tour, narrated in Nova's own voice** | **GAP** |
| 88 | **The assistant narrates its own install/onboarding in first person** | **GAP** |
| 89 | Task planner: groups, sub-tasks, due dates, a board | PART (`todos`) |
| 90 | Resizable conversation panel | **GAP** |
| 91 | Reply in the language he used; reports in the interface language | **GAP** |
| 92 | A standard test line for comparing voices | **GAP** |
| 93 | **Voice failure finishes in text and names the cause** | PART — verify |
| 94 | Instant voice commands with no model in the loop | HAVE (`reflex`) |
| 95 | Interrupted work resumes on "continue" | PART |
| 96 | Update shows the notes of every version skipped | **GAP** |
| 97 | World clocks | **GAP** |
| 98 | "Surprise me with a game" — a playable thing in seconds | **GAP** |
| 99 | Everything spoken is transcribed into the chat, copy-pasteable | PART |

### Extensibility and practice
| # | Idea | Nova |
|---|---|---|
| 100 | **A missing tool is written and used in the same conversation** | PART (`forge`) |
| 101 | **A new tool gets its own dashboard page automatically** | **GAP** |
| 102 | Owner-written tools survive every update | n/a |
| 103 | A dev guide that orients your own Claude Code | HAVE (ahead) |
| 104 | **A public "what it can do, and when each piece arrived" inventory** | **GAP** |
| 105 | Anti-hype honesty as a marketing position | HAVE (doctrine) |
| 106 | Debugging in public: add a live preview, *then* find the bug | HAVE (method) |

---

# Roadmap — scored by impact × effort × doctrine fit

## P0 — The two that change what Nova *is*

**M1. Semantic recall over the vault.** A local embedder (Ollama +
`nomic-embed-text`, exactly their stack — it is free and runs on his Mac),
embeddings cached beside the derived state in `server/data/`, the vault
remaining the only truth and the index rebuildable from scratch. Wire it behind
`recall.js` as a second retriever, not a replacement: lexical first, semantic
to fill. Then adopt their three refinements — **the sieve** (bulk sources capped
at half the slots), **conversations ranked below notes**, and an explicit
**write gate**. *Impact: highest — it changes every agent's answers at once.
Effort: medium. Doctrine: perfect — derived index, vault untouched, degrades
honestly when the embedder is absent.*

**A1. Agents as objects, not lanes.** A registry where an agent is a record:
name, role written as a job description, assigned knowledge (vault paths), a
working folder it may write to, a brain, a voice, and its own memory card with
a protected diary. Nova's existing twelve become the seeded defaults. Then the
best idea on the account: **role boundaries an agent can reason about**, so it
can decline out-of-role work and *propose the right agent instead* — raised as
an ordinary inbox proposal, on the rails, undoable. *Impact: very high. Effort:
high. Doctrine: excellent — it is "propose, never assume" applied to Nova's own
shape.*

## P1 — Reach him where he is

**R1. The ✍ Feedback button.** Every proposal Nova raises gains a third option
beside approve and decline: **answer in his own words**, typed or spoken, at
full length. It is small, it is the difference between a decision and a
conversation, and Nova's proposal rails already carry everything needed.
*Impact: high. Effort: low.* **Do this first — it is a day's work.**

**R2. Push-approval from the phone.** Proposals arrive as a push (Nova has
`push.js`) with approve / decline / feedback inline, synced with the PWA so
answering in one place closes it everywhere. *Impact: high. Effort: medium.*

**R3. Fix Telegram voice notes.** Currently broken (below). *Effort: minutes,
once a key exists.*

## P2 — Automations he can make himself

**T1. User-created automations.** A record — trigger, steps drawn from the
existing 14 capabilities, active hours, review-then-approve — stored in
`server/data/` and executed by one generic scheduler. Nova already has the
hard parts (`plan.js`, `planner.js`, `capabilities.js`, `cadence.js`); what is
missing is letting him author one without a build. **Sandbox unattended runs
from the web and any outbound channel**, exactly as they do. *Impact: very high.
Effort: high. Doctrine: good, if every automation's writes stay on the inbox
rails.*

**T2. Triggers beyond the clock.** A changed vault folder, a calendar event, a
date-of-month. *Effort: low-medium once T1 exists.*

**T3. The brief reports Nova's own work.** The Morning Dispatch already tells
him about his day; it should also tell him what Nova did overnight — which
automations ran, what they produced, what is waiting. Nova has `streamFeed`
and `ops`; this is composition, not new machinery. *Impact: high. Effort: low.*

## P3 — The missing domain

**E1. Email.** The largest absent surface. Read-only triage first — what
arrived, what matters, what is waiting — with drafts proposed on the rails and
nothing ever sent without him. Adopt their caps (mails per read, days back,
characters per mail) from day one. *Impact: very high. Effort: high. Doctrine:
fine, provided sending stays an approved action, never an autonomous one.*

## P4 — Instrumentation and presence

**I1. The session HUD.** Turns, tokens up and down, cost so far, which model,
which voice, uptime. Nova knows all of it and shows almost none of it. Pair it
with the ceilings Nova already has and it beats theirs — visibility *and* a
limit. *Impact: medium-high. Effort: low-medium.*

**I2. Hardware telemetry**, if he wants the cockpit feel: CPU, memory, disk,
thermals, and the server's version and uptime. *Impact: medium (mostly
delight). Effort: low.*

**I3. Voice failure that speaks up.** Verify Nova's behaviour when TTS fails
and make it finish in text while naming the cause. *Effort: low. Doctrine: this
is literally honest degradation.*

**I4. A narrated tour of Nova**, in Nova's voice, explaining its own settings
and surfaces — and, in the same spirit, a first-person arrival. *Impact:
medium-high — it is the single most charming thing on their account. Effort:
medium.*

## P5 — Worth doing, not yet

**X1. Self-extension.** A missing capability becomes a proposed skill, built,
tested, and given its own surface — with the tests and the diff as the gate.
Nova has `forge`, `skills` and `patternScout`; closing the loop is a big,
careful piece of work and should follow A1 and T1, not precede them.
**X2. A local brain** (Ollama) for cheap, private, offline lanes that
deliberately defers heavy work and says so. *This also gives the embedder in
M1 a home.*
**X3. A public capability inventory** — "what Nova does, and which session it
arrived in" — generated from `capabilities.js` and the handoff log. Their
changelog page is the best artefact on their site.
**X4. General document OCR and ingestion** beyond the targeted scanners.
**X5. Cross-device memory** if he ever runs Nova on two machines.
**X6. The house model**, if smart-home hardware ever enters the picture — the
pattern (readings rendered where they belong in a 3D model) is already proven
inside Nova by the anatomy figure.
**X7. Image/video generation**, and video dubbing with lip-sync.

## Explicitly rejected, with reasons

- **Gesture control.** They themselves call it *"useless, but fancy"*. It costs
  a webcam pipeline and GPU contention — the exact bug their own timelapse
  documents — to produce theatre.
- **A particle face.** Nova's audio-reactive core is already its presence, and
  it belongs to the Command Core language. A photoreal face would be a second
  visual identity fighting the first.
- **Selling or packaging Nova.** Licensing, tiers, partner programs, offline key
  verification — all of it is product-company overhead for a system with one
  user.
- **A second index per integration.** Their EasyCAD note is right and Nova
  should hold the line: one index, asked by everything.
- **Copying their tier-gating** (three agents here, unlimited there). Nova has
  no customers to segment.
- **Metered cloud voice.** Kokoro is free, local and already good. Their
  ElevenLabs dependency is a running cost and a failure mode they had to ship
  code for.

## Suggested order

**R1 → M1 → T3 → I1 → A1 → T1/T2 → R2 → E1 → the rest.**

R1 is a day and changes how every proposal feels. M1 changes every answer Nova
gives. T3 and I1 are cheap and make Nova legible about itself. A1 and T1 are
the structural pair — after them, Nova stops being a fixed set of capabilities
and starts being something Hayden can extend without opening a session, which
is the real difference this study found.

---

## Two live findings about Nova, surfaced by running this study

1. **Telegram voice notes are broken right now.** `~/.config/watch/.env` has a
   `GROQ_API_KEY` that returns HTTP 403 and an empty `OPENAI_API_KEY`.
   `transcribe.js` prefers Groq, and `server/lib/telegram.js:222` is its only
   consumer. A voice note sent to Nova from his pocket currently fails. Fix:
   regenerate the free Groq key.
2. **The `study` capability cannot study this creator.** `capabilities.js`
   advertises "enumerate a creator's whole body of work… and compare it against
   Nova's own inventory" — this exact task — but `studyLane.js` only matches
   `youtube.com/(@|c/|channel/|user/)` and gets transcripts via
   `--write-auto-subs`, which Instagram does not serve. Either widen the lane to
   Instagram (enumeration must come from a browser; `yt-dlp`'s `instagram:user`
   extractor is broken upstream) or make it say plainly that it cannot.
