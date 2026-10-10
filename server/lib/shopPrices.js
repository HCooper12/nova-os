import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productMatches, lineKey } from '../../src/shopPrice.js';

// THE PRICE READER (10 Oct 2026). His call, in his words: "Option A / nova
// confirms from their websites". Nova reads Woolworths, Coles and Aldi from
// the same public search pages anyone's browser loads, for the lines on his
// list only. It is his informed call against both chains' terms
// (design/audits/redesign-2026-09/14-shopping-stash-r2-research.md), so the
// reader is built to be the most polite visitor those sites will see:
//
//   - only his list's products: one search per line name per chain
//   - at most one read per product per chain per day, cached in server/data
//   - ONE request at a time across every chain, with a delay between them
//   - an honest user agent that says what it is, and nothing else dressed up
//   - one attempt per read; a failure is recorded, never retried in a loop
//   - a bot check, CAPTCHA, rate limit or block is NEVER evaded: no browser
//     fingerprinting, no rotating addresses, no solving challenges. The chain
//     is marked "blocked since …", the rest of its queue is dropped for the
//     day, and the screen says so. It is tried again once the next day, or
//     when he presses Try again (one request).
//
// Every product carries its chain, its own words for its size, its price,
// its unit price and any special the page showed, and every read carries
// when it happened. A line with no fresh read shows no price; nothing here
// ever guesses one.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = () => path.join(dataRoot(), 'shopping-prices.json');

// says what it is; carries nothing about who he is
export const USER_AGENT = 'NovaOS-Personal/1.0 (a personal shopping-list price check; at most one read per product per day)';
export const DELAY_MS = 8000;
export const TIMEOUT_MS = 20000;
const KEEP_PRODUCTS = 6;

/* --------------------------------------------------------- the chains -- */

export const CHAIN_DEFS = {
  w: {
    name: 'Woolworths',
    // the JSON the public search page itself loads
    request: (term) => ({
      url: 'https://www.woolworths.com.au/apis/ui/Search/products',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ SearchTerm: term, PageSize: 24, PageNumber: 1, SortType: 'TraderRelevance', Location: `/shop/search/products?searchTerm=${encodeURIComponent(term)}` }),
      },
    }),
    parse: (body) => parseWoolworths(body),
  },
  c: {
    name: 'Coles',
    // the public search page; its products ride in the page's own data block
    request: (term) => ({ url: `https://www.coles.com.au/search/products?q=${encodeURIComponent(term)}`, init: { headers: { accept: 'text/html' } } }),
    parse: (body) => parseColes(body),
  },
  a: {
    name: 'Aldi',
    // the product search the public results page loads
    request: (term) => ({ url: `https://api.aldi.com.au/v3/product-search?currency=AUD&serviceType=walk-in&q=${encodeURIComponent(term)}&limit=24&offset=0&sort=relevance`, init: { headers: { accept: 'application/json' } } }),
    parse: (body) => parseAldi(body),
  },
};

/* -------------------------------------------------------- the parsers -- */

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
class Unreadable extends Error {}

export function parseWoolworths(body) {
  let json = body;
  if (typeof body === 'string') {
    try { json = JSON.parse(body); } catch { throw new Unreadable('Woolworths answered with something that is not its product data'); }
  }
  const groups = json?.Products;
  if (!Array.isArray(groups)) throw new Unreadable('Woolworths answered without a product list');
  const out = [];
  for (const g of groups) {
    for (const p of (Array.isArray(g?.Products) ? g.Products : [g])) {
      if (!p) continue;
      const price = num(p.Price ?? p.InstorePrice);
      if (price == null || !(price > 0)) continue; // not sold online right now, or a $0.00 that is not a price
      const unit = clean(p.Unit);
      let size = clean(p.PackageSize);
      if (/^kg$/i.test(unit) && (!size || /per\s*kg/i.test(size))) size = '1kg';
      const was = num(p.WasPrice);
      out.push({
        chain: 'w',
        id: String(p.Stockcode ?? ''),
        name: clean(p.DisplayName || p.Name),
        size,
        price,
        unitPrice: clean(p.CupString) || null,
        was: was && was > price ? was : null,
        special: p.IsHalfPrice ? 'Half price' : (p.IsOnSpecial || p.InstoreIsOnSpecial) ? 'Special' : null,
        url: p.Stockcode ? `https://www.woolworths.com.au/shop/productdetails/${p.Stockcode}${p.UrlFriendlyName ? `/${p.UrlFriendlyName}` : ''}` : null,
        available: p.IsAvailable !== false,
      });
    }
  }
  return out;
}

