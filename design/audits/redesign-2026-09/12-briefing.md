# 12 · Briefing: audit, 5 Oct 2026

The Briefing is the report he asked for on 7 Sep: say one sentence, agents
research the angles at once, Nova writes a document and a script together
from the findings and his own shelf (never the web), a notification says it
is ready, and he either reads it or presses Play and Nova performs it, a
sentence at a time, with the glass showing what each sentence is about. His
bar for it was the Iron Man workshop: things appear on the glass as the
assistant speaks. Judged against that bar, against the full-screen family he
chose on 3 and 4 Oct (the heart that stays, the words pouring from it, the
jade underline while Nova speaks, panels rising out of the core), against his
panel rule of 1 Oct, and against checklist §3.

Evidence: source read in full (`src/screens/Briefing.jsx` 376 lines,
`src/vals/valsBriefing.js` 128, `src/briefingVoice.js` 40,
`src/briefingStarters.js` 16, `server/lib/briefing.js` 386,
`server/routes/briefing.js` 47), every Briefing method in `src/App.jsx`, the
filing and retry paths in `server/lib/inbox.js`, the record cap in
`server/lib/inboxStore.js`, and `design/BRIEFING-PLAN.md`. Photographed in DEMO
MODE ONLY at 390×844 in his look (summary × command × glass × hologram) and at
1280×800, in a detached snapshot of `56928b0`. Demo mode can only show the
empty screen, so every other state was set straight into the page's React
state from an invented fixture at the scale of his real briefing (no
connection, no action method called, every non-GET request refused by a
guard, none attempted). His actual use was read from the server's own records
as counts, kinds and dates only. Read under `apple-hig-review`: 14 reference
pages opened, 13 cited as `file.md › Heading`, with "judgment" where none
applies. Method and limits are in §5.

---

## 1 · Verdict

**Critical issues.** On his phone the Briefing is a teleprompter: the glass
Nova performs on sits above a transcript that scrolls itself to the spoken
line, so the stage leaves the screen on the third sentence and never returns.
Around that, the head of the page is drawn under the floating bar (Close lands
on Settings), skipping a part exists only by voice, and the end of a briefing
offers one verb, Play again.

The number that says it: **2 of 31**. With a fixture at his real briefing's
scale (a summary and 30 beats in 6 parts), the glass is at least half on
screen for 2 of the 31 beats, the summary and the first line of part 1. At
beat 13 it is 797 to 886 pt above the top of the screen; by the last beat,
about 2,000 pt. Both images the pipeline fetched and cached play off-screen.
What he sees instead is seven lines of transcript with one lit in cyan.

