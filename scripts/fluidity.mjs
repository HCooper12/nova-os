#!/usr/bin/env node
// HOW FLUID IS NOVA, IN NUMBERS. A performance trace per screen and per
// interaction, on his real data, at his phone's size, without writing a byte.
//
// Built 2 Nov 2026 for the fluidity audit (design/audits/2026-11-02-fluidity-audit.md).
// The other instruments answer "does it look right" (shot), "does it fit"
// (probe) and "does it move" (rec). This one answers "does it keep up":
//
//   - warm reload: FCP, LCP, first real content, long tasks, "quiet" time
//   - per screen: the tab switch, a scroll of the main pane, one state change
//   - for every window: long tasks (>50 ms) with their top JS functions mapped
//     back to src/ file:line through the build's sourcemap; main-thread tasks
//     over 8.3 ms (a 120 Hz frame) and 16.7 ms (a 60 Hz frame); rAF gaps;
//     forced reflows with the JS line that forced them; style/layout/paint
//     time; painted area as a multiple of the viewport; React commits and
//     component renders per interaction (a counting devtools hook, no
//     profiler build needed); backdrop-filter elements on screen and the
//     composited layer count.
//
// MEASURE A PRODUCTION BUILD. Dev mode + StrictMode reads ~6x worse on React
// cost (nova-ui-performance, 4 Oct). Build with sourcemaps and serve it on
// 5183 (the server's CORS allowlist is 5183/5173 only):
//
//   npx vite build --outDir /tmp/nova-dist --sourcemap
//   npx vite preview --outDir /tmp/nova-dist --port 5183 --strictPort &
//   node scripts/scratch-server.mjs &          # prints: ready http://127.0.0.1:4174
//   node scripts/fluidity.mjs --server http://127.0.0.1:4174 --dist /tmp/nova-dist --out /tmp/fluidity.json
//   node scripts/fluidity.mjs --server http://127.0.0.1:4174 --dist /tmp/nova-dist --cpu 4     # stress, the motion standard's 4x check
//
// READ-ONLY BY CONSTRUCTION. The connection is built IN MEMORY from
// server/.env (no public/_devconn.js is written or read, so nothing is left
// to --clean and a peer's seed cannot be dropped mid-run), every non-GET
// request is failed at the CDP Fetch layer before it leaves the browser,
// sendBeacon is disabled, and the run refuses itself (exit 3) if the
// interception never engaged. The writes it stopped are listed at the end.
//
// Modes (default: the full per-screen run):
//   --rendercost  time renderVals() and a whole commit per screen (30 empty
//                 setStates, no trace), then a profiled pass for where it goes
//   --ablate      price the orb canvases and the backdrop blur by switching
//                 each off in the test page only (idle + scroll, 4 variants)
//   --explore     list what can be tapped on each screen
//   --glassmeter  run Settings › Check Nova › the glass meter as he would (with --shots for the result)
//   --verify      (2 Nov, finding 2) build the view model the old way beside
//                 the memoised one on EVERY commit of the run and report any
//                 difference (result.verify). Doubles each commit: never
//                 read timings from a --verify run.
// Every window also reports renderVals time inside it (rvMs, rvN, rvMax:
// the instance's renderVals wrapped), and the end of a run the memo's
// per-builder hits and runs (result.memo; builder ms with --verify off).
// Flags: --url --port --dist (build dir, for sourcemaps) --out (json)
//   --traces <dir> (save every window's raw trace, loadable in DevTools)
//   --screens mission,workouts,recipes,inbox,settings,session
//   --shots <dir> (session PNGs; skews timings)
//   --style summary (his, 18 Oct) --width 402 --height 874 --dpr 3
//   --cpu 1 (CPU throttle rate) --timeout 600 --gpu (default) | --swiftshader
//
// Caveats it cannot remove (say them in any report): this is Chrome/Blink on
// the Mac, not WebKit on his iPhone; headless vsync is 60 Hz, so 120 Hz is
// judged by task length against an 8.3 ms budget, not by presented frames.
import { mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  sweepOrphans, launchManagedChrome, killGroup, registerCleanup,
  installDeadline, navigateOrFail,
} from './cdp/lifecycle.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOOL = 'fluidity';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const port = opt('port', '5183');
const url = opt('url', `http://localhost:${port}/nova-os/`);
const dist = opt('dist', null);
const out = opt('out', path.join(os.tmpdir(), 'nova-fluidity.json'));
const width = Number(opt('width', 402));
const height = Number(opt('height', 874));
const dpr = Number(opt('dpr', 3));
const cpu = Number(opt('cpu', 1));
const style = opt('style', 'summary');
const timeoutSec = Number(opt('timeout', 600));
const swift = argv.includes('--swiftshader');
const traceDir = opt('traces', null);
// --shots <dir>: PNGs of the session moments (mid-grow, settled, the tick's
// island receipt, after). Capturing inside a window skews its timings: read
// pictures from a --shots run, never numbers.
const shotsDir = opt('shots', null);
const SCREENS = (opt('screens', 'mission,workouts,recipes,inbox,settings,session')).split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the connection, in memory ----------
const env = await readFile(path.join(ROOT, 'server', '.env'), 'utf8').catch(() => '');
const token = env.match(/^\s*API_TOKEN\s*=\s*(.+?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '');
if (!token) { console.error(`${TOOL}: no API_TOKEN in server/.env: refusing (this would measure DEMO data)`); process.exit(1); }
// THE SERVER IS A SCRATCH COPY, never his live 4173 (the 1 Nov leak: a CDP
// write guard died mid-walk and wrote into his vault). Start one with
// `node scripts/scratch-server.mjs` and pass --server http://127.0.0.1:4174.
const server = opt('server', null);
if (!server || /:4173(\/|$)/.test(server)) { console.error(`${TOOL}: --server <scratch url> is required and may not be the live 4173 (node scripts/scratch-server.mjs)`); process.exit(1); }
const conn = JSON.stringify({ baseUrl: server.replace(/\/$/, ''), token });

// ---------- the page script: seed, guard, counters ----------
const PAGE = `;(function(){
try {
  localStorage.setItem('novaos.connection', ${JSON.stringify(conn)});
  localStorage.setItem('novaos.style', ${JSON.stringify(style)});
} catch (e) {}
try { navigator.sendBeacon = function(){ return false; }; } catch (e) {}
${argv.includes('--verify') ? 'window.__novaValsVerify = true;' : 'window.__novaValsTiming = true;'}
window.__fl = { commits: 0, renders: 0, byType: new Map(), raf: [], loaf: [], events: [], paints: [], lcp: 0, mark: 0 };
// a counting devtools hook: React calls onCommitFiberRoot after every commit,
// in production builds too. A component "rendered" when its fiber carries
// PerformedWork (flag 1); a subtree whose child pointer did not change bailed
// out and is not walked (the same rule React DevTools uses).
var COMP = { 0: 1, 1: 1, 11: 1, 14: 1, 15: 1 };
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true, isDisabled: false, renderers: new Map(),
  inject: function (r) { var id = this.renderers.size + 1; this.renderers.set(id, r); return id; },
  checkDCE: function () {}, onScheduleFiberRoot: function () {}, onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {},
  setStrictMode: function () {},
  onCommitFiberRoot: function (id, root) {
    var fl = window.__fl; fl.commits++;
    if (!fl.root) fl.root = root;
    function walk(next, prev) {
      if (COMP[next.tag] && (!prev || (next.flags & 1))) {
        fl.renders++;
        var t = next.type && next.type.type ? next.type.type : next.type;
        if (t) fl.byType.set(t, (fl.byType.get(t) || 0) + 1);
      }
      if (prev && next.child === prev.child) return;
      for (var c = next.child; c; c = c.sibling) walk(c, prev ? c.alternate : null);
    }
    try { var cur = root.current; walk(cur, cur.alternate); } catch (e) {}
  },
};
// the app instance, found from the fiber tree (window.__novaApp is dev-only)
window.__flApp = function () {
  var r = window.__fl.root; if (!r) return null;
  var stack = [r.current];
  while (stack.length) { var f = stack.pop(); if (f.tag === 1 && f.stateNode && typeof f.stateNode.navigate === 'function') return f.stateNode; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); }
  return null;
};
// rAF intervals, always on (cheap): a gap > 1.5 vsyncs is a missed frame
(function loop(t) { var a = window.__fl.raf; a.push(t); if (a.length > 4000) a.splice(0, 2000); requestAnimationFrame(loop); })(0);
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__fl.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, render: e.renderStart ? (e.startTime + e.duration - e.renderStart) : 0, style: e.styleAndLayoutStart ? (e.startTime + e.duration - e.styleAndLayoutStart) : 0, scripts: (e.scripts || []).slice(0, 6).map(function (s) { return { inv: s.invoker, type: s.invokerType, dur: s.duration, forced: s.forcedStyleAndLayoutDuration, src: s.sourceURL, fn: s.sourceFunctionName, pos: s.sourceCharPosition }; }) }); }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.interactionId) return; window.__fl.events.push({ id: e.interactionId, name: e.name, start: e.startTime, dur: e.duration, proc: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime }); }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) {}
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__fl.lcp = e.startTime; }); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
// first REAL content: the first moment <main> holds more than a splash
(function watch() {
  var t0 = performance.now();
  var mo = new MutationObserver(function () {
    var m = document.querySelector('main');
    if (!window.__fl.content && m && (m.textContent || '').trim().length > 200) { window.__fl.content = performance.now(); mo.disconnect(); }
  });
  document.addEventListener('DOMContentLoaded', function () { mo.observe(document.body, { childList: true, subtree: true, characterData: true }); });
})();
})();`;

// ---------- Chrome ----------
await sweepOrphans(['nova-fluidity-']);
const profile = path.join(os.tmpdir(), `nova-fluidity-${process.pid}`);
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
const debugPort = 9600 + Math.floor(Math.random() * 90);
const gl = swift ? ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader'] : [];
const chrome = await launchManagedChrome(CHROME, [
  `--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--mute-audio', ...gl,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${debugPort}`, `--window-size=${width},${height}`, 'about:blank',
], profile);
const cleanup = async () => { killGroup(chrome.pid); await sleep(400); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); };
registerCleanup({ killSync: () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* gone */ } }, cleanupAsync: cleanup });
const clearDeadline = installDeadline(timeoutSec, TOOL, cleanup);

