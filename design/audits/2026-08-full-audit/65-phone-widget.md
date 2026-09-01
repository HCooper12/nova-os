# 65 — Phone widget (Scriptable)

Audited 2026-09-01. Read-only. Files opened: `widgets/nova-widget.js`
(1-152, full), `server/routes/snapshot.js` (1-157, full — the /widget
payload AND the snapshot self-proxy machinery). Phone-width n/a (native
widget); on-device render [Unverified — Scriptable runs on his phone].

## 1. What it is (verified)

An iPhone home + lock-screen widget via Scriptable: the day at a glance
(steps, protein, kcal, next event, gate count) plus today's leadership
idea, fed by one tiny bearer-authed `/api/widget` payload over
Tailscale. Setup is a documented 2-minute paste, with the token rule
stated where it matters: "NEVER paste your real token into this file in
the repo: nova-os is a PUBLIC repo" (8-10) — the token lives only in
Scriptable.

## 2. The design ideas, verified

- **"SIZES render different truths, because a small widget that tries
  to say everything says nothing"** (20-25): small = numbers; medium/
  large = numbers + the idea; lock rectangular = the idea alone; lock
  inline = its title alone. Content per honest capacity.
- **"The failure must name itself. A blank widget and an unreachable
  Mac look identical otherwise"** (131-133) → "Mac unreachable — last
  sync unknown". Nulls render as '—'; a "synced HH:MM" footer stamps
  every render; steps borrowed from an earlier day self-label "as of
  ⟨date⟩" (97-99, backed by the server's stepsDate contract, 73-75).
- Lock-screen sizes skip the painted background ("the system tints
  them — painting one makes it a dark smudge", 59-60).
- Server side, every slice fails independently to null ("absent data
  is null, never a made-up zero"), and the calendar is raced against
  5s "or the slot is honestly null" (93-99) — the widget always
  answers inside iOS's patience.
- Same file: the snapshot **self-proxy** (3-11) — one round-trip
  replacing ~25, built by calling this server's own endpoints over
  localhost ("duplicating every route's response-building here would
  be the 'parallel rail' anti-pattern — shapes had already diverged on
  the first attempt"), with SLICES exported so a test can catch typo'd
  refresh tags, per-slice budgets via a Symbol sentinel that "can
  never be confused with a real payload", and `?only=` that drops
  unknown names instead of 400ing so an older client still syncs.
  Doctrine as plumbing, end to end.

## 3. Pros / Cons

Pros: all of §2; GATE goes gold when >0 (the Ambient tile's sibling);
tap opens the app.

Cons:
1. **Dead payload fields**: the server builds `top3` + `planStatus`
   (snapshot.js:104-109) but no widget size renders them — cost paid
   on every refresh, value delivered never. Either the large family
   shows the top 3 (real value: the day's plan on the home screen) or
   the fields go.
2. Tap target is always the app root — the lock-screen sizes, which
   show ONLY the leadership idea, could deep-link to #/leader.
3. No `refreshAfterDate` hint; iOS's default 15-30min cadence applies
   (documented honestly at 16). Noted only.
4. Protein/kcal render 0 (not '—') when today's log is empty — "0
   logged so far" is arguably the truth; observation, no change
   proposed.

## 5. Mission test

**Daily, glance cadence: earns its keep strongly** — the five numbers
he steers the day by, plus the leadership idea on the lock screen (the
Leader's repetition loop reaching the surface he sees most often),
with honest staleness at every layer. This is the mission working at
zero interaction cost.

## 6. Improvement plan

1. **[Refine]** Large family renders the top 3 (payload already ships
   it) — or delete the dead fields from /widget. **Impact/effort:**
   M / L.
2. **[Add]** Deep-links per size: idea-only sizes → #/leader.
   **Impact/effort:** L / L.
3. **[Empty categories]** No other ADD/REFINE — the sizes-render-
   different-truths rule is the right ceiling; more numbers would
   break it.

## 7. UI recommendations

Plan 1-2 are the UI items. On-device render check belongs to the [45]
verification pass (Scriptable preview via `presentMedium` exists for
exactly this).

## 8. Verdict

**Keep as-is / Refine** — the platform's honesty rules survive
translation to a third-party runtime intact; one dead payload field
pair and one missing deep-link are everything found.
