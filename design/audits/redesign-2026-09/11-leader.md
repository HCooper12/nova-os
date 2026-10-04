# 11 · Leader: audit, 5 Oct 2026

The Leader is his leadership coach. It keeps a picture of what he is working
against, what is working for him and what he has resolved; it sends one idea a
day (the lead); it follows up when the picture goes stale; and it holds the
sit-down, a conversation that consults the other agents and writes what he
says back into the picture. Its hue in the agent registry is `--nv-mg`,
magenta (`src/artifactClient.js:29`, `src/glassMarks.js:34`,
`src/agentWorld/beings.js:152`). Judged against his own bar for "simple", the
Coach deck (one sentence, the change drawn, a light tick or cross, talk back,
Undo), against checklist §3, and against the three things the Leader's history
binds it to: the two channels (memory `nova-leader-drift`), leadership on its
own subject (`nova-agent-relevance`), and every agent consulting every other
with authorship on every reply (`nova-agents-consult-everyone`).

Evidence: source read in full (`src/screens/Leader.jsx` 146 lines,
`src/vals/valsLeader.js` 113, `src/LeaderBox.jsx` 182, `src/leaderAccent.js`
11), every Leader method in `src/App.jsx`, the Summary Home moment, the Index
row, and the server the page depends on (`server/routes/leader.js` 106,
`server/lib/leader.js` 1,058, the Leader's lane in `server/lib/claudeCode.js`,
`server/lib/consult.js`). Photographed in DEMO MODE ONLY at 390×844 in his look
(summary × command × glass × hologram) and at 1280×800, in a detached snapshot
of `4689711`. Demo mode shows the Leader unconnected, so a fixture of invented
content at his real scale was set straight into the page's state; no request
was sent or attempted (§5). His actual use was read from the server's own
records as counts, dates and lengths only. Read under `apple-hig-review`: 17
reference pages opened, 15 of them cited as `file.md › Heading`, with
"judgment" where none applies. Method and limits are in §5.

---

## 1 · Verdict

**Critical issues, of one small kind; the real problem is that the picture
only grows.** The only Critical item is a control 14 pt tall. The finding that
matters is that nothing has ever left the Leader's picture of him.

The number that says it: **0 of 10.** Ten struggles have been told to the
Leader since 7 Sep and none has ever been resolved (`server/data/leader.json`:
10 open, 0 carrying `resolvedAt`, 5 working). The newest thing he told it
landed at 09:27 on 21 Sep, 13 days before this audit by the server's own
count. The page cannot show "resolved" at all: the route sends open struggles
only, the newest eight (`server/routes/leader.js:29`), so a struggle marked
handled simply disappears, and marking one is a hidden two-tap path 1.2
screens down whose Undo lives in the Inbox history. The follow-up built to
prompt an update asked three times between 17 and 28 Sep; the third still
waits in the Inbox as a card whose Approve files the question instead of
answering it, and while it waits the Leader asks nothing more
(`server/lib/leader.js:831-832`). The last conversation turn from any door was
on 15 Sep. The two answers typed into the box on 21 Sep both hit the client's
20-second limit, and both landed anyway: they are the newest three items in
the record, two struggles and one win, and neither resolved anything.

What he meets when he opens it is the server's reply in storage order: a gold
idea card; a violet situation card whose question starts 25 pt above the fold
and whose answer box starts 63 pt below it; eight paragraphs in warn red drawn
as chips, then five in green; a conversation squeezed into a 388 pt box inside
the page's own scroll; and an ISO-dated trail. 2.88 screens, 14 type sizes,
five hues, and the Leader's own magenta on none of it.

### Clutter numbers, as it stands (checklist §3)