const base = `http://127.0.0.1:${debugPort}`;
const get = async (p) => { try { const r = await fetch(base + p); return r.ok ? await r.json() : null; } catch { return null; } };
for (let i = 0; i < 80 && !(await get('/json/version')); i++) await sleep(250);

let ws = null; let send = null;
let blocked = []; let sawFetch = false;
const listeners = new Set();
const scripts = new Map(); // scriptId -> url
async function attach() {
  if (ws) { try { ws.close(); } catch { /* closed */ } }
  let page = null;
  for (let i = 0; i < 40 && !page; i++) { page = ((await get('/json/list')) || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (!page) await sleep(250); }
  if (!page) throw new Error('no page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') {
      sawFetch = true;
      const { requestId, request } = m.params;
      // --relogshots logs food for real, to the SCRATCH server only (it
      // refuses 4173 at the top); every other origin stays read-only
      const scratchWrite = argv.includes('--relogshots') && request.url.startsWith(`${server.replace(/\/$/, '')}/api/food-log`);
      const ok = scratchWrite || ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
      if (!ok) blocked.push(`${request.method} ${request.url.replace(/\?.*/, '')}`);
      (ok ? send('Fetch.continueRequest', { requestId }) : send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })).catch(() => {});
      return;
    }
    if (m.method === 'Debugger.scriptParsed') { scripts.set(m.params.scriptId, m.params.url); return; }
    for (const l of listeners) l(m);
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; waiting.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  // the guard FIRST, before anything can navigate (the seed is per session)
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
}
await attach();
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
};

// ---------- sourcemaps: minified position -> src/file:line ----------
const maps = new Map();
async function mapper() {
  if (!dist) return null;
  const { SourceMapConsumer } = await import(pathToFileURL(path.join(ROOT, 'node_modules/source-map-js/source-map.js')).href);
  const dir = path.join(dist, 'assets');
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.js.map')) continue;
    maps.set(f.replace(/\.map$/, ''), new SourceMapConsumer(JSON.parse(await readFile(path.join(dir, f), 'utf8'))));
  }
  return (u, line, col) => {
    const file = (u || '').split('/').pop().replace(/\?.*/, '');
    const c = maps.get(file);
    if (!c) return null;
    const p = c.originalPositionFor({ line: line + 1, column: Math.max(0, col) });
    if (!p.source) return null;
    return `${p.source.replace(/^.*?(src|node_modules|server)\//, '$1/')}:${p.line}${p.name ? ` (${p.name})` : ''}`;
  };
}
const mapPos = (await mapper()) || (() => null);

