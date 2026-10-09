// THE SETTINGS PAGES MOVE THE WAY iOS SETTINGS DOES (mockup 72's motion
// note, built 7 Oct 2026): a row pushes its page in from the right while the
// parent slides a third to the left and dims, with a shadow down the new
// page's leading edge; Back, Escape or a swipe right pops it, the swipe
// tracked under the finger and finished at the finger's speed. Reduced
// motion turns every slide into a short fade.
//
// Nova renders one screen at a time, so two pages can only be on screen at
// once as a picture of one of them. The same trade src/edgeBack.js made, and
// for its reasons: the page being left is FROZEN into a fixed layer of our
// own (a deep clone, its canvases copied across), and the live <main> is the
// page arriving. Nothing of Nova's layout is touched except <main>'s own
// transform for the length of the slide, and only Settings is on screen,
// which holds nothing position:fixed inside <main> (its menus are portalled).
//
// The pages are glass over the shared sky, so they are not opaque: instead
// of covering one another, the page underneath is CLIPPED to the part the
// other page has not reached. Both clips are linear in the same progress as
// the transforms, so one easing keeps them in step.
//
// DOM work only; Settings.jsx decides when, from its path.

import { commitDistance, FLICK_PX_PER_MS, FLICK_MIN_FRACTION, settleMs } from './edgeBack.js';
import { EDGE_GUARD_PX, decideDirection } from './swipeCore.js';

export const PUSH_MS = 500;
export const POP_MS = 420;
export const FADE_MS = 200;
const EASE = 'cubic-bezier(.32,.72,0,1)';
const SETTLE = 'cubic-bezier(.2,.8,.3,1)';
export const PARALLAX = 0.3;
const DIM = 0.3;

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const mainEl = () => (typeof document === 'undefined' ? null : document.querySelector('main'));

// what is running now, so a second tap mid-slide finishes the first at once
let running = null;
export function finishRunning() {
  if (!running) return;
  const r = running;
  running = null;
  r.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
  r.cleanup();
}

// THE PAGE BEING LEFT, frozen. Children of <main>, not <main> itself, so
// nothing that looks for the app's <main> ever finds the copy.
//
// ONLY WHAT CAN BE SEEN IS COPIED (9 Oct 2026, the motion audit: 91 to
// 190 ms for the push frame at 4x). It used to deep-clone the whole page,
// every row of a long page included, then set the copy's scrollTop, which
// forced a layout of the full copy before the slide could start. Now every
// read happens first, on a page that is already laid out; then the copy is
// built. An element on screen is copied with its children; one wholly above
// or below the viewport becomes an empty box of its own size (same class,
// same margins, children dropped), so what is on screen sits exactly where
// it was.
export function snapshot() {
  const main = mainEl();
  if (!main) return null;
  finishRunning();
  // READ
  const box = main.getBoundingClientRect();
  const scrollTop = main.scrollTop;
  const held = new Map();   // off-screen element -> its height
  const walk = (el) => {
    for (const child of el.children) {
      const r = child.getBoundingClientRect();
      const off = r.bottom < box.top || r.top > box.bottom;
      if (off && r.height > 0 && blockish(child)) { held.set(child, r.height); continue; }
      if (!off) walk(child);
    }
  };
  walk(main);
  // WRITE
  const layer = document.createElement('div');
  layer.className = 'nv-set-layer';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  const clone = document.createElement('div');
  clone.className = 'nv-set-clone';
  for (const child of Array.from(main.children)) clone.appendChild(copyVisible(child, held));
  const dim = document.createElement('div');
  dim.className = 'nv-set-dim';
  Object.assign(dim.style, { position: 'absolute', inset: '0', zIndex: '1' });
  layer.appendChild(clone);
  layer.appendChild(dim);
  document.body.appendChild(layer);
  // The copy is scrolled, not translated: a transform would move the page's
  // sticky search field off its edge (found frame by frame, 9 Oct). Scrolling
  // lays out only this layer, which now holds the visible part of one page,
  // and nothing when the page sat at the top.
  if (scrollTop > 0) clone.scrollTop = scrollTop;
  return { layer, clone, dim, box, W: box.width, scrollTop };
}

// a box whose height can be held, not a run of inline text whose lines an
// empty copy would collapse
function blockish(el) {
  const d = getComputedStyle(el).display;
  return !d.startsWith('inline') || d === 'inline-block' || d === 'inline-flex' || d === 'inline-grid';
}

