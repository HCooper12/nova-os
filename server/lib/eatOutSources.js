// PICK IT UP — the two fetchers and the refresh job.
//
// Open Food Facts is code-only: a plain fetch, paced to their limits, rows
// mapped by pure arithmetic. Chain PDFs are the one place a model touches
// this feature at all, and only to PARSE a page it can already read — every
// row it returns still goes through eatOut.js's validateRow before it can
// reach the catalogue. Nothing a model writes reaches disk unmediated.
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope } from './modelSpend.js';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { registerJobMap } from './jobRegistry.js';
import { buildBrandRecord, saveBrand, loadCatalogue } from './eatOut.js';
import { kfcRawRows, mcdRawRows, KFC_PAGE, MCD_MENU } from './eatOutChains.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const PDF_DIR = () => path.join(dataRoot(), 'eat-out', 'pdf');

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const OFF_USER_AGENT = 'NovaOS-Personal/1.0 (single-user personal app)';
const OFF_PACE_MS = 6500; // their limit is 10 searches/min
const OFF_PAGE_SIZE = 100;
const OFF_MAX_PAGES = 6;

export const OFF_BRANDS = [
  { key: 'my-muscle-chef', name: 'My Muscle Chef', tag: 'my-muscle-chef', kind: 'supermarket' },
  { key: 'youfoodz', name: 'Youfoodz', tag: 'youfoodz', kind: 'supermarket' },
  { key: 'lean-cuisine', name: 'Lean Cuisine', tag: 'lean-cuisine', kind: 'supermarket' },
  { key: 'lite-n-easy', name: "Lite n' Easy", tag: 'lite-n-easy', kind: 'supermarket' },
  { key: 'macro', name: 'Woolworths Macro', tag: 'macro', kind: 'supermarket' },
  { key: 'chobani', name: 'Chobani', tag: 'chobani', kind: 'supermarket' },
  { key: 'yopro', name: 'YoPRO', tag: 'yopro', kind: 'supermarket' },
  { key: 'musashi', name: 'Musashi', tag: 'musashi', kind: 'supermarket' },
  { key: 'coles', name: 'Coles', tag: 'coles', kind: 'supermarket', categories: 'en:meals' },
  { key: 'woolworths', name: 'Woolworths', tag: 'woolworths', kind: 'supermarket', categories: 'en:meals' },
];

export const PDF_BRANDS = [
  { key: 'guzman-y-gomez', name: 'Guzman y Gomez', kind: 'fast-food', url: 'https://www.guzmanygomez.com.au/wp-content/uploads/2025/12/251204_NUTRITION_ALLERGEN_GUIDE_420X297MM.pdf' },
  { key: 'subway', name: 'Subway', kind: 'fast-food', url: 'https://www.subway.com/v1v2/assets/en-au/nutrition/documents/aus-nutritional-summary.pdf' },
];

// Chains whose own structured data sits behind their site (eatOutChains.js):
// code reads it, no model, every row through validateRow. His yes, 26 Sep.
export const SITE_BRANDS = [
  { key: 'mcdonalds', name: "McDonald's", kind: 'fast-food', url: MCD_MENU, read: mcdRawRows },
  { key: 'kfc', name: 'KFC', kind: 'fast-food', url: KFC_PAGE, read: kfcRawRows },
];

function offSearchUrl(brand, page) {
  let url = `https://au.openfoodfacts.org/api/v2/search?brands_tags=${encodeURIComponent(brand.tag)}&countries_tags=en:australia&fields=code,product_name,brands,serving_size,nutriments,categories_tags&page_size=${OFF_PAGE_SIZE}&page=${page}`;
  if (brand.categories) url += `&categories_tags=${encodeURIComponent(brand.categories)}`;
  return url;
}

/** Parse a serving_size string like "365 g" or "1 portion (365g)" into grams. */
function parseServingGrams(servingSize) {
  const m = String(servingSize || '').match(/(\d+(?:\.\d+)?)\s*g/i);
  return m ? Number(m[1]) : null;
}

/** Map one Open Food Facts product into a raw row for validateRow, or a
 *  rejection when there's no honest basis to compute a per-serve number. */
