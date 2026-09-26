// THE ACTS' CONTRACT (AGENT-WORLD-PLAN §9a rule 2, §9d). life.js names the
// acts as data; src/agentWorld/acts.js draws them. This holds the two to
// each other: every act the engine can name has a frame, no frame is a
// working tell, 'work' is only the working tell, every other act starts
// from the resting tell, each frame moves only the handles its ACTS entry
// lists, and an act that is cut short eases out rather than snapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ACTS, WORKING_TELLS } from '../../src/agentWorld/life.js';
import {
  ACT_FRAMES, STILL_ACTS, ACT_SPOTS, PERFORM_S, DOCKS, actMoves,
  newOverlay, resetOverlay, overlayWriters, applyOverlay,
} from '../../src/agentWorld/acts.js';

const NAMES = Object.keys(ACTS);
const TS = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
const ROLES = [null, 'host', 'visitor'];
const BEINGS = ['commander', 'coach', 'cfo', 'guardian', 'researcher', 'watcher', 'librarian', 'mealprep', 'leader', 'practice'];

// a rig that records, and a ctx whose writers record which handle each
// write touched
function recorder(id, role) {
  const log = [];
  const rig = {
    tell: (t, working) => { log.push({ kind: 'tell', working }); return false; },
    arms: { SL: { x: -0.2, y: 0.47, z: 0 }, SR: { x: 0.2, y: 0.47, z: 0 } },
  };
  const w = (kind, detail) => log.push({ kind, detail });
  const ctx = {
    now: 12.5, dt: 1 / 30, rm: false, id, role, place: 'plaza', dock: [0.04, 0.57, 0.34],
    aim: () => ({ yaw: 0.4, pitch: 0.1 }),
    head: (...a) => w('head', a), body: (o) => w('body', o), arm: (side) => w('arm', side),
    prop: (name, v) => w('prop', name, v), face: (o) => w('face', o), fx: (name) => w('fx', name),
  };
  return { rig, ctx, log };
}
function playAll(name, fn) {
  for (const id of BEINGS) for (const role of ROLES) for (const t of TS) {
    const r = recorder(id, role);
    ACT_FRAMES[name](r.rig, t, r.ctx);
    fn(r.log, { id, role, t });
  }
}

test('every act the engine can name has a frame, and no frame is a working tell', () => {
  const missing = NAMES.filter((n) => typeof ACT_FRAMES[n] !== 'function');
  assert.deepEqual(missing, [], `acts with nothing to draw them: ${missing.join(', ')}`);
  const tells = Object.keys(ACT_FRAMES).filter((n) => WORKING_TELLS.includes(n));
  assert.deepEqual(tells, [], `a working tell named as an act: ${tells.join(', ')}`);
  const strays = Object.keys(ACT_FRAMES).filter((n) => !NAMES.includes(n));
  assert.deepEqual(strays, [], `frames for acts the engine never names: ${strays.join(', ')}`);
});

test('work is the working tell and nothing else; every other act starts from the resting tell', () => {
  for (const name of NAMES) {
    playAll(name, (log, at) => {
      assert.ok(log.length >= 1 && log[0].kind === 'tell', `${name} (${at.id}, t ${at.t}) does not start with the tell`);
      assert.equal(log[0].working, name === 'work', `${name} plays the tell with working=${log[0].working}`);
      assert.equal(log.filter((e) => e.kind === 'tell').length, 1, `${name} plays the tell more than once`);
      if (name === 'work') assert.equal(log.length, 1, 'work moves nothing of its own');
    });
  }
});

