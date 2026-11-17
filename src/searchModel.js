// THE SEARCH SHEET'S VIEW MODEL (mockup 117), pure so it can be tested
// without a browser. It decides which FRAME of the mockup the sheet is in from
// what the server actually answered, and never fills a gap: a half that has not
// answered is "searching", a half that cannot answer says why, and a count or a
// time is only ever one the server reported.

export const RECENT_KEY = 'novaos.recentSearches';
const RECENT_MAX = 8;
export const RECENT_SHOWN = 4;
export const EXACT_CAP = 4;
export const MEANING_CAP = 2;
export const BEFORE_SHOW_ALL = 6;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function typeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (!t) return 'Note';
  if (t === 'raw') return 'Transcript';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// '2026-10-12' -> '12 Oct' (this year) or '12 Oct 2025'. An unreadable date is
// shown as nothing, never as today.
export function fmtDay(iso, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const day = Number(m[3]);
  const mon = MONTHS[Number(m[2]) - 1];
  if (!mon) return '';
  return Number(m[1]) === now.getFullYear() ? `${day} ${mon}` : `${day} ${mon} ${m[1]}`;
}

export const fmtSecs = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : '');

// a past search: the weekday inside the last six days, else the date
export function whenLabel(at, now = new Date()) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days < 7) return DAYS[d.getDay()];
  return fmtDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, now);
}

// split `line` at the server's [start, end) marks. Marks that do not fit the
// line (a stale or malformed answer) are dropped, so nothing is marked wrongly.
export function markedParts(line, marks) {
  const text = String(line || '');
  const ok = (Array.isArray(marks) ? marks : [])
    .filter((m) => Array.isArray(m) && Number.isInteger(m[0]) && Number.isInteger(m[1]) && m[0] >= 0 && m[1] <= text.length && m[0] < m[1])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let at = 0;
  for (const [a, b] of ok) {
    if (a < at) continue;
    if (a > at) out.push({ text: text.slice(at, a), mark: false });
    out.push({ text: text.slice(a, b), mark: true });
    at = b;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out.length ? out : [{ text, mark: false }];
}

export function readRecents() {
  try {
    const j = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return (Array.isArray(j) ? j : []).filter((r) => r && typeof r.q === 'string' && r.q).slice(0, RECENT_SHOWN);
  } catch { return []; }
}

// remember one search (his own words, newest first, no repeats)
export function writeRecent(text, now = Date.now()) {
  const q = String(text || '').trim();
  let list = [];
  try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  if (q.length >= 2) list = [{ q, at: now }, ...list.filter((r) => r && r.q && r.q.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode: the list simply is not kept */ }
  return list.filter((r) => r && r.q).slice(0, RECENT_SHOWN);
}

const MEANING_DOWN = {
  'no-index': 'The meaning index has not been built on the Mac yet.',
  'embedder-down': 'The meaning search is not running on the Mac.',
  error: 'The meaning search did not answer.',
};

const countOf = (n) => (Number.isFinite(n) ? `${n} note${n === 1 ? '' : 's'}` : null);
const join = (...bits) => bits.filter(Boolean).join(' · ');

// res: { q, total, words: {rows, ms}|null, meaning: {rows, ms, state}|null, error: {offline, message}|null, wordsAt, meaningAt }
export function buildFrame({ q, res, reachable, total = null, lastReached = null, showAll = false }) {
  const notes = countOf(res?.total ?? total);
  if (!reachable) return { kind: 'offline', meta: 'Not searched · the Mac is out of reach', lastReached, stale: false };
  if (q.length < 2) return { kind: 'recent', meta: join(notes, 'words and meaning'), stale: false };
  if (res?.error) {
    if (res.error.offline) return { kind: 'offline', meta: 'Not searched · the Mac is out of reach', lastReached, stale: false };
    return { kind: 'error', detail: res.error.message, meta: 'Not searched', stale: false };
  }
  if (!res || !res.words) return { kind: 'loading', meta: notes ? `Searching ${notes}` : 'Searching your notes', stale: false };

  const stale = res.q !== q;
  const words = res.words.rows;
  const more = !!res.words.more;
  const m = res.meaning;
  const meaningState = !m ? 'pending' : m.state === 'ok' ? 'ok' : 'down';
  const meaning = meaningState === 'ok' ? m.rows : [];
  const wordsShown = showAll ? words : words.slice(0, EXACT_CAP);
  const meaningShown = showAll ? meaning : meaning.slice(0, Math.max(0, Math.min(MEANING_CAP, BEFORE_SHOW_ALL - wordsShown.length)));
  const hidden = words.length + meaning.length - wordsShown.length - meaningShown.length;
  const w = fmtSecs(res.words.ms);
  let meta;
  if (stale) meta = notes ? `Searching ${notes}` : 'Searching your notes';
  else if (meaningState === 'pending') meta = join(notes, w && `words ${w}`, 'meaning searching');
  else if (meaningState === 'ok') meta = join(notes, w && `words ${w}`, fmtSecs(m.ms) && `meaning ${fmtSecs(m.ms)}`);
  else meta = join(notes, w && `words ${w}`, 'words only');
  return {
    kind: 'results', words, wordsShown, meaning, meaningShown, meaningState,
    meaningDownText: meaningState === 'down' ? (MEANING_DOWN[m.state] || MEANING_DOWN.error) : '',
    showAll: !showAll && hidden > 0 ? words.length + meaning.length : 0,
    plus: more ? '+' : '',
    freshWords: meaningState === 'pending',
    lateMeaning: meaningState === 'ok',
    meta, stale,
  };
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const markTexts = (row) => (row.marks || []).map(([a, b]) => String(row.line || '').slice(a, b)).filter(Boolean);

// The note's paragraphs for the page opened at the line: which one is lit, and
// the phrase marked inside it. The server says which paragraph (`para`); that is
// CHECKED against the text, and if it does not hold the line the paragraph is
// found by its words, and if none does nothing is lit (no guessing).
export function noteParas(paragraphs, row) {
  const ps = Array.isArray(paragraphs) ? paragraphs : [];
  const exact = Array.isArray(row.marks) && row.marks.length > 0;
  const texts = markTexts(row).map(norm);
  const holds = (p) => {
    const n = norm(p);
    if (exact) return texts.length > 0 && texts.every((t) => n.includes(t));
    const head = norm(String(row.line || '').replace(/…$/, '')).slice(0, 40);
    return head.length > 0 && n.startsWith(head);
  };
  let lit = -1;
  if (Number.isInteger(row.para) && ps[row.para] != null && holds(ps[row.para])) lit = row.para;
  if (lit < 0) lit = ps.findIndex((p) => holds(p));
  const re = exact && texts.length ? new RegExp(`(${[...new Set(markTexts(row))].sort((a, b) => b.length - a.length).map(escRe).join('|')})`, 'i') : null;
  return ps.map((p, i) => {
    if (i !== lit || !re) return { lit: i === lit, parts: [{ text: p, mark: false }] };
    return { lit: true, parts: p.split(re).filter((x) => x !== '').map((x) => ({ text: x, mark: re.test(x) && norm(x) !== '' && texts.includes(norm(x)) })) };
  });
}
