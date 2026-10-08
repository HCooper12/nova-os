# 12 · Briefing · build checklist, round 2

The acceptance contract for building `design/mockups/83-redesign-briefing-r2.html`,
approved on 9 Oct 2026 ("Looking good"). One direction: A's playback on Nova's
stage with the grains to the subtitles removed, C's boards at the end, B's page
as Read, and an end card whose verbs say what they do.

One line per element, state, motion and copy line the mockup draws. Review
furniture (the Quarter speed and reduced-motion preview buttons, Replay, the
consequence essays, the vocabulary proposal, the "Every function stays" table,
Your calls) is outside the count, except where it states a behaviour the built
page must have: those lines are in §F and §C.

His calls, built as drawn defaults (brief, 9 Oct): a saved briefing lands in
`Wiki/Inbox` and the words say so; no "Hand to the Coach" yet, its slot drawn
disabled and labelled "Not built"; Discard stays without undo and says so; a
briefing that can no longer play gets an honest empty state, and a store of
its own stays his call.

Status column: `PRESENT` / `DIFFERS` (built, not exactly as drawn, with the
reason) / `MISSING`, with the frame that proves it, filled in after the build
is photographed in demo mode (frames under the session scratchpad,
`briefing-build/`).

## P · Listening: A's stage (frame "Playing")

