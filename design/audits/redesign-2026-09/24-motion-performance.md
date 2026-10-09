# 24 · Motion and performance against the reel (audit, 9 Oct 2026)

Research only. Measured in demo mode on a production build of HEAD 7e19f82,
390x844 at 3x, mobile and touch, style `summary`, theme `command`, material
`glass`, core `hologram`. The bar is the standing standard in memory
`nova-motion-standard` (the Bento dashboard reel): six moves, and a frame
budget of 16.7 ms at 1x CPU and about 33 ms at 4x during any transition, with
reduced motion giving cross-fades.

Legend for every table: **M** met, **P** partial, **X** missing, **n/a** the
move has nothing to act on there. A `*` on a frame figure means the screen was
measured in its demo state, which for live-only screens is a single sentence
and therefore flatters the number.

## 1 · The verdict

**4 of the 64 move-cells that apply across 20 screens meet the reel's bar.**

Nova is smooth at rest and mostly inside budget on a plain tab hop: every
screen idled at 119 to 120 fps at 4x CPU (the 4 Oct icon fix holds), and a
warm tab hop at 1x never put more than one frame over 16.7 ms. What it does
not yet do is act out its numbers. No numeral on the summary Home, Fuel's
plate, the Inbox, Money or the live session's progress counts up or counts to
a new value; the rings and bars move and the digits beside them jump. Only
Library, Leader, Briefing and Home's pinned-card drag move items to their new
places. There is no chart with a scrub anywhere. The theme change re-tints the
whole app in one move, as a cut. And at 4x, seven transitions blow the 33 ms
budget, the worst being a Settings page push at 91 to 190 ms.

| Screen | 1 Arrival | 2 Write acted out | 3 Drag lifts | 4 FLIP | 5 Chart scrub | 6 Re-tint | Arrival frame 1x | Nav frame 4x | Reduced motion |
|---|---|---|---|---|---|---|---|---|---|
| Home | P | P | M | n/a | X | P | 10.2 ms M | 25 ms M | P |
| Nova | P | n/a | n/a | n/a | n/a | P | 17.0 ms P | 24 to 34 ms P | P |
| Train + live session | P | P | n/a | n/a | X | P | 25 ms P; 58 ms on session start | 26 to 34 ms plan; 77 to 85 ms with a session (classic view, see §5) X | P |
| Fuel | P | P | n/a | X | n/a | P | 17.0 ms P | hop 18 to 33 ms; recipe push 52 to 59 ms X | P |
| Inbox | P | P | n/a | P | n/a | P | 10.3 ms* M | 24 ms* M | M |
| Settings | M | n/a | n/a | n/a | n/a | P | 10.3 ms M | hop 49 to 60 ms; page push 91 to 190 ms X | M |
| Leader | P | P | n/a | M | n/a | P | 10.3 ms* M | 16 ms* M | P |
| Briefing | P | n/a | n/a | M | n/a | P | 10.3 ms* M | 27 to 32 ms* M | M |
| The wall | P | P | n/a | n/a | n/a | P | not taken at 1x | 67 to 108 ms X | P |
| Library | P | n/a | n/a | P | n/a | P | 108 ms cold (first chunk) X | 42 ms* X | P |
| Ops | P | n/a | n/a | X | n/a | P | 10.4 ms* M | 17 ms* M | P |
| Practice | P | P | n/a | n/a | n/a | P | 10.2 ms* M | 25 ms* M | P |
| To-Do | X | X | n/a | P | n/a | P | 10.1 ms* M | 24 ms* M | P |
| Shopping | X | P | n/a | P | n/a | P | 10.4 ms* M | 18 to 26 ms* M | P |
| Notes | X | n/a | n/a | X | n/a | P | 16.6 ms M | 34 to 35 ms X | X |
| Journal | X | n/a | n/a | n/a | n/a | P | 10.4 ms* M | 24 to 27 ms* M | X |
| Money | X | X | n/a | n/a | X | P | 10.3 ms* M | 18 ms* M | X |
| Stash | X | n/a | n/a | X | n/a | P | 10.2 ms* M | 26 ms* M | X |
| Galaxy | P | n/a | n/a | n/a | n/a | P | 10.2 ms M | 24 to 35 ms P | X |
| Code | P | n/a | n/a | n/a | n/a | P | 16.3 ms M | 33 to 35 ms P | X |

