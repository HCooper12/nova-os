# 09 · Library: audit, 5 Oct 2026

The ninth page of the redesign (`design/REDESIGN-CHECKLIST.md` §5, rows L1 to
L9). The checklist's first look called the 3D shelf "a strength" and said the
redesign question is "the frame around it, not the shelf". Judged against the
bar he set on 17 Sep with the Stripe Press reel ("the minimum level of quality
that must be achieved moving forward", `design/LIBRARY-PLAN.md`) and his three
answers that day, which bind this page: every source is a Nova edition with its
poster set in as a plate, the 3D shelf replaces the old spines, and the open is
the free three-axis tumble.

Evidence: source read in full for `Library.jsx` (651 lines), `valsLibrary.js`
(197) and `useLibraryTint.js` (77), and in the parts of `Shelf3D.jsx` (1,468)
that own input, the open, reduced motion, pixel ratio and the mount; the
server side of what a source page holds (`watcher.js`, `sourceShelf.js`,
`library.js`). Sixteen frames (fourteen distinct views) in demo mode at 390×844 (mobile, touch, 3x) and
1280×800, under his look (summary style, Nova glass, command theme, hologram
core) with every non-GET request refused; computed-style sweeps of the
Library root in five states. Read under `apple-hig-review` with twelve of its
references open (listed in §5), cited as `file.md › Heading`, and "judgment"
where none applies. The mockups for this round are
`design/mockups/74-redesign-library.html`.

Demo mode has no library at all: with no connection `liveLibrary` stays null.
To see a shelf, 25 obviously invented sources (21 videos, 3 articles, 1 book,
the shape of his shelf as the 21 Sep still `p5-11-shelf-rest.jpg` showed it)
were put into the page's in-memory state. Nothing was written anywhere; §5 has
the method and its limits.

---

## 1 · Verdict

**Critical issues, all three of them accessibility, around the best-made
object in Nova.** The bound volume, the tumble with its exact endpoints, the
contrast-checked tint and the render-on-demand shelf are real craft and stay.
The frame around them is the work: eight pills in three rows before the first
source; a second view (Covers) that draws the same source as a different
object; a detail that opens on metadata and four rows of 26 pt chips and puts
what Nova made of the source at the bottom; a Back that leaves the Library with
the book still open; and labels that are not true (a cached shelf called live,
an empty state promising a removed feature, a Galaxy door that forgets the
source).

The number that says it: **Nova's own reading of a source starts 1,399 px
down the page you open it on, 1.66 screens below the top** (shelf door; 1,218
px from Covers), under three action pills, four chip rows and a related rail.
The one sentence Nova writes about every video it watches, its verdict
(`server/lib/watcher.js:244`, "the watch-it-or-skip-it call"), is never shown
as itself anywhere in the Library, although `/api/library` already sends each
item's first paragraph (`server/lib/library.js:104`) and the client ignores it.

### Clutter numbers, as it stands (checklist §3)

| Test | Library today (390, summary · Nova glass, 25 demo sources) | Target |
| --- | --- | --- |
| Focal point | Covers: none. Eight controls in three rows fill the top, the first source starts 236 pt down. Shelf: the centred volume, 1 of 25, named only inside its texture | One, above the fold |
| Object count | Covers 17 (12 tappable); Shelf 11 (9 tappable) | Lower than today, or a reason |
| Verbs per card | A cover: 1 (the whole card opens it, right). The detail: 21 tappable at 6 concepts (3 action pills, 14 chips, 3 related cards, Back) | One primary, one quiet alternative, talk back |
| Type sizes | Covers 10 (9.5, 11, 11.5, 12, 12.5, 13, 13.5, 14.5, 15, 16 px) in three families (SF, New York, SF Mono in the search field); detail 9 (11 to 30 px) | ≤ 3 |
| Tap floor | Covers: 8 of 33 under 44 pt, none under 28. Detail: 17 of 21 under 44 pt, **14 under the 28 pt floor** (the chips are 26 pt) | ≥ 28; ≥ 44 primary |
| Gestures | Drag the shelf (edge-guarded), wheel, arrow keys. A tap on a side volume only centres it; a second tap opens. No back swipe from a source: Back leaves the Library | Every capability has a pixel |
| Motion | Entrance yes (`shelfIn`, 45 ms steps, capped at 700 ms). 3D open 1.15 s and close 0.8 s, interruptible. The flat detail leaves on a view-transition cut. Reduced motion: everything instant, no cross-fade | All four |
| States | Loading: blank, no skeleton, and "Connect a backend in Settings" while a first sync is in flight. Empty: copy promises a flow removed on 5 Sep. Offline: a cached shelf labelled "live from Obsidian", every detail open fails. Error: gold text | All four, honestly |
| Width | `scrollWidth` 390 at 390 in every state; 1042 = `clientWidth` at 1280 | 390 |
| Idioms | No idiom branch. Under summary the head stays the old tracked caps ("THE LIBRARY"), not the 34 pt title of the redesigned pages | Both checked |
| Screens deep, 390 | Covers 4.7 (3,977 px), Shelf 1.0, detail 2.13 (Covers door) or 2.34 (shelf door) | ≤ 4 |
| Screens deep, 1280 | Covers 2.16, open book 1.73; Nova's reading at 919 px under an 800 px fold | Set in the desktop round |

---

## 2 · Findings, ranked by visible gain on his phone per hour

### 1 · What Nova made of the source is the last thing on the page
`Library.jsx:367-430` (`DetailText`, then `DetailExtras` with "What Nova holds"
at `:419-427`); measured in both doors

The detail reads top to bottom: the title, the author, a READ or RESEARCHED
badge, the updated date, "echoed by N pages", the provenance note
(`:370-379`); then three stacked pills, Open source, Original and See in
Galaxy (`:380-388`); then Concepts, People & works, Topics and Also linked as
four chip rows (`:390-393`); then "Connected in your second brain"
(`:401-417`); and only then the box that holds Nova's woven page (`:419-427`).
Measured at 390: the box starts at 1,218 px from the Covers door and 1,399 px
from the shelf door, against an 844 px screen. The Watcher's verdict, the
single sentence a source page is built around (`sourceShelf.js:34-41` calls it
"the single most useful sentence in the file"), is not lifted out at all: it
sits inside the markdown body as a bold "Verdict:" line, at the bottom.

| Before | Why | Severity |
| --- | --- | --- |
| The page leads with badges, dates, three pills and up to 21 chips; the reading starts 1.4 to 1.7 screens down; the verdict is never shown as itself | `layout.md › Best practices`: "People want to view the most important information right away, so don't obscure it by crowding it with nonessential details." `layout.md › Visual hierarchy`: "it generally works well to place the most important items near the top." | High |

### 2 · Eight controls in three rows before the first source
`Library.jsx:105-142` (`ChipsRow`), `:637-648` (the head)

Four kind chips (`:108-110`), a search field (`:113-115`), "＋ Add source"
(`:121`) and the Covers or Shelf toggle with raw ▦ ▥ glyphs (`:123-139`) wrap
into three rows at 390, under a head that is still the Command idiom's tracked
caps. At 390 the first cover starts 236 pt down: 28% of the screen is
controls. The toggle is the one control on the page drawn with text glyphs
instead of the house icon set. Under summary the redesigned pages open on a
34 pt title; this one opens on "THE LIBRARY" in 12.5 px caps, so the page looks
like a different app from Home, Inbox, Train and Fuel.

| Before | Why | Severity |
| --- | --- | --- |
| 8 controls in 3 rows, 236 pt before the first source; the old head under summary | `designing-for-ios.md › Best practices`: "Help people concentrate on primary tasks and content by limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." | High |

### 3 · Fourteen of the detail's 21 controls are under the 28 pt floor
`Library.jsx:52-68` (`ChipRow`: 11.5 px type, 5 px by 11 px padding)

Every concept, person, topic and link chip measures 26 pt tall. At 6 concepts
that is 14 controls under Apple's minimum on one screen; his real sources run
to 10 or more concepts each (the 21 Sep still shows "CONCEPTS · 10"), so the
real count is higher. The three action pills are 34 pt (above the floor, under
the default). Back is 44 pt.

| Before | Why | Severity |
| --- | --- | --- |
| 26 pt chips, 14 of 21 detail controls under 28 pt | `accessibility.md › Mobility`: "Offer sufficiently sized controls." iOS: "44x44 pt" default, "28x28 pt" minimum. | Critical |

### 4 · Text at 9.5 px
`Library.jsx:48` (`ProvenanceBadge`, `fontSize: '9.5px'` in the grid)

READ and RESEARCHED under every cover render at 9.5 px, in caps. That is
under the iOS minimum on every card of the grid, 25 times on a 25-source
shelf. In 9 of 25 cards the badge also pushes the idea and echo counts onto a
second line ("6 / ideas · 3 / echoes", measured), so the grid's rows end
ragged.

| Before | Why | Severity |
| --- | --- | --- |
| 9.5 px caps under every cover | `typography.md › Ensuring legibility`: "Follow the recommended default and minimum text sizes for each platform." iOS: "17 pt" default, "11 pt" minimum. | Critical |

### 5 · VoiceOver meets an empty list
`src/shelf3d/Shelf3D.jsx:1463` (`role="listbox"`), `:302-307` (pixel ratio)

The 3D shelf is announced as "The shelf, list box" and contains no options:
measured, 0 elements with `role="option"` and no text inside it. A volume's
title, channel and kind exist only as pixels in a canvas texture, so a screen
reader cannot name, choose or open any source from the Shelf view (the arrow
keys and Enter work for a keyboard, `:1269-1275`, but nothing tells the
listener what is in front). The same choice softens the type for everyone: the
renderer runs at 1.25x on a phone (a measured frame-time trade, `:302-307`), so
on his 3x screen the serif title on the hero object displays at about 42% of
native resolution; the frames show it soft.

| Before | Why | Severity |
| --- | --- | --- |
| A listbox with no options; a source's name only in a texture | `voiceover.md › Descriptions`: "Provide alternative labels for all key interface elements... Add labels to any custom elements your app defines." `voiceover.md › Descriptions`: "If people can interact with the infographic to get more or different information, make these interactions available to people using VoiceOver, too." | Critical |

### 6 · Back leaves the Library and the book stays open
`App.jsx:4654-4660` (`openLibraryItem` and `closeLibraryItem` set state only)

Opening a source pushes no history entry. Measured: with a source open,
`history.back()` (what his edge swipe does in the installed PWA) went to Home,
and `libraryOpenId` stayed set. Coming back to the Library then showed that
source still open, and in the flat detail (the full-bleed poster), because the
door he came through is forgotten on remount (`Library.jsx:589, 604`). The
Recipe page, the Coach sheet and the full-screen Nova already ride their own
history entries (`App.jsx:3495-3660`), so the pattern exists.

| Before | Why | Severity |
| --- | --- | --- |
| Back from a source leaves the screen; the source stays open behind it | `designing-for-ios.md › Best practices`: "it's especially important let people swipe to navigate back." `gestures.md › Custom gestures`: "people expect to find a Back button in a top toolbar that lets them return to the previous view with a single tap." | High |

### 7 · One source, four drawings
`Library.jsx:238-264` (grid), `Shelf3D.jsx` (the volume), `Library.jsx:450-452`
(flat detail), `valsLibrary.js:158` (related rail)

The same source is a plate set into cloth in the grid, a bound 3D volume on
the shelf, a full-bleed 16:10 poster cropped with `object-fit: cover` in the
flat detail, and a hash gradient in the related rail (`coverStyleFor(r.title,
'book')`). Measured with demo editions: a source whose cloth is oxblood in the
grid and on the shelf came up purple in the rail. The memory file records this
exact trap as fixed on 17 Sep ("never derive a colour twice"); the rail still
derives it a second way. It also breaks decision X8: from Covers, the object
you tap is not the object that opens.

| Before | Why | Severity |
| --- | --- | --- |
| Four renderings and two palettes for one source, depending on the door | `color.md › Best practices`: "Avoid using the same color to mean different things. Use color consistently throughout your interface." Checklist §4, X8 (oriented transitions, grid to detail). | High |

### 8 · Labels that are not true
`valsLibrary.js:178-180, 187-189, 141, 167`; `App.jsx:376-377, 750-755`;
`IngestModal.jsx:10, 16, 41`

- **"live from Obsidian" on a cached copy.** `liveLibrary` is restored from
  the cache at boot (`App.jsx:376-377, 750-755`) and the label only checks
  that it exists, so with his Mac asleep the Library says "25 sources · live
  from Obsidian" while the chrome on the same screen says "LAST-KNOWN DATA ·
  SAVED 18:20" (`valsChrome.js:118-121`). Details are not cached, so every
  open then fails with "Couldn't load this source".
- **"Connect a backend in Settings" while connecting.** A first sync with no
  cache shows the not-connected label until the fetch lands (`:180`).
- **The empty state promises a removed feature.** "Press ＋ ADD SOURCE above to
  research a book by title and author" (`:188`); the title and author fields
  left the Add sheet on 5 Sep (`IngestModal.jsx:41`), and book research is now
  a sentence to Nova.
- **"✦ See in Galaxy" forgets the source.** It calls `app.navigate('galaxy')`
  with nothing in focus (`:167`).
- **A video "woven from the book's own text".** The READ note says "book" for
  every kind (`:141`).
- **One action, four names:** "＋ Add source" (the button), "Add to your
  vault" (the sheet's title, `IngestModal.jsx:16`), "Ingest a transcript" (its
  accessible name, `:10`), "⇪ Add to vault" (the researched note, `:140`).

