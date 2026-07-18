# Nova OS — Agent Development Plan

The six agents (Commander, Coach, CFO, Studio, Researcher, Guardian) graduate
from concept to real, one earned capability at a time. This plan defines what
each one is *for*, where it lives, the skills and routines it needs, how it
reaches seamless/friction-free operation, what will go wrong, and what "live"
honestly means for its sidebar dot.

## The doctrine every agent follows

These rules are already proven by the Inbox, Dispatch, Compost, and Sparring
systems — every future agent capability is built on the same rails:

1. **Deterministic first.** If plain code can compute it (streaks, schedules,
   orphans, macros), no model is involved. Models are reserved for judgment
   calls (classification, drafting, adversarial review).
2. **Models decide, code acts.** Any model call is read-only and emits one
   typed, validated decision. Deterministic code performs the write and
   records exactly what it did.
3. **Everything rides the inbox rails.** Agent outputs land as inbox records
   (`kind` tags them) — pending when review-gated, filed with undo data when
   autonomous. One history, one approval surface, one undo mechanic.
4. **Autonomy is a ladder, never a default.** Watched → drafted → shipped
   alone → self-improved. Every capability starts review-gated; promotion is
   *proposed* from real history (streaks of clean approvals) and ratified by
   Hayden; demotion is proposed after undo/discard streaks. An agent never
   changes its own autonomy.
5. **Honest degradation.** Missing data produces "unavailable"/"not synced",
   never invention. An agent's dot is lit only when its domain genuinely
   works end-to-end.
6. **Friction budget: zero required taps on the happy path.** Scheduled
   routines run themselves; review appears only where trust hasn't been
   earned yet; proposals retire recurring decisions. Hayden's input should
   trend toward *exceptions only*.
7. **Receipts.** Every mutation is on the record, timestamped, attributed to
   its agent, and undoable where physics allows.

**Shared infrastructure that makes each agent cheap to build:** the inbox
store + trust ladder + proposal engine; the scheduler pattern
(dispatch/compost/healthInsight); the claude CLI job pattern with tool
allow/deny boundaries; the vault read/write libs with backups and write
locks; per-filing undo.

---

## Commander — planning & orchestration

**Mandate.** Owns the shape of the day and week: what the next block is, what
deserves focus, when the loops run, and the daily briefs. Commander is less a
feature and more the *conductor* of the others.

**Where it lives.** Mission Control (suggested focus, eyebrow, standfirst are
already Commander-attributed), the Morning Dispatch / Evening Debrief
records, and the proposal banners. Later: a Week view.

**Already real:** calendar-driven suggested focus with contextual actions;
Morning Dispatch; Evening Debrief; next-block marker; the proposal engine.

**Skills & routines to build (in order):**
1. *Week view / weekly plan draft* — Sunday routine drafting the week ahead
   (training days from schedule, known calendar anchors, review concepts
   queued) as a draft-gated vault note `Wiki/Plans/Week of <date>.md`.
