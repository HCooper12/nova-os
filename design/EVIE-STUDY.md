# E.V. study — what Peter Parker's AI does, and what Nova should take from it

**Source:** the opening of *Spider-Man: Brand New Day* (2026), clip
https://youtu.be/ITv7MbH9mTc, watched 1:00 → 6:53 at up to 2 fps, with a
Whisper transcript. Plus what is public about the character: created by
Peter, installed in suit v5, voiced by Naomi Watts, described by the director
as "sadly, the closest thing Peter has to a friend"; her listed functions are
analysis, calibration and diagnostics, with alerts, vitals, suit systems,
navigation and status reporting elsewhere in the film (from transcript
summaries, not watched).

**His brief (15 Oct 2026):** study how Peter interacts with E.V. (the first
two minutes especially), what she can do or could plausibly do, how she
communicates and how fast, how she uses context, and turn it into a plan for
Nova.

What is OBSERVED below was seen or heard in the clip. What is REPORTED comes
from the web sources. What is INFERRED is my reading. The three are labelled.

---

## 1. What actually happens in the clip

**1:00–2:05, the apartment.** Peter alone at a desk with two monitors of
telemetry, a fabricator stitching the suit (1:05), hand-loading web
cartridges, flexing the shooter on his wrist (1:28). A case board of pinned
photos and a city map fills the wall (1:32). The phone on the desk lights up
with an Instagram notification (1:41).

- 1:32 Peter, eyes on the shooter, hands busy: **"Evie, can you check the
  calibration of my targeting matrix? That doesn't feel zeroed in to me."**
- 1:36 E.V., within a second: **"Checking target calibration."** Three
  words, his noun phrase echoed back. No result is spoken in the clip; she
  works in silence.
