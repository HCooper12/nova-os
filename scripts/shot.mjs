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
// Two extra modes, for the two honest ways to point this at data:
//   --demo      photograph DEMO data ON PURPOSE (fixtures, headless, CI-like
//               runs) — no public/_devconn.js required, and one present is
//               overridden (an injected removeItem always wins). Takes
//               --style/--theme/--material/--hour to pin the exact look.
//   --readonly  photograph his REAL vault without writing to it. Loading the
//               app live is otherwise a WRITE (see the comment in probe.mjs:
//               Home briefs into the spoken log, jobs get posted) — this
//               fails every non-GET request at the CDP layer and disables
//               sendBeacon. Still requires public/_devconn.js, same as a
//               plain shot.
//
//   node scripts/dev-connect.mjs                       # once, seeds public/_devconn.js
//   node scripts/shot.mjs --out /tmp/train.png \
//        --eval "window.__novaApp.navigate('workouts')" --wait 2500
//   node scripts/shot.mjs --url 'http://localhost:5183/nova-os/tools/motion/harness.html?frames=1&per=6&size=220' --out /tmp/sheet.png
//   node scripts/shot.mjs --demo --style summary --theme sky --material glass --hour dusk --out /tmp/demo.png
//   node scripts/shot.mjs --readonly --out /tmp/live.png
//
// Flags: --url (default the app on :5183) --out --eval (JS run after load,
// may be repeated) --wait ms (after the last eval) --width --height --dpr
// --port (dev server, when --url is omitted) --nomobile
// --demo --readonly
// --style <command|apple|cupertino|summary> --theme <command|observatory|
// ember|daylight|sky> --material <glass|solid> --hour <dawn|day|dusk|night|
// HH:MM> — stamp the app's look/clock before its own scripts run, the same
// addScriptToEvaluateOnNewDocument mechanism the seed already uses.
//
// SHOT_ALLOW_NOSEED=1 (env, TEST-ONLY): lets --readonly run without
// public/_devconn.js, so its interception can be proven against a stand-in
// server instead of his real one. Never use it to check the real, positive
// --readonly path — that needs an actual seed.
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
const demo = argv.includes('--demo');
const readonly = argv.includes('--readonly');
const styleArg = opt('style', null);
const themeArg = opt('theme', null);
const materialArg = opt('material', null);
const hourArg = opt('hour', null);

const STYLE_VALUES = ['command', 'apple', 'cupertino', 'summary'];
const THEME_VALUES = ['command', 'observatory', 'ember', 'daylight', 'sky'];
const MATERIAL_VALUES = ['glass', 'solid'];
const HOUR_BANDS = { dawn: [6, 30], day: [12, 0], dusk: [18, 30], night: [22, 30] };

function fail(msg) { console.error(`shot: ${msg}`); process.exit(1); }
if (styleArg && !STYLE_VALUES.includes(styleArg)) fail(`--style must be one of ${STYLE_VALUES.join('|')}`);
if (themeArg && !THEME_VALUES.includes(themeArg)) fail(`--theme must be one of ${THEME_VALUES.join('|')}`);
if (materialArg && !MATERIAL_VALUES.includes(materialArg)) fail(`--material must be one of ${MATERIAL_VALUES.join('|')}`);
let hourSpec = null;
if (hourArg) {
  if (HOUR_BANDS[hourArg]) {
    hourSpec = HOUR_BANDS[hourArg];
  } else {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hourArg);
    const hh = m ? Number(m[1]) : NaN;
    const mm = m ? Number(m[2]) : NaN;
    if (!m || hh > 23 || mm > 59) fail(`--hour must be dawn|day|dusk|night or HH:MM, got "${hourArg}"`);
    hourSpec = [hh, mm];
  }
}
// Printed as soon as the flag is known, not just on success — a transcript
// that dies mid-run should still never be mistaken for a look at his vault.
if (demo) console.error('shot: DEMO DATA');

// Kept free of backticks: each becomes a plain string embedded inside the
// combined page script below, itself built with normal string ops (no outer
// template literal to break out of).
function frozenClockScript(hh, mm) {
  return `(function () {
  var d = new Date();
  var FROZEN_MS = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ${hh}, ${mm}, 0, 0).getTime();
  var RealDate = Date;
  function GuardDate(...args) {
    if (args.length === 0) return new RealDate(FROZEN_MS);
    return new RealDate(...args);
  }
  GuardDate.prototype = RealDate.prototype;
  GuardDate.now = function () { return FROZEN_MS; };
  GuardDate.parse = RealDate.parse.bind(RealDate);
  GuardDate.UTC = RealDate.UTC.bind(RealDate);
  window.Date = GuardDate;
})();`;
}
function sendBeaconBlockScript() {
  return `(function () {
  try {
    navigator.sendBeacon = function () { console.warn('shot: sendBeacon blocked (readonly)'); return false; };
  } catch (e) { /* best-effort */ }
})();`;
}

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

