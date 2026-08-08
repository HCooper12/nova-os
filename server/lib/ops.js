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
  { id: 'health-mirror', label: 'Health Mirror', role: 'the numbers, into the vault' },
  { id: 'pattern-scout', label: 'Pattern Scout', role: 'repeated acts → skill proposals' },
  { id: 'autonomy', label: 'Trust Ladder', role: 'autonomy earned, proposed' },
  { id: 'distill', label: 'Distiller', role: 'captures woven into the graph' },
];

// Conversational agents surface through the records they leave, not beats.
const CONVERSATIONAL = [
  { id: 'voice', label: 'Nova', role: 'the conversation', match: (r) => r.source === 'voice' },
  { id: 'coach', label: 'Coach', role: 'training brain', match: (r) => r.source === 'coach' },
  { id: 'researcher', label: 'Researcher', role: 'cited web briefs', match: (r) => r.kind === 'research' },
];

// The map drawn (AGENT-SKILL-MAP build 2) — which life department(s) each
// agent draws its skills from. The registry page (Wiki/Library/Nova
// Skills.md, parsed by skills.js) is departmental, so this map stays at that
// grain: static, code-reviewed, honest. An agent with no entry renders
// "no skills mapped yet" on screen rather than a guessed list. Department
// names are a contract with the registry SEED in skills.js — the ops test
// cross-checks every name here against the seeded page.
export const AGENT_DEPARTMENTS = {
  dispatch: ['Logistics'],
  review: ['Mind'],
  'plan-today': ['Logistics'],
  'weekly-debrief': ['Train'],
  guardian: ['Platform'],
  'health-drops': ['Platform'],
  healthinsight: ['Train'],
  compost: ['Platform'],
  'food-suggest': ['Fuel'],
  mealprep: ['Fuel'],
  'training-check': ['Train'],
  'week-plan': ['Train'],
  money: ['Money'],
  cfo: ['Money'],
  todoist: ['Logistics'],
  overnight: ['Platform', 'Knowledge'],
  telegram: ['Platform'],
  pulse: ['Knowledge'],
  voice: ['Knowledge', 'Logistics'],
  coach: ['Train'],
  researcher: ['Knowledge'],
  // reminders deliberately unmapped: it fires nudges but owns no registry
  // skill yet — the screen says "no skills mapped yet", which is the truth.
  'health-mirror': ['Platform'],
  'pattern-scout': ['Platform'],
  autonomy: ['Platform'],
  distill: ['Knowledge'],
};

// Which inbox-record kinds each SCHEDULED agent files — verified against the
// actual createRecord writers in lib/ (dailyReview, dispatch, planToday,
// weeklyDebrief, guardian, compost, foodSuggest, mealPrep, trainingCheck,
// weekPlan, moneyImport, cfoReport). Agents absent here leave heartbeats but
// no inbox records (reminders, health-drops, healthinsight, todoist,
// overnight, telegram, pulse) — their receipts are null, not [], so the
// screen can say "leaves no inbox records" instead of the false "none yet".
export const AGENT_RECORD_KINDS = {
  dispatch: ['dispatch'],
  review: ['review'],
  'plan-today': ['plan-today'],
  'weekly-debrief': ['weekly-debrief'],
  guardian: ['guardian'],
  compost: ['compost'],
  'food-suggest': ['food-suggestion'],
  mealprep: ['meal-prep'],
  'training-check': ['training-check'],
  'week-plan': ['week-plan'],
  money: ['money-import'],
  cfo: ['cfo'],
  'pattern-scout': ['pattern'],
  autonomy: ['autonomy'],
  distill: ['distill'],
};

const RECEIPT_LIMIT = 5;

// Last receipts for one agent, from records already sorted newest-first.
// Pure: exported for the regression test. `agent` carries either the
// scheduled kinds list or a conversational match fn; an agent with neither
// returns null — it genuinely leaves no inbox records.
export function agentReceipts(sorted, agent) {
  const kinds = AGENT_RECORD_KINDS[agent.id];
  const match = agent.match || (kinds ? (r) => kinds.includes(r.kind) : null);
  if (!match) return null;
  return sorted.filter(match).slice(0, RECEIPT_LIMIT).map((r) => ({
    id: r.id,
    title: r.decision?.title || r.text?.slice(0, 90) || '(untitled)',
    status: r.status,
    at: r.filedAt || r.createdAt || null,
  }));
}

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

  // The per-agent tap-through detail (departments + last-5 receipt stubs)
  // rides this same /api/ops payload rather than a fetch-on-tap endpoint:
  // it is a few KB at most (22 agents x <=5 tiny stubs), it is computed from
  // records already in memory here, and — decisively — liveOps is one of the
  // client's cached offline slices, so tapping an agent keeps working on the
  // phone while the Mac sleeps. A per-agent endpoint would be lighter on the
  // wire and dead offline.
  const agents = SCHEDULED.map((a) => ({
    ...a,
    lastBeat: beats[a.id] || null,
    ...freshness(beats[a.id], now),
    departments: AGENT_DEPARTMENTS[a.id] || [],
    receipts: agentReceipts(sorted, a),
  }));

  const conversational = CONVERSATIONAL.map((a) => {
    const last = sorted.find(a.match);
    return {
      id: a.id, label: a.label, role: a.role,
      last: last ? { at: last.filedAt || last.createdAt, title: last.decision?.title || last.text?.slice(0, 60), status: last.status } : null,
      ...freshness(last ? (last.filedAt || last.createdAt) : null, now),
      departments: AGENT_DEPARTMENTS[a.id] || [],
      receipts: agentReceipts(sorted, a),
    };
  });

  // deterministic since-you-were-away counts for the wake debrief (LOCAL day)
  const pad = (n) => String(n).padStart(2, '0');
  const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const today = localDay(new Date().toISOString());
  const filedToday = records.filter((r) => r.status === 'filed' && r.filedAt && localDay(r.filedAt) === today).length;

  return { at: new Date(now).toISOString(), pending, running, filedToday, stream, agents, conversational };
}
