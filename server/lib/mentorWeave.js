import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, readdir, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSource, setStage } from './mentorRegister.js';
import { getPerson } from './mentorPeople.js';
import { transcriptPathFor } from './mentorTranscripts.js';
import { mentorModelChoice, runMentorClaude } from './mentorRead.js';
import { laneEnabled, laneOffError } from './modelPrefs.js';
import { parsePlaybook, formatPlaybook, findPlaybookFor, mergePlaybook, writePlaybookPage, dropPlaybookCache, PLAYBOOKS_DIR } from './playbooks.js';
import { searchVault, _resetRecallCache } from './recall.js';
import { findExistingVideoPages } from './ingest.js';
import { transcriptWords, findInTranscript, timeToSeconds, normWords } from './reviewQuote.js';
import { localDateISO } from './localDate.js';
import { backupFile } from './backup.js';
import { fileTitle } from './practice.js';

// STAGE 2, THE WEAVE (Mentors, part 3, 22 Nov 2026): a batch of read sources
// into the vault. The pilot (19 Nov) gave an agent the vault and its tools:
// 154 turns, 18 minutes, $3.75 for four videos, nine times the reading. The
// fix decided that day: the model returns STRUCTURE in a few single-turn calls
// with no tools, and CODE writes every page.
//
//   A  gather   code: the verified notes, an id for every item, candidate
//               existing concepts found the way recall.js finds pages
//   B  sort     one call: which ideas are one concept, which frameworks one chapter
//   C  concepts one call per six concepts: gist, points with cites
//   D  chapters one call per chapter: method, rules, ids of verified words
//   E  book     one call: glance, principles, cards, what he took from guests
//   F  write    code only, and only once B to E have all passed their checks
//
// Every check that fails gets ONE retry with the failures listed; a second
// failure fails the batch with the vault untouched.
//
// HIS WORDS ARE CODE'S. A phrase or a script reaches a page only when the read
// found it word for word in the transcript (verifyNotes). The model is shown
// those words with an id and answers with ids; code puts the words in.
// What failed that check goes to `book.held` and is shown to no model call.
//
// NEVER FABLE, his rule for this work: mentorModelChoice refuses the Fable
// family whatever the model board says, runMentorClaude refuses it again at
// the spawn, and a reply that says Fable answered fails the batch.
//
// A PAGE CODE DID NOT CREATE IS NEVER REGENERATED: on such a page only one
// fenced block (<!-- nova:mentors <personId> --> ... <!-- /nova:mentors -->)
// and its frontmatter `sources:` list and `updated` change; every other byte
// stays. The vault's CLAUDE.md is never written. Every write is recorded with
// what was there before, so a batch undoes as one.

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const mentorsDir = () => path.join(dataRoot(), 'mentors');
const bookPath = (personId) => path.join(mentorsDir(), 'books', `${personId}.json`);
const weavesDir = () => path.join(mentorsDir(), 'weaves');
const safeKey = (key) => String(key).replace(/:/g, '_');

export const LANE = 'mentor-weave';
export const WEAVE_VERSION = 'weave-v3';
export const MAX_RAISED_PER_SOURCE = 3;
export const MAX_TOPICS = 60;
export const RAISED_STATUSES = ['new', 'kept', 'dismissed', 'research'];
export const MAX_KEYS = 10;
export const CONCEPTS_PER_CALL = 6;
export const MAX_CARDS = 60;
export const FIRST_CARDS = 15;
export const LATER_CARDS = 5;
export const PRINCIPLES_MIN = 5;
export const PRINCIPLES_MAX = 8;
const CANDIDATES_PER_IDEA = 3;
const CANDIDATE_CHARS = 240;
const EXISTING_PAGE_CHARS = 3000;
const PARALLEL_CALLS = 3;
const SYSTEM_PROMPT = 'You structure reading notes for a personal knowledge vault. Code writes every page from your answer. You reply with one JSON object and nothing else.';
const FABLE_RE = /fable|mythos/i;
// the vault schema's own index separator (its CLAUDE.md, "index.md format");
// a data format the index already uses on every line, not prose
const INDEX_SEP = ' \u2014 ';

/* ---------------------------------- deps ----------------------------------- */

let deps = null;
export function _setWeaveDepsForTest(d) { deps = d || null; }
const D = () => ({
  now: () => Date.now(),
  // (step, prompt, { model }) -> { text, usd, answeredBy } (or a plain string)
  ask: (step, prompt, { model }) => runMentorClaude(prompt, model, { lane: LANE, systemPrompt: SYSTEM_PROMPT, what: `the weave (${step})` }),
  search: async (vaultPath, query) => (await searchVault(vaultPath, query, { limit: 40 }))
    .filter((h) => h.id.startsWith('Wiki/Concepts/')).slice(0, CANDIDATES_PER_IDEA),
  // the topics he already keeps notes on: the file names in Wiki/Topics/, no extension
  topics: async (vaultPath) => (await readdir(path.join(vaultPath, 'Wiki', 'Topics'))).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)),
  ...(deps || {}),
});

/* --------------------------------- helpers --------------------------------- */

