// The long-press primitive — spec #13's foundation. One implementation for
// every surface: touch long-press on the phone, mouse long-press AND
// right-click on the Mac (right-click IS the desktop long-press; making it
// open the same menu is what makes the feature feel native on both).
//
// Contract: a hook returning handlers to spread onto an element. After a
// long-press fires, the trailing click is swallowed — a card must never
// both open its menu and navigate. Movement beyond the slop radius cancels
// (a scroll is not a press). State lives in a ref, NOT a closure: Interactive
// re-renders on pointerdown (its pressed-state), and closure-held timers
// would be orphaned by the re-render — the timer would outlive the release
// and fire a phantom menu. navigator.vibrate is best-effort haptics.

import { useRef } from 'react';

export const HOLD_MS = 480;
const SLOP_PX = 10;

// onPhase (optional, 15 Oct 2026, the hold-to-talk ring): told when a press
// that could become a hold STARTS ('start', element), when it stops short of
// the threshold ('cancel'), and when it crosses it ('fire', just before
// onLongPress, so a listener can note where the hold happened). It only
// watches: the 480 ms rule and the tap are the same with or without it.
export function useLongPress(onLongPress, onPhase) {
  const s = useRef({ timer: null, start: null, fired: false, armed: false }).current;
  if (!onLongPress) return {};
  const phase = (p, el) => { try { onPhase?.(p, el); } catch { /* a watcher never breaks the press */ } };

  const fire = (x, y, target) => {
    s.fired = true;
    s.armed = false;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    phase('fire', target);
    try { navigator.vibrate?.(10); } catch { /* no haptics */ }
    onLongPress({ x, y, target });
  };
  const clear = () => {
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (s.armed) { s.armed = false; phase('cancel', s.start?.target); }
    s.start = null;
  };

  return {
    onPointerDown: (e) => {
      if (e.button != null && e.button !== 0) return; // right button goes via contextmenu
      s.fired = false;
      s.start = { x: e.clientX, y: e.clientY, target: e.currentTarget };
      clearTimeout(s.timer);
      s.timer = setTimeout(() => { s.timer = null; if (s.start) fire(s.start.x, s.start.y, s.start.target); }, HOLD_MS);
      s.armed = true;
      phase('start', e.currentTarget);
    },
    onPointerMove: (e) => {
      if (!s.start) return;
      if (Math.hypot(e.clientX - s.start.x, e.clientY - s.start.y) > SLOP_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e) => {
      // desktop right-click = the same menu; also swallows the synthetic
      // contextmenu iOS Safari raises at the end of its own long-press
      e.preventDefault();
      if (!s.fired) fire(e.clientX, e.clientY, e.currentTarget);
    },
    onClickCapture: (e) => {
      // the trailing click after a fired long-press belongs to the menu
      if (s.fired) { s.fired = false; e.preventDefault(); e.stopPropagation(); }
    },
    // a held finger must select text or summon the iOS callout on NOTHING
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation' },
  };
}
