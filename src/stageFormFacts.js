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

// what a card needs before anything is drawn for it (the rules StageCard has
// always applied, lifted out so the stage never draws an empty frame)
const DRAWABLE = new Set(['metric', 'bars', 'list', 'shot', 'key', 'steps', 'media', 'image', 'instrument', 'body', 'program', 'session', 'sources', 'page', 'video', 'figure', 'quote', 'entity', 'note', 'map']);
export function cardDrawable(card) {
  if (!card) return false;
  if (card.macKind) return true;
  if (card.kind === 'proposal') return !!card.title;
  if (card.kind === 'instrument') return !!card.data;
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
const clock = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const mmss = (sec) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The spark's points, in a 280 x 84 box, from a numeric series. Pure. */
export function sparkPath(values, { w = 280, h = 84, pad = 6 } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 3) return null;
  const lo = Math.min(...v); const hi = Math.max(...v); const span = hi - lo || 1;
  const pts = v.map((x, i) => [pad + (i / (v.length - 1)) * (w - pad * 2), pad + (1 - (x - lo) / span) * (h - pad * 2)]);
  return { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), end: pts[pts.length - 1] };
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
    const tPct = target != null && max ? Math.max(0, Math.min(100, (target / max) * 100)) : null;
    const rows = bars.map((b) => ({ name: b.name, pct: Math.max(2, Math.min(100, Number(b.pct) || 0)), low: tPct != null ? Number(b.value) < target : b.tone === 'warn' }));
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
    const items = (card.items || []).filter((i) => i && i.name);
    if (!items.length) return none;
    const label = String(card.label || '');
    const notes = items.map((i) => String(i.note || '').trim());
    if (/^sources?$/i.test(label.trim())) return { ...none, form: 'sources', items: items.map((i) => ({ name: i.name, note: i.note || '' })), meta: String(items.length) };
    if (notes.every((x) => clock(x) != null)) {
      const at = items.map((i, j) => ({ name: i.name, time: notes[j], m: clock(notes[j]) }));
      const next = now == null ? -1 : at.findIndex((x) => x.m >= now);
      return { ...none, form: 'timeline', items: at.map((x, j) => ({ name: x.name, time: x.time, now: j === next })), meta: String(items.length) };
    }
    if (items.every((i) => dayOf(i.name) >= 0)) {
      const by = new Map(items.map((i) => [dayOf(i.name), String(i.note || '').trim()]));
      const days = DAYS.map(([full, , d], j) => { const note = by.get(j); return { d, note: note || '', on: !!note && !/^(free|rest)$/i.test(note), free: !!note && /^(free|rest)$/i.test(note), full }; });
      const free = days.filter((x) => x.free);
      return { ...none, form: 'week', days, title: free.length === 1 ? `${free[0].full[0].toUpperCase()}${free[0].full.slice(1)} is free` : '' };
    }
    if (notes.every((x) => /^\d+\s*[×x]\s*\d+/.test(x))) {
      const session = label.split(/\s*·\s*/)[1];
      return { ...none, form: 'rows', items: items.map((i) => ({ name: i.name, note: i.note })), title: session ? `${session[0].toUpperCase()}${session.slice(1).toLowerCase()} day, ${lower(items[0].name)} first` : '' };
    }
    if (notes.every((x) => AGENT_HUE[x.toLowerCase()])) return { ...none, form: 'agents', items: items.map((i) => ({ name: i.name, who: i.note, hue: AGENT_HUE[String(i.note).toLowerCase()] })), meta: String(items.length) };
    if (notes.every((x) => !x)) return { ...none, form: 'dots', items: items.map((i) => ({ name: i.name })), meta: String(items.length) };
    return none;
  }

  if (k === 'quote' && card.text) return { ...none, form: 'quote', text: card.text, who: card.who || card.host || '' };
  if (k === 'page' && (card.title || card.host)) return { ...none, form: 'page', name: card.title || card.host, line: (card.lines || [])[0] || card.caption || '', host: card.host || '', image: card.image || null };
  if (k === 'video' && card.title) {
    const start = Number.isFinite(card.startS) ? card.startS : null;
    return { ...none, form: 'video', name: card.title, host: card.channel || card.host || '', poster: card.poster || null, start: start != null ? mmss(start) : '', meta: start != null ? `from ${mmss(start)}` : '' };
  }
  if (k === 'note' && (card.lines || []).length) return { ...none, form: 'note', lines: card.lines, title: card.title || '' };
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
