// DOCUMENTS ON THE CLIENT (28 Sep 2026) — the small shared pieces every
// surface that shows a document needs, and nothing that draws.
//
// The format itself is src/artifactBlocks.js (shared with the server, tested,
// not to be changed from here). This file is the client's side of it:
//
//   streamShown(partial)  what a chat may show of a reply still arriving —
//                         a document's body never, a VIS directive inside it
//                         never, only "writing a document" in its place
//   rememberArtifacts()   the meta a job result carries, kept so a card in a
//                         bubble can draw at once instead of fetching
//   openArtifact(id)      the one door to the viewer: a window event, so a
//                         card deep inside ChatMarkdown needs no props
//   AGENT / dates         the agent's hue and name, and the date words, in one
//                         place so the card, the list and the viewer agree
//
// Plain JS, no React, so a node test can import it.

import { parseArtifactBlocks, PENDING_TOKEN } from './artifactBlocks.js';

// ---------------------------------------------------------------- agents --
// COLOUR MEANS SOMETHING (§2b rule 8). Each agent wears the hue the Agent
// World already gave its being (src/agentWorld/beings.js): Coach the chest
// coral of its department, the Leader magenta, and Nova the blue of its own
// core. The same three hues on the card, the cover tile and the viewer.
export const AGENT = {
  coach: { key: 'coach', name: 'Coach', hue: 'var(--nv-m-chest)' },
  nova: { key: 'nova', name: 'Nova', hue: 'var(--nv-cy)' },
  leader: { key: 'leader', name: 'Leader', hue: 'var(--nv-mg)' },
};
export const agentOf = (key) => AGENT[String(key || '').toLowerCase()] || AGENT.nova;

export const KIND_LABEL = { doc: 'Document', html: 'Interactive' };

// ----------------------------------------------------------------- dates --
const DAY = 86_400_000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

/** 'today' | 'week' | 'earlier', by his local calendar day, never UTC. */
export function ageBucket(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'earlier';
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return 'today';
  if (days < 7) return 'week';
  return 'earlier';
}

/** "14:32" today, "Yesterday", "Mon", then "12 Sep" (and the year once it is not this one). */
export function relativeDate(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The full date for the viewer's meta row: "Sun 28 Sep, 14:32". */
export function longDate(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** "1,240 words" — or nothing when the server did not count. */
export function wordsLabel(words) {
  const n = Number(words);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n.toLocaleString('en-GB')} word${n === 1 ? '' : 's'}`;
}

/** "5 min read" at 230 words a minute, never under one. */
export function readLabel(words) {
  const n = Number(words);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${Math.max(1, Math.round(n / 230))} min read`;
}

// ------------------------------------------------------------- streaming --
// The titles of the documents in the reply that is arriving now, in order, so
// each "writing a document" card can name the one it stands for. One reply
// streams at a time per surface; the last writer wins, which is honest enough
// for a placeholder that lives a few seconds.
let pendingTitles = [];
const titleSubs = new Set();
export function pendingTitle(i) { return pendingTitles[i] || ''; }
export function onPendingTitles(fn) { titleSubs.add(fn); return () => titleSubs.delete(fn); }

const NEW_TOKEN_RE = /\[\[artifact:new-\d+\]\]/gi;

/**
 * What a chat may show of a reply that is still arriving. The body of a
 * document is withheld (the shared parser's streaming mode), and a document
 * that has CLOSED but is not filed yet ([[artifact:new-N]], which no card can
 * open) also reads as "writing" until the finished reply brings its real id.
 * Run this BEFORE parseVisualStream, so a VIS directive inside a document can
 * never raise a panel on the glass.
 */
export function streamShown(partial) {
  const r = parseArtifactBlocks(partial, { final: false });
  const titles = [...r.blocks.map((b) => b.header.title), ...(r.pending ? [r.pending.title || ''] : [])];
  if (titles.join('\u0000') !== pendingTitles.join('\u0000')) {
    pendingTitles = titles;
    titleSubs.forEach((fn) => { try { fn(); } catch { /* a listener never breaks the stream */ } });
  }
  return r.text.replace(NEW_TOKEN_RE, PENDING_TOKEN);
}

// The speech path counts characters from the start of the streamed text, and
// the finished reply swaps "[[artifact:pending]]" for a real id of another
// length — so both sides are measured with every token the SAME width, or the
// last sentences would be sliced a few characters off.
const ANY_TOKEN_RE = /\[\[artifact:[a-z0-9][a-z0-9-]{3,63}\]\]/gi;
export const sameWidthTokens = (text) => String(text || '').replace(ANY_TOKEN_RE, PENDING_TOKEN);

// ----------------------------------------------------------------- cache --
// A card in a bubble has only an id. The job result that produced it carries
// the meta; it is kept here (and in localStorage, capped) so a card draws at
// once, and after a reload too. A miss is fetched by the card itself.
const CACHE_KEY = 'novaos.artifactMeta';
const CACHE_MAX = 80;
const cache = new Map();
const metaSubs = new Set();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    if (Array.isArray(raw)) for (const m of raw) if (m && m.id) cache.set(m.id, m);
  } catch { /* a blocked or corrupt store is an empty cache */ }
}
function persist() {
  try {
    const keep = [...cache.values()].filter((m) => !m.missing).slice(-CACHE_MAX)
      .map(({ id, title, kind, agent, summary, tags, created, pinned, words, path, vault }) => ({ id, title, kind, agent, summary, tags, created, pinned, words, path, vault }));
    localStorage.setItem(CACHE_KEY, JSON.stringify(keep));
  } catch { /* storage full or blocked: the cache simply does not survive a reload */ }
}
const notifyMeta = () => metaSubs.forEach((fn) => { try { fn(); } catch { /* never breaks a render */ } });

export function rememberArtifacts(list) {
  load();
  let changed = false;
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m.id !== 'string') continue;
    // meta only: a body is never cached here, it can be 200KB
    const { body: _body, ...meta } = m;
    cache.delete(meta.id);
    cache.set(meta.id, meta);
    changed = true;
  }
  if (changed) { persist(); notifyMeta(); }
}
export function markArtifactMissing(id) {
  load();
  cache.set(id, { id, missing: true });
  notifyMeta();
}
export function artifactMeta(id) { load(); return cache.get(id) || null; }
export function onArtifactMeta(fn) { metaSubs.add(fn); return () => metaSubs.delete(fn); }

// ------------------------------------------------------------------ door --
export const OPEN_EVENT = 'nova:open-artifact';
/** Open the viewer on a document, from anywhere. App listens. */
export function openArtifact(id) {
  if (!id || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id } }));
}

// ----------------------------------------------------------------- vault --
/**
 * Where the file lives, for Obsidian. The vault's NAME is not something the
 * client knows (the server holds the path), so a link is offered only when
 * the meta carries it; otherwise the viewer shows the vault-relative path to
 * copy, which is always true.
 */
export function obsidianUrl(meta) {
  const vault = typeof meta?.vault === 'string' && meta.vault.trim() ? meta.vault.trim() : '';
  const path = typeof meta?.path === 'string' ? meta.path.replace(/\.md$/i, '') : '';
  if (!vault || !path) return null;
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`;
}
