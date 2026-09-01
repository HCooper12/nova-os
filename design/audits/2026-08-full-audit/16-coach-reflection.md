# 16 — Coach Reflection (the nightly sit-alone)

Audited 2026-08-30. Read-only. Files opened: `server/lib/coachReflection.js`
(full, 213 lines); consumers verified at earlier items: manual run route
(workouts.js:58-63), fuelCross/adviceContext/knowledgeContext rails (01,
03), NOVA_COACH_CADENCE kill-switch shared with cadence (01). Verified this
turn: **no test file exists**; **neither coachReflection.js nor
coachCadence.js honors NOVA_DATA_DIR** (0 matches) while 44 sibling lib
files do — the exact hard-coded-path class healthInsight already fixed
with a comment naming the lesson. Deferrals: What Works page mechanics
(01), Ops surface rendering (57).

## 1. What it is (verified)

The Coach's unprompted nightly review — 03:00-05:00, once a day: a
read-only, zero-tool, strict-JSON model pass over the week whose ONLY
possible outputs are (a) up to 3 proposed learnings for the client file,
each an approval-gated Inbox record via Coach's own `learn` validator,
(b) at most ONE opened conversation via Telegram, or (c) **silence as a
first-class result** with a recorded quiet_reason (1-12, 90-102, 155-195).

- **Context** (39-88): org block, its own last reflection ("do not repeat
  it; build on it"), the knowledge pages, goals, full analytics, advice
  outcomes, fuel cross-check, watch workouts, recovery series, recent
  sessions with notes/pain/cut-short — and failures are NAMED: "(Sections
  unavailable tonight: X — do not guess at what they would have said.)"
  (86) — this builder is on the correct side of the cross-cutting
  [01→02] line.
