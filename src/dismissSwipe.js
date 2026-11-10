// FLICK IT AWAY — the iOS notification gesture, for Nova's floating layers.
//
// His ask, 22 Sep 2026: "update both the visuals and the interactive of
// notifications within the Nova app so that I can also swipe them away
// smoothly and with dynamic animation just like how notifications in iOS
// operate."
//
// What iOS actually does, and what this copies: the card follows the finger
// 1:1, fades as it goes, and the release decides. Past a threshold — or a
// fling that never got there — it carries on in the direction it was already
// travelling and is gone. Short of it, it springs back. Nothing snaps.
//
// THE LESSONS FROM THE BACK SWIPE ARE ALREADY APPLIED HERE, because they cost
// four attempts to learn:
//   - the direction locks ONCE, via the app's own decideDirection(), and is
//     never re-questioned. A finger jitters; a thumb arcs. Re-deciding
//     mid-gesture is how a drag dies under a real hand.
//   - only transform and opacity move, so it composites.
//   - it never starts in the back-swipe gutter, which belongs to edgeBack.
//   - nothing in the app's own layout is transformed.

import { useRef } from 'react';
import { decideDirection, startsInEdgeGuard } from './swipeCore.js';
import { velocityFrom, rubberband } from './sheetPhysics.js';
import { settleTo, catchSettle, liveOffset } from './settleSpring.js';

// A share of the card's own width, so a narrow phone and a wide desktop ask
// for the same GESTURE rather than the same number of pixels.
export const DISMISS_FRACTION = 0.3;
// ...or a fling: fast, and past a distance that a brush cannot reach.
export const FLING_PX_PER_MS = 0.6;
export const FLING_MIN_PX = 44;
// Up is a dismiss too — it is how the notification stack is cleared on iOS.
export const UP_DISMISS_PX = 56;

export function dismissDistance(width) {
  return Math.max(64, Math.round((width || 360) * DISMISS_FRACTION));
}

// `locked` is the axis already decided: 'h', 'v', or null while still unsure.
export function dismissDecision({ dx, dy, dt, width = 360, locked = null }) {
  if (!locked) {
    const dir = decideDirection(dx, dy);
    if (!dir) return 'waiting';
    // downward is a scroll, not a dismiss — the page below has to keep it
    if (dir === 'v' && dy > 0) return 'cancel';
    return dir === 'v' ? 'lock-v' : 'lock-h';
  }

  if (locked === 'v') {
    if (dy <= -UP_DISMISS_PX) return 'dismiss';
    const fling = dt > 0 && -dy / dt >= FLING_PX_PER_MS;
    if (fling && dy < -FLING_MIN_PX) return 'dismiss';
    return 'tracking';
  }

  const need = dismissDistance(width);
  const fling = dt > 0 && Math.abs(dx) / dt >= FLING_PX_PER_MS;
  if (Math.abs(dx) >= need) return 'dismiss';
  if (fling && Math.abs(dx) >= FLING_MIN_PX) return 'dismiss';
  return 'tracking';
}

// What the card looks like part-way through. Opacity falls off more slowly
// than the travel so it is still legible while he is deciding — a card that
// vanishes at a third of the way reads as a bug, not as a gesture.
export function dismissStyle(dx, dy, locked, width = 360) {
  const need = dismissDistance(width);
  if (locked === 'v') {
    const p = Math.min(1, Math.max(0, -dy) / UP_DISMISS_PX);
    // pulled DOWN, the wrong way for a dismiss: it gives a little and resists
    // (the reel's rubber band, his yes 10 Nov 2026) rather than sitting dead
    const y = dy > 0 ? rubberband(dy, UP_DISMISS_PX) : dy;
    return { x: 0, y, opacity: 1 - p * 0.75 };
  }
  const p = Math.min(1, Math.abs(dx) / need);
  return { x: dx, y: 0, opacity: 1 - p * 0.55 };
}

// Where it flies to on release, so it leaves in the direction it was going
// rather than jumping to a side it was never heading for.
export function exitOffset(dx, dy, locked, width = 360) {
  if (locked === 'v') return { x: 0, y: -Math.max(160, (width || 360) * 0.5) };
  return { x: dx >= 0 ? (width || 360) + 80 : -((width || 360) + 80), y: 0 };
}

const reduced = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Handlers for a dismissible floating card. `onDismiss` is called once the
 * exit animation has run — or immediately under reduced motion, where the
 * card has no business sliding anywhere.
 */
