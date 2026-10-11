// THE SKILL SETS' STAGE, the renderer itself. Host-agnostic: it runs inside
// a Web Worker (./stage.worker.js) or on the main thread as the fallback
// (./stage.js decides). It never touches the DOM.
//
// THE ARCHITECTURE (11 Oct, his iPhone recording): one WebGL context draws
// each agent into a small frame of his OWN slab's space, and the host shows
// that frame on a canvas that is a child of the slab element. The slab's
// CSS transform therefore carries the agent with it on the very frame it
// moves; there is no screen position for the worker to chase. The old
// design drew every agent on one full-screen canvas at screen positions
// posted from the main thread, and on his phone the worker fell behind
// (and then stalled), leaving the Coach over the Commander's slab.
//
// The cost, by design:
//   - one renderer, one scene (the 4 Oct icon lesson), one buffer the size
//     of a slab's frame, presented per agent
//   - the centre agent every frame (capped at maxFps); a neighbour every
//     NEIGH_EVERY frames; anything else, nothing
//   - no shadow map; the loop stops when inactive; reduced motion draws one
//     still frame per change
//   - a slab-shaped depth occluder hides him when he goes round the back,
//     so he is truly behind the glass and never over the skill text
//
// The beings are src/agentWorld/beings.js; their limbs are moved by
// ./roleActs.js through src/agentWorld/acts.js's overlay.

import * as THREE from 'three';
import { createBeingKit } from '../agentWorld/beings.js';
import { newOverlay, resetOverlay, overlayWriters, applyOverlay } from '../agentWorld/acts.js';
import { PLAYS, HOME_POSE, CENTRE_HOME, samplePlay, nextPlay, restAfter, tempoFor, styleOf, seededRng, ROLE_PLAYS, frameGeo, gaitOf } from './plays.js';
import { createPropRig, modeFor } from './propRig.js';
import { ROLE_FRAMES, walkArms } from './roleActs.js';

const colourTokens = (T) => {
  const c = (v, d) => new THREE.Color(v || d);
  const hue = {};
  for (const [k2, v] of Object.entries(T.hue || {})) hue[k2] = c(v, '#59e6ff');
  return {
    key: c(T.key, '#fff2e2'), fill: c(T.fill, '#bcd4ff'), rim: c(T.rim, '#9fdcff'), shell: c(T.shell, '#c9d3e4'),
    em: T.em ?? 1, env: T.env ?? 0.72, stage: c(T.stage, '#0d1426'), gold: c(T.gold, '#e0b26a'), ink: c(T.ink, '#e8ecf6'),
    void: c(T.void, '#06070d'), edge: c(T.edge, '#59e6ff'), hue,
  };
};

function roomEnv(renderer) {
  const room = new THREE.Scene(), box = new THREE.BoxGeometry(1, 1, 1);
  const panel = (col, i, sx, sy, sz, x, y, z, back) => {
    const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: i, roughness: 1, side: back ? THREE.BackSide : THREE.FrontSide }));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); room.add(m);
  };
  panel(0x18202f, 0.5, 26, 15, 26, 0, 5, 0, true); panel(0xfff1dd, 5.2, 11, 0.1, 4.5, 1.5, 10.5, 2.5);
  panel(0x9ecdff, 3, 0.1, 9, 12, -10, 5, 0); panel(0xffd3a6, 1.7, 12, 6, 0.1, 0, 4.5, -10);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(room, 0.03);
  room.traverse((o) => { if (o.material) o.material.dispose(); });
  box.dispose();
  return { rt, pm };
}

// a neighbour sits on his own slab's top, at the corner nearest the centre
const PERCH_LANE = 0.34;
// a neighbour is drawn every this many frames (20 fps at 60)
const NEIGH_EVERY = 3;

