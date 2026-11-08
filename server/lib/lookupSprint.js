// LOOK IT UP WHILE WE TALK (7 Nov 2026, design/ROSE-STUDY.md §5 phase 1).
//
// Rose, asked "why don't you look it up? It's called the Busy Bar", says
// "checking right boss" and thirteen panels rise as she talks: pages,
// videos, figures, an entity card, a chart. The pages and videos are real
// and already on the wall before she has said a word of the answer.
//
// Nova's version, by the Method: CODE decides a turn needs the outside
// world (lib/askRoute.js webLookup, or his own "look it up"), CODE searches
// and reads (lib/localResearch.js: Brave when keyed, else Bing in Nova's own
// Chrome profile; three pages) and CODE finds a clip or two (yt-dlp), all
// inside one budget, in parallel, BEFORE the model is asked. Two things
// then happen with what it found:
//   1. the pages and clips go on the glass at once as `page` and `video`
//      panels (lib/visualStream.js publishLookup), so the wall fills while
//      Nova says "Checking the Busy Bar." Nothing on those panels is a
//      model's: title, host, URL, poster and first lines are the page's own;
//   2. the model gets them as numbered pages (lookupBlock) and may raise a
//      figure, a quote or an entity card ON one of them, which code checks
//      against that page's text before it is drawn (lib/glassClaims.js).
//
// A sprint that finds nothing costs one honest line in the prompt ("the
// search found nothing readable") and the turn goes on. A sprint that
// overruns its budget hands the model what it has; stragglers still land
// on the glass through the callbacks, never in the prompt.
//
// Never for his own world ("my", "today", a session) and never for a
// judgement question: askRoute keeps those where they were.

import { spawn } from 'node:child_process';
import { webLookup, needsClaude } from './askRoute.js';
import { webSearch, readPage, searchQuery, webCanRun, searchResting, sourcesBlock } from './localResearch.js';
import { toolFor } from './browserResearch.js';

