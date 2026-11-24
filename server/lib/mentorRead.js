import { spawn } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelFor, effortArgs, laneEnabled, laneOffError, LANES } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope, fromEnvelope } from './modelSpend.js';
import { transcriptWords, findInTranscript, normWords, timeToSeconds, secondsToTime } from './reviewQuote.js';

// STAGE 1, THE READ (Mentors, part 2, 21 Nov 2026): one transcript into
// structured reading notes, kept in Nova's own data, never the vault (the
// weave, part 3, writes the vault). The only model call in part 2.
//
// The prompt is the pilot's read-v1, copied word for word from
// design/mentors-pilot/stage1.mjs: it is the measured one (19 Nov: $0.09 to
// $0.13 a video, 32 of 33 Lines word for word), and changing a word would
// invalidate that measurement. The spawn is the pilot's too: the prompt on
// stdin, the pilot's system prompt, zero tools.
//
// NEVER FABLE. His words: "The digest should not use fable as the Claude
// model to complete that task." The model board lets him pick any model for
// any lane, Fable included, so mentorModel below refuses the Fable family for
// this lane whatever the board says, and the run records why.
//
// Code, not the model, decides what a quote is: every Line and every Script's
// words are looked for in the transcript word for word, and when found the
// TRANSCRIPT's words and minute replace the model's copy.

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const notesDir = () => path.join(dataRoot(), 'mentors', 'notes');
const safeKey = (key) => String(key).replace(/:/g, '_');

export const LANE = 'mentor-read';
export const READ_VERSION = 'read-v1';
export const SPLIT_OVER = 150_000;
export const PART_MAX = 120_000;
const SYSTEM_PROMPT = 'You are a careful reader who writes complete, faithful notes from a transcript. You follow the requested format exactly.';
const CLAUDE_BIN = () => process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

let deps = null;
export function _setReadDepsForTest(d) { deps = d || null; }
const D = () => ({ spawn, now: () => Date.now(), ...(deps || {}) });

/* -------------------------------- the model -------------------------------- */

const FABLE_RE = /fable|mythos/i;

/** { model, why }: the board's pick for the lane, unless it is in the Fable
 *  family, then the lane's own default and the reason. */
export function mentorModelChoice(laneId = LANE) {
  const chosen = modelFor(laneId);
  if (!FABLE_RE.test(chosen)) return { model: chosen, why: null };
  const def = LANES.find((l) => l.id === laneId)?.def;
  const model = def && !FABLE_RE.test(def) ? def : 'sonnet';
  const what = laneId === LANE ? 'a mentor read' : 'this mentor lane';
  return { model, why: `the board chose ${chosen} for this lane; ${what} never runs on Fable (his rule), so it ran on ${model}` };
}

export function mentorModel(laneId = LANE) {
  return mentorModelChoice(laneId).model;
}

/* -------------------------------- the prompt ------------------------------- */

// YYYYMMDD from an ISO date, as yt-dlp's upload_date was in the pilot
const ymd = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).replace(/-/g, '') : 'not stated');

/** The meta the prompt needs, from a register source. */
export function metaFor(source, { audioSec = null } = {}) {
  return {
    title: source.title || source.key,
    channel: source.show || 'not stated',
    uploadDate: ymd(source.publishedAt),
    durationSec: Number(source.durationSec) || Number(audioSec) || 0,
    url: source.url || 'not stated',
    description: typeof source.description === 'string' ? source.description : '',
  };
}

