# 01 · Home — audit, 26 Sep 2026

The first page of the redesign (`design/REDESIGN-CHECKLIST.md`, his call:
"Start with home"). Judged from two screen recordings he took on his phone
at 15:40 AEST on Saturday 26 Sep (1206×2622 @3x, so an iPhone 17 Pro /
16 Pro class 402×874 pt screen, the cupertino idiom, the "day" section
order, every section unfolded): 42 frames at 2 fps covering the whole scroll
top to bottom. Read under `apple-hig-review`, `apple-design`,
`emil-design-eng` and `interface-design`, with the HIG pages named in each
citation open beside the frames. Source locators come from
`00-inventory-a-home-chrome.md` and were re-read for every finding below.

Verified means seen in the frames or read in the source. Unverified means
it needs a measurement the frames cannot give (a contrast ratio, a point
size, a scrollHeight) and says so.

---

## 1 · Verdict

**Needs work.** Home has strong pieces and no shape. The greeting and its
serif standfirst are the best opening in the app; the calendar rows, the
days-rings on Stuck, the vitals rings and the Practice lamps are real
objects. But the page he actually scrolls is about twenty phone screens
deep, with nineteen sections all open, twenty-two buttons (seven of them
filled primary), seven border hues, roughly fifty-seven lines of body copy,
and the same facts restated up to six times by sections written at
different hours that do not know about each other. The fold system built
on 23 Sep to tame this remembers "open" forever, so on his phone it has
folded nothing: twelve right-aligned "▴ Fold" labels are the only trace of
it. Home's thesis is stated in the code ("the day's living status plus
whatever needs his yes/no right now") and the page does not deliver it: the
status read (the "hero" paragraph with Engage) sits tenth, behind the
record, the landed list, the technique, the working list, the focus, the
lead, the practice row, the one thing, the top three, the stuck three, the
calendar and the deck.

The one thing Home would be remembered by today is the greeting. The
redesign's job is to give it a second: one read of the day, with one act,
and everything else a tap away and returning folded.

### Clutter numbers, as it stands (checklist §3)

| Test | Home today | Target |
| --- | --- | --- |
| Focal point | None. The status read is section 10 of 19 | One, first |
| Sections open | 19 of 19 (all remembered open) | 3 to 4 |
| Screens deep at 402×874 | ~20 (42 frames of a full scroll; measure with `scripts/probe.mjs`) | ≤ 4 before the index |
| Buttons on the page | 22 (7 filled primary: I tried it, Done, Start it with me ×3, Draft, Engage) | 1 primary above the fold; 1 per open card |
| "Noted" buttons | 2 in the first screen and a half | 0 (a card that has been seen stands down) |
| Border / accent hues in one scroll | 7 (pink, green, gold, violet, cyan, orange, red) | Ink + one accent + the section's own hue on its instrument |
| Jobs gold is doing | 9 (waiting pill, Lead border, One Thing border, 4d ring, HEALTH tags ×7, MORNING/EVENING tags, streak, Inbox badge, "happening now") | 1: undecided (§2b rule 8) |
| Facts restated | protein ×6, HRV ×5, Leg Day ×4, "7 agents live" ×2 | Each fact once, in its instrument |
| Lines of body copy | ~57 (Noticed 18, Technique 12, Lead 9, hero 8, Review 10) | ≤ 8 above the index; prose one tap deep |
| Distinct type sizes | ≥ 9 | ≤ 4 + numerals |
| "▴ Fold" labels | 12 | 0 visible |
| Tap floor | Pills ≥ 44 pt; text actions ~32 pt (Controls `TextAction` gives 40–44 pt hit areas); tile micro-lines are display, not controls | Unchanged |
| scrollWidth | Not measured (no horizontal scroll seen in any frame) | 402 |

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 — The page has no shape: nineteen sections, all open, twenty screens deep
`vid2 frame 0001 → vid1 frame 0024` (the whole scroll)