export function parseColes(body) {
  const html = String(body || '');
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Unreadable('Coles answered without its product data block');
  let data;
  try { data = JSON.parse(m[1]); } catch { throw new Unreadable('Coles\' product data block did not read'); }
  const results = data?.props?.pageProps?.searchResults?.results;
  if (!Array.isArray(results)) throw new Unreadable('Coles answered without a results list');
  const out = [];
  for (const p of results) {
    if (!p || (p._type && p._type !== 'PRODUCT')) continue;
    const pr = p.pricing || {};
    const price = num(pr.now);
    if (price == null || !(price > 0)) continue;
    const was = num(pr.was);
    const multi = pr.multiBuyPromotion ? clean(pr.multiBuyPromotion.description || pr.multiBuyPromotion.type) : '';
    const special = pr.promotionType === 'SPECIAL' || pr.onlineSpecial || pr.specialType ? (clean(pr.priceDescription) || 'Special') : multi || null;
    out.push({
      chain: 'c',
      id: String(p.id ?? ''),
      name: clean([p.brand, p.name].filter(Boolean).join(' ')),
      size: clean(p.size),
      price,
      unitPrice: clean(pr.comparable) || null,
      was: was && was > price ? was : null,
      special,
      url: p.id ? `https://www.coles.com.au/product/${String(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${p.id}` : null,
      available: p.availability !== false,
    });
  }
  return out;
}

export function parseAldi(body) {
  let json = body;
  if (typeof body === 'string') {
    try { json = JSON.parse(body); } catch { throw new Unreadable('Aldi answered with something that is not its product data'); }
  }
  const list = json?.data;
  if (!Array.isArray(list)) throw new Unreadable('Aldi answered without a product list');
  const out = [];
  for (const p of list) {
    const pr = p?.price || {};
    // Aldi gives cents as a whole number; its display string is the check
    const cents = num(pr.amount);
    const price = cents != null ? cents / 100 : num(pr.amountRelevantDisplay);
    if (price == null || !(price > 0)) continue;
    const was = num(pr.wasPriceDisplay);
    out.push({
      chain: 'a',
      id: String(p.sku ?? ''),
      name: clean([p.brandName, p.name].filter(Boolean).join(' ')),
      size: clean(p.sellingSize),
      price,
      unitPrice: clean(pr.comparisonDisplay) || null,
      was: was && was > price ? was : null,
      special: was && was > price ? 'Special' : null,
      url: p.urlSlugText && p.sku ? `https://www.aldi.com.au/product/${p.urlSlugText}-${p.sku}` : null,
      available: p.notForSale !== true,
    });
  }
  return out;
}

// A bot check, a CAPTCHA, a rate limit or a block. Recognised, never answered.
const BLOCK_MARKS = [
  /_incapsula_resource|incapsula incident/i, /pardon our interruption/i, /access denied[\s\S]{0,200}reference #/i,
  /captcha/i, /cf-chl|challenge-platform|just a moment\.\.\./i, /px-captcha|perimeterx/i, /request unsuccessful/i,
  /bm-verify|akamai.*bot/i, /are you a robot|unusual traffic|automated (access|requests)/i,
];
export function detectBlock(status, body) {
  if (status === 429) return 'rate limited (429)';
  const text = typeof body === 'string' ? body.slice(0, 20000) : '';
  const marked = BLOCK_MARKS.find((re) => re.test(text));
  if (status === 403 || status === 401) return marked ? `a bot check (${status})` : `refused (${status})`;
  if (marked) return 'a bot check';
  return null;
}