| Test | Leader today (Nova glass, 390×844) | Target |
| --- | --- | --- |
| Focal point | The day's idea: a serif 24 title in a 367 pt gold card, first. The thing the Leader is waiting on, its question, starts at y 751, 25 pt above the fold; the box to answer it starts 63 pt below. The picture starts 1.2 screens down, the sit-down 2.3 | One, above the fold |
| Objects above the fold | 17: 3 panes and 14 text blocks (164 words), and 0 controls (a hand count from the frame; the fold is the dock's top, y 776) | Lower, or a reason |
| Page height | 2.88 screens (2,427 pt) with no conversation; 3.25 with one exchange, plus a nested 388 pt box holding 3,861 pt | ≤ 2 before a page |
| Type sizes | 14 (10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 24, 30); 15 with a reply on screen (adds 14.5). His own words, the struggles and wins, are the 11.5 | ≤ 3 (4 with numerals) |
| Tap floor | 16 controls across the states; 5 under 44 (Speak it 34, Tell Nova 33, Handled 32, New conversation 32, Say more 14); 1 under 28 (Say more, 53×14) | ≥ 28; primary ≥ 44 |
| Verbs | Situation: type or Speak it, then Tell Nova. A struggle: tap to reveal, then Handled. Sit-down: Send, New conversation. The idea, the wins and the trail: none | One primary, one quiet, talk back |
| Gestures | None of its own; every action is a tap. Home's box swipes between two faces; here the box has one face | Every capability has a pixel |
| Motion | Entrance: the situation panel's `fadeUp` only. No entrance for a message, no exit, and no moment when a struggle is resolved (it is gone on the next read). Reduced motion: the global rule ends every animation at once (`src/index.css:2594`), so there is no cross-fade | All four |
| States | Loading: none; the wait for a reply is a static gold line. Empty: honest once connected, but "Connect a backend in Settings to meet the Leader" also shows in demo mode and before the first read. Offline: the last-known picture, unlabelled. Error: a chat failure is a "» SYSTEM Error:" line; a slow answer says it may still be recording, which is honest | All four designed |
| Width | `scrollWidth` 390 at 390. At 1280 one 1,042 pt column; the idea's line runs about 101 characters | 390 |
| Colour | Five hues painted (gold on 14 colour properties, violet 8, cyan 3, warn red 24, green 15); magenta on 0 | One hue, the Leader's |
| Idioms | No idiom branch. Under `summary` it renders the pre-redesign objects (a serif 30 title, uppercase eyebrows, bordered panes), as Practice does | Both checked |
| Use | Profile: 10 open, 0 resolved, 5 working, the newest from 21 Sep. Sit-down posts: 3 (26 Aug from the Mac during the build; 11 and 15 Sep from tailnet devices). Through Nova's door: 6 turns routed to the Leader, 7 to 14 Sep. Box answers: 2, on 21 Sep, both client time-outs that landed. Follow-ups: 3, one pending since 28 Sep. Daily ideas: 41 since 26 Aug | |

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 · The page is the record in storage order, and the Leader's work sits below the fold
`Leader.jsx:55-145` (one column: head, idea, box, two chip lists, sit-down,
trail); `valsLeader.js:60-112`. Frames: the first screen, scrollTop 700, 1420
and the foot.

The page lays out what the server returns, top to bottom: the idea, the
situation, the struggles, the wins, the conversation, the trail. The first
screen is the idea and the situation's summary, with no control on it. The
question the Leader is waiting on begins on the fold line, the place to answer
it is below the fold, the picture he would update begins 1.2 screens down and
the conversation 2.3 screens down. Every section brings its own type scale,
which is how one page reaches 14 sizes.

| Before | Why | Severity |
| --- | --- | --- |
| 2.88 screens in storage order; 0 controls on the first screen; the question at the fold and its answer below it | `layout.md › Visual hierarchy`: "it generally works well to place the most important items near the top and leading side". `designing-for-ios.md › Best practices`: "it tends to be easier and more comfortable for people to reach a control when it's located in the middle or bottom area of the display". | High |
| 14 type sizes on one page | `typography.md › Conveying hierarchy`: "Adjust font weight, size, and color as needed to emphasize important information and help people visualize hierarchy." Judgment: fourteen steps is no hierarchy at all. | High |

### 2 · The picture only grows: "resolved" has no form, and the one way to reach it is hidden
`Leader.jsx:23-50` (ChipList), `:95`; `valsLeader.js:87-90`;
`server/routes/leader.js:29`; `App.jsx:10400-10413`. Frames: the list at
scrollTop 700; the revealed Handled.

His struggles are drawn as chips, but each is a full-width paragraph of two to
five lines (60 to 92 pt at 390) in warn red, eight in a column. The only hint
that one can be resolved is the right-aligned "Tap one to mark it handled"; a
tap reveals Handled at 70×32 pt inside the paragraph, which reflows around it.
After the write the struggle is gone on the next read, and a toast says the
undo is in the Inbox history (`App.jsx:10406`). The route sends open
struggles only, the newest eight, so the box's "10 open" sits over a list of
eight, and nothing resolved is ever sent: the page has no place where his
progress could appear even if he made some. In his record that place would
be empty today.

| Before | Why | Severity |
| --- | --- | --- |
| Resolve is a tap on a paragraph, then a 70×32 Handled; the item vanishes; its Undo is in another room | `generative-ai.md › Outputs`: "surfacing controls like Edit, Undo, Retry, or Adjust near generated content preserves people's agency... When people adjust or personalize output, provide a clear signal that their action had an effect." `undo-and-redo.md › Best practices`: "Show the results of an undo or redo." | High |
| Open struggles only, the newest eight: "10 open" over eight items, and nothing resolved is ever sent | `layout.md › Visual hierarchy`: "if you can't display all the items in a large collection at once, you need to indicate that there are additional items that aren't currently visible." NOVA-METHOD: honest degradation, never fiction. | High |
| The picture as two lists of paragraphs | NOVA-METHOD §2b rule 7 (a list gets depth; a change is acted out). `lists-and-tables.md › Content`: "If each item consists of a large amount of text, consider alternatives that help you avoid displaying over-large table rows. For example, you could list item titles only, letting people choose an item to reveal its content in a detail view." | High |

### 3 · The sit-down: a 388 pt window inside the page, opening at the end, forgetting on reload
`Leader.jsx:105` (`max-height:46vh; overflow-y:auto`),
`src/useStickToBottom.js`; `App.jsx:468` (`leaderChat: []`), `:483` (the
session id restored from localStorage), `:10442`; `src/vals/shared.js:24-26`.
Frames: the sit-down with one exchange, the inner box at its top and bottom.

The conversation is a scroll view inside the page's scroll view. With one
exchange at the median length of the Leader's replies in his live session
(about 5,800 characters; §5) the inner box holds 3,861 pt in 388, ten boxes'
worth, and it sticks to the bottom, so a reply opens on its last lines and its
first line, the one that names who the Leader asked, is scrolled away. Replies
are set at 13 px. The conversation lives only in the page's memory while the
session id lives in localStorage: after a reload (iOS ends an idle web app
often) the page shows the empty prompt beside a New conversation control, and
his next message resumes a conversation he can no longer see.

| Before | Why | Severity |
| --- | --- | --- |
| A 388 pt scroller inside the page; a reply opens at its end | `scroll-views.md › Best practices`: "Avoid putting a scroll view inside another scroll view with the same orientation. Nesting scroll views that have the same orientation can create an unpredictable interface that's difficult to control." | High |
| The conversation is gone after a reload while the session carries on | NOVA-METHOD non-negotiable: honest degradation, never fiction. Judgment: the page says nothing was said while the Leader remembers all of it. | High |
| Long replies at 13 px | `accessibility.md › Vision`: iOS default 17 pt, minimum 11 pt. `typography.md › Ensuring legibility`: "Follow the recommended default and minimum text sizes for each platform". | Medium |

### 4 · Who is speaking is unclear, and the agents the Leader consulted have no form
`valsLeader.js:96-101` (the tags); `LeaderBox.jsx:103, :124, :137`;
`App.jsx:10442` beside `:6306`; `server/lib/claudeCode.js:1255`;
`server/lib/leader.js:979-1011`.

Three speakers share the page without a face between them. The chat tags the
Leader with a gold "» LEADER" inside a bubble tinted the same cyan as his own.
The box above it, which holds the Leader's own question, is headed "NOVA NEEDS
TO KNOW" over a "Tell Nova" button. An error is "» SYSTEM". When the Leader
consults, the reply opens with one code-written line of prose naming who was
asked. The job carries the full roster (who was asked, what, for how long,
and their answers: `claudeCode.js:1255`); Nova's own lines keep it
(`App.jsx:6306`); the Leader's line drops it (`:10442` keeps `who` and
`text`). His standing rule (29 Sep) is authorship on every reply, and here the
Researcher and the Librarian cannot be seen working, opened, or told apart.

