# Fluid like the reels (4 Nov 2026)

His ask: two reels (instagram.com/reel/DeoxA_vzRbo "Dashboard V14",
instagram.com/reel/De6ef-Svrlj the "vitrea" glass dashboard). "Nova needs to be
fluid and dynamic to interact with like this ... smooth transition animations
and less clunky or snap-like ... especially when the Mac connection is lacking
or absent."

## What the reels do (watched at 10 frames a second, transitions zoomed)

- The chrome (nav, rail) never moves. Only the content plane changes.
- The page being left dissolves in about 150 ms. It does not vanish.
- The page arriving is built in layers: title resolves out of a blur, then
  panels one after another, each rising a little; numbers count up (3,668 to
  12,480), bars grow, a ring fills, an area chart draws.
- Drill-in (vitrea): the tapped app card becomes the hero banner of its page.
- Theme switch (V14): an organic wipe from the click point.
- vitrea's backdrop moves all the time behind the glass (Nova's sky/orb is
  the decided equivalent; not copied).

## What Nova did (WebKit at iPhone size, Summary style, scratch copy of his data)

Instrument: Playwright WebKit (scratchpad recorder, not committed) through a
proxy that is fine, slow (2.5 s per request) or gone, against
`scripts/scratch-server.mjs` on 4174. Never 4173.

1. **Screen change was a cut.** At 5x slow motion: the old page went in one
   frame (a dark gap), then the whole new page faded in as a single sheet
   (`riseMain`'s opacity on `<main>`), which buried the Summary screens' own
   40 ms stagger. **Fixed on branch `handoff-motion` (src/handoff.js).**
2. **Late data jumps.** On reopen the phone's copy shows at once, then 1 to 2 s
   later live data replaces card text with a height change (Daily review card
   swapped its whole text and pushed the next card down; "Read again" sat on
   "Reading…" for 6 s+ with the Mac slow). Not fixed.
3. **Tap response is fine in every condition.** Pointerdown to first paint
   29 to 167 ms, Mac fine and Mac slow alike. No interaction waited on the Mac.
4. **Mac slow:** header said CONNECTING… for the whole 6 s window; the
   Likely-now rail had not filled when the Fuel step ran.
5. **Mac gone:** every screen drew from the copy, with the offline card in the
   feed. An island toast, "Couldn't check the server for a workout draft — it
   retries when Nova reconnects", rode over the first 3 s of every offline
   reopen (draft protection, deliberate; his call whether it moves into the
   offline card).
6. Things that already meet the bar: a food log rolls every number on the
   plate (0 → 189 kcal), the routine page slides in, the Log toast with Undo.

## Glass rule measured on the way (WebKit, 4 Nov)

An ancestor's `opacity` keeps the liquid glass right. An ancestor's `filter`
(even `blur(0.01px)`) flattens it: the glass stops sampling the sky. So any
blur in motion goes on text-only elements, never on a block holding glass.

## The hand-off, measured

- Frame gaps on a tab change, Mac WebKit: longest 67 to 104 ms before, 36 to
  60 ms after (the React commit; the picture now covers it).
- Six tab taps 60 ms apart, then a back: no stranded picture layer, `<main>`
  opacity restored, last tap wins, no page errors. Same under reduced motion,
  and in cupertino.
- NOT measured: his iPhone (WebKit on the Mac only), his own theme (not on
  record; default used).
