import { rhythmOf, learnedRhythm, daysBetween, todayISO } from './stashRhythm.js';
import { stashKey } from './stashUrl.js';

// THE STASH PAGE'S VIEW, BY CODE (10 Oct 2026; mockups 84, 88, 90 and his
// five additions). Everything the summary page draws is computed here from
// the server's GET /stash (or the demo's same shape): the serif news line,
// the due check, the vials, the shelf bar, every card's badge, the gift days,
// the Bought rows and the sort. The screen adds nothing up and writes no
// sentence of its own.
//
// COLOUR MEANS SOMETHING (§2b): the Stash's own hue is teal (--nv-m-back,
// the Librarian's); each shelf owns one house hue, carried into its tile,
// its vials and its badge dots; gold only where a check waits on him; green
// only on "on your list", a price that dropped and a done receipt.

const SHELF_LOOK = [
  [/skin|beauty|bath|face|hair/i, { glyph: 'skin', hue: 'var(--nv-mg)' }],
  [/kitchen|coffee|pantry|food|cook/i, { glyph: 'kit', hue: 'var(--nv-or)' }],
  [/desk|setup|office|tech|gear|computer/i, { glyph: 'desk', hue: 'var(--nv-vi)' }],
  [/read|article|essay|later|book/i, { glyph: 'read', hue: 'var(--nv-m-shoulders)' }],
  [/supplement|health|gym|train/i, { glyph: 'leaf', hue: 'var(--nv-m-biceps)' }],
  [/cloth|wear|shoe|style/i, { glyph: 'tag', hue: 'var(--nv-m-quads)' }],
  [/home|house|garden|clean/i, { glyph: 'home', hue: 'var(--nv-m-calves)' }],
];
const SPARE = ['var(--nv-m-quads)', 'var(--nv-m-glutes)', 'var(--nv-m-calves)', 'var(--nv-m-abs)', 'var(--nv-m-chest)', 'var(--nv-m-mobility)'];
const hash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function shelfLook(c) {
  if (c?.bought) return { glyph: 'bag', hue: 'var(--nv-good)' };
  if (c?.gift) return { glyph: 'gift', hue: 'var(--nv-m-chest)' };
  for (const [re, look] of SHELF_LOOK) if (re.test(c?.name || '')) return look;
  return { glyph: 'tag', hue: SPARE[hash(c?.name || '') % SPARE.length] };
}

export const VIAL_MAX = 8;

export const SORTS = [
  { key: 'opened', label: 'Last opened', sub: 'The ones you use first' },
  { key: 'added', label: 'Added', sub: 'As Stash.md lists them' },
  { key: 'name', label: 'Name', sub: 'A to Z' },
  { key: 'days', label: 'Days left', sub: 'Restocks first' },
];

const plural = (n, w, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;
const money = (n) => `$${Number(n).toFixed(2)}`;
// a difference reads whole when it is whole: "Down $10", "Down $4.45"
const moneyShort = (n) => (Math.abs(Number(n) - Math.round(Number(n))) < 0.005 ? `$${Math.round(Number(n))}` : money(n));
// "Hydrating cleanser 236 ml" -> "Hydrating cleanser"
export const shortName = (s) => String(s || '').replace(/\s+\d[\d.,]*\s*(ml|g|kg|l|oz|pack|x|cm|mm|in)\b.*$/i, '').trim() || String(s || '');

const DAY = 86400000;
function agoWords(iso, now) {
  if (!iso) return null;
  const d = Math.floor((now - Date.parse(iso)) / DAY);
  if (!(d >= 0)) return null;
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return d < 14 ? `${d} days ago` : `${Math.round(d / 7)} weeks ago`;
}
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : null);

function isReadingShelf(c, meta) {
  if (/read|article|essay|later/i.test(c.name)) return true;
  return c.items.length > 0 && c.items.every((i) => meta[i.key]?.article && !meta[i.key]?.product);
}