// the small things a role action puts in a hand
function buildTools(TK) {
  const m = (col, o) => new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.5, metalness: 0.1 }, o || {}));
  const gold = m(TK.gold, { metalness: 0.8, roughness: 0.3 }), ink = m(TK.ink, { roughness: 0.85 });
  const shell = m(TK.shell, { metalness: 0.9, roughness: 0.2 }), dark = m(TK.void.clone().lerp(TK.shell, 0.25), { roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: TK.edge, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 });
  const G = { tor: new THREE.TorusGeometry(1, 0.14, 10, 28), cyl: new THREE.CylinderGeometry(1, 1, 1, 14), box: new THREE.BoxGeometry(1, 1, 1), disc: new THREE.CircleGeometry(1, 24) };
  const part = (geo, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
  const make = {
    magnifier: () => { const g = new THREE.Group(); g.add(part(G.tor, gold, 0.07, 0.07, 0.07, 0, 0.12, 0)); g.add(part(G.disc, glass, 0.062, 0.062, 1, 0, 0.12, 0)); g.add(part(G.cyl, dark, 0.012, 0.09, 0.012, 0, 0.03, 0)); return g; },
    clipboard: () => { const g = new THREE.Group(); g.add(part(G.box, dark, 0.15, 0.2, 0.008, 0, 0.08, 0.02)); g.add(part(G.box, ink, 0.12, 0.15, 0.004, 0, 0.07, 0.027)); g.add(part(G.box, shell, 0.05, 0.02, 0.012, 0, 0.17, 0.03)); return g; },
    book: (hue) => { const g = new THREE.Group(); const cover = m(hue, { roughness: 0.6 }); [-1, 1].forEach((s) => { const h = new THREE.Group(); h.rotation.y = s * 0.45; h.add(part(G.box, cover, 0.1, 0.14, 0.008, s * 0.05, 0, 0)); h.add(part(G.box, ink, 0.09, 0.13, 0.01, s * 0.048, 0, 0.007)); g.add(h); }); g.position.y = 0.06; const w = new THREE.Group(); w.add(g); return w; },
    knife: () => { const g = new THREE.Group(); g.add(part(G.cyl, dark, 0.014, 0.07, 0.014, 0, 0.02, 0)); g.add(part(G.box, shell, 0.006, 0.12, 0.035, 0, 0.12, 0.01)); return g; },
  };
  return { make, dispose() { Object.values(G).forEach((g) => g.dispose()); [gold, ink, shell, dark, glass].forEach((x) => x.dispose()); } };
}