| Before | Why | Severity |
| --- | --- | --- |
| "» LEADER", "Nova needs to know", "Tell Nova" and "» SYSTEM" on one page; consults as one line of prose; the roster dropped | `generative-ai.md › Transparency`: "Communicate where your app uses AI." `writing.md › Best practices`: "use them consistently throughout your app, and try not to switch perspectives." Memory `nova-agents-consult-everyone`: authorship on every reply. | High |

### 5 · Five hues, none of them the Leader's
`src/leaderAccent.js:9`; `Leader.jsx:64, :95, :96, :119`; `valsLeader.js:99`;
`src/vals/shared.js:26`; `src/indexGroups.js:38, :40`; `src/index.css:334`.

The idea is gold, the situation violet, the struggles warn red, the wins
green, the talk controls and both chat bubbles cyan; a computed sweep finds
magenta on nothing. Gold does four jobs here (the idea's border and kind, the
trail's tags, the Leader's tag, the busy line) and none of them is its one
meaning in his rule (not yet decided, waiting on his call). His struggles wear
the red that his 4 Oct rule keeps for one thing only, Nova disagreeing with
him. Across the app the Leader has three colours: magenta in the agent
registry, the glass marks and its documents; gold and violet on its box; gold
on the Index, where it is "Lead" and magenta lights Technique instead.

