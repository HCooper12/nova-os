// LOOKING THINGS UP WITHOUT CLAUDE (1 Nov 2026). His decision, the same day:
// "yes to a Claude-free research lane: searches and page reads run in Nova's
// own Chrome profile, the local model summarises with sources, Claude only
// when he asks for a proper research brief." The goal is that "look this up"
// never spends his Claude usage.
//
// THREE STEPS, AND ONLY THE LAST IS A MODEL:
//   1. webSearch: code opens a results page in Nova's Chrome profile
//      (~/.nova-browser, lib/browserResearch.js) and reads the result list
//      from the page's own HTML. A title, URL or snippet is never written by
//      a model, so a source can never be invented.
//   2. readPage: code reads each page, a logged-out fetch first and Chrome
//      when the page needs it (toolFor's walled platforms, or a page that
//      only renders with scripts), and keeps only the readable words
//      (readableText). A site that refuses (401/403/429) or shows a human
//      check is taken at its word and never retried another way.
//   3. researchLocally: ONE call to the model on this Mac with the question
//      and the numbered pages. Code then checks the answer: not empty, every
//      [n] it cites is a page it was given, at least one citation, and not a
//      "the sources do not say". Anything else is an honest failure, so the
//      caller can hand the question to Claude; never a guess dressed as a
//      sourced answer.
//
// WHY BING (measured 1 Nov 2026, from Nova's headless Chrome on this Mac):
// DuckDuckGo's HTML endpoint showed its "select all squares containing a
// duck" bot check, the same page plain fetch got earlier that day; Google
// redirected to /sorry ("unusual traffic from your computer network");
// DuckDuckGo's JS page rendered its chrome but no results after 2 s; Bing
// returned ten parseable results in 2.6 s, with no user-agent tricks. If
// Bing starts refusing, the error says so ("asked for a human check") rather
// than reporting no results.
//
// EVERY HOST IS RECEIPTED (the prompt pack's Wi-Fi-off drill): one log line
// per outbound read ("research read <host> via <fetch|chrome> <ms>ms") and
// the result carries `hostsRead`, so what left this Mac is always knowable.
//
// Read-only by construction, like browserResearch: navigate and extract
// text; never click, post, fill or sign in.
import { browserAvailable, profileExists, toolFor, withPage, readWithBrowser } from './browserResearch.js';
import { readableText } from './recipeFromPage.js';

const SEARCH_TIMEOUT_MS = () => Number(process.env.NOVA_RESEARCH_SEARCH_TIMEOUT_MS || 30_000);
const READ_TIMEOUT_MS = 15_000;
const MAX_HTML = 3 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
// a fetch that came back with fewer readable words than this is a script
// shell or a consent wall: worth one look in Chrome
const THIN_PAGE = 300;
// the pages' share of the summary prompt: ~3.5k tokens, well inside the 16k
// context lib/localModel.js runs every call with
const SOURCES_BUDGET = 14_000;

/** Can Nova's browser run for a search or a page read? Chrome where Nova
 *  expects it and its profile on disk. Never under the test runner (node
 *  --test sets NODE_TEST_CONTEXT): a test must not launch Chrome on his
 *  profile, so every test hands in its own seams. */
export function webCanRun() {
  if (process.env.NODE_TEST_CONTEXT && !process.env.NOVA_RESEARCH_IN_TESTS) return false;
  // a Brave key alone is enough to search; reads still prefer a plain fetch
  // and only need Chrome for the pages that want it
  if (braveKey()) return true;
  return browserAvailable() && profileExists();
}

// A SEARCH ENGINE THAT IS REFUSING IS LEFT ALONE FOR A WHILE (1 Nov 2026).
// The first real run found Bing serving Nova's headless Chrome junk for
// every query (toy shops for "creatine side effects"). Each lookup that hits
// that costs 3-5 s before the honest failure, so after a human check or a
// junk page the search rests for REST_MS: Ask Nova stops offering the web
// and stops searching first, and says nothing it cannot back. Real searches
// only; a test's seam never trips it.
const REST_MS = () => Number(process.env.NOVA_RESEARCH_REST_MS || 20 * 60_000);
let resting = { until: 0, reason: '' };
const restFor = (ms, reason) => { resting = { until: Date.now() + ms, reason }; };
/** The reason the search is resting, or null when it may be tried. */
export function searchResting(now = Date.now()) { return now < resting.until ? resting.reason : null; }
export function _resetSearchRest() { resting = { until: 0, reason: '' }; }

