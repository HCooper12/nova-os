# 05 · Voice · audit, 28 Sep 2026

Judged against his bar for this redesign ("Simplicity with all functionality
and a beautiful aesthetic, along with ease of use MUST be the goal"), against
the Coach deck as the reference for "simple", against the rebuilt Home
(`summary` style, Nova glass his main) and against the colour rules he sent
on 27 Sep (colour sparingly on glass, one accent on the primary action, never
one hue for two meanings, nothing by colour alone). Evidence: source read in
full (`src/screens/Voice.jsx` 601 lines, `src/VoicePresence.jsx` 176,
`src/VoiceHalo.jsx` 39, `src/VoiceWaveform.jsx` 59, `src/liveStore.js` 33,
`src/audioSession.js` 120, `src/useDictation.js` 434, the Voice slice of
`src/vals/valsMisc.js` 100-420, `src/vals/valsChrome.js` 385-470,
`src/glassBeats.js`, `src/StageCard.jsx` 1-120 and 278-300,
`src/spokenProse.js`, `src/TypeText.jsx`, `Controls.jsx` `AttachStrip`, and
`App.jsx` `doOrb`, `startLiveTalk`, `notifyEmptyListen`); 14 demo captures
and 5 real, read-only captures of his connected vault at 402×874, with a
measuring sweep on 12 of them. Read under `apple-hig-review` (cited `file.md › Heading`, or
"judgment"), `apple-design`, `emil-design-eng` and `interface-design`. The
real frames are quoted as counts and shapes only; none of his conversation
appears in this file. Method, the frame ledger and every blocked write are in
§5.

Quoting note: the screen's captions use a dash between phrases (for example
"LISTENING, then PAUSE SENDS"); they are quoted here with the dash written as
a middle dot.

---

## 1 · Verdict

**Needs work, with three real bugs.** Voice is the front door for talking,
and on his phone it opens on everything except the conversation: a 26px
monospace clock, a 244px core inside a 300px reticle, a caption, up to three
chips and a diagnostics panel fill the first screen, and the thing he came
for, what was said and the place to say more, starts at 829px and ends
around 1,450px, under a second, nested scroll of 15,312px (31.5 screens of
history inside a 486px window). The station frame was his explicit ask on 20
Aug and the audit does not argue with the idea; it argues with the cost. The
same state (listening, thinking, speaking) is drawn three to five times at
once, gold carries ten meanings, every one of Nova's 128 real lines ends in
a gold "Remember", and the composer breaks the moment he attaches a photo.
It will be remembered for the right things: Nova ends the turn, the glass
rises with the speech, every exchange from every door lands in one record,
and the words "Nova answered but the phone blocked the sound" are honest.

### Clutter numbers, as it stands (checklist §3)

| Test | Voice (real, cupertino, 402×874, 08:3x AEST) | Voice (demo, command) | Target |
| --- | --- | --- | --- |
| Focal point | The core. The conversation starts at 829px and the composer sits at about 1,450px (real) or 1,145px (demo), one and a half to nearly two screens down | Same | One, above the fold, and it should be the conversation |
| Objects above the fold | 9: label, status tag, clock, core in reticle, caption, ritual chip, Brief me, Ambient, the Station panel's top; 4 tap targets (core, ritual, Brief me, Ambient) | 8 (no ritual in demo) | Lower than today, or a reason |
| Screens deep | Page 1,591px (1.8 screens) **plus** a nested log of 15,312px in a 486px window (31.5 inner screens) | Page 1,307px | One scroll |
| Messages in the log | 129 across 7 days; 128 Nova's, 1 his | 3 scripted | · |
| Verbs per message | 1 on every Nova line (Remember); by source up to 9 fields can attach verbs to one message (Remember, Undo, Yes do it, Leave it, Walk me through it, Take it to the Coach, Keep in vault, Just answer it, the evidence card); 4 in practice on a plan report | · | One primary, one quiet, talk back |
| Type sizes | **8** idle (9 to 26px); **12** while the glass is up (adds 7, 7.5, 8.5 and 22px) | **7** idle (8.5 to 26px) | ≤ 3 (plus numerals) |
| Tap floor | 135 targets; **134 under 44pt** (128 of them "Remember" at 85×32); 0 under 28 | 145 targets; 144 under 44; **142 under 28** ("Remember" 69×26, "Brief me" 83×26, the wake toggle 37×27) | ≥ 28pt; ≥ 44pt primary |
| Talk controls on one screen | 2: the 244px core, and the dock's Nova button, which on this screen opens no microphone (finding 3) | 2 | 1 |
| States said at once | Listening: caption, ring hue, MIC row and bar, waveform (4). Thinking: caption, ANSWERS row, busy line in the log (3). Speaking: caption, ring hue, ENGINE bar, waveform, dock orb (5) | Same | Once, in one place |
| Hues | Gold 10 jobs, cyan 15+, violet 3 (finding 6) | Same | One accent on the primary action |
| Gestures | Tap the core; tap a glass panel to enlarge (GlassSheet, phone only). No swipe, no long-press on this screen | · | Standard, never the only door |
| Motion | Two rings spin forever (44s and 14s, 3s while busy); messages rise; panels arrive from depth. Nothing leaves | · | Entrance, exit, interruptible, reduced motion |
| States | Busy line; empty placeholder; STANDING BY; dictation error as a toast; blocked speech banner. No skeleton for the log; a failed transcription keeps nothing (finding 9) | · | All four designed |
| Width | 402 at rest; the composer overflows with one attachment (finding 2) | 402 | 402 |
| Idioms | Cupertino, command and summary all draw the same station; summary only swaps the dock | · | One view model, both checked |

