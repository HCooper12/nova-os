// THE SKILL SETS' PROPS (his 11 Oct note: the Coach's bar went through his
// body and under the floor during push-ups). Every play each agent can do
// is run on his real rig, frame by frame, with the same prop system the
// stage uses (src/skillsets/propRig.js), and every sampled frame must have
// every prop above the floor, out of his body and head, and moving
// continuously (never a snap mid-air).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const ctx2d = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
if (!globalThis.document) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

const { createBeingKit } = await import('../../src/agentWorld/beings.js');
const { newOverlay, resetOverlay, overlayWriters, applyOverlay } = await import('../../src/agentWorld/acts.js');
const { PLAYS, ROLE, STYLE, CENTRE_HOME, HOME_POSE, samplePlay, frameGeo, gaitOf } = await import('../../src/skillsets/plays.js');
const { ROLE_FRAMES } = await import('../../src/skillsets/roleActs.js');
const { createPropRig, PROP_SPECS, modeFor } = await import('../../src/skillsets/propRig.js');

const C = (h) => new THREE.Color(h);
const TK = {
  key: C('#fff2e2'), fill: C('#bcd4ff'), rim: C('#9fdcff'), shell: C('#c9d3e4'), em: 1, env: 0.72,
  stage: C('#0d1426'), gold: C('#e0b26a'), ink: C('#e8ecf6'), void: C('#06070d'), edge: C('#59e6ff'),
  hue: {
    cy: C('#59e6ff'), vi: C('#8f7bff'), mg: C('#ff7ad9'), good: C('#5fe8a8'), gold: C('#e0b26a'), or: C('#ffa257'),
    chest: C('#ff8a7a'), back: C('#4fd1c5'), shoulders: C('#ffc46b'), quads: C('#7ab8ff'), calves: C('#8fd3ff'),
    abs: C('#ffd66b'), triceps: C('#b48cff'), biceps: C('#5fe8a8'), glutes: C('#c98bff'),
  },
};
const kit = createBeingKit(THREE, TK);
const G = frameGeo(236, 350, 100);
const S = G.CH / 1.1;

// one agent at the centre of his slab, stepped the way stageCore steps him
function stage(id) {
  const a = kit.AGENTS.find((x) => x.id === id);
  const b = kit.BUILD[id](a);
  const scene = new THREE.Scene();
  const holder = new THREE.Group(), inner = new THREE.Group(), tilt = new THREE.Group();
  tilt.add(b.group); inner.add(tilt); holder.add(inner); holder.rotation.x = 0.1; scene.add(holder);
  const x = { id, b, holder, inner, tilt, ov: newOverlay(), walkPh: 0, gait: 0, working: false, floor: 0, snap: true, act: null };
  x.props = createPropRig(THREE, x, scene);
  return x;
}

function step(x, name, t, dt, now) {
  const b = x.b;
  const len = name ? PLAYS[name][PLAYS[name].length - 1][0] : 0;
  const pose = name ? samplePlay(PLAYS[name], t) : HOME_POSE;
  const hx = CENTRE_HOME.x, hy = CENTRE_HOME.y;
  const moving = pose.moving, run = Math.min(1.6, (pose.speed || 0.6) / 0.6);
  x.holder.position.set(G.AX + (hx + pose.x) * G.SW, -(G.AY - (hy + pose.y) * G.SH), pose.behind ? -90 : 90);
  x.holder.scale.set(S * (1 + (1 - pose.sq) * 0.5), S * pose.sq, S);
  x.inner.rotation.set(0, pose.yaw, pose.roll);
  x.props.homeF.position.set(G.AX + hx * G.SW, -(G.AY - hy * G.SH), 90);
  x.props.homeF.scale.setScalar(S); x.props.homeF.rotation.set(0, 0, 0);
  x.floor = x.props.floorFor(pose, G, S);
  if (b.tell) b.tell(now, false, false);
  resetOverlay(x.ov);
  const w = overlayWriters(x.ov);
  const ctx = { ...w, now, rm: false, id: x.id, role: 'host', docked: false, held: () => null, aim: () => ({ yaw: 0, pitch: 0 }) };
  if (name && ROLE_FRAMES[name]) ROLE_FRAMES[name](b, Math.min(1, t / len), ctx);
  const gt = gaitOf(x.id, name);
  const info = {
    play: name, t01: name ? Math.min(1, t / len) : 0, working: false, pin: false, rm: false, dt, floor: x.floor, snap: x.snap,
    gait: x.gait, walkPh: x.walkPh, sq: pose.sq, armsTaken: { L: !!x.ov.t.arms.L, R: !!x.ov.t.arms.R }, bodyTaken: false,
  };
  x.props.pre(ctx, info);
  const g = x.gait += ((moving ? Math.min(1, run) : 0) - x.gait) * (1 - Math.exp(-dt * 8));
  if (moving) x.walkPh += dt * gt.hz * Math.max(0.6, run);
  if (gt.lunge && g > 0.02) ctx.body({ y: -gt.lunge * Math.abs(Math.sin(x.walkPh)) * g, pitch: 0.05 * g });
  const v = applyOverlay(b, x.ov, ctx);
  x.tilt.position.set(v.bx, v.by, 0);
  x.tilt.rotation.set(v.bp, v.byaw, v.br);
  x.props.post(info);
  x.snap = false;
  return info;
}

const repertoire = (id) => [...new Set([...(ROLE[id] || []), ...((STYLE[id] || {}).big || []), ...((STYLE[id] || {}).small || [])])];

