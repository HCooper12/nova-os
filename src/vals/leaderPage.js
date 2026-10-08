// THE LEADER PAGE'S WORDS AND SHAPES — pure helpers for Blend 1
// (design/mockups/82-redesign-leader-r2.html). Every count and every age is
// read from the record handed in; nothing here invents a value. Pinned by
// server/test/leaderPage.test.js.

import { daysWords } from '../leaderOrder.js';

const DAY = 86_400_000;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateWords = (d) => `${d.getDate()} ${MON[d.getMonth()]}`;
const toDate = (v) => (v instanceof Date ? v : new Date(v));
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// whole days since a stamp (the age on every item, as the model has always seen it)
export function ageDays(iso, now = new Date()) {
  if (!iso) return null;
  const t = toDate(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((toDate(now).getTime() - t) / DAY));
}
// calendar days between two moments, by his local midnight
export function calendarDays(iso, now = new Date()) {
  const t = toDate(iso);
  if (!Number.isFinite(t.getTime())) return null;
  return Math.round((midnight(toDate(now)) - midnight(t)) / DAY);
}

// "Monday 07:10": the clock in the Leader's head
export const clockLabel = (now = new Date()) => `${WEEKDAY[now.getDay()]} ${hhmm(now)}`;

// "since Friday" / "since yesterday" / "since 09:12" / "since 28 Sep"
export function sinceWords(iso, now = new Date()) {
  if (!iso) return null;
  const d = toDate(iso);
  const n = calendarDays(d, now);
  if (n == null) return null;
  if (n <= 0) return `since ${hhmm(d)}`;
  if (n === 1) return 'since yesterday';
  if (n < 7) return `since ${WEEKDAY[d.getDay()]}`;
  return `since ${dateWords(d)}`;
}

// THE SHORT NAME FOR A STRUGGLE. The mockup gives each one a short name
// ("Two leads, two versions"); nothing in the record holds one, and a model
// is never asked to invent it here. So the name is his own opening words:
// the first clause, up to six words, with an ellipsis when it was cut.
export function shortName(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const clause = (t.split(/[,.;:!?](?:\s|$)|\s[–—-]\s/)[0] || t).trim();
  const words = clause.split(' ');
  const cut = words.length > 6 || clause.length < t.length;
  let s = words.slice(0, 6).join(' ').replace(/[,.;:!?–—-]+$/, '');
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return cut ? `${s}…` : s;
}

const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
export const countWord = (n) => (n >= 0 && n < NUMW.length ? NUMW[n] : String(n));
export const countWordLower = (n) => (n >= 0 && n < NUMW.length ? NUMW[n].toLowerCase() : String(n));

// The honest line under the strip, in the Leader's own voice.
export function staleLine(days, lastAt) {
  if (days == null) return 'You have not told me anything yet.';
  if (days === 0) return 'You told me something today.';
  if (days === 1) return 'You last told me anything yesterday.';
  if (days < 7 && lastAt) return `You last told me anything on ${WEEKDAY[toDate(lastAt).getDay()]}, ${days} days ago.`;
  return `You last told me anything ${days} days ago.`;
}

// The sentence over the drawn picture, written by code from the same lists.
export function pictureSentence({ open, lastToldDays, downToday = 0 }) {
  const things = `${countWord(open)} thing${open === 1 ? '' : 's'} open`;
  if (!open) return downToday ? `Nothing open. You set ${countWordLower(downToday)} down today.` : 'Nothing open.';
  if (downToday) return `${things}. You set ${countWordLower(downToday)} down today.`;
  if (lastToldDays == null) return `${things}, and nothing from you yet.`;
  if (lastToldDays === 0) return `${things}. You told me something today.`;
  return `${things}, and nothing new from you for ${daysWords(lastToldDays)}.`;
}

// The Leader's reply as he reads it: the code-written hand-over line ("Asking
// the Researcher and the Librarian.") folds into the byline once the agents
// are back, VIS lines never show, the first sentence carries the news in the
// serif and the rest follows at 17.
export function readReply(text, { consult = null, clean = (t) => t } = {}) {
  let body = clean(String(text || '')).replace(/^\s*(REFLECT|CONSULT)\s*\{.*$/gm, '').trim();
  let hand = null;
  if (consult?.length) {
    const m = body.match(/^(Asking|Checking) [^\n]*?\.\s*(\n+|$)/);
    if (m) { hand = m[0].trim(); body = body.slice(m[0].length).trim(); }
  }
  const lm = body.match(/^[\s\S]*?[.!?](?=\s|$)/);
  const lead = lm && lm[0].length <= 220 ? lm[0].trim() : (body.split('\n')[0] || '').trim();
  const rest = body.slice(body.indexOf(lead) + lead.length).trim();
  return { hand, lead, rest };
}

const sameLine = (a, b) => String(a || '').trim() === String(b || '').trim();

// THE CONVERSATION, KEPT. The server's thread (newest last), this visit's
// lines not yet on it, and each morning's idea as the Leader's message that
// morning, in time order, with a sliver for each new day. `since` is the New
// conversation boundary (an ISO stamp, or null for all of it).
export function buildThread({ thread = [], chat = [], ideas = [], since = null, now = new Date() } = {}) {
  const sinceMs = since ? toDate(since).getTime() : -Infinity;
  const kept = thread.filter((x) => toDate(x.at).getTime() > sinceMs).map((x) => ({
    kind: x.who === 'you' ? 'me' : 'leader', id: x.id, at: toDate(x.at).getTime(), text: x.text, quote: x.quote || null, consult: x.consult || null, seenAt: x.seenAt ?? null, kept: true,
  }));
  const live = [];
  for (const m of chat) {
    if (m.who === 'system') { live.push({ kind: 'system', at: m.at || Date.now(), text: m.text }); continue; }
    const kind = m.who === 'you' ? 'me' : 'leader';
    if (!m.streaming && kept.some((k) => k.kind === kind && sameLine(k.text, m.text))) continue;
    live.push({ kind, at: m.at || Date.now(), text: m.text, quote: m.quote || null, consult: m.consult || null, streaming: !!m.streaming, live: true });
  }
  const idea = ideas
    .filter((d) => d && d.title)
    .map((d) => ({ kind: 'idea', at: d.createdAt ? toDate(d.createdAt).getTime() : toDate(`${d.date}T07:00:00`).getTime(), idea: d }))
    .filter((d) => d.at > sinceMs);
  const all = [...kept, ...live, ...idea].sort((a, b) => a.at - b.at);
  // the last day he spoke, for "the last time you talked"
  const mine = all.filter((x) => x.kind === 'me');
  const lastTalk = mine.length ? mine[mine.length - 1].at : null;
  const out = [];
  let day = null;
  for (const x of all) {
    const d = new Date(x.at);
    const key = midnight(d);
    if (key !== day) {
      day = key;
      const n = calendarDays(d, now);
      const label = n === 0 ? 'Today' : n === 1 ? 'Yesterday' : dateWords(d);
      const talked = lastTalk && midnight(new Date(lastTalk)) === key && n > 0;
      out.push({ kind: 'sliver', at: x.at, text: talked ? `${label} · the last time you talked` : label });
    }
    out.push(x);
  }
  return out;
}

// The kinds of daily idea, in his words for each
export const KIND_WORDS = { action: 'Try today', reminder: 'Remember', idea: 'Consider' };
