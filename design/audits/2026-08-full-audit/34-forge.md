# 34 — Forge

Audited 2026-08-31. Read-only. Files opened: `server/lib/forge.js` (full,
420 lines). Entry points (Shortcut/wrist dispatch route, Telegram command,
intent router) traced by grep, not line-read [declared — they ride
existing rails; verify affordances at items 47/63/66]. readStreamEvent /
describeToolUse / parseBuiltLine exported pure for fixture tests.

## 1. What it is (verified)

Nova's build department — the first agent producing a RUNNING THING, not a
document, dispatched by one spoken sentence from anywhere (12-20). The
containment reasoning is exemplary and explicit (22-32): the Forge gets
Bash, so **the containment is the directory, not the toolset** —
`~/NovaForge/<slug>/` sandboxes, output is disposable derived data, the
vault is never written ("the trust ladder is not bypassed just because a
job was useful"), and everything off-machine or touching Nova's control
plane is in the disallowed list — which line 51-53 states is the real
boundary because **"--allowedTools is documentation only under
bypassPermissions — verified empirically"**. This upgrades the [30]
URGENT cross-cutting finding from a comment's claim to a confirmed fact.

- **Live status without new plumbing** (70-114, 278-287): the CLI's own
  tool events become plain-English lines ("Running npm install…") written
  onto the record itself — every surface that renders records (watch,
  notch HUD, sidebar lights, phone) shows build progress for free.
- **Failure announcements** (148-175): "dispatch-and-never-hear is the
  worst possible behaviour for a surface whose whole point is that he
  isn't watching" — built AND failed AND stopped all Telegram, with
  elapsed time and measured cost on every line. The [05]
  silent-auto-fail family, solved here; name it the fix's reference.
- **Proof, not a claim** (200-227): a finished index.html is opened and
  photographed so what lands on his wrist is evidence the thing runs —
  with honest degradation at every step (no artifact / no permission /
  capture failed, each named). His own standing UI-verification rule,
  implemented in an agent.
- **Lifecycle lessons encoded**: budget generous with the
  two-guessed-caps-cost-$10-and-an-evening rule (34-38); stdin ignored
  (launchd hang); stdout-before-stderr diagnosis; the percent-encoded
  path bug; the stop/crash race fixed by marking the LIVE object
  (397-408); built lands PENDING — he still judges (339-341); discard
  deletes artifacts behind a sandbox-root guard, no undo needed and the
  reason stated (413-417).

## 2. Current workflow, traced

"Hey Nova, build me a habit tracker" from the watch → record classifying,
agent lights pulse everywhere → the job builds in its own directory,
status lines streaming onto the record → BUILT line parsed (the spoken
summary is the model's own words — never canned) → index.html opened,
photographed → record pending with summary, cost, proof, dir → Telegram:
"⚒ Forge — built · 3 min · $0.90 …". A dud build: he discards, the
directory deletes.

Failure modes, as they degrade today:
- Build fails/exits/stops → error record + Telegram with the reason and
  spend. **Honest — the best failure story in the fleet.**
- Model forgets the BUILT line → "It finished, but never said what it
  made." **Honest.**
- Proof impossible → the receipt says exactly why. **Honest.**
- Status update fails → never kills the build. **Honest.**
- **The proof photograph is the whole screen** (218: bare
  `screencapture -x`) — whatever else is visible on the Mac at that
  moment is captured into a PNG that persists in JOBS_DIR indefinitely
  and rides to his devices. A private window open at build-completion
  time ends up in a forge receipt. **Privacy edge, unhandled.**
- **No duplicate/concurrency guard**: a wrist dispatch heard twice runs
  two parallel $4-cap builds of the same prompt; nothing refuses or
  coalesces.
- **No runtime backstop on a wedged build** — budget bounds spend, not
  time; a hung job runs until he notices and stops it ([24] family,
  Bash-lane variant).
- FORGE_ROOT and JOBS_DIR (receipts + proof PNGs) grow forever unless
  each job is individually discarded.

## 3. Pros — what genuinely works

- **The containment paragraph** (22-32) — the clearest security reasoning
  in the codebase, matched by the empirical boundary note. Together with
  [30], this pair defines how model tool boundaries must be built
  platform-wide.
- **Records as the status bus** — one design choice ("no new status
  plumbing was invented") bought live build progress on five surfaces.
- **Proof-not-claim** — the only agent that photographs its own work
  before reporting it.
- **Cost visibility as policy** — measured baseline in a comment, actual
  spend on every announcement, the cap's history documented.
- **Race-and-deployment scar tissue everywhere**: five distinct DO-NOT
  lessons encoded at their sites.

## 4. Cons and gaps (ranked by real-life cost)

1. **Full-screen proof capture + indefinite PNG retention** — a privacy
   hole in an otherwise disposable pipeline.
2. **No duplicate-dispatch guard** — the double-heard wrist command is
   the realistic failure, and it costs real dollars.
3. **No wall-clock backstop** on builds.
4. **Unbounded artifact/receipt growth** (the [26] phantom-pruner
   cousin, here with no pruner claimed).

## 5. Mission test

**On-demand: earns its keep as reach** — "starting real work did not
[work hands-free]" was the gap; now a sentence from his wrist produces a
running artifact with proof and a receipt. Its mission value is the
capability existing at all, priced honestly. **Daily/weekly: n/a by
cadence** — usage-driven. The trust story (pending + disposable + never
vault) is what lets a Bash-wielding agent exist inside doctrine at all.

## 6. Improvement plan (ranked; uncapped)

1. **[Refine] Scoped proof + proof hygiene.**
   - **Proposal:** capture the Chrome window only (`screencapture -l`
     with the window id via AppleScript lookup; fall back to the current
     behavior WITH the receipt noting "full-screen capture" honestly);
     delete the proof PNG when the job's artifacts are discarded; include
     PNGs in the retention sweep (plan 4).
   - **Doctrine:** rule 4; the proof stays, the bystander pixels go.
   - **Impact/effort:** M-H / M-L.
   - **Verification:** scratch build with a second window open; inspect
     the capture.
2. **[Refine] Duplicate + concurrency guard.**
   - **Proposal:** refuse a start when a job with the same normalized
     prompt is already running ("that build is already going — say stop
     first if you want a fresh one"), and cap concurrent builds at 2 with
     an honest refusal naming the running jobs.
   - **Doctrine:** rules 4, 5. **Impact/effort:** M / L.
   - **Verification:** double-dispatch test on scratch.
3. **[Refine] Wall-clock backstop** — a generous timer (~25 min) that
   SIGTERMs into the existing stopped path with reason "timed out";
   rides the same live-object mechanism stopForge uses.
   **Impact/effort:** M-L / L.
4. **[Refine] Retention sweep** — keep the last ~20 job receipts/PNGs
   and artifacts younger than ~30 days (discarded ones already delete);
   boot-time prune beside the platform's other pruners.
   **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: record cards on every surface, Telegram
announcements, the proof image. Screened against dashboard drift:

- **None new** — this lane already has the fleet's best outcome UI
  (live status, proof image, cost line). Plan 1's honest "full-screen
  capture" note is the only copy change.

## 8. Verdict

**Keep as-is / Refine** — the platform's most dangerous capability,
shipped with its clearest thinking; four operational edges to close, none
architectural. Highest-value next action: **scoped proof capture** (plan
item 1) — the one place this lane can currently leak something that isn't
its business.
