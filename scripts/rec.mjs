#!/usr/bin/env node
// RECORD AN INTERACTION. A still cannot show whether a thing MOVES well.
//
// `nova-motion-check` is the standing rule for the 3D figure: record it and
// watch it, because a still hides a limb that snaps. The same is true of every
// surface whose value is how it behaves — a chevron that turns, a rail that
// scrolls under the finger, a sheet that opens at the right height. This is
// that instrument for the UI: drive the real app in a private headless Chrome
// and assemble the frames into a GIF.
//
//   node scripts/dev-connect.mjs
//   node scripts/rec.mjs --out /tmp/journal.gif \
//     --setup "window.__novaApp.navigate('journal')" \
//     --act "document.querySelectorAll('[aria-expanded]')[0].click()" \
//     --frames 22 --interval 90
//
// Flags: --out --setup (js, run then settled) --act (js, run after the first
// frame) --frames --interval ms --width --height --dpr --settle ms --port
// --style --scale (gif width in px, default 402)
import { spawn, execFile } from 'node:child_process';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };

const out = opt('out', path.join(os.tmpdir(), 'nova-rec.gif'));
const setupJs = opt('setup', '');
const actJs = opt('act', '');
const frames = Number(opt('frames', 20));
const interval = Number(opt('interval', 100));
const settle = Number(opt('settle', 2600));
const width = Number(opt('width', 402));
const height = Number(opt('height', 874));
const dpr = Number(opt('dpr', 2));
const port = opt('port', '5183');
const style = opt('style', '');
const scale = Number(opt('scale', 402));
// SLOW THE CLOCK, NOT THE ANIMATION. A screenshot through SwiftShader takes
// 100–300ms, so a 280ms entrance is over before the second frame lands and
// every recording of it shows a cut. CDP can slow the whole animation clock,
// which is the only way to photograph a fast transition without changing the
// code being tested. --slow 8 records a 280ms move as 2.2s; the GIF is then
// played back at the same factor to restore real time, or left slow on
// purpose to inspect it.
const slow = Number(opt('slow', 1));

const work = path.join(os.tmpdir(), `nova-rec-${process.pid}`);
const profile = path.join(work, 'profile');
const shots = path.join(work, 'frames');
await rm(work, { recursive: true, force: true });
await mkdir(shots, { recursive: true });
await mkdir(profile, { recursive: true });

const dbg = 9600 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--mute-audio',
  '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${dbg}`, `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });
const cleanup = async () => {
  try { chrome.kill(); } catch { /* gone */ }
  await new Promise((r) => setTimeout(r, 300));
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
};
process.on('uncaughtException', async (e) => { console.error(e.message); await cleanup(); process.exit(1); });

const base = `http://127.0.0.1:${dbg}`;
const get = async (p) => { try { const r = await fetch(base + p); return r.ok ? await r.json() : null; } catch { return null; } };
let up = false;
for (let i = 0; i < 80 && !up; i++) { up = Boolean(await get('/json/version')); if (!up) await new Promise((r) => setTimeout(r, 250)); }
if (!up) throw new Error('Chrome never answered');

let SEED = '';
let ws = null; let send = null;
async function attach() {
  if (ws) { try { ws.close(); } catch { /* closed */ } }
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    page = ((await get('/json/list')) || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) { await get('/json/new?about:blank'); await new Promise((r) => setTimeout(r, 250)); }
  }
  if (!page) throw new Error('no page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; waiting.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (slow > 1) {
    await send('Animation.enable').catch(() => {});
    await send('Animation.setPlaybackRate', { playbackRate: 1 / slow }).catch(() => {});
  }
  if (SEED) await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
}
const evaluate = async (expression) => {
  for (let a = 0; a < 2; a++) {
    try {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
      return { value: r.result.value };
    } catch (e) {
      if (!/navigated or closed/.test(e.message) || a) throw e;
      await new Promise((r) => setTimeout(r, 1200)); await attach();
    }
  }
  return {};
};

const seed = await readFile(path.join(ROOT, 'public', '_devconn.js'), 'utf8').catch(() => '');
if (!seed) { console.error('no public/_devconn.js — run `node scripts/dev-connect.mjs` first, or this records DEMO DATA'); await cleanup(); process.exit(1); }
SEED = style ? `${seed}\nlocalStorage.setItem('novaos.style', ${JSON.stringify(style)});` : seed;

await attach();
await send('Page.navigate', { url: `http://localhost:${port}/nova-os/` });
await new Promise((r) => setTimeout(r, 2500));
await attach();
let ready = {};
for (let i = 0; i < 40; i++) {
  const r = await evaluate('JSON.stringify({conn: !!localStorage.getItem("novaos.connection"), app: !!window.__novaApp})');
  ready = JSON.parse(r.value || '{}');
  if (ready.conn && ready.app) break;
  await new Promise((r2) => setTimeout(r2, 500));
  if (i === 12) await attach();
}
if (!ready.app) { console.error('the page never connected — refusing to record demo data'); ws?.close(); await cleanup(); process.exit(1); }

if (setupJs) {
  const r = await evaluate(setupJs);
  if (r.error) console.error('setup failed:', r.error.slice(0, 160));
}
await new Promise((r) => setTimeout(r, settle));

// A FRAME BEFORE THE ACTION, so the recording opens on the resting state and
// the change is visible as a change rather than as the whole clip.
let acted = false;
for (let i = 0; i < frames; i++) {
  if (i === 1 && actJs && !acted) {
    acted = true;
    const r = await evaluate(actJs);
    if (r.error) console.error('act failed:', r.error.slice(0, 160));
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(shots, `f${String(i).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'));
  await new Promise((r) => setTimeout(r, interval));
}
ws.close();

const fps = Math.max(1, Math.round(1000 / interval));
await run('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(shots, 'f%03d.png'),
  '-vf', `scale=${scale}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer`,
  '-loop', '0', out]);
console.log(out, `${frames} frames @ ${fps}fps${slow > 1 ? ` · animation clock at 1/${slow}` : ''}`);
await cleanup();
process.exit(0);
