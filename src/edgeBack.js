// THE BACK SWIPE THE GUTTER WAS ALREADY RESERVED FOR.
//
// 19 Sep 2026, from a reel on Jakob's Law: "swiping from the left edge goes
// back" is one of the handful of gestures a person has already learned in
// every other app, and an app that does not honour it makes them learn it.
//
// Nova reserved the space for it a fortnight ago and never built it.
// swipeCore.js has EDGE_GUARD_PX = 24 and startsInEdgeGuard(), and every
// swipeable row in the app refuses to start a gesture there — the comment
// says "a gesture starting in the OS back-swipe gutter is never ours". True
// in a browser tab. But Nova's manifest is `display: 'standalone'`, and an
// installed PWA has no browser chrome, no back button and NO EDGE SWIPE. The
// gutter was being kept clear for a gesture the OS had stopped providing.
//
// Everything needed was already here: navigate() pushes a real history entry
// (pushState, so popstate re-derives the screen), so `back` is a one-line
// action with no new navigation model. This is only the finger that calls it.
//
// IT IS OFF IN A BROWSER. There the OS/browser still owns the edge, and two
// handlers on one gesture would go back twice.

import { useEffect, useRef } from 'react';
import { EDGE_GUARD_PX, decideDirection } from './swipeCore.js';
import { haptic } from './haptics.js';

// HOW FAR BEFORE IT COMMITS — his call, 22 Sep, after using it: "Should only
// swipe back if the whole page is swiped too (about over half way across the
// screen), not just a small swipe as this could be accidentally triggered."
// 88px on a 375px phone was under a quarter, and he was triggering it by
// accident. Half the VIEWPORT, measured at gesture time, so it is the same
// fraction of whatever screen he is holding.
export const COMMIT_FRACTION = 0.5;
export function commitDistance(width) {
  return Math.max(120, Math.round((width || 375) * COMMIT_FRACTION));
}
// A flick still counts, but it has to be a real one AND have covered a third
// of the way — the accidental trigger he reported was a fast short brush.
export const FLICK_PX_PER_MS = 0.9;
export const FLICK_MIN_FRACTION = 0.33;

// ONE PAGE PER GESTURE. "Should only swipe back to the previous page." A
// second commit inside this window is the same thumb, not a second intention.
export const COMMIT_COOLDOWN_MS = 600;

// A DRAG THAT NEVER ENDS. Found while verifying: a touchend that never
// arrives leaves the snapshot layer on screen forever, and the whole app is
// then frozen behind an inert picture of itself — which is precisely what
// "it's buggy" looks like from the outside. iOS drops touches for reasons a
// page never hears about (a call, the app switcher, a system gesture taking
// over), so this cannot be left to good manners.
export const STUCK_MS = 2200;
// WHAT THE LAST SWIPE ACTUALLY DID. Settings reads this.
//
// The first cut of this gesture shipped "verified" on synthetic touch events
// and did not work on his phone, and there was no way to find out why except
// to guess — the same hole that kept dictation broken for four days until the
// turn receipts were read by device. So the gesture now leaves a receipt:
// where it started, how far it got, and what it decided. One tap in Settings
// turns "swipe back is not working" into a number.
let last = null;
export function lastEdgeGesture() { return last; }

// THE DRAG IS THE TRANSITION. popstate normally runs through withTransition
// (the View Transition API) so a tap dissolves; during a swipe that would
// fight the layers this hook is already animating by hand. App reads this.
let dragging = false;
export function edgeDragInProgress() { return dragging; }
export function _resetEdgeGesture() { last = null; }

// A real installed app, not a tab. matchMedia is the standard signal;
// navigator.standalone is the older iOS one and is still what a Home Screen
// PWA reports on some versions.
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  // A DEV-ONLY SEAM, and it earned its place. This gesture only exists in an
  // installed PWA, which means it cannot be exercised in the browser where
  // everything else is verified — and two versions shipped broken because
  // "verified" meant synthetic events against a faked media query that kept
  // silently not applying. Same family as window.__novaShelf and
  // scripts/dev-connect.mjs: a seam that makes the real thing checkable,
  // compiled out of the build he runs.
  try {
    if (import.meta.env?.DEV && localStorage.getItem('novaos.forceStandalone') === '1') return true;
  } catch { /* storage blocked — fall through to the real test */ }
  try {
    if (window.navigator.standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches;
  } catch { return false; }
}

