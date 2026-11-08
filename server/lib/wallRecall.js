// BRING BACK WHAT I SHOWED YOU (8 Nov 2026, his yes to "past reports by
// name across days"; Rose: "bring up that VR report you gave me earlier").
//
// The wall's history on the Mac is this session's forty cards, in memory.
// This is the durable half: every lookup that put cards on his screen is
// written here (server/data/voice/wall-history.json, NOVA_DATA_DIR-aware),
// with the cards exactly as the wall drew them, so "bring back the Busy Bar
// lookup from yesterday" puts the same nine references up again, on the Mac
// or the phone, with code's own line about it. The matching is words and
// days, never a model. Pure where it can be; the file is the only side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupPanels } from './visualStream.js';
import { briefCounts, briefCard } from '../../src/briefCounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
export const historyFile = () => path.join(dataRoot(), 'voice', 'wall-history.json');
export const KEEP = 200;
const SAME_WITHIN_MS = 15 * 60_000;
const TZ = process.env.NOVA_TZ || 'Australia/Melbourne';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'is', 'are', 'was', 'what', 'who', 'how', 'why', 'this', 'that', 'it', 'its', 'with', 'about', 'thing', 'one', 'me', 'you', 'we', 'they', 'from', 'by', 'up', 'back', 'lookup', 'search', 'report', 'references', 'pages', 'cards', 'results', 'stuff', 'brief', 'briefing', 'research', 'document', 'doc', 'yesterday', 'earlier', 'today', 'before']);
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' -]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w));

/** The local calendar day (YYYY-MM-DD) of a moment, in his time zone. */
export function localDay(at, tz = TZ) {
  const d = new Date(at);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const dayDiff = (aDay, bDay) => Math.round((Date.parse(`${bDay}T00:00:00Z`) - Date.parse(`${aDay}T00:00:00Z`)) / 86_400_000);

export function readHistory(file = historyFile()) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(j) ? j : []; } catch { return []; }
}
function writeHistory(entries, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, file);
}

