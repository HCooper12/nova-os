import { useLayoutEffect, useRef, useState } from 'react';
import { spring, SPRING_MS, reducedMotion } from './springs.js';
import './glassFocus.css';

// GLASS FOCUS (15 Oct 2026; mockup "Nova motion set" #s7, his approval).
// "Tomorrow needs": askFor's ladder (src/wrapLadder.js). The first time the
// card appears on a given day (per viewer), the rows soften, Nova's liquid
// glass scans them once top to bottom (snappy, 300 ms a row) and settles
// with a bouncy spring on the rung code ranked first; that row comes sharp,
// its value takes the orange, and the reason rises in. Every later visit
// that day shows the settled card. The lens goes where `f.hero` says: the
// server's own answer, never a guess.
//
// React renders only the settled state; the scan is WAAPI on top of it, so a
// re-render cannot strand a half-scanned card and leaving cancels it clean.

const SEEN_KEY = 'novaos.wrapFocus.seen';
const ROW_H = 36;
const APPEAR_MS = 360;
const STEP_MS = 300;
const SOFT_MS = 200;
const SOFT = { filter: 'blur(1.4px)', opacity: 0.5 };
const SHARP = { filter: 'blur(0px)', opacity: 1 };

function seenToday(date) {
  if (!date) return true;
  try { return localStorage.getItem(SEEN_KEY) === date; } catch { return false; }
}

function scan(root, hero) {
  const anims = [];
  const play = (el, frames, timing) => {
    if (!el || typeof el.animate !== 'function') return;
    try { anims.push(el.animate(frames, timing)); } catch { /* motion is never a requirement */ }
  };
  const cleanup = () => { for (const a of anims) { try { a.cancel(); } catch { /* gone */ } } };
  const rows = [...root.querySelectorAll('.nv-wf-r')];
  const lens = root.querySelector('.nv-wf-lens');
  const why = root.querySelector('.nv-wf-why');
  if (!rows[hero] || !lens) return cleanup;
  if (reducedMotion()) {
    play(lens, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    play(why, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    return cleanup;
  }
  const snappy = spring('snappy');
  const bouncy = spring('bouncy');
  const y = (i) => rows[i].offsetTop;
  // once down the ladder, then back to the rung that was picked
  const path = rows.map((_, i) => i);
  if (hero !== rows.length - 1) path.push(hero);
  // when the lens leaves for each stop, and the whole run
  const starts = [0];
  let t = APPEAR_MS;
  for (let k = 1; k < path.length; k++) { starts.push(t); t += k === path.length - 1 ? SPRING_MS.bouncy : STEP_MS; }
  const total = t;

  const lensFrames = [
    { offset: 0, transform: `translateY(${y(path[0])}px) scale(.94)`, opacity: 0, easing: snappy },
    { offset: APPEAR_MS / total, transform: `translateY(${y(path[0])}px) scale(1)`, opacity: 1, easing: path.length > 2 ? snappy : bouncy },
  ];
  for (let k = 1; k < path.length; k++) {
    const end = k === path.length - 1 ? total : starts[k + 1];
    lensFrames.push({ offset: end / total, transform: `translateY(${y(path[k])}px) scale(1)`, opacity: 1, easing: k + 1 === path.length - 1 ? bouncy : snappy });
  }
  play(lens, lensFrames, { duration: total, easing: 'linear' });

  // each row is sharp while the lens is on it, soft otherwise; the picked row
  // ends sharp and the others soft, which is exactly what the CSS holds
  rows.forEach((row, i) => {
    const sharpAt = (time) => {
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= time) k++;
      return path[k] === i;
    };
    const changes = [0, ...starts.slice(1)];
    const frames = [{ offset: 0, ...(sharpAt(0) ? SHARP : SOFT) }];
    let was = sharpAt(0);
    for (const c of changes.slice(1)) {
      const now = sharpAt(c);
      if (now === was) continue;
      frames.push({ offset: c / total, ...(was ? SHARP : SOFT) });
      frames.push({ offset: Math.min(1, (c + SOFT_MS) / total), ...(now ? SHARP : SOFT) });
      was = now;
    }
    if (frames[frames.length - 1].offset < 1) frames.push({ offset: 1, ...(was ? SHARP : SOFT) });
    play(row, frames, { duration: total, easing: 'linear' });
  });

  // the value takes the orange as the lens settles, then the reason rises in
  const v = rows[hero].querySelector('.v');
  let ink = '';
  let or = '';
  try { const cs = getComputedStyle(root); ink = cs.getPropertyValue('--nv-ink').trim(); or = cs.getPropertyValue('--nv-or').trim(); } catch { /* defaults */ }
  if (v && ink && or) {
    const settle = starts[starts.length - 1];
    play(v, [{ color: ink }, { color: ink, offset: settle / (total + 200) }, { color: or }], { duration: total + 200, easing: 'ease-out' });
  }
  play(why, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
    { duration: SPRING_MS.snappy, delay: total - 240, easing: snappy, fill: 'backwards' });
  return cleanup;
}

export function WrapFocus({ f }) {
  const ref = useRef(null);
  // decided once, at first draw: has he already watched it settle today?
  const [fresh] = useState(() => !seenToday(f?.date));
  useLayoutEffect(() => {
    if (!fresh || !ref.current || !f) return undefined;
    try { localStorage.setItem(SEEN_KEY, f.date); } catch { /* the scan simply plays again */ }
    return scan(ref.current, f.hero);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);
  if (!f) return null;
  const hero = f.rows[f.hero];
  return (
    <div className="nv-wf" ref={ref}>
      <div className="nv-wf-h"><b>Tomorrow needs</b><span>in the order Nova checks</span></div>
      <div className="nv-wf-list" role="list" aria-label={`Tomorrow needs: ${hero?.label}, ${hero?.value}`}>
        <div className="nv-liquid nv-liquid-thin nv-wf-lens" aria-hidden="true" style={{ transform: `translateY(${f.hero * ROW_H}px)` }} />
        {f.rows.map((r, i) => (
          <div key={r.key} role="listitem" className={`nv-wf-r${i === f.hero ? ' hero' : ''}`} aria-current={i === f.hero ? 'true' : undefined}>
            <span>{r.label}</span><span className="v">{r.value}</span>
          </div>
        ))}
      </div>
      {f.why && <p className="nv-wf-why">{f.why}</p>}
    </div>
  );
}
