import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadStash } from './stash.js';
import { createRecord, listRecords, updateRecord } from './inboxStore.js';
import { getMeta, updateMeta, fetchPage, parsePage, deps as metaDeps } from './stashMeta.js';
import { stashKey, hostOf } from '../../src/stashUrl.js';
import { rhythmOf, todayISO, daysBetween, addDays, learnedRhythm } from '../../src/stashRhythm.js';

// THE STASH THAT NEEDS HIM, AS SIGNALS (10 Oct 2026). Code finds the news;
// no model decides it. Four kinds, each a rule here and pinned by a test
// (server/test/stashSignals.test.js):
//
//   level-check    an item with a rhythm has reached its check day, a week
//                  before it would run out by the calendar (src/stashRhythm.js)
//   gift-soon      a gift shelf ("For Mum") whose day is GIFT_LEAD_DAYS away
//                  or nearer, and still ahead; one gentle reminder per date
//   price-drop     a watched product's price is below the last one read
//   back-in-stock  a watched product read out of stock is now in stock
//
// Each event files ONE record on the inbox rails (kind `stash`, pending),
// keyed so it never files twice (data/stash/signals.json), and pushes once
// through push.sendPush, which HOLDS it through his quiet hours and delivers
// it when they end (lib/quietHours.js, his call 3 Oct). Nothing here is
// urgent. The inbox's own push-on-pending is off for this kind
// (inboxStore.js), so this rule is the only one.
//
// Stale news leaves on its own: a level check answered or no longer due (he
// bought it, or edited the line in Obsidian), a gift day that has passed, a
// price event a week old. Discarded as `expired`, never as his decline.
//
// THE PRICE WATCH (his yes, 10 Oct, under Shopping's rules): per item, only
// when he turned it on; public pages only; at most ONE read per product per
// day, made or attempted, through the Stash's one polite queue
// (lib/stashMeta.js); a wall (401/403/429/503 or a challenge page) is
// recorded as blocked and shown in those words, and is not tried again until
// the next day. Nova never gets round a bot check.

export const GIFT_LEAD_DAYS = 14;
const PRICE_NEWS_DAYS = 7;
const SEEN_KEEP_DAYS = 400;
const HISTORY_KEEP = 40;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const SEEN_PATH = () => path.join(dataRoot(), 'stash', 'signals.json');

