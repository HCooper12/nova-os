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
| H1 | An unread Leader reply is first, before everything, even in the morning | |
| H2 | Today's idea is first in the morning (until his first work block today, or until 12:00 when no block is known), in the hour before a work block, and during one | |
| H3 | Other times: the open question (the Leader's follow-up) first; then the round-up; then the idea; then receipts, newest first; the conversation always last | |
| H4 | When no work block is known today, the reason line says so ("no work block on your calendar today, so until 12:00") | |
| H5 | The rule runs on every open, after every write, and as the clock crosses a boundary (re-read each minute); a model never decides it | |
| H6 | The round-up is held while a question waits, and needs three quiet days and something open | |

## 2 · The page at rest (x1 at 07:10)

| # | Element | Status |
| --- | --- | --- |
| P1 | Nav row: Back "Index" (44 pt), the menu button "⋯" (44 pt) | |
| P2 | Head: the Leader's face (40), "Leader" 15 semibold, the day and time under it ("Monday 07:10") | |
| P3 | The strip, a glass card button: "N open" with a bead each, "N working" filled beads, "N set down" tied beads or a dashed "Set down" placeholder | |
| P4 | The bead the Leader is asking about is lit magenta with a glow | |
| P5 | The strip's label for VoiceOver says the counts and "Open it" | |
| P6 | The honest line under the strip, in the Leader's voice: "You last told me anything 9 days ago." | |
| P7 | The reason line: a live magenta dot, "Now" in magenta, then why ("it is morning, before your 09:00") | |
| P8 | One focused card, lit (magenta edge, top sheen, bloom), min-height 224 so the glass holds still | |
| P9 | "Then" label over the rows | |
| P10 | The rest as rows (56 pt): a glyph that carries the item's form, a 15 semibold title, a 13 sub line, a chevron | |
| P11 | Row glyphs: the question's orb, the idea's serif quote mark, a tied bead for a receipt (with Undo instead of a chevron), the Leader's face for the conversation | |
| P12 | One composer at the thumb: mic (magenta) 44, the field "Talk to the Leader", send 44 in magenta, dim until there is text | |
| P13 | Every control 44 pt or more; nothing scrolls sideways at 375 or 390 | |

## 3 · What the card holds

| # | Element | Status |
| --- | --- | --- |
| C1 | Idea: "Try today · 07:00" (its kind and the time it landed), the title in the serif at 20, the line at 15 | |
| C2 | Idea: "Why this" opens the reason and "From" its sources in place; "Talk about it" | |
| C3 | Question: the Leader's orb, "The Leader asks · since Friday" (magenta), the question at 17 | |
| C4 | Question: "About <name>, open 13 days. Answer below, typed or spoken." | |
| C5 | Question first: the composer lights (magenta ring, glow, mic tinted) and says "Answer the Leader"; mic label "Speak your answer" | |
| C6 | The orb ripples when the question comes first | |
| C7 | Answered: the Leader's byline (face, "Leader", "you answered · 12:41"), its line in the serif, then the receipt | |
| C8 | The receipt: "Set down · <name>" with Undo; "Added to what works · <name>" | |
| C9 | Round-up: "The picture · 5 days without word", the serif line "Six things are open. Shall we go through them, oldest first?", one bead per open thing lighting in turn | |
| C10 | Round-up verbs: "Go through them" (the one magenta primary), "Not today" (quiet) | |

## 4 · Motion

| # | Motion | Status |
| --- | --- | --- |
| M1 | Entrance: each part rises in turn, the card arrives as a material (blur resolving); the strip's beads pop in one by one | |
| M2 | The order changes: the promoted row lifts into the card and fades, the card's content blurs out and the new one in, the demoted item comes down into the rows, the rest slide to their places | |
| M3 | The time and the reason line cross-fade as the order turns | |
| M4 | Answering: the card cross-fades to the Leader's reply, its line said word by word | |
| M5 | The honest line rewrites itself: "You told me something just now." | |
| M6 | Set down: the lit bead lifts in an arc and lands in the set-down place, the counts turn, a new working bead pops in | |
| M7 | After an answer the rule runs again and the idea comes back up; the receipt with Undo stays as a row | |
| M8 | Reduced motion: no travel, no flight; every state cross-fades in 250 ms | |

## 5 · The round-up opens in place (x2)

| # | Element | Status |
| --- | --- | --- |
| R1 | "Go through them" replaces the card, the reason line and the rows with C's deck; the honest line says "Oldest first." | |
| R2 | The deck: the top card lit, the next two stacked behind (22 and 42 pt down, smaller, dimmer) | |
| R3 | A card: the short name and its age ("13 days"), an age bar, his words at 17, "Said 26 Sep · nothing since" | |
| R4 | A card's verbs: "Set it down" (tick, magenta), "Still open" (cross, quiet), and a "Talk about it" row | |
| R5 | The tally under the deck: a bead per card, the current one lit, "1 of 6" | |
| R6 | The deck deals in (the top three rise in turn), age bars grow from zero | |
| R7 | A tick flies the card up into the strip's set-down place; its bead ties off; the counts turn | |
| R8 | The receipt with Undo stays under the deck: "Set down · <name>" | |
| R9 | A cross flies the card back to its own bead, marked as checked today (a ring with a dot) | |
| R10 | The tally ties or marks the bead and lights the next; the position counts on | |
| R11 | The open strip bead for the card on top is lit while it is on top | |

## 6 · Talking about the first thing (x3)

| # | Element | Status |
| --- | --- | --- |
| T1 | "Talk about it" raises the conversation as a sheet over the page (from 98 pt down), grabber on top | |
| T2 | Sheet head: the Leader's face (28) and "Leader", "Back to Now" (44 pt) | |
| T3 | The item quoted at the top as a glass card: its title, "Talking about today's idea" | |
| T4 | The thread above is the whole conversation, kept across reloads; a sliver "15 Sep · the last time you talked" | |
| T5 | His words right-aligned in his bubble at 17 | |
| T6 | Every reply has a byline: the Leader's face, "Leader" in magenta, a 13 meta ("asking two agents") | |
| T7 | While the Leader asks: "Asking the Researcher and the Librarian." and a seat per agent in its own hue, its face's ring turning, a live count of seconds | |
| T8 | When each is back its seat ticks ("Back · 5 s"); then the seats fold away and the faces join the byline stack ("asked two agents · 38 s") | |
| T9 | The Leader's lead line in the serif at 20, said word by word; the rest at 17 | |
| T10 | Under the reply a row per agent asked, in its hue: "From the Researcher", what it gave and how long; each opens to its own words | |
| T11 | One composer at the foot of the sheet, with the mic | |
| T12 | Earlier ideas up the thread: each morning's idea is the Leader's message that morning and opens to its why and sources | |
| T13 | New conversation, in the menu | |
| T14 | The sheet goes back by Back to Now, a drag down, the scrim, or the edge swipe | |

## 7 · The picture rises (inherited from A2, named in the blend)

| # | Element | Status |
| --- | --- | --- |
| S1 | A tap on the strip raises the stage over the page; the page behind dims and blurs | |
| S2 | Stage head: "The picture", "since 9 Sep", Done | |
| S3 | A sentence in the serif written by code: "Seven things open, and nothing new from you for nine days." | |
| S4 | Each struggle a thread from the day he said it to today, its name above and its age at the end | |
| S5 | Solid while he has told the Leader about it, dotted through the days without word, under a fog band "9 days without word" | |
| S6 | The axis of days under the threads (first day, the last word, Today) | |
| S7 | What works below the line, as bars from the day each was said | |
| S8 | The thread the Leader is asking about is lit, with the question's orb at its end tied to it | |
| S9 | The shelf: "Set down · nothing yet", or what was set down with Undo | |
| S10 | The note: touch a thread and slide to light another; let go to set it down or talk about it | |
| S11 | Drawn in: the threads draw from left, the fog and dotted parts arrive, then the works bars grow | |
| S12 | Set down from the stage: the thread runs to today, ties off, drops to the shelf, the sentence rewrites | |
| S13 | Done settles the stage back into the strip | |

## 8 · Every function the Leader has today (audit §3 Keep, and the map)

| # | Function | Status |
| --- | --- | --- |
| F1 | Today's idea with why and its sources (the card in the morning, a row after) | |
| F2 | Earlier ideas (the trail) up the conversation, each opening to its why and sources | |
| F3 | The Leader's question answered typed or spoken, in one cheap pass; sending again adds to it (Say more) | |
| F4 | A timeout on the answer says it may still be recording, never that it failed | |
| F5 | The picture: every struggle and win with its age | |
| F6 | Set it down, with Undo where it happened, on the rails (leader-reflect, undoData) | |
| F7 | Still open, marked as checked today, on the rails with an undo | |
| F8 | The conversation and New conversation, kept across reloads | |
| F9 | Whom the Leader asked, and their own words; authorship on every reply | |
| F10 | The research count and the last run, behind the menu | |
| F11 | The honest line, and the follow-up's restraint (never a second question while one waits; the round-up held the same way) | |
| F12 | The two channels stay apart: the idea is never rewritten by the order, only moved | |
| F13 | Code owns the facts: every count from the record, recomputed on read | |
| F14 | The Home Leader box keeps working (both faces, the swipe, the answer in place) | |
| F15 | "Say more" on the Home box is 44 pt (the audit's Critical) | |

## 9 · The seen mark

| # | Element | Status |
| --- | --- | --- |
| N1 | A Leader reply carries a server-side `seenAt`, set once when he opens the page with it on top; one write, idempotent, no model call | |
| N2 | Never fires in demo | |
| N3 | The reply stays on top for the visit in which it was first seen, so the card does not jump away while he reads | |
| N4 | A seen mark is a receipt, not a decision: no Inbox card | |

## 10 · States

| # | State | Status |
| --- | --- | --- |
| Z1 | Loading: the page's shape with the strip and card as skeletons, never a blank | |
| Z2 | Demo: says it is demo, never "Connect a backend" | |
| Z3 | No idea yet today: the card says so honestly | |
| Z4 | Nothing open: the strip says "Nothing open" and the honest line still reads the record | |
| Z5 | The Leader is answering while he is away: the conversation row says so | |

## 11 · Differences from the drawing, and why

Filled in after the frames are compared.
