# 03 · Train — audit, 27 Sep 2026

Judged against his own reference for "simple" — the Coach deck on this very
page (`src/CoachSuggestions.jsx`): one sentence, the change drawn, Yes /
Discuss / a quiet cross, one do-all, Undo — and against `SessionView`
(`Workouts.jsx:488-800`), which the checklist names "the most tactile
surface he has." Evidence: source read in full (`Workouts.jsx` 1,235 lines,
`valsWorkouts.js` 903, `TrainToday.jsx` 352, `CoachSuggestions.jsx`,
`WeekSets.jsx`, `ExerciseSheet.jsx`, `PersonalRecord.jsx`,
`FormCheckPanel.jsx`, plus the relevant slices of `App.jsx` and
`coachSuggestions.js`); 2 demo frames; 15 real, read-only frames of his
connected vault at 402×874 (Today, Gym, Gym→routine detail, Coach); 4
computed-style sweeps of `main`. Read under `apple-hig-review`'s references,
each cited below as `file.md › Heading`, with "judgment" where none applies.
Method, the full frame ledger and every blocked write are in §5.

---

## 1 · Verdict

**Needs work.** Train presents itself as three tabs — Today, Gym, Coach —
but Coach is not a third place: it is the exact tail of Gym's own scroll,
reachable either way, opened early. It will be remembered for the readiness
ring and the muscle-hued volume bars, real, well-earned objects, sitting
beside a live session grid whose single most-tapped control clears only
40 of the 44pt the redesign's own bar asks of a primary action, and a Coach
deck that — on the one real change waiting in his vault during this audit —
drew nothing at all and printed its own sentence twice. The number that
says it: opening the Coach tab adds zero pixels of content beyond what
tapping Gym and scrolling to the bottom already shows.

### Clutter numbers, as it stands (checklist §3)

| Test | Today | Gym (list, full scroll) | Gym → routine detail | Coach | Target |
| --- | --- | --- | --- | --- | --- |
| Focal point | Two: the readiness ring and "On today's card" compete in one screen | Two: the page's own "Train, your way." headline and the identical "On today's card" hero compete | One: the routine name + Start workout | None — a suggestion card, then Goals, then chat, each pulling equal weight | One, above the fold |
| Object count above the fold (402×874) | ~7: banner, ring+facts+2 chips, hero+Begin, focus card, momentum peeking | ~6: banner, headline, hero+Begin, first week-strip row | ~4: back link, title, 2 buttons, first exercise card | ~3: deck header, 1 suggestion card, Goals eyebrow starting | Lower than today, or a reason |
| Verbs per card | Coach's open ask: 3 (matches the bar) | Routine tile: 2 (tap open, hold for menu) | Exercise row: up to 8 (3D, Coach chip, ↑, ↓, Form check, Remove, plus the row's own edits) | Suggestion card: 3 (matches the bar) — but drew nothing for the one real one on file | One primary, one quiet alternative, talk back |
| Type sizes | 13 distinct sizes (measured) | 19 distinct sizes (measured) | 10 distinct sizes (measured) | 10 distinct sizes (measured) | ≤ 3 |
| Tap floor | 5 of 17 clickable elements under 44pt; 0 under 28pt | 9 of 35 under 44pt; 0 under 28pt | **24 of 49 under 44pt; 12 of those under the 28pt floor** | 8 of 20 under 44pt; 0 under 28pt | ≥ 28pt; ≥ 44pt primary |
| Gestures | none beyond tap | long-press on a routine tile (context menu) | long-press on an exercise name (context menu) | none beyond tap | Every capability has a pixel he can tap |
| Motion | ring arc fill, leave-animation on Coach's ask | `.nv-deck-rise` on cards | view-transition morph in from the row/card that opened it | `.nv-sug-fold`/`.nv-sug-arrive` on a suggestion's own change | All four |
| States | honest "haven't loaded" absence; no skeleton seen | discarded/parked-session recovery cards | Coach-evidence paragraph, form-check refused (not photographed) | error line on a failed apply/decline | All four designed |
| Width | `main.scrollWidth` 402 | 402 | 402 | 402 | 402 (his phone, iPhone 16/17 Pro class) |
| Idioms | cupertino only photographed this session | cupertino only | cupertino only | cupertino only | Both checked |
| Screens deep (874px steps) | 1.6 (2 screenfuls) | 3.8 (4 screenfuls) | 2.7 (3 screenfuls, 7-exercise routine) | 1.8 (2 screenfuls) | ≤ 4 before an index |

