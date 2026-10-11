// PULL IT DOWN AND IT GOES — every sheet, panel and bar in Nova.
//
// His ask, 11 Oct 2026, with two recordings: the agents' skill sheet could
// only be left through the "‹ Agents" label ("swiping down does nothing"),
// and the reference was the Claude iOS app, where a downward drag takes the
// whole conversation box and the keyboard down with the finger. "Across nova
// ... I should be able to swipe away things like pop-up bars and interactive
// components ... animates in a flowing movement like how [it] does with apple
// products."
//
// What existed: useSheetDrag.js on the GRAB ZONE of about a dozen sheets
// (pointer events, a CSS transition for the throw) and sheetPhysics.js for
// the maths. What was missing, and what this adds ONCE for every sheet:
//   - the BODY drags too, when its scroll is at the top; a scroll pulled past
//     the top hands straight over to the drag in the same touch
//   - the release hands its velocity to a real spring (sampled into WAAPI
//     keyframes, so it runs on the compositor even when the main thread is
//     busy, which on the Skill sets it is: p95 160–220ms on his phone)
//   - the scrim fades with progress
//   - a sheet with a focused field blurs on the dismiss, so iOS lowers the
//     keyboard as the sheet leaves
//
// THE CONTRACT. A sheet opts in by marking the element that moves with
// `data-sheet` (or `data-sheet="root"` when the aria-modal root IS the
// sheet). It is found from the touch: the nearest `[aria-modal="true"]` or
// `[data-sheet-float]` root. It closes through its OWN close, exactly as the
// back swipe does (edgeBack.js): a `[data-sheet-close]` or `[data-edge-close]`
// control if it names one, else a click on its root (the backdrop). So a sheet
// that is a history level is popped the same way Back pops it, and the iOS
// edge swipe and the browser Back still agree with it.
//
// WHY TOUCH EVENTS, not pointer events, on the body. A pointer stream on a
// scrollable element is CANCELLED the moment the browser starts scrolling,
// so "scroll to the top, keep pulling, and the sheet comes with you" cannot
// be done with pointers on iOS: the pointercancel arrives at exactly the
// moment the handoff should begin. Touch events keep coming and can be
// claimed with preventDefault. The grab zones keep useSheetDrag (pointer +
// setPointerCapture), which is also what a mouse gets.

import { useEffect } from 'react';
import { project, rubberband, velocityFrom } from './sheetPhysics.js';
import { decideDirection, EDGE_GUARD_PX } from './swipeCore.js';

export { project, rubberband, velocityFrom };

// ─────────────────────────── the pure maths ───────────────────────────

// How far down (projected) commits. A share of the sheet's own height, so a
// short action sheet and a tall report ask for the same GESTURE; clamped so a
// tiny pill still needs a real pull and a full page does not need a mile.
export function dismissThreshold(height) {
  const h = Number.isFinite(height) && height > 0 ? height : 600;
  return Math.min(260, Math.max(90, Math.round(h * 0.33)));
}

// Release: where was it GOING, not where did it stop (Apple's projection).
// Moving up at all is a rescue, and returns, however far down it is.
export const RESCUE_PX_PER_MS = -0.05;
export function sheetDecision({ dy, v = 0, height = 600 }) {
  if (!Number.isFinite(dy)) return 'return';
  if (v < RESCUE_PX_PER_MS) return 'return';
  return dy + project(v) > dismissThreshold(height) ? 'dismiss' : 'return';
}

// The finger's raw travel → what the sheet shows. Down is 1:1; up rubber-bands
// against the sheet's own height (there is nothing above a sheet).
export function dragOffset(raw, height = 600) {
  if (!Number.isFinite(raw)) return 0;
  return raw >= 0 ? raw : -rubberband(-raw, height);
}

export function sheetProgress(offset, height = 600) {
  if (!(height > 0)) return 0;
  return Math.min(1, Math.max(0, offset / height));
}

// The scrim fades a little slower than the travel, so the page behind is
// still dim while he is deciding.
export function scrimOpacity(progress) {
  return Math.max(0, 1 - Math.min(1, Math.max(0, progress)) * 0.9);
}