// IS THERE ANYWHERE TO GO BACK TO? Depth rides on the history entry itself
// (navigate stamps it), so it is exact, survives a reload, and needs no
// listener trying to guess which direction a popstate went. At depth 0 he is
// on the entry the app booted with: going back would leave Nova entirely,
// which is not what the gesture means.
export function depthOf(state) {
  const d = state && typeof state === 'object' ? state.novaDepth : null;
  return Number.isFinite(d) ? d : 0;
}

export function canGoBack(state) {
  return depthOf(state) > 0;
}

// WHAT THIS SWIPE IS ABOUT, decided once at touch-down from what is on screen.
//
// 25 Sep, his fifth recording: three swipes on an open recipe. Each dragged
// the Fuel/Train/Home page OUT FROM UNDER the recipe and went back a tab,
// while the recipe stayed put. The recipe is an overlay outside <main>, so
// the snapshot never held it and history.back() walked the tabs beneath it.
// The third swipe, at depth 0, was not this hook at all: iOS now runs its OWN
// back swipe in the installed app whenever nothing claims the touch, and it
// went back into history from before Nova booted.
//
//   'page'  a full-screen overlay marked data-edge-page (the recipe): drag
//           the overlay itself, and a commit goes back, which closes it.
//   'tab'   nothing open: the tab swipe as before.
//   'block' a modal with no history level of its own, or nothing behind
//           this entry: claim the touch so neither this hook nor iOS walks
//           the app backwards underneath, and do nothing.
export function edgeMode({ modalOpen = false, pageOpen = false, depth = 0 } = {}) {
  if (modalOpen) return 'block';
  if (!(depth > 0)) return 'block';
  return pageOpen ? 'page' : 'tab';
}

// The gesture, as arithmetic.
//
// 22 SEP — HIS REPORT: "Swipe back is not working." The first cut passed a
// clean synthetic drag and failed a thumb, in three ways that a straight line
// of touch events cannot produce:
//
//   1. `if (dx < 0) return 'cancel'` — ONE pixel of leftward jitter at the
//      start killed the gesture for good. A finger landing on glass always
//      wobbles; my test never did.
//   2. The vertical test re-ran on EVERY move, so a gesture that had plainly
//      been horizontal for 80px could still be cancelled by the upward ARC a
//      thumb makes as it travels right. Thumbs pivot; test data does not.
//   3. There was no direction LOCK at all. Every other gesture in this app
//      locks once via decideDirection() and never re-questions it — that rule
//      (INTENT_PX 12, HORIZONTAL_BIAS 1.5) is tuned and proven on his device,
//      and inventing a private one here was the mistake underneath the other
//      two.
//
// So: before the lock, the app's own rule decides. After it, only distance
// and speed matter, and nothing can take the gesture away.
export function edgeDecision({ startX, dx, dy, dt, width = 375, locked = false }) {
  if (startX >= EDGE_GUARD_PX) return 'none';          // not from the gutter

  if (!locked) {
    const dir = decideDirection(dx, dy);
    if (dir === 'v') return 'cancel';                   // he is scrolling
    if (dir !== 'h') return 'waiting';                  // not enough to tell yet
    if (dx < 0) return 'cancel';                        // locked horizontal, but leftward
    return 'lock';
  }

  // LOCKED. A finger that wanders back toward the edge is undoing the drag,
  // not cancelling it — only a release decides.
  const need = commitDistance(width);
  const flick = dt > 0 && dx / dt >= FLICK_PX_PER_MS;
  if (dx >= need || (flick && dx >= need * FLICK_MIN_FRACTION)) return 'commit';
  return 'tracking';
}

// HOW FAR THROUGH THE GESTURE HE IS, 0..1 — not a page offset any more.
//
// 22 SEP, from his screen recording: the first cut put a `transform` on
// <main>, and a transformed ancestor re-anchors every position:fixed
// descendant inside it. So mid-drag the recipe overlay stopped being pinned
// to the viewport and landed on top of the list underneath — three screens'
// text painted over each other, which is what he filmed. The page is NEVER
// transformed now; the affordance is a fixed element of this hook's own,
// outside the layout it would otherwise break.
export function dragProgress(dx, width) {
  if (dx <= 0) return 0;
  return Math.min(1, dx / commitDistance(width));
}

