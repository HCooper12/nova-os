import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normWords } from './reviewQuote.js';

// THE SAME WORDS TWICE (Mentors, part 2, 21 Nov 2026). Pure code, no model:
// a creator re-cuts his own material (clips of an episode, two-hour
// compilations of several), and paying to read the same hour twice would also
// make "in N videos" counts lie. On 21 Nov, 130 of Fisher's 236 long videos
// had no podcast twin, 40 of those over 80 minutes.
//
// A transcript's signature is a sample of its 8-word runs: every run is
// hashed (32-bit FNV-1a) and the hashes divisible by 16 are kept. The sample
// is content-defined, so the same passage in two files keeps the same hashes
// wherever it sits. A source whose kept hashes are 85% or more present in
// the others is a repeat.

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const sigDir = () => path.join(dataRoot(), 'mentors', 'signatures');
const sigPath = (key) => path.join(sigDir(), `${String(key).replace(/:/g, '_')}.i32`);

export const RUN_WORDS = 8;
export const SAMPLE_MOD = 16;
export const REPEAT_SHARE = 0.85;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0; // signed, so it fits an Int32Array as is
}

/** Text -> sorted, unique Int32Array of sampled 8-word-run hashes. Time
 *  marks, case and punctuation do not change it. */
export function signature(text) {
  const words = normWords(String(text || '').replace(/\[[^\]]*\]/g, ' '));
  const set = new Set();
  for (let i = 0; i + RUN_WORDS <= words.length; i++) {
    const h = fnv1a(words.slice(i, i + RUN_WORDS).join(' '));
    if ((h >>> 0) % SAMPLE_MOD === 0) set.add(h);
  }
  return Int32Array.from([...set].sort((a, b) => a - b));
}

export async function saveSignature(key, sig) {
  await mkdir(sigDir(), { recursive: true });
  const file = sigPath(key);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, Buffer.from(sig.buffer, sig.byteOffset, sig.byteLength));
  await rename(tmp, file);
}

/** The saved signature, or null when there is none. */
export async function loadSignature(key) {
  let buf;
  try { buf = await readFile(sigPath(key)); } catch { return null; }
  const out = new Int32Array(Math.floor(buf.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt32LE(i * 4);
  return out;
}

/** Share of `sig`'s hashes present in `set` (a Set of hashes); empty is 0. */
export function containment(sig, set) {
  if (!sig || !sig.length) return 0;
  let n = 0;
  for (const h of sig) if (set.has(h)) n += 1;
  return n / sig.length;
}

/**
 * items [{ key, durationSec, sig }] -> [{ key, share, of: [up to 3 keys, most
 * overlap first] }]. Longest first (a compilation is judged before the
 * episodes it is made of, so the episodes stay and the compilation goes);
 * each against every OTHER item not already marked. Ties in length break by
 * key, so of two identical items the later one in the walk is the repeat.
 */
export function findRepeats(items) {
  const list = (items || []).filter((x) => x && x.key).slice()
    .sort((a, b) => (Number(b.durationSec) || 0) - (Number(a.durationSec) || 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const sets = new Map(list.map((x) => [x.key, new Set(x.sig || [])]));
  const marked = new Set();
  const out = [];
  for (const item of list) {
    if (!item.sig || !item.sig.length) continue;
    const union = new Set();
    for (const other of list) {
      if (other.key === item.key || marked.has(other.key)) continue;
      for (const h of sets.get(other.key)) union.add(h);
    }
    const share = containment(item.sig, union);
    if (share < REPEAT_SHARE) continue;
    // a twin of the same length not walked yet: the one walked first is kept
    // and the twin is marked when its turn comes
    const pos = list.indexOf(item);
    const twinAhead = list.slice(pos + 1).some((o) => (Number(o.durationSec) || 0) === (Number(item.durationSec) || 0)
      && containment(item.sig, sets.get(o.key)) >= REPEAT_SHARE && containment(o.sig, sets.get(item.key)) >= REPEAT_SHARE);
    if (twinAhead) continue;
    marked.add(item.key);
    const of = list
      .filter((o) => o.key !== item.key && !marked.has(o.key))
      .map((o) => ({ key: o.key, n: containment(item.sig, sets.get(o.key)) }))
      .filter((o) => o.n > 0)
      .sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1))
      .slice(0, 3)
      .map((o) => o.key);
    out.push({ key: item.key, share: Math.round(share * 1000) / 1000, of });
  }
  return out;
}