// which of an act's `moves` a write needs. A hand may move for 'arms', or
// for a prop the hand holds (the lantern, the book, the popcorn, the chip,
// the drawer the hand pushes, the ladle it lifts, the card it offers); the
// chalk puff comes off the hands; the eyes close only in sleep.
const PROP_ALIAS = { rose: 'compass' };
function allowed(name, e) {
  const a = ACTS[name], m = a.moves;
  const props = m.filter((x) => x.startsWith('prop:')).map((x) => x.slice(5));
  if (e.kind === 'head') return m.includes('head');
  if (e.kind === 'body') return m.includes('body');
  if (e.kind === 'arm' || e.kind === 'fx') return m.includes('arms') || props.length > 0;
  if (e.kind === 'face') return a.kind === 'sleep';
  if (e.kind === 'prop') {
    const p = PROP_ALIAS[e.detail] || e.detail;
    if (p === 'carry') return !!a.carry || props.some((x) => x === 'popcorn' || x === 'bowl');
    return props.includes(p);
  }
  return false;
}

test('each act moves only the handles its ACTS entry lists', () => {
  const faults = new Set();
  for (const name of NAMES) {
    playAll(name, (log, at) => {
      for (const e of log.slice(1)) if (!allowed(name, e)) faults.add(`${name}: ${e.kind}${e.detail != null && typeof e.detail !== 'object' ? ' ' + e.detail : ''} (${at.id}${at.role ? ' as ' + at.role : ''}) is not in [${ACTS[name].moves.join(', ')}]`);
    });
  }
  assert.deepEqual([...faults], []);
});

test('the handle check itself catches what it claims to', () => {
  assert.equal(allowed('scan-horizon', { kind: 'arm' }), false, 'a head act may not move a hand');
  assert.equal(allowed('look-up', { kind: 'body' }), false);
  assert.equal(allowed('rest', { kind: 'face' }), false, 'only sleep closes the eyes');
  assert.equal(allowed('sleep', { kind: 'face' }), true);
  assert.equal(allowed('close-book', { kind: 'prop', detail: 'drawer' }), false, 'a book act may not shut a drawer');
  assert.equal(allowed('gag:watcher', { kind: 'prop', detail: 'carry' }), true);
  assert.equal(allowed('gag:coach', { kind: 'prop', detail: 'carry' }), false, 'nothing is carried home from a flex');
});

test('an act with no handles of its own moves nothing', () => {
  for (const name of NAMES.filter((n) => ACTS[n].moves.length === 0 && ACTS[n].kind !== 'sleep')) {
    playAll(name, (log) => assert.equal(log.length, 1, `${name} moved something`));
  }
});

test('the still acts, the relocating acts and the docks all name real acts and beings', () => {
  for (const n of STILL_ACTS) assert.ok(NAMES.includes(n), `STILL_ACTS names ${n}`);
  for (const [n, who] of Object.entries(ACT_SPOTS)) {
    assert.ok(NAMES.includes(n), `ACT_SPOTS names ${n}`);
    for (const id of Object.keys(who)) {
      const b = ACTS[n].beings;
      assert.ok(b === '*' || b.includes(id), `${n} is not ${id}'s act`);
    }
    assert.ok(PERFORM_S[n] > 0, `${n} has no performance length`);
  }
  // the Coach's bar is only ever lifted to work; the lantern hangs up to sleep
  assert.equal(DOCKS.coach.when('work'), false);
  for (const n of NAMES.filter((x) => x !== 'work')) assert.equal(DOCKS.coach.when(n), true, `the bar is not racked during ${n}`);
  assert.equal(DOCKS.guardian.when('sleep'), true);
  assert.equal(DOCKS.guardian.when('patrol'), false, 'the lantern goes on patrol with it');
  // the loop's reasons to run
  assert.equal(actMoves('rest'), false);
  assert.equal(actMoves('sleep'), false);
  assert.equal(actMoves('chalk-hands'), true);
  assert.equal(actMoves('deliver', { place: 'lane' }), false, 'a delivery stood waiting on the lane is still');
  assert.equal(actMoves('deliver', { place: 'plaza' }), true, 'the bow at the post moves');
});