2. *Conflict detection* — deterministic: training scheduled but a calendar
   event overlaps the usual slot → proposal ("Leg Day clashes with 18:00
   dinner — move to morning?"). Requires only read access it already has.
3. *Focus session* — "Engage next block" becomes a real timer: block start
   logs to journal on completion (review-gated at first), Mission Control
   shows the countdown. No new data sources needed.
4. *Calendar write path (long-term, careful)* — creating events requires
   CalDAV write to iCloud. High blast radius: ship as propose-only forever
   (Commander drafts an .ics the phone opens) unless a safe write path is
   proven. Never silent calendar mutation.

**Friction design.** Everything scheduled; the only taps are approvals while
trust builds, then proposals to remove even those. Dispatch/Debrief already
follow this.

**Challenges & mitigations.**
- *Calendar is read-only* → propose-only planning; .ics handoff for writes.
- *Over-nagging* → proposal keys + skip memory (built); every new nudge type
  must carry evidence in its text.
- *Wrong focus suggestions* → they are suggestions with visible sources
  ("from your calendar"); never auto-act.

**Live when:** it already is — Commander's dot is lit by dispatch, focus, and
planning surfaces working end-to-end.

---

## Coach — training & recovery

**Mandate.** Progressive overload, session quality, recovery-aware
adjustments, streak protection. The numbers already exist (sessions, sets,
HRV, sleep, steps, streaks); Coach turns them into next actions.

**Where it lives.** Train screen (primary), Dispatch/Debrief training lines,
streak chips, proposals. Session-time surfaces belong in the live workout
view.

**Already real:** routines/schedule/sessions in the vault; last-set prefill
when starting a session; streaks; health data; dispatch lines.

**Skills & routines to build (in order):**
1. *Progression proposals (deterministic)* — rule-based: all sets hit
   target-high reps across last two sessions → propose +2.5kg (or +1 rep for
   bodyweight). Rendered in the session view as pre-accepted defaults you
   can override — friction-free because it changes *prefill*, not files.
2. *Missed-session rescue* — scheduled routine with no logged session by
   debrief time → debrief line + evening nudge in the Inbox. NUDGE ONLY:
   the weekly schedule is a recurring template, so a one-off rewrite would
   corrupt every future week — accepting simply opens Train ("a shortened
   session still counts"); a skip holds for that night and re-arms tomorrow.
   ✅ Shipped (dispatch status carries training context; proposal engine).
3. *Recovery-aware deload* — deterministic trigger (HRV 7-day slope down X%,
   sleep debt) → propose a lighter variant ("−15% loads today?"). Model-free.
4. *Session summary line* — after finishing a workout, a one-line PR/volume
   note appended to the session file (deterministic; already has the data).
5. *(Later) Form/plan Q&A* — the Voice/ask-Nova skill scoped to training
   context.

**Challenges & mitigations.**
- *Safety of auto-progression* → progression only ever changes *suggested*
  numbers; the human logs what actually happened. No auto-writes to history.
- *Sparse health data* → every trigger requires its inputs present; silent
  skip otherwise.
- *Overtraining nudges being wrong* → thresholds conservative, text carries
  the evidence, always skippable; skip suppresses that trigger for a week.

**Live when:** it already is (training + health domains work). Progression
proposals make it *useful* rather than just lit.

---

## CFO — money

**Mandate.** Know where the money goes without a bank integration: a local,
vault-native ledger fed by capture, with monthly digestion and subscription
awareness.

**Where it lives.** New `money` route + screen (numeral shifts once, like
Inbox did); an `expense` route in the Inbox classifier; Dispatch/Debrief
spend lines once data exists; monthly CFO report as a draft-gated record.

**Data design.** `Wiki/Money/Ledger <YYYY-MM>.md` — frontmatter `items:`
array (date, amount, currency, merchant, category, source), body rendered
like the shopping list. Same vaultStateFile pattern (iCloud-safe, Obsidian
readable/editable). Categories fixed list (Food, Transport, Subscriptions,
Training, Home, Fun, Other) — deterministic reporting needs stable buckets.

**Skills & routines to build (in order):**
1. *Expense capture route* — classifier gains `expense`
   (payload {amount, merchant, category}); "coffee 6.50" files in one
   sentence. Same confidence gate + undo (remove ledger item).
2. *Statement photo scan* — reuse the scanFood pattern: photo of a card
   statement → model extracts transactions (read-only) → review screen (like
   ingest) → deterministic ledger merge with duplicate detection
   (date+amount+merchant fuzzy). ALWAYS review-gated — money never auto-files
   from OCR.
3. *Monthly CFO report* — deterministic: totals by category vs last month,
   top merchants, subscription list — drafted to the inbox on the 1st.
4. *Subscription detection* — deterministic: same merchant ±3 days monthly,
   similar amount → registry `Wiki/Money/Subscriptions.md`; overlap/price-rise
   proposals (the old demo line, made real).
5. *(Later)* budget lines per category with debrief deltas.

**Challenges & mitigations.**
- *No bank APIs, by design* — capture + statement scans keep everything
  local; the cost is manual capture, mitigated by the one-sentence
  expense route and monthly statement sweeps.
- *OCR extraction errors* → review-gated merge, per-row toggles, duplicate
  detection, undo on every merge.
- *Currency/format assumptions* → AUD default, explicit currency field.
- *Sensitive data* → stays in the vault + local server like everything else;
  never in prompts beyond the minimum (amounts/merchants only).

**Live when:** expense capture + ledger + first monthly report work; the dot
lights then, not before.

---

## Studio — content & ideas

**Mandate.** The pipeline from loose idea to shipped content (Hayden's video
work): capture ideas frictionlessly, mature them in the vault, draft
outlines on request, keep a content calendar.

**Where it lives.** Inbox `idea` handling (today: `note` route → later a
dedicated `idea` route filing to `Wiki/Studio/Ideas/`), a Studio board
section in Notes (filter by type), Dispatch "Studio" line when a draft is
waiting.

**Skills & routines to build (in order):**
1. *Idea route* — classifier learns `idea` (title, one-line hook, format
   guess: short/long/thread). Files to `Wiki/Studio/Ideas/` with frontmatter
   `status: seed`.
2. *Idea board* — Notes screen filter/kanban by `status`
   (seed → outlining → scripting → shipped); status changes are one-tap
   frontmatter edits (deterministic).
3. *Outline drafting skill* — on demand ("draft an outline for X"): model
   drafts from the idea + linked vault notes → review-gated note append.
   Never scheduled; always requested.
4. *Content calendar* — `Wiki/Studio/Calendar.md`; weekly Studio line in the
   week plan ("1 idea ready to script").
5. *(Later)* Researcher handoff: "research this idea" → Researcher brief
   linked to the idea page.

**Challenges & mitigations.**
- *LLM drafts sounding generic* → drafts always cite which vault notes they
  pulled from; review-gated; regenerate is cheap.
- *Pipeline becoming a graveyard* → Compost learns a Studio detector: seeds
  untouched 30 days → "archive or promote" proposals.
- *Scope creep* → Studio ships as exactly: route + board + on-demand outline.

**Live when:** the idea route + board work end-to-end.

---

## Researcher — the web, carefully

**Mandate.** Answer "go find out about X" with a sourced brief in the vault —
the only agent that touches the internet, under the tightest contract.

**Where it lives.** Triggered from capture ("research: X" → classifier route
`research`) or a button on a Studio idea. Output: draft-gated
`Wiki/Sources/<topic> (Research Brief).md` with citations.

**Skills & routines to build (in order):**
1. *Research brief job* — claude CLI with `WebSearch`/`WebFetch` allowed and
   everything else disallowed (same boundary discipline as the Breaker,
   proven enforceable via --disallowedTools). Prompt contract: every claim
   cited with URL + access date; uncertainty stated; fixed structure
   (Summary / What's known / Disagreements / Sources). Budget-capped.
2. *Research inbox route* — "research: creatine timing evidence" pends a
   research job proposal (jobs cost money → always explicit, never
   auto-triggered by the classifier at any ladder level).
3. *(Later)* recurring watches ("check monthly for new X") — only after
   one-shot briefs prove reliable.

**Challenges & mitigations.**
- *Hallucinated sources* → citation-required contract; a deterministic
  post-pass verifies each cited URL resolves (HEAD request) and flags dead
  ones in the draft; review-gated forever by default.
- *Cost* → hard budget per brief; explicit trigger only.
- *Web tools reaching where they shouldn't* → allow/deny list boundary,
  `--strict-mcp-config`, no file tools at all — the brief text comes back
  through the job result and *server code* writes the note.
- *Prompt injection from fetched pages* → the job's only capability is
  writing text into a review-gated draft; nothing it reads can make anything
  execute. The review gate is the injection firewall.

**Live when:** first briefs land with verified citations.

---

## Guardian — integrity & continuity

**Mandate.** Nothing is ever silently lost and nothing silently stops.
Backups, store health, scheduler heartbeats, restore paths.

**Where it lives.** Settings (Guardian panel), a monthly report record, and
Dispatch lines *only when something is wrong* (silence is its success state).

**Already real:** per-file timestamped backups with pruning; iCloud
stale-read protection; atomic store writes + corrupt-file quarantine;
error-record preservation.

**Skills & routines to build (in order):**
1. *Heartbeat file* — every scheduler tick writes `data/heartbeat.json`
   ({dispatch, compost, healthInsight, lastServerStart}). The client surfaces
   staleness honestly ("compost hasn't run in 9 days") — catches the
   silent-stall class of failure.
2. *Guardian monthly report* — deterministic: backup counts + oldest/newest,
   data-dir size, quarantined files found, store record counts, uptime
   since. Draft-gated inbox record on the 1st.
3. *Restore surface* — Settings: per-file backup list → "restore this
   version" proposal (writes current → backup first, then restores;
   double-undo safe).
4. *Vault export* — one-tap zip of vault + data dir to a chosen folder
   (Desktop), proposed monthly.
5. *(Later)* off-machine copy guidance (iCloud already covers the vault;
   data-dir needs the export).

**Challenges & mitigations.**
- *Watching the watcher* → heartbeat is written by the schedulers themselves
  and *read* by the client; a dead server is visible as OFFLINE already.
- *Restore data-loss irony* → restore always backs up the current state
  first; every restore is an inbox record with undo.
- *Report noise* → monthly, and only ever one pending item; failures also
  appear as a single dispatch line.

**Live when:** it already borders on real (backups + integrity hardening);
the heartbeat + report make it visibly so.

---

## Access model (uniform)

- **Sidebar roster** — dots per agent, lit only per "live when" above; the
  count derives from flags (never hardcoded).
- **Inbox** — every agent's outputs are records with `kind`/attribution;
  pending queue is the single approval surface; history is the single
  audit surface.
- **Attribution everywhere** — any surface an agent powers names it ("from
  Coach"), keeping the mental model honest.
- **Voice/palette (later)** — once ask-Nova exists, agent skills become
  addressable by name ("ask Coach…", "CFO, how much this month?") through
  the same read-only answer path.

## Build order (recommended)

1. **Coach progression + missed-session rescue** — highest daily value,
   zero new data sources, fully deterministic.
2. **Guardian heartbeat + monthly report** — cheap, protects everything else.
3. **CFO expense route + ledger + first report** — new domain, high value,
   pattern-reuse throughout.
4. **Studio idea route + board** — light, immediately useful for content.
5. **Researcher brief job** — highest-risk contract, built last on mature
   rails.
6. **Commander week view + conflict detection** — continuous, absorbs the
   others' outputs.

Each step lands as: server lib + routes + tests → client vals + surface →
review-gated by default → trust-ladder promotion via the proposal engine —
the same shape as everything already shipped.
