// THE DAILY REVIEW, QUOTE FIRST (mockup 116, his ask 13 Nov 2026: "podcast
// quotes and concepts/ideas, such as those from Chris Williamson, Alex
// Hormozi, diary of a ceo").
//
// The card leads with the speaker's own words. Those words are NEVER written
// by a model. This file finds them in the vault, by code:
//
//   1. a quote is a span in quotation marks on the concept page itself (the
//      ingest wrote it there from the episode); nothing is composed here
//   2. it is checked word for word against the episode's verbatim transcript
//      (Raw/ ... (Transcript), YouTube captions with a time on every line).
//      A hit gives the REAL moment: the time of its first word
//   3. with no verbatim transcript, or no hit, the line may still stand on the
//      page's own say-so, and a time only if the paragraph carries ONE
//      bracketed time range of its own ("[200:04-201:31]"). Otherwise it shows
//      no time at all. A time is never estimated.
//   4. who said it comes only from what the vault says: a person page named
//      in the quote's own paragraph, the Raw note's `Guest:` line, or the
//      episode's single named person. When the vault does not settle it the
//      speaker is null and the card says so; it is never guessed.
//
// Everything here is pure over pages already read from the vault (the Raw
// transcripts are pages too), so it is fast and testable with fixtures.

/* ------------------------------- his shows ------------------------------- */

// The shows he asked for by name. Matched against what the vault itself says
// about a concept's sources (the source page, its Source line, the Raw note's
// header), so a page is "his show" only when the vault names it.
export const NAMED_SHOWS = [
  { key: 'williamson', re: /chris williamson|modern wisdom/i },
  { key: 'hormozi', re: /hormozi/i },
  { key: 'doac', re: /diary of a ceo|\bdoac\b|steven bartlett/i },
];

/* ------------------------------ text helpers ------------------------------ */

const titleOf = (v) => String(v ?? '');
const lastSegment = (s) => titleOf(s).split('/').pop();
const FILLERS = new Set(['um', 'uh', 'uhm', 'erm', 'mm', 'hmm', 'ah']);

export function normWords(text) {
  return titleOf(text)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/(^|\s)'+|'+(\s|$)/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLERS.has(w));
}

// "65:39" -> 3939; "1:05:39" -> 3939; anything else -> null
export function timeToSeconds(t) {
  const m = titleOf(t).trim().match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, a, b, c] = m;
  return c == null ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c);
}
// 3939 -> "1:05:39"; 2472 -> "41:12"
export function secondsToTime(s) {
  if (!Number.isFinite(s) || s < 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/* ------------------------------ the transcript ----------------------------- */

const LINE_RE = /^\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*(.*)$/;

// Rolling captions repeat the tail of the line before at the head of the next
// one. Read each line, drop the words it only repeats, and keep every word
// with the time of the line that first said it.
export function transcriptWords(rawText) {
  const out = []; // { w, t }
  let prev = [];
  for (const line of titleOf(rawText).split('\n')) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const t = timeToSeconds(m[1]);
    if (t == null) continue;
    const words = normWords(m[2].replace(/\[[^\]]*\]/g, ' '));
    let k = Math.min(prev.length, words.length);
    while (k > 0 && !prev.slice(prev.length - k).every((w, i) => w === words[i])) k -= 1;
    for (const w of words.slice(k)) out.push({ w, t });
    prev = words;
  }
  return out;
}