let ws = null; let send = null; let pageScript = null;
// --readonly bookkeeping: how many writes got stopped, and whether the
// interception ever actually saw traffic (a screenshot taken over a Fetch
// domain that silently never engaged would look identical to a real one).
let blockedWrites = 0;
let sawFetchPaused = false;
function handleFetchPaused(params) {
  sawFetchPaused = true;
  const { requestId, request } = params;
  const allowed = request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS';
  if (!allowed) {
    blockedWrites++;
    console.error(`shot: blocked ${request.method} ${request.url}`);
  }
  const call = allowed
    ? send('Fetch.continueRequest', { requestId })
    : send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
  // The page target can rotate mid-flight (the same reattachment race the
  // seed already lives with below) — a request that loses its session by
  // then is not worth failing the whole shot over.
  call.catch(() => {});
}
function handleConsoleAPI(params) {
  const args = (params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type)));
  console.error(`shot: console.${params.type}`, ...args);
}

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
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') { handleFetchPaused(m.params); return; }
    if (m.method === 'Runtime.consoleAPICalled') { handleConsoleAPI(m.params); return; }
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; waiting.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable'); // so Runtime.consoleAPICalled actually fires — see handleConsoleAPI
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  // Registered before every navigation this session ever does, same as the
  // seed below — a session that reattached mid-flight without it would let
  // one write through before the interception came back up.
  if (readonly) await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  // THE SEED IS PER SESSION (25 Sep 2026, paid for). A script registered with
  // addScriptToEvaluateOnNewDocument belongs to the CDP session that added it
  // and goes when that session closes. This script re-attaches after the
  // navigation, and the app reloads itself once after the connection lands:
  // when that reload came after the re-attach, the page booted with the
  // connection (it is in localStorage) but WITHOUT the seed's write guard,
  // and a POST reached his server. So every session registers it again —
  // pageScript now carries the seed PLUS whatever --demo/--style/--readonly
  // asked for, always in that order, so a demo removeItem always runs after
  // any setItem that put a connection there.
  if (pageScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: pageScript });
}
await attach();
// the connection, seeded before the app's first script runs — the token stays
// inside the file dev-connect.mjs wrote and is never printed
const seed = await readFile(path.join(ROOT, 'public', '_devconn.js'), 'utf8').catch(() => '');
const haveSeed = Boolean(seed);
const REFUSAL = 'no public/_devconn.js — run `node scripts/dev-connect.mjs` first, or this photographs DEMO DATA (or pass --demo to photograph demo data on purpose, or --readonly against a seeded connection)';
// TEST-ONLY (documented above): proves --readonly's interception against a
// stand-in server without any real connection anywhere near it. Never
// bypasses the plain no-flags refusal on its own.
const testBypass = readonly && process.env.SHOT_ALLOW_NOSEED === '1';
if (readonly && !haveSeed && !testBypass) {
  console.error(REFUSAL);
  await cleanup(); process.exit(1);
}
if (!haveSeed && !demo && !testBypass) {
  // A shot of the demo fixtures looks exactly like a shot of his app, and
  // every conclusion drawn from it is wrong. The probe learned this first.
  console.error(REFUSAL);
  await cleanup(); process.exit(1);
}

const scriptParts = [];
if (seed) scriptParts.push(seed);
if (demo) scriptParts.push("localStorage.removeItem('novaos.connection');");
if (styleArg) scriptParts.push(`localStorage.setItem('novaos.style', ${JSON.stringify(styleArg)});`);
if (themeArg) scriptParts.push(`localStorage.setItem('novaos.theme', ${JSON.stringify(themeArg)});`);
if (materialArg) scriptParts.push(`localStorage.setItem('novaos.material', ${JSON.stringify(materialArg)});`);
if (hourSpec) scriptParts.push(frozenClockScript(hourSpec[0], hourSpec[1]));
if (readonly) scriptParts.push(sendBeaconBlockScript());
pageScript = scriptParts.length ? scriptParts.join('\n') : null;
if (pageScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: pageScript });
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
if (readonly) {
  if (!sawFetchPaused) {
    console.error('shot: readonly interception never engaged — refusing to trust the shot');
    ws.close();
    await cleanup();
    process.exit(3);
  }
  console.error(`shot: readonly — blocked ${blockedWrites} write(s)`);
}
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
