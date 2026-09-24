import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as C from './islandCore.js';
import { subscribeIsland } from './island.js';
import { startsInEdgeGuard } from './swipeCore.js';

// THE DYNAMIC ISLAND — where Nova's notifications come from now (24 Sep 2026,
// his ask, from the reel of rit3zh/expo-dynamic-notifications). The pure
// half — geometry, springs, tone, the queue — is islandCore.js; this file is
// the drawing and the hand.
//
// HOW IT IS DRAWN. Three black shapes in one SVG group: the island (inset a
// little), a neck, and the drop that becomes the card. The group is blurred and
// then its alpha is thresholded back to a hard edge (feGaussianBlur +
// feColorMatrix — Skia's Blur + ColorMatrix in the original), so where the
// shapes come close they melt into one surface. That is the whole "goo".
// Over the top, a solid pill at the island's own coordinates covers the real
// hardware, so the join is seamless on his phone.
//
// WHAT IT COSTS. Nothing in React moves per frame: springs step in a rAF loop
// and write attributes straight to the SVG and a transform to the card, and
// the loop stops when everything settles. The filter is switched OFF at rest
// (the unfiltered card is drawn inflated by the distance the threshold pushes
// an edge out, so the swap is invisible) — a filter that only runs while the
// shape is actually changing.
//
// THE CARD IS BLACK IN EVERY THEME. It is the island, grown; Apple's own
// island alerts are black on a white home screen too. So its ink and hues are
// island tokens (--nv-island-*), not the theme's page ink.
//
// WHEN THERE IS NO ISLAND — a desktop, a browser tab (only an installed app
// draws under the status bar), landscape, a notch iPhone — nothing pretends to
// be hardware: the drop comes out of the top edge of the page instead.

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function readEnv() {
  let insetTop = 0;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    insetTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
  } catch { /* no DOM to measure against — no island */ }
  const ua = navigator.userAgent || '';
  let standalone = false;
  try {
    standalone = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  } catch { /* old engine */ }
  let ios = /iPhone/.test(ua);
  // The same dev-only seam edgeBack uses, compiled out of the build he runs:
  // lets a desktop browser emulating a 16 Pro show the island path.
  try {
    if (import.meta.env?.DEV && localStorage.getItem('novaos.forceIsland') === '1') {
      ios = true; standalone = true; insetTop = Math.max(insetTop, 62);
    }
  } catch { /* storage blocked */ }
  const portrait = window.innerHeight >= window.innerWidth;
  return { width: window.innerWidth, insetTop, island: C.detectIsland({ ios, standalone, insetTop, portrait }) };
}

const TONE_VAR = { info: '--nv-gold', done: '--nv-good', warn: '--nv-warn', nova: '--nv-cy' };
const toneColor = (tone) => `color-mix(in srgb, var(${TONE_VAR[tone] || TONE_VAR.info}), #fff var(--nv-island-lift))`;
const GLYPH = { info: '✦', done: '✓', warn: '!' };

// Φ⁻¹(1 − threshold): how far outside a straight edge the thresholded blur
// lands, in blur sigmas. For 0.43 that is 0.176σ — ~2.5px at Nova's blur.
const EDGE_SIGMAS = 0.176;

function Mark({ tone }) {
  const c = toneColor(tone);
  if (tone === 'nova') {
    // Nova speaking wears her core: the blue that stays blue in every theme.
    return (
      <span aria-hidden="true" style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: `radial-gradient(circle at 38% 34%, #fff 0 14%, ${c} 42%, color-mix(in srgb, ${c} 30%, transparent) 100%)`, boxShadow: `0 0 10px ${c}` }} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c, font: '700 14px var(--nv-font-ui)', lineHeight: 1 }}>
      {GLYPH[tone] || GLYPH.info}
    </span>
  );
}

