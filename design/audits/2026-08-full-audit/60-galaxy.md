# 60 — Galaxy (Memory Galaxy)

Audited 2026-09-01. Read-only. Files opened: `src/screens/Galaxy.jsx`
(1-39, full), `src/App.jsx:4279-4351` (buildGalaxy/startGalaxy, the full
render loop), `src/vals/valsMisc.js:45-58, 241-264` (stats/legend/click/
open), `server/routes/notes.js:78-115` (the /graph endpoint),
`src/data.js:63-78` (demo constellation). Hayden's benchmark, stated
this turn: it should feel like Obsidian's graph view. Phone-width
carried ([45]).

## 1. What it is (verified)

The whole-vault graph as a starfield: server sends every page as a node
and every resolvable wikilink as a deduped undirected edge
(notes.js:92-115 — clean, honest data). The client scatters nodes on a
random annulus, drifts them on a sine wobble, draws links as faint
lines, colours by note type, and offers click → card → Open (which
correctly deep-links into Notes/Recipes). Demo fallback is DEMO-chipped.

## 2. Why it doesn't feel like Obsidian's graph (verified)

**There is no layout algorithm.** App.jsx:4288-4298: position = random
angle + random radius. Link structure plays no part in where a star
sits. Obsidian's graph is a force simulation — links attract, nodes
repel — so clusters, hubs, and orphans *emerge* and the picture means
something. Galaxy draws real edges between randomly placed points, so
the lines read as decoration crossing the canvas, not structure. This
single fact is the gap Hayden feels; everything below is secondary.

The secondary gaps vs the benchmark:
- **Node size is random** (4296 `r: rnd(...)`), not degree — a hub and
  an orphan look identical. Obsidian sizes by connections.
- **Selection doesn't light neighbours** — the selected star grows
  (4337-4339) but its edges stay at the same faint 0.13 alpha; you
  cannot see what a note links TO, which is the graph's whole question.
- **No zoom, pan, or drag**; labels only when ≤80 nodes (4334), so a
  real vault renders as hundreds of anonymous drifting dots.
- **No filters** — the legend is display-only; Obsidian's tag/path/type
  filters have no counterpart. No local-graph mode from an open note.

## 3. Cons beyond the benchmark (doctrine)

1. **The caption is fiction.** Galaxy.jsx:24 prints "BRIGHTER =
   RECENTLY TOUCHED" — but the render loop encodes no recency anywhere:
   every node draws at alpha 1 with the same shadowBlur 14 (4338-4341);
   only the background dust twinkles. The UI chrome promises a data
   mapping the code never implements — the comment-vs-code drift class,
   in user-facing copy. Honest-degradation violation.
2. **Latent silent cap.** buildGalaxy slices to MAX_NODES 400
   (4286-4287) in listPages order, but the header label counts the FULL
   graph (valsMisc:48 `st.liveGraph.nodes.length`). The demo label
   already says 385 stars — his real vault is near the cap. The day it
   crosses 400, the header claims stars the canvas silently dropped:
   the [silent cap] anti-pattern, armed and waiting.
3. **Per-frame shadowBlur on up to 400 nodes** — the classic canvas
   perf killer, at 60fps, on a phone. (stopGalaxy on leave is correctly
   wired, 1134.)
4. Canvas has no keyboard/screen-reader path (app-wide pattern, noted).

## 4. Pros

- The data layer is exactly right and already Obsidian-shaped: real
  pages, real wikilinks, deduped, id-indexed — the fix is entirely
  client-side presentation.
- Live-refresh nulls gNodes and rebuilds inside the frame loop for a
  seamless swap (4321-4323); demo is chip-labelled; Open deep-links
  work; type colours share NOTE_TYPE_COLOR with Notes (one contract).

## 5. Mission test

**Currently: fails at every cadence** — it's a beautiful screensaver of
his second brain, not a map of it. The mission wants the map: monthly
"what am I actually building knowledge about", weekly "what's orphaned
/ overgrown" (Compost's question, visually). Parallel-rail check:
Obsidian's own graph exists, but Nova owning the phone-reachable,
Nova-aware view (recency, review-due, compost candidates as overlays)
is a legitimate surface — IF it earns it by being a real graph.

## 6. Improvement plan

1. **[Refine — the core]** Seeded force layout AT BUILD TIME: run
   ~150-250 ticks of a simple attract/repel/center simulation inside
   buildGalaxy (400 nodes is trivial for a one-shot O(n²) pass), then
   freeze and keep the existing wobble. Clusters, hubs and fringe
   orphans emerge with zero added per-frame cost. This one change is
   most of the distance to Obsidian. **Impact/effort:** H / M.
2. **[Refine]** Size stars by degree (link count); random radius only
   as jitter. **Impact/effort:** M / L.
3. **[Refine]** Selection lights its edges + neighbours (full-alpha
   lines, dim the rest) — the local-graph question answered in place.
   **Impact/effort:** H / L.
4. **[Refine — honesty]** Either implement the caption (alpha/glow from
   `n.date` recency) or delete it. As-is it lies. **Impact/effort:**
   M / L.
5. **[Refine — honesty]** Cap label tells the truth when it bites:
   "400 OF 523 STARS · …" — or raise the cap with pre-rendered glow
   sprites (fixes con 3 too: draw each colour's glow once offscreen,
   blit instead of per-node shadowBlur). **Impact/effort:** M / M.
6. **[Add]** Pinch-zoom + pan (transform on gPos, labels appear past a
   zoom threshold); tap-drag optional after layout is real.
   **Impact/effort:** M / M.
7. **[Add]** Legend chips become filters (tap a type to dim others) —
   the smallest honest version of Obsidian's filter panel.
   **Impact/effort:** M / L.
8. **[Add — Nova's edge over Obsidian]** Overlay modes: review-due
   concepts pulse; compost candidates (27) tinted; recency as
   brightness (item 4 done right). This is what makes Galaxy worth
   opening INSTEAD of Obsidian's graph rather than alongside it.
   **Impact/effort:** M / M. Gated on 1 landing first.
9. **[Capability gap — named, not planned]** Local-graph mode from an
   open note (Notes reader → "show in galaxy") — after 1+3, this is
   just centering + depth-2 filter. Synthesis decides.

## 7. UI recommendations

This item IS the UI plan (1-8). Dashboard-drift screen: passes — every
change renders data the server already sends; overlay modes (8) reuse
existing signals rather than new panels. Phone-width pass ([45])
matters doubly here: the canvas is the one surface where 375px vs
desktop changes everything.

## 8. Verdict

**Refine** — the first unqualified Refine in fifteen items, and
Hayden's instinct is exactly right: the server already serves an
Obsidian-grade graph; the client draws it as random stars. One build-
time force layout closes most of the gap, and two honesty fixes (the
fictional caption, the armed silent cap) are due regardless.
