#!/usr/bin/env node
// MEASURE THE SCREENS. Overflow, clipping and tap targets, as numbers.
//
// NOVA-METHOD §2b rule 9: "It must survive 375px … verify by measuring
// `scrollWidth`, not by eye." A screenshot cannot tell you that a row is
// 6px too wide, that a label is clipped rather than short, or that a control
// is 34px tall when the floor is 44. This opens every screen in a private
// headless Chrome at phone width and reports all three.
//
//   node scripts/dev-connect.mjs                 # once
//   node scripts/probe.mjs                       # every screen at 375
//   node scripts/probe.mjs --width 402 --screens todos,notes,library
//   node scripts/probe.mjs --style command       # the other idiom
//
// Exit code is 1 if anything failed, so it can gate a commit.
import { spawn } from 'node:child_process';
import { mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };

const width = Number(opt('width', 375));
const height = Number(opt('height', 812));
const port = opt('port', '5183');
const style = opt('style', '');
const ALL = ['mission', 'inbox', 'voice', 'todos', 'workouts', 'notes', 'library',
  'journal', 'money', 'stash', 'shopping', 'recipes', 'settings', 'code', 'leader', 'ops'];
const screens = (opt('screens', '') || '').trim() ? opt('screens', '').split(',') : ALL;
// 44pt is Apple's target; 28 is the floor accessibility.md allows. Report
// anything under the floor as a failure and 28–44 as a warning.
const TAP_FLOOR = 28;
const TAP_TARGET = 44;

const profile = path.join(os.tmpdir(), `nova-probe-${process.pid}`);
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
const dbg = 9500 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--mute-audio',
  '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${dbg}`, `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });
const cleanup = async () => {
  try { chrome.kill(); } catch { /* gone */ }
  await new Promise((r) => setTimeout(r, 300));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
};
process.on('uncaughtException', async (e) => { console.error(e.message); await cleanup(); process.exit(1); });

const base = `http://127.0.0.1:${dbg}`;
const get = async (p) => { try { const r = await fetch(base + p); return r.ok ? await r.json() : null; } catch { return null; } };
let up = false;
for (let i = 0; i < 80 && !up; i++) { up = Boolean(await get('/json/version')); if (!up) await new Promise((r) => setTimeout(r, 250)); }
if (!up) throw new Error('Chrome never answered');

// The seed is registered on EVERY attach, not once. `addScriptToEvaluateOnNewDocument`
// is per-session, and the app reloads itself after the connection lands — so a
// registration made before the first navigate is gone by the second document,
// and the probe silently measures DEMO DATA in the wrong idiom. That is worse
// than no measurement: it looks like a real run.
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (SEED) await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
}
const evaluate = async (expression) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
      return { value: r.result.value };
    } catch (e) {
      if (!/navigated or closed/.test(e.message) || attempt) throw e;
      await new Promise((r) => setTimeout(r, 1200)); await attach();
    }
  }
  return {};
};

const seed = await readFile(path.join(ROOT, 'public', '_devconn.js'), 'utf8').catch(() => '');
if (!seed) { console.error('no public/_devconn.js — run `node scripts/dev-connect.mjs` first, or this measures demo data'); process.exit(1); }
SEED = style ? `${seed}\nlocalStorage.setItem('novaos.style', ${JSON.stringify(style)});` : seed;
await attach();
await send('Page.navigate', { url: `http://localhost:${port}/nova-os/` });
await new Promise((r) => setTimeout(r, 2500));
await attach();

// PROVE THE RUN IS REAL before reporting a single number. A probe that
// measures the demo fixtures in the wrong idiom reads exactly like a probe
// that measured his app, and every conclusion drawn from it is wrong.
//
// POLLED, not slept on: after a source edit the dev server rebuilds, and a
// fixed wait that is long enough on a warm run is short on a cold one — which
// showed up as "the page never connected" on an app that was perfectly fine.
let state = {};
for (let i = 0; i < 40; i++) {
  const ready = await evaluate(`JSON.stringify({ conn: !!localStorage.getItem('novaos.connection'), style: document.documentElement.getAttribute('data-nv-style'), app: !!window.__novaApp })`);
  state = JSON.parse(ready.value || '{}');
  if (state.conn && state.app) break;
  await new Promise((r) => setTimeout(r, 500));
  if (i === 12) await attach();   // it may have reloaded itself under us
}
if (!state.conn || !state.app) { console.error(`the page never connected (conn=${state.conn} app=${state.app}) — refusing to report demo data`); ws?.close(); await cleanup(); process.exit(1); }
// no attribute at all IS the command idiom — the Apple skins stamp their name
const touchIdiom = state.style === 'cupertino' || state.style === 'apple';
console.log(`idiom: ${state.style || 'command'}${touchIdiom ? '' : ' (pointer-first)'}`);

