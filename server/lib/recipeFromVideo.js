// A RECIPE REEL BECOMES A RECIPE (29 Sep 2026).
//
// His report: "I just filed two recipes from instagram reels into the
// capture for analysis and asked it to be added to my recipes, but they don't
// seem to have happened yet. I've done this previously with others too... I
// presumed it would also read the caption of the reels and turn that into
// recipes in my vault to use."
//
// Every one of them — "Add to my recipes", "Add these recipes to my fuel" —
// was routed by the link alone to the Watcher, which writes a Source note and
// never reads the caption. The words were ignored, and on Instagram the
// recipe lives in the CAPTION: ingredients in grams, the method, often the
// creator's own macros per serving.
//
// So a video link with recipe words takes this lane:
//   code   fetches the caption (yt-dlp), and the transcript only when the
//          caption holds no recipe;
//   model  reads them into structured recipes (a language judgement);
//   code   decides the macros: the creator's stated per-serving figures when
//          they add up (Atwater within 20 %), otherwise computed from the
//          ingredient weights (nutritionFacts), otherwise NONE — Nova never
//          guesses macros into his collection. Since 29 Sep a recipe with no
//          macros is still filed, as a recipe with its macros NOT SET (his
//          words: "added as a recipe only so I can fill in macros when I
//          decide to cook/bake it"); recipes.js writes the pending line and
//          every reader shows "not set" until he enters them;
//   rails  each recipe is a `recipe` card (the voice path's exact shape, whose
//          apply is addRecipe and whose undo removes it), applied at once.
//          EVERY RECIPE LINK GOES STRAIGHT IN (his call, 3 Oct 2026: "Every
//          recipe link should go straight in"): with or without recipe words,
//          a recipe read from a link is added now, with its Undo on the card.
//          Until then only words like "add" applied it and a bare link waited
//          for his yes.
//
// THE RECIPE PAGE (29 Sep, his Osta reel: "share a recipe reel to it → a clean
// recipe page with a photo, prep/cook time and servings"). The card now also
// carries servings, prep/cook minutes (only when the video states them), the
// reel as its Source, and the reel's thumbnail as `photoUrl`; the `recipe`
// route in inbox.js saves that photo once the recipe is in the file, and a
// failed photo never fails the recipe. A reel of a recipe he ALREADY has
// fills in only what that recipe is missing (photo, servings, times, source)
// and never touches a value he has, its macros or its ingredients.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord } from './inboxStore.js';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope } from './modelSpend.js';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { kcalFrom } from './nutritionFacts.js';
import { shortSourceLabel } from '../../src/recipeScale.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const SPAWN_PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].filter(Boolean).join(':');
const LANE = 'recipe-video';

export { RECIPE_WORDS_RE } from './intentRouter.js';

/* ------------------------------ the caption ------------------------------ */

function run(cmd, args, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: SPAWN_PATH } });
    let out = '';
    let err = '';
    const t = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error((err.trim().split('\n').pop() || `exited ${code}`).slice(0, 300))); });
  });
}

/** { title, uploader, caption, thumbnail, duration } for a video URL. */
export async function fetchCaption(url, { timeoutMs = 90_000 } = {}) {
  const out = await run('yt-dlp', ['--skip-download', '--no-warnings', '--no-playlist', '-J', url], { timeoutMs });
  const j = JSON.parse(out);
  return {
    title: String(j.title || ''),
    uploader: String(j.uploader || j.channel || ''),
    caption: String(j.description || ''),
    thumbnail: /^https?:\/\//.test(String(j.thumbnail || '')) ? String(j.thumbnail) : null,
    duration: Number.isFinite(Number(j.duration)) ? Number(j.duration) : null,
  };
}

/* ------------------------------- the photo -------------------------------- */

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = /^image\/(jpeg|jpg|png|webp|gif)$/;   // what recipePhotos can store
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

/** A thumbnail URL → an image data URL (≤ 4 MB, an image type recipePhotos stores). */
export async function fetchImageDataUrl(url, { timeoutMs = 15_000 } = {}) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('not an image link');
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`the thumbnail answered ${res.status}`);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!PHOTO_TYPES.test(type)) throw new Error(`the thumbnail is not a usable image (${type || 'no type'})`);
  if (Number(res.headers.get('content-length')) > MAX_PHOTO_BYTES) throw new Error('the thumbnail is over 4 MB');
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_PHOTO_BYTES) throw new Error('the thumbnail is empty or over 4 MB');
  return `data:${type};base64,${buf.toString('base64')}`;
}

