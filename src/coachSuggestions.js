// COACH'S SUGGESTIONS — every change the Coach wants to make, in one place,
// in his words. His ask, 25 Sep 2026: "I need coach suggested changes
// (whether they be normal suggestions over time or from research and chat
// like I've just done) to occur within the train section… where the
// interface will have the suggestions for me to approve, discuss or
// disapprove… Simplicity and ease of use MUST be the goal here and not over
// complicated like the inbox system has become."
//
// This is the pure half: Inbox records (the rails every write already rides)
// plus his real routines and schedule, turned into cards a person can read
// at a glance — a sentence, where it lands, what it does to the session, and
// why. The machine titles ("Coach: remove X from Y") never reach him; the
// numbers on a card are computed here from the live program, never guessed.
//
// Sources, all on the same rails:
//   - a Coach chat or voice proposal (decision.route in COACH_ROUTES)
//   - the program review raised over time (kind 'coach-program')
//   - a study read against his block (kind 'coach-program', findingKind 'paper')

// Must match COACH_ROUTES in server/lib/coach.js — a shared contract.
export const COACH_ROUTES = [
  'routine-edit', 'schedule-edit', 'progression-tune', 'exercise-remap', 'injury-log',
  'goal-target', 'training-block', 'exercise-resource', 'coach-learning',
];

const ONE_TAP_FIX = new Set(['ops', 'remap', 'swap', 'weighted-variant', 'drop']);
export const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SHORT_DAY = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ci = (s) => String(s || '').trim().toLowerCase();

export function isCoachSuggestion(r) {
  if (!r || r.status !== 'pending') return false;
  if (r.kind === 'coach-program') return true;
  return COACH_ROUTES.includes(r.decision?.route);
}

