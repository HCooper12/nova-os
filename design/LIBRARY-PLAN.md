# The Library Plan — a shelf of real objects

**Source.** A 35-second reel he sent 17 Sep 2026
(`instagram.com/reel/DbWcqGWgQQ3`, Kabarza | Developer & Designer). Watched in
full: 40 frames at one per second, Whisper transcript. His instruction with it:

> "This is the level of quality and aesthetic detail that I want Nova to
> improve to reach… functional interactions, the colours and subtle effects
> like the glow and shine. The 3D models look beautiful and this is the
> minimum level of quality that must be achieved moving forward."

The reel shows two products, and the creator's own words separate them:

| t | what is on screen | product |
| --- | --- | --- |
| 0:00–0:04 | a stack of hardbacks lying flat, each a true 3D box, drifting past the camera as he scrolls; dust motes float in the dark; each spine reads author · title · publisher mark | **Stripe Press** (`press.stripe.com`) |
| 0:04–0:10 | one book pulled out and tumbling on all three axes under a soft key light; then it settles beside its editorial panel ("Living cover" toggle, description, three purchase rows, Author) | Stripe Press, book page |
| 0:10–0:19 | a warm cream room; ~19 clothbound volumes standing on a walnut shelf, spines tilted a few degrees each; the selected one pulls forward and the page shows its cover and title | **The Complete Shelf** (`play.mint.gg/complete-shelf`, open source) |
| 0:19–0:22 | a second book on Stripe Press being opened (cut to black, "Return to shelf") | Stripe Press |
| 0:23–0:34 | the "shine": *The Revolt of the Public* in electric blue and magenta — the WHOLE PAGE re-tints to the book's palette, the title and every control take the accent, the cover catches a moving specular highlight as it turns | Stripe Press |

Transcript, in full, because it names the bar: *"I want to create something
like this for a client of mine who also sells books, but I find it always
difficult to start from scratch, especially for something this complex. So I
found this open-source version that gets me a really good starting point. It's
not exactly the same, but you can imagine getting it here is not too
difficult. The only thing I really need to add is this type of shine that is
really, really beautiful."*

So the bar has two halves and the creator ranks them: the open-source shelf is
the **starting point**, and the Stripe **shine** (page-tinting, foil, moving
specular, dust) is the part that makes it beautiful. This plan is built the
same way, and it starts from the same open-source shelf — cloned and read this
session, locators below.

Reference frames and the current-state screenshots are filed at
`design/audits/library-2026-09-17/`.

---

## The finding that changes the job

**His library is not a bookshelf.** Read from the live server this session,
`GET /api/library` against his real vault:

| kind | count | has real art (jacket or poster) |
| --- | --- | --- |
| video | 17 | 14 |
| article | 3 | 0 |
| book | 1 | 1 |

Twenty-one sources, one book. The reel's beauty comes from *house-designed
covers* — Stripe Press designs every jacket; the Complete Shelf paints every
cloth board procedurally. Nova's shelf today wraps 16:9 YouTube thumbnails onto
2:3 covers and 30-pixel spines, and the spines view (screenshot
`now-spines-375.jpg`) shows exactly what that does: a spine that reads
*"'Eve IS W"* in Sinek's orange, a screaming face sliced into a strip. That is
not a shelf of objects; it is a strip of cropped images.

So the first decision is not a rendering decision. It is: **what IS a video on
a shelf?** The answer this plan takes (his to overturn, see Decisions):

> Every source on the shelf is a **Nova edition** — the bound volume of what
> Nova holds on it. Nova wrote the dossier; Nova designs the binding. A book's
> real jacket is tipped onto its front board. A video's poster is a *plate*
> set into a cloth cover with a margin, never stretched. An article is a
> slimmer, paper-bound volume. The spine is always Nova's typography: title
> up the spine, author or channel at the foot, the kind glyph as the
> publisher's mark.