// on screen: the element and its children; off screen: the element alone,
// held at its measured height
function copyVisible(node, held) {
  const h = held.get(node);
  if (h != null) {
    const empty = node.cloneNode(false);
    empty.removeAttribute('id');
    Object.assign(empty.style, { height: `${h}px`, minHeight: `${h}px`, boxSizing: 'border-box', visibility: 'hidden' });
    return empty;
  }
  if (node.nodeType !== 1 || !holdsAny(node, held)) return deepCopy(node);
  const shell = node.cloneNode(false);
  shell.removeAttribute('id');
  for (const c of Array.from(node.childNodes)) shell.appendChild(c.nodeType === 1 ? copyVisible(c, held) : c.cloneNode(true));
  return shell;
}

function holdsAny(node, held) {
  for (const el of held.keys()) if (node.contains(el)) return true;
  return false;
}

// a whole subtree, with what cloneNode leaves behind: a canvas's picture (the
// cores keep their last frame) and a typed value (a property, not an attribute)
function deepCopy(node) {
  const copy = node.cloneNode(true);
  if (node.nodeType !== 1) return copy;
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  const pick = (el, sel) => (el.matches(sel) ? [el] : Array.from(el.querySelectorAll(sel)));
  const fromC = pick(node, 'canvas');
  pick(copy, 'canvas').forEach((c, i) => {
    const src = fromC[i];
    if (!src) return;
    try { c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); } catch { /* tainted or gone */ }
  });
  const fromF = pick(node, 'input, textarea');
  pick(copy, 'input, textarea').forEach((f, i) => { if (fromF[i]) f.value = fromF[i].value; });
  return copy;
}

function dropSnap(snap) {
  if (snap?.layer?.isConnected) snap.layer.remove();
}

function clearMain(main) {
  if (!main) return;
  main.style.transform = '';
  main.style.clipPath = '';
  main.style.webkitClipPath = '';
  main.style.willChange = '';
  main.style.boxShadow = '';
}

function fixedEl(cls, box, style) {
  const el = document.createElement('div');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, height: `${box.height}px`, ...style });
  document.body.appendChild(el);
  return el;
}

// a fade in place of a slide: the old page out while the new one comes in
function crossfade(snap, main, done) {
  const anims = [
    snap.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease', fill: 'forwards' }),
    main.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease' }),
  ];
  const cleanup = () => { dropSnap(snap); done?.(); };
  running = { anims, cleanup };
  anims[0].finished.then(() => { if (running?.anims === anims) { running = null; cleanup(); } }).catch(() => {});
}

// PUSH: the frozen parent slides a third left, dimming, clipped to the part
// the new page has not covered; the live page comes in from the right.
export function playPush(snap, done) {
  const main = mainEl();
  if (!snap || !main) { dropSnap(snap); done?.(); return; }
  if (reducedMotion()) { crossfade(snap, main, done); return; }
  const W = snap.W;
  const edge = fixedEl('nv-set-edge', snap.box, { left: `${snap.box.left - 44}px` });
  const t = { duration: PUSH_MS, easing: EASE, fill: 'forwards' };
  const anims = [
    snap.layer.animate([
      { transform: 'translateX(0)', clipPath: 'inset(0 0 0 0)' },
      { transform: `translateX(${-PARALLAX * W}px)`, clipPath: `inset(0 ${(1 - PARALLAX) * 100}% 0 0)` },
    ], t),
    snap.dim.animate([{ opacity: 0 }, { opacity: DIM }], t),
    main.animate([{ transform: `translateX(${W}px)` }, { transform: 'translateX(0)' }], { duration: PUSH_MS, easing: EASE }),
    edge.animate([{ transform: `translateX(${W}px)`, opacity: 1 }, { transform: 'translateX(0)', opacity: 0.6 }], t),
  ];
  const cleanup = () => { dropSnap(snap); edge.remove(); clearMain(main); done?.(); };
  running = { anims, cleanup };
  anims[2].finished.then(() => { if (running?.anims === anims) { running = null; cleanup(); } }).catch(() => {});
}

// THE POP, from wherever the page is (a tap starts at 0; a released swipe at
// its finger). The frozen page leaves to the right with its edge shadow; the
// live parent comes back from a third left, clipped and dimmed to what the
// leaving page has uncovered.
function popFrames(W, x) {
  const p = Math.max(0, Math.min(1, x / W));
  return {
    layer: `translateX(${x}px)`,
    main: `translateX(${-PARALLAX * W * (1 - p)}px)`,
    mainClip: `inset(0 ${((1 - PARALLAX) * (1 - p) * 100).toFixed(3)}% 0 0)`,
    dimClip: `inset(0 ${((1 - p) * 100).toFixed(3)}% 0 0)`,
    dim: String(DIM * (1 - p)),
  };
}