| Before | Why | Severity |
| --- | --- | --- |
| Gold, violet, red, green and cyan on one page; magenta absent; the Leader gold on the Index while magenta is Technique's | `color.md › Best practices`: "Avoid using the same color to mean different things. Use color consistently throughout your interface, especially when you use it to help communicate information like status or interactivity." NOVA-METHOD §2b rule 8, and the pushback rule (4 Oct). | High |

### 6 · The question lives in two places, and the Inbox copy cannot answer it
`server/lib/leader.js:979-1011` (`raiseSituationFollowUp`), `:826-839`
(`shouldAskSituation`); `LeaderBox.jsx:101-143`.

The follow-up is a pending Inbox card titled with the question "where does it
stand?". Its Approve files the question to the journal and its Discard drops
it; neither carries an answer, which only the Leader's box can take, on a
different screen with different verbs. The card's own reason text tells him
to answer in the Leader. One has been pending since 28 Sep, and because it is
pending the Leader will not ask again.

| Before | Why | Severity |
| --- | --- | --- |
| A question filed as an approve-or-discard card that cannot carry an answer; while it waits, no new question | NOVA-METHOD §2b rule 8: decisions are a conversation. `feedback.md › Best practices`: "When status feedback is available near the items it describes, people get important information without having to take action or leave their current context." | Medium |

### 7 · Five controls under 44 pt, one under 28
`LeaderBox.jsx:115-117` (Say more), `:129-137` (Speak it, Tell Nova);
`Leader.jsx:42` (Handled), `:102` (New conversation).

Say more, the one way to add to an answer once it is recorded, measures 53×14
pt: unpadded 11.5 px text. Speak it (34), Tell Nova (33), Handled (32) and New
conversation (32) are under the 44 pt default.

| Before | Why | Severity |
| --- | --- | --- |
| Say more at 53×14 pt | `accessibility.md › Mobility`: "iOS, iPadOS: 44x44 pt default, 28x28 pt minimum." | Critical |
| Speak it 34, Tell Nova 33, Handled 32, New conversation 32 | The same. | Medium |

### 8 · His own words are the smallest text on the page
`Leader.jsx:38` (`450 11.5px`). The struggles and wins render at 11.5 px, half
a point above the minimum, under a serif 24 for the model's daily title. On
the phone the thing he said reads smaller than everything the system says
about it.

| Before | Why | Severity |
| --- | --- | --- |
| His words at 11.5 px | `accessibility.md › Vision`: iOS default 17 pt, minimum 11 pt. | Medium |

### 9 · On the Mac, one 1,042 pt column
Frames at 1280. The idea's line runs about 101 characters; the eight struggles
become bars of eight different widths, the long ones wrapping to two lines with
the age stranded on a line of its own; the composer's field stretches 870 pt.

| Before | Why | Severity |
| --- | --- | --- |
| A phone column stretched to 1,042 pt | `designing-for-macos.md › Best practices`: "Leverage large displays to present more content in fewer nested levels and with less need for modality, while maintaining a comfortable information density". Judgment: about 100 characters a line is past a comfortable measure. | Medium |