/* ----------------------------------------------------------- the store -- */

const melDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const dayOf = (iso) => melDay(new Date(iso));

const emptyStore = () => ({ version: 1, reads: {}, chains: {} });
let cache = null;
export async function loadStore() {
  if (cache) return cache;
  try { cache = { ...emptyStore(), ...JSON.parse(await readFile(STORE(), 'utf8')) }; } catch { cache = emptyStore(); }
  return cache;
}
async function saveStore(s) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${STORE()}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 1));
  await rename(tmp, STORE());
}
export function _resetForTests() { cache = null; queue = null; try { rmSync(STORE()); } catch { /* none yet */ } }

/* ------------------------------------------------------------ the queue -- */

// ONE queue for every chain: one request in flight, ever, with a delay
// between any two. A job is (chain, term); a term already read today for
// that chain is never queued twice.
export function createQueue({ fetchImpl = globalThis.fetch, delayMs = DELAY_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => new Date(), onRead } = {}) {
  const jobs = [];
  const queued = new Set();
  let running = null;
  let lastAt = 0;
  const stats = { requests: 0, inFlight: 0, maxInFlight: 0 };

  async function runOne(job) {
    const s = await loadStore();
    const def = CHAIN_DEFS[job.chain];
    const wait = lastAt ? Math.max(0, delayMs - (Date.now() - lastAt)) : 0;
    if (wait && stats.requests > 0) await sleep(wait);
    const { url, init } = def.request(job.term);
    const at = now().toISOString();
    let status = 0;
    let body = '';
    let rec;
    stats.inFlight += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    stats.requests += 1;
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
      try {
        const res = await fetchImpl(url, { ...init, headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-AU', ...(init?.headers || {}) }, redirect: 'follow', signal: ctl?.signal });
        status = res.status;
        body = await res.text();
      } finally { if (timer) clearTimeout(timer); }
      const blocked = detectBlock(status, body);
      if (blocked) rec = { status: 'blocked', detail: blocked };
      else if (status < 200 || status >= 300) rec = { status: 'error', detail: `answered ${status}` };
      else {
        try {
          const all = def.parse(body);
          const products = all.filter((p) => p.available !== false && productMatches(job.term, p.name)).slice(0, KEEP_PRODUCTS);
          rec = { status: products.length ? 'ok' : 'none', products, seen: all.length };
        } catch (e) {
          rec = { status: 'unreadable', detail: e.message };
        }
      }
    } catch (e) {
      rec = { status: 'error', detail: e.name === 'AbortError' ? `no answer in ${TIMEOUT_MS / 1000}s` : String(e.message || e).slice(0, 160) };
    } finally {
      stats.inFlight -= 1;
      lastAt = Date.now();
    }
    const key = `${job.chain}|${job.term}`;
    s.reads[key] = { chain: job.chain, term: job.term, at, day: melDay(new Date(at)), ...rec };
    const ch = s.chains[job.chain] || {};
    if (rec.status === 'blocked') {
      s.chains[job.chain] = { ...ch, state: 'blocked', since: ch.state === 'blocked' && ch.since ? ch.since : at, lastAt: at, detail: rec.detail, triedDay: melDay(new Date(at)) };
      // the rest of this chain's reads wait for tomorrow or his Try again
      for (let i = jobs.length - 1; i >= 0; i -= 1) if (jobs[i].chain === job.chain) { queued.delete(`${jobs[i].chain}|${jobs[i].term}`); jobs.splice(i, 1); }
    } else if (rec.status === 'error' || rec.status === 'unreadable') {
      s.chains[job.chain] = { ...ch, state: rec.status, since: ch.state === rec.status && ch.since ? ch.since : at, lastAt: at, detail: rec.detail, triedDay: melDay(new Date(at)) };
    } else {
      s.chains[job.chain] = { state: 'ok', lastAt: at, triedDay: melDay(new Date(at)) };
    }
    await saveStore(s);
    onRead?.(key, s.reads[key]);
  }

  async function drain() {
    while (jobs.length) {
      const job = jobs.shift();
      queued.delete(`${job.chain}|${job.term}`);
      try { await runOne(job); } catch (e) { console.error('price read failed:', e.message); }
    }
    running = null;
  }

  return {
    stats,
    pending: () => jobs.map((j) => `${j.chain}|${j.term}`),
    add(chain, term) {
      const k = `${chain}|${term}`;
      if (queued.has(k) || !CHAIN_DEFS[chain] || !term) return false;
      queued.add(k);
      jobs.push({ chain, term });
      if (!running) running = drain();
      return true;
    },
    idle: () => running || Promise.resolve(),
  };
}

let queue = null;
function sharedQueue() { if (!queue) queue = createQueue(); return queue; }

/* ------------------------------------------------------------- the API -- */

// the terms his list asks for: one per distinct line name, unticked lines first
export function termsFor(items) {
  const seen = new Set();
  const out = [];
  for (const it of [...(items || [])].sort((a, b) => Number(!!a.checked) - Number(!!b.checked))) {
    const k = lineKey(it?.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

// Queue every read that is not already today's. A blocked chain is tried
// once a day (its first job), never more, until it answers.
export async function readStale(items, { q = sharedQueue(), now = new Date(), chains = Object.keys(CHAIN_DEFS) } = {}) {
  const s = await loadStore();
  const today = melDay(now);
  let added = 0;
  for (const chain of chains) {
    const ch = s.chains[chain];
    const blockedToday = ch && ch.state === 'blocked' && ch.triedDay === today;
    if (blockedToday) continue;
    for (const term of termsFor(items)) {
      const r = s.reads[`${chain}|${term}`];
      if (r && r.day === today && r.status !== 'blocked') continue;
      if (q.add(chain, term)) added += 1;
      // a chain that was blocked gets ONE probe; the rest follow if it answers
      if (ch && ch.state === 'blocked') break;
    }
  }
  return added;
}

// His Try again: one request for that chain, today, whatever its state.
export async function retryChain(chain, items, { q = sharedQueue() } = {}) {
  if (!CHAIN_DEFS[chain]) throw new Error('unknown chain');
  const term = termsFor(items)[0];
  if (!term) return false;
  const s = await loadStore();
  if (s.chains[chain]) s.chains[chain] = { ...s.chains[chain], triedDay: null };
  const ok = q.add(chain, term);
  // when it answers, the rest of the list follows through readStale
  q.idle().then(async () => {
    const st = await loadStore();
    if (st.chains[chain]?.state === 'ok') await readStale(items, { q, chains: [chain] });
  }).catch(() => {});
  return ok;
}

// What the screen reads: each chain's state, and every read for the list.
export async function pricesFor(items) {
  const s = await loadStore();
  const reads = {};
  for (const term of termsFor(items)) {
    for (const chain of Object.keys(CHAIN_DEFS)) {
      const r = s.reads[`${chain}|${term}`];
      if (!r) continue;
      (reads[term] ||= {})[chain] = { at: r.at, day: r.day, status: r.status, detail: r.detail || null, products: r.products || [] };
    }
  }
  const chains = {};
  for (const chain of Object.keys(CHAIN_DEFS)) {
    const c = s.chains[chain];
    chains[chain] = c ? { state: c.state, since: c.since || null, lastAt: c.lastAt || null, detail: c.detail || null } : { state: 'never' };
  }
  const q = queue;
  return { chains, reads, pending: q ? q.pending().length : 0, today: melDay(new Date()) };
}

export { lineKey };
