#!/usr/bin/env node
// RECORD THE FIGURE MOVING — one animated GIF per exercise pattern.
//
// The standing rule, his instruction 9 Sep 2026: "you need to be making sure
// that you are screen recording and checking the fluid movement of every
// version of the model that is incorporated for any exercise. There are no
// exceptions and this must be a standing role moving forward."
//
// A contact sheet catches a broken pose. It does not catch a limb that snaps,
// a bar that jumps between frames, or a body that slides along the floor over
// a rep — and those are exactly the faults that read as "not how a human
// moves". Only watching it move catches those. So this drives the same
// harness the sheet uses, one phase per frame, and assembles a real recording.
//
//   npm run dev            # or any vite dev server, --port below
//   node tools/motion/record.mjs                 # every pattern
//   node tools/motion/record.mjs squat lunge     # just these
//   node tools/motion/record.mjs --view side --frames 30
//
// Output lands in tools/motion/out/ (gitignored) as <pattern>.gif, and the
// script prints the paths. Deterministic: the same code and data give the same
// frames every run, so two recordings can be compared honestly.

import { execFile, spawn } from 'node:child_process';
import { mkdir, rm, readdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
// fileURLToPath, never new URL(...).pathname: this repo lives under a folder
// with a space in its name, and .pathname percent-encodes it — which silently
// wrote a whole tree of attachments into a stray "Claude%20Projects" directory
// once already, and fed ffmpeg a path it read as a format specifier.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const port = opt('port', '5199');
const view = opt('view', 'three-quarter');
const asName = opt('name', '');
const frames = Number(opt('frames', 24));
const size = Number(opt('size', 420));
const only = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a)
  && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);

const base = `http://localhost:${port}/nova-os`;

async function patterns() {
  // From the FILE, not from the dev server: vite re-indents the module it
  // serves with tabs, so a scraper written against the source matched nothing
  // and the recorder cheerfully reported "0 patterns" and exited zero.
  const src = await readFile(path.join(HERE, '..', '..', 'src', 'exercise3d.js'), 'utf8');
  const body = src.slice(src.indexOf('export const PATTERNS'));
  const end = body.indexOf('\n};');
  return [...body.slice(0, end).matchAll(/^ {2}'?([a-z][a-z0-9-]*)'?: \{$/gm)].map((m) => m[1]);
}

/* One browser, stepped frame by frame over the debugging protocol. Relaunching
 * Chrome per frame worked but took three seconds each, which made recording all
 * twenty-six patterns a half-hour job — and a check that takes half an hour is
 * a check that stops being run. */
let chrome = null; let wsUrl = null;

async function startChrome() {
  const port = 9330 + Math.floor(Math.random() * 60);
  // Its OWN profile directory, always. Launched without one, Chrome hands the
  // command to whatever instance is already running under his everyday profile
  // and exits — no debugging port, no frames, and his browser wandering off to
  // a harness page. This is also the standing rule: Nova's browser hand never
  // touches the browser he uses.
  const profile = path.join(OUT, '.chrome-profile');
  await rm(profile, { recursive: true, force: true });
  chrome = spawn(CHROME, [
    `--user-data-dir=${profile}`,
    '--headless=new', '--hide-scrollbars', '--mute-audio',
    // headless has no GPU: without SwiftShader the page renders with no WebGL
    // at all, and every frame comes out as empty background
    '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--window-size=${size},${size}`, 'about:blank',
  ], { stdio: 'ignore' });

  const base_ = `http://127.0.0.1:${port}`;
  const get = async (p) => {
    try {
      const r = await fetch(base_ + p);
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  // wait for the BROWSER first — /json/list can answer before any page target
  // exists, which is what "did not open a debugging port" really meant
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    up = Boolean(await get('/json/version'));
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) throw new Error(`Chrome never answered on ${port} — is another headless copy stuck? try: pkill -f remote-debugging-port`);
  for (let i = 0; i < 40; i++) {
    const tabs = (await get('/json/list')) || [];
    const page = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) { wsUrl = page.webSocketDebuggerUrl; return; }
    await get('/json/new?about:blank');        // no page yet: ask for one
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome opened a port but never produced a page target');
}

function cdp(ws) {
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}

async function record(id) {
  const dir = path.join(OUT, `.frames-${id}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = cdp(ws);
  await send('Page.enable');
  const url = `${base}/tools/motion/harness.html`
    + `?film=1&ex=${encodeURIComponent(id)}&size=${size}&view=${view}`
    + (asName ? `&name=${encodeURIComponent(asName)}` : '');
  await send('Page.navigate', { url });
  // wait for the model: it is fetched, parsed and skinned before it draws
  for (let i = 0; i < 80; i++) {
    const r = await send('Runtime.evaluate', {
      expression: 'Boolean(window.__filmReady && document.querySelector("canvas"))',
      returnByValue: true,
    });
    if (r.result.value) break;
    await new Promise((r2) => setTimeout(r2, 250));
  }
  await new Promise((r) => setTimeout(r, 2500));

  for (let i = 0; i < frames; i++) {
    await send('Runtime.evaluate', { expression: `window.__setPhase(${i / frames})` });
    await new Promise((r) => setTimeout(r, 140));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(dir, `f${String(i).padStart(3, '0')}.png`),
      Buffer.from(shot.data, 'base64'));
  }
  ws.close();

  const gif = path.join(OUT, `${id}.gif`);
  await run('ffmpeg', ['-y', '-v', 'error', '-framerate', '16', '-i', path.join(dir, 'f%03d.png'),
    '-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer',
    '-loop', '0', gif]);
  await rm(dir, { recursive: true, force: true });
  return gif;
}

process.on('uncaughtException', (e) => { console.error(e.message); process.exit(1); });
const ids = only.length ? only : await patterns();
if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
await mkdir(OUT, { recursive: true });
console.log(`recording ${ids.length} pattern(s) × ${frames} frames, ${view}`);
await startChrome();
try {
  for (const id of ids) {
    const gif = await record(id);
    console.log(`  ${id.padEnd(22)} ${gif}`);
  }
} finally {
  if (chrome) chrome.kill();
  // the throwaway profile is ~80 MB and has done its job
  await rm(path.join(OUT, '.chrome-profile'), { recursive: true, force: true });
}
console.log(`\n${(await readdir(OUT)).filter((f) => f.endsWith('.gif')).length} recordings in ${OUT}`);
