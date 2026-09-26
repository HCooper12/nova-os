// PICK IT UP — the takeaway/ready-meal catalogue store + pure search.
//
// He has N calories and P grams of protein left and is out. This module
// holds the validated catalogue of real Australian items (fast-food chains
// via their published PDFs, supermarket ready-meals via Open Food Facts)
// and the pure search over it. Nothing here ever calls a network or spawns
// a model — that lives in eatOutSources.js. Deterministic first: every row
// that reaches this file's store has already passed validateRow.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createWriteLock } from './vaultStateFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CATALOGUE_DIR = () => path.join(dataRoot(), 'eat-out');
const CATALOGUE_PATH = () => path.join(CATALOGUE_DIR(), 'catalogue.json');

// Chains real for this build but he'll never see in results — said plainly
// rather than silently absent, so a missing brand reads as a decision, not
// a bug.
export const KNOWN_MISSING = [
  { name: "McDonald's", why: 'refuses anonymous fetches of its nutrition data; needs Nova’s browser hand' },
  { name: 'KFC', why: 'same — the site does not answer a plain fetch' },
  { name: "Grill'd", why: 'publishes its nutrition only in a script-rendered page, no PDF' },
  { name: "Hungry Jack's", why: 'only a “what’s new” sheet is published as a PDF, not the full menu' },
];

export function normaliseName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function round1(n) { return Math.round(Number(n) * 10) / 10; }

/**
 * Validate one raw row into a catalogue-safe macro/name shape, or reject it
 * with a plain-English reason. Every rule here exists because real data —
 * model-parsed PDFs and Open Food Facts alike — breaks it.
 */
export function validateRow(raw) {
  const name = String(raw?.name || '').trim();
  if (!name) return { ok: false, reason: 'name is empty' };

  const p = Number(raw?.p);
  const c = Number(raw?.c);
  const f = Number(raw?.f);
  if (!Number.isFinite(p) || p < 0) return { ok: false, reason: 'protein is missing or negative' };
  if (!Number.isFinite(c) || c < 0) return { ok: false, reason: 'carbs is missing or negative' };
  if (!Number.isFinite(f) || f < 0) return { ok: false, reason: 'fat is missing or negative' };

  let kcal = raw?.kcal != null ? Number(raw.kcal) : null;
  const kj = raw?.kj != null ? Number(raw.kj) : null;
  if ((kcal == null || !Number.isFinite(kcal)) && kj != null && Number.isFinite(kj)) {
    kcal = Math.round(kj / 4.184);
  }
  if (!Number.isFinite(kcal) || kcal <= 0) return { ok: false, reason: 'kcal is missing or not positive' };
  if (kcal > 3000) return { ok: false, reason: 'kcal exceeds 3000 — a family bucket, not a meal' };

  if (kj != null && Number.isFinite(kj) && raw?.kcal != null && Number.isFinite(Number(raw.kcal))) {
    const kjAsKcal = kj / 4.184;
    const kjDiff = Math.abs(kjAsKcal - kcal) / kcal;
    if (kjDiff > 0.06) return { ok: false, reason: 'kJ and kcal disagree by more than 6%' };
  }

  const atwater = 4 * p + 4 * c + 9 * f;
  const atwaterDiff = Math.abs(atwater - kcal) / kcal;
  if (atwaterDiff > 0.20) return { ok: false, reason: 'macros and kcal disagree by more than 20% (Atwater check) — likely a per-100g/per-serve mix-up' };

  const grams = raw?.grams != null && Number.isFinite(Number(raw.grams)) ? Number(raw.grams) : null;
  if (grams != null) {
    if (p + c + f > grams) return { ok: false, reason: 'protein + carbs + fat exceed the serve weight in grams' };
    if (kcal > 9 * grams) return { ok: false, reason: 'kcal exceeds 9 kcal per gram of serve weight' };
  }

  const serve = raw?.serve ? String(raw.serve).trim() : (grams != null ? `${grams} g` : '');

  return {
    ok: true,
    item: {
      name,
      serve,
      grams,
      macros: { p: round1(p), c: round1(c), f: round1(f), kcal: Math.round(kcal) },
    },
  };
}

