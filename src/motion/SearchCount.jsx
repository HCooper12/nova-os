import { useLayoutEffect, useRef } from 'react';
import { isAppleStyle } from '../Controls.jsx';
import { countLabel, searchKey } from './searchMotion.js';
import { spring, reducedMotion, canAnimate } from './springs.js';
import './searchMotion.css';

// THE COUNT THAT FOLLOWS THE ROWS: "3 recipes" under the field while he is
// searching, the real number of matches, nothing when the field is empty.
// Each change settles in from just above on the snappy spring; a run already
// going is left to land rather than restarted, so fast typing never stutters.
export function SearchCount({ query, n, one, many, style, className = '' }) {
  const ref = useRef(null);
  const run = useRef(null);
  const on = !!searchKey(query);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate(el) || reducedMotion() || run.current?.playState === 'running') return;
    const s = spring('snappy');
    try { run.current = el.animate([{ opacity: 0.35, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }], { duration: Math.min(s.ms, 480), easing: s.easing }); } catch { /* never required */ }
  }, [n, on]);
  if (!on) return null;
  return (
    <span ref={ref} role="status" aria-live="polite" style={style}
      className={`nv-search-count${isAppleStyle() ? ' apple' : ''}${className ? ` ${className}` : ''}`}>
      {countLabel(n, one, many)}
    </span>
  );
}
