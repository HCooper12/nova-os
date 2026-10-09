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
- [x] A1 PRESENT · Large title "Money", 34 pt bold, tight tracking
- [x] A2 PRESENT · ⋯ button, 44 pt round, neutral glass; opens the menu sheet
- [x] A3 PRESENT · ＋ button, 44 pt round, violet fill (`--nv-vi`), opens the add sheet
- [x] A4 PRESENT · Month pill, 44 pt, "October 2026 ⌄"; picks any month the ledger has
- [x] A5 PRESENT · The serif news line (20 pt) with the violet live dot, written by code
      ("$1,391 spent with six days left. Under pace overall, but Eating out is
      $38 over."); the over-budget category named in its own hue

### Hero (violet bloom card)
- [x] A6 PRESENT · Donut 150 pt: one arc per category in its hue, against the month's
      total budget, on a track
- [x] A7 PRESENT · The white pace tick at today's share of the month
- [x] A8 PRESENT · Donut centre: spent (SF Rounded 26) and "of $1,870"
- [x] A9 PRESENT · "Left to spend", the figure at 40 pt, counted up from zero on arrival
- [x] A10 PRESENT · "About $80 a day for the 6 days left"
- [x] A11 PRESENT · "Under today's pace by $117, the white tick" (or "Over …")
- [x] A12 PRESENT · Legend: a solid pill per category, its hue, glyph and name; "Other"
      in ink

### Tiles
- [x] A13 PRESENT · Money in: coin glyph, "Money in", "+$3,400" (28 pt), "1 payment,
      Friday"; the 22/22/22/40 corner shape
- [x] A14 PRESENT · Against September: "−5%" (28 pt), the trend arrow and "$75 less",
      two bars Sep/Oct; the 22/40/22/22 shape
- [x] A15 PRESENT · (r3) The Against tile is a door: a chevron, and a tap opens Compare

### Pace card
- [x] A16 PRESENT · "October so far" / "day 25 of 31"
- [x] A17 PRESENT · (r3) Segmented "Budget pace | Last month", 44 pt
- [x] A18 PRESENT · The dotted even pace of the budget, the October line (draws), the
      violet area under it, today's dot, "Budget $1,870", "$1,391 today"
- [x] A19 PRESENT · Axis "1 Oct · 15 · 31"
- [x] A20 PRESENT · (r3) Key: October, September same days, budget's even pace
- [x] A21 PRESENT · (r3 Compare) September's line to the same day and on to its end,
      its dot, "Sep ended $1,742"; the ideal line dims
- [x] A22 PRESENT · (r3 Compare) The serif "where did it go" sentence, written by code:
      the category that moved most, named only at ≥ $40 and ≥ a fifth of
      itself, with its visit count against last month's; otherwise "No one
      category moved much…"
- [x] A23 PRESENT · (r3 Compare) "Less than September | More": a diverging bar per
      category that moved ≥ $10, each in its hue, signed amount right
- [x] A24 PRESENT · (r3 Compare) The rule paragraph, saying how many moved < $10

### Budgets
- [x] A25 PRESENT · "Budgets" + "$1,351 of $1,870"
- [x] A26 PRESENT · A row per budgeted category: glyph tile in its hue, name, "$298 of
      $260", the capsule (track = budget, fill to the limit line)
- [x] A27 PRESENT · Over budget: the fill runs past the line into a HATCHED tab in the
      category's hue, the outlined "$38 over" pill; NEVER red
- [x] A28 PRESENT · Over rows sort first, then by how full
- [x] A29 PRESENT · The dashed "No budget yet: Entertainment, Other · $40" row, a door
- [x] A30 PRESENT · A row opens the budget sheet

### Price watch
- [x] A31 PRESENT · "Price watch" + "1 change"; only while a rise is waiting
- [x] A32 PRESENT · Gold-edged decide card: "A price went up · waiting on you"
- [x] A33 PRESENT · Serif "Reelhouse is now $18.99 a month."
- [x] A34 PRESENT · The step bars: past charges, the new one with its step hatched in
      gold, month labels
- [x] A35 PRESENT · "Up $2.00 a month, $24 a year. It tipped Subscriptions $1 over its
      budget." (the second sentence only when true)
- [x] A36 PRESENT · Keep it (green), Talk, ✕ ("Don't keep it": a To-Do to cancel before
      the next charge, with Undo)

### Coming up (r3 Bills: confidence in words)
- [x] A37 PRESENT · "Coming up" + "how sure, from each one's history"
- [x] A38 PRESENT · The calendar: 5 weeks from this Monday, M to S, past days dim,
      today ringed in violet, "Nov" at the 1st
- [x] A39 PRESENT · A coin per predicted charge, its category's hue, sized by amount;
      A guess drawn hollow
- [x] A40 PRESENT · Likely: a window bar under the days it may land on
- [~] A41 DIFFERS · Bill rows: monogram (hollow for a guess), name, "when · cadence",
      Why: the rows are the next three charges by date; the mockup hand-picked one of each word to show them. Every word still appears on All recurring.
      amount
- [x] A42 PRESENT · The word: Sure (solid), Likely (tinted), A guess (outlined),
      computed over EVERY gap
- [x] A43 PRESENT · The strip: one dot per past charge against the expected day
- [x] A44 PRESENT · The sentence ("9 charges, every one on a Thursday." / "3 charges,
      each within 2 days…" / "Seen twice, 31 days apart…")
- [x] A45 PRESENT · "All 6 recurring ›" pushes the full recurring page

### Latest (B's list)
- [x] A46 PRESENT · "Latest" + "All 64"
- [x] A47 PRESENT · Day groups: "Today" + the day's total, "Yesterday", then dates
- [x] A48 PRESENT · Rows: monogram in hue (money in: an inflow glyph, outlined), the
      name at full width (single line, ellipsis), category dot + name, amount
- [x] A49 PRESENT · "up $2" in gold beside a risen subscription
- [x] A50 PRESENT · (r3) A row is a door: it opens the line sheet
- [x] A51 PRESENT · "See all 64 lines ›" pushes the full list (search, swipe to delete
      with Undo, "showing 120 of N" said when it applies)

### Where lines come from
- [x] A52 PRESENT · Head + month
- [x] A53 PRESENT · Source bar (bank exports / typed / receipt scans) in violet shades,
      counts in the legend, "budget app · not linked" as a hollow slot
- [x] A54 PRESENT · "Nova checks Money/Imports every five minutes and asks before
      filing anything. Last import Thursday."
- [x] A55 PRESENT · Chips: Check now, Link your budget app
- [~] A56 DIFFERS · (90 Month frame) the calendar's coins as doors
      Why: a day cell is 42 pt and can hold two coins, so a coin cannot be a 44 pt target; the bill rows under the calendar carry the same detail, and All recurring has every one.

## B · Sheets and pages

### ⋯ menu
- [x] B1 PRESENT · Draft September's report · On the rails, for your approval
- [x] B2 PRESENT · Export FY26-27 · A CSV of every line
- [x] B3 PRESENT · Check the imports folder · Money/Imports, also every 5 minutes
- [x] B4 PRESENT · Scan a statement or receipt · Drafted to the Inbox
- [x] B5 PRESENT · Bring in your budget app · Its export, through the imports folder
- [x] B6 PRESENT · How money gets in · Exports, scans, and "coffee 6.50" anywhere

### Add sheet
- [x] B7 PRESENT · Cancel / "Add a line" / Add (disabled until valid)
- [x] B8 PRESENT · The amount at 48 pt with "$" and the caret; the number pad
- [x] B9 PRESENT · Spend | Money in segmented
- [x] B10 PRESENT · "Where, like Corner Grocer" field
- [~] B11 DIFFERS · The guess line: "The category comes from the merchant", then the
      Why: the guess comes from his own history ("Filed as Eating out, like your last Kettle & Crumb line"); otherwise it says the server decides. The server's keyword map is not copied to the phone.
      guessed category as he types
- [x] B12 PRESENT · Three ways in: Scan a receipt (up to 3 photos), Imports folder
      (checked every 5 min), Budget app (its export)
- [x] B13 PRESENT · On Add: the line lands in Latest, the totals count to their new
      values, a pill with Undo

### Budget sheet
- [x] B14 PRESENT · Cancel / glyph + category / Save
- [x] B15 PRESENT · Three months as bars in the category's hue, current solid, the
      budget as a line with its label
- [x] B16 PRESENT · The amount at 48 pt with the number pad
- [x] B17 PRESENT · "Typing $ or commas is fine. Empty clears the budget."
- [x] B18 PRESENT · Chips: "$263 · 3-month average", Ask why (the Discuss door)
- [x] B19 PRESENT · Save: the capsule retracts or grows in place, a pill with Undo

### Line sheet (r3)
- [x] B20 PRESENT · Monogram 48, name 20, "Today · from a bank export", amount 28
- [x] B21 PRESENT · "Category · tap to change": nine buttons in three columns, each in
      its hue, the current one solid
- [~] B22 DIFFERS · Split across two categories (build only if it fits uncluttered)
      Why: Split is left out. It needs a line to hold two categories, budgets to count each part and the FY export to write one row per part (his call 3, still open), and it adds a fourth control row to the sheet. Left out rather than cluttered.
- [x] B23 PRESENT · The note field
- [x] B24 PRESENT · "File every Corner Grocer line this way" switch, off: only this line
- [~] B25 DIFFERS · Footer: where it came from, and Delete line
      Why: the footer says where the line came from ("From a bank export"); there is no account field in the ledger to name an account.
- [x] B26 PRESENT · Save: the row changes in place, a pill with Undo; Delete: the row
      leaves, a pill with Undo

### Budget app link sheet (85 Import frame)
- [x] B27 PRESENT · "Your budget app" with ✕
- [x] B28 PRESENT · Serif "Nova reads its export, the same way it reads your bank's."
- [x] B29 PRESENT · The four-step path: Export on its website › Save it as CSV › Into
      Money/Imports › Nova asks you, with the file travelling
- [x] B30 PRESENT · The steps in words, and "Nova never signs in to it…"
- [x] B31 PRESENT · Chips: Open its website, Check now

### Import (90 Import frame)
- [~] B32 DIFFERS · The decide card: "Lines to file · waiting on you", serif "41 new
      Why: the card names the file ("41 new lines from transactions.csv"), not "your budget app": a CSV does not say which app wrote it.
      lines from your budget app's export.", the range and the left-out count
- [x] B33 PRESENT · The preview bar by category hue
- [~] B34 DIFFERS · Which account does this file cover? (chips)
      Why: the account chips are left out: nothing in the dedupe reads an account yet, so the chips would be a control that changes nothing.
- [x] B35 PRESENT · Look through / Talk / ✕
- [~] B36 DIFFERS · The look-through sheet: file name, "41 lines · 1 to 30 September",
      Why: Left out is said in words with its count; the server keeps no copy of the lines it left out, so they are not listed.
      New | Left out, the lines by day, File all 41 into September
- [~] B37 DIFFERS · Their category › Nova's category on each line
      Why: each line shows Nova's category only. Mapping Billroo's Category column is his call 2, still open.
- [~] B38 DIFFERS · The receipt "Filed 41 lines into September" with Undo
      Why: the receipt is the shared pill with Undo (his 9 Oct call: a pill on every write), not a card on the page.

### The .xlsx card (90 .xlsx frame)
- [x] B39 PRESENT · "A file Nova can't read yet · waiting on you"
- [x] B40 PRESENT · Serif "transactions.xlsx is a spreadsheet. Nova reads CSV files."
- [x] B41 PRESENT · The three numbered steps (Numbers, Export To CSV, Nova finds it)
- [x] B42 PRESENT · Done, check now / Talk / ✕ (leave the file)
- [~] B43 DIFFERS · (90 Import frame) the Money/Imports drop strip with the file landing
      Why: the folder is checked every five minutes, so a live "waiting for a file" strip would be a permanent object above the fold, over the clutter budget; the card appears when the file is found, and the budget app sheet acts out the file's path.

## C · States (85 States frame)
- [x] C1 PRESENT · Loading: a skeleton where the hero, tiles and a card will land; never
      "Loading" above "empty"
- [x] C2 PRESENT · Empty month: the dashed donut, "Nothing filed yet", "Add a line, or
      drop an export in the folder and Nova will ask."
- [x] C3 PRESENT · Offline: the hero dimmed, "Left to spend, at 9:12", "Budgets and the
      ＋ button are paused, not hidden."; every write control disabled
- [x] C4 PRESENT · Demo: invented data, labelled
- [x] C5 PRESENT · A past month: no "this month" anywhere; "Spent in September"

## D · Mac at 1280 (90 Mac frame)
- [x] D1 PRESENT · One top row: title, month pill, the news line, ⋯, ＋
- [~] D2 DIFFERS · Three columns: the month (hero, tiles, pace with compare); what is
      Why: three columns of 1.08 : 1 : 1, not 400 / 1fr / 384: with the sidebar open the page is 962 wide and the fixed widths squeezed the middle column (found in the frame).
      planned (budgets, the rise, Coming up with confidence); the lines
      (Latest with the selected row lit, the line sheet as a side pane)

## E · Motion
- [x] E1 PRESENT · Cards rise once in a 40 ms stagger
- [x] E2 PRESENT · The donut's arcs draw in a 90 ms stagger; the pace tick fades in
- [x] E3 PRESENT · Legend pills scale in from .9
- [x] E4 PRESENT · Figures count up from zero on arrival (hero, tiles, totals)
- [x] E5 PRESENT · Tile bars and step bars grow from the baseline
- [x] E6 PRESENT · The pace line draws (dashoffset), the area fades in after it
- [x] E7 PRESENT · Capsules fill (scaleX), the over tab follows after the fill
- [x] E8 PRESENT · Calendar coins pop in a stagger; strip dots drop in
- [x] E9 PRESENT · The source bar grows
- [x] E10 PRESENT · Sheets rise and fall the way they came; drag down to dismiss
- [x] E11 PRESENT · Every write leaves ONE pill with Undo (the shared receipt)
- [x] E12 PRESENT · Rows find their places (FLIP) on add, delete and filter
- [x] E13 PRESENT · Reduced motion: end states at once, short cross-fades
- [x] E14 PRESENT · Transform, opacity and clip only (height only for the FLIP card)

## F · Copy, said as drawn
- [x] F1 PRESENT · No em or en dashes in any visible copy; no "it's not X, it's Y"
- [x] F2 PRESENT · Sentence case everywhere
- [x] F3 PRESENT · "budget app" in the UI (his call 3 open: naming Billroo)

## G · The audit's findings, fixed
- [x] G1 PRESENT · The merchant name gets the row's width (category on its own line)
- [x] G2 PRESENT · Deletes are undoable through the shared receipt; no 16 pt ✕
- [x] G3 PRESENT · "$250" and "1,200" parse as 250 and 1200; an unreadable amount keeps
      the old budget and says so
- [x] G4 PRESENT · Manual add, delete, recategorise, note and budget ride the inbox
      rails as filed records with undoData
- [x] G5 PRESENT · Honest loading and empty states (C1, C2)
- [x] G6 PRESENT · The offline flag is read (C3)
- [x] G7 PRESENT · "This month" changes with the month picked (C5)
- [x] G8 PRESENT · Every function in audit §3 Keep stays (the cap said, deterministic
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

## RESULT (10 Oct 2026, demo mode only, frames in the session scratchpad)

Built against mockup 85's Money tab and mockup 90's chosen frames, each state
photographed at 390 (and 375, and 1280) in demo mode with every non-GET
request refused by a guard (it recorded none).

- **Tally: 131 lines. 119 PRESENT, 12 DIFFERS (each with its reason above), 0 MISSING.**
- **Clutter: 7 objects above the fold at 390, the same 7 as round 2**
  (measured the same way in both: ⋯, ＋, the month pill, the hero, the two
  tiles, the pace card's top edge). A waiting import or .xlsx card adds one
  decision card while it waits; the offline band adds one while offline.
- **The worst case (break-ui):** 135 lines (the 120 cap said on All lines), a
  60-character merchant (one line with an ellipsis in the list, two lines in
  its sheet), $1,234,567.89 (the hero and the donut's centre now step down a
  size; they were clipped), a refund in Shopping (+$89.95, "Shopping ·
  refund"), an empty month (its own state, with Add and Check the folder), a
  category with no budget (the dashed "No budget yet" door). No sideways
  scroll at 375, 390 or 1280.
- **Integration**, by test (server/test/moneySignals.test.js): the four events
  on a pinned clock, one record each and never twice, pushes only for a rise,
  an over or a bill due tomorrow, quiet hours 22:30 to 05:00 holding and
  delivering, the .xlsx card, every manual write's undo, and the CFO's
  code-computed read through the consult rail. Home's Money row and its
  Discuss door photographed opening the thread with the alerts quoted.
