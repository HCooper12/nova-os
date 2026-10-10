# 25 · The daily five on the MacBook: desktop audit, 11 Oct 2026

His standing words, 29 Sep: "after all of these refinements the desktop
version also needs to have the same redesign so it complements the phone but
is tailored for the MacBook desktop." This is that round for Home, the Nova
screen, Train, Fuel and Inbox, whose phone rounds are built (`summary` style).
His inspiration for it is the "Dashboard V8" reel (memory
`nova-reel-dashboard-v8`): one frosted pane over a real backdrop, an icon rail
whose label slides out, a bento with a live hero tile, blur-through section
changes, big numerals with goal and average. His motion bar is the "Bento
dashboard animation" reel (memory `nova-motion-standard`).

Evidence: DEMO MODE ONLY. My own Vite on :5229 from a detached worktree of
`dee7c51`, isolated Chrome context `desk1`, an init script setting
`summary × command × glass × hologram` and rejecting every non-GET request
(zero were attempted). Each page measured at 1280×800, 1512×982 (his MacBook
class) and 1920×1080; 4x CPU frame timing at 1512; Tab, Escape, ⌘K and ⌘B
pressed for real; hover read from computed styles under a real pointer.
Source read where demo mode could not show the built page. The mockups for
this round are `design/mockups/93-desktop-daily-five.html`. Method and what
was not seen are in §5.

---

## 1 · Verdict

**Needs work. On the Mac the five are the phone page, centred.** Every
built page is a 760 px column (`maxWidth: '760px'` in all four summary
screens) dropped into whatever width the window has, so the MacBook's extra
width becomes two empty margins and the phone's habits come along: bottom
sheets with a drag grabber, swipe-only row actions, copy that says "tap",
"hold" and "under More", and no hover answer on any summary card. Nothing is
broken: there is no sideways scroll at any width, focus rings exist, Escape
closes the sheets. But nothing was designed for the Mac either, beyond a
238 px sidebar that predates the redesign.

**The number: at 1512, the five pages leave 40% of the content width
unused** (a 760 px column on a 1,274 px canvas), and 21 Tab stops in the
sidebar come before the first thing on any page.

### Per page, per width (demo mode, measured)

`main` is the content canvas right of the 238 px sidebar. "Used" is the
union of visible content across `main`. Lines over 80 characters are counted
per text node at its rendered width. `scrollWidth` is the document's.

| Page | Width | Content / main | Used | Lines > 80 cpl (max) | Screens deep | scrollWidth | Column's left edge in main |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home | 1280 | 756 / 1042 | 73% | 1 (112) | 1.8 | 1280 | 145 |
| Home | 1512 | 760 / 1274 | 60% | 1 (112) | 1.5 | 1512 | 210 |
| Home | 1920 | 756 / 1322 | 57% | 1 (112) | 1.4 | 1920 | 214 |
| Nova | 1280 | 628 / 1042 | 60% | 0 (66) | 1.0 | 1280 | centred |
| Nova | 1512 | 628 / 1274 | 49% | 0 (66) | 1.0 | 1512 | centred |
| Nova | 1920 | 628 / 1322 | 48% | 0 (66) | 1.0 | 1920 | centred |
| Train* | 1280 | 962 / 1042 | 92% | 0 (43) | 1.0 | 1280 | 40 |
| Train* | 1512 | 1194 / 1274 | 94% | 0 (57) | 1.0 | 1512 | 40 |
| Train* | 1920 | 1242 / 1322 | 94% | 0 (62) | 1.0 | 1920 | 40 |
| Fuel | 1280 | 752 / 1042 | 72% | 1 (117) | 1.0 | 1280 | 145 |
| Fuel | 1512 | 752 / 1274 | 59% | 1 (117) | 1.0 | 1512 | 257 |
| Fuel | 1920 | 752 / 1322 | 57% | 1 (117) | 1.0 | 1920 | 285 |
| Inbox | 1280 | 754 / 1042 | 72% | 1 (89) | 1.0 | 1280 | 145 |
| Inbox | 1512 | 754 / 1274 | 59% | 1 (89) | 1.0 | 1512 | 210 |
| Inbox | 1920 | 754 / 1322 | 57% | 1 (89) | 1.0 | 1920 | 214 |