const sha = (t) => createHash('sha256').update(String(t)).digest('hex');
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s) => one(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ys = (v) => JSON.stringify(String(v ?? ''));
const yl = (arr) => `[${arr.map(ys).join(', ')}]`;
const linkOf = (rel) => path.posix.basename(rel, '.md');
// a chapter and a concept, or the book and his Entity page, can share a name,
// so a playbook or a book page is linked by its folder as the pilot did
const wikiLink = (rel) => (/^Wiki\/(Playbooks|Mentors)\//.test(rel) ? `[[${rel.replace(/^Wiki\//, '').replace(/\.md$/, '')}]]` : `[[${linkOf(rel)}]]`);
const pad2 = (n) => String(n).padStart(2, '0');
const uniq = (arr) => [...new Set(arr)];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Seconds from "7:22", "07:22", "1:02:03" or "[07:22]"; null when not a time. */
export function secOf(t) {
  if (t == null) return null;
  const m = String(t).trim().replace(/^\[|\]$/g, '').trim();
  return timeToSeconds(m);
}
/** "07:22" under an hour, "1:02:03" over; the playbook rule format reads both. */
export function fmtT(sec) {
  if (!Number.isFinite(sec)) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
const sNum = (s) => {
  const n = typeof s === 'number' ? s : Number(String(s ?? '').replace(/^S/i, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${randomBytes(3).toString('hex')}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}
const readOr = async (file, fallback = null) => { try { return await readFile(file, 'utf8'); } catch { return fallback; } };

/**
 * The only places the weave may write: a file inside vault/Wiki/ or vault/Raw/,
 * and never a CLAUDE.md. `rel` is resolved against the VAULT root, so
 * "Wiki/Concepts/A.md" is judged where it really lands, and "../x.md" or an
 * absolute path elsewhere is refused.
 */
export function vaultWriteAllowed(vaultPath, rel) {
  const root = path.resolve(vaultPath);
  const full = path.resolve(root, String(rel ?? ''));
  if (path.basename(full).toLowerCase() === 'claude.md') return false;
  return [path.join(root, 'Wiki'), path.join(root, 'Raw')].some((dir) => full.startsWith(dir + path.sep));
}
const refusal = (rel) => new Error(`the weave refused to write ${rel}: it writes only under Wiki/ and Raw/, and never CLAUDE.md`);

// Only a real person's name gets an Entity page and a [[link]]: two or more
// words, each starting with a letter and made of letters, apostrophes, full
// stops and hyphens, and none of them a role word the notes use when the
// speaker's name is not known ("Speaker 2", "Guest", "unclear").
const NOT_A_NAME = new Set(['unknown', 'unclear', 'speaker', 'guest', 'host', 'cohost', 'co-host', 'caller', 'audience', 'narrator', 'interviewer']);
export function looksLikeAName(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.every((w) => /^\p{L}[\p{L}'\u2019.-]*$/u.test(w) && !NOT_A_NAME.has(w.toLowerCase().replace(/\.+$/, '')));
}

// A first sentence cut to 200 characters at the last whole word that fits, with
// no comma, semicolon or colon left hanging at the end.
function cutAtWord(text, max = 200) {
  const t = String(text || '');
  if (t.length <= max) return t;
  let cut = t.slice(0, max);
  if (!/\s/.test(t[max])) { const i = cut.search(/\s\S*$/); if (i > 0) cut = cut.slice(0, i); }
  return cut.replace(/[\s,;:]+$/, '');
}

// The first lines of a Raw transcript page say how the words were made. The
// first three words stay as they are: lineHarvest.js recognises the page by them.
function rawLead(source, today) {
  const how = String(source?.transcript?.source || '');
  if (how === 'podcast-audio' || how === 'youtube-audio') return `Verbatim video transcript made by Nova on this Mac from the episode's audio, received ${today}.`;
  if (/caption|subtitle/i.test(how)) return `Verbatim video transcript from the video's captions, received ${today}.`;
  return `Verbatim video transcript, received ${today}.`;
}

// Words in double quotes in model-written text must be his, word for word.
// Code puts his words in by id; a quote mark in the model's own text is a
// claim about what was said, so any quoted span of 3 or more words has to be
// found in a transcript of this batch or the book.
const QUOTED_RE = /"([^"]+)"|\u201c([^\u201d]+)\u201d/g;
function quoteFailures(ctx, text, what) {
  const out = [];
  for (const m of String(text ?? '').matchAll(QUOTED_RE)) {
    const span = m[1] ?? m[2];
    if (normWords(span).length < 3) continue;
    if ((ctx.quoteWords || []).some((w) => findInTranscript(span, w, { minWords: 3 }))) continue;
    out.push(`${what} quotes "${one(span).slice(0, 60)}", which is not word for word in a transcript; say it in your own words without quote marks`);
  }
  return out;
}
const isQuoteFailure = (f) => /which is not word for word in a transcript; say it in your own words without quote marks$/.test(f);
// The model was asked twice and still put quote marks around words that are in
// no transcript (22 Nov 2026: the first real batch died on "I'm just direct" in
// a gist). The marks are the false claim, so code takes them off: the words
// stay as Nova's own, and the count goes on the batch record.
function unquoteUnverified(ctx, value) {
  let n = 0;
  const fix = (text) => text.replace(QUOTED_RE, (m, a, b) => {
    const span = a ?? b;
    if (normWords(span).length < 3) return m;
    if ((ctx.quoteWords || []).some((w) => findInTranscript(span, w, { minWords: 3 }))) return m;
    n += 1;
    return span;
  });
  const walk = (v) => {
    if (typeof v === 'string') return fix(v);
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v; }
    return v;
  };
  walk(value);
  return n;
}
async function quoteWordLists(g, book) {
  const lists = g.batch.map((x) => x.words).filter((w) => w?.length);
  const inBatch = new Set(g.batch.map((x) => x.key));
  for (const s of book.sources) {
    if (inBatch.has(s.key)) continue;
    const t = await readOr(transcriptPathFor(s.key), '');
    if (t) lists.push(transcriptWords(t));
  }
  return lists;
}

/* ---------------------------------- book ----------------------------------- */

export const emptyBook = (personId, name) => ({
  version: 1, personId, name, updatedAt: null, glance: '',
  sources: [], principles: [], chapters: [], scripts: [], cards: [], fromGuests: [], concepts: [], held: [], raised: [],
});

export async function getBook(personId) {
  const text = await readOr(bookPath(personId));
  if (text == null) return null;
  try { return JSON.parse(text); } catch {
    throw new Error(`the book for ${personId} could not be read as JSON (${bookPath(personId)})`);
  }
}

/* --------------------------------- A gather -------------------------------- */

// Every time mark the notes give for a source: the [..] marks in the markdown
// (one may hold two: "[12:51, 15:04]") and each parsed item's own. A cite is
// real only when its time is one of these.
function timesOf(md, parsed) {
  const out = new Set();
  for (const m of String(md || '').matchAll(/\[([^\]\n]*)\]/g)) {
    for (const t of m[1].matchAll(/\b(\d{1,3}:\d{2}(?::\d{2})?)\b/g)) { const s = secOf(t[1]); if (s != null) out.add(s); }
  }
  for (const list of ['ideas', 'frameworks', 'scripts', 'lines', 'stories']) {
    for (const it of parsed?.[list] || []) { const s = secOf(it.at); if (s != null) out.add(s); }
  }
  return out;
}

async function loadNotes(key) {
  const base = path.join(mentorsDir(), 'notes', `${safeKey(key)}.read-v1`);
  const jsonText = await readOr(`${base}.json`);
  if (jsonText == null) throw new Error(`the weave found no reading notes for ${key} (${base}.json); read it first`);
  let json;
  try { json = JSON.parse(jsonText); } catch { throw new Error(`the reading notes for ${key} are not valid JSON (${base}.json)`); }
  if (!json?.parsed) throw new Error(`the reading notes for ${key} carry no parsed notes`);
  return { json, md: await readOr(`${base}.md`, '') };
}

// Who speaks: the notes' hosts and guests whose names look like a person's
// (the followed person's own name always does). A source left with nobody gets
// the followed person.
const speakersOf = (parsed, fallback) => {
  const s = (parsed.people || []).filter((p) => /\b(host|guest|co-?host|speaker|interview)/i.test(p.role || '')).map((p) => one(p.name)).filter((n) => n && (looksLikeAName(n) || norm(n) === norm(fallback)));
  return s.length ? uniq(s) : [fallback];
};
// a name earns a [[link]] when it looks like a person's, or is the followed person
const canLink = (book, name) => looksLikeAName(name) || norm(name) === norm(book.name);

/** Step A: the batch's items with ids, the held words, the times per source. */
export async function gather(person, keys, book, vaultPath) {
  const d = D();
  const items = { ideas: [], frameworks: [], scripts: [], lines: [] };
  const batch = []; // { n, key, src, parsed, speakers, transcript }
  const held = [];
  const times = new Map(); // n -> Set(seconds)
  let next = Math.max(0, ...book.sources.map((s) => s.n)) + 1;
  for (const key of keys) {
    const src = await getSource(key);
    if (!src) throw new Error(`the weave has no source with key ${key}`);
    if (src.stage !== 'read') throw new Error(`${src.title || key} is at stage ${src.stage}, and only a read source can be woven`);
    if (src.hold) throw new Error(`${src.title || key} is held (${src.hold.state}: ${src.hold.why}), so it is not woven`);
    const { md, json } = await loadNotes(key);
    const parsed = json.parsed;
    const known = book.sources.find((s) => s.key === key);
    const n = known ? known.n : next++;
    const transcript = await readOr(transcriptPathFor(key), '');
    const words = transcript ? transcriptWords(transcript) : [];
    times.set(n, timesOf(md, parsed));
    const by = (x) => one(x) || 'unclear';
    (parsed.ideas || []).forEach((it, i) => items.ideas.push({ id: `I${n}.${i + 1}`, s: n, name: one(it.name), text: one(it.text), by: by(it.by), t: fmtT(secOf(it.at)) }));
    (parsed.frameworks || []).forEach((it, i) => items.frameworks.push({ id: `F${n}.${i + 1}`, s: n, name: one(it.name), useWhen: one(it.useWhen), steps: (it.steps || []).map(one), shape: it.shape || null, by: by(it.by), t: fmtT(secOf(it.at)) }));
    (parsed.scripts || []).forEach((it, i) => {
      if (!it.verified) { held.push({ kind: 'script', text: one(it.say), s: n, why: it.heldWhy || 'not found word for word in the transcript' }); return; }
      // the words he warns against are his words too: kept only when found
      let insteadOf = null;
      if (it.insteadOf && words.length) {
        const hit = findInTranscript(it.insteadOf, words);
        if (hit) insteadOf = one(it.insteadOf);
      }
      items.scripts.push({ id: `P${n}.${i + 1}`, s: n, situation: one(it.situation), say: one(it.say), insteadOf, by: by(it.by), t: fmtT(secOf(it.at)) });
    });
    (parsed.lines || []).forEach((it, i) => {
      if (!it.verified) { held.push({ kind: 'line', text: one(it.quote), s: n, why: it.heldWhy || 'not found word for word in the transcript' }); return; }
      items.lines.push({ id: `L${n}.${i + 1}`, s: n, quote: one(it.quote), by: by(it.by), t: fmtT(secOf(it.at)) });
    });
    batch.push({ n, key, src, parsed, speakers: speakersOf(parsed, person.name), transcript, words });
  }
  // sources already in the book keep their times for cites that reach back
  for (const s of book.sources) {
    if (times.has(s.n)) continue;
    try { const { md, json } = await loadNotes(s.key); times.set(s.n, timesOf(md, json.parsed)); } catch { times.set(s.n, new Set()); }
  }
  // candidate existing concepts, the way recall finds pages (words, and
  // meaning when the local embeddings are ready)
  _resetRecallCache();
  const candidates = []; // { id, rel, title, head }
  const byRel = new Map();
  for (const idea of items.ideas) {
    idea.candidates = [];
    if (!vaultPath) continue;
    let hits = [];
    try { hits = await d.search(vaultPath, `${idea.name} ${idea.text.split(/(?<=[.!?])\s/)[0] || ''}`); } catch { hits = []; }
    for (const h of hits) {
      const rel = `${h.id}.md`;
      let c = byRel.get(rel);
      if (!c) {
        const raw = await readOr(path.join(vaultPath, rel));
        if (raw == null) continue;
        c = { id: `C${candidates.length + 1}`, rel, title: linkOf(rel), head: one(raw.replace(/^---\n[\s\S]*?\n---\n?/, '')).slice(0, CANDIDATE_CHARS) };
        byRel.set(rel, c);
        candidates.push(c);
      }
      if (!idea.candidates.includes(c.id)) idea.candidates.push(c.id);
    }
  }
  // the topics he already keeps notes on; a missing folder, or a vault that
  // is not there, is simply none
  let topics = [];
  if (vaultPath) { try { topics = await d.topics(vaultPath); } catch { topics = []; } }
  topics = uniq((Array.isArray(topics) ? topics : []).map(one).filter(Boolean)).sort((a, b) => a.localeCompare(b)).slice(0, MAX_TOPICS);
  return { items, batch, held, times, candidates, topics };
}

/* ------------------------------- model calls ------------------------------- */

/** The JSON object in a reply: a fenced block, else the outermost braces. */
export function parseReply(text) {
  const t = String(text || '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(body.slice(a, b + 1)); } catch { return null; }
}

// One step's call, checked by `check`; one retry with the failures listed.
async function askChecked(ctx, step, prompt, check) {
  const d = D();
  let failures = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? prompt
      : `${prompt}\n\nYOUR LAST REPLY FAILED THESE CHECKS. Fix every one and reply again with the whole JSON object:\n${failures.map((f) => `- ${f}`).join('\n')}`;
    const t0 = d.now();
    const raw = await d.ask(step, p, { model: ctx.model });
    const r = typeof raw === 'string' ? { text: raw, usd: 0 } : (raw || {});
    if (r.answeredBy && FABLE_RE.test(r.answeredBy)) throw new Error(`the weave (${step}) was answered by ${r.answeredBy}; a mentor weave never runs on Fable (his rule), so the batch stopped`);
    ctx.calls.push({ step, ms: d.now() - t0, costUsd: Math.round((Number(r.usd) || 0) * 10000) / 10000, retried: attempt > 0 });
    ctx.costUsd += Number(r.usd) || 0;
    if (r.answeredBy) ctx.answeredBy = r.answeredBy;
    const reply = parseReply(r.text);
    failures = reply ? check(reply) : ['the reply was not a JSON object'];
    if (reply && attempt === 1 && failures.length && failures.every(isQuoteFailure)) {
      const n = unquoteUnverified(ctx, reply);
      if (n) { ctx.unquoted = (ctx.unquoted || 0) + n; failures = check(reply); }
    }
    if (!failures.length) return reply;
  }
  const e = new Error(`the weave's ${step} step failed its checks twice: ${failures.slice(0, 6).join('; ')}${failures.length > 6 ? ` (and ${failures.length - 6} more)` : ''}`);
  e.checks = failures;
  throw e;
}

async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let i = 0;
  let failed = null;
  const worker = async () => {
    while (i < tasks.length && !failed) {
      const k = i++;
      try { out[k] = await tasks[k](); } catch (e) { failed ||= e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  if (failed) throw failed;
  return out;
}

const TITLE_BAD = /[/\\:|#[\]]/;
const titleFailures = (title, what) => {
  const f = [];
  const t = one(title);
  if (!t) f.push(`${what} has no title`);
  else {
    if (t.length >= 60) f.push(`${what} "${t}" is 60 characters or more`);
    if (TITLE_BAD.test(t)) f.push(`${what} "${t}" contains one of / \\ : | # [ ]`);
  }
  return f;
};

function citeFailure(ctx, s, t, what) {
  const n = sNum(s);
  if (!n || !ctx.times.has(n)) return `${what} cites S${s}, which is not a source in this batch or the book`;
  const sec = secOf(t);
  if (sec == null) return `${what} cites S${n} at "${t}", which is not a time`;
  if (!ctx.times.get(n).has(sec)) return `${what} cites S${n} ${t}, a time that does not appear in that source's notes`;
  return null;
}

/* ---------------------------------- B sort --------------------------------- */

// The followed person among the names an item is by ("Sam Host", or "Sam Host and Gail Rowan").
const SPLIT_BY = /\s*(?:,|;|&|\/|\band\b)\s*/i;
// The read names a speaker loosely: the real notes of 22 Nov 2026 held "Jefferson
// Fisher", "Jefferson", "Fisher", "Jefferson (reading the book)" and "Jefferson
// Fisher (leading), George Stern agrees". A part counts as the person when,
// with any bracketed aside dropped, it is his full name, starts with it, or is
// his first or last name alone.
export const byPerson = (by, name) => {
  const full = norm(name);
  const words = full.split(' ').filter(Boolean);
  if (!full) return false;
  return String(by ?? '').replace(/\([^)]*\)/g, ' ').split(SPLIT_BY).some((p) => {
    const n = norm(p);
    if (!n) return false;
    if (n === full || n.startsWith(`${full} `)) return true;
    return words.length > 1 && (n === words[0] || n === words[words.length - 1]);
  });
};

function sortPrompt(ctx) {
  const { items, candidates, topics } = ctx.g;
  const b = ctx.book;
  const who = ctx.person.name;
  const lines = [
    `You are sorting reading notes from ${ctx.g.batch.length} source${ctx.g.batch.length === 1 ? '' : 's'} by or with ${who} into a personal knowledge vault. Return structure only: code writes the pages.`,
    '',
    'RULES',
    '- Every idea and every framework goes to exactly ONE of three places: a page, a note on its source, or the raised list.',
    `- A PAGE (a concept for an idea, a chapter for a framework) has to be earned. It is earned only when one of these is true: (a) ${who} is among its "by" and it is part of what ${who} teaches (his subject, as his principles, chapters and tagline in the book below show it); (b) the same idea or method comes from two or more sources; (c) it joins an existing concept or chapter ("existing": true).`,
    '- Prefer joining an existing concept or chapter over making a new one when it is the same idea, or the same method with a variation. Then set "existing": true and give its title exactly as offered below.',
    '- A NOTE ("notes") stays on that source\'s page, and on the guest\'s page when a guest said it. It is the default for a guest\'s one-off remark, a personal story, career talk, anything off the subject, and small supporting points. A note gets no page.',
    '- RAISED ("raise") is for a one-off idea or method that does not earn a page but is noteworthy for the owner of the vault: surprising, a claim worth checking, a named study, book or method worth following up, or something that touches a topic he already keeps notes on (listed below). Give "why": one plain sentence of at least 5 words on why it is worth his look. You may give "question": one research question it sparks. At most 3 raised per source; most sources raise none or one.',
    '- Scale: most sources add 3 to 8 concepts and 0 to 3 chapters. A source that adds more than 10 new concepts is being sorted too finely.',
    "- A guest's idea is the guest's: never merge a guest's idea into the host's different idea.",
    '- A chapter is a method someone could follow. A chapter may also list ideas that support it; each of those ideas must ALSO be placed in a concept, "notes" or "raise".',
    '- Titles: Title Case, under 60 characters, none of these characters: / \\ : | # [ ]',
    '- Every idea id below appears in exactly one of: a concept\'s "ideas", "notes", "raise". Every framework id appears in exactly one of: a chapter\'s "frameworks", "notes", "raise".',
    '',
    'Reply with only this JSON:',
    '{ "concepts": [{ "title": "...", "existing": false, "ideas": ["I1.1"] }], "chapters": [{ "title": "...", "existing": false, "frameworks": ["F1.1"], "ideas": ["I1.2"] }], "notes": ["I1.3", "F2.1"], "raise": [{ "id": "I4.2", "why": "...", "question": "..." }] }',
    '',
    'EXISTING CONCEPT PAGES THAT MAY BE THE SAME IDEA',
    ...(candidates.length ? candidates.map((c) => `${c.id} | ${c.title} | ${c.head}`) : ['none']),
    '',
    'CONCEPTS ALREADY IN HIS BOOK',
    ...(b.concepts.length ? b.concepts.map((c) => `- ${c.title}`) : ['none']),
    '',
    'CHAPTERS ALREADY IN HIS BOOK',
    ...(b.chapters.length ? b.chapters.map((c) => `- ${c.title}: ${c.purpose}`) : ['none']),
    '',
    'PRINCIPLES IN HIS BOOK',
    ...(b.principles.length ? b.principles.map((p) => `- ${p.name}: ${p.sentence}`) : ['none']),
    '',
    'TOPICS HE ALREADY KEEPS NOTES ON',
    ...(topics?.length ? topics.map((t) => `- ${t}`) : ['none']),
    '',
    'IDEAS',
    ...items.ideas.map((i) => `${i.id} | ${i.name} | by: ${i.by}${i.candidates.length ? ` | maybe the same as: ${i.candidates.join(', ')}` : ''}\n${i.text}`),
    '',
    'FRAMEWORKS',
    ...(items.frameworks.length ? items.frameworks.map((f) => `${f.id} | ${f.name} | by: ${f.by} | use when: ${f.useWhen || 'not stated'}`) : ['none']),
  ];
  return lines.join('\n');
}

export function checkSort(reply, ctx) {
  const f = [];
  const who = ctx.person.name;
  const ideaById = new Map(ctx.g.items.ideas.map((i) => [i.id, i]));
  const fwById = new Map(ctx.g.items.frameworks.map((x) => [x.id, x]));
  const ideaIds = new Set(ideaById.keys());
  const fwIds = new Set(fwById.keys());
  if (!Array.isArray(reply.concepts)) f.push('"concepts" is not a list');
  if (!Array.isArray(reply.chapters)) f.push('"chapters" is not a list');
  if (reply.notes != null && !Array.isArray(reply.notes)) f.push('"notes" is not a list');
  if (reply.raise != null && !Array.isArray(reply.raise)) f.push('"raise" is not a list');
  if (f.length) return f;
  const notes = reply.notes || [];
  const raise = reply.raise || [];
  // the pages the batch may join: offered above, or already in his book
  const offered = new Set([
    ...ctx.g.candidates.map((c) => norm(c.title)),
    ...ctx.book.concepts.flatMap((c) => [norm(c.title), norm(linkOf(c.page))]),
  ]);
  const bookChapters = new Set(ctx.book.chapters.map((c) => norm(c.title)));
  // a page is earned by his own subject (the followed person is among the by), or by two or more sources
  const earnedBy = (list) => list.some((x) => byPerson(x.by, who)) || new Set(list.map((x) => x.s)).size >= 2;
  const seenIdea = new Map();
  const seenFw = new Map();
  const place = (id) => {
    if (ideaIds.has(id)) seenIdea.set(id, (seenIdea.get(id) || 0) + 1);
    else if (fwIds.has(id)) seenFw.set(id, (seenFw.get(id) || 0) + 1);
  };
  for (const c of reply.concepts) {
    f.push(...titleFailures(c?.title, 'a concept'));
    const mine = [];
    for (const id of Array.isArray(c?.ideas) ? c.ideas : []) {
      if (!ideaIds.has(id)) f.push(`concept "${one(c.title)}" lists ${id}, which is not an idea id shown`);
      else mine.push(ideaById.get(id));
      seenIdea.set(id, (seenIdea.get(id) || 0) + 1);
    }
    if (!Array.isArray(c?.ideas) || !c.ideas.length) f.push(`concept "${one(c?.title)}" lists no ideas`);
    const joins = c?.existing === true && offered.has(norm(c.title));
    if (mine.length && !joins && !earnedBy(mine)) {
      f.push(`concept "${one(c.title)}" is a guest's one-off idea: put its ideas in "notes", or in "raise" if it is noteworthy${c.existing === true ? ' (it says "existing", but no page with that title was offered)' : ''}`);
    }
  }
  for (const c of reply.chapters) {
    f.push(...titleFailures(c?.title, 'a chapter'));
    const fws = [];
    for (const id of Array.isArray(c?.frameworks) ? c.frameworks : []) {
      if (!fwIds.has(id)) f.push(`chapter "${one(c.title)}" lists ${id}, which is not a framework id shown`);
      else fws.push(fwById.get(id));
      seenFw.set(id, (seenFw.get(id) || 0) + 1);
    }
    const supporting = [];
    for (const id of Array.isArray(c?.ideas) ? c.ideas : []) {
      if (!ideaIds.has(id)) f.push(`chapter "${one(c.title)}" lists ${id}, which is not an idea id shown`);
      else supporting.push(ideaById.get(id));
    }
    if ((!Array.isArray(c?.frameworks) || !c.frameworks.length) && (!Array.isArray(c?.ideas) || !c.ideas.length)) f.push(`chapter "${one(c?.title)}" lists no frameworks and no ideas`);
    // judged on its frameworks, or on its ideas when it has no frameworks
    const judged = fws.length ? fws : supporting;
    if (judged.length && !bookChapters.has(norm(c.title)) && !earnedBy(judged)) {
      f.push(`chapter "${one(c.title)}" is a guest's one-off method: put its frameworks in "notes", or in "raise" if it is noteworthy`);
    }
  }
  for (const id of notes) {
    if (!ideaIds.has(id) && !fwIds.has(id)) f.push(`"notes" lists ${id}, which is not an idea or framework id shown`);
    place(id);
  }
  const raisedPer = new Map();
  for (const r of raise) {
    const id = r?.id;
    if (typeof id !== 'string' || !id) { f.push('a "raise" entry has no id'); continue; }
    if (!ideaIds.has(id) && !fwIds.has(id)) f.push(`"raise" lists ${id}, which is not an idea or framework id shown`);
    else raisedPer.set((ideaById.get(id) || fwById.get(id)).s, (raisedPer.get((ideaById.get(id) || fwById.get(id)).s) || 0) + 1);
    place(id);
    if (one(r.why).split(' ').filter(Boolean).length < 5) f.push(`the raised item ${id} needs a "why" of at least 5 words: one plain sentence on why it is worth his look`);
    if (r.question != null && typeof r.question !== 'string') f.push(`the "question" of the raised item ${id} is not a string`);
    f.push(...quoteFailures(ctx, r.why, `the "why" of the raised item ${id}`), ...quoteFailures(ctx, typeof r.question === 'string' ? r.question : '', `the "question" of the raised item ${id}`));
  }
  for (const [s, n] of raisedPer) if (n > MAX_RAISED_PER_SOURCE) f.push(`source S${s} has ${n} raised items; the most is ${MAX_RAISED_PER_SOURCE}: move the rest to "notes"`);
  for (const id of ideaIds) {
    const n = seenIdea.get(id) || 0;
    if (n !== 1) f.push(`idea ${id} appears ${n} times across the concepts, notes and raise; it must appear exactly once`);
  }
  for (const id of fwIds) {
    const n = seenFw.get(id) || 0;
    if (n !== 1) f.push(`framework ${id} appears ${n} times across the chapters, notes and raise; it must appear exactly once`);
  }
  return f;
}

/* ------------------------------- C concepts -------------------------------- */

function conceptPrompt(ctx, group) {
  const ideaById = new Map(ctx.g.items.ideas.map((i) => [i.id, i]));
  const parts = [
    `Write the concept entries below for a personal knowledge vault, from reading notes on ${ctx.person.name} and the people he talks with. Code writes the pages from your answer.`,
    '',
    'RULES',
    '- "points": the substance of the ideas, in your own words, each with "cites": the S number and time mark of the idea it comes from, exactly as given below.',
    // an existing page shows its cites as page links, with no S number: a model
    // that repeats one of its points has to guess the number, and the cite check
    // then stops the batch (23 Nov 2026, "Keep the Door Open With Estranged Family")
    '- Write points ONLY from the ideas listed under each concept, and cite only the S numbers and times on those lines. An existing page is shown so you do not repeat it: code keeps its points and adds yours after them, so leave out whatever it already says.',
    "- \"by\": who the idea comes from. A guest's idea is the guest's.",
    '- "gist": two or three sentences. "adds": for each source when there are two or more, what it adds that the others do not. "tensions": only a real disagreement with the existing page or between sources, else [].',
    '- Keep each title exactly as given, in the same order.',
    '',
    'Reply with only this JSON:',
    '{ "concepts": [{ "title": "...", "by": ["Name"], "gist": "...", "points": [{ "text": "...", "cites": [{ "s": 1, "t": "07:22" }] }], "adds": [{ "s": 1, "text": "..." }], "tensions": [] }] }',
  ];
  group.forEach((c, k) => {
    parts.push('', `CONCEPT ${k + 1}: ${c.title}`);
    parts.push(`Existing page: ${c.existingText ? c.existingText.slice(0, EXISTING_PAGE_CHARS) : 'none'}`);
    parts.push('Ideas:');
    for (const id of c.ideas) {
      const i = ideaById.get(id);
      if (i) parts.push(`- S${i.s} ${i.t || 'no time'}, by ${i.by}. ${i.name}: ${i.text}`);
    }
  });
  return parts.join('\n');
}

function checkConcepts(reply, ctx, group) {
  const f = [];
  if (!Array.isArray(reply.concepts)) return ['"concepts" is not a list'];
  for (const c of group) {
    const got = reply.concepts.filter((x) => norm(x?.title) === norm(c.title));
    if (got.length !== 1) { f.push(`concept "${c.title}" appears ${got.length} times in the reply; it must appear once`); continue; }
    const r = got[0];
    if (!one(r.gist)) f.push(`concept "${c.title}" has no gist`);
    f.push(...quoteFailures(ctx, r.gist, `the gist of "${c.title}"`));
    if (!Array.isArray(r.by) || !r.by.map(one).filter(Boolean).length) f.push(`concept "${c.title}" names nobody in "by"`);
    if (!Array.isArray(r.points) || !r.points.length) f.push(`concept "${c.title}" has no points`);
    for (const p of Array.isArray(r.points) ? r.points : []) {
      if (!one(p?.text)) f.push(`a point of "${c.title}" has no text`);
      f.push(...quoteFailures(ctx, p?.text, `a point of "${c.title}"`));
      if (!Array.isArray(p?.cites) || !p.cites.length) f.push(`the point "${one(p?.text).slice(0, 60)}" of "${c.title}" has no cite`);
      for (const ci of Array.isArray(p?.cites) ? p.cites : []) {
        const bad = citeFailure(ctx, ci?.s, ci?.t, `a point of "${c.title}"`);
        if (bad) f.push(c.existingText ? `${bad} (cite only the ideas listed for this concept; the existing page's points are kept by code, so do not repeat them)` : bad);
      }
    }
    for (const a of Array.isArray(r.adds) ? r.adds : []) {
      const n = sNum(a?.s);
      if (!n || !ctx.times.has(n)) f.push(`"adds" of "${c.title}" names S${a?.s}, which is not a source here`);
      f.push(...quoteFailures(ctx, a?.text, `an "adds" entry of "${c.title}"`));
    }
    for (const t of Array.isArray(r.tensions) ? r.tensions : []) f.push(...quoteFailures(ctx, typeof t === 'string' ? t : t?.text, `a tension of "${c.title}"`));
    if (r.tensions != null && !Array.isArray(r.tensions)) f.push(`"tensions" of "${c.title}" is not a list`);
  }
  return f;
}

/* ------------------------------- D chapters -------------------------------- */

export const SHAPES = ['steps', 'cycle', 'ladder', 'funnel', 'versus', 'matrix', 'single'];

export function diagramFailures(dg, what = 'the diagram') {
  const f = [];
  if (!dg || typeof dg !== 'object') return [`${what} is missing`];
  if (!SHAPES.includes(dg.shape)) return [`${what} has shape "${dg.shape}", not one of ${SHAPES.join(', ')}`];
  const nodes = Array.isArray(dg.nodes) ? dg.nodes : [];
  const label = (n) => one(n?.label);
  if (['steps', 'cycle', 'ladder', 'funnel'].includes(dg.shape)) {
    if (nodes.length < 3 || nodes.length > 6) f.push(`${what} (${dg.shape}) has ${nodes.length} nodes; it needs 3 to 6`);
    if (nodes.some((n) => !label(n))) f.push(`${what} has a node with no label`);
  } else if (dg.shape === 'versus') {
    if (nodes.length < 3 || nodes.length > 6) f.push(`${what} (versus) has ${nodes.length} nodes; it needs a header and 2 to 5 pairs`);
    if (nodes.some((n) => !one(n?.left) || !one(n?.right))) f.push(`${what} (versus) has a node without both "left" and "right"`);
  } else if (dg.shape === 'matrix') {
    if (nodes.length !== 6) f.push(`${what} (matrix) has ${nodes.length} nodes; it needs two axes and exactly four cells`);
    if (nodes.some((n) => !label(n))) f.push(`${what} has a node with no label`);
  } else if (dg.shape === 'single') {
    if (nodes.length !== 1) f.push(`${what} (single) has ${nodes.length} nodes; it needs one`);
    if (nodes.some((n) => !label(n))) f.push(`${what} has a node with no label`);
  }
  return f;
}

// What one chapter's call is shown: its frameworks and ideas, and the
// verified words of every source that feeds it, by id.
function chapterMaterial(ctx, ch) {
  const fw = ch.frameworks.map((id) => ctx.g.items.frameworks.find((x) => x.id === id)).filter(Boolean);
  const ideas = ch.ideas.map((id) => ctx.g.items.ideas.find((x) => x.id === id)).filter(Boolean);
  const feeding = new Set([...fw, ...ideas].map((x) => x.s));
  const words = [
    ...ctx.g.items.scripts.filter((x) => feeding.has(x.s)),
    ...ctx.g.items.lines.filter((x) => feeding.has(x.s)),
  ];
  return { fw, ideas, words, feeding: [...feeding] };
}

function chapterPrompt(ctx, ch) {
  const { fw, ideas, words } = chapterMaterial(ctx, ch);
  const ex = ch.existingPb;
  const parts = [
    `Write one playbook chapter for the book of ${ctx.person.name}: a method a person could follow, from the material below. Code writes the page from your answer.`,
    '',
    'RULES',
    '- "triggers": 3 to 8 short lower case phrases he would say when he needs this.',
    '- "method": the steps in order, short sentences. "when": when to use it. "mistakes", "stops": where it goes wrong and where it stops applying.',
    '- "rules": each { "text", "kind": "stated" (a speaker says it) or "evidenced" (the source gives evidence), "s", "t", "needs" (optional condition) }; s and t exactly as given below.',
    '- "phraseIds": ids of the verified words below worth reusing as phrases. "scriptIds": ids of the scripts (P ids) that belong to this chapter. Give ids only, never the words.',
    '- "summary": two sentences. "takeaways": exactly three, one sentence each.',
    '- "diagram": pick the shape that is TRUE to the idea. steps, cycle, ladder, funnel: 3 to 6 nodes { "label", "detail" } in order. versus: first node { "left", "right" } names the two columns, then 2 to 5 pairs { "left", "right" }. matrix: first two nodes { "label" } name the axes, then exactly four cells { "label", "detail" }. single: one node. Use single when nothing else fits.',
    '- "clip": { "s", "t", "what" }: the minute where the method is said or shown, and one line on what is said there.',
    '',
    'Reply with only this JSON:',
    '{ "title": "...", "purpose": "one sentence", "triggers": [], "when": [], "method": [], "rules": [{ "text": "...", "kind": "stated", "s": 1, "t": "12:34" }], "phraseIds": [], "scriptIds": [], "mistakes": [], "stops": [], "summary": "...", "takeaways": ["", "", ""], "diagram": { "shape": "steps", "title": "short", "nodes": [{ "label": "...", "detail": "..." }] }, "clip": { "s": 1, "t": "04:25", "what": "..." } }',
    '',
    `CHAPTER: ${ch.title}${ch.bookChapter ? ` (in the book already: ${ch.bookChapter.purpose})` : ''}`,
  ];
  if (ex) {
    parts.push('THE PAGE AS IT STANDS (add to it, do not repeat it):');
    parts.push(`purpose: ${ex.summary}`, `when: ${ex.when.join(' / ')}`, `method: ${ex.method.join(' / ')}`, `rules: ${ex.rules.map((r) => r.text).join(' / ')}`);
  }
  parts.push('', 'FRAMEWORKS');
  if (!fw.length) parts.push('none');
  for (const x of fw) parts.push(`- S${x.s} ${x.t}, by ${x.by}. ${x.name}. Use when: ${x.useWhen || 'not stated'}. Steps: ${x.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}${x.shape ? ` Shape at reading: ${x.shape}.` : ''}`);
  parts.push('', 'SUPPORTING IDEAS');
  if (!ideas.length) parts.push('none');
  for (const i of ideas) parts.push(`- S${i.s} ${i.t}, by ${i.by}. ${i.name}: ${i.text}`);
  parts.push('', 'VERIFIED WORDS (answer with ids only)');
  if (!words.length) parts.push('none');
  for (const w of words) {
    if (w.id.startsWith('P')) parts.push(`${w.id} (S${w.s} ${w.t}, by ${w.by}) say: "${w.say}"${w.situation ? ` | situation: ${w.situation}` : ''}${w.insteadOf ? ` | instead of: "${w.insteadOf}"` : ''}`);
    else parts.push(`${w.id} (S${w.s} ${w.t}, by ${w.by}) "${w.quote}"`);
  }
  return parts.join('\n');
}

function checkChapter(reply, ctx, ch) {
  const f = [];
  const { words } = chapterMaterial(ctx, ch);
  const shown = new Set(words.map((w) => w.id));
  const list = (k) => (Array.isArray(reply[k]) ? reply[k] : null);
  if (norm(reply.title) !== norm(ch.title)) f.push(`the title is "${one(reply.title)}"; it must be "${ch.title}"`);
  if (!one(reply.purpose)) f.push('there is no purpose');
  const trig = list('triggers');
  if (!trig || trig.map(one).filter(Boolean).length < 3 || trig.length > 8) f.push(`"triggers" must hold 3 to 8 phrases (got ${trig ? trig.length : 'none'})`);
  if (!list('method')?.map(one).filter(Boolean).length) f.push('"method" has no steps');
  for (const k of ['when', 'mistakes', 'stops', 'rules', 'phraseIds', 'scriptIds']) if (reply[k] != null && !Array.isArray(reply[k])) f.push(`"${k}" is not a list`);
  for (const r of list('rules') || []) {
    if (!one(r?.text)) f.push('a rule has no text');
    if (!['stated', 'evidenced'].includes(r?.kind)) f.push(`the rule "${one(r?.text).slice(0, 50)}" has kind "${r?.kind}", not stated or evidenced`);
    const bad = citeFailure(ctx, r?.s, r?.t, `the rule "${one(r?.text).slice(0, 50)}"`);
    if (bad) f.push(bad);
  }
  for (const id of list('phraseIds') || []) if (!shown.has(id)) f.push(`phraseIds names ${id}, which was not shown`);
  for (const id of list('scriptIds') || []) if (!shown.has(id) || !String(id).startsWith('P')) f.push(`scriptIds names ${id}, which is not a script id shown`);
  if (!one(reply.summary)) f.push('there is no summary');
  const q = (text, what) => f.push(...quoteFailures(ctx, text, `${what} of "${ch.title}"`));
  q(reply.purpose, 'the purpose');
  q(reply.summary, 'the summary');
  for (const [k, what] of [['when', 'a "when" entry'], ['method', 'a method step'], ['mistakes', 'a mistake'], ['stops', 'a stop'], ['takeaways', 'a takeaway']]) for (const t of list(k) || []) q(t, what);
  for (const r of list('rules') || []) { q(r?.text, 'a rule'); q(r?.needs, 'the condition of a rule'); }
  const tk = list('takeaways');
  if (!tk || tk.map(one).filter(Boolean).length !== 3) f.push('"takeaways" must hold exactly three sentences');
  f.push(...diagramFailures(reply.diagram));
  if (reply.diagram && typeof reply.diagram === 'object') {
    q(reply.diagram.title, 'the diagram title');
    for (const n of Array.isArray(reply.diagram.nodes) ? reply.diagram.nodes : []) for (const k of ['label', 'detail', 'left', 'right']) q(n?.[k], `a diagram ${k}`);
  }
  q(reply.clip?.what, 'the clip');
  if (!reply.clip || !one(reply.clip.what)) f.push('the clip is missing or says nothing');
  else { const bad = citeFailure(ctx, reply.clip.s, reply.clip.t, 'the clip'); if (bad) f.push(bad); }
  return f;
}

/* ---------------------------------- E book --------------------------------- */

function bookPrompt(ctx, conceptsDone, chaptersDone, firstBatch) {
  const b = ctx.book;
  const guestIdeas = ctx.g.items.ideas.filter((i) => norm(i.by) !== norm(ctx.person.name) && i.by !== 'unclear');
  const cardRoom = Math.min(firstBatch ? FIRST_CARDS : LATER_CARDS, Math.max(0, MAX_CARDS - b.cards.length));
  const parts = [
    `Write the front of the book of ${ctx.person.name}, from what this batch of sources added. Code writes the page and counts everything.`,
    '',
    'RULES',
    '- "glance": three sentences, who he is and what he teaches, from the sources only.',
    `- "principles": ${PRINCIPLES_MIN} to ${PRINCIPLES_MAX} in the WHOLE book, the ideas he returns to most. Each { "name", "sentence" (one sentence, no counts in it), "existing" (true for one already in the book), "sources" (the S numbers FROM THIS BATCH that make it), "at": { "s", "t" } }. To rename an existing one, add "was": "<old name>". Code adds counts; never write "in 2 of 4" or similar.`,
    '- "chapterOrder": every chapter title below in a sensible learning order.',
    `- "cards": up to ${cardRoom} revision cards { "q", "a" (one sentence), "s", "t" }.`,
    '- "fromGuests": what he took from each guest who speaks: { "guest", "idea", "response" (how he responded), "s", "t" }. [] when there is no guest.',
    '- Every s and t exactly as given below.',
    '',
    'Reply with only this JSON:',
    '{ "glance": "...", "principles": [{ "name": "...", "sentence": "...", "existing": false, "sources": [1], "at": { "s": 1, "t": "07:22" } }], "chapterOrder": [], "cards": [{ "q": "...", "a": "...", "s": 1, "t": "08:22" }], "fromGuests": [] }',
    '',
    `THE BOOK SO FAR${b.glance ? `\nGlance: ${b.glance}` : ': empty'}`,
    ...b.principles.map((p) => `Principle: ${p.name}: ${p.sentence}`),
    ...b.chapters.map((c) => `Chapter: ${c.title}: ${c.purpose}`),
    ...b.cards.map((c) => `Card: ${c.q}`),
    '',
    `THIS BATCH: sources ${ctx.g.batch.map((x) => `S${x.n} "${x.src.title}" (speakers: ${x.speakers.join(', ')})`).join('; ')}`,
    'CONCEPTS',
    ...conceptsDone.map((c) => `- ${c.title} (by ${c.by.join(', ')}; S${c.sources.join(', S')}): ${c.gist}`),
    'CHAPTERS',
    ...chaptersDone.map((c) => `- ${c.title}: ${c.purpose} Takeaways: ${c.takeaways.join(' ')}`),
    'IDEAS WITH THEIR TIMES',
    ...ctx.g.items.ideas.map((i) => `- S${i.s} ${i.t}, by ${i.by}. ${i.name}`),
    "GUESTS' IDEAS",
    ...(guestIdeas.length ? guestIdeas.map((i) => `- S${i.s} ${i.t}, ${i.by}: ${i.name}: ${i.text}`) : ['none']),
  ];
  return { prompt: parts.join('\n'), cardRoom };
}

const COUNT_RE = /\b(in\s+)?\d+\s+of\s+\d+\b|\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+of\s+(the\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;

function checkBook(reply, ctx) {
  const f = [];
  const b = ctx.book;
  const batchNs = new Set(ctx.g.batch.map((x) => x.n));
  if (!one(reply.glance)) f.push('there is no glance');
  f.push(...quoteFailures(ctx, reply.glance, 'the glance'));
  if (!Array.isArray(reply.principles)) return [...f, '"principles" is not a list'];
  let total = b.principles.length;
  for (const p of reply.principles) {
    const what = `the principle "${one(p?.name)}"`;
    if (!one(p?.name) || !one(p?.sentence)) f.push(`${what} has no name or no sentence`);
    f.push(...quoteFailures(ctx, p?.name, `${what} (its name)`), ...quoteFailures(ctx, p?.sentence, `${what} (its sentence)`));
    if (COUNT_RE.test(String(p?.sentence || ''))) f.push(`${what} has a count in its sentence; code adds the counts`);
    const srcs = Array.isArray(p?.sources) ? p.sources.map(sNum) : [];
    if (!srcs.length) f.push(`${what} names no sources from this batch`);
    for (const n of srcs) if (!n || !batchNs.has(n)) f.push(`${what} names S${n}, which is not in this batch`);
    const bad = citeFailure(ctx, p?.at?.s, p?.at?.t, what);
    if (bad) f.push(bad);
    if (!existingPrinciple(b, p)) total += 1;
  }
  if (total < PRINCIPLES_MIN || total > PRINCIPLES_MAX) f.push(`the book would hold ${total} principles; it must hold ${PRINCIPLES_MIN} to ${PRINCIPLES_MAX}`);
  for (const c of Array.isArray(reply.cards) ? reply.cards : []) {
    if (!one(c?.q) || !one(c?.a)) f.push('a card has no question or no answer');
    f.push(...quoteFailures(ctx, c?.q, `the card "${one(c?.q).slice(0, 50)}" (its question)`), ...quoteFailures(ctx, c?.a, `the card "${one(c?.q).slice(0, 50)}" (its answer)`));
    const bad = citeFailure(ctx, c?.s, c?.t, `the card "${one(c?.q).slice(0, 50)}"`);
    if (bad) f.push(bad);
  }
  if (reply.cards != null && !Array.isArray(reply.cards)) f.push('"cards" is not a list');
  const speakers = new Set(ctx.g.batch.flatMap((x) => x.speakers).map(norm));
  for (const g of Array.isArray(reply.fromGuests) ? reply.fromGuests : []) {
    if (!speakers.has(norm(g?.guest)) || norm(g?.guest) === norm(ctx.person.name)) f.push(`"fromGuests" names "${one(g?.guest)}", who is not a guest who speaks in this batch`);
    if (!one(g?.idea)) f.push('a "fromGuests" entry has no idea');
    f.push(...quoteFailures(ctx, g?.idea, `what he took from ${one(g?.guest)} (the idea)`), ...quoteFailures(ctx, g?.response, `what he took from ${one(g?.guest)} (his response)`));
    const bad = citeFailure(ctx, g?.s, g?.t, `what he took from ${one(g?.guest)}`);
    if (bad) f.push(bad);
  }
  return f;
}

function existingPrinciple(book, p) {
  if (!p?.existing) return null;
  const want = norm(p.was || p.name);
  return book.principles.find((x) => norm(x.name) === want) || null;
}

/* ------------------------------ vault writing ------------------------------ */

const FM_RE = /^---\n([\s\S]*?)\n---(?:\n|(?![\s\S]))/;
const fmField = (text, key) => {
  const m = String(text || '').match(FM_RE);
  if (!m) return null;
  const line = m[1].split('\n').find((l) => l.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '') : null;
};
const isOurs = (text) => fmField(text, 'woven_by') === 'mentors';

/**
 * Line-level frontmatter edit of a page code did not create: the `sources:`
 * list gains the links it lacks, `updated` takes `date`, and every other byte
 * of the page stays. A page with no frontmatter is left as it is.
 */
export function editFrontmatter(text, { addSources = [], updated = null } = {}) {
  const m = text.match(FM_RE);
  if (!m) return text;
  const lines = m[1].split('\n');
  const have = m[1];
  const adds = uniq(addSources).filter((t) => !have.includes(`[[${t}]]`) && !have.includes(`[[${t}|`)).map((t) => ys(`[[${t}]]`));
  if (adds.length) {
    const i = lines.findIndex((l) => /^sources:/.test(l));
    if (i < 0) {
      lines.push(`sources: [${adds.join(', ')}]`);
    } else {
      const rest = lines[i].slice('sources:'.length);
      if (/^\s*\[.*\]\s*$/.test(rest)) {
        const inner = rest.slice(rest.indexOf('[') + 1, rest.lastIndexOf(']'));
        const tail = rest.slice(rest.lastIndexOf(']') + 1);
        lines[i] = `sources:${rest.slice(0, rest.indexOf('[') + 1)}${inner}${inner.trim() ? ', ' : ''}${adds.join(', ')}]${tail}`;
      } else if (!rest.trim()) {
        let j = i + 1;
        while (j < lines.length && /^\s+-\s/.test(lines[j])) j++;
        const indent = j > i + 1 ? lines[i + 1].match(/^(\s+-\s)/)[1] : '  - ';
        lines.splice(j, 0, ...adds.map((a) => `${indent}${a}`));
      }
      // any other shape (a single scalar) is his; it is left alone
    }
  }
  if (updated) {
    const u = lines.findIndex((l) => /^updated:/.test(l));
    if (u < 0) lines.push(`updated: ${updated}`);
    else {
      const um = lines[u].match(/^(updated:\s*)(['"]?)(.*?)(['"]?)(\s*)$/);
      lines[u] = um ? `${um[1]}${um[2]}${updated}${um[4]}${um[5]}` : `updated: ${updated}`;
    }
  }
  return `---\n${lines.join('\n')}${text.slice(4 + m[1].length)}`;
}

const OPEN = (pid) => `<!-- nova:mentors ${pid} -->`;
const CLOSE = '<!-- /nova:mentors -->';

/** Adds or replaces this person's ONE fenced block; nothing else moves. */
export function putBlock(text, personId, body) {
  const block = `${OPEN(personId)}\n${body.replace(/\n+$/, '')}\n${CLOSE}`;
  const re = new RegExp(`${esc(OPEN(personId))}[\\s\\S]*?${esc(CLOSE)}`);
  if (re.test(text)) return text.replace(re, () => block);
  return `${text.endsWith('\n') || !text ? text : `${text}\n`}\n${block}\n`;
}

const citeText = (book, cites) => {
  const out = [];
  for (const c of cites || []) {
    const src = book.sources.find((s) => s.n === sNum(c.s));
    if (src) out.push(`[[${linkOf(src.page)}]] ${c.t}`);
  }
  return out.length ? ` (${out.join('; ')})` : '';
};

function conceptPage(book, c, today) {
  const srcPages = c.sources.map((n) => book.sources.find((s) => s.n === n)).filter(Boolean).map((s) => linkOf(s.page));
  const fm = [
    '---', 'type: concept', 'tags: [mentors]', `created: ${c.created || today}`, `updated: ${today}`,
    `sources: ${yl(srcPages.map((t) => `[[${t}]]`))}`, `by: ${yl(c.by)}`, 'woven_by: mentors', '---',
  ];
  const out = [fm.join('\n'), `# ${c.title}`, '', c.gist, '', '## Points', ...c.points.map((p) => `- ${one(p.text)}${citeText(book, p.cites)}`)];
  if (c.adds?.length) {
    out.push('', '## What each source adds');
    for (const a of c.adds) {
      const s = book.sources.find((x) => x.n === a.s);
      if (s) out.push(`- [[${linkOf(s.page)}]]: ${one(a.text)}`);
    }
  }
  if (c.tensions?.length) out.push('', '## Open questions / contradictions', ...c.tensions.map((t) => `- [${t.at}] ${one(t.text)}`));
  const chapters = book.chapters.filter((ch) => (ch.concepts || []).includes(c.page)).map((ch) => wikiLink(ch.playbook));
  out.push('', '## Linked pages', ...uniq([...c.by.filter((b) => canLink(book, b)).map((b) => `[[${b}]]`), `[[${book.name}]]`, wikiLink(mentorRel(book.name)), ...chapters, ...srcPages.map((t) => `[[${t}]]`)]).map((l) => `- ${l}`));
  return `${out.join('\n')}\n`;
}

function conceptBlock(book, c) {
  const lines = [`## Mentors: [[${book.name}]]`, `By: ${c.by.join(', ')}`, ...c.points.map((p) => `- ${one(p.text)}${citeText(book, p.cites)}`)];
  for (const t of c.tensions || []) lines.push(`- Open question [${t.at}]: ${one(t.text)}`);
  return lines.join('\n');
}

function entityBlock(book, name, isPerson) {
  const mine = (by) => (by || []).some((b) => norm(b) === norm(name));
  const chapters = book.chapters.filter((ch) => isPerson || mine(ch.by));
  const concepts = book.concepts.filter((c) => mine(c.by));
  const sources = book.sources.filter((s) => isPerson || s.people.some((p) => norm(p) === norm(name)));
  const lines = [isPerson ? '## Mentors: his book' : `## Mentors: in the book of [[${book.name}]]`, `Book: ${wikiLink(mentorRel(book.name))}`];
  if (chapters.length) lines.push('Chapters:', ...chapters.map((c) => `- ${wikiLink(c.playbook)}`));
  if (concepts.length) lines.push('Concepts:', ...concepts.map((c) => `- [[${linkOf(c.page)}]]`));
  if (sources.length) lines.push('Sources:', ...sources.map((s) => `- ${s.publishedAt ? s.publishedAt.slice(0, 10) : 'date not stated'}: [[${linkOf(s.page)}]]`));
  if (!isPerson) {
    // what this guest said that has no page of its own: notes, then raised items
    const said = [];
    for (const s of book.sources) for (const n of s.notes || []) if (byPerson(n.by, name)) said.push({ s, n });
    for (const r of book.raised || []) {
      const s = book.sources.find((x) => x.n === r.s);
      if (s && byPerson(r.by, name)) said.push({ s, n: r });
    }
    if (said.length) lines.push('Also said:', ...said.map(({ s, n }) => `- [[${linkOf(s.page)}]]${one(n.t) ? ` ${one(n.t)}` : ''}: ${one(n.name)}`));
  }
  return lines.join('\n');
}

const mentorRel = (name) => `Wiki/Mentors/${fileTitle(name)}.md`;

// "- Name (By, 12:34): text", an empty part left out cleanly
function noteLine(n) {
  const by = one(n.by) && one(n.by) !== 'unclear' ? one(n.by) : '';
  const paren = [by, one(n.t)].filter(Boolean).join(', ');
  return `- ${one(n.name)}${paren ? ` (${paren})` : ''}${one(n.text) ? `: ${one(n.text)}` : ''}`;
}

// what is waiting for his look: new, kept or sent to research, newest first
const SHOWN_ON_PAGE = ['new', 'kept', 'research'];
const newestFirstBy = (list) => [...list].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
function reviewLines(book) {
  const items = newestFirstBy((book.raised || []).filter((r) => SHOWN_ON_PAGE.includes(r.status || 'new')));
  if (!items.length) return [];
  return ['## For your review', ...items.map((r) => {
    const by = one(r.by) && one(r.by) !== 'unclear' ? one(r.by) : '';
    const cite = r.s ? `S${r.s}${one(r.t) ? ` ${one(r.t)}` : ''}` : one(r.t);
    const paren = [by, cite].filter(Boolean).join('; ');
    return `- ${one(r.name)}${paren ? ` (${paren})` : ''}${one(r.text) ? `: ${one(r.text)}` : ''}${one(r.why) ? ` Why: ${one(r.why)}` : ''}${one(r.question) ? ` Question: ${one(r.question)}` : ''}${r.status === 'kept' || r.status === 'research' ? ` [${r.status}]` : ''}`;
  }), ''];
}

function sourcePageBody(book, s, links) {
  const lines = [s.summary || 'No summary in the reading notes.', ''];
  if (links.ideas.length) lines.push('## Ideas', ...links.ideas.map((x) => `- [[${x.page}]]: ${x.name}${x.t ? ` (${x.t})` : ''}`), '');
  if (links.methods.length) lines.push('## Methods', ...links.methods.map((x) => `- ${x.page}: ${x.name}${x.t ? ` (${x.t})` : ''}`), '');
  const notes = s.notes || [];
  if (notes.length) lines.push('## Also said', ...notes.map((n) => noteLine(n)), '');
  const raised = (book.raised || []).filter((r) => r.s === s.n);
  if (raised.length) lines.push('## Raised for your review', ...raised.map((r) => `${noteLine(r)}${one(r.why) ? ` Why: ${one(r.why)}` : ''}`), '');
  lines.push('## Linked pages', ...uniq([
    ...s.people.filter((p) => canLink(book, p)).map((p) => `[[${p}]]`), wikiLink(mentorRel(book.name)),
    ...links.ideas.map((x) => `[[${x.page}]]`), ...links.methods.map((x) => x.page),
  ]).map((l) => `- ${l}`));
  return lines.join('\n');
}

function sourcePage(book, s, links, today, created) {
  const fm = [
    '---', 'type: source', ...(s.raw ? [`raw: ${ys(`[[${s.raw.replace(/\.md$/, '')}]]`)}`] : []), `url: ${ys(s.url || '')}`,
    `video_id: ${ys(s.key.startsWith('yt:') ? s.key.slice(3) : '')}`, `show: ${ys(s.show || '')}`, `people: ${yl(s.people)}`,
    'tags: [video, mentors]', `created: ${created || today}`, `updated: ${today}`, 'woven_by: mentors', '---',
  ];
  return `${fm.join('\n')}\n# ${s.title}\n\n${sourcePageBody(book, s, links)}\n`;
}

/** The mentor book page, rendered whole from the Book (code's page). */
export function mentorPage(book, today, created) {
  const total = book.sources.length;
  const out = [
    ['---', 'type: mentor', `person: ${ys(`[[${book.name}]]`)}`, `sources_read: ${total}`, `created: ${created || today}`, `updated: ${today}`, 'woven_by: mentors', '---'].join('\n'),
    `# ${book.name}`, '', '## At a glance', book.glance || 'Not written yet.', '', '### Core principles',
    ...book.principles.map((p) => `- **${one(p.name)}.** ${one(p.sentence)} (in ${p.sources.length} of ${total}${p.at?.s ? `; S${p.at.s} ${p.at.t}` : ''})`),
    '', ...reviewLines(book), '## Chapters',
  ];
  for (const c of book.chapters) {
    out.push(`### ${c.title}`, `Playbook: [[${c.playbook.replace(/^Wiki\//, '').replace(/\.md$/, '')}]]`, `Summary: ${one(c.summary)}`, 'Takeaways:', ...c.takeaways.map((t) => `- ${one(t)}`));
    out.push('Diagram:', `shape: ${c.diagram.shape}`, `title: ${one(c.diagram.title)}`, 'nodes:');
    for (const n of c.diagram.nodes) out.push(n.left != null || n.right != null ? `  - ${one(n.left)} | ${one(n.right)}` : `  - ${one(n.label)}${n.detail ? ` | ${one(n.detail)}` : ''}`);
    out.push(`Clip: S${c.clip.s} ${c.clip.t} | ${one(c.clip.what)}`);
    out.push(`Counts: ${c.counts.method} steps, ${c.counts.rules} rules, ${c.counts.phrases} phrases, ${c.counts.mistakes} mistakes, ${c.counts.stops} limits`, '');
  }
  out.push('## Scripts');
  for (const s of book.scripts) out.push(`- Situation: ${one(s.situation) || 'not stated'} | Say: "${s.say}" | Instead of: ${s.insteadOf ? `"${s.insteadOf}"` : 'none'} | By: ${s.by} | S${s.s} ${s.t}`);
  out.push('', '## Revision cards', ...book.cards.map((c) => `- Q: ${one(c.q)} | A: ${one(c.a)} | S${c.s} ${c.t}`));
  if (book.fromGuests.length) out.push('', '## What he took from his guests', ...book.fromGuests.map((g) => `- ${canLink(book, g.guest) ? `[[${one(g.guest)}]]` : one(g.guest)}: ${one(g.idea)}${g.response ? ` ${one(g.response)}` : ''} (S${g.s} ${g.t})`));
  out.push('', '## Concepts', ...book.concepts.map((c) => `- [[${linkOf(c.page)}]]: ${one(c.gist).split(/(?<=[.!?])\s/)[0]}`));
  out.push('', '## Sources', ...book.sources.map((s) => `- S${s.n} | [[${linkOf(s.page)}]] | ${s.publishedAt ? s.publishedAt.slice(0, 10) : 'date not stated'} | ${s.url || 'no link'} | ${s.minutes != null ? `${s.minutes} min` : 'length not stated'}`));
  return `${out.join('\n')}\n`;
}

// Index lines go under their section heading (newest first, as the index
// already runs); a section the index lacks is added at its end.
export function addIndexLines(text, bySection) {
  let lines = text.split('\n');
  for (const [section, entries] of Object.entries(bySection)) {
    if (!entries.length) continue;
    const h = lines.findIndex((l) => l.trim() === `## ${section}`);
    if (h >= 0) lines.splice(h + 1, 0, ...entries);
    else {
      const endsBlank = lines.length && lines[lines.length - 1] === '';
      const add = ['', `## ${section}`, ...entries];
      if (endsBlank) lines.splice(lines.length - 1, 0, ...add); else lines = [...lines, ...add];
    }
  }
  return lines.join('\n');
}

/* --------------------------------- the run --------------------------------- */

let active = null; // personId of the weave in flight in this process

/**
 * Weave up to ten read sources of one person into the vault. Returns the
 * batch record (also saved to dataRoot()/mentors/weaves/<batchId>.json).
 */
export async function weaveBatch(personId, keys, { vaultPath } = {}) {
  if (!vaultPath) throw new Error('the weave needs the vault path (VAULT_PATH), and none was given');
  if (!Array.isArray(keys) || !keys.length) throw new Error('the weave was given no sources');
  if (keys.length > MAX_KEYS) throw new Error(`the weave takes at most ${MAX_KEYS} sources at a time, and was given ${keys.length}`);
  if (new Set(keys).size !== keys.length) throw new Error('the weave was given the same source twice');
  if (!laneEnabled(LANE)) throw laneOffError(LANE);
  if (active) throw new Error(`a weave is already running (for ${active}); one at a time`);
  // taken before the first await, so two calls in the same tick cannot both pass
  active = personId;
  try {
    const person = await getPerson(personId);
    if (!person) throw new Error(`no person called "${personId}" is followed or known`);
    return await runWeave(person, keys, vaultPath);
  } finally { active = null; }
}

async function runWeave(person, keys, vaultPath) {
  const d = D();
  const t0 = d.now();
  const nowDate = new Date(t0);
  const today = localDateISO(nowDate);
  const { model, why } = mentorModelChoice(LANE);
  if (FABLE_RE.test(model)) throw new Error(`the weave was handed ${model}; a mentor weave never runs on Fable (his rule)`);
  if (why) console.log(`mentorWeave: ${why}`);
  const bookBefore = await getBook(person.id);
  const book = structuredClone(bookBefore || emptyBook(person.id, person.name));
  book.name = book.name || person.name;
  const firstBatch = !book.sources.length;

  const g = await gather(person, keys, book, vaultPath);
  const ctx = { person, book, g, times: g.times, model, calls: [], costUsd: 0, answeredBy: null, quoteWords: await quoteWordLists(g, book) };

  /* B */
  const sorted = await askChecked(ctx, 'sort', sortPrompt(ctx), (r) => checkSort(r, ctx));
  // Ideas and frameworks sorted to a note or to the raised list take no more
  // model calls: their text is the read notes' own. That text is model-written,
  // so a quote mark in it must hold transcript words or lose its marks.
  const ideaItem = new Map(g.items.ideas.map((i) => [i.id, i]));
  const fwItem = new Map(g.items.frameworks.map((x) => [x.id, x]));
  const plainItem = (id) => {
    const i = ideaItem.get(id);
    if (i) return { kind: 'idea', name: i.name, text: i.text, by: i.by, s: i.s, t: i.t };
    const x = fwItem.get(id);
    return { kind: 'framework', name: x.name, text: x.useWhen || '', by: x.by, s: x.s, t: x.t };
  };
  const noteItems = (sorted.notes || []).map(plainItem);
  const raisedItems = (sorted.raise || []).map((r) => ({ ...plainItem(r.id), why: one(r.why), question: one(r.question) }));
  ctx.unquoted = (ctx.unquoted || 0) + unquoteUnverified(ctx, [noteItems, raisedItems]);
  const offeredConcepts = new Map();
  for (const c of g.candidates) offeredConcepts.set(norm(c.title), { rel: c.rel, title: c.title });
  for (const c of book.concepts) offeredConcepts.set(norm(c.title), { rel: c.page, title: linkOf(c.page) });
  const concepts = [];
  for (const c of sorted.concepts) {
    const hit = c.existing ? offeredConcepts.get(norm(c.title)) : null;
    let rel = hit ? hit.rel : `Wiki/Concepts/${fileTitle(one(c.title))}.md`;
    const title = hit ? hit.title : linkOf(rel);
    const prior = concepts.find((x) => x.rel === rel);
    if (prior) { prior.ideas.push(...c.ideas); continue; } // two entries for one page are one concept
    const onDisk = await readOr(path.join(vaultPath, rel));
    const inBook = book.concepts.find((x) => x.page === rel);
    concepts.push({ title, rel, ideas: [...c.ideas], existingText: onDisk ? onDisk.replace(FM_RE, '') : null, onDisk, inBook });
  }
  const chapters = [];
  for (const c of sorted.chapters) {
    const bookChapter = book.chapters.find((x) => norm(x.title) === norm(c.title));
    const title = bookChapter ? bookChapter.title : fileTitle(one(c.title));
    const prior = chapters.find((x) => norm(x.title) === norm(title));
    if (prior) { prior.frameworks.push(...(c.frameworks || [])); prior.ideas.push(...(c.ideas || [])); continue; }
    chapters.push({ title, frameworks: [...(c.frameworks || [])], ideas: [...(c.ideas || [])], bookChapter: bookChapter || null });
  }
  // where each chapter's page goes: an existing playbook page is merged only
  // when it is in code's own format (a parse -> format round trip is
  // byte-identical); a page he wrote by hand is never regenerated, so the
  // chapter takes its own page beside it
  for (const ch of chapters) {
    let title = ch.title;
    let found = await findPlaybookFor(vaultPath, title);
    if (found && !ch.bookChapter) {
      const raw = await readOr(path.join(vaultPath, found.relPath), '');
      if (formatPlaybook(parsePlaybook(raw)) !== raw) {
        title = `${ch.title} (${person.name})`;
        found = await findPlaybookFor(vaultPath, title);
      }
    }
    if (found) {
      const raw = await readOr(path.join(vaultPath, found.relPath), '');
      if (formatPlaybook(parsePlaybook(raw)) !== raw) throw new Error(`the playbook page ${found.relPath} is not in the format code writes (it was edited by hand), so the weave will not rewrite it; nothing was written`);
    }
    ch.pageTitle = title;
    ch.existingPb = found ? parsePlaybook(await readOr(path.join(vaultPath, found.relPath), '')) : null;
  }

  /* C and D, side by side */
  const groups = [];
  for (let i = 0; i < concepts.length; i += CONCEPTS_PER_CALL) groups.push(concepts.slice(i, i + CONCEPTS_PER_CALL));
  const tasks = [
    ...groups.map((grp) => async () => ({ kind: 'c', grp, reply: await askChecked(ctx, 'concepts', conceptPrompt(ctx, grp), (r) => checkConcepts(r, ctx, grp)) })),
    ...chapters.map((ch) => async () => ({ kind: 'd', ch, reply: await askChecked(ctx, 'chapter', chapterPrompt(ctx, ch), (r) => checkChapter(r, ctx, ch)) })),
  ];
  const results = await pool(tasks, PARALLEL_CALLS);

  const sourceOf = new Map(g.items.ideas.map((i) => [i.id, i.s]));
  for (const res of results.filter((r) => r.kind === 'c')) {
    for (const c of res.grp) {
      const r = res.reply.concepts.find((x) => norm(x.title) === norm(c.title));
      c.reply = {
        by: uniq(r.by.map(one).filter(Boolean)),
        gist: one(r.gist),
        points: r.points.map((p) => ({ text: one(p.text), cites: p.cites.map((x) => ({ s: sNum(x.s), t: fmtT(secOf(x.t)) })) })),
        adds: (r.adds || []).filter((a) => one(a?.text)).map((a) => ({ s: sNum(a.s), text: one(a.text) })),
        tensions: (r.tensions || []).map(one).filter(Boolean).map((text) => ({ text, at: today })),
      };
      c.sources = uniq(c.ideas.map((id) => sourceOf.get(id)).filter(Boolean));
    }
  }
  const scriptById = new Map(g.items.scripts.map((x) => [x.id, x]));
  const lineById = new Map(g.items.lines.map((x) => [x.id, x]));
  for (const res of results.filter((r) => r.kind === 'd')) res.ch.reply = res.reply;

  /* E */
  const conceptsDone = concepts.map((c) => ({ title: c.title, by: c.reply.by, sources: c.sources, gist: c.reply.gist }));
  const chaptersDone = chapters.map((c) => ({ title: c.title, purpose: one(c.reply.purpose), takeaways: c.reply.takeaways.map(one) }));
  // the order call must see every chapter title the book will hold
  const allChapterTitles = uniq([...book.chapters.map((c) => c.title), ...chapters.map((c) => c.title)]);
  const { prompt: ePrompt, cardRoom } = bookPrompt(ctx, conceptsDone, chaptersDone.concat(book.chapters.filter((c) => !chapters.some((x) => norm(x.title) === norm(c.title))).map((c) => ({ title: c.title, purpose: c.purpose, takeaways: c.takeaways }))), firstBatch);
  const front = await askChecked(ctx, 'book', ePrompt, (r) => checkBook(r, ctx));

  /* ---- everything has passed: build the new book and the plan of files ---- */

  const batchId = `${person.id}-${new Date(t0).toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;

  // sources
  for (const x of g.batch) {
    const s = x.src;
    let entry = book.sources.find((y) => y.key === x.key);
    if (!entry) { entry = { n: x.n, key: x.key }; book.sources.push(entry); }
    Object.assign(entry, {
      title: s.title || x.key, url: s.url || null, publishedAt: s.publishedAt || null,
      minutes: s.durationSec ? Math.round(s.durationSec / 60) : null, people: x.speakers, show: s.show || null,
    });
    // pages: one the vault already holds for this video, else a new one
    const existing = s.url ? await findExistingVideoPages(vaultPath, s.url) : { pages: [], transcriptRel: null };
    let page = s.vault?.sourcePage && existsSync(path.join(vaultPath, s.vault.sourcePage)) ? s.vault.sourcePage : existing.pages[0] || null;
    let base;
    if (page) base = linkOf(page);
    else {
      base = fileTitle(s.title || x.key);
      if (existsSync(path.join(vaultPath, `Wiki/Sources/${base}.md`))) base = `${base} ${x.key.replace(/[^A-Za-z0-9]/g, '').slice(-8)}`;
      page = `Wiki/Sources/${base}.md`;
    }
    entry.page = page;
    const rawHave = s.vault?.rawPage && existsSync(path.join(vaultPath, s.vault.rawPage)) ? s.vault.rawPage : existing.transcriptRel;
    entry.raw = rawHave || `Raw/${base} (Transcript).md`;
    entry.rawNew = !rawHave;
    entry.summary = one(x.parsed.summary);
    entry.notes = noteItems.filter((n) => n.s === x.n).map(({ kind, name, text, by, t }) => ({ kind, name, text, by, t }));
  }
  book.sources.sort((a, b) => a.n - b.n);
  // raised for his review: a stable id per item, unique in the book
  book.raised ||= [];
  const usedRids = new Set(book.raised.map((r) => r.rid));
  const raisedAt = new Date(t0).toISOString();
  const raisedSeq = new Map();
  for (const r of raisedItems) {
    let k = raisedSeq.get(r.s) || 0;
    let rid;
    do { k += 1; rid = `R${r.s}.${k}`; } while (usedRids.has(rid));
    raisedSeq.set(r.s, k);
    usedRids.add(rid);
    book.raised.push({ rid, kind: r.kind, name: r.name, text: r.text, by: r.by, s: r.s, t: r.t, why: r.why, question: r.question, status: 'new', at: raisedAt, batchId });
  }

  // concepts into the book
  for (const c of concepts) {
    let entry = book.concepts.find((y) => y.page === c.rel);
    const mine = entry ? entry.mine : !c.onDisk;
    if (!entry) { entry = { title: c.title, page: c.rel, by: [], gist: '', sources: [], mine, points: [], adds: [], tensions: [], created: mine ? today : null }; book.concepts.push(entry); }
    entry.by = uniq([...entry.by, ...c.reply.by]);
    entry.gist = c.reply.gist;
    entry.sources = uniq([...entry.sources, ...c.sources]).sort((a, b) => a - b);
    const seen = new Set(entry.points.map((p) => norm(p.text)));
    for (const p of c.reply.points) if (!seen.has(norm(p.text))) { entry.points.push(p); seen.add(norm(p.text)); }
    entry.adds = [...entry.adds.filter((a) => !c.reply.adds.some((b) => b.s === a.s)), ...c.reply.adds];
    const seenT = new Set(entry.tensions.map((t) => norm(t.text)));
    for (const t of c.reply.tensions) if (!seenT.has(norm(t.text))) entry.tensions.push(t);
    c.entry = entry;
  }

  // chapters: the playbook object, phrases as the verified words
  const scriptsAdded = [];
  for (const ch of chapters) {
    const r = ch.reply;
    const used = [];
    const local = (n) => { if (!used.includes(n)) used.push(n); return used.indexOf(n) + 1; };
    const rules = r.rules.map((x) => ({ text: one(x.text), kind: x.kind, source: local(sNum(x.s)), at: fmtT(secOf(x.t)), ...(one(x.needs) ? { needs: one(x.needs) } : {}) }));
    const { fw, ideas, feeding } = chapterMaterial(ctx, ch);
    for (const n of feeding.sort((a, b) => a - b)) local(n);
    const phrases = uniq((r.phraseIds || []).map((id) => (id.startsWith('P') ? scriptById.get(id)?.say : lineById.get(id)?.quote)).filter(Boolean));
    const speakerFor = (n) => uniq([...fw, ...ideas].filter((x) => x.s === n && x.by !== 'unclear').map((x) => x.by)).join(' and ') || person.name;
    const incoming = {
      type: 'playbook', title: ch.pageTitle, summary: one(r.purpose),
      triggers: uniq(r.triggers.map((t) => one(t).toLowerCase()).filter(Boolean)),
      agents: ['all'],
      sources: used.map((n, i) => { const s = book.sources.find((y) => y.n === n); return { n: i + 1, title: s.title, speaker: speakerFor(n), url: s.url || '' }; }),
      when: (r.when || []).map(one).filter(Boolean), method: r.method.map(one).filter(Boolean), rules,
      phrases, mistakes: (r.mistakes || []).map(one).filter(Boolean), stops: (r.stops || []).map(one).filter(Boolean), disagreements: [],
    };
    const existingFull = await findPlaybookFor(vaultPath, ch.pageTitle);
    const merged = mergePlaybook(existingFull, incoming, { now: nowDate });
    const content = formatPlaybook(merged);
    // the round trip, before anything is written: the page must parse back
    // to the structure code built, and format back to the same bytes
    const back = parsePlaybook(content);
    if (formatPlaybook(back) !== content || back.rules.length !== merged.rules.length || back.phrases.length !== merged.phrases.length || back.method.length !== merged.method.length || back.title !== one(merged.title)) {
      throw new Error(`the chapter "${ch.title}" would not parse back to the structure code built, so nothing was written`);
    }
    ch.incoming = incoming;
    ch.content = content;
    ch.rel = existingFull ? existingFull.relPath : `${PLAYBOOKS_DIR}/${fileTitle(merged.title)}.md`;
    ch.counts = { method: back.method.length, rules: back.rules.length, phrases: back.phrases.length, mistakes: back.mistakes.length, stops: back.stops.length };
    let entry = book.chapters.find((y) => norm(y.title) === norm(ch.title));
    if (!entry) { entry = { id: `ch${book.chapters.length + 1}`, title: ch.title }; book.chapters.push(entry); }
    Object.assign(entry, {
      playbook: ch.rel, purpose: one(r.purpose), summary: one(r.summary), takeaways: r.takeaways.map(one),
      diagram: { shape: r.diagram.shape, title: one(r.diagram.title), nodes: r.diagram.nodes.map((n) => (r.diagram.shape === 'versus' ? { left: one(n.left), right: one(n.right) } : { label: one(n.label), ...(one(n.detail) ? { detail: one(n.detail) } : {}) })) },
      clip: { s: sNum(r.clip.s), t: fmtT(secOf(r.clip.t)), what: one(r.clip.what) },
      sources: uniq([...(entry.sources || []), ...feeding]).sort((a, b) => a - b),
      counts: ch.counts,
      by: uniq([...(entry.by || []), ...fw.map((x) => x.by), ...ideas.map((x) => x.by)].filter((b) => b && b !== 'unclear')),
      concepts: uniq([...(entry.concepts || []), ...concepts.filter((c) => c.ideas.some((id) => ch.ideas.includes(id))).map((c) => c.rel)]),
    });
    ch.entry = entry;
    for (const id of r.scriptIds || []) {
      const sc = scriptById.get(id);
      if (!sc || book.scripts.some((y) => y.id === id)) continue;
      const item = { id, situation: sc.situation, say: sc.say, insteadOf: sc.insteadOf, by: sc.by, s: sc.s, t: sc.t, chapterId: entry.id };
      book.scripts.push(item);
      scriptsAdded.push(item);
    }
  }

  // the front of the book
  book.glance = one(front.glance);
  let pk = book.principles.length;
  for (const p of front.principles) {
    const ex = existingPrinciple(book, p);
    const srcs = p.sources.map(sNum);
    const at = { s: sNum(p.at.s), t: fmtT(secOf(p.at.t)) };
    if (ex) {
      ex.name = one(p.name);
      ex.sentence = one(p.sentence);
      ex.sources = uniq([...ex.sources, ...srcs]).sort((a, b) => a - b);
    } else book.principles.push({ id: `pr${++pk}`, name: one(p.name), sentence: one(p.sentence), sources: uniq(srcs).sort((a, b) => a - b), at });
  }
  const order = (front.chapterOrder || []).map(norm);
  const rank = (t) => { const i = order.indexOf(norm(t)); return i < 0 ? order.length + allChapterTitles.indexOf(t) : i; };
  book.chapters.sort((a, b) => rank(a.title) - rank(b.title));
  let ck = book.cards.length;
  const newCards = (front.cards || []).slice(0, cardRoom).map((c) => ({ id: `cd${++ck}`, q: one(c.q), a: one(c.a), s: sNum(c.s), t: fmtT(secOf(c.t)) }));
  book.cards.push(...newCards);
  for (const x of front.fromGuests || []) book.fromGuests.push({ guest: one(x.guest), idea: one(x.idea), response: one(x.response), s: sNum(x.s), t: fmtT(secOf(x.t)) });
  const heldKey = (h) => `${h.kind}|${h.s}|${norm(h.text)}`;
  const heldSeen = new Set(book.held.map(heldKey));
  for (const h of g.held) if (!heldSeen.has(heldKey(h))) { book.held.push(h); heldSeen.add(heldKey(h)); }
  book.updatedAt = new Date(t0).toISOString();

  /* F: the plan, every file's new text, then the writes */
  const plan = []; // { rel, text, before, playbook? }
  const planFile = async (rel, make) => {
    if (!vaultWriteAllowed(vaultPath, rel)) throw refusal(rel);
    const before = await readOr(path.join(vaultPath, rel));
    const text = await make(before);
    if (text != null && text !== before) plan.push({ rel, text, before });
  };

  // 1. Raw transcripts, headed with how the words were really made
  for (const x of g.batch) {
    const e = book.sources.find((y) => y.key === x.key);
    if (!e.rawNew || !x.transcript) continue;
    await planFile(e.raw, async (before) => (before != null ? null
      : `${rawLead(x.src, today)}\nSource URL: ${e.url || '(unknown)'}\nSource page: [[${linkOf(e.page)}]]\n\n---\n\n${x.transcript}`));
  }
  if (g.batch.some((x) => { const e = book.sources.find((y) => y.key === x.key); return e.rawNew && !x.transcript; })) {
    for (const x of g.batch) { const e = book.sources.find((y) => y.key === x.key); if (e.rawNew && !x.transcript) { e.raw = null; } }
  }

  // 2. Source pages
  const ideaPage = new Map();
  for (const c of concepts) for (const id of c.ideas) ideaPage.set(id, linkOf(c.rel));
  const fwPage = new Map();
  for (const ch of chapters) for (const id of ch.frameworks) fwPage.set(id, wikiLink(ch.rel));
  for (const x of g.batch) {
    const e = book.sources.find((y) => y.key === x.key);
    const links = {
      ideas: g.items.ideas.filter((i) => i.s === x.n).map((i) => ({ page: ideaPage.get(i.id), name: i.name, t: i.t })).filter((l) => l.page),
      methods: g.items.frameworks.filter((f) => f.s === x.n).map((f) => ({ page: fwPage.get(f.id), name: f.name, t: f.t })).filter((l) => l.page),
    };
    const pe = { ...e, raw: e.raw || '' };
    await planFile(e.page, async (before) => {
      if (before == null) return sourcePage(book, pe, links, today);
      if (isOurs(before)) return sourcePage(book, pe, links, today, fmField(before, 'created'));
      return putBlock(editFrontmatter(before, { updated: today }), person.id, `## Mentors: [[${book.name}]]\n${sourcePageBody(book, pe, links)}`);
    });
  }

  // 3. Concept pages
  const conceptsCreated = [];
  const conceptsEdited = [];
  for (const c of concepts) {
    const entry = c.entry;
    await planFile(c.rel, async (before) => {
      if (before == null || (entry.mine && isOurs(before))) {
        (before == null ? conceptsCreated : conceptsEdited).push(c.rel);
        if (before == null) { entry.mine = true; entry.created = entry.created || today; }
        return conceptPage(book, entry, today);
      }
      entry.mine = false;
      conceptsEdited.push(c.rel);
      const srcPages = entry.sources.map((n) => book.sources.find((s) => s.n === n)).filter(Boolean).map((s) => linkOf(s.page));
      return putBlock(editFrontmatter(before, { addSources: srcPages, updated: today }), person.id, conceptBlock(book, entry));
    });
  }

  // 4. Playbook chapters (writePlaybookPage at write time; checked against this)
  for (const ch of chapters) {
    if (!vaultWriteAllowed(vaultPath, ch.rel)) throw refusal(ch.rel); // these skip planFile, so they are checked here
    plan.push({ rel: ch.rel, text: ch.content, before: await readOr(path.join(vaultPath, ch.rel)), playbook: ch.incoming });
  }

  // 5. Entities: him, and every guest who speaks
  const guests = uniq(g.batch.flatMap((x) => x.speakers)).filter((n) => norm(n) !== norm(person.name));
  for (const [name, isPerson] of [[book.name, true], ...guests.map((n) => [n, false])]) {
    const rel = `Wiki/Entities/${fileTitle(name)}.md`;
    const srcPages = book.sources.filter((s) => isPerson || s.people.some((p) => norm(p) === norm(name))).map((s) => linkOf(s.page));
    await planFile(rel, async (before) => {
      const base = before != null ? before
        : `---\ntype: entity\ntags: [person, mentors]\ncreated: ${today}\nupdated: ${today}\nsources: []\n---\n\n# ${name}\n`;
      return putBlock(editFrontmatter(base, { addSources: srcPages, updated: today }), person.id, entityBlock(book, name, isPerson));
    });
  }

  // 6. The book page
  const bookRel = mentorRel(book.name);
  await planFile(bookRel, async (before) => {
    if (before != null && !isOurs(before)) throw new Error(`${bookRel} exists and was not written by Mentors, so the weave will not replace it; nothing was written`);
    return mentorPage(book, today, before ? fmField(before, 'created') : null);
  });

  // 7. index and log, by line insertion
  const createdRels = plan.filter((p) => p.before == null).map((p) => p.rel);
  const editedRels = plan.filter((p) => p.before != null).map((p) => p.rel);
  const idx = (rel) => {
    const t = linkOf(rel);
    if (rel.startsWith('Wiki/Sources/')) { const s = book.sources.find((x) => x.page === rel); return ['Sources', `- [[${t}]]${INDEX_SEP}${cutAtWord((s?.summary || '').split(/(?<=[.!?])\s/)[0])} (updated ${today})`]; }
    if (rel.startsWith('Wiki/Concepts/')) { const c = book.concepts.find((x) => x.page === rel); return ['Concepts', `- [[${t}]]${INDEX_SEP}${cutAtWord((c?.gist || '').split(/(?<=[.!?])\s/)[0])} (updated ${today})`]; }
    if (rel.startsWith('Wiki/Entities/')) return ['Entities', `- [[${t}]]${INDEX_SEP}a person in the Mentors book of ${book.name} (updated ${today})`];
    if (rel.startsWith(`${PLAYBOOKS_DIR}/`)) { const c = book.chapters.find((x) => x.playbook === rel); return ['Playbooks', `- ${wikiLink(rel)}${INDEX_SEP}${c?.purpose || 'a playbook chapter'} (updated ${today})`]; }
    if (rel.startsWith('Wiki/Mentors/')) return ['Mentors', `- ${wikiLink(rel)}${INDEX_SEP}the book of ${book.name}: ${book.sources.length} sources, ${book.chapters.length} chapters (updated ${today})`];
    return null;
  };
  const bySection = { Sources: [], Entities: [], Concepts: [], Playbooks: [], Mentors: [] };
  for (const rel of createdRels) { const e = idx(rel); if (e) bySection[e[0]].push(e[1]); }
  // what the weave adds to the index is recorded exactly, so an undo can take
  // out just these lines when other writers have touched the file since
  let indexLines = [];
  let indexSections = [];
  await planFile('Wiki/index.md', async (before) => {
    if (before == null) return null;
    indexLines = Object.values(bySection).flat();
    indexSections = Object.entries(bySection).filter(([sec, es]) => es.length && !before.split('\n').some((l) => l.trim() === `## ${sec}`)).map(([sec]) => sec);
    return addIndexLines(before, bySection);
  });
  const wl = wikiLink;
  const entry = [
    `## [${today}] ingest | Mentors weave: ${book.name} (${g.batch.length} source${g.batch.length === 1 ? '' : 's'})`,
    `- Created: ${createdRels.map(wl).join(', ') || 'none'}`,
    `- Updated: ${editedRels.map(wl).join(', ') || 'none'}`,
    `- Notes: ${g.held.length} quoted line${g.held.length === 1 ? '' : 's'} held back (not word for word in the transcript); ${concepts.reduce((n, c) => n + c.reply.tensions.length, 0)} tension${concepts.reduce((n, c) => n + c.reply.tensions.length, 0) === 1 ? '' : 's'} recorded, none resolved${[noteItems.length ? `${noteItems.length} idea${noteItems.length === 1 ? '' : 's'} kept as notes on their source pages` : '', raisedItems.length ? `${raisedItems.length} raised for his review` : ''].filter(Boolean).map((t) => `; ${t}`).join('')}. Woven by code from ${ctx.calls.length} model calls on ${model}.`,
  ].join('\n');
  let logLead = '\n';
  await planFile('Wiki/log.md', async (before) => {
    if (before == null) return null;
    logLead = `${before.endsWith('\n') ? '' : '\n'}\n`;
    return `${before}${logLead}${entry}\n`;
  });

  /* the writes, recorded; a failure part way puts back what was written */
  const dirsCreated = [];
  for (const p of plan) {
    for (let dir = path.dirname(path.join(vaultPath, p.rel)); !existsSync(dir); dir = path.dirname(dir)) {
      const rel = path.relative(vaultPath, dir);
      if (!dirsCreated.includes(rel)) dirsCreated.unshift(rel);
    }
  }
  const planned = plan.map((p) => ({ relPath: p.rel, created: p.before == null, before: p.before, afterHash: sha(p.text) }));
  const vaultBefore = {};
  for (const x of g.batch) vaultBefore[x.key] = x.src.vault || null;
  const recFile = path.join(weavesDir(), `${batchId}.json`);
  const base = {
    batchId, personId: person.id, at: new Date(t0).toISOString(), version: WEAVE_VERSION, model, answeredBy: ctx.answeredBy, modelWhy: why,
    keys, calls: ctx.calls, costUsd: Math.round(ctx.costUsd * 10000) / 10000,
    unquoted: ctx.unquoted || 0,
    dirsCreated, bookBefore: bookBefore || null, vaultBefore,
    counts: {
      sources: g.batch.length, concepts: conceptsCreated.length, conceptsEdited: conceptsEdited.length,
      chapters: chapters.length, scripts: scriptsAdded.length, cards: newCards.length, held: g.held.length,
      notes: noteItems.length, raised: raisedItems.length,
    },
    indexLines, indexSections, logEntry: entry, logLead,
    undoneAt: null,
  };
  // The record goes down BEFORE the first vault write, marked pending and
  // listing every file the weave means to touch. If the process dies from here
  // on, or the book or the register fails, the next start-up (or an undo) puts
  // the vault back from it. It loses `pending` only when everything succeeded.
  await writeAtomic(recFile, JSON.stringify({ ...base, files: planned, ms: d.now() - t0, pending: true }, null, 2));
  const files = [];
  try {
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const full = path.join(vaultPath, p.rel);
      files.push(planned[i]); // recorded first, so a failing check below still gets this file put back
      if (p.playbook) {
        const w = await writePlaybookPage(vaultPath, p.playbook, { now: nowDate });
        // what is on disk now is what an undo must expect, even when it is not what was planned
        Object.assign(planned[i], { created: w.created, afterHash: sha(w.content), ...(w.prior != null ? { before: w.prior } : {}) });
        if (w.content !== p.text) throw new Error(`the chapter page ${p.rel} came out different from the text checked before writing`);
        const reread = await readFile(full, 'utf8');
        if (formatPlaybook(parsePlaybook(reread)) !== reread) throw new Error(`the chapter page ${p.rel} did not parse back after writing`);
        continue;
      }
      await mkdir(path.dirname(full), { recursive: true });
      if (p.before != null) await backupFile(full);
      await writeFile(full, p.text, 'utf8');
    }
  } catch (e) {
    const out = await restoreFiles(vaultPath, files, dirsCreated, base);
    if (out.left.length) {
      // something could not be put back: the pending record stays, so it is not lost
      await writeAtomic(recFile, JSON.stringify({ ...base, files, ms: d.now() - t0, pending: true, failedWrite: e.message }, null, 2)).catch(() => {});
      throw new Error(`the weave failed while writing (${e.message}); files it could not put back: ${out.left.map((l) => `${l.relPath} (${l.why})`).join('; ')}`);
    }
    try { await unlink(recFile); } catch { /* it never landed */ }
    throw new Error(`the weave failed while writing (${e.message}); every file it had written was put back`);
  }
  dropPlaybookCache();

  // the book, then the register
  for (const s of book.sources) delete s.rawNew;
  await writeAtomic(bookPath(person.id), JSON.stringify(book, null, 2));
  for (const x of g.batch) {
    const e = book.sources.find((y) => y.key === x.key);
    await setStage(x.key, 'woven', { woven: { version: WEAVE_VERSION, at: new Date(t0).toISOString(), batchId }, vault: { sourcePage: e.page, rawPage: e.raw } });
  }
  const record = { ...base, files, ms: d.now() - t0 };
  await writeAtomic(recFile, JSON.stringify(record, null, 2));
  return record;
}

/* ---------------------------------- undo ----------------------------------- */

// The weave's own lines out of index.md or log.md after other writers have
// added to the file since. Each recorded index line is taken out once (the
// first exact match), and the log entry with the blank line the weave put
// before it. Anything not found exactly leaves the file as it is. A section
// heading the weave added goes too, but only when nothing else sits under it.
// Returns { text } to write, or { why } when the file must be left alone.
function withoutWeaveLines(rel, cur, extras) {
  const edited = 'it was edited after the weave, so it was left as it is';
  if (rel === 'Wiki/index.md' && extras.indexLines?.length) {
    const lines = cur.split('\n');
    for (const l of extras.indexLines) {
      const i = lines.indexOf(l);
      if (i < 0) return { why: `${edited}; the weave's index line "${l.slice(0, 60)}" is no longer in it exactly as written` };
      lines.splice(i, 1);
    }
    for (const sec of [...(extras.indexSections || [])].reverse()) {
      const h = lines.indexOf(`## ${sec}`);
      if (h < 0) continue;
      let j = h + 1;
      while (j < lines.length && lines[j] === '') j++;
      if (j < lines.length) continue; // another writer put something under it
      const from = h > 0 && lines[h - 1] === '' ? h - 1 : h;
      lines.splice(from, h - from + 1);
    }
    return { text: lines.join('\n') };
  }
  if (rel === 'Wiki/log.md' && extras.logEntry) {
    const seg = `${extras.logLead ?? '\n'}${extras.logEntry}\n`;
    const i = cur.indexOf(seg);
    if (i < 0) return { why: `${edited}; the weave's log entry is no longer in it exactly as written` };
    return { text: cur.slice(0, i) + cur.slice(i + seg.length) };
  }
  return { why: edited };
}

async function restoreFiles(vaultPath, files, dirsCreated, extras = {}) {
  const restored = [];
  const left = [];
  for (const f of [...files].reverse()) {
    const full = path.join(vaultPath, f.relPath);
    const cur = await readOr(full);
    if (cur == null) {
      if (f.created) restored.push(f.relPath);
      else left.push({ relPath: f.relPath, why: 'it is gone from the vault, so there was nothing to put back over' });
      continue;
    }
    // never changed (a write that did not happen, or was already put back)
    if (!f.created && cur === f.before) { restored.push(f.relPath); continue; }
    if (sha(cur) !== f.afterHash) {
      // the index and the log are shared with other writers, so they are
      // nearly always different by now; only the weave's own lines come out
      const out = withoutWeaveLines(f.relPath, cur, extras);
      if (out.text == null) { left.push({ relPath: f.relPath, why: out.why }); continue; }
      await backupFile(full);
      await writeFile(full, out.text, 'utf8');
      restored.push(f.relPath);
      continue;
    }
    // a page the weave created and nobody touched since is exactly what the
    // record says it was, so it goes without a snapshot; one it changed is
    // snapshotted first, as every vault write-back here is
    if (f.created) await unlink(full);
    else { await backupFile(full); await writeFile(full, f.before, 'utf8'); }
    restored.push(f.relPath);
  }
  for (const rel of [...dirsCreated].sort((a, b) => b.length - a.length)) {
    try { await rmdir(path.join(vaultPath, rel)); } catch { /* not empty, or a backup lives there */ }
  }
  dropPlaybookCache();
  return { restored, left };
}

async function readRecords() {
  let names = [];
  try { names = (await readdir(weavesDir())).filter((n) => n.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const n of names) {
    try { out.push(JSON.parse(await readFile(path.join(weavesDir(), n), 'utf8'))); } catch { /* a broken record is skipped */ }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : (a.batchId < b.batchId ? 1 : -1)));
}

export async function getWeave(batchId) {
  if (!/^[a-z0-9-]+$/i.test(String(batchId || ''))) return null;
  const text = await readOr(path.join(weavesDir(), `${batchId}.json`));
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Undo one batch: newest file first, each put back only while it is still
 * what the weave wrote. Refused when a newer batch of the same person stands.
 */
export async function undoWeave(batchId, { vaultPath } = {}) {
  if (!vaultPath) throw new Error('the undo needs the vault path (VAULT_PATH), and none was given');
  const rec = await getWeave(batchId);
  if (!rec) { const e = new Error(`there is no weave batch called "${batchId}"`); e.notFound = true; throw e; }
  if (rec.undoneAt) { const e = new Error(`that weave was already undone on ${localDateISO(new Date(rec.undoneAt))}`); e.refused = true; throw e; }
  if (active === rec.personId) { const e = new Error('a weave for this person is running now; undo it once that has finished'); e.refused = true; throw e; }
  const newer = (await readRecords()).filter((r) => r.personId === rec.personId && !r.undoneAt && r.batchId !== rec.batchId && (r.at > rec.at || (r.at === rec.at && r.batchId > rec.batchId)));
  if (newer.length) {
    const e = new Error(`a newer weave for this person (${newer[newer.length - 1].batchId}, ${localDateISO(new Date(newer[newer.length - 1].at))}) stands on top of this one; undo the newest first`);
    e.refused = true;
    throw e;
  }
  return undoRecord(rec, vaultPath);
}

// Puts a batch back: its files where they still match, the book as it was, the
// register stages back to read; then marks the record. Shared by an undo and
// by the start-up recovery of a weave that never finished.
async function undoRecord(rec, vaultPath, { recovered = false } = {}) {
  const out = await restoreFiles(vaultPath, rec.files || [], rec.dirsCreated || [], rec);
  if (rec.bookBefore) await writeAtomic(bookPath(rec.personId), JSON.stringify(rec.bookBefore, null, 2));
  else { try { await unlink(bookPath(rec.personId)); } catch { /* never written */ } }
  for (const key of rec.keys || []) {
    try { await setStage(key, 'read', { woven: null, vault: rec.vaultBefore?.[key] ?? null }, { force: true }); } catch (e) { out.left.push({ relPath: key, why: `the register could not move it back to read: ${e.message}` }); }
  }
  rec.undoneAt = new Date(D().now()).toISOString();
  rec.undo = out;
  if (recovered) rec.recovered = true;
  await writeAtomic(path.join(weavesDir(), `${rec.batchId}.json`), JSON.stringify(rec, null, 2));
  return out;
}

/**
 * A weave that was cut off (the process died, or the book or register failed
 * after the vault was written) leaves its record marked `pending`. Called once
 * at start-up: each such batch is undone the way an undo does it, newest
 * first, and marked `recovered`. Returns [{ batchId, restored, left }].
 */
export async function recoverPendingWeaves({ vaultPath } = {}) {
  if (!vaultPath) throw new Error('the recovery of half-finished weaves needs the vault path (VAULT_PATH), and none was given');
  if (active) return []; // a weave is running now; its record is not a leftover
  const out = [];
  for (const rec of (await readRecords()).filter((r) => r.pending && !r.undoneAt)) {
    const res = await undoRecord(rec, vaultPath, { recovered: true });
    out.push({ batchId: rec.batchId, restored: res.restored, left: res.left });
  }
  return out;
}

/* --------------------------------- reading --------------------------------- */

export async function listWeaves(personId) {
  const all = (await readRecords()).filter((r) => r.personId === personId);
  const top = all.find((r) => !r.undoneAt);
  return all.map((r) => ({
    batchId: r.batchId, at: r.at, version: r.version, model: r.model, costUsd: r.costUsd, ms: r.ms,
    keys: r.keys, counts: { notes: 0, raised: 0, ...r.counts }, calls: (r.calls || []).length, undoneAt: r.undoneAt || null, pending: !!r.pending,
    undoable: !r.undoneAt && top?.batchId === r.batchId,
  }));
}

/** The weekly "what Nova learned", counted by code: batches still standing. */
export async function weekSummary(personId, { days = 7 } = {}) {
  const now = D().now();
  const fromMs = now - days * 86_400_000;
  const list = (await listWeaves(personId)).filter((w) => !w.undoneAt && Date.parse(w.at) >= fromMs);
  const totals = { batches: list.length, sources: 0, concepts: 0, conceptsEdited: 0, chapters: 0, scripts: 0, cards: 0, held: 0, notes: 0, raised: 0, costUsd: 0 };
  for (const w of list) {
    for (const k of ['sources', 'concepts', 'conceptsEdited', 'chapters', 'scripts', 'cards', 'held', 'notes', 'raised']) totals[k] += w.counts?.[k] || 0;
    totals.costUsd += w.costUsd || 0;
  }
  totals.costUsd = Math.round(totals.costUsd * 10000) / 10000;
  return {
    from: localDateISO(new Date(fromMs)), to: localDateISO(new Date(now)),
    batches: list.map((w) => ({ batchId: w.batchId, at: w.at, counts: w.counts, undoable: w.undoable })),
    totals,
  };
}

export const weaving = () => active;
export function _resetWeaveForTests() { active = null; }
export function _setActiveForTests(personId) { active = personId; }

/* ------------------------------ raised items ------------------------------- */

/** Everything raised for his review, every status, newest first. [] with no book. */
export async function listRaised(personId) {
  const book = await getBook(personId);
  return newestFirstBy(book?.raised || []);
}

/**
 * His call on one raised item: new, kept, dismissed or research. Sets it in
 * the Book file and renders the mentor page again, through the weave's own
 * write guard, and only a page code wrote. Refused while a weave for this
 * person runs. The newest standing weave record learns the page's new hash, so
 * an undo still puts the page back.
 */
export async function setRaisedStatus(personId, rid, status, { vaultPath } = {}) {
  const fail = (message, flag) => { const e = new Error(message); e[flag] = true; return e; };
  if (!RAISED_STATUSES.includes(status)) throw fail(`the status must be one of ${RAISED_STATUSES.join(', ')}`, 'badRequest');
  if (!vaultPath) throw new Error('setting a raised item needs the vault path (VAULT_PATH), and none was given');
  if (active === personId) throw fail('a weave for this person is running now; set it once that has finished', 'refused');
  const book = await getBook(personId);
  const item = (book?.raised || []).find((r) => r.rid === rid);
  if (!item) throw fail(`there is no raised item "${rid}" for ${personId}`, 'notFound');
  item.status = status;
  const bookRel = mentorRel(book.name);
  if (!vaultWriteAllowed(vaultPath, bookRel)) throw refusal(bookRel);
  const full = path.join(vaultPath, bookRel);
  const before = await readOr(full);
  let text = null;
  if (before != null) {
    if (!isOurs(before)) throw new Error(`${bookRel} was not written by Mentors, so the weave will not replace it; nothing was changed`);
    text = mentorPage(book, localDateISO(new Date(D().now())), fmField(before, 'created'));
    if (text !== before) { await backupFile(full); await writeFile(full, text, 'utf8'); }
  }
  try {
    await writeAtomic(bookPath(personId), JSON.stringify(book, null, 2));
  } catch (e) {
    if (text != null && text !== before) await writeFile(full, before, 'utf8').catch(() => {});
    throw e;
  }
  if (text != null && text !== before) {
    const top = (await readRecords()).find((r) => r.personId === personId && !r.undoneAt);
    const f = top?.files?.find((x) => x.relPath === bookRel);
    if (f) { f.afterHash = sha(text); await writeAtomic(path.join(weavesDir(), `${top.batchId}.json`), JSON.stringify(top, null, 2)); }
  }
  return item;
}
