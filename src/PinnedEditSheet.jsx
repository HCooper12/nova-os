import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { TextAction, Meta } from './Controls.jsx';
import { useSheetDrag } from './useSheetDrag.js';
import { useExit } from './useExit.js';
import { movePinned } from './pinned.js';
import { dropIndex, rowShift } from './pinnedDrag.js';
import { rubberband } from './sheetPhysics.js';
import { haptic, switchHapticRef } from './haptics.js';

// EDIT PINNED — the Health-style sheet (HOME-REDESIGN-PLAN.md §3, P2-B): a
// switch per card, a grip to carry it, Done. His words for it: "smooth to
// drag around and edit with no lag".
//
// So the carry is IMPERATIVE, the way useSheetDrag is and for its reason: a
// 120Hz drag must never re-render what it moves. Pick-up measures every row
// once; each move writes one transform on the carried row and, only when the
// landing slot changes, one on each row that steps aside (their own CSS
// transition slides them). Nothing touches React until the finger lifts, and
// then the new order is committed ONCE and the row glides the last few pixels
// into its slot (FLIP) instead of jumping. Home re-renders behind the sheet
// as each change lands, so he watches the page he is editing.
//
// It is a real modal to the back swipe (edgeBack.js): an aria-modal root with
// its z-index inline, closed by its own backdrop tap. Done, the backdrop and
// Escape let it fall back down the way it rose (useExit); dragging the grab
// zone down throws it (useSheetDrag).

const UI = 'var(--nv-font-ui)';
const EASE = 'cubic-bezier(.32,.72,0,1)';
const SETTLE = `transform 200ms ${EASE}, scale 200ms ${EASE}, box-shadow 200ms ease, background-color 200ms ease`;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// a tap on Done or any control inside the grab zone is a tap, not a sheet drag
const onControl = (el) => !!(el && el.closest && el.closest('[role="button"], button, a, input'));

