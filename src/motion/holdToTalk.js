import { useCallback, useLayoutEffect, useRef } from 'react';
import { HOLD_MS } from '../longPress.js';
import { spring, reducedMotion, canAnimate } from './springs.js';
import './holdToTalk.css';

// HOLD NOVA → TALK (15 Oct 2026; mockup "Nova motion set" #s11, his approval).
//
// 1. While his finger is on the Nova icon a thin cyan ring fills around it
//    over the REAL hold: HOLD_MS from longPress.js, linear, because it is a
//    clock. Lifting early drains it (120 ms). The ring is told about the
//    press by useLongPress's onPhase; it never decides anything itself.
// 2. At the threshold the core gives one small bounce and the transcript
//    panel (VoicePresence) GROWS OUT OF THE CORE: a clip-path circle from the
//    icon's centre, the icon's own size, out past the panel's corners.
// 3. Closing folds it back: the panel is gone from React the moment it
//    closes, so a still copy of it (a ghost) shrinks into the core instead.
//
// transform / opacity / clip-path only. The ring is two half-rings turned by
// `transform`, each seen through half a window (clip-path), so its sweep is
// compositor work, not a repaint of a stroke.

// ---------------------------------------------------------- the origin --

// Where the last hold happened. Read (not taken) by the panel as it mounts:
// React's StrictMode mounts twice in development, and both must see it.
const FRESH_MS = 900;
let origin = null; // { el, at }

export function noteHoldOrigin(el) { origin = el ? { el, at: performance.now() } : null; }

// the element the panel grows out of, if a hold just opened it
export function holdOrigin() {
  if (!origin || performance.now() - origin.at > FRESH_MS || !origin.el?.isConnected) return null;
  return origin.el;
}

