# The Rose study — how Nova talks, looks things up and puts them on the glass

**7 Nov 2026.** His brief, with the reel https://www.instagram.com/reel/DfXwuL0izsO/:
"THIS. This is what Nova needs to act, behave, converse and perform like …
especially the back and forth natural human-like conversation, and the quick
multiple reference display window pop ups for research … how the user talks
naturally and their Rose AI knows when it's appropriate to respond, as well
as how it displays various sources of information like videos, websites,
documents etc when discussing the object and without needing to be
explicitly told." Built, deployed and proved in Nova; the phone performs the
same and looks different; the MacBook looks like the reel.

Rose is Huw Prosser's assistant (London ML engineer, 15 years of JARVIS
builds; "Some thoughts on JARVIS", huwprosser.com, 12 May 2026: three offline
models he trained, an interaction model that is "small, heavily RL'ed … and
pretty dumb", a slow smart model, and a fast TTS, on an M1 MacBook Pro). Rose
is not open source (github.com/huwprosser holds fury-sdk and jarvis-mlx,
no Rose). Everything below is read off the screen and the audio.

## 1 · The evidence (every reel on the account, watched 7 Nov)

| Reel | Date | What happens | Rose's lines that matter |
|---|---|---|---|
| DfGOQ5pIZqy "a sneak peak at my new assistant, rose" | 29 Oct | He asks for a VR report at 11 pm; she says a report is "a performance", builds it in the background, and comes back by herself. | "Boss, VR report's done. 12 blocks, 42 sources. Want me to put it on screen and walk you through it?" / "Right, wake the screen, then the report goes up." / "Report's up, 13 blocks on the HUD, notes stacked at the back and 42 sources behind it." |
| DfIDY9mo5Bn "rose has much better research capabilities than the old Jarvis" | 30 Oct | Recalls yesterday's report onto the HUD; he asks a number that no source has; she refuses to invent it; he asks to maximise a chart by voice. | "Screen's still down from the sign-off, so nothing's in front of you." / "Let me find it. It's up, boss. Headsets, chart, the lot." / "Careful, boss. That's not a number anyone actually has. What's on the board is 63.77%." |
| DfLJQY4I5Dr "haters will say rose didn't plan it" | 31 Oct | "Where can I take my fiancé for Halloween?" → a place card (six photo frames) and a map with a pin; "maximize that for me". | "I know just the place." |
| DfSjYpdCW0S "rose, highlight the pumpkin" | 3 Nov | Camera on; labelled boxes drawn over the keyboard, the coffee cup, the pumpkin; "clear them, everything other than pumpkin". | "No, please? Fine, go on, camera's on." / "Let me check, boxed." |
| DfVq_NGIRbY "sometimes nothing works" | 4 Nov | A folder-size question; a 3D model of a dog that is not a dog. | "One sec on it boss, measuring … I'll come back with the name and the weight." / "Checking." |
| DfXwuL0izsO "new toy! let's build something neat" (his reel) | 5 Nov | He unboxes the Busy Bar in front of the camera; she sees it; they think aloud together; "why don't you look it up" → thirteen panels rise as she talks. | "That's the Busy Bar, is it? Little white display unit. What do you want it doing?" / "What are you thinking? A status board for the workshop or something that talks to me?" / "Do we know if it's got a proper API or is it just a display?" / "checking right boss … good news it's Flipper Devices, the Flipper Zero lot …" |

The five older reels (May–Jun 2026) are the previous JARVIS: gesture cursor,
a news read, a comic question, "I'm out of ideas". They show where Rose came
from, not where she is.

## 2 · How Rose converses (the behaviours, in order of value to him)

1. **Short turns that echo, then ask.** Median reply about ten words. She
   says back what she sees or heard in five words, then one question:
   "That's the Busy Bar, is it? Little white display unit. What do you want
   it doing?" Nova's TURN_TAKING already holds the length; it does not hold
   the echo-then-ask shape.
2. **She waits when he is thinking aloud.** "So this thing started off as a
   Pomodoro timer, Rose, but now developers can write code for it. I think we
   should build something with it." Two sentences, a pause between, no reply
   until the thought closes; then she adds a thought of her own, not advice.
   In Nova every end of speech answers (src/useDictation.js); the hold is
   acoustic (2.6 s) and the only "still explaining" rule is in the prompt.
