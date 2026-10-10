// THE RESTOCK RHYTHM, AS ARITHMETIC (10 Oct 2026; mockups 84 and 88).
//
// Two facts on a Stash line make a rhythm: how long one lasts (`lasts`, in
// weeks, his pick of 4, 6, 8 or 12) and when he last bought it (`bought`).
// Everything else is counted from them, here, once, and read by both the
// screen (the vials, the badges, the due card) and the server (the level
// check it files and pushes). The level is the calendar, never a measurement:
// the page says "counted in days".
//
//   days left  = lasts × 7 − days since bought (never below 0)
//   check on   = a week before empty (lead time for an online order), or the
//                later date "Plenty left" moved it to (`check`)
//   due        = today is on or past the check date
//
// LEARNING FROM REAL DATES (his yes to the bought history): every purchase
// he marks leaves a dated line on the Bought shelf. Two or more for the same
// link give a real gap; the middle gap, in weeks, is what his own buying
// says. It is PROPOSED where the rhythm is set ("Use 9 weeks"), never
// applied by itself.
//
// Dates are his calendar dates, YYYY-MM-DD; `today` is passed in so a test,
// the demo and the server's Melbourne clock all agree.

const DAY = 86400000;
const toUTC = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(toUTC(s));
export function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / DAY); }
export function addDays(iso, k) {
  const t = new Date(toUTC(iso) + k * DAY);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
// his calendar date now, in Melbourne (the platform's clock for days)
const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayISO = (now = Date.now()) => isoFmt.format(new Date(now));

export const RHYTHM_WEEKS = [4, 6, 8, 12];
export const LEAD_DAYS = 7;
export const SNOOZE_DAYS = 14;

// the rhythm of one item at `today`, or null when it has none
export function rhythmOf(item, today) {
  const weeks = Number(item?.lasts);
  if (!(weeks > 0) || !isISODate(item?.bought) || !isISODate(today)) return null;
  const total = Math.round(weeks * 7);
  const since = Math.max(0, daysBetween(item.bought, today));
  const left = Math.max(0, total - since);
  const lead = Math.min(LEAD_DAYS, Math.max(1, total - 1));
  let checkOn = addDays(item.bought, total - lead);
  if (isISODate(item.check) && item.check > checkOn) checkOn = item.check;
  return {
    weeks,
    total,
    since,
    left,
    level: total ? left / total : 0,          // the vial's fill, 0..1
    checkFrac: total ? lead / total : 0,      // the dashed line's height
    checkOn,
    due: today >= checkOn,
    snoozed: isISODate(item.check) && item.check > addDays(item.bought, total - lead),
    daysToCheck: daysBetween(today, checkOn),
  };
}

// what his own purchases say: the middle gap between his bought dates for
// one link, in weeks, or null with fewer than two purchases
export function learnedRhythm(dates = []) {
  const ds = [...new Set(dates.filter(isISODate))].sort();
  if (ds.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < ds.length; i++) gaps.push(daysBetween(ds[i - 1], ds[i]));
  const real = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  if (!real.length) return null;
  const mid = real.length % 2 ? real[(real.length - 1) / 2] : (real[real.length / 2 - 1] + real[real.length / 2]) / 2;
  return { weeks: Math.max(1, Math.round(mid / 7)), days: Math.round(mid), purchases: ds.length };
}

// "in 6 days", "tomorrow", "today", "6 days ago"
export function dayWords(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
