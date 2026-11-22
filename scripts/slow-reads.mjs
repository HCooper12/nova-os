#!/usr/bin/env node
// SLOW READS, COUNTED — DID A SPEED FIX REACH HIS REAL DAY?
//
// 22 Nov 2026: since 28 Oct, 518 calendar reads, 563 instruments reads and 513
// snapshots had each taken 3 s or more, because a fresh iCloud fetch pushed
// the settled answer out of the calendar cache (design/SPEED-DISPLAY-STUDY.md
// 4.1). A test and a probe proved the fix; only his own use of the app proves
// it reached his day. This counts the same three routes in the server's
// request log on each side of a moment, so "before" and "after" come from one
// instrument.
//
//   node scripts/slow-reads.mjs                         # from 28 Oct, split at the calendar fix
//   node scripts/slow-reads.mjs --split 2026-11-30T02:00:00Z
//   node scripts/slow-reads.mjs --from 2026-11-01 --ms 2000
//
// Read-only, and it prints counts and timings only: never an address, a
// query or a line of the log. Two limits of the log to keep in mind: a line
// is stamped when the request FINISHED, and stamps are UTC (he is ten or
// eleven hours ahead). The oldest lines carry no stamp and are left out.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
// the calendar fix (2e48d452, 2a97863a) went live at 17:57:50 AEDT on 22 Nov
const SPLIT = new Date(opt('split', '2026-11-22T06:57:50Z')).toISOString();
const FROM = new Date(opt('from', '2026-10-28')).toISOString();
const SLOW_MS = Number(opt('ms', 3000)) || 3000;
const LOG = opt('log', path.join(homedir(), 'Library/Logs/nova-os-server.log'));

const ROUTES = ['/api/calendar/today', '/api/instruments', '/api/snapshot'];
const LINE = /^req (\S+Z) GET (\/api\/[^\s?]+)(?:\?\S*)? ← \S+ → \d+ in (\d+)ms/;

const blank = () => ({ n: 0, slow: 0, ms: [] });
const tally = Object.fromEntries(ROUTES.map((r) => [r, { before: blank(), after: blank() }]));

const rl = createInterface({ input: createReadStream(LOG, 'utf8'), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.startsWith('req 20')) continue;
  const m = LINE.exec(line);
  if (!m || !tally[m[2]] || m[1] < FROM) continue;
  const side = tally[m[2]][m[1] < SPLIT ? 'before' : 'after'];
  const ms = Number(m[3]);
  side.n += 1;
  if (ms >= SLOW_MS) side.slow += 1;
  side.ms.push(ms);
}

const pick = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null);
const show = (s) => {
  if (!s.n) return 'none yet';
  const sorted = s.ms.sort((a, b) => a - b);
  const share = ((s.slow / s.n) * 100).toFixed(1);
  return `${s.slow} of ${s.n} slow (${share}%), median ${pick(sorted, 0.5)} ms, p95 ${pick(sorted, 0.95)} ms, worst ${sorted[sorted.length - 1]} ms`;
};

console.log(`slow = ${SLOW_MS} ms or more · from ${FROM} · split at ${SPLIT} (both UTC, finish times)`);
for (const r of ROUTES) {
  console.log(`\n${r}`);
  console.log(`  before  ${show(tally[r].before)}`);
  console.log(`  after   ${show(tally[r].after)}`);
}
