# How Jarvis and E.V. take a turn, and what Nova changed (21 Oct 2026)

**His brief:** "Part of what I think puts me off a little bit with Nova …
is that it always responds with very lengthy replies despite potentially not
having all the key information. It does not talk to me like a real person and
go back-and-forth like I want to. … Some lengthy responses are okay once it
has all of the relevant information that it thinks it needs or if a lengthy
response is necessary."

Follows `design/EVIE-STUDY.md` (15 Oct), which fixed the first second of a
turn (the ack). This one is about the length and the rhythm of the turns
after it.

---

## 1. The evidence

### Jarvis and E.V. (counted, not remembered)

Source: subtitle transcripts from Springfield! Springfield! for *Iron Man*,
*Iron Man 3*, *The Avengers*, *Age of Ultron* and *Spider-Man: Brand New Day*,
plus Wikiquote's speaker-labelled Jarvis lines. Every AI line below was
checked by script against the fetched text. *Iron Man 2* is not covered (no
clean transcript reachable), *The Avengers* gave only four usable lines, and
most speaker labels are inferred from the scene (36 of 93 Jarvis turns are
labelled in the source; E.V.'s are all inferred, but the opening exchange
matches the clip in EVIE-STUDY word for word). The working corpus (93 Jarvis
turns, 24 E.V. turns) stays out of the repo.

| | Jarvis | E.V. |
|---|---|---|
| Median words per turn | 8 | 6 |
| Turns of 1–8 words | 57% | 62% |
| Turns over 20 words | 4 of 93 | 1 of 24 |
| Acknowledgement or status | 30% | 50% |
| Questions back | 10 (3 are wit) | 2 |
| Human words per matched pair | 7.5 | |

The five turns over 20 words are a scheduled 7 a.m. briefing, a crisis
update, a self-introduction, a malfunction gag, and E.V.'s answer to "What is
happening?". **None of them answers a command.**

The patterns that matter for Nova:

1. **Eight words is the centre.** "The altitude record for fixed-wing flight
   is 85,000 feet, sir." is the whole answer.
2. **Hard content is chunked across turns, with the human in between.**
   E.V.'s body-scan diagnosis comes in five turns (29, 20, 12, 9, 11 words)
   with Peter answering between them, and she pulls him back in: "Have you
   experienced any recent traumatic events? Peter?" Jarvis on the sceptre:
   "The scepter is alien. There are elements I can't quantify." / Tony: "So
   there's elements you can?" / "The jewel appears to be a protective housing
   for something inside, something powerful." / "Like a reactor?" / "Like a
   computer." The report is never one block.
3. **Offer the depth, never recite it.** "Shall I render using proposed
   specifications?" "Would you like to run a test?" "I've also prepared a
   safety briefing for you to entirely ignore."
