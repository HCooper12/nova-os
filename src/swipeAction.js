import { useRef } from 'react';
import { haptic } from './haptics.js';
import { decideDirection, shouldCommit, shouldPage, startsInEdgeGuard, COMMIT_FRACTION } from './swipeCore.js';

// SWIPE ACTIONS — the iOS list grammar: drag a row sideways to act on it.
// Additive only; every swipeable row keeps its buttons, so desktop, keyboard
// and screen readers are untouched.
//
// THE SAFETY PROPERTY THAT MATTERS: scrolling must never commit an action.
// These rows live in long scrolling lists and one of the actions is DISCARD
// — an accidental commit loses a captured thought. So the gesture direction
// is LOCKED on first meaningful movement: if vertical wins, swipe is dead
// for the rest of that gesture and can never re-arm, no matter how far the
// finger later drifts sideways. There is no threshold-tuning that makes an
// unlocked implementation safe; the lock is the mechanism.
//
// Performance: the drag is applied IMPERATIVELY to the DOM (transform on the
// row, opacity on the underlay), never through React state — a 60fps drag
// through setState would re-render the list on every frame, which is the
// exact cost the rest of this sweep removed. Same philosophy as audioLevel.js
// reading the meter imperatively so a speaking Nova costs zero re-renders.
//
// State lives in a ref, not a closure: Interactive re-renders on pointerdown
// (its pressed state), and closure-held gesture state would be orphaned by
// that re-render mid-drag — the same trap documented in longPress.js.

// Thresholds and the direction/commit decisions live in swipeCore.js as pure
// functions, so the "a scroll can never commit" property carries a permanent
// Node test rather than only a browser check.
const MAX_TRAVEL = 0.6; // rubber-band ceiling, as a fraction of row width

export function useSwipeAction({ onRight, onLeft } = {}) {
  const rowRef = useRef(null);
  const underlayRef = useRef(null);
  const s = useRef({ dir: null, startX: 0, startY: 0, startT: 0, dx: 0, active: false, id: null }).current;

  if (!onRight && !onLeft) return { ref: rowRef, underlayRef, handlers: {}, enabled: false };

  const paint = (dx) => {
    if (rowRef.current) rowRef.current.style.transform = `translate3d(${dx}px,0,0)`;
    if (underlayRef.current) {
      const w = rowRef.current?.offsetWidth || 1;
      underlayRef.current.style.opacity = String(Math.min(1, Math.abs(dx) / (w * COMMIT_FRACTION)));
      underlayRef.current.dataset.dir = dx > 0 ? 'right' : 'left';
    }
  };

  const settle = (animate = true) => {
    if (rowRef.current) {
      rowRef.current.style.transition = animate ? 'transform .22s cubic-bezier(.32,.72,0,1)' : '';
      rowRef.current.style.transform = 'translate3d(0,0,0)';
      if (animate) setTimeout(() => { if (rowRef.current) rowRef.current.style.transition = ''; }, 240);
    }
    if (underlayRef.current) underlayRef.current.style.opacity = '0';
  };

  const reset = () => { s.dir = null; s.active = false; s.dx = 0; s.id = null; };

  return {
    ref: rowRef,
    underlayRef,
    enabled: true,
    handlers: {
      onPointerDown: (e) => {
        if (e.button != null && e.button !== 0) return;
        // never start a row swipe in the OS back-swipe gutter
        if (startsInEdgeGuard(e.clientX)) { reset(); return; }
        s.dir = null; s.active = true; s.dx = 0; s.id = e.pointerId;
        s.startX = e.clientX; s.startY = e.clientY; s.startT = performance.now();
        if (rowRef.current) rowRef.current.style.transition = '';
      },
      onPointerMove: (e) => {
        if (!s.active || e.pointerId !== s.id) return;
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        // DIRECTION LOCK — decided once, never revisited for this gesture
        if (s.dir === null) {
          const decided = decideDirection(dx, dy);
          if (!decided) return;          // not enough movement to tell yet
          s.dir = decided;               // locked for the rest of this gesture
          if (decided === 'h') {
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not critical */ }
          } else {
            return;
          }
        }
        if (s.dir !== 'h') return; // vertical: this gesture can never swipe
        // ignore a direction with no action wired to it
        if ((dx > 0 && !onRight) || (dx < 0 && !onLeft)) { s.dx = 0; paint(0); return; }
        const w = rowRef.current?.offsetWidth || 1;
        const cap = w * MAX_TRAVEL;
        // rubber-band: past the cap, further pull yields diminishing travel
        const eased = Math.abs(dx) <= cap ? dx : Math.sign(dx) * (cap + (Math.abs(dx) - cap) * 0.25);
        s.dx = eased;
        paint(eased);
        if (e.cancelable) e.preventDefault(); // we own this gesture now
      },
      onPointerUp: (e) => {
        if (!s.active || e.pointerId !== s.id) return;
        const dx = s.dx;
        const commit = shouldCommit({
          dir: s.dir,
          dx,
          rowWidth: rowRef.current?.offsetWidth || 1,
          elapsedMs: performance.now() - s.startT,
          hasRight: !!onRight,
          hasLeft: !!onLeft,
        });
        reset();
        settle();
        if (commit) {
          haptic('threshold');
          (dx > 0 ? onRight : onLeft)();
        }
      },
      onPointerCancel: () => { reset(); settle(); },
      onLostPointerCapture: () => { reset(); settle(false); },
    },
  };
}

