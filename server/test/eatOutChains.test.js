// McDonald's and KFC (lib/eatOutChains.js) and the fortnightly refresh
// (eatOutSources.js). Temp data dir BEFORE any lib import; the browser and
// the network are always stand-ins, so nothing here opens Chrome or fetches.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-eatout-chains-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { kfcRows, mcdRows, mcdCategoryUrls, KFC_CATALOG_URL } = await import('../lib/eatOutChains.js');
const { startEatOutRefresh, getEatOutRefreshJob, refreshDue, inRefreshWindow, eatOutTick, REFRESH_EVERY_DAYS, SITE_BRANDS } = await import('../lib/eatOutSources.js');
const { loadCatalogue, KNOWN_MISSING } = await import('../lib/eatOut.js');

const waitFor = async (pred, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) { const v = pred(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 10)); }
};

// the shapes are the ones the live endpoints returned on 26 Sep
const kfcItem = (id, name, grams, kj, p, f, c) => ({ id, name, content: { entityId: id, nutritionalInformation: [
  { nutritionComponent: 'Average serving size', nutritionUnit: 'g', serveWiseValue: grams, isActive: true },
  { nutritionComponent: 'Energy', nutritionUnit: 'kj', serveWiseValue: kj, isActive: true },
  { nutritionComponent: 'Protein', nutritionUnit: 'g', serveWiseValue: p, isActive: true },
  { nutritionComponent: 'Fat, total', nutritionUnit: 'g', serveWiseValue: f, isActive: true },
  { nutritionComponent: 'Carbohydrate', nutritionUnit: 'g', serveWiseValue: c, isActive: true },
] } });
const KFC_CATALOG = { id: 'KFCAustraliaMenu-Generic', categories: [{ categories: [
  { products: [{ items: [kfcItem('I-33677', 'Pickle Burger', 200, 2288, 25.3, 29.6, 43.2)] }] },
  // the same item listed in a second category must not be counted twice
  { products: [{ items: [kfcItem('I-33677', 'Pickle Burger', 200, 2288, 25.3, 29.6, 43.2), { id: 'I-1', name: 'No nutrition', content: {} }] }] },
] }] };

const mcdItem = (id, marketing, grams, kj, kcal, p, f, c) => ({ item_id: id, item_marketing_name: marketing, nutrient_facts: { nutrient: [
  { nutrient_name_id: 'primary_serving_size', value: String(grams) },
  { nutrient_name_id: 'energy_kJ', value: String(kj) },
  { nutrient_name_id: 'energy_kcal', value: String(kcal) },
  { nutrient_name_id: 'protein', value: String(p) },
  { nutrient_name_id: 'fat', value: String(f) },
  { nutrient_name_id: 'carbohydrate', value: String(c) },
] } });

test('kfcRows reads per-serve values, dedupes by entity id, and skips entries without nutrition', () => {
  const rows = kfcRows(KFC_CATALOG);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { name: 'Pickle Burger', serve: '200 g', grams: 200, kj: 2288, kcal: null, p: 25.3, c: 43.2, f: 29.6 });
});

test('mcdRows names items from the menu page, falls back to a title-cased marketing name, and needs protein', () => {
  const json = { items: { item: [mcdItem(200398, 'CHEESEBURGER', 119, 1330, 319, 15.3, 14.3, 31.0), mcdItem(200400, 'DOUBLE CHEESEBURGER', 176, 2010, 481, 26.2, 25.9, 34.4), { item_id: 9, item_marketing_name: 'WATER', nutrient_facts: { nutrient: [] } }] } };
  const rows = mcdRows(json, new Map([['200398', 'Cheeseburger']]));
  assert.equal(rows.length, 2, 'an item with no protein figure is not a row');
  assert.deepEqual(rows[0], { name: 'Cheeseburger', serve: '119 g', grams: 119, kj: 1330, kcal: 319, p: 15.3, c: 31, f: 14.3 });
  assert.equal(rows[1].name, 'Double Cheeseburger');
  assert.equal(mcdRows({ items: { item: mcdItem(1, 'SOLO', 100, 1000, 239, 10, 10, 20) } }).length, 1, 'a single item arrives as an object, not a list');
});

test('mcdCategoryUrls keeps food categories and drops drinks, shakes and condiments', () => {
  const urls = mcdCategoryUrls([
    'https://www.mcdonalds.com/au/en-au/menu/burgers.html',
    'https://www.mcdonalds.com/au/en-au/menu/burgers.html#maincontent',
    'https://www.mcdonalds.com/au/en-au/menu/mccafe-drinks.html',
    'https://www.mcdonalds.com/au/en-au/menu/shakes-frappes.html',
    'https://www.mcdonalds.com/au/en-au/menu/condiments.html',
    'https://www.mcdonalds.com/au/en-au/menu/beef/cheeseburger.html',
    'https://www.mcdonalds.com/au/en-au/about-us.html',
  ]);
  assert.deepEqual(urls, ['https://www.mcdonalds.com/au/en-au/menu/burgers.html']);
});

