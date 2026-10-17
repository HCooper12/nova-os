import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// REAL BOOK JACKETS for the Library shelf, from Open Library (free, no key).
//
// The generated gradient cover stays the fallback and is never removed: a
// jacket that can't be found must degrade to something that still looks
// deliberate, not a broken image. So this answers 404 (a fresh miss, or
// never looked up before) or 204 (a miss the cache already knows about) and
// the client keeps what it already drew either way.
//
// Fetched and cached SERVER-SIDE on purpose. The page never talks to
// openlibrary.org — his phone over Tailscale would pay that round trip on
// every shelf render, the covers would vanish offline, and the reading list
// would leak to a third party on every open. One fetch per book, ever.
//
// A negative result is cached too, in one small bounded JSON file rather
// than a `.miss` file per book (18 Oct 2026 ledger: "The Next Conversation"
// alone 404'd 381 times in 14 days because the OLD per-book `.miss` file
// never expired — a retitled edition or a catalogue that later picks the
// jacket up would be denied forever). A miss is remembered for 7 days, then
// retried; at most 500 are kept, oldest dropped first, so a long reading
// list can never grow this file without bound.

const cacheDir = () => path.join(
  process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'),
  'covers',
);

const memo = new Map(); // key -> Buffer | Promise<Buffer|null>

export function coverKey(title, author) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return createHash('sha1').update(`${norm(title)}|${norm(author)}`).digest('hex').slice(0, 16);
}

const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_MISSES = 500;
const missesPath = () => path.join(cacheDir(), 'misses.json');

let missesLoaded = null; // key -> missedAtMs, loaded lazily and kept in memory
async function loadMisses() {
  if (missesLoaded) return missesLoaded;
  try {
    const raw = JSON.parse(await readFile(missesPath(), 'utf8'));
    missesLoaded = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    missesLoaded = {};
  }
  return missesLoaded;
}

// One writer at a time, its own tmp name — the same race `voiceTurns.js`
// paid for (two renames of the same `.tmp` name).
let writingMisses = Promise.resolve();
let tmpCounter = 0;
async function saveMisses(map) {
  const job = writingMisses.then(async () => {
    const dir = cacheDir();
    await mkdir(dir, { recursive: true }).catch(() => {});
    const tmp = `${missesPath()}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`;
    await writeFile(tmp, JSON.stringify(map), 'utf8');
    await rename(tmp, missesPath());
  });
  writingMisses = job.then(() => {}, () => {});
  return job;
}

// true when `key` missed recently enough that the provider must not be
// asked again; false for "never looked up" or "the 7 days have passed".
async function isCachedMiss(key, now = Date.now()) {
  const misses = await loadMisses();
  const at = misses[key];
  return typeof at === 'number' && (now - at) < MISS_TTL_MS;
}

async function recordMiss(key, now = Date.now()) {
  const misses = await loadMisses();
  misses[key] = now;
  const keys = Object.keys(misses);
  if (keys.length > MAX_MISSES) {
    // oldest miss first — a book that keeps missing is exactly the one
    // that should fall out first and get a fresh chance eventually
    for (const k of keys.sort((a, b) => misses[a] - misses[b]).slice(0, keys.length - MAX_MISSES)) {
      delete misses[k];
    }
  }
  await saveMisses(misses);
}

async function fromDisk(key) {
  const dir = cacheDir();
  try {
    const buf = await readFile(path.join(dir, `${key}.jpg`));
    return buf.length ? buf : null;
  } catch { return null; }
}

async function toDisk(key, buf) {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeFile(path.join(dir, `${key}.jpg`), buf).catch(() => {});
}

// Open Library resets connections from Node intermittently — measured at
// roughly one failure in three, while curl to the same URL succeeded. So
// every call is retried. Crucially, a NETWORK failure is not the same
// answer as "this book has no jacket": swallowing one as the other would
// cache a transient reset and deny that book a cover permanently. Network
// trouble THROWS here (never cached); only a genuine "no cover in the
// catalogue" returns null (cached).
async function fetchRetry(url, timeoutMs, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'NovaOS/1.0 (personal library)' },
      });
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

// Open Library's search, then its cover service. Both are plain public
// endpoints; a slow answer must never hold the shelf, so every call is
// time-boxed.
async function lookup(title, author) {
  const q = new URLSearchParams({ title: String(title || ''), limit: '1', fields: 'cover_i' });
  if (author) q.set('author', String(author));
  const res = await fetchRetry(`https://openlibrary.org/search.json?${q}`, 6000);
  if (!res.ok) return null;
  const data = await res.json();
  const id = data?.docs?.[0]?.cover_i;
  if (!id) return null; // a real answer: the catalogue has no jacket for this
  const img = await fetchRetry(`https://covers.openlibrary.org/b/id/${id}-L.jpg`, 8000);
  if (!img.ok) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  // Open Library answers 200 with a 1x1 placeholder when it has nothing —
  // treat a tiny body as "no jacket" rather than shipping a blank tile
  if (buf.length < 2000) return null;
  return buf;
}

// { buf: Buffer|null, cachedMiss: boolean }. `cachedMiss` is true only when
// the answer came from the 7-day negative cache without touching the
// provider — that's the signal the route uses to answer 204 instead of 404,
// and the thing this whole cache exists to make true.
export async function getBookCoverResult(title, author) {
  if (!String(title || '').trim()) return { buf: null, cachedMiss: false };
  const key = coverKey(title, author);

  const hit = memo.get(key);
  if (hit) return { buf: hit instanceof Promise ? await hit : hit, cachedMiss: false };

  const onDisk = await fromDisk(key);
  if (onDisk) {
    memo.set(key, onDisk);
    return { buf: onDisk, cachedMiss: false };
  }

  if (await isCachedMiss(key)) return { buf: null, cachedMiss: true };

  const work = (async () => {
    let buf = null;
    try {
      buf = await lookup(title, author);
    } catch {
      // network trouble, NOT "no jacket" — forget this attempt entirely so a
      // later render tries again rather than inheriting a false permanent miss
      memo.delete(key);
      return null;
    }
    if (buf) {
      memo.set(key, buf);
      await toDisk(key, buf);
    } else {
      memo.delete(key);
      await recordMiss(key);
    }
    return buf;
  })();
  memo.set(key, work);
  return { buf: await work, cachedMiss: false };
}

// Back-compat convenience: a Buffer, or null when there is no jacket.
export async function getBookCover(title, author) {
  return (await getBookCoverResult(title, author)).buf;
}

// test hook
export function _resetCoversForTest() { memo.clear(); missesLoaded = null; }
