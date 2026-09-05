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
export const NEVER_FOLD = ['working', 'plan'];

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