function makeId(brandKey, name) {
  const hash = createHash('sha1').update(normaliseName(name)).digest('hex').slice(0, 10);
  return `${brandKey}:${hash}`;
}

/** Build a full brand record from validated raw rows, deduping by normalised name. */
export function buildBrandRecord({ key, name, kind, source, fetchedAt, rawRows }) {
  const seen = new Set();
  const items = [];
  const rejections = [];
  let rejected = 0;
  for (const raw of rawRows) {
    const result = validateRow(raw);
    if (!result.ok) {
      rejected += 1;
      if (rejections.length < 5) rejections.push(result.reason);
      continue;
    }
    const norm = normaliseName(result.item.name);
    if (seen.has(norm)) continue;
    seen.add(norm);
    items.push({
      id: makeId(key, result.item.name),
      brandKey: key,
      brand: name,
      kind,
      name: result.item.name,
      serve: result.item.serve,
      grams: result.item.grams,
      macros: result.item.macros,
    });
  }
  return { key, name, kind, source, fetchedAt, items, rejected, rejectionReasons: rejections };
}

/* --------------------------------- store ---------------------------------- */

const withLock = createWriteLock();

const emptyCatalogue = () => ({ updatedAt: null, brands: {} });

export async function loadCatalogue() {
  const p = CATALOGUE_PATH();
  if (!existsSync(p)) return emptyCatalogue();
  try {
    const data = JSON.parse(await readFile(p, 'utf8'));
    if (!data || typeof data !== 'object' || !data.brands) return emptyCatalogue();
    return data;
  } catch {
    return emptyCatalogue();
  }
}

async function writeCatalogueFile(cat) {
  await mkdir(CATALOGUE_DIR(), { recursive: true });
  const tmp = CATALOGUE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(cat, null, 2), 'utf8');
  await rename(tmp, CATALOGUE_PATH());
}

/** Merge one brand's fetched record into the catalogue, atomically. */
export function saveBrand(brandKey, brandRecord) {
  return withLock(async () => {
    const cat = await loadCatalogue();
    cat.brands[brandKey] = brandRecord;
    cat.updatedAt = new Date().toISOString();
    await writeCatalogueFile(cat);
    return cat;
  });
}

export function catalogueSummary(cat) {
  const c = cat && typeof cat === 'object' ? cat : emptyCatalogue();
  const brands = Object.values(c.brands || {}).map((b) => ({
    key: b.key,
    name: b.name,
    kind: b.kind,
    count: Array.isArray(b.items) ? b.items.length : 0,
    fetchedAt: b.fetchedAt || null,
    source: b.source || null,
    // a run that failed says so here — the surface shows the brand as stale
    // with the reason rather than quietly showing last time's items
    lastError: b.lastError || null,
    lastTriedAt: b.lastTriedAt || null,
  }));
  const total = brands.reduce((sum, b) => sum + b.count, 0);
  return { updatedAt: c.updatedAt || null, total, brands, missing: KNOWN_MISSING };
}

/* --------------------------------- search ---------------------------------- */

function fits(item, query) {
  const { kcal, c, f, p } = query;
  if (kcal != null && item.macros.kcal > kcal) return false;
  if (c != null && item.macros.c > c) return false;
  if (f != null && item.macros.f > f) return false;
  if (p != null && item.macros.p < 0.8 * p) return false;
  return true;
}

function buildFit(macros, query) {
  const { kcal, p } = query;
  const kcalUse = kcal != null ? macros.kcal / kcal : null;
  const proteinHit = p != null ? macros.p >= p : null;
  const proteinGap = p != null ? Math.round(p - macros.p) : null;
  return { kcalUse, proteinHit, proteinGap, score: 0 };
}