// the badge on a card's picture, most pressing first
function badgeOf({ it, r, m, onList, now }) {
  if (r?.due) return { tone: 'due', text: 'Check the level' };
  if (onList) return { tone: 'list', text: 'On your list' };
  const p = m?.price;
  const fresh = p?.event && daysBetween(p.event.on, todayISO(now)) <= 7;
  if (fresh && p.event.type === 'price-drop' && p.event.from != null && p.event.to != null) return { tone: 'drop', text: `Down ${moneyShort(p.event.from - p.event.to)}` };
  if (fresh && p.event.type === 'back-in-stock') return { tone: 'drop', text: 'Back in stock' };
  if (m?.via === 'safari' && m.addedAt && now - Date.parse(m.addedAt) < DAY) return { tone: 'new', text: 'From Safari' };
  if (r) return { tone: 'days', text: `${plural(r.left, 'day')} left` };
  if (it.watch && p?.state === 'blocked') return { tone: 'quiet', text: 'Blocked by the site' };
  if (it.watch && p?.amount != null) return { tone: 'quiet', text: `Watching · ${money(p.amount)}` };
  if (it.watch) return { tone: 'quiet', text: 'Watching the price' };
  return null;
}

// what the menu says about a watched price, in words
export function priceWords(it, m) {
  if (!it.watch) return null;
  const p = m?.price;
  if (!p) return 'Watching. Nova reads the page once a day; nothing read yet.';
  const when = p.checkedOn ? shortDay(p.checkedOn) : 'today';
  if (p.state === 'blocked') return `Blocked by the site on ${when} (${p.why}). Nova does not get round a bot check; it tries once tomorrow.`;
  if (p.state === 'failed') return `Could not read the page on ${when} (${p.why}).`;
  if (p.state === 'no-price') return `No price on its page (read ${when}).`;
  return `${p.amount != null ? money(p.amount) : 'No price'}${p.inStock === false ? ', out of stock' : p.inStock ? ', in stock' : ''}, read ${when}.`;
}

/**
 * The page's whole view.
 * @param {object} a { stash, ui: { shelfOn, sort, q, fresh }, now, demo, offline, shopping, connected }
 */
