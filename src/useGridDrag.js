import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { haptic } from './haptics.js';

// TOUCH AND HOLD A CARD, CARRY IT, LET GO (his ask, 14 Oct 2026: "make all
// of the card tiles on the home screen capable of being rearranged"). The
// Edit sheet still does it as a list; this does it on the page itself, the
// way the iPhone Home Screen does.
//
// The carry is imperative for the same reason the Edit sheet's is: a 120 Hz
// drag must never re-render what it moves. React renders only when the
// landing slot changes (`preview`); the cards that step aside glide from
// where they were (FLIP, measured by offsetTop/Left so a running glide never
// skews the measurement); the carried card is re-anchored under the finger
// after each of those renders. A plain swipe is a scroll: the hold must come
// first, still, for HOLD_MS. Near the top or bottom edge the page scrolls by
// itself so a card can travel the whole page.

const HOLD_MS = 420;
// once Home is in edit mode every card is already "awake", so a short press
// is enough to pick one up (a swipe still scrolls the page)
const EDIT_HOLD_MS = 150;
const SLOP = 8;
const EDGE = 96;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// `opts.editing`: Home is in edit mode; `opts.onWake`: the first hold, out of
// edit mode, wakes it (the iPhone's jiggle), and the card it held is carried.
export function useGridDrag(keys, onCommit, opts = {}) {
  const gridRef = useRef(null);
  const [preview, setPreview] = useState(null); // the order while carrying, or null
  const drag = useRef(null);
  const prevOffsets = useRef(null);
  const keysRef = useRef(keys);
  const commitRef = useRef(onCommit);
  const optsRef = useRef(opts);
  useLayoutEffect(() => { keysRef.current = keys; commitRef.current = onCommit; optsRef.current = opts; });

  const order = preview || keys;

  // after each reorder render: glide the others, re-anchor the carried card
  useLayoutEffect(() => {
    const d = drag.current;
    const grid = gridRef.current;
    if (!d || !d.lifted || !grid) return;
    const kids = [...grid.children];
    const before = prevOffsets.current || {};
    kids.forEach((el, i) => {
      const k = order[i];
      if (k === d.key) { d.el = el; return; }
      const was = before[k];
      if (!was || reduced()) return;
      const dx = was.x - el.offsetLeft, dy = was.y - el.offsetTop;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = 'transform var(--nv-spring-snappy-ms) var(--nv-spring-snappy)';
      el.style.transform = '';
    });
    anchor(d, grid);
    place(d);
  }, [order]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    const offsets = () => {
      const o = {};
      [...grid.children].forEach((el, i) => { o[(drag.current?.order || keysRef.current)[i]] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; });
      return o;
    };

    const lift = () => {
      const d = drag.current;
      if (!d) return;
      d.lifted = true;
      d.order = keysRef.current.slice();
      if (!optsRef.current.editing) optsRef.current.onWake?.();
      haptic('tick');
      anchor(d, grid, true);
      d.el.style.transition = reduced() ? 'none' : 'scale 200ms cubic-bezier(.23,1,.32,1), box-shadow 200ms ease';
      d.el.style.zIndex = '5';
      d.el.style.position = 'relative';
      d.el.style.scale = reduced() ? '' : '1.03';
      d.el.style.boxShadow = '0 24px 48px -16px rgba(0,0,0,.6)';
      prevOffsets.current = offsets();
      setPreview(d.order);
      tick();
    };

    // the edge scroll runs on the animation clock while carrying
    const tick = () => {
      const d = drag.current;
      if (!d || !d.lifted) return;
      const y = d.cy;
      const v = y < EDGE ? -(EDGE - y) / 6 : y > innerHeight - EDGE ? (y - (innerHeight - EDGE)) / 6 : 0;
      if (v) { scrollBy(0, v); place(d); retarget(); }
      d.raf = requestAnimationFrame(tick);
    };

    // the slot under the finger, if the finger is over another card
    const retarget = () => {
      const d = drag.current;
      const g = grid.getBoundingClientRect();
      const px = d.cx - g.left, py = d.cy - g.top;
      const kids = [...grid.children];
      const hit = kids.findIndex((el, i) => d.order[i] !== d.key
        && px >= el.offsetLeft && px <= el.offsetLeft + el.offsetWidth
        && py >= el.offsetTop && py <= el.offsetTop + el.offsetHeight);
      if (hit < 0) return;
      const from = d.order.indexOf(d.key);
      if (hit === from) return;
      const next = d.order.slice();
      next.splice(from, 1);
      next.splice(hit, 0, d.key);
      prevOffsets.current = offsets();
      d.order = next;
      haptic('tick');
      setPreview(next);
    };

    const down = (e) => {
      if (drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const kids = [...grid.children];
      const el = kids.find((k) => k.contains(e.target));
      if (!el || e.target.closest?.('[data-nv-edit-btn]')) return;
      const key = keysRef.current[kids.indexOf(el)];
      if (!key) return;
      drag.current = { key, el, id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, lifted: false };
      drag.current.timer = setTimeout(lift, optsRef.current.editing ? EDIT_HOLD_MS : HOLD_MS);
    };
    const move = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      d.cx = e.clientX; d.cy = e.clientY;
      if (!d.lifted) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > SLOP) { clearTimeout(d.timer); drag.current = null; }
        return;
      }
      place(d);
      retarget();
    };
    const up = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      clearTimeout(d.timer);
      drag.current = null;
      if (!d.lifted) return;
      cancelAnimationFrame(d.raf);
      // the tap that ends a carry is not a tap on the card
      const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 400);
      const el = d.el;
      el.style.transition = reduced() ? 'none'
        : 'transform var(--nv-spring-snappy-ms) var(--nv-spring-snappy), scale 240ms ease, box-shadow 240ms ease';
      el.style.transform = '';
      el.style.scale = '';
      el.style.boxShadow = '';
      setTimeout(() => { el.style.zIndex = ''; el.style.position = ''; el.style.transition = ''; }, 650);
      const changed = d.order.join() !== keysRef.current.join();
      setPreview(null);
      if (changed) commitRef.current(d.order);
    };
    // a held card must not scroll the page under it (WebKit honours this
    // only from a non-passive listener)
    const noScroll = (e) => { if (drag.current?.lifted) e.preventDefault(); };
    const noMenu = (e) => { if (drag.current) e.preventDefault(); };

    grid.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    grid.addEventListener('touchmove', noScroll, { passive: false });
    grid.addEventListener('contextmenu', noMenu);
    return () => {
      grid.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      grid.removeEventListener('touchmove', noScroll);
      grid.removeEventListener('contextmenu', noMenu);
      if (drag.current) { clearTimeout(drag.current.timer); cancelAnimationFrame(drag.current.raf); drag.current = null; }
    };
  }, []);

  return { gridRef, order, carrying: !!preview };
}

// where the carried card's slot is on the PAGE, and where the finger held it
function anchor(d, grid, first = false) {
  const g = grid.getBoundingClientRect();
  d.base = { x: g.left + scrollX + d.el.offsetLeft, y: g.top + scrollY + d.el.offsetTop };
  if (first) d.grab = { x: d.cx + scrollX - d.base.x, y: d.cy + scrollY - d.base.y };
}

function place(d) {
  if (!d.el || !d.grab) return;
  const tx = d.cx + scrollX - d.grab.x - d.base.x;
  const ty = d.cy + scrollY - d.grab.y - d.base.y;
  d.el.style.transition = d.el.style.transition.includes('transform') ? '' : d.el.style.transition;
  d.el.style.transform = `translate(${tx}px, ${ty}px)`;
}
