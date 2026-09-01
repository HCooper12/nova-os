# Nova OS — context for Claude (written 30 Aug 2026)

This document exists to brief Claude (the chat product, not Claude Code) on
what Nova is, before being asked to design a prompt for a systematic,
agent-by-agent and section-by-section audit of the platform. It is written
from the live codebase, not from memory or aspiration — every figure and
claim below is current as of this date.

---

## 1. What Nova is, in one paragraph

Nova is Hayden's personal AI operating system — a "second brain" that runs
his life, not a demo of one. It's a React + Vite Progressive Web App
(installed on his phone and Mac, hosted on GitHub Pages) that talks to a
local Express server running on his Mac (via `launchd`, reachable over
Tailscale from anywhere), which reads and writes his **real Obsidian
vault** — his actual notes, training log, food log, money ledger, calendar,
and journal. It is in daily use on real data. Nothing about it is a sandbox
or a prototype; a bug here is a bug in Hayden's actual life infrastructure.

**Mission (the tiebreaker for every decision in the codebase):** help
Hayden become and perform as the best version of himself — training,
recovery, nutrition, knowledge, money, content, time — and be the one app
he opens every day because it's genuinely, repeatedly useful. A feature
that looks good but doesn't change what he does tomorrow is worth less than
one honest sentence that makes him adjust something.

---

## 2. Architecture

- **Frontend:** React 19 + Vite PWA, deployed to GitHub Pages via
  `.github/workflows/deploy.yml` on push to `main`. Offline-first with a
  cached "snapshot" of live state and an outbox for actions taken offline.
- **Backend:** Node/Express server on Hayden's Mac, run as a `launchd`
  service, fronted by Tailscale so it's reachable from his phone anywhere.
  This is the *only* place that reads/writes the vault or calls models.
- **Data:** an actual Obsidian vault (markdown files Hayden can read and
  edit by hand) is the source of truth for anything human-meaningful.
  `server/data/` holds derived/operational state (ledgers, health time
  series, the inbox, search indexes) — machine state that doesn't belong in
  the vault.
- **Scale (current):** 137 server-side library modules, 25 Express
  routers, 19 distinct app screens/surfaces, and roughly 30 named
  background jobs/agents (below). This has grown fast — the same count was
  105 libs / 21 routers / 17 screens three weeks earlier (19 Aug baseline).
- **Auxiliary surfaces:** a macOS menu-bar app (NovaBar, Swift), a
  Scriptable-based iPhone home/lock-screen widget, Siri Shortcuts
  integration, and a Telegram bridge for proactive messages.
- **Voice:** fully local TTS (Kokoro-82M on MLX), on-device dictation,
  sentence-streamed speech with lossless barge-in, a hands-free
  conversation mode, and a deterministic "reflex layer" that answers simple
  questions (steps/HRV/weight/fuel/inbox) in sub-second time before any
  model is even called.

---

## 3. Core doctrine (the non-negotiables)

These are architectural laws documented in `design/NOVA-METHOD.md` and
enforced throughout the codebase. Any audit of Nova should judge proposals
against these, not against generic SaaS/app best practice:

1. **Deterministic first; models decide, code acts.** A model may
   interpret (classify, answer, judge, draft). Only plain, tested code is
   ever allowed to write to disk. A model's output never writes unmediated.
2. **Everything writeable is undoable.** Every write returns an undo
   payload and rides the "inbox" rails (a record with `kind`, `status`,
   `undoData`). No one-way doors.
3. **The vault is the source of truth.** `server/data/` is derived or
   operational only — nothing Hayden should be able to see/edit gets
   trapped there.
4. **Honest degradation, never fiction.** Missing data says so plainly.
   Stale data self-labels. Demo content only ever renders in `demoMode`. A
   model is never allowed to fill a gap with a plausible-sounding guess.
5. **Explicit trigger for anything that reaches outside the vault or costs
   real money/latency.** Web research and similar tools never fire
   speculatively.
6. **Zero-friction happy path, receipts for everything.** One tap or one
   sentence for the common case; every automated action leaves an
   inspectable, reversible record. Autonomy is *earned* from real history
   and *proposed*, never assumed — and an agent can never expand its own
   autonomy.
7. **One contract, one place.** A format shared across multiple
   readers/writers (e.g. a record shape, a line format) is a contract:
   change every reader/writer together, or none.

Every model-based agent is prepended with a shared reasoning spine
(`NOVA_LENS`, in `server/lib/lens.js`): ground answers in real data, think
across life domains, serve the actual goal not just the literal question,
land on one concrete next action, propose rather than impose, and be
explicit about confidence vs. inference.

---

## 4. The agent fleet (what actually exists today)

