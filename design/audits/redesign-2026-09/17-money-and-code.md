# 17 · Money and Code: audit, 5 Oct 2026

Two small screens audited together because they fail the same way. Each is a
stack of unrelated panels with no focal point, and each puts its most
important decision (a budget on Money, a commit on Code) in the hardest place
on the page to reach. Judged against his brief ("simplicity with all
functionality and a beautiful aesthetic, along with ease of use MUST be the
goal") and against the Coach deck as his reference for "simple".

Evidence: `Money.jsx` (155 lines), `valsMoney.js` (127), `ClaudeCode.jsx`
(143) and the Code slice of `valsMisc.js` read in full, with the actions they
call in `App.jsx` and the server routes and libraries behind them
(`server/routes/money.js`, `server/lib/money.js`, `server/lib/cfoReport.js`,
`server/routes/claudeCode.js`, `server/lib/codeChanges.js`). Frames in DEMO
MODE ONLY, 390×844 at 3x, style `summary`, theme `command`, material `glass`,
with every non-GET request refused by a guard (none was attempted). Demo mode
renders neither screen's connected body, so the connected state was measured
on a scratch harness that rendered the real `Money.jsx` and `ClaudeCode.jsx`
with invented data (§5). Read under `apple-hig-review`; each citation names
the file and heading it was read from.

PRIVACY: the repo is public. Every amount, merchant, category total,
subscription, path, message and transcript line in this file is invented or
is a count. No real data was loaded at any point.

---

## 1 · Verdict

**Critical issues.** Money is five panels (summary, feeds, categories,
subscriptions, ledger) in three unrelated list styles, with a browser dialog
inside it and 120 delete marks 16 points wide. Code is a decorative terminal
window whose one consequential act, the commit, sits clipped inside a
209-point scroll box. The number that says it: **on a 390-point phone the
Money ledger gives a merchant's name 8 points of width** when its row's
category is "Health & Fitness" (21 points for "Utilities & Bills"), so a name
breaks into a column of two or three letters a line and the page reaches
**13,735 points, 16 screens**, at the 120-row cap.

### Clutter numbers, as it stands (checklist §3)

Connected numbers come from the harness (§5); demo numbers from the real app.

| Test | Money | Code |
| --- | --- | --- |
| Focal point | None. Five panels of equal weight; the month's total is in the first card but shares it with two chips | None. The console card is 460 pt tall and mostly empty transcript; the commit is clipped |
| Objects on the first screen (containers + tap targets, 390) | 11 (3 cards, 3 category rows, 4 chips, 1 month select) | 10 (3 cards, 3 chips, Show diff, the message field, Run, the model select); demo 8 |
| Page height, 390 | 13,735 pt, 16.3 screens at the 120-row cap; 1,545 pt (1.8 screens) before the first ledger line | 1,246 pt, 1.5 screens (the console is fixed at 460 pt) |
| Page height, 1280 | 6,674 pt, 8.3 screens (rows 47 pt each once the merchant fits) | 800 pt, one screen |
| Type sizes (all text, 390) | 10: 34, 30, 16 (fields), 15, 13.5, 13, 12.5, 12, 11.5, 11; 8 without numerals and fields | 9: 30, 27 (serif), 16 (fields), 15, 13.5, 13, 12.5, 12, 11 |
| Controls under 44 pt / under 28 pt (390) | 248 of 258 / 120 (every ✕ is 16×17 pt) | 3 of 11 (Show diff 32, commit field 39, model select 36) / 0 |
| Controls under the Mac minimum (20 pt, 1280) | 120 (the ✕ again) | 0 |
| Motion | None. No entrance, no exit; bars do not draw; only the shared 2% press spring | Message fade-up, busy dots, a connection dot pulsing forever; all inline, none honours reduced motion |
| Loading | No skeleton. The header says "Loading…" while the cards below say "The ledger is empty" and "Nothing recurring detected yet" | No initial load; the Builder streams text; the Breaker shows nothing moving for up to 10 minutes |
| Empty | "$0.00 spent", a zero that reads as a quiet month; By category vanishes | Honest copy |
| Offline / error | Header says offline; every write control stays live (`moneyReadOnly` is computed and read nowhere); failures are toasts | "Not connected" in words; controls stay live and answer with a toast; errors as a red SYSTEM line |
| Demo | Header only: "Connect a backend to see the ledger" | The full console, empty |
| Width (`scrollWidth`, 390 / 1280) | 390 / 1042 of 1042 | 390 / 1042 of 1042 |
| Hues on the page | 5: gold (four meanings), cyan, violet, warn, good | 4: gold, magenta (the Leader's), warn, cyan, plus a literal `#5aa87c` |

---

## 2 · Findings, ranked by visible gain per hour, both screens

### 1 · The ledger squeezes the merchant to a few points, and the page to 16 screens
`Money.jsx:131-146`; harness frames at 390

Each row is a flex line of a 42 px date, the merchant (`flex:1; min-width:0;
overflow-wrap:anywhere`), the category as a `nowrap` text action, an 86 px
amount and the ✕. The category is the one that does not give way, so the
merchant takes what is left: 49 pt beside "Groceries", 24 beside
"Subscriptions", 21 beside "Utilities & Bills" or "Entertainment", **8 beside
"Health & Fitness"**. Rows ran from 47 to 270 pt tall in the harness; the same
120 rows at 1280 are all 47 pt. The categories are the server's fixed list
(`server/lib/money.js:18`), so this happens with any long merchant name.

| Before | Why | Severity |
| --- | --- | --- |
| A five-column row on a 358 pt line; the merchant column is what is left | `lists-and-tables.md › Content`: "Keep item text succinct so row content is comfortable to read… consider ways to preserve readability of text that might otherwise get clipped or truncated." `layout.md › Best practices`: "Make essential information easy to find by giving it sufficient space." | Critical |

### 2 · 120 delete marks at 16×17 points, and the delete has no way back
`Money.jsx:143-145`; `App.jsx:5869-5881`; `server/lib/money.js:143-156`

The ✕ is an 11 px glyph with 2×4 px padding. Under 28 pt on the phone and
under 20 pt on the Mac, on every row. A first tap shows a toast ("Tap ✕ again
to remove this transaction") for four seconds; the second deletes the line
from the month file. Nothing keeps it, so nothing can bring it back.

| Before | Why | Severity |
| --- | --- | --- |
| 120 sub-minimum targets; a permanent delete confirmed by a toast | `accessibility.md › Mobility`: "iOS, iPadOS 44x44 pt default, 28x28 pt minimum… macOS 28x28 pt, 20x20 pt." `alerts.md › Best practices`: "Avoid displaying alerts for common, undoable actions"; the house answer is the swipe row with Undo (`SwipeRow.jsx`). CLAUDE.md: "Everything writeable is undoable." | Critical |

### 3 · The commit is clipped inside a scroll box inside the console
`ClaudeCode.jsx:37-71`, `:43`; `valsChrome.js:175`; harness frames

With five changed files the diff panel reaches its `max-height:46%` of the
460 pt console: 211 pt visible of 305. The Commit button starts at y 483 and
the panel ends at 489, so 6 pt of Commit shows and Shelve is hidden; the
message field is 39 pt tall and mostly hidden. "Show diff" then opens a
`<pre>` of its own (max 320 pt) of which **15 points are visible**: three
nested scrollers inside the page. The transcript keeps 114 pt.

| Before | Why | Severity |
| --- | --- | --- |
| The decision lives two scroll boxes deep | `designing-for-ios.md › Best practices`: "it tends to be easier and more comfortable for people to reach a control when it's located in the middle or bottom area of the display." `layout.md › Visual hierarchy`: "Make controls easier to use by providing enough space around them." | High |

### 4 · Commit takes every change in the repo, says the 8-character rule only after, and leaves a toast
`server/lib/codeChanges.js:53-63`; `App.jsx:10741-10750`; `ClaudeCode.jsx:50-53, 62-66`

`commitChanges` runs `git add -A`: everything changed in the repo, including
another session's files (his concurrent-sessions memory names the shared
index as a hazard). The panel lists 8 files and "…and N more", and the commit
takes the N more too. The Commit button is enabled with an empty field; the
server refuses a message under 8 characters and the refusal arrives as a
toast. Success is a toast ("Committed sha · N files") that disappears; no
receipt stays in the conversation and there is no Undo, though an unpushed
commit can be undone without losing work.

| Before | Why | Severity |
| --- | --- | --- |
| No choice of files, validation after submit, the outcome as a vanishing toast | `entering-data.md › Best practices`: "Dynamically validate field values… make the button available only after people enter the data you require." `feedback.md › Best practices`: "When it makes sense, confirm that a significant action or task has completed." `undo-and-redo.md › Best practices`: "Show the results of an undo or redo." | High |

### 5 · A browser prompt sets a budget, and typing "$250" clears it
`valsMoney.js:34-39`; `App.jsx:5890-5895`; `server/lib/money.js:213-220`

Tapping a category opens `window.prompt`. The answer goes through
`Number()`: "$250", "1,200" or "abc" become `NaN`, `JSON.stringify` sends
`null`, the server's `Math.round(Number(null))` is 0, and 0 deletes the
budget. Checked in node with the same three steps: "$250" and "1,200" clear;
"250" sets. Nothing says so and there is no Undo.

| Before | Why | Severity |
| --- | --- | --- |
| An OS dialog in a designed surface; the most natural money input erases the value | `modality.md › Best practices`: "Make it easy to identify a modal view's task." `entering-data.md`: "consider using a number formatter, which automatically configures a text field to accept only numeric values." `alerts.md`: alerts are for "critical, actionable" information. | High |

### 6 · The manual writes skip the rails the screen says they ride
`Money.jsx:10-13`; `valsMoney.js:4-5`; `server/routes/money.js:26-59`

The screen's own header comment says "All writes ride the inbox rails". The
CSV drop, the scan and capture do. Manual add, remove, recategorise and
budget are direct writes with no record and no `undoData`. Recategorising also
sets a merchant override silently (`server/lib/money.js:158-171`: "the fix
holds for the merchant"), which the screen never says.

| Before | Why | Severity |
| --- | --- | --- |
| Four of seven write paths are unrecorded and unundoable | CLAUDE.md non-negotiables: "Everything writeable is undoable and rides the inbox rails." `undo-and-redo.md › Best practices`: "Help people predict the results of undo and redo." | High |

### 7 · States that contradict themselves
`valsMoney.js:81-93`; `Money.jsx:36, 94, 124`; `valsIndex.js:109-110`

Loading: the header says "Loading…" while the radar says "Nothing recurring
detected yet" and the ledger "The ledger is empty". Empty: "$0.00 spent", a
zero for no records. Offline: `moneyReadOnly` is computed and read nowhere,
so add, ✕, budget and recategorise stay live. Paging to September: the card
still says "THIS MONTH" over September's total; the Index's own builder
already refuses this lie ("he can page the Money screen back to August, and
'this month' would lie") and the screen tells it.

| Before | Why | Severity |
| --- | --- | --- |
| Four states written as one | `loading.md › Best practices`: "Show something as soon as possible… consider showing placeholder text, graphics, or animations." `writing.md › Best practices`: "Provide clear next steps on any blank screens." NOVA-METHOD: "Missing data says so; stale data self-labels." | High |

### 8 · Colour says nothing on either screen, and gold is still a commit colour
`Money.jsx:36, 43, 59, 103, 104, 120`; `ClaudeCode.jsx:14, 16, 18, 28, 43, 45, 64, 89`; `valsMisc.js:475`

Money uses gold for "This month", for the Monthly report chip, for "Nova
asks" and for a subscription due soon: four meanings. Over budget, the price
rise and the delta are red (`--nv-warn`), which the 4 Oct rule reserves for
Nova pushing back. Code's whole commit surface is gold (panel border,
eyebrow, focus ring), the Builder's tag and the busy dots are gold, the
Breaker wears `--nv-mg`, which is the Leader's hue (`glassMarks.js:34`,
`artifactClient.js:29`), and a neutral "Breaker engaged" line is red. The
console dots use a literal `#5aa87c` (rule 4: tokens only). Money's hue is
violet on its Index tile (`indexGroups.js:46`) and green on its being in the
Org map (`agentWorld/beings.js:128`, `habitat.js:32`); Code has no hue
(`indexGroups.js:52`, neutral ink).

| Before | Why | Severity |
| --- | --- | --- |
| Nine colour uses across two screens, none of them a meaning | `color.md › Best practices`: "Avoid using the same color to mean different things." §2b rule 8: gold is "not yet decided", never a default fill. `accessibility.md › Vision`: "Convey information with more than color alone." | High |

### 9 · Three panels of instructions and furniture take the first screen
`Money.jsx:48-61`; `ClaudeCode.jsx:10-11, 27-34, 130-138`

Money's Feeds card is a three-line paragraph, two chips (one with a 📷 emoji
as ornament) and a hint line, on every visit. Code shows "Read + edit files ·
no shell access" and then repeats it as a Can or can't card; its console
header is three traffic-light dots that do nothing, which is the "decorative
terminal window" on the global list of things a model reaches for. The
headline "Claude, direct line." names a mood, not what the page does. "Add to
vault" is Library's ingest door, repeated here in gold.

| Before | Why | Severity |
| --- | --- | --- |
| Static explanation and decoration ahead of the work | `designing-for-ios.md › Best practices`: "limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." Global CLAUDE.md: decorative terminal windows; a headline says what the thing does. | Medium |

### 10 · Destructive acts hidden in ordinary controls on Code
`App.jsx:10771-10778`; `ClaudeCode.jsx:17, 122`

Switching the Workspace segment from Nova OS to Vault, or tapping "+ New
session", wipes the conversation and the session id at once, with no question
and no Undo. The transcript is otherwise kept across reloads (`App.jsx:1671`).

| Before | Why | Severity |
| --- | --- | --- |
| A selection control that destroys | `segmented-controls.md › Best practices`: "Don't assign actions to segments in a control that otherwise represents selection state." `feedback.md`: "Warn people when they initiate a task that can cause data loss that's unexpected and irreversible." | Medium |

### 11 · The transcript does not say who is speaking, except by a coloured word
`ClaudeCode.jsx:78-91`; `valsMisc.js:475`

Every line is the same 12.5 px monospace paragraph with a "» BUILDER" or
"» BREAKER" prefix; the only difference between the two agents is the colour
of that word. Prose in monospace reads as a log. The busy dots follow the
Builder only (`codeBusy`); a Breaker run (`sparBusy`, `App.jsx:6587`) shows one
static line for up to ten minutes. The input's placeholder is clipped at 390
("(⏎ to s").

| Before | Why | Severity |
| --- | --- | --- |
| Authorship by colour alone, no progress for one of the two agents | `accessibility.md › Vision`: "Convey information with more than color alone." `loading.md › Showing progress`: "Clearly communicate that content is loading." | Medium |

### 12 · The price rise and the scan's question are news with nothing to do
`Money.jsx:59, 88-109`; `valsMoney.js:50-53`

The radar flags a rise with a red tag and offers no action. A scan that is
unsure shows "Nova asks: …" in gold with no field to answer. The radar is a
card holding a card per subscription; cadence is upper-cased in the vals
(`valsMoney.js:50`, §2b rule 3).

| Before | Why | Severity |
| --- | --- | --- |
| A question and a notice with no reply | §2b rule 8: decisions are a conversation (a tick, a cross, talk back). `feedback.md`: status near the item it describes. | Medium |

### 13 · Motion is absent on Money and ungoverned on Code
`Money.jsx` (none); `ClaudeCode.jsx:31, 86, 89`; `src/index.css` (no reduced-motion rule covers inline animation)

Money has no entrance, no drawn bars, no exit. Code's three motions are inline
`animation:` declarations, so no `prefers-reduced-motion` rule reaches them;
the connection dot scales to 1.28 forever.

| Before | Why | Severity |
| --- | --- | --- |
| Nothing acted out on one screen, nothing optional on the other | `motion.md › Best practices`: "Make motion optional." `accessibility.md › Cognitive`: reduce "automatic and repetitive animations, including zooming, scaling." §2b rule 5: motion is part of the object. | Medium |

### Smaller things seen
- Raw `<select>` three times (month `Money.jsx:24`, row category `:135`, model
  `ClaudeCode.jsx:112`), beside the house `Select` in `Controls.jsx:230`.
- Option backgrounds hard-coded `#141019` (`Money.jsx:26, 137`).
- "Monthly report" always reports the previous calendar month
  (`server/lib/cfoReport.js:28-31`) whatever month is on screen; it composes
  without a model ("no model call", `cfoReport.js:79`).
- A row's source sits in a `title` attribute (`Money.jsx:142`), invisible on
  touch.
- The Can or can't card says the Builder "can't use git" above a panel that
  commits with git; true of the agent, confusing on the page.
- Em dashes as a tic in the visible copy of both screens: the Spar chip, the
  Feeds paragraph, the empty ledger and radar lines, the Can or can't card, the
  shelved banner and the commit placeholder.

---

## 3 · Keep

- **The cap is said, never implied**: "showing 120 of N · older in the
  export" (`valsMoney.js:78-80`).
- **Shelve is a stash, never a discard**, with Restore, and Restore refuses a
  stash Nova did not make (`server/lib/codeChanges.js:65-91`). The model for
  every Code undo.
- **The vault is read-only for commits**, said in words (`ClaudeCode.jsx:58-59`).
- **The month report and categorising are deterministic**: a keyword map and
  arithmetic, no model (`server/lib/money.js:20-45, 263-300`).
- **Subscription detection is honest** about its rule ("it takes two charges
  from the same merchant at a steady interval").
- **The 23 Sep overflow fix** on the console header and the diff panel's own
  scroll, measured, not claimed; the next step is to stop needing it.
- **The Builder streams its words** as they arrive (`App.jsx:10719`).

---

## 4 · Directions for the mockup round

Mockup 80 draws all three for both screens, six frames each. Counts are
measured in the mockup with the same rule as §1 (containers and tap targets
on the phone's first 728 points; a chart counts once, its marks do not).

**A · One calm page.** Home's Summary grammar. Money: a large title with ⋯
and ＋, a month pill, the serif news line, a ring of the month against its
budgets with today's pace marked, every budget as one bar in one chart
(spend fills to the budget line; anything past it is hatched and said
"$38 over"), Coming up (a 30-day ruler, the rows, the rise as a card that
waits on him), and the month's lines by day. Removes the Feeds card, the
prompt, the ✕ marks; moves add, scan and imports into one add sheet, the
report and export into ⋯. Code: the thread with authors, the changes in a
tray above the composer that grows into the review. **Money 11 → 6, Code
10 → 7.** 4 type sizes on Money (34, 20, 15, 13).

**B · Two levels.** The Index's grammar. The top of each screen fits one
screen: Money's month as a 31-day strip and a ring per budget (a hatched
second lap is the overspend), with Transactions and Subscriptions as rows
that push their own pages, and each ring opening its category's page where
the budget is set. Code: a session card, the thread, Changes as a row that
pushes a full review page. **Money 11 → 9, Code 10 → 6.** The Mac version is
natural here: the pushed pages become a second column.

**C · Decisions first.** The Coach deck. Money opens on what waits for him
(the price rise, a budget over, imported lines, a scan's question) as cards
with a tick, a cross, Talk and one do-all, then the same budget chart as A;
adding is typing "coffee 6.50" at the foot, read by code into a card he
confirms. Code: a finished run is one card (asked, built, broken, fixed, the
change drawn) answered with Commit, Talk or the cross to shelve. **Money
11 → 11, Code 10 → 11**: the count holds because three verbs and a do-all
are the point of the card, where today's eleven are feeds and chips.

**What the pixels argue for.** The ledger squeeze, the clipped commit and the
prompt bug are fixed by any of the three. A for Money if he wants Home's
calm on one scroll; B if the ledger is the thing he opens most; C for Code,
because a run is a decision and the Coach deck is his own bar for simple.

---

## 5 · Method

**The look.** Detached snapshot of HEAD (97f2205) in the session scratchpad,
`npx vite --port 5210`, Chrome DevTools in its own isolated context, viewport
390×844 at 3x (mobile, touch) set before navigating; `localStorage` set to
style `summary`, theme `command`, material `glass`, core `hologram`; a guard
re-installed on every navigation that rejected any non-GET `fetch`, XHR or
beacon (it recorded none). "Demo data" confirmed on screen; demo mode was the
only app state photographed.

**The harness, and why.** Demo mode renders only Money's header
(`moneyConnected` is false whenever `demoMode` is) and Code's empty console
(`codeConnected` reads the stored connection). To measure the connected
bodies, a scratch page inside the snapshot imported the real `index.css`,
`theme.js`, `Money.jsx`, `ClaudeCode.jsx` and the real `valsMoney()`, and
rendered them inside a copy of the app's `main` with invented data: 135 lines
in one month, nine categories, five subscriptions, one price rise; a five-file
change set and a six-line transcript. Every action was a no-op recorder; the
harness had no backend. It was deleted with the snapshot. Its numbers depend
on the invented data where noted (page height at the 120-row cap; row heights
by category name); the widths and sizes do not.

**Sweeps.** Distinct computed `font-size` of every visible text node and
field; every visible clickable (native control, ARIA button, or `cursor:
pointer`), outermost only, with its smaller side; `scrollWidth` of the
document and of `main`; `getAnimations()` under the screen; nested scroll
boxes and their visible heights. At 1280 the real app was checked in demo
(sidebar 238 pt) and the harness at the matching 1042 pt main width.

**Objects on the first screen.** Containers (cards, panels, trays, the
composer) plus tap targets whose box crosses the first 728 points under the
top bar (the band between the 48 pt top bar and the tab bar at 776). Plain
text rows and thread messages are content, not objects. A chart counts once;
its tappable marks do not. The same rule was applied to today's screens and to
mockup 80, whose own page measures itself and prints the numbers in its bar.

**Not seen.** Anything of his: no connected session, no real ledger, no real
diff. A real scan, import or monthly report (each needs the backend; the scan
also calls a model, so it was never touched). The native `<select>` pickers
and the iOS keyboard on a phone. The command idiom and cupertino style (his
phone runs summary). Motion on a device. The month select with real months.
Whether his real merchant names are long enough to hit the worst squeeze
(the categories are fixed, so the narrowest columns are certain; how often a
long name meets them is not).

**Inventory notes, confirmed or corrected.** The prompt (confirmed, and worse:
the "$250" clearing bug). Three list styles (confirmed: category rows, nested
subscription cards, hairline ledger rows). Gold on Monthly report (confirmed
unresolved, `Money.jsx:43`). The diff panel's 46% cap "verified by
measurement" (confirmed as a fix for the transcript, and it is now what
clips the commit). Commit's resolved colour (the house `Button`, the theme
accent, cyan here; the gold is on the panel around it). The inventory's
"Spar" chip `tone` is a CSS variable, `var(--nv-mg)`, the Leader's hue
(newly noted).
