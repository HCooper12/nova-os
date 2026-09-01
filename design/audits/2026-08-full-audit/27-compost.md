# 27 — Compost

Audited 2026-08-31. Read-only. Files opened: `server/lib/compost.js` (full,
313 lines); consumers verified at earlier items: the loops card + >7d nudge
(valsInbox, item 23), guardian's cadence watch, todoLine lock (shared).
No dedicated compost.test.js found ([11] list). Carries and PARTIALLY
resolves item 25's stalled-idea flag. Deferrals: Inbox compost section UI
(48), Galaxy orphan rendering (60).

## 1. What it is (verified)

The weekly hygiene loop — read-only scan, proposals never actions (11-14):

- **Four pure-code detectors**: sweepable checked to-dos (one batch
  proposal, 162-175); stale captures ≥14d in Wiki/Inbox (104-132); stale
  idea SEEDS ≥30d ("archive it, or open it and move it along", 70-102);
  graph orphans — knowledge-type pages only, with Nova's own state pages
  excluded by design and Inbox/Ideas excluded because they have their own
  lifecycles (134-160), capped at 8.
- **Accepting runs deterministic code + files a receipt** (218-285):
  archive moves with collision-suffixing and `note-move` undo; the to-do
  sweep takes the SAME write lock as every other writer of that page
  (todoLine, rule 7), backs up first, and refuses honestly when the lines
  changed since the scan ("re-run the loop"). Orphan proposals are
  informational — accept refuses: "open it or dismiss it".
- **State** (26-66): single-flight load + atomic persist (the Breaker's
  inboxStore hardening, credited); a corrupt store regenerates from a
  re-scan — the right call for derived state, documented. Dismissals go
  to `dismissedKeys`, capped at the last 200.
- **Scheduler** (287-307): daily tick, runs when the last scan is >7 days
  old — **age-based, so a slept Mac just runs the next day**: the one
  weekly lane immune to the [12] slept-day class.

## 2. Current workflow, traced

Sunday's tick finds the last run 8 days old → scan → 3 checked to-dos
(one sweep proposal), a capture from 3 weeks ago, an idea seed from July,
2 orphan concepts → proposals in the Inbox's compost section. He accepts
the sweep → todo lock → backup → lines removed → receipt with
todo-restore undo. He dismisses the seed → its key joins dismissedKeys.
After a week untouched, the client nudge says proposals are waiting.

Failure modes, as they degrade today:
- Torn store → regenerates from scan. **Honest by design.**
- To-do lines changed since scan → refused with the reason. **Honest** —
  the drift-refusal instinct, in miniature.
- Note vanished before archive → honest error.
- **Dismissals are a permanent no… until they randomly aren't** (210):
  the 200-key slice means old dismissals silently expire by displacement
  — neither a durable no ([13]'s pole) nor a principled cooldown; when a
  dismissed item re-proposes depends on how much else he has dismissed
  since. **Arbitrary memory.**
- **Mid-pipeline ideas rot invisibly** (89: `status !== 'seed'` skips
  them) — item 25's flag confirmed: an idea moved to `outlining` and
  abandoned is watched by nothing.
- **Compost can archive what the Distiller hasn't woven yet**: stale
  captures (14d) and distill candidates (unlinked) are the same
  population; with the Distiller's cap of 8 and alphabetical starvation
  ([26]), an orphan past position 8 can hit 14 days and get an
  archive proposal before distillation ever reads it. **Two loops, one
  population, no coordination.**
- Orphan cap 8 with no "of N" — silent cap, small.

## 3. Pros — what genuinely works

- **The age-based weekly scheduler** — name it as the fix shape for the
  whole [12] class: "run when older than the cadence" beats "run on the
  day" everywhere a weekly guard already exists.
- **Proposals-never-actions with receipts** — hygiene as suggestion,
  mutation as deterministic accepted code with undo, receipts in the one
  history. Doctrine rules 1/2/6 in a housekeeping loop.
- **The shared to-do write lock + changed-lines refusal** — the contract
  discipline (rule 7) applied where three writers meet, with drift
  honesty on top.
- **Orphan detection knows what an orphan isn't** (143-152) — state
  pages, captures, and seeds each excluded with the reason written down.
- **Corrupt-state-regenerates** — exactly right for derived data, and
  said so.

## 4. Cons and gaps (ranked by real-life cost)

1. **Compost/Distiller population conflict** — the hygiene loop can
   propose archiving knowledge the weaving loop was built to save;
   nothing sequences them. Mission axis: captures are the raw material of
   the second brain, and the two agents disagree about their fate on
   timing alone.
2. **Arbitrary dismissal memory** — displacement-based expiry makes the
   no neither durable nor principled.
3. **Mid-pipeline idea rot** (25's flag) — seeds are guarded; outlining/
   scripting are not.
4. **Silent orphan cap.**
5. **No test file** — four detectors, an undo round-trip, and a drift
   refusal, all unpinned.

## 5. Mission test

**Weekly: earns its keep** — checked to-dos get swept, rot gets named,
and the vault stays a garden instead of a landfill; the calm
proposals-only posture is right for hygiene. **Monthly/long-term:** vault
health is compounding-knowledge health; con 1 is the real mission risk
(archiving unwoven knowledge is anti-compounding). **Daily: n/a by
design.**

## 6. Improvement plan (ranked; uncapped)

Change types: all REFINE (2 resolves 25's flag).

1. **[Refine] Sequence Compost behind the Distiller.**
   - **Proposal:** the stale-capture detector skips pages that are
     current distill candidates and pages not yet through a distill pass
     — readable from [26] plan 1's leave-alone memory once it lands (a
     page distill has SEEN and left alone is honest compost material; one
     it hasn't read yet is not). Until then, the cheap version: stale
     threshold for unlinked captures ≥ 2 distill cycles (28d).
   - **Doctrine:** rules 1, 7 (reads the sibling's state, no new store);
     the two loops stop disagreeing about one population.
   - **Impact/effort:** M-H / M-L.
   - **Verification:** unit test with a candidate fixture; live scan
     against the real vault comparing proposal sets.
2. **[Refine] Guard the whole idea pipeline.**
   - **Proposal:** extend detectStaleSeeds to `outlining`/`scripting` at
     a longer threshold (~45d), with status-aware wording ("stalled in
     outlining since…"). Resolves 25's flag.
   - **Impact/effort:** M / L.
3. **[Refine] Principled dismissal memory.**
   - **Proposal:** replace the 200-slice with per-key dismissal dates and
     a 90-day cooldown (the [13]/[17] material-change design's simple
     form); a re-proposal names the history ("you passed on this in
     June").
   - **Impact/effort:** M / L-M.
4. **[Refine] Honest orphan cap** — "8 of 23 islands shown".
   **Impact/effort:** L / L.
5. **[Refine] A test file** — detectors with fixtures, accept/undo
   round-trips, the changed-lines refusal. **Impact/effort:** M-L / M-L.

## 7. UI recommendations

Where output lands: the Inbox compost section + the >7d nudge; receipts
in history. Screened against dashboard drift:

- **None** — the proposal cards with accept/dismiss are the right size;
  the orphan-count honesty (plan 4) rides existing text. Galaxy-side
  orphan visualisation is item 60's question.

## 8. Verdict

**Keep as-is / Refine** — a calm, well-built hygiene loop whose one real
flaw is disagreeing with its sibling about the fate of unwoven knowledge.
Highest-value next action: **sequence Compost behind the Distiller**
(plan item 1) — hygiene should never outrun weaving.
