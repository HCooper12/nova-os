# 18 — Program Audit (kind `coach-audit`)

Audited 2026-08-30. Read-only. Files opened: `server/lib/coachProgramAudit.js`
(full, 272 lines); rails verified at earlier items: Monday trigger inside the
cadence window (coachCadence.js:229-239, item 01), approve-as-acknowledge
(inbox.js:1201-1204, item 03), the drawn audit card in the spoken brief
(briefDecisions.js cardFor + morningShow auditCard, item 03), manual routes
(workouts.js:97-104, item 01). Tests: coachProgramAudit.test.js exists.
Carries and resolves item 17's couldn't-look flag. Deferrals: Inbox card
rendering (48), Ops history surface (57).

## 1. What it is (verified)

The proof-that-Coach-looked: once a week (Mondays, inside the cadence
morning window, guarded by `auditedThisWeek`), every program-review detector
is held to a three-state receipt (6-35):

- **fired** — findings raised (they ride the rails individually; the audit
  never duplicates them),
- **clear** — ran and found nothing, WITH the number that makes it clear
  ("peak was 18 hard sets against a ceiling of 22 — 4 sets of headroom",
  81),
- **not-yet** — cannot answer yet, with the real gap ("needs 16 weeks of
  history, you have 5.4", 110-112).

Each check declares its needs BEFORE running via a `gate` (53-56);
measurements are computed once and shared "so the audit can never disagree
with itself about what the week contained" (140-156); pain and form
collapse into one from-his-side check (160-162). The summary speaks all
three states in one breath because "naming only the problems is what makes
an assistant feel like it is inventing work" (192-207). Receipts: one per
week, re-runs replace, 26 weeks kept, NOVA_DATA_DIR honoured (37-40,
220-227); one Inbox record per week as the receipt-that-the-sweep-happened,
with the verbatim-record lesson documented from a real live failure
(251-253). The module's founding measurement — all three silent detectors
proven honest against his real 2026-08-25 log — is written into the header
(16-30).

## 2. Current workflow, traced

Monday 07:30: cadence checks `getDay() === 1 && !auditedThisWeek()` →
runWeeklyAudit → reviewProgram's findings + the shared measurements → nine
checks resolve (say: 1 fired, 6 clear, 2 not-yet) → receipt appended to the
26-week log → one pending Inbox record: "Coach: I ran 9 checks over your
program this week; 1 needs a decision: a lift flat for three weeks or more;
6 came back clean; 2 can't be answered yet (…)". The morning brief draws it
as a card; approving acknowledges — nothing writes.

Failure modes, as they degrade today:
- Detector honestly silent → `clear` with its number. **The platform's
  best honest-negative design.**
- Data genuinely young → `not-yet` with the gap. **Honest.**
- Re-run same week → receipt replaces, no stacking. **Honest.**
- **A source read fails → it wears the young-data costume**: goals/volume/
  routines load with `.catch(() => [] | null)` (134-137), so a broken
  weeklyMuscleVolume read makes junk/under-volume gates report "needs 2
  logged weeks, you have 0" — a failure indistinguishable from an early
  log. The module built to separate "checked and clean" from "quietly
  broken" has no state for "couldn't look", violating its own founding
  rule at the I/O layer (16-17). **Verified; item 17's flag lands here.**
- **Slept-through Monday → no audit until next Monday** — the cadence's
  day-equality gate ([12] class, third confirmed site) even though
  `auditedThisWeek` makes any-day catch-up free.
- Unacknowledged audit records accumulate: `coach-audit` has no
  TIME_VALUE_HOURS entry (verified against the list), so last week's
  receipt sits pending beside this week's forever.

## 3. Pros — what genuinely works

- **This module IS the cross-cutting [03] fix, designed before the audit
  named it** — the three-state receipt with numbers-in-the-clear-line is
  what fuelCross, trainingCheck, and weekPlan should each grow toward.
  Name it as the rail: *the three-state receipt*.
- **Gates that declare needs with real gaps** — "not-yet" as a first-class
  state that tells him exactly what to keep logging ("needs 100 RPE-rated
  sets, you have 61") converts silence into instruction.
- **Headroom-as-reassurance** (81) — the clean line quantifies the margin,
  not just the verdict.
- **One receipt, findings separate** — the audit never re-raises what the
  review already raised; two modules, no duplication, roles documented in
  both headers.
- **Documented honest-negative measurements** in the header — the standing
  memory rule (detectors on real data first) executed and archived where
  the next maintainer will read it.

## 4. Cons and gaps (ranked by real-life cost)

1. **No "couldn't look" state** — source failures masquerade as young data
   (134-137 vs the founding rule at 16-17). The one dishonesty the module
   exists to prevent, present in its own plumbing.
2. **Monday-equality gate with free catch-up unused** ([12] third site).
3. **26 weeks of receipts, zero longitudinal reading** — headroom shrinking
   4→2→1 across weeks is invisible; each receipt is compared to nothing
   ([03] thrown-away-signal family, in the module best placed to fix it).
4. **Stale audit records never expire** — missing TIME_VALUE entry.
5. **`mondayOf` re-implemented again** (44-49) — third copy (dispatch,
   weeklyDebrief), while trainingAnalytics exports the canonical one whose
   comment says "every weekly number in Nova is keyed by this". Unpinned-
   twins family.

## 5. Mission test

**Weekly: earns its keep as the trust layer** — it doesn't change what he
lifts; it makes every silence from the Coach believable, which is what lets
the whole training fleet speak rarely and be trusted when it does. The
not-yet gaps double as a data roadmap ("answerable in November"). **Monthly/
long-term: latent** — the receipt archive is exactly the longitudinal
record the mission wants and nothing reads it yet (con 3). **Daily: n/a by
design.** An honest frame: this is infrastructure for confidence, and
confidence is what the mission's "one platform he opens every day" runs on.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2, 4, 5 REFINE; 3 ADD on the existing receipt store.

1. **[Refine] The fourth state: couldn't-look.**
   - **Proposal:** load sources without swallowing (per-source ok/failed
     map, the fuelCross plan-1 shape); a check whose source failed reports
     `status: 'error', detail: 'weekly volume could not be read
     (<reason>)'` — never a not-yet. Summary gains "…and N couldn't be
     checked (name)". The review's own receipt (17 plan 4) rides the same
     map.
   - **Doctrine:** rule 4; the module's founding rule applied to itself.
   - **Impact/effort:** H / M-L.
   - **Verification:** unit test with a throwing volume loader asserting
     'error' not 'not-yet'; scratch run.
2. **[Refine] Any-day catch-up** — drop the Monday equality in the cadence
   call site; `auditedThisWeek` already keeps it weekly (first tick of the
   week runs it; a slept Monday recovers Tuesday).
   **Impact/effort:** M / L.
3. **[Add] Week-over-week deltas on clear lines.**
   - **Proposal:** when writing the receipt, compare each clear check's
     number to last week's receipt (same store, already 26 weeks deep);
     material moves (≥20% or crossing half-headroom) append "— was N last
     week, trending toward the ceiling". Silence when steady.
   - **Doctrine:** rules 1, 4; the [03] longitudinal fix in the module
     that already owns the history.
   - **Impact/effort:** M / M-L.
   - **Verification:** unit tests on the delta math; replay across his
     real receipt log once a few weeks exist.
4. **[Refine] `'coach-audit': 8 * 24` in TIME_VALUE_HOURS** — last week's
   unacknowledged receipt expires before this week's lands.
   **Impact/effort:** L-M / L.
5. **[Refine] Consolidate `mondayOf`** — import trainingAnalytics's
   canonical export here (and note dispatch/weeklyDebrief as the remaining
   twins for the [12] sweep). **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the weekly Inbox receipt card, the morning brief's
drawn audit card, the audit-log route. Screened against dashboard drift:

- **The couldn't-look state must reach the card** (with plan 1): "1 check
  couldn't run — weekly volume unreadable" as a distinct tone from
  not-yet. What changes: he fixes a broken read instead of waiting for
  data that will never accumulate.
- **Nothing else.** The card already speaks all three states with numbers;
  the delta lines (plan 3) ride the existing summary text. A dedicated
  audit-history screen was considered and rejected: 26 receipts are for
  the delta computation to read, not for him to scroll — surfacing trends
  as one line in the receipt is the honest ceiling.

## 8. Verdict

**Keep as-is / Refine** — the platform's trust layer and the named
*three-state receipt* rail that several earlier findings should adopt; its
one real flaw is missing its own fourth state. Highest-value next action:
**couldn't-look** (plan item 1) — the founding rule of the module, applied
to the module.