| Before | Why | Severity |
| --- | --- | --- |
| A stale copy called live; a promise of a removed flow; a door that drops its subject; one action under four names | NOVA-METHOD non-negotiable: "Honest degradation, never fiction... stale data self-labels." `writing.md › Best practices`: "use consistent language throughout processes with multiple steps." `generative-ai.md › Transparency`: "Set clear expectations about what your AI-powered feature can and can't do." | High |

### 9 · Finding one source means passing all the others
`Shelf3D.jsx:1238-1241` (tap), `Library.jsx:569` (hint)

At 390 the shelf shows one volume and a third of the next. Reaching the 25th
source is up to 24 drags; search helps, but it is one of eight controls in the
frame above. A tap on a side volume only centres it, and a second tap opens
it, while the hint under the shelf says "tap a volume to open it".

| Before | Why | Severity |
| --- | --- | --- |
| 1.3 sources in view; tap selects, a second tap opens; the hint says otherwise | `collections.md › Best practices`: "Make it easy to choose an item. If it's too difficult to get to an item in your collection, people will get frustrated." `gestures.md › Best practices`: "people expect tap to activate or select an object." | Medium |

### 10 · Gold does five jobs, and people and topics change colour between screens
`valsLibrary.js:59-61, 150-153`; `Library.jsx:121, 361, 403`; `vals/shared.js:6`

