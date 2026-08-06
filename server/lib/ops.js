import { listRecords } from './inboxStore.js';
import { readHeartbeats } from './heartbeat.js';

// Nova Operations — the machinery made visible. Everything here is REAL
// state the platform already keeps: the inbox record ledger (every agent's
// receipts), the heartbeat net (every scheduler's last tick), and nothing
// else. No invented statuses; an agent that has never run says so.

// The scheduled fleet — heartbeat key → who it is on screen.
const SCHEDULED = [
  { id: 'dispatch', label: 'Dispatch', role: 'morning & evening briefs' },
  { id: 'review', label: 'Daily Review', role: 'the day, scored honestly' },
  { id: 'plan-today', label: 'Plan Today', role: "the day's top 3, picked" },
  { id: 'weekly-debrief', label: 'Weekly Debrief', role: "the Coach's Sunday sit-down" },
  { id: 'reminders', label: 'Reminders', role: 'nudges fired on time' },
  { id: 'guardian', label: 'Guardian', role: 'integrity, backups, alerts' },
  { id: 'health-drops', label: 'Health Sync', role: 'iPhone health drops' },
  { id: 'healthinsight', label: 'Health Insight', role: 'twice-daily noticing' },
  { id: 'compost', label: 'Compost', role: 'inbox aging & decay' },
  { id: 'food-suggest', label: 'Food Scout', role: 'food → recipe ideas' },
  { id: 'mealprep', label: 'Meal Prep', role: 'weekly prep proposals' },
  { id: 'training-check', label: 'Training Check', role: 'program drift watch' },
  { id: 'week-plan', label: 'Week Plan', role: 'training week annotations' },
  { id: 'money', label: 'Money', role: 'ledger import' },
  { id: 'cfo', label: 'CFO', role: 'monthly money report' },
  { id: 'todoist', label: 'Todoist', role: 'two-way to-do sync' },
  { id: 'overnight', label: 'Overnight', role: 'queued work while he sleeps' },
  { id: 'telegram', label: 'Telegram', role: 'Nova in his pocket' },
  { id: 'pulse', label: 'Pulse', role: 'what\'s new on his topics' },
];

// Conversational agents surface through the records they leave, not beats.
const CONVERSATIONAL = [
  { id: 'voice', label: 'Nova', role: 'the conversation', match: (r) => r.source === 'voice' },
  { id: 'coach', label: 'Coach', role: 'training brain', match: (r) => r.source === 'coach' },
  { id: 'researcher', label: 'Researcher', role: 'cited web briefs', match: (r) => r.kind === 'research' },
];

const DAY_MS = 24 * 3600e3;

function freshness(iso, now) {
  if (!iso) return { state: 'never', stateLabel: 'never run' };
  const age = now - new Date(iso).getTime();
  if (age < DAY_MS) return { state: 'today', stateLabel: 'ran today' };
  const days = Math.floor(age / DAY_MS);
  return { state: days <= 2 ? 'recent' : 'stale', stateLabel: `${days}d ago` };
}

export async function composeOps() {
  const now = Date.now();
  const [records, beats] = await Promise.all([listRecords(), readHeartbeats()]);

  const sorted = [...records].sort((a, b) =>
    String(b.filedAt || b.createdAt || '').localeCompare(String(a.filedAt || a.createdAt || '')));

  const stream = sorted.slice(0, 40).map((r) => ({
    id: r.id,
    kind: r.kind || r.decision?.route || 'capture',
    title: r.decision?.title || r.text?.slice(0, 90) || '(untitled)',
    status: r.status,
    source: r.source || null,
    at: r.filedAt || r.createdAt || null,
    destination: r.destination || null,
  }));

  const pending = records.filter((r) => r.status === 'pending').length;
  const running = records.filter((r) => r.status === 'classifying').length;

  const agents = SCHEDULED.map((a) => ({
    ...a,
    lastBeat: beats[a.id] || null,
    ...freshness(beats[a.id], now),
  }));

  const conversational = CONVERSATIONAL.map((a) => {
    const last = sorted.find(a.match);
    return {
      id: a.id, label: a.label, role: a.role,
      last: last ? { at: last.filedAt || last.createdAt, title: last.decision?.title || last.text?.slice(0, 60), status: last.status } : null,
      ...freshness(last ? (last.filedAt || last.createdAt) : null, now),
    };
  });

  // deterministic since-you-were-away counts for the wake debrief (LOCAL day)
  const pad = (n) => String(n).padStart(2, '0');
  const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const today = localDay(new Date().toISOString());
  const filedToday = records.filter((r) => r.status === 'filed' && r.filedAt && localDay(r.filedAt) === today).length;

  return { at: new Date(now).toISOString(), pending, running, filedToday, stream, agents, conversational };
}
