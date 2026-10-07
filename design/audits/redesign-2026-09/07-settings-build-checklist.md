# 07 · Settings · build checklist, direction A ("Rows")

The acceptance contract for building `design/mockups/72-redesign-settings.html`
direction A, his pick on 7 Oct 2026: "Love the rows option A and layout of
it, including things like a preview of the different appearances when
toggled, etc. ensure this is built exactly like the mockup with nothing
missing."

One line per element, row, value, page, control, state, motion and copy line
the mockup draws for A. Review furniture (the direction switch, the tally
line, Your calls) is outside the count, as the mockup says; the three states
and the text size it switches are in the count, because they are states the
real page must have. Direction B's Looks carousel and C's sentence and moved
pages are not A and are not listed.

Status column: `PRESENT` / `MISSING` with the frame that proves it, filled in
after the build is photographed (frames under the session scratchpad,
`settings-build/`). `DIFFERS` means built, but not exactly as drawn, with the
reason; every one is listed again in §9.

## 1 · The root page (Settings)

| # | Element | Status |
| --- | --- | --- |
| R1 | Large title "Settings", 34 pt bold, the page's only title; no "Connect the real vault" | |
| R2 | Offline banner (hidden when live): grey dot + "The Mac is offline. What comes from it shows as it was at HH:MM, and waits until it is back." | |
| R3 | The you card: Nova's orb (48), the name in 17 semibold, "About you, your numbers, and what Nova has noticed", chevron; opens You | |
| R4 | Group label "Nova" (13 pt caps, ink 62%) | |
| R5 | Row Voice: cyan wave tile, "Voice", value "Speaks aloud" / "Text only", chevron; opens Voice | |
| R6 | Row "Hey Nova": cyan mic tile, the switch (on = cyan) | |
| R7 | Row Notifications: bell tile (neutral), value "Quiet 22:30 to 05:00" / "On" / "Off", chevron; opens Notifications | |
| R8 | Group label "Look" | |
| R9 | Row Appearance: the look tile (the current theme's disc as the tile), value = the look's name ("Nova glass"), chevron; opens Appearance | |
| R10 | Row Calm mode: calm tile, the switch | |
| R11 | Row Tab bar: dock tile, value = the tabs that fill the bar ("Home, Nova, Train, Fuel"), chevron; opens Tab bar | |
| R12 | Group label "In Nova’s pages" | |
| R13 | Row Train: cyan dumbbell tile, value "Rest timer · 90 s" / "Rest timer off", chevron; opens Train | |
| R14 | Group label "Connected" | |
| R15 | Row The Mac: green laptop tile (grey offline), value "Connected" / "Offline since HH:MM", chevron; opens The Mac | |
| R16 | Row Calendars: calendar tile, value "N of M shown", chevron; opens Calendars | |
| R17 | Row Research browser: globe tile, value (sign-in state), chevron; opens Research browser | |
| R18 | Group label "Under the hood" | |
| R19 | Row Claude models: chip tile, value "57 lanes · N off", chevron; opens Claude models | |
| R20 | Row Snapshots: clock tile, value "Before every write", chevron; opens Snapshots | |
| R21 | Row Check Nova: green check tile, value "5 tests", chevron; opens Check Nova | |
| R22 | The spoken line: "Six settings also answer to speech, on the Nova screen or the Ask bar:" + the seven phrases in quotes + "Build <hash>." | |
| R23 | Search at the foot: glass pill, magnifier, "Search settings" placeholder, floating above the tab bar | |
| R24 | Rows are 52 pt with a 34 pt tile, hairline inset to the name, value right (drops under the name when it will not fit) | |
| R25 | Groups and cards rise in on arrival, staggered | |

## 2 · Search (the root's foot)

| # | Element | Status |
| --- | --- | --- |
| X1 | Typing hides every group, the you card and the spoken line | |
| X2 | Results: a group headed "N settings" (or "1 setting"), one row per hit: the setting's name, its page's name on the right, chevron | |
| X3 | Every word must match (name, keywords, page) across the 28 indexed settings | |
| X4 | A hit opens its page with that row lit (cyan wash fading over 1.4 s) and scrolled into view | |
| X5 | No hit: "No setting matches “q”. Ask Nova instead." | |
| X6 | Clearing the field brings the page back | |

## 3 · Voice

| # | Element | Status |
| --- | --- | --- |
| V1 | Nav: Back "‹ Settings" (cyan), the title "Voice" appearing centred once the header card scrolls under | |
| V2 | Header card: large cyan wave tile, "Voice", "How Nova speaks to you, and how he hears you." | |
| V3 | Group "Speaking": Speak replies, switch, sub "In Nova’s own voice, made on your Mac." / "Replies stay on the screen." | |
| V4 | Voice row: name left, a cyan pill with the voice and an up-down glyph; opens the menu | |
| V5 | The menu: title, options with a check on the current one, scale-in from the pill, closes on outside tap or Escape | |
| V6 | "When the phone is on silent": segmented Duck music / Speak anyway, the thumb slides; sub for each | |
| V7 | Sound effects: switch, "Ticks and a chime when something is revealed. They play alongside your music." | |
| V8 | Speaking footnote: "iOS has no setting that dips your music and speaks over the ring switch at once, so silent is a choice." | |
| V9 | Group "Listening": "Hey Nova" switch, "Say it anywhere in Nova and the conversation starts." | |
| V10 | Talk over Nova: switch; OFF and dimmed while Hey Nova is off, sub "Needs “Hey Nova”, which holds the microphone open."; a tap nudges and says why | |
| V11 | Talk over Nova when Hey Nova is on: switch live, sub "Start talking while Nova speaks and he stops to listen."; the row lights when Hey Nova turns on | |
| V12 | How Nova hears you: segmented Automatic / Nova’s ears / Dictation; sub per choice | |
| V13 | Pause before Nova answers: segmented Quick / Natural / Patient; sub per choice | |
| V14 | The pause timeline: a track with ticks at each second to 5 s, a cyan fill to the chosen length with the length above it ("2.0 s"), labels You stop · Nova answers · 5 s; the fill runs its length when the choice changes | |
| V15 | Last group: row "Test the voice and the microphone", green check tile, value "5 tests", opens Check Nova | |

## 4 · Notifications

| # | Element | Status |
| --- | --- | --- |
| N1 | Header card: bell tile, "Notifications", "Nova pushes to this phone and your Watch when something needs your call." | |
| N2 | Allow notifications: switch, "Drafts, research outlines and Guardian alerts." | |
| N3 | Send a test: row with a "Send" text button | |
| N4 | Group "Quiet hours": Quiet hours switch, sub "Pushes wait on the Mac and arrive together at 05:00." / "Every push arrives when it happens." | |
| N5 | The night ring: 24 hour ticks (every sixth longer), 00 06 12 18 labels, the quiet arc in night blue with a glow, a cyan dot at now | |
| N6 | Inside the ring: the length ("6 h 30") over "quiet"; the ring fades when quiet hours are off | |
| N7 | Under the ring: cyan dot + "Now HH:MM · quiet in …" / "quiet now, held pushes arrive at 05:00" / "every push arrives when it happens" | |
| N8 | From row with a pill menu (times) | |
| N9 | To row with a pill menu (times) | |
| N10 | Footnote: "Urgent pushes still come through. A test sent inside the window waits too, and says when it will arrive." | |
| N11 | The arc moves and resizes when From or To changes (0.45 s) | |
| N12 | Reads and writes the real pref through the existing API (his window 22:30 to 05:00) | |

## 5 · Appearance

| # | Element | Status |
| --- | --- | --- |
| A1 | Header card: the look tile (large), "Appearance", "How Nova looks on this phone. Your other devices keep their own." | |
| A2 | The preview: Home in miniature at 0.86, under it "Your Home, as it would look (demo)" | |
| A3 | The miniature draws each style's Home: Summary (title, rings, two tiles, a wide card, the tab bar and Nova), Apple layout (grouped rows, floating dock), Apple skin (mission card, four arc tiles), Command Core (HUD brackets, the big figure, the core) | |
| A4 | The miniature wears the palette, the material (glass / lit / solid) and calm | |
| A5 | Changing a pick cross-fades the miniature (ghost out with blur, new in) | |
| A6 | Group "Style": four thumbnails (Summary, Apple layout, Apple skin, Command Core), each its own miniature at 0.34 in the current palette; the chosen one ringed in cyan | |
| A7 | Group "Theme": five discs (Command, Observatory, Ember, Daylight, Sky), each drawn in its own colours; chosen ringed | |
| A8 | Daylight and Sky dimmed under Command Core, with "Daylight and Sky are drawn for the Apple styles."; a tap nudges and says so | |
| A9 | Group "Material": Glass, Lit, Solid patches over the theme's sky, each with a card in that material; chosen ringed | |
| A10 | Material dimmed off Summary, with "Material belongs to the Summary style." | |
| A11 | Group "Nova core": Hologram and Filament, both running live (104 pt), names and "Tilted rings round a living globe" / "The original circuit-arc nebula"; chosen ringed | |
| A12 | Calm mode switch, sub "Dims the glow and stills the sky. Same layout." / "The glow is dimmed and the sky is still." | |
| A13 | Picking Command Core while Daylight or Sky is on falls the theme back and says so | |

## 6 · Check Nova

| # | Element | Status |
| --- | --- | --- |
| K1 | Header card: green check tile, "Check Nova", "Five tests for when something stops working. Nothing here files anything." | |
| K2 | Group "Sound": Can you hear Nova? ("Walks the whole path, Mac to speaker, and names whatever fails.") with Run | |
| K3 | Can Nova hear you? ("Run it on the phone you talk to. It asks you to speak three times.") with Run | |
| K4 | Nova’s ears ("Records you once and shows what your Mac heard.") with Run | |
| K5 | A run: the button says "Running", each stage arrives (rise) and its mark draws (green tick or red cross), name bold and detail under; then "Run again" | |
| K6 | Group "Touch": Haptics row, "iOS web: tick and threshold are one pulse, commit two, celebrate and warn three. Press each." | |
| K7 | Five haptic chips: Tick, Commit, Threshold, Celebrate, Warn (44 pt) | |
| K8 | "Do tick and warn feel different?" with a segmented Different / The same | |
| K9 | Swipe back ("Whether the edge gesture is listening, and the last swipe it saw.") with Run, three stages | |
| K10 | Group "This build": "Build <hash>" in mono, "iOS web · installed · demo" under it, a Copy button with the copy glyph | |
| K11 | Footnote: "Send this line with any report, so the fix starts from facts." | |

## 7 · The other pages

| # | Element | Status |
| --- | --- | --- |
| Y1 | You: header card with the large orb, the name, "The root context every Nova agent reasons from. It lives in your vault." | |
| Y2 | Your numbers: three figures (kcal a day, protein floor, TDEE) in rounded bold | |
| Y3 | The Intake line ("From the Intake on …: kg, activity, goal.") with Redo | |
| Y4 | About you: four rows (Focus, Priorities, At your best, Context), each name over its text; Edit in the group header | |
| Y5 | Edit: the four as text areas, Cancel and Save; the header button reads Done | |
| Y6 | About you footnote: "Nova reads this before every answer, coaching session and brief." | |
| Y7 | What Nova has noticed: one row per lane, name, "k of n kept", a split bar (green kept, grey dismissed), "Worth easing off" in gold where it is | |
| Y8 | Ladder footnote: "Learned from what you kept and dismissed, and it decides what Nova does without asking." | |
| C1 | Calendars: header card, "Turn off any calendar you don’t want Nova reading." | |
| C2 | Group "On the Mac" with Refresh in the header; a row per calendar with a dot tile and a switch | |
| C3 | Footnote: "Hidden calendars are skipped everywhere: today’s view, dispatches and the daily review. Apple Calendar’s own checkboxes don’t reach Nova, so set them here." | |
| M1 | Claude models: header card, "Every agent and feature that talks to Claude, the model it runs on, and a switch to stop it." | |
| M2 | The week's total: big rounded figure, "spent across all N lanes in the last 7 days, as the Mac measured it" | |
| M3 | Group "Groups": a row per group, its name, "n lanes · $x" (and "· k off"), a spend bar, chevron; opens the group | |
| M4 | Footnote: "Newest, checked …: Opus · Sonnet · Haiku · Fable. A pinned model stays on one version; the rest follow the newest." | |
| M5 | "Reset every lane to its default" text button, with Undo in the toast | |
| G1 | A group's page: large title (the group), the description and its week's spend | |
| G2 | A row per lane: the name, a model pill ("Haiku 4.5 · default") opening the model menu, a switch | |
| G3 | A deterministic lane: "Deterministic. No model runs; the switch is the setting." | |
| G4 | A lane switched off: its model line gives way to what stopped, in red | |
| S1 | Snapshots: header card, "Every write to your vault keeps a copy first. Restore any file, and the restore keeps a copy too." | |
| S2 | A group of files, each "path" over "Copy from HH:MM" with Restore | |
| S3 | Restore opens a confirm row: "Overwrite the current file with the HH:MM copy?" Cancel · Restore (red) | |
| S4 | A confirmed restore toasts with Undo | |
| T1 | The Mac: header card with the green laptop tile, "Nova’s server on your Mac, reached through Tailscale." | |
| T2 | Status row: "Connected" in green / "Offline since HH:MM" | |
| T3 | Backend URL field (mono, 44 pt) | |
| T4 | API token field (password) | |
| T5 | Test the connection: "Reaches the Mac, checks the token, reads the vault." with Run and staged results | |
| T6 | "Back to demo data until you connect again." with Disconnect in red | |
| T7 | Footnote: "The token is printed in the server’s terminal on first run, and kept in server/.env." | |
| B1 | Research browser: header card, "Instagram, TikTok, X and LinkedIn refuse an anonymous reader. Sign in once and the Scout reads them as you." | |
| B2 | Row "On the Mac" with its value and Sign in | |
| B3 | Footnote: "It uses its own browser profile, never your everyday Chrome, and only ever reads. You type the password; Nova never sees it." | |
| D1 | Tab bar: header card, "The first four sit in the tab bar and the rest live in More. On the Mac the same order sorts the sidebar." | |
| D2 | "In the tab bar" list: a row per tab (its icon tile, its name, a grip), the first four in one card | |
| D3 | The line where More begins: a gap and the label "In More" over the rest | |
| D4 | Drag by the grip: the row lifts, the others slide aside; arrow keys move a focused grip | |
| D5 | The tab bar itself updates as the order changes | |
| TR1 | Train: header card, cyan dumbbell, "Train", "The live session." | |
| TR2 | Group "Live session": Rest timer switch, sub "After each tick, the ring counts down on the tick’s own spot. Tap it to skip." / "Off. The tick stays put after every set." | |
| TR3 | Length: segmented 60 s / 90 s / 2 min / 3 min | |
| TR4 | The rest ring: a cyan ring filled to the length (of 3 min), the length in bold, "on the tick’s spot after each set" | |

## 8 · States, size and motion

| # | Element | Status |
| --- | --- | --- |
| ST1 | Live: values from the Mac read plainly; The Mac green | |
| ST2 | Loading: every value that comes from the Mac is a shimmering skeleton bar; nothing else changes | |
| ST3 | Offline: the banner; Mac values keep what it last said, greyed, with " · HH:MM"; The Mac reads "Offline since HH:MM", its tile grey | |
| ST4 | Offline or loading: a Mac-held switch or menu does not change; it nudges and says why ("The Mac is offline. This waits until it is back" / "Still reading this from the Mac") | |
| ST5 | Larger text: every size scales with the iPhone's Text Size; values drop under their names; nothing is cut | |
| MO1 | A row pushes its page with the iOS slide: the page in from the right, the parent a third left and dimmed, a shadow down the leading edge (0.5 s) | |
| MO2 | Back, Escape or a swipe right pops it; the swipe is tracked under the finger and finished by its speed | |
| MO3 | Reduced motion: every slide is a short fade; no row light sweep, no stage rise, no timeline run | |
| MO4 | A value that changes flips in (0.22 s) | |
| MO5 | The switch knob stretches under the finger and slides | |
| MO6 | The toast drops in from the top, Undo where a change can be undone | |
| H1 | Every control at least 44 pt; no sideways scroll at 375 or 390 | |
| H2 | Colour: cyan on/chosen, green passed/live, red off-that-costs/failed/overwrite, gold waiting only, night the quiet hours | |

## 9 · The audit's source bugs, fixed

| # | Bug | Status |
| --- | --- | --- |
| F1 | The unconditional "Connect the real vault" title and demo-mode paragraph | |
| F2 | Talk over showing On while it cannot run | |
| F3 | The dock count copy ("the first three") | |
| F4 | "two skins" | |
| F5 | "Most of this page answers to speech" | |
| F6 | Nova as "it" | |
| F7 | The numeral mismatch (XIV. against the sidebar's XV.) | |
| F8 | Calm mode's Off chip breaking into "O / ff" | |
| F9 | The Observatory swatch drawn in the current theme's tokens | |
| F10 | Offline: no stale note; sections vanish; About you as if live | |

## 10 · Every function today (REDESIGN-CHECKLIST §5, S1 to S13), and where it went

| # | Function | Where in A | Status |
| --- | --- | --- | --- |
| S1 | Backend URL, token, Test, Save and connect, Disconnect, status line | The Mac | |
| S2 | About you, Edit/Set up, the Intake (Set/Redo my numbers), the read view | You | |
| S3 | The trust ladder | You › What Nova has noticed | |
| S4 | Style, theme, material, core, calm | Appearance (calm also on the root) | |
| S5 | Push state, Enable, Test | Notifications | |
| S6 | Settings by voice | The spoken line on the root | |
| S7 | Haptics: capability, five words, Different / The same, the diagnostic line | Check Nova › Touch (the line in This build) | |
| S8 | Voice: speak, voice pickers, engine note, Hey Nova, Talk over, hearing, ears test, silent switch, sound effects, pause, hear test, build, research browser, swipe facts, mic check | Voice, Check Nova, Research browser | |
| S9 | Navigation order | Tab bar | |
| S10 | Calendars, Refresh, error/loading/empty | Calendars | |
| S11 | The model board: Reset all, states, counts, watch line, spend, groups, lane model, switch, Reset, spend line, deterministic note, off effect | Claude models › group | |
| S12 | Time machine: browse, Restore… confirm | Snapshots | |
| S13 | The footer (server/.env, README) | The Mac's footnote | |

## 11 · Where the build differs from the drawing, and why

Filled in at the end of the build.
