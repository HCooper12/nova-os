#!/usr/bin/env node
// PICK IT UP — kick off a catalogue refresh against the running server and
// print the per-brand receipt. Optional args: brand keys to limit the run.
//
//   node scripts/eat-out-refresh.mjs
//   node scripts/eat-out-refresh.mjs my-muscle-chef subway

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = readFileSync(path.join(here, '..', 'server', '.env'), 'utf8');
const token = (env.match(/^API_TOKEN=(.*)$/m) || [])[1]?.trim();
if (!token) { console.error('API_TOKEN not set in server/.env'); process.exit(2); }

const base = 'http://localhost:4173';
const brands = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${url} answered ${res.status}`);
  return data;
}

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${url} answered ${res.status}`);
  return data;
}

const { jobId } = await post(`${base}/api/eat-out/refresh`, brands.length ? { brands } : {});
console.log(`refresh started: ${jobId}${brands.length ? ` (${brands.join(', ')})` : ' (all brands)'}`);

let job;
for (;;) {
  job = await get(`${base}/api/eat-out/refresh/${jobId}`);
  if (job.status !== 'running') break;
  console.log('still running...');
  await sleep(5000);
}

if (job.status === 'error') {
  console.error(`job failed: ${job.error}`);
  process.exit(1);
}

const rows = job.result?.perBrand || [];
const nameW = Math.max(5, ...rows.map((r) => r.name.length));
console.log('');
console.log(`${'BRAND'.padEnd(nameW)}  ADDED  REJECTED  ERROR`);
for (const r of rows) {
  console.log(`${r.name.padEnd(nameW)}  ${String(r.added).padStart(5)}  ${String(r.rejected).padStart(8)}  ${r.error || '-'}`);
}
console.log('');
console.log(`updated: ${job.result?.updatedAt || 'n/a'}`);
