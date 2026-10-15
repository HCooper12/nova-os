# Conversation review: queued for the week of 20 Oct 2026

Logged 16 Oct 2026 from his report on the phone (cupertino, installed shell).
His words: "There is still a lot of work that needs to be done to improve the
communication aspects of Nova." Nothing below has been diagnosed yet. These
are his observations, kept as he gave them, with the places to start looking.

## 1. Voice does not pick the conversation back up

Leave the chat for another app, or switch Nova tabs, then come back to voice:
Nova does not always resume speaking to carry on the conversation.

- Unknown: whether the turn was mid-speech, mid-listen or idle when he left,
  and whether the answer had already arrived. Reproduce all three.
- Start at: `visibilitychange` handling in `src/App.jsx`, `src/VoicePresence.jsx`,
  `src/NovaCore.jsx`; the iOS audio session rules in the `nova-audio-session`
  memory; the turn ownership rules in `nova-voice-turn`.

## 2. A wall of text, and a visual panel that never drew

Screenshot, 08:19: a long spoken answer (the arms-without-Saturday routine,
Coach's seven cards, "which of those five slots would you like to free up,
sir?") followed by the "Shown while he spoke" glass. The first panel, "Arms
without saturday", rendered only its frame and two axis labels (Biceps,
Triceps) with an empty body. The second, "Four days work", is a truncated
text pill. Nothing animated.

- Two faults: the panel's content did not load or draw, and the answer is too
  long to read or hear comfortably. The second is a question about how Nova
  speaks, as much as a rendering bug.
- Start at: `src/NovaThreadParts.jsx` (the replay glass), the VIS directive
  and panel builders in the `nova-running-glass` memory. Check whether the
  panel payload was empty (server) or present but not drawn (client).

## 3. Holding Talk, then trying to type

Long-pressing the Talk button (bottom right) opens the chat straight into
listening. If he tries to cancel the listening to type instead, it bugs out
and will not let him type.

- Start at: `src/longPress.js`, `src/FloatingCore.jsx`, `src/SummaryDock.jsx`,
  and how focusing the composer is meant to end a listening turn.

## 4. The glass panels follow him out of the chat

Screenshot, 08:24, Inbox tab, five minutes after item 2: the same two panels
("ARMS WITHOUT SATURDAY", still empty apart from the Biceps / Triceps labels,
and "FOUR DAYS WORK") were floating over the Inbox, covering the program
review card and an Undo row. They are the dark, live-glass style, not the
replay card from the chat, so the live overlay was never torn down when the
turn ended or the screen changed. Likely one cause with item 2: the panel
never finished drawing, so it never reached its dismissal.

- Start at: wherever the live running-glass overlay mounts (outside the chat
  screen, since it survived a tab change) and what is meant to clear it: turn
  end, a timer, leaving voice. Reproduce by asking for a chart answer, then
  switching tabs mid-answer and after it.

## How to approach it

Treat it as one review of the conversation surface, not three patches:
reproduce each on his phone first (`shot.mjs --readonly` for the panel, a
real device for audio and resume), then decide what a good spoken turn looks
like before fixing the pieces.
