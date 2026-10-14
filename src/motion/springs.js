// THE HOUSE SPRINGS, FOR WAAPI (15 Oct 2026, the motion set: chart morph,
// masked type, image reveal). The four curves live once, as CSS tokens in
// src/index.css (--nv-spring-smooth/-snappy/-bouncy/-playful, true damped
// springs written as linear()); Element.animate takes the same string. This
// reads each token once and checks the browser can use it, so a WebKit too
// old for linear() gets a plain ease-out rather than an animation that throws.
//
// The durations are the tokens' own (-ms): a spring's length is part of the
// curve, so a caller passes its own duration only where the mockup did.

const FALLBACK = 'cubic-bezier(.32,.72,0,1)';
const MS = { smooth: 800, snappy: 640, bouncy: 800, playful: 990 };
const cache = {};

export function spring(name) {
  if (cache[name]) return cache[name];
  let easing = '';
  try { easing = getComputedStyle(document.documentElement).getPropertyValue(`--nv-spring-${name}`).trim(); } catch { /* no CSS yet */ }
  const ok = easing && typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', easing);
  const out = { easing: ok ? easing : FALLBACK, ms: MS[name] || 800 };
  // only a real read is kept: before the stylesheet lands, ask again next time
  if (ok) cache[name] = out;
  return out;
}

// the system setting; every effect in src/motion degrades to its end state
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// can this element animate at all (WAAPI present)?
export const canAnimate = (el) => !!(el && typeof el.animate === 'function');