export function offRow(product) {
  const n = product?.nutriments || {};
  const perServing = [n.proteins_serving, n.carbohydrates_serving, n.fat_serving].every((v) => v != null)
    && (n['energy-kcal_serving'] != null || n['energy-kj_serving'] != null);
  const name = product?.product_name || '';

  if (perServing) {
    return {
      ok: true,
      raw: {
        name,
        serve: product.serving_size || null,
        p: n.proteins_serving,
        c: n.carbohydrates_serving,
        f: n.fat_serving,
        kcal: n['energy-kcal_serving'] != null ? n['energy-kcal_serving'] : null,
        kj: n['energy-kj_serving'] != null ? n['energy-kj_serving'] : null,
      },
    };
  }

  const grams = parseServingGrams(product?.serving_size);
  const per100Ok = [n.proteins_100g, n.carbohydrates_100g, n.fat_100g].every((v) => v != null)
    && (n['energy-kcal_100g'] != null || n['energy-kj_100g'] != null);
  if (grams && per100Ok) {
    const k = grams / 100;
    return {
      ok: true,
      raw: {
        name,
        serve: product.serving_size || `${grams} g`,
        grams,
        p: n.proteins_100g * k,
        c: n.carbohydrates_100g * k,
        f: n.fat_100g * k,
        kcal: n['energy-kcal_100g'] != null ? n['energy-kcal_100g'] * k : null,
        kj: n['energy-kj_100g'] != null ? n['energy-kj_100g'] * k : null,
      },
    };
  }

  return { ok: false, reason: 'no serving basis' };
}

async function fetchOffPage(brand, page, deps) {
  const doFetch = deps.fetch || fetch;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const attempt = async () => {
    const res = await doFetch(offSearchUrl(brand, page), { headers: { 'User-Agent': OFF_USER_AGENT } });
    if (!res.ok) throw new Error(`OFF search failed: ${res.status}`);
    return res.json();
  };
  // A 503 is what OFF says when it is being asked too often (two refreshes
  // at once did it on 26 Sep). Three tries, backing off 10 s, 30 s, 60 s,
  // before the brand is given up for this run.
  const waits = [10_000, 30_000, 60_000];
  for (let i = 0; ; i += 1) {
    try {
      return await attempt();
    } catch (e) {
      if (i >= waits.length) throw e;
      await sleep(waits[i]);
    }
  }
}

/** Fetch every page for one OFF brand, paced; returns { rawRows, error }. */
async function fetchOffBrand(brand, deps) {
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const rawRows = [];
  try {
    let page = 1;
    let count = Infinity;
    while (page <= OFF_MAX_PAGES && (page - 1) * OFF_PAGE_SIZE < count) {
      if (page > 1) await sleep(OFF_PACE_MS);
      const data = await fetchOffPage(brand, page, deps);
      if (!data || typeof data !== 'object') throw new Error('malformed OFF response');
      count = Number(data.count) || 0;
      const products = Array.isArray(data.products) ? data.products : [];
      for (const product of products) {
        const mapped = offRow(product);
        if (mapped.ok) rawRows.push(mapped.raw);
        // rows with no serving basis are silently skipped, not counted as
        // rejected — they never became a candidate row in the first place
      }
      page += 1;
    }
    return { rawRows, error: null };
  } catch (e) {
    return { rawRows, error: e.message };
  }
}

/* --------------------------------- PDFs ------------------------------------ */

async function downloadPdf(brand, deps) {
  const doFetch = deps.fetch || fetch;
  await mkdir(PDF_DIR(), { recursive: true });
  const dest = path.join(PDF_DIR(), `${brand.key}.pdf`);
  const res = await doFetch(brand.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 4).toString('latin1') !== '%PDF') throw new Error('downloaded file is not a PDF');
  await writeFile(dest, buf);
  return dest;
}

function buildPdfPrompt(brand, pdfPath) {
  return `Read the PDF at ${pdfPath} — all pages; if it is long, use the Read tool's "pages" parameter in ranges of at most 20 pages at a time and cover every page. It is ${brand.name}'s published nutrition/allergen guide.

Output ONLY a JSON object of this shape: { "items": [ { "name", "serve", "grams", "kj", "kcal", "p", "c", "f" } ] } — one row per menu item AS SOLD (a whole burger, a regular bowl, a 6-inch sub), per-serve values NEVER per-100g. Numbers as numbers, null when a column is absent. Include every item on the sheet.${brand.key === 'subway' ? ' Subway note: rows are 6-inch subs unless the sheet says otherwise; include salads and wraps; skip sauces, breads-alone and drinks only if they have no protein column.' : ''} No commentary before or after the JSON.`;
}