// BRAVE SEARCH (his decision, 1 Nov 2026). Every free engine refuses headless
// Chrome or serves junk (measured the same day), so he chose Brave's search
// API with a key he adds himself as BRAVE_SEARCH_KEY in server/.env. Only the
// search words leave this Mac (his notes never do), and the key is read per
// call, sent only as a header, and never written to a log or an error.
const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
const BRAVE_HOST = 'api.search.brave.com';
const braveKey = () => String(process.env.BRAVE_SEARCH_KEY || '').trim();
const BRAVE_RATE_REST_MS = 60_000;

export const searchUrl = (query) => `https://www.bing.com/search?q=${encodeURIComponent(String(query || '').trim())}`;

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const unescapeAttr = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const textOf = (html) => readableText(html).replace(/\s+/g, ' ').trim();

/** Bing's result links go through its click tracker (bing.com/ck/a?...&u=a1
 *  + base64url of the real address). The real address, or the link as given
 *  when it is already direct. Pure. */
export function resultTarget(href) {
  const h = unescapeAttr(href);
  let u;
  try { u = new URL(h, 'https://www.bing.com'); } catch { return null; }
  if (/(^|\.)bing\.com$/.test(u.hostname) && u.pathname.startsWith('/ck/')) {
    const enc = u.searchParams.get('u') || '';
    if (!enc.startsWith('a1')) return null;
    try {
      const real = Buffer.from(enc.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      return /^https?:\/\//.test(real) ? real : null;
    } catch { return null; }
  }
  return /^https?:$/.test(u.protocol) ? u.href : null;
}

/** The organic results on a Bing results page: [{title, url, snippet}], in
 *  page order, deduplicated, Bing's and Microsoft's own links left out. Read
 *  from the page's HTML, never from memory. Pure. */
export function parseSearchResults(html, { max = 6 } = {}) {
  const out = [];
  const seen = new Set();
  const blocks = String(html || '').split(/<li\b[^>]*\bclass="b_algo\b[^"]*"[^>]*>/i).slice(1);
  for (const raw of blocks) {
    if (out.length >= max) break;
    const block = raw.split(/<li\b[^>]*\bclass="b_algo\b/i)[0];
    const h2 = block.match(/<h2\b[^>]*>\s*<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!h2) continue;
    const url = resultTarget(h2[1]);
    if (!url) continue;
    const host = hostOf(url);
    if (!host || /(^|\.)(bing\.com|microsoft\.com|msn\.com)$/.test(host)) continue;
    const key = url.replace(/#.*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const title = textOf(h2[2]);
    const p = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = p ? textOf(p[1]).replace(/^\d{1,2} \w{3} \d{4}\s*·\s*/, '') : '';
    out.push({ title: title || host, url, snippet });
  }
  return out;
}

// a results page, or a page, that is a bot check, said as one
const HUMAN_CHECK = /unusual traffic|confirm (?:this search was made by|you are) a human|are you a robot|captcha|solve the challenge|performing security verification|checking (?:if the site connection is secure|your browser)|^just a moment\.\.\./im;

// JUNK RESULTS ARE NOT RESULTS (measured 1 Nov 2026, the first real run).
// Bing answered Nova's headless Chrome with a full, parseable page of the
// wrong thing: "what is the current recommended protein intake per kg" gave
// six pages about electric current, "recommended protein intake per kg for
// muscle gain" gave Hong Kong job boards, and only "protein intake per kg
// muscle gain" gave nutrition pages. A list that parses is not a list that
// answers, so code keeps only results whose title, snippet or address share
// the question's own words; none left is a failure said as one.
const STOP = new Set(['the', 'for', 'and', 'per', 'how', 'who', 'why', 'are', 'was', 'can', 'its', 'you', 'his', 'her', 'not', 'but', 'any', 'all', 'get', 'use', 'has', 'had', 'did', 'out', 'way', 'what', 'when', 'where', 'which', 'whom', 'whose', 'does', 'that', 'this', 'with', 'from', 'about', 'have', 'there', 'their', 'them', 'they', 'will', 'would', 'should', 'could', 'into', 'your', 'than', 'then', 'much', 'many', 'some', 'most', 'more', 'best', 'good', 'like', 'just', 'tell', 'look', 'find', 'search', 'please', 'nova', 'current', 'currently', 'latest', 'recommended', 'today', 'right', 'know', 'need', 'want', 'make', 'over', 'also', 'each', 'very', 'been', 'were', 'being']);
export const queryWords = (q) => [...new Set(String(q || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))];

/** The results that are about the query: at least half its own words (and
 *  never fewer than one) appear in the title, snippet or address. Pure. */
export function relevantResults(results, query) {
  const words = queryWords(query);
  if (!words.length) return results;
  const need = Math.max(1, Math.ceil(words.length / 2));
  return results.filter((r) => {
    const hay = `${r.title} ${r.snippet} ${r.url}`.toLowerCase();
    return words.filter((w) => hay.includes(w) || (w.length > 4 && hay.includes(w.slice(0, -1)))).length >= need;
  });
}

/**
 * Search the web in Nova's Chrome profile. Resolves { results, ms, host };
 * throws a plain reason (no browser, no profile, a human check, a timeout,
 * nothing readable). `deps.withPage` is the test seam: tests never launch
 * Chrome.
 */
export async function webSearch(query, { max = 6, timeoutMs = SEARCH_TIMEOUT_MS(), deps = {} } = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('there was nothing to search for');
  if (braveKey() && !deps.withPage) return braveSearch(q, { max, deps });
  const open = deps.withPage || withPage;
  if (!deps.withPage) {
    if (!browserAvailable()) throw new Error('Chrome is not installed where Nova expects it');
    if (!profileExists()) throw new Error('Nova\'s browser profile (~/.nova-browser) does not exist yet');
    if (!webCanRun()) throw new Error('Nova\'s browser is not launched under the test runner');
    const restingFor = searchResting();
    if (restingFor) throw new Error(`the web search is resting after: ${restingFor}`);
  }
  const rest = (reason) => { if (!deps.withPage) resting = { until: Date.now() + REST_MS(), reason }; return new Error(reason); };
  const url = searchUrl(q);
  const host = hostOf(url);
  const t0 = Date.now();
  let timer;
  const page = open(async (p) => {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // the result list is server-rendered; a short settle lets late blocks land
    await new Promise((r) => setTimeout(r, 1200));
    return { html: await p.content(), text: await p.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '') };
  });
  let got;
  try {
    got = await Promise.race([
      page,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`the search took longer than ${Math.round(timeoutMs / 1000)} s`)), timeoutMs + 5000); }),
    ]);
  } catch (e) {
    console.log(`research search ${host} via chrome ${Date.now() - t0}ms failed: ${String(e.message).slice(0, 120)}`);
    const m = String(e.message || e);
    throw new Error(/^(?:the search|Nova's browser)/.test(m) ? m : `the search page could not be opened (${m.slice(0, 120)})`);
  } finally { clearTimeout(timer); }
  const ms = Date.now() - t0;
  console.log(`research search ${host} via chrome ${ms}ms`);
  const listed = parseSearchResults(got.html, { max: Math.max(max, 10) });
  if (!listed.length) {
    if (HUMAN_CHECK.test(`${got.text}\n${got.html.slice(0, 20_000)}`)) throw rest(`${host} asked for a human check instead of showing results`);
    throw new Error(`${host} showed no results Nova could read`);
  }
  const results = relevantResults(listed, q).slice(0, max);
  if (!results.length) {
    console.log(`research search ${host}: ${listed.length} result(s), none about "${q.slice(0, 80)}" (${listed.slice(0, 3).map((r) => hostOf(r.url)).join(', ')})`);
    throw rest(`${host} showed ${listed.length} results, none of them about the question`);
  }
  return { results, ms, host, offTopic: listed.length - results.length };
}

/** The Brave Search API: web.results[] mapped to the same {title, url,
 *  snippet} the Bing parser returns, then the same relevance filter. A refused
 *  key rests the search 20 minutes, a rate limit 60 s. `deps.fetchImpl` is the
 *  test seam. */
async function braveSearch(q, { max, deps }) {
  const key = braveKey();
  const fetchImpl = deps.fetchImpl || fetch;
  const restingFor = searchResting();
  if (restingFor) throw new Error(`the web search is resting after: ${restingFor}`);
  const url = `${BRAVE_URL}?${new URLSearchParams({ q, count: String(Math.min(20, Math.max(max, 10))), country: 'AU', search_lang: 'en' })}`;
  const t0 = Date.now();
  let res;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key }, signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    const why = String(e.message || e).split(key).join('[key]').slice(0, 120);
    console.log(`research search ${BRAVE_HOST} via brave ${Date.now() - t0}ms failed: ${why}`);
    throw new Error(`the Brave search could not be reached (${why})`);
  }
  const ms = Date.now() - t0;
  console.log(`research search ${BRAVE_HOST} via brave ${ms}ms`);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      const reason = `Brave Search answered ${res.status}: the key was refused`;
      restFor(REST_MS(), reason);
      throw new Error(reason);
    }
    if (res.status === 429) {
      const reason = 'Brave Search answered 429: rate limited';
      restFor(BRAVE_RATE_REST_MS, reason);
      throw new Error(reason);
    }
    throw new Error(`Brave Search answered ${res.status}`);
  }
  let body;
  try { body = await res.json(); } catch { throw new Error('Brave Search answered with something unreadable'); }
  const seen = new Set();
  const listed = [];
  for (const r of Array.isArray(body?.web?.results) ? body.web.results : []) {
    const u = /^https?:\/\//i.test(String(r?.url || '')) ? String(r.url) : null;
    if (!u) continue;
    const k = u.replace(/#.*$/, '').replace(/\/$/, '');
    if (seen.has(k)) continue;
    seen.add(k);
    listed.push({ title: textOf(r.title || '') || hostOf(u), url: u, snippet: textOf(r.description || '') });
  }
  if (!listed.length) throw new Error(`${BRAVE_HOST} showed no results for that`);
  const results = relevantResults(listed, q).slice(0, max);
  if (!results.length) {
    console.log(`research search ${BRAVE_HOST}: ${listed.length} result(s), none about "${q.slice(0, 80)}"`);
    throw new Error(`${BRAVE_HOST} showed ${listed.length} results, none of them about the question`);
  }
  return { results, ms, host: BRAVE_HOST, offTopic: listed.length - results.length };
}

