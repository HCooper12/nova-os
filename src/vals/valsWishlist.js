import { buildWishlistView, sheetFor, STAR_LABELS } from '../wishlistModel.js';
import {
  wishlistUi, setWishlistUi, wishlistSource, loadWishlist, openCard, openAdd, closeSheet,
  setStatus, setStars, removeItem, addLink,
} from '../wishlistActions.js';
import { wishlistAsk } from './quickCapture.js';
import { getConnection, api } from '../api.js';

// HIS WISHLIST PAGE'S VIEW MODEL (30 Oct 2026, mockup 107). ONE model for
// every style: the page (src/screens/Wishlist.jsx) draws it in the house
// tokens, which set themselves per style and material, so cupertino,
// command and summary read the same fields. Built only while the page is on
// screen; `view` is pure (src/wishlistModel.js), everything else is a door
// with one write path and its Undo (src/wishlistActions.js).

export function valsWishlist(app, ctx) {
  const st = app.state;
  if (st.screen !== 'wishlist') return { wishlist: null };
  const ui = wishlistUi(app);
  const source = wishlistSource(app);
  const demo = !!ctx.demoMode;
  const offline = !!ctx.isOffline;
  const view = buildWishlistView({ source, ui, offline });
  const conn = demo ? null : getConnection();
  const sheet = ui.sheet?.kind === 'card' ? sheetFor(source, ui.sheet.id) : null;
  const done = ui.add?.done || null;
  const answered = (done && (st.wishlistAnswered || {})[done.recordId]) || [];

  return {
    wishlist: {
      view,
      ui,
      demo,
      readOnly: offline,
      offlineNote: offline && source ? 'Offline: this is what this phone last had. Changes wait for your Mac.' : null,
      loadError: !source && st.wishlistError ? `Nova could not read your Wishlist: ${st.wishlistError}` : null,
      starLabels: STAR_LABELS,
      imageUrl: (file) => (conn && file ? api.wishlistImageBlobUrl(conn, file) : Promise.resolve(null)),

      load: () => loadWishlist(app),
      setCat: (key) => setWishlistUi(app, { cat: ui.cat === key && key !== 'all' ? 'all' : key }),
      showAllCats: () => setWishlistUi(app, { allCats: true }),
      toggleBought: () => setWishlistUi(app, (u) => ({ boughtOpen: !u.boughtOpen })),
      toggleCancelled: () => setWishlistUi(app, (u) => ({ cancelledOpen: !u.cancelledOpen })),

      // the card sheet
      open: (id) => openCard(app, id),
      close: () => closeSheet(app),
      sheet,
      openLink: (url) => { try { window.open(url, '_blank', 'noopener'); } catch { /* the link is still on the card */ } },
      bought: (item) => { closeSheet(app); return setStatus(app, item, item.bought ? 'considering' : 'purchased'); },
      thisMonth: (item) => { closeSheet(app); return setStatus(app, item, item.thisMonth ? 'considering' : 'month'); },
      remove: (item) => { closeSheet(app); return removeItem(app, item); },
      star: (item, n) => { if (n !== item.stars) setStars(app, item, n); },

      // adding by link
      addOpen: ui.sheet?.kind === 'add',
      startAdd: () => openAdd(app),
      add: ui.add ? {
        url: ui.add.url || '',
        busy: !!ui.add.busy,
        error: ui.add.error || null,
        done: done ? {
          name: done.name, said: done.said,
          undo: () => api.inboxUndo(getConnection(), done.recordId).then(() => { setWishlistUi(app, (u) => ({ add: { ...u.add, done: null } })); loadWishlist(app); }).catch((e) => app.toastMsg('Could not undo: ' + e.message)),
          ask: wishlistAsk(done.recordId, (done.questions || []).filter((q) => !answered.includes(q.field)), app),
        } : null,
      } : null,
      setUrl: (url) => setWishlistUi(app, (u) => ({ add: { ...(u.add || {}), url, error: null } })),
      submitAdd: () => addLink(app),
      paste: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) setWishlistUi(app, (u) => ({ add: { ...(u.add || {}), url: text.trim(), error: null } }));
        } catch { /* the field is still there to paste into */ }
      },
    },
  };
}