Count over the six move columns: 64 applicable cells, 4 M, 45 P, 15 X.

Under `summary` the More door opens the Index page (`#/index`); that hop put
one 50 ms frame on screen at 4x.

What each move looked like, screen by screen, in one line:

- **Arrival.** Home is the closest to the reel: ten cards rise in a 40 ms
  stagger (`deckRise`, 280 ms each), the three ring arcs sweep at 160, 230 and
  300 ms (`nvArcIn`, 900 ms), the steps bar grows. The numerals beside the
  rings are present from the first frame. Settings staggers nine rows at 35 ms
  (`nvSetRise`). Fuel staggers four blocks and has a real skeleton
  (`.nv-fs-sk`) the shape of its cards. Every other screen arrives as one
  block: the shared 260 ms rise on `<main>` (`App.jsx:1136-1147`) and nothing
  inside it. No screen counts a number up on arrival except an opened recipe
  (`RecipePage.jsx:117-130`).
- **Writes.** Measured: ticking a set in the session changed no number on
  screen and drew no toast; the set box filled with no transition (classic
  view). From source: the summary session's pill does fill
  (`nvSsFill`, `index.css:2708`) while its "x of y sets" line is plain text
  (`valsSessionSummary.js:549`). Fuel's relog is the only daily write with the
  reel's pill toast and an Undo (`App.jsx:2267`). Inbox approve acts the card
  out and files a toast with Undo (`App.jsx:6999`). To-Do, Shopping and
  Home's practice mark are silent on success and toast only on failure
  (`App.jsx:5972-5989`, `4091-4101`, `2487-2500`). Money's add is silent and
  its totals and bars jump on refresh (`App.jsx:6067-6080`,
  `Money.jsx:76-78`).
- **Drag.** Home's pinned-card editor is the one drag-to-reorder surface: the
  row lifts (2% scale, deep shadow, `index.css:1251-1256`), the others slide,
  it settles by FLIP (`PinnedEditSheet.jsx:97-160`). That is the reel's move.
- **FLIP.** Measured: Fuel's High protein filter moved Salmon from 391 px to
  326 px in a single frame with no animation, and the jump registered as a
  0.12 layout-shift cluster in the trace. Library (`useShelfFlip`,
  `Library.jsx:74-96`), Leader's bead flight (`Leader.jsx:96-113`) and
  Briefing's boards (`Briefing.jsx:594-629`) do it properly.
- **Charts.** None. The nearest things are Home's Trends rows
  (`MissionSummary.jsx:676`), Train's Momentum cards (`TrainSummary.jsx:479`)
  and Money's budget bars, none of which is a series with a scrub.
- **Re-tint.** Measured: `--nv-cy` swapped from cyan to copper inside one
  35 ms sample, every surface at once, at 9.8 ms a frame. One move, cheap, a
  cut (`theme.js:137`, `App.jsx:1626`).

## 2 · Gaps ranked by visible gain per hour

Each gap names the file and line, the change, and the shared piece that fixes
it on many screens at once. Hours are rough, for one careful pass plus a
measured check.

**1. Numbers that jump. The count-up primitive. (~3 h, every daily screen)**
`src/CountUp.jsx` already exists and has two users. It deliberately never
animates a first paint (`CountUp.jsx:9-19`), which is the opposite of the
reel's arrival. Give it an arrival mode that counts from 0 on mount, the way
`RecipePage.jsx:117-120` already arms it, and write the digits through a ref
(`textContent`) instead of a `setState` per frame, so a count costs no React
commits. Then put it inside the numerals that move most:
`MissionSummary.jsx:417` (BodyStat, the three ring values), `FuelSummary.jsx:76`
(the plate centre), the session progress (`valsSessionSummary.js:549`, split
the count out of the string), the wall's steps and protein (`Ambient.jsx`
188-195; the wall's own `Count` at `Ambient.jsx:97` is the odometer to keep),
Money's month total (`Money.jsx:35`), and the Inbox and Leader counts
(`Leader.jsx:124-133`). Duration 650 ms decelerating matches the ring arcs
closely enough to read as one move; under reduced motion it snaps, which is
right for a number.