Gold is the Add button, the RESEARCHED badge, every concept chip, the
"Connected in your second brain" heading and the error text. NOVA-METHOD §2b
rule 8 keeps gold for "not yet decided". Separately, the Library colours people
violet and topics cyan, while Notes and the Galaxy (where See in Galaxy
leads) colour them coral (`#e08f6f`) and violet (`#8a6ad1`) from
`NOTE_TYPE_COLOR`. The house concept tan (`#d8b573`) sits within a few
degrees of gold (`#e0b26a`), which is a pre-existing tension to settle once,
not on this page (judgment).

| Before | Why | Severity |
| --- | --- | --- |
| Gold for five unrelated things; two colour maps for the same note types | `color.md › Best practices`: "Avoid using the same color to mean different things." NOVA-METHOD §2b rule 8. | Medium |

### 11 · Ten type sizes in three families
Computed-style sweep, `[data-screen-label="Library"]`

Covers: 9.5, 11, 11.5, 12, 12.5, 13, 13.5, 14.5, 15 and 16 px; the detail:
11, 11.5, 12, 12.5, 13.5, 14, 14.5, 15 and 30 px. Three families on one
screen: SF, New York, and SF Mono for the search field, the only monospace
text left on the page under summary.

| Before | Why | Severity |
| --- | --- | --- |
| 10 sizes, 3 families | `typography.md › Conveying hierarchy`: "Minimize the number of typefaces you use, even in a highly customized interface. Mixing too many different typefaces can obscure your information hierarchy." | High |

