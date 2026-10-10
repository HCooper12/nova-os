# 26 · The MacBook round for the other eight pages, audit, 11 Oct 2026

Settings, Leader, Briefing, the wall (Ambient), Code, Money, Stash and
Shopping, each already rebuilt for his phone, looked at the way he meets them
on the MacBook: a window 1280, 1512 or 1920 points wide with Nova's sidebar
on the left. His standing words (29 Sep): "the desktop version also needs to
have the same redesign so it complements the phone but is tailored for the
MacBook desktop." The daily five (Home, Nova, Train, Fuel, Inbox) are a
separate audit and mockup (93); the desktop language this file proposes is
written out in §4 so the two can be reconciled.

Evidence: demo mode only, in an isolated browser context, style summary,
theme command, material glass, core hologram, a guard rejecting every
non-GET request (it recorded **zero** blocked requests across every page and
width). Viewports 1280×800×2, 1512×982×2, 1920×1080×1. Dev fixtures used:
`?codefx=demo|worst|loading`, `?moneyDemo=worst|loading`,
`?stashDemo=worst|loading`, `?shopDemo=worst|loading`. Source read for every
locator below. Mockup: `design/mockups/94-desktop-other-pages.html`.

---

## 1 · Verdict

**Needs work.** Three of the eight pages already have a real Mac layout
(Money's three columns, Code's root-as-sidebar, the wall's MacBook frame),
and they are good. The other **five of eight are the phone page made wider**:
Settings and the Leader sit in a 680 and a 512 point column with 297 and 381
points of empty sky either side at 1512; the Briefing landing is a phone stack
pinned left; Stash is pinned left with 374 points empty on its right; Shopping
stretches its phone hero to 1,194 points and pushes the list itself below the
first screen. Around all eight, the sidebar still speaks Command's HUD
language (letterspaced wordmark, mono caps, an agent roster) while every page
inside it speaks the summary language, and it gives the keyboard twenty tab
stops before any page content. Nothing scrolls sideways at any width, line
lengths are under control, and every page tells the truth about demo data:
the bones are sound, the Mac has simply not been designed for yet.

### The numbers, at 1512 × 982 unless stated

| Page | Mac layout today | Content column | Empty beside it | Screens deep | Type sizes | Longest line | Mount long task, 4x CPU | Worst frame after, 4x | Focus ring | scrollWidth 1280 / 1512 / 1920 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Settings | Phone column, pages push | 680 centred | 297 each side | 1.27 | 4 | 70 ch | 178 ms | 59 ms | House cyan | 1280 / 1512 / 1920 |
| Leader | Phone column | 512 centred | 381 each side | 1 (demo is empty) | 2 | 51 ch | 93 ms | 15 ms | House cyan | 1280 / 1512 / 1920 |
| Briefing (landing) | Phone stack, left | 520 to 560 text, left | about 700 on the right | 1 | 7 | 87 ch (a footnote) | 118 ms | 17 ms | House cyan | 1280 / 1512 / 1920 |
| The wall | MacBook frame (built, O3) | Full screen | Lower 45% empty in demo at 1280 × 800 | 1 | 6 | 52 ch | 156 ms | 92 ms | House cyan | 1280 / 1512 / 1920 |
| Code | Root as sidebar + 2 columns | 1,240 | 34 | 1.23 | 10 | 39 ch | 230 ms | 33 ms | Browser default blue | 1280 / 1512 / 1920 |
| Money | Three columns (built, D2) | 1,194 | 40 | 1.77 | 9 | 50 ch | 259 + 143 + 51 ms | 165 ms | Browser default blue | 1280 / 1512 / 1920 |
| Stash | Phone stack, left | 820 to 900, left | 374 on the right | 2.25 | 8 | 89 ch (a footnote) | 263 ms | 33 ms | Browser default blue | 1280 / 1512 / 1920 |
| Shopping | Phone stack, stretched | 1,194 | 0 | 2.90 | 16 | 27 ch | 510 ms | 50 ms | Browser default blue | 1280 / 1512 / 1920 |

Across all eight: **20** sidebar tab stops before page content, no skip link;
**0** hover rules in `settings.css`, `leader.css`, `code.css`, `money.css`
and `shopping.css` (`stash.css` has 1, gated; Briefing's live in
`index.css`); **0** page-level shortcuts beyond Escape (Money's keypad digits
excepted); the app frame caps at **1,560** points, so at 1920 the sidebar
floats 180 points in from the window's edge. Worst-case fixtures at 1280:
scrollWidth still 1280 on every page; Code truncates **16** text runs (file
paths) in its narrow middle column.

The motion standard (memory `nova-motion-standard`) asks for no frame over
about 33 ms at 4x CPU during a transition. Money (4 frames over, worst 165),
Shopping (3, worst 50), the wall (1, worst 92) and Settings (1, worst 59)
miss it on arrival; every page spends 93 to 510 ms in one blocking task as it
mounts. These are dev-build numbers from a requestAnimationFrame probe, not a
trace (§5).

---

## 2 · Findings, ranked by visible gain on the Mac per hour

### 1 · Five pages are the phone page made wider
`src/settings.css:64` (`.nv-set-col { max-width: 680px }`), `src/leader.css:455-457`
(540 at ≥900), `src/index.css:5560-5561` (Briefing lead and note at 520/560),
`src/stash.css:9` with `src/vals/valsChrome.js` `wrapStash` maxWidth 900,
`src/shopping.css` (no wide rule; the hero and rails run the full main width)

At 1512 the Settings row is 680 wide, so the eye travels about 590 points
from "Voice" to "Speaks aloud"; a sub-page replaces the list rather than
opening beside it (`src/screens/Settings.jsx:246-281`, the push stack), so
on a screen with room for both he loses the list every time. The Leader's
one card sits in 512 points with 762 points of sky around it. Stash is pinned
to the left edge of `main` and leaves 374 points on the right; its four vials
spread across 820 points and its three "Check the level" answers are 400
points each, the loudest objects on the page. Shopping's "Where to buy" bar is
1,250 points long and the list he came to tick starts below the first screen
at 1280 × 800.

| Before | Why | Severity |
| --- | --- | --- |
| A centred or left-pinned phone column, or a stretched phone stack, at every Mac width | `apple-design` § Flexibility: "iPhone = quick touch; desktop = deep workflows with precise pointer control"; `interface-design` § Proportions: "if you can't articulate what a proportion is saying, it isn't saying anything" | High |

### 2 · The sidebar is Command's HUD around summary pages
`src/Sidebar.jsx:16-24` (the `NOVA·OS` 21 pt wordmark at .16em, mono Eyebrows),
`:64-74` (the agent roster in mono caps), `:76-94` (the status card in caps:
"DEMO · CONNECT A BACKEND IN SETTINGS"), `src/vals/valsChrome.js:115-127`

Every page inside the window was rebuilt in the summary language (SF, sentence
case, glass cards, one hue per page). The frame around them was not. At
1280 × 800 the roster and status card push Operations and Settings below the
sidebar's own fold (seen: "Operations" cut at the bottom edge). The active
row is the same cyan for every page, so the page's own hue (Money violet,
Stash teal, Leader magenta) never reaches the one object that says where he
is.

