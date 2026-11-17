import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDateISO } from './localDate.js';
import { quoteFor } from './reviewQuote.js';
import { inReview, laneOf, leadable, ideaSentence, reviewPool } from './conceptReview.js';

// "THE LINE", THE HOME-SCREEN WIDGET (his ask, 17 Nov 2026, mockup 122): one
// real line a day from his own vault. The words are never written by a model:
// they are the quote the Daily Review already finds and checks word for word
// against the episode's transcript (lib/reviewQuote.js). This file only
// chooses which one, says whose show it was, and serves it read-only.
//
// It NEVER touches the review's state (surfaced, graded, drawn): it reads the
// same vault view and writes only its own two operational files.
//
// Honest by shape: every field is real or null. A line nobody can vouch for
// is not in the pool; no pool means `line: null` and the widget says so.

const dataDir = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DAYS_FILE = () => path.join(dataDir(), 'lineWidget.json');
const PHRASES_FILE = () => path.join(dataDir(), 'linePhrases.json');
const KEEP_DAYS = 120;
const MAX_QUOTE = 200;

/* ------------------------------ whose show ------------------------------ */

// The vault records only the CHANNEL a clip came from. Where he told us whose
// show a channel is, and what the show is really called, it is here; nothing
// else is inferred from a name.
export const SHOWS = [
  { channel: 'Chris Williamson', podcast: 'Modern Wisdom', host: 'Chris Williamson' },
  { channel: 'The Diary Of A CEO', podcast: 'The Diary Of A CEO', host: 'Steven Bartlett' },
];
const showEntry = (channel) => {
  const k = String(channel ?? '').trim().toLowerCase();
  return k ? SHOWS.find((s) => s.channel.toLowerCase() === k) || null : null;
};

const clean = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

// An account's display name often carries a tagline or a handle that is not
// part of anyone's name: "Nigel Daley | Personal Brand Leadership",
// "Health Coach Kayo (MA, INHC, CPT)", "Caitlin (livingwithcait)". The name
// is what stands before the bar or the trailing bracket; nothing is added.
const bareName = (v) => {
  const s = clean(v);
  if (!s) return null;
  return clean(s.split(/\s+[|·•]\s+/)[0].replace(/\s*\([^()]*\)\s*$/, '')) || s;
};

// { who, host, podcast, byLong, byShort } from the vault's channel and speaker.
export function attribute({ show, who } = {}) {
  const raw = clean(show);
  const entry = showEntry(raw) || showEntry(bareName(raw));
  const channel = entry ? raw : bareName(raw);
  const podcast = entry ? entry.podcast : channel;
  const host = entry ? entry.host : null;
  let speaker = bareName(who);
  if (speaker) {
    // an account handle or the channel's own name is not a person who spoke;
    // naming the account twice is noise
    if (speaker.startsWith('@') || /\bon Instagram\b/i.test(speaker)) speaker = null;
    else if (!entry && channel && speaker.toLowerCase() === channel.toLowerCase()) speaker = null;
  }
  // a host whose name is already in the show's name is not said twice
  const hostInName = !!host && !!podcast && podcast.toLowerCase().includes(host.toLowerCase());
  const owned = host && !hostInName ? `${host}’s ${podcast}` : podcast;
  let byLong = null;
  let byShort = null;
  // His wording (17 Nov): a show he named in the table is heard ON; a personal
  // account is a person, so a line is heard FROM them.
  if (speaker) {
    if (entry) {
      const guest = host && speaker.toLowerCase() !== host.toLowerCase();
      byLong = guest ? `on ${owned}` : `on ${podcast}`;
      byShort = `on ${podcast}`;
    } else if (podcast) {
      byLong = `, heard from ${podcast}`;
      byShort = byLong;
    }
  } else if (podcast) {
    byLong = entry ? `Heard on ${owned}` : `Heard from ${podcast}`;
    byShort = entry ? `Heard on ${podcast}` : byLong;
  }
  return { who: speaker, host, podcast, byLong, byShort };
}

/* ------------------------------- the pool ------------------------------- */

