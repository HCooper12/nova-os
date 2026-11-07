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
  top: 36,
  foot: 22 + 64 + 22,   // the composer's room (novaMacFacts COMPOSER)
  gap: 18,
  columns: 3,           // at 1440; recomputed from the width (wallColumns)
  minCol: 320,
  maxCol: 420,
  tilt: 2.2,            // degrees, the scatter's most
  drift: 10,            // px, the scatter's most
};
// the presenter spot the core keeps while a wall is up (the phone's rule,
// mockup 106: top left, a fifth of its size)
export const WALL_CORE = { cx: 84 + 24 + 150, cy: 36 + 150 - 28, s: 0.5 };
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
 * Where each panel sits: column, row, x, y, tilt and drift. The first
 * column is skipped for the first two rows (the core and its words live
 * there); the grid fills left to right, top to bottom, in arrival order.
 * `heights` are the panels' measured heights (px), used to stack a column;
 * unknown heights are taken as `assume`. Pure.
 */
export function wallLayout(keys, { width = 1440, heights = {}, assume = 180, tidy = false } = {}) {
  const cols = wallColumns(width);
  const colW = wallColWidth(width);
  const tops = Array.from({ length: cols }, () => WALL.top);
  const out = [];
  let i = 0;
  for (const key of keys.slice(0, WALL_MAX)) {
    // the core's column is left clear until the others have two rows
    let c = i % cols;
    const row = Math.floor(i / cols);
    if (c === 0 && row < 2 && cols > 2) { i++; c = i % cols; }
    const x = WALL.left + c * (colW + WALL.gap);
    const y = tops[c];
    const h = heights[key] || assume;
    tops[c] = y + h + WALL.gap;
    const u = seeded(out.length);
    const v = seeded(out.length + 97);
    out.push({
      key, col: c, row, x, y, w: colW,
      tilt: tidy ? 0 : Number((u * WALL.tilt).toFixed(2)),
      dx: tidy ? 0 : Math.round(v * WALL.drift),
      dy: tidy ? 0 : Math.round(u * WALL.drift * 0.6),
    });
    i++;
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
const KIND_WORDS = { page: 'Page', video: 'Video', figure: 'Figure', quote: 'Quote', entity: 'Who', note: 'Note', key: 'Key', steps: 'Steps', list: 'List', metric: 'Figure', bars: 'Chart', image: 'Image', media: 'Listen', body: 'Body', program: 'Program', session: 'Session', sources: 'Sources', shot: 'Browser', instrument: 'Instrument' };
export function eyebrowOf(card) {
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