test('McDonald\'s and KFC are sources now, not missing', () => {
  assert.deepEqual(SITE_BRANDS.map((b) => b.key), ['mcdonalds', 'kfc']);
  assert.ok(!KNOWN_MISSING.some((m) => /McDonald|KFC/.test(m.name)));
});

test('a site refresh saves validated rows from both chains with source kind "site"', async () => {
  const fetch = async (url) => {
    assert.equal(url, KFC_CATALOG_URL);
    return { ok: true, json: async () => KFC_CATALOG };
  };
  const mcdFromBrowser = async () => mcdRows({ items: { item: [mcdItem(200398, 'CHEESEBURGER', 119, 1330, 319, 15.3, 14.3, 31.0)] } }, new Map([['200398', 'Cheeseburger']]));
  const id = startEatOutRefresh({ brands: ['mcdonalds', 'kfc'] }, { fetch, mcdFromBrowser });
  const job = await waitFor(() => { const j = getEatOutRefreshJob(id); return j.status !== 'running' ? j : null; });
  assert.equal(job.status, 'ready');
  assert.deepEqual(job.result.perBrand.map((b) => [b.key, b.added, b.error]), [['mcdonalds', 1, null], ['kfc', 1, null]]);
  const cat = await loadCatalogue();
  assert.equal(cat.brands.kfc.source.kind, 'site');
  assert.equal(cat.brands.kfc.items[0].macros.kcal, 547, 'kcal derived from the catalogue kJ');
  assert.equal(cat.brands.mcdonalds.items[0].name, 'Cheeseburger');
});

test('when the known KFC catalogue URL fails, the page is asked for it', async () => {
  let fromPage = 0;
  const id = startEatOutRefresh({ brands: ['kfc'] }, {
    fetch: async () => ({ ok: false, status: 404 }),
    kfcFromPage: async () => { fromPage += 1; return KFC_CATALOG; },
  });
  const job = await waitFor(() => { const j = getEatOutRefreshJob(id); return j.status !== 'running' ? j : null; });
  assert.equal(fromPage, 1);
  assert.equal(job.result.perBrand[0].error, null);
});

test('a chain whose browser run fails keeps its last good record and says why', async () => {
  const id = startEatOutRefresh({ brands: ['mcdonalds'] }, { mcdFromBrowser: async () => { throw new Error('Akamai said no'); } });
  const job = await waitFor(() => { const j = getEatOutRefreshJob(id); return j.status !== 'running' ? j : null; });
  assert.match(job.result.perBrand[0].error, /Akamai said no/);
  const rec = (await loadCatalogue()).brands.mcdonalds;
  assert.equal(rec.items.length, 1, 'the cheeseburger from the last run survived');
  assert.match(rec.lastError, /Akamai/);
});

test('the refresh is due after 14 days, never for a catalogue that was never filled', () => {
  const now = new Date('2026-10-10T03:30:00');
  const days = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
  assert.equal(REFRESH_EVERY_DAYS, 14);
  assert.equal(refreshDue({ updatedAt: days(13) }, now), false);
  assert.equal(refreshDue({ updatedAt: days(14) }, now), true);
  assert.equal(refreshDue({ updatedAt: null }, now), false, 'the first fetch is his deliberate act');
  assert.equal(inRefreshWindow(new Date('2026-10-10T03:00:00')), true);
  assert.equal(inRefreshWindow(new Date('2026-10-10T04:59:00')), true);
  assert.equal(inRefreshWindow(new Date('2026-10-10T05:00:00')), false);
  assert.equal(inRefreshWindow(new Date('2026-10-10T14:00:00')), false);
});

test('the tick starts a refresh only inside the window and only when due', async () => {
  let started = 0;
  const start = () => { started += 1; return 'job-1'; };
  // the catalogue on disk was updated just now by the tests above
  assert.match((await eatOutTick({ now: new Date(), start })).skipped || '', /window|within/);
  const cat = await loadCatalogue();
  const stale = new Date(Date.parse(cat.updatedAt) + 15 * 86_400_000);
  stale.setHours(3, 30, 0, 0);
  assert.deepEqual(await eatOutTick({ now: stale, start }), { started: 'job-1' });
  const afternoon = new Date(stale); afternoon.setHours(14);
  assert.match((await eatOutTick({ now: afternoon, start })).skipped, /window/);
  const fresh = new Date(Date.parse(cat.updatedAt)); fresh.setHours(3, 30, 0, 0);
  if (fresh.getTime() < Date.parse(cat.updatedAt)) fresh.setDate(fresh.getDate() + 1);
  assert.match((await eatOutTick({ now: fresh, start })).skipped, /within 14 days/);
  assert.equal(started, 1);
});
