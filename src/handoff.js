// THE HAND-OFF: how one screen gives way to the next (4 Nov 2026, his two
// reels, "Dashboard V14" and the "vitrea" glass dashboard: "Nova needs to be
// fluid and dynamic to interact with like this ... less clunky or snap-like").
//
// What the reels do, read at 10 frames a second: the chrome never moves; the
// page being left DISSOLVES (about 150 ms) instead of vanishing; the page
// arriving is BUILT in layers, its title resolving out of a blur, then its
// panels one after another, each rising a little on a spring. Numbers count
// and bars grow inside them (CountUp / arrival.js already do that here).
//
// What Nova did before this, filmed in WebKit at 5x slow motion: the old
// page went in ONE frame (a dark gap), then the whole new page faded in as a
// single sheet (riseMain's opacity on <main>), so the Summary screens' own
// 40 ms stagger was buried under it. That is the "snap".
//
// Two moves, DOM only (App.jsx decides when):
//
//   leave()      BEFORE the state change: a picture of the visible part of
//                the page being left (settingsNav.js' snapshot: the same
//                frozen copy the Settings push and the card grow use), laid
//                over <main> exactly where it was. Nothing on screen changes.
//   arrive(snap) AFTER the commit and the scroll restore: the picture fades
//                and lifts away while the new page's top-level blocks rise
//                in a stagger. No blank frame between the two.
//
// Glass rules, measured in WebKit on 4 Nov: an ancestor's OPACITY keeps the
// liquid glass right; an ancestor's FILTER flattens it (the glass stops
// sampling the sky). So blocks move with opacity + transform only, and the
// blur that resolves the title is put only on text-only elements.
//
// Reduced motion and Nova's Calm: the picture cross-fades away in 160 ms and
// nothing travels, staggers or blurs.

import { snapshot, reducedMotion, mainEl } from './settingsNav.js';
import { houseSpring } from './pageMotion.js';

export const EXIT_MS = 170;
export const STAGGER_MS = 45;
export const MAX_ITEMS = 8;
export const RISE_PX = 14;
const ENTER_MS = 560;
const EXIT_EASE = 'cubic-bezier(.23,1,.32,1)';
const FALLBACK_EASE = 'cubic-bezier(.32,.72,0,1)';

const quiet = () => reducedMotion() || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-nv-calm') === '1');

let running = null; // { snap, anims }
// a picture taken but not yet played: the commit it waits for may be
// abandoned (a second tab tap interrupts a transition), so it is tracked
// and dropped by the next leave() or by its own deadline
let pending = null;
let pendingTimer = 0;
const PENDING_MAX_MS = 1500;

function showMain() {
  const main = mainEl();
  if (main && main.style.opacity === '0') main.style.opacity = '';
}

function stop() {
  if (pending) { const p = pending; pending = null; clearTimeout(pendingTimer); if (p.layer?.isConnected) p.layer.remove(); }
  showMain();
  if (!running) return;
  const r = running;
  running = null;
  r.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
  if (r.snap?.layer?.isConnected) r.snap.layer.remove();
}

// The page being left, frozen. Call synchronously, before the setState that
// swaps the screen. A hand-off still running is finished first, so a quick
// run of tab taps never stacks pictures.
export function leave() {
  stop();
  if (typeof document === 'undefined') return null;
  try {
    const snap = snapshot();
    if (!snap) return null;
    // the Settings push dims its parent page; a hand-off never does
    if (snap.dim?.isConnected) snap.dim.remove();
    // the live page under the picture is hidden until the new one commits:
    // glass under a copy of itself reads twice as dense (opacity on <main>
    // keeps the glass right in WebKit; a filter would not)
    const main = mainEl();
    if (main) main.style.opacity = '0';
    pending = snap;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { if (pending === snap) { pending = null; discard(snap); } }, PENDING_MAX_MS);
    return snap;
  } catch { return null; }
}

// Drop a picture without playing it (the navigation turned out not to be a
// screen change, or a card grow took over).
export function discard(snap) {
  if (snap && pending === snap) { pending = null; clearTimeout(pendingTimer); }
  if (snap?.layer?.isConnected) snap.layer.remove();
  showMain();
}

// The blocks to build the page from: walk down single-child wrappers to the
// first element holding three or more visible children (the screen's own
// list of sections), then keep the ones on screen, in order.
export function contentItems(main, max = MAX_ITEMS) {
  if (!main) return [];
  const box = main.getBoundingClientRect();
  let n = main;
  for (let depth = 0; depth < 6 && n; depth++) {
    const kids = Array.from(n.children).filter((c) => c.getBoundingClientRect().height > 2);
    if (kids.length >= 3) {
      return kids.filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > box.top && r.top < box.bottom; }).slice(0, max);
    }
    if (!kids.length) return [];
    n = kids.reduce((a, b) => (b.getBoundingClientRect().height > a.getBoundingClientRect().height ? b : a));
  }
  return [];
}

// text-only blocks may resolve out of a blur; anything holding glass may not
const TEXTY = new Set(['H1', 'H2', 'H3', 'P']);
function blurs(el) {
  return TEXTY.has(el.tagName) && !el.querySelector('.nv-sum-card, .nv-liquid, .nv-pane, canvas');
}

export function arrive(snapIn, { build = true } = {}) {
  let snap = snapIn;
  const main = mainEl();
  if (!main) { discard(snap); return; }
  if (snap && pending === snap) { pending = null; clearTimeout(pendingTimer); }
  // a picture already dropped (its deadline passed) is not played
  if (snap && !snap.layer?.isConnected) snap = null;
  const anims = [];
  const calm = quiet();
  if (snap?.layer?.isConnected) {
    anims.push(snap.layer.animate(
      calm
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.985)' }],
      { duration: calm ? 160 : EXIT_MS, easing: EXIT_EASE, fill: 'forwards' },
    ));
  }
  // the blocks' own `backwards` fills hold them hidden through their delays,
  // so <main> can show again in the same frame as the picture starts to go
  showMain();
  if (!calm && build) {
    const spring = houseSpring('snappy') || FALLBACK_EASE;
    contentItems(main).forEach((el, i) => {
      const from = { opacity: 0, transform: `translateY(${RISE_PX}px) scale(.985)` };
      const to = { opacity: 1, transform: 'none' };
      if (blurs(el)) { from.filter = 'blur(8px)'; to.filter = 'blur(0px)'; }
      try {
        // BACKWARDS, never both: a held transform would outrank Interactive's
        // press scale for as long as the block lives (the .nv-sum-rise note)
        anims.push(el.animate([from, to], { duration: ENTER_MS, easing: spring, delay: i * STAGGER_MS, fill: 'backwards' }));
      } catch { /* motion is never a requirement */ }
    });
  }
  if (!anims.length) { discard(snap); return; }
  const mine = { snap, anims };
  running = mine;
  // the picture goes when its fade ends; the blocks release themselves
  const lead = anims[0];
  lead.finished.catch(() => {}).then(() => {
    if (snap?.layer?.isConnected) snap.layer.remove();
  });
  Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => { if (running === mine) running = null; });
}