export function buildStashView({ stash, ui = {}, now = Date.now(), demo = false, offline = false, shopping = null } = {}) {
  if (!stash || stash.loading) return { state: 'loading' };
  const today = todayISO(now);
  const meta = stash.meta || {};
  const cats = stash.categories || [];
  const live = cats.filter((c) => !c.bought);
  const boughtShelf = cats.find((c) => c.bought) || null;
  const total = live.reduce((n, c) => n + c.items.length, 0);

  // on the shopping list: the demo's own set, or a live unticked line the
  // Stash put there with the same name
  const listed = new Set(stash.onList || []);
  for (const l of shopping?.items || []) if (l && !l.checked && l.source === 'stash') listed.add(`name:${String(l.name).toLowerCase()}`);
  const onList = (it) => listed.has(it.key) || listed.has(`name:${String(it.name).toLowerCase()}`);

  // the bought history per link: the rhythm learns from it
  const history = new Map();
  for (const b of boughtShelf?.items || []) { if (!history.has(b.key)) history.set(b.key, []); history.get(b.key).push(b.bought); }

  const items = [];
  for (const c of live) for (const it of c.items) items.push({ it, c, r: rhythmOf(it, today) });
  const due = items.filter((x) => x.r?.due).sort((a, b) => a.r.left - b.r.left);
  const tracked = items.filter((x) => x.r).sort((a, b) => a.r.left - b.r.left);

  const q = String(ui.q || '').trim().toLowerCase();
  const sort = SORTS.some((s) => s.key === ui.sort) ? ui.sort : 'added';
  const match = (it, c) => !q || `${it.name} ${it.host} ${it.note || ''} ${c.name}`.toLowerCase().includes(q);

  const card = (it, c, look, r) => {
    const m = meta[it.key] || null;
    const learned = learnedRhythm(history.get(it.key) || []);
    return {
      raw: it.raw, key: it.key, name: it.name, url: it.url, host: it.host, note: it.note, shelf: c.name,
      hue: look.hue, glyph: look.glyph,
      image: m?.image || null, demoArt: m?.demoArt || null,
      sub: sort === 'opened' && m?.lastOpened ? `opened ${agoWords(m.lastOpened, now)}` : it.host,
      subLit: sort === 'opened' && !!m?.lastOpened,
      badge: badgeOf({ it, r, m, onList: onList(it), now }),
      rhythm: r ? { ...r, learned } : null,
      lasts: it.lasts, bought: it.bought, learned,
      watch: it.watch, priceWords: priceWords(it, m),
      onList: onList(it),
      read: it.read, minutes: m?.minutes || null, place: m?.place || null, article: !!m?.article,
      isNew: m?.via === 'safari' && m.addedAt && now - Date.parse(m.addedAt) < DAY,
      opens: m?.opens || 0, lastOpened: m?.lastOpened || null, addedAt: m?.addedAt || null,
    };
  };

  // mockup 90 s3: a link that came in from Safari in the last day sits first
  // on its shelf in Added (and Last opened puts it first by its time); Name
  // and Days left stay strict
  const order = (list) => {
    if (sort === 'added') return [...list.filter((x) => x.isNew), ...list.filter((x) => !x.isNew)];
    const idx = new Map(list.map((x, i) => [x.key, i]));
    const by = {
      opened: (a, b) => (Date.parse(b.lastOpened || b.addedAt || 0) || 0) - (Date.parse(a.lastOpened || a.addedAt || 0) || 0),
      name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
      days: (a, b) => (a.rhythm ? a.rhythm.left : 1e9) - (b.rhythm ? b.rhythm.left : 1e9),
    }[sort];
    return [...list].sort((a, b) => by(a, b) || idx.get(a.key) - idx.get(b.key));
  };

  const shelves = [];
  const byRaw = {};
  for (const c of live) {
    const look = shelfLook(c);
    const all = c.items.map((it) => card(it, c, look, rhythmOf(it, today)));
    for (const x of all) byRaw[x.raw] = x;
    const shown = new Set(c.items.filter((it) => match(it, c)).map((it) => it.raw));
    const cards = order(all.filter((x) => shown.has(x.raw)));
    const until = c.date ? daysBetween(today, c.date) : null;
    shelves.push({
      name: c.name, raw: c.raw, hue: look.hue, glyph: look.glyph, gift: c.gift, date: c.date,
      count: c.items.length,
      rows: isReadingShelf(c, meta),
      dateWords: c.date ? (until >= 0 ? `${dayLabel(c.date)} · ${until === 0 ? 'today' : until === 1 ? 'tomorrow' : `in ${until} days`}` : `was ${shortDay(c.date)}`) : null,
      dateSoon: until != null && until >= 0 && until <= 14,
      cards,
    });
  }
  // gift shelves after his own, in Stash.md order within each
  shelves.sort((a, b) => (a.gift ? 1 : 0) - (b.gift ? 1 : 0));

  const bought = boughtShelf ? {
    name: boughtShelf.name, hue: shelfLook(boughtShelf).hue, glyph: 'bag', count: boughtShelf.items.length,
    rows: [...boughtShelf.items].filter((it) => match(it, boughtShelf))
      .sort((a, b) => String(b.bought || '').localeCompare(String(a.bought || '')))
      .map((it) => ({
        raw: it.raw, key: it.key, name: it.name, url: it.url, host: it.host,
        sub: `Bought ${it.bought ? shortDay(it.bought) : 'on a day not recorded'}${it.paid ? ` · ${money(it.paid)}` : ''}${it.from ? ` · from ${it.from}` : ''}`,
        image: meta[it.key]?.image || null, demoArt: meta[it.key]?.demoArt || null,
      })),
  } : null;

  const shelfCount = live.length;
  const visible = shelves.filter((s) => ui.shelfOn === 'all' || !ui.shelfOn || s.name === ui.shelfOn || (ui.shelfOn === 'Bought' && false));

  // THE NEWS, one serif sentence by code: what waits on him first, then the size of the Stash
  const news = [];
  if (due.length === 1) news.push({ text: `${shortName(due[0].it.name)} is due a look. ` });
  else if (due.length > 1) news.push({ text: String(due.length), num: due.length, hue: 'var(--nv-gold)', b: true }, { text: ' to check soon. ' });
  else {
    const drop = items.map((x) => ({ x, p: meta[x.it.key]?.price })).find(({ x, p }) => x.it.watch && p?.event?.type === 'price-drop' && daysBetween(p.event.on, today) <= 7);
    const gift = shelves.find((s) => s.gift && s.dateSoon);
    if (drop) news.push({ text: shortName(drop.x.it.name) }, { text: ' is down ' }, { text: moneyShort(drop.p.event.from - drop.p.event.to), hue: 'var(--nv-good)' }, { text: '. ' });
    else if (gift) news.push({ text: `${gift.gift}'s day is ${gift.dateWords.split(' · ')[1]}. ` });
  }
  if (total) {
    news.push({ text: String(total), num: total, b: true }, { text: ` ${total === 1 ? 'link' : 'links'} on ${plural(shelfCount, 'shelf', 'shelves')}` });
    news.push({ text: !due.length && tracked.length && news.length === 2 ? ', nothing running low.' : '.' });
    // mockup 90 s3: "One came in from Safari just now."
    const fromSafari = items.filter((x) => { const m = meta[x.it.key]; return m?.via === 'safari' && m.addedAt && now - Date.parse(m.addedAt) < DAY; }).length;
    if (fromSafari && !due.length) news.push({ text: ` ${fromSafari === 1 ? 'One' : String(fromSafari)} came in from Safari today.` });
  }

  const status = offline ? `Offline · showing the Stash as of ${clock(stash.readAt) || 'the last read'}`
    : demo ? 'Demo links, invented'
      : `Lives in your vault · synced ${clock(stash.readAt) || 'just now'}`;

  const first = due[0];
  return {
    state: total || boughtShelf?.items.length || live.length ? 'ready' : 'empty',
    today, total, shelfCount, news, status, offline, demo,
    due: first ? { ...card(first.it, first.c, shelfLook(first.c), first.r), words: first.r.left ? `About ${plural(first.r.left, 'day')} left by the calendar` : `Empty by the calendar: bought ${plural(first.r.since, 'day')} ago` } : null,
    dueCount: due.length,
    // the instrument holds two rows; the rest are one tap away in the Days left sort
    vialsMore: Math.max(0, tracked.length - VIAL_MAX),
    vials: tracked.slice(0, VIAL_MAX).map(({ it, c, r }) => ({ raw: it.raw, key: it.key, name: shortName(it.name), full: it.name, hue: shelfLook(c).hue, level: r.level, checkFrac: r.checkFrac, left: r.left, due: r.due })),
    chips: [{ key: 'all', label: 'All', count: total }, ...shelves.map((s) => ({ key: s.name, label: s.name, count: s.count, hue: s.hue, glyph: s.glyph })), ...(bought ? [{ key: 'Bought', label: 'Bought', count: bought.count, hue: bought.hue, glyph: 'bag' }] : [])],
    shelves: ui.shelfOn === 'Bought' ? [] : visible,
    byRaw,
    bought: ui.shelfOn && ui.shelfOn !== 'all' && ui.shelfOn !== 'Bought' ? null : bought,
    shelfNames: live.filter((c) => !c.gift).map((c) => c.name),
    giftNames: live.filter((c) => c.gift).map((c) => c.name),
    sort, sortLabel: SORTS.find((s) => s.key === sort).label,
    q, noMatch: !!q && !visible.some((s) => s.cards.length) && !(bought?.rows.length),
  };
}

// the shelf a pasted link belongs on: the one its site already lives on
export function shelfForLink(stash, url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  const counts = [];
  for (const c of stash?.categories || []) {
    if (c.bought || c.gift) continue;
    const n = c.items.filter((i) => i.host === host).length;
    if (n) counts.push({ name: c.name, n });
  }
  counts.sort((a, b) => b.n - a.n);
  return counts[0] ? { ...counts[0], host } : null;
}

export function duplicateOf(stash, url) {
  const key = stashKey(url);
  for (const c of stash?.categories || []) {
    if (c.bought) continue;
    const it = c.items.find((i) => i.key === key);
    if (it) return { category: c.name, raw: it.raw, name: it.name, url: it.url, key: it.key };
  }
  return null;
}