| Before | Why | Severity |
| --- | --- | --- |
| Two design languages in one window; nine roster rows that say nothing true in demo ("Unknown until the Mac answers") taking the sidebar's lower half | `apple-design` § Materials: "darker/heavier materials separate structural regions (sidebars)"; one language per window; §2b rule 8: colour means something | High |

### 3 · Three sidebar rows wear the Home icon, two pages have no row
`src/TabIcon.jsx:29` (`PATHS[name] || PATHS.mission`), `src/vals/valsChrome.js:201-246`

`library`, `leader` and `practice` have no path in `PATHS`, so they draw the
Home house (seen at every width). Briefing and the wall have no sidebar row
at all, and the Index that lists them on the phone has no sidebar row of its
own, so on the Mac neither page has a door in the navigation (asking Nova
still reaches Briefing).

| Before | Why | Severity |
| --- | --- | --- |
| Three identical house glyphs in one list; two built pages unreachable from the Mac's navigation | `apple-design` § Wayfinding: "Where am I? Where can I go?"; Familiarity: "things that look the same must behave the same" | High |

### 4 · The sidebar's counts contradict the page in demo
`src/vals/valsChrome.js:213` (Shopping from `st.liveShoppingList`), `:236` (Stash from `st.liveStash`)

In demo the sidebar says Shopping **0** while the page says "13 of 16 to get",
and Stash **0** while the page says "13 links on 5 shelves". The summary pages
read their own fixtures (`src/shopDemo.js`, `src/stashDemo.js`); the sidebar
reads the old live state. Connected, both should read the vault, so this may
only bite in demo, but a number beside a number that disagrees is exactly
what his 7 Oct rule forbids (memory `nova-no-fake-data`).

