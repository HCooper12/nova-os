# 21 · Ambient and Console: audit, 5 Oct 2026

His brief, 26 Sep: "A lot of Nova has become cluttered and complicated."
"Simplicity with all functionality and a beautiful aesthetic, along with ease
of use MUST be the goal." Ambient is the wall: a full-screen face for a spare
screen or a phone on a stand. Console is the morning brief drawn as five
instruments. They are audited together because they are Nova's two most
hidden screens and because one decision (C1: is Console a screen, a Home
section, or retired) changes what the wall should be. Apple's own version of
a wall is StandBy, so it is the yardstick for Ambient; the summary Home he
chose is the yardstick for colour, and the Coach deck for simple.

Evidence: source read in full (`src/screens/Ambient.jsx` 168 lines, the
ambient slice of `src/vals/valsOps.js` 247 to 337, `src/screens/ConsoleScreen.jsx`
29, `src/Instruments.jsx` 383, the props and frame loop of `src/NovaCore.jsx`
1040 to 1143), plus every door and consumer: `src/indexGroups.js`,
`src/vals/valsIndex.js`, `src/screens/NovaThread.jsx`, `src/vals/valsNovaThread.js`,
`src/screens/Voice.jsx`, `src/vals/valsChrome.js`, `App.navigate`,
`src/StageCard.jsx`, `server/lib/instruments.js` and `server/lib/morningShow.js`.
Photographed in demo mode only under his look (summary, Nova glass, command,
the hologram core) at 390×844, 844×390 and 1280×800. Demo mode feeds neither
screen real values, so a harness drew the connected layout from demo-shaped
values (§5 says how). Computed-style sweeps of both screens and a ten-second
frame measurement of the core. Read under `apple-hig-review`, each citation
`file.md › Heading`; "judgment" where no page applies. No data of his was
read or photographed; every count below is demo-shaped. Locators are against
`main` at 97f2205.

---

## 1 · Verdict

**Critical issues.** Both screens are honest, and neither does its job from
where he would use it. The wall exists to tell a room whether anything waits
on him; its own comment says "the room reads the state before the numbers"
(`Ambient.jsx:73`). It cannot: the two states it paints differ by **1.02:1**
at their brightest pixel. On a phone on a stand, the way StandBy is used, the
wall is 770 points of content in a 390-point screen and shows none of its four
numbers. Its only way out is a tap anywhere, announced by a hover title a
touchscreen never shows, and that tap lands on Home with the wall one Back
away. Console draws the morning well, but no page opens it, its empty state
asks for a button the page does not have, four of its five colours mean
something else on Home, and half its words are hidden from VoiceOver.

The number that says it: **1.02:1**. That is the whole contrast between
"something waits on you" and "all clear", the one thing the wall is for.

### Clutter numbers, as they stand (checklist §3)

