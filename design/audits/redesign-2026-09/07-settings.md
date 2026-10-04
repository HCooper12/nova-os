# 07 · Settings · audit, 5 Oct 2026

His brief for the redesign (26 Sep): "A lot of Nova has become cluttered and
complicated." "Simplicity with all functionality and a beautiful aesthetic,
along with ease of use MUST be the goal." Every function is kept. Judged
against his own reference for an index of settings: on 26 Sep he filmed iOS
Settings and asked for Nova's More page in that shape (grouped rows with icon
tiles, a live value on the right, drill-down pages that open with a header
card, the interactive swipe back, search at the foot). That page is built:
the Index (`src/screens/Index.jsx`, mockup 56, which he called "awesome").
Settings is the Index's nearest relative and today looks like none of it.

Evidence: source read in full (`src/screens/Settings.jsx`, 1,052 lines; its
view model in `src/vals/valsChrome.js:545-729` and the voice slice in
`src/vals/valsMisc.js:144-253`; `src/theme.js`, `src/settingsVoice.js`,
`src/MobileChrome.jsx`, `src/SummaryDock.jsx`, `src/TabOrderEditor.jsx`,
`src/screens/Index.jsx`, `src/vals/valsIndex.js`, `src/indexGroups.js`, and the
57 lanes in `server/lib/modelPrefs.js`). Photographed in DEMO MODE ONLY, from a
detached snapshot of `922ffc6` on Vite :5202, at 390×844 (touch, 3x) under his
look (style Summary, theme Command, material glass, core hologram) and at
1280×800 for the Mac: 8 screenfuls of Settings, 1 frame of the Index,
computed-style sweeps of the Settings root in both widths. Every non-GET
request was refused by an init-script guard; none was attempted. Read under
`apple-design`, `apple-hig-review`, `emil-design-eng` and `interface-design`,
with each HIG page cited below open beside the frames (`file.md › Heading`;
"judgment" where none applies). Line numbers re-checked against `f60e8a9`,
which moved during the audit without touching any file cited here except
`MobileChrome.jsx` (one line; the dock slice moved from :50 to :51).

---

## 1 · Verdict

**Critical issues.** Settings is one undivided scroll with no page of its own
for anything: twelve sections in demo mode and eighteen when connected, every
control drawn at once, no drill-downs, no values on the right, no search. The
number that says it: **7.0 phone screens (5,913 px at 390×844) in demo mode,
where six of the eighteen sections are hidden.** Connected, the model board
alone adds 57 lane cards, all six groups open on every launch
(`App.jsx:680` starts the collapse state at `{}` and nothing keeps it), which
puts the page at roughly 20 screens by arithmetic from its own CSS (§5; not
measured, because demo mode hides the board).

The page's largest type, the 30 px title, says "Connect the *real vault.*"
over a paragraph that says "Until then the app runs in demo mode", on every
visit, connected or not (`Settings.jsx:107-112`, unconditional). Three
switches and four lines of copy disagree with the code they describe (§2,
findings 2 to 4). Two lines sit under Apple's 11 pt floor. Thirty of the 45
controls in demo mode are under 44 pt.

The one thing it would be remembered by today is its length. The redesign's
job is to give it the Index's shape and one thing the Index cannot have: a
setting that changes a look should show the look.

### Clutter numbers, as it stands (checklist §3)

Demo mode, 390×844, Summary · Command · glass, unless a row says otherwise.
"Measured" means a computed-style sweep of `[data-screen-label="Settings"]`.

