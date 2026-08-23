import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// REAL BOOK JACKETS for the Library shelf, from Open Library (free, no key).
//
// The generated gradient cover stays the fallback and is never removed: a
// jacket that can't be found must degrade to something that still looks
// deliberate, not a broken image. So this answers 404 when there is no
// jacket, and the client keeps what it already drew.
//
// Fetched and cached SERVER-SIDE on purpose. The page never talks to
// openlibrary.org — his phone over Tailscale would pay that round trip on
// every shelf render, the covers would vanish offline, and the reading list
// would leak to a third party on every open. One fetch per book, ever.
//
// A negative result is cached too: without it, a book with no jacket would
// re-hit the network on every single shelf render forever.

const cacheDir = () => path.join(
  process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'),
  'covers',
);

const MISS = 'MISS';
const memo = new Map(); // key -> Buffer | 'MISS' | Promise

export function coverKey(title, author) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return createHash('sha1').update(`${norm(title)}|${norm(author)}`).digest('hex').slice(0, 16);
}

async function fromDisk(key) {
  const dir = cacheDir();
  try {
    const buf = await readFile(path.join(dir, `${key}.jpg`));
    return buf.length ? buf : MISS;
  } catch { /* not cached yet */ }
  try {
    await readFile(path.join(dir, `${key}.miss`));
    return MISS;
  } catch { return null; }
}

async function toDisk(key, buf) {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true }).catch(() => {});
  if (buf === MISS) await writeFile(path.join(dir, `${key}.miss`), '', 'utf8').catch(() => {});
  else await writeFile(path.join(dir, `${key}.jpg`), buf).catch(() => {});
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

// Returns a Buffer, or null when there is no jacket for this book.
export async function getBookCover(title, author) {
  if (!String(title || '').trim()) return null;
  const key = coverKey(title, author);
  const hit = memo.get(key);
  if (hit) return hit === MISS ? null : (hit instanceof Promise ? hit : hit);

  const onDisk = await fromDisk(key);
  if (onDisk) {
    memo.set(key, onDisk);
    return onDisk === MISS ? null : onDisk;
  }

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
    const value = buf || MISS;
    memo.set(key, value);
    await toDisk(key, value);
    return buf;
  })();
  memo.set(key, work);
  return work;
}
