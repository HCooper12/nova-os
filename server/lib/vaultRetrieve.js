// RETRIEVE BY THE QUESTION (second-brain audit #1, 7 Nov 2026). On 10 Oct he
// asked how to fix a stiff body and Nova called the answer "general training
// evidence, not your vault", with Huberman's Protocol 4 filed four days
// earlier. 1,063 replies had named 2 Concepts. The index existed and no answer
// used it. This is the one function that hands an answer the pages that fit
// the words he just said.
//
// THE PROMPT CACHE STAYS WHOLE. The Ask Nova context is cached across
// questions (askContext.js), so nothing here goes in it. The block rides the
// turn itself, after his question, exactly where a playbook does. Same for
// Coach.
//
// IT NEVER MAKES HIM WAIT. The budget below is a ceiling, not an aim: lexical
// runs in tens of milliseconds, the embedder gets what is left, and a search
// that stalls is skipped. An answer without pages is what he had yesterday.
//
// Code picks; the model only reads. Nothing here writes.
import { embedQuery, pickSemantic, scoreAgainstIndex, SEMANTIC_ONLY_FLOOR } from './embeddings.js';
import { recallIndex, recallVectors, tokenize } from './recall.js';
import { BODY_TAGS, bodyDomain } from './conceptReview.js';

// Measured against his real vault on 7 Nov 2026 (scratch copy of the index, no
// model): lexical 20 to 200 ms, embed plus scoring 40 to 200 ms, a cold page
// read 510 ms. His bar (speed audit, 18 Oct) is first words in 3 to 5 s, so
// 700 ms for the pages holds it even in the worst case.
export const RETRIEVE_MS = 700;
export const RETRIEVE_PAGES = 5;
export const RETRIEVE_CHARS = 1800;     // the whole block, per turn
const EXCERPT_CHARS = 280;
const LEX_DEPTH = 40;

// WHERE AN ANSWER MAY COME FROM. By folder, because a folder is a decision
// already made about what a page is. Raw transcripts are a record, not a
// conclusion, and a Source page already speaks for them. The daily logs and
// the pages code keeps as state are data, which Coach already reads as data;
// their excerpts are lists of ids, not knowledge. The Journal is left out whole: nearly
// all of it was filed by Nova and the agents, and the lens says only his own
// entries count as what happened (journal.js JOURNAL_AUTHORSHIP_RULE), so an
// agent's old sentence must not come back wearing his authority. In the Inbox
// folder only research briefs count: `Report ...` and `Coach review ...` pages
// are agent artefacts about a run.
const FOLDERS = ['Wiki/Concepts/', 'Wiki/Sources/', 'Wiki/Topics/', 'Wiki/Library/', 'Wiki/Health/', 'Wiki/Inbox/'];
const NOT_KNOWLEDGE = [
  /^Wiki\/Health\/(?:Workouts|Health Log|Recipe Photos)\//,
  /^Wiki\/Health\/(?:Exercise State|Exercise Library|Progression Tuning|Daily Rotation|Shopping List|Meal Prep Portions|Training Block|Fitness Goals)$/,
  /^Wiki\/Health\/What Works For Hayden/, // Coach reads it with struck lines removed; a search would not
  /^Wiki\/Library\/(?:Review Log|Repertoire)/,
  /^Wiki\/Inbox\/(?:Report|Coach review)\b/,
];

export function retrievable(page) {
  const id = String(page?.id || '');
  return FOLDERS.some((f) => id.startsWith(f)) && !NOT_KNOWLEDGE.some((re) => re.test(id));
}

// A page he owns outranks a page Nova filed for him, by a little.
const FOLDER_TRUST = { 'Wiki/Topics/': 1.2, 'Wiki/Health/': 1.2, 'Wiki/Library/': 1.1, 'Wiki/Concepts/': 1, 'Wiki/Sources/': 1, 'Wiki/Inbox/': 0.95 };
const trustOf = (id) => FOLDER_TRUST[Object.keys(FOLDER_TRUST).find((f) => id.startsWith(f))] || 1;

