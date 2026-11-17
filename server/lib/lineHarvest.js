import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSource, findInTranscript, normWords, timeToSeconds, secondsToTime } from './reviewQuote.js';

// THE HARVEST (his approval, 18 Nov 2026): "The Line" drew only on quotes already
// marked on his concept pages, so few came from the voices he wants
// (Modern Wisdom, Alex Hormozi, Diary Of A CEO, James Clear). His vault holds
// those voices WORD FOR WORD in Raw/. A cheap lane reads each source chunk by
// chunk and proposes lines; CODE accepts only a line it finds in the source by
// the same normalised match the review uses, and stores the SOURCE's own words
// (never the model's copy of them). Each chunk is asked once, ever.
//
// A transcript cannot prove which person spoke a line, so the card names the
// show and the people of the episode ("Heard on Modern Wisdom, Alex Hormozi and
// Chris Williamson"), taken by code from the vault. A book line is the author's.
//
// Paraphrased notes are never read: a quote with a name under it must be the
// person's real words.

const dataDir = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const HARVEST_FILE = () => path.join(dataDir(), 'lineHarvest.json');

export const CHUNK_CHARS = 40000;
export const MAX_PER_CHUNK = 6;
const MIN_WORDS = 8;
const MAX_WORDS = 35;

// Book authors he named; a book source is read only when its page names one.
export const BOOK_AUTHORS = [{ name: 'James Clear', last: 'Clear' }];
// A channel that is itself a named person's own show (not in the host table).
export const OWN_CHANNELS = [{ channel: 'Alex Hormozi', name: 'Alex Hormozi' }];

const VERBATIM_RE = /^\s*Verbatim video transcript\b/i;
const BOOK_RE = /^\s*Text\/notes of a book\b/i;
const LINE_RE = /^\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*(.*)$/;
const PARAPHRASED_RE = /paraphrased notes capture/i;
const TURN = '>>';

const clean = (v) => { const s = typeof v === 'string' ? v.trim() : ''; return s || null; };
const sha = (s) => createHash('sha1').update(String(s)).digest('hex');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------ who is named ------------------------------ */

const wholeName = (hay, name) => new RegExp(`(^|[^\\p{L}])${esc(name)}(?![\\p{L}])`, 'iu').test(hay);

