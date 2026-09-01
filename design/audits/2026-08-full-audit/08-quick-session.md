# 08 — Quick Session

Audited 2026-08-30. Read-only. Files opened this session:
`server/routes/workouts.js` (668-746: the quick-session + prepare routes),
`server/lib/claudeCode.js` (915-982: prompt + job + BREAKER_DISALLOWED),
`server/lib/coach.js` normalizeQuickPlan (348-387, read in full at item 01),
`src/App.jsx` (5964-6000: buildQuickSession/startQuickPlanSession),
`src/vals/valsWorkouts.js` (402-418: inputs + preview card). Tests:
normalizeQuickPlan covered in coach.test.js (verified). Deferrals: the
Workouts screen UI (item 46); the session editor and save rails (audited at
item 01).

## 1. What it is (verified)

The impromptu-workout designer: for a day outside the program, he gives a
time box (10-180 min, clamped) and an optional note; one model pass designs
a session; deterministic code maps it onto his real library and history;
he previews and starts it in the normal session editor
(workouts.js:668-727, claudeCode.js:915-975, coach.js:348-387).

- **Context assembled** (677-711): profile, goals, exercise library (exact
  names), week shape — yesterday/today/tomorrow with active-rest named
  honestly (686-692), earned progressions to prefill (693-695), carry-overs
  with an explicit build-around-the-debt directive (697-702), last 3
  sessions (names only), latest recovery line (HRV/sleep, one day).
- **Model run:** read-only tools (BREAKER_DISALLOWED), pinned
  `modelFor('quick-session')` (the was-unpinned lesson in a comment, :947),
  $ budget cap, JSON-only contract, fresh session each time. The prompt's
  time-box arithmetic is honest (~minutes/8 to /6 working exercises, :921)
  and demands library names, concrete prescriptions, weight hints from
  logged numbers, one line of rationale.
- **Deterministic mapping** (`normalizeQuickPlan`, pure + tested): 3-tier
  name matching (exact → substring → token-subset so "chest supported row"
  finds "Chest-Supported Dumbbell Row"), set/rep clamping, last-weight
  prefill from exerciseState, ad-hoc fallback marked `adhoc` so false
  history never attaches; empty/unusable plans throw honest errors.
- **Client flow:** minutes+note → job poll (3-min timeout) → prepare →
  preview card (name, rationale, per-exercise labels with a NEW badge on
  ad-hoc, start/dismiss) → session editor as routineId `impromptu` → logged
  through the normal save rails (item 01's receipts/PRs/debrief apply).

## 2. Current workflow, traced

Saturday, off-program, 40 minutes: he types 40 + "hotel gym, dumbbells
only" → context assembles (carry-overs from Thursday's cut-short Push ride
in with the build-around-it directive) → model returns 5 exercises →
normalizeQuickPlan maps 4 onto the library (prefilled at last logged
weights), 1 ad-hoc marked NEW → preview shows the rationale → start → the
session editor opens prefilled → he logs it → the save fires the full item
01 chain (receipt, PRs, debrief).

Failure modes, as they degrade today:
- Model junk / no JSON / empty plan → job error → toast "Coach could not
  build the session: …" (App.jsx:5979-5983). **Honest.**
- Plan unusable at prepare (no mappable exercises) → thrown by
  normalizeQuickPlan → toast "Plan came back unusable". **Honest.**
- Poll timeout (3 min) → error path, busy state cleared. **Honest.**
- Lane off → assertLaneOn → 409 with the reason (the laneOff handler).
  **Honest.**
- Context section fails → silently absent (optional catches, 677-711) —
  the shared silent-drop family, smallest surface here since the prompt
  says "(unavailable)" only when everything is gone. **Mitigated but
  unnamed.**
- Ad-hoc exercise logged → carries `adhoc-` id; history and progressions
  correctly never attach. **Honest.**

## 3. Pros — what genuinely works

- **The cleanest models-decide-code-acts loop in the training domain**: the
  model only ever names a plan; code maps, clamps, prefills, and the human
  starts it. Nothing writes until the normal session save.
- **Carry-overs-first design** (697-702) — the impromptu session reaches
  for recorded training debt before inventing work; the program's gaps are
  the default material. Exactly the right coaching instinct, encoded.
- **Token-subset matching + ad-hoc marking** in normalizeQuickPlan keeps
  history attachment honest in both directions: fuzzy enough to find the
  real exercise, never so fuzzy that a new movement steals old history.
- **The week-shape context with active-rest named honestly** (686-692) —
  the third consumer of the one-schedule-two-readers contract, consistent.
- **Honest time-box arithmetic in the prompt** — the model is told what 40
  minutes actually buys, so plans fit reality instead of ambition.

## 4. Cons and gaps (ranked by real-life cost)

1. **The session designer cannot see the injury log.** Coach chat gets
   `injuriesContext`; the one lane that *designs workouts* doesn't
   (verified absent from 677-711) — an open shoulder injury and a
   model-designed press session can meet with no warning. Safety-adjacent;
   both axes.
2. **No deload signal or training-block context.** On a deload-advised day
   (or a deload week of a block), the impromptu builder happily designs
   heavy — the two recovery signals every other training surface reads are
   absent here. Mission axis, daily.
