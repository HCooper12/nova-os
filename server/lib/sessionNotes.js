// WHAT HIS OWN WORDS ARE TELLING THE COACH.
//
// He writes a note against an exercise mid-session — "left side was worse
// form, struggling to move 9.1kg without a slight nudge of body momentum" —
// and until now the only thing that ever read it was the Coach chat. The
// progression engine, every weekly detector and the Sunday debrief all
// ignored it, so a lift he had just told Nova he could not control cleanly
// could still earn +2.5kg on the strength of its rep count.
//
// This is the narrow, deterministic reader. It does NOT try to understand
// prose — it looks for a small set of unambiguous signals and is deliberately
// biased toward silence:
//
//   · a signal may only ever SUPPRESS a load increase, never create one;
//   · it never writes advice — it hands Coach the fact and HIS sentence, and
//     the model does the coaching with its own evidence rules;
//   · anything it is unsure about is not a signal.
//
// Getting this wrong in the cautious direction costs one week of a smaller
// jump. Getting it wrong the other way means telling a man whose form is
// already breaking down to add weight, which is how people get hurt.

// Form breaking down / the rep being completed by something other than the
// target muscle. These are the words he actually writes.
const FORM_BREAKDOWN = /\b(form|technique|momentum|swing(?:ing)?|cheat(?:ing|ed)?|sloppy|jerk(?:ing|y)?|heave|body ?english|nudge|compensat\w*|wobbl\w*|shak(?:y|ing)|control(?:led)?[- ]?(?:issue|problem)?|lost control|breaking down|not (?:as )?(?:clean|strict|good))\b/i;
// ...but "form was good" is the opposite report, and must not be read as a problem.
const FORM_POSITIVE = /\b(form (?:was |felt )?(?:good|great|solid|clean|strict|fine|better|perfect)|clean(?:er)? (?:form|reps)|strict form|no momentum|felt controlled)\b/i;

const FATIGUE = /\b(fatigu\w*|tired|exhaust\w*|drained|no energy|gassed|後|after (?:a|the|my) \w+|pre[- ]?fatigu\w*|second session|rushed)\b/i;
const TOO_EASY = /\b(too easy|felt easy|easy|comfortable|no challenge|barely felt|could have done more|had more in (?:me|the tank))\b/i;
const PAIN_WORDS = /\b(pain|hurt|sore(?:ness)?|niggle|tweak(?:ed)?|pinch(?:ing)?|ache|aching|strain(?:ed)?|impinge\w*)\b/i;

export const SIGNALS = ['form-breakdown', 'fatigue', 'too-easy', 'pain'];

// Returns the signals present in ONE note. Order is not significance — the
// caller decides what to do with each.
export function signalsIn(note) {
  const t = String(note || '').trim();
  if (!t) return [];
  const out = [];
  // a positive form report cancels the form signal outright: "form was good"
  // contains "form", and reading that as a problem would be worse than
  // reading nothing
  if (FORM_BREAKDOWN.test(t) && !FORM_POSITIVE.test(t)) out.push('form-breakdown');
  if (PAIN_WORDS.test(t)) out.push('pain');
  if (FATIGUE.test(t)) out.push('fatigue');
  if (TOO_EASY.test(t) && !FORM_BREAKDOWN.test(t)) out.push('too-easy');
  return out;
}

// The note attached to ONE exercise instance, with its signals. `pain` is a
// separate structured field in the logger and always counts.
export function readExerciseNote(ex) {
  const note = String(ex?.note || '').trim();
  const pain = String(ex?.pain || '').trim();
  if (!note && !pain) return null;
  const signals = new Set(signalsIn(note));
  if (pain) signals.add('pain');
  return { note: note || null, pain: pain || null, signals: [...signals] };
}

// Every note he has written for ONE exercise, newest first. `sessions` is the
// newest-first list loadSessions returns.
export function notesForExercise(sessions = [], exerciseId, { limit = 6 } = {}) {
  const out = [];
  for (const s of sessions) {
    const ex = (s.exercises || []).find((e) => e.exerciseId === exerciseId);
    const read = ex ? readExerciseNote(ex) : null;
    if (read) out.push({ date: s.date, name: ex.name || exerciseId, ...read });
    if (out.length >= limit) break;
  }
  return out;
}

// A lift he has flagged for the SAME reason more than once is a pattern, not
// a bad day. This is what earns a finding on the rails.
export function recurringSignal(sessions = [], exerciseId, signal, { min = 2, within = 6 } = {}) {
  const notes = notesForExercise(sessions, exerciseId, { limit: within });
  const hits = notes.filter((n) => n.signals.includes(signal));
  return hits.length >= min ? hits : null;
}

// Everything he wrote across the recent block, newest first — the digest the
// weekly surfaces read. Deliberately whole notes: a summary of his own words
// is a worse input than his own words.
export function recentNotes(sessions = [], { sessions: n = 12, cap = 30 } = {}) {
  const out = [];
  for (const s of sessions.slice(0, n)) {
    if (s.cutShort) out.push({ date: s.date, name: s.routineName || 'Session', note: `CUT SHORT — ${s.cutShort}`, signals: ['cut-short'] });
    for (const ex of s.exercises || []) {
      const read = readExerciseNote(ex);
      if (read) out.push({ date: s.date, name: ex.name || ex.exerciseId, exerciseId: ex.exerciseId, ...read });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

// One line per note, for a prompt. Signals are named so the model knows what
// the deterministic layer already concluded, and his sentence is quoted
// verbatim so it can reason from what he actually said.
export function notesContextLines(notes = []) {
  return notes.map((n) => {
    const tag = n.signals?.length ? ` [${n.signals.join(', ')}]` : '';
    const pain = n.pain ? ` PAIN: ${n.pain}` : '';
    return `${n.date} ${n.name}${tag}: "${n.note || ''}"${pain}`.trim();
  });
}
