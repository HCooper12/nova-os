import { stashKey, hostOf } from './stashUrl.js';
import { todayISO, addDays, SNOOZE_DAYS } from './stashRhythm.js';

// THE DEMO STASH (10 Oct 2026). Demo mode only, and every word of it is
// invented: products, sites (all example.com/.net/.org), people, prices,
// dates. The repo is public. Its pictures are the mockups' drawn ones
// (src/StashArt.jsx), never a fetched image.
//
// Its shape is the server's GET /stash, so the page draws demo and live
// through one model (src/stashModel.js). The writes below change it in
// memory the way lib/stashRails.js changes Stash.md, so every door can be
// seen working, each with its pill and Undo.
//
// DEV ONLY: ?stashDemo=worst | huge | empty | loading | offline swaps the
// fixture at this boundary (the break-ui pass, 10 Oct 2026).

const FIELD_ORDER = ['lasts', 'bought', 'check', 'paid', 'from', 'watch', 'read'];
export function formatLine({ name, url, note, fields = {} }) {
  let line = `- [${String(name).replace(/[[\]]/g, '')}](${url})${note ? ` — ${note}` : ''}`;
  for (const k of FIELD_ORDER) if (fields[k] != null && fields[k] !== '' && fields[k] !== false) line += ` [${k}:: ${fields[k] === true ? 'on' : fields[k]}]`;
  return line;
}

function item({ name, url, note = null, lasts = null, bought = null, check = null, paid = null, from = null, watch = false, read = null }) {
  const fields = { lasts, bought, check, paid: paid != null ? Number(paid).toFixed(2) : null, from, watch: watch ? 'on' : null, read };
  return { raw: formatLine({ name, url, note, fields }), name, url, note, host: hostOf(url), key: stashKey(url), lasts, bought, check, paid, from, watch, read };
}
const shelf = (name, items, extra = {}) => {
  const gift = name.match(/^For\s+(.+)$/i);
  return { name, raw: `## ${name}${extra.date ? ` [date:: ${extra.date}]` : ''}`, date: extra.date || null, gift: gift ? gift[1] : null, bought: name === 'Bought', items };
};

export function demoVariant() {
  try {
    if (!import.meta.env?.DEV || typeof location === 'undefined') return 'demo';
    return new URLSearchParams(location.search).get('stashDemo') || 'demo';
  } catch { return 'demo'; }
}

const ago = (d, now) => new Date(now - d * 86400000).toISOString();

