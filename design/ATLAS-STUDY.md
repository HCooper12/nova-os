# The Atlas study: a stage that changes with what Nova is doing

**10 Nov 2026.** His brief, with two reels
(https://www.instagram.com/reel/DfK_OOuyXYI/ and
https://www.instagram.com/reel/DfD0sIoh5xo/):

"I love how this looks aesthetically and how it seems to work. I want it
designed for Nova with these capabilities and this kind of dynamic aesthetic
design where the platform just changes across it use and it is more free
flowing dynamic rather than rigid and confined just to the different apps in
sections like it currently is. Especially for the Mac. Notice how the panel
pop ups (similar to Rose) also look dynamic and appear to show multiple
pieces of information at once. This should be what occurs during the morning
briefing and whenever a question is asked that needs to compile research.
I'd like to see multiple panels (no limit as it should be determined
natively by Nova how many to show) depicting the different information,
sources, videos, etc. It's okay if you change the overall design of aspects
of nova to accommodate this if needed."

The product in the reels is called ATLAS, filmed on an ultrawide monitor in
a dark room. Nothing about how it is built is public. Everything below is
read off the frames (360 x 640 source, so panel text is illegible; shapes,
colours, positions and timing are clear) and the audio.

## 1 · The evidence

| Reel | Length | What happens | Lines that matter |
|---|---|---|---|
| DfD0sIoh5xo, the wake briefing | ~68 s | Orb and a large clock, nothing else. "Wake up": the clock goes, the orb rises, and one panel arrives per spoken sentence until about seven are up. "Let's get to work": every panel leaves and a chat thread sits under the orb. | "Good morning. All systems are online. It's 54 degrees and clear … four important meetings … 22 new leads … Ad spend is right on pace … Overnight, I checked every ad account … all 14 active projects" / "Ready when you are." |
| DfK_OOuyXYI, the agent split | 87 s | A resting workspace. "Split up": everything leaves, the orb divides into five coloured lobes, each agent's panels arrive tied to its lobe, three counters tick, a 24-hour ring lines up the day, the lobes fuse and three approval cards rise. | "I'm splitting into five agents, so your calendar, inbox, ad spend, client sites, and a new lead all get worked at the same time … Now, I'm lining up the next 24 hours … Merging back, 47 tasks done and nothing went out without you. Three need your okay." |

## 2 · What the surface does (the behaviours, in order of value to him)

1. **The screen is a stage, and the layout is set by what is being said.**
   There is no sidebar, tab bar or section frame while the assistant holds
   the floor. The one fixed thing is the being. This is the heart of "more
   free flowing dynamic rather than rigid and confined".
2. **One panel per sentence, accumulating.** A panel lands as its sentence
   starts and stays. By the end the whole briefing is on screen at once, so
   he can look back at anything while the voice moves on.
3. **Panel count and size follow the content.** Seven in the briefing, five
   groups in the split. A single number is a small tile; fourteen projects
   are a wide two-column panel. Nothing is forced into equal cells.
4. **Free placement around the being.** No grid. Panels sit in the open
   space nearest the orb, the outer ones turned a few degrees inward.
5. **A mode change clears the stage in one move.** Everything leaves
   together, the being changes shape, the next set arrives.
6. **Agents are visible as parts of the one being.** The orb divides, each
   lobe has its own hue and label, and a thin line ties every panel to the
   agent that made it. Merging back is the same move in reverse.
7. **Work ends in approvals.** "Nothing went out without you": the merge
   lands on a short row of cards that need his word.

## 3 · The panel grammar (read off the frames)

- Dark translucent body, hairline cool border, small radius.
- A tiny coloured tag and a mono eyebrow top-left.
- One large condensed numeral or one form (ring, bars, area chart, trace).
- **One accent hue per panel, and the hue means something**: green money
  and healthy, amber spend, magenta calendar, red fault.
- Arrives by fading and scaling up from the orb's direction; all leave
  together.

Nova already has most of this from the Rose round (the eyebrow, the lit
panel, real-or-absent content). What is new is items 1 to 6 above.

## 4 · Nova's gaps, by locator

