import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSource, patchSource } from './mentorRegister.js';
import { transcriptPathFor } from './mentorTranscripts.js';
import { mentorModelChoice, runMentorClaude } from './mentorRead.js';
import { getBook, mutateBook, changeRaised, parseReply, secOf, weaving } from './mentorWeave.js';
import { laneEnabled, laneOffError } from './modelPrefs.js';
import { registerJobMap } from './jobRegistry.js';

// MENTORS NEWS, the model's part (25 Nov 2026): the three questions on a
// raised item, the research that answers one of them, and the three
// takeaways of a "Brief me". The model CHOOSES and JUDGES (which three, new or
// not, an answer with its sources); code supplies every other word, from the
// read notes, the register and the model's envelope. A count or a cost the
// server does not have is null.
//
// NEVER FABLE: both lanes go through mentorModelChoice (which swaps a Fable
// pick on the board for the lane's default) and runMentorClaude (which
// refuses Fable at the spawn), and a reply that says Fable answered fails.
//
// Every model call goes through `deps.ask`, so the tests run with no CLI.

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const notesBase = (key) => path.join(dataRoot(), 'mentors', 'notes', `${String(key).replace(/:/g, '_')}.read-v1`);

export const BRIEF_LANE = 'mentor-brief';
export const RESEARCH_LANE = 'mentor-research';
export const QUESTION_KINDS = ['true', 'deeper', 'use'];
export const RESEARCH_KINDS = ['true', 'deeper', 'use', 'own'];
export const VERDICTS = ['Yes', 'No', 'Partly', 'Unproven'];
export const RESEARCH_TOOLS = 'WebSearch WebFetch';
export const SPAN_AROUND_MARK = 90;
const QUESTION_MAX = 300;
const ANSWER_WORDS = 60;
const TITLE_CHARS = 60;
const TAKEAWAY_CHARS = 160;
const WEAVE_WAIT_MAX_MS = 2 * 3600_000;
const WEAVE_POLL_MS = 5_000;
const SYSTEM_PROMPT = 'You help a person study the people he learns from. Code writes every page from your answer. You reply with one JSON object and nothing else.';
const FABLE_RE = /fable|mythos/i;

let deps = null;
export function _setAskDepsForTest(d) { deps = d || null; }
const D = () => ({
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  // (lane, prompt, { model, allowed, what }) -> { text, usd, answeredBy, seen? }
  ask: (lane, prompt, { model, allowed = '', what }) => runMentorClaude(prompt, model, { lane, systemPrompt: SYSTEM_PROMPT, what, allowed }),
  ...(deps || {}),
});

