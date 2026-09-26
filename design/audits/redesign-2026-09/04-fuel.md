# 04 · Fuel — audit, 27 Sep 2026

Judged against his bar for this redesign ("Simplicity with all functionality
and a beautiful aesthetic, along with ease of use MUST be the goal"),
against the Coach deck in Train as the reference for "simple", and against
the rebuilt Home (`src/screens/MissionSummary.jsx`, style `summary`), which
now draws today's protein as a ring and a highlight sentence from the same
numbers Fuel draws. Evidence: source read in full (`Recipes.jsx` 1,055
lines, `valsRecipes.js` 1,077, `PickItUp.jsx` 345, `RecipeOverlay.jsx` 473,
`AddRecipeModal.jsx` 153, `PortionSheet.jsx` 64, plus the relevant slices of
`App.jsx`, `valsChrome.js`, `valsSummary.js`, `summaryFacts.js`,
`Controls.jsx`, `portion.js` and `index.css`); 4 demo frames; 24 real,
read-only frames of his connected vault at 402×874 (Fuel top to bottom,
yesterday's log, Pick it up open, a recipe overlay, one `command` frame); 4
computed-style sweeps. Read under `apple-hig-review`'s references, each
cited below as `file.md › Heading`, with "judgment" where none applies.
Method, the frame ledger and every blocked write are in §5. The real frames
are quoted here as counts and shapes only: none of his recipe names, food
entries, targets or notes appear in this file.

---

## 1 · Verdict

**Needs work.** Fuel is five jobs in one 11.4-screen scroll (today's plate,
Pick it up, the rotation, the food log and the recipe bank), and the bank
alone is 80% of the page, so the thing he does several times a day, logging
food, starts 1.55 screens down, below two cards that answer "how am I
doing" in five different drawings of the same protein number. It will be
remembered for the right things (dashed rings that never invent a target,
the one-field composer, the itemised plate that can be corrected line by
line), but it also carries a label that is false on his real data ("kcal
off-plan" over a total that includes the plan), a one-tap delete with no
Undo beside a line delete that has one, and 161 of its 312 tap targets
under Apple's 28pt floor.

### Clutter numbers, as it stands (checklist §3)

| Test | Fuel (real, cupertino, 402×874, 07:4x AEST, nothing logged yet today) | Recipe overlay (real) | Target |
| --- | --- | --- | --- |
| Focal point | None single: the hero rings and the Pick it up rings compete in the first screen; the log bar, the page's most-used control, sits at 1,356px | The dish photo placeholder; the dish's name comes after the photo, the add-photo bar, the macro table and the fridge row, at 581px | One, above the fold |
| Objects above the fold | 3 cards holding 6 instruments (2 hero rings, a macro legend, 2 glance rings, a 7-bar week chart), a tag, a sentence and a chip; 2 tap targets | 5 (header with Delete + Close, photo placeholder, add-photo bar, macro table, fridge row) | Lower than today, or a reason |
| Screens deep | **11.4** (9,995px); 12.3 with yesterday's 4-entry log shown; 12.5 with Pick it up open | 2.1 (1,864px) | ≤ 4 before an index |
| Share of the page that is the recipe bank | **80%** (8,042 of 9,995px, 28 cards) | · | · |
| Verbs per card | Recipe card: 7 targets (open, 5 slot letters, + Log this). Rotation card with 3 options: 17 targets plus 4 long-press menus (source count). Log row: 2 (✎, ×) plus one × per itemised line | 27 targets on one recipe | One primary, one quiet alternative, talk back |
| Type sizes | **16** distinct on `main` (9.5 to 30px); 17 in `command` | 8 | ≤ 3 |
| Tap floor | 254 of 312 targets under 44pt; **161 under 28pt** (212 in `command`) | 24 of 27 under 44pt; 12 under 28pt | ≥ 28pt; ≥ 44pt primary |
| Filled controls | 106 of 312 have a non-transparent background (a blunt test; includes chips) | · | 1 primary per card |
| "Card" treatments | 6 distinct bordered, rounded signatures on `main` | · | One house card |
| Gestures | Swipe between options on a rotation card header; long-press on rotation cards and option rows; horizontal rails (rotation, quick-log, day, brands). No swipe row anywhere in the food log | Edge back (history entry) | Every capability has a pixel he can tap |
| Motion | Arcs draw in (`nvArcIn`); Pick it up cards rise; new itemised lines and refine turns rise. No exit on any removal | View-transition morph in and out | All four |
| States | Skeleton in Pick it up only; hero, rotation and log have none; the recipe grid falls back to the demo bank | · | All four designed |
| Width | `main.scrollWidth` 402 | 402 | 402 |
| Idioms | Both photographed at the top; same layout, `command` smaller type | cupertino only | Both checked |

---

## 2 · Findings

### 1 · Five jobs share one scroll, and the bank is four fifths of it
`Recipes.jsx:405-1053` (the whole screen is one column); real frames `s0` to `s11`; section offsets measured on the live page

Measured top edges on his live Fuel page: hero at 81px, Pick it up 510,
the week chart 588, the Training × fuel card 798, the rotation 974, the
**log bar 1,356**, "Log it again" 1,409, the day rail 1,548, "Everything
you've logged" 1,644, the recipe grid 1,845 to 9,887. The five jobs are:
how today stands (hero, week, cross-check), what to buy now (Pick it up),
what today's plan is (rotation), what he ate (the log bar and its twelve
conditional sub-features), and the bank (filters, search, 28 cards, and the
overlay behind each). Only the first and the fourth are things he does
every time he opens the page. The bank is a library he visits; it takes
8,042px of a 9,995px page, ten of the twelve screenfuls photographed.

| Before | Why | Severity |
| --- | --- | --- |
| One scroll of 11.4 screens holds five jobs; the log bar is 1.55 screens down; the recipe bank is 80% of the height | `designing-for-ios.md › Best practices`: "Help people concentrate on primary tasks and content by limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." `layout.md › Best practices`: "People want to view the most important information right away." checklist §3, Focal point and Screens deep. | High |

### 2 · One fact, drawn up to five times on Fuel and twice more on Home, in two hues and two opposite geometries
`Recipes.jsx:244-343` (hero rings, legend), `:425-428` (the "Fits N kcal left" tag and the Coach gap sentence), `PickItUp.jsx:254-256` (glance rings), `:278` (budget rings), `Recipes.jsx:463-467` (week chart), `:980-982` (the fits chip), `:513-515` (rotation totals), `:651-656` (the logged total); Home: `valsSummary.js:117-129`, `summaryFacts.js:117-134`, `index.css:595,654`

**Protein today**, with Pick it up closed: the hero ring's centre and its
"of N g protein" line, the legend's "eaten / target", the Coach sentence
("N g to go"), the protein glance ring ("to go"), and today's column in the
week chart. That is five renderings on one page, six with Pick it up open
(its budget ring). Home then draws it twice more (the Body ring and, when
protein is the focal vital, the highlight sentence "You're N g under
today's floor"), and names protein again in its trends row. On
Fuel protein is cyan; on the new Home it is `--nv-sum-c1`, which is green
in the base summary palette (`index.css:595`), the hue Fuel uses for
calories, and coral in the `sky` theme his Home decision picked
(`index.css:654`).

**Calories** appear as four different figures with no shared label: eaten
(the kcal ring), left (the "Fits N kcal left" tag, the kcal glance ring and
the "Fits N kcal left" filter chip: three times, in two casings), planned
(the rotation header's bare green total, no unit), and logged (the "kcal
off-plan" figure, finding 3).

**The same state in opposite shapes.** At 07:4x on his real day, with
nothing eaten, the two hero rings were dashed gaps and the two glance rings
just below them were full, closed circles. The hero fills with what has
been eaten; the glance ring fills with what is left. One fact, opposite
geometry, about 230px apart.

| Before | Why | Severity |
| --- | --- | --- |
| Protein today drawn 5 to 6 times on Fuel and twice on Home, in a different hue on each page | `charting-data.md › Designing effective charts`: "Maintain continuity among multiple charts that use the same data... use one chart type and consistent colors, annotations, layouts, and descriptive text to signal that the dataset remains the same." `color.md › Best practices`: "Avoid using the same color to mean different things" (green is calories on Fuel and protein on Home's base palette). | High |
| Two ring pairs for the same numbers fill in opposite directions, one above the other | `charting-data.md › Designing effective charts`: "If you need to create a chart that presents data in a novel way, help people learn how to interpret the chart." Nothing here says which way either ring counts. Home's finding 2 named the parent pattern ("the same facts restated up to six times"). | High |
| Four calorie figures (eaten, left, planned, logged), three without a word saying which | judgment; §2b rule 8, colour means something: all four wear the same green. | Medium |

### 3 · "Kcal off-plan" is false on his real day
`Recipes.jsx:651-656` (the label), `valsRecipes.js:198-222, 655` (`foodLogTotals` sums every entry); real frame `yst-1`

Rotation meals write into the food log when ticked (`source: 'rotation'`,
the comment at `valsRecipes.js:198-202` says so and calls the single sum
"the whole day"). The figure is then drawn as `N KCAL OFF-PLAN`. On
yesterday's real log (4 entries, opened read-only through the day rail),
the first entry is a rotation dish (the same dish the rotation's first card
carries) and it sits inside the total labelled off-plan. The number is the
whole day; the word says it excludes the plan.

| Before | Why | Severity |
| --- | --- | --- |
| A total that includes the plan is labelled "off-plan" | NOVA-METHOD non-negotiable, "Honest degradation, never fiction": a label that misdescribes its own number is a fiction, however small. `feedback.md › Best practices` (status should be clear). | High |

### 4 · 161 of 312 tap targets are under Apple's 28pt floor
Computed sweep on `main` (targets found by their React handlers, nested targets counted); `Recipes.jsx:1019-1037` (slot chips), `:108-117` (pager dots), `:154-157` (option names), `:883-889` (log row ✎ ×), `:905-907` (line ×), `RecipeOverlay.jsx:180-189` (ingredient ＋ ✕)

The under-28 set, by size: **140 slot-letter chips at 63×25** (five on each
of 28 recipe cards), 9 pager dots at 8×8, 9 option-name targets at 116×15
(the text of a rotation option is itself the "make this the one that
counts" control) and 3 dish-name targets at 170×18 (the rotation card's
focused dish, which opens the recipe), neither with a minimum height. In `command` the count
rises to 212. At or just over the floor: the log row's ✎ and × at 30×30,
under a comment that says "a 44px tap target either side" (`:883`); every
itemised line's × at 28×28 (25 of them on yesterday's real log). In the
overlay, each ingredient carries a 24×24 ＋ and a 24×24 ✕ (12 targets on a
6-ingredient recipe, all under the floor).

| Before | Why | Severity |
| --- | --- | --- |
| 161 targets under 28pt on the page, 12 in the overlay, including the only way to put a recipe in today's plan | `accessibility.md › Mobility`: "iOS, iPadOS: 44x44 pt default, 28x28 pt minimum." The skill marks accessibility failures Critical regardless of how the rest reads (as 02-inbox finding 10 and 03-train finding 5 did). | Critical |
| The log row's edit and remove are 30×30 under a comment claiming 44 | `accessibility.md › Mobility`: "Consider spacing between controls as important as size." Two destructive-adjacent marks 30px wide, side by side. | High |

### 5 · The recipe card asks seven questions and shows a placeholder where the picture should be
`Recipes.jsx:994-1053`, `valsRecipes.js:252-269`; real frames `s2` to `s11`

Each of the 28 cards carries: tap to open, five slot letters (B, L, D, S,
E) that add or remove the recipe from a rotation slot, and a full-width
"+ Log this". On his vault **27 of 28 cards have no photo**, so each opens
with a 104px hatched block captioned "dish photo — name" (2,808px of
hatching in total). The macro row prints unrounded values (one decimal
place on several cards) while every other surface rounds, and a long
"makes" field wraps into the macro line on five of the cards seen, up to
three lines deep. Planning today (the slot letters) is done from the library, by
a letter, at 63×25.

| Before | Why | Severity |
| --- | --- | --- |
| 7 targets per card, 28 cards: 196 targets in the bank | checklist §3, Verbs per card (one primary, one quiet alternative, talk back); the Coach deck carries 3. | High |
| 27 image placeholders on a collection whose purpose is text and numbers | `collections.md › Best practices`: "Consider using a table instead of a collection for text." `lists-and-tables.md › Best practices`: "Prefer displaying text in a list or table... if you need to display a large number of images, consider using a collection." Here there are almost none. | High |
| Decimals on the grid, rounded figures everywhere else; the "makes" text runs into the macros | judgment; `lists-and-tables.md › Content`: "Keep item text succinct so row content is comfortable to read." | Low |

### 6 · The rotation card: seventeen targets, and "out" said in colour alone
`Recipes.jsx:71-186, 496-534`, `valsRecipes.js:112-196`; real frame `cross`

His breakfast slot holds three options. The card draws the focused dish,
its macros, a 44px tick, ‹ and › with three dots, then every option again
as a row with its own tick, name (itself a target) and ×, then "Drop this
one". By source that is 17 tap targets plus four long-press menus (the
header and each row) on one card; the lunch card beside it repeats the
pattern. Two option rows were drawn in the warn hue: the code appends
" · out" (`:157`), but the row truncates with an ellipsis first, so on his
phone the word is cut off and only the colour says the fridge is empty.
Naming and adding a meal use `window.prompt` (`:169, :178, :528`).

| Before | Why | Severity |
| --- | --- | --- |
| 17 targets and 4 hold menus on a card taken "4× a day" | checklist §3, Verbs per card; `designing-for-ios.md › Best practices`: "limiting the number of onscreen controls". | High |
| "Out" conveyed by colour once the text truncates | `color.md › Inclusive color`: "Avoid relying solely on color to differentiate between objects... or communicate essential information." | High |
| Three `window.prompt` dialogs for naming | `entering-data.md › Best practices`: "Be clear about the data you need"; a system prompt carries no context and breaks the material. judgment. | Medium |

### 7 · Deleting a whole meal has no Undo; dropping one line of it does
`App.jsx:2286-2303` (`deleteFoodLogEntry`), `:2306-2322` (`deleteFoodLogItem` with a 30-second `foodItemUndo`), `:2871-2878` (`relogFoodItem`)

The × on a log row removes the entry optimistically, with no confirm and no
Undo. The × on one itemised line of the same entry removes the line and
offers "Undo, put X back" for 30 seconds. A tap on a "Log it again" card
writes a new entry at once and says so in a toast with no Undo either. The
two destructive marks sit in the same list, one row apart, and behave
differently. Read in source; not exercised live (both write).

| Before | Why | Severity |
| --- | --- | --- |
| The larger deletion has no way back; the smaller one does | CLAUDE.md non-negotiable: "Everything writeable is undoable." `feedback.md › Best practices`: "Warn people when they initiate a task that can cause data loss that's unexpected and irreversible." `undo-and-redo.md` judgment: an Undo toast is the iOS answer, the itemised line already has it. | Critical |

### 8 · Three portion pickers and two doors for "log part of a recipe"
`Recipes.jsx:681-736` (the inline "From your recipes" picker), `PortionSheet.jsx` (opened by "+ Log this", "+ Log this version" and every Pick it up result), `Recipes.jsx:934-940` ("Ate less" fraction chips in the entry editor); `portion.js:15-24`

The inline picker and the PortionSheet each draw the same eight fractions,
a custom multiplier, a live preview and a Log button, coded twice. Every
recipe card's "+ Log this" already opens the sheet, so "+ From your
recipes" is a second door to the same outcome. The entry editor's "Ate
less" chips are a third rendering of the same list (the fractions below
one). With a past day selected, the sheet says "LOGGING TO 2026-09-26"
(the raw date, `valsRecipes.js:1053`) where the page says "Logging to
Saturday 26 September", and its buttons are the only uppercase CANCEL /
LOG IT on the page.

| Before | Why | Severity |
| --- | --- | --- |
| One job (log a fraction of a known food) has three UIs and two entry points | `modality.md › Best practices`: "Aim to keep modal tasks simple, short, and streamlined"; judgment on duplication, the pattern 03-train finding 7 counted for "no". | Medium |

### 9 · The composer region is twelve features in five tints, fed by 31 hand-styled inputs
`Recipes.jsx:536-966`; `AddRecipeModal.jsx`, `RecipeOverlay.jsx`, `PortionSheet.jsx`, `PickItUp.jsx`; `index.css:44`

Under the one-field log bar (a Keep), the card grows, by state, a gold
"Nova asks" panel, a green "Broken down into N lines" panel, a cyan
"Say what's different" thread, a cyan inline editor, a black inset recipe
picker, a row of five raw number boxes ("Enter macros myself"), a photo
strip with 16×16 remove marks, a save-to-bank link, an error line, an Undo
line and the history disclosure. Across Fuel's five files there are 31
input, textarea or select sites, each styled inline; `Controls.jsx` has no
input primitive. `index.css:44` forces every one of them to 16px, which is
why the 190px recipe search truncates its own placeholder in both the demo
and the real frames.

| Before | Why | Severity |
| --- | --- | --- |
| Twelve conditional sub-features in one card, each in its own tint | `layout.md › Visual hierarchy`: "Make controls easier to use by providing enough space around them and grouping them in logical sections." | Medium |
| 31 hand-styled inputs, no shared primitive; manual entry is five bare boxes | §2b rule 7 (nothing is a plain box with text in it); `entering-data.md › Best practices`: "offer choices instead of requiring text entry" (the fractions already exist as choices). 03-train finding 8 made the same call for Train. | Medium |

### 10 · The recipe overlay reads its desktop left column first on the phone
`RecipeOverlay.jsx:26-356`, `valsChrome.js:162-171`; real frames `ov-0`, `ov-874`, `ov-1748`; demo frame `overlay`

On the phone the two desktop columns stack, so the page opens with the
photo placeholder, a full-width "+ Add a photo of this dish" bar, a
label-and-value macro table, and the fridge row; the dish's name arrives
fifth, at 581px. The overlay then carries: variant chips, "+ Log this
version", Rename, Use for today, Make primary, Edit this meal (a
full editor with a label-photo calculator), a whole-list and a per-item
route to the shopping list (plus a third for whole items), a ＋ and a ✕ per
ingredient, a Save-changes bar that opens a hand-rolled action sheet, the
method, a Notes panel and "Ask Nova for a tweak" (a six-line
instruction paragraph, a field, a 🎙 emoji where the page elsewhere uses
drawn icons, a camera, Ask, and a preview with three more buttons, two of
them hand-rolled). The fridge's three counts use `window.prompt`
(`:77, :84, :85`). "✕ Delete" sits in the header beside "✕ Close", same
shape, same size. On live recipes the ingredient quantity column is
empty (the text is free-form) but keeps its 74px, so every name is pushed
right. 27 targets, 12 under 28pt.

| Before | Why | Severity |
| --- | --- | --- |
| The name is the fifth object; macros are a label/value table | `layout.md › Visual hierarchy`: "Place items to convey their relative importance... the most important items near the top." §2b rule 7: a number gets a form. | High |
| Delete beside Close in the header, the same chip | `sheets.md › Anatomy`: Cancel/Close dismisses; a destructive action is not a dismiss. `modality.md › Best practices`: "avoid including buttons that people might mistake for the button that dismisses the modal view." | High |
| Four sheet mechanisms on one page: this full-screen overlay, `PortionSheet` (`useSheetDrag`), `AddRecipeModal` (`useExit`, centred, with an "Esc" chip on a phone), the removal action sheet (hand-rolled, no drag) | `sheets.md › Mobile`: "Support swiping to dismiss a sheet"; "Include a grabber in a resizable sheet." Only one of the four does. Inventory first-look, confirmed and counted. | Medium |

### 11 · Pick it up: the right shape, in the wrong place, with two permanent blanks
`PickItUp.jsx:243-345`, `valsRecipes.js:306-435`; real frames `pick-480`, `pick-1354`

Collapsed, it is one good row (two glance rings, a serif question, a count
line, a chevron). Opened, it inserts a 968px panel into the page, pushing
the log bar past two screens. Inside: four budget rings, of which carbs and
fat are always dashed and labelled "blank" on his profile (it carries no
carb or fat target, `valsRecipes.js:523-531`), so two of the four rings are
permanent furniture; two `Segmented` controls; a brand rail; and the
results. Each result draws protein twice (the pill and the P/C/F line) and
the composition twice (the bar and the letters). The missing-brand list is
drawn twice, as dashed tags in the rail (`:299-302`) and again as a
sentence under the results (`:337-339`). In the morning the prefill is the
whole day's budget, so the capture found 2 fits among 869 items from 14
brands; the empty-state line that handles this ("Nothing on its own gets
near N g protein. Try Pairings...") is a Keep.

| Before | Why | Severity |
| --- | --- | --- |
| A 968px inline panel in the middle of the page | `sheets.md › Mobile`: "In an iPhone app, consider supporting the medium detent to allow progressive disclosure of the sheet's content." This is a narrowly scoped task (`modality.md`, "Help people perform a distinct, narrowly scoped task without losing track of their previous context"). | Medium |
| Two budget rings that can never hold a figure from today, drawn every time | `layout.md › Best practices`: don't crowd essential information "with nonessential details". The vals already know there is no target. | Medium |

### 12 · Gold means carbs, and at least twenty other things
`Recipes.jsx`, `RecipeOverlay.jsx`, `PickItUp.jsx`, `AddRecipeModal.jsx`, `PortionSheet.jsx` (50 gold references in the five files); `valsRecipes.js:97-103` (slot hues)

Gold is the carbs hue (a Keep). On the same page it is also: the recipe
category tag, the "Edited" tag, the "N×" frequency figure, "Undo variant",
the "Logging to" banner, "Save this to my recipe bank", "+ Add recipe", the
"Nova asks" panel (the one use §2b rule 8 reserves gold for, and the code
says so at `:765-769`), the "+N kcal" refine delta, the overlay's header
eyebrow, "today's version", "Add to shopping list", ingredient quantities,
method numerals, the Notes panel, a stale brand chip, "not in" brand tags,
"no catalogue yet", "Fetching the catalogue", the protein pill when short,
and the headline's italic "macros first." On top of the four macro hues,
the five slot letters wear five more hard-coded RGB hues (orange, blue,
indigo, pink, red; not tokens), and the "E" chip's red reads as warn.

| Before | Why | Severity |
| --- | --- | --- |
| One hue doing 20+ jobs, one of them a macro | `color.md › Best practices`: "Avoid using the same color to mean different things." §2b rule 8: gold is "undecided". Home's finding 4 counted nine jobs for gold on Home; Fuel has more. | High |
| Five slot hues as raw `rgb()` triples | checklist §3: "Tokens only." | Medium |

### 13 · Demo mode shows one job of five, and a live session can show demo recipes
`valsRecipes.js:85, 246-278, 440, 499, 586, 599`; `App.jsx:413, 1651, 1776`; demo frames `demo-1`, `demo-874`

With `liveRecipes` null (demo mode) the hero, Pick it up, the week chart,
the cross-check, the rotation and the whole log are hidden: `--demo` shows
a headline, four filter chips, a search box and six hatched cards (1,545px,
1.8 screens). A mockup built from demo content, as the loop requires,
cannot show four of Fuel's five jobs. The reverse also holds: in a live
session, while the recipes are loading, if the fetch fails, or if his vault
returns zero recipes (`App.jsx:1651` sets `liveRecipes` to null for an
empty list), the grid renders the demo bank (`this.recipes`, `App.jsx:413`)
under a faint "6 recipes · demo data" meta line. Read in source; not seen
live, because his recipes loaded every time.

| Before | Why | Severity |
| --- | --- | --- |
| Live mode can fall back to demo recipes, labelled only in a faint header line | CLAUDE.md: "demo content is `demoMode`-only." The comment at `Recipes.jsx:988-993` chose this on purpose to avoid a skeleton; the honest version is an empty state that says so. | High |
| Demo mode cannot represent the page | Same caution 03-train finding 12 raised; the mockup round will need demo-shaped fixtures for the plate and the log. | Medium |

### 14 · Motion and states
`Recipes.jsx:253-263, 290-309` (arcs), `PickItUp.jsx:28-33, 223-241`, `App.jsx:2286-2296`

Entrances exist where numbers arrive (the arcs sweep in, respect reduced
motion through the global rules; Pick it up's cards rise and cross-fade
under reduced motion; new itemised lines and refine turns rise). Nothing
leaves: a deleted entry, a dropped line, a cleared slot and a removed
option all vanish in one frame. The only skeleton on the page is Pick it
up's (hand-rolled, where `src/Skeleton.jsx` exports `SkeletonCard` and
`SkeletonList`). Before the vault answers, the hero, rotation and log are
simply absent, and the grid shows the demo bank (finding 13).

| Before | Why | Severity |
| --- | --- | --- |
| No exit on any removal; loading is absence rather than a skeleton | checklist §3, Motion ("entrance, exit, interruptible, reduced-motion") and States ("loading (skeleton)"). `collections.md › Best practices`: "Consider using animations to provide feedback when people insert, delete, or reorder items." | Medium |

### 15 · Dead markup and unread fields
`Recipes.jsx:540-550`, `valsRecipes.js:514, 588-595, 787, 450`, `Recipes.jsx:67-68`

- The day-chip picker inside `display:none` at `Recipes.jsx:540-550`:
  confirmed dead. It maps `v.foodLogDays` a second time; the live rail is
  `:640-645`.
- Six view-model fields no screen reads (grep over `src/`):
  `rotationShowExtraButton`, `showExtraMealSlot`, `rotationTargetKcal`,
  `rotationProteinFloor`, `recipeCount`, and the `clearFoodScanPhotos`
  field.
- A no-op ternary in the gap sentence: `...>= need + ... ? '' : ''`
  (`valsRecipes.js:514`).
- The comment "Apple-layout twin for the eaten-today strip" sits above
  `RotationCard` (`:67-68`), not above `EatenTiles` (`:188`).

| Before | Why | Severity |
| --- | --- | --- |
| A hidden duplicate of a live control, six unread fields, a no-op branch, a stray comment | judgment; a redesign that keeps reading this file will trip on the dead copy first. | Low |

### 16 · What only the real frames show (counts and shapes)
- **28 recipes**, 1 with a photo; the bank runs 8,042px.
- **4 filled rotation slots**; the breakfast card holds 3 options and the
  lunch card 2; two options were drawn "out" in the warn hue with the word
  cut off.
- **12 cards** on the "Log it again" rail, each 132px wide; two and part of a
  third fit the screen.
- Yesterday's log: **4 entries broken into 25 itemised lines**, a 700px
  list, each line with its own 28×28 ×.
- Pick it up's catalogue: **869 items, 14 brands**; 2 fits for the
  morning's whole-day budget; the panel is 968px open.
- The Training × fuel card showed a ratio-kind finding, so it drew no bars:
  four lines of prose and a violet text link.
- The week chart's headline reads a count of days over the floor, and the
  final column (today) is a single dot with "Today is still open, not
  counted above." (a Keep).
- A Dynamic Island greeting arrived over the page in at least 2 of the
  captures (its writes were blocked, §5).

### Smaller things seen
- The "Fits N kcal left" phrase appears as an uppercase tag in the hero
  and a sentence-case chip over the grid.
- The rotation header's total is a bare number with no unit.
- The Coach gap sentence lists every unconsumed slot (four at 07:4x), so
  its length grows with the plan rather than with the gap.
- "+ ADD A MEAL" is the one all-caps label in the rotation rail.
- "Logging to [day] — entries land on that day" wraps to two gold lines
  above the composer.
- A console warning ("Invalid ARIA attribute `ariaLabel`") fires on every
  load, including the demo; not traced to Fuel's own files.

---

## 3 · Keep

- **The honest ring.** A gap is a dashed ring, never a zero; a macro with
  no target draws no arc, and the reason is written down (`valsRecipes.js:517-541`,
  `Recipes.jsx:208-230`). Carb and fat arcs stay absent until the Intake
  writes a target.
- **The macro hue convention.** Protein cyan, carbs gold, fat violet,
  calories green, applied the same way in every place a macro is drawn on
  this page (inventory's first look, confirmed). Finding 12 is about gold's
  other jobs, and finding 2 about Home's different protein hue, not about
  this convention.
- **The one-field composer.** Type, say, shoot or scan inside one rounded
  well; the send arrow arrives only when there is something to send; a
  "Searching…" line proves the tap landed (`Recipes.jsx:554-619`).
- **The itemised plate.** An entry is the sum of its lines, each line can
  go on its own, and the line's removal has a real Undo
  (`Recipes.jsx:891-911`, `App.jsx:2306-2322`). This is the pattern finding
  7 asks the whole entry to adopt.
- **Say what's different.** Corrections in words, acted out: what left is
  struck, what arrived is lit, the calorie shift is a figure, nothing is
  logged until Add (`Recipes.jsx:812-847`). The Jarvis rule, done right.
- **Pick it up's honesty.** A real skeleton, an empty line that explains
  itself ("Nothing on its own gets near N g protein. Try Pairings"), a
  provenance line (how many, how many chains, when, from where), stale
  brands flagged, and every result logged through the same portion sheet.
- **The quick-log card's composition bar**: the food as a shape, grams not
  calories, no bar when there are no macros (`Recipes.jsx:16-65`).
- **The week chart's "Today is still open, not counted above."** An open
  day is not a failed day.
- **The recipe card → overlay morph** and the overlay's own history entry,
  so the back swipe closes the recipe instead of leaving a tab
  (`App.jsx:3180-3204`).
- **The fridge on the rotation card**: "N left", loud at zero, one portion
  off per tick. The colour-only problem in finding 6 is about truncation,
  not about the idea.

---

## 4 · Directions for the mockup round

**A · Fuel as the plate.** The page answers one question, "what have I
eaten and what's next", and nothing else leads. At the top, one instrument
built from the same fields Home's Body ring reads (so the two can never
disagree, and wear one protein hue): calories and protein as one ring pair,
filling one way. Under it one sentence, generated by the same code as
Home's highlight, and directly under that the composer, which becomes the
first control on the page. Today's log follows as one grouped list with a
leading swipe (edit) and trailing swipe (delete, with the Undo the line
delete already has), today's rotation folded into it as ticked or
unticked rows ("Breakfast · planned"). The quick-log rail becomes the
composer's suggestion row. The week chart and the cross-check move one tap
down, behind the ring. The bank leaves the page: a "Recipes" row opens its
own page. Kept: every capability. Moved: the bank (to its own page), Pick
it up (C), the rotation's planning verbs (B). Clutter numbers aimed at:
one focal point; the composer above the fold; the page from 11.4 screens to
the length of one day's log; protein drawn once on Fuel.

**B · The Coach-deck shape for suggestions and swaps.** Everything on Fuel
that proposes (the gap sentence's "dinner covers 46", the cross-check's
finding, a rotation option that is out, a variant that would close the
protein gap) becomes one card in the deck's grammar: one sentence, the
change drawn (the ring that would move, by how much), a light tick, a quiet
cross, one do-all, talk back, Undo. Planning moves off the recipe card:
the five slot letters and the rotation card's per-option rows are replaced
by "Plan this for…" in the recipe page's hold menu and a single ordered
list of today's slots. Clutter numbers aimed at: recipe card from 7
targets to 2 (open, log); rotation card from 17 to 3; no target under 28pt.

**C · Pick it up as a sheet from the plate.** Opened from the "kcal left"
figure (the one place that number is drawn in A), as a medium-detent sheet
with a grabber: the top three fits first, full height for the rest. Only
the budgets with a target get a ring; carbs and fat appear the day his
profile carries them. Each result draws protein once and composition once;
the missing-brand list once, as a footnote. Kept: the filters, the brand
rail, the pairings, the honest empties and the provenance line. Clutter
numbers aimed at: zero pixels added to the page when closed or open; four
rings to two on his current profile.

**D · What the pixels argue for.** The bank is 80% of the page and 27 of
its 28 cards have no picture, so as its own page it wants a list (name,
the composition bar, kcal) with the photo as a leading thumbnail only when
one exists, a pinned inline search, the category and "fits" filters as a
scope bar, and the overlay reordered so the name, the ring and "Log this"
come first, Delete moves to the bottom behind a confirmation, the macro
table becomes the plate's own ring, and the four sheet mechanisms become
one. Before any of it: fix the "off-plan" label (finding 3), give the
entry delete its Undo (finding 7), and replace the demo-bank fallback in a
live session with an honest empty or loading state (finding 13). Those
three are honesty faults that stand whatever the redesign becomes.

---

## 5 · Method

**Source.** The six assigned files read in full; `App.jsx` slices for
`logEatOut`, `openPortionSheet`, `confirmPortionSheet`, `openRecipe` /
`closeRecipe`, `setFoodLogDate`, `deleteFoodLogEntry`, `deleteFoodLogItem`,
`relogFoodItem`, `openEatOut` / `findEatOut`, the demo-recipe assignment
(`:413`) and the recipes load (`:1651, :1776`); `valsChrome.js:135-175`;
Home's `valsSummary.js:95-230`, `summaryFacts.js:110-140`,
`MissionSummary.jsx:330-360`; `index.css:38-46, 590-680`; `Controls.jsx`
(`TextAction`, `Tag`, `Rail`, `Segmented`); `api.js` (the eat-out and
food-log calls are GETs); `portion.js`. Greps for unread vals fields, for
`window.prompt`, for input sites and for gold references across the five
Fuel files.

**Demo frames: 4 captures, 3 distinct views** (`--demo --style cupertino
--hour day`, port 5183, the one CORS-allowed dev port): Fuel top, Fuel
bottom (`main.scrollHeight` 1,545px; a third capture at scrollTop 1,748
clamped to the same bottom), and the demo recipe overlay opened through
`window.__novaApp.openRecipe` (1,207px). `connectionStatus` read as
`"demo"`.

**Real frames: 24 captures, all `--readonly`** (`node
scripts/dev-connect.mjs`, token never printed): 13 of Fuel at scrollTop 0
and every 874px step to 9,614 (one of them repeated for the first sweep);
1 at 620 (the cross-check and rotation); 2 more top-of-page sweep and
section-offset runs; 1 of yesterday's log reached through
`setFoodLogDate('2026-09-26')` (a `setState` plus a GET to
`/api/food-log?date=`, read in source before use); 3 with Pick it up open
(opened by clicking its row, whose handler is a `setState` plus GETs to
`/api/eat-out` and `/api/eat-out/fits`, read in source before use) at 480,
1,354 and 2,228; 3 of a recipe overlay opened only through
`App.openRecipe` (history push plus `setState`, no fetch) at 0, 874 and
the bottom; 1 in the `command` idiom. Nothing that logs, saves, deletes or
imports was tapped or evaluated. Every distinct position was read with
the Read tool; four captures that only repeat a position (the two extra
top-of-page measurement runs, the first top capture, and the clamped demo
bottom) were not re-read. Stills stay out of the repo (`/tmp/fuel/`).

**Sweeps.** Tap targets are elements with a React `onClick`,
`onPointerDown`, `onPointerUp`, `onTouchStart` or `onMouseDown` prop, plus
inputs, textareas, selects and labels, excluding file inputs and wrappers
whose only handler is `stopPropagation`; nested targets are counted (241
of the 312 sit inside another target, as the slot letters sit inside a
card). A first pass that used `cursor:pointer` counted 958, because the
cursor inherits to every text span, and was discarded. "Filled" is a
non-transparent computed background, a blunt test that includes chips.
Type sizes are the distinct computed `font-size` values of elements that
own a text node, plus inputs. A "card treatment" is a distinct signature of
radius, border and background among bordered elements at least 150×50 with
a radius of 10px or more.

**Blocked writes, every one recorded.** `--readonly` engaged on all 24 real
captures and never exited 3; the shots reported 50 blocked writes in total
(51 `shot: blocked` lines, one landing in teardown after its shot's
count). By endpoint: `POST /api/greet` ×22, `POST /api/notes/summary` ×20,
`POST /api/tts` ×4, `POST /api/conversation` ×3,
`POST /api/brief-state/greeted` ×2. The same five endpoints 02-inbox and
03-train recorded: the morning greeting and the notes-summary revisit,
firing on any screen. **Zero** were attributable to Fuel's own files: not
on load, not at any scroll position, not on the day switch, not on opening
Pick it up or a recipe.

**Not captured, and why.** A live log entry being edited, deleted or
relogged; a scan, a refine, the barcode scanner, the portion sheet on
screen, the add-recipe modal, the meal editor, the removal action sheet
and a tweak preview: each needs a write or a model call, so all are read
from source. The rotation card's 17-target count is from source, not the
sweep. Swipes and long-presses were not filmed. The overlay was
photographed in cupertino only.

**Inventory and checklist first-look notes, confirmed or corrected.**
- The dead day-chip picker: **confirmed** dead, and the locator
  **corrected**: the inventory's `:626-634` is now the quick-log rail; the
  checklist's `:540` is right (`:540-550`).
- Manual entry as five raw inputs: **confirmed** (`Recipes.jsx:782-789`),
  and widened in finding 9 to 31 hand-styled inputs across the five files.
- RecipeOverlay's hand-rolled removal sheet: **confirmed**, locator
  **corrected** from `:184-207` to `:200-221`.
- AddRecipeModal and RecipeOverlay hand-roll their dialog chrome:
  **confirmed**, and counted as four sheet mechanisms (finding 10).
- The macro colour convention applied consistently: **confirmed** for the
  macros; gold's other jobs are finding 12.
- Pick it up has "no plain-box patterns": **mostly confirmed**; it
  duplicates protein and composition inside each result and the
  missing-brand list across the panel (finding 11). Its hand-rolled
  `SkeletonRail` beside `src/Skeleton.jsx`'s `SkeletonCard`/`SkeletonList`:
  **confirmed** as drift; no comment says the shape needed its own.
- "The recipe grid never shows empty (falls back to the demo bank)":
  **confirmed**, and reclassified from a state note to an honesty finding
  (finding 13).
- U13's gold "undecided" on Nova's question: **confirmed** as the one
  earned use of gold on the page.

**Cleanup verified.** `node scripts/dev-connect.mjs --clean` removed
`public/_devconn.js`; `ls public/_devconn*.js` found nothing. The Vite
server on :5183 was stopped and the port confirmed free. `git status
--short` at the end shows only this file (and, if present, the other
agent's `design/mockups/58-redesign-train.html`, not touched here).
