# Nova OS — Design History

A visual ledger of how Nova has looked over time, so "where it started vs
where it is" is always one folder away. **Maintained from now on**: every
design milestone adds a dated folder of screenshots (390×844 phone viewport,
demo data — stable content, no personal data in the repo) plus a line here.

## How to add an entry
Capture Home / Train / Recipes at 390×844 from the deployed app into
`design/history/<date>-<label>/`, add a row below, commit.

## Ledger (newest first)

### 2026-08-18 — P1 shipped (Train TODAY pane + Fuel hero)
- The redesign's first phase is LIVE: readiness ring, focus-for-today,
  today card, momentum feed, volume-vs-goal bars, glossary system; Fuel
  protein ring + coloured macros + gap-fill coach line. Commit: see
  `git log` ("P1 of the redesign").
- No screenshots in this entry yet: these surfaces render only with live
  data, and the Pages site (public repo) must never carry personal data —
  demo mode shows the old view. Capture from a connected device into a
  PRIVATE copy, or extend demo data to cover the overview, before the next
  entry.

### 2026-08-18 — "Before the redesign" + mockup v1
- `history/2026-08-18-before/` — home.png, train.png, recipes.png: the app
  as it stood after the Coach intelligence upgrades but before any visual
  redesign. Dense card stacks, chat-at-the-bottom Coach, list-style
  rotation.
- `history/2026-08-18-mockup-v1.html` — the first redesign direction
  (readiness ring hero, momentum feed, coach-as-tab, fuel ring + honest
  week, rotation tick-cards). Hayden's feedback captured in
  `UI-REDESIGN-SPEC.md`; v2 iterates on it.

### Earlier eras (not captured — noted for the record)
- Jul–Aug 2026: the HUD era — glass cards, mono labels, cyan/gold macro
  colours, the orb core. Established `--nv-*` tokens still in use.
- Jun 2026: first build — basic dark PWA before the design language.

### 2026-08-18 — P1+P2 shipped and SCREEN-VERIFIED (bundle index-LNMWCdKo.js)
- New verification standard applied: every surface below was screenshotted
  live via the harness (local dist + real connection, SW unregistered)
  BEFORE the ship claim. Live Pages bundle hash confirmed identical to the
  verified dist.
- P1: Train TODAY tab (ring, focus card, momentum feed, volume-vs-goals
  bars), COACH tab with live-signal quick chips, Fuel hero ring + honest
  week + rotation tick-cards.
- P2: session cockpit (RIR column, WK/BO/WU set-type chips, per-exercise
  note + ANOMALY + PAIN), the full pain sheet (exercise-relevant areas,
  left/right, timing, Other… dropdown, free text, ASK COACH triage),
  finishing-early reason chips, Fuel one-bar log with inline icons.
- Private captures: `~/Desktop/nova-design-history/2026-08-18-p2/`
  (p2-pain-flow.png, p2-fuel-logbar.png) — personal data, never the repo.
