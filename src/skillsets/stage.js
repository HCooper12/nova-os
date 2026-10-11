// THE SKILL SETS' STAGE: every visible agent alive at his slab, in ONE
// WebGL renderer and ONE scene (his 11 Oct call, and the icon lesson of
// 4 Oct: never one renderer per character).
//
// The cost, by design:
//   - one orthographic camera in page pixels, no shadow map, a soft PMREM
//     room for the materials, pixel ratio capped
//   - only the slabs on screen have a being in the scene; the rest are not
//     drawn at all
//   - the centre agent is stepped every frame; off-centre agents are stepped
//     on alternate frames (half the rig and face work) and never take the
//     big plays that need the centre's room or its frost
//   - draws are capped at 30 a second (the Org map's cap); the page and the
//     carousel's own transforms stay at the display's rate
//   - the loop stops when the view is off screen or the tab is hidden, and
//     never runs under reduced motion (one still frame per change instead)
//   - dispose() releases every geometry, material, texture and the context
//
// The beings are src/agentWorld/beings.js, the same code the Org map and the
// character sheet draw. Pure scene: no network, no model, no storage.

import * as THREE from 'three';
import { createBeingKit } from '../agentWorld/beings.js';
import { PLAYS, HOME_POSE, samplePlay, nextPlay, restAfter, styleOf } from './plays.js';

const MIN_DT = 1 / 30;

function readTokens(el) {
  const cs = getComputedStyle(el);
  const c = (n, d) => new THREE.Color((cs.getPropertyValue(n) || '').trim() || d);
  const f = (n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isNaN(v) ? d : v; };
  return {
    key: c('--nv-key', '#fff2e2'), fill: c('--nv-fill', '#bcd4ff'), rim: c('--nv-rim', '#9fdcff'), shell: c('--nv-shell', '#c9d3e4'),
    em: f('--nv-emissive', 1), env: f('--nv-env', 0.72), stage: c('--nv-stage', '#0d1426'),
    gold: c('--nv-gold', '#e0b26a'), ink: c('--nv-ink', '#e8ecf6'), void: c('--nv-void', '#06070d'), edge: c('--nv-cy', '#59e6ff'),
    hue: {
      cy: c('--nv-cy', '#59e6ff'), vi: c('--nv-vi', '#8f7bff'), mg: c('--nv-mg', '#ff7ad9'), good: c('--nv-good', '#5fe8a8'),
      gold: c('--nv-gold', '#e0b26a'), or: c('--nv-or', '#ffa257'),
      chest: c('--nv-m-chest', '#ff8a7a'), back: c('--nv-m-back', '#4fd1c5'), shoulders: c('--nv-m-shoulders', '#ffc46b'),
      quads: c('--nv-m-quads', '#7ab8ff'), calves: c('--nv-m-calves', '#8fd3ff'), abs: c('--nv-m-abs', '#ffd66b'),
      triceps: c('--nv-m-triceps', '#b48cff'), biceps: c('--nv-m-biceps', '#5fe8a8'), glutes: c('--nv-m-glutes', '#c98bff'),
    },
  };
}

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

