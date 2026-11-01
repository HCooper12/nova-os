// ONE NOVA ON THE MAC, THE PURE FACTS (1 Nov 2026) — design/mockups/
// 108-one-nova-mac.html, approved with his words: "The Mac mockup looks good.
// Just ensure the jade colour for speaking and that the build matches your
// mockup identically with every function. I also want to be able to interact
// with the panel displays after/during conversation."
//
// The page is src/NovaMac.jsx (drawn by src/screens/NovaThread.jsx at desktop
// width only; the phone keeps src/NovaStage.jsx, mockup 106 A). Every number
// here is the mockup's own, read from its CSS and script, in its window's
// coordinates less the 28 px title bar the Mac draws itself (the mockup draws
// a window; the build is the page inside one). Tested in
// server/test/novaMac.test.js.

import { STAGE_SCALE } from './novaStageFacts.js';
import { consultNodes } from './motion/consultFlowFacts.js';
import { FINDERS, finderWords } from './glassMarks.js';
import { sentenceCase } from './novaThreadFacts.js';
import { MUSCLE_TOKEN } from './muscleHue.js';
import { DATA_KINDS } from './glassMarks.js';

// the mockup's title bar: every y below is its y less this
export const TITLE_BAR = 28;
// the capsule rail's room (12 px gutter + 60 px rail + 12 px) and the drawer
export const RAIL_ROOM = 84;
export const DRAWER_W = 400;
// the composer (mockup .composer): 680 x 64, 22 px off the foot
export const COMPOSER = { w: 680, h: 64, foot: 22 };
// the running glass's column: 60 px off the right edge, 508 px wide, the
// middle panel 64 px further in (the mockup's arc), from 36 px down
export const COLUMN = { right: 60, width: 508, inset: 64, top: 64 - TITLE_BAR, gap: 18 };
// the open panel (mockup PANEL_AT): 568 wide from 812, 36 px down
export const OPEN_PANEL = { right: 60, width: 568, top: 64 - TITLE_BAR };

// WHERE THE CORE SITS in each state (mockup frameFor): its centre, the
// window's scale on it, the width of the words under it, where the composer
// centres, and how far under the core's centre the state word sits.
//   docked: panels are on the glass (an answer's, or one he pinned)
//   hist:   the history drawer is open
//   focus:  Nova holds the stage (the rail has receded)
export function frameFor({ state, docked = false, hist = false, focus = false, width = 1440 }) {
  const L = focus ? 0 : RAIL_ROOM;
  const R = hist ? width - DRAWER_W : width;
  if (docked && !hist) {
    // the core keeps to the left of the column (470 of 1440)
    const cx = Math.round((width - COLUMN.width - COLUMN.right) / 2 + 34);
    return { cx, cy: 268 - TITLE_BAR, s: 0.8, uw: 600, mx: width / 2, off: 165 };
  }
  const cx = (L + R) / 2;
  if (state === 'listen' || state === 'speak') return { cx, cy: 290 - TITLE_BAR, s: 1, uw: 820, mx: cx, off: 196 };
  return { cx, cy: (hist ? 300 : 306) - TITLE_BAR, s: hist ? 0.86 : 1, uw: hist ? 720 : 820, mx: cx, off: 165 };
}

// THE CORE'S SIZE ON THE MAC. The phone's STAGE_SCALE makes the real core's
// visible body the mockup 106 core's size, whose canvas is 300 px drawn at
// 0.84; mockup 108 draws the same core on a 420 px canvas at 1. So the Mac's
// is the phone's times 420 / (300 x 0.84), times the window's scale above.
export const MAC_CORE_RATIO = 420 / (300 * 0.84);
// Measured frame against frame at 1440 (1 Nov): listening, the real core's
// sphere stood a fifth larger than mockup 108's, so the Mac trims it there.
export const MAC_TUNE = { listening: 0.82 };
export function macCoreScale(key, frameScale = 1) {
  return (STAGE_SCALE[key] || STAGE_SCALE.rest) * MAC_CORE_RATIO * (MAC_TUNE[key] || 1) * frameScale;
}

