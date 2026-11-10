// THE STAGE'S PANEL FORMS, THE PURE FACTS (10 Nov 2026, mockup 114, phase 2
// round two). Each panel on the Mac stage takes the mockup's form when its
// own card carries the data that form needs, and only then: a ring for "4 of
// 7", gold bars with a dashed target line, a timeline for timed rows, the
// day-chip week, a sparkline for a series, numbered sources, a video with a
// timecode chip. The scope on the eyebrow's right ("7 days", "this week", a
// count) and the serif claim title ("Under the line twice") are code's,
// derived from the same fields the form draws, so the two cannot disagree.
// Nothing here is invented and no model writes any of it: missing data means
// the plain form (null) and a blank scope. Tested in
// server/test/stageFormFacts.test.js.

import { MUSCLE_TOKEN } from './muscleHue.js';

// what a card needs before anything is drawn for it (the rules StageCard has
// always applied, lifted out so the stage never draws an empty frame)
const DRAWABLE = new Set(['metric', 'bars', 'list', 'shot', 'key', 'steps', 'media', 'image', 'instrument', 'body', 'program', 'session', 'sources', 'page', 'video', 'figure', 'quote', 'entity', 'note', 'map']);
export function cardDrawable(card) {
  if (!card) return false;
  if (card.macKind) return true;
  if (card.kind === 'proposal') return !!card.title;
  // on the stage an instrument is drawn only in a mockup form, from its own
  // data: never the instrument component, and never its 3D figure
  if (card.kind === 'instrument') return !!card.data && !!instrumentForm(card).form;
  if (!DRAWABLE.has(card.kind)) return false;
  if (card.state === 'dropped') return false;
  const has = (a) => Array.isArray(a) && a.length > 0;
  switch (card.kind) {
    case 'list': case 'steps': return has(card.items);
    case 'shot': return !!card.src;
    case 'bars': return has(card.bars);
    case 'key': return !!card.caption;
    case 'session': case 'sources': return !!(card.data || card.pending);
    case 'figure': return !!card.value;
    case 'quote': return !!card.text;
    case 'entity': return has(card.facts);
    case 'note': return has(card.lines);
    case 'page': return !!(card.title || card.host);
    case 'map': return (Number.isFinite(card.lat) && Number.isFinite(card.lon)) || !!card.pending;
    case 'video': return !!card.title;
    default: return true;
  }
}

const NUMW = ['no', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times'];
const DAYS = [['monday', 'mon', 'M'], ['tuesday', 'tue', 'T'], ['wednesday', 'wed', 'W'], ['thursday', 'thu', 'T'], ['friday', 'fri', 'F'], ['saturday', 'sat', 'S'], ['sunday', 'sun', 'S']];
const dayOf = (name) => {
  const n = String(name || '').trim().toLowerCase().replace(/\.$/, '');
  return DAYS.findIndex(([full, short]) => n === full || n === short);
};
// the agents whose drafts the briefing names (src/agentWorld: the roster)
const AGENT_HUE = { researcher: 'var(--nv-m-quads)', librarian: 'var(--nv-m-back)', coach: 'var(--nv-m-chest)', cfo: 'var(--nv-good)', 'meal prep': 'var(--nv-m-shoulders)', mealprep: 'var(--nv-m-shoulders)', leader: 'var(--nv-vi)' };
const num = (v) => {
  const t = String(v ?? '').replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const lower = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
// a row's time as the briefing writes it: "17:30", "5:30 pm", "5:30 pm · passed"
const clock = (s) => {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?(?:\s*·\s*passed)?$/i);
  if (!m) return null;
  let h = Number(m[1]) % 24;
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return h * 60 + Number(m[2]);
};
const ALL_DAY = /^all day$/i;
// what an Inbox record's kind is, in the words of the agent that made it
const KIND_WHO = { research: 'Researcher', 'forge-job': 'Forge', 'watch-note': 'Watch note', distill: 'Distill', study: 'Study', video: 'Video', pattern: 'Pattern', studio: 'Studio', 'brain-week': 'Brain week', 'fuel-cross': 'Fuel' };
export const mmss = (sec) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The spark's points, in a 280 x 84 box, from a numeric series. Pure. */
export function sparkPath(values, { w = 280, h = 84, pad = 6 } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 3) return null;
  // a wobble is drawn as a wobble: the box spans at least 4% of the level,
  // so half a kilo on 82 never fills it as a cliff would
  const mid = (Math.min(...v) + Math.max(...v)) / 2;
  const span = Math.max(Math.max(...v) - Math.min(...v), Math.abs(mid) * 0.04) || 1;
  const lo = mid - span / 2;
  const pts = v.map((x, i) => [pad + (i / (v.length - 1)) * (w - pad * 2), pad + (1 - (x - lo) / span) * (h - pad * 2)]);
  return { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), end: pts[pts.length - 1] };
}

