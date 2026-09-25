// The Habitat's contract (design/AGENT-WORLD-PLAN.md §9b): seven sets on the
// seven tiles scene.js draws, each on the back half of its tile, with the
// anchors the life engine maps onto, lanes the beings can only walk along,
// and lamps that fade and then stop (so the map's frame loop can sleep).
// three's geometry runs in node; the only browser thing the kit needs is a
// canvas for its glow and contact-shadow textures, stubbed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// a 2D context that accepts every call and draws nothing
const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
if (!globalThis.document) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { createBeingKit } = await import('../../src/agentWorld/beings.js');
const { createHabitat, LAYOUT, LANES, districtPosition, tileRadius } = await import('../../src/agentWorld/habitat.js');

const C = (h) => new THREE.Color(h);
const TK = {
  key: C('#fff2e2'), fill: C('#bcd4ff'), rim: C('#9fdcff'), shell: C('#c9d3e4'), em: 1, env: 0.72,
  stage: C('#0d1426'), gold: C('#e0b26a'), ink: C('#e8ecf6'), void: C('#06070d'),
  hue: {
    cy: C('#59e6ff'), vi: C('#8f7bff'), mg: C('#ff7ad9'), good: C('#5fe8a8'), gold: C('#e0b26a'),
    chest: C('#ff8a7a'), back: C('#4fd1c5'), shoulders: C('#ffc46b'), quads: C('#7ab8ff'), calves: C('#8fd3ff'),
    abs: C('#ffd66b'), triceps: C('#b48cff'), biceps: C('#5fe8a8'), glutes: C('#c98bff'),
  },
};
const kit = createBeingKit(THREE, TK);
const H = createHabitat(THREE, TK, kit);
H.group.updateMatrixWorld(true);

// §9b, written out here rather than imported, so the test is the spec
const ANCHORS = {
  train: ['work', 'rest', 'barDock'],
  knowledge: ['work:researcher', 'rest:researcher', 'work:watcher', 'rest:watcher', 'work:librarian', 'rest:librarian', 'screen', 'lamp'],
  logistics: ['work', 'rest', 'mast'],
  fuel: ['work', 'rest', 'stove'],
  platform: ['work', 'rest', 'lanternDock', 'pad'],
  money: ['work', 'rest', 'stack'],
  mind: ['work', 'rest', 'lantern'],
};
const IDS = Object.keys(ANCHORS);
const flat = (p, c) => Math.hypot(p.x - c.x, p.z - c.z);

test('LAYOUT is scene.js\'s layout, number for number', async () => {
  const src = await readFile(path.join(ROOT, 'src/orgmap/scene.js'), 'utf8');
  const num = (re) => Number(src.match(re)[1]);
  const obj = (re) => JSON.parse(src.match(re)[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'));
  assert.equal(LAYOUT.RD, num(/const RD = ([\d.]+)/));
  assert.equal(LAYOUT.RX, num(/const RX = ([\d.]+)/));
  assert.equal(LAYOUT.RZ, num(/RZ = ([\d.]+);/));
  assert.equal(LAYOUT.BEING_SCALE, num(/const BEING_SCALE = ([\d.]+)/));
  assert.deepEqual(LAYOUT.ORDER, obj(/const ORDER = (\[[^\]]*\])/));
  assert.deepEqual(LAYOUT.TILE_R, obj(/const TILE_R = (\{[^}]*\})/));
  assert.deepEqual(LAYOUT.HUE_OF, obj(/const HUE_OF = (\{[^}]*\})/));
  // and the placement formula scene.js uses
  LAYOUT.ORDER.forEach((id, i) => {
    const th = Math.PI + i * (2 * Math.PI / LAYOUT.ORDER.length);
    const p = districtPosition(THREE, id);
    assert.ok(Math.abs(p.x - Math.sin(th) * LAYOUT.RD * LAYOUT.RX) < 1e-9 && Math.abs(p.z - Math.cos(th) * LAYOUT.RD * LAYOUT.RZ) < 1e-9, id);
  });
});

