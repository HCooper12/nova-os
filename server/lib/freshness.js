// HOW OLD IS TOO OLD TO SAY OUT LOUD (13 Nov 2026).
//
// His words: "I also keep getting prompts during the morning brief or in my
// inbox that are OLD data, such as one time I mentioned some slight pain
// during an exercise but wasn't ongoing (it should have merely asked if this
// was continual pain or not), as well as older things like my gym
// performance from an exercise multiple weeks ago that is irrelevant for
// today in reality".
//
// One table, one day count. Every reader that decides whether a piece of
// evidence is still today's news asks this file, so the windows can be read
// and changed in one place. Pure: no IO, no other Nova libs.
//
// Days are HIS local days (the process runs on his Mac, in AEST), never a
// UTC slice: between midnight and 10am local the UTC date is still
// yesterday, and he wakes at 04:30.

export const FRESH_DAYS = Object.freeze({
  // pain logged in a session: asked about once, only within this window
  'session-pain': 7,
  // his own note that the form went: a reported-form card only reads notes this new
  'form-note': 21,
  // a lift's most recent session must be this new before it can be called flat
  'lift-evidence': 28,
  // an open Injury Log entry is spoken without a fresh check-in for this long
  'open-injury': 14,
  // a pain note holds a lift's load for this long, then stops
  'pain-hold': 14,
  // a Coach card is spoken in the brief only while its evidence is this new
  'spoken-evidence': 21,
});

const pad = (n) => String(n).padStart(2, '0');
const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// The local calendar day a date falls on, as [y, m, d], or null.
function localDay(date) {
  if (date == null || date === '') return null;
  if (typeof date === 'string') {
    const m = date.trim().match(DAY_ONLY);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

const dayNumber = ([y, m, d]) => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);

/** Whole local days from `date` to `now`: 0 today, 1 yesterday; null when the date is missing or unreadable. */
export function ageDays(date, now = new Date()) {
  const then = localDay(date);
  const today = localDay(now);
  if (!then || !today) return null;
  return dayNumber(today) - dayNumber(then);
}

/** Is evidence of this kind, dated `date`, still fresh? A missing date is never fresh. */
export function isFresh(kind, date, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(FRESH_DAYS, kind)) throw new Error(`no freshness window for "${kind}"`);
  const age = ageDays(date, now);
  return age != null && age <= FRESH_DAYS[kind];
}

/** The items whose date (read by `dateOf`) is fresh under `kind`. */
export function freshOnly(items, kind, { now = new Date(), dateOf = (x) => x?.date } = {}) {
  return (Array.isArray(items) ? items : []).filter((x) => isFresh(kind, dateOf(x), now));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A short plain label for a person: "today", "yesterday", "on Mon 3 Nov" (the year only when it is not this year).
 *  `{ on: false }` drops the "on", for after "since": "since Mon 3 Nov".
 *  `{ relative: false }` never says today or yesterday, for text that is kept. */
export function datedLabel(date, now = new Date(), { on = true, relative = true } = {}) {
  const day = localDay(date);
  const age = ageDays(date, now);
  if (!day || age == null) return '';
  if (relative && age === 0) return 'today';
  if (relative && age === 1) return 'yesterday';
  const [y, m, d] = day;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const sameYear = localDay(now)[0] === y;
  return `${on ? 'on ' : ''}${weekday} ${d} ${MONTHS[m - 1]}${sameYear ? '' : ` ${y}`}`;
}

/** The local day of a date as YYYY-MM-DD, or null. */
export function localDayISO(date) {
  const day = localDay(date);
  return day ? `${day[0]}-${pad(day[1])}-${pad(day[2])}` : null;
}