**2. The Settings page push. A cheaper snapshot. (~2 h, Settings)**
`settingsNav.js:49-60` deep-clones every child of `<main>` (`cloneNode(true)`)
on each push and pop to slide a picture of the old page. Measured at 4x: 91 to
190 ms for one frame on Appearance, 22 ms of it forced layout inside the
Settings chunk. Clone only the rows inside the viewport, or slide the live
outgoing page and mount the incoming one under it, and re-measure.

**3. Lists that jump. The FLIP list. (~3 h for the hook, ~30 min a screen)**
Lift `useShelfFlip` out of `Library.jsx:74-96` into one shared hook
(record rects in a layout effect, invert, play with WAAPI on
`cubic-bezier(.32,.72,0,1)` at 280 ms, transform only, skipped under reduced
motion in favour of a 160 ms opacity fade). First uses: Fuel's recipe filter
(`FuelSummary.jsx:673`), Notes' filter (`Notes.jsx:42`, which keys rows by
index and must be keyed by note id first, or the hook will animate the wrong
rows), the Inbox focus filter and Waiting/Filed swap, Ops job rows, Stash
removals, and To-Do and Shopping when a tick moves an item.

**4. Reduced motion cuts where it should fade. (~1 h, all 20 screens)**
`riseMain` returns early under reduced motion (`App.jsx:1138`), so every
screen change is a hard cut; `.nv-deck-rise` and `.nv-sum-rise` are set to
`animation: none` (`index.css:119`, `index.css:1028`), so every card cuts too.
Settings already does it right: `nvSetRise` falls back to `nvSetFade`
(`settings.css:437-439`). Do the same in three places (an opacity-only 160 ms
WAAPI fade in `riseMain`, a fade keyframe for the two rise classes) and every
screen meets the standard's reduced-motion line. Invisible to him unless
Reduce Motion is on, which is why it ranks fourth despite the price.

**5. Transitions over budget at 4x. Four small fixes. (~2 h)**
- `Controls.jsx:451`: `Segmented` re-measures on `[value, options, apple,
  stretch]`, and `options` is a fresh array on every App render (InboxSummary
  passes an inline literal at `InboxSummary.jsx:480`), so every whole-app
  render forces a layout read and a second commit on each mounted segmented
  control. The trace pinned 32 ms of forced reflow on it at 4x. Key the effect
  on the option values joined into a string.
- `App.jsx:4409`: `startWorkoutSession` wraps the session's first render in a
  View Transition with `flushSync`; at 1x that start was a 58 ms frame. Use
  the plain `setState` plus `riseMain` that every other hop uses.
- `App.jsx:3577`: `openRecipe` does the same; the recipe push was 52 to 59 ms
  at 4x and its back 32 to 74 ms.
- `NovaCore.jsx:1118` calls `checkVisibility` every 30th frame, a forced style
  pass inside the core's loop (10 ms at 4x in the trace); the
  IntersectionObserver beside it already covers visibility.
- `MissionSummary.jsx:477` measures `scrollWidth` in a layout effect to fit a
  row (16 ms of forced reflow at 4x on returning Home).

**6. Writes that land silently. The write receipt. (~2 h)**
`notify()` (`island.js:25`) is the reel's pill toast and `toastMsg` has 311
call sites, so the piece exists. What is missing is a single `receipt()` that a
number-changing write calls on success: it plays the count-up on every figure
the write changed and raises one quiet island pill with Undo when the write is
undoable. First uses: Money's add (`App.jsx:6074`), and the ticks if he wants
them (see the decisions below). Inbox's silent discard is a deliberate choice
(`App.jsx:7000`) and should stay.

**7. The wall's arrival. Investigate. (~2 h)**
67 to 108 ms frames on arriving at 4x; the trace shows 88 ms of unattributed
style and layout on mount, plus 11 orbs spinning on 60 s loops. The minute
clock fix (`Ambient.jsx:27-40`) already holds at rest (119 fps). Library
(42 ms warm, 108 ms cold), the Index (50 ms), Notes (34 to 35 ms) and Code
(33 to 35 ms) sit in the same band and want the same look.