That gives the shelf the one thing Stripe Press has and Nova does not: **a
house.** Twenty-one volumes that belong together, each still recognisably
itself.

---

## Where the Library is now (verified by looking, 17 Sep, 375×812, cupertino, his vault)

- **Covers grid** (`now-grid-375.jpg`): honest and functional. Real posters,
  serif titles, idea/echo counts. It is a website grid. It does not lift, tilt,
  catch light, or feel like an object. It stays — as the fast, flat view — and
  gets the same surface treatment as the shelf (Phase 6) so the two agree.
- **Shelf / spines** (`now-spines-375.jpg`): CSS strips with a vertical title,
  a two-pixel lit edge and an eleven-pixel plank. No depth, no board, no
  shadows between volumes, no light. Poster art cropped into meaninglessness.
  Hover lifts twelve pixels. **This is the view the plan replaces.**
- **Detail** (`now-detail-375.jpg`): a flat jacket image above a flat text
  column. The jacket has no thickness, no light, cannot be turned. The page
  does not know what colour the book is.
- **The morph** from shelf to detail is a DOM view-transition (`src/vtName.js`,
  fixed 16 Sep). It cannot carry a WebGL object; Phase 3 replaces it on the
  shelf path with the reference's deterministic 3D timeline and keeps it for
  the Covers grid.

What already exists and is reused, not rebuilt:

| thing | where | reused for |
| --- | --- | --- |
| the renderer recipe: ACES tone mapping, sRGB output, PCF soft shadows, PMREM `RoomEnvironment`, a shadow-only ground | `src/Body3D.jsx:774-830` | the shelf's renderer, verbatim conventions |
| three.js 0.170, already shipped | `package.json`; `dist/assets/Body3D-*.js` (646 KB, includes three) | Vite splits shared modules: a second lazy screen importing `three` yields one shared chunk, not two copies (verify in Phase 5 by listing `dist/assets`) |
| real art, server-cached, one fetch ever | `server/lib/bookCovers.js`, `server/lib/sourcePosters.js`, `App.refreshBookCovers` | the front-board texture source |
| the single view model | `src/vals/valsLibrary.js` | gains the edition spec per item; the 3D shelf and the grid read the same rows |
| the lit-panel treatment | `src/glowPanel.js` | the bloom behind the canvas in the volume's accent |
| design tokens and the four themes | `src/index.css` | the shelf's wood, ground and rim light are theme-tinted through tokens, never literals |
| reduced motion, Calm | `src/index.css:403`, `:root[data-nv-calm]` | all shelf motion settles instantly; Calm zeroes bloom and dust |

---

## The bar (DONE criteria — each one observable)

1. **Objects, not images.** Every volume on the shelf is a three-dimensional
   book with boards, a spine, a page block and a contact shadow; rotating the
   view shows a fore-edge. Checked by screenshot from two camera angles.
2. **No art is ever stretched or sliced.** A poster appears only as a plate
   with a cloth margin; a jacket only on a 2:3 board. Checked by a test that
   asserts the plate rect's aspect equals the image's within 1%.
3. **The page wears the book.** Opening a volume re-tints the Library screen
   (ground, title, chips, rim light) to that volume's palette, and returns on
   close. Checked by reading the computed accent token before, during, after.
4. **The shine is real light.** The selected cover carries a specular
   highlight that moves as the book turns; the title is foil (metallic,
   low-roughness) that catches it separately from the cloth. Checked by two
   screenshots at different rotations showing the highlight in different
   places.
