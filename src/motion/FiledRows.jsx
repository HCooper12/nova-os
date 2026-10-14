import { useLayoutEffect, useRef } from 'react';
import { findWords } from '../filedFlight.js';
import { spring, reducedMotion } from './springs.js';
import './textToLayout.css';

// TEXT → LAYOUT (15 Oct 2026; mockup "Nova motion set" #s5, his approval).
// The rows a capture was filed as, under its receipt in the conversation.
// When the filing lands WHILE HE IS LOOKING (this receipt was on screen,
// routing, and now reads filed), the item words leave his sentence and fly
// into these rows, then each row's tick draws: he sees what Nova heard and
// where it went. The words are the ones code filed (src/filedFlight.js),
// found verbatim in what he said; a filed name that is not in his sentence
// fades into its row instead. Opened later, it is simply the list.
//
// React always renders the END state; the flight lives in WAAPI animations
// with fill, so a re-render mid-flight cannot strip it, and unmounting
// cancels it cleanly (copies removed, his sentence restored).

const RISE_MS = 600;
const FLY_MS = 700;
const FLY_STAGGER = 120;
const TICK_MS = 260;

function textRange(el, start, end) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0; let sNode = null; let sOff = 0; let eNode = null; let eOff = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.nodeValue.length;
    if (!sNode && start < pos + len) { sNode = n; sOff = start - pos; }
    if (sNode && end <= pos + len) { eNode = n; eOff = end - pos; break; }
    pos += len;
  }
  if (!sNode || !eNode) return null;
  const r = document.createRange();
  r.setStart(sNode, sOff);
  r.setEnd(eNode, eOff);
  return r;
}

function highlights() {
  const reg = typeof CSS !== 'undefined' ? CSS.highlights : null;
  if (!reg || typeof Highlight !== 'function') return null;
  const get = (name, priority) => {
    let h = reg.get(name);
    if (!h) { h = new Highlight(); h.priority = priority; reg.set(name, h); }
    return h;
  };
  return { rest: get('nv-filed-rest', 0), gone: get('nv-filed-gone', 1) };
}

function runFlight(root, sourceEl, rows) {
  const anims = [];
  const timers = [];
  const flies = [];
  const lit = { rest: [], gone: [] };
  const hl = highlights();
  const play = (el, frames, timing) => {
    if (!el || typeof el.animate !== 'function') return null;
    try { const a = el.animate(frames, timing); anims.push(a); return a; } catch { return null; }
  };
  const restore = () => {
    if (!hl) return;
    for (const r of lit.rest.splice(0)) hl.rest.delete(r);
    for (const r of lit.gone.splice(0)) hl.gone.delete(r);
  };
  const cleanup = () => {
    for (const t of timers) clearTimeout(t);
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    for (const f of flies) f.remove();
    restore();
  };

  const rowEls = [...root.querySelectorAll('.row')];
  const reduce = reducedMotion();
  if (reduce) {
    play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    return cleanup;
  }
  const sentence = sourceEl ? sourceEl.textContent || '' : '';
  const spots = findWords(sentence, rows.map((r) => r.name));
  // the list arrives first (smooth), and every row holds its words back
  play(root, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: RISE_MS, easing: spring('smooth') });
  let last = RISE_MS;
  rowEls.forEach((row, k) => {
    const land = RISE_MS + k * FLY_STAGGER + FLY_MS;
    last = Math.max(last, land + TICK_MS);
    const t = row.querySelector('.t');
    const path = row.querySelector('.tk path');
    play(t, [{ opacity: 0 }, { opacity: 0 }], { duration: land, fill: 'none' });
    if (!spots[k] || !sourceEl) {
      // not said verbatim: no flight from a place it was not said, it fades in
      play(t, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: land, easing: 'ease-out', fill: 'backwards' });
    }
    play(path, [
      { strokeDashoffset: 20, offset: 0 },
      { strokeDashoffset: 20, offset: land / (land + TICK_MS), easing: 'ease-out' },
      { strokeDashoffset: 0 },
    ], { duration: land + TICK_MS });
  });

  if (sourceEl && spots.some(Boolean)) {
    timers.push(setTimeout(() => {
      const all = textRange(sourceEl, 0, sentence.length);
      if (hl && all) { hl.rest.add(all); lit.rest.push(all); }
      const snappy = spring('snappy');
      const srcSize = parseFloat(getComputedStyle(sourceEl).fontSize) || 16;
      rowEls.forEach((row, k) => {
        const spot = spots[k];
        const t = row.querySelector('.t');
        if (!spot || !t) return;
        const range = textRange(sourceEl, spot[0], spot[1]);
        const src = range?.getClientRects?.()[0];
        if (!src) {
          play(t, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: k * FLY_STAGGER + FLY_MS, easing: 'ease-out', fill: 'backwards' });
          return;
        }
        if (hl) { hl.gone.add(range); lit.gone.push(range); }
        const dst = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        const sc = srcSize / (parseFloat(cs.fontSize) || 16);
        const fly = document.createElement('span');
        fly.className = 'nv-filed-fly';
        fly.setAttribute('aria-hidden', 'true');
        fly.textContent = rows[k].name;
        Object.assign(fly.style, {
          left: `${dst.left}px`, top: `${dst.top}px`, height: `${dst.height}px`,
          font: cs.font, letterSpacing: cs.letterSpacing, color: cs.color,
        });
        document.body.appendChild(fly);
        flies.push(fly);
        const dx = src.left - dst.left;
        const dy = src.top + src.height / 2 - dst.top - (dst.height * sc) / 2;
        const a = play(fly, [{ transform: `translate(${dx}px, ${dy}px) scale(${sc})` }, { transform: 'none' }],
          { duration: FLY_MS, delay: k * FLY_STAGGER, easing: snappy, fill: 'backwards' });
        const land = () => { fly.remove(); };
        if (a) a.finished.then(land, land); else land();
      });
    }, RISE_MS));
    // his sentence comes back whole once the last word has landed, and no
    // copy outlives the flight whatever happened to its animation
    timers.push(setTimeout(() => { restore(); for (const f of flies) f.remove(); }, last + 200));
  }
  return cleanup;
}

// f: filedFor()'s answer for this line; source(j): his sentence's element
export function FiledRows({ f, source }) {
  const ref = useRef(null);
  const prev = useRef(f?.state);
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = f?.state;
    if (f?.state !== 'filed' || was !== 'waiting' || !ref.current) return undefined;
    let el = null;
    try { el = f.from != null ? source?.(f.from) : null; } catch { el = null; }
    return runFlight(ref.current, el, f.rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f?.state]);
  if (!f || f.state !== 'filed') return null;
  const n = f.rows.length;
  return (
    <div ref={ref} className="nv-filed" role="group" aria-label={`${f.label}: ${f.rows.map((r) => r.name).join(', ')}`}>
      <div className="hd"><b>{f.label}</b><span>{n} added</span></div>
      {f.rows.map((r, k) => (
        <div className="row" key={k}>
          <span className="tk" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2 6.5 5 9l5-6" /></svg></span>
          <span className="t">{r.name}</span>
          {r.amount && <span className="q">{r.amount}</span>}
        </div>
      ))}
    </div>
  );
}
