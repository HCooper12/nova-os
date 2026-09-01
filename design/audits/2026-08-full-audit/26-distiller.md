# 26 — Distiller

Audited 2026-08-31. Read-only. Files opened: `server/lib/distill.js` (full,
253 lines), `server/lib/modelChoice.js` raiseWeeklyModelChoice (67-92 —
weekly dedupe verified); stageVault/diffTrees (ingest.js) [Inferred from
usage — the Watcher's staging rails, to be read at item 33]. The
distill-apply/undo inbox routes ride the job functions here. Tests: distill
appears in lens/modelChoice test greps; no dedicated distill.test.js found.
Deferrals: Telegram approve buttons (66), the Watcher's shared staging
internals (33).

## 1. What it is (verified)

Captures become knowledge (14-27): weekly, a staged copy of the vault is
handed to a model that weaves unlinked capture pages into the graph per the
vault's own CLAUDE.md — links only where real, nothing deleted, nothing
invented, leave-alone-with-honesty — and the resulting diff persists as a
job on disk with a pending record carrying it to his gate.

- **Candidates** (39-61): pages under Wiki/Inbox + Studio/Ideas with no
  `[[wikilink]]` and ≥40 chars, capped at 8.
- **The staged pass** (100-186): stageVault copy; the model gets
  Write/Edit — but only inside the staging dir; `diffTrees` computes the
  changes, and each is stamped with the EXACT prior content it was
  computed against (150-159). No changes → honest skip ("the model found
  nothing worth linking"). Budget $3 (the fleet's largest, gated), pinned
  model or the gate's per-run answer, staging cleaned in a finally.
- **The cross-source tension pass** (77): where two sources genuinely
  disagree, one honest sentence on EACH page naming the tension — "a
  graph that only agrees is a scrapbook."
- **Apply** (190-213): DRIFT REFUSAL first, across every file, before any
  write — a live file that moved since the diff refuses honestly instead
  of clobbering; then backup-first writes. **Undo** (215-228): priors
  restored verbatim, created files removed, job status tracked.
- **The weekly trigger** (235-253): Saturdays ≥17:00 raises a
  MODEL-CHOICE card instead of running — "nobody is at the keyboard when
  a weekly cron fires to answer a spoken question, so the run waits for a
  tap." The card dedupes weekly (modelChoice.js:72-74). `mode:
  'review-all'` — vault-wide edits are ALWAYS his call.

## 2. Current workflow, traced

Saturday 17:30: the model-choice card raises ("Pick a model — the weekly
distillation"). He taps Opus → runDistillation stages the vault → the
model links six orphan captures, leaves two alone with reasons, records
one cross-source tension → diff of 9 files, each with its prior → job
persisted, pending record "Distill 8 captures into the graph (9 files
touched)" → approve → drift check across all 9 → backup-first writes →
applied. A regretted apply restores every prior verbatim.

Failure modes, as they degrade today:
- Vault moved since the diff → apply refuses naming the file, "discard
  and rerun". **The platform's best concurrent-write honesty.**
- Model finds nothing → skip with the reason. **Honest.**
- Lane off / already ran → skips with reasons. **Honest.**
- Staging always cleaned (finally). **Honest.**
- **The candidate cap starves alphabetically** (60): the comment says
  "oldest first" but the sort is `relPath.localeCompare` — alphabetical.
  With >8 persistent orphans, late-alphabet captures can starve
  indefinitely, and the cap is silent about what it left out. **Comment
  and code disagree; silent cap.**
- **Left-alone pages re-candidate forever**: a page the model honestly
  declined to link (still no `[[`) re-enters every week's batch — re-read,
  re-processed, re-declined, at $3 a week. **No leave-alone memory.**
- **Mid-apply failure leaves a torn state with no path** (204-209): drift
  checks all files first (which prevents the common cause), but a write
  failing at file 5 of 9 leaves the job 'ready' with half the changes
  live — re-apply then hits drift refusal on the already-written files.
  The priors to roll back are all in the job; nothing uses them for this.
- **Slept-through Saturday → no card until next Saturday** ([12] class,
  6th site; the weekly dedupe makes widening free).
- **Job files are never pruned** — jobsDir grows forever, while the
  apply-time error message speculates about a pruner ("the server may
  have pruned it") that does not exist.

## 3. Pros — what genuinely works

- **The staged-vault pass is a fleet-class rail** — the model writes
  freely in a sandbox; code diffs, stamps priors, and applies
  deterministically behind drift refusal. Name it: *the staged pass* —
  it is how any future vault-wide model edit should work.
- **Drift refusal checks everything before writing anything** — the
  all-then-write ordering item 01's applyOps lacks; the two should
  converge on this shape.
- **The cross-source tension instruction** is the most intellectually
  serious line in the fleet's prompts — disagreement as the most valuable
  link.
- **The model-choice card as cron gate** — cost control that respects
  both his wallet and the reality that cron fires into an empty room.
- **Leave-alone-with-honesty in the prompt** ("honesty beats busywork").

## 4. Cons and gaps (ranked by real-life cost)

1. **Left-alone pages re-candidate weekly** — recurring spend and model
   attention on pages already honestly declined; the one place this
   $3 lane wastes money by design.
2. **Alphabetical starvation under the cap** — with the comment claiming
   the opposite; and nothing says "8 of 19 orphans this pass".
3. **Torn mid-apply state** — rarer than applyOps's (drift-first helps)
   but with no recovery path despite priors sitting in the job.
4. **Slept Saturday costs the week** ([12]).
5. **Phantom pruner** — unbounded job files + an error message describing
   behavior that doesn't exist.
6. **No dedicated test file** for candidate selection, drift refusal, or
   apply/undo — the platform's most powerful write path is its least
   pinned ([11] list).

## 5. Mission test

**Weekly: earns its keep** — orphan captures joining the graph is exactly
how the second brain compounds instead of accumulating, and the tension
pass makes the graph argue rather than agree. **Monthly/long-term: the
core value** — this is the knowledge-compounding engine; its wastes (con
1-2) are weekly leaks from a long-term asset. **Daily: n/a by design.**

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2, 3, 4, 5, 6 REFINE — the architecture is the best in
its class; the leaks are operational.

1. **[Refine] Leave-alone memory.**
   - **Proposal:** the job already stores the candidate list and summary;
     record per-candidate outcomes (linked / left-alone) in the job, and
     findCandidates skips left-alone pages for N weeks (say 4) — they
     re-enter when the vault around them has grown. State derives from
     existing job files; no new store.
   - **Doctrine:** rules 1, 7; the [13] cooldown pattern.
   - **Impact/effort:** M-H / M-L.
   - **Verification:** unit tests on the skip; a live findCandidates
     against the real vault before/after.
2. **[Refine] Honest, age-true candidate ordering.**
   - **Proposal:** sort by file mtime (oldest first, as the comment
     already claims), and when the cap bites, say so in the record's
     reason ("8 of 19 orphans this pass — the rest queue for next week").
   - **Doctrine:** rule 4 (silent cap); §4 comment-code agreement.
   - **Impact/effort:** M / L.
3. **[Refine] Roll back on mid-apply failure.**
   - **Proposal:** wrap the write loop; on failure restore the priors of
     files already written (they're in the job), leave status 'ready',
     and error honestly — the applyOps convergence fix ([01] plan 2's
     twin; build the shared shape once).
   - **Doctrine:** rule 2. **Impact/effort:** M / L-M.
4. **[Refine] Widen the trigger window** (Sat-Sun ≥17; weekly dedupe
   already guards). **Impact/effort:** L-M / L.
5. **[Refine] Real job pruning** — keep the last ~12 job files, prune at
   boot beside the note-summary pruner; the error message becomes true.
   **Impact/effort:** L / L.
6. **[Refine] A test file** — candidate selection (cap, skip-list,
   left-alone memory), drift refusal branches, apply/undo round-trip on a
   scratch tree. **Impact/effort:** M / M-L.

## 7. UI recommendations

Where output lands: the model-choice card, the distill pending record
(+ Telegram buttons), the vault itself. Screened against dashboard drift:

- **The cap disclosure rides the record reason** (plan 2) — what changes:
  he knows the backlog exists and can force a second pass if he cares.
- Nothing else — the gate card and diff record are the right surfaces;
  a diff-viewer UI was considered and rejected (the summary + paths list
  is what approval needs; full diffs belong in the vault's own history).

## 8. Verdict

**Keep as-is / Refine** — the platform's most powerful write path and its
best-designed one (staged pass + drift refusal + full undo); its findings
are operational leaks around a sound core. Highest-value next action:
**leave-alone memory** (plan item 1) — it stops the one recurring waste
in a lane whose entire cost model is one careful weekly pass.