| Test | Settings today | Target |
| --- | --- | --- |
| Focal point | "Connect the real vault." (30 px, the largest type on the page) over a form he finished long ago; true only in demo mode | One, above the fold, true in every state |
| Object count, above the tab bar (776 px) | 13 measured: eyebrow, title, intro, the connection card, 2 fields, 2 buttons, 2 eyebrows, 3 style rows; 7 of them controls | Lower, or a reason |
| Sections | 12 in demo, 18 connected; 0 drill-downs; 20 uppercase labels measured (4 of them "ACTIVE" tags) | One list, one level of pages |
| Screens deep | 7.0 measured (5,913 px); about 20 connected (§5, arithmetic) | ≤ 2 for the top level |
| Controls | 45 measured; 30 under 44 pt (chips 34, buttons 37, the iOS switch 31, the select 39); 0 under 28 pt | Every control 44 pt |
| Type sizes | 12 measured: 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 27, 30 px; 2 of them under Apple's 11 pt floor | ≤ 3, or 4 per view in the redesign rounds |
| Card grammars | 7 measured (the connection card, the option row, the active option row, the calm row, the summary pane, the cyan callout, the glass card), plus the drag rows | 1 |
| On/off grammars | 5: the iOS switch (rest timer, quiet hours), the On/Off chip (7 places), the chip named for its state (Duck music / Speak anyway; Shown / Hidden), the whole-row radio with an ACTIVE tag (14 rows), the chip radio (hearing, pause, rest length) | 1 switch, 1 picker |
| One fill, three meanings | The filled cyan chip means on, chosen and run this, across 11 chips measured | One colour, one meaning |
| Gold | 12 jobs in source (title accent, focus border, three section labels, two chips, Retry, the spend figures and track, a customised select's border, the haptics tag, a verdict) | Waiting on his call, only |
| Motion | The shell's 260 ms rise on arrival; inside the page none: no entrance, no exit, option rows swap instantly; two `fadeUp`s on the mic check | All four |
| States | Loading: 1 skeleton (quiet hours), 2 plain "Loading…" lines. Empty: honest (calendars, snapshots). Offline: calendars, models and snapshots vanish; About you shows as if live. Error: designed for 3 | All four, honestly |
| Width | `scrollWidth` 390 at 390, 1280 at 1280 | 390 |
| Mac, 1280×800 | 6.4 screens measured; one 520 px column in a 1,042 px pane, half the width empty; 13 type sizes; no panes | The System Settings shape |
| Doors on his phone | 3: the top bar's ⚙ (a text glyph, 33×33 pt), the Index's "you" card, the Index's Settings row | No target |

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 · The first screen asks him to connect a vault he connected long ago
`Settings.jsx:105-112` (title and intro, unconditional); `:114-149` (the form)

The page opens with "SYSTEM · SETTINGS", then "Connect the *real vault.*" in
the largest type on the page (30 px, its serif half in gold), then "Point
Nova OS at the backend running on your Mac to replace the demo data... Until
then the app runs in demo mode — everything you see is clearly-badged sample
data." None of it is conditioned on `v.connectionActive`, so on his connected
phone the first thing Settings says is untrue, and the one-time form (URL,
token, Test, Save & connect) holds the first screen of a page he opens to
change something else. The word "Settings" appears only as a 12.5 px eyebrow
and, once he scrolls, the top bar's compact title.

| Before | Why | Severity |
| --- | --- | --- |
| "Connect the real vault" and "the app runs in demo mode" shown in every state; the setup form is the first screen | NOVA-METHOD non-negotiable: "Honest degradation, never fiction." `layout.md › Best practices`: "Place items to convey their relative importance... it generally works well to place the most important items near the top." `writing.md › Best practices`: "Consider each screen's purpose... put the most important information first." | Critical |

### 2 · Talk over Nova reads On while it cannot run
`Settings.jsx:566-580`; defaults `App.jsx:484` (`bargeInOn` true) and `:494` (`wakeWordOn` false); mount `App.jsx:10853`

By default, and in the frame, "Hey Nova" shows Off and "Talk over Nova"
shows a filled cyan On, with copy under it that says it "Needs 'Hey Nova' on
— that is what holds the microphone open." The code agrees with the copy:
`<WakeWord>`, which carries barge-in, mounts only `{v.wakeWord?.on && ...}`.
So the chip states a capability that is off, and nothing dims it.

| Before | Why | Severity |
| --- | --- | --- |
| A switch shows On for a feature that cannot run until another switch is on | `toggles.md › Best practices`: "Make sure the visual differences in a toggle's state are obvious." `feedback.md › Best practices`: "Show people when a command can't be carried out and help them understand why." NOVA-METHOD: "Honest degradation, never fiction." | Critical |

### 3 · Calm mode's Off breaks into "O / ff" at 390
`Settings.jsx:390`

Measured: the chip is 42×46 with its word on two lines ("O", "ff"). Every
other On/Off chip on the page carries `style={{ flex: 'none' }}`; this one
has only `marginLeft: 'auto'`, so the hint text beside it squeezes it. A
one-property fix, visible on the second screen.

| Before | Why | Severity |
| --- | --- | --- |
| A control's label wrapped mid-word | `typography.md › Supporting Dynamic Type`: "Keep text truncation to a minimum..." (the same failure at default size); NOVA-METHOD §2b rule 6, "It must survive 375px." | Medium |

### 4 · Copy that disagrees with the code it describes
Each verified in source on 5 Oct.

- **The dock.** `Settings.jsx:826`: "On your phone the first three fill the
  floating dock and the rest live in More." The floating dock takes five
  (`MobileChrome.jsx:51`, `v.tabs.slice(0, 5)`), and under Summary, his
  style, the tab bar takes four (`SummaryDock.jsx:71`, `slice(0, 4)`). The
  dock's own header comment repeats "THREE" (`MobileChrome.jsx:15`), while
  `tabOrder.js:19-20` speaks of "the four one-tap dock slots", true only
  under Summary. The copy he reads matches neither layout, and the list
  below it draws no line where the tab bar ends.
- **The styles.** `Settings.jsx:263`: "Design style · same data, same
  features — two skins." There are four (`theme.js:24-29`: Command Core,
  Apple skin, Apple layout, Summary). `:295` "the palette, in either style"
  has the same root.