\* Demo mode renders Train's classic `MockWorkouts`, not the built
`TrainSummary` (finding 10). The built page is a 760 px column too, read in
source (`TrainSummary.jsx:84-85`), so in practice Train joins the other four.

| Test (checklist §3, read for the Mac) | As it stands at 1512 |
| --- | --- |
| Focal point | Home: none at a glance; the greeting and four stacked moments compete, the Body rings sit in the left third of their card (33% of its width used). Nova: two demo turns at the foot of an empty canvas. Fuel, Inbox: one honest demo card. |
| Sidebar | 238 px, fixed: brand, 20 page rows in three groups, a 10-agent roster, a connection card. 16% of the width at 1512. Labels Home "Mission Control" (`valsChrome.js:202`) while the page and the phone say Home. The ⌘B tab sits on the viewport's left edge, 180 px from the sidebar it moves at 1920. |
| Phone-only patterns | Bottom sheets with a grabber (Pinned edit, recipe), swipe rows (Inbox card, Fuel log, a routine's lifts), "tap / hold / under More" copy. The dock is absent on the Mac, correctly. |
| Keyboard | ⌘K (Nova screen, no cursor placed), ⌘B (sidebar), Escape (sheets). No page shortcuts, no list keys, no Inbox keys. 21 Tab stops before page content, no skip link. Focus ring present (2 px cyan at 42%). Escape on a sheet leaves focus on `<body>`. |
| Hover | Sidebar rows only. Summary cards and pill buttons keep the same fill and shadow under the pointer; `index.css` has 11 `:hover` rules and none for `.nv-sum-*`. |
| Frame cost, 4x CPU | Idle Home: max 18 ms. Switching page: 118 ms (Fuel) to 218 ms (Nova) in one frame. At 1x: 17 to 33 ms, Home's arrival 75 ms. His bar: none over ~33 ms at 4x. |
| Width | `scrollWidth` equals the viewport at every width on every page. |
| States | Fuel and Inbox demo states are honest single cards ("The Inbox is live only..."). |

---

## 2 · Findings, ranked by visible gain per hour

### 1 · The Nova composer sits 119 px left of the thread it writes into, and the demo pill lies on top of it
`src/index.css:4750-4758`, `src/App.jsx:11787`

The composer is `position: fixed` with `left`/`right` of 12 px and
`margin: 0 auto`, so it centres on the **viewport**, not on `main`. With a
238 px sidebar the thread (centred in `main`) and its composer are 119 px
apart at 1280 and 1512, and the gap holds at 1920. At 1512 the status pill
("Demo data, connect your backend") is drawn at `bottom: 18px`, the same
band as the composer (pill 587 to 926 × 933 to 965; composer 488 to 1024 ×
910 to 966), so the pill covers the field's left half. Under a live
connection the same pill carries every other status line, so this is not
demo-only.

| Before | After | Why |
| --- | --- | --- |
| Composer centred on the window | Composer centred on the thread's own column (`left: var(--main-left)`, or `position: sticky` inside the thread) | `apple-design` §7 spatial consistency: the field belongs to the thread it fills. |
| Status pill at `bottom: 18px` on the Mac | Pill above the composer on the Nova screen (or in the rail foot) | Two layers in one band; the one he types into loses. |

Gain: the page he talks to Nova from stops looking misaligned. About 30 minutes.

### 2 · The column jumps sideways when he changes page
`src/vals/valsChrome.js:152, 157, 161`; `MissionSummary.jsx:751-755`,
`InboxSummary.jsx:476-477` vs `FuelSummary.jsx:817-818`, `TrainSummary.jsx:84-85`

Home and Inbox wrap their 760 px column in `wrapMission` (a 1,180 px box
anchored left), Fuel and Train in `wrapRecipes`/`wrapWorkouts` (no cap, so
centred in `main`). At 1280 they coincide. At 1512 the column's left edge
moves 47 px between Home and Fuel; at 1920, 71 px. Every switch between
the daily five shifts the title and every card by that much.

| Before | After | Why |
| --- | --- | --- |
| Two wrappers for one column | One desktop page frame shared by the five | Wayfinding: the same thing in the same place on every page. |

About 30 minutes; the directions in §4 replace the column anyway.

### 3 · Phone instructions on the Mac
`src/vals/valsSummary.js:97`, `src/screens/InboxSummary.jsx:456`,
`src/vals/valsChrome.js:388-398`, `src/RecipePage.jsx:214`

Home's foot says "Everything else is one tap away under More": the Mac has
no More tab, it has the sidebar. Inbox says "Drop a thought: hold Nova, or
tap to write it": on the Mac the one Nova icon is `FloatingCore`, whose
hold opens the transcript (`toggleLiveText`, `valsChrome.js:398`), not the
capture sheet that the phone dock's hold opens (`holdNovaCore`,
`valsChrome.js:530`). So the sentence describes a gesture that does
something else on this device. The recipe page says "Tap a line as it goes
in". Small, but each is a line that is untrue where he reads it.

