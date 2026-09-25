// THE ORG MAP'S VIEW MODEL — AGENT-WORLD-PLAN.md §3a-3d, step A.
//
// Seven districts (the departments in AGENT_DEPARTMENTS), nine beings (the
// department heads drawn in src/agentWorld/beings.js), and on each being
// only what the records and heartbeats already say:
//
//   working   a record of its kinds is mid-flight (status 'classifying'),
//             started within WORKING_MS. Older than that it is stuck, not
//             working, and the Guardian's watch is where stuck belongs.
//   waiting   its pending records: the thing waiting on him, and who asks.
//   fresh     the freshest heartbeat or record among the loops it stands
//             for: ran today, recent, gone quiet, or never run.
//
// Pure: the same records and roster in give the same map out. No model, no
// network, no clock but the `now` handed in. That is what lets looking at
// the map cost nothing (§5a), and server/test/agentWorldNoModel.test.js
// holds it there.

export const WORKING_MS = 30 * 60e3;

// The nine, in the character sheet's order, each with its district.
export const BEINGS = [
  { id: 'commander', name: 'Commander', district: 'logistics' },
  { id: 'coach', name: 'Coach', district: 'train' },
  { id: 'cfo', name: 'CFO', district: 'money' },
  { id: 'guardian', name: 'Guardian', district: 'platform' },
  { id: 'researcher', name: 'Researcher', district: 'knowledge' },
  { id: 'watcher', name: 'Watcher', district: 'knowledge' },
  { id: 'librarian', name: 'Librarian', district: 'knowledge' },
  { id: 'mealprep', name: 'Meal Prep', district: 'fuel' },
  { id: 'leader', name: 'Leader', district: 'mind' },
];

// The districts ARE the departments: `dept` is the name AGENT_DEPARTMENTS
// and the skills registry use, and the ops test cross-checks it.
export const DISTRICTS = [
  { id: 'train', name: 'Train', dept: 'Train' },
  { id: 'knowledge', name: 'Knowledge', dept: 'Knowledge' },
  { id: 'logistics', name: 'Logistics', dept: 'Logistics' },
  { id: 'fuel', name: 'Fuel', dept: 'Fuel' },
  { id: 'platform', name: 'Platform', dept: 'Platform' },
  { id: 'money', name: 'Money', dept: 'Money' },
  { id: 'mind', name: 'Mind', dept: 'Mind' },
];

// Which being stands for which loop. Every id on the scheduled roster and
// the conversational roster is here, or on 'core' (Nova itself, the centre
// of the map); orgMap.test.js fails the day a new loop arrives unplaced.
export const BEING_MEMBERS = {
  commander: ['dispatch', 'plan-today', 'reminders', 'followups', 'todoist', 'calendar-watch', 'brief-warm', 'commitments'],
  coach: ['coach', 'weekly-debrief', 'training-check', 'week-plan', 'healthinsight', 'coach-cadence', 'coach-reflection', 'exercise-videos', 'exercise-research', 'patterns-weekly'],
  cfo: ['money', 'cfo'],
  guardian: ['guardian', 'health-drops', 'compost', 'telegram', 'health-mirror', 'pattern-scout', 'autonomy', 'model-watch', 'forge', 'overnight'],
  researcher: ['researcher', 'pulse', 'study', 'scout', 'repertoire-topup'],
  watcher: ['watcher'],
  librarian: ['embeddings', 'distill', 'brain-week', 'read-next'],
  mealprep: ['food-suggest', 'mealprep'],
  leader: ['review', 'leader', 'leader-reminder'],
  core: ['voice'],
};

// Which being a RECORD belongs to, by its kind. Read off the kinds the
// inbox actually holds (25 Sep: 426 records, 37 kinds) and fleetContext's
// KIND_AGENT; orgMap.test.js pins every KIND_AGENT kind here or in
// UNFILED_KINDS, so a new kind cannot silently vanish from the map.
export const KIND_BEING = {
  dispatch: 'commander', 'plan-today': 'commander', followup: 'commander',
  coach: 'coach', 'coach-program': 'coach', 'coach-audit': 'coach', 'coach-review': 'coach', 'exercise-research': 'coach',
  program: 'coach', 'weekly-debrief': 'coach', 'week-plan': 'coach', 'training-check': 'coach',
  'food-suggestion': 'mealprep', 'meal-prep': 'mealprep', 'fuel-cross': 'mealprep',
  cfo: 'cfo', money: 'cfo', 'money-import': 'cfo',
  guardian: 'guardian', compost: 'guardian', pattern: 'guardian', autonomy: 'guardian',
  'model-choice': 'guardian', 'forge-job': 'guardian',
  research: 'researcher', study: 'researcher', paper: 'researcher', scout: 'researcher', repertoire: 'researcher',
  video: 'watcher',
  'read-next': 'librarian', 'index-repair': 'librarian', 'brain-week': 'librarian', distill: 'librarian', ingest: 'librarian',
  review: 'leader', 'leader-reflect': 'leader', 'leader-followup': 'leader',
  // Nova's own work and his own words: the core, not a department
  plan: 'core', act: 'core', browse: 'core', capture: 'core', intake: 'core', briefing: 'core',
};

// Kinds with no being yet, said out loud rather than hidden: the Builder and
// the Studio will stand on the Projects district when it is built.
export const UNFILED_KINDS = ['build', 'studio'];

const FRESH_RANK = { today: 3, recent: 2, stale: 1, never: 0 };

export function beingForRecord(r) {
  if (!r.kind) return 'core';                 // a raw capture, in his own words
  const b = KIND_BEING[r.kind];
  if (b) return b;
  return 'unfiled';
}

function titleOf(r) {
  return String(r.decision?.title || r.text || r.kind || '(untitled)').slice(0, 110);
}
function whenOf(r) { return r.filedAt || r.createdAt || null; }