Two facts from his record frame the round. Every one of the 83 times a
briefing was opened, per the server log, came from the Mac itself (75 on 7 Sep,
the build's live test, and 8 on 11 Sep); none came from the addresses his
phone uses. And the one briefing he kept (filed 9 Sep) can no longer be
played: the screen reads a briefing from its Inbox record, the Inbox keeps
only its 400 newest resolved records, and the oldest one left is from 13 Sep.
The empty screen therefore tells him "No briefings yet". The page itself
survives in his vault, in `Wiki/Inbox` as `type: raw`, although the Keep
control promises `Wiki/Sources`.

### Clutter numbers, as it stands (checklist §3)

| Test | Briefing today (Nova glass, 390×844) | Target |
| --- | --- | --- |
| Focal point | Before play: the title card, with the same title printed above it. While playing: none on screen; the glass is visible for 2 of 31 beats, so the lit transcript line becomes the focus by default | One, above the fold |
| Objects above the fold | Empty 14. Before play 14 (three of them under the bar). Playing 11, none of them the glass. Hand counts from the frames; the fold is the tab bar's top at 776 | Lower, or a reason |
| Verbs | Playing: Pause, Restart, a transcript line (tap to play from it, hinted only by a tooltip), Listen and Read, Keep and Close (both under the bar). Skip, back, again and "explain that again": voice only. At the end: Play again | One primary, one quiet, talk back |
| Type sizes | Empty 10. Before play 6. Playing 9. Read 11. Working 6. Error 3. Mac 10. The glass hand-rolls 7.5, 8, 8.5 and 9 pt mono labels, under the 11 pt floor | ≤ 3 (4 with numerals) |
| Tap floor | Before play: 36 controls, 9 under 44 (chips 34, Play 34, five one-line transcript rows 38), 0 under 28. Read: 35 of 36 under 44; a one-line source link measures 20 pt. Restart and Listen from here 32 | ≥ 28; primary ≥ 44 |
| Gestures | None of its own. The edge swipe goes back through history, which a briefing opened from the Inbox card never joins (finding 9) | Every capability has a pixel |
| Motion | Entrance: `popIn` on the hero card only. Exit: none, a card is replaced. Interruptible: nothing to interrupt. Reduced motion: `popIn` finishes at once with no cross-fade, while the transcript's smooth scroll still glides on every beat | All four |
| States | Loading: one 14 pt line, no skeleton. Empty: honest copy and router-tested starters, but "No briefings yet" is untrue for him (finding 7). Offline: no branch; an open without a connection returns silently. Error: the server's own string and Back, no Try again | All four designed |
| Width | `scrollWidth` 390 at 390 in all six states measured; at 1280, `main` 1,042, no overflow | 390 |
| Page height | Empty 1.0 screen. Listen 3.8 (3,209 px). Read 13.9 (11,716 px, from a fixture lighter than his real 25 KB page). Working 1.0 | ≤ 2 before a page |
| Idioms | No idiom branch beyond the title's tracking (`Briefing.jsx:332`). Under `summary` it renders the pre-redesign objects; `cupertino` and `command` not photographed separately | Both checked |
| Use | 83 opens in the server log, all from the Mac; 0 from his phone. Playable briefings today: 0. Kept as a page: 1 | |

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 · On the phone the glass plays where he cannot see it
`Briefing.jsx:241-253` (the stage pane, sticky only on the Mac:
`mob ? '' : 'position:sticky;top:12px'`), `:352-357` (on the phone the stage
stacks above the transcript in one column), `:115-119` (each new beat scrolls
the transcript's current line to the centre with `scrollIntoView`).
Frames: playing at beat 13 of 31; the beat-by-beat pass over all 31.

Every beat moves the page so the spoken line sits mid-screen. The stage is
above the transcript, so it goes up with everything else: half visible at
beat 2, gone from beat 3. The two images in the fixture (beats 9 and 20, the
same count his real briefing had) were drawn on the glass while the glass was
600 and 1,400 pt above the screen. The floating bar and the transcript's cyan
highlight both work; the half of the briefing that was the reason it exists,
the picture arriving with the sentence, does not happen on his phone. Read
the other way: this is the same failure Practice's lamps had, and the Running
Glass had on 9 Sep, a feature built, shipped and running, and drawn where he
is not looking (memory `nova-running-glass`, trap 4).

| Before | Why | Severity |
| --- | --- | --- |
| The glass is on screen for 2 of 31 beats at 390; from beat 3 it sits above the screen while the transcript centres the spoken line | `layout.md › Best practices`: "Make essential information easy to find by giving it sufficient space. People want to view the most important information right away, so don't obscure it by crowding it with nonessential details." `layout.md › Visual hierarchy`: "place the most important items near the top and leading side". Critical because the visual half of the page is unusable at phone size. | Critical |

### 2 · The head sits under the bar, so Close taps Settings
`Briefing.jsx:324` (the ready view's own padding, `14px 16px 110px`),
`:186`, `:191`, `:217` (loading, working and error: `40px`, `26px`, `26px` at
the top); `src/vals/valsChrome.js:70` (the house mobile wrap,
`calc(48px + env(safe-area-inset-top))`, which only the empty state uses,
`Briefing.jsx:137`).

The floating bar (`.nv-liquid`, fixed, z 70) covers the top 48 pt. The head
row sits at 10 to 54. At the centre of Close the topmost element is the bar's
Settings button; at its left edge, the bar's Ask; 6 pt of it (48 to 54) is
outside the bar. Keep in vault (87, 14, 112×34) sits under the wordmark, and
the "Briefing" label is drawn through it. The working and error states lose
their label ("Briefing · in progress", "did not finish") the same way, so the
error reads as one stray sentence. On his phone the safe area moves the bar
down by about 59 pt and the head by nothing, so it cannot be better there
(reasoned, not seen).

| Before | Why | Severity |
| --- | --- | --- |
| Close and Keep in vault drawn under the bar; a tap on Close opens Settings or Ask | `layout.md › Guides and safe areas`: "A safe area defines the area within a view that isn’t covered by a toolbar, tab bar, or other views a window might provide." and "safe areas can also help you account for interactive components like bars". A control that does something else when tapped is a convention broken in a way that confuses. | Critical |

### 3 · Skip, back and "explain that again" exist only by voice
`App.jsx:5078-5129` (`tryBriefingVoice`: pause, resume, restart, next part,
back a part, again, close, explain), `src/briefingVoice.js:16-32`;
`Briefing.jsx:227-239` (the on-screen controls: Play or Pause or Resume,
Restart, a counter), `:262` (a transcript line plays from itself; its only
hint is `title="Play from here"`, which a phone never shows), `:288` (Read's
"▶ Listen from here", 32 pt).

The plan built "skip a section" and "explain that again" (BRIEFING-PLAN
phase D) as words he says. On the screen there is no next part and no
previous part; the only ways to move are to scroll the transcript and tap a
line, or switch to Read and tap a heading's 32 pt link. "Explain that again"
works only while the briefing is open or was playing in the last ten minutes
(`App.jsx:5082-5085`), and only for the phrasings the parser knows; anything
else continues to the ordinary front door (`briefingVoice.js:10-12`). His
voice path on the iPhone has the history memory `nova-voice-turn` records, so
a capability that has no pixel is, for him, a capability with a fragile door.

| Before | Why | Severity |
| --- | --- | --- |
| No on-screen skip, back or ask; the transcript's tap target is hinted by a tooltip only | `accessibility.md › Cognitive`: "Let people control audio and video playback... Make sure these controls are discoverable and easy to act upon". `playing-audio.md › Best practices`: "Consider creating custom audio player controls only if you need to offer commands that the system doesn’t support. For example, you might want to define custom increments for skipping forward or backward". Checklist §3: every capability has a pixel he can tap. | High |

### 4 · When it ends there is one verb, and keeping it has no Undo where it happens
`valsBriefing.js:115-119` (`atEnd` turns Play into "Play again");
`Briefing.jsx:330` (Keep in vault, at the top); `App.jsx:5226-5232`
(`fileBriefing` approves the record and shows a toast, "Kept", with no Undo);
`server/lib/inbox.js:1002-1004` (the note filer does return undo data, so
Undo exists, in the Inbox's History).
Frame: the end, beat 31 of 31.

At the moment he finishes, the screen holds the transcript, "Play again" and
a counter. Keeping it means scrolling to the top and tapping a chip under the
bar. Asking about the briefing as a whole has no door at all. The last line
sits 30 pt behind the floating bar even at maximum scroll.

| Before | Why | Severity |
| --- | --- | --- |
| At the end: Play again only; Keep under the bar at the top; its Undo one screen away, in the Inbox | `generative-ai.md › Outputs`: "surfacing controls like Edit, Undo, Retry, or Adjust near generated content preserves people’s agency while still letting them benefit from automation." NOVA-METHOD §2b rule 8: a light tick or cross, and otherwise he talks. | High |

### 5 · Every sentence gets a card, so the cards stop meaning anything
`server/lib/briefing.js:365-378` (`visualFor`: a defined term if the beat
names one, otherwise the part's heading, "so the stage is never blank");
`valsBriefing.js:47-49` and `Briefing.jsx:246-249` (the rail: the previous
visuals, no de-duplication); `briefing.js:133-136` (the compose prompt asks for
image and clip hints only).
Frames: an image beat and a term beat (the stage scrolled back into view by
hand); the Mac.

In the fixture 19 of 31 beats show a heading card, and the heading is already
the label over the transcript one inch below. The rail showed the same
"Part 2 of 6" card twice; on the Mac, three of its four cards. His rule of
1 Oct reads: "A plain sentence gets no panel." The plan also promised a third
kind, "Card: the existing metric / bars / list glass cards, for a number or a
comparison" (BRIEFING-PLAN §4), which never reached the Briefing: a figure in a
briefing is spoken and never drawn, though rule 7 says a number gets a form.
The comparison his briefings are told to make ("where his own sources disagree
with the literature, say so by name") is exactly the "two things compared"
his panel rule is for.

| Before | Why | Severity |
| --- | --- | --- |
| A heading card on every plain sentence; the rail repeats it; figures and comparisons get no card | NOVA-METHOD §2b, when a glass panel appears: "A plain sentence gets no panel." `motion.md › Best practices`: "Add motion purposefully, supporting the experience without overshadowing it. Don’t add motion for the sake of adding motion." The trade between "never blank" (7 Sep) and "only when there is something to point at" (1 Oct) is his to make; Your calls 2. | High |

### 6 · Under Nova glass it still wears the old clothes
`Briefing.jsx:37` (eyebrows, 600 7.5 and 8.5 pt mono, .22em), `:44` (8.5 pt),
`:72` and `:97` (credits, 8 pt), `:235` (the counter, 8.5 pt mono), `:314`
(source numbers, 9 pt mono); `:28`, `:143`, `:301` (gold); `:332` (the only
idiom branch).

NOVA-METHOD §2b rule 2 names this exact object: "never a hand-rolled
`font: 600 8.5px mono; letter-spacing: .14em` chip again". The screen has six
of them, all below the HIG floor. Type sizes run from 6 to 11 per state. Gold
marks "Ask for one." on the empty screen, every term card and every glossary
tag, while gold in Nova means "not yet decided" (rule 8). Cyan marks the
current line, the progress rule, the active segment, Play, the title card,
every heading card and every source link. Jade, Nova speaking since 4 Oct,
appears nowhere, though Nova is speaking for the whole of Listen. Train, Fuel
and Inbox have Summary pages; this one opens on uppercase eyebrows and the
pre-redesign pane.

| Before | Why | Severity |
| --- | --- | --- |
| Six labels at 7.5 to 9 pt | `typography.md › Ensuring legibility`: iOS default 17 pt, "Minimum size 11 pt". `accessibility.md › Vision`: the same table. | Critical |
| Gold for terms and an invitation; cyan for nine roles; no jade while Nova speaks | `color.md › Best practices`: "Avoid using the same color to mean different things." NOVA-METHOD §2b rule 8; the 4 Oct speaking colour. | High |
| 6 to 11 type sizes a state, no Summary page | `typography.md › Conveying hierarchy`: "Adjust font weight, size, and color as needed to emphasize important information". Checklist §3: ≤ 3. | High |

### 7 · What he kept cannot be played, and is not where the screen says
`server/routes/briefing.js:5-7` and `:13-21` (the playable briefing is read
from its Inbox record); `server/lib/inboxStore.js:19-20` and `:102-106` (only
the 400 newest resolved records are kept); `Briefing.jsx:171` and
`valsBriefing.js:66-79` ("Already made" reads the same records);
`Briefing.jsx:330` (Keep's tooltip: "Files it to Wiki/Sources so every agent
can read it"); `server/lib/briefing.js:203-204` and :343 (the comment says
Wiki/Sources, the record's route is `note`); `server/lib/inbox.js:986-998`
(the note filer writes `Wiki/Inbox/<title>.md`, `type: raw`).

His Inbox today holds 421 records, none of kind `briefing`; the oldest
resolved record left is from 13 Sep. The briefing he kept on 9 Sep is a page
in his vault (one file carries the briefing's own marker; it was read for its
folder, type, date and size only) and nothing in Nova can play it: its beats,
visuals and resume point went with the record. So the empty screen's
"No briefings yet, the first one you ask for lands here" is untrue for him.
The page sits in `Wiki/Inbox` as `type: raw`, where the Library (which reads
`Wiki/Sources`) does not look, and the words that sent it there said
Sources. Prior art: the plan (§6) and the server comment both intended
Sources; the code chose `note`.

| Before | Why | Severity |
| --- | --- | --- |
| A kept briefing stops being playable once 400 newer records resolve; the empty screen then says none exist | NOVA-METHOD: "Honest degradation, never fiction." `feedback.md › Best practices`: "Show people when a command can’t be carried out and help them understand why." Your calls 4. | High |
| Keep promises Wiki/Sources and files to Wiki/Inbox as raw | NOVA-METHOD: "Shared formats are contracts". Judgment: the promise and the destination must agree; which one changes is Your calls 3. | High |

### 8 · The first screen says the title twice and puts Play last
`Briefing.jsx:332` (the title, 26 pt serif), `:243-245` (before play the
stage shows a title card with the same title, also 26 pt serif), `:333`
("You asked", three lines at 390), `:339-343` (Listen and Read),
`:369-373` (Play, in the floating bar at the foot).

Before he presses anything: 14 objects, the title twice, the request quoted,
a segmented choice, the title card, the transcript's first two lines, and Play
at the bottom in a 34 pt chip.

| Before | Why | Severity |
| --- | --- | --- |
| Title ×2, request, toggle and transcript ahead of Play | `writing.md › Best practices`: "Consider each screen’s purpose. Pay attention to the order of elements on a screen, and put the most important information first." `buttons.md › Style`: "use a button that has a prominent visual style for the most likely action in a view." | Medium |

### 9 · Close always goes to the Inbox, and Back skips it
`App.jsx:5178-5181` (`closeBriefing` pauses and navigates to the Inbox);
`App.jsx:5140` (`openBriefing` sets the screen directly, without `navigate()`,
so no history entry and no `#/briefing` in the address); the doors:
`valsInbox.js:512` and `Inbox.jsx:485` (the card), `server/lib/push.js:258`
(the notification's deep link), `App.jsx:8537` (the resume offer),
`src/indexGroups.js:14` (the Index row, Nova group).

From the Inbox card the address stays `#/inbox`, so the edge swipe's
`history.back()` lands on whatever came before the Inbox and a reload brings
back the Inbox rather than the briefing. From a notification or the Index,
Close still lands in the Inbox. Read in source; not exercised, because demo
mode cannot open a briefing.

| Before | Why | Severity |
| --- | --- | --- |
| Close goes to one place whatever the door; the Inbox door leaves no history | `designing-for-ios.md › Best practices`: "it’s especially important let people swipe to navigate back". Judgment, apple-design wayfinding: every screen answers "how do I get out?" with where he came from. | Medium |

### 10 · The waits and the failure are text on a void
`Briefing.jsx:185-187` (loading), `:189-212` (working), `:215-222` (error);
`valsBriefing.js:80-86`; `server/lib/inbox.js:1591-1598` and
`valsInbox.js:453` (the Inbox can retry an errored briefing, re-running his
sentence exactly as first asked).

Loading is one 14 pt line at 40 pt, at the bar's lower edge, with no
skeleton. Working is the best-written state on the page ("Researching 5
angles at once, 2 back so far", the angles ticking off) and has no form and
no controls; the work Nova is doing in parallel, the thing his Iron Man bar
wanted to see, is a list. Error is the server's own sentence, in lower case
and internal words, with Back (which goes to the Inbox), and no Try again
although one exists one screen away.

| Before | Why | Severity |
| --- | --- | --- |
| Error: the raw server string and Back; no Try again | `generative-ai.md › Outputs`: "If something goes wrong, describe what happened in plain language and offer a clear next step." `writing.md › Best practices`: "Write clear error messages... be clear about what someone can do to fix it." | Medium |
| Loading: one line, no skeleton; working: a list with no form | `loading.md › Best practices`: "Show something as soon as possible... consider showing placeholder text, graphics, or animations as content loads". NOVA-METHOD §2b rule 7. | Medium |

### 11 · The Mac: a 420 pt stage beside a 538 pt transcript, the title cut in half
Measured at 1280×800 playing beat 13: the stage column is 420 pt and sticky,
its hero a heading card 420×90 in an 800 pt window; the transcript is 538 pt
in its own scroller; `scrollIntoView` also scrolled `main` by 87.5 pt, so the
title sits at -25 to 13, half off the top. The sidebar has no Briefing row
(Practice has one), so on the Mac it is reached from the Inbox card or a
notification only.

| Before | Why | Severity |
| --- | --- | --- |
| The stage at a third of the width; the page jumps under the head; no sidebar door | `designing-for-macos.md › Best practices`: "Leverage large displays to present more content in fewer nested levels and with less need for modality". | Medium |

### 12 · Smaller things seen
- **Reduced motion has no cross-fade.** The global rule ends every animation
  at once (`index.css:2592-2596`), so a card swaps instantly, while the JS
  smooth scroll ignores the setting and glides on every beat
  (`Briefing.jsx:118`). `accessibility.md › Cognitive`: "Replacing
  transitions in x-, y-, and z-axes with fades to avoid motion". Low.
- **The progress rule animates `width`** (`Briefing.jsx:348`), a layout
  property, where the house animates transform and opacity. Low.
- **Tooltips a phone never shows carry real information**: "Play from here"
  (`:262`), "Files it to Wiki/Sources" (`:330`), the starter chips' hint
  (`:150`). Low.
- **Shipped copy joins clauses with a dash** in five places:
  `Briefing.jsx:150`, `:171`, `:342`, `valsBriefing.js:83`, `App.jsx:5230`.
  Low.
- **Two vocabularies for one glass**, as the inventory said: Briefing's
  `Glass` has five kinds (title, term, heading, image, clip) and `StageCard`
  thirteen (`StageCard.jsx:34`); `clip` is `media` there, `term` is close to
  `key`, and `title` and `heading` have no counterpart. The Briefing still
  arrives with `popIn` while the house glass arrives and recedes with
  `nvGlassArrive` and `nvGlassRecede` (`index.css:151-161`, 25 Sep). Low,
  structural; every direction below removes it.
- **Demo mode is honest by accident.** `valsBriefing.js` never reads
  `demoMode`; in demo `openBriefing` returns at once for want of a
  connection (`App.jsx:5137-5138`), so only the empty state can render.
  Confirmed; not a finding.

---

## 3 · Keep

- **One artefact, two ways in.** The prose he reads and the beats Nova says
  are written in one pass from the same findings, so they cannot drift, and
  neither is a copy of the other (`server/lib/briefing.js:22-25`).
- **The honest clock.** A beat's visual lands at the instant its audio starts
  (the TTS queue's `onPlay`); no invented word timing (BRIEFING-PLAN,
  "Deliberately not doing"). Every direction keeps per-sentence sync and paces
  the words inside a sentence the way `subtitlePace.js` already does.
- **A window of three beats in flight**, so pause is instant and a long
  briefing is not thirty parallel voice fetches (`App.jsx:5182-5217`).
- **Resume where he left off**, per briefing (`App.jsx:5141-5152`).
- **"Explain that again"**: the exact sentence and its part handed to Nova as
  a grounded question, and "Shall I carry on with the briefing?" offered after
  the answer has been spoken (`App.jsx:5112-5124`, `:6287-6294`). It needs a
  button too (finding 3); the mechanism is right.
- **A term defined at the moment he hears it**, his "define the terminology"
  made literal (`briefing.js:370-374`).
- **Media cached before "ready"**, served from Nova's origin, and the
  typographic fallback when an image is missing; a clip paused until he taps
  it, never two voices at once.
- **The missing angle said aloud** ("One angle could not be researched and is
  missing from this report").
- **Specific copy while it is made** ("Researching 5 angles at once, 2 back
  so far"), `generative-ai.md › Outputs`: "Consider giving specific,
  reassuring feedback during generation."
- **The starters are the router's own phrasings**, tested
  (`server/test/briefingEmpty.test.js`), and they place the words in the
  composer without sending anything.
- **It never plays on arrival**: he said "I can choose when I am ready to
  view it".
- **The compose pass reads his vault and never the web**; every outside fact
  was citation-gated upstream by the Researcher.

---

## 4 · Directions for the mockup round

Mockup: `design/mockups/77-redesign-briefing.html`, the three below switched
at the top, each as phone frames at 390×844 with live motion: the report
playing, pause and skip, and what he can do afterwards. All three keep every
function in the checklist's Briefing rows (B1 to B7) and take these fixes with
them: the page clears the bar; every control is 44 pt; four type sizes a view
at most and no mono micro-labels; jade only while Nova speaks; terms in ink
with "in plain words", not gold; the Researcher's blue on what the Researcher
found, named in words; skip, back and Ask as buttons as well as words; Keep
as a light tick with Undo on the same card, a cross to let it go, and Ask to
talk about it; Close returns to where he came from; an error says what failed
and offers Try again.

**A · Nova presents.** The briefing plays in Nova's own full screen, the stage
he chose on 3 and 4 Oct: the core at centre when he is simply speaking,
travelling to the presenter's spot when there is something to show; the
words pouring from his heart into the plate in the serif, the word in the air
underlined in jade; a panel rising out of the core only for a beat with a
picture, a clip, a term, a figure or his sources set against the trials. The
parts become a chapter rail with the part's name; beneath it ⏮ part, play or
pause, part ⏭, Script (the transcript, a line tapped plays from there) and Ask
(he talks, the answer lands on the same stage, then "carry on"). The end is
one card: ✓ Keep it, ✕ Let it go, Ask about it, with Play again and Read
quiet. Removes the head block (label, the title twice, the request, the
toggle, the progress rule), the rail of small cards, the heading cards and the
floating bar; moves the transcript into the Script sheet, Read to the top
right, the title and the request into the opening moment. Numbers: glass on
screen 2 of 31 beats → 31 of 31; objects above the fold 14 → 10 (11 with a
panel); type sizes 6 to 9 → 4 with numerals; smallest control 20 → 44 pt;
the Listen view 3.8 screens → 1; verbs at the end 1 → 3, plus 2 quiet. On the
Mac: the stage centred at 720 pt with the Script as a side panel.

**B · The living page.** Listen and Read become one page in the Summary
grammar: the large title, the summary as the serif news line, the parts each
with their own ▶, and Nova pinned in a player above the tab bar: his core, the
sentence he is saying as a one-line subtitle, play or pause. When a beat has
something to show, the player grows upward into a glass card for that
sentence and folds back after it. The part being spoken is lit in the page.
The end of the page carries the terms, the sources and the decision card,
with a composer for asking about it. Removes the toggle, the separate
transcript, the title twice, the rail and the heading cards; moves the stage
into the pinned player, which cannot scroll away. Numbers: glass on screen
2 of 31 → 31 of 31; objects above the fold 14 → 9; type sizes → 4 (34, 22,
17, 13); controls 44 pt; the page stays a document (about 14 screens of
reading) by design. On the Mac: the document at 680 pt with the player as a
floating glass card beside it.

**C · Boards.** Each part is a glass board: its name in the serif, the things
it will show laid on it as tiles, and Nova's core small in its corner. As he
speaks, the tile for that sentence comes forward and lights while the others
dim; a part with nothing to show is a board that is mostly Nova. Finished
boards recede into a stack at the top; skip is a swipe or a tap on the
part's dot. At the end the stack fans out into every board at once (the
fanned reveal he asked to be reminded of), each tappable to replay its part,
with ✓ Keep it, ✕ Let it go and Ask about it. Numbers: glass on screen 2 of 31
→ 31 of 31; objects above the fold 14 → 10, most of them pictures;
type sizes → 3 with numerals; controls 44 pt; skip by voice only → swipe,
a dot or voice. On the Mac: three boards in a row, the current one
forward.

**D · What the pixels argue for.** A page whose reason to exist plays off
the top of his screen for 29 of 31 sentences, under a head he cannot tap. The
structural fix is A's: the briefing becomes one long turn of Nova's on the
stage he already chose, so the Briefing stops owning a second glass
vocabulary and inherits every improvement the full screen gets. B is the
answer if he mostly reads; C if seeing the shape of the whole briefing at once
matters more. They combine: A's stage with B's page as the Read view is a
coherent blend, and C's fan can be A's end card.

---

## 5 · Method

**Snapshot and server.** A detached worktree of `56928b0` at
`$SCRATCH/view-briefing` with `node_modules` linked, Vite on 5207, opened in
the chrome-devtools MCP in an isolated context `briefing`, the viewport
emulated before a guarded navigation (`390x844x3,mobile,touch`, later
`1280x800x1`, then 390 again). His look was set in the `initScript`:
`novaos.style=summary`, `novaos.theme=command`, `novaos.material=glass`,
`novaos.core=hologram`, no connection. The guard refused every non-GET
`fetch`, XHR and beacon; `window.__blocked` stayed empty in every guarded
document. The page showed "Demo data" in the bar and the toast.

**A guard gap, recorded.** Re-emulating to 1280 reloaded the page without the
guard, and my navigation to the same hash URL stayed inside that document, so
`window.__guard` read false. I stopped before setting any state; the network
log for that document holds only GET requests to the local Vite origin (the
page and its icon), and demo mode has no connection to send anything to. A
guarded reload followed and was confirmed before any further step.

**What demo shows, and the fixture.** In demo the Briefing can only render its
empty state: `openBriefing` returns at once without a connection. Every other
state was set through `window.__novaApp.setState` (the dev-only handle) from
an invented fixture at the scale BRIEFING-PLAN records for his real briefing:
6 parts, 30 beats plus the summary, 25 terms, 26 sources, 2 images, with the
server's own visual pattern (the title card for the summary, a term card where
a beat names a term, two images, a heading card otherwise). Playback was
simulated by setting `briefingPlay.current`, the field the voice clock sets;
no action method was called (no `playBriefing`, `openBriefing`,
`fileBriefing`), so no request was attempted, nothing was spoken and no model
was asked anything. None of the fixture's words exist in the app or the
vault.

**Frames read.** At 390: empty; ready before play; playing at beat 13 with the
transcript centred; the stage at an image beat and at a term beat, scrolled
back into view by hand; Read; the end at beat 31; working (5 angles, 2 back);
error. At 1280: playing. Loading was measured, not photographed. Stills stayed
in the session (audit convention).

**Measurements.** A computed-style sweep per state over `main`: distinct font
sizes of every visible element with its own text; every `button`, link,
`[role=button]` and pointer target, outermost only, with its box (the smaller
side against 44 and 28); `scrollHeight` over 844; `scrollWidth` of `main` and
the document. `elementFromPoint` at three points across each head control. A
beat-by-beat pass over all 31 beats (850 ms each for the smooth scroll to
settle) recording the fraction of the hero card visible between the bar's
foot (48) and the floating bar's top (704). Objects above the fold are hand
counts from the frames, labelled as such.

**His use, read from the record.** Counts, kinds and dates only, nothing of his
words: `server/data/inbox.json` (421 records, 0 of kind `briefing`; the
oldest resolved record left, 13 Sep); his vault (one page carrying the
briefing marker, read for its folder, `type`, `created` date, heading count
and size only: `Wiki/Inbox`, `raw`, 9 Sep, 9 headings, about 25 KB);
`~/Library/Logs/nova-os-server.log` (every `GET /api/briefing/<id>` by date
and client: 83, all from 127.0.0.1; 9 media fetches, all 127.0.0.1; the
tailnet addresses his phone uses made 7,270 other requests between 7 and
11 Sep and none to the Briefing); `server/data/briefing-media` (four files,
two images from 7 Sep, an image and a clip lookup from 9 Sep).

**What was not seen.** A real briefing played (none that can open exists);
real voice timing; a clip on the stage (the plan records that none has been
produced); the notification's tap on his phone; the `cupertino` and `command`
idioms as separate frames; offline; the iOS safe area (the emulation has
none); the Inbox card as a door (demo has no records); "explain that again"
live; the working state's four-second poll against a live job; Back and
reload after an Inbox-door open (read in source).

**Inventory notes, confirmed or corrected.**
- `openBriefing` returns silently without a connection: confirmed
  (`App.jsx:5137-5138`).
- `valsBriefing.js` never reads `demoMode`: confirmed; harmless today, since
  demo can only render the empty state.
- Two vocabularies, `Glass` and `StageCard`: confirmed, five kinds against
  thirteen.
- The doors: the inventory's four (Inbox card, voice, resume offer, deep link)
  plus a fifth it did not list, the Index row in the Nova group
  (`src/indexGroups.js:14`, hue `--nv-ink40`). Still no dock row and no Mac
  sidebar row.
- `reel.js` belongs to the Repertoire's spin reveal, as the inventory said; not
  re-checked.
- Line numbers in `App.jsx` have moved since the inventory (the deep link
  `4395-4411` → `5051-5072`, `openBriefing` `4480-4519` → `5136-5157`, the
  resume accept `7678` → `8537`).
- HIG pages opened: `accessibility.md`, `layout.md`, `typography.md`,
  `color.md`, `designing-for-ios.md`, `designing-for-macos.md`,
  `playing-audio.md`, `generative-ai.md`, `feedback.md`, `motion.md`,
  `loading.md`, `writing.md`, `buttons.md`, `undo-and-redo.md`; all but
  `undo-and-redo.md` are cited above.