export const PAGES = 3;
export const CLIPS = 2;
export const BUDGET_MS = 6000;
export const PAGE_CHARS = 2400;

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// his own words for a lookup, as he says them in conversation
const ASKED = /\b(?:look (?:it|that|this|them|him|her) up|look up|search (?:for|the web|online|the internet)|search it|google (?:it|that|this|for)?|find out (?:about|what|who|where|when|how)|read up on)\b/i;
// his own world is never the web, whatever verb he used
const OWN = /\b(?:my|our|mine|ours|myself)\b/i;
// nor is what is in front of him: the glass, the wall, the cards on it (the
// reel test, 8 Nov 2026: "What's on the screen right now?" searched the web
// and the answer described a website called ScreenAwake)
const GLASS = /\b(?:on|the|this|that|his|your) (?:screen|glass|wall|hud|display)\b|\b(?:these|those|the|that|this) (?:cards?|panels?|boxes|tiles?)\b|\bin front of me\b|\bwhat am i looking at\b|\bup there\b|\bon show\b/i;
const CALLED = /\b(?:it'?s |this is |that'?s |they'?re )?(?:called|named|known as)\s+([^.,;!?]+)/i;
const LEAD = /^(?:(?:so|and|ok|okay|right|well|hey|now)[, ]+)?(?:nova[,:]?\s*)?(?:(?:why don'?t|can|could|would|will) you |please |just )*(?:go (?:and |on and )?)?(?:look (?:it|that|this|them) up|look up|search (?:for|the web for|online for|the internet for)?|google|find out (?:about|what|who)?|read up on|check (?:out|on)?|research)\s*/i;
const TAIL = /\s*(?:for me|please|online|on the web|on the internet|would you|will you|right now|quickly)\s*[.?!]*\s*$/i;
const PRON = /^(?:it|that|this|them|him|her|the thing|this thing|that thing)\s*[.?!]*$/i;
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'is', 'are', 'was', 'what', 'who', 'how', 'why', 'does', 'do', 'did', 'this', 'that', 'it', 'its', 'with', 'about', 'thing', 'called', 'one', 'me', 'you', 'we', 'they']);
const contentWords = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' -]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** What to search for, from his sentence; `previous` is the turn before
 *  (for "look it up" after "this is the Busy Bar"). Pure. */
export function lookupQuery(raw, previous = '') {
  const q = String(raw || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const called = q.match(CALLED);
  if (called) {
    const name = clean(called[1].replace(/\b(?:and|but|so|which)\b[\s\S]*$/i, ''), 80);
    // the qualifier after the name rides along ("the Busy Bar, by Flipper
    // Devices"): a name alone found a dictionary (measured 8 Nov 2026)
    const after = q.slice(called.index + called[0].length).match(/^[,;:]?\s*(?:by|from|made by|built by|of)\s+([^.,;!?]+)/i);
    const qual = after ? clean(after[1].replace(/\b(?:and|but|so|which)\b[\s\S]*$/i, ''), 60) : '';
    // the name in quotes: Bing honours them, and "the Busy Bar" unquoted
    // found a dictionary twice (8 Nov); the article is dropped inside them
    if (contentWords(name).length) { const bare = name.replace(/^(?:the|a|an)\s+/i, ''); return qual ? `"${bare}" ${qual}` : `"${bare}"`; }
  }
  let s = searchQuery(q).replace(LEAD, '').replace(TAIL, '').replace(/^(?:it'?s |this is |that'?s |they'?re )/i, '').trim();
  s = s.replace(/[.?!]+$/, '').trim();
  if (!s || PRON.test(s) || !contentWords(s).length) {
    const p = String(previous || '').replace(/\[[^\]]*\]/g, ' ').trim();
    const pc = p.match(CALLED);
    if (pc && contentWords(pc[1]).length) return `"${clean(pc[1].replace(/\b(?:and|but|so|which)\b[\s\S]*$/i, ''), 80).replace(/^(?:the|a|an)\s+/i, '')}"`;
    const pw = contentWords(p);
    return pw.length ? pw.slice(0, 8).join(' ') : null;
  }
  return clean(s, 120);
}

/** Should this turn look the web up first? { query, why } or null. Pure. */
export function lookupWanted(raw, { previous = '' } = {}) {
  const q = String(raw || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  if (needsClaude(q)) return null;   // a correction of the last answer
  if (OWN.test(q.replace(/\bfor me\b/gi, ''))) return null;
  if (GLASS.test(q)) return null;         // a question about what is on the glass answers from the glass
  const explicit = ASKED.test(q);
  if (!explicit && !webLookup(q)) return null;
  const query = lookupQuery(q, previous);
  if (!query) return null;
  // the thing itself, for the ack ("Checking the Busy Bar."): the name before
  // any qualifier, or the first few words
  const name = lookupName(q, query);
  return { query, name, why: explicit ? 'he asked for a lookup' : 'a question about the outside world' };
}

/** Is this about what is on the glass? (lib/askDispatch routes it to Claude, which holds the screen block.) Pure. */
export const glassQuestion = (raw) => GLASS.test(String(raw || '').replace(/\[[^\]]*\]/g, ' '));

/** The short name of what is being looked up, for the ack. Pure. */
export function lookupName(raw, query) {
  const q = String(raw || '').replace(/\[[^\]]*\]/g, ' ');
  const called = q.match(CALLED);
  if (called) {
    const name = clean(called[1].replace(/\b(?:and|but|so|which)\b[\s\S]*$/i, ''), 60);
    if (contentWords(name).length) return name;
  }
  const w = String(query || '').split(/\s+/).filter(Boolean);
  return w.length <= 4 ? w.join(' ') : null;
}

/** Can a sprint run right now? Chrome or a Brave key, and the engine is
 *  not resting after a refusal. Never under the test runner. */
export function lookupCanRun() {
  return webCanRun() && !searchResting();
}

const withDeadline = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), Math.max(0, ms)))]);

// the first lines of a page, as the card prints them
export function firstLines(text, n = 3) {
  const sents = String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [];
  // a page's boilerplate is not its first line ("Your browser doesn't support HTML5 audio")
  const junk = /your browser|cookies?|javascript|sign (?:in|up)|subscribe|all rights reserved|skip to/i;
  return sents.map((s) => s.trim()).filter((s) => s.length > 24 && s.length < 220 && !junk.test(s)).slice(0, n);
}

/** Up to two clips worth a card: 45 s to 40 min, the most of the query's
 *  words in the title. Pure over yt-dlp's rows. */
