// CALENDAR, WITHOUT A MODEL. "dentist friday 3pm" is a sentence code can read.
//
// Adding an event only needs a title and a start, so when both are certain
// this reads them directly and the model is never asked (cheaper, faster, and
// it works when his Claude usage has run out). Anything uncertain returns
// null: no date word, no explicit time, two times, a move or a delete. A
// calendar entry at the wrong hour is worse than one that took a model.
//
// Local time throughout (his clock). Day words reuse whenParser's resolver so
// "friday" means the same here as it does for a reminder.
import { parseWhen } from './whenParser.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const WEEKDAY_RE = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
const DEFAULT_MINUTES = 60;

export const EDIT_WORDS_RE = /\b(move|reschedule|push|postpone|cancel|delete|remove|change|bring forward)\b/i;

function monthIndex(w) {
  const k = w.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(k));
}

function clock(hRaw, minRaw, mer) {
  let h = Number(hRaw);
  const m = minRaw ? Number(minRaw) : 0;
  if (!Number.isFinite(h) || m > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === 'am') { if (h === 12) h = 0; } else if (h < 12) h += 12;
  } else if (h > 23) return null;
  return { h, m };
}

// A bare hour with no am/pm: his dialect reads 1-7 as the afternoon (the same
// rule as whenParser), 8-11 as morning, 12 as noon. 13+ is 24h.
function bareClock(hRaw, minRaw) {
  const h = Number(hRaw);
  if (h >= 1 && h <= 7) return clock(h, minRaw, 'pm');
  if (h >= 8 && h <= 11) return clock(h, minRaw, 'am');
  if (h === 12) return clock(12, minRaw, 'pm');
  return clock(h, minRaw, null);
}

function durationMinutes(n, unit) {
  const v = n === 'a' || n === 'an' ? 1 : n === 'half an' ? 0.5 : Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  const mins = /^h/i.test(unit) ? v * 60 : v;
  return mins >= 5 && mins <= 24 * 60 ? Math.round(mins) : null;
}

/**
 * Reads an event to ADD out of his words.
 * Returns { title, start: Date, end: Date } or null when not certain.
 */