| # | Element | Status |
| --- | --- | --- |
| P1 | The briefing plays full screen on Nova's own stage: the house sky and the one core, over the app | PRESENT · 01-ready |
| P2 | Top left: ⌄ Close, a 44 pt round glass button, "Close, back to where you came from" | PRESENT · 01-ready |
| P3 | Top right: "Read", a 44 pt glass pill | PRESENT · 01-ready |
| P4 | The top row clears the status bar and the floating bar (52 pt at 844) | PRESENT · 01-ready (the top row sits at the safe area + 8; the emulator has none, so it reads 8 where the mockup, with a drawn status bar, reads 52) |
| P5 | Beside the small core: "Nova" (15 semibold) over the briefing's title (13, faint); shown only while a panel is up | PRESENT · rise-7 |
| P6 | Core home: large, centred above the plate, while a plain sentence is spoken | PRESENT · 01-ready, rise-0 |
| P7 | The core travels to the presenter's spot (top left, small) when a sentence has a panel, and home again when it settles away | PRESENT · rise-0 to rise-7 |
| P8 | The core's colours: jade while Nova speaks, blue at rest and paused | PRESENT · rise-7 (jade), 05-script (blue, paused) |
| P9 | The core breathes, and pulses as words land (the house core's speaking pulse) | PRESENT · the house core (NovaFocus CoreFace), rise-* |
| P10 | A panel rises out of the core: from the core's spot, small and blurred, growing sharp, about 560 ms | PRESENT · rise-0 to rise-7 (scale .42, blur 12, 560 ms) |
| P11 | A panel settles away: lifts a little, shrinks, blurs and fades, about 280 ms | PRESENT · CSS nvBfSettle (up 10, .96, blur 8, 280 ms); not filmed |
| P12 | The panel's dock: 12 pt sides, top 186, 262 tall, glass, 28 radius | DIFFERS · rise-7: the dock hangs 90 under the top row and fills to 10 above the plate, so it is 262 tall only where the mockup has its drawn status bar; on a taller or shorter phone it takes the room there is |
| P13 | Picture panel: its label (15 600) and what it is (13), the picture, its labels; a credited picture or nothing | DIFFERS · rise-7: a real picture carries its caption and credit in the header; the mockup's three labels under its drawing and its "credited picture" note belong to the drawing, which the app does not have |
| P14 | Term panel: "In plain words" (13), the term (28 serif), its plain words (15), "One of N terms this briefing defines." (13) | PRESENT · 03-term, 04-moment |
| P15 | Curve panel: "Caffeine still in you", the curve, the axis, the figure lit in the Researcher's blue on its cue word, "from the Researcher" named in words (New) | DIFFERS · not built: a figure panel needs the compose pass to name figures and code to check them against the research (a server and prompt change); Your call 6, listed in the report |
| P16 | Comparison panel: "One question, two answers", his source against the trials, the matching row lit in blue on its cue word (New) | DIFFERS · not built, for the same reason as P15 (Your call 6) |
| P17 | A plain sentence gets no panel: no heading cards, Nova himself is the picture | PRESENT · rise-0, 04-moment (heading and title cards are no panel; test) |
| P18 | The plate: glass, 12 pt sides, top 458, 180 tall, 28 radius, the top edge fading | PRESENT · 03-term |
| P19 | The words in the serif, 24, Nova's starlight ink; the earlier sentence dims; two sentences at most | PRESENT · 03-term, rise-7 (the earlier sentence at 42%) |
| P20 | Each word fades up in place (4 pt rise, 3 pt blur to sharp, about 240 ms); no grains travel from the core | PRESENT · rise-0 to rise-7; briefingStage.test.js (no pour, WORD_LOOK 4 / 3 / 240) |
| P21 | The word being said turns white and is underlined in jade (3 pt), the underline growing across the word as it is said | DIFFERS · the word being said takes the house mix of jade into ink, a little short of pure white; the jade underline grows across it as drawn |
| P22 | The moment: "Part n of N" (13) over the part's name (28 serif), centred over the plate, rising in 380 ms, held, then dropping into the rail in 460 ms; the plate's words cleared for it | PRESENT · verified in the page (opacity 1, the plate's words at 0); the frame was missed by screenshot latency, so a dev-only window.__bfSlow seam now stretches it |
| P23 | The rail label (13): the part's number (600) and its name; dimmed while the moment plays | PRESENT · 04-moment |
| P24 | The rail: one segment per part, a 4 pt bar in a 44 pt target, 4 pt apart; parts done are full, the current part fills in jade by how far through it is, easing over 600 ms | PRESENT · 03-term, 04-moment, fan-0 |
| P25 | A tap on a rail segment plays that part | PRESENT · wired to App.playBriefing(first beat); not tapped, since a tap would ask for speech |
| P26 | The transport at the foot (bottom 30): Script (44, list glyph), Back a part (44), Play or Pause (64, light disc, dark glyph), Next part (44), Ask (pill: mic and "Ask") | PRESENT · 01-ready, 03-term |
| P27 | The play glyph while paused, the pause glyph while playing, labelled Play or Pause | PRESENT · 01-ready (play), 03-term (pause) |

## S · Pause, skip, Script (frame "Pause, skip, Script")

| # | Element | Status |
| --- | --- | --- |
| S1 | Pause stops mid-word: the words after the stop never appear, and the core settles to blue | PRESENT · the house cutSpeech; 05-script (core blue) |
| S2 | Next part skips to the next part, and its moment plays | PRESENT · nextPartBeat, test; the moment plays on a part's first beat |
| S3 | Back a part: to the start of this part, or the part before from its start | PRESENT · backPartBeat, test |
| S4 | Script: a sheet from the foot, 560 tall, 30 radius, a grab handle; "Script" (15 600) and a "From the start" pill with the restart glyph | PRESENT · 05-script |
| S5 | Every line, under "Part n · name" labels (13) | PRESENT · 05-script |
| S6 | The line being spoken: a jade tint and a 3 pt jade bar on its leading edge | PRESENT · 05-script |
| S7 | Each line a 44 pt button: a tap plays from it, it lights, and the sheet goes down | PRESENT · wired (seek, lit, sheet down); not tapped, for the reason in P25 |
| S8 | The sheet rises in 460 ms on the house ease; under reduced motion it fades | PRESENT · nvBfSheetUp 460 ms; fades under reduced motion |

## R · Read: B's page (frame "Read")

| # | Element | Status |
| --- | --- | --- |
| R1 | Read opens the report as a page; "‹ Stage" at top left (17) takes you back | PRESENT · read-0 to read-7, 06-read-top |
| R2 | The title, 34 bold; the meta line (13): when it was made · N parts · N sources | PRESENT · 06-read-top |
| R3 | The lede: the summary in the serif, 22 | PRESENT · 06-read-top |
| R4 | Each part: its heading in the serif (22) with its own 44 pt round play button | PRESENT · 06-read-top |
| R5 | The part being spoken: a 3 pt jade bar grows down its leading edge (500 ms), and "Playing" (13, jade, a glowing dot) | PRESENT · read-7, 06-read-top |
| R6 | The part's text, 17, faint ink | PRESENT · 06-read-top |
| R7 | The page moves to the part being spoken | PRESENT · read-1 (the page moved to part 2 as it played) |
| R8 | Nova pinned in a player at the foot: 10 pt sides, bottom 24, 84 tall, glass, 26 radius, the core small at its left | PRESENT · read-7, 06-read-top (the core travels into the player) |
| R9 | The player shows the sentence being said in the serif (17), words fading up in place, the jade underline (2 pt) | PRESENT · read-7 |
| R10 | The player's play or pause: a 44 pt light disc | PRESENT · read-7 |
| R11 | A panel still rises out of the core, above the player (bottom 118, 252 tall), when a sentence has one | PRESENT · read-3 to read-7 |
| R12 | Finished: the player reads "Finished · tap play to hear it again" (13) | PRESENT · in code (b.atEnd in Read); not photographed |
| R13 | "Terms, in plain words": the terms as 44 pt chips (17) | PRESENT · 07-read-tail (a term chip opens its plain words beneath) |
| R14 | "Sources": 44 pt rows (17) with a rule between, and "Show N more" | PRESENT · 07-read-tail |
| R15 | "What to do with it": the end card's verbs, without its title | PRESENT · 07-read-tail |

## E · The end, and saving (frame "The end, and saving")

| # | Element | Status |
| --- | --- | --- |
| E1 | When Nova finishes, the words clear and the plate, rail and transport fade (300 ms) | PRESENT · fan-0 to fan-2 |
| E2 | The core goes to the top centre, small, at rest | PRESENT · fan-1 to fan-7 |
| E3 | The parts lift out of the rail: each board flies from its own segment, from a fifth of its size, tilting to its angle, 640 ms, 70 ms apart | PRESENT · fan-1 to fan-4 |
| E4 | The boards: 104 by 106, 20 radius, glass; three and three, centred, 8 pt apart; tilted -2.5, 1.5, -1.5, 2, -2, 2.5 degrees | PRESENT · fan-5, 30-375-end |
| E5 | A board: "Part n" (13) with a small play glyph, the part's name (15 serif), a small picture of what that part showed | PRESENT · fan-7 |
| E6 | A part that showed nothing has Nova's core as its picture | PRESENT · fan-7 (parts 3, 4, 5) |
| E7 | A tap on a board plays that part again | PRESENT · wired to the part's first beat; not tapped (P25) |
| E8 | The sixth board: outlined, no glass; "All five" (13), "From the start" (15 serif), the restart glyph; plays it all from the start | PRESENT · fan-7 |
| E9 | The end card rises after the boards (from 24 below, slightly small and blurred, 460 ms): glass, 10 pt sides, from 326 to 12 above the foot, 28 radius | PRESENT · fan-6, fan-7 |
| E10 | The end card's title: the briefing's title in the serif, 24 | PRESENT · fan-7 |
| E11 | Group "Keep the information" (13 600, faint) | PRESENT · fan-7 |
| E12 | Save to your notes (tray glyph): "A page in Wiki/Inbox that Nova and the agents can open, off your Library shelf." | PRESENT · fan-7 |
| E13 | Group "Think it over" | PRESENT · fan-7 |
| E14 | Ask about it (question glyph): "Nova answers here, from this briefing. Nothing goes into your vault." | PRESENT · fan-7 |
| E15 | Decide later (clock glyph): "It waits in your Inbox, still playable. Nothing is written." | PRESENT · fan-7 |
| E16 | Group "Change something" | PRESENT · fan-7 |
| E17 | Hand part 5 to the Coach (swap glyph): his call 3, so the slot is drawn disabled and labelled "Not built" | DIFFERS · his call 3 as drawn default: "Hand a change to the Coach", disabled, tagged "Not built", "Not built yet. For now, tell the Coach yourself." (08-save-ghost) |
| E18 | Group "Not for you" | PRESENT · 08-save-ghost |
| E19 | Discard (cross glyph, a quiet outlined row): "Nothing is written. It leaves your Inbox; no undo today." | PRESENT · 08-save-ghost |
| E20 | The rows: 58 tall, 18 radius, a 34 pt glyph disc, the verb (15 600) over its line (13) | PRESENT · 08-save-ghost (58 minimum; 69 where the line wraps) |
| E21 | Save acted out: a page leaves the boards and drops into the row's glyph (700 ms) | PRESENT · 08-save-ghost |
| E22 | The done row: a jade tint, the tick drawing itself (420 ms), "Saved to Wiki/Inbox", "Undo deletes the page, if you have not edited it.", and Undo on the same row | PRESENT · 09-saved |
| E23 | Decide later, Discard and its group step aside once it is saved | PRESENT · 09-saved |
| E24 | Undo, on the same row, takes the save back | DIFFERS · 10-undone: Undo deletes the page through the note filer's undo, but the record is then "undone", which the Inbox will not approve, discard or reopen again, so the row says "Save undone. The page is deleted. This briefing no longer waits in your Inbox." instead of putting every row back |

## A · Asking (frame "Asking, and handing on a change")

| # | Element | Status |
| --- | --- | --- |
| A1 | Ask about it: the end card and boards fly back into the core, which comes home | PRESENT · in code (the boards and card fly into the core, 300 ms); not filmed |
| A2 | Listening: the core violet, his words in italic on the plate | DIFFERS · listening is the stage's own microphone (violet core, "Your words appear here once your Mac has them"): no live transcript exists, so his words appear once the Mac has them (11-ask-thinking), not word by word as he speaks. Not photographed: demo has no microphone |
| A3 | Thinking: the core cyan, "Thinking" | PRESENT · 11-ask-thinking |
| A4 | Answering: the core jade, the answer word by word, and the panel the answer points at rises | PRESENT · 12-ask-answer; the answer's own panel is the running glass every reply has, not photographed (demo has no reply) |
| A5 | The boards and the end card return after the answer | PRESENT · checked in the page: once the answer ends the stage returns to the boards |
| A6 | Handing part 5 to the Coach acted out ("With the Coach") | DIFFERS · not built (his call 3) |

## M · The Mac at 1280 by 800, at the end

| # | Element | Status |
| --- | --- | --- |
| M1 | The top: ⌄ at left, the small core and "Nova · finished", Read at right | PRESENT · 20-mac-end |
| M2 | The boards in one row across the stage (140 by 200, 26 radius, name 20 serif, picture 52 tall), fanned from -6 to 6 degrees, the outer ones lower | PRESENT · 20-mac-end |
| M3 | Under them: the title (34 serif), "N parts · N sources · N terms · tap a board to hear that part again" (15), and From the start | PRESENT · 20-mac-end |
| M4 | The end card as a column at the right, 388 wide, from 96 to 28 above the foot, nothing in a sheet | PRESENT · 20-mac-end |
| M5 | While it plays, the stage sits centred at 720 pt, and Script opens as a side panel | PRESENT · 21-mac-play-script |

## G · Motion, size and colour

| # | Element | Status |
| --- | --- | --- |
| G1 | Reduced motion: words appear whole with a quarter-second fade and no underline; panels and boards fade without moving; the core holds still | PRESENT · CSS and Captions (WORD_LOOK whole), briefingStage.test.js; not photographed (the emulator offered no reduced-motion switch) |
| G2 | Every control 44 pt; no sideways scroll at 375 or 390 | PRESENT · measured at 375 and 390: no control under 44 (the end's small core is not a target), scrollWidth 375, 390, 1280 |
| G3 | Jade only while Nova speaks; the Researcher's blue only on what the Researcher found, named in words; the three kinds of decision told apart by glyph and heading, never by colour alone | PRESENT · jade only on the speaking core, underline, rail and Playing; no Researcher panel is built (P15) |

## F · Every function stays (the mockup's table)

| # | Element | Status |
| --- | --- | --- |
| F1 | Play, pause, resume: resume opens at the sentence he left | PRESENT · resume at the sentence left (App.playBriefing) |
| F2 | Restart: From the start at the head of Script, and the sixth board | PRESENT · 05-script, fan-7 |
| F3 | Tap a line to play from it (Script) | PRESENT · 05-script |
| F4 | Next part and back a part: buttons beside play, a tap on the rail, or saying it | PRESENT · transport, rail, voice |
| F5 | Explain that again: Ask mid-briefing hands Nova the sentence just spoken, then "carry on" | PRESENT · Ask mid-briefing: askAboutBriefing with the sentence just spoken, then "Shall I carry on"; now answered on the stage |
| F6 | Listen and Read: Read in the top corner, Stage returns | PRESENT · read-* |
| F7 | Listen from a section: each part's play button on Read | PRESENT · 06-read-top |
| F8 | Terms in plain words and sources: on the stage as they are said, listed at the foot of Read | PRESENT · 03-term, 07-read-tail |
| F9 | Pictures and clips cached before Play; no picture means no panel | PRESENT · panelOf (no picture, no panel) |
| F10 | The missing angle said aloud, and written in the end card's line when it applies | PRESENT · end card and Read show the missing angle |
| F11 | Keep in vault becomes Save to your notes, with its place and Undo on the row | PRESENT · 09-saved |
| F12 | Close returns to where he came from; the same as Decide later when undecided | PRESENT · history back; Inbox when opened cold |
| F13 | Voice commands: all eight kept (pause, resume, restart, next part, back a part, again, close, explain) | PRESENT · tryBriefingVoice unchanged, explain stays on the stage |
| F14 | Asking, working, error and the list of briefings: unchanged from round 1's plan | PRESENT · 00-empty; loading is a skeleton, error offers the Inbox |

## X · The audit's findings named in the brief

| # | Element | Status |
| --- | --- | --- |
| X1 | The head is never under the floating bar (Close landed on Settings) | PRESENT · the stage covers the floating bar (z 71 over 70), and every other state uses the house tall wrap |
| X2 | Skip and back exist on screen, not by voice only | PRESENT · 01-ready |
| X3 | No label under 11 pt | PRESENT · test: nothing under 13 in the block |
| X4 | A kept briefing that can no longer play: the empty state says so, honestly | PRESENT · 00-empty |

## C · His calls, built as the drawn defaults

| # | Element | Status |
| --- | --- | --- |
| C1 | A saved briefing lands in Wiki/Inbox, and every word says Wiki/Inbox | PRESENT · 09-saved, test |
| C2 | No Hand to the Coach yet: its slot drawn disabled and labelled "Not built" | PRESENT · 08-save-ghost |
| C3 | Discard has no undo, and its line says so | PRESENT · 08-save-ghost |
| C4 | Saved briefings keep their 400-record life; the store of their own stays his call | PRESENT · 00-empty, test |

## Tally

110 lines: 101 PRESENT, 9 DIFFERS, 0 MISSING. Frames and build-against-mockup
pairs are in the session scratchpad, `briefing-build/` (pair-*.png; the rise, Read and
end sequences as rise-0..7, read-0..7, fan-0..7 with tile-*.png). Every DIFFERS is either
his call (P15, P16, E17, A6), honesty about what the code does (E24, A2, P13), or geometry
that follows the real phone rather than the drawn status bar (P12, P21).