export function pickClips(rows, query, n = CLIPS) {
  const words = String(query || '').toLowerCase().split(/\W+/).filter((x) => x.length > 2);
  return rows
    .filter((r) => r.id && r.durationS >= 45 && r.durationS <= 40 * 60)
    .map((r) => ({ r, s: words.reduce((k, w) => k + (r.title.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .sort((a, b) => b.s - a.s || a.r.durationS - b.r.durationS)
    .slice(0, n)
    .map(({ r }) => ({ id: r.id, title: r.title, channel: r.channel || null, durationS: r.durationS, url: `https://www.youtube.com/watch?v=${r.id}`, poster: null, portrait: false }));
}

export function parseRows(out) {
  return String(out || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [id, channel, dur, ...title] = l.split('|');
    return { id, channel, durationS: Number(dur) || 0, title: title.join('|') };
  });
}

async function findClips(query, { timeoutMs = BUDGET_MS, ytdlp = process.env.YTDLP_PATH || 'yt-dlp' } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      // --flat-playlist: the search page's own rows (id, channel, duration,
      // title all present), 1.5 s measured 8 Nov 2026; without it yt-dlp
      // opens every video for its full metadata, 10 s, past the sprint's
      // whole budget, and the wall had no clip
      child = spawn(ytdlp, [`ytsearch4:${q}`, '--flat-playlist', '--skip-download', '--no-warnings', '--print', '%(id)s|%(channel)s|%(duration)s|%(title)s'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return resolve([]); }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } resolve(pickClips(parseRows(out), q)); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => { clearTimeout(timer); resolve(pickClips(parseRows(out), q)); });
    child.on('error', () => { clearTimeout(timer); resolve([]); });
  });
}

// a picture served from Nova's own origin, never hot-linked from the page
async function cachedPicture(url) {
  if (!url) return null;
  try {
    const { cacheImage } = await import('./briefingMedia.js');
    const got = await cacheImage(url);
    // the route is /api/briefing/media/:key and finds the file's own extension
    return got?.key ? `/api/briefing/media/${got.key}` : null;
  } catch { return null; }
}

/**
 * The sprint. Searches and reads the pages and finds the clips, in
 * parallel, inside `budgetMs`. Calls back as things land so the glass can
 * fill before the model is asked:
 *   onSearched(lookup)  the result list is in: page cards can go up
 *   onPage(lookup, n)   page n has been read (text, lines, maybe a picture)
 *   onClips(lookup)     the clips are in (poster later via onClips again)
 * Resolves with the lookup as it stands at the deadline. Never throws.
 */
export async function runLookupSprint(query, { name = null, budgetMs = BUDGET_MS, pages = PAGES, onSearched = null, onPage = null, onClips = null, deps = {}, now = Date.now } = {}) {
  const started = now();
  const lookup = { query: String(query || '').trim(), name: name || null, sources: [], clips: [], misses: [], hostsRead: [], timings: {}, searchError: null, done: false, startedAt: started };
  const safe = (fn, ...a) => { try { fn?.(...a); } catch { /* a listener never costs the sprint */ } };
  const left = () => Math.max(0, budgetMs - (now() - started));
  const search = deps.search || ((q) => webSearch(q, { max: 6 }));
  const read = deps.read || ((u, ms) => readPage(u, { maxChars: PAGE_CHARS, timeoutMs: ms }));
  const clips = deps.clips || ((q, ms) => findClips(q, { timeoutMs: ms }));
  const picture = deps.picture || cachedPicture;

  // clips start at once and land whenever they land (never in the prompt
  // after the deadline, always on the glass)
  const clipRun = Promise.resolve().then(() => clips(lookup.query, budgetMs)).then(async (found) => {
    lookup.clips = (found || []).slice(0, CLIPS);
    safe(onClips, lookup);
    await Promise.all(lookup.clips.map(async (c) => {
      const p = await picture(`https://i.ytimg.com/vi/${c.id}/hqdefault.jpg`);
      if (p) { c.poster = p; safe(onClips, lookup); }
    }));
  }).catch(() => {});

  const pageRun = (async () => {
    let found;
    const t0 = now();
    try {
      found = await search(lookup.query);
    } catch (e) {
      // the full query missed ("the Busy Bar Flipper Devices" found nothing
      // about the question, measured 8 Nov): the name alone gets one more go
      const shorter = shorterQuery(lookup.query);
      if (shorter && /none of them about/.test(String(e?.message || e))) {
        try {
          found = await search(shorter);
          lookup.searchedAs = shorter;
        } catch (e2) {
          lookup.searchError = String(e2?.message || e2);
          lookup.timings.search = now() - t0;
          return;
        }
      } else {
        lookup.searchError = String(e?.message || e);
        lookup.timings.search = now() - t0;
        return;
      }
    }
    lookup.timings.search = now() - t0;
    if (found?.host) lookup.hostsRead.push(found.host);
    const picks = (found?.results || []).filter((r) => r?.url && toolFor(r.url) !== 'transcript').slice(0, pages);
    lookup.sources = picks.map((r, i) => ({ n: i + 1, title: clean(r.title, 120) || hostOf(r.url), url: r.url, host: hostOf(r.url), snippet: clean(r.snippet, 200) || null, text: '', lines: [], image: null, read: false }));
    safe(onSearched, lookup);
    const t1 = now();
    await Promise.all(lookup.sources.map(async (s) => {
      const ms = Math.max(2500, left());
      let p;
      try { p = await read(s.url, ms); } catch (e) { p = { ok: false, reason: String(e?.message || e) }; }
      if (p?.host && !lookup.hostsRead.includes(p.host)) lookup.hostsRead.push(p.host);
      if (p?.ok && String(p.text || '').trim()) {
        s.text = p.text;
        s.title = p.title && p.title !== s.host ? clean(p.title, 120) : s.title;
        s.lines = firstLines(p.text);
        s.read = true;
        safe(onPage, lookup, s.n);
        if (p.image) {
          const pic = await picture(p.image);
          if (pic) { s.image = pic; safe(onPage, lookup, s.n); }
        }
      } else {
        lookup.misses.push({ url: s.url, reason: p?.reason || 'nothing readable' });
        safe(onPage, lookup, s.n);
      }
    }));
    lookup.timings.reads = now() - t1;
  })();

  await withDeadline(Promise.all([pageRun, clipRun]), budgetMs, null);
  lookup.timings.total = now() - started;
  lookup.done = true;
  return lookup;
}

/** The first few content words of a query, for a second search when the
 *  whole phrase found nothing: "the Busy Bar Flipper Devices" → "Busy Bar".
 *  Null when the query is already that short. Pure. */
export function shorterQuery(query) {
  const q = String(query || '');
  // a quoted name with a qualifier after it: the quoted name alone
  const m = q.match(/^"([^"]+)"\s+\S/);
  if (m) return `"${m[1]}"`;
  const w = q.replace(/^the\s+/i, '').split(/\s+/).filter(Boolean);
  if (w.length <= 2) return null;
  return w.slice(0, 2).join(' ');
}

