// THE WALL'S AGENTS (mockup 86, blend 1 "Hands up", his pick of 9 Oct 2026).
//
// At rest the wall is A: the time, the core, one gold number. The agents
// come onto it only when a record gives them a reason. Everything here is
// read, never made up, from the two sources the rest of Nova already uses:
//
//   who waits, and what they ask   the Org map's own reading (ops.orgMap,
//                                  composed by server/lib/orgMap.js) through
//                                  valsOrgMap's waitingBeings / beingAsks, so
//                                  the wall and the Org map cannot disagree
//   who is working right now       workingBeingIds (src/vals/agentsWorking.js),
//                                  the one source every "working" surface reads
//   faces and hues                 src/agentWorld/beings.js (BEING_HUES) and
//                                  the still portraits in public/agents/
//
// No signal (no ops slice, or offline) says so and shows nobody: a dead
// backend never looks like a clear board. Demo has no agents and says the
// same. Every sentence is composed here by code from the counts.
import { BEINGS } from '../../server/lib/orgMap.js';
import { BEING_HUES, HUE_VAR } from '../agentWorld/beings.js';
import { waitingBeings, beingAsks, beingLine, DISTRICT_NAME } from './valsOrgMap.js';
import { workingBeingIds } from './agentsWorking.js';

const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const numWord = (n) => NUM[n] || String(n);
const the = (name) => `the ${name}`;
export function andJoin(a) {
  if (a.length < 2) return a.join('');
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// '12m' → '12 min ago', '2h' → '2 h ago', 'now' → 'just now'
export function agoWords(w) {
  if (!w) return '';
  if (w === 'now') return 'just now';
  const m = /^(\d+)([mhd])$/.exec(w);
  if (!m) return w;
  return `${m[1]} ${{ m: 'min', h: 'h', d: 'd' }[m[2]]} ago`;
}

// how far a quiet being recedes, by the freshness of its loops (valsOrgMap's rule)
const DIM = { today: 0, recent: 0, stale: 0.35, never: 0.62 };

function look(id) {
  const h = BEING_HUES[id] || { hue: 'cy', accent: 'gold' };
  return {
    hue: `var(${HUE_VAR[h.hue] || '--nv-cy'})`,
    accent: `var(${HUE_VAR[h.accent] || '--nv-gold'})`,
    face: `${import.meta.env?.BASE_URL || '/'}agents/${id}.png`,
  };
}

// The names line under the count: who is asking, most first.
export function whoLine(w) {
  if (w.demo) return 'Demo mode has no agents to read';
  if (!w.signal) return w.syncMin != null ? `No signal from the Mac · last synced ${w.syncMin} min ago` : 'No signal from the Mac';
  const names = w.waiting.map((b) => the(b.name));
  if (w.yours) names.push('your own notes');
  if (w.unfiled) names.push(`${w.unfiled.n} with no one on the map yet`);
  if (!names.length) return 'Nothing waits on you';
  const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} others`] : names;
  return cap(andJoin(shown));
}

// The sheet's sentence.
export function sayLine(w) {
  if (w.demo) return 'Demo mode has no agents, so nobody\'s asks can be read.';
  if (!w.signal) return 'Nova cannot reach the Mac, so nobody\'s asks can be read.';
  if (!w.total) return 'Nothing is waiting on you.';
  const parts = w.waiting.map((b) => ({ n: b.n, from: `from ${the(b.name)}` }));
  if (w.yours) parts.push({ n: w.yours.n, from: 'of your own to sort' });
  if (w.unfiled) parts.push({ n: w.unfiled.n, from: 'with no one on the map yet' });
  if (parts.length === 1 && w.waiting.length === 1) {
    const b = w.waiting[0];
    return `The ${b.name} is asking you ${b.n === 1 ? 'one thing' : `${numWord(b.n).toLowerCase()} things`}.`;
  }
  if (parts.length === 1) return `${w.total === 1 ? 'One thing waits' : `${numWord(w.total)} things wait`} on you, ${parts[0].from.replace(/^from /, '')}.`;
  return `${numWord(w.total)} things wait on you: ${andJoin(parts.map((p) => `${p.n} ${p.from}`))}.`;
}

export function workLine(w) {
  if (!w.signal || !w.working.length) return '';
  return `Working now: ${andJoin(w.working.map((b) => the(b.name)))}`;
}

// The whole reading. `st` is the app state (for the working tells), `ops`
// the ops slice, `syncMin` the minutes since the last sync.
export function wallAgents({ ops, st = {}, demoMode = false, isOffline = false, syncMin = null, now = Date.now() }) {
  const signal = !!ops && !demoMode && !isOffline;
  const m = signal ? ops.orgMap || null : null;
  const workingIds = signal ? workingBeingIds(st, now) : new Set();

  const waiting = waitingBeings(m).map((b) => {
    const { asks, more } = beingAsks(b, now);
    return {
      id: b.id, name: b.name, district: DISTRICT_NAME[b.district] || b.district, n: b.waiting, ...look(b.id),
      asks: asks.map((a) => ({ ...a, when: agoWords(a.when) })), more,
      line: beingLine({ ...b, working: workingIds.has(b.id) }),
    };
  });
  const yours = m?.core?.waiting ? {
    n: m.core.waiting,
    asks: beingAsks({ waiting: m.core.waiting, asks: m.core.asks }, now).asks.map((a) => ({ ...a, when: agoWords(a.when) })),
  } : null;
  const unfiled = m?.unfiled?.waiting ? { n: m.unfiled.waiting, kinds: m.unfiled.kinds || [] } : null;

  // the gold number: the Org map's own total when the map rode in; the ops
  // count otherwise (the same pending records, server/lib/ops.js)
  const total = !signal ? null : m ? m.waitingTotal : (ops.pending ?? 0);

  const working = BEINGS.filter((b) => workingIds.has(b.id)).map((b) => ({ id: b.id, name: b.name, ...look(b.id) }));
  const byId = new Map((m?.beings || []).map((b) => [b.id, b]));
  const all = BEINGS.map((b) => {
    const o = byId.get(b.id);
    const n = o?.waiting || 0;
    const isWorking = workingIds.has(b.id);
    const fresh = o?.fresh || 'never';
    const line = !signal ? 'Unknown until the Mac answers.'
      : o ? beingLine({ ...o, working: isWorking }) : 'Unknown until the map arrives.';
    return {
      id: b.id, name: b.name, district: DISTRICT_NAME[b.district] || b.district, ...look(b.id),
      n, working: isWorking, line,
      opacity: !signal ? 0.4 : n || isWorking ? 1 : 1 - (DIM[fresh] ?? 0),
    };
  });

  const w = { signal, demo: !!demoMode, total, waiting, yours, unfiled, working, all, syncMin };
  // the Mac's preview under the count: the first two asks with their being
  const rows = [];
  for (const b of waiting) for (const a of b.asks) rows.push({ id: a.id, title: a.title, being: { id: b.id, name: b.name, face: b.face, hue: b.hue } });
  const preview = rows.slice(0, 2);
  return {
    ...w,
    whoLine: whoLine(w),
    sayLine: sayLine(w),
    workLine: workLine(w),
    preview,
    previewRest: signal && total ? Math.max(0, total - preview.length) : 0,
  };
}
