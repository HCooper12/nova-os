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
let rebuilding = null;

// `stale`: a spoken turn takes the pages as they stood a minute ago and the
// fresh read happens behind it. A cold read of ~1,300 files took 510 ms on
// 7 Nov, and that is dead air to a man waiting on an answer. Every other caller
// waits for the truth, as it always did.
async function getIndex(vaultPath, { stale = false, maxStaleMs = Infinity } = {}) {
  const same = cache.pages && cache.vaultPath === vaultPath;
  if (same && Date.now() - cache.at < INDEX_TTL_MS) return cache.pages;
  if (stale && same && Date.now() - cache.at < maxStaleMs) {
    rebuilding ||= buildIndex(vaultPath).catch(() => null).finally(() => { rebuilding = null; });
    return cache.pages;
  }
  return buildIndex(vaultPath);
}

async function buildIndex(vaultPath) {
  const vault = new Vault(vaultPath);
  const pages = (await vault.listPages()).map((p) => {
    const counts = new Map();
    const bump = (tokens, weight) => {
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + weight);
    };
    bump(tokenize(p.title), 3);
    for (const para of p.paragraphs) bump(tokenize(para), 1);
    // `paragraphs` drops any block that is all bullets, and that is where a
    // concept page keeps its points and the Injury Log keeps every entry. The
    // retrieval reads these too (lib/vaultRetrieve.js); a transcript has none.
    const bullets = p.id.startsWith('Raw/') ? [] : String(p.raw || '').split('\n').filter((l) => /^\s*[-*]\s/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').trim());
    return { id: p.id, title: p.title, type: p.type, date: p.date, tags: p.tags, rawLink: p.rawLink || null, paragraphs: p.paragraphs, bullets, counts };
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



// Every page that shares any of the query's words, best first. Pages matching
// MORE of the distinct terms always outrank pages matching one term often.
function lexicalScan(pages, terms) {
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
    scored.push({ page, score: matched * 100 + Math.min(99, tf) });
  }
  scored.sort((a, b) => b.score - a.score || (a.page.date < b.page.date ? 1 : -1));
  return scored;
}

// The meaning half, shared by searchVault and searchNotes. `state` says WHY
// there may be no meaning hits, so a caller that wants to be honest about it
// can: 'ok' (asked and answered, even if the answer was nothing), 'no-index'
// (the vectors were never built for this vault) or 'embedder-down' (the model
// server did not answer). Never throws: the words answer is already made.
async function semanticPass(vaultPath, query, pages, lexScore) {
  const sims = new Map();
  const semIds = [];
  let state = 'ok';
  try {
    // `loadIndex` returns nothing unless the index was built from THIS
    // vault, so a fixture or a changed VAULT_PATH simply has no semantic
    // half rather than a wrong one.
    const index = await vectorIndex(vaultPath);
    if (!index) state = 'no-index';
    else {
      const qv = await embedQuery(query);
      for (const [id, sim] of pickSemantic(scoreAgainstIndex(index, qv))) {
        if (lexScore.has(id) || sim >= SEMANTIC_ONLY_FLOOR) { sims.set(id, sim); semIds.push(id); }
      }
    }
    refreshInBackground(vaultPath, pages);
  } catch {
    // The embedder is optional by design; the lexical answer is already made.
    sims.clear(); semIds.length = 0; state = 'embedder-down';
  }
  return { sims, semIds, state };
}

// `withText` returns each hit's whole body, not just its snippet — the
// timecode finder has to read a Watcher note in full to find the stamp
// sitting next to the idea, and re-reading the file would ignore an index
// that already holds it.
export async function searchVault(vaultPath, query, { limit = 6, withText = false, semantic = true } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const pages = await getIndex(vaultPath);

  const scored = lexicalScan(pages, terms);

  const deep = Math.max(limit * 4, 24);
  const lexical = scored.slice(0, deep);
  const lexScore = new Map(lexical.map(({ page, score }) => [page.id, score]));

  // Meaning, when there is an embedder to ask. A page lexical ALREADY found
  // may be re-ordered freely — it matched. A page lexical never found is a new
  // claim, so it has to clear SEMANTIC_ONLY_FLOOR before it may enter; that is
  // what keeps a nonsense query returning nothing instead of the most average
  // page in the vault wearing a match's clothes.
  const { sims, semIds } = semantic
    ? await semanticPass(vaultPath, query, pages, lexScore)
    : { sims: new Map(), semIds: [] };

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


// ------------------------------------------------ K1: search that reads the note
//
// What the search sheet (src/SearchSheet.jsx, mockup 117) needs and
// searchVault cannot give: the LINE that matched with the phrase's position, a
// date, exact-words hits kept apart from hits by meaning, an honest account of
// the meaning half being unavailable, and the time each half took.
//
// The two halves are separate calls (`half`), so the words answer is on screen
// while the embedder is still thinking. `searchVault` is untouched: every
// other caller (sourceShelf, visualResolve, vaultRetrieve) gets what it got.

const isoDate = (d) => {
  if (!d) return '';
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SNIP = 120;

// Cut `text` to about SNIP characters around [from, to) on word edges, and
// carry the marks across with it. Marks are [start, end) offsets in the
// RETURNED string, so the client marks without re-searching.
function windowLine(text, marks) {
  let start = 0;
  let end = text.length;
  if (text.length > SNIP) {
    // anchor on the first mark, or, when the words are spread wider than a row
    // can show, on the mark whose window holds the most of them
    let anchor = marks.length ? marks[0][0] : 0;
    if (marks.length > 1 && marks[marks.length - 1][1] - marks[0][0] > SNIP - 30) {
      let best = -1;
      for (const [a] of marks) {
        const lo = Math.max(0, a - 24);
        const n = marks.filter(([x, y]) => x >= lo && y <= lo + SNIP).length;
        if (n > best) { best = n; anchor = a; }
      }
    }
    start = Math.max(0, Math.min(anchor - 24, text.length - SNIP));
    end = Math.min(text.length, start + SNIP);
    if (start > 0) { const sp = text.indexOf(' ', start); if (sp > -1 && sp < anchor) start = sp + 1; }
    if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > start + SNIP / 2) end = sp; }
  }
  const lead = start > 0 ? '\u2026' : '';
  const tail = end < text.length ? '\u2026' : '';
  const piece = text.slice(start, end);
  const trimmed = piece.length - piece.trimStart().length;
  const out = lead + piece.trim() + tail;
  const shift = lead.length - start - trimmed;
  const lo = lead.length;
  const hi = out.length - tail.length;
  return {
    line: out,
    marks: marks.map(([x, y]) => [x + shift, y + shift]).filter(([x, y]) => x >= lo && y <= hi),
  };
}

// The best line in a page that really holds the query's words, or null.
// A line qualifies only when EVERY query term starts a word in it: this is what
// keeps a row out of "Has these words" when the words are scattered across the
// note, and why a phrase that is in no note returns no exact row, ever.
// `phrase` (the query as typed, spaces collapsed) wins over loose terms.
export function exactLine(page, terms, phrase) {
  const lines = [];
  page.paragraphs.forEach((para, pi) => {
    for (const l of para.split('\n')) { const t = l.trim(); if (t) lines.push({ t, para: pi }); }
  });
  for (const b of page.bullets || []) lines.push({ t: b, para: null });
  lines.push({ t: page.title || '', para: null, title: true });
  const needles = terms.map((t) => new RegExp(`(?:^|[^a-z0-9])(${escRe(t)}[a-z0-9]*)`, 'i'));
  const phraseRe = phrase.length >= 2 ? new RegExp(escRe(phrase).replace(/\s+/g, '\\s+'), 'i') : null;
  let best = null;
  for (const l of lines) {
    const hit = phraseRe?.exec(l.t);
    let marks;
    let literal = false;
    if (hit) { marks = [[hit.index, hit.index + hit[0].length]]; literal = true; }
    else {
      marks = [];
      for (const re of needles) {
        const m = re.exec(l.t);
        if (!m) { marks = null; break; }
        const at = m.index + m[0].length - m[1].length;
        marks.push([at, at + m[1].length]);
      }
      if (!marks) continue;
      marks.sort((a, b) => a[0] - b[0]);
    }
    // a literal phrase first; then the line whose words sit closest together,
    // so the marks land inside the two lines a row has room for
    const span = marks[marks.length - 1][1] - marks[0][0];
    const rank = (literal ? 1000 : 0) + (l.title ? 0 : 10) + Math.max(0, 100 - span) / 2 - Math.min(9, Math.floor(l.t.length / 80));
    if (!best || rank > best.rank) best = { rank, literal, l, marks };
  }
  if (!best) return null;
  const w = windowLine(best.l.t, best.marks);
  return { line: w.line, marks: w.marks, para: best.l.para, literal: best.literal };
}

// For a meaning row there is no phrase to mark: show the paragraph that shares
// the most of his words, else the page's first one. Never marked.
function meaningLine(page, terms) {
  let best = null;
  let bestN = -1;
  page.paragraphs.forEach((para, pi) => {
    const low = para.toLowerCase();
    const n = terms.filter((t) => low.includes(t)).length;
    if (n > bestN) { bestN = n; best = { para, pi }; }
  });
  const text = (best?.para || '').replace(/\s+/g, ' ').trim();
  if (!text) return { line: page.title || '', para: null };
  const cut = text.length > SNIP ? text.slice(0, SNIP).replace(/\s+\S*$/, '') + '\u2026' : text;
  return { line: cut, para: best.pi };
}

const rowOf = (page, extra) => ({
  id: page.id, title: page.title, type: page.type, date: isoDate(page.date), ...extra,
});

export async function searchNotes(vaultPath, query, { half = 'both', wordsLimit = 40, meaningLimit = 12 } = {}) {
  const q = String(query || '').trim().replace(/\s+/g, ' ');
  const terms = tokenize(q);
  const out = { query: q, half, total: 0 };
  const t0 = Date.now();
  // the pages as they stood up to five minutes ago, the fresh read behind them:
  // a rebuild is ~0.5 s on his vault and the search is the thing he is waiting on
  const pages = await getIndex(vaultPath, { stale: true, maxStaleMs: 5 * 60_000 });
  out.total = pages.length;
  if (!terms.length) {
    if (half !== 'meaning') out.words = { results: [], ms: 0 };
    if (half !== 'words') out.meaning = { results: [], ms: 0, state: 'ok' };
    return out;
  }
  const scored = lexicalScan(pages, terms);
  const lexical = scored.slice(0, Math.max(wordsLimit * 4, 24));
  const lexScore = new Map(lexical.map(({ page, score }) => [page.id, score]));

  // WORDS: a page is an exact hit only if one of its lines really holds them.
  const exact = [];
  const exactIds = new Set();
  for (const { page, score } of scored) {
    const hit = exactLine(page, terms, q);
    if (!hit) continue;
    exactIds.add(page.id);
    exact.push({ page, hit, score: (hit.literal ? 10000 : 0) + score, type: page.type });
  }
  exact.sort((a, b) => b.score - a.score || (a.page.date < b.page.date ? 1 : -1));
  if (half !== 'meaning') {
    out.words = {
      results: rankRecall(exact, wordsLimit).map(({ page, hit }) => rowOf(page, {
        line: hit.line, marks: hit.marks, para: hit.para, literal: hit.literal,
      })),
      // true when more notes held the words than were returned: the sheet then
      // says "40+", never a count it did not get
      more: exact.length > wordsLimit,
      ms: Date.now() - t0,
    };
  }

  // MEANING: only pages the words half did not file, only when the vectors
  // exist and the embedder answers. Otherwise `state` says which, and the
  // sheet says so; an empty list is never passed off as "nothing close".
  if (half !== 'words') {
    const t1 = Date.now();
    const { sims, state } = await semanticPass(vaultPath, q, pages, lexScore);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const cands = [...sims.entries()]
      .filter(([id]) => !exactIds.has(id) && byId.has(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id, sim]) => ({ page: byId.get(id), score: sim, type: byId.get(id).type }));
    out.meaning = {
      state,
      results: rankRecall(cands, meaningLimit).map(({ page, score }) => {
        const m = meaningLine(page, terms);
        return rowOf(page, { line: m.line, para: m.para, similarity: Number(score.toFixed(3)) });
      }),
      ms: Date.now() - t1,
    };
  }
  return out;
}

// The two halves, for a caller that ranks its own way (lib/vaultRetrieve.js).
export const recallIndex = (vaultPath, opts) => getIndex(vaultPath, opts);
export const recallVectors = (vaultPath) => vectorIndex(vaultPath);

// test hook
export function _resetRecallCache() {
  cache = { at: 0, vaultPath: null, pages: null };
  vecCache = { at: 0, index: null };
}