export function createSkillStage(canvas, { tokensFrom, reduceMotion = false, pixelRatio = 2 } = {}) {
  const TK = readTokens(tokensFrom || canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
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

  // THE FROST: behind the centre slab he is drawn faded to its glass, so the
  // DOM panel's own frost reads through him. Multiplies what is already
  // drawn (his pixels) and leaves the clear canvas clear.
  const frost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.SrcAlphaFactor,
  }));
  frost.renderOrder = 50; frost.visible = false; scene.add(frost);

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
    b.face.nextBlink = 1 + Math.random() * 4;
    b.face.nextSacc = 1 + Math.random() * 3;
    built[id] = {
      id, b, holder, inner, inScene: false,
      act: null, rest: 0.6 + Math.random() * 2.2, last: null, smile: 0,
      working: false, canPlay: false, phase: Math.random() * 6,
    };
    return built[id];
  }

  // portraits for the slabs' art, rendered once at load from the same kit
  function portraits(ids) {
    const out = {};
    const prevPR = renderer.getPixelRatio();
    const size = new THREE.Vector2(); renderer.getSize(size);
    renderer.setPixelRatio(1); renderer.setSize(160, 160, false);
    const pc = new THREE.OrthographicCamera(-0.42, 0.42, 1.2, 0.36, -10, 10); pc.position.set(0, 0, 5);
    for (const id of ids) {
      const x = beingOf(id); if (!x) continue;
      const g = new THREE.Group(); x.inner.remove(x.b.group); g.add(x.b.group); g.rotation.y = 0.3; scene.add(g);
      renderer.render(scene, pc);
      try { out[id] = canvas.toDataURL('image/png'); } catch { /* tainted: no portrait */ }
      scene.remove(g); g.remove(x.b.group); x.inner.add(x.b.group);
    }
    renderer.setPixelRatio(prevPR); renderer.setSize(size.x || 1, size.y || 1, false);
    return out;
  }

  let W = 1, H = 1, slotsFn = () => [], running = false, active = true, disposed = false, dirty = true;
  let lastDraw = 0, lastStep = 0, tick = 0, ride = null, openId = null, frames = 0, drawMs = 0;

  function resize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    renderer.setSize(W, H, false);
    Object.assign(cam, { left: 0, right: W, top: 0, bottom: -H });
    cam.updateProjectionMatrix();
    invalidate();
  }

  function place(x, slot, p, now) {
    const s = slot.k * slot.scale;
    const bob = p.moving && !reduceMotion ? Math.abs(Math.sin(now * 14)) * 4 * slot.k : 0;
    const side = slot.side || 1;
    const behind = !!p.behind && slot.centre && !openId;
    x.holder.position.set(slot.x + (p.x - 0.36) * side * slot.w + (p.px || 0), -(slot.y - p.y * slot.h) + bob + (p.py || 0), behind ? -90 : 90);
    x.holder.scale.set(s * (1 + (1 - p.sq) * 0.5), s * p.sq, s);
    x.inner.rotation.set(0, p.yaw * side, p.roll * side + (p.moving && !reduceMotion ? Math.sin(now * 14) * 0.05 : 0));
    return behind;
  }

  function updateFace(x, now, dt, working) {
    const face = x.b.face;
    if (!reduceMotion) {
      if (face.blink > 0) { face.blink -= dt; if (face.blink <= 0) { face.blink = 0; face.nextBlink = now + (working ? 5.5 : 2.5) + Math.random() * 5; } }
      else if (now > face.nextBlink) face.blink = 0.3;
      if (now > face.nextSacc) { face.saccT.set((Math.random() - 0.5) * 0.026, (Math.random() - 0.5) * 0.014); face.nextSacc = now + 1.5 + Math.random() * 2.4; }
      face.sacc.lerp(face.saccT, Math.min(1, dt * 9));
    } else { face.blink = 0; face.sacc.set(0, 0); }
    x.smile = Math.max(0, x.smile - dt * 0.8);
    face.add.smile = x.smile;
    kit.face3(face, working, reduceMotion ? 0 : dt);
  }

  // one being, one step: a working tell, a play, or a rest between plays
  function stepBeing(x, slot, now, dt) {
    const b = x.b;
    let pose = HOME_POSE;
    if (x.working) {
      x.act = null;
    } else if (x.canPlay && !reduceMotion && !openId) {
      if (x.act) {
        x.act.t += dt * x.act.tempo;
        pose = samplePlay(PLAYS[x.act.name], x.act.t);
        if (x.act.t >= PLAYS[x.act.name][PLAYS[x.act.name].length - 1][0]) { x.last = x.act.name; x.act = null; x.rest = restAfter(x.id); }
      } else {
        x.rest -= dt;
        if (x.rest <= 0 && !slot.dragging) x.act = { name: nextPlay(x.id, { centre: slot.centre, last: x.last }), t: 0, tempo: styleOf(x.id).tempo };
      }
    } else if (x.act && x.act.reaction) {
      x.act.t += dt * x.act.tempo;
      pose = samplePlay(PLAYS[x.act.name], x.act.t);
      if (x.act.t >= PLAYS[x.act.name][PLAYS[x.act.name].length - 1][0]) x.act = null;
    }
    // breathing and a slow look, so a rest is never a freeze
    const breath = reduceMotion || !x.canPlay ? 0 : Math.sin(now * 1.7 + x.phase) * 0.012;
    const p = { ...pose, sq: pose.sq * (1 + breath) };
    const behind = place(x, slot, p, now);
    if (b.tell) b.tell(now, x.working, reduceMotion);
    b.head.rotation.y = (b.headYaw || 0) + b.face.sacc.x * 3 + (x.canPlay && !reduceMotion && !x.act ? Math.sin(now * 0.45 + x.phase) * 0.25 : 0) + (x.turn || 0);
    if (b.afterHead) b.afterHead();
    updateFace(x, now, dt, x.working);
    return behind;
  }

  function frame(now) {
    const slots = slotsFn();
    const want = new Set();
    let frostOn = false;
    tick++;
    for (const slot of slots) {
      if (!slot.visible) continue;
      const x = beingOf(slot.id);
      if (!x) continue;
      want.add(slot.id);
      if (!x.inScene) { scene.add(x.holder); x.inScene = true; }
      // the level of detail: off-centre agents step on alternate frames
      if (slot.centre || ride || (tick + slot.index) % 2 === 0) {
        const dt = slot.centre ? x._dt ?? MIN_DT : (x._dt ?? MIN_DT) * 2;
        if (ride && ride.id === slot.id) rideStep(x, slot, now);
        else if (openId === slot.id && x.holdAt) holdStep(x, slot, now);
        else if (stepBeing(x, slot, now, Math.min(0.1, dt))) {
          frostOn = true;
          frost.position.set(slot.slab.x + slot.slab.w / 2, -(slot.slab.y + slot.slab.h / 2), 0);
          frost.scale.set(slot.slab.w, slot.slab.h, 1);
        }
      }
    }
    for (const id of Object.keys(built)) {
      const x = built[id];
      if (x.inScene && !want.has(id)) { scene.remove(x.holder); x.inScene = false; }
    }
    frost.visible = frostOn;
    const t0 = performance.now();
    renderer.render(scene, cam);
    drawMs += performance.now() - t0; frames++;
  }

  function loop() {
    running = false;
    if (disposed || !active || document.hidden) return;
    const nowMs = performance.now();
    if (!dirty && nowMs - lastDraw < MIN_DT * 1000 - 2) { running = true; requestAnimationFrame(loop); return; }
    const now = nowMs / 1000;
    const dt = lastStep ? Math.min(0.1, now - lastStep) : MIN_DT;
    lastStep = now; lastDraw = nowMs; dirty = false;
    for (const id of Object.keys(built)) built[id]._dt = dt;
    frame(now);
    // under reduced motion nothing moves by itself: draw once and stop,
    // unless a ride (the sheet's cross-fade) is in progress
    if (!reduceMotion || ride) { running = true; requestAnimationFrame(loop); }
  }
  function invalidate() {
    dirty = true;
    if (!running && active && !disposed && !document.hidden) { running = true; requestAnimationFrame(loop); }
  }

  /* --------------------------- the open: the ride --------------------------- */
  // He hops onto the rising sheet and rides it to its top, and stays there
  // while the sheet is open. Back runs the same path in reverse. `spot(q)`
  // is where the sheet's top is at progress q; `sheetAt(q)` moves the sheet.
  function rideStep(x, slot, now) {
    const r = ride, u = Math.min(1, Math.max(0, (performance.now() - r.t0) / r.dur));
    const q = r.dir > 0 ? u : 1 - u;
    const sp = Math.min(1, Math.max(0, (q - 0.2) / 0.8));
    const e = r.dir > 0 ? 1 - Math.pow(1 - sp, 3) : sp * sp * (3 - 2 * sp);
    r.sheetAt(reduceMotion ? q : e);
    const home = { x: slot.x, y: slot.y };
    const spot = r.spot(reduceMotion ? 1 : e);
    let px, py, sq = 1, yaw = -0.3;
    if (reduceMotion) { const at = q > 0.5 ? spot : home; px = at.x; py = at.y; canvas.style.opacity = String(Math.abs(q - 0.5) * 2); }
    else if (q < 0.2) { px = home.x; py = home.y; sq = 1 - 0.2 * Math.sin((q / 0.2) * Math.PI); yaw = 0.3; }
    else if (q < 0.55) { const a = (q - 0.2) / 0.35, s = a * a * (3 - 2 * a); px = home.x + (spot.x - home.x) * s; py = home.y + (spot.y - home.y) * s - Math.sin(s * Math.PI) * r.arc; sq = 1.04; yaw = 0.3 - 0.6 * s; }
    else { px = spot.x; py = spot.y; sq = q < 0.62 ? 0.86 + ((q - 0.55) / 0.07) * 0.14 : 1; }
    const k = slot.k * slot.scale;
    x.holder.position.set(px, -py, 90);
    x.holder.scale.set(k * (1 + (1 - sq) * 0.5), k * sq, k);
    x.inner.rotation.set(0, yaw, 0);
    if (x.b.tell) x.b.tell(now, x.working, reduceMotion);
    if (x.b.afterHead) x.b.afterHead();
    updateFace(x, now, MIN_DT, x.working);
    if (u >= 1) { const done = r.done; ride = null; canvas.style.opacity = '1'; done(); }
  }

  // open and read: he stands still at the sheet's top, facing you, blinking
  function holdStep(x, slot, now) {
    const k = slot.k * slot.scale;
    x.holder.position.set(x.holdAt.x, -x.holdAt.y, 90);
    x.holder.scale.set(k, k, k);
    x.inner.rotation.set(0, -0.3, 0);
    if (x.b.tell) x.b.tell(now, x.working, reduceMotion);
    x.b.head.rotation.y = (x.b.headYaw || 0) + x.b.face.sacc.x * 3;
    if (x.b.afterHead) x.b.afterHead();
    updateFace(x, now, MIN_DT, x.working);
  }

  /* --------------------------------- api --------------------------------- */
  return {
    portraits,
    setSlots(fn) { slotsFn = fn; invalidate(); },
    setAgents(list) {
      for (const a of list) {
        const x = beingOf(a.id); if (!x) continue;
        if (x.working !== !!a.working || x.canPlay !== !!a.canPlay) { x.act = null; x.rest = 0.4 + Math.random() * 1.6; }
        x.working = !!a.working; x.canPlay = !!a.canPlay;
      }
      invalidate();
    },
    invalidate,
    resize,
    setActive(on) { active = !!on; if (active) { lastStep = 0; invalidate(); } },
    // the open: hold the being at the sheet's top while it is open
    ride({ id, dir, dur, spot, sheetAt, arc = 70, done }) {
      const x = beingOf(id);
      ride = { id, dir, t0: performance.now(), dur, spot, sheetAt, arc, done: () => {
        if (x) x.holdAt = dir > 0 ? spot(1) : null;
        if (dir < 0) openId = null;
        if (done) done();
      } };
      if (x) { x.act = null; x.holdAt = null; }
      if (dir > 0) openId = id;
      invalidate();
    },
    hold(id, spot) { // he stands at the sheet's top (a resize moved it)
      openId = id;
      const x = beingOf(id); if (!x) return;
      x.holdAt = spot; invalidate();
    },
    // which being a point lands on (solid meshes only, so a swipe that
    // starts near him still swipes)
    hit(px, py) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((px / W) * 2 - 1, -(py / H) * 2 + 1), cam);
      for (const id of Object.keys(built)) {
        const x = built[id];
        if (!x.inScene) continue;
        const hits = ray.intersectObject(x.b.group, true).filter((h) => h.object.isMesh && !(h.object.material && h.object.material.transparent));
        if (hits.length) return id;
      }
      return null;
    },
    // a tap on him: a reaction in character; working, he only turns to you
    tap(id) {
      const x = built[id]; if (!x) return;
      x.smile = 0.6;
      if (!reduceMotion && !x.working && x.canPlay) x.act = { name: styleOf(id).react, t: 0, tempo: 1, reaction: true };
      else if (!reduceMotion && !x.working) x.act = { name: 'nod', t: 0, tempo: 1, reaction: true };
      invalidate();
    },
    stats() { return { frames, drawMs, avgDrawMs: frames ? drawMs / frames : 0, inScene: Object.values(built).filter((x) => x.inScene).length, built: Object.keys(built).length }; },
    dispose() {
      disposed = true;
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      for (const id of Object.keys(built)) {
        built[id].holder.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        });
      }
      env.rt.dispose(); env.pm.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* already gone */ }
    },
  };
}
