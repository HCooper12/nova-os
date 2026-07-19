import { Vault } from './vault.js';

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

function snippetFor(page, terms) {
  const para = page.paragraphs.find((p) => {
    const lower = p.toLowerCase();
    return terms.some((t) => lower.includes(t));
  }) || page.paragraphs[0] || '';
  return para.length > 180 ? para.slice(0, 177) + '…' : para;
}

export async function searchVault(vaultPath, query, { limit = 6 } = {}) {
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

  return scored.slice(0, limit).map(({ page, score }) => ({
    id: page.id,
    title: page.title,
    type: page.type,
    snippet: snippetFor(page, terms),
    score,
  }));
}

// test hook
export function _resetRecallCache() {
  cache = { at: 0, vaultPath: null, pages: null };
}
