# Nova OS — Design Directions

Exploration of five art directions for the Nova OS redesign, mocked as static
HTML pages of Mission Control (the hero screen) using the real content from
Hayden's live vault so comparisons are honest. The current design is preserved
as **Option 0** and remains fully recoverable.

## How the current design is preserved

1. **Git** — every commit up to and including the redesign keeps the current
   implementation; reverting is a checkout away.
2. **This folder** — `design/current/00-midnight-observatory.jpeg` is a live
   capture, and the tokens below describe the look independent of code.
3. **Implementation plan** — the redesign will land as a *design-token layer*
   (colors, type, radii, motion as CSS custom properties + a theme switch), so
   "Midnight Observatory" ships as a selectable theme rather than being
   deleted. `THEME` in `src/App.jsx` already switches backgrounds; the token
   layer generalizes it.

## Option 0 — Midnight Observatory (current)

The shipped look: a quiet dark observatory.

- **Ground:** radial midnight `#070b13 → #0c1424 → #152742`, starfield + aurora drift
- **Ink:** bone `#ece5da`, muted at .5–.6 alpha for secondary
- **Accents:** gold `#d8b573` (identity), cyan `#6be5f5` (live/data), violet `#8a6ad1`, green `#5aa87c`
- **Type:** Instrument Serif (display, italic accents) + JetBrains Mono (labels/data)
- **Layout:** soft 14px-radius cards, hairline `rgba(236,229,218,.09)` borders, inset top highlight
- **Motion:** slow aurora, pulsing live dots, 6s gauge rotation

## The five new directions (`design/mockups/`)

| # | Name | Tone | One-line thesis |
|---|------|------|-----------------|
| 1 | **Meridian** | Light, editorial | A daily broadsheet for your life — porcelain ground, ink-blue text, brass accent, hour-tinted sky band in the masthead |
| 2 | **Pulse** | Light, kinetic | Training-floor energy — chalk ground, ink borders, hard offset shadows, Anton numerals, streak ticker marquee |
| 3 | **Aurora Terminal** | Dark, cinematic | The current DNA evolved into a flight deck — volumetric aurora, glass panels, orbital ring gauges, holographic cyan→violet |
| 4 | **Gouache** | Light, human | A painted daybook — watercolor washes, ink outlines, Nova's handwritten margin notes, planner-page calendar |
| 5 | **Prisma** | Adaptive, spatial | Frosted glass over a living color field keyed to the hour (dawn mint → midday sky → dusk apricot), visionOS depth |

### Motion languages (what "cinematic" means per direction)

- **Meridian:** ink-line draws, slow sky drift — restraint as drama
- **Pulse:** springy hover lifts, marquee tickers, snap transitions
- **Aurora Terminal:** aurora drift, orbital rotation, scanline shimmer over live data
- **Gouache:** washes breathe, notes fade in as if being written
- **Prisma:** field morphs with the hour, cards lift toward you, springy focus

## Round 2 — CONTINUUM (the hybrid, per Hayden's picks: 0 + 3 + 4 + 5)

Prisma's hour-keyed glass base carrying the best organ from each liked
direction. The unifying idea: **Options 0 and 3 are not a separate theme —
they are what Continuum becomes at night.** The field flows dawn mint →
midday sky → dusk apricot → after dark it deepens into the aurora
observatory, starfield and all.