// THE DOMAIN OF A PAGE. Coach reads the body; his own subject is not the place
// for a leadership concept, and a leadership answer must never be built from a
// gym page (nova-agent-relevance: "Budget Your Stress Like Your Sets"). A word
// is not a subject. Health is the body by folder. The other folders each hold
// both, so there the page's own tags decide, which the ingest model wrote when
// it filed the page. A page with neither kind of tag (the Inbox's research
// briefs, a reel tagged only `video`) has no domain, and is kept: it is matched
// on what it says, and calling it either would be a guess.
const MIND_TAGS = new Set([
  'leadership', 'management', 'communication', 'psychology', 'social-skills', 'conversation',
  'decision-making', 'negotiation', 'persuasion', 'influence', 'habits', 'mindset', 'philosophy',
  'productivity', 'business', 'money', 'relationships', 'charisma', 'feedback', 'career', 'teams',
]);
export function domainOf(page) {
  if (String(page?.id || '').startsWith('Wiki/Health/')) return 'body';
  const tags = (Array.isArray(page?.tags) ? page.tags : []).map((t) => String(t).toLowerCase());
  const body = tags.some((t) => BODY_TAGS.has(t));
  const mind = tags.some((t) => MIND_TAGS.has(t));
  if (body && mind) return bodyDomain(page) ? 'body' : 'mind';
  return body ? 'body' : mind ? 'mind' : null;
}

/* ---------------------------------- lexical ------------------------------- */

const stem = (w) => (w.length > 4 ? w.replace(/(?:ing|ies|ed|es|s)$/, '') : w.replace(/s$/, ''));

// What the question is about, not how he talks. Dictated turns run to 80 words
// and most of them are his way of speaking.
const SPOKEN = new Set(`about actually add after again all also am any anything are around back be because been before being best better between both but by can cause come could currently did do does doing done dont down each else even ever every extra feel feels first for from get getting give go going good got had has have having hey how im ive just keep kind know let lets like look looking lot make making many may maybe me might more most much must need needs new no nova not now off one only other our out over overall own part per please possibly put quite rather really refer right same say says see seem seems should show so some something sometimes soon sorry still such sure take tell than thank thanks that thats the their them then there these they thing things think this those though through to too try trying under until up us use using very want wanted wants was way we well were what whats when where whether which while who why will with without work works would yeah yes yet you your`.split(' '));

export function queryTerms(text) {
  return [...new Set(tokenize(text).filter((t) => !SPOKEN.has(t) && !/^\d+$/.test(t)))];
}

// One pass over the pages an answer may use, kept per index build.
const built = new WeakMap();
function corpus(pages) {
  if (built.has(pages)) return built.get(pages);
  const docs = [];
  const df = new Map();
  const forms = new Map(); // stem → the tokens spelled that way
  let total = 0;
  for (const page of pages) {
    if (!retrievable(page)) continue;
    const counts = new Map(page.counts);
    for (const bullet of page.bullets || []) {
      for (const t of tokenize(bullet)) counts.set(t, (counts.get(t) || 0) + 1);
    }
    let length = 0;
    for (const [token, count] of counts) {
      df.set(token, (df.get(token) || 0) + 1);
      length += count;
      const s = stem(token);
      if (!forms.has(s)) forms.set(s, new Set());
      forms.get(s).add(token);
    }
    docs.push({ id: page.id, counts, length, title: new Set(tokenize(page.title).map(stem)) });
    total += length;
  }
  const out = { docs, df, forms, avg: total / (docs.length || 1) };
  built.set(pages, out);
  return out;
}

const K1 = 1.2;
const B = 0.6;

