import { listRecords } from './inboxStore.js';

// The shared brain, deterministic edition: every conversational agent gets a
// compact picture of what the REST of the fleet did lately, read straight
// off the inbox rails — receipts, not vibes. No model calls; if the rails
// are quiet the section says nothing rather than inventing activity.

// kind → the agent name Hayden knows from the Ops screen / sidebar.
// Exported: the Stream (activity feed) attributes records with the same map.
export const KIND_AGENT = {
  dispatch: 'Dispatch', review: 'Daily Review', 'plan-today': 'Plan Today',
  'weekly-debrief': 'Weekly Debrief', 'week-plan': 'Week Plan',
  'training-check': 'Training Check', coach: 'Coach',
  'food-suggestion': 'Food Scout', 'meal-prep': 'Meal Prep',
  money: 'Money', cfo: 'CFO', research: 'Researcher', studio: 'Studio',
  guardian: 'Guardian', compost: 'Compost', pattern: 'Pattern Scout',
  autonomy: 'Trust Ladder', distill: 'Distiller', followup: 'Commander',
};

const HOURS = 48;
const MAX_LINES = 8;

function age(iso, now) {
  const h = Math.max(0, Math.round((now - new Date(iso).getTime()) / 3600e3));
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export async function fleetContext({ now = Date.now() } = {}) {
  let records;
  try { records = await listRecords(); } catch { return null; }
  if (!Array.isArray(records) || !records.length) return null;

  const cutoff = now - HOURS * 3600e3;
  const recent = records
    .filter((r) => r.createdAt && new Date(r.createdAt).getTime() > cutoff && KIND_AGENT[r.kind])
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  // one line per agent — its newest recent receipt, plus how many more
  const byAgent = new Map();
  for (const r of recent) {
    const agent = KIND_AGENT[r.kind];
    if (!byAgent.has(agent)) byAgent.set(agent, { newest: r, count: 0 });
    byAgent.get(agent).count++;
  }
  const lines = [...byAgent.entries()].slice(0, MAX_LINES).map(([agent, { newest, count }]) => {
    const title = newest.decision?.title || newest.text || newest.kind;
    const more = count > 1 ? ` (+${count - 1} more)` : '';
    return `- ${agent}: "${String(title).slice(0, 80)}" — ${newest.status}, ${age(newest.createdAt, now)}${more}`;
  });

  const pending = records.filter((r) => r.status === 'pending');
  const oldestPending = pending.length
    ? Math.round((now - Math.min(...pending.map((r) => new Date(r.createdAt).getTime()))) / 86400e3)
    : 0;
  const pendingLine = pending.length
    ? `His Inbox holds ${pending.length} pending draft${pending.length === 1 ? '' : 's'} awaiting review${oldestPending >= 2 ? ` (oldest ${oldestPending}d)` : ''}.`
    : null;

  if (!lines.length && !pendingLine) return null;
  return [
    `THE FLEET LATELY (other agents' receipts, last ${HOURS}h — reference naturally when relevant, never re-announce wholesale):`,
    ...lines,
    pendingLine,
  ].filter(Boolean).join('\n');
}
