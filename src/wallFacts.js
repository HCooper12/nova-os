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

import { MAX_DOCKED, COMPOSER } from './novaMacFacts.js';
import { stageForm } from './stageFormFacts.js';

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

// ------------------------------------------------------------- the stage
// THE LIVING STAGE (10 Nov 2026, his approval of mockups 113 and 114). The
// core sits where the moment puts it and each sentence raises its panels
// around it. A panel takes the free spot NEAREST its anchor (the core, or the
// agent that filed it) that touches nothing, the two sides are kept in
// balance, and a spot whose tether would run through the caption or another
// panel costs more. There is no cap: when no spot is free, the oldest panel
// from an EARLIER sentence folds into the Earlier chip and the search runs
// again. Panels of the sentence being spoken never fold each other. This is
// the rule mockup 114 draws with (its `layout`), lifted out so it is tested.
export const STAGE = { left: 36, right: 36, top: 44, bottomGap: 108, railLeft: 104, gap: 20, step: 14, coreKeep: 110, capW: 240, capTop: 100, capBottom: 225, sideCost: 40, crossCost: 340, jitter: 12, wide: 1.55 };

const rectHit = (a, b, g) => a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g;
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The rects nothing may land on: the core, and the caption under it. Pure. */
export function stageKeep(core) {
  const [cx, cy] = core;
  return [[cx - STAGE.coreKeep, cy - STAGE.coreKeep, cx + STAGE.coreKeep, cy + STAGE.coreKeep], [cx - STAGE.capW, cy + STAGE.capTop, cx + STAGE.capW, cy + STAGE.capBottom]];
}

/**
 * Where each panel lands on the stage. `panels` are [{ key, w, h, sent,
 * anchor? }] in the order they are raised: `sent` is the sentence that raised
 * the panel, `anchor` an [x, y] other than the core (an agent). Returns one
 * entry per panel, in the same order: { key, x, y, w, h, side, anchor,
 * folded, foldedBy }. A folded panel keeps the spot it held, so the fold can
 * be acted out from there. `keep` replaces the core-and-caption rects (the
 * agents scene keeps its whole ring clear); `caption` is the rect a tether
 * must not cross, null when there is none. `top` is the highest a panel may
 * sit (the Mac draws no title bar of its own, so its top is the mockup's less
 * 28). Pure and seeded.
 */
export function stageLayout(panels, { width = 1440, height = 900, core = [width / 2, 340], keep, caption, rail = false, seed = 5, top = STAGE.top } = {}) {
  const cx = core[0];
  const keeps = keep || stageKeep(core);
  const cap = caption === undefined ? (keep ? null : keeps[1]) : caption;
  const x0 = rail ? STAGE.railLeft : STAGE.left; const x1 = width - STAGE.right; const y0 = top; const y1 = height - STAGE.bottomGap;
  let live = [];
  const out = [];
  const find = (p, i) => {
    const an = p.anchor || core;
    const L = live.filter((q) => (q.rect[0] + q.rect[2]) / 2 < cx).length; const R = live.length - L;
    // A TETHER NEVER CROSSES A PANEL (round two): a spot whose line would run
    // through a panel, or that would sit on a panel's line, is taken only
    // when no clean spot is left; crossing the caption still only costs more
    let best = null; let bs = Infinity; let bestX = null; let bx = Infinity; let n = 0;
    const lines = live.map((q) => { const a = q.anchor; return [a, [clampN(a[0], q.rect[0], q.rect[2]), clampN(a[1], q.rect[1], q.rect[3])]]; });
    for (let y = y0; y <= y1 - p.h; y += STAGE.step) {
      for (let x = x0; x <= x1 - p.w; x += STAGE.step) {
        n += 1;
        const r = [x, y, x + p.w, y + p.h];
        if (keeps.some((k) => rectHit(r, k, 0)) || live.some((q) => rectHit(r, q.rect, STAGE.gap))) continue;
        const mx = x + p.w / 2; const my = y + p.h / 2;
        const tx = clampN(an[0], r[0], r[2]); const ty = clampN(an[1], r[1], r[3]);
        let cross = 0; let thru = 0;
        for (let k = 2; k < 10; k++) {
          const px = an[0] + (tx - an[0]) * k / 10; const py = an[1] + (ty - an[1]) * k / 10; const pt = [px, py, px, py];
          if (cap && rectHit(pt, cap, 0)) cross = 1;
          if (live.some((q) => rectHit(pt, q.rect, 4))) thru = 1;
        }
        if (!thru) {
          for (const [a, b] of lines) {
            for (let k = 1; k < 10 && !thru; k++) { const px = a[0] + (b[0] - a[0]) * k / 10; const py = a[1] + (b[1] - a[1]) * k / 10; if (rectHit([px, py, px, py], r, 4)) thru = 1; }
            if (thru) break;
          }
        }
        const jit = Math.abs(seeded(seed + i * 977 + n)) * STAGE.jitter;
        const s = Math.hypot((mx - an[0]) / STAGE.wide, my - an[1]) + jit + STAGE.sideCost * (mx < cx ? L : R) + STAGE.crossCost * cross;
        if (thru) { if (s < bx) { bx = s; bestX = r; } } else if (s < bs) { bs = s; best = r; }
      }
    }
    if (!best && bestX) bestX.crossed = true;
    return best || bestX;
  };
  panels.forEach((p, i) => {
    let r = find(p, i);
    while (!r) {
      const old = live.find((q) => q.sent !== p.sent);
      if (!old) break;
      old.entry.folded = true; old.entry.foldedBy = p.key;
      live = live.filter((q) => q !== old);
      r = find(p, i);
    }
    // nothing left to fold and still no room: the top corner, honestly marked
    const forced = !r;
    if (!r) r = [x0, y0, x0 + p.w, y0 + p.h];
    const entry = { key: p.key, x: r[0], y: r[1], w: p.w, h: p.h, side: (r[0] + r[2]) / 2 < cx ? 'left' : 'right', anchor: p.anchor || core, folded: false, foldedBy: null };
    if (forced) entry.forced = true;
    if (r.crossed) entry.crossed = true;   // no clean spot was left: honestly marked
    out.push(entry);
    live.push({ rect: r, sent: p.sent, entry, anchor: p.anchor || core });
  });
  return out;
}