/** A row cut by its builder at a fixed length (listCard: 46) breaks at a
 *  word with an ellipsis instead of mid-word. Pure. */
export function wordCut(text, max = 46) {
  const t = String(text || '').trim();
  if (t.length < max) return t;
  const cut = t.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s,;:.\-–—]+$/, '');
  return `${cut || t.slice(0, max)}…`;
}

const hhmmOf = (h) => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const hueOfMuscle = (m) => (MUSCLE_TOKEN[m] ? `var(${MUSCLE_TOKEN[m]})` : null);

/**
 * THE BRIEFING'S INSTRUMENTS IN THE MOCKUP'S FORMS (round four). Each from
 * the instrument's own payload (server/lib/instruments.js), and only what
 * it holds:
 *   week   his steps per day against the streak's floor: the STEPS ring,
 *          days on target of the days shown
 *   vitals HRV against his own band: one number, its verdict as the claim
 *   fuel   today's protein against his floor: one number on a ring, behind
 *          pace as the claim (the payload holds no week series)
 *   body   the session and its lifts as his program states them: TRAIN rows
 *   day    the timed blocks of today's calendar: the YOUR DAY timeline
 * { form: null } when the payload cannot carry its form. Pure.
 */
export function instrumentForm(card, { now = null } = {}) {
  const none = { form: null, meta: '', title: '', hue: null, tag: '' };
  const d = card?.data;
  if (!d || d.ok === false) return none;
  switch (card.instrument) {
    case 'week': {
      const known = (d.series || []).filter((x) => x && x.steps != null);
      if (!known.length) return none;
      const floor = Number(d.floor) > 0 ? Number(d.floor) : null;
      if (!floor) return { ...none, form: 'fig', tag: 'Steps', value: String(d.total ?? known.reduce((a, x) => a + x.steps, 0)), unit: 'steps', small: 'this week', meta: `${(d.series || []).length} days`, hue: 'var(--nv-cy)' };
      const on = known.filter((x) => x.steps >= floor).length;
      const of = (d.series || []).length;
      return { ...none, form: 'ring', tag: 'Steps', value: String(on), of, pct: Math.round((on / of) * 100), small: 'days on target', meta: `${of} days`, hue: 'var(--nv-cy)' };
    }
    case 'vitals': {
      if (d.hrv == null) return none;
      const bits = [];
      if (d.restingHr != null) bits.push(`resting heart ${d.restingHr} bpm`);
      if (d.stale && d.date) bits.push(`from ${d.date}`);
      const title = d.band && d.delta != null
        ? (d.delta >= 5 ? `${d.delta}% above your usual` : d.delta <= -5 ? `${Math.abs(d.delta)}% below your usual` : 'Inside your usual range')
        : '';
      return { ...none, form: 'fig', tag: 'HRV', value: String(d.hrv), unit: 'ms', small: bits.join(' · '), title, meta: d.band ? `vs ${d.band.n} days` : '', hue: 'var(--nv-vi)' };
    }
    case 'fuel': {
      const floor = Number(d.floor) > 0 ? Number(d.floor) : null;
      if (d.eaten == null || !floor) return none;
      const small = [d.behind > 0 ? `${d.behind} g behind pace` : null, d.planned ? `${d.planned} g planned` : null].filter(Boolean).join(' · ');
      return { ...none, form: 'ring', tag: 'Protein', value: String(d.eaten), of: floor, unit: 'g', pct: Math.min(100, Math.round((d.eaten / floor) * 100)), small,
        title: d.behind > 0 ? `Behind pace by ${d.behind} g` : d.pace != null ? 'On pace for your floor' : '', meta: 'today', hue: 'var(--nv-gold)' };
    }
    case 'body': {
      const lifts = (d.lifts || []).filter((l) => l && l.name);
      if (!d.session) return none;
      if (!lifts.length) return { ...none, form: 'fig', tag: 'Train', value: String(d.exercises || 0), unit: 'lifts', small: 'in today’s session', title: d.session, hue: 'var(--nv-m-back)' };
      const reps = (l) => (l.repsLow && l.repsHigh && l.repsHigh !== l.repsLow ? `${l.repsLow}-${l.repsHigh}` : l.repsLow || l.repsHigh || null);
      const items = lifts.map((l) => ({ name: l.name, note: l.sets && reps(l) ? `${l.sets} × ${reps(l)}` : l.sets ? `${l.sets} sets` : '', hue: hueOfMuscle(l.muscle) }));
      return { ...none, form: 'rows', tag: 'Train', title: `${d.session}, ${lifts[0].name.toLowerCase()} first`, items, meta: `${lifts.length} lifts`, hue: 'var(--nv-m-back)' };
    }
    case 'day': {
      const blocks = (d.blocks || []).filter((b) => b && Number.isFinite(b.t));
      if (!blocks.length) return none;
      const nowH = now != null ? now / 60 : Number(d.now);
      const next = Number.isFinite(nowH) ? blocks.findIndex((b) => b.t >= nowH) : -1;
      return { ...none, form: 'timeline', tag: 'Your day', items: blocks.map((b, i) => ({ name: b.label, time: hhmmOf(b.t), now: i === next, past: Number.isFinite(nowH) && b.t + (b.len || 0) <= nowH })), meta: `${blocks.length} fixed`, hue: 'var(--nv-nova)' };
    }
    default: return none;
  }
}

