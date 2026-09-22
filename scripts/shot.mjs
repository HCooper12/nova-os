#!/usr/bin/env node
// A STILL OF ANY NOVA PAGE, FROM A BROWSER NOBODY ELSE IS USING.
//
// Both MCP browsers can be gone at once (the devtools profile held by another
// session, the extension not connected) and macOS refuses `screencapture`
// to a sandboxed process. Verifying by looking then has no instrument — so
// this is one: the recorder's headless Chrome (its own profile, SwiftShader
// so WebGL draws), phone metrics, the dev connection seeded from the same
// gitignored file dev-connect.mjs writes, one PNG out.
//
//   node scripts/dev-connect.mjs                       # once, seeds public/_devconn.js
//   node scripts/shot.mjs --out /tmp/train.png \
//        --eval "window.__novaApp.navigate('workouts')" --wait 2500
//   node scripts/shot.mjs --url 'http://localhost:5183/nova-os/tools/motion/harness.html?frames=1&per=6&size=220' --out /tmp/sheet.png
//
// Flags: --url (default the app on :5183) --out --eval (JS run after load,
// may be repeated) --wait ms (after the last eval) --width --height --dpr
// --port (dev server, when --url is omitted) --nomobile
import { spawn } from 'node:child_process';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));
const port = opt('port', '5183');
const url = opt('url', `http://localhost:${port}/nova-os/`);
const out = opt('out', path.join(os.tmpdir(), 'nova-shot.png'));
const width = Number(opt('width', 402));
const height = Number(opt('height', 874));
const dpr = Number(opt('dpr', 2));
const wait = Number(opt('wait', 1500));
const mobile = !argv.includes('--nomobile');
const evals = all('eval');

const profile = path.join(os.tmpdir(), `nova-shot-profile-${process.pid}`);
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
const debugPort = 9400 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`,
  '--headless=new', '--hide-scrollbars', '--mute-audio',
  '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`,
  `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });
// Chrome is still flushing its cache when the kill lands; the profile is in
// the temp dir, so a directory that will not go yet is not worth failing over.
const cleanup = async () => {
  try { chrome.kill(); } catch { /* gone */ }
  await new Promise((r) => setTimeout(r, 400));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
};
process.on('uncaughtException', async (e) => { console.error(e.message); await cleanup(); process.exit(1); });

const base = `http://127.0.0.1:${debugPort}`;
const get = async (p) => { try { const r = await fetch(base + p); return r.ok ? await r.json() : null; } catch { return null; } };
let up = false;
for (let i = 0; i < 80 && !up; i++) { up = Boolean(await get('/json/version')); if (!up) await new Promise((r) => setTimeout(r, 250)); }
if (!up) throw new Error(`Chrome never answered on ${debugPort}`);
let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  const page = ((await get('/json/list')) || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (page) wsUrl = page.webSocketDebuggerUrl;
  else { await get('/json/new?about:blank'); await new Promise((r) => setTimeout(r, 250)); }
}
if (!wsUrl) throw new Error('no page target');

let ws = null; let send = null;
// The app reloads itself once after the connection lands ("Inspected target
// navigated or closed" mid-eval), so the session is re-attached to whatever
// page target is current before any script is run against it.
async function attach() {
  if (ws) { try { ws.close(); } catch { /* already closed */ } }
  const page = ((await get('/json/list')) || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('no page target to attach to');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; waiting.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
}
await attach();
// the connection, seeded before the app's first script runs — the token stays
// inside the file dev-connect.mjs wrote and is never printed
const seed = await readFile(path.join(ROOT, 'public', '_devconn.js'), 'utf8').catch(() => '');
if (!seed) {
  // A shot of the demo fixtures looks exactly like a shot of his app, and
  // every conclusion drawn from it is wrong. The probe learned this first.
  console.error('no public/_devconn.js — run `node scripts/dev-connect.mjs` first, or this photographs DEMO DATA');
  await cleanup(); process.exit(1);
}
await send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 3000));
await attach();
for (const js of evals) {
  let r;
  try {
    r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
  } catch (e) {
    if (!/navigated or closed/.test(e.message)) throw e;
    await new Promise((r2) => setTimeout(r2, 1500));
    await attach();
    r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
  }
  if (r.exceptionDetails) console.error('eval failed:', r.exceptionDetails.text, r.exceptionDetails.exception?.description || '');
  else if (r.result?.value !== undefined && typeof r.result.value !== 'object') console.log('eval:', String(r.result.value).slice(0, 600));
  await new Promise((r2) => setTimeout(r2, 400));
}
await new Promise((r) => setTimeout(r, wait));
// and say so loudly if it still came up disconnected
const live = await send('Runtime.evaluate', { expression: 'Boolean(localStorage.getItem("novaos.connection")) && !/DEMO DATA/.test(document.body.textContent || "")', returnByValue: true });
if (!live.result.value) console.error('WARNING: this shot is DEMO DATA, not his vault — the page did not connect');
const errors = await send('Runtime.evaluate', { expression: 'JSON.stringify({title: document.title, w: innerWidth, h: innerHeight})', returnByValue: true });
const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(out, Buffer.from(shot.data, 'base64'));
console.log(out, errors.result.value);
ws.close();
await cleanup();
process.exit(0);
