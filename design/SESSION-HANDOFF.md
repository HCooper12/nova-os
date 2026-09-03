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

**3 SEP — THE AUGUST AUDIT IS COMPLETE (all 66 reports), AND THE THREE ASKS
HE MADE AFTER SEEING IT ARE SHIPPED. Nothing is half-finished.**

GOAL: execute `design/audits/2026-08-full-audit/99-SYNTHESIS.md` end to end —
Tier 1, Tier 2's shared-helper builds, Tier 3's surface refines, then #18
(every report's §6 plan in roster order 01→66) — and then act on what he
said when he saw the result.

DONE CRITERIA:
- The audit programme — MET. Every §6 item across all 66 reports is shipped,
  met by another item, or deferred with a written reason. The per-item record
  (547 lines, which used to live in this block) is now
  `design/audits/2026-08-full-audit/00-COMPLETION-RECORD.md`.
- The Leader talking about his training instead of his team — MET
  (`ea10aab`). He screenshotted "Budget Your Stress Like Your Sets" and said
  it is not managing, leading, inspiring or directing a team. Three causes,
  all ours: (1) the corpus filter admitted a page on ONE word anywhere in its
  title, so "Manage" let in Stress Management & Parasympathetic Switching and
  Waist Management & Digestion, and "Frame" let in The X-Frame & High-Value
  Aesthetic Muscles — six of seventeen title matches on his real 127-page
  shelf were body pages; (2) the daily idea was handed the fleet's receipts,
  which are overwhelmingly training and nutrition, so it built the idea from
  the only concrete material it had; (3) the prompt told it to ground the
  idea in "HIS material" and that combining concepts is high value. Fixed as
  three tiers (BODY_DOMAIN wins outright · unambiguous people words admit on
  the title · ambiguous words need a work-relationship signal, where "people"
  does NOT count because a physiology page says "people come to Galpin's
  company" · the strong-body PHRASE tier survives for a page called "Quiet
  Hobby" opening "notes on leading people at work"), plus `orgContext(…,
  {only})` so the daily idea gets standing rules alone while the chat still
  gets the whole org, plus a prompt that names the job in his words and
  forbids the training metaphor outright.
- Exercise targets before starting a workout — MET (`402ef72`). Today's card
  carries the muscles the session trains as chips, PER EXERCISE expands to
  every lift with its target, and each routine card gets the same line.
- The plan's DONE/SKIP marks — MET BY VERIFICATION, NOT BY BUILDING. The
  previous handoff called this unbuilt and was wrong: the client action, the
  route, the record write and the linked to-do tick all existed. What it had
  never had was a live run.

STATE:
- `server/lib/leader.js` — `isLeadership(title, body)` / `isLeadershipSource(
  title, concepts)` are exported and tested; BODY_DOMAIN · LEAD_CLEAR ·
  LEAD_AMBIGUOUS · PEOPLE_SIGNAL · LEAD_STRONG are the five lists.
  `leaderLiveLine()`, `researchWindowOpen()`, `verifyInsightUrls()`,
  `researchBody()` from the [37] work.
- `server/lib/orgContext.js` — `orgContext(vaultPath, self, { only })`;
  sections are `standing` · `siblings` · `fleet`, and the trailer names only
  the ones actually included.
- `src/vals/valsWorkouts.js` — `targetSummary(exercises)` → `{chips, rows}`,
  feeding `gymHero.targets` / `.targetRows` / `.targetsOpen` and each
  `routinesList[].targetsLine`. State key `gymTargetsOpen` in `src/App.jsx`.
- `src/vals/valsLeader.js` — `chipAge()`; chips carry `{text, age, resolve}`.
  `app.leaderResolve()` in App.jsx, `api.leaderReflect` in api.js.
- `server/lib/pulse.js` — novelty memory (`seen`, `newCount`, `lastNewAt`),
  `pulseRunDue`, `loadInterestsReport`, `describeRunFailure`, `runReceipt`,
  MAX_SEARCHES 8.
- `server/lib/overnight.js` — `requeueFailed`, MAX_ATTEMPTS 2, reconcile
  before re-running (`landedLate`).
- `server/lib/todoistSync.js` — `taskFate()`, `state.heldBack`.
- `server/lib/briefWarm.js` — `warmBrief({variant})`, WARM_WINDOWS,
  `warmFailureState`/`warmFailureNote`.
- `server/lib/healthMirror.js` — `noteHealthWrite`/`drainPendingMirrors`/
  `daysBackTo`; `server/lib/healthDrops.js` — `pruneProcessedDrops`.
- `design/audits/2026-08-full-audit/00-COMPLETION-RECORD.md` — the audit's
  per-item record.
- Suite 894 green; `scripts/verify-shipped.mjs` has the 'PER EXERCISE'
  marker added this session.

DECISIONS:
- The Leader's DAILY IDEA gets standing rules only; the CHAT keeps the whole
  org block. Reason: a conversation can afford awareness (knowing he slept
  badly genuinely helps an answer), but one unprompted generated artefact
  grounds itself in whatever concrete material it holds, and that material is
  mostly gym receipts. Forecloses the daily idea ever referencing what the
  Coach or the health insight is currently saying — if that is wanted later,
  add a section to `only`, do not remove the scoping.
- "people" is deliberately NOT a work-relationship signal in the corpus
  filter. Forecloses admitting pages that discuss humans generally; a
  genuinely people-leadership page with none of team/employees/staff/
  colleagues/reports/managers/leaders/workplace/meetings/hiring in its title
  or opening lines will be missed until one of those words appears.
- The pulse's search cap (8) shipped; the BUDGET was NOT raised — his call,
  with the measured numbers in OPEN below. Forecloses nothing.
- A deleted Todoist task holds its vault line open indefinitely
  (`state.heldBack`) rather than expiring. Forecloses a line being re-pushed
  after he deletes its task; editing the words is the way back in.
- Prior decisions all stand: Coach plans in memory and commits through owning
  modules (no path-sandboxing a vaultStateFile file; NOVA_VAULT_GRACE_MS=0 in
  multi-vault tests); legacy ingest changes stamped at approval; Coach undo
  restores the routines file only; respectNo means a no stays a no;
  Guardian's "check crashed" is the couldn't-look reference; Mission
  Control's failed plan points at the Inbox rather than inventing a run
  action.

VERIFIED (with locators):
- At close, re-run not remembered: `npm run lint` exit 0 · `npm run build`
  green · `cd server && npm test` → tests 894 / pass 894 / fail 0 ·
  `curl /api/health` → 200 · `git status --porcelain` empty · HEAD ==
  origin/main == `9ede8da` with 0 unpushed · no vite listener on 5173 ·
  `dist/pc.json` absent · `node scripts/verify-shipped.mjs --server` →
  "deployed build matches local (9ede8da3b)" and "Everything above is
  genuinely live on his devices", including the new marker "Train · today's
  card says what the session trains, before he starts".
- The Leader fix, on his real vault: corpus went 19 concepts + 8 sources → 7
  + 3 with no body pages; the daily context went from 8 gym-data references
  to 0; a forced regeneration produced "Delegate The Decision, Not Just The
  Task", grounded in the delegation research already on his shelf.
- Exercise targets, at 375×812 on his real data: Upper Body renders BACK ×2 ·
  BICEPS ×2 · CHEST ×2 · TRICEPS ×2 · SHOULDERS ×1, expanding to all nine
  lifts above BEGIN SESSION; all four routines summarise with 0 unmapped.
- DONE/SKIP live: `POST /api/inbox/8071a462/priority` → 200, `outcome` +
  `outcomeAt` written, read-back confirmed, reverted to null. Both consumers
  read it (`dailyReview.js` today-plan section renders "— DONE / SKIPPED";
  `planToday.js` yesterday-plan renders "DONE / SKIPPED / no word").
- 3 Sep, on his real accounts: Todoist v1 `GET /tasks/{id}` → 200 for a
  completed task (`checked:true`) AND a deleted one (`is_deleted:true`); two
  scratch tasks in his "Old" project, confirmed gone afterwards. Pulse: one
  real Hypertrophy run on haiku = $1.06 / 20 searches / 267 s.
- Earlier phone-width pass at 375×812: Mission Control (satellite overlap
  found and fixed), Workouts TODAY + GYM, Inbox top, Recipes rotation (CLEAR
  26×11 → 49×32 measured), Ambient (sync line top-right).
- Guardian live: `backups | ok | 338 snapshots … Newest written 2026-09-02`.
- Staged pass: regression fails on old code; renderers reproduce his real
  Workout Routines.md (4) and Exercise Library.md (135) byte-identical.
- Respect-the-no dry-run on real records: 1 declined program subject held;
  12 food declines hold 60d; compost serves 11.

ASSUMED:
- The Leader's NEXT daily idea (the scheduled 06:00 one, not today's forced
  run) has not been seen. One good generation is evidence, not a pattern —
  read tomorrow's card before calling the relevance problem closed.
- No live apply/undo has run through the staged pass yet — proven on scratch
  vaults only; the waiting weave is his to approve.
- Client renders of the ERROR states (Fuel couldn't-check card, Ambient
  unknown, Mission plan error) are still unseen; the live server had no
  failures to show. Happy paths are seen at 375px.
- Distill job file a26d3d1f.json stays 'ready' on disk after its record was
  discarded (distill has no discard hook the way ingest's discardJob has);
  harmless, 245 KB, unpruned.
- The evening brief-warm window (19–22) and the health mirror's old-month
  drain are unit-tested but have not been observed firing on the real clock.

OPEN QUESTIONS / BLOCKERS:
- PULSE BUDGET — HIS CALL. One measured run of the Hypertrophy topic on haiku
  cost $1.06 over 20 searches in 267 s against a $0.50 cap, so 1–2 of 3
  topics have failed most nights since ~20 Aug with the $0.50 spent anyway.
  Shipped: an 8-search cap and legible failures with cost receipts. Options:
  (a) raise MAX_BUDGET_USD to 1.0 (~$2.4/night worst case); (b) keep $0.50
  and read the new receipts for a few nights to see whether the search cap
  alone lands the science topics; (c) drop to two topics. Not changed.
- `stores | alert | 15 filed records missing undo data` (8 Aug–1 Sep:
  pattern×4, coach-program×4, fuel-cross×3, coach-audit×2, model-choice×2) —
  real holes, or informational records the check should not count? The check
  still alerts.
- He has declined all 12 food-save proposals ever made — retire or reshape
  the lane. Surfaced repeatedly, not acted on.
- About You (`Wiki/Profile.md`) does not exist, and Fitness Goals still has
  no equipment or injuries/limitations fields — both checked on the real
  vault 3 Sep. Every agent reasoning about his training or priorities is
  blind on both. HE SAID he will fill these in "in the next couple of days".
- Todoist held-back lines never expire; a "held back N" chip in Settings
  would make them visible.
- The live workout cockpit's set rows and long-press targets were not
  exercised — starting a session writes a draft to his real vault, so this
  wants checking on his phone during a real session.
- The rerun of the distillation (to redo the 1 Sep pass on the fixed diff) is
  his call or the weekly scheduler's — costs a model pass.
- His phone's Scriptable widget still runs the OLD script until re-pasted.
- The audio-session fix is spec-based (navigator.audioSession, Safari 17+);
  if music still pauses on a tap, the next suspects are the wake-word
  listener and the speechSynthesis prime — both bracketed, neither tested on
  the device.
- Telegram photo and voice paths have never been exercised from his phone.
- Week-plan window semantics; `guardian: 26h` — carried.
- Not chased: `Workout Routines.md` took four writes in 19 seconds at 08:26
  local (the week-plan annotation pass). Each is backed up, but that is
  chattier than it needs to be.

NEXT ACTION: nothing is mid-flight, so this is his pick rather than a
resumption. The cheapest high-leverage item is the About You page and the
Goals equipment/injuries fields, which he has said he will do — after that,
re-run any agent that reasons about training and the advice should visibly
sharpen. The one open engineering thread is the pulse budget (a decision,
then a one-line change). If instead you want a signal that today's Leader fix
held: read tomorrow's 06:00 card — expect a people-leadership idea citing one
of his seven leadership concepts, and NO reference to sets, RPE, protein or
recovery. If it reaches for his body again, the corpus is clean, so look at
the prompt and at what `orgContext` is returning.

DO NOT:
- Do not treat a keyword-in-title filter as domain classification. "Manage"
  matches Stress Management, "Frame" matches The X-Frame & High-Value
  Aesthetic Muscles. Test any such filter against his REAL shelf and print
  what it admits before believing it.
- Do not let a catch that exists for honest degradation swallow a
  ReferenceError: deleting LEAD_TITLE_WORDS while `scanSources` still
  referenced it turned into a silent "0 sources" instead of a crash. When a
  count drops to zero after a refactor, suspect the catch.
- Do not read a time off a devtools-MCP screenshot as his local time — that
  browser's clock ran ~5h behind on 3 Sep and cost a detour chasing a
  training schedule that had not changed (a long-lived tab was rendering
  cached state).
- Do not run `node scripts/verify-shipped.mjs` without rebuilding after the
  final commit — it compares the deployed stamp with the LOCAL build and
  fails falsely. This bit twice today.
- Do not edit source with `perl -0pi` and a hand-escaped multi-line pattern:
  a failed match can insert the replacement at byte 0 (it did — mealPrep.js
  line 1). Use a node script with exact-string anchors that throw when
  missing, and that refuse when the anchor matches more than once.
- Do not diff a staged copy against the live vault to find "what the model
  changed" — the live vault moves during a pass; diff against the staging
  baseline (diffTreesReport) and treat a live move on a model-touched file as
  a conflict, never a merge.
- Do not open the dev app at http://127.0.0.1:5173 — the CORS list has
  localhost:5173 only; everything reads OFFLINE and looks like a bug.
- Do not start a canvas loop from componentDidUpdate when the screen is a
  lazy chunk — the ref is null on that update; start it from the ref.
- Do not sandbox a vaultStateFile-owned file by path, and do not write one
  raw — go through the module (see stagedPass.js header).
- Do not match `\w{3}` for an en-GB short month — September is "Sept".
- Do not write a source-scanning test whose forbidden literal appears in your
  own explanatory comment — scan code lines only.
- Do not use a plain function name as a verify:shipped marker — the minifier
  renames it; use an object/dataset key or a string literal.
- Do not read a test's scratch vault as independent: the state cache is per
  module; set NOVA_VAULT_GRACE_MS=0.
- Do not rebuild NovaBar without expecting the panel to pop on relaunch; tell
  him if he is at the Mac.

## SESSION LOG (append-only, newest first)

### 3 September 2026 — the audit's last roster items, and the Leader learning to talk about his team
Finished #18 — every §6 item across all 66 reports is now shipped, met by
another item, or deferred with a reason, and the 547-line per-item record
moved out of the handoff into
`design/audits/2026-08-full-audit/00-COMPLETION-RECORD.md`. Shipped [37]–[46]
plus the surfaces [47]–[66] in five batches: the Leader's resumed-turn live
line and HEAD-checked research links, the pulse's novelty memory and named
cap, the evening brief warm, old-month health-mirror corrections, late-fire
reminder honesty, Todoist telling a deleted task from a completed one (gate
opened by probing his real account with two scratch tasks), the overnight
queue's one retry and late-landing reconcile, Ops match-lines for the study
lane and Scout, the Money list cap, chip ages and mark-handled on the Leader
screen, and the Ambient wall's sync age, stale dimming and OLED drift.

Three things were corrected rather than added. The pulse lane had been
failing 1–2 of 3 topics most nights since roughly 20 August, logging only
"exited 1"; one measured run showed the real cause — $1.06 of searching
against a $0.50 cap — so failures are now legible with cost receipts and the
prompt caps searching at 8, while the budget itself was left as his decision
rather than quietly raised. The plan's DONE/SKIP marks were recorded here as
unbuilt; they were not, and a live run over the real HTTP route proved the
whole loop including both consumers, so the handoff was wrong, not the code.
And the phone-width pass found three real defects that code review had not:
a satellite sitting across the core's status label, a 26×11px CLEAR control
on the action he takes four times a day, and a concept card wearing the daily
review's name.

Then his own three asks. He screenshotted the Leader saying "Budget Your
Stress Like Your Sets" and named the problem exactly: that is not managing,
leading, inspiring or directing a team. Measuring the corpus against his real
127-page shelf showed six of seventeen "leadership" matches were body pages —
"Manage" admitting Stress Management and Waist Management, "Frame" admitting
The X-Frame & High-Value Aesthetic Muscles — while the daily idea was
separately being handed a fleet block that is almost entirely training and
nutrition. Fixed at all three levels, and verified by regenerating the card,
which now reads "Delegate The Decision, Not Just The Task". Built the
exercise-targets preview he asked for, so today's card names the muscles and
expands to every lift before BEGIN SESSION. One durable trap learned: the
devtools browser's clock runs hours behind his, which sent me chasing a
training schedule that had never changed.

### 30 August – 2 September 2026 — the full-platform audit, and shipping its top findings
Audited all 66 agents and surfaces read-only, one per turn, then executed the
synthesis in tier order. The audit's own headline finding got worse on
contact: `--allowedTools` is not enforced under bypassPermissions, and where
the item-by-item read had found three unguarded spawn sites, a mechanical
sweep found fourteen — seven of them passing `--allowedTools ''`, meaning "no
tools please", while the model could in fact write files and run shell. Fixed
by denying the complement of what each lane asks for, so the allow-list is
enforced by construction. Proved with a canary after the obvious check —
asking the model to list its tools — returned two contradictory answers a
minute apart, one naming "PowerShell"; that method note is now in the module,
because it is the sort of thing that gets re-learned expensively.

Then Tier 1. The workout save was replaying through the offline outbox and
filing a second session — double-counting exercise state and re-firing the PR
ping and the Coach debrief — now idempotent on a client-stamped key, with the
PR celebration still returned on a replay since a lost response means he never
saw it. Health Insight was retrying an uncapped $0.50 compose every hour from
06:00 to midnight whenever it failed, silently; capped at three, with the last
failure announcing itself, and the lane got its first test file. Guardian was
watching 13 loops beside a roster of 29, so sixteen agents could die
unnoticed; it now derives the watch from the roster — verified live at 29 —
and five weekly agents whose exact-day windows a sleeping Mac could miss now
stay open for the rest of their cycle.

Corrected rather than added: a health-mirror test asserted a row for the 2nd
of the current month, which the page builder correctly drops as future — so it
failed every 1st, and had already broken two Pages deploys that day before it
was noticed. The deploy pipeline, not just the test, was the casualty. Suite
went 713-with-one-failing to 727 green.

### 27–30 August 2026 — the black screen, the ambush sheet, the once-a-day brief, an ingest cap that ate a job, and food macros that compute instead of recall
Four real failures, fixed in two commits. The black screen and the ambush
review sheet turned out to share one root cause: boot-resume trusted a
job's status from the server's list without loading its preview, so
`IngestReview` rendered a "ready" branch against null and threw, taking the
whole app down — reproduced at phone size before touching anything. Open
work now surfaces in the WORKING panel instead of seizing the screen, and
the same load-before-render ordering that fixes the ambush also fixes the
crash. The brief was marking itself "delivered" only when audio actually
played, but an auto-brief has no user gesture behind it, so iOS blocked
autoplay almost every time and the retry re-read the whole brief on every
open — now marks on delivery, server-side, shared across devices.

Then two complaints in one message. A vault-ingest video hit a $3 cost cap
— sized for a pasted note, applied indiscriminately to full weaves — spent
$3.08, and was killed with nothing written; raised both budget constants to
env-overridable backstops (25/40) reframed explicitly as guards against a
runaway loop, not spending controls. And food-macro logging gave two
different totals for the identical pizza description (1050 kcal/50g, then
940/36g) — traced to the prompt telling the model to answer "from your own
knowledge, no search" for most foods, which guarantees a different
plausible number every time since LLMs don't recall numbers reliably.
Rebuilt along the platform's own line: the model now only decomposes food
into components with gram weights; a new `nutritionFacts.js` looks each up
in USDA FoodData Central, scales by weight, and derives kcal from the
Atwater factors, so a stated kcal that disagrees with its own macros is now
impossible by construction. Verified live: the same pizza returned
identical totals (2,408 kcal/129g protein) across repeat calls, all four
components matched and source-attributed. While confirming no jobs were
in-flight before this session's own restart, found that a PRIOR restart had
in fact orphaned an in-progress job — his Atomic Habits ingest — which
directly answers, in the negative, the previous handoff's open question
about whether it ever completed. 709/709, lint 0, build green both times.

### 25–26 August 2026 — evidence on screen, the phone-voice bugs, the ship-verification crisis, and Coach reading his own notes
Started from his complaint that Nova speaks a lot without anything to look
at, and ended up rebuilding how "done" gets claimed at all. Made every
spoken Ask-Nova/Coach answer infer a visual panel deterministically (code
picks the shape from the question, never the model), added a `sessions`
panel that didn't exist, and wrapped every render site in an error boundary
— there was none anywhere in the app, so one malformed panel used to blank
the whole screen. He sent screen recordings of the phone voice failing;
watching them frame-by-frame (rather than guessing) found three separate,
unrelated bugs: the brief racing a TTS-status fetch and giving up silently,
a full-screen focus blur spotlighting a card rendered below the mobile
fold, and the iOS-audio "unlock" replaying his last sentence because its
audio element still held the previous TTS blob. Built findings-as-charts
(fuel findings had never exposed the numbers their prose quoted) and a
question-by-question brief close that reuses the existing inbox
approve/discard rails rather than inventing a new one. Let Coach apply
program edits from inside the chat — the write path already existed and
was tested, it just had nowhere to say yes from.

Then he said, plainly, that he no longer trusted "shipped" as a word from
me, and he was right to: nine commits had sat unpushed behind a blocked
permission classifier while progress kept being reported, a feature landed
in the one Coach-message renderer out of three that he wasn't looking at
(twice), and his PWA was silently serving a cached bundle for days because
`autoUpdate` updates the service worker, not the running app. Built the
actual failsafe rather than apologising again: a build id compiled from
the git commit (not a timestamp — those can't equal themselves across a CI
rebuild), a `version.json` the app polls and shows an UPDATE banner
against, and `scripts/verify-shipped.mjs`, which checks the LIVE deployed
bundle rather than the working tree. Running it immediately caught two
bugs in itself — a build id that could never match, and chunk names read
from local files that 404 against CI's different content hashes — which
is exactly the point of a script instead of a claim.

Closed by confirming, and it was true: Coach's progression engine, its
weekly detectors, the program audit and the Sunday debrief all ignored his
per-exercise session notes. A note reading "struggling to move 9.1kg
without a nudge of body momentum" could not stop a load increase, because
nothing except the chat ever read it. Built a narrow, suppress-only note
reader (a signal can hold a load increase, never create one) and wired it
through every surface that reviews his training — verified live: Cable
Lateral Raise and Alternate Incline Dumbbell Curl are now held, citing his
own sentences.

### 23–24 August 2026 — Phase C, the Librarian + Library, Coach that edits and judges the plan, and Fuel fixes he asked for twice
Finished the fluidity plan: writes now tag which slices they touched, so a
todo checkbox costs 3KB instead of 996KB (measured live). Two bugs only the
browser found — routes fire their own domain broadcast beside the chokepoint
one, which silently cancelled the whole optimisation, and one write emitting
two events made it sync twice. Built the Librarian (a book title + author →
triangulated dossier → woven vault pages, provenance-labelled researched vs
read) and the visual Library shelf with real Open Library jackets cached
server-side. Coach can now APPLY its suggestions to the real program through
typed ops with full undo, always behind a confirm sheet with a free-text box;
applied two changes to his live plan while he was at the gym. Then he pushed
back that Coach was "suggesting changes for the sake of them" — his data
proved it: 227 working sets, all RPE-rated, 88% at RPE 9–10, and the default
progression path never read RPE at all, so a shoulder press he was grinding at
RPE 10 kept earning +2.5kg. Effort now gates load everywhere and grinding
lifts get a tempo/control prescription instead of a number.

CORRECTED RATHER THAN ADDED: the "HARD SETS THIS WEEK" bar was showing LAST
week's numbers every Monday. A health-push failure that looked like my deploy
was actually one missing HealthKit metric making the whole JSON body invalid —
one absent reading was discarding every other metric. My first "too many
exercises" detector measured session length and could never fire, because he
already splits routines across days; the real signal (routines he cannot
finish) was in the same data. Copy that told him to earn FEWER reps than he
was already doing, and a proposal to cut Weighted Pull-Up 30 minutes after
Coach created it — both caught by running detectors against his real log
before shipping. And a CSS bug I introduced: adding the camera button pushed
the tweak panel's ASK button outside its card at phone width, which he found
after I called the feature live, because I had only screenshotted it at
desktop width.

### 23 August 2026 — model-cost fix, Coach's self-review, a shipped crash caught and fixed
He caught Coach hitting a "Fable 5 usage" limit mid-conversation — traced
to every unpinned Claude CLI call inheriting the account's ambient
default model, which had silently become Fable 5. Pinned Coach to opus
and 12 other automated background lanes to sonnet. Built the Coach's
program review (server/lib/coachProgramReview.js): three code-driven
detectors — a lift's name contradicting its filed muscle group, a lift
flat for 3+ weeks (swap suggested to the same muscle), a goal muscle
chronically under target — raised onto the inbox rails, surfaced in the
morning brief, the Train TODAY card, and Coach's own conversation
context, nudged at 3 and 7 days then escalated to Telegram. Verified
against his real vault: raised two genuine findings (a real Face Pull
mapping error, a real stale Cable Flys swap) that are still sitting in
his Inbox, intentionally. Added coach-chat auto-scroll-to-bottom and a
temporary mid-session exercise add ("this session only", never written
to the program) — but the first ship of the latter crashed his screen
black. Reproduced it properly on an isolated scratch server (a COPY of
his vault, throwaway port/data dir, his live backend untouched) rather
than guessing: found an undefined `${M}` font reference that only threw
at render time, plus a second bug where creating a brand-new exercise
mid-session was silently routed to the wrong destination (or worse, into
his real program if a routine happened to be open behind it). Both
fixed and re-verified on the same scratch repro. Also discovered and
fixed, mid-session, a real data-loss mechanism in inboxStore.js: writing
to it from a one-off script while the live server also runs risks a
silent cross-process cache clobber — the two coach findings vanished
once before I caught it and built the proper HTTP-route fix. 415/415
tests, four deploys, every bundle hash-verified.

### 18 August 2026 — mockup parity shipped + the audit that caught a live bug
P2 cockpit + one-bar log screen-verified and deployed. Visual-claims audit:
voice dynamics and canvas panels both proven real on screen; the audit
surfaced a genuine reply-loss bug (SW-update reload mid-speech ate the
answer) — fixed the same hour. Fuel cross-reference agent (spec #11)
built end-to-end with a true first finding on his real data; decline-asks-
why shipped on all Coach advice. 348/348 tests. Three deploys, every
bundle hash-verified against the harness-verified dist.

### 13–16 August 2026 — the Forge, the spoken lane made fast, and two wrong diagnoses
He sent an Instagram reel — a hand-built watchOS app dispatching Claude and
Codex jobs from the wrist, with live status in the Mac's notch — and asked
for the same, expanded. Watched it frame by frame (60 frames + Whisper
transcript) and wrote `design/WRIST-PLAN.md`: the key finding was that Nova
already owns most of what that author built from scratch (server, auth,
inbox rails, agent lights, SSE, Siri dispatch), so the genuinely new pieces
are a job runner, a notch HUD, and wrist dispatch. Built Phase 1, **the
Forge** (`lib/forge.js`): one spoken sentence → a real running artifact,
sandboxed to `~/NovaForge/`, live tool status on the existing rails,
persisted receipts, stop, and Telegram announcements including failures.
Verified with a real snake game — $0.90, 3m32s, 22KB self-contained HTML
that the job smoke-tested itself. Two bugs were mine and are recorded: the
plan's invented "Build" department (no such thing — Platform), and a
`stopForge` that mutated a disk copy so the stop flag never reached the
child.

The bigger thread was his complaint that Ask Nova from the watch felt so
slow it defeated the point. That was measurable, not a feeling — 14.2s,
15.9s, 23.9s sat in the request log. Cause: `/ask/sync` minted a NEW
conversation per ask, paying context assembly, a cold CLI boot, and prompt
cache creation every single time, because the warm pool is keyed by session
id and a fresh id can never hit it. `lib/spokenSession.js` now keeps one
conversation with day/age/turn caps and re-states the volatile numbers per
turn: **2.1–2.2s resumed, 11.5s cold**.

Then he said Siri still wasn't answering, and I got it wrong twice. First I
found and fixed a real bug — the keepalive drip prefixing the JSON body with
spaces, which Shortcuts could not parse — and reported it as the cause. It
was not; it had only ever affected slow answers, and my post-fix tests all
returned in 2s and looked clean. He said it still failed, so I added a raw-
body receipt, and that finally showed the truth: his Shortcut had been
sending the literal words `"Provided Input"` — the variable's NAME instead
of its value. One screenshot from him confirmed it in seconds. He rebound
the variable and it now works from his phone (`"8,538 steps on August 15th,
sir."`). The server now refuses known Shortcuts variable names out loud
rather than politely asking him a question he cannot answer hands-free. Also
untracked a PDF that a careless `git add -A` swept into a commit.

### 13 August 2026 — alarm-stop confirmed live; steps-parity thread opened and paused
The alarm-stop automation fired for the first time, cleanly, at 07:25 local
— filed 12 Aug's full health payload, `stepsComplete: true`, no errors. The
whole point of the prior close's fix, proven. He noticed Nova's steps
(10,022) sat ~1.1% under Apple Health's own figure (10,139) and asked why.
Root cause, confirmed against Apple's own developer forums: the true
cross-source dedup Health shows requires `HKStatisticsQuery`, a native
HealthKit API a Shortcut cannot call — Nova's per-device MAX fold is an
honest approximation, not a bug, and this project already proved the naive
alternative (no Source filter) is worse. Built a full adapter
(`lib/autoExport.js`, route `POST /api/health-data/auto-export`) for Health
Auto Export, a real app that CAN call the proper API, reusing the existing
shared ingest gate via a new `skipDateShift` option. Gate-clean (294/294
tests), live-tested with synthetic data, committed and pushed
(`84cadb5`) — but he then found the app wants a paid subscription and
declined to buy it right now. **Thread is parked, not abandoned**: the
adapter is built and waiting, untested against a real payload, for whenever
he decides to revisit it.

### 12 August 2026 (afternoon) — closing the health thread's last gap
He added the alarm-stop trigger on his phone — the previous close's fix is
now live end to end, pending tomorrow morning's first real run. Re-verifying
the previous handoff's claims by a second route (reading the pushlog and the
JSON files directly, not trusting the prose) surfaced a live bug it hadn't
caught: `server/data/health/2026-08-12.json` was carrying 11 Aug's
`activeEnergyKcal`, `walkingRunningDistanceKm`, `restingHeartRate`, `hrv`,
and `vo2Max` — 819 kcal and 15 km logged against 163 real steps. Cause: a
drill push made during the health thread's own testing used the literal
date `2026-08-12` instead of `yesterday`, landed as the day's first push
(so even the steps guard had nothing to compare against), and the other
accumulators had no guard at all — only steps did. Fixed by generalizing
`shouldDropLowerSteps` → `shouldDropLowerReading`, applied across a new
`ACCUMULATOR_METRICS` set (steps, activeEnergyKcal, walkingRunningDistanceKm,
sleep*); point-in-time metrics (RHR, HRV, VO2 max, weight) stay unguarded on
purpose since a later reading of those is just more current. Verified live
against the running server with a scratch date, not just unit tests. Today's
file repaired by hand. Gates re-run clean (287/287); committed, pushed
(`6b8751b`), service reloaded.

