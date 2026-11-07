#!/usr/bin/env node
// Read only. Was it read? Per auto-delivered kind, over the last N days (default
// 7): how many delivered themselves, how many he had in front of him, and where.
// `node scripts/read-signal.mjs [days]`. Opened means the screen was open for
// three seconds or he expanded the card (src/readSignal.js), not that he read it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'data');
const days = Number(process.argv[2]) || 7;
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const file = JSON.parse(readFileSync(path.join(root, 'inbox.json'), 'utf8'));
const records = (Array.isArray(file) ? file : file.items || []).filter((r) => r.auto && r.status === 'filed' && (r.createdAt || '') >= since);
const byKind = new Map();
for (const r of records) {
  const k = r.kind || 'capture';
  if (!byKind.has(k)) byKind.set(k, { delivered: 0, seen: 0, via: {} });
  const row = byKind.get(k);
  row.delivered += 1;
  if (r.seenAt) { row.seen += 1; row.via[r.seenVia || 'app'] = (row.via[r.seenVia || 'app'] || 0) + 1; }
}
console.log(`Auto-delivered records, last ${days} days: ${records.length}`);
for (const [kind, row] of [...byKind.entries()].sort((a, b) => b[1].delivered - a[1].delivered)) {
  console.log(`${kind.padEnd(20)} ${String(row.seen).padStart(3)} of ${String(row.delivered).padEnd(3)} seen  ${JSON.stringify(row.via)}`);
}