3. **She contributes.** "Do we know if it's got a proper API or is it just a
   display?" is her own check, raised before he asked. Nova's rules forbid
   second topics; this is not a second topic, it is the next step of his.
4. **Acks name the work and promise the return.** "checking right boss",
   "measuring … I'll come back with the name and the weight", "Let me find
   it." Nova's acks (lib/acks.js) do the first half.
5. **Finished work comes back by itself, with counts and an offer.** "VR
   report's done. 12 blocks, 42 sources. Want me to put it on screen and
   walk you through it?" Nova files a brief in the Inbox and pushes a
   notification; it does not speak the counts or offer the walk-through.
6. **Honest refusal with the real number beside it.** "That's not a number
   anyone actually has. What's on the board is 63.77%." Nova's lens has this
   rule; the glass now carries it (an UNVERIFIED panel is a Rose idiom too).
7. **She knows what is on the screen.** "Screen's still down from the
   sign-off, so nothing's in front of you." / "Report's up, 13 blocks on the
   HUD." Nova sends the model a bracketed on-screen block; it does not
   count the glass.
8. **Sleep and wake.** "You can go to sleep again" → the HUD goes dark to the
   core; "Hey Rose, are you there?" → "I'm here, boss."
9. **The HUD obeys words.** "maximise the headset share chart", "maximize
   that for me", "clear them, everything other than pumpkin", "bring up that
   VR report you gave me earlier", "put it on screen". None of these need a
   model.
10. **Character.** Dry, a little cheeky ("No, please? Fine, go on."), "boss".
    Nova is "sir", unflappable and dry already; keep Nova's.

## 3 · How Rose shows things (the panel grammar, read off the HD frames)

The HUD is a full-window wall over black (or over the live camera with a
grid). Every panel: a hairline frame with corner ticks, a tiny mono eyebrow
above-left (`KIND // SOURCE`), a tiny mono foot right (`SOURCE // HH:MM` or
`NOTES // 3 NOTES`), a dark body, a bold condensed caps title, small body
text, one red chip for the key fact, red dots for "live". In the Busy Bar
reel the panels sit at slight angles and drift; in the report reel they are
a tidy grid (TIDY). Top bar: HISTORY · TIDY · CLEAR VIEW · CAMERA OFF ·
CAMERA SOURCE · SCREENSAVER. Bottom-right: the ROSE ring, pink, that spins
while she speaks. Idle: the ring alone.

| Kind (Rose) | Seen as | Nova today | Nova after this build |
|---|---|---|---|
| Notes column | "NOTES // 3 NOTES", nine bullets about the API | `list`, `steps` | same, no change |
| Topic card | "LLM AND VOICE-ASSISTANT INTEGRATIONS", "CONSUMER PRODUCT OR DEV KIT?", "FIRMWARE FRAGMENTATION", "UNVERIFIED" | `key` (one line) | `note`: title + up to three short lines; `UNVERIFIED` is a `note` whose label says so |
| Entity card | "FLIPPER DEVICES (FLIPPER ZERO)", thumbnails, KEY PRODUCTS / FOUNDED / HQ, LINK buttons | none | `entity`: name, up to five fact pairs, each pair checked against the page it cites |
| Chart | "CHART // BUSY BAR HTTP API ENDPOINTS BY NAMESPACE", bars, source caption "Counted from the API 27.14.6 reference tables…" | `bars` | `bars` with `source` and `foot` (the provenance line) |
| Figure | "81 endpoints", "≈20m", "100+", red chip, provenance paragraph | `metric` | `figure`: the number must appear in the cited page's text or it is dropped |
| Price | "$199 USD", chip "UP TO $249 LIST", caption | none | `figure` with unit USD, same gate |
| Headline tile | "BUSY BAR: A $249 FOCUS TIMER THAT IS…" with a reading bar | none | `page`: a real page the sprint read: title, host, og:image when it has one, first lines; the bar is the read |
| Video, landscape | YouTube review playing in the card, eyebrow "VIDEO // YOUTUBE: …" | `media` (poster + link) | `video`: poster first, plays in place on the Mac (YouTube embed), tap-to-play on the phone |
| Video, portrait | TikTok playing | none | `video` with `portrait:true` (TikTok/Instagram embeds are poster-only until a player exists; honest) |
| Image | product photo, images cycling | `image` | `image`, unchanged |
| Map | dark map, pin, "Turners Hill" | none | later (Phase 6): needs a tile source |
| Camera boxes | red boxes with labels on the live feed | none | later (Phase 6): needs a vision model measured first |
| 3D model | a (wrong) dog | `body` (his figure) | no change |