// COPIED EXACTLY from design/mentors-pilot/stage1.mjs (readPrompt). Do not edit.
const pilotPrompt = (meta, transcript) => `You are reading one source for a personal knowledge vault.

SOURCE
Title: ${meta.title}
Channel: ${meta.channel}
Published: ${meta.uploadDate}
Length: ${Math.round(meta.durationSec / 60)} minutes
Link: ${meta.url}
Channel's own description (may name the guest): ${meta.description.replace(/\s+/g, ' ').slice(0, 500)}

The full transcript is below, from captions, with [mm:ss] marks. Captions carry no speaker labels, little punctuation, and some misheard words.

Write READING NOTES in markdown under exactly the headings below, in this order. Later stages see only these notes, never the transcript, so anything you leave out is LOST. Never merge two distinct ideas into one item. Paraphrase in your own words, except where a heading asks for exact words. Give the [mm:ss] mark for every item. Invent nothing: when the transcript does not say, write "not stated". When you cannot tell who is speaking, write "unclear".

## Summary
Three sentences.

## People
One line each: name | role here (host, guest, mentioned) | how the transcript shows it.

## Ideas
For each idea: "### <short name>", then 2 to 5 sentences giving the idea and the reasoning behind it, then a line "By: <name or unclear> | [mm:ss]".

## Frameworks
Every named or numbered method. For each: "### <name>", then lines "Use when: ...", "Steps:" with a numbered list, "Shape: <one of steps, cycle, ladder, versus, matrix, funnel, single>" (the diagram that fits it best), "By: <name> | [mm:ss]".

## Scripts
Exact words a speaker recommends saying, or warns against saying. One per line:
- Situation: ... | Say: "exact words" | Instead of: "exact words, or none" | By: ... | [mm:ss]
Copy the quoted words exactly as the transcript has them.

## Stories and examples
1 to 3 sentences each, with [mm:ss].

## Lines
Up to 12 lines that stand alone as a whole thought, copied word for word from the transcript:
- "..." | By: <name or unclear> | [mm:ss]

## References
Books, studies and people a speaker credits: - what | who credited it | [mm:ss]

## Applications
3 to 8 bullets: a concrete situation (leading a team, a hard conversation at work, family) and which idea or framework above to use in it.

## Open questions
Claims made without support, or that conflict with common evidence. "none" if none.

Output only the notes, starting with "## Summary".

TRANSCRIPT
${transcript}
`;

/** The measured prompt; for part i of n, one extra line after "SOURCE". */
export function readPrompt(meta, transcript, part = null) {
  const p = pilotPrompt(meta, transcript);
  if (!part) return p;
  return p.replace('\nSOURCE\n', `\nSOURCE\nThis is part ${part.i} of ${part.n} of the transcript.\n`);
}

