import { useLayoutEffect, useRef, useState } from 'react';
import { spring, reducedMotion, canAnimate } from './springs.js';
import { changeFigure } from './chartFigures.js';
import './chartMorph.css';

// THE CHART MORPH (15 Oct 2026, his approved motion set, scene 2 of
// nova-motion-set.html, keynote-motion §2). A lift's volume, session by
// session, drawn as bars; one tap folds the bars up into dots at their tops,
// a line draws through the dots, and the real first-to-last change lands
// beside the title. Tap again and it unfolds back into bars.
//
// What it is honest about:
//   - every bar is a session he logged (the exercise panel's `recent`, built
//     by server/lib/panels.js from his vault), oldest on the left; a session
//     with no weight moved (bodyweight, time) is not drawn as a zero
//   - the figure is computed here from the first and last values drawn, so
//     it cannot disagree with the chart; under two points there is nothing
//     to compare and the chart is not drawn at all (the caller keeps its rail)
//   - bars start at zero: a bar's height is its value
//
// Motion: bars scaleY to 0 toward their tops (smooth, 50 ms stagger), dots
// spring in where the tops were (bouncy), the line draws by stroke-dashoffset
// (smooth), the figure pops (playful). The base CSS for each mode is the
// still end frame, so reduced motion is simply that frame, and a second tap
// mid-flight starts the other direction from wherever each part is now
// (read off the computed style before the running animations are dropped).
// The mode he last chose is kept on this device.

const KEY = 'novaos.chartMorph.mode';
const readMode = () => { try { return localStorage.getItem(KEY) === 'trend' ? 'trend' : 'bars'; } catch { return 'bars'; } };
const keepMode = (m) => { try { localStorage.setItem(KEY, m); } catch { /* private window: this open still works */ } };

const dayLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? String(iso).slice(5) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};
const kg = (n) => `${Number(n).toLocaleString('en-AU')} kg`;

// the geometry, in the SVG's own units
const W = 280; const BASE = 112; const TOP = 10; const BW = 26;

// current values off the computed style, so a reversal starts where it is
const scaleOf = (el, axis) => {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 1;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return 1;
  const v = m[1].split(',').map(Number);
  return axis === 'y' ? v[3] : v[0];
};