// the stage's state in the mockup's words (data-state)
export function macState(key) {
  return key === 'listening' ? 'listen' : key === 'thinking' ? 'think' : key === 'speaking' ? 'speak' : 'idle';
}

// ------------------------------------------------- thinking: who is asked --

// THE SATELLITES' SLOTS around the core (mockup SATPOS), in order of asking:
// up-left, right, down-left, then down-right for a fourth. While a panel is
// pinned on the right, the right-hand slot goes up and over the core.
export const SAT_SLOTS = [[-420, -150], [230, -60], [-430, 80], [230, 120]];
export const SAT_SLOTS_DOCKED = [[-420, -150], [130, -236], [-430, 80], [-200, 250]];

const secs = (ms) => (Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 1000)) : null);
const short = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};

// The agents Nova is really asking this turn, from the roster the server
// keeps on the job (lib/consult.js, one entry per ask: asking → done |
// failed), in their own hues (glassMarks.FINDERS). Each status line is
// code's words from that entry: what was asked while it is out, how long the
// answer took once it is back, or that it could not answer. No roster, no
// satellites: nothing is ever drawn on a timer.
export function satellitesOf(roster) {
  const nodes = consultNodes(roster);
  if (!nodes.length) return [];
  const raw = new Map();
  for (const a of roster || []) if (a?.agent) raw.set(a.agent, a);
  return nodes.map((n, i) => {
    const a = raw.get(n.agent) || {};
    const line = n.state === 'asking'
      ? (n.code ? `Checking ${n.label}` : a.question ? short(a.question, 44) : `Asking ${n.label}`)
      : n.state === 'done'
        ? (n.code ? 'Checked' : secs(a.ms) ? `Answered in ${secs(a.ms)} s` : 'Answered')
        : 'Could not answer';
    return { agent: n.agent, name: n.name, label: n.label, hue: FINDERS[n.agent]?.hue || 'var(--nv-nova)', state: n.state, line, slot: i };
  });
}

// The words beside "Thinking": who is out right now, as the mockup's
// "· Asking the Coach." (the first still asking); none once all are back.
export function thinkingLine(sats) {
  const out = (sats || []).find((s) => s.state === 'asking');
  if (!out) return '';
  return CODE_READ.has(out.agent) ? `Checking ${out.label}.` : `Asking ${out.label}.`;
}
const CODE_READ = new Set(['calendar', 'cfo', 'stash']);

// ---------------------------------------------- the running glass, docked --

// One panel per thing shown: a data panel and its lights are ONE panel (the
// lit one stands for it while it is said), a relight keeps its slot.
export function panelKey(card) {
  if (!card) return '';
  if (card.macKind) return card.key;
  return card.hostKey || `${card.kind}:${String(card.label || card.title || card.caption || '').slice(0, 60)}`;
}

// The newest three, in the order they arrived (the mockup's three slots;
// an older one leaves the glass, it stays on the line in the history).
export const MAX_DOCKED = 3;
export function dockOrder(cards) {
  const by = new Map();
  for (const c of cards || []) {
    if (!c) continue;
    const k = panelKey(c);
    if (by.has(k)) by.delete(k);
    by.set(k, c);
  }
  // a host keeps its first arrival's place, its newest light's face
  const firstAt = new Map();
  (cards || []).forEach((c, i) => { if (c && !firstAt.has(panelKey(c))) firstAt.set(panelKey(c), i); });
  return [...by.entries()].sort((a, b) => firstAt.get(a[0]) - firstAt.get(b[0])).slice(-MAX_DOCKED).map(([key, card]) => ({ key, card }));
}

// The panels while he is spoken to: the ones already said (the rail, newest
// first) and the one being said now.
export function liveDock(stage) {
  if (!stage?.hero) return { panels: [], lit: '' };
  const panels = dockOrder([...(stage.rail || []).slice().reverse(), stage.hero]);
  return { panels, lit: panelKey(stage.hero) };
}

