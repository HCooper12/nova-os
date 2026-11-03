#!/usr/bin/env node
// A SECOND NOVA SERVER ON A SCRATCH COPY, for any instrument that loads a
// screen (the standing rule after the 1 Nov leak: an instrument that can
// write never points at 4173, and a CDP write guard is not a guard).
//
// Copies server/data and his vault into a scratch folder, strips every
// credential that reaches a person (Notion, web push, Telegram, Todoist,
// iCloud), stubs `claude` and `tailscale`, and runs server/index.js over the
// copies on --port (default 4174). Prints `ready <url>` on stdout once
// /api/health answers, then stays up until killed (Ctrl-C or SIGTERM), and
// removes the copies on the way out unless --keep.
//
//   node scripts/scratch-server.mjs [--port 4174] [--scratch <dir>] [--keep]
//   node scripts/fluidity.mjs --server http://127.0.0.1:4174 ...
//
// Extracted from offline-walk.mjs (3 Nov 2026), which keeps its own copy
// because it also needs a switchable proxy in front.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, rm, readFile, writeFile, chmod } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = 'scratch-server';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const PORT = Number(opt('port', 4174));
const LIVE_PORT = 4173;
const scratch = opt('scratch', path.join(os.tmpdir(), `nova-scratch-server-${process.pid}`));
const keep = argv.includes('--keep');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (PORT === LIVE_PORT) { console.error(`${TOOL}: ${LIVE_PORT} is his live server; refusing`); process.exit(1); }
const portFree = (p) => new Promise((resolve) => { const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true))).listen(p, '127.0.0.1'); });
if (!(await portFree(PORT))) { console.error(`${TOOL}: port ${PORT} is taken; refusing`); process.exit(1); }

const env = await readFile(path.join(ROOT, 'server', '.env'), 'utf8');
const envVal = (k) => env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1]?.replace(/^['"]|['"]$/g, '');
const token = envVal('API_TOKEN');
const liveVault = envVal('VAULT_PATH');
if (!token || !liveVault) { console.error(`${TOOL}: API_TOKEN / VAULT_PATH missing in server/.env`); process.exit(1); }

const dataCopy = path.join(scratch, 'data');
const vaultCopy = path.join(scratch, 'vault');
const shim = path.join(scratch, 'shim');
await mkdir(path.join(scratch, 'projects'), { recursive: true });
console.error(`${TOOL}: copying server/data and the vault into ${scratch}`);
execFileSync('cp', ['-R', path.join(ROOT, 'server', 'data'), dataCopy]);
execFileSync('rsync', ['-a', '--exclude', '.trash', `${liveVault}/`, `${vaultCopy}/`]);
// Notion and web push keep their credentials in the data dir: off the COPY
for (const f of ['integrations/notion.json', 'push.json', 'push-keys.json', 'push-held.json']) await rm(path.join(dataCopy, f), { force: true });
await mkdir(shim, { recursive: true });
for (const bin of ['claude', 'tailscale']) {
  await writeFile(path.join(shim, bin), `#!/bin/sh\necho "${TOOL} stub: disabled" >&2\nexit 1\n`);
  await chmod(path.join(shim, bin), 0o755);
}

const server = spawn(process.execPath, ['index.js'], {
  cwd: path.join(ROOT, 'server'),
  env: {
    ...process.env,
    PORT: String(PORT), HOST: '127.0.0.1',
    NOVA_DATA_DIR: dataCopy, VAULT_PATH: vaultCopy, API_TOKEN: token,
    // dotenv never overrides a key that is already set, even to ''
    TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', TODOIST_TOKEN: '', NOTION_TOKEN: '',
    ICLOUD_USERNAME: '', ICLOUD_APP_PASSWORD: '', BRAVE_SEARCH_KEY: '', ELEVENLABS_API_KEY: '',
    NOVA_REMINDERS_SYNC: 'off', NOVA_TAILNET_AUTOUP: '0', NOVA_COACH_CADENCE: 'off',
    NOVA_TTS_LOCAL: '0', NOVA_STT_LOCAL: '0', NOVA_OLLAMA_NO_SPAWN: '1',
    CLAUDE_BIN: path.join(shim, 'claude'), NOVA_CLAUDE_BIN: path.join(shim, 'claude'),
    NOVA_PROJECTS_DIR: path.join(scratch, 'projects'),
    PATH: `${shim}:${process.env.PATH}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
server.stdout.on('data', (d) => { log = (log + d).slice(-4000); });
server.stderr.on('data', (d) => { log = (log + d).slice(-4000); });

let stopping = false;
const stop = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ }
  if (!keep) await rm(scratch, { recursive: true, force: true });
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
server.on('exit', (c) => { if (!stopping) { console.error(`${TOOL}: the server exited (${c})\n${log}`); stop(1); } });

let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).status < 500; } catch { /* booting */ }
  if (!up) await sleep(500);
}
if (!up) { console.error(`${TOOL}: never answered\n${log}`); await stop(1); }
console.log(`ready http://127.0.0.1:${PORT}`);
