# Fluidity audit, 2 Nov 2026

His instruction (2 Nov): "Improve the overall speed and fluidity of nova and its
animations because sometimes it still feels clunky and not like a $1 million app
quality."

This is a measured audit and a plan. No app code was changed. Every number
below comes from a performance trace or an in-page counter on his real data;
where an instrument could not measure something, the text says so.

## How it was measured

- **Tree:** commit `56d1d179`, `src/` clean (no client file differs at
  `774625b9`, the HEAD when this was written: `git diff --stat 56d1d179
  774625b9 -- src index.html vite.config.js` is empty). A production build with
  sourcemaps (`vite build --sourcemap`), served by `vite preview` on 5183.
  Dev mode was not used: StrictMode reads ~6x worse on React cost.
- **Data:** his real vault, read-only. The connection is built in memory from
  `server/.env`; every non-GET request is failed at the CDP Fetch layer. The
  runs blocked 8 writes (`POST /api/review/summary`, `/api/notes/summary`,
  `/api/inbox/ee5f6102/seen`, `/api/pocket`, `PUT /api/workouts/session-draft`);
  none reached the server.
- **His setup:** style `summary`, material `glass` (as stamped by the app),
  402 x 874 at DPR 3 (iPhone 16 Pro), touch emulation.
- **Browser:** headless Chrome on the Mac (M1 Pro, Metal GPU, not SwiftShader).
  CPU at 1x and at 4x throttle. **This is Blink, not WebKit on his phone, and
  headless vsync is 60 Hz.** 120 Hz is judged by main-thread task length
  against an 8.3 ms budget, not by presented frames. An M1 Pro core at 1x is
  roughly an A18 core; 4x is the stress case the motion standard already asks
  for (and is close to a warm phone that has throttled).
- **Instrument:** `scripts/fluidity.mjs` (added for this audit; header has the
  recipe). Per screen: the switch, a scroll of `<main>` down 1,800 px and back,
  one state change, and 2 s idle; each traced (`devtools.timeline`, frame,
  stack, V8 CPU profiler), with long tasks mapped to `src/` file:line through
  the sourcemaps, React commits and component renders counted by a counting
  devtools hook, and a census of glass and layers. `--rendercost` times
  `renderVals()` and a whole commit on the live instance; `--ablate` switches
  the orb canvases and the backdrop blur off in the test page only, to price
  each.
- **What the instrument's own costs were, and how they were removed:** (1) the
  trace starting V8's profiler lands a 50-76 ms interrupt inside whatever
  frame is running: one per window, dropped and counted
  (`droppedInstrumentTasks`); (2) Chrome's first-use GPU shader compile
  (Skia Graphite on Dawn) cost one 683 ms GPU-process task on the first Home
  carousel tap: removed by an untraced warm-up pass over every screen; (3) the
  CDP Debugger domain made its own interrupts, so it is switched on only after
  a window closes; (4) CDP touch emulation adds ~20-40 ms of "input delay" to
  the Event Timing entries, so the numbers quoted are the click processing time
  and the input-to-next-paint duration, read with that in mind.

Raw results (scratch, not committed): `run3.json` (1x), `run4x.json` (4x),
`rc1.json` / `rc4.json` (render cost), ablation and attribution runs. Re-run
with the commands in each brief.

## The headline

At rest, on every screen, the Nova orb in the tab bar is the most expensive
thing on the main thread. On every tap that changes app state, the whole view
model is rebuilt: `renderVals()` alone costs **~10 ms at 1x and ~45-51 ms at
4x, every time**, which is more than a 120 Hz frame (8.3 ms) before React has
reconciled a single node. Add the layout reads some screens force inside their
commit, and a tab switch takes **121-199 ms of main thread at 4x** between the
finger lifting and the next frame. That is the clunk.

| What he does | 1x: click work / longest task | 4x: click work / longest task | input to next paint, 1x / 4x | components rendered (commits) |
|---|---|---|---|---|
| Tab to Home | 35.5 / 37.4 ms | 189.0 / 197.7 ms | 80 / 272 ms | 168 (5) |
| Tab to Train | 33.8 / 35.5 ms | 121.2 / 129.7 ms | 72 / 192 ms | 149 (5) |
| Tab to Fuel | 31.5 / 32.8 ms | 199.0 / 210.9 ms | 72 / 312 ms | 182 (5) |
| To Settings (More grid) | - / 21.8 ms | - / 139.3 ms (5 long tasks) | - | 452 (4) |
| To Inbox (More grid) | - / 22.4 ms | - / 95.4 ms | - | 79 (2) |
| Start a session (Push A) | - / 43.9 ms | - / 213.3 ms | - | 236 (3) |
| **Tick a set** | 32.0 / 49.7 ms | 141.0 / 196.3 ms | 96 / 256 ms | 223 (8) |
| Train: open readiness | 20.7 / 22.6 ms | 193.7 / 214.5 ms | 56 / 304 ms | 146 (3) |
| Settings: open Appearance | 26.1 / 27.4 ms | 216.1 / 239.4 ms | 72 / 360 ms | 290 (5) |
| Fuel: open the week (sheet) | 7.8 / 9.1 ms | not run at 4x | 56 / - | 171 (4) |
| Home: next instrument | 2.4 / 5.0 ms | 13.0 / 19.8 ms | 56 / 80 ms | 14 (2) |
| Inbox: unfold a record | 0.4 / 3.5 ms | 5.4 / 21.6 ms | 56 / 64 ms | 32 (7) |

The last two rows are the proof of the diagnosis: the two interactions that do
not go through `App.setState` cost almost nothing, at either speed.