export function ChartMorph({ points, hue = 'var(--nv-cy)', title }) {
  const [mode, setMode] = useState(readMode);
  const rootRef = useRef(null);
  const running = useRef([]);
  const from = useRef(null);
  const change = changeFigure(points);

  // the new mode is in the DOM (its base CSS is the end frame): play from
  // the captured start toward it. fill:'backwards' holds each part at its
  // start through its delay, and when an animation ends the base CSS is
  // already where it ended, so nothing can be left half-way.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const start = from.current;
    from.current = null;
    if (!root || !start || reducedMotion() || !canAnimate(root)) return;
    const S = spring('smooth'); const B = spring('bouncy'); const P = spring('playful');
    const rects = [...root.querySelectorAll('.nv-cm-bar')];
    const dots = [...root.querySelectorAll('.nv-cm-dot')];
    const line = root.querySelector('.nv-cm-line');
    const tag = root.querySelector('.nv-cm-tag');
    const hint = root.querySelector('.nv-cm-hint');
    const go = (el, kf, o) => { const a = el.animate(kf, { fill: 'backwards', ...o }); running.current.push(a); };
    if (mode === 'trend') {
      rects.forEach((r, i) => go(r, [{ transform: `scaleY(${start.rects[i]})` }, { transform: 'scaleY(0)' }], { duration: 560, easing: S.easing, delay: i * 50 }));
      dots.forEach((c, i) => go(c, [{ transform: `scale(${start.dots[i]})` }, { transform: 'scale(1)' }], { duration: B.ms, easing: B.easing, delay: 220 + i * 50 }));
      if (line) go(line, [{ strokeDashoffset: start.line }, { strokeDashoffset: 0 }], { duration: 700 * Math.max(0.3, start.line), easing: S.easing, delay: 560 });
      if (hint) go(hint, [{ opacity: start.hint }, { opacity: 0 }], { duration: 160, easing: 'ease-out' });
      if (tag) go(tag, [{ opacity: start.tag, transform: start.tag > 0.5 ? 'none' : 'translateY(6px) scale(.7)' }, { opacity: 1, transform: 'none' }], { duration: P.ms, easing: P.easing, delay: 1260 });
    } else {
      if (tag) go(tag, [{ opacity: start.tag }, { opacity: 0 }], { duration: 200, easing: 'ease-out' });
      if (line) go(line, [{ strokeDashoffset: start.line }, { strokeDashoffset: 1 }], { duration: 400, easing: 'ease-in' });
      dots.forEach((c, i) => go(c, [{ transform: `scale(${start.dots[i]})` }, { transform: 'scale(0)' }], { duration: 220, easing: 'ease-in', delay: 200 }));
      rects.forEach((r, i) => go(r, [{ transform: `scaleY(${start.rects[i]})` }, { transform: 'scaleY(1)' }], { duration: B.ms, easing: B.easing, delay: 380 + i * 50 }));
      if (hint) go(hint, [{ opacity: start.hint }, { opacity: 1 }], { duration: 240, easing: 'ease-out', delay: 380 });
    }
  }, [mode]);

  // the animations die with the chart
  useLayoutEffect(() => () => { running.current.forEach((a) => a.cancel()); running.current = []; }, []);

  if (!points || points.length < 2 || !change) return null;

  const n = points.length;
  const gap = n > 1 ? (W - BW * n) / (n - 1) : 0;
  const max = Math.max(...points.map((p) => p.value)) || 1;
  const xs = points.map((_, i) => i * (BW + gap));
  const ys = points.map((p) => BASE - (p.value / max) * (BASE - TOP));
  const pts = points.map((_, i) => `${(xs[i] + BW / 2).toFixed(1)},${(ys[i] + 3).toFixed(1)}`).join(' ');
  const tone = change.pct > 0 ? 'up' : change.pct < 0 ? 'down' : 'flat';

  const toggle = () => {
    const root = rootRef.current;
    if (root) {
      // where every part is right now, mid-flight or at rest
      from.current = {
        rects: [...root.querySelectorAll('.nv-cm-bar')].map((r) => scaleOf(r, 'y')),
        dots: [...root.querySelectorAll('.nv-cm-dot')].map((c) => scaleOf(c, 'x')),
        line: parseFloat(getComputedStyle(root.querySelector('.nv-cm-line')).strokeDashoffset) || 0,
        tag: parseFloat(getComputedStyle(root.querySelector('.nv-cm-tag')).opacity) || 0,
        hint: parseFloat(getComputedStyle(root.querySelector('.nv-cm-hint')).opacity) || 0,
      };
      running.current.forEach((a) => a.cancel());
      running.current = [];
    }
    const next = mode === 'trend' ? 'bars' : 'trend';
    keepMode(next);
    setMode(next);
  };

  const said = points.map((p) => `${dayLabel(p.date)} ${kg(p.value)}`).join(', ');
  return (
    <button ref={rootRef} type="button" className="nv-cm" data-mode={mode} data-tone={tone} style={{ '--h': hue }} onClick={toggle}
      aria-pressed={mode === 'trend'}
      aria-label={`${title}: ${said}. ${change.text} from the first to the last. ${mode === 'trend' ? 'Showing the trend; tap for the sessions' : 'Showing the sessions; tap for the trend'}`}>
      <span className="nv-cm-hd" aria-hidden="true">
        <b>{title}</b>
        <span className="nv-cm-slot">
          <span className="nv-cm-hint">Trend</span>
          <span className="nv-cm-tag">{change.text}</span>
        </span>
      </span>
      <svg className="nv-cm-svg" viewBox={`0 0 ${W} ${BASE + 22}`} aria-hidden="true" focusable="false">
        <line className="nv-cm-base" x1="0" x2={W} y1={BASE} y2={BASE} />
        {points.map((p, i) => (
          <g key={p.key}>
            <rect className="nv-cm-bar" x={xs[i]} y={ys[i]} width={BW} height={Math.max(1, BASE - ys[i])} rx="6" />
            <text className="nv-cm-x" x={xs[i] + BW / 2} y={BASE + 17} textAnchor="middle">{dayLabel(p.date)}</text>
          </g>
        ))}
        <polyline className="nv-cm-line" points={pts} pathLength="1" />
        {points.map((p, i) => (
          <circle key={p.key} className="nv-cm-dot" cx={xs[i] + BW / 2} cy={ys[i] + 3} r="4.5" />
        ))}
      </svg>
    </button>
  );
}