**8. Theme change cuts. A root cross-fade. (~1 h)**
Wrap `applyAppearance` (`theme.js:137`) in a 250 ms root View Transition
cross-fade from `setNovaTheme`, `setMaterial` and `setCalmMode`
(`App.jsx:1626-1641`). Caution: the whole-page transition was removed from
tab hops on 17 Sep because it photographs the glass chrome and doubles it.
A colour change moves nothing, so a cross-fade of two photographs may look
right where a slide did not; it must be checked on his phone with glass on.
The other route, transitioning registered `--nv-*` colour properties, would
restyle the whole tree every frame and is the worse choice.

**9. Bars animate width. (~30 min)**
`index.css:1155` (Home steps bar) and `index.css:1841` (Fuel macro bars)
transition `width`, a layout property. Switch to `transform: scaleX()` with a
left origin.

**10. Skeletons per section. (~4 h)**
`Skeleton.jsx` has eight users and none on the summary Home, Money, To-Do,
Journal (which shows a "Loading your journal" line) or the live-only screens.
A `SumSkeleton` per pinned card shape (one per row of `PINNED_CARDS` in
`src/pinned.js`) and the reel's skeleton-then-content arrival follow. Ranked
low because the live cache already paints his last-known data at about
350 ms, so a skeleton shows on a first-ever connect or an evicted cold start.

**11. No chart can be scrubbed. The chart scrubber. (~6 h, then each chart)**
There is no time-series chart on any screen he uses. One `ScrubChart` (an SVG
path, pointer capture, a dot and tooltip that ride the line, a light haptic
tick per point, reduced motion keeps the tooltip and drops the glide) should
arrive with the first real series: Home's Trends card
(`MissionSummary.jsx:676`), a lift's history from Train's Momentum
(`TrainSummary.jsx:479`), and Money's month. Every point must come from his
records; a card with no series draws no chart.

