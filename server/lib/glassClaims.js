// THE HONESTY GATE ON THE GLASS (7 Nov 2026, design/ROSE-STUDY.md §5).
//
// Rose's wall carries figures ("81 endpoints"), quotes and entity cards
// ("FLIPPER DEVICES — founded 2020, HQ Lisbon") beside the pages they came
// from. Nova may now raise the same three kinds, on one condition that Rose
// does not visibly keep: EVERY ONE IS CHECKED AGAINST THE PAGE IT CITES.
// The model writes `"source": n`; code holds page n's text (lookupSprint.js)
// and looks for the claim in it. A figure whose number is not on the page,
// a quote whose words are not there, an entity fact the page does not
// carry: dropped, with the reason in the log. Never softened, never shown
// with a "maybe". The model names; the page proves. (NOVA-METHOD §2:
// models decide, code acts.)
//
// Pure. Shared by the server (visualResolve) and the tests. No model here.

const fold = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9%.$€£]+/g, ' ').trim();
const words = (s) => fold(s).split(' ').filter(Boolean);

/** The digits of a figure as the page would print them: "≈20m" → "20",
 *  "$199 USD" → "199", "63.77%" → "63.77", "1,000" → "1000". Pure. */
export function figureToken(value) {
  const m = String(value ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? m[0] : null;
}

/** Does the page print this number? A whole-token match, so "81" is not
 *  found inside "1810". A page's "1,000" counts for "1000". Pure. */
export function pageHasNumber(text, token) {
  if (!token) return false;
  const t = String(text ?? '').replace(/(\d),(\d{3})/g, '$1$2');
  const re = new RegExp(`(^|[^\\d.])${token.replace('.', '\\.')}(?![\\d])`);
  return re.test(t);
}

/** The longest run of the quote's words found in order, contiguously, in
 *  the page. Pure. */
export function longestRun(quoteWords, pageWords) {
  if (!quoteWords.length || !pageWords.length) return 0;
  const index = new Map();
  pageWords.forEach((w, i) => { if (!index.has(w)) index.set(w, []); index.get(w).push(i); });
  let best = 0;
  for (let qi = 0; qi < quoteWords.length; qi++) {
    for (const start of index.get(quoteWords[qi]) || []) {
      let n = 0;
      while (qi + n < quoteWords.length && start + n < pageWords.length && quoteWords[qi + n] === pageWords[start + n]) n++;
      if (n > best) best = n;
      if (best === quoteWords.length) return best;
    }
  }
  return best;
}

/** Is this quote on the page? Six words in a row, or seven in ten of its
 *  words for a short one. Pure. */
export function pageHasQuote(text, quote) {
  const q = words(quote);
  if (q.length < 3) return false;
  const run = longestRun(q, words(text));
  return run >= Math.min(6, q.length) || run / q.length >= 0.7;
}

/** Is this fact value on the page? A number by its digits; words by at
 *  least two in three of them (a year, a city, a product name). Pure. */
export function pageHasFact(text, value) {
  const tok = figureToken(value);
  if (tok && pageHasNumber(text, tok)) return true;
  const v = words(value).filter((w) => w.length > 1);
  if (!v.length) return false;
  const page = new Set(words(text));
  const hit = v.filter((w) => page.has(w)).length;
  return hit / v.length >= 2 / 3;
}

/** The page a claim cites, or null. `n` counts from one. Pure. */
export function sourceOf(lookup, n) {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1) return null;
  return (lookup?.sources || []).find((s) => s.n === k) || null;
}

/** The verdict on one claim panel against the pages code read. Pure.
 *  { ok: true, spec } with the proven fields, or { ok: false, why }. */
export function verifyClaim(spec, lookup) {
  const kind = spec?.kind;
  if (kind === 'page') {
    const s = sourceOf(lookup, spec.source);
    return s ? { ok: true, spec: { ...spec, title: s.title, url: s.url, host: s.host, image: s.image || null, lines: s.lines || [] } } : { ok: false, why: `no page ${spec.source} was read for this turn` };
  }
  if (kind === 'video') {
    const c = (lookup?.clips || [])[Number(spec.clip) - 1] || null;
    return c ? { ok: true, spec: { ...spec, title: c.title, channel: c.channel, videoId: c.id, url: c.url, poster: c.poster || null, portrait: !!c.portrait } } : { ok: false, why: `no clip ${spec.clip} was found for this turn` };
  }
  const s = sourceOf(lookup, spec?.source);
  if (!s) return { ok: false, why: spec?.source == null ? `a ${kind} with no source number` : `no page ${spec.source} was read for this turn` };
  const proven = { source: s.n, host: s.host, url: s.url, sourceTitle: s.title };
  if (kind === 'figure') {
    const tok = figureToken(spec.value);
    if (!tok) return { ok: false, why: `the figure "${spec.value}" holds no number` };
    if (!pageHasNumber(s.text, tok)) return { ok: false, why: `${s.host} does not print ${tok}` };
    return { ok: true, spec: { ...spec, ...proven } };
  }
  if (kind === 'quote') {
    if (!pageHasQuote(s.text, spec.text)) return { ok: false, why: `those words are not on ${s.host}` };
    return { ok: true, spec: { ...spec, ...proven } };
  }
  if (kind === 'entity') {
    const facts = (spec.facts || []).filter((f) => pageHasFact(s.text, f.value));
    const dropped = (spec.facts || []).length - facts.length;
    if (!facts.length) return { ok: false, why: `none of the ${spec.name} facts are on ${s.host}` };
    if (!pageHasFact(`${s.title} ${s.text}`, spec.name)) return { ok: false, why: `${s.host} does not name ${spec.name}` };
    return { ok: true, spec: { ...spec, facts, ...proven, ...(dropped ? { droppedFacts: dropped } : {}) } };
  }
  return { ok: false, why: `${kind} is not a claim` };
}

export const CLAIM_KINDS = new Set(['figure', 'quote', 'entity', 'page', 'video']);