- 1:46 He picks up the coffee cup and the folded note (MJ's): **"Hey, Evie,
  take five."**
- 1:48 **"Standing by."** Two words. She is silent for the rest of the scene
  while he reads and watches MJ's story on his phone.

**2:56–3:24, the rooftop.** In the suit, mask off, watching MJ's story on his
phone. At 3:00 the phone overlays the video with **ALERT: CRIME IN
PROGRESS**, a map blob and the live waveform of the police band; a voice
reads **"Suspect is 5'8 to 5'10, medium build."** Mask on, he drops off the
building. 3:10 **"Incoming!"** mid-fight (a warning; whose voice is not
certain from the audio).

**5:35, the montage.** **"Initiate HUD tests."** First-person view: reticles
lock on his own hands, telemetry at the edges, then the mask's lens view;
**"Armed robbery at Civic Union Bank"** and he is gone.

---

## 2. Thirty-two things picked up

Communication and speed
1. OBSERVED. Her replies arrive inside a second of his last word.
2. OBSERVED. Her lines are two to four words: "Checking target calibration."
   "Standing by." No greeting, no filler, no "I'd be happy to".
3. OBSERVED. The acknowledgement echoes the object he named, so a wrong
   hearing would be audible at once.
4. OBSERVED. She acknowledges and then works silently; a result is only
   spoken when it exists. She never narrates what she is about to do.
5. OBSERVED. One voice, calm and even, the same in the lab and in the field.
6. INFERRED. The register is status language ("standing by", "checking"),
   closer to a flight controller than a chatbot.

How he addresses her
7. OBSERVED. He says her name as the whole address, mid-task, eyes and hands
   elsewhere: "Evie, …". No wake phrase, no button, no screen.
8. OBSERVED. His request carries his reason as a feeling: "that doesn't feel
   zeroed in to me". The subjective report is the input; she runs the
   objective check.
9. OBSERVED. He uses a human idiom ("take five") and she maps it to a state.
10. OBSERVED. He can pause her in two words and she stays paused without
    being told how long; he does not have to switch anything off.
11. INFERRED. A short two-syllable name is what makes mid-task address
    possible at all.

What she does
12. REPORTED. Calibration, analysis and diagnostics of his own gear: she
    checks, he decides.
13. OBSERVED. A self-test exists as a routine ("initiate HUD tests") and he
    runs it before going out.
14. OBSERVED. Alerts come from an outside stream (the police band) distilled
    to one actionable line (a suspect description).
15. OBSERVED. The alert card has an anatomy: a label (CRIME IN PROGRESS), a
    place (map), the source (live waveform), and it is both shown and spoken.
16. REPORTED. Vitals, suit status, navigation, recording and playback, and
    warnings when the tech itself fails.
17. OBSERVED. She acts on her own domain (the targeting matrix) without
    asking permission; trust is already earned there.
18. REPORTED. Later in the film she shows concern for him. The
    director calls her his closest friend; she carries continuity, not just
    commands.

Context
19. OBSERVED. Where he is sets what she is: engineer at the desk, dispatcher
    on the roof, HUD in the suit. Same AI, different register and channel.
20. OBSERVED. The alert interrupts a personal moment on the SAME device, over
    the top of what he was doing, because it clears a high bar. The
    Instagram notification in the lab does not get spoken; it is not hers.
21. OBSERVED. Numbers live on the glass (monitors, HUD); the voice carries
    only the words that need to be heard.
22. OBSERVED. She stays out of the emotional moments (the note, MJ's story).
    "Take five" is honoured; nothing nudges him.
23. OBSERVED. The case board is physical, his own memory of open loops; she
    does not replace it, she sits beside it.
24. INFERRED. She runs on his own hardware in the apartment; there is no
    cloud round-trip in her latency.
25. OBSERVED. He builds and maintains his own tools (the fabricator, the
    cartridges) and she is part of that loop, checking what he has made.

Usability
26. OBSERVED. The whole lab exchange completes without a screen being
    touched.
27. OBSERVED. Hands-free covers pause and resume, not only questions.
28. INFERRED. Unprompted speech is rare and high-stakes; when she does speak
    first it is because something needs him now.
29. OBSERVED. The phone stays a normal phone for his own life; Nova-grade
    interruption rides over it only for alerts.
30. OBSERVED. "Incoming!" is a one-word warning timed to the event, not a
    sentence.
31. INFERRED. Every function visible is deterministic (calibration, HUD
    test, dispatch parsing). The "friend" part is tone and continuity, not a
    different mechanism.
32. INFERRED. The speed people read as intelligence is mostly the first
    second: the ack, the echo, the silence after.

---

## 3. Where Nova already stands (verified in the repo, 15 Oct)

- Reflex layer (`server/lib/reflex.js`): code answers direct asks in <1s.
- Verbs (`server/lib/verbs.js`): strict grammar, act/confirm tiers, undo on
  every act; the Mac hand, the browser hand, Shortcuts.
- "Hey Nova" wake word (`src/WakeWord.jsx`), barge-in (`src/bargeIn.js`),
  the held turn (`src/turnEnd.js`), Nova's own ears on the iPhone
  (`/api/voice/transcribe`), turn receipts (`server/data/voice/turns.json`).
- Spoken register in the Ask prompt: two or three sentences, under ~50
  words, one question at most.
- Dynamic Island notifications, the Pocket, a native Live Activity, widgets.
- The hands-free Siri lane with code-written interim lines
  (`server/lib/handsFree.js`).
- Quiet hours (`server/lib/quietHours.js`), respect-the-no.
- Settings › "Can Nova hear you?" and "Test Nova's ears" (mic checks).

So the gap is mostly in the first second of a turn, the status vocabulary,
a spoken pause, the check verbs, and an alert layer with a bar.

---

## 4. Proposal

### A. The first second (the register)
Goal: every spoken turn is acknowledged, in Nova's voice, inside ~400 ms of
his last word, with the parsed object echoed back.

- `server/lib/acks.js` (new): a closed vocabulary of code-written status
  lines, each ≤5 words: "Checking {object}." "On it." "Logging {n} {food}."
  "Standing by." "Back." "Done." "Nothing found." "Filed." Rotated, never
  random (the reflex discipline).
- The ask routes return the ack line in the FIRST streamed chunk, before
  context assembly or the CLI spawn; the client speaks it immediately on the
  TTS queue and the island shows it.
- Echo rule: a verb's ack always names what was parsed, so a wrong parse is
  heard at once and "no, two" undoes it by voice.
- Filler lint: a pure function over spoken text that strips "Sure", "Great
  question", "I'd be happy to", "Let me" and leading restatements before
  TTS; a test asserts the model's reply never reaches the speaker with them.
- Receipts: add `ackMs` and `firstAudioMs` to each row in `turns.json`;
  a scripted read prints p50/p95 by device. Target: ack p50 < 400 ms,
  first model sentence p50 < 3 s on the phone. Measure first; no claim
  before the numbers.

### B. Standby and the idioms
- Verb `nova.standby` (act tier, undo = resume): "take five", "hang on",
  "give me a minute", "back in a bit", "quiet", "I'm back", "resume". While
  standing by: no proactive speech, no nudges, no island drops except the
  alert tier (D); the wake word stays on so "Nova, I'm back" works. Default
  expiry 30 min, extendable by word ("take ten"), always stated on resume
  ("Back. Two things landed while you were out.").
- Bare-name address: `WakeWord.jsx` PHRASE also accepts a sentence-initial
  "Nova," (comma pause or imperative verb following), guarded by the
  barge-in filter and a two-false-wakes-then-off valve, same as barge-in.
- Idiom table in `verbs.js` (a synonyms map per verb, tested) so human
  phrasings reach the right verb without loosening the strict-name rule.

### C. Check verbs (her calibration, his body and his tools)
- `check <thing>`: deterministic diagnostics spoken in one line. Things:
  sleep, HRV, protein, calories, steps, a lift ("check my bench"), a
  routine, the plan, the inbox. Each reads the record, compares to his
  baseline/targets, and says one sentence with the number and the delta;
  anything analytical still falls through to Coach.
- Feelings as input: a trailing reason clause ("… that felt off", "that
  doesn't feel right") is stripped by the grammar and passed as `ctx.reason`
  so the check names it ("Bench felt off: bar speed was fine, volume was 12%
  under your last three.").
- `run checks` ("Nova, systems check"): ears, voice ready, server health,
  HealthKit freshness, sync age, calendar cache age, pending inbox. One
  spoken line, faults first, nothing invented ("Voice engine is down, using
  the phone's voice."). This is the existing mic/ears checks promoted to a
  verb and run automatically each morning before the dispatch.
- `ready?` before training: readiness line + today's session in one breath
  + confirmation the draft is safe.

### D. The alert layer
- A single `server/lib/alerts.js` with three tiers: **now** (speaks and
  drops in the island/Live Activity even during standby: a calendar event in
  10 min, a Researcher answer he asked to be told about, a health reading
  outside bounds, a pocket workout about to be lost), **next** (island only,
  spoken at the next turn), **later** (inbox only).
- Anatomy, code-written: what, where/when, source ("from Apple Health",
  "from your calendar", "from the Researcher"), one action. Never a
  paragraph. Spoken form ≤ 12 words.
- The bar is measured: every alert lands a receipt with tier and whether he
  acted; the pattern scout reads it weekly and proposes demotions. This is
  the produce-vs-keep correction applied to interruptions.

### E. Context by place
- A `where` signal on the client (workout active via HealthKit, CarPlay or
  headphones as audio route, Mac foreground via the Mac hand, phone in hand)
  chooses register and channel: gym = gymVoice and the Live Activity,
  driving = hands-free register and no glass, desk = Mac hand and the
  running glass. No new prompts; the lens stays. Only the register block
  and the allowed interruptions switch.

### Order and size
A first (it changes the feel of every turn and is measurable), then B, then
C, then D, then E. A and B are each one or two sessions; C is a day per
batch of checks; D touches push, island and the native shell; E is small
once D exists.

### Decisions for him
1. Build A (ack-first turns with receipts) now? My pick: yes, it is the
   single change the clip most argues for.
2. Standby defaults: 30 minutes, alerts of tier **now** still get through.
   Agree, or make standby absolute?
3. Bare "Nova," as a wake word alongside "Hey Nova": on by default, or
   opt-in like the wake word itself? My pick: opt-in, same toggle.
4. Should "check" verbs ever consult Coach, or stay pure code? My pick:
   pure code, one line; Coach only when he asks "why".

---

## 5. Status, 15 Oct 2026 (same day)

He said yes to all four decisions and added two things: alerts with an
anatomy should appear across Nova, and the prebuilt acks must stop feeling
premeditated. Built that day, all on main:

- **A, 2adaa06**: `server/lib/acks.js` composes the ack from his words per
  lane, never the same frame twice a day; `src/spokenLint.js`; receipts
  `ackMs / firstTextMs / firstAudioMs`; `scripts/voice-latency.mjs`. The
  fixed ACK_LINES and the 4 s thinking line are gone.
- **C, 732a72d**: `server/lib/checks.js`, `check <thing>` and `run checks`.
- **B, f0797d8**: `server/lib/standby.js`, `server/lib/idioms.js`,
  `src/wakePhrase.js` (bare "Nova," opt-in in Settings › Voice).
- **D, 05b4331**: `server/lib/alerts.js` (tiers now / next / later, the
  anatomy, receipts, demotion proposals through the pattern scout),
  `src/AlertCard.jsx` in the island; standby ends with one combined push.
- **E, 2f7fdb8**: `src/where.js`, `server/lib/register.js`; gym = one
  sentence, driving = two and no glass with every act confirmed; the lens
  untouched. Driving is only detectable on the Siri lane until a native
  plugin reports the audio route and motion.
- **Wren, atlas-partner bf4bd0c**: the same acks, `lib/spokenLint.mjs`,
  `lib/standby.mjs`, alert cards with the anatomy (`raiseAlert`, also
  exposed to Mission Control as `WrenDock.alert`), latency receipts.

Not yet seen on his phone. The latency receipts are empty until he uses
it; read `node scripts/voice-latency.mjs` after a day of real turns before
claiming anything about speed.
