// Agent character sheet instrument (design/mockups/49-agent-characters.html).
// Serve the repo first, from its root:  python3 -m http.server 8765 --bind 127.0.0.1
// Uses its own headless Chrome on an OS-assigned debug port, never a guessed
// one: a guessed port once attached to a peer session's browser.
// Studio capture for the agent character sheet.
// node studio.mjs <beingIndex> <outDir> [--head] [--work-t 0.6,1.8] [--port 8765]
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const idx = Number(argv[0] ?? 0);
const outDir = argv[1] ?? '/tmp/studio';
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const port = opt('port', '8765');
const workTs = (opt('work-t', '0.6,2.1')).split(',').map(Number);
const W = Number(opt('w', 440)), H = Number(opt('h', 560));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = `http://localhost:${port}/design/mockups/${process.env.SHEET_PAGE || '49-agent-characters.html'}#mode=paged&page=${idx}`;

await mkdir(outDir, { recursive: true });
const profile = path.join(os.tmpdir(), `studio-prof-${process.pid}`);
await rm(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--mute-audio',
  '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
  '--no-first-run', '--remote-debugging-port=0', `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });
const cleanup = async () => { try { chrome.kill('SIGKILL'); } catch {} await new Promise(r => setTimeout(r, 300)); await rm(profile, { recursive: true, force: true }).catch(() => {}); };
process.on('uncaughtException', async (e) => { console.error(e); await cleanup(); process.exit(1); });

// the port Chrome actually bound, read from its own profile — never a guess
let dbg = null;
for (let i = 0; i < 100 && !dbg; i++) { try { dbg = Number((await (await import('node:fs/promises')).readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { await new Promise(r => setTimeout(r, 150)); } }
if (!dbg) throw new Error('no DevToolsActivePort');
const get = async (p) => { try { const r = await fetch(`http://127.0.0.1:${dbg}${p}`); return r.ok ? r.json() : null; } catch { return null; } };
for (let i = 0; i < 80 && !(await get('/json/version')); i++) await new Promise(r => setTimeout(r, 200));
let pg; for (let i = 0; i < 40 && !pg; i++) { pg = ((await get('/json/list')) || []).find(t => t.type === 'page'); if (!pg) await new Promise(r => setTimeout(r, 200)); }
const ws = new WebSocket(pg.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; wait.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: n, method, params })); });
const logs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map(a => a.value).join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (let i = 0; i < 60; i++) {
  const r = await send('Runtime.evaluate', { expression: 'Boolean(window.__agentSheet)', returnByValue: true });
  if (r.result.value) break; await new Promise(r2 => setTimeout(r2, 250));
}
await new Promise(r => setTimeout(r, 900));
const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: js, returnByValue: true }); if (r.exceptionDetails) console.error('eval failed', r.exceptionDetails.exception?.description); return r.result?.value; };
await ev(`(function(){var s=document.createElement('style');s.textContent='header,#tools,#caption,#dots,.arrow,#hint,#frames{display:none!important}';document.head.appendChild(s);})()`);

if (opt('pre')) await ev(opt('pre'));
const only = opt('only');
const views = [['front', 0], ['q3', 0.72], ['side', 1.5708], ['back', 3.1416]];
const shots = [];
let n = 0;
const snap = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const f = path.join(outDir, `f_${String(n++).padStart(2, '0')}.png`);
  await writeFile(f, Buffer.from(s.data, 'base64')); shots.push([name, f]);
};
// row 1: waiting, 4 views. row 2: working at workTs[0], 4 views
await ev(`__agentSheet.pose(${idx},'wait')`);
for (const [nm, sp] of views) { await ev(`__agentSheet.still({t:1,yaw:${sp},elev:0.12})`); await snap('wait-' + nm); }
await ev(`__agentSheet.pose(${idx},'work')`);
for (const [nm, sp] of views) { await ev(`__agentSheet.still({t:${workTs[0]},yaw:${sp},elev:0.12})`); await snap('work-' + nm); }
// row 3: work at other ts from front q3, plus head close-ups
for (const t of workTs.slice(1)) { await ev(`__agentSheet.still({t:${t},yaw:0.4,elev:0.12})`); await snap('work-t' + t); }
await ev(`__agentSheet.pose(${idx},'wait')`);
await ev(`(function(){__agentSheet.still({t:1,yaw:0,elev:0.08});})()`);
const headY = await ev(`__agentSheet.headY(${idx})`);
await ev(`__agentSheet.still({t:1,yaw:0,elev:0.06,zoom:0.42,ty:${headY}})`); await snap('head-front');
await ev(`__agentSheet.still({t:1,yaw:0.6,elev:0.06,zoom:0.42,ty:${headY}})`); await snap('head-q3');
while (shots.length % 4) { await snap('pad'); }
const rows = shots.length / 4;
console.log(logs.filter(l => !/^\[fit\]/.test(l)).join('\n'));
ws.close(); await cleanup();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(outDir, 'f_%02d.png'), '-vf', `tile=4x${rows}`, '-frames:v', '1', path.join(outDir, 'sheet.png')]);
console.log(path.join(outDir, 'sheet.png'), shots.map(s => s[0]).join(' | '));