Every section shows the "▴ Fold" action, which means every section is
open. `missionFold.js` opens the first two present sections plus the three
never-fold ones by default (`defaultFolds`, `:29-38`), then `loadFolds()`
(`:194-200`) restores whatever he last did from `localStorage.novaos.mcFold`,
and `resolveFolds(present, remembered)` lets the memory beat the hour
(`MissionStructured.jsx:793`). Once a section has been opened it stays
open on every visit until he folds it by hand. The result is a page whose
default state is "everything".

| Before | After | Why |
| --- | --- | --- |
| `MissionStructured.jsx:791-811`: every present section renders in full, then a right-aligned `▴ Fold` `TextAction`; fold state remembered forever | Home opens on ONE read (the status paragraph, rebuilt as the hero) and ONE act; every other section is an instrument row (glyph + one line + the number) that opens in place and **closes again on the next visit** (remember for the day, not forever); no visible Fold label, the row's header is the fold | `layout.md › Best practices`: "Make essential information easy to find by giving it sufficient space. People want to view the most important information right away, so don't obscure it by crowding it with nonessential details." `layout.md › Visual hierarchy`: "Take advantage of progressive disclosure to help people discover content that's currently hidden." `interface-design`: one focal point per view. |
| The "hero" (core + status read + Engage) is section 10 in the day order (`ORDERS.day`, `MissionStructured.jsx:44`) | The read leads in every hour; the hour changes what the read says, not where it sits | Home's own thesis (`00-inventory-a-home-chrome.md`, Purpose). §2b rule 7: the serif news line carries the news. |

### 2 — Sections written at different hours contradict each other on one screen
`vid1 frames 0007-0014` (hero, vitals, Noticed), `vid2 frames 0016-0020` (One Thing, Landed)

The hero says "HRV 71.3 ms, resting 52 bpm (yesterday's data). This
morning: Leg Day." The vitals tile says HRV 71.3 MS · YESTERDAY. The One
Thing says "Run Leg Day at 08:30 … HRV is down 13% vs your 7-day average
this morning" with Done / Skip live at 15:40. Nova Noticed's EVENING
paragraph says "HRV came in at 52.9ms this morning … the lowest reading of
the week". The LANDED card, two screens above, says today's filed session
was "Session — Upper Body — m…" (the make-up). So at 15:40 Home tells him
to run Leg Day at 08:30, shows two different HRV figures for "this
morning" without a date on either paragraph, and has already filed a
different session as done. Nothing is false in isolation; the page does
not reconcile itself.

| Before | After | Why |
| --- | --- | --- |
| Six sections each compose their own sentence about protein (ring, tile, hero, Noticed ×2, Top 3) and five about HRV | Each fact lives in exactly one instrument (the ring for protein, the recovery gauge for HRV) and every prose section links to the instrument instead of restating the number | `color.md`/`interface-design` restraint; his brief: "less cluttered … whilst still maintaining the functionality". Repetition is the clutter. |
| `plan-today`'s One Thing stays live with Done / Skip after its time has passed and after a different session was filed (`missionFocus.pickOneThing`, `:16-23`) | An act whose hour has passed changes state: "08:30 came and went · you did Upper Body instead" with one quiet verb (Mark it / Move it), or it stands down once the log shows a session | §2b rule 7: "a change is ACTED OUT … never stated". `feedback` principle: status is exposed, not asserted. |
| Nova Noticed's MORNING / EVENING paragraphs carry no timestamp; "this morning" means yesterday morning | Each insight carries its hour ("06:10 yesterday") and is one headline line with the changed number in the section's hue; the paragraph opens on tap | Honest degradation (NOVA-METHOD): stale data self-labels. |

### 3 — Twenty-two buttons; three identical primary pills in a row; "Noted" twice
`vid1 frames 0001-0003` (Stuck ×3), `vid2 frames 0001-0004` (Record, Landed, Technique)

