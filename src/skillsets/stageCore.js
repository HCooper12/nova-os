// THE SKILL SETS' STAGE, the renderer itself. Host-agnostic: it runs inside
// a Web Worker on an OffscreenCanvas (./stage.worker.js), or on the main
// thread as the fallback (./stage.js decides). It never touches the DOM; the
// host hands it the canvas, the colour tokens already read, a frame clock,
// and the slots (where each slab is on screen) as plain data.
//
// One renderer, one scene, every visible agent (the 4 Oct icon lesson:
// never one renderer per character). The cost, by design:
//   - orthographic camera in page pixels, no shadow map, no antialias at a
//     pixel ratio of 2 or more, materials and geometries shared by the kit
//   - only the slabs on screen have a being in the scene (three at most)
//   - the loop stops when inactive and never runs under reduced motion
//     (one still frame per change instead)
//
// The beings are src/agentWorld/beings.js, the same code the Org map draws.

import * as THREE from 'three';
import { createBeingKit } from '../agentWorld/beings.js';
import { PLAYS, HOME_POSE, CENTRE_HOME, samplePlay, nextPlay, restAfter, tempoFor, styleOf, seededRng } from './plays.js';

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

// a neighbour sits on his own slab's top, at the corner that shows
const PERCH_LANE = 0.34;

