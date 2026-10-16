// THE REST SENTENCE IN A COACH FOCUS NOTE (16 Oct 2026). Coach had no field
// for rest, so it wrote it into the lift's focus text: "Rest 2 minutes between
// sets" on a dozen of his lifts. His ask: the rest text must match the rest
// time, and when he sets his own time the sentence must not be there. This is
// the one pure reader of that sentence, so the ring, the line under the lift
// and the "Coach prescribes" note all agree on what it says.
//
//   parseRestText('Touch and pause. Rest 2 minutes between sets')
//     -> { seconds: 120, range: false, rest: 'Rest 2 minutes between sets', without: 'Touch and pause' }
//
// A range ("rest 2-3 minutes") is found and removable but gives no single time
// (seconds: null): picking an end would be Nova deciding for Coach.
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUM = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)';
const UNIT = '(minutes?|mins?|seconds?|secs?|(?<=\\d)s|(?<=\\d)m(?!\\w))';
const TAIL = '(?:\\s+(?:between|after|in between)\\s+(?:each\\s+)?(?:sets?|reps?))?';
const RANGE = `(?:\\s*(?:-|–|to)\\s*${NUM})?`;
const RE = new RegExp(
  `\\brest(?:\\s+for)?\\s+(?:about\\s+|around\\s+)?${NUM}${RANGE}\\s*${UNIT}${TAIL}|\\b${NUM}${RANGE}\\s*${UNIT}\\s+(?:of\\s+)?rest${TAIL}`,
  'i',
);
const toN = (x) => (x == null ? null : WORDS[String(x).toLowerCase()] ?? Number(x));

export function parseRestText(text) {
  const t = String(text || '').trim();
  const none = { seconds: null, range: false, rest: null, without: t };
  if (!t) return none;
  const m = RE.exec(t);
  if (!m) return none;
  // the two alternatives capture into groups 1-3 and 4-6
  const [a, b, unit] = m[1] != null ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]];
  const n = toN(a);
  const range = b != null;
  const per = /^m(in|inute)/i.test(unit) || /^m$/i.test(unit) ? 60 : 1;
  let seconds = !range && Number.isFinite(n) ? Math.round((n * per) / 5) * 5 : null;
  if (seconds != null && (seconds < 15 || seconds > 600)) seconds = null;
  const before = t.slice(0, m.index).replace(/[\s,;.:—-]+$/, '');
  const after = t.slice(m.index + m[0].length).replace(/^[\s,;.:—-]+/, '');
  return { seconds, range, rest: m[0], without: [before, after].filter(Boolean).join('. ') };
}