for (const id of Object.keys(PROP_SPECS)) {
  test(`${id}: every prop stays above the floor, out of his body, and never snaps, in every play`, () => {
    const x = stage(id);
    assert.ok(x.props.props.length > 0, `${id} has no managed props`);
    const dt = 1 / 30;
    let now = 1;
    // settle at home first
    for (let i = 0; i < 40; i++) { now += dt; step(x, null, 0, dt, now); }
    for (const name of repertoire(id)) {
      const len = PLAYS[name][PLAYS[name].length - 1][0];
      const last = new Map(x.props.props.map((p) => [p.key, p.pos.clone()]));
      let body = x.holder.position.clone(), yaw = x.inner.rotation.y;
      // a play that puts a prop down first waits for it (stageCore's hold)
      const hold = x.props.props.some((p) => { const m = modeFor(p.spec, { play: name, t01: 0 }); return m !== p.mode && (m === 'set' || p.mode === 'set'); }) ? 0.5 : 0;
      // the play, then a second at home (where he picks his things back up)
      for (let t = -hold; t <= len + 1.2; t += dt) {
        now += dt;
        const info = step(x, t <= len ? name : null, Math.max(0, t), dt, now);
        // how far he himself moved this frame (in his own units, on screen),
        // and how far a hand's length swings when he turns
        const moved = Math.hypot(x.holder.position.x - body.x, x.holder.position.y - body.y) / S + Math.abs(x.inner.rotation.y - yaw) * 0.6;
        body = x.holder.position.clone(); yaw = x.inner.rotation.y;
        for (const r of x.props.audit(info)) {
          const at = `${id} ${name} t=${t.toFixed(2)} ${r.key} (${r.mode})`;
          assert.ok(r.below < 0.004, `${at}: ${r.below.toFixed(3)} below the floor`);
          assert.ok(r.inside < 0.012, `${at}: ${r.inside.toFixed(3)} inside his body (guard moved it ${r.corr.toFixed(3)}, at ${r.pos.toArray().map((v) => v.toFixed(2))})`);
          // on screen (depth is the glass's: behind it is a step in z by design)
          const p0 = last.get(r.key), jump = Math.hypot(r.pos.x - p0.x, r.pos.y - p0.y);
          assert.ok(jump < moved + 0.15, `${at}: moved ${jump.toFixed(3)} in one frame, he moved ${moved.toFixed(3)} (a snap; guard ${r.corr.toFixed(3)})`);
          last.set(r.key, r.pos.clone());
        }
      }
    }
  });
}

test('the Coach: push-ups leave the bar down beside him, the press and the squats hold it, the lunges wear it, the drag drags it', () => {
  const bar = PROP_SPECS.coach.bar;
  assert.equal(modeFor(bar, { play: 'pushups', t01: 0.5 }), 'set');
  assert.equal(modeFor(bar, { play: 'clean-press', t01: 0.5 }), 'hands');
  assert.equal(modeFor(bar, { play: 'squats', t01: 0.5 }), 'worn');
  assert.equal(modeFor(bar, { play: 'lunge-round', t01: 0.5 }), 'worn');
  assert.equal(modeFor(bar, { play: 'drag-round', t01: 0.5 }), 'dragged');
  assert.equal(modeFor(bar, { play: 'sprint', t01: 0.5 }), 'set', 'he leaves it and jogs');
  assert.equal(modeFor(bar, {}), 'set');
});

test('the bar in the press rises on a vertical path in front of him', () => {
  const x = stage('coach');
  const dt = 1 / 30;
  let now = 1;
  for (let i = 0; i < 40; i++) { now += dt; step(x, null, 0, dt, now); }
  const len = PLAYS['clean-press'][PLAYS['clean-press'].length - 1][0];
  const zs = [];
  let top = -1;
  for (let t = 0; t <= len; t += dt) {
    now += dt; step(x, 'clean-press', t, dt, now);
    const p = x.props.props[0].pos;
    if (t / len > 0.25 && t / len < 0.75) { zs.push(p.z); top = Math.max(top, p.y); }
  }
  const spread = Math.max(...zs) - Math.min(...zs);
  assert.ok(Math.min(...zs) > 0.2, `the bar came within ${Math.min(...zs).toFixed(3)} of his front`);
  assert.ok(spread < 0.12, `the bar wandered ${spread.toFixed(3)} front to back`);
  assert.ok(top > 0.6, `the press only reached ${top.toFixed(3)}`);
});

test('a dragged bar keeps one end on the floor', () => {
  const x = stage('coach');
  const dt = 1 / 30;
  let now = 1;
  for (let i = 0; i < 40; i++) { now += dt; step(x, null, 0, dt, now); }
  const len = PLAYS['drag-round'][PLAYS['drag-round'].length - 1][0];
  let n = 0, onFloor = 0;
  for (let t = 0; t <= len; t += dt) {
    now += dt; const info = step(x, 'drag-round', t, dt, now);
    const pr = x.props.props[0];
    // (while he steps up behind the glass or back down, the floor under the
    // tail is easing to his; only a settled floor is checked)
    if (pr.w.dragged > 0.98 && Math.abs(info.floor - pr.tf) < 0.05) {
      n++;
      const low = Math.min(...pr.pts.map((p) => p.clone().applyQuaternion(pr.quat).add(pr.pos).y));
      if (Math.abs(low - pr.tf) < 0.02) onFloor++;
    }
  }
  assert.ok(n > 80, `only ${n} frames dragged`);
  // (a turn can lift the tail a moment as he swings round past it)
  assert.ok(onFloor / n > 0.97, `the tail was on the floor in only ${onFloor} of ${n} dragged frames`);
});