Stuck renders three cards each with a full-width cyan "Start it with me"
pill plus "Not now" and "Let it go" (`StuckCard.jsx:81-119`): nine verbs
for three items, three of them the same prominent button. The first screen
and a half carries See the block · Noted · Open the Inbox · Noted · I tried
it · Not today: six buttons before any of the day's content, two of them
the same word.

| Before | After | Why |
| --- | --- | --- |
| `StuckCard.jsx:81-119`: primary pill + two text actions per item, ×3 | The list is three swipe rows (right = start, left = let it go, the house `SwipeRow`), the top item alone carries one pill; or one card, one "Start the oldest with me", the other two as rows | `liquid-glass.md › Review checklist 4` (citing `buttons.md`): "One, at most two, tinted primary actions per view, never a row of them." §2b rule 8: "a review must not be a button per idea". |
| Record and Landed each end in a pill pair including `Noted` (`MissionStructured.jsx:617-647, 692-720`) | A moment card has no dismiss button: it stands down once seen (it already does, `landedMoment` "stands down once seen") and the record's "See the block" is the card's tap target | `accessibility.md › Cognitive`: "Keep actions simple … minimize complexity". Two identical verbs in one view is a decision asked twice. |
| Seven filled primaries in one scroll (I tried it, Done, Start it with me ×3, Draft, Engage) | One filled primary above the index (the read's act); open cards use the quiet pill | `interface-design` 60/30/10: colour is a scarce resource. |

### 4 — Colour is saying nine things with one hue, and the accent is on text
`every frame`

Gold appears on the waiting pill's border and dot, the LEAD card border,
THE ONE THING border, the 4d stuck ring, seven HEALTH calendar tags, the
MORNING and EVENING insight tags, the 4-session streak pill, the Inbox
badge (15) and the italic "happening now". §2b rule 8 reserves gold for
"not yet decided". Cyan (the accent) fills the primary pills and also
colours HRV 71.3 MS, RESTING HR 52 BPM, the "NOVA IS WORKING" label, "Next
14 days ›", the live calendar row, and "Seen in your log": interactive and
non-interactive in the same hue. Pink borders both the record and the
technique and colours the weight figure. Seven hues of border go by in one
scroll.

| Before | After | Why |
| --- | --- | --- |
| Gold on nine jobs | Gold only where a decision is pending (the One Thing while undecided; a proposal). Calendar categories lose the tag when every row shares it (see 8); streaks and the badge take the ink or the good hue; MORNING/EVENING become time stamps in ink | `color.md › Best practices`: "Avoid using the same color to mean different things. Use color consistently … especially when you use it to help communicate information like status or interactivity." |
| Cyan on HRV / RHR values, section labels and links, and on the primary pills | Values in ink (weight carried by size and weight, `interface-design` type levers); cyan only on what can be tapped and on the live marker | `color.md › Best practices`: "if you use your brand color to indicate that a borderless button is interactive, using the same or similar color to stylize noninteractive text is confusing." |
| Seven coloured 1px card borders (`MissionControl`/`MissionStructured` moment cards, Lead, One Thing, Review) | Cards are fills with the section's hue on its instrument only (the ring, the glyph, the number); borders reserved for the one undecided card | `interface-design`: "Hierarchy through space and weight, not lines … The most premium interfaces are mostly invisible structure." |

### 5 — Text truncates mid-word in the new cards
`vid2 frames 0001-0006` (LANDED, Record)

LANDED rows cut both columns: "Session — Upper Body — m… · Journal —
2026-09-2…", "Disarming Disrespect and In… · Wiki/Practice/Disarmi…",
"Coach: retarget Cable Later… · Train — retargeted Ca…". The record card
cuts the lift: "Chest-Supported Dum…". Every row on the card is
unreadable at the point that matters (which session, filed where).

| Before | After | Why |
| --- | --- | --- |
| `MissionStructured.jsx:692-720`: title `nowrap` + ellipsis in a 55% column, destination `nowrap` + ellipsis in the rest | One line per item with the title wrapping to two lines if needed; the destination as a short `Tag` (Journal · Practice · Train), never a path; the full path on tap | `lists-and-tables.md › Content`: "Keep item text succinct so row content is comfortable to read. Short, succinct text can help minimize truncation" and "Consider ways to preserve readability of text that might otherwise get clipped or truncated." 22 Sep report #1 was this exact fault on the fold rows. |
| Lift name ellipsised to "Chest-Supported Dum…" (`:617-647`) | Two lines for the lift name; the figures (32.5kg × 10) on their own line | Same. The record is the news; the name of the lift is the news. |

### 6 — The vitals ring labels run into each other
`vid1 frames 0009-0014`

Under the four rings the labels read "PROTEIN · 27% STEPS · 100%   SLEEP
READY · 0%": the first two labels are wider than their quarter columns and
merge. The grid is `repeat(4, 1fr)` with a 6px gap and 56px rings on the
phone (`MissionStructured.jsx:240-242`), so each column is about 86 pt and
"PROTEIN · 27%" in tracked caps is wider than that.

| Before | After | Why |
| --- | --- | --- |
| Label = name + " · " + percentage under a 56px ring in an 86pt column | Label = the name only; the arc IS the percentage (and the numeral inside the ring already shows the value) | The ring exists so the number does not have to be written twice (§2b rule 2). `typography.md › Conveying hierarchy`: "Minimize the number of typefaces … Mixing … can obscure your information hierarchy". |
| `RingTile` size 56 on mobile | 64 with a 2-column × 2 layout, or 4 rings with names only | Room for the label without shrinking the ring. |

### 7 — The tiles restate the rings, in micro mono
`vid1 frames 0010-0014`

Directly under the four rings, the tiles repeat SLEEP —, STEPS 10,030,
PROTEIN 40/150G: the same three numbers within 200 pt. Under each tile a
tracked mono line ("27% · GAP 110G · MET 9/24D", "−0.1 KG / 14D · 25 SEP",
"KCAL · 1,755 LEFT · 37C 15F") in grey caps.

| Before | After | Why |
| --- | --- | --- |
| Rings + 7 tiles for 4 metrics (`:228-256`, `vitals` + `ringVitals`) | Rings carry protein, steps, sleep, readiness; the tiles keep only what has no ring (weight, HRV, RHR, kcal) and lose their duplicates; the focal tile (`pickFocalVital`) stays | 22 Sep #22 gave the block a focal point; the duplication was left. Each number once. |
| Micro mono sub-lines at `--nv-micro-s` in `ink40` on dark | One sub-line per tile in the UI face at ≥ 11 pt, ink at ≥ 4.5:1 when it carries a value (the "MET 9/24D" kind of fact moves into the tile's tap) | `typography.md › Ensuring legibility`: iOS minimum 11 pt; "avoid light font weights". `accessibility.md › Vision`: 4.5:1 for text up to 17 pt. **Unverified:** the point size and contrast need a measurement; the frames cannot give them. |

### 8 — Seven gold HEALTH tags are wallpaper
`vid1 frames 0002-0006`

The Today card lists eight events; seven carry the gold tag HEALTH, one
FAMILY in green. A tag that is the same on every row conveys nothing and
costs a column.

| Before | After | Why |
| --- | --- | --- |
| Category tag on every calendar row (`MissionStructured.jsx:447-469`) | Show the tag only when a row differs from the others (FAMILY here), or carry the calendar as a 3px leading tint; the live row keeps its ▸ and cyan | §2b rule 8 verbatim: gold "never a default fill that persists across a whole surface". `color.md`: one colour, one meaning. |

### 9 — HUD residue at the top of the cupertino page
`vid2 frame 0001`

Under the wordmark: "SATURDAY 26 SEPTEMBER · 15:40:10 · • 7 AGENTS LIVE ·
ALL SYSTEMS NOMINAL", wrapping to two lines, with the seconds ticking.
The same "7 of 7 live" is repeated by the AGENTS section at the bottom.

| Before | After | Why |
| --- | --- | --- |
| A live seconds clock and "ALL SYSTEMS NOMINAL" in tracked caps (`MissionStructured.jsx:194-226` hero strip) | Date only, in the meta face; the agents' state lives in the Agents instrument row; no motion at rest in the header | `motion.md › Best practices`: "Add motion purposefully … Don't add motion for the sake of adding motion." The Command idiom is a HUD by design (§2b, the design memory); cupertino is his phone and is not. |

### 10 — Fifty-seven lines of prose on the front page
`vid1 frames 0013-0019`, `vid2 frames 0004-0012`

Nova Noticed is two nine-line paragraphs; the Daily Review concept is ten
lines of serif; the hero read is eight; the Lead card is five plus a
four-line source; the Technique card is a summary, a Move paragraph, a
Try-it-today box and a "You'll know it landed" line.

| Before | After | Why |
| --- | --- | --- |
| Full paragraphs rendered in place | Each section shows its headline (one serif line) plus its form (the changed number, the lamp, the count); the paragraph is one tap deep and reads well there | `designing-for-ios.md › Best practices`: "limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." §2b rule 7: information gets a form. |

### 11 — Two of the three Stuck items are test data in his vault
`vid1 frames 0001-0003`

"swipe verification item · A to-do for 34 days" and "optimistic probe
69959 · A to-do for 33 days" are lines 9 and 10 of
`Wiki/Inbox/To-Do.md` (`_(added 2026-08-23)_` and `_(added 2026-08-24)_`,
`#personal`), left behind by the 23–24 Aug perf sweep's instruments. Home
has been showing them as his two oldest stuck items since. Not a design
fault; it is two thirds of the Stuck section. Removing them is a vault
write and his call (decision below).

### 12 — The tab bar's centre acts instead of navigating
`every frame` (the dock)

The core in the dock starts live talk on tap and shows the transcript on
long-press (`MobileChrome.jsx:154-175`); it does not go anywhere. It is
also the most Nova object on the screen.

| Before | After | Why |
| --- | --- | --- |
| Tap the core: talk starts, screen stays | Option A: tap the core goes to Voice and talk starts on arrival (one gesture, and the tab bar navigates). Option B: keep it, on the record that it is a deliberate break | `tab-bars.md › Best practices`: "Use a tab bar to support navigation, not to provide actions." The core is Nova's signature; this is a design argument for him, not a cleanup (decision below). |

### 13 — Smaller things seen
- **Instruction copy on a control:** Shortcuts' subtitle "TRAIN · TODAY · 6 exercises · tap to open Train" (`vid1 0017`). `apple-design › Grouping & mapping`: "If you need a label to explain a control, the mapping is weak." Drop "tap to open Train".
- **The Agents list is seven plain rows with a dot** (`vid1 0018-0020`), the exact shape §2b rule 7 forbids; the Org Map on Ops already draws these beings. Home wants one instrument (seven dots, the working ones lit) not a list.
- **Ten eyebrow + right-meta pairs in four different styles** (italic gold "happening now", caps grey "IN THE VAULT", cyan link "15 waiting ›", violet "CONCEPT ⟳"). One slot, one style.
- **The composer inside the Today card** ("Ask Nova… "dentist Thu 2pm", "r" + Draft) truncates its own placeholder mid-word at 402 pt (`vid1 0004`).
- **Top-bar transition:** `vid2 frame 0003` catches the wordmark, the meta line and the compact "Good afternoon" title drawn over each other for a beat. Unverified whether that is one frame of a cross-fade or a real overlap; check on the device with the recorder.
- **Emoji in calendar titles** (🌄 👟 👨‍🍳 🌌 🧘 💤) are his own event names from the calendar; content, not Nova's ornament. Leave.

---

## 3 · Keep — already right

Name these so they survive the mockups.

- **The greeting and its standfirst**: "Good afternoon, Hayden." in the large face with "Clear until 21:30, then Night routine." in the serif gradient under it. The best opening in the app; the redesign builds down from it.
- **The Today calendar rows**: time column, title, the ▸ live marker in cyan, "in 5h 50m" countdown. Clear and honest.
- **Stuck's days-rings**: 4d gold, 34d red. A number with a form.
- **The vitals rings**, including the dashed grey ring for missing sleep and "NO SLEEP DATA YET": honest absence, never a zero.
- **The Practice row**: the six-lamp grid glyph and the orange "next · …" line. A form, one line, one door.
- **The struck-through Top 3 item with "Seen in your log · 40g in Almond Butter Blueberry Protein Smoothie at 12:24"**: a change acted out, with its receipt.
- **The record card's dashed "1" ring and the pink lift figures** (32.5kg × 10, heaviest yet ▲2.5): the moment has a form.
- **The honest empties**: "On your calendar until 19:30. Nothing for Nova to do here."
- **The dock**: glass material, five tabs, the core, the badge; the compact title collapsing into the bar.
- **The Technique card's inner TRY IT TODAY box**: a designed object inside a card.

---

## 4 · Directions for the mockups

Three variations, each at 390×844, demo-shaped content, published for his
phone. Each states its object count above the fold and its screens deep.
All three keep the greeting + standfirst, the dock, the house materials.

**A · The Read.** One screen: greeting, standfirst, then the read as the
hero (core + three serif lines that already reconcile protein, recovery
and the day's act, written by code from the same facts the instruments
show) with one act pill. Under it, four rings (protein, steps, sleep,
readiness) with names only. Then the index: every other section as an
instrument row (glyph + one line + number), all closed, opening in place,
closing on the next visit. Nothing else on the first screen. Target: 4
blocks, 1 primary, 2 screens to the end of the index.

**B · The Day Spine.** The calendar becomes the page's spine: a vertical
timeline of today with the live hour marked; cards attach to their hour
(the 08:30 session shows what happened there, the 10:00 cook block shows
the protein that landed, the 15:30 work block carries the stuck podcast,
tonight carries Wrap the day). Moments and insights hang off the times
they belong to, so nothing is restated and nothing is stale without
showing its hour. Rings ride the top as a compact strip. Target: one
scroll, no sections, time as the only structure.

**C · The Two Panes.** A fixed upper pane (greeting, read, act, rings)
that never scrolls, and a lower pane that is a horizontal rail of
section cards (Stuck · Today · Deck · Noticed · Review · Lead · Practice
· Agents), one visible at a time, swiped, with a dot pager; each card
holds its full content and one verb. Nothing repeats because each section
is a room. Target: 1 screen, no vertical scroll except inside a card.

Each mockup answers the clutter table with its own numbers, and each shows
the same demo day (a record, one landed capture, a stale morning act, one
stuck item, protein at 27%, no sleep data) so they compare honestly.

---

## 5 · Method, and what was not verified

- Evidence: 42 frames from his two recordings (`vid1` 22 frames, `vid2`
  20; scratchpad only, not committed, per the audit convention). Both
  recordings are silent (−91 dB). The frames cover the full scroll; no
  interaction was recorded, so tap states, swipes, the fold cascade and
  the ring arcs are unverified here.
- Source re-read for every locator above; the fold mechanism, the ring
  grid and the test to-dos are verified in code and vault.
- Not measured, and worth measuring before the build: scrollHeight at
  402×874 (`scripts/probe.mjs`, with writes guarded; a headless load of
  Home is a write), the point size and contrast of the tile micro-lines
  and the eyebrow labels, the top-bar transition (`scripts/rec.mjs`).
- Not seen: the Command idiom (not his phone), the morning and evening
  orders, offline, demo, the folded state of any section.
- Decisions this audit raises for him: (1) remove the two test to-dos from
  his vault; (2) the dock's centre: navigate to Voice, or keep the act.
