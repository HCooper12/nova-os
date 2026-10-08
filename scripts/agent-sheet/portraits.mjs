// THE WALL'S FACES (mockup 86, blend 1): one still portrait of each of the
// ten beings, rendered once from the character sheet, so the Ambient wall can
// show who is asking without running WebGL for hours. Re-run it whenever a
// being changes in src/agentWorld/beings.js.
//   1. serve the repo from its root:  python3 -m http.server 8793 --bind 127.0.0.1
//   2. node scripts/agent-sheet/portraits.mjs [--port 8793]
// Writes public/agents/<id>.png (144 px, the head in its resting pose, no
// waiting marker). Uses its own headless Chrome on an OS-assigned debug port,
// as studio.mjs does, never a guessed one.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const idx = 0;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(os.tmpdir(), `portraits-${process.pid}`);
const pubDir = path.join(ROOT, 'public', 'agents');
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const port = opt('port', '8793');
const W = 360, H = 360;
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


const ids = ['commander','coach','cfo','guardian','researcher','watcher','librarian','mealprep','leader','practice'];
for (let i = 0; i < 10; i++) {
  await ev(`__agentSheet.page(${i})`);
  await new Promise(r => setTimeout(r, 700));
  await ev(`__agentSheet.pose(${i},'rest')`);
  await ev(`(function(){__agentSheet.still({t:1,yaw:0,elev:0.08});})()`);
  const headY = await ev(`__agentSheet.headY(${i})`);
  await ev(`__agentSheet.still({t:1,yaw:0.18,elev:0.06,zoom:0.46,ty:${headY}+0.015})`);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(outDir, `${ids[i]}.png`), Buffer.from(s.data, 'base64'));
}
ws.close(); await cleanup();
await mkdir(pubDir, { recursive: true });
for (const id of ids) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(outDir, `${id}.png`), '-vf', 'crop=300:300:30:20,scale=144:144:flags=lanczos', path.join(pubDir, `${id}.png`)]);
}
await rm(outDir, { recursive: true, force: true });
console.log(`wrote ${ids.length} portraits to ${path.relative(ROOT, pubDir)}`);
