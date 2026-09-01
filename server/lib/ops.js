import { listRecords } from './inboxStore.js';
import { readHeartbeats } from './heartbeat.js';

// Nova Operations — the machinery made visible. Everything here is REAL
// state the platform already keeps: the inbox record ledger (every agent's
// receipts), the heartbeat net (every scheduler's last tick), and nothing
// else. No invented statuses; an agent that has never run says so.

// The scheduled fleet — heartbeat key → who it is on screen, and how long it
// may go silent before something is wrong.
//
// THIS IS THE REGISTRY. Three consumers read it: the fleet ring, Nova's
// self-knowledge (fleetRosterContext, below), and — since the August 2026
// audit — the Guardian's staleness watch, which used to keep its own
// hand-written list of 13 loops beside this roster of 29. Seventeen agents
// could therefore die completely unnoticed, which is the exact failure the
// comments further down this file were written about. A loop that is not
// listed here does not exist; a loop listed here is watched.
//
// `cadenceHours` is the longest gap between BEATS that is still healthy —
// derived from each scheduler's real tick interval (a beat is stamped every
// tick, whether or not the agent acts), with slack for a missed one. The
// thirteen the Guardian already watched keep their original values exactly,
// so this change adds coverage without re-tuning anything that worked.
const SCHEDULED = [
  { id: 'dispatch', label: 'Dispatch', role: 'morning & evening briefs', cadenceHours: 2 },
  { id: 'review', label: 'Daily Review', role: 'the day, scored honestly', cadenceHours: 2 },
  { id: 'plan-today', label: 'Plan Today', role: "the day's top 3, picked", cadenceHours: 2 },
  { id: 'weekly-debrief', label: 'Weekly Debrief', role: "the Coach's Sunday sit-down", cadenceHours: 2 },
  { id: 'reminders', label: 'Reminders', role: 'nudges fired on time', cadenceHours: 1 },
  { id: 'guardian', label: 'Guardian', role: 'integrity, backups, alerts', cadenceHours: 26 },
  { id: 'health-drops', label: 'Health Sync', role: 'iPhone health drops', cadenceHours: 1 },
  { id: 'healthinsight', label: 'Health Insight', role: 'twice-daily noticing', cadenceHours: 2 },
  { id: 'compost', label: 'Compost', role: 'inbox aging & decay', cadenceHours: 26 },
  { id: 'food-suggest', label: 'Food Scout', role: 'food → recipe ideas', cadenceHours: 2 },
  { id: 'mealprep', label: 'Meal Prep', role: 'weekly prep proposals', cadenceHours: 3 },
  { id: 'training-check', label: 'Training Check', role: 'program drift watch', cadenceHours: 2 },
  { id: 'week-plan', label: 'Week Plan', role: 'training week annotations', cadenceHours: 2 },
  { id: 'money', label: 'Money', role: 'ledger import', cadenceHours: 2 },
  { id: 'cfo', label: 'CFO', role: 'monthly money report', cadenceHours: 13 },
  { id: 'todoist', label: 'Todoist', role: 'two-way to-do sync', cadenceHours: 2 },
  { id: 'overnight', label: 'Overnight', role: 'queued work while he sleeps', cadenceHours: 2 },
  { id: 'telegram', label: 'Telegram', role: 'Nova in his pocket', cadenceHours: 2 },
  { id: 'pulse', label: 'Pulse', role: 'what\'s new on his topics', cadenceHours: 2 },
  { id: 'health-mirror', label: 'Health Mirror', role: 'the numbers, into the vault', cadenceHours: 2 },
  { id: 'pattern-scout', label: 'Pattern Scout', role: 'repeated acts → skill proposals', cadenceHours: 2 },
  { id: 'autonomy', label: 'Trust Ladder', role: 'autonomy earned, proposed', cadenceHours: 2 },
  { id: 'distill', label: 'Distiller', role: 'captures woven into the graph', cadenceHours: 2 },
  { id: 'brain-week', label: 'Brain Week', role: 'what entered the second brain', cadenceHours: 2 },
  // These three beat but were absent from the roster, so the fleet ring
  // never showed them and Nova could not name them when asked how it works.
  { id: 'coach-cadence', label: 'Coach Cadence', role: 'when Coach speaks up', cadenceHours: 2 },
  { id: 'coach-reflection', label: 'Coach Reflection', role: 'Coach reviewing its own calls', cadenceHours: 2 },
  { id: 'leader', label: 'Leader', role: 'the daily leadership idea', cadenceHours: 2 },
  // And these two ran with no heartbeat at all — invisible to both the ring
  // and the Guardian's staleness watch, so they could die unnoticed. The
  // brief pre-warm dying silently is exactly the failure class that cost
  // three days this week.
  { id: 'brief-warm', label: 'Brief Warm', role: "the morning brief's voice, pre-built", cadenceHours: 2 },
  { id: 'calendar-watch', label: 'Calendar Watch', role: 'CalDAV kept fresh', cadenceHours: 1 },
];