/** THE SHORT SUBJECT (mockup 114's eyebrow): a briefing label's subject,
 *  with its detail moved to the scope when it is short and to the claim
 *  title when it is a phrase. "WEEK OF <this week's Monday>" reads "this
 *  week". `today` is YYYY-MM-DD. Pure. */
const SUBJECT = [
  [/^worth keeping in mind$/i, 'Keep in mind'],
  [/^waiting on you$/i, 'Needs your word'],
  [/^the fleet, (overnight|today)$/i, 'Overnight'],
  [/^today[’']s technique$/i, 'Technique'],
  [/^today[’']s session$/i, 'Train'],
  [/^(today|tomorrow)$/i, 'Your day'],
];
export function stageTag(label, { today = null } = {}) {
  const raw = String(label || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { tag: '', scope: '', title: '' };
  const [head, ...rest] = raw.split(/\s+·\s+/);
  let detail = rest.join(' · ');
  let tag = head.split(/\s+vs\.?\s+/i)[0];
  for (const [re, short] of SUBJECT) if (re.test(tag)) { tag = short; break; }
  if (/^the fleet, today$/i.test(head)) detail = detail || 'today';
  if (/^\d+ on the calendar$/i.test(detail)) detail = '';
  const week = detail.match(/^week of (\d{4}-\d{2}-\d{2})$/i);
  if (week) {
    const monday = (() => { if (!today) return null; const t = new Date(`${today}T12:00:00`); const dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow); return t.toISOString().slice(0, 10); })();
    const at = new Date(`${week[1]}T12:00:00`);
    detail = monday === week[1] ? 'this week' : `week of ${at.getDate()} ${at.toLocaleDateString('en-AU', { month: 'short' })}`;
  }
  const lower = detail.toLowerCase();
  const short = lower.length <= 16;
  return { tag, scope: detail && short ? lower : '', title: detail && !short ? `${lower[0].toUpperCase()}${lower.slice(1)}` : '' };
}

/** What a card SAYS, for telling two panels apart: its first row or line,
 *  without punctuation or case. Two cards that say the same first thing are
 *  one panel on the stage. Pure. */
export function cardLineKey(card) {
  const first = card?.items?.[0]?.name || card?.lines?.[0] || card?.caption || card?.text || '';
  const k = String(first).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 32);
  return k.length >= 12 ? k : '';
}

/**
 * The form one card takes on the Mac stage. Returns { form, meta, title,
 * hue, ...the form's own data }, or { form: null, meta: '', title: '' }
 * when the card's data does not carry any of the mockup's forms (the plain
 * StageCard draws it then). `now` is minutes since midnight, for the
 * timeline's next point. Pure.
 */
export function stageForm(card, { now = null } = {}) {
  const none = { form: null, meta: '', title: '', hue: null };
  if (!card || card.macKind) return none;
  const k = card.kind;
  if (k === 'instrument') { const f = instrumentForm(card, { now }); return f.form ? f : none; }

  if (k === 'proposal') {
    return { ...none, form: 'proposal', title: card.title || '', body: card.body || '', meta: card.who || '', hue: 'var(--nv-good)', status: card.status || 'pending' };
  }

  if (k === 'metric') {
    const n = num(card.value);
    const of = String(card.unit || '').match(/^of\s+([\d,.]+)\s*(.*)$/i);
    const small = lower(card.caption);
    if (n != null && of && num(of[1]) > 0) {
      const total = num(of[1]);
      return { ...none, form: 'ring', value: String(card.value), of: total, pct: Math.max(0, Math.min(100, Math.round((n / total) * 100))), small, meta: /\bdays?\b/.test(`${of[2]} ${small}`) ? `${total} days` : '' };
    }
    if (n == null) return none;
    const series = (Array.isArray(card.series) ? card.series : []).map((p) => (typeof p === 'number' ? p : num(p?.value ?? p?.v)));
    const spark = sparkPath(series);
    const dated = Array.isArray(card.series) && card.series.length > 0 && card.series.every((p) => p && typeof p === 'object' && p.date);
    return { ...none, form: 'fig', value: String(card.value), unit: card.unit || '', small, spark, meta: spark && dated ? `${card.series.length} days` : '' };
  }

  if (k === 'bars') {
    const bars = card.bars || [];
    if (bars.length < 2) return none;
    const label = String(card.label || '');
    const fuel = /\b(protein|calorie|kcal|fuel|carb|fat)s?\b/i.test(label);
    // the target, only where the card states it: its own field, or its label
    // ("Protein vs your 140g floor", server/lib/findingCards.js)
    const target = num(card.target) ?? num(label.match(/(\d+(?:\.\d+)?)\s*g\s+floor\b/i)?.[1]);
    const ref = bars.reduce((a, b) => (Number(b.pct) > Number(a.pct) ? b : a), bars[0]);
    const max = Number(ref.pct) > 0 ? (Number(ref.value) * 100) / Number(ref.pct) : null;
    const tPct = num(card.targetPct) ?? (target != null && max ? Math.max(0, Math.min(100, (target / max) * 100)) : null);
    // each bar wears its own tone when the card gives one (the program audit:
    // decide warn, clean good, not yet cy), never a grey block
    const BAR_TONE = { cy: 'var(--nv-cy)', gold: 'var(--nv-gold)', warn: 'var(--nv-warn)', good: 'var(--nv-good)', vi: 'var(--nv-vi)' };
    const rows = bars.map((b) => ({ name: b.name, pct: Math.max(2, Math.min(100, Number(b.pct) || 0)), low: tPct != null ? Number(b.value) < target : false, hue: !fuel && BAR_TONE[b.tone] ? BAR_TONE[b.tone] : null }));
    const under = tPct != null ? rows.filter((r) => r.low).length : null;
    const names = bars.map((b) => String(b.name || '').trim());
    const weekdays = names.length === 7 && names.every((x) => /^[MTWFS]$/.test(x));
    const weeks = names.every((x) => /^(W\d+|Now)$/i.test(x));
    const dated = names.every((x) => /\d/.test(x));
    return {
      ...none, form: 'bars', rows, target: tPct, hue: fuel ? 'var(--nv-gold)' : null,
      title: under == null ? '' : under === 0 ? 'Over the line every day' : `Under the line ${NUMW[under] || `${under} times`}`,
      legend: tPct != null ? 'dashed line is the daily target' : '', foot: tPct != null ? '' : card.foot || '',
      meta: weekdays ? 'this week' : weeks ? `${names.length} weeks` : dated ? `${names.length} days` : '',
    };
  }

  if (k === 'list') {
    // a row its builder cut mid-word breaks at a word on the stage
    const items = (card.items || []).filter((i) => i && i.name).map((i) => ({ ...i, name: wordCut(i.name) }));
    if (!items.length) return none;
    const label = String(card.label || '');
    const notes = items.map((i) => String(i.note || '').trim());
    const foot = card.foot ? String(card.foot) : '';
    if (/^sources?$/i.test(label.trim())) return { ...none, form: 'sources', items: items.map((i) => ({ name: i.name, note: i.note || '' })), meta: String(items.length) };
    if (notes.every((x) => clock(x) != null || ALL_DAY.test(x)) && notes.some((x) => clock(x) != null)) {
      // shown on the 24-hour clock, from the same minutes (mockup 114's form)
      const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const at = items.map((i, j) => { const m = clock(notes[j]); return { name: i.name, time: m == null ? notes[j] : hhmm(m), m, past: /·\s*passed$/i.test(notes[j]) }; });
      const next = now == null ? -1 : at.findIndex((x) => x.m != null && x.m >= now);
      const timed = at.filter((x) => x.m != null).length;
      // a calendar's timed events are its fixed points; anything else is a count
      const cal = /\b(calendar|your day)\b/i.test(label);
      return { ...none, form: 'timeline', items: at.map((x, j) => ({ name: x.name, time: x.time, now: j === next, past: x.past })), meta: cal ? `${timed} fixed` : String(items.length), foot };
    }
    if (items.every((i) => dayOf(i.name) >= 0)) {
      const by = new Map(items.map((i) => [dayOf(i.name), String(i.note || '').trim()]));
      const days = DAYS.map(([full, , d], j) => { const note = by.get(j); return { d, note: note || '', on: !!note && !/^(free|rest)$/i.test(note), free: !!note && /^(free|rest)$/i.test(note), full }; });
      const free = days.filter((x) => x.free);
      // the week's room is good news: green, as the mockup draws it
      return { ...none, form: 'week', days, hue: 'var(--nv-good)', title: free.length === 1 ? `${free[0].full[0].toUpperCase()}${free[0].full.slice(1)} is free` : '' };
    }
    if (notes.every((x) => /^\d+\s*[×x]\s*\d+/.test(x))) {
      const session = label.split(/\s*·\s*/)[1];
      return { ...none, form: 'rows', items: items.map((i) => ({ name: i.name, note: i.note })), title: session ? `${session[0].toUpperCase()}${session.slice(1).toLowerCase()} day, ${lower(items[0].name)} first` : '', foot };
    }
    // drafts: rows that ARE Inbox records (an id each), or rows named by agent
    const records = items.every((i) => i.id);
    if (records || notes.every((x) => AGENT_HUE[x.toLowerCase()])) {
      const rows = items.map((i) => { const who = KIND_WHO[String(i.note || '').toLowerCase()] || i.note || ''; return { id: i.id || null, name: i.name, who, hue: AGENT_HUE[who.toLowerCase()] || null }; });
      return { ...none, form: 'agents', items: rows, meta: records ? `${items.length} ${items.length === 1 ? 'draft' : 'drafts'}` : String(items.length), foot };
    }
    // what to keep in mind is a caution: the warn hue, as the mockup draws it
    if (notes.every((x) => !x)) return { ...none, form: 'dots', items: items.map((i) => ({ name: i.name })), meta: String(items.length), foot, hue: /\b(keep(ing)? in mind|concern|caution|risk|watch out)\b/i.test(label) ? 'var(--nv-warn)' : null };
    return none;
  }

  if (k === 'quote' && card.text) return { ...none, form: 'quote', text: card.text, who: card.who || card.host || '' };
  if (k === 'page' && (card.title || card.host)) return { ...none, form: 'page', name: card.title || card.host, line: (card.lines || [])[0] || card.caption || '', host: card.host || '', image: card.image || null };
  if (k === 'video' && card.title) {
    const start = Number.isFinite(card.startS) ? card.startS : null;
    return { ...none, form: 'video', name: card.title, host: card.channel || card.host || '', poster: card.poster || null, start: start != null ? mmss(start) : '', meta: start != null ? `from ${mmss(start)}` : '' };
  }
  // a talk or podcast whose moment was proven (its own stamp, server/lib/visualMoment.js)
  if (k === 'media' && card.stamp && (card.title || card.caption)) {
    return { ...none, form: 'video', name: card.title || card.caption, host: card.channel || '', poster: card.src || null, start: String(card.stamp), meta: `from ${card.stamp}` };
  }
  // what is NOT known is a warning: the warn hue on its eyebrow
  if (k === 'note' && (card.lines || []).length) return { ...none, form: 'note', lines: card.lines, title: card.title || '', hue: /\b(not in|missing|not found|no record|gap|unknown)\b/i.test(String(card.label || '')) ? 'var(--nv-warn)' : null };
  return none;
}

/** A pending proposal as its own stage panel (mockup 114's PROPOSAL): its
 *  title, the body line its Inbox record states, and who proposed it, read
 *  from the record; nothing when there is no proposal. Pure. */
export function proposalCard(proposal, record = null) {
  if (!proposal?.title) return null;
  const d = record?.decision || {};
  const body = String(d.why || d.payload?.why || d.summary || '').replace(/\s+/g, ' ').trim();
  const who = String(record?.agent || d.by || '').trim();
  return { kind: 'proposal', key: `proposal:${proposal.recordId || proposal.title}`, label: 'Proposal', title: proposal.title, body, who, status: proposal.status || 'pending' };
}
