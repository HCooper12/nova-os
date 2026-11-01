// SHADOW MODE FOR THE EARS (2 Nov 2026). His 19 Oct yes to local ears came
// with a condition: measured against Groq on his REAL recordings before local
// becomes the default. A benchmark of synthesised clips cannot answer that;
// his car, his gym, his accent and his phone's mic can. So with
// NOVA_STT_PROVIDER=shadow every real spoken turn is heard twice, in
// parallel: Groq's text is the one Nova uses (nothing about his turn changes),
// and the local transcriber's text is only compared. One row per turn lands
// in server/data/voice/stt-shadow.jsonl, and scripts/sttShadowReport.mjs
// reads them back so he (or the next session) can decide on numbers.
//
// PRIVACY, by construction: a row never holds the audio and never holds the
// transcript. It holds counts, timings, the word error rate code computed,
// and the first 40 characters of each side, enough for him to see WHAT the
// worst disagreements were without the file becoming a diary of his voice.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
export const SHADOW_PATH = () => path.join(dataRoot(), 'voice', 'stt-shadow.jsonl');
export const MAX_ROWS = 2000;
export const HEAD_CHARS = 40;
// WER at or under this is "the same words" for a spoken command: one slip in
// ten words ("a" for "the") does not change what Nova would do.
export const AGREE_WER = 0.1;

// Words, compared as a person would hear them: case, punctuation and the
// apostrophe in "what's" do not make two transcripts different. Pure.
export function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

// WORD ERROR RATE of `hyp` against `ref`: (substitutions + deletions +
// insertions) / words in ref, by Levenshtein over words. Groq is the reference
// only because it is what Nova has used for five weeks, not because it is
// always right; a high WER says "they disagree", and the heads in the report
// say which one misheard. Both empty is agreement (0). Ref empty and hyp not
// is every hyp word inserted (WER = hyp words, so it can exceed 1). Pure.
export function wer(ref, hyp) {
  const r = words(ref);
  const h = words(hyp);
  if (!r.length) return h.length;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.round((prev[h.length] / r.length) * 1000) / 1000;
}

// The User-Agent -> which device he spoke on, from a closed set (the 17 Sep
// lesson: read receipts by device). Pure.
export function deviceFromUa(ua) {
  const s = String(ua || '');
  if (/iPhone/i.test(s)) return 'iPhone';
  if (/iPad/i.test(s)) return 'iPad';
  if (/Macintosh|Mac OS X/i.test(s)) return 'Mac';
  if (/Android/i.test(s)) return 'Android';
  return s ? 'other' : undefined;
}

const head = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, HEAD_CHARS);

// One comparison -> one row. Only what is named here is ever written: no
// field can carry the audio or the whole transcript through. Pure.
export function shadowRow({ groq, local, localError, device, source, bytes, backend } = {}) {
  const g = String(groq?.text ?? '');
  const row = {
    at: new Date().toISOString(),
    groqMs: Number.isFinite(groq?.ms) ? Math.round(groq.ms) : null,
    localMs: Number.isFinite(local?.ms) ? Math.round(local.ms) : null,
    groqChars: g.length,
    localChars: local ? String(local.text ?? '').length : null,
    wer: null,
    agree: false,
  };
  if (local && !localError) {
    row.wer = wer(g, local.text);
    row.agree = row.wer <= AGREE_WER;
    // the engine's own time on the audio, apart from the boot it may have paid
    if (Number.isFinite(local.seconds)) row.localEngineMs = Math.round(local.seconds * 1000);
    if (local.cold) row.cold = true;
  }
  if (localError) row.localError = String(localError).slice(0, 120);
  if (backend && backend !== 'groq') row.backend = String(backend).slice(0, 12); // the reference was OpenAI's, say so
  if (Number.isFinite(bytes)) row.bytes = Math.max(0, Math.round(bytes));
  if (device) row.device = String(device).slice(0, 12);
  if (source) row.source = String(source).slice(0, 16);
  row.groqHead = head(g);
  if (local && !localError) row.localHead = head(local.text);
  return row;
}

// APPEND, AND ROTATE AT MAX_ROWS. One writer at a time (the turns.json lesson:
// two writes in one tick raced on the same tmp file). At the cap the file
// becomes stt-shadow.1.jsonl (replacing the older one) and a fresh file
// starts, so it never grows past ~2 x 2,000 rows on his disk.
let chain = Promise.resolve();
export function appendShadowRow(row) {
  const run = chain.then(() => appendNow(row));
  chain = run.catch(() => {});
  return run;
}

async function appendNow(row) {
  const file = SHADOW_PATH();
  await mkdir(path.dirname(file), { recursive: true });
  let existing = '';
  try { existing = await readFile(file, 'utf8'); } catch { /* first row */ }
  const lines = existing.split('\n').filter(Boolean);
  if (lines.length >= MAX_ROWS) {
    await rename(file, file.replace(/\.jsonl$/, '.1.jsonl'));
    existing = '';
  }
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${existing}${JSON.stringify(row)}\n`);
  await rename(tmp, file);
}

// Shadow both and record: the caller already has Groq's result (that is what
// he gets); `localPromise` was started alongside it. Never throws and never
// delays his turn: it is awaited by nobody.
export function recordShadow({ groq, localPromise, device, source, bytes, backend }) {
  return Promise.resolve(localPromise)
    .then((local) => shadowRow({ groq, local, device, source, bytes, backend }), (e) => shadowRow({ groq, local: null, localError: e?.message || 'failed', device, source, bytes, backend }))
    .then((row) => appendShadowRow(row).then(() => row))
    .catch((e) => { console.log(`stt shadow row not written: ${e.message}`); return null; });
}

export async function readShadowRows({ includeRotated = false } = {}) {
  const read = async (f) => {
    try {
      return (await readFile(f, 'utf8')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  };
  const file = SHADOW_PATH();
  return [...(includeRotated ? await read(file.replace(/\.jsonl$/, '.1.jsonl')) : []), ...(await read(file))];
}

const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
};

// The numbers the decision turns on. Pure.
export function summarise(rows) {
  const compared = rows.filter((r) => Number.isFinite(r.wer));
  const groqMs = rows.map((r) => r.groqMs).filter(Number.isFinite);
  const localMs = compared.map((r) => r.localMs).filter(Number.isFinite);
  const warmLocal = compared.filter((r) => !r.cold).map((r) => r.localMs).filter(Number.isFinite);
  return {
    rows: rows.length,
    compared: compared.length,
    localErrors: rows.filter((r) => r.localError).length,
    groqMs: { median: quantile(groqMs, 0.5), p90: quantile(groqMs, 0.9) },
    localMs: { median: quantile(localMs, 0.5), p90: quantile(localMs, 0.9) },
    localWarmMs: { median: quantile(warmLocal, 0.5), p90: quantile(warmLocal, 0.9) },
    meanWer: compared.length ? Math.round((compared.reduce((a, r) => a + r.wer, 0) / compared.length) * 1000) / 1000 : null,
    agreement: compared.length ? Math.round((compared.filter((r) => r.agree).length / compared.length) * 1000) / 1000 : null,
    worst: [...compared].sort((a, b) => b.wer - a.wer).slice(0, 10),
  };
}
