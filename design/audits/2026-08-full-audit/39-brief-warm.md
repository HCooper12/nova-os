# 39 — Brief Warm

Audited 2026-08-31 from the full read taken at item 05 (`server/lib/
briefWarm.js`, 107 lines — no re-read needed). Related surfaces: the
Morning Show composer (morningShow.js, structure read at 03/05), the /show
route with its evening variant (voice.js, read at 04), ttsLocal sidecar
internals [Unverified — item 47]. Deferrals: Voice screen playback (47),
the [05] sibling-composer diff (44/47).

## 1. What it is (verified)

The morning brief's audio, synthesized before he opens the app — built
from a measured incident (his 27-Aug morning, from server receipts: eight
TTS requests answered serially at 5.9-18.8s, the glass empty for six
seconds, the whole brief ~22s to arrive; the second open ~12ms from
cache): "the work is cacheable, it was simply being done at the worst
possible moment, with him watching."

- composeShow is deterministic, so the same spoken lines are produced
  ahead of time and pushed through the SAME synthesize path, filling the
  SAME cache the live request reads — a pure accelerator whose loss just
  means the old cold path.
- **Re-runs every 30 minutes across 05:00-10:00** because the brief
  derives from live data: "a re-run costs nothing when nothing changed —
  every line is a cache hit — and re-synthesizes only what actually
  moved."
- **Local engine only, deliberately**: warming is CPU on an idle Mac;
  "doing this against a paid per-character API would be spending his
  money on speech he may never hear."
- **Voice-keyed**: the request path records which voice his device
  actually asks for ("warming the wrong voice warms nothing"), no write
  on the common path.
- **Serial on purpose**: "the engine serialises anyway, and hammering it
  in parallel is what made the live path feel broken in the first place."
- **Receipt-returning**: warmMorningBrief reports lines/warmed/failed/
  voiceId "so the caller can log a receipt rather than claim success
  blindly."
- **Beat before the window check** — "a scheduler that only beats when it
  does work looks dead all afternoon, and the Guardian cannot tell 'idle'
  from 'died'." The good twin of the [22] observability findings.

## 2. Current workflow, traced

06:30 tick: local TTS confirmed → composeShow('morning') → each say-line
through synthesizeLocal serially → "brief warm: 11/11 lines ready (voice
nova)". At 07:40 he opens the app; every beat's audio starts in
milliseconds and the glass reveals beat-by-beat with no dead air. Data
that changed at 07:00 was re-warmed by the 07:00/07:30 ticks.

Failure modes:
- No local TTS / ElevenLabs chosen → skipped with the reason. **Honest.**
- A line fails to synthesize → counted in the receipt, the rest warm;
  the live path covers it cold. **Honest.**
- Whole run fails → console error; next tick retries. **Honest-ish** — a
  persistently broken sidecar means silently cold mornings return, with
  the receipt visible only in logs.
- **The Evening Debrief is never warmed**: composeShow has an evening
  variant (the /show route serves it, verified at 04) and the 21:00 open
  pays exactly the cold serial synthesis this module was built to kill —
  the 22-second incident, still live at the other end of the day.
- brief-warm is absent from Guardian's cadence list — covered by [22]'s
  derive-from-reality fix.
- TTS cache growth/pruning is the sidecar's business [Unverified —
  checked at 47].

## 3. Pros — what genuinely works

- **Incident-measured design throughout** — the module exists because of
  receipts, states them, and its three deliberate choices (serial, local,
  re-run) each carry their reason.
- **One cache, two writers** — the warm path fills exactly what the live
  path reads; no parallel cache to drift.
- **The beat-first scheduler comment** — observability honesty worth
  copying into every windowed scheduler.
- **Pure-accelerator contract** — continuity never depends on it.

## 4. Cons and gaps (ranked by real-life cost)

1. **Evening unwarmed** — the same fix, unapplied to the day's other
   brief.
2. **Persistent failure is log-only** — cold mornings can quietly return.
3. Guardian coverage + TTS cache pruning — owned elsewhere ([22], 47).

## 5. Mission test

**Daily: earns its keep invisibly** — this is the difference between the
Morning Show feeling like JARVIS and feeling like a loading screen; the
mission's "one platform he opens every day" is bought partly with these
milliseconds. No weekly/monthly claim — latency infrastructure, honestly
labelled.

## 6. Improvement plan (ranked; uncapped)

1. **[Add] Warm the evening variant.**
   - **Proposal:** the same function with `variant: 'evening'` in a
     19:00-22:00 window (own tick or the same scheduler with two
     windows); the voice-keyed cache and receipts already generalise.
   - **Impact/effort:** M / L.
   - **Verification:** evening scratch run; receipt logged; open latency
     compared per the live-measurement idiom this module already uses.
2. **[Refine] Surface persistent warm failure** — after N consecutive
   all-failed runs, one line via the ops/heartbeat rail ("brief warm has
   failed since 05:30 — first open will be slow"). **Impact/effort:**
   L / L.
3. Inherit: [22] loop-watch coverage; TTS cache pruning check at 47.

## 7. UI recommendations

- **None** — the module's whole product is the absence of a wait.

## 8. Verdict

**Keep as-is / Refine** — measured, reasoned latency infrastructure with
one obvious unapplied twin. Highest-value next action: **warm the
evening** (plan item 1) — the incident this module killed still happens
every night at 21:00.
