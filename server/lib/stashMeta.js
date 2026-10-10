import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stashKey, hostOf } from '../../src/stashUrl.js';

// WHAT THE STASH KNOWS ABOUT A LINK THAT IS NOT HIS (10 Oct 2026).
//
// The vault line holds his facts (lib/stash.js). This module holds what Nova
// read or noticed, all of it derived, operational and re-fetchable, so it
// lives in server/data/stash and never in the vault:
//   - the page's own picture (research 14 §2: og:image, then twitter:image,
//     the JSON-LD Product image, link rel=image_src, the apple-touch-icon),
//     saved once under media/ by a hash of its address, with a miss marker so
//     a page without one is not asked again
//   - the page's name, kind and site name, read once when the link is pasted
//     (so a pasted link arrives named) or, for links already on a shelf,
//     lazily, one at a time, the first time the Stash opens
//   - a reading link's text, fetched once for the Reader and kept under
//     reader/, with the paragraph he stopped at
//   - when he opened each link (the Last opened sort) and when Nova added it
//   - a watched product's price and stock, read at most once a day
//     (lib/stashWatch.js)
//
// POLITENESS, the same rules as Shopping's price reader (his, 10 Oct 2026):
// public pages only; ONE queue for every Stash read, one request at a time
// with a pause between them and a longer one between two reads of the same
// site; an honest User-Agent; nothing retried in a loop. NEVER past a bot
// check or a CAPTCHA: a 401, 403, 429 or 503, or a page that is a challenge,
// is recorded as blocked and said in those words. Nova never changes its
// User-Agent, adds cookies or tries again to get round one.
//
// Every network call goes through `deps.fetch`, so tests run on fixtures and
// never touch the web.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const stashDir = () => path.join(dataRoot(), 'stash');
const META_PATH = () => path.join(stashDir(), 'meta.json');
const mediaDir = () => path.join(stashDir(), 'media');
const readerDir = () => path.join(stashDir(), 'reader');

export const UA = 'NovaOS/1.0 (personal link preview for one person; reads a page once when he saves it)';
const PAGE_LIMIT = 700_000;
const IMAGE_MAX = 8_000_000;
const IMAGE_MIN = 600;
const TIMEOUT_MS = 9000;
export const WORDS_PER_MINUTE = 230;

export const deps = {
  fetch: (...a) => globalThis.fetch(...a),
  now: () => Date.now(),
  gapMs: 1200,       // between any two Stash reads
  sameHostGapMs: 6000, // between two reads of one site
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export const hashOf = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 20);
export const MEDIA_RE = /^[a-f0-9]{20}\.(jpg|png|webp|gif)$/;

/* ------------------------------- the queue -------------------------------- */

let queue = Promise.resolve();
let lastAt = 0;
const lastByHost = new Map();
export const queueStats = { waiting: 0, done: 0 };

// ONE QUEUE for every page or picture the Stash reads. Each job waits for
// the one before it, then for the gap since the last read and the longer gap
// since the last read of the same site.
export function politely(url, job) {
  queueStats.waiting++;
  const run = queue.then(async () => {
    const host = hostOf(url);
    const now = deps.now();
    const wait = Math.max(0, lastAt + deps.gapMs - now, (lastByHost.get(host) || 0) + deps.sameHostGapMs - now);
    if (wait > 0) await deps.sleep(wait);
    try {
      return await job();
    } finally {
      lastAt = deps.now();
      lastByHost.set(host, lastAt);
      queueStats.waiting--;
      queueStats.done++;
    }
  });
  queue = run.catch(() => {});
  return run;
}
export function _resetQueueForTests() { queue = Promise.resolve(); lastAt = 0; lastByHost.clear(); queueStats.waiting = 0; queueStats.done = 0; }

/* ------------------------------ reading a page ---------------------------- */

const CHALLENGE = /cf-chl|challenge-platform|cf_chl_opt|px-captcha|captcha-delivery|_Incapsula_Resource|perimeterx|<title>\s*(just a moment|attention required|access denied|pardon our interruption|are you a robot|robot check|security check)/i;

// Is this answer a wall? Returns the words to say, or null.
export function blockedReason(status, html = '') {
  if ([401, 403, 429, 503].includes(status)) return `the site refused the read (${status})`;
  if (CHALLENGE.test(String(html).slice(0, 60_000))) return 'the site asked for a bot check';
  return null;
}