| Before | After | Why |
| --- | --- | --- |
| One string for both devices | The vals pick the device's words: "in the sidebar", "⌘⇧N", "click" | Honest degradation: the screen should never describe a control that is not there. |

About an hour.

### 4 · Keyboard: ⌘K lands with no cursor, Escape drops focus, 21 stops to reach the page
`src/App.jsx:1075-1077`, `src/PinnedEditSheet.jsx:57`, `src/RecipeSheet.jsx:15`

⌘K ("summon Nova") opens the Nova screen and leaves `document.activeElement`
on `<body>`, so he still has to click the field. Escape closes the Pinned
editor and the recipe sheet, and focus falls to `<body>` instead of the
Edit button or the recipe row that opened them. The sidebar's 20 rows and
its status card are 21 Tab stops before the first control of any page, with
no skip link. There are no page shortcuts and no list keys; the Inbox's
three verbs are swipe and click only.

| Before | After | Why |
| --- | --- | --- |
| ⌘K navigates | ⌘K navigates and focuses the composer | A summon that needs a second click is half a shortcut. |
| Focus to `<body>` on close | Focus returns to the opener | Standard modal contract; without it the next Tab starts from the top of the sidebar. |
| No keys for the five pages or the deck | ⌃1 to ⌃5, J/K, Y/X/T on the Inbox (mockup 93 has the full map) | The Mac's advantage over the phone is the keyboard. |

About two hours for the first two rows; the map is a design call (§4).

### 5 · No hover answer on any summary card or pill
`src/index.css` (11 `:hover` rules, none for `.nv-sum-*`), `src/Interactive.jsx`

Measured under a real pointer: "Open Money" keeps `rgba(255,255,255,.07)`,
the Training card keeps its fill and shadow. Only `cursor: pointer` says
they are live. The sidebar rows do answer (`hoverStyle`), so the page is the
one place that does not. One restrained answer is enough: the glass rim
brightens on what is clickable, gated by `(hover: hover) and (pointer: fine)`,
never a lift on everything (the global "hover animation on everything" tell).

About an hour of CSS.

### 6 · Sheets rise from the bottom of the window, centred on the window
`src/index.css:2084-2089` (`.nv-fs-scrim`, `align-items: flex-end`),
`src/PinnedEditSheet.jsx`, `src/RecipeSheet.jsx`

