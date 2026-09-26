// PICK IT UP — Open Food Facts + chain PDF sources, and the refresh job.
// Temp data dir BEFORE any lib import. Never calls the network or spawns a
// real process — fetch/spawn are injected through deps.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-eatoutsrc-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { offRow, OFF_BRANDS, PDF_BRANDS, startEatOutRefresh, getEatOutRefreshJob } = await import('../lib/eatOutSources.js');
const { loadCatalogue } = await import('../lib/eatOut.js');
const { setLanePref, resetLanePref } = await import('../lib/modelPrefs.js');

const waitFor = async (pred, ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 5));
  }
  throw new Error('timed out waiting');
};

/* -------------------------------- offRow ------------------------------------ */

test('offRow: maps a product with full per-serving nutrients', () => {
  const result = offRow({
    product_name: 'High Protein Meal',
    serving_size: '1 portion (365g)',
    nutriments: { proteins_serving: 35, carbohydrates_serving: 40, fat_serving: 10, 'energy-kcal_serving': 400 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.raw.p, 35);
  assert.equal(result.raw.kcal, 400);
});

test('offRow: scales per-100g values when serving_size parses to grams', () => {
  const result = offRow({
    product_name: 'Scaled Meal',
    serving_size: '200 g',
    nutriments: { proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5, 'energy-kcal_100g': 200 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.raw.p, 20); // 10 * 2
  assert.equal(result.raw.kcal, 400); // 200 * 2
});

test('offRow: no serving basis is skipped, not thrown', () => {
  const result = offRow({ product_name: 'No Basis', serving_size: null, nutriments: {} });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no serving basis');
});

/* ------------------------------ OFF refresh path ----------------------------- */

test('OFF refresh: paces between pages, counts added/rejected, skips no-serving-basis rows', async () => {
  let fetchCalls = 0;
  const sleeps = [];
  const brandKey = OFF_BRANDS[0].key;

  const fakeFetch = async () => {
    fetchCalls += 1;
    const page = fetchCalls;
    // count exceeds one page (100) so a second page is genuinely fetched —
    // that's what the paced sleep between pages is for.
    if (page === 1) {
      return {
        ok: true,
        json: async () => ({
          count: 150,
          products: [
            { product_name: 'Good Meal', serving_size: '300g', nutriments: { proteins_serving: 30, carbohydrates_serving: 40, fat_serving: 10, 'energy-kcal_serving': 400 } },
            { product_name: 'Garbage Meal', serving_size: '300g', nutriments: { proteins_serving: 200, carbohydrates_serving: 0, fat_serving: 0, 'energy-kcal_serving': 100 } },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        count: 150,
        products: [
          { product_name: 'No Basis Meal', serving_size: null, nutriments: {} },
        ],
      }),
    };
  };
  const fakeSleep = async (ms) => { sleeps.push(ms); };

  const jobId = startEatOutRefresh({ brands: [brandKey] }, { fetch: fakeFetch, sleep: fakeSleep });
  const job = await waitFor(() => {
    const j = getEatOutRefreshJob(jobId);
    return j.status !== 'running' ? j : null;
  });

  assert.equal(job.status, 'ready');
  const entry = job.result.perBrand.find((b) => b.key === brandKey);
  assert.ok(entry, 'brand result present');
  assert.equal(entry.added, 1);
  assert.equal(entry.rejected, 1);
  assert.ok(sleeps.length >= 1, 'paced sleep called between pages');

  const cat = await loadCatalogue();
  assert.equal(cat.brands[brandKey].items.length, 1);
  assert.equal(cat.brands[brandKey].items[0].name, 'Good Meal');
});

test('OFF refresh: a brand whose fetch throws records error and job still reaches ready', async () => {
  const brandKey = OFF_BRANDS[1].key;
  const fakeFetch = async () => { throw new Error('network down'); };
  const fakeSleep = async () => {};

  const jobId = startEatOutRefresh({ brands: [brandKey] }, { fetch: fakeFetch, sleep: fakeSleep });
  const job = await waitFor(() => {
    const j = getEatOutRefreshJob(jobId);
    return j.status !== 'running' ? j : null;
  });

  assert.equal(job.status, 'ready');
  const entry = job.result.perBrand.find((b) => b.key === brandKey);
  assert.ok(entry.error, 'error recorded on the brand');
});

/* ------------------------------ PDF refresh path ----------------------------- */

function fakePdfSpawnEnvelope(text) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      const envelope = JSON.stringify({ is_error: false, result: text });
      child.stdout.emit('data', Buffer.from(envelope));
      child.emit('close', 0);
    });
    return child;
  };
}

test('PDF refresh: validated rows saved, one bad row rejected with a reason', async () => {
  await resetLanePref('eat-out-menu');
  const brand = PDF_BRANDS[0];
  const fakeFetch = async () => ({
    ok: true,
    arrayBuffer: async () => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10)]),
  });
  const items = [
    { name: 'Good Burrito', serve: '1 portion (365 g)', grams: 365, kj: 2100, kcal: 500, p: 40, c: 50, f: 15 },
    { name: 'Bad Row', serve: 'regular', grams: 300, kj: null, kcal: 100, p: 200, c: 0, f: 0 },
  ];
  const fakeSpawn = fakePdfSpawnEnvelope(JSON.stringify({ items }));

  const jobId = startEatOutRefresh({ brands: [brand.key] }, { fetch: fakeFetch, spawn: fakeSpawn });
  const job = await waitFor(() => {
    const j = getEatOutRefreshJob(jobId);
    return j.status !== 'running' ? j : null;
  });

  assert.equal(job.status, 'ready');
  const entry = job.result.perBrand.find((b) => b.key === brand.key);
  assert.equal(entry.added, 1);
  assert.equal(entry.rejected, 1);
  assert.equal(entry.error, null);

  const cat = await loadCatalogue();
  assert.equal(cat.brands[brand.key].items.length, 1);
  assert.equal(cat.brands[brand.key].items[0].name, 'Good Burrito');
  assert.ok(cat.brands[brand.key].rejectionReasons.length >= 1);
});

