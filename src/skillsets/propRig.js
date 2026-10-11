// THE PROPS AS THEIR OWN THINGS (his 11 Oct note: "the barbell go[es]
// through his body and ... moves beneath the ground when doing push ups ...
// make sure that the accessories and equipment ... do not necessarily move
// in the same axis and direction as them when it is not relevant").
//
// beings.js builds each prop as a child of the body, so it pitched, yawed
// and ran with him. Here every managed prop is split in two:
//   - the PROXY: the original group, left where beings.js put it. The tell
//     and the acts keep writing to it, so "where the rig would hold it" is
//     still known every frame.
//   - the VISUAL: the meshes, moved under `homeF`, a frame fixed at his home
//     spot in his lane (no yaw, no pitch). Code places it every frame.
//
// Each prop is in one of these modes, blended (never snapped):
//   rig      held the way the being's own tell holds it (the proxy)
//   hands    held at the hand bones (midpoint, or one hand), body-aligned
//   worn     on his back or shoulders (a fixed place in the body's frame)
//   set      on the floor at a fixed spot by his home (or where it fell)
//   dragged  one end in his hand, the other on the floor, trailing with lag
// and, after the blend, two guards: a floor clamp (no point of it under the
// floor) and a push out of the body (no point of it inside his body or head).
//
// Pure tables first (who carries what, in which mode, in which play); the
// runtime below takes THREE from its caller so a node:test can drive it on
// the real rigs.

import { BACK, TOP } from './plays.js';

export const MODES = ['rig', 'hands', 'worn', 'set', 'dragged'];

// the Coach's bar, explicitly: the shaft and the plates' rims (its bounding
// box would put points in the empty air between the plates)
const BAR_PTS = (() => {
  const p = [];
  for (let x = -0.49; x <= 0.491; x += 0.07) p.push([x, 0, 0]);
  [-1, 1].forEach((s) => [0.37, 0.452].forEach((o) => {
    for (let a = 0; a < 8; a++) p.push([s * o, 0.135 * Math.cos(a * Math.PI / 4), 0.135 * Math.sin(a * Math.PI / 4)]);
  }));
  return p;
})();