### 12 · States: blank where a skeleton belongs, an empty room that asks to be dragged
`Library.jsx:197-200, 359, 361, 530`; demo frames

Not connected, the Covers view is the head, three rows of live controls and an
empty page; in Shelf view at 1280 it is an empty 3D room with "Library" on the
wall and "Drag or scroll the shelf · tap a volume to open it" under a plank
with nothing on it. Loading the 3D shelf shows the Suspense fallback, an empty
box the canvas's height (`:530`); loading a detail is the word "Opening…"
(`:359`); an error is gold text you tap (`:361`). The Add button in demo mode
only toasts "Connect a backend in Settings first" (`App.jsx:4927-4929`), which
is honest, but the page around it gives no next step.

| Before | Why | Severity |
| --- | --- | --- |
| No skeleton; an instruction to drag an empty shelf; "Opening…"; a gold error | `loading.md › Best practices`: "Show something as soon as possible. If you make people wait for loading to complete before displaying anything, they can interpret the lack of content as a problem with your app." `writing.md › Best practices`: "Provide clear next steps on any blank screens." `generative-ai.md › Outputs`: "instead of 'Processing…', say 'Summarizing key themes from your notes.'" | Medium |

### 13 · Motion: the tumble is right, its company is not
`Library.jsx:551-558`, `Shelf3D.jsx:902, 915`, `index.css:2595`,
`Library.jsx:89-94`

