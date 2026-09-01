// RESPECT THE NO — one contract for what a declined proposal means, and when,
// if ever, it may come back.
//
// Five lanes each wrote their own answer and landed at the two wrong poles.
// The food scout and Compost made a no ETERNAL: a dismissal never expired —
// or, worse, expired by displacement from a 200-key slice, so when a no came
// back depended on how much else he had dismissed since. The program review,
// the pattern scout and the trust ladder made it a GUARANTEED RE-NAG: a
// week-keyed finding returned with next week's key after he argued it down,
// a declined scout proposal came back verbatim, and the same ledger produced
// the same autonomy verdict every Sunday — from the engine built to respect
// his judgment.
//
// The contract: a no stands for a COOLDOWN. After it, a proposal may return
// ONLY when the number that earned it has MATERIALLY moved — and then it
// says so ("you passed on this on 12 Jul; the number behind it has moved
// from 16 to 24"). Nothing comes back on the calendar alone; nothing stays
// buried once the world has changed. A lane with no honest number to compare
// (Compost's "this capture is stale") may opt into a plain cooldown, and the
// return still names the history.
//
// Pure. The rails already hold the no — status 'discarded', discardedAt,
// declineReason — so each consumer only names its subject key and the one
// metric it can honestly compare.

const DAY = 86_400_000;

// The latest decline per subject, with how many times the subject has been
// declined: Map<subject, { at, reason, metric, count }>.
export function latestDeclines(records, { kind = null, statuses = ['discarded'], subjectOf, metricOf = () => null }) {
  const out = new Map();
  for (const r of records || []) {
    if (kind && r.kind !== kind) continue;
    if (!statuses.includes(r.status)) continue;
    const subject = subjectOf(r);
    if (!subject) continue;
    const at = new Date(r.discardedAt || r.createdAt || 0).getTime();
    const prev = out.get(subject);
    const latest = !prev || at > prev.at ? { at, reason: r.declineReason || null, metric: metricOf(r) } : prev;
    out.set(subject, { ...latest, count: (prev?.count || 0) + 1 });
  }
  return out;
}

function when(at, now) {
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}
const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1));

// The decision. `metric` is the number the caller can compare, and LARGER must
// mean MORE reason to raise (a bigger deficit, more aged-out records, more
// loggings). `materialChange` is the fraction it must have grown by; null
// opts into a plain cooldown for a lane with no honest number.
export function respectNo({ declined, now = Date.now(), cooldownDays, metric = null, materialChange = 0.2, maxReturns = Infinity }) {
  if (!declined) return { raise: true, history: null, why: 'never declined' };
  if (declined.count > maxReturns) {
    return { raise: false, history: null, why: `declined ${declined.count} times — that is a standing no` };
  }
  const age = now - declined.at;
  if (age < cooldownDays * DAY) {
    return { raise: false, history: null, why: `declined ${Math.floor(age / DAY)}d ago — cooling down for ${cooldownDays}d` };
  }
  const passed = `you passed on this on ${when(declined.at, now)}${declined.reason ? ` ("${declined.reason}")` : ''}`;
  if (materialChange == null) {
    return { raise: true, history: passed, why: 'cooldown over' };
  }
  // the calendar alone never re-raises anything: with no number on either
  // side, a no after its cooldown is still a no
  if (declined.metric == null || metric == null) {
    return { raise: false, history: null, why: 'declined, and there is no number to show it has moved' };
  }
  const moved = (metric - declined.metric) / Math.max(Math.abs(declined.metric), 1);
  if (moved < materialChange) {
    return { raise: false, history: null, why: `declined, and the number has not materially moved (${fmt(declined.metric)} → ${fmt(metric)})` };
  }
  return {
    raise: true,
    why: 'materially worse since the no',
    history: `${passed}; the number behind it has moved from ${fmt(declined.metric)} to ${fmt(metric)}`,
  };
}

// For a model-driven lane: his recent no's as context lines, so the model is
// TOLD what he declined rather than trusted to remember.
export function declinedContext(records, { kind, days = 90, now = Date.now(), label = (r) => r.decision?.title || r.text }) {
  const cutoff = now - days * DAY;
  return (records || [])
    .filter((r) => r.kind === kind && r.status === 'discarded' && new Date(r.discardedAt || r.createdAt || 0).getTime() >= cutoff)
    .map((r) => `- ${String(label(r) || '').slice(0, 100)}${r.declineReason ? ` — his reason: "${r.declineReason}"` : ''}`);
}