async function timed(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await deps.fetch(url, { redirect: 'follow', ...opts, signal: ctl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

async function bodyText(res, limit = PAGE_LIMIT) {
  const reader = res.body?.getReader?.();
  if (!reader) return String(await res.text()).slice(0, limit);
  const dec = new TextDecoder();
  let html = '';
  while (html.length < limit) {
    const { value, done } = await reader.read();
    if (done) break;
    html += dec.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return html;
}

// One page, through the queue: { state: 'ok'|'blocked'|'failed', html, why }
export function fetchPage(url) {
  return politely(url, async () => {
    if (!/^https?:\/\//i.test(url)) return { state: 'failed', html: '', why: 'not a web address' };
    let res;
    try {
      res = await timed(url, { headers: { Accept: 'text/html,application/xhtml+xml' } });
    } catch (e) {
      return { state: 'failed', html: '', why: e?.name === 'AbortError' ? 'the site took too long' : 'the site could not be reached' };
    }
    const html = res.ok || [401, 403, 429, 503].includes(res.status) ? await bodyText(res).catch(() => '') : '';
    const blocked = blockedReason(res.status, html);
    if (blocked) return { state: 'blocked', html: '', why: blocked, status: res.status };
    if (!res.ok) return { state: 'failed', html: '', why: `the site answered ${res.status}`, status: res.status };
    return { state: 'ok', html, status: res.status };
  });
}

/* ------------------------------ parsing a page ---------------------------- */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
export function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ''; } })
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

function metas(html) {
  const list = [];
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) list.push(attrs(m[0]));
  return list;
}
const metaOf = (list, ...names) => {
  for (const n of names) {
    const hit = list.find((a) => (a.property || a.name || a.itemprop || '').toLowerCase() === n && a.content);
    if (hit) return hit.content.trim();
  }
  return null;
};

function jsonLd(html) {
  const out = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const v = JSON.parse(m[1].trim());
      const walk = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) { x.forEach(walk); return; }
        out.push(x);
        if (x['@graph']) walk(x['@graph']);
      };
      walk(v);
    } catch { /* a broken block is skipped */ }
  }
  return out;
}
const isType = (x, t) => [].concat(x?.['@type'] || []).some((y) => String(y).toLowerCase() === t);
const firstImage = (img) => {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  return img.url || img.contentUrl || null;
};
const abs = (u, base) => { try { return u ? new URL(u, base).toString() : null; } catch { return null; } };

