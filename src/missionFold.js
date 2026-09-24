// C1 — THE FOLD. Mission Control is a grouped stack of up to twelve sections
// in the day's order; on his phone the ones past the first screen are a
// scroll he mostly doesn't take. This folds everything after the first two
// sections down to a header and ONE LINE OF STATUS, so the whole day reads
// in a screen and any section is a tap from open.
//
// His pick from the 4 Sep audit (compared against the mockup on 5 Sep: the
// fold, not the tab bar, because it keeps the day's order intact). Two rules
// hold it honest:
//   - the status line is DERIVED from the same view model the open section
//     renders, never a second summary that can drift from it
//   - his own choice wins: a section he opened stays open (per section, in
//     localStorage), a section he folded stays folded, whatever the default
//
// Pure. The screen owns state and rendering; this decides what is folded and
// what the one line says.

export const FOLD_KEY = 'novaos.mcFold';

// Sections that are never folded: WORKING is the "is anything happening?"
// answer and its presence is the news; PLAN holds the one thing (C2) — the
// day's most important open act must not be a tap away from itself.
// 'stuck' is a question waiting for his answer (StuckCard.jsx); folded, it
// read as the bare word "stuck" and asked nothing
export const NEVER_FOLD = ['working', 'plan', 'stuck'];

// The first `keep` present sections (not counting the never-folded) stay open
// by default; the rest fold. Returns { key: 'open' | 'fold' } for every key.
export function defaultFolds(presentKeys = [], { keep = 2, never = NEVER_FOLD } = {}) {
  const out = {};
  let opened = 0;
  for (const k of presentKeys) {
    if (never.includes(k)) { out[k] = 'open'; continue; }
    out[k] = opened < keep ? 'open' : 'fold';
    opened += 1;
  }
  return out;
}

// What he remembered, over what the hour would do.
export function resolveFolds(presentKeys, remembered = {}, opts) {
  const base = defaultFolds(presentKeys, opts);
  for (const k of presentKeys) {
    if (remembered[k] === 'open' || remembered[k] === 'fold') base[k] = remembered[k];
  }
  return base;
}

export const FOLD_LABELS = {
  hero: 'Nova',
  vitals: 'Vitals',
  focus: 'Suggested focus',
  lead: 'Lead · try today',
  today: 'Today',
  stuck: 'Stuck',
  deck: 'Command deck',
  review: 'Daily review',
  noticed: 'Nova noticed',
  shortcuts: 'Shortcuts',
  agents: 'Agents',
};

const text = (x) => (x == null ? '' : String(x)).trim();
const val = (sat) => (sat && sat.value != null && sat.value !== '' ? `${sat.value}${sat.small || ''}` : '—');

// The one line under a folded header — the same facts the open section would
// show, at a glance. Every branch degrades honestly: no data reads as a dash
// or a plain "nothing", never as a good day.
export function foldStatus(key, v = {}) {
  switch (key) {
    case 'hero':
      return text(v.coreLabel) || 'Nova';
    case 'vitals':
      return `${val(v.satSleep)} sleep · ${val(v.satSteps)} steps · ${val(v.satProtein)} protein`;
    case 'focus': {
      const f = v.suggestedFocus || {};
      // the open card renders title then accent with no space of its own — same here
      return text(`${f.title ?? ''}${f.accent ?? ''}`) || 'nothing suggested yet';
    }
    case 'lead':
      return text(v.leaderToday?.title) || 'nothing to try today';
    case 'today': {
      const evs = Array.isArray(v.todayEvents) ? v.todayEvents : [];
      if (!evs.length) return v.todayStaleLabel ? `calendar ${text(v.todayStaleLabel).toLowerCase()}` : 'nothing on the calendar';
      const now = evs.find((e) => e.now);
      if (now) return `now · ${text(now.label)}`;
      const next = evs.find((e) => !e.past);
      if (next) return `next · ${text(next.time)} ${text(next.label)}`.trim();
      return `${evs.length} ${evs.length === 1 ? 'event' : 'events'} · all done`;
    }
    case 'deck': {
      const n = Number(v.commandDeck?.count) || 0;
      return n ? `${n} waiting for your call` : 'nothing waiting';
    }
    case 'review':
      return v.reviewFrom ? `from ${text(v.reviewFrom)}` : text(v.reviewMeta) || 'a concept to review';
    case 'noticed': {
      const items = Array.isArray(v.healthInsightItems) ? v.healthInsightItems : [];
      if (v.usingLiveHealthInsight && items.length) return `${items.length} ${items.length === 1 ? 'thing' : 'things'} noticed overnight`;
      return text(v.healthInsightEmptyText) || 'nothing noticed overnight';
    }
    case 'shortcuts':
      return [text(v.workoutCardLabel), text(v.noteCard?.title)].filter(Boolean).join(' · ') || 'workouts · notes';
    case 'agents': {
      const ags = Array.isArray(v.agents) ? v.agents : [];
      const on = ags.filter((a) => a.on).length;
      return ags.length ? `${on} of ${ags.length} on` : 'no agents';
    }
    default:
      return '';
  }
}