/* --------------------------------- helpers --------------------------------- */

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const wordCount = (s) => one(s).split(' ').filter(Boolean).length;
const iso = () => new Date(D().now()).toISOString();
// a dash a person would see: every Unicode dash, a hyphen standing alone
// between spaces, and a double hyphen; a hyphen inside a word ("well-being")
// is a hyphen, not a dash
const DASH_RE = /[‐-―−﹘﹣－]|(?:^|\s)-+(?:\s|$)|--/;
export const hasDash = (s) => DASH_RE.test(String(s ?? ''));
const MARKDOWN_RE = /[*_`#]|\[|\]|^\s*[-+>]\s/m;
const fail = (message, flag) => { const e = new Error(message); if (flag) e[flag] = true; return e; };

/** One call, with the never-Fable check on who answered. */
async function call(lane, prompt, { model, allowed = '', what }) {
  const raw = await D().ask(lane, prompt, { model, allowed, what });
  const r = typeof raw === 'string' ? { text: raw, usd: 0 } : (raw || {});
  const models = Array.isArray(r.models) ? r.models.map(String) : [];
  const fable = [r.answeredBy, ...models].find((m) => m && FABLE_RE.test(m));
  if (fable) throw new Error(`${what} was answered by ${fable}; a mentor lane never runs on Fable (his rule), so it stopped`);
  return { text: String(r.text ?? ''), usd: Number(r.usd) || 0, answeredBy: writerOf(model, r.answeredBy, models), seen: typeof r.seen === 'string' ? r.seen : null };
}

// The model that wrote the reply: the one asked for, as the envelope names it
// ("sonnet" -> "claude-sonnet-..."), when the run used it; else the envelope's
// own pick (the most output). A web run's page reading uses a small model of
// the CLI's own, which can write more than the one asked (25 Nov 2026: a
// Sonnet research run's envelope named Haiku).
function writerOf(asked, answeredBy, models) {
  const a = String(asked || '').toLowerCase();
  const hit = models.find((m) => m.toLowerCase() === a) || (/^[a-z]+$/.test(a) ? models.find((m) => m.toLowerCase().includes(a)) : null);
  return hit || answeredBy || null;
}

/** A checked call: one retry with the failures listed (askChecked's way in
 *  lib/mentorWeave.js), then an error that names the step and the failures. */
async function askChecked(lane, step, prompt, check, { model, allowed = '' }) {
  let failures = [];
  let usd = 0;
  let answeredBy = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? prompt
      : `${prompt}\n\nYOUR LAST REPLY FAILED THESE CHECKS. Fix every one and reply again with the whole JSON object:\n${failures.map((f) => `- ${f}`).join('\n')}`;
    const r = await call(lane, p, { model, allowed, what: step });
    usd += r.usd;
    answeredBy = r.answeredBy || answeredBy;
    const reply = parseReply(r.text);
    failures = reply ? check(reply, r) : [`the reply was not a JSON object (it began "${one(r.text).slice(0, 80)}")`];
    if (!failures.length) return { reply, usd, answeredBy };
  }
  const e = new Error(`${step} failed its checks twice: ${failures.slice(0, 5).join('; ')}${failures.length > 5 ? ` (and ${failures.length - 5} more)` : ''}`);
  e.checks = failures;
  e.usd = usd;
  throw e;
}

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// A first sentence: up to the first ".", "!" or "?" that ends a sentence (not
// one that ends "Dr." or "e.g."), cut to 160 characters at a word boundary.
const ABBREV = /(?:\b(?:Dr|Mr|Mrs|Ms|St|Prof|Jr|Sr|vs|etc|e\.g|i\.e|approx|No)\.)$/i;
export function firstSentence(text, max = TAKEAWAY_CHARS) {
  const t = one(text);
  let end = t.length;
  for (const m of t.matchAll(/[.!?]["”’)]*(?=\s|$)/g)) {
    const upTo = t.slice(0, m.index + 1);
    if (ABBREV.test(upTo)) continue;
    end = m.index + m[0].length;
    break;
  }
  let s = t.slice(0, end);
  if (s.length <= max) return s;
  s = s.slice(0, max);
  const cut = s.search(/\s\S*$/);
  if (cut > 0) s = s.slice(0, cut);
  return s.replace(/[\s,;:]+$/, '');
}

/* ----------------------------- the transcript ------------------------------ */

const LINE_RE = /^\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*(.*)$/;

/** The timed lines of a transcript as paragraphs: { t, s, x }. */
export function timedParagraphs(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const s = secOf(m[1]);
    if (s == null) continue;
    out.push({ t: m[1], s, x: m[2].trim() });
  }
  return out;
}

/** The paragraphs within `span` seconds either side of `at`, each marked `m`
 *  when it is the one that holds the mark (the last that starts at or before
 *  it; that one is always included). */
export function paragraphsAround(paras, at, span) {
  let holder = -1;
  paras.forEach((p, i) => { if (p.s <= at) holder = i; });
  return paras
    .map((p, i) => ({ ...p, m: i === holder }))
    .filter((p, i) => i === holder || Math.abs(p.s - at) <= span);
}

async function readText(file) {
  try { return await readFile(file, 'utf8'); } catch { return null; }
}

/** The read notes' parsed JSON for a source; null when it was never read. */
export async function readNotes(key) {
  const text = await readText(`${notesBase(key)}.json`);
  if (text == null) return null;
  try { return JSON.parse(text)?.parsed || null; } catch { return null; }
}

/* ------------------------------ the item view ------------------------------ */

const idOf = (key) => (String(key).startsWith('yt:') ? String(key).slice(3) : String(key));

/**
 * One raised item as GET /mentors/:id/raised gives it: everything the Book
 * holds, plus its video, its mark in seconds, its three questions, and the
 * last question, answer and research failure (null when there is none).
 */
export async function raisedView(item, book, { sourceOf = getSource } = {}) {
  const entry = (book?.sources || []).find((s) => s.n === item.s) || null;
  let source = null;
  if (entry) {
    const reg = entry.key ? await sourceOf(entry.key) : null;
    source = {
      id: idOf(entry.key || ''),
      title: reg?.title ?? entry.title ?? null,
      sec: reg?.durationSec ?? null,
      date: reg?.publishedAt ?? entry.publishedAt ?? null,
    };
  }
  const q = item.questions || {};
  return {
    ...item,
    source,
    ts: secOf(item.t),
    questions: {
      true: q.true ?? (one(item.question) || null),
      deeper: q.deeper ?? null,
      use: q.use ?? null,
    },
    asked: item.asked ?? null,
    answer: item.answer ?? null,
    researchError: item.researchError ?? null,
  };
}

/** Every raised item of a person, newest first, as views. [] with no book. */
export async function listRaisedViews(personId) {
  const book = await getBook(personId);
  const list = [...(book?.raised || [])].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const cache = new Map();
  const sourceOf = async (key) => { if (!cache.has(key)) cache.set(key, await getSource(key)); return cache.get(key); };
  return Promise.all(list.map((r) => raisedView(r, book, { sourceOf })));
}

/* -------------------------------- questions -------------------------------- */

/** The checks one question must pass; [] when it is good. */
export function questionFailures(q) {
  if (typeof q !== 'string') return ['it is not a string'];
  const t = one(q);
  const f = [];
  if (!t.endsWith('?')) f.push('it does not end with "?"');
  const n = wordCount(t);
  if (n < 5 || n > 30) f.push(`it has ${n} words; a question has 5 to 30`);
  if (hasDash(t)) f.push('it holds a dash');
  return f;
}

const trueOf = (r) => r.questions?.true ?? (one(r.question) || null);
const missingKinds = (r) => QUESTION_KINDS.filter((k) => (k === 'true' ? !trueOf(r) : !r.questions?.[k]));

/** The raised items of a book that are `new` and lack a question. */
export function itemsNeedingQuestions(book) {
  return (book?.raised || []).filter((r) => (r.status || 'new') === 'new' && missingKinds(r).length);
}

function questionsPrompt(book, items) {
  return [
    `These ideas were raised for the owner of a personal knowledge vault to review. They come from videos of ${book.name}.`,
    'For each item, write ONLY the questions it is MISSING. Each is one plain question that research can answer: at most 30 words and at least 5, ending with "?", with no dashes.',
    '- "true": is the claim true; what does the evidence say?',
    '- "deeper": where does the idea come from; what else is known about it?',
    '- "use": how would he use it in a real conversation this week?',
    '',
    'Reply with one JSON object and nothing else, one entry per item, with only its missing keys:',
    '{"items": [{"rid": "R2.1", "deeper": "...", "use": "..."}]}',
    '',
    'ITEMS',
    ...items.map((r) => {
      const have = trueOf(r);
      return `${r.rid} | ${one(r.name)} | by ${one(r.by) || 'unclear'} | ${one(r.text)} | why raised: ${one(r.why)}${have ? ` | its "true" question already: ${one(have)}` : ''} | MISSING: ${missingKinds(r).join(', ')}`;
    }),
  ].join('\n');
}

/**
 * The missing questions of every `new` raised item of a person, in ONE call.
 * Each reply is checked by code: a bad one is dropped (it stays null), never
 * repaired. Stored on the item in the Book; the vault page does not show them.
 * Skipped (no call) while a weave for the person runs. Returns
 * { asked, written, dropped, missing, costUsd, model } (asked = items sent).
 */
export async function ensureQuestions(personId) {
  if (!laneEnabled(BRIEF_LANE)) throw laneOffError(BRIEF_LANE);
  if (weaving() === personId) return { asked: 0, written: 0, dropped: 0, missing: null, costUsd: 0, model: null, skipped: 'a weave for this person is running' };
  const book = await getBook(personId);
  const need = itemsNeedingQuestions(book);
  if (!need.length) return { asked: 0, written: 0, dropped: 0, missing: 0, costUsd: 0, model: null };
  const { model, why } = mentorModelChoice(BRIEF_LANE);
  if (why) console.log(`mentorAsk: ${why}`);
  const r = await call(BRIEF_LANE, questionsPrompt(book, need), { model, what: 'the questions call' });
  const reply = parseReply(r.text);
  if (!reply || !Array.isArray(reply.items)) throw new Error(`the questions call answered without an "items" list (it began "${one(r.text).slice(0, 80)}")`);
  const wanted = new Map(need.map((x) => [x.rid, new Set(missingKinds(x))]));
  const got = new Map();
  let dropped = 0;
  for (const e of reply.items) {
    const kinds = wanted.get(e?.rid);
    if (!kinds) continue;
    const keep = {};
    for (const k of kinds) {
      if (e[k] == null) continue;
      if (questionFailures(e[k]).length) { dropped += 1; continue; }
      keep[k] = one(e[k]);
    }
    got.set(e.rid, { ...(got.get(e.rid) || {}), ...keep });
  }
  let written = 0;
  let missing = 0;
  await mutateBook(personId, (b) => {
    for (const item of b.raised || []) {
      const add = got.get(item.rid);
      const q = { true: trueOf(item), deeper: item.questions?.deeper ?? null, use: item.questions?.use ?? null };
      if (add) for (const k of QUESTION_KINDS) if (!q[k] && add[k]) { q[k] = add[k]; written += 1; }
      if (add || wanted.has(item.rid)) item.questions = q;
      if (wanted.has(item.rid) && (item.status || 'new') === 'new') missing += QUESTION_KINDS.filter((k) => !q[k]).length;
    }
  });
  return { asked: need.length, written, dropped, missing, costUsd: round4(r.usd), model: r.answeredBy || model };
}

/* --------------------------------- research -------------------------------- */

const researchJobs = registerJobMap('mentorResearch', new Map()); // "personId/rid" -> { status, promise }
const jobKey = (personId, rid) => `${personId}/${rid}`;
export const researching = (personId, rid) => researchJobs.get(jobKey(personId, rid))?.status === 'running';
export const researchJob = (personId, rid) => researchJobs.get(jobKey(personId, rid))?.promise || null;
export function _resetAskForTests() { researchJobs.clear(); }

const KIND_ASK = {
  true: 'Is the claim true? Say what the evidence says. Start the answer with one verdict word and a full stop: "Yes.", "No.", "Partly." or "Unproven.".',
  deeper: 'Where does the idea come from, and what else is known about it?',
  use: 'How would he use it in a real conversation this week? The answer may rest on the transcript alone.',
  own: 'Answer his own question.',
};

const urlSeen = (url, seen) => {
  if (seen == null) return true;
  const u = String(url);
  const bare = u.replace(/\/+$/, '');
  const noProto = bare.replace(/^https?:\/\//, '');
  return seen.includes(bare) || seen.includes(noProto) || seen.includes(encodeURI(bare)) || (() => { try { return seen.includes(decodeURI(bare)); } catch { return false; } })();
};

/** The checks a research reply must pass; [] when it is good. `seen` is the
 *  text of the run's tool calls and results (null: not checked). */
export function answerFailures(reply, kind, seen = null) {
  const f = [];
  if (!reply || typeof reply !== 'object') return ['the reply was not a JSON object'];
  const a = reply.answer;
  if (typeof a !== 'string' || !one(a)) f.push('"answer" is missing or empty');
  else {
    const n = wordCount(a);
    if (n > ANSWER_WORDS) f.push(`the answer has ${n} words; the most is ${ANSWER_WORDS}`);
    if (hasDash(a)) f.push('the answer holds a dash; use plain sentences with no dashes');
    if (MARKDOWN_RE.test(a)) f.push('the answer holds markdown (an asterisk, underscore, backtick, hash, bracket or list mark); write plain sentences');
    if (kind === 'true' && !new RegExp(`^(${VERDICTS.join('|')})\\.(\\s|$)`).test(one(a))) f.push(`the answer must start with one verdict word and a full stop: ${VERDICTS.map((v) => `"${v}."`).join(', ')}`);
  }
  const src = reply.sources;
  if (!Array.isArray(src)) f.push('"sources" is not a list');
  else {
    if (src.length > 3) f.push(`there are ${src.length} sources; the most is 3`);
    if ((kind === 'true' || kind === 'deeper') && src.length < 1) f.push('give at least one source: a page or paper the search found or you opened');
    src.forEach((s, i) => {
      const title = s?.title;
      if (typeof title !== 'string' || !one(title)) f.push(`source ${i + 1} has no title`);
      else {
        if (one(title).length > TITLE_CHARS) f.push(`the title of source ${i + 1} has ${one(title).length} characters; the most is ${TITLE_CHARS}`);
        if (hasDash(title)) f.push(`the title of source ${i + 1} holds a dash`);
      }
      let u = null;
      try { u = new URL(String(s?.url ?? '')); } catch { /* below */ }
      if (!u || !/^https?:$/.test(u.protocol)) f.push(`source ${i + 1} has no http or https URL`);
      else if (!urlSeen(s.url, seen)) f.push(`source ${i + 1} (${String(s.url).slice(0, 100)}) was not opened or found by a search in this run; cite only pages you found or opened`);
    });
  }
  return f;
}

function researchPrompt({ item, book, title, around, kind, question }) {
  return [
    `Answer one question about an idea raised for review from a video of ${book.name}. Search the web first, then open what you need.`,
    '',
    'THE IDEA',
    `Name: ${one(item.name)}`,
    `What was said: ${one(item.text)}`,
    `Why it was raised: ${one(item.why)}`,
    `Who said it: ${one(item.by) || 'unclear'}`,
    `Video: ${title || 'not stated'}${item.t ? `, at ${item.t}` : ''}`,
    '',
    around.length ? 'THE TRANSCRIPT AROUND THAT MOMENT' : 'THE TRANSCRIPT AROUND THAT MOMENT: not available',
    ...around.map((p) => `[${p.t}] ${p.x}`),
    '',
    `THE QUESTION (${kind === 'own' ? 'his own words' : `the "${kind}" question`}): ${one(question)}`,
    KIND_ASK[kind],
    '',
    'Reply with one JSON object and nothing else:',
    '{"answer": "...", "sources": [{"title": "...", "url": "https://..."}]}',
    `- answer: at most ${ANSWER_WORDS} words, plain sentences, no dashes, no markdown.`,
    `- sources: 1 to 3${kind === 'use' || kind === 'own' ? ' (for this question they may be empty when the answer rests on the transcript)' : ''}; each a page your search found or you opened, its URL exactly as you found it; the title as a person would cite it ("Lyubomirsky, Sheldon and Schkade, 2005"), at most ${TITLE_CHARS} characters.`,
  ].join('\n');
}

async function waitForWeave(personId) {
  const d = D();
  const until = d.now() + WEAVE_WAIT_MAX_MS;
  while (weaving() === personId) {
    if (d.now() >= until) throw new Error('a weave for this person ran for over two hours, so the answer could not be saved');
    await d.sleep(WEAVE_POLL_MS);
  }
}

/** The excerpt of the item's transcript, 90 s either side of its mark. */
async function excerptFor(key, t) {
  const at = secOf(t);
  if (!key || at == null) return [];
  const text = await readText(transcriptPathFor(key));
  if (!text) return [];
  return paragraphsAround(timedParagraphs(text), at, SPAN_AROUND_MARK);
}

/**
 * Starts the research of one raised item (POST
 * /mentors/:id/raised/:rid/research). Refused (`refused`, a 409) while a
 * weave for the person runs, when the item is already being researched, or
 * when `gate()` says his usage is over a ceiling; nothing is spawned then.
 * Saves the item as `research` with `asked` and no researchError, then runs
 * the job in the background. Returns the saved item.
 */
export async function startResearch(personId, rid, { kind, question } = {}, { vaultPath, gate = null } = {}) {
  if (!RESEARCH_KINDS.includes(kind)) throw fail(`send kind as one of ${RESEARCH_KINDS.join(', ')}`, 'badRequest');
  const q = typeof question === 'string' ? one(question) : '';
  if (!q) throw fail('send the question to research', 'badRequest');
  if (q.length > QUESTION_MAX) throw fail(`the question has ${q.length} characters; the most is ${QUESTION_MAX}`, 'badRequest');
  if (!vaultPath) throw new Error('researching a raised item needs the vault path (VAULT_PATH), and none was given');
  if (!laneEnabled(RESEARCH_LANE)) throw Object.assign(laneOffError(RESEARCH_LANE), { refused: true });
  if (weaving() === personId) throw fail('a weave for this person is running now; ask once that has finished', 'refused');
  const book = await getBook(personId);
  const found = (book?.raised || []).find((r) => r.rid === rid);
  if (!found) throw fail(`there is no raised item "${rid}" for ${personId}`, 'notFound');
  if (found.status === 'research' || researching(personId, rid)) throw fail(`"${one(found.name)}" is already being researched`, 'refused');
  if (gate) {
    const block = await gate();
    if (block) throw fail(block.message || block.why, 'refused');
  }
  const asked = { kind, text: q, at: iso() };
  const item = await changeRaised(personId, rid, (it) => {
    if (it.status === 'research') throw fail(`"${one(it.name)}" is already being researched`, 'refused');
    it.status = 'research';
    it.asked = asked;
    it.researchError = null;
  }, { vaultPath });
  const job = { status: 'running', personId, rid, startedAt: asked.at };
  researchJobs.set(jobKey(personId, rid), job);
  job.promise = runResearch(personId, rid, kind, q, vaultPath)
    .then(() => { job.status = 'done'; }, (e) => { job.status = 'failed'; console.error(`mentor research ${personId} ${rid}: ${e.message}`); })
    .finally(() => { if (researchJobs.get(jobKey(personId, rid)) === job) researchJobs.delete(jobKey(personId, rid)); });
  return item;
}

async function runResearch(personId, rid, kind, question, vaultPath) {
  let answer = null;
  let why = null;
  try {
    const book = await getBook(personId);
    const item = (book?.raised || []).find((r) => r.rid === rid);
    if (!item) throw new Error(`the raised item ${rid} is gone from the book`);
    const entry = (book.sources || []).find((s) => s.n === item.s) || null;
    const reg = entry?.key ? await getSource(entry.key) : null;
    const around = await excerptFor(entry?.key, item.t);
    const { model, why: modelWhy } = mentorModelChoice(RESEARCH_LANE);
    if (modelWhy) console.log(`mentorAsk: ${modelWhy}`);
    const prompt = researchPrompt({ item, book, title: reg?.title || entry?.title, around, kind, question });
    const r = await askChecked(RESEARCH_LANE, 'the research', prompt, (reply, run) => answerFailures(reply, kind, run.seen), { model, allowed: RESEARCH_TOOLS });
    answer = {
      text: one(r.reply.answer),
      sources: (r.reply.sources || []).map((s) => ({ title: one(s.title), url: String(s.url).trim() })),
      at: iso(),
      model: r.answeredBy || model,
      costUsd: round4(r.usd),
    };
  } catch (e) {
    why = e?.message || 'the research failed and gave no reason';
  }
  await waitForWeave(personId);
  const change = answer
    ? (it) => { it.status = 'answered'; it.answer = answer; it.researchError = null; }
    : (it) => { it.status = 'new'; it.researchError = { why, at: iso() }; };
  try {
    await changeRaised(personId, rid, change, { vaultPath });
  } catch (e) {
    // the mentor page could not be written (he wrote it by hand, or the vault
    // is gone): the Book still learns the outcome, and the failure says why
    const pageWhy = `the mentor page could not be updated: ${e.message}`;
    await mutateBook(personId, (b) => {
      const it = (b.raised || []).find((x) => x.rid === rid);
      if (!it) return false;
      change(it);
      if (!answer) it.researchError = { why: `${why}; ${pageWhy}`, at: iso() };
      return true;
    });
    if (answer) console.error(`mentor research ${personId} ${rid}: ${pageWhy}`);
  }
  if (why) throw new Error(why);
}

/**
 * At start-up: an item left in `research` with no job running goes back to
 * `new`, saying why. Through the guarded path when the vault path is known.
 * Returns how many were put back.
 */
export async function recoverResearch(personIds, { vaultPath } = {}) {
  let n = 0;
  for (const personId of personIds) {
    const book = await getBook(personId).catch(() => null);
    const stale = (book?.raised || []).filter((r) => r.status === 'research' && !researching(personId, r.rid));
    for (const r of stale) {
      const change = (it) => {
        if (it.status !== 'research') return;
        it.status = 'new';
        it.researchError = { why: 'the server restarted while this was being researched', at: iso() };
      };
      try {
        if (vaultPath) await changeRaised(personId, r.rid, change, { vaultPath });
        else throw new Error('no vault path');
      } catch {
        await mutateBook(personId, (b) => { const it = (b.raised || []).find((x) => x.rid === r.rid); if (!it) return false; change(it); return true; });
      }
      n += 1;
    }
  }
  return n;
}

/* ---------------------------------- brief ---------------------------------- */

/** The numbered list the brief is chosen from: the read's ideas, then its
 *  frameworks (a framework's text is its "use when"). */
export function briefList(parsed) {
  return [
    ...(parsed?.ideas || []).map((i) => ({ name: one(i.name), text: one(i.text), by: i.by ?? null, at: i.at ?? null })),
    ...(parsed?.frameworks || []).map((f) => ({ name: one(f.name), text: one(f.useWhen), by: f.by ?? null, at: f.at ?? null })),
  ].filter((x) => x.name);
}

/** The names of the Book's concept pages and chapters that draw on at least
 *  one source other than this one (`n`, null when it is not in the Book). */
export function pagesFromOthers(book, n) {
  const other = (list) => (list || []).some((x) => x !== n);
  return [
    ...(book?.concepts || []).filter((c) => other(c.sources)).map((c) => one(c.title)),
    ...(book?.chapters || []).filter((c) => other(c.sources)).map((c) => one(c.title)),
  ].filter(Boolean);
}

/**
 * How many key takeaways a brief holds: a long conversation has more to
 * bring to him than a short clip (his call, 25 Nov 2026). Three under 20
 * minutes or when the length is not known, four under 45, five beyond; never
 * more than the read holds (`size`).
 */
export function briefWant(sec, size) {
  const by = !(sec > 0) || sec < 20 * 60 ? 3 : sec < 45 * 60 ? 4 : 5;
  return Math.min(by, size);
}
const COUNT_WORD = ['', 'one', 'two', 'three', 'four', 'five'];

/** The checks the brief's reply must pass; [] when it is good. */
export function briefFailures(reply, size, want = Math.min(3, size)) {
  const top = reply?.top;
  if (!Array.isArray(top)) return ['"top" is not a list'];
  const f = [];
  if (top.length !== want) f.push(`"top" has ${top.length} entries; it must have exactly ${want}`);
  const seen = new Set();
  top.forEach((x, i) => {
    const n = x?.n;
    if (!Number.isInteger(n) || n < 1 || n > size) f.push(`entry ${i + 1} has n ${JSON.stringify(n)}, which is not a number from the list (1 to ${size})`);
    else if (seen.has(n)) f.push(`n ${n} is given twice`);
    else seen.add(n);
    if (typeof x?.new !== 'boolean') f.push(`entry ${i + 1} has no "new" as true or false`);
    f.push(...lineFailures(x?.line).map((why) => `entry ${i + 1}: ${why}`));
  });
  return f;
}

/** The one line under a takeaway: one plain sentence of 6 to 24 words (checked up to 30) that
 *  ends with a full stop, with no quote marks (a quoted word could not be
 *  checked here) and no dashes. [] when it is good. */
export function lineFailures(line) {
  if (typeof line !== 'string' || !one(line)) return ['it has no "line"'];
  const t = one(line);
  const f = [];
  const words = t.split(' ').filter(Boolean).length;
  // the prompt asks for 24 at most; a word or two over is not worth a failed brief, so the check stops at 30
  if (words < 6 || words > 30) f.push(`its line has ${words} words; it must have 6 to 24`);
  if (!/\.$/.test(t)) f.push('its line does not end with a full stop');
  if (/[.!?]\s+\S/.test(t.replace(/\b(?:Dr|Mr|Mrs|Ms|St|Prof|vs)\.\s/gi, ''))) f.push('its line is more than one sentence');
  if (/["\u201c\u201d]/.test(t)) f.push('its line holds quote marks; say it in plain words');
  if (hasDash(t)) f.push('its line holds a dash');
  return f;
}

function briefPrompt({ title, summary, list, pages, want }) {
  return [
    `Below are the ideas and methods from the reading notes of one video, "${title}", numbered.`,
    `Pick its ${want === 1 ? 'one key takeaway' : `${COUNT_WORD[want]} key takeaways`}: what the video is mainly about and what he could use, the most important first. An idea at the centre of the video's subject (its title and summary) comes before a passing story; choose an unusual claim only when it is also among the most useful.`,
    'For each, judge "new": true when no page already in his playbook (listed under PAGES) covers the idea, false when one does.',
    'For each, write "line": the substance of that idea in one plain sentence of 6 to 24 words, from its text below and nothing else, ending with a full stop, with no quote marks and no dashes.',
    '',
    `Reply with one JSON object and nothing else, with exactly ${want} entr${want === 1 ? 'y' : 'ies'}, each n a number from the list, no repeats:`,
    '{"top": [{"n": 4, "new": true, "line": "..."}]}',
    '',
    ...(summary ? ['WHAT THE VIDEO IS ABOUT', summary, ''] : []),
    'IDEAS',
    ...list.map((x, i) => `${i + 1}. ${x.name}: ${x.text}`),
    '',
    'PAGES ALREADY IN HIS PLAYBOOK',
    ...(pages.length ? pages.map((p) => `- ${p}`) : ['none']),
  ].join('\n');
}

