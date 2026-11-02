#!/usr/bin/env node
// WALK NOVA WITH THE NETWORK OFF, ON A COPY OF HIS REAL DATA.
//
// His instruction, 2 Nov 2026: Nova should open and work like Apple Notes
// with no internet and no Claude: Fuel, Train, queueing to the Inbox,
// reading his statistics. Reading the code said "should already work" for
// three weeks (nova-offline-mode memory) without anyone opening it offline.
// This opens it offline.
//
// THIS NEVER TALKS TO HIS LIVE SERVER (4173). Its first version did, behind
// a CDP write guard, and leaked a fake session and food entry into his vault
// the moment a session re-attach dropped the guard (design/audits/
// 2026-11-02-offline-audit.md, the incident). A guard that can lapse is not
// a guard. So the walk runs its OWN server:
//   - a fresh copy of server/data and of his vault in a scratch folder,
//   - a second Nova server on 4174 over those copies, the same token (read
//     here, never printed), every outbound integration switched off by env
//     (Telegram, Todoist, iCloud, the Reminders sync, Notion and web push by
//     deleting their tokens from the COPY), Claude replaced by a stub that
//     fails, Tailscale by a stub so the copy never binds the tailnet,
//   - and the page reaches it only through a proxy here on 4185 that this
//     script switches on and off. Off = every connection reset at once,
//     which is what a phone in airplane mode sees (a TypeError).
// Any request the page makes to :4173 is failed at the CDP layer and
// counted; a non-zero count fails the run.
//
// Order of the walk:
//   1. build the PWA (or --dist) and serve it with `vite preview` on 5173 —
//      the production build, because only it has the service worker;
//   2. load it ONLINE once, connected to the copy, so the SW installs and
//      the phone-side caches fill with his real shapes of data;
//   3. kill the preview server, switch the proxy off, emulate offline and
//      RELOAD: a cold start with no network;
//   4. every screen and sub-view, then every write he can make offline;
//   5. reload offline again (the app killed and reopened);
//   6. switch the proxy back on: the Outbox replays into the COPY, and the
//      copy is read back to prove each item landed exactly once.
//
//   node scripts/offline-walk.mjs --label before --out <dir> --scratch <dir>
//
// Writes <out>/<label>.json and <out>/<label>-<step>.png. Screenshots go in
// a scratch folder, never design/ (the audit convention).
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, rm, readFile, writeFile, chmod } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  sweepOrphans, launchManagedChrome, killGroup, registerCleanup, installDeadline, navigateOrFail,
} from './cdp/lifecycle.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOOL = 'offline-walk';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const label = opt('label', 'walk');
const outDir = opt('out', path.join(os.tmpdir(), 'nova-offline-walk'));
const scratch = opt('scratch', path.join(os.tmpdir(), `nova-offline-scratch-${process.pid}`));
const PAGE_PORT = 5173; // the CORS list allows 5183 and 5173 only; 5183 is the shot tools'
const SERVER_PORT = 4174;
const PROXY_PORT = 4185;
const LIVE_PORT = 4173;
const style = opt('style', 'summary'); // his phone runs Summary (18 Oct correction)
const noShots = argv.includes('--noshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = `http://localhost:${PAGE_PORT}`;
const APP_URL = `${ORIGIN}/nova-os/`;

await mkdir(outDir, { recursive: true });
await sweepOrphans(['nova-offline-profile-']);
const portFree = (p) => new Promise((resolve) => { const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true))).listen(p, '127.0.0.1'); });
for (const p of [PAGE_PORT, SERVER_PORT, PROXY_PORT]) if (!(await portFree(p))) { console.error(`${TOOL}: port ${p} is taken; refusing`); process.exit(1); }