The Pinned editor and a recipe open as 560 px phone sheets with a drag
grabber, risen from the bottom edge and centred on the viewport (so, like
the composer, 119 px off the page's own centre). On a 982 px tall window a
recipe's method runs to the bottom edge. Later builds already solved this
for the Mac: `shopping.css:261`, `money.css:312` and `leader.css:455` centre
their sheets above 900 px with full radius. The daily five predate those
rules. On the Mac a detail belongs beside the list (an inspector) or in a
centred panel, and Edit belongs in place.

About two to three hours for the centred variant; the inspector is a
direction (§4 B).

### 7 · At 1920 the frame floats and its controls do not follow it
`src/App.jsx:11699, 11708`, `src/FloatingCore.jsx:24`

The app frame is capped at `max-width: 1560px` and centred, so at 1920 the
sidebar starts 180 px in, with the sky either side. The ⌘B tab stays at
`left: 0` of the viewport, 180 px from the sidebar it moves. The floating
Nova core is `right: 12px` of the viewport, outside the frame. A Mac at
1920 (an external display) sees the controls and the content disagree about
where the app is.

About an hour.

### 8 · Changing page costs one 118 to 218 ms frame at 4x
Measured with a rAF logger in demo mode at 1512, 4x CPU: into Nova 218 ms,
Home 184, Train 160, Inbox 134, Fuel 118. At 1x every switch is 17 to 33 ms
except Home's arrival, 75 ms. Memory `nova-ui-performance` records the
whole-app re-render as the floor (Settings push 33 to 44 ms at 4x after
motion step 2). His standing bar is no frame over ~33 ms at 4x, and his
reel's blur-through section change cannot hide a 200 ms frame: the blur
would stall mid-way. The switch has to get cheaper (keep the five mounted,
or split the render) before the blur-through can be built.

Days, not hours. Ranked here because it gates the motion in every direction.

### 9 · The Mac gets the phone's single column (the structural finding)
`MissionSummary.jsx:755`, `NovaThread`, `TrainSummary.jsx:85`,
`FuelSummary.jsx:818`, `InboxSummary.jsx:477`; `src/App.jsx:655, 1081`

All desktop adaptation is one JavaScript switch, `innerWidth < 760`, and a
handful of wrapper objects in `valsChrome.js`. `index.css` has no width media
query at all (the later `shopping.css`, `money.css`, `leader.css` and
`stash.css` do). So the daily five render the phone layout at 760 px: the
Body card's rings and numerals use the left 33% of the card, Money's moment
42%, the Today strip is the only card that uses its width. Home is 1.5
screens tall at 1512 with 40% of the width empty beside it. The reel's
answer (one pane, mixed tile sizes, a live hero) and the Mac's own answer
(sidebar, list, inspector) both use that width; §4 draws three ways.

The round itself.

### 10 · The built Train cannot be seen in demo mode
`src/vals/valsTrainSummary.js:49`

`trainSummary` is `null` whenever `ctx.demoMode`, so a demo load of Train
shows the classic `MockWorkouts` (seven day chips, a session table, an Ask
Coach panel): the page he chose against in round 1. Fuel and Inbox are
live-only by design and say so honestly. The consequence for this round:
three of the five built pages could not be photographed in demo, and every
desktop build will need a demo fixture for Train (as Code has
`src/dev/codeFixtures.js`) to be checked without his vault.

Half a day for a fixture.

### 11 · The sidebar is the old Command sidebar
`src/Sidebar.jsx:15-93`, `src/vals/valsChrome.js:202`

Brand wordmark, three groups of numbered-or-iconed rows, a ten-agent roster
with a role and a dot each, and a connection card. Against the redesign:
the roster duplicates the Org map in Ops (and every dot there has to pass
the no-fake-data rule, memory `nova-no-fake-data`); "Mission Control"
names a page the redesign calls Home; the counts beside Fuel ("6") and Notes
("6") are recipe and note totals, which read as "6 waiting" beside Inbox's
real waiting count. On 26 Sep he asked for "a sidebar for the other pages
like how Apple settings is organised" (01-home.md §6): grouped rows, icon
tiles, a live value on the right. The phone got that as the Index; the Mac
still has the older list. What the sidebar is for is direction-dependent
(§4).

### Smaller things seen
- Nova's demo reply breaks "84 / g" across a line: a number and its unit
  need a no-break space where the vals write it.
- The Nova thread's head is a 560 px band of 86% void with hard sides
  (`index.css:4509-4512`, `margin: 0 -16px`): on the phone it spans the
  screen; on the Mac it reads as a dark slab floating over the sky.
- The Fuel demo card's sentence runs to 117 characters a line and Home's
  foot to 112, at 13 px: the only two over 80, both in a 760 column.
- The ⌘B toggle is the one control that changes the sidebar, and it has no
  animation, which is right for a keyboard action (the `emil-design-eng`
  rule: no motion on what he does a hundred times a day).

---

## 3 · Keep

- **No sideways scroll anywhere.** `scrollWidth` equalled the viewport on all
  15 page × width combinations.
- **One Nova icon per device.** The dock is absent on the Mac and
  `FloatingCore` is the single icon (`valsChrome.js:384-388`); the Home and
  Nova screens drop it where it would be a second.
- **⌘B in one place, both states** (`App.jsx:11700-11709`), instant.
- **Visible focus.** Every focused control shows a 2 px cyan ring
  (`.nv-nt button:focus-visible` and the Interactive default).
- **Escape closes every sheet tried.** Only the focus return is missing.
- **The summary glass and type.** At 760 px the Nova thread's lines run to 66
  characters, a good measure; the serif standfirst and the SF Rounded
  numerals hold at Mac sizes. The directions keep the material, the violet and
  cyan, `--nv-radius` and the calm shadow, per CLAUDE.md.
- **Honest demo states.** "The Inbox is live only. Connect a backend in
  Settings; captures write to your real vault." and Fuel's equivalent say
  what is missing instead of inventing a plate or a queue.
- **Frame cost at rest and at 1x.** Idle Home at 4x peaks at 18 ms; four of
  five switches at 1x are within 33 ms.
- **Later builds' Mac rules** (`shopping.css:261`, `money.css:312`,
  `leader.css:452-455`): a precedent to follow, not to invent.