### 10 · The states: no designed wait, a false "connect", an unlabelled offline
`Leader.jsx:77`; `valsLeader.js:95`; `Leader.jsx:119`.

`leaderConnected` is `L != null`, so before the first read lands, and in demo
mode, the page says "Connect a backend in Settings to meet the Leader." while
the app is connected or showing demo data. The wait for a reply is a static
gold line ("» Leader thinking it through…") with no word about whom it is
asking, though the roster on the job records each ask's state and time as it
runs. Offline shows the last-known picture with no label.

| Before | Why | Severity |
| --- | --- | --- |
| "Connect a backend" while connected or in demo; a static wait; an unlabelled offline picture | `loading.md › Best practices`: "Show something as soon as possible." `generative-ai.md › Outputs`: "Messages that describe what's actually happening can be more helpful than a vague status message." | Medium |

### Smaller things seen
- The trail shows 5 of 41 daily receipts, titles only, with ISO dates and no
  door: a past idea's line, why and sources are kept in the record and cannot
  be reopened (`valsLeader.js:82-83`, `Leader.jsx:130-143`).
- The idea has no answer. Technique asks whether it landed; the Leader's "Try
  today" never asks, and nothing on the card leads to talking about it.
- The sit-down's composer has no mic while the box above it has Speak it
  (`Leader.jsx:121-127`). The box's mic goes through the shared hearing
  engine, Nova's own ears on iOS since 25 Sep (memory `nova-voice-turn`:
  unverified on his phone).
- The header's research line ("N researched insights · last run" and an ISO
  date) is an operator readout; the insights are filed to the vault and the
  page has no door to them.
- "Working for him" speaks of him in the third person on his own page; three
  placeholders and foot lines carry em dashes (`Leader.jsx:108, :123`,
  `valsLeader.js:40`); "from:" is lower case where every other label is
  sentence case.
- Each chip's age wraps its "·" onto a line of its own at 390 (`Leader.jsx:40`,
  an inline `Meta` inside a flex span).
- While the Leader is thinking, the top bar's job pill squeezes "Demo data"
  onto two lines and stacks Ask's sparkle over its word (chrome, seen here; not
  owned by this page).
- Naming: "Leader" on the page, the sidebar and the compact title; "Lead" on
  the Index; "Lead · try today" and "Your situation" on Home's two faces.

---

## 3 · Keep

- **The two channels.** The day's idea is about leadership in general and is
  never handed the open pile; the situation has its own channel
  (`buildDailyPrompt`, `situationOf` in `server/lib/leader.js`). This is the fix
  for the six mornings the pile ate (memory `nova-leader-drift`). Every
  direction below keeps the idea and the picture apart.
- **Code owns the facts.** The open count, the days since he last said
  anything and "stale" are recomputed from the record on every read
  (`server/routes/leader.js:21-26`), never taken from the model.
- **The honest sentence.** "You last updated this N days ago" and "Nova does
  not know what has happened since" is the best line on the page; keep its
  meaning, in the Leader's own voice.
- **Answering where he is asked**, typed or spoken, in one cheap pass (his
  16 Sep report), and the timeout message that tells the truth instead of
  inviting a second send (`App.jsx:2369-2383`).
- **Every write on the rails.** Each profile change files a `leader-reflect`
  record with `undoData`, and the undo removes only what that write added
  (`server/lib/leader.js:631-718`).
- **The follow-up's restraint.** Never a second question while one waits; a
  dismissal leaves the same gap before the next (`leader.js:826-839`).
- **Ages on every item.** The model always saw them; since 15 Sep he does too.
- **The consult rail.** The Leader can ask anyone, and code writes the line
  that says who was asked (`server/lib/consult.js:60`,
  `server/lib/claudeCode.js:1221-1227`); his own words count on this door
  (`server/routes/leader.js:66-71`).
- **One set of words for the situation** on Home and here (`situationFace`,
  `valsLeader.js:31-44`).

---

## 4 · Directions for the mockup round

All three are drawn in `design/mockups/76-redesign-leader.html`, each as phone
frames at 390×844 with live motion. Every direction keeps every function the
page has today, uses the Leader's magenta as its one hue (each consulted agent
wears its own hue on its own face and nowhere else), sets his words at 17,
holds four type sizes a view and puts every control at 44 pt or more.