5. **Deterministic travel.** Shelf pose → detail pose → shelf pose with exact
   endpoints: the first and last frames of every transition match the rest
   pose to within one pixel (the reference's rule, `PROMPT.md`: *"the first and
   final pose of every transition must match exactly"*). Checked by sampling
   frames 0, mid, N−1, N.
6. **Phone truth.** On the iPhone emulation at 375×812 with 4× CPU throttle:
   frame time ≤ 16 ms during shelf scroll, no frame rendered while idle
   (render on demand), zero console errors, `scrollWidth === 375`, and the
   renderer is disposed with `forceContextLoss` on unmount (already Nova's
   rule, `Body3D.jsx:1477`).
7. **Honest degradation.** No WebGL, a lost context, or a failed art fetch
   never shows a hole: the CSS shelf remains as the fallback and says nothing
   false.
8. **He has used it.** On his phone, not in my emulation. Until then the
   plan's last box stays open (the Repertoire and the Leader have taught this
   twice).

---

## Architecture

```
src/shelf3d/
  edition.js      PURE. (item, art) → the edition spec: kind → proportions,
                  cloth colour, foil colour, palette for page-tinting,
                  spine text, plate rect. Deterministic from id/title.
                  Tested in node without three.
  coverArt.js     canvas → texture. Paints the house cover: cloth ground,
                  the plate (jacket full-bleed for books; poster inset for
                  videos), foil title/author in the serif, the kind mark.
                  Also the spine and back. One 512×768 canvas per face.
  materials.js    the PBR set, once, shared: cloth (sheen, procedural
                  weave normal), paper (page block, fore-edge lines), foil
                  (metalness .9, roughness .2, alpha-masked), walnut board.
  bookRig.js      geometry: front/back board, straight spine, page block,
                  headband, contact-shadow plane. Returns a Group with named
                  pivots so the front board can crack open on hover.
  Shelf3D.jsx     the mount: renderer (Body3D's recipe), lights, the shelf
                  stage, the state machine
                    shelf → opening → detail → closing → shelf
                  damped, time-based, render-on-demand. Input: wheel, drag,
                  arrow keys, tap. Owns dispose + context-lost fallback.
  useLibraryTint.js  the page-tinting: sets --nv-lib-acc / --nv-lib-ground
                  on the Library wrapper from the open edition's palette,
                  animated via the tokens' own transition, cleared on close.
```

- `valsLibrary.js` gains `edition: editionFor(it, art)` on each row and
  `libraryTint` on the detail. Nothing else in the vals changes; the grid
  keeps reading `coverStyle` and the shelf reads `edition`.
- `Library.jsx`'s `spines` branch renders `<Shelf3D rows={v.libraryShelf} …/>`
  when WebGL is available, else the existing CSS shelf (kept, unchanged, as
  the fallback — Bar 7).
- `libraryView` keeps its two values (`grid`, `spines`); the toggle labels stay
  *Covers* / *Shelf*. No third mode: the old spines view is not a thing he
  should be able to choose over the new one.
- The detail's cover slot becomes the parked 3D volume (the same renderer,
  re-targeted camera — the reference reparents the rig, `index.html:5780`),
  and `Detail`'s text column sits beside/below it exactly as now.

**What is deliberately NOT built** (the reference has them; they do not serve
him): page-turning with drag physics, embedded audio/Foley, an ambient score,
orbit/pan of the room. A tap-to-crack-open on hover is kept because it is the
one gesture that says "this is a book".

---

## The shine — where each effect comes from

