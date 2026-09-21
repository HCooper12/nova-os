// THE BACK SWIPE THE GUTTER WAS ALREADY RESERVED FOR.
//
// 19 Sep 2026, from a reel on Jakob's Law: "swiping from the left edge goes
// back" is one of the handful of gestures a person has already learned in
// every other app, and an app that does not honour it makes them learn it.
//
// Nova reserved the space for it a fortnight ago and never built it.
// swipeCore.js has EDGE_GUARD_PX = 24 and startsInEdgeGuard(), and every
// swipeable row in the app refuses to start a gesture there — the comment
// says "a gesture starting in the OS back-swipe gutter is never ours". True
// in a browser tab. But Nova's manifest is `display: 'standalone'`, and an
// installed PWA has no browser chrome, no back button and NO EDGE SWIPE. The
// gutter was being kept clear for a gesture the OS had stopped providing.
//
// Everything needed was already here: navigate() pushes a real history entry
// (pushState, so popstate re-derives the screen), so `back` is a one-line
// action with no new navigation model. This is only the finger that calls it.
//
// IT IS OFF IN A BROWSER. There the OS/browser still owns the edge, and two
// handlers on one gesture would go back twice.

import { useEffect, useRef } from 'react';
import { EDGE_GUARD_PX, decideDirection } from './swipeCore.js';
import { haptic } from './haptics.js';

// How far across before it commits. iOS commits at roughly a third of the
// screen; on a 375px phone that is ~125px, which is a long way for a gesture
// he makes constantly. 88px is past any accidental brush and still one flick.
export const COMMIT_PX = 88;
// ...or a fast flick that never travelled that far.
export const FLICK_PX_PER_MS = 0.5;
// WHAT THE LAST SWIPE ACTUALLY DID. Settings reads this.
//
// The first cut of this gesture shipped "verified" on synthetic touch events
// and did not work on his phone, and there was no way to find out why except
// to guess — the same hole that kept dictation broken for four days until the
// turn receipts were read by device. So the gesture now leaves a receipt:
// where it started, how far it got, and what it decided. One tap in Settings
// turns "swipe back is not working" into a number.
let last = null;
export function lastEdgeGesture() { return last; }
export function _resetEdgeGesture() { last = null; }

// A real installed app, not a tab. matchMedia is the standard signal;
// navigator.standalone is the older iOS one and is still what a Home Screen
// PWA reports on some versions.
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.navigator.standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches;
  } catch { return false; }
}

// IS THERE ANYWHERE TO GO BACK TO? Depth rides on the history entry itself
// (navigate stamps it), so it is exact, survives a reload, and needs no
// listener trying to guess which direction a popstate went. At depth 0 he is
// on the entry the app booted with: going back would leave Nova entirely,
// which is not what the gesture means.
export function depthOf(state) {
  const d = state && typeof state === 'object' ? state.novaDepth : null;
  return Number.isFinite(d) ? d : 0;
}

export function canGoBack(state) {
  return depthOf(state) > 0;
}

// The gesture, as arithmetic.
//
// 22 SEP — HIS REPORT: "Swipe back is not working." The first cut passed a
// clean synthetic drag and failed a thumb, in three ways that a straight line
// of touch events cannot produce:
//
//   1. `if (dx < 0) return 'cancel'` — ONE pixel of leftward jitter at the
//      start killed the gesture for good. A finger landing on glass always
//      wobbles; my test never did.
//   2. The vertical test re-ran on EVERY move, so a gesture that had plainly
//      been horizontal for 80px could still be cancelled by the upward ARC a
//      thumb makes as it travels right. Thumbs pivot; test data does not.
//   3. There was no direction LOCK at all. Every other gesture in this app
//      locks once via decideDirection() and never re-questions it — that rule
//      (INTENT_PX 12, HORIZONTAL_BIAS 1.5) is tuned and proven on his device,
//      and inventing a private one here was the mistake underneath the other
//      two.
//
// So: before the lock, the app's own rule decides. After it, only distance
// and speed matter, and nothing can take the gesture away.
export function edgeDecision({ startX, dx, dy, dt, locked = false }) {
  if (startX >= EDGE_GUARD_PX) return 'none';          // not from the gutter

  if (!locked) {
    const dir = decideDirection(dx, dy);
    if (dir === 'v') return 'cancel';                   // he is scrolling
    if (dir !== 'h') return 'waiting';                  // not enough to tell yet
    if (dx < 0) return 'cancel';                        // locked horizontal, but leftward
    return 'lock';
  }

  // LOCKED. A finger that wanders back toward the edge is undoing the drag,
  // not cancelling it — the page follows it home and only a release decides.
  const flick = dt > 0 && dx / dt >= FLICK_PX_PER_MS;
  if (dx >= COMMIT_PX || (flick && dx > EDGE_GUARD_PX)) return 'commit';
  return 'tracking';
}