// BM25: a rare word he said counts for far more than a common one. The
// palette's "matched more terms wins" handed the stiffness question a longevity
// page because it shared thirteen ordinary words.
export function lexicalRank(pages, terms, { depth = LEX_DEPTH } = {}) {
  const { docs, df, forms, avg } = corpus(pages);
  const N = docs.length || 1;
  const wanted = terms
    .map((t) => {
      const spellings = [...(forms.get(stem(t)) || [])];
      const n = Math.max(0, ...spellings.map((s) => df.get(s) || 0));
      return { stem: stem(t), spellings, idf: Math.log(1 + (N - n + 0.5) / (n + 0.5)), rare: n > 0 && n / N < 0.25 };
    })
    .filter((t) => t.spellings.length);
  const scored = [];
  for (const page of docs) {
    let score = 0;
    let rareHits = 0;
    for (const t of wanted) {
      let tf = 0;
      for (const s of t.spellings) tf += page.counts.get(s) || 0;
      if (!tf) continue;
      score += t.idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (page.length / avg))));
      // a word in the title names what the page is, however common the word
      if (page.title.has(t.stem)) score += t.idf;
      if (t.rare || page.title.has(t.stem)) rareHits += 1;
    }
    // one shared word is not a match: "first" must not fetch a page
    if (rareHits >= 2 || (rareHits === 1 && wanted.length === 1)) scored.push({ id: page.id, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, depth);
}

/* ---------------------------------- meaning ------------------------------- */

// Long dictated turns embed as mush. The sentence with the question in it, and
// the one before it, carry what he is asking.
export function meaningQuery(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 300) return clean;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const asked = sentences.map((s, i) => (/\?\s*$/.test(s) ? i : -1)).filter((i) => i >= 0).pop();
  const at = asked ?? sentences.length - 1;
  return sentences.slice(Math.max(0, at - 1), at + 1).join(' ').slice(-600);
}

async function meaningRank(vaultPath, text, ms) {
  const index = await recallVectors(vaultPath);
  if (!index) return [];
  const vec = await Promise.race([embedQuery(meaningQuery(text)), new Promise((resolve) => { setTimeout(() => resolve(null), Math.max(0, ms)).unref?.(); })]);
  if (!vec) return [];
  return pickSemantic(scoreAgainstIndex(index, vec), { k: LEX_DEPTH });
}

/* --------------------------------- the pick ------------------------------- */

// Rank fusion, as recall.js does it, with the head of the word ranking weighted
// harder: a rare word he said lands a page near the top of BM25 and nowhere in
// the embedder when the page is mostly bullets, and those were the misses.
const RRF = 60;
const RRF_WORDS = 20;
const OWN_RECORD_DEPTH = 12;
const OWN_RECORD = /^Wiki\/Health\/(?:Injury Log|What Works For Hayden|Coaching Principles|Protocols)$/;

// The sentence of the page that fits best, by his rarest words: "flexibility"
// must find Protocol 4, not the page's first paragraph about session length.
function excerptOf(page, terms, df) {
  const weighted = terms.map((t) => [stem(t), 1 / (1 + (df.get(t) || 0))]);
  const lines = [...page.paragraphs, ...(page.bullets || [])].flatMap((p) => p.split(/(?<=[.!?])\s+/));
  let best = lines[0] || '';
  let bestScore = -1;
  for (const line of lines) {
    const low = line.toLowerCase();
    const score = weighted.reduce((sum, [t, w]) => sum + (low.includes(t) ? w : 0), 0);
    if (score > bestScore) { best = line; bestScore = score; }
  }
  const at = lines.indexOf(best);
  const flat = lines.slice(at, at + 3).join(' ').replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : flat;
}