/** Spawn the Claude CLI to parse one brand's downloaded PDF into raw rows. */
function runPdfParse(brand, pdfPath, deps) {
  return new Promise((resolve) => {
    const doSpawn = deps.spawn || spawn;
    const lane = 'eat-out-menu';
    const args = [
      '-p', buildPdfPrompt(brand, pdfPath),
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs('Read'),
      '--output-format', 'json',
      '--no-session-persistence',
      '--model', modelFor(lane),
    ];
    const child = doSpawn(CLAUDE_BIN, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ rawRows: [], error: stderr.trim() || `claude exited with code ${code}` });
        return;
      }
      try {
        const outer = parseEnvelope(stdout, { lane });
        const text = (outer.result || '').trim();
        const jsonMatch = firstBalancedObjectMatch(text);
        if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no response received');
        const parsed = parseModelJson(jsonMatch[0]);
        const items = Array.isArray(parsed?.items) ? parsed.items : [];
        // the raw answer stays beside the PDF: a receipt that says "0 added"
        // is worthless unless what the model actually said can be read back
        writeFile(`${pdfPath}.parse.json`, stdout).catch(() => {});
        // NO ROWS IS AN ERROR, NOT A RESULT (26 Sep): the first live run
        // reported Guzman y Gomez as 0 added / 0 rejected / no error, and
        // nothing could say why. An empty sheet does not exist; an empty
        // answer is the model failing, and the receipt has to name it.
        if (!items.length) throw new Error(`the model returned no items: ${(parsed?.problem || text).slice(0, 160)}`);
        resolve({ rawRows: items, error: null });
      } catch (e) {
        resolve({ rawRows: [], error: e.message });
      }
    });
    child.on('error', (err) => {
      resolve({ rawRows: [], error: err.message });
    });
  });
}

async function refreshPdfBrand(brand, deps) {
  let pdfPath;
  try {
    pdfPath = await downloadPdf(brand, deps);
  } catch (e) {
    return { key: brand.key, name: brand.name, added: 0, rejected: 0, error: e.message };
  }
  if (!laneEnabled('eat-out-menu')) {
    return { key: brand.key, name: brand.name, added: 0, rejected: 0, error: laneOffError('eat-out-menu').message };
  }
  const { rawRows, error } = await runPdfParse(brand, pdfPath, deps);
  const record = buildBrandRecord({
    key: brand.key,
    name: brand.name,
    kind: brand.kind,
    source: { kind: 'pdf', url: brand.url },
    fetchedAt: new Date().toISOString(),
    rawRows,
  });
  if (error && !(await loadCatalogue()).brands?.[brand.key]) return { key: brand.key, name: brand.name, added: 0, rejected: 0, error };
  return finishBrand(brand, record, error);
}

async function refreshOffBrand(brand, deps) {
  const { rawRows, error } = await fetchOffBrand(brand, deps);
  const record = buildBrandRecord({
    key: brand.key,
    name: brand.name,
    kind: brand.kind,
    source: { kind: 'off', url: null },
    fetchedAt: new Date().toISOString(),
    rawRows,
  });
  return finishBrand(brand, record, error);
}

async function refreshSiteBrand(brand, deps) {
  let rawRows = [];
  let error = null;
  try {
    rawRows = await brand.read(deps);
  } catch (e) {
    error = e.message;
  }
  const record = buildBrandRecord({
    key: brand.key,
    name: brand.name,
    kind: brand.kind,
    source: { kind: 'site', url: brand.url },
    fetchedAt: new Date().toISOString(),
    rawRows,
  });
  if (error && !(await loadCatalogue()).brands?.[brand.key]) return { key: brand.key, name: brand.name, added: 0, rejected: 0, error };
  return finishBrand(brand, record, error);
}

// A FAILED RUN NEVER REPLACES A GOOD RECORD (26 Sep 2026). The first live
// refresh met a run of 503s and wrote six brands as empty — and the summary
// could not even say they had failed. Now: when a run errors and the record
// it produced is no better than what is on disk, the old items stay and the
// error is written beside them; either way the error rides the record so the
// surface can show it.
async function finishBrand(brand, record, error) {
  const prev = (await loadCatalogue()).brands?.[brand.key] || null;
  if (error && prev && (prev.items || []).length >= record.items.length) {
    await saveBrand(brand.key, { ...prev, lastError: error, lastTriedAt: record.fetchedAt });
    return { key: brand.key, name: brand.name, added: 0, kept: prev.items.length, rejected: 0, error };
  }
  await saveBrand(brand.key, { ...record, lastError: error || null });
  return { key: brand.key, name: brand.name, added: record.items.length, rejected: record.rejected, error: error || null };
}