function compareResults(a, b, query) {
  const { p } = query;
  if (p != null) {
    // protein hit first
    if (a.fit.proteinHit !== b.fit.proteinHit) return a.fit.proteinHit ? -1 : 1;
    // then smaller abs(item.p - p)
    const gapA = Math.abs(a.macros.p - p);
    const gapB = Math.abs(b.macros.p - p);
    if (gapA !== gapB) return gapA - gapB;
    // then higher kcalUse (uses the budget well)
    const useA = a.fit.kcalUse ?? -Infinity;
    const useB = b.fit.kcalUse ?? -Infinity;
    if (useA !== useB) return useB - useA;
  } else {
    // p blank: rank by kcal descending within budget
    if (a.macros.kcal !== b.macros.kcal) return b.macros.kcal - a.macros.kcal;
  }
  return a.name.localeCompare(b.name);
}

function sumMacros(items) {
  return items.reduce((acc, it) => ({
    p: +(acc.p + it.macros.p).toFixed(1),
    c: +(acc.c + it.macros.c).toFixed(1),
    f: +(acc.f + it.macros.f).toFixed(1),
    kcal: acc.kcal + it.macros.kcal,
  }), { p: 0, c: 0, f: 0, kcal: 0 });
}

/**
 * Pure search over an already-loaded catalogue. query fields are blank
 * (null/undefined) to be ignored; brands/kind filter which items are
 * considered at all.
 */
export function whatFits(catalogue, query = {}) {
  const q = {
    kcal: query.kcal != null && query.kcal !== '' ? Number(query.kcal) : null,
    p: query.p != null && query.p !== '' ? Number(query.p) : null,
    c: query.c != null && query.c !== '' ? Number(query.c) : null,
    f: query.f != null && query.f !== '' ? Number(query.f) : null,
  };
  const brands = Array.isArray(query.brands) && query.brands.length ? new Set(query.brands) : null;
  const kind = query.kind && query.kind !== 'all' ? query.kind : null;
  const mode = query.mode === 'pairs' ? 'pairs' : 'single';
  const limit = Number.isFinite(Number(query.limit)) && Number(query.limit) > 0 ? Number(query.limit) : 40;

  const cat = catalogue && typeof catalogue === 'object' ? catalogue : emptyCatalogue();
  const allBrands = Object.values(cat.brands || {}).filter((b) => {
    if (brands && !brands.has(b.key)) return false;
    if (kind && b.kind !== kind) return false;
    return true;
  });
  const brandsSearched = allBrands.length;
  const catalogueEmpty = allBrands.every((b) => !b.items || b.items.length === 0) || allBrands.length === 0;

  if (mode === 'single') {
    const results = [];
    for (const b of allBrands) {
      for (const item of b.items || []) {
        if (!fits(item, q)) continue;
        results.push({ ...item, macros: item.macros, name: item.name, fit: buildFit(item.macros, q) });
      }
    }
    results.sort((a, b) => compareResults(a, b, q));
    return {
      budget: q,
      mode,
      items: results.slice(0, limit),
      pairs: [],
      count: results.length,
      catalogueEmpty,
      brandsSearched,
    };
  }

  // pairs mode: two different items from the same brand
  const pairResults = [];
  for (const b of allBrands) {
    const items = (b.items || []).slice();
    // per brand only consider the 60 highest-protein fitting-or-under-budget items
    const candidates = items
      .filter((it) => (q.kcal == null || it.macros.kcal <= q.kcal) && (q.c == null || it.macros.c <= q.c) && (q.f == null || it.macros.f <= q.f))
      .sort((a, c2) => c2.macros.p - a.macros.p)
      .slice(0, 60);
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i];
        const c2 = candidates[j];
        const macros = sumMacros([a, c2]);
        if (!fits({ macros }, q)) continue;
        pairResults.push({ items: [a, c2], macros, name: `${a.name} + ${c2.name}`, fit: buildFit(macros, q) });
      }
    }
  }
  pairResults.sort((a, b) => compareResults(a, b, q));
  return {
    budget: q,
    mode,
    items: [],
    pairs: pairResults.slice(0, limit),
    count: pairResults.length,
    catalogueEmpty,
    brandsSearched,
  };
}
