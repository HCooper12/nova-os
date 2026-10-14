import { useCallback, useLayoutEffect, useRef } from 'react';
import { spring, SPRING_MS, reducedMotion, cancelAll } from './springs.js';
import './springStack.css';

// THE SPRING STACK (15 Oct 2026; mockup "Nova motion set" #s3, his approval).
// Deck → List: the pile fans once (each card turns up to ±7° and spreads,
// snappy, 300 ms), then every card springs into its own row (bouncy, 60 ms
// apart). List → Deck: the cards gather back into the pile (snappy).
//
// FLIP, never hard-coded offsets: real Inbox cards differ in height, so every
// start and end is measured. `capture()` is called in the tap, BEFORE the
// state change, while the old mode is still on screen; the layout effect then
// measures the new mode and plays the difference on transform and opacity
// only. The cards beyond STACK_MAX simply arrive.
//
// Interrupted (a second tap while cards are still moving), each card starts
// from where it is DRAWN, not from its old slot, and goes straight to its new
// one: a retarget, never a snap back to the start or a card left half-turned.
// Reduced motion: the list cross-fades in and the pile fades back; no travel.
//
// The rows going back into the deck are no longer React's (only the top card
// renders in deck mode), so each is a COPY taken in the tap: inert, unseen by
// any measure, clipped to the top card's height so it lands exactly on the
// resting sheet that replaces it.

export const STACK_MAX = 6;
export const FAN_MS = 300;
export const STAGGER_MS = 60;
export const GATHER_STAGGER_MS = 40;

// where card i rests in the pile, relative to the top card's box
export function pileOf(i) {
  return { y: -9 * i, s: Math.max(0, 1 - 0.05 * i), o: i === 0 ? 1 : i === 1 ? 0.75 : i === 2 ? 0.5 : 0 };
}

// card i of n, fanned: symmetric about the middle card, ±7° and ±18 px at the
// ends (the mockup's three-card fan, kept for any count up to STACK_MAX)
export function fanOf(i, n) {
  const c = (n - 1) / 2;
  const k = c > 0 ? (i - c) / c : 0;
  return { x: +(18 * k).toFixed(2), y: 6 * i, r: +(7 * k).toFixed(2) };
}

