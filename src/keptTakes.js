import { useSyncExternalStore } from 'react';
import { keptTake, takesAdd, takesRemove, takesPatch } from './novaThreadFacts.js';

// RECORDINGS KEPT ON THIS PHONE (29 Sep 2026, the Nova thread). A turn the Mac
// could not write down is his audio, not an error: it waits here until the
// words arrive (Try again resends the same bytes), he types them instead, or
// he deletes it. Held in memory for the page and in IndexedDB so a reload or
// an iOS reclaim does not lose it; the database is best-effort and a browser
// without one keeps the take for as long as the app is open, which is what
// "kept on this phone" can promise there. Nothing here is sent anywhere.
// The rules (newest last, a cap, one id once) are novaThreadFacts' takes*.

const DB = 'nova-kept-takes';
const STORE = 'takes';
let takes = [];
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };

function db() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE, { keyPath: 'id' }); } catch { /* exists */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function write(fn) {
  const d = await db();
  if (!d) return;
  try { const tx = d.transaction(STORE, 'readwrite'); fn(tx.objectStore(STORE)); } catch { /* best-effort */ }
}

// read back what an earlier session kept, once, on first use
let hydrated = false;
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  db().then((d) => {
    if (!d) return;
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => {
        const back = (req.result || []).map((r) => keptTake(r, r.id)).filter(Boolean);
        if (!back.length) return;
        let next = takes;
        for (const t of back) next = takesAdd(next, t);
        takes = next;
        emit();
      };
    } catch { /* nothing kept */ }
  });
}

export function keepTake(raw) {
  const t = keptTake(raw, `take-${raw?.at || Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  if (!t) return null;
  const before = new Set(takes.map((x) => x.id));
  takes = takesAdd(takes, t);
  emit();
  write((s) => {
    s.put(t);
    // the cap dropped the oldest: drop it from the database too
    for (const id of before) if (!takes.some((x) => x.id === id)) s.delete(id);
  });
  return t;
}
export function dropTake(id) {
  takes = takesRemove(takes, id);
  emit();
  write((s) => s.delete(id));
}
export function patchTake(id, patch) {
  takes = takesPatch(takes, id, patch);
  emit();
  const t = takes.find((x) => x.id === id);
  if (t) write((s) => s.put(t));
}
export function listTakes() { hydrate(); return takes; }

const subscribe = (fn) => { hydrate(); listeners.add(fn); return () => listeners.delete(fn); };
export function useKeptTakes() {
  return useSyncExternalStore(subscribe, () => takes, () => takes);
}
// the fixture's door: a frame can be drawn with a take in it (scripts only)
export function _seedTakes(list) { takes = (list || []).map((r) => keptTake(r, r.id)).filter(Boolean); emit(); }
