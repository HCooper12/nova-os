import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// MOUNTED WHEN IT CANNOT COST HIM A FRAME (10 Nov 2026, the phone stage's
// frame drops, traced in Chrome: three.js compiling the body figure, 640 and
// 990 ms on the main thread, in the history line of the brief's fuel and body
// beats). The morning brief writes each beat into the history just above the
// stage, and a beat's settled panel there is the REAL instrument: mounting it
// landed in the very frames Nova's panel was landing on the stage.
//
// So a heavy part of a history line that arrives while the page is open waits as a box of its likely height and
// mounts when either
//   - it is actually on screen (he scrolled to it), or
//   - the stage has been quiet for QUIET_MS (nothing speaking, dealing or
//     arriving), one part every STEP_MS, newest first;
// and if it grows above what is on screen, the scroll moves by the same
// amount, so nothing he is reading jumps (WebKit has no scroll anchoring).
// Without IntersectionObserver it mounts at once.
import { lazyWait, lazyHeld, lazyArm } from './lazyHold.js';

const seen = new Map();   // id -> height once drawn
// only what arrives while the page is open waits; the history he opened the
// page onto is drawn as it always was
const openedAt = Date.now();

export function LazyMount({ id, at = null, guess = 220, children }) {
  const ref = useRef(null);
  const [on, setOn] = useState(() => typeof IntersectionObserver === 'undefined' || !(Number(at) >= openedAt));
  const boxH = useRef(0);
  useEffect(() => {
    if (on) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const go = () => setOn(true);
    lazyWait.add(go);
    const root = el.closest('main') || null;
    // on screen means some of it shows: a line that only touches the stage's
    // top edge (the newest, just above it) is not on screen
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting && e.intersectionRatio > 0)) { lazyWait.delete(go); io.disconnect(); go(); } }, { root, rootMargin: '-1px 0px' });
    io.observe(el);
    if (!lazyHeld()) lazyArm();
    return () => { lazyWait.delete(go); io.disconnect(); };
  }, [on]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!on) { boxH.current = el.offsetHeight; return; }
    const h = el.offsetHeight;
    if (id != null) seen.set(id, h);
    const main = el.closest('main');
    const delta = h - boxH.current;
    if (main && delta && boxH.current && el.getBoundingClientRect().bottom <= main.getBoundingClientRect().top + 1) main.scrollTop += delta;
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  if (on) return <div ref={ref} className="nv-lazy">{children}</div>;
  return <div ref={ref} className="nv-lazy" aria-hidden="true" style={{ height: (id != null && seen.get(id)) || guess }} />;
}
