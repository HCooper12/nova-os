// McDONALD'S AND KFC — THE TWO CHAINS A PLAIN FETCH COULD NOT REACH.
//
// His answer, 26 Sep 2026: "Yes, ensure they're added." Both chains publish
// their own per-serve nutrition as STRUCTURED DATA behind their menu pages,
// so neither needs a model: code reads the chain's own numbers and every row
// still goes through eatOut.js's validateRow like every other source.
//
//   KFC        the ordering catalogue the nutrition page loads (Yum's API).
//              It answers a plain fetch; if the catalogue id ever rotates,
//              the page is opened in Chrome and the new URL is read off it.
//   McDonald's `/dnaapp/itemList`, the endpoint the item pages call. Akamai
//              refuses anything that is not a real browser session, so this
//              runs in headless Chrome: collect the product ids from the menu
//              category pages, then fetch their nutrition from INSIDE the page.
//
// The browser is a THROWAWAY profile, never ~/.nova-browser: nothing here
// needs a sign-in, and his signed-in Nova profile has no business being
// opened by a background refresh. Read-only: navigate and read, nothing else.

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CHROME, browserAvailable } from './browserResearch.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const NAV_TIMEOUT_MS = 60_000;
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/* ---------------------------------- KFC ---------------------------------- */

export const KFC_PAGE = 'https://www.kfc.com.au/nutrition-allergen';
export const KFC_CATALOG_URL = 'https://orderserv-kfc-apac-olo-api.yum.com/dev/v1/catalogs/afd3813afa364270bfd33f0a8d77252d/KFCAustraliaMenu-Generic';
const KFC_CATALOG_RE = /\/catalogs\/[^/]+\/KFCAustraliaMenu[^/?]*/;

/**
 * Every catalogue entry carrying nutrition, as candidate rows. Pure.
 * The catalogue nests categories → products → items, and the same item sits
 * in several categories, so the walk dedupes by the item's entity id.
 */
export function kfcRows(catalog) {
  const seen = new Set();
  const rows = [];
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const c = o.content && typeof o.content === 'object' ? o.content : null;
    if (c && Array.isArray(c.nutritionalInformation) && c.nutritionalInformation.length) {
      const id = c.entityId || o.id;
      const name = String(o.name || o.dname?.[0]?.value || '').trim();
      if (id && name && !seen.has(id)) {
        seen.add(id);
        const v = {};
        for (const n of c.nutritionalInformation) {
          if (n && n.isActive !== false) v[String(n.nutritionComponent || '').toLowerCase()] = num(n.serveWiseValue);
        }
        const grams = v['average serving size'] ?? null;
        rows.push({
          name,
          serve: grams ? `${grams} g` : '',
          grams,
          kj: v.energy ?? null,
          kcal: null, // the catalogue gives kJ; validateRow derives kcal from it
          p: v.protein ?? null,
          c: v.carbohydrate ?? null,
          f: v['fat, total'] ?? null,
        });
      }
    }
    for (const val of Object.values(o)) if (val && typeof val === 'object') walk(val);
  };
  walk(catalog?.categories || catalog);
  return rows;
}

// The catalogue URL carries an id that could change with a menu revision.
// Try the known one; when it fails, open the nutrition page and take the
// catalogue URL (and body) the page itself loads.
async function kfcCatalog(deps) {
  const doFetch = deps.fetch || fetch;
  try {
    const res = await doFetch(KFC_CATALOG_URL, { headers: { 'User-Agent': UA } });
    if (res.ok) return await res.json();
  } catch { /* fall through to the page */ }
  const viaPage = deps.kfcFromPage || kfcCatalogFromPage;
  return viaPage();
}

async function kfcCatalogFromPage() {
  return withThrowawayChrome(async (page) => {
    let body = null;
    page.on('response', async (r) => {
      if (body || !KFC_CATALOG_RE.test(r.url())) return;
      try { body = await r.json(); } catch { /* not the one */ }
    });
    await page.goto(KFC_PAGE, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, 3000));
    if (!body) throw new Error('the KFC nutrition page did not load its menu catalogue');
    return body;
  });
}

