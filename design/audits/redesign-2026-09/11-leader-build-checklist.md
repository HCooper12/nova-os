# 11 · Leader · build checklist, Blend 1 ("Now, then the rest")

The acceptance contract for building `design/mockups/82-redesign-leader-r2.html`
Blend 1, his pick on 9 Oct 2026: "Go with blend 1. Unread replies from the
leader should jump to the top. The advice for the day should be considered to
be most important because it is a concept that I would ideally be looking at
implementing that day. It should be the first thing at the top in the morning
and then it should also appear at the top within the last hour before starting
my work block and during my work block. All other times it can revert to an
open question or whatever else is important at the top. I like that blend one
gives the option of seeing everything else as a row at a glance that can be
expanded and focussed on."

One line per element, state, motion and copy line Blend 1 draws (frames x1,
x2, x3, the ladder card and its code), plus what it inherits from round 1
(mockup 76: A2's stage, the authored reply, the consulted agents) and his three
rules. Review furniture (the blend switch, the counts, Your calls) is outside
the count. Blend 2, A and C are not Blend 1 and are not listed.

Status: `PRESENT` / `DIFFERS` (built, not exactly as drawn, with why) /
`MISSING`, with the frame that proves it, filled in after the build is
photographed in demo mode (frames under the session scratchpad,
`leader-build/`, build `b-*` beside mockup `m-*`).

## 1 · His three rules (the order, in code: `src/leaderOrder.js`)

| # | Rule | Status |
| --- | --- | --- |
| H1 | An unread Leader reply is first, before everything, even in the morning || PRESENT · b-11-reply-first; table test |
| H2 | Today's idea is first in the morning (until his first work block today, or until 12:00 when no block is known), in the hour before a work block, and during one || PRESENT · b-01-morning, seq-s; table test (morning, hour before, during, night shift) |
| H3 | Other times: the open question (the Leader's follow-up) first; then the round-up; then the idea; then receipts, newest first; the conversation always last || PRESENT · b-02-rerank-8, b-04-roundup-card; table test |
| H4 | When no work block is known today, the reason line says so ("no work block on your calendar today, so until 12:00") || PRESENT · table test (frames ran with a block known) |
| H5 | The rule runs on every open, after every write, and as the clock crosses a boundary (re-read each minute); a model never decides it || PRESENT · seq-r, seq-s (a calendar change re-ran it); 20 s clock in code |
| H6 | The round-up is held while a question waits, and needs three quiet days and something open || PRESENT · table test; b-01 holds it while the question waits |

## 2 · The page at rest (x1 at 07:10)

| # | Element | Status |
| --- | --- | --- |
| P1 | Nav row: Back "Index" (44 pt), the menu button "⋯" (44 pt) || PRESENT · b-01 |
| P2 | Head: the Leader's face (40), "Leader" 15 semibold, the day and time under it ("Monday 07:10") || PRESENT · b-01 (the real clock, "Friday 08:24") |
| P3 | The strip, a glass card button: "N open" with a bead each, "N working" filled beads, "N set down" tied beads or a dashed "Set down" placeholder || PRESENT · b-01, a12 |
| P4 | The bead the Leader is asking about is lit magenta with a glow || PRESENT · b-01 |
| P5 | The strip's label for VoiceOver says the counts and "Open it" || PRESENT · code (aria-label from the counts) |
| P6 | The honest line under the strip, in the Leader's voice: "You last told me anything 9 days ago." || PRESENT · b-01 |
| P7 | The reason line: a live magenta dot, "Now" in magenta, then why ("it is morning, before your 09:00") || PRESENT · b-01 |
| P8 | One focused card, lit (magenta edge, top sheen, bloom), min-height 224 so the glass holds still || PRESENT · b-01 |
| P9 | "Then" label over the rows || PRESENT · b-01 |
| P10 | The rest as rows (56 pt): a glyph that carries the item's form, a 15 semibold title, a 13 sub line, a chevron || PRESENT · b-01 |
| P11 | Row glyphs: the question's orb, the idea's serif quote mark, a tied bead for a receipt (with Undo instead of a chevron), the Leader's face for the conversation || PRESENT · b-01, a12, b-11 |
| P12 | One composer at the thumb: mic (magenta) 44, the field "Talk to the Leader", send 44 in magenta, dim until there is text || PRESENT · b-01 |
| P13 | Every control 44 pt or more; nothing scrolls sideways at 375 or 390 || PRESENT · measured: 0 controls under 44, scrollWidth 390/390 and 375/375, stage 0 overflow |

## 3 · What the card holds

| # | Element | Status |
| --- | --- | --- |
| C1 | Idea: "Try today · 07:00" (its kind and the time it landed), the title in the serif at 20, the line at 15 || PRESENT · b-01 |
| C2 | Idea: "Why this" opens the reason and "From" its sources in place; "Talk about it" || PRESENT · b-01 (verbs); why opens in place in code |
| C3 | Question: the Leader's orb, "The Leader asks · since Friday" (magenta), the question at 17 || PRESENT · b-02-rerank-8 |
| C4 | Question: "About <name>, open 13 days. Answer below, typed or spoken." || DIFFERS · b-02-rerank-8: the name is his own opening words ("Two leads disagree about the new…"), see §11 |
| C5 | Question first: the composer lights (magenta ring, glow, mic tinted) and says "Answer the Leader"; mic label "Speak your answer" || PRESENT · b-02-rerank-8 |
| C6 | The orb ripples when the question comes first || PRESENT · code (rip on arrival); not caught in a still |
| C7 | Answered: the Leader's byline (face, "Leader", "you answered · 12:41"), its line in the serif, then the receipt || PRESENT · b-03-answered |
| C8 | The receipt: "Set down · <name>" with Undo; "Added to what works · <name>" || PRESENT · b-03-answered |
| C9 | Round-up: "The picture · 5 days without word", the serif line "Six things are open. Shall we go through them, oldest first?", one bead per open thing lighting in turn || PRESENT · b-04-roundup-card |
| C10 | Round-up verbs: "Go through them" (the one magenta primary), "Not today" (quiet) || PRESENT · b-04-roundup-card |

## 4 · Motion

| # | Motion | Status |
| --- | --- | --- |
| M1 | Entrance: each part rises in turn, the card arrives as a material (blur resolving); the strip's beads pop in one by one || PRESENT · code (WAAPI rise and blur, beads pop); not filmed |
| M2 | The order changes: the promoted row lifts into the card and fades, the card's content blurs out and the new one in, the demoted item comes down into the rows, the rest slide to their places || PRESENT · seq-r, seq-s (8+ frames each) |
| M3 | The time and the reason line cross-fade as the order turns || PRESENT · seq-r frames 1 to 4 |
| M4 | Answering: the card cross-fades to the Leader's reply, its line said word by word || PRESENT · b-03-answered (word by word in code) |
| M5 | The honest line rewrites itself: "You told me something just now." || PRESENT · fixed after m-03b/a12 pair: "just now" within ten minutes |
| M6 | Set down: the lit bead lifts in an arc and lands in the set-down place, the counts turn, a new working bead pops in || PRESENT · seq-e frames 2 to 3 (round-up tick); bead flight in code for the answer path |
| M7 | After an answer the rule runs again and the idea comes back up; the receipt with Undo stays as a row || PRESENT · a12 beside m-03b-after |
| M8 | Reduced motion: no travel, no flight; every state cross-fades in 250 ms || PRESENT · code only: every motion has a cross-fade rule under prefers-reduced-motion; not photographed (the MCP cannot emulate it) |

## 5 · The round-up opens in place (x2)

| # | Element | Status |
| --- | --- | --- |
| R1 | "Go through them" replaces the card, the reason line and the rows with C's deck; the honest line says "Oldest first." || DIFFERS · b-05-deck: "Oldest first, one at a time." (the mockup's "About two minutes" is an estimate nothing measures) |
| R2 | The deck: the top card lit, the next two stacked behind (22 and 42 pt down, smaller, dimmer) || PRESENT · b-05-deck (opaque at one height after a fix) |
| R3 | A card: the short name and its age ("13 days"), an age bar, his words at 17, "Said 26 Sep · nothing since" || PRESENT · b-05-deck |
| R4 | A card's verbs: "Set it down" (tick, magenta), "Still open" (cross, quiet), and a "Talk about it" row || PRESENT · b-05-deck |
| R5 | The tally under the deck: a bead per card, the current one lit, "1 of 6" || PRESENT · b-05-deck |
| R6 | The deck deals in (the top three rise in turn), age bars grow from zero || PRESENT · code; deal seen at the start of seq-e |
| R7 | A tick flies the card up into the strip's set-down place; its bead ties off; the counts turn || PRESENT · seq-e frames 1 to 3 |
| R8 | The receipt with Undo stays under the deck: "Set down · <name>" || PRESENT · seq-e frame 3 |
| R9 | A cross flies the card back to its own bead, marked as checked today (a ring with a dot) || PRESENT · code (flies to its own bead, bead marked kp); not filmed |
| R10 | The tally ties or marks the bead and lights the next; the position counts on || PRESENT · seq-e frame 3 ("2 of 7") |
| R11 | The open strip bead for the card on top is lit while it is on top || PRESENT · b-05-deck |

## 6 · Talking about the first thing (x3)

| # | Element | Status |
| --- | --- | --- |
| T1 | "Talk about it" raises the conversation as a sheet over the page (from 98 pt down), grabber on top || PRESENT · b-09-sheet-asking |
| T2 | Sheet head: the Leader's face (28) and "Leader", "Back to Now" (44 pt) || PRESENT · b-09 |
| T3 | The item quoted at the top as a glass card: its title, "Talking about today's idea" || PRESENT · b-09 |
| T4 | The thread above is the whole conversation, kept across reloads; a sliver "15 Sep · the last time you talked" || PRESENT · code and test (kept thread, slivers); b-09 shows the day sliver |
| T5 | His words right-aligned in his bubble at 17 || PRESENT · b-09 |
| T6 | Every reply has a byline: the Leader's face, "Leader" in magenta, a 13 meta ("asking two agents") || PRESENT · b-09, b-10 |
| T7 | While the Leader asks: "Asking the Researcher and the Librarian." and a seat per agent in its own hue, its face's ring turning, a live count of seconds || PRESENT · b-09 (seconds now lead the seat after a 390 fix) |
| T8 | When each is back its seat ticks ("Back · 5 s"); then the seats fold away and the faces join the byline stack ("asked two agents · 38 s") || PRESENT · b-10 (after a fold fix) |
| T9 | The Leader's lead line in the serif at 20, said word by word; the rest at 17 || PRESENT · b-10 |
| T10 | Under the reply a row per agent asked, in its hue: "From the Researcher", what it gave and how long; each opens to its own words || PRESENT · b-10 (the Librarian opened) |
| T11 | One composer at the foot of the sheet, with the mic || PRESENT · b-09, b-10 |
| T12 | Earlier ideas up the thread: each morning's idea is the Leader's message that morning and opens to its why and sources || PRESENT · b-09 (an earlier idea up the thread, opening to why) |
| T13 | New conversation, in the menu || PRESENT · b-12-menu |
| T14 | The sheet goes back by Back to Now, a drag down, the scrim, or the edge swipe || PRESENT · code: Back to Now (data-edge-close), drag on the grabber, scrim, Escape |

## 7 · The picture rises (inherited from A2, named in the blend)

| # | Element | Status |
| --- | --- | --- |
| S1 | A tap on the strip raises the stage over the page; the page behind dims and blurs || PRESENT · b-06-stage |
| S2 | Stage head: "The picture", "since 9 Sep", Done || PRESENT · b-06 |
| S3 | A sentence in the serif written by code: "Seven things open, and nothing new from you for nine days." || PRESENT · b-06 |
| S4 | Each struggle a thread from the day he said it to today, its name above and its age at the end || PRESENT · b-06 |
| S5 | Solid while he has told the Leader about it, dotted through the days without word, under a fog band "9 days without word" || PRESENT · b-06 |
| S6 | The axis of days under the threads (first day, the last word, Today) || PRESENT · b-06 |
| S7 | What works below the line, as bars from the day each was said || PRESENT · b-06 |
| S8 | The thread the Leader is asking about is lit, with the question's orb at its end tied to it || PRESENT · b-06 |
| S9 | The shelf: "Set down · nothing yet", or what was set down with Undo || PRESENT · b-06, b-08-stage-setdown |
| S10 | The note: touch a thread and slide to light another; let go to set it down or talk about it || PRESENT · b-06 |
| S11 | Drawn in: the threads draw from left, the fog and dotted parts arrive, then the works bars grow || PRESENT · code (phased classes); not filmed |
| S12 | Set down from the stage: the thread runs to today, ties off, drops to the shelf, the sentence rewrites || PRESENT · b-07-stage-pick, b-08-stage-setdown (sentence rewrote, shelf with Undo) |
| S13 | Done settles the stage back into the strip || PRESENT · code |

## 8 · Every function the Leader has today (audit §3 Keep, and the map)

| # | Function | Status |
| --- | --- | --- |
| F1 | Today's idea with why and its sources (the card in the morning, a row after) || PRESENT · b-01, b-02 |
| F2 | Earlier ideas (the trail) up the conversation, each opening to its why and sources || PRESENT · b-09 |
| F3 | The Leader's question answered typed or spoken, in one cheap pass; sending again adds to it (Say more) || DIFFERS · b-03: Say more is a verb on the Leader's line back (the drawn composer resets); see §11 |
| F4 | A timeout on the answer says it may still be recording, never that it failed || PRESENT · App.submitSituationAnswer unchanged |
| F5 | The picture: every struggle and win with its age || PRESENT · b-06 (every open thing and win with its age) |
| F6 | Set it down, with Undo where it happened, on the rails (leader-reflect, undoData) || PRESENT · seq-e, b-08; server test |
| F7 | Still open, marked as checked today, on the rails with an undo || PRESENT · server test (checkedAt on the rails, exact undo) |
| F8 | The conversation and New conversation, kept across reloads || PRESENT · server test (thread kept), b-12 |
| F9 | Whom the Leader asked, and their own words; authorship on every reply || PRESENT · b-10 |
| F10 | The research count and the last run, behind the menu || PRESENT · b-12 |
| F11 | The honest line, and the follow-up's restraint (never a second question while one waits; the round-up held the same way) || PRESENT · b-01; table test |
| F12 | The two channels stay apart: the idea is never rewritten by the order, only moved || PRESENT · the rule only orders; nothing rewrites the idea |
| F13 | Code owns the facts: every count from the record, recomputed on read || PRESENT · route test (picture counts from lists) |
| F14 | The Home Leader box keeps working (both faces, the swipe, the answer in place) || PRESENT · guard-cupertino unchanged; LeaderBox untouched but Say more |
| F15 | "Say more" on the Home box is 44 pt (the audit's Critical) || PRESENT · code (44 pt min); demo Home has no box, so not photographed |

## 9 · The seen mark

| # | Element | Status |
| --- | --- | --- |
| N1 | A Leader reply carries a server-side `seenAt`, set once when he opens the page with it on top; one write, idempotent, no model call || PRESENT · server tests (one write, idempotent, 404/400) |
| N2 | Never fires in demo || PRESENT · source test; __blocked empty on b-11 |
| N3 | The reply stays on top for the visit in which it was first seen, so the card does not jump away while he reads || PRESENT · code (visitUnread) |
| N4 | A seen mark is a receipt, not a decision: no Inbox card || PRESENT · server test |

## 10 · States

| # | State | Status |
| --- | --- | --- |
| Z1 | Loading: the page's shape with the strip and card as skeletons, never a blank || PRESENT · code (skeleton); not photographed (demo skips it) |
| Z2 | Demo: says it is demo, never "Connect a backend" || PRESENT · b-00-demo-empty |
| Z3 | No idea yet today: the card says so honestly || PRESENT · code (rule drops the idea; card absent) |
| Z4 | Nothing open: the strip says "Nothing open" and the honest line still reads the record || PRESENT · code ("Nothing open") |
| Z5 | The Leader is answering while he is away: the conversation row says so || PRESENT · code (conversation row "The Leader is answering") |

## 11 · Differences from the drawing, and why

Tally: 99 lines. 96 PRESENT (some proven in code and tests rather than a
still; each of those says so on its line), 3 DIFFERS, 0 MISSING. Frames: the session scratchpad,
`leader-build/` (`b-*` the build, `m-*` the mockup, `seq-*` contact sheets of
the reshuffle `r*`/`s*` and the set-down `e*`).

- **C4 · the short name.** The mockup names each struggle ("Two leads, two
  versions"); nothing in the record holds a short name, and the rule here is
  that no model writes one. Code uses his own opening words, up to six, with
  an ellipsis (`shortName`, tested). A model-written name is his call.
- **R1 · "About two minutes".** Nothing measures how long a round-up takes,
  so the line says "Oldest first, one at a time."
- **F3 · Say more.** x1 resets the composer after his answer; the function
  map keeps "sending again adds to the same answer". So the Leader's line
  back carries a quiet Say more that re-arms the composer to answer.

Also not drawn and built in the house shape: the unread reply's card
(byline with whom it asked, its first sentence in the serif, Read it all),
its row with a magenta dot, and the menu's three entries. Not built: the
Mac's second column (the mockup's one line about the picture standing open
on the right); on the Mac the column holds at 540 pt and the stage rises as
on the phone.

Fixed during the look, each found by a frame: the deck cards were
translucent and a two-line name outgrew the fixed deck; the seats never
folded away after the answer; the Researcher's live seconds were cut off at
390; the demo branches read a `state.demoMode` that does not exist.
