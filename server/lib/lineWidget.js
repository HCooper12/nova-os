import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDateISO } from './localDate.js';
import { quoteFor } from './reviewQuote.js';
import { inReview, laneOf, leadable, ideaSentence, reviewPool } from './conceptReview.js';
import { readHarvest, harvestPool, harvestSweep } from './lineHarvest.js';

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
const STANDS_FILE = () => path.join(dataDir(), 'lineStands.json');
const KEEP_DAYS = 120;
const MAX_QUOTE = 200;
// The longest quote the small widget is trusted to set whole at its smallest
// type step. Measured on 21 Nov 2026 by rendering the small widget (158 x 158
// pt) in all three looks: invented 60, 70 and 80 character quotes set whole;
// 95 fell back to the idea in two of three looks. 70 leaves a margin for wide
// words. Longer pool lines get a shorter stand-in on the small widget.
export const SMALL_MAX = 70;

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
export function attribute({ show, who, origin } = {}) {
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
    else if (!entry && channel) {
      // "Kayo" on "Health Coach Kayo" is the account itself, said once
      const ch = channel.toLowerCase().split(/\s+/);
      if (speaker.toLowerCase().split(/\s+/).every((w) => ch.includes(w))) speaker = null;
    }
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
  // A PASSED-ON LINE (his wording, 17 Nov): the name on the card is whose words
  // they are; then who he heard them from, and on which show.
  const author = bareName(origin);
  if (author) {
    const passer = speaker || host;
    if (entry) {
      byLong = passer ? `, heard from ${passer} on ${podcast}` : `, heard on ${podcast}`;
      byShort = `, heard on ${podcast}`;
    } else {
      const from = speaker || podcast;
      byLong = from ? `, heard from ${from}` : null;
      byShort = byLong;
    }
    return { who: author, host, podcast, origin: author, byLong, byShort };
  }
  return { who: speaker, host, podcast, origin: null, byLong, byShort };
}

/* ------------------------------- the pool ------------------------------- */

