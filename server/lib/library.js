import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

// THE VISUAL LIBRARY — every Source in the vault (books, videos, podcasts,
// articles) as a browsable shelf, and for any one of them: everything Nova
// currently holds — the woven page, the concepts/entities/topics it links,
// what links back, the raw dossier/transcript, and the OTHER sources it
// shares ideas with. All of it is DERIVED from the vault on read: this file
// writes nothing and keeps no parallel store, so the shelf can never
// disagree with the second brain it represents (vault is the source of
// truth; server/data is for operational state only).

const SOURCES_DIR = path.join('Wiki', 'Sources');

const VIDEO_URL = /(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|tiktok\.com|instagram\.com\/(reel|p)\/)/i;
const PODCAST_URL = /(spotify\.com\/(episode|show)|podcasts\.apple\.com|pocketcasts|overcast\.fm)/i;

// Kind is decided from what the page KNOWS about itself, in order of
// authority: explicit frontmatter type, then the URL's shape. A Source with
// neither is an 'article' — honest default for pasted text.
export function classifyKind(fm) {
  const t = String(fm.type || '').toLowerCase();
  if (t === 'book') return 'book';
  if (t === 'podcast') return 'podcast';
  if (t === 'video') return 'video';
  const url = String(fm.url || '');
  if (PODCAST_URL.test(url)) return 'podcast';
  if (VIDEO_URL.test(url)) return 'video';
  return 'article';
}

function wikilinksOf(body) {
  const out = [];
  const seen = new Set();
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(body))) {
    const label = m[1].trim();
    const key = label.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(label); }
  }
  return out;
}

function firstParagraph(body) {
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || t.startsWith('#') || t.startsWith('>') || t.startsWith('---') || /^[-*]\s/.test(t)) continue;
    return t.replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, '$1').replace(/[*_`]/g, '').slice(0, 240);
  }
  return '';
}

async function readSourcePages(vaultPath) {
  const dir = path.join(vaultPath, SOURCES_DIR);
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch { return []; }
  const pages = [];
  for (const f of files) {
    let raw;
    try { raw = await readFile(path.join(dir, f), 'utf8'); } catch { continue; }
    let fm = {}; let body = raw;
    try { ({ data: fm, content: body } = matter(raw)); } catch { /* malformed frontmatter — still show the page */ }
    pages.push({ file: f, fm, body });
  }
  return pages;
}

// Unquoted YAML dates (created: 2026-08-23) arrive from gray-matter as JS
// Date OBJECTS — String() on those is "Sun Aug 23 2026 …", which displays
// ugly and sorts alphabetically by weekday name (found: the shelf ordered
// Sun < Sat < Tue). Everything date-ish flattens to ISO YYYY-MM-DD here.
function dateStr(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function itemOf({ file, fm, body }) {
  const id = `${SOURCES_DIR}/${path.basename(file, '.md')}`.split(path.sep).join('/');
  return {
    id,
    title: String(fm.title || path.basename(file, '.md')),
    kind: classifyKind(fm),
    author: String(fm.author || fm.creator || fm.uploader || fm.channel || '') || null,
    provenance: fm.provenance ? String(fm.provenance) : null,
    url: fm.url ? String(fm.url) : null,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    created: dateStr(fm.created),
    updated: dateStr(fm.updated),
    raw: typeof fm.raw === 'string' ? (fm.raw.match(/\[\[([^\]|#]+)/)?.[1] || null) : null,
    excerpt: firstParagraph(body),
    links: wikilinksOf(body),
  };
}

// The shelf. `resolve` classifies each outgoing link against the real vault
// (via vault.listPages()) so the client gets concept COUNTS it can trust,
// not raw wikilink strings that may resolve nowhere.
export async function buildLibrary(vaultPath, vault) {
  const sources = (await readSourcePages(vaultPath)).map(itemOf);
  const pages = await vault.listPages();
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
  const backlinks = await vault.backlinkCounts(pages);
  const byId = new Map(pages.map((p) => [p.id, p]));
  for (const s of sources) {
    const resolved = s.links.map((l) => byTitle.get(l.toLowerCase())).filter(Boolean);
    s.concepts = resolved.filter((p) => p.type === 'concept').map((p) => p.title);
    s.linkCount = resolved.length;
    s.backlinks = backlinks.get(byId.has(s.id) ? s.id : (byTitle.get(s.title.toLowerCase())?.id ?? s.id)) || 0;
    delete s.links; // the shelf payload stays light; detail carries the full map
  }
  // newest knowledge first — the shelf reads left-to-right like his week did
  sources.sort((a, b) => String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')));
  return sources;
}

// Everything Nova holds on ONE source: the page itself, its outgoing links
// grouped by what they are, what links back, the raw original, and the
// other sources that share concepts with it — the "intelligently connected"
// row, computed from real wikilinks rather than guessed.
export async function buildLibraryItem(vaultPath, vault, id) {
  const rel = `${id}.md`;
  if (!rel.startsWith('Wiki/Sources/') || rel.includes('..')) throw new Error('not a library id');
  const raw = await readFile(path.join(vaultPath, rel.split('/').join(path.sep)), 'utf8');
  let fm = {}; let body = raw;
  try { ({ data: fm, content: body } = matter(raw)); } catch { /* malformed — serve what we can */ }
  const item = itemOf({ file: path.basename(rel), fm, body });

  const pages = await vault.listPages();
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
  const me = pages.find((p) => p.id === id) || null;

  const grouped = { concept: [], entity: [], topic: [], source: [], other: [] };
  for (const label of item.links) {
    const p = byTitle.get(label.toLowerCase());
    if (!p || p.id === id) continue;
    const bucket = grouped[p.type] ? p.type : 'other';
    grouped[bucket].push({ id: p.id, title: p.title, type: p.type });
  }

  // pages that link INTO this one — where this source already echoes
  const backlinkPages = me
    ? pages.filter((p) => p.id !== id && p.links.some((l) => l.toLowerCase() === me.title.toLowerCase()))
        .map((p) => ({ id: p.id, title: p.title, type: p.type }))
    : [];

  // other sources sharing concepts — ranked by how much they overlap
  const myConcepts = new Set(grouped.concept.map((c) => c.title.toLowerCase()));
  const related = [];
  if (myConcepts.size) {
    for (const p of pages) {
      if (p.id === id || !p.id.startsWith('Wiki/Sources/')) continue;
      const shared = p.links.filter((l) => myConcepts.has(l.toLowerCase()));
      if (shared.length) related.push({ id: p.id, title: p.title, shared: [...new Set(shared)] });
    }
    related.sort((a, b) => b.shared.length - a.shared.length);
  }

  // the raw original (dossier or verbatim transcript) — size and a taste,
  // never the whole thing in this payload (a podcast raw can be 500k chars)
  let rawInfo = null;
  if (item.raw) {
    try {
      const rawText = await readFile(path.join(vaultPath, 'Raw', `${item.raw}.md`), 'utf8');
      rawInfo = { id: `Raw/${item.raw}`, chars: rawText.length, excerpt: rawText.slice(0, 400) };
    } catch { rawInfo = { id: `Raw/${item.raw}`, chars: null, excerpt: null, missing: true }; }
  }

  return { item: { ...item, links: undefined }, body, linked: grouped, backlinkPages, related: related.slice(0, 8), raw: rawInfo };
}