export function demoStashState(variant = 'demo', now = Date.now()) {
  const t = todayISO(now);
  const d = (k) => addDays(t, k);
  if (variant === 'loading') return { loading: true };
  if (variant === 'empty') return { categories: [], meta: {}, readAt: new Date(now).toISOString(), onList: [] };
  if (variant === 'worst' || variant === 'huge') return worstState(variant, now);
  const categories = [
    shelf('Skincare', [
      item({ name: 'Hydrating cleanser 236 ml', url: 'https://skin.example.com/p/cleanser', note: 'morning and night', lasts: 8, bought: d(-50) }),
      item({ name: 'Daily moisturiser SPF 30', url: 'https://skin.example.com/p/moisturiser', lasts: 6, bought: d(-30) }),
      item({ name: 'Retinol serum 30 ml', url: 'https://shop.example.net/retinol', note: 'nights only', lasts: 12, bought: d(-20) }),
      item({ name: 'Lip balm', url: 'https://skin.example.com/p/balm' }),
      item({ name: 'Mineral sunscreen SPF 50', url: 'https://skin.example.com/p/sunscreen' }),
    ]),
    shelf('Kitchen', [
      item({ name: 'Coffee beans 1 kg', url: 'https://roaster.example.com/beans', note: 'medium roast', lasts: 4, bought: d(-10) }),
      item({ name: 'Chef knife sharpener', url: 'https://kitchen.example.com/sharpener', watch: true }),
    ]),
    shelf('Desk setup', [
      item({ name: 'Monitor arm', url: 'https://shop.example.com/arm', note: 'the 32-inch one' }),
      item({ name: 'Desk mat', url: 'https://shop.example.com/mat', watch: true }),
    ]),
    shelf('Reading', [
      item({ name: 'Essay on deliberate practice', url: 'https://essays.example.net/practice' }),
      item({ name: 'Long read on sleep', url: 'https://magazine.example.com/sleep', note: 'finish it' }),
    ]),
    shelf('For Mum', [
      item({ name: 'Linen scarf', url: 'https://gifts.example.org/scarf' }),
      item({ name: 'Tea sampler', url: 'https://tea.example.org/sampler' }),
    ], { date: d(24) }),
    shelf('Bought', [
      item({ name: 'Coffee beans 1 kg', url: 'https://roaster.example.com/beans', bought: d(-10), paid: 32, from: 'Kitchen' }),
      item({ name: 'Desk lamp', url: 'https://shop.example.com/lamp', bought: d(-27), paid: 89, from: 'Desk setup' }),
      item({ name: 'Coffee beans 1 kg', url: 'https://roaster.example.com/beans', bought: d(-38), paid: 32, from: 'Kitchen' }),
    ]),
  ];
  const art = { sunscreen: 'serum', cleanser: 'pump', moisturiser: 'tube', retinol: 'dropper', balm: 'balm', beans: 'bag', sharpener: 'sharpener', arm: 'arm', mat: 'mat', practice: 'page', sleep: 'page2', scarf: 'scarf', sampler: 'tea', lamp: 'lamp' };
  const opened = { cleanser: 12, moisturiser: 2, retinol: 30, balm: 0, beans: 5, sharpener: 70, arm: 9, mat: 21, practice: 3, sleep: 16, scarf: 1, sampler: 6 };
  const added = { cleanser: 140, moisturiser: 96, retinol: 20, balm: 61, beans: 180, sharpener: 15, arm: 44, mat: 40, practice: 21, sleep: 33, scarf: 8, sampler: 4 };
  const meta = {};
  for (const c of categories) for (const it of c.items) {
    const slug = it.url.split('/').pop();
    meta[it.key] = {
      demoArt: art[slug] || null,
      // mockup 90 s3: one link that came in from Safari's share sheet an hour ago
      ...(slug === 'sunscreen' ? { via: 'safari', addedAt: ago(1 / 24, now) } : {}),
      opens: opened[slug] != null ? 2 : 0,
      lastOpened: opened[slug] != null ? ago(opened[slug], now) : null,
      addedAt: added[slug] != null ? ago(added[slug], now) : null,
      article: c.name === 'Reading',
      product: c.name !== 'Reading',
      minutes: slug === 'practice' ? 9 : slug === 'sleep' ? 14 : null,
      words: slug === 'practice' ? 2140 : slug === 'sleep' ? 3220 : null,
      place: slug === 'practice' ? { para: 2, at: ago(4, now) } : null,
      price: slug === 'sharpener' ? { amount: 49, currency: 'AUD', inStock: true, state: 'ok', checkedOn: t, event: { type: 'price-drop', on: d(-1), from: 59, to: 49 } }
        : slug === 'mat' ? { amount: 74, currency: 'AUD', inStock: true, state: 'blocked', why: 'the site asked for a bot check', checkedOn: t, event: null }
          : null,
    };
  }
  return { categories, meta, readAt: new Date(now).toISOString(), onList: [], offline: variant === 'offline', clip: 'https://skin.example.com/p/vitamin-c-serum' };
}

