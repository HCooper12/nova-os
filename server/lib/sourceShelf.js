// THE SHELF, AS CONTEXT — what Hayden has deliberately put into his second
// brain, handed to every agent that could use it.
//
// The gap this closes (audited 7 Sep 2026): eleven agents already run INSIDE
// his vault with Read/Grep/Glob, and not one of them had ever been told the
// `Wiki/Sources/` shelf exists. Nothing read a source page's body into a
// prompt, and nothing read the verbatim transcripts in `Raw/` at all. So a
// podcast he uploaded on purpose was invisible to the Coach who most needed
// it — the material was in the vault and out of reach at the same time.
//
// Two things make this safe rather than merely available:
//
//   1. RELEVANCE, NOT VOLUME. A shelf of 13 sources pasted into every prompt
//      is 13 sources of noise. This ranks against what the agent is actually
//      doing (recall.js's lexical index, the same one the Recall palette
//      uses) and hands over a handful, each with the PATH so the agent can
//      Read the full page and its transcript when it matters.
//
//   2. PROVENANCE, ALWAYS. Every line says what the thing is — a podcast, a
//      book dossier, a researched profile — because "a source page says X"
//      and "the evidence shows X" are different claims. The lens carries the
//      rule; this block carries the labels the rule needs.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildLibrary } from './library.js';
import { searchVault } from './recall.js';
import { Vault } from './vault.js';

const KIND_WORD = {
  video: 'video/podcast', podcast: 'video/podcast', book: 'book',
  person: 'person dossier', article: 'article', source: 'source',
};

// A source's own words about itself: the Watcher writes "**Verdict:** …" as
// the second line of every note, and that verdict is the single most useful
// sentence in the file — it is Nova's own prior judgement of the material.
export function verdictOf(excerpt) {
  const m = String(excerpt || '').match(/\*\*Verdict:\*\*\s*([^\n]+)/);
  return m ? m[1].trim() : null;
}

// The verdict lives in the page, not in the shelf metadata — and it is the
// most useful sentence in the file, so the picked few (never the whole shelf)
// are read from disk for it.
async function withVerdict(vaultPath, s) {
  try {
    const raw = await readFile(path.join(vaultPath, `${s.id}.md`.split('/').join(path.sep)), 'utf8');
    const v = verdictOf(raw);
    return v ? { ...s, verdict: v } : s;
  } catch {
    return s;
  }
}

function lineFor(s) {
  const bits = [`- "${s.title}"`];
  const kind = KIND_WORD[s.kind] || s.kind || 'source';
  const who = s.author ? ` by ${s.author}` : '';
  bits.push(`(${kind}${who}${s.created ? `, filed ${s.created}` : ''})`);
  const verdict = s.verdict || verdictOf(s.excerpt);
  if (verdict) bits.push(`— Nova's earlier read: ${verdict.slice(0, 180)}`);
  else if (s.excerpt) bits.push(`— ${s.excerpt.replace(/\s+/g, ' ').slice(0, 160)}`);
  const paths = [`\`${s.id}.md\``];
  if (s.raw) paths.push(`transcript \`${s.raw}.md\``);
  bits.push(`· ${paths.join(' · ')}`);
  if (s.concepts?.length) bits.push(`· concepts: ${s.concepts.slice(0, 5).join(', ')}`);
  return bits.join(' ');
}

// The block itself. `topics` is what the agent is about to reason about —
// a few words is enough ("protein hypertrophy sleep"), and an empty topic
// falls back to the most recent shelf items so the agent at least knows the
// shelf is there.
export async function shelfContext(vaultPath, { topics = '', limit = 5, tag = null } = {}) {
  let shelf;
  try {
    shelf = await buildLibrary(vaultPath, new Vault(vaultPath));
  } catch {
    return null; // no shelf is not an error — say nothing rather than guess
  }
  if (!shelf.length) return null;
  let pool = tag ? shelf.filter((s) => (s.tags || []).includes(tag)) : shelf;
  if (!pool.length) pool = shelf;

  let picked = pool.slice(0, limit);
  const q = String(topics || '').trim();
  if (q) {
    try {
      // rank by his own material, then keep shelf order among the winners
      const hits = await searchVault(vaultPath, q, { limit: 24 });
      const rank = new Map(hits.map((h, i) => [h.id, i]));
      const scored = pool
        .map((s) => ({ s, r: rank.has(s.id) ? rank.get(s.id) : Infinity }))
        .sort((a, b) => a.r - b.r);
      const relevant = scored.filter((x) => x.r !== Infinity).map((x) => x.s);
      // relevant first, then the newest of the rest to fill the quota
      picked = [...relevant, ...pool.filter((s) => !relevant.includes(s))].slice(0, limit);
    } catch { /* the index is a nicety — the shelf still ships */ }
  }

  const lines = (await Promise.all(picked.map((s) => withVerdict(vaultPath, s)))).map(lineFor).join('\n');
  return `HIS SHELF — what he has deliberately put into his second brain (${shelf.length} source${shelf.length === 1 ? '' : 's'} in Wiki/Sources/, showing ${picked.length}):
${lines}

Use it. Read the full page (and its Raw/ transcript) when a claim in it bears on what you are about to say — you have Read and Grep, and the paths are above. But a source page records WHAT SOMEONE CLAIMED, not what is true: attribute it ("the Huberman episode he saved argues…"), weigh it against what you actually know, and say so plainly when his material and the evidence disagree. Never repeat a podcast's claim to him as established fact, and never invent a source that is not on this shelf.`;
}

// Everything on the shelf, titles only — for an agent that needs to know the
// shelf's SHAPE (what he has been consuming) rather than its content.
export async function shelfTitles(vaultPath, { limit = 20 } = {}) {
  try {
    const shelf = await buildLibrary(vaultPath, new Vault(vaultPath));
    return shelf.slice(0, limit).map((s) => ({ title: s.title, kind: s.kind, author: s.author, id: s.id }));
  } catch {
    return [];
  }
}
