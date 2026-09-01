# 61 — Ambient (wall mode)

Audited 2026-09-01. Read-only. Files opened: `src/screens/Ambient.jsx`
(1-143, full), `src/vals/valsOps.js:160-254` (the ambient slice; rest of
file read at 57), `src/CountUp.jsx` (null contract), App.jsx:616 (sync
cadence), 731-734 (scroll opt-out), valsChrome.js:52 (palette entry).
Phone-width carried ([45]) — though this surface is Mac-first.

## 1. What it is (verified)

"Nova as presence, not app" — a near-black fullscreen wall face: the
clock, the core breathing, the tagline, four tiles (NEXT calendar event
/ STEPS / PROTEIN with its floor / GATE pending count), real-streaks
objectives row, the rotating PulseStrip ("absent cache, absent strip"),
and the StreamStrip of the newest 3 real receipts ("presence proves
itself with the actual ledger; a quiet system shows a quiet strip,
never a looping animation" — anti-fiction stated AND kept). Tap
anywhere returns. Best-effort wake lock with visibility re-acquire and
an honest fallback comment (24-25). Reached from the palette.

## 2. Workflow traced

Palette → "Ambient mode — Nova on the wall" → fullscreen; the room
reads state before numbers: gold radial wash when something waits on
him, cyan when the board is clear (68-70, 2s transition), the same
signal as the GATE tile ("awaiting your yes"). Data rides the app's
5-minute refreshLiveData loop (App.jsx:616); the clock ticks locally
every second.

## 3. Pros

- The header promise "missing data shows as an em dash, never
  invented" is mostly kept, and CountUp enforces it structurally:
  "never invents a value (null stays null)" → null renders '—'
  (CountUp.jsx:7,35).
- The human gate ON THE WALL — pending-approval count as one of four
  numbers Nova shows the room — is earned-autonomy doctrine made
  spatial.
- Objectives only render real streaks (filter(Boolean), ≥1d); the
  pulse strip reads only what the nightly runs actually fetched.
- Wake lock, safe-area insets, scroll-restore opt-out, greet
  suppression on this screen (App.jsx:4397) — the edges are thought
  through.

## 4. Cons

1. **GATE's caption conflates couldn't-check with clear — the [03]
   family on the wall.** With ops data absent, `ambientPending` is
   null; the NUMBER honestly shows '—', but the sub is
   `pending > 0 ? 'awaiting your yes' : 'clear'` (Ambient.jsx:89) and
   the accent goes green — and `ambientState` (valsOps:197) reads
   `(ops?.pending ?? 0) > 0`, so the whole room washes CYAN/CLEAR when
   the server is unreachable. A dead backend and a clear board are
   indistinguishable from across the room.
2. **No staleness self-label on a leave-it-running surface.** The
   5-minute sync bounds normal staleness fine, but if sync starts
   failing the tiles freeze at their last values indefinitely — a wall
   that's been wrong for three hours looks identical to a live one.
   Everywhere else stale data self-labels; the one screen designed to
   run unattended for hours has no "synced Xm ago" and no dimming.
3. Minor: NEXT/steps recompute only on App re-render, so a passed
   event can linger as "NEXT" up to one sync cycle (~5min) —
   acceptable, noted not planned.
4. Minor: static near-black layout on an OLED left on for hours —
   burn-in has no mitigation.

## 5. Mission test

**Continuous/ambient cadence: earns its keep** — the glanceable board
(gate, next, streaks, protein) is the mission's daily numbers made
environmental, and the gold/cyan room-state is genuinely useful from
across a room. The two cons are precisely about keeping that glance
trustworthy at the hours-long cadence the surface exists for.

## 6. Improvement plan

1. **[Refine — honesty, [03] site]** ops absent → GATE sub '—'/neutral
   accent, and `ambientState` gets a third value ('unknown' → no wash,
   or a faint warn tint) so couldn't-check never reads as clear.
   **Impact/effort:** M / L.
2. **[Refine — honesty]** A faint sync-age line (e.g. bottom corner,
   `dim(24)`); past ~15min of failed syncs the tiles dim and it says
   "last synced 23m ago". Stale self-labels, wall edition.
   **Impact/effort:** M / L.
3. **[Add]** Slow pixel-drift (a few px translate on a ~1h cycle) for
   OLED burn-in. **Impact/effort:** L / L.
4. **[Empty categories]** No capability-gap items — a wall face should
   not grow features (dashboard-drift screen applied: the four tiles +
   two strips are already the right ceiling). REFINE beyond the above:
   none.

## 7. UI recommendations

Items 1-3 are the UI plan. Explicitly rejected: more tiles, charts, or
rotating "insights" — the restraint here ("a quiet system shows a
quiet strip") is the design's best quality and drift's first target.

## 8. Verdict

**Keep as-is / Refine** — a genuinely well-judged surface whose two
real gaps are the same gap: the honest-degradation discipline the
tiles' NUMBERS have (via CountUp's null contract) never reached the
captions, the room wash, or the passage of time.