// THE INSTRUMENT — Session B of the aesthetic review (22 Sep 2026). The six
// folded rows were six identical boxes: uppercase label, an ellipsised string,
// a chevron — the rule-7 archetype, on the bottom half of the screen he opens
// every morning. A folded section now carries a FORM as well as a line: the
// same fact the status says, drawn — a count in the serif face, a dot per
// agent on an arc, a verdict dot per vital, the tab's own icon, a live dot.
//
// Pure, like foldStatus: it reads the same view model the open section
// renders, so the glyph can never say something the section would not. Every
// branch degrades honestly — no data is a faint dash or hollow dots, never a
// lit glyph pretending to a good day.
//
// The HUE is the section's own (rule 8: colour means something): the daily
// review is violet where its box is violet; agents are cyan like the live
// eyebrow; and gold appears ONLY where something is genuinely his to decide
// (a suggested focus not yet engaged, a lead not yet tried, things noticed
// and unread, calls waiting on the deck) and goes faint the moment there is
// nothing to decide — never a fill that persists across the surface.
export function foldInstrument(key, v = {}) {
  const faint = 'ink40';
  switch (key) {
    case 'hero':
      return { kind: 'live', hue: 'cy' };
    case 'vitals': {
      const rings = Array.isArray(v.ringVitals) ? v.ringVitals : [];
      const states = rings.slice(0, 4).map((r) => (['good', 'behind', 'missed'].includes(r?.state) ? r.state : 'absent'));
      return { kind: 'verdicts', hue: faint, states: states.length ? states : ['absent', 'absent', 'absent'] };
    }
    case 'focus':
      // a running focus block is a live thing in the accent; a suggestion he
      // has not taken up is his call, so it wears gold until he does
      if (v.focusChip) return { kind: 'live', hue: 'cy' };
      return text(v.suggestedFocus?.title) ? { kind: 'aim', hue: 'gold' } : { kind: 'aim', hue: faint };
    case 'lead':
      return { kind: 'dot', hue: text(v.leaderToday?.title) ? 'gold' : faint };
    case 'today': {
      const evs = Array.isArray(v.todayEvents) ? v.todayEvents : [];
      if (evs.some((e) => e.now)) return { kind: 'live', hue: 'cy' };
      const next = evs.find((e) => !e.past);
      if (next && text(next.time)) return { kind: 'when', hue: 'cy', text: text(next.time) };
      return { kind: 'count', hue: faint, text: evs.length ? String(evs.length) : '—' };
    }
    case 'deck': {
      const n = Number(v.commandDeck?.count) || 0;
      return { kind: 'count', hue: n ? 'gold' : faint, text: n ? String(n) : '0' };
    }
    case 'review':
      return { kind: 'count', hue: text(v.reviewConcept) ? 'vi' : faint, text: text(v.reviewConcept) ? '1' : '—' };
    case 'noticed': {
      const items = Array.isArray(v.healthInsightItems) ? v.healthInsightItems : [];
      const n = v.usingLiveHealthInsight ? items.length : 0;
      return { kind: 'count', hue: n ? 'gold' : faint, text: n ? String(n) : '—' };
    }
    case 'shortcuts':
      return { kind: 'icons', hue: faint, icons: [{ name: 'workouts', hue: 'cy' }, { name: 'notes', hue: 'mg' }] };
    case 'agents': {
      const ags = Array.isArray(v.agents) ? v.agents : [];
      return { kind: 'arc', hue: ags.some((a) => a.on) ? 'cy' : faint, dots: ags.map((a) => !!a.on) };
    }
    default:
      return { kind: 'dot', hue: faint };
  }
}

export function loadFolds() {
  try {
    const raw = localStorage.getItem(FOLD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFolds(folds) {
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(folds || {})); } catch { /* best-effort */ }
}
