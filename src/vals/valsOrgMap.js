// THE ORG MAP, as the screen draws it (AGENT-WORLD-PLAN §3). Everything here
// came from /api/ops → orgMap, which the server composed from records and
// heartbeats; this file only arranges it. No model, no fetch: looking at the
// map costs nothing (§5a, held by server/test/agentWorldNoModel.test.js).

const DISTRICT_NAME = { train: 'Train', knowledge: 'Knowledge', logistics: 'Logistics', fuel: 'Fuel', platform: 'Platform', money: 'Money', mind: 'Mind' };

function ago(iso, now) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function localDay(ms) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

// One line that says what a being is doing, from its state alone.
export function beingLine(b) {
  if (b.working && b.workingMode === 'scene') return 'In a scene with you now, playing the other person.';
  if (b.working && b.workingMode === 'prepare') return 'Preparing a practice page.';
  if (b.working) return 'Working now.';
  if (b.waiting > 0) {
    const n = b.waiting === 1 ? 'One thing' : `${COUNT[b.waiting] || b.waiting} things`;
    const fresh = b.unseen > 0 && b.unseen < b.waiting ? `, ${b.unseen} new` : '';
    return `${n} waiting on you${fresh}.`;
  }
  if (b.fresh === 'today') return 'Quiet. Its loops ran today.';
  if (b.fresh === 'recent') return 'Quiet. Its loops ran in the last two days.';
  if (b.fresh === 'stale') return 'Gone quiet. Its loops have not run for days.';
  return 'Has never run.';
}

// How the loops a being stands for are doing, counted.
export function loopsLine(members) {
  if (!members?.length) return null;
  const quiet = members.filter((m) => m.state === 'stale').length;
  const never = members.filter((m) => m.state === 'never').length;
  const n = members.length;
  const head = n === 1 ? 'Stands for one loop' : `Stands for ${n} loops`;
  if (!quiet && !never) return `${head}, all running.`;
  const parts = [];
  if (quiet) parts.push(`${quiet} gone quiet`);
  if (never) parts.push(`${never} never run`);
  return `${head}: ${parts.join(', ')}.`;
}

// The being's loops as their own rows: the ones that need him — stale, then
// never run — surface first, today's quiet successes last. Each row carries
// its own last word: the loop's own note if it left one, else how long ago
// it last beat, else nothing said.
const LOOP_RANK = { stale: 0, never: 0, today: 1, recent: 2 };
export function loopList(members, now) {
  if (!members?.length) return [];
  return [...members]
    .sort((a, b) => (LOOP_RANK[a.state] ?? 1) - (LOOP_RANK[b.state] ?? 1))
    .map((m) => ({
      id: m.id, label: m.label, role: m.role, state: m.state, stateLabel: m.stateLabel,
      last: m.last?.note || (m.last?.at ? `${ago(m.last.at, now)} ago` : null),
    }));
}

export function valsOrgMap(ops, app, ctx) {
  const m = ops?.orgMap;
  if (ctx.demoMode) return { live: false, line: 'The Org Map is drawn from the real records, so it needs the Mac.' };
  if (!ops) return { live: false, line: null };
  if (!m) return { live: false, line: 'The map arrives with the next sync.' };
  const now = Date.now();
  const selectedId = app.state.orgMapSelected || null;

  const beings = m.beings.map((b) => ({
    id: b.id,
    name: b.name,
    district: b.district,
    pose: b.working ? 'work' : 'wait',
    waiting: b.waiting,
    // how far a being recedes: a loop gone quiet dims, one never run is
    // nearly a silhouette. Honest degradation, drawn.
    dim: b.working || b.waiting ? 0 : b.fresh === 'stale' ? 0.35 : b.fresh === 'never' ? 0.62 : 0,
    // what the life engine reads (§9d input.beings): the record's facts,
    // never anything the scene made up
    working: !!b.working,
    // which working tell is true (Practice: 'scene' or 'prepare'), or null
    workingMode: b.workingMode || null,
    fresh: b.fresh,
    members: (b.members || []).map((x) => ({ id: x.id, state: x.state })),
  }));

  const card = (() => {
    if (!selectedId) return null;
    if (selectedId === 'core') {
      return {
        id: 'core', name: 'Nova', district: 'The core',
        line: m.core.waiting ? `${COUNT[m.core.waiting] || m.core.waiting} of your own notes waiting to be sorted.` : 'Nothing of yours waiting to be sorted.',
        asks: m.core.asks.map((a) => ({ id: a.id, title: a.title, when: ago(a.at, now) })),
        last: null, loops: null, loopList: [],
      };
    }
    const b = m.beings.find((x) => x.id === selectedId);
    if (!b) return null;
    return {
      id: b.id, name: b.name, district: DISTRICT_NAME[b.district] || b.district,
      line: beingLine(b),
      asks: b.asks.map((a) => ({ id: a.id, title: a.title, when: ago(a.at, now) })),
      more: b.waiting > b.asks.length ? b.waiting - b.asks.length : 0,
      last: b.last ? { title: b.last.title, status: b.last.status, when: ago(b.last.at, now) } : null,
      loops: loopsLine(b.members),
      loopList: loopList(b.members, now),
    };
  })();

  return {
    live: true,
    headline: m.headline,
    waitingTotal: m.waitingTotal,
    beings,
    core: { waiting: m.core.waiting },
    unfiledLine: m.unfiled?.waiting
      ? `${m.unfiled.waiting} more from ${m.unfiled.kinds.join(', ')}, which have no one on the map yet.`
      : null,
    selectedId,
    card,
    // the life engine's other inputs: the ops stream's record events, the
    // day it is seeded from (this device's local date, so two devices open
    // on the same day show the same scene), and the receipt count for the
    // Money stack, or null when the payload has none (never a made-up one)
    events: m.events || [],
    seed: localDay(now),
    receipts: Number.isFinite(m.receipts) ? m.receipts : null,
    select: (id) => app.setState({ orgMapSelected: id === selectedId ? null : id }),
    close: () => app.setState({ orgMapSelected: null }),
    openInbox: () => app.navigate('inbox'),
  };
}
