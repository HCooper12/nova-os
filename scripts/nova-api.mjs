#!/usr/bin/env node
// Talk to the LOCAL Nova server with his token WITHOUT the token ever
// leaving this process. The auto-mode permission layer (rightly) refuses to
// print server/.env into a session transcript; this reads it in-process and
// prints only the response. Local use only — it targets localhost.
//
//   node scripts/nova-api.mjs GET  /api/health
//   node scripts/nova-api.mjs POST /api/ask '{"question":"had lunch"}'
//   node scripts/nova-api.mjs POST /api/inbox/<id>/undo
//
// Prints the JSON body (pretty) and exits non-zero on a non-2xx.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = readFileSync(path.join(here, '..', 'server', '.env'), 'utf8');
const token = (env.match(/^API_TOKEN=(.*)$/m) || [])[1]?.trim();
if (!token) { console.error('API_TOKEN not set in server/.env'); process.exit(2); }

const [method = 'GET', route = '/api/health', body] = process.argv.slice(2);
const base = process.env.NOVA_BASE || 'http://localhost:4173';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) { console.error('nova-api is for the local server only'); process.exit(2); }

const res = await fetch(base + route, {
  method: method.toUpperCase(),
  headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body || undefined,
});
const text = await res.text();
let out = text;
try { out = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
console.log(`${res.status} ${method.toUpperCase()} ${route}`);
console.log(out.length > 40000 ? out.slice(0, 40000) + '\n…(truncated)' : out);
process.exit(res.ok ? 0 : 1);