// How far the page has actually moved for a given drag — damped, so the sheet
// never outruns the finger and the gesture reads as weight rather than as a
// slide. Matches the resistance curve the rest of the app's sheets use.
export function pageOffset(dx) {
  if (dx <= 0) return 0;
  return Math.round(dx * 0.62);
}

// `getEl` returns the element to slide; `onBack` is what commit calls.
export function useEdgeBack({ getEl, onBack, enabled = true }) {
  const s = useRef({ armed: false, id: null, startX: 0, startY: 0, startT: 0, dir: null }).current;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    // a browser tab already has this gesture; doubling it goes back twice
    if (!isStandalone()) return undefined;

    const paint = (px, animate) => {
      const el = getEl?.();
      if (!el) return;
      el.style.transition = animate ? 'transform .26s cubic-bezier(.32,.72,0,1)' : '';
      el.style.transform = px ? `translate3d(${px}px,0,0)` : '';
      if (animate) setTimeout(() => { const e2 = getEl?.(); if (e2) e2.style.transition = ''; }, 280);
    };

    const reset = (animate = true) => {
      s.armed = false; s.id = null; s.dir = null;
      paint(0, animate);
    };

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t || e.touches.length > 1) return;
      if (t.clientX >= EDGE_GUARD_PX) return;
      if (!canGoBack(window.history.state)) return;   // nowhere to go — leave the gesture alone
      s.armed = true; s.id = t.identifier; s.dir = null;
      s.startX = t.clientX; s.startY = t.clientY; s.startT = performance.now();
    };

    const onMove = (e) => {
      if (!s.armed) return;
      const t = [...e.touches].find((x) => x.identifier === s.id);
      if (!t) return;
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      const call = edgeDecision({
        startX: s.startX, dx, dy, dt: performance.now() - s.startT, locked: s.dir === 'h',
      });
      last = { startX: Math.round(s.startX), dx: Math.round(dx), dy: Math.round(dy), call, at: Date.now() };
      if (call === 'cancel' || call === 'none') { reset(); return; }
      if (call === 'waiting') return;            // still deciding — touch nothing yet
      s.dir = 'h';
      // Own the gesture now the direction is settled, or Safari pans the page
      // under the finger while the page is also sliding.
      if (e.cancelable) e.preventDefault();
      paint(pageOffset(dx), false);
    };

    const onEnd = (e) => {
      if (!s.armed) return;
      const t = [...(e.changedTouches || [])].find((x) => x.identifier === s.id);
      const dx = t ? t.clientX - s.startX : 0;
      const dy = t ? t.clientY - s.startY : 0;
      const call = edgeDecision({
        startX: s.startX, dx, dy, dt: performance.now() - s.startT, locked: s.dir === 'h',
      });
      last = { startX: Math.round(s.startX), dx: Math.round(dx), dy: Math.round(dy), call, at: Date.now(), end: true };
      if (call === 'commit') {
        s.armed = false; s.id = null;
        // the page leaves the way the finger was going, then the screen
        // behind it is already there — popstate has re-derived it by the
        // time the transform is cleared
        haptic('tick');
        paint(0, true);
        onBack?.();
        return;
      }
      reset();
    };

    // passive start, NON-passive move: preventDefault is the whole point once
    // the direction is locked
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', () => reset(false), { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      reset(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
