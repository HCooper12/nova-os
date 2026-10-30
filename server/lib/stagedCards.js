// CARDS MADE OUTSIDE THE SERVER, FILED BY THE SERVER (31 Oct 2026).
//
// The Inbox store keeps its records in the server's memory and rewrites
// inbox.json whole on every change (lib/inboxStore.js). A script that runs a
// lane by hand and calls createRecord in its OWN process writes a file the
// running server will overwrite from its cache on the next change anywhere,
// so the card would vanish without a trace. Such a script stages its finished
// records here instead; the server files them on its next cadence tick (and
// at boot) through createRecord, in its own process, exactly once.
//
// A staged record is a complete Inbox record (the lane built and validated
// it). Filing is idempotent by record id: a record already in the Inbox is
// marked filed and never created twice.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = () => path.join(dataRoot(), 'staged-cards.json');

async function load() {
  try { const d = JSON.parse(await readFile(FILE(), 'utf8')); return Array.isArray(d.items) ? d : { items: [] }; } catch { return { items: [] }; }
}
async function save(d) {
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(FILE() + '.tmp', JSON.stringify(d, null, 2));
  await rename(FILE() + '.tmp', FILE());
}

/** Stage finished records for the server to file. Returns how many are waiting. */
export async function stageCards(records, { by = 'script' } = {}) {
  const d = await load();
  for (const r of records) {
    if (!r?.id) throw new Error('a staged card needs its record id');
    if (d.items.some((x) => x.record.id === r.id)) continue;
    d.items.push({ record: r, stagedAt: new Date().toISOString(), by, filedAt: null });
  }
  await save(d);
  return d.items.filter((x) => !x.filedAt).length;
}

/** The server's half: file every staged record not yet in the Inbox. */
export async function fileStagedCards(deps = {}) {
  const d = await load();
  const todo = d.items.filter((x) => !x.filedAt);
  if (!todo.length) return { filed: [] };
  const store = deps.store || await import('./inboxStore.js');
  const filed = [];
  for (const x of todo) {
    const have = await store.getRecord(x.record.id).catch(() => null);
    if (!have) {
      await store.createRecord(x.record);
      filed.push(x.record.id);
    }
    x.filedAt = new Date().toISOString();
  }
  await save(d);
  return { filed };
}