### 11–12 August 2026 — the health thread (concurrent session)
The steps saga ended, and not where anyone was looking. Three faults were
stacked: iOS **encrypts Health data while the phone is locked**, so the
00:05 automation had only ever succeeded on nights he happened to be
awake; my own monotonic-steps guard **exempted the current day**, which is
how a truncated 813 overwrote a genuine 11,107; and the missed-push
sentinel only shouted at *missing* days, so a stale midday partial sat
there in silence all morning. All three are fixed, and his locked-phone
test is what proved the first — automation fired, Mac awake and serving,
nothing arrived on either channel.

The fix that shipped is a clone, not a build. Six attempts at authoring a
`.shortcut` file failed on Shortcuts' own serialization (Statistics needs
an explicit input; hand-built date filters are inert) — each one costing
him an import and a run. What worked first time was fetching **his own
automation from an iCloud share link** and changing exactly two things:
the date token → the literal word `yesterday` (the server resolves it),
and the drop filename. Verified live: the full 8-metric payload filed
against 11 Aug, with the MAX fold and monotonic guard correctly keeping
his higher manual figure while every other metric repaired the day.

Two things were corrected rather than added. I wrote 11,107 back into
11 Aug from the pushlog without checking the window it was captured over —
it spanned midday-to-midday across two days and was never a valid daily
total; his manual 10,218 was right and mine was wrong. And I proposed a
fixed 22:30 push as a fix, which he correctly rejected: his bedtime
varies, so a fixed hour truncates the day unpredictably. Alarm-stop is the
only trigger that is both unlocked and after the day is complete.

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