| Test | Ambient today | Console today | Target |
| --- | --- | --- | --- |
| Focal point | The 300-point core: the largest, brightest, moving object. The waiting count is a 34-point light digit in a 2×2 grid | None: five instruments of equal width in five hues; the first screen is Recovery and the Day ring | One, above the fold |
| Objects above the fold, 390×844 | 13 of 16 visible, 3 below the edge (all three receipts) and the pulse strip cut on both sides; on a stand 4 of 16; Mac 16 of 16; demo 8 | 11 (eyebrow, Recovery card with chip, two readouts and band, Day card with meta, ring and anchor, the top of Steps) | Lower than today, or a reason |
| Verbs | One, leave, and it has no visible control | One, Read again, 99×31 pt, 1,316 pt down; none in the empty, loading and error states | One primary, one quiet alternative, talk back |
| Type sizes besides numerals | 5 (11, 12, 12.5, 13.5, 16) in 3 families; numerals 16, 34, 96 | 4 (11, 12.5, 14, 17); numerals 11, 12.5, 19, 30; on the Mac the chart labels scale to about 29 | ≤ 3 |
| Tap floor | The whole screen is the one control: no role, no label, not focusable | 1 control, 31 pt tall (under 44, over 28) | ≥ 28; ≥ 44 primary |
| Gestures | Tap anywhere leaves; the edge swipe also goes back in the installed app (depth above 0), to a different place than the tap | Scroll only | Every capability has a pixel he can tap |
| Motion | Arrives with the page rise; the state change is a cut (the declared 2 s transition never runs); the colon blinks and the pulse rises under Reduce Motion | 90 ms stagger rise; no exit; slides 12 pt under Reduce Motion | All four |
| States | Loading: none; unknown: no wash, "no signal" in the warn colour; stale: tiles dim past 15 min, the wash does not; error: none | Loading: one line, no skeleton; empty: one line naming a missing button; error: the raw error, no retry; per-instrument absence: honest | All four designed |
| Height | Non-scrolling: 951 pt in 844 upright, 770 in 390 on a stand, 800 in 800 on the Mac | 1,454 pt (1.72 screens) at 390; 2,072 pt (2.59 screens) at 1280 | Fits a wall; ≤ 4 screens |
| Width | `scrollWidth` 390 at 390 (the pulse strip runs from −31 to 421 inside the clipped root) | 390 at 390 | 390 |
| Doors | Index row 23 of 24 (1,539 pt down a 1,825 pt page, no value); the Nova screen's menu when live; the classic Voice chip only outside summary | Index row 22 of 24 (no value); a Mac sidebar row; no `navigate('console')` anywhere | Findable |
| Cost | 2 cores drawing every frame (one hidden under the wall); 43.8 fps under 4× throttle | 2 WebGL figures redrawing every frame at rest (about 3,200 draw calls a second) | A wall that runs for hours cheaply |
| Idioms | No style branch | No style branch; Command frames inside summary | Both checked |

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 · The way out is invisible, lands on the wrong page, and one bump ends the wall
`Ambient.jsx:71`, `valsOps.js:249`, `App.jsx:1195`, `App.jsx:1026`; demo frames at 390 and 1280

The whole wall is one `onClick` with `title="Tap anywhere to return"`, the
only sign it can be left; a touchscreen never shows a title. The tap calls
`navigate('mission')`, which pushes a new history entry: entered from the
Index, a tap lands on Home, and Back from Home opens the wall again (measured:
`#/index` → `#/ambient` → tap → `#/mission`, Back → `#/ambient`). In the
installed app the edge swipe goes back to the Index instead, so the two exits
land in two places. Escape does nothing on the Mac (the global handler at
`App.jsx:1026` never mentions Ambient). The root has no role, no label and
`tabIndex` −1. And because any tap leaves, a hand reaching past the phone on
its stand ends the wall and its wake lock.

| Before | Why | Severity |
| --- | --- | --- |
| Tap anywhere leaves, to Home, with the wall left one Back away; no visible control, no keyboard path, no label | `modality.md › Best practices`: "Always give people an obvious way to dismiss a modal view... in iOS... people typically expect to find a button in the top toolbar or swipe down; in macOS... a button in the main content view." `gestures.md › Custom gestures`: "Use shortcut gestures to supplement standard gestures, not replace them." `going-full-screen.md › Best practices`: hidden controls should come back "with a familiar gesture or action like tapping", and `› Mobile`: "Consider deferring system gestures to prevent accidental exits". `accessibility.md › Mobility`: "Offer alternatives to gestures." | Critical |

### 2 · The wall does not fit a phone, and on a stand it shows none of its numbers
`Ambient.jsx:72, 92-121`; harness frames at 390×844 and 844×390

The wall is a non-scrolling `justify-content: space-between` column inside
`overflow: hidden`. With every row it can show, it is 951 pt tall in an 844 pt
screen: the three receipts sit below the edge and the pulse strip is cut at
the bottom and both sides. On a stand (844×390) it is 770 pt tall: the clock,
the date, the sync label and the top 238 pt of the core are on screen, and the
tagline, all four tiles (the waiting count included), the streaks, the pulse
and the receipts are not. Only the Mac, the screen it was first written for
(its comment says "for the Mac (or any spare screen)", `Ambient.jsx:10`),
fits. Demo mode hides the problem: with no data the column is short enough.