// The pick is pure so the ranking can be tested without an embedder.
export function pickPages(pages, { lexical = [], semantic = [], terms = [], domain = null, limit = RETRIEVE_PAGES } = {}) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const { df } = corpus(pages);
  const lexIds = new Set(lexical.map((l) => l.id));
  const fused = new Map();
  lexical.forEach((l, i) => fused.set(l.id, 1 / (RRF_WORDS + i + 1)));
  // a transcript is never handed over, but it can still find the page that
  // speaks for it: a Source page is mostly bullets, so its own vector is thin,
  // and the Janicki ranking was found only through its transcript
  const speaksFor = new Map();
  for (const p of pages) if (p.rawLink) speaksFor.set(`Raw/${p.rawLink}`, p.id);
  const seen = new Set();
  semantic
    .map(([id, sim]) => [speaksFor.get(id) || id, sim])
    .filter(([id, sim]) => lexIds.has(id) || sim >= SEMANTIC_ONLY_FLOOR)
    .filter(([id]) => retrievable(byId.get(id)))
    .filter(([id]) => !seen.has(id) && seen.add(id))
    .forEach(([id], i) => fused.set(id, (fused.get(id) || 0) + 1 / (RRF + i + 1)));
  let ranked = [...fused.entries()]
    .map(([id, score]) => ({ page: byId.get(id), score: score * trustOf(id) }))
    .filter((x) => x.page)
    .sort((a, b) => b.score - a.score);
  // an answer draws on one subject: the leading pages decide which, and a page
  // from the other subject never rides along because a word matched
  const subject = domain || leadingDomain(ranked.slice(0, 6));
  if (subject) ranked = ranked.filter((x) => (domainOf(x.page) ?? subject) === subject);
  const kept = ranked.slice(0, limit);
  // HIS OWN RECORD HOLDS A SEAT. The lens: what he logged is fact, a podcast is
  // what somebody claimed. A short Health page rarely wins a fusion against a
  // long Source page, so on a body question the best one takes the last slot.
  if (subject === 'body' && kept.length && !kept.some((x) => x.page.id.startsWith('Wiki/Health/'))) {
    const own = lexical.slice(0, OWN_RECORD_DEPTH).find((l) => OWN_RECORD.test(l.id));
    if (own) kept[Math.min(kept.length, limit - 1)] = { page: byId.get(own.id), score: 0 };
  }
  return kept.map(({ page, score }) => ({
    id: page.id,
    title: page.title,
    type: page.type,
    path: `${page.id}.md`,
    excerpt: excerptOf(page, terms, df),
    score,
  }));
}

function leadingDomain(top) {
  if (!top.length) return null;
  const weight = { body: 0, mind: 0 };
  top.forEach((x, i) => { const d = domainOf(x.page); if (d) weight[d] += 1 / (i + 1); });
  if (!weight.body && !weight.mind) return null;
  return weight.body >= weight.mind ? 'body' : 'mind';
}

/** The pages that fit what he said. Returns { pages, ms, skipped, semantic }.
 *  `skipped` names why there are none, for the log line; it never throws, and
 *  never takes longer than `ms`. `domain` holds a lane to its subject. */
export async function retrieveForQuestion(vaultPath, question, { domain = null, limit = RETRIEVE_PAGES, ms = RETRIEVE_MS } = {}) {
  const started = Date.now();
  const left = () => ms - (Date.now() - started);
  const out = (pages, extra = {}) => ({ pages, ms: Date.now() - started, ...extra });
  const text = String(question || '').trim();
  if (!vaultPath || !text) return out([], { skipped: 'no question' });
  const terms = queryTerms(text);
  if (!terms.length) return out([], { skipped: 'nothing to search for' });
  let pages;
  try {
    pages = await Promise.race([
      recallIndex(vaultPath, { stale: true }),
      new Promise((resolve) => { setTimeout(() => resolve(null), Math.max(0, left())).unref?.(); }),
    ]);
  } catch (e) { return out([], { skipped: e.message }); }
  if (!pages) return out([], { skipped: 'the page index was still loading' });
  const lexical = lexicalRank(pages, terms);
  let semantic = [];
  try { if (left() > 20) semantic = await meaningRank(vaultPath, text, left()); } catch { /* the embedder is optional: lexical stands */ }
  return out(pickPages(pages, { lexical, semantic, terms, domain, limit }), { semantic: semantic.length > 0 });
}

/** Fill the page index before anyone asks, so a turn never pays the cold read. */
export function warmRetrieval(vaultPath) {
  if (!vaultPath) return;
  recallIndex(vaultPath, { stale: true }).catch(() => {});
  recallVectors(vaultPath).catch(() => {});
}