---

## 2 · Findings

### 1 — Coach is not a third tab: it is the last third of Gym's own scroll
`Workouts.jsx:407` and `Workouts.jsx:1219`; real frames `train-real-gym-3/4.png` vs `train-real-coach-1/2.png`

`RoutinesView` ends with `<GoalsCoachPane v={v} />` (`:407`); the Coach tab's
entire body is `v.trainTab === 'coach' && <GoalsCoachPane v={v} />`
(`:1219`) — the identical component call. Photographed side by side, the
bottom two screenfuls of Gym (suggestion card, Goals card, "Ask Coach"
chat) are pixel-identical to both screenfuls of the Coach tab: same waiting
count, same suggestion text, same rings, same chips, same composer. Nothing
on the Coach tab is unreachable from Gym.

| Before | Why | Severity |
| --- | --- | --- |
| A three-way `Segmented` (`Workouts.jsx:1204-1206`) implies three destinations; one of them duplicates the end of another | `tab-bars.md › Best practices`: "Use a tab bar to support navigation, not to provide actions" — the segmented control here is doing tab-bar duty (`segmented-controls.md › Mobile`: "For switching between completely separate sections of an app, use a tab bar instead"), and one of its three "separate sections" is not separate. | High |

### 2 — "On today's card" is drawn twice, verbatim, on two different tabs
`TrainToday.jsx:163` vs `Workouts.jsx:143`; real frames `train-real-today-1.png` vs `train-real-gym-1.png`

Today's own hero renders `<Eyebrow tone="cyan">... "On today's card" ...</Eyebrow>` with the routine name and a ▶ Begin session button (`TrainToday.jsx:159-176`). Switch to Gym and the first thing under the headline is a second, independently-coded hero card with the same eyebrow text, the same routine name, and the same Begin session button (`Workouts.jsx:135-175`, `gymHero`). Two components, two renders, one fact, one screen apart.

| Before | Why | Severity |
| --- | --- | --- |
| The day's one scheduled session is a full hero card on Today and again on Gym, both leading with "On today's card" | `color.md`/`layout.md › Visual hierarchy` judgment: a fact stated twice in the same screen's two tabs is the clutter the redesign brief names ("less cluttered... whilst still maintaining functionality"). checklist §3, Object count. | High |

### 3 — The weekly muscle-volume instrument is drawn three different ways inside Train alone
`TrainToday.jsx:288-344` ("Hard sets this week"), `Workouts.jsx:1086-1107` ("What the Coach is reading"), `src/WeekSets.jsx` (the full sheet); real frames `train-real-today-2.png` and `train-real-coach-1/2.png`

Today's tab shows up to 6 muscle rows as gradient bars with a `done/target`
figure. The Coach tab's own empty-log instrument, when the chat log is
empty, shows up to 5 of the same rows plus "and 1 more on Today" as
near-identical bars, same hues, reordered goal-muscles-first. Tap either
one's header and `WeekSetsSheet` draws the same numbers a third way (rings
+ a 7-day pip grid). All three read `o.volume`/`week` — the same record.

| Before | Why | Severity |
| --- | --- | --- |
| One dataset, three separately-coded renderings, two of them full-width cards on two different tabs | `color.md › Best practices`: "Avoid using the same color to mean different things" extends the other way too — the same meaning painted the same way three times is restated information, not reinforced information. Home's own finding 2 named this exact pattern ("six sections each compose their own sentence about protein"). | Medium |

### 4 — Home's Training card and Body card already draw what Train's Today tab draws
`src/screens/MissionSummary.jsx:562-590` (`TrainingCard`), `:390-402` (`BodyCard`); `src/vals/valsSummary.js:116-130` (`bodyCard`), `:188-201` (`trainingCard`); vs `src/TrainToday.jsx:21-39, 82-109`

The rebuilt Home's Training card renders a 44px `RingTile` fed by the exact
same `readiness` field TrainToday's 118px `Ring` reads (`valsSummary.js:190-192`
vs `TrainToday.jsx:21-39`), plus the same routine-name-or-record state Today
leads with. Separately, Home's Body card carries a Sleep ring
(`valsSummary.js:127`); Today's own hero prints Sleep as a plain label-value
row, not a ring (`TrainToday.jsx:86`). Readiness has two renderings across
the app; Sleep has two different *shapes* (a ring on Home, a number on
Train) for the same fact.