// ---------- tracing ----------
const CATS = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack', 'toplevel', 'blink.user_timing', 'v8.execute',
  'disabled-by-default-v8.cpu_profiler', 'latencyInfo', 'loading', 'blink',
].join(',');
async function trace(fn, label) {
  const chunks = [];
  let done;
  const finished = new Promise((r) => { done = r; });
  const l = (m) => {
    if (m.method === 'Tracing.dataCollected') chunks.push(...m.params.value);
    if (m.method === 'Tracing.tracingComplete') done(m.params);
  };
  listeners.add(l);
  await send('Tracing.start', { traceConfig: { includedCategories: CATS.split(','), recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  const t0 = Date.now();
  let extra;
  try { extra = await fn(); } finally {
    await send('Tracing.end');
    await finished;
    listeners.delete(l);
  }
  if (traceDir && label) { await mkdir(traceDir, { recursive: true }); await writeFile(path.join(traceDir, `${label}.json`), JSON.stringify({ traceEvents: chunks })); }
  return { events: chunks, wall: Date.now() - t0, extra };
}

function analyse(events, viewportArea) {
  // the renderer main thread = the CrRendererMain with the most events
  const names = events.filter((e) => e.ph === 'M' && e.name === 'thread_name');
  const mains = names.filter((e) => e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`);
  const counts = new Map();
  for (const e of events) { const k = `${e.pid}:${e.tid}`; if (mains.includes(k)) counts.set(k, (counts.get(k) || 0) + 1); }
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) return { error: 'no renderer main thread in trace' };
  const [pid, tid] = main.split(':').map(Number);
  const onMain = events.filter((e) => e.pid === pid && e.tid === tid);
  // top-level tasks only: Chrome nests RunTask inside ThreadControllerImpl::RunTask
  const allTasks = onMain.filter((e) => e.ph === 'X' && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.dur).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const kept = []; let edge = -1;
  for (const t of allTasks) { if (t.ts >= edge) { kept.push(t); edge = t.ts + t.dur; } }
  // THE INSTRUMENT'S OWN TASKS ARE NOT NOVA'S. Starting the trace starts V8's
  // CPU profiler through an interrupt (V8.InvokeApiInterruptCallbacks), which
  // lands inside whatever frame is running and costs 50-75 ms: every window
  // had one, at its very start, inside the page's rAF callback. Dropped here
  // and counted, so a reader can see how many were removed.
  const interrupts = onMain.filter((e) => e.ph === 'X' && e.name === 'V8.InvokeApiInterruptCallbacks' && e.dur > 5000);
  const isInstrument = (t) => interrupts.some((i) => i.ts >= t.ts && i.ts < t.ts + t.dur && i.dur > t.dur * 0.5);
  const tasks = kept.filter((t) => !isInstrument(t));
  const droppedInstrumentTasks = kept.length - tasks.length;
  const ms = (us) => +(us / 1000).toFixed(1);
  // CPU profile samples -> self time by function, per time range
  const nodes = new Map(); const samples = [];
  for (const e of events.filter((x) => x.pid === pid && (x.name === 'ProfileChunk'))) {
    const p = e.args?.data?.cpuProfile; const deltas = e.args?.data?.timeDeltas || [];
    if (!p) continue;
    for (const n of p.nodes || []) nodes.set(`${e.id}:${n.id}`, n.callFrame);
    let t = (samples.length && samples.__last && samples.__lastId === e.id) ? samples.__last : null;
    if (t == null) { const head = events.find((x) => x.pid === pid && x.name === 'Profile' && x.id === e.id); t = head?.args?.data?.startTime ?? e.ts; }
    (p.samples || []).forEach((s, i) => { t += deltas[i] || 0; samples.push({ ts: t, node: `${e.id}:${s}` }); });
    samples.__last = t; samples.__lastId = e.id;
  }
  const CANVAS = new Set(['fill', 'stroke', 'lineTo', 'moveTo', 'arc', 'beginPath', 'closePath', 'fillRect', 'clearRect', 'createRadialGradient', 'createLinearGradient', 'addColorStop', 'quadraticCurveTo', 'bezierCurveTo', 'save', 'restore', 'setTransform', 'drawImage', 'fillText', 'ellipse', 'rect', 'set fillStyle', 'set strokeStyle', 'set globalAlpha', 'set lineWidth', 'set globalCompositeOperation', 'translate', 'rotate', 'scale', 'clip']);
  const byFile = (from, to) => {
    const m = new Map();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]; if (s.ts < from || s.ts > to) continue;
      const next = samples[i + 1]; const d = next ? Math.min(next.ts - s.ts, 2000) : 0;
      const cf = nodes.get(s.node); if (!cf || ['(idle)', '(program)', '(root)'].includes(cf.functionName)) continue;
      let k;
      if (cf.functionName === '(garbage collector)') k = 'GC';
      else if (!cf.url) k = CANVAS.has(cf.functionName) ? '(canvas 2D natives)' : '(other natives)';
      else { const w = mapPos(cf.url, cf.lineNumber, cf.columnNumber); k = w ? w.replace(/:\d+.*$/, '') : cf.url.split('/').pop(); }
      m.set(k, (m.get(k) || 0) + d);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${ms(v)}ms ${k}`);
  };
  const topFns = (from, to, n = 5) => {
    const self = new Map(); let total = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]; if (s.ts < from || s.ts > to) continue;
      const next = samples[i + 1]; const d = next ? Math.min(next.ts - s.ts, 2000) : 0;
      const cf = nodes.get(s.node); if (!cf) continue;
      if (['(idle)', '(program)', '(root)'].includes(cf.functionName)) continue;
      const where = cf.url ? (mapPos(cf.url, cf.lineNumber, cf.columnNumber) || `${cf.url.split('/').pop()}:${cf.lineNumber + 1}`) : cf.functionName || '(native)';
      const k = cf.functionName === '(garbage collector)' ? 'GC' : `${where}${cf.functionName && !where.includes(`(${cf.functionName})`) ? ` [${cf.functionName}]` : ''}`;
      self.set(k, (self.get(k) || 0) + d); total += d;
    }
    return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${ms(v)}ms ${k}`);
  };
  const long = tasks.filter((t) => t.dur > 50000).map((t) => ({ at: t.ts, ms: ms(t.dur), top: topFns(t.ts, t.ts + t.dur, 4) }));
  // forced layout: a Layout event that carries a JS stack was forced by script
  const layouts = onMain.filter((e) => e.name === 'Layout' && e.ph === 'X');
  const forced = layouts.filter((e) => (e.args?.beginData?.stackTrace || []).length);
  const forcedBy = new Map();
  for (const f of forced) {
    const s = f.args.beginData.stackTrace[0];
    const k = mapPos(s.url, s.lineNumber - 1 >= 0 ? s.lineNumber - 1 : 0, (s.columnNumber || 1) - 1) || `${(s.url || '').split('/').pop()}:${s.lineNumber} ${s.functionName}`;
    const cur = forcedBy.get(k) || { n: 0, ms: 0 }; cur.n++; cur.ms += f.dur / 1000; forcedBy.set(k, cur);
  }
  const sum = (arr) => arr.reduce((s, e) => s + (e.dur || 0), 0);
  const recalc = onMain.filter((e) => (e.name === 'UpdateLayoutTree' || e.name === 'RecalculateStyles') && e.ph === 'X');
  const paints = onMain.filter((e) => e.name === 'Paint' && e.ph === 'X');
  let paintArea = 0;
  for (const p of paints) {
    const c = p.args?.data?.clip; if (!c || c.length < 8) continue;
    const xs = [c[0], c[2], c[4], c[6]]; const ys = [c[1], c[3], c[5], c[7]];
    // clip quads are in device px of the layer; clamp each paint to one viewport
    const w = Math.min(Math.max(...xs) - Math.min(...xs), viewportArea.w); const h = Math.min(Math.max(...ys) - Math.min(...ys), viewportArea.h);
    paintArea += Math.max(0, w) * Math.max(0, h);
  }
  const raster = events.filter((e) => e.ph === 'X' && (e.name === 'RasterTask' || e.name === 'GPUTask'));
  const composite = onMain.filter((e) => e.ph === 'X' && (e.name === 'Layerize' || e.name === 'UpdateLayer' || e.name === 'PrePaint' || e.name === 'CompositeLayers' || e.name === 'Commit'));
  const gc = onMain.filter((e) => e.ph === 'X' && /^(MinorGC|MajorGC|V8\.GC)/.test(e.name));
  // GPU-process stalls (Chrome's own shader compiles etc.), kept apart from Nova's main thread
  const gpuNames = new Set(names.filter((e) => e.args?.name === 'CrGpuMain').map((e) => `${e.pid}:${e.tid}`));
  const gpuTasks = events.filter((e) => e.ph === 'X' && e.name === 'GPUTask' && gpuNames.has(`${e.pid}:${e.tid}`));
  const t0 = Math.min(...tasks.map((t) => t.ts)); const t1 = Math.max(...tasks.map((t) => t.ts + t.dur));
  return {
    windowMs: ms(t1 - t0),
    mainBusyMs: ms(sum(tasks)),
    tasksOver8: tasks.filter((t) => t.dur > 8333).length,
    tasksOver16: tasks.filter((t) => t.dur > 16667).length,
    longTasks: long,
    longestTaskMs: ms(Math.max(0, ...tasks.map((t) => t.dur))),
    styleMs: ms(sum(recalc)), styleCount: recalc.length,
    layoutMs: ms(sum(layouts)), layoutCount: layouts.length,
    forcedReflows: forced.length, forcedMs: ms(sum(forced)),
    forcedBy: [...forcedBy.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 6).map(([k, v]) => `${v.n}x ${v.ms.toFixed(1)}ms ${k}`),
    paintCount: paints.length, paintMs: ms(sum(paints)), paintViewports: +(paintArea / (viewportArea.w * viewportArea.h)).toFixed(2),
    compositeMs: ms(sum(composite)), rasterMs: ms(sum(raster)), gcMs: ms(sum(gc)),
    topSelf: topFns(t0, t1, 8),
    topFiles: byFile(t0, t1),
    droppedInstrumentTasks,
    gpuMs: ms(sum(gpuTasks)), gpuLongestMs: ms(Math.max(0, ...gpuTasks.map((t) => t.dur))),
    // a long task that is an instrument's eval, not the app (should be none now)
    evalTasks: tasks.filter((t) => t.dur > 20000 && onMain.some((e) => e.name === 'EvaluateScript' && e.ts >= t.ts && e.ts < t.ts + t.dur && !(e.args?.data?.url))).length,
  };
}

// ---------- page helpers ----------
const resetCounters = () => ev(`(function(){ var f = window.__fl; f.commits = 0; f.renders = 0; f.byType = new Map(); f.raf = []; f.loaf = []; f.events = []; f.rv = []; f.mark = performance.now();
  var a = window.__flApp && window.__flApp();
  window.__flMemo0 = a && a.valsMemo ? JSON.stringify(a.valsMemo.stats.builders) : null;
  if (a && !a.__flRv) { var orig = a.renderVals; a.__flRv = true; a.renderVals = function () { var t = performance.now(); var r = orig.call(this); (window.__fl.rv || (window.__fl.rv = [])).push(performance.now() - t); return r; }; }
  return true; })()`);
async function readCounters() {
  const v = await ev(`(function(){
    var f = window.__fl; var r = f.raf; var gaps = [];
    for (var i = 1; i < r.length; i++) if (r[i - 1] > f.mark) gaps.push(r[i] - r[i - 1]);
    var top = Array.from(f.byType.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 12);
    window.__flTop = top.map(function (e) { return e[0]; });
    var rv = f.rv || [];
    // which builders ran inside this window, and for how long (the memo's own
    // tally, before vs after)
    var ran = null; try { var app = window.__flApp(); if (app && app.valsMemo && window.__flMemo0) { var b0 = JSON.parse(window.__flMemo0), b1 = app.valsMemo.stats.builders; ran = {}; Object.keys(b1).forEach(function (k) { var r = b1[k].runs - ((b0[k] || {}).runs || 0); if (r > 0) ran[k] = r + 'x ' + (b1[k].ms - ((b0[k] || {}).ms || 0)).toFixed(1) + 'ms'; }); } } catch (e) {}
    return { commits: f.commits, renders: f.renders, top: top.map(function (e) { return e[1]; }),
      ran: ran, rvN: rv.length, rvMs: +rv.reduce(function (x, y) { return x + y; }, 0).toFixed(2), rvMax: +Math.max.apply(null, [0].concat(rv)).toFixed(2),
      frames: gaps.length, missed: gaps.filter(function (g) { return g > 25; }).length, worstGap: +Math.max.apply(null, [0].concat(gaps)).toFixed(1),
      loaf: f.loaf.filter(function (l) { return l.start > f.mark; }).slice(0, 8),
      events: f.events.filter(function (e) { return e.start > f.mark; }).slice(0, 8) };
  })()`);
  // name the top component types by where their function lives in src/.
  // The Debugger domain is switched on only here, AFTER the trace: with it on
  // during a window, V8 interrupts showed up as ~50 ms "long tasks" that were
  // the instrument's, not Nova's.
  await send('Debugger.enable'); await sleep(50);
  const named = [];
  for (let i = 0; i < v.top.length; i++) {
    const r = await send('Runtime.evaluate', { expression: `window.__flTop[${i}]` });
    let where = '?';
    if (r.result?.objectId) {
      const p = await send('Runtime.getProperties', { objectId: r.result.objectId, ownProperties: true });
      const loc = (p.internalProperties || []).find((x) => x.name === '[[FunctionLocation]]')?.value?.value;
      if (loc) where = mapPos(scripts.get(loc.scriptId), loc.lineNumber, loc.columnNumber) || `${(scripts.get(loc.scriptId) || '').split('/').pop()}:${loc.lineNumber + 1}`;
    }
    named.push(`${v.top[i]}x ${where}`);
  }
  v.top = named;
  await send('Debugger.disable').catch(() => {});
  for (const l of v.loaf) for (const s of l.scripts) {
    if (s.src && s.pos >= 0) {
      // sourceCharPosition is a char offset; turn it into line/col of the minified file
      const file = s.src.split('/').pop();
      if (dist && !lineIndex.has(file)) lineIndex.set(file, await readFile(path.join(dist, 'assets', file), 'utf8').catch(() => null));
      const txt = lineIndex.get(file);
      if (txt) { const before = txt.slice(0, s.pos); const line = before.split('\n').length - 1; const col = s.pos - before.lastIndexOf('\n') - 1; s.at = mapPos(s.src, line, col); }
    }
  }
  return v;
}
const lineIndex = new Map();

async function glassCensus() {
  return ev(`(function(){
    var all = document.querySelectorAll('*'); var bf = 0, vis = 0, blurs = {}, filt = 0, anims = 0;
    for (var i = 0; i < all.length; i++) {
      var cs = getComputedStyle(all[i]); var b = cs.backdropFilter || cs.webkitBackdropFilter;
      if (b && b !== 'none') { bf++; var r = all[i].getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0) { vis++; blurs[b] = (blurs[b] || 0) + 1; } }
      if (cs.filter && cs.filter !== 'none' && /blur/.test(cs.filter)) filt++;
    }
    var running = document.getAnimations().filter(function (a) { return a.playState === 'running'; });
    var infinite = running.filter(function (a) { var t = a.effect && a.effect.getTiming && a.effect.getTiming(); return t && t.iterations === Infinity; });
    return { nodes: all.length, backdrop: bf, backdropVisible: vis, blurKinds: blurs, filterBlur: filt, canvases: document.querySelectorAll('canvas').length, runningAnimations: running.length, infiniteAnimations: infinite.length,
      infiniteNames: infinite.slice(0, 10).map(function (a) { return a.animationName || (a.effect && a.effect.target && a.effect.target.className && String(a.effect.target.className).slice(0, 40)) || 'waapi'; }) };
  })()`);
}
async function layerCount() {
  let got = null;
  const l = (m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) got = m.params.layers; };
  listeners.add(l);
  await send('LayerTree.enable').catch(() => {});
  for (let i = 0; i < 20 && !got; i++) await sleep(100);
  await send('LayerTree.disable').catch(() => {});
  listeners.delete(l);
  if (!got) return null;
  const drawn = got.filter((x) => x.drawsContent);
  const area = drawn.reduce((s, x) => s + x.width * x.height, 0);
  return { layers: got.length, drawing: drawn.length, layerAreaViewports: +(area / (width * height)).toFixed(1) };
}
async function locate(selector, nth = 0) {
  return ev(`(function(){ var els = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(function(e){ var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight; }); var e = els[${nth}]; if (!e) return null; var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, n: els.length }; })()`);
}
// a touch with NO script evaluation, so nothing of the instrument's runs on
// the page's main thread inside a measured window
async function touchAt(pt) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
  await sleep(60);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const screenNow = () => ev(`(function(){ var a = window.__flApp(); return a ? a.state.screen : null; })()`);
const TAB = { mission: 'Home', workouts: 'Train', recipes: 'Fuel', inbox: 'Inbox', settings: 'Settings', voice: 'Nova' };
// plan a screen switch OUTSIDE the trace: a dock tab's point, or navigate()
async function planScreen(s) {
  const pt = TAB[s] ? await locate(`.nv-sum-tab[aria-label^="${TAB[s]}"]`) : null;
  return pt ? { how: 'tab tap', run: () => touchAt(pt) }
    : { how: 'navigate() (no dock tab: the More grid calls the same)', run: () => ev(`(function(){ window.__flApp().navigate(${JSON.stringify(s)}, { instant: true }); return 1; })()`) };
}
async function goScreen(s) {
  const p = await planScreen(s); await p.run();
  for (let i = 0; i < 30 && (await screenNow()) !== s; i++) await sleep(100);
  return p.how;
}
async function planScroll() {
  return ev(`(function(){ var m = document.querySelector('main'); if (!m) return null; var b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: Math.min(innerHeight - 160, b.top + b.height * 0.7), sh: m.scrollHeight, ch: m.clientHeight }; })()`);
}
async function scrollMain(r) {
  if (!r || r.sh - r.ch < 50) return { skipped: 'main pane does not scroll', ...r };
  await send('Input.synthesizeScrollGesture', { x: Math.round(r.x), y: Math.round(r.y), yDistance: -Math.min(1800, r.sh - r.ch), speed: 1800, gestureSourceType: 'touch', repeatCount: 1 });
  await sleep(300);
  await send('Input.synthesizeScrollGesture', { x: Math.round(r.x), y: Math.round(r.y) - 200, yDistance: Math.min(1800, r.sh - r.ch), speed: 2400, gestureSourceType: 'touch', repeatCount: 1 });
  await sleep(400);
  return { scrollable: r.sh - r.ch };
}

// the one state change per screen: something he does there every day
// the one state change per screen, as a selector located BEFORE the trace
const ACTIONS = {
  mission: ['main [aria-label^="Next instrument"]', 'next instrument (Home carousel)'],
  workouts: ['main [aria-label^="Readiness"]', 'open the readiness breakdown'],
  session: ['main .nv-ss-tick', 'tick a set'],
  recipes: ['main [aria-label^="Today\'s plate"], main [aria-label^="Today’s plate"]', "open the week from Today's plate"],
  inbox: ['main [aria-expanded], main p[aria-label]', 'unfold a record'],
  settings: ['main [aria-label^="Appearance"]', 'open Appearance'],
};
async function enterSession() {
  // the same call the routine card's "Start session" makes; its server write
  // (the draft mirror) is failed by the guard like every other
  const name = await ev(`(function(){ var a = window.__flApp(); var rs = a.state.liveWorkoutRoutines || []; var r = rs.find(function (x) { return x.name === 'Push A'; }) || rs.find(function (x) { return x.exercises && x.exercises.length > 3; }); if (!r) return null; a.startWorkoutSession(r); if (a.state.screen !== 'workouts') a.navigate('workouts'); return r.name; })()`);
  await sleep(1200);
  const live = await ev(`(function(){ var a = window.__flApp(); return !!(a && a.state.workoutSession); })()`);
  return { routine: name, live };
}

// ---------- the run ----------
const VP = { w: width * dpr, h: height * dpr };
const result = { measuredAt: new Date().toISOString(), url, width, height, dpr, cpu, style, gpu: !swift, screens: {} };
await navigateOrFail(send, url, TOOL);
await sleep(4000);
await attach(); // the app reloads itself once after the connection lands
await sleep(6000);
result.renderer = await ev(`(function(){ try { var c = document.createElement('canvas').getContext('webgl'); var d = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(d.UNMASKED_RENDERER_WEBGL); } catch (e) { return 'unknown'; } })()`);
result.live = await ev(`(function(){ var a = window.__flApp(); return a ? { status: a.state.connectionStatus, screen: a.state.screen, style: document.documentElement.dataset.nvStyle, theme: document.documentElement.dataset.nvTheme, material: document.documentElement.dataset.nvMaterial } : null; })()`);
console.error(`${TOOL}: renderer ${result.renderer}; app`, JSON.stringify(result.live));
if (!result.live || result.live.status === 'demo') console.error(`${TOOL}: WARNING: the app is not live; numbers would be DEMO data`);

// (a) warm reload: SW + HTTP cache warm, the way he reopens it
{
  const tr = await trace(async () => {
    await send('Page.reload', { ignoreCache: false });
    await sleep(7000);
  }, 'reload');
  await attach().catch(() => {});
  await sleep(500);
  const paint = await ev(`(function(){ var p = {}; performance.getEntriesByType('paint').forEach(function (e) { p[e.name] = Math.round(e.startTime); }); var nav = performance.getEntriesByType('navigation')[0]; return { fcp: p['first-contentful-paint'], fp: p['first-paint'], lcp: Math.round(window.__fl.lcp), content: Math.round(window.__fl.content || 0), dcl: nav && Math.round(nav.domContentLoadedEventEnd), load: nav && Math.round(nav.loadEventEnd), transfer: nav && nav.transferSize }; })()`);
  const res = await ev(`(function(){ var r = performance.getEntriesByType('resource'); var js = r.filter(function (e) { return /\\.js(\\?|$)/.test(e.name); }); var css = r.filter(function (e) { return /\\.css(\\?|$)/.test(e.name) || /fonts\\.googleapis/.test(e.name); });
    function row(e) { return { f: e.name.split('/').pop().slice(0, 50), kb: Math.round((e.decodedBodySize || 0) / 1024), end: Math.round(e.responseEnd), blocking: e.renderBlockingStatus }; }
    return { jsCount: js.length, jsKB: Math.round(js.reduce(function (s, e) { return s + (e.decodedBodySize || 0); }, 0) / 1024), beforeContent: js.filter(function (e) { return e.responseEnd < (window.__fl.content || 1e9); }).map(row), css: css.map(row) }; })()`);
  const a = analyse(tr.events, VP);
  // "quiet": the end of the last long task in the window, from navigation start
  const navStart = tr.events.find((e) => e.name === 'navigationStart')?.ts;
  a.lastLongTaskEndMs = navStart && a.longTasks.length ? Math.round((Math.max(...a.longTasks.map((t) => t.at + t.ms * 1000)) - navStart) / 1000) : null;
  result.reload = { paint, resources: res, trace: a };
  console.error(`${TOOL}: reload: FCP ${paint.fcp}ms, content ${paint.content}ms, LCP ${paint.lcp}ms, ${a.longTasks.length} long tasks, longest ${a.longestTaskMs}ms`);
}
await sleep(3000);

// THE WHOLE-TREE COST, per screen: App.render() rebuilds every domain's view
// model (renderVals) and reconciles the visible tree on EVERY setState. Time
// both on the live instance: renderVals wrapped on the instance (render()
// calls this.renderVals()), and an empty setState timed to its commit
// callback. No trace running, so no profiler overhead in these numbers.
async function renderCost(n = 30) {
  return ev(`new Promise(function (done) {
    var a = window.__flApp(); var orig = a.renderVals; var rv = [];
    a.renderVals = function () { var t = performance.now(); var r = orig.call(this); rv.push(performance.now() - t); return r; };
    var commits = []; var i = 0;
    function next() {
      if (i++ >= ${n}) { a.renderVals = orig; delete a.renderVals;
        function med(x) { var s = x.slice().sort(function (p, q) { return p - q; }); return +s[Math.floor(s.length / 2)].toFixed(2); }
        function p90(x) { var s = x.slice().sort(function (p, q) { return p - q; }); return +s[Math.floor(s.length * 0.9)].toFixed(2); }
        done({ n: commits.length, renderValsMedMs: med(rv), renderValsP90Ms: p90(rv), commitMedMs: med(commits), commitP90Ms: p90(commits) }); return; }
      var t = performance.now(); a.setState({}, function () { commits.push(performance.now() - t); setTimeout(next, 30); });
    }
    next();
  })`);
}
const shot = async (name) => {
  if (!shotsDir) return;
  await mkdir(shotsDir, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
  if (r?.data) await writeFile(path.join(shotsDir, `${name}.png`), Buffer.from(r.data, 'base64'));
};
if (argv.includes('--rendercost')) {
  result.renderCost = {};
  for (const s of SCREENS) {
    if (s === 'session') { await goScreen('workouts'); await sleep(800); await enterSession(); } else await goScreen(s);
    await sleep(2000);
    result.renderCost[s] = await renderCost();
    // a second pass under the profiler, for WHERE the time goes (its own
    // timings are inflated by the profiler and are not reported)
    // (canvases hidden for this pass so the orb's rAF drawing does not mix in)
    await ev(`(function(){ var st = document.createElement('style'); st.id = 'fl-rc'; st.textContent = 'canvas{visibility:hidden!important}'; document.head.appendChild(st); return 1; })()`);
    await sleep(1000);
    const tr = await trace(async () => { await renderCost(20); });
    await ev(`(function(){ var st = document.getElementById('fl-rc'); if (st) st.remove(); return 1; })()`);
    const a = analyse(tr.events, VP);
    result.renderCost[s].where = { files: a.topFiles, functions: a.topSelf };
    console.error(`${TOOL}: render cost ${s}`, JSON.stringify(result.renderCost[s]));
  }
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(out); clearDeadline(); await cleanup(); process.exit(0);
}
// ABLATION: what the orb and the glass each cost at rest, by switching them
// off IN THIS TEST PAGE ONLY (never a proposal to remove them: the glass is
// a house material). Same screen, three 2 s idle traces: as shipped, canvases
// hidden (NovaCore skips its draw when checkVisibility fails), backdrop-filter
// off. A scroll of the main pane is measured the same three ways.
if (argv.includes('--ablate')) {
  result.ablate = {};
  const STYLE_ID = 'fl-ablate';
  const setCss = (txt) => ev(`(function(){ var s = document.getElementById('${STYLE_ID}'); if (!s) { s = document.createElement('style'); s.id = '${STYLE_ID}'; document.head.appendChild(s); } s.textContent = ${JSON.stringify(txt)}; return 1; })()`);
  for (const s of SCREENS.filter((x) => x !== 'session')) {
    await goScreen(s); await sleep(2500);
    const row = {};
    for (const [k, txt] of [['shipped', ''], ['noCanvas', 'canvas{visibility:hidden!important}'], ['noGlass', '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'], ['neither', 'canvas{visibility:hidden!important} *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}']]) {
      await setCss(txt); await sleep(1200);
      await resetCounters();
      const idle = await trace(async () => { await sleep(2000); });
      const a = analyse(idle.events, VP); const c = await readCounters();
      const sp = await planScroll();
      await resetCounters();
      const sc = await trace(async () => scrollMain(sp));
      const b = analyse(sc.events, VP); const c2 = await readCounters();
      await ev(`(function(){ var m = document.querySelector('main'); if (m) m.scrollTop = 0; return 1; })()`); await sleep(500);
      row[k] = { idle: { mainBusyMs: a.mainBusyMs, windowMs: a.windowMs, over8: a.tasksOver8, gpuMs: a.gpuMs, rasterMs: a.rasterMs, compositeMs: a.compositeMs, missed: c.missed, frames: c.frames },
        scroll: { mainBusyMs: b.mainBusyMs, windowMs: b.windowMs, over8: b.tasksOver8, gpuMs: b.gpuMs, rasterMs: b.rasterMs, missed: c2.missed, frames: c2.frames, worstGap: c2.worstGap } };
      console.error(`${TOOL}: ablate ${s} ${k}`, JSON.stringify(row[k]));
    }
    await setCss('');
    result.ablate[s] = row;
  }
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(out); clearDeadline(); await cleanup(); process.exit(0);
}
// THE GLASS METER, run here as he would run it from Settings › Check Nova
// (src/glassMeter.js): proves the meter works end to end and gives the Blink
// number to set beside his phone's. Its report POST is refused by the guard.
if (argv.includes('--glassmeter')) {
  await goScreen('settings'); await sleep(1200);
  await ev(`(function(){ window.__flApp().runGlassTest(); return 1; })()`);
  let gt = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    gt = await ev(`(function(){ return window.__flApp().state.glassTest || null; })()`);
    if (gt && !gt.running) break;
  }
  await sleep(1500);
  result.glassmeter = { state: gt, screen: await screenNow() };
  await shot('glassmeter-result');
  console.error(`${TOOL}: glass meter`, JSON.stringify(result.glassmeter));
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(out); clearDeadline(); await cleanup(); process.exit(0);
}
// FUEL'S RE-LOG PATHS, PHOTOGRAPHED (3 Nov 2026, for the quicker-logging
// design): the page as it opens, a typed search, and the full history open.
if (argv.includes('--fuelshots')) {
  await goScreen('recipes'); await sleep(2500);
  await shot('fuel-1-top');
  await ev(`(function(){ var i = document.querySelector('main .nv-fs-comp input'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } return !!i; })()`);
  await sleep(300);
  await send('Input.insertText', { text: 'chick' }); await sleep(900);
  await shot('fuel-2-search-chick');
  await ev(`(function(){ var i = document.querySelector('main .nv-fs-comp input'); if (i) i.blur(); return 1; })()`);
  for (let k = 0; k < 5; k++) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }));
  await ev(`(function(){ var d = Array.from(document.querySelectorAll('main .nv-fs-door')).find(function(e){ return /Everything you/.test(e.textContent); }); if (d) { d.scrollIntoView({ block: 'start' }); d.click(); } return !!d; })()`);
  await sleep(1800);
  await ev(`(function(){ var d = document.querySelector('main .nv-fs-rpanel'); if (d) d.scrollIntoView({ block: 'start' }); return !!d; })()`);
  await sleep(500);
  await shot('fuel-3-history');
  result.fuel = await ev(`(function(){ return Array.from(document.querySelectorAll('main .nv-fs-rpanel .nv-fs-ln')).slice(0, 40).map(function(r){ return r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90); }); })()`);
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(out); clearDeadline(); await cleanup(); process.exit(0);
}
// LOG AGAIN (mockup 110): every frame's state, shot for the side-by-side.
// Writes land on the scratch copy only (the --server rule above).
if (argv.includes('--relogshots')) {
  const center = (sel, text) => ev(`(function(){ var els = Array.from(document.querySelectorAll(${JSON.stringify(sel)})); var e = els.find(function(x){ return !${JSON.stringify(text || '')} || x.textContent.indexOf(${JSON.stringify(text || '')}) >= 0; }); if (!e) return null; e.scrollIntoView({ block: 'center' }); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  const tap = async (sel, text) => { const pt = await center(sel, text); if (pt) { await touchAt(pt); await sleep(500); } return !!pt; };
  const hold = async (sel, text) => { const pt = await center(sel, text); if (!pt) return false; await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(750); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(700); return true; };
  const typeIn = async (txt) => { await ev(`(function(){ var i = document.querySelector('.nv-rl-find input'); if (!i) return 0; i.focus(); var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await sleep(200); if (txt) await send('Input.insertText', { text: txt }); await sleep(700); };
  const steps = {};
  await goScreen('recipes'); await sleep(2500);
  await ev(`(function(){ var r = document.querySelector('main .nv-rl-ag'); if (r) r.scrollIntoView({ block: 'center' }); return !!r; })()`); await sleep(500);
  await shot('relog-1-rest');
  steps.rail = await ev(`Array.from(document.querySelectorAll('main .nv-rl-ag')).map(function(e){ return e.textContent.replace(/\\s+/g,' ').trim(); })`);
  steps.all = await tap('.nv-rl-all'); await sleep(900);
  await shot('relog-2-sheet');
  steps.sheet = await ev(`Array.from(document.querySelectorAll('.nv-rl-sheet .nv-rl-sec, .nv-rl-sheet .nv-rl-rg, .nv-rl-sheet .nv-rl-gh, .nv-rl-sheet .nv-rl-it')).slice(0, 40).map(function(e){ return e.className.replace('nv-rl-','') + ': ' + e.textContent.replace(/\\s+/g,' ').trim(); })`);
  await typeIn('pretz'); await shot('relog-3-search');
  steps.search = await ev(`Array.from(document.querySelectorAll('.nv-rl-sheet .nv-rl-it')).map(function(e){ return e.textContent.replace(/\\s+/g,' ').trim(); })`);
  await typeIn('pring');
  steps.countTray = await hold('.nv-rl-sheet .nv-rl-it'); await sleep(400);
  await shot('relog-4-count');
  for (let i = 0; i < 2; i++) await tap('.nv-rl-stp', '+');
  await shot('relog-4b-count-plus');
  steps.countTrayText = await ev(`(function(){ var t = document.querySelector('.nv-rl-tray'); return t ? t.textContent.replace(/\\s+/g,' ').trim() : null; })()`);
  await ev(`(function(){ var s = document.querySelector('.nv-rl-scrim2'); if (s) s.click(); return 1; })()`); await sleep(700);
  await typeIn('tenders');
  steps.servingTray = await hold('.nv-rl-sheet .nv-rl-it'); await sleep(300);
  await tap('.nv-rl-tray .nv-rl-chip', '½');
  await shot('relog-5-serving');
  steps.servingTrayText = await ev(`(function(){ var t = document.querySelector('.nv-rl-tray'); return t ? t.textContent.replace(/\\s+/g,' ').trim() : null; })()`);
  await tap('.nv-rl-go'); await sleep(1500);
  await typeIn(''); await sleep(600);
  await shot('relog-6-logged');
  steps.receipt = await ev(`(function(){ var r = document.querySelector('.nv-rl-receipt'); return r ? r.textContent.replace(/\\s+/g,' ').trim() : null; })()`);
  steps.change = await tap('.nv-rl-amtchip'); await sleep(600);
  await shot('relog-7-change');
  await tap('.nv-rl-tray .nv-rl-chip', '2'); await tap('.nv-rl-go'); await sleep(1500);
  steps.receiptAfterChange = await ev(`(function(){ var r = document.querySelector('.nv-rl-receipt'); return r ? r.textContent.replace(/\\s+/g,' ').trim() : null; })()`);
  steps.logToday = await ev(`(function(){ var a = window.__flApp(); return (a.state.liveFoodLog && a.state.liveFoodLog.entries || []).map(function(e){ return e.name + ' ' + e.macros.kcal; }); })()`);
  await tap('.nv-rl-done'); await sleep(900);
  await ev(`(function(){ var r = document.querySelector('main .nv-rl-ag'); if (r) r.scrollIntoView({ block: 'center' }); return !!r; })()`); await sleep(400);
  await tap('main .nv-rl-ag'); await sleep(1500);
  await shot('relog-8-rail-receipt');
  steps.railReceipt = await ev(`(function(){ var r = document.querySelector('main .nv-rl-receipt'); return r ? r.textContent.replace(/\\s+/g,' ').trim() : null; })()`);
  result.relog = steps;
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(out); clearDeadline(); await cleanup(); process.exit(0);
}
if (argv.includes('--explore')) {
  // list what can be tapped on each screen (to choose the state-change actions)
  for (const s of SCREENS) {
    if (s === 'session') { await goScreen('workouts'); await sleep(1200); console.log('session enter:', JSON.stringify(await enterSession())); await sleep(1500); }
    else { await goScreen(s); await sleep(1800); }
    const list = await ev(`(function(){ return Array.from(document.querySelectorAll('main [role=button], main button, main [aria-expanded], main [role=checkbox], main [role=switch], main input')).filter(function(e){ var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).slice(0, 60).map(function(e){ var b = e.getBoundingClientRect(); return Math.round(b.top) + ' ' + e.tagName + (e.getAttribute('aria-label') ? ' [' + e.getAttribute('aria-label') + ']' : '') + ' ' + (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50); }); })()`);
    console.log(`=== ${s} (${await screenNow()})\n${list.join('\n')}`);
  }
  clearDeadline(); await cleanup(); process.exit(0);
}
// WARM-UP, untraced: every screen, scroll and action once (twice for the
// action, so a toggle ends where it started). Without it the first visit to
// each screen measured Chrome's own first-use GPU shader compiles (Skia
// Graphite on Dawn: one 683 ms GPU-process task on the first Home carousel
// tap): a cost of this instrument's browser, not of Nova on WebKit.
for (const s of SCREENS.filter((x) => x !== 'session')) {
  try {
    await goScreen(s); await sleep(1200);
    await scrollMain(await planScroll());
    await ev(`(function(){ var m = document.querySelector('main'); if (m) m.scrollTop = 0; return 1; })()`); await sleep(400);
    for (let i = 0; i < 2; i++) { const pt = await locate(ACTIONS[s][0]); if (pt) { await touchAt(pt); await sleep(900); } }
  } catch (e) { console.error(`${TOOL}: warm-up ${s}: ${e.message}`); }
}
await sleep(1500);

const escape = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }).catch(() => {});
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }).catch(() => {});
};
for (const s of SCREENS) {
  const row = {};
  try {
    const target = s === 'session' ? 'workouts' : s;
    // (b) the switch: to Home from Fuel, to everything else from Home; the
    // session is entered from Train the way the routine card's Start does
    await goScreen(s === 'session' ? 'workouts' : s === 'mission' ? 'recipes' : 'mission'); await sleep(1500);
    if (s === 'session') {
      await resetCounters();
      const tr = await trace(async () => {
        const r = await enterSession();
        if (shotsDir) { await sleep(150); await shot('session-enter-mid'); await sleep(650); await shot('session-enter-settled'); } else await sleep(800);
        return r;
      }, 'session-enter');
      row.switch = { via: `startWorkoutSession(${tr.extra.routine}) live=${tr.extra.live}`, ...(await readCounters()), trace: analyse(tr.events, VP) };
    } else {
      const plan = await planScreen(target);
      await resetCounters();
      const tr = await trace(async () => { await plan.run(); await sleep(1600); }, `${s}-switch`);
      row.switch = { via: plan.how, landed: await screenNow(), ...(await readCounters()), trace: analyse(tr.events, VP) };
    }
    await sleep(800);
    row.glass = await glassCensus();
    row.layers = await layerCount();
    // (c) scroll the main pane down and back
    const sp = await planScroll();
    await resetCounters();
    const sc = await trace(async () => scrollMain(sp), `${s}-scroll`);
    row.scroll = { ...sc.extra, ...(await readCounters()), trace: analyse(sc.events, VP) };
    await ev(`(function(){ var m = document.querySelector('main'); if (m) m.scrollTop = 0; return 1; })()`);
    await sleep(600);
    // (d) one state change
    const pt = await locate(ACTIONS[s][0]);
    await resetCounters();
    const st = await trace(async () => {
      if (pt) await touchAt(pt);
      if (shotsDir) { await sleep(60); await shot(`${s}-change-a`); await sleep(400); await shot(`${s}-change-b`); await sleep(900); await shot(`${s}-change-c`); } else await sleep(1400);
    }, `${s}-change`);
    row.change = { action: pt ? ACTIONS[s][1] : `none found (${ACTIONS[s][0]})`, ...(await readCounters()), trace: analyse(st.events, VP) };
    // idle: 2 s doing nothing, what the screen costs at rest
    await sleep(500);
    await resetCounters();
    const idle = await trace(async () => { await sleep(2000); }, `${s}-idle`);
    row.idle = { ...(await readCounters()), trace: analyse(idle.events, VP) };
    await escape();
  } catch (e) {
    row.error = e.message;
  }
  result.screens[s] = row;
  const sw = row.switch?.trace; const scl = row.scroll?.trace; const ch = row.change?.trace;
  console.error(`${TOOL}: ${s}: switch ${sw ? `${sw.longestTaskMs}ms longest, ${row.switch.renders} renders/${row.switch.commits} commits` : '-'}; scroll ${scl ? `${scl.tasksOver8}>8ms ${row.scroll.missed} missed` : row.scroll?.skipped || '-'}; change "${row.change?.action}" ${ch ? `${ch.longestTaskMs}ms, ${row.change.renders} renders` : ''}${row.error ? ` ERROR ${row.error}` : ''}`);
}

if (!sawFetch) { console.error(`${TOOL}: the read-only interception never engaged: refusing the result`); clearDeadline(); await cleanup(); process.exit(3); }
// the memo's own account (2 Nov): per builder, how often it ran and how often
// its last result was handed back; and with --verify, every difference found
result.memo = await ev(`(function(){ var a = window.__flApp(); var m = a && a.valsMemo; if (!m) return null; var b = m.stats.builders; var o = {}; Object.keys(b).forEach(function (k) { o[k] = { runs: b[k].runs, hits: b[k].hits, ms: +b[k].ms.toFixed(1) }; }); return { composes: m.stats.composes, builders: o }; })()`).catch(() => null);
result.memoDeps = await ev(`(function(){ var a = window.__flApp(); return a && a.valsMemo && a.valsMemo.inspect ? a.valsMemo.inspect() : null; })()`).catch(() => null);
if (argv.includes('--verify')) {
  result.verify = await ev(`JSON.parse(JSON.stringify(window.__novaValsDiffs || null))`).catch((e) => ({ error: e.message }));
  console.error(`${TOOL}: verify: ${result.verify ? `${result.verify.checked} commits checked, ${result.verify.differed} differed` : 'no verify log (an old build?)'}`);
}
result.blockedWrites = [...new Set(blocked)];
result.blockedWriteCount = blocked.length;
await writeFile(out, JSON.stringify(result, null, 2));
console.error(`${TOOL}: blocked ${blocked.length} write(s): ${result.blockedWrites.join(', ') || 'none'}`);
console.log(out);
clearDeadline();
await cleanup();
process.exit(0);
