import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSheetDrag } from './useSheetDrag.js';
import { useExit } from './useExit.js';
import './shopping.css';

// The Shopping screen's glyphs, aisle tile and sheet, shared with the recipe
// page so the "already on your list" ask (mockup 118) is the same sheet.

/* ------------------------------------------------------------- glyphs -- */
export const G = {
  pr: 'M6 19c0-8 5-13 13-13 0 8-5 13-13 13zM6 19l7-7',
  me: 'M8 15c-3-1-4-5-1-8s8-3 10 0 1 8-3 9l-3 1-2 3-2-1 1-3z',
  da: 'M9 3h6v3l2 3v11a1 1 0 01-1 1H8a1 1 0 01-1-1V9l2-3zM7 13h10',
  pa: 'M6 8h12v13H6zM8 4h8v4H8zM6 13h12',
  fr: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 4.5l3 2 3-2M9 19.5l3-2 3 2',
  ba: 'M4 13c0-4 4-7 8-7s8 3 8 7v5H4zM9 9v3M12 8v4M15 9v3',
  be: 'M7 4h10l-1 16a1 1 0 01-1 1H9a1 1 0 01-1-1zM7.5 9h9',
  ho: 'M8 21V11h8v10M10 11V7h4v4M14 7l3-3M6 21h12',
  on: 'M3.5 8L12 4l8.5 4v9L12 21l-8.5-4zM3.5 8L12 12l8.5-4M12 12v9',
  kit: 'M5 9h12v6a4 4 0 01-4 4H9a4 4 0 01-4-4zM17 11h1.5a2 2 0 010 4H17M8 3v3M12 3v3',
  bag: 'M5 8h14l-1 12H6zM9 8a3 3 0 016 0',
  clock: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 7.5V12l3 2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  mail: 'M3 5.5h18v13H3zM4 7.5l8 6 8-6',
  phone: 'M7 2.5h10v19H7zM11 18.5h2',
  news: 'M5 4.5h11v15H6.5A1.5 1.5 0 015 18zM16 8.5h3v9.5a1.5 1.5 0 01-3 0M8 8h5M8 11.5h5M8 15h3',
  pts: 'M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  back: 'M15 5l-7 7 7 7',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  chev: 'M9 6l6 6-6 6',
  arr: 'M5 12h13M13 7l5 5-5 5',
  out: 'M8 16L16 8M9 8h7v7',
  nosign: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM6 6l12 12',
  pin: 'M14.5 3.5l6 6-3 1-3.5 3.5.5 4-1.5 1.5-4-4-4.5 4.5-1-1L8 14.5l-4-4L5.5 9l4 .5L13 6z',
};
export const Ic = ({ n, className = 'nv-sh-ic' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={G[n]} /></svg>
);
export const Tile = ({ k, hue, sm }) => <span className={`nv-sh-tile${sm ? ' sm' : ''}`} style={{ '--t': hue }} aria-hidden="true"><Ic n={k} /></span>;

/* ------------------------------------------------------------- sheets -- */

export function Sheet({ label, onClose, children, tint, rise }) {
  // close(then): the sheet leaves the way it came, then `then` runs (an
  // action that opens something else waits until the sheet has gone)
  const thenRef = useRef(null);
  const exit = useExit(() => { const t = thenRef.current; thenRef.current = null; onClose(t); });
  const closeWith = (then) => { thenRef.current = typeof then === 'function' ? then : null; exit.close(); };
  const drag = useSheetDrag(() => onClose(), { threshold: 80 });
  const panelRef = useRef(null);
  const closeRef = useRef(closeWith);
  useLayoutEffect(() => { closeRef.current = closeWith; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const onControl = (el) => !!(el && el.closest && el.closest('button, a, input, textarea, [role="button"]'));
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={label} onClick={() => closeWith()} className="nv-sh-scrim">
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }} tabIndex={-1} data-sheet=""
        className={`nv-liquid nv-liquid-thick nv-sum-sheet ${rise ? 'nv-sh-up' : 'nv-materialize'} nv-sh-sheet${tint ? ` tinted pg-${tint}` : ''}${rise && rise !== true ? ` ${rise}` : ''}`} onClick={(e) => e.stopPropagation()}
        {...{ onPointerDown: (e) => { if (!onControl(e.target) && e.target.closest('.nv-sh-grabrow, .nv-sh-shd')) drag.handleProps.onPointerDown(e); } }}>
        <div className="nv-sh-grabrow" {...drag.handleProps} style={drag.handleProps.style}><span className="nv-sh-grab" aria-hidden="true" /></div>
        <div className="nv-sh-shbody">{children(closeWith)}</div>
      </div>
    </div>
  );
}
export const XBtn = ({ close }) => <button type="button" className="nv-sh-nb circ" aria-label="Close" onClick={() => close()}><Ic n="x" /></button>;
