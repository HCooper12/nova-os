#!/usr/bin/env node
// THE WI-FI-OFF DRILL (2 Nov 2026; design/LOCAL-NOVA-PLAN.md §1b).
//
//   node scripts/drill.mjs
//
// Runs one local-only turn end to end (a classify on the model on this Mac, a
// Kokoro render, and the ears when they are local) with the outbound watcher
// on, then prints every host the turn reached that is not this Mac, his
// tailnet or his LAN. The drill PASSES only when that list is empty. Then it
// prints what still needs the internet, read from the code (lib/internetNeeds.js).
//
// It never turns Wi-Fi off itself: that would cut his phone off from the Mac.
// It proves what WOULD happen.
//
// Where the turn runs:
//  - the live server has the drill route (POST /api/drill/run): the turn runs
//    inside the server and the server's own watcher sees it. The real thing.
//  - it does not yet (the route lands on the next reload): the same modules
//    run in THIS process against the same live sidecars (Ollama, Kokoro,
//    Apple's helper), watched here, with NOVA_DATA_DIR on a scratch folder.
//    The output says which.
//
// Writes only server/data/drill/last.json. His token is read in-process from
// server/.env and never printed.

import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, '..', 'server');
const envText = readFileSync(path.join(serverDir, '.env'), 'utf8');
const envVal = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
const token = envVal('API_TOKEN');
if (!token) { console.error('API_TOKEN not set in server/.env'); process.exit(2); }
const LOCAL = `http://127.0.0.1:${Number(envVal('PORT')) || 4173}`;
const AUTH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const realFetch = globalThis.fetch;   // the script's own calls to the server are not part of the turn

async function api(method, route, body) {
  const res = await realFetch(LOCAL + route, { method, headers: AUTH, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180_000) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, body: json };
}

console.log('NOVA WI-FI-OFF DRILL ' + new Date().toISOString());
console.log('Wi-Fi stays on: this proves what would happen without it.');
console.log('');

let mode = null;
let turn = null;
let needs = null;
let steps = null;
let rows = [];
let nonLocal = [];
let error = null;

const probe = await api('GET', '/api/drill/needs').catch((e) => ({ status: 0, error: e }));
if (probe.status === 0) {
  console.error(`The server did not answer at ${LOCAL}: ${probe.error?.cause?.code || probe.error?.message}`);
  process.exit(1);
}

if (probe.status === 200) {
  mode = 'server';
  const r = await api('POST', '/api/drill/run', { label: 'wifi-off drill' });
  if (!r.ok) error = `the server's drill run answered ${r.status}: ${r.body?.error || ''}`;
  else ({ turn, steps, rows, nonLocal } = r.body);
  needs = probe.body;
} else if (probe.status === 404) {
  mode = 'this process';
  console.log('The live server has no drill route yet (it lands on the next reload).');
  console.log('Running the same modules in this process against the same live sidecars, watched here.');
  console.log('');
  // the board's model pick, read before the scratch folder hides his board
  const board = await api('GET', '/api/model-prefs');
  const pick = board.body?.local?.preferredModel;
  if (pick) process.env.NOVA_LOCAL_LLM_MODEL = pick;
  for (const k of ['NOVA_TTS_LOCAL', 'NOVA_TTS_PORT', 'NOVA_TTS_SPEED', 'ELEVENLABS_API_KEY', 'NOVA_LOCAL_LLM_BACKEND', 'NOVA_OLLAMA_URL']) {
    if (process.env[k] === undefined && envVal(k)) process.env[k] = envVal(k);
  }
  const scratch = await mkdtemp(path.join(tmpdir(), 'nova-drill-'));
  process.env.NOVA_DATA_DIR = scratch;
  try {
    const outbound = await import('../server/lib/outbound.js');
    const { runLocalTurn } = await import('../server/routes/drill.js');
    // a voice sidecar that is down is reported, never started from here
    const ttsLocal = await import('../server/lib/ttsLocal.js');
    const tts = await import('../server/lib/tts.js');
    const sidecarUp = tts.ttsEngine() !== 'local' || await ttsLocal.healthy();
    outbound.enableOutboundWatch();
    turn = outbound.markTurn('wifi-off drill');
    steps = await runLocalTurn({ deps: sidecarUp ? {} : { tts: { ttsEngine: () => null, synthesize: async () => { throw new Error('unused'); } } } });
    if (!sidecarUp) steps.tts = { ok: false, skipped: true, error: 'the Kokoro sidecar is not running; the drill does not start it' };
    rows = outbound.connectionsSince(turn.at);
    nonLocal = outbound.nonLocalHosts(rows);
    outbound.disableOutboundWatch();
  } catch (e) {
    error = e.message;
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
    delete process.env.NOVA_DATA_DIR;
  }
  // the honest list, read against his real (read-only) board and keys
  try {
    for (const k of ['TODOIST_TOKEN', 'TELEGRAM_BOT_TOKEN', 'ICLOUD_USERNAME', 'BRAVE_SEARCH_KEY', 'NOTION_TOKEN']) {
      if (process.env[k] === undefined && envVal(k)) process.env[k] = envVal(k);
    }
    const { internetNeeds, stillNeedsInternet } = await import('../server/lib/internetNeeds.js');
    const list = await internetNeeds();
    needs = { needs: list, stillNeeds: stillNeedsInternet(list) };
  } catch (e) {
    needs = null;
    error = error || `the honest list could not be read: ${e.message}`;
  }
} else {
  console.error(`GET /api/drill/needs answered ${probe.status}`);
  process.exit(1);
}