/** The entry a finished lookup becomes; null when it put nothing up. Pure. */
export function entryFor(lookup, { now = Date.now() } = {}) {
  const cards = lookupPanels(lookup);
  const keys = Object.keys(cards);
  if (!keys.length) return null;
  const pages = keys.filter((k) => k.startsWith('lk:p')).length;
  const clips = keys.length - pages;
  return {
    id: `${new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date(now).toISOString(),
    query: String(lookup?.query || '').trim(),
    name: lookup?.name || null,
    depth: lookup?.depth || 'quick',
    counts: { pages, clips },
    cards,
  };
}

/** The entry a finished Researcher brief becomes (8 Nov 2026, his yes:
 *  "bring up that report from Tuesday"): one note card with the brief's
 *  title and first prose lines, code's counts, the Inbox record it lives in.
 *  Null when the brief has nothing to show. Pure. */
export function entryForBrief({ recordId = null, title = '', body = '', question = '' } = {}, { now = Date.now() } = {}) {
  const card = briefCard(title, body);
  if (!card) return null;
  const counts = briefCounts(body);
  return {
    id: `${new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date(now).toISOString(),
    kind: 'brief',
    query: String(question || title || '').trim(),
    name: String(title || '').trim() || null,
    recordId,
    counts,
    // the caption is the brief's title: the phone's mini card shows the caption,
    // and a brief is named by its title, never by its first sentence
    cards: { 'lk:b1': { ...card, kind: 'note', lookup: true, brief: true, recordId, caption: card.title, foot: [counts.sections ? `${counts.sections} section${counts.sections === 1 ? '' : 's'}` : null, counts.sources ? `${counts.sources} source${counts.sources === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || null } },
  };
}

/** Write a finished brief into the record; the same Inbox record replaces its earlier self. */
export function recordBrief(brief, { now = Date.now(), file = historyFile() } = {}) {
  const entry = entryForBrief(brief, { now });
  if (!entry) return null;
  const kept = readHistory(file).filter((e) => !(entry.recordId && e.recordId === entry.recordId));
  writeHistory([...kept, entry].slice(-KEEP), file);
  return entry;
}

/** Write a finished lookup into the record; the same query inside fifteen
 *  minutes replaces its earlier self; the record keeps the last KEEP. */
export function recordLookup(lookup, { now = Date.now(), file = historyFile() } = {}) {
  const entry = entryFor(lookup, { now });
  if (!entry) return null;
  const had = readHistory(file);
  const kept = had.filter((e) => !(e.query === entry.query && now - Date.parse(e.at) < SAME_WITHIN_MS));
  writeHistory([...kept, entry].slice(-KEEP), file);
  return entry;
}

// HIS WORDS FOR IT. A recall names a thing and carries either a time ("from
// yesterday", "earlier", "the other day") or the noun for what was shown
// ("that Busy Bar lookup", "the references on the Flipper"). "Bring up the
// chart" alone is the wall's own business (glassVoice bring), never this.
const LEAD = /^(?:(?:hey|hi|ok|okay)\s+)?nova[, ]*/i;
const POLITE = /^(?:(?:can|could|would|will) you\s+|please\s+|just\s+)+/i;
const VERB = /^(?:bring (?:me )?(?:up|back)|pull (?:up|back)|put (?:back )?up|show (?:me )?again|get (?:me )?back|recall|reopen|open (?:up|back)|show me|show)\s+/i;
const TIME = /\b(?:from |on |of )?(yesterday|earlier(?: today)?|before|this morning|this afternoon|last night|last week|the other day|today|a few days ago|(?:on )?(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b\s*[.?!]*$/i;
const NOUN = /\b(?:lookup|search|report|brief(?:ing)?|research|document|doc|references?|pages|cards|results|wall|stuff)\b/i;
const YOU = /\s*(?:that |which )?(?:you|we) (?:did|found|looked up|gave me|showed me|pulled up|had|put up|did for me)(?: for me)?\s*/i;
export function recallWanted(raw) {
  let q = String(raw || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().replace(LEAD, '').replace(POLITE, '').trim();
  const v = q.match(VERB);
  if (!v) return null;
  q = q.slice(v[0].length).trim().replace(/\s+again\s*[.?!]*$/i, '');
  let when = null;
  const t = q.match(TIME);
  if (t) { when = t[1].toLowerCase().replace(/^on /, ''); q = q.slice(0, t.index).trim(); }
  const hadNoun = NOUN.test(q);
  if (!when && !hadNoun) return null;
  let what = q.replace(YOU, ' ').replace(/^(?:that|the|those|my|your|our)\s+/i, '').replace(NOUN, ' ').replace(/\b(?:on|about|for)\s*$/i, '').replace(/\s+/g, ' ').trim()
    .replace(/^(?:what|everything|all|the stuff)\s+/i, '').replace(/^(?:on|about)\s+/i, '').replace(/^(?:the|that)\s+/i, '').trim().replace(/[.?!,]+$/, '');
  if (!what && !when) return null;
  return { what, when };
}

/** The best entry for his words, or null. `when` narrows by day. Pure. */
export function recall(entries, { what = '', when = null, now = Date.now(), tz = TZ } = {}) {
  const today = localDay(now, tz);
  const want = words(what);
  const inWindow = (e) => {
    if (!when) return true;
    const d = dayDiff(localDay(Date.parse(e.at), tz), today);
    if (/^yesterday$|^last night$/.test(when)) return d === 1;
    if (/^(?:today|this morning|this afternoon|earlier today)$/.test(when)) return d === 0;
    if (/^earlier$|^before$/.test(when)) return true;
    if (/^last week$/.test(when)) return d >= 1 && d <= 14;
    if (/^(?:the other day|a few days ago)$/.test(when)) return d >= 1 && d <= 7;
    const m = when.match(/^(mon|tues|wednes|thurs|fri|satur|sun)day$/);
    if (m) { const name = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long' }).format(new Date(e.at)).toLowerCase(); return name === `${m[1]}day` && d >= 0 && d <= 7; }
    return true;
  };
  let best = null;
  for (const e of entries) {
    if (!inWindow(e)) continue;
    const hay = new Set(words(`${e.query} ${e.name || ''} ${Object.values(e.cards || {}).map((c) => c.title || '').join(' ')}`));
    const hit = want.filter((w) => hay.has(w) || [...hay].some((h) => h.startsWith(w) || w.startsWith(h))).length;
    const score = want.length ? hit / want.length : (when ? 1 : 0);
    if (want.length && score < 0.5) continue;
    if (!best || score > best.score || (score === best.score && Date.parse(e.at) > Date.parse(best.e.at))) best = { e, score };
  }
  return best ? best.e : null;
}

/** How long ago, in his words. Pure. */
export function agoLine(at, { now = Date.now(), tz = TZ } = {}) {
  const d = dayDiff(localDay(Date.parse(at), tz), localDay(now, tz));
  if (d <= 0) return now - Date.parse(at) < 3 * 3_600_000 ? 'a little earlier' : 'earlier today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  return `${new Intl.DateTimeFormat('en-AU', { timeZone: tz, day: 'numeric', month: 'long' }).format(new Date(at))}`;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** What code says as the cards go back up. Pure. */
export function recallLine(entry, { now = Date.now(), tz = TZ } = {}) {
  if (entry.kind === 'brief') {
    const c = entry.counts || {};
    const bits = [c.sections ? plural(c.sections, 'section') : null, c.sources ? plural(c.sources, 'source') : null].filter(Boolean);
    const name = String(entry.name || 'research').replace(/^(?:the|a|an)\s+/i, '').replace(/\s+(?:evidence\s+)?(?:brief|briefing|report)$/i, (m) => (/evidence/i.test(m) ? ' evidence' : ''));
    return `Back up, sir: the ${name} brief from ${agoLine(entry.at, { now, tz })}${bits.length ? `, ${bits.join(', ')}` : ''}.`;
  }
  const n = Object.keys(entry.cards || {}).length;
  const what = (entry.name || entry.query || 'that').replace(/"/g, '').replace(/^(?:the|a|an)\s+/i, '');
  return `Back up, sir: the ${what} lookup from ${agoLine(entry.at, { now, tz })}, ${plural(n, 'reference')}.`;
}
export function nothingLine(what) {
  return what ? `I have nothing on ${what} from before, sir.` : 'I have nothing from before to bring back, sir.';
}

/** The briefs already in the Inbox as recall entries (read-only; nothing is
 *  written). A brief filed before the record existed, or one whose entry
 *  rolled off, still comes back by its title. Pure over the Inbox's records. */
export function briefEntriesFrom(records) {
  const out = [];
  for (const r of records || []) {
    if (r?.kind !== 'research' || !['pending', 'approved', 'filed', 'done'].includes(r.status)) continue;
    const p = r.decision?.payload;
    if (!p?.body) continue;
    const e = entryForBrief({ recordId: r.id, title: p.title || r.decision?.title || '', body: p.body, question: String(r.text || '').replace(/^Research:\s*/, '') }, { now: Date.parse(r.updatedAt || r.createdAt) || Date.now() });
    if (e) out.push(e);
  }
  return out;
}