// The headline, counted by code: who is asking, most first.
export function orgHeadline(beings, core) {
  const asking = beings.filter((b) => b.waiting > 0).sort((a, b) => b.waiting - a.waiting);
  const total = asking.reduce((n, b) => n + b.waiting, 0) + (core?.waiting || 0);
  if (!total) return 'Nothing is waiting on you.';
  const things = total === 1 ? 'One thing is' : `${total} things are`;
  if (!asking.length) return `${things} waiting on you, all of it yours to sort.`;
  const named = asking.slice(0, 2).map((b) => `the ${b.name} ${b.waiting}`);
  const rest = asking.length - named.length;
  const tail = rest > 0 ? `, and ${rest === 1 ? 'one other' : `${rest} others`}` : '';
  return `${things} waiting on you: ${named.join(', ')}${tail}.`;
}

// THE EVENTS the life engine acts out (AGENT-WORLD-PLAN §9d step 4): every
// record that was filed, discarded or approved in the last ten minutes, one
// event per status change, newest first. `answered` is his hand in it: a
// record with auto:false was filed or discarded because he said so (an
// autonomous filing carries auto:true); an approval is his hand by
// definition but is followed by its own filing, so it is not counted twice.
// The engine itself only plays an event under two minutes old; the wider
// window here is so a slow sync does not drop one on the floor.
export const EVENT_WINDOW_MS = 10 * 60e3;
export const EVENT_CAP = 40;
const EVENT_STAMPS = [['filed', 'filedAt'], ['discarded', 'discardedAt'], ['approved', 'approvedAt']];

export function orgEvents(records, now) {
  const out = [];
  for (const r of records) {
    if (!r?.id) continue;
    for (const [status, field] of EVENT_STAMPS) {
      const at = r[field];
      if (!at) continue;
      const age = now - new Date(at).getTime();
      if (!(age >= 0 && age <= EVENT_WINDOW_MS)) continue;
      out.push({
        id: `${r.id}:${status}`, at, source: 'record', being: beingForRecord(r),
        kind: r.kind || 'capture', status, answered: r.auto === false && status !== 'approved',
      });
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, EVENT_CAP);
}

// `filedToday` is the count composeOps already makes for the wake debrief
// (records filed on the server's local day). It is the only receipt count
// the payload carries, so it is the one the Money stack may grow with;
// without it the stack stays a fixed short one and says no number at all.
export function composeOrgMap({ agents = [], conversational = [], records = [], now = Date.now(), filedToday = null } = {}) {
  const roster = new Map([...agents, ...conversational].map((a) => [a.id, a]));
  const byBeing = new Map([...BEINGS.map((b) => [b.id, []]), ['core', []], ['unfiled', []]]);
  for (const r of records) byBeing.get(beingForRecord(r))?.push(r);

  const beings = BEINGS.map((b) => {
    const mine = byBeing.get(b.id);
    const pending = mine.filter((r) => r.status === 'pending')
      .sort((x, y) => String(whenOf(y)).localeCompare(String(whenOf(x))));
    const working = mine.some((r) => r.status === 'classifying' && r.createdAt
      && now - new Date(r.createdAt).getTime() < WORKING_MS);
    const members = (BEING_MEMBERS[b.id] || []).map((id) => {
      const a = roster.get(id);
      // the loop's own last word beats a bare timestamp; a scheduled agent's
      // note carries its own `at` (when it was said), which may differ from
      // the beat itself — a stalled note about an old run still ages by then
      const last = a?.lastNote?.note
        ? { note: a.lastNote.note, at: a.lastNote.at || null }
        : (a?.lastBeat || a?.last?.at)
          ? { note: null, at: a.lastBeat || a.last.at }
          : null;
      return {
        id, label: a?.label || id, role: a?.role || null,
        state: a?.state || 'never', stateLabel: a?.stateLabel || 'never run',
        last,
      };
    });
    const fresh = members.reduce((best, m) => (FRESH_RANK[m.state] > FRESH_RANK[best] ? m.state : best), 'never');
    const last = mine.filter((r) => r.status !== 'pending')
      .sort((x, y) => String(whenOf(y)).localeCompare(String(whenOf(x))))[0];
    return {
      id: b.id, name: b.name, district: b.district,
      working, fresh,
      waiting: pending.length,
      unseen: pending.filter((r) => !r.seenAt).length,
      asks: pending.slice(0, 3).map((r) => ({ id: r.id, title: titleOf(r), kind: r.kind || 'capture', at: whenOf(r) })),
      last: last ? { title: titleOf(last), status: last.status, at: whenOf(last) } : null,
      members,
    };
  });

  const pendingOf = (id) => byBeing.get(id).filter((r) => r.status === 'pending');
  const core = { waiting: pendingOf('core').length, asks: pendingOf('core').slice(0, 3).map((r) => ({ id: r.id, title: titleOf(r), at: whenOf(r) })) };
  const unfiled = { waiting: pendingOf('unfiled').length, kinds: [...new Set(byBeing.get('unfiled').map((r) => r.kind))].sort() };

  const districts = DISTRICTS.map((d) => ({
    ...d,
    beings: beings.filter((b) => b.district === d.id).map((b) => b.id),
    waiting: beings.filter((b) => b.district === d.id).reduce((n, b) => n + b.waiting, 0),
  }));

  return {
    at: new Date(now).toISOString(),
    headline: orgHeadline(beings, core),
    waitingTotal: beings.reduce((n, b) => n + b.waiting, 0) + core.waiting + unfiled.waiting,
    districts, beings, core, unfiled,
    events: orgEvents(records, now),
    receipts: Number.isFinite(filedToday) ? filedToday : null,
  };
}