// ---- the token and the vault path, read here, never printed ----
const env = await readFile(path.join(ROOT, 'server', '.env'), 'utf8');
const envVal = (k) => env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1]?.replace(/^['"]|['"]$/g, '');
const token = envVal('API_TOKEN');
const liveVault = envVal('VAULT_PATH');
if (!token || !liveVault) { console.error(`${TOOL}: API_TOKEN / VAULT_PATH missing in server/.env`); process.exit(1); }

const procs = [];
const killProc = (p) => { if (!p) return; try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch { /* gone */ } } };
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  let log = '';
  p.stdout.on('data', (d) => { log += d; });
  p.stderr.on('data', (d) => { log += d; });
  p.on('exit', (code) => (code === 0 ? resolve(log) : reject(new Error(`${cmd} exited ${code}\n${log.slice(-2000)}`))));
});

// ---- the copies ----
const dataCopy = path.join(scratch, `data-${label}`);
const vaultCopy = path.join(scratch, `vault-${label}`);
const shim = path.join(scratch, 'shim');
await rm(dataCopy, { recursive: true, force: true });
await rm(vaultCopy, { recursive: true, force: true });
await mkdir(scratch, { recursive: true });
await mkdir(path.join(scratch, 'projects'), { recursive: true });
console.error(`${TOOL}: copying server/data and the vault into ${scratch}`);
execFileSync('cp', ['-R', path.join(ROOT, 'server', 'data'), dataCopy]);
execFileSync('rsync', ['-a', '--exclude', '.trash', `${liveVault}/`, `${vaultCopy}/`]);
// the copy must not be able to reach anyone: Notion and web push keep their
// credentials in the data dir, so they go from the COPY (never the original)
for (const f of ['integrations/notion.json', 'push.json', 'push-keys.json', 'push-held.json']) await rm(path.join(dataCopy, f), { force: true });
await mkdir(shim, { recursive: true });
for (const bin of ['claude', 'tailscale']) {
  await writeFile(path.join(shim, bin), '#!/bin/sh\necho "offline-walk stub: disabled" >&2\nexit 1\n');
  await chmod(path.join(shim, bin), 0o755);
}