export function DynamicIsland() {
  const [shown, setShown] = useState(null); // { notice, env, key }

  const svgRef = useRef(null);
  const gooRef = useRef(null);
  const insetRef = useRef(null);
  const neckRef = useRef(null);
  const dropRef = useRef(null);
  const pillRef = useRef(null);
  const cardRef = useRef(null);
  const innerRef = useRef(null);

  // everything the loop and the hand share, kept out of React
  const m = useRef(null);
  if (!m.current) {
    m.current = {
      drop: C.createSpring(0), expand: C.createSpring(0), reveal: C.createSpring(0),
      drag: C.createSpring(0), press: C.createSpring(0),
      layout: null, current: null, queue: [], exiting: false,
      raf: 0, last: 0, clock: 0, reduced: false, blur: C.gooBlur(),
      life: { shownAt: 0, timer: 0, paused: false, pausedAt: 0 },
      hand: null, suppressClick: false,
    };
  }

  useEffect(() => {
    const s = m.current;
    const springs = () => [s.drop, s.expand, s.reveal, s.drag, s.press];

    const paint = () => {
      const L = s.layout;
      const drop = dropRef.current;
      if (!L || !drop) return;
      const g = C.islandGeometry({ drop: s.drop.value, expand: s.expand.value, layout: L, dragY: s.drag.value });
      const moving = springs().some((x) => x.active) || !!s.hand?.dragging;
      const filtered = !s.reduced && moving;

      // the drop / card
      const inflate = filtered ? 0 : (s.reduced ? 0 : s.blur * EDGE_SIGMAS);
      drop.setAttribute('x', g.x - inflate);
      drop.setAttribute('y', g.y - inflate);
      drop.setAttribute('width', g.width + inflate * 2);
      drop.setAttribute('height', g.height + inflate * 2);
      drop.setAttribute('rx', g.radius + inflate);
      // the neck — only meaningful through the filter
      const neck = neckRef.current;
      neck.setAttribute('x', g.neckX);
      neck.setAttribute('y', g.neckY);
      neck.setAttribute('width', filtered ? g.neckWidth : 0);
      neck.setAttribute('height', g.neckHeight);
      neck.setAttribute('rx', g.neckWidth / 2);
      if (filtered) gooRef.current.setAttribute('filter', 'url(#nv-island-goo)');
      else gooRef.current.removeAttribute('filter');
      // reduced motion: the card does not grow out of anything; it fades
      gooRef.current.style.opacity = s.reduced ? String(C.clamp(s.reveal.value, 0, 1)) : '1';

      // the words
      const card = cardRef.current;
      const cs = C.contentStyle(g, s.reveal.value);
      const press = 1 - 0.03 * C.clamp(s.press.value, 0, 1);
      card.style.transform = `translate3d(0,${cs.y.toFixed(2)}px,0) scale(${(cs.scale * press).toFixed(4)})`;
      card.style.opacity = String(cs.opacity);
      card.style.pointerEvents = !s.exiting && s.reveal.value > 0.5 ? 'auto' : 'none';
      innerRef.current.style.filter = cs.blur > 0.05 ? `blur(${cs.blur}px)` : '';
    };

    // The springs run on their own clock, advanced by the frame. In the dev
    // build `window.__islandSlow = 8` slows that clock so scripts/rec.mjs can
    // film the drop frame by frame (CDP's playback rate only slows CSS);
    // the build he runs compiles the knob out.
    const tick = (t) => {
      const slow = (import.meta.env?.DEV && window.__islandSlow) || 1;
      const dt = (s.last ? t - s.last : 16) / slow;
      s.last = t;
      s.clock += dt;
      let busy = false;
      for (const sp of springs()) busy = C.stepSpring(sp, dt, s.clock) || busy;
      paint();
      if (busy || s.hand?.dragging) s.raf = requestAnimationFrame(tick);
      else { s.raf = 0; s.last = 0; paint(); }
    };
    const kick = () => { if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(tick); } };
    s.kick = kick;
    s.paint = paint;

    // ── the clock ──
    const clearLife = () => { clearTimeout(s.life.timer); s.life.timer = 0; };
    const scheduleLife = () => {
      clearLife();
      if (!s.current || s.exiting || s.life.paused) return;
      const rem = C.remainingLife({ notice: s.current, shownAt: s.life.shownAt, now: performance.now(), queued: s.queue.length > 0 });
      if (rem === null) return;
      s.life.timer = setTimeout(() => exit(), rem);
    };
    const pause = () => {
      if (s.life.paused) return;
      s.life.paused = true; s.life.pausedAt = performance.now(); clearLife();
    };
    const resume = () => {
      if (!s.life.paused) return;
      s.life.paused = false;
      s.life.shownAt += performance.now() - s.life.pausedAt;
      scheduleLife();
    };
    s.pause = pause;
    s.resume = resume;

    // ── enter / exit / settle (use-notification-timeline.ts) ──
    const enter = (notice) => {
      s.current = notice;
      s.exiting = false;
      s.reduced = reducedMotion();
      s.life.paused = false;
      // the layout needs the card's measured height, so the springs start in
      // the layout effect below, once React has put the words on the page
      setShown({ notice, env: readEnv(), key: notice.id + ':' + performance.now() });
    };
    s.start = () => {
      const now = s.clock;
      for (const sp of springs()) C.jump(sp, 0);
      s.life.shownAt = performance.now() + (s.reduced ? 0 : C.ENTER_REVEAL_DELAY);
      if (s.reduced) {
        C.jump(s.drop, 1); C.jump(s.expand, 1);
        C.aim(s.reveal, 1, C.REDUCED_FADE, now);
      } else {
        C.aim(s.drop, 1, C.DROP_SPRING, now);
        C.aim(s.expand, 1, C.EXPAND_SPRING, now, { delay: C.ENTER_EXPAND_DELAY });
        C.aim(s.reveal, 1, C.REVEAL_SPRING, now, { delay: C.ENTER_REVEAL_DELAY });
      }
      paint();
      kick();
      scheduleLife();
    };

    const settle = () => {
      s.exiting = false;
      const next = s.queue.shift();
      s.current = null;
      if (next) enter(next);
      else { s.layout = null; setShown(null); }
    };

    // `thrown` carries the finger's upward speed (px/ms) into the retraction
    const exit = (thrown) => {
      if (!s.current || s.exiting) return;
      s.exiting = true;
      clearLife();
      const now = s.clock;
      if (s.reduced) {
        C.aim(s.reveal, 0, C.REDUCED_FADE, now, { onDone: settle });
        kick();
        return;
      }
      C.aim(s.reveal, 0, C.FADE_SPRING, now);
      if (thrown != null && s.layout) {
        // Fold the drag into the drop so the card keeps travelling UP into
        // the island at the speed it was thrown — instead of dropping back to
        // its resting place first, which is what an animation that ignores
        // the hand would do.
        const span = s.layout.cardCenterY - (s.layout.islandBottom - s.layout.islandHeight * 0.34);
        const dropNow = C.clamp(s.drop.value + s.drag.value / span, 0, 1);
        C.jump(s.drag, 0);
        C.jump(s.drop, dropNow);
        C.aim(s.expand, 0, C.COLLAPSE_SPRING, now);
        C.aim(s.drop, 0, C.RETURN_SPRING, now, { velocity: Math.min(0, (thrown * 1000) / span), onDone: settle });
      } else {
        C.aim(s.drag, 0, C.DRAG_SPRING, now);
        C.aim(s.expand, 0, C.COLLAPSE_SPRING, now, { delay: C.EXIT_COLLAPSE_DELAY });
        C.aim(s.drop, 0, C.RETURN_SPRING, now, { delay: C.EXIT_DROP_DELAY, onDone: settle });
      }
      kick();
    };
    s.exit = exit;

    let seq = 0;
    const unsub = subscribeIsland((msg) => {
      if (msg.type === 'dismiss') {
        if (msg.id) s.queue = s.queue.filter((x) => x.id !== msg.id);
        if (s.current && (!msg.id || s.current.id === msg.id)) exit();
        return;
      }
      seq += 1;
      const next = C.normalizeNotice(msg.notice, msg.seq ?? seq);
      const call = C.arrival({ current: s.exiting ? { title: null } : s.current, queue: s.queue, next });
      if (call.kind === 'refresh') {
        s.life.shownAt = Math.max(s.life.shownAt, performance.now());
        scheduleLife();
        return;
      }
      if (call.kind === 'show' && !s.exiting) { enter(next); return; }
      s.queue = call.kind === 'show' ? [...s.queue, next] : call.queue;
      scheduleLife(); // something is waiting now — cut the current one short
    });

    // Sonner's rule: a clock that runs while the app is in his pocket has
    // spent his notification before he saw it.
    const onVis = () => (document.hidden ? pause() : (!s.hand && resume()));
    document.addEventListener('visibilitychange', onVis);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      clearLife();
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, []);

  // measure the words, lay the island out, start the drop
  useLayoutEffect(() => {
    const s = m.current;
    if (!shown || !cardRef.current) return;
    const { env } = shown;
    const h = cardRef.current.offsetHeight;
    const L = C.islandLayout({ width: env.width, insetTop: env.insetTop, island: env.island, cardHeight: h });
    s.layout = L;
    const svg = svgRef.current;
    svg.setAttribute('width', L.width);
    svg.setAttribute('height', L.height);
    svg.setAttribute('viewBox', `0 0 ${L.width} ${L.height}`);
    svg.parentElement.style.height = `${L.height}px`;
    const f = svg.querySelector('filter');
    f.setAttribute('y', String(L.islandTop - 60));
    f.setAttribute('width', String(L.width));
    f.setAttribute('height', String(L.height - L.islandTop + 60));
    f.firstChild.setAttribute('stdDeviation', String(s.blur));
    const inset = s.blur * C.GOO_INSET_RATIO;
    const ir = insetRef.current;
    if (ir) {
      ir.setAttribute('x', L.centerX - L.islandWidth / 2 + inset);
      ir.setAttribute('y', L.islandTop + inset);
      ir.setAttribute('width', L.islandWidth - inset * 2);
      ir.setAttribute('height', L.islandHeight - inset * 2);
      ir.setAttribute('rx', Math.max(L.islandRadius - inset, 0));
    }
    const pill = pillRef.current;
    if (pill) {
      pill.setAttribute('x', L.centerX - L.islandWidth / 2);
      pill.setAttribute('y', L.islandTop);
      pill.setAttribute('width', L.islandWidth);
      pill.setAttribute('height', L.islandHeight);
      pill.setAttribute('rx', L.islandRadius);
    }
    const card = cardRef.current;
    card.style.top = `${L.cardTop}px`;
    card.style.left = `${L.cardLeft}px`;
    card.style.height = `${L.cardHeight}px`;
    s.start();
  }, [shown]);

  if (!shown) return <div role="status" aria-live="polite" style={SR_ONLY} />;
  const { notice: n, env } = shown;
  const cardW = Math.min(env.width - C.CARD_MARGIN * 2, C.CARD_MAX_WIDTH);
  const interactive = !!(n.onPress || n.action);
  const s = m.current;

  // ── the hand ──
  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (s.hand || s.exiting) return;             // one finger at a time
    if (startsInEdgeGuard(e.clientX)) return;     // the back-swipe gutter is never ours
    s.suppressClick = false;
    s.hand = { id: e.pointerId, y0: e.clientY, x0: e.clientX, dragging: false, samples: [{ t: performance.now(), y: e.clientY }] };
    s.pause();
    C.aim(s.press, 1, C.FADE_SPRING, s.clock);
    s.kick();
  };
  const onPointerMove = (e) => {
    const h = s.hand;
    if (!h || e.pointerId !== h.id) return;
    const dy = e.clientY - h.y0;
    const dx = e.clientX - h.x0;
    if (!h.dragging) {
      if (Math.hypot(dx, dy) < C.DRAG_SLOP) return;
      h.dragging = true;
      try { e.currentTarget.setPointerCapture(h.id); } catch { /* gone */ }
    }
    const t = performance.now();
    h.samples.push({ t, y: e.clientY });
    while (h.samples.length > 2 && t - h.samples[0].t > 90) h.samples.shift();
    s.drag.active = false;
    s.drag.value = C.dragOffset(dy);
    s.drag.velocity = 0;
    s.kick();
  };
  const onPointerEnd = (e) => {
    const h = s.hand;
    if (!h || e.pointerId !== h.id) return;
    s.hand = null;
    const now = s.clock;
    C.aim(s.press, 0, C.FADE_SPRING, now);
    if (!h.dragging) { s.resume(); s.kick(); return; } // a tap: onClick has it
    s.suppressClick = true;
    const a = h.samples[0];
    const b = h.samples[h.samples.length - 1];
    const vy = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const dy = e.clientY - h.y0;
    if (e.type !== 'pointercancel' && C.releaseDecision({ dy, vy }) === 'dismiss') {
      s.exit(Math.min(vy, -0.2));
    } else {
      C.aim(s.drag, 0, C.DRAG_SPRING, now, { velocity: vy * 1000 });
      s.resume();
    }
    s.kick();
  };
  const onClick = (e) => {
    if (s.suppressClick) { s.suppressClick = false; return; }
    if (e.target.closest?.('[data-island-action]')) return;
    n.onPress?.();
    s.exit();
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n.onPress?.(); s.exit(); }
    if (e.key === 'Escape') s.exit();
  };

  const tone = toneColor(n.tone);
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 0, zIndex: 95, pointerEvents: 'none' }}>
      <svg ref={svgRef} aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <defs>
          <filter id="nv-island-goo" filterUnits="userSpaceOnUse" x="0" y="-60" width="0" height="0" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0" />
            <feColorMatrix type="matrix" values={C.gooMatrix()} />
          </filter>
        </defs>
        <g ref={gooRef} style={{ fill: 'var(--nv-island)' }}>
          {env.island && <rect ref={insetRef} />}
          <rect ref={neckRef} />
          <rect ref={dropRef} />
        </g>
        {env.island && <rect ref={pillRef} style={{ fill: 'var(--nv-island)' }} />}
      </svg>

      <div
        key={shown.key}
        ref={cardRef}
        data-island-card
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `${n.title}${n.message ? ': ' + n.message : ''}` : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={onClick}
        onKeyDown={onKeyDown}
        style={{
          position: 'absolute', width: cardW, opacity: 0, pointerEvents: 'none',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
          cursor: 'grab', willChange: 'transform, opacity', overflow: 'hidden', boxSizing: 'border-box',
        }}
      >
        <div ref={innerRef} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 12px 12px', minHeight: C.CARD_MIN_HEIGHT, maxHeight: C.CARD_MAX_HEIGHT, boxSizing: 'border-box' }}>
          <Mark tone={n.tone} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {n.message ? (
              <>
                <div style={{ font: '600 12.5px var(--nv-font-ui)', letterSpacing: '.01em', color: tone }}>{n.title}</div>
                <div style={{ ...CLAMP(4), marginTop: 2, color: 'var(--nv-island-ink)', font: n.serif ? 'italic 400 14.5px/1.4 var(--nv-font-serif)' : '500 14px/1.35 var(--nv-font-ui)' }}>{n.message}</div>
              </>
            ) : (
              <div style={{ ...CLAMP(3), color: 'var(--nv-island-ink)', font: '500 14.5px/1.35 var(--nv-font-ui)', letterSpacing: '-.005em' }}>{n.title}</div>
            )}
          </div>
          {n.action && (
            <button type="button" data-island-action
              onClick={(e) => { e.stopPropagation(); n.action.run?.(); s.exit(); }}
              style={{ flex: 'none', alignSelf: 'center', minHeight: 32, padding: '6px 13px', border: 0, borderRadius: 999, cursor: 'pointer', font: '600 12.5px var(--nv-font-ui)', color: tone, background: `color-mix(in srgb, ${tone} 16%, transparent)` }}>
              {n.action.label}
            </button>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" style={SR_ONLY}>{n.message ? `${n.title}: ${n.message}` : n.title}</div>
    </div>
  );
}

const CLAMP = (lines) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' });
const SR_ONLY = { position: 'fixed', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', pointerEvents: 'none' };
