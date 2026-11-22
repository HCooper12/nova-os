// NO BULK SYNC WHILE A SPOKEN TURN IS LIVE (22 Nov 2026). Nothing used to ask
// whether he was talking, or waiting on Nova, before the phone refreshed
// everything. src/turnPhase.js tracks the turn from the voice code's marks and
// gates the syncs. These tests pin the phase table, the 30 s fall-back that
// keeps a missed mark from freezing syncing, the deferral rules per phase, the
// coalescing (many owed become exactly one call), and that an abort never
// falls back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, PHASE_RULES, QUIET_MS, SETTLE_MS, syncAllowed,
  createTurnPhase, createSyncGate, bindTurnPhase, markTurn, markTurnIf, touchTurn,
} from '../../src/turnPhase.js';
import { snapshotPass } from '../../src/syncPass.js';

// a hand-cranked clock with real ordering of timers
function clock() {
  let t = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { id += 1; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimer: (k) => { timers.delete(k); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [k, v] of timers) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
    pending: () => timers.size,
  };
}

// the tracker and gate wired as App wires them, with the calls the gate makes
function rig() {
  const c = clock();
  const runs = [];
  const changes = [];
  let gate = null;
  const phase = createTurnPhase({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, onChange: (next, prev, why) => { changes.push([prev, next, why]); gate.onPhase(next); } });
  gate = createSyncGate({ phase: () => phase.phase(), run: (call) => runs.push(call), setTimer: c.setTimer, clearTimer: c.clearTimer });
  return { c, phase, gate, runs, changes };
}

test('the phase table: bulk runs only when idle; targeted refreshes wait while he talks or waits, and run while Nova speaks', () => {
  assert.deepEqual([...PHASES], ['idle', 'listen', 'wait', 'speak']);
  assert.deepEqual({ ...PHASE_RULES.idle }, { bulk: true, slices: true });
  assert.deepEqual({ ...PHASE_RULES.listen }, { bulk: false, slices: false });
  assert.deepEqual({ ...PHASE_RULES.wait }, { bulk: false, slices: false });
  assert.deepEqual({ ...PHASE_RULES.speak }, { bulk: false, slices: true });
  assert.equal(syncAllowed('nonsense', 'bulk'), true, 'an unknown phase is treated as idle: never a freeze');
});

test('marks move the phase, and a late mark from a superseded turn changes nothing', () => {
  const { phase } = rig();
  assert.equal(phase.phase(), 'idle');
  const a = phase.mark('wait');            // his first question
  const a2 = phase.markIf(a, 'speak');     // its reply starts
  assert.equal(phase.phase(), 'speak');
  phase.mark('listen');                    // he talks over it: a new turn
  assert.equal(phase.markIf(a2, 'idle'), null, 'the old reply ending late cannot end his new turn');
  assert.equal(phase.phase(), 'listen');
  assert.equal(phase.mark('nonsense'), null);
  assert.equal(phase.markIf(0, 'idle'), null);
});

test('no mark for 30 s: the phase falls back to idle by itself, and what was owed runs', () => {
  const { c, phase, gate, runs, changes } = rig();
  phase.mark('listen');
  assert.equal(gate.allow('bulk'), false);
  c.advance(QUIET_MS - 1);
  assert.equal(phase.phase(), 'listen');
  c.advance(1);
  assert.equal(phase.phase(), 'idle', 'a missed mark can never freeze syncing');
  assert.deepEqual(changes.at(-1), ['listen', 'idle', 'quiet']);
  c.advance(SETTLE_MS);
  assert.deepEqual(runs, [{ bulk: true }], 'owed, then paid: deferral only delays');
});

test('a heartbeat keeps a long turn live; when it stops, 30 s later the phase is idle', () => {
  const { c, phase } = rig();
  const owner = phase.mark('listen');
  for (let i = 0; i < 50; i += 1) { c.advance(1000); assert.equal(phase.touch(owner), true); }
  assert.equal(phase.phase(), 'listen', '50 s of him talking is still his turn');
  c.advance(QUIET_MS - 1);
  assert.equal(phase.phase(), 'listen');
  c.advance(1);
  assert.equal(phase.phase(), 'idle');
  assert.equal(phase.touch(owner), false, 'a heartbeat cannot revive an ended turn');
});

test('deferral rules per phase', () => {
  const { phase, gate } = rig();
  assert.equal(gate.allow('bulk'), true);
  assert.equal(gate.allow('slices', ['todos']), true);
  for (const p of ['listen', 'wait']) {
    phase.mark(p);
    assert.equal(gate.allow('bulk'), false, `${p}: bulk waits`);
    assert.equal(gate.allow('slices', ['todos']), false, `${p}: targeted waits`);
  }
  phase.mark('speak');
  assert.equal(gate.allow('bulk'), false, 'speak: bulk still waits');
  assert.equal(gate.allow('slices', ['foodLog']), true, 'speak: the screen follows what Nova just wrote');
  assert.equal(gate.deferred(), 5);
});

