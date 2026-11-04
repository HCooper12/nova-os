// NOVA'S SAVED STATE, KEPT TWICE (4 Nov 2026). His phone turned off; when it
// came back Nova showed demo data and asked for the backend. WebKit had lost
// the page's storage, and everything Nova keeps on the phone lives there: the
// Mac's address and token, his style and theme, the offline copy of his data
// (novaos.lastLive), a workout in progress, the queue of writes not yet sent.
// "If nova is going to function like a proper app, it needs to not need to
// rely on an external source to operate and show all of the saved data."
//
// In the iPhone app, every `novaos.*` key the page writes is copied into the
// app's own files (NovaDurable in ios/App/App/NovaBridgeViewController.swift),
// which WebKit's purges never reach. When the page's storage has been wiped,
// the app puts the copy back before any of Nova's code runs, so Nova opens on
// his data, connected, as if nothing happened.
//
// The wipe test is a stamp: `novaos.__alive` is written on every boot, so
// its absence at load means the storage was emptied (or this is the first
// run ever). A key he removed on purpose (Disconnect) is removed from the copy
// too, and a reload never brings it back.
//
// Outside the iPhone app (the Home Screen web app, a browser) there is no
// second place to keep it; the most the page can do there is ask the browser
// to treat its storage as persistent.

export const ALIVE_KEY = 'novaos.__alive';
export const FLUSH_MS = 1200;
// the big copies (the 2.3 MB data snapshot, which lives in IndexedDB) are
// serialised only this often, however often Nova syncs
export const BIG_FLUSH_MS = 30_000;
const PREFIX = 'novaos.';
const CONN_KEY = 'novaos.connection';

let active = null;

// A copy of something that does not live in localStorage (liveStore's
// IndexedDB snapshot), kept under its own key. `produce` is called at flush
// time, so a run of syncs costs one serialisation. A no-op outside the app.
export function keepCopy(key, produce) { active?.keep(key, produce); }

const mirrored = (key) => typeof key === 'string' && key.startsWith(PREFIX) && key !== ALIVE_KEY;

function nativePlugin(win) {
  try {
    const C = win?.Capacitor;
    if (!C?.isNativePlatform?.()) return null;
    return C.Plugins?.NovaDurable || null;
  } catch { return null; }
}

// Install the mirror. Returns a handle for tests ({ flush, pending, restored }),
// or null when there is nothing to mirror to.
export function startDurable({ win = typeof window !== 'undefined' ? window : null, StorageProto = typeof Storage !== 'undefined' ? Storage.prototype : null, storage = win?.localStorage } = {}) {
  if (!win || !storage) return null;
  try { storage.setItem(ALIVE_KEY, String(Date.now())); } catch { /* storage blocked */ }
  // the browser's own promise not to evict, where it offers one
  try { win.navigator?.storage?.persist?.().catch?.(() => {}); } catch { /* not offered */ }

  const plugin = nativePlugin(win);
  if (!plugin || !StorageProto) return null;

  // latest value per key; null = removed. Big keys (the data copy) are
  // written often during a sync, so writes coalesce and go out together.
  const pending = new Map();
  const big = new Map(); // key -> () => string, read at flush time
  let timer = 0;
  let bigTimer = 0;
  const flush = () => {
    clearTimeout(timer); timer = 0;
    clearTimeout(bigTimer); bigTimer = 0;
    for (const [key, produce] of big) {
      try { const v = produce(); if (typeof v === 'string') pending.set(key, v); } catch { /* skip this round */ }
    }
    big.clear();
    const jobs = [];
    for (const [key, value] of pending) {
      jobs.push(Promise.resolve(value === null ? plugin.remove({ key }) : plugin.set({ key, value })).catch(() => {
        // a failed save is tried again with the next flush, unless superseded
        if (!pending.has(key)) pending.set(key, value);
      }));
    }
    pending.clear();
    return Promise.all(jobs);
  };
  // Only a connected Nova is copied. A boot in demo (the storage was wiped
  // before this build could restore it) must not overwrite the good copy
  // with demo state; the copy starts again the moment a connection is saved.
  let armed = false;
  const seed = () => {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (mirrored(key)) pending.set(key, storage.getItem(key));
      }
    } catch { /* storage blocked */ }
  };
  const queue = (key, value) => {
    if (key === CONN_KEY) {
      if (value === null) { if (armed) { pending.set(key, null); armed = false; schedule(); } return; }
      if (!armed) { armed = true; seed(); }
    }
    if (!armed) return;
    pending.set(key, value);
    schedule();
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };

  const origSet = StorageProto.setItem;
  const origRemove = StorageProto.removeItem;
  StorageProto.setItem = function setItem(key, value) {
    const r = origSet.call(this, key, value);
    if (this === storage && mirrored(key)) queue(key, String(value));
    return r;
  };
  StorageProto.removeItem = function removeItem(key) {
    const r = origRemove.call(this, key);
    if (this === storage && mirrored(key)) queue(key, null);
    return r;
  };

  active = {
    keep(key, produce) {
      if (!mirrored(key) || !armed) return;
      pending.delete(key);
      big.set(key, produce);
      if (!bigTimer) bigTimer = setTimeout(flush, BIG_FLUSH_MS);
    },
  };

  // the app can be closed from the switcher straight after a write
  const hide = () => { if (pending.size || big.size) flush(); };
  win.addEventListener?.('pagehide', hide);
  win.document?.addEventListener?.('visibilitychange', () => { if (win.document.visibilityState === 'hidden') hide(); });

  // A first run of this build has no copy yet: seed it with everything the
  // page holds now, so the next wipe has something to come back from.
  try { armed = storage.getItem(CONN_KEY) !== null; } catch { armed = false; }
  if (armed) { seed(); if (pending.size) schedule(); }

  return { flush, pending, big, restored: Number(win.__novaRestored) || 0 };
}