| Before | Why | Severity |
| --- | --- | --- |
| "0" in the sidebar, "13" on the page, at the same moment | His rule: "Never false data"; a count must trace to one reading | Medium |

### 5 · Keyboard: twenty stops to reach a page, and nothing to do once there
`src/Sidebar.jsx` (20 focusable rows), `src/App.jsx:1071-1077` (⌘K Nova, ⌘B sidebar, Escape)

On every page the first 20 Tab presses walk the sidebar. On the wall the
sidebar is still in the tab order behind the full-screen glance (20 stops you
cannot see). Inside the pages there is no list navigation (arrows or J/K), no
search key (Settings and Stash both have a search field), no add key (Money,
Stash and Shopping each have a ＋ or an add field), no Undo key for the receipt
pill every write now leaves. Code, Money, Stash and Shopping fall back to the
browser's 1 pt blue focus ring (measured `outline: 1px rgb(0, 95, 204)`),
which nearly disappears on the dark glass; the other four wear the house's
2 pt cyan.

| Before | Why | Severity |
| --- | --- | --- |
| Pointer-only pages on a machine he drives with a keyboard | `interface-design` § States: "Every interactive element needs default, hover, active, focus"; WCAG 2.4.1 bypass blocks; `emil-design-eng`: never animate keyboard-initiated actions (so the keys must exist first) | High |