| Before | Why | Severity |
| --- | --- | --- |
| Readiness: a mini ring on Home's Training card, a full ring on Train's Today. Sleep: a ring on Home's Body card, a text row on Train's Today | `charting-data.md › Designing effective charts`: "Maintain continuity among multiple charts that use the same data... use one chart type and consistent... layouts... to signal that the dataset remains the same." Two shapes for one fact is the opposite. | Medium |

### 5 — The live session's most-tapped control is under the redesign's own primary floor, and its neighbours are under the general one
`Workouts.jsx:604-610` (the set tick), `:612` (remove), `:542-544` (skip toggle), `:36-39` (`setCols`/`setInputStyle`), `src/vals/valsChrome.js:56` (16px mobile padding)

The set-done tick — "the app's most-repeated tap" by the file's own comment
(`:592`) — is a hard-coded `width:'40px',height:'40px'` (`:608`). Checklist
§3's own bar asks ≥44pt for a primary action; 40px is 4pt short. Beside it,
the remove "×" is `26px×36px` (`:612`) and the per-exercise skip toggle is
`26px×26px` (`:543-544`) — both under even the ≥28pt general floor. Doing
the column math on the set grid itself: `setCols` gives 6 fixed columns
(20+44+38+32+40+26 = 200px) plus 7×6px gaps (42px) inside a card padded
16px (screen) + 18px (card) per side (334px available at 402pt) — leaving
two `minmax(44px,1fr)` weight/reps columns exactly **46px** wide each, 2pt
above their own CSS floor, for a 16px monospace number that can run to four
characters.