// THE WORST CASE (break-ui, 10 Oct 2026): 300 items, a 2,000-character
// link, a page with no picture, an item with no price, a gift shelf whose day
// has passed, one-letter and very long names, a shelf of one.
function worstState(variant, now) {
  const t = todayISO(now);
  const d = (k) => addDays(t, k);
  const longUrl = `https://shop.example.com/products/${'very-long-product-slug-'.repeat(40)}?${Array.from({ length: 30 }, (_, i) => `option${i}=value${i}`).join('&')}`.slice(0, 2000);
  const big = [];
  const n = variant === 'huge' ? 300 : 300;
  for (let i = 0; i < n; i++) big.push(item({ name: `Bulk item ${i + 1}, refill pack of ${(i % 7) + 2}`, url: `https://bulk.example.com/item/${i + 1}`, lasts: i % 9 === 0 ? 4 + (i % 3) * 2 : null, bought: i % 9 === 0 ? d(-(i % 40)) : null }));
  const categories = [
    shelf('Skincare and everything else I use in the bathroom every single morning', [
      item({ name: 'Extremely gentle hydrating foaming facial cleanser for sensitive and combination skin, fragrance free, 473 ml family size', url: longUrl, note: 'the big bottle, not the travel one, and only from this site because the other one ships slowly', lasts: 8, bought: d(-55) }),
      item({ name: 'X', url: 'https://x.example.com/' }),
      item({ name: 'Plain page, no picture', url: 'https://plain.example.org/' }),
    ]),
    shelf('Bulk', big),
    shelf('For Grandma Wiśniewska-Kowalczyk', [item({ name: 'Photo frame', url: 'https://gifts.example.org/frame' })], { date: d(-3) }),
    shelf('Bought', [item({ name: 'A thing with no price recorded', url: 'https://shop.example.com/noprice', bought: d(-2), from: 'Bulk' })]),
  ];
  const meta = {};
  meta[stashKey(longUrl)] = { price: { amount: null, state: 'no-price', why: 'no price on the page Nova could read', checkedOn: t } };
  categories[0].items[0].watch = true;
  return { categories, meta, readAt: new Date(now).toISOString(), onList: [], clip: longUrl };
}

/* ------------------------------ demo writes ------------------------------- */

const clone = (s) => ({ ...s, categories: s.categories.map((c) => ({ ...c, items: [...c.items] })), meta: { ...s.meta }, onList: [...(s.onList || [])] });
function locate(s, raw) {
  for (const c of s.categories) { const i = c.items.findIndex((x) => x.raw === raw); if (i >= 0) return { c, i, it: c.items[i] }; }
  return null;
}
const rebuild = (it, patch) => item({ ...it, ...patch, paid: 'paid' in patch ? patch.paid : it.paid });
function shelfOf(s, name, date) {
  let c = s.categories.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!c) { c = shelf(name, [], { date }); const b = s.categories.findIndex((x) => x.bought); if (b >= 0) s.categories.splice(b, 0, c); else s.categories.push(c); }
  return c;
}

