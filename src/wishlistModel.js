// HIS WISHLIST PAGE'S MODEL (30 Oct 2026; design/mockups/107-wishlist.html,
// approved as drawn: "Yes looking good"). Pure: GET /api/wishlist's answer
// (server/lib/wishlist.js wishlistView) plus the page's own filter in, the
// page out. No DOM, no app, so server/test/wishlistView.test.js holds it.
//
// What it keeps true:
//   - his own Status groups the page: Considering, This month, Purchased
//     (folded, so the things he still wants lead); a group with nothing in it
//     says so rather than vanishing
//   - his priority is a dot in HIS Notion colours (High green, Medium blue,
//     Low yellow); no priority is no dot, never a guessed one
//   - stars are his ⭐️ marks: 1 most wanted, 2 higher, 3 an even higher want
//   - a price shows only when his row has one; the store is the link's host,
//     "no link" when the row has none
//   - six chips up front (All, ★ Most wanted, his four fullest categories),
//     the rest behind "Show all" (choice overload)
//   - when Notion cannot show the list, the page says what to do, as steps,
//     in the content (never a banner)

export const STATUS = { considering: 'Considering Purchase', month: 'Purchasing This Month', purchased: 'Purchased', cancelled: 'Cancelled' };
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
export const PRIORITY_KEY = { High: 'h', Medium: 'm', Low: 'l' };
export const STAR_LABELS = ['No star', '★ Most wanted', '★★ Top', '★★★ Very top'];
const UP_FRONT_CATEGORIES = 4;
const SHARE_STEPS = ['Open <b>My Shopping Wishlist</b> in Notion', 'Tap ··· then <b>Connections</b>', 'Add <b>Nova</b>. This page fills in within a minute'];