// ------------------------------------------------- the stage on the Mac
// PHASE 2 (design/ATLAS-STUDY.md §6, mockup 114 approved 10 Nov 2026): while
// Nova speaks an answer or a briefing, NovaMac lays its panels out with
// stageLayout around the core at the centre. These are the mockup's numbers
// in the build's coordinates: the build is the page inside the window, so
// every y is the mockup's less its 28 px title bar.
export const STAGE_TITLE = 28;
// a panel's width by what it is (mockup 114's own: a figure 250, a chart or a
// page 340, a session 360); a panel code built goes by its macKind
export const STAGE_W = { metric: 250, figure: 250, instrument: 320, bars: 340, list: 320, steps: 320, key: 300, note: 300, quote: 300, entity: 300, body: 300, media: 300, video: 300, page: 340, image: 340, map: 340, shot: 340, sources: 320, program: 360, session: 360, sets: 340, brief: 340, calendar: 360 };
export function stageWidth(card) {
  return STAGE_W[card?.macKind] || STAGE_W[card?.kind] || 300;
}

/** Where the core sits while the stage is up (mockup sc.core 720, 318 at
 *  half size), the width of the words under it (460) and how far under its
 *  centre they start (204 x 0.5 + 4 = 106, as `off` at scale 0.5). Pure. */
export function stageFrame(width = 1440, height = 900 - STAGE_TITLE) {
  const cx = Math.round(width / 2);
  const cy = Math.round((318 / 900) * (height + STAGE_TITLE)) - STAGE_TITLE;
  return { cx, cy, s: 0.5, uw: 460, off: 212, mx: cx };
}

/** The Earlier chip beside the composer (mockup .earlier: 16 px right of
 *  it, 34 px off the foot) and the point a folding panel flies to. Pure. */
export function stageChip(width = 1440, height = 900 - STAGE_TITLE) {
  const left = Math.round(width / 2 + COMPOSER.w / 2 + 16);
  return { left, bottom: 34, cx: left + 50, cy: height - 54 };
}

/** The order panels came onto the stage, each with the beat that raised it.
 *  A key seen before keeps its place and its beat (one put away keeps its
 *  spot, so nothing after it moves); a new key joins at the end with `beat`.
 *  Returns `prev` itself when nothing is new. Pure. */
export function stageArrive(prev, keys, beat) {
  const was = prev || [];
  const seen = new Set(was.map((e) => e.key));
  const add = [];
  for (const k of keys || []) if (k && !seen.has(k)) { seen.add(k); add.push({ key: k, sent: beat }); }
  return add.length ? [...was, ...add] : was;
}

const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The tether from the core's rim to the nearest point of a panel (mockup
 *  layout()): a quadratic bowed by an eighth of its length; a panel below
 *  the caption hangs from the caption's foot, so no line runs through the
 *  words. `rect` is [x0, y0, x1, y1]. Returns the path's d. Pure. */
export function stageTether(core, rim, rect, caption = null) {
  const [ax, ay] = core;
  const bx = clampTo(ax, rect[0], rect[2]); const by = clampTo(ay, rect[1], rect[3]);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len; const uy = (by - ay) / len;
  let sx = ax + ux * rim; let sy = ay + uy * rim;
  let qx = (sx + bx) / 2 - uy * len * 0.12; let qy = (sy + by) / 2 + ux * len * 0.12;
  if (caption) {
    let thru = false;
    for (let k = 1; k < 10; k++) {
      const px = ax + (bx - ax) * k / 10; const py = ay + (by - ay) * k / 10;
      if (px >= caption[0] && px <= caption[2] && py >= caption[1] && py <= caption[3]) thru = true;
    }
    if (thru && by > caption[3]) { sx = bx; sy = caption[3] + 2; qx = bx; qy = (sy + by) / 2; }
  }
  const f = (n) => n.toFixed(1);
  return `M${f(sx)} ${f(sy)} Q${f(qx)} ${f(qy)} ${f(bx)} ${f(by)}`;
}

