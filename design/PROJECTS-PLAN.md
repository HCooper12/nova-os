# Nova OS — Projects Plan

**Status: decisions settled 29 Oct (§10); phase 1 waits on his read of this doc.**
Written from his 48 answers on the decision checklist (26–29 Oct) and from a
survey of the code as it stands on 29 Oct. Nothing here is built. Where the
code already has a seam, this doc names the file; where it does not, it says
"new".

His ask, in his words (22 Oct): "provide a specific prompt that could easily
be given to Claude itself, but I want it to be done through Nova … Nova would
intelligently be able to understand what is needed or engage in conversation
with me naturally … then proceed with organising folders … conducting research
that it collates together and stores … and then can schedule things like
additional work and coding and building … in the background without my direct
need to supervise." And the simpler case: "supporting me with a room
redesign … I don't want/need the videos to exist in my normal library."

---

## 0 · What a project is

A **project** is a named piece of work Nova holds, returns to, and works on
for him, over days or months. It is three things joined by one id:

| Part | Where | Holds |
|---|---|---|
| The folder | `~/Projects/<slug>/` (Q11) | code, build output, research notes, the brief, the log, deliverables (Q16). A git repo from the first file, silently (Q15). |
| The knowledge | the vault, `Projects/<Name>/` (Q13) | the project page (goal, phases, decisions, status), its own Sources and Raw for anything watched or read *for this project* (Q31). |
| The record | `server/data/projects/<id>.json` (new) | id, slug, name, kind, stage, parent, brief hash, allowances, quiet window, model override, ledger totals, the queue. Operational and derived; the vault page is the truth for what the project *is*. |

Kinds (Q1): `build` (ends in something that runs), `research`, `life`
(a room, a trip, a job search). The kind is chosen at intake and only
changes which questions Nova asks and which allowances make sense; the
machinery is the same.

Stages (Q2): `idea → planning → active → paused → done → archived`. Nova
**proposes** every move as an inbox card (`kind:'project-stage'`); he ticks
it. Nova may propose `paused` after 21 quiet days and `done` when every
phase is ticked; it never moves a project itself. `archived` is the only
way a project leaves the list; nothing is ever deleted (Q44). The folder
moves to `~/Projects/.archive/<slug>/` (the pattern `lib/projects.js`
already uses for `.undone`); the vault page gets `status: archived`.

Sub-projects (Q3): a project may name a `parent`. The folder nests
(`~/Projects/<parent>/<child>/`), the vault page nests
(`Projects/<Parent>/<Child>/`), the ledger rolls up. One level only in
phase 1; the record shape allows deeper, the screen does not draw it yet.

Nova's own code is a project (Q5): the `repo` workspace becomes the project
"Nova", with the Builder's existing gates and its block on commit
(`BUILDER_DISALLOWED`, `server/lib/claudeCode.js:345`). That block stays for
Nova's own repo even though other projects may commit (Q25): a bad commit
to Nova is a bad commit to the thing he is talking to.

Science Atlas and Wren (Q4, his "talk it through"): see §10.

### The folder, always the same (Q12)

```
~/Projects/<slug>/
  BRIEF.md          the contract (§2). Rewritten only through a new brief card.
  LOG.md            append-only. Every job, every decision, dated. Code writes it.
  DECISIONS.md      what he decided and why, in his words where he gave them.
  research/         one file per source (link, date, what it said), plus SYNTHESIS.md
  deliverables/     documents the project produces (Q16)
  build/            the repo for a build project (its own package.json etc.)
  .nova/            project.json mirror, queue state, job receipts (machine, git-ignored)
```

`.gitignore` covers `.nova/`, `node_modules`, build output. The first commit
is "chore: project created by Nova from the brief of <date>".

### The vault pages

```
Projects/<Name>/
  <Name>.md         type: project · id · kind · stage · folder · created · phases[] · cost
  Sources/          watched videos and read pages FOR THIS PROJECT (never Wiki/Sources)
  Raw/              their transcripts (never the vault's Raw/)
```

The project page carries wikilinks to the vault pages the project is allowed
to read (§3), so the vault graph shows what the project touches.

---

## 1 · The conversation that starts one (Q6–Q10)

