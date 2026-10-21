#!/usr/bin/env node
// THE SHAPE OF HIS CONVERSATIONS (design/TALK-STUDY.md, 21 Oct 2026).
// Reads his conversation record (server/data/conversation/*.jsonl) and the
// spoken log, read-only, and prints how long the replies run against his own
// turns, how often a reply hands the floor back with a question, how often a
// turn held its rest, and how many greetings a day Nova says. The bar it is
// read against: Jarvis's median turn is 8 words, E.V.'s is 6.
//
//   node scripts/talk-shape.mjs            every day in the record
//   node scripts/talk-shape.mjs --since 2026-10-21
//
// Measure before claiming: run it after a few days of real use and compare
// with the 21 Oct baseline in the study.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = process.env.NOVA_DATA_DIR || path.join(root, 'server', 'data');
const at = process.argv.indexOf('--since');
const since = at !== -1 ? process.argv[at + 1] : '';

const wc = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const stats = (xs) => {
  if (!xs.length) return 'none';
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `n ${s.length} · median ${q(0.5)} · p90 ${q(0.9)} · max ${s[s.length - 1]}`;
};

const dir = path.join(data, 'conversation');
const byId = new Map();
for (const f of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort() : []) {
  for (const l of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try {
      const r = JSON.parse(l);
      // an edit is a new line under the same id, kept at the first version's time
      byId.set(r.id, { ...(byId.get(r.id) || {}), ...r, at: byId.get(r.id)?.at || r.at });
    } catch { /* a torn line is skipped */ }
  }
}
const rows = [...byId.values()].filter((r) => !since || r.at >= since).sort((a, b) => a.at.localeCompare(b.at));

// each reply that answers one of his turns
const pairs = [];
let his = null;
for (const r of rows) {
  if (r.who === 'you') { his = r; continue; }
  if (r.who === 'system') continue;
  if (his) { pairs.push({ his, reply: r }); his = null; }
}
const replies = pairs.map((p) => wc(p.reply.text));
const short = pairs.filter((p) => wc(p.his.text) <= 8).map((p) => wc(p.reply.text));
const asks = pairs.filter((p) => /\?\s*$/.test(String(p.reply.text).trim())).length;
const over40 = replies.filter((w) => w > 40).length;

console.log(`Conversation record${since ? ` since ${since}` : ''}: ${pairs.length} replies to his turns`);
console.log(`  reply words           ${stats(replies)}`);
console.log(`  to his short turns    ${stats(short)}   (his turn ≤ 8 words)`);
console.log(`  his words             ${stats(pairs.map((p) => wc(p.his.text)))}`);
console.log(`  over 40 words         ${over40} of ${pairs.length}`);
console.log(`  ends on a question    ${asks} of ${pairs.length}`);
const byAgent = {};
for (const p of pairs) (byAgent[p.reply.by || p.reply.who] ||= []).push(wc(p.reply.text));
for (const [k, v] of Object.entries(byAgent)) console.log(`  ${k.padEnd(20)}  ${stats(v)}`);

// the doorman
const logFile = path.join(data, 'spoken-log.json');
if (existsSync(logFile)) {
  let lines = [];
  try { const j = JSON.parse(readFileSync(logFile, 'utf8')); lines = Array.isArray(j) ? j : j.lines || []; } catch { /* unreadable */ }
  const greet = lines.filter((l) => l.source === 'greeting' && (!since || l.at >= since));
  const day = {};
  for (const g of greet) { const d = new Date(g.at).toLocaleDateString('en-CA'); day[d] = (day[d] || 0) + 1; }
  console.log(`\nGreetings: ${greet.length} · words ${stats(greet.map((g) => wc(g.text)))}`);
  console.log(`  per local day         ${Object.entries(day).map(([d, n]) => `${d.slice(5)} ${n}`).join(' · ') || 'none'}`);
}
console.log('\nThe bar: Jarvis median 8 words a turn, E.V. 6; 4 in 100 over 20 words.');