3. **Recent sessions ride as names only** (705) and the library line
   carries no muscle groups (685) — "don't hammer what yesterday hammered"
   forces the model to infer muscles from exercise names. It mostly can,
   but the deterministic fact exists and isn't given.
4. **The rationale dies at the preview.** The plan's one-line why (and its
   model-designed provenance beyond `routineId: 'impromptu'`) never
   reaches the logged session, so the debrief and history can't reference
   why that day looked the way it did. Minor, mission-long-term.
5. **Silent context drops** — sixth site of the shared family; smallest
   blast radius, same fix once the helper exists.
6. **Preview is all-or-nothing** — no way to drop one exercise before
   starting (he can skip it in the editor, so the cost is small; noted for
   the UI pass at item 46 rather than fixed here).

## 5. Mission test

**Daily: earns its keep on exactly the days the program doesn't** — travel,
time-boxed, off-schedule days get a session that respects the week, clears
recorded debt, and prefills real loads; the alternative is a guessed workout
or none. **Weekly:** the carry-over-first directive makes impromptu days
serve the program's actual gaps. **Monthly/long-term:** neutral — sessions
flow into history like any other (good), but the designer itself learns
nothing across uses (its inputs improve as other rails improve, which is
the right dependency). The mission gap is safety/recovery context, not
learning.

## 6. Improvement plan (ranked; uncapped)

Change types: 1, 2, 3 ADD context on existing rails; 4, 5 REFINE. Nothing
to remove. One candidate evaluated and rejected: making Quick Session a
conversational lane (iterate on the plan in chat) — rejected as a parallel
rail; Ask Coach already handles "adjust this plan" conversationally, and
the preview→editor flow covers the rest.

1. **[Add] Injuries in the design context.**
   - **Need:** a workout designer must check the injury log before
     prescribing — the same page a real coach checks first.
   - **Proposal:** `injuriesContext(vaultPath)` section (the exact rail
     Coach chat uses, workouts.js:465-468 — note the twin) + one prompt
     line: work around active limitations, name the substitution.
   - **Doctrine:** rules 1, 7. **Impact/effort:** H / L.
   - **Verification:** live context build with a fixture injury on a
     scratch vault; prompt-contract test.
2. **[Add] Deload signal + block context.**
   - **Proposal:** `computeDeloadSignal` line and `blockContext` section
     (both existing rails); prompt already says "tied to goals/recovery/
     context" — give it the recovery verdict it's told to honour, plus
     "deload week: design light" when the block says so.
   - **Doctrine:** rules 1, 7. **Impact/effort:** M-H / L.
   - **Verification:** live build on a scratch vault with a deload-week
     block fixture.
3. **[Add] Muscle groups on the library + sessions lines.**
   - **Proposal:** `${e.name} (${e.muscleGroup})` in the library line;
     recent sessions gain per-exercise muscle groups — the deterministic
     fact the don't-hammer rule needs.
   - **Doctrine:** rule 1. **Impact/effort:** M / L.
   - **Verification:** prompt snapshot test.
4. **[Refine] Rationale rides the session.**
   - **Proposal:** startQuickPlanSession carries `plan.rationale` into the
     session object; completeSession already persists unknown-but-shaped
     fields or gains one optional field — the debrief's fact sheet
     (coachCadence sessionDebrief) then quotes why the session existed.
   - **Doctrine:** rules 3, 6 (the why is part of the record).
   - **Impact/effort:** L-M / L.
   - **Verification:** save a scratch session; read the vault file.
5. **[Refine] Named absent sections** — seventh consumer of the shared
   context helper (01→02→04→06 chain) when it lands. **Impact/effort:**
   L / trivial once built.

## 7. UI recommendations

Where output lands: the Workouts screen's quick-session inputs + preview
card, then the standard session editor. Screened against dashboard drift:

- **Per-exercise dismiss on the preview** (con 6, deferred build decision
  to item 46): an ✕ per row before starting. What changes: a plan that's
  90% right starts in one tap instead of being dismissed wholesale or
  carried as dead weight into the editor. Small, genuine fluidity gain.
- **Injury/deload chips on the preview** (companions to plan 1-2): when
  the context carried an active injury or deload advisory, the preview
  shows the chip so he can see the plan already accounted for it. What
  changes: he trusts the plan on exactly the days trust matters most —
  and a missing chip on an injured day is itself information.
- **Weight-hint vs prefill clarity**: the row label shows the model's
  weightHint while the editor prefills last logged weight — two numbers
  that can disagree. Show the prefill source in the editor row ("last:
  80kg") per the existing session-editor idiom [rendering verified at item
  46]. What changes: no mid-set surprise about where a number came from.
- **Accessibility:** preview rows and the start/dismiss actions verified
  at ~375px when item 46 runs (standing rule).

## 8. Verdict

**Keep as-is / Refine** — a small lane doing exactly what it should, with
the right loop shape and honest failure paths; its gaps are three missing
context rails, all trivial to wire. Highest-value next action: **injuries
in the design context** (plan item 1) — the one-line add with
safety-shaped downside protection.