// each returns { state, title } or throws Error with the server's words
export const demoWrites = {
  add(s0, { category, name, url, lasts }) {
    const s = clone(s0);
    const key = stashKey(url);
    for (const c of s.categories) {
      if (c.bought) continue;
      const hit = c.items.find((x) => x.key === key);
      if (hit) { const e = new Error(`already on ${c.name}: ${hit.name}`); e.duplicate = { category: c.name, raw: hit.raw, name: hit.name, url: hit.url }; throw e; }
    }
    const it = item({ name, url, lasts: lasts || null, bought: lasts ? todayISO() : null });
    shelfOf(s, category).items.push(it);
    s.meta[it.key] = { ...(s.meta[it.key] || {}), addedAt: new Date().toISOString() };
    return { state: s, title: `Stashed ${name} on ${category}`, raw: it.raw };
  },
  remove(s0, raw) {
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    h.c.items.splice(h.i, 1);
    return { state: s, title: `Removed ${h.it.name}` };
  },
  move(s0, raw, to) {
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    if (h.c.name === to) throw new Error(`it is already on ${to}`);
    h.c.items.splice(h.i, 1); shelfOf(s, to).items.push(h.it);
    return { state: s, title: `Moved ${h.it.name} to ${to}` };
  },
  rhythm(s0, raw, weeks) {
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    const w = Number(weeks) || null;
    h.c.items[h.i] = rebuild(h.it, w ? { lasts: w, bought: h.it.bought || todayISO(), check: null } : { lasts: null, check: null });
    return { state: s, title: w ? `${h.it.name} lasts about ${w} weeks` : `Restock rhythm off for ${h.it.name}`, raw: h.c.items[h.i].raw };
  },
  watch(s0, raw, on) {
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    h.c.items[h.i] = rebuild(h.it, { watch: !!on });
    return { state: s, title: on ? `Watching the price of ${h.it.name}` : `Stopped watching ${h.it.name}`, raw: h.c.items[h.i].raw };
  },
  read(s0, raw, done = true) {
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    const next = rebuild(h.it, { read: done ? todayISO() : null });
    if (!done || h.c.name === 'Read') { h.c.items[h.i] = next; return { state: s, title: done ? `Finished ${h.it.name}` : `${h.it.name} is unread again`, raw: next.raw }; }
    h.c.items.splice(h.i, 1);
    shelfOf(s, 'Read').items.unshift(next);
    return { state: s, title: `Finished, moved to Read: ${h.it.name}`, raw: next.raw };
  },
  bought(s0, raw, { paid, date } = {}) {
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    const day = date || todayISO();
    const price = paid == null || paid === '' ? null : Number(String(paid).replace(/[^0-9.]/g, ''));
    if (paid != null && paid !== '' && !(price > 0)) throw new Error(`could not read "${String(paid).slice(0, 20)}" as a price`);
    if (h.it.lasts) h.c.items[h.i] = rebuild(h.it, { bought: day, check: null });
    else h.c.items.splice(h.i, 1);
    shelfOf(s, 'Bought').items.unshift(item({ name: h.it.name, url: h.it.url, bought: day, paid: price, from: h.c.name }));
    return { state: s, title: `Bought ${h.it.name}${price ? ` for $${price.toFixed(2)}` : ''}${h.it.lasts ? ', clock restarted' : ''}` };
  },
  list(s0, raw) {
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    s.onList.push(h.it.key);
    return { state: s, title: `${h.it.name} is on your shopping list` };
  },
  check(s0, raw, answer) {
    if (answer === 'reordered') return demoWrites.bought(s0, raw, { date: todayISO() });
    const s = clone(s0); const h = locate(s, raw); if (!h) throw new Error('that item is no longer there');
    const from = h.it.check && h.it.check > todayISO() ? h.it.check : todayISO();
    h.c.items[h.i] = rebuild(h.it, { check: addDays(from, SNOOZE_DAYS) });
    if (answer === 'low') s.onList.push(h.it.key);
    return { state: s, title: answer === 'low' ? `${h.it.name} is on your list, with its link` : `Asked again about ${h.it.name} in two weeks`, raw: h.c.items[h.i].raw };
  },
  shelf(s0, { name, date }) {
    const s = clone(s0);
    const c = s.categories.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (c) { const i = s.categories.indexOf(c); s.categories[i] = shelf(c.name, c.items, { date: date || null }); return { state: s, title: `${c.name}${date ? ` is on ${date}` : ' has no date now'}` }; }
    shelfOf(s, name, date || null);
    return { state: s, title: `New shelf: ${name}${date ? `, ${date}` : ''}` };
  },
};

export const DEMO_READER = {
  state: 'ok',
  title: 'Essay on deliberate practice',
  minutes: 9,
  words: 2140,
  paras: [
    { p: 'This is placeholder prose for the demo. The real page shows the article’s own text, fetched once from its site and kept on your Mac, with its headings where the page has them.' },
    { p: 'The first idea it sets out is that practice and repetition are not the same thing. A session that only repeats what already works feels productive and changes little.' },
    { p: 'The second is that the useful part of a session sits at its edge: the piece that fails a third of the time, worked slowly until it fails less, then moved on from.' },
    { p: 'The third is feedback that arrives while the attempt is still fresh, from a coach, a recording or a score, so the next try can be different on purpose.' },
    { p: 'It closes on rest: a skill set aside for a day comes back steadier than one pushed through another hour of tired repetition.' },
  ],
};
