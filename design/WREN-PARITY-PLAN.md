# Wren = Nova: the parity plan (1 Nov 2026)

His standing rule, 1 Nov 2026: "Wren should always be able to act and perform
with the same effectiveness as Nova. The only difference is that Wren is
performing as a CEO and partner that focuses on the Science Atlas project and
its Mission Control with everything that it does."

Source: a read-only audit of both repos the same day (nova-os, and
~/Projects/atlas-partner, which is Wren). Claims marked (checked) were
re-read in the code before this was written; the rest are the audit's
reading of the code and should be re-checked before building.

## Already ported (1 Nov)

- Spoken turn budget, question last, "go on" from code, the unheard-rest
  line, muted-mic reopen, empty clip said plainly: atlas-partner f2cadc1.
  Proven on the live Wren server; the browser speaker is not yet seen on
  his phone.

## Ported the same evening (1 Nov, atlas-partner f751846..00cf5ad)

- Gap 1 (listening): turnSense hold extension, blind-meter clip reads,
  frozen-page time, the warm microphone. Gap 5: quiet hours (22:00-07:00,
  needs-you/needs-fix/stopped/never-started pass; no setting yet, only
  ~/.atlas/wren/quiet-hours.json). The interruption contract (lib/
  interruptTurn.mjs, same note as Nova's src/interruptTurn.js). The ear
  while Wren speaks (lib/bargeIn.mjs, lib/bargeListen.mjs). The boundary
  wording. None of it seen on his phone; receipts (`barge`, micReused,
  `interrupted`) are the proof to read.

## Deliberate differences (not gaps)

- Wren never marks a Science Atlas node done; green is his tap alone.
- Wren's conversation lanes write nothing. Its Builder lane does edit the
  Science Atlas repo after his "go" (it stages, never commits). Its docs say
  "never writes the repo": the wording needs his call (below).
- Native shell, widgets, offline outbox: Wren is served from the Mac and is
  used at a desk; low value.

## The gaps, in the order to close them

| # | Gap | Nova has | Wren today | Size |
|---|-----|----------|-----------|------|
| ~~1~~ | DONE 1 Nov · Listening reliability: a sentence ending on "and"/"the" holds the turn; speech after send joins it; "no, I said" corrects; a blind meter reads the clip for words; frozen-page time is not a timeout; warm mic in a conversation | src/turnSense.js, src/listenRules.js, src/warmMic.js (23842fb8, a8622d43, 40e49fd9) | a blind meter waits for his tap; a fresh mic every turn; no correction path | M |
| 2 | Safe restart: a reload that waits for running work | scripts/reload-server.mjs, jobRegistry.js | README documents the raw `kickstart -k` (checked); builds are child processes of the server (no `detached`, checked), so a restart kills them | S |
| 3 | Mission Control's live state in every answer: what is running, waiting on him, failed overnight; reflexes that answer those for free | fleetContext.js, orgContext.js, reflex.js | only Briefing mode sees notices; six reflexes | S-M |
| 4 | The conversation survives a reload and a device change | conversationLog.js (append-only, ids, read back) | per-day transcript; the dock does not reload past turns (checked); "go on" state is in memory only | M |
| ~~5~~ | DONE 1 Nov · Quiet hours and a push policy | quietHours.js, notifyPolicy.js | push.mjs has no quiet logic (checked); work-state pushes at any hour | S |
| 6 | Documents he can open (weekly status, plan check, ideas report) | artifacts.js, artifactBlocks.js, the stage card (22a4debf) | none | M |
| 7 | Undo for Wren's own writes (memory rules, profile, Notion saves) | inbox rails, undoData | receipts.log only | M |
| 8 | Alert tiers and act-rate receipts | alerts.js | client-side alerts only | M |
| 9 | Local model for cheap lanes (classify, Delegator) | localModel.js, askRoute.js | every turn is a Claude spawn | L, last |
| 10 | Agents consulting each other | consult.js | one mind with lanes | L, defer |

Also, small and first: "walk me through" in an Advisor turn gets Wren's
60-word budget; Nova lengthens it by his words (src/turnFold.js DEPTH_RE).
The Wren speaker needs the same signal, so the server must send the budget
with the `mode` event and voice.js must read it (touches dock.js).

## What Wren does better, worth bringing to Nova

- One list of everything started, each with one proof of its state
  (atlas-partner lib/work.mjs).
- Background failures surfaced first, with no model (lib/preflight.mjs,
  lib/failures.mjs); compare with Nova's guardian.js.
- Every build routed through a spec and a job page (lib/spec.mjs,
  lib/jobs.mjs); Nova's Builder has no equivalent.
- Claude Code session control (launch, control, repair, work) is ahead of
  Nova's Code screen.

## Housekeeping in Wren

Stray copies tracked in git: lib/models.mjs.before-2026-09-20,
lib/spawnBoundary.mjs.before-2026-09-20, tests/dock.test.mjs.before-2026-09-20,
partner.out; untracked: "server 2.mjs", config.mjs.before-…, README.md.before-….

## His decisions (1 Nov 2026, same day)

1. "Wren never writes the repo" covers its conversation lanes only; builds
   edit the Science Atlas repo on his go (stage, never commit). The docs are
   reworded to say so. ("Okay.")
2. Wren's pushes respect quiet hours; anything that needs him always gets
   through. ("Sure.")
3. Proceed with the plan from gap 1, pushing Wren's commits as they land.
   And a rule for both, now a standing memory (interruption-semantics):
   he can cut in mid-sentence; the AI takes in what he said, then finishes
   what still stands or retracts plainly; nothing unsaid is lost.

## Order

1, 2, 3 and the depth fix; then 5, 4, 6; then 7, 8; 9 and 10 only when a
real need shows. Every Nova fix to talking, listening or acting from here on
is ported to Wren in the same session, or named here as owed.