// Per agent, per prop:
//   key     b.props key (or `child` of another prop's group)
//   idle    mode when he stands about / does a small play
//   travel  mode during a big play that has no entry in `plays`
//   work    mode while Working (the tell's own animation)
//   plays   { play: mode | [[t01, mode], ...] }
//   anchor  for `hands`: 'both' | 'L' | 'R', and `lift` above the grip
//   spot    [x, y, z] rig units from his home feet, for `set` (null: where
//           it falls), `spotRot` its rotation there
//   worn    { p, r } in the body's frame
//   grip    sides the tell holds it with: they relax while it is down, and
//           reach for it while it is picked up or put down
//   swing   spring-lag on its own pivot: { k, c, g, max } (hanging: g > 0)
export const PROP_SPECS = {
  coach: {
    bar: {
      idle: 'set', travel: 'set', work: 'rig', pin: 'rig', anchor: 'both', lift: 0.035,
      spot: [0, 0.135, 0.46], pts: BAR_PTS, arc: 0.85,
      worn: { p: [0, 0.6, -0.36], r: [0, 0, 0] },
      wornGrip: [[-0.3, 0, 0, 'L'], [0.3, 0, 0, 'R']],
      drag: { len: 0.9, r: 0.135, side: 'R', hand: [0.38, 0.22, -0.18] },
      plays: {
        'clean-press': [[0, 'set'], [0.08, 'hands'], [0.9, 'set']],
        // off the floor, over his head and onto his back (the arc), and back
        squats: [[0, 'set'], [0.08, 'worn'], [0.86, 'set']],
        'lunge-round': [[0, 'set'], [0.04, 'worn'], [0.9, 'set']],
        'drag-round': [[0, 'set'], [0.06, 'dragged'], [0.92, 'set']],
        // push-ups: he walks off to the side; the bar stays down beside him
        pushups: 'set',
      },
    },
  },
  librarian: {
    books: { idle: 'rig', travel: 'rig', work: 'rig', grip: ['L'], swing: { k: 60, c: 7, g: -0.05, max: 0.22 } },
    // the outermost volume: the one that slips off the stack
    book1: { child: ['books', 2], idle: 'rig', travel: 'rig', work: 'rig', spot: null, spotRot: [0, 0.4, Math.PI / 2], fall: true,
      plays: { 'drop-book': [[0, 'rig'], [0.2, 'set'], [0.7, 'rig']] } },
  },
  cfo: {
    ledger: { idle: 'rig', travel: 'rig', work: 'rig', grip: ['L'], spot: [-0.46, 0.02, 0.52], spotRot: [-Math.PI / 2, 0, 0.3],
      plays: { 'count-coins': [[0, 'rig'], [0.06, 'set'], [0.9, 'rig']] }, swing: { k: 90, c: 10, g: -0.02, max: 0.1 } },
    // the month's receipts stand on the floor by his slab, not at his feet
    stack: { idle: 'set', travel: 'set', work: 'set', pin: 'rig', spot: [0.44, 0, 0.56] },
  },
  guardian: {
    lantern: { idle: 'hands', travel: 'hands', work: 'hands', pin: 'hands', anchor: 'L', lift: 0.02, plumb: true,
      swing: { k: 26, c: 2.2, g: 0.09, max: 0.7, step: 0.05 } },
  },
  mealprep: {
    pot: { idle: 'rig', travel: 'set', work: 'rig', grip: ['L', 'R'], spot: [0.44, 0, 0.52],
      plays: { chop: [[0, 'rig'], [0.05, 'set'], [0.92, 'rig']], stir: 'rig', 'taste-ladle': 'rig' } },
  },
  researcher: {
    book: { idle: 'rig', travel: 'rig', work: 'rig', grip: ['L', 'R'], spot: [-0.4, 0.02, 0.52], spotRot: [-Math.PI / 2, 0, -0.2],
      plays: { 'magnify-low': [[0, 'rig'], [0.08, 'set'], [0.9, 'rig']] } },
  },
  watcher: {
    bucket: { idle: 'rig', travel: 'rig', work: 'rig', swing: { k: 50, c: 6, g: -0.04, max: 0.2 } },
  },
  leader: {
    // the orb floats: it wobbles on its own spring as he moves
    orb: { idle: 'rig', travel: 'rig', work: 'rig', swing: { k: 40, c: 5, g: -0.03, max: 0.15 } },
  },
};

// the big plays (they leave his spot): mode `travel` unless listed
const TRAVEL = new Set(['round', 'zoom', 'over', 'hide', 'jump', 'perch', 'lean', 'leanL', 'sprint', 'spin',
  'lunge-round', 'drag-round', 'jog-round', 'drop-book', 'audit', 'sentry', 'dash', 'sleuth', 'march', 'drift', 'stride', 'twirl', 'patrol-lamp']);

// The mode a prop wants now. Pure.
export function modeFor(spec, { play = null, t01 = 0, working = false, pin = false } = {}) {
  if (pin) return spec.pin || spec.idle;
  if (working) return spec.work || spec.idle;
  if (play && spec.plays && spec.plays[play] != null) {
    const p = spec.plays[play];
    if (typeof p === 'string') return p;
    let m = p[0][1];
    for (const [t, mm] of p) if (t01 >= t) m = mm;
    return m;
  }
  if (play && TRAVEL.has(play)) return spec.travel || spec.idle;
  return spec.idle;
}

