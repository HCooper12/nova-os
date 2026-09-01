# 41 — Reminders

Audited 2026-08-31. Read-only. Files opened: `server/lib/reminders.js`
(full, 211 lines); the capture-rail entry (classifier route 'reminder'
with future-time resolution, verified at item 04's inbox-contract read).
Deferrals: the reminder card/filing receipt rendering (48).

## 1. What it is (verified)

"The lowest-friction promise Nova can keep" (7-13): "remind me at 4pm to
call the bank" rides the capture rails; filing creates BOTH a local nudge
(push + Telegram at fire time) and — credentials permitting — **a real
VTODO with an alarm in his iCloud Reminders**, "so the phone, watch and
HomePod all fire natively even while this Mac sleeps." The Apple write is
best-effort BY DESIGN: no credentials or a CalDAV hiccup "degrade to the
local nudge, never to silence, and the record says which happened"
(appleError stored honestly).

Mechanics: locked atomic store; minute-tick firing; proper VTODO with
escaping and a DISPLAY alarm; the VTODO-capable list found once per
process with error-reset; removal deletes the Apple copy best-effort with
the undo contract stated ("the local removal is what undo promised; the
Apple copy may linger"); **fired reminders older than 30 days prune
quietly** — the retention hygiene most siblings lack, built in.

## 2. Current workflow, traced

"Remind me at 4pm to call the bank" → classifier → route reminder,
whenISO resolved to the future → approve → entry stored + VTODO lands in
his Reminders list → 16:00: the watch taps natively (Mac state
irrelevant); the Mac, if awake, also pushes and Telegrams → status fired
→ pruned a month later.

Failure modes:
- No iCloud creds / CalDAV down → local-only, recorded as such. **Honest.**
- Mac asleep at fire time → the Apple alarm carries it natively — the
  sleeping-Mac class solved the same way as the health drops (native
  platform as the store-and-forward). **The design's whole point.**
- Remove after Apple push fails → local promise kept, lingering Apple
  copy acknowledged. **Honest.**
- **The local nudge fires stale on wake**: `when <= now` with no age
  check — a Mac that slept through 16:00 sends "⏰ call the bank" at
  23:00, hours late, phrased as current. The Apple alarm already fired
  correctly; the late local echo is the one dishonest beat.

## 3. Pros — what genuinely works

- **Native-platform delegation** — the alarm that must fire while the
  Mac sleeps is handed to the device that never does; the local nudge is
  the bonus, not the backstop. The right architecture in 211 lines.
- **Degradation with a receipt** (appleError) — which path worked is
  recorded fact.
- **Built-in pruning** — the only lane in the audit that ships its own
  retention.
- **Undo scope honesty** — the remove comment states exactly what undo
  promised and what may linger.

## 4. Cons and gaps (ranked by real-life cost)

1. **Stale late-fires phrased as current.**
2. Nothing else. Rejected candidate: recurring reminders — the calendar
   and Todoist rails own recurrence; duplicating it here would be a
   parallel rail.

## 5. Mission test

**Daily: earns its keep** — a spoken sentence becomes a wrist-tap at the
right moment with zero further attention; the definition of low-friction
time support. No larger cadence claimed; correctly a utility.

## 6. Improvement plan (ranked; uncapped — one item by honest assessment)

1. **[Refine] Late-fire honesty.**
   - **Proposal:** at fire time, if `now - when` exceeds ~90 minutes,
     phrase both channels as a missed reminder ("⏰ from 16:00, missed
     while the Mac slept: call the bank") — the Apple alarm already
     covered the live moment; the echo's job is honest catch-up.
   - **Doctrine:** rule 4. **Impact/effort:** M-L / L.
   - **Verification:** unit test the age branch; scratch fire with a
     back-dated entry.

## 7. UI recommendations

- **None** — the surfaces are the native alarm, a push, and a Telegram
  line; all already correct.

## 8. Verdict

**Keep as-is** — sixth clean keep; the right architecture at the right
size with one phrasing fix. Highest-value next action: late-fire honesty,
whenever the file is next open.
