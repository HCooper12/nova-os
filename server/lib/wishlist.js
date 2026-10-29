import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getNotionToken } from './notionAuth.js';
import { fetchPage, parsePage, cacheImage, decode } from './stashMeta.js';
import { stashKey, hostOf, TRACKING_PARAMS } from '../../src/stashUrl.js';

// HIS WISHLIST, IN NOTION (29 Oct 2026, his ask).
//
// "I should be able to just add a link to capture or voice and tell it to add
// to my Wishlist ... all of the relevant information and photos are added
// automatically." His list lives in Notion, "My Shopping Wishlist": one Items
// database shown four ways by Status, a Categories database, and a Sizes
// section he wrote by hand. Nova writes into it in his own style, and reads
// it back so a Nova page can show it cleaner.
//
// Models decide, code acts: nothing here asks a model. Code reads the
// product page (stashMeta: one polite queue, never past a bot check), cleans
// the name the way he writes names ("Union Bomber Jacket (navy)"), matches his
// own Category names from a table (CATEGORY_WORDS, pinned in the test), and
// fills only what it read for certain. What it could not fill becomes a
// QUESTION with tap options: category (no sure match) and colour or size
// (the page offers several and he named none). His calls, 29 Oct:
//   - Priority is never asked. His words set it; otherwise Medium.
//   - Stars: "⭐️" = one of the things he wants most, "⭐️⭐️" = higher within
//     those. Prefixed exactly like his rows, no space. Only from his own
//     words, never inferred, never asked.
//
// Every write rides the inbox rails: a record (kind 'wishlist', filed, with
// undoData) whose Undo archives the page (Notion keeps it in its trash 30
// days) or puts a status, a star or a removal back.
//
// THE CONNECTION. The token is his "Nova" integration (notionAuth.js). Notion
// only shows an integration the pages shared with it; until he adds the Nova
// connection on the Wishlist page every call answers 404, and Nova says so in
// those words (SHARE_HINT), never a vague error.
//
// API version 2025-09-03: the Items "database" is a data source in Notion's
// current model. The data source id is known (it is in his page); the
// database id is discovered from it and cached, with the Categories rows and
// his Sizes, in server/data/wishlist/state.json.

export const PAGE_ID = '1e3e517cc0d2800f933ffb82b5f59e2c';
export const ITEMS_DS = '1e3e517c-c0d2-81ca-8e59-000bb5261d72';
export const CATEGORIES_DS = '1e3e517c-c0d2-81a4-a54d-000b24d9beeb';
const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';
export const MIN_GAP_MS = 350;
export const SYNC_EVERY_MS = 15 * 60_000;

export const SHARE_HINT = 'Share My Shopping Wishlist with the Nova connection in Notion';
export const STATUSES = ['Considering Purchase', 'Purchasing This Month', 'Purchased', 'Cancelled'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const DEFAULT_PRIORITY = 'Medium';
// his mark for "one of the things I want most"; two is higher within those
export const STAR = '⭐️';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const dir = () => path.join(dataRoot(), 'wishlist');
const stateFile = () => path.join(dir(), 'state.json');
const itemsFile = () => path.join(dir(), 'items.json');

// swappable in tests: Notion is always a fake there
export const deps = {
  fetch: (...a) => globalThis.fetch(...a),
  getToken: getNotionToken,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  minGapMs: MIN_GAP_MS,
  now: () => new Date(),
  cacheImage,
};

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  await mkdir(dir(), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file);
}

// ---------------------------------------------------------------- the client

