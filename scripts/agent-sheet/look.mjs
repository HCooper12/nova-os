// Agent character sheet instrument (design/mockups/49-agent-characters.html).
// Serve the repo first, from its root:  python3 -m http.server 8765 --bind 127.0.0.1
// Uses its own headless Chrome on an OS-assigned debug port, never a guessed
// one: a guessed port once attached to a peer session's browser.
// node look.mjs <hash> <w> <h> <out> [js-after-load]
import { spawn } from 'node:child_process'; import { rm, readFile, writeFile } from 'node:fs/promises'; import path from 'node:path'; import os from 'node:os';
const [hash, W, H, out, js] = process.argv.slice(2);
const profile = path.join(os.tmpdir(), `look-prof-${process.pid}`); await rm(profile, { recursive: true, force: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [`--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--no-first-run', '--remote-debugging-port=0', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
let dbg; for (let i = 0; i < 100 && !dbg; i++) { try { dbg = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { await new Promise(r => setTimeout(r, 150)); } }
const get = async (p) => { try { const r = await fetch(`http://127.0.0.1:${dbg}${p}`); return r.ok ? r.json() : null; } catch { return null; } };
let pg; for (let i = 0; i < 40 && !pg; i++) { pg = ((await get('/json/list')) || []).find(t => t.type === 'page'); if (!pg) await new Promise(r => setTimeout(r, 200)); }
const ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const w = new Map(); const logs = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ' ' + m.params.args.map(a => a.value).join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
const send = (method, params = {}) => new Promise(r => { const n = ++id; w.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 700 });
await send('Page.navigate', { url: `http://localhost:8765/design/mockups/${process.env.SHEET_PAGE || '49-agent-characters.html'}#${hash}` });
await new Promise(r => setTimeout(r, 4000));
if (js) { const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }); if (r.result?.result?.value !== undefined) console.log('eval:', JSON.stringify(r.result.result.value)); await new Promise(r2 => setTimeout(r2, 600)); }
const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(out, Buffer.from(shot.result.data, 'base64'));
console.log(logs.filter(l => !/deprecated/.test(l)).join('\n'));
ws.close(); chrome.kill('SIGKILL'); await new Promise(r => setTimeout(r, 300)); await rm(profile, { recursive: true, force: true }).catch(() => {});
process.exit(0);
