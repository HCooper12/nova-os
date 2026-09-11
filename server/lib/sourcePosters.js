import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

export function posterKey(url) {
  const id = videoIdOf(url);
  if (!id) return null;
  // the id is already the identity; hash it only to keep the filename tame
  return createHash('sha1').update(id).digest('hex').slice(0, 16);
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
    // does not have, so a small body is a MISS wearing a hit's status code
    return buf.length > 3000 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// The poster for a source URL, or null when there is not one. Never throws.
export async function getSourcePoster(url) {
  const id = videoIdOf(url);
  if (!id) return null;                      // not a video we can name
  const key = posterKey(url);

  if (memo.has(key)) {
    const v = await memo.get(key);
    return v === MISS ? null : v;
  }

  const work = (async () => {
    const disk = await fromDisk(key);
    if (disk) return disk;
    // best frame first, then the one every video is guaranteed to have
    for (const variant of ['maxresdefault', 'hqdefault']) {
      const buf = await fetchThumb(`https://i.ytimg.com/vi/${id}/${variant}.jpg`);
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