// Where does this quote start in the transcript? { atSeconds } on a hit, null
// otherwise. A quote with an ellipsis is checked piece by piece, in order.
export function findInTranscript(quote, words) {
  if (!words?.length) return null;
  const pieces = titleOf(quote).split(/\.{3}|…/).map(normWords).filter((p) => p.length >= 4);
  if (!pieces.length) return null;
  const hay = words.map((x) => x.w);
  let from = 0;
  let first = null;
  for (const piece of pieces) {
    const at = indexOfRun(hay, piece, from);
    if (at < 0) return null;
    if (first == null) first = at;
    from = at + piece.length;
  }
  return { atSeconds: words[first].t };
}
function indexOfRun(hay, run, from) {
  const head = run[0];
  for (let i = from; i <= hay.length - run.length; i += 1) {
    if (hay[i] !== head) continue;
    let ok = true;
    for (let j = 1; j < run.length; j += 1) if (hay[i + j] !== run[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

/* --------------------------- quotes on a concept page ----------------------- */

const QUOTE_RE = /["“]([^"“”]{36,260}?)["”]/g;
// a quote the page only reports ("Carl Jung is quoted: ...") is not the
// speaker's own line
const REPORTING_RE = /\b(quot(?:e|ed|es|ing)|cit(?:e|es|ed|ing)|coined|wrote|writes|according to|proverb|saying|aphorism|motto)\b/i;
const STOP_CAPS = new Set(['the', 'a', 'an', 'it', 'he', 'she', 'they', 'this', 'that', 'his', 'her', 'their', 'there', 'in', 'on', 'for', 'and', 'but', 'so', 'if', 'when', 'as', 'at', 'by', 'to', 'of', 'with', 'one', 'people', 'most', 'every', 'what', 'why', 'how', 'who', 'not', 'no', 'you', 'we', 'i', 'its']);

const MARKER_RE = /\[(\d{1,3}:\d{2}(?::\d{2})?)(?:\s*[–—-]\s*\d{1,3}:\d{2}(?::\d{2})?)?((?:\s*,\s*\d{1,3}:\d{2}(?::\d{2})?(?:\s*[–—-]\s*\d{1,3}:\d{2}(?::\d{2})?)?)*)\]/g;

// The paragraph's own recorded time: only when it carries exactly one bracket
// and that bracket is a single range. Two ranges ("[84:07-85:20, 136:51-...]")
// mean the paragraph spans moments, so no single start is honest.
export function paragraphMarker(paragraph) {
  const marks = [...titleOf(paragraph).matchAll(MARKER_RE)];
  if (marks.length !== 1) return null;
  if (marks[0][2]) return null;
  return timeToSeconds(marks[0][1]);
}

function cleanPara(p) {
  return titleOf(p)
    .replace(/\*\*|__/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1');
}

// Candidate quotes on a page. `people` is a Set of lower-cased person-page
// titles, used to tell "he said it" from "the page reports a third party".
export function extractQuotes(raw, { people = new Set() } = {}) {
  const body = titleOf(raw).replace(/^---\n[\s\S]*?\n---\n?/, '');
  const out = [];
  for (const para of body.split(/\n\s*\n/)) {
    if (/^\s*#/.test(para)) continue;
    const marker = paragraphMarker(para);
    const text = cleanPara(para).replace(/\s+/g, ' ');
    for (const m of text.matchAll(QUOTE_RE)) {
      const q = m[1].trim().replace(/[,;]+$/, '');
      // straight quotes pair by position: an opening mark follows a space or an
      // opener, and the words inside start with a letter. Anything else is the
      // gap BETWEEN two quotes, not a quote
      const prev = text[m.index - 1];
      if ((prev && !/[\s(:\u2014\u2013-]/.test(prev)) || !/^[\p{L}\p{N}]/u.test(q)) continue;
      if (/[\[\]{}]/.test(q) || q.split(/\s+/).length < 7) continue; // a template or a fragment
      if (/\.{3}|…/.test(q) && q.split(/\.{3}|…/).some((s) => s.trim().split(/\s+/).length < 4)) continue;
      // the clause in front of it: a reporting verb or a third party's name
      // means the words are not the speaker's own
      const before = text.slice(Math.max(0, m.index - 110), m.index);
      const clause = before.split(/(?<=[.!?])\s+/).pop() || '';
      if (REPORTING_RE.test(clause)) continue;
      if (thirdParty(clause, people)) continue;
      out.push({ text: q, paragraph: text, marker, before: clause });
    }
  }
  return out;
}

// A capitalised name (two words, or a known name) in the clause before the
// quote that is not a person page of his vault: somebody else's line.
function thirdParty(clause, people) {
  const t = titleOf(clause).replace(/[()]/g, ' ');
  const names = [...t.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)].map((m) => m[1]);
  return names.some((n) => !people.has(n.toLowerCase()) && !STOP_CAPS.has(n.split(/\s+/)[0].toLowerCase()));
}

/* -------------------------------- the source -------------------------------- */

const SOURCE_LINE_RE = /\*\*Source:?\*\*:?\s*(?:\[([^\]]+)\]\(([^)]*)\)|([^\n]+))/;
// "Title — Channel — 2:16:48" -> { title, channel, duration }
function parseSourceLine(content) {
  const m = titleOf(content).match(SOURCE_LINE_RE);
  if (!m) return null;
  const label = (m[1] || m[3] || '').trim();
  const parts = label.split(/\s+[—–]\s+/);
  if (parts.length >= 3 && /^\d{1,2}(:\d{2}){1,2}$/.test(parts[parts.length - 1])) {
    return { title: parts.slice(0, -2).join(' — '), channel: parts[parts.length - 2].trim() };
  }
  return { title: label, channel: null };
}

function rawHeader(rawContent, key) {
  const m = titleOf(rawContent).match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
  return m ? m[1].trim() : null;
}

// The show, as the vault words it. Never a guess from a name.
export function showFrom({ line, rawContent }) {
  const hostShow = rawHeader(rawContent, 'Host / Show');
  if (hostShow) {
    const parts = hostShow.split(',').map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] || null;
  }
  return line?.channel || null;
}

// What the vault says about one source page, for ranking and for the card.
export function describeSource(sourcePage, byTitle) {
  if (!sourcePage) return null;
  const line = parseSourceLine(sourcePage.raw);
  const rawTitle = sourcePage.rawLink ? lastSegment(sourcePage.rawLink).toLowerCase() : null;
  const rawPage = rawTitle ? byTitle.get(rawTitle) || null : null;
  // a Raw note named after the source (no `raw:` link) is the same episode
  const rawGuess = rawPage || byTitle.get(`${titleOf(sourcePage.title).toLowerCase()} (transcript)`) || null;
  const rawContent = rawGuess?.raw || '';
  return {
    page: sourcePage,
    title: line?.title || sourcePage.title,
    episode: sourcePage.title,
    url: sourcePage.url || rawHeader(rawContent, 'URL') || rawHeader(rawContent, 'Source URL') || null,
    show: showFrom({ line, rawContent }),
    guest: rawHeader(rawContent, 'Guest'),
    rawPage: rawGuess,
    text: `${sourcePage.title} ${(line?.title || '')} ${(line?.channel || '')} ${rawContent.slice(0, 600)}`,
  };
}

// Which of his named shows does this concept stand on? null for none.
export function namedShow(sources) {
  for (const s of sources || []) {
    for (const n of NAMED_SHOWS) if (n.re.test(s.text)) return n.key;
  }
  return null;
}

/* ----------------------------------- who ----------------------------------- */

// People the page names in the paragraph around the quote, from the vault's own
// person pages, outside the quote itself.
function peopleIn(text, people) {
  const hay = titleOf(text);
  const found = [];
  for (const [low, title] of people) {
    const re = new RegExp(`(^|[^\\p{L}])${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
    if (re.test(hay)) found.push(title);
  }
  return found;
}

export function speakerFor({ quote, source, people }) {
  const outside = quote.paragraph.replace(quote.text, ' ');
  const near = peopleIn(outside, people);
  if (near.length === 1) return near[0];
  if (source?.guest) {
    const g = [...people.values()].find((t) => t.toLowerCase() === source.guest.toLowerCase());
    return g || source.guest;
  }
  if (near.length === 0) {
    const inSource = peopleIn(source?.text || '', people);
    if (inSource.length === 1) return inSource[0];
  }
  return null;
}

/* ------------------------------ one page's quote ----------------------------- */

// The context a caller builds once per vault read: byTitle (lower-cased title
// to page) and people (lower-cased title to title, entity pages only).
export function quoteContext(pages) {
  const byTitle = new Map(pages.map((p) => [titleOf(p.title).toLowerCase(), p]));
  const people = new Map();
  for (const p of pages) if (p.type === 'entity') people.set(titleOf(p.title).toLowerCase(), titleOf(p.title));
  return { byTitle, people, words: new Map() };
}

function wordsOf(ctx, rawPage) {
  if (!rawPage) return null;
  if (!ctx.words.has(rawPage.id)) ctx.words.set(rawPage.id, transcriptWords(rawPage.raw));
  return ctx.words.get(rawPage.id);
}

export function sourcesOf(page, ctx) {
  return (page.sources || [])
    .map((s) => describeSource(ctx.byTitle.get(titleOf(s.title).toLowerCase()), ctx.byTitle))
    .filter(Boolean);
}

// His show first: a concept stands on one of his named shows, and whether it
// has a line to lead with at all. Both are cheap and read nothing new.
export function reviewRank(page, ctx) {
  const sources = sourcesOf(page, ctx);
  const quotes = extractQuotes(page.raw, { people: new Set(ctx.people.keys()) });
  return { show: namedShow(sources), hasQuote: quotes.length > 0, sources, quotes };
}

const score = (q) => (q.verified ? 3 : q.marker != null ? 2 : 1);
// a whole sentence reads as a pull quote; a clipped fragment only when nothing better exists
const wholeSentence = (t) => /^[A-Z0-9]/.test(t) && /[.!?]$/.test(t);

// The line for a page's card, or null when the page has none. Shape:
//   { text, who, show, episode, at, atSeconds, url, verified, sourceTitle }
// Every field is either real or null.
export function quoteFor(page, ctx, { rank } = {}) {
  const r = rank || reviewRank(page, ctx);
  if (!r.quotes.length) return null;
  const scored = r.quotes.map((q) => {
    let hit = null;
    let source = null;
    for (const s of r.sources) {
      const found = findInTranscript(q.text, wordsOf(ctx, s.rawPage));
      if (found) { hit = found; source = s; break; }
    }
    return { q, hit, source, verified: !!hit };
  });
  const best = scored
    .map((s) => ({ ...s, rankScore: score({ verified: s.verified, marker: s.q.marker }) * 1000 + (wholeSentence(s.q.text) ? 400 : 0) - Math.abs(s.q.text.length - 110) }))
    .sort((a, b) => b.rankScore - a.rankScore)[0];
  // unverified, many sources: the page cannot say which one it came from
  const source = best.source || (r.sources.length === 1 ? r.sources[0] : null);
  const atSeconds = best.hit ? best.hit.atSeconds : (best.q.marker != null && source ? best.q.marker : null);
  return {
    text: best.q.text,
    who: source ? speakerFor({ quote: best.q, source, people: ctx.people }) : null,
    show: source?.show || null,
    episode: source?.title || null,
    sourcePage: source?.episode || null,
    url: source?.url || null,
    verified: best.verified,
    atSeconds,
    at: atSeconds == null ? null : secondsToTime(atSeconds),
  };
}
