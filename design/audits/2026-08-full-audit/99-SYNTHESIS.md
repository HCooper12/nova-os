# Synthesis — Nova Full-Platform Audit, August 2026

Written 2026-09-01, after all 66 roster items. Sources: the 66 item
reports, the cross-cutting findings and verdict table in 00-INDEX.md.
Everything cited here is evidence from code opened during the audit.

## 1. The platform verdict

**Nova is structurally sound and honestly built.** 66 items: 21 clean
"Keep as-is", 39 "Keep as-is / Refine", 6 "Refine" (Daily Review, Plan
Today, Training Check, Health Insight, Commander, Galaxy),
**zero Rework, zero Retire**. The doctrine is not aspirational — the
audit repeatedly found it enforced in code: the inbox rails reach every
surface including Telegram buttons; CountUp's null contract; the Code
tab's CAN/CAN'T card true claim-by-claim; the model board's
"a lane with no entry here cannot exist"; the snapshot self-proxy built
specifically to dodge the parallel-rail anti-pattern. The build culture
leaves scar tissue in comments (incidents, declined alternatives,
verified measurements) at a density that made half this audit possible.

The failures found are almost all ONE class: **the honesty machinery
exists but doesn't reach everywhere** — couldn't-check rendering as
clean, silence where a receipt should be, a hand-list drifting from the
roster it mirrors, a guard written on the dispatch side instead of the
landing side. The program below closes classes, not instances.

## 2. The ranked program of work

### Tier 0 — before anything else
1. **[30] The spawn-boundary sweep — ✅ SHIPPED 2026-09-01 (b8f70d4, live).**
   Scope proved wider than the audit found: **14** unguarded sites, not 3.
   Verified with a canary at the filesystem level, not by asking the model.
   Original finding below.

   **[30] The spawn-boundary sweep (URGENT).** `--allowedTools` is
   documentation-only under bypassPermissions (forge.js:51-53, verified
   empirically by the platform itself). healthInsight (11),
   coachReflection (16) and scanStatement (20) pass allowedTools with NO
   disallowed list — those models CAN Write and Bash today. Fix: export
   the donor constant (DISALLOWED_TOOLS, claudeCode.js:31) as a shared
   SPAWN_BOUNDARY; every spawn site composes from it; a test walks every
   lane in the model board and asserts a disallowed list is present.
   Doctrine rule 1's enforcement depends on this. Effort: S. Risk: none.

### Tier 1 — real money, real data, confirmed triggers
2. **[01] Idempotent session save — ✅ SHIPPED 2026-09-01 (f80d823, live).**
   Client stamps one clientKey per finish; the server returns the session
   already on disk and marks it `replayed`; the route skips everything
   outbound (the debrief/PR ping already fired) but still returns PRs.
   Original finding below.

   **[01] Idempotent session save** — the outbox-replay trigger is
   CONFIRMED (App.jsx:2711); a flaky finish can double-file a workout
   and double-fire PR/debrief. Copy money's *dedupeKey as exported
   contract* shape.
3. **[11] Health Insight retry cap — ✅ SHIPPED 2026-09-01 (78f2f54, live).**
   3 attempts/slot/day, counted per-day; the last failure announces itself
   Forge-style; slots now fail independently; first test file this lane has
   ever had (closes the untested-lane finding too). Original below.

   **[11] Health Insight retry cap** — the one silent failure that
   spends real money all day ($0.50/try, hourly, uncapped). Cap parity
   with review/plan (3/day) + a Forge-style failure announcement.
4. **[12]+[22] The scheduler registry — ✅ SHIPPED 2026-09-01 (d8cdc97 + cbc3b6d, live).**
   Guardian now derives its staleness watch from the ops.js roster: verified
   live at **29 loops watched, up from 13**. Five exact-day windows widened
   to open-and-stay-open (meal prep, program audit, read-next, distiller,
   CFO); the week plan is deliberately excluded — it composes for
   nextMonday(now), so a Monday run would draft the wrong week. That week-
   semantics change is the one piece of [12] still open. Original below.

   **[12]+[22] The scheduler registry build** (one PR): export ops.js's
   SCHEDULED roster (29 entries) with per-loop cadences; Guardian's
   staleness watch, the fleet ring, and fleetRosterContext consume it;
   convert the five exact-day windows (mealPrep Thursday, weekPlan
   Sunday, program-audit Monday, CFO 1st, distill Saturday) to
   Compost's age-based "run when older than cadence, tick daily" —
   immune to a slept Mac by construction. weeklyDebrief gets the
   week-offset variant.
5. **[26/33/01] The staged-pass unification** — one shared
   apply/undo helper (sandbox write → diff → prior-stamped drift
   refusal → all-files-then-write → verbatim undo record) consumed by
   distill (has it), ingest deep-weave (has NONE of it — rule 2's one
   confirmed exception), and coach applyOps (torn-write). Three write
   paths, one shape.