// "Heard on Modern Wisdom, Alex Hormozi and Chris Williamson"
const joinList = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// The attribution for a source, from the vault only. Returns null when the
// source is not one of his named voices (it is then not harvested at all).
export function attributeSource({ src, sourcePage, shows = [], people = new Map() }) {
  const raw = src.rawPage?.raw || '';
  // the channel as the source page says it, else as the Raw note's own title
  // line says it: "Title — The Diary Of A CEO (2:12:19)"
  const titled = raw.slice(0, 900).match(/[—–]\s*([^—–\n(]+?)\s*\(\d{1,2}(?::\d{2}){1,2}\)\s*$/m);
  const channel = clean(src.show) || clean(titled?.[1]);
  const titleLine = raw.slice(0, 900).match(/^.*[—–]\s*[^—–\n(]+?\s*\(\d{1,2}(?::\d{2}){1,2}\)\s*$/m)?.[0] || '';
  const label = `${src.title || ''} ${src.episode || ''} ${titleLine}`;
  const entry = channel ? shows.find((s) => s.channel.toLowerCase() === channel.toLowerCase()) : null;
  if (entry) {
    // the guest: the episode's own person page named in its title, or the
    // Raw note's Guest header, and exactly one who is not the host
    const named = new Set();
    if (clean(src.guest) && people.has(src.guest.toLowerCase())) named.add(people.get(src.guest.toLowerCase()));
    for (const t of people.values()) if (wholeName(label, t)) named.add(t);
    const others = [...named].filter((n) => n.toLowerCase() !== entry.host.toLowerCase() && !entry.podcast.toLowerCase().includes(n.toLowerCase()));
    const guest = others.length === 1 ? others[0] : null;
    const names = guest ? [entry.podcast, guest, entry.host] : [entry.podcast];
    return {
      kind: 'show', who: null, podcast: entry.podcast, host: entry.host, guest,
      byLong: `Heard on ${joinList(names)}`, byShort: `Heard on ${entry.podcast}`,
    };
  }
  const own = channel ? OWN_CHANNELS.find((o) => o.channel.toLowerCase() === channel.toLowerCase()) : null;
  if (own) {
    return { kind: 'show', who: null, podcast: own.channel, host: own.name, guest: null, byLong: `Heard from ${own.name}`, byShort: `Heard from ${own.name}` };
  }
  if (BOOK_RE.test(raw)) {
    const title = clean(sourcePage?.title) || '';
    const author = BOOK_AUTHORS.find((a) => new RegExp(`\\(\\s*${esc(a.last)}\\s*\\)\\s*$`, 'i').test(title) || wholeName(String(sourcePage?.raw || '').slice(0, 1500), a.name));
    if (!author) return null;
    const book = clean(title.replace(new RegExp(`\\s*\\(\\s*${esc(author.last)}\\s*\\)\\s*$`, 'i'), ''));
    if (!book) return null;
    return { kind: 'book', who: author.name, podcast: book, host: null, guest: null, byLong: `, ${book}`, byShort: `, ${book}` };
  }
  return null;
}

/* ------------------------------- the sources ------------------------------- */

// Every word-for-word source of a named voice, from the vault view already in
// memory. { rawId, raw, idea, pageId, ...attribution }.
export function discoverSources(pages, ctx, shows = []) {
  const out = [];
  const seen = new Set();
  for (const sp of pages) {
    if (sp.type !== 'source' && sp.type !== 'book') continue;
    const src = describeSource(sp, ctx.byTitle);
    const rawPage = src?.rawPage;
    if (!rawPage || seen.has(rawPage.id)) continue;
    const head = String(rawPage.raw || '').slice(0, 600);
    if (PARAPHRASED_RE.test(head)) continue;
    if (!VERBATIM_RE.test(head) && !BOOK_RE.test(head)) continue;
    const by = attributeSource({ src, sourcePage: sp, shows, people: ctx.people });
    if (!by) continue;
    seen.add(rawPage.id);
    out.push({ rawId: rawPage.id, raw: rawPage.raw, idea: clean(sp.title) || clean(src.title), pageId: sp.id, ...by });
  }
  return out;
}

/* ------------------------------ tokens and chunks ------------------------------ */

const decode = (s) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const keyOf = (t) => (t.turn ? TURN : normWords(t.raw).join(''));

// Rolling captions repeat the tail of the line before at the head of the next
// one; keep each word once, with the time of the line that first said it. A
// ">>" starts a new speaker's turn. A book becomes one turn per paragraph.
export function tokenize(rawText) {
  // control characters (a book's page breaks, a stray NUL) are not words and cannot ride a command line
  const text = String(rawText ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  const out = []; // { raw, t, turn }
  const lines = text.split('\n');
  const isTranscript = lines.filter((l) => LINE_RE.test(l)).length >= 20;
  if (isTranscript) {
    let prev = [];
    for (const line of lines) {
      const m = line.match(LINE_RE);
      if (!m) continue;
      const t = timeToSeconds(m[1]);
      const body = decode(m[2].replace(/\[[^\]]*\]/g, ' '));
      const toks = [];
      for (const w of body.split(/\s+/).filter(Boolean)) {
        if (w === TURN) toks.push({ turn: true, raw: TURN, t });
        else toks.push({ raw: w, t, turn: false });
      }
      const keys = toks.map(keyOf);
      let k = Math.min(prev.length, keys.length);
      while (k > 0 && !prev.slice(prev.length - k).every((x, i) => x === keys[i])) k -= 1;
      out.push(...toks.slice(k));
      prev = keys;
    }
    return out;
  }
  const body = text.includes('\n---\n') ? text.slice(text.indexOf('\n---\n') + 5) : text;
  for (const para of body.split(/\n\s*\n/)) {
    out.push({ turn: true, raw: TURN, t: null });
    for (const w of para.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean)) out.push({ raw: w, t: null, turn: false });
  }
  return out;
}

// Whole-token slices of about CHUNK_CHARS, closed after a sentence end when one
// is near. [{ tokens, text }]
export function chunkTokens(tokens, size = CHUNK_CHARS) {
  const chunks = [];
  let cur = [];
  let len = 0;
  const flush = () => {
    if (cur.some((t) => !t.turn)) {
      chunks.push({ tokens: cur, text: cur.map((t) => (t.turn ? '\n' : t.raw)).join(' ').replace(/ ?\n ?/g, '\n').trim() });
    }
    cur = []; len = 0;
  };
  for (const t of tokens) {
    cur.push(t);
    len += t.raw.length + 1;
    if (len >= size * 0.9 && (len >= size * 1.1 || /[.?!]["”’)]*$/.test(t.raw))) flush();
  }
  flush();
  return chunks;
}

/* ------------------------------- the check ------------------------------- */

// A book pulled from a PDF can come out letter-spaced ("go als", "b ook") or with
// ligature glyphs. Nobody wrote that; a line like it is not the author's words
// as they read. Single letters other than "a" and "I", more than three "a"s on
// their own, or a ligature glyph mark a line as garbled.
export function garbled(quote) {
  const q = String(quote ?? '');
  if (/[\uFB00-\uFB06\uFFFD]/.test(q)) return true;
  const singles = q.split(/\s+/).map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')).filter((w) => w.length === 1);
  if (singles.some((w) => !/^[aAI]$/.test(w))) return true;
  return singles.filter((w) => w === 'a' || w === 'A').length > 3;
}

// The model's line, found in this chunk through the review's own normalised
// match, inside ONE speaker's turn. Returns { quote, at } with the SOURCE's
// words, or null. A line with an ellipsis, outside 8-35 words, or not found is
// never accepted.
export function acceptLine(candidate, chunkTokensList) {
  const c = String(candidate ?? '').trim();
  if (!c || /\.{3}|…/.test(c)) return null;
  const turns = [];
  let cur = [];
  for (const t of chunkTokensList) {
    if (t.turn) { if (cur.length) turns.push(cur); cur = []; } else cur.push(t);
  }
  if (cur.length) turns.push(cur);
  for (const turn of turns) {
    const words = [];
    turn.forEach((t, ti) => { for (const w of normWords(t.raw)) words.push({ w, t: t.t, ti }); });
    const hit = findInTranscript(c, words);
    if (!hit) continue;
    const span = turn.slice(words[hit.start].ti, words[hit.end - 1].ti + 1);
    if (span.length < MIN_WORDS || span.length > MAX_WORDS) return null;
    const quote = span.map((t) => t.raw).join(' ').replace(/^[^\p{L}\p{N}"“'‘(]+/u, '').replace(/[\s,;:–—-]+$/u, '').trim();
    if (garbled(quote)) return null;
    const t0 = span[0].t;
    return { quote, at: t0 == null ? null : secondsToTime(t0) };
  }
  return null;
}

export function parseRows(text) {
  return String(text ?? '').split('\n')
    .map((r) => r.trim().replace(/^[-*•\d.)\s]+/, '').replace(/^["“]+|["”]+$/g, '').trim())
    .filter((r) => r.length > 20);
}

export const HARVEST_PROMPT = (text, kind) => `Below is part of a ${kind === 'book' ? 'book' : 'word-for-word podcast transcript'}. Pick up to ${MAX_PER_CHUNK} lines a thoughtful, ambitious person would want on their home screen for a day: a whole thought that stands on its own, said plainly, about how to live, work, think or lead. The register of Modern Wisdom, Alex Hormozi, The Diary Of A CEO, James Clear.

Copy each line EXACTLY as it appears, character for character, ${MIN_WORDS} to ${MAX_WORDS} words, from inside one speaker's turn (a new line starts a new turn). Do not fix grammar, do not join sentences, do not paraphrase. Skip sponsor reads, greetings, and anything that needs the conversation around it to make sense.
One line per row. Nothing else. If nothing qualifies, reply with a single dash.

TEXT:
${text}`;

/* ---------------------------------- disk ---------------------------------- */

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

export async function readHarvest() {
  const v = await readJson(HARVEST_FILE(), null);
  return v && typeof v === 'object' && v.sources && typeof v.sources === 'object' ? v : { sources: {} };
}

const normKey = (q) => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Pool items from the store, in the widget's own item shape. `key` is unique per
// line; `id` is the page the app's #/line opener asks the review for (the
// source's own page). Fields are the source's or code's, never a model's.
export function harvestPool(store, { maxQuote = 200 } = {}) {
  const out = [];
  for (const [rawId, s] of Object.entries(store?.sources || {})) {
    if (!s || !s.pageId || !s.idea || !(s.byLong || s.byShort)) continue;
    for (const idx of Object.keys(s.chunks || {}).sort((a, b) => a - b)) {
      for (const l of s.chunks[idx]?.lines || []) {
        if (!l?.quote || l.quote.length > maxQuote || garbled(l.quote)) continue;
        out.push({
          key: `h:${sha(`${rawId}|${normKey(l.quote)}`).slice(0, 16)}`,
          id: s.pageId,
          quote: l.quote.replace(/^\p{Ll}/u, (c) => c.toUpperCase()), // a caption starts mid-sentence in lower case
          who: s.who || null, host: s.host || null, podcast: s.podcast || null, origin: null,
          byLong: s.byLong || null, byShort: s.byShort || s.byLong || null,
          at: l.at || null, idea: s.idea, sent: null, voice: true,
        });
      }
    }
  }
  return out;
}

/* --------------------------------- the sweep --------------------------------- */

const defaultRunner = async (prompt) => {
  const { runTextLane } = await import('./textLane.js');
  const out = await runTextLane('lineHarvest', prompt, { maxTokens: 900 });
  return out?.text ?? '';
};

let running = null;

// Background, one pass at a time, never inside a GET. Each chunk of each source
// is asked once per wording of that chunk; a runner that throws ends the pass
// (the next fetch starts another). `only` limits the sources (a test or a
// trial). Never throws.
export function harvestSweep({ pages, ctx, shows = [], runner = defaultRunner, only = null, onProgress = null } = {}) {
  if (running) return running;
  running = (async () => {
    try {
      const found = discoverSources(pages, ctx, shows).filter((s) => !only || only(s));
      let store = await readHarvest();
      for (const s of found) {
        const sig = sha(s.raw);
        const prev = store.sources[s.rawId] || {};
        const meta = {
          pageId: s.pageId, idea: s.idea, kind: s.kind, who: s.who, podcast: s.podcast, host: s.host, guest: s.guest,
          byLong: s.byLong, byShort: s.byShort,
        };
        const complete = prev.sig === sig && prev.chunkCount != null && Object.keys(prev.chunks || {}).length >= prev.chunkCount;
        if (complete) {
          store.sources[s.rawId] = { ...prev, ...meta };
          continue;
        }
        const chunks = chunkTokens(tokenize(s.raw));
        const cur = { ...prev, ...meta, sig, chunkCount: chunks.length, chunks: prev.sig === sig ? { ...(prev.chunks || {}) } : {} };
        store.sources[s.rawId] = cur;
        await writeJsonAtomic(HARVEST_FILE(), store);
        for (let i = 0; i < chunks.length; i += 1) {
          const h = sha(chunks[i].text);
          if (cur.chunks[i]?.h === h) continue;
          const rows = parseRows(await runner(HARVEST_PROMPT(chunks[i].text, s.kind)));
          const lines = [];
          const have = new Set();
          for (const r of rows) {
            const ok = acceptLine(r, chunks[i].tokens);
            if (!ok) continue;
            const k = normKey(ok.quote);
            if (have.has(k)) continue;
            have.add(k);
            lines.push(ok);
            if (lines.length >= MAX_PER_CHUNK) break;
          }
          cur.chunks[i] = { h, asked: rows.length, lines };
          await writeJsonAtomic(HARVEST_FILE(), store);
          if (onProgress) onProgress({ source: s.idea, chunk: i, of: chunks.length, asked: rows.length, kept: lines.length });
        }
      }
      await writeJsonAtomic(HARVEST_FILE(), store);
    } catch (e) {
      console.log(`lineHarvest: pass stopped (${e?.message || e})`);
    } finally { running = null; }
  })();
  return running;
}