test('coalescing: many owed become exactly one whole-app sync when the turn is over', () => {
  const { c, phase, gate, runs } = rig();
  const owner = phase.mark('listen');
  gate.allow('bulk');                       // the resume handler
  gate.allow('slices', ['todos']);          // a nudge
  gate.allow('bulk');                       // the 5-minute interval
  const w = phase.markIf(owner, 'wait');
  gate.allow('slices', ['foodLog', 'todos']);
  gate.allow('bulk');                       // online
  const s = phase.markIf(w, 'speak');
  c.advance(0);
  assert.deepEqual(runs, [{ slices: ['todos', 'foodLog'] }], 'speaking runs the owed targeted refresh once');
  phase.markIf(s, 'idle');
  c.advance(SETTLE_MS);
  assert.deepEqual(runs.slice(1), [{ bulk: true }], 'and idle runs exactly one bulk');
  c.advance(60_000);
  assert.equal(runs.length, 2, 'nothing else, ever');
});

test('coalescing: owed targeted refreshes alone become one refresh of their union', () => {
  const { c, phase, gate, runs } = rig();
  const owner = phase.mark('wait');
  gate.allow('slices', ['todos']);
  gate.allow('slices', ['foodLog']);
  gate.allow('slices', ['todos', 'instruments']);
  phase.markIf(owner, 'idle');
  c.advance(SETTLE_MS);
  assert.deepEqual(runs, [{ slices: ['todos', 'foodLog', 'instruments'] }]);
});

test('nothing owed, nothing run; a turn that comes straight back keeps what is owed for its own end', () => {
  const { c, phase, gate, runs } = rig();
  let owner = phase.mark('listen');
  phase.markIf(owner, 'idle');
  c.advance(SETTLE_MS * 3);
  assert.deepEqual(runs, [], 'no debt, no call');
  owner = phase.mark('listen');
  gate.allow('bulk');
  phase.markIf(owner, 'idle');
  c.advance(SETTLE_MS - 1);
  owner = phase.mark('listen');             // conversation mode: the mic reopens
  c.advance(SETTLE_MS * 2);
  assert.deepEqual(runs, [], 'not run between his turns, to be called off again');
  phase.markIf(owner, 'idle');
  c.advance(SETTLE_MS);
  assert.deepEqual(runs, [{ bulk: true }]);
});

test('a refresh that runs pays what was owed of it', () => {
  const { c, phase, gate, runs } = rig();
  const owner = phase.mark('wait');
  gate.allow('bulk');
  phase.markIf(owner, 'idle');
  assert.equal(gate.allow('bulk'), true, 'the resume handler runs in the idle gap');
  c.advance(SETTLE_MS * 2);
  assert.deepEqual(runs, [], 'the owed one was that run');
});

test('a whole-app sync called off as his turn begins is owed, and never falls back', async () => {
  const { c, phase, gate, runs } = rig();
  // App.abortBulkForTurn: the generation moves on and the signal aborts
  let gen = 1;
  const mine = gen;
  const ctl = new AbortController();
  let fallbacks = 0;
  let pings = 0;
  const pass = snapshotPass({
    isCurrent: () => gen === mine && !ctl.signal.aborted,
    snapshot: () => new Promise((_, reject) => ctl.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    ping: async () => { pings += 1; return true; },
    unreachable: () => true,
  }).then((r) => { if (r.outcome === 'fallback') fallbacks += 1; return r; });
  const owner = phase.mark('listen');
  gen += 1; ctl.abort(); gate.owe('bulk');
  const r = await pass;
  assert.equal(r.outcome, 'abandon');
  assert.equal(fallbacks, 0);
  assert.equal(pings, 0);
  assert.equal(gate.deferred(), 1, 'counted as deferred');
  phase.markIf(owner, 'idle');
  c.advance(SETTLE_MS);
  assert.deepEqual(runs, [{ bulk: true }], 'and run once the turn is over');
});

test('safe by construction: with no tracker bound, the bridge marks nothing and nothing is gated', () => {
  assert.equal(markTurn('listen'), null);
  assert.equal(markTurnIf(1, 'idle'), null);
  assert.equal(touchTurn(1), false);
  const { phase, gate } = rig();
  const unbind = bindTurnPhase(phase);
  const owner = markTurn('listen');
  assert.equal(phase.phase(), 'listen');
  assert.equal(touchTurn(owner), true);
  assert.equal(gate.allow('bulk'), false);
  markTurnIf(owner, 'idle');
  assert.equal(phase.phase(), 'idle');
  unbind();
  assert.equal(markTurn('listen'), null, 'unbound again: a no-op');
  assert.equal(phase.phase(), 'idle');
});

test('a listener that throws never breaks a mark', () => {
  const c = clock();
  const phase = createTurnPhase({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, onChange: () => { throw new Error('boom'); } });
  assert.ok(phase.mark('listen'));
  assert.equal(phase.phase(), 'listen');
});
