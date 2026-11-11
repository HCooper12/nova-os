// PAINT FIRST, THEN THE SLOW THING (11 Nov 2026).
//
// His receipts (server/data/voice/turns.json, 29 Oct to 9 Nov): a fresh
// microphone open on his iPhone froze the page's own clock on 16 of 69 turns,
// 0.7 to 3.9 s each, and a held microphone froze it on 0 of 17. The freeze is
// the phone setting up its recording session, and nothing in a web page can
// shorten that. What a page can choose is WHAT IS ON SCREEN when it lands.
// Before this, the request went out in the same task that asked React to show
// "listening", so the freeze could land with the old screen still up: his tap
// answered by nothing, then everything at once.
//
// afterPaint runs `fn` once the browser has had two frames to draw what was
// just committed (the first frame callback runs BEFORE that frame's paint,
// the second after it), so the listening state and its CSS entrance are
// already with the compositor, which keeps moving through a frozen page.
// A hidden page gets no frames at all, so a timer always lands the call.
//
// Returns a cancel.
export const PAINT_CAP_MS = 120;

export function afterPaint(fn, { frames = 2, capMs = PAINT_CAP_MS, raf, caf, setTimer, clearTimer } = {}) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const rAF = raf || (typeof g.requestAnimationFrame === 'function' ? g.requestAnimationFrame.bind(g) : null);
  const cAF = caf || (typeof g.cancelAnimationFrame === 'function' ? g.cancelAnimationFrame.bind(g) : null);
  const st = setTimer || setTimeout;
  const ct = clearTimer || clearTimeout;
  let done = false;
  let id = 0;
  let timer = 0;
  const run = () => {
    if (done) return;
    done = true;
    if (timer) ct(timer);
    if (id && cAF) cAF(id);
    fn();
  };
  timer = st(run, capMs);
  if (rAF) {
    let left = Math.max(1, frames);
    const step = () => { id = 0; left -= 1; if (left <= 0) run(); else id = rAF(step); };
    id = rAF(step);
  }
  return () => { if (done) return; done = true; if (timer) ct(timer); if (id && cAF) cAF(id); };
}

// THE FRAMES HE SAW (the receipt's paintMs and gapMs). From the moment a
// listen starts: how long until the first frame was drawn, and the longest
// gap between two frames in the window that follows. The 200 ms clock in
// useDictation only records a freeze over 600 ms (listenRules.stallOf); the
// half-second pause he reported sits under that line, and this sees it.
export const FRAME_WATCH_MS = 2500;

export function watchFrames({ windowMs = FRAME_WATCH_MS, now = () => performance.now(), raf, caf } = {}) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const rAF = raf || (typeof g.requestAnimationFrame === 'function' ? g.requestAnimationFrame.bind(g) : null);
  const cAF = caf || (typeof g.cancelAnimationFrame === 'function' ? g.cancelAnimationFrame.bind(g) : null);
  const t0 = now();
  let first = null;
  let last = null;
  let worst = 0;
  let id = 0;
  let stopped = false;
  const step = () => {
    id = 0;
    if (stopped) return;
    const t = now();
    if (first === null) first = t - t0;
    else worst = Math.max(worst, t - last);
    last = t;
    if (t - t0 < windowMs) id = rAF(step);
  };
  if (rAF) id = rAF(step);
  return {
    read: () => ({ paintMs: first === null ? null : Math.round(first), gapMs: first === null ? null : Math.round(worst) }),
    stop: () => { stopped = true; if (id && cAF) cAF(id); id = 0; },
  };
}
