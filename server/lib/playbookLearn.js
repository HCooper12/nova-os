import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { boundaryArgs } from './spawnBoundary.js';
import { modelFor, assertLaneOn, effortArgs } from './modelPrefs.js';
import { parseEnvelope } from './modelSpend.js';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { videoLinkKey, findExistingVideoPages } from './ingest.js';
import { fetchVideoTranscript, chunkTranscript, SINGLE_PASS_MAX_CHARS, CHUNK_CHARS } from './watcher.js';
import {
  listPlaybooks, findPlaybookFor, mergePlaybook, formatPlaybook, emptyPlaybook,
} from './playbooks.js';

// LEARN: watch it, learn what it teaches, and keep the METHOD as a playbook
// (his ask, 7 Nov 2026; the same method as the learn-from-video skill in
// Claude Code, built into Nova so his agents can apply it).
//
// Models interpret; code acts. The model reads a transcript and says, as JSON,
// what the method is. Code then checks every claim it can:
//   - a rule with no timestamp that is a real line of that transcript, and a
//     quoted phrase that really sits near that line, is DROPPED;
//   - a health, money or legal rule with no evidence given stays "stated";
//   - a short phrase to reuse must be in the transcript word for word;
//   - a passage lifted from the transcript is dropped (the verbatim transcript
//     never enters a Wiki page).
// One pending record carries the draft; his yes writes the page, undo takes it
// back. A link that cannot be read is reported with its real reason and the
// rest carry on. No budget cap and no wall clock on the model (his rule).

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
export const LEARN_LANE = 'playbook-learn';
export const MAX_LINKS = 10;
const POOL = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const watchDir = () => path.join(dataRoot(), 'watch');

/* ------------------------------- the links -------------------------------- */

const SPOTIFY = /(^|\.)spotify\.com$|(^|\.)spoti\.fi$/i;
export const SPOTIFY_WHY = 'Spotify does not let Nova read an episode. Send the YouTube or Apple Podcasts link, or a direct link to the audio, instead.';

export function cleanLinks(urls) {
  const links = [];
  const rejected = [];
  const seen = new Set();
  for (const raw of Array.isArray(urls) ? urls : []) {
    const url = String(raw || '').trim().replace(/[).,;\]]+$/, '');
    if (!url) continue;
    let host = '';
    try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error('scheme'); host = u.hostname; } catch {
      rejected.push({ url: url.slice(0, 200), why: 'that is not a web link' });
      continue;
    }
    if (url.length > 500) { rejected.push({ url: url.slice(0, 80), why: 'that link is too long to be right (500 characters at most)' }); continue; }
    const key = videoLinkKey(url) || url;
    if (seen.has(key)) continue;
    seen.add(key);
    if (SPOTIFY.test(host)) { rejected.push({ url, why: SPOTIFY_WHY }); continue; }
    links.push(url);
  }
  for (const url of links.slice(MAX_LINKS)) rejected.push({ url, why: `a batch takes ${MAX_LINKS} links at most; send this one in the next batch` });
  return { links: links.slice(0, MAX_LINKS), rejected };
}

/* ------------------------------ the transcript ---------------------------- */