const money = (n) => `$${Number(n).toFixed(2)}`;
const plural = (n, w, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;
const shortName = (s) => String(s || '').replace(/\s+\d[\d.,]*\s*(ml|g|kg|l|oz|pack|x)\b.*$/i, '').trim() || String(s || '');

/* ------------------------------ detection --------------------------------- */

// Pure. `stash` is parseStash's shape; `today` his calendar date.
export function detectStashEvents({ stash, today }) {
  const events = [];
  for (const c of stash?.categories || []) {
    if (c.bought) continue;
    for (const it of c.items) {
      const r = rhythmOf(it, today);
      if (!r || !r.due) continue;
      events.push({
        type: 'level-check',
        key: `level|${it.key}|${it.bought}|${r.checkOn}`,
        itemKey: it.key,
        raw: it.raw,
        name: it.name,
        shelf: c.name,
        left: r.left,
        title: `Check the level: ${shortName(it.name)}. About ${plural(r.left, 'day')} left by the calendar.`,
        body: `Bought ${it.bought}, lasts about ${plural(it.lasts, 'week')}. Plenty left, getting low or reordered: answer it on the Stash.`,
      });
    }
    if (c.gift && c.date) {
      const until = daysBetween(today, c.date);
      if (until >= 0 && until <= GIFT_LEAD_DAYS) {
        const n = c.items.length;
        events.push({
          type: 'gift-soon',
          key: `gift|${c.name.toLowerCase()}|${c.date}`,
          shelf: c.name,
          person: c.gift,
          date: c.date,
          until,
          expiresAt: c.date,
          title: until === 0 ? `${c.gift}'s day is today.` : `${c.gift}'s day is in ${plural(until, 'day')}.`,
          body: n ? `${plural(n, 'idea')} on ${c.name}.` : `Nothing on ${c.name} yet.`,
        });
      }
    }
  }
  return events;
}

// Pure: what a new price read says against the one before it.
export function priceEvent(prev, next) {
  if (!prev || !next) return null;
  if (prev.inStock === false && next.inStock === true) return 'back-in-stock';
  if (prev.amount != null && next.amount != null && next.amount < prev.amount - 0.004) return 'price-drop';
  return null;
}

/* ------------------------------ the seen keys ------------------------------ */

async function loadSeen() {
  if (!existsSync(SEEN_PATH())) return {};
  try { return JSON.parse(await readFile(SEEN_PATH(), 'utf8')).seen || {}; } catch { return {}; }
}
async function saveSeen(seen, now) {
  const cutoff = now - SEEN_KEEP_DAYS * 86400000;
  const kept = Object.fromEntries(Object.entries(seen).filter(([, at]) => Date.parse(at) >= cutoff));
  await mkdir(path.dirname(SEEN_PATH()), { recursive: true });
  const tmp = `${SEEN_PATH()}.tmp`;
  await writeFile(tmp, JSON.stringify({ seen: kept }, null, 2), 'utf8');
  await rename(tmp, SEEN_PATH());
}

let chain = Promise.resolve();
const locked = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

const KIND_WORD = { 'level-check': 'Check the level', 'gift-soon': 'A gift day is coming', 'price-drop': 'Price drop', 'back-in-stock': 'Back in stock' };

function recordFor(event, at) {
  return {
    id: randomUUID().slice(0, 8),
    kind: 'stash',
    text: event.title,
    source: 'stash',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date(at).toISOString(),
    event,
    expiresAt: event.expiresAt ? new Date(`${addDays(event.expiresAt, 1)}T00:00:00+10:00`).toISOString() : null,
    pushedAt: null,
    decision: {
      route: 'stash-event',
      confidence: 'high',
      title: event.title,
      reason: `${KIND_WORD[event.type] || 'Stash'}. ${event.body || ''} Approve = noted; nothing is written.`.trim(),
      payload: { event },
    },
  };
}

async function pushFor(record, at, deps) {
  const send = deps.sendPush || (await import('./push.js')).sendPush;
  const e = record.event;
  const out = await send({ title: KIND_WORD[e.type] || 'Stash', body: e.title, tag: `stash-${record.id}`, url: './#/stash' });
  await updateRecord(record.id, { pushedAt: new Date(at).toISOString() });
  return out;
}

async function fileEvents(events, { now, deps, seen }) {
  const created = [];
  let pushed = 0;
  for (const e of events) {
    if (seen[e.key]) continue;
    const record = await createRecord(recordFor(e, now));
    seen[e.key] = new Date(now).toISOString();
    created.push(record);
    await pushFor(record, now, deps);
    pushed++;
  }
  return { created, pushed };
}

/* ------------------------------ the price watch ---------------------------- */

// One read of one watched product. Returns { state, event } and writes the
// read to meta. Never throws.
export async function readPrice(item, { now = Date.now() } = {}) {
  const today = todayISO(now);
  const before = (await getMeta())[stashKey(item.url)]?.price || null;
  if (before?.checkedOn === today) return { state: 'skipped', why: 'already read today', price: before };
  const page = await fetchPage(item.url);
  let next;
  if (page.state !== 'ok') {
    next = {
      ...(before || {}), state: page.state, why: page.why, checkedOn: today, checkedAt: new Date(now).toISOString(), event: before?.event || null,
      // the last good read stays the one a later read is compared with
      prev: before?.state === 'ok' ? { amount: before.amount, inStock: before.inStock, on: before.checkedOn } : before?.prev || null,
    };
  } else {
    const offer = parsePage(page.html, item.url).offer;
    const found = offer.price != null || offer.inStock != null;
    next = {
      amount: offer.price ?? before?.amount ?? null,
      currency: offer.currency || before?.currency || null,
      inStock: offer.inStock ?? before?.inStock ?? null,
      state: found ? 'ok' : 'no-price',
      why: found ? null : 'no price on the page Nova could read',
      checkedOn: today,
      checkedAt: new Date(now).toISOString(),
      history: [...(before?.history || []), ...(found ? [{ on: today, amount: offer.price ?? null, inStock: offer.inStock ?? null }] : [])].slice(-HISTORY_KEEP),
      // the last good read, kept through a later wall, so an event compares like with like
      prev: before?.state === 'ok' ? { amount: before.amount, inStock: before.inStock, on: before.checkedOn } : before?.prev || null,
    };
    const comparedWith = before?.state === 'ok' ? before : before?.prev || null;
    const kind = found ? priceEvent(comparedWith, { amount: offer.price, inStock: offer.inStock }) : null;
    if (kind) next.event = { type: kind, on: today, from: comparedWith?.amount ?? null, to: offer.price ?? null };
  }
  await updateMeta(item.url, (r) => ({ ...r, price: next }));
  return { state: next.state, why: next.why || null, price: next, event: next.event?.on === today ? next.event : null };
}

export async function runPriceWatch({ vaultPath, now = Date.now(), deps = {} } = {}) {
  return locked(async () => {
    const stash = await loadStash(vaultPath);
    const watched = stash.categories.filter((c) => !c.bought).flatMap((c) => c.items.filter((i) => i.watch).map((i) => ({ ...i, shelf: c.name })));
    const seen = await loadSeen();
    const events = [];
    const reads = [];
    for (const it of watched) {
      const r = await readPrice(it, { now });
      reads.push({ name: it.name, state: r.state });
      if (!r.event) continue;
      const e = r.event;
      const where = hostOf(it.url);
      events.push({
        type: e.type,
        key: `${e.type}|${it.key}|${e.on}|${e.to ?? ''}`,
        itemKey: it.key,
        raw: it.raw,
        name: it.name,
        shelf: it.shelf,
        from: e.from,
        to: e.to,
        expiresAt: addDays(e.on, PRICE_NEWS_DAYS),
        title: e.type === 'price-drop'
          ? `${shortName(it.name)} dropped from ${money(e.from)} to ${money(e.to)} at ${where}.`
          : `${shortName(it.name)} is back in stock at ${where}${e.to != null ? `, ${money(e.to)}` : ''}.`,
        body: 'Read once today from the public page. Nova reads a watched price at most once a day.',
      });
    }
    const filed = await fileEvents(events, { now, deps, seen });
    await saveSeen(seen, now);
    return { reads, ...filed };
  });
}

/* ------------------------------ the tick ----------------------------------- */

// Level checks and gift days (no network). `now` and `deps` (sendPush) are
// injectable for tests. Expires what is stale.
export async function runStashSignals({ vaultPath, now = Date.now(), deps = {} } = {}) {
  return locked(async () => {
    const today = todayISO(now);
    const stash = await loadStash(vaultPath);
    const events = detectStashEvents({ stash, today });
    const seen = await loadSeen();
    const filed = await fileEvents(events, { now, deps, seen });
    await saveSeen(seen, now);
    const stillDue = new Set(events.filter((e) => e.type === 'level-check').map((e) => e.key));
    let expired = 0;
    for (const r of await listRecords()) {
      if (r.kind !== 'stash' || r.status !== 'pending') continue;
      const e = r.event || r.decision?.payload?.event;
      const stale = (r.expiresAt && Date.parse(r.expiresAt) <= now) || (e?.type === 'level-check' && !stillDue.has(e.key));
      if (stale) {
        await updateRecord(r.id, { status: 'discarded', discardedAt: new Date(now).toISOString(), expired: true, error: null, declineReason: e?.type === 'level-check' ? 'no longer due' : 'its time passed' });
        expired++;
      }
    }
    return { ...filed, expired };
  });
}

// A level check answered on the Stash closes its card in the Inbox.
export async function resolveLevelChecks(itemKey, outcome, { now = Date.now() } = {}) {
  let n = 0;
  for (const r of await listRecords()) {
    if (r.kind !== 'stash' || r.status !== 'pending') continue;
    const e = r.event || r.decision?.payload?.event;
    if (e?.type !== 'level-check' || e.itemKey !== itemKey) continue;
    await updateRecord(r.id, { status: 'filed', filedAt: new Date(now).toISOString(), auto: false, destination: null, outcome, error: null });
    n++;
  }
  return n;
}

/* ------------------------------ the CEO's read ----------------------------- */

// THE STASH, FOR EVERY AGENT THAT REASONS (his yes, 10 Oct: "what skincare am
// I running low on" answered from records). Code reads Stash.md and the
// Stash's own data; every figure here is computed, the model only reads it.
// Ask Nova carries it in his context; any agent can consult it
// (lib/consult.js AGENTS.stash, a code-read source like the calendar).
export async function stashContext({ vaultPath = process.env.VAULT_PATH, now = Date.now() } = {}) {
  if (!vaultPath) return null;
  const today = todayISO(now);
  const stash = await loadStash(vaultPath);
  const meta = await getMeta().catch(() => ({}));
  const live = stash.categories.filter((c) => !c.bought);
  const bought = stash.categories.find((c) => c.bought);
  const n = live.reduce((s, c) => s + c.items.length, 0);
  const lines = [`THE STASH (${today}). Read by code from Wiki/Library/Stash.md and Nova's own reads; every figure is exact, so quote them rather than estimate. Levels are counted in days from when he last bought each item, never measured.`];
  if (!n && !bought?.items.length) { lines.push('- The Stash is empty.'); return lines.join('\n'); }
  lines.push(`- ${plural(n, 'link')} on ${plural(live.length, 'shelf', 'shelves')}: ${live.map((c) => `${c.name} (${c.items.length})`).join(', ')}.`);
  const history = new Map();
  for (const b of bought?.items || []) { if (!history.has(b.key)) history.set(b.key, []); history.get(b.key).push(b); }
  const restock = [];
  for (const c of live) for (const it of c.items) {
    const r = rhythmOf(it, today);
    if (r) restock.push({ it, c, r });
  }
  restock.sort((a, b) => a.r.left - b.r.left);
  if (restock.length) {
    lines.push(`- Restock items, soonest first: ${restock.map(({ it, c, r }) => {
      const learned = learnedRhythm((history.get(it.key) || []).map((h) => h.bought));
      return `${it.name} (${c.name}): about ${plural(r.left, 'day')} left of ${plural(it.lasts, 'week')}, bought ${it.bought}${r.due ? ', CHECK THE LEVEL NOW' : `, check ${r.checkOn}`}${learned ? `; his last ${learned.purchases} purchases say every ${plural(learned.weeks, 'week')}` : ''}`;
    }).join('; ')}.`);
  } else lines.push('- No item has a restock rhythm set.');
  const watched = live.flatMap((c) => c.items.filter((i) => i.watch));
  if (watched.length) {
    lines.push(`- Watched prices: ${watched.map((it) => {
      const p = meta[it.key]?.price;
      if (!p) return `${it.name}: not read yet`;
      if (p.state === 'blocked') return `${it.name}: blocked by the site (${p.why}), last tried ${p.checkedOn}`;
      if (p.state === 'failed') return `${it.name}: could not be read on ${p.checkedOn} (${p.why})`;
      if (p.state === 'no-price') return `${it.name}: no price on its page`;
      return `${it.name}: ${p.amount != null ? money(p.amount) : 'no price'}${p.inStock === false ? ', OUT OF STOCK' : p.inStock ? ', in stock' : ''}, read ${p.checkedOn}${p.event ? ` (${p.event.type === 'price-drop' ? `down from ${money(p.event.from)}` : 'back in stock'} on ${p.event.on})` : ''}`;
    }).join('; ')}.`);
  }
  const gifts = live.filter((c) => c.gift);
  if (gifts.length) lines.push(`- Gift lists: ${gifts.map((c) => `${c.name}${c.date ? `, ${c.date} (${daysBetween(today, c.date) >= 0 ? `in ${plural(daysBetween(today, c.date), 'day')}` : 'passed'})` : ', no date'}: ${c.items.length ? c.items.map((i) => i.name).join(', ') : 'empty'}`).join('; ')}.`);
  const recent = [...(bought?.items || [])].sort((a, b) => String(b.bought || '').localeCompare(String(a.bought || ''))).slice(0, 8);
  if (recent.length) lines.push(`- Bought, newest first: ${recent.map((b) => `${b.name} on ${b.bought}${b.paid ? ` for ${money(b.paid)}` : ''}${b.from ? ` (from ${b.from})` : ''}`).join('; ')}.`);
  for (const c of live) {
    if (c.gift) continue;
    lines.push(`- ${c.name}: ${c.items.map((i) => `${i.name}${i.note ? ` (${i.note})` : ''}${i.read ? ' [read]' : ''}`).join('; ') || 'empty'}.`);
  }
  return lines.join('\n');
}

/* ------------------------------ the scheduler ------------------------------ */

const hourFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' });
export const PRICE_HOUR = 5;
let lastPriceDay = null;

// Level checks and gift days every half hour (cheap, no network; a push in
// quiet hours is held); the price watch once a day, on the first tick past
// 05:00 his time.
export function startStashScheduler(vaultPath) {
  if (!vaultPath) return;
  const tick = async () => {
    try { await runStashSignals({ vaultPath }); } catch (err) { console.error('stash signals failed:', err.message); }
    const day = todayISO();
    if (lastPriceDay !== day && Number(hourFmt.format(new Date())) >= PRICE_HOUR) {
      lastPriceDay = day;
      try { await runPriceWatch({ vaultPath }); } catch (err) { console.error('stash price watch failed:', err.message); }
    }
  };
  setTimeout(tick, 20_000);
  setInterval(tick, 30 * 60 * 1000);
}

export const _deps = metaDeps;
