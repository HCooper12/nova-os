import { useEffect, useRef, useState } from 'react';

// A number that arrives rather than appears. Counts from where it was to
// where it is, on a decelerating curve, so a figure that changed while you
// weren't looking announces itself instead of silently swapping.
//
// Rules it keeps: never invents a value (null stays null), never animates on
// the very first paint of a real number when there was nothing before (that
// would be motion for its own sake), and honours reduced motion by snapping.
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), style, duration = 650 }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    fromRef.current = value;
    if (to == null || from == null || from === to) { setShown(to); return; }

    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setShown(to); return; }

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // decelerate — fast, then settle
      setShown(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  if (shown == null) return <span style={style}>—</span>;
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{format(shown)}</span>;
}
