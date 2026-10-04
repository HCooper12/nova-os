// THE SKY RESTS WHEN HE DOES (his call, 4 Oct 2026, design/mockups/70).
// Summary's sky (.nv-sky) drifts two gradient layers about 2.5% over 40 s,
// and every glass panel above it re-blurs whatever moves beneath it, every
// frame. So the drift runs for SKY_REST_MS after his last touch, scroll or
// key, then pauses where it is (at that speed a pause cannot be seen) until
// he moves again. The colours and the hour band are transitions, not the
// drift, so they are untouched. The pause itself is one CSS rule on the
// attribute (index.css, beside .nv-sky).
export const SKY_REST_MS = 5000;
export const SKY_REST_ATTR = 'data-nv-sky-rest';
export const SKY_WAKE_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'scroll', 'keydown'];

export function startSkyRest({ root = document.documentElement, target = window, wait = SKY_REST_MS, timers = globalThis } = {}) {
  let t = null;
  const rest = () => { t = null; root.setAttribute(SKY_REST_ATTR, ''); };
  const wake = () => {
    if (root.hasAttribute(SKY_REST_ATTR)) root.removeAttribute(SKY_REST_ATTR);
    if (t != null) timers.clearTimeout(t);
    t = timers.setTimeout(rest, wait);
  };
  // capture, so a scroll inside <main> (scroll does not bubble) still wakes it
  const opts = { passive: true, capture: true };
  for (const ev of SKY_WAKE_EVENTS) target.addEventListener(ev, wake, opts);
  wake();
  return () => {
    if (t != null) timers.clearTimeout(t);
    for (const ev of SKY_WAKE_EVENTS) target.removeEventListener(ev, wake, opts);
    root.removeAttribute(SKY_REST_ATTR);
  };
}