| At rest (2 s idle) | main thread busy, 1x | of which orb + canvas | main thread busy, 4x | of which orb + canvas | tasks over 8.3 ms, 4x |
|---|---|---|---|---|---|
| Home (2 canvases) | 252 ms | 160 ms | 1,026 ms / 1.8 s | 573 ms | 104 |
| Train | 174 ms | 84 ms | 976 ms | 398 ms | 40 |
| Fuel | 255 ms | 91 ms | 848 ms | 350 ms | 30 |
| Inbox | 161 ms | 88 ms | 667 ms | 329 ms | 2 |
| Settings | 223 ms | 33 ms | 670 ms | 324 ms | 2 |
| Live session | 189 ms | 89 ms | 765 ms | 331 ms | 3 |

| Scroll of the main pane (down and back) | 1x busy / tasks >8.3 ms | 4x busy / tasks >8.3 ms | orb + canvas at 4x | rAF gaps over 25 ms, 4x |
|---|---|---|---|---|
| Home | 575 ms / 0 | 2,435 ms / 119 | 1,147 ms | 3 |
| Train | 506 ms / 0 | 2,386 ms / 53 | 882 ms | 5 |
| Fuel | 416 ms / 0 | 1,834 ms / 58 | 688 ms | 3 |
| Settings | 365 ms / 0 | 1,523 ms / 81 | 747 ms | 4 |
| Live session | 178 ms / 0 | 812 ms / 12 | 361 ms | 3 |

Inbox did not scroll (its content was shorter than the viewport on his data).

**What the orb and the glass each cost** (`--ablate`, 1x, his data; each
switched off in the test page only, 2 s idle and one scroll per variant):

| Screen, state | as shipped: main / GPU | orb canvases hidden: main / GPU | backdrop blur off: main / GPU |
|---|---|---|---|
| Home, at rest | 297 / 306 ms | 61 / 7 ms | 258 / 320 ms |
| Home, scroll | 587 / 559 ms | 220 / 11 ms | 559 / 537 ms |
| Train, at rest | 167 / 152 ms | 65 / 8 ms | 162 / 160 ms |
| Train, scroll | 635 / 474 ms | 239 / 8 ms | 503 / 443 ms |
| Fuel, at rest | 193 / 182 ms | 101 / 67 ms | 244 / 247 ms |
| Fuel, scroll | 482 / 344 ms | 272 / 17 ms | 519 / 354 ms |

In this browser the orbs are 48-79% of the main thread at rest and almost
all of the GPU work, at rest and while scrolling. The glass is small and
mixed: within noise on Home and at rest (the Fuel rows moved the wrong way
because a live update landed in one window), but on Train, the screen with the
most glass in its DOM (25 panes) and the most layers (117), blur off took the
scroll from 635 to 503 ms of main thread (-21%). **Caveat that matters:** WebKit composites `backdrop-filter`
differently from Chrome, so the glass's cost on his iPhone is not established
by this table; only that, here, it is not what makes Nova feel heavy.

## Ranked findings (by what he feels on a 120 Hz iPhone)

Each finding: the measurement, the cause at file:line, and a brief another
agent can execute without this document's context. Briefs say "do NOT commit;
the parent session owns commits" unless the parent decides otherwise.

### 1. The orb in the tab bar draws every display frame, forever, on every screen

**Measured.** Hiding the orb canvases on Home cut the main thread at rest
from 297 to 61 ms per 2 s and GPU work from 306 to 7 ms; in a scroll, from
587 to 220 ms and from 559 to 11 ms (ablation table). At rest, `NovaCore.jsx`
plus the canvas 2D calls it makes are
33-160 ms of every 2 s at 1x and 324-573 ms at 4x (table above); on Home,
where a second core sits in the header, idle is 57% of the main thread at 4x
with 104 tasks over 8.3 ms in 1.8 s. During a Home scroll at 4x it is 1,147 of
2,435 ms. The profile's top self-time lines: `NovaCore.jsx:585` (the batched
`fill`), `:830`, `:779`, `:549`. GPU-process time at rest is 140-265 ms per 2 s
at 1x, most of it uploading the canvas each frame (see the ablation table).

**Cause.** `SummaryDock.jsx:145` renders `<NovaCore size={58} variant="mini">`
with no `fps`; `NovaCore.jsx:1123-1135` then draws on every
`requestAnimationFrame`, which on his iPhone is 120 times a second. The
`fps` cap exists (`NovaCore.jsx:1125`, used by the wall at 30) but the dock
never sets it. `MissionSummary.jsx:921` adds a second uncapped 36 px core on
Home. The 4 Oct fix (43ae15a: `HOLO_MINI`, IntersectionObserver, checkVisibility)
made each frame cheaper and stops off-screen cores; it did not stop the
on-screen core drawing at the display rate while nothing is happening.

