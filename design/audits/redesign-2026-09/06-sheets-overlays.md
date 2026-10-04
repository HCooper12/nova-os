# 06 · Sheets, overlays and feedback · audit, 5 Oct 2026

TIER 0.2 of the redesign (`design/REDESIGN-CHECKLIST.md` §5, rows O1 to O12):
the chrome every screen shares when something has to sit on top of it. The
sheets, the hold menu, the swipe row, the Dynamic Island, the voice layers,
the offline line, the launch screen and the exits. Decisions X1 (a spring
system), X2 (exits everywhere), X5 (a haptic on a sheet flick) and X4 (the
fade under floating chrome) are raised here, each with a recommendation, and
drawn in mockup 71 (`design/mockups/71-redesign-sheets.html`).

Evidence: the source of every component on the row list read in full
(`GlassSheet.jsx`, `useSheetDrag.js`, `sheetPhysics.js`, `ContextMenu.jsx`,
`longPress.js`, `SwipeRow.jsx`, `swipeAction.js`, `swipeReveal.js`,
`swipeCore.js`, `DynamicIsland.jsx`, `island.js`, `islandCore.js` (springs and
layout), `VoicePresence.jsx`, `VoiceHalo.jsx`, `Skeleton.jsx`, `Boot.jsx`,
`useExit.js`, `haptics.js`, `PinnedEditSheet.jsx`, the banner in `App.jsx`),
plus a census of all 36 overlay surfaces in `src/` (§5). Then the live app in
DEMO MODE ONLY: a detached snapshot of `922ffc6` on Vite :5201, Chrome at
390×844 @3x with touch, his look set before load (`summary`, `command`,
`glass`, `hologram`), every non-GET request refused by a guard, and the guard
saw zero requests of any kind all session. Motion was measured by sampling
computed opacity and transform every frame (`requestAnimationFrame`) and by
reading `document.getAnimations()`, including the View Transition
pseudo-elements; drags were driven frame by frame with pointer events. Read
under `apple-design`, `apple-hig-review`, `emil-design-eng`,
`interface-design`, `animate` and `mobile-native`, with these HIG pages open:
`sheets.md`, `modality.md`, `context-menus.md`, `action-sheets.md`,
`motion.md`, `playing-haptics.md`, `feedback.md`, `loading.md`,
`accessibility.md`, `typography.md`, `color.md`, `gestures.md`,
`designing-for-ios.md`, `liquid-glass.md`. Cited as `file.md › Heading`;
"judgment" where no page applies. No screenshots are in the repo.

---

## 1 · Verdict

**Critical issues.** The parts are good and they no longer agree. Nova has
the right physics written down (momentum projection, an 80 ms velocity
history, interruptible grabs, a tested spring engine behind the island) and
the right instincts (leave the way you came, glass that materialises, honest
haptics). But the chrome has grown six different sheets, fourteen different
dims and twenty-one stacking layers, and the dialects have drifted until some
of them stop working. The number that says it: **pull the grabber on five of
the nine sheets that have one, and nothing moves.** His finger travels, the
sheet stays where it is, and if he pulled far enough it vanishes when he lets
go. Those five are the summary-style sheets he actually meets: Edit Pinned on
Home and on Fuel, the lift and Coach sheets in Train, the session sheet and
the Inbox report. The cause is one word of CSS.

Around that: a closed sheet is followed by a second, whole-page photo
cross-fade (and a thrown sheet comes back fully open for a frame before it
fades); a notification posted while any sheet is open lands underneath it,
and tapping where it is closes the sheet instead; the offline line is 10.5 pt
mono and clips the very time it is being honest about; no thrown sheet ever
lets go of its dim; and with Reduce Motion on, every fade goes too.

What this chrome will be remembered by today is the island. The redesign's job
is to make the sheet, the menu and the toast feel like the same material
obeying the same physics, so there is one of each.

### Clutter numbers, as it stands (checklist §3)

