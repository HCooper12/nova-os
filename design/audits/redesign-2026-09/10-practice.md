# 10 · Practice: audit, 5 Oct 2026

Practice is the rehearsal room he asked for on 26 Sep: name a skill, Nova
builds a page of moves and scenes from his sources, plays the other person
in character, and code writes the notes from the hidden NOTE and DEBRIEF
lines. Its hue is `--nv-or` (#ffa257 in Command) and its one object is the
lamp: one per move, dim until he lands it. Judged against his own bar for
"simple", the Coach deck (one sentence, the change drawn, a light tick or
cross, talk back, Undo), and against checklist §3.

Evidence: source read in full (`src/screens/Practice.jsx` 489 lines,
`src/vals/valsPractice.js` 287, `src/PracticeLamps.jsx` 48,
`src/PracticeCard.jsx` 86), plus every Practice method in `src/App.jsx`, the
Summary Home tile in `src/screens/MissionSummary.jsx`, and the server code
the screen depends on (`server/lib/practice.js`, `server/lib/practiceLane.js`).
Photographed in DEMO MODE ONLY, at 390×844 in his look (summary × command ×
glass) and at 1280×800, in a detached snapshot of `f60e8a9`. Demo mode shows
the room empty, so a state fixture at his real page's scale was set straight
into the page's React state (invented content; no connection; every non-GET
request refused by a guard, and none was attempted). His actual use was read
from the server's own records as counts, kinds and times only. Read under
`apple-hig-review`: 16 reference pages opened, 14 of them cited as
`file.md › Heading`, with "judgment" where none applies. Method and limits are in §5.

---

## 1 · Verdict

**Critical issues, of one small kind; the real problem is shape.** The only
Critical item is a 21 pt tap target. The finding that matters is that the
room has never been used.

The number that says it: **0**. The server log runs from 20 Sep to today. In
it, `POST /api/practice/rehearse` appears four times, all on 26 Sep, all from
the Mac (127.0.0.1) during the build's own live test, and never from his
phone (100.65.x). `server/data/practice.json` holds one scene, that test,
undone. His one real page has 6 moves and every one is at 0 tried. No second
skill has been prepared. The only sign of a visit is a probable six-second
pass through the room on 30 Sep at 18:18 AEST, inferred from the order of
his phone's requests (Notes, Library, Leader, Practice, Journal, about five
seconds apart). The open thread "Try Practice on the phone" (his ask, 26 Sep)
is still open. The brief for this audit says he has used it; the record says
he has not rehearsed.

What he meets when he does open it is a reference page with a rehearsal
inside it. From the Home tile the skill opens straight away: 3.04 screens at
390 (2,567 px), 12 type sizes, the skill's title twice, and "Rehearse"
offered four times for three scenes, with six move write-ups (about 250 px
each) between the first Rehearse and the scenes. On the stage the lamps that
are meant to light as a line lands have scrolled 540 pt off the top of the
screen by the sixth exchange. The debrief then says its verdict three times,
the first and last 1,270 px apart, and keeps Undo in an eight-second toast.

### Clutter numbers, as it stands (checklist §3)