### 6 · Phone-only patterns left running on the Mac
- Back buttons to phone parents: Leader "‹ Index" (`src/screens/Leader.jsx:304`, `:482`); Shopping's round back "Back to More" (`src/screens/ShoppingSummary.jsx:92`). On the Mac the sidebar is the parent.
- Floating bottom bars from the dock era: Stash's paste bar (`src/stash.css:230`), Shopping's add bar (`src/shopping.css:251`), and the status pill on the same 18 pt line (`src/App.jsx:11784-11795`). Seen overlapping each other and the cards under them at 1280 and 1512. Connected, the pill shows "Backend unreachable" exactly when the bars matter.
- A Dynamic Island toast at the top centre of a Mac window, over the page title (Stash's price drop, `src/screens/StashSummary.jsx:784`).
- Horizontal snap rails with hidden scrollbars (`src/shopping.css:168-169`): no affordance for a mouse; in the worst case at 1280 one card sits past the edge.
- Swipe as the only Remove on a Shopping row (`src/screens/ShoppingSummary.jsx:324-330`). Money keeps a second door ("Delete line" in the line sheet, `MoneySummary.jsx:961`); Shopping, as far as the source shows, does not. Not driven with a mouse drag (§5).
- iPhone copy on the Mac: "When the phone is on silent" (`src/screens/SettingsPages.jsx:62`), "iOS Settings › Accessibility › Spoken Content" (`src/vals/valsSettings.js:103`).

| Before | Why | Severity |
| --- | --- | --- |
| Six patterns that exist because a thumb and a 390 point screen exist | The 7 Sep rule: every capability has a pixel he can press; `apple-design` § Familiarity: "close is always top-left on macOS" | Medium |

### 7 · Code shows two navigation columns side by side
`src/code.css:386-394` (`.nv-cd.wide { grid-template-columns: 320px minmax(0, 1fr) }`), `src/screens/ClaudeCode.jsx:684`

Nova's sidebar (238) plus Code's own root-as-sidebar (320) take 558 points
before the work starts: 44% of a 1280 window. The commit column is then about
480 points, so paths truncate ("src/sheets/ …", "src/screen…"), and in the
worst case 16 runs of text are cut. The diff peek, the thing a commit is
judged by, is three lines tall.

| Before | Why | Severity |
| --- | --- | --- |
| Two sidebars, a narrow diff | `interface-design` § One focal point; the diff is the evidence for the one verb on the page (Commit) | Medium |

### 8 · Arrival does not meet his motion bar on the Mac
`src/screens/MoneySummary.jsx:553-565` (the skeleton), `:53-62` (`useWide` at 940)

Money's skeleton is the phone's single column (a hero, two tiles, one wide
card), then the page lands as three columns: the skeleton is not "laid out
exactly where the content lands" (memory `nova-motion-standard`, move 1).
Settings, Leader and Stash have no Mac-shaped skeleton either. The measured
mount tasks (93 to 510 ms at 4x) and the frames over 33 ms (Money, Shopping,
the wall, Settings) are listed in §1.

| Before | Why | Severity |
| --- | --- | --- |
| A one-column skeleton that jumps to three; long mount tasks | His bar, 9 Oct: "no frame over ~33 ms at 4x CPU", "arrival with skeleton + count-up" | Medium |

### 9 · Three different answers to "am I on the Mac?"
`src/App.jsx:655` and `:1081` (`isMobile` below 760), `src/screens/MoneySummary.jsx:53-62`
(a ResizeObserver at 940 on its own container), CSS breakpoints at 720, 760,
900 and 1040 across `leader.css`, `money.css`, `stash.css`, `shopping.css`

Code and Briefing read `v.isMobile`; Money measures itself; Stash, Shopping
and the Leader rely on media queries; Settings has none. The pages therefore
switch at different widths and none of them knows whether the sidebar is open
(⌘B changes `main` by 238 points with no page told). This is why five pages
were never given a Mac layout: there was no shared place to put one.

| Before | Why | Severity |
| --- | --- | --- |
| No desktop layout contract | Shared formats are contracts (CLAUDE.md); one breakpoint system, decided once | Medium (it is the root of finding 1) |

### 10 · No hover anywhere a pointer would look for it
`src/settings.css`, `src/leader.css`, `src/code.css`, `src/money.css`, `src/shopping.css`: 0 `:hover` rules

A Settings row, a Money line, a Shopping row, a Code file and a Stash card
give no sign under the pointer until pressed. The sidebar alone has hover
(`src/Sidebar.jsx:29`). The global rule (`src/index.css:73-77`, `:3086`)
rightly gates hover behind a fine pointer; the pages simply never wrote any.

| Before | Why | Severity |
| --- | --- | --- |
| Silent under the pointer | `emil-design-eng` § Touch device hover states: gate it, do not omit it; states are not optional | Low |

### Smaller things seen
- At 1920 the whole app is capped at 1,560 (`src/App.jsx:11699`) and centred: 180 points of sky on each side, and the sidebar floats off the window edge.
- The wall in demo says "Cleared for deep work at 15:30." above "Next · None · nothing left": the tagline and the readout disagree (demo copy, not his data).
- The FloatingCore sits over the third Money column's foot at 1280 ("October" cut under it).
- Briefing's "Researched · written · read aloud" sits at the far top right, 900 points from the headline it describes.

---

## 3 · Keep

- **Money's three columns** and the line sheet as a side pane on the Mac (17 D1 to D2). The best Mac page Nova has; directions A and C keep it almost as is.
- **Code's idea of the root becoming a sidebar** (20 K1). Right instinct; the fix is that Nova's own sidebar should hold it, not stand beside it.
- **The wall's MacBook frame** (21 O3): clock 170, the waiting count, the band at the foot, "esc" beside Done, Esc closing the sheet first. Black ground, no wash.
- **Briefing's Mac end** (12 M1 to M5): the boards fanned in one row, the end card as a right column, Script as a side panel while it plays.
- **Every page's honest demo and empty states**: the Leader refuses to invent ("nothing is invented here"), Stash says "Demo links, invented", Shopping says "example prices". Zero writes attempted from any of the eight pages under the guard.
- **Escape**, already wired on every page and sheet, in the right order (sheet first, then the page).
- **Stash's right-click** opens the press-and-hold menu (`StashSummary.jsx:233`): the one Mac-native door already built.
- **Line lengths**: the max-widths that make the pages too narrow also keep every reading line under 90 characters. Keep the measure, change the composition around it.
- **⌘K for Nova and ⌘B for the sidebar**, with the edge tab in one fixed place.

---

## 4 · Directions for the mockup round, and the desktop language

### The desktop language (shared by A, B and C; written for reconciling with 93)

1. **The window.** The sky runs to the window edge; no 1,560 cap. `main` lays
   pages on a 12-column grid, 24 pt gutters, 32 pt outer padding, content
   capped at 1,320. Reading text holds at about 66 characters whatever the
   column. One breakpoint contract, read from `main`'s own width (so ⌘B and a
   resized window both count): **compact** under 900, **regular** 900 to
   1,239, **wide** 1,240 and up. Every page declares what it does at each.