/** "2 min ago", "3 hours ago", "yesterday", "28 Oct". Pure. */
export function agoLabel(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  if (h < 48) return 'yesterday';
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** His price, in the dollars Notion holds (AUD). Pure. */
export function priceLabel(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** His size, from the Sizes section of his Notion page, when this item is
 *  one it names: a Shoes row gets his shoe size, a pair of pants his pants
 *  size. Nothing guessed: a jacket matches no label, so no row. Pure. */
export function sizeFor(item, sizes) {
  if (!sizes || typeof sizes !== 'object') return null;
  const hay = `${item.name || ''} ${(item.categories || []).join(' ')}`.toLowerCase();
  for (const [label, lines] of Object.entries(sizes)) {
    const words = label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && w !== 'size');
    if (words.some((w) => new RegExp(`\\b${w.replace(/s$/, '')}s?\\b`).test(hay))) return { label, lines };
  }
  return null;
}

// the order inside a group: his priority, then his stars, then Notion's own order
function sortItems(list) {
  return list.map((it, i) => ({ it, i })).sort((a, b) => {
    const pa = PRIORITY_RANK[a.it.priority] ?? 3; const pb = PRIORITY_RANK[b.it.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    if ((b.it.stars || 0) !== (a.it.stars || 0)) return (b.it.stars || 0) - (a.it.stars || 0);
    return a.i - b.i;
  }).map((x) => x.it);
}

function card(it) {
  return {
    id: it.id,
    name: it.name || 'Untitled',
    store: it.store || 'no link',
    link: it.link || null,
    pri: PRIORITY_KEY[it.priority] || null,
    priority: it.priority || null,
    stars: Math.max(0, Math.min(3, it.stars || 0)),
    starMark: it.stars ? '★'.repeat(Math.min(3, it.stars)) : '',
    price: priceLabel(it.price),
    image: it.image || null,
    demoArt: it.demoArt || null,
    status: it.status,
    categories: it.categories || [],
    notes: it.notes || null,
  };
}

export function buildWishlistView({ source, ui = {}, offline = false, now = Date.now() }) {
  const cat = ui.cat || 'all';
  if (!source) {
    return { state: offline ? 'offline-empty' : 'loading', syncLine: offline ? 'Offline, and this phone has not read your Wishlist yet' : 'Reading your Notion list…' };
  }
  const items = Array.isArray(source.items) ? source.items : [];
  const read = agoLabel(source.lastSync, now);

  if (source.shared === false) {
    const connect = /connect notion/i.test(source.reason || '');
    return {
      state: 'not-shared',
      syncLine: read ? `Last read ${read}` : 'Not read yet',
      notice: connect
        ? { title: 'Nova is not connected to Notion yet', body: 'Your Wishlist lives in Notion, so Nova needs your Notion connection first.', steps: ['Open <b>Settings</b> in Nova', 'Find <b>Notion</b> and connect it', 'Then share <b>My Shopping Wishlist</b> with Nova'] }
        : { title: 'Nova can’t see your Wishlist yet', body: 'Notion only shows Nova the pages you share with it.', steps: SHARE_STEPS },
      // anything it read before the share went away stays on the page, labelled
      stale: items.length > 0,
    };
  }

  const activeItems = items.filter((i) => i.status !== STATUS.purchased && i.status !== STATUS.cancelled);
  const counts = {};
  for (const it of activeItems) for (const c of it.categories || []) counts[c] = (counts[c] || 0) + 1;
  const names = [...new Set([...(source.categories || []), ...Object.keys(counts)])]
    .filter((c) => counts[c])
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const chip = (key, label, n) => ({ key, label, n, on: cat === key });
  const catChips = names.map((c) => chip(`c:${c}`, c, counts[c]));
  const upFront = catChips.slice(0, UP_FRONT_CATEGORIES);
  const rest = catChips.slice(UP_FRONT_CATEGORIES);
  // a chosen chip from behind "Show all" stays in view
  const chosenRest = rest.find((c) => c.on);
  const starred = activeItems.filter((i) => (i.stars || 0) > 0).length;
  const chips = [chip('all', 'All', activeItems.length), ...(starred ? [chip('star', '★ Most wanted', starred)] : []), ...upFront, ...(chosenRest && !ui.allCats ? [chosenRest] : [])];
  const moreChips = ui.allCats ? rest : [];

  const pass = (it) => cat === 'all' ? true : cat === 'star' ? (it.stars || 0) > 0 : (it.categories || []).includes(cat.slice(2));
  const shown = items.filter(pass);
  const of = (status) => sortItems(shown.filter((i) => (i.status || STATUS.considering) === status)).map(card);
  const considering = sortItems(shown.filter((i) => ![STATUS.month, STATUS.purchased, STATUS.cancelled].includes(i.status))).map(card);
  const month = of(STATUS.month);
  const purchased = of(STATUS.purchased);
  const cancelled = of(STATUS.cancelled);

  const fold = (list, word) => (list.length ? {
    count: list.length,
    title: `${list.length} ${word}`,
    preview: list.slice(0, 3).map((c) => (c.price ? `${c.name} · ${c.price}` : c.name)).join(', ') + (list.length > 3 ? '…' : ''),
    thumbs: list.slice(0, 3),
  } : null);

  return {
    state: items.length ? 'ready' : 'empty',
    syncLine: source.syncing && !source.lastSync ? 'Reading your Notion list…' : read ? `From your Notion list · read ${read}` : 'Not read yet',
    syncAgo: read,
    syncing: !!source.syncing,
    // shared, but the last read failed: what it has is still shown, and why it is old
    readError: source.error ? `Notion did not answer the last read (${source.error}), so this is what Nova read ${read || 'before'}.` : null,
    chips,
    moreCount: ui.allCats ? 0 : rest.length - (chosenRest ? 1 : 0),
    moreChips,
    filtered: cat !== 'all',
    noMatch: cat !== 'all' && shown.length === 0,
    groups: [
      { key: 'considering', label: 'Considering', countLabel: considering.length ? String(considering.length) : 'none', cards: considering, empty: considering.length ? null : 'Nothing under Considering here.' },
      { key: 'month', label: 'This month', countLabel: month.length ? String(month.length) : 'none', cards: month, empty: month.length ? null : 'Nothing marked for this month. Tap a card, then <b>This month</b>.' },
    ],
    purchased: { label: 'Purchased', countLabel: purchased.length ? String(purchased.length) : 'none', cards: purchased, fold: fold(purchased, 'bought'), open: !!ui.boughtOpen },
    cancelled: cancelled.length ? { label: 'Cancelled', countLabel: String(cancelled.length), cards: cancelled, fold: fold(cancelled, 'set aside'), open: !!ui.cancelledOpen } : null,
    activeCount: activeItems.length,
  };
}

/** The open card's sheet. Pure. */
export function sheetFor(source, id) {
  const it = (source?.items || []).find((i) => i.id === id);
  if (!it) return null;
  const c = card(it);
  const statusWord = it.status === STATUS.month ? 'This month' : it.status === STATUS.purchased ? 'Purchased' : it.status === STATUS.cancelled ? 'Cancelled' : 'Considering';
  return {
    ...c,
    statusWord,
    linkShown: c.link ? c.link.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '') : null,
    size: sizeFor(it, source.sizes),
    bought: it.status === STATUS.purchased,
    thisMonth: it.status === STATUS.month,
  };
}