This is the canonical list, pulled directly from the code (`server/lib/
fleetContext.js`, the map every conversational agent uses to know what the
rest of the fleet has been doing). Roughly 30 distinct named jobs, grouped
here by life department:

**Train**
- **Coach** — the deepest agent in the system. Owns real deterministic
  engines: strength progressions (including RPE-autoregulated and an
  "outgrown program" rule), plateau detection, PR detection, RPE drift,
  weekly muscle-volume vs. goal-aware targets, program audit, a deload
  signal, a readiness score, training-block periodization, an injury log,
  carryover tracking (missed work owed forward), and a memory of corrections
  Hayden has made that get applied going forward. Has its own knowledge
  base (`Coaching Principles` + a "What Works For Hayden" file, writable
  only through approved proposals). Runs on a real cadence: morning
  readiness, missed-session nudges, PR celebration, post-session debrief,
  nightly reflection (max 3 learning proposals + 1 outreach per night, or
  silence).
- **Training Check** — each evening, cross-checks the training schedule and
  calendar against what was actually logged; nudges if training hasn't
  happened.
- **Week Plan** — a Sunday routine that drafts the week ahead: training
  days from the schedule, calendar anchors, and load per day.
- **Program Audit** / **Program Review** — separate deterministic and
  model-assisted passes that catch mis-classified sessions and raise things
  a real coach would notice between sessions unprompted.
- **Fuel × Training** — a cross-reference agent Hayden called
  non-negotiable: training program, goals, food rotation, and the food log
  each tell the truth about one thing, and this agent checks the *joins*
  between them for contradictions.

**Fuel**
- **Food Scout** — notices recurring off-plan foods and proposes saving
  them to the recipe bank (never re-proposes the same thing twice).
- **Meal Prep** — Thursday proposal that deliberately keeps the current
  rotation stable (his stated preference is low week-to-week variance),
  verifies it still clears his protein floor, and drafts the shopping list.