**Gestures (no column in the reel's table, checked anyway).** SwipeRow,
sheets and edge back all track 1:1 and hand off velocity
(`swipeAction.js:65-91`, `sheetPhysics.js:16-68`, `useSheetDrag.js:17-90`,
`edgeBack.js:183`). Live check on Home's Edit sheet: it followed the finger
exactly for 80 px, then gave about half a pixel per pixel to 120 px, and a
release dismissed it with momentum. Whether that resistance past 80 px is
intended for a downward dismiss is worth one look. From source, Galaxy's pan
tracks 1:1 and stops dead on release, with no momentum (`App.jsx:7073-7209`).

## 3 · What already meets the bar (keep these)

- The idle frame rate. 119 to 120 fps at 4x on Home, Nova, Train, the wall and
  Galaxy with the hologram core on. The 4 Oct canvas work holds.
- Home's arrival choreography: the 40 ms card stagger, the arcs sweeping in
  sequence, the steps bar growing. The reel's arrival minus the counting.
- Home's pinned-card drag: lift, make room, settle by FLIP.
- Library's shelf and covers FLIP, Leader's bead flight, Briefing's boards
  measured from and to, each with a reduced-motion branch.
- Inbox approve: the card leaves first, the list drops it after
  (`inboxLeave.js`), a toast with Undo.
- Fuel's relog receipt with Undo, and Fuel's skeleton that matches its cards.
- Settings' row stagger and its reduced-motion cross-fade.
- The wall's odometer count for what is waiting (`Ambient.jsx:97-115`).
- The live session's pill fill on a ticked set and the Finish sheet's counted
  gauge (`SessionSummary.jsx:765-789`).
- The gesture physics: 1:1 tracking, velocity from an 80 ms window, momentum
  projection, interruptible sheets.
- `notify()` living outside React state, so a toast never re-renders the app.

## 4 · A build order

Shared primitives first, then screens, then a measured pass.

1. **Count-up**, arrival mode plus ref writes, in `CountUp.jsx`.
2. **FLIP list hook**, from `useShelfFlip`, with the reduced-motion fade.
3. **Reduced-motion fades** in `riseMain` and the two rise classes.
4. **Write receipt** (`receipt()` = count-up on the changed figures plus one
   island pill with Undo).
5. **Budget fixes**: Segmented's effect key, the two `flushSync` View
   Transitions, the core's `checkVisibility`, the bars to `scaleX`.
6. **Settings snapshot**, then the wall, Library, Index, Notes and Code
   investigations.
7. **Screens**, in the order he meets them: Home (BodyStat count-up, Trends
   ready for a chart), Train live session (progress count, receipt), Fuel
   (plate count, FLIP filter), Inbox (counts, FLIP filter), Money (total and
   bars, receipt on add), To-Do and Shopping (FLIP on tick, receipt if he
   wants it), Notes (stable keys, FLIP filter), Stash, Ops.
8. **Theme cross-fade**, checked on his phone with glass.
9. **Skeletons per section**, then the **chart scrubber** with its first real
   series.
10. Re-run this audit's measurements: every hop and push at 1x and 4x, with
    a trace for each over budget.

## 5 · Method, and what was not seen

- A detached worktree of HEAD, `node_modules` linked, a **production** build
  served by `vite preview` on port 5217 (dev mode with StrictMode reads about
  6x worse for React cost; see memory `nova-ui-performance`). Removed after.
- chrome-devtools in an isolated context, emulating 390x844x3 mobile touch
  before the first navigation. An init script set the four appearance keys,
  removed any connection, and rejected every non-GET fetch, XHR and beacon;
  it recorded zero blocked writes for the whole run. No model request was
  sent.
- Frames were measured two ways: an in-page `requestAnimationFrame` recorder
  (the display ran at 120 Hz, so a healthy frame reads about 8 to 10 ms) plus
  layout-shift and long-animation-frame observers, and four
  `performance_start_trace` recordings (Train tab hop and back at 4x, a 1x
  run of hops, the Fuel push and filter, the Settings push at 4x, the wall at
  4x). Each 4x hop was run twice; the table shows the range.
- Writes went through the app's own methods on its own state:
  `startWorkoutSession` with a three-lift fixture, `toggleSessionSetDone`,
  `setNovaTheme`, `openRecipe`, the Fuel filter chip. Nothing reached a
  server.
- Demo mode hid a lot, and this audit says so rather than guess:
  - **The live session under `summary` (`SessionSummary`) and `TrainSummary`
    are switched off in demo** (`valsSessionSummary.js:77`,
    `valsTrainSummary.js:49`). The session I drove was the classic
    `SessionView`, which his phone does not show. The 77 to 85 ms hop and the
    32 ms Segmented reflow belong to that view; the summary session's frame
    cost is unmeasured. Its motion is read from source.
  - To-Do, Money, Ops, Leader, Practice, Library, Shopping, Journal, Stash,
    Inbox and Code render one honest sentence in demo. Their arrival and nav
    frames (marked `*`) measure that sentence, and every move cell for them
    is read from source.
  - The Org Map inside Ops, the full-screen Nova and the Briefing stage
    (both run a canvas loop while open) were not opened.
- Not done: real touch through CDP (the gesture check used synthetic pointer
  events, enough for tracking, not for feel); Safari or WebKit (his phone's
  engine rasterises glass and canvas differently, so the frame figures are
  Chrome's); `prefers-reduced-motion` emulation (read from source, every
  line cited above); the Mac at 1280.
- The `review-animations` skill could not be loaded (it is user-invoked only);
  `apple-design`, `emil-design-eng`, `find-animation-opportunities` and
  `animate` were loaded and the recipes above use their values.
- Scripted clicks count as unexpected layout shifts, so the 0.12 CLS on Fuel
  is the filter jump itself; no load-time shift was seen on any screen.

## Decisions for him

1. **Do ticks get a pill?** To-Do, Shopping and Home's practice mark are
   silent on success today, by design. If yes, every tick shows a small island
   pill with Undo, as the reel does after a write. If no, the tick's own motion
   (the strike, the FLIP to its new place) is the receipt and the island stays
   for writes that change a figure.
2. **Numbers count up on every arrival, or only when they changed?**
   `CountUp` was written to stay still on a first paint. The reel counts from 0
   each time the page opens. Counting every arrival is livelier and costs
   about 650 ms of motion on each visit to Home.
3. **The theme cross-fade under glass.** A root cross-fade is cheap but brushes
   against the 17 Sep finding about photographing the glass. If he wants the
   reel's move 6, it is built and judged on his phone; if not, the cut stays.