- **From Prisma (5):** the living hour-keyed field, frosted glass, depth
- **From Aurora (3) / Option 0:** the night state — aurora light, starfield,
  holo cyan/violet data, gold Instrument Serif italics; the orbital ring
  gauge cluster as the vitals signature (and the Galaxy's selection cursor)
- **From Gouache (4):** Nova's handwritten margin notes (Caveat) — plum by
  day, glowing pink at night; "← you are here" on the calendar
- **From Meridian (1):** the editorial serif lead + standfirst hierarchy
- **From Pulse (2):** kinetic numerals — Outfit 800, tabular, count-up motion

Mockups: `06-continuum-day.html` (Mission Control, 13:12),
`07-continuum-night.html` (same page at 22:04 — the observatory),
`08-continuum-galaxy.html` (Memory Galaxy as "tonight's sky", orbit-ring
selection, canvas star chart).

Type system: Outfit (UI + numerals) · Instrument Serif (display, kept from
Option 0) · JetBrains Mono (microlabels, kept from Option 0) · Caveat
(Nova's hand).

## Round 3 — ten directions (Continuum rejected; brief: combine 0+3, innovate on 5, try 3D)

**Group A — Midnight Observatory × Aurora Terminal fusions (dark):**

| # | Name | Thesis |
|---|------|--------|
| 9 | **Deep Field** | The observatory refined — Option 0's gold serif + starfield with Aurora's glass depth and orbital ring; quieter than Aurora, richer than today |
| 10 | **Signal** | Night instrument — hi-fi amplifier warmth: brass/amber lamplight on near-black, needle dials, VU-bar training levels, zero blue |
| 11 | **Nebula Noir** | Cinema — a letterboxed film frame: nebula sky, film grain, huge gradient serif title, all data in one luminous bottom strip |
| 12 | **Starchart** | Celestial cartography — engraved navy chart, graticule grid, astrolabe dial with three nested rings, the day plotted as waypoints |

**Group B — Prisma innovations:**

| # | Name | Thesis |
|---|------|--------|
| 13 | **Prisma Volume** | Physical dichroic glass — stacked refracting slabs with chromatic edges over caustic light, vitals as tilted sheets |
| 14 | **Prisma Obsidian** | Glass goes nocturnal — oil-slick iridescence on volcanic black, hexagonal facet gauges, the 5↔dark bridge |
| 15 | **Prisma Flow** | The field becomes flowing aurora ribbons; giant gradient numerals; the most kinetic of the glass family |

**Group C — 3D:**

| # | Name | Thesis |
|---|------|--------|
| 16 | **Deck** | True CSS perspective — panels recede like a physical console; upright greeting floats above the tilted deck |
| 17 | **Habitat** | Isometric diorama — the day as extruded tiles whose HEIGHT is the data; flat inspector column stays readable |
| 18 | **Orrery** | A shaded golden planet (today) with moons riding tilted elliptical orbits; schedule markers live on the rings |

## Round 4 — deepening 14 + 3, recoloring 13, one hybrid (files 19–28)

**Obsidian family (from 14):** 19 **Ember** (molten copper/rose warmth, forge-ring
gauge) · 20 **Depth** (black-glass cavern, panes at receding z, teal light from
below) · 21 **Bloom** (deep-sea bioluminescence, organic glowing gauges).

**Aurora family (from 3):** 22 **Cockpit** (flight-path ribbon of the day,
segmented instrument gauges, corner brackets) · 23 **Cathedral** (monumental
light curtains, votive columns, serif grandeur) · 24 **Ion** (minimal: one ion
beam threading greeting → vitals → ledger).

**Volume recolors (from 13 — same markup, tokens only → the toggle proof):**
25 **Glacier** (arctic blues/teals) · 26 **Sunset** (golden hour coral→plum) ·
27 **Ultraviolet** (dark neon blacklight).

**Hybrid:** 28 **Obsidian Aurora** (14×3 — aurora curtains burning behind black
dichroic glass, orbital ring cut from dark glass, Instrument Serif voice).

### Theme-toggle feasibility (Hayden's question)

Yes — and 25/26/27 are the existence proof: they are byte-identical markup to
13 with only design tokens swapped. In the app this means one `THEMES` map of
CSS custom properties + a Settings picker (and optionally an "auto by hour"
mode); any set of directions that share a layout can be shipped as switchable
skins, including keeping Midnight Observatory as the classic option. Directions
with different *layouts* (e.g. Cockpit vs Cathedral) are more than a token swap
— those are a mode, not a theme.

## Round 5 — THE SYNTHESIS (files 29–31), from Hayden's element-level picks

Canonical architecture (all three): specular 3D panes with iridescent edges ·
NOVA·OS dotted brand · glow + text-glow on the active tab and primary CTA ·
date eyebrow → bold greeting → time-aware serif-gradient tagline → standfirst
with bolded metrics · orbital core gauge with satellite metric boxes ·
scanline over "Nova noticed" (with *Nova* in gold serif italic) · colored
standout section headings (gold/cyan/violet) · highlighted current calendar
event (▸) · summary chips · colored taglines on bottom cards · SYNCED +
LIVE·VAULT (real note count) in the bar · animated background.

- **29 Synthesis A — "Nova Prime":** the balanced build (Outfit bold + Rajdhani
  titles + Instrument Serif accents + JetBrains Mono micro) in 28's palette
- **30 Synthesis B — HUD lean:** same architecture flavored toward 22 —
  Rajdhani/Plex Mono dominant, corner brackets, faint grid, squarer radii
- **31 Ember skin:** byte-identical markup to 29, ember tokens only — the
  standing proof that alternate schemes (incl. 25–27 brights) ship as toggles

## Round 6 — COMMAND (files 32–34): Option-30 chassis + Option-0 soul

New canon on top of the Round-5 synthesis: ⌘K Summon in the bar · "3 AGENTS
LIVE" pill · agents roster (Commander/Coach/CFO/Studio/Researcher/Guardian +
roles) with pulsing active dots · Suggested Focus pane attributed to an agent
("from Commander") with context-dependent action buttons · ✦ star bullets in
Nova noticed · Daily Review shows CONCEPT + source wiki page + Review button ·
the core gauge is now a **voice reactor** (Jarvis-style animated core, "NOVA ·
LISTENING", waveform) · protein joins sleep/steps as satellites · every metric
box wears a **conic progress gradient border** showing % toward goal.

- **32 Command · Arc Reactor** — 30's HUD skin, cyan segmented reactor core
- **33 Command · Golden Orb** — same architecture, warmer: Outfit type,
  iridescent rounded panes, Option 0's golden orb as the core (Nova identity)
- **34 Command · Agents Rail** — 32 with the roster as a status rail under the
  top bar (alternative placement), violet core

### Shared principles regardless of winner

- Same information architecture as today (focus, vitals, noticed, today, vault cards)
- Data honesty carried over: LIVE/OFFLINE/DEMO states, real numbers, tabular-nums
- Reduced-motion respected everywhere; keyboard focus visible
- The chosen direction becomes tokens; Option 0 stays selectable
