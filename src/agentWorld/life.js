// THE LIFE ENGINE — AGENT-WORLD-PLAN.md §9d. A pure, seeded state machine
// that decides what each of the ten beings is doing on the Org Map: no
// model, no network, no clock of its own (only `input.now`, handed in).
// Self-contained on purpose (no imports at all, not even from orgMap.js or
// streamFeed.js) so `agentWorldNoModel.test.js` can prove, by reading this
// file alone, that looking at the map never reaches a model or the network
// (§9a rule 1: "zero tokens, held by the test").
//
// `stepLife(prev, input) -> next` is a reducer, not a random walk: same
// seed + same input sequence => same output sequence, always (§9d,
// "Deterministic"). The only randomness is a tiny seeded PRNG (mulberry32,
// reseeded every minute from `seed + ':' + minute`) whose state travels in
// `next.rng` — nothing is ever read from `Math.random()`, `Date.now()` or
// anywhere outside `prev`/`input`.

// ---------------------------------------------------------------------------
// A tiny seeded PRNG. xmur3 turns a string into a 32-bit seed; mulberry32
// turns a 32-bit integer state into a stream of [0,1) draws, one integer
// step at a time, so the "state" that must travel between calls is a single
// plain number (JSON-serialisable, no closures).

function xmur3Seed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

// One mulberry32 draw: given the current 32-bit state, returns the next
// state (which IS the value to persist) and a float in [0, 1).
function mulberry32Draw(state) {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState: a };
}

function minuteKeyOf(nowMs) {
  return Math.floor(nowMs / 60000);
}

// Builds a little "draw" function closed over a mutable local state
// variable (mutating a LOCAL variable, never `prev`/`input`), and returns
// both the function and a getter for the final state so the caller can
// stash it back onto `next.rng` when the step is done.
function makeRng(prevRng, nowMs, seed) {
  const minute = minuteKeyOf(nowMs);
  let state = prevRng && prevRng.minute === minute
    ? prevRng.state
    : xmur3Seed(`${seed}:${minute}`);
  function rand() {
    const { value, nextState } = mulberry32Draw(state);
    state = nextState;
    return value;
  }
  function randInt(min, max) {
    if (max <= min) return min;
    return min + Math.floor(rand() * (max - min + 1));
  }
  // Weighted pick from [{ name, weight }]. Assumes total weight > 0.
  function pickWeighted(options) {
    const total = options.reduce((n, o) => n + o.weight, 0);
    let r = rand() * total;
    for (const o of options) {
      r -= o.weight;
      if (r <= 0) return o.name;
    }
    return options[options.length - 1].name;
  }
  return { rand, randInt, pickWeighted, getState: () => ({ minute, state }) };
}

// ---------------------------------------------------------------------------
// Static geography (kept in sync with server/lib/orgMap.js by hand — this
// file may import nothing, per the zero-token test, so the ten ids and
// seven districts are inlined here).

export const BEING_IDS = [
  'commander', 'coach', 'cfo', 'guardian', 'researcher',
  'watcher', 'librarian', 'mealprep', 'leader', 'practice',
];

const DISTRICT_OF = {
  commander: 'logistics', coach: 'train', cfo: 'money', guardian: 'platform',
  researcher: 'knowledge', watcher: 'knowledge', librarian: 'knowledge',
  mealprep: 'fuel', leader: 'mind', practice: 'mind',
};

// The ring order the visit/patrol geometry walks, per §9b/§9d.
export const RING_ORDER = ['knowledge', 'mind', 'logistics', 'train', 'fuel', 'money', 'platform'];

const DISTRICT_BEINGS = RING_ORDER.reduce((m, d) => {
  m[d] = BEING_IDS.filter((id) => DISTRICT_OF[id] === d);
  return m;
}, {});

// ---------------------------------------------------------------------------
// The working tells (§9a rule 2). These never appear in the idle catalogue
// as playable idle acts — `isForbiddenIdle` is the guard the test holds.
// Practice has two, each tied to its own real state: the worried mask lifted
// to play the other person while a scene is live, and the cue card read and
// turned over while a page is being prepared.
export const WORKING_TELLS = [
  'curl', 'page-turn', 'coin-flip', 'stir', 'drawer', 'nod', 'lantern-raise', 'scanline', 'compass-heading',
  'mask-up', 'card-turn',
];

export function isForbiddenIdle(name) {
  return WORKING_TELLS.includes(name);
}