- **Speech.** `Settings.jsx:453`: "Most of this page answers to speech." The
  parser answers for six settings (`settingsVoice.js:37-99`: theme, style,
  core, calm, speak replies, the wake word) of roughly twenty-five on the
  page, not counting 57 lanes.
- **He, not it.** His call of 3 Oct (`7576a1c`, which did not touch this
  file): six visible strings still call Nova "it" (`:206`, `:453`, `:456`,
  `:539`, `:572`, `:673`; for example "How Nova speaks, and how it hears
  you").
- **The numeral.** `Settings.jsx:105` heads the page "XIV."; the sidebar
  numbers Settings "XV." (`valsChrome.js:243`, the 15th of `TAB_META`). Seen
  only under Command Core, where the numeral renders.

| Before | Why | Severity |
| --- | --- | --- |
| Five pieces of copy that a reader can check against the screen, and that fail | NOVA-METHOD: "Honest degradation, never fiction." `writing.md › Best practices`: "Be clear. Choose words that are easily understood and convey the right thing." His standing call: Nova is he | High |

### 5 · The page has no shape: one scroll, no drill-downs
`Settings.jsx:101-1052` (the whole component); real frames, 8 screenfuls

Eighteen sections stack in one column, each written when it was needed:
Connection, About you, What Nova has noticed, Appearance (four pickers and
Calm), Train, Notifications and Quiet hours, "You can just say it", Haptics,
Voice (fifteen rows, about 280 lines), Navigation order (17 drag rows),
Calendars, Claude models, Time machine, a footer about `server/.env`. The
Index he chose answers the same problem with one list of rows, each a value
and a push. Settings has no row that pushes anything.

| Before | Why | Severity |
| --- | --- | --- |
| 7.0 screens in demo, about 20 connected, 0 drill-downs | `settings.md › Best practices`: "Minimize the number of settings you offer... too many settings can make the experience feel less approachable, while also making it hard to find a particular setting." `designing-for-ios.md › Best practices`: "Help people concentrate on primary tasks and content by limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." | High |

### 6 · Settings that change a look name it instead of showing it
`Settings.jsx:261-379`; `THEME_SWATCHES` `:93-99`

Style, theme, material and core are fourteen full-width rows of a name, a
one-line hint and a 14 to 16 px swatch (a square, three dots, a circle).
Nothing on the page shows what Summary, Apple layout, Ember or Lit look like;
he finds out by tapping and leaving. And one swatch is wrong by construction:
Observatory's dots are `var(--nv-gold)` and `var(--nv-cy)`, the active
theme's tokens, so they draw whichever theme is on. Measured: under Ember its
cyan dot turns orange (`rgb(255,179,92)`); under Daylight its gold turns brown
and its cyan Apple blue. Observatory's own colours (`#d8b573`, `#6be5f5`,
`index.css:380`) never appear.