4. **Questions are short and about the next step.** No multi-part clarifying
   question anywhere in the corpus; a yes/no with a default ("Shall I store
   this on the Stark Industries' central database?").
5. **Results go to the screen; the voice points.** "You have 107 new alerts.
   Please check backlog." Two of Peter's commands get no spoken reply at all.
6. **Warn once, in one sentence, then comply.** "Sir, the suit is not combat
   ready."
7. **When cut off, stop.** "Just leave it on the screen, stop telling me"
   ends the power countdown for good.
8. **Speak first only about a change or a danger.** 29 of Jarvis's 32
   unprompted turns are status, warnings or event updates.
9. **Wit is short** (median 9 words, max 19) and **"sir" is a tag**, not a
   sentence.

### Nova, on his real record (scripts/talk-shape.mjs, 21 Oct baseline)

- Replies to his turns: median **17 words**, p90 **145**, max 536; 16 of 63
  over 40 words. Replies to his turns of 8 words or fewer: median 17, max 151
  ("Nothing." drew 151 words of Intake arithmetic; "Did you watch and analyse
  those last 2 links?" drew 96).
- 10 of 63 replies hand the floor back with a question.
- The Coach spoke **565, 642, 672 and 1,080 words** in single turns on 15 Oct.
- **Greetings: 27 in three days, 15 on 20 Oct alone**, median 30 words, almost
  every one an Inbox rundown ("Seven drafts wait in your Inbox, the oldest two
  days old").

Why, read from the prompts:
- The lens told every agent to "Finish with the single highest-leverage thing
  he can do next" on every reply, and Ask Nova's rules added "weave ONE brief,
  natural remark" about his day and "notice patterns across what he shares".
  Each is good alone; together they made every reply a briefing.
- `SPOKEN_REGISTER`, which the Coach and the Leader read, said "A long answer
  is fine … This is not a request to say less." The Coach had no length rule
  at all.
- The model had nowhere to put detail it judged useful, so it said it.
- The doorman ran on every background sync and measured three hours since
  the LAST GREETING, not since he was last there. A Mac left open on Nova
  greeted an empty room at 02:05, 05:06, 08:18, 11:21, 14:22, 17:08, 20:07,
  23:05, and his phone said the same hello again minutes later.

---

## 2. What was built

**A. The turn and the rest** (`src/turnFold.js`, shared by server and client).
A reply may carry a line that is exactly `MORE`. Before it is the turn: shown
and spoken. After it is the rest: held on the line. "go on", "tell me more",
"the rest", "what else", or a bare "yes" after a turn that ended by offering,
says the rest **by code, at once, with no model call**; so does a tap on "The
rest · N words" under the line. Directives and document tokens after the mark
stay with the turn; the stream is cut at the mark so the rest is never spoken
early. If he does not ask, the next turn tells the model he never heard it.
The Siri one-shot drops the rest (no next turn to ask in). Folded in Nova's,
the Coach's and the Leader's settle.

**B. How you take a turn** (`server/lib/talk.js`, `TURN_TAKING`), placed last
before his words for Nova, the Coach and the Leader (never a consulted turn
or the one-shot): one turn, not a briefing; ask first when only he knows the
missing piece, offering the likely answer; hold the detail after MORE and end
with a short offer; long only when he asked for depth or he needs the whole
plan; nothing he did not ask for unless it changes what he does now; warn
once; if he cuts in, follow him.

**C. The lens** (`server/lib/lens.js`, `design/NOVA-METHOD.md` §1): LAND ON ONE
ACTION now applies *when you advise*; a new TAKE TURNS line. `SPOKEN_REGISTER`
no longer licenses length.

**D. The doorman greets an arrival** (`src/greetDue.js`). Due only when he is
present (a touch, a key, the page coming into view, or opening the app on his
phone) on a visible page, and either his first arrival today or a return after
three hours with **no presence**. Every delivered hello is stamped on the
server, so his other device stands down. A return is told only what landed
while he was away, never the Inbox count, in under 15 words; a new day under
30.

**E. The measure** (`scripts/talk-shape.mjs`): the numbers above, re-run on
any window with `--since`.

## 3. Not done, and why

- The model on this Mac (`server/lib/localAsk.js`) keeps its own three-sentence
  rule and does not get MORE: a 4B model told about a mark would likely print
  it in the middle of a sentence. Revisit after its real run.
- His own lines are under-recorded: 65 of his turns against ~700 of Nova's in
  the record, so the Coach's long turns mostly show as unprompted. The
  numbers above are only for the pairs the record holds.
- Folding is the model's decision; code does not cut a long reply that has no
  MORE. That is deliberate (he said a long answer is fine when needed) and is
  the first thing to revisit if the measure stays high.

## 4. How to tell if it worked

After a few days of real use: `node scripts/talk-shape.mjs --since 2026-10-22`.
Expect the reply p90 well under 145, questions back above 10 in 63, the Coach
under ~150 words a turn unless he asked for depth, and greetings at one or
two a day plus real returns.
