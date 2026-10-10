// THE SHOPPING SCREEN'S VIEW MODEL (mockup 92, built 10 Oct 2026).
//
// Everything the summary Shopping screen draws is computed here from what
// the server sent: the list (the vault's Shopping List.md), today's price
// reads per chain (server/lib/shopPrices.js), the rewards offers read from
// his emails (server/lib/rewardsMail.js) and his rotation. Code adds every
// figure up and writes every sentence; nothing on screen is typed by hand,
// and nothing is guessed. A line with no read says so; a chain that failed
// has its prices hidden and is named in the status line.
//
// Pure: no React, no network. server/test/shopModel.test.js holds it to the
// mockup's sentences and to the honest states.

import {
  CHAINS, CHAIN_NAME, decide, lineNeed, keepFor, keepsWord, perishable, advice, verdict, verdictNoPrice,
  frac, money, dollars, lineKey, productMatches, packWords, ptsWorth,
} from './shopPrice.js';
import { parseAmount } from './recipeScale.js';

// the aisles, in shop order, each with its house hue and glyph
export const AISLES = [
  { cat: 'Produce', k: 'pr', label: 'Produce', hue: 'var(--nv-m-biceps)' },
  { cat: 'Meat & Protein', k: 'me', label: 'Meat', hue: 'var(--nv-m-chest)' },
  { cat: 'Dairy & Eggs', k: 'da', label: 'Dairy and eggs', hue: 'var(--nv-m-abs)' },
  { cat: 'Pantry & Seasonings', k: 'pa', label: 'Pantry', hue: 'var(--nv-or)' },
  { cat: 'Frozen', k: 'fr', label: 'Frozen', hue: 'var(--nv-m-calves)' },
  { cat: 'Bakery', k: 'ba', label: 'Bakery', hue: 'var(--nv-m-forearms)' },
  { cat: 'Beverages', k: 'be', label: 'Drinks', hue: 'var(--nv-m-hamstrings)' },
  { cat: 'Household & Other', k: 'ho', label: 'Household', hue: 'var(--nv-m-glutes)' },
];
const AISLE_OF = Object.fromEntries(AISLES.map((a) => [a.cat, a]));
export const aisleOf = (cat) => AISLE_OF[cat] || AISLES[AISLES.length - 1];

export const PROG = { er: 'Everyday Rewards', fb: 'Flybuys' };
export const PROG_SHOP = { er: 'w', fb: 'c' };
export const PROG_APP = { er: 'Everyday Rewards app', fb: 'Flybuys app' };
export const PROG_PRESS = { er: 'Boost', fb: 'Activate' };
const FAILED = new Set(['blocked', 'error', 'unreadable']);
const r2 = (n) => Math.round(n * 100) / 100;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmtPts = (n) => Math.round(n).toLocaleString('en-AU');
const MEL = 'Australia/Melbourne';
const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: MEL }) : '');
const timeLabel = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: MEL }).replace(' ', ' ') : '');
const whenLabel = (iso, now) => {
  if (!iso) return '';
  const same = dayLabel(iso) === dayLabel(now.toISOString());
  return same ? `today ${timeLabel(iso)}` : `${new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: MEL })}, ${timeLabel(iso)}`;
};
const endLabel = (ymd) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

/* ------------------------------------------------------------ the lines -- */