const clipText = (text, maxChars) => {
  const t = String(text || '').trim();
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n[… cut at ${maxChars} characters]` : t;
};

/**
 * Read one page: { ok, url, title, text, via: 'fetch'|'chrome', ms, host }
 * or { ok: false, url, reason, via, ms, host }. Never throws: a refusal is a
 * result the answer must be able to state. `deps.fetchImpl` and
 * `deps.chromeRead` are the test seams.
 */
export async function readPage(url, { maxChars = 6000, timeoutMs = READ_TIMEOUT_MS, deps = {} } = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const chromeRead = deps.chromeRead || readWithBrowser;
  const canChrome = deps.chromeRead ? true : webCanRun();
  const host = hostOf(url);
  const t0 = Date.now();
  const done = (r) => {
    const ms = Date.now() - t0;
    console.log(`research read ${host || url} via ${r.via} ${ms}ms${r.ok ? '' : ` (${String(r.reason).slice(0, 80)})`}`);
    return { url, host, ms, ...r };
  };
  if (!/^https?:\/\//i.test(String(url || ''))) return done({ ok: false, via: 'fetch', reason: 'not a web address' });
  const tool = toolFor(url);
  // a video's ideas are in its transcript, which is the Watcher's job
  // (yt-dlp), not a page read: its watch page is a player and comments
  if (tool === 'transcript') return done({ ok: false, via: 'fetch', reason: 'a video: its transcript is read by the Watcher, not here' });

  const viaChrome = async (why) => {
    if (!canChrome) return done({ ok: false, via: 'chrome', reason: why ? `${why}, and Nova's browser is not available` : 'Nova\'s browser is not available' });
    const r = await chromeRead(url);
    if (!r?.ok) return done({ ok: false, via: 'chrome', reason: r?.reason || 'the browser could not read it' });
    if (String(r.text || '').length < 1500 && HUMAN_CHECK.test(`${r.title || ''}\n${r.text || ''}`)) return done({ ok: false, via: 'chrome', reason: 'the site asked for a human check' });
    return done({ ok: true, via: 'chrome', title: String(r.title || host), text: clipText(r.text, maxChars) });
  };
  if (tool === 'browser') return viaChrome(null);

  let why = null;
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const type = String(res.headers?.get?.('content-type') || '');
    // a site that refuses a reader (401, 403, 429) is taken at its word: it
    // is not retried in Chrome, which would be getting round its refusal
    if ([401, 403, 429].includes(res.status)) return done({ ok: false, via: 'fetch', reason: `the site refused the read (${res.status})` });
    if (!res.ok) why = `the page answered ${res.status}`;
    else if (type && !/html|text\/plain|xml/i.test(type)) return done({ ok: false, via: 'fetch', reason: `not a web page (${type.split(';')[0]})` });
    else {
      const html = (await res.text()).slice(0, MAX_HTML);
      // the head is metadata, not reading: its title would lead every page
      const text = readableText(html.replace(/<head\b[\s\S]*?<\/head>/i, ' '));
      const title = textOf((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') || host;
      if (text.length < 1500 && HUMAN_CHECK.test(`${title}\n${text}`)) return done({ ok: false, via: 'fetch', reason: 'the site asked for a human check' });
      if (text.length >= THIN_PAGE) return done({ ok: true, via: 'fetch', title, text: clipText(text, maxChars) });
      why = 'the fetched page had almost no readable words';
    }
  } catch (e) {
    why = `the fetch failed (${String(e.message).slice(0, 80)})`;
  }
  return viaChrome(why);
}