| Before | Why | Severity |
| --- | --- | --- |
| A portrait column, clipped; 0 of 4 numbers visible in landscape | `layout.md › Phone (iOS)`: "Aim to support both portrait and landscape orientations." `widgets.md › StandBy and CarPlay`: StandBy shows "two small system family widgets side-by-side, scaled up so they fill the Lock Screen", and "Glanceable information and large text are especially important". | Critical |

### 3 · The state colour cannot be read from the room, and its change is a cut
`Ambient.jsx:73-78`, `valsOps.js:280`; computed, and measured in the harness

The wash is `color-mix(… 7%)` of gold or cyan in a radial gradient centred
behind the core. Its brightest pixel is #131111 for "something waits" and
#0a151b for "all clear": 1.02:1 between them, 1.08:1 and 1.10:1 against the
ground. The 300-point core sits at the gradient's centre and outshines it.
When the state changes, the computed background swaps on the next frame: the
`transition: background 2s` never runs because gradients do not interpolate
(Chrome; WebKit not verified). Arrival from "unknown" mounts the layer with no
transition at all. The waiting count itself is a weight-300, 34-point digit in
the second row of a 2×2 grid. Cyan also now means Nova thinking (his 4 Oct
call), so "clear" shares a colour with a core state.

| Before | Why | Severity |
| --- | --- | --- |
| A 7% wash for the wall's one message, changing by a cut | `widgets.md › StandBy and CarPlay`: "Limit usage of rich images or color to convey meaning in StandBy. Instead... scaling up and rearranging text so people can glance at the widget content from a greater distance." `accessibility.md › Vision`: "Convey information with more than color alone." `color.md › Best practices`: "Avoid using the same color to mean different things." NOVA-METHOD §2b rule 8. | High |

### 4 · Labels a room cannot read
`Ambient.jsx:46-53, 89, 113, 125-126, 142-143, 163-165`; computed on #04050a

Every label is a tracked micro token at 24 to 38% ink. Computed contrast:
tile labels 2.5:1, the date 2.8:1, subs and streak labels 2.3:1, receipt
labels 3.1:1, the pulse source 2.2:1, and the sync age, the wall's honesty
signal, 1.9:1. Only the clock (14.5:1), the tile numerals (12.3:1), the
tagline (6.7:1) and the pulse title (5.5:1) pass. The tracked capitals were
left on purpose on 6 Sep as "a wall face" (design memory); that call predates
his summary choice.

| Before | Why | Severity |
| --- | --- | --- |
| Labels at 1.9 to 3.1:1, 11 to 13.5 pt | `accessibility.md › Vision`: "Up to 17 pts... 4.5:1". `typography.md › Ensuring legibility`: "People need to be able to read your content at various viewing distances", and "avoid light font weights". `widgets.md`: "Support the Always-On display... make sure your content remains legible." | Critical |

### 5 · The core is the dearest object in Nova, it runs the longest here, and a second one draws unseen underneath
`Ambient.jsx:93`, `NovaCore.jsx:1066-1131`, `NovaCore.jsx:634`; ten seconds measured in the harness

The wall draws the hologram at 300 points (the full preset) with no frame cap,
and the wake lock keeps the page visible, so the loop never pauses. Under the
wall, the tab bar's 58-point orb keeps drawing too: its IntersectionObserver
and `checkVisibility` cannot see that it is covered. Measured over ten
seconds in Chrome on this Mac: both cores drew 590 of 591 frames; the wall's
core about 1,670 draw calls and 19,500 path points a frame (2.1 ms of script),
the hidden orb about 1,110 draw calls (1.3 ms). Under the house 4× CPU
throttle the wall held 43.8 fps, with 9.0 ms of script for the core and 5.0 ms
for the hidden orb: over a third of the drawing goes to something nobody sees.
At 60 frames that is roughly twelve minutes of main-thread script an hour on
this Mac, before raster; a 120 Hz phone asks for twice the frames. Burn-in:
the hourly drift wraps only the lower block (`Ambient.jsx:97-100`); the clock
at 92% white, the core and the corner label never move.

