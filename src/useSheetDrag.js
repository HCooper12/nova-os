import { useRef, useCallback } from 'react';
import { settleDecision, throwDuration, velocityFrom, rubberband } from './sheetPhysics.js';

// DRAG A SHEET DOWN TO DISMISS IT — the gesture every iOS sheet has, and the
// difference between a panel that follows your thumb and one that only
// answers a button. Part of the 5 Sep 2026 motion pass ("Nova feels stiff").
//
// Imperative on purpose: the transform is written straight to the sheet
// element on every pointer move, with no React state, so a 120Hz drag never
// re-renders what the sheet holds (the exercise card carries a 3D figure).
//
// The handlers go on a GRAB ZONE — the handle row at the top of the sheet —
// not the whole sheet, because the sheet's body scrolls, and a vertical drag
// there must remain a scroll. The zone sets touch-action:none so the browser
// hands the gesture to us instead of starting a scroll and cancelling.
//
// REWRITTEN 16 Sep 2026 against Apple's *Designing Fluid Interfaces*. Three
// things were wrong, and the first had never worked at all:
//
//  1. THE FLICK WAS DEAD CODE. `end()` set `drag.current = null` and then
//     called `settle()`, which read `drag.current.v` — always null, so the
//     velocity branch never once ran in any sheet. Dismissing required
//     dragging slowly past the full threshold; a flick sprang back. The
//     decision now lives in sheetPhysics.js and takes velocity as an argument,
//     which is the shape that cannot rot the same way.
//  2. VELOCITY CAME FROM THE LAST TWO POINTS, so a flick that decelerates in
//     its final frame — which is most of them — reported nearly zero. It is
//     now taken from an 80ms history.
//  3. THE THROW WAS NOT INTERRUPTIBLE. A closing sheet could not be grabbed
//     back: the pending close fired anyway, and the new drag started from
//     translateY(0) while the sheet was visibly somewhere else, so it jumped.
//     Grabbing now cancels the close and starts from the PRESENTATION value.
export function useSheetDrag(onClose, { threshold = 110 } = {}) {
  const sheetRef = useRef(null);
  const drag = useRef(null);      // { startY, base, samples }
  const closing = useRef(null);   // the pending close, so a re-grab can cancel it

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // What the sheet is showing RIGHT NOW, mid-transition — not where the logic
  // thinks it is. Animating from the target value is what makes an interrupted
  // gesture jump.
  const presentationY = (el) => {
    try {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return 0;
      return new DOMMatrixReadOnly(t).m42 || 0;
    } catch { return 0; }
  };

  const cancelClose = useCallback(() => {
    if (closing.current) { clearTimeout(closing.current); closing.current = null; }
  }, []);

  const settle = useCallback((el, dy, v) => {
    if (!el) return;
    if (settleDecision({ dy, v, threshold }) === 'dismiss') {
      const h = el.getBoundingClientRect().height || 600;
      const distance = h + 40 - dy;
      // velocity handoff: the throw leaves at the speed the finger arrived at
      const ms = reduced() ? 0 : Math.round(throwDuration(distance, v));
      el.style.transition = reduced() ? 'none' : `transform ${ms}ms cubic-bezier(.32,.72,0,1), opacity ${ms}ms ease-out`;
      el.style.transform = `translateY(${h + 40}px)`;
      el.style.opacity = '0.6';
      const done = () => {
        closing.current = null;
        el.style.transition = ''; el.style.transform = ''; el.style.opacity = '';
        onClose?.();
      };
      if (reduced()) done(); else closing.current = setTimeout(done, ms);
    } else {
      el.style.transition = reduced() ? 'none' : 'transform .32s cubic-bezier(.32,.72,0,1)';
      el.style.transform = 'translateY(0)';
      el.style.opacity = '';
      setTimeout(() => { if (el) el.style.transition = ''; }, 340);
    }
  }, [onClose, threshold]);

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    const el = sheetRef.current;
    // grabbing a sheet that is on its way out takes it back off the animation
    cancelClose();
    const base = el ? presentationY(el) : 0;
    if (el) {
      // Order matters, and getting it wrong is worse than not interrupting at
      // all: killing a transition makes the element SNAP to the value it was
      // heading for, so the sheet would flick to off-screen the instant it was
      // grabbed. Read where it is, then pin it there in the same frame.
      el.style.transition = 'none';
      el.style.transform = `translateY(${base}px)`;
      el.style.opacity = '';
    }
    drag.current = { startY: e.clientY, base, samples: [{ t: performance.now(), v: e.clientY }] };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [cancelClose]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    d.samples.push({ t: performance.now(), v: e.clientY });
    if (d.samples.length > 12) d.samples.shift();
    // `base` is where the sheet already was when grabbed, so an interrupted
    // throw continues from there instead of snapping to the top
    const raw = d.base + (e.clientY - d.startY);
    const dy = Math.max(0, raw);
    const h = el.getBoundingClientRect().height || 600;
    // progressive resistance past the threshold — a real sheet slows before it
    // stops rather than following at a flat 55%
    const eased = dy <= threshold ? dy : threshold + rubberband(dy - threshold, h);
    el.style.transform = `translateY(${eased}px)`;
  }, [threshold]);

  const end = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const now = performance.now();
    if (e && e.clientY != null) d.samples.push({ t: now, v: e.clientY });
    const v = velocityFrom(d.samples, now);
    const last = d.samples[d.samples.length - 1].v;
    const dy = Math.max(0, d.base + (last - d.startY));
    settle(sheetRef.current, dy, v);
  }, [settle]);

  return {
    sheetRef,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      style: { touchAction: 'none', cursor: 'grab' },
    },
  };
}