/** What he asked, as a search: his lead-in ("look up", "Nova, search for")
 *  taken off. Pure. */
export function searchQuery(question) {
  return String(question || '')
    .replace(/^\s*(?:hey |ok |okay )?nova[,:]?\s*/i, '')
    .replace(/^\s*(?:(?:can|could) you |please )*(?:look up|search (?:the web |online )?for|search|google|find out|look into)\s+/i, '')
    .replace(/\s+(?:for me|online|on the web|please)\s*\??\s*$/i, '')
    .trim() || String(question || '').trim();
}

/** The numbered pages as the model reads them. Each page gets an even share
 *  of the budget. Pure. */
export function sourcesBlock(sources, { budget = SOURCES_BUDGET } = {}) {
  if (!sources.length) return '';
  const each = Math.max(600, Math.floor(budget / sources.length));
  return sources.map((s) => `[${s.n}] ${s.title}\n${s.url}\n${clipText(s.text, each)}`).join('\n\n');
}

/** The prompt for the one summary call. Pure. */
export function summaryPrompt(question, sources) {
  return `QUESTION: ${String(question || '').trim()}

SOURCES (pages Nova's browser read just now; the only facts you may use):

${sourcesBlock(sources)}

RULES
- Answer only from the sources above. Never add a fact, number, name or date they do not contain.
- Cite every claim with its source number in square brackets, like [1] or [2][3]. Use only the numbers above.
- If the sources do not answer the question, say plainly "The sources I read do not answer that." and nothing else.
- Two to four sentences. Plain text, no markdown, no lists, no URLs.`;
}

