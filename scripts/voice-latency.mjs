#!/usr/bin/env node
// HOW QUICKLY DID HE HEAR SOMETHING? (15 Oct 2026)
//
// His note, off E.V. in Brand New Day: "I especially like how quickly Peter's
// AI responds. A lot of the time it doesn't feel like Nova does that." This
// reads the receipts the app now posts for every ask (surface 'ask' in
// server/data/voice/turns.json, server/lib/voiceTurns.js) and prints the
// waits, so "is it quicker?" is a number rather than a feeling:
//
//   ackMs         the ask leaving the device → the ack starting to play
//   firstTextMs   → the first words of the reply arriving
//   firstAudioMs  → the reply's first sentence starting to play
//
// by device (iPhone vs Mac, from the user agent) and lane (nova, coach,
// leader, reflex), then by place (gym, driving, desk, phone; src/where.js).
// p50 and p95, with the count each is drawn from, and an
// honest line when there is nothing to read.
//
//   node scripts/voice-latency.mjs                 # server/data/voice/turns.json
//   node scripts/voice-latency.mjs --file x.json   # another copy
//   node scripts/voice-latency.mjs --since 2026-10-15
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dataDir = process.env.NOVA_DATA_DIR || path.join(ROOT, 'server', 'data');
const file = opt('--file') || path.join(dataDir, 'voice', 'turns.json');
const since = opt('--since');

if (!existsSync(file)) {
  console.log(`No receipts yet: ${file} does not exist. Ask Nova something from the app, then run this again.`);
  process.exit(0);
}
let turns = [];
try { turns = JSON.parse(readFileSync(file, 'utf8')).turns || []; } catch (e) {
  console.log(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}
const asks = turns.filter((t) => t.surface === 'ask' && (!since || String(t.at || '') >= since));
if (!asks.length) {
  console.log(`${turns.length} receipt(s) in ${file}, none of them an ask${since ? ` since ${since}` : ''}. The app posts one per question from the 15 Oct build on.`);
  process.exit(0);
}

const device = (ua = '') => (/iPhone|iPad/.test(ua) ? 'iPhone' : /Macintosh/.test(ua) ? 'Mac' : 'other');
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
const FIELDS = ['ackMs', 'firstTextMs', 'firstAudioMs'];
const fmt = (vals) => {
  if (!vals.length) return '        —        ';
  const s = [...vals].sort((a, b) => a - b);
  return `${String(pct(s, 50)).padStart(6)} ${String(pct(s, 95)).padStart(6)} n=${String(s.length).padEnd(3)}`;
};

const groups = new Map();
for (const t of asks) {
  const key = `${device(t.ua)} · ${t.lane || '?'}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
}
// WHERE HE WAS (src/where.js, from the 15 Oct place build on): the same
// waits by place. A receipt from before it has no place and reads '?'.
const places = new Map();
for (const t of asks) {
  const key = t.place || '?';
  if (!places.has(key)) places.set(key, []);
  places.get(key).push(t);
}
const first = asks[0].at?.slice(0, 16) || '?';
const last = asks.at(-1).at?.slice(0, 16) || '?';
console.log(`${asks.length} ask(s), ${first} → ${last} UTC (he is AEST, +10)\n`);
console.log(`${'device · lane'.padEnd(20)} ${FIELDS.map((f) => `${f.padEnd(10)} p50    p95`.padEnd(26)).join(' ')}`);
for (const [key, rows] of [...groups.entries()].sort()) {
  const cols = FIELDS.map((f) => fmt(rows.map((r) => r[f]).filter((v) => Number.isFinite(v))).padEnd(26));
  console.log(`${`${key} (${rows.length})`.padEnd(20)} ${cols.join(' ')}`);
}
console.log(`\n${'place'.padEnd(20)} ${FIELDS.map((f) => `${f.padEnd(10)} p50    p95`.padEnd(26)).join(' ')}`);
for (const [key, rows] of [...places.entries()].sort()) {
  const cols = FIELDS.map((f) => fmt(rows.map((r) => r[f]).filter((v) => Number.isFinite(v))).padEnd(26));
  console.log(`${`${key} (${rows.length})`.padEnd(20)} ${cols.join(' ')}`);
}
const acked = asks.filter((t) => t.ackText);
const heard = acked.filter((t) => Number.isFinite(t.ackMs));
if (acked.length) console.log(`\n${acked.length} ask(s) came with an ack; ${heard.length} of them were heard (the rest were dropped because the answer caught up, or speech was off).`);