export function createStageCore({ canvas, tokens, reduceMotion = false, pixelRatio = 2, maxFps = 60, raf, caf, onBoxes, snap, salt = 0 }) {
  const TK = colourTokens(tokens);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: pixelRatio < 2, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene();
  const env = roomEnv(renderer);
  scene.environment = env.rt.texture;
  scene.environmentIntensity = TK.env;
  const key = new THREE.DirectionalLight(TK.key.getHex(), 2.2); key.position.set(3.4, 6.6, 4.6); scene.add(key);
  const fill = new THREE.DirectionalLight(TK.fill.getHex(), 0.44); fill.position.set(-5, 3, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(TK.rim.getHex(), 1.25); rim.position.set(-3, 4.4, -6); scene.add(rim);
  const kit = createBeingKit(THREE, TK);
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  cam.position.set(0, 0, 500);

  // THE FROST: behind the centre slab he is drawn faded to its glass, so he
  // reads as behind it, and the part of him past its edge stays whole (the
  // peek). Multiplies what is already drawn and leaves clear canvas clear.
  const frost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.26, depthWrite: false, depthTest: false, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.SrcAlphaFactor,
  }));
  frost.renderOrder = 50; frost.visible = false; scene.add(frost);
  const _v = new THREE.Vector3();

  const built = {};
  function beingOf(id) {
    if (built[id]) return built[id];
    const a = kit.AGENTS.find((x) => x.id === id);
    if (!a || !kit.BUILD[id]) return null;
    const b = kit.BUILD[id](a);
    kit.face3(b.face, false, 0);
    if (b.tell) b.tell(0, false, true);
    if (b.afterHead) b.afterHead();
    const holder = new THREE.Group(), inner = new THREE.Group();
    inner.add(b.group); holder.add(inner); holder.rotation.x = 0.1;
    const rnd = seededRng(id, salt);
    b.face.nextBlink = 1 + rnd() * 4;
    b.face.nextSacc = 1 + rnd() * 3;
    built[id] = {
      id, b, holder, inner, inScene: false, rnd,
      // a first rest of his own length, so they never start together
      act: null, rest: 0.4 + rnd() * 3.2, last: null, smile: 0,
      working: false, canPlay: false, phase: rnd() * 6, wavePh: rnd() * 6,
      role: null, cur: null, reloc: 0, pin: null,
    };
    return built[id];
  }

  // portraits for the slabs' art, rendered once at load from the same kit
  async function portraits(ids) {
    const out = {};
    const prevPR = renderer.getPixelRatio();
    const size = new THREE.Vector2(); renderer.getSize(size);
    renderer.setPixelRatio(1); renderer.setSize(160, 160, false);
    const pc = new THREE.OrthographicCamera(-0.42, 0.42, 1.2, 0.36, -10, 10); pc.position.set(0, 0, 5);
    for (const id of ids) {
      const x = beingOf(id); if (!x) continue;
      const g = new THREE.Group(); x.inner.remove(x.b.group); g.add(x.b.group); g.rotation.y = 0.3; scene.add(g);
      renderer.render(scene, pc);
      try { const s = await snap(); if (s) out[id] = s; } catch { /* no portrait */ }
      scene.remove(g); g.remove(x.b.group); x.inner.add(x.b.group);
    }
    renderer.setPixelRatio(prevPR); renderer.setSize(size.x || 1, size.y || 1, false);
    invalidate();
    return out;
  }

  let W = 1, H = 1, slots = [], info = {}, running = false, active = true, disposed = false, dirty = true;
  let lastDraw = 0, lastStep = 0, frames = 0, drawMs = 0, rafId = 0;

  function resize(w, h, pr) {
    W = Math.max(1, w); H = Math.max(1, h);
    if (pr) renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    Object.assign(cam, { left: 0, right: W, top: 0, bottom: -H });
    cam.updateProjectionMatrix();
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
    face.add.smile = x.smile;
    kit.face3(face, working, reduceMotion ? 0 : dt);
  }

  // a wave: the right arm up and swinging, over whatever the tell set
  const _S = new THREE.Vector3(), _Hh = new THREE.Vector3(), _P = new THREE.Vector3(0, 0, -1), _N = new THREE.Vector3(0, 0, 1);
  function waveArm(x, now, amt) {
    const arms = x.b.arms; if (!arms || !arms.R || !arms.SR || amt <= 0) return;
    _S.copy(arms.SR);
    const sw = Math.sin(now * 11 + x.wavePh) * 0.07;
    _Hh.set(_S.x - 0.04 * amt + sw * amt, _S.y + 0.3 * amt, _S.z + 0.12 * amt);
    if (amt < 1 && arms.R.last) _Hh.lerp(arms.R.last.H, 1 - amt);
    arms.R.set(_S, _Hh, _P, _N);
  }

  // the slab-local spot -> screen, for his slot
  function toScreen(slot, lx, ly) {
    return { sx: slot.fx + lx * slot.w, sy: slot.fy - ly * slot.h };
  }

  // one being, one step: a working tell, a play, or a rest between plays
  function stepBeing(x, slot, now, dt) {
    const b = x.b, centre = slot.centre && !info.openId;
    const role = centre ? 'c' : slot.d > 0 ? 'r' : 'l';
    if (role !== x.role) {
      // a new lane: drop the play and travel to the new home
      if (x.role) { x.act = x.act && x.act.reaction ? x.act : null; x.reloc = 0.8; x.rest = Math.max(x.rest, 0.6 + x.rnd() * 1.4); }
      x.role = role;
    }
    let pose = HOME_POSE;
    if (x.working || reduceMotion || !x.canPlay) {
      if (!(x.act && x.act.reaction)) x.act = null;
    }
    if (x.act) {
      x.act.t += dt * x.act.tempo;
      pose = samplePlay(PLAYS[x.act.name], x.act.t);
      if (x.act.t >= PLAYS[x.act.name][PLAYS[x.act.name].length - 1][0]) {
        if (!x.act.reaction) x.last = x.act.name;
        x.act = null; x.rest = restAfter(x.id, x.rnd);
      }
    } else if (x.canPlay && !x.working && !reduceMotion && !info.openId) {
      x.rest -= dt;
      // a big play never starts mid-swipe; the small ones may
      if (x.rest <= 0 && !(slot.dragging && centre)) {
        const name = nextPlay(x.id, { centre, last: x.last, rnd: x.rnd });
        x.act = { name, t: 0, tempo: tempoFor(x.id, x.rnd) };
      }
    }
    // the lane's home, and where the play puts him
    const hx = centre ? CENTRE_HOME.x : (role === 'r' ? -PERCH_LANE : PERCH_LANE);
    const hy = centre ? CENTRE_HOME.y : 1;
    const perched = !centre;
    const tx = hx + pose.x, ty = hy + pose.y;
    if (!x.cur || !x.inScene) x.cur = { x: tx, y: ty };
    if (x.reloc > 0) {
      x.reloc -= dt;
      const a = 1 - Math.exp(-dt * 7);
      x.cur.x += (tx - x.cur.x) * a; x.cur.y += (ty - x.cur.y) * a;
    } else { x.cur.x = tx; x.cur.y = ty; }
    const travelling = x.reloc > 0 && Math.abs(tx - x.cur.x) > 0.02;
    const moving = !reduceMotion && (pose.moving || travelling);
    const run = Math.min(1.6, (pose.speed || 0.6) / 0.6);
    const { sx, sy } = toScreen(slot, x.cur.x, x.cur.y);
    const s = slot.k * slot.scale * (perched ? 0.86 : 1);
    const bob = moving ? Math.abs(Math.sin(now * 13 * run + x.phase)) * 4 * slot.k * run : 0;
    const behind = !!pose.behind && centre;
    const breath = reduceMotion || !x.canPlay ? 0 : Math.sin(now * 1.7 + x.phase) * 0.012;
    // a neighbour sits on his top edge; the sit is the squash
    const sq = pose.sq * (perched ? 0.88 : 1) * (1 + breath);
    x.holder.position.set(sx, -sy + bob, behind ? -90 : 90);
    x.holder.scale.set(s * (1 + (1 - sq) * 0.5), s * sq, s);
    const yaw = travelling ? (tx > x.cur.x ? 1.2 : -1.2) : pose.yaw;
    x.inner.rotation.set(0, yaw, pose.roll + (moving ? Math.sin(now * 13 * run + x.phase) * 0.06 : 0));
    if (b.tell) b.tell(now, x.working, reduceMotion);
    if (pose.wave && !reduceMotion) waveArm(x, now, pose.wave);
    b.head.rotation.y = (b.headYaw || 0) + b.face.sacc.x * 3 + (x.canPlay && !reduceMotion && !x.act ? Math.sin(now * 0.45 + x.phase) * 0.25 : 0);
    if (b.afterHead) b.afterHead();
    updateFace(x, now, dt, x.working);
    return behind;
  }

  // held by the host (the ride onto the sheet, and the read while open)
  function pinStep(x, slot, now, dt) {
    const p = x.pin, k = slot.k * slot.scale, sq = p.sq ?? 1;
    x.holder.position.set(p.px, -p.py, 90);
    x.holder.scale.set(k * (1 + (1 - sq) * 0.5), k * sq, k);
    x.inner.rotation.set(0, p.yaw ?? -0.3, 0);
    if (x.b.tell) x.b.tell(now, x.working, reduceMotion);
    x.b.head.rotation.y = (x.b.headYaw || 0) + x.b.face.sacc.x * 3;
    if (x.b.afterHead) x.b.afterHead();
    updateFace(x, now, dt, x.working);
    x.cur = null; x.role = null;
  }

  const boxes = [];
  function frame(now, dt) {
    const want = new Set();
    let frostOn = false;
    boxes.length = 0;
    for (const slot of slots) {
      if (!slot.visible) continue;
      const x = beingOf(slot.id);
      if (!x) continue;
      want.add(slot.id);
      const fresh = !x.inScene;
      if (fresh) { scene.add(x.holder); x.inScene = true; x.cur = null; }
      if (x.pin) pinStep(x, slot, now, dt);
      else if (stepBeing(x, slot, now, dt)) {
        frostOn = true;
        frost.position.set(slot.sx0 + slot.sw / 2, -(slot.sy0 + slot.sh / 2), 0);
        frost.scale.set(slot.sw, slot.sh, 1);
      }
      // his box on screen, for the host's tap test
      const s = x.holder.scale.y;
      _v.copy(x.holder.position);
      boxes.push({ id: slot.id, x0: _v.x - 0.4 * s, x1: _v.x + 0.4 * s, y0: -_v.y - 1.15 * s, y1: -_v.y + 0.05 * s });
    }
    for (const id of Object.keys(built)) {
      const x = built[id];
      if (x.inScene && !want.has(id)) { scene.remove(x.holder); x.inScene = false; }
    }
    frost.visible = frostOn;
    const t0 = performance.now();
    renderer.render(scene, cam);
    drawMs += performance.now() - t0; frames++;
    if (onBoxes) onBoxes(boxes.slice());
  }

  const minGap = 1000 / maxFps - 2;
  function loop(tMs) {
    running = false;
    if (disposed || !active) return;
    const nowMs = typeof tMs === 'number' ? tMs : performance.now();
    if (!dirty && nowMs - lastDraw < minGap) { running = true; rafId = raf(loop); return; }
    const now = nowMs / 1000;
    const dt = lastStep ? Math.min(0.1, now - lastStep) : 1 / maxFps;
    lastStep = now; lastDraw = nowMs; dirty = false;
    frame(now, dt);
    // under reduced motion nothing moves by itself: draw once and stop,
    // unless the host is moving him (the ride)
    const pinned = Object.values(built).some((x) => x.pin && x.pin.live);
    if (!reduceMotion || pinned) { running = true; rafId = raf(loop); }
  }
  function invalidate() {
    dirty = true;
    if (!running && active && !disposed) { running = true; rafId = raf(loop); }
  }

  return {
    portraits,
    resize,
    invalidate,
    setSlots(s, i) { slots = s; info = i || {}; invalidate(); },
    setAgents(list) {
      for (const a of list) {
        const x = beingOf(a.id); if (!x) continue;
        if (x.working !== !!a.working || x.canPlay !== !!a.canPlay) { if (!(x.act && x.act.reaction)) x.act = null; x.rest = 0.4 + x.rnd() * 1.6; }
        x.working = !!a.working; x.canPlay = !!a.canPlay;
      }
      invalidate();
    },
    setActive(on) { active = !!on; if (active) { lastStep = 0; invalidate(); } else if (rafId && caf) { caf(rafId); running = false; } },
    // the host holds him at a screen spot (null lets him go back to play)
    pin(id, p) { const x = beingOf(id); if (!x) return; x.pin = p; if (!p) { x.act = null; x.rest = 0.8 + x.rnd(); } invalidate(); },
    // a tap on him: a reaction in character; working, he only turns to you
    tap(id) {
      const x = built[id]; if (!x) return;
      x.smile = 0.6;
      if (!reduceMotion && !x.working && x.canPlay) x.act = { name: styleOf(id).react, t: 0, tempo: 1, reaction: true };
      else if (!reduceMotion && !x.working) x.act = { name: 'nod', t: 0, tempo: 1, reaction: true };
      invalidate();
    },
    // what each visible being is doing now (for the recording harness)
    acts() { return Object.values(built).filter((x) => x.inScene).map((x) => ({ id: x.id, role: x.role, act: x.act ? x.act.name : null })); },
    stats() { return { frames, drawMs, avgDrawMs: frames ? drawMs / frames : 0, inScene: Object.values(built).filter((x) => x.inScene).length, built: Object.keys(built).length, calls: renderer.info.render.calls }; },
    dispose() {
      disposed = true;
      if (rafId && caf) caf(rafId);
      const free = (o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      };
      scene.traverse(free);
      for (const id of Object.keys(built)) built[id].holder.traverse(free);
      env.rt.dispose(); env.pm.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* already gone */ }
    },
  };
}
