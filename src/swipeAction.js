import { useEffect, useRef } from 'react';
import { haptic } from './haptics.js';
import { decideDirection, shouldPage, startsInEdgeGuard } from './swipeCore.js';
import { velocityFrom } from './sheetPhysics.js';
import { trackOffset, fullCrossing, isFull, releaseSwipe, openOffset, openRows } from './swipeReveal.js';

// SWIPE ACTIONS — the iOS Mail grammar (3 Oct 2026; the rules themselves are
// src/swipeReveal.js, pinned by server/test/swipeReveal.test.js).
//
//   a partial swipe REVEALS the buttons and the row stays open on them;
//   a tap on a button commits it; a swipe past 60% of the row, or a flick
//   once the buttons are uncovered, commits the edge-most one with that
//   button stretched across; a tap on the row, a tap elsewhere, a scroll,
//   or another row opening closes it. One row is open at a time, house-wide.
//
// THE SAFETY PROPERTY THAT MATTERS: scrolling must never commit an action.
// These rows live in long scrolling lists and one of the actions is DISCARD
// — an accidental commit loses a captured thought. So the gesture direction
// is LOCKED on first meaningful movement: if vertical wins, swipe is dead
// for the rest of that gesture and can never re-arm, no matter how far the
// finger later drifts sideways. A vertical gesture on an open row CLOSES it.
//
// Performance: the drag is applied IMPERATIVELY to the DOM (one transform on
// the row and one width on the revealed buttons per move), never through
// React state — a 60fps drag through setState would re-render the list on
// every frame. State lives in a ref, not a closure: Interactive re-renders on
// pointerdown (its pressed state), and closure-held gesture state would be
// orphaned by that re-render mid-drag — the same trap documented in
// longPress.js.
//
// The OS back swipe owns the screen's left edge (edgeBack.js), so a gesture
// that starts in that gutter is never a row's.

const EASE = 'cubic-bezier(.32,.72,0,1)';   // --nv-ease
const SETTLE_MS = 260;
const COLLAPSE_MS = 250;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const list = (a) => (Array.isArray(a) ? a.filter(Boolean) : a ? [a] : []);

