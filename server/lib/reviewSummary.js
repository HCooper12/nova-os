import { spawn as nodeSpawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { modelFor, laneOffError, laneEnabled } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { registerJobMap } from './jobRegistry.js';
import { parseEnvelope } from './modelSpend.js';
import { NOVA_LENS } from './lens.js';

// THE DAILY REVIEW'S STRUCTURED SUMMARY (mockup 98, his calls 11 Oct 2026).
//
// The model INTERPRETS; this file VALIDATES and the client RENDERS. The
// model returns one JSON object:
//   { synthesis, provenance, origin|null, keyPoints:[{term,line}], reflection }
// and validateReviewSummary() either accepts it field by field or rejects it
// whole. A rejected object is never patched into a fake structure: the card
// falls back to the plain note summary (noteSummaries.js), honestly.
//
// STANDING RULES (his, 11 Oct 2026). Change them with him, not here alone;
// design/NOVA-METHOD.md "Daily review summary" carries the same list.
//   A. Provenance is set apart from the summary. Who said it, and where, is
//      a quiet secondary line; the synthesis is the idea, in Nova's voice.
//   B. Origin of the idea. When the source text says where the concept
//      itself came from, name it. Only what the text says; never invented.
//      Code checks the named origin against the input and drops it when it
//      is not grounded there.
//   C. Structured, not a paragraph, in the full view: what it is, the key
//      terms in bold each on its own line, where it came from, then the
//      reflection.
//   D. A closing reflection that applies the idea to HIS life, grounded in
//      what Nova really reads about him (the Journal "My life" sources).
//      Never generic. Cached with the summary.
//   E. Short at a glance: the Home card shows the concept, a 2 to 3
//      sentence synthesis, the provenance line, at most one connection
//      line, and two actions plus "···".
// And: minutes into a source come ONLY from the page's own recorded source
// time. The model is never asked for a time and may not state one; code
// strips any it writes and adds the real one.
//
// Written once per concept and rewritten only when the concept page changes:
// cached in server/data/review-summaries, keyed by a hash of the page body.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'review-summaries');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = registerJobMap('reviewSummary', new Map());

export const LIMITS = { synthesis: 480, provenance: 160, origin: 200, term: 48, line: 220, reflection: 280, minPoints: 1, maxPoints: 5 };

export const bodyHash = (text) => createHash('sha1').update(String(text || '')).digest('hex');
const cacheFile = (pageId) => path.join(CACHE_DIR(), `${createHash('sha1').update(String(pageId)).digest('hex').slice(0, 16)}.json`);

/* ------------------------------ validation ------------------------------ */

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// any minutes or timecode claim, wherever the model put it
const MINUTES_RE = /,?\s*(?:about\s+|around\s+|some\s+)?\b\d{1,3}\s*(?:minutes?|mins?)\b(?:\s+(?:in|into)\b(?:\s+[^,.;]*)?)?|\s*(?:at\s+)?\b\d{1,2}:\d{2}(?::\d{2})?\b/gi;
export function stripMinutes(text) {
  return clean(String(text || '').replace(MINUTES_RE, '').replace(/\(\s*\)/g, '').replace(/\s+([,.;])/g, '$1').replace(/,\s*$/, ''));
}

// "65:39" -> 65; "1:05:39" -> 65; anything else -> null
export function minutesFromTime(time) {
  const p = String(time || '').trim().split(':').map(Number);
  if (p.length < 2 || p.some((n) => !Number.isFinite(n))) return null;
  return Math.floor(p.reduce((a, n) => a * 60 + n, 0) / 60);
}

// Is this origin really in the input? Every capitalised name in it must
// appear in the source text; with no names, most of its longer words must.
// A model that "knows" where an idea came from but read it nowhere is dropped.
export function originGrounded(origin, inputText) {
  const hay = String(inputText || '').toLowerCase();
  if (!origin || !hay) return false;
  const words = origin.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
  const names = words.slice(1).filter((w) => /^\p{Lu}/u.test(w) && w.length >= 3);
  if (names.some((n) => !hay.includes(n.toLowerCase()))) return false;
  if (names.length) return true;
  const long = words.filter((w) => w.length >= 5).map((w) => w.toLowerCase());
  if (!long.length) return false;
  return long.filter((w) => hay.includes(w)).length / long.length >= 0.6;
}

// Strict: { ok:true, value } or { ok:false, reason }. `input` is what the
// model was given: { text, sourceTime }.
export function validateReviewSummary(raw, input = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not an object' };
  const synthesis = stripMinutes(raw.synthesis);
  if (!synthesis || synthesis.length > LIMITS.synthesis) return { ok: false, reason: 'synthesis missing or too long' };
  if (synthesis.split(/(?<=[.!?])\s+/).filter(Boolean).length > 3) return { ok: false, reason: 'synthesis over three sentences' };
  if (!Array.isArray(raw.keyPoints)) return { ok: false, reason: 'keyPoints missing' };
  const keyPoints = [];
  for (const k of raw.keyPoints) {
    const term = clean(k?.term).replace(/^\*+|\*+$/g, '').replace(/:$/, '');
    const line = stripMinutes(k?.line);
    if (!term || !line || term.length > LIMITS.term || line.length > LIMITS.line) return { ok: false, reason: 'a key point is malformed' };
    keyPoints.push({ term, line });
  }
  if (keyPoints.length < LIMITS.minPoints || keyPoints.length > LIMITS.maxPoints) return { ok: false, reason: 'keyPoints count out of range' };
  // provenance: optional, and never carries a time of its own
  const provenance = raw.provenance == null ? null : (stripMinutes(raw.provenance) || null);
  if (provenance && provenance.length > LIMITS.provenance) return { ok: false, reason: 'provenance too long' };
  // origin: optional, dropped (not fatal) when the input does not say it
  let origin = raw.origin == null ? null : (clean(raw.origin) || null);
  if (origin && (origin.length > LIMITS.origin || !originGrounded(origin, input.text))) origin = null;
  // reflection: optional; nothing rather than a generic line
  // Too long: keep the opening sentences that fit, or drop it. A long
  // reflection never costs him the whole summary (it did, first live run).
  let reflection = raw.reflection == null ? null : (clean(raw.reflection) || null);
  if (reflection && reflection.length > LIMITS.reflection) {
    let kept = '';
    for (const sentence of reflection.split(/(?<=[.!?])\s+/)) {
      const next = kept ? `${kept} ${sentence}` : sentence;
      if (next.length > LIMITS.reflection) break;
      kept = next;
    }
    reflection = kept || null;
  }
  const minutesIn = input.sourceTime ? minutesFromTime(input.sourceTime) : null;
  return { ok: true, value: { synthesis, provenance, minutesIn, sourceTime: minutesIn == null ? null : input.sourceTime, origin, keyPoints, reflection } };
}

/* -------------------------------- cache --------------------------------- */

export async function getCachedReviewSummary(pageId, body) {
  const file = cacheFile(pageId);
  if (!existsSync(file)) return null;
  try {
    const c = JSON.parse(await readFile(file, 'utf8'));
    return c.bodyHash === bodyHash(body) ? c.summary : null;
  } catch { return null; }
}
export async function writeCachedReviewSummary(pageId, body, summary) {
  await mkdir(CACHE_DIR(), { recursive: true });
  await writeFile(cacheFile(pageId), JSON.stringify({ bodyHash: bodyHash(body), summary, generatedAt: new Date().toISOString() }), 'utf8');
}

/* -------------------------------- prompt -------------------------------- */

export function buildReviewSummaryPrompt({ title, body, sourceTitle, sourceText, lifeFacts }) {
  return `${NOVA_LENS}

You are Nova, writing the Daily review card for one concept from Hayden's own wiki. Read the concept page and its source, then return ONE JSON object and nothing else:
{"synthesis": string, "provenance": string|null, "origin": string|null, "keyPoints": [{"term": string, "line": string}], "reflection": string|null}

His standing rules; break none:
- synthesis: 2 or 3 sentences, the idea itself in your own voice. No host, guest or show names here; those belong in provenance.
- provenance: one short line naming who put the idea and where (person, show or publication, episode), only as the page or source says it. NEVER mention minutes, a timestamp or a time; code adds the real one. null if the page names no source.
- origin: where the concept itself came from, ONLY if the text below says so (a tradition, an older text, a person the speakers credit). State that attribution plainly. If the text does not say, null. Never use your own knowledge.
- keyPoints: 1 to 5 entries; term is a short key term (2 to 4 words, no markdown), line is one plain sentence explaining it.
- reflection: one question or comment, under 40 words, that applies this idea to HIS life now, grounded in the facts about him below. Never generic. If the facts give nothing real to tie it to, null.
- No markdown, no code fences, no em dashes.

Concept: "${title}"
${String(body || '').slice(0, 5000)}
${sourceTitle ? `\nSource page "${sourceTitle}":\n${String(sourceText || '').slice(0, 3000)}` : '\n(No source page.)'}

What Nova really knows about him (use only these):
${lifeFacts || '(nothing readable today)'}`;
}

/* --------------------------------- job ---------------------------------- */

let spawnImpl = nodeSpawn;
export function _setSpawnForTests(fn) { spawnImpl = fn || nodeSpawn; }

// input: { pageId, title, body, sourceTitle, sourceText, sourceTime, lifeFacts }
export function startReviewSummaryJob(input) {
  if (!laneEnabled('note-summary')) throw laneOffError('note-summary');
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);
  const child = spawnImpl(CLAUDE_BIN, [
    '-p', buildReviewSummaryPrompt(input),
    '--permission-mode', 'bypassPermissions',
    ...boundaryArgs(''),
    '--output-format', 'json',
    // pinned through the model board, the same lane as the note summary
    '--model', modelFor('note-summary'),
    '--no-session-persistence',
  ]);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    if (code !== 0) { job.status = 'error'; job.error = stderr.trim() || `claude exited with code ${code}`; return; }
    try {
      const outer = parseEnvelope(stdout, { lane: 'note-summary' });
      const m = firstBalancedObjectMatch(String(outer.result || '').trim());
      if (!m) throw new Error('no JSON object in the response');
      const v = validateReviewSummary(parseModelJson(m[0]), { text: `${input.body}\n${input.sourceText || ''}`, sourceTime: input.sourceTime });
      if (!v.ok) throw new Error(v.reason);
      await writeCachedReviewSummary(input.pageId, input.body, v.value);
      job.result = { summary: v.value };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = `Could not write a structured summary: ${e.message}`;
    }
  });
  child.on('error', (err) => { job.status = 'error'; job.error = err.message; });
  return jobId;
}
export function getReviewSummaryJob(jobId) { return jobs.get(jobId) || null; }

// Everything the model is handed, read for real: the page, its first source
// page, and the same life sources the Journal's "My life" prompt reads
// (minus the review topic itself). Loaders are injectable for tests.
export async function reviewSummaryInput(vaultPath, vault, pageId, loaders) {
  const page = await vault.getPage(pageId);
  const body = page.paragraphs.join('\n\n');
  const first = page.sources?.[0] || null;
  let sourceText = '';
  if (first) {
    const pages = await vault.listPages();
    const src = pages.find((p) => String(p.title).toLowerCase() === first.title.toLowerCase());
    sourceText = src ? src.paragraphs.join('\n\n') : '';
  }
  const { readLifeSources } = await import('./journalPrompt.js');
  const life = await readLifeSources(vaultPath, vault, { review: async () => null, ...(loaders || {}) });
  const lifeFacts = Object.values(life).filter(Boolean).map((s) => `${s.from}:\n${s.facts}`).join('\n');
  return { pageId, title: page.title, body, sourceTitle: first?.title || null, sourceText, sourceTime: first?.time || null, lifeFacts };
}