// The one idea sentence under a line: whole, or nothing. A cut-off or
// unpunctuated opener reads as a stump on a small widget.
export function sentenceFor(paragraph) {
  const s = ideaSentence(paragraph);
  if (!s || !/[.!?]["’”)]*$/.test(s) || s.split(/\s+/).length < 4) return null;
  return s;
}

// His named voices (18 Nov 2026): Modern Wisdom, The Diary Of A CEO (the SHOWS
// table) and the two people he named. Decided from the attribution alone.
const OWN_VOICES = /\b(alex hormozi|james clear)\b/i;
export const namedVoice = (by) => {
  if (!by) return false;
  const pod = String(by.podcast ?? '').toLowerCase();
  if (pod && SHOWS.some((s) => s.podcast.toLowerCase() === pod)) return true;
  return OWN_VOICES.test(`${by.who ?? ''} ${by.podcast ?? ''}`);
};

// Concept pages in the review, mind lane, whose line is checked against the
// transcript and has a speaker or a show to be put to, short enough to read.
export function poolFrom(pages, ctx) {
  const out = [];
  for (const page of pages) {
    if (!inReview(page) || laneOf(page) !== 'mind') continue;
    const q = quoteFor(page, ctx);
    if (!q || !q.verified || !leadable(q) || q.text.length > MAX_QUOTE) continue;
    const by = attribute({ show: q.show, who: q.who, origin: q.origin });
    // a line that can be put to nobody and no show has no place on the card
    // (mockup 122 has no unattributed face); it stays in the review itself
    if (!by.who && !by.podcast) continue;
    out.push({
      id: page.id,
      quote: unquoteMarks(q.text),
      ...by, // origin is set only for a line the transcript proves was passed on
      at: q.at || null,
      idea: page.title,
      sent: sentenceFor(page.paragraphs?.[0]),
      voice: namedVoice(by),
    });
  }
  return oncePerWording(out);
}

// A quote that ran over two lines of a markdown blockquote carries the next
// line's "> " inside it; nobody said that.
export const unquoteMarks = (text) => String(text).replace(/\s+>\s+/g, ' ');

// The same words on two pages are one line (the first page keeps it), or the
// widget would show it on two days.
export function oncePerWording(items) {
  const seen = new Set();
  return items.filter((p) => {
    const k = p.quote.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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

// A line's own identity: `key` when it has one (a harvested line shares its
// source page's `id`, which is what the app opens), else its `id`.
export const keyOf = (p) => p.key ?? p.id;

// A stable order that is not alphabetical: by a hash of the key.
const hashOf = (id) => createHash('sha1').update(String(id)).digest('hex');
const stableOrder = (pool) => [...pool].sort((a, b) => hashOf(keyOf(a)).localeCompare(hashOf(keyOf(b))) || (keyOf(a) < keyOf(b) ? -1 : 1));

// Two days in three lean on his named voices when any exist (his call, 18 Nov
// 2026). Deterministic: the day number, not chance.
export const prefersVoices = (date) => {
  const [y, m, d] = String(date).split('-').map(Number);
  const day = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
  return day % 3 !== 2;
};

// The key for `date`, given what was shown on earlier days. Every line is shown
// once before any repeats; a new cycle never opens on yesterday's line. On a
// "voices" day a fresh line by one of his named voices comes first.
function pickId(date, pool, earlier) {
  const inPool = new Set(pool.map(keyOf));
  let shown = new Set();
  for (const d of earlier) {
    if (!inPool.has(d.id)) continue;
    shown.add(d.id);
    if (pool.every((p) => shown.has(keyOf(p)))) shown = new Set();
  }
  const lastId = earlier.length ? earlier[earlier.length - 1].id : null;
  const order = stableOrder(pool);
  const fresh = order.filter((p) => !shown.has(keyOf(p)));
  const notLast = (list) => list.find((p) => keyOf(p) !== lastId);
  if (prefersVoices(date)) {
    const voices = fresh.filter((p) => p.voice);
    const v = notLast(voices) || voices[0];
    if (v) return keyOf(v);
  }
  return keyOf(notLast(fresh) || fresh[0] || order[0]);
}

// The small widget's stand-in on a day when the main line is too long for it:
// a quote of SMALL_MAX or fewer characters, never the main line. Kept for the
// day once chosen. Every short one is shown once before any repeats, never
// yesterday's short or yesterday's main line while another candidate exists.
// Same date-seeded order as the main pick. Returns a key or null.
function pickShortId(pool, mainKey, kept, earlier) {
  const small = pool.filter((p) => p.quote.length <= SMALL_MAX);
  const candidates = stableOrder(small.filter((p) => keyOf(p) !== mainKey));
  if (!candidates.length) return null;
  if (kept?.shortId && candidates.some((p) => keyOf(p) === kept.shortId)) return kept.shortId;
  const inSmall = new Set(small.map(keyOf));
  let shown = new Set();
  for (const d of earlier) {
    if (!d.shortId || !inSmall.has(d.shortId)) continue;
    shown.add(d.shortId);
    if (small.every((p) => shown.has(keyOf(p)))) shown = new Set();
  }
  const last = earlier.length ? earlier[earlier.length - 1] : null;
  const ok = (p) => keyOf(p) !== last?.shortId && keyOf(p) !== last?.id;
  const fresh = candidates.filter((p) => !shown.has(keyOf(p)));
  return keyOf(fresh.find(ok) || candidates.find(ok) || fresh[0] || candidates[0]);
}

function lineOf(item, phrases) {
  const { id, quote, who, host, podcast, origin, byLong, byShort, at, idea, sent } = item;
  return { id, quote, em: emFor(quote, phrases?.[keyOf(item)]), who, host, podcast, origin, byLong, byShort, at, idea, sent };
}

// Pure: { now, pool, days, phrases } -> { payload, days }. `days` in and out is
// the operational record [{ date, id, shortId? }], oldest first, last 120 kept.
export function composeLine({ now = new Date(), pool = [], days = [], phrases = {} } = {}) {
  const date = localDateISO(now);
  const byId = new Map(pool.map((p) => [keyOf(p), p]));
  const valid = (Array.isArray(days) ? days : []).filter((d) => d && typeof d.date === 'string' && typeof d.id === 'string');
  const earlier = valid.filter((d) => d.date < date).sort((a, b) => a.date.localeCompare(b.date));
  const base = { at: now.toISOString(), date };
  if (!pool.length) return { payload: { ...base, line: null, short: null, previous: null }, days: valid, key: null, shortKey: null };

  const kept = valid.find((d) => d.date === date);
  const id = kept && byId.has(kept.id) ? kept.id : pickId(date, pool, earlier);
  const shortId = byId.get(id).quote.length <= SMALL_MAX ? null : pickShortId(pool, id, kept, earlier);
  const nextDays = [...earlier, ...valid.filter((d) => d.date > date), shortId ? { date, id, shortId } : { date, id }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-KEEP_DAYS);

  const prev = [...earlier].reverse().find((d) => byId.has(d.id));
  return {
    payload: {
      ...base,
      line: lineOf(byId.get(id), phrases),
      short: shortId ? lineOf(byId.get(shortId), phrases) : null,
      previous: prev ? { ...lineOf(byId.get(prev.id), phrases), date: prev.date } : null,
    },
    days: nextDays,
    shortKey: shortId, // the small widget's stand-in, same kind of key
    key: id, // the picked line's own key (a harvested line shares its page's `id`)
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

/* ------------------------- does it stand on its own ------------------------- */

// HIS REPORT, 17 Nov 2026, looking at the first line on his phone ("A home, a
// style, a set of interests and a way of speaking that feels like its own
// universe"): "doesn't feel like the vibe of what I want". The review's quote
// is whatever the page marked, and many are a piece of a sentence or of a
// story. On a card with nothing around it, only a whole thought reads as a
// line. A model answers one question per line, once; code accepts YES or NO
// and nothing else. A line not yet asked about stays in, so with the lane off
// the widget behaves as it did before.

const STANDS_PROMPT = (quote) => `You sort lines for a daily quote card. Each line was spoken in a podcast or a video. The card shows the line alone, in large type, with the speaker's name under it.

YES means: a reader who never heard the source gets a whole idea from it. It states a principle, a claim about people or life, an instruction, or a question worth asking yourself. Capital letters and a full stop do not matter. Blunt or informal wording is fine.
Examples of YES:
- You do not rise to the level of your goals. You fall to the level of your systems.
- what would this look like if it were easy?
- Discipline is choosing what you want most over what you want now

NO means: read alone, it is not an idea yet. It is a piece of a sentence, a description with no claim, a moment from a story, or a script of what someone might say out loud.
Examples of NO:
- the kind of person who shows up early
- which is why it usually falls apart
- And then he told me to come back on Monday.
- Hi, I'm Sam, and I help busy parents get fit.

The line:
"${quote}"

Reply with the single word YES or NO.`;

export function acceptVerdict(raw) {
  const t = String(raw ?? '').trim().replace(EDGE_RE, '').toUpperCase();
  return t === 'YES' ? true : t === 'NO' ? false : null;
}

export const readStands = async () => {
  const v = await readJson(STANDS_FILE(), {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};

// Only a NO recorded against these exact words takes a line out.
export const standing = (pool, stands) => pool.filter((p) => {
  const rec = stands?.[keyOf(p)];
  return !(rec && rec.quote === p.quote && rec.stands === false);
});

const defaultJudge = async (quote) => {
  const { runTextLane } = await import('./textLane.js');
  const out = await runTextLane('lineStands', STANDS_PROMPT(quote), { maxTokens: 8 });
  return out?.text ?? '';
};

let sweep = null;

// One line at a time, in the order given, each asked once per wording (an
// unreadable answer is stored as null: the line stays and is not asked again).
// A runner that throws ends this pass; the next fetch starts another. Never
// throws. One pass at a time.
export function judgePool(pool, { runner = defaultJudge } = {}) {
  if (sweep) return sweep;
  sweep = (async () => {
    try {
      for (const p of pool) {
        const rec = (await readStands())[keyOf(p)];
        if (hasValidRecord(p.quote, rec)) continue;
        const stands = acceptVerdict(await runner(p.quote));
        await writeJsonAtomic(STANDS_FILE(), { ...(await readStands()), [keyOf(p)]: { quote: p.quote, stands } });
      }
    } catch (e) {
      console.log(`lineWidget: stand-alone check stopped (${e?.message || e})`);
    } finally { sweep = null; }
  })();
  return sweep;
}

/* ---------------------------------- the build ---------------------------------- */

// Reads the vault view and the two files, composes, records today's pick, and
// (unless `fill` is false) starts a background fill for today's line when it
// has no record. The caller never waits on a model.
export async function buildLineWidget(vaultPath, vault, { now = new Date(), fill = true, runner = undefined, judge = undefined, harvest = undefined } = {}) {
  const { pages, ctx } = await reviewPool(vaultPath, vault);
  // his own concept-page lines first, then lines harvested from word-for-word
  // sources (the same wording is one line, the first keeps it)
  const own = poolFrom(pages, ctx);
  const every = oncePerWording([...own, ...harvestPool(await readHarvest())]);
  const pool = standing(every, await readStands());
  const stored = await readJson(DAYS_FILE(), { days: [] });
  const phrases = await readPhrases();
  const { payload, days, key, shortKey } = composeLine({ now, pool, days: stored?.days, phrases });
  if (JSON.stringify(days) !== JSON.stringify(stored?.days || [])) {
    try { await writeJsonAtomic(DAYS_FILE(), { days }); } catch (e) { console.log(`lineWidget: record not saved (${e.message})`); }
  }
  const line = payload.line;
  if (fill && line && !hasValidRecord(line.quote, phrases[key])) {
    fillPhrase({ id: key, quote: line.quote, runner }).catch(() => {});
  }
  const short = payload.short;
  if (fill && short && !hasValidRecord(short.quote, phrases[shortKey])) {
    fillPhrase({ id: shortKey, quote: short.quote, runner }).catch(() => {});
  }
  // today's line is asked about first, so a NO replaces it on the next fetch
  const judgeAll = (items) => judgePool([...items].sort((a, b) => (keyOf(b) === key) - (keyOf(a) === key)), judge ? { runner: judge } : {});
  if (fill) {
    judgeAll(every);
    // the harvest runs in the background, never inside this call; what it adds
    // is then put through the same stands-alone check
    if (harvest !== false) {
      harvestSweep({ pages, ctx, shows: SHOWS, ...(harvest?.runner ? { runner: harvest.runner } : {}) })
        .then(async () => judgeAll(oncePerWording([...own, ...harvestPool(await readHarvest())])))
        .catch(() => {});
    }
  }
  return payload;
}
