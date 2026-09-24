import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as C from './islandCore.js';
import { subscribeIsland, currentActivities, notify } from './island.js';
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

// A colour from the page (a muscle hue, a theme accent) worn on the black
// island: lifted toward white only where the theme darkened it for a white page.
const lift = (color) => `color-mix(in srgb, ${color}, #fff var(--nv-island-lift))`;

// What sits on the left of an activity — and, bigger, on the left of the card
// it expands into. A ring for progress (the muscle he is on owns the hue), Nova's
// core when she is talking, the tone mark otherwise.
function Lead({ lead, size = 22 }) {
  if (!lead) return null;
  if (lead.type === 'ring') {
    const r = size / 2 - 2.5;
    const circ = 2 * Math.PI * r;
    const f = C.clamp(lead.fraction || 0, 0, 1);
    const c = lift(lead.color || 'var(--nv-good)');
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} style={{ fill: 'none', stroke: `color-mix(in srgb, ${c} 26%, transparent)`, strokeWidth: 3 }} />
        <circle cx={size / 2} cy={size / 2} r={r} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ fill: 'none', stroke: c, strokeWidth: 3, strokeLinecap: 'round', strokeDasharray: `${(f * circ).toFixed(2)} ${circ.toFixed(2)}`, transition: 'stroke-dasharray var(--nv-dur-slow) var(--nv-ease)' }} />
      </svg>
    );
  }
  if (lead.type === 'nova') {
    const c = toneColor('nova');
    const dot = Math.round(size * 0.5);
    return (
      <span aria-hidden="true" style={{ flex: 'none', width: size, height: size, display: 'grid', placeItems: 'center' }}>
        <span className="nv-island-breathe" style={{ width: dot, height: dot, borderRadius: '50%', background: `radial-gradient(circle at 38% 34%, #fff 0 14%, ${c} 42%, color-mix(in srgb, ${c} 30%, transparent) 100%)`, boxShadow: `0 0 ${Math.round(size / 2.5)}px ${c}` }} />
      </span>
    );
  }
  const c = toneColor(lead.tone || 'info');
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${c} 20%, transparent)`, color: c, font: `700 ${Math.round(size * 0.5)}px var(--nv-font-ui)`, lineHeight: 1 }}>
      {lead.glyph || GLYPH[lead.tone] || GLYPH.info}
    </span>
  );
}

function Mark({ tone, lead }) {
  if (lead) return <Lead lead={lead} size={30} />;
  return <Lead lead={tone === 'nova' ? { type: 'nova' } : { type: 'mark', tone }} size={30} />;
}

function Trail({ trail, color }) {
  if (!trail) return null;
  if (typeof trail === 'object' && trail.type === 'wave') {
    return <span aria-hidden="true" className="nv-island-wave" style={{ color: color || toneColor('nova') }}><i /><i /><i /><i /></span>;
  }
  return (
    <span style={{ font: '600 13px var(--nv-font-ui)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em', color: color || 'var(--nv-island-ink)', whiteSpace: 'nowrap' }}>{String(trail)}</span>
  );
}

export function DynamicIsland() {
  const [shown, setShown] = useState(null); // { notice, env, key }
  const [acts, setActs] = useState(() => C.rankActivities(currentActivities()));
  const [shellEnv, setShellEnv] = useState(() => readEnv());

  const svgRef = useRef(null);
  const gooRef = useRef(null);
  const insetRef = useRef(null);
  const neckRef = useRef(null);
  const dropRef = useRef(null);
  const pillRef = useRef(null);
  const cardRef = useRef(null);
  const innerRef = useRef(null);
  const shellRef = useRef(null);
  const shellInnerRef = useRef(null);
  const trailRef = useRef(null);
  const minRef = useRef(null);

  // everything the loop and the hand share, kept out of React
  const m = useRef(null);
  if (!m.current) {
    m.current = {
      drop: C.createSpring(0), expand: C.createSpring(0), reveal: C.createSpring(0),
      drag: C.createSpring(0), press: C.createSpring(0), shell: C.createSpring(0),
      layout: null, current: null, queue: [], exiting: false,
      raf: 0, last: 0, clock: 0, reduced: false, blur: C.gooBlur(),
      life: { shownAt: 0, timer: 0, paused: false, pausedAt: 0 },
      hand: null, suppressClick: false,
      actMap: currentActivities(), lingers: {}, acts: [], shellLayout: null, shellEnv: null, trailW: C.SHELL_TRAIL_MIN,
    };
  }

  useEffect(() => {
    const s = m.current;
    // dev build only: the island's live state, for the recorder and for a
    // session debugging it (compiled out of the build he runs)
    if (import.meta.env?.DEV) window.__island = s;
    const springs = () => [s.drop, s.expand, s.reveal, s.drag, s.press, s.shell];

    const paintAlert = () => {
      const L = s.layout;
      const drop = dropRef.current;
      if (!L || !drop) return;
      const g = C.islandGeometry({ drop: s.drop.value, expand: s.expand.value, layout: L, dragY: s.drag.value });
      const moving = [s.drop, s.expand, s.reveal, s.drag, s.press].some((x) => x.active) || !!s.hand?.dragging;
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

    // The widened island. With hardware under it, "closed" is exactly the
    // pill and is hidden — so an activity grows OUT of the island and folds
    // back INTO it. Without hardware it grows from a dot.
    const paintShell = () => {
      const el = shellRef.current;
      const L = s.shellLayout;
      if (!el || !L) return;
      const p = s.shell.value;
      const g = C.shellGeometry({ layout: L, trailW: s.trailW, open: p, insetTop: s.shellEnv?.insetTop || 0 });
      const visible = p > 0.004;
      el.style.visibility = visible ? 'visible' : 'hidden';
      el.style.transform = `translate3d(${g.left.toFixed(2)}px,${g.top.toFixed(2)}px,0)`;
      el.style.width = `${g.width.toFixed(2)}px`;
      el.style.height = `${g.height}px`;
      el.style.borderRadius = `${g.radius}px`;
      el.style.opacity = L.island ? '1' : String(C.clamp(p * 1.6, 0, 1));
      el.style.pointerEvents = p > 0.6 ? 'auto' : 'none';
      if (shellInnerRef.current) shellInnerRef.current.style.opacity = String(C.clamp((p - 0.55) / 0.45, 0, 1));
      const mn = minRef.current;
      if (mn) {
        const q = C.clamp(p, 0, 1);
        mn.style.visibility = q > 0.02 ? 'visible' : 'hidden';
        mn.style.transform = `translate3d(${g.minimalLeft.toFixed(2)}px,${g.top.toFixed(2)}px,0) scale(${(0.55 + 0.45 * q).toFixed(3)})`;
        mn.style.width = mn.style.height = `${g.height}px`;
        mn.style.opacity = String(q);
        mn.style.pointerEvents = q > 0.6 ? 'auto' : 'none';
      }
    };

    const paint = () => { paintAlert(); paintShell(); };

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

    // Open the island around its activity, or fold it away. Alerts outrank
    // it: while one is showing — or leaving — the island stays closed.
    const syncShell = () => {
      const want = s.acts.length > 0 && !s.current && !s.exiting ? 1 : 0;
      if (s.shell.target === want && (s.shell.active || s.shell.value === want)) return;
      if (s.reduced || reducedMotion()) C.jump(s.shell, want);
      else C.aim(s.shell, want, want ? C.SHELL_SPRING : C.FADE_SPRING, s.clock);
      paintShell();
      kick();
    };
    s.syncShell = syncShell;

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
      if (!s.life.paused || document.hidden) return; // in his pocket is not seen
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
      s.started = false;
      s.reduced = reducedMotion();
      // (review #3) a finger that was on the LAST card never lifts on this one
      s.hand = null;
      // (review #2) a notice that arrives while the app is in his pocket keeps
      // its whole life for when he comes back; announceAway posts exactly then
      s.life.paused = document.hidden;
      s.life.pausedAt = performance.now();
      // (review #4) never measure the new card's life against the last one's
      s.life.shownAt = performance.now() + C.ENTER_REVEAL_DELAY;
      syncShell();
      // the layout needs the card's measured height, so the springs start in
      // the layout effect below, once React has put the words on the page
      setShown({ notice, env: readEnv(), key: notice.id + ':' + performance.now() });
    };
    s.start = () => {
      s.started = true;
      const now = s.clock;
      for (const sp of [s.drop, s.expand, s.reveal, s.drag, s.press]) C.jump(sp, 0);
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
      s.hand = null;
      const next = s.queue.shift();
      s.current = null;
      if (next) { enter(next); return; }
      // (review #10) this runs inside the frame where the drop landed, so the
      // last paint left the filter ON; take it off, and the shapes with it
      gooRef.current?.removeAttribute('filter');
      for (const r of [dropRef.current, neckRef.current]) if (r) { r.setAttribute('width', 0); r.setAttribute('height', 0); }
      s.layout = null;
      setShown(null);
      syncShell();
    };

    // `thrown` carries the finger's upward speed (px/ms) into the retraction
    const exit = (thrown) => {
      if (!s.current || s.exiting) return;
      s.exiting = true;
      clearLife();
      s.hand = null;
      // (review #4) dismissed before its springs ever started: nothing is on
      // screen to animate away, and start() would wipe the onDone that ends it
      if (!s.started) { settle(); return; }
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

    const publishActs = () => {
      s.acts = C.rankActivities(s.actMap);
      setActs(s.acts);
      syncShell();
    };

    let seq = 0;
    const unsub = subscribeIsland((msg) => {
      if (msg.type === 'activity') {
        const { kind, activity } = msg;
        clearTimeout(s.lingers[kind]);
        if (activity) {
          s.actMap = { ...s.actMap, [kind]: activity };
          publishActs();
        } else if (s.actMap[kind]) {
          // Nova's speech flips per sentence; a readout that blinks between
          // two sentences is worse than one that lingers a beat after the last
          s.lingers[kind] = setTimeout(() => {
            s.actMap = { ...s.actMap, [kind]: null };
            publishActs();
          }, C.ACTIVITY_LINGER);
        }
        return;
      }
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
    // (review #1) IslandFeed's effects can run before this one: read what is
    // already live AFTER subscribing, never the snapshot taken at render
    s.actMap = currentActivities();
    s.acts = C.rankActivities(s.actMap);
    setActs(s.acts);
    syncShell();

    // Sonner's rule: a clock that runs while the app is in his pocket has
    // spent his notification before he saw it.
    const onVis = () => (document.hidden ? pause() : (!s.hand && resume()));
    document.addEventListener('visibilitychange', onVis);
    // turning the phone moves (or removes) the island
    const onResize = () => setShellEnv(readEnv());
    window.addEventListener('resize', onResize);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      clearLife();
      for (const k of Object.keys(s.lingers)) clearTimeout(s.lingers[k]);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, []);

  // the activity readout: measure its words, place the island around them
  useLayoutEffect(() => {
    const s = m.current;
    s.shellEnv = shellEnv;
    s.shellLayout = C.islandLayout({ width: shellEnv.width, insetTop: shellEnv.insetTop, island: shellEnv.island });
    s.trailW = C.trailWidth(trailRef.current ? trailRef.current.scrollWidth : 0);
    s.paint?.();
    s.kick?.();
  }, [acts, shellEnv]);

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

  const s = m.current;
  const primary = acts[0] || null;
  const secondary = acts[1] || null;
  const expandAct = (act) => {
    if (!act) return;
    const n = typeof act.expanded === 'function' ? act.expanded() : act.expanded;
    if (n) notify(n);
  };

  const shell = (
    <>
      <div
        ref={shellRef}
        role={primary ? 'button' : undefined}
        tabIndex={primary ? 0 : -1}
        aria-label={primary ? (primary.label || primary.kind) : undefined}
        onClick={() => expandAct(primary)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expandAct(primary); } }}
        style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', background: 'var(--nv-island)', overflow: 'hidden', cursor: 'pointer', pointerEvents: 'none', willChange: 'transform, width' }}
      >
        {primary && (
          <div ref={shellInnerRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 9px', opacity: 0 }}>
            <Lead lead={primary.lead} />
            <span ref={trailRef} style={{ display: 'inline-flex', alignItems: 'center' }}><Trail trail={primary.trail} color={primary.trailColor} /></span>
          </div>
        )}
      </div>
      {secondary && (
        <div
          ref={minRef}
          role="button"
          tabIndex={0}
          aria-label={secondary.label || secondary.kind}
          onClick={() => expandAct(secondary)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expandAct(secondary); } }}
          style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', borderRadius: '50%', background: 'var(--nv-island)', display: 'grid', placeItems: 'center', cursor: 'pointer', pointerEvents: 'none', transformOrigin: 'left center' }}
        >
          <Lead lead={secondary.lead} size={20} />
        </div>
      )}
    </>
  );

  // ONE tree whether or not an alert is showing: the island readout must not
  // remount (and blink) at the moment an alert starts or ends
  const n = shown ? shown.notice : null;
  const env = shown ? shown.env : shellEnv;
  const cardW = Math.min(env.width - C.CARD_MARGIN * 2, C.CARD_MAX_WIDTH);
  const actions = n?.actions || [];
  const interactive = !!(n && (n.onPress || actions.length));

  // ── the hand ──
  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (s.hand || s.exiting) return;             // one finger at a time
    if (startsInEdgeGuard(e.clientX)) return;     // the back-swipe gutter is never ours
    if (e.target.closest?.('[data-island-action]')) return; // a button is a button, not a grip
    s.suppressClick = false;
    s.hand = { id: e.pointerId, y0: e.clientY, x0: e.clientX, dragging: false, samples: [{ t: performance.now(), y: e.clientY }] };
    // (review #3) capture from the first touch: a release outside the card
    // must still end the hand, or it wedges every later gesture and clock
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ }
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
    n?.onPress?.();
    s.exit();
  };
  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return; // a focused button handles its own keys
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n?.onPress?.(); s.exit(); }
    if (e.key === 'Escape') s.exit();
  };

  const tone = toneColor(n?.tone);
  const chip = (a, i) => (
    <button key={a.label + i} type="button" data-island-action
      onClick={(e) => { e.stopPropagation(); a.run?.(); s.exit(); }}
      style={{ flex: 'none', minHeight: 32, padding: '6px 13px', border: 0, borderRadius: 999, cursor: 'pointer', font: '600 12.5px var(--nv-font-ui)', color: i === 0 ? tone : 'var(--nv-island-ink)', background: i === 0 ? `color-mix(in srgb, ${tone} 16%, transparent)` : 'color-mix(in srgb, #fff 10%, transparent)' }}>
      {a.label}
    </button>
  );
  const sideChip = actions.length === 1;
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
          {shown && env.island && <rect ref={insetRef} />}
          <rect ref={neckRef} />
          <rect ref={dropRef} />
        </g>
        {shown && env.island && <rect ref={pillRef} style={{ fill: 'var(--nv-island)' }} />}
      </svg>
      {shell}

      {n && <div
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
        <div ref={innerRef} style={{ padding: '12px 14px 12px 12px', minHeight: C.CARD_MIN_HEIGHT, maxHeight: C.CARD_MAX_HEIGHT, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Mark tone={n.tone} lead={n.lead} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {n.message ? (
                <>
                  <div style={{ font: '600 12.5px var(--nv-font-ui)', letterSpacing: '.01em', color: tone }}>{n.title}</div>
                  <div style={{ ...CLAMP(actions.length > 1 ? 3 : 4), marginTop: 2, color: 'var(--nv-island-ink)', font: n.serif ? 'italic 400 14.5px/1.4 var(--nv-font-serif)' : '500 14px/1.35 var(--nv-font-ui)' }}>{n.message}</div>
                </>
              ) : (
                <div style={{ ...CLAMP(3), color: 'var(--nv-island-ink)', font: '500 14.5px/1.35 var(--nv-font-ui)', letterSpacing: '-.005em' }}>{n.title}</div>
              )}
            </div>
            {sideChip && chip(actions[0], 0)}
          </div>
          {!sideChip && actions.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>{actions.map(chip)}</div>
          )}
        </div>
      </div>}
      <div role="status" aria-live="polite" style={SR_ONLY}>{n ? (n.message ? `${n.title}: ${n.message}` : n.title) : ''}</div>
    </div>
  );
}

const CLAMP = (lines) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' });
const SR_ONLY = { position: 'fixed', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', pointerEvents: 'none' };