| Before | Why | Severity |
| --- | --- | --- |
| The single most-tapped control in the session grid is 40×40px | checklist §3, Tap floor: "≥ 44pt" for a primary action; `accessibility.md › Mobility`: "iOS, iPadOS: 44×44pt default." | High |
| Remove (26×36) and the skip toggle (26×26) sit under the 28pt floor entirely | `accessibility.md › Mobility`: "iOS, iPadOS: ... 28×28pt minimum." This is the accessibility lens the skill marks Critical regardless of how the rest of the page reads (as 02-inbox.md's own finding 10 does for the same reason). | Critical |
| The weight/reps input columns compute to 46px, 2pt above their own floor, for values that can run 3-4 characters | `text-fields.md › Best practices`: "match the size of a text field to the quantity of anticipated text." Not photographed live (starting a session writes); this is the CSS's own arithmetic, not a guess. | Medium |

### 6 — The Coach deck, judged against the bar it set itself, both discards with no reason and — on the one real change waiting — drew nothing and repeated its own sentence
`src/coachSuggestions.js:212-218` (`findingChange`), `CoachSuggestions.jsx:261` (`ChangeStrip` returns `null` for a `note`), `App.jsx:7215-7235` (`answerCoachSuggestion` → `inboxDiscard`); real frames `train-real-coach-1/2.png`, `train-real-gym-3/4.png`

Two separate faults, one card. First: `findingChange()`'s fallback path sets
`headline: r.finding?.title || firstSentence` and, when there is no
`finding.title`, `why: line.slice(firstSentence.length).trim() || line`
(`:214,216`) — when the underlying sentence has no internal `.`/`!`/`?`
break (an em-dash does not count), `firstSentence` swallows the whole line,
the slice comes back empty, and `why` falls back to the same full line
again. That is exactly what the one real Coach suggestion in his vault
during this audit showed: the bold headline and the muted "why" paragraph
underneath it were the identical sentence, word for word. Its `diff.type`
was `note` (the generic fallback, `:215`), and `ChangeStrip` explicitly
draws nothing for that type (`CoachSuggestions.jsx:261`) — so the one card
this audit could see live had no change drawn at all, contrary to R31's
"the change drawn" description of the deck. Second, unrelated to the first:
the ✕ still resolves in one tap with no reason asked —
`answerCoachSuggestion(id, 'no')` calls `api.inboxDiscard(conn, id)`
directly (`App.jsx:7235`) — the same gap the inventory found, re-confirmed
live and against the exact suggestion this audit photographed.

| Before | Why | Severity |
| --- | --- | --- |
| Headline and why print the same sentence twice on a `note`-type suggestion, with nothing drawn between them | NOVA-METHOD non-negotiable: "Honest degradation, never fiction" (a card that looks like it forgot what it just said is not honest, it's a bug) — root-caused in source, not a guess. `feedback.md`: status should be exposed once, clearly. | High |
| ✕ discards at once, no reason captured, on the exact card this page holds up as the redesign's reference for "simple" | UI-REDESIGN-SPEC item 6 ("decline asks why"), still not built. `undo-and-redo.md` adjacent judgment: an instant, wordless negative on someone else's authored suggestion is the one place a beat of friction earns its keep. | Critical |

### 7 — Four different postures for turning something down, on one screen
`Workouts.jsx:474-483` (delete routine), `:834-841` (delete session, `HistoryView`), `:692-706` (cancel session), `src/CoachApplySheet.jsx` (confirm an apply); `CoachSuggestions.jsx:119-123` (the ✕, finding 6)

Delete a routine: a `TextAction` flips in place to a warning sentence plus
Confirm/Cancel. Delete a session in History: the identical inline pattern,
independently coded. Cancel an in-progress session: a same-row toggle that
swaps the button for a warning line and Discard/Keep going. Apply a
Coach-drafted change: a full modal sheet with an optional note field.
Decline a Coach suggestion: nothing at all — the tap fires immediately
(finding 6). That is four distinct postures for a "no" or "undo this"
action, on exactly two files.

| Before | Why | Severity |
| --- | --- | --- |
| Inline confirm, same-row toggle, modal sheet, and zero-confirmation are all present for a similar class of decision | `modality.md › Best practices`: "aim to keep modal tasks simple... consider whether there's a clear benefit" — four shapes for one kind of decision means none of them is a house pattern. Inventory first-look note, re-confirmed and re-counted (they found three; this reading counts the ✕ as a real fourth posture). | Medium |

### 8 — Hand-rolled input styles, confirmed live
`Workouts.jsx:26-39` (`numInputStyle`, `setInputStyle`, `setCols`); real frame `train-real-routine-1.png`

Every numeric field on Train — the three target-sets/reps boxes on a
routine's exercise row, and the set grid's weight/reps/RPE/RIR cells — is
styled by two local object literals (`numInputStyle`, `setInputStyle`)
rather than a shared `Controls.jsx` input primitive. Photographed live: a
routine's exercise row shows three bare bordered rectangles side by side
("3 × 12 – 12 reps"-shaped), each a raw `<input type="number">` with no
house chrome, stepper, or label above it — the input-primitive version of
the `btn()` finding the 22 Sep report made for buttons.

| Before | Why | Severity |
| --- | --- | --- |
| Two hand-rolled style objects supply every numeric input on the screen, visually distinct from every other control on the same card (chips, tags, buttons) | `entering-data.md › Best practices`: "match the size of a text field to the quantity of anticipated text" is satisfied by accident here, not by a shared rule; a second file that needs a number input will re-invent this rather than reuse it. | Medium |

### 9 — The Quick-session builder and the Goals-edit form are plain panes, confirmed live, beside heavily-instrumented neighbours
`Workouts.jsx:370-405` (Quick session), `:1004-1016` (Goals-edit fields); real frames `train-real-gym-2.png`, `train-real-goals-edit.png`

Photographed live: Quick session is a bordered card holding a raw `<select>`
and a raw `<input>` in a row. Tap Edit on Goals and the richly-instrumented
read view (three rings, dot strips, muscle chips) is replaced by seven
stacked bordered rectangles with grey placeholder text — "The goal — e.g.
...", "Focus — e.g. ...", a `Days/week` select, three numeric boxes, an
"Equipment — e.g. ..." field, and (below the fold) limitations and notes.
Nothing in the edit form carries a ring, a chip, or a colour; every other
card on the same tab does.

| Before | Why | Severity |
| --- | --- | --- |
| Two forms on this screen are unstyled label/input stacks, confirmed by direct capture, on a page whose read-only cards are the redesign's own high point | §2b rule 7 (project CLAUDE.md): "nothing on a Nova surface is a plain box with text in it." The read view proves the data already has a form (rings, chips) the edit view drops entirely. | Medium |

### 10 — A Coach evidence paragraph renders in full, inline, inside a compact editing row
`Workouts.jsx:445` (`coachEvidence` meta line); real frame `train-real-routine-2b.png`

When an exercise in a routine carries a Coach progression note, the row
prints not just the chip but a full explanatory paragraph directly under
the "last:" line — five to six wrapped lines in the photographed example,
never truncated, never behind a tap. On a routine with several such
exercises, editing the routine means scrolling past a paragraph of prose
for each one, inside what is otherwise a dense, number-box-and-chip row.

| Before | Why | Severity |
| --- | --- | --- |
| A multi-line prose paragraph is un-collapsed inside a compact editing row | `lists-and-tables.md › Content`: "If each item consists of a large amount of text, consider alternatives... list item titles only, letting people choose an item to reveal its content." | Medium |

### 11 — Zero swipe rows anywhere in Train
Grep-confirmed: no `SwipeRow` import in `Workouts.jsx`, `TrainToday.jsx`, `CoachSuggestions.jsx`, `WeekSets.jsx`, or `ExerciseSheet.jsx`

Every repeatable action on this page — remove a set, skip an exercise,
delete a routine, delete a history entry, decline a Coach suggestion — is a
small tap target reached by locating a specific button, never a swipe. This
is the opposite failure from Inbox's (which over-relies on one swipe as the
only door); Train has the house `SwipeRow` component available in the
codebase and uses it nowhere.

| Before | Why | Severity |
| --- | --- | --- |
| No gesture shortcut exists for any of Train's frequent negative actions | `designing-for-ios.md › Best practices`: "it tends to be easier and more comfortable for people to reach a control... swipe to navigate back or initiate actions in a list row." checklist §3, Gestures. | Medium |

### 12 — Demo mode cannot represent this page at all
`valsWorkouts.js:114` (`usingLiveWorkouts = !!st.liveWorkoutRoutines`), `Workouts.jsx:1201,1223` (tabs gated on `usingLiveWorkouts`); real vs demo frames

`--demo` never populates `liveWorkoutRoutines` (confirmed live:
`connectionStatus:"demo"`, `liveWorkoutRoutines:null`), so `usingLiveWorkouts`
is false and the Segmented never renders — demo mode shows only the
hard-coded `MockWorkouts` plan, not Today/Gym/Coach, not the live session
grid, not the Coach deck. Every one of this audit's R1–R33 rows except the
demo plan itself is unreachable without a real connection. The one demo
screen that does exist has its own fault: the Ask Coach card is
`min-height:420px` regardless of content (`Workouts.jsx:882`), so with one
short scripted message it shows roughly 350px of dead space above the
composer (measured in `train-demo-2.png`, scrollHeight 1127px total).

| Before | Why | Severity |
| --- | --- | --- |
| A mockup built from demo-shaped content, per the redesign loop's own rule, cannot show 32 of Train's 33 inventoried features | Same caution 02-inbox.md's finding 9 raised for Inbox, confirmed here to be even more total: Inbox's demo state is one thin screen; Train's demo state is a different, entirely separate hard-coded surface. | High |
| A fixed 420px card height leaves ~350px empty under one short message | `layout.md › Best practices`: "Make essential information easy to find by giving it sufficient space" cuts the other way too — space given to nothing is space taken from something. | Medium |

### 13 — What only the real frames show
- **4 routines**, with 6, 7, 7 and 8 exercises each (from his live vault, `liveWorkoutRoutines`).
- **1 Coach change waiting** throughout this session's captures — the same "1 change from Coach" banner and deck count, both idioms, matching (see finding 6 for what that one change actually contained).
- **18 items pending in the Inbox** at the same moment (the dock badge), corroborating 02-inbox.md's own count from the day before.
- **6 muscle rows** in the "Hard sets this week" instrument, values observed from 3-of-10 to 18-of-10 (i.e., one muscle already past its weekly target, another well short) — capped at `.slice(0,6)` in source regardless of how many muscle groups are actually in play.
- The Goals card's three target rings (a distance-based goal, a protein goal, a calorie goal) all read as **dashed/empty for "today"** while the day-strip beneath them already shows several days met this week — an honest absence, not a zero (a Keep).
- The routine-detail screen for one 7-exercise routine measured **49 clickable elements**, of which **24 were under 44pt and 12 of those under 28pt** — the single densest surface measured on this page.

---

## 3 · Keep

- **The readiness ring and the muscle-hued volume bars.** Real objects, honest absence (a dashed ring, never a zero), colour that means the muscle rather than a mood — `TrainToday.jsx:21-39, 306-329`.
- **The Coach deck's own verb discipline**, when it has a structured change to draw: one sentence, a light tick, a quiet Discuss, a bare ✕, one do-all — `CoachSuggestions.jsx:47-131`. Finding 6 is about what happens when there is nothing structured to draw, not about the template itself.
- **Coach's open ask on Today** (✓ Do it / Discuss it / ✕ Not this, leaving with an animation before the action runs) — the same three-verb bar, correctly applied, with a beat of exit motion the deck's own cards on Coach do not have — `TrainToday.jsx:256-284`.
- **The muscle-hue system.** Every chip, bar and ring names its muscle in one consistent colour across Today, Gym and the routines grid — `src/muscleHue.js`, used at `TrainToday.jsx:224`, `Workouts.jsx:152,1178-1185`.
- **The set grid's one shared column template** (`setCols`, `Workouts.jsx:36-37`) — a real, comment-documented fix for the exact "label drifted over the wrong number" bug his own report caught; finding 5 is about the columns' width, not their alignment.
- **`FormCheckPanel`'s refusal state**: "Nothing was filed — a guess from a bad angle is worse than no review" — honest degradation, stated plainly, `FormCheckPanel.jsx:56`.
- **`PersonalRecord`'s open gauge**: an arc that always completes with a mark where the old value sat, the real set shown larger than the derived estimate, "first on record" said outright when there is nothing to have passed — `PersonalRecord.jsx` in full.
- **The routine grid's target-muscle chips before commitment** — what a routine trains, visible before tapping in, not after — `Workouts.jsx:363-367`.

---

## 4 · Directions for the mockup round

**A · Two tabs, not three.** Fold Coach's unique value (the suggestion deck, Goals, the chat) into the bottom of Gym where it already, in practice, lives — and drop the Coach tab. Today stays the daily read; Gym becomes the one place that holds the program, the log, and the conversation about both, in that order. Kept: every feature in `GoalsCoachPane`. Moved: nothing, structurally — it already renders in one place; this direction just stops pretending there are two. Clutter numbers: one Segmented becomes a two-way (or is retired for a single scroll with the log/Coach content revealed by need); the "opening Coach adds zero pixels" fault (finding 1) becomes structurally impossible rather than merely true.

**B · The live session redrawn one set at a time.** Replace the seven-column grid with one set as the object: a large number pad for weight and reps, RPE/RIR/type tucked behind a disclosure, and the tick promoted to a genuine 44pt (or larger — it is the single most-tapped control in the app) primary. Exercises become a rail he swipes through rather than a stacked list he scrolls past. This directly answers finding 5 (the 40px tick, the 46px number columns) by removing the constraint that produced them — seven columns fighting for 334px — rather than adjusting their widths.

**C · One fact, one instrument.** Wherever "today's session," "readiness," or "this week's volume" would be drawn more than once (Today's hero vs Gym's hero, Today's bars vs Coach's empty-log bars vs the week sheet, Home's Training/Body cards vs Train's own ring), keep exactly one full rendering and make every other appearance a compact reference that opens it — a chip, a mini ring, a one-line pointer — never a second full card. Answers findings 2, 3 and 4 together. Clutter numbers: the object count above the fold on both Today and Gym drops by one full hero card each.

**D · What the pixels argue for.** Two tabs that are really two (A); the tactile surface rebuilt around the object he actually touches sixty times a set (B); no fact drawn twice (C). Underneath all three: fix `coachSuggestions.js:216`'s fallback before any of it — a suggestion card that cannot draw a change should say so plainly ("a note for the Coach to read"), not silently repeat its own headline as its reason.

---

## 5 · Method

**Source.** All eight assigned files read in full, plus `App.jsx:7150-7290`
(`answerCoachSuggestion`, `openExerciseCard`), `coachSuggestions.js` in full,
`src/screens/MissionSummary.jsx` and `src/vals/valsSummary.js` (the Home
comparison), `src/api.js:442`, `src/vals/valsChrome.js:56,145` (mobile
padding, `wrapWorkouts`), and grep passes for `SwipeRow`/`useSheetDrag`/
`onLongPress` across Train's files.

**Demo frames: 2**, `--demo --style cupertino --hour day`, port 5183 (the
one CORS-allowed dev port). `connectionStatus` read directly from
`window.__novaApp.state`: `"demo"`, `liveWorkoutRoutines: null` — confirming
the Segmented never mounts in this mode. `main.scrollHeight` 1127px,
`scrollWidth` 402px (1.3 screens, one screenful photographed top and
bottom).

**Real frames: 15 captures, 10 distinct positions used as evidence** (`node
scripts/dev-connect.mjs`, then `--readonly` on the same port; cleaned with
`--clean` twice, confirmed absent both times with `ls public/_devconn*`
finding nothing). Today ×2 (top, scrolled to 874), Gym routines-list ×4
(0/874/1748/2622), Coach ×2 (top, scrolled to 1604), Gym→routine-detail ×2
(top, scrolled to bottom — retaken once after a first capture landed
mid-transition and showed the whole screen at reduced opacity; not treated
as a real finding). Plus 1 console-only probe (routine IDs, not screenshotted
for review) and 1 extra real frame for the Goals-edit form
(`window.__novaApp.setState({goalsEditing:true, goalsDraft:{...}})` — a pure
client state change, no fetch). Routine detail opened via
`window.__novaApp.openRoutine('e470bd00')`, also a pure `setState` wrapped
in a view-transition, confirmed by reading `withTransition()` in source
before use — no `Begin`/`Start`/`Finish`/`Save`/`Apply`/`Yes` was ever
tapped or evaluated.

**Computed-style sweep**, run on `main` for Today, Gym-list, Coach and
routine-detail: elements with computed `cursor:pointer`, deduplicated to
drop an inner element whose own ancestor is already counted; a "filled"
element is one with a non-transparent computed `background-color` — a
blunter test than "primary button," so that count includes chips and
tinted circular icons alongside true CTAs, and is reported as such rather
than as a verbs-per-card claim. Tap-target minimum is the smaller of an
element's width/height. Font-size count is the distinct computed
`font-size` values among leaf text nodes. The sweep script and its exact
logic are reproducible; nothing in it reads record content.

**Blocked writes, every distinct endpoint recorded.** `--readonly`'s
interception engaged on every real capture (`sawFetchPaused` true
throughout; never exited 3). Exactly five endpoints were ever blocked
across all 15 real captures — `POST /api/notes/summary`, `POST /api/greet`,
`POST /api/brief-state/greeted`, `POST /api/tts`, `POST /api/conversation`
— the identical set 02-inbox.md found the day before, most firing again
during the post-screenshot teardown window rather than on load. **Zero**
blocked writes were ever attributable to `Workouts.jsx`, `TrainToday.jsx`,
`valsWorkouts.js` or `CoachSuggestions.jsx` themselves, on any tab, any
scroll position, or the routine-detail open — Train's own read path is
genuinely read-only, matching Inbox's own finding for its files.

**What was not captured, and why.** The live `SessionView` grid — starting
a session calls `app.startWorkoutSession`, which writes a session record;
finding 5's tap-target and column-width numbers are computed directly from
the CSS in source (`setCols`, `setInputStyle`, the tick's literal
`width:'40px'`), not photographed. `ExerciseSheet` — `openExerciseCard`
POSTs to `/api/panel` (`App.jsx:7908-7914`, `src/api.js:442`), which
`--readonly` blocks, so the sheet would only show its own loading skeleton
against a permanently-failed fetch; the skeleton's shape is confirmed from
source instead (`ExerciseSheet.jsx:37-58`). `WeekSetsSheet` and
`CoachApplySheet` — both open from a live-session or Coach-apply context
this audit did not enter; read from source only. The `command` idiom (this
session photographed `cupertino` only, per his phone). A second Coach
suggestion or a routine with a Coach-quality (non-weight) chip beyond the
two seen were not available to sample further — findings 6 and 10 are
honestly reported against n=1 real cards, with the root cause in finding 6
traced and confirmed in source rather than left as a guess from one
screenshot.

**Cleanup verified.** `pkill` confirmed no process on :5183 after each
session; `public/_devconn.js` removed and confirmed absent
(`ls public/_devconn*` → no matches) before this file was written.
`git status --short` at the end of this audit shows only this file and the
other agent's `design/mockups/57-redesign-inbox.html` (not touched here).