export function beginPop(snap) {
  const main = mainEl();
  if (!snap || !main) return null;
  const dim = fixedEl('nv-set-dim', snap.box, { width: `${snap.box.width}px` });
  snap.layer.style.boxShadow = '-22px 0 44px -22px rgba(0,0,0,.95)';
  snap.layer.style.overflow = 'visible';
  snap.clone.style.overflow = 'hidden';
  main.style.willChange = 'transform';
  const pop = { snap, main, dim, W: snap.W, x: 0 };
  paintPop(pop, 0);
  return pop;
}

export function paintPop(pop, x) {
  const f = popFrames(pop.W, x);
  pop.x = x;
  pop.snap.layer.style.transform = f.layer;
  pop.main.style.transform = f.main;
  pop.main.style.clipPath = f.mainClip;
  pop.main.style.webkitClipPath = f.mainClip;
  pop.dim.style.clipPath = f.dimClip;
  pop.dim.style.opacity = f.dim;
}

// finish the pop: to the right (commit) or back to where it was (cancel)
export function settlePop(pop, commit, { vx = 0, done } = {}) {
  if (!pop) { done?.(); return; }
  const { W, x } = pop;
  const to = commit ? W : 0;
  const ms = reducedMotion() ? 0 : (vx ? settleMs(to - x, vx) : POP_MS);
  const easing = vx ? SETTLE : EASE;
  const a = popFrames(W, x);
  const b = popFrames(W, to);
  const end = () => {
    pop.dim.remove();
    if (commit) { dropSnap(pop.snap); clearMain(pop.main); }
    done?.();
  };
  if (!ms) { paintPop(pop, to); end(); return; }
  const t = { duration: ms, easing, fill: 'forwards' };
  const anims = [
    pop.snap.layer.animate([{ transform: a.layer }, { transform: b.layer }], t),
    pop.main.animate([{ transform: a.main, clipPath: a.mainClip }, { transform: b.main, clipPath: b.mainClip }], t),
    pop.dim.animate([{ clipPath: a.dimClip, opacity: a.dim }, { clipPath: b.dimClip, opacity: b.dim }], t),
  ];
  const cleanup = () => {
    anims.forEach((n) => { try { n.cancel(); } catch { /* gone */ } });
    paintPop(pop, to);
    end();
  };
  running = { anims, cleanup };
  anims[0].finished.then(() => { if (running?.anims === anims) { running = null; cleanup(); } }).catch(() => {});
}

// after a cancelled swipe the top page is live again; the frozen copy and
// <main>'s styles can go once it has painted
export function releasePop(pop) {
  if (!pop) return;
  dropSnap(pop.snap);
  clearMain(pop.main);
}

// a tap on Back (or Escape, or the browser's Back with a frozen copy ready)
export function playPop(snap, done) {
  const main = mainEl();
  if (!snap || !main) { dropSnap(snap); done?.(); return; }
  if (reducedMotion()) { crossfade(snap, main, done); return; }
  const pop = beginPop(snap);
  settlePop(pop, true, { done });
}

// THE SWIPE RIGHT, anywhere on a page but the edge gutter (which belongs to
// the browser in a tab and to src/edgeBack.js when installed). Locks with
// the app's own direction rule (swipeCore.decideDirection), and commits by
// the edge gesture's own rule: half the width, or a real flick past a third
// (his call, 22 Sep: a small swipe must not go back by accident).
export const NOT_A_SWIPE = 'input, textarea, select, .nv-set-seg, .nv-set-sw, .nv-set-chips, .nv-set-tlist, .nv-set-menu, .nv-set-pill, .nv-set-grip, [data-no-swipe]';

export function swipeDecision({ dx, W, vx }) {
  const need = commitDistance(W);
  if (vx <= -FLICK_PX_PER_MS) return false;
  if (dx >= need) return true;
  return vx >= FLICK_PX_PER_MS && dx >= need * FLICK_MIN_FRACTION;
}

export function startsSwipe(e) {
  if (e.button != null && e.button !== 0) return false;
  if (e.clientX < EDGE_GUARD_PX) return false;
  return !e.target?.closest?.(NOT_A_SWIPE);
}

export { decideDirection };
