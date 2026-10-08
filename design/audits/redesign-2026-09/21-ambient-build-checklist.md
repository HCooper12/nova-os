# 21 · Ambient and Console · build checklist, blend 1 ("Hands up")

The acceptance contract for building `design/mockups/86-redesign-ambient-console-r2.html`
blend 1, his pick on 9 Oct 2026: "I like option 1". Console moves to a Home
morning card, as the same mockup draws it.

One line per element, state, orientation, motion and copy line blend 1 draws,
plus the Console card. Review furniture (the blend switch, the state chips,
the Replay and Actual size buttons, the measurement lines, the source table,
Your calls) is outside the count. The mockup's toasts ("Opens the Inbox at
this card") stand in for a navigation; the build navigates, and the line says
so. Blend 2 is not listed.

Status: `PRESENT` / `DIFFERS (why)` / `MISSING`, with the frame that proves
it, filled in after the build is photographed (frames under the session
scratchpad, `wall-build/`).

**Tally, 9 Oct 2026: 94 lines; 88 PRESENT, 6 DIFFERS, 0 MISSING.** Frames under the session scratchpad `wall-build/`; build and mockup frames side by side (`mock-*.png`).

## 1 · The wall, at rest (every orientation)

| # | Element | Status |
| --- | --- | --- |
| W1 | Black ground (#04050a), full screen, no colour wash for any state | PRESENT · p-none, p-several (measured: no gradient on the wall; test) |
| W2 | The clock, HH:MM in the rounded face, tabular, 112 pt upright | PRESENT · p-none |
| W3 | The colon breathes (opacity .3 to 1, 2 s), in ink 76% | PRESENT · p-none (the colon at rest between beats) |
| W4 | The date, "Wednesday 7 October", 15 pt semibold, ink 76% | PRESENT · p-none ("Friday 9 October", the real date; the mockup shows its demo 7 October) |
| W5 | The core: his engine, small (104 pt upright), capped at 30 frames a second | PRESENT · p-none; 104 pt; capped at 30 (measured 28.8 frames a second at 4x) |
| W6 | One serif line under the core: the tagline, 24 pt serif | PRESENT · p-none |
| W7 | The waiting block is one button: "Waiting on you" with a chevron, the count, the names line | PRESENT · p-none; one button, 244×131 |
| W8 | The count: 72 pt rounded, tabular; quiet ink at zero, gold when anything waits | PRESENT · p-none (0 in quiet ink), p-several (4 in gold) |
| W9 | The names line at zero: "Nothing waits on you" | PRESENT · p-none |
| W10 | Next readout: "Next", the time (34 pt rounded), the event's name | PRESENT · p-none |
| W11 | Steps readout: violet dot, "Steps", today's count, "of 10,000" | PRESENT · p-none |
| W12 | Protein readout: green dot, "Protein", grams with a small "g", "of 160 g" | PRESENT · p-none |
| W13 | The foot: page dots ("The glance", "Lately"), each a 44 pt target, the current one widened | PRESENT · p-none, p-lately; 44×44 measured |
| W14 | The sync label in the foot: "Synced 2 min ago" | PRESENT · p-none |
| W15 | The whole glance drifts a few points an hour (OLED) | PRESENT · source (nvWallDrift on the whole glance, 3600 s) |
| W16 | The wake lock holds the screen on, and re-acquires on return | PRESENT · source (kept unchanged from the old wall) |

## 2 · Someone is waiting (one, several)

| # | Element | Status |
| --- | --- | --- |
| A1 | The count steps up or down one at a time (a roll, 120 ms a step) | PRESENT · rise-strip (0 to 1); the roll steps 120 ms a step (source) |
| A2 | The count is a live region labelled "N waiting" | PRESENT · DOM: role=status, aria-label "4 waiting" |
| A3 | A face rises beside the count for each being with pending records: rises 14 pt and scales from .86, 450 ms strong ease-out, 70 ms apart | PRESENT · rise-strip, 8 frames 0 to 900 ms |
| A4 | Each face wears a gold badge with that being's own count | PRESENT · p-several (2, 1, 1) |
| A5 | Faces are ordered most first, the roster's order on a tie | PRESENT · p-several: CFO (2) first, then Coach and Leader by roster; test |
| A6 | At most three faces, then a "+N" chip | PRESENT · source and test (+N past three); not photographed with four beings asking |
| A7 | Each face is labelled "CFO, 2 waiting" | PRESENT · DOM aria-label "CFO, 2 waiting" |
| A8 | Leaving, a face sinks out the way it came | PRESENT · source: every face stays mounted and sinks from where it stood |
| A9 | The names line: "The Coach" (one); "The CFO, the Coach and the Leader" (three); over three, the first two and "N others" | PRESENT · p-one ("The Coach"), p-several ("The CFO, the Coach and the Leader"); test for over three |
| A10 | The waiting block's label: "Waiting on you: (names). Open your agents." | PRESENT · DOM |
| A11 | The gold light draws along the foot from the left (4 pt, 700 ms) | PRESENT · p-several, p-one (the line at the foot) |
| A12 | A gold floor glow rises from the bottom third | PRESENT · p-several |
| A13 | Gold appears nowhere else on the wall | PRESENT · p-several, p-sheet |

## 3 · Someone is working

| # | Element | Status |
| --- | --- | --- |
| K1 | Working beings' faces circle the core (32 pt upright, ring in their hue), one turn a minute | PRESENT · p-one, p-several (Researcher, Guardian in their hues) |
| K2 | A dashed orbit trail shows only while someone works | PRESENT · p-several (dashed trail only while working; p-none has none) |
| K3 | The line under the core: "Working now: the Researcher and the Guardian" (polite live region); empty when nobody works | DIFFERS · p-several: "Working now: the Guardian and the Researcher", in the roster order agentsWorking returns; the mockup listed them the other way round |
| K4 | Nobody circles without a record or a job that says so (agentsWorking.js); demo and offline circle nobody | PRESENT · test (demo and offline circle nobody); p-demo-off |

## 4 · No signal

| # | Element | Status |
| --- | --- | --- |
| N1 | The count becomes a dashed grey circle, labelled "No signal" | PRESENT · p-off |
| N2 | The names line: "No signal from the Mac · last synced N min ago" | PRESENT · p-off. In demo mode it says "Demo mode has no agents to read" instead (p-demo-off): there is no Mac to have lost |
| N3 | No gold, no faces, no orbit; the core goes grey | PRESENT · p-off (grey core, no gold, no faces) |
| N4 | The foot says "Last synced N min ago" | PRESENT · p-off |

## 5 · Lately (page two; the band on the Mac)

| # | Element | Status |
| --- | --- | --- |
| L1 | "From the pulse": one headline in 20 pt serif, "source · changes every two minutes" | PRESENT · p-lately; rotation every two minutes (source) |
| L2 | "Lately": the newest receipts, each "label" over "N ago" | PRESENT · p-lately |
| L3 | Training streak: pips and "4 sessions in a row" (only when real) | PRESENT · p-lately |
| L4 | Protein month: a meter and "12 of 21 days this month" (only when real) | PRESENT · p-lately |
| L5 | Steps streak: violet pips and "6 days at the floor" (only when real) | PRESENT · p-lately |
| L6 | Swipe between the glance and Lately (60 pt or a flick; rubber band at the ends); the dots also go | PRESENT · p-lately via the dot; the swipe is source only (not driven by real touch here) |

## 6 · The way out, and the controls

| # | Element | Status |
| --- | --- | --- |
| X1 | A tap anywhere shows the controls: Done, Dim and Agents, glass pills, 44 pt | PRESENT · p-one-ctl; Done 73×44, Dim 64×44, Agents 87×44 |
| X2 | They fade after five seconds and come back on any touch | DIFFERS · p-one-ctl: the controls show on ARRIVAL for five seconds and then fade (the brief's visible exit), and come back on any tap; the mockup hid them until the first tap |
| X3 | "Tap for controls" hint on arrival (phone), fades after 2.6 s | DIFFERS · the hint shows when the controls first fade (after five seconds), not at the first frame, because the controls are already showing then |
| X4 | Done returns to the page he came from; Back from there never reopens the wall | PRESENT · measured: #/mission → #/index → #/ambient → Done lands on #/index; Back from there lands on #/mission, never the wall |
| X5 | Esc leaves on the Mac (closes the sheet first if it is open); the "esc" key hint sits beside Done on the Mac | PRESENT · m-several (esc key hint); Esc closes the sheet first (measured), then leaves (same handler) |
| X6 | A swipe down leaves (upright) | PRESENT · source (a downward drag of 90 pt on the glance, upright); not driven by real touch here |
| X7 | A bump never ends the wall | PRESENT · measured: a tap on the wall shows the controls and stays on #/ambient |
| X8 | Dim lays a black veil (55%); the core holds still while dimmed; Dim is pressed while on | PRESENT · source; Dim is aria-pressed; the core gets still while dimmed; a night dim 22:00 to 06:00 (round 1 pick) |
| X9 | The wall arrives with a short scale-and-fade (320 ms) | PRESENT · source (nvWallArrive 320 ms) |

## 7 · The sheet ("Your agents")

| # | Element | Status |
| --- | --- | --- |
| S1 | Tapping the count, or Agents, opens it | PRESENT · p-sheet (count), m-sheet (Agents) |
| S2 | Upright it rises from the foot (74% tall) over a 50% scrim; on a stand and the Mac it comes in from the right edge (380 / 440 wide) | PRESENT · p-sheet (74% from the foot), l-several (380 from the right), m-sheet (440) |
| S3 | A grabber (upright); the sheet follows a drag down and closes past 90 pt or a flick | PRESENT · p-sheet (grabber); the drag is source only |
| S4 | The scrim closes it; so do Close and Esc | PRESENT · measured: Esc closed it; scrim and Close are wired (source) |
| S5 | The head: "Your agents" (24 pt bold) and a Close pill | PRESENT · p-sheet |
| S6 | The sentence (17 pt serif): "Nothing is waiting on you." / "The Coach is asking you one thing." / "Four things wait on you: 2 from the CFO, 1 from the Coach and 1 from the Leader." | PRESENT · p-sheet ("Four things wait on you: 2 from the CFO, 1 from the Coach and 1 from the Leader."), sheet-strip ("The Coach is asking you one thing.") |
| S7 | Each waiting being: its hue bar at the left, its face (40), its name in its hue, "Money · Two things waiting on you." | PRESENT · p-sheet |
| S8 | Its asks, three at most: gold dot, title, when, chevron, 48 pt rows; each opens the Inbox at that card | PRESENT · p-sheet; 48 pt rows; each opens the Inbox at that card (App.wallOpenInbox, the deep link's own expand) |
| S9 | "N more in the Inbox" when it has more than three | PRESENT · source and test |
| S10 | "Nothing is waiting on you." when none | PRESENT · source (none waiting) |
| S11 | Yours to sort (his own captures) and records with no being yet, counted in the number and named here | PRESENT · test (1 of his own, 1 unfiled, counted and named); not photographed |
| S12 | "Working now": faces (30) with names, or "Nobody is working right now." | PRESENT · p-sheet-all |
| S13 | "All ten": a five-column grid of faces (36), a gold badge on whoever asks, a turning dashed ring on whoever works, quiet ones faded by freshness (0, .35, .62) | PRESENT · p-sheet-all (badges, two turning rings, Librarian at .65, Practice at .38) |
| S14 | Each face in the grid is a button labelled "Name. Its line."; tapping it shows "Name · its line" under the grid | PRESENT · p-sheet-all ("Researcher · Working now.") |
| S15 | The caption at rest: "Tap a face to hear how it is doing." | PRESENT · sheet-strip |
| S16 | The foot: "Open the Inbox" (the one light pill) and "Talk it through" | PRESENT · p-sheet. "Talk it through" opens Nova with the asks as his question and sends it, as the house talkAboutInbox does |
| S17 | No signal: "Nova cannot reach the Mac, so nobody's asks or work can be read. The wall will fill in when it answers." | PRESENT · source; not photographed |

## 8 · Orientations

| # | Element | Status |
| --- | --- | --- |
| O1 | Upright 390×844: one column, clock and date at the top, the core in its orbit, the serif line, the waiting block, the three readouts | PRESENT · p-none, p-several (390×844; scrollWidth 390) |
| O2 | On a stand 844×390: StandBy's shape, the time (124 pt), the date and the core (58) with its working line on the left; the serif line, the waiting block and the readouts on the right; dots and sync in one row at the foot | PRESENT · l-glance (844×390; scrollWidth 844; nothing below 315 pt of 390) |
| O3 | The MacBook 1280×800: clock 170 pt, core 84, count 104; the first two asks under the count with their face (28) and "and N more · tap the count"; a band at the foot with the pulse, Lately and the streaks; sync bottom right; controls always shown | PRESENT · m-several (1280×800; band ends at 764) |
| O4 | Nothing is cut off and nothing scrolls sideways in any of the three | PRESENT · measured scrollWidth = width in all three; no object past the edge |

## 9 · Colour, motion, access

| # | Element | Status |
| --- | --- | --- |
| C1 | Each being wears its own hue (src/agentWorld/beings.js); the faces are still portraits of the 3D beings, so the wall runs no WebGL | PRESENT · portraits rendered once by scripts/agent-sheet/portraits.mjs into public/agents (the mockup drew flat stand-ins and named this as the intent) |
| C2 | All clear is quiet ink; no signal is grey with words; red appears nowhere | PRESENT · p-none, p-off |
| C3 | Reduced motion: the colon holds, the orbit and drift stop, faces and badges cross-fade in place, the count jumps, the sheet fades, the light fades in, the core is one still frame | PRESENT · source (@media prefers-reduced-motion block); not photographed, the devtools here cannot emulate it |
| C4 | Reduced transparency: the sheet and the pills are solid | PRESENT · source; not photographed |
| C5 | The hidden tab-bar orb stops drawing under the wall | PRESENT · measured: under the wall only the wall's canvas draws (the dock orb holds a still frame) |
| C6 | Every control 44 pt | PRESENT · measured on every wall control: 44 pt or more |

## 10 · Console, as a Home morning card

| # | Element | Status |
| --- | --- | --- |
| H1 | On the summary Home, a card "Your day, drawn" with "1 of 5" at the right of its head | PRESENT · c-1 ("1 of 5") |
| H2 | One instrument at a time: swipe, previous and next chevrons (44 pt), five dots | PRESENT · c-1..c-5; chevrons and dots 44×44 measured |
| H3 | Recovery (cyan): "Heart-rate variability"; a serif line ("Recovered: 6% above your usual."); the HRV in ms; his usual band with today's mark | PRESENT · c-1 |
| H4 | Today: "N blocks"; "One long block, at 15:30."; the 24-hour ring, hour ticks, 06 / 12 / 18, the blocks as arcs, the longest ahead lit, a dot at now, its time and name at the centre | PRESENT · c-strip |
| H5 | Steps (violet): "Floor 10,000 a day"; a serif line; today's count; the week's bars against the dashed floor, a missing day dashed, today outlined | PRESENT · c-strip |
| H6 | Training: "N exercises"; "(Session) today."; the muscles as chips in their own hues; the streak, "sessions in a row" | PRESENT · c-strip |
| H7 | Protein (green): "Plan 165 g"; a serif line; grams of the plan; the bar with the floor marked | PRESENT · c-strip |
| H8 | Every instrument has a VoiceOver label naming every bar, block and band | PRESENT · DOM: four role=img labels, every bar, block and band named |
| H9 | Bars rise, arcs draw, bars grow as each instrument comes in; under reduced motion they fade | PRESENT · source (played each time an instrument comes in); reduced motion fades |
| H10 | The foot line: "Until 11:00, or until you have seen all five. Pin it from Edit to keep it." | DIFFERS · c-1: the line sits inside the card beside Read again; the mockup set it under the card |
| H11 | Shows 05:00 to 11:00 or until all five are seen; pinnable from Edit as "Your day" | PRESENT · measured: after all five were seen the next visit to Home had no card; pinned, it sat in the Pinned grid |
| H12 | Read again, present and working, in every state (loading skeleton, nothing read, error) | DIFFERS · c-1: Read again is a 44 pt pill in the card's foot (the mockup drew none; the brief and audit §7 ask for it). Measured working (one call); loading draws a skeleton, nothing read and error say so beside it. In demo mode it is absent and the card says demo has nothing to draw (c-demo) |
| H13 | The cupertino Home is untouched (guard-cupertino prints "unchanged") | PRESENT · guard-cupertino: "cupertino Home unchanged" |
| H14 | `#/console` and its Index row are gone; the Mac sidebar row too | PRESENT · test yourDay.test.js |
| H15 | The glass still raises the instruments while the brief is spoken | DIFFERS · StageCard untouched, but the glass instruments now wear Home's hues too (recovery cyan, steps violet, protein green), per audit §8 |

## 11 · Measured (9 Oct 2026, demo mode, 390×844, 4x CPU, 10 s, dev build)

| | Before (b33c98f) | After |
| --- | --- | --- |
| Page frames a second | 58.2 | 119.8 (the display's rate) |
| Cores drawing under the wall | 2 (the wall's at 58.2, the hidden dock orb at 58.2) | 1 (the wall's, at 28.8; the dock orb holds a still frame) |
| Canvas calls a second | 2,032,134 | 504,889 |
| Long tasks | 0 | 0 (17, 1,460 ms, before the wall stopped rendering every second; fixed in 823ced3) |

Network: every non-GET fetch, XHR and beacon was guarded; none was attempted. The pending and classifying records on screen were invented and fed into the running app's view model, never the server.
