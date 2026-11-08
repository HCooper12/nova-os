// THE WALL OF REFERENCES, THE PURE FACTS (7 Nov 2026, design/ROSE-STUDY.md
// §5 phase 2, mockup 110). Rose's HUD puts thirteen panels on the screen at
// once and keeps them; the one she is saying is lit. Nova's Mac stage docks
// three. These are the numbers the wall is drawn from, on the Mac and on
// the phone, tested in server/test/wallFacts.test.js.
//
// A wall opens when a reply carries more panels than the column holds, or
// any panel a lookup put up. Panels take SLOTS on a grid that fills from
// the top right, around the core at the top left (the presenter spot the
// phone already uses); each slot has a seeded tilt and drift so the wall
// reads as Rose's scatter, and T (tidy) squares them. The order of slots
// is the order of arrival: a panel never moves once placed, except for
// tidy, maximise and put away.

import { MAX_DOCKED } from './novaMacFacts.js';

// the wall's own grid, in the window's coordinates (less the title bar the
// Mac draws itself: novaMacFacts TITLE_BAR)
export const WALL = {
  left: 84 + 24,        // the rail's room plus a gutter
  right: 36,
  top: 72,              // under the History button (16 + 36 + a gap)
  foot: 22 + 64 + 22,   // the composer's room (novaMacFacts COMPOSER)
  gap: 18,
  columns: 3,           // at 1440; recomputed from the width (wallColumns)
  minCol: 320,
  maxCol: 420,
  tilt: 2.2,            // degrees, the scatter's most
  drift: 10,            // px, the scatter's most
};
// the presenter spot the core keeps while a wall is up (the phone's rule,
// mockup 106: top left, half its size), centred on the first column; its
// words sit under it, so the first column's cards start below `coreRoom`
export const WALL_CORE = { cy: 130, s: 0.5, coreRoom: 430 };
export function wallCore(width) {
  return { cx: WALL.left + Math.round(wallColWidth(width) / 2), cy: WALL_CORE.cy, s: WALL_CORE.s };
}
export const WALL_MAX = 16;   // more than Rose's thirteen; the rest wait in history

/** How many columns a window this wide holds. Pure. */
export function wallColumns(width) {
  const room = Math.max(0, width - WALL.left - WALL.right);
  const n = Math.floor((room + WALL.gap) / (WALL.minCol + WALL.gap));
  return Math.max(2, Math.min(4, n));
}

/** The column width for this window. Pure. */
export function wallColWidth(width) {
  const n = wallColumns(width);
  const room = Math.max(0, width - WALL.left - WALL.right);
  return Math.min(WALL.maxCol, Math.floor((room - WALL.gap * (n - 1)) / n));
}

// a seeded unit in [-1, 1], the same every time for the same slot
function seeded(i) {
  let x = (i + 1) * 1103515245 + 12345;
  x = (x ^ (x >>> 13)) >>> 0;
  return ((x % 2000) / 1000) - 1;
}

/** Should the stage become a wall? More panels than the column docks, or
 *  any the lookup put up. Pure. */
export function wallWanted({ panels = 0, lookup = 0 } = {}) {
  return lookup > 0 || panels > MAX_DOCKED;
}

/**
 * Where each panel sits: column, x, y, tilt and drift. A masonry: each
 * panel takes the column whose stack is shortest (ties go left), so the
 * wall stays level however tall the cards are; the first column starts
 * below the core and its words (WALL_CORE.coreRoom), so the first cards
 * go up on the right, as Rose's do. Arrival order; a panel never moves
 * once placed, except for tidy, maximise and put away. `heights` are the
 * panels' measured heights (px); unknown heights are taken as `assume`.
 * Pure.
 */
export function wallLayout(keys, { width = 1440, heights = {}, assume = 180, tidy = false } = {}) {
  const cols = wallColumns(width);
  const colW = wallColWidth(width);
  const tops = Array.from({ length: cols }, (_, c) => (c === 0 ? WALL_CORE.coreRoom : WALL.top));
  const out = [];
  for (const key of keys.slice(0, WALL_MAX)) {
    let c = 0;
    for (let k = 1; k < cols; k++) if (tops[k] < tops[c]) c = k;
    const x = WALL.left + c * (colW + WALL.gap);
    const y = tops[c];
    const h = heights[key] || assume;
    tops[c] = y + h + WALL.gap;
    const u = seeded(out.length);
    const v = seeded(out.length + 97);
    out.push({
      key, col: c, x, y, w: colW,
      tilt: tidy ? 0 : Number((u * WALL.tilt).toFixed(2)),
      dx: tidy ? 0 : Math.round(v * WALL.drift),
      dy: tidy ? 0 : Math.round(u * WALL.drift * 0.6),
    });
  }
  return out;
}

/** The slot a maximised panel takes: centred, wide, inside the wall. Pure. */
export function wallOpenRect(width, height) {
  const w = Math.min(880, width - WALL.left - WALL.right);
  const h = Math.max(320, height - WALL.top - WALL.foot - 40);
  return { x: Math.round(WALL.left + (width - WALL.left - WALL.right - w) / 2), y: WALL.top + 20, w, h };
}