| Before | Why | Severity |
| --- | --- | --- |
| Fourteen named rows; a preview that shows the wrong palette | Judgment and his global rule, "Show the real thing." `color.md › Best practices`: "Use color consistently throughout your interface, especially when you use it to help communicate information like status or interactivity." | High |

### 7 · One kind of control drawn five ways, and one colour saying three things
Real frames, screens 2 to 6; computed sweep

A binary setting is drawn as an iOS switch (Rest timer, Quiet hours), an
On/Off chip (Calm, Speak replies, "Hey Nova", Talk over, Sound effects, every
model lane), a chip named for its current state ("Duck music" / "Speak
anyway", "Shown" / "Hidden"), a whole row with an ACTIVE tag (fourteen
appearance rows), or a chip radio (hearing, pause, rest length). The same
filled cyan chip, measured on 11 chips, means "this is on" (On), "this is
chosen" (Natural · 2.0s, 90 s, Automatic) and "run this" (Test, Mic check,
Test Nova's ears, Sign in on the Mac). Gold does twelve jobs in source, from
the title's accent to the spend bars, where rule 8 gives it one (waiting on
his call).

| Before | Why | Severity |
| --- | --- | --- |
| Five on/off grammars; one fill for on, chosen and act | `toggles.md › Mobile (iOS, iPadOS)`: "Use the switch toggle style only in a list row." `color.md › Best practices`: "Avoid using the same color to mean different things." NOVA-METHOD §2b rule 8: colour means something | High |

### 8 · Twelve type sizes, two under the floor, and none that scale
Computed sweep; `Settings.jsx:636, 808, 812, 976`; decision X3

Measured on the Settings root: 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14,
15, 27 and 30 px. The 10 px line (`:808`, the on-device voice footnote) and
the 10.5 px lines (`:636` "iOS has no setting that does both", `:812` the
engine footnote, and `:976`, the spend detail under each of 57 lanes when
connected) sit under Apple's 11 pt minimum. Every size is in px; there is no
`rem` and no `-apple-system-body` in `Settings.jsx` or `index.css`, so the
iPhone's Text Size never reaches Nova. X3's other half is stale: the
viewport no longer sets `user-scalable=no` (`index.html:12-33` explains why
pinch-zoom came back), so zoom works and Dynamic Type does not.

| Before | Why | Severity |
| --- | --- | --- |
| 2 sizes under 11 pt (1 line in demo at 10 px, 1 at 10.5 px; up to 57 more connected) | `typography.md › Ensuring legibility`: iOS minimum size 11 pt. Accessibility failures are Critical in this review | Critical |
| 12 sizes; no Dynamic Type | `typography.md › Conveying hierarchy`: "Minimize the number of typefaces you use..."; `typography.md › Supporting Dynamic Type`: "Make sure your app's layout adapts to all font sizes." `accessibility.md › Vision`: "Support larger text sizes." | High |

### 9 · Thirty of forty-five controls under 44 pt
Computed sweep

Chips 34 pt tall, the house buttons 37, the iOS switch's own input 51×31
(its row gives it no larger target), the raw `<select>` 39. None measured
under 28 pt, so nothing fails the minimum. The top bar's ⚙ door, the way he
reaches Settings from anywhere, is a text glyph in a 33×33 pt pill
(`MobileChrome.jsx:81-83`).