// A damped spring from `from` to `to`, leaving at `v` px/ms (the finger's
// speed — the velocity handoff), sampled every 1/60s. Returns the samples and
// how long they last, for an element.animate() with linear easing: the curve
// IS the spring, and the compositor runs it.
// response ≈ the period in seconds, dampingRatio 1 = no overshoot (Apple's
// parameterisation, apple-design §springs).
export function springFrames(from, to, v = 0, { response = 0.34, dampingRatio = 1, maxMs = 900 } = {}) {
  const k = Math.pow((2 * Math.PI) / response, 2);
  const c = (4 * Math.PI * dampingRatio) / response;
  let x = from - to;
  let vel = (Number.isFinite(v) ? v : 0) * 1000;      // px/s
  const out = [from];
  const dt = 1 / 240;
  let t = 0;
  let sinceSample = 0;
  while (t * 1000 < maxMs) {
    const a = -k * x - c * vel;
    vel += a * dt;
    x += vel * dt;
    t += dt;
    sinceSample += dt;
    if (sinceSample >= 1 / 60 - 1e-9) {
      sinceSample = 0;
      out.push(to + x);
      if (Math.abs(x) < 0.5 && Math.abs(vel) < 12) break;
    }
  }
  out[out.length - 1] = to;
  return { frames: out, ms: Math.max(16, Math.round((out.length - 1) * (1000 / 60))) };
}

// ───────────────────────────── the hand ──────────────────────────────

const STYLE_ID = 'nv-sheetdrag-css';
const CSS = `
.nv-sheet-moving{will-change:transform;}
.nv-sheet-moving,.nv-sheet-moving *,.nv-sheet-moving::before,.nv-sheet-moving::after{-webkit-backdrop-filter:none !important;backdrop-filter:none !important;}
.nv-sheet-moving.nv-sheet-glass{background-color:color-mix(in srgb,var(--nv-bg1) 95%,transparent) !important;}
[data-sheet-scrim]{position:fixed;inset:0;pointer-events:none;will-change:opacity;}
`;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID; s.textContent = CSS;
  document.head.appendChild(s);
}

// the sheet that this touch is on, or null
export function findSheet(target) {
  const root = target?.closest?.('[aria-modal="true"], [data-sheet-float]');
  if (!root) return null;
  const panel = root.getAttribute('data-sheet') === 'root' || root.hasAttribute('data-sheet-float') && root.hasAttribute('data-sheet')
    ? root
    : root.querySelector('[data-sheet]');
  if (!panel || !panel.contains(target)) return null;
  if (panel.getAttribute('data-sheet') === 'off') return null;
  return { root, panel };
}

function scrollerOf(target, panel) {
  for (let el = target; el && el !== panel.parentElement; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
    }
  }
  return null;
}

function presentationY(el) {
  try {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    return new DOMMatrixReadOnly(t).m42 || 0;
  } catch { return 0; }
}

// what the last body drag did, for the verification harness and Settings
let last = null;
export function lastSheetGesture() { return last; }

// A grab zone (useSheetDrag) owns its own pointer stream; the body drag stays
// off a touch that started there. iOS fires pointerdown before touchstart.
let grabAt = 0;
export function markGrabZone() { grabAt = Date.now(); }

// One live gesture per panel element, so an interrupted throw is grabbed back
const live = new WeakMap();

function emit(panel, y, height, phase) {
  panel.dispatchEvent(new CustomEvent('nv-sheetdrag', { detail: { y, progress: sheetProgress(y, height), phase } }));
}