/**
 * The brief of one read source: the model picks the read's key ideas (three
 * to five by the video's length, briefWant), judges each new or not and writes its one line from the notes; the
 * name, who said it and the time are the read's, verbatim. Saved on the source in the
 * register with the call's own cost; the old briefError goes. Returns the
 * brief. Throws with the cause (no notes, the lane off, the check failed twice).
 */
export async function writeBrief(key) {
  if (!laneEnabled(BRIEF_LANE)) throw laneOffError(BRIEF_LANE);
  const src = await getSource(key);
  if (!src) throw new Error(`there is no source with key "${key}"`);
  const parsed = await readNotes(key);
  if (!parsed) throw new Error(`${src.title || key} has no reading notes yet, so there is nothing to brief`);
  const list = briefList(parsed);
  if (!list.length) throw new Error(`the read of ${src.title || key} holds no ideas, so there is nothing to brief`);
  let book = null;
  for (const p of src.people || []) { book = await getBook(p.id).catch(() => null); if (book) break; }
  const n = (book?.sources || []).find((s) => s.key === key)?.n ?? null;
  const { model, why } = mentorModelChoice(BRIEF_LANE);
  if (why) console.log(`mentorAsk: ${why}`);
  const want = briefWant(src.durationSec, list.length);
  const r = await askChecked(BRIEF_LANE, 'the brief', briefPrompt({ title: src.title || key, summary: one(parsed.summary), list, pages: pagesFromOthers(book, n), want }), (reply) => briefFailures(reply, list.length, want), { model });
  const brief = {
    at: iso(),
    model: r.answeredBy || model,
    costUsd: round4(r.usd),
    ideas: r.reply.top.map((x) => {
      const it = list[x.n - 1];
      return { name: it.name, text: one(x.line), by: it.by, at: it.at, ts: secOf(it.at), new: x.new };
    }),
  };
  await patchSource(key, { brief, briefError: null });
  return brief;
}