| Before | Why | Severity |
| --- | --- | --- |
| 30 of 45 under the default target; the door itself 33 pt | `accessibility.md › Mobility`: iOS "44x44 pt" default, "28x28 pt" minimum; "Consider spacing between controls as important as size." | Medium |

### 10 · The tests sit among his preferences
`Settings.jsx:461-532` (Haptics), `:687-787` (three tests, the build, the research browser, the swipe facts)

Four diagnostics and a developer line live between preferences: the haptics
card ends "Send me this line: iOS unknown (as reported — Safari freezes it)
· Safari · in-browser · overlay OFF · switches 0 · vibrate yes" in 11 px mono;
"Can you hear Nova?", "Can Nova hear you?" and "Test Nova's ears" each carry
a filled button inside the Voice card; "Swipe back from the left edge" is
three red crosses in a browser tab. The research browser's sign-in, an
account for the Scout, is nested inside "Can you hear Nova?" (moved there to
fix a 375 px layout bug, per its comment at `:697-701`).

| Before | Why | Severity |
| --- | --- | --- |
| Five tests and a sign-in scattered through the preferences, one nested in an unrelated test | `layout.md › Best practices`: "Make controls easier to use by providing enough space around them and grouping them in logical sections. If unrelated controls are too close together... they can be difficult for people to tell apart or understand what they do." `settings.md › General settings`: "Put general, infrequently changed settings in your custom settings area." | Medium |

### 11 · The model board opens all 57 lanes, every launch
`Settings.jsx:862-1001`; `valsChrome.js:647-709`; `App.jsx:680`; `server/lib/modelPrefs.js` (57 lanes, 6 groups)

Connected only, so read from source, not seen. Each lane is a card with a
name, a hint, an On/Off chip, a raw `<select>` of 11 models (`:955`, not the
house `Select` that Quiet hours already uses at `:81`), a Reset and a spend
row. `modelPrefsCollapsed` starts at `{}` and is never stored, so all six
groups reopen on every launch. By its own CSS a lane card is about 105 to 165
px, which makes the board alone some 9,000 px.

| Before | Why | Severity |
| --- | --- | --- |
| 57 cards open by default; 57 raw selects | `settings.md › Best practices`: "...too many settings can make the experience feel less approachable, while also making it hard to find a particular setting." `designing-for-ios.md › Best practices` (as finding 5) | High |

### 12 · Offline, three sections vanish and one pretends to be live
`valsChrome.js:571-578, 622, 631, 647, 710`; `Settings.jsx:68, 841, 882`

Offline, Calendars, the model board and Time machine disappear rather than
showing what the Mac last said. About you stays, and its own comment
promises "read-only, with a stale note"; `profile.readOnly` is computed
(`valsChrome.js:578`) and never read by `Settings.jsx`, so his words show as
if live, with an Edit chip that answers with a toast. Loading has two idioms:
one skeleton (Quiet hours) and two plain lines ("Loading your calendars…",
"Loading the model board…").

| Before | Why | Severity |
| --- | --- | --- |
| Sections vanish offline; a promised stale note never drawn; text loaders beside a skeleton | NOVA-METHOD: "stale data self-labels." `loading.md › Best practices`: "Show something as soon as possible... consider showing placeholder text, graphics, or animations as content loads." | Medium |

### 13 · Two task settings live away from their task
`Settings.jsx:394-425` (Rest timer), `:817-828` (Navigation order)

The rest timer belongs to Train's live session; the order of the tab bar
belongs to the tab bar. Both are reachable only by leaving the thing they
change.

| Before | Why | Severity |
| --- | --- | --- |
| A session option and a list order kept in Settings | `settings.md › Task-specific options`: "When possible, prefer letting people modify task-specific options without going to your settings area... reordering a collection of items." `lists-and-tables.md › Best practices`: "Let people edit a table when it makes sense." | Medium |

### 14 · On the Mac, one narrow column and no panes
Frame at 1280×800; `App.jsx:1009-1010`

