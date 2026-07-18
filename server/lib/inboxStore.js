import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Capture history is app telemetry (like the food log), not synthesized
// knowledge — it lives in server/data, not the vault. The filed OUTCOMES land
// in the vault; this file records what was captured, how it was routed, and
// how to undo it. NOVA_DATA_DIR override exists for tests, which must never
// touch the real data directory.
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = () => path.join(dataRoot(), 'inbox.json');

// Keep the history bounded: resolved records beyond this many are dropped
// (pending/classifying records are always kept regardless of age).
const MAX_RESOLVED = 400;

let cache = null;
let lock = Promise.resolve();

function withLock(fn) {
  const run = lock.catch(() => {}).then(fn);
  lock = run.catch(() => {});
  return run;
}

async function load() {
  if (cache) return cache;
  if (!existsSync(STORE_PATH())) {
    cache = { items: [] };
    return cache;
  }
  try {
    cache = JSON.parse(await readFile(STORE_PATH(), 'utf8'));
    if (!Array.isArray(cache.items)) cache = { items: [] };
  } catch {
    cache = { items: [] };
  }
  return cache;
}

async function persist() {
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(STORE_PATH(), JSON.stringify(cache, null, 2), 'utf8');
}

export async function listRecords() {
  const store = await load();
  // newest first
  return [...store.items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getRecord(id) {
  const store = await load();
  return store.items.find((r) => r.id === id) || null;
}

export async function createRecord(record) {
  return withLock(async () => {
    const store = await load();
    store.items.push(record);
    const unresolved = store.items.filter((r) => r.status === 'classifying' || r.status === 'pending');
    const resolved = store.items.filter((r) => r.status !== 'classifying' && r.status !== 'pending');
    if (resolved.length > MAX_RESOLVED) {
      resolved.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      store.items = [...unresolved, ...resolved.slice(0, MAX_RESOLVED)];
    }
    await persist();
    return record;
  });
}

export async function updateRecord(id, patch) {
  return withLock(async () => {
    const store = await load();
    const idx = store.items.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('inbox record not found');
    store.items[idx] = { ...store.items[idx], ...patch };
    await persist();
    return store.items[idx];
  });
}

// test hook — drops the in-memory cache so a fresh NOVA_DATA_DIR is re-read
export function _resetInboxStore() {
  cache = null;
}