- The dossier rises as soon as the open starts, pulled up into the canvas by
  22% of its height, so for most of the 1.15 s flight the 30 px title sits
  over the receding room and the neighbouring volume (frame held at p 0.5).
- Under reduced motion the global rule makes every CSS animation 0.01 s and
  every transition none (`index.css:2595`), and the 3D open jumps straight to
  its end pose (`Shelf3D.jsx:902, 915`). That is instant, where the checklist
  and the HIG ask for a fade.
- The Covers to CSS-spines morph is a WAAPI animation, which ignores the
  reduced-motion rule (`Library.jsx:89-94`); it only runs on the no-WebGL
  fallback.
- The grid mixes four card shapes (plated video, unplated video, a slim
  article, a 2:3 book with its title outside the card) under
  `align-items: end`, so rows end ragged and leave holes.

| Before | Why | Severity |
| --- | --- | --- |
| Type drawn over the flight; reduced motion as a jump; ragged grid rows | `accessibility.md › Cognitive`: "Replacing transitions in x-, y-, and z-axes with fades to avoid motion." `motion.md › Providing feedback`: "Let people cancel motion." (the 3D flight does; the flat detail does not) | Medium |

### 14 · The Mac is the closest thing to the bar
1280×800 frames

The open book beside its editorial column is reel-0011's book page, and the
best moment the Library has. Against it: the shelf opens on its first volume
right of centre, with the left half of the room empty; Nova's reading starts
at 919 px under an 800 px fold; and the 14 chips are under the 28 pt macOS
default (none under the 20 pt minimum). The phone round comes first; this is
the desktop round's starting point.

| Before | Why | Severity |
| --- | --- | --- |
| Half an empty room; the reading below the fold; 26 pt chips | `accessibility.md › Mobility`: macOS "28x28 pt" default, "20x20 pt" minimum. `layout.md › Visual hierarchy`: "place the most important items near the top." | Low |

### Smaller things seen

- The Index calls them volumes (`valsIndex.js:95-98`), the page calls them
  sources, the code calls them editions.
- "⧉ Original · 3K chars in Raw/…" names a vault path to him (`:164`);
  "The transcript" says the same thing in his words.
- With the Books filter on, the wall word "Books" hides behind the one volume
  (one letter shows).
- "Nothing matches that filter." also answers a search that found nothing
  (`valsLibrary.js:189`).
- 25 covers in eight or more cloth hues read as a rainbow in a grid of 25. The
  colour is each edition's identity, a real meaning, so the answer is fewer at
  once, not grey covers (judgment).
- The tint works and is measured (9.89:1 on the pane for a blue edition), but
  a blue cloth mixed 35% into Nova's cyan lands at `#59c2ea` against
  `#59e6ff`: the page barely changes. "The page wears the book" shows most in
  the ground, which is where the mockup puts it.
- The sidebar's Library row at 1280 uses the generic house glyph shared with
  four other rows (chrome, not this page).

---

## 3 · Keep

- **The edition** (`src/shelf3d/edition.js`): a plate set into cloth with a
  7% margin, never stretched; a book's jacket on a 2:3 board; an article
  slimmer and paper-bound. His 17 Sep call, and right.