export function useDismissSwipe({ onDismiss, enabled = true }) {
  const ref = useRef(null);
  const s = useRef({ id: null, x0: 0, y0: 0, t0: 0, locked: null, gone: false, samples: [] }).current;

  const paint = (style, animate) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate
      ? 'transform .28s cubic-bezier(.32,.72,0,1), opacity .28s ease'
      : '';
    el.style.transform = `translate3d(${style.x}px,${style.y}px,0)`;
    el.style.opacity = String(style.opacity);
  };

  const reset = () => { s.id = null; s.locked = null; };

  // SHORT OF IT, IT SPRINGS BACK at the speed the finger let go with
  // (settleSpring.js): only the axis it was locked to moved, so only that
  // one springs. The fade comes back on the old transition, and the card
  // rests with the styles the old return left it in.
  const back = (e) => {
    const el = ref.current;
    const locked = s.locked;
    reset();
    if (!el) return;
    const axis = locked === 'v' ? 'y' : 'x';
    const from = liveOffset(el, axis);
    if (reduced() || !from) { paint({ x: 0, y: 0, opacity: 1 }, !reduced()); return; }
    const now = performance.now();
    if (e && e.clientX != null) s.samples.push({ t: now, x: e.clientX, y: e.clientY });
    const v = velocityFrom(s.samples.map((p) => ({ t: p.t, v: axis === 'y' ? p.y : p.x })), now);
    el.style.transition = 'opacity .28s ease';
    el.style.opacity = '1';
    settleTo(el, {
      axis, from, to: 0, velocity: v, dampingRatio: 0.86,
      onRest: () => paint({ x: 0, y: 0, opacity: 1 }, true),
    });
  };

  const settle = (dx, dy) => {
    const el = ref.current;
    const w = el?.offsetWidth || 360;
    const exit = exitOffset(dx, dy, s.locked, w);
    reset();
    if (reduced()) { s.gone = true; onDismiss?.(); return; }
    paint({ ...exit, opacity: 0 }, true);
    s.gone = true;
    window.setTimeout(() => onDismiss?.(), 280);
  };

  if (!enabled || !onDismiss) return { ref, handlers: {}, enabled: false };

  return {
    ref,
    enabled: true,
    handlers: {
      onPointerDown: (e) => {
        if (s.gone) return;
        if (e.button != null && e.button !== 0) return;
        // the back-swipe gutter is never ours (swipeCore.startsInEdgeGuard)
        if (startsInEdgeGuard(e.clientX)) return;
        s.id = e.pointerId; s.locked = null;
        s.x0 = e.clientX; s.y0 = e.clientY; s.t0 = performance.now();
        s.samples = [{ t: s.t0, x: e.clientX, y: e.clientY }];
        const el = ref.current;
        // a finger landing on a card still springing back takes it where it
        // IS: the drag carries on from that offset rather than jumping home
        const caught = catchSettle(el);
        if (caught) {
          if (caught.axis === 'y') s.y0 -= caught.p; else s.x0 -= caught.p;
        }
        if (el) el.style.transition = '';
      },
      onPointerMove: (e) => {
        if (s.id === null || e.pointerId !== s.id || s.gone) return;
        const dx = e.clientX - s.x0;
        const dy = e.clientY - s.y0;
        s.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
        if (s.samples.length > 12) s.samples.shift();
        const w = ref.current?.offsetWidth || 360;
        const call = dismissDecision({ dx, dy, dt: performance.now() - s.t0, width: w, locked: s.locked });
        if (call === 'cancel') { back(null); return; }
        if (call === 'waiting') return;
        if (call === 'lock-h') s.locked = 'h';
        if (call === 'lock-v') s.locked = 'v';
        if (e.currentTarget.setPointerCapture) {
          try { e.currentTarget.setPointerCapture(s.id); } catch { /* already captured */ }
        }
        paint(dismissStyle(dx, dy, s.locked, w), false);
      },
      onPointerUp: (e) => {
        if (s.id === null || e.pointerId !== s.id || s.gone) return;
        const dx = e.clientX - s.x0;
        const dy = e.clientY - s.y0;
        const w = ref.current?.offsetWidth || 360;
        const call = dismissDecision({ dx, dy, dt: performance.now() - s.t0, width: w, locked: s.locked });
        if (call === 'dismiss') { settle(dx, dy); return; }
        back(e);
      },
      onPointerCancel: () => back(null),
    },
  };
}
