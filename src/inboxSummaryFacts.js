// THE SUMMARY INBOX'S FACTS (27 Sep 2026, design/mockups/60). Pure: every
// function here reads what it is handed and returns data, so each can be
// tested without a browser (server/test/inboxSummary.test.js). The view
// model (src/vals/valsInboxSummary.js) binds these to the app's own methods;
// the screen (src/screens/InboxSummary.jsx) only draws them.

import { fileableMembers } from './inboxDigest.js';

export const AUTO_SEEN_MS = 3000;

// A tile's tone, in words (its title) and as the hue its text wears: a hue
// only where the domain owns one (Train, Journal, Practice), red an error.
export const TONE_LABEL = { train: 'Train', journal: 'Journal', practice: 'Practice', vault: '', none: 'No route recorded', err: 'Error', new: 'Nova' };
export const TONE_HUE = { train: 'var(--nv-cy)', journal: 'var(--nv-vi)', practice: 'var(--nv-or)', err: 'var(--nv-warn)' };

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "TRAIN EDIT" → "Train edit": the view model hands labels up in caps for the
// Command style; every string on a summary surface is in sentence case.
export function sentenceCase(s) {
  const t = String(s || '').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

// FILED, BY DAY. Rows keep the order they arrive in (newest first); each row
// needs an `at` (ISO). Today, Yesterday, the weekday inside the last week,
// then the date. A row with no readable date goes under "Earlier", never
// under a day it did not happen on.
export function dayLabel(date, today = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return 'Earlier';
  const diff = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAY[d.getDay()];
  const sameYear = d.getFullYear() === today.getFullYear();
  return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

export function dayGroups(rows = [], today = new Date()) {
  const out = [];
  const byKey = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    const d = r.at ? new Date(r.at) : null;
    const ok = d && Number.isFinite(d.getTime());
    const key = ok ? dayKey(d) : 'earlier';
    let g = byKey.get(key);
    if (!g) {
      g = { key, label: ok ? dayLabel(d, today) : 'Earlier', rows: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
}

// HH:MM of a row, in his local time
export function clockLabel(iso) {
  const d = new Date(iso || '');
  return Number.isFinite(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

// THE SUBJECTS, as small cards: the digest's routine filings (one tap files
// them all) and each repeating subject. The "✓ all N" shows only where N > 0
// things can actually be answered in one tap. A subject made only of model
// choices is the one exception to fileableMembers: its one-tap answer is
// "keep the usual model" for each (the audit's finding 5, mockup 60's note),
// so its count is every member and `keep` says which answer it gives.
export function subjectCards(digest) {
  if (!digest) return [];
  const cards = [];
  const routine = Array.isArray(digest.routine) ? digest.routine : [];
  if (routine.length) {
    const fileable = fileableMembers(routine);
    cards.push({ key: 'routine', subject: null, name: 'Routine', count: routine.length, fileable: fileable.length, keep: false, members: routine, runnable: fileable });
  }
  for (const p of Array.isArray(digest.patterns) ? digest.patterns : []) {
    const members = Array.isArray(p.members) ? p.members : [];
    if (!members.length) continue;
    const allChoices = members.every((m) => m && m.isModelChoice);
    const runnable = allChoices ? members.filter((m) => typeof m.pickSonnet === 'function') : fileableMembers(members);
    cards.push({
      key: `s:${p.subject}`, subject: p.subject, name: sentenceCase(p.subject), count: members.length,
      fileable: runnable.length, keep: allChoices, members, runnable,
    });
  }
  return cards;
}

// The one line under the count: what the pile is, counted.
export function digestLine(digest, total) {
  if (!digest) return total === 1 ? 'one to decide' : total ? `${total} to decide` : '';
  const bits = [];
  if (digest.routine?.length) bits.push(`${digest.routine.length} routine`);
  const inPatterns = (digest.patterns || []).reduce((n, p) => n + (p.members?.length || 0), 0);
  if (inPatterns) bits.push(`${inPatterns} on ${digest.patterns.length === 1 ? 'one subject' : `${digest.patterns.length} subjects`}`);
  if (digest.decide?.length) bits.push(`${digest.decide.length} to decide`);
  return bits.join(' · ');
}

// ---------------------------------------------------------- Look deeper ---
// A research brief's parts, as the report sheet draws them: the body before
// "## Sources" as paragraphs, headings and list items (markdown's marks
// taken off), and each numbered source with its link. Same reading of the
// Sources block as the server's citation gate (researcher.js checkCitations).
const stripMarks = (s) => String(s || '')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')
  .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

export function sourcesOf(body = '') {
  const text = String(body || '');
  const at = text.search(/^\s*#{0,3}\s*sources\b/im);
  if (at < 0) return [];
  const out = [];
  for (const line of text.slice(at).split('\n')) {
    const m = line.match(/^\s*(?:[-*]\s*)?(?:\[(\d+)\]|(\d+)[.)])\s*(.*)$/);
    if (!m) continue;
    const rest = m[3] || '';
    const url = (rest.match(/https?:\/\/[^\s)>\]]+/i) || [null])[0];
    let host = '';
    try { host = url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
    const label = stripMarks(rest.replace(/https?:\/\/\S+/gi, '').replace(/[\s—–:,-]+$/, '').replace(/^[\s—–:,-]+/, '')) || host || `Source ${m[1] || m[2]}`;
    out.push({ n: Number(m[1] || m[2]), label, url, host });
  }
  return out;
}

export function reportParts(body = '') {
  const text = String(body || '').replace(/\r/g, '');
  const at = text.search(/^\s*#{0,3}\s*sources\b/im);
  const main = at >= 0 ? text.slice(0, at) : text;
  const blocks = [];
  for (const chunk of main.split(/\n{2,}/)) {
    let para = [];
    const flush = () => { if (para.length) { const t = stripMarks(para.join(' ')); if (t) blocks.push({ type: 'p', text: t }); para = []; } };
    for (const line of chunk.split('\n')) {
      const h = line.match(/^\s*#{1,6}\s+(.*)$/);
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (h) { flush(); const t = stripMarks(h[1]); if (t) blocks.push({ type: 'h', text: t }); } else if (li) { flush(); const t = stripMarks(li[1]); if (t) blocks.push({ type: 'li', text: t }); } else if (line.trim()) para.push(line.trim());
    }
    flush();
  }
  const lead = blocks.find((b) => b.type === 'p') || null;
  return { lead: lead ? lead.text : '', blocks, sources: sourcesOf(text) };
}

// The first sentence a person reads: no heading, no [1] markers.
export function firstSentence(body = '', max = 220) {
  const lead = reportParts(body).lead || '';
  const plain = lead.replace(/\s*\[\d+\](?:\[\d+\])*/g, '').trim();
  const m = plain.match(/^(.+?[.!?])(?:\s|$)/);
  const s = (m ? m[1] : plain).trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:—-]+$/, '')}…`;
}

// "40 s", "2 min 5 s", "12 min": the working line's clock
export function elapsedLabel(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m >= 10) return `${m} min`;
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

// "just now", "4 min ago", "2 h ago", then the date
export function agoLabel(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = new Date(t);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}

// What the Researcher is doing now, in words, from the progress it writes
// onto its own record (researcher.js publish → panelProgress).
export function deeperStage(panel) {
  if (!panel) return 'choosing who reads it';
  if (panel.repairing) return 'fixing a citation';
  if (panel.merging) return 'writing the report';
  if (panel.total) return `${panel.back || 0} of ${panel.total} researchers back`;
  return 'reading your sources';
}

// THE CARD'S LOOK DEEPER, from its children (records whose parentId is the
// card). The newest child speaks: running (with its real elapsed seconds,
// from the record's own start), ready (the report's first sentence and its
// sources), or error (the record's own reason). None otherwise; a report he
// discarded is not brought back.
export function deeperState(children = [], now = Date.now()) {
  const list = (Array.isArray(children) ? children : []).filter(Boolean)
    .slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const r = list[0];
  if (!r) return { state: 'none' };
  if (r.status === 'classifying') {
    const started = Date.parse(r.createdAt || '');
    return {
      state: 'running', id: r.id, startedAt: r.createdAt || null,
      seconds: Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null,
      stage: deeperStage(r.panel),
    };
  }
  if (r.status === 'error') return { state: 'error', id: r.id, error: r.error || 'The Researcher could not finish this one.' };
  const body = r.decision?.payload?.body;
  if (body && r.status !== 'discarded') {
    const parts = reportParts(body);
    return {
      state: 'ready', id: r.id, title: r.decision?.title || r.decision?.payload?.title || 'The report',
      sentence: firstSentence(body), sources: parts.sources.length, askedAt: r.createdAt || null, status: r.status,
    };
  }
  return { state: 'none' };
}

// SEEN, WITHOUT A BUTTON. A card that has been the top card for three
// seconds has been looked at; the view marks it once, and never again.
export function autoSeenDue(shownAt, now = Date.now(), ms = AUTO_SEEN_MS) {
  return Number.isFinite(shownAt) && Number.isFinite(now) && now - shownAt >= ms;
}

// ----------------------------------------------------------- the rail ---
// The batch as a rail that ticks (the Coach deck's): what he answered on this
// visit in green, the card in front of him lit, the rest waiting. Past 40 it
// is one bar, because 40 marks at 402px are already 3px each.
export function railMarks(done, waiting, cap = 40) {
  const d = Math.max(0, done | 0);
  const w = Math.max(0, waiting | 0);
  const total = d + w;
  if (!total) return { total: 0, marks: [], bar: null };
  if (total > cap) return { total, marks: [], bar: { done: d / total, on: w ? 1 / total : 0 } };
  const marks = [];
  for (let i = 0; i < d; i++) marks.push('done');
  for (let i = 0; i < w; i++) marks.push(i === 0 ? 'on' : 'wait');
  return { total, marks, bar: null };
}

// ------------------------------------------------------ record helpers ---
// A record the server just handed back, put into the list: replaced where it
// is, added at the top when new; the pending count follows the list.
export function upsertInboxRecord(inbox, record) {
  if (!inbox || !record || !record.id) return inbox;
  const items = Array.isArray(inbox.items) ? inbox.items : [];
  const i = items.findIndex((r) => r.id === record.id);
  const next = i >= 0 ? items.map((r) => (r.id === record.id ? record : r)) : [record, ...items];
  return { ...inbox, items: next, pendingCount: next.filter((r) => r.status === 'pending').length };
}

export function omitKey(obj, key) {
  if (!obj || !(key in obj)) return obj || {};
  const { [key]: _drop, ...rest } = obj;
  return rest;
}