| effect in the reel | mechanism | Nova detail |
| --- | --- | --- |
| cover catching light as it turns (0:05, 0:24) | PBR + image-based light. Body3D already uses PMREM `RoomEnvironment`; the reference adds a `RectAreaLight` key + a warm rim (`index.html:4533-4567`). | `clearcoat: 0.06, clearcoatRoughness: 0.72, sheen: 0.26` on the cover (`index.html:3701-3715`); the key light is tinted `--nv-acc` in Command, warm in Ember, cool in Observatory. |
| foil title that flashes separately | a second mesh 0.2 mm proud of the board, `metalness: 0.94, roughness: 0.2, clearcoat: 0.18`, alpha-masked from the canvas text (`index.html:3716-3730`). | title + author in `--nv-font-serif`; the kind glyph as the publisher's mark. Foil colour = the edition's accent. |
| the page re-tinting to the book (0:23–0:34) | Stripe tints ground, type and controls from the cover palette. | `useLibraryTint`: two custom properties on the Library wrapper, animated with `--nv-dur-slow`; every chip/heading in `Detail` reads them. Themes still win: the tint is a *mix* (`color-mix` 30–40 %) into the theme's tokens, never a replacement. |
| dust motes in the dark (0:00–0:10) | 110 `THREE.Points`, additive, drifting (`index.html:4575-4593`). | on in Command/Observatory/Ember (dark grounds), off under Daylight and Calm (`--nv-stars-op` already exists for this exact job). |
| soft glow behind the object | the reference's contact shadow (`index.html:3301`) + Nova's own `glowPanel` bloom. | bloom colour = edition accent; class `nv-glow` so Calm zeroes it. |
| tilted spines, selected one forward (0:10–0:19) | `rotationY = -offset × 0.105`, `z = 0.13 + focus × 0.24`, `scale = 1 + focus × 0.09`, damped at 12/s (`index.html:5825-5842`). | same numbers to start; tuned by looking, on the phone. |
| the tumble on open (0:04–0:07) | Stripe rotates on three axes during travel. | one slow roll (y then a hint of x) along the deterministic timeline; no free tumble, because the endpoint must be exact (Bar 5). |

---

## Phases — each one a commit, each verified by LOOKING before the next

**STATUS 17 Sep (same day):** Phases 1–6 BUILT and shipped in four commits
(28361a7, b173a2f, 8a8a7de, 9b0a4ff). Phase 0's standalone recorder was NOT
written — every phase was captured through the devtools MCP instead, and a
dev-only `scrub(p)` on `window.__novaShelf` holds the open timeline at a known
frame. Final audit set: `design/audits/library-2026-09-17/p4-*.jpg`.
Measured: drag at 4× CPU, 375 px → median 23 ms, max 35 ms (Bar 6's 16 ms
target NOT met; the 33 ms cap is); one 174 ms frame when the focused volume
repaints at 1024×1536 after settling; idle shelf 0 frames, detail runs a
permanent rAF for the sway (a choice, see handoff). Bar 8 open.

The standing rule from the anatomy work applies unchanged: **record and watch
every version.** The figure's harness (`tools/motion/harness.html` + `record.mjs`, one headless
Chrome stepped over the debugging protocol) gets a Library sibling at 375×812,
`preserveDrawingBuffer` only under the harness flag, and captures every phase. A phase whose screenshot has not been looked at is
not done.

**Phase 0 — The instrument (½ session).**
A `tools/motion/shelf.mjs` beside the figure's recorder that opens the Library at 375 in cupertino, forces
`libraryView: 'spines'`, and saves: idle shelf, mid-scroll, hover-cracked,
mid-open (frames 0/mid/N), detail, mid-close. Also a `?shelf=harness` query
that makes the renderer keep its drawing buffer so screenshots see the canvas.
*Verified when* the six captures exist for the CURRENT CSS shelf (a baseline).

**Phase 1 — One true volume (1 session).**
`edition.js` + `coverArt.js` + `materials.js` + `bookRig.js`, and `Shelf3D.jsx`
rendering exactly one volume, front and centre, slowly rotating under the
lights. Three editions checked by eye: *Atomic Habits* (real jacket on a 2:3
board), a Sinek video (poster as a plate), a Hormozi article (slim, paper).
*Verified when* Bar 1, 2 and 4 pass on those three across all four themes,
and `edition.test.js` pins: kind → proportions, plate aspect preserved, palette
derived deterministically, spine text never empty.

**Phase 2 — The shelf (1 session).**
All 21 on a walnut board tinted by theme. Damped scroll (wheel, drag with
rubber-band, arrow keys, tap-to-select), centre selection with tilt/lift/scale
from the table above, contact shadows between neighbours, dust. Render on
demand: a frame is drawn only while something is moving. *Verified when* the
scroll capture shows the selected volume forward, Bar 6's frame time holds at
4× throttle, and idle draws zero frames for five seconds (counted).