function begin(root, panel) {
  ensureCss();
  let g = live.get(panel);
  if (g) {
    // grabbed mid-throw: take it off the animation at the PRESENTATION value
    const y = presentationY(panel);
    const op = g.scrim ? Number(getComputedStyle(g.scrim).opacity) : 1;
    for (const a of g.anims) a.cancel();
    g.anims = [];
    panel.style.transform = `translate3d(0,${y}px,0)`;
    if (g.scrim) g.scrim.style.opacity = String(op);
    g.base = y;
    return g;
  }
  const height = panel.getBoundingClientRect().height || 600;
  g = { root, panel, height, base: 0, anims: [], scrim: null, restore: [] };
  // the dim. A sheet with its own scrim element (marked data-sheet-close,
  // because tapping it closes) fades THAT; a root that is itself the dim gets
  // one plain layer whose OPACITY moves (compositor), in place of a background
  // the root would have to repaint every frame
  const own = root.querySelector(':scope > [data-sheet-close]')
    || (root === panel && root.previousElementSibling?.hasAttribute('data-sheet-close') ? root.previousElementSibling : null);
  if (own && own !== panel) {
    g.restore.push([own, 'opacity', own.style.opacity], [own, 'transition', own.style.transition]);
    own.style.transition = 'none';
    g.scrim = own; g.ownScrim = true;
  } else if (root !== panel) {
    const bg = getComputedStyle(root).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      const scrim = document.createElement('div');
      scrim.setAttribute('data-sheet-scrim', '');
      scrim.setAttribute('aria-hidden', 'true');
      scrim.style.background = bg;
      root.insertBefore(scrim, root.firstChild);
      g.restore.push([root, 'backgroundColor', root.style.backgroundColor]);
      root.style.backgroundColor = 'transparent';
      g.scrim = scrim;
    }
  }
  if (getComputedStyle(panel).backdropFilter && getComputedStyle(panel).backdropFilter !== 'none') panel.classList.add('nv-sheet-glass');
  panel.classList.add('nv-sheet-moving');
  // the sheet's own resting transform (the Skill sets park theirs inline) comes back after
  g.restore.push([panel, 'transition', panel.style.transition], [panel, 'animation', panel.style.animation], [panel, 'transform', panel.style.transform]);
  panel.style.transition = 'none';
  panel.style.animation = 'none';
  live.set(panel, g);
  return g;
}

function paint(g, y) {
  g.panel.style.transform = `translate3d(0,${y}px,0)`;
  if (g.scrim) g.scrim.style.opacity = String(scrimOpacity(sheetProgress(y, g.height)));
  emit(g.panel, y, g.height, 'drag');
}

function teardown(g, keepTransform) {
  for (const a of g.anims) a.cancel();
  g.anims = [];
  if (!keepTransform) {
    g.panel.style.transform = '';
    if (!g.ownScrim) g.scrim?.remove();
    for (const [el, k, v] of g.restore) el.style[k] = v;
    g.panel.classList.remove('nv-sheet-moving', 'nv-sheet-glass');
  }
  live.delete(g.panel);
}

function animateTo(g, from, to, v, opts, done) {
  const { frames, ms } = springFrames(from, to, v, opts);
  const a = g.panel.animate(frames.map((y) => ({ transform: `translate3d(0,${y}px,0)` })), { duration: ms, easing: 'linear', fill: 'forwards' });
  g.anims.push(a);
  if (g.scrim) {
    g.anims.push(g.scrim.animate(frames.map((y) => ({ opacity: scrimOpacity(sheetProgress(y, g.height)) })), { duration: ms, easing: 'linear', fill: 'forwards' }));
  }
  emit(g.panel, to, g.height, to === 0 ? 'return' : 'dismiss');
  a.onfinish = () => done?.();
  return ms;
}

// Close it through ITS OWN close — the same path Back takes.
// A sheet that is its own root (no backdrop inside it) names its scrim, the
// element just before it, with data-sheet-close.
function closeThrough(root) {
  const prev = root.previousElementSibling;
  (root.querySelector('[data-sheet-close]') || root.querySelector('[data-edge-close]')
    || (prev?.hasAttribute('data-sheet-close') ? prev : null) || root).click();
}