// the element the panel folds back into: the icon that was held, or failing
// that whichever Nova icon is drawn (data-nova-core), or nothing (a fade)
function coreForFold() {
  if (origin?.el?.isConnected) return origin.el;
  for (const el of document.querySelectorAll('[data-nova-core]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

// --------------------------------------------------------------- ring --

// fill f (0..1) → the two halves' turns: the right half sweeps first
const turns = (f) => [Math.min(f * 2, 1) * 180, Math.max(f * 2 - 1, 0) * 180];

// keyframes from one fill to another, linear in fill, with a stop at the
// half so neither half moves while the other is still travelling
function ringFrames(from, to) {
  const pts = [from];
  if ((from - 0.5) * (to - 0.5) < 0) pts.push(0.5);
  pts.push(to);
  const span = Math.abs(to - from) || 1;
  const at = pts.map((p) => Math.abs(p - from) / span);
  return [0, 1].map((side) => pts.map((p, i) => ({ offset: at[i], transform: `rotate(${turns(p)[side]}deg)` })));
}

// One small bounce, scale 1 → 1.12 → 1, landing on the bouncy spring.
function bounce(el) {
  if (!canAnimate(el) || reducedMotion()) return;
  const b = spring('bouncy');
  try {
    el.animate([
      { transform: 'scale(1)', easing: 'cubic-bezier(.2,.7,.3,1)' },
      { transform: 'scale(1.12)', offset: 0.24, easing: b.easing },
      { transform: 'scale(1)' },
    ], { duration: 640 });
  } catch { /* motion is never a requirement */ }
}

// The hook the icon wears: `ringRef` on <HoldRing>, `onHoldPhase` on its
// Interactive. Everything runs on WAAPI from refs, so a press costs no render.
export function useHoldRing() {
  const ringRef = useRef(null);
  const st = useRef({ spin: [], fade: null, from: 0, to: 0, t0: 0, dur: 0 }).current;

  const fillNow = () => {
    if (!st.dur) return st.to;
    const k = Math.min(1, (performance.now() - st.t0) / st.dur);
    return st.from + (st.to - st.from) * k;
  };
  const halves = () => {
    const ring = ringRef.current;
    return ring ? [...ring.querySelectorAll('.nv-hold-half > i')] : [];
  };
  const run = (to, dur) => {
    const hs = halves();
    if (hs.length !== 2 || !canAnimate(hs[0])) return;
    const from = fillNow();
    for (const a of st.spin.splice(0)) { try { a.cancel(); } catch { /* gone */ } }
    const [r, l] = ringFrames(from, to);
    const t = { duration: Math.max(1, dur), easing: 'linear', fill: 'forwards' };
    try { st.spin.push(hs[0].animate(r, t), hs[1].animate(l, t)); } catch { return; }
    Object.assign(st, { from, to, t0: performance.now(), dur: Math.max(1, dur) });
  };
  const fade = (to, dur, delay = 0) => {
    const ring = ringRef.current;
    if (!canAnimate(ring)) return null;
    let from = 0;
    try { from = Number(getComputedStyle(ring).opacity) || 0; } catch { /* unread */ }
    try { st.fade?.cancel(); } catch { /* gone */ }
    try { st.fade = ring.animate([{ opacity: from }, { opacity: to }], { duration: dur, delay, easing: 'ease-out', fill: 'both' }); } catch { st.fade = null; }
    return st.fade;
  };

  const onHoldPhase = useCallback((phase, el) => {
    if (phase === 'start') {
      fade(1, 90);
      run(1, HOLD_MS);
    } else if (phase === 'cancel') {
      run(0, 120);
      fade(0, 90, 60);
    } else if (phase === 'fire') {
      noteHoldOrigin(el);
      run(1, 0);
      const f = fade(0, 300);
      if (f) f.onfinish = () => { if (st.to === 1) run(0, 0); };
      bounce(el?.querySelector?.('[data-hold-bounce]') || el);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ringRef, onHoldPhase };
}

// ------------------------------------------------- the panel's morph --

const circle = (r, x, y) => `circle(${r.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;
const radiusOf = (clip) => {
  const m = /circle\(\s*([\d.]+)px/.exec(String(clip || ''));
  return m ? Number(m[1]) : null;
};

function geometry(panel, core) {
  const pr = panel.getBoundingClientRect();
  const cr = core.getBoundingClientRect();
  const x = cr.left + cr.width / 2 - pr.left;
  const y = cr.top + cr.height / 2 - pr.top;
  // past the farthest corner, and past the glow the panel throws (30px)
  const far = Math.max(Math.hypot(x, y), Math.hypot(pr.width - x, y), Math.hypot(x, pr.height - y), Math.hypot(pr.width - x, pr.height - y)) + 40;
  return { pr, x, y, r0: Math.min(cr.width, cr.height) / 2, far };
}

// a ghost folding right now (one at a time): a new hold reverses it
let ghost = null; // { el, anims }

function dropGhost() {
  if (!ghost) return null;
  let r = null;
  try { r = radiusOf(getComputedStyle(ghost.el).clipPath); } catch { /* unread */ }
  for (const a of ghost.anims) { try { a.cancel(); } catch { /* gone */ } }
  ghost.el.remove();
  ghost = null;
  return r;
}

function grow(panel, core) {
  const anims = [];
  const play = (el, frames, timing) => {
    if (!canAnimate(el)) return;
    try { anims.push(el.animate(frames, timing)); } catch { /* motion is never a requirement */ }
  };
  // a fold still running is reversed from where it is drawn, not restarted
  const caught = dropGhost();
  if (reducedMotion()) {
    play(panel, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    return anims;
  }
  const g = geometry(panel, core);
  const from = caught != null ? Math.max(g.r0, caught) : g.r0;
  play(panel, [{ clipPath: circle(from, g.x, g.y) }, { clipPath: circle(g.far, g.x, g.y) }], { duration: 700, easing: spring('smooth').easing });
  // the words come in once there is room for them
  for (const kid of panel.children) {
    play(kid, [{ opacity: 0 }, { opacity: 1 }], caught != null
      ? { duration: 140, easing: 'ease-out', fill: 'backwards' }
      : { duration: 260, delay: 240, easing: 'ease-out', fill: 'backwards' });
  }
  return anims;
}

function fold(panel) {
  if (!panel?.isConnected) return;
  // pulled down: it already left under his finger (sheetDrag), so it does
  // not come back to fold a second time
  if (panel.closest('[data-sheet-gone]')) return;
  const pr = panel.getBoundingClientRect();
  if (!pr.width || !pr.height) return;
  let clip = null;
  try { clip = getComputedStyle(panel).clipPath; } catch { /* unread */ }
  const el = panel.cloneNode(true);
  el.removeAttribute('data-sheet');
  el.removeAttribute('data-sheet-float');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  Object.assign(el.style, {
    position: 'fixed', left: `${pr.left}px`, top: `${pr.top}px`, width: `${pr.width}px`, height: `${pr.height}px`,
    margin: '0', zIndex: '112', pointerEvents: 'none', animation: 'none', boxSizing: 'border-box',
  });
  // React has the panel itself; a ghost made in a StrictMode rehearsal (the
  // panel is still there a beat later) is thrown away unseen
  queueMicrotask(() => {
    if (panel.isConnected) return;
    dropGhost();
    document.body.appendChild(el);
    const anims = [];
    const core = coreForFold();
    try {
      if (!core || reducedMotion()) {
        anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' }));
      } else {
        const g = geometry(el, core);
        const now = radiusOf(clip) ?? g.far;
        const snappy = spring('snappy');
        anims.push(el.animate([{ clipPath: circle(Math.min(now, g.far), g.x, g.y) }, { clipPath: circle(g.r0, g.x, g.y) }], { duration: 450, easing: snappy.easing, fill: 'forwards' }));
        anims.push(el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 450, easing: 'linear', fill: 'forwards' }));
      }
    } catch { el.remove(); return; }
    ghost = { el, anims };
    const mine = ghost;
    anims[0].onfinish = () => { if (ghost === mine) dropGhost(); };
  });
}

// The panel's whole life: `ref` on the panel. Grows out of the core when a
// hold opened it (else the old popIn, which `fromHold` lets the caller pick),
// folds back on the way out.
export function usePanelMorph() {
  const ref = useRef(null);
  const fromHold = useRef(holdOrigin()).current;
  useLayoutEffect(() => {
    const panel = ref.current;
    const core = holdOrigin();
    const anims = panel && core ? grow(panel, core) : [];
    return () => {
      fold(panel);
      for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    };
  }, []);
  return { ref, fromHold: !!fromHold };
}
