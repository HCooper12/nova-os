// WHEN DID THE THING A COACH CARD IS ABOUT ACTUALLY HAPPEN (13 Nov 2026).
//
// A coach-program card can sit pending for weeks, and the brief used to read
// the oldest one first: "gym performance from an exercise multiple weeks ago
// that is irrelevant for today in reality" (his words). The evidence date is
// the newest session the finding was read from when it carries its dates,
// else the local day the card was raised. Judged through lib/freshness.js.
import { isFresh, localDayISO } from './freshness.js';

/** The day the card's evidence is from: the newest of `finding.dates`, else the record's createdAt local day. */
export function evidenceDate(record) {
  const dates = (Array.isArray(record?.finding?.dates) ? record.finding.dates : [])
    .map((d) => localDayISO(d)).filter(Boolean).sort();
  if (dates.length) return dates[dates.length - 1];
  return localDayISO(record?.createdAt);
}

/** Pending coach-program cards worth saying out loud, newest evidence first. */
export function speakableProgramCards(records = [], { now = new Date() } = {}) {
  return (Array.isArray(records) ? records : [])
    .filter((r) => r && r.kind === 'coach-program' && isFresh('spoken-evidence', evidenceDate(r), now))
    .sort((a, b) => String(evidenceDate(b)).localeCompare(String(evidenceDate(a)))
      || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