// `left`: the actions a LEFTWARD swipe reveals (trailing, at the row's right
// edge), edge-most first. `right`: the ones a rightward swipe reveals
// (leading). An action is { label, icon, tone, run, collapse?, full? }:
// `collapse` slides the row out and folds its height away before `run` (a
// delete); `full: false` keeps that side to reveal-and-tap only.
export function useSwipeAction({ left, right } = {}) {
  const wrapRef = useRef(null);
  const rowRef = useRef(null);
  const leadRef = useRef(null);
  const trailRef = useRef(null);
  const L = list(left);
  const R = list(right);
  const acts = useRef({ L, R });
  acts.current = { L, R };
  const s = useRef(null);
  if (!s.current) {
    s.current = {
      id: Symbol('swipe-row'), dir: null, startX: 0, startY: 0, base: 0, offset: 0, active: false,
      pid: null, samples: [], w: 1, open: null, dragged: false, busy: false, timers: [], off: null,
    };
  }
  const g = s.current;

  const later = (fn, ms) => { const t = setTimeout(fn, ms); g.timers.push(t); return t; };

  const paint = (offset) => {
    g.offset = offset;
    const row = rowRef.current;
    if (row) {
      row.style.transform = offset ? `translate3d(${offset}px,0,0)` : '';
      // a row off its rest position says so, for a row whose own surface is
      // see-through (a grouped list's): its CSS gives it a body while it
      // slides, so the buttons beneath never read through its words
      if (offset) row.dataset.swiping = 'true'; else delete row.dataset.swiping;
    }
    const full = isFull(offset, g.w);
    if (trailRef.current) {
      trailRef.current.style.width = `${Math.max(0, -offset)}px`;
      trailRef.current.dataset.full = offset < 0 && full ? 'true' : 'false';
    }
    if (leadRef.current) {
      leadRef.current.style.width = `${Math.max(0, offset)}px`;
      leadRef.current.dataset.full = offset > 0 && full ? 'true' : 'false';
    }
  };

  const transition = (ms) => {
    const t = ms ? `transform ${ms}ms ${EASE}` : '';
    const wt = ms ? `width ${ms}ms ${EASE}` : '';
    if (rowRef.current) rowRef.current.style.transition = t;
    if (trailRef.current) trailRef.current.style.transition = wt;
    if (leadRef.current) leadRef.current.style.transition = wt;
  };

  const animateTo = (offset, ms = SETTLE_MS) => {
    transition(ms);
    paint(offset);
    later(() => { if (!g.active) transition(0); }, ms + 20);
  };

  // ---- open / close ----------------------------------------------------
  const unlisten = () => { if (g.off) { g.off(); g.off = null; } };
  const close = (animate = true) => {
    unlisten();
    g.open = null;
    openRows.closed(g.id);
    if (animate) animateTo(0); else { transition(0); paint(0); }
  };
  const listen = () => {
    if (g.off || typeof document === 'undefined') return;
    // a tap anywhere else closes it (and is otherwise left alone)
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    // so does any scroll, the page's or a list's
    const onScroll = () => close();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    g.off = () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  };
  const openOn = (side) => {
    const count = side === 'left' ? acts.current.L.length : acts.current.R.length;
    g.open = side;
    openRows.open(g.id, () => close());
    listen();
    animateTo(openOffset(side, count));
  };

  // ---- commit ----------------------------------------------------------
  // A collapsing action (a delete) acts its removal out: the row slides off
  // under the stretched button and its height folds away, THEN the write
  // runs, so the list's re-render cannot cut the motion short. If the row is
  // still here a moment after (the write was refused, or it removes nothing
  // from this list), it comes back rather than staying folded.
  const commit = (action, side) => {
    if (!action || g.busy) return;
    unlisten();
    g.open = null;
    openRows.closed(g.id);
    const wrap = wrapRef.current;
    if (!action.collapse || !wrap) {
      animateTo(0);
      action.run?.();
      return;
    }
    g.busy = true;
    const restore = () => {
      const el = wrapRef.current;
      g.busy = false;
      if (!el || !el.isConnected) return;
      el.style.transition = `height ${COLLAPSE_MS}ms ${EASE}, opacity 200ms ease`;
      el.style.height = `${el.scrollHeight}px`;
      el.style.opacity = '';
      animateTo(0);
      later(() => { if (wrapRef.current) { wrapRef.current.style.height = ''; wrapRef.current.style.transition = ''; } }, COLLAPSE_MS + 20);
    };
    if (reducedMotion()) {
      // reduced motion: no travel and no fold, a plain fade
      wrap.style.transition = 'opacity 200ms ease';
      wrap.style.opacity = '0';
      later(() => { action.run?.(); later(restore, 900); }, 210);
      return;
    }
    const w = g.w || wrap.offsetWidth || 1;
    transition(COLLAPSE_MS);
    paint(side === 'left' ? -w : w);
    wrap.style.height = `${wrap.offsetHeight}px`;
    wrap.getBoundingClientRect();            // commit the measured height before folding it
    wrap.style.transition = `height ${COLLAPSE_MS}ms ${EASE} 90ms`;
    wrap.style.height = '0px';
    later(() => { action.run?.(); later(restore, 900); }, COLLAPSE_MS + 100);
  };

  // clean up on unmount: listeners, timers, and the registry
  useEffect(() => () => {
    unlisten();
    openRows.closed(g.id);
    g.timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabled = L.length > 0 || R.length > 0;
  if (!enabled) return { enabled: false, wrapRef, ref: rowRef, leadRef, trailRef, handlers: {}, L, R, commit, close };

  const release = (e, cancelled) => {
    if (!g.active || (e && e.pointerId !== g.pid)) return;
    g.active = false;
    const now = performance.now();
    if (e && e.clientX != null && !cancelled) g.samples.push({ t: now, v: e.clientX });
    const { L: l, R: r } = acts.current;
    const d = cancelled
      ? { to: g.dir === 'h' && g.open ? 'open' : 'closed', side: g.open }
      : releaseSwipe({
          dir: g.dir, offset: g.offset, velocity: velocityFrom(g.samples, now), rowWidth: g.w,
          leftCount: l.length, rightCount: r.length, fullLeft: l[0]?.full !== false, fullRight: r[0]?.full !== false,
        });
    // an open row that a tap (no direction) started on stays as it is: the
    // click that follows closes it (onClickCapture below)
    if (g.dir === null && g.open) return;
    if (d.to === 'commit') commit(d.side === 'left' ? l[0] : r[0], d.side);
    else if (d.to === 'open') openOn(d.side);
    else close();
  };

  return {
    enabled: true,
    wrapRef, ref: rowRef, leadRef, trailRef, L, R, commit, close,
    handlers: {
      onPointerDown: (e) => {
        if (e.button != null && e.button !== 0) return;
        if (g.busy) return;
        g.dragged = false;
        // never start a row swipe in the OS back-swipe gutter
        if (startsInEdgeGuard(e.clientX)) { g.active = false; return; }
        g.dir = null; g.active = true; g.pid = e.pointerId;
        g.startX = e.clientX; g.startY = e.clientY;
        // INTERRUPTIBLE: a row still settling is caught where it IS on
        // screen, not where its animation was heading
        const row = rowRef.current;
        if (row && row.style.transition) {
          try { g.offset = new DOMMatrixReadOnly(getComputedStyle(row).transform).m41 || 0; } catch { /* keep the target */ }
        }
        transition(0);
        paint(g.offset);
        g.base = g.offset;
        g.w = wrapRef.current?.offsetWidth || rowRef.current?.offsetWidth || 1;
        g.samples = [{ t: performance.now(), v: e.clientX }];   // the sampler's value axis; here it is x
      },
      onPointerMove: (e) => {
        if (!g.active || e.pointerId !== g.pid) return;
        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;
        g.samples.push({ t: performance.now(), v: e.clientX });
        if (g.samples.length > 12) g.samples.shift();
        // DIRECTION LOCK — decided once, never revisited for this gesture
        if (g.dir === null) {
          const decided = decideDirection(dx, dy);
          if (!decided) return;          // not enough movement to tell yet
          g.dir = decided;
          if (decided === 'v') {
            // a scroll: this gesture can never swipe, and an open row closes
            g.active = false;
            if (g.open) close();
            return;
          }
          g.dragged = true;
          // a row taking the gesture closes whichever other row was open
          if (openRows.openId && openRows.openId !== g.id) openRows.closeAll();
          try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not critical */ }
        }
        if (g.dir !== 'h') return;
        const { L: l, R: r } = acts.current;
        const next = trackOffset({ raw: g.base + dx, rowWidth: g.w, leftCount: l.length, rightCount: r.length });
        // one haptic at the full-swipe line, on the way in (the native shell's
        // Taptic path; iOS web cannot buzz without a finger on a switch)
        if (fullCrossing(g.offset, next, g.w) === 1) haptic('threshold');
        paint(next);
        if (e.cancelable) e.preventDefault(); // we own this gesture now
      },
      onPointerUp: (e) => release(e, false),
      // the browser took the gesture (a scroll): a scroll closes
      onPointerCancel: (e) => {
        if (!g.active || e.pointerId !== g.pid) return;
        g.active = false;
        close();
      },
      // ONLY the row's own capture. lostpointercapture BUBBLES: a touch is
      // implicitly captured by the element under the finger (the row's
      // button or link), and taking the capture for the row makes THAT
      // element lose it, which arrives here first. Treating the child's loss
      // as the row's killed every swipe at its first frame (found 3 Oct 2026
      // with real CDP touch input; synthetic pointer events never show it).
      onLostPointerCapture: (e) => { if (e.target === e.currentTarget && g.active) release(e, true); },
      // a tap on an open row closes it and goes no further; so does the
      // click a mouse leaves behind after a drag
      onClickCapture: (e) => {
        if (g.open || g.dragged) {
          e.stopPropagation();
          e.preventDefault();
          g.dragged = false;
          if (g.open) close();
        }
      },
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
  const s = useRef({ dir: null, startX: 0, startY: 0, startT: 0, dx: 0, active: false, id: null, samples: [] }).current;

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
        s.samples = [{ t: s.startT, v: e.clientX }];   // the sampler's value axis; here it is x
        if (zoneRef.current) zoneRef.current.style.transition = '';
      },
      onPointerMove: (e) => {
        if (!s.active || e.pointerId !== s.id) return;
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        s.samples.push({ t: performance.now(), v: e.clientX });
        if (s.samples.length > 12) s.samples.shift();
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
        const now = performance.now();
        if (e.clientX != null) s.samples.push({ t: now, v: e.clientX });
        const paged = shouldPage({ dir: s.dir, dx: s.dx, velocity: velocityFrom(s.samples, now) });
        if (paged) {
          // a gesture that passed its commit bar IS the threshold word
          haptic('threshold');
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
