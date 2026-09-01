# 14 — Week Plan (the Commander's Sunday routine)

Audited 2026-08-30. Read-only. Files opened: `server/lib/weekPlan.js` (full,
151 lines), `server/lib/inbox.js` plan-note route (backup + prior-restoring
undo, verified), WORKOUT_RE duplication check (trainingCheck.js twin,
verified), TIME_VALUE_HOURS ('week-plan': 8d, verified at earlier items),
learning/push/fleet/guardian/openLoops greps. **No test file exists**
(verified) — including for `dayConflicts`, which the morning brief also
consumes (dispatch.js:232). Deferrals: weekly debrief relationship (item
15), Notes/vault rendering of the plan page (51).

## 1. What it is (verified)

The deterministic week-ahead draft: Sundays from 16:00 — deliberately
before the 17:00 Weekly Review so the review can be read against a drafted
plan (weekPlan.js:136-137) — code composes `Wiki/Plans/Week of <Monday>.md`:
per-day training from the schedule (active rest named honestly), calendar
anchors with first→last events and heavy-day marking (≥5), carry-overs
placed on their due days with overdue debt pulled into Monday,
workout-vs-event conflicts per day, and a week-shape summary line
(trainingDays, protein floor, outstanding carry-overs) with a
"conflicts to resolve — ask Nova on Home" pointer (39-106). No model
anywhere. Filed as a draft record (kind `week-plan`, route `plan-note`);
approval writes the vault note with frontmatter, **backing up any existing
file and carrying the prior content in the undo** (inbox.js plan-note —
the snapshot-first pattern done exactly right). Per-week guard keyed by the
Monday's relPath; 8-day time-value expiry; hourly tick with the `>=` hour
lesson and heartbeat.

## 2. Current workflow, traced

Sunday 16:00: composeWeekPlan builds next week — Push on Monday with
Thursday's missed pulldowns OVERDUE into it, Wednesday marked heavy (6
events), Friday's "Gym 17:30" overlapping "Dinner 18:00" flagged with the
move pointer → pending record: "The week ahead, drafted: 4 training days,
1 conflict flagged. Approve to save it into Wiki/Plans/ — editable in
Obsidian like everything else." → approve → the note lands in the vault,
his to edit; an hour later the Weekly Review composes with the plan already
drafted.

Failure modes, as they degrade today:
- Calendar fetch fails → empty events, plan still drafts with "clear"
  days — **silent degradation**: a CalDAV outage renders as a beautifully
  clear week (45: `.catch(() => [])`), the couldn't-check-vs-clean
  conflation's fifth site, here painting a whole week.
- Carry-overs/profile fail → optional, absent. **Mitigated.**
- Existing plan file at approval → backed up, undo restores prior.
  **Honest — the best undo in the write paths audited so far.**
- **Slept-through Sunday → no week plan** (144: `day === 0 && hour >= 16`)
  — the [12] missed-window class, second confirmed site; the per-week
  guard makes a Monday catch-up free.
- **A discarded draft blocks re-drafting all week** (108-111:
  `planExistsForWeek` counts every record regardless of status) — "bad
  draft, try again" requires knowing about force.
- Filed plan vs changing week → the note is a Sunday snapshot, never
  updated; day-of truth lives in the morning brief's conflict check (the
  same `dayConflicts`), which is the right division — but nothing at
  week's end ever scores the plan against what happened. Flagged to item
  15: does the Weekly Debrief read the filed plan?

## 3. Pros — what genuinely works

- **Vault-as-truth done properly** (rule 3): the plan is a markdown page
  he owns and edits, not app state — and the approval write is the
  cleanest one-way-door avoidance in the audit so far (backup + prior in
  undo).
- **One conflict detector, two consumers** — dayConflicts serves the
  Sunday plan and the morning brief from one implementation (rule 7 where
  it counts).
- **Overdue-into-Monday carry-over placement** (75, 80) — recorded
  training debt doesn't just appear, it lands on the first day it could
  be cleared.
- **The Sunday sequencing comment** (plan before review) — deliberate
  artefact ordering, documented.
- **Heavy-day marking and the move pointer** connect the plan to the
  calendar-command rail instead of leaving conflicts as trivia.

## 4. Cons and gaps (ranked by real-life cost)

