// Last-known-good snapshot of the live data slices, so a configured device
// whose backend is unreachable (Mac asleep, off Tailscale, airplane mode)
// shows real-but-stale data with an honest offline mark instead of silently
// reverting to the demo dataset.
//
// IN INDEXEDDB, NOT localStorage (offline mode, 2 Nov 2026). The snapshot
// measured 2.3 MB of his real data, against the ~5 MB iOS gives an origin's
// localStorage — shared with the Outbox, the live session, the bests and
// every setting. A save that hit the cap threw, the throw was swallowed, and
// the phone would have kept serving an ever older copy with nothing on
// screen to say so. IndexedDB has no such cap in practice and takes the
// object as it is (no 2 MB JSON.stringify on the main thread every sync).
//
// A tiny marker stays in localStorage so the boot can decide SYNCHRONOUSLY
// whether there is a copy to wait for (the 350 ms launch blink versus the
// first-connect wait), and so a failed save is remembered and can be told.
import { keepCopy } from './durable.js';

const LEGACY_KEY = 'novaos.lastLive'; // the old localStorage copy, migrated once
const META_KEY = 'novaos.lastLive.meta';
const DB_NAME = 'novaos';
const STORE = 'kv';
const LIVE = 'lastLive';

let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    } catch (e) { reject(e); }
  });
  dbp.catch(() => { dbp = null; }); // a later call may succeed (private mode can lift)
  return dbp;
}

export async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
  });
}

export async function idbDel(key) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch { return null; }
}
function writeMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* the marker is a hint, not the copy */ }
}

// Sync: is there a copy worth waiting for at boot?
export function hasLiveCache() {
  const m = readMeta();
  if (m?.savedAt) return true;
  try { return Boolean(localStorage.getItem(LEGACY_KEY)); } catch { return false; }
}

// When the last save failed (and why), so a screen can say the offline copy
// is older than it should be instead of pretending. null when all is well.
export function liveCacheTrouble() {
  const m = readMeta();
  return m?.failedAt && (!m.savedAt || m.failedAt > m.savedAt) ? { at: m.failedAt, why: m.why || 'the phone refused to store it' } : null;
}

function legacyCopy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.slices ? parsed : null;
  } catch { return null; }
}

// The copy, or null. Moves an old localStorage copy into IndexedDB on the
// way (and frees its 2 MB), so an update never boots a phone with nothing.
export async function loadLiveCache() {
  try {
    const got = await idbGet(LIVE);
    if (got && got.slices) return got;
  } catch { /* fall through to the old copy */ }
  const legacy = legacyCopy();
  if (legacy) {
    try {
      await idbSet(LIVE, legacy);
      writeMeta({ savedAt: legacy.savedAt });
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* keep the old copy where it is; it still reads */ }
  }
  return legacy;
}

// Resolves to where it landed ('idb' | 'localStorage') or null when it could
// not be stored anywhere — and THAT is recorded, never swallowed.
// `syncedAt` is when the data last came from the Mac. A save made after an
// offline write (the meal he just logged) keeps the OLD sync time, so the
// page never claims to be fresher than its data.
export async function saveLiveCache(slices, syncedAt = null) {
  const copy = { savedAt: new Date().toISOString(), syncedAt: syncedAt || new Date().toISOString(), slices };
  try {
    await idbSet(LIVE, copy);
    writeMeta({ savedAt: copy.savedAt });
    // only when there is one: a removal is copied to the app's files too
    try { if (localStorage.getItem(LEGACY_KEY) !== null) localStorage.removeItem(LEGACY_KEY); } catch { /* fine */ }
    // the iPhone app keeps a second copy in its own files (src/durable.js),
    // under the legacy key, so a WebKit wipe restores it into localStorage
    // and loadLiveCache's migration moves it back into IndexedDB
    keepCopy(LEGACY_KEY, () => JSON.stringify(copy));
    return 'idb';
  } catch (e) {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(copy));
      writeMeta({ savedAt: copy.savedAt });
      return 'localStorage';
    } catch (e2) {
      writeMeta({ ...(readMeta() || {}), failedAt: copy.savedAt, why: String(e2?.name || e?.name || 'storage full') });
      return null;
    }
  }
}

export async function clearLiveCache() {
  try { localStorage.removeItem(LEGACY_KEY); localStorage.removeItem(META_KEY); } catch { /* best-effort */ }
  try { await idbDel(LIVE); } catch { /* best-effort */ }
}
