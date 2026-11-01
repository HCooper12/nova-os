// ONE THING FIRST, FOR A FAULT (1 Nov 2026, Wren parity: atlas-partner's
// lib/preflight.mjs + public/dock.js preflightFirstLine). Wren says one line
// about a background fault before it answers, once per day per fault, with no
// model. Nova's faults live in Guardian's daily report and the alert layer
// (server/lib/firstLineFaults.js gathers them, in their own words); this
// module only decides which one, if any, opens his spoken turn now.
//
// THE RULES
//  - Only a fault the server named. Nothing to say means nothing is said.
//  - Once per day per fault: a fault in today's heard list is never said
//    again today; tomorrow it may be said once more if it still stands.
//  - One line per turn, the first fault not yet heard.
// Pure; shared by App.sayFaultFirst and server/lib/firstLineFaults.js (the
// day key is the contract between them: his local calendar day).

const pad = (n) => String(n).padStart(2, '0');

/** His local calendar day, "2026-11-01". */
export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Every id heard on `day`, from any number of { day, ids } lists (the
 *  server's file and this device's own memory of what it just said). */
export function heardOn(day, ...lists) {
  const out = [];
  for (const l of lists) {
    if (!l || l.day !== day || !Array.isArray(l.ids)) continue;
    for (const id of l.ids) if (typeof id === 'string' && !out.includes(id)) out.push(id);
  }
  return { day, ids: out };
}

/**
 * The fault line due now, or null. `faults`: [{ id, line, alertId? }] as the
 * server wrote them; `heardToday`: { day, ids }. A heard list from another day
 * is no longer today's, so it holds nothing back.
 * → { id, line, day, alertId? } | null
 */
export function dueFirstLine({ faults = [], heardToday = null, now = Date.now() } = {}) {
  const day = dayKey(now);
  const heard = heardToday && heardToday.day === day && Array.isArray(heardToday.ids) ? heardToday.ids : [];
  const f = (Array.isArray(faults) ? faults : []).find((x) => x && typeof x.id === 'string' && x.id
    && typeof x.line === 'string' && x.line.trim() && !heard.includes(x.id));
  if (!f) return null;
  return { id: f.id, line: f.line.replace(/\s+/g, ' ').trim(), day, ...(f.alertId ? { alertId: f.alertId } : {}) };
}