// price and stock from JSON-LD offers, then the product meta tags
function offerOf(product, list) {
  const offers = [].concat(product?.offers || []).flatMap((o) => (o && isType(o, 'aggregateoffer') && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  const o = offers[0];
  let price = o ? Number(String(o.price ?? o.lowPrice ?? '').replace(/[^0-9.]/g, '')) : NaN;
  let currency = o?.priceCurrency || null;
  let avail = o?.availability || null;
  if (!Number.isFinite(price) || price <= 0) {
    const mp = metaOf(list, 'product:price:amount', 'og:price:amount', 'price');
    price = Number(String(mp || '').replace(/[^0-9.]/g, ''));
    currency = currency || metaOf(list, 'product:price:currency', 'og:price:currency', 'pricecurrency');
  }
  avail = avail || metaOf(list, 'product:availability', 'og:availability', 'availability');
  const a = String(avail || '').toLowerCase();
  const inStock = !a ? null : /outofstock|out of stock|oos|soldout|sold out|discontinued/.test(a) ? false : /instock|in stock|limitedavailability|onlineonly|preorder|backorder/.test(a) ? true : null;
  return { price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null, currency: currency || null, inStock };
}

// the reading text: paragraphs of the article, or of the page when it has none
export function readableText(html) {
  let h = String(html || '');
  const art = h.match(/<article\b[\s\S]*?<\/article>/i) || h.match(/<main\b[\s\S]*?<\/main>/i);
  if (art) h = art[0];
  h = h.replace(/<(script|style|noscript|nav|header|footer|aside|form|svg|figure)\b[\s\S]*?<\/\1>/gi, ' ');
  const paras = [];
  const re = /<(p|h2|h3|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(h))) {
    const text = decode(m[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const head = /^h[23]$/i.test(m[1]);
    if (head ? text.length >= 3 : text.length >= 40) paras.push(head ? { h: text } : { p: text });
  }
  const words = paras.reduce((n, x) => n + String(x.p || x.h).split(/\s+/).filter(Boolean).length, 0);
  return { paras, words, minutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0 };
}

// Everything the Stash reads off one page. Pure; tests feed it fixtures.
export function parsePage(html, url) {
  const list = metas(html);
  const lds = jsonLd(html);
  const product = lds.find((x) => isType(x, 'product')) || null;
  const titleTag = (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const title = decode(metaOf(list, 'og:title', 'twitter:title') || product?.name || titleTag || '').replace(/\s+/g, ' ').trim() || null;
  const links = [];
  const lre = /<link\b[^>]*>/gi;
  let m;
  while ((m = lre.exec(html))) links.push(attrs(m[0]));
  const linkHref = (rel) => links.find((l) => String(l.rel || '').toLowerCase().split(/\s+/).includes(rel) && l.href)?.href || null;
  const candidates = [
    metaOf(list, 'og:image:secure_url', 'og:image', 'og:image:url'),
    metaOf(list, 'twitter:image', 'twitter:image:src'),
    firstImage(product?.image),
    linkHref('image_src'),
  ].map((u) => abs(u, url)).filter(Boolean);
  const icon = abs(linkHref('apple-touch-icon') || linkHref('apple-touch-icon-precomposed'), url);
  const type = (metaOf(list, 'og:type') || (product ? 'product' : '')).toLowerCase() || null;
  return {
    title,
    siteName: metaOf(list, 'og:site_name') || null,
    type,
    product: !!product || /product/.test(type || ''),
    article: /article/.test(type || '') || lds.some((x) => isType(x, 'article') || isType(x, 'newsarticle') || isType(x, 'blogposting')),
    images: [...new Set(candidates)],
    icon,
    offer: offerOf(product, list),
  };
}

/* ------------------------------ the picture ------------------------------- */

const EXT = (type) => (/png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /jpe?g/.test(type) ? 'jpg' : /gif/.test(type) ? 'gif' : null);

// A picture to disk, through the queue. Returns "<hash>.<ext>" or null.
export async function cacheImage(imageUrl) {
  const key = hashOf(imageUrl);
  const dir = mediaDir();
  for (const ext of ['jpg', 'png', 'webp', 'gif']) if (existsSync(path.join(dir, `${key}.${ext}`))) return `${key}.${ext}`;
  if (existsSync(path.join(dir, `${key}.miss`))) return null;
  const got = await politely(imageUrl, async () => {
    try {
      const res = await timed(imageUrl, { headers: { Accept: 'image/*' } });
      if (blockedReason(res.status)) return { blocked: true };
      const ext = EXT(res.headers.get('content-type') || '');
      if (!res.ok || !ext) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < IMAGE_MIN || buf.length > IMAGE_MAX) return null;
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${key}.${ext}`), buf);
      return `${key}.${ext}`;
    } catch { return { failed: true }; }
  });
  if (typeof got === 'string') return got;
  // a real "no picture here" is remembered; a network hiccup or a wall is not
  if (got === null) { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, `${key}.miss`), '').catch(() => {}); }
  return null;
}

export async function readMedia(file) {
  if (!MEDIA_RE.test(String(file))) return null;
  const full = path.join(mediaDir(), file);
  if (!existsSync(full)) return null;
  const ext = file.split('.').pop();
  return { buf: await readFile(full), type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` };
}

/* ------------------------------ the store --------------------------------- */

let cache = null;
let storeChain = Promise.resolve();
const storeLocked = (fn) => { const run = storeChain.then(fn, fn); storeChain = run.catch(() => {}); return run; };

async function loadMeta() {
  if (cache) return cache;
  try { cache = JSON.parse(await readFile(META_PATH(), 'utf8')); } catch { cache = {}; }
  if (!cache.links || typeof cache.links !== 'object') cache.links = {};
  return cache;
}
async function saveMeta() {
  await mkdir(stashDir(), { recursive: true });
  const tmp = `${META_PATH()}.tmp`;
  await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
  await rename(tmp, META_PATH());
}
export function _resetMetaForTests() { cache = null; }

export async function getMeta() { return (await loadMeta()).links; }
export async function metaFor(url) { return (await loadMeta()).links[stashKey(url)] || null; }

// change one link's record; `fn` gets the record (created if new)
export function updateMeta(url, fn) {
  return storeLocked(async () => {
    const store = await loadMeta();
    const k = stashKey(url);
    const rec = store.links[k] || {};
    const next = fn(rec) || rec;
    store.links[k] = next;
    await saveMeta();
    return next;
  });
}

const isoNow = () => new Date(deps.now()).toISOString();

/* ------------------------------ the doors --------------------------------- */

// READ A LINK ONCE: its name, kind and picture. Used by the add bar's preview,
// by the Shortcut, and lazily for links already on a shelf. Never throws;
// a page that could not be read says so in `state` and `why`.
export async function previewLink(url, { force = false, images = true } = {}) {
  const known = await metaFor(url);
  if (known?.readAt && !force && (known.image || !images || known.imagesTried)) return viewOf(url, known);
  const page = await fetchPage(url);
  let parsed = null;
  let image = null;
  if (page.state === 'ok') {
    parsed = parsePage(page.html, url);
    if (images) {
      for (const cand of parsed.images.slice(0, 3)) { image = await cacheImage(cand); if (image) break; }
      if (!image && parsed.icon) image = await cacheImage(parsed.icon);
    }
  }
  const rec = await updateMeta(url, (r) => ({
    ...r,
    readAt: isoNow(),
    state: page.state,
    why: page.why || null,
    title: parsed?.title || r.title || null,
    siteName: parsed?.siteName || r.siteName || null,
    type: parsed?.type || null,
    product: parsed?.product || false,
    article: parsed?.article || false,
    image: image || r.image || null,
    imagesTried: images || r.imagesTried || false,
  }));
  return viewOf(url, rec);
}

function viewOf(url, rec) {
  return {
    url,
    host: hostOf(url),
    state: rec?.state || null,
    why: rec?.why || null,
    name: rec?.title || null,
    image: rec?.image || null,
    product: !!rec?.product,
    article: !!rec?.article,
  };
}

// the links on his shelves Nova has never read, filled one at a time in the
// background (the queue keeps it polite); returns how many it started
let filling = false;
export function fillMissing(urls, { limit = 40 } = {}) {
  if (filling) return 0;
  filling = true;
  (async () => {
    try {
      const links = await getMeta();
      const todo = urls.filter((u) => !links[stashKey(u)]?.readAt).slice(0, limit);
      for (const u of todo) await previewLink(u).catch(() => {});
    } finally { filling = false; }
  })();
  return 1;
}

export const noteAdded = (url, via = null) => updateMeta(url, (r) => ({ ...r, addedAt: r.addedAt || isoNow(), via: via || r.via || null }));
export const noteOpened = (url) => updateMeta(url, (r) => ({ ...r, opens: (r.opens || 0) + 1, lastOpened: isoNow() }));
export const notePlace = (url, para) => updateMeta(url, (r) => ({ ...r, place: { para: Math.max(0, Math.floor(Number(para) || 0)), at: isoNow() } }));

// THE READER (mockup 90, his yes to a fetch): the page's text, fetched once
// and kept. A page Nova cannot read keeps its reason, and the Reader says
// "Nova couldn't read this one" and offers the original.
export async function readerFor(url, { force = false } = {}) {
  const file = path.join(readerDir(), `${hashOf(stashKey(url))}.json`);
  if (!force && existsSync(file)) {
    try { return { ...JSON.parse(await readFile(file, 'utf8')), meta: await metaFor(url) }; } catch { /* re-read below */ }
  }
  const page = await fetchPage(url);
  let out;
  if (page.state !== 'ok') {
    out = { state: page.state, why: page.why, paras: [], words: 0, minutes: 0 };
  } else {
    const p = parsePage(page.html, url);
    const t = readableText(page.html);
    out = t.paras.length >= 2
      ? { state: 'ok', title: p.title, siteName: p.siteName, ...t }
      : { state: 'unreadable', why: 'the page is built by script or behind a sign-in', paras: [], words: 0, minutes: 0, title: p.title };
  }
  out.readAt = isoNow();
  await mkdir(readerDir(), { recursive: true });
  await writeFile(file, JSON.stringify(out), 'utf8');
  if (out.minutes) await updateMeta(url, (r) => ({ ...r, minutes: out.minutes, words: out.words }));
  return { ...out, meta: await metaFor(url) };
}