// --------------------------------------------------------------- the eyebrow
// Rose's eyebrow: `KIND // SOURCE`. Nova's: the kind in words, then the
// source it stands on (a host, a channel, "Nova's own", or the finder).
const KIND_WORDS = { map: 'Map', page: 'Page', video: 'Video', figure: 'Figure', quote: 'Quote', entity: 'Who', note: 'Note', key: 'Key', steps: 'Steps', list: 'List', metric: 'Figure', bars: 'Chart', image: 'Image', media: 'Listen', body: 'Body', program: 'Program', session: 'Session', sources: 'Sources', shot: 'Browser', instrument: 'Instrument' };
export function eyebrowOf(card) {
  // a Researcher brief brought back by name (lib/wallRecall.js) says so
  if (card?.brief) return { kind: 'Brief', source: 'Researcher' };
  const kind = KIND_WORDS[card?.kind] || 'Panel';
  const src = card?.host || card?.channel || (card?.lookup ? 'looked up' : card?.finder || 'Nova’s own');
  return { kind, source: String(src).replace(/^www\./, '') };
}

/** The phone rail: how much of the next card shows past the edge, so the
 *  cut says "more" (the closure law, 18 Oct 2026). */
export const RAIL_PEEK = 0.3;
export function railCardWidth(viewport, { side = 28, peek = RAIL_PEEK } = {}) {
  // one card and a third of the next fit in the viewport less the gutters
  return Math.round((viewport - side * 2 - 12) / (1 + peek));
}

// ------------------------------------------------------------ the scatter
// ROSE'S WALL, NOT A GRID (8 Nov 2026, his call after the first frames: "it
// looks like everything is organised in 3 columns rather than being
// unrestricted and dynamic like Rose"). Cards take sizes by what they are
// (a video wide, a figure small, a page in between) and land on the stage
// one by one at the first free spot of a seeded walk, each with its own
// tilt and drift. The core keeps the bottom-left corner with the bar beside
// it (CORNER), and nothing else sits on the stage. T squares the same cards
// into the masonry (wallLayout) for reading; Esc clears. Pure, tested.

// card widths by kind, at 1440; scaled with the stage width
export const SCATTER_W = { video: 520, image: 440, map: 440, bars: 420, page: 400, entity: 380, quote: 380, note: 380, list: 380, steps: 380, key: 340, figure: 260, metric: 260, body: 300, program: 420, session: 460, sources: 460, shot: 480, instrument: 420 };
export const SCATTER = { top: 72, right: 36, left: 36, gap: 16, tilt: 2.4, drift: 8 };
// the core's corner: bottom left, the bar to its right, kept clear of cards
export const CORNER = { w: 560, h: 170, coreCx: 36 + 70, coreCyFromBottom: 96, s: 0.4, barX: 36 + 150, barW: 380 };

export function scatterWidth(kind, width = 1440) {
  const base = SCATTER_W[kind] || 380;
  return Math.round(base * Math.max(0.72, Math.min(1.15, width / 1440)));
}

// a 2D low-discrepancy walk (Halton 2,3), the same every time
function halton(i, b) { let f = 1; let r = 0; let n = i; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; }

const hits = (a, b, gap) => !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);

/**
 * Where each card lands on the open stage. `cards` are [{ key, kind }];
 * `heights` are measured heights (px), unknown ones `assume`. Each card
 * tries the seeded walk from its own offset for a spot that touches no
 * placed card and stays off the corner; failing that, the spot with the
 * least overlap. Pure.
 */
export function scatterLayout(cards, { width = 1440, height = 900, heights = {}, assume = 190, tidy = false } = {}) {
  if (tidy) return wallLayout(cards.map((c) => c.key), { width, heights, assume, tidy: true });
  const placed = [];
  const out = [];
  const corner = { x: 0, y: height - CORNER.h, w: CORNER.w, h: CORNER.h };
  const minX = SCATTER.left; const maxX = width - SCATTER.right; const minY = SCATTER.top; const maxY = height - 24;
  cards.slice(0, WALL_MAX).forEach((c, i) => {
    const w = scatterWidth(c.kind, width);
    const h = heights[c.key] || assume;
    let best = null;
    for (let k = 0; k < 64; k++) {
      const u = halton(i * 7 + k + 1, 2); const v = halton(i * 7 + k + 1, 3);
      // the walk favours the right and the top, where Rose's cards gather first
      const x = Math.round(minX + u * Math.max(0, maxX - minX - w));
      const y = Math.round(minY + v * Math.max(0, maxY - minY - h));
      const r = { x, y, w, h };
      if (hits(r, corner, SCATTER.gap)) continue;
      let overlap = 0;
      // inside another card's gap counts as a collision even with no shared area
      for (const p of placed) if (hits(r, p, SCATTER.gap)) overlap += Math.max(1, Math.max(0, Math.min(r.x + r.w, p.x + p.w) - Math.max(r.x, p.x)) * Math.max(0, Math.min(r.y + r.h, p.y + p.h) - Math.max(r.y, p.y)));
      if (!best || overlap < best.overlap) best = { ...r, overlap };
      if (overlap === 0) break;
    }
    if (!best) best = { x: minX, y: minY, w, h, overlap: 0 };
    placed.push(best);
    const t = seeded(i); const d = seeded(i + 53);
    out.push({ key: c.key, x: best.x, y: best.y, w, tilt: Number((t * SCATTER.tilt).toFixed(2)), dx: Math.round(d * SCATTER.drift), dy: Math.round(t * SCATTER.drift * 0.6), overlap: best.overlap });
  });
  return out;
}

/** The core and the bar in the corner, for this stage. Pure. */
export function cornerFrame(width, height) {
  return { cx: CORNER.coreCx, cy: height - CORNER.coreCyFromBottom, s: CORNER.s, barX: CORNER.barX, barW: CORNER.barW };
}
