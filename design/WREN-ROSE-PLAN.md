# Wren gets the Rose build — the port plan

**8 Nov 2026, his order:** "after the final design is done, I want the exact
same features, capabilities and view built for the Wren AI in Science Atlas'
Mission Control, but with it focused on educational content, sources,
business, etc as it's built for." Source of the design: design/ROSE-STUDY.md
(the study) and what shipped in Nova 7–8 Nov. Wren's repo is
`~/Projects/atlas-partner`; its surface is the dock injected into Mission
Control (Lab skin), served from the Atlas ops folder. Nova never writes Wren
(lib/protectedRoots.js); this port is a Wren session's work, by hand.

## What Wren already has (surveyed 8 Nov)
- A VIS directive and a `visualBeats.mjs` copied from Nova (kinds: node,
  checklist, graph, draft, capture, route, board, record, key, steps, list);
  panels built by code from Atlas files (`lib/panels.mjs`, GET /api/panel).
  ONE panel at a time (`dock.js` stage/showBeat, `console.html`).
- The turn loop as Nova's: `public/voice.js` (mic, hold, ears), `lib/turnEnd`,
  `turnSense`, `turnFold`, `acks`, `bargeIn`, `interruptTurn`, `standby`.
- No TURN_TAKING block, no thinking-aloud hold, no web lookup outside the
  Claude CLI's own WebSearch in Research mode, no yt-dlp, no browser profile,
  no camera, no map.
- POST /api/ask is ONE SSE stream (mode, ack, sources, delta, final), not a
  job the UI polls. The conversation record has no field for cards.

## The port, in Wren's terms (education, sources, the business)
1. **Lookup sprint** → `lib/lookupSprint.mjs`: the same decision rules
   (his "look it up", a question about the outside world, never his own
   Atlas), search + 3 pages + 2 clips inside 6 s. Search engine: Wren has no
   Chrome profile; use the Brave key once he adds one (shared `~/.atlas`
   config), else a one-turn `claude -p` with only WebSearch allowed as the
   searcher (the CLI returns titles and URLs; code reads the pages itself).
   Sources for Atlas: prefer .edu, curriculum authorities (VCAA, ACARA),
   journals and publishers; a `sourceRank` by host class decides the three
   pages. Publish the cards as a new SSE event `wall` (before `delta`).
2. **Honesty gate** → `lib/glassClaims.mjs` verbatim; the kinds page, video,
   figure, quote, entity, note, map added to `visualBeats.mjs`; the Lab
   prompt (`lib/prompts.mjs`) gets the wall contract with Atlas examples
   (a syllabus clause quoted from VCAA, a figure from ABS, a publisher's
   page). `guards.mjs` must accept `(https://…)` citations when a sprint ran.
3. **The wall** → a Lab stage: `public/wall.js` + `wall.css` on the Lab
   tokens (copper on dark teal; NOT Nova's glass/violet), masonry from a
   `wallFacts.mjs` port (facts differ: Lab's sidebar width, the dock's
   bottom bar), the spoken card lit, T/W/Esc keys, folded words by default.
   Desktop only: the Lab page at ≥ 1024.
4. **The phone rail** → inside the dock's phone sheet, the same cards as a
   rail with 30 % peek; lit card first.
5. **Voice on the glass** → `glassVoice.mjs` port, matched in `voice.js`
   before the ask leaves; receipts spoken by the dock's speaker.
6. **Talking like Rose** → a TURN_TAKING block appended to SYSTEM in
   `prompts.mjs` (the three Rose lines plus Nova's turn rules Wren lacks);
   `turnSense.thinkingAloud` ported and used in `voice.js`'s hold.
7. **Camera and map** → `see.mjs` (Ollama on the same Mac; Wren's local lane
   is OFF by default, so this is opt-in), the phone relay
   (`cameraRelay.mjs`, POST/GET /api/camera/frame), the map kind via
   Nominatim. For Atlas the camera's use is a page of a textbook or a
   student's work held up: "what does this question ask?".
8. **Proof** → tools/stage-shot.mjs extended to the wall; a scratch copy of
   `~/.atlas/wren` and the ops folder, never the live Wren (reload only via
   tools/reload-wren.mjs); Chrome 1440 and WebKit 402 frames beside the
   Lab mockup; tests in `tests/*.test.mjs`.

## Order and size
Phases 1, 2, 5, 6 are ports of pure modules (a day); 3 and 4 are the Lab
design work (a mockup first, his approval, then the build); 7 last. Each
phase ships on its own and is proved before the next.

## Decisions for him before the Lab build
- The wall's look in Lab terms: copper hairlines on the dark teal ground,
  the card eyebrow in Figtree mono? (A mockup will put the choice in front
  of him; Nova's glass is not to be copied, by his own Lab brief.)
- Search engine for Wren: a Brave key shared with Nova, or the Claude CLI
  as the searcher (slower, costs a turn)?

## Status, 8 Nov 2026 (later)
Mockup 112 approved by him ("Looking good for wren"). Phases 1, 2, 5, 6, 3
and 4 built by a delegated session in Wren's repo on branch `wren-wall-rose`
(9 commits, 9606ba1 → 0806705; 859/861 tests, the one failure pre-existing in
ideas.test.mjs), fast-forwarded into `main`. Proof on a scratch Wren
(`tools/wall-scratch.mjs`, port 4197, its own Chrome profile and Kokoro), never
the live service: frames in the Nova session's scratchpad proof5/. Known:
headless Bing still degrades many queries even with the Bing parameters (the
relevance filter says so plainly); the phone proof was Chrome emulating an
iPhone, not WebKit; phase 7 (camera, map) not started. The search key is
`BRAVE_SEARCH_KEY` in the environment or `~/.atlas/.env`. The sidebar squares keep
their icons (his call, 8 Nov). The Brave key is dropped for now (his call:
the free tier asks for a card), so headless Bing stays the search. 8 Nov,
f289bca: Nova parity carried over: a lookup reads six pages and three clips
(ten and four when he asks for depth), and Wren says references, pages,
videos, links, never "the wall".