2. **The sidebar is the parent.** On the Mac nothing says "‹ Index" or
   "Back to More". It wears the summary language: SF, sentence case, the same
   glass as the cards at the heavier structural weight, a real icon for every
   row, his tab order, counts only from the reading the page itself shows.
   The active row lights in **the page's own hue**. Agents leave the sidebar
   (they live on the wall and in Ops); one plain line says what is working
   right now, from `agentsWorking`, or nothing.
3. **Sheets become panes.** What rises from the foot on the phone opens as a
   right-hand inspector 380 to 420 wide on the Mac, entering from the right
   (240 ms, the drawer curve) and leaving the same way, with no scrim, so the
   page stays usable beside it. A true interruption (a destructive confirm)
   stays a centred dialog over a scrim.
4. **Floating bars dock.** Composers and add fields sit in their column,
   static, as Code's already does at wide. Receipts (the Undo pill) and the
   status line share one place: the foot of `main`, left aligned, never over
   a field.
5. **Keyboard first.** First stop is a "Skip to the page" link. Every page
   answers the same keys: ⌘1 to ⌘9 the sidebar in his order, ⌘F or / search
   the page, ⌘N the page's add, ↑ ↓ (and J K) move the selection, Return
   opens it, Space ticks it, ⌘Z takes back the last receipt, Escape closes the
   pane and then the page, ? shows the keys. Keyboard moves never animate:
   the selection jumps (Emil: an action done a hundred times a day gets no
   animation). One focus ring everywhere: 2 pt, the page's hue at 70%, 2 pt
   offset.
6. **Hover only where a pointer is** (`(hover: hover) and (pointer: fine)`):
   a row tints 6% ink and shows its quiet second verb; a card never lifts or
   scales; a tooltip carries the key after 500 ms, instantly for its
   neighbours.
7. **Motion to his standard.** Arrival: a skeleton in the Mac layout's exact
   shape, then numbers count up, bars grow, arcs draw, cards rise in a 40 ms
   stagger. A write is acted out on every number it changes. Lists reorder by
   FLIP. A pane slides; a page cross-fades through a 4 pt blur (the Dashboard
   V8 move), never slides sideways. Reduced motion: the end state with short
   cross-fades. Transform, opacity and clip only.
8. **House materials stay**: nv-liquid glass, violet and cyan, the soft
   radius, the calm shadow, the blue core; each page keeps its hue.

### A · Panes (Mail and System Settings)

**Removes** the phone column and both stretched stacks. **Keeps** the full
sidebar (restyled) and every function. **Moves** each page to list, detail
and inspector: Settings becomes a list beside the open page; the Leader's
Now card and the rows become a list beside the open item and its thread;
Stash gets a shelf list, the grid, and an inspector for the selected item;
Shopping puts the list first with the plan and points in a right column;
Code's projects move into Nova's sidebar under "Code", freeing the width for
a real diff. Most Mac-native, densest, the most build.

### B · Rail and canvas (the Dashboard V8 reel)