He speaks or types to Nova as he would to Claude. The opening may be one
sentence or a whole pasted prompt (Q10). Then:

1. **Nova asks, short, in turns** (Q6; the turn-taking rule from
   `server/lib/talk.js` applies). At least one round, always. Nova says when
   it has enough. A pasted prompt still gets one echo-back of Nova's
   understanding before the brief (Q10).
2. **The fixed core** (Q7) Nova must have before it writes a brief:
   goal · what done looks like · deadline, if any · the kind · what it may
   do alone (the allowance set, §5) · how much it may spend before asking
   (§6, a conversation, not a number he has to invent) · which parts of the
   vault it should read (§3). Kind-specific questions follow (a build asks
   about the stack and where it will run; a room asks for photos and
   measurements; research asks what a good answer would let him do).
3. **The brief** (Q9). One page, written by the model, validated by code:
   `{name, kind, goal, done, deadline, phases:[{name, what, first}], reads:[],
   allowances:{}, limit:{}, firstMoves:[]}`. It is filed as a pending inbox
   card, `kind:'project-brief'`. Nothing exists on disk until he approves it.
   Approval creates the folder, the vault page, the record, the first commit,
   and queues `firstMoves`. Undo moves the folder to `.undone` (the
   `lib/projects.js` pattern) and un-stages the vault page.
4. **Dry-run** (Q45) for the first three projects: approval creates the
   folder and the pages but every queued job runs with `dryRun:true`: it
   writes what it *would* do to `LOG.md` as a plan and files it as a card.
   He lifts dry-run per project from the project page; Nova proposes
   lifting it after three clean runs.

By voice (Q8, both from day one): the intake uses the existing path (phone
records, Mac transcribes via `POST /api/voice/transcribe`; Nova speaks
through `/api/tts`). This path exists in code and is **unverified on his
phone** (memory `nova-voice-turn`). The first intake by voice is the test;
typed intake is the fallback and is built first.

**Prompt lane:** `project-intake` (new entry in `LANES`,
`server/lib/modelPrefs.js:156`; default sonnet high). It prepends
`NOVA_LENS` and `profileContext()` like every other agent. It runs as a
warm session (Q40) on the Nova thread with the project's context attached
(Q37, §4).

---

## 2 · Research (Q17–Q20, Q31–Q34)

Research is a job with a `projectId`. Nova chooses the means (Q17): the
Researcher (web, citation-required), the Watcher (video), the Study lane
(papers). Before any job whose estimate is high (§6) it says the estimate
and waits.

**Stored as** (Q18): `research/<date> <slug>.md` per source, with `url`,
`fetched`, `means`, and what it said; `research/SYNTHESIS.md` rewritten
by code from the model's cited synthesis, every claim carrying its source
file. A synthesis sentence without a source is dropped by the validator,
not written.

**Nova may start research on its own** once the brief is approved (Q19),
inside the limit, and may find its own sources (Q34). Each self-started
job appears as a line in `LOG.md` and as the project's "working" state on
the screen; it does not need a card unless it ends in something for him.

**Reaching him** (Q20): a card in the project (one line; tap opens the
document). And, his note: *always* speakable. Any research card has
"Tell me", which hands the document to the Nova thread with the project
context attached, so he can talk back and Nova answers from the document
and the project's research, in turns. This is the existing Briefing
pattern (`design/BRIEFING-PLAN.md`) reused: sentence-level sync, panels
only where there is a figure.

### The project Watcher (Q31–Q34)

Today `startVideoWatch(vaultPath, url, question, {model})`
(`server/lib/watcher.js:270`) has no destination, no lens and no lane
parameter; the `watch-note` route (`server/lib/inbox.js:1101`) writes to
`Wiki/Sources` and `Raw` unconditionally. New:

- `startVideoWatch(..., {model, project:{id, name, lens, dest}})`. With a
  project, the Source page and the transcript go to
  `Projects/<Name>/Sources/` and `Projects/<Name>/Raw/` and the record
  carries `projectId`. The dedupe check (`findExistingVideoPages`) runs
  against the project's folder, not the vault's.