// PAGING BETWEEN A MEAL SLOT'S OPTIONS (7 Sep 2026).
//
// The rotation strip scrolls horizontally, so for months the rule here was
// "no swipe on these cards" — a sideways drag would fight the scroll on the
// same axis, and the direction lock cannot separate two horizontal gestures.
// What resolves it is not a smarter threshold but a smaller ZONE: only the
// focused-dish header of a card that actually HAS several options takes the
// gesture, and it declares `touch-action: pan-y` so the browser never starts
// a scroll there. Everywhere else on the strip — single-option cards, the
// option rows, the add-meal card, the gaps — still pans normally, so the
// strip stays scrollable with a finger.
//
// Paging is also not a commit: it changes which option today's macros count,
// it is visible immediately, and swiping back undoes it. Hence shouldPage's
// lower distance bar — and the identical direction lock.
export function useOptionPager({ onNext, onPrev, enabled = true } = {}) {
  const zoneRef = useRef(null);
  const s = useRef({ dir: null, startX: 0, startY: 0, startT: 0, dx: 0, active: false, id: null }).current;

  if (!enabled || (!onNext && !onPrev)) return { ref: zoneRef, handlers: {}, enabled: false };

  const paint = (dx) => {
    if (zoneRef.current) zoneRef.current.style.transform = `translate3d(${dx * 0.35}px,0,0)`;
  };
  const settle = () => {
    if (!zoneRef.current) return;
    zoneRef.current.style.transition = 'transform .2s cubic-bezier(.32,.72,0,1)';
    zoneRef.current.style.transform = 'translate3d(0,0,0)';
    setTimeout(() => { if (zoneRef.current) zoneRef.current.style.transition = ''; }, 220);
  };
  const reset = () => { s.dir = null; s.active = false; s.dx = 0; s.id = null; };

  return {
    ref: zoneRef,
    enabled: true,
    handlers: {
      onPointerDown: (e) => {
        if (e.button != null && e.button !== 0) return;
        if (startsInEdgeGuard(e.clientX)) { reset(); return; }
        s.dir = null; s.active = true; s.dx = 0; s.id = e.pointerId;
        s.startX = e.clientX; s.startY = e.clientY; s.startT = performance.now();
        if (zoneRef.current) zoneRef.current.style.transition = '';
      },
      onPointerMove: (e) => {
        if (!s.active || e.pointerId !== s.id) return;
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        if (!s.dir) {
          const dir = decideDirection(dx, dy);
          if (!dir) return;
          s.dir = dir;
          // a vertical verdict is final: this gesture is the page's scroll
          if (dir === 'v') { s.active = false; return; }
        }
        if (s.dir !== 'h') return;
        s.dx = dx;
        paint(dx);
      },
      onPointerUp: (e) => {
        if (!s.active || e.pointerId !== s.id) { reset(); return; }
        const elapsedMs = performance.now() - s.startT;
        const paged = shouldPage({ dir: s.dir, dx: s.dx, elapsedMs });
        if (paged) {
          haptic('light');
          // drag left → the next option, like every carousel he has ever used
          (s.dx < 0 ? onNext : onPrev)?.();
        }
        settle();
        reset();
      },
      onPointerCancel: () => { settle(); reset(); },
    },
  };
}
