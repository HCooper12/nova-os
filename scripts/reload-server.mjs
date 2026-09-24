#!/usr/bin/env node
// RELOAD NOVA'S SERVER — WITHOUT KILLING HIS WORK.
//
// 25 Sep 2026: a bare `launchctl kickstart -k` 23 seconds into his detailed
// Coach question killed the job; his phone waited three minutes for an answer
// that no longer existed. The server keeps every AI job in memory, so a
// restart forgets all of them at once.
//
// So: this is the ONLY way any session reloads the service. It asks the
// running server what is in flight (GET /api/jobs/active, lib/jobRegistry.js)
// and waits until nothing is, then restarts and confirms it came back.
//
//   node scripts/reload-server.mjs            # wait up to 10 min, then refuse
//   node scripts/reload-server.mjs --wait 20  # wait up to 20 min
//   node scripts/reload-server.mjs --force    # only when HE says so
//
// A server too old to answer /api/jobs/active (404) is treated as unknown,
// not idle: the script says so and needs --force. It never guesses "idle".

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = readFileSync(path.join(here, '..', 'server', '.env'), 'utf8');
const token = (env.match(/^API_TOKEN=(.*)$/m) || [])[1]?.trim();
if (!token) { console.error('API_TOKEN not set in server/.env'); process.exit(2); }

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const waitMin = Number(argv[argv.indexOf('--wait') + 1]) || 10;
const base = 'http://localhost:4173';
const LABEL = `gui/${process.getuid()}/com.novaos.server`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function active() {
  const res = await fetch(`${base}/api/jobs/active`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return { unknown: true };
  if (!res.ok) throw new Error(`jobs/active answered ${res.status}`);
  return res.json();
}

let state;
try {
  state = await active();
} catch (e) {
  console.log(`server not answering (${e.message}) — nothing in flight to protect; reloading`);
  state = { active: 0, byLane: {} };
}

if (state.unknown && !force) {
  console.error('the running server cannot report its jobs (it predates /api/jobs/active). Re-run with --force only if you know nothing is running.');
  process.exit(1);
}

const deadline = Date.now() + waitMin * 60_000;
while (!force && !state.unknown && state.active > 0) {
  if (Date.now() > deadline) {
    console.error(`still ${state.active} job(s) running after ${waitMin} min (${JSON.stringify(state.byLane)}) — NOT reloading. His work comes first.`);
    process.exit(1);
  }
  console.log(`waiting: ${state.active} job(s) running ${JSON.stringify(state.byLane)}`);
  await sleep(5000);
  state = await active().catch(() => ({ active: 0, byLane: {} }));
}

execFileSync('launchctl', ['kickstart', '-k', LABEL], { stdio: 'inherit' });
for (let i = 0; i < 30; i += 1) {
  await sleep(1000);
  try {
    const r = await fetch(`${base}/api/health`);
    if (r.ok) { console.log(`reloaded — health ${r.status} after ${i + 1}s`); process.exit(0); }
  } catch { /* still starting */ }
}
console.error('reloaded, but health did not answer within 30s — look at ~/Library/Logs/nova-os-server.log');
process.exit(1);