test('PDF refresh: lane off records the off-error and does not spawn', async () => {
  await setLanePref('eat-out-menu', { enabled: false });
  const brand = PDF_BRANDS[1];
  const fakeFetch = async () => ({
    ok: true,
    arrayBuffer: async () => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10)]),
  });
  let spawned = false;
  const fakeSpawn = () => { spawned = true; return fakePdfSpawnEnvelope(JSON.stringify({ items: [] }))(); };

  const jobId = startEatOutRefresh({ brands: [brand.key] }, { fetch: fakeFetch, spawn: fakeSpawn });
  const job = await waitFor(() => {
    const j = getEatOutRefreshJob(jobId);
    return j.status !== 'running' ? j : null;
  });

  assert.equal(job.status, 'ready');
  const entry = job.result.perBrand.find((b) => b.key === brand.key);
  assert.ok(entry.error, 'off-lane error recorded');
  assert.equal(spawned, false, 'the CLI must never spawn while the lane is off');
  await resetLanePref('eat-out-menu');
});

test('PDF refresh: a bad PDF download (no %PDF header) records error, no throw', async () => {
  await resetLanePref('eat-out-menu');
  const brand = PDF_BRANDS[0];
  const fakeFetch = async () => ({ ok: true, arrayBuffer: async () => Buffer.from('not a pdf') });
  const jobId = startEatOutRefresh({ brands: [brand.key] }, { fetch: fakeFetch, spawn: () => { throw new Error('should not spawn'); } });
  const job = await waitFor(() => {
    const j = getEatOutRefreshJob(jobId);
    return j.status !== 'running' ? j : null;
  });
  assert.equal(job.status, 'ready');
  const entry = job.result.perBrand.find((b) => b.key === brand.key);
  assert.ok(entry.error);
});