- **The tumble with exact endpoints** (`Shelf3D.jsx:823-870`): a wobble that is
  zero at both ends, smoothstep cubed on the spin so the book lingers
  front-on, the floor leaving first, the board opening last. Interruptible in
  both directions.
- **Render on demand**: zero frames at rest (counted, `__novaShelf.frames`),
  windowed textures, the cheap binding mid-drag, the starvation floor, and
  dispose plus `forceContextLoss` on unmount.
- **The tint, contrast-checked in code** (`useLibraryTint.js:41-77`), on the
  wrapper so it cannot outlive the page.
- **The word on the wall**, cut at the waist by the volumes: the reel's trick,
  and it names the filter.
- **Honest provenance**: "Researched from public sources: Nova has not read
  the text" (`valsLibrary.js:139-141`), the generative-AI disclosure the HIG
  asks for, already written.
- **The edge guard** (`Shelf3D.jsx:1209`): a drag from the screen edge is never
  the shelf's.
- **The whole cover as the tap target** (22 Sep finding 16, done), and search
  across title, author, concepts and tags (`valsLibrary.js:73-75`).
- **One palette module** (`artPalette.js`) for the grid and the shelf; the
  related rail is the one place still outside it.
- **The 1280 open book** beside its column (`Library.jsx:509-516`).

---

## 4 · Directions for the mockup round

All three are drawn in `design/mockups/74-redesign-library.html`, each a live
390×844 phone with three states (the shelf, opening a source, what Nova does
with it). The detail is the same in all three, and every number below was
measured on the mockup at 390.

**The detail, in all three.** It opens on the volume, then its name, then
Nova's verdict in the serif (the Watcher's line; a source without one shows
the first line of Nova's page, labelled as such), then two verbs: Ask about it
(Nova opened with the source named and the question left to finish, the
`askAboutArtifact` pattern, new on this page) and Open source. Then "What
Nova holds", with a talk's key ideas placed on its own length from the note's
own M:SS timestamps (new, small). The four chip rows become one figure of what
the source connects to, in the Galaxy's own colours, with five counts that
open lists of 44 pt rows. A line says which lanes Nova hands the source to
(the eight that call `shelfContext`). The transcript and the Galaxy (opening
on this source, new) close the page. Back and an edge swipe reverse the flight
from wherever it is; the writing arrives only for the last part of the flight.
Measured: Nova's reading starts at **579 px** (today 1,399); 16 controls, all
44 pt; three type sizes in the detail (13, 16, 20) and four on the page
(34, 20, 16, 13).

**A · One shelf.** *Removes* the Covers view (kept only as "See all", a grid
sheet), the four kind chips, the hint and the "live" label. *Keeps* the 3D
shelf, the edition, the tint, the tumble, search and add. *Moves* search and
add into a 34 pt title row, the kinds into one segmented control, and the
focused volume's name (real type) and verdict (serif) under it; a row of 25
ticks in each edition's colour reaches any source in one drag. One tap opens
any volume, side ones too. Above the fold: **11 objects (17 on Covers) to 9**;
any source in one move instead of up to 24.

**B · The stack.** *Removes* the standing row, the Covers view, the kind chips
and the hint. *Keeps* the edition, the tint, the tumble, search and add.
*Moves* the shelf into Stripe Press's own idiom (the reel's first four
seconds): volumes lying flat on the phone's own vertical scroll, every spine
legible, the one at eye level sliding out to show its cover; a tap picks the
book up and tumbles it into the detail. Above the fold: **11 objects to 5 plus
one list, with 9 sources in view instead of 1.3**.

**C · Shelf and covers.** *Removes* the kind chips (the sections are the
kinds), the toggle and the hint. *Keeps* the 3D shelf for the five newest, the
edition on every cover, the tint and the tumble. *Moves* everything else into
one rail per kind, Apple Books' shape, each with its count and See all; a
cover becomes the volume as it lifts (the spine and page block grow out of
it), which answers X8. Above the fold: **11 objects to 9, with 8 sources in
view** (five standing, three covers).

**What the pixels argue for.** The detail change is the largest gain for the
least work and is the same in all three, so it can be built first whichever
he picks. Between the three: A is the smallest step from what he built on
17 Sep; B gives the phone the most reach and is the reel's own opening; C is
the most familiar and the cheapest on the GPU (one 3D shelf of five). The
three Critical findings (26 pt chips, 9.5 px badges, the empty listbox) are
fixed by every direction and are cheap on their own.