**Brief (sonnet).**
- Files: `src/NovaCore.jsx`, `src/SummaryDock.jsx`, `src/screens/MissionSummary.jsx`, `src/MobileChrome.jsx` (the cupertino dock, line 216, same treatment).
- Change: add a `restFps` prop to `NovaCore` (default 0 = today's behaviour). In the loop (`NovaCore.jsx:1126-1132`), when `restFps > 0` and the live state from `stateRef.current` has none of `speaking`, `listening`, `thinking`, `contest`, use `1000 / restFps - 1` as the minimum gap; when any of them is true, draw every frame. Pass `restFps={30}` from `SummaryDock.jsx:145`, `MobileChrome.jsx:216` and `MissionSummary.jsx:921`. Also pause the dock core while `<main>` is being scrolled: a passive `scroll` listener on `document.querySelector('main')` that sets a ref `scrolling = true` and clears it 150 ms after the last event; skip `draw()` while it is true (the last frame stays on the canvas).
- Do not change the look, the engines, the turn colours or any other caller.
- Re-measure: `npx vite build --outDir /tmp/nova-dist --sourcemap && npx vite preview --outDir /tmp/nova-dist --port 5183 --strictPort &` then `node scripts/fluidity.mjs --dist /tmp/nova-dist --cpu 4 --screens mission,workouts --out /tmp/f.json`. Read `screens.mission.idle.trace.topFiles`.
- Expected: at 4x, Home idle `src/NovaCore.jsx` + `(canvas 2D natives)` from ~573 ms to under 150 ms per 2 s (headless is 60 Hz, so a 30 fps cap halves it here; on his 120 Hz phone it quarters it); Home idle tasks over 8.3 ms from 104 to under 30; Home scroll canvas time from 1,147 ms to under 100 ms.
- Feel-check: on his phone, the orb at rest should look the same at 30 fps (its motion is slow); it must go back to full rate the instant he taps it.

### 2. Every state change rebuilds the whole app's view model: ~10 ms at 1x, ~50 ms at 4x

**Measured** (`--rendercost`, 30 empty `setState` calls per screen, no trace
running): `renderVals()` median **9.6-10.8 ms at 1x, 45.0-51.2 ms at 4x**; the
whole commit (setState to commit callback) **10.7-12.1 ms at 1x, 49.1-58.9 ms
at 4x**. So `renderVals` is 87-92% of every commit, and reconciliation is the
small part. It runs on every tap that touches `App` state: a tab switch made
5 commits, a set tick 8, a data push 1 (178 components re-rendered on Fuel at
rest when a live update landed). Under the profiler (20 renders, canvases hidden so only the render path
shows), the time per render splits as: `valsNotes.js` ~2.0 ms (line 85, the
journal days, and line 37, a `vtStyle` per live note), `vtName.js:49` ~1.2 ms
(Unicode `normalize` plus regex, once per note, every render), `valsJournal.js:29`
~1.2 ms (`dayLabel` calling `toLocaleDateString` per day), `spokenProse.js:41`
~1.0 ms (via `bubbleProse`, re-cleaning every chat message's text in
`valsMisc.js:345` and `valsNovaThread.js:50`), `valsWorkouts.js` ~0.7 ms (580:
`toLocaleDateString` inside a list map), `valsReview.js` ~0.6 ms,
`valsFuelSummary.js:344` ~0.5 ms, and `renderVals`'s own spreads ~0.5 ms. On
Home and in the live session alike: none of the top four builds anything on
the screen he is looking at.

**Cause.** `App.jsx:10431` `renderVals()` runs every domain's builder
(`valsRecipes`, `valsWorkouts`, `valsNotes`, `valsLibrary`, `valsDocuments`,
`valsWishlist`, `valsLeader`, `valsPractice`, `valsBriefing`, `valsMisc`,
`valsInbox`, `valsTodos`, `valsMoney`, `valsMission`, `valsOps`, `valsChrome`,
then `valsSummary`, `valsIndex`, `valsTrainSummary`, `valsFuelSummary`,
`valsInboxSummary`, `valsSessionSummary`, `valsSettings`, `valsNovaThread`),
each spread into a new object (`App.jsx:10480-10525`, eight successive
`{ ...prev, ...next }` copies of an object with hundreds of keys), whichever
screen is showing. Examples that ran on screens that never show them:
`valsNotes.js:8-20` maps and lower-cases every live note on every render;
`valsJournal.js:29` re-derives every journal day; `spokenProse.js:41` runs its
regex list; `valsChrome.js` parses `novaos.screenVisits` from localStorage on
every render. This is P8 from `nova-ui-performance`, deferred on 9 Aug "until a
measured jank case": this is the measured case.

**Brief (opus: the ctx contract is subtle).**
- Files: `src/App.jsx` (`renderVals`, 10431-10525), `src/vals/*.js`.
- Change, in two steps, each its own commit:
  1. **Memoize per builder on the state it reads.** Add `src/vals/memo.js` with `memoBuilder(fn, pick)`: it keeps the last `pick(app.state)` array and the last result, and returns the cached result when every element is `===` the previous one. `pick` lists the `st.*` slices the builder reads (grep each builder for `st\.` and `app\.state\.`). Builders that READ `ctx` fields written by an earlier builder (the Object.assign contract: `rotation`, `todayRoutine`, `statusChip`, `usingLiveNotes`, `reviewPage`, `journalDays`, …) must include those ctx values in their pick, and a builder that WRITES ctx must replay its writes from the cache (store the ctx delta alongside the result and `Object.assign(ctx, delta)` on a hit). Wrap the heaviest first, in this order, measuring after each: `valsNotes`, `valsRecipes`, `valsWorkouts`, `valsJournal` (via valsNotes), `valsFuelSummary`, `valsMission`, `valsInbox`, `valsMoney`. Never memoize a builder whose output depends on `Date.now()` without putting the minute in the pick.
  2. **Replace the eight spreads** with one `Object.assign({}, …parts)` so the merged object is built once.
  - Cheapest first, before any memo (each a few lines, each measurable alone): cache `vtName(prefix, id)` results in a module `Map` (`src/vtName.js`); in `src/vals/valsJournal.js` and `src/vals/valsWorkouts.js:580` build one `Intl.DateTimeFormat` per format at module scope (use the existing cached `dtf(locale, options)` from `src/vals/fmt.js:16`, as `valsFuelSummary.js` does) instead of `toLocaleDateString` per row; in `src/bubbleProse.js` keep a `Map` from raw text to cleaned text (bounded, e.g. the last 500). Expected from these alone: `renderValsMedMs` from ~10 to ~6 at 1x.
- Guard: `node scripts/guard-cupertino.mjs` must print `unchanged`; `cd server && npm test` green (motionKept and summaryHome tests); and a new test in `server/test/` that calls `renderVals` twice on a fixed fake app and asserts deep-equal output with and without the memo.
- Re-measure: `node scripts/fluidity.mjs --dist /tmp/nova-dist --rendercost --out /tmp/rc.json` and `--cpu 4`.
- Expected: `renderValsMedMs` from ~10 to under 3 at 1x and from ~48 to under 12 at 4x; tab-switch click work at 4x from 121-199 ms to under 60 ms; set-tick click work at 4x from 141 ms to under 50 ms.

### 3. Layout read inside the commit, on the screens he uses most

**Measured** (forced synchronous layouts, each with the JS line that forced it):

| Where | 1x | 4x | When |
|---|---|---|---|
| `MissionSummary.jsx:577` (moments rail fit loop) | 10.2-10.6 ms | 51.1 ms | every switch to Home |
| `FuelSummary.jsx:600-608` (SlotRail scroll-to-next) | 2.6-4.0 ms forced | 32.5 ms forced, 86.9 ms in the function | every switch to Fuel |
| `Controls.jsx:298` (`Rail` measure, no deps) | 2.8-12.1 ms | 11.4-13.7 ms | every commit while Train is showing |
| `SettingsKit.jsx:92` (`Seg` thumb `place`, no deps) | 4 x 2.8-15.9 ms | 4 x 25.1 ms | every commit while a Settings page with a picker shows |
| `SessionSummary.jsx:163` (page top) | 1.8-4.3 ms | 11.8 ms | entering a session |
| `Controls.jsx:453` (Segmented) | 1.4-6.3 ms | 6.9 ms | switching to Inbox |
| `DynamicIsland.jsx:485` | 0.7-1.2 ms | 3.9 ms | ticking a set |

**Cause.** `useLayoutEffect` callbacks that read geometry (`scrollWidth`,
`offsetWidth`, `getBoundingClientRect`, `getComputedStyle`) after a DOM write
in the same commit. Two run on EVERY render because they have no dependency
array: `Controls.jsx:303` (`useLayoutEffect(() => { measure(); })`) and
`SettingsKit.jsx:97` (`useLayoutEffect(place)`); with the whole-tree render of
finding 2, every App commit re-reads layout for every mounted Rail and Seg.
`MissionSummary.jsx:575-579` re-renders itself one notch at a time until the
rail fits, reading `scrollWidth` each pass.

**Brief (sonnet).**
- `src/Controls.jsx` `Rail`: give the layout effect deps `[React.Children.count(children)]` plus a ResizeObserver on the rail and its first child, and a passive `scroll` listener; do not measure on every render.
- `src/screens/SettingsKit.jsx` `Seg`: deps `[value, options.length]`; keep the ResizeObserver it already has. Read `offsetLeft`/`offsetWidth` once each.
- `src/screens/MissionSummary.jsx` 565-590: measure once in a ResizeObserver callback (which runs after layout, before paint) and compute the target `level` in one step from the measured overflow, instead of one notch per commit.
- `src/screens/FuelSummary.jsx` `SlotRail` 600-610: move the scroll into a `requestAnimationFrame` inside the effect, and replace `getComputedStyle(rail).paddingLeft` with the token value it resolves to (read once and cache in a module variable).
- `src/screens/SessionSummary.jsx` 160-168: same rAF move.
- Re-measure: `node scripts/fluidity.mjs --dist /tmp/nova-dist --cpu 4 --screens mission,workouts,recipes,settings,session`; read each window's `trace.forcedBy`.
- Expected: none of the lines above in `forcedBy` with more than 1 ms at 1x or 5 ms at 4x; Home switch at 4x loses ~50 ms, Fuel ~30-80 ms.

### 4. The set tick waits for everything else before it paints

**Measured.** Ticking a set (the most frequent tap in the gym): 223 components
in 8 commits; click work 32.0 ms at 1x, 141.0 ms at 4x; input to next paint
96 ms at 1x, 256 ms at 4x. The tick's own state is local and optimistic
(`App.jsx:5492-5525`, good), but the same click also starts the rest
(`valsSessionSummary.js:261-271`: a second `setState` for `sessionRest`,
`sessionSumLift`), fires the receipt pill (`tickReceipt`) and the island, and
all of it renders in one urgent commit through the full `renderVals`.
`startTransition` is used nowhere in `src/` (0 hits).

**Brief (sonnet).**
- Files: `src/vals/valsSessionSummary.js` (the `tick` closure, 261-271), `src/App.jsx` (`toggleSessionSetDone`, 5492).
- Change: keep the `workoutSession` update urgent; wrap the follow-on `app.setState({ sessionSumSel: null, sessionSumPad: null, sessionSumLift: exIdx, sessionRest: startRest() })` in `React.startTransition`. In the tick button (`SessionSummary.jsx:417`), add an immediate local pressed-to-logged look (a `data-pending` attribute set on pointerdown, cleared when `s.done` flips) so the tick draws in the first frame even before the commit.
- Do not change what is saved, the haptic, or the receipt's Undo.
- Re-measure: `node scripts/fluidity.mjs --dist /tmp/nova-dist --cpu 4 --screens session`; read `screens.session.change.events` (the `click` entry) and `trace.longTasks`.
- Expected: at 4x the click's processing under 60 ms (after finding 2, under 25 ms) and the tick visibly ticked in the first frame after touch end.

### 5. The tab bar's lens moves only after the new screen has rendered

**Measured.** Tab switches at 4x: 121-199 ms of click work before the next
frame (table). The lens (`.nv-sum-lens`, `index.css:1459-1463`) is a cheap
compositor `translate` on the snappy spring, but its target `--i` comes from
`litIndex`, which only changes when `App.state.screen` commits
(`SummaryDock.jsx:110-111`). So the bar, the one thing under his finger,
waits for the slowest part of the switch.

**Brief (sonnet).**
- File: `src/SummaryDock.jsx`.
- Change: keep a local `pendingIndex` state; set it in each `Tab`'s `onPointerDown` (before `go` runs on click) and use `pendingIndex ?? litIndex` for `--i` and for `useLensStretch`; clear it when `litIndex` catches up. Do the same in `MobileChrome.jsx`'s dock if it gets a lens later (it has none today).
- Re-measure: record the tap with `scripts/rec.mjs --slow 8` and check that the lens is mid-glide in the frame after touch end; trace with `fluidity.mjs --screens mission,workouts,recipes`.
- Expected: the lens starts moving within one frame of the finger landing, independent of the screen's render time.

### 6. Booting at 4x is fifteen long tasks and 3.3 s to quiet

**Measured** (warm reload, service worker and V8 code cache warm): 1x FCP
468-580 ms, content in the DOM at 436-527 ms, LCP 1.2-1.8 s, one long task of
66-125 ms (in one run: GC 35 ms, `valsNotes.js:85` 33 ms, canvas 31 ms). 4x:
FCP 1,240 ms, LCP 1,712 ms, **15 long tasks, longest 315 ms, the last ending
3,259 ms after navigation**. Script compile was 0.6 ms (code cache hit), so
the bundle's size is not the boot cost in this browser; the boot cost is the
first renders of the whole view model (finding 2) plus the cores starting.
Not measured: a cold start on his phone after iOS evicts the PWA (no
instrument reaches WebKit's cache state from here).

**Brief.** Mostly delivered by findings 1 and 2. In addition (sonnet): in
`App.jsx` boot, defer the non-visible domain loads that `setState` on arrival
(`loadFoodHistory`, `loadEatOut` already wait for Fuel; check the others in
`componentDidMount` that refresh data the first screen does not show) behind
`requestIdleCallback` with a 2 s timeout fallback (Safari has no rIC). Re-measure
`result.reload.trace` at 4x: expected under 6 long tasks and quiet by 1.5 s.

### 7. A ping on Fuel repaints every frame, forever

**Measured.** Fuel at rest: 238 main-thread paints in 2 s at 1x (14.4 ms
paint, 42 viewports of paint area); every other screen at rest paints 2-12
times. The live session at rest paints 240 times in 2 s (finding 9).

**Cause.** `index.css:2456-2457`: `.nv-fs-live` runs `nvFsPing 1.8s infinite`,
which animates `box-shadow`, a paint property, not a compositor one.

**Brief (haiku).** In `src/index.css`, replace the box-shadow ping with a
`::after` ring: `content:''; position:absolute; inset:0; border-radius:50%;
box-shadow:0 0 0 1.5px color-mix(in srgb, var(--nv-cy) 55%, transparent);
animation: nvFsPingRing 1.8s var(--nv-ease) infinite;` with
`@keyframes nvFsPingRing { from { transform: scale(1); opacity: 1 } to {
transform: scale(2.1); opacity: 0 } }`; give `.nv-fs-live` `position:relative`.
The global reduced-motion rule (`index.css:3218-3222`) already stops it.
Re-measure `screens.recipes.idle.trace.paintCount`: expected under 20 per 2 s.

### 8. Bars and pagers animate layout properties

**Measured.** Not separately costed: on the Home carousel tap (which runs the
pager's height transition) there were 0 tasks over 8.3 ms at 1x and 17 over
16.7 ms at 4x, most of them the orb. The finding is the rule (motion runs on
`transform`/`opacity`), and its cost grows with the page below the animated
box, because a height or width change re-lays out everything after it every
frame.

**Where** (all `src/index.css` unless named):
- `.nv-sum-bar > i` `transition: width .9s` (1281-1283), drawn by `MissionSummary.jsx:398`: the Home highlight bar, the one hero bar on his Home.
- `.nv-fs-kbar > i` and `.nv-fs-wbar > i` `transition: width .9s` (1995, 2007): Fuel's bars.
- `.nv-day-pager` `transition: height .36s` (4150): the Home instruments carousel (`Instruments.jsx:675`).
- `.nv-nt-core` `transition: width .34s, height .34s` (5373): the Nova page core.
- `.nv-nt-track i` `transition: width` (5619); `.nv-day-dots i`, `.nv-wall .pd i` `width` (4174, 4307); `.nv-fs-opts … > i` `width` (2507); `.nv-wall .hands` `width` (4284).
- `src/settings.css:190, 202` (Seg thumb `width`), `:268` and `src/money.css:383` (`left`).
- Deliberately left alone: the `grid-template-rows` collapses (`index.css:210-217` documents them as the one collapse a list removal needs).

**Brief (sonnet).** For each bar: render the fill at `width:100%` with
`transform: scaleX(var(--p))`, `transform-origin: left`, and transition
`transform` on `var(--nv-spring-smooth-ms) var(--nv-spring-smooth)`; set
`--p` (0-1) inline instead of `width`. Keep the `nvSumBarIn` clip-path
entrance. For the dots, animate `transform: scaleX()` on a fixed-width pill.
For the pager height: measure the next page's height once and animate a
`clip-path: inset(0 0 calc(100% - Hpx) 0)` on a wrapper plus `translateY` on
the content below, or accept the height change without a transition (an
instant height under a sliding card reads fine). For the Seg thumb: one
element, `transform: translateX() scaleX()` from a fixed base width. Verify
with `scripts/rec.mjs --slow 8` per surface and `fluidity.mjs` (Home change
window: `layoutCount` should not grow with the animation's length).

### 9. A whole page re-renders every second for one ring's digit

**Measured.** In the live session at rest (rest timer running): 100 component
renders in 2 commits per 2 s, and 240 paints per 2 s.

**Cause.** `SessionSummary.jsx:126-131`: `setNow(Date.now())` every 1,000 ms
while resting (30,000 ms otherwise) is state of the whole `SessionSummary`
page, so ~50 components re-render each second for the rest ring's second and
the header minute. The paints are the ring: `.nv-ss-rest .arc` transitions
`stroke-dashoffset 1s linear` under a `filter: drop-shadow(...)`
(`index.css:3428`), so the filtered stroke re-rasterises every frame.

**Brief (sonnet).** Move `now` into two leaf components (`RestRing` and the
header minute) that own their own interval; `SessionSummary` passes the rest's
start and length. Draw the glow as a static blurred copy of the track behind
the arc instead of a `drop-shadow` on the moving stroke. Expected: session
idle renders under 5 per 2 s; paints per 2 s roughly halved.

### 10. The main chunk is 2.45 MB and carries every idiom

**Measured.** `index-*.js` 2,446 KB minified, 732 KB gzipped; CSS 464.5 KB
(80 KB gzipped); `react` 190 KB; 15 JS files (2.66 MB decoded) load before
first content; precache 88 entries, 7.09 MB. By source (sourcemap):
`App.jsx` 393 KB, `screens/Workouts.jsx` 76, `agentWorld/beings.js` 74,
`screens/Recipes.jsx` 58, `screens/FuelSummary.jsx` 45, `vals/valsRecipes.js`
42, `screens/MissionControl.jsx` 42, `screens/Inbox.jsx` 40,
`screens/SessionSummary.jsx` 40, `screens/TrainSummary.jsx` 39,
`screens/MissionStructured.jsx` 36, `NovaMac.jsx` 31 (Mac only),
`muscleAudit.js` 24, `moneyDemo.js` 12 (demo only).
**What it costs him is not established here:** with V8's code cache warm,
compile was 0.6 ms. A cold start after iOS evicts the app is the case where
it would matter, and it was not measurable from this Mac.

**Brief (sonnet, after 1-5).** The daily five are static on purpose (App.jsx
comment at the Suspense boundary). Keep his idiom static and move the others
behind `lazyScreen`: under `summary`, `MissionControl` (classic) and
`MissionStructured` (cupertino), `Recipes` (classic Fuel), and the classic
`Inbox` are never drawn. Also lazy-load `NovaMac.jsx` (imported statically by
`screens/NovaThread.jsx:17`), `moneyDemo.js` and the `agentWorld` beings
(74 KB in the main chunk; find the static import chain that pulls
`agentWorld/beings.js` in, starting from the files that mention it:
`glassMarks.js`, `leaderFaces.jsx`, `artifactClient.js`, `vals/valsWall.js`,
`vals/valsSkillSets.js`). Verify: `node
scripts/guard-cupertino.mjs` unchanged; the main chunk under 1.6 MB; the
`index-*.js` breakdown re-run (a small node script over the `.map`, as used for
this audit) shows the moved files gone.

## Further findings (lower impact)

- **css() returns a new object every call** (`src/css.js:5-17`; 1,549 call
  sites). Every render hands React new `style` objects, so React diffs every
  style key of every element, even unchanged ones. A string-keyed cache
  returning a frozen object (`const cache = new Map(); …
  if (cache.has(str)) return cache.get(str)`) gives identity, and React skips
  the whole style diff. Measure with `--rendercost` (`commitMedMs` minus
  `renderValsMedMs` is the reconcile part: 0.8-1.3 ms at 1x, 3-8 ms at 4x).
  Safe only if no caller mutates the returned object: grep for
  `css(` results being spread first (`{ ...css(x), … }` is fine) versus
  assigned into.
- **Render-blocking web fonts.** `index.html` links a Google Fonts stylesheet
  for five families; it is render-blocking and finished at ~400 ms in a
  reload, after the first module had already evaluated at 317 ms. The service
  worker caches it (`vite.config.js` runtimeCaching, StaleWhileRevalidate), so
  on his phone it is probably fast; not verified on device. Self-hosting the
  woff2 files in `public/` (precached) and inlining the `@font-face` rules
  removes the dependency.
- **`valsChrome.js` reads and parses `localStorage.novaos.screenVisits` on
  every render** (line 109). Cache it on the instance and update it in
  `noteScreenVisit`.
- **A Fuel scroll window saw a data push** (one 1x run): 722 renders in 13
  commits during a 4 s scroll, from live updates landing (not from scrolling: no scroll
  handler sets state). Each push re-renders ~180 components; finding 2 fixes
  the cost, and coalescing pushes that land within 250 ms into one `setState`
  would fix the count.

## Motion quality, against the Bento bar and the keynote recipes

What was measured: motion performance (above). What was judged from code:
everything below. **No recordings were taken for this audit**; the briefs say
where a recording is the proof.

**Already right (do not touch):**
- Reduced motion is covered everywhere. The global rule (`index.css:3218-3222`)
  ends CSS animations at .01 s and removes transitions; every one of the files
  that call WAAPI `.animate(` also checks `prefers-reduced-motion` (checked
  file by file: none missing); NovaCore draws one still frame under it
  (`NovaCore.jsx:1106-1110`). Reduced motion gives instant changes rather than
  cross-fades, which the keynote non-negotiables allow.
- The tab-switch motion: no View Transition (the glass cannot be snapshotted,
  17 Sep), the content rises on `<main>` with WAAPI, 260 ms on
  `cubic-bezier(.32,.72,0,1)` (`App.jsx:1362-1374`); the lens rides the snappy
  spring token. The tokens (`--nv-spring-*`, `--nv-ease`, `--nv-dur-*`,
  `--nv-stagger`) exist and are used.
- Interactions that stay local are already fast at 4x (Home carousel 13 ms
  of click work, Inbox unfold 5 ms): the motion code itself is not the
  problem; the main thread it runs on is.

**Findings:**
- **Layout-property animations** (finding 8): the Home highlight bar and the
  Fuel bars, the carousel pager, the Nova page core.
- **`ease-in` on UI.** `GlassSheet.jsx:70` (the close without an origin: 200 ms
  `ease-in`; use `--nv-ease-exit` or `cubic-bezier(.23,1,.32,1)` at 160 ms),
  `motion/ChartMorph.jsx:83-84` (bars-mode exit: the line 400 ms `ease-in`,
  the dots to `scale(0)` 220 ms `ease-in`; end at `scale(.4)` with opacity 0
  on 180 ms ease-out instead), `useFlipList.js:212` (search step-out, 180 ms
  `ease-in`, documented at :43; change only if a recording shows the exit
  lagging the typing).
- **`transition: 'all'`** in `screens/Recipes.jsx:127, 150, 165` (the classic
  Fuel, not drawn under summary): name the properties.
- **"The live timer ticks without reflow" (move 5)**: the session's rest
  second re-renders the page (finding 9).
- **"A change is acted out everywhere it lands" (move 2)**: the machinery is
  present (CountUp in 16 files, NumberRoll in 4, tickReceipt pills in 5,
  FLIP lists in 9), but every acted-out change starts only after the commit
  that carries it. At 4x that commit is 120-240 ms, so the hero animation
  begins ~15-30 frames late at 120 Hz: the change pops, then animates. Findings
  2, 3 and 4 are therefore motion fixes too.
- **Not assessed:** whether every write on every screen counts its numbers
  (move 2), drag lift (move 3) and the one-move re-tint (move 6). Each needs a
  recording per surface (`scripts/rec.mjs --slow 8`), which this audit did not
  take.

## Perceived latency

- **Skeletons vs blanks.** Lazy screens fall back to a single pulsing dot
  (`App.jsx:246-252`), not a skeleton laid out where content lands. In these
  runs the idle prefetch had already loaded every chunk, so no fallback was
  seen; it matters only on a tap that beats the prefetch after a cold start.
  Low priority; if done, a per-screen skeleton (header bar, two card blocks)
  in the same `--nv-sum-*` tokens.
- **Optimistic updates.** The set tick (`App.jsx:5492`) and the Inbox actions
  are local-first. What makes them feel late is the commit they ride on
  (findings 2 and 4), not a server round trip.
- **Haptics timing.** On iOS the tick comes from the native switch under his
  finger at touch end (`Interactive.jsx`), independent of JavaScript, so it
  is not delayed by the commit; the visual is. Finding 5 (lens on
  pointerdown) and finding 4 (tick look on pointerdown) bring the visual back
  to the haptic.

## Glass: what the house material costs (measured, not a proposal to remove it)

Visible `backdrop-filter` elements per screen, all `blur(22px) saturate(1.6)`:
Home 6 (14 in the DOM), Train 5 (25), Fuel 7 (17), Inbox 5 (5), Settings 8 (9),
live session 4 (4). Composited layers: Home 56, Train 117, Fuel 72, Inbox 29,
Settings 37, session 28 (Train's layers cover 16.6 viewports of area).
Its measured cost at rest and in a scroll, in this browser, is small next to
the orb's (ablation table above): turning every backdrop blur off changed main-thread
time by -132 to +51 ms per window and GPU time by -31 to +65 ms, against a
236 ms (main) and 299 ms (GPU) drop for hiding the two orb canvases on Home.
The one visible effect is Train's scroll (-132 ms main, -31 ms GPU with blur
off): Train mounts 25 glass panes, of which 5 are on screen. If Train's scroll
ever measures janky after findings 1-3, the lever is unmounting or
`content-visibility: auto` on off-screen glass panes, not removing the
material.
No change to the glass is proposed. What remains unmeasured is WebKit's
compositing of the same 4-8 panes on his phone; the way to measure it is a
Safari Web Inspector timeline on the device (Timelines, Layers), comparing the
same screen with `* { -webkit-backdrop-filter: none }` injected.

## Recommended order of work

1. Finding 1, the orb's rest rate (small, one file plus three props; the
   biggest win at rest and in every scroll).
2. Finding 3, the forced layouts (small, local, no risk to the data path).
3. Finding 4 and 5, tick and lens on the first frame (small).
4. Finding 2, the view-model memo (the large one; opus; behind tests).
5. Finding 7 and 9 (small CSS and one component split).
6. Finding 8, layout-property animations (one surface at a time, each recorded).
7. Finding 6 and 10, boot deferrals and the chunk split.

Re-run `node scripts/fluidity.mjs --dist <build> --cpu 4` after each step and
keep the JSON beside the commit message's numbers.

## The frame budget per build

For any build that touches a screen (both CPU rates, production build, his
setup, `fluidity.mjs`):

- **At rest:** main thread under 15% busy at 4x (under 300 ms per 2 s idle);
  0 tasks over 8.3 ms at 1x; no infinite animation on a paint property
  (`paintCount` at idle under 20 per 2 s).
- **Scrolling `<main>`:** 0 tasks over 8.3 ms at 1x; under 10 at 4x per
  down-and-back; no rAF gap over 25 ms at 1x.
- **A tap that changes state:** click work under 8 ms at 1x and under 33 ms at
  4x for a local change; under 16 ms at 1x and under 60 ms at 4x for a tab
  switch; the touched control shows its new state in the first frame after
  touch end.
- **Forced layout:** no line in `forcedBy` over 1 ms at 1x inside a commit.
- **Renders:** a local change re-renders the component that owns it, not the
  app; `renderVals` under 3 ms at 1x once finding 2 lands.
- **Motion:** `transform`/`opacity`/`filter`/`clip-path` only; springs from
  `--nv-spring-*`; reduced motion checked; and a recording
  (`scripts/rec.mjs --slow 8`) for anything whose value is how it moves.

## Round 1 results, 2 Nov 2026, measured on the uncommitted tree over HEAD 1709d2fc

Round 1 covered findings 1, 3 (the parts outside App.jsx), 4 and 5 (the parts outside App.jsx), 7, 9 and the ease-in exits. Nothing here is committed; the parent session owns the commit.

**How it was measured.** One snapshot of the working tree was built twice
with `vite build --sourcemap`: *before* is the snapshot with the round's 11
files put back to HEAD, and *after* is the snapshot as it stands. Everything
else in the tree was the same in both builds, including the offline work in
flight at the time (since committed as 1bd4d994). Both were served by
`vite preview` on 5183 and run through `scripts/fluidity.mjs` (his real data,
read-only: 8 writes blocked per run) in the order before 1x, after 1x,
before 4x, after 4x, back to back, so both builds ran under the same
background load. An earlier pair of runs is set aside because a server test
suite and the cupertino guard were running alongside them. The JSON is in
the session scratchpad (`r2-{before,after}-{1x,4x}.json`). The audit's
caveats still apply: this is Blink, not WebKit, and headless vsync is 60 Hz.
A 30 fps rest cap therefore halves the orb's work here; on his 120 Hz phone
it should quarter it, but that has not been measured on the device.

| Finding | Metric | Before, 1x / 4x | After, 1x / 4x |
|---|---|---|---|
| 1 orb at rest | Home idle, main thread ms per 2 s | 319 / 1,141 | 182 / 599 |
| | Home idle, NovaCore + canvas ms | 187 / 686 | 90 / 303 |
| | Home idle, tasks over 8.3 ms | 0 / 102 | 0 / 51 |
| | Home idle, GPU ms | 302 / 261 | 158 / 140 |
| | Train / Fuel / Inbox / Settings / session idle main ms, 4x | 836 / 791 / 864 / 714 / 900 | 463 / 462 / 453 / 464 / 519 |
| | Scroll, main ms / tasks over 8.3, 4x: Home | 2,405 / 138 | 1,163 / 9 |
| | the same for Train | 2,707 / 126 | 1,207 / 4 |
| | the same for Fuel | 1,971 / 66 | 949 / 0 |
| | the same for Settings | 2,058 / 98 | 1,030 / 37 |
| 3 forced layout | `MissionSummary.jsx:577`, Home switch | 7.4 / 40.7 ms | not in `forcedBy` |
| | `FuelSummary.jsx:608`, Fuel switch | 3.1 / 19.0 ms | not in `forcedBy` |
| | `Controls.jsx:298` (Rail), Train switch | 5.0 / 17.9 ms | not in `forcedBy` |
| | `SettingsKit.jsx:92` (Seg), open Appearance | 5.1 / 33.3 ms | not in `forcedBy` |
| | `SessionSummary.jsx:163`, entering a session | 1.8 / 9.4 ms | not in `forcedBy` |
| | Open Appearance, click processing | 36.2 / 181.9 ms | 27.4 / 110.0 ms |
| | Train: open readiness, click processing | 20.0 / 126.8 ms | 17.1 / 106.2 ms |
| | Tab switch click processing, 4x: Home / Train / Fuel | 171 / 148 / 149 ms | 152 / 134 / 133 ms |
| 5 lens | lens target (`--i`) after pointerdown | moves only when the screen commits | moves in the first frame after pointerdown (CDP check, demo data), with the screen not yet switched |
| | pointerdown processing, tab tap, 4x | 1.7-1.9 ms | 2.5-3.3 ms (the bar's own small commit) |
| 4 tick | tick click processing, 4x | 154 ms | 168 ms (within noise; this is the App commit, finding 2) |
| 7 Fuel ping | Fuel idle paints per 2 s / paint ms | 234 / 16.4 (1x), 213 (4x) | 0 / 0 (1x), 0 (4x) |
| 9 rest ring | session idle renders / commits per 2 s | 100 / 2 | 2 / 2 |
| | session idle paints per 2 s | 238 (1x) | 242 (1x), unchanged |
| | session idle raster ms, 1x | 208.8 | 110.3 (the orb's cap is part of this) |

**What did not improve, and why:**
- **Finding 1 missed the brief's own targets at 4x.** Home idle core and
  canvas came to 303 ms, against a target under 150; Home idle tasks over
  8.3 ms came to 51, against a target under 30. Home has two cores (the dock
  and the 36 px header core), both capped at 30, and headless Chrome draws at
  60 Hz, so the cap halves the work here instead of quartering it. The Home
  scroll's core time in the *before* run of this pair, 205 ms, is out of line
  with the audit's 1,147 and with this session's first run (1,163). The after
  figure is 379 ms, the core held still for the scroll. Compare Home scroll
  with that caveat; the other screens' scroll rows are consistent.
- **Finding 3 moved the layout cost more than it removed it on tab
  switches.** The five lines are gone from `forcedBy`, and a picker or rail
  no longer re-reads layout on every App commit, which is where the large
  wins are (opening Appearance: -72 ms at 4x). On a fresh screen, though, the
  browser still has to lay the page out before the first paint. That work
  now happens in its own layout pass, or at the next reader (Inbox's
  Segmented at `Controls.jsx:458` still forces, 13.9 ms at 4x). Tab-switch
  click processing at 1x is unchanged: Home 33.1 to 33.5 ms, Train 36.7 to
  37.8, Fuel 32.5 to 29.3. What is left of a switch is `renderVals`
  (finding 2).
- **Finding 4: the tick's own commit is unchanged.** The tick now shows its
  logged look on pointerdown, in a commit of its own. The click still runs
  the whole App commit, and the `startTransition` on the follow-on
  `setState` is App/vals work that was left for the parent (see the report).
  No `rec.mjs` recording was taken of the tick or the lens.
- **Finding 9: the paint count did not fall.** The ring's
  `stroke-dashoffset` glide (1 s, linear) is itself a paint animation, about
  60 paints a second. The drop-shadow is now on a separate copy that steps
  once a second. The brief's renders target was met (2 per 2 s); its
  "paints roughly halved" was not, and meeting it would mean changing how
  the ring glides.

**Looks the same.** `scripts/shot.mjs --readonly --style summary`, before and
after, on Home, Train, Fuel, Settings › Appearance (the Glow picker and the
Nova Core picker) and a live session with the rest ring running (Push A,
started in memory, the tick's write blocked). The remaining pixel
differences are the Dynamic Island toast, the clock, the live phase of the
orb and the Fuel ping, and the countdown's second. The Today rail fits at
the same level on his data. The ring's glow reads the same at 2x crop.
Reduced motion: the global rule and the per-screen blocks still cover the
new `::after` ping and the ring's arc, the core still draws one still frame,
and the lens keeps `transition: none`.