---

## 4 · Directions for the desktop language (all five pages)

Shared by all three: one page frame for the five (finding 2), the composer
and pill fixed (1), device-true copy (3), focus returned and ⌘K into the
field (4), a rim-brightening hover on what is clickable only (5), sheets
become centred panels or an inspector (6), the frame and its controls agree
at 1920 (7), and the switch cost brought under the bar before any
blur-through is built (8). Every phone function stays; mockup 93's parity
table maps each to its place on the Mac.

**A · The pane (his reel, in Nova's glass).** One large frosted pane over the
sky; the 238 px sidebar becomes a 72 px icon rail of his tab order, one lit
circle on the active page, the label sliding out on hover or focus; the Nova
core sits at the rail's foot as the one Nova icon. Each page is a bento with
one live hero tile: Home's day strip with the now line, Nova's stage,
Train's session with the muscle hues, Fuel's plate, the Inbox card. Big
numerals carry a goal and an average beneath (the reel's 8,745 / Goal /
Average). Section change on a click blurs the pane through; a keyboard
switch cuts. Removes: the agent roster and connection card from the
sidebar (to Ops and the rail's foot dot). Gain: the width carries the
information; the Mac looks like the reel he sent. Cost: the most new layout
of the three, and it leans hardest on finding 8.

**B · The source list (the Mac's own grammar).** The sidebar becomes the
Index he already has on the phone, in his 26 Sep words "like how Apple
settings is organised": search at the top, grouped rows with an icon tile
in each page's hue and a live value on the right (Fuel "96 of 180 g", Inbox
"4" in gold). Each page is a readable centre column, and a right-hand
inspector replaces every bottom sheet: the recipe, the Coach deck, the
inbox card's detail, Nova's spent panels, Edit for Pinned. Lists move with
↑↓, Return opens into the inspector, Escape closes it and returns focus.
Removes: every sheet on the Mac. Gain: the most Mac-native, the least new
drawing; Inbox becomes Mail-shaped. Cost: the least like the reel; three
columns are tight at 1280 (the inspector overlays below 1360).

**C · Nova alongside.** The rail from A, the page in the middle, and a
standing Nova column on the right of every page that knows which page it is
on: on Train it is Coach's deck and conversation, on Fuel the "say what's
different" thread, on the Inbox "talk about it" for the card in front of
him, on Home the morning's questions. Decisions as a conversation (§2b rule
8) get a permanent seat instead of a sheet; the Nova screen is that column
opened to full width with the stage beside it. Gain: talking back is never
more than a glance away, which is the brief's heart. Cost: the column takes
360 px from every page; on a narrow window it folds to the rail's core.

**What the pixels argue for.** A's pane and bento for Home, Train and Fuel,
where the width has numbers to carry; B's inspector instead of sheets on
every page, because a sheet that rises from the bottom of a laptop is the
most phone-shaped thing measured; C's column considered for Train and the
Inbox only, where a conversation is the work. The mockup draws each
direction whole so he can choose by eye, and "Your calls" asks the mix.

---

## 5 · Method

**Where.** A detached worktree of `dee7c51` at the scratchpad's
`view-desk1`, `node_modules` symlinked, my own Vite on :5229 (PID started
and stopped by me). Chrome DevTools isolated context `desk1`, a page I
created and closed. Each width was set with `emulate` before navigating:
`1280x800x2`, `1512x982x2`, `1920x1080x1`. The init script, re-sent on every
reload: `localStorage` `novaos.style=summary`, `novaos.theme=command`,
`novaos.material=glass`, `novaos.core=hologram`, `novaos.connection`
removed, and `fetch`, `XMLHttpRequest` and `sendBeacon` refusing every
non-GET request into a `__blocked` list. The list stayed empty on every
page at every width: demo mode attempted no writes.

**What was measured, and how.** Per page and width, a script read
`document.documentElement.scrollWidth`, `main`'s width and scroll height,
the union of visible leaf rectangles in `main` (content width and left
edge), characters per line for every text node of 60+ characters
(text length over total line width, times the widest line), and every
fixed or sticky element's rectangle (which found the composer and pill
overlap). Tab order from the DOM's tabbable list (no positive tabindex in
use) and one real Tab press to read the focus ring; Escape pressed for real
on the Pinned editor and the recipe sheet; ⌘K dispatched and
`activeElement` read. Hover: the DevTools hover on "Open Money" and the
Training card, then computed background and shadow compared. Frame cost:
a `requestAnimationFrame` logger around each `location.hash` change, 1.5 to
2 s windows, at 4x and at 1x CPU. The Body card's 33% is the right edge of
its ring and numerals over the card's width.