let imageFetcher = fetchImageDataUrl;
/** Tests only: the thumbnail download the inbox `recipe` route uses (never the network in a test). */
export function _setImageFetchForTests(fn) { imageFetcher = fn || fetchImageDataUrl; }

/**
 * Download a thumbnail and save it as a recipe's photo. Never throws: a photo
 * is a nicety and a failed one must never fail the recipe. Returns the saved
 * photo's fingerprint (for an exact undo), or null.
 */
export async function saveRecipePhotoFromUrl(vaultPath, recipeId, url, deps = {}) {
  if (!url || !recipeId) return null;
  try {
    const dataUrl = await (deps.fetchImage || imageFetcher)(url);
    const photos = await import('./recipePhotos.js');
    await (deps.savePhoto || photos.savePhoto)(vaultPath, recipeId, dataUrl);
    const b64 = String(dataUrl).split(',')[1] || '';
    return photos.photoHash(Buffer.from(b64, 'base64'));
  } catch (e) {
    console.error(`recipe photo for ${recipeId} not saved: ${e.message}`);
    return null;
  }
}

/** Does this text look like it carries a recipe (quantities, an ingredient list)? Pure. */
export function captionHasRecipe(text) {
  const s = String(text || '');
  const quantities = (s.match(/\b\d+(?:\.\d+)?\s?(?:g|kg|ml|l|tbsp|tsp|cups?|oz|scoops?)\b/gi) || []).length;
  return quantities >= 3 || /\bingredients?\b/i.test(s);
}

/* ------------------------------- the model ------------------------------- */