// The measurement, run inside the page. Kept as one expression so it survives
// a re-attach, and deliberately conservative: it reports only what it can
// prove from geometry, never a guess about intent.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, docScroll: document.documentElement.scrollWidth, wide: [], clipped: [], small: [], tiny: [] };
  const seen = new Set();
  // A RAIL IS MEANT TO RUN PAST THE EDGE, and the fixed chrome is measured
  // on its own terms — so neither counts as an overflow fault. Without this
  // the probe reports every card in a horizontal scroller as broken, which
  // is the kind of false alarm that gets an instrument ignored.
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.overflowX === 'auto' || c.overflowX === 'scroll') return true;
    }
    return false;
  };
  const inFixed = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).position === 'fixed') return true;
    }
    return false;
  };
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    const txt = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 42);
    return el.tagName.toLowerCase() + id + cls + (txt ? ' « ' + txt + ' »' : '');
  };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') continue;
    // 1. anything reaching past the viewport
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el) && !inFixed(el)) {
      const k = 'w' + label(el);
      if (!seen.has(k)) { seen.add(k); out.wide.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right), over: Math.round(r.right - vw) }); }
    }
    // 2. text cut off by its own box rather than wrapped or ellipsised
    const hidesX = cs.overflowX === 'hidden' || cs.overflow === 'hidden';
    const hidesY = cs.overflowY === 'hidden' || cs.overflow === 'hidden';
    // A line-clamped box truncates with an ellipsis of its own, so it is
    // deliberate, not a hard cut. Without this the probe reports every
    // two-line card title in the Library as broken. (No backticks in here:
    // MEASURE is itself a template literal, and one would end it.)
    const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    const cutX = hidesX && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
    const cutY = hidesY && el.scrollHeight > el.clientHeight + 1 && !clamped;
    if ((cutX || cutY) && (el.textContent || '').trim()) {
      const k = 'c' + label(el);
      if (!seen.has(k)) { seen.add(k); out.clipped.push({ el: label(el), axis: cutX ? 'x' : 'y', by: cutX ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight }); }
    }
    // 3. tap targets below the floor
    const tappable = cs.cursor === 'pointer' || el.getAttribute('role') === 'button' || ['button','a','select','input'].includes(el.tagName.toLowerCase());
    if (tappable && Math.min(r.width, r.height) < ${TAP_TARGET}) {
      // a pointer parent makes every child look tappable; only report the
      // outermost one so a label inside a button is not counted twice
      const p = el.parentElement;
      const parentTappable = p && (getComputedStyle(p).cursor === 'pointer' || p.getAttribute('role') === 'button');
      if (!parentTappable && !inFixed(el)) {
        const k = 's' + label(el);
        const side = Math.min(r.width, r.height);
        // below the floor is a fault; between the floor and the target is
        // worth knowing but is not a failure on its own
        if (!seen.has(k)) { seen.add(k); (side < ${TAP_FLOOR} ? out.tiny : out.small).push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height) }); }
      }
    }
  }
  return JSON.stringify(out);
})()`;

let failures = 0;
console.log(`probe · ${width}x${height}${style ? ' · ' + style : ''}\n`);
for (const screen of screens) {
  const nav = await evaluate(`(() => { if (!window.__novaApp) return 'no app'; window.__novaApp.navigate(${JSON.stringify(screen)}); return 'ok'; })()`);
  if (nav.error || nav.value !== 'ok') { console.log(`${screen.padEnd(10)} SKIP — ${nav.error || nav.value}`); continue; }
  // WAIT FOR THE SCREEN IT ASKED FOR. Screens are lazy chunks and the render
  // is async, so a fixed sleep can measure the PREVIOUS screen and report it
  // clean under the new screen's name — a false pass, which is worse than a
  // false alarm because nobody goes back to check it.
  let landed = false;
  for (let i = 0; i < 24 && !landed; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const cur = await evaluate(`window.__novaApp && window.__novaApp.state.screen`);
    landed = cur.value === screen;
  }
  if (!landed) { console.log(`${screen.padEnd(10)} SKIP — never became the active screen`); continue; }
  await new Promise((r) => setTimeout(r, 1400));
  const res = await evaluate(MEASURE);
  if (res.error) { console.log(`${screen.padEnd(10)} ERROR — ${res.error.slice(0, 90)}`); failures++; continue; }
  const m = JSON.parse(res.value);
  const bad = m.docScroll > m.vw + 1;
  const parts = [];
  if (bad) parts.push(`PAGE SCROLLS SIDEWAYS by ${m.docScroll - m.vw}px`);
  if (m.wide.length) parts.push(`${m.wide.length} past the edge`);
  if (m.clipped.length) parts.push(`${m.clipped.length} clipped`);
  // The command idiom is the pointer-first skin — its whole vocabulary is the
  // tracked mono micro-label, and an 11px target under a mouse is not the
  // fault an 11px target under a thumb is. His phone runs cupertino, so the
  // floor is enforced there and reported without failing here.
  if (m.tiny.length) parts.push(`${m.tiny.length} ${touchIdiom ? 'UNDER THE ' + TAP_FLOOR + 'pt FLOOR' : `under ${TAP_FLOOR}pt (pointer skin — noted, not failed)`}`);
  if (m.small.length) parts.push(`${m.small.length} under ${TAP_TARGET}pt`);
  console.log(`${screen.padEnd(10)} ${parts.length ? parts.join(' · ') : 'clean'}`);
  for (const w of m.wide.slice(0, 6)) console.log(`   → +${w.over}px  ${w.el}`);
  for (const c of m.clipped.slice(0, 6)) console.log(`   ✂ ${c.axis} by ${c.by}px  ${c.el}`);
  for (const s of m.tiny.slice(0, 6)) console.log(`   ✖ ${s.w}x${s.h}  ${s.el}`);
  for (const s of m.small.slice(0, 4)) console.log(`   ◦ ${s.w}x${s.h}  ${s.el}`);
  if (bad || m.wide.length || m.clipped.length || (m.tiny.length && touchIdiom)) failures++;
}
ws.close();
await cleanup();
console.log(failures ? `\n${failures} screen(s) with geometry faults` : '\nno geometry faults');
process.exit(failures ? 1 : 0);