| Before | Why | Severity |
| --- | --- | --- |
| A full-size core at the display's rate for hours, plus a hidden one; the brightest parts never drift | `motion.md › Leveraging platform capabilities`: "Let people customize the visual experience... to optimize performance or battery life." `widgets.md`: "render widgets... with reduced luminance". Memory `nova-ui-performance`: "count the rAF loops and canvas calls per frame". Burn-in: judgment. | High |

### 6 · Console has no door he would find
`indexGroups.js:14`, `valsChrome.js:210`, `valsIndex.js:128`; demo frames

Console is reached from row 22 of 24 on the Index (1,487 pt down) with no
value beside its name, and from a Mac sidebar row that wears the same house
glyph as Library, Leader and Practice. No `navigate('console')` exists. The
inventories' first doors were partly stale: under summary, Ambient also has an
Index row (23 of 24) and a "full screen" item in the Nova screen's menu when
live (`NovaThread.jsx:605`, `valsNovaThread.js:146`); Voice's "◐ Ambient"
chip (`Voice.jsx:587`) renders only outside summary (`Voice.jsx:91`). What
matters for C1: the five instruments already reach him another way. The
morning show builds them once and raises them on the glass as it speaks
(`morningShow.js:194-197`: "the console and the brief must never be able to
disagree about his heart rate"; `StageCard.jsx:38-59`).

| Before | Why | Severity |
| --- | --- | --- |
| A page with two deep doors and no reason given to open it | `designing-for-ios.md › Best practices`: "making secondary details and actions discoverable with minimal interaction." Design memory, 7 Sep: "a build is not done until you can name the pixel he taps." | High |

### 7 · Console's states point at nothing
`Instruments.jsx:343-353, 364-372`, `ConsoleScreen.jsx:20`; demo frames

Empty, the page says it has read nothing and to "tap Read again", and there
is no button: Read again renders only once data exists (0 buttons measured).
The error state prints the raw error with no retry; loading is one line with
no skeleton. With data, Read again is 31 pt tall at the foot of the page. The
subtitle "Your day, drawn" is passed as `note` to `ScreenHead`, which has no
such prop (`Controls.jsx:379`), so it never renders.

| Before | Why | Severity |
| --- | --- | --- |
| An instruction to tap a missing button; an error with no way forward | `feedback.md › Best practices`: "Show people when a command can't be carried out and help them understand why." `loading.md › Best practices`: "Show something as soon as possible... placeholder text, graphics, or animations". | High |

### 8 · Console's colours mean something else on Home
`Instruments.jsx:19-22`, `MissionSummary.jsx:352-357`, `index.css:645`

Console: recovery green, the day cyan, steps gold, training violet, fuel
magenta. Summary Home: protein green, steps violet, sleep cyan, training
cyan, gold for waiting on his call. Four of five disagree, and gold, his
"not yet decided" colour, is spent on steps. The same hues ride onto the glass
when the brief raises these instruments.

| Before | Why | Severity |
| --- | --- | --- |
| Five instrument hues, four contradicting Home | `charting-data.md › Designing effective charts`: "Maintain continuity among multiple charts that use the same data... consistent colors". `color.md › Best practices`: "Avoid using the same color to mean different things." §2b rule 8. | High |

### 9 · VoiceOver hears half of Console
`Instruments.jsx:96, 139, 192`; harness sweep

Every chart is an `aria-hidden` SVG. 38 of the page's 79 text items are inside
them: each day's steps and weekday, the floor, the shortfall, the usual HRV
range, the day ring's hours and the time of "the one that matters".
VoiceOver hears "Deep work" but not when, and "banked" but no day.

| Before | Why | Severity |
| --- | --- | --- |
| Charts hidden from assistive technology with no label | `charts.md › Enhancing the accessibility of a chart`: "a chart often needs to offer an accessibility label for each important or interactive element", and "Health offers an accessibility label for each bar in the Steps chart". `charting-data.md › Best practices`: "Make every chart in your app accessible." | Critical |

### 10 · Reduced motion still blinks and rises
`Ambient.jsx:87, 162`, `Instruments.jsx:358-360`

The colon's `dotBlink` and the pulse strip's `fadeUp` are inline animations
no reduced-motion rule reaches (the rules in `index.css` are class-scoped).
Console's stagger still slides 12 pt. The core (a still frame) and the
count-ups (a jump) do the right thing.

| Before | Why | Severity |
| --- | --- | --- |
| A repeating blink and a rise under Reduce Motion | `accessibility.md › Cognitive`: "Be cautious with fast-moving and blinking animations... ensure your app... responds by reducing automatic and repetitive animations". | High |

### 11 · On the Mac the instruments have no width
`valsChrome.js:164`; demo-shaped frame at 1280

`wrapConsole` has padding and no maximum width, so each 360-unit SVG scales
2.67× to 960 pt: the day ring alone is 629 pt tall, its 11-point labels render
near 29 pt beside 14-point text, and the page grows to 2.59 screens, taller
than on the phone.

| Before | Why | Severity |
| --- | --- | --- |
| Charts stretched to the column | `designing-for-macos.md › Best practices`: "a comfortable information density that doesn't make people strain". `charting-data.md`: "Match the size of a chart to its functionality". | Medium |

### 12 · Two bodies, one picture
`Instruments.jsx:260-321`; harness frame

Training and Fuel draw the same figure in the same pose with the same muscles
lit, the "debt" palette (#e08a6a, #e0b26a) almost the chest and shoulder hues.
The difference ("what today works" against "what is waiting to be rebuilt")
does not show. Both WebGL scenes redraw every frame at rest: about 3,200 draw
calls a second, measured.

| Before | Why | Severity |
| --- | --- | --- |
| Two near-identical figures a screen apart | `charting-data.md › Designing effective charts`: "Prefer consistency... deviating only when you need to highlight differences." | Medium |

### 13 · Collisions inside the instruments
Harness frames at 390

The day ring's "00" runs into its header; "THE ONE THAT MATTERS" crosses the
18:00 arc; the 8.8k bar label sits on "FLOOR 8,000"; the warn note covers
"SHORT OF". On the wall, the tagline touches NEXT, and the tiles are ragged
(`align-items: flex-end`: a tile with no sub line sits lower).

| Before | Why | Severity |
| --- | --- | --- |
| Overlapping labels; misaligned tiles | `layout.md › Visual hierarchy`: "Align components with one another to make them easier to scan". | Medium |

### 14 · The pulse strip is a nine-second timer on text he cannot read
`Ambient.jsx:150-168`

One topic every nine seconds, in 11 to 12 pt type at 28 to 55% ink; on a
phone it is also cut on both sides.

| Before | Why | Severity |
| --- | --- | --- |
| A rotating strip | `accessibility.md › Cognitive`: "Minimize use of time-boxed interface elements." | Medium |

### 15 · The wall cannot hear him
`valsChrome.js:516`

"Hey Nova" is blocked while Ambient is up. The screen made to be seen from
across a room cannot be spoken to from across it. Possibly deliberate (a
closed microphone on an unattended screen); nothing in source says why.

| Before | Why | Severity |
| --- | --- | --- |
| Wake word off on the wall | Judgment; a design question for him | Low |

### Smaller things seen
- **The wash does not age.** Stale dims the lower block to 55% and turns the
  corner warn (`Ambient.jsx:65, 100, 125`), but the wash keeps glowing the
  cached state (`liveOps` is a cached key, `App.jsx:388`).
- **"No signal" wears the warn colour,** a red-family hue, on the screen whose
  main object is the core that turns red only when Nova pushes back.
- **The wall's core never changes state.** It gets no `thinking` or
  `speaking` props (`Ambient.jsx:93`), the one core in the app that never
  wears Nova's turn.
- **Console's stagger is 90 ms by `setInterval`** (`Instruments.jsx:339`);
  the house stagger is 45 ms.
- **The Mac sidebar gives Console the house glyph** shared with Library,
  Leader and Practice.

---

## 3 · Keep

- **Honest absence, everywhere.** No wash when the state is unknown ("a room
  that glows 'clear' with the server down is a lie on the wall",
  `Ambient.jsx:75`); missing figures as missing; the sync age that warns past
  15 minutes and dims the numbers (`valsOps.js:266-269`); each instrument's own
  "nothing to draw" with its reason (`Instruments.jsx:45-54`); the week's
  broken trace and dashed missing day with "the push is not running"
  (`Instruments.jsx:191, 203-219`).
- **One build, two consumers.** The morning show and Console read the same
  `buildInstruments` (`morningShow.js:194-197`).
- **The instrument forms.** HRV against his own band, not a population norm;
  a 24-hour ring with the longest block ahead lit; a week whose holes show;
  the session on his own body. They are forms, not boxes (§2b rule 7).
- **Count-ups that act out change.** `CountUp` animates only when a value
  changes while the wall is up, and jumps under reduced motion
  (`CountUp.jsx:15-33`).
- **The wake lock** with re-acquire on visibility (`Ambient.jsx:26-42`).
- **The black ground** (#04050a): StandBy's "blend with the black background".
- **Gold for the gate** (`Ambient.jsx:107`), the house meaning of gold.
- **The core's still frame under reduced motion** and its pause off screen
  (`NovaCore.jsx:1090-1131`).

---

## 4 · Directions for the mockup round

Drawn as `design/mockups/81-redesign-ambient-console.html` (A, B and C
switched at the top, five frames each: upright 390×844, on a stand 844×390,
the MacBook 1280×800, the way out, and where Console lives). The counts are
the page measuring its own frames by the rules in §5. Today: upright 13 of 16
objects in view with 3 cut off; on a stand 4 of 16; on the Mac 16 of 16.

**Every direction carries the same fixes:** a tap shows controls (Done, Dim and
one more), Done, Esc or a swipe down leaves back to where he came from, and a
bump never ends the wall; it fits upright, on a stand and on the Mac; gold is
the only colour that asks (a light along the foot, the count, the names), all
clear is quiet ink, no signal is grey with words; the core is smaller and
capped, the tab bar's orb stops drawing under the wall, and the whole wall
drifts; reduced motion holds still; Console gets labels for VoiceOver, Read
again in every state, a skeleton, and Home's hues; the pulse changes every two
minutes.

**A · A glance (StandBy).** The time, the core at 104, one gold number for
what waits and who, then Next, Steps and Protein; Lately (pulse, receipts,
streaks) is the wall's second page. **Removes** the washes, the tracked
capitals, the nine-second timer, the hidden orb's drawing. **Moves** Lately to
page two and **Console onto Home** as a morning card, "Your day, drawn", one
instrument at a time, from 05:00 to 11:00 or until all five are seen, pinnable.
C1 answer: a Home section; the route and its Index row go; Home gains one card
in the morning. **Measured: upright 9 in view, none cut off; on a stand 9;
Mac 16; 3 text sizes (13, 15, 24); smallest control 44.**

**B · The day, as a dial.** The 24-hour ring becomes the clock face (blocks as
arcs, the longest ahead lit, the hand at now, Nova at the centre); Recovery,
Steps, Training and Protein sit under it as small instruments; the waiting
count is one gold line. Steps and Protein stop being tiles and become their
instruments, so nothing is said twice. **Removes** the Console route and one
Index row. C1 answer: retired; the wall does its job, Play the morning
replaces Read again, the Index shows one row instead of two, and the Mac
sidebar trades Console for the wall's first sidebar door. The cost: seeing
the instruments means opening the wall. **Measured: upright 12 in view, none
cut off; on a stand 12; Mac 18; 3 text sizes; smallest control 44 where any.**

**C · The org.** His ten agents around Nova fill the wall (his yes in
principle, 25 Sep, AGENT-WORLD-PLAN step D); a gold count rises and a ring
lights over whoever waits, and the sentence names them. C1 answer: Console
stays a screen, renamed Your day, with three doors (Home's morning read, an
Index row with a value, the wall's controls), the news line first, Home's
colours and Read again in reach. The cost: ten hues on a wall where StandBy
asks for little colour, a 3D scene running for hours (render on demand), and
the most build. **Measured: upright 9 in view (the org counts as one), none
cut off; on a stand 9; Mac 16; 3 text sizes; Your day's door 48 pt.**

**What the pixels argue for.** The fixes above are the bulk of the gain and
are the same in every direction. Between them, A is the smallest step and the
most like the platform; B answers C1 by removing a screen and gives the wall a
reason to exist each morning; C honours a plan he already liked and costs the
most. My pick is B's Console answer on A's quiet rules: if he uses the wall,
the dial; if he will rarely open a wall, A, so the instruments live on Home
where he already looks each morning.

---

## 5 · Method

**Frames, demo only.** A detached worktree of `main` (97f2205) ran Vite on
5211; the chrome-devtools MCP opened it in an isolated context (`wall`),
emulated at 390×844×3 mobile touch before the first navigation, later
844×390×3 landscape and 1280×800×2. His look was set in `localStorage`
(`novaos.style=summary`, `theme=command`, `material=glass`,
`core=hologram`) with a guard rejecting every non-GET fetch, XHR and beacon.
"Demo data" was on screen and `connectionStatus` was `demo` throughout.
Ambient was entered through its Index row, as he would.

**The harness.** Demo mode clears every live slice, so Ambient shows dashes
and no wash, and Console shows its empty line. For the connected layout the
dev hook `window.__novaApp` was used, still in demo mode: `renderVals()` was
wrapped to override only the `ambient*` keys with demo-shaped values (three
waiting, a next event, steps, protein, three streaks, two pulse items, three
receipts, synced two minutes ago), and `setState({ liveInstruments })` was
given a payload in the shape `server/lib/instruments.js` returns. Nothing else
read either value; nothing was sent. Structure, sizes and clipping are the
components' own; content lengths are invented.

**Sweeps.** Type sizes: every text node's computed `font-size`, numerals
apart. Objects: readable units and controls intersecting the screen.
Contrast: computed from the token values over #04050a. Width:
`documentElement.scrollWidth`. The core: `CanvasRenderingContext2D` methods
and `requestAnimationFrame` callbacks wrapped for ten seconds, calls and
script time attributed per canvas, at 1× and under a 4× CPU throttle. The wash
transition: the computed `background-image` sampled over 2.1 s after a state
change, and `getAnimations()`.

**Network.** Across every navigation the page made GETs for one icon and
nothing else; the guard recorded no blocked write. Two honest gaps: switching
to the desktop viewport reloaded the page and dropped the guard, and my first
re-installation changed only the hash (no new document), so the guard was
absent from that reload until a navigation with a query string re-installed
it. The network log for that window shows only the icon GETs; demo mode has
no backend configured.

**HIG pages opened and quoted:** accessibility, layout, typography, color,
dark-mode, designing-for-ios, designing-for-macos, motion, modality, gestures,
going-full-screen, widgets, charting-data, charts, feedback, loading.

**Not seen.**
- His real data, a real sync, a real stale or offline wall, a real error.
- WebKit: whether the wash cross-fades there, the wake lock in the installed
  app, the core's raster cost on his phone, the edge swipe on the wall.
- The cupertino and command styles (summary only).
- Hours of burn-in; the drift was read from source.
- Console's Body3D at speed (SwiftShader draws a few frames a second).

**Inventory notes, confirmed or corrected.**
- "Its one way in is Voice's ◐ Ambient chip": **corrected**. Under summary,
  the Index row and the Nova screen's menu; the chip renders only outside it.
- "Console: no `navigate('console')` call site": **confirmed**; the Index row
  (summary) and the Mac sidebar are its doors.
- `Instruments.jsx` "not surveyed": now read in full; it also serves the glass
  through `StageCard.jsx`.

---

## 6 · His answers, round 1

(Waiting. Mockup: `design/mockups/81-redesign-ambient-console.html`.)