Settings at 1280 is the phone page: a 520 px column at the left of a 1,042 px
pane, the right half empty, 6.4 screens deep, 13 type sizes. There are no
panes, and the keyboard reaches Settings by no shortcut (⌘K and ⌘B are the
only ones bound; ⌘, is the Mac's standard). Whether a browser lets a page
take ⌘, is untested.

| Before | Why | Severity |
| --- | --- | --- |
| A phone column on a desktop; no panes; no ⌘, | `settings.md › Desktop (macOS)`: "a custom settings window contains a toolbar that includes buttons for switching between views — called panes — that each contain a group of related settings"; "Restore the most recently viewed pane." `settings.md › Best practices`: "Make settings available in ways people expect." | High (desktop round) |

### 15 · Capitals and dashes the view model hands over
`valsChrome.js:602-605`; `valsMisc.js:149-154`; `Settings.jsx:545`

The push status is four ALL-CAPS literals ("ON — DRAFTS & ALERTS REACH YOUR
PHONE", "BLOCKED — ALLOW IN iOS SETTINGS → NOVA"...), the voice picker's
label "NOVA VOICE" and the engine "NOVA · DEFAULT"; under the Apple styles
they render in capitals because they are capitals. In demo mode Speak
replies reads "Engine: —", a dash as a value, which the Index's own view
model calls "a broken row" (`valsIndex.js:15`).

| Before | Why | Severity |
| --- | --- | --- |
| Capitals in the vals; a dash where a value should be | NOVA-METHOD §2b rule 3, "Sentence case in the vals." `writing.md › Best practices`: "Adopt capitalization rules that align with your app's style, then apply them consistently." | Low |

### Smaller things seen

- `statusColor.ok` is the literal `#5aa87c` (`Settings.jsx:90`), not
  `var(--nv-good)`.
- Every `<option>` paints `background: '#141019'` (`:794`, `:805`, `:958`);
  under Daylight on the Mac the menu's text could be dark on dark. Not seen.
- "Tap REFRESH to retry" (`:838`) names an action drawn as "Refresh" under
  the Apple styles.
- Three names for one place across doors: Ops / Agents & Operations,
  Shop / Shopping, Voice / Nova (tab bar, Index, sidebar).
- 49 em dashes in the page's own copy, against his writing rule.
- The calendar error copy, the model board's and the quiet hours' each say
  plainly what failed: kept.

---

## 3 · Keep

- **The trust ladder** (`Settings.jsx:217-257`): kept against dismissed on
  one track, a serif numerator, the lanes worth easing off pulled to the top.
  The 22 Sep finding 10 fix, still the right form for that data.
- **Every off switch says what it stops** (`:987-993`, the lanes' `off`
  text): "An off switch that doesn't say what it stopped is a trap." Kept in
  every direction, in red, as the line under the switch.
- **The honest error lines**: calendars ("a connection problem, not 'no
  calendars'"), the model board ("Nothing has changed on the server"), quiet
  hours ("Could not read them from the Mac" with Try again).
- **Quiet hours writes optimistically and rolls back on failure**
  (`:45-54`): the shape every server-held switch should copy.
- **The tests themselves.** Mic check, ears test, voice test and the swipe
  facts turned "I heard nothing" into causes (`micCheck.js`, 25 Sep); they
  move, they do not go.
- **The spend measured, never guessed** (`:908-921`): absent until the first
  measured run, "never a zero that pretends to be a reading".
- **The real `<input type=checkbox role=switch>` under the drawn switch**
  (`index.css:1213-1232`): a control to VoiceOver, the keyboard and the
  finger iOS gives its Taptic to.
- **Settings answers to speech** (`settingsVoice.js`): six settings, with
  the sentence Nova says written beside the parse so they cannot disagree.
  Kept, and named honestly.
- **The Index's row** (`index.css:1370-1401`): 52 pt, a 34 pt tile in the
  domain's hue, the value dropping under the name rather than being cut.
  All three directions are built from it.

---

## 4 · Directions for the mockup round

Drawn in `design/mockups/72-redesign-settings.html`, three directions on one
page, demo content only, each with at least one drill-down that pushes and
pops with the iOS motion and the swipe back. Shared by all three: the page
opens on "Settings" (34 pt) and a row for the Mac that says whether it is
connected; one switch, one picker, one fill (cyan means on or chosen; tests
are text buttons); every control 44 pt; Talk over waits for "Hey Nova" and
says why; the tab bar's count is drawn, not described; offline rows show the
last word from the Mac and its time; the five tests gather in **Check Nova**;
**Appearance shows the look**: his Home in miniature, the four styles as
thumbnails in the current palette, each theme as a disc drawn in its own
colours (fixing finding 6's swatch), the three materials over the theme's
sky, both cores running live (the hologram and filament engines of mockup 47,
lighter). Quiet hours is a 24-hour ring with the night drawn on it; the pause
is a timeline that runs its length; the rest timer a ring.

Before, for every row below: 13 objects above the tab bar (7 controls),
7.0 screens in demo, 12 type sizes, 45 controls (30 under 44 pt), 5 on/off
grammars.

**A · Rows (the Index's twin).** One list: the "you" card (About you, the
Intake numbers, What Nova has noticed), then 14 rows in five groups (Nova:
Voice, "Hey Nova", Notifications; Look: Appearance, Calm mode, Tab bar; In
Nova's pages: Train; Connected: The Mac, Calendars, Research browser; Under
the hood: Claude models, Snapshots, Check Nova), each with its live value
and one push to its page; search at the foot finds any of 28 settings and
opens its page with the row lit. Removes the scroll; keeps every setting in
Settings; moves the tests into Check Nova. Measured at 390: 12 objects above
the tab bar, 8 of them controls (7 rows of 52 pt and the search); the top
level is about 1.6 screens; type 34 · 17 · 15 · 13 on the list, 20 on a
page's header card.

**B · Controls (Control Centre on top).** The eight switches he flips sit
first as lit glass tiles (Speak, "Hey Nova", Talk over, Sounds, Quiet hours
with its window, Calm, Rest timer), and the look is a 2×2 tile showing it,
which opens **Looks**: eight complete looks to swipe through (Nova glass,
Nova lit, Nova night, Observatory, Apple glass, Summary light, Apple layout,
Command Core: his 26 Sep list plus Lit and the two classics), one "Use"
button, the four pickers a level down under Fine-tune. Rows for the rest.
Removes the 14 appearance rows and the scroll to any switch; keeps every
setting; moves the tests into Check Nova. By the layout: 14 objects above
the tab bar, 12 of them controls, 8 of them one-tap switches (today none
above the fold).

**C · Sentence.** Nova says how he is set up in one sentence that code writes
from the settings (the summary Home's highlight-sentence rule: written from
the same fields the controls show, so the two cannot disagree): "Nova speaks
his replies in his own voice, listens with his own ears on this iPhone,
waits for a tap and waits 2.0 seconds before he answers. Pushes hold from
22:30 to 05:00. He looks like Nova glass with the hologram core, and runs on
57 Claude lanes, 2 switched off." Each underlined phrase opens its page with
the row lit. Below: the rarely changed as rows (You, Calendars, Models,
Snapshots, The Mac, Research browser, Check Nova). Removes the controls from
the first screen; keeps every setting; moves the rest timer into Train's
live session and the tab order onto the tab bar (hold it, as on the Home
Screen; the Index's Edit as the second door). By the layout: 5 objects above
the tab bar (the title, the sentence with 9 phrases, a group label, a row,
the search); type 34 · 20 · 17 · 15 · 13.

**What the pixels argue for.** A is the safe build and the one his Index
already proved. B answers the question the audit cannot (which switches he
actually flips) with the eight the page and his reports point at. C is the
most his: Nova describing himself in a sentence he can change, in the serif
the Method reserves for the line that carries the news. The fixes in §2
findings 1 to 4 need no direction and can ship first.

**Decisions this raises** (his, listed again at the end of the mockup):
which direction or blend; complete looks or four pickers; the tests in one
Check Nova page; C's two moves; whether Settings' search searches settings
or opens the conversation as the Index's does; X3, following the iPhone's
Text Size (the mockup's Larger switch shows every page reflowing, values
dropping under their names); and whether findings 1 to 4 go out now.

---

## 5 · Method, and what was not seen

**Frames.** Demo mode only, as briefed: a detached snapshot of `922ffc6`
(`git worktree add --detach`, `node_modules` linked), Vite on :5202, an
isolated Chrome context, `emulate` 390x844x3 mobile touch before navigation,
then `localStorage` set to his look (`novaos.style` summary, `novaos.theme`
command, `novaos.material` glass, `novaos.core` hologram) and a guard that
refused every non-GET `fetch`, XHR and beacon. "DEMO DATA" confirmed on the
page before any measurement; the guard recorded no attempt. Eight screenfuls
at scrollTop 0, 560, 1320, 2080, 2840, 3600, 4360 and the foot (5,069), one
frame of the Index, one frame at 1280×800. Stills were looked at and not
kept (audit convention). The worktree, the server and the page were removed
when the measurements were done.

**Sweeps.** On `[data-screen-label="Settings"]`: distinct `font-size` of
every element with its own text; clickables as native controls, `role`
buttons and the outermost `cursor:pointer` element, de-duplicated by
containment, sized by `getBoundingClientRect`; objects above the fold as
elements intersecting 0 to 776 px (the tab bar's top); card grammars as
distinct (radius, border, background, padding) tuples among elements over
250×40; `scrollWidth` of the document and of `main`, which is the scroller
(5,913 px tall at 844). The Calm chip, the Observatory swatch under three
themes, and the Index's row metrics were measured directly.

**The connected height is arithmetic, not a measurement.** Demo mode hides
the model board, so: a lane card from its CSS is 13 px padding, a 54 px head
(name, two lines of 11 px hint, the 34 px chip), 75 px of select and spend,
13 px padding and an 8 px gap, about 163 px; a deterministic lane about 113
px. 49 × 163 + 8 × 113 is about 8,900 px, plus six group heads and the board's
own lines, about 9,500 px. About you, the trust ladder, Notifications with
Quiet hours, Calendars and Time machine add about 1,700. With the 5,913
measured: about 17,100 px, about 20 screens at 844. The lanes and groups are
counted from `server/lib/modelPrefs.js`; the per-card heights are from
`Settings.jsx`'s inline styles and are an estimate.

**Not seen.** Every connected-only section, read from source instead:
About you, What Nova has noticed, Notifications and Quiet hours (his window
is 22:30 to 05:00 per the handoff; the mockup shows his window, which
the parent set after the agent's pass), the
two server voice pickers, Calendars, the model board, Time machine. The
command idiom and Command Core's numeral (finding 4 is read from source).
Offline and error states on screen (read from source). Haptics on his iPhone
(the frame is Chrome reporting the Vibration API). The ⌘, behaviour in a
browser. His real values for anything. A live gesture or transition on the
page: Settings has none of its own to film; the shell's rise was confirmed
by its animations list.

**Inventory first-look notes, confirmed or corrected:**
- "Settings.jsx (918 lines)": now **1,052**; Material (`:321-352`), Train's
  Rest timer (`:394-425`) and Quiet hours (`:29-88`, `:442`) arrived since.
- "the first three fill the floating dock, the dock takes five
  (`MobileChrome.jsx:50`)": **confirmed**, and under Summary it is four
  (`SummaryDock.jsx:71`); the copy matches neither.
- "Voice section ~280 lines": **confirmed** (`:534-815`, 15 rows including
  four tests and a sign-in).
- "three near-identical option-row blocks": **corrected to four** (style,
  theme, material, core: `:264-379`).
- "four raw `<select>`": **confirmed** (two voice pickers, `:792`, `:803`;
  the per-lane model picker `:955`, rendered 57 times connected), while the
  house `Select` is already used on the same page (`:81`, `:83`).
- "diagnostics inline among consumer preferences": **confirmed**, and the
  research-browser sign-in sits inside one of them (finding 10).
