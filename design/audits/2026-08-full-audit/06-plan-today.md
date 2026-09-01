# 06 — Plan Today

Audited 2026-08-30. Read-only. Files opened this session:
`server/lib/planToday.js` (full, 249 lines), `src/vals/valsMission.js`
(570-612), `src/screens/MissionControl.jsx` (260-290),
`src/screens/MissionStructured.jsx` (121-136), consumer greps opened:
learning.js (KIND_LABEL 'plan-today' — "the busiest kind on the discard
board, 31 decisions"), openLoops.js:11 (excluded from loop-nagging),
inbox.js TIME_VALUE_HOURS ('plan-today': 24h expiry), push.js:105,
fleetContext/ops/modelPrefs (kind registration). Tests:
planToday.test.js (4 tests). Deferrals: the Mission Control screen's full
UI audit (item 45); the Inbox loops card (48).

## 1. What it is (verified)

The Daily Review's planning sibling — one morning model pass that turns the
day's real picture into TODAY'S TOP 3: 1-3 concrete priorities, each with a
one-line why; "what the day is FOR, decided before it starts"
(planToday.js:16-22).

- **Trigger/cadence:** half-hourly scheduler after the configured hour
  (default 7), one per day, heartbeat `plan-today`, 3-error retry cap,
  same skeleton as the review (233-249, 131-140). Manual run via loops
  routes; lane switch outranks force (202-207).
- **Context (deliberately lean, 75-92):** profile, standing rules, the
  morning dispatch composition, carry-overs, open to-dos (12 shown of N,
  count named). Each section `.catch(() => {})` — silent drops.
- **Model run:** read-only tools, pinned `modelFor('plan-today')`, $1 cap,
  JSON-only contract; deterministic composition caps at 3 and an empty plan
  throws honestly (96-127). The prompt's discipline block is exactly right:
  "never invent work to fill three slots — a two-priority day is honest"
  (104-108).
- **Outputs:** inbox record kind `plan-today`, journal route, category
  personal; priorities ride the decision payload so the Home card renders
  without re-parsing markdown (177-179). Auto mode: filed with undo +
  Telegram + push (181-189). Draft: pending. 24h time-value expiry keeps
  yesterday's undecided plan from rotting in the queue (inbox.js:1136).
- **Where it surfaces:** the TODAY'S TOP 3 pane on Mission Control and
  MissionStructured with inline Approve + Open Inbox
  (MissionControl.jsx:260-290); push/Telegram in auto; journal after
  filing; the learning loop reads his approve/discard history on the kind
  — the single most-decided kind on the board.

## 2. Current workflow, traced

07:00-07:30 tick → no plan record today → `runPlanToday` → lean context →
record `classifying` (Home card: "Nova is drawing up today's top 3…") →
model returns JSON → `composePlanText` → draft mode: `pending`, the Home
card turns gold ("DRAFT — NEEDS YOUR YES") with one-tap Approve → filed to
journal with undo, card flips to "IN THE VAULT". The priorities then sit on
the home screen all day as static text.

Failure modes, as they degrade today:
- Compose fails → error record, 3 tries, Inbox loops card shows it.
  **Honest in the Inbox** — but the Home card's filter includes only
  `classifying/pending/filed` (valsMission.js:576), so on Mission Control a
  failed plan is **indistinguishable from no plan at all**. **Silent
  absence on the primary surface.**
- Empty/junk model output → thrown, error record (122, 170). **Honest.**
- Restart mid-compose → boot reaper (index.js:228-234). **Honest.**
- Context section throws → vanishes unnamed (77) — same family as 02/04;
  smaller blast radius (5 sections, and the dispatch section degrades
  honestly inside itself). **Dishonest degradation, mitigated.**
- Auto-file failure → same unnotified-fallback family as dispatch
  (cross-cutting [05]); here auto DOES push on success (185-189) but the
  failure path (193-195) is a silent error record.
- Undecided by tomorrow → 24h expiry, honest. **Honest.**

## 3. Pros — what genuinely works

- **The prompt's honesty discipline** — a two-priority day is honest,
  done-ness must be recognisable, priorities fit AROUND the calendar
  (104-108). The right planning doctrine in four lines.
- **Priorities as structured payload** (177-179) — the Home card renders
  real objects, not scraped markdown; exactly the shape a completion loop
  needs (it just doesn't have one yet — see cons).
- **Same clean lifecycle skeleton as the review**: retry caps, orphan
  reaping, budget caps, pinned model, lane switches, time-value expiry.
  The skeleton twins are consistent — a genuine rule-7 win.
- **Inline Approve on the Home card** — the one-tap happy path where his
  eyes already are, not buried in the Inbox.
- **He actually uses it**: the busiest decided kind on the board (31
  decisions in the learning sweep) — engagement is measured, not assumed.

## 4. Cons and gaps (ranked by real-life cost)

1. **The planning loop never closes.** Priorities are never marked done or
   skipped; the evening debrief doesn't score the plan; tomorrow's plan
   composes with no knowledge of yesterday's priorities or their fate. The
   platform's most-decided artefact is fire-and-forget — cross-cutting [02]
   confirmed for its second lane. Mission axis: daily value real,
   weekly/monthly compounding zero.
2. **The two flagship morning artefacts are mutually blind.** The 07:00
   plan and the 08:00 review compose over near-identical pictures, yet the
   review's context has no plan section and the plan never sees yesterday's
   review (verified against both context builders). Nova picks the day's
   top 3, then an hour later reads the day with no idea it did.
3. **A failed plan is invisible on Mission Control** (valsMission.js:576
   filter) — the home screen shows nothing rather than "today's plan hit an
   error", so a broken morning reads as an empty one. General axis.
4. **No goals in the plan context.** "What the day is FOR" is decided
   without what the month is for — fitnessGoals/goal targets reach the
   review (July-sweep fix) but never made it here (75-92 verified: profile,
   standing, dispatch, carryovers, todos only). Mission axis.
5. **No learned tendencies or decline reasons.** preferencesContext feeds
   the review but not the plan; `plan-today` isn't in the why-chips set —
   the most-discarded kind on the board is the one that never asks why.
6. **Silent context-section drops** (77) — same family, smaller surface.
7. **Priorities don't touch the to-do rail.** A priority that names an open
   to-do neither links to it nor checks it — two lists of today's intent
   with no join.

## 5. Mission test

**Daily: earns its keep** — a decided top 3 on the home screen before the
day starts is the difference between reacting and steering, and his 31
recorded decisions on the kind show it's part of his real morning. **Weekly/
monthly: currently contributes nothing** — no completion memory, no arc, no
"you finished 2 of 3 four days running"; the compounding that would make
planning *improve his planning* leaks away entirely. **Long-term:** only the
kind-level approve/discard stat. Same shape as the review's mission gap, and
the same family of fix closes both.

## 6. Improvement plan (ranked; uncapped)

Change types: items 1, 2, 4, 5 ADD on existing rails; 3, 6, 7, 8 REFINE.
One REMOVE-class question is flagged, not proposed: whether plan + review
should remain two morning records (two approvals) or become one — deferred
to the cross-cutting synthesis after both lanes' audits, since merging
surfaces is a one-way door for his morning habit.

1. **[Add] Priority completion loop.**
   - **Need:** the day's three commitments must be closeable, and tomorrow
     must know what happened.
   - **Proposal:** done/skip taps on the Home card's priority rows, writing
     `outcome` onto the record's priorities payload via the existing
     record-update rail (the same mechanism as 02's adjustment ✓/✗ — build
     once, two consumers); `buildPlanContext` gains "yesterday's plan and
     outcomes" read off the record.
   - **Doctrine:** rules 1, 2 (record update, undoable), 6; screened
     against parallel rail (records already carry the payload).
   - **Failure modes:** no yesterday record → section absent.
   - **Impact/effort:** H / M.
   - **Verification:** record-shape unit tests; live tap on a scratch
     server; next-morning context build quoting real outcomes.
2. **[Add] Cross-feed the morning siblings.**
   - **Need:** the review must see today's plan; the plan must see
     yesterday's review.
   - **Proposal:** one section each way — `getPlanTodayStatus().today` into
     buildReviewContext ("TODAY'S PLAN (already picked — score against it,
     don't re-plan)"), and the last review's text into buildPlanContext.
     Trivial reads off the rails; pairs with 02's continuity item.
   - **Doctrine:** rules 1, 7. **Impact/effort:** H / L.
   - **Verification:** live context builds both directions.
3. **[Refine] Error state on the Home card.**
   - **Need:** a failed plan must not render as an empty morning.
   - **Proposal:** include `error` in the valsMission filter with meta
     "HIT AN ERROR — RUN NOW" wiring the existing manual-run action.
   - **Doctrine:** rule 4. **Impact/effort:** M / L.
   - **Verification:** forced-failure on a scratch server + phone-width
     screenshot (standing UI-verification rule).
4. **[Add] Goals in the plan context.**
   - **Proposal:** `goalsContext(vaultPath)` (the same rail the review
     uses; note the twin). **Doctrine:** rule 7. **Impact/effort:** M-H / L.
   - **Verification:** live context build.
5. **[Add] Tendencies + decline reasons.**
   - **Proposal:** `preferencesContext` section, plus `plan-today` added to
     the why-chips advice set (chips: too ambitious / wrong focus / already
     planned / not today) — consumed by item 1's yesterday-section so
     capture has a consumer.
   - **Doctrine:** rule 6; the [03] capture-without-consumption screen.
   - **Impact/effort:** M / L.
6. **[Refine] Named failures via the shared context helper** (the
   01→02→04 chain — this is the fourth consumer; smallest surface, same
   fix). **Impact/effort:** M / L once the helper exists.
7. **[Refine] Push on the day's final failed attempt** (parity with 02
   plan 8 — same helper, both lanes). **Impact/effort:** L-M / L.
8. **[Refine, gated] Priority→to-do linkage.**
   - **Need:** a priority that names an open to-do should check it when
     completed.
   - **Proposal:** GATED deterministic match at compose time (exact or
     high-overlap token match against open to-dos; carry `todoId` in the
     priority payload; completion via item 1 also checks the to-do through
     the existing todos write rail). Run the matcher on his real to-do
     history first — if fuzzy matches are wrong more than rarely, ship
     exact-match only or not at all.
   - **Doctrine:** rules 1, 2; confident-guess screen is the gate.
   - **Impact/effort:** M / M.
   - **Verification:** matcher replay on real to-dos; then live.

## 7. UI recommendations

Where output lands: the TODAY'S TOP 3 pane (Mission Control +
MissionStructured), the Inbox record + loops card, journal, push/Telegram.
Screened against dashboard drift:

- **Done/skip on priority rows** (plan 1) — the card becomes the day's
  scoreboard. What changes: he closes his own top 3 where he sees it, and
  tomorrow's plan learns from it.
- **Error state on the card** (plan 3). What changes: a broken compose gets
  retried at 7am instead of discovered as a mysteriously planless day.
- **Why-chip on plan discard** (plan 5). What changes: the most-discarded
  kind starts teaching the planner.
- **Long-press on a priority row → "make this a to-do"** (companion to plan
  8's gated linkage; works even if auto-matching ships exact-only): manual,
  deterministic, one tap into the existing capture rail. What changes: a
  priority he wants tracked survives past today without retyping.
- **Aesthetics:** the pane is coherent with the HUD tokens (gold accent,
  mono microlabels, numbered rows); classifying/pending/filed states are
  visually distinct. No decorative changes proposed.
- **Accessibility/reachability:** inline Approve is already the one-tap
  happy path; done/skip taps (plan 1) must be ≥40px touch targets at phone
  width — verify at ~375px per the standing rule when built.

## 8. Verdict

**Refine** — the right artefact with the right discipline, rendered where
it should be, missing its feedback loop on both ends. Highest-value next
action: **priority completion loop + sibling cross-feed** (plan items 1-2,
one build) — they turn the platform's most-decided artefact from a daily
readout into a compounding planning practice, and give the review the plan
it should have been scoring all along.
