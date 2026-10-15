// BUTTON → PLAYER (the motion set, mockup #s1, approved 15 Oct 2026).
//
// The briefing plays on Nova's full-screen stage, not in an inline player,
// so the pill he taps grows into that screen on the grow-into-page engine
// (src/pageMotion.js): <main> is clipped to the pill's own rectangle and its
// 999px corners, and springs open. The stage's controls then rise in, 50 ms
// apart (src/motion/briefingGrow.css). Closing folds the stage back down
// into the same pill on the snappy spring, when that pill is on screen to
// land on; otherwise the screen rises as every other back does.
//
// A pill opts in with data-grow="briefing:<record id>" (the Inbox's "Open
// the briefing" in both idioms), so the fold finds the very pill he tapped
// among several. DOM only; App.jsx decides when, as it does for Home.

import { takeTap, freeze, shrink } from '../pageMotion.js';
import { mainEl } from '../settingsNav.js';
import { BRIEFING_GROW } from './growKeys.js';
const isPill = (key) => typeof key === 'string' && key.startsWith(`${BRIEFING_GROW}:`);

// where the briefing grew out of (the screen, and the pill's key), so the
// way back knows where to fold
let origin = null;

// The tap a screen change grows out of, or null for the usual rise. Home
// keeps its own rule (any card he just tapped); off Home, only the briefing
// pill grows, and only into the briefing.
export function growTapFor(from, to) {
  if (from === to) return null;
  if (from === BRIEFING_GROW) origin = null;
  if (from !== 'mission' && to !== BRIEFING_GROW) return null;
  const tap = takeTap();
  if (to === BRIEFING_GROW) {
    // and where he was on that screen: a back (popstate) restores no scroll
    // of its own, and the pill must be where he left it to fold into
    origin = isPill(tap?.key) ? { screen: from, key: tap.key, scroll: mainEl()?.scrollTop || 0 } : null;
    return from === 'mission' || isPill(tap?.key) ? tap : null;
  }
  return tap;
}

const inView = (el) => {
  const r = el?.getBoundingClientRect?.();
  return !!r && r.height > 8 && r.bottom > 40 && r.top < window.innerHeight - 40;
};

// Leaving the briefing for the screen it grew from: take the picture now
// (before the state changes) and return the fold to play once the screen
// below has rendered. play() is false when there is nothing to fold into,
// so the caller rises instead; the picture is never left behind.
export function foldFrom(from, to) {
  if (from !== BRIEFING_GROW || !origin || to !== origin.screen) { if (from === BRIEFING_GROW) origin = null; return null; }
  const { key, scroll } = origin;
  origin = null;
  const snap = freeze();
  if (!snap) return null;
  return {
    play() {
      const main = mainEl();
      if (main && scroll) main.scrollTop = scroll;
      const pill = typeof document === 'undefined' ? null : [...document.querySelectorAll(`[data-grow="${CSS.escape(key)}"]`)].find(inView);
      if (!pill) { if (snap.layer?.isConnected) snap.layer.remove(); return false; }
      shrink(snap, pill, { spring: 'snappy' });
      return true;
    },
  };
}