---

## 5 · Method

**Frames.** Sixteen (fourteen distinct views), all in demo mode, in an isolated browser context against
a Vite server (port 5204) run from a detached worktree of HEAD (`f60e8a9`)
outside the repo, with `novaos.style` summary, `novaos.theme` command,
`novaos.material` glass and `novaos.core` hologram set before load, and a
script that refused every non-GET fetch, XHR and beacon. "Demo data" and
`connectionStatus: 'demo'` were confirmed on Home first. Zero writes were
attempted in any frame (the guard's log stayed empty). At 390×844 (mobile,
touch, 3x): the not-connected Library; Covers at the top and scrolled; the
flat detail from Covers, top and lower; the 3D shelf at rest; the open held
mid-tumble with the dev `scrub(0.5)`; the settled open book; the return after
Back; the Books filter. At 1280×800: the empty room, the shelf, the open book
and Covers. Stills stayed out of the repo (audit convention).

**The instrument, said plainly.** Demo mode has no library, so for every frame
except the two not-connected ones, 25 invented sources ("Demo Talk 01…",
"Demo Channel", abstract canvas-painted posters, obviously not real) and their
details were set into the running app's in-memory state through the dev hook
`window.__novaApp`. This shows real layout, real code paths and real motion
with demo-shaped data. Two consequences: with that state set, the header read
"live from Obsidian" inside a demo app (an artefact of the instrument, which is
what led to finding 8's source trace), and opening a source never fetched
(`ensureLibraryDetail` returns with no connection), so the detail rendered
from the injected copy. A viewport change reloads the page, which drops both
the state and the write guard; each time, the guard was re-armed with a fresh
load before the state went back in.

**Sweeps.** Distinct computed font sizes over visible text-bearing elements
of the Library root; controls as `button`, `a[href]`, `input` and
`[role=button]`, measured by their smaller dimension; `scrollWidth` of
`main`, the root and the document; scroll height of `main`; the top of named
sections by text-node search.

**References opened** (`apple-hig-review`): `accessibility.md`, `typography.md`,
`voiceover.md`, `layout.md`, `color.md`, `designing-for-ios.md`, `gestures.md`,
`collections.md`, `motion.md`, `loading.md`, `writing.md`, `generative-ai.md`.

**What was not seen.**
- His real vault. Demo only, by instruction: real posters, real titles and
  their lengths, real concept counts, and his real shelf size today (the
  25 / 21 / 3 / 1 shape is from the 21 Sep still, counts only; the plan's
  17 Sep count was 21).
- His phone. WebGL in headless Chrome is software-rendered: the 3D was judged
  from stills, no frame times were taken, and the softness of the 1.25x
  renderer is inferred from the code and the stills, not seen on a 3x panel.
- Real touch and his edge swipe: synthetic pointer events, and
  `history.back()` as the swipe's equivalent.
- Reduced motion: this browser tool cannot emulate the setting, so its
  behaviour is read from source (`index.css:2595`, `Shelf3D.jsx:902, 915`).
- Offline with a cache, the first-sync label, and a detail error: read from
  source (`valsLibrary.js:178-180`, `App.jsx:376-377, 750-755, 4661-4677`).
- The Add sheet: demo mode answers with a toast, so `IngestModal.jsx` was read
  instead.
- The `cupertino` idiom (the screen has no idiom branch; summary was the
  brief) and the CSS fallback shelf (WebGL was available).

**Inventory and checklist first-look notes, confirmed or corrected:**
- "The shelf is a strength" (checklist L5, inventory D): **confirmed**, and
  §3 lists why.
- "The two raw glyph toggles beside house chips are the inconsistency":
  **confirmed** (`Library.jsx:124`), and the smaller of the frame's problems;
  finding 2 is the larger one.
- The toggle's "32px min tap target" (inventory F5): **confirmed** at 32 pt.
- "No demoMode branch... demo data flows through the same `liveLibrary`
  state" (inventory D, States): **corrected**: there is no demo data for the
  Library at all; `liveLibrary` stays null in demo, so the page renders
  empty.
- "See in Galaxy" (inventory F16): **corrected** in meaning: it opens the
  Galaxy screen, not this source in it (`valsLibrary.js:167`).
