import { api, getConnection } from './api.js';
import { tickReceipt } from './receipt.js';
import { notify } from './island.js';
import { depthOf } from './edgeBack.js';
import { demoStashState, demoVariant, demoWrites, DEMO_READER } from './stashDemo.js';
import { duplicateOf, shelfForLink } from './stashModel.js';
import { isLink, hostOf, stashKey } from './stashUrl.js';
import { todayISO } from './stashRhythm.js';

// THE STASH'S DOORS (10 Oct 2026). Kept out of App.jsx: each takes the app
// and does one thing through the one write path below.
//
// EVERY WRITE, ONE PATH (the Money precedent). Live: the server writes AND
// files a record whose Undo is the exact inverse (server/lib/stashRails.js);
// the page takes the server's Stash at once and ONE pill offers Undo through
// /api/inbox/:id/undo. Demo: the same change to the invented Stash in memory
// (src/stashDemo.js), and the same pill. Offline: refused in words, because
// nothing could keep it.

const SORT_KEY = 'novaos.stashSort';
const readSort = () => { try { return localStorage.getItem(SORT_KEY) || 'added'; } catch { return 'added'; } };

export const STASH_UI0 = { shelfOn: 'all', sort: null, q: '', search: false, edit: false, menu: null, sheet: null, add: null, flash: null, sortOpen: false };

export function stashUi(app) {
  const ui = app.state.stashUi || STASH_UI0;
  return ui.sort ? ui : { ...ui, sort: readSort() };
}
export function setStashUi(app, patch) {
  app.setState((s) => ({ stashUi: { ...(s.stashUi || STASH_UI0), ...(typeof patch === 'function' ? patch(s.stashUi || STASH_UI0) : patch) } }));
}

// the Stash this page draws: the demo's, or the Mac's last read
export function stashSource(app) {
  const st = app.state;
  if (st.connectionStatus === 'demo') return st.stashDemo || demoStashState(demoVariant());
  return st.liveStashFull || null;
}
const isDemo = (app) => app.state.connectionStatus === 'demo';
const isOffline = (app) => app.state.connectionStatus === 'offline' || !!(isDemo(app) && stashSource(app)?.offline);

export function refreshStash(app) {
  const conn = getConnection();
  if (!conn || isDemo(app)) return Promise.resolve();
  return api.stash(conn).then((r) => app.setState({ liveStash: r.categories, liveStashFull: r })).catch(() => {});
}

const ARGS = {
  add: (a) => [a],
  remove: (raw) => [raw],
  move: (raw, to) => [raw, to],
  rhythm: (raw, weeks) => [raw, weeks],
  watch: (raw, on) => [raw, on],
  read: (raw, done) => [raw, done],
  bought: (raw, o) => [raw, o],
  list: (raw) => [raw],
  check: (raw, answer) => [raw, answer],
  shelf: (o) => [o],
};

function liveCall(conn, kind, a, b) {
  if (kind === 'add') return api.stashAdd(conn, a);
  if (kind === 'remove') return api.stashRemove(conn, a);
  if (kind === 'shelf') return api.stashShelf(conn, a.name, a.date);
  const args = { move: { to: b }, rhythm: { weeks: b }, watch: { on: !!b }, read: { done: b !== false }, bought: b || {}, list: {}, check: { answer: b } }[kind];
  const action = { rhythm: 'rhythm', move: 'move', watch: 'watch', read: 'read', bought: 'bought', list: 'list', check: 'check' }[kind];
  return api.stashAct(conn, a, action, args);
}

// Returns a promise of true (written), false (refused) or { duplicate }.
export function stashWrite(app, kind, a, b) {
  if (!ARGS[kind]) return Promise.resolve(false);
  if (isOffline(app)) { app.toastMsg('Offline: the Stash is read only until Nova is back'); return Promise.resolve(false); }
  if (isDemo(app)) {
    const before = stashSource(app);
    try {
      const out = demoWrites[kind](before, ...ARGS[kind](a, b));
      app.setState({ stashDemo: out.state });
      tickReceipt({ key: `stash:${kind}:${Date.now()}`, title: out.title, undo: () => app.setState({ stashDemo: before }) });
      return Promise.resolve(true);
    } catch (e) {
      if (e.duplicate) return Promise.resolve({ duplicate: e.duplicate });
      app.toastMsg(`${e.message}. Nothing changed.`);
      return Promise.resolve(false);
    }
  }
  const conn = getConnection();
  if (!conn) return Promise.resolve(false);
  return liveCall(conn, kind, a, b).then((r) => {
    app.setState((s) => ({ liveStash: r.categories, liveStashFull: { ...(s.liveStashFull || {}), categories: r.categories, readAt: new Date().toISOString() } }));
    if (r.record) {
      tickReceipt({
        key: `stash:${r.record.id}`, label: r.record.text, title: r.record.text,
        undo: () => api.inboxUndo(conn, r.record.id).then(() => refreshStash(app)).catch((e) => app.toastMsg('Could not undo: ' + e.message)),
      });
    }
    refreshStash(app);
    if (kind === 'list' || (kind === 'check' && b === 'low')) api.shoppingList(conn).then((l) => app.setState({ liveShoppingList: l })).catch(() => {});
    return true;
  }).catch((e) => {
    if (e.detail?.duplicate) return { duplicate: e.detail.duplicate };
    app.toastMsg(`The Stash did not change: ${e.message}`);
    return false;
  });
}