// The list's items into LINES: every item of one name is one line, its need
// summed from each recipe behind it ("½ + 2 + ½ = 3 onions").
export function buildLines(items) {
  const by = new Map();
  for (const it of items || []) {
    if (!it || !it.name) continue;
    const key = it.pending ? `pending:${it.id}` : lineKey(it.name) || `id:${it.id}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(it);
  }
  return [...by.entries()].map(([key, its]) => {
    const first = its[0];
    const need = lineNeed(its);
    const keep = keepFor(first.name);
    return {
      key,
      ids: its.map((i) => i.id),
      name: first.name,
      cat: first.category,
      aisle: aisleOf(first.category),
      got: its.every((i) => i.checked),
      pending: !!first.pending,
      items: its,
      need,
      keep,
      sources: its.filter((i) => i.source).map((i) => ({ from: i.source, amount: i.amount, qty: Math.max(1, Number(i.qty) || 1) })),
      typed: its.every((i) => !i.source),
    };
  });
}

// every product read for a line, from chains that answered
function productsFor(line, prices, avail) {
  const reads = prices?.reads?.[line.key] || {};
  const pin = prices?.pins?.[line.key] || null;
  const out = [];
  for (const ch of CHAINS) {
    const r = reads[ch];
    if (!r || r.status !== 'ok' || !avail(ch)) continue;
    for (const p of r.products || []) {
      // pinned: only the one he buys prices the line
      if (pin && !(p.chain === pin.chain || ch === pin.chain) ) continue;
      if (pin && !((pin.id && p.id === pin.id) || p.name === pin.name)) continue;
      out.push({ ...p, chain: ch, readAt: r.at });
    }
  }
  return out;
}
const anyRead = (line, prices) => Object.values(prices?.reads?.[line.key] || {}).some((r) => r && (r.status === 'ok' || r.status === 'none'));

/* ------------------------------------------------------------ offers ---- */

function offerLine(o, lines) {
  if (o.kind !== 'line') return null;
  return lines.find((l) => !l.pending && (productMatches(l.name, o.on) || productMatches(o.on, l.name))) || null;
}

/* ------------------------------------------------------------ the view -- */

export function buildShopView({
  list, prices, offers, rotation, recipes, logos = {}, offline = false, demo = false, syncedLabel = null,
  outboxCount = 0, group = 'aisle', now = new Date(),
} = {}) {
  if (!list) {
    return { state: offline ? 'offline-empty' : 'loading', head: { news: [], stat: offline ? { tone: 'off', text: 'Offline, and Nova has no list from before' } : { tone: 'load', text: 'Reading your vault…' } } };
  }
  const lines = buildLines(list.items);
  const live = lines.filter((l) => !l.pending);
  const left = live.filter((l) => !l.got);
  const chains = prices?.chains || {};
  const failedChains = CHAINS.filter((c) => FAILED.has(chains[c]?.state));
  const avail = (c) => !FAILED.has(chains[c]?.state);
  const havePrices = !!prices && Object.keys(prices.reads || {}).length > 0;
  const noSource = !prices; // nothing came back from the reader at all

  // each line decided once
  for (const l of lines) {
    l.pin = prices?.pins?.[l.key] || null;
    l.products = productsFor(l, prices, avail);
    l.d = l.pending ? null : decide({ need: l.need.fam === 'any' || l.need.q > 0 ? l.need : { fam: 'any', q: 1 }, products: l.products, keep: l.keep });
    l.read = anyRead(l, prices);
  }

  /* ---- offers ---- */
  // an offer with no end date is never shown (the server refuses one too)
  const allOffers = (offers?.offers || []).filter((o) => !o.dismissed && /^\d{4}-\d{2}-\d{2}$/.test(String(o.ends || '')));
  const matched = [];
  let unmatched = 0;
  for (const o of allOffers) {
    const line = offerLine(o, live);
    if (o.kind === 'line' && (!line || line.got)) { unmatched += !line ? 1 : 0; continue; }
    // what a rate comes to: the rate × what this line costs at that chain
    const shop = PROG_SHOP[o.programme];
    let pts = o.pts;
    let spend = null;
    if (!pts && o.mult) {
      if (o.kind === 'gift') { spend = 100; pts = o.mult * 100; }
      else if (line) {
        const at = line.d?.cand.find((c) => c.chain === shop);
        if (at) { spend = at.total; pts = Math.round(o.mult * at.total); }
      }
    }
    matched.push({ ...o, shop, line, pts: pts || null, spend, worth: pts ? ptsWorth(pts) : null });
  }
  for (const l of live) l.offer = matched.find((o) => o.line === l) || null;

  const whyOf = (o) => {
    const l = o.line;
    if (o.kind === 'gift') return 'Worth it only for a card you would spend anyway.';
    if (o.kind === 'shop') return `On a shop at ${CHAIN_NAME[o.shop]}.`;
    if (!l) return '';
    const d = l.d;
    const at = d?.cand.find((c) => c.chain === o.shop);
    if (!d || !at) return 'On your list now.';
    if (d.pick.chain === o.shop) return `On your list, and ${CHAIN_NAME[o.shop]} is already cheapest.`;
    const gap = at.total - (o.worth || 0) - d.pick.total;
    return gap < 0
      ? `On your list. With the points, ${CHAIN_NAME[o.shop]} comes in ${money(-gap)} under ${CHAIN_NAME[d.pick.chain]}.`
      : `On your list. Even with the points, ${CHAIN_NAME[d.pick.chain]} is ${money(gap)} cheaper.`;
  };
  const offerCard = (o) => ({
    id: o.id, programme: o.programme, prog: PROG[o.programme], shop: o.shop, shopName: CHAIN_NAME[o.shop], kind: o.kind,
    mult: o.mult || null, pts: o.pts, worth: o.worth, spend: o.spend, on: o.on,
    daysLeft: o.daysLeft, soon: o.daysLeft != null && o.daysLeft <= 3,
    daysLabel: o.daysLeft == null ? '' : o.daysLeft <= 0 ? 'Ends today' : o.daysLeft === 1 ? '1 day left' : `${o.daysLeft} days left`,
    ends: o.ends, endsLabel: endLabel(o.ends),
    why: whyOf(o).replace(/^On your list[,.] (and )?/, ''),
    whyFull: whyOf(o),
    activate: !!o.activate, activated: !!o.activated,
    source: o.via === 'model' ? 'Email, read by a model and checked' : 'Email',
    sourceAt: o.mailDate ? dayLabel(o.mailDate) : dayLabel(o.readAt),
    sourceLong: `Your ${PROG[o.programme]} email${o.mailDate ? ` of ${new Date(o.mailDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: MEL })}` : ''}, saved for Nova by the Mail rule on your Mac${o.via === 'model' ? '; read by a model, every figure checked against the email by code' : ''}`,
    personal: o.kind === 'line' || o.kind === 'shop',
    lineKey: o.line?.key || null,
    lineName: o.line?.name || null,
    cond: o.cond || '',
  });
  const cards = matched.map(offerCard);
  const gift = cards.find((c) => c.kind === 'gift') || null;
  const rest = cards.filter((c) => c !== gift).sort((a, b) => (a.programme === b.programme ? (a.daysLeft ?? 99) - (b.daysLeft ?? 99) : a.programme === 'er' ? -1 : 1));
  const totalPts = cards.reduce((t, c) => t + (c.pts || 0), 0);
  const endedRecent = (offers?.ended || []).filter((o) => o.daysLeft >= -1);
  const points = cards.length ? {
    total: totalPts,
    worth: ptsWorth(totalPts),
    progs: ['er', 'fb'].filter((p) => cards.some((c) => c.programme === p)).map((p) => ({ p, name: PROG[p], n: cards.filter((c) => c.programme === p).length })),
    gift: cards.filter((c) => c.kind === 'gift').slice(0, 1)[0] || null,
    gifts: cards.filter((c) => c.kind === 'gift'),
    cards: rest.concat(cards.filter((c) => c.kind === 'gift').slice(1)),
    ended: endedRecent.length ? `${up(numberWord(endedRecent.length))} ended ${endLabel(endedRecent[0].ends)} and ${endedRecent.length === 1 ? 'was' : 'were'} dropped.` : null,
  } : null;

  /* ---- each row ---- */
  const asOf = (c) => dayLabel(c.readAt);
  const rowOf = (l) => {
    const d = l.d;
    const meta = [];
    if (l.pending) meta.push({ text: 'finding its aisle' });
    else if (l.typed) {
      const it = l.items[0];
      if (it.amount) meta.push({ b: `${it.amount}${l.items.length > 1 ? ` × ${l.items.length}` : ''}` });
      else if (l.items.reduce((s, i) => s + Math.max(1, Number(i.qty) || 1), 0) > 1) meta.push({ b: `${l.items.reduce((s, i) => s + Math.max(1, Number(i.qty) || 1), 0)} of these` });
    } else {
      const named = [...new Set(l.sources.map((s) => s.from))];
      const amt = l.sources.length === 1 && l.sources[0].amount ? `${l.sources[0].amount.replace(/\s*x\s*/i, ' × ')}${l.sources[0].qty > 1 ? ` × ${l.sources[0].qty}` : ''}` : l.need.fam === 'n' ? frac(l.need.q) : l.need.fam === 'g' ? (l.need.q >= 1000 ? `${+(l.need.q / 1000).toFixed(2)} kg` : `${Math.round(l.need.q)} g`) : l.need.fam === 'ml' ? (l.need.q >= 1000 ? `${+(l.need.q / 1000).toFixed(2)} L` : `${Math.round(l.need.q)} ml`) : (l.sources.length === 1 ? l.sources[0].amount : '') || '';
      meta.push({ b: amt || null, text: `for ${named.length > 1 ? plural(named.length, 'meal') : named[0]}` });
    }
    if (l.pin) meta.push({ pin: l.pin.name });
    let saving = null;
    const adv = d && !l.got ? advice(d, l.keep) : null;
    if (!adv && d && d.other && d.other.total - d.pick.total > 0.004 && !l.got) saving = `${money(d.other.total - d.pick.total)} less than ${CHAIN_NAME[d.other.chain]}`;
    let cell;
    if (!l.pending && noSource) cell = { kind: 'none', v: 'No price', w: 'not read yet' };
    else if (l.pending) cell = { kind: 'none', v: 'No price', w: 'sorting first' };
    else if (d) cell = { kind: 'price', total: d.pick.total, chains: d.tie ? [d.pick.chain, d.other.chain] : [d.pick.chain], date: asOf(d.pick), approx: d.pick.perKgPrice != null };
    else if (l.pin && l.read) cell = { kind: 'none', v: 'No price', w: 'pin not listed' };
    else if (l.read) cell = { kind: 'none', v: 'No price', w: 'not matched' };
    else if (failedChains.length && failedChains.length === CHAINS.length) cell = { kind: 'none', v: 'No price', w: failedChains.length > 1 ? 'shops failed' : `${CHAIN_NAME[failedChains[0]]} failed` };
    else cell = { kind: 'none', v: 'No price', w: 'not read yet' };
    const buy = d ? d.pick.count : l.need.fam === 'n' ? Math.max(1, Math.ceil(l.need.q - 1e-9)) : l.need.fam === 'any' ? Math.max(1, Math.round(l.need.q)) : 1;
    return {
      key: l.key, ids: l.ids, name: l.name, got: l.got, pending: l.pending, aisle: l.aisle,
      meta, saving, advice: adv,
      offerCap: l.offer && !l.got ? { programme: l.offer.programme, mult: l.offer.mult || null, pts: l.offer.mult ? null : l.offer.pts, id: l.offer.id } : null,
      cell, buy, stepItem: l.items[0]?.id || null, stepQty: Math.max(1, Number(l.items[0]?.qty) || 1),
      label: `${l.name}${cell.kind === 'price' ? `: ${dollars(cell.total)} at ${cell.chains.map((c) => CHAIN_NAME[c]).join(' or ')}, read ${cell.date}` : `: ${cell.v.toLowerCase()}, ${cell.w}`}`,
    };
  };
  const rows = new Map(lines.map((l) => [l.key, rowOf(l)]));

  /* ---- groups ---- */
  const groups = [];
  if (group === 'shop' && havePrices) {
    for (const ch of CHAINS) {
      const ls = live.filter((l) => l.d && l.d.pick.chain === ch);
      if (!ls.length) continue;
      groups.push({ key: `s-${ch}`, store: ch, label: CHAIN_NAME[ch], logo: logos[ch] || null, sub: r2(ls.filter((l) => !l.got).reduce((s, l) => s + l.d.pick.total, 0)), rows: ls.map((l) => rows.get(l.key)) });
    }
    const none = live.filter((l) => !l.d);
    if (none.length) groups.push({ key: 's-none', label: 'No price', glyph: 'list', hue: 'var(--nv-m-glutes)', count: none.length, rows: none.map((l) => rows.get(l.key)) });
  } else {
    for (const a of AISLES) {
      const ls = live.filter((l) => l.aisle.k === a.k);
      if (!ls.length) continue;
      const leftN = ls.filter((l) => !l.got).length;
      groups.push({ key: `g-${a.k}`, aisle: a.k, label: a.label, hue: a.hue, glyph: a.k, left: leftN, rows: ls.map((l) => rows.get(l.key)) });
    }
  }
  const sorting = lines.filter((l) => l.pending).map((l) => rows.get(l.key));

  /* ---- the basket ---- */
  const totals = { w: { t: 0, n: 0 }, c: { t: 0, n: 0 }, a: { t: 0, n: 0 } };
  const one = { w: { t: 0, n: 0 }, c: { t: 0, n: 0 }, a: { t: 0, n: 0 } };
  let split = 0;
  let priced = 0;
  for (const l of left) {
    if (!l.d) continue;
    totals[l.d.pick.chain].t += l.d.pick.total; totals[l.d.pick.chain].n += 1; split += l.d.pick.total; priced += 1;
    for (const ch of CHAINS) { const c = l.d.cand.find((x) => x.chain === ch); if (c) { one[ch].t += c.total; one[ch].n += 1; } }
  }
  const total = live.length;
  const arcs = [];
  let start = 0;
  for (const a of AISLES) {
    const ls = live.filter((l) => l.aisle.k === a.k);
    if (!ls.length) continue;
    const share = ls.length / Math.max(1, total);
    arcs.push({ key: a.k, hue: a.hue, start, share, got: ls.filter((l) => l.got).length / ls.length });
    start += share;
  }
  const chips = AISLES.map((a) => ({ key: a.k, label: a.label, hue: a.hue, left: live.filter((l) => l.aisle.k === a.k && !l.got).length })).filter((c) => c.left > 0);
  const best1 = CHAINS.filter((ch) => avail(ch) && one[ch].n === priced && priced > 0).sort((a, b) => one[a].t - one[b].t)[0];
  const basket = {
    left: left.length, total,
    arcs, chips,
    noPrices: noSource || (!havePrices && !failedChains.length),
    legend: CHAINS.map((ch) => (avail(ch)
      ? { chain: ch, name: CHAIN_NAME[ch], n: totals[ch].n, total: r2(totals[ch].t), ok: true, logo: logos[ch] || null }
      : { chain: ch, name: CHAIN_NAME[ch], ok: false, why: chains[ch]?.state === 'blocked' ? 'blocked' : chains[ch]?.state === 'unreadable' ? 'page changed' : 'did not answer' })),
    split: CHAINS.map((ch) => (avail(ch) ? (totals[ch].n ? { chain: ch, grow: totals[ch].t } : null) : { chain: ch, na: true })).filter(Boolean),
    foot: priced ? { split: r2(split), priced, best: best1 || null, less: best1 ? r2(one[best1].t - split) : null } : null,
  };

  /* ---- the head ---- */
  let news;
  if (!live.length) news = [{ text: 'Nothing to get.' }];
  else if (priced) {
    const tally = { w: 0, c: 0, a: 0 };
    let n = 0;
    for (const l of live) { if (!l.d) continue; n += 1; if (!l.d.tie) tally[l.d.pick.chain] += 1; }
    const top = CHAINS.slice().sort((a, b) => tally[b] - tally[a])[0];
    news = [{ text: `${CHAIN_NAME[top]} is cheapest on ` }, { b: String(tally[top]), num: tally[top] }, { text: ` of ${n} priced line${n === 1 ? '' : 's'}.` }];
  } else {
    const aisles = new Set(left.map((l) => l.aisle.k)).size;
    news = left.length ? [{ b: String(left.length), num: left.length }, { text: ` to get, across ${plural(aisles, 'aisle')}.` }] : [{ text: 'Everything is got.' }];
  }
  let stat;
  const lastRead = Object.values(prices?.reads || {}).flatMap((r) => Object.values(r)).filter((r) => r && (r.status === 'ok' || r.status === 'none')).map((r) => r.at).sort().pop();
  if (offline) stat = { tone: 'off', text: `Offline · the list as of ${syncedLabel || 'the last read'}${outboxCount ? ` · ${plural(outboxCount, 'change')} waiting in the Outbox` : ''}` };
  else if (failedChains.length) {
    const names = failedChains.map((c) => CHAIN_NAME[c]);
    const c0 = chains[failedChains[0]];
    const how = failedChains.length > 1 ? 'did not answer' : c0.state === 'blocked' ? `blocked since ${whenLabel(c0.since, now)}` : c0.state === 'unreadable' ? `changed its page ${whenLabel(c0.lastAt, now)}` : `did not answer ${whenLabel(c0.lastAt, now)}`;
    stat = { tone: 'bad', text: `${names.join(' and ')} ${how} · ${failedChains.length > 1 ? 'their' : 'its'} prices are hidden`, retry: failedChains[0], retryName: names[0] };
  } else if (!live.length) stat = { tone: 'ok', text: syncedLabel ? `Synced ${syncedLabel}` : 'Synced' };
  else if (noSource) stat = { tone: 'ok', text: `${syncedLabel ? `Synced ${syncedLabel} · ` : ''}no prices read yet` };
  else stat = { tone: 'ok', text: `${syncedLabel ? `Synced ${syncedLabel} · ` : ''}${lastRead ? `prices read ${whenLabel(lastRead, now)}` : prices?.pending ? 'reading prices…' : 'no prices read yet'}` };
  if (demo && havePrices && !offline) stat.demo = true;

  /* ---- your meals ---- */
  const listKeys = new Set(live.map((l) => l.key));
  const onList = (name) => listKeys.has(lineKey(name)) || live.some((l) => productMatches(l.name, name) || productMatches(name, l.name));
  const meals = [];
  for (const k of rotation?.order || Object.keys(rotation?.slots || {})) {
    const dish = rotation?.slots?.[k];
    if (!dish?.id) continue;
    const r = (recipes || []).find((x) => x.id === dish.id);
    const ing = (r?.ingredients || []).map((raw) => {
      const p = parseAmount(String(raw));
      const name = (p.qty != null ? p.rest : String(raw)).replace(/^(of|x)\s+/i, '').replace(/\(.*?\)/g, '').replace(/,.*$/, '').trim();
      return { raw: String(raw), name, amount: p.qty != null ? String(raw).slice(0, String(raw).length - p.rest.length).trim() : '', on: name ? onList(name) : false, aisle: aisleOf(guessAisle(name)) };
    }).filter((i) => i.name);
    meals.push({ id: dish.id, slot: rotation?.labels?.[k] || up(k), slotKey: k, name: dish.name || r?.name || 'A dish', ing, on: ing.filter((i) => i.on).length, of: ing.length });
  }

  return {
    state: live.length || sorting.length ? 'list' : 'empty',
    head: { news, stat },
    basket,
    points,
    unmatched,
    offersSource: offers?.source || null,
    offersSetUp: !!offers?.source?.setUp,
    groups,
    sorting,
    got: live.filter((l) => l.got).flatMap((l) => l.ids),
    gotLines: live.filter((l) => l.got).length,
    meals,
    group: group === 'shop' && havePrices ? 'shop' : 'aisle',
    canByShop: havePrices,
    // the sheets read these
    _lines: new Map(lines.map((l) => [l.key, l])),
    _cards: new Map(cards.map((c) => [c.id, c])),
    _matched: new Map(matched.map((o) => [o.id, o])),
    chains,
    noSource,
    offline,
  };
}

const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function numberWord(n) { return NUMW[n] || String(n); }

// an ingredient's aisle, by kind, for the dish sheet's tile (the list's own
// aisles come from its category)
function guessAisle(name) {
  const s = String(name).toLowerCase();
  if (/frozen/.test(s)) return 'Frozen';
  if (/\b(beef|chicken|mince|steak|lamb|pork|fish|salmon|tuna|prawn|bacon|sausage|turkey)\b/.test(s)) return 'Meat & Protein';
  if (/\b(milk|yoghurt|yogurt|cheese|egg|eggs|butter|cream|feta)\b/.test(s)) return 'Dairy & Eggs';
  if (/\b(bread|loaf|wrap|wraps|roll|rolls|bagel|sourdough|tortilla)\b/.test(s)) return 'Bakery';
  if (/\b(water|juice|soda|coffee|tea|kombucha)\b/.test(s)) return 'Beverages';
  const k = keepFor(s);
  if (k && ['onion', 'garlic', 'citrus', 'avocado', 'spinach', 'herbs', 'banana', 'berries', 'tomato', 'veg', 'potato', 'apple'].includes(k.k)) return 'Produce';
  return 'Pantry & Seasonings';
}

/* ------------------------------------------------------------ the sheets -- */

// The price sheet: the need, each recipe's share, the verdict, the points
// note, every way to buy it, and where the prices came from.
export function priceSheet(view, key, now = new Date()) {
  const l = view._lines.get(key);
  if (!l) return null;
  const d = l.d;
  const need = l.need;
  const big = need.fam === 'n' ? frac(need.q) : need.fam === 'g' ? (need.q >= 1000 ? { n: +(need.q / 1000).toFixed(2), u: 'kg' } : { n: Math.round(need.q), u: 'g' }) : need.fam === 'ml' ? (need.q >= 1000 ? { n: +(need.q / 1000).toFixed(2), u: 'L' } : { n: Math.round(need.q), u: 'ml' }) : (l.typed ? frac(need.q) : '?');
  const shares = l.typed
    ? [{ text: 'You typed ', b: l.items.map((i) => `${i.amount ? `${i.amount} ` : ''}${i.name}`).join(', '), rest: '; no recipe behind it, so it is priced as written.' }]
    : l.sources.map((s) => ({ b: s.amount ? `${s.amount}${s.qty > 1 ? ` × ${s.qty}` : ''}` : `${s.qty}`, text: ' for ', rest: s.from }));
  if (need.fam === 'any' && !l.typed) shares.push({ text: 'These amounts are not shop sizes, so it is priced as one of each.' });
  let verdictText;
  let ways = [];
  if (view.noSource) verdictText = verdictNoPrice(need, l.keep);
  else if (d) {
    verdictText = verdict(d, l.keep);
    const gone = [];
    for (const ch of CHAINS) {
      const st = view.chains?.[ch]?.state;
      if (FAILED.has(st)) gone.push({ chain: ch, why: st === 'blocked' ? `${CHAIN_NAME[ch]} blocked the read` : st === 'unreadable' ? `${CHAIN_NAME[ch]}'s page changed` : `${CHAIN_NAME[ch]} did not answer` });
    }
    ways = d.cand.map((c) => ({
      chain: c.chain,
      label: `${c.count > 1 ? `${c.count} × ` : ''}${c.name}${c.sizeText && !String(c.name).toLowerCase().includes(String(c.sizeText).toLowerCase()) ? ` ${c.sizeText}` : ''}`,
      total: c.total,
      pick: c === d.pick,
      spare: c.spare > 1e-9 ? (need.fam === 'g' ? `${Math.round(c.spare)} g spare` : need.fam === 'ml' ? `${Math.round(c.spare)} ml spare` : `${frac(c.spare)} spare`) : need.fam === 'any' ? null : 'no spare',
      keeps: c.spare > 1e-9 ? keepsWord(l.keep) : null,
      perishable: perishable(l.keep),
      approx: c.perKgPrice != null,
      countApprox: c.approx,
      perKg: c.perKgPrice ? `${dollars(c.perKgPrice)} a kilo` : null,
      special: c.special || null,
      was: c.was || null,
      unit: c.unitPrice || null,
      url: c.url || null,
      at: dayLabel(c.readAt),
    })).concat(gone.map((g) => ({ chain: g.chain, gone: true, label: g.why })));
  } else if (l.read) verdictText = 'Nothing the shops listed matches this line. Nova only prices what it can match by name.';
  else if (!view.noSource && Object.keys(view.chains || {}).every((c) => FAILED.has(view.chains[c]?.state))) verdictText = 'No shop answered today, so there is no price.';
  else verdictText = 'Not read yet. Nova reads each line once a day, one shop at a time.';
  const o = view._matched ? [...view._matched.values()].find((x) => x.line === l) : null;
  const card = o ? view._cards.get(o.id) : null;
  const lastAt = d ? d.pick.readAt : null;
  return {
    key, name: l.name, aisle: l.aisle, big, shares, fam: need.fam, typed: l.typed,
    stepItem: l.items[0]?.id, stepQty: Math.max(1, Number(l.items[0]?.qty) || 1),
    verdict: verdictText,
    points: card,
    ways,
    foot: d ? `Prices read by Nova from each shop's own site${lastAt ? `, ${whenLabel(lastAt, now)}` : ''}, as listed online for Melbourne. A pack sold by weight is an "about" count. The pick counts cash only.` : null,
    dish: l.sources[0]?.from || null,
    pin: l.pin,
    pick: d ? { chain: d.pick.chain, id: d.pick.id, name: d.pick.name } : null,
  };
}