test('seven districts, each with exactly the anchors §9b names, all inside the tile', () => {
  assert.deepEqual(Object.keys(H.districts).sort(), [...IDS].sort());
  for (const id of IDS) {
    const d = H.districts[id];
    assert.deepEqual(Object.keys(d.anchors).sort(), [...ANCHORS[id]].sort(), id);
    const c = districtPosition(THREE, id);
    for (const [name, a] of Object.entries(d.anchors)) {
      assert.ok(a.pos instanceof THREE.Vector3 && Number.isFinite(a.yaw), `${id}.${name} is { pos, yaw }`);
      assert.ok(flat(a.pos, c) <= 0.8 * tileRadius(id) + 1e-9, `${id}.${name} is ${flat(a.pos, c).toFixed(3)} from the centre`);
    }
    assert.equal(typeof d.setLit, 'function'); assert.equal(typeof d.setDaypart, 'function');
  }
  assert.deepEqual(Object.keys(H.plaza.anchors).sort(), ['bench0', 'bench1', 'bench2', 'bench3', 'post']);
});

// what a piece is made of, in the district's own frame: every real vertex
// (not the contact shadow, not a glow sprite)
function pieceVerts(d, p) {
  const out = [], v = new THREE.Vector3(), inv = new THREE.Matrix4().copy(d.group.matrixWorld).invert();
  p.traverse((o) => {
    if (!o.isMesh || o.userData.contact) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i += 3) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); out.push(v.clone()); }
  });
  return out;
}

test('at most three pieces a district, each on the back half, none taller than 1.1, none off its tile', () => {
  for (const id of IDS) {
    const d = H.districts[id];
    assert.ok(d.pieces.length >= 1 && d.pieces.length <= 3, `${id} has ${d.pieces.length} pieces`);
    const R = tileRadius(id) - 0.05 + 0.01;     // the tile's flat top, plus a hair
    for (const p of d.pieces) {
      const vs = pieceVerts(d, p), box = new THREE.Box3().setFromPoints(vs);
      const cz = (box.min.z + box.max.z) / 2;
      assert.ok(cz <= 0.05, `${id}/${p.name} centre z ${cz.toFixed(3)} is on the front half`);
      assert.ok(box.max.y <= 1.1, `${id}/${p.name} is ${box.max.y.toFixed(3)} tall`);
      const off = vs.find((q) => q.y > -0.005 && (Math.abs(q.x) > R * Math.sqrt(3) / 2 || Math.abs(q.z) + Math.abs(q.x) / Math.sqrt(3) > R));
      assert.ok(!off, `${id}/${p.name} leaves its tile at ${off && off.toArray().map((n) => n.toFixed(2))}`);
    }
  }
});

// distance from the ring lane's ellipse, from a spoke, from the plaza ring
const ELL = Array.from({ length: 4000 }, (_, k) => { const t = k / 4000 * Math.PI * 2; return new THREE.Vector3(Math.sin(t) * LANES.a, 0, Math.cos(t) * LANES.b); });
const offRing = (p) => Math.min(...ELL.map((e) => flat(p, e)));
function offSegment(p, a, b) {
  const ax = b.x - a.x, az = b.z - a.z, l = ax * ax + az * az;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.z - a.z) * az) / l));
  return Math.hypot(p.x - (a.x + ax * t), p.z - (a.z + az * t));
}
const spokes = LAYOUT.ORDER.map((id) => [H.lanes.nodes['ring:' + id], H.lanes.nodes['spoke:' + id]]);
const offLanes = (p) => Math.min(offRing(p), Math.abs(Math.hypot(p.x, p.z) - LANES.plazaR), ...spokes.map(([a, b]) => offSegment(p, a, b)));
const insideTile = (p) => LAYOUT.ORDER.find((id) => flat(p, districtPosition(THREE, id)) < 0.6 * tileRadius(id));

