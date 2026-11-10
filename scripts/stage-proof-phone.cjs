#!/usr/bin/env node
// THE PHONE STAGE'S PROOF RUNNER (10 Nov 2026, mockup 114). WebKit (the
// iPhone's engine) against a PRODUCTION build, connected to a SECOND Nova
// server running over scratch copies of his data and vault
// (scripts/scratch-server.mjs --tts). It never talks to 4173, his live
// server: it refuses that port and aborts any request to it.
//
// It plays his REAL morning brief: the rest chip "Morning briefing" asks the
// scratch server for today's show (/api/show, composed from the copied vault)
// and the app speaks it through the scratch server's own voice, beat by beat,
// exactly as on his phone. Along the way it shoots each state of the stage
// (rest, first panel landed, mid-brief with the rail, See all, one panel open
// over the scrim), records the whole run in real time, and measures frame
// gaps while panels arrive and while See all deals them out.
//
//   node scripts/stage-proof-phone.cjs --pw <path to playwright-core> \
//     --app http://localhost:5193/nova-os/ --server http://127.0.0.1:4178 \
//     --env <path to server/.env with API_TOKEN> --w 390 --h 844 --out tmp-stage/live-390 \
//     [--video] [--reduced] [--style summary]
//
// Writes <out>/<state>-<w>x<h>.png, run-<w>x<h>.json (beats seen, panels,
// frame gaps, console errors) and, with --video, the recording.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const PW = opt('pw', process.env.PW_CORE || 'playwright-core');
const APP = opt('app', 'http://localhost:5193/nova-os/');
const SERVER = opt('server', 'http://127.0.0.1:4178');
const ENV = opt('env', path.join(__dirname, '..', 'server', '.env'));
const W = Number(opt('w', 390));
const H = Number(opt('h', 844));
const OUT = path.resolve(opt('out', `tmp-stage/live-${W}`));
const STYLE = opt('style', 'summary');
const video = argv.includes('--video');
const reduced = argv.includes('--reduced');
// --unpin: the stage drawn in HIS style's own tokens (Summary: 20 px corners,
// white glass, flat sky) in place of the mockup's pinned Command material, by
// a style injected at run time; nothing committed changes
const unpin = argv.includes('--unpin');
// --stop-after <state>: end the run after that screenshot (rest|first|mid|end)
const stopAfter = opt('stop-after', null);
if (/:4173\b/.test(SERVER) || /:4173\b/.test(APP)) { console.error('refusing: 4173 is his live server'); process.exit(1); }