// The offer sheet's facts, from a card
export function offerFacts(card) {
  if (!card) return null;
  const facts = [];
  if (card.kind === 'gift') {
    facts.push({ g: 'pts', main: [{ rate: card.mult }, { text: ' a dollar: a $100 card earns ' }, { pts: card.pts }, { text: ', about ' }, { sv: dollars(card.worth) }], k: 'Worth it only for a card you would spend anyway. Valued at 2,000 points for $10.' });
  } else {
    const main = card.mult
      ? card.pts ? [{ rate: card.mult }, { text: ` a dollar on ${dollars(card.spend)} comes to ` }, { pts: card.pts }, { text: ', about ' }, { sv: money(card.worth) }] : [{ rate: card.mult }, { text: ' a dollar on what you spend there' }]
      : [{ pts: card.pts }, { text: ', about ' }, { sv: money(card.worth) }];
    facts.push({ g: 'pts', main, k: `${card.cond ? `${card.cond.slice(0, 120)}${card.cond.length > 120 ? '…' : ''} ` : ''}Valued at 2,000 points for $10.` });
    if (card.lineName) facts.push({ g: 'list', main: [{ text: 'On your list: ' }, { b: card.lineName }], k: up(card.whyFull.replace(/^On your list[,.] ?(and )?/, '')) });
  }
  facts.push({ g: 'clock', main: [{ text: 'Ends ' }, { b: card.endsLabel }], k: `${card.daysLabel}. It leaves this screen the morning after.` });
  facts.push({ g: 'mail', main: [{ text: 'Where Nova got it: ' }, { b: 'email' }], k: `${card.sourceLong}. ${card.personal ? 'Personalised, so another member may not have it.' : 'Open to every member.'}` });
  return facts;
}

export { fmtPts, endLabel, dayLabel, whenLabel, packWords };