export function settleSheet(g, dy, v) {
  const call = sheetDecision({ dy, v, height: g.height });
  last = { dy: Math.round(dy), v: Math.round(v * 1000) / 1000, height: Math.round(g.height), call, at: Date.now() };
  if (call !== 'dismiss') {
    if (reduced()) { teardown(g); emit(g.panel, 0, g.height, 'return'); return call; }
    animateTo(g, dy, 0, v, { response: 0.38, dampingRatio: 0.86 }, () => teardown(g));
    return call;
  }
  // the keyboard goes down WITH the sheet: blur first, so iOS starts lowering
  // it on this frame rather than after the sheet has gone
  const focused = document.activeElement;
  if (focused && g.panel.contains(focused) && typeof focused.blur === 'function') focused.blur();
  g.root.setAttribute('data-sheet-gone', '');
  const finish = () => {
    closeThrough(g.root);
    const t0 = Date.now();
    const check = () => {
      if (!g.root.isConnected) { live.delete(g.panel); return; }
      // a sheet that stays mounted and is now closed (Journal, Ambient: they
      // hide with aria-hidden/inert) goes back to its own closed style
      if (g.root.getAttribute('aria-hidden') === 'true' || g.root.hasAttribute('inert')) {
        g.root.removeAttribute('data-sheet-gone'); teardown(g); return;
      }
      if (Date.now() - t0 < 700) { window.setTimeout(check, 80); return; }
      // a close it refused (busy) brings it back rather than leaving an
      // invisible sheet over the app
      g.root.removeAttribute('data-sheet-gone');
      const y = presentationY(g.panel);
      for (const a of g.anims) a.cancel();
      g.anims = [];
      animateTo(g, y, 0, 0, { response: 0.38, dampingRatio: 0.86 }, () => teardown(g));
    };
    window.setTimeout(check, 60);
  };
  if (reduced()) {
    // no travel: a short fade instead
    const a = g.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' });
    g.anims.push(a);
    if (g.scrim) g.anims.push(g.scrim.animate([{ opacity: g.scrim.style.opacity || 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }));
    a.onfinish = finish;
    return call;
  }
  const off = Math.max(g.height, window.innerHeight - (g.panel.getBoundingClientRect().top - dy)) + 40;
  animateTo(g, dy, off, Math.max(v, 0.3), { response: 0.3, dampingRatio: 1 }, finish);
  return call;
}

/**
 * The body drag, for every sheet at once. Mount once (EdgeBack.jsx does).
 * Listens on window for the start and on the touched element itself for the
 * rest (a detached target bubbles to nothing: the edge-swipe lesson).
 */
export function installSheetDrag() {
  if (typeof window === 'undefined') return () => {};
  const s = { armed: false };

  const onStart = (e) => {
    const t = e.touches?.[0];
    if (!t || e.touches.length > 1) { s.armed = false; return; }
    if (t.clientX < EDGE_GUARD_PX) return;                      // the back swipe's
    if (Date.now() - grabAt < 400) return;                      // a grab zone's
    const target = e.target;
    if (target.closest?.('[data-sheet-grab], [data-no-sheet-drag], input[type="range"]')) return;
    const found = findSheet(target);
    if (!found) return;
    if (found.root.hasAttribute('data-sheet-gone')) return;
    const g0 = live.get(found.panel);
    Object.assign(s, {
      frozen: null, armed: true, id: t.identifier, ...found, dir: null, mode: 'wait',
      x0: t.clientX, y0: t.clientY, lastY: t.clientY, scroller: scrollerOf(target, found.panel),
      g: null, samples: [],
    });
    // a sheet that is mid-throw is caught by the touch itself
    if (g0) {
      s.g = begin(found.root, found.panel); s.mode = 'drag'; s.dir = 'v';
      s.y0 = t.clientY - s.g.base;
      s.samples = [{ t: performance.now(), v: t.clientY }];
    }
    follow(target);
  };

  const onMove = (e) => {
    if (!s.armed) return;
    const t = [...e.touches].find((x) => x.identifier === s.id);
    if (!t) return;
    const dx = t.clientX - s.x0;
    const dy = t.clientY - s.y0;
    const goingDown = t.clientY > s.lastY;
    s.lastY = t.clientY;
    if (!s.dir) {
      const d = decideDirection(dx, dy);
      // iOS commits to a native scroll on the first touchmove nobody claims,
      // and every move after that is uncancelable: a pull DOWN on a sheet
      // already at its top is claimed before the direction is even certain
      if (!d) {
        if (dy > 0 && Math.abs(dy) >= Math.abs(dx) && !(s.scroller && s.scroller.scrollTop > 0) && e.cancelable) e.preventDefault();
        return;
      }
      if (d === 'h') { s.armed = false; return; }
      s.dir = 'v';
      if (dy < 0) {
        // up: content scrolls; with nothing to scroll, the sheet rubber-bands
        if (s.scroller) { s.armed = false; return; }
        s.mode = 'arm';
      } else {
        s.mode = s.scroller && s.scroller.scrollTop > 0 ? 'scroll' : 'arm';
      }
    }
    if (s.mode === 'scroll') {
      // the handoff: the scroll reached the top and he is still pulling
      if (s.scroller.scrollTop <= 0 && goingDown) {
        s.mode = 'arm'; s.y0 = t.clientY;
        // a running native scroll cannot be preventDefault'ed; stopping the
        // scroller is what stops it bouncing under the moving sheet
        if (!e.cancelable) { s.frozen = [s.scroller, s.scroller.style.overflowY]; s.scroller.style.overflowY = 'hidden'; }
      } else return;
    }
    if (s.mode === 'arm') {
      s.g = begin(s.root, s.panel);
      s.y0 = t.clientY - (s.g.base || 0);
      s.mode = 'drag';
    }
    if (e.cancelable) e.preventDefault();
    const now = performance.now();
    s.samples.push({ t: now, v: t.clientY });
    if (s.samples.length > 12) s.samples.shift();
    paint(s.g, dragOffset(t.clientY - s.y0, s.g.height));
  };

  const onEnd = (e) => {
    if (!s.armed) return;
    s.armed = false;
    if (s.frozen) { s.frozen[0].style.overflowY = s.frozen[1]; s.frozen = null; }
    unfollow();
    if (s.mode !== 'drag' || !s.g) return;
    const t = [...(e.changedTouches || [])].find((x) => x.identifier === s.id);
    const now = performance.now();
    if (t) s.samples.push({ t: now, v: t.clientY });
    const lastY = s.samples.length ? s.samples[s.samples.length - 1].v : s.y0;
    const v = e.type === 'touchcancel' ? 0 : velocityFrom(s.samples, now);
    const dy = dragOffset(lastY - s.y0, s.g.height);
    if (e.type === 'touchcancel') { settleSheet(s.g, Math.min(dy, 0), 0); return; }
    settleSheet(s.g, dy, v);
  };

  let followed = null;
  const follow = (el) => {
    unfollow();
    followed = el;
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
  };
  const unfollow = () => {
    if (!followed) return;
    followed.removeEventListener('touchmove', onMove);
    followed.removeEventListener('touchend', onEnd);
    followed.removeEventListener('touchcancel', onEnd);
    followed = null;
  };

  window.addEventListener('touchstart', onStart, { passive: true });
  return () => { window.removeEventListener('touchstart', onStart); unfollow(); };
}

export function useSheetDragAll() {
  useEffect(() => installSheetDrag(), []);
}

// ─────────────────────── the keyboard, held above ─────────────────────
// iOS keeps a fixed element on the LAYOUT viewport, so a bottom-pinned bar
// sits behind the keyboard. The visual viewport says how much it took; this
// publishes it as --nv-kb on <html> for any bar to stand on.
export function keyboardInset(innerHeight, vvHeight, vvOffsetTop) {
  const v = Math.round(innerHeight - vvHeight - vvOffsetTop);
  return v > 40 ? v : 0;          // under 40px is browser chrome, not a keyboard
}

export function installKeyboardInset() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};
  const on = () => document.documentElement.style.setProperty('--nv-kb', `${keyboardInset(window.innerHeight, vv.height, vv.offsetTop)}px`);
  on();
  vv.addEventListener('resize', on);
  vv.addEventListener('scroll', on);
  return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
}
