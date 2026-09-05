// A3 — NOVA TRIAGES FIRST. Group what is waiting so nine items become three
// decisions, and the pattern gets one answer instead of one per symptom.
//
// His pick from the 4 Sep audit, built 5 Sep after A1. The audit's mockup had
// a model do the grouping; this first version is DETERMINISTIC on purpose.
// The rails already carry everything a grouping needs — kind, route,
// confidence, and a title whose prefix ("Standing:", "Coach:") names the
// subject — so code can do it for free, on every render, with no call to
// approve and nothing to be wrong about. A model can name themes later, on
// top of groups that already exist; it should not be the thing that decides
// what is in them.
//
// Pure. Items are the Inbox's own pending view-model rows.

// A capture is something HE put in (voice, Telegram, a Shortcut, typed) that
// Nova's classifier routed. Everything with a kind is an agent's product — a
// brief, a verdict, a proposed rule — and carries the agent's OWN confidence,
// which says nothing about whether he wants it kept.
export const isCapture = (item) => !item?.kind || item.kind === 'capture';

// The subject of a title: the words before the first colon, when there is one
// and it is short — "Standing: Compose…" → "standing", "Coach: remember —" →
// "coach". Otherwise an agent product's KIND stands in (two research briefs
// are "research", two model picks are "model choice"), and a capture's route
// — so every item has SOME subject, and it names what the thing is.
export function subjectOf(item) {
  const t = String(item?.title || '');
  const m = t.match(/^([^:]{2,24}):\s/);
  if (m) return m[1].trim().toLowerCase();
  if (!isCapture(item)) return String(item.kind).replace(/[-_]+/g, ' ').toLowerCase();
  return (item?.route?.label || 'other').toString().toLowerCase();
}

// Three buckets, and the rule for each is one line:
//   routine — high-confidence CAPTURES: exactly what the next rung of his own
//             filing ladder (auto-high) would file without asking. One tap
//             does it. An agent's product is never routine, however sure the
//             agent is — he kept 9 of ~154 drafts in a month, and the first
//             cut of this rule would have filed two research briefs and two
//             video verdicts unread (his real inbox, 5 Sep).
//   pattern — two or more items on the same subject; the repeat IS the news
//   decide  — everything else, one at a time
export function digestPending(items = []) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (list.length < 2) return null; // nothing to triage — the deck alone is right

  const routine = list.filter((i) => isCapture(i) && i.confidence === 'high' && !i.isModelChoice);
  const rest = list.filter((i) => !routine.includes(i));

  const bySubject = new Map();
  for (const i of rest) {
    const s = subjectOf(i);
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push(i);
  }
  const patterns = [...bySubject.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([subject, members]) => ({ subject, members }))
    .sort((a, b) => b.members.length - a.members.length);
  const patterned = new Set(patterns.flatMap((p) => p.members));
  const decide = rest.filter((i) => !patterned.has(i));

  return {
    total: list.length,
    routine,
    patterns,
    decide,
    // one line he can read before anything else: what the nine actually are
    summary: describe(list.length, routine.length, patterns, decide.length),
  };
}

function describe(total, routine, patterns, decide) {
  const parts = [];
  if (routine) parts.push(`${routine} routine`);
  if (patterns.length) parts.push(`${patterns.reduce((n, p) => n + p.members.length, 0)} on ${patterns.length === 1 ? 'one repeating subject' : `${patterns.length} repeating subjects`}`);
  if (decide) parts.push(`${decide} to decide`);
  return `${total} waiting — ${parts.join(', ')}.`;
}
