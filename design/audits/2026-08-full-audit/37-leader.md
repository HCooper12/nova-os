# 37 — Leader

Audited 2026-08-31. Read-only. Files opened: `server/lib/leader.js` (1-530
line-by-line + scheduler windows by grep; 530-576 parse tail [mapped]),
`server/lib/claudeCode.js` 818-909 (the chat lane). Consumers verified at
earlier items: the brief's lead line (05), Ask Nova's leader sections +
agentSessions transcript (04), the weekly debrief's leadership section
(15), orgContext, the widget's lock-screen line (65 deferred), learning
KIND_LABEL. Deferrals: Leader screen (59), phone widget (65).

## 1. What it is (verified)

The leadership-development agent — "make the leadership knowledge he
already collects actually reach him when it can change how he leads at
work" (11-15). Division of labour stated and held: models interpret; code
decides what enters context, when runs happen, and what reaches the brief
and widget — "no model sits between him and the morning surface" (16-21).

- **The corpus** (91-148): leadership material found by a two-tier filter
  TESTED against his real Concepts shelf, with the false-positive lesson
  documented ("mitochondria pages talk about 'signals', 'influence' and
  'communication' too — the first cut pulled his whole biology shelf in").
- **Spaced repetition** (150-175): gaps double 3→6→12→24→35d;
  never-surfaced outranks revisits; "same shape as the library
  resurfacing that already works" (an acknowledged, unshared twin).
- **The daily idea** (given ≥DAILY_HOUR, per-day guard, race-conscious
  re-read-before-write, 337-345): ONE idea — action/reminder/idea — must
  survive "being read in ten seconds at 7am", grounded in his concepts +
  research + stated struggles, with the last 7 days' ideas in context so
  repeats are deliberate ("a repeat must be… freshly angled"); today's
  calendar makes "try today" concrete ("a meeting is a rep"). Delivered
  to the homepage card, the brief, the widget line (stored receipt), and
  Telegram.
- **Weekly research** (Saturdays, 6-day gap guard): steered FIRST by his
  stated struggles, deduped against the library, provenance required —
  and since the invisible-knowledge fix, **insights weave into real vault
  pages via the ingest rail** ("research he paid for should be findable",
  395-417), with an honest fallback if the weave fails.
- **REFLECT** (the chat's directive): his struggles/wins/resolutions in
  his own tightened words; resolved-not-deleted ("the history is how
  progress stays visible"); merged by code with **precise-reversal
  tracking** — undo removes only what that call added and re-opens only
  what it resolved (427-511). Auto-filed with a real undo, and the
  reasoning is one of the best doctrine paragraphs in the codebase
  (459-464): "an approval he reflexively taps is not consent, it is
  friction pretending to be a gate. Auto-file with a real undo is the
  honest middle." A REFLECT parse failure updates NOTHING and says so in
  the reply — the opposite decision from Coach's PROPOSE, with the reason
  (843-846): silently dropping his struggles "would quietly starve the
  research run of exactly the thing he told us mattered."

## 2. Current workflow, traced

Morning: the daily composer picks two due concepts + one research insight
via spacing, sees his open struggle ("delegating without hovering"), and
composes: action — "In today's 15:30, hand the decision to Sam and stay
silent for the first five minutes" with the why naming the struggle →
stored receipt → homepage card, brief line, widget, Telegram. In the chat
that evening he says the silence worked → REFLECT {"working":[…]} → code
merges, a filed receipt with undo lands, and Saturday's research steers a
little differently.

Failure modes:
- Empty idea → thrown, retried next tick (per-day guard on success only).
  **Honest.**
- Concurrent generation → re-read-before-write; last write never clobbers
  an existing day. **Honest.**
- Weave failure after research → insights still saved, error logged.
  **Honest.**
- REFLECT prose/parse failure → profile untouched, said in the reply.
  **Honest — the loud-failure choice.**
- **Resumed chat turns get no volatile refresh** ([01] family): the
  reminder restores REFLECT syntax, but a days-old session never learns
  today's idea, new struggles from the debrief, or resolutions — the
  Coach's coachLiveLine fix has no Leader twin (903: reminder + question
  only, verified).
- **Research is Saturday-gated** ([12] class, next site) — the 6-day gap
  guard would make widening free.
- Research URLs are shape-validated only ([24]-lite; the weave's review
  gate is the real check).

## 3. Pros — what genuinely works

- **The auto-file-with-undo paragraph** — name it as a rail: *the honest
  middle* — the platform's clearest thinking on when a gate is consent
  and when it is friction. It should be cited whenever a new write path
  picks its mode.
- **Struggles → research → daily idea → REFLECT** is a genuinely closed
  development loop: what he says steers what gets researched, which feeds
  what he's told, and the weekly debrief (15) already holds the week
  against the ideas — follow-through exists at the right cadence, and
  was assessed here as adequate rather than gapped.
- **Tested corpus filter with the lesson documented** — the
  detectors-on-real-data memory rule, executed.
- **Research made findable** — the leader.json-only invisibility caught
  and fixed with the one-rail weave; the comment tells the story.
- **Precise-reversal undo** on the only auto-write — rule 2 at its most
  careful.

## 4. Cons and gaps (ranked by real-life cost)

1. **Resumed-chat staleness** — the lane most explicitly built as a
   CONTINUING conversation is blind to its own daily output and profile
   changes mid-session.
2. **Saturday research gate** ([12]).
3. **The spacing twin** — leader spacing vs librarySpacing, same shape,
   two implementations, acknowledged and unshared ([12] twins sweep).
4. **URL shape-only validation** on research insights — mitigated by the
   weave's review gate.

## 5. Mission test

**Daily: earns its keep** — one ten-second idea aimed at today's actual
meeting, grounded in his own material, is the leadership analogue of the
Coach's morning card. **Weekly:** research steered by his words; the
debrief closes the loop. **Long-term: the strongest personal-development
arc in the fleet** — struggles resolved-not-deleted means progress is
visible history, and the research library + woven pages compound. This
agent is the mission's "become the best version of himself" applied to
work, and its architecture matches the ambition.

## 6. Improvement plan (ranked; uncapped)

1. **[Refine] A leaderLiveLine for resumed turns.**
   - **Proposal:** the Coach's fix, twinned: resumed turns prepend a
     recomputed volatile line — today's idea (title + why), open
     struggles count with newest, latest resolutions — local reads only.
   - **Doctrine:** rules 1, 4; [01] family closure for this lane.
   - **Impact/effort:** M-H / L.
   - **Verification:** resume a real session; the line quotes today's
     real idea.
2. **[Refine] Widen the research window** (Sat-Sun; the gap guard
   dedupes) — or adopt Compost's age-based shape. **Impact/effort:** L / L.
3. **[Refine] Share the spacing helper** — extract the doubling-gap
   picker used here and in librarySpacing into one module ([12] twins).
   **Impact/effort:** L-M / L.
4. **[Refine] Verify research URLs open** — a cheap HEAD-check before
   filing, failures marked "(link unverified)" rather than dropped.
   **Impact/effort:** L / L-M.

## 7. UI recommendations

Where output lands: homepage card, brief line, widget, Telegram, the
Leader chat, woven vault pages. Screened against dashboard drift:

- **None here** — the daily surfaces already exist and the Leader screen
  (59) owns their rendering pass. The one candidate (a tried/didn't chip
  on the daily card) was evaluated and REJECTED: the REFLECT conversation
  and the weekly debrief already close the loop at better fidelity than a
  binary tap would.

## 8. Verdict

**Keep as-is / Refine** — the mission's work-life engine with a genuinely
closed development loop and the platform's best consent reasoning; its
gaps are one missing live-line twin and three small hygiene items.
Highest-value next action: **the leaderLiveLine** (plan item 1) — the
continuing conversation should know its own morning.
