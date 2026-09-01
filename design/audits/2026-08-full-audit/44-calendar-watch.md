# 44 — Calendar Watch

Audited 2026-08-31. Read-only. Files opened: `server/lib/calendarWatch.js`
(full, 35 lines). The calendar spine (calendar.js, 498 lines) is covered
piecewise across earlier items — fetchEventsForDay/Range consumers (05/11/
14), the fresh TODAY card (04), the prewarm (index.js), the confirm-first
command flow (04 via voiceActions); its CalDAV client, recurrence-override
and warm-cache internals remain [mapped, not line-read] — declared to the
synthesis as the audit's one deliberately-distributed spine. Deferrals:
CalendarView UI (45/47).

## 1. What it is (verified)

The liveness poller for a push-less protocol: "iCloud CalDAV has no push,
so to make an edit made in Apple Calendar appear in an already-open Nova
we poll… and broadcast when today's events actually differ." Every line
earns its place:

- **Free at rest**: polls only while a client is listening ("no open app
  → no polling"); the on-foreground refresh owns "just opened the app" —
  this covers only "left Nova open while editing elsewhere."
- **Beat before the early return**, with the briefWarm lesson cited: "an
  idle scheduler must not be indistinguishable from a dead one."
- **Fresh fetches double as cache warming** for every other consumer.
- **Baseline-first**: the first successful poll sets the hash without a
  spurious broadcast.
- Transient CalDAV errors retry next tick; the interval is unref'd and
  the starter returns its own cleanup.

## 2. Current workflow, traced

Nova open on the desk; he drags gym to 18:00 in Apple Calendar on his
phone → within 25s the watcher's fresh fetch differs → broadcast
'calendar' → the TODAY card re-pulls (the 21-Aug glass-vs-vault lesson at
04) → the glass matches the vault.

Failure modes:
- No clients → idle, still beating. **Honest.**
- CalDAV blip → silent retry. **Honest.**
- Restart → baseline resets; a change landing exactly during the restart
  waits for the next actual change — negligible by design.
- Only TODAY is watched — an edit to tomorrow reaches Nova on foreground
  refresh instead; correct scope for the surface it serves.
- 'calendar-watch' is another beat missing from Guardian's hand list —
  [22]'s derive-from-reality fix covers it.

## 3-5. Pros / Cons / Mission

Pros: the whole module — cost-consciousness, observability honesty, and
scope discipline in 35 lines; the second site citing the beat-first
lesson (a pattern propagating on its own is a healthy codebase).
Cons: none at this size beyond the [22] inheritance.
Mission: **daily, invisible** — the glass never contradicting the vault
is a trust primitive, not a feature.

## 6-7. Improvement plan / UI

- **None proposed.** [22] inherits the coverage; nothing else clears the
  bar. UI: none — the module's product is other surfaces being right.

## 8. Verdict

**Keep as-is** — eighth clean keep, and the smallest; the agent roster
closes on a module with nothing to fix. Next: the surfaces (45 Mission
Control onward), where the standing phone-width verification rule
applies.