**Mind / Knowledge**
- **Researcher** — web research with citations required.
- **Studio** — content drafting.
- **Watcher** — video → verdict/notes pipeline: paste a link, it pulls the
  transcript locally, and either gives a quick verdict (e.g. Coach auditing
  a fitness video's claims against literature, ~$0.50) or does a full
  "second-brain weave" (Source/Concept/Entity/Topic pages, wikilinked,
  ~$6) — two different buttons because triage shouldn't cost absorption.
- **Librarian** — turns a book title + author into a triangulated research
  dossier that rides the same ingest pipeline as the Watcher.
- **Scout** — researches a *person* the way the Librarian researches a
  book.
- **Distiller** — compresses/consolidates vault content.
- **Brain Week** — a Sunday journal of "what entered my second brain this
  week."
- **Daily Review** — the flagship proactive surface: once a day, model-
  composed through the shared lens, reasoning across briefs, sessions,
  goals, carry-overs, the week-ahead calendar, money, and learned
  preferences.
- **Pattern Scout** / **Trust Ladder (autonomy)** — notices repeated manual
  patterns and behavioral tendencies (accept/skip rates per proposal kind)
  that feed back into how much autonomy other agents are allowed.

**Money**
- **Money** / **CFO** — ledger import (including an automatic bank-CSV
  drop-folder pipeline), a monthly report drafted automatically on the 1st,
  and subscription detection.

**Logistics / Platform**
- **Dispatch** — routes/composes the day's briefs.
- **Guardian** — integrity checks across the system.
- **Compost** — aging/archival of stale content.
- **Forge** — a build/automation job runner.
- **Commander** — a "followup" agent (weekly planning-adjacent).
- **Leader** — reflection/idea-of-the-day surface (also feeds the phone
  widget's lock-screen line).
- **Weekly Debrief**, **Plan Today**, **Study Lane**, **Money Import** —
  further scheduled jobs on the same rails.

**Conversational / on-demand model lanes** (distinct from the scheduled
agents above — these run when Hayden actually talks to Nova):
- **Ask Nova** — vault-read Q&A.
- **Ask Coach** — conversational fitness coaching.
- **Quick Session** — builds an off-program workout on the fly.
- **Greeting** — a "doorman" greeting generated fresh on every arrival from
  computed facts only, never templated.
- **Session Debrief** — post-workout conversational wrap-up.
- **Claude Code tab** — an embedded Claude Code session (file read/write,
  no Bash) inside Nova itself.
- **Breaker** — a sandboxed lane.

All model-based agents share one context-building layer (`NOVA_LENS`,
profile context, observed-preference context, explicit "standing rules"
Hayden has corrected once and had written down, and a live snapshot of what
the rest of the fleet just did) — "one brain, loaded once," not each agent
re-guessing who Hayden is from scratch.

---

## 5. Surfaces (screens in the app)

Mission Control (home), Voice, Memory Galaxy, Claude Code, Inbox, Fuel
(recipes/rotation/macros + a dedicated Shopping list), a To-Do list, Train
(with TODAY/GYM/COACH sub-views), Notes, Journal, Money, Stash, Ops (the
agent-fleet activity/receipts view), Settings, and Ambient (a fullscreen
presence/wall mode). Nineteen `.jsx` screens total. Design language: dark
HUD aesthetic, a shared token system, macro-specific colour coding
(protein/carbs/fat/kcal), long-press context menus (touch + right-click
equivalents), and tap-to-explain glossary terms throughout.

---

## 6. Data spine

- **Health:** a nightly iOS Shortcut pushes 8 metrics (steps, HRV, RHR,
  sleep, weight, etc.) from Apple Health; Apple Watch workout data now
  ingests too; a "health drops" folder and a weight trend line.
- **Calendar:** two-way CalDAV, including recurring-occurrence overrides.
- **Food:** a fixed rotation plus off-plan logging via photo/barcode scan
  or spoken description — macros are now computed deterministically from
  USDA FoodData Central lookups (a model only names components + weights;
  code does the arithmetic — a direct application of doctrine rule #1,
  after a real bug where a model's own stated kcal disagreed with its own
  macros).
- **Money:** bank-CSV import (manual or automatic drop-folder) + the CFO
  agent.
- **Tasks:** two-way Todoist sync.
- **Automation:** roughly 25 scheduled jobs (dispatch, daily review, week
  plan, overnight processing, compost, distill, brain week, pattern scout,
  pulse, meal prep, food suggest, training check, weekly debrief, coach
  cadence, coach reflection, health insight/mirror/drops, money import,
  Todoist sync, reminders, autonomy, guardian, CFO), plus a Telegram
  out-channel for proactive messages.

---

## 7. What "good" looks like here (the bar for any proposed change)

Nova has an explicit, written change process (`design/NOVA-METHOD.md`,
section 3) that every real change is held to:
1. Find the real need under the stated symptom.
2. Read the existing pattern before writing something new — extending a
   rail beats inventing a parallel one.
3. Find the smallest honest solution; deterministic beats model-based
   whenever a rule can be written.
4. Trace real inputs through it and explicitly design every failure mode
   (no data, stale data, a duplicate, a torn write, a lost connection) —
   each must degrade honestly, never lie or crash.
5. **Verify against the real vault, not just tests** — hit the real
   endpoint, read the real result, reload the real service.
6. Leave receipts: commit with a *why*, update the durable docs, and report
   plainly what was actually verified vs. merely assumed.

Named anti-patterns the project actively watches for: "dashboard drift"
(a screen that displays more without changing what Hayden *does*), "the
confident guess" (a model or rule inventing a plausible number instead of
admitting a gap), "the silent cap" (truncating/sampling without saying so),
"the parallel rail" (a second way to do what an existing rail already
does), and "the one-way door" (a write with no undo).

---

## 8. Where things stand right now (30 Aug 2026)

The most recent work session (25–30 Aug) fixed four real production
failures Hayden hit in daily use: a black-screen crash on app open, an
ingest-review sheet that seized the screen on every launch, a morning brief
that re-read itself repeatedly instead of once a day, a video-ingest job
killed mid-run by a cost cap sized for a different (much cheaper) job type
with nothing written to show for the spend, and food-macro logging that
gave two different totals for the same food description (root-caused to
asking a model to recall nutrition facts from memory instead of computing
them — since fixed by forcing the model to output only component
names/weights and having code do the lookup and math).

An explicitly named, still-open friction point (Hayden's own words, most
recent capability audit): *"I shouldn't need to go to many different
sections of the platform in order to ask for something like this...
Ideally, this includes Claude Code sessions as well so I don't need to keep
opening different terminals."* Today, watching a video, researching a
link, and running a Claude Code job are separate surfaces with separate
affordances — there's no single conversational front door where a pasted
link or a spoken intent routes itself to the right agent. The capability
exists across the fleet; the *reachability* of that capability from one
place does not yet.

---

## 9. What this document is for

Hayden is going to ask Claude (chat) to design a prompt for Claude Code
that will systematically evaluate **every agent individually** (the ~30
named jobs in section 4) and **every section of Nova individually** (the
19 screens/surfaces in section 5, plus the underlying doctrine in section
3), to find concrete opportunities to make the platform — and by extension
his life — better. This document is the shared ground truth for that
prompt-design task: what exists, what it's for, what "better" has
historically meant here, and what's already known to be broken or missing.