export function parseEventLocal(input, now = new Date()) {
  let s = String(input || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 200 || EDIT_WORDS_RE.test(s)) return null;

  // Leading "add / put / book / schedule ..." and trailing "to my calendar".
  s = s.replace(/^(?:(?:please|nova|hey|can you|could you|i need to|i want to|i'd like to)\s+)*(?:add|put|book|schedule|create|set up|make|new event)\s+(?:in |an? |the |my |me )?(?:event |meeting |appointment )?(?:called |named )?/i, '');
  s = s.replace(/\s+(?:in|on|to|into) (?:my |the )?(?:calendar|diary)\b/i, '');

  // Duration: "for an hour", "for 90 minutes".
  let minutes = null;
  const dur = s.match(/\bfor (\d{1,3}(?:\.\d)?|an?|half an) (hours?|hrs?|minutes?|mins?)\b/i);
  if (dur) {
    minutes = durationMinutes(dur[1], dur[2]);
    if (minutes == null) return null;
    s = s.replace(dur[0], ' ');
  }

  // Time: a range ("3-4pm", "3pm to 4:30pm") or one time.
  let start = null;
  let end = null;
  const range = s.match(/(?:\bfrom |\bat )?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    || s.match(/(?:\bfrom |\bat )?\b(\d{1,2}):(\d{2})\s*()(?:-|–|—|to|until)\s*(\d{1,2}):(\d{2})\s*()/i);
  if (range) {
    const [, h1, m1, mer1, h2, m2, mer2] = range;
    const e = clock(h2, m2, mer2 ? mer2.toLowerCase() : null);
    let b;
    if (mer1) b = clock(h1, m1, mer1.toLowerCase());
    else if (mer2) {
      b = clock(h1, m1, mer2.toLowerCase());
      if (b && e && b.h * 60 + b.m >= e.h * 60 + e.m && mer2.toLowerCase() === 'pm') b = clock(h1, m1, 'am'); // "11-1pm"
    } else b = clock(h1, m1, null);
    if (!b || !e || b.h * 60 + b.m >= e.h * 60 + e.m) return null;
    if (dur) return null; // a range and a duration: don't guess
    start = b; end = e;
    s = s.replace(range[0], ' ');
  } else {
    const times = [];
    const spans = [];
    const re = /(?:\b(?:at|@)\s*)?\b(noon|midday|midnight|(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|(\d{1,2}):(\d{2})\b)/gi;
    let m;
    while ((m = re.exec(s))) {
      let c;
      if (/^(noon|midday)$/i.test(m[1])) c = { h: 12, m: 0 };
      else if (/^midnight$/i.test(m[1])) c = { h: 0, m: 0 };
      else if (m[2]) c = clock(m[2], m[3], m[4].toLowerCase());
      else c = clock(m[5], m[6], null);
      if (!c) return null;
      times.push(c); spans.push(m[0]);
    }
    if (times.length === 0) {
      // "at 3" with no am/pm: the dialect rule above.
      const bare = s.match(/\b(?:at|@)\s*(\d{1,2})\b(?!\s*(?:am|pm|st|nd|rd|th|:))/i);
      if (!bare) return null;
      const c = bareClock(bare[1], null);
      if (!c) return null;
      times.push(c); spans.push(bare[0]);
    }
    if (times.length !== 1) return null;
    start = times[0];
    s = s.replace(spans[0], ' ');
  }

  // Day: today / tomorrow / weekday via parseWhen, or "the 24th" / "24 Oct".
  const dayWords = s.match(new RegExp(`\\b(?:tomorrow|today|${WEEKDAY_RE})\\b`, 'gi')) || [];
  if (dayWords.length > 1) return null;
  const dayWord = s.match(new RegExp(`\\b(?:on |next |this )?(tomorrow|today|${WEEKDAY_RE})\\b`, 'i'));
  const dayMonth = s.match(new RegExp(`\\b(?:on )?(\\d{1,2})(?:st|nd|rd|th)? ${MON_RE}\\b`, 'i'));
  const monthDay = s.match(new RegExp(`\\b(?:on )?${MON_RE} (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  const monthHit = dayMonth || monthDay;
  const ordinal = !monthHit && s.match(/\b(?:on )?(?:the )?(\d{1,2})(?:st|nd|rd|th)\b/i);
  const found = [dayWord, monthHit, ordinal].filter(Boolean);
  if (found.length !== 1) return null;

  let day = null;
  if (dayWord) {
    const w = dayWord[1].toLowerCase();
    if (w === 'today') day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else {
      const r = parseWhen(`${w} at noon`, now);
      if (!r) return null;
      day = new Date(r.when.getFullYear(), r.when.getMonth(), r.when.getDate());
    }
    s = s.replace(dayWord[0], ' ');
  } else {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const valid = (yy, mm, d) => { const t = new Date(yy, mm, d); return t.getMonth() === ((mm % 12) + 12) % 12 ? t : null; };
    if (monthHit) {
      const d = Number(dayMonth ? monthHit[1] : monthHit[2]);
      const mon = monthIndex(dayMonth ? monthHit[2] : monthHit[1]);
      if (mon < 0 || d < 1 || d > 31) return null;
      day = valid(now.getFullYear(), mon, d);
      if (day && day < today) day = valid(now.getFullYear() + 1, mon, d);
    } else {
      // "the 24th": this month if still ahead (or today), else the next that has it.
      const d = Number(ordinal[1]);
      if (d < 1 || d > 31) return null;
      for (let i = 0; i < 3 && !day; i++) {
        const cand = valid(now.getFullYear(), now.getMonth() + i, d);
        if (cand && cand >= today) day = cand;
      }
    }
    if (!day) return null;
    s = s.replace((monthHit || ordinal)[0], ' ');
  }

  const startD = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.h, start.m, 0, 0);
  const endD = end
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), end.h, end.m, 0, 0)
    : new Date(startD.getTime() + (minutes || DEFAULT_MINUTES) * 60_000);
  if (startD < new Date(now.getTime() - 5 * 60_000)) return null; // in the past: ask, don't file

  // Title: what is left, minus connective filler.
  let title = s.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    title = title.replace(/^(?:on|at|for|to|a|an|the|my|in|from|and|then|@)\s+/i, '').replace(/\s+(?:on|at|for|to|in|from|and|@|the|next|this)$/i, '').trim();
  }
  if (!title || title.length > 80 || !/[a-z]/i.test(title)) return null;
  title = title[0].toUpperCase() + title.slice(1);
  return { title, start: startD, end: endD };
}
