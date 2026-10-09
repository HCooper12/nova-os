import { useLayoutEffect, useRef } from 'react';
import { COUNT_MS, countAt, countStart, isFigure, parseFigure } from './countFigure.js';

// A number that arrives rather than appears. Counts from what was on screen
// to the new value on the ring arcs' decelerating curve, so a figure that
// changed announces itself instead of silently swapping.
//
// THE COUNT NEVER RE-RENDERS (9 Oct 2026, the motion audit's first gap).
// React renders the final figure once; each frame of the count is written
// straight into that same text node through a ref, so a 650 ms count costs
// no React commits at all, and a whole-app render arriving mid-count leaves
// it alone (React only touches the node when the final string changes).
//
// The rules it keeps:
//   - never invents a value: null, NaN and Infinity show a dash
//   - counts only when the value CHANGES; the first paint shows the figure
//     still. `fromZero` is the single switch for an arrival count from 0
//     (his call on arrival count-ups is open, so it defaults off)
//   - a second change mid-count carries on from the digits on screen
//   - tabular numerals, and the box is held at the wider of the start and
//     end figures for the length of the count, so nothing beside it moves
//   - reduced motion: no count, the new figure simply lands
export function CountUp({ value, format = defaultFormat, style, className, duration = COUNT_MS, fromZero = false }) {
  const textRef = useRef(null);
  const boxRef = useRef(null);
  const shownRef = useRef(undefined); // the figure on screen right now
  const rafRef = useRef(0);
  const fmtRef = useRef(format);
  fmtRef.current = format;

  const figure = isFigure(value) ? value : null;
  const final = figure == null ? '—' : format(figure);
  const finalRef = useRef(final);
  finalRef.current = final;

  useLayoutEffect(() => {
    const node = textRef.current?.firstChild;
    const box = boxRef.current;
    const from = countStart({ prev: shownRef.current, next: figure, fromZero, reduced: reducedMotion() });
    if (from == null || !node) {
      // no count: the figure React rendered is the one on screen (a count
      // this one interrupted may have left its own digits in the node)
      shownRef.current = figure;
      if (node && node.nodeValue !== finalRef.current) node.nodeValue = finalRef.current;
      if (box && box.dataset.w !== finalRef.current) box.dataset.w = finalRef.current;
      return undefined;
    }
    const fmt = fmtRef.current;
    const start = performance.now();
    const fromText = fmt(from);
    const to = fmt(figure);
    // hold the wider of the two strings so the count never moves its neighbours
    if (box) box.dataset.w = fromText.length > to.length ? fromText : to;
    node.nodeValue = fromText;
    shownRef.current = from;
    const tick = (now) => {
      const n = countAt(from, figure, now - start, duration);
      shownRef.current = n;
      const s = fmt(n);
      if (node.nodeValue !== s) node.nodeValue = s;
      if (n !== figure) { rafRef.current = requestAnimationFrame(tick); return; }
      shownRef.current = figure;
      if (box) box.dataset.w = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    // cut short by a new value: the next run starts from shownRef, the
    // digits on screen, and writes its own text before the frame paints
    return () => cancelAnimationFrame(rafRef.current);
  }, [figure, duration, fromZero]);

  return (
    // the box's width is held by a hidden ::before reading data-w (index.css
    // .nv-count), so the figure's text appears once in the DOM
    <span ref={boxRef} className={className ? `nv-count ${className}` : 'nv-count'} data-w={final} style={style}>
      <span ref={textRef}>{final}</span>
    </span>
  );
}

// A figure that comes as a formatted string ('2,361', '7:12', '78.2'): counted
// when it parses as one, shown exactly as given when it does not ('—', '7h').
export function CountText({ text, ...rest }) {
  const parsed = parseFigure(text);
  if (!parsed) return text;
  return <CountUp value={parsed.value} format={parsed.format} {...rest} />;
}

const defaultFormat = (n) => Math.round(n).toLocaleString();
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
