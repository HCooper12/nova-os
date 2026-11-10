// LET GO AND IT CARRIES ON: the release of any custom drag, as a spring that
// leaves at the finger's own speed.
//
// His ask, 10 Nov 2026: Nova should feel as smooth as iOS. The sheets already
// did this (sheetDrag.js samples a damped spring into WAAPI keyframes, seeded
// with the hand's velocity), but the pagers, the lift rail and the floating
// cards still cleared their inline transform on release and let a fixed CSS
// transition play from a standstill, so a fast flick slowed to a crawl at the
// exact moment the finger left the glass. This is the sheets' own spring
// (springFrames, unchanged) made usable by any element on either axis.
//
// THE CONTRACT. The caller keeps its inline transition at 'none' while the
// spring runs: a running CSS transition outranks a WAAPI animation in the
// cascade, so a transition left on would fight it. `onRest` writes the
// resting styles the old code wrote (transform, transition, class, state);
// it runs under the finished spring with transitions held off, so the hand
// over cannot start a transition of its own and nothing jumps.

import { springFrames } from './sheetDrag.js';

export const reducedMotion = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

const running = new WeakMap();

const tf = (axis, p) => (axis === 'y' ? `translate3d(0,${p}px,0)` : `translate3d(${p}px,0,0)`);

// Where the element IS on screen right now, in px on one axis, spring and
// all. A transform written in % comes back resolved to px.
export function liveOffset(el, axis = 'x') {
  try {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    const m = new DOMMatrixReadOnly(t);
    return (axis === 'y' ? m.m42 : m.m41) || 0;
  } catch { return 0; }
}

/**
 * Spring `el` from `from` to `to` px on `axis`, leaving at `velocity` px/ms
 * (velocityFrom's units, same sign as the axis). Returns the Animation.
 * response and dampingRatio are Apple's parameterisation (sheetDrag.js).
 */
export function settleTo(el, { axis = 'x', from, to, velocity = 0, response = 0.38, dampingRatio = 1, onRest } = {}) {
  running.get(el)?.a.cancel();
  const { frames, ms } = springFrames(from, to, velocity, { response, dampingRatio });
  const a = el.animate(frames.map((p) => ({ transform: tf(axis, p) })), { duration: ms, easing: 'linear', fill: 'forwards' });
  running.set(el, { a, axis });
  a.onfinish = () => {
    if (running.get(el)?.a === a) running.delete(el);
    el.style.transition = 'none';
    onRest?.();
    // whatever transition the resting state asks for comes back only after
    // the style below has been taken in, so the hand over is not animated
    const after = el.style.transition;
    el.style.transition = 'none';
    a.cancel();
    el.getBoundingClientRect();
    el.style.transition = after;
  };
  return a;
}

// A finger landing mid-settle takes the element where it IS: the spring is
// dropped and that live position written inline, with transitions off. The
// position comes back as { axis, p } (px on the axis the spring ran on) for
// the new drag to start from; null when nothing was settling, so the caller
// keeps its own resting base.
export function catchSettle(el) {
  const r = el && running.get(el);
  if (!r) return null;
  const p = liveOffset(el, r.axis);
  r.a.cancel();
  running.delete(el);
  el.style.transition = 'none';
  el.style.transform = tf(r.axis, p);
  return { axis: r.axis, p };
}