// ---- on a real rig -------------------------------------------------------
const ctx2d = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
if (!globalThis.document) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { createBeingKit } = await import('../../src/agentWorld/beings.js');
const C = (h) => new THREE.Color(h);
const TK = {
  key: C('#fff2e2'), fill: C('#bcd4ff'), rim: C('#9fdcff'), shell: C('#c9d3e4'), em: 1, env: 0.72,
  stage: C('#0d1426'), gold: C('#e0b26a'), ink: C('#e8ecf6'), void: C('#06070d'),
  hue: {
    cy: C('#59e6ff'), vi: C('#8f7bff'), mg: C('#ff7ad9'), good: C('#5fe8a8'), gold: C('#e0b26a'), or: C('#ffa257'),
    chest: C('#ff8a7a'), back: C('#4fd1c5'), shoulders: C('#ffc46b'), quads: C('#7ab8ff'), calves: C('#8fd3ff'),
    abs: C('#ffd66b'), triceps: C('#b48cff'), biceps: C('#5fe8a8'), glutes: C('#c98bff'),
  },
};
const kit = createBeingKit(THREE, TK);

function frameOn(rig, ov, name, t01, now, id) {
  resetOverlay(ov);
  const ctx = { ...overlayWriters(ov), now, dt: 1 / 30, rm: false, id, role: null, place: 'home', dock: null, aim: () => ({ yaw: 0, pitch: 0 }) };
  ACT_FRAMES[name](rig, t01, ctx);
  applyOverlay(rig, ov, { id, docked: false, beingDim: 0, held: () => null, dockLocal: null, dockYaw: 0 });
}

test('every rig exposes the arms and the props its acts reach for', () => {
  const need = { commander: ['rose'], coach: ['bar'], cfo: ['chip'], guardian: ['lantern'], researcher: ['book', 'halves', 'hold', 'lens'], watcher: ['headphones'], librarian: ['drawer'], mealprep: ['pot', 'ladle'], leader: [], practice: ['masks', 'card', 'racks'] };
  for (const a of kit.AGENTS) {
    const b = kit.BUILD[a.id](a);
    assert.ok(b.arms && b.arms.L && b.arms.R && b.arms.SL && b.arms.SR, `${a.id} has no arms to move`);
    assert.ok(b.arms.R.last && b.arms.R.last.H, `${a.id}'s arms do not record their target`);
    for (const p of need[a.id]) assert.ok(b.props && b.props[p], `${a.id} does not expose ${p}`);
  }
});

test('a clap cut short eases the hands back to the tell instead of snapping', () => {
  const a = kit.AGENTS.find((x) => x.id === 'coach');
  const rig = kit.BUILD.coach(a), ov = newOverlay();
  let now = 1;
  // rest first, to learn where the tell keeps the left hand
  for (let i = 0; i < 30; i++) { now += 1 / 30; frameOn(rig, ov, 'rest', 0.5, now, 'coach'); }
  const home = rig.arms.L.last.H.clone();
  // the clap, held mid-beat until it has settled
  for (let i = 0; i < 90; i++) { now += 1 / 30; frameOn(rig, ov, 'chalk-hands', 0.5, now, 'coach'); }
  const clap = rig.arms.L.hand.position.clone();
  assert.ok(clap.distanceTo(home) > 0.1, `the clap moved the hand ${clap.distanceTo(home).toFixed(3)}`);
  // cut to rest: one frame later the hand is on its way, not already there
  now += 1 / 30; frameOn(rig, ov, 'rest', 0, now, 'coach');
  const one = rig.arms.L.hand.position.clone();
  assert.ok(one.distanceTo(clap) > 0.005, 'the hand did not start back');
  assert.ok(one.distanceTo(home) > 0.05, `the hand snapped home (${one.distanceTo(home).toFixed(3)} left)`);
  for (let i = 0; i < 90; i++) { now += 1 / 30; frameOn(rig, ov, 'rest', 0, now, 'coach'); }
  assert.ok(rig.arms.L.hand.position.distanceTo(home) < 0.005, 'the hand came home');
});