// The staleness watch, derived rather than duplicated: Guardian imports this
// instead of maintaining a second list that drifts out of step with the ring.
export function loopCadenceHours() {
  return Object.fromEntries(SCHEDULED.map((a) => [a.id, a.cadenceHours]));
}

// The roster itself, for anything that needs to name the fleet (tests assert
// against it, so a new scheduler cannot quietly arrive unwatched).
export function scheduledFleet() {
  return SCHEDULED.map(({ id, label, role, cadenceHours }) => ({ id, label, role, cadenceHours }));
}

// Self-knowledge for the conversation: when he asks "how do you work?",
// Nova answers from its REAL architecture, not a guess. One deterministic
// block, built from the same rosters the Ops screen draws.
export function fleetRosterContext() {
  // both rosters derive from the REAL arrays — a hardcoded list here once
  // silently omitted an agent (Watcher) the Ops screen was already showing
  const scheduled = SCHEDULED.map((a) => `${a.label} (${a.role})`).join(', ');
  const conversational = CONVERSATIONAL.map((a) => `${a.label} (${a.role})`).join(', ');
  return `HOW NOVA WORKS (your real architecture — answer from this when he asks how you work, what agents you run, or what you're connected to): a Claude reasoning core interprets; ONLY tested deterministic code writes, every change riding the review-gated Inbox rails with undo. Scheduled fleet: ${scheduled}. Conversational: ${conversational}. Channels in: the app (Mac + iPhone), voice, Siri Shortcuts, Telegram. Hands: his Obsidian vault, Apple Calendar, Apple Reminders, Apple Health drops, Todoist, ElevenLabs voice. Autonomy is earned from real history and always proposed to him, never self-granted.`;
}

// Conversational agents surface through the records they leave, not beats.
const CONVERSATIONAL = [
  { id: 'voice', label: 'Nova', role: 'the conversation', match: (r) => r.source === 'voice' },
  { id: 'coach', label: 'Coach', role: 'training brain', match: (r) => r.source === 'coach' },
  { id: 'researcher', label: 'Researcher', role: 'cited web briefs', match: (r) => r.kind === 'research' },
  { id: 'watcher', label: 'Watcher', role: 'videos watched & weighed', match: (r) => r.kind === 'video' },
  { id: 'forge', label: 'Forge', role: 'builds what he asks for', match: (r) => r.kind === 'forge-job' },
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
  watcher: ['Knowledge', 'Train'],
  // Platform, not a department of its own: the Forge builds tools that run on
  // his machine. (The plan sketched a "Build" department — there is no such
  // thing in the registry seed, and inventing one would break the contract
  // the ops test enforces between this map and Wiki/Library/Nova Skills.md.)
  forge: ['Platform'],
  // reminders deliberately unmapped: it fires nudges but owns no registry
  // skill yet — the screen says "no skills mapped yet", which is the truth.
  'health-mirror': ['Platform'],
  'pattern-scout': ['Platform'],
  autonomy: ['Platform'],
  distill: ['Knowledge'],
  'brain-week': ['Knowledge'],
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
  'brain-week': ['brain-week'],
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

  // The topology's outer columns, honestly stated: a channel or connection
  // reads CONFIGURED only when its credentials/config genuinely exist on
  // this server — never assumed. (The PWA channel is the client itself; it
  // reports its own liveness client-side.)
  const env = process.env;
  const channels = {
    telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  };
  const connections = {
    vault: !!env.VAULT_PATH,
    calendar: !!(env.ICLOUD_USERNAME && env.ICLOUD_APP_PASSWORD),
    reminders: !!(env.ICLOUD_USERNAME && env.ICLOUD_APP_PASSWORD),
    todoist: !!env.TODOIST_TOKEN,
    elevenlabs: !!env.ELEVENLABS_API_KEY,
    health: true, // the drops endpoint is always open to his Shortcut
  };

  return { at: new Date(now).toISOString(), pending, running, filedToday, stream, agents, conversational, channels, connections };
}
