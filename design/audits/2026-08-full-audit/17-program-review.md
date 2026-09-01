# 17 — Program Review (kind `coach-program`)

Audited 2026-08-30. Read-only. Files opened: `server/lib/coachProgramReview.js`
(full, 661 lines); rails verified at earlier items: the morning raise window +
final-nudge Telegram (coachCadence.js:213-227, item 01), one-tap fixes via
opsFromFix/applyOps (coachPlan.js, item 01), the spoken decision queue
(briefDecisions ORDER puts coach-program first, item 03), drawn cards from
the finding payload (findingCards, item 03), programReviewContext into Coach
chat (workouts.js:554-560, item 01). Tests: coachProgramReview.test.js (13
tests). Deferrals: Program Audit (item 18 — the sibling weekly sweep), Inbox
card rendering (48).

## 1. What it is (verified)

The between-sessions expert: ten deterministic detectors over his real
history, each producing findings with stable keys, evidence-bearing lines,
and (where honest) one-tap fixes — the model only ever phrases; code decides
there is a problem (1-12). The detectors, in raise priority (RANK, 515):

1. **Reported pain** (min 1 occurrence) and **reported form** (min 2 within
   6 sessions) — his own mid-session words raised as findings, quoted, with
   deliberately NO fix: "hard-coding a prescription here would be this file
   pretending to expertise it does not have" (425-471).
2. **Mis-classified lifts** (20-91): name-implies-muscle rules with the
   specific-before-general lesson documented (a Seated Leg Curl once
   "trained biceps"), a NO_GUESS list, and plausible-pairs tolerance so a
   bench-as-Triceps choice is never "corrected". Ranked high because a wrong
   mapping corrupts every volume number downstream.
