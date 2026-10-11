// THE SKILL SETS' STAGE, as the page sees it. The renderer (./stageCore.js)
// runs in a Web Worker wherever the browser can do WebGL on an
// OffscreenCanvas there, and on the main thread where it can't.
//
// Each agent is shown on a canvas that is a CHILD OF HIS OWN SLAB, so the
// slab's transform carries him on the same frame it moves (his 11 Oct
// recording: the old full-screen canvas lagged the swipe and left the Coach
// over the Commander's slab). The worker renders a frame and hands back an
// ImageBitmap; the page only swaps it onto that slab's canvas.
//
// It also watches the worker: a context loss, an error, or no frame for
// 2.5 s while he should be moving restarts it (three strikes and it moves
// to the main thread), and every one of those is counted for the frame
// report (./perf.js).
import { frameGeo } from './plays.js';

const readTokens = (el) => {
  const cs = getComputedStyle(el);
  const s = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
  const f = (n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isNaN(v) ? d : v; };
  return {
    key: s('--nv-key', '#fff2e2'), fill: s('--nv-fill', '#bcd4ff'), rim: s('--nv-rim', '#9fdcff'), shell: s('--nv-shell', '#c9d3e4'),
    em: f('--nv-emissive', 1), env: f('--nv-env', 0.72), stage: s('--nv-stage', '#0d1426'),
    gold: s('--nv-gold', '#e0b26a'), ink: s('--nv-ink', '#e8ecf6'), void: s('--nv-void', '#06070d'), edge: s('--nv-cy', '#59e6ff'),
    hue: {
      cy: s('--nv-cy', '#59e6ff'), vi: s('--nv-vi', '#8f7bff'), mg: s('--nv-mg', '#ff7ad9'), good: s('--nv-good', '#5fe8a8'),
      gold: s('--nv-gold', '#e0b26a'), or: s('--nv-or', '#ffa257'),
      chest: s('--nv-m-chest', '#ff8a7a'), back: s('--nv-m-back', '#4fd1c5'), shoulders: s('--nv-m-shoulders', '#ffc46b'),
      quads: s('--nv-m-quads', '#7ab8ff'), calves: s('--nv-m-calves', '#8fd3ff'), abs: s('--nv-m-abs', '#ffd66b'),
      triceps: s('--nv-m-triceps', '#b48cff'), biceps: s('--nv-m-biceps', '#5fe8a8'), glutes: s('--nv-m-glutes', '#c98bff'),
    },
  };
};

// can a worker draw WebGL on an OffscreenCanvas here, and hand back bitmaps?
function workerGL() {
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof ImageBitmapRenderingContext === 'undefined') return false;
    const c = new OffscreenCanvas(1, 1);
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl || typeof c.transferToImageBitmap !== 'function') return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

export const STAGE_DPR = () => Math.min(globalThis.devicePixelRatio || 1, 2);

