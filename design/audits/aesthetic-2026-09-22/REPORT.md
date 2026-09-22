# Nova OS — aesthetic review, 22 September 2026

Reviewed against `design/NOVA-METHOD.md` §2b (rules 7, 8, 9), the standing
visual-first rule in `CLAUDE.md`, and the four installed design skills
(`apple-design`, `emil-design-eng`, `interface-design`, `animate`). Judged from
40 phone-size stills (402×874, DPR 2) in `shots/`, taken through
`scripts/shot.mjs` against the live dev server with the real vault connected —
cupertino (his phone) weighted higher, command sampled for the same surfaces.
Every finding cites a shot I looked at and a line I read. No product code was
changed; no git commands were run.

---

## 1 · Verdict

Nova is not bland everywhere — it is *excellent in about six places and a
spreadsheet in about twenty*, and the split is not random: wherever a surface
was built around a purpose-made object (the Voice core, the `93 READY` ring,
the muscle volume bars, the 7-day protein chart, the exercise body-map, the
serif news lines, the command idiom's BODY card) it genuinely reads like
Jarvis; wherever a surface was assembled out of generic parts it collapses into
a label on the left, a truncated string on the right, and a chevron. The
failure is systemic rather than per-screen, and it has three named causes. One:
a hand-rolled `btn()` helper is copy-pasted into **fourteen** files and has
already diverged (`src/TrainToday.jsx:15` vs `src/screens/Shopping.jsx:6`), so
`Controls.jsx` is being bypassed exactly as §2b rule 2 forbids, and **sixteen**
of those call sites fill the button with `var(--nv-gold)` — which makes gold,
the colour reserved for "not yet decided", the app's default commit colour on
Journal, Stash, Shopping, Settings, Code, Train, Money, Library and Inbox at
once. Two: the muscle palette exists, is tested, and is *read by only three
files* — so the one screen that names four muscles in a row
(`src/screens/Workouts.jsx:141`) paints them all cyan. Three: his Home ends in
six `FoldRow`s (`src/screens/MissionStructured.jsx:60`) that are, literally,
a rounded box with an uppercase label, one ellipsised line and a `▸` — the
single most-seen object in the product is the exact thing rule 7 was written
against, and the command idiom shows the *same* view model as a designed card
with a serif headline (`home-command-1700.jpg` vs `home-cupertino-1800.jpg`),
so his phone is getting the worse of the two skins. The motion layer, by
contrast, is in good shape and should be left alone: `Interactive` already
gives every pressable a `scale(.978)` at 160ms on the correct curve, the token
set is `--nv-ease: cubic-bezier(.32,.72,0,1)` with 160/280/440ms durations, the
screen transition is 140ms out / 280ms in, and `prefers-reduced-motion` and
`prefers-reduced-transparency` are both honoured. Fix the three systemic causes
and roughly two thirds of the findings below disappear with them.

---

## 2 · Findings, ranked by impact

Ordered by visible gain on *his phone* per hour of work. Before/After in the
format the `emil-design-eng` skill requires.

### 1 — Home's six fold rows are the rule-7 archetype
`Home · cupertino` · `home-cupertino-1800.jpg`, `home-cupertino-2700.jpg`

Six stacked boxes — `LEAD · TRY TODAY`, `SUGGESTED FOCUS`, `DAILY REVIEW`,
`NOVA NOTICED`, `SHORTCUTS`, `AGENTS` — identical height, identical fill,
uppercase label left, right-aligned ellipsised string, `▸`. Four of the six
truncate mid-word. This is the bottom half of his Home screen.

| Before | After | Why |
| --- | --- | --- |
| `src/screens/MissionStructured.jsx:60-70` — `FoldRow` renders `<span label>` + `<span status nowrap ellipsis>` + `▸`, `background:'var(--nv-glass)'`, `border:1px solid …ink 07%` | Give each fold key its own **glyph slot** (48px): `agents` → a 7-dot arc that lights the live ones; `review`/`noticed` → a count in the serif face; `focus` → a time-remaining arc; `lead` → an accent dot. Drop `whiteSpace:'nowrap'`, allow two lines. Stagger the six in at 40ms intervals. | §2b r7 — "a number is a ring, a gauge or a large serif numeral, never a bare digit in a cell". `interface-design`: monotone layouts (same card size, same gap, same density) "are the sound of no one deciding". |
| Same status line for all six, `color:'var(--nv-ink60)'` | The status line carries the section's own hue (agents cyan, focus gold only while undecided, review green when filed) | §2b r8 — colour means something |

### 2 — Gold is the app's default commit colour
`Journal · Stash · Shopping · Settings · Code · Train · Money · Library · Inbox — both idioms` · `journal-cupertino.jpg`, `stash-cupertino.jpg`, `shopping-cupertino.jpg`, `settings-cupertino.jpg`, `code-cupertino.jpg`, `inbox-cupertino.jpg`, `train-today-cupertino-800.jpg`, `library-cupertino.jpg`, `money-cupertino.jpg`

Nine different screens show a gold-filled primary button. Rule 8 reserves gold
for "not yet decided". On `todos-cupertino.jpg` every one of three rows carries
a gold `Stale` tag — a default fill persisting across a whole surface, named
explicitly in the rule.

| Before | After | Why |
| --- | --- | --- |
| 16 call sites of `btn('var(--nv-gold)', '#1a1322', …)` — `src/screens/Journal.jsx:42`, `src/screens/Stash.jsx:46`, `src/screens/Shopping.jsx:30`, `src/screens/Settings.jsx:133`, `src/screens/ClaudeCode.jsx:60` and `:98`, `src/screens/Workouts.jsx:248`, `:330`, `:920`, `src/TrainToday.jsx:93`, `:110`, `:152`, `:200`, `src/AddRecipeModal.jsx:151`, `src/RecipeOverlay.jsx:142`, `src/screens/Recipes.jsx:458` | Route all 16 through `Pill` (`src/AppleLayout.jsx:86`) at its default `tone='accent'`/`--nv-acc`. Keep gold for exactly two jobs: the **undecided** state of a proposal, and `Tag tone="gold"` on a genuinely unresolved item. | §2b r8 verbatim: gold is "not yet decided", "never a default fill that persists across a whole surface" |
| `'#1a1322'` hard-coded as the on-gold ink 16 times | `var(--nv-on-acc)` | §2b r4 — tokens only |
| `src/screens/Todos.jsx:80` — `{t.stale && <Tag tone="gold">Stale}` on every row | Drop the tag; express staleness as the age column's opacity plus a hairline gold left-edge that deepens with age. One item gold reads as a warning; three reads as wallpaper. | §2b r8; `interface-design` 60/30/10 — "colour is a scarce resource" |

### 3 — `btn()` is hand-rolled in 14 files and has already diverged
`every screen · both idioms` · `settings-cupertino.jpg`, `shopping-cupertino.jpg`, `code-cupertino.jpg`

Visible symptom: in one Settings viewport there are three different button
shapes — an 8px outlined rect (`Test connection`, `Disconnect`), a gold rect
(`Save & connect`), and full pills (`Set up`, `Set my numbers`).

| Before | After | Why |
| --- | --- | --- |
| `const btn = (bg, ink, extra) => …` defined independently in `src/TrainToday.jsx:15`, `src/AddRecipeModal.jsx:6`, `src/RecipeOverlay.jsx:9`, `src/screens/{Money,Ops,Journal,Workouts,Todos,Stash,Shopping,Settings,ClaudeCode,Notes,Recipes}.jsx` — 14 copies. TrainToday: `padding:'11px 20px'`, radius `999px / 12px`. Shopping: `padding:'10px 18px'`, radius `999px / 8px`. | One exported `Button` in `src/Controls.jsx` with `tone` = `accent \| quiet \| warn \| undecided`; delete the 14 locals. Command branch: one radius (12px), one micro font token. | §2b r2 — "Every label and action through `Controls.jsx` — never a hand-rolled … chip again". `interface-design` "Use What Exists": hand-rolling beside the real component "is the same failure" every time. |

### 4 — Muscles are painted cyan on the one screen that names four of them
`Train · Gym — both idioms` · `train-gym-cupertino.jpg`

`SHOULDERS ×3` `CHEST ×2` `TRICEPS ×2` `BACK ×1` — four muscle chips, one
colour. Two screens away, `train-today-cupertino-800.jpg` shows the volume bars
doing it correctly (Triceps violet, Back teal, Shoulders gold, Biceps green).

| Before | After | Why |
| --- | --- | --- |
| `src/screens/Workouts.jsx:141` — `<Tag key={t.muscle} tone="cyan">{t.muscle} ×{t.count}</Tag>` | `<Tag style={{ color: muscleVar(t.muscle), borderColor: … }}>` using `muscleVar` from `src/muscleHue.js:78`; the count set in the serif face | §2b r8 — "each muscle owns its hue (the same map the 3D figure and the volume bars use)" |
| `src/screens/Workouts.jsx:356` — `tone="color-mix(in srgb, var(--nv-cy) 70%, transparent)"` on `targetsLine` | Render `targetsLine` as coloured segments, one per muscle, from the same map | same |
| Only `Body3D.jsx`, `BodyMap.jsx`, `Instruments.jsx`, `TrainToday.jsx` import `muscleVar` | Every surface that names a muscle imports it | `nova-visual-first-rule`: "apply the muscle palette across the platform so it's always in sync" |

### 5 — The exercise card dumps six weeks of progression as mono text
`Exercise sheet · cupertino` · `exercise-card-cupertino.jpg`

`09-15 25×7@10 25×7@10 25×7@10` … six such rows. The data shows a clean
22.5kg→25kg progression over six sessions and the card says nothing about it.
The weight column does not even align between rows (leading spaces in the
string, no `tabular-nums`).

| Before | After | Why |
| --- | --- | --- |
| Six mono lines, `date` + concatenated `w×r@rpe` triplets, unaligned | A **load rail**: one row per session, three stacked set-bars whose height is reps and whose fill saturation is RPE, in the muscle's hue; the weight as a large serif numeral on the row; the PR session ringed. `font-variant-numeric: tabular-nums` throughout. | §2b r7 — "a list of sessions is a rail with depth and material, never a grid of equal boxes"; the whole point of the card is *is it moving?* |
| `PULLING UP DUMBBELL SHOULDER PRESS (SINGLE ARM)…` as the loading state — a bare uppercase mono line in an otherwise empty sheet that then grows from ~25% to ~60% height | Open the sheet at its final height with a skeleton of the real layout (body-map block, cue line, rail rows) | `emil-design-eng`: "elements appearing or disappearing without transition feel broken"; a height jump on arrival is a jarring change |
| Sheet grabber sits at `x≈33`, left-aligned | Centre it | `apple-design` §16 Craft — "misaligned icons … read as carelessness" |
| Title is a two-line uppercase mono string ending in an orphan `·` | The serif news line | §2b r7 — "a headline is the serif news line … never a mono label in a corner" |

### 6 — Two of the four floating voice layers are flat opaque boxes
`every screen · cupertino` · `home-cupertino-900.jpg`, `library-cupertino.jpg`, `code-cupertino.jpg`

The `TAP TO HEAR` strip and the `EVIDENCE` strip park over the middle of
whatever screen is open, with a hard 1px border and **no** backdrop filter,
while the pop-up directly below them in the same component is proper glass with
a bright inset top edge.

| Before | After | Why |
| --- | --- | --- |
| `src/VoicePresence.jsx:87` — `background:color-mix(in srgb, var(--nv-void) 92%, black)`, `border:1px solid …warn 55%`, no blur; same at `:126` for EVIDENCE | Match `:138`: `backdrop-filter:blur(16px)`, a gradient wash, an `inset 0 1px 0 …22%` bright top edge, and a soft shadow instead of a hard border | `apple-design` §12 — material weight encodes hierarchy; "scroll edge effects, not hard dividers"; never a flat box where the system uses glass |
| `animation:popIn var(--nv-dur-base)` — opacity + `translateY` + `scale(.965)` | Add `filter: blur(6px)→0` over the same 280ms so the glass *materialises* | `apple-design` §12 — "Materialize, don't just fade" |
| The strip persists with no dismiss while `speechBlocked` is set | Auto-retire after ~12s, or give it an `×` | `apple-design` §16 Agency |

### 7 — To-Do squeezes the title to ~140px and breaks words mid-character
`To-Do · cupertino` · `todos-cupertino.jpg`

`swipe verificatio / n item`. A pasted YouTube URL wraps to nine lines. Three
`flex:'none'` siblings eat ~230px of a 370px row.

| Before | After | Why |
| --- | --- | --- |
| `src/screens/Todos.jsx:70` — title `flex:1;min-width:0;overflow-wrap:anywhere`, followed by `flex:'none'` category action (`:77`), gold `Stale` tag (`:80`) and age `Meta` (`:81`) | Stack: title on its own full-width line at `font:500 15px`, then one meta line (category · age) at `--nv-micro-s` beneath it. Reserve `overflow-wrap:anywhere` for URLs only (`word-break:break-word`). | §2b r6 — "stack columns on mobile rather than squeezing a paragraph into a nine-word-tall gutter" |
| A URL rendered raw across nine lines | Render a pasted link as a link chip (host + favicon dot), not the query string | §2b r7 |

### 8 — Train · Coach is two empty boxes and 600px of void
`Train · Coach — both idioms` · `train-coach-cupertino.jpg`, `train-coach-command.jpg`

The `GOALS` card is an eyebrow, a headline, two prose lines and a mono meta
line. Nothing on the screen has a form. Below the composer, ~600px of nothing.

| Before | After | Why |
| --- | --- | --- |
| `GOALS` — plain card, prose only. It literally names "triceps, biceps, shoulders" as priority muscles and colours none of them | A goal *instrument*: `4 DAYS/WEEK` as a 7-cell week rail with the four training days lit; the three priority muscles as chips in their own hues via `muscleVar`; "updated 2026-09-03" as a quiet age dot | §2b r7 + r8 |
| Chip case is mixed — `src/vals/valsWorkouts.js:78-83` pushes `WHY IS … STALLED?`, `ADD … VOLUME`, `PLAN TODAY'S …`, `REVIEW MY WEEK` as ALL-CAPS literals, while `src/screens/Workouts.jsx:1013` renders `Bring a study` in sentence case | Sentence case in the vals for all five; let Command's CSS uppercase | §2b r3 verbatim — "an ALL-CAPS literal handed to `Meta` renders literally and is a smell" |
| 600px of void under the composer | The last three coach exchanges as a rail, or the week's volume instrument repeated small | `interface-design` — one focal point, then real air, not dead air |

### 9 — Ops' agent dial is unreadable at 402px
`Ops · cupertino` · `ops-cupertino.jpg`

Roughly forty agent labels plus forty `ran today` sublabels laid on a circle
inside a 370px column. Every label overlaps at least one neighbour; the screen
title `XIV. OPERATIONS` is also hidden behind the top bar.

| Before | After | Why |
| --- | --- | --- |
| Radial label ring at phone width | Below ~520px, drop the labels off the ring entirely: keep the dial as a ring of dots (hue = health, brightness = ran-today) and put the names in a scrollable rail beneath it, tapping a dot to scroll the rail | §2b r6 and r9 — "It must survive 375px … verify by measuring `scrollWidth`, not by eye" |
| Screen head occluded by the chrome | Add the standard `calc(48px + env(safe-area-inset-top))` top padding this screen is missing | §2b r9 |

### 10 — Settings renders Nova's trust history as 17 grey bullets
`Settings · cupertino` · `settings-cupertino-900.jpg`

"Acts on Daily Reviews — kept 24 of 30", "Acts on morning briefs — kept 52 of
63" … seventeen lines, ~900px tall. Seventeen ratios, zero forms. The most
literal spreadsheet-as-prose in the app, and it is the data that decides what
Nova is allowed to do on its own.

| Before | After | Why |
| --- | --- | --- |
| 17 `·`-bulleted sentences at `--nv-ink60` | A **trust ladder**: one row per lane, a horizontal kept/dismissed bar (green kept, warn dismissed), the ratio as a serif numerator, sorted by volume, with the two "worth easing off" lanes pulled to the top and flagged | §2b r7; `interface-design` worked example — a label and a figure at the same size is flat; a figure at 28/600 with a demoted label leads |
| Design-style radio cards are plain boxes describing each skin in words | Show a 60px live preview of each skin | `apple-design` §16 Familiarity/Craft — show, don't describe |

### 11 — Notes clips a wall of 18 identical chips mid-row
`Notes · cupertino` · `notes-cupertino.jpg`

Eighteen cyan filter chips wrap into six rows; the container's max-height
slices row six horizontally through the glyphs (`Topic`, `Plan`, `Book`,
`Library` cut in half). No fade, no "more", no scroll affordance.

| Before | After | Why |
| --- | --- | --- |
| Wrapping chip wall with a hard `overflow:hidden` clip | One horizontally scrolling rail with a right-edge gradient mask, ordered by note count, with the count inside each chip | §2b r7 (rail, not grid); `apple-design` §12 — edge fade, never a hard cut |
| All 18 chips `tone="cyan"` | Type-coded: vault-type chips take a hue family; the active one alone takes `--nv-acc` | §2b r8 |

### 12 — The PR rail hard-clips its third card mid-word
`Train · Today · cupertino` · `train-today-cupertino.jpg`, `train-today-cupertino-800.jpg`

`Sp…` / `no…` / `Co…` — the third card is sliced vertically by the viewport
edge with no peek treatment, and the cards have unequal heights.

| Before | After | Why |
| --- | --- | --- |
| Horizontal scroller, no mask, variable card height, gold border on every card | Fixed card height, `scroll-snap-type:x mandatory` with `scroll-padding-left:16px`, a right-edge gradient mask, and the border in the **lifted muscle's hue** rather than gold | `apple-design` §12; §2b r8 |
| `FOCUS FOR TODAY` — a gold-bordered box holding a 5-line paragraph | The `+1 rep earned` verdict as a serif figure with a rep-bar, the reasoning demoted to `--nv-ink60` beneath | §2b r7 |

### 13 — Decisions are still a button per idea
`Train · Today, Inbox · both idioms` · `train-today-cupertino-800.jpg`, `inbox-cupertino-900b.jpg`

`Do it` (gold) / `Discuss it` / `Not this`; `Approve & file` (gold) /
`Discard`. Rule 8's second half asks for a light tick or cross per item, one
"do all", and conversation.

| Before | After | Why |
| --- | --- | --- |
| Three full-size labelled buttons per proposal | A ✓ and a ✗ at the item, one `Do all N` at the group head, and the composer always present so he can argue instead of choosing | §2b r8 verbatim — "a review must not be a button per idea … he TALKS" |
| The card simply vanishes on accept | Act the change out: strike the old line, slide the new one into its place, tick the count down | §2b r7 — "a change is ACTED OUT … never stated" |

### 14 — Journal is an archive of his days rendered as a date table
`Journal · cupertino` · `journal-cupertino.jpg`

Six identical pills: ISO date, truncated title, `N entries ▼`. Today's row is
indistinguishable from one a week old.

| Before | After | Why |
| --- | --- | --- |
| `2026-09-22` as the lead element, mono | `Tue 22 Sep` in the serif face, today's row larger and accented | §2b r7; `apple-design` §15 — hierarchy from weight + size together |
| `3 entries` / `8 entries` as bare text | A density row of dots (one per entry) so the month's rhythm is visible down the list | §2b r7 |
| `▼` raw unicode | The house chevron | §2b r2 |
| `Save entry` gold (`src/screens/Journal.jsx:42`) | `Pill` at `--nv-acc` | §2b r8 |

### 15 — Fuel's hero ring is solid at zero where Home's is dashed
`Fuel · cupertino` · `fuel-cupertino.jpg` vs `home-cupertino-1800.jpg`

Protein is `0 of 150` and draws a solid dim ring; the SLEEP ring on Home
correctly draws a dashed one for the same "no data" condition.

| Before | After | Why |
| --- | --- | --- |
| Solid dim ring at 0 | Dashed ring, same as `RingTile`'s gap state | §2b r2 — "a gap is a *dashed* ring, never a zero" |
| `Calories 0 / 2,200` and `Carbs · Fat  0C · 0F` as a two-row label/value table beside the ring | Two thin concentric arcs inside the same ring, one per macro, in their own hues | §2b r7 |
| `TRAINING × FUEL — CROSS-CHECK` — a violet box holding a 5-line paragraph whose payload is "2668 vs 2065 kcal, 603 apart" | Two opposed bars with the 603 gap called out in the serif face, prose demoted underneath | §2b r7 |
| `TODAY'S ROTATION — TAP TO EAT · ‹ › TO SWITCH · HOLD FOR MORE` — an instruction manual set as an uppercase mono label wrapping to two lines | A short `Eyebrow` plus real affordances (visible arrows, a peeking next card) | `apple-design` §16 — "If you need a label to explain a control, the mapping is weak" |
| Date chips wrap into two rows (`For Today / Yst / Sun 20 / Sat 19` // `Fri 18 / Thu 17 / Wed 16`) | One scrolling rail | §2b r6 |

### 16 — Stash and Library repeat one action pill down the whole list
`Stash, Library · cupertino` · `stash-cupertino.jpg`, `library-cupertino.jpg`

Eight `Open ↗` pills and eight `×` glyphs stacked in a column; every row
identical, hard hairline dividers, no material.

| Before | After | Why |
| --- | --- | --- |
| Per-row `Open ↗` pill | Make the whole row the tap target (it already has `Interactive`'s press feedback); keep `×` as a swipe action | `interface-design` — hierarchy through space and weight, not repeated controls |
| Library cover titles set in serif directly over the artwork | A bottom gradient scrim under the title block | `apple-design` §12 vibrancy — text over changing backgrounds needs contrast, not flat overlay |
| Library search input renders `Search the` clipped mid-placeholder | Give the input `flex:1;min-width:0` and shorten the placeholder to `Search` | §2b r6 |

### 17 — Train's header meta runs to the screen edge
`Train · cupertino` · `train-today-cupertino.jpg`, `train-gym-cupertino.jpg`, `train-coach-cupertino.jpg`

`● 4 routines · live from Obsidian` — the final `n` sits on x=771 of 804
(16px gutter consumed). Same on Notes, Stash, Inbox, Money.

| Before | After | Why |
| --- | --- | --- |
| Screen-head right meta with no right inset and no truncation | `minWidth:0` + `text-overflow:ellipsis` on the meta, and the 16px page gutter respected | §2b r6 |

### 18 — The "Workout in progress" banner covers the screen head
`Inbox · command` · `inbox-command.jpg`

The resume banner is pinned over the top of the content and hides `SELF ·
INBOX` and half the serif headline.

| Before | After | Why |
| --- | --- | --- |
| Fixed banner with no scroll-offset compensation on the page below | Either push the page down by the banner height, or dock the banner to the bottom above the tab bar where the voice layers already live | `apple-design` §16 Wayfinding — never hide "where am I" |

### 19 — The briefs row drops a raw `<select>` into a designed surface
`Inbox · cupertino` · `inbox-cupertino-900b.jpg`

`08:00 ⌄` / `07:00 ⌄` / `21:00 ⌄` render as OS-default selects with a hard 1px
border, beside hand-styled `Off / Draft / Auto` pills, and wrap onto their own
line so the row rhythm breaks.

| Before | After | Why |
| --- | --- | --- |
| Unstyled native `<select>` | Keep the native element for accessibility but style it to match `Pill` (radius 999px, `--nv-well`, house chevron, `appearance:none`), and keep time + segment on one line | `interface-design` "Controls: native → primitive → hand-roll" — keep native, but it must look like the system it is in |

### 20 — Briefing's empty state is a paragraph on a void
`Briefing · cupertino` · `briefing-cupertino.jpg`

A `BRIEFING` eyebrow pushed under the top bar (it sits at y=95 where every
other screen starts at 111), one paragraph, one link, then ~1400px of nothing.

| Before | After | Why |
| --- | --- | --- |
| Text-only empty state | The house top padding, the serif news line, a dim standing instrument (the beat rail at rest), and two or three real starter phrasings as chips | §2b r7 — a screen that would look the same as its data is not finished; `interface-design` — empty states are where defaults show hardest |

### 21 — The rings row overflows its own numerals
`Home · both idioms` · `home-cupertino-1800.jpg`, `home-command-1700.jpg`

`10,071` is wider than the ring it sits inside; the glyphs cross the stroke on
both left and right.

| Before | After | Why |
| --- | --- | --- |
| Full step count inside a 4-up ring at 402px | Abbreviate inside the ring (`10.1k`) and keep the full figure in the label beneath, or drop to a 3-up row on phones | §2b r6 |

### 22 — Home's vitals grid is eight metrics with no focal point
`Home · cupertino` · `home-cupertino-1800.jpg`

Steps pink, weight gold, HRV cyan, resting HR pink, protein violet, eaten
green — six hues, no stated system, two of them (gold on weight, pink on two
unrelated metrics) actively misleading under rule 8. All eight tiles are the
same size.

| Before | After | Why |
| --- | --- | --- |
| Eight equal tiles, six ad-hoc hues | Name the system: one hue per *domain* (body / fuel / recovery / activity), held everywhere. Promote the day's one most-actionable metric to double width with a trend sparkline; demote the rest. Weight must not be gold. | §2b r8; `interface-design` "One focal point per view" — "when everything competes equally, nothing wins" |

---

## 3 · Keep — already right

1. **The Voice screen.** `voice-cupertino.jpg` — the core, the concentric
   dashed rings, the mono clock, and the `STATION · STATUS` panel whose rows
   carry their own progress underline. This is the Jarvis reference already
   shipped. Do not touch it.
2. **`RingTile` and the `93 READY` ring.** `train-today-cupertino.jpg` — the
   bloom, the arc, the dashed gap state on Home's SLEEP ring. The house object
   works; the problem elsewhere is that it is not used, not that it is wrong.
3. **The muscle volume bars.** `train-today-cupertino-800.jpg` — Triceps
   violet, Back teal, Shoulders gold, Biceps green, each from `--nv-m-*`. This
   is exactly what rule 8 asks for, and it is the model the rest of the
   platform should copy.
4. **The 7-day protein chart.** `fuel-cupertino.jpg` — real bars, a dashed
   floor line, today's column ringed and excluded from the count, an honest
   "Today is still open" note. Information with a form, and honest.
5. **The press/motion layer.** `src/Interactive.jsx:106` gives every pressable
   `scale(.978)` over 160ms on `cubic-bezier(.32,.72,0,1)`; `src/index.css:175`
   defines `--nv-ease` as the Ionic drawer curve with 160/280/440ms durations;
   the screen transition is 140ms out / 280ms in (`src/index.css:930`). Every
   value sits inside the `emil-design-eng` and `apple-design` tables, and
   `prefers-reduced-motion` *and* `prefers-reduced-transparency` are both
   handled. No motion findings below the component level.
6. **The serif news lines.** `Train, your way.` · `Shop once, cleanly.` ·
   `Drop the thought, Nova files it.` · `Everything you know, connected.` —
   the one typographic idea that is unmistakably Nova's.
7. **The exercise card's body map.** `exercise-card-cupertino.jpg` — front and
   back silhouettes with the worked muscles lit from `--nv-m-*`, and
   `Turn it in 3D`. The right half of that card is finished; only the history
   rail below it is not.
8. **The sheet scrim.** The exercise sheet dims and blurs what is behind it —
   `apple-design` §12 "dim to focus", done correctly.
9. **The command idiom's BODY card.** `home-command-1700.jpg` — corner
   brackets, rings *and* the metric grid in one bounded object. Proof that the
   view model already carries enough to draw a real card; the cupertino side
   just isn't drawing one.

---

## 4 · Build plan

Six sessions, ordered by visible gain on his phone per hour. Each names the
files it touches; sessions A–C are the systemic ones and remove most of the
table above as a side effect.

**Session A — one button, one accent** (~2h) · removes findings 2, 3, and half
of 14, 16, 19.
`src/Controls.jsx` (add `Button`), then delete the local `btn` from
`src/TrainToday.jsx`, `src/AddRecipeModal.jsx`, `src/RecipeOverlay.jsx`,
`src/screens/{Money,Ops,Journal,Workouts,Todos,Stash,Shopping,Settings,ClaudeCode,Notes,Recipes}.jsx`
and repoint all 16 gold call sites to `--nv-acc`. Drop the gold `Stale` tag at
`src/screens/Todos.jsx:80`. Biggest single visual change for the least risk:
nine screens stop shouting "undecided" at him.

**Session B — the fold rows become instruments** (~3h) · finding 1.
`src/screens/MissionStructured.jsx` (`FoldRow`, ~line 60), `src/missionFold.js`
(add a `glyph` per key beside `FOLD_LABELS`), `src/Controls.jsx`. This is the
bottom half of the screen he opens every morning.

**Session C — the muscle palette everywhere** (~2h) · findings 4, 8 (partial),
12 (partial).
`src/screens/Workouts.jsx:141` and `:356`, `src/vals/valsWorkouts.js:78-83`
(sentence case), `src/screens/Workouts.jsx:1013`. Extend
`server/test/muscleHue.test.js`'s guarantee with a frontend check that a
literal muscle name rendered with `--nv-cy` fails.

**Session D — the 402px faults** (~2.5h) · findings 7, 9, 11, 16 (search
input), 17, 18, 21.
`src/screens/Todos.jsx:70-81`, `src/screens/Ops.jsx` (dial responsive
breakpoint + top padding), `src/screens/Notes.jsx` (chip rail + mask),
`src/screens/Library.jsx` (search `minWidth`), the shared screen-head meta,
and the workout-resume banner offset. Every one of these is a thing he can
currently see broken.

**Session E — the two data dumps** (~3h) · findings 5 and 10.
`src/ExerciseSheet.jsx` (the load rail, the skeleton, the centred grabber, the
serif title) and `src/screens/Settings.jsx` (the trust ladder). The two places
where the most valuable data in the product is presented as plain text.

**Session F — Fuel, Coach and the empty states** (~3h) · findings 8, 13, 15,
20, 22.
`src/screens/Recipes.jsx` (dashed zero ring, macro arcs, cross-check bars,
date rail), `src/screens/Workouts.jsx` Coach tab (goal instrument, the void),
`src/screens/Briefing.jsx` (top padding + standing instrument),
`src/vals/valsMission.js` + `src/screens/MissionStructured.jsx` (vitals hue
system and focal metric), and the tick/cross decision pattern in
`src/TrainToday.jsx` and `src/screens/Inbox.jsx`.

---

## 5 · Method notes and what was not verified

- 40 stills, `402×874` at DPR 2, from `scripts/shot.mjs` against the live dev
  server on `:5183` with the real vault connected. Cupertino for every screen;
  command for Home (×3), Train Today, Train Coach, Fuel, Inbox and Voice.
- Three command-idiom shots (To-Do, Journal, the exercise sheet) were lost when
  the dev server went down mid-run — `todos-command.jpg` and its two siblings
  captured `ERR_CONNECTION_REFUSED` and were deleted rather than kept as
  evidence. The command findings above therefore rest on the seven command
  shots that did land. The seed file was restored to `cupertino` afterwards.
- **Not a finding:** several shots caught two screens cross-faded over each
  other (`money-cupertino` and `inbox-cupertino` on the first pass). I checked
  the cause before reporting it: `src/index.css:930-936` sets the transition at
  140ms out / 280ms in, well inside budget. The overlap is headless Chrome
  under SwiftShader running the View Transition slowly, not a product fault.
  Re-shot with a longer settle and it is clean.
- **Not verified:** nothing here was checked on his actual iPhone, only at
  iPhone metrics in headless Chrome. The `TAP TO HEAR` strip is on screen in
  these shots because headless Chrome blocks autoplay audio — on his phone it
  is transient. The *material* fault in finding 6 is real regardless of how
  long it is up.