// ---- the second server, over the copies ----
const serverLog = path.join(outDir, `${label}-server.log`);
const serverEnv = {
  ...process.env,
  PORT: String(SERVER_PORT), HOST: '127.0.0.1',
  NOVA_DATA_DIR: dataCopy, VAULT_PATH: vaultCopy, API_TOKEN: token,
  // dotenv never overrides a key that is already set, even to '', so these
  // stay off although server/.env carries them
  TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', TODOIST_TOKEN: '', NOTION_TOKEN: '',
  ICLOUD_USERNAME: '', ICLOUD_APP_PASSWORD: '', BRAVE_SEARCH_KEY: '', ELEVENLABS_API_KEY: '',
  NOVA_REMINDERS_SYNC: 'off', NOVA_TAILNET_AUTOUP: '0', NOVA_COACH_CADENCE: 'off',
  NOVA_TTS_LOCAL: '0', NOVA_STT_LOCAL: '0', NOVA_OLLAMA_NO_SPAWN: '1',
  CLAUDE_BIN: path.join(shim, 'claude'), NOVA_CLAUDE_BIN: path.join(shim, 'claude'),
  NOVA_PROJECTS_DIR: path.join(scratch, 'projects'),
  PATH: `${shim}:${process.env.PATH}`,
};
const server = spawn(process.execPath, ['index.js'], { cwd: path.join(ROOT, 'server'), env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
procs.push(server);
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });
const copyApi = async (method, route, body) => {
  const r = await fetch(`http://127.0.0.1:${SERVER_PORT}${route}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.ok ? r.json() : null;
};
let serverUp = false;
for (let i = 0; i < 120 && !serverUp; i++) { try { serverUp = (await fetch(`http://127.0.0.1:${SERVER_PORT}/api/health`)).status < 500; } catch { /* booting */ } if (!serverUp) await sleep(500); }
if (!serverUp) { console.error(`${TOOL}: the copy's server never answered\n${serverOut.slice(-1500)}`); killProc(server); process.exit(1); }

// ---- the switchable proxy: the only road from the page to the copy ----
let proxyOn = true;
const sockets = new Set();
const proxy = http.createServer((req, res) => {
  if (!proxyOn) { req.socket.destroy(); return; }
  const up = http.request({ host: '127.0.0.1', port: SERVER_PORT, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => req.socket.destroy());
  req.pipe(up);
});
proxy.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));
const setProxy = (on) => { proxyOn = on; if (!on) for (const s of sockets) s.destroy(); };
const conn = { baseUrl: `http://127.0.0.1:${PROXY_PORT}`, token };

// ---- build + preview ----
let dist = opt('dist', null);
if (!dist) {
  dist = path.join(scratch, `dist-${label}`);
  console.error(`${TOOL}: building into ${dist}`);
  await run('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir']);
}
const preview = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(PAGE_PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
procs.push(preview);
let previewUp = false;
for (let i = 0; i < 60 && !previewUp; i++) { try { previewUp = (await fetch(APP_URL)).ok; } catch { /* not yet */ } if (!previewUp) await sleep(250); }

// ---- chrome ----
const profile = path.join(os.tmpdir(), `nova-offline-profile-${process.pid}`);
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
const debugPort = 9500 + Math.floor(Math.random() * 90);
const chrome = await launchManagedChrome(CHROME, [
  `--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--mute-audio',
  '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`, '--window-size=402,874', 'about:blank',
], profile);
const cleanup = async () => {
  killGroup(chrome.pid);
  for (const p of procs) killProc(p);
  try { proxy.close(); } catch { /* closed */ }
  for (const s of sockets) s.destroy();
  await writeFile(serverLog, serverOut).catch(() => {});
  await sleep(400);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
};
registerCleanup({
  killSync: () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* gone */ } for (const p of procs) killProc(p); },
  cleanupAsync: cleanup,
});
const clearDeadline = installDeadline(Number(opt('timeout', 900)), TOOL, cleanup);
if (!previewUp) { console.error(`${TOOL}: preview never answered on ${PAGE_PORT}`); await cleanup(); process.exit(1); }

const base = `http://127.0.0.1:${debugPort}`;
const getJ = async (p) => { try { const r = await fetch(base + p); return r.ok ? await r.json() : null; } catch { return null; } };
for (let i = 0; i < 80 && !(await getJ('/json/version')); i++) await sleep(250);

// Page script: the connection + his style, a rAF shim (headless never fires
// it), and a way to reach the App in a PRODUCTION build (window.__novaApp is
// dev-only): walk the React fiber to the class component that owns navigate().
const pageScript = `
localStorage.setItem('novaos.connection', ${JSON.stringify(JSON.stringify(conn))});
localStorage.setItem('novaos.style', ${JSON.stringify(style)});
;window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
;window.__walkErrors = window.__walkErrors || [];
;window.addEventListener('error', (e) => window.__walkErrors.push(String(e.message || e)));
;window.addEventListener('unhandledrejection', (e) => window.__walkErrors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
;window.__findApp = function () {
  const root = document.getElementById('root');
  const key = root && Object.keys(root).find((k) => k.startsWith('__reactContainer$'));
  const stack = key ? [root[key]] : [];
  while (stack.length) {
    const f = stack.pop();
    if (!f) continue;
    if (f.stateNode && typeof f.stateNode.navigate === 'function' && typeof f.stateNode.refreshLiveData === 'function') return f.stateNode;
    if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
  return null;
};
`;

