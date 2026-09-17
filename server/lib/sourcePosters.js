import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoIdOf } from './ingest.js';

// REAL POSTERS for the Library shelf — the frame a video actually has,
// instead of a generated gradient standing in for one.
//
// Same contract as bookCovers.js, deliberately: fetched and cached SERVER
// SIDE, one fetch per video ever, a MISS cached as hard as a hit, and a 404
// when there is nothing — so the generated cover stays as the fallback and a
// missing poster degrades to something that still looks deliberate rather
// than to a broken image.
//
// Server-side matters for the same three reasons it did for jackets: his
// phone over Tailscale would pay the round trip on every shelf render, the
// posters would vanish offline, and what he watches would leak to a third
// party on every open.
//
// IDENTITY IS THE VIDEO ID, never the URL. `?si=` tails and youtu.be vs
// watch?v= are the same video, and the watch pipeline already learned that
// the expensive way — a URL-keyed cache would re-fetch the same poster
// under a dozen names.

const cacheDir = () => path.join(
  process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'),
  'posters',
);

const MISS = 'MISS';
const memo = new Map(); // videoId -> Buffer | 'MISS' | Promise

// WHOSE VIDEO IS THIS, and can we ask about it at all.
//
// 17 Sep 2026: three of his Library sources are Instagram reels, and all
// three answered 404 on every shelf render. `videoIdOf` is YouTube-only and
// must STAY that way — it is the identity the ingest pipeline scans vault
// files for (findExistingVideoPages), so widening it would quietly change
// what counts as "already have this" across the whole video rail. This
// module gets its own, broader identity instead, and touches nothing else.
//
// THE ALLOWLIST IS A SECURITY BOUNDARY, not tidiness. This resolver is
// reachable from an HTTP query parameter and it SHELLS OUT. Handing yt-dlp
// an arbitrary caller-supplied URL would make his Mac fetch anything anyone
// could name. Only hosts whose shape we can parse get that far.
const SOURCES = [
  { kind: 'yt', test: (u) => videoIdOf(u), host: null },
  { kind: 'ig', host: /(^|\.)instagram\.com$/i, test: (u) => (String(u).match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/) || [])[1] },
  { kind: 'tt', host: /(^|\.)tiktok\.com$/i, test: (u) => (String(u).match(/\/video\/(\d{6,})/) || [])[1] },
  { kind: 'vm', host: /(^|\.)vimeo\.com$/i, test: (u) => (String(u).match(/vimeo\.com\/(?:video\/)?(\d{6,})/) || [])[1] },
];

// { kind, id } or null. The id is the stable part of the URL and nothing
// else: a reel arrives as ?stkn=… one day and ?igsi=… the next, and a
// URL-keyed cache would fetch the same poster twice under two names — the
// exact mistake the watch pipeline paid for once already.
export function posterIdentity(url) {
  const raw = String(url || '');
  if (!raw) return null;
  let host = '';
  try { host = new URL(raw).hostname; } catch { /* not a URL we can parse */ }
  for (const s of SOURCES) {
    if (s.host && !s.host.test(host)) continue;
    const id = s.test(raw);
    if (id) return { kind: s.kind, id };
  }
  return null;
}

export function posterKey(url) {
  const ident = posterIdentity(url);
  if (!ident) return null;
  // the identity is already the identity; hash it only to keep the filename
  // tame, and namespace it so a YouTube id and a reel code can never collide
  return createHash('sha1').update(`${ident.kind}:${ident.id}`).digest('hex').slice(0, 16);
}

// The thumbnail URL yt-dlp can name for a source we cannot address by
// pattern. Instagram's CDN path is signed and unguessable, so there is no
// i.ytimg.com equivalent to construct — one shell per video, ever, because
// the answer is then cached exactly as hard as a YouTube hit.
//
// The ORIGINAL url goes to yt-dlp, share token and all. Only the CACHE KEY is
// normalised: a reel he was sent privately is reachable with its token and
// not without it, and stripping it to be tidy would turn a hit into a miss.
export const deps = { ytdlp: process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp' };

function thumbUrlVia(tool, url, timeoutMs) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(tool, ['--skip-download', '--no-warnings', '--no-playlist',
        '--socket-timeout', '15', '--print', '%(thumbnail)s', url],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { resolve(null); return; }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      clearTimeout(timer);
      const first = out.split('\n').map((l) => l.trim()).find((l) => /^https:\/\//.test(l));
      resolve(first || null);
    });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

async function fromDisk(key) {
  const dir = cacheDir();
  try {
    return await readFile(path.join(dir, `${key}.jpg`));
  } catch { /* fall through */ }
  try {
    await readFile(path.join(dir, `${key}.miss`));
    return MISS;
  } catch {
    return null;
  }
}

async function toDisk(key, buf) {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  if (buf === MISS) await writeFile(path.join(dir, `${key}.miss`), '');
  else await writeFile(path.join(dir, `${key}.jpg`), buf);
}

async function fetchThumb(url, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // YouTube answers 200 with a 120x90 grey placeholder for a size a video
    // does not have, so a small body is a MISS wearing a hit's status code.
    // Harmless for the others: a real poster is never this small.
    return buf.length > 3000 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// The poster for a source URL, or null when there is not one. Never throws.
export async function getSourcePoster(url, { timeoutMs = 25_000 } = {}) {
  const ident = posterIdentity(url);
  if (!ident) return null;                   // not a source we can name
  const key = posterKey(url);

  if (memo.has(key)) {
    const v = await memo.get(key);
    return v === MISS ? null : v;
  }

  const work = (async () => {
    const disk = await fromDisk(key);
    if (disk) return disk;
    if (ident.kind === 'yt') {
      // YouTube's poster URL is constructible, so it stays shell-free: best
      // frame first, then the one every video is guaranteed to have.
      for (const variant of ['maxresdefault', 'hqdefault']) {
        const buf = await fetchThumb(`https://i.ytimg.com/vi/${ident.id}/${variant}.jpg`);
        if (buf) { await toDisk(key, buf); return buf; }
      }
    } else {
      const thumb = await thumbUrlVia(deps.ytdlp, String(url), timeoutMs);
      const buf = thumb ? await fetchThumb(thumb, 12_000) : null;
      if (buf) { await toDisk(key, buf); return buf; }
    }
    await toDisk(key, MISS);
    return MISS;
  })();

  memo.set(key, work);
  const v = await work;
  memo.set(key, v);
  return v === MISS ? null : v;
}

// test hook
export function _resetPosters() { memo.clear(); }
