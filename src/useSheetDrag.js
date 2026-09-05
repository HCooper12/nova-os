import { useRef, useCallback } from 'react';

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
// Release rule: past `threshold` px, or moving faster than `velocity` px/ms,
// the sheet is thrown off the bottom and onClose fires when it lands;
// otherwise it springs back. Reduced motion: the throw is instant.
export function useSheetDrag(onClose, { threshold = 110, velocity = 0.55 } = {}) {
  const sheetRef = useRef(null);
  const drag = useRef(null); // { startY, lastY, lastT, moved }

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const settle = useCallback((el, dy) => {
    if (!el) return;
    const fast = drag.current && drag.current.v > velocity;
    if (dy > threshold || (fast && dy > 24)) {
      // throw it off the bottom, then close when it has landed
      const h = el.getBoundingClientRect().height || 600;
      el.style.transition = reduced() ? 'none' : 'transform .22s cubic-bezier(.32,.72,0,1), opacity .22s ease-out';
      el.style.transform = `translateY(${h + 40}px)`;
      el.style.opacity = '0.6';
      const done = () => { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; onClose?.(); };
      if (reduced()) done(); else setTimeout(done, 200);
    } else {
      el.style.transition = reduced() ? 'none' : 'transform .32s cubic-bezier(.32,.72,0,1)';
      el.style.transform = 'translateY(0)';
      setTimeout(() => { if (el) el.style.transition = ''; }, 340);
    }
  }, [onClose, threshold, velocity]);

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: performance.now(), v: 0 };
    const el = sheetRef.current;
    if (el) el.style.transition = 'none';
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const now = performance.now();
    const dy = Math.max(0, e.clientY - d.startY);
    const dt = Math.max(1, now - d.lastT);
    d.v = (e.clientY - d.lastY) / dt; // px per ms, signed (down is positive)
    d.lastY = e.clientY; d.lastT = now;
    // a little resistance past the threshold, like a real sheet
    const eased = dy <= threshold ? dy : threshold + (dy - threshold) * 0.55;
    el.style.transform = `translateY(${eased}px)`;
  }, [threshold]);

  const end = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const dy = Math.max(0, (e?.clientY ?? d.lastY) - d.startY);
    settle(sheetRef.current, dy);
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