let ws = null; let send = null;
let offline = false;
let liveAttempts = 0; // any request at all to his live server: must stay 0
async function attach() {
  // the old session stays open until the new one is fully armed, so there
  // is never a moment with no interception and no emulation
  const old = ws;
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    page = ((await getJ('/json/list')) || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) { await getJ('/json/new?about:blank'); await sleep(250); }
  }
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let id = 0; const waiting = new Map();
  sock.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') onPaused(m.params, sendOn);
  });
  const sendOn = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; waiting.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    sock.send(JSON.stringify({ id: n, method, params }));
  });
  await sendOn('Page.enable');
  await sendOn('Runtime.enable');
  await sendOn('Network.enable');
  await sendOn('Emulation.setDeviceMetricsOverride', { width: 402, height: 874, deviceScaleFactor: 1, mobile: true });
  await sendOn('Emulation.setTouchEmulationEnabled', { enabled: true });
  await sendOn('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await sendOn('Page.addScriptToEvaluateOnNewDocument', { source: pageScript });
  await sendOn('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  ws = sock; send = sendOn;
  if (old) { try { old.close(); } catch { /* closed */ } }
}
function onPaused({ requestId, request }, via) {
  const u = new URL(request.url);
  let call;
  if (u.port === String(LIVE_PORT) || /\.ts\.net$/.test(u.hostname) || /^100\./.test(u.hostname)) {
    liveAttempts++;
    call = via('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
  } else if (u.pathname.startsWith('/api/shopping-list/reminders/sync')) {
    call = via('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); // the copy must not drive his Reminders
  } else if (offline && u.origin !== ORIGIN && u.port !== String(PROXY_PORT)) {
    call = via('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }); // fonts, CDNs
  } else {
    call = via('Fetch.continueRequest', { requestId });
  }
  call.catch(() => {});
}
const setOffline = async (off) => {
  offline = off;
  setProxy(!off);
  await send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
};
const evalJs = async (expression) => {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
      return r.result.value;
    } catch (e) {
      if (!/navigated or closed|Cannot find context|context was destroyed/i.test(e.message)) throw e;
      await sleep(1500); await attach();
    }
  }
  return { error: 'eval lost its page' };
};
const shot = async (name) => {
  if (noShots) return null;
  try {
    const r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), sleep(45000).then(() => null)]);
    if (!r) return null;
    const file = path.join(outDir, `${label}-${name}.png`);
    await writeFile(file, Buffer.from(r.data, 'base64'));
    return file;
  } catch { return null; }
};
const waitFor = async (expr, ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await evalJs(expr) === true) return true; await sleep(500); }
  return false;
};

// What a screen shows, read from the DOM: words and state, never a guess.
const READ = `(() => {
  const app = window.__findApp();
  const main = document.querySelector('main') || document.body;
  const text = (main.textContent || '').replace(/\\s+/g, ' ').trim();
  const body = (document.body.textContent || '').replace(/\\s+/g, ' ').trim();
  const s = app ? app.state : {};
  const pick = (src, re) => { const m = src.match(re); return m ? m[0].slice(0, 140) : null; };
  const pill = [...document.querySelectorAll('[role=status]')].map((n) => n.textContent.trim()).filter((t) => /unreachable/i.test(t))[0] || null;
  return {
    screen: s.screen, status: s.connectionStatus,
    mainLen: text.length, head: text.slice(0, 240),
    offlineMark: pick(body, /(offline[^.]{0,60}|can.t reach your mac|kept on this phone|waiting for your mac[^.]{0,40}|as of [0-9:apm ]+)/i),
    redPill: pill,
    spinner: pick(text, /(loading|connecting…|reading…|fetching|one moment|syncing)[^.]{0,60}/i),
    failure: pick(text, /(could not be read|couldn.t (load|read|reach)|could not (load|reach)|failed to|something went wrong|no sessions logged yet)[^.]{0,80}/i),
    demo: /DEMO DATA/.test(body),
    // the quiet mark: where it sits and whether anything covers it
    quietMark: (() => {
      const m = document.querySelector('.nv-offline-mark');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + Math.min(40, r.width / 2), r.top + r.height / 2);
      // the first piece of the page's own text below the bar: the mark must end above it
      const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
      let firstTop = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (m.contains(n) || !n.textContent.trim()) continue;
        const rr = n.parentElement.getBoundingClientRect();
        if (rr.height && rr.bottom > 44) { firstTop = Math.round(rr.top); break; }
      }
      return { text: m.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), firstContentTop: firstTop, clear: firstTop == null || firstTop >= r.bottom - 1, visible: !!hit && m.contains(hit) };
    })(),
    outbox: (s.outbox || []).map((i) => i.kind + ':' + i.status + ':' + i.label),
    errors: window.__walkErrors.slice(-5),
  };
})()`;