| Test | Practice today (Nova glass, 390×844) | Target |
| --- | --- | --- |
| Focal point | Closed shelf: none. No Rehearse on the first screen; the largest object is Add a skill (a four-line explainer, a two-line box, Prepare). Opened skill: the Rehearse pill is above the fold (y 397 to 442) but shares the screen with the skill's title printed twice | One, above the fold |
| Objects above the fold | Closed shelf 8 (Rehearse 0). Opened skill 12 (2 controls, 4 panes, 8 lamps, 23 separate text blocks). Stage 15 (6 controls). Hand counts of cards, rows, chips, buttons and free-standing text from the frames; the sweep's own figures in brackets | Lower, or a reason |
| Verbs | Opened skill: Rehearse ×4, Upload the book, Open the page, Pause skill, Close, Prepare. Stage: mic, Send, Pause, End scene, Leave, the setting line. Debrief: Rehearse next, Done; Undo only in a toast | One primary, one quiet, talk back |
| Type sizes | Opened skill 12 (11, 12, 12.5, 13, 14.5, 15, 16, 16.5, 17, 18, 24, 30). Stage 11. Debrief 11. Closed shelf 7 | ≤ 3 (4 with numerals) |
| Tap floor | Opened skill: 10 controls, 1 under 44 (Upload the book, 32), 0 under 28. Stage: 6 controls, 4 under 44 (Leave 32, Pause 32, End scene 32, the setting line 21), 1 under 28. The Summary Home tile's Rehearse is 32 (from source) | ≥ 28; primary ≥ 44 |
| Gestures | None of its own. The skill rail scrolls sideways (one skill, so nothing to scroll). Every action is a tap | Every capability has a pixel |
| Motion | Entrances: yes (`shelfIn`, `nvGlassArrive`, `fadeUp`, `popIn`, the lamp's swell). Exits: none (closing the skill, Leave and Done unmount at once). Interruptible: one-shot keyframes only. Reduced motion: the global rule finishes every entrance at once (`index.css:2592-2596`), so no cross-fade | All four |
| States | Loading: no skeleton; the cached shelf covers most opens, and a first-ever load says "Connect a backend in Settings" while connected. Empty: honest copy. Offline: the last-known shelf, unlabelled in the room. Error: an errored prepare stays with no verb; turn errors are honest lines in the script; an unreadable debrief keeps the scene open to retry | All four designed |
| Width | `scrollWidth` 390 at 390 in all five states measured. At 1280 the room is one 1,042 px column | 390 |
| Page height | Closed shelf 1.0 screen. Opened skill 3.04. Stage 1.18 at five lines, 1.84 at eleven. Debrief 1.94 | ≤ 2 before a page |
| Idioms | No idiom branch in `Practice.jsx`. Under `summary` it renders the pre-redesign objects (a 30 pt serif title, uppercase eyebrows, `nv-pane`), while Train, Fuel and Inbox have Summary pages. `cupertino` not photographed separately (same components, different pane) | Both checked |
| Use | 0 rehearsals and 0 new skills from his phone since 26 Sep; 1 probable visit of about six seconds (30 Sep) | |

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 · The room is a reference page with the rehearsal inside it
`Practice.jsx:83-188` (SkillDetail), `:209-246` (Shelf), `:190-207`
(AddSkill); `App.jsx:10454-10457` (the Home tile opens the skill for him).
Frames: the closed shelf, and the opened skill at scrollTop 0, 1180 and the
foot.

The closed shelf offers no Rehearse at all: one 250 px skill card alone on a
rail, then an Add a skill pane taller than the skill. Opening the skill
prints its title a second time (serif 18 on the card, serif 24 below it),
then the summary, the why quote, and the Next card with the one prominent
Rehearse. Then six move write-ups, each a lamp, a name, the quoted line,
When, Tell, source and tally, about 250 px apiece and about 1,500 px in all,
before the Scenes list offers Rehearse three more times (the next scene's
twice over). Gaps, Open the page, Pause skill, Close and Add a skill follow.
The screen is laid out in the order the vault page is written, which is the
right order for a document and the wrong one for a room he comes to in order
to say something out loud.

| Before | Why | Severity |
| --- | --- | --- |
| The opened skill: 3.04 screens, six full move write-ups between the first Rehearse and the scenes, Rehearse ×4 for 3 scenes, the title twice | `lists-and-tables.md › Content`: "If each item consists of a large amount of text, consider alternatives that help you avoid displaying over-large table rows. For example, you could list item titles only, letting people choose an item to reveal its content in a detail view." `designing-for-ios.md › Best practices`: "limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." | High |
| The closed shelf: no Rehearse, and the biggest object is the box that asks for a new skill | `layout.md › Visual hierarchy`: "it generally works well to place the most important items near the top and leading side". Judgment: with one skill on the shelf, its next scene is the most important item. | High |

### 2 · The lamp lights where he is not looking
`Practice.jsx:375-404` (the stage head sits in the scroll), `:406-416`,
`:310-317` (the script follows the foot); `valsPractice.js:208` (the head goes
compact once the partner opens), `:209-212` (the latest quote). Measured with
an eleven-line fixture scene (5.5 exchanges): when the newest line is in
view, the lamps are 540 pt above the visible area; the script window between
the top bar (foot at 48) and the control bar (top at 646) is 598 pt.

The lamp is the room's signature, and `PracticeLamps.jsx:3-9` says why:
when a lamp goes from dim to lit "while he is looking at it" it swells, "so
the change is acted out". The head that holds the lamps scrolls with the
script, so from about the third exchange the swell and the orange quote play
off-screen. The NOTE that lights them also says where the scene is, `open`,
`mid` or `close` (`practiceLane.js:209`, `:317`, `:464`), and the client
drops that field (`App.jsx:10530-10550` reads only `moves` and `sceneOver`).

| Before | Why | Severity |
| --- | --- | --- |
| The lamps and the latest quote scroll off with the head; a move landed after the third exchange lights where nobody sees it | `feedback.md › Best practices`: "When status feedback is available near the items it describes, people get important information without having to take action or leave their current context." `motion.md › Providing feedback`: "Aim for brevity and precision in feedback animations... a succinct animation that's precisely tied to a successful action". | High |
| The scene's position (open, mid, close) arrives on every turn and is never shown | Judgment, under NOVA-METHOD §2b rule 7: information already paid for gets a form. | Low |

### 3 · The debrief says its verdict three times, and Undo lasts eight seconds
`Practice.jsx:375-404` (the full head returns at the debrief with each lamp's
quote or "instead" line), `:419-447` (How it went); `App.jsx:10605-10613`
(the debrief lands), `:10621` (`notify(...)` with `duration: 8000` holds
Undo).

At the debrief the head grows back to full size at the top (about 430 pt),
showing each move's quote or the line he could have used. Nova's spoken
paragraph lands at the foot of the script. How it went starts 1,270 px below
the lamps, with the best line, Work on and "2 landed · 1 missed · on the
page", then Rehearse next and Done. All three say the same thing. The filed
record's Undo is a toast for eight seconds, then the Inbox; the panel says
"on the page" and offers no way back where it says it.

| Before | Why | Severity |
| --- | --- | --- |
| One verdict in three places, the first and last 1,270 px apart | `layout.md › Best practices`: "Make essential information easy to find by giving it sufficient space... don't obscure it by crowding it with nonessential details." `writing.md › Best practices`: "Consider each screen's purpose. Pay attention to the order of elements on a screen, and put the most important information first." | High |
| Undo only in an eight-second toast, then the Inbox | `generative-ai.md › Outputs`: "surfacing controls like Edit, Undo, Retry, or Adjust near generated content preserves people's agency". `accessibility.md › Cognitive`: "Minimize use of time-boxed interface elements." | Medium |

### 4 · Orange means seven things
`Practice.jsx:96` (the next scene's name), `:116-117` (the When and Tell
labels), `:137` (the next tag), `:141` (Rehearse), `:154` (Upload the book),
`:182` (Open the page), `:253` (the partner's name), `:267` (the streaming
cursor), `:294` and `:396` (his landed words), `:367` and `:421` (eyebrows),
`:429` (Work on), `:443` (Rehearse next, solid), `:470` (Send), `:474` (End
scene); `index.css:3682-3731` (the lamps, the mic).

Counted directly: the practice hue marks a lit lamp, a section label, the
partner's name, tappable text, the primary button, his own landed words and
the live dot. In one move row the orange "When" is a label and, two rows
down, the orange "Rehearse" is a button.

| Before | Why | Severity |
| --- | --- | --- |
| Interactive orange text beside non-interactive orange text, lit lamps and the partner's name, all one hue | `color.md › Best practices`: "Avoid using the same color to mean different things... if you use your brand color to indicate that a borderless button is interactive, using the same or similar color to stylize noninteractive text is confusing." NOVA-METHOD §2b rule 8: colour means something. | High |

### 5 · Under Nova glass the room still wears its old clothes, in 12 sizes
`Practice.jsx:212-215` (the h1 is 400 30px serif with an uppercase 12 px
eyebrow beside it), `:28-29`, and inline sizes throughout; `index.css:1471`,
`:1813`, `:2172` (the Summary pages' large title, 700 34px SF, -0.025em).

Practice has no Summary page. Train, Fuel and Inbox each got one, so under
his style they open on a 34 pt bold SF title and the summary card grammar.
Practice opens on a 30 pt serif title with an uppercase eyebrow, the
pre-redesign pane, and twelve sizes on the opened skill (eleven on the
stage). It reads as a different app from its neighbours in the Index.

| Before | Why | Severity |
| --- | --- | --- |
| 12 type sizes; a 30 pt serif title and uppercase eyebrows under a style whose other pages use 34 pt bold SF and sentence case | `typography.md › Conveying hierarchy`: "Adjust font weight, size, and color as needed to emphasize important information and help people visualize hierarchy." Checklist §3: ≤ 3 sizes. NOVA-METHOD §2b rule 2: the house objects under `summary`. | High |

### 6 · Four of the stage's six controls are under 44 pt, one under 28
`Practice.jsx:368` (Leave, a compact TextAction, 32 pt), `:381-386` (the
compact setting line, a `role="button"` measured 328×21), `:473-474` (Pause
and End scene, compact, 32 pt); `Controls.jsx` TextAction (`compact` is 32
under the Apple styles); `MissionSummary.jsx:638-641` (the Home tile's
Rehearse, compact, 32).

| Before | Why | Severity |
| --- | --- | --- |
| The setting line is a 328×21 pt button | `accessibility.md › Mobility`: "Offer sufficiently sized controls"; its table gives iOS a 44x44 pt default and a 28x28 pt minimum. | Critical |
| End scene, Pause and Leave at 32 pt; the Home tile's Rehearse at 32 | `buttons.md › Best practices`: "a button needs a hit region of at least 44x44 pt". | Medium |

### 7 · Leave throws away a live scene in one small tap
`Practice.jsx:368` (Leave, top right, 32 pt; its only warning is a `title`
attribute, which a phone never shows); `App.jsx:10636-10641`
(`leaveRehearsal` clears the scene, the script and the lamps, with no
confirmation and no undo).

The transcript does survive on the server (`practice.json` keeps up to 40
scenes, `practice.js:575-608`), but nothing in the client brings it back.

| Before | Why | Severity |
| --- | --- | --- |
| One 32 pt tap ends a scene of any length, with no notes and no way back on the screen | `feedback.md › Best practices`: "Warn people when they initiate a task that can cause data loss that's unexpected and irreversible." `alerts.md › Best practices`: an alert is right for an "uncommon destructive action that they can't undo". | Medium |

### 8 · "Pause" is a turn, and the waits are blank
`Practice.jsx:473` (Pause); `App.jsx:10566` (`pauseRehearsal` sends the word
"pause" as his line, and the partner steps out of character for one
exchange). `Practice.jsx:410-415` (Setting the scene, three dots),
`:450-476` (the bar keeps four controls on screen, disabled, while he
waits).

Pause stops nothing: it spends a model turn asking the partner to step out.
In the build's test, read from the server log, the opening line came back
within about 36 s, later turns within 14 s and the debrief in 8 s (polled by
hand, so these are upper bounds). Through each wait the room shows dots and
a full bar of disabled controls.

| Before | Why | Severity |
| --- | --- | --- |
| A button named Pause that asks the partner a question | `buttons.md › Content`: "Ensure that each button clearly communicates its purpose." `writing.md › Best practices`: "Be action oriented... Prioritize clarity". | Medium |
| "Setting the scene" and three dots for up to about 36 s, under four disabled controls | `generative-ai.md › Outputs`: "Consider giving specific, reassuring feedback during generation. Messages that describe what's actually happening can be more helpful than a vague status message." `loading.md › Best practices`: "Show something as soon as possible." | Medium |

### 9 · An errored page stays on the shelf with nothing to do about it
`Practice.jsx:220-230`; `server/lib/practice.js:744-750` (every
`practice-skill` record in `error` is listed as preparing, with no age
limit).

| Before | Why | Severity |
| --- | --- | --- |
| A red-dot row with the server's error text and no Try again or Dismiss, kept indefinitely | `writing.md › Best practices`: "Write clear error messages... be clear about what someone can do to fix it." `feedback.md › Best practices`: "Show people when a command can't be carried out and help them understand why." | Medium |

### 10 · The Mac: one phone column, stretched
Measured at 1280×800: the room is one 1,042 px column; the partner's lines
run 962 px wide, about 140 characters a line at 17 px serif; the Next
sentence and its Rehearse sit 875 px apart; the control bar is sticky at the
window's foot (`Practice.jsx:451-454`).

| Before | Why | Severity |
| --- | --- | --- |
| One column across 1,042 px; a 962 px measure for the partner's lines; the controls on the window's bottom edge | `layout.md › Desktop (macOS)`: "Avoid placing controls or critical information at the bottom of a window." `designing-for-macos.md`: interactions there can mean "several hours of deep concentration" on a large display. The measure is judgment (45 to 75 characters reads comfortably). | Medium |

### 11 · Smaller things seen
- **The compact setting cuts a word in half** ("whet…") at 390
  (`Practice.jsx:385`, a CSS ellipsis). `lists-and-tables.md › Content`:
  "Consider ways to preserve readability of text that might otherwise get
  clipped or truncated." Low.
- **The unparsed-debrief warning cannot render.** `practiceDebrief` is only
  ever set on success, with `parsed: !!d` where `d` is already truthy
  (`App.jsx:10605-10613`, `valsPractice.js:249`), so `Practice.jsx:438-440`
  is unreachable. The inventory's first-look note, "the one place nothing
  files and nothing retries", is out of date: an unreadable debrief now
  leaves the scene open and End scene asks again (`App.jsx:10582-10593`).
  Corrected; not a bug.
- **Shipped copy uses a dash as a joiner** in four places: the Next line
  (`Practice.jsx:97`), the Add a skill explainer (`:195`), its placeholder
  (`:200`) and the Home card's Next line (`PracticeCard.jsx:42`). Low.
- **The Rehearse button capitalises the scene's name** inside its label
  ("Rehearse The …", `Practice.jsx:443`). Low.
- **"Connect a backend in Settings"** renders during a first-ever load while
  connected, because `connected` is read from whether the shelf has arrived
  (`valsPractice.js:262`); after the first visit the cached shelf hides it
  (`App.jsx:376-377`). Low.
- **The scene's partner name and cast line are careful and right**
  (`valsPractice.js:30-58`): a page that names nobody is spoken for as
  "Them" until the partner names itself. Kept in §3.

---

## 3 · Keep

- **The lamp.** One per move, dim until landed, lit in the hue, a dashed rim
  for a miss (the house "not yet"), lighting by transition so a landing is
  acted out (`PracticeLamps.jsx`, `index.css:3682-3711`). It is the right
  object; finding 2 is about where it sits.
- **A script, not chat bubbles.** The partner in the serif, his words in the
  UI face under a rule (`Practice.jsx:250-271`).
- **Code writes the notes.** NOTE and DEBRIEF parsed by code, move names
  checked against the page, and the pressure hidden from the screen until
  the debrief (the API strips it, `practice.js:727`; pinned by test).
- **The retry on an unreadable debrief** (`App.jsx:10582-10593`) and **the
  scene surviving a reload** (`App.jsx:346-366`, `savePracticeScene`).
- **The script follows his place.** It follows the foot only while he is
  near it, and the bar is measured, not guessed (`Practice.jsx:310-332`).
  Verified: the last line ends at 630, the bar starts at 646.
- **Auto filing with Undo**, his call on 26 Sep; and the record kinds in the
  Inbox.
- **Honest copy**: the empty shelf, the preparing row in his own words, the
  error lines in the script.
- **Nothing nags.** No streaks, no reminders, no Wrap-the-day question, as he
  asked on 26 Sep. Every direction keeps this.
- **The doors**: the Summary Home tile (he named the Practice box as one he
  really likes, 26 Sep), the Index's Mind group (`indexGroups.js:12`), the
  Mac sidebar (`valsChrome.js:233`), the voice lane (`App.jsx:7425`), and the
  "your scene partner answered" notice when he steps away.

---

## 4 · Directions for the mockup round

Mockup: `design/mockups/75-redesign-practice.html`, the three below switched
at the top, each as phone frames at 390×844 with live motion: choosing what
to rehearse, the scene (Nova in character, his turn, the moment a NOTE
lands), and the notes. All three keep every function in §5's Practice rows
of the checklist (Q1 to Q6), and all three take these fixes with them: Leave
moves inside End, which asks once ("Get notes" or "Leave without notes");
Pause becomes Time out and says what it does; the waits say what is
happening; an errored page gets Try again and Dismiss; every control is 44 pt;
four type sizes a view; orange means light (a lit lamp, the stage's spot,
the one action that starts a scene) and every label is ink.

**A · The next scene.** The room opens on one lit card, the next scene, with
one Rehearse. The other scenes are two rows beneath it; tapping one brings it
onto the card. Everything else on the skill (the six lines with when, tell,
source and tally, the scenes, rehearsals, what would make the notes surer
with Upload the book, Open in Notes, Pause) moves one tap deeper, to The
page. Add a skill becomes a + beside the title. In a scene the lamps sit in a
bar pinned at the top, with a thin line under them for where the scene is;
the notes take that bar's place when the scene ends: each move with his
words or the line to try, one thing to work on, the receipt with Undo on it,
and the next scene. Numbers: objects above the fold 12 → 8; Rehearse 4 → 1;
type sizes 12 → 4; the room 3.04 screens → 1; smallest stage control 21 → 44
pt; lamps in view as a line lands: no → always; the verdict 3 → 1. On the
Mac: the next scene and The page side by side; the script held to a 640 px
measure under the pinned bar.

**B · Cue cards.** The moves become a deck of cue cards, one on screen at a
time: the line he can say on the front in the serif, when beneath it, and Turn
over for tell, source and tally. The six lamps under the deck are its page
control. Scenes are a row of three below. In a scene the scene's cards lie in a
row above the mic, and the line on the card he picks shows above them, so the
line is in his hand while the partner pushes; when a note lands, the matching
card lifts and lights and its line turns into his own words, then it settles,
still lit, and the next card's line comes up. The notes lay the cards out, lit
or dashed. It adds one thing, marked new: Say it, a one-line drill (one push
from the partner, one line from him, one note), which needs a server change.
Numbers: objects above the fold 12 → 11 (each one a line to say or a scene to
start); moves on screen at once 6 → 1; the room 3.04 screens → 1; type sizes
12 → 4; objects in a scene 15 → 12; lamps in view as a line lands: no →
always. On the Mac: three cards side by side, and the scene's cards beside the
script.

**C · Spotlight.** The scene goes full screen, one exchange at a time, the way
his Nova full screen works: the partner under a spotlight (the masks he picked
for Practice's being), the partner's words pouring in as subtitles like
Nova's, his own beneath, and the moves standing as footlights along the stage
floor. When a note lands the footlight blooms and its light rises to the words
that earned it; the floor lights as the scene moves from open to close. The
script is one pull away. Choosing is a call sheet: the next scene under the
light with its footlights, the other two below. The notes are a curtain call:
Nova's own core takes the partner's place and gives the notes as himself, each
footlight showing its note in turn. The page fields live where A puts them.
Numbers: objects above the fold 12 → 7; objects in a scene 15 → 10; stage type
sizes 11 → 4; smallest stage control 21 → 44 pt; the verdict 3 → 1. On the
Mac: the stage centred at 720 px with subtitles held to about 40 characters a
line, and the script in a side panel.

**D · What the pixels argue for.** A room nobody has rehearsed in, whose first
screen leads with a page and whose signature lights off-screen. The
structural fix is A's (one scene, one Rehearse, the page one tap deeper, the
lamps pinned, the notes in one place). B is the answer if what stops him is
not knowing the lines; C if what would make him use it is the feeling of a
stage. They combine: C's stage with A's room and The page is a coherent blend,
and B's cards can be A's The page.

---

## 5 · Method

**Snapshot and server.** A detached worktree of `f60e8a9` at
`$SCRATCH/view-practice` (node_modules linked), Vite on 5205, opened in the
chrome-devtools MCP in an isolated context `practice`, viewport emulated
before the guarded navigation (`390x844x3,mobile,touch`, then a second
guarded navigation after re-emulating `1280x800x1`, because the guard does
not survive a viewport change). His look was set in the `initScript`:
`novaos.style=summary`, `novaos.theme=command`, `novaos.material=glass`,
`novaos.core=hologram`, no `novaos.connection`. The guard refused every
non-GET `fetch`, XHR and beacon; `window.__blocked` stayed empty through every
state. The page showed "Demo data" in the top bar and the toast.

**What demo shows, and the fixture.** In demo mode `livePractice` is never
fetched, so the room renders its title, "Rehearsal · 0 skills" and "Connect a
backend in Settings to open the rehearsal room", nothing else (one frame).
Everything else was photographed with a state fixture set through
`window.__novaApp.setState` (the dev-only handle): one invented skill at his
real page's scale (6 moves at 0 tried, 3 scenes, 2 gaps, no sessions), then
an invented five-turn scene with two moves lit, then an invented debrief,
then a "Setting the scene" state and a preparing-plus-error shelf, and an
eleven-line scene to measure the lamps. No action method was called (no
`startRehearsal`, `practiceTurn` or `practicePrepare`), so no request was even
attempted; no model was asked anything. None of the fixture's words appear in
the app or the vault.

**Frames read.** At 390: the demo room; the closed shelf; the opened skill at
scrollTop 0, 1180 and the foot; the stage at the top and the foot; the
debrief at the top and the foot; Setting the scene; the shelf with a
preparing and an errored row. At 1280: the opened skill and the stage. Stills
stayed in the session, out of the repo (audit convention).

**Measurements.** One computed-style sweep per state over
`[data-screen-label="Practice"]`: distinct font sizes of every visible element
with its own text, every `button`, `[role=button]`, `input` and `textarea`
with its rendered box (the smaller side compared to 44 and 28), lamps, panes
and text blocks above the fold, `main.scrollHeight` over the 844 viewport, and
`scrollWidth` of `main` and the document. The fold is the top of the dock
(776). The hand counts of objects above the fold were made from the frames and
are labelled as such.

**His use, read from the record.** Counts and times only, nothing of his
words: `server/data/practice.json` (one scene, started 26 Sep 00:12 UTC, five
turns, undone; tallies 0 of 0 for six moves); `server/data/inbox.json` (two
practice records, the page filed and the test session undone);
`~/Library/Logs/nova-os-server.log` from 20 Sep (every
`/api/practice/*` request by day and device; the four rehearse posts are all
127.0.0.1 on 26 Sep). `GET /api/practice` runs with every sync, so a visit was
inferred only from a fetch with no snapshot beside it: all but one of those
were fallback syncs (every slice fetched in the same second); the one on 30 Sep
at 08:18 UTC sits in a walk of screen fetches about five seconds apart, which
reads as a pass through the Index. That one is labelled probable.

**What was not seen.** His real page (described here only by its counts);
a live rehearsal, the partner's voice, his own voice through the iPhone's
record-and-transcribe path (unverified on his phone in memory
`nova-voice-turn`), the lamp's swell in motion at full speed, the
offline banner over the control bar mid-scene (seen by the build's agent on
26 Sep, not here), the `cupertino` and `command` idioms as separate frames,
the Summary Home tile with data (it is absent in demo), the Index row's live
value, and the Mac debrief. The latencies in finding 8 are upper bounds from
a hand-polled test.

**Inventory notes, confirmed or corrected.**
- Two lamp renderings for one concept (`StageLampChip`, `StageLamp`):
  confirmed, and they swap as the scene starts and again at the debrief
  (`valsPractice.js:208`).
- "The unparsed-debrief path is the one place nothing files and nothing
  retries": corrected, see §2 finding 11.
- "Doors: Home card, the chat router, notifications, an Inbox practice card,
  the sidebar": confirmed; add the Summary Home tile and the Index's Mind
  group, which came after the inventory.
