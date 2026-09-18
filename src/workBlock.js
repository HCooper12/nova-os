// WHEN WORK IS ABOUT TO START — one definition, read by both sides.
//
// His instruction, 18 Sep: "ensure that the leader panel on the Home Screen
// appears at the top within the hour before any work block, since that's when
// that will be most relevant especially. A reminder summary of the leader
// focus for today would also be good via telegram."
//
// Both of those hang on the same fact, so the fact is defined once here and
// imported by the Home ordering (src) and the Telegram reminder (server/lib).
// Two copies of "an hour before work" would drift the first time one moved,
// and then the panel and the message would disagree about the same moment.
//
// A WORK BLOCK IS AN EVENT ON HIS WORK CALENDAR. Not a keyword guess: his
// calendar already separates Work / Health / Family / Appointment, and today
// reads "Work 💰 · 15:30-20:00 · Work". Matching the calendar NAME is exact
// where a label match would catch "Walk Tank" and miss "Deep focus". The label
// fallback exists only for an event filed on the wrong calendar, and is
// deliberately narrow.

export const WORK_CALENDAR = /^work\b/i;
export const WORK_LABEL = /\b(work|shift|office|on\s?call)\b/i;

// An hour, because that is what he asked for and because it is the window in
// which the lead is still actionable — close enough to matter, far enough that
// he can do something about it before he starts.
export const LEAD_WINDOW_MIN = 60;

export function hm2min(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function isWorkBlock(event) {
  if (!event || !event.time) return false;
  if (WORK_CALENDAR.test(String(event.calendar || ''))) return true;
  // an event filed on the wrong calendar still counts if it says so plainly
  return WORK_LABEL.test(String(event.label || ''));
}

// The next work block that has not started yet, with how long until it does.
// Blocks already under way are NOT returned: he asked for the hour BEFORE, and
// a block that started two hours ago is not something to prepare for.
export function nextWorkBlock(events, nowMin) {
  let best = null;
  for (const e of events || []) {
    if (!isWorkBlock(e)) continue;
    const start = hm2min(e.time);
    if (start === null || start <= nowMin) continue;
    if (!best || start < best.start) best = { start, label: e.label || 'Work', time: e.time };
  }
  return best ? { ...best, startsIn: best.start - nowMin } : null;
}

// Should the lead go to the top right now?
export function leadLeadsNow(events, nowMin, within = LEAD_WINDOW_MIN) {
  const next = nextWorkBlock(events, nowMin);
  return !!next && next.startsIn <= within;
}

// Move 'lead' to the front of a Home order. `working` stays first when it is
// there: it is the live answer to "is anything happening?", his own standing
// requirement after a book analysis ran forty minutes with no sign of life,
// and it is a thin strip that is absent most of the time — so in practice the
// lead IS first exactly when he asked for it to be.
export function promoteLead(order, promote, key = 'lead') {
  if (!promote || !order.includes(key)) return order;
  const rest = order.filter((k) => k !== key);
  const head = rest[0] === 'working' ? ['working'] : [];
  return [...head, key, ...rest.slice(head.length)];
}

// "in 40 minutes" / "in 1 minute" / "now". For the line under the card that
// says WHY it has moved — a panel that reorders itself with no explanation is
// a layout bug as far as he can tell.
export function untilWords(startsIn) {
  if (startsIn === null || startsIn === undefined) return '';
  if (startsIn <= 0) return 'now';
  if (startsIn === 1) return 'in 1 minute';
  return `in ${startsIn} minutes`;
}
