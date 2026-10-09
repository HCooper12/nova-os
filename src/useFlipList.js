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
//   - THE CARD MOVES WITH ITS ROWS (9 Oct 2026, step 2). The root's height
//     used to snap while its rows glided. It now runs from its old height to
//     its new one on the same curve, clipped for the length of the move, so
//     the card and whatever sits below it travel together. Height is the
//     one layout property animated, and only on the root: there is no
//     transform that resizes a card without scaling its rows.
//   - ROWS THAT LEAVE ARE SEEN TO LEAVE. A row filtered out used to vanish.
//     A copy of it (never React's node) is laid at its old slot and fades
//     out a little faster than rows arrive, under the rows sliding into its
//     place; it carries no data-flip, so nothing ever measures it
//   - reduced motion: no movement and no height run, a short opacity fade
//     on what changed and on what left
//   - every read happens before any write, so one layout pass serves all
export const FLIP_MS = 280;
export const FLIP_EASE = 'cubic-bezier(.32,.72,0,1)';
export const FADE_MS = 160;
export const EXIT_MS = 200;
const EXIT_MAX = 12;

export function useFlipList(rootRef, trigger, { duration = FLIP_MS, easing = FLIP_EASE, scale = false, dim = 1, attr = 'flip', height = true, exits = true } = {}) {
  const prev = useRef(null);           // Map id -> resting box, relative to root
  const prevH = useRef(0);             // the root's resting height with them
  const anims = useRef(new Map());     // id -> running Animation
  const kept = useRef(null);           // the root's own inline styles, while a height run borrows them
  const opts = useRef(null);
  opts.current = { duration, easing, scale, dim, attr, height, exits };

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
    prevH.current = rootEl ? rootEl.offsetHeight : 0;
    if (!rootEl || typeof ResizeObserver !== 'function') return;
    w.ro = new ResizeObserver(() => {
      if (w.el && !anyRunning(anims.current)) { prev.current = measure(w.el, opts.current.attr); prevH.current = w.el.offsetHeight; }
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
    // READ: the root's height as drawn (mid-run if a height move is going),
    // then its new resting height, the new resting boxes, the root on
    // screen, and where each moving item is drawn right now
    const heightRun = anims.current.get(HEIGHT);
    const fromH = heightRun ? rootEl.offsetHeight : prevH.current;
    if (heightRun) { try { heightRun.cancel(); } catch { /* gone */ } anims.current.delete(HEIGHT); }
    const toH = rootEl.offsetHeight;
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
    const leaving = o.exits ? exitsOf(before, after, view) : [];
    const rootStyle = leaving.length && typeof getComputedStyle === 'function' ? getComputedStyle(rootEl) : null;
    const inset = { x: rootEl.clientLeft || 0, y: rootEl.clientTop || 0 };
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

    // the rows that left, seen leaving: a copy at the old slot, fading out
    if (leaving.length && typeof rootEl.animate === 'function') {
      const lift = rootStyle && rootStyle.position === 'static';
      if (lift) rootEl.style.position = 'relative';
      let left = leaving.length;
      const settled = () => { left -= 1; if (!left && lift) rootEl.style.position = ''; };
      for (const [id, was] of leaving) {
        const ghost = ghostOf(was, inset);
        if (!ghost) { settled(); continue; }
        rootEl.appendChild(ghost);
        const frames = reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.97)' }];
        try {
          const a = ghost.animate(frames, { duration: reduce ? FADE_MS : EXIT_MS, easing: 'ease-out', fill: 'forwards' });
          anims.current.set(`${EXIT}${id}`, a);
          const gone = () => { ghost.remove(); if (anims.current.get(`${EXIT}${id}`) === a) anims.current.delete(`${EXIT}${id}`); settled(); };
          a.finished.then(gone, gone);
        } catch { ghost.remove(); settled(); }
      }
    }

    // the card travels with its rows: old height to new, clipped meanwhile
    if (o.height && !reduce && Math.abs(fromH - toH) > 1 && typeof rootEl.animate === 'function' && onScreen({ y: 0, h: Math.max(fromH, toH) }, view)) {
      // an interrupted run hands its borrowed styles on; only the last gives them back
      if (!kept.current) kept.current = { overflow: rootEl.style.overflow, boxSizing: rootEl.style.boxSizing };
      const giveBack = () => { if (kept.current) { rootEl.style.overflow = kept.current.overflow; rootEl.style.boxSizing = kept.current.boxSizing; kept.current = null; } };
      rootEl.style.overflow = 'hidden';
      rootEl.style.boxSizing = 'border-box';
      try {
        const a = rootEl.animate([{ height: `${fromH}px` }, { height: `${toH}px` }], { duration: o.duration, easing: o.easing });
        anims.current.set(HEIGHT, a);
        const done = () => {
          if (anims.current.get(HEIGHT) === a) anims.current.delete(HEIGHT);
          if (!anims.current.has(HEIGHT)) giveBack();
        };
        a.finished.then(done, done);
      } catch { giveBack(); }
    }
    prev.current = after;
    prevH.current = toH;

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

const HEIGHT = '\u0000height';
const EXIT = '\u0000exit:';

// the rows in `before` that are gone from `after` and could be seen, nearest
// the top first, at most EXIT_MAX (a filter that empties a long list fades
// what was on screen, not two hundred copies)
export function exitsOf(before, after, view) {
  const out = [];
  for (const [id, was] of before) {
    if (after.has(id) || !was?.el) continue;
    if (was.el.isConnected) continue; // still in the page under another id: not ours to copy
    if (!onScreen(was, view)) continue;
    out.push([id, was]);
  }
  return out.sort((a, b) => a[1].y - b[1].y).slice(0, EXIT_MAX);
}

// a copy of the row that left, at its old box, inert and unseen by measure
function ghostOf(was, inset) {
  try {
    const g = was.el.cloneNode(true);
    for (const n of [g, ...g.querySelectorAll('[data-flip],[id]')]) { n.removeAttribute?.('data-flip'); n.removeAttribute?.('id'); }
    g.setAttribute('aria-hidden', 'true');
    g.setAttribute('inert', '');
    Object.assign(g.style, {
      position: 'absolute', left: `${was.x - inset.x}px`, top: `${was.y - inset.y}px`, width: `${was.w}px`, height: `${was.h}px`,
      margin: '0', pointerEvents: 'none', boxSizing: 'border-box', transformOrigin: '50% 50%',
    });
    return g;
  } catch { return null; }
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
