// LATE DATA SETTLES INTO PLACE (4 Nov 2026, the reel work, round 3).
//
// Filmed on reopen: the phone's copy shows at once, then 1 to 2 s later the
// live data lands and cards swap their text and change height, so everything
// below them jumps (the Daily review card took a new concept and pushed the
// next card down by a line in one frame). In the reels nothing ever jumps:
// what moves is carried there.
//
// So a commit he did not cause (no touch or key in the last INPUT_QUIET_MS)
// is a background change, and the screen's top-level blocks are measured
// before it (App.getSnapshotBeforeUpdate: geometry that is already laid out,
// no forced layout) and after it:
//   - a block that MOVED is carried from where it was to where it is (FLIP:
//     translateY from the old offset to none, on the snappy house spring)
//   - a block that CHANGED SIZE settles with a short fade from 0.55
//   - a block that is NEW fades in as the others make room for it
// A change he caused keeps its own motion (a tick, a log, a sheet), and
// nothing here runs under reduced motion or Calm.
//
// Transform and opacity only: an ancestor's filter flattens the liquid glass
// in WebKit (measured 4 Nov), opacity and transform do not.

import { contentItems } from './handoff.js';
import { houseSpring } from './pageMotion.js';
import { reducedMotion, mainEl } from './settingsNav.js';

export const INPUT_QUIET_MS = 700;
const MAX_BLOCKS = 14;
const MIN_PX = 3;
const FALLBACK_EASE = 'cubic-bezier(.32,.72,0,1)';

let lastInputAt = -Infinity;
export function noteInput() { lastInputAt = typeof performance !== 'undefined' ? performance.now() : Date.now(); }

// the Nova page on the Mac directs its own motion (src/NovaMac.jsx marks the
// root while it is up): its layers are a stage, not page blocks, and a settle
// there faded the hidden panel column in on every beat (10 Nov 2026)
const quiet = () => reducedMotion() || (typeof document !== 'undefined' && (document.documentElement.getAttribute('data-nv-calm') === '1' || document.documentElement.hasAttribute('data-nova-mac')));

// before the commit: where each block is, or null when this commit should not settle
export function measure(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  if (typeof document === 'undefined' || quiet()) return null;
  if (now - lastInputAt < INPUT_QUIET_MS) return null;
  const main = mainEl();
  if (!main) return null;
  // a page being handed off or grown is already moving
  if (document.querySelector('.nv-set-layer')) return null;
  const blocks = contentItems(main, MAX_BLOCKS);
  if (!blocks.length) return null;
  // offsets in the scrolled page, not the viewport: a scroll between the
  // two reads must not read as a move
  const st = main.scrollTop;
  const at = new Map();
  for (const el of blocks) {
    if (el.getAnimations?.().some((a) => a.playState === 'running')) continue;
    const r = el.getBoundingClientRect();
    at.set(el, { top: r.top + st, h: r.height });
  }
  return at.size ? at : null;
}

// after the commit: carry what moved, settle what changed size
export function play(before) {
  if (!before || quiet()) return 0;
  const spring = houseSpring('snappy') || FALLBACK_EASE;
  let n = 0;
  const main = mainEl();
  if (!main) return 0;
  const st = main.scrollTop;
  const reads = [];
  for (const [el, was] of before) {
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    reads.push([el, was, r]);
  }
  for (const [el, was, r] of reads) {
    const dy = was.top - (r.top + st);
    const grew = Math.abs(r.height - was.h) >= MIN_PX;
    if (Math.abs(dy) < MIN_PX && !grew) continue;
    try {
      if (Math.abs(dy) >= MIN_PX) {
        el.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: 520, easing: spring });
      }
      if (grew) el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
      n++;
    } catch { /* motion is never a requirement */ }
  }
  // a block that is NEW arrives as the others make room for it: hidden at
  // first (it would sit over what is still moving out of its way), then in
  if (n) {
    for (const el of contentItems(main, MAX_BLOCKS)) {
      if (before.has(el) || el.getAnimations?.().some((a) => a.playState === 'running')) continue;
      try {
        el.animate([{ opacity: 0, transform: 'translateY(-8px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: spring, delay: 120, fill: 'backwards' });
      } catch { /* motion is never a requirement */ }
    }
  }
  return n;
}