// the forms "these pages do not say" takes; a turn that says so is not an answer
const NO_ANSWER = /\b(?:the )?sources? (?:i read |above )?(?:do(?:es)? not|don't|doesn't) (?:answer|say|mention|contain|cover|address)|\bnone of the sources\b|\b(?:i (?:can ?not|can't|could not|couldn't) (?:find|answer|determine))\b/i;

/** Every [n] in a text, as numbers. Pure. */
export const citedNumbers = (text) => [...String(text || '').matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));

/** Is a summary fit to be spoken as a sourced answer? null when it is, or the
 *  plain reason it is not. Pure. */
export function checkSummary(text, sources) {
  const t = String(text || '').trim();
  if (!t) return 'the model on this Mac returned an empty answer';
  if (NO_ANSWER.test(t.slice(0, 300))) return 'the pages it read do not answer it';
  const cited = citedNumbers(t);
  if (!cited.length) return 'it answered without citing the pages it read';
  const bad = [...new Set(cited.filter((n) => !sources.some((s) => s.n === n)))];
  if (bad.length) return `it cited a source it was never given ([${bad.join('], [')}])`;
  return null;
}

/** Search, then read the top pages (in parallel; Chrome reads queue
 *  themselves). Returns { sources, misses, hostsRead, timings, searchError }.
 *  Shared by researchLocally and Ask Nova's web_research tool. */
