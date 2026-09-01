# 29 — Trust Ladder (autonomy)

Audited 2026-08-31. Read-only. Files opened: `server/lib/autonomyLedger.js`
(full, 178 lines); the agent-mode filer and Ops ledger view [Inferred from
route/consumer names — apply/undo to be pinned at item 57/48]. Tests:
autonomyLedger.test.js exists (pure ledgerRow/verdict exported for exactly
this). Deferrals: Ops screen ledger rendering (57).

## 1. What it is (verified)

Doctrine rule 6, made executable (4-15): autonomy is EARNED from real
history and PROPOSED, never assumed. Entirely deterministic — "the
thresholds are the judgment, reviewed here once, in code, instead of
per-draft forever."

- **The ledger** (71-86): per target, 90 days of records → made /
  approved / auto / rejected / aged-out / undone / pending.
- **The verdict, bidirectional** (90-112): a draft gate with ≥14 settled
  records, ZERO approvals, and ≥80% dead (aged-out + rejected) → propose
  auto ("the gate here is friction without judgment"); an auto lane with
  ≥30% of its filings undone → propose draft ("trusted too soon"). Both
  directions stated as mattering in the header.
- **Targets registry** (25-68): the three dispatch slots, Daily Review,
  Plan Today, session receipts — each with getMode/setMode; Training
  Check honestly row-only ("no mode config exists yet — and therefore
  never proposed").
- **Proposals** (127-159): at most 3, skip targets already pending,
  `mode: 'review-all'` — "an autonomy change is ALWAYS his call" — with
  the evidence counts in the reason; applied deterministically by the
  agent-mode filer on his yes. Sunday ≥18:00, weekly guard.

## 2. Current workflow, traced

Sunday evening: 90 days show the evening debrief drafted 19 times — 0
approved, 16 aged out, 2 discarded, 1 pending → verdict: auto → one
pending card: "Earned autonomy: Evening debrief → auto. 19 drafted in 90
days: 0 approved by you, 16 aged out unread, 2 discarded. The gate here
is friction without judgment…" → his yes flips the mode; every future
debrief auto-files (undoable) and arrives as a Telegram message instead
of a chore. Months later, if he starts undoing what auto filed, the same
engine proposes the demotion.

Failure modes, as they degrade today:
- Thin evidence → no verdict (MIN_SAMPLE). **Honest.**
- Config unreadable → target skipped. **Honest.**
- Target already pending → skipped. **Honest.**
- **A declined proposal returns every Sunday**: nothing records the "no"
  — `alreadyPending` blocks only pending records, and the same evidence
  produces the same verdict weekly. The engine built to respect his
  judgment nags him with it ([13]/[17]/[28] family — now FOUR sites; the
  shared respect-the-no helper writes itself). **Verified; weekly nag.**
- **The registry has drifted** ([22] hand-list class): the Weekly Debrief
  HAS a mode config (off/draft/auto, verified at 15) and is absent from
  AUTONOMY_TARGETS — its gate can never earn auto; meal-prep and the CFO
  lack modes entirely (21's config-parity finding), so the ladder can't
  reach the lanes that most obviously age out unread.
- Sunday-evening equality gate → [12] class, site #8.

## 3. Pros — what genuinely works

- **The doctrine sentence is the architecture**: earned from real
  history (the ledger IS the receipts), proposed never assumed
  (review-all), an agent never changes its own autonomy (this engine
  isn't an agent target and applies nothing without his yes).
- **Bidirectionality** — the demotion verdict is what makes promotion
  trustworthy; most autonomy systems only ratchet up.
- **Evidence strings carry the actual counts** — the proposal argues
  from the ledger, not vibes.
- **Zero-approvals as the promotion bar** — one approval in twenty means
  the gate caught something he wanted; deliberately conservative and
  right.
- **Pure verdict/ledgerRow exported for tests** — the judgment is
  testable in isolation, and tested.

## 4. Cons and gaps (ranked by real-life cost)

1. **No decline memory** — a weekly re-nag from the manners engine
   itself; the family's worst instance because the cadence is guaranteed.
2. **Registry drift** — the ladder can't see the Weekly Debrief's
   existing mode, and can't ever reach mode-less lanes; no note-the-twin
   tells a new lane to register.
3. **Sunday gate** ([12]).
4. **Agent-mode apply/undo unpinned here** — [Inferred] working; deserves
   the round-trip test when touched.

## 5. Mission test

**Long-term: this is the trust economy's central bank** — it converts his
real decision history into calibrated autonomy, which is what lets the
fleet grow without growing his review burden. **Weekly:** at most three
evidence-bearing cards on a Sunday evening. **Daily: n/a** — its effect
is that daily surfaces quietly match his actual engagement. The mission
risk is the same as 28's: a manners engine with one bad manner (con 1)
spends the exact trust it exists to build.

## 6. Improvement plan (ranked; uncapped)

Change types: all REFINE.

1. **[Refine] Decline memory — and the shared respect-the-no helper.**
   - **Proposal:** a declined `autonomy` record for a target imposes a
     60-day cooldown; re-proposal only when the evidence has materially
     moved (≥25% more settled records, or the ratio worsened), with the
     history in the reason ("you declined this in July at 16 aged-out;
     it's now 24"). Build it as the shared helper the four family sites
     ([13] foodSuggest, [17] program review, [28] pattern scout, here)
     all need — one cooldown+material-change utility, four consumers.
   - **Doctrine:** rule 6; the synthesis-level fix landing at its worst
     site first.
   - **Impact/effort:** H / M (as the shared helper; L for this site
     alone).
   - **Verification:** unit tests on the cooldown; replay against his
     real records.
2. **[Refine] Registry completeness + the twin note.**
   - **Proposal:** add the Weekly Debrief target (config exists); add
     row-only entries for meal-prep/CFO so the Ops ledger at least SHOWS
     their history (their mode configs are 21/12's plans); comment in
     each mode-config module naming AUTONOMY_TARGETS as the registry to
     join ([22] derive-from-reality is the deeper fix if configs ever
     standardise).
   - **Impact/effort:** M / L.
3. **[Refine] Widen the Sunday window** (or adopt Compost's age-based
   shape). **Impact/effort:** L / L.
4. **[Refine] Pin the agent-mode apply/undo round-trip** in a test.
   **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the autonomy proposal cards, the Ops ledger view.
Screened against dashboard drift:

- **None here** — the card carries its evidence, and the Ops ledger's
  rendering is item 57's pass. The decline-memory history line (plan 1)
  rides the existing reason text.

## 8. Verdict

**Keep as-is / Refine** — doctrine rule 6 as working code, bidirectional
and evidence-bearing; its one real flaw is a guaranteed weekly re-nag
after a "no". Highest-value next action: **decline memory as the shared
respect-the-no helper** (plan item 1) — fixing the family's worst site
and its other three consumers in one build.
