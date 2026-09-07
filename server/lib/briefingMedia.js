// VISUALS FOR THE BRIEFING — images and clips, sourced honestly, cached
// before playback, served from Nova's own origin.
//
// Two rules from design/BRIEFING-PLAN.md:
//   - A beat with no honest image gets no image. Nothing here invents a
//     diagram or reaches for a decorative stock photo; a miss falls back to
//     the typographic glass (the term or the heading), which is never wrong.
//   - Media is fetched and cached BEFORE the briefing is marked ready, so a
//     briefing never buffers mid-sentence. Same fetch → disk → serve-from-own-
//     origin shape as bookCovers.js, for the same three reasons (a shelf that
//     never leaks, never vanishes offline, never re-fetches).
//
// Sources, in order:
//   1. Wikimedia Commons — no key, properly licensed, and genuinely strong for
//      the scientific diagrams a briefing tends to want (a spectrum, a
//      circadian curve, an anatomy plate). Every hit carries its credit.
//   2. The og:image of a page the research already CITED — on-topic by
//      construction, and a page Nova has already read.
//   3. For clips: the same yt-dlp search exerciseVideos.js uses, generalised,
//      with the result cached — a search that re-shells yt-dlp on every open
//      is the thing that would make this slow.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const YTDLP = process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp';
const UA = 'NovaOS/1.0 (personal assistant; contact: local)';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const mediaDir = () => path.join(dataRoot(), 'briefing-media');

export const keyOf = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 20);
const KEY_RE = /^[a-f0-9]{20}$/;

// injectable for tests — every network call goes through here
export const deps = {
  fetch: (url, opts) => fetch(url, opts),
  ytdlp: YTDLP,
};

async function timedFetch(url, ms, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await deps.fetch(url, { ...opts, signal: ctl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

/* ------------------------------- images ---------------------------------- */

// Wikimedia Commons file search. Returns the best hit's large thumbnail plus
// the credit line the licence asks for, or null when nothing fits.
export async function searchWikimedia(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '6',
    gsrsearch: `${q} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '1200',
  });
  const res = await timedFetch(`https://commons.wikimedia.org/w/api.php?${params}`, 8000);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  return pickWikimedia(pages);
}

// pure, so the choice is testable: prefer real photos/diagrams over icons,
// skip SVG (renders unpredictably as a bitmap thumb) and tiny files
export function pickWikimedia(pages) {
  // A diagram labelled in a script he cannot read is on-topic and useless: the
  // first live run put a Chinese-labelled rod/cone chart on the glass. Files
  // whose title or description carry CJK/Cyrillic/Arabic text rank behind
  // ones that do not; they still win when nothing else fits.
  const foreign = (p) => /[\u3000-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/.test(`${p.title || ''} ${p.imageinfo?.[0]?.extmetadata?.ImageDescription?.value || ''}`);
  const good = pages
    .map((p) => ({ p, info: p.imageinfo?.[0] }))
    .filter(({ info }) => info && /^image\/(jpeg|png|webp)$/.test(info.mime || '') && (info.width || 0) >= 400)
    .sort((a, b) => (foreign(a.p) - foreign(b.p)) || (b.p.index != null && a.p.index != null ? a.p.index - b.p.index : 0));
  const hit = good[0];
  if (!hit) return null;
  const meta = hit.info.extmetadata || {};
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const artist = strip(meta.Artist?.value);
  const license = strip(meta.LicenseShortName?.value);
  return {
    url: hit.info.thumburl || hit.info.url,
    pageUrl: hit.info.descriptionurl || null,
    title: strip(hit.p.title).replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    credit: [artist, license].filter(Boolean).join(' · ') || 'Wikimedia Commons',
    description: strip(meta.ImageDescription?.value).slice(0, 200),
  };
}

// the og:image of a page — the picture its own author chose to represent it
export function parseOgImage(html, baseUrl) {
  const m = String(html || '').match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)
    || String(html || '').match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i);
  if (!m) return null;
  try { return new URL(m[1], baseUrl).toString(); } catch { return null; }
}

export async function ogImageOf(pageUrl) {
  try {
    const res = await timedFetch(pageUrl, 7000, { headers: { Accept: 'text/html' } });
    if (!res.ok) return null;
    // only the head matters and pages can be huge — read a bounded slice
    const reader = res.body?.getReader?.();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      while (html.length < 200_000) {
        const { value, done } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
    } else {
      html = (await res.text()).slice(0, 200_000);
    }
    return parseOgImage(html, pageUrl);
  } catch { return null; }
}

// fetch → disk. Returns { key, ext } or null. A miss is cached too.
const memo = new Map();
export async function cacheImage(url) {
  const key = keyOf(url);
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    const dir = mediaDir();
    for (const ext of ['jpg', 'png', 'webp']) {
      try { await readFile(path.join(dir, `${key}.${ext}`)); return { key, ext }; } catch { /* next */ }
    }
    try { await readFile(path.join(dir, `${key}.miss`)); return null; } catch { /* not a known miss */ }
    let got = null;
    try {
      const res = await timedFetch(url, 12000);
      const type = res.headers.get('content-type') || '';
      const ext = /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /jpe?g/.test(type) ? 'jpg' : null;
      if (res.ok && ext) {
        const buf = Buffer.from(await res.arrayBuffer());
        // a 1x1 placeholder or a broken body is not an image
        if (buf.length > 3000 && buf.length < 12_000_000) {
          await mkdir(dir, { recursive: true });
          await writeFile(path.join(dir, `${key}.${ext}`), buf);
          got = { key, ext };
        }
      }
    } catch { /* network trouble — not cached as a miss */ return null; }
    if (!got) { await mkdir(dir, { recursive: true }).catch(() => {}); await writeFile(path.join(dir, `${key}.miss`), '').catch(() => {}); }
    return got;
  })();
  memo.set(key, p);
  const out = await p;
  memo.set(key, out);
  return out;
}