export async function gatherWeb(query, { max = 4, searchMax = 6, maxChars = 6000, deps = {} } = {}) {
  const search = deps.search || webSearch;
  const read = deps.read || readPage;
  const timings = { search: 0, reads: 0 };
  const hostsRead = [];
  let found;
  const ts = Date.now();
  try {
    found = await search(query, { max: searchMax });
  } catch (e) {
    // the engine was still asked (unless the search is resting): receipt it
    const why = String(e.message || e);
    if (!deps.search && !/resting|not installed|does not exist|test runner|nothing to search/.test(why)) hostsRead.push(braveKey() ? BRAVE_HOST : hostOf(searchUrl(query)));
    timings.search = Date.now() - ts;
    return { sources: [], misses: [], hostsRead, timings, searchError: why };
  }
  timings.search = found.ms || 0;
  if (found.host) hostsRead.push(found.host);
  const picks = found.results.filter((r) => toolFor(r.url) !== 'transcript').slice(0, max);
  const t0 = Date.now();
  const pages = await Promise.all(picks.map((r) => read(r.url, { maxChars })));
  timings.reads = Date.now() - t0;
  const sources = [];
  const misses = [];
  pages.forEach((p, i) => {
    if (p.host && !hostsRead.includes(p.host)) hostsRead.push(p.host);
    if (p.ok && String(p.text || '').trim()) {
      sources.push({ n: sources.length + 1, url: picks[i].url, title: p.title && p.title !== p.host ? p.title : picks[i].title, text: p.text, via: p.via });
    } else misses.push({ url: picks[i].url, reason: p.reason || 'nothing readable' });
  });
  return { sources, misses, hostsRead, timings, searchError: null };
}

/**
 * Answer a lookup from the web without Claude. Resolves
 *   { ok: true, text, sources: [{n,url,title}], pagesRead, hostsRead, ms, timings }
 * or { ok: false, reason, sources, pagesRead, hostsRead, ms, timings } —
 * never a guess. `deps.complete` (completeLocal's shape) is the test seam.
 */
export async function researchLocally(question, { max = 4, deps = {} } = {}) {
  const t0 = Date.now();
  const got = await gatherWeb(searchQuery(question), { max, deps });
  const listed = got.sources.map(({ n, url, title }) => ({ n, url, title }));
  const base = { sources: listed, pagesRead: got.sources.length, hostsRead: got.hostsRead, misses: got.misses };
  const fail = (reason) => ({ ok: false, reason, ...base, ms: Date.now() - t0, timings: { ...got.timings, summary: 0 } });
  if (got.searchError) return fail(`the web search failed: ${got.searchError}`);
  if (!got.sources.length) return fail('none of the pages it found could be read');
  const complete = deps.complete || (await import('./localModel.js')).completeLocal;
  const t1 = Date.now();
  let text;
  try {
    const out = await complete(summaryPrompt(question, got.sources), { maxTokens: 700, think: false, waitForBoot: true, timeoutMs: 120_000 });
    text = String(out?.text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } catch (e) {
    return { ...fail(`the model on this Mac could not summarise: ${String(e.message || e).slice(0, 160)}`), timings: { ...got.timings, summary: Date.now() - t1 } };
  }
  const summary = Date.now() - t1;
  const bad = checkSummary(text, got.sources);
  if (bad) return { ...fail(bad), timings: { ...got.timings, summary } };
  return { ok: true, text, ...base, ms: Date.now() - t0, timings: { ...got.timings, summary } };
}

/** The sources line(s) a reply carries: the cited pages, or every page read
 *  when none was cited. `short` (a spoken turn) names hosts, not URLs. Pure. */
export function sourcesLine(sources, { cited = [], short = false } = {}) {
  const use = cited.length ? sources.filter((s) => cited.includes(s.n)) : sources;
  if (!use.length) return '';
  if (short) return `Sources: ${use.map((s) => `[${s.n}] ${hostOf(s.url).replace(/^www\./, '')}`).join(', ')}`;
  return `Sources:\n${use.map((s) => `[${s.n}] ${s.url}`).join('\n')}`;
}

/** A reply with its sources attached by code: a cited number that was never
 *  a source is taken out, and any Sources lines the model wrote itself are
 *  replaced by code's, so a URL in the reply is always one a page was read
 *  from. Pure. */
export function withSources(reply, sources, { short = false } = {}) {
  let text = String(reply || '').trim();
  if (!sources?.length) return text;
  const known = new Set(sources.map((s) => s.n));
  text = text.replace(/\[(\d{1,2})\]/g, (m, n) => (known.has(Number(n)) ? m : '')).replace(/[ \t]+([.,;:])/g, '$1');
  text = text.replace(/\n*^\s*sources?:[\s\S]*$/im, '').trim();
  const line = sourcesLine(sources, { cited: [...new Set(citedNumbers(text))], short });
  return line ? `${text}\n\n${line}` : text;
}