**Phase 3 — The open, and the page that wears the book (1 session).**
Tap → the selected rig travels to the detail pose on a time-based eased
timeline (the reference's `damp` with a hard settle at the endpoint), the
shelf recedes, `useLibraryTint` cross-fades the screen to the edition's
palette, `Detail`'s text column arrives (existing `fadeUp`). "‹ Library"
reverses all of it. The Covers grid keeps its DOM morph. *Verified when* Bar 3
and 5 pass on the captures (frames 0, mid, N−1, N), and closing from mid-open
(interrupt) still lands on the exact shelf pose.

**Phase 4 — The shine pass (½ session).**
Tune, by looking: key light sweep on rotation, foil intensity, sheen, bloom,
dust density, the tint mix percentage. This phase has no new code paths — only
numbers — and it ends with the numbers written into `edition.js`/`materials.js`
with a one-line reason each. *Verified when* two rotation captures show the
highlight moved (Bar 4) and he has seen a capture (or the phone) and said it
is closer.

**Phase 5 — Phone truth and the fallbacks (½ session).**
Pixel ratio 1.5 under 820 px (the reference does this, `index.html:5996`),
pause on `visibilitychange`, dispose + `forceContextLoss` on unmount,
`webglcontextlost` → swap to the CSS shelf with a one-line honest note, no
WebGL → CSS shelf silently. Bundle check: `dist/assets` shows one `three`
chunk shared by Body3D and Shelf3D. *Verified when* Bar 6 and 7 pass and the
gates are green.

**Phase 6 — The grid agrees (½ session).**
The Covers grid gets the same surface language in CSS so the two views read
as one library: cloth-margin plate for posters (no more full-bleed 16:9 in a
2:3 frame), the foil-coloured title, a specular sweep on hover, the edition's
accent as its glow. *Verified when* the grid capture at 375 and the shelf
capture use the same colours for the same volume.

**Phase 7 — Ship, and the box that stays open.**
Gates (`lint`, `build`, `server && npm test`), commit with why, push, kickstart
the service, `verify:shipped --server`. Handoff updated. Bar 8 stays open until
he opens it on his phone.

Roughly **five sessions**. Staffing per the house rule: Fable plans and
verifies; `edition.js` + tests and `coverArt.js` are well-specified and go to
**sonnet**; `bookRig.js`/`Shelf3D.jsx` state machine and the deterministic
timeline are the tricky part and go to **opus**; the shine pass is done by
hand because it is a looking job.

---

## Failure modes designed in

- **A poster that never arrives** (6 of 21 have no art today): the plate is
  painted as the edition's cloth with the title set large — the volume still
  looks bound, just plainer. Never a grey box, never a broken image.
- **A title too long for a spine** (*"Disarming Disrespect The
  Silence-Repeat-Question Playbook (Jefferson Fisher)"*): the spine sets the
  title at a size that fits its height and clips at a word boundary with an
  ellipsis, the way the Repertoire's card clip already backs off to a boundary
  (`repertoireLane.js`, 15 Sep).
- **Twenty-one volumes becomes two hundred**: geometry is shared, only
  textures are per-volume; textures are generated lazily for the visible
  window ± 6 and released beyond it. Tested at 200 synthetic rows in the
  harness before shipping.
- **Two Library instances** (a hot reload, a re-mount): the module holds no
  singletons; every mount owns its renderer and disposes it.
- **He turns Calm on mid-scroll**: bloom, dust and the hover crack stop on the
  next frame; the geometry and light stay.
- **The tint outlives the detail** (navigating away with a book open): the
  tint is set on the Library wrapper, so leaving the screen removes it with
  the element. Tested by opening, navigating to Notes, coming back.

---

## Attack (what would make this plan wrong)

- *Premise that kills it:* that he wants **video sources** dressed as books at
  all. If he would rather see the actual 16:9 poster large, the edition idea
  is wrong and the shelf should be a rack of cases, not volumes. That is
  Decision 1 and it changes Phase 1, so it is asked before Phase 1 starts.
- *Strongest rival:* do it in CSS 3D (`transform-style: preserve-3d`, six
  faces per book) instead of WebGL. Cheaper, no renderer, no context loss.
  It would give boards and tilt. It cannot give the shine: no image-based
  light, no clearcoat, no foil, no moving specular, and the reel's creator
  named the shine as the whole point. Rejected for the shelf; it is exactly
  the right tool for Phase 6's grid.
- *The datum that flips it:* frame time on his actual phone. Body3D already
  runs on it, so a shelf of 21 shared-geometry meshes should be lighter than
  a skinned figure — but "should" is an assumption until Phase 5 measures it.
  If it cannot hold 60 fps, the shelf renders at pixel ratio 1 and drops dust
  before it drops objects.

---

## Verified / Inferred / Assumed

**Verified this session**
- The reel: 40 frames read, transcript from Whisper; the two products
  identified from the URL bar in the frames (`press.stripe.com/…`,
  `play.mint.gg/complete-shelf`).
- The reference: `github.com/MengTo/complete-shelf`, cloned; every
  `index.html:` locator above was read in the stripped source (2.2 MB, of
  which 200 KB is code; the rest is embedded WebP/MP3 data URLs).
- His library: 21 sources (17/3/1), 15 with art, from the live server and the
  live app state (`__novaApp.state`).
- The current three views at 375×812, cupertino: screenshots filed.
- Body3D's renderer conventions and disposal (`src/Body3D.jsx:774-830, 1456-1477`).
- Vite config splits only React manually; everything else is Rollup's default
  shared-chunking.

**Inferred**
- Stripe Press's stack is three.js (webgpu.com showcase credits Yuin Chien,
  Nick Jones, Philipp Antoni and names Three.js; the material and lighting
  numbers are NOT published, so this plan takes them from the open-source
  reference, which its own README says studied Stripe Press).
- That Rollup will emit one shared `three` chunk once two lazy screens import
  it. It is the default behaviour; Phase 5 checks the actual `dist/assets`.

**Assumed**
- That the "Nova edition" reading is the one he wants (Decision 1).
- That five sessions is right. Phase 3 is where estimates die.
- That the tint mix at ~35 % into the theme reads as "the page wears the
  book" without breaking the themes' contrast — the HIG audit of 16 Sep found
  three contrast failures in tokens; the tint must be checked against the
  same three.

---

## Decisions for him — ANSWERED 17 Sep

His answers: **1. Nova edition with the poster plate. 2. Replace. 3. Try the
three-axis tumble.** Bar 5 is therefore relaxed as written under Decision 3:
the tumble may be free during travel, and the book must settle to the exact
rest pose within 300 ms of the timeline's end.

1. **What a video is on the shelf.** *Nova edition* (a bound volume with the
   poster as a plate, recommended, because it gives the house look the reel
   has) — or *art first* (the poster full-size as a case). Edition → Phase 1
   as written. Art-first → Phase 1 models a case, not a book, and Phase 6's
   grid stays full-bleed.
2. **Does the 3D shelf replace the Shelf view or sit beside it?** Replace
   (recommended: one shelf, the CSS one only as the fallback he never chooses)
   — or keep both as a third toggle. Replace → the toggle stays two-way.
   Keep → a third toggle label and a third persisted value.
3. **The tumble.** One controlled roll on open (recommended, exact endpoints)
   — or Stripe's free three-axis tumble, which looks more alive and costs the
   exact-endpoint guarantee. Roll → Bar 5 holds as written. Tumble → Bar 5 is
   relaxed to "settles within 300 ms of the endpoint".

If none is answered, the plan proceeds with the recommendations and each is
reversible at the phase it names.