export async function kfcRawRows(deps = {}) {
  const rows = kfcRows(await kfcCatalog(deps));
  if (!rows.length) throw new Error('the KFC catalogue carried no nutrition');
  return rows;
}

/* ------------------------------- McDonald's ------------------------------- */

export const MCD_MENU = 'https://www.mcdonalds.com/au/en-au/menu.html';
// drinks and sauces are not a meal he goes out for; everything else is kept
const MCD_SKIP = /condiments|drinks|shakes|frappes/i;
const MCD_BATCH = 20;

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

/** The itemList answer as candidate rows, named from the menu pages. Pure. */
export function mcdRows(json, names = new Map()) {
  const raw = json?.items?.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rows = [];
  for (const it of items) {
    const n = {};
    for (const x of it?.nutrient_facts?.nutrient || []) n[x.nutrient_name_id] = num(x.value);
    const id = String(it?.item_id ?? '');
    const name = String(names.get(id) || titleCase(it?.item_marketing_name || it?.item_name)).trim();
    if (!name || n.protein == null) continue;
    const grams = n.primary_serving_size ?? null;
    rows.push({ name, serve: grams ? `${grams} g` : '', grams, kj: n.energy_kJ ?? null, kcal: n.energy_kcal ?? null, p: n.protein, c: n.carbohydrate ?? null, f: n.fat ?? null });
  }
  return rows;
}

/** Which menu links are food categories worth reading. Pure. */
export function mcdCategoryUrls(hrefs) {
  const out = new Set();
  for (const h of hrefs || []) {
    const u = String(h).split('#')[0];
    if (/\/au\/en-au\/menu\/[^/]+\.html$/.test(u) && !MCD_SKIP.test(u)) out.add(u);
  }
  return [...out];
}

export async function mcdRawRows(deps = {}) {
  const run = deps.mcdFromBrowser || mcdFromBrowser;
  const rows = await run();
  if (!rows.length) throw new Error("McDonald's returned no items with nutrition");
  return rows;
}

async function mcdFromBrowser() {
  return withThrowawayChrome(async (page) => {
    await page.goto(MCD_MENU, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
    const cats = mcdCategoryUrls(await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href)));
    if (!cats.length) throw new Error("the McDonald's menu showed no categories");
    const names = new Map();
    for (const cat of cats) {
      await page.goto(cat, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
      const found = await page.evaluate(() => [...document.querySelectorAll('li[data-product-id]')]
        .map((li) => [li.dataset.productId, (li.querySelector('.cmp-category__item-name')?.textContent || '').trim()]));
      for (const [id, name] of found) if (id && !names.has(id)) names.set(id, name);
      await new Promise((r) => setTimeout(r, 600)); // a person's pace, not a crawler's
    }
    const ids = [...names.keys()];
    const rows = [];
    for (let i = 0; i < ids.length; i += MCD_BATCH) {
      const q = ids.slice(i, i + MCD_BATCH).map((id) => `${id}()`).join('-');
      const json = await page.evaluate(async (items) => {
        const r = await fetch(`/dnaapp/itemList?country=AU&language=en&showLiveData=true&item=${items}&nutrient_req=Y`);
        if (!r.ok) throw new Error(`itemList ${r.status}`);
        return r.json();
      }, q);
      rows.push(...mcdRows(json, names));
      await new Promise((r) => setTimeout(r, 800));
    }
    return rows;
  });
}

/* ------------------------------- the browser ------------------------------ */

async function withThrowawayChrome(fn) {
  if (!browserAvailable()) throw new Error('Chrome is not installed where Nova expects it');
  const puppeteer = (await import('puppeteer-core')).default;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-eatout-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: dir,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1280, height: 1600 });
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
