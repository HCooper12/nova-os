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

// HOW FAR BEFORE IT COMMITS — his call, 22 Sep, after using it: "Should only
// swipe back if the whole page is swiped too (about over half way across the
// screen), not just a small swipe as this could be accidentally triggered."
// 88px on a 375px phone was under a quarter, and he was triggering it by
// accident. Half the VIEWPORT, measured at gesture time, so it is the same
// fraction of whatever screen he is holding.
export const COMMIT_FRACTION = 0.5;
export function commitDistance(width) {
  return Math.max(120, Math.round((width || 375) * COMMIT_FRACTION));
}
// A flick still counts, but it has to be a real one AND have covered a third
// of the way — the accidental trigger he reported was a fast short brush.
export const FLICK_PX_PER_MS = 0.9;
export const FLICK_MIN_FRACTION = 0.33;

// ONE PAGE PER GESTURE. "Should only swipe back to the previous page." A
// second commit inside this window is the same thumb, not a second intention.
export const COMMIT_COOLDOWN_MS = 600;
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
export function edgeDecision({ startX, dx, dy, dt, width = 375, locked = false }) {
  if (startX >= EDGE_GUARD_PX) return 'none';          // not from the gutter

  if (!locked) {
    const dir = decideDirection(dx, dy);
    if (dir === 'v') return 'cancel';                   // he is scrolling
    if (dir !== 'h') return 'waiting';                  // not enough to tell yet
    if (dx < 0) return 'cancel';                        // locked horizontal, but leftward
    return 'lock';
  }

  // LOCKED. A finger that wanders back toward the edge is undoing the drag,
  // not cancelling it — only a release decides.
  const need = commitDistance(width);
  const flick = dt > 0 && dx / dt >= FLICK_PX_PER_MS;
  if (dx >= need || (flick && dx >= need * FLICK_MIN_FRACTION)) return 'commit';
  return 'tracking';
}

// HOW FAR THROUGH THE GESTURE HE IS, 0..1 — not a page offset any more.
//
// 22 SEP, from his screen recording: the first cut put a `transform` on
// <main>, and a transformed ancestor re-anchors every position:fixed
// descendant inside it. So mid-drag the recipe overlay stopped being pinned
// to the viewport and landed on top of the list underneath — three screens'
// text painted over each other, which is what he filmed. The page is NEVER
// transformed now; the affordance is a fixed element of this hook's own,
// outside the layout it would otherwise break.
export function dragProgress(dx, width) {
  if (dx <= 0) return 0;
  return Math.min(1, dx / commitDistance(width));
}

// `onBack` is what a commit calls. NOTHING in the app's own layout is touched
// — see dragProgress for the position:fixed fault that cost him a filmed bug.
export function useEdgeBack({ onBack, enabled = true }) {
  const s = useRef({ armed: false, id: null, startX: 0, startY: 0, startT: 0, dir: null, lastCommit: 0 }).current;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    // a browser tab already has this gesture; doubling it goes back twice
    if (!isStandalone()) return undefined;

    // THE AFFORDANCE, and it is ours alone: a fixed sliver at the left edge
    // that deepens as he pulls. Fixed to the viewport and appended to <body>,
    // so it can never become a containing block for anything of Nova's.
    const peel = document.createElement('div');
    peel.setAttribute('aria-hidden', 'true');
    peel.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'bottom:0', 'width:0',
      'pointer-events:none', 'z-index:200', 'opacity:0',
      'background:linear-gradient(90deg, color-mix(in srgb, var(--nv-acc) 26%, transparent), transparent)',
      'border-left:2px solid var(--nv-acc)',
      'will-change:width,opacity',
    ].join(';');
    document.body.appendChild(peel);

    const paint = (progress, animate) => {
      peel.style.transition = animate ? 'width .22s cubic-bezier(.32,.72,0,1), opacity .22s ease' : '';
      // it reaches a quarter of the screen at full pull — enough to feel the
      // gesture arriving, never enough to look like a second page
      peel.style.width = progress ? `${Math.round(progress * window.innerWidth * 0.25)}px` : '0px';
      peel.style.opacity = progress ? String(0.35 + progress * 0.65) : '0';
    };

    const reset = (animate = true) => {
      s.armed = false; s.id = null; s.dir = null;
      paint(0, animate);
    };

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t || e.touches.length > 1) return;
      if (t.clientX >= EDGE_GUARD_PX) return;
      if (!canGoBack(window.history.state)) return;   // nowhere to go
      if (Date.now() - s.lastCommit < COMMIT_COOLDOWN_MS) return;  // one page per thumb
      s.armed = true; s.id = t.identifier; s.dir = null;
      s.startX = t.clientX; s.startY = t.clientY; s.startT = performance.now();
    };

    const onMove = (e) => {
      if (!s.armed) return;
      const t = [...e.touches].find((x) => x.identifier === s.id);
      if (!t) return;
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;

      // CLAIM IT EARLY. His report: it "wasn't working properly when trying to
      // swipe back from the food carousels". A horizontal scroller starts
      // moving on the first few pixels, long before the formal 12px direction
      // lock — so by the time we called preventDefault the carousel already
      // owned the touch. Any horizontal dominance inside the gutter is ours.
      if (Math.abs(dx) > Math.abs(dy) && e.cancelable) e.preventDefault();

      const call = edgeDecision({
        startX: s.startX, dx, dy, dt: performance.now() - s.startT,
        width: window.innerWidth, locked: s.dir === 'h',
      });
      last = { startX: Math.round(s.startX), dx: Math.round(dx), dy: Math.round(dy), call, at: Date.now() };
      if (call === 'cancel' || call === 'none') { reset(); return; }
      if (call === 'waiting') return;
      s.dir = 'h';
      paint(dragProgress(dx, window.innerWidth), false);
    };

    const onEnd = (e) => {
      if (!s.armed) return;
      const t = [...(e.changedTouches || [])].find((x) => x.identifier === s.id);
      const dx = t ? t.clientX - s.startX : 0;
      const dy = t ? t.clientY - s.startY : 0;
      const call = edgeDecision({
        startX: s.startX, dx, dy, dt: performance.now() - s.startT,
        width: window.innerWidth, locked: s.dir === 'h',
      });
      last = { startX: Math.round(s.startX), dx: Math.round(dx), dy: Math.round(dy), call, at: Date.now(), end: true };
      if (call === 'commit') {
        s.armed = false; s.id = null; s.lastCommit = Date.now();
        // CLEARED INSTANTLY, before the navigation. Animating the affordance
        // out WHILE the next screen renders is what overlapped his screens:
        // the old paint was still running over the new one.
        paint(0, false);
        haptic('tick');
        onBack?.();
        return;
      }
      reset();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    const onCancel = () => reset(false);
    window.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
      peel.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