const tf = (x, y, r = 0, s = 1) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r}deg) scale(${s})`;

// the element's resting layout box in viewport space (offsets ignore transforms)
function natOf(el, colBox) {
  return { left: colBox.left + el.offsetLeft, top: colBox.top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}
function drawnOf(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
}
// the transform that draws a box resting at `nat` where `d` is drawn
// (transform-origin: top centre, so a scale keeps the top edge in place)
function flipFrom(nat, d) {
  const s = nat.w ? d.w / nat.w : 1;
  return tf(d.left - nat.left - (nat.w * (1 - s)) / 2, d.top - nat.top, 0, +s.toFixed(4));
}

export function useSpringStack(colRef, mode) {
  const snap = useRef(null);
  const anims = useRef([]);
  const ghosts = useRef([]);
  const timer = useRef(0);

  const clear = () => {
    cancelAll(anims.current);
    clearTimeout(timer.current);
    colRef.current?.classList.remove('moving');
    for (const g of ghosts.current.splice(0)) g.remove();
  };

  // in the tap, before the mode changes: what is on screen, and where
  const capture = useCallback(() => {
    const col = colRef.current;
    if (!col) { snap.current = null; return; }
    const cards = [...col.querySelectorAll(':scope > [data-stack]')];
    const moving = anims.current.some((a) => a.playState === 'running');
    const colBox = col.getBoundingClientRect();
    const drawn = new Map();
    for (const el of cards.slice(0, STACK_MAX)) drawn.set(el.dataset.stack, drawnOf(el));
    for (const g of ghosts.current) drawn.set(g.dataset.stackGhost, drawnOf(g));
    const pane = cards[0]?.querySelector('.nv-pane');
    let radius = '0px';
    try { if (pane) radius = getComputedStyle(pane).borderTopLeftRadius || '0px'; } catch { /* no style */ }
    snap.current = {
      from: mode,
      moving,
      count: cards.length,
      anchor: cards[0] ? natOf(cards[0], colBox) : null,
      drawn,
      radius,
      // list → deck: copies of the rows that are about to stop rendering
      clones: mode === 'list'
        ? cards.slice(1, STACK_MAX).map((el) => ({ id: el.dataset.stack, node: el.cloneNode(true), w: el.offsetWidth, h: el.offsetHeight }))
        : [],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useLayoutEffect(() => {
    const s = snap.current;
    snap.current = null;
    if (!s || s.from === mode) return;
    const col = colRef.current;
    if (!col || typeof col.animate !== 'function') return;
    clear();
    const colBox = col.getBoundingClientRect();
    const cards = [...col.querySelectorAll(':scope > [data-stack]')];
    const reduce = reducedMotion();
    // the move's length: the opaque floors and the copies go when it ends
    const settleAfter = (ms) => {
      col.classList.add('moving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        col.classList.remove('moving');
        for (const g of ghosts.current.splice(0)) g.remove();
      }, ms + 40);
    };
    const play = (el, frames, timing) => {
      try { const a = el.animate(frames, { fill: 'backwards', ...timing }); anims.current.push(a); return a; } catch { return null; }
    };

    if (mode === 'list') {
      const n = Math.min(cards.length, STACK_MAX);
      if (n < 2 && !s.moving) return;
      const A = s.anchor;
      if (!reduce) settleAfter(FAN_MS + n * STAGGER_MS + SPRING_MS.bouncy);
      const snappy = spring('snappy').easing;
      const bouncy = spring('bouncy').easing;
      cards.forEach((el, i) => {
        if (reduce) { play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); return; }
        if (i >= STACK_MAX) {
          // the rest arrive as the fanned cards land
          play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: FAN_MS + n * STAGGER_MS, easing: 'ease-out' });
          return;
        }
        const nat = natOf(el, colBox);
        const z = String(STACK_MAX - i);
        const from = s.moving ? s.drawn.get(el.dataset.stack) : null;
        if (from || !A) {
          // retarget: from where it is drawn, straight to its row
          if (!from) return;
          play(el, [{ transform: flipFrom(nat, from), opacity: 1, zIndex: z }, { transform: 'none', opacity: 1, zIndex: z }],
            { duration: SPRING_MS.bouncy, easing: bouncy, delay: i * STAGGER_MS });
          return;
        }
        const p = pileOf(i);
        const f = fanOf(i, n);
        const dx = A.left - nat.left;
        const dy = A.top - nat.top;
        const total = FAN_MS + i * STAGGER_MS + SPRING_MS.bouncy;
        const frames = [
          { offset: 0, transform: tf(dx, dy + p.y, 0, p.s), opacity: p.o, zIndex: z, easing: snappy },
          { offset: FAN_MS / total, transform: tf(dx + f.x, dy + f.y, f.r, 1), opacity: 1, zIndex: z, easing: i ? 'linear' : bouncy },
        ];
        if (i) frames.push({ offset: (FAN_MS + i * STAGGER_MS) / total, transform: tf(dx + f.x, dy + f.y, f.r, 1), opacity: 1, zIndex: z, easing: bouncy });
        frames.push({ offset: 1, transform: 'none', opacity: 1, zIndex: z });
        play(el, frames, { duration: total, easing: 'linear' });
      });
      return;
    }

    // list → deck: the top card settles into place, the copies gather behind it
    const top = cards[0];
    const sheets = [...col.querySelectorAll(':scope > .nv-stack-sheet')];
    if (reduce || !top) {
      sheets.forEach((sh) => play(sh, [{ opacity: 0 }, { opacity: getComputedStyle(sh).opacity }], { duration: 160, easing: 'ease-out' }));
      return;
    }
    const snappy = spring('snappy').easing;
    const nat0 = natOf(top, colBox);
    const from0 = s.drawn.get(top.dataset.stack);
    if (!s.clones.length) settleAfter(SPRING_MS.snappy);
    if (from0) play(top, [{ transform: flipFrom(nat0, from0), opacity: 1 }, { transform: 'none', opacity: 1 }], { duration: SPRING_MS.snappy, easing: snappy });
    const k = s.clones.length;
    let longest = 0;
    s.clones.forEach((c, j) => {
      const i = j + 1;
      const d = s.drawn.get(c.id);
      if (!d) return;
      const g = c.node;
      for (const n of [g, ...g.querySelectorAll('[data-stack],[id]')]) { n.removeAttribute?.('data-stack'); n.removeAttribute?.('id'); }
      g.className = `${g.className || ''} nv-stack-ghost`.trim();
      g.dataset.stackGhost = c.id;
      g.setAttribute('aria-hidden', 'true');
      g.setAttribute('inert', '');
      const sd = c.w ? d.w / c.w : 1;
      const L = d.left - colBox.left - (c.w * (1 - sd)) / 2;
      const T = d.top - colBox.top;
      Object.assign(g.style, { left: `${L}px`, top: `${T}px`, width: `${c.w}px`, height: `${c.h}px`, animation: 'none' });
      col.appendChild(g);
      ghosts.current.push(g);
      // the cards beyond the visible two gather into the back of the pile and
      // fade there, rather than stacking up above it
      const p = { ...pileOf(Math.min(i, 2)), o: pileOf(i).o };
      const clipB = Math.max(0, c.h - nat0.h);
      const delay = (k - j - 1) * GATHER_STAGGER_MS;
      const duration = SPRING_MS.snappy;
      longest = Math.max(longest, delay + duration);
      play(g, [
        { transform: tf(0, 0, 0, +sd.toFixed(4)), clipPath: `inset(0px 0px 0px 0px round ${s.radius})` },
        { transform: tf(nat0.left - (colBox.left + L), nat0.top - (colBox.top + T) + p.y, 0, p.s), clipPath: `inset(0px 0px ${clipB}px 0px round ${s.radius})` },
      ], { duration, delay, easing: snappy, fill: 'both' });
      // opacity rides its own clock: full while it travels, the pile's weight
      // as it lands, then gone under the resting sheet
      play(g, [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: p.o, offset: 0.75 }, { opacity: 0 }], { duration, delay, easing: 'linear', fill: 'both' });
    });
    if (!longest) return;
    // the resting sheets fade up as the copies arrive on them
    sheets.forEach((sh) => {
      let o = '1';
      try { o = getComputedStyle(sh).opacity; } catch { /* default */ }
      play(sh, [{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: o }], { duration: longest, easing: 'linear' });
    });
    settleAfter(Math.max(longest, SPRING_MS.snappy));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // leaving the screen mid-move leaves nothing behind
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => clear(), []);

  return capture;
}