**Removes** the full sidebar: a 72 pt icon rail with one lit circle in the
page's hue, the label sliding out on hover or focus (the reel's "Rooms &
Zones" move). **Keeps** every function. **Moves** each page into one large
frosted pane with tiles inside it, a second, lighter glass level: a mixed
bento where the hero tile is the live thing (Money's donut, Shopping's plan,
Code's diff, the Leader's Now card). A tile opens in place to its detail.
Most glanceable, closest to his inspiration reel, wants a strong rule about
tile sizes or it drifts into "a bento for its own sake".

### C · Column and margins (the phone, with a Mac's margins)

**Removes** nothing of the phone composition. **Keeps** the sidebar
(restyled, as A). **Moves** what the phone hides behind a tap into the two
margins of a centred reading column: a left margin with the page's outline
(its sections, each a key) and a right margin with what belongs beside the
page (Undo history, the Leader's consulted agents, Shopping's plan, Code's
runs). The least rebuild and the closest match to the phone he approved;
weakest use of a 1920 screen.

---

## 5 · Method

**Instruments.** One detached worktree of `dee7c51` with `node_modules`
symlinked, its own Vite on 5230, one page in the isolated context `desk2`,
viewport set by `emulate` before every navigation, an init script setting
`novaos.style=summary`, `novaos.theme=command`, `novaos.material=glass`,
`novaos.core=hologram`, clearing any connection, and wrapping `fetch`,
`XMLHttpRequest` and `sendBeacon` to reject every non-GET call (re-installed
on every reload). `window.__blocked` stayed empty throughout. Pages reached by
setting the hash in place, so the guard held across them.

**Measurements.** Column geometry from `getBoundingClientRect` on `main` and
its first wrapper that has more than one child; line lengths by counting the
distinct line tops of each text node over 50 characters (`Range.getClientRects`)
and dividing its length; type sizes as the distinct computed font sizes of
elements holding text in `main`; focus rings by calling
`focus({ focusVisible: true })` on the first six focusable controls in `main`
and reading `outline`; tab order as the visible focusables in DOM order, split
by whether they sit in the sidebar. Frame cost: CPU throttled 4x, a
requestAnimationFrame probe started before each hash change and run 2.5 s,
with a `longtask` PerformanceObserver beside it. The probe's first frame lands
after the mount task, so the mount cost is reported as the long task and the
frames as what followed. A dev build, at the emulator's 120 Hz frame clock.

**Frames looked at.** 1280 × 800: all eight in demo, Settings' Voice page
pushed, Money loading. 1512 × 982: the geometry and keys for all eight.
1920 × 1080: all eight measured, Settings photographed. Worst case at 1280:
Code, Money, Stash, Shopping. All viewed with the screenshot tool and kept
out of the repo (audit convention); no stills are saved.

**What was not seen.**
- **The Leader with content.** Demo mode shows the Leader's honest empty
  ("nothing is invented here") and has no fixture; its populated Mac layout is
  taken from the build checklist (11 §2, §3, the note that "on the Mac the
  column holds at 540 pt") and `src/leader.css`, not photographed.
- **Briefing playing, Script, Read and the end.** Demo has no briefing to
  play; the Mac stage and end are taken from 12 §M and the source.
- **The wall with agents waiting or working.** Demo shows its no-agents
  state; the several-waiting MacBook frame is 21 O3's, not re-photographed.
- **Settings' other pages** beyond Voice; **Code's** Sessions and Runs tabs
  and a commit acted out; **Money's** import and add sheets on the Mac;
  **Stash's** Reader, menu and inspector-like sheets; **Shopping's** sheets
  and its By shop view.
- **A mouse drag on a SwipeRow**; **hover** states were read from CSS, not
  hovered; **reduced motion** and **reduced transparency** read from the CSS,
  not emulated.
- **Real hardware**: a MacBook's trackpad, Safari (he may run Nova in Safari
  or as an installed web app on the Mac; both untested), real 120 Hz.
- **The other agent's mockup 93** for the daily five, by design.

**Skills loaded before looking:** `apple-design`, `emil-design-eng`,
`interface-design`, `animate`, `break-ui`, and the global
"Don't let it look AI-generated" list read against Nova's own exceptions.