3. **Effort ceiling** (473-506): ≥85% of rated working sets at RPE 9-10
   over 6 weeks — the finding that explains the others — gated on 100+ sets
   with ≥60% rated ("on a thin log this would just be describing a hard
   week").
4. **Chronic under-volume** vs goal muscles, 3 weeks running (171-191);
   **junk volume** as its mirror, reading the same weeklyVolume input "so
   the two can never disagree" (222-245), deliberately fix-less.
5. **Oversized routines** (256-304): measured against what he ACTUALLY
   finishes (defined vs worked ratio 0.7), with the least-reached exercise
   as the one-tap cut — and a `justAdded` guard encoding a real failure
   (the review offered to drop Weighted Pull-Up half an hour after Coach
   added it).
6. **Low-value exercises** (311-371): within-routine comparison against his
   OWN lifts (worst flat while a stablemate moved ≥5%), figures exposed so
   the card draws the same numbers the sentence quotes.
7. **Stale lifts** (112-164) and **long tenure** (377-412): stopped-paying
   vs been-there-too-long, distinct on purpose; alternatives same-muscle,
   unused-first; "nothing honest to offer" skips the finding.

**Raise/nudge/close rails** (564-661): raise once per key, never stacking;
MAX_OPEN 2 ("a list is noise"); nudge at 3 then 7 days then stop, final
nudge earning a Telegram (cadence); a discarded finding is answered — never
re-raised; the finding's numbers ride the record so brief cards draw from
the same object; programReviewContext keeps the chat and Inbox in agreement
about what is open.

## 2. Current workflow, traced

Morning window (7-12, item 01's cadence): raiseProgramFindings → nudges the
open ask from 4 days ago ("Still open, sir: …"), then reviewProgram runs all
ten detectors over 60 sessions → the effort-ceiling finding (94% at 9-10,
measured on his real log) outranks two stale lifts → one record raised
(MAX_OPEN honoured) with the finding numbers in the payload → it appears as
an Inbox card, in the spoken brief's decision queue ("Shall I make that
change, sir?"), and in Coach chat context so a training conversation can
argue it naturally. He taps APPLY on a mapping fix → opsFromFix → applyOps
→ remap with undo (item 01's rails).

Failure modes, as they degrade today:
- Ambiguous name → NO_GUESS, silence. **Honest.**
- No same-group alternative → stale finding skipped entirely. **Honest.**
- Thin history → every detector has explicit evidence bars. **Honest.**
- Coach-added exercise → protected from the chopping block. **Honest.**
- **Week-keyed findings re-raise after being argued down**: the seen-set
  blocks exact keys only (621), and under-volume/junk keys embed the week
  (`under:Chest:<week>`, 181, 233) — so a discarded under-volume finding
  returns with next week's key, breaking the "a discarded finding is
  answered" promise (569-571) for exactly the kinds that persist. MAX_OPEN
  caps the flood, not the nag. **Verified contract break.**
- **Nudge phrasings compound** (588-593 + 609): nudgeLine writes its output
  into `record.text`, and the next nudge builds on the rewritten text — the
  final nudge reads "Last time I'll raise it, sir: Still open, sir: …".
  **Verified cosmetic-but-visible bug** in the exact voice that is supposed
  to sound like a coach.
- Detector source failure → reviewProgram's individual loads mostly
  `.catch` to empty → a broken read shrinks the finding set silently
  ([03] family, mild here since raising less is safe).

## 3. Pros — what genuinely works

- **The strongest expression of "models decide, code acts" in the fleet** —
  ten detectors where every threshold is justified in a comment, every
  false-positive lesson is encoded where it happened (leg-curl, grip,
  justAdded), and the model's entire role is phrasing.
- **His own words as the highest-ranked signal** (findNoteSignals + RANK) —
  pain outranks everything, form-breakdown next, and neither carries a
  one-tap fix because prescription belongs to the Coach conversation.
- **The raise/nudge/stop cadence** is the platform's most humane
  persistence design: capped open asks, two nudges then silence, Telegram
  only at the final one, quiet the moment he acts or argues.
- **Same-object card-and-sentence** (631-634) — the drawn card can never
  disagree with the spoken line.
- **The effort-ceiling meta-finding** — one systemic observation instead of
  fourteen identical per-lift notes; measured (94% of 227 sets), gated,
  and explanatory. This is what "expert" looks like in code.
- **13 tests** on the detectors' lines.

## 4. Cons and gaps (ranked by real-life cost)

1. **The argued-down promise breaks for week-keyed kinds** — a "no" to an
   under-volume/junk finding returns weekly with a fresh key. The one
   contract the module's own comments stake its manners on. (Mapping and
   low-value keys, being stable, keep the promise — the eternal-no
   trade-off is the [13] family's other pole.)
2. **Nudge text compounds** — small, verified, and it lands in his ear via
   the brief's decision queue.
3. **Alternatives ignore the client file** — stale/tenure suggestions rank
   only by recently-unused; the What Works page's "avoid" list (things his
   shoulder tolerates, aversions he has stated) is one deterministic
   name-match away and never consulted. A suggested swap he has already
   declared against costs exactly the credibility this module is built on.
4. **Detector-source failures shrink findings silently** ([03] family) —
   "no findings" and "couldn't look" are indistinguishable in the receipt;
   the weekly audit (item 18) exists partly for this, so the fix may
   belong there — flagged to 18.
5. **Under-volume target is a flat 12** — documented landmark, fine; noted
   only because item 18's audit may want the goal-aware version some day.
   Not a proposed change.

## 5. Mission test

**Weekly: earns its keep decisively** — this is the "look across days and
weeks and say swap this for that" he explicitly asked for, delivered with
evidence and restraint; the oversized-routine finding alone (a plan he
finishes half of, generating 12 makeup sessions in six weeks) is the kind
of structural truth a human coach charges for. **Monthly/long-term:** the
tenure and effort-ceiling findings are inherently monthly-scale signals;
approved fixes compound the program itself. **Daily:** correctly nothing —
the daily voice is Coach's cadence; this module feeds it. The mission risk
is manners, not substance: cons 1-3 are all trust erosion at the margins
of an otherwise trustworthy expert.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2, 4 REFINE; 3 gated ADD. Nothing to remove; the detector
set matches his stated asks almost one-for-one.

1. **[Refine] Honour the argued-down promise across weeks.**
   - **Proposal:** when a `coach-program` record is discarded, also record
     its KIND+SUBJECT (`under:Chest`, `junk:Back`) with the discard date;
     week-keyed detectors skip subjects declined within a cooldown (28d),
     and re-raise after it only when the numbers have materially moved
     (≥20% on the finding's metric) — with the receipt in the line ("you
     passed on this a month ago; it's now N weeks and worse"). The [13]
     material-change pattern, applied to the opposite pole.
   - **Doctrine:** rule 6; the module's own stated contract (569-571).
   - **Impact/effort:** M-H / M.
   - **Verification:** unit tests on the cooldown; replay against his real
     records to count would-have-re-raised events.
2. **[Refine] Fix nudge-text compounding.**
   - **Proposal:** keep the original line immutable on the record (the
     `finding` payload already holds the data; add `originalText` or
     derive from finding.line) and have nudgeLine always build from it;
     regression test asserting nudge 2's text contains no nudge-1
     phrasing.
   - **Doctrine:** §4. **Impact/effort:** M / L.
3. **[Add, gated] Client-file-aware alternatives.**
   - **Proposal:** GATED: deterministic name-match of candidate
     alternatives against the What Works "Avoid / does not land" section
     (read unclipped — one file); matched candidates sink to the bottom
     with the reason attached ("skipping X — your file says it aggravates
     the shoulder"). No fuzzy matching unless a real-data replay shows
     exact matching missing real aversions.
   - **Doctrine:** rules 1, 7 (reads the existing client file);
     confident-guess gate.
   - **Impact/effort:** M / M.
   - **Verification:** replay candidate lists against his real What Works
     page.
4. **[Refine, flagged to 18] Couldn't-look honesty in the review receipt**
   — reviewProgram returns counts; extend with per-source ok/failed so the
   weekly audit (whose whole job is "checked and clean vs quietly broken")
   can report it. Decide placement at item 18; don't build twice.

## 7. UI recommendations

Where output lands: Inbox coach-program cards (APPLY / DISCUSS via the
CoachApplySheet rails), the spoken brief's decision queue with drawn cards,
Coach chat context, final-nudge Telegram. Screened against dashboard
drift:

- **Nothing new proposed.** The card already carries the one-tap fix, the
  discuss path, the drawn numbers, and the nudge cadence; the two text
  fixes (plan 1-2) land inside existing surfaces. This module's UI is
  already exactly as big as it should be.

## 8. Verdict

**Keep as-is / Refine** — the fleet's deepest expression of models-decide-
code-acts and the most humane persistence design in the platform; its
flaws are two small verified bugs and one missing courtesy (checking his
client file before suggesting swaps). Highest-value next action: **honour
the argued-down promise across weeks** (plan item 1) — the module's own
manners contract, currently broken for its most persistent findings.
