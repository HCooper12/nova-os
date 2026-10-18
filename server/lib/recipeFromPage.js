// A RECIPE PAGE BECOMES A RECIPE (1 Oct 2026, the "every door" build).
//
// His words: "adding links and telling it to add it to my recipe vault". The
// reel import (recipeFromVideo.js, 29 Sep) reads a video's caption with
// yt-dlp; a recipe WEBSITE has no caption, and yt-dlp refuses it. So a page
// gets its own reader, and then rides the reel's exact rails: the same model
// read into structured recipes, the same code-decided macros (the page's own
// per-serving figures when they add up, else computed from weights, else not
// set — never a guess), the same `recipe` cards, added straight in (3 Oct),
// and the same undo.
//
//   code   fetches the page and takes the schema.org Recipe block most recipe
//          sites publish (JSON-LD) — ingredients, method, yield, times,
//          nutrition, photo — straight from the markup. A page without one
//          hands over its readable text instead, and the model finds the
//          recipe in it or says there is none.
//   model  reads that text into the structured recipe (recipeFromVideo's
//          prompt, told it is a page).
//   code   everything after, unchanged.
//
// startRecipeImport is the ONE entry every door uses for "add this to my
// recipes: <link>" — it picks the page reader or the reel reader from the
// link itself (src/linkKind.js), so no caller has to know which it was.

import { startRecipeFromVideo, runRecipeJob, categoryFor } from './recipeFromVideo.js';
import { updateRecord } from './inboxStore.js';
import { classifyLink, hostOf } from '../../src/linkKind.js';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAX_HTML = 3 * 1024 * 1024;
const MAX_TEXT = 20_000;

/* ------------------------------ the markup ------------------------------ */

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'").replace(/&#8211;|&ndash;/g, '-')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const clean = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();

// every JSON-LD block on the page, parsed; a malformed block is skipped
export function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* a broken block is not a recipe */ }
  }
  return out;
}

const isRecipeType = (t) => (Array.isArray(t) ? t : [t]).some((x) => String(x || '').toLowerCase() === 'recipe');

/** The first schema.org Recipe object in the page's JSON-LD, or null. Pure. */
export function findRecipeLd(html) {
  const seen = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.includes(node)) return null;
    seen.push(node);
    if (Array.isArray(node)) { for (const n of node) { const hit = walk(n); if (hit) return hit; } return null; }
    if (isRecipeType(node['@type'])) return node;
    for (const k of ['@graph', 'mainEntity', 'itemListElement', 'item']) {
      if (node[k]) { const hit = walk(node[k]); if (hit) return hit; }
    }
    return null;
  };
  for (const block of jsonLdBlocks(html)) {
    const hit = walk(block);
    if (hit) return hit;
  }
  return null;
}