1. **A calendar outage paints a clear week** (45) — the plan's most
   load-bearing input fails to silence, and the filed artefact then
   *asserts* clear days for seven days. Worst instance yet of the [03]
   conflation because the output persists in the vault.
2. **Slept-through Sunday costs the week's plan** — [12] class, free fix.
3. **Nothing scores the plan.** The week ends and the drafted shape
   (training days, conflicts, carry-over clearance) is never reconciled
   against reality by anything — the plan/review mutual-blindness pattern
   (06) at week scale. Ownership decided at item 15.
4. **`WORKOUT_RE` is a duplicated, unpinned twin** with trainingCheck —
   and item 07 already plans to tighten it; changing one without the
   other splits "what counts as a workout" across the platform. Rule 7.
5. **A discarded draft can't be re-drafted without force** (108-111).
6. **No tests** — including for shared, arithmetic-bearing dayConflicts
   and the nextMonday date math ([11] untested-lane list grows).
7. **The plan places training and events but not deadline-carrying
   to-dos** — the week's shape omits the week's obligations. Gated on
   whether to-dos actually carry due dates (Todoist sync suggests yes,
   [Assumed] — verify first).

## 5. Mission test

**Weekly: earns its keep** — the week gets a deliberate shape before it
starts, conflicts surface while they're still movable, and training debt
gets placed rather than remembered. **Monthly/long-term: quietly
valuable** — Wiki/Plans accumulates as a browsable record of intended
weeks, a real vault asset. **Daily: n/a by design** (the morning brief
owns day-of truth with the same detector). The mission gap is the missing
week-end reconciliation (con 3) — a plan that is never scored can't teach
the next one.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2, 4, 5, 6 REFINE; 7 gated ADD; 3 is flagged to item 15.

1. **[Refine] Honest calendar-failure line.**
   - **Proposal:** distinguish fetch-failure from genuinely-empty: on
     catch, the plan says "**Calendar: couldn't be read when this was
     drafted** — day-of briefs will carry the truth" once at the top, and
     per-day lines say "unknown" not "clear". The record's reason carries
     the same flag so he knows before approving.
   - **Doctrine:** rule 4; [03] family. **Impact/effort:** H / L.
   - **Verification:** unit test with a throwing fetch; compose on scratch.
2. **[Refine] Sunday→Monday catch-up window** (`day===0 && h>=16` or
   `day===1 && h<12`); the per-week guard already dedupes.
   **Impact/effort:** M / L.
3. **[Flagged → item 15] Week-end reconciliation** — the debrief should
   read the filed plan (trainingDays vs sessions logged, conflicts vs
   moves made, carry-overs vs cleared). Decide ownership there; don't
   build twice.
4. **[Refine] Extract shared WORKOUT_RE** into one module imported by
   weekPlan + trainingCheck, so item 07's real-calendar tightening lands
   once. **Impact/effort:** M / L.
5. **[Refine] Discarded drafts don't block** — planExistsForWeek filters
   `status !== 'discarded'`, so a rejected draft can be re-run plainly.
   **Impact/effort:** L-M / L.
6. **[Refine] Tests** — dayConflicts (shared consumer), nextMonday
   boundary cases (Sunday→next Monday, DST), a compose snapshot with
   fixtures. **Impact/effort:** M / L-M.
7. **[Add, gated] Deadline to-dos on their days.**
   - **Proposal:** GATED on a real-data read of the to-do store: if items
     carry due dates, place them on their days ("- **Due:** finish the
     deck") and count them in the week shape. If they don't, skip
     honestly.
   - **Doctrine:** rules 1, 4; confident-guess gate.
   - **Impact/effort:** M / M.

## 7. UI recommendations

Where output lands: the Inbox card (approve → vault note), the note itself
in Obsidian/Notes, push. Screened against dashboard drift:

- **The calendar-failure flag must reach the card's reason line** (with
  plan 1) — what changes: he doesn't approve a week drawn on a blank
  calendar.
- **Conflict count is already in the reason** — no change.
- Nothing else: the artefact is a vault note by design, and its editing
  surface is Obsidian — decorating the app around it would fight the
  rule-3 shape that makes it good.

## 8. Verdict

**Keep as-is / Refine** — the right artefact in the right place (a vault
note he owns), with the audit's best write-undo — undermined mainly by one
silent input failure that persists into the vault. Highest-value next
action: **the honest calendar-failure line** (plan item 1) — a filed plan
must never assert a clear week it couldn't see.