---

## 2 · Findings, ranked by visible gain on his phone per hour

### 1 · The conversation is the last thing on the page, inside a scroll inside a scroll
`Voice.jsx:247-266` (the three columns, `order: 3` for the log on mobile), `:438-439` (the core column, `order: 1`), `:549-555` (the Station rail, `order: 2`), `:257` (log `min-height 380`, `max-height 600`), `:266` (the log's own `overflow-y: auto`); `valsChrome.js:137`; real frames `real-top`, `real-bottom`

Measured on his live page: the label at 48px, the core 176 to 420, the
caption 468, the ritual chip and Brief me around 503 to 580, the Station
panel 575, the comms log 829, the composer about 1,450. `main` scrolls
1,591px; inside it the log is its own 486px window over 15,312px of history
(129 messages, 7 days). To read the newest line and reply, he scrolls the
page to its bottom and relies on the log having stuck to its own bottom
(`useStickToBottom`, `:144`); to read an older one he scrolls the inner
window, which on iOS competes with the outer one. The comments explain every
step of how this order was reached (11 Sep, 14 Sep, "his order,
explicitly"); each fixed a real report. The sum is a page whose first screen
is instrument and chrome.

| Before | Why | Severity |
| --- | --- | --- |
| The composer ~1,450px down, the newest line under two scrolls, 9 objects above the fold of which one is the conversation | `layout.md › Best practices`: "People want to view the most important information right away, so don't obscure it by crowding it with nonessential details." `designing-for-ios.md › Best practices`: "limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." Nested scrolling: judgment (`scroll-views.md` asks for one scroll per axis where possible). | High |

### 2 · Attach one photo and the composer breaks; the route label lands above the wrong panel
`Voice.jsx:415-436` (the composer row), `:419` (`AttachPending` rendered inside the horizontal flex row), `:424-426` (the route preview, `position:absolute; top:-22px` in a row that is not positioned); `Controls.jsx:499-511`; demo frame `demo-cup-route-attach`

With one pending photo the row holds the 52px thumbnail, its caption "rides
with your next question" squeezed to one word per line, the attach button,
an input that grew into a 140px-tall pill, and Send pushed past the panel
edge (about 34px of it visible, clipped to "Se"). The route preview ("→
Inbox" when he types something Nova would file) is absolutely positioned
against the nearest positioned ancestor, which is the whole comms-log
`Panel`, so it draws 22px above the panel's top border, beside the Station
panel, 249px above the field it describes. Measured: label at y 360, input
at y 609.

| Before | Why | Severity |
| --- | --- | --- |
| Send clipped off-panel and the field distorted by one attachment | `accessibility.md`: controls must stay reachable at their size; a clipped primary action is unusable. Checklist §3, Width. **Bug.** | Critical |
| "Where this will go" drawn 249px from the words it labels | `layout.md › Visual hierarchy` (proximity); judgment. **Bug.** | High |

### 3 · The Nova button on the Voice screen starts a conversation that nothing listens to
`MobileChrome.jsx:159` and `SummaryDock.jsx:69` (the dock core always calls `startLiveTalk`), `App.jsx:6569-6583` (`startLiveTalk` sets `liveTalkOn`, `voiceConvMode`), `valsChrome.js:413` (`presence` is null on `voice`), `VoicePresence.jsx:73-76` (the only code that opens the mic on `conversing`), `Voice.jsx:129-138` (Voice opens its mic only on `voiceAutoListenTick`)

On every other screen the dock's Nova tap mounts `VoicePresence`, whose
effect opens the microphone. On Voice that component is switched off
("the core and the transcript are already the whole screen there"), and
Voice's own dictation reacts only to the auto-listen tick. So a tap on the
dock's Nova while on Voice sets conversation mode on, the caption reads
"CONVERSATION ON · YOUR TURN", and no microphone opens. Read in source; not
exercised on a device, because it needs a real mic. Either way the screen
carries two talk buttons that behave differently.

| Before | Why | Severity |
| --- | --- | --- |
| Two talk controls; the one in the dock says "your turn" and does not listen here | `feedback.md › Best practices`: "Show people when a command can't be carried out and help them understand why." `design-principles.md` (Familiarity): things that look the same must behave the same. **Bug (from source).** | High |

### 4 · One state, drawn three to five times, in words that differ by surface
`Voice.jsx:195-201` (11 caption strings), `:460` (ring hue), `:475` (caption hue), `:526-535` (waveform or iOS bars), `:558-560` (MIC · ANSWERS · ENGINE rows and bars), `:367-369` (the busy line); `VoicePresence.jsx:81` (5 words on other screens)

While he talks: the caption turns violet, the outer ring turns violet, the
MIC row says LISTENING with its bar at 92%, and the waveform runs. While
Nova thinks: "READING THE VAULT…" under the core, "THINKING…" in the
Station, "» NOVA reading the vault…▍" in the log (three places, two
wordings). While she speaks: gold caption, gold ring, ENGINE bar at 92%, the
waveform, and the dock orb. Across surfaces the same moment is named
differently: the Voice caption says "HEARING YOU…" where the presence says
"HEARING", "READING THE VAULT…" where the presence says "THINKING". Eleven
caption strings serve five states. The demo also contradicts itself: the tag
says "CONCEPT PREVIEW · DEMO REPLIES" and a demo reply arrives, while the
Station says ANSWERS OFFLINE (`:559`, `voiceLive` is false in demo).

| Before | Why | Severity |
| --- | --- | --- |
| Up to five simultaneous renderings of one state; two vocabularies | `feedback.md › Best practices`: "Consider integrating status feedback into your interface... near the items it describes." Checklist §3, the parent pattern Home finding 2 named. | High |
| "ANSWERS OFFLINE" beside a working demo reply | NOVA-METHOD: honest degradation, never fiction; a label that misdescribes its state. | Medium |

### 5 · "Remember" on every line: 128 gold targets, under 28pt in command
`Voice.jsx:283-285`, `valsMisc.js:356` (`remember` on every Nova message); sweeps on `real-top` and `real-command-top`

Every one of Nova's lines carries a gold "Remember" (file this via the
Inbox). On his real log that is 128 of them, 85×32 in cupertino and 69×26
in command, where 142 of the page's 145 targets fall under Apple's 28pt
floor. It is the only verb on most lines, so the log reads as a column of
gold words; it is also the same hue as Brief me, the speaking state and the
New-chat Undo (finding 6).

| Before | Why | Severity |
| --- | --- | --- |
| 142 targets under 28pt in command; 134 under 44pt in cupertino | `accessibility.md › Mobility`: "iOS, iPadOS: 44x44 pt default, 28x28 pt minimum." Critical under the skill's rule, as 02-inbox finding 10 and 04-fuel finding 4 were. | Critical |
| A verb repeated 128 times in the reading column | `designing-for-ios.md › Best practices` (limit onscreen controls); the Messages pattern is a hold menu on the bubble. Judgment. | High |

### 6 · Gold means ten things; cyan means everything
`Voice.jsx:253, 284, 304-305, 331, 335, 460, 475, 537, 543`; `valsMisc.js:137-141` (the OFFLINE tag), `:364` (the Leader tag)

Gold here is: Nova speaking (ring and caption), Undo after New chat,
Remember, a proposal's title and border, "Open Inbox" on a failed plan,
"Take it to the Coach", the morning ritual, Brief me, the Leader's tag, and
the OFFLINE tag. Violet is his mic being open, a research brief queued or
running, and the evening ritual. Cyan is idle, Nova's and Coach's tag, Send,
"Yes, do it", "Walk me through it", the routing notice, the evidence card,
the route preview, the Station frame, every bracket and every bar. On Home,
Inbox and Train this week gold was settled as "waiting on your call" and
nothing else.

| Before | Why | Severity |
| --- | --- | --- |
| One hue for ten meanings; no single accent for the primary action | `color.md › Best practices`: "Avoid using the same color to mean different things." `liquid-glass.md › Color on glass`: "Apply color sparingly... Reserve it for elements that truly benefit from emphasis, such as status indicators or primary actions." His 27 Sep rules. | High |
| Listening vs speaking told by violet vs gold | `color.md › Inclusive color`: "Avoid relying solely on color to... communicate essential information." The caption words carry it too; the ring does not. | Medium |

### 7 · A reply's line breaks vanish, so lists run together
`Voice.jsx:275` (the reply in a plain `<span>`, no `white-space`), `valsMisc.js:302` (`toSpokenProse`), `spokenProse.js:22-38` (markers stripped, newlines kept); demo frame `demo-cup-convo-bottom`

The checklist's V4 row says bold, links and bullets are "not rendered".
The source says more precisely: since 10 Sep markdown is stripped on
purpose (his "sound and act like a normal human"), and the newlines are
kept, but the span collapses them. A three-item list arrives as one run:
the demo frame reads "…over seven hours. Monday: 7 h 40 Tuesday: 6 h 10 The
rest: over 7 h Tuesday is the outlier." On his real log, **0 of 128** Nova
lines contain a newline or any markdown, so today the gap costs him nothing
on screen; it bites the first time an agent answers in a list.

| Before | Why | Severity |
| --- | --- | --- |
| Line structure lost between the model and the screen | `typography.md` (legibility); judgment. The fix is `white-space: pre-line` on the reply, or real paragraphs; stripping stays. | Medium (Low on today's data) |

### 8 · While Nova speaks, the page scrolls the core away
`Voice.jsx:153-167` (`scrollIntoView` on each new hero), `:384` (the glass block above the composer), `:512-521` (a second centre-stage card near the core), `:581-593` (a third copy, ON THE GLASS, in the Station column); demo frame `demo-cup-speak`

When a panel rises the page jumps to it (the 14 Sep fix for "never
scrolled to"), which takes the core and its SPEAKING caption off screen; the
rail's mini panels then sit under the dock and the demo banner. On the phone
the glass can be drawn in three places: the hero and rail in the log, the
centre stage card by the core, and the ON THE GLASS history in the Station
column. The panels' own labels are 7 to 8.5px monospace (`StageCard.jsx:115,
283, 290`), under the 11pt floor.

| Before | Why | Severity |
| --- | --- | --- |
| The page moves under him on every beat; three renderings of the glass | `apple-design` §3 (never lock the view against his reading); judgment. `motion.md`: motion that is not his is the costly kind. | High |
| 7 to 8.5px labels on the glass | `typography.md`: iOS minimum 11pt. | High |

### 9 · A failed transcription keeps nothing
`useDictation.js:258-311` (`finishNova`: the blob is sent once, a failure calls `onError` and the recording is dropped), `valsMisc.js:386-391` (the toast wording), `App.jsx:9074` (`notifyEmptyListen`)

Since 25 Sep his iPhone records and the Mac transcribes. If that request
fails (the Mac asleep, a 30s timeout, a 5xx) he gets an Island toast, "Nova
couldn't hear that: …", and the recording is gone: no Retry that resends the
same audio, no line in the log saying a turn was lost. On a feature that has
worked 1 time in 21 on his phone, the failure is the common case.

| Before | Why | Severity |
| --- | --- | --- |
| The failure is a toast and the words are discarded | `generative-ai.md › Outputs`: "If something goes wrong, describe what happened in plain language and offer a clear next step." `feedback.md`: "Show people when a command can't be carried out." CLAUDE.md, honest degradation. | High |

### 10 · The spoken question is cut mid-list and glued to its ending
`server/lib/briefDecisions.js:27-31` (`firstSentence` falls back to `t.slice(0, 150)` when no full stop comes within 150 characters), `:49` (" Happy for me to file that, sir?" appended); real frames `real-mid`, `real-summary-top`, `real-bottom`

On his real morning the close asked a question built from a long program
line with no full stop inside 150 characters. The helper cut it mid-list,
two words into the last item, and appended the question with no
punctuation, so the log, the scrim and the voice all ended "…, [two words]
Happy for me to file that, sir?". Found on the Voice screen; the fault is
the server's.

| Before | Why | Severity |
| --- | --- | --- |
| A sentence cut mid-phrase, spoken and shown | `writing.md` (clear, complete); judgment. **Bug.** Cut at the last word boundary and end with a full stop before the question, or cut at the last list separator. | Medium |

### 11 · The Station panel is a settings page on the front door
`Voice.jsx:549-594`, `RailRow` `:71-82`; real frame `real-top`

On the phone the Station column (`order: 2`) sits between the core and the
conversation: MIC READY, ANSWERS VAULT · READ-ONLY, ENGINE NOVA · DEFAULT,
the "HEY NOVA" toggle (a 42×29 word), an engine footnote at 9px, and "Voice
selection lives in Settings." at 9px. Three of its four bars encode nothing
he acts on (MIC 12% when ready, ANSWERS 46% when live). The one live
control, the wake word, exists in Settings too. The 26px clock above it
repeats the status bar.

| Before | Why | Severity |
| --- | --- | --- |
| Diagnostics, a duplicate toggle and 9px footnotes between the core and the conversation | `layout.md › Best practices` (nonessential detail); `typography.md` (9px under the 11pt floor); `settings.md`: infrequently changed options live in Settings. | Medium |

### 12 · The close and the blocked-speech banner float over the page in their own materials
`Voice.jsx:485-494` (the answer bar: flat near-black, 1px accent border, `position:fixed` over the page), `:500-507` (Tap to hear: flat, no blur, **no dismiss**), against `VoicePresence.jsx:89-108` (the same banner on other screens: glass, with ×); demo frames `demo-cup-close`, `demo-cup-blocked`

The checklist's V10 row is confirmed and widened: the Voice copy of "Tap to
hear" has no way to put it down (the presence copy gained a × on 22 Sep for
exactly the reason "on a phone, in public"). The answer bar's four verbs
are Yes (cyan fill), No (grey fill), Later and Stop (text); in the scrim the
question sits under a card that may not have arrived yet (real frame
`real-mid` shows the label and question with no card).

| Before | Why | Severity |
| --- | --- | --- |
| No way to dismiss the blocked-speech strip on Voice | `design-principles.md` (Agency); `apple-design` §16. | Medium |
| Two floating layers in flat fills where every other floating layer is glass | `materials.md` / `liquid-glass.md › Where the material belongs`: the floating functional layer is the glass layer. | Low |

### 13 · Smaller things seen
- The head is a numeral plus a two-part label ("II." in command, "Neural
  link · Voice") and a status tag whose text is a sentence in capitals
  ("LIVE · READ-ONLY ANSWERS FROM YOUR VAULT").
- The routing notice squeezes its reason into a column 6 lines deep beside
  its tag and "Just answer it" (demo frame).
- The about-you ritual ("Let Nova learn you · 5 min, tap to start") showed on
  his real page: `liveProfile` reads as empty on his vault.
- Two rings rotate indefinitely at 44s and 14s; `var(--nv-anim)` pauses
  them under Calm, but at idle nothing needs to move.
- `ModelChoicePrompt` is a fixed banner for the decision the Inbox draws as
  a card (inventory first look, unchanged).
- Day separators (the date in capitals between two dashes) live only
  inside the inner scroll.

---

## 3 · Keep

- **Nova ends the turn, on the pause he chose** (`useDictation.js`, the
  `holdMs` clock), and a spoken turn and a typed one are marked apart
  (`setOrbInputValue` vs `setTypedInputValue`).
- **The iPhone records and the Mac transcribes**, with the meter's verdict
  sent along and the turn's end written to a receipt (`reportTurnEnd`).
- **The glass rises with the speech** and changes with the line, from real
  numbers (`glassBeats.js`, `StageCard.jsx`); a card can never say
  something the voice did not.
- **One record for every door.** "on your iPhone", "via Siri" on a line say
  where it was said (`whereLabel`), and New chat has an Undo that names what
  comes back.
- **Honest words.** "Nova answered but the phone blocked the sound", "Queued
  for tonight, the brief lands in your Inbox by morning", "Replaced by your
  correction" (never "dismissed" for a correction).
- **The close answers by voice or by tap**, and a question mid-close pauses
  the queue instead of discarding it (`App.jsx` `doOrb`).
- **Ambient-session playback**: effects never pause his music; the Speak vs
  Duck fork is his, in Settings (`audioSession.js`).
- **Reduced motion**: the waveform draws a still baseline; the halo is
  invisible when silent, so it never fakes life.

---

## 4 · Directions for the mockup round (mockup 62)

Drawn in `design/mockups/62-redesign-voice.html` (A, B, C; seven or eight
screens each, the six states plus where everything else went). Each keeps
every function in §6 and gives it a home; each has one talk control, so
finding 3 disappears by construction: in A and B it is the dock's Nova
button, carrying the page's one accent; in C the Nova button grows into the
large orb on this page.

**A · The conversation as the page.** Messages' shape: his words right, in
monochrome glass bubbles; Nova's left, as text on the sky with real line
breaks; panels inline under the reply that raised them; decisions as the
Coach-deck card inside the thread. One composer bar above the tab bar
(attach, field, the route shown inside the field, send when there is text).
The state lives in one place, a status line at the top that is also the
Island's words. Station, Brief me, Ambient and New chat move to a ⋯ menu;
Remember moves to a hold on the line.

**B · The stage.** The running glass first: what Nova is showing now, large,
with the spent panels as a rail under it, then the sentence she is saying in
serif and his last line above it. The transcript is a drawer with a grabber
at the foot of the page (medium and full detents). Best while she speaks;
weakest for a long typed exchange.

**C · The simplest.** One large Nova, one line of what she heard, one line
of what she said, and everything else behind a pull-up. The glass appears
between the orb and the lines only while it is up; the dock shows only the
tab bar here, because the orb is the Nova button. Least to look at; the
most taps to reach anything that is not talking.

---

## 5 · Method

**Source.** The files in the header, read in full or in the ranges given.
Greps for hue use in `Voice.jsx` (gold 9 sites, violet 5, cyan 39), for the
dock core's handler (`MobileChrome.jsx:159`, `SummaryDock.jsx:69`), for
`presence` (`valsChrome.js:413`) and for the program-audit sentence
(`server/lib/coachProgramAudit.js:237`, `server/lib/briefDecisions.js:27-49`).

**Demo captures: 14** (`--demo`, port 5183, a Vite server already running from
this checkout, not started by this audit): idle in cupertino, command and
summary (plus three measuring re-runs); a scripted conversation at the page
bottom; thinking (`voiceBusy`), speaking with three glass beats, blocked
speech, the close (stage focus plus a three-question queue), conversation
paused; the composer with one attachment and a routed phrase. States were
set through `window.__novaApp.setState` on local state only; demo mode has
no connection, so nothing could write.

**Real captures: 5, all `--readonly`** (`node scripts/dev-connect.mjs`, token
never printed): top in cupertino (with the counts and sweeps), page bottom,
mid-page, top in command, top in summary. `--readonly` engaged on every run
and never exited 3. Blocked writes, by run: 1, 1, 23, 1, 23 (49). Every
run blocked one `POST /api/notes/summary` (the Home revisit that fires on
any screen). The mid-page run blocked, besides it, 18 × `POST /api/tts`,
1 × `POST /api/brief-state/delivered`, 1 × `POST /api/ask/prewarm` and
2 × `POST /api/voice/turn`; the summary run blocked 23 of the same shape
(its breakdown was not printed). The TTS and
brief-state writes are the morning brief delivering itself on load (App
level, the greeting pipeline 02-inbox recorded); the `voice/turn` receipts
come from Voice's own dictation hook (`Voice.jsx:117`), opening the reply
window after the blocked speech "ended". Nothing was posted to his
conversation record; no send, remember, undo, approve or keep was tapped or
evaluated.

**Sweeps.** Tap targets are elements with a React `onClick`,
`onPointerDown`, `onPointerUp`, `onTouchStart` or `onMouseDown`, plus
inputs, textareas, selects and buttons, visible and inside
`[data-screen-label="Voice"]` (the dock excluded; the attach `label` has no
handler and was added by hand as a 40×40 target where counted in the text).
Type sizes are the distinct computed sizes of elements owning a text node.
Offsets are page coordinates inside `main`. Conversation counts came from
`window.__novaApp.state.voiceChat` as numbers only.

**Not captured, and why.** A real microphone turn (listening, hearing, a
failed transcription), the dock tap on Voice (finding 3), the GlassSheet
enlarge, the Mac layout, and a live proposal, acted receipt, plan report or
sources panel (none were in his current record, and demo mode gates them
off, `valsMisc.js:330-350`): all read from source.

**Stills.** Kept out of the repo, in the session scratchpad (`voice/`).
**Cleanup verified.** `node scripts/dev-connect.mjs --clean` removed
`public/_devconn.js`; `ls public/_devconn*.js` matched nothing. The Vite
server on 5183 belonged to another session and was left running.

**Checklist rows, confirmed or corrected.**
- V4 "markdown not rendered": **corrected**. Markdown is stripped on
  purpose (`spokenProse.js`); the fault is the collapsed newlines (finding
  7), and it is absent from his real data today.
- V10 blocked-speech banner flat: **confirmed**, and it also lacks the ×
  the presence copy has (finding 12).
- V7 route preview: **confirmed as a bug** (finding 2).
- V3 "the station frame never changes under cupertino": **confirmed**, and
  it also does not change under `summary`.

---

## 6 · Section → where it goes (round 1)

| Voice today | A · conversation | B · stage | C · simplest |
| --- | --- | --- | --- |
| V1 head, state tag, live clock | Large title "Voice"; state in the status line; clock retired (the status bar has one) | Status line over the stage | One line under the orb |
| V2 stage-focus scrim | A panel opens full width in a sheet; the close is a card in the thread | The stage **is** the focus | The panel between orb and lines |
| V3 comms log, Undo · N turns, New chat | The page itself; New chat in ⋯ with Undo as a receipt | The drawer | Behind the pull |
| V4 messages (tag, time, where, reply, attachments, Remember, research, sources, acted + Undo, proposal, plan report, panels, notice, evidence) | Bubbles and text; Remember on hold; research/sources/receipts/decisions inline as house cards | In the drawer, same grammar as A | In the pull, same grammar as A |
| V5 busy line | The status line ("Reading your notes…") | Stage caption | The Nova line |
| V6 the glass (hero, rail, tap to enlarge) | Inline under the reply; tap opens the sheet | The stage and its rail | One panel at a time, tap to enlarge |
| V7 composer (attach, route, input, send) | One bar above the tab bar | A slim bar at the drawer's top | In the pull; typing raises it |
| V8 core + 8-rung caption | The Nova button and one status line | Nova button; stage caption | The large orb, which is the Nova button grown into the page |
| V9 briefQueue bar | A deck card in the thread (✓ · Later · ✕ · talk) | A card on the stage | A card in place of Nova's line |
| V10 Tap to hear | One glass strip with × | Same | Same |
| V11 centre stage card | Merged into the glass | The stage | The panel |
| V12 waveform / iOS bars | Inside the status line | Under the caption | Under the orb |
| V13 ritual invite, Brief me, Ambient | Suggestions over an empty or idle thread; Ambient in ⋯ | Chips on the empty stage | In the pull |
| V14 Station (MIC, ANSWERS, ENGINE, Hey Nova, footnote), On the glass | ⋯ → Voice status sheet (and Settings); On the glass = the thread | Status sheet; the rail | Status sheet; the rail in the pull |
| O6 presence on other screens | Unchanged: the orb, the Island, the hold pop-up | Unchanged | Unchanged |