// What the walk's writes added to the copy, counted the same way before and
// after the replay so data already in his vault never reads as a duplicate.
const landedCounts = async () => {
  const [sessions, foodDay, shopping, journal, todos, inbox] = await Promise.all([
    copyApi('GET', '/api/workouts/sessions'), copyApi('GET', '/api/food-log'), copyApi('GET', '/api/shopping-list'),
    copyApi('GET', '/api/journal/entries?limit=40'), copyApi('GET', '/api/todos'), copyApi('GET', '/api/inbox?recent=1'),
  ]);
  const names = (list, re) => (list || []).filter((x) => new RegExp(re, 'i').test(typeof x === 'string' ? x : JSON.stringify(x))).length;
  return {
    sessions: (sessions?.sessions || []).length,
    food: names(foodDay?.entries?.map((e) => e.name), '^walktest pear$'),
    shoppingSoap: names(shopping?.items?.map((i) => i.name), '^walktest soap$'),
    shoppingFloss: names(shopping?.items?.map((i) => i.name), '^walktest floss$'),
    journal: (journal?.entries || []).flatMap((d) => d.sections || []).filter((x) => /walktest journal line/.test(x.text || '')).length,
    todo: names((todos?.items || []).map((t) => t.text || ''), '^walktest todo$'),
    capture: names((inbox?.items || []).map((r) => r.text || ''), '^walktest capture$'),
  };
};
const report = { label, style, startedAt: new Date().toISOString(), server: `copy on ${SERVER_PORT}`, phases: {} };

// ---- 2. online, once ----
await attach();
await navigateOrFail(send, APP_URL, TOOL, 30000);
await sleep(3000);
const connected = await waitFor(`(() => { const a = window.__findApp(); return !!a && a.state.connectionStatus === 'connected'; })()`, 90000);
let swCtl = await waitFor(`!!(navigator.serviceWorker && navigator.serviceWorker.controller)`, 10000);
if (!swCtl) { await send('Page.reload', {}); await sleep(5000); swCtl = await waitFor(`!!(navigator.serviceWorker && navigator.serviceWorker.controller)`, 20000); }
// the screens he would have opened on the phone before losing signal
for (const sc of ['workouts', 'recipes', 'inbox', 'mission']) { await evalJs(`window.__findApp().navigate(${JSON.stringify(sc)})`); await sleep(3000); }
// and one lift's card, as he would have looked at it before
await evalJs(`(() => { const a = window.__findApp(); const r = (a.state.liveWorkoutRoutines || [])[0]; const e = r && r.exercises[0]; if (e) a.openExerciseCard(e.name); })()`);
await sleep(6000);
await evalJs(`window.__findApp().closeExerciseCard()`);
await sleep(4000);
report.phases.online = {
  connected, serviceWorkerControlling: swCtl,
  localStorageBytes: await evalJs(`Object.keys(localStorage).reduce((n, k) => n + k.length + (localStorage.getItem(k) || '').length, 0)`),
  lastLiveInLocalStorage: await evalJs(`(localStorage.getItem('novaos.lastLive') || '').length`),
  cacheKeys: await evalJs(`caches.keys()`),
  bestsKept: await evalJs(`Object.keys(JSON.parse(localStorage.getItem('novaos.bests') || '{}')).length`),
  read: await evalJs(READ),
};
const countsBefore = await landedCounts();
report.phases.online.countsBefore = countsBefore;
console.error(`${TOOL}: online — connected=${connected} sw=${swCtl}`);