### Tier 2 — shared helpers that close whole families
6. **[03] The couldn't-look state** — *the three-state receipt* (18)
   grows its fourth state and lands at the 7 confirmed sites
   (fuelCross, trainingCheck, weekPlan, program audit, Guardian check,
   Ambient's GATE/room-wash, valsMission error-filter). Couldn't-check
   must never wear clean's costume anywhere.
7. **[13/17/28/29/27] The respect-the-no helper** — one shared
   cooldown + material-change re-raise contract, five consumers (both
   failure poles: eternal-no valves AND guaranteed re-nags).
8. **[24] The settle-timeout watchdog** — overnight's 8-min poll
   timeout with the honest "may still land" message, extracted for
   every spawn-and-settle lane (researcher confirmed hung-child case).
9. **[02/04/06/08] Named-absent-context helper** — Coach chat's NOTE
   pattern (name the failed sections to the model) replaces the four
   silent-swallow context builders.
10. **[10/23] Burn-on-landing sweep** — every once-per-day/week guard
    writes on the landing side, not dispatch (greeting, coach
    raise-marker, fuel-cross, follow-up dismiss); plus the server-side
    delivered-state migration for greeting + ritualDone (per-device
    localStorage class).
11. **[12/14/18/22] The twins sweep** (one PR): mondayOf ×3→1,
    WORKOUT_RE ×2→1, AISLE vs SHOPPING_CATEGORIES pin test,
    yesterday-partial logic, review-pick hash pin test, spacing
    engines pinned, codeModelOptions served from MODEL_CHOICES (62).
12. **[16/32] Path-discipline sweep** — NOVA_DATA_DIR in
    coachReflection + coachCadence; studyLane's cwd-relative
    INVENTORY_REL (likely blanking a brief section under launchd).
13. **[15/26/31] Truth-in-copy sweep** — the `|| true` filter defeat,
    "may have pruned it", Galaxy's "BRIGHTER = RECENTLY TOUCHED",
    comment-vs-code sorts. Small, cheap, and the class the platform's
    own culture most wants dead.
14. **[21/12] TIME_VALUE + config-parity sweep** — expiries for
    meal-prep/coach-audit/cfo; an off-switch for the CFO.

### Tier 3 — the surface refines that earn their place
15. **Galaxy rebuild (60)** — build-time force layout, degree sizing,
    neighbour lighting, honest cap, then the Nova-only overlays.
    The one surface Hayden himself flagged; his instinct was verified
    in code.
16. **Follow-through loops** — *the debrief remembers* rail (15)
    exported to Plan Today (06, no completion loop on the most-decided
    kind) and Daily Review (02); Training Check reconciliations count
    toward streaks (07); schedule-aware streaks.
17. **The pocket set** — Telegram non-text reply, then photo→scan
    (before voice-notes: higher frequency, the lanes already exist);
    widget top3 on large + #/leader deep-link; NovaBar's three L's.
18. **Per-item remainder** — each report's plan, in roster order;
    none blocks the tiers above.

## 3. The open questions, decided

- **Morning crowding (06/11/15):** do NOT merge the 07:00 plan and
  08:00 review into one artefact yet. Ship the cross-feed first
  (structured CHANGES → plan; plan → review context; one recovery
  fact-helper shared by the four morning voices). Merging is a one-way
  door; the cross-feed is reversible and may dissolve the problem.
  Revisit with a month of receipts.
- **Two autonomy engines ([29]/[48]):** keep both, explicitly pinned —
  they ladder different things (agent write-modes vs inbox review
  modes). One contract comment each naming the other + the shared
  decline-memory helper (Tier 2 #7) underneath both. Unification is
  not worth the migration risk today.
- **Due dates ([14]/[49]):** drop [14]'s deadline-placement idea
  honestly. The todo line has no due-date field; Todoist is already
  the deadline system of record via sync (42). Recorded here as the
  drop the brief requires.
- **Front door — Claude Code dispatch (04 plan 6):** decline direct
  dispatch from Ask Nova. The Forge IS the spoken build lane (one
  prompt → job → announced receipt); the Code tab is deliberately an
  interactive surface with its own gate. Route "build me…" asks to
  Forge; nothing new needed.
- **Galaxy local-graph (60 plan 9):** proceed, but only after force
  layout + neighbour lighting land — at that point it's centering +
  depth-2 filter, nearly free.
- **Morning composer drift ([05] dispatch vs show):** not a build —
  a check. Diff one real morning's outputs; extract shared
  fact-helpers only if they actually diverge.

## 4. The carried verification pass (do before/with Tier 1)

- **Phone-width (~375px) render pass, all 21 surfaces** — blocked in
  this audit by the browser tool; use the real phone or a resizable
  client. The memory rule stands: desktop screenshots are not
  verification.
- Study-lane inventory path under launchd (12's fix verifies it).
- On-device Scriptable render (both lock sizes).
- The review-pick hash pinning test ([05] twin).
- One real morning's dispatch-vs-show diff.

## 5. Closing

The audit found a platform whose stated method survives contact with
its own code to a degree that is genuinely rare — and whose failures
are overwhelmingly the *incomplete spread* of its own best patterns,
not their absence. Every fix above copies something Nova already does
well somewhere. Tier 0 is urgent; Tiers 1-2 are one-to-two sessions
each and close entire failure classes; nothing here is a rework.

The next audit should start where this one couldn't reach: the
phone-width pass, live-vault verification of the handful of
[Unverified] tags, and a month-later check that the respect-the-no
helper actually changed what gets re-proposed.