function checkRoute(a, b) {
  const r = H.lanes.route(a, b);
  assert.ok(Array.isArray(r) && r.length >= 2, `${a} -> ${b} has a route`);
  assert.ok(flat(r[0], H.lanes.nodes[a]) < 1e-9 && flat(r[r.length - 1], H.lanes.nodes[b]) < 1e-9, `${a} -> ${b} starts and ends where it says`);
  const homeEnd = (i) => (i === 0 && a.startsWith('home:')) || (i === r.length - 1 && b.startsWith('home:'));
  r.forEach((p, i) => {
    if (homeEnd(i)) return;
    assert.ok(offLanes(p) <= 0.12, `${a} -> ${b}: point ${i} is ${offLanes(p).toFixed(3)} off the lanes`);
    assert.ok(!insideTile(p), `${a} -> ${b}: point ${i} is inside the ${insideTile(p)} tile`);
    assert.ok(Math.hypot(p.x, p.z) > 0.78, `${a} -> ${b}: point ${i} is on the plinth`);
  });
  // and between the points: every segment that does not leave a home stays on a lane
  for (let i = 1; i < r.length; i++) {
    if (homeEnd(i) || homeEnd(i - 1)) continue;
    for (let k = 1; k < 8; k++) {
      const q = r[i - 1].clone().lerp(r[i], k / 8);
      assert.ok(offLanes(q) <= 0.12, `${a} -> ${b}: segment ${i} leaves the lanes`);
    }
  }
  return r;
}

test('routes follow the lanes only, the short way round, never across a tile or the plinth', () => {
  checkRoute('home:coach', 'post');
  const tf = checkRoute('ring:train', 'ring:fuel');
  // train and fuel are neighbours at the front: the short way is along the front
  assert.ok(tf.every((p) => p.z > 0), 'train to fuel goes round the front, not the back');
  const names = Object.keys(H.lanes.nodes);
  for (const a of names.filter((n) => n.startsWith('home:'))) checkRoute(a, 'post');
  for (const a of LAYOUT.ORDER) for (const b of LAYOUT.ORDER) if (a !== b) checkRoute('ring:' + a, 'ring:' + b);
  assert.equal(H.lanes.route('home:nobody', 'post'), null);
});

// a tile's hex as scene.js draws it (shape angle a -> world (cos a, -sin a) * r)
function inHex(p, id, grow) {
  const c = districtPosition(THREE, id), R = tileRadius(id) + (grow || 0);
  const x = Math.abs(p.x - c.x), z = Math.abs(p.z - c.z);
  return x <= R * Math.sqrt(3) / 2 && z + x / Math.sqrt(3) <= R;
}

test('the lanes run clear of every tile: the ring and the spokes never cross one', () => {
  // both edges of the ring band, all the way round, and both edges of every spoke
  const edges = [];
  for (let k = 0; k < 1440; k++) {
    const t = k / 1440 * Math.PI * 2, p = new THREE.Vector3(Math.sin(t) * LANES.a, 0, Math.cos(t) * LANES.b);
    const n = new THREE.Vector3(Math.sin(t) / LANES.a, 0, Math.cos(t) / LANES.b).normalize();
    edges.push(p.clone().addScaledVector(n, LANES.w / 2), p.clone().addScaledVector(n, -LANES.w / 2));
  }
  for (const [a, b] of spokes) {
    const n = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize();
    for (let k = 0; k <= 40; k++) { const p = a.clone().lerp(b, k / 40); edges.push(p.clone().addScaledVector(n, LANES.w / 2), p.clone().addScaledVector(n, -LANES.w / 2)); }
  }
  for (const q of edges) {
    const id = LAYOUT.ORDER.find((d) => inHex(q, d, 0.03));
    assert.ok(!id, `a lane edge at ${q.x.toFixed(2)},${q.z.toFixed(2)} is on the ${id} tile`);
  }
  assert.ok(LANES.w <= 0.18, 'a path, not a road');
});

