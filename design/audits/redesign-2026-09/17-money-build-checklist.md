# 17 · Money build checklist, 10 Oct 2026

The build of Money against its approved frames: the Money tab of mockup 85
(round 2, "A refined", his words 9 Oct: "I love the layout and colour choices
as well as the features") with the round-3 refinements chosen as defaults from
mockup 90 (Compare, Line, Bills, Import with the .xlsx card, Mac). His words
on round 3, 10 Oct: "Just ensure everything is not cluttered and it interacts
with everything else in nova so it can alert me and discuss important things
as needed".

Every line below is marked once the build is photographed against the
mockup in demo mode: PRESENT, DIFFERS (with why) or MISSING. A MISSING line
is fixed before the branch is reported.

PRIVACY: every merchant, amount and file name in the build's demo data and in
this file is invented.

---

## A · The page (Month frame, 85 m1 = 90 m1)

### Header
- [ ] A1 Large title "Money", 34 pt bold, tight tracking
- [ ] A2 ⋯ button, 44 pt round, neutral glass; opens the menu sheet
- [ ] A3 ＋ button, 44 pt round, violet fill (`--nv-vi`), opens the add sheet
- [ ] A4 Month pill, 44 pt, "October 2026 ⌄"; picks any month the ledger has
- [ ] A5 The serif news line (20 pt) with the violet live dot, written by code
      ("$1,391 spent with six days left. Under pace overall, but Eating out is
      $38 over."); the over-budget category named in its own hue

### Hero (violet bloom card)
- [ ] A6 Donut 150 pt: one arc per category in its hue, against the month's
      total budget, on a track
- [ ] A7 The white pace tick at today's share of the month
- [ ] A8 Donut centre: spent (SF Rounded 26) and "of $1,870"
- [ ] A9 "Left to spend", the figure at 40 pt, counted up from zero on arrival
- [ ] A10 "About $80 a day for the 6 days left"
- [ ] A11 "Under today's pace by $117, the white tick" (or "Over …")
- [ ] A12 Legend: a solid pill per category, its hue, glyph and name; "Other"
      in ink

### Tiles
- [ ] A13 Money in: coin glyph, "Money in", "+$3,400" (28 pt), "1 payment,
      Friday"; the 22/22/22/40 corner shape
- [ ] A14 Against September: "−5%" (28 pt), the trend arrow and "$75 less",
      two bars Sep/Oct; the 22/40/22/22 shape
- [ ] A15 (r3) The Against tile is a door: a chevron, and a tap opens Compare

### Pace card
- [ ] A16 "October so far" / "day 25 of 31"
- [ ] A17 (r3) Segmented "Budget pace | Last month", 44 pt
- [ ] A18 The dotted even pace of the budget, the October line (draws), the
      violet area under it, today's dot, "Budget $1,870", "$1,391 today"
- [ ] A19 Axis "1 Oct · 15 · 31"
- [ ] A20 (r3) Key: October, September same days, budget's even pace
- [ ] A21 (r3 Compare) September's line to the same day and on to its end,
      its dot, "Sep ended $1,742"; the ideal line dims
- [ ] A22 (r3 Compare) The serif "where did it go" sentence, written by code:
      the category that moved most, named only at ≥ $40 and ≥ a fifth of
      itself, with its visit count against last month's; otherwise "No one
      category moved much…"
- [ ] A23 (r3 Compare) "Less than September | More": a diverging bar per
      category that moved ≥ $10, each in its hue, signed amount right
- [ ] A24 (r3 Compare) The rule paragraph, saying how many moved < $10

### Budgets
- [ ] A25 "Budgets" + "$1,351 of $1,870"
- [ ] A26 A row per budgeted category: glyph tile in its hue, name, "$298 of
      $260", the capsule (track = budget, fill to the limit line)
- [ ] A27 Over budget: the fill runs past the line into a HATCHED tab in the
      category's hue, the outlined "$38 over" pill; NEVER red
- [ ] A28 Over rows sort first, then by how full
- [ ] A29 The dashed "No budget yet: Entertainment, Other · $40" row, a door
- [ ] A30 A row opens the budget sheet

### Price watch
- [ ] A31 "Price watch" + "1 change"; only while a rise is waiting
- [ ] A32 Gold-edged decide card: "A price went up · waiting on you"
- [ ] A33 Serif "Reelhouse is now $18.99 a month."
- [ ] A34 The step bars: past charges, the new one with its step hatched in
      gold, month labels
- [ ] A35 "Up $2.00 a month, $24 a year. It tipped Subscriptions $1 over its
      budget." (the second sentence only when true)
- [ ] A36 Keep it (green), Talk, ✕ ("Don't keep it": a To-Do to cancel before
      the next charge, with Undo)

### Coming up (r3 Bills: confidence in words)
- [ ] A37 "Coming up" + "how sure, from each one's history"
- [ ] A38 The calendar: 5 weeks from this Monday, M to S, past days dim,
      today ringed in violet, "Nov" at the 1st
- [ ] A39 A coin per predicted charge, its category's hue, sized by amount;
      A guess drawn hollow
- [ ] A40 Likely: a window bar under the days it may land on
- [ ] A41 Bill rows: monogram (hollow for a guess), name, "when · cadence",
      amount
- [ ] A42 The word: Sure (solid), Likely (tinted), A guess (outlined),
      computed over EVERY gap
- [ ] A43 The strip: one dot per past charge against the expected day
- [ ] A44 The sentence ("9 charges, every one on a Thursday." / "3 charges,
      each within 2 days…" / "Seen twice, 31 days apart…")
- [ ] A45 "All 6 recurring ›" pushes the full recurring page

### Latest (B's list)
- [ ] A46 "Latest" + "All 64"
- [ ] A47 Day groups: "Today" + the day's total, "Yesterday", then dates
- [ ] A48 Rows: monogram in hue (money in: an inflow glyph, outlined), the
      name at full width (single line, ellipsis), category dot + name, amount
- [ ] A49 "up $2" in gold beside a risen subscription
- [ ] A50 (r3) A row is a door: it opens the line sheet
- [ ] A51 "See all 64 lines ›" pushes the full list (search, swipe to delete
      with Undo, "showing 120 of N" said when it applies)

### Where lines come from
- [ ] A52 Head + month
- [ ] A53 Source bar (bank exports / typed / receipt scans) in violet shades,
      counts in the legend, "budget app · not linked" as a hollow slot
- [ ] A54 "Nova checks Money/Imports every five minutes and asks before
      filing anything. Last import Thursday."
- [ ] A55 Chips: Check now, Link your budget app

## B · Sheets and pages

### ⋯ menu
- [ ] B1 Draft September's report · On the rails, for your approval
- [ ] B2 Export FY26-27 · A CSV of every line
- [ ] B3 Check the imports folder · Money/Imports, also every 5 minutes
- [ ] B4 Scan a statement or receipt · Drafted to the Inbox
- [ ] B5 Bring in your budget app · Its export, through the imports folder
- [ ] B6 How money gets in · Exports, scans, and "coffee 6.50" anywhere

### Add sheet
- [ ] B7 Cancel / "Add a line" / Add (disabled until valid)
- [ ] B8 The amount at 48 pt with "$" and the caret; the number pad
- [ ] B9 Spend | Money in segmented
- [ ] B10 "Where, like Corner Grocer" field
- [ ] B11 The guess line: "The category comes from the merchant", then the
      guessed category as he types
- [ ] B12 Three ways in: Scan a receipt (up to 3 photos), Imports folder
      (checked every 5 min), Budget app (its export)
- [ ] B13 On Add: the line lands in Latest, the totals count to their new
      values, a pill with Undo

### Budget sheet
- [ ] B14 Cancel / glyph + category / Save
- [ ] B15 Three months as bars in the category's hue, current solid, the
      budget as a line with its label
- [ ] B16 The amount at 48 pt with the number pad
- [ ] B17 "Typing $ or commas is fine. Empty clears the budget."
- [ ] B18 Chips: "$263 · 3-month average", Ask why (the Discuss door)
- [ ] B19 Save: the capsule retracts or grows in place, a pill with Undo

### Line sheet (r3)
- [ ] B20 Monogram 48, name 20, "Today · from a bank export", amount 28
- [ ] B21 "Category · tap to change": nine buttons in three columns, each in
      its hue, the current one solid
- [ ] B22 Split across two categories (build only if it fits uncluttered)
- [ ] B23 The note field
- [ ] B24 "File every Corner Grocer line this way" switch, off: only this line
- [ ] B25 Footer: where it came from, and Delete line
- [ ] B26 Save: the row changes in place, a pill with Undo; Delete: the row
      leaves, a pill with Undo

### Budget app link sheet (85 Import frame)
- [ ] B27 "Your budget app" with ✕
- [ ] B28 Serif "Nova reads its export, the same way it reads your bank's."
- [ ] B29 The four-step path: Export on its website › Save it as CSV › Into
      Money/Imports › Nova asks you, with the file travelling
- [ ] B30 The steps in words, and "Nova never signs in to it…"
- [ ] B31 Chips: Open its website, Check now

### Import (90 Import frame)
- [ ] B32 The decide card: "Lines to file · waiting on you", serif "41 new
      lines from your budget app's export.", the range and the left-out count
- [ ] B33 The preview bar by category hue
- [ ] B34 Which account does this file cover? (chips)
- [ ] B35 Look through / Talk / ✕
- [ ] B36 The look-through sheet: file name, "41 lines · 1 to 30 September",
      New | Left out, the lines by day, File all 41 into September
- [ ] B37 Their category › Nova's category on each line
- [ ] B38 The receipt "Filed 41 lines into September" with Undo

### The .xlsx card (90 .xlsx frame)
- [ ] B39 "A file Nova can't read yet · waiting on you"
- [ ] B40 Serif "transactions.xlsx is a spreadsheet. Nova reads CSV files."
- [ ] B41 The three numbered steps (Numbers, Export To CSV, Nova finds it)
- [ ] B42 Done, check now / Talk / ✕ (leave the file)

## C · States (85 States frame)
- [ ] C1 Loading: a skeleton where the hero, tiles and a card will land; never
      "Loading" above "empty"
- [ ] C2 Empty month: the dashed donut, "Nothing filed yet", "Add a line, or
      drop an export in the folder and Nova will ask."
- [ ] C3 Offline: the hero dimmed, "Left to spend, at 9:12", "Budgets and the
      ＋ button are paused, not hidden."; every write control disabled
- [ ] C4 Demo: invented data, labelled
- [ ] C5 A past month: no "this month" anywhere; "Spent in September"

## D · Mac at 1280 (90 Mac frame)
- [ ] D1 One top row: title, month pill, the news line, ⋯, ＋
- [ ] D2 Three columns: the month (hero, tiles, pace with compare); what is
      planned (budgets, the rise, Coming up with confidence); the lines
      (Latest with the selected row lit, the line sheet as a side pane)

## E · Motion
- [ ] E1 Cards rise once in a 40 ms stagger
- [ ] E2 The donut's arcs draw in a 90 ms stagger; the pace tick fades in
- [ ] E3 Legend pills scale in from .9
- [ ] E4 Figures count up from zero on arrival (hero, tiles, totals)
- [ ] E5 Tile bars and step bars grow from the baseline
- [ ] E6 The pace line draws (dashoffset), the area fades in after it
- [ ] E7 Capsules fill (scaleX), the over tab follows after the fill
- [ ] E8 Calendar coins pop in a stagger; strip dots drop in
- [ ] E9 The source bar grows
- [ ] E10 Sheets rise and fall the way they came; drag down to dismiss
- [ ] E11 Every write leaves ONE pill with Undo (the shared receipt)
- [ ] E12 Rows find their places (FLIP) on add, delete and filter
- [ ] E13 Reduced motion: end states at once, short cross-fades
- [ ] E14 Transform, opacity and clip only (height only for the FLIP card)

## F · Copy, said as drawn
- [ ] F1 No em or en dashes in any visible copy; no "it's not X, it's Y"
- [ ] F2 Sentence case everywhere
- [ ] F3 "budget app" in the UI (his call 3 open: naming Billroo)

## G · The audit's findings, fixed
- [ ] G1 The merchant name gets the row's width (category on its own line)
- [ ] G2 Deletes are undoable through the shared receipt; no 16 pt ✕
- [ ] G3 "$250" and "1,200" parse as 250 and 1200; an unreadable amount keeps
      the old budget and says so
- [ ] G4 Manual add, delete, recategorise, note and budget ride the inbox
      rails as filed records with undoData
- [ ] G5 Honest loading and empty states (C1, C2)
- [ ] G6 The offline flag is read (C3)
- [ ] G7 "This month" changes with the month picked (C5)
- [ ] G8 Every function in audit §3 Keep stays (the cap said, deterministic
      report and categories, honest subscription rule)

---

## CLUTTER BUDGET

Objects above the fold, counted the audit's way (containers plus tap targets
whose box crosses the first 728 pt under the top bar; a chart counts once, its
marks do not; plain text rows are content).

- Round 2 (mockup 85, Month frame), measured in the mockup: **7** (⋯, ＋, the
  month pill, the hero card, the Money-in tile, the Against tile, the pace
  card's top edge).
- The build's budget: **at most 7** on the phone at 390, in every state.
  Events never add a card to the top of the page: an over budget lives on its
  capsule and in the news line, a price rise in Price watch, a bill in Coming
  up, an unusual charge on its row. Anything secondary goes one level deeper
  (the ⋯ sheet or a pushed page).

## INTEGRATION TABLE

Money events become real signals. Detected by code (`server/lib/moneySignals.js`)
every five minutes on the import watcher's tick; each event files ONE record
(kind `money`) on the inbox rails, keyed so it never files twice.

| Event | Rule (code) | Who hears it | How it reaches him | Push |
| --- | --- | --- | --- | --- |
| Subscription price rise | the latest charge of a recurring merchant is > 2% above the one before, charged in the last 35 days | Nova (ask context + consult), the CFO (consult `cfo`), the Inbox | Inbox card with Talk about it; Price watch card on Money (Keep it / Talk / ✕ files a To-Do); Home money moment with Discuss | Yes, held in quiet hours |
| Category over budget | this month's spend in a budgeted category > its budget | same | Inbox card; the capsule's hatched tab and the news line on Money; Home moment | Yes, held in quiet hours |
| Bill due within 3 days | a recurring charge's next date is today to 3 days out | same | Inbox card; Coming up says when in gold; Home moment | Only the day before (due tomorrow), held in quiet hours |
| Unusual charge | a spend in the last 7 days more than 2.5x that merchant's median over at least 3 earlier charges | same | Inbox card; the row on Money carries "3x usual"; its line sheet has Ask about it; Home moment | No |
| A file Nova cannot read (.xlsx and kin) | a spreadsheet in Money/Imports | the Inbox | the honest .xlsx card on Money and in the Inbox | No |

- Quiet hours are his setting (lib/quietHours.js; the brief names 22:30 to
  05:00); every push goes through `sendPush`, which holds and delivers.
- Ask Nova and the CFO read this month's money through the consult channel:
  the registry gains `cfo`, a code-read source like the calendar
  (`moneyContext()`), and Nova's ask context carries the same block. Every
  number in it is computed by code; the model never writes one.
- Discuss / Talk on an event opens the Nova conversation with the event
  quoted (`talkAboutInbox`, the house door).
- Home (summary): a Money moment appears only while a money record waits on
  him; nothing when all is fine.

## RESULT

(filled in at verification)