const rt = (text, link) => [{ type: 'text', text: { content: String(text).slice(0, 2000), ...(link ? { link: { url: link } } : {}) } }];
const plain = (arr) => (arr || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');

// what to tell him, never the token or a raw body
export function notionError(status, json) {
  const msg = String(json?.message || '');
  const err = new Error('');
  err.status = status;
  if (status === 401) { err.code = 'rejected'; err.message = 'Notion did not accept the key. Paste it again in Settings › Notion'; }
  else if (status === 403 || /shared with your integration/i.test(msg)) { err.code = 'not-shared'; err.message = `Nova cannot see your Wishlist yet. ${SHARE_HINT}`; }
  else if (status === 404) { err.code = 'gone'; err.message = 'that item is no longer in your Notion Wishlist'; }
  else if (status === 400 || status === 409) { err.code = 'refused'; err.message = `Notion refused the change (${msg ? msg.slice(0, 140) : status})`; }
  else { err.code = 'unreachable'; err.message = `Notion could not be reached (${status})`; }
  return err;
}

function client(token) {
  let last = 0;
  async function call(method, url, body, retry = 1) {
    const wait = last + deps.minGapMs - Date.now();
    if (wait > 0) await deps.sleep(wait);
    last = Date.now();
    const res = await deps.fetch(`${NOTION}${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && retry > 0) {
      const after = Number(res.headers?.get?.('retry-after')) || 1;
      await deps.sleep(after * 1000);
      return call(method, url, body, retry - 1);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw notionError(res.status, json);
    return json;
  }
  return { call };
}

async function api() {
  const token = await deps.getToken();
  if (!token) { const e = new Error('Connect Notion in Settings first'); e.code = 'not-connected'; throw e; }
  return client(token);
}

// ---------------------------------------------------------------- discovery

// HIS SIZES, as he wrote them: the blocks under the "Sizes" heading, a bold
// line naming the garment and his bullet points under it. Pure.
export function parseSizes(flat) {
  const out = {};
  let label = null;
  for (const b of flat) {
    const text = String(b.text || '').trim();
    if (!text) continue;
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') {
      if (label) out[label].push(text);
    } else if (b.type === 'paragraph') {
      label = text.replace(/[:\s]+$/, '');
      out[label] = out[label] || [];
    }
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return out;
}

const blockText = (b) => plain(b?.[b.type]?.rich_text);
const isHeading = (b) => /^heading_\d$/.test(b?.type);

async function children(c, id) {
  const all = [];
  let cursor;
  do {
    const r = await c.call('GET', `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    all.push(...(r.results || []));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return all;
}

// the Sizes section only: what follows the "Sizes" heading up to the next
// heading or the next column block (his page puts the databases there)
async function readSizes(c) {
  const top = await children(c, PAGE_ID);
  const start = top.findIndex((b) => isHeading(b) && /^sizes$/i.test(blockText(b).trim()));
  if (start < 0) return {};
  const flat = [];
  const walk = async (b) => {
    if (b.type === 'column_list' || b.type === 'column') {
      for (const k of await children(c, b.id)) await walk(k);
      return;
    }
    flat.push({ type: b.type, text: blockText(b) });
  };
  let took = false;
  for (const b of top.slice(start + 1)) {
    if (isHeading(b) || b.type === 'divider' || b.type === 'child_database') break;
    if (b.type === 'column_list') { if (took) break; await walk(b); took = true; continue; }
    if (b.type === 'paragraph' && !blockText(b).trim()) continue;
    await walk(b);
    took = true;
  }
  return parseSizes(flat);
}

export async function readState() {
  return readJson(stateFile(), { databaseId: null, categories: [], sizes: {}, discoveredAt: null });
}

// Finds the Items database behind the data source, his Categories rows and
// his Sizes; cached. `force` reads them again.
export async function discover({ force = false } = {}) {
  const st = await readState();
  if (!force && st.databaseId && st.categories.length) return st;
  const c = await api();
  const ds = await c.call('GET', `/data_sources/${ITEMS_DS}`);
  const databaseId = ds?.parent?.database_id || ds?.database_parent?.database_id || null;
  const catsDs = ds?.properties?.Categories?.relation?.data_source_id || CATEGORIES_DS;
  const cats = [];
  let cursor;
  do {
    const r = await c.call('POST', `/data_sources/${catsDs}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    for (const p of r.results || []) {
      const name = plain(p.properties?.Name?.title).trim();
      if (name && !p.archived && !p.in_trash) cats.push({ id: p.id, name });
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  let sizes = {};
  try { sizes = await readSizes(c); } catch (e) { if (e.code === 'not-shared') throw e; /* no sizes: never invent */ }
  const next = { databaseId, categoriesDs: catsDs, categories: cats, sizes, discoveredAt: deps.now().toISOString() };
  await writeJson(stateFile(), next);
  return next;
}

// ---------------------------------------------------------------- reading a link

// tracking tags off, every other parameter kept (a ?variant= is a product)
export function cleanLink(url) {
  try {
    const u = new URL(String(url).trim());
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(k) || TRACKING_PARAMS.includes(k.toLowerCase()) || /^(gad_|gclsrc|cfc|mv_pc|region_id)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    return u.toString();
  } catch { return String(url || '').trim(); }
}

const COLOURS = ['black', 'white', 'navy', 'blue', 'khaki', 'olive', 'green', 'grey', 'gray', 'brown', 'tan', 'cream', 'beige', 'red', 'burgundy', 'maroon',
  'pink', 'purple', 'yellow', 'orange', 'camel', 'chestnut', 'brandy', 'tobacco', 'charcoal', 'ivory', 'sand', 'stone', 'natural', 'oak', 'walnut', 'silver',
  'gold', 'ecru', 'indigo', 'mustard', 'sage', 'teal', 'rust', 'taupe', 'mocha', 'espresso', 'cognac', 'oatmeal', 'bone'];
const COLOUR_RE = new RegExp(`^(?:${COLOURS.join('|')})$`, 'i');
const isColour = (s) => String(s || '').trim().split(/\s+(?:and|&|\/)\s+|\s+|\//).filter(Boolean).every((w) => COLOUR_RE.test(w));

const STORE_RE = /^(?:shop(?: online)?|buy(?: online)?|online|official(?: site| store| website)?|free (?:shipping|delivery|returns)|australia|au|nz|uk|us|usa|store|new arrivals|sale)$/i;
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The colour a link names: his words first, then the URL's colour parameter,
// then the colour words that end the URL's slug ("…-bomber-jacket-navy").
export function colourFrom({ url, words = '' }) {
  const said = String(words).toLowerCase().match(new RegExp(`\\b(?:in|colour|color)\\s+((?:${COLOURS.join('|')})(?:\\s+(?:and|&)\\s+(?:${COLOURS.join('|')}))?)\\b`));
  if (said) return said[1];
  try {
    const u = new URL(url);
    for (const k of ['color', 'colour', 'variant_color', 'colorway']) {
      const v = u.searchParams.get(k);
      if (v && isColour(v.replace(/[-_+]/g, ' '))) return v.replace(/[-_+]/g, ' ').toLowerCase();
    }
    const slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').toLowerCase().replace(/\.html?$/, '');
    const parts = slug.split(/[-_]/).filter(Boolean);
    const tail = [];
    while (parts.length > 1 && COLOUR_RE.test(parts[parts.length - 1])) {
      tail.unshift(parts.pop());
      // "navy-and-white"
      if (parts.length > 2 && parts[parts.length - 1] === 'and' && COLOUR_RE.test(parts[parts.length - 2])) parts.pop();
    }
    if (tail.length) return tail.join(' and ');
  } catch { /* not a URL */ }
  return null;
}

// "Men's Union Bomber Jacket | Thursday Boots" → "Union Bomber Jacket".
// Trailing segments that are the store (its site name or its host) or shop
// boilerplate go; a trailing colour segment becomes the variant.
export function cleanName(title, { siteName = '', host = '' } = {}) {
  let t = decode(String(title || '')).replace(/\s+/g, ' ').trim();
  t = t.replace(/^buy\s+/i, '');
  const segs = t.split(/\s+[|–—]\s+|\s+-\s+|\s+::\s+/).map((s) => s.trim().replace(/\s+online$/i, '')).filter(Boolean);
  const site = squash(siteName);
  const stem = squash(String(host).replace(/^(?:www|au|shop|store)\./, '').split('.')[0]);
  let colour = null;
  while (segs.length > 1) {
    const last = segs[segs.length - 1];
    const sq = squash(last);
    if ((site && (sq === site || sq.includes(site) || (sq.length > 3 && site.includes(sq)))) || (stem && (sq === stem || sq.includes(stem) || (sq.length > 3 && stem.includes(sq)))) || STORE_RE.test(last)) { segs.pop(); continue; }
    if (!colour && isColour(last)) { colour = last.toLowerCase(); segs.pop(); continue; }
    break;
  }
  let name = segs.join(' - ')
    .replace(/^(?:men'?s|mens)\s+/i, '')
    .replace(/\s*[-–,]?\s*(?:AU)?\$\s?\d[\d,.]*\s*$/i, '')
    .trim();
  // ", Black" on the end of the one segment left
  const comma = name.match(/^(.*\S),\s*([A-Za-z &/]+)$/);
  if (!colour && comma && isColour(comma[2])) { colour = comma[2].toLowerCase(); name = comma[1]; }
  if (name.length > 120) name = `${name.slice(0, 117).trim()}...`;
  return { name, colour };
}

// What colours and sizes the page itself offers (JSON-LD ProductGroup /
// hasVariant / offers). Pure.
export function pageVariants(html) {
  const colours = new Set();
  const sizes = new Set();
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const take = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(take); return; }
    if (typeof x.color === 'string' && x.color.trim()) colours.add(x.color.trim());
    if (typeof x.size === 'string' && x.size.trim()) sizes.add(x.size.trim());
    if (x.size && typeof x.size === 'object' && x.size.name) sizes.add(String(x.size.name).trim());
    take(x.hasVariant);
    take(x['@graph']);
    take(x.offers);
    take(x.itemOffered);
  };
  while ((m = re.exec(String(html || '')))) {
    try { take(JSON.parse(m[1].trim())); } catch { /* a broken block is skipped */ }
  }
  return { colours: [...colours].slice(0, 12), sizes: [...sizes].slice(0, 12) };
}

// ---------------------------------------------------------------- his words

// HIS CATEGORY NAMES → the words that mean them. Code matches; a category
// in Notion with no row here still matches by its own name. Unsure → asked.
export const CATEGORY_WORDS = {
  Cologne: ['cologne', 'parfum', 'eau de parfum', 'eau de toilette', 'edt', 'edp', 'fragrance', 'perfume', 'aftershave'],
  Shoes: ['shoe', 'shoes', 'boot', 'boots', 'sneaker', 'sneakers', 'trainer', 'trainers', 'loafer', 'loafers', 'sandal', 'sandals', 'slides', 'dunk', 'air force', 'chelsea', 'footwear', 'runners'],
  Clothing: ['clothing', 'clothes', 'jacket', 'bomber', 'shirt', 't-shirt', 'tee', 'jumper', 'sweater', 'hoodie', 'sweatshirt', 'cardigan', 'pants', 'trousers', 'chinos', 'jeans', 'shorts', 'coat', 'blazer', 'suit', 'underwear', 'boxer', 'boxers', 'socks', 'polo', 'knit', 'knitwear', 'vest', 'overshirt', 'apparel'],
  Books: ['book', 'books', 'paperback', 'hardcover', 'hardback', 'kindle', 'novel', 'isbn', 'booktopia'],
  Technology: ['technology', 'tech', 'airpods', 'iphone', 'ipad', 'macbook', 'laptop', 'headphones', 'earbuds', 'speaker', 'monitor', 'keyboard', 'apple tv', 'camera', 'charger', 'gadget', 'tablet', 'smart'],
  Furniture: ['furniture', 'cabinet', 'chair', 'table', 'desk', 'sofa', 'couch', 'bed frame', 'shelf', 'shelving', 'bookcase', 'dresser', 'drawers', 'stool', 'sideboard', 'console table', 'armchair'],
  Posters: ['poster', 'posters', 'art print', 'wall art', 'framed print'],
  Entertainment: ['entertainment', 'video game', 'playstation', 'ps5', 'xbox', 'nintendo', 'blu-ray', 'vinyl record', 'board game', 'lego'],
  'Funko Pops': ['funko', 'funko pop', 'pop vinyl'],
  Accessories: ['accessories', 'accessory', 'wallet', 'belt', 'watch', 'sunglasses', 'bag', 'backpack', 'cap', 'hat', 'ring', 'necklace', 'bracelet', 'cufflinks', 'tie', 'scarf', 'keyring'],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => new RegExp(`(?:^|[^a-z0-9])${esc(w.toLowerCase())}(?:$|[^a-z0-9])`).test(text);

function hitsIn(text, names) {
  const t = String(text || '').toLowerCase().replace(/[-_/]+/g, ' ');
  const hits = new Set();
  for (const n of names) {
    const words = [n, ...(CATEGORY_WORDS[n] || [])];
    if (words.some((w) => hasWord(t, w))) hits.add(n);
  }
  return [...hits];
}

// { name, why } or { name: null, candidates } — his words, then the page's
// name, then the URL. One category in a tier settles it; two is a question.
export function matchCategory({ words = '', title = '', url = '' }, names) {
  let urlPath = '';
  try { urlPath = decodeURIComponent(new URL(url).pathname); } catch { /* none */ }
  for (const [tier, text] of [['your words', words], ['the page name', title], ['the link', urlPath]]) {
    const hits = hitsIn(text, names);
    if (hits.length === 1) return { name: hits[0], why: `from ${tier}` };
    if (hits.length > 1) return { name: null, candidates: hits, why: `${tier} fit ${hits.join(' and ')}` };
  }
  return { name: null, candidates: [], why: 'nothing on the page named one' };
}

export function priorityFrom(words) {
  const w = String(words || '').toLowerCase();
  if (/\b(?:high(?:est)? priority|priority (?:is )?high|top priority|really want|must[- ]have|need (?:this|it)|asap)\b/.test(w)) return 'High';
  if (/\b(?:low priority|priority (?:is )?low|no rush|some ?day|one day|eventually|not urgent)\b/.test(w)) return 'Low';
  if (/\b(?:medium priority|priority (?:is )?medium|mid priority)\b/.test(w)) return 'Medium';
  return null;
}

// ⭐️ only from his own words (his call, 29 Oct): two is "top of my most
// wanted", one is "one of my top wants". Never inferred, never asked.
export function starsFrom(words) {
  const w = String(words || '').toLowerCase();
  if (/\b(?:two stars?|2 stars?|double star|top of (?:my|the) (?:most wanted|top wants|list)|most wanted of all|number one want)\b|⭐️\s*⭐️|⭐⭐/.test(w)) return 2;
  if (/\b(?:star (?:it|this|that)|one star|1 star|starred|one of (?:my|the) (?:top wants|most wanted|top things)|most wanted|top wants?|things? i want most)\b|⭐/.test(w)) return 1;
  return 0;
}

export function statusFrom(words) {
  return /\bthis month\b/i.test(String(words || '')) ? 'Purchasing This Month' : 'Considering Purchase';
}

// what is left of his words once the command, priority, stars, status and a
// named category are taken out: his own note
export function notesFrom(words, categoryNames = []) {
  let w = String(words || '').replace(/https?:\/\/\S+/g, ' ');
  w = w.replace(/^\s*(?:hey |ok )?(?:nova[,\s]+)?(?:please\s+|can you\s+|could you\s+)?/i, '')
    .replace(/\b(?:add|put|save|stick|throw|pop)\s+(?:this|that|it)?\s*(?:to|on|in|into|onto)\s+(?:my\s+|the\s+)?wish\s?list\b/gi, ' ')
    .replace(/\b(?:wish\s?list(?: this| it| that)?|for (?:my|the) wish\s?list|to (?:my|the) wish\s?list|on (?:my|the) wish\s?list)\b/gi, ' ')
    .replace(/\b(?:high(?:est)?|medium|mid|low) priority\b|\bpriority (?:is )?(?:high|medium|low)\b|\btop priority\b|\breally want(?: (?:this|it))?\b|\bmust[- ]have\b|\bno rush\b|\bnot urgent\b|\bsome ?day\b|\beventually\b/gi, ' ')
    .replace(/\b(?:two stars?|2 stars?|one star|1 star|double star|star (?:it|this|that)|top of (?:my|the) (?:most wanted|top wants|list)|one of (?:my|the) (?:top wants|most wanted|top things)|most wanted|top wants?)\b|⭐️|⭐/gi, ' ')
    .replace(/\b(?:for |buying it |buy it )?this month\b/gi, ' ');
  for (const n of categoryNames) w = w.replace(new RegExp(`\\b(?:under|in|as|into)\\s+(?:my\\s+|the\\s+)?${esc(n)}\\b`, 'gi'), ' ');
  w = w.replace(/\s+/g, ' ').replace(/^[\s,.;:—–&-]+|[\s,.;:—–&-]+$/g, '').replace(/^(?:and|with|it'?s|its)\s+/i, '').trim();
  if (!/[a-z0-9]{2}/i.test(w)) return '';
  return w[0].toUpperCase() + w.slice(1);
}

// His size for this thing, from his Sizes section, verbatim; null when he
// wrote none for it (a jacket, socks): never invented.
const SIZE_SECTIONS = [
  [/\b(?:shoe|shoes|boot|boots|sneakers?|trainers?|loafers?|footwear|dunk|air force)\b/i, /shoe|foot/i],
  [/\b(?:pants|trousers|chinos|jeans)\b/i, /pant|trouser|jean/i],
  [/\b(?:sweater|jumper|hoodie|sweatshirt|cardigan|knit)\b/i, /sweater|jumper/i],
  [/\b(?:shirt|tee|t-shirt|polo|overshirt)\b/i, /shirt/i],
];
export function sizeNote(text, category, sizes = {}) {
  const t = `${text} ${category === 'Shoes' ? 'shoes' : ''}`;
  for (const [garment, label] of SIZE_SECTIONS) {
    if (!garment.test(t)) continue;
    const key = Object.keys(sizes).find((k) => label.test(k));
    if (key && sizes[key]?.length) return `Size: ${sizes[key].join('; ')}`;
    return null;
  }
  return null;
}

const withStars = (name, n) => `${STAR.repeat(Math.max(0, Math.min(3, n || 0)))}${name}`;
// "⭐️⭐️Name" → { stars: 2, base: "Name" } (his rows sometimes carry a space)
export function splitStars(name) {
  const m = String(name || '').match(/^((?:⭐️|⭐)+)\s*/u);
  if (!m) return { stars: 0, base: String(name || '').trim() };
  return { stars: (m[1].match(/⭐/gu) || []).length, base: String(name).slice(m[0].length).trim() };
}

export function displayName({ base, variant }) {
  return variant ? `${base} (${variant})` : base;
}

// ---------------------------------------------------------------- the draft

// Everything code can read off one link and his words. Never throws for a
// page that would not read: the link alone still makes a row, and says so.
export async function draftFromLink(url, said = '', { state } = {}) {
  const st = state || (await readState());
  const names = st.categories.map((c) => c.name);
  const link = cleanLink(url);
  const host = hostOf(link);
  const page = await fetchPage(link);
  const parsed = page.state === 'ok' ? parsePage(page.html, link) : null;
  const variants = page.state === 'ok' ? pageVariants(page.html) : { colours: [], sizes: [] };
  const { name: cleaned, colour: titleColour } = cleanName(parsed?.title || '', { siteName: parsed?.siteName || '', host });
  const fallbackName = (() => {
    try { return decodeURIComponent(new URL(link).pathname.split('/').filter(Boolean).pop() || host).replace(/\.html?$/, '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()); } catch { return host; }
  })();
  let base = cleaned || fallbackName;
  let variant = colourFrom({ url: link, words: said }) || titleColour || null;
  if (variant) {
    // the colour is in brackets, so not in the name as well
    base = base.replace(new RegExp(`\\s*[-,]?\\s*\\b${esc(variant)}\\b\\s*$`, 'i'), '').trim() || base;
  }
  // matched on the CLEANED name: "| Thursday Boots" is the shop, not shoes
  const cat = matchCategory({ words: said, title: base, url: link }, names);
  if (cat.name === 'Books' && !variant && !/\(book\)$/i.test(base)) variant = 'Book';
  const notes = [];
  const own = notesFrom(said, names);
  if (own) notes.push(own);
  if (!/\bsize\b/i.test(said)) {
    const sn = sizeNote(`${base} ${said}`, cat.name, st.sizes);
    if (sn) notes.push(sn);
  }
  let price = null;
  const offer = parsed?.offer || {};
  if (offer.price) {
    const cur = String(offer.currency || '').toUpperCase();
    if (cur === 'AUD' || (!cur && /\.au$/i.test(host))) price = offer.price;
    else notes.push(`Listed at ${offer.price}${cur ? ` ${cur}` : ' (no currency given)'}, not in AUD, so Price is empty`);
  }
  const image = parsed?.images?.[0] || null;
  const draft = {
    url: link,
    host,
    siteName: parsed?.siteName || null,
    read: page.state === 'ok' ? 'ok' : page.why || 'the page could not be read',
    base,
    variant,
    stars: starsFrom(said),
    priority: priorityFrom(said) || DEFAULT_PRIORITY,
    prioritySaid: !!priorityFrom(said),
    status: statusFrom(said),
    category: cat.name,
    categoryWhy: cat.why,
    categoryCandidates: cat.candidates || [],
    price,
    image,
    notes: notes.join('. '),
    pageColours: variants.colours,
    pageSizes: variants.sizes,
    said: String(said || '').trim(),
  };
  draft.name = withStars(displayName(draft), draft.stars);
  draft.questions = questionsFor(draft, names);
  return draft;
}

// THE ONLY QUESTIONS: what code could not fill. Category when nothing (or
// two things) matched; colour or size when the page offers several and he
// named none (and, for a size, his Sizes section had no line for it).
// Priority and stars are never asked (his call, 29 Oct).
export function questionsFor(draft, categoryNames = []) {
  const qs = [];
  if (!draft.category && categoryNames.length) {
    const first = draft.categoryCandidates?.length ? draft.categoryCandidates : [];
    const rest = categoryNames.filter((n) => !first.includes(n));
    qs.push({ field: 'category', ask: 'Which list does it go under?', options: [...first, ...rest], upFront: Math.max(first.length, Math.min(6, categoryNames.length)) });
  }
  if (!draft.variant && (draft.pageColours?.length || 0) > 1) {
    qs.push({ field: 'colour', ask: 'Which colour?', options: draft.pageColours.slice(0, 8), upFront: 6 });
  }
  const hasSize = /\bsize\b/i.test(`${draft.notes || ''} ${draft.said || ''}`);
  if (!hasSize && (draft.pageSizes?.length || 0) > 1) {
    qs.push({ field: 'size', ask: 'Which size?', options: draft.pageSizes.slice(0, 8), upFront: 6 });
  }
  return qs;
}

// ---------------------------------------------------------------- writing

export function propertiesFor(draft, st) {
  const props = {
    Name: { title: rt(draft.name) },
    'Item link': { rich_text: rt(draft.url, draft.url) },
    Priority: { select: { name: draft.priority || DEFAULT_PRIORITY } },
    Status: { status: { name: STATUSES.includes(draft.status) ? draft.status : 'Considering Purchase' } },
  };
  if (draft.price != null) props.Price = { number: draft.price };
  const cat = draft.category && st.categories.find((c) => c.name === draft.category);
  if (cat) props.Categories = { relation: [{ id: cat.id }] };
  if (draft.image) props.Gallery = { files: [{ type: 'external', name: String(draft.base || 'photo').slice(0, 90), external: { url: draft.image } }] };
  if (draft.notes) props.Notes = { rich_text: rt(draft.notes) };
  return props;
}

// One row in his Items database. Returns { pageId, url }.
export async function addItem(draft, { state } = {}) {
  const st = state || (await discover());
  const c = await api();
  const page = await c.call('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: ITEMS_DS },
    properties: propertiesFor(draft, st),
  });
  kickSync();
  return { pageId: page.id, url: page.url || `https://www.notion.so/${String(page.id).replace(/-/g, '')}` };
}

async function patchPage(pageId, body) {
  const c = await api();
  return c.call('PATCH', `/pages/${pageId}`, body);
}

const where = (status) => `Wishlist · ${status === 'Purchasing This Month' ? 'This month' : status === 'Considering Purchase' ? 'Considering' : status}`;

async function fileRecord({ text, destination, undoData, payload, source = 'wishlist', status = 'filed', id }) {
  const { createRecord } = await import('./inboxStore.js');
  const now = deps.now().toISOString();
  return createRecord({
    id: id || randomUUID().slice(0, 8),
    kind: 'wishlist',
    text,
    source,
    status,
    auto: true,
    mode: 'auto',
    createdAt: now,
    filedAt: now,
    destination,
    undoData,
    decision: { route: 'wishlist', confidence: 'high', title: destination, reason: 'Read from the link by code; only what it could not fill is asked.', payload: payload || {} },
  });
}

// The one line Nova says, then the first open question in words.
export function saidFor(draft, questions = draft.questions || []) {
  const head = `Added ${draft.name} to your Wishlist, under ${draft.category || 'no category yet'}${draft.price != null ? `, $${draft.price}` : ''}.`;
  const q = questions[0];
  if (!q) return head;
  const opts = q.options.slice(0, 3);
  return `${head} ${q.ask.replace(/\?$/, '')}: ${opts.join(', ')}${q.options.length > 3 ? ', or another' : ''}?`;
}

// THE WHOLE ADD, for every door (Quick Capture, voice, the route). Checks
// Notion can see the list BEFORE it reads the shop's page, writes the row,
// files the record. `record` (optional) is a record already on the board
// (Quick Capture puts it there first so the row shows at once).
export async function addFromLink(vaultPath, { url, said = '', source = 'text', record = null } = {}) {
  const { createRecord, updateRecord } = await import('./inboxStore.js');
  const text = [String(said || '').trim(), String(url || '').trim()].filter(Boolean).join(' ').slice(0, 300) || 'Wishlist';
  const rec = record || await createRecord({ id: randomUUID().slice(0, 8), kind: 'wishlist', text, source, status: 'classifying', createdAt: deps.now().toISOString(), decision: null });
  try {
    if (!/^https?:\/\//i.test(String(url || '').trim())) throw Object.assign(new Error('that is not a web link'), { code: 'bad-link' });
    const st = await discover();
    const known = await readItems();
    const dupe = (known.items || []).find((i) => i.link && stashKey(i.link) === stashKey(cleanLink(url)));
    if (dupe) throw Object.assign(new Error(`that is already on your Wishlist as ${dupe.name}`), { code: 'duplicate' });
    const draft = await draftFromLink(url, said, { state: st });
    const page = await addItem(draft, { state: st });
    const filed = await updateRecord(rec.id, {
      status: 'filed',
      filedAt: deps.now().toISOString(),
      auto: true,
      destination: where(draft.status),
      undoData: { kind: 'wishlist-add', pageId: page.pageId, name: draft.name },
      decision: {
        route: 'wishlist', confidence: 'high', title: `Added ${draft.name}`,
        reason: 'Read from the link by code; only what it could not fill is asked.',
        payload: { pageId: page.pageId, pageUrl: page.url, draft: slimDraft(draft), questions: draft.questions },
      },
    });
    // the photo, kept on this Mac so Nova's page never waits on the shop
    if (draft.image) deps.cacheImage(draft.image).catch?.(() => {});
    return { record: filed, draft, pageId: page.pageId, pageUrl: page.url, questions: draft.questions, said: saidFor(draft) };
  } catch (e) {
    const failed = await updateRecord(rec.id, { status: 'error', error: e.message, errorCode: e.code || null, failedAt: deps.now().toISOString() }).catch(() => rec);
    const err = new Error(e.message);
    err.code = e.code;
    err.status = e.code === 'not-shared' || e.code === 'not-connected' ? 409 : e.code === 'duplicate' ? 409 : e.code === 'bad-link' ? 400 : 502;
    err.record = failed;
    throw err;
  }
}

// Quick Capture's door: the row goes on the board now, the work runs behind
const slimDraft = (d) => ({
  name: d.name, base: d.base, variant: d.variant, stars: d.stars, url: d.url, host: d.host, priority: d.priority, status: d.status,
  category: d.category, price: d.price, image: d.image, notes: d.notes, read: d.read,
});

export async function startWishlistCapture(vaultPath, { url, said = '', source = 'text' }) {
  const { createRecord } = await import('./inboxStore.js');
  const text = [String(said || '').trim(), url].filter(Boolean).join(' ').slice(0, 300);
  const rec = await createRecord({ id: randomUUID().slice(0, 8), kind: 'wishlist', text, source: source === 'voice' ? 'voice' : 'text', status: 'classifying', createdAt: deps.now().toISOString(), decision: null });
  addFromLink(vaultPath, { url, said, source, record: rec }).catch(() => {});
  return rec;
}

// ---------------------------------------------------------------- answers

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// His tap (or his spoken answer) to one open question. `field` may be left
// out: the value is matched against every open question's options.
export async function answer(recordId, field, value) {
  const { getRecord, updateRecord } = await import('./inboxStore.js');
  const rec = await getRecord(recordId);
  if (!rec || rec.kind !== 'wishlist' || !rec.decision?.payload?.pageId) throw Object.assign(new Error('that is not a Wishlist add'), { status: 404 });
  if (rec.status !== 'filed') throw Object.assign(new Error('that add was undone'), { status: 409 });
  const p = rec.decision.payload;
  const open = p.questions || [];
  const v = norm(value);
  const q = field ? open.find((x) => x.field === field) : open.find((x) => x.options.some((o) => norm(o) === v));
  if (!q) throw Object.assign(new Error(field ? `there is no open ${field} question on that item` : `"${value}" does not answer anything Nova asked`), { status: 400 });
  const pick = q.options.find((o) => norm(o) === v);
  if (!pick) throw Object.assign(new Error(`"${value}" is not one of the choices (${q.options.join(', ')})`), { status: 400 });
  const draft = { ...p.draft };
  const props = {};
  if (q.field === 'category') {
    const st = await discover();
    const cat = st.categories.find((c) => c.name === pick);
    if (!cat) throw Object.assign(new Error(`"${pick}" is no longer a category in Notion`), { status: 409 });
    props.Categories = { relation: [{ id: cat.id }] };
    draft.category = pick;
    // a size line from his Sizes section, now that it is clothing or shoes
    if (!/\bsize\b/i.test(draft.notes || '')) {
      const sn = sizeNote(`${draft.base} ${draft.url}`, pick, st.sizes);
      if (sn) { draft.notes = [draft.notes, sn].filter(Boolean).join('. '); props.Notes = { rich_text: rt(draft.notes) }; }
    }
  } else if (q.field === 'colour') {
    draft.variant = pick.toLowerCase();
    draft.name = withStars(displayName(draft), draft.stars);
    props.Name = { title: rt(draft.name) };
  } else if (q.field === 'size') {
    draft.notes = [draft.notes, `Size ${pick}`].filter(Boolean).join('. ');
    props.Notes = { rich_text: rt(draft.notes) };
  }
  await patchPage(p.pageId, { properties: props });
  const left = open.filter((x) => x !== q);
  const answers = [...(p.answers || []), { field: q.field, value: pick, at: deps.now().toISOString() }];
  await updateRecord(recordId, { decision: { ...rec.decision, title: `Added ${draft.name}`, payload: { ...p, draft, questions: left, answers } } });
  kickSync();
  const next = left[0];
  return { field: q.field, value: pick, questions: left, said: `${q.field === 'category' ? `Under ${pick}` : q.field === 'colour' ? `In ${pick.toLowerCase()}` : `Size ${pick}`}.${next ? ` ${next.ask}` : ''}` };
}

// The newest add from the last half hour that still has a question open:
// what a short spoken follow-up answers.
export async function openQuestionRecord({ withinMs = 30 * 60_000 } = {}) {
  const { listRecords } = await import('./inboxStore.js');
  const now = deps.now().getTime();
  const recs = (await listRecords()).filter((r) => r.kind === 'wishlist' && r.status === 'filed' && r.decision?.payload?.questions?.length && now - Date.parse(r.filedAt || r.createdAt) <= withinMs);
  recs.sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
  return recs[0] || null;
}

// ---------------------------------------------------------------- his taps on the page

const STATUS_WORDS = { considering: 'Considering Purchase', month: 'Purchasing This Month', 'this month': 'Purchasing This Month', purchased: 'Purchased', bought: 'Purchased', cancelled: 'Cancelled', canceled: 'Cancelled' };
export const statusName = (s) => (STATUSES.includes(s) ? s : STATUS_WORDS[norm(s)] || null);

async function itemFor(pageId) {
  const { items } = await readItems();
  return items.find((i) => i.id === pageId) || null;
}

export async function setStatus(pageId, status) {
  const name = statusName(status);
  if (!name) throw Object.assign(new Error(`"${status}" is not a Wishlist status`), { status: 400 });
  const item = await itemFor(pageId);
  const prior = item?.status || null;
  await patchPage(pageId, { properties: { Status: { status: { name } } } });
  await patchCache(pageId, { status: name });
  const label = item?.name || 'the item';
  const rec = await fileRecord({ text: `${label}: ${name}`, destination: where(name), undoData: { kind: 'wishlist-status', pageId, prior, name: label } });
  kickSync();
  return { status: name, recordId: rec.id };
}

export async function setStars(pageId, stars) {
  const n = Math.max(0, Math.min(2, Math.floor(Number(stars) || 0)));
  const item = await itemFor(pageId);
  if (!item) throw Object.assign(new Error('that item is not in the Wishlist Nova last read'), { status: 404 });
  const { base } = splitStars(item.rawName || item.name);
  const name = withStars(base, n);
  await patchPage(pageId, { properties: { Name: { title: rt(name) } } });
  await patchCache(pageId, { rawName: name, name: base, stars: n });
  const rec = await fileRecord({ text: n ? `${STAR.repeat(n)} ${base}` : `No star on ${base}`, destination: `Wishlist · ${n ? `${n === 2 ? 'top of ' : ''}most wanted` : 'star taken off'}`, undoData: { kind: 'wishlist-name', pageId, prior: item.rawName || item.name, name: base } });
  kickSync();
  return { stars: n, name, recordId: rec.id };
}

export async function removeItem(pageId) {
  const item = await itemFor(pageId);
  await patchPage(pageId, { archived: true });
  await patchCache(pageId, null);
  const label = item?.name || 'the item';
  const rec = await fileRecord({ text: `Removed ${label}`, destination: 'Wishlist · removed (in Notion’s trash for 30 days)', undoData: { kind: 'wishlist-remove', pageId, name: label } });
  kickSync();
  return { removed: true, recordId: rec.id };
}

// THE UNDO (inbox.js undoFiling dispatches every `wishlist-*` kind here)
export async function undoWishlist(undo) {
  const label = undo.name || 'it';
  if (undo.kind === 'wishlist-add') {
    await patchPage(undo.pageId, { archived: true });
    await patchCache(undo.pageId, null);
    kickSync();
    return `took ${label} off your Wishlist (it is in Notion's trash for 30 days)`;
  }
  if (undo.kind === 'wishlist-remove') {
    await patchPage(undo.pageId, { archived: false });
    kickSync();
    return `put ${label} back on your Wishlist`;
  }
  if (undo.kind === 'wishlist-status') {
    if (!undo.prior) throw new Error('Nova did not know its status before, so it cannot put it back');
    await patchPage(undo.pageId, { properties: { Status: { status: { name: undo.prior } } } });
    await patchCache(undo.pageId, { status: undo.prior });
    kickSync();
    return `${label} is back under ${undo.prior}`;
  }
  if (undo.kind === 'wishlist-name') {
    await patchPage(undo.pageId, { properties: { Name: { title: rt(undo.prior) } } });
    const { stars, base } = splitStars(undo.prior);
    await patchCache(undo.pageId, { rawName: undo.prior, name: base, stars });
    kickSync();
    return `${label} has its name back as it was`;
  }
  throw new Error(`"${undo.kind}" is not a Wishlist undo`);
}

// ---------------------------------------------------------------- reading it all

const firstUrl = (s) => (String(s || '').match(/https?:\/\/\S+/) || [])[0] || null;

// One Notion row into what Nova's page shows. Pure.
export function itemFromPage(page, catNames = {}) {
  const p = page.properties || {};
  const rawName = plain(p.Name?.title).trim();
  const { stars, base } = splitStars(rawName);
  const link = firstUrl(plain(p['Item link']?.rich_text)) || firstUrl(plain(p['Item link (1)']?.rich_text)) || p['Shopping Link']?.url || null;
  const f = (p.Gallery?.files || [])[0] || null;
  const image = f ? (f.type === 'external' ? f.external?.url : f.file?.url) || null : null;
  return {
    id: page.id,
    name: base,
    rawName,
    stars,
    link,
    store: link ? hostOf(link) : null,
    price: typeof p.Price?.number === 'number' ? p.Price.number : null,
    priority: p.Priority?.select?.name || null,
    status: p.Status?.status?.name || 'Considering Purchase',
    categories: (p.Categories?.relation || []).map((r) => catNames[r.id] || null).filter(Boolean),
    imageSource: image,
    imageKey: f ? `${page.id}:${f.name || String(image || '').split('?')[0]}` : null,
    notes: plain(p.Notes?.rich_text).trim() || null,
    addedOn: p['Added On']?.created_time || page.created_time || null,
  };
}

export async function readItems() {
  return readJson(itemsFile(), { items: [], lastSync: null, error: null, errorCode: null, images: {} });
}
async function patchCache(pageId, patch) {
  const cur = await readItems();
  if (patch === null) cur.items = cur.items.filter((i) => i.id !== pageId);
  else cur.items = cur.items.map((i) => (i.id === pageId ? { ...i, ...patch } : i));
  await writeJson(itemsFile(), cur);
}

let running = null;
export function isSyncing() { return !!running; }

// Every item, every page of results; written to items.json. Notion's own
// file links die in about an hour, so each photo is kept on this Mac once
// (by the page and file name, which do not change) and served by Nova.
export function readAll() {
  if (running) return running;
  running = runReadAll().finally(() => { running = null; });
  return running;
}

async function runReadAll() {
  const cur = await readItems();
  try {
    const st = await discover();
    const catNames = Object.fromEntries(st.categories.map((c) => [c.id.replace(/-/g, ''), c.name]).concat(st.categories.map((c) => [c.id, c.name])));
    const c = await api();
    const pages = [];
    let cursor;
    do {
      const r = await c.call('POST', `/data_sources/${ITEMS_DS}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      pages.push(...(r.results || []));
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    const images = { ...(cur.images || {}) };
    const items = pages.filter((pg) => !pg.archived && !pg.in_trash).map((pg) => {
      const it = itemFromPage(pg, catNames);
      const kept = it.imageKey && images[it.imageKey];
      return { ...it, image: kept && existsSync(path.join(dataRoot(), 'stash', 'media', kept)) ? kept : null };
    });
    const out = { items, lastSync: deps.now().toISOString(), error: null, errorCode: null, images };
    await writeJson(itemsFile(), out);
    fillImages(items).catch(() => {});
    return { ok: true, count: items.length };
  } catch (e) {
    await writeJson(itemsFile(), { ...cur, error: e.message, errorCode: e.code || null, lastTriedAt: deps.now().toISOString() });
    return { ok: false, error: e.message, code: e.code || null };
  }
}

// the photos, one at a time through the Stash's polite queue
async function fillImages(items) {
  for (const it of items) {
    if (it.image || !it.imageSource || !it.imageKey) continue;
    const file = await deps.cacheImage(it.imageSource).catch(() => null);
    if (!file) continue;
    const cur = await readItems();
    cur.images = { ...(cur.images || {}), [it.imageKey]: file };
    cur.items = cur.items.map((i) => (i.id === it.id ? { ...i, image: file } : i));
    await writeJson(itemsFile(), cur);
  }
}

// What the page reads: the cached items, when they were read, and the
// honest reason when Notion cannot show them.
export async function wishlistView() {
  const token = await deps.getToken();
  const cur = await readItems();
  const shared = !!token && cur.errorCode !== 'not-shared' && cur.errorCode !== 'rejected';
  const reason = !token ? 'Connect Notion in Settings first' : cur.errorCode === 'not-shared' ? SHARE_HINT : cur.errorCode === 'rejected' ? cur.error : null;
  const st = await readState();
  return {
    // the expiring Notion file link and its key stay on the server
    items: (cur.items || []).map((i) => { const { imageSource: _s, imageKey: _k, ...rest } = i; return rest; }),
    categories: st.categories.map((c) => c.name),
    sizes: st.sizes,
    lastSync: cur.lastSync,
    syncing: isSyncing(),
    shared,
    reason,
    error: shared ? cur.error : null,
  };
}

let kickTimer = null;
export function kickSync(delayMs = 2500) {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => { readAll().catch(() => {}); }, delayMs);
  kickTimer.unref?.();
}
export function startWishlistScheduler() {
  const t = setInterval(() => { readAll().catch(() => {}); }, SYNC_EVERY_MS);
  t.unref?.();
  kickSync(30_000);
}

// tests only
export function _resetForTests() { running = null; clearTimeout(kickTimer); }