// ISO-8601 duration → whole minutes ("PT1H15M" → 75), else null
export function isoMinutes(d) {
  const m = String(d || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return (Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function steps(instr) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (typeof n === 'string') { const t = clean(n); if (t) out.push(t); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.itemListElement) { walk(n.itemListElement); return; }
    if (n.text) walk(n.text);
    else if (n.name) walk(n.name);
  };
  walk(instr);
  return out;
}

function imageOf(img) {
  if (!img) return null;
  if (typeof img === 'string') return /^https?:\/\//.test(img) ? img : null;
  if (Array.isArray(img)) { for (const i of img) { const u = imageOf(i); if (u) return u; } return null; }
  return imageOf(img.url || img.contentUrl || null);
}

/**
 * A schema.org Recipe object → the caption-shaped text the recipe reader
 * reads, plus the facts code can take directly. Pure.
 */
export function recipeTextFromLd(ld) {
  const name = clean(ld?.name);
  const ingredients = (Array.isArray(ld?.recipeIngredient) ? ld.recipeIngredient : ld?.ingredients || []).map(clean).filter(Boolean);
  const method = steps(ld?.recipeInstructions);
  const yieldRaw = Array.isArray(ld?.recipeYield) ? ld.recipeYield.map(String).join(' / ') : ld?.recipeYield != null ? String(ld.recipeYield) : '';
  const prep = isoMinutes(ld?.prepTime);
  const cook = isoMinutes(ld?.cookTime);
  const n = ld?.nutrition || {};
  const nutri = [
    n.calories && `calories ${clean(n.calories)}`,
    n.proteinContent && `protein ${clean(n.proteinContent)}`,
    n.carbohydrateContent && `carbs ${clean(n.carbohydrateContent)}`,
    n.fatContent && `fat ${clean(n.fatContent)}`,
  ].filter(Boolean);
  const lines = [
    name && `Recipe: ${name}`,
    yieldRaw && `Serves / makes: ${clean(yieldRaw)}`,
    prep != null && `Prep time: ${prep} minutes`,
    cook != null && `Cook time: ${cook} minutes`,
    nutri.length && `Nutrition per serving (as the page states it${n.servingSize ? `, serving ${clean(n.servingSize)}` : ''}): ${nutri.join(', ')}`,
    ingredients.length && `Ingredients:\n${ingredients.map((i) => `- ${i}`).join('\n')}`,
    method.length && `Method:\n${method.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
  ].filter(Boolean);
  return { name, text: lines.join('\n'), image: imageOf(ld?.image), author: clean(ld?.author?.name || (Array.isArray(ld?.author) ? ld.author[0]?.name : ld?.author) || '') };
}

const num = (v) => {
  const m = String(v ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/**
 * A COMPLETE schema.org Recipe block read by code alone, in the shape the
 * model reader returns ({ recipes: [...] }), or null when the block is not
 * complete enough to trust (no name, no ingredients, or no method) — then the
 * model reads the page's text instead. Pure. Nothing is invented: a figure the
 * block does not carry stays null, and macros come only from the block's own
 * per-serving nutrition (recipeFromVideo.macrosFor checks them against the
 * Atwater sum and drops them if they do not add up).
 */
export function recipeFromLd(ld) {
  if (!ld) return null;
  const r = recipeTextFromLd(ld);
  const ingredients = (Array.isArray(ld.recipeIngredient) ? ld.recipeIngredient : ld.ingredients || []).map(clean).filter(Boolean);
  const method = steps(ld.recipeInstructions);
  if (!r.name || !ingredients.length || !method.length) return null;
  const yieldRaw = Array.isArray(ld.recipeYield) ? ld.recipeYield.map(String).join(' / ') : ld.recipeYield != null ? String(ld.recipeYield) : '';
  const servings = num(yieldRaw);
  const n = ld.nutrition || {};
  const p = num(n.proteinContent), c = num(n.carbohydrateContent), f = num(n.fatContent);
  let kcal = num(n.calories);
  if (kcal != null && /kj/i.test(String(n.calories)) && !/k?cal/i.test(String(n.calories))) kcal = Math.round(kcal / 4.184);
  const cat = Array.isArray(ld.recipeCategory) ? ld.recipeCategory.join(' ') : String(ld.recipeCategory || '');
  return {
    recipes: [{
      name: r.name,
      servings: servings && servings >= 1 ? Math.round(servings) : null,
      makes: yieldRaw && !/^\s*\d+\s*$/.test(yieldRaw) ? clean(yieldRaw).slice(0, 60) : null,
      prepMin: isoMinutes(ld.prepTime),
      cookMin: isoMinutes(ld.cookTime),
      ingredients: ingredients.map((text) => ({ text, name: null, grams: null })),
      method,
      statedPerServing: p != null && c != null && f != null ? { kcal, p, c, f } : null,
      category: /dessert|snack|sweet|cookie|cake|bak/i.test(cat) ? 'TREATS' : categoryFor(''),
    }],
    notFound: '',
  };
}

// no Recipe block: the page's own readable words, scripts and chrome removed
export function readableText(html) {
  const body = String(html || '')
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|li|h\d|div|br|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return decode(body.replace(/<[^>]+>/g, ' ')).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, MAX_TEXT);
}

const metaContent = (html, prop) => {
  const m = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
    || String(html || '').match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? decode(m[1]).trim() : '';
};

/** HTML → the { title, uploader, caption, thumbnail } the recipe reader takes. Pure. */
export function pageAsCaption(html, url) {
  const ld = findRecipeLd(html);
  const site = metaContent(html, 'og:site_name') || hostOf(url);
  const title = metaContent(html, 'og:title') || clean((String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  if (ld) {
    const r = recipeTextFromLd(ld);
    return { title: r.name || title, uploader: site, caption: r.text, thumbnail: r.image || metaContent(html, 'og:image') || null, duration: null, medium: 'page', structured: true, parsed: recipeFromLd(ld) };
  }
  return { title, uploader: site, caption: readableText(html), thumbnail: metaContent(html, 'og:image') || null, duration: null, medium: 'page', structured: false, parsed: null };
}

/** Fetches a recipe page → pageAsCaption. `fetchImpl` for tests. */
export async function fetchRecipePage(url, { timeoutMs = 20_000, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`the page answered ${res.status}`);
  const html = (await res.text()).slice(0, MAX_HTML);
  return pageAsCaption(html, url);
}

/* -------------------------------- the lane -------------------------------- */

/**
 * "Add this to my recipes: <link>", from any door. A video goes to the reel
 * reader, anything else to the page reader; both land on the same rails.
 * `prose` is his words, handed to the reader as context. Every recipe goes
 * straight in with its Undo, whatever he said (his call, 3 Oct 2026).
 */
export async function startRecipeImport(vaultPath, url, prose = '', deps = {}) {
  const link = classifyLink(url, prose || 'add to my recipes');
  if (!link.kind) throw new Error('that is not a link I can read a recipe from');
  if (link.kind === 'channel') throw new Error('that is a whole channel, not one recipe — send the one video');
  if (link.kind === 'recipe-reel' || link.kind === 'video') return startRecipeFromVideo(vaultPath, link.url, prose, deps);
  return startRecipeFromVideo(vaultPath, link.url, prose, pageDeps(deps));
}

const pageDeps = (deps = {}) => ({
  ...deps,
  fetchCaption: deps.fetchCaption || ((u) => fetchRecipePage(u)),
  // a page has no transcript; the page text IS the whole source
  fetchTranscript: deps.fetchTranscript || (async () => ''),
});

/**
 * Retry for a recipe link kept because the model could not read it (inbox
 * record kind 'recipe-video', status 'error'). Re-runs the same job on the
 * same record; the page or reel reader is picked from the link again.
 */
export async function retryRecipeImport(vaultPath, record, deps = {}) {
  const m = String(record.text || '').match(/^Recipe from:\s*(\S+)(?:\s+—\s+([\s\S]+))?$/);
  if (!m) throw new Error('this record has no link to re-run');
  const link = classifyLink(m[1], m[2] || 'add to my recipes');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null, errorDetail: null });
  const d = link.kind === 'recipe-reel' || link.kind === 'video' ? deps : pageDeps(deps);
  const done = runRecipeJob(vaultPath, record.id, m[1], (m[2] || '').trim(), d).catch(() => {});
  if (deps.await) await done;
  return updated;
}
