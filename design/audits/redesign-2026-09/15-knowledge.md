# 15 · Notes, Journal and Galaxy: audit, 5 Oct 2026

Tier 3 of the redesign (`design/REDESIGN-CHECKLIST.md` §5, rows E1 to E5,
J1 to J4, Y1 to Y3), audited as one group because they are the three ways he
meets his own vault: read a page (Notes), write a day (Journal), see how pages
connect (Galaxy). His brief stands over all three: "A lot of Nova has become
cluttered and complicated"; "Simplicity with all functionality and a
beautiful aesthetic, along with ease of use MUST be the goal." Every function
is kept.

Evidence: source read in full for `Notes.jsx` (127 lines), `Journal.jsx`
(119), `Galaxy.jsx` (57), `galaxyLayout.js` (149), `valsNotes.js` (206) and the
Galaxy slice of `valsMisc.js`, plus the App.jsx methods behind every control
(`selectNote`, the review and journal prompt and save paths, the Studio
actions, `buildGalaxy`, `startGalaxy` and the gesture handlers) and
`server/lib/studio.js`. Frames and computed-style sweeps in demo mode at
390×844 (mobile, touch, 3x) and 1280×800 under his look (summary style, Nova
glass, command theme, hologram core), every non-GET request refused. Where demo
shows nothing, invented data was put into the running app's memory (§5).
Read under `apple-hig-review` with eighteen of its references open, cited as
`file.md › Heading`, "judgment" where none applies. The mockups for this round
are `design/mockups/79-redesign-knowledge.html`.

The repo is public: no title, body, entry or prompt of his appears here. Every
example below is a count or a shape.

---

## 1 · Verdict

**Critical issues, around three good objects that do not know about each
other.** Each screen has something worth keeping: the serif reader, the day
rows with one dot per entry, the seeded constellation that lights a star's
neighbourhood. But they are built as three islands. The number that says it:
**of the six doors between the three screens, one exists**, the Galaxy's Open
into Notes. The chips headed "Linked in Galaxy" under every note open other
notes, never the Galaxy; a journal star opens in Notes, not the Journal; the
Daily review's reflection is written in Notes and saved into the Journal with
no way to follow it there; nothing in the Journal leads anywhere.

Inside each island the same over-building shows. One reader carries four
different kinds of extra panel. One composer is built twice, as two
components, in one literal colour, with one copy under Apple's 28 pt floor.
One canvas wears two rows of filters, the first of which is five 15 pt words
that look like a legend and that no keyboard or screen reader can reach, and
its selection card lands on top of the star it describes.

### Clutter numbers, as it stands (checklist §3)

