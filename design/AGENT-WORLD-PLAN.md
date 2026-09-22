# The Agent World — Nova's org as a place you can look at

**Source.** An Instagram reel by Jarren Rocks (`jarrenrocks`, 29 Aug 2026,
https://www.instagram.com/reel/DcnKaQaPHTw/), watched frame by frame on
22 Sep 2026. His caption: "After a while, you manage so many AI agents that
you wanted to find some sort of way to abstract them." A survey of his other
recent videos is at the foot of this document.

**His ask, 22 Sep.** Watch it, take what is worth taking, plan what would be
useful and why, and how to fit it into Nova. Fun and purely aesthetic ideas
are welcome too.

Nothing here is built. This is the design and the argument; the build order
needs his go.

---

## 1 · What the reel actually shows

Sixty-eight seconds, one continuous screen recording of a desktop game, with
his narration. Frame by frame:

| t | Seen | Said |
|---|---|---|
| 0:00–0:09 | Talking head, caption "A video game for AI agents" | "I built a video game to manage my AI agents so I can watch them all on a planet, and click on the ones that are like *hey, I have something to do, can you help me please, I'm blocked*." |
| 0:10–0:20 | An isometric planet surface tiled with **hexagons**, each hex outlined in its own colour and labelled with a project name (`personal site`, `emra-app-builder`, `random`, `Vibrogen`). Small domed buildings, antennas, crates on each hex. Dozens of tiny white figures standing about. A rocket on a pad at the edge. | "Each little hexagon is a part of a project. I can move the whole thing around. Sixty agents in here right now, 78 total." |
| 0:20–0:30 | A **blue speech-bubble marker floats and bobs above one hex**. Clicking it opens a small dark card (title, two lines of status, an orange **Open** button and an **Archive** button). | "My personal site has some work going on, so I click on it and it says *hey, I need some help*. When I click on it it just opens Claude Code, because that's the easiest way to manage the conversation. This is the high-level overview." |
| 0:34–0:40 | Camera dives to one figure: a rounded white astronaut with a black visor and two glowing cyan eyes, one arm raised. | "I gotta mark this guy. Maybe mark him red, maybe I have to add a capability for that. But they're so cute, look at him — hey buddy. I made them have faces." |
| 0:45–0:48 | Wide view; the rocket/station at the edge of the tiles. | "The more projects I add, they walk out of the space station." |
| 0:50–1:00 | The same map on a **grey Moon**, then a **red Mars**, then a **green terraformed planet**. Same tiles, same agents, different world. | "I can go on different planets. Here's the Moon, maybe makes more sense but not as good looking. Mars, if we want to get out there. I like to imagine we've terraformed a new planet." |
| 1:02–1:08 | Close on one hex: a **green hammer-in-a-bubble** icon above a figure at a workbench; a card "Video recut project" with Open / Archive. | "This guy, he's working — look at him, he's recutting a video right now, he's a little editor. You go, you go little guy." |

What he built, stripped of the game skin, is five things:

1. **A spatial overview.** All concurrent agent work on one surface, grouped
   by project. One glance answers "what is going on".
2. **Attention routed by position.** The thing that needs him is a marker
   hanging in space over the place it belongs to. He does not read a list;
   he sees where the bubble is.
3. **A launcher, not a replacement.** Tap the marker, get a three-line card,
   press Open, land in the real tool. The overview never tries to be the
   conversation.
4. **Characters.** The agents have faces, poses and a job icon while they
   work. He talks to them ("you go little guy"). That is the entire reason
   the reel has 21,000 likes; the information design alone would not.
5. **Growth and mood as scenery.** More projects means more figures walk out
   of the station; the planet can be swapped for another. Neither carries
   information he needs, and both are why he keeps opening it.

## 2 · What Nova already has, and where it falls short of this

Nova is not short of agents to look at. `KIND_AGENT` in
`server/lib/fleetContext.js` names some thirty-five kinds; `AGENT_DEPARTMENTS`
in `server/lib/ops.js` files the scheduled ones under seven departments
(Logistics, Mind, Train, Platform, Fuel, Money, Knowledge). A plan run puts
three to twelve workers on one request at once. The Builder makes whole
projects in `~/Nova Projects`. The overnight queue runs briefs while he
sleeps.

What Nova has for *looking* at all that:

- **Ops (screen XIV)** — a ring of dots around the core, one per scheduled
  agent, glow for "ran today", amber for "gone quiet", hollow for "never".
  A gold banner with the pending count. A receipts stream. Honest, and
  exactly what §2b rule 7 now forbids: a diagram of dots is a plain box
  with a different shape.
- **The plan card** in the chat and Inbox — text, with a "waiting on you"
  state on Home when a run pauses.
- **The Inbox** — where every proposal, paused plan, Coach question and
  report lands. His standing complaint (21 Sep): proactive things are buried
  there.
- **Ambient wall mode** — clock, core, four tiles, the pulse strip. Presence,
  but nothing of the org is in it.
- **The Galaxy** — his memory as stars, a 2D canvas. The vault, not the
  agents.

So the gap is precise. Nova can say what every agent did (receipts) and
whether each is alive (heartbeats). It cannot show him, in one look, **who is
working right now, who is waiting on him, and where**. And nothing in Nova
makes the org feel like a place with people in it, which is the thing the
reel does that Ops does not, and the thing his 22 Sep instruction ("Jarvis,
dynamic, everything presented visually") is asking for.

## 3 · The proposal: the Org Map

One scene, built once, shown at three sizes, fed by one view model from
data Nova already keeps. Working name **the Org Map**; the reel's word
"planet" is also fine and he can choose.

### 3a · The geography is the org chart

Seven hex districts, one per department, arranged around the core. This is
`AGENT_DEPARTMENTS` drawn, so it is the same org chart
`design/ORG-CONVERSATION-PLAN.md` describes (Nova as CEO, the agents as
department heads). Each district wears its department's hue, and that hue
is a token, reused wherever that department speaks. Colour means
something: Train's district is Train's colour everywhere, the way each
muscle owns its hue.

Two districts are not departments and deserve their own tiles because they
are where things get *made*: **Projects** (one small tile per folder in
`~/Nova Projects`, the Builder standing on the one it is building) and the
**Overnight queue** (the pad on the edge, where queued briefs wait for
03:30). The rocket in the reel is a decoration; Nova's pad would be real.

### 3b · The figures are the agents, and they only do what they are doing

One figure per agent kind that has a heartbeat or a record in the last 48
hours, standing on its department's tile. Each state is read off data that
already exists, never invented:

| State | Source | How it looks |
|---|---|---|
| Working now | a job file in `running`, a plan step `running`, a research worker in flight (the same signals `valsOps.js` already reads) | lit, a job glyph in a bubble above it (a page for the Researcher, a hammer for the Builder, a barbell for the Coach), a light passing over the tile |
| **Waiting on him** | a pending record of that agent's kind; a plan `pausedOn` a step (the researcher's `route:'continue'`); a Coach turn that asked "why" and is waiting | the reel's move exactly: a marker bobbing above the figure in the accent, the count in it |
| Ran today / recent / quiet / never | the heartbeat states Ops already computes | bright / normal / dim amber / hollow outline |
| Trusted | the autonomy ledger's current mode per capability (`autonomyLedger.js`) | the tile's building is finished and lit for act-alone capabilities, scaffolding for review-gated ones. The trust ladder made visible without a single word |

At rest, nothing moves. An idle org that mills about is fiction, and the
Shelf's rule applies: a frame is drawn only while something is working,
damping, or under the pointer. `prefers-reduced-motion` turns the bobbing
marker into a static one and the passing light into a held glow.

### 3c · The marker is the front door, and it opens onto the conversation

Tap a marker. A glass card rises with the record's TL;DR (`src/tldr.js`,
already code-derived), a light tick and cross (rule 8: decisions are a
conversation, not a button per idea), and **Talk**. Talk opens the one
conversation with that agent pre-selected, which is the agent switch the
org-conversation plan needs anyway. The reel's "Open launches Claude Code"
becomes "Talk hands you to the Coach mid-thought", and for the Builder's
tile it literally opens the Claude Code screen on that project. A tap on a
working figure shows what it is doing and its last receipt; a tap on a quiet
one says how long it has been quiet and lets him run it.