/** A long transcript in parts of at most `max` characters, cut on lines. */
export function splitTranscript(text, { over = SPLIT_OVER, max = PART_MAX } = {}) {
  const t = String(text || '');
  if (t.length <= over) return [t];
  const parts = [];
  let cur = '';
  for (const line of t.split('\n')) {
    // one line longer than a part (no line breaks at all) is cut where it must be
    for (let rest = line; rest.length;) {
      const room = max - (cur ? cur.length + 1 : 0);
      if (rest.length <= room) { cur = cur ? `${cur}\n${rest}` : rest; rest = ''; break; }
      if (cur) { parts.push(cur); cur = ''; continue; }
      parts.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

// "## Heading\nbody" blocks, in order
function sections(md) {
  const out = [];
  let cur = null;
  for (const line of String(md || '').split('\n')) {
    const h = line.match(/^##\s+(?!#)(.+?)\s*$/);
    if (h) { cur = { head: h[1].trim(), body: [] }; out.push(cur); continue; }
    if (cur) cur.body.push(line);
  }
  return out.map((s) => ({ head: s.head, body: s.body.join('\n').trim() }));
}

/** The notes of the parts joined by code, no model merge: under each heading
 *  the items of part 1, then part 2, and so on; the Summary keeps all. */
export function joinNotes(parts) {
  if (parts.length === 1) return parts[0];
  const order = [];
  const bodies = new Map();
  for (const md of parts) {
    for (const s of sections(md)) {
      if (!bodies.has(s.head)) { bodies.set(s.head, []); order.push(s.head); }
      if (s.body && !/^none\.?$/i.test(s.body)) bodies.get(s.head).push(s.body);
    }
  }
  return order.map((h) => {
    const b = bodies.get(h);
    const joined = h === 'Summary' ? b.join(' ') : b.join('\n\n');
    return `## ${h}\n${joined || 'none'}`;
  }).join('\n\n');
}

/* -------------------------------- the notes -------------------------------- */

const lastAt = (s) => {
  const all = [...String(s || '').matchAll(/\[(\d{1,3}:\d{2}(?::\d{2})?)(?:[^\]]*)\]/g)];
  return all.length ? all[all.length - 1][1] : null;
};
const byOf = (s) => (String(s || '').match(/By:\s*([^|\n]+)/)?.[1] || '').trim() || null;
const unquote = (s) => {
  const t = String(s || '').trim();
  const m = t.match(/^["“](.*)["”]$/s);
  return m ? m[1].trim() : t;
};
const bullets = (body) => body.split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ''));
const subItems = (body) => {
  const out = [];
  let cur = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) { cur = { name: h[1].trim(), lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out;
};
const fieldsOf = (line) => Object.fromEntries(line.split('|').map((p) => p.trim()).map((p) => {
  const m = p.match(/^([A-Za-z][A-Za-z ]*?):\s*(.*)$/s);
  return m ? [m[1].toLowerCase(), m[2].trim()] : [null, p];
}).filter(([k]) => k));

// A Say field holding two or more separately quoted spans joined only by
// "or", "and", "," and the like gives one string per span; anything else (one
// span, none, or quotes inside quotes) is the one string it always was.
const SAY_JOINER = /^[\s,;/]*(?:or|and|vs\.?|then)?[\s,;/]*$/i;
function sayParts(say) {
  const t = String(say || '').trim();
  const spans = [...t.matchAll(/["“]([^"“”]+)["”]/g)];
  if (spans.length < 2) return [unquote(t)];
  let at = 0;
  for (const m of spans) {
    if (!SAY_JOINER.test(t.slice(at, m.index)) || !/[\p{L}\p{N}]/u.test(m[1])) return [unquote(t)];
    at = m.index + m[0].length;
  }
  if (!SAY_JOINER.test(t.slice(at))) return [unquote(t)];
  return spans.map((m) => m[1].trim());
}

/** Reading notes markdown -> structure. Tolerant: a missing heading is an
 *  empty list, never a throw. */
export function parseNotes(md) {
  const secs = new Map(sections(md).map((s) => [s.head.toLowerCase(), s.body]));
  const get = (name) => secs.get(name.toLowerCase()) || '';
  const out = { summary: get('Summary'), people: [], ideas: [], frameworks: [], scripts: [], stories: [], lines: [], references: [] };

  for (const b of bullets(get('People'))) {
    const [name, role, ...how] = b.split('|').map((x) => x.trim());
    if (name) out.people.push({ name, role: role || null, how: how.join(' | ') || null });
  }
  for (const it of subItems(get('Ideas'))) {
    const byLine = it.lines.find((l) => /^\s*By:/.test(l)) || '';
    const text = it.lines.filter((l) => l !== byLine).join('\n').trim();
    out.ideas.push({ name: it.name, text, by: byOf(byLine), at: lastAt(byLine) });
  }
  for (const it of subItems(get('Frameworks'))) {
    const pick = (re) => (it.lines.find((l) => re.test(l)) || '').replace(re, '').trim() || null;
    const steps = it.lines.map((l) => l.match(/^\s*\d+[.)]\s+(.*)$/)?.[1]).filter(Boolean);
    const byLine = it.lines.find((l) => /^\s*By:/.test(l)) || '';
    out.frameworks.push({ name: it.name, useWhen: pick(/^\s*Use when:\s*/i), steps, shape: (pick(/^\s*Shape:\s*/i) || '').toLowerCase() || null, by: byOf(byLine), at: lastAt(byLine) });
  }
  for (const b of bullets(get('Scripts'))) {
    const f = fieldsOf(b);
    if (!f.say) continue;
    const instead = f['instead of'] ? unquote(f['instead of']) : null;
    // `Say: "No." or "Thank you, and no."` is two scripts, each its own words
    for (const say of sayParts(f.say)) {
      out.scripts.push({ situation: f.situation || null, say, insteadOf: instead && !/^none$/i.test(instead) ? instead : null, by: f.by || null, at: lastAt(b) });
    }
  }
  for (const b of bullets(get('Stories and examples'))) out.stories.push({ text: b.replace(/\s*\[[\d:, ]+\]\s*$/, '').trim(), at: lastAt(b) });
  for (const b of bullets(get('Lines'))) {
    const q = b.match(/^["“](.+?)["”]\s*(?:\||$)/s);
    if (!q) continue;
    out.lines.push({ quote: q[1].trim(), by: byOf(b), at: lastAt(b) });
  }
  for (const b of bullets(get('References'))) out.references.push(b);
  return out;
}

// The transcript's own tokens, aligned one for one with transcriptWords: the
// same line rule, the same normalising, the same overlap drop, but each
// normalised word remembers the raw token it came from, so a found quote can
// be given back in the transcript's own spelling and punctuation.
const LINE_RE = /^\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*(.*)$/;
function alignedTokens(raw) {
  const out = []; // raw token per word
  let prev = [];
  for (const line of String(raw || '').split('\n')) {
    const m = line.match(LINE_RE);
    if (!m || timeToSeconds(m[1]) == null) continue;
    const toks = m[2].replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean);
    const tagged = [];
    toks.forEach((tok, i) => { for (const w of normWords(tok)) tagged.push({ w, tok: i, toks }); });
    const words = tagged.map((t) => t.w);
    let k = Math.min(prev.length, words.length);
    while (k > 0 && !prev.slice(prev.length - k).every((w, i) => w === words[i])) k -= 1;
    for (const t of tagged.slice(k)) out.push(t);
    prev = words;
  }
  return out;
}

function ownWords(tokens, start, end) {
  const picked = [];
  let last = null;
  for (let i = start; i < end; i++) {
    const t = tokens[i];
    if (last && last.toks === t.toks && last.tok === t.tok) continue;
    picked.push(t.toks[t.tok]);
    last = t;
  }
  return picked.join(' ').replace(/^[^\p{L}\p{N}]+/u, '').replace(/[,;:"'“”‘’(]+$/u, '').trim();
}

/** Every Line and every Script's words looked for in the transcript word for
 *  word; found ones carry the transcript's OWN words and minute. Mutates and
 *  returns counts. */
export function verifyNotes(parsed, transcript) {
  const words = transcriptWords(transcript);
  const tokens = alignedTokens(transcript);
  const aligned = tokens.length === words.length && tokens.every((t, i) => t.w === words[i].w);
  const ELL = /\.{3}|…/;
  const check = (item, field) => {
    const text = item[field];
    const ell = ELL.test(text);
    let hit = findInTranscript(text, words);
    // A 2 or 3 word line ("No, thank you.") is too short to trust anywhere in
    // an hour of speech, so it counts only where the notes say it was said.
    if (!hit && !ell) {
      const n = normWords(text).length;
      const cited = timeToSeconds(item.at);
      if ((n === 2 || n === 3) && cited != null) hit = findInTranscript(text, words, { minWords: 2, near: { atSeconds: cited, window: 90 } });
    }
    item.verified = !!hit;
    delete item.heldWhy;
    if (!hit) return false;
    if (ell) {
      // a kept quote never holds "...": the span must be one stretch of speech
      const pieceWords = text.split(ELL).map(normWords).filter((p) => p.length >= 4).reduce((n, p) => n + p.length, 0);
      const own = aligned && hit.end - hit.start <= pieceWords + 12 ? ownWords(tokens, hit.start, hit.end).replace(/\s*(?:\.{3,}|…)\s*/g, ' ').trim() : '';
      if (!aligned) item.heldWhy = 'its words could not be matched to the transcript one for one';
      else if (hit.end - hit.start > pieceWords + 12) item.heldWhy = 'it joins two separate moments of the transcript';
      else if (!own) item.heldWhy = 'its words could not be matched to the transcript one for one';
      if (item.heldWhy) { item.verified = false; return false; }
      item[field] = own;
    } else if (aligned) item[field] = ownWords(tokens, hit.start, hit.end) || item[field];
    item.at = secondsToTime(hit.atSeconds);
    return true;
  };
  let verifiedLines = 0;
  let verifiedScripts = 0;
  for (const l of parsed.lines || []) if (check(l, 'quote')) verifiedLines += 1;
  for (const s of parsed.scripts || []) if (check(s, 'say')) verifiedScripts += 1;
  return { lines: (parsed.lines || []).length, verifiedLines, scripts: (parsed.scripts || []).length, verifiedScripts };
}

/* --------------------------------- the run --------------------------------- */

// One single-turn call through the CLI, the pilot's way: prompt on stdin (then
// ENDED, the open-stdin trap), zero tools, the lane's effort, the never-Fable
// model the caller chose. Shared with the weave (lib/mentorWeave.js), whose
// calls have the same shape and only a different lane and system prompt.
//
// `allowed` (25 Nov 2026, the research lane): the tools the run may reach,
// as boundaryArgs takes them ('WebSearch WebFetch'); none by default, as
// before. A run with tools streams its events (stream-json), so the caller
// also gets `seen`: every tool input and tool result text of the run, which
// is how code checks that a cited link was really opened or found.
export function runMentorClaude(prompt, model, { lane = LANE, systemPrompt = SYSTEM_PROMPT, what = 'the read', allowed = '' } = {}) {
  if (FABLE_RE.test(String(model || ''))) return Promise.reject(new Error(`${what} was asked to run on ${model}; a mentor lane never runs on Fable (his rule)`));
  const d = D();
  const tools = String(allowed || '').trim();
  return new Promise((resolve, reject) => {
    const started = d.now();
    let child;
    try {
      child = d.spawn(CLAUDE_BIN(), [
        '-p',
        '--model', model,
        ...effortArgs(lane),
        ...boundaryArgs(tools),
        '--no-session-persistence',
        ...(tools ? ['--output-format', 'stream-json', '--verbose'] : ['--output-format', 'json']),
        '--system-prompt', systemPrompt,
      ], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new Error(`${what} could not start Claude: ${e.message}`));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c) => { stdout += c; });
    child.stderr?.on('data', (c) => { stderr += c; });
    child.on('error', (e) => reject(new Error(`${what} could not start Claude: ${e.message}`)));
    child.on('close', (code) => {
      try {
        const streamed = tools ? fromStream(stdout) : null;
        const outer = parseEnvelope(streamed ? streamed.result : stdout, { lane, code, stderr });
        const f = fromEnvelope(outer);
        // every model the run touched: a web run also uses a small model of
        // the CLI's own to read pages, which can out-write the one asked
        const models = Object.keys(outer?.modelUsage && typeof outer.modelUsage === 'object' ? outer.modelUsage : {});
        resolve({ text: String(outer?.result ?? ''), usd: f.usd || 0, answeredBy: f.model, models, ms: d.now() - started, ...(streamed ? { seen: streamed.seen } : {}) });
      } catch (e) { reject(e); }
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(prompt);
  });
}

// A stream-json run's stdout: the final `result` event (the envelope, as the
// JSON text parseEnvelope reads; '' when there is none, so parseEnvelope gives
// the real cause from stderr) and `seen`, the text of every tool call's input
// and every tool result, joined.
export function fromStream(stdout) {
  let result = '';
  const seen = [];
  const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(textOf).join('\n') : c && typeof c === 'object' ? (typeof c.text === 'string' ? c.text : JSON.stringify(c)) : '');
  for (const line of String(stdout || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(t); } catch { continue; }
    if (ev?.type === 'result') { result = t; continue; }
    for (const part of Array.isArray(ev?.message?.content) ? ev.message.content : []) {
      if (part?.type === 'tool_use') seen.push(JSON.stringify(part.input ?? {}));
      else if (part?.type === 'tool_result') seen.push(textOf(part.content));
      else if (part?.type === 'server_tool_use') seen.push(JSON.stringify(part.input ?? {}));
      else if (/tool_result$/.test(String(part?.type || ''))) seen.push(textOf(part.content));
    }
    if (ev?.tool_use_result) seen.push(textOf(ev.tool_use_result));
  }
  return { result, seen: seen.join('\n') };
}

async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}

/**
 * Read one source's transcript into notes. Writes
 * dataRoot()/mentors/notes/<safe key>.read-v1.md and .json. Returns
 * { notesPath, jsonPath, model, costUsd, ms, parts, counts }.
 */
export async function readSource(source, transcript, { audioSec = null } = {}) {
  if (!laneEnabled(LANE)) throw laneOffError(LANE);
  const d = D();
  const t0 = d.now();
  const { model, why } = mentorModelChoice(LANE);
  if (why) console.log(`mentorRead: ${why}`);
  const meta = metaFor(source, { audioSec });
  const pieces = splitTranscript(transcript);
  const replies = [];
  let costUsd = 0;
  let answeredBy = null;
  for (let i = 0; i < pieces.length; i++) {
    const prompt = readPrompt(meta, pieces[i], pieces.length > 1 ? { i: i + 1, n: pieces.length } : null);
    const r = await runMentorClaude(prompt, model);
    costUsd += r.usd;
    answeredBy = r.answeredBy || answeredBy;
    if (!/^##\s+Ideas\s*$/m.test(r.text)) throw new Error('the read came back without its Ideas section');
    replies.push(r.text.slice(Math.max(0, r.text.indexOf('## Summary'))));
  }
  const notes = joinNotes(replies);
  const parsed = parseNotes(notes);
  const v = verifyNotes(parsed, transcript);
  const base = path.join(notesDir(), `${safeKey(source.key)}.${READ_VERSION}`);
  const notesPath = `${base}.md`;
  const jsonPath = `${base}.json`;
  costUsd = Math.round(costUsd * 10000) / 10000;
  await writeAtomic(notesPath, notes);
  await writeAtomic(jsonPath, JSON.stringify({ version: READ_VERSION, key: source.key, at: new Date(d.now()).toISOString(), model, answeredBy, modelWhy: why, costUsd, parts: pieces.length, parsed }, null, 2));
  return {
    notesPath, jsonPath, model, answeredBy, modelWhy: why, costUsd, ms: d.now() - t0, parts: pieces.length,
    counts: { ideas: parsed.ideas.length, frameworks: parsed.frameworks.length, scripts: parsed.scripts.length, lines: parsed.lines.length, verifiedLines: v.verifiedLines, verifiedScripts: v.verifiedScripts },
  };
}
