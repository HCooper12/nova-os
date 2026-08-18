# Train & Fuel Redesign — Build Spec

*Hayden's feedback on mockup v1 (18 Aug 2026), captured verbatim-in-spirit as
the build contract. The mockups are the look; THIS is the list.*
*Mockups: claude.ai artifact `42577221` (v1 = label `first-direction`).*

## Keep (validated by v1)
- Coach-forward surfaces: analytics visible upfront, not behind chat
- Momentum feed (PR gold / plateau warn / streak green), each card a doorway
- Mid-session coach pane; quick-reply chips; proposal approve/leave chips
- Fuel: macro colour-coding (P cyan · C gold · F violet · kcal green) MUST
  persist everywhere; coach one-liners that do arithmetic ("54g to go —
  dinner covers 44, find 10")
- One log bar: type / photo / barcode / voice in a single field, no extra
  sections

## Build — Train
1. **Focus for today** card: meaningful, tied to today's routine (technique
   focus, the day's earned progression, the deload prescription) or a real
   mobility/recovery focus on rest days. Never filler.
2. **Jargon discipline**: every term of art (e1RM, RIR, RPE, deload,
   accumulation, "stalled") is either tap-to-explain (dotted underline →
   plain-language sheet) or not shown. Glossary component, reusable.
   "Stalled" card explains itself when opened: what plateau means, why it
   matters, what Coach suggests.
3. **Per-exercise notes**, two kinds, one tap during logging:
   - *Anomaly*: "off day, don't learn from this" — excluded from
     progression/plateau signals for that session.
   - *Feedback*: "felt strong", "grip failed first" — Coach digests these
     over time; trajectory awareness (pull-ups going well → suggest weighted
     variation or a harder progression, not just +1 rep forever).
4. **Session cut short** flow: one tap on finishing early ("out of time") →
   Coach follows up later with restructure options (fewer exercises that
   day vs shuffled split) and DISCUSSES rather than dictates.
5. **PAIN button flow**: tap → where + when (during rep / after / constant)
   → Coach responds with evidence-based options: stop, stretch/mobility
   swap, or same-muscle substitute for today; offers to log to Injury Log.
6. **Proposal decline asks why** — and Coach may push back with reasoning.
   A coach who agrees with everything is not a coach (his words). Never
   sycophantic; debate is welcome.
7. **Mobility dimension**: stretching/flexibility/mobility programming as a
   first-class training type ("Spider-Man flexibility") — routines, session
   logging, and progress that fit the existing structures.
8. **Per-exercise technique media**: tap an exercise → in-platform clip or
   diagram of correct form + variations (grip/position), with Coach
   recommending the variation that fits HIS goals. (Knowledge-base fields
   exist server-side; needs curation flow + UI.)
9. **Muscle volume intelligence**: weekly sets per muscle visible (done in
   v1) AND Coach actively flags under-volumed muscle groups vs his goals
   (arms growth priority = triceps/shoulders/biceps volume watched).
10. **Dynamic ring**: readiness ring surfaces what is RELEVANT (HRV trend,
    sleep debt, deload week) not a fixed layout. Post-workout: pull Apple
    Health workout metrics (duration, HR) automatically — likely an iOS
    Shortcut on workout-end pushing to the health endpoint — so Coach
    evaluates performance and adapts the rest of the week.

## Build — Fuel
11. **Cross-reference agent (NON-NEGOTIABLE)**: training program + goals +
    recipe rotation + food logs cross-checked continuously; surfaces
    "your rotation undershoots protein on training days" style findings
    without being asked. Candidate: extend healthInsight or a dedicated
    lane; findings land as coach one-liners + inbox proposals.
12. **Customisability without asking**: rename rotation slots, retitle
    things, reorder — direct manipulation in UI, never a request to Nova.

## Platform-wide
13. **Long-press everywhere** (Apple-grade): context menus on cards, tabs,
    meals, exercises — secondary actions surface naturally. Haptic-feeling
    (visual) response.
14. **Beauty license**: deviation from current Nova chrome is allowed where
    it improves the design. "Something still feels missing" — treat v2+ as
    permission to push further (depth, material, motion).
15. **Design history**: `design/history/` archives screenshots + notes at
    each design milestone; side-by-side "where it started vs now" always
    possible. Maintained from now on (see DESIGN-HISTORY.md).

## Phasing
- **P1**: Train Today pane (ring, focus card, today card, momentum feed,
  glossary affordance) + Fuel hero/week/rotation cards + one log bar.
- **P2**: Session logger cockpit (set pills, RIR chips, notes, PAIN flow,
  cut-short flow).
- **P3**: Coach tab (resources, proposals w/ decline-why), technique media,
  mobility dimension, cross-reference agent, Apple Health workout ingest,
  long-press system.
