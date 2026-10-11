// THE FRAME REPORT (11 Oct): desktop Chrome and Playwright WebKit both said
// 60 fps and his iPhone recorded ~18 with the agents frozen. So while the
// Skill sets are open, the phone measures itself: the page's own frame
// clock (the carousel's thread), the renderer's loop, how often the centre
// agent's frame actually lands, whether the worker is alive, and the pixel
// ratio. Every 5 s it POSTs a small summary to /api/perf/skillsets
// (server/data/perf/skillsets.jsonl, operational, never the vault).
//
// ON by default for this view only, for now. Off with ?perf=0 or
// localStorage novaos.perf = "0".
import { getConnection } from '../api.js';

export function perfEnabled() {
  try {
    if (/[?&]perf=0\b/.test(location.search)) return false;
    if (/[?&]perf=1\b/.test(location.search)) return true;
    return localStorage.getItem('novaos.perf') !== '0';
  } catch { return true; }
}

const pct = (arr, p) => {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};
// a frame over 1.5 vsyncs dropped (interval / 16.7 - 1) frames
const dropped = (ints, vsync = 1000 / 60) => ints.reduce((n, d) => n + (d > vsync * 1.5 ? Math.round(d / vsync) - 1 : 0), 0);
export function summarise(ints, drawMs) {
  return { p50: pct(ints, 0.5), p95: pct(ints, 0.95), n: ints.length, dropped: dropped(ints), ...(drawMs != null ? { drawMs } : {}) };
}

export function startPerf({ stage, getState, everyMs = 5000 }) {
  if (!perfEnabled()) return () => {};
  const session = Math.random().toString(36).slice(2, 10);
  let ints = [], prev = 0, raf = 0, stopped = false;
  const tick = (t) => {
    if (prev && !document.hidden) { ints.push(t - prev); if (ints.length > 1200) ints.shift(); }
    prev = t;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const onVis = () => { prev = 0; };
  document.addEventListener('visibilitychange', onVis);

  const timer = setInterval(async () => {
    const s = stage();
    if (stopped || document.hidden || !s) return;
    const main = ints; ints = [];
    let st = {};
    try { st = await s.stats(); } catch { /* reported as no worker numbers */ }
    const centreP50 = pct(st.centreInts || [], 0.5);
    const report = {
      session,
      main: summarise(main),
      worker: summarise(st.ints || [], st.drawMs != null ? Math.round(st.drawMs * 100) / 100 : null),
      centreFps: centreP50 ? Math.round(10000 / centreP50) / 10 : null,
      mode: st.mode || s.mode,
      workerAlive: !!st.alive && !st.timedOut,
      restarts: st.restarts || 0,
      errors: st.errors || [],
      dpr: globalThis.devicePixelRatio || 1,
      renderDpr: st.pixelRatio ?? s.dpr,
      ...getState(),
      ua: navigator.userAgent,
    };
    if (import.meta.env?.DEV) window.__novaPerfLast = report;
    const conn = getConnection();
    if (!conn) return; // demo with no Mac: nothing to report to
    try {
      await fetch(conn.baseUrl.replace(/\/$/, '') + '/api/perf/skillsets', {
        method: 'POST', headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(report),
      });
    } catch { /* the next one tries again */ }
  }, everyMs);

  return () => { stopped = true; clearInterval(timer); cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
}