export async function readCached(key) {
  if (!KEY_RE.test(String(key))) return null;
  const dir = mediaDir();
  for (const ext of ['jpg', 'png', 'webp']) {
    try {
      const buf = await readFile(path.join(dir, `${key}.${ext}`));
      return { buf, type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` };
    } catch { /* next */ }
  }
  return null;
}

// One image hint → one cached, credited visual, or null.
export async function resolveImage(hint, { sources = [] } = {}) {
  const query = String(hint?.query || '').trim();
  if (!query) return null;
  // 1 — Commons
  try {
    const w = await searchWikimedia(query);
    if (w?.url) {
      const c = await cacheImage(w.url);
      if (c) return { kind: 'image', key: c.key, ext: c.ext, caption: hint.caption || w.description || w.title, credit: w.credit, sourceUrl: w.pageUrl };
    }
  } catch { /* fall through */ }
  // 2 — a cited page's own picture, preferring one whose title shares a word
  const words = query.toLowerCase().split(/\W+/).filter((x) => x.length > 3);
  const ranked = [...sources].sort((a, b) => score(b, words) - score(a, words)).slice(0, 3);
  for (const s of ranked) {
    try {
      const og = await ogImageOf(s.url);
      if (!og) continue;
      const c = await cacheImage(og);
      if (c) return { kind: 'image', key: c.key, ext: c.ext, caption: hint.caption || s.title, credit: hostOf(s.url), sourceUrl: s.url };
    } catch { /* next */ }
  }
  return null;
}
const score = (s, words) => words.reduce((n, w) => n + (String(s.title || '').toLowerCase().includes(w) ? 1 : 0), 0);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };

/* -------------------------------- clips ---------------------------------- */

// pure: pick the clip worth showing. Between one and forty minutes (under a
// minute is a Short with no substance; over forty is a lecture he did not
// ask for), and the most words of the query in its title.
export function pickClip(rows, query) {
  const words = String(query || '').toLowerCase().split(/\W+/).filter((x) => x.length > 3);
  const scored = rows
    .filter((r) => r.id && r.durationS >= 60 && r.durationS <= 40 * 60)
    .map((r) => ({ r, s: words.reduce((n, w) => n + (r.title.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .sort((a, b) => b.s - a.s || a.r.durationS - b.r.durationS);
  return scored[0]?.r || null;
}

export function parseYtRows(out) {
  return String(out || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [id, channel, dur, ...title] = l.split('|');
    return { id, channel, durationS: Number(dur) || 0, title: title.join('|') };
  });
}

const clipCacheFile = (key) => path.join(mediaDir(), `clip-${key}.json`);

export async function searchClip(query, { timeoutMs = 60_000 } = {}) {
  const q = String(query || '').trim();
  if (!q) return null;
  const key = keyOf(`clip|${q.toLowerCase()}`);
  try {
    const cached = JSON.parse(await readFile(clipCacheFile(key), 'utf8'));
    if (cached && Date.now() - (cached.at || 0) < 7 * 86_400_000) return cached.clip;
  } catch { /* not cached */ }
  const clip = await new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(deps.ytdlp, [`ytsearch6:${q}`, '--skip-download', '--no-warnings', '--print', '%(id)s|%(channel)s|%(duration)s|%(title)s'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return resolve(null); }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => { clearTimeout(timer); resolve(pickClip(parseYtRows(out), q)); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
  });
  await mkdir(mediaDir(), { recursive: true }).catch(() => {});
  await writeFile(clipCacheFile(key), JSON.stringify({ at: Date.now(), clip }), 'utf8').catch(() => {});
  return clip;
}

export async function resolveClip(hint) {
  const clip = await searchClip(hint?.query);
  if (!clip) return null;
  // its poster is cached too, so the rail shows a frame that is Nova's own
  const poster = await cacheImage(`https://i.ytimg.com/vi/${clip.id}/hqdefault.jpg`).catch(() => null);
  return { kind: 'clip', videoId: clip.id, title: clip.title, channel: clip.channel, durationS: clip.durationS, posterKey: poster?.key || null, caption: hint.caption || clip.title };
}

/* ------------------------------ the enricher ------------------------------ */

// Resolves every beat's hint in a bounded pool. A hint that resolves to
// nothing is simply dropped — the typographic glass stands in, and the
// briefing is marked ready either way. Never throws.
export async function enrichVisuals(briefing, { concurrency = 3, resolvers = { image: resolveImage, clip: resolveClip } } = {}) {
  const jobs = [];
  for (const s of briefing.sections || []) {
    for (const b of s.beats || []) {
      if (b && typeof b === 'object' && b.hint?.kind) jobs.push(b);
    }
  }
  if (!jobs.length) return briefing;
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const b = jobs[i++];
      try {
        const fn = resolvers[b.hint.kind];
        const v = fn ? await fn(b.hint, { sources: briefing.sources || [] }) : null;
        if (v) b.visual = v;
      } catch { /* this beat keeps its typographic glass */ }
      delete b.hint;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return briefing;
}
