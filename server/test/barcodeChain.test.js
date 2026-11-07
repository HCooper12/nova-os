// A barcode is only believed if its check digit agrees; then Open Food Facts,
// then USDA Branded by GTIN; a miss from both is an honest miss.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-barcode-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateBarcode, lookupBarcode } = await import('../lib/barcodeLookup.js');
const { applyBarcodeToScan, normalizeResult } = await import('../lib/scanFood.js');

test('check digit: real GTINs pass, a single wrong digit fails', () => {
  assert.equal(validateBarcode('9300633603106').ok, true); // EAN-13
  assert.equal(validateBarcode('036000291452').ok, true); // UPC-A
  assert.equal(validateBarcode('96385074').ok, true); // EAN-8
  assert.equal(validateBarcode('9300633603105').ok, false, 'last digit off');
  assert.equal(validateBarcode('9300633603206').ok, false, 'a middle digit off');
  assert.equal(validateBarcode('036000291453').ok, false);
});

test('length and characters are policed', () => {
  assert.equal(validateBarcode('1234567').ok, false);
  assert.equal(validateBarcode('123456789012345').ok, false);
  assert.equal(validateBarcode('93006336abc05').ok, false);
  assert.equal(validateBarcode('').ok, false);
  assert.equal(validateBarcode(null).ok, false);
});

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const offHit = { status: 1, product: { product_name: 'Choc Milk', serving_size: '250 ml', nutriments: { proteins_serving: 9, carbohydrates_serving: 24, fat_serving: 5, 'energy-kcal_serving': 180, fiber_serving: 0.5, sodium_serving: 0.12 } } };
const usdaHit = { foods: [
  { fdcId: 555, gtinUpc: '009300633603106', description: 'PROTEIN YOGHURT', brandName: 'Acme', servingSize: 200, servingSizeUnit: 'g', foodNutrients: [
    { nutrientName: 'Protein', value: 10 }, { nutrientName: 'Total lipid (fat)', value: 2 }, { nutrientName: 'Carbohydrate, by difference', value: 5 },
    { nutrientName: 'Energy', unitName: 'KCAL', value: 78 }, { nutrientName: 'Sodium, Na', value: 40 },
  ] },
  { fdcId: 1, gtinUpc: '000000000000', description: 'Some other thing', foodNutrients: [] },
] };

test('Open Food Facts answers first, with extras and the barcode', async () => {
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return res(200, offHit); };
  const r = await lookupBarcode('9300633603106', { fetchFn });
  assert.match(r.name, /Choc Milk \(per serving, 250 ml\)/);
  assert.equal(r.source, 'Open Food Facts');
  assert.equal(r.sodiumMg, 120);
  assert.equal(r.barcode, '9300633603106');
  assert.equal(calls.length, 1, 'USDA is not asked when OFF has it');
});

test('an OFF miss falls through to USDA Branded, matched on the GTIN not on free text', async () => {
  const fetchFn = async (url) => (String(url).includes('openfoodfacts') ? res(200, { status: 0 }) : res(200, usdaHit));
  const r = await lookupBarcode('9300633603106', { fetchFn, apiKey: 'k' });
  assert.equal(r.source, 'USDA FoodData Central (Branded)');
  assert.equal(r.fdcId, 555);
  assert.match(r.name, /Acme Protein Yoghurt \(per serving, 200 g\)/);
  assert.deepEqual(r.macros, { p: 20, c: 10, f: 4, kcal: 156 }, 'per-100g scaled to the 200 g serving by code');
  assert.equal(r.sodiumMg, 80);
});

test('USDA returning only other products is a miss', async () => {
  const fetchFn = async (url) => (String(url).includes('openfoodfacts') ? res(404, {}) : res(200, { foods: [usdaHit.foods[1]] }));
  assert.equal(await lookupBarcode('9300633603106', { fetchFn, apiKey: 'k' }), null);
});

test('a source that errored is an error, not "no such product"; the other still gets its chance', async () => {
  const offDown = async (url) => (String(url).includes('openfoodfacts') ? res(503, {}) : res(200, usdaHit));
  assert.equal((await lookupBarcode('9300633603106', { fetchFn: offDown, apiKey: 'k' })).fdcId, 555);
  const bothDown = async () => res(503, {});
  await assert.rejects(() => lookupBarcode('9300633603106', { fetchFn: bothDown, apiKey: 'k' }));
});

test('an invalid code never reaches the network', async () => {
  const fetchFn = async () => { throw new Error('must not fetch'); };
  await assert.rejects(() => lookupBarcode('9300633603105', { fetchFn }), /check digit/);
});

const base = () => normalizeResult({ name: 'Yoghurt', macros: { p: 1, c: 1, f: 1, kcal: 17 }, components: [], confidence: 'low', question: 'how much?' });

test('photo: a misread barcode is NOT looked up and the reply says so', async () => {
  const r = await applyBarcodeToScan(base(), { read: '9300633603105', lookupFn: async () => { throw new Error('must not look up'); } });
  assert.match(r.barcodeNote, /did not look it up/);
  assert.equal(r.name, 'Yoghurt');
  assert.equal(r.barcode, undefined);
});

test('photo: a verified code names the product and replaces the guess for a single pack', async () => {
  const r = await applyBarcodeToScan(base(), { read: '9300633603106', lookupFn: async (c) => ({ name: 'Acme Yoghurt (per serving, 200 g)', macros: { p: 20, c: 10, f: 4, kcal: 156 }, source: 'Open Food Facts', barcode: c }) });
  assert.equal(r.name, 'Acme Yoghurt (per serving, 200 g)');
  assert.equal(r.macros.kcal, 156);
  assert.equal(r.barcode, '9300633603106');
  assert.match(r.sourceNote, /Check it against the pack/);
  assert.equal(r.question, '');
});

test('photo: a barcode beside a plate is named but does not join the plate', async () => {
  const plate = { ...base(), components: [{ name: 'a', macros: { p: 1, c: 1, f: 1, kcal: 17 } }, { name: 'b', macros: { p: 1, c: 1, f: 1, kcal: 17 } }], name: 'Plate' };
  const r = await applyBarcodeToScan(plate, { read: '9300633603106', lookupFn: async () => ({ name: 'Acme Yoghurt', macros: { p: 20, c: 10, f: 4, kcal: 156 }, source: 'Open Food Facts' }) });
  assert.equal(r.name, 'Plate');
  assert.match(r.barcodeNote, /left it out/);
});

test('photo: a valid code no database knows keeps the photo numbers and says so', async () => {
  const r = await applyBarcodeToScan(base(), { read: '9300633603106', lookupFn: async () => null });
  assert.equal(r.name, 'Yoghurt');
  assert.match(r.barcodeNote, /no product database/);
});

test('photo: no barcode read means the result is untouched', async () => {
  const b = base();
  assert.equal(await applyBarcodeToScan(b, { read: '' }), b);
});
