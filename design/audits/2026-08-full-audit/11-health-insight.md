# 11 — Health Insight

Audited 2026-08-30. Read-only. Files opened: `server/lib/healthInsight.js`
(full, 301 lines), `server/lib/orgContext.js` 93-107 (distribution),
`src/vals/valsMission.js` 636-668 (the Nova-noticed card) + 232-283
(the staleHint idiom the card ignores), `server/routes/healthData.js`
(insight routes), writeSlices/snapshot/guardian/ops/modelPrefs greps.
No dedicated test file found for this module (buildContext/prompt are
untested — noted). Deferrals: Mission Control screen UI (item 45), health
data spine (item 40), healthSentinel (covered under item 40's family).

## 1. What it is (verified)

The twice-daily holistic health read: one model composition per slot —
morning (readiness, after 06:00) and evening (day-in-review, after 18:00)
— producing ONE specific, cross-domain observation of 1-2 sentences, with
an explicit honesty gate: `hasInsight: false` when no genuine pattern
exists (healthInsight.js:164-181, 271-291).

- **Context** (31-162): org block (standing rules + fleet — so the health
  read obeys the same corrections other agents do), profile, 7 days of
  health metrics, 5 sessions, today's nutrition plan-vs-eaten, 7 days of
  actual protein vs floor, per-slot calendar with deterministic
  pre-analysis (scheduled hours + back-to-back count, 109-135 — morning
  gets yesterday's load AND today's day-ahead), journal previews. Every
  section degrades by name ("- Unavailable.") — the honest-composer
  pattern, present here.
- **The call:** composition-only (`--allowedTools ''`), pinned
  `modelFor('health-insight')` with the unpinned-lesson comment, $0.50
  budget, no session persistence (184-199).
- **Storage:** `data/health/insight.json`, morning/evening slots with a
  legacy-shape migration (221-240); lane-off leaves the old insight in
  place to self-label as stale rather than blanking it (250-254).
- **Where it surfaces:** the Mission Control "Nova noticed" card
  (valsMission.js:642-646, demo insights strictly demo-gated); org context
  feeds it to every other agent WITH an age label ("Nova's health read
  (3h ago): …", orgContext.js:93-107); GET /health-insight + manual
  generate route; hourly scheduler with heartbeat, silent until at least
  one day of health data exists (275-291).

## 2. Current workflow, traced

06:00-07:00 tick: one day of health data exists, no morning insight today
→ context builds (HRV series, yesterday's 3 back-to-back meetings, protein
short 2 of 7 days, journal previews) → model returns
`{hasInsight: true, insight: "Your HRV has dipped both mornings after
9h+ scheduled days — today is another one; guard the evening."}` → stored
→ Mission Control shows it under MORNING; every agent's org block carries
it with its age all day.

Failure modes, as they degrade today:
- No health data yet → silent, by design (277-278). **Honest.**
- Any context section fails → named "Unavailable" line. **Honest.**
- No real pattern → `hasInsight: false`, stored as such. **Honest at the
  store** — but see con 2 for what the UI then says.
- Lane off → old insight kept with its own timestamp (250-254). **Honest**
  at the store; the UI shows it undated (con 3).
- **Generation throws → console error only, and the hourly tick retries
  ALL DAY** (282-287: the slot's date never flips, so every tick
  re-attempts) — up to ~18 × $0.50 mornings-to-midnight on a persistent
  failure. The review/plan siblings cap at 3/day; this lane predates the
  cap and never got it. **Runaway retry cost.**

## 3. Pros — what genuinely works

- **The `hasInsight` gate is the anti-manufactured-insight rule as a typed
  contract** — the model is structurally allowed to say "nothing worth
  raising", which is what keeps a twice-daily observer trustworthy.
- **Deterministic calendar pre-analysis** (scheduled hours, back-to-back
  count) — code computing the load stats the model reasons from, instead
  of asking it to do arithmetic. Quietly one of the best context-builder
  moves in the fleet.
- **Distribution with age labels via orgContext** — the health read
  reaches every agent, always dated. The write-once-read-everywhere shape
  is right.
- **Honest per-section context degradation** — this builder is on the
  correct side of the cross-cutting [01→02] line.
- **Off-mode preserves rather than blanks** — stale-and-labelled beats
  silently empty.

## 4. Cons and gaps (ranked by real-life cost)

1. **No retry cap → unbounded daily spend on persistent failure**
   (282-287, verified absent). The one lane whose siblings all cap at
   3/day. General axis; real money.
2. **The empty state names the wrong cause** (valsMission.js:646): the
   card's only empty text is "connect your Apple Health data" — shown
   identically when data flows fine and the model honestly found no
   pattern (`hasInsight: false`). The platform's most honest model gate
   gets translated into a false diagnosis on screen. General axis.
3. **Insights render undated on Mission Control** (643-645: label + text
   only) — yesterday's evening insight shows all morning as "EVENING" with
   no age, in the exact card family where steps/sleep/HRV all self-label
   staleness (staleHint, 232-283). orgContext dates it; the UI doesn't.
4. **No memory of its own past insights.** Each generation is cold:
   yesterday's observation isn't in context, so repetition ("the same
   HRV-vs-load line four days running") is unguarded and follow-up
   ("yesterday I flagged X — it held/didn't") is impossible. The
   follow-through family, fifth confirmed site. Mission axis,
   weekly.
5. **The card is a dead end.** An insight that says "guard the evening"
   offers nothing to tap — no path into Ask Nova, no connection to the
   surfaces it references. Mission axis, daily.
6. **No tests** for buildContext/buildPrompt/slot logic (verified: no
   healthInsight test file) — the retry-cap fix and slot guards have
   nowhere to pin their regressions.
7. **Morning crowding** (flag, not a fix here): by 08:30 the platform has
   spoken about recovery through the morning brief, the Coach card, the
   morning insight, and the Daily Review — four voices, three of them
   model-composed. Belongs to the synthesis alongside the 06 plan/review
   question.

## 5. Mission test

**Daily: earns its keep conditionally** — a genuinely specific cross-domain
observation ("HRV dips after 9h+ scheduled days — today is one") changes
how he paces a day in a way raw metrics don't; the hasInsight gate protects
that value. Its daily ceiling is capped by being unactionable (con 5) and
occasionally stale-undated (con 3). **Weekly: leaks value** — without
insight memory there is no thread, only daily one-liners. **Monthly/
long-term: nothing**, and honestly needn't be more — the long arc belongs
to the debrief and review; this lane's job is the sharp daily notice.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2, 3, 6 REFINE; 4, 5 ADD. Rejected candidate: putting
insights on the inbox rails as decisions — an observation is not a write;
forcing approve/discard on a read would manufacture decisions (drift).

1. **[Refine] Retry cap parity.**
   - **Proposal:** count today's failed attempts per slot (in the same
     insight.json), stop at 3 like the review/plan siblings; log the
     final failure reason into the slot so the card can say so.
   - **Doctrine:** rule 4; §4 gates. **Impact/effort:** H / L.
   - **Verification:** unit test the cap (new test file — see item 6);
     forced-failure scratch run.
2. **[Refine] Two honest empty states.**
   - **Proposal:** the card distinguishes "no health data connected" from
     "no pattern worth raising today" (`hasInsight: false` with a fresh
     generatedAt) — the second is a *success* state and should read like
     one ("Nothing worth flagging today — signals look steady.").
   - **Doctrine:** rule 4. **Impact/effort:** M-H / L.
   - **Verification:** valsMission unit-level check + phone-width
     screenshot at item 45's pass.
3. **[Refine] Date/age chips on insight items.**
   - **Proposal:** carry generatedAt into healthInsightItems; render the
     same staleness idiom the metric tiles use (fresh = no chip; else
     "yesterday evening").
   - **Doctrine:** rule 4 (stale self-labels — the platform's own idiom,
     one card away). **Impact/effort:** M / L.
4. **[Add] Insight memory.**
   - **Proposal:** last 3 insights (with dates) ride the context with:
     never repeat an observation unless the data moved; follow up once
     when yesterday's flagged pattern resolved or held. Same file, no new
     store.
   - **Doctrine:** rules 1, 7. **Impact/effort:** M-H / L.
   - **Verification:** context snapshot test; live generation reading real
     history.
5. **[Add] "Talk it through" affordance on the card.**
   - **Proposal:** one tap opens Ask Nova with the insight text as the
     opening context (the existing front-door rail; the screen-context
     bracket convention from buildAskPrompt:234 already supports exactly
     this shape).
   - **What he does differently:** an observation becomes a decision
     conversation in one tap instead of a read-and-forget.
   - **Doctrine:** rules 5, 7. **Impact/effort:** M / L-M.
   - **Verification:** tap-through on scratch at phone width.
6. **[Refine] A test file.**
   - **Proposal:** healthInsight.test.js pinning: slot guards (6/18
     hours), retry cap, the legacy-shape migration, hasInsight gating,
     and the calendar load arithmetic (114-127).
   - **Doctrine:** §4 (write the test that encodes the lesson).
   - **Impact/effort:** M / L-M.

## 7. UI recommendations

Where output lands: the Mission Control "Nova noticed" card; org context
(invisible by design). Screened against dashboard drift:

- **Honest empty states** (plan 2) — what changes: he stops chasing a
  "connect Apple Health" instruction that isn't the problem, and a
  no-pattern day reads as reassurance, not breakage.
- **Age chips** (plan 3) — what changes: he never paces today by
  yesterday's read.
- **Talk-it-through tap** (plan 5) — covered above; the single
  reachability change worth making.
- **Aesthetics:** the card family already carries the HUD idiom
  (MORNING/EVENING microlabels); adding chips must reuse the staleHint
  visual language rather than inventing a variant. No other changes — the
  insight is one sentence and should stay visually quiet.

## 8. Verdict

**Refine** — the right specialist with the fleet's best honesty gate,
undermined by a cost bug, a lying empty state, and datelessness on screen.
Highest-value next action: **retry cap parity** (plan item 1) — it is the
only place in the audited fleet so far where a silent failure spends real
money all day.