// When it was raised, in the terms he would use.
export function whenLabel(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const day = (d) => new Date(d).toDateString();
  if (day(t) === day(now)) return 'today';
  if (day(t) === day(now - 86_400_000)) return 'yesterday';
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function sourceLabel(r) {
  if (r.kind === 'coach-program') return r.findingKind === 'paper' ? 'From a study' : "From Coach's program review";
  if (r.source === 'voice') return 'From what you said to Nova';
  return 'From your chat with Coach';
}

function setsOf(routine) {
  return (routine?.exercises || []).reduce((n, e) => n + (Number(e.targetSets) || 0), 0);
}

function repsText(low, high) {
  if (low && high && low !== high) return `${low}–${high}`;
  return low || high ? String(low || high) : '';
}

// The days a routine falls on, from his real schedule.
function daysOf(routineId, schedule) {
  return WEEK.filter((d) => schedule?.[d] === routineId).map((d) => SHORT_DAY[d]);
}

function exerciseOf(routine, exerciseId, name) {
  const list = routine?.exercises || [];
  const i = list.findIndex((e) => e.exerciseId === exerciseId || (name && ci(e.name) === ci(name)));
  return i >= 0 ? { ...list[i], index: i + 1 } : null;
}

// One routine-level change, described for a person: the headline, the
// "diff" the card draws, and the session's set total before and after.
function routineChange(p, routines) {
  const routine = routines.find((r) => r.id === p.routineId) || routines.find((r) => ci(r.name) === ci(p.routineName));
  const target = exerciseOf(routine, p.removeExerciseId, p.removeName);
  const before = setsOf(routine);
  const pill = (e, fallbackName, group) => ({ name: e?.name || fallbackName, muscle: e?.muscleGroup || group || null });
  if (p.action === 'remove') {
    return {
      headline: `Drop ${p.removeName}`,
      diff: { type: 'remove', exercise: pill(target, p.removeName), sets: target?.targetSets || null },
      routine, setsBefore: before, setsAfter: target ? before - (Number(target.targetSets) || 0) : null,
    };
  }
  if (p.action === 'add') {
    const n = Number(p.targetSets) || 3;
    return {
      headline: `Add ${p.addName}`,
      diff: { type: 'add', exercise: pill(null, p.addName, p.muscleGroup), sets: n, reps: repsText(p.targetRepsLow, p.targetRepsHigh) },
      routine, setsBefore: before, setsAfter: routine ? before + n : null,
    };
  }
  if (p.action === 'swap') {
    const was = Number(target?.targetSets) || 0;
    const now = Number(p.targetSets) || was || 3;
    return {
      headline: `Swap ${p.removeName} for ${p.addName}`,
      diff: { type: 'swap', from: pill(target, p.removeName), to: pill(null, p.addName, p.muscleGroup || target?.muscleGroup) },
      routine, setsBefore: before, setsAfter: routine ? before - was + now : null,
    };
  }
  if (p.action === 'reorder') {
    const n = routine?.exercises?.length || p.position;
    return {
      headline: p.position === 1 ? `Do ${p.removeName} first` : p.position === n ? `Do ${p.removeName} last` : `Move ${p.removeName} to number ${p.position}`,
      diff: { type: 'reorder', exercise: pill(target, p.removeName), from: target?.index || null, to: p.position },
      routine, setsBefore: before, setsAfter: before,
    };
  }
  // targets
  const was = { sets: Number(target?.targetSets) || null, reps: repsText(target?.targetRepsLow, target?.targetRepsHigh) };
  const next = {
    sets: Number(p.targetSets) || was.sets,
    reps: repsText(p.targetRepsLow || target?.targetRepsLow, p.targetRepsHigh || target?.targetRepsHigh),
  };
  const setWord = (n) => `${n} set${n === 1 ? '' : 's'}`;
  const headline = next.sets && next.sets !== was.sets && next.reps === was.reps
    ? `${p.removeName}: ${setWord(next.sets)}`
    : `${p.removeName}: ${next.sets ? `${next.sets} × ` : ''}${next.reps}`;
  return {
    headline,
    diff: { type: 'targets', exercise: pill(target, p.removeName), before: was, after: next },
    routine, setsBefore: before, setsAfter: routine && was.sets && next.sets ? before - was.sets + next.sets : before,
  };
}

function scheduleChange(p, routines, schedule) {
  const label = (id) => (!id ? 'Rest' : id === 'active-rest' ? 'Active rest' : routines.find((r) => r.id === id)?.name || 'Rest');
  const week = WEEK.map((d) => ({
    day: SHORT_DAY[d],
    before: label(schedule?.[d]),
    after: d === p.day ? label(p.routineId) : label(schedule?.[d]),
    changes: d === p.day,
  }));
  const Day = cap(p.day);
  const to = label(p.routineId);
  return {
    headline: !p.routineId ? `Make ${Day} a rest day` : p.routineId === 'active-rest' ? `Make ${Day} an active-rest day` : `Train ${to} on ${Day}`,
    diff: { type: 'schedule', week },
  };
}

function otherChange(route, p) {
  if (route === 'progression-tune') {
    const bits = [p.hold ? 'hold the load' : null, p.model === 'rpe' ? 'progress by feel (RPE)' : null,
      p.stepKg != null ? `${p.stepKg}kg jumps` : null, p.repStep != null ? `+${p.repStep} rep steps` : null, p.focus || null].filter(Boolean);
    return { headline: `${p.exerciseName}: ${bits.join(', ') || 'retune progression'}`, diff: { type: 'note', glyph: '↗' } };
  }
  if (route === 'exercise-remap') return { headline: `Count ${p.exerciseName} as ${p.muscleGroup}`, diff: { type: 'remap', exercise: { name: p.exerciseName, muscle: p.muscleGroup }, before: p.before } };
  if (route === 'injury-log') return { headline: `Log your ${p.area} (${p.severity})`, diff: { type: 'note', glyph: '✚' } };
  if (route === 'goal-target') return { headline: `Target: ${p.metric} ${p.value}${p.unit || ''}${p.by ? ` by ${p.by}` : ''}`, diff: { type: 'note', glyph: '◎' } };
  if (route === 'training-block') return { headline: `Start a ${p.lengthWeeks}-week ${p.phase} block`, diff: { type: 'note', glyph: '▤' } };
  if (route === 'exercise-resource') return { headline: `Add a form guide for ${p.exerciseName}`, diff: { type: 'note', glyph: '▶' } };
  if (route === 'coach-learning') return { headline: `Remember: ${p.insight}`, diff: { type: 'note', glyph: '✎' } };
  return { headline: 'A change to your program', diff: { type: 'note', glyph: '◆' } };
}

// A program-review or study finding: its fix (if it has one) drawn like any
// other change; if it has none, it is an observation the Coach will turn
// into concrete changes when he says yes.
function findingChange(r, routines) {
  const fix = r.fix || null;
  const line = String(r.originalText || r.text || '').replace(/^Coach:\s*/, '');
  const firstSentence = line.split(/(?<=[.!?])\s/)[0];
  const actionable = !!(fix && ONE_TAP_FIX.has(fix.action) && (fix.action !== 'drop' || (fix.routineId && fix.exerciseId)));
  if (fix?.action === 'drop') {
    const routine = routines.find((x) => x.id === fix.routineId);
    const target = exerciseOf(routine, fix.exerciseId);
    const before = setsOf(routine);
    return {
      headline: target ? `Drop ${target.name}` : (r.finding?.title || firstSentence),
      diff: { type: 'remove', exercise: { name: target?.name || 'an exercise', muscle: target?.muscleGroup || null }, sets: target?.targetSets || null },
      routine, setsBefore: before, setsAfter: target ? before - (Number(target.targetSets) || 0) : null,
      why: line, actionable,
    };
  }
  const pct = Number(r.finding?.pct);
  return {
    headline: r.finding?.title || firstSentence,
    diff: Number.isFinite(pct) ? { type: 'gauge', pct, label: r.findingKind === 'effort-ceiling' ? 'of sets at RPE 9–10' : '' } : { type: 'note', glyph: '◆' },
    why: r.finding?.title ? line : line.slice(firstSentence.length).trim() || line,
    actionable,
  };
}

// A reason is shown TO him on the card. Coach wrote some in the third person
// ("his 09-22 note says…"); the possessive and object forms turn cleanly into
// "your"/"you" — the subject form ("he felt") is left alone rather than risk
// "you feels". New reasons are asked for in the second person at the source.
export function toHim(text) {
  const t = String(text || '').trim()
    .replace(/\bhis\b/g, 'your').replace(/\bHis\b/g, 'Your')
    .replace(/\bhim\b/g, 'you');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export function buildSuggestion(r, { routines = [], schedule = {}, now = Date.now() } = {}) {
  const base = { id: r.id, createdAt: r.createdAt, when: whenLabel(r.createdAt, now), source: sourceLabel(r) };
  let c;
  if (r.kind === 'coach-program') {
    c = findingChange(r, routines);
    base.via = c.actionable ? 'approve' : 'draft';
  } else {
    const route = r.decision?.route;
    const p = r.decision?.payload || {};
    c = route === 'routine-edit' ? routineChange(p, routines)
      : route === 'schedule-edit' ? scheduleChange(p, routines, schedule)
        : otherChange(route, p);
    c.why = p.reason || r.decision?.reason || '';
    base.via = 'approve';
  }
  const routine = c.routine || null;
  return {
    ...base,
    headline: c.headline,
    diff: c.diff,
    why: toHim(c.why),
    routine: routine ? { id: routine.id, name: routine.name, days: daysOf(routine.id, schedule) } : null,
    sets: routine && c.setsAfter != null && c.setsBefore !== c.setsAfter ? { before: c.setsBefore, after: c.setsAfter } : null,
  };
}

// The deck: grouped by the routine it touches, in the order of his week,
// then anything that is not about one routine.
export function coachSuggestions(items = [], { routines = [], schedule = {}, now = Date.now() } = {}) {
  const cards = items.filter(isCoachSuggestion).map((r) => buildSuggestion(r, { routines, schedule, now }));
  const dayRank = (c) => {
    if (!c.routine) return 99;
    const i = WEEK.findIndex((d) => schedule?.[d] === c.routine.id);
    return i >= 0 ? i : 50;
  };
  cards.sort((a, b) => dayRank(a) - dayRank(b)
    || String(a.routine?.name || '').localeCompare(String(b.routine?.name || ''))
    || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return cards;
}

// The one line the Today and Gym tabs show, and the deck's own header.
export function suggestionsSummary(cards) {
  if (!cards.length) return null;
  const names = [...new Set(cards.map((c) => c.routine?.name).filter(Boolean))];
  const where = names.length === 0 ? '' : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return {
    count: cards.length,
    title: `${cards.length} change${cards.length === 1 ? '' : 's'} from Coach`,
    where,
  };
}
