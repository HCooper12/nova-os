// WHEN — a deterministic clock for spoken time, so "remind me at 6" never
// needs a model.
//
// The capture classifier already files "remind me …" by asking a model to
// read the time out of the sentence. That works and costs a round trip; for
// the shapes he actually uses, code is faster and exact. Anything this
// cannot read with certainty returns null and the old path takes it — a
// reminder set for the wrong hour is worse than a reminder that took two
// seconds longer.
//
// Local time throughout: `now` is his clock, and the answer is a Date in the
// same zone. Never build a date from an ISO string with a fixed offset (the
// standing rule from localDate.js — a UTC test runner must see his answer).

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[.!?]+$/, '')
  .trim();

// "6", "6pm", "6:30", "6.30pm", "18:00", "noon", "midnight", "half six" is NOT
// supported on purpose — it is ambiguous in his dialect.
function readClock(raw, { assumePm = true } = {}) {
  const s = norm(raw);
  if (/^noon|midday$/.test(s)) return { h: 12, m: 0 };
  if (/^midnight$/.test(s)) return { h: 0, m: 0 };
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3];
  if (h > 23 || min > 59) return null;
  if (mer === 'am') { if (h === 12) h = 0; }
  else if (mer === 'pm') { if (h < 12) h += 12; }
  else if (assumePm && h >= 1 && h <= 7) h += 12; // "at 6" in his life is the evening
  return { h, m: min };
}

const at = (base, h, m) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
  return d;
};

/**
 * Reads a time out of his words. Returns { when: Date, text: string } where
 * `text` is the sentence with the time expression removed (what to remind
 * him OF), or null when the time is not certain.
 */
export function parseWhen(input, now = new Date()) {
  const original = String(input || '').trim();
  const s = norm(original);
  if (!s) return null;

  const strip = (re) => original.replace(re, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,;–-]+|[\s,;–-]+$/g, '').trim();

  let m;
  // in N minutes / hours / days
  if ((m = s.match(/\bin (\d{1,3}|a|an|half an) (minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)\b/))) {
    const n = m[1] === 'a' || m[1] === 'an' ? 1 : m[1] === 'half an' ? 0.5 : Number(m[1]);
    const unit = m[2];
    const ms = /^min/.test(unit) ? 60_000 : /^h/.test(unit) ? 3_600_000 : /^d/.test(unit) ? 86_400_000 : 604_800_000;
    const when = new Date(now.getTime() + n * ms);
    return { when, text: strip(new RegExp(`\\bin ${m[1]} ${unit}\\b`, 'i')) };
  }

  // tomorrow / tonight / today [at TIME]
  if ((m = s.match(/\b(tomorrow|tonight|today|this evening|this afternoon|this morning)\b(?:\s+(?:at|around)?\s*([\d:.]{1,5}\s*(?:am|pm)?|noon|midday|midnight))?/))) {
    const word = m[1];
    const clock = m[2] ? readClock(m[2], { assumePm: !/morning/.test(word) }) : null;
    const base = word === 'tomorrow' ? new Date(now.getTime() + 86_400_000) : now;
    let h = clock?.h, mi = clock?.m ?? 0;
    if (h == null) {
      if (word === 'tonight' || word === 'this evening') { h = 19; mi = 0; }
      else if (word === 'this afternoon') { h = 14; mi = 0; }
      else if (word === 'this morning') { h = 9; mi = 0; }
      else if (word === 'tomorrow') { h = 9; mi = 0; }
      else return null; // a bare "today" has no hour — ask, don't guess
    }
    const when = at(base, h, mi);
    if (when <= now && word !== 'tomorrow') when.setDate(when.getDate() + 1);
    return { when, text: strip(new RegExp(`\\b${word}\\b(\\s+(at|around)?\\s*[\\w:.]+)?`, 'i')) };
  }

  // on <weekday> [at TIME] — the next one, never today
  if ((m = s.match(/\b(?:on |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b(?:\s+(?:at|around)?\s*([\d:.]{1,5}\s*(?:am|pm)?|noon|midday|midnight))?/))) {
    const target = WEEKDAYS.indexOf(m[1]);
    const clock = m[2] ? readClock(m[2]) : { h: 9, m: 0 };
    if (!clock) return null;
    let delta = (target - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    const base = new Date(now.getTime() + delta * 86_400_000);
    return { when: at(base, clock.h, clock.m), text: strip(new RegExp(`\\b(on |next )?${m[1]}\\b(\\s+(at|around)?\\s*[\\w:.]+)?`, 'i')) };
  }

  // at TIME (today if still ahead, else tomorrow)
  if ((m = s.match(/\bat (\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?|noon|midday|midnight)\b/))) {
    const clock = readClock(m[1]);
    if (!clock) return null;
    const when = at(now, clock.h, clock.m);
    if (when <= now) when.setDate(when.getDate() + 1);
    return { when, text: strip(new RegExp(`\\bat ${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')) };
  }
  return null;
}
