# Nova OS — Session Handoff

**Read this first, every session.** `CLAUDE.md` carries the doctrine (what Nova
is, the non-negotiables, where things live). Memory files carry durable
project facts. *This* file carries the live state of the work: what is
half-finished, what was decided and why, what is verified versus assumed, and
which dead ends are already closed.

Updated at the close of each session (`/nova-close`). Newest state on top;
the session log at the foot is append-only.

---

## CURRENT HANDOFF
*Last updated: 12 August 2026*

**GOAL:** Keep Nova the one app Hayden opens daily. This session's thesis:
Nova could not SEE video, and video is where a large share of what he
learns now lives. So the work was to give Nova eyes — a link in, and every
idea from that video woven into the second brain, on the same review-gated
rails as everything else. **A second session ran concurrently on the
health/Shortcuts side; its commits are in this history (see STATE) and its
state is NOT verified here.**

**DONE CRITERIA (rolling):**
1. Overnight health push lands automatically — **partially met, and now
   another session's ground.** 9→10 Aug fired and landed; a guard-ordering
   bug it exposed is fixed (13975df). Later commits by the other session
   (d95dd32, 8ce8ec6, 78f07ef, dff6fc2) add a drops folder + morning
   catch-up — **not verified by me**.
2. Nova usable on the phone while the Mac sleeps — **met** for
   reads/queued writes; **unmet** for live conversation.
3. Companion plan Phases 1–5 shipped — **met**. Phase 6 (native wrapper)
   still parked.
4. Menu-bar Nova visible on his Mac — **blocked** (icon under the notch).
5. Live walkthrough of everything built — **unmet**, owed 5+ sessions.
6. Hands-free Siri capture + answers — **met**.
7. Produce-vs-keep corrected — **partially**: machinery ships, the 3
   trust-ladder proposals are still unapproved.
8. **Nova can watch a video and keep what matters — met, end to end,
   with his real 4-hour podcast in the vault.**

**STATE (what exists, where):**

