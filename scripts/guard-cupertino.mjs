#!/usr/bin/env node
// PROVE HOME HASN'T MOVED, before a second style goes in beside it.
//
// Boots its own Vite, drives a private headless Chrome exactly like
// shot.mjs (own profile, SwiftShader, CDP over its own WebSocket), and
// reads back <main>'s rendered text, pane count and scroll geometry off
// the cupertino/command Home screen — a screenshot misses a word that
// changed meaning and flags one that moved 2px, so this reads the DOM.
//
// REFUSES to run if public/_devconn*.js exists: that file puts a real
// connection in localStorage, and loading Home live is a WRITE (probe.mjs
// carries the same warning) — so this only ever measures DEMO data, with
// the clock frozen at 2026-09-26T14:00 local so the hour-dependent section
// order and every rendered time string are identical on every run.
//
//   node scripts/guard-cupertino.mjs --record   # once, writes the baseline
//   node scripts/guard-cupertino.mjs            # compare; exit 1 on drift
//   node scripts/guard-cupertino.mjs --screen inbox [--record]   # any other screen
//
// --screen guards a page other than Home (27 Sep 2026: the Inbox, Train and
// Fuel redesigns each land beside a cupertino page that must not move).
// Demo mode shows less of those pages than his vault does, so the snapshot
// is a floor, not the whole page; the baseline file carries the screen key.
import { spawn } from 'node:child_process';
import { mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GUARD_DIR = path.join(ROOT, 'scripts', 'guard');
const rel = (p) => path.relative(ROOT, p);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const record = argv.includes('--record');
const style = opt('style', 'cupertino');
const theme = opt('theme', 'command');
const screen = opt('screen', 'mission');
const PORT = 5191;
const APP_URL = `http://localhost:${PORT}/nova-os/#/${screen}`;

const baselineName = (style === 'cupertino' && theme === 'command' && screen === 'mission')
  ? 'cupertino-baseline.json'
  : `${style}-${theme}${screen === 'mission' ? '' : `-${screen}`}-baseline.json`;
const baselinePath = path.join(GUARD_DIR, baselineName);
const recordHint = (style === 'cupertino' && theme === 'command')
  ? 'node scripts/guard-cupertino.mjs --record'
  : `node scripts/guard-cupertino.mjs --record --style ${style} --theme ${theme}${screen === 'mission' ? '' : ` --screen ${screen}`}`;

// exit-code convention: 0 = unchanged, 1 = a real drift was measured,
// 2 = the guard could not run at all (bad precondition, not a verdict)
function guardError(message, exitCode = 2) {
  const e = new Error(message);
  e.guardExit = exitCode;
  return e;
}

// Registered with Page.addScriptToEvaluateOnNewDocument, so every line here
// runs before Vite's client, React, or a single line of App.jsx. Three jobs:
// seed the style/theme the app reads at boot, freeze "now", and freeze the
// one RNG call that survives a frozen clock (see below).
const SEED_SOURCE = `
localStorage.clear();
localStorage.setItem('novaos.style', ${JSON.stringify(style)});
localStorage.setItem('novaos.theme', ${JSON.stringify(theme)});
(function () {
  // MissionStructured picks its section order from new Date().getHours()
  // (ORDERS.morning/day/evening) and half a dozen view-model builders stamp
  // a clock or a greeting off new Date() too — freeze the one thing they
  // all read and every one of them stops moving. new Date(x) with an
  // argument is left alone so real date parsing still works.
  var FROZEN_MS = new Date(2026, 8, 26, 14, 0, 0, 0).getTime();
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
})();
(function () {
  // App.jsx's componentDidMount does
  // this.setState({ reviewIdx: Math.floor(Math.random() * this.reviews.length) })
  // UNCONDITIONALLY on every boot, and in demo mode that index picks which
  // scripted concept text valsNotes.js puts in the "review" section of Home
  // (reviewConcept / reviewFrom). A frozen clock does not touch this — it is
  // the one other source of run-to-run drift in demo Home, so it gets the
  // same fixed-seed treatment: a small deterministic PRNG in place of
  // Math.random, seeded the same way every run.
  var seed = 1653650781;
  Math.random = function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
`;
if (SEED_SOURCE.includes('`')) throw guardError('guard: SEED_SOURCE contains a backtick — it would break the template literal it is embedded in', 2);

const READY_EXPR = `(() => {
  const main = document.querySelector('main');
  return !!(window.__novaApp && main && main.innerText && main.innerText.trim().length > 0);
})()`;

const ANIM_RUNNING_EXPR = `(() => {
  try {
    return document.getAnimations().filter((a) => {
      const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
      return timing && timing.iterations !== Infinity && a.playState === 'running';
    }).length;
  } catch (e) {
    return 0;
  }
})()`;

// text is innerText (layout-aware, so it carries the same line breaks a
// person reading the screen would see) with each line's internal
// whitespace collapsed and trimmed, and empty lines (mostly incidental
// block-margin gaps) dropped — normalised enough to be stable, still one
// line per rendered row so a real change shows up as one changed line in
// the diff rather than a wall of text.
const SNAPSHOT_EXPR = `(() => {
  const main = document.querySelector('main');
  const raw = main ? main.innerText : '';
  const text = raw
    .split('\\n')
    .map((line) => line.replace(/[ \\t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\\n');
  const app = window.__novaApp;
  const demoMode = !!(app && app.state && app.state.connectionStatus === 'demo');
  return JSON.stringify({
    demoMode,
    style: document.documentElement.getAttribute('data-nv-style'),
    theme: document.documentElement.getAttribute('data-nv-theme'),
    text,
    panes: document.querySelectorAll('main .nv-pane').length,
    scrollHeight: main ? main.scrollHeight : 0,
    scrollWidth: main ? main.scrollWidth : 0,
    clientWidth: main ? main.clientWidth : 0,
  });
})()`;
if (SNAPSHOT_EXPR.includes('`')) throw guardError('guard: SNAPSHOT_EXPR contains a backtick — it would break the template literal it is embedded in', 2);

// ---------- a minimal line-diff, for when the compare fails ----------
function diffLines(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) { ops.push({ t: ' ', l: oldLines[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', l: oldLines[i] }); i++; }
    else { ops.push({ t: '+', l: newLines[j] }); j++; }
  }
  while (i < n) { ops.push({ t: '-', l: oldLines[i] }); i++; }
  while (j < m) { ops.push({ t: '+', l: newLines[j] }); j++; }
  return ops;
}
function renderDiff(ops, context = 2) {
  const out = [];
  let run = [];
  const flushRun = () => {
    if (!run.length) return;
    if (run.length > context * 2) {
      for (const o of run.slice(0, context)) out.push(`  ${o.l}`);
      out.push(`  … ${run.length - context * 2} unchanged line(s) …`);
      for (const o of run.slice(-context)) out.push(`  ${o.l}`);
    } else {
      for (const o of run) out.push(`  ${o.l}`);
    }
    run = [];
  };
  for (const op of ops) {
    if (op.t === ' ') { run.push(op); } else { flushRun(); out.push(`${op.t} ${op.l}`); }
  }
  flushRun();
  return out.join('\n');
}

// ---------- process lifecycle ----------
let viteProc = null;
let chromeProc = null;
let profile = null;
let ws = null;

async function cleanup() {
  if (ws) { try { ws.close(); } catch { /* already closed */ } }
  if (chromeProc) { try { chromeProc.kill(); } catch { /* already gone */ } }
  await sleep(400);
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  if (viteProc) {
    try { process.kill(-viteProc.pid, 'SIGTERM'); } catch { try { viteProc.kill('SIGTERM'); } catch { /* already gone */ } }
    await sleep(300);
    try { process.kill(-viteProc.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}
process.on('uncaughtException', async (e) => {
  console.error('guard:', e.message);
  await cleanup();
  process.exit(typeof e.guardExit === 'number' ? e.guardExit : 1);
});

async function startVite() {
  if (!existsSync(CHROME)) throw guardError(`guard: Chrome not found at ${CHROME} — install it or update the path`, 2);
  viteProc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let buf = '';
  const ready = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      buf += chunk.toString();
      if (/ready in|Local:/i.test(buf)) resolve();
    };
    viteProc.stdout.on('data', onData);
    viteProc.stderr.on('data', onData);
    viteProc.on('exit', (code) => reject(guardError(`guard: vite exited before it was ready (code ${code}):\n${buf}`, 2)));
    viteProc.on('error', (e) => reject(guardError(`guard: could not start vite — ${e.message}`, 2)));
  });
  const timeout = sleep(60000).then(() => { throw guardError(`guard: vite did not become ready on :${PORT} within 60s — output so far:\n${buf}`, 2); });
  await Promise.race([ready, timeout]);
}

let debugPort = null;
const cdpBase = () => `http://127.0.0.1:${debugPort}`;
const get = async (p) => { try { const r = await fetch(cdpBase() + p); return r.ok ? await r.json() : null; } catch { return null; } };

async function launchChrome() {
  debugPort = 9600 + Math.floor(Math.random() * 90);
  profile = path.join(os.tmpdir(), `nova-guard-profile-${process.pid}`);
  await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });
  chromeProc = spawn(CHROME, [
    `--user-data-dir=${profile}`,
    '--headless=new', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    '--window-size=402,874', 'about:blank',
  ], { stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 80 && !up; i++) { up = Boolean(await get('/json/version')); if (!up) await sleep(250); }
  if (!up) throw guardError(`guard: Chrome never answered on ${debugPort}`, 2);
}

let send = null;
// Re-attach after any navigation the same way shot.mjs / probe.mjs do: a CDP
// session's addScriptToEvaluateOnNewDocument registration is per-session, so
// this re-registers SEED_SOURCE on every attach in case the target ever
// changes under us — belt and suspenders, since demo mode (unlike the
// dev-connection flow those scripts guard against) never reloads itself.
async function attach() {
  if (ws) { try { ws.close(); } catch { /* already closed */ } }
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    page = ((await get('/json/list')) || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) { await get('/json/new?about:blank'); await sleep(250); }
  }
  if (!page) throw guardError('guard: no Chrome page target to attach to', 2);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SOURCE });
}

