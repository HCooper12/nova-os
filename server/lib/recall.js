import { Vault } from './vault.js';
import { rankRecall } from './recallRank.js';
import {
  embedQuery, loadIndex, refreshIndex, scoreAgainstIndex, pickSemantic,
  SEMANTIC_ONLY_FLOOR, dataRoot,
} from './embeddings.js';

// Recall — search the whole vault from the palette. Deterministic lexical
// scoring, no model, no dependencies: at this vault's scale (~dozens to a
// few hundred pages) a tokenized index with title weighting and
// distinct-term ranking finds what a human is reaching for, instantly and
// explainably. The index rebuilds at most once a minute.

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it', 'my', 'i', 'with', 'as', 'at', 'be', 'this', 'that']);

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

let cache = { at: 0, vaultPath: null, pages: null };
const INDEX_TTL_MS = 60_000;

async function getIndex(vaultPath) {
  if (cache.pages && cache.vaultPath === vaultPath && Date.now() - cache.at < INDEX_TTL_MS) return cache.pages;
  const vault = new Vault(vaultPath);
  const pages = (await vault.listPages()).map((p) => {
    const counts = new Map();
    const bump = (tokens, weight) => {
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + weight);
    };
    bump(tokenize(p.title), 3);
    for (const para of p.paragraphs) bump(tokenize(para), 1);
    return { id: p.id, title: p.title, type: p.type, date: p.date, paragraphs: p.paragraphs, counts };
  });
  cache = { at: Date.now(), vaultPath, pages };
  return pages;
}

// ------------------------------------------------------- the semantic half
//
// Lexical finds pages that share his WORDS. The embedder finds pages that
// share his MEANING — "what did we settle on" reaching a note that says
// "agreed". It is strictly additive: if Ollama is not running, or the index
// has never been built, every line below no-ops and recall answers exactly as
// it did before. Nothing here can make an answer worse, only wider.

const VEC_TTL_MS = 5 * 60_000;
let vecCache = { at: 0, vaultPath: null, index: null };
let refreshing = false;

async function vectorIndex(vaultPath) {
  if (vecCache.index && vecCache.vaultPath === vaultPath && Date.now() - vecCache.at < VEC_TTL_MS) return vecCache.index;
  const index = await loadIndex(dataRoot(), vaultPath).catch(() => null);
  vecCache = { at: Date.now(), vaultPath, index };
  return index;
}

// Keep the index level with the vault WITHOUT making him wait. A search uses
// whatever is on disk right now; pages that changed are embedded behind it and
// are there for the next question. One refresh at a time, and a failure is
// silent because the lexical answer has already gone out.
//
// ONLY the vault this server is configured for is ever written. `searchVault`
// is called with a temp fixture by the tests and could be called with another
// path by anything; a refresh from one of those would delete every real page
// from the index as "no longer present".
function refreshInBackground(vaultPath, pages) {
  if (refreshing || !vaultPath || vaultPath !== process.env.VAULT_PATH) return;
  refreshing = true;
  Promise.resolve(refreshIndex(dataRoot(), vaultPath, pages))
    .then((r) => { if (r?.ok && r.embedded) vecCache = { at: 0, vaultPath: null, index: null }; })
    .catch(() => {})
    .finally(() => { refreshing = false; });
}

// RECIPROCAL RANK FUSION. A lexical score of 480 and a cosine of 0.61 share no
// scale and must never be added; their RANKS can be. k damps the head so a
// single #1 cannot decide the whole answer on its own.
export const RRF_K = 60;
export function fuse(...lists) {
  const out = new Map();
  for (const ids of lists) {
    ids.forEach((id, i) => out.set(id, (out.get(id) || 0) + 1 / (RRF_K + i + 1)));
  }
  return out;
}

function snippetFor(page, terms) {
  const para = page.paragraphs.find((p) => {
    const lower = p.toLowerCase();
    return terms.some((t) => lower.includes(t));
  }) || page.paragraphs[0] || '';
  return para.length > 180 ? para.slice(0, 177) + '…' : para;
}

// `withText` returns each hit's whole body, not just its snippet — the
// timecode finder has to read a Watcher note in full to find the stamp
// sitting next to the idea, and re-reading the file would ignore an index
// that already holds it.
export async function searchVault(vaultPath, query, { limit = 6, withText = false, semantic = true } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const pages = await getIndex(vaultPath);

  const scored = [];
  for (const page of pages) {
    let matched = 0;
    let tf = 0;
    for (const t of terms) {
      let hit = page.counts.get(t) || 0;
      if (!hit) {
        // light prefix matching so "prog" finds "progression"
        for (const [token, count] of page.counts) {
          if (token.startsWith(t)) { hit += count; }
        }
      }
      if (hit) { matched++; tf += hit; }
    }
    if (!matched) continue;
    // pages matching MORE of the query's distinct terms always outrank
    // pages matching one term often
    scored.push({ page, score: matched * 100 + Math.min(99, tf) });
  }
  scored.sort((a, b) => b.score - a.score || (a.page.date < b.page.date ? 1 : -1));

  const deep = Math.max(limit * 4, 24);
  const lexical = scored.slice(0, deep);
  const lexScore = new Map(lexical.map(({ page, score }) => [page.id, score]));

  // Meaning, when there is an embedder to ask. A page lexical ALREADY found
  // may be re-ordered freely — it matched. A page lexical never found is a new
  // claim, so it has to clear SEMANTIC_ONLY_FLOOR before it may enter; that is
  // what keeps a nonsense query returning nothing instead of the most average
  // page in the vault wearing a match's clothes.
  const sims = new Map();
  let semIds = [];
  if (semantic) {
    try {
      // `loadIndex` returns nothing unless the index was built from THIS
      // vault, so a fixture or a changed VAULT_PATH simply has no semantic
      // half rather than a wrong one.
      const index = await vectorIndex(vaultPath);
      if (index) {
        const qv = await embedQuery(query);
        for (const [id, sim] of pickSemantic(scoreAgainstIndex(index, qv))) {
          if (lexScore.has(id) || sim >= SEMANTIC_ONLY_FLOOR) { sims.set(id, sim); semIds.push(id); }
        }
      }
      refreshInBackground(vaultPath, pages);
    } catch {
      // The embedder is optional by design; the lexical answer is already made.
      semIds = [];
    }
  }

  // Lexical score alone handed 47% of every slot to `Raw/` transcript dumps,
  // and led 10 of 14 real queries with one (measured 9 Sep 2026). Fuse the two
  // rankings, then let recallRank.js decide what survives — trust, then the
  // sieve. Ranked on light objects so `withText` only materialises the winners.
  const byId = new Map(pages.map((p) => [p.id, p]));
  const fused = fuse(lexical.map(({ page }) => page.id), semIds);
  const candidates = [...fused.entries()]
    .map(([id, score]) => {
      const page = byId.get(id);
      return page ? { page, score, type: page.type } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const ranked = rankRecall(candidates, limit);

  return ranked.map(({ page }) => ({
    id: page.id,
    title: page.title,
    type: page.type,
    snippet: snippetFor(page, terms),
    ...(withText ? { text: page.paragraphs.join('\n') } : {}),
    // `score` stays what it always was — the lexical score — so nothing that
    // reads it changes meaning. A page found on meaning alone scores 0 there
    // and says why in `similarity`.
    score: lexScore.get(page.id) || 0,
    ...(sims.has(page.id) ? { similarity: Number(sims.get(page.id).toFixed(3)) } : {}),
  }));
}

// test hook
export function _resetRecallCache() {
  cache = { at: 0, vaultPath: null, pages: null };
  vecCache = { at: 0, index: null };
}