// --------------------------------------------------------------- the turn
const line = (name, st) => {
  if (!st) return console.log(`  ${name}: not run`);
  if (st.ok) return console.log(`  ✓ ${name}: ${st.ms} ms${st.model ? ` on ${st.model}` : ''}${st.engine ? ` (${st.engine})` : ''}${st.backend ? ` (${st.backend})` : ''}${st.text ? ` — "${st.text}"` : ''}`);
  console.log(`  ${st.skipped ? '-' : '✗'} ${name}: ${st.error}`);
};
console.log(`THE TURN (watched in ${mode})`);
if (steps) {
  line('think (local classify)', steps.classify);
  line('speak (TTS render)', steps.tts);
  line('hear (local ears)', steps.ears);
}
console.log('');
console.log(`CONNECTIONS DURING THE TURN: ${rows.length}`);
const byHost = new Map();
for (const r of rows) {
  const k = `${r.host}:${r.port}`;
  const e = byHost.get(k) || { host: r.host, port: r.port, local: r.local, n: 0, via: new Set(), reasons: new Set() };
  e.n++; e.via.add(r.via); if (r.reason) e.reasons.add(r.reason);
  byHost.set(k, e);
}
for (const e of byHost.values()) console.log(`  ${e.local ? 'local   ' : 'INTERNET'} ${e.host}:${e.port} ×${e.n} (${[...e.via].join('/')}${e.reasons.size ? `; ${[...e.reasons].join(', ')}` : ''})`);
console.log('');

const stepFailed = steps && steps.classify && !steps.classify.ok;
const pass = !error && steps && nonLocal.length === 0 && !stepFailed;
if (nonLocal.length) console.log(`NOT LOCAL: ${nonLocal.join(', ')}`);
else if (steps) console.log('NOT LOCAL: none — every host this turn reached is this Mac, the tailnet or his LAN.');
if (error) console.log(`ERROR: ${error}`);
if (stepFailed) console.log('The local classify did not answer, so the turn did not prove the brain works offline.');
console.log('Not watched: connections made by child processes (the claude CLI, yt-dlp, Chrome); the list below covers those from the code.');
console.log('');

// --------------------------------------------------------------- the list
if (needs) {
  const still = needs.stillNeeds || [];
  const services = still.filter((e) => !e.lane);
  const claudeLanes = still.filter((e) => e.lane && e.needs === 'claude');
  const webLocal = still.filter((e) => e.lane && e.needs === 'internet');
  const onMac = (needs.needs || []).filter((e) => e.needs === 'none' && e.configured !== false && !e.off);
  console.log('Still needs the internet:');
  for (const e of services) console.log(`  - ${e.feature}: ${e.state} (${e.why})`);
  for (const e of webLocal) console.log(`  - ${e.feature}: ${e.state}, ${e.why}`);
  console.log(`  - ${claudeLanes.length} lanes on Claude: ${claudeLanes.map((e) => e.feature).join(', ')}`);
  console.log('');
  console.log(`Works on this Mac: ${onMac.map((e) => `${e.feature} (${e.state})`).join('; ')}`);
  console.log('');
}

console.log(`DRILL: ${pass ? 'PASS' : 'FAIL'}`);

// --------------------------------------------------------------- receipt
const receipt = {
  at: new Date().toISOString(),
  pass: !!pass,
  watchedIn: mode,
  turn,
  steps,
  connections: rows,
  nonLocal,
  error,
  stillNeeds: (needs?.stillNeeds || []).map((e) => ({ feature: e.feature, needs: e.needs, state: e.state })),
};
const dir = path.join(serverDir, 'data', 'drill');
await mkdir(dir, { recursive: true });
const file = path.join(dir, 'last.json');
await writeFile(file + '.tmp', JSON.stringify(receipt, null, 2), 'utf8');
await rename(file + '.tmp', file);
console.log(`Receipt: server/data/drill/last.json`);
process.exit(pass ? 0 : 1);