/** The pages the model may answer from: only those read in time. Pure. */
export function readSources(lookup) {
  return (lookup?.sources || []).filter((s) => s.read && s.text);
}

/** The block the model reads, after his words. Pure. */
export function lookupBlock(lookup) {
  if (!lookup) return '';
  const read = readSources(lookup);
  const clips = lookup.clips || [];
  const head = `[LOOKED UP JUST NOW by Nova's browser, for "${lookup.query}". The pages and clips below are ALREADY on his glass as page and video cards; a page is lit when you write VIS {"kind":"page","source":n} before the sentence that uses it, a clip with VIS {"kind":"video","clip":n}. Answer from these pages where they answer; a figure, quote or entity you raise must name its "source" number and code checks it against that page before it is drawn. Never a number, name or quote these pages do not hold; if they do not answer, say so in one line and answer from what you know, marked as such.]`;
  const pages = read.length ? sourcesBlock(read.map((s) => ({ n: s.n, title: s.title, url: s.url, text: s.text })), { budget: PAGES * PAGE_CHARS }) : `(the search ${lookup.searchError ? `failed: ${lookup.searchError}` : 'found no page that could be read in time'})`;
  const clipLine = clips.length ? `\nCLIPS: ${clips.map((c, i) => `(${i + 1}) ${c.title}${c.channel ? ` — ${c.channel}` : ''}`).join('; ')}` : '';
  return `${head}\n\n${pages}${clipLine}`;
}

/** The lookup as the client sees it: no page bodies. Pure. */
export function lookupSummary(lookup) {
  if (!lookup) return null;
  return {
    query: lookup.query, done: !!lookup.done,
    pages: (lookup.sources || []).map((s) => ({ n: s.n, title: s.title, host: s.host, read: !!s.read })),
    clips: (lookup.clips || []).map((c) => ({ title: c.title, channel: c.channel })),
    searchError: lookup.searchError || null,
  };
}

/** One spoken line while the sprint runs longer than a breath: only once
 *  the pages are known (the ack already said what is being looked up), so
 *  it is never the ack said twice. Null before that. Pure. */
export function sprintLine(lookup) {
  const n = (lookup?.sources || []).length;
  if (!n) return null;
  return `Reading ${n === 1 ? 'one page' : `${n} pages`} on ${lookup.name || lookup.query}.`;
}