const { webkit } = require(PW);
const token = fs.readFileSync(ENV, 'utf8').match(/^\s*API_TOKEN\s*=\s*['"]?(.+?)['"]?\s*$/m)?.[1];
if (!token) { console.error('no API_TOKEN in', ENV); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    ...(video ? { recordVideo: { dir: OUT, size: { width: W, height: H } } } : {}),
  });
  await ctx.addInitScript(({ server, token, style, unpin }) => {
    try {
      localStorage.setItem('novaos.connection', JSON.stringify({ baseUrl: server, token }));
      // his style (his own correction, 18 Oct): Summary. Theme, material and
      // calm live only on his devices; the app's defaults are used for them
      localStorage.setItem('novaos.style', style);
    } catch { /* first paint */ }
    // FRAME GAPS: one rAF clock for the whole run; the runner marks windows
    window.__gaps = [];
    let last = 0;
    const tick = (t) => { if (last) window.__gaps.push([t, t - last]); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (unpin) document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '.nv-nt.mob, .nv-ph-top { --ph-radius: var(--nv-radius) !important; --ph-glass: var(--nv-glass) !important; --ph-edge: var(--nv-edge) !important; --ph-sky: var(--nv-bg2) !important; }';
      document.head.appendChild(st);
    });
  }, { server: SERVER, token, style: STYLE, unpin });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.route(/:4173\b/, (r) => { errors.push(`LIVE REQUEST BLOCKED ${r.request().url()}`); return r.abort(); });
  await page.goto(`${APP}#/voice`);
  await page.waitForSelector('.nv-ph', { timeout: 30000 });
  await sleep(3500);
  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.png`) });
    if (stopAfter === name) { await ctx.close(); await browser.close(); console.log(JSON.stringify({ stopped: name, out: OUT })); process.exit(0); }
  };
  const state = () => page.evaluate(() => {
    const ph = document.querySelector('.nv-ph');
    return { s: ph?.dataset.s, st: ph?.dataset.key, all: ph?.dataset.face === 'all', face: ph?.dataset.face, hero: !!document.querySelector('.nv-ph-hero .nv-ph-pnl'), rail: document.querySelectorAll('.nv-ph-mini.in').length, cells: document.querySelectorAll('.nv-ph-c.in').length };
  });
  await shot('rest');
  const marks = [];
  const mark = async (what) => marks.push([what, await page.evaluate(() => performance.now())]);

  // the real brief, from the rest chip
  const chip = page.locator('.nv-ph-rest .nv-ph-chip', { hasText: 'Morning briefing' });
  if (!(await chip.count())) { console.error('no Morning briefing chip at rest'); }
  else await chip.first().click();
  await mark('brief-start');
  const t0 = Date.now();
  const trail = [];
  let s = await state();
  let firstShot = false; let midShot = false; let spoke = false; let quiet = 0; let heroes = 0; let lastHero = '';
  while (Date.now() - t0 < 240000) {
    s = await state();
    const heroKey = await page.evaluate(() => document.querySelector('.nv-ph-hero')?.dataset.key || '');
    if (heroKey && heroKey !== lastHero) { lastHero = heroKey; heroes += 1; await mark(`hero-${heroes}`); }
    trail.push(`${((Date.now() - t0) / 1000).toFixed(1)}s:${s.st}/${s.s}/h${s.hero ? 1 : 0}/r${s.rail}${s.all ? '/all' : ''}`);
    if (s.st === 'speaking') { spoke = true; quiet = 0; } else if (spoke) quiet += 1;
    if (!firstShot && s.hero) { firstShot = true; await sleep(1100); await shot('first'); }
    if (!midShot && s.rail >= 3 && s.st === 'speaking') { midShot = true; await sleep(900); await shot('mid'); }
    if (spoke && s.all && quiet >= 4) break;
    await sleep(250);
  }
  const until = async (ok, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (ok(await state())) return true; await sleep(150); } return false; };
  const tapCount = () => page.locator('.nv-ph-count').click({ timeout: 5000 });
  await until((x) => x.all);
  await mark('dealt');
  await sleep(1500);
  await shot('end');
  // Show latest, then See all again (the count row toggles)
  if ((await state()).all) { await tapCount(); await until((x) => x.face === 'hero', 5000); }
  await sleep(1400);
  await shot('hero-end');
  await tapCount();
  await until((x) => x.all, 5000);
  await mark('deal-again');
  await sleep(1400);
  // one panel opened over the scrim, then closed
  const cell = page.locator('.nv-ph-c.in').nth(1);
  if ((await state()).all && await cell.count()) {
    await cell.click({ timeout: 5000 });
    await mark('open');
    await sleep(900);
    await shot('open');
    await page.locator('.nv-ph-x').click({ timeout: 5000 });
    await sleep(700);
    await shot('closed');
  } else console.error('could not reach See all to open a panel');
  const gaps = await page.evaluate(() => window.__gaps);
  const panels = await page.evaluate(() => [...document.querySelectorAll('.nv-ph-c')].map((c) => [c.dataset.key, c.querySelector('.peye em')?.textContent || '', c.querySelector('.nv-mac-sform')?.dataset.form || 'plain']));
  // frame gaps in each window: 1.2 s after every hero arrival, after the deals, after the open
  const windows = marks.filter(([w]) => /^hero-|dealt|deal-again|open/.test(w)).map(([w, at]) => {
    const g = gaps.filter(([t]) => t >= at && t <= at + 1200).map(([, d]) => d);
    return { w, frames: g.length, worstMs: Math.round(Math.max(0, ...g)), over20: g.filter((d) => d > 20).length, over34: g.filter((d) => d > 34).length };
  });
  const all = gaps.map(([, d]) => d);
  const report = {
    viewport: `${W}x${H}`, reduced, spoke, heroes, panels, windows,
    whole: { frames: all.length, worstMs: Math.round(Math.max(0, ...all)), over34: all.filter((d) => d > 34).length },
    trail: trail.filter((x, i, a) => i === 0 || x.split(':')[1] !== a[i - 1].split(':')[1]),
    errors: errors.slice(0, 30), ua: await page.evaluate(() => navigator.userAgent),
  };
  fs.writeFileSync(path.join(OUT, `run-${W}x${H}${reduced ? '-rm' : ''}.json`), JSON.stringify(report, null, 2));
  await ctx.close();
  await browser.close();
  console.log(JSON.stringify({ spoke, heroes, panels: panels.length, worst: report.whole.worstMs, windows: windows.map((x) => `${x.w}:${x.worstMs}`).join(' '), out: OUT }));
})().catch((e) => { console.error(e); process.exit(1); });
