# 13 · Lists (To-Do, Shopping, Stash): audit, 5 Oct 2026

Three small screens of the redesign (`design/REDESIGN-CHECKLIST.md` §5 Tier 3,
rows T1 to T4, G1 to G5, X1 to X2), audited together because they share one
shape: add a thing, see it grouped, then finish it or remove it. Judged against
his brief ("Simplicity with all functionality and a beautiful aesthetic, along
with ease of use MUST be the goal"), NOVA-METHOD §2b rules 7 and 8, and his
standing calls: the iOS Mail swipe grammar through `src/SwipeRow.jsx`, every
write undoable, and a sync that failed says so.

Evidence: source read in full for `Todos.jsx` (129 lines), `valsTodos.js`
(108), `Shopping.jsx` (147), `Stash.jsx` (90), the list parts of `valsMisc.js`,
`SwipeRow.jsx`, `swipeAction.js`, the App.jsx handlers for every write, and
the server side (`server/lib/todos.js`, `shoppingList.js`, `stash.js`,
`todoistSync.js`, `compost.js`). Frames in demo mode at 390×844 (mobile,
touch, 3x) and 1280×800 under his look (summary style, Nova glass, command
theme, hologram core), with every non-GET request refused; computed-style
sweeps of `main` in demo, loading, offline, empty and full states. Read under
`apple-hig-review` with thirteen of its references open (listed in §5), cited
as `file.md › Heading`, and "judgment" where none applies. The mockups for this
round are `design/mockups/78-redesign-lists.html`.

Demo mode has no lists at all: with no connection `liveTodos`,
`liveShoppingList` and `liveStash` stay null. To see them, obviously invented
records (11 open to-dos and 3 done, 14 shopping items in 7 aisles, 8 links on
3 shelves), shaped exactly as the server's GET responses, were put into the
page's in-memory state, the same method as the Library audit. Nothing was
fetched or written; §5 has the method and its limits. No record of his is
quoted anywhere here.

---

## 1 · Verdict

**Critical issues.** The three screens do one simple job and draw it three
different ways, and the one he would open most cannot show what is on it.

The number that says it: **0**. Since 23 Sep (be14df3) no open to-do in Nova
shows its own words. `Todos.jsx:89` renders `{t.display}` and reads
`t.isLink`; `mkTodo` in `valsTodos.js:42-68` builds neither (the `linkify` and
`URL_RE` it was meant to use sit unused at `valsTodos.js:12-17`). Every open
row shows a box, its group name and its age around an empty line, in every
style and at every width. Only VoiceOver hears the words, through the
checkbox's label. The checklist's "re-verified" note on finding #7 was made
from source; the pixels say otherwise.

Behind that bug: three heads, three add forms, three row shapes and nine type
sizes for one shape; 81 of 102 controls under Apple's 44 pt default and 3 under
the 28 pt floor; a tick that leaves in one frame, with its way back a 21 pt box
1.3 screens down; 1 write in 10 with an Undo, while the biggest button on
Shopping deletes without one; Shopping calling an offline copy "live"; a
Todoist line that cannot say a sync failed; and gold used as wallpaper on two
of the three. What is right and stays: the SwipeRow grammar, Shopping's
arm, confirm and Undo on Clear all, the optimistic writes, the staleness
hairline, the aisles, recipe amounts on the line, and honest empty copy.

### Clutter numbers, as it stands (checklist §3)

Full state, connected look, invented records; fold = top of the tab bar (776 pt).

| Test | To-Do | Shopping | Stash | Target |
| --- | --- | --- | --- | --- |
| Focal point | The add pane; rows below have no words | The add box and a 60 pt "+ Add"; the loudest control on the page is "Confirm completion" (deletes, no undo) | A 27 pt gold title, a three-line intro and a four-field form; first link 502 pt down | One, above the fold: the list |
| Tappable above the fold | 15 (7 rows visible, 0 with words) | 24 (7 rows) | 17 (3 links) | Lower, or a reason |
| First row | 276 pt | 290 pt | 502 pt | As high as the head allows |
| Verbs per row | 3: box, swipe Done, group (32 pt) · no remove | 4: row, swipe, −, + · quantity drawn twice | 3: two links to one URL, × · no swipe | One primary, one quiet, talk back |
| Type sizes | 7 (12, 12.5, 13, 13.5, 15, 16, 30) | 9 (10.5 to 30) in 3 families | 8 (12 to 30) in 2 families | ≤ 3 |
| Tap floor | 26 of 27 under 44; **3 under 28** (Done's reopen box, 21×21); main box 43×43, not the 44 its comment claims | 29 of 46 under 44; steppers exactly 28×28, 2 pt apart | 26 of 29 under 44; smallest 30 | ≥ 28; ≥ 44 primary |
| Gestures | Swipe right only | Swipe right only | None | iOS Mail grammar, each with a pixel |
| Motion | The chrome's 260 ms rise of `main` only. Exit: none (a ticked row is gone in the first frame, 0 animations). SwipeRow interruptible. Nothing in the lists themselves | Same; a tick is an instant style swap | Same; a remove vanishes | All four |
| States | Loading "Loading…" (no skeleton) · empty honest · offline labelled · sync failure invisible | Loading says "Connect a backend in Settings" and "Nothing on the list yet" · offline says "live from Obsidian" | Loading "Loading…" · empty honest · offline labelled | All four, honestly |
| Undo | Re-tap a 21 pt box in Done, 1,130 pt down | 1 of 5 writes (Clear all) | None | Every write |
| Hue | None (Index `--nv-ink40`); cyan box, gold age | None; gold title, 7 gold aisle labels, gold amounts | None; gold title and labels | One each, meaningful |
| Screens deep at 390 | 1.72 (about 1.96 with words restored, estimated) | 1.87 | 1.41 | ≤ 4 |
| Width | `scrollWidth` 390 at 390 | 390 | 390 | 390 |
| 1280 | Content 860, card 780 | Content 1042, card 962; stepper about 650 pt from its item | Content 900, card 820 | One reading width |
| Idioms | No summary branch: cupertino structure under summary; tracked-capital eyebrow head, not the 34 pt title of the redesigned pages | Same | Same | One view model, both checked |

---

## 2 · Findings, ranked by visible gain on his phone per hour

### 1 · No open to-do shows its words
`Todos.jsx:89`; `valsTodos.js:42-68`, `:12-17`; introduced be14df3 (23 Sep)

Seen at 390 and 1280 with 11 invented to-dos shaped as `GET /api/todos`
returns them (`server/lib/todos.js:55-65`: `{raw, checked, text, added,
category}`): each row reads "WORK · 9d ago" with nothing above it. Before
be14df3 the line rendered `{t.text}`; the commit switched it to `{t.display}`
and never added the field. Done rows still render `t.text` (`Todos.jsx:120`),
so finished to-dos are legible and open ones are not.

| Before | Why | Severity |
| --- | --- | --- |
| An empty title line on every open to-do since 23 Sep | `lists-and-tables.md › Best practices`: "Prefer displaying text in a list or table… the row-based format is especially well suited to making text easy to scan and read." The screen cannot do its one job. Fix: `display: linkify(t.text), isLink: URL_RE.test(t.text)` in `mkTodo`, and a test that renders a row and finds its words | Critical |

### 2 · A tick is not acted out, and taking it back is 1.3 screens away at 21 pt
`Todos.jsx:56-58, 111-123`; `App.jsx:5759-5778`; `Shopping.jsx:80-93`

Measured: after a tick the open list goes from 11 rows to 10 in the first frame
with zero animations; the item reappears in Done, whose header sits at 1,130 pt
(1.34 screens down), and its reopen box is 21×21. No toast, no undo near the
row. On Shopping a tick is an instant swap to a struck line. SwipeRow's own
collapse motion (`swipeAction.js:135-172`) exists and these lists do not use
it.

| Before | Why | Severity |
| --- | --- | --- |
| Row gone in one frame; reopen box 21×21, far below | `accessibility.md › Mobility`: "iOS, iPadOS 44x44 pt default, 28x28 pt minimum." `undo-and-redo.md › Best practices`: "Show the results of an undo or redo… highlight the result." `motion.md`: "Aim for brevity and precision in feedback animations." §2b rule 7: a change is acted out | Critical (the 21 pt box) / High |

### 3 · One write in ten has an Undo, and the loudest button is one without
`Shopping.jsx:135-144`; `server/lib/shoppingList.js:165-171`; `App.jsx:4013-4021`, `1548-1563`

The ten writes: To-Do add, tick, group; Shopping add, tick, quantity, clear
ticked ("Confirm completion"), clear all; Stash add, remove. One has an Undo
(Clear all, `Shopping.jsx:39-48`). Five can be reversed by doing the opposite.
Two cannot be reversed in the app: "Confirm completion" (a filled cyan
358×44 button, no confirm, toast "Shopping list updated ✓") deletes every
ticked item, and a Stash remove is final after its inline confirm (the server
keeps a file backup, the app no way back). Two have no way to take back a
wrong entry: a to-do cannot be deleted ("Nothing is ever deleted on either
side", `Inbox.jsx:682`), and one wrong shopping line leaves only by ticking it
and clearing everything ticked. The safe act (Clear all) is a quiet 32 pt text
action; the unguarded one is the brightest object on the page.

| Before | Why | Severity |
| --- | --- | --- |
| Irreversible clear in a primary button; final Stash remove | NOVA-METHOD: "Everything writeable is undoable." `feedback.md › Best practices`: "Warn people when they initiate a task that can cause data loss that's unexpected and irreversible." `buttons.md › Best practices`: "use a button that has a prominent visual style for the most likely action." The restore route (`shoppingList.js:190-210`) already exists for an Undo | High |

### 4 · Shopping says "live" when it is not, and "Connect a backend" while loading
`valsMisc.js:114`; `Shopping.jsx:65-68`; `App.jsx:377-382`

The header is "N items · live from Obsidian" whenever a list exists, including
the cached copy shown offline (`liveShoppingList` is in `CACHED_LIVE_KEYS`),
and "Connect a backend in Settings" whenever it does not, including a first
sync in flight; the empty copy "Nothing on the list yet" shows in both. Seen:
offline with a cached list, "14 items · live from Obsidian"; connecting, both
false lines together. To-Do and Stash already say "Offline · showing
last-known" and "Loading…" (`valsTodos.js:83-89`, `valsMisc.js:537-543`). In
demo, Shopping alone shows its add box and an enabled "+ Add" that does
nothing (`App.jsx:3962-3966` returns with no connection).

| Before | Why | Severity |
| --- | --- | --- |
| A cached list labelled live; loading labelled "connect a backend" | NOVA-METHOD: "Honest degradation, never fiction… stale data self-labels." `feedback.md`: "Show people when a command can't be carried out and help them understand why." `loading.md`: "Show something as soon as possible" | High |

### 5 · The Todoist line describes the setup, never the outcome
`valsTodos.js:102-106`; `server/lib/todoistSync.js:293-301`; `valsInbox.js:671-681`

The To-Do page reads only `configured` and `linkCount`: "Two-way with Todoist
(9 linked)…" reads the same whether the last pass worked or failed. The server
already sends `lastSyncAt`, `lastResult.error` and `heldBackCount`, and the
Inbox's own Todoist card already words them ("Connected, but the last pass hit
an error: …"). On the page where he reads his to-dos, a failed sync is
invisible. It stayed the same while offline in demo.

| Before | Why | Severity |
| --- | --- | --- |
| A static setup sentence where a sync status belongs | His standing call: a sync that failed says so. `feedback.md › Best practices`: "Consider integrating status feedback into your interface… near the items it describes" | High |

### 6 · Stash: two tap targets to one place, no swipe, notes cut mid-word
`Stash.jsx:59-83`

Each row is a name-and-host link (191×34.5), an "Open ↗" link to the same URL
(77×30) and a × (32×32): three controls, two identical, none at 44. The note
truncates at about half the row ("the 32…") because the pill and × take 150
pt; in the remove confirm the name and host squeeze to 86 pt. Stash is the only
list with no SwipeRow, so his iOS Mail grammar stops here. The 22 Sep finding
#16 half is still open.

| Before | Why | Severity |
| --- | --- | --- |
| Two links per row to one address; 30 to 34.5 pt targets | `buttons.md › Best practices`: "a button needs a hit region of at least 44x44 pt." `lists-and-tables.md › Content`: "Consider ways to preserve readability of text that might otherwise get clipped or truncated" | High |

### 7 · Steppers at 28 pt, the quantity drawn twice, and quick taps lost
`Shopping.jsx:96, 117-125`; `valsMisc.js:41-42`; `App.jsx:4030-4037`

"2 × onions" before the name and "− 2 +" after it: the same number twice on a
row. The − and + are exactly 28×28, 2 pt apart. The quantity is not
optimistic: it waits for the Mac, and `incQty` computes from the rendered
value, so taps inside one round trip send the same number (three quick taps on
+ add one). From source; reproducing it needs a server.

| Before | Why | Severity |
| --- | --- | --- |
| 28 pt steppers twice per row; duplicate number; lost taps | `steppers.md › Best practices`: "Make the value that a stepper affects obvious." `layout.md`: "Make controls easier to use by providing enough space around them" | Medium |

### 8 · Small text that fails both floors
`Shopping.jsx:105, 111`; `Stash.jsx:63`

Shopping's "from <recipe>" and "sorting into an aisle…" are 10.5 px, under
iOS's 11 pt minimum; the provenance's ink at 35% over the glass card is about
2.8:1 (estimated from computed values over the sky's mid tone). Stash's host
line uses `--nv-ink40`, which §2b rule 4 keeps for hairlines and glyphs, at
about 3.1:1. To-Do's faint meta is about 4.4:1 on the summary glass.

| Before | Why | Severity |
| --- | --- | --- |
| 10.5 px text; 2.8:1 and 3.1:1 | `typography.md › Ensuring legibility`: iOS minimum 11 pt. `accessibility.md`: "Up to 17 pts · 4.5:1" | High |

### 9 · Gold is wallpaper on two screens; none owns a hue
`Shopping.jsx:14, 73, 100, 111`; `Stash.jsx:20, 27, 57`; `indexGroups.js:35, 47, 48`

Shopping: gold serif title, 7 gold aisle labels, gold recipe amounts, gold
"sorting". Stash: gold serif title, gold labels on every shelf and on "Add a
link". §2b rule 8: gold is "not yet decided", never a default fill across a
surface. To-Do uses gold rightly, once: the age of a to-do past a fortnight.
The Index gives all three the neutral `--nv-ink40`; inside, ticks fill in the
system cyan.

| Before | Why | Severity |
| --- | --- | --- |
| Gold for titles and labels; no screen hue | `color.md › Best practices`: "Avoid using the same color to mean different things" | Medium |

### 10 · Three heads, three add forms, three row shapes for one job
`Todos.jsx:16-39`; `Shopping.jsx:10-34`; `Stash.jsx:16-47`

Heads: an eyebrow "Nova · To-Do" with a 30 pt title, against tracked-capital
"Vault · …" heads with a 30 pt title and a 27 pt gold serif tail; none is the
34 pt title of the redesigned pages. Add: a one-line field in a pane with a
two-line note (its placeholder cut mid-word at 390); a 60 pt box beside a 60 pt
button whose example lines never show (scrollHeight 140 in a 58 pt box); four
fields under a gold label that push the first link to 502 pt. Every add sits at
the top, out of thumb reach. Nine type sizes across the group in three
families (SF, New York, SF Mono for the quantity).

| Before | Why | Severity |
| --- | --- | --- |
| One job in three grammars | `lists-and-tables.md › Style`: "Choose a table or list style that coordinates with your data and platform." `typography.md`: "Minimize the number of typefaces you use." `designing-for-ios.md`: important controls sit mid-screen or lower (judgment, from Ergonomics) | Medium |

### 11 · The group name repeated on every to-do
`Todos.jsx:91-99`; `App.jsx:5748-5753`

Under a "Work · 3" header each row carries "WORK" again, as a 32 pt text
action that opens a native `<select>` with a hard-coded `#141019` option
background; the change waits for the Mac before it shows. 11 of 11 rows repeat
their header.

| Before | Why | Severity |
| --- | --- | --- |
| A label per row restating its header | `layout.md › Best practices`: "don't obscure it by crowding it with nonessential details" | Low |

### 12 · On the Mac
Measured at 1280: three lists, three widths (cards 780, 962, 820 pt);
Shopping's stepper about 650 pt from its item. Controls are `role="button"`
with `tabindex="0"`, so Tab reaches them, but nothing answers Command-Z
anywhere in the app (grep, `src/`).

| Before | Why | Severity |
| --- | --- | --- |
| No shared measure; no Command-Z | `undo-and-redo.md › Desktop`: "Place undo and redo commands in the Edit menu and support the standard keyboard shortcuts" | Medium |

### Smaller things seen
- 14 visible strings on these screens lean on a dash (placeholders, empty
  copy, the Confirm completion button, the Done header).
- "the compost loop sweeps these" names machinery; the sweep is a weekly
  Inbox proposal he approves (`compost.js:12, 208-220`).
- "Confirm completion" names bookkeeping, not the result (`writing.md`:
  "Be action oriented").
- Two Stash placeholders name a real brand and one of his own categories;
  public code, but worth replacing with neutral examples.
- `todoInputKey` (`valsTodos.js:95`) is dead since the LocalInput change.

---

## 3 · Keep

- **SwipeRow's grammar and safety**: direction lock, edge guard, one open row
  house-wide, interruptible settle (`swipeAction.js`).
- **Clear all's three states**: idle, armed confirm, then a real Undo that
  restores the exact items (`Shopping.jsx:39-63`, `shoppingList.js:173-210`).
- **Optimistic writes** on tick and add, with the words handed back on failure
  (`App.jsx:5721-5778`, `3962-3999`).
- **Age drawn, not badged**: the hairline that deepens from two to six weeks,
  and gold spent only on it (`valsTodos.js:52-66`).
- **Aisles in shop order, recipe amounts on the line**, and the honest
  "sorting into an aisle" while the model guesses (`valsMisc.js:26-55`).
- **Honest empties** on all three; offline labels on To-Do and Stash.
- **Lines identified by their raw text**, so a page edited in Obsidian fails
  honestly instead of changing the wrong line (`server/lib/todos.js:103-121`).

---

## 4 · Directions for the mockup round

All three share one grammar (mockup 78, "The same in all three"): the words at
17 pt; a 44 pt circle that fills in the screen's own hue, strikes the words,
holds a beat with Undo beside it, then folds away with Undo in the island;
swipe right to finish, swipe left to remove (Later on To-Do, since nothing is
deleted from Todoist); one Stash target per row; one quantity pill opening a
44 pt stepper; an Undo on every write; a status line that says when and
whether a sync worked; the 34 pt title and serif news line; one add field
floating at the foot. Proposed hues, none existing today: To-Do `--nv-vi`
(Nova already draws Todoist sync in violet, `Inbox.jsx:672`), Shopping
`--nv-good` (Fuel's green; recipes feed it), Stash `--nv-m-back` (the
Librarian's teal, "files every note where you will find it again"). Gold only
for a to-do waiting on him; `--nv-warn` only for remove.

Counts measured in the mockup at 390 (tappable above the tab bar; first row's
top), against today's 15 / 24 / 17 and 276 / 290 / 502 pt.

**A · One grammar.** Reminders' shape. Removes: the capital-letter heads, the
per-row group label, the "2 ×" duplicate, resting steppers, Stash's second link
and ×, its four-field form and intro, gold labels. Keeps every function.
Moves: adding to the foot, the group change into the row's details sheet,
Clear everything into a ⋯ menu. To-Do 17 tappable (more rows fit, each now
with words; every target 44), first row 247; Shopping 18, 247; Stash 11, 247.

**B · Instruments.** A, plus one living object atop each screen standing in
for the count line: to-dos plotted by age with a gold two-week line and one
do-all ("Move the N waiting to Later"); the basket as a ring of aisle arcs
filling green; the shelves as one bar sized by count. To-Do 14, first row 460;
Shopping 17, 441; Stash 13, 352. The cost is a row's worth of height for the
object.

**C · One screen.** The three become one Lists screen with a three-way switch
carrying each list's count and hue; one add field follows the list, and a
pasted link offers the Stash. Routes kept as deep links. To-Do 18, first row
309; Shopping 19, 309; Stash 13, 309. Removes two heads and two add forms from
the app; on the Mac the three would stand side by side.

(Finding 1 FIXED by the parent on 5 Oct, 1070fe2, with a regression test.)
What the pixels argue for: finding 1 is a one-line fix that should not wait
for a direction. Of the three, A answers every finding with the least new
furniture; B is A plus rule 7 at its fullest; C is a navigation decision
first.

---

## 5 · Method

**Instruments.** A detached worktree of HEAD (97f2205) in the session
scratchpad, `vite --port 5208`, an isolated chrome-devtools context
("lists"), viewport set before navigation (390×844×3 mobile touch, then
1280×800×2). His look set through localStorage in the init script, together
with a guard refusing every non-GET `fetch`, `XMLHttpRequest` and beacon,
re-installed on every reload. Demo mode confirmed ("Demo data" on Home; no
connection in storage). The guard's log stayed empty for the whole session.

**What was shown, and how.** Demo frames of all three screens as they are
(To-Do and Stash empty; Shopping's add box live). Then invented records set
into the App component's state from the console, under four connection states
(`demo`, `connecting`, `offline`, `connected`) to see each screen's own
loading, offline and full labels. With no backend configured in that browser,
no request could reach any server; every write handler returns on no
connection. Interactions observed: a synthetic swipe (reveal and settle), a
tick applied the way the optimistic path applies it (frame-by-frame row count
and animation list), Stash's remove confirm, Shopping's armed and undo
banners. Contrast figures are estimates from computed colours over the sky's
mid tone, marked as such.

**References opened:** `accessibility.md`, `typography.md`, `color.md`,
`layout.md`, `designing-for-ios.md`, `designing-for-macos.md`,
`lists-and-tables.md`, `undo-and-redo.md`, `feedback.md`, `loading.md`,
`steppers.md`, `buttons.md`, `motion.md`, `writing.md`, `entering-data.md`,
`text-fields.md`, `gestures.md`.

**Not seen.** Any of his real lists, counts or ages (demo only; page heights
scale with his real counts, about 64 pt per to-do once words return, 52 pt per
shopping line, 58 pt per link). A real touch swipe in WebKit on his phone. A
real Todoist failure, the lost-tap race on the stepper, and the
optimistic-clear mismatch below, all from source. The `command` and
`cupertino` styles (summary only; the screens have no summary branch, so they
render the cupertino structure). Haptics.

**Also from source, not seen:** Clear all's optimistic frame removes only the
ticked items (`App.jsx:4053-4056`) while the server clears everything
(`shoppingList.js:178-184`), so the unticked lines vanish one round trip later;
the act on screen is not the act performed.
