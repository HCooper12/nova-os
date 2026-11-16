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
import { normalizeProposal } from './repertoireLane.js';
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
//
// THE SCREEN TOO (16 Nov 2026, his ask off two reels: "read what's on screen
// and listen; include the demos, not just the transcript"). Until now the lane
// only listened, so a reel whose method is written on screen over music was
// "the link has no transcript", and a demo was lost. Now a short video (a reel,
// a short, anything ten minutes or under) is also read as frames, and a video
// with no speech at all is read from its frames alone. A rule read off the
// screen is marked "on screen" on the page. What code can check: its moment is
// a frame Nova really offered, and the read says it opened frames of that
// source. What code cannot check is the pixels, and the draft says so.
//
// FOR HIM AS WELL AS HIS AGENTS (same day): the read also names one to three
// drills, the method's core moves as something he can try today. His yes adds
// them to his Repertoire under the playbook's name, where the one-a-day card,
// the spaced review and "landed / missed" already live. Undo takes them back.
// A health playbook gets no drills: Coach owns how he trains and eats.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
export const LEARN_LANE = 'playbook-learn';
export const MAX_LINKS = 10;
const POOL = 3;
// the screen is read for a video this long or shorter (Watch's own advice:
// best accuracy under ten minutes), and always when there is no speech
export const SCREEN_MAX_SEC = 600;
// frames are read at this width so on-screen text is legible (Watch: 1024 for text)
export const SCREEN_WIDTH = 1024;
export const MAX_DRILLS = 3;
// short-form hosts: the screen is read first, in one fetch that also brings
// the speech, since these rarely carry captions and a second fetch would
// download the same video twice
const SHORT_FORM = /(^|\.)(instagram\.com|tiktok\.com|x\.com|twitter\.com|facebook\.com)$/i;
export const isShortForm = (url) => {
  try { const u = new URL(url); return SHORT_FORM.test(u.hostname) || /^\/shorts\//.test(u.pathname); } catch { return false; }
};

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

// THE SCREEN: frames (and the speech, when there is any) in one fetch. The
// frames are files in workDir; the model opens them with the Read tool.
export async function screenFor(url, workDir, { fetchReport = fetchVideoTranscript } = {}) {
  const report = await fetchReport(url, workDir, { frames: true, resolution: SCREEN_WIDTH });
  const frames = (report?.frames || [])
    .map((f) => ({ path: f.path, sec: stampToSec(f.t) }))
    .filter((f) => f.path && f.sec !== null)
    .map((f) => ({ ...f, t: secToStamp(f.sec) }));
  return { title: report?.title || url, uploader: report?.uploader || '', transcript: report?.transcript || null, transcriptSource: report?.transcriptSource || null, duration: report?.duration || null, frames };
}

/* ------------------------------- the prompts ------------------------------ */

const SCHEMA = `{"topic":"the skill or task this improves, 2-5 words","summary":"one sentence: what following this playbook lets an agent do","triggers":["3-8 short lower-case phrases that should call this playbook, such as the task words he or an agent would use"],"agents":["all"],"when":["when to use it"],"method":["numbered steps, imperative, for an agent doing the task"],"rules":[{"text":"a rule with its threshold or condition, in your own words","kind":"stated|evidenced","evidence":"for evidenced only: the data or study the speaker gave, in your words; else empty","domain":"none|health|money|legal","needs":"the speaker's audience, scale or budget this rule depends on, or empty","source":1,"at":"m:ss or h:mm:ss, copied from a [stamp] in the transcript","quote":"3 to 10 words copied exactly from the transcript at or just after that stamp"}],"phrases":["exact wording worth reusing, 12 words or fewer, copied exactly from the transcript"],"mistakes":["common mistakes the speaker names"],"stops":["where this stops applying, who it does not fit"],"disagreements":["where the sources disagree, naming both and what each says; empty if none"],"drills":[{"name":"2-6 words, the move as he would call it","summary":"one line, what it is, 140 characters at most","move":"the mechanism in one sentence, taken from the method or a kept rule","drill":"something small he can do today, in a normal day, to practise it","tell":"how he knows it landed"}],"framesRead":0}`;

const METHOD_RULES = `Pull out the METHOD, not the content. Keep decisions, steps, rules with their thresholds, exact phrasing worth reusing, worked examples and common mistakes. Drop stories, sales pitches, the intro and anything that only sounds wise.
- Every rule carries "source", "at" and "quote". "at" is a [stamp] that really appears in the transcript. "quote" is copied exactly from the lines at or just after it. Code checks both and drops a rule that fails either, so do not guess a stamp.
- "stated" is the speaker's opinion or experience. "evidenced" only when the speaker gives data or names a study, and then "evidence" says what. A claim about health, money or law with no real evidence is "stated", whatever the speaker's confidence.
- A rule that only works at the speaker's audience size, price point, budget or body type carries that in "needs".
- Where two sources disagree, say so in "disagreements" and do not blend them into one rule.
- Paraphrase. Never copy a passage of the transcript into text. Short quoted phrases belong only in "phrases" and "quote".
- Write for an agent doing the task, short and in the imperative. Plain words, no em dashes. Hayden is the user; refer to him as "he" if you must.
- "drills": up to ${MAX_DRILLS} of the method's core moves, written for HIM to practise, not for an agent. Each "move" must come from the method or a rule you kept. Each "drill" is something he can actually do today; never "read about it". Leave "drills" empty for health, training, food or sleep (his Coach owns those).`;

const SCREEN_RULES = `THE SCREEN. Frames from the video are listed under each source. Open EVERY frame with the Read tool before you write anything: on-screen text, slides, a whiteboard, code and demos are often where the method is, and the speech may not say it.
- A rule you took from the screen, not the speech, has "seen": true, "at" set to that frame's time exactly as listed, and "quote" set to the words visible in that frame (copied exactly), or "" when it is a demo with no words.
- A rule from the speech has "seen": false and follows the transcript rules above.
- Describe only what a frame actually shows. Never fill a gap from the title or the speech and call it seen.
- "framesRead" is the number of frames you actually opened. Code drops every "seen" rule when it is 0.`;

const sourceLine = (s) => {
  const head = `- source ${s.n}: ${s.title}${s.speaker ? `, ${s.speaker}` : ''}`;
  const ear = s.file ? `\n  transcript: ${s.file}` : '\n  transcript: none (no speech could be read; the screen is all there is)';
  const eye = s.frames?.length ? `\n  frames (open each):\n${s.frames.map((f) => `  - t=${f.t}: ${f.path}`).join('\n')}` : '';
  return head + ear + eye;
};

export function buildExtractPrompt({ purpose, sources, existingTitles = [], part = null }) {
  return `You are the PLAYBOOK LEARNER inside Nova. Hayden dropped ${sources.length === 1 ? 'a video or podcast' : `${sources.length} videos or podcasts`} and wants the method kept as a playbook his agents will apply to a task. This is not a summary: the output must change how an agent does the work.

WHAT IT IS FOR: ${purpose ? `"${String(purpose).slice(0, 600)}"` : 'he did not say. Name the task the method most plainly improves, and say it in "topic".'}
${existingTitles.length ? `\nPLAYBOOKS HE HAS ALREADY (if this is the same topic, use that exact title as "topic" so the page is extended, never doubled):\n${existingTitles.map((t) => `- ${t}`).join('\n')}\n` : ''}
THE SOURCE${sources.length === 1 ? '' : 'S'}${part ? ` (part ${part.i} of ${part.n} of one long source; the stamps are real across parts)` : ''}. Read ${sources.length === 1 ? 'each file' : 'every file'} with the Read tool:
${sources.map(sourceLine).join('\n')}

${METHOD_RULES}
${sources.some((s) => s.frames?.length) ? `\n${SCREEN_RULES}\n` : ''}
Output ONLY this JSON, no code fences, no commentary:
${SCHEMA}`;
}

export function buildSynthesisPrompt({ purpose, sources, extractionsFile, existingTitles = [] }) {
  return `You are the PLAYBOOK LEARNER inside Nova, merging what several reads of ${sources.length === 1 ? 'one long source' : `${sources.length} sources`} found into ONE playbook. The reads are in ${extractionsFile} (JSON, one per source or part). The sources:
${sources.map(sourceLine).join('\n')}

WHAT IT IS FOR: ${purpose ? `"${String(purpose).slice(0, 600)}"` : 'he did not say. Use the task the reads share.'}
${existingTitles.length ? `PLAYBOOKS HE HAS ALREADY (same topic: use the exact title): ${existingTitles.join('; ')}\n` : ''}
Merge rules that say the same thing into one. Keep every rule's "source", "at", "quote" and "seen" as the read gave them (you may open a transcript or a frame to check). Set "framesRead" to the frames you opened yourself, or 0 if you opened none; the reads' own counts are kept by code. Keep at most ${MAX_DRILLS} drills, the most useful. Where sources disagree, do not blend: put both positions in "disagreements" and keep each source's rule with its own condition. Keep the order of the method sensible across sources.

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
const HEALTH_WORDS = /\b(health|training|workout|exercise|lifting|strength|hypertrophy|muscle|cardio|running|sleep|recovery|nutrition|diet|calorie|protein|fat loss|supplement|injury|pain|rehab|mobility|hormone|testosterone)\b/i;
export const isHealthTopic = (topic, triggers = [], rules = []) => HEALTH_WORDS.test([topic, ...triggers].join(' ')) || rules.some((r) => r.domain === 'health');

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
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
 * [{n, title, speaker, url, lines:[{sec,text}], norm, frames?:[{sec,t,path}]}].
 * `framesRead` maps a source number to the frames the read of it says it
 * opened. Pure. Returns { playbook, drills, dropped:[{text, why}], notes:[...] }.
 */
export function validateLearn(raw, sources, { framesRead = new Map() } = {}) {
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
    const onScreen = r?.seen === true;
    if (onScreen) {
      // read off a frame: the moment must be a frame Nova offered, and the read
      // must say it opened frames of that source. The pixels are not checkable.
      if (!src.frames?.length) { drop('it said it was seen on screen, but no frames of that source were offered'); continue; }
      if (!((framesRead.get(src.n) || 0) > 0)) { drop('it said it was seen on screen, but the read opened no frames'); continue; }
      if (!src.frames.some((f) => f.sec === sec)) { drop(`${secToStamp(sec)} is not a frame Nova offered`); continue; }
    } else {
      const idx = src.lines.findIndex((l) => l.sec === sec);
      if (idx === -1) { drop(`${secToStamp(sec)} is not a line of that transcript`); continue; }
      // the quote must sit at that line or just after it (a few lines of slack:
      // captions split a sentence across stamps)
      const near = norm(src.lines.slice(Math.max(0, idx - 1), idx + 6).map((l) => l.text).join(' '));
      const quote = norm(r?.quote);
      if (words(quote).length < 3 || !near.includes(quote)) { drop(`its quote is not at ${secToStamp(sec)} in that transcript`); continue; }
    }
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
    rules.push({ text, kind, source: src.n, at: secToStamp(sec), ...(onScreen ? { seen: true } : {}), ...(needs ? { needs } : {}), ...(domain === 'health' ? { domain } : {}) });
  }
  if (!rules.length) {
    throw new Error(`no rule could be traced to a real line of the transcript or a frame${dropped.length ? ` (${dropped.length} dropped: ${dropped[0].why})` : ''}, so nothing was filed`);
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
    // a health playbook is Coach's alone, decided by code (his call, 7 Nov 2026):
    // a claim from a video must not reach an agent without Coach's evidence standard
    agents: isHealthTopic(topic, triggers, rules) ? ['coach'] : agents.includes('all') || !agents.length ? ['all'] : [...new Set(agents)],
    sources: sources.map((s) => ({ n: s.n, title: str(s.title, 160), speaker: str(s.speaker, 100) || 'unknown', url: s.url })),
    when: clean(raw?.when, 8),
    method: clean((Array.isArray(raw?.method) ? raw.method : []).map((m) => String(m ?? '').replace(/^\s*(?:step\s+)?\d+[.):]\s*/i, '')), 20),
    rules,
    phrases,
    mistakes: clean(raw?.mistakes, 12),
    stops: clean(raw?.stops, 10),
    disagreements: clean(raw?.disagreements, 10),
  };
  if (!playbook.method.length) notes.push('the read found no steps, only rules');
  const seenCount = rules.filter((r) => r.seen).length;
  if (seenCount) notes.push(`${plural(seenCount, 'rule')} ${seenCount === 1 ? 'was' : 'were'} read off the screen: code checked each points at a frame Nova offered, but cannot check what the frame shows`);

  // drills for HIM: the Repertoire's own normaliser (a name and a real drill,
  // or nothing), then this lane's checks: a move, no lifted passage, none for health
  let drills = [];
  const askedDrills = Array.isArray(raw?.drills) ? raw.drills.length : 0;
  if (playbook.agents.length === 1 && playbook.agents[0] === 'coach') {
    if (askedDrills) notes.push('no drills: a health playbook is Coach\'s, so nothing goes to your Repertoire');
  } else {
    drills = normalizeProposal({ techniques: raw?.drills || [] }).techniques
      .filter((d) => {
        if (!d.move) { dropped.push({ text: d.name, why: 'a drill needs the move it practises' }); return false; }
        if (sources.some((src) => lifted(`${d.move} ${d.drill}`, src.norm))) { dropped.push({ text: d.name, why: 'the drill copied the transcript' }); return false; }
        return true;
      })
      .slice(0, MAX_DRILLS)
      .map((d) => ({ ...d, family: playbook.title, source: `Playbook: ${playbook.title}` }));
  }
  return { playbook, drills, dropped, notes };
}

/* --------------------------------- the draft ------------------------------ */

export function draftBody({ page, links, dropped, notes, extended, drills = [] }) {
  const read = links.filter((l) => l.status === 'read');
  const failed = links.filter((l) => l.status === 'failed');
  const head = [
    `**${extended ? 'Extends' : 'New'} playbook: ${page.title}.** Read ${plural(read.length, 'link')}${failed.length ? `, could not read ${failed.length}` : ''}. ${plural(page.rules.length, 'rule')} kept${dropped.length ? `, ${dropped.length} dropped by the checks` : ''}.`,
  ];
  for (const l of read) head.push(`- Read: ${l.title || l.url} (${l.from})`);
  for (const l of failed) head.push(`- Could not read: ${l.url}. ${l.error}`);
  if (dropped.length) head.push(`- Dropped: ${dropped.slice(0, 4).map((d) => `"${d.text}" (${d.why})`).join('; ')}${dropped.length > 4 ? `; and ${dropped.length - 4} more` : ''}.`);
  for (const n of notes) head.push(`- Note: ${n}.`);
  const forHim = drills.length
    ? `\n\n**For you to practise** (a yes adds ${drills.length === 1 ? 'this' : 'these'} to your Repertoire, one a day with spaced review):\n\n${drills.map((d) => `- **${d.name}.** ${d.move} Drill: ${d.drill}${d.tell ? ` Tell: ${d.tell}` : ''}`).join('\n')}`
    : '';
  return `${head.join('\n')}${forHim}\n\n**The page as it would be saved:**\n\n${formatPlaybook(page)}`;
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

// ONE LINK'S EVIDENCE: speech, screen, or both. Pure of the network itself:
// the two fetchers are passed in. A short-form link reads the screen first (one
// fetch brings both); anything else listens first and reads the screen only
// when it is short or silent. Either half may fail alone; both failing is the
// link's error, with both reasons.
export async function evidenceFor(url, workDir, { getTranscript, getScreen = null }) {
  let t = null; let lines = []; let frames = [];
  let earWhy = null; let eyeWhy = null; let screen = null;
  const listen = async () => {
    try {
      t = await getTranscript(url, workDir);
      lines = parseTranscriptLines(t?.transcript);
      if (!lines.length) earWhy = 'the transcript has no timestamps, so no rule could be traced to a moment';
    } catch (e) { earWhy = reasonOf(e); }
  };
  const look = async () => {
    try {
      screen = await getScreen(url, `${workDir}-screen`);
      frames = screen.frames || [];
      if (!frames.length) eyeWhy = 'no frames could be taken from the video';
    } catch (e) { eyeWhy = `the screen could not be read: ${reasonOf(e)}`; }
  };
  if (getScreen && isShortForm(url)) {
    await look();
    const heard = parseTranscriptLines(screen?.transcript);
    if (heard.length) { t = { title: screen.title, uploader: screen.uploader, transcript: screen.transcript }; lines = heard; }
    else await listen(); // a kept transcript, or the vault's, may still exist
  } else {
    await listen();
    const lastSec = lines.length ? lines[lines.length - 1].sec : null;
    if (getScreen && (!lines.length || (lastSec !== null && lastSec <= SCREEN_MAX_SEC))) await look();
  }
  if (!lines.length && !frames.length) {
    throw new Error([earWhy || 'no speech could be read', eyeWhy].filter(Boolean).join('; '));
  }
  if (!t) t = { title: screen?.title || url, uploader: screen?.uploader || '', transcript: '' };
  const ear = lines.length ? (t.from || (screen?.transcript ? `fetched now (${screen.transcriptSource || 'speech'})` : 'the transcript')) : 'no speech';
  const eye = frames.length ? `, and ${plural(frames.length, 'frame')} of the screen` : (eyeWhy && getScreen ? `; ${eyeWhy}` : '');
  return { t, lines, frames, from: `${ear}${eye}` };
}

export async function runLearnJob(vaultPath, record, { urls, purpose = '', rejected = [] }, deps = {}) {
  const { updateRecord } = await import('./inboxStore.js');
  const model = deps.runModel || runModel;
  const getTranscript = deps.transcriptFor || ((u, wd) => transcriptFor(vaultPath, u, wd, deps));
  // the screen fetch downloads the video. A caller that stubs the transcript and
  // says nothing about the screen gets no screen (tests never reach the network).
  const getScreen = deps.screenFor || (deps.transcriptFor ? null : ((u, wd) => screenFor(u, wd, deps)));
  let workDir = null;
  const links = [
    ...urls.map((url) => ({ url, status: 'waiting', title: null, from: null, error: null })),
    ...rejected.map((r) => ({ url: r.url, status: 'failed', title: null, from: null, error: r.why })),
  ];
  const save = (patch = {}) => updateRecord(record.id, { learn: { links, purpose: purpose || null, ...patch } }).catch(() => {});
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'nova-learn-'));
    await save({ step: 'reading' });

    // 1. every link's speech and, for a short one, its screen; a failure is
    // that link's, never the batch's
    const got = await pool(links.filter((l) => l.status === 'waiting'), POOL, async (l, i) => {
      l.status = 'reading';
      await save({ step: 'reading' });
      try {
        const ev = await evidenceFor(l.url, path.join(workDir, `fetch-${i}`), { getTranscript, getScreen });
        l.status = 'read'; l.title = ev.t.title; l.from = ev.from; l.frames = ev.frames.length;
        return { link: l, t: ev.t, lines: ev.lines, frames: ev.frames };
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
    for (const { link, t, lines, frames } of read) {
      const n = sources.length + 1;
      let file = null;
      if (lines.length) { file = path.join(workDir, `source-${n}.txt`); await writeFile(file, t.transcript, 'utf8'); }
      sources.push({ n, title: t.title, speaker: t.uploader, url: link.url, file, lines, frames, norm: norm(lines.map((l) => l.text).join(' ')), raw: lines.length ? t.transcript : '' });
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
          // the frames ride with the first part only: one read opens them once
          units.push({ sources: [{ ...s, file, frames: i === 0 ? s.frames : [] }], part: { i: i + 1, n: parts.length } });
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

    // what each read says it opened, per source; a read that offered no frames counts 0
    const framesRead = new Map();
    reads.forEach((r, i) => {
      const offered = units[i].sources.reduce((a, s) => a + (s.frames?.length || 0), 0);
      const said = Number(r?.framesRead);
      const n = Number.isInteger(said) && said > 0 ? Math.min(said, offered) : 0;
      for (const s of units[i].sources) if (s.frames?.length) framesRead.set(s.n, Math.max(framesRead.get(s.n) || 0, n));
    });

    // 4. code checks everything it can, and writes the draft
    const { playbook, drills, dropped, notes } = validateLearn(finalRaw, sources, { framesRead });
    const found = await findPlaybookFor(vaultPath, playbook.title);
    const page = mergePlaybook(found, playbook);
    const title = `${found ? 'Extend playbook' : 'New playbook'}: ${playbook.title}`;
    const body = draftBody({ page, links, dropped, notes, extended: !!found, drills });
    const failedCount = links.filter((l) => l.status === 'failed').length;
    return await updateRecord(record.id, {
      status: 'pending',
      text: `${title}. ${plural(playbook.rules.length, 'rule')} from ${plural(sources.length, 'source')}${drills.length ? `, ${plural(drills.length, 'drill')} for you` : ''}${failedCount ? `; ${failedCount} link${failedCount === 1 ? '' : 's'} could not be read` : ''}.`,
      decision: {
        route: 'playbook', confidence: 'high', title,
        reason: `Learned from the links you sent. A yes writes the page and the matching agents start applying it${drills.length ? ', and adds the drills to your Repertoire' : ''}. Undo takes it back.`,
        payload: { title: playbook.title, body, playbook, ...(drills.length ? { drills } : {}) },
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