// What the page is, by where it lives: `type` on a research brief says "raw".
const KIND = { 'Wiki/Concepts/': 'concept', 'Wiki/Sources/': 'source, what somebody claimed', 'Wiki/Topics/': 'topic', 'Wiki/Library/': 'library', 'Wiki/Health/': 'his own record', 'Wiki/Inbox/': 'research brief' };
const kindOf = (id) => KIND[Object.keys(KIND).find((f) => id.startsWith(f))] || 'page';
const lineFor = (p) => `- "${p.title}" (${kindOf(p.id)}, \`${p.path}\`): ${p.excerpt}`;

/** The per-turn block. Empty when nothing fits, so a turn with no match is
 *  byte for byte the turn he had before. A source page records what somebody
 *  claimed; the lens says how to weigh it, so the block does not repeat it. */
export function pagesBlock(pages = [], { chars = RETRIEVE_CHARS } = {}) {
  if (!pages.length) return '';
  const head = 'PAGES FROM HIS VAULT THAT FIT WHAT HE JUST SAID (found by code this turn). If one answers him, use it and name the page ("your Exercise Protocols page says..."). If none fits, ignore them. Read the path for the whole page.';
  const lines = [];
  let used = head.length;
  for (const p of pages) {
    const line = lineFor(p);
    if (used + line.length + 1 > chars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.length ? `${head}\n${lines.join('\n')}` : '';
}

// THE MORNING LANES HAVE NO QUESTION, so their subject is the day: what is on
// his plan and his to-do list, on top of the lane's own standing topics. 0 of
// 63 Daily Review sessions and 0 of 12 Plan Today sessions ever read the vault
// (audit Q1), so what they are handed is all they have.
export async function dayWords(vaultPath, standing = '') {
  const bits = [standing];
  try {
    const { listTodos } = await import('./todos.js');
    const { items } = await listTodos(vaultPath);
    bits.push(...items.filter((t) => !t.checked).slice(0, 12).map((t) => t.text));
  } catch { /* no to-dos, the standing topics alone */ }
  try {
    const { listRecords } = await import('./inboxStore.js');
    const plan = (await listRecords()).filter((r) => r.kind === 'plan-today' && Array.isArray(r.decision?.payload?.priorities))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    bits.push(...(plan?.decision.payload.priorities || []).map((p) => p.do).filter(Boolean));
  } catch { /* no plan yet today */ }
  return bits.filter(Boolean).join('. ');
}

/** A day has both subjects in it, so each gets its own pages rather than the
 *  question rule's one. A scheduled lane has seconds to spare, not milliseconds. */
export async function dayPagesContext(vaultPath, standing, { perSubject = 2, ms = 2500 } = {}) {
  const words = await dayWords(vaultPath, standing);
  const found = await Promise.all(['body', 'mind'].map((domain) => retrieveForQuestion(vaultPath, words, { domain, limit: perSubject, ms })));
  const seen = new Set();
  const pages = found.flatMap((r) => r.pages).filter((p) => !seen.has(p.id) && seen.add(p.id));
  if (!pages.length) return null;
  return `PAGES FROM HIS VAULT ON TODAY'S SUBJECTS (found by code from his plan and to-dos). Use one only if it truly bears on today, and name it when you do:\n${pages.map(lineFor).join('\n')}`;
}

/** The turn's words: his question, then what rides with this turn only. Used
 *  by every lane so the block always lands after the cached context. */
export const turnWords = (question, ...blocks) => [question, ...blocks.filter(Boolean)].join('\n\n');

/** One call for a door: the block for this turn, or '' on anything at all. */
export async function vaultPagesFor(vaultPath, question, opts = {}) {
  try {
    const r = await retrieveForQuestion(vaultPath, question, opts);
    console.log(`vault pages: ${r.pages.length} in ${r.ms}ms${r.semantic === false ? ' (words only)' : ''}${r.skipped ? ` — skipped: ${r.skipped}` : ''}`);
    return pagesBlock(r.pages, opts);
  } catch (e) {
    console.log(`vault pages: skipped (${e.message})`);
    return '';
  }
}
