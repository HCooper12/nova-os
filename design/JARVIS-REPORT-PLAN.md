# The Spoken Report — Nova reads it, the screen shows what she means

**His ask, 21 Sep 2026 (13:46), after reading the Coach's program review in
the Inbox:** the detail is welcome, but the report should come back through
Nova herself — read aloud, with visuals that accommodate what she is saying,
"just like we've talked about before with the idea behind Jarvis". His
example: when the report says a muscle is over-trained for his goals, the 3D
body rises with that muscle lit and the camera eases in; then his program
appears with every exercise for that muscle highlighted; the one to drop
blinks and is removed as she explains why. Aim: clearer key information, and
something worth listening to.

**He asked for a mockup before code.** It is here:
https://claude.ai/artifact/Eq6VioD4fLbW5X6EYhozBY — five beats built from
the real review Nova produced for him that day. Decide on the visual there
first.

## The five beats

1. **The verdict.** Nova speaks the report's opening; the glass shows the one
   number the sentence is about (72 of 98 sets completed).
2. **The muscle it means.** The Train screen's body model rises with the
   named muscle lit in the report's accent; the camera eases in while she
   says the figure (chest, 12 sets/week, not a priority).
3. **Where it comes from.** His actual program as written, every exercise for
   that muscle lit.
4. **The change, shown.** The exercise she recommends dropping blinks, is
   struck through, and leaves the list; the row the evidence protects stays.
   Under it: *Make this change* / *Argue*.
5. **What to do.** The numbered changes arrive one by one as she reaches
   them; chips carry the words the report already accepts ("Make all of
   them", "Make change 2", "Argue with 3", "Research further").

## Doctrine (unchanged)

- **Models decide, code acts.** The model writes the report and names which
  beat to raise for each sentence — a `VIS` directive, exactly as the
  briefing does (`design/BRIEFING-PLAN.md`, the running glass). Code owns
  every visual: the figure and its lit muscle (from the exercise library's
  muscle map, the same anatomy the Coach uses), the program grid and its
  highlights, the blink-and-remove, every number. A directive naming a
  muscle or exercise that does not exist raises nothing.
- **Sentence-level sync only**, the Morning Show beat loop reused; tap a beat
  to pause; "why" mid-beat interrupts.
- **Nothing writes.** "Make all of them" hands each program change to the
  Coach as a proposal on the rails; his yes applies it.

## What it needs that does not exist yet

- A body-figure panel that lights a named muscle and eases the camera to it.
  `Body3D.jsx` already renders per-muscle geometry; it needs a `focus` prop
  and a camera tween (≈ ½ session).
- A program panel with highlight and remove animations, from the routines the
  vault holds (≈ ½ session).
- A `VIS` vocabulary of the five beats, and the report prompt told to emit
  them (≈ ½ session).
- Entry points: the report card's *Walk me through it*, the Voice screen, the
  Coach tab (≈ ½ session).

Roughly two sessions, after he has approved the visual.

## Related, shipped the same day

- The **TL;DR on every Inbox card** (`src/tldr.js`, code-derived, never
  invented): the verdict line and the numbered changes for a report or brief;
  the one line a Coach flag already is; nothing for a bare capture.
- The report already comes back to the chat with walk/coach/keep chips
  (`design/SESSION-HANDOFF.md`, 21 Sep).
