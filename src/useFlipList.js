import { useLayoutEffect, useRef } from 'react';

// LISTS THAT FIND THEIR PLACE (9 Oct 2026, the motion audit's third gap).
// Lifted out of Library's useShelfFlip so every list that filters or
// reorders moves its rows to their new slots instead of jumping there.
//
// FLIP: each item under `rootRef` that carries `data-flip="<stable id>"`
// keeps its DOM node across the change (so the key MUST be the record's id,
// never its index: an index key moves the wrong rows). When `trigger`
// changes, the hook compares each item's previous layout box with its new
// one and plays the difference back on transform alone, which composites.
//
// The details that make it hold up:
//   - positions are recorded relative to the root's own box from offsetTop /
//     offsetLeft, which ignore transforms and scrolling, so a page scrolled
//     between two filters, or a root still rising in, does not skew a move
//   - a ResizeObserver re-records the resting positions when the list
//     changes size between triggers (a search, a row added), so the next
//     move starts from where the rows really were
//   - interrupted mid-move, an item starts from where it is ON SCREEN (the
//     running animation's current offset), not from its old slot
//   - rows that arrive fade in; rows wholly off screen before and after are
//     left still (a 200-row list animates only what can be seen)
//   - reduced motion: no movement, a short opacity fade on what changed
//   - every read happens before any write, so one layout pass serves all
export const FLIP_MS = 280;
export const FLIP_EASE = 'cubic-bezier(.32,.72,0,1)';
export const FADE_MS = 160;

export function useFlipList(rootRef, trigger, { duration = FLIP_MS, easing = FLIP_EASE, scale = false, dim = 1, attr = 'flip' } = {}) {
  const prev = useRef(null);           // Map id -> resting box, relative to root
  const anims = useRef(new Map());     // id -> running Animation
  const opts = useRef(null);
  opts.current = { duration, easing, scale, dim, attr };

  // the resting positions, kept current between triggers. The root can mount
  // after the hook does (a list that appears once it has rows), so each
  // commit checks, by identity only, whether there is a new root to watch.
  const watched = useRef({ el: null, ro: null });
  useLayoutEffect(() => {
    const rootEl = rootRef.current;
    const w = watched.current;
    if (rootEl === w.el) return;
    w.ro?.disconnect();
    w.el = rootEl;
    w.ro = null;
    prev.current = rootEl ? measure(rootEl, opts.current.attr) : null;
    if (!rootEl || typeof ResizeObserver !== 'function') return;
    w.ro = new ResizeObserver(() => {
      if (w.el && !anyRunning(anims.current)) prev.current = measure(w.el, opts.current.attr);
    });
    w.ro.observe(rootEl);
  });
  useLayoutEffect(() => () => { watched.current.ro?.disconnect(); }, []);

  const lastTrigger = useRef(trigger);
  useLayoutEffect(() => {
    if (Object.is(lastTrigger.current, trigger)) return;
    lastTrigger.current = trigger;
    const rootEl = rootRef.current;
    if (!rootEl || !prev.current || watched.current.el !== rootEl) return;
    const o = opts.current;
    const before = prev.current;
    // READ: the new resting boxes, the root on screen, and where each moving
    // item is drawn right now (only items with a running move need the last)
    const after = measure(rootEl, o.attr);
    const rootBox = rootEl.getBoundingClientRect();
    const drawn = new Map();
    for (const [id, a] of anims.current) {
      const it = after.get(id);
      if (a.playState === 'running' && it) {
        const r = it.el.getBoundingClientRect();
        drawn.set(id, { dx: r.left - (rootBox.left + it.x), dy: r.top - (rootBox.top + it.y) });
      }
    }
    const view = { top: -rootBox.top, bottom: (typeof window !== 'undefined' ? window.innerHeight : 1e6) - rootBox.top };
    const reduce = reducedMotion();
    // WRITE
    for (const [id, it] of after) {
      const was = before.get(id);
      const live = drawn.get(id);
      const running = anims.current.get(id);
      if (running) { try { running.cancel(); } catch { /* gone */ } anims.current.delete(id); }
      if (!was) {
        if (onScreen(it, view)) play(id, it.el, [{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? FADE_MS : 200, easing: 'ease-out' });
        continue;
      }
      const fromX = was.x + (live?.dx || 0);
      const fromY = was.y + (live?.dy || 0);
      const dx = fromX - it.x;
      const dy = fromY - it.y;
      const sx = o.scale && it.w ? was.w / it.w : 1;
      const sy = o.scale && it.h ? was.h / it.h : 1;
      const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01;
      if (!moved) continue;
      if (!onScreen(it, view) && !onScreen({ y: fromY, h: was.h }, view)) continue;
      if (reduce) {
        play(id, it.el, [{ opacity: 0.4 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease' });
        continue;
      }
      const t0 = `translate(${dx}px, ${dy}px)${o.scale ? ` scale(${sx}, ${sy})` : ''}`;
      const k0 = o.dim < 1 ? { transform: t0, opacity: o.dim } : { transform: t0 };
      const k1 = o.dim < 1 ? { transform: 'none', opacity: 1 } : { transform: 'none' };
      play(id, it.el, [k0, k1], { duration: o.duration, easing: o.easing });
    }
    prev.current = after;

    function play(id, el, frames, timing) {
      if (typeof el.animate !== 'function') return;
      try {
        const a = el.animate(frames, timing);
        anims.current.set(id, a);
        const done = () => { if (anims.current.get(id) === a) anims.current.delete(id); };
        a.finished.then(done, done);
      } catch { /* motion is never a requirement */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

// each [data-<attr>] item's layout box relative to the root: offset sums,
// which ignore transforms (a running FLIP) and scroll positions
export function measure(rootEl, attr = 'flip') {
  const out = new Map();
  const rootOff = offsetChain(rootEl);
  for (const el of rootEl.querySelectorAll(`[data-${attr}]`)) {
    const id = el.dataset[attr];
    if (!id || out.has(id)) continue;
    const o = offsetChain(el);
    out.set(id, { el, x: o.x - rootOff.x, y: o.y - rootOff.y, w: el.offsetWidth, h: el.offsetHeight });
  }
  return out;
}

function offsetChain(el) {
  let x = 0, y = 0, n = el;
  while (n) { x += n.offsetLeft || 0; y += n.offsetTop || 0; n = n.offsetParent; }
  return { x, y };
}

const onScreen = (it, view) => it.y + it.h >= view.top && it.y <= view.bottom;
const anyRunning = (m) => { for (const a of m.values()) if (a.playState === 'running') return true; return false; };
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