*The video pipeline (this session's build):*
- **The Watcher** (`server/lib/watcher.js`) — the quick lane. Video URL →
  local transcript via the watch-skill scripts (resolved newest-version
  from `~/.claude/plugins/cache/claude-video/watch/`; `NOVA_WATCH_DIR`
  overrides; brew python preferred, `/opt/homebrew/bin` on the spawn PATH
  for launchd) → one judgment pass → **pending record, route
  `watch-note`**. Two lanes chosen by the model: `coach` (claims audited
  against the web) or `reference` (distilled with timestamps + wikilinks).
  Triggers: Inbox **▶ WATCH**, `POST /api/video`, or a `WATCH {...}`
  directive in an Ask Nova reply. Retryable; Ops conversational agent
  `watcher` (Knowledge+Train).
- **Approving a watch** writes his own podcast convention (`inbox.js`
  `watch-note` filer): `Wiki/Sources/<Title>.md` (`type: source`, `url:`,
  `raw:` link, `training` tag on the coach lane) **plus**
  `Raw/<Title> (Transcript).md` verbatim. Undo drift-checks BOTH files
  before touching either. Transcript persisted at
  `server/data/watch/<recordId>.txt` so filing never depends on a tmp dir.
- **The deep weave** (`server/lib/ingest.js`) — the full second-brain
  lane. A bare video link (no pasted text) is enough: it fetches the
  transcript itself, then the vault-`CLAUDE.md`-governed pass drafts
  Source/Concept/Entity/Topic pages for one review. Surfaces: Inbox
  **▶▶ WATCH + ANALYSE**, the **Deep weave** button on any watch record
  (pending or filed), or Add-to-vault with only a URL.
- **Long-video digest** (`digestTranscript` / `digestTranscriptCached` in
  watcher.js): transcripts over `SINGLE_PASS_MAX_CHARS` (150k) split into
  `CHUNK_CHARS` (60k) chunks, extracted **on Sonnet** at $1.00/chunk cap,
  concurrency 3, contract = exhaustive ("anything you omit is LOST",
  chapter-aware). Notes cached at `server/data/watch/<videoId>-notes.md`
  so a retry never re-pays. Chunk passes return **plain markdown**
  (`stripPreamble`); the judgment pass keeps JSON with
  `repairJsonControlChars`. Digested weaves also run on Sonnet.
- **Anti-duplication** — `videoIdOf` + `findExistingVideoPages`
  (ingest.js) match on VIDEO ID, so `?si=` tails and youtu.be vs watch?v=
  are one identity. Re-running reuses the existing Raw/ transcript and
  instructs the model to EDIT existing pages; the watch-note filer
  refuses a second Source page for the same video.
- **Ingest jobs persist** to `server/data/ingest/<id>.json` (Distiller
  pattern) — a ready job carries its full change set, so approval needs
  neither the process nor the tmp staging tree.
- **Brain Week** (`server/lib/brainWeek.js`) — Sunday 16:00 scheduled
  agent (`brain-week`, dept Knowledge): deterministic walk of the
  knowledge folders by `created` date → grouped wikilinked digest →
  pending journal draft. Manual `POST /api/brain-week/run`. Expires after
  8 days.
- **Inbox tap-to-expand** (`fullPayload` in `valsInbox.js`,
  `inboxExpanded` map in App) — every item, pending and history, opens to
  YOU CAPTURED / WILL BE FILED with the complete route-aware payload.
- **Honest agent lights** (`valsChrome.js`) — sidebar dots also pulse
  from ANY `classifying` record on the rails, so server-side work shows
  on every device; Watcher is on the AGENTS roster (VIDEO); hover names
  the in-flight job.
- **Whisper** — his Groq key lives in `~/.config/watch/.env` (0600).

*Other session's work, per commit messages only (NOT verified by me):*
`d95dd32` steps monotonic rule now applies to today; `8ce8ec6`/`78f07ef`/
`dff6fc2` morning catch-up shortcut cloned from his working one; health
drops folder at iCloud Drive/Shortcuts/Health Drops draining through a
shared ingest gate (`ingestHealthPayload` in `lib/healthData.js`).

*Standing from earlier sessions:* fleet ring in `server/lib/ops.js`;
hands-free `design/SIRI-SETUP.md`; reminders via CalDAV; trust ladder
(`autonomyLedger.js`); distiller (`distill.js`); About You interview; Ops
tap-through; server binds the tailnet IP directly; request receipts in
`~/Library/Logs/nova-os-server.log`.

**DECISIONS (choice → reason → what it forecloses):**
- **Two lanes, not one** (quick WATCH vs WATCH + ANALYSE) → triage is
  cheap (~$0.50) and absorption is not (~$6 for 4 hours), and he should
  not pay absorption prices to find out a video is filler → forecloses a
  single "just do the right thing" button; he picks, or taps Deep weave
  after reading the verdict.
- **Extraction runs on Sonnet, judgment/weave too when digested** →
  measured: a 150k chunk on the default (Opus) model cost $1.46 and died
  at a $0.75 cap having written 218 tokens; 60k on Sonnet costs $0.35 and
  returns ~7k tokens of dense notes → forecloses Opus-grade nuance in the
  notes; the exhaustiveness contract + verbatim dip-ins compensate.
- **Chunk notes are plain markdown, not JSON** → a 2000-word payload in a
  JSON string is one stray newline from losing a 4-hour digest (it
  happened) → forecloses structured per-chunk metadata; the notes carry
  their own headings instead.
- **Digest notes cached per video id, transcripts per record id** →
  extraction is the expensive, deterministic-input stage → forecloses
  automatic invalidation if a video's captions are later corrected; delete
  the cache file to force a re-extract.
- **The verbatim transcript never enters a Wiki page** (paraphrase only,
  full text in `Raw/`) → the vault's own CLAUDE.md rule 11 → forecloses
  quoting at length in concept pages.
- **A watch never files itself** (always pending, like the Researcher) →
  external content is not his words → forecloses hands-free "watch and
  file"; the Inbox tap is the gate.
- **Ingest jobs persist but are never resumed** → a dead mid-flight job's
  child process is gone and cannot be reattached → forecloses resume;
  the cached digest is what makes the re-run cheap instead.
- *(Standing: tailnet IP direct; fast spoken context; 90s calendar cache;
  autonomy proposed never applied; distillation refuses wholesale on
  drift; "I ate dinner" marks the planned meal.)*

**VERIFIED (12 Aug close, with locators):**
- Gates: `npm run lint` **0 errors**; `npm run build` green (`dist/sw.js`
  emitted); `cd server && npm test` **284 pass / 0 fail**;
  `git status --porcelain` **empty**; `HEAD == origin/main` (`dff6fc2`);
  `curl localhost:4173/api/health` → **200**; no `vite preview` process;
  `dist/pc.json` absent.
- Pages deploy: `gh run list` → last **three** runs completed/success.
- My work survives the concurrent commits — grepped in `git show HEAD:`:
  `watcher.js::digestTranscriptCached`, `ingest.js::persistJob` (×6),
  `brainWeek.js::composeBrainWeek`, `valsInbox.js::fullPayload`,
  `Inbox.jsx::WILL BE FILED`, `ops.js::watcher`.
- **The Hormozi weave is IN THE VAULT**: 41 changes applied with backups;
  `Wiki/Concepts/` now holds **52** files including *You're Not Behind
  You're Early*, *Tragedy Plus Time*, *Undeniable Proof*;
  `Wiki/Sources/33 Brutal Truths (…).md` and
  `Raw/33 Brutal Truths (…) (Transcript).md` both exist.
  Recall indexed it: `GET /api/recall?q=lonely chapter` returns
  *The Lonely Chapter*.
- Caches on disk: `server/data/watch/bbc39448.txt` (575,807 bytes),
  `server/data/watch/-AdkwqkE20M-notes.md` (168,675 bytes).
  `server/data/ingest/` is empty — correct, every job settled.
- Job persistence drilled for real: fabricated ready job → **actual
  `launchctl kickstart`** → recovered over HTTP with changes intact →
  discarded clean, file removed.
- Live records now: 192 total, **45 pending**; `bbc39448` video **filed**;
  `8ba46f76` video **undone** (the old Wiki/Inbox-format filing);
  `775ade9d` IHA coach verdict **pending**; `d7d16872` Brain Week
  **pending**.
- Measured costs (CLI `total_cost_usd`): 150k chunk on default model
  **$1.46** (killed at $0.75); 60k chunk on Sonnet **$0.35**; digested
  weave on Opus **$8.15** (killed at $8); the same weave on Sonnet
  **$6.11** with 37 staged changes.
- Groq key authenticates: `GET api.groq.com/openai/v1/models` → 200;
  `setup.py --json` → `status: ready`, `whisper_backend: groq`.

**ASSUMED (treat as open):**
- **That the Whisper fallback actually transcribes.** The key
  authenticates; no captionless video has ever been run through it.
- **That the weave's page content is good.** I read the change LIST and
  spot-checked frontmatter on one page — the 41 files' prose was NOT
  reviewed. Backups exist for every overwrite.
- That the exhaustiveness contract genuinely loses nothing. The notes are
  dense and chapter-aware, but no one diffed transcript against notes to
  prove coverage.
- That Brain Week's Sunday tick fires on schedule — only the manual
  `POST /api/brain-week/run` has ever run.
- That the tap-to-expand UI renders correctly on his phone — built and
  deployed, never seen on screen by me.
- That WATCH + ANALYSE works from the app UI. Every deep weave this
  session was started via `POST /api/ingest` from the shell; the button
  wiring is only inspected, not exercised.
- Everything in the other session's health/Shortcuts work.
- (Standing: autonomy proposals reducing noise; distiller link choices;
  food-slot path from the phone; Scriptable widget; About You invite.)

**OPEN QUESTIONS / BLOCKERS:**
- **45 pending records** — including `775ade9d` (IHA coach verdict),
  `d7d16872` (Brain Week), the 3 autonomy proposals, the distill draft,
  coach receipts. The number is climbing, which is the exact
  produce-vs-keep problem the trust ladder was built to fix.
- **The live walkthrough — 5+ sessions owed.** Now overdue enough that he
  has features he has never seen (Deep weave, Brain Week, tap-to-expand).
- **Two sessions writing this repo concurrently.** One swept my files into
  its commit (`0210290`). Nothing was lost, but the handoff and the test
  suite are shared surfaces — check `git log` before assuming a change is
  yours.
- Whether he wants the deep weave to run automatically for trusted
  channels (his phrasing: "less friction, less to remember").
- About You is still empty; every agent reasons without it.
- 00:05 automation reliability night-to-night, and the iPhone steps query
  returning nothing at midnight — the other session's ground now.
- MacBook often on battery overnight — any night is unreliable regardless.

**NEXT ACTION:** Ask him to run **▶▶ WATCH + ANALYSE from the app** on a
short video (not the shell). Expected observation: the review overlay
shows *Fetching the video transcript…* then a change list within ~3
minutes, and approving it writes Source + Concept pages — proving the
button wiring and the app-side approve path, which are the last two
untested links in the chain.

**DO NOT (dead ends already paid for):**
- Do **not** use `new URL(import.meta.url).pathname` for a path in this
  repo — the repo path contains a space, so it stays percent-encoded and
  silently writes a parallel `Claude%20Projects` tree. Four call sites did
  this; use `fileURLToPath`.
- Do **not** wrap a long model payload (notes, transcripts, page bodies)
  in a JSON string field. One raw newline = "Bad control character" and
  the whole expensive pass is lost. Ask for markdown.
- Do **not** read stderr before stdout when a `claude` child fails. A
  harmless "no stdin data received in 3s" warning was reported as the
  cause of a 15-minute failure; the real reason (is_error +
  `total_cost_usd`) is in stdout. Also pass `stdio: ['ignore', …]`.
- Do **not** set a budget cap without measuring the pass first. Two kills
  ($0.75 vs $1.46 actual, $8 vs $8.15 actual) cost ~$10 and an evening.
  Run one pass by hand, read `total_cost_usd`, then set the cap.
- Do **not** assume the CLI's default model is cheap — it is Opus, and
  bulk reading on it is 5× Sonnet.
- Do **not** hold an expensive, user-approvable artifact only in memory.
  Ready ingest jobs died with the process twice; they persist now.
- Do **not** diff a staged tree against `Wiki/` alone — `Raw/` must be in
  the `before` set or every transcript reads as "new".
- Do **not** write to `server/data/inbox.json` from a SECOND node process
  while the server runs — `inboxStore` caches it in memory. Trigger
  in-process via an endpoint.
- Do **not** document an HTTP header as `Authorization: Bearer <token>`
  on one line for a Shortcuts recipe — it gets pasted literally.
- Do **not** assume a Shortcuts failure is the Shortcut. Read the request
  log FIRST.
- Do **not** chase iOS "network connection was lost" without checking
  latency (>25s and iOS drops it).
- Do **not** add a slow external call into a spoken path without a
  deadline.
- Do **not** trust `tailscale serve` alone for phone→Mac.
- Do **not** claim an agent "ran" from a pending record alone.
- Everything in the previous DO NOT list still applies (Vite stale
  modules; `$` in `/m` regex over vault markdown; fixture-only tests for
  vault writers; verifying the PWA against the deployed Pages build in
  the MCP Chrome; `CACHED_LIVE_KEYS` for new live slices;
  Vercel/serverless; the steps Source filter; view-transition CDP evals).
---

## SESSION LOG (append-only, newest first)

### 10–12 August 2026
Nova learned to watch. The `/watch` skill became an agent — the Watcher —
and then a whole pipeline: a link in, transcript pulled locally, and either
a quick verdict (the Coach auditing a fitness video's claims against the
literature) or the full second-brain weave (Source, Concept, Entity and
Topic pages, wikilinked, verbatim transcript in `Raw/`). It ships with two
buttons because absorption costs ~$6 and triage costs ~$0.50, and he should
not pay the former to discover a video was filler.

Almost everything of value came from the failures, not the build. His first
real video — a 4-hour Hormozi podcast, 575k characters — broke the pipeline
four separate ways in sequence, and each break was a real bug: a budget cap
set by guess rather than measurement (a 150k chunk on the default Opus model
cost $1.46 against a $0.75 cap and died having written 218 tokens); a
2000-word payload wrapped in a JSON string that one raw newline destroyed;
an error handler that read stderr before stdout and so reported a harmless
"no stdin data" warning as the cause of a fifteen-minute failure; and the
weave itself dying at its own $8 cap on Opus. Measuring instead of guessing
fixed all of it — 60k chunks on Sonnet cost $0.35 and return 7k tokens of
dense notes — and the digest is now cached per video id so a retry never
re-pays. His question "will this duplicate anything?" was asked at exactly
the right moment: it would have, twice over, and video identity (by ID, not
URL) now prevents it.

Three things were corrected rather than added. The Watcher's first filing
put its note in `Wiki/Inbox` with `type: raw` and threw the transcript away,
so it never appeared under his Sources filter — it now writes his own
podcast convention. Four modules resolved a ghost `Claude%20Projects`
directory because the repo path contains a space (`URL.pathname` instead of
`fileURLToPath`), silently stranding a transcript and emptying the stream
feed's heartbeat reads. And ready ingest jobs lived only in memory, so a
$6 diff died on a server restart and had to be applied out-of-band — they
persist to disk now, drilled with a real `launchctl kickstart`. The 4-hour
conversation is in the vault: 41 changes, 19 new concepts, 11 existing
pages deepened rather than forked.

### 7–9 August 2026
The session split in two. First, a long Shortcuts saga: Ask Nova and Tell
Nova failed for hours through five different causes — a stale POST body, a
missing `text` field, a literal "Provided Input" placeholder, a colon in the
auth header (my documentation's fault), and finally requests that never left
the phone. Fixing it properly meant adding request receipts to the server,
binding the tailnet IP directly, and cutting a spoken answer from 26s to 12s
by caching CalDAV reads and parallelising the ask context. The health-push
root cause was also found and closed — the Shortcut's Request Body, not its
queries — though the automation has since stopped firing again for two
nights, which is HIS to check.

Second, the build wave: reminders (with real Apple Reminders alarms),
proactive Telegram, open loops, the fuel scorecard, Ambient v2, the widget
endpoint, the Ops tap-through (delegated to a subagent), the health mirror,
the pattern scout, the About You interview, and the distiller. The turn that
mattered most came from reading the data rather than the backlog: 30 days of
receipts showed Nova produced ~154 drafts and he kept 9, with the flagship
briefs aging out unread. That produced the trust ladder — autonomy computed
from real history and proposed on the rails — whose first pass filed three
proposals that are still waiting. Two things were corrected rather than
added: Nova was inventing macros for "I ate dinner" instead of marking the
planned meal, and a distill record was silently clobbered by writing to the
inbox store from a second process (now in DO NOT, with an in-process
endpoint as the fix).


### 3–4 August 2026
Customisability. Fixed the bug in his screenshot — an ingredients-only tweak
could not be saved because the alternate validator demanded a method it was
never going to have. Made a follow-up refine the version on screen instead of
restarting from the stored recipe, and put a mic beside the ask box so the
whole exchange can be spoken, with the answer read back from the preview
only. Built `editRecipe`: ingredients, method and macros, on any recipe or
any variant, reachable from ✎ EDIT THIS MEAL.

Two things were corrected rather than added. The first cut of the section
writer passed every test while drifting his file — it ate a blank line
between a recipe's `---` and the next heading, and stripped the bold from
steps he never touched; the identity round-trip over his real collection is
what caught it, and the writer now rewrites only the lines that changed.
Second, I spent three rounds chasing a wiring bug that did not exist: the
edit button was absent from the running app only because Vite was serving a
cached module. Both are now in DO NOT. The overnight push also fired a
second consecutive night (12,619 steps filed for 3 Aug), so that criterion
moved from one data point to two.

### 3 August 2026
Closed the steps saga: first fully automatic overnight push landed
(8,295 for 2 Aug). Verified the pmset changes he ran. Corrected my own
diagnosis — both the sleeping Mac *and* a non-firing phone automation were
real, on different nights. Made a sleeping Mac survivable: added this week's
four screens to the offline cache and made "mark meal eaten" queue via the
Outbox. Answered the hosting question (frontend already on Pages; backend
cannot move to serverless). Established this handoff system.

### 2 August 2026
NovaBar diagnosed and fixed (empty icon image, unplaceable status item,
off-screen panel) — it now opens on launch and via ⌥Space. Phone dock made
symmetrical: three each side of the core, Train and Recipes in the default
slots, plus a FREQUENT row in the More sheet. Spread view transitions to
notes/routines/sessions and gave every clickable press physics.

### 1–2 August 2026
Presence, motion and latency: NovaBar built (Swift, no Xcode project),
shared-element transitions on recipes, instant spoken acknowledgement to fill
the 5–8s think gap, CountUp numbers. Topic Pulse shipped. Describe-it food
logging shipped. Recipe promote-duplication bug fixed and his vault repaired.
Variant rename, in-session exercise skip, Coach skip-awareness.

### 30–31 July 2026
Companion Phases 3–5 (voice-confirmed actions, references/research, rituals),
the doorman greetings, skill registry, Nova Operations screen, overnight
queue, Telegram bridge, ambient wall mode, inbox expiry, and the food-log
write-race fix.