// THE STAGE'S EYEBROW (mockup 114 .peye): the subject in the panel's hue on
// the left, where it came from on the right, and a serif title only when the
// card carries a line of its own beyond its label. A page or a video draws
// its own title; a panel code built names its kind and its source.
const CODE_TAG = { sets: 'Sets', brief: 'Researcher', calendar: 'Calendar' };
export function stageEyebrow(card, opts = {}) {
  if (card?.macKind) return { tag: CODE_TAG[card.macKind] || 'Nova', meta: card.head?.sub || '', title: card.title || '' };
  const e = eyebrowOf(card);
  const f = stageForm(card, opts);
  // the scope on the right is code's, from the card's own data, or blank
  // (stageFormFacts); "Nova's own" is never a scope
  if (card?.kind === 'proposal') return { tag: 'Proposal', meta: f.meta, title: f.title };
  if (card?.brief || card?.kind === 'page' || card?.kind === 'video') return { tag: e.kind, meta: f.meta, title: '' };
  // the subject only: "Protein vs your 140g floor" is tagged Protein (the
  // target it names is drawn as the dashed line)
  const label = String(card?.label || '').replace(/\s+/g, ' ').trim().split(/\s+vs\.?\s+/i)[0];
  const title = String(card?.title || '').replace(/\s+/g, ' ').trim();
  return { tag: label || e.kind, meta: f.meta, title: f.title || (title && title.toLowerCase() !== label.toLowerCase() ? title : '') };
}

// a spoken card's own tone (server/lib/spokenCards.js: cy, gold, warn, good)
// is the hue its stage panel wears, so colour carries the verdict the server
// gave it; a data panel keeps its finder's hue; anything else is Nova's own
const TONE_HUE = { cy: 'var(--nv-cy)', gold: 'var(--nv-gold)', warn: 'var(--nv-warn)', good: 'var(--nv-good)', vi: 'var(--nv-vi)' };
export function stageHue(card, fallback = 'var(--nv-nova)') {
  if (card?.head?.hue) return card.head.hue;
  if (card?.hue) return card.hue;
  return stageForm(card).hue || TONE_HUE[card?.tone] || fallback;
}

/** The core's rect and the caption's, the caption holding the words' real
 *  measured height (`capH`, from the top of the words under the core) and
 *  never less than the mockup's own room. Pure. */
export function stageKeepFor(core, frame, capH = 0) {
  const [k0, c0] = stageKeep(core);
  const foot = Math.max(c0[3], Math.ceil(core[1] + frame.off * frame.s + capH + 12));
  return [k0, [c0[0], c0[1], c0[2], foot]];
}

// the core's rim at the stage's scale (mockup: R0 193.2 x the speaking body
// 0.8 x 0.5, and 8 px off it)
export const STAGE_RIM = 193.2 * 0.8 * 0.5 + 8;

/**
 * The whole stage for this window: where each panel lands (stageLayout, no
 * cap), whether it has folded, where it arrives from (28 px towards the
 * core), where it folds to (the Earlier chip), its slight turn towards the
 * core when it sits far to one side, and its tether. `entries` are
 * [{ key, w, sent }] in arrival order; `heights` the measured heights. Pure.
 */
export function stagePlan(entries, { width = 1440, height = 900 - STAGE_TITLE, heights = {}, assume = 190, capH = 0 } = {}) {
  const f = stageFrame(width, height);
  const core = [f.cx, f.cy];
  const chip = stageChip(width, height);
  const keep = stageKeepFor(core, f, capH);
  const cap = keep[1];
  const lay = stageLayout((entries || []).map((e) => ({ key: e.key, w: e.w, h: heights[e.key] || assume, sent: e.sent })),
    { width, height, core, keep, caption: cap, top: STAGE.top - STAGE_TITLE });
  return lay.map((l) => {
    const mx = l.x + l.w / 2; const my = l.y + l.h / 2;
    const d = Math.hypot(f.cx - mx, f.cy - my) || 1;
    return {
      ...l,
      ex: Number(((f.cx - mx) / d * 28).toFixed(1)), ey: Number(((f.cy - my) / d * 28).toFixed(1)),
      fx: Math.round(chip.cx - mx), fy: Math.round(chip.cy - my),
      ry: mx - f.cx > 300 ? -4 : mx - f.cx < -300 ? 4 : 0,
      tether: stageTether(core, STAGE_RIM, [l.x, l.y, l.x + l.w, l.y + l.h], cap),
    };
  });
}

/** The core and the bar in the corner, for this stage. Pure. */
export function cornerFrame(width, height) {
  return { cx: CORNER.coreCx, cy: height - CORNER.coreCyFromBottom, s: CORNER.s, barX: CORNER.barX, barW: CORNER.barW };
}
