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

## 1 · The wall, at rest (every orientation)

| # | Element | Status |
| --- | --- | --- |
| W1 | Black ground (#04050a), full screen, no colour wash for any state | |
| W2 | The clock, HH:MM in the rounded face, tabular, 112 pt upright | |
| W3 | The colon breathes (opacity .3 to 1, 2 s), in ink 76% | |
| W4 | The date, "Wednesday 7 October", 15 pt semibold, ink 76% | |
| W5 | The core: his engine, small (104 pt upright), capped at 30 frames a second | |
| W6 | One serif line under the core: the tagline, 24 pt serif | |
| W7 | The waiting block is one button: "Waiting on you" with a chevron, the count, the names line | |
| W8 | The count: 72 pt rounded, tabular; quiet ink at zero, gold when anything waits | |
| W9 | The names line at zero: "Nothing waits on you" | |
| W10 | Next readout: "Next", the time (34 pt rounded), the event's name | |
| W11 | Steps readout: violet dot, "Steps", today's count, "of 10,000" | |
| W12 | Protein readout: green dot, "Protein", grams with a small "g", "of 160 g" | |
| W13 | The foot: page dots ("The glance", "Lately"), each a 44 pt target, the current one widened | |
| W14 | The sync label in the foot: "Synced 2 min ago" | |
| W15 | The whole glance drifts a few points an hour (OLED) | |
| W16 | The wake lock holds the screen on, and re-acquires on return | |

## 2 · Someone is waiting (one, several)

| # | Element | Status |
| --- | --- | --- |
| A1 | The count steps up or down one at a time (a roll, 120 ms a step) | |
| A2 | The count is a live region labelled "N waiting" | |
| A3 | A face rises beside the count for each being with pending records: rises 14 pt and scales from .86, 450 ms strong ease-out, 70 ms apart | |
| A4 | Each face wears a gold badge with that being's own count | |
| A5 | Faces are ordered most first, the roster's order on a tie | |
| A6 | At most three faces, then a "+N" chip | |
| A7 | Each face is labelled "CFO, 2 waiting" | |
| A8 | Leaving, a face sinks out the way it came | |
| A9 | The names line: "The Coach" (one); "The CFO, the Coach and the Leader" (three); over three, the first two and "N others" | |
| A10 | The waiting block's label: "Waiting on you: (names). Open your agents." | |
| A11 | The gold light draws along the foot from the left (4 pt, 700 ms) | |
| A12 | A gold floor glow rises from the bottom third | |
| A13 | Gold appears nowhere else on the wall | |

## 3 · Someone is working

| # | Element | Status |
| --- | --- | --- |
| K1 | Working beings' faces circle the core (32 pt upright, ring in their hue), one turn a minute | |
| K2 | A dashed orbit trail shows only while someone works | |
| K3 | The line under the core: "Working now: the Researcher and the Guardian" (polite live region); empty when nobody works | |
| K4 | Nobody circles without a record or a job that says so (agentsWorking.js); demo and offline circle nobody | |

## 4 · No signal

| # | Element | Status |
| --- | --- | --- |
| N1 | The count becomes a dashed grey circle, labelled "No signal" | |
| N2 | The names line: "No signal from the Mac · last synced N min ago" | |
| N3 | No gold, no faces, no orbit; the core goes grey | |
| N4 | The foot says "Last synced N min ago" | |

## 5 · Lately (page two; the band on the Mac)

| # | Element | Status |
| --- | --- | --- |
| L1 | "From the pulse": one headline in 20 pt serif, "source · changes every two minutes" | |
| L2 | "Lately": the newest receipts, each "label" over "N ago" | |
| L3 | Training streak: pips and "4 sessions in a row" (only when real) | |
| L4 | Protein month: a meter and "12 of 21 days this month" (only when real) | |
| L5 | Steps streak: violet pips and "6 days at the floor" (only when real) | |
| L6 | Swipe between the glance and Lately (60 pt or a flick; rubber band at the ends); the dots also go | |

## 6 · The way out, and the controls

| # | Element | Status |
| --- | --- | --- |
| X1 | A tap anywhere shows the controls: Done, Dim and Agents, glass pills, 44 pt | |
| X2 | They fade after five seconds and come back on any touch | |
| X3 | "Tap for controls" hint on arrival (phone), fades after 2.6 s | |
| X4 | Done returns to the page he came from; Back from there never reopens the wall | |
| X5 | Esc leaves on the Mac (closes the sheet first if it is open); the "esc" key hint sits beside Done on the Mac | |
| X6 | A swipe down leaves (upright) | |
| X7 | A bump never ends the wall | |
| X8 | Dim lays a black veil (55%); the core holds still while dimmed; Dim is pressed while on | |
| X9 | The wall arrives with a short scale-and-fade (320 ms) | |

## 7 · The sheet ("Your agents")

| # | Element | Status |
| --- | --- | --- |
| S1 | Tapping the count, or Agents, opens it | |
| S2 | Upright it rises from the foot (74% tall) over a 50% scrim; on a stand and the Mac it comes in from the right edge (380 / 440 wide) | |
| S3 | A grabber (upright); the sheet follows a drag down and closes past 90 pt or a flick | |
| S4 | The scrim closes it; so do Close and Esc | |
| S5 | The head: "Your agents" (24 pt bold) and a Close pill | |
| S6 | The sentence (17 pt serif): "Nothing is waiting on you." / "The Coach is asking you one thing." / "Four things wait on you: 2 from the CFO, 1 from the Coach and 1 from the Leader." | |
| S7 | Each waiting being: its hue bar at the left, its face (40), its name in its hue, "Money · Two things waiting on you." | |
| S8 | Its asks, three at most: gold dot, title, when, chevron, 48 pt rows; each opens the Inbox at that card | |
| S9 | "N more in the Inbox" when it has more than three | |
| S10 | "Nothing is waiting on you." when none | |
| S11 | Yours to sort (his own captures) and records with no being yet, counted in the number and named here | |
| S12 | "Working now": faces (30) with names, or "Nobody is working right now." | |
| S13 | "All ten": a five-column grid of faces (36), a gold badge on whoever asks, a turning dashed ring on whoever works, quiet ones faded by freshness (0, .35, .62) | |
| S14 | Each face in the grid is a button labelled "Name. Its line."; tapping it shows "Name · its line" under the grid | |
| S15 | The caption at rest: "Tap a face to hear how it is doing." | |
| S16 | The foot: "Open the Inbox" (the one light pill) and "Talk it through" | |
| S17 | No signal: "Nova cannot reach the Mac, so nobody's asks or work can be read. The wall will fill in when it answers." | |

## 8 · Orientations

| # | Element | Status |
| --- | --- | --- |
| O1 | Upright 390×844: one column, clock and date at the top, the core in its orbit, the serif line, the waiting block, the three readouts | |
| O2 | On a stand 844×390: StandBy's shape, the time (124 pt), the date and the core (58) with its working line on the left; the serif line, the waiting block and the readouts on the right; dots and sync in one row at the foot | |
| O3 | The MacBook 1280×800: clock 170 pt, core 84, count 104; the first two asks under the count with their face (28) and "and N more · tap the count"; a band at the foot with the pulse, Lately and the streaks; sync bottom right; controls always shown | |
| O4 | Nothing is cut off and nothing scrolls sideways in any of the three | |

## 9 · Colour, motion, access

| # | Element | Status |
| --- | --- | --- |
| C1 | Each being wears its own hue (src/agentWorld/beings.js); the faces are still portraits of the 3D beings, so the wall runs no WebGL | |
| C2 | All clear is quiet ink; no signal is grey with words; red appears nowhere | |
| C3 | Reduced motion: the colon holds, the orbit and drift stop, faces and badges cross-fade in place, the count jumps, the sheet fades, the light fades in, the core is one still frame | |
| C4 | Reduced transparency: the sheet and the pills are solid | |
| C5 | The hidden tab-bar orb stops drawing under the wall | |
| C6 | Every control 44 pt | |

## 10 · Console, as a Home morning card

| # | Element | Status |
| --- | --- | --- |
| H1 | On the summary Home, a card "Your day, drawn" with "1 of 5" at the right of its head | |
| H2 | One instrument at a time: swipe, previous and next chevrons (44 pt), five dots | |
| H3 | Recovery (cyan): "Heart-rate variability"; a serif line ("Recovered: 6% above your usual."); the HRV in ms; his usual band with today's mark | |
| H4 | Today: "N blocks"; "One long block, at 15:30."; the 24-hour ring, hour ticks, 06 / 12 / 18, the blocks as arcs, the longest ahead lit, a dot at now, its time and name at the centre | |
| H5 | Steps (violet): "Floor 10,000 a day"; a serif line; today's count; the week's bars against the dashed floor, a missing day dashed, today outlined | |
| H6 | Training: "N exercises"; "(Session) today."; the muscles as chips in their own hues; the streak, "sessions in a row" | |
| H7 | Protein (green): "Plan 165 g"; a serif line; grams of the plan; the bar with the floor marked | |
| H8 | Every instrument has a VoiceOver label naming every bar, block and band | |
| H9 | Bars rise, arcs draw, bars grow as each instrument comes in; under reduced motion they fade | |
| H10 | The foot line: "Until 11:00, or until you have seen all five. Pin it from Edit to keep it." | |
| H11 | Shows 05:00 to 11:00 or until all five are seen; pinnable from Edit as "Your day" | |
| H12 | Read again, present and working, in every state (loading skeleton, nothing read, error) | |
| H13 | The cupertino Home is untouched (guard-cupertino prints "unchanged") | |
| H14 | `#/console` and its Index row are gone; the Mac sidebar row too | |
| H15 | The glass still raises the instruments while the brief is spoken | |