| Test | Notes | Journal | Galaxy | Target |
| --- | --- | --- | --- | --- |
| Focal point | None. A 209 pt window onto the list (it scrolls inside the page) and a note he did not pick (the first is auto-selected, `App.jsx:1761`); the reader's title starts 462 pt down | The composer, which is right; the first day starts 472 pt down | The canvas, but it starts 259 pt down and gets 418 of 844 pt; a selection card covers the tapped star | One, above the fold |
| Objects in view at 390 | 11 (9 tappable): search, 4 kind chips, 3.4 rows, two cards | 4 empty (demo); 18 (12 tappable) with 8 invented days | 9 (8 tappable); 12 (10 tappable) with a star selected | Lower, or a reason |
| Verbs on one object | A note: up to 3 extras plus one chip per link (idea: 3; today's review: 3; source: 1) | A day: 1. The composer: 2 | The selection card: 2 | One primary, one quiet, talk back |
| Type sizes | 7 (11 to 32 px); 9 with the review card open | 7 empty; 8 with days; 10 with a day open | 5 in the page plus 2 on the canvas (10 px labels, 9.5 px HUD); 8 plus 2 with a selection | ≤ 3 |
| Tap floor | 15 controls, 9 under 44 pt (chips 34, Linked chips 29, search 39), 0 under 28. Live-shaped with the review open: 21 controls, 13 under 44, **1 under 28** (the review's Generate, 27 pt) | 15 controls with days, 5 under 44 (Generate and the 4 chips, 34 pt) | 8 controls, 7 under 44, **5 under 28** (the legend, 15 pt); 7 of 8 not focusable | ≥ 28; ≥ 44 primary |
| Gestures | Tap only | Tap only | Pinch, wheel, double-tap reset, tap a star; pan only when zoomed; no momentum; no keyboard | Every capability has a pixel |
| Motion | A note tap runs a 420 ms whole-page View Transition (7 named groups) and the 280/140 ms screen cross-fade; cut under Reduce Motion | A day opens with a 280 ms rise and a 160 ms chevron turn; closing has no exit | The canvas redraws every frame for as long as the screen is open, also under Reduce Motion; the selection card has a 280 ms entrance and no exit; reset and double-tap are instant jumps | Entrance, exit, interruptible, reduced-motion fade |
| States | Loading: "Loading…" as the title and the body, no skeleton. No search results: nothing at all. Offline: "live from Obsidian" on a cached copy. Before the first sync: the demo notes, labelled | Not connected: "Loading your journal" for ever. An empty category: "No journal entries yet", with the filter gone. Offline save: queued (good) | Before the first sync or an empty vault: the demo constellation, labelled DEMO. Offline: no age. Error: none | All four, honestly |
| Width | `scrollWidth` 390 at 390; 1042 = `clientWidth` at 1280 | 390; 1042 | 390; 1042 | 390 |
| Screens deep, 390 | 1.37 (demo); 2.0 live-shaped with the review open | 1.47 with 8 days; about 3.5 at the 30-day window (estimate) | 1.0 | ≤ 4 |
| At 1280 | 1.0: list 300 pt, reader 648 pt | 1.47; the composer is 920 pt wide | 1.0 | Set in the desktop round |
| Idioms | No structural branch (`isAppleStyle` picks one font, `Notes.jsx:82`) | `v.structured` swaps the day card (`Journal.jsx:66`) | None | Both checked |

---

## 2 · Findings, ranked by visible gain on his phone per hour

### 1 · One door of six between the three screens
`Notes.jsx:115-122`, `valsNotes.js:181-189`, `valsMisc.js:453-460`,
`valsLibrary.js:167`

Every note ends with "Linked in Galaxy" and a row of gold chips. In live mode
each chip calls `app.selectNote(l.id)`: it opens the linked note in Notes. In
demo the same chips open a recipe, a workout or a toast. None reaches the
Galaxy, and nothing else on the page does. The Galaxy's Open goes the other
way and works. A journal star is a vault page like any other, so its Open
lands in Notes, not on that day in the Journal. The Daily review's reflect
card writes into the Journal (`App.jsx:4832-4848`, `addJournalEntry` with the
page title) and offers no way to see where it went. The Library's own door,
"See in Galaxy", opens the Galaxy wherever it was (09-library.md finding 8).

| Before | Why | Severity |
| --- | --- | --- |
| A label that names the Galaxy and opens a note; one of six cross-screen doors | `writing.md › Best practices`: "Be action oriented. Active voice and clear labels help people navigate through your app from one step to the next, or from one screen to another." `voiceover.md › Navigation`: "Specify how elements are grouped, ordered, or linked." | High |

### 2 · One composer, built twice, and one copy under the floor
`Notes.jsx:69-113` (82 and 89: `#cbb6f2`), `Journal.jsx:17-48` (20 and 25:
`#cbb6f2`), `App.jsx:4811-4831, 4857-4873, 4832-4848`

"✦ Generate a prompt" exists on two screens as two components: a `Chip`
(34 pt) in the Journal and a hand-built `Interactive` span in the review card
(27 pt, under the 28 pt floor). Both colour themselves with the literal
`#cbb6f2`, and the generated prompt is printed in the same literal. Both call
`api.startJournalPrompt`, and both saves land in the Journal. In demo, or on
any device with no connection, both "Generate a prompt" and "Save entry"
return before doing anything (`App.jsx:4858-4859, 4876-4877`): measured,
no busy state, no message, no request.

| Before | Why | Severity |
| --- | --- | --- |
| A 27 pt control in the review card | `accessibility.md › Mobility`: "Offer sufficiently sized controls." The table: iOS 44x44 pt default, 28x28 pt minimum. | Critical |
| One feature as two components and one untokened colour | NOVA-METHOD §2b rule 4 (tokens only) and rule 2 (house objects). `generative-ai.md › Transparency`: "Communicate where your app uses AI." The prompt is Nova speaking, and his words already have a token, `--nv-nova`. | High |
| Two buttons that do nothing and say nothing when unconnected | `feedback.md › Best practices`: "Show people when a command can't be carried out and help them understand why." | Medium |

### 3 · The Journal's filter hides itself and then says there is nothing
`Journal.jsx:50-64`, `valsNotes.js:69-96`, `App.jsx:731`

The four category chips live inside the branch that renders only when there
are days to show. Choose a category with no entries in the 30-day window and
`journalDays` is empty, so the page takes the other branch: it says "No
journal entries yet" (false: there are eight days) and the chips are gone, so
there is no way back to All on the page. Reproduced with eight invented days.
The filter is app state, so the dead end survived leaving the screen and coming
back; only a reload clears it. The copy written for this case, "Nothing in
this category yet." (`Journal.jsx:62-64`), sits inside the branch that cannot
be reached when the list is empty: it can never render.

| Before | Why | Severity |
| --- | --- | --- |
| An untrue empty state with the only way out removed | NOVA-METHOD non-negotiable: "Honest degradation, never fiction." `writing.md › Best practices`: "Provide clear next steps on any blank screens." | High |

### 4 · The selection card covers the star it describes
`Galaxy.jsx:43-53`

The card is absolutely placed at `right:16px; bottom:16px`, 270 pt wide,
wherever the star is. Measured: a star tapped at y 532 sat under a card
spanning 515 to 661, its lit links running into the card's edge. It fades up
from below, unrelated to where the finger was, and leaves with no exit. Its
Dismiss is a `<span>` with `onClick`: 37 pt, not focusable. Its border is gold.

| Before | Why | Severity |
| --- | --- | --- |
| A detail that hides its own subject and arrives from nowhere | `motion.md › Providing feedback`: "Strive for realistic feedback motion that follows people's gestures and expectations." `layout.md › Best practices`: "Make essential information easy to find by giving it sufficient space." | High |

### 5 · On the phone, the note being read is not the focal object
`valsChrome.js:172-173`, `App.jsx:1761, 1881`, `Notes.jsx:15-49`

The desktop split view (300 pt list, reader beside it) stacks on the phone into
a list card capped at 320 pt, whose rows scroll inside it: 209 pt of window for
383 pt of six demo rows, so 3.4 rows show; with a real vault the window stays
209 pt. Under it, the reader shows the first note, auto-selected on load, so
the screen's largest object is a page he did not choose; its serif title
starts 462 pt down. Tapping a row repaints that reader below the window with a
420 ms whole-page View Transition. Search that finds nothing shows no copy at
all and leaves the old note in the reader.

| Before | Why | Severity |
| --- | --- | --- |
| A nested scroll window and an unchosen note | `scroll-views.md › Best practices`: "Avoid putting a scroll view inside another scroll view with the same orientation." `split-views.md › Phone (iOS)`: "In a compact environment, such as iPhone in portrait orientation, it's difficult to display multiple panes without wrapping or truncating the content, making it less legible and harder to interact with." | High |

### 6 · Four kinds of extra in one reader
`Notes.jsx:53-62, 69-113, 115-122`

The checklist's first look said two patterns; the code has four, each with its
own grammar: Watch source is an outlined cyan link-button (30 pt) that leaves
the app with no sign of it; the Studio row is three chips in three colours
(violet, gold, cyan) right under the meta; the review card is a violet bordered
box after the body; the links are gold chips with a `⟡` glyph at the foot.
Idea notes and review pages never coincide, so he meets a different grammar on
almost every kind of page.

| Before | Why | Severity |
| --- | --- | --- |
| Four extra patterns, three placements, five colours | `layout.md › Best practices`: "Group related items to help people find the information they want." `color.md › Best practices`: "Avoid using the same color to mean different things." | Medium |

### 7 · The Galaxy's filters are out of reach, and its text is under the minimum
`Galaxy.jsx:17-34, 36-38`; `App.jsx:6898, 6917`

The five kind filters are `<span onClick>` elements: no role, no focus, 15 pt
tall, with only a `title` tooltip (invisible on touch) to say what they do, and
drawn like a passive legend (a dot and a word). Directly under them, two
chip-shaped controls (Recency, Compost) do a different job: they change how
stars are lit, not which. Filtering inserts "Clear filter" on its own line and
pushes the canvas down about 45 pt. The canvas itself is `cursor:crosshair`
with no label: VoiceOver gets nothing. Star labels are drawn at 10 px and the
HUD at 9.5 px, both in a monospace face the summary style does not load.

| Before | Why | Severity |
| --- | --- | --- |
| 5 of 8 controls at 15 pt, 7 of 8 not focusable, an unlabelled canvas | `accessibility.md › Mobility` (44 / 28 pt). `voiceover.md › Descriptions`: "Make charts and other infographics fully accessible." | Critical |
| Canvas text at 10 and 9.5 pt | `typography.md › Ensuring legibility`: iOS minimum 11 pt. | Critical |
| Two control rows with different meanings, one not looking like a control | `layout.md › Visual hierarchy`: "Make controls easier to use by providing enough space around them and grouping them in logical sections." | Medium |

### 8 · The Studio stage writes on every tap, wraps, and cannot be undone
`Notes.jsx:58`, `App.jsx:5472-5481`, `server/lib/studio.js:40-52`

The chip shows the stage and is also the action: each tap advances
seed, outlining, scripting, shipped, and from shipped the modulo sends the
idea back to seed. Each tap rewrites the page's frontmatter (a backup file is
taken, no inbox record, no `undoData`, no Undo in the UI). Correcting one
mis-tap costs three more writes. The pipeline itself is named only in a
`title` tooltip.

| Before | Why | Severity |
| --- | --- | --- |
| A one-way write behind a 34 pt status chip, no Undo | NOVA-METHOD non-negotiable: "Everything writeable is undoable and rides the inbox rails." `undo-and-redo.md › Best practices`: "Help people predict the results of undo and redo as much as possible." | High |

### 9 · States that are not true
`Journal.jsx:50-53`, `valsNotes.js:142, 161-180, 192, 204`,
`valsMisc.js:62-66`, `App.jsx:6762-6795`

- **"Loading your journal" for ever.** With no connection,
  `liveJournalEntries` never arrives, so the body says it is loading while the
  header on the same screen says "Connect a backend in Settings". Seen.
- **"live from Obsidian" on a cached copy.** Notes and the Journal both label
  themselves live whenever `liveNotes` exists, and it is restored from the
  cache at boot. Read from source; the Library audit found the same label.
- **Demo content outside demo mode.** Before the first sync, or with an empty
  graph, Notes lists the demo notes and the Galaxy draws the demo
  constellation for a connected user, labelled demo. Read from source.
- **The demo Galaxy says 385 stars and 1,227 links while drawing 12 and 14.**
  Seen; demo only.
- **No skeletons**: the reader's loading state is the word "Loading…" as its
  title and its body; a search with no results says nothing.

| Before | Why | Severity |
| --- | --- | --- |
| A permanent loading line and "live" on a copy | NOVA-METHOD non-negotiable: "Honest degradation, never fiction"; "demo content is demoMode-only." `loading.md › Best practices`: "Show something as soon as possible." | High |

### 10 · The map never stops drawing, and its layout stalls a frame
`App.jsx:6797-6935` (loop), `6824` (motes), `6877` (shadowBlur), `1790, 1926`
(`gNodes = null`), `galaxyLayout.js:33-99`

The loop runs every frame while the screen is open: 130 twinkling motes, a few
pixels of wobble on every star, `shadowBlur` 14 on every star that is not
faint. Measured on the 12-star demo graph: 544 canvas calls a frame. With an
invented graph of the size its own label claims (400 stars, 1,227 links):
7,702 calls a frame at rest, 1.0 ms of script per frame at 1x; at 4x CPU,
4.4 ms at rest and 5.2 ms while panning, frame intervals p95 25 ms at rest and
33 ms panning. The force layout (all pairs, 220 ticks) runs inside the first
animation frame: 90 ms at 1x, **418 ms at 4x**. Every graph sync sets
`gNodes = null`, so it runs again on the next frame the Galaxy is open, whether
or not the graph changed. Nothing in the loop checks Reduce Motion; the motes
twinkle with periods of 2 to 6 s. Raster cost (the blur) is not in these
script numbers.

| Before | Why | Severity |
| --- | --- | --- |
| Constant redraw, also under Reduce Motion; a 418 ms stall at 4x | `accessibility.md › Cognitive`: "When this setting is active, ensure your app or game responds by reducing automatic and repetitive animations, including zooming, scaling, and peripheral motion." `motion.md › Best practices`: "Add motion purposefully, supporting the experience without overshadowing it." | High |

### 11 · Colour says too many things
`valsNotes.js:32`, `Notes.jsx:24, 59, 119`, `Journal.jsx:15`,
`Galaxy.jsx:15, 44`, `valsMisc.js:79-80, 451`, `vals/shared.js:6`,
`indexGroups.js:44-49`, `valsInbox.js:61`

Gold is "not yet decided" (§2b rule 8). Here it marks the open note, the
search focus, Draft outline, the link chips, the title word on two screens
("down.", "connected."), the selection card's border, the Galaxy's default
selection colour and the demo recipes: nine jobs, none a decision. The page
kinds are literal hex near-copies of house colours that mean something else:
concepts `#d8b573` beside gold, entities `#e08f6f` beside the error coral
`#e08383` (with the Compost overlay on, a candidate and an entity are the same
hue at different brightness), journal pages `#5aa87c` near "done" green. The
Journal itself is three colours depending on where you look: neutral on its
Index tile, violet in its composer and both Inbox badges, green as a star. The
demo legend adds another literal, `#5aa87c` (`valsMisc.js:80`).

| Before | Why | Severity |
| --- | --- | --- |
| Gold for nine things; kind colours that borrow meanings | `color.md › Best practices`: "Avoid using the same color to mean different things." `color.md › Inclusive color`: "Avoid relying solely on color to differentiate between objects, indicate interactivity, or communicate essential information." | Medium |

### 12 · Old heads, three names, too many sizes
`Notes.jsx:12`, `Journal.jsx:12-15`, `Galaxy.jsx:11-15`, `valsChrome.js:203`,
`indexGroups.js:12-13`

Under summary, the redesigned pages open on a 34 pt title. These three open on
the old tracked-caps eyebrow ("Vault · Notes"), Notes with no title at all, the
other two with a 30 pt title whose last word is gold italic serif. The Galaxy
is "Self" in its own head, "Workspace" in the Mac sidebar and "Life" in the
Index; Notes and the Journal are "Vault", "Vault · Obsidian" and "Mind". Type
sizes run 7 to 10 a screen against a target of 3.

| Before | Why | Severity |
| --- | --- | --- |
| Three names for one place; 7 to 10 sizes | `voiceover.md › Navigation`: "Use titles and headings to help people navigate your information hierarchy." `writing.md › Best practices`: "Build language patterns." `typography.md › Conveying hierarchy`: "Adjust font weight, size, and color as needed to emphasize important information and help people visualize hierarchy." | Medium |

### 13 · The Mac
1280×800 frames

Notes is a sound split view at 1280 (list 300 pt, reader 648 pt, the rail
fading at its edge). The Journal's composer stretches to 920 pt, and each day
row puts its preview about 900 pt from its date. The Galaxy fills the window
well, though its hint still says "pinch".

| Before | Why | Severity |
| --- | --- | --- |
| A 920 pt writing field; previews far from their dates | `designing-for-macos.md › Best practices`: "maintaining a comfortable information density that doesn't make people strain to view the content they want." | Low (desktop round) |

### Smaller things seen
- Live dates are ISO in the Notes rows and the reader's meta (`valsNotes.js:18,
  164`), where the Journal fixed the same thing on 23 Sep.
- A concept reflection's heading renders with two dashes, one from the JSX
  prefix and one from the relabel (`Journal.jsx:106`, `valsNotes.js:66`), and
  wraps onto its own line under the tag.
- The live stats label prints "1227" without a separator; the demo one prints
  "1,227".
- The demo legend has no entry for the demo's one idea star, and its dot
  colours differ from the stars they filter (`valsMisc.js:78-80` against
  `App.jsx:6787`).
- Recency in demo dims every star (no demo page has a date), so the overlay
  shows nothing.
- The Journal's expanded day has no exit, and a saved entry does not act out
  its arrival: the composer clears and the list refreshes.
- The Studio and review extras, Watch source, and the live labels are only
  visible with live-shaped data; demo shows none of them.

---

## 3 · Keep

- **The serif reader**: a 32 pt New York title over 14.5 pt body at a 640 pt
  measure (`Notes.jsx:49-67`) is the most book-like object in Nova.
- **The kinds rail** with each kind's colour and count (23 Sep, finding 11),
  and the intent prefetch on pointerdown with single-flight
  (`valsNotes.js:24-30`, `App.jsx:4693-4710`).
- **The day row's shape**: a spoken date in the serif, today larger and
  accented, one dot per entry so a month's rhythm shows (23 Sep, finding 14),
  44 pt rows, `aria-expanded` and an entry count in `aria-label`.
- **The honest save path**: optimistic clear, a real rejection restores his
  words with the reason inline, an offline save goes to the outbox
  (`App.jsx:4874-4899`).
- **The Galaxy's layout and its selection**: a seeded force layout tested from
  node, stars sized by links, a pinch that keeps the star under the fingers,
  hairlines that stay hairlines at any zoom, and a selection that lights its
  neighbourhood (`galaxyLayout.js`, `App.jsx:6829-6865`). The overlays'
  refusal to offer a review-due light with no data behind it
  (`valsMisc.js:83-86`).
- **Width**: `scrollWidth` equals the viewport on all three screens at 390
  and 1280.

---

## 4 · Directions for the mockups

All three share the fixes in §2 that are not about shape: six doors, each
wearing the colour of the screen it opens; one composer for everything he
writes (the review's reflection becomes a door into the Journal's composer)
with one 44 pt "Ask me a question" and Nova's question in `--nv-nova`; the
Studio stage set either way with Undo; a filter that stays; a map that rests
when nothing moves and lays itself out once, off the frame; honest states;
type at 34 · 22 · 17 · 13 with map labels at 13. Counts are objects in view at
390 on the screen's first view, measured in the mockup.

**Colour, one per screen.** Notes has none today (neutral Index tile; it
borrows gold); proposed `--nv-cy`, the summary style's link and button colour,
because Notes is the screen made of links. The Journal's own code wears
`--nv-vi` (composer, personal tag, both Inbox badges, the Daily review that
saves into it) while its Index tile is neutral; kept violet. The Galaxy is
`--nv-vi` on the Index and in its field; proposed `--nv-nova` starlight, so
violet does not mean two screens in one group and, inside the map, a topic
page. The kinds stay as data with a glyph each.

**A · The page.** Each screen is one object.
- Notes: removes the 209 pt window, the auto-picked note and the four extra
  grammars; the list is its own page (11 to 13 objects, but 7 rows in view
  instead of 3.4) and a page opens from its row (4 objects: back, the page,
  two companions). ONE pattern: companion capsules under the title (Play for a
  source, the stage for an idea, Reflect on the review, In your Galaxy on
  every page), each opening a sheet from itself.
- Journal: 18 to 12. Each day is a 24-hour track with a tick per entry;
  opening a day drops each tick into its entry; the filter is one button by
  the title.
- Galaxy: 9 to 3. The map is the page; kinds and light become one Show sheet;
  a tapped star's card rises from it and points at it; Open grows the page out
  of the star; In your Galaxy folds a page back into its star and draws its
  links.

**B · The map.** Apple Maps' shape.
- Notes and the Galaxy become one screen: the map with a sheet (search, the
  kinds, the list). 11 + 9 to 7 with the sheet low; 4 reading a page, which is
  a place card with ONE row of action buttons. The page rises from its star on
  a tether; lowering the sheet reveals the star already centred.
- Journal: five weeks of days as stars sized by entries, the composer in the
  sheet. 18 to 40, of which 35 are the days themselves (each a 44 pt target):
  more objects, fewer kinds of object, and a month visible at once.

**C · Three rooms.** The Index family he chose on 26 Sep.
- Notes: 11 to 10. Grouped rows with a kind tile, search at the foot, a header
  card on each page; ONE grouped card, "This page", whose rows drill down
  (the stage becomes a choice list with a moving check and Undo). 5 objects on
  a page.
- Journal: 18 to 9. Today's card holds the composer and today's entries; the
  week as rows with a small track each; a day drills down.
- Galaxy: 9 to 5. The map as a Health-style card with a stem callout above the
  tapped star, Show as two rows; the star morphs into the page's tile.

**What the pixels argue for.** The Critical items (findings 2 and 7) and the
dead end (3) are fixes in any direction. A is the smallest structural change
with the clearest single object per screen; B gives the Galaxy a daily job, at
the cost of a new shape for Notes; C is the most familiar and keeps the most
of today's structure.

---

## 5 · Method

**Frames.** Demo mode only, in an isolated browser context (`knowledge`)
against a Vite server on port 5209 run from a detached worktree of HEAD
(`97f2205`) outside the repo, with `novaos.style` summary, `novaos.theme`
command, `novaos.material` glass and `novaos.core` hologram set before load and
a script that refused every non-GET fetch, XHR and beacon, re-armed on every
reload. "Demo data" and `connectionStatus: 'demo'` were confirmed on Notes
first. The guard's log stayed empty throughout: zero writes attempted, and no
model request was possible (both prompt paths return before any request with
no connection, which was itself a finding). At 390×844 (mobile, touch, 3x):
Notes at the top and at the reader's foot, after a second note was tapped, with
a filter, with an empty search; the Journal empty, with days, with a day open,
and on an empty category, then after leaving and returning; the Galaxy at rest,
with a star selected, with a filter and Recency, and with a 400-star graph.
At 1280×800: all three. Stills stayed out of the repo.

**The instrument, said plainly.** Demo shows no journal days, no live note
extras and only a 12-star graph. Through the dev hook `window.__novaApp`,
invented data was set into the running app's memory: eight days of plainly
invented entries; six invented notes (a source with a URL, an idea, one
concept so it became the day's review page, and three others) with their
details and an invented summary; and a seeded random graph of 400 pages and
1,227 links, the size the demo label claims, used only for the frame-cost
numbers (a random graph heaps where his would cluster, so its look was not
judged). Nothing was written anywhere. With the notes injected, the headers
read "live from Obsidian" inside a demo app, an artefact of the instrument and
the same label as finding 9.

**Sweeps.** Distinct computed font sizes over visible text nodes of the
screen root; controls as `button`, `input`, `textarea`, `a[href]`,
`[role=button|tab|switch]` and any element with a React `onClick` or
`onPointerDown` (which is how the Galaxy's legend spans were found), measured
by their smaller dimension and their `tabIndex`; cards as rounded boxes with a
fill, border or blur; visibility clipped by scrolling ancestors; `scrollWidth`
of the document, `main` and the root; scroll height of `main`. Frame cost by
wrapping `requestAnimationFrame` and the 2D context's drawing calls, attributed
per canvas, for 3 s at rest and 2.5 s of synthetic one-finger pan at 2.5x
zoom, at 1x and 4x CPU throttling.

**References opened** (`apple-hig-review`): `accessibility.md`, `layout.md`,
`typography.md`, `color.md`, `designing-for-ios.md`, `designing-for-macos.md`,
`scroll-views.md`, `lists-and-tables.md`, `split-views.md`,
`undo-and-redo.md`, `loading.md`, `feedback.md`, `writing.md`, `motion.md`,
`gestures.md`, `charting-data.md`, `voiceover.md`, `generative-ai.md`,
`entering-data.md`, `text-views.md`.

**What was not seen.**
- His real vault, by instruction: real note lengths, kinds and counts, real
  journal days and categories (whether any category is empty in his 30-day
  window, which is what springs finding 3), and his real graph's shape.
- His phone: frame times are Chrome's on a Mac with CPU throttling, script
  only; the canvas's raster cost and WebKit's behaviour were not measured.
- The live paths of Watch source, the Studio actions, Generate a prompt and
  Save, beyond confirming they send nothing with no connection; offline with a
  cache; a note-detail error; the first-sync demo fallbacks (all read from
  source, with lines cited).
- Reduce Motion: this browser tool cannot set it; behaviour read from source
  (`App.jsx:1078-1080`, `index.css:2594-2595`, and the loop's lack of a check).
- Real touch: synthetic pointer events; pinch was read from source.
- The `cupertino` idiom (summary was the brief; the screens differ only in the
  Journal's day card).

**Inventory and checklist first-look notes, confirmed or corrected:**
- "Two different 'extra panel on a note' patterns share one reader" (E5,
  inventory D): **corrected** to four (finding 6).
- "Galaxy stacks two similar chip rows that mean different things" (Y1):
  **confirmed in meaning, corrected in look**: the first row is not chips but
  a legend of 15 pt spans that does not look tappable (finding 7).
- "✦ Generate a prompt appears on two screens": **confirmed**, and more: two
  components, one under 28 pt, one literal colour in four places, one
  endpoint, one destination (finding 2).
- The literal hex in the Journal (J1): **confirmed**, and also in Notes twice
  and in the demo legend.
- "Linked in Galaxy" chips (E3, inventory F10): **corrected** in meaning:
  they open other notes, never the Galaxy (finding 1).
- "Nothing in this category yet" (J2): **corrected**: unreachable, and the
  state it was written for shows a false empty and hides the filter
  (finding 3).
- The Galaxy's "zero per-frame cost" (`galaxyLayout.js:7`, inventory D):
  **corrected**: the layout is computed once per graph load, but the render
  loop draws every frame (finding 10).
- File lengths: Notes.jsx is 127 lines and Journal.jsx 119 at HEAD, not the
  checklist's 123 and 115.