test('no set piece stands on a lane or across a being\'s way to it', () => {
  // every piece's real surface, in world space
  const solid = [];
  for (const id of IDS) {
    const d = H.districts[id];
    for (const p of d.pieces) pieceVerts(d, p).forEach((v) => solid.push({ name: `${id}/${p.name}`, x: v.x + d.pos.x, y: v.y, z: v.z + d.pos.z }));
  }
  const nearest = (q, minY) => {
    let best = null, bd = Infinity;
    for (const s of solid) { if (s.y < minY) continue; const dd = Math.hypot(s.x - q.x, s.z - q.z); if (dd < bd) { bd = dd; best = s; } }
    return { d: bd, name: best && best.name };
  };
  const lanePts = ELL.filter((_, k) => k % 8 === 0).concat(...spokes.map(([a, b]) => Array.from({ length: 20 }, (_, k) => a.clone().lerp(b, k / 19))));
  for (const q of lanePts) { const n = nearest(q, -1); assert.ok(n.d >= LANES.w / 2, `${n.name} is ${n.d.toFixed(3)} from the lane at ${q.x.toFixed(2)},${q.z.toFixed(2)}`); }
  // the walk from each home out to the ring lane keeps a body's width
  // clear of anything above the ankle (a floor plate or a rug may be crossed)
  for (const home of Object.keys(H.lanes.nodes).filter((k) => k.startsWith('home:'))) {
    const r = H.lanes.route(home, 'post'), a = r[0], b = r[1];
    for (let k = 1; k <= 20; k++) {
      const q = a.clone().lerp(b, k / 20), n = nearest(q, 0.05);
      assert.ok(n.d >= 0.15, `${n.name} is ${n.d.toFixed(3)} from ${home}'s way out`);
    }
  }
  // a being standing at a work or rest spot is not standing inside a piece
  // (a seat is meant to be sat in, so `sit` spots are left out)
  for (const id of IDS) {
    for (const [name, a] of Object.entries(H.districts[id].anchors)) {
      if (!/^(work|rest)/.test(name) || a.sit) continue;
      const n = nearest(a.pos, 0.05);
      assert.ok(n.d >= 0.14, `${id}.${name} stands ${n.d.toFixed(3)} from ${n.name}`);
    }
  }
});

const settleAll = () => { let n = 0; while (H.tick(n * 0.05, 0.05) && n < 400) n++; return n; };

test('lamps fade over about 0.6 s and then stop; zero elapsed time moves nothing', () => {
  H.settle();
  assert.equal(H.tick(0, 0.016), false, 'an idle habitat asks for no frames');
  H.districts.train.setLit(true);
  const L = H.districts.train.lamps.find((x) => x.lit);
  assert.equal(H.tick(0, 0), true); assert.equal(L.level, 0, 'no time, no movement');
  const n = settleAll();
  assert.ok(n >= 10 && n <= 14, `the fade took ${n} steps of 50 ms`);
  assert.ok(H.districts.train.props.rackLamp.emissiveIntensity > 0);
  H.districts.train.setLit(false); settleAll();
});

test('night lights the tower, the paper lantern and the plaza lamps; setLit(false) leaves district lamps dark', () => {
  IDS.forEach((id) => H.districts[id].setLit(true));
  settleAll();
  IDS.forEach((id) => H.districts[id].setLit(false));
  H.setDaypart('night');
  settleAll();
  assert.ok(H.districts.platform.props.lantern.emissiveIntensity > 0, 'the tower is lit at night');
  assert.ok(H.districts.mind.props.lantern.emissiveIntensity > 0, 'the paper lantern is lit at night');
  H.plaza.props.lamps.forEach((m, i) => assert.ok(m.emissiveIntensity > 0, `plaza lamp ${i} is lit at night`));
  for (const id of IDS) for (const L of H.districts[id].lamps) {
    if (L.lit && !L.night) assert.equal(L.m.emissiveIntensity, 0, `${id}: a loop lamp is lit with no loop`);
  }
  H.setDaypart('day'); settleAll();
  assert.equal(H.districts.platform.props.lantern.emissiveIntensity, 0, 'the tower is dark by day');
  H.plaza.props.lamps.forEach((m) => assert.equal(m.emissiveIntensity, 0));
});

test('the plaza pulse flashes once and ends', () => {
  H.settle();
  H.plaza.pulse(10);
  assert.equal(H.tick(10.3, 0.05), true);
  assert.ok(H.plaza.props.pulseRing.scale.x > 1);
  assert.equal(H.tick(10.9, 0.05), false);
  assert.equal(H.plaza.props.pulseRing.scale.x, 1);
});

test('dispose takes the habitat out of the scene and its lamps out of the kit', () => {
  const kit2 = createBeingKit(THREE, TK), H2 = createHabitat(THREE, TK, kit2), parent = new THREE.Group();
  parent.add(H2.group);
  const before = kit2.EMISSIVES.length;
  assert.ok(before > 0);
  H2.dispose();
  assert.equal(H2.group.parent, null);
  assert.equal(kit2.EMISSIVES.length, 0, 'the kit keeps no habitat lamps');
});
