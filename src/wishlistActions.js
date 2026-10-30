import { api, getConnection } from './api.js';
import { tickReceipt } from './receipt.js';
import { depthOf } from './edgeBack.js';
import { demoWishlistState, wishlistDemoVariant } from './wishlistDemo.js';
import { STATUS } from './wishlistModel.js';

// THE WISHLIST'S DOORS (30 Oct 2026, mockup 107). Kept out of App.jsx: each
// takes the app and does one thing.
//
// EVERY WRITE, ONE PATH (the Stash precedent, src/stashActions.js). Live:
// the card changes on screen at once, the server writes to his Notion row
// AND files an Inbox record whose Undo is the exact inverse
// (server/lib/wishlist.js undoWishlist); ONE pill offers that Undo through
// /api/inbox/:id/undo. A refused write puts the card back and says why.
// Demo: the same change in memory, the same pill. Offline: refused in
// words, because nothing could keep it.

export const WISHLIST_UI0 = { cat: 'all', allCats: false, boughtOpen: false, cancelledOpen: false, sheet: null, add: null };

export function wishlistUi(app) { return app.state.wishlistUi || WISHLIST_UI0; }
export function setWishlistUi(app, patch) {
  app.setState((s) => ({ wishlistUi: { ...(s.wishlistUi || WISHLIST_UI0), ...(typeof patch === 'function' ? patch(s.wishlistUi || WISHLIST_UI0) : patch) } }));
}

const isDemo = (app) => app.state.connectionStatus === 'demo';
const isOffline = (app) => app.state.connectionStatus === 'offline';

// the list this page draws: the demo's, or the Mac's last read
export function wishlistSource(app) {
  if (isDemo(app)) return app.state.wishlistDemo !== undefined && app.state.wishlistDemo !== null ? app.state.wishlistDemo : demoWishlistState(wishlistDemoVariant());
  return app.state.liveWishlist || null;
}
function setSource(app, next) {
  app.setState(isDemo(app) ? { wishlistDemo: next } : { liveWishlist: next });
}

// read on arrival (never at boot); while Nova is still reading Notion, look
// again every few seconds until the read lands, then stop
let polls = 0;
let pollTimer = null;
export function loadWishlist(app, { again = false } = {}) {
  if (isDemo(app)) return Promise.resolve();
  const conn = getConnection();
  if (!conn) return Promise.resolve();
  if (!again) { polls = 0; clearTimeout(pollTimer); }
  return api.wishlist(conn).then((r) => {
    app.setState({ liveWishlist: r, wishlistError: null });
    if (r.syncing && polls < 20 && app.state.screen === 'wishlist') {
      polls += 1;
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => loadWishlist(app, { again: true }), 3000);
    }
  }).catch((e) => app.setState({ wishlistError: e.message }));
}

/* --------------------------------- sheets --------------------------------- */

// the card sheet is a history level, so the back swipe closes it
export function openCard(app, id) {
  if (typeof window !== 'undefined') {
    const st = window.history.state;
    if (st?.novaOverlay === 'wishlistSheet') window.history.replaceState({ ...st }, '');
    else window.history.pushState({ ...(st || {}), novaDepth: depthOf(st) + 1, novaOverlay: 'wishlistSheet' }, '');
  }
  setWishlistUi(app, { sheet: { kind: 'card', id } });
}
export function openAdd(app) {
  if (typeof window !== 'undefined') {
    const st = window.history.state;
    if (st?.novaOverlay !== 'wishlistSheet') window.history.pushState({ ...(st || {}), novaDepth: depthOf(st) + 1, novaOverlay: 'wishlistSheet' }, '');
  }
  setWishlistUi(app, { sheet: { kind: 'add' }, add: { url: '', busy: false, error: null, done: null } });
}
export function closeSheet(app) {
  if (typeof window !== 'undefined' && window.history.state?.novaOverlay === 'wishlistSheet') { window.history.back(); return; }
  setWishlistUi(app, { sheet: null });
}
// popstate's half (App.viewFromHistory)
export function wishlistFromHistory(app) {
  const st = typeof window === 'undefined' ? null : window.history.state;
  const ui = app.state.wishlistUi;
  return st?.novaOverlay !== 'wishlistSheet' && ui?.sheet ? { wishlistUi: { ...ui, sheet: null } } : {};
}