| Test | The chrome today (measured unless marked source) | Target |
| --- | --- | --- |
| Focal point | Sheets: yes, the title and its content. Hold menu: the thing he held is hidden behind the dim (no preview). Island: the sentence, but 0.6 s after the cause. Offline line: the time it is from is cut off at 390 | One, first, and never clipped |
| Object count | 6 sheet looks · 14 dim recipes · 21 z-index values · 9 entrance motions (census, §5) | 1 · 1 · about 5 · one per object |
| Verbs per card | Island: up to 3 chips + tap + throw. Hold menu: 2 to 7 items (source), no Cancel, no preview. Sheets: Done or Close (GlassSheet's Close sits trailing) | One primary, one quiet alternative, talk back |
| Type sizes | 12 across the chrome: 10.5, 11, 11.5, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 26 (live + source) | ≤ 3 plus numerals |
| Tap floor | Island chips 32 pt (measured 59×32, 88×32). Transcript mic 30×26 and its close ~19×19 (source), under the 28 pt floor. Done/Close 44, grips 44×52 | ≥ 28 pt; ≥ 44 pt primary |
| Gestures | 9 sheets offer drag-to-dismiss and 5 do not move; long-press gives nothing for 480 ms on iOS; swipe row and island throw are right | Every gesture tracks the finger |
| Motion: entrance | 9 recipes (FLIP, nvMaterialize 8 px/440 ms, nvFsSheetIn 40%/380 ms, sheetUp 24 px/280 ms, fadeUp, nvSumCapIn, nvGlassIn, popIn, island springs) | One per object type |
| Motion: exit | Button path: 18 of 36 overlay surfaces animate out. Throw path: 0 of 9 sheets release the dim. History path: 9 overlays end in a whole-page cross-fade | All, by the path they came |
| Motion: interruptible | Sheets yes (presentation value read on grab), island yes (springs), useExit exits no (a timer), menu n/a | All |
| Motion: reduced | A global rule makes every CSS animation instant and removes transitions (`index.css:2592-2596`); useExit closes with no fade; island fades 240 ms; GlassSheet fades in over 1 ms | 200 ms cross-fades everywhere |
| States | Loading: Boot (the Command HUD, a 350 ms blink then a cut) and skeletons only on Inbox among the summary pages. Offline: clipped line, no retry. Error: island `warn`, invisible under any open sheet | All four, designed |
| Width | `scrollWidth` 390 on Home, Fuel, Recipes, Train, Shopping, Ops and every sheet opened | 390 |
| Idioms | Summary (his) measured; cupertino and command read from source only | Both checked |

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 · Five of nine sheets do not move when he pulls the grabber
`index.css:3250-3251`, `useSheetDrag.js:98-113`, `PinnedEditSheet.jsx:178`,
`DeeperReportSheet.jsx:69`, `screens/TrainSummary.jsx:639, 716`,
`screens/SessionSummary.jsx:562`

`.nv-materialize` runs `nvMaterialize … both`. A CSS animation with a forwards
fill keeps applying its last keyframe (`transform: none; opacity: 1`) after it
ends, and animations outrank inline styles in the cascade, so every
`style.transform` that `useSheetDrag` writes is overridden. Measured on Edit
Pinned: with the finger 60 px down, the inline style read `translateY(60px)`
and the computed transform read `matrix(1, 0, 0, 1, 0, 0)` on every frame;
the sheet's top stayed at 386. Past the 80 px threshold the sheet stayed put
until release, then vanished. The four sheets without the class (GlassSheet,
the Fuel recipe sheet, ExerciseSheet, PortionSheet) track the finger 1:1.
GlassSheet's own comment names this trap for WAAPI and cancels its animation;
the CSS class reintroduced it. The fix is `both` to `backwards` (or the WAAPI
cancel GlassSheet uses). The same rule is the same in WebKit, so it should
reproduce on his phone; one pull on Edit Pinned confirms it.

| Before | Why | Severity |
| --- | --- | --- |
| Grabber on 5 summary sheets ignores the finger; the sheet disappears on release if pulled past 80 px | `sheets.md › Mobile (iOS, iPadOS)`: "Support swiping to dismiss a sheet. People expect to swipe vertically to dismiss a sheet instead of tapping a dismiss button." `gestures.md › Best practices`: "As people perform a gesture in your app, provide feedback that helps them predict its results." | High |

### 2 · Closing a sheet runs a second, whole-page transition; a thrown sheet comes back for a frame
`App.jsx:973-992` (`popH`), `App.jsx:3533-3536` (`closePinnedEdit`),
`useSheetDrag.js:65-70`

Nine overlays live on their own history entry (`artifact`, `capture`,
`deeper`, `fuelCards`, `novafocus`, `pinned`, `recipe`, `record`,
`traincoach`), so closing one calls `history.back()`. `popH` sees the same
screen and runs `withTransition`, the whole-page View Transition that mockup
70 retired for card taps because it photographs the tab bar and doubles it.
Measured: Done on Edit Pinned plays its own 170 ms fall, then
`document.startViewTransition` fires at 179 ms. Worse on a throw: on the Fuel
recipe sheet the sheet slid to 840 px with the dim still at full strength,
then at 439 ms `useSheetDrag` reset its inline styles before the asynchronous
close landed, so the sheet stood back at its resting position, fully opaque,
and the View Transition that started at 476 ms photographed it open and
cross-faded it away (old picture out by 616 ms, new in by 756 ms).

| Before | Why | Severity |
| --- | --- | --- |
| Every close of a history-level sheet ends in a whole-page photo cross-fade; a thrown recipe sheet reappears open for a frame, then dissolves with the page | `motion.md › Providing feedback`: "Strive for realistic feedback motion that follows people's gestures and expectations… feedback motion that doesn't make sense can make them feel disoriented." apple-design §7, spatial consistency: what leaves one way does not come back to leave again | High |

### 3 · The island drops underneath every sheet
`DynamicIsland.jsx:617` (`zIndex: 95`) against the census in §5

The island's layer is 95. Nineteen overlays sit above it, including every
summary sheet (112 to 145), the hold menu (120) and the voice layers (112).
Measured with Edit Pinned open: a "Logged · Undo" notice rendered at full
opacity behind the blurred dim, and the element under its centre was the
sheet's dim, so a tap there closes the sheet instead of pressing Undo. Any
toast fired from inside a sheet (a portion logged, a setting saved, a write
refused) is invisible exactly while he is acting.

| Before | Why | Severity |
| --- | --- | --- |
| Notices and failures land under 19 overlays; a tap meant for them closes the sheet | `feedback.md › Best practices`: "Show people when a command can't be carried out and help them understand why." Judgment: the island is hardware-shaped; nothing on screen should cover it | High |

### 4 · The offline line is 10.5 pt mono and cuts off the time it is honest about
`App.jsx:10884-10895`, `vals/valsMission.js:684-690`

`font: 500 10.5px var(--nv-font-mono2)`, `white-space: nowrap`, `max-width:
92vw`, ellipsis. At 390 the box is 359 px; the app's own string, verbatim,
`Backend unreachable — showing data saved 04 Oct, 23:25`, needs 406 px, so
it reads "…showing data saved 04 O…". The degraded line ("7 of 12 sections refreshed; the rest show what Nova
last saved") needs 651 px. It is the only mono text left on the summary
pages, its colours are hard-coded rgba, it offers no retry, and it sits 8 pt
above the tab bar over the content with no space reserved (seen covering the
Trends card).

| Before | Why | Severity |
| --- | --- | --- |
| 10.5 pt, below the iOS minimum; the "when" of last-known data clipped | `typography.md › Ensuring legibility`: "iOS, iPadOS: 17 pt default, 11 pt minimum." NOVA-METHOD: honest degradation, "stale data self-labels"; a label that loses its date does not | Critical |

### 5 · A thrown sheet never lets go of its dim
`useSheetDrag.js:55-77`, every `useSheetDrag(onClose)` call site (9)

All nine draggable sheets pass their raw `onClose` to `useSheetDrag`, not
`exit.close`, so after a throw the dim (up to 70% void plus a 10 px blur)
holds at full strength and disappears in one frame when the sheet unmounts.
Measured on GlassSheet and the recipe sheet: dim opacity 1.0 on every frame
of the throw, then gone. GlassSheet's button close does the same at the end
of its reverse morph: it shrinks to a 40% ghost over the card while the page
stays dimmed and blurred, then both cut at 345 ms. On iOS the dim follows the
sheet: half way down, half the dim.

| Before | Why | Severity |
| --- | --- | --- |
| Dim and blur snap off at the end of every throw and of GlassSheet's close | apple-design §12: "Dim to focus… a modal task pairs the surface with a dimming scrim"; the scrim is part of the sheet and leaves with it. `motion.md › Providing feedback` (realistic, follows the gesture) | Medium |

### 6 · The rubber band is on the wrong side
`useSheetDrag.js:106-112`, `sheetPhysics.js:73-76`

Downward, the dismiss direction, the sheet follows 1:1 to 80 px and then
resists: finger 200 → sheet 138 (GlassSheet), finger 240 → sheet 159 (recipe
sheet). Upward, where there is nothing more, it hard-stops at 0 (`Math.max(0,
raw)`): finger −60 → sheet 0. iOS does the opposite: a sheet travels with the
thumb toward dismissal and stretches against the top edge.

| Before | Why | Severity |
| --- | --- | --- |
| Resistance on the way out, a wall on the way up | apple-design §2 (1:1 tracking: "touch and content should move together") and §9 (rubber-band at the boundary, not on the path). `gestures.md › Best practices` (responsive feedback during the gesture) | Medium |

### 7 · The hold menu: nothing during the hold, no preview, no way out but a cut
`ContextMenu.jsx:17-51`, `longPress.js:16-27`, `Interactive.jsx:106`,
`vals/valsTrainSummary.js:220-228, 351-357`

For 480 ms the only feedback is the ordinary .978 press; the "haptic" is
`navigator.vibrate(10)`, which iOS does not have, and bypasses `haptics.js`.
Then a solid near-black card slides 24 px up from the bottom edge, far from
the row he held, under an uppercase title ("PUSH DAY") that the vals produce
with `toUpperCase()`. The lists run to seven items: the mid-session exercise
menu puts a destructive "Report pain" third of up to seven, and a "▶" glyph
in a label (`vals/valsWorkouts.js:474-481`); a rotation slot can hold seven
(`vals/valsRecipes.js:353-362`). It has no Cancel, focus does not move into
it, Escape does not close it (measured), and dismissal is a cut (gone on the
first frame). Its dim is its own recipe (black 50% + 3 px blur).

| Before | Why | Severity |
| --- | --- | --- |
| No hold feedback on iOS, menu detached from what was held, caps title, up to 7 items with a destructive one mid-list, cut exit, no Escape | `context-menus.md › Best practices`: "Aim for a small number of menu items" and "list them at the end of the menu and identify them as destructive." `context-menus.md › Mobile (iOS, iPadOS)`: "Prefer a graphical preview that clarifies the target of a context menu's commands" and "Ensure that your preview looks good as it animates." `context-menus.md › Content`: "Include a title in a context menu only if doing so clarifies the menu's effect." NOVA-METHOD §2b rule 3 (sentence case in the vals) | Medium |

### 8 · Reduced Motion removes the fades too
`index.css:2592-2596`, `useExit.js:41`, `index.css:3261`,
`GlassSheet.jsx:39-40`

Under `prefers-reduced-motion` a global rule sets every CSS animation to
0.01 s and removes every transition; `useExit` closes with no animation;
`.nv-materialize` is `animation: none`. So sheets, menus and modals appear and
vanish on a cut, while the island (`REDUCED_FADE`, 240 ms) and GlassSheet's
close (140 ms) fade. Three answers to one setting. Not emulated live (the
browser tool has no reduced-motion switch); read from source.

| Before | Why | Severity |
| --- | --- | --- |
| Reduced motion means hard cuts on most overlays | `accessibility.md › Cognitive`: "Replacing transitions in x-, y-, and z-axes with fades to avoid motion." | Medium |

### 9 · Six sheet looks, fourteen dims, twenty-one layers
Census in §5; `GlassSheet.jsx:96-113`, `PortionSheet.jsx:24`

The same idea is drawn six ways: GlassSheet is the one sheet that is not glass
(solid `rgb(6,7,13)`, a hairline border, Close in the trailing corner); the
summary sheets are liquid glass with Done; the recipe sheet slides from 40%
with its own grabber (38×5 at 32% ink against 36×5 at 22% elsewhere);
PortionSheet has a green rim and a hard-coded 18 px radius; the hold menu is a
floating card; the older modals are centred panels. The dims: 14 recipes
from black 25% to `rgba(8,5,12,.82)`, blur 0 to 20 px, nine of them an old
hard-coded ink. The layers: 60, 72, 74, 80, 82, 85, 95, 96, 100, 110, 112,
113, 114, 115, 118, 120, 125, 130, 140, 145, 200.

| Before | Why | Severity |
| --- | --- | --- |
| One object, six looks; a sheet looks and moves differently depending on which screen opened it | `sheets.md › Mobile (iOS, iPadOS)`: "the Cancel button belongs on the leading edge of the top toolbar. When present, the Done button belongs on the trailing edge." `liquid-glass.md › Review checklist`, item 2 (restraint) and item 1 (layer discipline). NOVA-METHOD §2b rule 4 (tokens only) | Medium |

### 10 · The launch is the old HUD, and it cuts
`Boot.jsx:10-23`, `App.jsx:746, 792`

Every launch shows Command's HUD: two counter-spinning rings (one gold
dashed), "NOVA·OS" tracked at .34em with a cyan-violet gradient, three
uppercase tracked status lines ("VAULT · DEMO DATA / MODE · SHOWCASE /
AGENTS · CONCEPT PREVIEW" in demo) and a gold-to-cyan bar. On his phone
(connected, cached) it is a 350 ms blink; on a first connect up to 5 s. It
leaves on a hard cut (gone on the first frame, measured), straight into the
summary Home, a different design language.

| Before | Why | Severity |
| --- | --- | --- |
| A HUD flash and a cut before the calm Home he chose | `loading.md › Best practices`: "Show something as soon as possible." Judgment: the first frame of the app should be the app's own material; the core could settle into the tab bar's orb | Medium |

### 11 · The island takes 0.6 s to say "Saved", stays 5.8 s, and its chips are 32 pt
`islandCore.js:40-44, 306`, `DynamicIsland.jsx:611`

Measured: a plain "Saved to the vault" shows its first word at 0.61 s, is
fully readable at 1.12 s, starts fading at 4.3 s and leaves the screen at
5.8 s. The choreography is the reel's and it is lovely for news; for a
confirmation of his own tap the words arrive after he has looked away. The
action chips are 32 pt tall. A notice with actions auto-dismisses after
3.6 s unless its caller passes `duration: null`.

| Before | Why | Severity |
| --- | --- | --- |
| Slow words for quick receipts; chips under the default target; actions on a timer | `accessibility.md › Mobility` (44×44 pt default). `accessibility.md › Cognitive`: "Minimize use of time-boxed interface elements." apple-design §1: response is the foundation | Medium |

### 12 · The voice layers: gold for speaking, glyph caps, controls under 28 pt
`VoicePresence.jsx:82, 101, 144, 155-164`

The transcript header colours SPEAKING gold, while his 4 Oct calls made
speaking Living jade (`--nv-say`), thinking cyan and gold "not yet decided".
Labels are glyph-prefixed caps ("▶ TAP TO HEAR", "◆ EVIDENCE", "NOVA ·
LISTENING", "» ask"). The mic button is 30×26 and the close is a 15 px "×"
with 2×4 px padding, about 19×19, both under the 28 pt floor; the TAP TO HEAR
dismiss is 30×30. None of the four layers has an exit. Read from source: the
layer mounts only with a live conversation, which would open the microphone,
so it was not rendered for this audit.

| Before | Why | Severity |
| --- | --- | --- |
| Two controls under 28 pt; a colour that contradicts his newest map | `accessibility.md › Mobility`: "iOS, iPadOS: 44x44 pt default, 28x28 pt minimum." `color.md › Best practices`: "Avoid using the same color to mean different things." NOVA-METHOD §2b rule 8 | Critical (controls), Medium (colour) |

### 13 · Smaller things seen
- The hold menu's danger colour is `var(--nv-mag, #e0607e)`; `--nv-mag` does
  not exist (the token is `--nv-mg`), so the fallback hex renders
  (`ContextMenu.jsx:29`). Rule 4.
- Skeletons exist in four shapes, but among the summary pages only Inbox uses
  them; Home, Train and the Nova thread rely on Boot holding the first load.
- A recipe sheet opened in dev took about 320 ms to appear (its lazy chunk);
  production prefetches on idle, so this is a dev artefact, not a finding.
- GlassSheet's reverse morph ends at 40% opacity over the card and then cuts;
  it never lands.
- ExerciseSheet and PortionSheet have no exit on any path.
- `.nv-materialize` is also on RecordMoment and the More sheet, neither of
  which drags, so the fill does no harm there.
- The status line in demo reads `Demo data — connect your backend in
  Settings` (verbatim) on every screen but Settings, in the same 10.5 pt mono.

---

## 3 · Keep

- **The maths in `sheetPhysics.js`.** Apple's projection, release velocity
  from an 80 ms history, reverse-or-commit on the velocity's sign, a
  velocity-derived throw. Tested and right; the faults in §2 are layered on
  top of it.
- **The interruptible grab.** `useSheetDrag` reads the presentation value and
  pins it in the same frame, so a closing sheet can be caught.
- **The island.** Springs integrated per frame with velocity kept, the goo,
  the throw back up, the queue that never cuts a notice before it is
  readable, the clock that pauses in his pocket and under his finger, the
  Live Activity shell. Its spring engine (`islandCore.js:220-283`) is the
  answer to X1.
- **SwipeRow.** The iOS Mail grammar (reveal, full swipe, collapse then
  write), the direction lock that makes a scroll unable to delete, the edge
  guard, one open row house-wide, rubber-band past the row's width.
- **`useExit` as a pattern.** A hook that plays the exit and then calls the
  parent's close, on a timer rather than `animationend`.
- **GlassSheet's idea.** A card that grows into its detail and returns into
  it is the right spatial story; it needs the dim to go with it and to land.
- **The Edit Pinned sheet's content.** Health-style switches (real switches,
  so the tap ticks on his phone), the grip reorder with FLIP, Done at 44 pt.
- **`haptics.js`'s honesty.** It never fakes a haptic it cannot deliver.
- **The skeleton rule.** Never over real data, never on the offline path.
- **ScreenFallback.** One breathing dot, not a spinner.
- **Width.** Nothing scrolls sideways at 390.

---

## 4 · Directions for the mockup round

Counts below are for the chrome: sheet looks, dims, layers, entrance motions,
type sizes, and exit coverage. Today: 6 · 14 · 21 · 9 · 12 · 18 of 36 on the
button path and 0 of 9 on a throw.

**A · Tidy.** One of each, today's motion made consistent. Removes 5 of 6
sheet looks (one house sheet: the summary glass, grabber centred, title,
Done trailing, Cancel leading where a sheet can cancel), 13 of 14 dims (one
token), 15 of 21 layers (page chrome, the status line, sheets, menus, island,
with the update bar on top), the whole-page cross-fade after a close, the HUD
launch. Keeps today's entrance (the materialise, with the fill fixed), the
fall on every close path including a throw, the bottom action card for the
hold menu (now glass, with Cancel, an exit and Escape), the island's motion
and SwipeRow. Moves the island above every sheet and the offline line to
13 pt system type, time first. Counts after: 1 · 1 · 6 · 3 · 4 · 36 of 36 ·
9 of 9. No new motion system.

**B · Physical.** One spring, one path. Everything A removes, plus the
separate exit keyframes: a sheet travels from the bottom edge and back to it
on one spring, so opening, Done, a tap on the dim, Escape and a throw are the
same motion at different speeds, and the dim is the sheet's position, never a
separate fade. The hold menu grows out of the row he is holding: the row
lifts while he holds, so the 480 ms are visible, and the menu shrinks back
into it. Anything can be caught mid-flight. Keeps A's single sheet, dim and
layers, the island, SwipeRow's grammar (now settling on the spring). Counts
after: 1 · 1 · 6 · 1 spring with three origins (the bottom edge, the held row,
the island) · 4 · every path. X1: yes, from `islandCore.js`.

**C · In place.** Things open where he touched them and answer where he
acted. Removes the bottom sheet for anything that belongs to a card (the card
opens in place into its detail and closes back into it, GlassSheet's morph
made the default and made to land), the hold menu overlay (a held row opens
its actions inline beneath itself), and the top-of-screen toast for his own
actions (the receipt, with Undo, lands on the row or card he touched). Keeps
sheets for tasks only (Edit Pinned, forms), and the island for things from
elsewhere: Nova speaking, a workout running, a report ready, a failure. Moves
confirmations from the top of the screen to his thumb. Counts after: overlay
kinds he meets 4 (sheet, card, menu, toast) → 2 (task sheet, island) plus
in-place states; 1 dim; 5 layers; exits on every path by construction.

**D · What the pixels argue for.** Five bugs are each an hour or less and are
worth fixing whichever direction wins: the fill (finding 1), the second
transition and the flash-back (2), the island's layer (3), the offline line
(4) and the rubber band's side (6). Past that, A is the floor; B is the feel,
and it costs no dependency because the spring already ships inside the
island; C changes topology and is the boldest. My pick: B, with C's
in-place receipts for the actions his thumb takes (log, tick, delete), and
the island kept for everything that comes from elsewhere.

**The decisions this page carries:**

- **X1 · springs.** Yes to springs for gesture surfaces, no to the library:
  lift `createSpring` / `aim` / `stepSpring` out of `islandCore.js` into a
  shared module (already integrated per frame with velocity kept, already
  tested by `server/test/dynamicIsland.test.js`, already driving every
  notice the island shows). Apple's sheet (damping 0.8, response 0.3 s) is `{ duration: 400,
  dampingRatio: 0.8 }` in that engine's terms. Entrances stay on `--nv-ease`.
- **X2 · exits.** Yes, everywhere, as one rule: every overlay leaves by the
  path it came, its dim leaves with it, on every close path (button, dim,
  Escape, throw, Back), with no second page-wide transition; under Reduce
  Motion a 200 ms cross-fade. Today 18 of 36 on the button path, 0 of 9 on a
  throw.
- **X5 · a haptic on a flick.** No for sheets: Apple's own sheets do not tick
  when thrown away, and on his installed PWA code cannot fire one at all
  (`haptics.js`: iOS web only ticks when his finger is on a real switch;
  single-pulse words never re-tick). Keep `threshold` for the swipe row's
  full-swipe line, where iOS Mail does tick, and let the native shell (X10)
  deliver it. Mockup 71 carries a one-minute test with a real switch under
  the grabber; if his phone ticks on a flick, X5 can be revisited.
- **X4 · the fade under floating chrome.** It bites here as the edge where a
  sheet's scrolling body meets its fixed header (GlassSheet's sticky handle
  row is a hard edge on a solid fill). Try it inside a sheet first: a mask on
  the sheet's own scroll body, no extra backdrop-filter layer (the layer that
  broke the top bar twice). It is self-contained; if it holds on his phone,
  the same technique goes to the bar.

---

## 5 · Method

**Frames and measurements (demo mode only).** A detached worktree of `922ffc6`
in the session scratchpad, Vite on :5201 (base `/nova-os/`), an isolated
Chrome context at 390×844 @3x, mobile, touch, dark. Before load:
`novaos.style=summary`, `theme=command`, `material=glass`, `core=hologram`, no
`novaos.connection`; a guard refusing every non-GET `fetch`, XHR and beacon.
Confirmed: `connectionStatus: 'demo'`, "Demo data" on screen, and the guard
logged zero requests and zero blocked writes for the whole session. 12
screenshots of the app read (Home, Home scrolled, Edit Pinned open, Fuel, the
recipe sheet, Train, the hold menu, the island over Home, the island under
Edit Pinned, Boot, Shopping, GlassSheet over Home) plus per-frame motion
records of: Edit Pinned open (440 ms materialise, blur ramp 0 to 22 px), Done
(170 ms fall, VT at 179 ms), drags at 60 and 220 px; the recipe sheet's open
(40% slide, 380 ms), drag (up −60 → 0; down 240 → 159), throw (flash-back at
439 ms, VT 476 to 756 ms); GlassSheet's morph in, morph out (to 40%, cut at
345 ms) and drag (200 → 138, dim 1.0 to the cut); the hold menu's open, Escape
and close; the island's timeline and its layer under a sheet; Boot's exit.
Type sizes and tap targets from computed-style sweeps of each open surface.
GlassSheet was mounted directly from its module with a second React root over
Home (demo's own GlassSheet doors are live-only), with its real props.

**The census behind the counts.** 36 overlay surfaces in `src/`. Sheets (9):
GlassSheet, PinnedEditSheet, DeeperReportSheet, RecipeSheet, the TrainSummary
lift and Coach sheets, the SessionSummary sheet, ExerciseSheet, PortionSheet.
Cards and modals (16): CaptureSheet, CoachApplySheet, VerdictCard,
RecordMoment, CalendarView, StepsHistory, RepertoireBook, OutboxView,
AddRecipeModal, IngestModal, IngestReview, ArtifactViewer, BarcodeScanner,
ModelChoicePrompt, ReplySheet, RecipeOverlay. Menus and trays (3): the hold
menu, the job tray, the More sheet. Feedback (8): the island, the status line,
the update bar, Boot, and VoicePresence's four layers. Exits on the button
path: `useExit` (15 sheets and modals in 14 files) plus GlassSheet,
ArtifactViewer and the island = 18. Dims and layers read from each file's
inline style and `index.css`.

**What was NOT seen.** Cupertino and command (summary only). The TrainSummary
and SessionSummary sheets, the Inbox report and capture sheets, the Fuel
GlassSheets and every live-only door (demo renders the classic Train and
hides the rest): their behaviour is read from source and is the same code as
the sheets measured. The swipe row in motion (demo renders no rows; the
grammar and its tests read in full). VoicePresence (mounting it would open the
microphone). Reduced Motion (the browser tool cannot emulate it). Real touch:
drags were synthetic pointer events on the mouse pointer, frame by frame,
which exercise the same handlers but not WebKit's touch pipeline. Chrome, not
WebKit: finding 1 rests on a cascade rule both engines share, and still wants
one pull on his phone. The island's hardware path (`novaos.forceIsland`, the
dev-only seam) rather than an installed PWA.

**Tooling corrections, recorded.** The dev server's base is `/nova-os/`, so
module imports in the page take that prefix. The browser tool refuses to save
screenshots to the scratchpad (outside its roots), so every frame was read
inline and none was written anywhere. A reload clears the page's helpers;
they were reinstalled after Boot was measured. An earlier drag test left Edit
Pinned open in state, which is how finding 3 was first seen: the island's
notice rendered behind it.

**Inventory first-look notes, confirmed or corrected:**
- "`useExit` adopted by 4 of 18 overlays" (checklist O12, X2): **corrected**.
  It now has 15 call sites in 14 files; the full census is 36 surfaces, 18
  with an exit on the button path, none releasing the dim on a throw.
- C13 "rubber-band resistance past the drag threshold": **confirmed**, and it
  is on the dismiss side (finding 6).
- C13 "reverse-FLIP or fade on close": **confirmed**, ending at 40% and a cut.
- C14 "motion: sheetUp/fadeUp/fadeIn per surface": **confirmed** for the
  entrance; there is no exit.
- C5 the island at z-index 95: **confirmed**; 19 overlays sit above it.
- C9 the banner, `warn` red / `info` gold: **confirmed**; 10.5 pt mono and
  the clipping are new.
- C11 Boot: **confirmed**; demo's lines are "MODE · SHOWCASE" and "AGENTS ·
  CONCEPT PREVIEW", not the "CONNECTING…" triplet.
- `longPress.js:25` bypassing the haptic vocabulary: **confirmed**, and on iOS
  it does nothing.
