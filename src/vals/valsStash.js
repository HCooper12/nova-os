import { buildStashView, SORTS } from '../stashModel.js';
import {
  stashUi, setStashUi, stashSource, stashWrite, openLink, openReader, closeReader, savePlace,
  openSheet, closeSheet, startAdd, commitAdd, pasteClipboard, flashDuplicate,
} from '../stashActions.js';
import { getConnection, api } from '../api.js';
import { RHYTHM_WEEKS, todayISO } from '../stashRhythm.js';

// THE SUMMARY STASH'S VIEW MODEL (10 Oct 2026; mockups 84 + 88 + 90 and the
// five additions). Built only while the Stash is on screen. `view` is pure
// (src/stashModel.js); everything else is a door, each one write path with
// its pill and Undo (src/stashActions.js).

const SORT_KEY = 'novaos.stashSort';

export function valsStash(app, ctx) {
  const st = app.state;
  const ui = stashUi(app);
  const source = stashSource(app);
  const demo = ctx.demoMode;
  const offline = ctx.isOffline || !!source?.offline;
  const view = buildStashView({ stash: source, ui, demo, offline, shopping: demo ? null : st.liveShoppingList });
  const conn = demo ? null : getConnection();

  return {
    view,
    ui,
    demo,
    readOnly: offline,
    rhythmWeeks: RHYTHM_WEEKS,
    sorts: SORTS,
    clip: demo ? source?.clip || null : null,
    reader: st.stashReader || null,
    imageUrl: (file) => (conn && file ? api.stashImageBlobUrl(conn, file) : Promise.resolve(null)),
    today: todayISO(),

    // the bar and the page
    setShelf: (key) => setStashUi(app, { shelfOn: key }),
    setSort: (key) => { try { localStorage.setItem(SORT_KEY, key); } catch { /* per device, best effort */ } setStashUi(app, { sort: key, sortOpen: false }); },
    toggleSort: (open) => setStashUi(app, (u) => ({ sortOpen: open ?? !u.sortOpen })),
    toggleSearch: () => setStashUi(app, (u) => ({ search: !u.search, q: '' })),
    setQuery: (q) => setStashUi(app, { q }),
    toggleEdit: () => setStashUi(app, (u) => ({ edit: !u.edit, menu: null })),
    openMenu: (raw, rect) => setStashUi(app, { menu: { raw, rect } }),
    closeMenu: () => setStashUi(app, { menu: null }),
    openSheet: (sheet) => openSheet(app, sheet),
    closeSheet: (then) => closeSheet(app, then),

    // opening
    open: (card) => openLink(app, card),
    openReader: (card) => openReader(app, card),
    closeReader: () => closeReader(app),
    savePlace: (card, para) => savePlace(app, card, para),

    // writes
    answer: (raw, answer) => stashWrite(app, 'check', raw, answer),
    remove: (raw) => stashWrite(app, 'remove', raw),
    move: (raw, to) => stashWrite(app, 'move', raw, to),
    rhythm: (raw, weeks) => stashWrite(app, 'rhythm', raw, weeks),
    watch: (raw, on) => stashWrite(app, 'watch', raw, on),
    finish: (raw, done = true) => stashWrite(app, 'read', raw, done),
    bought: (raw, o) => stashWrite(app, 'bought', raw, o),
    toList: (raw) => stashWrite(app, 'list', raw),
    shelf: (name, date) => stashWrite(app, 'shelf', { name, date }),
    share: async (card) => {
      try {
        if (navigator.share) { await navigator.share({ title: card.name, url: card.url }); return; }
        await navigator.clipboard.writeText(card.url);
        app.toastMsg('Link copied');
      } catch (e) { if (e?.name !== 'AbortError') app.toastMsg('Could not share that link'); }
    },

    // adding
    startAdd: (url) => startAdd(app, url),
    typeAdd: (url) => setStashUi(app, { add: { stage: 'typing', url, error: null } }),
    setAdd: (patch) => setStashUi(app, (u) => (u.add ? { add: { ...u.add, ...patch } } : {})),
    cancelAdd: () => setStashUi(app, { add: null }),
    commitAdd: () => commitAdd(app),
    paste: () => pasteClipboard(app),
    showDuplicate: (dup) => flashDuplicate(app, dup),
  };
}