/* -------------------------------- opening --------------------------------- */

export function openLink(app, card) {
  try { window.open(card.url, '_blank', 'noopener'); } catch { /* the link still exists */ }
  const at = new Date().toISOString();
  const bump = (m) => ({ ...(m || {}), opens: (m?.opens || 0) + 1, lastOpened: at });
  if (isDemo(app)) {
    const s = stashSource(app);
    app.setState({ stashDemo: { ...s, meta: { ...s.meta, [card.key]: bump(s.meta[card.key]) } } });
    return;
  }
  const conn = getConnection();
  if (!conn) return;
  app.setState((s) => (s.liveStashFull ? { liveStashFull: { ...s.liveStashFull, meta: { ...s.liveStashFull.meta, [card.key]: bump(s.liveStashFull.meta?.[card.key]) } } } : null));
  api.stashOpened(conn, card.url).catch(() => {});
}

// THE READER (mockup 90): its own history level over the Stash
export function openReader(app, card) {
  if (typeof window !== 'undefined') {
    const st = window.history.state;
    if (st?.novaView !== 'stashReader') window.history.pushState({ ...(st || {}), novaDepth: depthOf(st) + 1, novaView: 'stashReader', stashReader: card.url }, '');
  }
  app.setState({ stashReader: { url: card.url, card, doc: null, loading: true } });
  if (app.mainRef?.current) app.mainRef.current.scrollTop = 0;
  const at = new Date().toISOString();
  if (isDemo(app)) {
    const doc = /practice/.test(card.url) ? DEMO_READER : { state: 'unreadable', why: 'this demo link has no text', paras: [], words: 0, minutes: 0 };
    setTimeout(() => app.setState((s) => (s.stashReader?.url === card.url ? { stashReader: { ...s.stashReader, doc, loading: false } } : null)), 380);
    const s = stashSource(app);
    app.setState({ stashDemo: { ...s, meta: { ...s.meta, [card.key]: { ...(s.meta[card.key] || {}), opens: (s.meta[card.key]?.opens || 0) + 1, lastOpened: at } } } });
    return;
  }
  const conn = getConnection();
  if (!conn) return;
  api.stashOpened(conn, card.url).catch(() => {});
  api.stashReader(conn, card.url)
    .then((doc) => app.setState((s) => (s.stashReader?.url === card.url ? { stashReader: { ...s.stashReader, doc, loading: false } } : null)))
    .catch((e) => app.setState((s) => (s.stashReader?.url === card.url ? { stashReader: { ...s.stashReader, doc: { state: 'failed', why: e.message, paras: [] }, loading: false } } : null)));
}
export function closeReader(app) {
  if (typeof window !== 'undefined' && window.history.state?.novaView === 'stashReader' && window.history.state?.novaOverlay == null) { window.history.back(); return; }
  app.setState({ stashReader: null });
}
export function savePlace(app, card, para) {
  const place = { para, at: new Date().toISOString() };
  if (isDemo(app)) {
    const s = stashSource(app);
    app.setState({ stashDemo: { ...s, meta: { ...s.meta, [card.key]: { ...(s.meta[card.key] || {}), place } } } });
    return;
  }
  const conn = getConnection();
  if (conn) api.stashPlace(conn, card.url, para).catch(() => {});
  app.setState((s) => (s.liveStashFull ? { liveStashFull: { ...s.liveStashFull, meta: { ...s.liveStashFull.meta, [card.key]: { ...(s.liveStashFull.meta?.[card.key] || {}), place } } } } : null));
}

/* -------------------------------- sheets ---------------------------------- */