**A · The sit-down.** The page becomes the conversation, in the shape he chose
for Nova (mockup 63, D): the Leader's face heads it, with the picture as a
strip under its name (open, working, set down, as beads); the day's idea is
the Leader's first message of the morning and earlier ideas are earlier
messages, so the trail becomes the thread's own history; the question it is
waiting on is pinned above one composer at his thumb, with the mic, so the
box and the chat's input become one field. Tap the strip and the picture rises
over the thread as a glass stage: each struggle a thread from the day he said
it to today, solid while he has told the Leader about it and dashed through
the days without word, the one the Leader is asking about lit. Consults show
as seats under the Leader's name, lit while each agent works, openable after.
Setting one down acts out in the strip: the lit bead travels into the
set-down place and the counts turn. Numbers (measured on the frames): words above the
fold 164 → 85; controls on the first screen 0 → 7; type sizes 14 → 4; controls under 44
5 → 0; hues 5 → 1; the picture from 1.2 screens down to the first screen; the
conversation from a 388 pt box to the whole page, kept across reloads.

**B · The picture.** The page opens on the picture as a form, with the
conversation one tap deeper. A sentence written by code from the record ("Seven
things open, and nothing new from you for nine days"); the threads drawn large
(open above the line of days, what works below it, a shelf for what he has set
down, the fog since the last thing he said, the Leader's question as an orb at
today's edge tied to the thread it is about); the day's idea one scroll down;
"Talk to the Leader" always at the foot. Tap a thread and it lifts into a sheet
with his words, its age and three answers: Set it down, Still open, Talk about
it. Set it down acts out on the drawing: the thread runs through to today, ties
off, drops onto the shelf, and the sentence above rewrites itself; Undo sits on
the shelf where it landed. The conversation is its own page, where the agents
the Leader asks sit on a bench while they work and fold into the reply's
byline when they are done. Numbers: words above the fold 164 → 49, plus the
drawing's 74 labels; the page 2.88 screens → 1, with the conversation its own page; type sizes 14 → 4;
resolved: no form → a shelf; Undo: the Inbox → the shelf.

**C · One at a time.** When the picture has gone quiet, the Leader goes
through it with him, oldest first, in the Coach-deck shape he named as simple:
one card on screen (his words, how long it has been carried), a light tick
(Set it down), a cross (Still open), Talk about it, and one do-all (Keep the
rest open). A row of beads under the deck is the picture; two trays at the
foot fill as he goes. Set it down lowers the card into its tray and ties it
off; the next card rises. Talk about it opens the conversation with the card
quoted at the top, the agents the Leader asks shown as they work, and the
Leader able to offer the tick in its own reply. The end of the round-up is one
sentence in the serif, the picture as it now stands, and the day's idea to
take into the week. Numbers: words above the fold 164 → 63; struggles on
screen at once 8 → 1; resolve: two taps 1.2 screens down → one tap on the
first screen; type sizes 14 → 4.

**D · What the pixels argue for.** A picture that has only grown since 7 Sep,
on a page with nowhere to show it shrinking. The structural fix is B's form (a
picture with a place for "set down", and a Set it down that acts out where he
is looking) carried by A's conversation (full height, authored, kept). C is
the answer if what stops him is the pile itself: ten paragraphs at once is a
reason not to look, and one at a time is the shape he already trusts from the
Coach deck. They combine: B's drawing as A's rising stage, with C's round-up as
what the Leader opens when the picture has gone quiet for three days.
`charting-data.md › Best practices` binds whichever form he picks: "If you need
to create a chart that presents data in a novel way, help people learn how to
interpret the chart", so the first showing of the threads names its own parts.

---

## 5 · Method

**Snapshot and server.** A detached worktree of `4689711` at
`$SCRATCH/view-leader` (node_modules linked), Vite on 5206, opened in the
chrome-devtools MCP in an isolated context `leader`, the viewport emulated
before every guarded navigation (`390x844x3,mobile,touch`, then
`1280x800x1`, then 390 again for the Index). His look was set in the
`initScript`: `novaos.style=summary`, `novaos.theme=command`,
`novaos.material=glass`, `novaos.core=hologram`, no `novaos.connection`. The
guard refused every non-GET `fetch`, XHR and beacon and was installed again on
every navigation; `window.__blocked` stayed empty throughout. One viewport
change reloaded the page before the guard was back on; the network log for
that load shows a single GET of an icon from Vite and nothing else (demo mode
has no connection to send anything to). The page showed "Demo data" in the
top bar and in the toast.

**What demo shows, and the fixture.** In demo mode `liveLeader` is never
fetched and Home's box returns nothing (`valsMission.js:941`), so the page
renders its head, "Connect a backend in Settings to meet the Leader.", the
sit-down's empty prompt and Send (one frame). Everything else was photographed
with a fixture set through `window.__novaApp.setState`, the dev-only handle:
an invented record at his real scale (eight open struggles of the ten, at
lengths about 8 percent shorter than his, with his real ages; five wins; a
stale situation with a question; the day's idea; eight days of trail; a
research count), then one invented exchange at the median length of the
Leader's real replies, then the waiting state with an answered box. A struggle
was tapped once to reveal Handled; Handled itself was not pressed. No action
method was called, so no request was even attempted; no model was asked
anything. None of the fixture's words appear in this file or the vault.

**Frames read.** At 390: the demo page; the fixture's first screen and
scrollTop 700, 1420 and the foot; the sit-down with one exchange, its inner
box at the bottom and at the top; the revealed Handled; the answered box with
the job pill in the top bar; the Index's Mind group. At 1280: the first screen
and the lists. Stills stayed in the session and out of the repo (audit
convention).

**Measurements.** One computed-style sweep per state over
`[data-screen-label="Leader"]`: the distinct font sizes of every visible
element with its own text; every native control and every outermost element
with a pointer cursor, with its rendered box (the smaller side compared with
44 and 28); `main.scrollHeight` over the 844 viewport; `scrollWidth` of the
document and of `main`; a colour sweep matching every element's text, border
and background colour to the six Command hues (within 40 in RGB). The fold is
the dock's top (y 776). The count of objects above the fold is a hand count
from the frame.

**His use, read from the record.** Counts, dates and lengths only, nothing of
his words: `server/data/leader.json` (struggles open and resolved with their
dates, wins with their dates, 41 daily receipts, 33 research insights, the
last research run); `server/data/inbox.json` (Leader records by kind, status
and date: 4 profile receipts filed, 3 follow-ups of which 1 is pending);
`~/Library/Logs/nova-os-server.log` (every write to `/api/leader/*` and every
"ask → leader" routing line, by day and device class); the conversation record
in `server/data/conversation/` (no Leader rows since it began);
`server/data/agent-sessions.json` and the CLI's journal for the live Leader
session, read for turn counts and character lengths only (6 turns from him and
6 replies, 8 to 15 Sep; the replies' median 5,824 characters, the longest
8,657; his side carries context that code adds, so its lengths are not used).
Times are converted from the server's UTC to Melbourne.

**What was not seen.** His real page (described here only by its counts);
the Summary Home's Leader moment, which shows only from an hour before a work
block and returns nothing in demo (`valsSummary.js:238`); the Index row's live
value (in real use the day's idea title, `valsIndex.js:80-87`); a real reply
streaming, a real consult and its roster; the hearing engine on his phone; the
`cupertino` and `command` idioms as separate frames; the offline banner over
this page; the Mac between 390 and 1280; the follow-up push on his phone.

**Inventory notes, confirmed or corrected.**
- "The situation box is one shape drawn on two surfaces by design":
  confirmed (`situationFace`, `valsLeader.js:31-44`).
- "The composer here has no visible mic affordance of its own": confirmed.
- "This screen always passes `variant="apple"` (UNVERIFIED whether
  intended)": confirmed in source (`Leader.jsx:90`); under `summary` the
  difference does not show.
- "Reached by: sidebar/More": corrected for his phone. The More sheet is now
  the Index, where the Leader is the Mind group's "Lead" row (gold, a
  lightbulb); on the Summary Home it appears only from an hour before a work
  block (`valsSummary.js:238`, `valsMission.js:939`).
- "No explicit error/demo branch inside this screen": confirmed, and in demo
  mode the page asks him to connect a backend.