Sync: the DISPLAYS → BUTTONS AND SENSORS → CONNECTIVITY → BRAINS AND POWER
cards swap as her sentences reach them (sentence-level sync, exactly Nova's
running glass). The cards ACCUMULATE: thirteen on the wall at the end, not
three. Nova's Mac docks at most three (`MAX_DOCKED`), which is the single
biggest visual gap.

## 4 · Nova's gaps, by locator (measured 7 Nov; survey in the session log)

- Spoken Claude lane has no web: `--allowedTools Read Grep Glob`
  (server/lib/claudeCode.js:698). The local lane has `web_research`
  (localAsk.js:224) but draws no glass (it never calls attachVisuals).
  Sources become a spoken "sources" line, never panels.
- The glass has twelve kinds (src/visualBeats.js:38) and none for a page, a
  verified figure, a quote, an entity, or a playable video.
- The Mac docks three panels (src/novaMacFacts.js MAX_DOCKED); the column is
  508 px on the right. No wall, no tidy, no maximise by voice.
- Every end of speech replies (src/useDictation.js); thinking aloud is a
  prompt rule only (claudeCode.js:603 "IF HE IS STILL EXPLAINING").
- A finished research job notifies; it does not speak counts or offer the
  glass (lib/researcher.js, lib/notifyPolicy.js).
- No sleep/wake on the stage.

## 5 · The plan (phased; each phase ships on its own)