export function createStageCore({ canvas, tokens, reduceMotion = false, pixelRatio = 2, maxFps = 60, raf, caf, present, onBoxes, onLost, snap, salt = 0 }) {
  const TK = colourTokens(tokens);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: pixelRatio < 2, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  let lost = false;
  const lostHandler = (e) => { e.preventDefault?.(); if (lost) return; lost = true; stop(); if (onLost) onLost('webglcontextlost'); };
  canvas.addEventListener?.('webglcontextlost', lostHandler, false);

  const scene = new THREE.Scene();
  const env = roomEnv(renderer);
  scene.environment = env.rt.texture;
  scene.environmentIntensity = TK.env;
  const key = new THREE.DirectionalLight(TK.key.getHex(), 2.2); key.position.set(3.4, 6.6, 4.6); scene.add(key);
  const fill = new THREE.DirectionalLight(TK.fill.getHex(), 0.44); fill.position.set(-5, 3, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(TK.rim.getHex(), 1.25); rim.position.set(-3, 4.4, -6); scene.add(rim);
  const kit = createBeingKit(THREE, TK);
  const tools = buildTools(TK);
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  cam.position.set(0, 0, 500);

  // THE GLASS: a slab-shaped depth occluder. It writes depth and no colour,
  // so whatever of him is behind the slab (z < 0) is simply not drawn.
  const occluder = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
  occluder.renderOrder = -100; scene.add(occluder);

  let G = frameGeo(236, 350, 100);
  const built = {};
  function beingOf(id) {
    if (built[id]) return built[id];
    const a = kit.AGENTS.find((x) => x.id === id);
    if (!a || !kit.BUILD[id]) return null;
    const b = kit.BUILD[id](a);
    kit.face3(b.face, false, 0);
    if (b.tell) b.tell(0, false, true);
    // holder (where, how big) > inner (facing, lean) > tilt (the body's own
    // pitch, drop and breath, from the actions) > the being
    const holder = new THREE.Group(), inner = new THREE.Group(), tilt = new THREE.Group();
    tilt.add(b.group); inner.add(tilt); holder.add(inner); holder.rotation.x = 0.1;
    holder.visible = false; scene.add(holder);
    (b.feet || []).forEach((f) => { f.userData.base = f.position.clone(); });
    const rnd = seededRng(id, salt);
    b.face.nextBlink = 1 + rnd() * 4;
    b.face.nextSacc = 1 + rnd() * 3;
    built[id] = {
      id, b, holder, inner, tilt, rnd, ov: newOverlay(), tools: {},
      act: null, rest: 0.4 + rnd() * 3.2, last: null, smile: 0,
      working: false, canPlay: false, phase: rnd() * 6, walkPh: rnd() * 6, gait: 0,
      role: null, cur: null, reloc: 0, pin: null, slot: null, drawnAt: -1, behind: false, snap: true, floor: 0,
    };
    // his equipment, as its own objects (./propRig.js)
    built[id].props = createPropRig(THREE, built[id], scene);
    return built[id];
  }

  function toolFor(x, kind) {
    if (x.tools[kind]) return x.tools[kind];
    const make = tools.make[kind]; if (!make) return null;
    const o = make(x.b.hue); o.visible = false; x.b.group.add(o);
    x.tools[kind] = o;
    return o;
  }

  // portraits for the slabs' art, rendered once at load from the same kit
  async function portraits(ids) {
    const out = {};
    const prevPR = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(160, 160, false);
    occluder.visible = false;
    const pc = new THREE.OrthographicCamera(-0.42, 0.42, 1.2, 0.36, -10, 10); pc.position.set(0, 0, 5);
    for (const id of ids) {
      const x = beingOf(id); if (!x) continue;
      const g = new THREE.Group(); x.tilt.remove(x.b.group); g.add(x.b.group); g.rotation.y = 0.3; scene.add(g); x.props.still(true);
      renderer.render(scene, pc);
      try { const s = await snap(); if (s) out[id] = s; } catch { /* no portrait */ }
      scene.remove(g); g.remove(x.b.group); x.tilt.add(x.b.group); x.props.still(false);
    }
    renderer.setPixelRatio(prevPR); setGeo(G);
    invalidate();
    return out;
  }

  let slots = [], info = {}, running = false, active = true, disposed = false, dirty = true;
  let lastDraw = 0, lastStep = 0, frameNo = 0, rafId = 0, prevMs = 0;
  const st = { ints: [], drawMs: 0, renders: 0, frames: 0 };

  function setGeo(g) {
    G = g;
    renderer.setSize(G.TW, G.TH, false);
    Object.assign(cam, { left: 0, right: G.TW, top: 0, bottom: -G.TH });
    cam.updateProjectionMatrix();
    occluder.position.set(G.AX, -(G.AY - G.SH / 2), 0);
    occluder.scale.set(G.SW - 6, G.SH - 6, 1);
    invalidate();
  }

  function updateFace(x, now, dt, working) {
    const face = x.b.face, rnd = x.rnd;
    if (!reduceMotion) {
      if (face.blink > 0) { face.blink -= dt; if (face.blink <= 0) { face.blink = 0; face.nextBlink = now + (working ? 5.5 : 2.5) + rnd() * 5; } }
      else if (now > face.nextBlink) face.blink = 0.3;
      if (now > face.nextSacc) { face.saccT.set((rnd() - 0.5) * 0.026, (rnd() - 0.5) * 0.014); face.nextSacc = now + 1.5 + rnd() * 2.4; }
      face.sacc.lerp(face.saccT, Math.min(1, dt * 9));
    } else { face.blink = 0; face.sacc.set(0, 0); }
    x.smile = Math.max(0, x.smile - dt * 0.8);
    face.add.smile = Math.max(face.add.smile || 0, x.smile);
    kit.face3(face, working, reduceMotion ? 0 : dt);
  }

  const _b = new THREE.Vector3(), _up = new THREE.Vector3();
  // a play that puts a prop down (or picks one up) at its start waits for it
  function propHold(x, name) {
    if (reduceMotion) return 0;
    for (const p of x.props.props) {
      const m = modeFor(p.spec, { play: name, t01: 0, working: x.working });
      if (m !== p.mode && (m === 'set' || p.mode === 'set')) return 0.5;
    }
    return 0;
  }
  // THE LIMBS: the role action (or the play's own gesture), the walk, the
  // idle weight shift and breath, through the acts overlay; then the bar,
  // the hand tools, the feet and the body tilt it leaves to us.
  function limbs(x, pose, now, dt, moving, run) {
    const b = x.b, ov = x.ov;
    resetOverlay(ov);
    const w = overlayWriters(ov);
    let smile = 0;
    const ctx = { ...w, face(o) { if (o.smile) smile = Math.max(smile, o.smile); w.face(o); }, now, rm: reduceMotion, id: x.id, role: 'host', docked: false, held: () => null, aim: () => ({ yaw: 0, pitch: 0 }) };
    const playing = x.act && !x.working && !reduceMotion;
    const name = playing ? x.act.name : null;
    if (name && ROLE_FRAMES[name]) {
      const len = PLAYS[name][PLAYS[name].length - 1][0];
      ROLE_FRAMES[name](b, Math.min(1, x.act.t / len), ctx);
    }
    // a peek or a climb: hands up on the slab's top edge
    if (!reduceMotion && pose.behind && pose.y > 0.9) {
      const k = Math.min(1, (pose.y - 0.9) / 0.2);
      ctx.arm('L', [-0.17, 0.7, 0.24], [-1, -0.4, -0.4], [0, -0.3, 1], k);
      ctx.arm('R', [0.17, 0.7, 0.24], [1, -0.4, -0.4], [0, -0.3, 1], k);
    }
    // the play's wave: the right arm up and swinging
    if (pose.wave && !reduceMotion && b.arms) {
      const S = b.arms.SR, sw = Math.sin(now * 11 + x.phase) * 0.07;
      ctx.arm('R', [S.x - 0.04 + sw, S.y + 0.3, S.z + 0.12], [0, 0, -1], [0, 0, 1], pose.wave);
    }
    // the props: hands that hold, reach for, or let go of his equipment
    const gt = gaitOf(x.id, name);
    const pinfo = {
      play: name, t01: name ? Math.min(1, x.act.t / PLAYS[name][PLAYS[name].length - 1][0]) : 0, working: x.working, pin: !!x.pin,
      rm: reduceMotion, dt, floor: x.floor, snap: x.snap, gait: x.gait, walkPh: x.walkPh, sq: pose.sq,
      armsTaken: { L: !!ov.t.arms.L, R: !!ov.t.arms.R }, bodyTaken: false,
    };
    if (!reduceMotion) x.props.pre(ctx, pinfo);
    // the walk: arms swing opposite the feet, at his own stride
    const g = x.gait += ((moving ? Math.min(1, run) : 0) - x.gait) * (1 - Math.exp(-dt * 8));
    if (moving) x.walkPh += dt * gt.hz * Math.max(0.6, run);
    // the Coach's lunges: a deep drop on every stride
    if (gt.lunge && g > 0.02) ctx.body({ y: -gt.lunge * Math.abs(Math.sin(x.walkPh)) * g, pitch: 0.05 * g });
    if (!reduceMotion) walkArms(b, ctx, x.walkPh, g, !ov.t.arms.L, !ov.t.arms.R);
    // standing about: the weight shifts foot to foot, a slow look round
    const idle = !reduceMotion && x.canPlay && !x.working && !name && !moving ? 1 : 0;
    if (idle) {
      ctx.body({ roll: 0.03 * Math.sin(now * 0.8 + x.phase), x: 0.012 * Math.sin(now * 0.8 + x.phase) });
      ctx.head(0.28 * Math.sin(now * 0.45 + x.phase), 0.04 * Math.sin(now * 0.31 + x.phase), 0);
    }
    if (moving) ctx.body({ pitch: 0.08 * g });
    const v = applyOverlay(b, ov, ctx);
    if (smile) x.smile = Math.max(x.smile, smile);

    // the CFO's coin, tossed hand to hand while he walks: it jingles
    const pr = b.props || {};
    const jg = b.pose.s('ov:p:jingle', typeof ov.t.props.jingle === 'number' ? ov.t.props.jingle : 0);
    if (pr.chip && jg > 0.02 && b.arms && !x.working) {
      const ph = (now * 2.6 + x.phase) % 1, up = Math.sin(ph * Math.PI);
      const hd = b.arms.R.hand.position;
      pr.chip.visible = true;
      pr.chip.scale.setScalar(Math.max(0.001, Math.min(1, jg * 1.5)));
      pr.chip.position.set(hd.x - 0.02, hd.y + 0.06 + up * 0.16 * jg, hd.z + 0.02);
      pr.chip.rotation.x = ph * Math.PI * 4;
    }
    // a tool in a hand
    const want = ov.t.props.tool;
    for (const kind of Object.keys(x.tools).concat(want ? [want.kind] : [])) {
      const o = toolFor(x, kind); if (!o) continue;
      const k = b.pose.s('ov:tool:' + kind, want && want.kind === kind ? want.k : 0);
      o.visible = k > 0.02;
      if (!o.visible || !b.arms) continue;
      o.scale.setScalar(Math.max(0.001, k));
      const at = (want && want.kind === kind ? want.at : o.userData.at) || 'R';
      o.userData.at = at;
      if (at === 'both') {
        _b.copy(b.arms.L.hand.position).add(b.arms.R.hand.position).multiplyScalar(0.5);
        o.position.copy(_b); o.rotation.set(-0.5, 0, 0);
      } else {
        const hd = b.arms[at].hand;
        o.position.copy(hd.position).add(_up.set(0, 0.06, 0).applyQuaternion(hd.quaternion));
        o.quaternion.copy(hd.quaternion);
      }
    }
    // the feet step under a walk, and stay planted when he drops into a squat
    const drop = Math.min(0, v.by);
    const stride = gt.lunge ? 0.16 : 0.08;
    (b.feet || []).forEach((f, i) => {
      const base = f.userData.base; if (!base) return;
      const s = i === 0 ? 0 : Math.PI, c = Math.sin(x.walkPh + s);
      f.position.set(base.x, base.y + Math.max(0, Math.cos(x.walkPh + s)) * 0.05 * g - drop, base.z + c * stride * g);
    });
    // the body: lean, drop, pitch (push-ups pivot on the toes), and breath
    const breath = reduceMotion || !x.canPlay ? 0 : Math.sin(now * 1.7 + x.phase) * 0.012;
    x.tilt.position.set(v.bx, v.by, 0);
    x.tilt.rotation.set(v.bp, v.byaw, v.br);
    x.tilt.scale.set(1, 1 + breath, 1);
    b.head.rotation.y = (b.headYaw || 0) + b.face.sacc.x * 3 + v.hy;
    b.head.rotation.x = (b.headPitch || 0) + v.hp;
    b.head.rotation.z = (b.headRoll || 0) + v.hr;
    // the equipment, placed by its mode (held, worn, set down, dragged),
    // once the body has its pose for this frame
    x.props.post(pinfo);
    x.snap = false;
  }

  // one being, one step, in his own slab's frame
  function stepBeing(x, slot, now, dt) {
    const b = x.b, centre = slot.centre && !info.openId;
    const role = centre ? 'c' : slot.d > 0 ? 'r' : 'l';
    if (role !== x.role) {
      // a new lane: he is simply THERE (a walk from the floor to the slab top
      // would cross the skill text, the 11 Oct recording), and settles in
      if (x.role) { x.act = x.act && x.act.reaction ? x.act : null; x.cur = null; x.reloc = 0; x.rest = Math.max(x.rest, 0.6 + x.rnd() * 1.4); }
      x.snap = true;
      x.role = role;
    }
    let pose = HOME_POSE;
    if (x.working || reduceMotion || !x.canPlay) {
      if (!(x.act && x.act.reaction)) x.act = null;
    }
    if (x.act) {
      // a prop put down (or taken up) before he sets off: the play waits
      if (x.act.hold > 0) x.act.hold -= dt; else x.act.t += dt * x.act.tempo;
      pose = samplePlay(PLAYS[x.act.name], x.act.t);
      if (x.act.t >= PLAYS[x.act.name][PLAYS[x.act.name].length - 1][0]) {
        if (!x.act.reaction) x.last = x.act.name;
        x.act = null; x.rest = restAfter(x.id, x.rnd);
      }
    } else if (x.canPlay && !x.working && !reduceMotion && !info.openId) {
      x.rest -= dt;
      // a big play never starts mid-swipe; the small ones and the role
      // actions in place may
      if (x.rest <= 0 && !(slot.dragging && centre)) {
        const name = nextPlay(x.id, { centre, last: x.last, rnd: x.rnd });
        // role actions keep their own time: the lift is the lift
        x.act = { name, t: 0, tempo: ROLE_PLAYS.has(name) ? 1 : tempoFor(x.id, x.rnd), hold: propHold(x, name) };
      }
    }
    const hx = centre ? CENTRE_HOME.x : (role === 'r' ? -PERCH_LANE : PERCH_LANE);
    const hy = centre ? CENTRE_HOME.y : 1;
    const perched = !centre;
    const tx = hx + pose.x, ty = hy + pose.y;
    if (!x.cur) x.cur = { x: tx, y: ty };
    if (x.reloc > 0) {
      x.reloc -= dt;
      const a = 1 - Math.exp(-dt * 7);
      x.cur.x += (tx - x.cur.x) * a; x.cur.y += (ty - x.cur.y) * a;
    } else { x.cur.x = tx; x.cur.y = ty; }
    const travelling = x.reloc > 0 && Math.abs(tx - x.cur.x) > 0.02;
    const moving = !reduceMotion && (pose.moving || travelling);
    const run = Math.min(1.6, (pose.speed || 0.6) / 0.6);
    const s = (G.CH / 1.1) * (perched ? 0.86 : 1);
    const gt = gaitOf(x.id, x.act && x.act.name);
    const bob = moving ? Math.abs(Math.sin(x.walkPh)) * gt.bob * Math.min(1.4, run) : 0;
    const behind = !!pose.behind && centre;
    const sq = pose.sq * (perched ? 0.88 : 1);
    x.holder.position.set(G.AX + x.cur.x * G.SW, -(G.AY - x.cur.y * G.SH) + bob, behind ? -90 : 90);
    x.holder.scale.set(s * (1 + (1 - sq) * 0.5), s * sq, s);
    const yaw = travelling ? (tx > x.cur.x ? 1.2 : -1.2) : pose.yaw;
    x.inner.rotation.set(0, yaw, pose.roll + (moving ? Math.sin(x.walkPh) * gt.roll : 0));
    // his equipment's frame: his home spot in this lane, no yaw, no pitch
    x.props.homeF.position.set(G.AX + hx * G.SW, -(G.AY - hy * G.SH), 90);
    x.props.homeF.scale.setScalar(s); x.props.homeF.rotation.set(0, 0, 0);
    x.floor = x.props.floorFor(pose, G, s);
    if (b.tell) b.tell(now, x.working, reduceMotion);
    limbs(x, pose, now, dt, moving, run);
    updateFace(x, now, dt, x.working);
    x.behind = behind;
  }

  // held by the host (the ride onto the sheet, and the read while open):
  // drawn in the pin frame, whose canvas the host moves
  function pinStep(x, now, dt) {
    const p = x.pin, k = G.CH / 1.1, sq = p.sq ?? 1;
    x.holder.position.set(G.AX, -G.PIN_AY, 90);
    x.holder.scale.set(k * (1 + (1 - sq) * 0.5), k * sq, k);
    x.inner.rotation.set(0, p.yaw ?? -0.3, 0);
    x.props.homeF.position.set(G.AX, -G.PIN_AY, 90); x.props.homeF.scale.setScalar(k); x.props.homeF.rotation.set(0, 0, 0);
    x.floor = 0;
    if (x.b.tell) x.b.tell(now, x.working, reduceMotion);
    limbs(x, HOME_POSE, now, dt, false, 0);
    updateFace(x, now, dt, x.working);
    x.cur = null; x.role = null; x.behind = false; x.snap = true;
  }

  function draw(x, keyName, slabFrame) {
    for (const id of Object.keys(built)) { const on = built[id] === x; built[id].holder.visible = on; built[id].props.homeF.visible = on; }
    occluder.visible = slabFrame;
    const t0 = performance.now();
    renderer.render(scene, cam);
    st.drawMs += performance.now() - t0; st.renders++;
    present(keyName);
    x.drawnAt = frameNo;
  }

  const boxes = [];
  function frame(now, dt, all) {
    frameNo++;
    boxes.length = 0;
    const live = [];
    for (const slot of slots) {
      if (!slot.visible) continue;
      const x = beingOf(slot.id); if (!x) continue;
      const fresh = x.slot !== slot.id;
      x.slot = slot.id;
      if (fresh) { x.cur = null; x.snap = true; }
      if (x.pin) pinStep(x, now, dt); else stepBeing(x, slot, now, dt);
      live.push([x, slot]);
    }
    for (const [x, slot] of live) {
      if (x.pin) { draw(x, 'pin', false); continue; }
      const centre = slot.centre && !info.openId;
      const due = all || centre || x.drawnAt < 0 || (frameNo + x.id.length) % NEIGH_EVERY === 0;
      if (due) draw(x, 'slab:' + x.id, true);
      if (centre) {
        const s = x.holder.scale.y, p = x.holder.position;
        boxes.push({ id: x.id, x0: p.x - 0.4 * s, x1: p.x + 0.4 * s, y0: -p.y - 1.15 * s, y1: -p.y + 0.05 * s });
      }
    }
    // a being no longer on screen: forget where he was drawn
    const want = new Set(live.map(([x]) => x.id));
    for (const id of Object.keys(built)) if (!want.has(id)) { built[id].drawnAt = -1; built[id].slot = null; }
    st.frames++;
    if (onBoxes) onBoxes(boxes.slice());
  }

  const minGap = 1000 / maxFps - 2;
  function loop(tMs) {
    running = false;
    if (disposed || !active || lost) return;
    const nowMs = typeof tMs === 'number' ? tMs : performance.now();
    if (!dirty && nowMs - lastDraw < minGap) { running = true; rafId = raf(loop); return; }
    if (prevMs) { st.ints.push(nowMs - prevMs); if (st.ints.length > 900) st.ints.shift(); }
    prevMs = nowMs;
    const now = nowMs / 1000;
    const dt = lastStep ? Math.min(0.1, now - lastStep) : 1 / maxFps;
    const all = dirty && reduceMotion;
    lastStep = now; lastDraw = nowMs; dirty = false;
    frame(now, dt, all || reduceMotion);
    const pinned = Object.values(built).some((x) => x.pin && x.pin.live);
    if (!reduceMotion || pinned) { running = true; rafId = raf(loop); }
  }
  function stop() { if (rafId && caf) caf(rafId); running = false; }
  function invalidate() {
    dirty = true;
    if (!running && active && !disposed && !lost) { running = true; rafId = raf(loop); }
  }

  return {
    portraits,
    setGeo,
    invalidate,
    // the slabs that show: [{ id, d, centre, visible, dragging }]
    setSlots(s, i) {
      const before = slots.map((x) => x.id + (x.centre ? '*' : '')).join();
      slots = s; info = i || {};
      if (slots.map((x) => x.id + (x.centre ? '*' : '')).join() !== before) invalidate();
    },
    setAgents(list) {
      for (const a of list) {
        const x = beingOf(a.id); if (!x) continue;
        if (x.working !== !!a.working || x.canPlay !== !!a.canPlay) { if (!(x.act && x.act.reaction)) x.act = null; x.rest = 0.4 + x.rnd() * 1.6; }
        x.working = !!a.working; x.canPlay = !!a.canPlay;
      }
      invalidate();
    },
    setActive(on) { active = !!on; if (active) { lastStep = 0; prevMs = 0; invalidate(); } else stop(); },
    pin(id, p) { const x = beingOf(id); if (!x) return; x.pin = p; if (!p) { x.act = null; x.rest = 0.8 + x.rnd(); x.drawnAt = -1; } invalidate(); },
    tap(id) {
      const x = built[id]; if (!x) return;
      x.smile = 0.6;
      if (!reduceMotion && !x.working && x.canPlay) x.act = { name: styleOf(id).react, t: 0, tempo: 1, reaction: true };
      else if (!reduceMotion && !x.working) x.act = { name: 'nod', t: 0, tempo: 1, reaction: true };
      invalidate();
    },
    // for the recording harness: what each drawn being is doing now
    acts() { return Object.values(built).filter((x) => x.slot || x.pin).map((x) => ({ id: x.id, role: x.role, act: x.act ? x.act.name : null, behind: x.behind })); },
    // frame intervals since the last call, and what the draws cost
    stats() {
      const out = { ints: st.ints.slice(), drawMs: st.renders ? st.drawMs / st.renders : 0, renders: st.renders, frames: st.frames, built: Object.keys(built).length, calls: renderer.info.render.calls, pixelRatio: renderer.getPixelRatio() };
      st.ints.length = 0; st.drawMs = 0; st.renders = 0; st.frames = 0;
      return out;
    },
    // for the recording harness: start a named play now
    force(id, name) { const x = built[id]; if (!x || !PLAYS[name]) return; x.act = { name, t: 0, tempo: 1, hold: propHold(x, name) }; invalidate(); },
    // for the recording harness: where each prop is and in which mode
    props(id) { const x = built[id]; return x ? x.props.props.map((p) => ({ key: p.key, mode: p.mode, w: { ...p.w }, pos: p.pos.toArray(), corr: p.corr })) : []; },
    // for break-ui: lose the context on purpose
    lose() { try { renderer.forceContextLoss(); } catch { lostHandler({}); } },
    dispose() {
      disposed = true;
      stop();
      canvas.removeEventListener?.('webglcontextlost', lostHandler, false);
      const free = (o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      };
      scene.traverse(free);
      tools.dispose();
      env.rt.dispose(); env.pm.dispose();
      renderer.dispose();
      try { if (!lost) renderer.forceContextLoss(); } catch { /* already gone */ }
    },
  };
}
