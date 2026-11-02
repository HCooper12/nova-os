// AFTER LAYOUT, BEFORE PAINT (the fluidity audit, 2 Nov 2026, finding 3).
//
// A useLayoutEffect that reads geometry (offsetLeft, scrollWidth,
// getBoundingClientRect, getComputedStyle) right after React has written the
// DOM makes the browser lay the whole new screen out synchronously, inside
// the commit: 51 ms at 4x on a switch to Home, for one rail's fit. A
// ResizeObserver's first callback for an element runs at the point in the
// frame where the browser has ALREADY laid the page out and has not yet
// painted, so the same read there costs nothing extra, and anything written
// from it (a scrollLeft, a flushSync'd setState) still lands before the first
// paint: nothing is seen in the wrong place.
//
// afterLayout(el, fn) calls fn(el) once, at that point, and returns a cancel.
// Where ResizeObserver is missing, it falls back to the next animation frame.
export function afterLayout(el, fn) {
  if (!el) return () => {};
  if (typeof ResizeObserver !== 'function') {
    const id = requestAnimationFrame(() => fn(el));
    return () => cancelAnimationFrame(id);
  }
  let done = false;
  const ro = new ResizeObserver(() => {
    if (done) return;
    done = true;
    ro.disconnect();
    fn(el);
  });
  ro.observe(el);
  return () => { done = true; ro.disconnect(); };
}