- **Discipline in the prompt**: learnings must be NEW and durable ("a
  pattern, not a day"), empty array is a fine answer; outreach must clear
  "the single most important thing the morning brief won't already
  cover"; silence must explain itself (93-96).
- **Normalization is pure and clamped** (106-119): length floors/caps,
  kind whitelist, ≥20-char outreach bar.
- **Writes**: learnings through `validateCoachEdit('learn')` — invalid
  ones dropped, never guessed (165-181); outreach one Telegram send
  (185-191); state records the night (193).
- Model pinned, $1 budget, no-session, heartbeat, `unref` on the
  interval, lastRun daily guard, laneSkipped honoured.

## 2. Current workflow, traced

03:30: the model reviews the week — his Tuesday note "shoulder pinched
again," RPE drift flat, floor met 6/7 — returns one learning ("overhead
pressing aggravates the left shoulder at >8 RPE; incline stays clean" /
kind: avoid) and outreach null with quiet_reason "the shoulder learning is
the only new signal; the brief covers the rest." → the learning lands as a
pending Inbox card; approval appends it to What Works For Hayden with undo
(01's rail); the state records the night for tomorrow's do-not-repeat.

Failure modes, as they degrade today:
- Context sections fail → named to the model. **Honest.**
- Invalid learning → dropped silently at the validator (181) — correct
  (never guessed), though the drop count isn't in the state receipt.
- Model junk / no JSON → rejected, console error, tomorrow retries.
  **Honest** (once/day cap by lastRun means one attempt per night — no
  retry-burn, the opposite of healthInsight's problem).
- **The self-memory corrupts on outreach nights** (193 vs 49-62): the
  writer stores `outreach: sent` — a BOOLEAN — while the reader formats
  it as the message text, so the morning after any outreach the context
  reads «you reached out to him about: "true"». The comment above the
  reader claims its shape was "read from the real writer below" — and is
  wrong about its own writer. **Verified bug; the do-not-repeat loop is
  broken for exactly the output it most needs to not repeat.**
- **Telegram unconfigured → the composed outreach is discarded
  entirely** (189): not filed, not logged, and state records
  `outreach: false` so even tomorrow's reflection doesn't know it tried.
  The [09] compose-gated-on-transport family, worst variant: composed,
  then thrown away.
- **Mac asleep 03:00-05:00 → no reflection that day** (206): the window
  is two hours with no catch-up; lastRun guard makes a wider window free.
- Outreach sent → **no spokenLog receipt** ([01] family): Ask Nova
  cannot own the Coach's 3am words the next morning.

## 3. Pros — what genuinely works

- **Silence with a receipt** — quiet_reason makes "nothing worth saying"
  an auditable outcome instead of an absence. Unique in the fleet;
  should be named with the noticer loop as template material.
- **The self-memory design is right** (even though one field's plumbing
  is broken): last night's outputs ride tonight's context with an
  explicit do-not-repeat contract — *the debrief remembers*, nightly.
- **Named context failures** — third confirmed good-twin builder.
- **The output surface is exactly as narrow as doctrine wants**: three
  gated proposals, one message, or nothing; every write via an existing
  validator; the model literally cannot touch anything else.
- **One attempt per night** — no retry-burn class here at all.

## 4. Cons and gaps (ranked by real-life cost)

1. **The outreach self-memory bug** — boolean-as-message-text (verified).
   The lane's core loop (never repeat yourself) silently degrades into
   nonsense context every night after an outreach night.
2. **Composed outreach discarded without Telegram** — the most
   deliberate, highest-bar message the Coach produces can evaporate with
   no receipt anywhere.
3. **NOVA_DATA_DIR unhonored** (STATE_PATH, :23 — and coachCadence's
   twin): tests with the env override write the real data dir; the
   healthInsight fix comment is the platform's own named precedent.
4. **Two-hour window, no catch-up** — a sleeping Mac silently costs the
   night's reflection ([12] class; free fix via lastRun guard).
5. **No spokenLog receipt on sent outreach** ([01] family).
6. **Learning dedupe rides on the model + a 2600-char page clip**
   (coachKnowledge CONTEXT_BUDGET): entries beyond the clip are invisible
   to the "only if NEW" instruction — duplicate learnings become possible
   as the What Works page grows.
7. **Dropped-invalid-learning count missing from the state receipt**
   (181) — the night's record undercounts what the model actually tried.
8. **No tests** — normalizeReflection is pure and exported for exactly
   this purpose, and nothing exercises it ([11] untested-lane list).

## 5. Mission test

**Long-term: this is the mission's compounding engine for training** — the
client file grows one approved, evidence-cited line at a time, and every
future Coach conversation reasons from it. **Weekly:** the after-hours
review catches what daily surfaces miss (patterns across notes + data).
**Daily:** one high-bar outreach at most — right cadence for trust.
The mission risk is not value but *silent decay*: the memory bug, the
discarded outreach, and the sleeping-Mac window all erode the loop
invisibly rather than loudly.

## 6. Improvement plan (ranked; uncapped)

Change types: 1-5, 7, 8 REFINE; 6 gated REFINE. Nothing to add — the
lane's narrowness is its quality; nothing to remove.

1. **[Refine] Fix the outreach state shape.**
   - **Proposal:** store `outreach: sent ? reflection.outreach.slice(0,
     300) : null` (the text, as the reader already expects) plus a
     `delivered` boolean; regression test named for the boolean-as-text
     failure. Fix the reader comment while there.
   - **Doctrine:** §4 (the test that encodes the lesson); rule 7 (the
     comment claimed a contract it didn't check).
   - **Impact/effort:** H / L.
2. **[Refine] Compose-then-deliver for outreach.**
   - **Proposal:** no Telegram → file the outreach as a pending Inbox
     record (kind `coach`, informational — the fuel-cross acknowledge
     shape); when sent, log to spokenLog (the debrief's twin, one line).
     State records which path it took.
   - **Doctrine:** rules 4, 6; [09] family fix. **Impact/effort:** M-H / L.
3. **[Refine] Honor NOVA_DATA_DIR** in STATE_PATH here and in
   coachCadence.js (same edit, note the healthInsight precedent).
   **Impact/effort:** M / L.
4. **[Refine] Widen the window** to 03:00-09:00 — lastRun guard already
   makes it once-daily; data is still complete, and the do-not-cover-the-
   brief instruction handles the later-morning overlap.
   **Impact/effort:** M / L.
5. **[Refine] State receipt counts dropped learnings** (raised N of M
   proposed) so a validator-rejection streak is visible in Ops.
   **Impact/effort:** L / L.
6. **[Refine, gated] Deterministic learning dedupe.**
   - **Proposal:** GATED: before filing, exact/normalized-substring match
     of the insight against the full What Works page (read unclipped —
     it's one file); on match, drop with a state-receipt count. Fuzzy
     matching only if a real-data replay shows near-duplicates slipping
     through exact matching.
   - **Doctrine:** rule 1; confident-guess gate. **Impact/effort:** M / M.
7. **[Refine] Tests** — normalizeReflection clamps, the state round-trip
   (writer shape = reader shape — the bug that motivates it), window
   guard. **Impact/effort:** M / L-M.

## 7. UI recommendations

Where output lands: Inbox learning cards (existing), Telegram, and —
today — nowhere visible on quiet nights. Screened against dashboard
drift:

- **"Last night" line on the Ops/loops surface**: "quiet — <reason>" or
  "raised 2 learnings, reached out once". What changes: silence becomes
  trustworthy because its reason is visible; a decayed lane (con 4's
  sleeping Mac) becomes noticeable within a day instead of never. One
  line off the existing state file.
- Nothing else — the lane's outputs already land on the right surfaces.

## 8. Verdict

**Keep as-is / Refine** — doctrine-exemplary narrowness with a broken
memory pipe: the one lane built to never repeat itself currently tells
itself «"true"» about its own most important output. Highest-value next
action: **fix the outreach state shape** (plan item 1) — one line plus
the regression test the platform's method says every real bug earns.