const STAMP = /^\s*\[((?:\d+:)?\d{1,2}:\d{2})\]\s*(.*)$/;
export function stampToSec(s) {
  const t = String(s || '').trim();
  if (!/^(?:\d+:)?\d{1,2}:\d{2}$/.test(t)) return null;
  const p = t.split(':').map(Number);
  if (p.slice(1).some((x) => x > 59)) return null;
  return p.reduce((a, x) => a * 60 + x, 0);
}
export function secToStamp(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// "[00:05] words" lines into {sec, text}. Lines without a stamp are ignored:
// a rule can only point at a moment the transcript really marks.
export function parseTranscriptLines(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(STAMP);
    if (!m) continue;
    const sec = stampToSec(m[1]);
    if (sec !== null) out.push({ sec, text: m[2].trim() });
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const cachePathFor = (key) => path.join(watchDir(), `${String(key).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 120)}-transcript.json`);

// A transcript he already has costs nothing: the cache of an earlier learn,
// then a Raw/ page the Watcher or the weave filed, and only then the fetch.
export async function transcriptFor(vaultPath, url, workDir, { fetchReport = fetchVideoTranscript } = {}) {
  const key = videoLinkKey(url) || url;
  try {
    const cached = JSON.parse(await readFile(cachePathFor(key), 'utf8'));
    if (cached?.transcript && parseTranscriptLines(cached.transcript).length) return { ...cached, from: 'the transcript Nova already kept' };
  } catch { /* none cached */ }
  try {
    const existing = await findExistingVideoPages(vaultPath, url);
    if (existing.transcriptRel) {
      const raw = await readFile(path.join(vaultPath, existing.transcriptRel), 'utf8');
      const body = raw.includes('\n---\n') ? raw.slice(raw.indexOf('\n---\n') + 5) : raw;
      if (parseTranscriptLines(body).length >= 3) {
        const title = (existing.pages[0] || existing.transcriptRel).split('/').pop().replace(/\.md$/, '').replace(/ \(Transcript\)$/, '');
        return { title, uploader: '', transcript: body.trim(), from: `the transcript already in your vault (${existing.transcriptRel})` };
      }
    }
  } catch { /* fall through to the fetch */ }
  const report = await fetchReport(url, workDir);
  if (!report?.transcript) throw new Error('the link has no transcript, and no captions to read');
  const got = { title: report.title || url, uploader: report.uploader || '', transcript: report.transcript, from: `fetched now (${report.transcriptSource || 'captions'})` };
  if (parseTranscriptLines(got.transcript).length) {
    await mkdir(watchDir(), { recursive: true });
    await writeFile(cachePathFor(key), JSON.stringify({ title: got.title, uploader: got.uploader, transcript: got.transcript }), 'utf8').catch(() => {});
  }
  return got;
}

/* ------------------------------- the prompts ------------------------------ */

const SCHEMA = `{"topic":"the skill or task this improves, 2-5 words","summary":"one sentence: what following this playbook lets an agent do","triggers":["3-8 short lower-case phrases that should call this playbook, such as the task words he or an agent would use"],"agents":["all"],"when":["when to use it"],"method":["numbered steps, imperative, for an agent doing the task"],"rules":[{"text":"a rule with its threshold or condition, in your own words","kind":"stated|evidenced","evidence":"for evidenced only: the data or study the speaker gave, in your words; else empty","domain":"none|health|money|legal","needs":"the speaker's audience, scale or budget this rule depends on, or empty","source":1,"at":"m:ss or h:mm:ss, copied from a [stamp] in the transcript","quote":"3 to 10 words copied exactly from the transcript at or just after that stamp"}],"phrases":["exact wording worth reusing, 12 words or fewer, copied exactly from the transcript"],"mistakes":["common mistakes the speaker names"],"stops":["where this stops applying, who it does not fit"],"disagreements":["where the sources disagree, naming both and what each says; empty if none"]}`;

const METHOD_RULES = `Pull out the METHOD, not the content. Keep decisions, steps, rules with their thresholds, exact phrasing worth reusing, worked examples and common mistakes. Drop stories, sales pitches, the intro and anything that only sounds wise.
- Every rule carries "source", "at" and "quote". "at" is a [stamp] that really appears in the transcript. "quote" is copied exactly from the lines at or just after it. Code checks both and drops a rule that fails either, so do not guess a stamp.
- "stated" is the speaker's opinion or experience. "evidenced" only when the speaker gives data or names a study, and then "evidence" says what. A claim about health, money or law with no real evidence is "stated", whatever the speaker's confidence.
- A rule that only works at the speaker's audience size, price point, budget or body type carries that in "needs".
- Where two sources disagree, say so in "disagreements" and do not blend them into one rule.
- Paraphrase. Never copy a passage of the transcript into text. Short quoted phrases belong only in "phrases" and "quote".
- Write for an agent doing the task, short and in the imperative. Plain words, no em dashes. Hayden is the user; refer to him as "he" if you must.`;

export function buildExtractPrompt({ purpose, sources, existingTitles = [], part = null }) {
  return `You are the PLAYBOOK LEARNER inside Nova. Hayden dropped ${sources.length === 1 ? 'a video or podcast' : `${sources.length} videos or podcasts`} and wants the method kept as a playbook his agents will apply to a task. This is not a summary: the output must change how an agent does the work.

WHAT IT IS FOR: ${purpose ? `"${String(purpose).slice(0, 600)}"` : 'he did not say. Name the task the method most plainly improves, and say it in "topic".'}
${existingTitles.length ? `\nPLAYBOOKS HE HAS ALREADY (if this is the same topic, use that exact title as "topic" so the page is extended, never doubled):\n${existingTitles.map((t) => `- ${t}`).join('\n')}\n` : ''}
THE TRANSCRIPT${sources.length === 1 ? '' : 'S'}${part ? ` (part ${part.i} of ${part.n} of one long source; the stamps are real across parts)` : ''}. Read ${sources.length === 1 ? 'the file' : 'each file'} with the Read tool:
${sources.map((s) => `- source ${s.n}: ${s.file} (${s.title}${s.speaker ? `, ${s.speaker}` : ''})`).join('\n')}

${METHOD_RULES}

Output ONLY this JSON, no code fences, no commentary:
${SCHEMA}`;
}

export function buildSynthesisPrompt({ purpose, sources, extractionsFile, existingTitles = [] }) {
  return `You are the PLAYBOOK LEARNER inside Nova, merging what several reads of ${sources.length === 1 ? 'one long source' : `${sources.length} sources`} found into ONE playbook. The reads are in ${extractionsFile} (JSON, one per source or part). The transcripts are in:
${sources.map((s) => `- source ${s.n}: ${s.file} (${s.title}${s.speaker ? `, ${s.speaker}` : ''})`).join('\n')}

WHAT IT IS FOR: ${purpose ? `"${String(purpose).slice(0, 600)}"` : 'he did not say. Use the task the reads share.'}
${existingTitles.length ? `PLAYBOOKS HE HAS ALREADY (same topic: use the exact title): ${existingTitles.join('; ')}\n` : ''}
Merge rules that say the same thing into one. Keep every rule's "source", "at" and "quote" as the read gave them (you may open a transcript to check a stamp). Where sources disagree, do not blend: put both positions in "disagreements" and keep each source's rule with its own condition. Keep the order of the method sensible across sources.

${METHOD_RULES}

Output ONLY this JSON, no code fences, no commentary:
${SCHEMA}`;
}

/* ------------------------------ the model run ----------------------------- */

function runModel(prompt, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs('Read'),
      '--output-format', 'json',
      '--model', modelFor(LEARN_LANE),
      ...effortArgs(LEARN_LANE),
      '--no-session-persistence',
    ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const outer = parseEnvelope(stdout, { lane: LEARN_LANE, code, stderr });
        const m = firstBalancedObjectMatch(outer.result || '');
        if (!m) return reject(new Error((outer.result || '').slice(0, 200) || 'the playbook did not come back as JSON'));
        resolve(parseModelJson(m[0]));
      } catch (e) { reject(e); }
    });
  });
}