**Screens looked at** (read inline, none saved): Home at all three widths,
Nova, Train, Fuel, Inbox at 1512, Recipes and a recipe sheet at 1512, the
Pinned editor at 1512.

**What was not seen.**
- The built Train (`TrainSummary`, `SessionSummary`) in any frame: demo
  mode returns the classic `MockWorkouts` (finding 10). Its layout facts
  come from source.
- Fuel's plate, log, rotation and Pick it up, and the Inbox deck, Filed list
  and receipts: live-only, so demo shows one honest card each. Their
  desktop geometry is inferred from the shared 760 px column in source.
- His real vault, on purpose. No connected or `--readonly` run was made.
- `cupertino` and `command` styles: this round is the redesign's, which
  renders only under `summary`. His phone's appearance is untouched by
  anything here.
- Safari. Every number is Chromium's; his Mac may run Nova in Safari, where
  `backdrop-filter` cost and reserved shortcuts differ (mockup 93 avoids
  ⌘1 to ⌘9 for that reason).
- A performance trace with call stacks: the 118 to 218 ms frames are timed,
  not attributed.
- Reduced motion, reduced transparency and 200% zoom at Mac widths.
- The Nova screen's Focus (the full-screen core), the capture sheet, the
  Look deeper sheet and the Coach sheet: not opened in demo.