// ---- 3. network off, cold start ----
killProc(preview);
await setOffline(true);
const coldAt = Date.now();
try { await send('Page.reload', {}); } catch { /* rotates */ }
await sleep(6000);
const shellUp = await waitFor(`!!window.__findApp()`, 20000);
await waitFor(`window.__findApp().state.connectionStatus === 'offline'`, 30000);
await sleep(1500);
report.phases.coldStart = {
  shellFromServiceWorker: shellUp, ms: Date.now() - coldAt,
  onLine: await evalJs('navigator.onLine'),
  read: shellUp ? await evalJs(READ) : await evalJs(`(document.body.textContent || '').slice(0, 300)`),
  shot: await shot('cold-start'),
};
console.error(`${TOOL}: cold start offline — shell=${shellUp}`);
if (!shellUp) {
  report.verdict = 'cold start failed: no shell without network';
  await writeFile(path.join(outDir, `${label}.json`), JSON.stringify(report, null, 2));
  clearDeadline(); await cleanup(); process.exit(2);
}

// ---- 4a. screens ----
const SCREENS = ['mission', 'workouts', 'recipes', 'shopping', 'inbox', 'journal', 'todos', 'notes', 'library', 'leader', 'practice', 'money', 'voice', 'settings'];
report.phases.screens = {};
for (const sc of SCREENS) {
  await evalJs(`window.__findApp().navigate(${JSON.stringify(sc)})`);
  await waitFor(`window.__findApp().state.screen === ${JSON.stringify(sc)}`, 5000);
  await sleep(4000);
  const r = await evalJs(READ);
  r.shot = await shot(`screen-${sc}`);
  report.phases.screens[sc] = r;
  console.error(`${TOOL}: ${sc} ${r.status} len=${r.mainLen} mark=${!!r.offlineMark} quiet=${r.quietMark ? r.quietMark.visible : "-"} pill=${!!r.redPill} fail=${r.failure || '-'}`);
}
// the statistics he named: Train history, an exercise's card, the Fuel week
const SUBVIEWS = {
  trainHistory: `(() => { const a = window.__findApp(); a.navigate('workouts'); setTimeout(() => a.openWorkoutHistory(), 1500); })()`,
  routine: `(() => { const a = window.__findApp(); a.navigate('workouts'); const r = (a.state.liveWorkoutRoutines || [])[0]; setTimeout(() => r && a.openRoutine(r.id), 600); })()`,
  exerciseCard: `(() => { const a = window.__findApp(); const r = (a.state.liveWorkoutRoutines || [])[0]; const e = r && r.exercises[0]; if (e) a.openExerciseCard(e.name); })()`,
  fuelWeek: `(() => { const a = window.__findApp(); a.closeExerciseCard && a.closeExerciseCard(); a.navigate('recipes'); setTimeout(() => { const g = document.querySelector('.nv-fs-go'); const b = g && g.closest('button,[role=button],a,div'); if (b) b.click(); }, 900); })()`,
};
report.phases.subviews = {};
for (const [k, js] of Object.entries(SUBVIEWS)) {
  await evalJs(js);
  await sleep(4000);
  const r = await evalJs(READ);
  r.extra = await evalJs(`(() => { const s = window.__findApp().state; const x = s.exerciseSheet; return { history: Array.isArray(s.liveWorkoutHistory) ? s.liveWorkoutHistory.length : s.liveWorkoutHistory, sheet: x ? { loading: x.loading, error: x.error, panel: !!x.panel, asOf: x.asOf || null } : null, dialog: (document.querySelector('[role=dialog]') || {}).textContent ? document.querySelector('[role=dialog]').textContent.replace(/\\s+/g, ' ').slice(0, 200) : null }; })()`);
  r.shot = await shot(`sub-${k}`);
  report.phases.subviews[k] = r;
  console.error(`${TOOL}: sub ${k} ${JSON.stringify(r.extra).slice(0, 160)} fail=${r.failure || '-'}`);
}
await evalJs(`(() => { const a = window.__findApp(); a.closeExerciseCard && a.closeExerciseCard(); history.back(); })()`);
await sleep(1500);