- **Lenses.** The existing two (`coach`, `reference`) stay model-chosen for
  non-project watches. A project sets a default lens (Q32) that he can
  override per video: `reference` (what it says), `design` (new, Q33: what
  it *shows*: frames sampled through the watch plugin's frame extraction,
  then a model pass on the frames for palette, materials, layout, light,
  storage, with timestamps), `claims` (the coach-style audit, renamed for
  non-training use). The design lens is the room redesign's lens and is
  built in phase 2.
- **Flag for the library** (his note on Q31): the verdict pass also answers
  "would this belong in his main library?" with a reason. If yes, the filed
  card carries a second action, "Also file to Wiki", which runs the
  ordinary `watch-note` route on the same transcript. Nothing goes to the
  library without that tap.

---

## 3 · What a project may read (Q13, Q14, Q43)

Two layers, both named on the project page:

1. **Who he is**, always: `profileContext()` (`server/lib/profile.js:338`)
   and `NOVA_LENS`, exactly as every agent gets them.
2. **The subject**, chosen at intake: a list of vault folders or pages
   (`reads:[]` in the brief). Nova proposes the list from the goal
   ("for a room: Journal entries mentioning the room, Wiki/Home, the
   Stash board"); he edits it in the conversation.

The survey found **no path allowlist** in the vault reader layer. Reads
are scoped the way the Builder scopes them today: the material is handed
to the model in the prompt (`askContext.gatherContext`), not discovered by
the model. A project job never gets `Read`/`Grep` over the vault; it gets
the pages in its `reads` list, rendered into its context. That is the
mechanism behind "never touching the vault outside its project" (Q43) on
the read side. On the write side every vault write goes through
`fileDecision` with a route that checks the path is under
`Projects/<Name>/` (new route `project-page`); a model never writes the
vault.

The project folder is enforced by the kernel: build jobs run under the
macOS seatbelt (`server/lib/sandbox.js`, already used by
`lib/builder.js`), which denies writes outside the project dir. Reads are
not restricted by the seatbelt (by its design); the brief is the read
boundary, and `LOG.md` records every file a job touched (from
`changedFiles` in `lib/builderGate.js`).

---

## 4 · Where it lives on the screen (Q35–Q39)

His answer to Q36 was "talk it through", with the note: a dedicated place
to access, view and revisit at any time, on phone and Mac. The options,
and my pick:

- **(a) Projects absorbs the Code screen.** The Code screen's tiles
  (`src/vals/valsCode.js:99`, one per folder, with live session chips)
  already *are* a project list without the word. Projects becomes the
  screen; Code becomes a project's "Build" tab. One place, nothing
  duplicated. Reached from More, and from any project card on Home.
  **My pick.**
- **(b) A new tab in the bar**, replacing one of Home / Inbox / Fuel /
  Train / More. Costs him a daily tab for something he opens weekly.
- **(c) A section inside More**, leaving Code where it is. Two lists of
  the same folders.

The screen, in both idioms from one view model (`src/vals/valsProjects.js`,
new; rendered by `src/screens/Projects.jsx` for summary and the
`MissionStructured` groups for cupertino; §2b of NOVA-METHOD):

- **The list**: a rail of projects, each a tile with the house material:
  name, kind glyph, stage, the phase ring (phases done of total, the
  `RingTile`), a live chip when a job is running (the same chip the Code
  tiles use), and "waiting on you" as the one red-free accent. Closure:
  the next tile peeks. Archived behind "Show all".
- **The project page** (Q35): the thread (the Nova thread with this
  project's context attached, Q37; one Nova, the record kept per project
  in the conversation record with `projectId`), the phases as a joined
  path (uniform connectedness), files (the folder, the deliverables, the
  research), what is waiting on him (the project's pending cards), the
  cost so far (§6), and the controls: allowances, quiet window, model
  override, dry-run, lens default.
- **Home** (Q38): a project that needs him is a card in the feed, styled
  as content. In the summary idiom a `projects` row in `PINNED_CARDS`
  (`src/pinned.js`) and a builder in `valsSummary.js`; in cupertino a
  keyed group in `MissionStructured`. Both read `valsMission`'s new
  `projectsWaiting` field. The headline rule applies: the card never
  repeats the greeting line.
- **Mac** (Q39): the same view model; the project page gets the wide
  layout (thread beside files). Mission Control's session groups
  (`lib/claudeSessionsLive.js`, grouped by `projectOf(cwd)`) already know
  `~/Projects/<folder>`; a project's running sessions appear on its page
  from that source, so a session he starts by hand in the folder is
  visible too.

Every project action rides the inbox rails (Q44): brief, stage move,
research filed, build shipped, stage proposals, library flag, limit
reached, learned change. Each has `kind`, `status`, `undoData`, and a
branch in `undoFiling`. New kinds need `SOURCE_LABEL` and `ROUTE_META`
entries in `src/vals/valsInbox.js`.

---

## 5 · Background work (Q25–Q30)

**The queue.** Each project has a queue of jobs
(`server/data/projects/<id>/queue.json`): `{id, kind:'research'|'watch'|
'build'|'draft'|'test', input, needs:[], status, startedAt, endedAt,
recordId, costUsd, dryRun}`. It is the plan-step shape from
`lib/planner.js` (steps with `needs`, resumed by record state, never
re-dispatched) applied per project, so a job survives a server restart
the way plan steps do.

**When it runs** (Q26): whenever queued, outside the project's quiet
window. The default window is his existing quiet hours
(`lib/quietHours.js`, 22:00–07:00) *inverted*: background work prefers
the night, and never starts during a Coach answer or a live session (the
existing `jobRegistry.activeJobs()` guard that `reload-server.mjs` also
honours). The scheduler is one more `start*Scheduler` in
`server/index.js`, ticking every 10 minutes like `overnight.js`.

**Concurrency** (Q30, several at once): a cap of **two** projects working
at once in phase 3, raised when a week of receipts shows the Mac's load
stayed under 8 while two ran. His Mac reached load 21 on 19 Oct with one
heavy job; "several" without a cap is how a Coach answer gets starved.

**What it may do alone** (Q25): research · draft documents · write code in
the project's own repo · run tests · commit to the project's repo · deploy.
Everything else (push, paid APIs, anything leaving the Mac, anything in
his note's "anything else") comes as a pending card with a proposal he
can approve, discuss or reject. Two notes for his decision (§11):
*deploy without push* is impossible for anything hosted from GitHub
(Science Atlas, Nova itself); and *commit* is allowed for project repos
but stays blocked for Nova's own repo (§0).

Mechanism: the allowance set is a field on the record; the job runner
builds the Builder's `--disallowedTools` list from it (the pattern at
`claudeCode.js:345`), so an un-allowed verb is blocked at the CLI, not by
the prompt.

**When it cannot decide** (Q28): the job stops and files a card with the
choice stated plainly and Nova's pick; the queue holds anything that
`needs` it. The existing Breaker pass runs on every build diff before it
is committed.

**How long** (Q29): overnight. The limit (§6) is the real stop; a job also
stops at the quiet window's end and resumes the next window.

**Telling him** (Q27): an inbox card (always), a line in the morning
greeting (`greetDue.js` gate respected; one line, counted, never a
list), and push. His note: Telegram works too, and it already exists
(`lib/telegram.js`, `announceRecord` with Approve / Leave buttons), so a
project card can go there on day one; iMessage does not exist and APNs
needs the paid Apple account. New project kinds are added to
`notifyPolicy.RECORD_PUSH` only for the kinds that may interrupt
(`project-needs-you`, `project-limit`); the rest stay Inbox-only.

**Narration:** `src/jobBeats.js` narrates only `kind:'research'` today. A
`projectStages(record)` joins it so a running project job reads out its
stages in the glass from real record fields, never invented ones.

---

## 6 · Models and cost (Q21–Q24, his notes)

**Who picks** (Q21): Nova, by task type, through the lane registry: new
lanes `project-intake`, `project-research` (reuses `researcher`),
`project-build` (reuses `build`: opus high, sandboxed), `project-draft`
(sonnet). The model is named on every result (the receipt line, as the
Builder's receipt does today). A per-project override sets the lane's
model for that project only (a field on the record, read by `modelFor`
through a new `{project}` option).

**Fable** (Q22): never chosen by Nova. When Nova judges Fable the right
tool for a job, it files a `model-choice` card (the existing kind) naming
why, and the job waits. "Best quality" on a project pre-answers that card
for the project. Every alias already resolves to the newest model
(`modelWatch.js` probes the CLI and the lanes run aliases, so "best
up-to-date version" is the current behaviour; pinning is opt-in).

**No dollar budget (Q23), a limit agreed in conversation.** His note: if
a job is estimated to be expensive, discuss a limit before executing, in
terms of usage percentage per session and per week. What the code can and
cannot measure, honestly:

- It **can** read what each run cost in the CLI's own accounting
  (`total_cost_usd`, tokens; `lib/modelSpend.js`), and it knows when the
  usage limit was *hit* (`limited` on the row; the local-model fallback
  fires on it).
- It **cannot** today read his plan's remaining session or weekly
  percentage; the survey found no endpoint or file that carries it. To be
  verified in phase 4: whether the CLI exposes it (`claude` has a usage
  view in its UI; whether it is readable from a script is unknown). If it
  is, the limit is expressed as he asked. If it is not, the limit is
  expressed as the nearest honest thing: the CLI's cost figure, plus a
  projected share of the week from the last 7 days of receipts, and the
  page says which it is showing.

So: before a job whose estimate (the `capabilities.costUsd` table, and
for builds the median of that lane's last receipts) is above the
project's `discussAbove` (default: the largest single run of the last 14
days), Nova says the estimate and asks. The agreed limit is stored on the
project; reaching it files `project-limit` and pauses the queue. This is
what Q29's "budget as the real limit" and Q43's "never spending without a
budget" mean after Q23.

**Cost so far** (Q24): `modelSpend.recordRun` gains a `projectId` field
(the ledger is keyed by lane only today; `buildRow` decides what is kept)
and `jobRegistry.recordJobReceipt` carries it too. The project page shows
the total and the last seven days from those rows; a project older than
the ledger's 30-day window also keeps its own running total in
`.nova/ledger.json`, so the page never silently shows less than was spent.

---

## 7 · The no-mistakes bar (Q43–Q45), mechanism by rule

| Rule | How code keeps it |
|---|---|
| Never losing his work | every project is a git repo; every job commits or is diffed before `finish`; undo is `git revert` of the job's commit or the `.undone` move; the vault write is a `fileDecision` route with file hashes in `undoData`. Nothing is deleted, ever: archive, `.undone`, `.trash`. |
| Never spending without a limit | no job above `discussAbove` starts without the agreed limit on the record; the limit pauses the queue; Fable always asks. |
| Never acting outside its folder | the seatbelt for builds; `projectDir()` containment with symlink resolution for every path code touches; `changedFiles` on the receipt. |
| Never touching the vault outside its project | reads are handed in, never discovered; writes only through `project-page` / project Watcher routes that check the path prefix. |

Dry-run (Q45) for the first three projects, lifted per project by him.
The first real project is the room redesign (Q46); its path through the
phases is the acceptance test (§9).

---

## 8 · Nova changing itself (Q41–Q42)

Two channels, both as cards with yes / no / undo (the Coach-changes
pattern, `nova-coach-changes-pipeline`):

1. **Code**: Nova proposes a change to its own repo as a `project-brief`
   on the project "Nova"; approval runs the Builder with its gates and
   the Breaker; the result is a `code-ship` card (the existing kind) he
   ships or not. The commit block on Nova's repo stays.
2. **Prompts and routing**: when a lane's receipts show a pattern (a lane
   that always needs a fix round; a model-choice he always answers the
   same way), Nova files a `learned-change` card naming the evidence and
   the exact change (a lane default, an effort, a brief sentence). Code
   applies it to `model-prefs.json` or the brief file on approval, with
   the previous value in `undoData`. Nothing in Nova's own code changes
   through this channel, and no agent ever changes its own autonomy.

Phase 5. Not before the ledger has three weeks of project receipts to
learn from.

---

## 9 · Build order (Q47) and what "done" means per phase

**Phase 1 — a project exists.** `lib/projects.js` moves to `~/Projects`
(`PROJECTS_ROOT`), gains the record, the folder layout, the vault page,
the git init, stages, archive, sub-project `parent`. The intake lane and
the brief card. The Projects screen in both idioms with the list and the
project page (thread, phases, files, waiting). Home card. Dry-run.
Done when: he starts the room redesign by typing, answers Nova's
questions, approves the brief, and `~/Projects/room-redesign/` and
`Projects/Room redesign/` exist with the brief, the first commit and the
page, all from his phone; undo removes them; `guard-cupertino` unchanged;
tests for the record, the brief validator, containment and undo.

**Phase 2 — it researches.** Research jobs with `projectId`; the source
notes and synthesis; "Tell me" into the thread; the project Watcher with
destination, the `design` lens and the library flag. Done when: he sends
Nova three room videos, they land only in the project, the design lens
reads frames, the synthesis cites them, and he hears it spoken and talks
back.

**Phase 3 — it works while he sleeps.** The queue, the scheduler, the
quiet window, the concurrency cap, allowances as CLI blocks, stop-and-ask,
the morning line, push and Telegram, narration. Done when: a queued
research job for the room runs overnight unattended, appears in the
morning greeting as one line and as a card, and `LOG.md` has the receipt.

**Phase 4 — it knows what it costs.** `projectId` on the ledger and
receipts; the project page's cost; the estimate-and-ask; the agreed
limit; the usage-percentage question answered one way or the other, and
the page saying which.

**Phase 5 — it proposes its own improvements.** §8.

Science Atlas and Wren are adopted (§10) after phase 1 proves the shape on
one new project.

Each phase: lint, build, server tests, `guard-cupertino`, `shot.mjs
--readonly` on his real data in his style (summary), then commit, push,
`reload-server.mjs`, and the handoff says what was seen on his phone and
what was not.

---

## 10 · Settled with him (29 Oct 2026)

1. **Deploy and push.** Push is allowed only as part of an allowed deploy,
   for that project, and recorded in `LOG.md` and on the deploy card. A
   push on its own still asks.
2. **Science Atlas and Wren are linked, never touched.** His condition:
   "only if it can not be damaged or interfered with." A linked project is
   a record with `linked:true` and a path; Nova only *reads* about it: its
   sessions (the `claude agents` list Mission Control already reads), its
   cost (the ledger) and its git log. Code refuses every write to a linked
   project, in one guard every writer calls (`assertWritable(project)`):
   no folder layout, no `git init`, no `.nova/`, no commit, no queue, no
   Watcher destination, no vault page. A test proves each writer refuses.
   Full adoption is a later decision for him, after the room redesign has
   been through phase 3. Note: the Code screen's existing `atlas` and
   `wren` workspaces already let the Builder edit those folders when he
   asks it to; linking does not change that. Making those workspaces
   read-only is a separate one-line change if he wants it.
3. **Where it lives:** Projects absorbs the Code screen (§4, option a).
4. **Several at once:** a cap of two projects working at once until a week
   of receipts shows the Mac copes.
5. **Usage percentage:** if the CLI cannot expose it, the CLI's cost
   figure is acceptable as the worst case, with the page saying which it
   shows.
6. **The doc:** shown to him as a page on 29 Oct; approval of phase 1
   pending his read.

## 11 · Verified versus assumed (survey of 29 Oct)

Verified in code: the seams named in §0–§6 exist at the files and lines
given (`lib/projects.js`, `lib/builder.js` and its seatbelt, the Builder
lane with gates and Breaker, `fileDecision` routes and `undoFiling`, the
Watcher's fixed destination, the planner's resumable steps, the lane
registry and `modelWatch`, the lane-keyed ledger, Telegram's
`announceRecord`, the Home card chain, Mission Control's `projectOf`).

Assumed, to be checked in the phase that needs it: that the watch plugin's
frame extraction is reachable from `watcher.js` for the design lens
(phase 2); that the seatbelt profile accepts a nested sub-project folder
(phase 1); that a warm session can carry a per-project `--append-system-
prompt` without re-rolling the session each turn (phase 1); whether any
usage-percentage source exists (phase 4); the voice intake on his phone
(phase 1, by him).

Fixed on 29 Oct while surveying: `server/data/code-workspaces.json` still
pointed the Atlas and Wren workspaces at the old Desktop paths (the move
of 22 Oct); repointed and read back from the live server.
