// THE SKILL SETS' STAGE, as the page sees it. The renderer (./stageCore.js)
// runs in a Web Worker on an OffscreenCanvas wherever the browser can do
// WebGL there (iOS Safari 17+, Chrome), so the carousel's swipe never waits
// on a WebGL frame. Where it can't, it runs here on the main thread with a
// lower pixel ratio and a 30 fps cap, the old budget.
//
// The page talks to it only in plain data: the size, the slots (where each
// slab is on screen), who may play, a pin (the ride onto the sheet), a tap.
// It gets back each being's box on screen, so a tap test is a lookup here,
// never a round trip.

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

// can a worker draw WebGL on an OffscreenCanvas here?
function workerGL() {
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
    if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return false;
    const c = new OffscreenCanvas(1, 1);
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

export function createSkillStage(container, { tokensFrom, reduceMotion = false, onFail } = {}) {
  const tokens = readTokens(tokensFrom || container);
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const salt = (Math.random() * 1e9) | 0;
  // the last of everything sent, so a fallback can replay it
  const last = { w: 1, h: 1, slots: [], info: {}, agents: [], active: true, pins: {} };
  let boxes = [], worker = null, core = null, canvas = null, disposed = false, mode = 'none';
  let portraitsWanted = null, resolvePortraits = null, statsWaiters = [];
  const urls = [];

  const newCanvas = () => {
    canvas?.remove();
    canvas = document.createElement('canvas');
    canvas.className = 'nv-skl-chr'; canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    return canvas;
  };

  function replay() {
    send({ t: 'resize', w: last.w, h: last.h });
    send({ t: 'agents', list: last.agents });
    send({ t: 'slots', slots: last.slots, info: last.info });
    for (const [id, p] of Object.entries(last.pins)) send({ t: 'pin', id, p });
    if (!last.active) send({ t: 'active', on: false });
    if (portraitsWanted) send({ t: 'portraits', ids: portraitsWanted });
  }

  function startMain() {
    worker?.terminate(); worker = null;
    const cv = newCanvas();
    return import('./stageCore.js').then(({ createStageCore }) => {
      if (disposed) return;
      try {
        core = createStageCore({
          canvas: cv, tokens, reduceMotion, pixelRatio: Math.min(dpr, 1.25), maxFps: 30, salt,
          raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id),
          snap: async () => cv.toDataURL('image/png'),
          onBoxes: (b) => { boxes = b; },
        });
      } catch {
        cv.remove(); canvas = null; mode = 'none';
        if (onFail) onFail();
        return;
      }
      mode = 'main';
      replay();
    });
  }

  function onMessage(e) {
    const m = e.data;
    if (m.t === 'boxes') boxes = m.boxes;
    else if (m.t === 'ready') mode = 'worker';
    else if (m.t === 'portraits') gotPortraits(m.out);
    else if (m.t === 'stats') { const w = statsWaiters; statsWaiters = []; w.forEach((r) => r({ ...m.stats, mode, acts: m.acts })); }
    else if (m.t === 'error' && mode !== 'worker') startMain(); // the worker could not start: draw here instead
  }

  function gotPortraits(out) {
    const res = {};
    for (const [id, v] of Object.entries(out || {})) {
      if (typeof v === 'string') res[id] = v;
      else { const u = URL.createObjectURL(v); urls.push(u); res[id] = u; }
    }
    portraitsWanted = null;
    if (resolvePortraits) { const r = resolvePortraits; resolvePortraits = null; r(res); }
  }

  function send(m, transfer) {
    if (disposed) return;
    if (worker) { worker.postMessage(m, transfer || []); return; }
    if (!core) return;
    if (m.t === 'resize') core.resize(m.w, m.h);
    else if (m.t === 'slots') core.setSlots(m.slots, m.info);
    else if (m.t === 'agents') core.setAgents(m.list);
    else if (m.t === 'active') core.setActive(m.on);
    else if (m.t === 'pin') core.pin(m.id, m.p);
    else if (m.t === 'tap') core.tap(m.id);
    else if (m.t === 'portraits') core.portraits(m.ids).then(gotPortraits);
    else if (m.t === 'stats') { const w = statsWaiters; statsWaiters = []; w.forEach((r) => r({ ...core.stats(), mode, acts: core.acts() })); }
  }

  if (workerGL()) {
    try {
      const cv = newCanvas();
      const off = cv.transferControlToOffscreen();
      worker = new Worker(new URL('./stage.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = onMessage;
      worker.onerror = () => { if (mode !== 'worker') startMain(); };
      const r = container.getBoundingClientRect();
      last.w = r.width || 1; last.h = r.height || 1;
      worker.postMessage({ t: 'init', canvas: off, tokens, reduceMotion, pixelRatio: dpr, maxFps: 60, salt, w: last.w, h: last.h }, [off]);
      mode = 'starting';
    } catch { startMain(); }
  } else startMain();

  return {
    get canvas() { return canvas; },
    get mode() { return mode; },
    portraits(ids) {
      portraitsWanted = ids;
      return new Promise((res) => { resolvePortraits = res; send({ t: 'portraits', ids }); });
    },
    resize(w, h) { last.w = w; last.h = h; send({ t: 'resize', w, h }); },
    setSlots(slots, info) { last.slots = slots; last.info = info; send({ t: 'slots', slots, info }); },
    setAgents(list) { last.agents = list; send({ t: 'agents', list }); },
    setActive(on) { last.active = !!on; send({ t: 'active', on: !!on }); },
    pin(id, p) { if (p) last.pins[id] = p; else delete last.pins[id]; send({ t: 'pin', id, p }); },
    tap(id) { send({ t: 'tap', id }); },
    // which being a point lands on (his body's box, so a swipe that starts
    // beside him still swipes)
    hit(px, py) {
      for (let i = boxes.length - 1; i >= 0; i--) {
        const b = boxes[i];
        const ix = (b.x1 - b.x0) * 0.18;
        if (px > b.x0 + ix && px < b.x1 - ix && py > b.y0 && py < b.y1) return b.id;
      }
      return null;
    },
    stats() { return new Promise((res) => { statsWaiters.push((st) => res({ ...st, boxes, slots: last.slots, size: [last.w, last.h] })); send({ t: "stats" }); }); },
    dispose() {
      if (worker) { worker.postMessage({ t: 'dispose' }); const w = worker; setTimeout(() => w.terminate(), 500); worker = null; }
      core?.dispose(); core = null;
      disposed = true;
      canvas?.remove(); canvas = null;
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
