// THE LIVING STAGE ON THE PHONE, THE PURE FACTS (10 Nov 2026), mockup
// design/mockups/114-living-stage-round-two.html, the `.ph` block, approved in
// his words: "Yes, it looks excellent". The mockup's phone is 402 x 874; every
// number here is the mockup's own, and the few that depend on the screen are
// derived from it the way the mockup derives them (a column is half the room
// left after the gutters, the count row rises to sit on the grid's top).
// Tested in server/test/phoneStageFacts.test.js.

/** The mockup's numbers (px, from the top or the foot of the screen). */
export const PH = {
  side: 16,             // .ph-hero / .ph-rail / .ph-comp / .pgrid gutters
  coreY: 133,           // .ph-core: top 58 + 150 / 2
  coreBox: 150,         // the mockup core's canvas
  stTop: 206,           // .ph-st
  capTop: 236, capSide: 24,
  heroTop: 322, heroBottom: 236,
  countBottom: 192, countH: 44, countSide: 20,
  railBottom: 104, railH: 92,
  miniW: 160, miniH: 92, slot: 170, panelW: 280,
  gridTop: 244, gridBottom: 96, gap: 10,
  compBottom: 30, compH: 56,
  openTop: 64,
  allCore: { dy: -22, s: 0.5 }, allCap: { dy: -82, s: 0.8 },
  restTop: 330,
  dealAfter: 600,       // the mockup deals everything out 600 ms after the voice stops
};

// the real core (CoreFace at size 300) drawn the size of the mockup's 150 px
// canvas: the Mac's ratio (src/novaMacFacts.js MAC_CORE_RATIO, 420 over
// 300 x 0.84) applied to the phone's 150
export const PHONE_CORE_SCALE = PH.coreBox / (300 * 0.84);

/** Where things sit on a screen `width` x `height`. Pure. */
export function phoneGeometry(width = 402, height = 874) {
  const w = Math.max(320, width);
  const h = Math.max(560, height);
  const room = w - PH.side * 2;
  const col = (room - PH.gap) / 2;
  const countTop = h - PH.countBottom - PH.countH;
  return {
    width: w, height: h,
    col,                                        // a See-all column (180 on the mockup's 402)
    colScale: col / PH.panelW,                  // a panel drawn 280 wide, shown a column wide
    miniScale: PH.miniW / PH.panelW,            // the rail's small copy (160 / 280)
    openW: room,                                // the opened panel (370 on 402)
    // See all: the count row rises to sit on the grid (mockup -438 on 874)
    countAllDy: PH.gridTop - PH.countH - countTop,
    // where the dealt panels start from: the middle of the hero's room
    // (the mockup's 246 below the grid's top on 874)
    dealX: (col + PH.gap) / 2,
    dealY: Math.round(h / 2 - 191),
  };
}

/**
 * The hero and the rail from the panels in the order they arrived: the
 * newest is the hero; the rest are the rail, newest first. `keys` are the
 * panel keys in arrival order. Pure.
 */
export function phoneOrder(keys) {
  const k = (keys || []).filter(Boolean);
  if (!k.length) return { hero: null, rail: [] };
  return { hero: k[k.length - 1], rail: k.slice(0, -1).reverse() };
}

/** Each rail copy's x, newest at 0 (the mockup's SLOT of 170). Pure. */
export function railX(i) { return i * PH.slot; }

/**
 * See all: two columns, each panel to the shorter one (the left on a tie),
 * the mockup's openSheet rule; and where each is dealt from (the middle of
 * the hero's room, toward the centre line). `items` are [{ key, h }] with h
 * the height as shown (the panel's own height times the column's scale).
 * Returns [{ key, col, top, h, dx, dy, i }]. Pure.
 */
export function phoneColumns(items, { gap = PH.gap, dealX = 95, dealY = 246 } = {}) {
  const hs = [0, 0];
  return (items || []).map((it, i) => {
    const c = hs[1] < hs[0] ? 1 : 0;
    const h = Math.max(0, Math.ceil(it.h || 0));
    const top = hs[c];
    hs[c] += h + gap;
    return { key: it.key, col: c, top, h, i, dx: c ? -dealX : dealX, dy: Math.round(dealY - top - h / 2) };
  });
}

/** The opened panel's top: centred, never under 64 (the mockup's openPh). Pure. */
export function openTop(h, height = 874) {
  return Math.max(PH.openTop, Math.round((height - (h || 0)) / 2));
}

/**
 * The caption under the core: only the sentence being said, its spoken words
 * lit (mockup .ph-cap span.s). `line` is valsNovaThread's stageLine,
 * { lit, later }. Returns { lit, rest } or null. Pure.
 */
export function capSentence(line) {
  if (!line) return null;
  const lit = String(line.lit || '').replace(/\s+/g, ' ').trim();
  const later = String(line.later || '').replace(/\s+/g, ' ');
  // the rest of this sentence only: up to its end mark, or all of it
  const m = later.match(/^.*?[.!?](?=\s|$)/);
  const litEnds = /[.!?]$/.test(lit);
  const rest = (litEnds ? '' : (m ? m[0] : later)).replace(/\s+$/, '');
  if (!lit && !rest.trim()) return null;
  return { lit, rest };
}

/**
 * Which face the phone stage wears. `panels` is how many the answer raised;
 * `forced` is his last tap on the count row ('all' | 'hero' | null); `held`
 * is true once the voice has stopped long enough (PH.dealAfter).
 * Returns 'rest' | 'hero' | 'all' | 'turn'. Pure.
 */
export function phoneFace({ turning = false, speaking = false, panels = 0, forced = null, held = false } = {}) {
  if (!panels) return turning || speaking ? 'turn' : 'rest';
  if (forced === 'all' || forced === 'hero') return forced;
  if (speaking) return 'hero';
  // the reply window after he is answered is listening, not a new turn: what
  // the answer raised stays (a new question clears it, in the component)
  return held ? 'all' : 'hero';
}

/** The count row's two words (mockup: "From this answer" / "See all 4";
 *  dealt out: "Everything from this answer" / "Show latest"). Pure. */
export function countWords(face, shown) {
  if (face === 'all') return { from: 'Everything from this answer', act: 'Show latest' };
  return { from: 'From this answer', act: shown > 1 ? `See all ${shown}` : '' };
}