// ---- 4b. writes ----
report.phases.writes = {};
const act = async (name, js, settle = 3000) => {
  const before = await evalJs(`(window.__findApp().state.outbox || []).length`);
  const ret = await evalJs(js);
  await sleep(settle);
  const r = await evalJs(READ);
  r.returned = ret;
  r.outboxDelta = (r.outbox?.length || 0) - (before || 0);
  r.shot = await shot(`act-${name}`);
  report.phases.writes[name] = r;
  console.error(`${TOOL}: write ${name} outbox+${r.outboxDelta} ${typeof ret === 'string' ? ret.slice(0, 80) : ''}`);
  return r;
};
const visible = (re) => `new RegExp(${JSON.stringify(re)}, 'i').test((document.querySelector('main') || document.body).textContent)`;
await evalJs(`window.__findApp().navigate('workouts')`);
await sleep(2000);
await act('startWorkout', `(() => { const a = window.__findApp(); if (a.state.workoutSession) return 'a session was already open'; const r = (a.state.liveWorkoutRoutines || [])[0]; if (!r) return 'no routines cached'; a.startWorkoutSession(r); return r.name + ' · ' + r.exercises.length + ' lifts'; })()`);
await act('logTwoSets', `(() => { const a = window.__findApp(); const ws = a.state.workoutSession; if (!ws) return 'no session'; a.updateSessionSet(0, 0, 'done', true); a.updateSessionSet(0, 1, 'done', true); const e = ws.exercises[0]; return e.name + ' prefill ' + JSON.stringify(e.sets.slice(0, 2).map((s) => [s.weight, s.reps])) + ' best known=' + (JSON.parse(localStorage.getItem('novaos.bests') || '{}')[e.exerciseId] ? 'yes' : 'no'); })()`, 1500);
await act('finishWorkout', `(() => { window.__findApp().finishWorkoutSession(); return 'finish called'; })()`, 5000);
report.phases.writes.finishWorkout.after = await evalJs(`(() => { const s = window.__findApp().state; return { sessionOpen: !!s.workoutSession, view: s.workoutsView, missed: s.finishMissed ? s.finishMissed.length : null }; })()`);
await evalJs(`window.__findApp().navigate('recipes')`);
await sleep(2000);
await act('logFood', `(() => { const a = window.__findApp(); a.setState({ foodLogName: 'walktest pear', foodLogP: '1', foodLogC: '25', foodLogF: '0', foodLogKcal: '104' }); return new Promise((r) => setTimeout(() => { a.submitFoodLog(); r('submitted'); }, 300)); })()`);
report.phases.writes.logFood.visible = await evalJs(visible('walktest pear'));
await act('addShopping', `(() => { const a = window.__findApp(); a.navigate('shopping'); a.setState({ shoppingAddInput: 'walktest soap' }); return new Promise((r) => setTimeout(() => { a.submitShoppingAdd(); r('submitted'); }, 600)); })()`);
report.phases.writes.addShopping.visible = await evalJs(visible('walktest soap'));
await act('addShoppingGeneric', `(() => { const a = window.__findApp(); a.addToShoppingList(['walktest floss'], null); return 'generic add'; })()`);
report.phases.writes.addShoppingGeneric.visible = await evalJs(visible('walktest floss'));
await act('capture', `(() => { const a = window.__findApp(); a.navigate('inbox'); return new Promise((r) => setTimeout(() => { a.captureToInbox('walktest capture'); r('captured'); }, 600)); })()`);
report.phases.writes.capture.visible = await evalJs(visible('walktest capture'));
await act('journal', `(() => { const a = window.__findApp(); a.navigate('journal'); a.setState({ journalComposerText: 'walktest journal line' }); return new Promise((r) => setTimeout(() => { a.submitJournalEntry(); r('submitted'); }, 600)); })()`);
report.phases.writes.journal.visible = await evalJs(visible('walktest journal line'));
await act('todo', `(() => { const a = window.__findApp(); a.navigate('todos'); return new Promise((r) => setTimeout(() => { a.addTodoItem('walktest todo'); r('added'); }, 600)); })()`);
report.phases.writes.todo.visible = await evalJs(visible('walktest todo'));
// an AI feature with no Mac: the Coach (text, no voice)
await act('askCoach', `(() => { const a = window.__findApp(); a.navigate('workouts'); return new Promise((r) => setTimeout(() => { if (a.doCoach) { a.doCoach('offline walk: what next?'); r('asked'); } else r('no doCoach'); }, 600)); })()`, 5000);
report.phases.writes.askCoach.coach = await evalJs(`(() => { const s = window.__findApp().state; const last = (s.coachChat || []).slice(-1)[0]; return { busy: s.coachBusy, said: last ? last.who + ': ' + String(last.text).slice(0, 160) : null }; })()`);