export function PinnedEditSheet({ edit, rows }) {
  const exit = useExit(edit.close);
  const sheet = useSheetDrag(edit.close, { threshold: 80 });
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const latest = useRef(rows);     // the newest list, for a release that lands after other changes
  const closeRef = useRef(exit.close);
  const carry = useRef(null);      // the live drag, or null
  const refocus = useRef(null);    // a grip to hand focus back to after a keyboard move
  useLayoutEffect(() => {
    latest.current = rows;
    closeRef.current = exit.close;
  });

  // Escape closes; the page behind stays put while the sheet is up; focus
  // starts inside the dialog, for the keyboard and VoiceOver
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, []);

  // a grip moved by the arrow keys keeps the focus it had
  useLayoutEffect(() => {
    const key = refocus.current;
    if (!key) return;
    refocus.current = null;
    listRef.current?.querySelector(`[data-grip="${key}"]`)?.focus({ preventScroll: true });
  });

  const toggle = (key) => {
    edit.setList(latest.current.map((r) => (r.key === key ? { ...r, on: !r.on } : r)));
  };

  const nudge = (key, by) => {
    const list = latest.current;
    const from = list.findIndex((r) => r.key === key);
    const to = from + by;
    if (from < 0 || to < 0 || to >= list.length) return;
    refocus.current = key;
    haptic('tick');
    edit.setList(movePinned(list, from, to));
  };

  // ---- the carry --------------------------------------------------------
  const pickUp = (e, key) => {
    if (carry.current) return;                            // one finger at a time
    if (e.button != null && e.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    const els = [...list.children];
    const from = els.findIndex((el) => el.dataset.pinRow === key);
    if (from < 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer has already gone */ }
    const rects = els.map((el) => el.getBoundingClientRect());
    carry.current = {
      id: e.pointerId, key, from, to: from, startY: e.clientY, els, row: els[from],
      mids: rects.map((r) => r.top + r.height / 2),
      h: rects[from].height,
      // how far the row may travel before it meets resistance: the list's own ends
      lo: rects[0].top - rects[from].top,
      hi: rects[rects.length - 1].bottom - rects[from].bottom,
    };
    els[from].classList.add('drag');
  };

  const follow = (e) => {
    const d = carry.current;
    if (!d || e.pointerId !== d.id) return;
    let dy = e.clientY - d.startY;
    // past either end of the list it slows rather than stops (sheetPhysics)
    if (dy < d.lo) dy = d.lo - rubberband(d.lo - dy, d.h * 3);
    else if (dy > d.hi) dy = d.hi + rubberband(dy - d.hi, d.h * 3);
    d.row.style.transform = `translateY(${dy}px)`;
    const to = dropIndex(d.mids, d.from, d.mids[d.from] + dy);
    if (to === d.to) return;
    d.to = to;
    haptic('tick');
    d.els.forEach((el, i) => {
      if (i === d.from) return;
      const s = rowShift(i, d.from, to, d.h);
      el.style.transform = s ? `translateY(${s}px)` : '';
    });
  };

  const letGo = (e, commit) => {
    const d = carry.current;
    if (!d || e.pointerId !== d.id) return;
    carry.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const { row, els } = d;
    const calm = reducedMotion();
    const settle = () => {
      row.style.transition = calm ? 'none' : SETTLE;
      row.style.zIndex = '3';                 // stay above the others until it lands
      row.classList.remove('drag');
      row.style.transform = '';
      setTimeout(() => { row.style.transition = ''; row.style.zIndex = ''; }, 220);
    };
    if (!commit || d.to === d.from) {
      // nothing moved: the others slide home, the row settles into its own slot
      els.forEach((el) => { if (el !== row) el.style.transform = ''; });
      settle();
      return;
    }
    // FLIP: where it is under the finger now...
    const before = row.getBoundingClientRect().top;
    els.forEach((el) => { el.style.transition = 'none'; el.style.transform = ''; });
    // ...the order committed once, synchronously, so the DOM is in its new
    // order before this frame paints...
    const list = latest.current;
    const from = list.findIndex((r) => r.key === d.key);
    flushSync(() => edit.setList(movePinned(list, from, d.to)));
    // ...then inverted back to where it was, and let go into its slot
    const delta = before - row.getBoundingClientRect().top;
    if (delta && !calm) {
      row.style.transform = `translateY(${delta}px)`;
      row.getBoundingClientRect();            // commit the inverted position before animating
    }
    settle();
    requestAnimationFrame(() => els.forEach((el) => { if (el !== row) el.style.transition = ''; }));
  };

  const drop = (e) => letGo(e, true);
  const abandon = (e) => letGo(e, false);

  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label="Edit Pinned" onClick={exit.close}
      style={{
        position: 'fixed', inset: 0, zIndex: 145, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--nv-void) 70%, transparent)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)',
      }}>
      <div ref={(el) => { sheet.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }}
        className="nv-liquid nv-liquid-thick nv-materialize" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '560px', maxHeight: '86vh', boxSizing: 'border-box', outline: 'none',
          display: 'flex', flexDirection: 'column',
          borderRadius: 'var(--nv-radius) var(--nv-radius) 0 0',
          padding: '0 16px calc(18px + env(safe-area-inset-bottom))',
        }}>
        {/* the grab zone: the grabber centred at the top, the title and Done
            under it. It never scrolls — the list below does — so it is always
            under the thumb. */}
        <div {...sheet.handleProps}
          onPointerDown={(e) => { if (!onControl(e.target)) sheet.handleProps.onPointerDown(e); }}
          style={{ ...sheet.handleProps.style, position: 'relative', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '20px 8px 8px' }}>
          <span aria-hidden="true" style={{ position: 'absolute', top: '7px', left: '50%', width: '36px', height: '5px', marginLeft: '-18px', borderRadius: '3px', background: 'color-mix(in srgb, var(--nv-ink) 22%, transparent)' }} />
          <span style={{ font: `600 17px ${UI}`, letterSpacing: '-.01em', color: 'var(--nv-ink)' }}>Pinned</span>
          <TextAction tone="accent" onClick={exit.close}>Done</TextAction>
        </div>
        {/* the list scrolls on its own when it outgrows the sheet. Its 6px
            of side padding (handed back by the negative margin) is room for
            a lifted row's 2% scale, and it clips sideways — a scroller cannot
            be `visible` on one axis, so a lift would otherwise make the list
            scroll sideways under his thumb */}
        <ul ref={listRef} aria-label="Pinned cards, in order"
          style={{ listStyle: 'none', margin: '0 -6px', padding: '4px 6px 8px', minHeight: 0, overflowX: 'hidden', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {rows.map((r) => (
            <li key={r.key} className="nv-sum-row" data-pin-row={r.key}>
              <label className="nv-sum-switch" data-on={r.on ? 'true' : 'false'}>
                <input type="checkbox" role="switch" ref={switchHapticRef} checked={r.on} onChange={() => toggle(r.key)}
                  aria-label={`Show ${r.label} on Home`} />
              </label>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ font: `500 16px ${UI}`, letterSpacing: '-.01em', color: r.on ? 'var(--nv-ink)' : 'var(--nv-ink60)', transition: 'color 180ms ease' }}>{r.label}</span>
                {/* still his to switch: it is a preference, not a verdict on today */}
                {!r.present && <Meta tone="faint">nothing to show today</Meta>}
              </span>
              <span className="nv-sum-grip" data-grip={r.key} role="button" tabIndex={0}
                aria-label={`Move ${r.label}. Arrow keys move it up or down`}
                onPointerDown={(e) => pickUp(e, r.key)} onPointerMove={follow} onPointerUp={drop}
                onPointerCancel={abandon} onLostPointerCapture={abandon}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); nudge(r.key, -1); }
                  else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(r.key, 1); }
                }}>
                {/* the iOS reorder mark */}
                <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true" focusable="false">
                  <path d="M2 2h16M2 7h16M2 12h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
