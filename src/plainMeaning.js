// WHAT THIS MEANS, IN PLAIN WORDS (1 Nov 2026). His words, after a screen
// recording: "sometimes I'm not able to actually open up the decision that
// needs to be made to view more information properly in Laymans terms so fix
// that."
//
// Every pending Inbox card opens to one or two short sentences that say what
// a yes would do, written by CODE from the record's own fields: never a model,
// never a number the record does not carry. Short sentences, everyday words
// (the plain-speech rule in server/lib/lens.js), sentence case, and none of
// the machine's words (no route names, no "payload", no "tier"). When a field
// is missing the sentence says less, never something invented; and the
// fallback, built from the card's own title and reason, is never blank.
//
// Pure: a record in, a string out. Shared by both idioms (valsInbox mkItem).

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const cap = (s) => { const t = String(s || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
// lower-case a sentence's first letter to follow "Why:", but never a day,
// a month, "I" or an acronym ("Friday becomes Upper C", not "friday …")
const PROPER = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|i)\b/i;
const low1 = (s) => {
  const t = String(s || '').trim();
  if (!t || PROPER.test(t) || /^[A-Z]{2}/.test(t)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
};
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// a sentence ends once: "…at 14" → "…at 14."
const stop = (s) => { const t = clean(s); return !t ? '' : /[.!?…]$/.test(t) ? t : `${t}.`; };
// the machine's prefix on a title ("Coach: ", "Librarian: ") is not his reading
const unprefix = (s) => clean(s).replace(/^[A-Z][\w ·&-]{1,24}:\s+/, '');
// third person written about him, turned to him
const toHim = (s) => clean(s).replace(/\bHayden's\b/g, 'your').replace(/\bhis\b/g, 'your').replace(/\bHis\b/g, 'Your').replace(/\bhim\b/g, 'you');
// a machine key read as words: "calendar-soon" → "calendar soon"
const words = (s) => clean(String(s || '').replace(/[-_]+/g, ' '));

// "your third triceps lift …" → " Why: your third triceps lift …."
function why(reason) {
  const r = toHim(reason).replace(/^approve\s*=\s*/i, '');
  return r ? ` Why: ${stop(low1(r))}` : '';
}

function repsText(lo, hi) {
  const a = Number(lo) || null;
  const b = Number(hi) || null;
  if (a && b && a !== b) return `${a} to ${b} reps`;
  if (a || b) return `${a || b} reps`;
  return '';
}

// "4 sets of 8 to 12 reps", or as much of it as the card carries
function dose(p) {
  const sets = Number(p.targetSets) || null;
  const reps = repsText(p.targetRepsLow, p.targetRepsHigh);
  if (sets && reps) return `${sets} set${sets === 1 ? '' : 's'} of ${reps}`;
  if (sets) return `${sets} set${sets === 1 ? '' : 's'}`;
  return reps;
}

const day = (name) => `your ${clean(name) || 'training'} day`;

function routineEdit(p, reason) {
  const where = day(p.routineName);
  const place = p.afterName ? ` It goes after ${clean(p.afterName)}.` : Number(p.position) === 1 ? ' It goes first.' : '';
  switch (p.action) {
    case 'create':
      return `Creates a new training day called ${clean(p.routineName) || 'a new day'}. The lifts the Coach wants in it are separate cards.`;
    case 'add': {
      const muscle = p.muscleGroup ? ` (${low1(p.muscleGroup)})` : '';
      const d = dose(p);
      return `Adds ${clean(p.addName) || 'a lift'}${muscle} to ${where}${d ? `: ${d}` : ''}.${place}${why(reason)}`;
    }
    case 'remove':
      return `Takes ${clean(p.removeName) || 'a lift'} out of ${where}.${why(reason)}`;
    case 'swap': {
      const d = dose(p);
      return `Swaps ${clean(p.removeName) || 'a lift'} for ${clean(p.addName) || 'another lift'} on ${where}${d ? `: ${d}` : ''}.${why(reason)}`;
    }
    case 'move':
      return `Moves ${clean(p.removeName) || 'a lift'} from ${day(p.fromRoutineName)} to ${where}.${place}${why(reason)}`;
    case 'reorder':
      return `Moves ${clean(p.removeName) || 'a lift'} to number ${Number(p.position) || '?'} on ${where}.${why(reason)}`;
    case 'targets': {
      const d = dose(p);
      return d
        ? `Changes ${clean(p.removeName) || 'a lift'} on ${where} to ${d}.${why(reason)}`
        : `Changes how ${clean(p.removeName) || 'a lift'} is done on ${where}.${why(reason)}`;
    }
    default:
      return '';
  }
}

function scheduleEdit(p, reason) {
  const d = WEEKDAYS.includes(String(p.day || '').toLowerCase()) ? cap(p.day) : 'That day';
  const was = clean(p.beforeName);
  const instead = was ? ` instead of ${was}` : '';
  if (!p.routineId) return `Makes ${d} a rest day${instead}.${why(reason)}`;
  if (p.routineId === 'active-rest') return `Makes ${d} an active rest day${instead}.${why(reason)}`;
  return `Makes ${d} your ${clean(p.routineName) || 'training'} day${instead}.${why(reason)}`;
}

// how an alert reaches him at each level (server/lib/alerts.js BY_PLACE)
const ALERT_REACH = {
  now: 'straight away, and it may speak',
  next: 'as a card on your screen',
  later: 'quietly, in your Inbox only',
};
function alertTier(p, r) {
  const what = words(p.kind) || 'these';
  const to = ALERT_REACH[p.to];
  const from = ALERT_REACH[p.from];
  const evidence = clean(r.decision?.reason || r.text || '').replace(/\s*\(\d+%\)/g, '').replace(new RegExp(String(p.kind || '\\0').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), what);
  const main = to
    ? `Your "${what}" alerts will reach you ${to}${from ? `, not ${from}` : ''}.`
    : `Changes how your "${what}" alerts reach you.`;
  return `${main}${evidence ? ` Why: ${stop(low1(evidence))}` : ''} You can undo it.`;
}

function project(route, p, r) {
  const name = clean(p.name || p.projectName || p.title);
  switch (route) {
    case 'project-create': return `Starts a new project${name ? ` called ${name}` : ''}, with its brief as a page in your vault.`;
    case 'project-stage': return `Moves ${name || 'the project'}${p.stage ? ` to the ${low1(words(p.stage))} stage` : ' to its next stage'}.`;
    case 'project-settings': return `Changes a setting on ${name || 'the project'}.`;
    case 'project-watch-note': return `Saves the notes from this video into ${name ? `the ${name} project` : 'the project'}, and nowhere else.`;
    case 'project-research': return `Keeps this research in ${name ? `the ${name} project` : 'the project'}'s folder.`;
    case 'project-watch-candidates': return `Watches the videos it found, one after another, for ${name || 'the project'} only.`;
    case 'project-job': return `Work a queued job did in ${name ? `the ${name} project` : 'the project'}'s own folder. Undo takes back only what that job changed.`;
    case 'project-answer': return p.fable ? `Lets this one job run on Fable, as ${name || 'the project'} is set to.` : `Sends your answer${p.answer ? ` ("${clean(p.answer)}")` : ''} to the job that stopped to ask, and it carries on.`;
    default: return r.decision?.title ? stop(unprefix(r.decision.title)) : '';
  }
}

function listOf(items) {
  const names = (Array.isArray(items) ? items : []).map((x) => clean(typeof x === 'string' ? x : x?.name || x?.text)).filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function filing(route, p, r) {
  const t = clean(p.text || p.body || '');
  const short = t.length > 160 ? `${t.slice(0, 157).replace(/\s+\S*$/, '')}…` : t;
  switch (route) {
    case 'shopping': { const l = listOf(p.items); return l ? `Adds ${l} to your shopping list.` : 'Adds this to your shopping list.'; }
    case 'todo': { const l = listOf(p.items) || short; return l ? `Puts "${l}" on your to-do list.` : 'Puts this on your to-do list.'; }
    case 'journal':
      if (r.kind === 'leader-followup') {
        const q = clean(r.text);
        return `The Leader is asking you a question${q ? `: "${q}"` : ''} A yes files the question in your journal. Answer it in the Leader and it keeps its picture of you up to date.`;
      }
      return short ? `Adds this to your journal: "${short}"` : 'Adds this to your journal.';
    case 'note': return `Saves a note in your vault${p.title ? ` called "${clean(p.title)}"` : ''}.`;
    case 'idea': return 'Adds this to your ideas.';
    case 'food': return `Logs this in today's food${p.name || p.description ? `: ${clean(p.name || p.description)}` : ''}.`;
    case 'calendar': return `Puts an event in your calendar${p.title ? `: ${clean(p.title)}` : ''}${p.calendarName ? `, in ${clean(p.calendarName)}` : ''}.`;
    case 'reminder': return `Sets a reminder${p.title || p.text ? `: ${clean(p.title || p.text)}` : ''}.`;
    case 'expense': return 'Adds this spend to your ledger.';
    case 'recipe': return `Saves a recipe to your recipe bank${p.title || p.name ? `: ${clean(p.title || p.name)}` : ''}.`;
    case 'stash': return `Keeps this link in your stash${p.category ? `, under ${clean(p.category)}` : ''}.`;
    default: return '';
  }
}

export function plainMeaning(r) {
  if (!r) return '';
  const d = r.decision || {};
  const p = d.payload || {};
  const route = d.route;
  const reason = p.reason || d.reason || '';
  let s = '';
  if (r.kind === 'read-next') {
    const c = clean(r.meta?.concept);
    const n = Number(r.meta?.sourceCount) || 0;
    s = c
      ? `${c} keeps coming up in ${n ? `${n} of your sources` : 'your sources'}, and you have no page on it yet. A yes notes this as a reading gap; nothing is bought or written. "Research the books" asks the Researcher for the best book on it.`
      : '';
  } else if (route === 'routine-edit') s = routineEdit(p, reason);
  else if (route === 'schedule-edit') s = scheduleEdit(p, reason);
  else if (route === 'alert-tier') s = alertTier(p, r);
  else if (/^project-/.test(route || '')) s = project(route, p, r);
  else if (route) s = filing(route, p, r);
  if (s) return s;
  // never blank: the card's own title and reason, in its words
  const title = unprefix(d.title || r.title || '') || clean(r.text).slice(0, 160);
  if (title) return `${stop(cap(toHim(title)))}${reason && clean(reason) !== title ? why(reason) : ''}`;
  return 'Nova has something here waiting for your yes or no.';
}
