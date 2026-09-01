# 43 — Overnight

Audited 2026-08-31. Read-only. Files opened: `server/lib/overnight.js`
(full, 217 lines); entry points verified earlier: the "queue it for
tonight" RESEARCH path (04), Studio outline queuing (25), the morning
dispatch line (05). shouldRunNow pure/testable; runner injectable.
Deferrals: the queue UI (48/57).

## 1. What it is (verified)

Work he hands Nova during the day that runs while he sleeps (8-13): each
item becomes a REAL agent job — the Researcher or a Studio outline — "with
its citation-required, review-gated rails untouched; **the queue only
decides WHEN**... autonomy stays his." Results are pending records by
morning; "the human gate stays the only checkpoint."

- **Honest caps**: 8 queued ("each is a real overnight run"),
  duplicate-question refusal, can't-remove-a-running-item honesty,
  7-day history pruning built in.
- **The window** (03:30-06:30) documents its deployment reality: "the
  Mac's scheduled wake (05:55) catches the tail even if it slept through
  the start; **a missed night just leaves items queued for the next
  one**" — the [12] class handled gracefully by design. The day-guard
  persists in the store (restart-proof), and **a forced daytime run does
  NOT consume tonight's natural window** (137-144) — a subtle correctness
  choice made deliberately.
- **The runner** (131-178): sequential, one model at a time; each item
  marked running → the agent job creates its own classifying record →
  polled with an **8-minute per-item timeout carrying an honest message**
  ("check the Inbox; it may still land") — notably, the one lane in the
  fleet that already HAS the [24] watchdog; name it the donor shape for
  the shared helper.
- **The morning line** (181-199): what landed ("2 research briefs landed
  for review: …") and what failed, in the brief.

## 2. Current workflow, traced

"Queue it for tonight" in conversation → enqueued (dupe-checked, capped)
→ 03:40 tick: the queue runs both items sequentially; the first lands
pending in 3 minutes; the second times out at 8 → marked error → morning
brief: "**Overnight.** 1 research brief landed for review: …. 1 run
failed — still queued thinking, not lost: …".

Failure modes:
- Mac asleep all window → items wait for tomorrow, said in the design.
  **Honest.**
- Duplicate/full queue → refused with reasons. **Honest.**
- Item timeout → honest maybe-still-lands message. **Honest.**
- **Failed items never run again — while the morning line says they
  will**: only `status === 'queued'` items run; an error item is dead
  unless he manually re-queues, yet the brief's phrase is "still queued
  thinking, not lost" (197). Comment-vs-behavior class ([15]/[26]),
  verified — and compounding it, an item that timed out but whose brief
  DID land later stays counted as failed (nothing reconciles the
  recordId afterwards).

## 3. Pros — what genuinely works

- **When-not-what as the whole design** — rule 5 kept while still buying
  him overnight throughput; the gate never moves.
- **The forced-run/window interaction** handled correctly — the kind of
  edge most queues get wrong silently.
- **A real watchdog with an honest timeout message** — the [24] family's
  in-fleet donor.
- **Missed nights as a non-event** — queued items simply wait; no
  catch-up machinery needed because the design absorbs it.
- **Caps with their reasons in the error strings.**

## 4. Cons and gaps (ranked by real-life cost)

1. **The failed-item story**: no retry, a misleading morning phrase, and
   no reconciliation of late-landing briefs. One finding, three faces.

## 5. Mission test

**Daily: earns its keep** — "queue it for tonight" converts daytime
half-thoughts into reviewed briefs at dawn, at zero attention cost; the
morning line closes the loop. Correctly scoped to the two lanes whose
work benefits from deferral.

## 6. Improvement plan (ranked; uncapped — one item, three parts)

1. **[Refine] The failed-item story.**
   - **Proposal:** (a) one automatic re-queue: an errored item returns to
     `queued` with `attempts: 2` and runs once more the next night, then
     stays error with "failed twice" honesty; (b) before re-running,
     reconcile: if the item's recordId now shows pending/filed, mark it
     done instead ("landed late"); (c) reword the morning line to match
     reality ("1 run failed — it will retry tonight" / "failed twice —
     re-queue it from Ops if it still matters").
   - **Doctrine:** rule 4; the [15] comment-drift class fixed at its
     behavior end.
   - **Impact/effort:** M / L-M.
   - **Verification:** unit tests on the attempt/reconcile branches with
     the injectable runner; a scratch queue round-trip.

## 7. UI recommendations

- **None** — the queue list, brief line, and Inbox records are the right
  surfaces; plan 1c is a copy change inside an existing line.

## 8. Verdict

**Keep as-is / Refine** — a correctly-shaped deferral queue with the
fleet's best timeout manners and one three-faced honesty gap around
failure. Highest-value next action: the failed-item story, one small
commit.
