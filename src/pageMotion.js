// A CARD OPENS INTO ITS PAGE (mockup 101's motion list, his call 13 Oct 2026:
// "Opening a live session, the card grows into the session sounds good so
// it's more unique and Apple fitness like"; "Include all of your proposed
// animation and usability changes").
//
// Two moves on the settingsNav.js machinery (the frozen copy of the page
// being left, the live <main> as the page arriving):
//
//   GROW   the live page opens out of the card he tapped: <main> is clipped
//          to the card's rectangle and its corners, and the clip springs open
//          to the whole screen while the page he left recedes and fades.
//   SHRINK the reverse, for leaving a session: the frozen session closes down
//          onto the card it came from and fades into it.
//
// Clip-path and opacity only (no transform on <main>: a session holds fixed
// bars, and a transform would make <main> their containing block). Under
// reduced motion (and Nova's Calm) both are a cross-fade. DOM work only; App.jsx
// decides when.

import { snapshot, reducedMotion, mainEl, finishRunning } from './settingsNav.js';

const FALLBACK_EASE = 'cubic-bezier(.32,.72,0,1)';
export const GROW_MS = 560;
export const SHRINK_MS = 460;
const FADE_MS = 200;

// the house spring (--nv-spring-smooth, a CSS linear()), read once; WAAPI
// takes the same string where the browser knows linear()
let spring = null;
function smooth() {
  if (spring) return spring;
  let v = '';
  try { v = getComputedStyle(document.documentElement).getPropertyValue('--nv-spring-smooth').trim(); } catch { /* no CSS */ }
  spring = v && typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', v) ? v : FALLBACK_EASE;
  return spring;
}

// THE CARD HE TAPPED. Read on pointerdown, before any state changes, so the
// rectangle is the one he saw; good for a short while, so a later unrelated
// navigation never grows out of a stale card.
const CARD = '[data-grow], .nv-sum-card, .nv-pane';
let lastTap = null;
export function noteTap(e) {
  const el = e?.target?.closest?.(CARD);
  if (!el || el.closest('[data-sheet], [role="dialog"], nav, .nv-liquid-flush')) { lastTap = null; return; }
  const r = el.getBoundingClientRect();
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 18;
  lastTap = { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, radius, at: performance.now(), key: el.getAttribute('data-grow') || null };
}
export function takeTap(maxAge = 900) {
  const t = lastTap;
  lastTap = null;
  return t && performance.now() - t.at <= maxAge ? t : null;
}

// a viewport rectangle as an inset() on a box, with round corners
export function insetFor(rect, box, radius) {
  const top = Math.max(0, rect.top - box.top);
  const left = Math.max(0, rect.left - box.left);
  const right = Math.max(0, box.right - rect.right);
  const bottom = Math.max(0, box.bottom - rect.bottom);
  return `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round ${Math.round(radius)}px)`;
}

// the whole box with a rectangle cut out of it (even-odd), in the box's own
// coordinates; the same ten points every time, so two of them interpolate
export function holeFor(rect, box) {
  const W = box.right - box.left;
  const H = box.bottom - box.top;
  const l = Math.max(0, rect.left - box.left).toFixed(1);
  const t = Math.max(0, rect.top - box.top).toFixed(1);
  const r = Math.min(W, rect.right - box.left).toFixed(1);
  const b = Math.min(H, rect.bottom - box.top).toFixed(1);
  return `polygon(evenodd, 0px 0px, ${W}px 0px, ${W}px ${H}px, 0px ${H}px, 0px 0px, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`;
}

let running = null;
function stop() {
  if (!running) return;
  const r = running;
  running = null;
  r.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
  r.cleanup();
}
function track(anims, cleanup, lead) {
  running = { anims, cleanup };
  lead.finished.then(() => { if (running?.anims === anims) { running = null; cleanup(); } }).catch(() => {});
}
// reduced motion, or Nova's own Calm, and a card does not travel: it cross-fades
const quiet = () => reducedMotion() || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-nv-calm') === '1');
const drop = (snap) => { if (snap?.layer?.isConnected) snap.layer.remove(); };

// Take the picture of the page being left. Call BEFORE the state change.
export function freeze() {
  stop();
  finishRunning();
  return snapshot();
}

export function grow(snap, tap) {
  const main = mainEl();
  if (!snap || !main) { drop(snap); return; }
  const fade = () => {
    const anims = [
      snap.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease', fill: 'forwards' }),
      main.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease' }),
    ];
    track(anims, () => drop(snap), anims[0]);
  };
  if (quiet() || !tap) { fade(); return; }
  const box = main.getBoundingClientRect();
  const from = insetFor(tap.rect, box, tap.radius);
  const ease = smooth();
  const t = { duration: GROW_MS, easing: ease };
  const anims = [
    main.animate([{ clipPath: from, webkitClipPath: from }, { clipPath: 'inset(0px 0px 0px 0px round 0px)', webkitClipPath: 'inset(0px 0px 0px 0px round 0px)' }], t),
    // the page he left keeps a hole the shape of the opening window, in the
    // same easing, so inside it there is only the new page and outside it the
    // old one dims away (glass over glass would otherwise show both at once)
    snap.layer.animate([
      { clipPath: holeFor(tap.rect, snap.box), webkitClipPath: holeFor(tap.rect, snap.box), opacity: 1 },
      { clipPath: holeFor(snap.box, snap.box), webkitClipPath: holeFor(snap.box, snap.box), opacity: 0.2 },
    ], { ...t, fill: 'forwards' }),
  ];
  track(anims, () => drop(snap), anims[0]);
}

export function shrink(snap, target) {
  const main = mainEl();
  if (!snap || !main) { drop(snap); return; }
  const rect = target?.getBoundingClientRect?.();
  // a card scrolled out of sight is no place to land: cross-fade instead
  const seen = rect && rect.height >= 8 && rect.bottom > snap.box.top + 24 && rect.top < snap.box.bottom - 24;
  if (quiet() || !seen) {
    const anims = [
      snap.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease', fill: 'forwards' }),
      main.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease' }),
    ];
    track(anims, () => drop(snap), anims[0]);
    return;
  }
  const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 18;
  const to = insetFor(rect, snap.box, radius);
  const full = 'inset(0px 0px 0px 0px round 0px)';
  const anims = [
    snap.layer.animate([
      { clipPath: full, webkitClipPath: full, opacity: 1 },
      { clipPath: to, webkitClipPath: to, opacity: 0.7, offset: 0.6 },
      { clipPath: to, webkitClipPath: to, opacity: 0 },
    ], { duration: SHRINK_MS, easing: smooth(), fill: 'forwards' }),
    main.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: SHRINK_MS, easing: 'ease-out' }),
  ];
  track(anims, () => drop(snap), anims[0]);
}

// TAP THE TOP, BACK TO THE TOP: the status-bar gesture iOS gives every app
// but an installed web app never hears, put on Nova's own top bar.
export function scrollToTop() {
  const main = mainEl();
  if (!main || main.scrollTop <= 0) return false;
  try { main.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { main.scrollTop = 0; }
  return true;
}
