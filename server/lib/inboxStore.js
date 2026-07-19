import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
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

// Keep the history bounded: RESOLVED records beyond this many are dropped.
// Unresolved records — classifying, pending, and error — are always kept:
// an errored capture is the only copy of the thought, so trimming it would
// be data loss, not history pruning.
const MAX_RESOLVED = 400;
const UNRESOLVED = new Set(['classifying', 'pending', 'error']);

let cache = null;
let loadPromise = null;
let lock = Promise.resolve();

function withLock(fn) {
  const run = lock.catch(() => {}).then(fn);
  lock = run.catch(() => {});
  return run;
}

// Single-flight load: every caller (including lock-free readers) awaits the
// SAME promise, so two cold-cache first touches can never build two separate
// store objects and clobber each other's writes.
function load() {
  if (cache) return Promise.resolve(cache);
  if (!loadPromise) {
    loadPromise = (async () => {
      if (!existsSync(STORE_PATH())) {
        cache = { items: [] };
        return cache;
      }
      let raw;
      try {
        raw = await readFile(STORE_PATH(), 'utf8');
      } catch (e) {
        // transient I/O failure must not become a permanent wipe — surface it
        loadPromise = null;
        throw new Error('could not read inbox history: ' + e.message);
      }
      try {
        const parsed = JSON.parse(raw);
        cache = Array.isArray(parsed.items) ? parsed : { items: [] };
      } catch {
        // corrupt file (e.g. torn write before atomic persist existed) —
        // quarantine it rather than silently overwriting the evidence
        await rename(STORE_PATH(), STORE_PATH() + '.corrupt-' + Date.now()).catch(() => {});
        cache = { items: [] };
      }
      return cache;
    })();
    loadPromise.catch(() => { loadPromise = null; });
  }
  return loadPromise;
}

// Atomic persist: write a temp file, then rename over the real one, so a
// mid-write kill leaves either the old file or the new file — never a torn one.
async function persist() {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = STORE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
  await rename(tmp, STORE_PATH());
  // every record change is user-visible somewhere — nudge open apps
  import('./events.js').then(({ broadcast }) => broadcast('inbox')).catch(() => {});
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

// anything newly WAITING on Hayden earns a phone notification
function notifyIfPending(record, previousStatus) {
  if (record.status !== 'pending' || previousStatus === 'pending') return;
  import('./push.js').then(({ pushForRecord }) => pushForRecord(record)).catch(() => {});
}

export async function createRecord(record) {
  return withLock(async () => {
    const store = await load();
    store.items.push(record);
    const unresolved = store.items.filter((r) => UNRESOLVED.has(r.status));
    const resolved = store.items.filter((r) => !UNRESOLVED.has(r.status));
    if (resolved.length > MAX_RESOLVED) {
      resolved.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      store.items = [...unresolved, ...resolved.slice(0, MAX_RESOLVED)];
    }
    await persist();
    notifyIfPending(record, null);
    return record;
  });
}

export async function updateRecord(id, patch) {
  return withLock(async () => {
    const store = await load();
    const idx = store.items.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('inbox record not found');
    const previousStatus = store.items[idx].status;
    store.items[idx] = { ...store.items[idx], ...patch };
    await persist();
    notifyIfPending(store.items[idx], previousStatus);
    return store.items[idx];
  });
}

// test hook — drops the in-memory cache so a fresh NOVA_DATA_DIR is re-read
export function _resetInboxStore() {
  cache = null;
  loadPromise = null;
}