// WHERE A PANEL CAME FROM, by its kind (the coordinator's point 6): a panel
// code built carries its own head; a data panel the server built from his
// records names its finder (its `by`, set by the server); every other panel
// the model raised is Nova's own.
export function panelHead(card) {
  if (card?.head) return { ...card.head, title: card.title || '' };
  const data = DATA_KINDS.has(card?.kind);
  const by = data ? String(card?.by || '').toLowerCase() : '';
  const f = by && FINDERS[by] && by !== 'nova' ? FINDERS[by] : null;
  return {
    words: data && card?.finder ? card.finder : f ? finderWords(f.key) : 'Nova’s own',
    sub: '',
    hue: data && card?.hue ? card.hue : f?.hue || 'var(--nv-nova)',
    title: sentenceCase(card?.label || card?.title || ''),
  };
}

// The stack's arc: each panel's right offset (the middle one sits 64 px in)
export function columnInset(i, n) {
  return n === 3 && i === 1 ? COLUMN.inset : 0;
}

// ---------------------------------- the panels CODE builds from his data --
//
// The coordinator's correction (1 Nov 2026): mockup 108's three panels are a
// contract wherever the data behind them exists, and it does. So when an
// answer is about his sets or a muscle, about a Researcher brief, or
// proposes a time, the panel is built here, by code, from his own records:
// the week (server/lib/muscleWeek.js, the overview Train draws), the brief's
// Inbox record, his calendar and the proposal's record. Never a model's
// numbers. Each carries `head` (where it came from, in the mockup's words)
// and `sentence`, the index of the sentence of the answer that names it, so
// it rises while that sentence is said.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const half = (n) => {
  const v = Math.round((Number(n) || 0) * 2) / 2;
  const w = Math.trunc(v);
  return v === w ? String(w) : w === 0 ? '½' : `${w}½`;
};
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The answer as sentences (the speech clock's grain: . ! ? then space). */
export function sentencesOf(text) {
  return String(text || '').replace(/\[\[artifact:[^\]]*\]\]/gi, ' ').replace(/\s+/g, ' ').trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'(])/).map((s) => s.trim()).filter(Boolean);
}
const firstIdx = (sents, re) => sents.findIndex((s) => (typeof re === 'function' ? re(s) : re.test(s)));