/* --------------------------------- writes --------------------------------- */

const STATUS_OF = { considering: STATUS.considering, month: STATUS.month, purchased: STATUS.purchased };
const STATUS_WORD = { considering: 'Considering', month: 'This month', purchased: 'Bought' };

function patchItem(src, id, patch) {
  if (!src) return src;
  return { ...src, items: patch === null ? src.items.filter((i) => i.id !== id) : src.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

// one write: the change on screen now, the server's record and its Undo after
function write(app, { id, patch, title, live }) {
  if (isOffline(app)) { app.toastMsg('Offline: the Wishlist is read only until your Mac is back'); return Promise.resolve(false); }
  const before = wishlistSource(app);
  if (!before) return Promise.resolve(false);
  setSource(app, patchItem(before, id, patch));
  if (isDemo(app)) {
    tickReceipt({ key: `wish:${id}:${Date.now()}`, title, undo: () => app.setState({ wishlistDemo: before }) });
    return Promise.resolve(true);
  }
  const conn = getConnection();
  if (!conn) { setSource(app, before); return Promise.resolve(false); }
  return live(conn).then((r) => {
    if (r?.recordId) {
      tickReceipt({
        key: `wish:${r.recordId}`, label: title, title,
        undo: () => api.inboxUndo(conn, r.recordId).then(() => loadWishlist(app)).catch((e) => app.toastMsg('Could not undo: ' + e.message)),
      });
    }
    return true;
  }).catch((e) => {
    app.setState({ liveWishlist: before });
    app.toastMsg(`Your Wishlist did not change: ${e.message}`);
    return false;
  });
}

export function setStatus(app, item, key) {
  return write(app, {
    id: item.id, patch: { status: STATUS_OF[key] },
    title: `${item.name}: ${STATUS_WORD[key]}`,
    live: (conn) => api.wishlistStatus(conn, item.id, key),
  });
}
export function setStars(app, item, stars) {
  const n = Math.max(0, Math.min(3, stars));
  return write(app, {
    id: item.id, patch: { stars: n },
    title: n ? `${'★'.repeat(n)} ${item.name}` : `No star on ${item.name}`,
    live: (conn) => api.wishlistStar(conn, item.id, n),
  });
}
export function removeItem(app, item) {
  return write(app, {
    id: item.id, patch: null,
    title: `Removed ${item.name}`,
    live: (conn) => api.wishlistRemove(conn, item.id),
  });
}

/* --------------------------------- adding --------------------------------- */

// A link, added at once with what code read off the page; only what code
// could not read comes back, as taps (the same AskTaps Quick Capture shows)
export function addLink(app) {
  const ui = wishlistUi(app);
  const url = String(ui.add?.url || '').trim();
  if (!/^https?:\/\/\S+\.\S+/i.test(url)) { setWishlistUi(app, (u) => ({ add: { ...u.add, error: 'Paste a web link that starts with https://' } })); return; }
  if (isOffline(app)) { setWishlistUi(app, (u) => ({ add: { ...u.add, error: 'Offline: Nova adds it once your Mac is back. Nothing was added.' } })); return; }
  if (isDemo(app)) { setWishlistUi(app, (u) => ({ add: { ...u.add, error: 'Demo: nothing reaches Notion here.' } })); return; }
  const conn = getConnection();
  if (!conn) return;
  setWishlistUi(app, (u) => ({ add: { ...u.add, busy: true, error: null } }));
  api.wishlistAdd(conn, url).then((r) => {
    setWishlistUi(app, (u) => ({ add: { ...u.add, busy: false, url: '', done: { recordId: r.recordId, name: r.name, said: r.said, questions: r.questions || [] } } }));
    app.refreshInbox?.();
    loadWishlist(app);
  }).catch((e) => setWishlistUi(app, (u) => ({ add: { ...u.add, busy: false, error: e.message } })));
}
