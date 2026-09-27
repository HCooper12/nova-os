import { parseInSession } from './gymVoice.js';

// THE LIVE SESSION'S PURE FACTS (28 Sep 2026, design/mockups/61-redesign-
// train-session-r2.html, round B of Train, approved with his words: "I'm
// sceptical of the new train due to possibly being too much effort to
// scroll and click on other aspects of the screen, but I am willing to try
// it so let's go with it."). The four new behaviours each reduce to a small
// rule that is easy to get subtly wrong and impossible to see in a
// screenshot, so they live here, tested in server/test/sessionSummary.test.js:
//
//   the rest timer     — a state machine over one timestamp; nothing counts
//                        unless his Settings row says so (default on, 90 s)
//   the record preview — code's comparison against the best the page holds
//                        (last session), at the resolution it is SHOWN at
//   the voice preview  — his words parsed by gymVoice.js, drawn as a set,
//                        and the exact app calls a yes or a tap would make
//   the lift increment — the step a stepper moves by, from his own numbers
//
// Nothing here writes. The view model (src/vals/valsSessionSummary.js)
// turns these into calls on methods the classic session already uses.

// ------------------------------------------------------------ numbers --

// A weight is shown to one decimal (62.5, 9.1), so it is compared at one
// decimal. The rounded-comparison rule (server/lib/trainingAnalytics.js
// `shown`, 12 Sep): if the number he would be shown is the same number,
// nothing changed, and a repeated lift is never a record.
export const shownKg = (n) => Math.round((Number(n) || 0) * 10) / 10;
// 60 reads "60", 62.5 reads "62.5": never "60.0" on a set he did
export const fmtKg = (n) => {
  const v = shownKg(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
export const fmtThousands = (n) => Math.round(Number(n) || 0).toLocaleString('en-AU');

const TIME_TYPES = new Set(['weight_time', 'bodyweight_time']);
const BW_TYPES = new Set(['bodyweight_reps', 'bodyweight_time']);
export const isTimeLift = (tt) => TIME_TYPES.has(tt);
export const isBodyweightLift = (tt) => BW_TYPES.has(tt);

// ------------------------------------------------------ the rest timer --

export const REST_KEY = 'novaos.restTimer';
export const REST_CHOICES = [60, 90, 120, 180];
export const REST_DEFAULT = 90;

// One key, one string: 'off', or the seconds. Anything else (nothing
// stored, a value from an older build) is the default: on, 90 s.
export function parseRestPref(raw) {
  if (raw === 'off') return { on: false, seconds: REST_DEFAULT };
  const n = Number(raw);
  if (REST_CHOICES.includes(n)) return { on: true, seconds: n };
  return { on: true, seconds: REST_DEFAULT };
}
export function restPrefValue(pref) {
  return pref && pref.on === false ? 'off' : String(REST_CHOICES.includes(Number(pref?.seconds)) ? Number(pref.seconds) : REST_DEFAULT);
}
export function getRestTimer() {
  try { return parseRestPref(localStorage.getItem(REST_KEY)); } catch { return parseRestPref(null); }
}
export function saveRestTimer(pref) {
  try { localStorage.setItem(REST_KEY, restPrefValue(pref)); } catch { /* best-effort: the row still shows his choice this visit */ }
}
export const restChoiceLabel = (s) => (s < 120 ? `${s} s` : `${s / 60} min`);

// The tick starts a rest only when the row says so; editing a past session
// never rests (there is no set to rest between).
export function restStart(pref, now, { editing = false } = {}) {
  if (editing || !pref || pref.on === false) return null;
  const total = REST_CHOICES.includes(Number(pref.seconds)) ? Number(pref.seconds) : REST_DEFAULT;
  return { startedAt: now, endsAt: now + total * 1000, total };
}

export const clockLabel = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// The ring's state at `now`. `left` rounds UP, so the ring reads 1:30 the
// instant it starts and 0:01 in its last second, never 0:00 while still
// counting; `frac` is what remains, 1 → 0, for the arc.
export function restState(rest, now) {
  if (!rest || !Number.isFinite(rest.endsAt) || !(rest.total > 0)) return { phase: 'off' };
  const ms = rest.endsAt - now;
  if (ms <= 0) return { phase: 'done' };
  const left = Math.min(rest.total, Math.ceil(ms / 1000));
  return { phase: 'resting', left, frac: Math.max(0, Math.min(1, ms / (rest.total * 1000))), label: clockLabel(left) };
}

// ------------------------------------------------- the lift's increment --

// No lift in the library carries an increment, so the step comes from his
// own numbers: Coach's progression step when there is one, else the
// smallest gap between the distinct weights he has actually loaded on this
// lift (last session and today), else 2.5. A seconds lift steps by 5.
export function liftIncrement({ coach, last, sets } = {}) {
  if (coach && coach.kind === 'weight' && Number(coach.delta) > 0) return shownKg(coach.delta);
  const ws = [...new Set([...(last?.sets || []), ...(sets || [])]
    .map((s) => shownKg(s?.weight)).filter((w) => w > 0))].sort((a, b) => a - b);
  let gap = null;
  for (let i = 1; i < ws.length; i++) {
    const d = shownKg(ws[i] - ws[i - 1]);
    if (d >= 0.5 && d <= 5 && (gap == null || d < gap)) gap = d;
  }
  return gap ?? 2.5;
}
export const repIncrement = (tt) => (isTimeLift(tt) ? 5 : 1);

// ----------------------------------------------- the record, previewed --

const workingDone = (sets) => (sets || []).filter((s) => s && s.done && s.setType !== 'warmup');

// The Finish sheet names a record BEFORE the session files, from the best
// the page already holds: last session's sets (the client holds no
// all-time best; the server's prsInSession decides a record when it files,
// and the house overlay plays then if it agrees). So the claim is "past
// last time", compared at the resolution shown. Warm-ups never count.
export function recordCandidates(exercises) {
  const out = [];
  (exercises || []).forEach((e, exIdx) => {
    if (!e || e.skipped || isTimeLift(e.trackingType)) return;
    const today = workingDone(e.sets);
    const before = (e.last?.sets || []).filter(Boolean);
    if (!today.length || !before.length) return;
    const muscle = e.muscleGroup || null;
    if (isBodyweightLift(e.trackingType)) {
      const r = Math.max(...today.map((s) => Number(s.reps) || 0));
      const p = Math.max(...before.map((s) => Number(s.reps) || 0));
      if (r > p) out.push({ exIdx, name: e.name, muscle, kind: 'reps', value: r, previous: p, delta: r - p, gain: p > 0 ? (r - p) / p : 1 });
      return;
    }
    const w = Math.max(...today.map((s) => shownKg(s.weight)));
    const p = Math.max(...before.map((s) => shownKg(s.weight)));
    if (!(w > 0)) return;
    const repsAt = (list, at) => Math.max(0, ...list.filter((s) => shownKg(s.weight) === at).map((s) => Number(s.reps) || 0));
    if (w > p) {
      out.push({ exIdx, name: e.name, muscle, kind: 'weight', value: w, reps: repsAt(today, w), previous: p, delta: shownKg(w - p), gain: p > 0 ? (w - p) / p : 1 });
    } else if (w === p) {
      const r = repsAt(today, w);
      const pr = repsAt(before, p);
      if (r > pr) out.push({ exIdx, name: e.name, muscle, kind: 'reps', weight: w, value: r, previous: pr, delta: r - pr, gain: pr > 0 ? (r - pr) / pr / 2 : 0.5 });
    }
  });
  // a heavier bar leads a rep; then the biggest step for its size; ties keep session order
  return out.sort((a, b) => (a.kind === b.kind ? b.gain - a.gain : a.kind === 'weight' ? -1 : 1));
}

// ---------------------------------------------------- the voice preview --

// "yes" at the end of what he said is the commit, not part of the set
const YES_TAIL = /(?:^|[\s,.;])(?:yes|yep|yeah|yes please|log it|that'?s right|correct)[.!\s]*$/i;
export function splitYes(text) {
  const t = String(text || '').trim();
  const m = t.match(YES_TAIL);
  if (!m) return { body: t, yes: false };
  return { body: t.slice(0, m.index).replace(/[\s,.;]+$/, '').trim(), yes: true };
}

// The set his words land on: the one on the card when it is still open,
// else the lift's next open set, else a new one (gymVoice's own rule).
function targetSet(e, selIdx) {
  const sets = e?.sets || [];
  if (Number.isInteger(selIdx) && sets[selIdx] && !sets[selIdx].done) return { setIdx: selIdx, add: false };
  const i = sets.findIndex((s) => !s.done);
  if (i !== -1) return { setIdx: i, add: false };
  return { setIdx: sets.length, add: true };
}

// His words against the lift on screen. Returns what the line draws:
//   { kind: 'set', exIdx, setIdx, add, weight, reps, rpe, setType, yes }
//   { kind: 'weight', weight } · { kind: 'addset' | 'next' | 'skip' | 'finish' | 'later' | 'where' | 'undo' }
//   { kind: 'miss', said } — a miss says so and never guesses
//   null — nothing said yet
export function voicePreview(text, { exIdx, e, selIdx } = {}) {
  const { body, yes } = splitYes(text);
  if (!body) return yes ? { kind: 'yes' } : null;
  const cmd = parseInSession(body);
  if (!cmd) return { kind: 'miss', said: 'Didn’t catch a set. Try “62.5 for 8”.' };
  if (!e) return { kind: 'miss', said: 'No lift is open to log that on.' };
  if (cmd.kind === 'set' || cmd.kind === 'same') {
    const { setIdx, add } = targetSet(e, selIdx);
    const cur = e.sets?.[setIdx] || e.sets?.[e.sets.length - 1] || {};
    let weight = cur.weight;
    let reps = cur.reps;
    let rpe = null;
    if (cmd.kind === 'same') {
      const prev = [...(e.sets || [])].reverse().find((s) => s.done);
      if (!prev) return { kind: 'miss', said: 'Nothing logged on this lift yet to repeat.' };
      weight = prev.weight; reps = prev.reps; rpe = prev.rpe ? Number(prev.rpe) : null;
    } else {
      if (cmd.weight != null) weight = cmd.weight;
      reps = cmd.reps;
      rpe = cmd.rpe;
    }
    return { kind: 'set', exIdx, setIdx, add, weight: Number(weight) || 0, reps: Number(reps) || 0, rpe, setType: cur.setType || 'working', count: (e.sets?.length || 0) + (add ? 1 : 0), yes };
  }
  return { ...cmd, exIdx, yes };
}

// The exact app calls a committed set makes — each one a method the classic
// session already calls (updateSessionSet, addSessionSet,
// toggleSessionSetDone), in order. A set that is already ticked is filled,
// never unticked.
export function commitOps(p, session) {
  if (!p || p.kind !== 'set') return [];
  const ops = [];
  if (p.add) ops.push(['addSessionSet', p.exIdx]);
  ops.push(['updateSessionSet', p.exIdx, p.setIdx, 'weight', p.weight]);
  ops.push(['updateSessionSet', p.exIdx, p.setIdx, 'reps', p.reps]);
  if (p.rpe != null) ops.push(['updateSessionSet', p.exIdx, p.setIdx, 'rpe', p.rpe]);
  const already = !p.add && !!session?.exercises?.[p.exIdx]?.sets?.[p.setIdx]?.done;
  if (!already) ops.push(['toggleSessionSetDone', p.exIdx, p.setIdx]);
  return ops;
}

// ------------------------------------------------------------- the pad --

// The page's own number pad: the first key replaces the number on the card,
// later keys append; one decimal point; ±step moves the number by the
// lift's increment; delete takes a character. Returns the new text.
export function padKey(text, key, { fresh = false, step = 2.5, decimals = true } = {}) {
  const t = fresh ? '' : String(text ?? '');
  if (key === 'del') return fresh ? '' : t.slice(0, -1);
  if (key === '+' || key === '-') {
    const n = Math.max(0, shownKg((Number(String(text ?? '')) || 0) + (key === '+' ? step : -step)));
    return decimals ? fmtKg(n) : String(Math.round(n));
  }
  if (key === '.') {
    if (!decimals || t.includes('.')) return t || '0';
    return `${t || '0'}.`;
  }
  if (!/^\d$/.test(key)) return t;
  const next = t === '0' ? key : t + key;
  // five characters is 999.5 kg; a sixth is a slip
  if (next.replace('.', '').length > 4 && next.length > 5) return t;
  if (next.includes('.') && next.split('.')[1].length > 1) return t;
  return next;
}