This is the useful half: **his Inbox, arranged by who is asking**, on a
surface he will look at for its own sake. It is the second of the two
channels for proactive suggestions he asked for on 21 Sep (the TL;DR was the
first).

### 3d · Three sizes, one view model

- **Home** — a tile in both idioms (`MissionStructured` on his phone and the
  classic fold, one view model in `vals/`), rendered small and still: the map
  with markers only. Its headline is the count of markers ("Two things
  waiting on you: the Coach and a plan") in the serif news line. Tap to open
  the full map. This is the one he sees daily.
- **Ops** — the full interactive map replaces the ring of dots. The human
  gate banner, the channels and connections columns, the receipts stream all
  stay; they were never the problem.
- **Ambient** — the map fills the wall, slow camera drift, markers visible
  across a room. When the phone is propped on the desk, the org is alive on
  it. Rule 5 of the reel (delight) lives here.

### 3e · How it is drawn

three.js, low-poly, with `Shelf3D.jsx`'s conventions verbatim: the one
renderer style (ACES, sRGB, PCF soft shadows, a PMREM room), render on
demand with a dev frame counter to prove idle costs zero frames, colours
read as tokens off the mount element so the four themes and Calm recolour
the world for free. Hex tiles are one shared geometry with per-instance
colour; figures are a handful of primitives (the reel's astronaut is a
capsule, a sphere and two emissive dots, and that is enough). The camera
eases to a tapped tile the way the Jarvis report plan eases to a muscle,
so this and the spoken report share a camera tween.

Why 3D rather than a 2D canvas like the Galaxy: the camera move is the
Jarvis gesture, the tokenised lighting is what makes it feel like Nova's
material rather than a game, and the pipeline (lazy named-export screen,
`requestAnimationFrame` only while dirty, texture windowing) has already
been paid for twice. A 2D fallback is the honest answer for a WebGL context
loss: the same view model rendered as the marker list.

### 3f · What is deliberately not taken

- **Faces — DECIDED, 23 Sep, his call: FACES, in 3D, and each agent
  unique to its personality and function.** The forms-only register is
  dropped. The flat mockup (`48-org-map.html`) stands only as a very simple
  draft of the map's geography; the characters are the design, and they
  are designed in 3D from the start. The character brief is §3g below.
  Not cute for its own sake: the shared DNA is a small luminous being with
  a visor face (two lit eyes are the reel's whole charm and the thing he
  responded to); what makes each one *itself* is one silhouette element
  drawn from its job, its posture, and its department's hue.
- **A hex per project.** His work is not projects, it is his life. The
  departments are the true grouping; projects are one district.
- **Archive.** Nothing on the map writes. Tick and cross ride the existing
  approve and discard endpoints, which are undoable. Everything else is a
  read.
- **Sound.** None, unless asked.

### 3g · The character brief (23 Sep)

One body language, nine beings. Shared DNA: a rounded head with a dark
visor and two lit eyes (the eyes carry state: steady = working, blinking
slow = waiting on him, dim = quiet, unlit = never run), a capsule body in
the department's hue with a brighter core, no mouth, no hands unless the
job needs them. Height ≈ 1.4 tile-widths so a pose reads on a phone.
Each then owns ONE silhouette element and ONE posture that says its job
before its label does:

| Agent | Department · hue | Silhouette element | Posture / tell |
|---|---|---|---|
| **Commander** | Logistics · cyan | a compass-rose crest on the head, a slim antenna | stands tallest, one arm raised pointing ahead; turns to face the newest thing |
| **Coach** | Train · chest coral | broad shoulders, forearm bands, carries a bar of light across the shoulders | feet planted wide; working = the bar lifts; waiting = the bar rests on the ground |
| **CFO** | Money · good-green | a squarer ledger body, a coin-slot line across the visor | arms folded; a small stack of glowing chips beside it grows with the month's receipts (real count) |
| **Guardian** | Platform · violet | a shield-shaped torso, a steady lantern held low | never moves; the lantern brightens when a backup lands, dims to amber when a loop goes quiet |
| **Researcher** | Knowledge · quads blue | one large lens-visor instead of two eyes, a page drifting beside it | leans forward; working = the page turns; paused at budget = the page hangs half-turned (the "waiting on you" marker above) |
| **Watcher** | Knowledge · calves ice-blue | a wide cinematic visor (letterbox eyes) | sits; working = a thin light plays across the visor like a screen |
| **Librarian** | Knowledge · back teal | a body made of stacked spines, one drawer open | tidies: working = the drawer slides, a spine lights |
| **Meal Prep / Food Scout** | Fuel · shoulders amber | a rounded pot-shaped body, a warm glow at the base | steam-like light rises while a suggestion is cooking |
| **Leader** | Mind · magenta | a mirror-finish visor that reflects the tile | still, listening; the visor brightens when he answers a follow-up |

Not on the sheet: the deterministic loops (dispatch, review, compost, the
trust ladder). They are the buildings, not the people — a lit window in the
department's tile when one ran today, following the state table in §3b.

Materials and motion follow `Shelf3D.jsx`'s conventions: one renderer
style, tokens read off the mount so themes recolour them, render on
demand, no idle motion (an idle being blinks once in a while and no more),
`prefers-reduced-motion` = no blinking, no bar lifting, still poses.

Build order for the characters: a **3D character sheet first**
(`design/mockups/49-agent-characters.html`, three.js, nine figures on a
turntable, tap to focus, each shown in its working and waiting pose) for
his reaction, then the map (§3e) with the same figures placed.

## 4 · The fun and the purely aesthetic, kept separate and labelled

He asked for these explicitly, so they are here on their own terms, marked
as such so nobody later mistakes them for information design.

- **Worlds (aesthetic).** The reel's Moon / Mars / terraformed swap. Nova
  already has four themes and Calm; because the scene reads tokens, each
  theme is already a different world. Add the time of day: the scene's key
  light tracks his actual day, and `MissionStructured`'s morning / day /
  evening `ORDERS` already know which it is. Dawn on the map at 06:00, a
  low gold sun in the evening. Cost: a few hours.
- **Population (fun).** The reel's "they walk out of the station" as
  Nova's earned-autonomy moment: when the trust ladder promotes a capability
  and he ratifies it, that agent's scaffolding finishes into a building, on
  the spot, once, and never on a page load. A change acted out (rule 7),
  from a real event.
- **A greeting (fun).** Tap an idle figure and it turns to face the camera;
  its last receipt is what it says. That is the reel's "hey buddy" without
  the face.
- **The overnight pad (fun, and real).** Queued briefs sit on the pad
  through the evening; at 03:30 the pad lights. In the morning the map
  shows where the night's work landed before he reads the dispatch.
- **Weather (aesthetic, doubtful).** Dust or aurora tied to nothing. Listed
  because it is the kind of thing that makes a scene beautiful, and marked
  doubtful because it would be scenery pretending to mean something. Only
  if he wants it and only if it is clearly ornament.

## 5 · Doctrine check

- **Deterministic first.** No model anywhere. The view model is heartbeats,
  job files, plan records, pending records and the ledger, composed in
  `server/lib/ops.js` next to `composeOps`.
- **Honest degradation.** No heartbeat file: the map draws the districts
  empty and says so. WebGL lost: the marker list. A kind not in
  `AGENT_DEPARTMENTS` stands on an "unfiled" tile at the edge rather than
  being hidden, the same rule that put five missing kinds into
  `KIND_AGENT`.
- **Everything writeable is undoable.** Tick and cross are the Inbox's own
  approve and discard. The map adds no write path.
- **Shared formats are contracts.** `AGENT_DEPARTMENTS` is already
  cross-checked against the skills registry seed by the ops test; the map
  reads it, never a copy.
- **Both idioms, house objects, tokens, 375px, entrance motion.** §2b rules
  1 to 6 apply to the Home tile and the cards. The scene itself is the
  entrance.

## 6 · Build order and cost

His go is needed for the sequence, and per the Jarvis rule a **mockup comes
first**. Estimates are sessions, not promises.

| Step | What | Cost |
|---|---|---|
| 0 | **Mockup.** A static artifact of the Ops map at phone size, in both a dark theme and Calm, with two markers and one worker lit. He reacts before any code. **Done 23 Sep** (a Sonnet agent, two passes): `design/mockups/48-org-map.html`, published at https://claude.ai/artifact/NjfRaXzw5VY2yeZELJfKnD — the same map twice, agents as luminous forms and as faced characters, each with a detail inset of the Coach at 4×, Dark/Calm and reduced-motion toggles. Its own weakest point: Platform and Money touch at one seam. His call on the register is open. | ½ session |
| A | **The view model.** `orgMap()` in `ops.js`: districts, figures, states, markers, all from existing data; a regression test that pins every `KIND_AGENT` to a district or the "unfiled" tile; the markers as a `/api/ops` slice. | ½ session |
| B | **The marker list on Home**, both idioms, from step A's model. No 3D yet. This alone answers "what is waiting on me and who is asking" and is worth shipping on its own. | ½ session |
| C | **The scene** in `src/orgmap/`, on Ops, with the tap card and Talk. The largest piece. | 2 sessions |
| D | **Home tile and Ambient**, time-of-day light, the promotion animation. | 1 session |
| E | The fun list, as he picks. | ½ session each |

Where it sits against the queue: the aesthetic review's sessions A–F are
ahead of it and Session B of that review (fold rows become instruments) is
where the Home tile would land anyway. The org-conversation plan needs an
agent switch; this map's Talk is that switch given a place. So the honest
sequencing is: aesthetic review A → this step 0 mockup alongside → B and C
of this plan as the visual half of the org build.

## 7 · What could go wrong

- **It becomes scenery.** The test is the reel's own: can he find the thing
  that needs him faster on the map than in the Inbox? If not, the markers
  are wrong, not the idea. Measure it the way produce-vs-keep was measured:
  count marker taps that lead to a decision.
- **Phone performance.** A three.js scene on Home on a 120Hz phone is the
  P7/P8 lever the UI-performance memory deferred. The Home tile must be a
  single still frame drawn on demand, never a live loop; the live loop is
  Ops and Ambient only.
- **The dot problem returns.** Thirty-five kinds on seven tiles is a crowd
  in which no one is visible. Figures for kinds active in the last 48 hours
  only; the rest are the tile's population count in its label.
- **Invented liveliness.** Any motion not backed by a state change is
  fiction. The frame counter in dev is the regression test for this.

## 8 · The survey of his other videos, and what it changes

Instagram's reel listing is login-walled, so an Opus agent watched the same
material long-form on his YouTube channel (`@JarrenRocks`): six videos from
June to September 2026, about 300 frames, plus the README of the game
itself, which is public: **Bot Crossing** (`Station-Sciences/bot-crossing`,
MIT; on screen it is called Cosmo Builder). The long cut of the reel is
"I built a video game for my AI agents" (1 Sep, 13 min); the others are
devlogs of Emra, his "personal software" workspace. Working files are in
this session's scratchpad only; nothing binary is checked in.

What the long cut shows that the reel does not:

- **A badge only where it means "you".** Bot Crossing's state table is
  strict: Errored `!`, Running `⚒`, Merged `✓`, Awaiting input `?`, and
  **Dormant and Idle carry no badge at all**. Only a state that needs the
  user earns a marker; everything else is posture. Section 3b above
  already leans this way; this makes it a rule: on the Org Map the
  *only* floating marker is "waiting on him". Working is a glyph and a
  passing light, quiet is dimness, and neither floats.
- **`N` jumps to the next thing that needs you** and flies the camera to
  it. Nova's version needs no 3D: a "next" affordance on Home and in the
  Inbox that moves him to the one blocked decision rather than a list to
  scan. Cheap, and worth doing in step B before any scene exists.
- **State is posture and face, never a chip.** Errored bots slump with red
  eyes and a stuttering fault light; dormant ones sit and emit z-bubbles;
  a merged PR jumps with confetti. This is rule 7 applied to agents. Nova
  should take the *posture vocabulary* (working, waiting, asleep, faulted,
  succeeded) and leave the faces, per §3f.
- **The card follows the object.** The tap card sits beside the figure and
  tracks it by transform, with three verbs: **Open**, **Viewed**,
  **Archive**. *Viewed* is the interesting one: "I have seen this, no
  action", which is neither approve nor discard. Nova's Inbox has no
  "seen". A read-only `seenAt` on a record, set from the map's card and
  from the Inbox, would let the marker fall without pretending a decision
  was made. It stays a record field, not a new route, so nothing on the
  rails changes shape.
- **The viewer is deliberately not the tool.** He hands the thread back to
  Claude Code because rebuilding chat would be "diminishing returns"; the
  game writes exactly one file (the layout) plus an archive flag. Same
  discipline as §3f and §5: the map is a lens onto the rails, never a
  second write path.
- **Stable spatial memory.** Zones are sticky: a project keeps its footprint
  while its thread count is unchanged, grows contiguously, shrinks by
  releasing the newest tile, and the layout persists across sessions. His
  whole argument for the format ("I'm a spatial person… going to a
  destination") fails if the destination moves. Nova's districts are fixed
  by the department map, so this is mostly free, but the Projects district
  must persist its tile order in `server/data/` rather than re-solve it on
  load.
- **Night makes the colour emit.** By day each zone has a coloured kerb and
  a label; at night the colony goes dark and each zone's buildings glow in
  their own hue. Same data, different channel. For Nova's evening order and
  the dark themes this is the accent as a light source rather than a
  border, which is what the tokenised lighting in §3e buys.
- **A loading state in the world's own voice.** A black screen, the name,
  "Scanning for Colonist Crew Threads…", one thin line. It says what it is
  actually doing. Nova's boot-waiting screen should do the same for the
  map: "reading heartbeats", "reading the ledger", each a real step.
- **Keyboard shortcuts as a default deliverable.** He requests them on every
  small tool and calls them the best quality-of-life addition. Phone-first
  Nova gets little of this, but the Mac Ops view can take `N` (next
  waiting), `0` (reset camera), `L` (time of day).
- **Quality presets as a user control** (Potato to Ultra, with adaptive
  quality). Nova's answer is the Shelf's: render on demand, a tight
  texture window on phones, and a still frame on Home. A user-facing
  preset is not needed if the defaults are honest about the device.

From the Emra devlogs, two things worth lifting that are not about the map:

- **The agent confirms back in the language you complained in.** He types
  three friction points as ordinary sentences; the agent answers "all three
  are fixed" with one bullet per complaint in his words, not diff-speak.
  That is the missing half of rule 8's "decisions are a conversation": when
  he says "make change 2", Nova's receipt should restate change 2 as he
  phrased it. Belongs to the org-conversation build, not this one.
- **The tag galaxy.** His notes graph drawn as space: large glowing orbs per
  tag, sized by weight, small note-spheres orbiting, depth and bloom.
  Nova's Galaxy (screen III) is the same idea as a flat 2D canvas over the
  real vault. Upgrading it to the Shelf's renderer is the most directly
  liftable visual in the whole survey, and purely aesthetic: the stars are
  already real pages with real links, so nothing is invented. Listed in §4
  terms as aesthetic-only, and as a separate future session.

Two practices, not features, that he describes and that cost nothing:
walk your own Home flow every day and screenshot what should improve
(his onboarding method); and judge a plan by whether the outcome landed,
not whether the steps ran (his pipeline: brain dump, tickets, assign,
review, then *assess the outcome*). The second argues for a
plan-completion question ("did this solve it?") that `planProgress` does
not ask today.