// ---------------------------------------------------------------------------
// ACTS — the catalogue, as data. One entry per act name.
//
// A note on two ambiguities in §9d's table, resolved here (see also the
// handback report):
//   - "sit-bench" appears in BOTH Coach's and Leader's rows, at the same
//     weight (2). Rather than invent two different acts, `beings` lists
//     both ids: one shared act, same weight for each.
//   - "stretch" is both one of Coach's four weighted idle acts (weight 2,
//     "arms up") AND the universal once-per-dawn act every being performs
//     (§9d precedence step 5). One ACTS entry (`beings: '*'`) serves both:
//     Coach's normal weighted idle rotation includes it (see
//     BEING_IDLE_TABLE below), and the dawn trigger plays it for anyone,
//     bypassing the weighted table entirely.
const HOLD_MS = [1000, 4000]; // "hold one act 1-4s" (§9d step 6)
const REST_MS = [20000, 90000]; // "then rest 20-90s" (§9d step 6)

function act(name, fields) {
  return { name, beings: '*', kind: 'idle', durationMs: HOLD_MS, weight: 1, moves: [], tell: false, ...fields };
}

export const ACTS = {
  // --- universal acts -------------------------------------------------
  rest: act('rest', { durationMs: REST_MS, moves: [] }),
  wait: act('wait', { kind: 'wait', durationMs: [5000, 15000], moves: ['body'] }),
  'glance-marker': act('glance-marker', { kind: 'wait', durationMs: [1000, 2000], moves: ['head'] }),
  sigh: act('sigh', { kind: 'wait', durationMs: [1000, 2000], moves: ['body'] }),
  sleep: act('sleep', { kind: 'sleep', durationMs: REST_MS, moves: [] }),
  // Coach's table weight (2); also the universal once-a-day dawn act.
  stretch: act('stretch', { durationMs: HOLD_MS, weight: 2, moves: ['arms'] }),
  work: act('work', { kind: 'work', durationMs: [5000, 20000], moves: ['body'] }),
  deliver: act('deliver', { kind: 'event', durationMs: [44000, 44000], moves: ['body'] }),
  patrol: act('patrol', { kind: 'event', durationMs: [120000, 120000], moves: ['prop:lantern'] }),
  thanks: act('thanks', { kind: 'event', durationMs: [2000, 2000], moves: ['head'] }),
  'visit-walk': act('visit-walk', { kind: 'visit', durationMs: [12000, 12000], moves: ['body'] }),
  'visit-face': act('visit-face', { kind: 'visit', durationMs: [2000, 2000], moves: ['head'] }),
  'visit-nod': act('visit-nod', { kind: 'visit', durationMs: [3000, 3000], moves: ['head'] }),

  // --- Commander (logistics · cyan) -----------------------------------
  'scan-horizon': act('scan-horizon', { beings: ['commander'], weight: 3, moves: ['head'] }),
  'check-compass': act('check-compass', { beings: ['commander'], weight: 2, moves: ['prop:compass'] }),
  pace: act('pace', { beings: ['commander', 'practice'], weight: 2, moves: ['body'] }),
  'at-ease': act('at-ease', { beings: ['commander'], weight: 3, moves: ['arms'] }),
  'gag:commander': act('gag:commander', { beings: ['commander'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['arms'] }),

  // --- Coach (train · coral) -------------------------------------------
  'chalk-hands': act('chalk-hands', { beings: ['coach'], weight: 3, moves: ['arms'] }),
  'sit-bench': act('sit-bench', { beings: ['coach', 'leader'], weight: 2, moves: ['body'] }),
  'tap-racked-bar': act('tap-racked-bar', { beings: ['coach'], weight: 1, moves: ['arms', 'prop:bar'] }),
  'gag:coach': act('gag:coach', { beings: ['coach'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['arms'] }),

  // --- CFO (money · good-green) -----------------------------------------
  'stack-chip': act('stack-chip', { beings: ['cfo'], weight: 3, moves: ['arms', 'prop:chip'] }),
  'fix-bowtie': act('fix-bowtie', { beings: ['cfo'], weight: 2, moves: ['arms'] }),
  'close-ledger': act('close-ledger', { beings: ['cfo'], weight: 1, moves: ['arms', 'prop:ledger'] }),
  'look-at-safe': act('look-at-safe', { beings: ['cfo'], weight: 2, moves: ['head'] }),
  'gag:cfo': act('gag:cfo', { beings: ['cfo'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['arms'] }),

  // --- Guardian (platform · violet) --------------------------------------
  'stand-watch': act('stand-watch', { beings: ['guardian'], weight: 4, moves: ['prop:lantern'] }),
  'turn-to-district': act('turn-to-district', { beings: ['guardian'], weight: 2, moves: ['body'] }),
  'polish-shield': act('polish-shield', { beings: ['guardian'], weight: 1, moves: ['arms', 'prop:shield'] }),
  'gag:guardian': act('gag:guardian', { beings: ['guardian'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['prop:lantern'] }),

  // --- Researcher (knowledge · quads blue) -------------------------------
  'close-book': act('close-book', { beings: ['researcher'], weight: 2, moves: ['arms', 'prop:book'] }),
  'look-up': act('look-up', { beings: ['researcher'], weight: 3, moves: ['head'] }),
  scribble: act('scribble', { beings: ['researcher'], weight: 2, moves: ['arms', 'prop:satchel'] }),
  'adjust-lens': act('adjust-lens', { beings: ['researcher'], weight: 1, moves: ['head', 'prop:lens'] }),
  'gag:researcher': act('gag:researcher', { beings: ['researcher'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['arms', 'prop:book'] }),

  // --- Watcher (knowledge · ice-blue) -------------------------------------
  'toss-popcorn': act('toss-popcorn', { beings: ['watcher'], weight: 3, moves: ['arms', 'prop:popcorn'] }),
  'lean-back': act('lean-back', { beings: ['watcher'], weight: 2, moves: ['body'] }),
  'headphones-off-on': act('headphones-off-on', { beings: ['watcher'], weight: 1, moves: ['head', 'prop:headphones'] }),
  'tap-foot': act('tap-foot', { beings: ['watcher'], weight: 2, moves: ['body'] }),
  'gag:watcher': act('gag:watcher', { beings: ['watcher'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['arms', 'prop:popcorn'], carry: 'popcorn' }),

  // --- Librarian (knowledge · teal) ---------------------------------------
  'shut-drawer': act('shut-drawer', { beings: ['librarian'], weight: 2, moves: ['arms', 'prop:drawer'] }),
  'align-books': act('align-books', { beings: ['librarian'], weight: 2, moves: ['arms'] }),
  'dust-shelf': act('dust-shelf', { beings: ['librarian'], weight: 2, moves: ['arms'] }),
  'adjust-spectacles': act('adjust-spectacles', { beings: ['librarian'], weight: 1, moves: ['head'] }),
  'gag:librarian': act('gag:librarian', { beings: ['librarian'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['arms', 'prop:card'] }),

  // --- Meal Prep (fuel · amber) --------------------------------------------
  'taste-ladle': act('taste-ladle', { beings: ['mealprep'], weight: 3, moves: ['arms', 'prop:ladle'] }),
  'wipe-counter': act('wipe-counter', { beings: ['mealprep'], weight: 2, moves: ['arms'] }),
  'check-crate': act('check-crate', { beings: ['mealprep'], weight: 2, moves: ['body'] }),
  sway: act('sway', { beings: ['mealprep', 'practice'], weight: 1, moves: ['body'] }),
  'gag:mealprep': act('gag:mealprep', { beings: ['mealprep'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['arms', 'prop:bowl'], carry: 'bowl' }),

  // --- Leader (mind · magenta) ---------------------------------------------
  'look-at-water': act('look-at-water', { beings: ['leader', 'practice'], weight: 3, moves: ['head'] }),
  'walk-to-lantern': act('walk-to-lantern', { beings: ['leader'], weight: 1, moves: ['body'] }),
  'stand-still': act('stand-still', { beings: ['leader', 'practice'], weight: 3, moves: [] }),
  'gag:leader': act('gag:leader', { beings: ['leader'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['body'] }),

  // --- Practice (mind · tangerine) -----------------------------------------
  // Off duty it is an actor between scenes: pacing in the wings, humming
  // (sway), a look at the water, standing still. Nothing here lifts a mask
  // or reads a card; those two are its working tells and play only on the
  // record. Host of a visit: it takes a bow and the visitor applauds.
  'gag:practice': act('gag:practice', { beings: ['practice'], kind: 'visit', durationMs: [4000, 4000], weight: 1, moves: ['body', 'arms'] }),
};

// Per-being weighted idle tables, built from the ACTS catalogue above so
// the weights can never drift from the data. This is what the normal
// (non-dawn) idle rotation draws from — it is what keeps 'stretch' out of
// every other being's rotation even though its `beings` field is '*'.
const BEING_IDLE_TABLE = {
  commander: [
    { name: 'scan-horizon', weight: 3 }, { name: 'check-compass', weight: 2 },
    { name: 'pace', weight: 2 }, { name: 'at-ease', weight: 3 },
  ],
  coach: [
    { name: 'chalk-hands', weight: 3 }, { name: 'stretch', weight: 2 },
    { name: 'sit-bench', weight: 2 }, { name: 'tap-racked-bar', weight: 1 },
  ],
  cfo: [
    { name: 'stack-chip', weight: 3 }, { name: 'fix-bowtie', weight: 2 },
    { name: 'close-ledger', weight: 1 }, { name: 'look-at-safe', weight: 2 },
  ],
  guardian: [
    { name: 'stand-watch', weight: 4 }, { name: 'turn-to-district', weight: 2 },
    { name: 'polish-shield', weight: 1 },
  ],
  researcher: [
    { name: 'close-book', weight: 2 }, { name: 'look-up', weight: 3 },
    { name: 'scribble', weight: 2 }, { name: 'adjust-lens', weight: 1 },
  ],
  watcher: [
    { name: 'toss-popcorn', weight: 3 }, { name: 'lean-back', weight: 2 },
    { name: 'headphones-off-on', weight: 1 }, { name: 'tap-foot', weight: 2 },
  ],
  librarian: [
    { name: 'shut-drawer', weight: 2 }, { name: 'align-books', weight: 2 },
    { name: 'dust-shelf', weight: 2 }, { name: 'adjust-spectacles', weight: 1 },
  ],
  mealprep: [
    { name: 'taste-ladle', weight: 3 }, { name: 'wipe-counter', weight: 2 },
    { name: 'check-crate', weight: 2 }, { name: 'sway', weight: 1 },
  ],
  leader: [
    { name: 'look-at-water', weight: 3 }, { name: 'sit-bench', weight: 2 },
    { name: 'walk-to-lantern', weight: 1 }, { name: 'stand-still', weight: 3 },
  ],
  practice: [
    { name: 'pace', weight: 2 }, { name: 'sway', weight: 2 },
    { name: 'look-at-water', weight: 2 }, { name: 'stand-still', weight: 3 },
  ],
};

function gagOf(hostId) {
  return `gag:${hostId}`;
}

// Every ring-neighbour pair a visit may happen between (§9d step 6,
// §9b/§9d "ring neighbours"). Beings that share a tile (Knowledge's three,
// Mind's Leader and Practice) visit on it (`sameTile: true`, no lane path);
// everyone visits their district's ring neighbour, one hop around RING_ORDER.
const NEIGHBOR_PAIRS = (() => {
  const pairs = [];
  const n = RING_ORDER.length;
  for (let i = 0; i < n; i++) {
    const a = RING_ORDER[i];
    const b = RING_ORDER[(i + 1) % n];
    for (const beingA of DISTRICT_BEINGS[a]) {
      for (const beingB of DISTRICT_BEINGS[b]) {
        pairs.push({ a: beingA, b: beingB, sameTile: false });
      }
    }
  }
  for (const d of RING_ORDER) {
    const here = DISTRICT_BEINGS[d];
    for (let i = 0; i < here.length; i++) {
      for (let j = i + 1; j < here.length; j++) {
        pairs.push({ a: here[i], b: here[j], sameTile: true });
      }
    }
  }
  return pairs;
})();

// ---------------------------------------------------------------------------
// Time of day (§9c). Fractional local hours: dawn 05:30-07:00, day
// 07:00-18:00, evening 18:00-20:30, night otherwise.
export function daypartOf(localHour) {
  const h = ((localHour % 24) + 24) % 24;
  if (h >= 5.5 && h < 7) return 'dawn';
  if (h >= 7 && h < 18) return 'day';
  if (h >= 18 && h < 20.5) return 'evening';
  return 'night';
}

function localHourOf(nowMs) {
  const d = new Date(nowMs);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// ---------------------------------------------------------------------------
// initLife — the starting `prev`.

function baseBeingState() {
  return {
    place: 'home', spot: 'rest', act: 'rest', actSince: 0, actUntil: 0,
    facing: null, partner: null, path: null, carry: null,
  };
}

export function initLife({ seed, beings }) {
  const ids = (beings || []).map((b) => b.id);
  const beingsState = {};
  for (const id of ids) beingsState[id] = baseBeingState();
  return {
    beings: beingsState,
    world: { daypart: 'day', lampsOn: false, padLit: false, pulse: null, lamps: {} },
    handled: [],
    rng: { minute: null, state: xmur3Seed(`${seed}:init`) },
    meta: {
      lastBeings: null, // last snapshot of input.beings we actually looked at
      stretchedOn: {}, // beingId -> seed(day) it last stretched
      activeVisit: null, // { visitor, host, sameTile } | null
      nextVisitCheckAt: null, // ms, when to next consider starting a visit
    },
  };
}

// ---------------------------------------------------------------------------
// Small helpers shared by stepLife.

function cloneBeingsMap(beingsState) {
  const out = {};
  for (const id of Object.keys(beingsState)) out[id] = { ...beingsState[id] };
  return out;
}

// ---------------------------------------------------------------------------
// stepLife — the reducer.

export function stepLife(prev, input) {
  const now = input.now;
  const daypart = daypartOf(localHourOf(now));

  // Frozen when invisible: nothing but the daypart may change (a map
  // opened after an hour must not play an hour of catch-up).
  if (!input.visible) {
    return {
      ...prev,
      beings: cloneBeingsMap(prev.beings),
      world: { ...prev.world, daypart },
      handled: [...prev.handled],
      meta: { ...prev.meta, stretchedOn: { ...prev.meta.stretchedOn } },
    };
  }

  const rng = makeRng(prev.rng, now, input.seed);
  const inputById = new Map((input.beings || []).map((b) => [b.id, b]));
  const prevBeings = prev.beings || {};
  const lastBeings = prev.meta && prev.meta.lastBeings ? prev.meta.lastBeings : null;

  const nextBeings = {};
  const nextHandled = [...prev.handled];
  const nextWorld = { ...prev.world, daypart, pulse: null, lamps: { ...(prev.world.lamps || {}) } };
  const nextMeta = {
    lastBeings: {},
    stretchedOn: { ...prev.meta.stretchedOn },
    activeVisit: prev.meta.activeVisit,
    nextVisitCheckAt: prev.meta.nextVisitCheckAt,
  };

  // ---- Phase A: who is blocked (working/waiting) this tick, by real facts.
  const blocked = {}; // id -> 'working' | 'waiting' | null
  for (const id of BEING_IDS) {
    const b = inputById.get(id);
    if (!b) continue;
    if (b.working) blocked[id] = 'working';
    else if ((b.waiting || 0) > 0) blocked[id] = 'waiting';
    else blocked[id] = null;
  }

  // ---- Phase B: lamp-lighting + guardian-heartbeat edge triggers, from
  // the diff between what we last looked at and what we see now. On the
  // very first look (no lastBeings yet), a member already 'today' counts
  // as a fresh transition too, so a lamp already earned today still lights.
  let guardianHeartbeatFired = false;
  for (const id of BEING_IDS) {
    const cur = inputById.get(id);
    if (!cur) continue;
    const prevSnap = lastBeings ? lastBeings[id] : null;
    for (const m of cur.members || []) {
      const wasToday = prevSnap ? (prevSnap.memberState || {})[m.id] === 'today' : false;
      if (m.state === 'today' && !wasToday) {
        nextWorld.lamps[cur.district] = true;
        if (id === 'guardian' && m.id === 'guardian') guardianHeartbeatFired = true;
      }
    }
  }
  nextWorld.lampsOn = daypart === 'night';
  nextWorld.padLit = !!(input.overnightQueued > 0) && (() => {
    const h = localHourOf(now);
    return h >= 3.5 && h < 6;
  })();

  // ---- Phase C: "thanks" and "deliver" triggers from the event stream.
  // Only events within the last 120s, only while visible (already true
  // here), one in flight per being (checked against nextHandled/current act).
  const RECENT_MS = 120000;
  const freshEvents = (input.events || []).filter((e) => {
    if (!e || e.source !== 'record') return false;
    if (nextHandled.includes(e.id)) return false;
    const age = now - new Date(e.at).getTime();
    return age >= 0 && age <= RECENT_MS;
  });

  const thanksTrigger = {}; // beingId -> eventId
  const deliverTrigger = {}; // beingId -> eventId
  for (const e of freshEvents) {
    const id = e.being;
    if (!id || !BEING_IDS.includes(id)) continue;
    const prevSnap = lastBeings ? lastBeings[id] : null;
    const wasWaiting = prevSnap ? prevSnap.waiting > 0 : false;
    const leftPending = ['filed', 'approved', 'discarded'].includes(e.status) && wasWaiting;
    if ((e.answered === true || leftPending) && !thanksTrigger[id]) {
      thanksTrigger[id] = e.id;
    } else if (e.status === 'filed' && !deliverTrigger[id]) {
      deliverTrigger[id] = e.id;
    }
  }

  // ---- Phase D: build the per-being sequences (multi-phase acts).
  // A "sequence" is a list of phases; the first is the one playing now.
  function phaseDone(prevState) {
    return now >= (prevState.actUntil || 0);
  }

  // Starts a phase sequence. Returns the being's new state; if the phase
  // being entered pulses the plaza, `nextWorld.pulse` is set right here
  // (a controlled, local side effect on the `next` object under
  // construction — never on `prev`/`input`).
  function startSeq(seq) {
    const p0 = seq[0];
    if (p0.pulse) nextWorld.pulse = now;
    return {
      place: p0.place, spot: p0.spot, act: p0.act, actSince: now, actUntil: now + p0.durationMs,
      facing: p0.facing || null, partner: p0.partner || null, path: p0.path || null,
      carry: p0.carry !== undefined ? p0.carry : null,
      _seq: seq.slice(1),
    };
  }

  function deliverSeq(id, district) {
    const out = [`home:${id}`, `ring:${district}`, `spoke:${district}`, 'post'];
    const back = [...out].reverse();
    return [
      { act: 'deliver', durationMs: 20000, place: 'lane', spot: null, path: out },
      { act: 'deliver', durationMs: 4000, place: 'plaza', spot: 'post', path: null, pulse: true },
      { act: 'deliver', durationMs: 20000, place: 'lane', spot: null, path: back },
      { act: 'rest', durationMs: rng.randInt(REST_MS[0], REST_MS[1]), place: 'home', spot: 'rest', path: null },
    ];
  }

  function patrolSeq(id) {
    const lap = [`home:${id}`, ...RING_ORDER.map((d) => `ring:${d}`), `home:${id}`];
    return [
      { act: 'patrol', durationMs: 120000, place: 'lane', spot: null, path: lap },
      { act: 'rest', durationMs: rng.randInt(REST_MS[0], REST_MS[1]), place: 'home', spot: 'rest', path: null },
    ];
  }

  function thanksSeq() {
    return [
      { act: 'thanks', durationMs: 2000, place: 'home', spot: 'rest', facing: 'camera' },
    ];
  }

  function visitorSeq(visitorId, hostId, sameTile, gagCarry) {
    const out = [`home:${visitorId}`, `ring:${DISTRICT_OF[visitorId]}`, `ring:${DISTRICT_OF[hostId]}`];
    const back = [...out].reverse();
    const walk = sameTile ? [] : [
      { act: 'visit-walk', durationMs: 12000, place: 'lane', spot: null, path: out, partner: hostId },
    ];
    const walkBack = sameTile ? [] : [
      { act: 'visit-walk', durationMs: 12000, place: 'lane', spot: null, path: back, partner: hostId, carry: gagCarry || null },
    ];
    return [
      ...walk,
      { act: 'visit-face', durationMs: 2000, place: `visit:${hostId}`, spot: 'visit', facing: 'partner', partner: hostId },
      { act: 'visit-nod', durationMs: 3000, place: `visit:${hostId}`, spot: 'visit', facing: 'partner', partner: hostId },
      { act: gagOf(hostId), durationMs: 4000, place: `visit:${hostId}`, spot: 'visit', facing: 'partner', partner: hostId, carry: gagCarry || null },
      ...walkBack,
      { act: 'rest', durationMs: 30000, place: 'home', spot: 'rest', path: null, partner: null, facing: null, carry: gagCarry || null },
    ];
  }

  // ---- helper: is this being currently mid a `startSeq`-built sequence
  // (a deliver, a patrol, a visit)? Every phase `startSeq` produces carries
  // a `_seq` array (even an empty one, for the last phase), which is what
  // distinguishes a chained phase — including one that happens to be named
  // 'rest', such as a host's "waiting for the visitor" beat — from an
  // ordinary idle-cycle rest, which never has `_seq`.
  function isMidSpecial(prevState) {
    return !!prevState && Array.isArray(prevState._seq);
  }

  // ---- Phase E: attempt to start a new visit (global, once per tick),
  // before per-being resolution, so both participants can pick it up.
  const visitStarts = {}; // beingId -> seq (already built)
  if (!input.reduceMotion) {
    const isFreeForVisit = (id) => {
      if (blocked[id]) return false;
      const st = prevBeings[id];
      if (isMidSpecial(st)) return false;
      if (prev.meta.activeVisit && (prev.meta.activeVisit.visitor === id || prev.meta.activeVisit.host === id)) return false;
      if (daypart === 'night') return false;
      // Night/dawn (level 5) beats idle visits (level 6): a being that
      // still owes today's one stretch takes that first.
      if (daypart === 'dawn' && nextMeta.stretchedOn[id] !== input.seed) return false;
      // Events (precedence level 4) beat idle visits (level 6): don't pull
      // a being about to deliver, give thanks, or (Guardian) patrol into a
      // visit on the very tick its event fires.
      if (deliverTrigger[id] || thanksTrigger[id]) return false;
      if (id === 'guardian' && guardianHeartbeatFired) return false;
      return true;
    };

    if (nextMeta.nextVisitCheckAt == null) {
      nextMeta.nextVisitCheckAt = now + rng.randInt(6 * 60000, 12 * 60000);
    }

    if (!nextMeta.activeVisit && now >= nextMeta.nextVisitCheckAt) {
      const eligible = NEIGHBOR_PAIRS.filter((p) => isFreeForVisit(p.a) && isFreeForVisit(p.b));
      if (eligible.length) {
        const idx = rng.randInt(0, eligible.length - 1);
        const pair = eligible[idx];
        const visitorIsA = rng.rand() < 0.5;
        const visitor = visitorIsA ? pair.a : pair.b;
        const host = visitorIsA ? pair.b : pair.a;
        const gagAct = ACTS[gagOf(host)];
        const gagCarry = gagAct && gagAct.carry ? gagAct.carry : null;
        const vSeq = visitorSeq(visitor, host, pair.sameTile, gagCarry);
        const waitDur = pair.sameTile ? 0 : 12000;
        const hSeq = [
          ...(waitDur > 0 ? [{ act: 'rest', durationMs: waitDur, place: 'home', spot: 'rest', partner: visitor }] : []),
          { act: 'visit-face', durationMs: 2000, place: 'home', spot: 'rest', facing: 'partner', partner: visitor },
          { act: 'visit-nod', durationMs: 3000, place: 'home', spot: 'rest', facing: 'partner', partner: visitor },
          { act: gagOf(host), durationMs: 4000, place: 'home', spot: 'rest', facing: 'partner', partner: visitor },
          ...(waitDur > 0 ? [{ act: 'rest', durationMs: waitDur, place: 'home', spot: 'rest', partner: null }] : []),
        ];
        visitStarts[visitor] = vSeq;
        visitStarts[host] = hSeq;
        nextMeta.activeVisit = { visitor, host, sameTile: pair.sameTile };
      }
      nextMeta.nextVisitCheckAt = now + rng.randInt(6 * 60000, 12 * 60000);
    }
  }

  // ---- Phase F: resolve each being.
  // A stable snapshot of the active visit, taken BEFORE any being in this
  // tick is processed. `blocked` (Phase A) is likewise computed for every
  // being up front. Using these fixed values — instead of the mutating
  // `nextMeta.activeVisit` — to decide abandonment means the answer does
  // not depend on which of the two participants BEING_IDS happens to
  // iterate over first: both see the same "is my visit abandoned?" fact.
  const activeVisitAtStart = prev.meta.activeVisit;
  const visitAbandonedThisTick = !!(activeVisitAtStart
    && (blocked[activeVisitAtStart.visitor] || blocked[activeVisitAtStart.host]));

  for (const id of BEING_IDS) {
    const beingInput = inputById.get(id);
    const prevState = prevBeings[id] || baseBeingState();

    // Snapshot for next tick's diffing.
    nextMeta.lastBeings[id] = {
      waiting: beingInput ? beingInput.waiting || 0 : 0,
      working: !!(beingInput && beingInput.working),
      district: beingInput ? beingInput.district : DISTRICT_OF[id],
      memberState: (beingInput && beingInput.members || []).reduce((m, mm) => { m[mm.id] = mm.state; return m; }, {}),
    };

    if (!beingInput) {
      nextBeings[id] = prevState;
      continue;
    }

    // Is this being one of this tick's (about-to-be-abandoned) visit pair?
    const inAbandonedVisit = visitAbandonedThisTick
      && activeVisitAtStart && (activeVisitAtStart.visitor === id || activeVisitAtStart.host === id);
    if (inAbandonedVisit) nextMeta.activeVisit = null;

    // 1. working
    if (blocked[id] === 'working') {
      nextBeings[id] = {
        place: 'home', spot: 'work', act: 'work',
        actSince: prevState.act === 'work' ? prevState.actSince : now,
        actUntil: now + ACTS.work.durationMs[1],
        facing: null, partner: null, path: null, carry: null,
      };
      continue;
    }

    // 2. waiting
    if (blocked[id] === 'waiting') {
      const wasWaitFamily = prevState.act === 'wait' || prevState.act === 'glance-marker' || prevState.act === 'sigh';
      if (wasWaitFamily && !phaseDone(prevState)) {
        nextBeings[id] = { ...prevState, place: 'home' };
        continue;
      }
      // Pick: mostly hold 'wait'; occasionally a fidget.
      const fidgetChance = rng.rand();
      let name = 'wait';
      let durRange = ACTS.wait.durationMs;
      if (prevState.act === 'wait' && fidgetChance < 0.35) {
        name = rng.pickWeighted([{ name: 'glance-marker', weight: 1 }, { name: 'sigh', weight: 1 }]);
        durRange = ACTS[name].durationMs;
      }
      nextBeings[id] = {
        place: 'home', spot: 'rest', act: name,
        actSince: now, actUntil: now + rng.randInt(durRange[0], durRange[1]),
        facing: 'camera', partner: null, path: null, carry: null,
      };
      continue;
    }

    // Abandon a visit now (not working/waiting ourselves, but the visit
    // was flagged for abandonment because our partner became blocked).
    if (inAbandonedVisit) {
      nextBeings[id] = {
        place: 'home', spot: 'rest', act: 'rest',
        actSince: now, actUntil: now + rng.randInt(REST_MS[0], REST_MS[1]),
        facing: null, partner: null, path: null, carry: null,
      };
      continue;
    }

    // 3. reduced motion
    if (input.reduceMotion) {
      nextBeings[id] = {
        place: 'home', spot: 'rest', act: 'rest', actSince: now, actUntil: now + REST_MS[1],
        facing: null, partner: null, path: null, carry: null,
      };
      continue;
    }

    // Continue an in-flight multi-phase sequence (event or visit) if one
    // is running and not abandoned.
    if (isMidSpecial(prevState) && !phaseDone(prevState)) {
      nextBeings[id] = { ...prevState };
      continue;
    }
    if (isMidSpecial(prevState) && phaseDone(prevState)) {
      const seq = prevState._seq || [];
      if (seq.length) {
        nextBeings[id] = startSeq(seq);
        continue;
      }
      // Sequence finished naturally: fall through to re-evaluate below.
    }

    // 4. events: deliver / patrol / thanks — precedence level 4, before
    // night/dawn (5) and idle/visits (6).
    if (deliverTrigger[id]) {
      nextHandled.push(deliverTrigger[id]);
      const seq = deliverSeq(id, beingInput.district);
      nextBeings[id] = startSeq(seq);
      continue;
    }
    if (thanksTrigger[id]) {
      nextHandled.push(thanksTrigger[id]);
      nextBeings[id] = startSeq(thanksSeq());
      continue;
    }
    if (id === 'guardian' && guardianHeartbeatFired && !nextMeta.activeVisit) {
      nextBeings[id] = startSeq(patrolSeq(id));
      continue;
    }

    // 5. night / dawn — before idle/visits (6), so a being that still owes
    // today's one stretch, or is asleep/resting for the night, is never
    // instead pulled into a freshly-started visit (Phase E already keeps
    // such beings out of `visitStarts` via `isFreeForVisit`, but the order
    // here is what actually enforces the precedence).
    if (daypart === 'night') {
      const fresh = beingInput.fresh;
      const asleep = fresh === 'today' || fresh === 'recent';
      const name = asleep ? 'sleep' : 'rest';
      const stillHolding = prevState.act === name && !phaseDone(prevState);
      if (stillHolding) {
        nextBeings[id] = { ...prevState };
      } else {
        nextBeings[id] = {
          place: 'home', spot: 'rest', act: name,
          actSince: now, actUntil: now + rng.randInt(REST_MS[0], REST_MS[1]),
          facing: null, partner: null, path: null, carry: null,
        };
      }
      continue;
    }
    if (daypart === 'dawn' && nextMeta.stretchedOn[id] !== input.seed) {
      nextMeta.stretchedOn[id] = input.seed;
      nextBeings[id] = {
        place: 'home', spot: 'rest', act: 'stretch',
        actSince: now, actUntil: now + rng.randInt(HOLD_MS[0], HOLD_MS[1]),
        facing: null, partner: null, path: null, carry: null,
      };
      continue;
    }

    // A freshly-started visit (global Phase E), if none of the above fired.
    if (visitStarts[id]) {
      nextBeings[id] = startSeq(visitStarts[id]);
      continue;
    }

    // 6. idle catalogue
    const idleTable = BEING_IDLE_TABLE[id] || [];
    const wasIdleAct = idleTable.some((o) => o.name === prevState.act) || prevState.act === 'stretch';
    const wasRestAfterIdle = prevState.act === 'rest';
    const stillHoldingIdle = (wasIdleAct || wasRestAfterIdle) && !phaseDone(prevState);
    if (stillHoldingIdle) {
      nextBeings[id] = { ...prevState, place: 'home' };
      continue;
    }
    if (wasIdleAct && phaseDone(prevState)) {
      // Idle act just finished: go rest.
      nextBeings[id] = {
        place: 'home', spot: 'rest', act: 'rest',
        actSince: now, actUntil: now + rng.randInt(REST_MS[0], REST_MS[1]),
        facing: null, partner: null, path: null, carry: null,
      };
      continue;
    }
    // Either just-finished a rest-after-idle, or just became free: pick a
    // fresh idle act by weight.
    if (idleTable.length) {
      const name = rng.pickWeighted(idleTable);
      const durRange = ACTS[name].durationMs;
      nextBeings[id] = {
        place: 'home', spot: 'rest', act: name,
        actSince: now, actUntil: now + rng.randInt(durRange[0], durRange[1]),
        facing: null, partner: null, path: null, carry: null,
      };
    } else {
      nextBeings[id] = {
        place: 'home', spot: 'rest', act: 'rest',
        actSince: now, actUntil: now + rng.randInt(REST_MS[0], REST_MS[1]),
        facing: null, partner: null, path: null, carry: null,
      };
    }
  }

  // If the active visit's participants both completed (no longer mid a
  // visit act for either), clear it so the next check can schedule anew.
  if (nextMeta.activeVisit) {
    const { visitor, host } = nextMeta.activeVisit;
    const vAct = (nextBeings[visitor] || {}).act;
    const hAct = (nextBeings[host] || {}).act;
    const visitActs = new Set(['visit-walk', 'visit-face', 'visit-nod']);
    const stillVisiting = (a) => visitActs.has(a) || (typeof a === 'string' && a.startsWith('gag:'));
    if (!stillVisiting(vAct) && !stillVisiting(hAct)) {
      nextMeta.activeVisit = null;
    }
  }

  return {
    beings: nextBeings,
    world: nextWorld,
    handled: nextHandled,
    rng: rng.getState(),
    meta: nextMeta,
  };
}