/* ------------------------------- validation ------------------------------- */

const SENSITIVE = /\b(calori\w*|macro\w*|protein|dose|dosage|\d+\s?(mg|mcg|iu)\b|supplement\w*|creatine|diet\w*|fasting|injur\w*|pain|medic\w*|symptom\w*|sleep|hormone\w*|testosterone|invest\w*|stocks?|shares?|crypto\w*|retire\w*|super(annuation)?|tax\w*|loan\w*|mortgage\w*|debt|interest rate|legal\w*|lawsuit\w*|contract\w*|liabilit\w*|lawyer\w*|copyright|trademark|visa)\b/i;
const DOMAINS = ['health', 'money', 'legal'];
const AGENTS = ['all', 'nova', 'coach', 'studio'];

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const strs = (v, { max = 300, cap = 20, min = 3 } = {}) => (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter((x) => x.length >= min).slice(0, cap);
const words = (s) => norm(s).split(' ').filter(Boolean);

// Is this item a stretch of the transcript lifted whole? Twelve words in a
// row that the transcript has too is a quotation, not a paraphrase.
function lifted(item, transcriptNorm) {
  const w = words(item);
  if (w.length < 14) return false;
  for (let i = 0; i + 12 <= w.length; i++) if (transcriptNorm.includes(w.slice(i, i + 12).join(' '))) return true;
  return false;
}

/**
 * The model's JSON into a playbook, or why not. `sources` is
 * [{n, title, speaker, url, lines:[{sec,text}], norm}]. Pure.
 * Returns { playbook, dropped:[{text, why}], notes:[...] }.
 */
export function validateLearn(raw, sources) {
  const dropped = [];
  const notes = [];
  const topic = str(raw?.topic, 70);
  if (topic.length < 3) throw new Error('the read did not name a topic, so there is nothing to file');
  const byN = new Map(sources.map((s) => [s.n, s]));

  const rules = [];
  const seen = new Set();
  for (const r of Array.isArray(raw?.rules) ? raw.rules : []) {
    const text = str(r?.text, 320);
    if (text.length < 8) continue;
    const drop = (why) => dropped.push({ text: text.slice(0, 120), why });
    const src = byN.get(Number(r?.source));
    if (!src) { drop('it named a source that was not read'); continue; }
    const sec = stampToSec(String(r?.at || '').replace(/[[\]]/g, ''));
    if (sec === null) { drop('it had no timestamp'); continue; }
    const idx = src.lines.findIndex((l) => l.sec === sec);
    if (idx === -1) { drop(`${secToStamp(sec)} is not a line of that transcript`); continue; }
    // the quote must sit at that line or just after it (a few lines of slack:
    // captions split a sentence across stamps)
    const near = norm(src.lines.slice(Math.max(0, idx - 1), idx + 6).map((l) => l.text).join(' '));
    const quote = norm(r?.quote);
    if (words(quote).length < 3 || !near.includes(quote)) { drop(`its quote is not at ${secToStamp(sec)} in that transcript`); continue; }
    if (lifted(text, src.norm)) { drop('it copied the transcript instead of putting it in his own words'); continue; }
    const k = norm(text);
    if (seen.has(k)) continue;
    seen.add(k);

    const domain = DOMAINS.includes(r?.domain) ? r.domain : (SENSITIVE.test(text) ? 'sensitive' : 'none');
    const evidence = str(r?.evidence, 300);
    let kind = r?.kind === 'evidenced' && evidence.length >= 8 ? 'evidenced' : 'stated';
    if (r?.kind === 'evidenced' && kind === 'stated') notes.push(`"${text.slice(0, 60)}" was called evidenced with no evidence given, so it is marked stated`);
    if (domain !== 'none' && kind === 'evidenced' && !evidence) kind = 'stated';
    const needs = str(r?.needs, 160);
    rules.push({ text, kind, source: src.n, at: secToStamp(sec), ...(needs ? { needs } : {}) });
  }
  if (!rules.length) {
    throw new Error(`no rule could be traced to a real line of the transcript${dropped.length ? ` (${dropped.length} dropped: ${dropped[0].why})` : ''}, so nothing was filed`);
  }

  const allNorm = sources.map((s) => s.norm).join(' ');
  const phrases = strs(raw?.phrases, { max: 160, cap: 12 }).filter((p) => {
    const ok = words(p).length <= 12 && allNorm.includes(norm(p));
    if (!ok) dropped.push({ text: p.slice(0, 80), why: 'a phrase to reuse must be word for word in the transcript, 12 words or fewer' });
    return ok;
  });
  const clean = (arr, cap) => strs(arr, { cap }).filter((x) => {
    if (sources.some((s) => lifted(x, s.norm))) { dropped.push({ text: x.slice(0, 80), why: 'it copied the transcript' }); return false; }
    return true;
  });
  const triggers = strs(raw?.triggers, { max: 40, cap: 10, min: 2 }).map((t) => t.toLowerCase());
  const agents = (Array.isArray(raw?.agents) ? raw.agents : []).map((a) => String(a).toLowerCase()).filter((a) => AGENTS.includes(a));
  const playbook = {
    ...emptyPlaybook(),
    title: topic.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim(),
    summary: str(raw?.summary, 300),
    triggers: triggers.length ? triggers : [norm(topic)],
    agents: agents.includes('all') || !agents.length ? ['all'] : [...new Set(agents)],
    sources: sources.map((s) => ({ n: s.n, title: s.title, speaker: s.speaker || 'unknown', url: s.url })),
    when: clean(raw?.when, 8),
    method: clean(raw?.method, 20),
    rules,
    phrases,
    mistakes: clean(raw?.mistakes, 12),
    stops: clean(raw?.stops, 10),
    disagreements: clean(raw?.disagreements, 10),
  };
  if (!playbook.method.length) notes.push('the read found no steps, only rules');
  return { playbook, dropped, notes };
}

/* --------------------------------- the draft ------------------------------ */

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function draftBody({ page, links, dropped, notes, extended }) {
  const read = links.filter((l) => l.status === 'read');
  const failed = links.filter((l) => l.status === 'failed');
  const head = [
    `**${extended ? 'Extends' : 'New'} playbook: ${page.title}.** Read ${plural(read.length, 'link')}${failed.length ? `, could not read ${failed.length}` : ''}. ${plural(page.rules.length, 'rule')} kept${dropped.length ? `, ${dropped.length} dropped by the checks` : ''}.`,
  ];
  for (const l of read) head.push(`- Read: ${l.title || l.url} (${l.from})`);
  for (const l of failed) head.push(`- Could not read: ${l.url}. ${l.error}`);
  if (dropped.length) head.push(`- Dropped: ${dropped.slice(0, 4).map((d) => `"${d.text}" (${d.why})`).join('; ')}${dropped.length > 4 ? `; and ${dropped.length - 4} more` : ''}.`);
  for (const n of notes) head.push(`- Note: ${n}.`);
  return `${head.join('\n')}\n\n---\n\n${formatPlaybook(page)}`;
}

/* ----------------------------------- the job ------------------------------ */

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const reasonOf = (e) => String(e?.message || e || 'unknown error').replace(/\s+/g, ' ').slice(0, 300);

export async function runLearnJob(vaultPath, record, { urls, purpose = '', rejected = [] }, deps = {}) {
  const { updateRecord } = await import('./inboxStore.js');
  const model = deps.runModel || runModel;
  const getTranscript = deps.transcriptFor || ((u, wd) => transcriptFor(vaultPath, u, wd, deps));
  let workDir = null;
  const links = [
    ...urls.map((url) => ({ url, status: 'waiting', title: null, from: null, error: null })),
    ...rejected.map((r) => ({ url: r.url, status: 'failed', title: null, from: null, error: r.why })),
  ];
  const save = (patch = {}) => updateRecord(record.id, { learn: { links, purpose: purpose || null, ...patch } }).catch(() => {});
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'nova-learn-'));
    await save({ step: 'reading' });

    // 1. every link's transcript; a failure is that link's, never the batch's
    const got = await pool(links.filter((l) => l.status === 'waiting'), POOL, async (l, i) => {
      l.status = 'reading';
      await save({ step: 'reading' });
      try {
        const t = await getTranscript(l.url, path.join(workDir, `fetch-${i}`));
        const lines = parseTranscriptLines(t.transcript);
        if (!lines.length) throw new Error('the transcript has no timestamps, so no rule could be traced to a moment');
        l.status = 'read'; l.title = t.title; l.from = t.from;
        return { link: l, t, lines };
      } catch (e) {
        l.status = 'failed'; l.error = reasonOf(e);
        return null;
      } finally { await save({ step: 'reading' }); }
    });
    const read = got.filter(Boolean);
    if (!read.length) {
      throw new Error(`nothing could be read. ${links.map((l) => `${l.url}: ${l.error}`).join(' | ')}`);
    }

    // 2. number the sources and put each transcript where the model can Read it
    const sources = [];
    for (const { link, t, lines } of read) {
      const n = sources.length + 1;
      const file = path.join(workDir, `source-${n}.txt`);
      await writeFile(file, t.transcript, 'utf8');
      sources.push({ n, title: t.title, speaker: t.uploader, url: link.url, file, lines, norm: norm(lines.map((l) => l.text).join(' ')), raw: t.transcript });
    }
    const existing = await listPlaybooks(vaultPath).catch(() => []);
    const existingTitles = existing.map((p) => p.title);

    // 3. one read per source (a very long one in parts), then a merge when there is more than one
    await save({ step: 'learning' });
    const units = [];
    for (const s of sources) {
      if (s.raw.length > SINGLE_PASS_MAX_CHARS) {
        const parts = chunkTranscript(s.raw, CHUNK_CHARS);
        for (let i = 0; i < parts.length; i++) {
          const file = path.join(workDir, `source-${s.n}-part-${i + 1}.txt`);
          await writeFile(file, parts[i], 'utf8');
          units.push({ sources: [{ ...s, file }], part: { i: i + 1, n: parts.length } });
        }
      } else units.push({ sources: [s], part: null });
    }
    const reads = await pool(units, POOL, (u) => model(buildExtractPrompt({ purpose, sources: u.sources, existingTitles, part: u.part }), { cwd: workDir }));
    let finalRaw = reads[0];
    if (units.length > 1) {
      await save({ step: 'merging' });
      const extractionsFile = path.join(workDir, 'reads.json');
      await writeFile(extractionsFile, JSON.stringify(reads), 'utf8');
      finalRaw = await model(buildSynthesisPrompt({ purpose, sources, extractionsFile, existingTitles }), { cwd: workDir });
    }

    // 4. code checks everything it can, and writes the draft
    const { playbook, dropped, notes } = validateLearn(finalRaw, sources);
    const found = await findPlaybookFor(vaultPath, playbook.title);
    const page = mergePlaybook(found, playbook);
    const title = `${found ? 'Extend playbook' : 'New playbook'}: ${playbook.title}`;
    const body = draftBody({ page, links, dropped, notes, extended: !!found });
    const failedCount = links.filter((l) => l.status === 'failed').length;
    return await updateRecord(record.id, {
      status: 'pending',
      text: `${title}. ${plural(playbook.rules.length, 'rule')} from ${plural(sources.length, 'source')}${failedCount ? `; ${failedCount} link${failedCount === 1 ? '' : 's'} could not be read` : ''}.`,
      decision: {
        route: 'playbook', confidence: 'high', title,
        reason: 'Learned from the links you sent. A yes writes the page and the matching agents start applying it. Undo takes it back.',
        payload: { title: playbook.title, body, playbook },
      },
      learn: { links, purpose: purpose || null, step: 'done', dropped: dropped.length },
      error: null,
    });
  } catch (e) {
    return updateRecord(record.id, { status: 'error', error: reasonOf(e), learn: { links, purpose: purpose || null, step: 'failed' } }).catch(() => null);
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// The same ask must not run twice while it is running: a client timeout does
// not cancel the server (the Leader's lesson), so a retry rides the first run.
const inFlight = new Map();
const askKey = (links, purpose) => [...links].sort().join('|') + '#' + norm(purpose);

export async function startLearn(vaultPath, { urls, purpose = '' } = {}, deps = {}) {
  const { links, rejected } = cleanLinks(urls);
  if (!links.length && !rejected.length) throw new Error('send at least one link to learn from');
  if (!deps.skipLaneCheck) assertLaneOn(LEARN_LANE);
  const why = String(purpose || '').trim().slice(0, 600);
  const key = askKey(links, why);
  const running = inFlight.get(key);
  if (running) return { ...running, repeat: true };
  const { createRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'playbook',
    text: `Learning from ${links.length + rejected.length} link${links.length + rejected.length === 1 ? '' : 's'}${why ? `: ${why.slice(0, 80)}` : ''}`,
    source: 'learn',
    mode: 'draft',
    status: 'classifying',
    createdAt: new Date().toISOString(),
    learn: { links: [...links.map((url) => ({ url, status: 'waiting' })), ...rejected.map((r) => ({ url: r.url, status: 'failed', error: r.why }))], purpose: why || null, step: 'starting'},
  });
  inFlight.set(key, record);
  const done = runLearnJob(vaultPath, record, { urls: links, purpose: why, rejected }, deps).finally(() => inFlight.delete(key));
  return deps.wait ? { ...record, done } : record;
}
