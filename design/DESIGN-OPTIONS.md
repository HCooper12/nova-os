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

### Shared principles regardless of winner

- Same information architecture as today (focus, vitals, noticed, today, vault cards)
- Data honesty carried over: LIVE/OFFLINE/DEMO states, real numbers, tabular-nums
- Reduced-motion respected everywhere; keyboard focus visible
- The chosen direction becomes tokens; Option 0 stays selectable