// `medium: 'page'` (1 Oct, recipeFromPage.js): the same read over a recipe
// WEB PAGE's text — its schema.org Recipe block, or its readable words.
export function buildRecipePrompt({ title, uploader, caption, transcript, prose, medium }) {
  const page = medium === 'page';
  return `Read the recipe(s) out of this ${page ? "web page's text" : `video's caption${transcript ? ' and transcript' : ''}`} for Hayden's recipe collection.${prose ? ` He said: "${prose}".` : ''}

${page ? 'Page' : 'Video'}: ${title || '(untitled)'} by ${uploader || 'unknown'}
${page ? 'PAGE' : 'CAPTION'}:
${caption || (page ? '(no readable text)' : '(no caption)')}
${transcript ? `\nTRANSCRIPT:\n${transcript.slice(0, 20_000)}\n` : ''}
Output ONLY a JSON object:
{"recipes":[{"name":"short natural name","servings":<number of portions the whole recipe makes>,"makes":"e.g. 6 jars","prepMin":<minutes or null>,"cookMin":<minutes or null>,"ingredients":[{"text":"240 g oats","name":"rolled oats","grams":240}],"method":["step one","step two"],"statedPerServing":{"kcal":471,"p":48,"c":44,"f":11},"category":"TREATS for desserts, sweets and snacks | ROTATION / SWAP MEALS for meals"}],"notFound":""}
Rules:
- Only what the ${page ? 'page' : 'video'} actually says. Never invent an ingredient, amount or macro.
- "grams": the weight in grams when the amount is a weight, or a volume of a water-like liquid (ml ≈ g); null otherwise.
- "statedPerServing": the creator's own per-serving numbers ONLY if the caption or transcript states them; null otherwise. If they are stated for the whole batch, divide by servings.
- "prepMin" / "cookMin": whole minutes ONLY when the caption or transcript states a prep or cook time, or one plain cooking duration ("bake for 25 minutes" → cookMin 25); null otherwise. Never estimate a time.
- Several distinct recipes → several entries. A menu with no amounts is not a recipe.
- No recipe at all → {"recipes":[],"notFound":"<one short reason>"}.`;
}

async function askModel(prompt, deps) {
  if (deps.ask) return deps.ask(prompt);
  const stdout = await run(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    ...boundaryArgs(''),
    '--output-format', 'json',
    '--model', modelFor(LANE),
    '--no-session-persistence',
  ], { timeoutMs: 180_000 });
  const outer = parseEnvelope(stdout, { lane: LANE });
  const m = firstBalancedObjectMatch(String(outer.result || '').trim());
  if (!m) throw new Error('the recipe read came back empty');
  return parseModelJson(m[0]);
}

/* ------------------------------ code decides ------------------------------ */

const r1 = (n) => Math.round(Number(n) * 10) / 10;
// HIS COLLECTION'S OWN SECTIONS (recipes.js CATEGORY_TABLE_HEADING): the
// first live run picked "DESSERTS", which his file does not have, and both
// good recipes bounced at the write. A dessert or a snack is a Treat.
const CATEGORIES = ['CORE DAILY MEALS', 'ROTATION / SWAP MEALS', 'TREATS'];
const CATEGORY_ALIAS = { DESSERT: 'TREATS', DESSERTS: 'TREATS', SNACK: 'TREATS', SNACKS: 'TREATS', TREAT: 'TREATS', SWEET: 'TREATS', BAKING: 'TREATS',
  BREAKFAST: 'ROTATION / SWAP MEALS', LUNCH: 'ROTATION / SWAP MEALS', DINNER: 'ROTATION / SWAP MEALS', MEAL: 'ROTATION / SWAP MEALS', CORE: 'CORE DAILY MEALS' };
export function categoryFor(raw) {
  const k = String(raw || '').trim().toUpperCase();
  return CATEGORIES.includes(k) ? k : CATEGORY_ALIAS[k] || 'ROTATION / SWAP MEALS';
}

/**
 * The macros a recipe is filed with, and where they came from. Pure except for
 * the injected `compute` (nutritionFacts.computeFromComponents).
 */
export async function macrosFor(recipe, { compute } = {}) {
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const s = recipe.statedPerServing;
  if (s && [s.p, s.c, s.f].every((v) => Number.isFinite(Number(v)) && Number(v) >= 0)) {
    const p = Number(s.p), c = Number(s.c), f = Number(s.f);
    const atwater = kcalFrom({ p, c, f });
    const kcal = Number.isFinite(Number(s.kcal)) && Number(s.kcal) > 0 ? Math.round(Number(s.kcal)) : atwater;
    if (kcal > 0 && Math.abs(atwater - kcal) / kcal <= 0.2) {
      return { macros: { p: r1(p), c: r1(c), f: r1(f), kcal }, source: 'the creator’s own numbers, per serving' };
    }
  }
  const withGrams = (recipe.ingredients || []).filter((i) => Number(i.grams) > 0 && i.name);
  if (compute && withGrams.length && withGrams.length >= Math.ceil((recipe.ingredients || []).length * 0.6)) {
    const out = await compute(withGrams.map((i) => ({ name: i.name, grams: Number(i.grams) })));
    const m = out?.macros;
    if (m && m.kcal > 0) {
      return {
        macros: { p: r1(m.p / servings), c: r1(m.c / servings), f: r1(m.f / servings), kcal: Math.round(m.kcal / servings) },
        source: `computed from the ingredient weights${out.unsourced ? ' (some lines estimated)' : ''}, ÷ ${servings}`,
      };
    }
  }
  return null;
}

/**
 * A model recipe into the `recipe` card payload, or { skip: reason }. With no
 * trustworthy macros the payload carries `macros: null` — filed with its
 * macros not set, never a guess. Only a recipe with no ingredients is skipped.
 */
const intIn = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return v != null && v !== '' && Number.isFinite(Number(v)) && n >= lo && n <= hi ? n : null;
};

export async function toRecipePayload(recipe, { url, uploader, thumbnail, compute } = {}) {
  const name = String(recipe?.name || '').trim().slice(0, 80);
  if (!name) return { skip: 'a recipe with no name' };
  const ingredients = (recipe.ingredients || []).map((i) => String(i?.text || [i?.grams ? `${i.grams} g` : '', i?.name].filter(Boolean).join(' ')).trim()).filter(Boolean).slice(0, 40);
  if (!ingredients.length) return { skip: `${name}: no ingredients in the video` };
  const got = await macrosFor(recipe, { compute });
  const method = (recipe.method || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
  const category = categoryFor(recipe.category);
  const servings = intIn(recipe.servings, 1, 99);
  return {
    payload: {
      name, category, macros: got ? got.macros : null, ingredients, method,
      makes: recipe.makes ? String(recipe.makes).slice(0, 60) : (servings ? `${servings} servings` : null),
      servings,
      prepMin: intIn(recipe.prepMin, 0, 1440),
      cookMin: intIn(recipe.cookMin, 0, 1440),
      // the reel itself — written as the recipe's **Source:** line
      source: /^https?:\/\//.test(String(url || '')) ? { url: String(url).slice(0, 500), label: uploader ? shortSourceLabel(uploader, 60) || null : null } : null,
      photoUrl: thumbnail || null,
      description: (got
        ? `Macros: ${got.source}.`
        : 'Macros not set: the reel gives none and too few weights to work them out. Add them when you make it (Edit this meal, or read them off the labels).').slice(0, 300),
    },
  };
}

// A reel of a recipe he already has: what that recipe is MISSING and the reel
// can supply. Never a value he has, never macros or ingredients. Pure.
export function missingFacts(existing, payload) {
  const edit = {};
  const fields = [];
  if (existing.servings == null && payload.servings != null) { edit.servings = payload.servings; fields.push('servings'); }
  if (existing.prepMin == null && payload.prepMin != null) { edit.prepMin = payload.prepMin; fields.push('prep time'); }
  if (existing.cookMin == null && payload.cookMin != null) { edit.cookMin = payload.cookMin; fields.push('cook time'); }
  if (!existing.source && payload.source?.url) { edit.source = payload.source; fields.push('source'); }
  return { edit, fields };
}

/* -------------------------------- the lane -------------------------------- */

export async function startRecipeFromVideo(vaultPath, url, prose = '', deps = {}) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//.test(u)) throw new Error('a video URL is required');
  if (!laneEnabled(LANE)) throw laneOffError(LANE);
  const record = await (deps.createRecord || createRecord)({
    id: randomUUID().slice(0, 8),
    kind: 'recipe-video',
    text: `Recipe from: ${u}${prose ? ` — ${String(prose).slice(0, 200)}` : ''}`,
    source: 'capture',
    mode: 'draft',
    status: 'classifying',
    createdAt: new Date().toISOString(),
  });
  const done = runRecipeJob(vaultPath, record.id, u, String(prose || ''), deps).catch(() => {});
  if (deps.await) await done;
  return record;
}

async function runRecipeJob(vaultPath, recordId, url, prose, deps) {
  const update = deps.updateRecord || updateRecord;
  try {
    const meta = await (deps.fetchCaption || fetchCaption)(url);
    let transcript = '';
    if (!captionHasRecipe(meta.caption)) {
      try { transcript = await (deps.fetchTranscript || fetchTranscriptText)(url); } catch { transcript = ''; }
    }
    const parsed = await askModel(buildRecipePrompt({ ...meta, transcript, prose }), deps);
    const recipes = Array.isArray(parsed?.recipes) ? parsed.recipes.slice(0, 6) : [];
    if (!recipes.length) {
      await update(recordId, { status: 'failed', error: `No recipe in that video${parsed?.notFound ? `: ${String(parsed.notFound).slice(0, 160)}` : ''}.` });
      return;
    }
    const compute = deps.compute || (await import('./nutritionFacts.js')).computeFromComponents;
    const { loadRecipes } = await import('./recipes.js');
    const existing = deps.loadRecipes ? await deps.loadRecipes() : await loadRecipes(vaultPath).catch(() => []);
    // every recipe link goes straight in (3 Oct): his words no longer decide
    const addNow = true;
    const filed = [];
    const updated = [];
    const skipped = [];
    for (const rec of recipes) {
      const out = await toRecipePayload(rec, { url, uploader: meta.uploader, thumbnail: meta.thumbnail, compute });
      if (out.skip) { skipped.push(out.skip); continue; }
      const p = out.payload;
      const twin = existing.find((r) => String(r.name).toLowerCase() === p.name.toLowerCase());
      if (twin) {
        const got = await fillMissing(vaultPath, twin, p, deps);
        if (got.error) skipped.push(`${p.name} could not be updated: ${got.error}`);
        else if (got.fields.length) updated.push(got);
        else skipped.push(`${p.name} is already in your collection`);
        continue;
      }
      const card = {
        id: randomUUID().slice(0, 8),
        text: `Recipe from ${meta.uploader || 'a reel'}: ${p.name}`,
        source: 'capture',
        mode: 'review-all',
        status: 'pending',
        createdAt: new Date().toISOString(),
        decision: {
          route: 'recipe',
          confidence: 'high',
          title: p.macros
            ? `Recipe: ${p.name} — ${p.macros.p}P ${p.macros.c}C ${p.macros.f}F · ${p.macros.kcal} kcal`
            : `Recipe: ${p.name} — macros not set`,
          reason: `read from the ${meta.medium === 'page' ? 'page' : `reel's ${transcript ? 'caption and transcript' : 'caption'}`}; ${p.macros ? '' : 'the source gives no macros, so it files with them not set (never a guess) for you to fill in when you make it; '}your yes writes it into your recipe collection, and undo removes it`,
          payload: p,
        },
      };
      await (deps.createRecord || createRecord)(card);
      let applied = false;
      if (addNow) {
        try {
          await (deps.approve || (async (id) => (await import('./inbox.js')).approveRecord(vaultPath, id)))(card.id);
          applied = true;
        } catch (e) { skipped.push(`${p.name} could not be added: ${e.message}`); }
      }
      filed.push({ id: card.id, name: p.name, applied, macros: p.macros });
    }
    const label = (f) => (f.macros ? f.name : `${f.name} (macros not set)`);
    const parts = [];
    if (filed.length) parts.push(`${filed.some((f) => f.applied) ? 'Recipe bank' : 'Waiting for your yes'} — ${filed.map(label).join(', ')}`);
    for (const u of updated) parts.push(`Updated — ${u.name} (${u.fields.join(', ')})`);
    if (skipped.length) parts.push(`not added: ${skipped.join('; ')}`);
    await update(recordId, filed.length || updated.length
      ? {
        status: 'filed',
        destination: parts.join(' · ').slice(0, 400),
        recipeCards: filed.map((f) => f.id),
        filedAt: new Date().toISOString(),
        // what was filled in, exactly, so Undo takes back only that
        ...(updated.length ? { undoData: { route: 'recipe-backfill', items: updated.map((u) => ({ recipeId: u.recipeId, set: u.set, photoHash: u.photoHash })) } } : {}),
      }
      : { status: 'failed', error: skipped.join('; ').slice(0, 400) || 'nothing could be filed' });
  } catch (e) {
    await update(recordId, { status: 'failed', error: e.message.slice(0, 300) });
  }
}

// Fill in what an existing recipe lacks from the reel. The facts go through
// editRecipe (in place, sanity-checked, backed up); the photo only when it
// has none. Returns { name, recipeId, fields, set, photoHash } or { error }.
async function fillMissing(vaultPath, twin, payload, deps) {
  const { edit, fields } = missingFacts(twin, payload);
  const out = { name: twin.name, recipeId: twin.id, fields: [], set: {}, photoHash: null };
  if (payload.photoUrl) {
    const photos = await import('./recipePhotos.js');
    const has = await (deps.getPhoto || photos.getPhoto)(vaultPath, twin.id).catch(() => null);
    if (!has) {
      out.photoHash = await saveRecipePhotoFromUrl(vaultPath, twin.id, payload.photoUrl, deps);
      if (out.photoHash) out.fields.push('photo');
    }
  }
  if (fields.length) {
    try {
      const { editRecipe } = await import('./recipes.js');
      await (deps.editRecipe || editRecipe)(vaultPath, twin.id, edit);
      out.fields.push(...fields);
      out.set = edit;
    } catch (e) {
      if (!out.fields.length) return { error: e.message };
    }
  }
  return out;
}

// the Watcher's transcript tooling, reused only when the caption is empty
async function fetchTranscriptText(url) {
  const { fetchVideoTranscript } = await import('./watcher.js');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-recipe-'));
  try {
    const report = await fetchVideoTranscript(url, dir);
    const p = report?.transcriptPath || report?.transcript_path;
    if (p) return await readFile(p, 'utf8');
    return String(report?.transcript || '');
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