// a sheet (rhythm, move, bought, gift) is one history level: the back swipe closes it
export function openSheet(app, sheet) {
  if (typeof window !== 'undefined') {
    const st = window.history.state;
    if (st?.novaOverlay === 'stashSheet') window.history.replaceState({ ...st }, '');
    else window.history.pushState({ ...(st || {}), novaDepth: depthOf(st) + 1, novaOverlay: 'stashSheet' }, '');
  }
  setStashUi(app, { sheet, menu: null });
}
export function closeSheet(app, then) {
  if (typeof window !== 'undefined' && window.history.state?.novaOverlay === 'stashSheet') {
    if (typeof then === 'function') app.afterPop?.(then);
    window.history.back();
    if (typeof then === 'function' && !app.afterPop) setTimeout(then, 0);
    return;
  }
  setStashUi(app, { sheet: null });
  if (typeof then === 'function') setTimeout(then, 0);
}

// popstate's half (App.viewFromHistory)
export function stashFromHistory(app) {
  const st = typeof window === 'undefined' ? null : window.history.state;
  const out = {};
  const ui = app.state.stashUi;
  if (st?.novaOverlay !== 'stashSheet' && ui?.sheet) out.stashUi = { ...ui, sheet: null };
  const reader = st?.novaView === 'stashReader' ? st.stashReader : null;
  if ((app.state.stashReader?.url || null) !== (reader || null)) out.stashReader = reader ? { url: reader, card: null, doc: null, loading: true } : null;
  return out;
}

/* -------------------------------- adding ---------------------------------- */

// A pasted link: is it here already, then what does its page call itself.
export function startAdd(app, rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!isLink(url)) { setStashUi(app, { add: { stage: 'typing', url, error: url ? 'That is not a web link. Paste one that starts with https://' : null } }); return; }
  const source = stashSource(app);
  const dup = duplicateOf(source, url);
  if (dup) { flashDuplicate(app, dup); return; }
  const site = shelfForLink(source, url);
  const shelf = site?.name || source?.categories?.find((c) => !c.bought && !c.gift)?.name || 'Unsorted';
  setStashUi(app, { add: { stage: 'reading', url, shelf, hint: site ? `same site as ${site.n} on ${site.name}` : null, lasts: 0, name: '', preview: null } });
  const land = (preview) => setStashUi(app, (ui) => (ui.add?.url === url ? { add: { ...ui.add, stage: 'form', preview, name: ui.add.name || preview?.name || hostOf(url) } } : {}));
  if (isDemo(app)) {
    setTimeout(() => land({ state: 'ok', name: /vitamin-c/.test(url) ? 'Vitamin C serum 30 ml' : /plain/.test(url) ? null : hostOf(url), demoArt: /vitamin-c/.test(url) ? 'serum' : null, image: null }), 650);
    return;
  }
  const conn = getConnection();
  if (!conn || isOffline(app)) { land({ state: 'failed', why: 'offline', name: null }); return; }
  api.stashPreview(conn, url).then((r) => {
    if (r.duplicate) { setStashUi(app, { add: null }); flashDuplicate(app, r.duplicate); return; }
    land(r.preview);
  }).catch((e) => land({ state: 'failed', why: e.message, name: null }));
}

export function flashDuplicate(app, d) {
  const dup = { ...d, key: d.key || stashKey(d.url) };
  setStashUi(app, { add: { stage: 'duplicate', url: dup.url, duplicate: dup }, shelfOn: 'all', q: '', search: false, flash: dup.key });
  // the existing card scrolls into view and pulses its ring once
  setTimeout(() => {
    const el = typeof document !== 'undefined' && document.querySelector(`[data-stash-key="${CSS.escape(dup.key)}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, 60);
  setTimeout(() => setStashUi(app, (ui) => (ui.flash === dup.key ? { flash: null } : {})), 2400);
}

export function commitAdd(app) {
  const add = stashUi(app).add;
  if (!add || add.stage !== 'form') return;
  const name = String(add.name || '').trim() || hostOf(add.url);
  const lasts = Number(add.lasts) || null;
  setStashUi(app, { add: { ...add, stage: 'saving' } });
  stashWrite(app, 'add', { category: add.shelf, name, url: add.url, lasts }).then((ok) => {
    if (ok && ok.duplicate) { flashDuplicate(app, ok.duplicate); return; }
    if (ok) setStashUi(app, { add: null, flash: null, shelfOn: 'all' });
    else setStashUi(app, { add: { ...add, stage: 'form' } });
  });
}

// THE CLIPBOARD (mockup 88): read only on his tap (iOS asks first).
export async function pasteClipboard(app) {
  const offered = isDemo(app) ? stashSource(app)?.clip : null;
  if (offered) { setStashUi(app, { add: null }); startAdd(app, offered); return; }
  try {
    const text = await navigator.clipboard.readText();
    if (isLink(text)) startAdd(app, text.trim());
    else notify({ tone: 'info', title: 'No link on the clipboard', message: 'Copy a page’s address, then paste it here.', duration: 3200 });
  } catch {
    setStashUi(app, { add: { stage: 'typing', url: '', error: null } });
  }
}

export const todayForBought = () => todayISO();