// ---- the runtime ------------------------------------------------------------
export function createPropRig(THREE, x, scene) {
  const b = x.b, specs = PROP_SPECS[x.id] || {};
  const homeF = new THREE.Group();
  homeF.visible = false; scene.add(homeF);
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = V(), _q = Q(), _s = V(), _v = V(), _w = V(), _acc = V(), _e = new THREE.Euler();
  const _qa = Q(), _qb = Q(), _gi = new THREE.Matrix4(), _ti = new THREE.Matrix4();

  // the body's own shape, for the push-out: radius by height (from the
  // lathe's vertices, in the group's frame) and the head as an ellipsoid
  const prof = [];
  if (b.body && b.body.geometry) {
    const pos = b.body.geometry.attributes.position, sc = b.body.scale, off = b.body.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) * sc.y + off.y, r = Math.hypot(pos.getX(i) * sc.x, pos.getZ(i) * sc.z);
      const bin = Math.round(y / 0.04);
      prof[bin] = Math.max(prof[bin] || 0, r);
    }
  }
  const radiusAt = (y) => { const r = prof[Math.round(y / 0.04)]; return r == null ? -1 : r; };
  const H = b.H || { hx: 0.3, hy: 0.26, hz: 0.28 };
  const head = b.head ? b.head.position.clone() : new THREE.Vector3(0, 0.8, 0);

  const props = [];
  // the children first (a child prop leaves an empty group in its parent)
  const order = Object.entries(specs).sort((a, b2) => (b2[1].child ? 1 : 0) - (a[1].child ? 1 : 0));
  for (const [key, spec] of order) {
    let proxy = spec.child ? (b.props && b.props[spec.child[0]] && b.props[spec.child[0]].children[spec.child[1]]) : b.props && b.props[key];
    if (!proxy) continue;
    const vis = new THREE.Group();
    vis.name = 'prop:' + key;
    for (const c of proxy.children.slice()) vis.add(c);
    homeF.add(vis);
    // its sample points, in its own frame
    let pts = spec.pts;
    if (!pts) {
      const bb = new THREE.Box3();
      vis.updateMatrixWorld(true);
      vis.position.set(0, 0, 0); vis.quaternion.identity(); vis.scale.set(1, 1, 1); vis.updateMatrixWorld(true);
      _inv.copy(vis.matrixWorld).invert();
      vis.traverse((o) => { if (o.isMesh && o.geometry && !o.isSprite && !(o.material && o.material.transparent && !o.material.depthWrite)) { o.geometry.computeBoundingBox(); const g = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(_inv); bb.union(g); } });
      pts = [];
      if (!bb.isEmpty()) for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) pts.push([bb.min.x + (bb.max.x - bb.min.x) * fx, bb.min.y + (bb.max.y - bb.min.y) * fy, bb.min.z + (bb.max.z - bb.min.z) * fz]);
    }
    const minY = pts.reduce((m, p) => Math.min(m, p[1]), 0);
    props.push({
      key, spec, proxy, vis, pts: pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), restY: -minY,
      w: Object.fromEntries(MODES.map((m) => [m, 0])), mode: null, pos: V(), quat: Q(), scl: V().set(1, 1, 1),
      spot: null, tail: null, prev: null, vel: V(), ang: [0, 0], angV: [0, 0], lagP: null, init: false, corr: 0,
    });
  }

  // placed parent first, so a child prop reads its parent's place this frame
  props.sort((a, b2) => (a.spec.child ? 1 : 0) - (b2.spec.child ? 1 : 0));
  const rec = (v, a) => v.set(a[0], a[1], a[2]);
  // world -> homeF frame
  function toH(vw) { return vw.applyMatrix4(_inv); }

  // where each mode would put it now (H frame), into _p/_q
  function target(pr, mode, info) {
    const sp = pr.spec;
    if (mode === 'rig') {
      pr.proxy.updateWorldMatrix(true, false);
      _m.multiplyMatrices(_inv, pr.proxy.matrixWorld); _m.decompose(_p, _q, _s);
    } else if (mode === 'hands') {
      const A = b.arms;
      if (sp.anchor === 'both') { A.L.hand.getWorldPosition(_v); A.R.hand.getWorldPosition(_w); _p.copy(_v).add(_w).multiplyScalar(0.5); }
      else A[sp.anchor || 'R'].hand.getWorldPosition(_p);
      toH(_p);
      _p.y += (sp.lift || 0) * (info.sq || 1);
      if (sp.plumb) _q.identity();
      else { b.group.getWorldQuaternion(_q); homeF.getWorldQuaternion(_qa); _q.premultiply(_qa.invert()); }
    } else if (mode === 'worn') {
      rec(_p, sp.worn.p).applyMatrix4(b.group.matrixWorld); toH(_p);
      _e.set(sp.worn.r[0], sp.worn.r[1], sp.worn.r[2]); _q.setFromEuler(_e);
      b.group.getWorldQuaternion(_qa); homeF.getWorldQuaternion(_qb); _q.premultiply(_qa).premultiply(_qb.invert());
    } else if (mode === 'set') {
      if (!pr.spot) {
        // where it is now, down on the floor
        // (it lands out in front of the line he walks, never under his feet)
        pr.spot = { p: V().set(pr.pos.x, pr.restY, Math.max(0.5, pr.pos.z)), q: Q() };
        if (sp.spotRot) pr.spot.q.setFromEuler(_e.set(sp.spotRot[0], sp.spotRot[1], sp.spotRot[2]));
        if (sp.spot) rec(pr.spot.p, sp.spot);
      }
      _p.copy(pr.spot.p); _q.copy(pr.spot.q);
    } else if (mode === 'dragged') {
      const d = sp.drag;
      b.arms[d.side].hand.getWorldPosition(_v); toH(_v);
      // the floor it slides on follows his (a step up behind the glass is
      // eased, so the tail never jumps)
      pr.tf = pr.tf == null ? info.floor : pr.tf + (info.floor - pr.tf) * Math.min(1, info.dtp * 4);
      const floor = pr.tf + d.r;
      // his body's centre: the tail trails on the far side of the hand from it
      _w.setFromMatrixPosition(b.group.matrixWorld); toH(_w);
      if (!pr.tail) {
        // it starts out trailing behind the way he faces (he pulls it, never pushes it)
        _s.set(0, 0, 1).transformDirection(b.group.matrixWorld).transformDirection(_inv);
        pr.away = _v.z >= _w.z ? 1 : -1; pr.tailRz = pr.away * 0.3;
        pr.tail = V().set(_v.x + (_s.x < 0 ? 1 : -1) * d.len * 0.9, floor, _v.z + pr.tailRz);
      }
      const away = pr.away;
      // the tail end: on the floor, its length from the hand, where it was
      // pulled from (it swings round behind him when he turns). Depth is
      // kept relative to the hand, so behind the glass it is behind with him.
      const dy = Math.max(0, _v.y - floor), hl = Math.sqrt(Math.max(0.0001, d.len * d.len - dy * dy));
      let rx = pr.tail.x - _v.x, rz = away * Math.max(0.25, Math.abs(pr.tailRz));
      const n = Math.hypot(rx, rz) || 1e-4;
      rx = (rx / n) * hl; rz = (rz / n) * hl;
      // which way along the floor it trails: kept until it is clearly the other way
      if (pr.sx == null || Math.abs(rx) > 0.3) pr.sx = rx < 0 ? -1 : 1;
      // when he walks back past it, it swings round through depth (behind
      // him) instead of being shoved ahead
      if (Math.abs(rz) > hl * 0.98) { rz = Math.sign(rz) * hl * 0.98; rx = pr.sx * Math.sqrt(Math.max(0, hl * hl - rz * rz)); }
      pr.tail.set(_v.x + rx, floor, _v.z + rz); pr.tailRz = rz;
      _w.copy(_v).sub(pr.tail).normalize();
      _q.setFromUnitVectors(_s.set(1, 0, 0), _w);
      // the bar's centre: halfway between the sleeve in the hand and the tail
      _p.copy(_v).add(pr.tail).multiplyScalar(0.5);
    }
  }

  return {
    homeF,
    props,
    // for a still (the slab portraits): each prop back where beings.js put
    // it, and then home to its own frame again
    still(on) {
      for (const pr of props) {
        if (on) { pr.proxy.add(pr.vis); pr.vis.position.set(0, 0, 0); pr.vis.quaternion.identity(); pr.vis.scale.set(1, 1, 1); }
        else { homeF.add(pr.vis); pr.init = false; }
      }
    },
    // before the overlay is applied: the hands that must hold, reach for,
    // or let go of a prop; and the bend that goes with picking one up
    pre(ctx, info) {
      if (!props.length) return;
      homeF.updateWorldMatrix(true, false);
      b.group.updateWorldMatrix(true, false);
      _gi.copy(b.group.matrixWorld).invert();
      let bend = 0;
      const wrote = { L: false, R: false };
      for (const pr of props) {
        if (!pr.init) continue;
        const sp = pr.spec;
        const wDown = pr.w.set;
        // the worn bar: both hands on it
        if (pr.w.worn > 0.05 && sp.wornGrip) {
          for (const g of sp.wornGrip) {
            if (info.armsTaken[g[3]] || wrote[g[3]]) continue;
            _v.set(g[0], g[1], g[2]).applyQuaternion(pr.quat).add(pr.pos).applyMatrix4(homeF.matrixWorld).applyMatrix4(_gi);
            const s = g[3] === 'L' ? -1 : 1;
            ctx.arm(g[3], [_v.x, _v.y, _v.z], [s, -0.7, -0.2], [0, 0, -1], Math.min(1, pr.w.worn * 1.2));
            wrote[g[3]] = true;
          }
        }
        // dragging: the hand low and behind, the body leaning into it
        if (pr.w.dragged > 0.05 && sp.drag && !info.armsTaken[sp.drag.side] && !wrote[sp.drag.side]) {
          const s = sp.drag.side === 'L' ? -1 : 1;
          ctx.arm(sp.drag.side, [s * Math.abs(sp.drag.hand[0]), sp.drag.hand[1], sp.drag.hand[2]], [s, 0, -0.6], [-s, 0, 0], pr.w.dragged);
          wrote[sp.drag.side] = true;
        }
        // a tell-held prop that is down: those hands let go; while it goes
        // down or comes up, they reach for it
        if (sp.grip && wDown > 0.02) {
          const moving = Math.abs(pr.w.set - (pr.mode === 'set' ? 1 : 0)) > 0.03;
          for (const side of sp.grip) {
            if (info.armsTaken[side] || wrote[side]) continue;
            const s = side === 'L' ? -1 : 1;
            if (moving) {
              _v.copy(pr.pos).applyMatrix4(homeF.matrixWorld).applyMatrix4(_gi);
              ctx.arm(side, [_v.x + s * 0.08 * sp.grip.length / 2, _v.y + 0.04, _v.z], [s, -0.3, -0.5], [-s, 0, 0], 1);
            } else ctx.arm(side, [s * 0.29, 0.21, 0.07], [s * 0.4, 0, -1], [-s, 0, 0.1], wDown);
            wrote[side] = true;
          }
          if (moving && pr.pos.y < 0.35) bend = Math.max(bend, Math.sin(Math.PI * Math.min(1, Math.max(0, pr.w.set))));
        }
        // the bar (no tell grip): a bend while it is lifted from the floor
        if (!sp.grip && sp.anchor === 'both' && pr.w.set > 0.03 && pr.w.set < 0.97 && pr.pos.y < 0.3) bend = Math.max(bend, Math.sin(Math.PI * pr.w.set) * 0.7);
      }
      if (bend > 0.01 && !info.bodyTaken) ctx.body({ pitch: 0.38 * bend, y: -0.07 * bend });
    },

    // after the overlay: place every prop
    post(info) {
      if (!props.length) return;
      homeF.updateWorldMatrix(true, true);
      x.holder.updateMatrixWorld(true);
      _inv.copy(homeF.matrixWorld).invert();
      _ti.copy(b.group.matrixWorld).invert();
      const dt = Math.max(1e-4, Math.min(0.1, info.dt || 1 / 60));
      info.dtp = dt;
      for (const pr of props) {
        const mode = modeFor(pr.spec, info);
        if (mode !== pr.mode) {
          if (mode === 'set' && pr.mode !== 'set') pr.spot = null;
          if (mode === 'dragged') { pr.tail = null; pr.sx = null; pr.tf = null; }
          pr.mode = mode;
          // a transition: from wherever the weights are, eased in and out,
          // so a prop starts and ends each move at rest (no jolt)
          pr.from = { ...pr.w }; pr.u = 0;
        }
        // weights: eased toward this mode (snapped only when he was moved)
        const snap = !pr.init || info.snap || info.rm;
        const dur = pr.spec.fall ? (mode === 'set' ? 0.4 : 1.0) : mode === 'worn' || (pr.from && pr.from.worn > 0.5) ? 0.9 : 0.55;
        pr.u = snap ? 1 : Math.min(1, (pr.u ?? 1) + dt / dur);
        const e = pr.u * pr.u * (3 - 2 * pr.u);
        let sum = 0;
        for (const m of MODES) {
          const to = m === mode ? 1 : 0;
          pr.w[m] = snap || !pr.from ? to : pr.from[m] * (1 - e) + to * e;
          if (pr.w[m] < 1e-3) pr.w[m] = 0;
          sum += pr.w[m];
        }
        // the blend
        let first = true, acc = 0;
        _acc.set(0, 0, 0);
        for (const m of MODES) {
          const w = pr.w[m] / (sum || 1); if (w <= 0) continue;
          target(pr, m, info);
          // a fall eases in (gravity), a lift eases out
          let wy = w;
          if (m === 'set' && pr.spec.fall) wy = w * w;
          _acc.x += _p.x * w; _acc.z += _p.z * w; _acc.y += _p.y * wy;
          acc += w;
          if (first) { _qb.copy(_q); first = false; } else _qb.slerp(_q, w / acc);
        }
        if (pr.spec.fall && pr.w.set > 0 && pr.w.set < 1) {
          // renormalise y: the missing weight stays with the other modes' height
          const ws = pr.w.set / (sum || 1), wy = ws * ws;
          target(pr, 'set', info); const sy = _p.y;
          const other = (_acc.y - sy * wy) / Math.max(1e-6, 1 - ws);
          _acc.y = sy * wy + other * (1 - wy);
        }
        // over his head: from the floor (or his hands) onto his back, the
        // bar goes up and over, never through him
        if (pr.spec.arc && pr.w.worn > 0 && pr.w.worn < sum) { const ww = pr.w.worn / sum; _acc.y += pr.spec.arc * 4 * ww * (1 - ww); }
        // between two holds (down to the floor, up from it, hand to hip): out
        // in front of him on the way, never through him
        if (!pr.spec.arc || pr.w.worn === 0) {
          let wm = 0; for (const m of MODES) wm = Math.max(wm, pr.w[m] / (sum || 1));
          if (wm < 0.999) {
            _v.set(0, 0, 1).transformDirection(b.group.matrixWorld).transformDirection(_inv); _v.y = 0;
            if (_v.lengthSq() > 1e-6) _acc.addScaledVector(_v.normalize(), 0.3 * 4 * wm * (1 - wm));
          }
        }
        pr.pos.copy(_acc); pr.quat.copy(_qb);
        // a floating prop trails on its own spring
        if (pr.spec.lag && !snap) {
          if (!pr.lagP) pr.lagP = pr.pos.clone();
          pr.lagP.lerp(pr.pos, 1 - Math.exp(-dt * pr.spec.lag));
          pr.pos.copy(pr.lagP);
        } else if (pr.spec.lag) pr.lagP = pr.pos.clone();
        // spring-lag on its own pivot (a lantern swings, a stack wobbles)
        const sw = pr.spec.swing;
        if (sw) {
          if (!pr.prev || snap) { pr.prev = pr.pos.clone(); pr.vel.set(0, 0, 0); pr.ang = [0, 0]; pr.angV = [0, 0]; }
          _v.copy(pr.pos).sub(pr.prev).divideScalar(dt);
          const ax = (_v.x - pr.vel.x) / dt, az = (_v.z - pr.vel.z) / dt;
          pr.vel.copy(_v); pr.prev.copy(pr.pos);
          const step = sw.step ? sw.step * (info.gait || 0) * Math.sin(info.walkPh || 0) * 60 : 0;
          const F = [Math.max(-40, Math.min(40, az)), Math.max(-40, Math.min(40, -ax + step))];
          for (let i = 0; i < 2; i++) {
            pr.angV[i] += (-sw.k * pr.ang[i] - sw.c * pr.angV[i] + sw.g * F[i]) * dt;
            pr.ang[i] = Math.max(-sw.max, Math.min(sw.max, pr.ang[i] + pr.angV[i] * dt));
          }
          if (info.rm) pr.ang = [0, 0];
          _qa.setFromEuler(_e.set(pr.ang[0], 0, pr.ang[1]));
          pr.quat.premultiply(_qa);
        }
        // THE GUARDS. The floor: no point below it. The body: any point
        // inside his body or head pushes it out (toward the side it is on).
        // Then the floor once more, in case the push had a downward part.
        pr.corr = 0;
        const floor = pr.floorUsed = pr.mode === 'set' ? 0 : pr.w.dragged > 0 && pr.tf != null ? Math.min(info.floor, pr.tf) : info.floor;
        const lift = () => {
          let low = Infinity;
          for (const pt of pr.pts) { _v.copy(pt).applyQuaternion(pr.quat).add(pr.pos); if (_v.y < low) low = _v.y; }
          if (low < floor) { pr.pos.y += floor - low; pr.corr += floor - low; }
        };
        lift();
        // last frame's push out, let go of gradually: a prop that was
        // nudged clear eases back instead of snapping back into place
        if (!pr.push) pr.push = V();
        if (snap) pr.push.set(0, 0, 0); else pr.push.multiplyScalar(Math.exp(-dt * 4));
        pr.pos.add(pr.push);
        _s.copy(pr.pos);
        for (let it = 0; it < 6; it++) {
          // out along the line from his middle to the prop's centre (level)
          _w.copy(pr.pos).applyMatrix4(homeF.matrixWorld).applyMatrix4(_ti);
          let ux = _w.x, uz = _w.z;
          const ul = Math.hypot(ux, uz);
          if (ul < 1e-3) { ux = 0; uz = 1; } else { ux /= ul; uz /= ul; }
          let push = 0;
          // how far along u a point at (x, z) must go to reach radius r
          const out = (x, z, r) => { const pu = x * ux + z * uz, q = pu * pu - (x * x + z * z - r * r); return q > 0 ? -pu + Math.sqrt(q) : 0; };
          for (const pt of pr.pts) {
            _v.copy(pt).applyQuaternion(pr.quat).add(pr.pos).applyMatrix4(homeF.matrixWorld).applyMatrix4(_ti);
            const r = radiusAt(_v.y);
            if (r > 0 && Math.hypot(_v.x, _v.z) < r) push = Math.max(push, out(_v.x, _v.z, r) + 0.01);
            const ey = (_v.y - head.y) / H.hy, rr = 0.8 - ey * ey;
            if (rr > 0) {
              // the head, squashed to a circle in x
              const k = H.hz / H.hx, hx = _v.x * k, rh = Math.sqrt(rr) * H.hz;
              if (Math.hypot(hx, _v.z) < rh) push = Math.max(push, out(hx, _v.z, rh) + 0.01);
            }
          }
          if (push <= 0) break;
          _v.set(ux, 0, uz).transformDirection(b.group.matrixWorld).transformDirection(_inv);
          // level: a push out of him never lifts it off the floor
          _v.y = 0; if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1); _v.normalize();
          pr.pos.addScaledVector(_v, push);
          pr.corr += push;
        }
        pr.push.add(_w.copy(pr.pos).sub(_s));
        lift();
        pr.vis.position.copy(pr.pos); pr.vis.quaternion.copy(pr.quat); pr.vis.scale.copy(pr.proxy.scale);
        pr.init = true;
      }
    },
    // for the tests: how far below the floor, and how deep inside his body
    // or head, any point of each prop is now (0, 0 when it is clean)
    audit(info) {
      homeF.updateWorldMatrix(true, true);
      _ti.copy(b.group.matrixWorld).invert();
      return props.map((pr) => {
        let below = 0, inside = 0;
        const floor = pr.floorUsed ?? (pr.mode === 'set' ? 0 : info.floor);
        for (const pt of pr.pts) {
          _v.copy(pt).applyQuaternion(pr.quat).add(pr.pos);
          below = Math.max(below, floor - _v.y);
          _v.applyMatrix4(homeF.matrixWorld).applyMatrix4(_ti);
          const r = radiusAt(_v.y), d = Math.hypot(_v.x, _v.z);
          if (r > 0) inside = Math.max(inside, r - d);
          const ey = (_v.y - head.y) / H.hy, rr = 0.8 - ey * ey;
          if (rr > 0) inside = Math.max(inside, Math.sqrt(rr) * H.hz - Math.hypot(_v.x * H.hz / H.hx, _v.z));
        }
        return { key: pr.key, mode: pr.mode, below, inside, pos: pr.pos.clone(), corr: pr.corr };
      });
    },
    // the floor height (H frame) under him for a pose
    floorFor(pose, G, s) { return (pose.behind ? Math.min(BACK, Math.max(0, pose.y)) : pose.y > TOP - 0.1 ? TOP : 0) * G.SH / s; },
  };
}
