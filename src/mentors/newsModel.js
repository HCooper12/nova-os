// MENTORS NEWS, AS DATA (build slice 2; the approved mockup 125 A, "News").
// Pure: GET /api/mentors/news in, what the page draws out. Nothing here is
// invented: a count, a title or a state the server did not give is absent.
//
// The review card follows the mockup's rv* code line for line:
//   WAIT      the statuses still waiting for him (the count numeral)
//   order     answered items first (newest answer first), then the rest as
//             the server lists them (newest raised first)
//   next      the item that opens next: the first new or answered one, else
//             the first one being researched
//   rows      six standing up front (one open, the rest a row each), then
//             "Show all N"; a dismissed one keeps its place while its Undo is held

export const WAIT = ['new', 'research', 'answered'];
export const RV_UP = 6;
export const RV_UNDO_MS = 5000;
export const QT = [['true', 'Is it true?'], ['deeper', 'Go deeper'], ['use', 'Use it']];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "25 Nov", his own calendar (the device's local date). */
export function dayLabel(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
/** A YYYY-MM-DD date as the same "25 Nov" (no time zone shift: it is already his day). */
export function ymdLabel(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]}` : '';
}
/** A video's date on its card: the channel's own calendar day (UTC), as the register writes it. */
export function videoDay(iso, approx) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return approx ? `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** 1:09:58 or 38:00, from seconds (the player and the time marks). */
export function hms(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`;
}

/* ------------------------------- the review card ------------------------------ */

const answeredAt = (r) => r?.answer?.at || '';

/** Answered first, newest answer first; then the rest in the server's order. */
export function rvOrder(items) {
  const list = items || [];
  const ans = list.filter((r) => r.status === 'answered').sort((a, b) => (answeredAt(a) < answeredAt(b) ? 1 : answeredAt(a) > answeredAt(b) ? -1 : 0));
  return [...ans, ...list.filter((r) => r.status !== 'answered')];
}
export const rvCount = (items) => (items || []).filter((r) => WAIT.includes(r.status)).length;
export function rvNext(items) {
  const o = rvOrder(items);
  return (o.find((r) => r.status === 'new' || r.status === 'answered') || o.find((r) => r.status === 'research') || {}).rid || null;
}

/**
 * What the card shows. `undo` is the set of rids whose Undo is held; `all`
 * is "Show all" pressed; `hold` keeps the card while his last call's mark holds.
 * `null` when the card leaves the feed.
 */
export function rvView(items, { undo = new Set(), all = false, hold = false } = {}) {
  const order = rvOrder(items);
  const live = order.filter((r) => r.status !== 'dismissed');
  const waiting = live.some((r) => WAIT.includes(r.status));
  const held = order.some((r) => undo.has(r.rid));
  if (!waiting && !held && !hold) return null;
  const up = new Set((all ? live : live.slice(0, RV_UP)).map((r) => r.rid));
  const rows = order.filter((r) => up.has(r.rid) || (undo.has(r.rid) && r.status === 'dismissed'));
  return { rows, live: live.length, more: live.length > RV_UP, count: rvCount(items) };
}

/** The tabs drawn for an item: a tab whose question is null is not drawn. */
/** The question on a tab ("true" falls back to the weave's own question). */
export const qOf = (r, t) => r?.questions?.[t] || (t === 'true' ? r?.question || null : null);
export const tabsOf = (r) => QT.filter(([k]) => { const q = qOf(r, k); return typeof q === 'string' && !!q.trim(); });
/** Any question at all: no slip and no Research without one. */
export const hasQuestion = (r) => tabsOf(r).length > 0;

/** What he sends: his own words when he changed the text, else the tab's kind. */
export function askOf(r, tab, own) {
  const asked = qOf(r, tab) || '';
  const mine = typeof own === 'string' ? own.trim() : '';
  if (mine && mine !== asked.trim()) return { kind: 'own', question: mine };
  return { kind: tab, question: asked };
}

/**
 * The lines over an item's transcript: the idea in the read's own words. A
 * method is held by the weave as when to use it (a clause, not a sentence),
 * so it is shown with that label.
 */
export function noteOf(r) {
  const t = String(r?.text || '').trim();
  if (!t) return null;
  return r.kind === 'framework' ? `Use when: ${t}` : t;
}

/** Who said it, unless the weave could not tell. */
export const byOf = (r) => (r?.by && r.by !== 'unclear' ? r.by : '');

/* -------------------------------- the video tile ------------------------------- */

/**
 * The slot at the right of a big tile's foot: 'none' (not read, nothing
 * running, Brief me), 'trans' (transcribing), 'read' (reading), 'done'
 * (the brief is there), 'error' (the brief failed; Brief me again).
 */
export function slotOf(v) {
  if (!v) return 'none';
  if (v.working === 'transcript') return 'trans';
  if (v.working === 'reading') return 'read';
  if (v.brief) return 'done';
  if (v.briefError) return 'error';
  return 'none';
}
const READ = ['read', 'woven'];
export const FRESH_DAYS = 7;
/**
 * The full frame is for a video that is NEW or UNREAD: not read yet (found or
 * transcript), something running for it, a brief that failed, or published in
 * the last 7 days. Every other video (read or woven, older) is the compact
 * row, brief or not. `now` is passed in (ms), so the 7 days can be pinned.
 */
export function isBig(v, now = Date.now()) {
  if (!v) return false;
  if (!READ.includes(v.stage) || v.working || v.briefError) return true;
  const t = Date.parse(v.date || '');
  return Number.isFinite(t) && now - t <= FRESH_DAYS * 86_400_000;
}
/** The compact row's token: Read or Woven. */
export const cmpWord = (v) => (v?.stage === 'woven' ? 'Woven' : 'Read');
/** "$0.15", or nothing when the cost is not known. */
export const costLabel = (v) => (typeof v?.read?.costUsd === 'number' ? `$${v.read.costUsd.toFixed(2)}` : '');

/**
 * The feed under the review cards, newest first: each video (big or compact)
 * and each "What I learned" card, by its day. Only people he follows.
 */
export function feedOf(news, now = Date.now()) {
  if (!news) return [];
  const people = new Map((news.people || []).map((p) => [p.id, p]));
  const vids = (news.videos || []).filter((v) => people.has(v.personId))
    .map((v) => ({ kind: 'video', key: v.key, big: isBig(v, now), v, person: people.get(v.personId), at: v.date || '' }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  // a week's card sits under that person's newest video, as the mockup draws it
  // (its date is the week's last day, so sorting by it would lift it above the news)
  const out = [];
  const placed = new Set();
  const learned = new Map((news.learned || []).filter((l) => people.has(l.personId)).map((l) => [l.personId, l]));
  for (const f of vids) {
    out.push(f);
    const l = learned.get(f.v.personId);
    if (l && !placed.has(l.personId)) { placed.add(l.personId); out.push({ kind: 'learned', key: `learned:${l.personId}`, l, person: people.get(l.personId), at: f.at }); }
  }
  for (const l of learned.values()) if (!placed.has(l.personId)) out.push({ kind: 'learned', key: `learned:${l.personId}`, l, person: people.get(l.personId), at: '' });
  return out;
}

/** The review cards, one per person with anything raised, in the order the people are listed. */
export function reviewsOf(news) {
  if (!news) return [];
  const people = new Map((news.people || []).map((p) => [p.id, p]));
  return (news.raised || []).filter((g) => people.has(g.personId) && g.items?.length).map((g) => ({ person: people.get(g.personId), items: g.items }));
}

/** The way in, from the Library: the count waiting, the newest video's title. */
export function wayIn(news) {
  if (!news) return null;
  const n = (news.raised || []).reduce((a, g) => a + rvCount(g.items), 0);
  const ids = new Set((news.people || []).map((p) => p.id));
  const newest = (news.videos || []).filter((v) => ids.has(v.personId)).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))[0] || null;
  const person = newest ? (news.people || []).find((p) => p.id === newest.personId) || null : (news.people || [])[0] || null;
  return { n, title: newest?.title || '', person };
}

/** Anything moving, so the page polls on a short beat. */
export const moving = (news) => !!news && ((news.videos || []).some((v) => v.working) || (news.raised || []).some((g) => (g.items || []).some((r) => r.status === 'research')));

/** Items that just finished research, between two answers (to act the landing out). */
export function justAnswered(prev, next) {
  if (!prev || !next) return [];
  const was = new Map();
  for (const g of prev.raised || []) for (const r of g.items || []) was.set(`${g.personId}/${r.rid}`, r.status);
  const out = [];
  for (const g of next.raised || []) for (const r of g.items || []) if (r.status === 'answered' && was.get(`${g.personId}/${r.rid}`) === 'research') out.push(r.rid);
  return out;
}
