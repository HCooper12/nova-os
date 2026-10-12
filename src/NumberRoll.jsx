import { useEffect, useRef } from 'react';
import { isFigure } from './countFigure.js';

// THE ODOMETER (13 Oct 2026, keynote-motion §1). A hero number that CHANGES
// rolls each digit on its own column, the units first and the leftmost last
// to settle, on Nova's snappy spring, with a little blur while the digits fly.
// It is for the number that is the point of the moment (protein left after a
// meal is ticked, sets done, a total that moved); CountUp.jsx stays the tool
// for figures arriving with their page.
//
// The rules it keeps:
//   - the first paint shows the figure still (a CSS transition never runs on
//     mount); only a change rolls
//   - columns are keyed from the RIGHT, so 99 → 100 keeps the units column
//     and grows a new one on the left instead of every digit jumping
//   - tabular numerals: nothing beside it moves while it rolls
//   - VoiceOver reads the whole value once (aria-label), never ten digits
//   - never invents a value: null, NaN, Infinity show a dash
//   - reduced motion: the CSS drops the transition, the number lands
const defaultFormat = (n) => Math.round(n).toLocaleString('en-AU');
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The characters of a formatted figure, each keyed by its place from the right. */
export function rollCells(text) {
  const chars = [...String(text)];
  return chars.map((ch, i) => {
    const fromRight = chars.length - 1 - i;
    return /\d/.test(ch) ? { key: `d${fromRight}`, digit: Number(ch), place: fromRight } : { key: `s${fromRight}`, text: ch };
  });
}

export function NumberRoll({ value, format = defaultFormat, className = '', style }) {
  const text = isFigure(value) ? format(value) : '—';
  const ref = useRef(null);
  const last = useRef(text);
  // the blur rides only while digits are moving: a class set on change and
  // cleared when the slowest column has settled
  useEffect(() => {
    if (last.current === text || !ref.current) { last.current = text; return undefined; }
    last.current = text;
    const el = ref.current;
    el.classList.add('rolling');
    const t = setTimeout(() => el.classList.remove('rolling'), 420);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <span ref={ref} className={`nv-roll ${className}`.trim()} style={style} role="img" aria-label={text}>
      {rollCells(text).map((c) => (c.text != null
        ? <span key={c.key} className="nv-roll-s" aria-hidden="true">{c.text}</span>
        : (
          <span key={c.key} className="nv-roll-d" aria-hidden="true" style={{ '--d': c.digit, '--p': c.place }}>
            <span className="col">{DIGITS.map((d) => <span key={d}>{d}</span>)}</span>
            {/* the settled digit, in the flow, sizes the cell exactly */}
            <span className="sizer">{c.digit}</span>
          </span>
        )))}
    </span>
  );
}