const evaluate = async (expression) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
      return { value: r.result.value };
    } catch (e) {
      if (!/navigated or closed/.test(e.message) || attempt) throw e;
      await sleep(1200);
      await attach();
    }
  }
  return {};
};

// ---------- main ----------
let exitCode = 0;
try {
  // 1. refuse if a dev connection is seeded — a load with one would write
  // to his real vault, and this guard must never do that.
  const publicFiles = await readdir(path.join(ROOT, 'public')).catch(() => []);
  if (publicFiles.some((f) => /^_devconn.*\.js$/.test(f))) {
    console.error('guard: public/_devconn*.js is present — this would load his real vault; delete it (node scripts/dev-connect.mjs --clean) and re-run');
    exitCode = 2;
    throw guardError('__handled__', 2);
  }

  await startVite();
  await launchChrome();
  await attach();
  await send('Page.navigate', { url: APP_URL });

  let readyOk = false;
  for (let i = 0; i < 60 && !readyOk; i++) {
    let r;
    try { r = await evaluate(READY_EXPR); } catch { r = {}; }
    readyOk = r.value === true;
    if (!readyOk) await sleep(300);
  }
  if (!readyOk) throw guardError('guard: window.__novaApp / main never had content within 18s', 2);

  for (let i = 0; i < 40; i++) {
    let r;
    try { r = await evaluate(ANIM_RUNNING_EXPR); } catch { r = {}; }
    if (r.value === 0 || r.error) break;
    await sleep(200);
  }
  await sleep(400);

  const snapRes = await evaluate(SNAPSHOT_EXPR);
  if (snapRes.error) throw guardError(`guard: could not read the snapshot — ${snapRes.error}`, 2);
  const snapshot = JSON.parse(snapRes.value);

  if (!snapshot.demoMode) {
    // src/App.jsx never actually assigns this.state.demoMode (every read of
    // it, e.g. attachRunningPlan/maybeMorningBrief, is dead code — it is
    // always undefined) — the real backing field, and what
    // renderVals() computes ctx.demoMode from, is connectionStatus
    // (src/App.jsx:6912). SNAPSHOT_EXPR reads that truthfully instead.
    // Step 1 above is still what actually stops a real-vault load; this is
    // a second, independent confirmation that the app agrees with itself.
    console.error('guard: app did not report demo mode (connectionStatus !== "demo") — refusing to trust this as a demo snapshot');
    exitCode = 2;
  } else if (record) {
    await mkdir(GUARD_DIR, { recursive: true });
    const baseline = {
      recordedAt: new Date().toISOString(),
      frozenClock: '2026-09-26T14:00:00 (local)',
      requestedStyle: style,
      requestedTheme: theme,
      style: snapshot.style,
      theme: snapshot.theme,
      text: snapshot.text,
      panes: snapshot.panes,
      scrollHeight: snapshot.scrollHeight,
      scrollWidth: snapshot.scrollWidth,
      clientWidth: snapshot.clientWidth,
    };
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`guard: recorded ${rel(baselinePath)} — ${baseline.panes} panes, ${baseline.scrollHeight} px, ${baseline.text.length} chars of text`);
  } else {
    const baselineRaw = await readFile(baselinePath, 'utf8').catch(() => null);
    if (!baselineRaw) {
      console.error(`guard: no baseline at ${rel(baselinePath)} — record one first: \`${recordHint}\``);
      exitCode = 2;
    } else {
      const baseline = JSON.parse(baselineRaw);
      const textMatch = baseline.text === snapshot.text;
      const panesMatch = baseline.panes === snapshot.panes;
      const widthMatch = baseline.scrollWidth === snapshot.scrollWidth;
      const heightDelta = snapshot.scrollHeight - baseline.scrollHeight;
      const heightMatch = Math.abs(heightDelta) <= 24;
      if (textMatch && panesMatch && widthMatch && heightMatch) {
        console.log(`guard: ${style} ${screen === 'mission' ? 'Home' : screen} unchanged (${snapshot.panes} panes, ${snapshot.scrollHeight} px)`);
      } else {
        console.error(`guard: ${style} ${screen === 'mission' ? 'Home' : screen} CHANGED`);
        if (!textMatch) {
          console.error(renderDiff(diffLines(baseline.text.split('\n'), snapshot.text.split('\n'))));
        }
        console.error(`panes:        ${baseline.panes} \u2192 ${snapshot.panes}${panesMatch ? '' : '  CHANGED'}`);
        console.error(`scrollWidth:  ${baseline.scrollWidth} \u2192 ${snapshot.scrollWidth}${widthMatch ? '' : '  CHANGED'}`);
        console.error(`scrollHeight: ${baseline.scrollHeight} \u2192 ${snapshot.scrollHeight}  (\u0394${heightDelta}px)${heightMatch ? '' : '  CHANGED beyond \u00b124px'}`);
        exitCode = 1;
      }
    }
  }
} catch (e) {
  if (e.message !== '__handled__') {
    console.error('guard:', e.message);
    exitCode = typeof e.guardExit === 'number' ? e.guardExit : 1;
  }
} finally {
  await cleanup();
}
process.exit(exitCode);