| Gap | Where |
|---|---|
| The Mac stage keeps a fixed frame of sections; the rail only fades | `src/NovaMac.jsx`, `src/novaMacFacts.js` (`RAIL_ROOM`) |
| A hard cap on panels, against his "no limit" | `src/wallFacts.js` `WALL_MAX = 16` |
| The scatter overlaps from nine cards at 1440 x 900 (8 Nov handoff) | `src/wallFacts.js` `scatterLayout` (seeded walk, least-overlap fallback) |
| Placement ignores the core, so panels are not "around" Nova | same; the core sits in a presenter corner |
| The morning briefing shows one card per beat, replaced by the next | `server/lib/morningShow.js` `composeShow` steps `{say, card?, panel?}`; the client plays one at a time |
| Agents at work are satellites with a label, with no tie to what each made | `src/NovaMac.jsx` satellites; `src/agentWorld/beings.js` `BEING_HUES` holds the hues |
| A mode change swaps content in place, with no clear-and-arrive | `src/screens/NovaThread.jsx` |
| The phone has the rail but no "everything from this briefing" count | `src/NovaStage.jsx`, `RAIL_PEEK` |

## 5 · The design for Nova (mockup 113)

Nova keeps his own face and materials: the filament core, liquid glass, the
violet and cyan accents, the serif spoken line, the provenance eyebrow.
What changes is the stage.

- **Rest.** The core, the time, the composer. The page rail is present and
  quiet. Nothing else.
- **When Nova holds the floor**, the rail leaves and the whole window is
  his. The core moves to the centre and shrinks; his sentence is under it.
- **Panels land per sentence, placed by rule, uncapped.** Each new panel
  takes the free spot nearest the core that overlaps nothing, with the two
  sides kept in balance. When there is no free spot, the oldest unlit
  panel folds into an "Earlier" stack beside the composer, which counts
  them and opens them all. The number shown is whatever Nova produced.
- **Sized by kind.** A figure is small, a session or a video is large.
- **Lit and tethered.** The panel being spoken about is lit and joined to
  the core by one line. The rest hold, dimmer, turned slightly inward.
- **The morning briefing** is the real `composeShow` beats: week, fuel,
  body, today's session, the day, worth keeping in mind, overnight drafts,
  waiting on you. All stay up.
- **A research answer** brings the answer figure, pages, videos, a quote,
  a chart, the source list, what the pages do not hold, and a proposed
  change.
- **Agents at work.** Nova stays in the middle as the one in charge; the
  agents he put to work appear around him in their own `BEING_HUES`. Each
  panel is tethered to the agent that made it. Three counts sit under the
  cluster: done, working, needs your word. The day ahead is a ring with the
  jobs at their hours. Merging ends on approval cards: a tick, a cross,
  "Do all", or just say it, with Undo.
- **The phone** performs the same from the same view model: the lit panel
  as the hero, the rest in the rail with a third of the next card showing,
  and a count.

## 6 · The plan (phased; each phase ships on its own, after he approves 113)

1. **The placement rule.** `stageLayout` in `src/wallFacts.js` beside
   `scatterLayout`: nearest free spot to the core, side balance, fold the
   oldest when full. Pure, tested in `server/test/wallFacts.test.js`.
   `WALL_MAX` goes; the Earlier stack replaces it.
2. **The stage on the Mac.** `NovaMac.jsx` takes the whole window while
   Nova speaks; core to centre; clear-and-arrive on a mode change.
3. **The briefing accumulates.** The client keeps every beat's panel up;
   `composeShow` is unchanged except where a beat has no form yet.
4. **Research answers** use the same stage (the Rose lookup already
   produces the cards).
5. **Agents at work.** Real jobs only: lobes from the jobs running, panels
   from what each filed, counts from the inbox rails.
6. **The phone and Wren.** The rail count on the phone; port the stage to
   Wren's Lab design once Nova's is proved.

## 7 · What this build must not do

- **Show anything that is not real.** A panel exists because a beat or a
  lookup produced it. Counts come from records. No weather tile unless a
  weather source is connected. No "all systems online" line that code did
  not check.
- **Cap the panels**, or pad them to fill the screen.
- **Strip Nova's materials** for the reel's look. Nova's core stays Nova's.
- **Show agents that are not working.** A lobe is a running job.
- **Send anything without his word.** The merge ends in approvals on the
  inbox rails, every one undoable.
- **Take the pages away.** Train, Fuel and the rest stay one tap from rest.
- **Animate layout properties**, or run without a reduced-motion form.
- **Let Nova say "the glass", "the HUD" or "the wall".**

## 8 · Status

10 Nov 2026: study written; mockup `design/mockups/113-living-stage.html`
drawn for his approval. Nothing is built. The build starts only after he
approves the mockup, and is then proved against it frame for frame on his
live settings.