/* --------------------------------- job -------------------------------------- */

const jobs = new Map();
registerJobMap('eatOut', jobs);

export function getEatOutRefreshJob(id) {
  return jobs.get(id);
}

/**
 * Kick off a refresh across the requested brands (default: all). Runs OFF
 * brands sequentially (paced against their rate limit), then PDF brands
 * sequentially (each one a model spawn). Never throws out of a brand — a
 * failure is recorded per-brand and the job still reaches 'ready'.
 */
export function startEatOutRefresh({ brands } = {}, deps = {}) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const wanted = Array.isArray(brands) && brands.length ? new Set(brands) : null;
  const offList = OFF_BRANDS.filter((b) => !wanted || wanted.has(b.key));
  const pdfList = PDF_BRANDS.filter((b) => !wanted || wanted.has(b.key));
  const siteList = SITE_BRANDS.filter((b) => !wanted || wanted.has(b.key));

  (async () => {
    const perBrand = [];
    for (const brand of offList) {
      try {
        perBrand.push(await refreshOffBrand(brand, deps));
      } catch (e) {
        perBrand.push({ key: brand.key, name: brand.name, added: 0, rejected: 0, error: e.message });
      }
    }
    for (const brand of pdfList) {
      try {
        perBrand.push(await refreshPdfBrand(brand, deps));
      } catch (e) {
        perBrand.push({ key: brand.key, name: brand.name, added: 0, rejected: 0, error: e.message });
      }
    }
    for (const brand of siteList) {
      try {
        perBrand.push(await refreshSiteBrand(brand, deps));
      } catch (e) {
        perBrand.push({ key: brand.key, name: brand.name, added: 0, rejected: 0, error: e.message });
      }
    }
    job.status = 'ready';
    job.result = { perBrand, updatedAt: new Date().toISOString() };
  })().catch((e) => {
    job.status = 'error';
    job.error = e.message;
  });

  return jobId;
}

/* ------------------------- the fortnightly refresh ------------------------- */

// His answer, 26 Sep 2026: "Maybe a refresh every two weeks? I can't see
// myself using this feature too often but it's more good to have just in
// case." So: the whole catalogue, every 14 days, in the small hours.
//
// No new state file: the catalogue already stamps when it was last updated.
// It is due when that stamp is 14+ days old; a catalogue never filled is NOT
// filled by the schedule (the first fetch is a deliberate act, and it costs a
// model read per PDF chain). The window is 3–5am local so Chrome and the PDF
// reads never compete with him, and a refresh already running is left alone.
export const REFRESH_EVERY_DAYS = 14;

export function refreshDue(catalogue, now = new Date()) {
  const at = catalogue?.updatedAt ? Date.parse(catalogue.updatedAt) : NaN;
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at >= REFRESH_EVERY_DAYS * 86_400_000;
}

export function inRefreshWindow(now = new Date()) {
  const h = now.getHours();
  return h >= 3 && h < 5;
}

const anyRunning = () => [...jobs.values()].some((j) => j.status === 'running');

export async function eatOutTick({ now = new Date(), start = startEatOutRefresh } = {}) {
  if (!inRefreshWindow(now)) return { skipped: 'outside the 3–5am window' };
  if (anyRunning()) return { skipped: 'a refresh is already running' };
  if (!refreshDue(await loadCatalogue(), now)) return { skipped: `refreshed within ${REFRESH_EVERY_DAYS} days` };
  return { started: start({}) };
}

export function startEatOutScheduler() {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('eat-out');
    try {
      const r = await eatOutTick();
      if (r.started) console.log(`eat-out: fortnightly catalogue refresh started (${r.started})`);
    } catch (e) { console.error('eat-out refresh tick failed:', e.message); }
  };
  // not at boot: a restart at 3:10am must not open Chrome in the same breath
  setTimeout(tick, 10 * 60_000).unref?.();
  setInterval(tick, 30 * 60_000).unref?.();
}