// THE INTERACTIVE BACK, as iOS actually does it.
//
// 22 SEP, his third report, with two screen recordings — one of Nova, one of
// Apple Settings: "I still want to be able to see the page being swiped back
// to 'underneath' the current page as I'm swiping just like it does in other
// apps." His Apple clip is unambiguous: the previous page is ALREADY THERE,
// shifted left and dimmed; the current page slides off to the right over it
// with a shadow down its leading edge; the two converge as the finger moves.
//
// So the drag has to show two pages at once, and Nova renders one screen at a
// time. The way through, without touching the app's own layout (which is what
// broke it the first time — a transform on <main> re-anchors every
// position:fixed descendant inside it):
//
//   1. SNAPSHOT the current screen into a fixed layer of our own.
//   2. Navigate back IMMEDIATELY and instantly. The real app underneath is now
//      the previous screen, live and correct, with its own fixed elements
//      behaving normally because nothing of Nova's has been transformed.
//   3. Drag the snapshot. What is revealed underneath is the real thing.
//   4. Commit — slide the snapshot off and drop it. Already home.
//      Cancel  — slide it back, history.forward(), drop it.
//
// The snapshot is inert: a canvas inside it clones blank, which for a
// sub-second transition is a trade worth making against the alternative of
// re-rendering two React trees on every frame of a drag.
export function useEdgeBack({ onBack, enabled = true }) {
  const s = useRef({ armed: false, id: null, startX: 0, startY: 0, startT: 0, dir: null, lastCommit: 0, live: null, mode: null, page: null, target: null }).current;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    if (!isStandalone()) return undefined;

    const W = () => window.innerWidth || 375;

    // ---- the two layers, built only once a drag actually locks ----
    const build = () => {
      const main = document.querySelector('main');
      if (!main) return null;

      // the page he is leaving, frozen
      const snap = main.cloneNode(true);
      // NO WALK HERE. The first cut called getComputedStyle on every element
      // in the page to re-anchor fixed children — a forced style resolution
      // across the whole DOM, at the exact moment his finger starts moving.
      // That was the stutter he kept describing as "clunky": the gesture
      // blocked for as long as the page was big before it drew a single frame.
      //
      // And it was never needed. The snapshot is ALWAYS transformed, and a
      // transformed ancestor is the containing block for its fixed
      // descendants — the very property that broke <main> is the one that
      // makes them travel with the clone for free.
      const box = main.getBoundingClientRect();
      Object.assign(snap.style, {
        position: 'fixed', left: `${box.left}px`, top: `${box.top}px`,
        width: `${box.width}px`, height: `${box.height}px`,
        margin: '0', zIndex: '201', overflow: 'hidden', pointerEvents: 'none',
        background: 'var(--nv-void)', willChange: 'transform',
        // present from the first paint: this is what captures fixed children
        transform: 'translate3d(0,0,0)',
        // the edge shadow Apple draws down the leading edge of the moving page
        boxShadow: '-14px 0 34px -6px rgba(0,0,0,.75)',
      });
      snap.setAttribute('aria-hidden', 'true');
      document.body.appendChild(snap);
      // cloneNode does not carry scroll position — without this he is thrown
      // to the top of the page he is leaving, which he filmed
      snap.scrollTop = main.scrollTop;

      // the page underneath is real; this only dims it the way iOS does
      const scrim = document.createElement('div');
      scrim.setAttribute('aria-hidden', 'true');
      scrim.style.cssText = 'position:fixed;inset:0;z-index:200;pointer-events:none;background:#000;opacity:.18;will-change:opacity';
      document.body.appendChild(scrim);
      return { snap, scrim };
    };

    // ---- 'page': the overlay IS the page being left, and the live app is
    // already rendered beneath it, so nothing is cloned and nothing navigates
    // until the release. Moving the overlay's own root is safe where moving
    // <main> was not: it is the topmost fixed layer and full-screen, so the
    // fixed children it re-anchors land exactly where they already were. ----
    const buildPage = (el) => {
      if (!el?.isConnected) return null;
      // inline z only: a computed-style read here would be a forced style
      // resolution on the frame his finger starts moving
      const z = Number(el.style.zIndex) || 82;
      const scrim = document.createElement('div');
      scrim.setAttribute('aria-hidden', 'true');
      scrim.style.cssText = `position:fixed;inset:0;z-index:${z - 1};pointer-events:none;background:#000;opacity:.18;will-change:opacity`;
      document.body.appendChild(scrim);
      el.style.willChange = 'transform';
      el.style.boxShadow = '-14px 0 34px -6px rgba(0,0,0,.75)';
      return { snap: el, scrim, page: true };
    };
    const clearPage = (el) => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.boxShadow = '';
      el.style.willChange = '';
    };

    // Only transform and opacity, and the transition property is written ONLY
    // when it changes — setting it on every move costs a style recalc per
    // frame for a value that is almost always the same one.
    const EASE = 'transform .3s cubic-bezier(.32,.72,0,1), opacity .3s cubic-bezier(.32,.72,0,1)';
    let eased = null;
    const paint = (dx, animate) => {
      const l = s.live;
      if (!l) return;
      const want = animate ? EASE : '';
      if (want !== eased) {
        eased = want;
        l.snap.style.transition = want;
        l.scrim.style.transition = want;
      }
      const p = Math.max(0, Math.min(1, dx / W()));
      l.snap.style.transform = `translate3d(${Math.max(0, dx)}px,0,0)`;
      l.scrim.style.opacity = String(0.18 * (1 - p));
    };

    const teardown = () => {
      const l = s.live;
      s.live = null;
      eased = null;
      dragging = false;
      if (!l) return;
      // a page is React's element, not ours: removing it would break the
      // unmount React is about to do. Only the snapshot is ours to drop.
      if (!l.page) l.snap.remove();
      l.scrim.remove();
    };

    // THE REST OF THE TOUCH IS HEARD ON THE ELEMENT IT STARTED ON. A tab swipe
    // goes back at lock, React replaces the screen, and the element under his
    // thumb leaves the document. Every later touchmove and touchend is still
    // dispatched to that element, but a detached element bubbles to nothing,
    // so window never heard them: the drag froze on its first frame until the
    // watchdog put it back. Found 25 Sep driving real touch input through CDP.
    const follow = (el) => {
      unfollow();
      if (!el?.addEventListener) return;
      s.target = el;
      el.addEventListener('touchmove', onMove, { passive: false });
      el.addEventListener('touchend', onEnd, { passive: true });
      el.addEventListener('touchcancel', onCancel, { passive: true });
    };
    const unfollow = () => {
      const el = s.target;
      s.target = null;
      if (!el) return;
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };

    const reset = () => { s.armed = false; s.id = null; s.dir = null; s.mode = null; s.page = null; unfollow(); };

    // the watchdog: any live drag that has gone quiet is put back
    let stuck = 0;
    const kick = () => {
      if (stuck) clearTimeout(stuck);
      stuck = window.setTimeout(() => { if (s.live) settle(0); }, STUCK_MS);
    };
    const unkick = () => { if (stuck) { clearTimeout(stuck); stuck = 0; } };

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t || e.touches.length > 1) return;
      if (t.clientX >= EDGE_GUARD_PX) return;
      if (s.live) return;                                   // a drag is already live
      if (Date.now() - s.lastCommit < COMMIT_COOLDOWN_MS) return;
      // Every edge touch is armed now, even ones that will do nothing: an
      // unclaimed edge touch is handed to iOS's own back swipe.
      const page = document.querySelector('[data-edge-page]');
      const modalOpen = !!document.querySelector('[aria-modal="true"]:not([data-edge-page])');
      s.mode = edgeMode({ modalOpen, pageOpen: !!page, depth: depthOf(window.history.state) });
      s.page = s.mode === 'page' ? page : null;
      s.armed = true; s.id = t.identifier; s.dir = null;
      s.startX = t.clientX; s.startY = t.clientY; s.startT = performance.now();
      follow(e.target);
    };

    const onMove = (e) => {
      if (!s.armed) return;
      const t = [...e.touches].find((x) => x.identifier === s.id);
      if (!t) return;
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;

      // CLAIM IT EARLY, or a horizontal carousel under the thumb starts
      // scrolling before the direction lock and keeps the touch.
      if (Math.abs(dx) > Math.abs(dy) && e.cancelable) e.preventDefault();

      const call = edgeDecision({
        startX: s.startX, dx, dy, dt: performance.now() - s.startT,
        width: W(), locked: s.dir === 'h',
      });
      last = { startX: Math.round(s.startX), dx: Math.round(dx), dy: Math.round(dy), call, mode: s.mode, at: Date.now() };
      if (call === 'cancel' || call === 'none') { if (s.live) settle(0); else reset(); return; }
      if (call === 'waiting') return;
      // claimed above by preventDefault; nothing moves and nothing navigates
      if (s.mode === 'block') { s.dir = 'h'; last.call = 'blocked'; return; }

      kick();
      if (!s.dir && s.mode === 'page') {
        s.dir = 'h';
        s.live = buildPage(s.page);
        if (!s.live) { reset(); return; }
        dragging = true;
        eased = null;
        paint(dx, false);
        return;
      }
      if (!s.dir) {
        // THE MOMENT THE GESTURE BECOMES REAL: snapshot, then go back for
        // real so what he uncovers is the actual previous screen.
        s.dir = 'h';
        s.live = build();
        if (!s.live) { reset(); return; }
        dragging = true;
        eased = null;
        paint(dx, false);
        // AFTER THE FIRST FRAME. Navigating renders a whole screen, and this
        // app re-renders everything on any setState — doing it inside the
        // same task as the first drag frame means the finger moves and
        // nothing follows until that render finishes. One rAF buys the
        // snapshot its first paint, which is the frame he actually feels.
        requestAnimationFrame(() => { if (s.live) onBack?.(); });
        return;
      }
      paint(dx, false);
    };

    // Land the gesture: `to` is 0 (cancel, page comes back) or W (commit).
    const settle = (to) => {
      const l = s.live;
      unkick();
      reset();
      if (!l) return;
      const cancelled = to === 0;
      paint(to, true);
      window.setTimeout(() => {
        if (l.page) { if (cancelled) { clearPage(l.snap); teardown(); } else popPage(l); return; }
        // forward FIRST, then drop the layer, or the previous screen flashes
        if (cancelled) { dragging = true; window.history.forward(); }
        window.setTimeout(teardown, cancelled ? 40 : 0);
      }, 300);
    };

    // The page has slid off; now close it for real. Back pops its history
    // entry and App's popstate closes it, skipping the view transition
    // because `dragging` is still true (App's listener was added first, so it
    // has run by the time ours does). The overlay stays parked off-screen
    // until React unmounts it: clearing its transform now would flash it back.
    const popPage = (l) => {
      if (!l.snap.isConnected) { teardown(); return; }   // closed some other way mid-drag
      let fallback = 0;
      const done = () => {
        window.removeEventListener('popstate', done);
        window.clearTimeout(fallback);
        teardown();
        // a back that did not close it must not leave an invisible page parked
        window.setTimeout(() => { if (l.snap.isConnected) clearPage(l.snap); }, 250);
      };
      window.addEventListener('popstate', done);
      fallback = window.setTimeout(done, 700);
      onBack?.();
    };

    const onEnd = (e) => {
      if (!s.armed && !s.live) return;
      const t = [...(e.changedTouches || [])].find((x) => x.identifier === s.id);
      const dx = t ? t.clientX - s.startX : 0;
      const dy = t ? t.clientY - s.startY : 0;
      const call = edgeDecision({
        startX: s.startX, dx, dy, dt: performance.now() - s.startT,
        width: W(), locked: s.dir === 'h',
      });
      last = { startX: Math.round(s.startX), dx: Math.round(dx), dy: Math.round(dy), call: s.mode === 'block' && call !== 'none' && call !== 'cancel' ? 'blocked' : call, mode: s.mode, at: Date.now(), end: true };
      if (!s.live) { reset(); return; }
      if (call === 'commit') {
        s.lastCommit = Date.now();
        haptic('tick');
        settle(W());
        return;
      }
      settle(0);
    };

    function onCancel() { if (s.live) settle(0); else reset(); }
    window.addEventListener('touchstart', onStart, { passive: true });
    // backgrounded mid-drag: iOS will not send a touchend, and he would come
    // back to a screen he cannot touch
    const onHide = () => { if (document.visibilityState === 'hidden' && s.live) settle(0); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('touchstart', onStart);
      unfollow();
      document.removeEventListener('visibilitychange', onHide);
      unkick();
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