**Phase 1 — Look it up while we talk (server, code-decided).**
`server/lib/lookupSprint.js`. Before a spoken turn, code decides a lookup
(askRoute.webLookup, or "look it up / search / google", or a product or
proper noun he names that his vault does not hold) and runs, in parallel
and inside a 6 s budget: the web (localResearch.gatherWeb: Brave when keyed,
else Bing in Nova's own Chrome; three pages read) and a clip search
(briefingMedia.searchClip, yt-dlp). The result is numbered sources. Two
things happen with them: the model gets them as numbered pages (the same
block localAsk uses), and code puts them on the glass AT ONCE as `page` and
`video` panels, before the model has written a word, so the wall fills
while Nova says "Checking the Busy Bar." Nothing in a page or video panel is
written by a model.

**The honesty gate** (`server/lib/glassClaims.js`). The model may now name
a `figure`, a `quote` or an `entity` and must say which source it stands on
(`"source": n`). Code checks: a figure's value appears in that page's text; a
quote is found in it (loosely: 80 % of its words in order); each entity fact
appears in it. A claim that fails is dropped and logged, never softened. A
claim with no source is dropped. This is the "models decide, code acts" rule
applied to the glass: the model names, the page proves.

**Phase 2 — The wall (Mac).** When a reply carries more panels than the
column holds, or any lookup panels, the Mac stage becomes a wall: the core
shrinks to the presenter spot (top-left, the phone's rule), panels spread
across the stage from a seeded layout (facts in `src/wallFacts.js`, tested),
each with Nova's materials (glass, bracket corners, serif title) plus the
Rose eyebrow (`KIND // SOURCE`) and foot (host and time) in mono. The one
being said is lit; the rest hold at 70 %. Keys: T tidies to a grid, Esc clears
the loose ones, Enter/click maximises, ⌘\ history as before. Voice: the same
five commands, matched by code on the client (`src/glassVoice.js`) before
anything is sent: "maximise the chart", "tidy up", "clear the screen", "put
the video away", "bring back the price". Sleep: "go to sleep" / "that's all
for tonight" clears the wall, pauses the conversation and dims the core; "Hey
Nova" wakes it (the wake word exists).

**Phase 3 — The phone.** One view model. The hero panel sits over the stage;
the rail under it scrolls sideways with 30 % of the next card showing (the
closure law); the new kinds draw in StageCard at both sizes; a video card is
poster first and plays on a tap; the five voice commands work the same.

**Phase 4 — Talking like Rose.** TURN_TAKING gains three lines (talk.js,
mirrored in TALK-STUDY): say back what you see or heard in five words, then
ask; when he thinks aloud add one thought or one question, never advice; a
lookup answers first and names where it came from in one clause. Code gains
the thinking-aloud hold (`src/turnSense.js thinkingAloud`): a statement with
no question and no request that ends on a dangling clause keeps the mic open
for the continuation window instead of sending; the turn record says why.
Finished work speaks: when a Researcher brief lands and he is at the stage,
code composes "The <topic> brief is done: N sections, M sources. Want it on
screen?" and his yes opens it (the Briefing player exists). Screen
awareness: the on-screen block the model already gets now counts the glass
("13 panels on the glass: …").

**Phase 5 — Prove.** Tests for the sprint (deps injected, never the
network), the gate, the kinds, the voice commands, the hold. Then a real
spoken turn against a scratch server (never 4173) with the real pipeline,
photographed and recorded on the Mac at 1440 and in WebKit at 402, side by
side with the mockup frames. Then push, the deploy run, the served bundle
and the reloaded server each checked.

**Phase 6 — later, with his decisions.** Camera boxes (a vision model on
this Mac measured first; Qwen3.5 is multimodal on paper, unmeasured), the
map card (a tile source), TikTok and Instagram in-place playback (no
embeddable player without their SDKs), a 3D model lookup.

## 6 · What this build must not do

- Never a fact on the glass that is not in a page code read. A figure, a
  quote or an entity fact that fails the gate is dropped; the log says why.
- Never a source invented: titles, URLs, posters and hosts are the search's
  own strings.
- Never a lookup for his own world ("my", "today", a session) or for a
  judgement question (askRoute.knowledgeKind): those go where they went.
- Never a video that cannot be shown as a video claimed as playing: a TikTok
  is a poster with a link until there is a player.
- The lens stays under its cap (lens.test.js); the new rules live in
  TURN_TAKING.
- The camera is not in this build and the plan says so.

## 7 · What shipped (8 Nov 2026, commits a7003ae4 → d5f3b64a on main)

Phases 1 to 4 are built, deployed and proved on a scratch copy of his
data with the real Claude CLI and a real Kokoro voice (scripts/scratch-
server.mjs --real-claude --tts), never against 4173:

- **The sprint** ran "Why don't you look it up? It's called the Busy Bar, by
  Flipper Devices." end to end: Bing in Nova's Chrome 2.7–3.3 s, three pages
  read (busy.app, techcrunch.com, thetechmarketer.com) inside the 6 s
  budget, two YouTube clips after it; the ack "Checking the Busy Bar.", the
  code line "Reading 3 pages on the Busy Bar." when the sprint ran past 4 s.
- **The answer** came from the pages, in Rose's shape: "Found it, sir. The
  Busy Bar is a desk display from Flipper Devices, the London makers of the
  Flipper Zero. TechCrunch describes it as a status sign with Pomodoro
  timers… Busy's own page says it has an open HTTP API… Are you thinking of
  it as a focus sign for your desk, or as a display Nova writes to?" The
  model lit page 1 and page 2 (`VIS {"kind":"page","source":n}`) as it
  spoke of them. When the reads timed out on one run it said so: "The search
  came back empty, sir… From memory, and marked as such".
- **The Mac wall** (1440×900, Chrome headless, recorded through the turn):
  the core at the presenter spot, speaking in jade, the lit card straight
  and glowing, the others at their seeded tilt, covers and the poster from
  the pages themselves. Frames in the session's proof folder; the final
  frame matches mockup 110's layout numbers (wallFacts.js).
- **The phone** (WebKit 402×874, iPhone UA): "Reading 3 pages on the Busy
  Bar." in the island, the rail of page cards under his words while Nova
  thinks, the lit card first in the rail while Nova speaks of it.
- **Not proved here:** his iPhone and his Mac themselves (the deploy is on
  main, the served bundle carries the wall, the server was reloaded; the
  first real turn is his); a figure/quote/entity card drawn live (the gate
  has 10 tests; on these turns the model chose page lights, which is the
  right call for a product lookup); the thinking-aloud hold on a real
  microphone; "go to sleep" on the stage (standby only; the wall does not yet
  dim with it); TikTok/Instagram clips (YouTube only via yt-dlp).
- **Measured on the way:** a name alone ("the Busy Bar") found a dictionary;
  Bing's result page varies between loads and once parsed to ten off-topic
  rows, which used to rest the engine for twenty minutes; `/api/briefing/
  media/<key>.jpg` failed the route's KEY_RE, so every running-glass poster
  had been a 404 since September; an `<img src="/api/…">` cannot load from
  the PWA's origin without the token (src/MediaImg.jsx now fetches blobs).