test('zero elapsed time moves nothing (a frozen clock never snaps an act)', () => {
  const a = kit.AGENTS.find((x) => x.id === 'cfo');
  const rig = kit.BUILD.cfo(a), ov = newOverlay();
  let now = 1;
  for (let i = 0; i < 10; i++) { now += 1 / 30; frameOn(rig, ov, 'rest', 0, now, 'cfo'); }
  const before = rig.arms.R.hand.position.clone();
  frameOn(rig, ov, 'fix-bowtie', 0.5, now, 'cfo');   // same `now`: no time has passed
  assert.ok(rig.arms.R.hand.position.distanceTo(before) < 1e-6, 'the hand moved in no time');
});

// PRACTICE'S RACK (AGENT-WORLD-PLAN §9a, and the memory's paid-for lesson: a
// racked prop docks for EVERY non-working act, or it flies between the rack
// and the hands on every idle beat). Both its props are in the sash for every
// act but work; work draws the masks for a scene and the card for a page,
// never both; and ending a scene lowers the mask before the sash takes it.
test('Practice racks both masks and the card for every act but work, and each tell draws only its own prop', () => {
  const a = kit.AGENTS.find((x) => x.id === 'practice');
  const settle = (rig, ov, name, mode, now) => {
    rig.workMode = mode;
    for (let i = 0; i < 60; i++) { now += 1 / 30; frameOn(rig, ov, name, 0.5, now, 'practice'); }
    return now;
  };
  const racked = (rig) => ['happy', 'worried', 'card'].map((k) => rig.props[k].position.distanceTo(rig.props.racks[k].pos) < 1e-6);
  for (const name of NAMES.filter((n) => n !== 'work')) {
    const rig = kit.BUILD.practice(a), ov = newOverlay();
    settle(rig, ov, name, 'scene', 1);
    assert.deepEqual(racked(rig), [true, true, true], `a prop is out of the sash during ${name}`);
  }
  const rig = kit.BUILD.practice(a), ov = newOverlay();
  let now = settle(rig, ov, 'work', 'scene', 1);
  assert.deepEqual(racked(rig), [false, false, true], 'a scene draws the two masks and leaves the card');
  // the scene ends mid-beat with the mask up: it is lowered first, then racked
  for (let i = 0; i < 40; i++) { now += 1 / 30; frameOn(rig, ov, 'work', 0.5, now, 'practice'); if (now % 5.2 > 1.5 && now % 5.2 < 2.5) break; }
  let lowered = false;
  for (let i = 0; i < 120; i++) {
    now += 1 / 30; frameOn(rig, ov, 'rest', 0, now, 'practice');
    const [h, w] = racked(rig);
    if (!lowered && (h || w)) assert.fail('a mask went back to the sash before the scene\'s mask was down');
    if (!h && !w && rig.props.worried.position.y < 0.6) lowered = true;
    if (h && w) break;
  }
  assert.deepEqual(racked(rig), [true, true, true], 'the scene over, everything is back in the sash');
  now = settle(rig, ov, 'work', 'prepare', now);
  assert.deepEqual(racked(rig), [true, true, false], 'preparing draws the card and leaves the masks');
  now = settle(rig, ov, 'work', 'scene', now);
  assert.deepEqual(racked(rig), [false, false, true], 'from preparing to a scene: the card goes back, then the masks come out');
});

test('zero elapsed time moves none of Practice\'s props (a frozen clock never snaps a draw)', () => {
  const a = kit.AGENTS.find((x) => x.id === 'practice');
  const rig = kit.BUILD.practice(a), ov = newOverlay();
  let now = 1;
  for (let i = 0; i < 10; i++) { now += 1 / 30; frameOn(rig, ov, 'rest', 0, now, 'practice'); }
  const before = rig.props.worried.position.clone();
  rig.workMode = 'scene';
  frameOn(rig, ov, 'work', 0.5, now, 'practice');   // same `now`: no time has passed
  assert.ok(rig.props.worried.position.distanceTo(before) < 1e-9, 'the mask moved in no time');
});