// a muscle named in words: "side delts", "side delt", "lats", "calves"…
function muscleRe(name) {
  const n = String(name).toLowerCase();
  if (n === 'calves') return /\bcal(f|ves)\b/i;
  const stem = n.replace(/s$/, '').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${stem}s?\\b`, 'i');
}
// a model panel saying what a code panel already shows is left off the
// glass: the code's figures stand, never a model's copy of them
export function coveredByCode(card, code) {
  const label = `${card?.label || ''} ${card?.title || ''}`;
  return (code || []).some((c) => (c.macKind === 'sets' && /\b(sets?|volume)\b/i.test(label))
    || (c.macKind === 'brief' && /\b(brief|research)\b/i.test(label))
    || (c.macKind === 'calendar' && /\b(calendar|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(label)));
}
const SETS_RE = /\b(hard\s+sets?|weekly\s+sets?|sets?\s+(this|a|per)\s+week|volume|sets\b)/i;
const WEEK_JUDGE_RE = /\b(short(est)?|behind|lagging|on\s+track|ahead|reached|minimum|target|by\s+sunday|this\s+week)\b/i;

/** THE SETS PANEL: the week per muscle, from the overview. Null when the
 *  answer is not about his sets or a muscle, or the week has not loaded. */
export function setsPanel({ question = '', answer = '', week = null }) {
  const muscles = week?.muscles || [];
  if (!muscles.length) return null;
  const sents = sentencesOf(answer);
  // the panel answers the SUBJECT, never a passing mention ("lats first" is
  // not about his week): the question names sets or a muscle, or one answer
  // sentence judges a muscle's week (a muscle with sets or a shortfall)
  const judged = (x) => SETS_RE.test(x) || WEEK_JUDGE_RE.test(x);
  const named = muscles.filter((m) => muscleRe(m.muscle).test(question)
    || sents.some((x) => muscleRe(m.muscle).test(x) && judged(x)));
  const aboutSets = SETS_RE.test(question);
  if (!named.length && !aboutSets) return null;
  const stateOf = (m) => (m.done >= m.low ? 'reached' : m.bySunday >= m.low ? 'onway' : 'short');
  const rank = { short: 0, onway: 1, reached: 2 };
  const goal = muscles.filter((m) => m.goal);
  const shown = [...(goal.length ? goal : muscles.slice(0, 5))];
  for (const m of named) if (!shown.includes(m)) shown.push(m);
  const key = [...named].sort((a, b) => rank[stateOf(a)] - rank[stateOf(b)])[0]
    || goal.find((m) => stateOf(m) === 'short') || null;
  // the mockup's five rows, the key muscle always among them
  const rows = shown.slice(0, 5);
  if (key && !rows.includes(key)) rows[rows.length - 1] = key;
  const scale = Math.max(1, ...rows.map((m) => Math.max(m.low, m.done, m.bySunday))) * 1.12;
  const pct = (v) => Math.round(Math.max(0, Math.min(100, (v / scale) * 100)) * 10) / 10;
  const row = (m) => ({
    muscle: m.muscle, hue: `var(${muscleTokenOf(m.muscle)})`, key: !!key && m.muscle === key.muscle, state: stateOf(m),
    done: half(m.done), doneN: m.done, planned: half(Math.max(0, m.bySunday - m.done)), target: m.low, bySunday: half(m.bySunday),
    bar: pct(m.done), plan: { left: pct(m.done), width: Math.max(0, pct(m.bySunday) - pct(m.done)) }, tick: pct(m.low),
  });
  const plural = (n) => /s$/i.test(n) && !/\bback$/i.test(n);
  const keyLine = !key ? null : stateOf(key) === 'short'
    ? { name: key.muscle, gold: true, rest: `${plural(key.muscle) ? 'are' : 'is'} short by Sunday at this pace. The tick on each bar is the week’s target.` }
    : stateOf(key) === 'onway'
      ? { name: key.muscle, gold: false, rest: `${plural(key.muscle) ? 'reach' : 'reaches'} ${key.low} by Sunday on this plan. The tick on each bar is the week’s target.` }
      : { name: key.muscle, gold: false, rest: `${plural(key.muscle) ? 'are' : 'is'} past ${key.low} already. The tick on each bar is the week’s target.` };
  // the detail: every muscle with any work or any target, goal muscles first
  const all = [...goal, ...muscles.filter((m) => !m.goal && (m.done > 0 || m.bySunday > 0))];
  const dscale = Math.max(1, ...all.map((m) => Math.max(m.low, m.done, m.bySunday))) * 1.08;
  const dp = (v) => Math.round(Math.max(0, Math.min(100, (v / dscale) * 100)) * 10) / 10;
  const detail = all.map((m) => ({
    ...row(m), bar: dp(m.done), plan: { left: dp(m.done), width: Math.max(0, dp(m.bySunday) - dp(m.done)) }, tick: dp(m.low),
  }));
  const short = goal.filter((m) => stateOf(m) === 'short').map((m) => m.muscle);
  const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const s = week.start ? new Date(`${week.start}T12:00:00`) : null;
  const e = week.end ? new Date(`${week.end}T12:00:00`) : null;
  return {
    key: 'mac:sets', macKind: 'sets', title: 'Sets this week',
    head: { words: 'Nova’s own', sub: 'from your training log', hue: 'var(--nv-nova)' },
    sentence: Math.max(0, firstIdx(sents, (x) => named.some((m) => muscleRe(m.muscle).test(x)) || SETS_RE.test(x))),
    rows: rows.map(row), keyLine,
    detail, span: s && e ? `Mon ${s.getDate()} – Sun ${e.getDate()} ${MON3[e.getMonth()]}` : '',
    dnote: goal.length ? (short.length ? `With the rest of this week’s plan, ${list(short)} ${short.length === 1 ? 'ends' : 'end'} the week short of ${short.length === 1 ? 'its' : 'their'} minimum.` : 'With the rest of this week’s plan, every goal muscle reaches its minimum.') : '',
  };
}
function muscleTokenOf(name) { return MUSCLE_TOKEN[name] || '--nv-nova'; }

/** A brief's points: the bold lead of each "Key points" bullet (or the
 *  bullet's first sentence), and how many sources it cites. */
export function briefPoints(body) {
  const b = String(body || '');
  const sec = b.match(/##\s*Key points\s*\n([\s\S]*?)(?:\n##\s|$)/i)?.[1] || b;
  const points = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (!m) continue;
    const lead = m[1].match(/^\*\*(.+?)\*\*/)?.[1] || m[1].split(/(?<=[.!?])\s/)[0];
    const t = lead.replace(/\[\d+\]/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().replace(/[.:]$/, '');
    if (t) points.push(t);
  }
  const srcSec = b.match(/##\s*(Sources|References)\s*\n([\s\S]*?)(?:\n##\s|$)/i)?.[2];
  const listed = srcSec ? srcSec.split('\n').filter((l) => /^\s*(\d+[.)]|[-*]|\[\d+\])\s+/.test(l)).length : 0;
  const cited = new Set([...b.matchAll(/\[(\d+)\]/g)].map((x) => x[1])).size;
  return { points, sources: listed || cited };
}
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);

/** THE BRIEF PANEL: the Researcher's real record the answer stood on. */
export function briefPanel({ answer = '', record = null }) {
  if (!record || record.kind !== 'research') return null;
  const body = record.decision?.payload?.body || '';
  const { points, sources } = briefPoints(body);
  if (!points.length) return null;
  const sents = sentencesOf(answer);
  let sentence = firstIdx(sents, /\b(brief|researcher|research|stud(y|ies)|evidence|trial)\b/i);
  const said = sentence >= 0 ? words(sents[sentence]) : new Set();
  let spoken = -1;
  let best = 0;
  points.forEach((p, i) => { const n = [...words(p)].filter((w) => said.has(w)).length; if (n > best) { best = n; spoken = i; } });
  if (sentence < 0) sentence = Math.max(0, sents.length - 1);
  const at = new Date(record.createdAt || record.filedAt || Date.now());
  const title = String(record.decision?.title || record.decision?.payload?.title || 'The brief').replace(/\s+(Evidence\s+)?Brief$/i, '');
  return {
    key: `mac:brief:${record.id}`, macKind: 'brief', recordId: record.id, title,
    head: { words: 'from the Researcher', sub: `brief, ${at.getDate()} ${MON3[at.getMonth()]}`, hue: 'var(--nv-m-quads)' },
    sentence, points, spoken, sources,
    sourcesLine: `${sources ? `${sources} ${sources === 1 ? 'source' : 'sources'}, cited in the brief · ` : ''}in your Inbox since ${at.getDate()} ${MON3[at.getMonth()]}`,
  };
}

const hm = (d) => d.getHours() * 60 + d.getMinutes();
const clock12 = (h) => String(((h + 11) % 12) + 1);
const DAY_RE = /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s*(am|pm)|at\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|\d{1,2}))\b/i;

/** THE CALENDAR PANEL: the proposal's own day from his calendar, the
 *  proposal in it as the gold "your call" block. Only for a proposal whose
 *  record is a calendar change (create or move), with a time. */
export function calendarPanel({ answer = '', proposal = null, record = null, events = null }) {
  if (!proposal || !record) return null;
  const d = record.decision || {};
  const p = d.payload || {};
  if (d.route !== 'calendar' || !(p.action === 'create' || p.action === 'move')) return null;
  const start = new Date(p.start || p.newStart);
  const end = new Date(p.end || p.newEnd || (start.getTime() + 3600e3));
  if (!Number.isFinite(start.getTime())) return null;
  const day = isoDay(start);
  const from = Math.max(5, Math.min(18, start.getHours() - 2));
  const to = from + 6;
  const pos = (min) => Math.round(((min - from * 60) / ((to - from) * 60)) * 1000) / 10;
  const inWin = (a, b) => b > from * 60 && a < to * 60;
  const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
  const evs = (events || []).filter((e) => e.date === day && e.time).map((e) => {
    const a = toMin(e.time); let b = toMin(e.end); if (b == null || b <= a) b = a + 30;
    return { label: e.label, time: e.time, a, b };
  }).filter((e) => inWin(e.a, e.b) && !(p.action === 'move' && e.label === p.label));
  const clip = (a, b) => ({ left: Math.max(0, pos(a)), width: Math.max(4, Math.min(100, pos(b)) - Math.max(0, pos(a))) });
  const sents = sentencesOf(answer);
  const sentence = firstIdx(sents, DAY_RE);
  const fmt = (dt) => `${clock12(dt.getHours())}:${String(dt.getMinutes()).padStart(2, '0')}`;
  const sh = start.getHours();
  return {
    key: `mac:cal:${record.id}`, macKind: 'calendar', recordId: record.id,
    // Undo rides the inbox rails, and only when the filed record carries its undoData
    undoable: !!record.undoData,
    title: `${DAYS[start.getDay()]} ${sh < 12 ? 'morning' : sh < 17 ? 'afternoon' : 'evening'}`,
    head: { words: 'from your calendar', sub: `${DAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}`, hue: 'var(--nv-nova)' },
    sentence: sentence >= 0 ? sentence : Math.max(0, sents.length - 1),
    hours: Array.from({ length: to - from + 1 }, (_, i) => clock12(from + i)),
    events: evs.map((e) => ({ label: e.label, time: e.time, ...clip(e.a, e.b) })),
    block: { label: p.title || p.label || proposal.title, when: `${fmt(start)} to ${fmt(end)}`, ...clip(hm(start), hm(end)) },
    loaded: events != null,
    // the whole day, for the panel opened
    day: (events || []).filter((e) => e.date === day && e.time).map((e) => ({ label: e.label, time: e.time, end: e.end || '' })),
    blockAt: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
  };
}

// WHAT A LINE KEEPS OF ITS CODE PANELS (1 Nov 2026): a descriptor each,
// kind, title and source, for the drawer's thumbs; on the line only, never
// in the conversation record. No figures: a replay rebuilds the panel from
// the data as it is now (codePanels), so an old number is never shown as new.
const THUMB_SOURCE = { sets: { source: 'your log', hue: 'var(--nv-nova)' }, brief: { source: 'Researcher', hue: 'var(--nv-m-quads)' }, calendar: { source: 'calendar', hue: 'var(--nv-nova)' } };
export function panelDescriptors(panels) {
  return (panels || []).filter((p) => p?.macKind && THUMB_SOURCE[p.macKind]).map((p) => ({ kind: p.macKind, title: p.title, source: THUMB_SOURCE[p.macKind].source }));
}
export function thumbOf(desc) {
  return { title: desc.title, source: desc.source, hue: THUMB_SOURCE[desc.kind]?.hue || 'var(--nv-nova)' };
}

/** Every panel code builds for one answer, in the order its sentences say them. */
export function codePanels({ question = '', answer = '', week = null, inbox = null, briefIds = null, proposal = null, events = null }) {
  const items = inbox || [];
  const briefRec = (briefIds || []).map((id) => items.find((r) => r.id === id)).find(Boolean) || null;
  const propRec = proposal?.recordId ? items.find((r) => r.id === proposal.recordId) || null : null;
  return [
    setsPanel({ question, answer, week }),
    briefPanel({ answer, record: briefRec }),
    calendarPanel({ answer, proposal, record: propRec, events }),
  ].filter(Boolean).sort((a, b) => a.sentence - b.sentence);
}