// The one idea sentence under a line: whole, or nothing. A cut-off or
// unpunctuated opener reads as a stump on a small widget.
export function sentenceFor(paragraph) {
  const s = ideaSentence(paragraph);
  if (!s || !/[.!?]["’”)]*$/.test(s) || s.split(/\s+/).length < 4) return null;
  return s;
}

// Concept pages in the review, mind lane, whose line is checked against the
// transcript and has a speaker or a show to be put to, short enough to read.
export function poolFrom(pages, ctx) {
  const out = [];
  for (const page of pages) {
    if (!inReview(page) || laneOf(page) !== 'mind') continue;
    const q = quoteFor(page, ctx);
    if (!q || !q.verified || !leadable(q) || q.text.length > MAX_QUOTE) continue;
    const by = attribute({ show: q.show, who: q.who });
    // a line that can be put to nobody and no show has no place on the card
    // (mockup 122 has no unattributed face); it stays in the review itself
    if (!by.who && !by.podcast) continue;
    out.push({
      id: page.id,
      quote: q.text,
      ...by,
      origin: null, // the vault cannot yet prove an original author for a quoted line
      at: q.at || null,
      idea: page.title,
      sent: sentenceFor(page.paragraphs?.[0]),
    });
  }
  return out;
}

/* --------------------------- the accent phrase --------------------------- */

const EDGE_RE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// CODE DECIDES what a model may say here: the phrase is accepted only when it
// is an exact, case-sensitive piece of the quote, 2 to 6 words, and well under
// the whole line. Returns the trimmed phrase or null.
export function acceptPhrase(quote, candidate) {
  if (typeof quote !== 'string' || typeof candidate !== 'string') return null;
  const p = candidate.trim().replace(EDGE_RE, '');
  if (!p) return null;
  const words = p.split(/\s+/).length;
  if (words < 2 || words > 6) return null;
  if (!quote.includes(p)) return null;
  if (p.length >= quote.length * 0.6) return null;
  return p;
}

const emFor = (quote, rec) => (rec && rec.quote === quote && typeof rec.em === 'string' && quote.includes(rec.em) ? rec.em : null);
const hasValidRecord = (quote, rec) => !!rec && rec.quote === quote;

/* ------------------------------ the day's pick ------------------------------ */

// A stable order that is not alphabetical: by a hash of the id.
const hashOf = (id) => createHash('sha1').update(String(id)).digest('hex');
const stableOrder = (pool) => [...pool].sort((a, b) => hashOf(a.id).localeCompare(hashOf(b.id)) || (a.id < b.id ? -1 : 1));

// The id for `date`, given what was shown on earlier days. Every line is shown
// once before any repeats; a new cycle never opens on yesterday's line.
function pickId(date, pool, earlier) {
  const inPool = new Set(pool.map((p) => p.id));
  let shown = new Set();
  for (const d of earlier) {
    if (!inPool.has(d.id)) continue;
    shown.add(d.id);
    if (pool.every((p) => shown.has(p.id))) shown = new Set();
  }
  const lastId = earlier.length ? earlier[earlier.length - 1].id : null;
  const order = stableOrder(pool);
  const fresh = order.filter((p) => !shown.has(p.id));
  return (fresh.find((p) => p.id !== lastId) || fresh[0] || order[0]).id;
}

function lineOf(item, phrases) {
  const { id, quote, who, host, podcast, origin, byLong, byShort, at, idea, sent } = item;
  return { id, quote, em: emFor(quote, phrases?.[id]), who, host, podcast, origin, byLong, byShort, at, idea, sent };
}

// Pure: { now, pool, days, phrases } -> { payload, days }. `days` in and out is
// the operational record [{ date, id }], oldest first, last 120 kept.
export function composeLine({ now = new Date(), pool = [], days = [], phrases = {} } = {}) {
  const date = localDateISO(now);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const valid = (Array.isArray(days) ? days : []).filter((d) => d && typeof d.date === 'string' && typeof d.id === 'string');
  const earlier = valid.filter((d) => d.date < date).sort((a, b) => a.date.localeCompare(b.date));
  const base = { at: now.toISOString(), date };
  if (!pool.length) return { payload: { ...base, line: null, previous: null }, days: valid };

  const kept = valid.find((d) => d.date === date);
  const id = kept && byId.has(kept.id) ? kept.id : pickId(date, pool, earlier);
  const nextDays = [...earlier, ...valid.filter((d) => d.date > date), { date, id }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-KEEP_DAYS);

  const prev = [...earlier].reverse().find((d) => byId.has(d.id));
  return {
    payload: {
      ...base,
      line: lineOf(byId.get(id), phrases),
      previous: prev ? { ...lineOf(byId.get(prev.id), phrases), date: prev.date } : null,
    },
    days: nextDays,
  };
}

/* ----------------------------------- disk ----------------------------------- */

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

export const readPhrases = async () => {
  const v = await readJson(PHRASES_FILE(), {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};

const PHRASE_PROMPT = (quote) => `Here is one line, spoken in a podcast:

"${quote}"

Reply with the 2 to 6 consecutive words of this line that carry its weight, copied exactly as written, and nothing else. No quotation marks, no explanation.`;

const defaultRunner = async (quote) => {
  const { runTextLane } = await import('./textLane.js');
  const out = await runTextLane('linePhrase', PHRASE_PROMPT(quote), { maxTokens: 40 });
  return out?.text ?? '';
};

const inFlight = new Set();
let phraseWrite = Promise.resolve();

// Ask once for a page's accent phrase and store what CODE accepts (or null,
// meaning "asked, none found"). Never throws: a failure stores nothing, so a
// later fetch may try again. One fill per id at a time.
export async function fillPhrase({ id, quote, runner = defaultRunner } = {}) {
  if (!id || !quote || inFlight.has(id)) return null;
  inFlight.add(id);
  try {
    const em = acceptPhrase(quote, await runner(quote));
    phraseWrite = phraseWrite.then(async () => {
      const all = await readPhrases();
      await writeJsonAtomic(PHRASES_FILE(), { ...all, [id]: { quote, em } });
    });
    await phraseWrite;
    return em;
  } catch (e) {
    phraseWrite = Promise.resolve();
    console.log(`lineWidget: accent phrase for ${id} not stored (${e?.message || e})`);
    return null;
  } finally {
    inFlight.delete(id);
  }
}

/* ---------------------------------- the build ---------------------------------- */

// Reads the vault view and the two files, composes, records today's pick, and
// (unless `fill` is false) starts a background fill for today's line when it
// has no record. The caller never waits on a model.
export async function buildLineWidget(vaultPath, vault, { now = new Date(), fill = true, runner = undefined } = {}) {
  const { pages, ctx } = await reviewPool(vaultPath, vault);
  const pool = poolFrom(pages, ctx);
  const stored = await readJson(DAYS_FILE(), { days: [] });
  const phrases = await readPhrases();
  const { payload, days } = composeLine({ now, pool, days: stored?.days, phrases });
  if (JSON.stringify(days) !== JSON.stringify(stored?.days || [])) {
    try { await writeJsonAtomic(DAYS_FILE(), { days }); } catch (e) { console.log(`lineWidget: record not saved (${e.message})`); }
  }
  const line = payload.line;
  if (fill && line && !hasValidRecord(line.quote, phrases[line.id])) {
    fillPhrase({ id: line.id, quote: line.quote, runner }).catch(() => {});
  }
  return payload;
}