export function createSkillStage(container, { tokensFrom, reduceMotion = false, onFail, SW, SH, CH } = {}) {
  const tokens = readTokens(tokensFrom || container);
  const dpr = STAGE_DPR();
  const salt = (Math.random() * 1e9) | 0;
  let G = frameGeo(SW || 236, SH || 350, CH || 100);
  const last = { slots: [], info: {}, agents: [], active: true, pins: {} };
  let boxes = [], worker = null, core = null, glCanvas = null, disposed = false, mode = 'none', kind = null;
  let portraitsWanted = null, resolvePortraits = null, statsWaiters = [];
  const urls = [];
  // telemetry
  const health = { restarts: 0, errors: [], lastFrameAt: 0, startedAt: 0, centreInts: [], lastCentreAt: 0 };
  const note = (e) => { health.errors.push(String(e).slice(0, 160)); if (health.errors.length > 5) health.errors.shift(); };

  // ---- the canvases: one per slab, and the pin canvas for the ride ----
  const targets = new Map(); // key -> { el, ctx, parent }
  const sizeEl = (el) => {
    el.width = Math.round(G.TW * dpr); el.height = Math.round(G.TH * dpr);
    el.style.width = `${G.TW}px`; el.style.height = `${G.TH}px`;
  };
  function makeTarget(key, parent) {
    const el = document.createElement('canvas');
    el.className = 'nv-skl-chr'; el.setAttribute('aria-hidden', 'true');
    sizeEl(el);
    if (key === 'pin') { el.style.left = '0px'; el.style.top = '0px'; el.style.zIndex = '9'; }
    else { el.style.left = `${-G.side}px`; el.style.top = `${-G.above}px`; }
    el.style.visibility = 'hidden';
    parent.appendChild(el);
    const t = { el, parent, ctx: null, shown: false };
    targets.set(key, t);
    return t;
  }
  function ctxOf(t) {
    if (t.ctx) return t.ctx;
    t.ctx = kind === 'bitmap' ? t.el.getContext('bitmaprenderer') : t.el.getContext('2d');
    return t.ctx;
  }
  // a new mode needs fresh canvases (a canvas keeps its first context kind)
  function remakeTargets() {
    for (const [key, t] of [...targets]) { t.el.remove(); targets.delete(key); makeTarget(key, t.parent); }
    applyVisibility();
  }
  function clearTarget(t) {
    try {
      if (!t.ctx) return;
      if (kind === 'bitmap') t.ctx.transferFromImageBitmap(null); else t.ctx.clearRect(0, 0, t.el.width, t.el.height);
    } catch { /* an older bitmaprenderer: hidden anyway */ }
  }
  function applyVisibility() {
    const show = new Set(last.slots.filter((s) => s.visible && !last.pins[s.id]).map((s) => 'slab:' + s.id));
    if (Object.keys(last.pins).length) show.add('pin');
    for (const [key, t] of targets) {
      const on = show.has(key);
      if (on === t.shown) continue;
      t.shown = on;
      // a being coming back is drawn fresh before he shows (no stale pose)
      if (on) { clearTarget(t); t.el.style.visibility = 'visible'; } else t.el.style.visibility = 'hidden';
    }
  }

  function gotFrame(key, bmp) {
    const t = targets.get(key);
    const now = performance.now();
    health.lastFrameAt = now;
    const centre = last.slots.find((s) => s.centre);
    if ((centre && key === 'slab:' + centre.id) || key === 'pin') {
      if (health.lastCentreAt) { health.centreInts.push(now - health.lastCentreAt); if (health.centreInts.length > 900) health.centreInts.shift(); }
      health.lastCentreAt = now;
    }
    if (!t) { bmp?.close?.(); return; }
    try { ctxOf(t).transferFromImageBitmap(bmp); } catch (e) { note(e.message); bmp?.close?.(); }
  }

  function replay() {
    send({ t: 'geo', g: G });
    send({ t: 'agents', list: last.agents });
    send({ t: 'slots', slots: last.slots, info: last.info });
    for (const [id, p] of Object.entries(last.pins)) send({ t: 'pin', id, p });
    if (!last.active) send({ t: 'active', on: false });
    if (portraitsWanted) send({ t: 'portraits', ids: portraitsWanted });
  }

  function startMain() {
    worker?.terminate(); worker = null;
    core?.dispose(); core = null;
    mode = 'starting-main'; kind = '2d'; remakeTargets();
    return import('./stageCore.js').then(({ createStageCore }) => {
      if (disposed) return;
      glCanvas = document.createElement('canvas');
      try {
        core = createStageCore({
          canvas: glCanvas, tokens, reduceMotion, pixelRatio: Math.min(dpr, 1.5), maxFps: 30, salt,
          raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id),
          snap: async () => glCanvas.toDataURL('image/png'),
          present: (key) => {
            const t = targets.get(key); if (!t) return;
            const c = ctxOf(t); c.clearRect(0, 0, t.el.width, t.el.height); c.drawImage(glCanvas, 0, 0, t.el.width, t.el.height);
            health.lastFrameAt = performance.now();
          },
          onBoxes: (b) => { boxes = b; },
          onLost: (why) => { note(why); health.restarts++; if (health.restarts < 6) setTimeout(() => { if (!disposed) startMain(); }, 300); },
        });
      } catch (e) {
        note(e.message); mode = 'none';
        if (onFail) onFail();
        return;
      }
      mode = 'main'; health.startedAt = performance.now();
      replay();
    });
  }

  function startWorker() {
    worker?.terminate(); worker = null;
    try {
      const was = kind; kind = 'bitmap'; if (was && was !== 'bitmap') remakeTargets();
      worker = new Worker(new URL('./stage.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = onMessage;
      worker.onerror = (e) => { note(`worker error: ${e.message || 'unknown'}`); restart(); };
      worker.postMessage({ t: 'init', tokens, reduceMotion, pixelRatio: dpr, maxFps: 60, salt, g: G });
      mode = 'starting'; health.startedAt = performance.now(); health.lastFrameAt = 0;
      replay();
    } catch (e) { note(e.message); startMain(); }
  }

  function restart() {
    if (disposed) return;
    health.restarts++;
    if (health.restarts > 3 || !workerGL()) startMain(); else startWorker();
  }

  function onMessage(e) {
    const m = e.data;
    if (m.t === 'frame') gotFrame(m.key, m.bmp);
    else if (m.t === 'boxes') boxes = m.boxes;
    else if (m.t === 'ready') mode = 'worker';
    else if (m.t === 'portraits') gotPortraits(m.out);
    else if (m.t === 'stats') { const w = statsWaiters; statsWaiters = []; w.forEach((r) => r({ ...m.stats, acts: m.acts })); }
    else if (m.t === 'lost') { note(m.why || 'context lost'); restart(); }
    else if (m.t === 'error') { note(m.message); if (mode !== 'worker') startMain(); else restart(); }
  }

  // the watchdog: no frame while he should be moving means the worker stalled
  const dog = setInterval(() => {
    if (disposed || mode !== 'worker' || reduceMotion || !last.active || document.hidden) return;
    if (!last.slots.some((s) => s.visible)) return;
    const now = performance.now();
    if (now - health.startedAt < 4000) return;
    if (now - (health.lastFrameAt || health.startedAt) > 2500) { note('stalled: no frame for 2.5 s'); restart(); }
  }, 1000);

  function gotPortraits(out) {
    const res = {};
    for (const [id, v] of Object.entries(out || {})) {
      if (typeof v === 'string') res[id] = v;
      else { const u = URL.createObjectURL(v); urls.push(u); res[id] = u; }
    }
    portraitsWanted = null;
    if (resolvePortraits) { const r = resolvePortraits; resolvePortraits = null; r(res); }
  }

  function send(m) {
    if (disposed) return;
    if (worker) { worker.postMessage(m); return; }
    if (!core) return;
    if (m.t === 'geo') core.setGeo(m.g);
    else if (m.t === 'slots') core.setSlots(m.slots, m.info);
    else if (m.t === 'agents') core.setAgents(m.list);
    else if (m.t === 'active') core.setActive(m.on);
    else if (m.t === 'pin') core.pin(m.id, m.p);
    else if (m.t === 'tap') core.tap(m.id);
    else if (m.t === 'lose') core.lose();
    else if (m.t === 'force') core.force(m.id, m.name);
    else if (m.t === 'portraits') core.portraits(m.ids).then(gotPortraits);
    else if (m.t === 'stats') { const w = statsWaiters; statsWaiters = []; w.forEach((r) => r({ ...core.stats(), acts: core.acts() })); }
  }

  if (workerGL()) startWorker(); else startMain();

  return {
    get mode() { return mode; },
    get geo() { return G; },
    dpr,
    // a slab element to show his agent on (the canvas rides its transform)
    attach(id, slabEl) {
      const key = 'slab:' + id, t = targets.get(key);
      if (t && t.parent === slabEl) return;
      if (t) { t.el.remove(); targets.delete(key); }
      makeTarget(key, slabEl);
      applyVisibility();
    },
    portraits(ids) {
      portraitsWanted = ids;
      return new Promise((res) => { resolvePortraits = res; send({ t: 'portraits', ids }); });
    },
    setGeo(sw, sh, ch) {
      const g = frameGeo(sw, sh, ch);
      if (g.TW === G.TW && g.TH === G.TH && g.SW === G.SW) return;
      G = g;
      for (const [key, t] of targets) {
        sizeEl(t.el);
        if (key !== 'pin') { t.el.style.left = `${-G.side}px`; t.el.style.top = `${-G.above}px`; }
      }
      send({ t: 'geo', g: G });
    },
    setSlots(slots, info) { last.slots = slots; last.info = info; applyVisibility(); send({ t: 'slots', slots, info }); },
    setAgents(list) { last.agents = list; send({ t: 'agents', list }); },
    setActive(on) { last.active = !!on; send({ t: 'active', on: !!on }); },
    // the ride: he is drawn in the pin frame, and the pin canvas is moved
    // here, in the same frame as the sheet
    pin(id, p) {
      if (!targets.has('pin')) makeTarget('pin', container);
      if (p) {
        last.pins = { [id]: p };
        const el = targets.get('pin').el;
        el.style.transform = `translate3d(${p.px - G.AX}px,${p.py - G.PIN_AY}px,0)`;
        if (p.opacity != null) el.style.opacity = String(p.opacity);
      } else delete last.pins[id];
      applyVisibility();
      send({ t: 'pin', id, p: p ? { sq: p.sq, yaw: p.yaw, live: p.live } : null });
    },
    tap(id) { send({ t: 'tap', id }); },
    // which being a point lands on; the point is in the CENTRE slab's frame
    hit(fx, fy) {
      for (let i = boxes.length - 1; i >= 0; i--) {
        const b = boxes[i];
        const ix = (b.x1 - b.x0) * 0.18;
        if (fx > b.x0 + ix && fx < b.x1 - ix && fy > b.y0 && fy < b.y1) return b.id;
      }
      return null;
    },
    // the renderer's own numbers since the last call, plus the watchdog's
    stats() {
      return new Promise((res) => {
        const done = (st) => {
          const centreInts = health.centreInts.splice(0);
          res({ ...st, centreInts, mode, restarts: health.restarts, errors: health.errors.slice(), alive: !!(worker || core) && mode !== 'none', sinceFrame: health.lastFrameAt ? performance.now() - health.lastFrameAt : null });
        };
        const timer = setTimeout(() => { statsWaiters = statsWaiters.filter((w) => w !== done); done({ ints: [], timedOut: true }); }, 1500);
        statsWaiters.push((st) => { clearTimeout(timer); done(st); });
        send({ t: 'stats' });
      });
    },
    // break-ui: lose the WebGL context on purpose, to prove the restart
    loseContext() { send({ t: 'lose' }); },
    force(id, name) { send({ t: 'force', id, name }); },
    dispose() {
      clearInterval(dog);
      if (worker) { worker.postMessage({ t: 'dispose' }); const w = worker; setTimeout(() => w.terminate(), 500); worker = null; }
      core?.dispose(); core = null;
      disposed = true;
      for (const t of targets.values()) t.el.remove();
      targets.clear();
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