// ---- 5. killed and reopened, still offline ----
try { await send('Page.reload', {}); } catch { /* rotates */ }
await sleep(6000);
const reopened = await waitFor(`!!window.__findApp()`, 20000);
await waitFor(`window.__findApp().state.connectionStatus === 'offline'`, 30000);
report.phases.reopen = {
  shell: reopened,
  persistedOutbox: await evalJs(`JSON.parse(localStorage.getItem('novaos.outbox') || '[]').map((i) => i.kind + ':' + i.label)`),
};
for (const [sc, re] of [['recipes', 'walktest pear'], ['shopping', 'walktest soap'], ['inbox', 'walktest capture'], ['workouts', 'Offline|waiting'], ['mission', 'Offline']]) {
  await evalJs(`window.__findApp().navigate(${JSON.stringify(sc)})`);
  await sleep(3000);
  const r = await evalJs(READ);
  r.queuedVisible = await evalJs(visible(re));
  r.waitingMarks = await evalJs(`((document.querySelector('main') || document.body).textContent.match(/waiting for your mac/gi) || []).length`);
  r.shot = await shot(`reopen-${sc}`);
  report.phases.reopen[sc] = r;
}

// ---- 6. the Mac comes back: the Outbox replays into the COPY ----
const queuedBefore = await evalJs(`(window.__findApp().state.outbox || []).length`);
await setOffline(false);
await sleep(2000);
await evalJs(`window.__findApp().refreshLiveData()`);
await waitFor(`(window.__findApp().state.outbox || []).filter((i) => i.status === 'queued').length === 0`, 60000);
await sleep(3000);
const after = await landedCounts();
const landed = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - (countsBefore[k] || 0)]));
report.phases.replay = {
  queuedBefore,
  left: await evalJs(`(window.__findApp().state.outbox || []).map((i) => i.kind + ':' + i.status + ':' + (i.error || ''))`),
  // what each write added to the copy: 1 is right, 0 is lost, 2 is a duplicate
  landed,
  read: await evalJs(READ),
};
console.error(`${TOOL}: replay ${JSON.stringify(landed)}`);

report.liveServerAttempts = liveAttempts;
report.finishedAt = new Date().toISOString();
const file = path.join(outDir, `${label}.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.log(file);
if (liveAttempts) console.error(`${TOOL}: ${liveAttempts} request(s) aimed at the live server were stopped`);
clearDeadline();
await cleanup();
process.exit(liveAttempts ? 3 : 0);
