// THE ARITHMETIC OF A COUNT (src/CountUp.jsx draws it). Pure, so the rules
// can be tested without a browser: what a figure is, where a count starts,
// and where it is at any instant.

// a value that can be counted: a finite number. null, NaN and Infinity are
// not figures, and CountUp shows its dash for them rather than inventing one.
export const isFigure = (n) => typeof n === 'number' && Number.isFinite(n);

// the decelerating curve the ring arcs use, so the digits and the arc beside
// them read as one move: fast, then settling
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const COUNT_MS = 650;

// Where a count starts. Arrival counts (`fromZero`) start at 0 on the first
// paint; everything else starts only when the value CHANGES, from whatever is
// on screen at that instant (so a second write mid-count carries on from the
// presentation value instead of jumping back to the old target).
//   prev  : the figure on screen before this value (undefined on first paint)
//   next  : the new value
// Returns the number to count from, or null for "show it, do not count".
export function countStart({ prev, next, fromZero = false, reduced = false }) {
  if (reduced || !isFigure(next)) return null;
  if (prev === undefined) return fromZero && next !== 0 ? 0 : null;
  if (!isFigure(prev) || prev === next) return null;
  return prev;
}

// the figure at time t (ms since the count began)
export function countAt(from, to, t, duration = COUNT_MS) {
  if (!(duration > 0) || t >= duration) return to;
  if (t <= 0) return from;
  return from + (to - from) * easeOutCubic(t / duration);
}

// THE FIGURES THAT ARRIVE AS STRINGS. Home's body rings carry their value
// already formatted ('2,361', '96', '7:12', '78.2'). parseFigure reads one
// back into a number and a format that writes it the same way, so the count
// lands on exactly the string the view model gave. Anything else ('—', '7h',
// a word) is not a figure and is shown as it came.
export function parseFigure(text) {
  const s = String(text ?? '').trim();
  let m = /^(\d{1,3}):([0-5]\d)$/.exec(s);
  if (m) {
    const total = Number(m[1]) * 60 + Number(m[2]);
    return { value: total, format: (n) => { const r = Math.max(0, Math.round(n)); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; } };
  }
  m = /^(-?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const grouped = m[2].includes(',');
  const decimals = m[3] ? m[3].length : 0;
  const value = Number(`${m[1]}${m[2].replace(/,/g, '')}${m[3] ? `.${m[3]}` : ''}`);
  if (!isFigure(value)) return null;
  const format = (n) => {
    const fixed = Math.abs(n).toFixed(decimals);
    const [int, dec] = fixed.split('.');
    const body = grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
    const neg = n < 0 && Number(fixed) !== 0;
    return `${neg ? '-' : ''}${body}${dec ? `.${dec}` : ''}`;
  };
  return { value, format };
}
