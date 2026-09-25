// THE ORG MAP'S SCENE — seven districts around Nova's core, the nine beings
// standing on them, and over each one only what the records say: working,
// waiting on him (a marker with the real count), or quiet.
//
// Renderer conventions are Shelf3D's and Body3D's: ACES, sRGB, PCF soft
// shadows, a PMREM RoomEnvironment, a shadow-only ground, colours READ as
// --nv-* tokens off the mount. The beings are src/agentWorld/beings.js, the
// same code the character sheet draws, so a refinement there lands here.
//
// FRAMES ONLY WHILE SOMETHING MOVES. A working being, a bobbing marker, a
// camera still easing or a blink: otherwise the loop stops, and an idle map
// costs nothing. The next blink wakes it with a timer. `frames()` counts
// real draws so that is measured, not asserted.
//
// The page scrolls, so the map must not take the scroll: one finger dragged
// sideways turns it, dragged up or down scrolls the page (touch-action:
// pan-y). A tap picks a being; a tap on nothing lets it go.
//
// Pure scene: no network, no model, no storage.

import * as THREE from 'three';
import { createBeingKit } from '../agentWorld/beings.js';
import { LAYOUT, HOMES, createHabitat } from '../agentWorld/habitat.js';
import { daypartOf, initLife, stepLife } from '../agentWorld/life.js';
import { makeWalk, walkPoint, walkHeading, obstacleCloud, stepPoints } from './walk.js';
import { ACT_FRAMES, ACT_SPOTS, PERFORM_S, DOCKS, actMoves, newOverlay, resetOverlay, overlayWriters, applyOverlay, buildProps } from '../agentWorld/acts.js';

// The ring's geometry lives in one place, habitat.js's LAYOUT, because the
// sets, the lanes and the beings' homes are all measured against it:
//   RD            the district ring radius
//   RX, RZ        the ring is a little taller than it is wide, which is the
//                 shape of a phone held upright; on a wide screen it still
//                 reads as a ring
//   ORDER         round the ring from the back, clockwise seen from above:
//                 the body's two (Train, Fuel) meet at the front, Knowledge
//                 (three beings) sits at the back where nothing stands in
//                 front of it
//   TILE_R, HUE_OF, BEING_SCALE
const { RD, RX, RZ, BEING_SCALE, ORDER, TILE_R, HUE_OF } = LAYOUT;
// the waiting marker is the map's whole point, so it reads at phone size
// even though the being it hangs over is small
const MARKER_SCALE = 2.1;
const MIN_DT = 1 / 30;
const DISTRICT_OF = HOMES.DISTRICT_OF;
const LABEL = { train: 'Train', knowledge: 'Knowledge', logistics: 'Logistics', fuel: 'Fuel', platform: 'Platform', money: 'Money', mind: 'Mind' };

function readTokens(el) {
  const cs = getComputedStyle(el);
  const calm = document.documentElement.getAttribute('data-nv-calm') === '1';
  const c = (n, d) => new THREE.Color((cs.getPropertyValue(n) || '').trim() || d);
  const f = (n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isNaN(v) ? d : v; };
  return {
    // the 3D-side tokens are not in index.css; the character sheet's own
    // values are the defaults, Calm's when Calm is on
    key: c('--nv-key', calm ? '#ffeeda' : '#fff2e2'),
    fill: c('--nv-fill', calm ? '#cbb9d8' : '#bcd4ff'),
    rim: c('--nv-rim', calm ? '#d8b573' : '#9fdcff'),
    shell: c('--nv-shell', calm ? '#d4ccc0' : '#c9d3e4'),
    em: f('--nv-emissive', calm ? 0.55 : 1),
    env: f('--nv-env', calm ? 0.86 : 0.72),
    stage: c('--nv-stage', calm ? '#121a2c' : '#0d1426'),
    gold: c('--nv-gold', '#e0b26a'), ink: c('--nv-ink', '#e8ecf6'), void: c('--nv-void', '#06070d'),
    hue: {
      cy: c('--nv-cy', '#59e6ff'), vi: c('--nv-vi', '#8f7bff'), mg: c('--nv-mg', '#ff7ad9'), good: c('--nv-good', '#5fe8a8'),
      gold: c('--nv-gold', '#e0b26a'),
      chest: c('--nv-m-chest', '#ff8a7a'), back: c('--nv-m-back', '#4fd1c5'), shoulders: c('--nv-m-shoulders', '#ffc46b'),
      quads: c('--nv-m-quads', '#7ab8ff'), calves: c('--nv-m-calves', '#8fd3ff'), abs: c('--nv-m-abs', '#ffd66b'),
      triceps: c('--nv-m-triceps', '#b48cff'), biceps: c('--nv-m-biceps', '#5fe8a8'), glutes: c('--nv-m-glutes', '#c98bff'),
    },
  };
}

// a district's name in the house label face: uppercase, tracked, set on a
// soft dark pill so it reads over any tile and at phone size
function textSprite(text, col, height) {
  const W = 512, H = 128, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const label = text.toUpperCase();
  x.font = '600 58px Rajdhani, "Instrument Sans", system-ui, sans-serif';
  if ('letterSpacing' in x) x.letterSpacing = '8px';
  const tw = Math.min(W - 16, x.measureText(label).width + 56);
  x.fillStyle = 'rgba(6,9,18,0.55)';
  x.beginPath(); if (x.roundRect) x.roundRect((W - tw) / 2, 22, tw, H - 44, 36); else x.rect((W - tw) / 2, 22, tw, H - 44); x.fill();
  x.fillStyle = `#${col.getHexString()}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, W / 2, H / 2 + 3);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.72 }));
  sp.scale.set(height * 4, height, 1);
  return sp;
}

// THE ROOM the beings are lit by: the character sheet's own (a key strip
// overhead, a cool fill wall, a warm bounce, four upright slivers for the
// clearcoat to catch), so they look here as they were tuned there. three's
// stock RoomEnvironment is a bright white box, and under it every being
// went pastel and every tile went candy.
function makeRoomEnv() {
  const s = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const panel = (col, inten, sx, sy, sz, x, y, z, back) => {
    const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: inten, roughness: 1, side: back ? THREE.BackSide : THREE.FrontSide }));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); s.add(m);
  };
  panel(0x18202f, 0.5, 26, 15, 26, 0, 5, 0, true);
  panel(0xfff1dd, 5.2, 11, 0.1, 4.5, 1.5, 10.5, 2.5);
  panel(0x9ecdff, 3.0, 0.1, 9, 12, -10, 5, 0);
  panel(0xffd3a6, 1.7, 12, 6, 0.1, 0, 4.5, -10);
  panel(0xbfd8ff, 1.1, 0.1, 8, 10, 10, 4.5, 0);
  panel(0x7fb4ff, 0.9, 5, 0.1, 5, -4, 9.6, -3);
  [[-5.4, 3.4], [5.4, 3.4], [-2.6, -6.4], [2.6, -6.4]].forEach((p, i) => panel(i % 2 ? 0xffffff : 0xdfeaff, 2.4, 0.08, 6.5, 0.6, p[0], 4.6, p[1]));
  return s;
}

function hexShape(r) {
  const s = new THREE.Shape();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + k * Math.PI / 3;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (k) s.lineTo(px, py); else s.moveTo(px, py);
  }
  s.closePath();
  return s;
}

export function createOrgScene(mount, { onSelect, reduceMotion = false } = {}) {
  const TK = readTokens(mount);
  const kit = createBeingKit(THREE, TK);
  const { lighter } = kit;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'pan-y';
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = makeRoomEnv();
  const envRT = pmrem.fromScene(envScene, 0.03);
  scene.environment = envRT.texture;
  scene.environmentIntensity = TK.env;

  const key = new THREE.DirectionalLight(TK.key.getHex(), 2.2);
  key.position.set(3.4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 1, far: 30, left: -6.5, right: 6.5, top: 6.5, bottom: -6.5 });
  key.shadow.bias = -0.0012; key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(TK.fill.getHex(), 0.44); fill.position.set(-5, 3, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(TK.rim.getHex(), 1.1); rim.position.set(-3, 4.4, -6); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; ground.receiveShadow = true; scene.add(ground);

  // ---- time of day (AGENT-WORLD-PLAN §9c): the device's own hour ------
  // Dawn warm and low from the east (+x, the right of the default view),
  // day white and high, evening gold and low from the west, night a low
  // blue key with the world at about half of day so the lamps carry the
  // picture. Every colour is a token mix; the page's sky stays CSS.
  // THE CLOCK. One source for the frames (seconds) and the life engine (ms
  // since the epoch). Normally both are the real clock; a capture can shift
  // the hour (setHour) or take the clock by hand (step), and then the
  // lights, the frames and the life engine all move together.
  const clock = { manual: false, t: 0, t0: 0, date: 0, shiftMs: 0 };
  const sceneNow = () => (clock.manual ? clock.t : performance.now() / 1000);
  const lifeNow = () => (clock.manual ? clock.date + (clock.t - clock.t0) * 1000 : Date.now()) + clock.shiftMs;
  function hourNow() {
    const d = new Date(lifeNow());
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }
  const LIGHT = {
    dawn: { key: TK.key.clone().lerp(TK.gold, 0.3).lerp(TK.hue.chest, 0.2), keyI: 1.75, keyPos: [7, 2.4, 2.6],
      fill: TK.fill.clone().lerp(TK.gold, 0.15), fillI: 0.4, rim: TK.rim.clone().lerp(TK.hue.chest, 0.25), rimI: 0.9, env: 0.85, bRim: 0.85 },
    day: { key: TK.key.clone(), keyI: 2.2, keyPos: [3.4, 8, 5],
      fill: TK.fill.clone(), fillI: 0.44, rim: TK.rim.clone(), rimI: 1.1, env: 1, bRim: 1 },
    evening: { key: TK.key.clone().lerp(TK.gold, 0.55), keyI: 1.8, keyPos: [-7, 2.4, 2.6],
      fill: TK.fill.clone().lerp(TK.gold, 0.3), fillI: 0.38, rim: TK.rim.clone().lerp(TK.gold, 0.45), rimI: 0.9, env: 0.8, bRim: 0.85 },
    night: { key: TK.fill.clone().lerp(TK.hue.vi, 0.35), keyI: 0.62, keyPos: [-2.6, 5, 3.6],
      fill: TK.fill.clone().lerp(TK.hue.vi, 0.3).lerp(TK.void, 0.35), fillI: 0.16, rim: TK.rim.clone().lerp(TK.hue.vi, 0.5), rimI: 0.55, env: 0.34, bRim: 0.3 },
  };
  const lightNow = { key: new THREE.Color(), keyI: 0, keyPos: new THREE.Vector3(), fill: new THREE.Color(), fillI: 0, rim: new THREE.Color(), rimI: 0, env: 1, bRim: 1 };
  const lightFade = { from: null, to: LIGHT.day, p: 1, part: null };
  function mixLight(a, b, t) {
    lightNow.key.copy(a.key).lerp(b.key, t); lightNow.keyI = a.keyI + (b.keyI - a.keyI) * t;
    lightNow.keyPos.set(a.keyPos[0] + (b.keyPos[0] - a.keyPos[0]) * t, a.keyPos[1] + (b.keyPos[1] - a.keyPos[1]) * t, a.keyPos[2] + (b.keyPos[2] - a.keyPos[2]) * t);
    lightNow.fill.copy(a.fill).lerp(b.fill, t); lightNow.fillI = a.fillI + (b.fillI - a.fillI) * t;
    lightNow.rim.copy(a.rim).lerp(b.rim, t); lightNow.rimI = a.rimI + (b.rimI - a.rimI) * t;
    lightNow.env = a.env + (b.env - a.env) * t; lightNow.bRim = a.bRim + (b.bRim - a.bRim) * t;
    key.color.copy(lightNow.key); key.intensity = lightNow.keyI; key.position.copy(lightNow.keyPos);
    fill.color.copy(lightNow.fill); fill.intensity = lightNow.fillI;
    rim.color.copy(lightNow.rim); rim.intensity = lightNow.rimI;
    scene.environmentIntensity = TK.env * lightNow.env;
  }
  // a snapshot of what is lit now, so a change of daypart fades from it
  const snapLight = () => ({ key: lightNow.key.clone(), keyI: lightNow.keyI, keyPos: lightNow.keyPos.toArray(), fill: lightNow.fill.clone(), fillI: lightNow.fillI, rim: lightNow.rim.clone(), rimI: lightNow.rimI, env: lightNow.env, bRim: lightNow.bRim });
  const LIGHT_FADE_S = 1.6;

  const world = new THREE.Group(); scene.add(world);

  // ---- the core: Nova, at the centre ------------------------------
  const coreG = new THREE.Group(); world.add(coreG);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.16, 48),
    new THREE.MeshPhysicalMaterial({ color: TK.stage.clone().lerp(TK.hue.cy, 0.08), roughness: 0.5, metalness: 0.2, clearcoat: 0.6 }));
  plinth.position.y = -0.08; plinth.receiveShadow = true; plinth.castShadow = true; coreG.add(plinth);
  const orbMat = kit.emissiveMat(lighter(TK.hue.cy, 0.25), 2.2, { lamp: true });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 40, 28), orbMat);
  orb.position.y = 0.55; coreG.add(orb);
  const orbGlow = kit.halo(TK.hue.cy, 0.4, 0.35); orbGlow.position.y = 0.55; coreG.add(orbGlow);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 8, 64), kit.emissiveMat(lighter(TK.hue.vi, 0.2), 1.4, { lamp: true }));
  coreRing.position.y = 0.55; coreRing.rotation.x = Math.PI / 2 - 0.35; coreG.add(coreRing);
  const coreLabel = textSprite('Nova', TK.ink, 0.34); coreLabel.material.opacity = 0.95; coreLabel.position.set(0, 0.18, 0.92); coreG.add(coreLabel);
  const coreMarker = new THREE.Group(); coreG.add(coreMarker);
  coreMarker.add(kit.mesh(kit.GEO.sph, kit.emissiveMat(TK.gold, 1.5), 0.15, 0.112, 0.055));
  const coreTail = kit.mesh(kit.GEO.cone, kit.emissiveMat(TK.gold, 1.5), 0.048, 0.1, 0.042, -0.04, -0.115, 0);
  coreTail.rotation.z = Math.PI; coreMarker.add(coreTail);
  const corePlate = kit.numeralPlate('1'); coreMarker.add(corePlate);
  coreMarker.position.y = 1.2; coreMarker.scale.setScalar(MARKER_SCALE * BEING_SCALE); coreMarker.visible = false;
  const coreHit = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 12), new THREE.MeshBasicMaterial({ visible: false }));
  coreHit.position.y = 0.5; coreHit.userData.pick = 'core'; coreG.add(coreHit);

  // ---- districts ----------------------------------------------------
  const districtAt = {};
  ORDER.forEach((id, i) => {
    const th = Math.PI + i * (2 * Math.PI / ORDER.length);
    const pos = new THREE.Vector3(Math.sin(th) * RD * RX, 0, Math.cos(th) * RD * RZ);
    const r = TILE_R[id] || 1.0;
    const hue = TK.hue[HUE_OF[id]];
    const g = new THREE.Group(); g.position.copy(pos); world.add(g);
    const geo = new THREE.ExtrudeGeometry(hexShape(r - 0.05), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.05, bevelSegments: 3, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -0.2, 0);
    // the tile carries its department's hue quietly; its being carries it
    // loudly, so the being is never lost against its own ground
    const top = new THREE.MeshPhysicalMaterial({ color: TK.stage.clone().lerp(hue, 0.24), roughness: 0.6, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.35 });
    const tile = new THREE.Mesh(geo, top); tile.receiveShadow = true; tile.castShadow = true; g.add(tile);
    // the district's edge, lit in its own hue: colour means the department
    const edgePts = [];
    for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; edgePts.push(new THREE.Vector3(Math.cos(a) * (r - 0.02), 0.012, -Math.sin(a) * (r - 0.02))); }
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: lighter(hue, 0.3), transparent: true, opacity: 0.8 }));
    g.add(edge);
    const label = textSprite(LABEL[id], lighter(hue, 0.55), 0.36);
    label.material.opacity = 0.95;
    label.position.set(0, 0.24, r * 0.95); g.add(label);
    districtAt[id] = { pos, r, group: g, label };
  });

  // ---- the habitat: a set on every tile, the lanes, the plaza -------
  // (AGENT-WORLD-PLAN §9b). The plaza is built round the plinth above, not
  // with one of its own; the orb and its ring stay the scene's.
  const habitat = createHabitat(THREE, TK, kit);
  world.add(habitat.group);

  // ---- the beings ---------------------------------------------------
  // each stands at its home node on the lanes (the tile's front, or its
  // slot on Knowledge), which is where every walk starts and ends
  const beings = {};
  // the small things a gag hands over (a kernel, a bowl, a card)
  const PROPS = buildProps(THREE, TK, kit);
  kit.AGENTS.forEach((a, i) => {
    const b = kit.BUILD[a.id](a);
    const home = habitat.lanes.nodes['home:' + a.id];
    const holder = new THREE.Group();
    holder.position.set(home.x, 0, home.z);
    holder.scale.setScalar(BEING_SCALE);
    holder.add(b.group); world.add(holder);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.75; hit.userData.pick = a.id; holder.add(hit);
    const sel = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 64), kit.addBlend(new THREE.MeshBasicMaterial({ color: lighter(kit.hueOf(a), 0.3), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })));
    sel.rotation.x = -Math.PI / 2; sel.position.y = 0.02; holder.add(sel);
    const mats = [];
    b.group.traverse((o) => {
      if (!o.material) return;
      [].concat(o.material).forEach((m) => {
        if (mats.includes(m)) return;
        m.userData.orgBase = { color: m.color ? m.color.clone() : null, em: m.emissiveIntensity, op: m.opacity, env: m.envMapIntensity };
        mats.push(m);
      });
    });
    b.marker.scale.setScalar(MARKER_SCALE);
    beings[a.id] = {
      a, b, holder, hit, sel, mats, index: i, pose: 'wait', waiting: 0, dim: 0, face: b.face,
      district: DISTRICT_OF[a.id],
      // what the life engine last said this being is doing, and where that
      // puts it: goal = { pos, yaw, seatY, sit } in the world group's frame
      intent: null, intentKey: null, goal: null, yaw: 0, placed: false,
    };
    // the act's handles (acts.js): targets written each frame, eased values kept
    beings[a.id].ov = newOverlay();
    beings[a.id].writers = overlayWriters(beings[a.id].ov);
    b.face.nextBlink = performance.now() / 1000 + 1 + Math.random() * 5;
    b.face.nextSacc = performance.now() / 1000 + 1 + Math.random() * 3;
  });

  function applyDim(x, k) {
    x.mats.forEach((m) => {
      const o = m.userData.orgBase;
      if (o.color) m.color.copy(o.color).lerp(TK.void, k * 0.7);
      if (o.em != null && m.emissiveIntensity != null) m.emissiveIntensity = o.em * (1 - k * 0.85);
      if (o.op != null && m.transparent) m.opacity = o.op * (1 - k * 0.5);
      if (o.env != null) m.envMapIntensity = o.env * (1 - k * 0.7);
    });
    rimOf(x);
  }
  // each being carries its own rim light, and it lights the tile round it:
  // it dims with the being (a quiet loop) and with the night, or the ground
  // round every being keeps looking like day
  function rimOf(x) { x.b.rimL.intensity = 1.4 * (1 - x.dim * 0.8) * lightNow.bRim; }

  // THE LIT WINDOW (§3g, §9b): a district's lamp is lit when a loop its
  // being stands for ran today, read off the record, never guessed; on
  // Knowledge each of the three has its own. The Money stack is the receipt
  // count when the payload carries one, else the set's fixed short stack.
  let stackShown = null;
  function lampsFromRecord(vm) {
    const lit = {};
    (vm.beings || []).forEach((v) => {
      const on = (v.members || []).some((m) => m.state === 'today');
      const d = habitat.districts[v.district];
      if (!d) return;
      if (v.district === 'knowledge') d.setLit(on, v.id);
      else lit[v.district] = lit[v.district] || on;
    });
    Object.entries(lit).forEach(([id, on]) => habitat.districts[id].setLit(on));
    const n = Number.isFinite(vm.receipts) ? vm.receipts : null;
    if (n !== stackShown) { stackShown = n; habitat.districts.money.setStack(n); }
  }

  // ---- THE LIFE ENGINE (AGENT-WORLD-PLAN §9d) ---------------------
  // life.js decides what each being is doing, purely, from the record and
  // the clock; this scene only acts it out. It is stepped on every update
  // and at most every 250 ms from the frame loop, never from a timer of its
  // own, so a map nobody is looking at costs nothing and catches up on
  // nothing (the engine freezes while the map is off screen).
  let life = null, lastVm = null, lastStepAt = -Infinity, lastPulse = null;
  const lifeHold = { on: false };
  const LIFE_STEP_MS = 250;
  // the plaza pulse lands as the delivery is set down, not as the walker
  // arrives (the set-down is 1.4 s into the 4 s beat at the post)
  const PULSE_DELAY_S = 1.4;
  function lifeInput() {
    const vm = lastVm || {};
    return {
      now: lifeNow(),
      seed: vm.seed || new Date(lifeNow()).toISOString().slice(0, 10),
      beings: (vm.beings || []).map((v) => ({
        id: v.id, district: v.district, working: !!v.working, waiting: v.waiting || 0,
        fresh: v.fresh || 'never', members: v.members || [],
      })),
      events: vm.events || [],
      overnightQueued: vm.overnightQueued || 0,
      visible: visible && !document.hidden,
      reduceMotion,
    };
  }
  function stepLifeNow(force) {
    if (!lastVm || lifeHold.on || disposed) return false;
    const now = lifeNow();
    if (!force && now - lastStepAt < LIFE_STEP_MS) return false;
    lastStepAt = now;
    const input = lifeInput();
    if (!life) life = initLife({ seed: input.seed, beings: input.beings });
    life = stepLife(life, input);
    applyLife(false);
    return true;
  }
  const intentKey = (st) => [st.act, st.actSince, st.place, st.spot, (st.path || []).join('>'), st.partner, st.carry, st.facing].join('|');
  function applyLife(snap) {
    Object.values(beings).forEach((x) => {
      const st = life.beings[x.a.id];
      if (!st) return;
      const k = intentKey(st);
      if (k === x.intentKey && !snap) return;
      x.intentKey = k; x.intent = st;
      planBeing(x, snap || !x.placed || reduceMotion);
    });
    const w = life.world || {};
    if (habitat.districts.platform.setPad) habitat.districts.platform.setPad(!!w.padLit);
    if (w.pulse != null && w.pulse !== lastPulse) { lastPulse = w.pulse; habitat.plaza.pulse(sceneNow() + (reduceMotion ? 0 : PULSE_DELAY_S)); }
    invalidate();
  }

  const flatDist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  // where an intent puts a being: { pos (y 0), yaw (null = keep), seatY, sit }
  function anchorOf(x, spot) {
    const d = habitat.districts[x.district];
    const a = d.anchors[x.district === 'knowledge' ? `${spot}:${x.a.id}` : spot] || d.anchors[spot];
    return a ? { pos: new THREE.Vector3(a.pos.x, 0, a.pos.z), yaw: a.yaw, sit: !!a.sit, seatY: a.sit ? a.pos.y : 0 } : null;
  }
  function resolveTarget(x, st) {
    if (st.path && st.path.length) {
      const n = habitat.lanes.nodes[st.path[st.path.length - 1]];
      return n ? { pos: new THREE.Vector3(n.x, 0, n.z), yaw: null, sit: false, seatY: 0 } : null;
    }
    if (st.place === 'plaza') {
      const a = habitat.plaza.anchors[st.spot === 'bench' ? 'bench0' : 'post'];
      return { pos: new THREE.Vector3(a.pos.x, 0, a.pos.z), yaw: a.yaw, sit: !!a.sit, seatY: a.sit ? a.pos.y : 0 };
    }
    if (typeof st.place === 'string' && st.place.startsWith('visit:')) return visitSpot(x, st.place.slice(6));
    if (st.place === 'lane') return { pos: x.holder.position.clone().setY(0), yaw: null, sit: false, seatY: 0 };
    // an act that happens elsewhere on the tile (acts.js ACT_SPOTS)
    const sp = ACT_SPOTS[st.act] && ACT_SPOTS[st.act][x.a.id];
    if (sp && sp.anchor) {
      const a = anchorOf(x, sp.anchor);
      if (a) { if (sp.yaw != null) a.yaw = sp.yaw; a.perform = st.act; return a; }
    }
    if (sp && sp.near) {
      const d = habitat.districts[x.district].anchors[sp.near];
      if (d) {
        const pos = new THREE.Vector3(d.pos.x + sp.off[0], 0, d.pos.z + sp.off[1]);
        return { pos, yaw: Math.atan2(d.pos.x - pos.x, d.pos.z - pos.z), sit: false, seatY: 0, perform: st.act };
      }
    }
    return anchorOf(x, st.spot || 'rest') || anchorOf(x, 'rest');
  }
  // a relocating act is performed from its arrival, for PERFORM_S; the walk
  // back waits for it unless something that matters comes first
  function startPerf(x, act) { x.perf = { act, t0: sceneNow(), dur: PERFORM_S[act] || 2.5 }; }
  function endPerf(x) {
    if (x.intent) x.performedSince = x.intent.actSince;
    x.perf = null;
    if (x.replan) { x.replan = false; planBeing(x, false); }
  }
  // A visitor stands beside its host, a body's width clear of it, on the
  // side it came from, so the two face each other side-on to the camera
  // (face to face along the view, one would only show its back). The spot
  // must be on the host's tile and clear of the set pieces; failing both
  // sides, it stands off toward where it came from.
  const VISIT_GAP = 0.6;
  const inTile = (p, id, margin) => {
    const c = districtAt[id].pos, R = districtAt[id].r - margin;
    const ax = Math.abs(p.x - c.x), az = Math.abs(p.z - c.z);
    return ax <= R * Math.sqrt(3) / 2 && az + ax / Math.sqrt(3) <= R;
  };
  const pointClear = (p, r) => !(CLOUD || []).some((q) => Math.hypot(q.x - p.x, q.z - p.z) < r);
  function visitSpot(x, hostId) {
    const host = beings[hostId];
    if (!host) return { pos: x.holder.position.clone().setY(0), yaw: null, sit: false, seatY: 0 };
    const hp = (host.goal ? host.goal.pos : host.holder.position).clone().setY(0);
    const from = x.holder.position.clone().setY(0);
    // the Watcher sits with its legs out: give it room
    const gap = VISIT_GAP + (hostId === 'watcher' ? 0.12 : 0);
    const side = Math.sign(from.x - hp.x) || 1;
    const dirs = [[side, 0.35], [-side, 0.35], [side, -0.25], [-side, -0.25]].map(([dx, dz]) => new THREE.Vector3(dx, 0, dz).normalize());
    let pos = null;
    for (const d of dirs) {
      const p = hp.clone().addScaledVector(d, gap);
      if (inTile(p, host.district, 0.2) && pointClear(p, 0.17)) { pos = p; break; }
    }
    if (!pos) {
      const d = from.clone().sub(hp);
      if (d.lengthSq() < 1e-4) d.copy(habitat.lanes.nodes['ring:' + host.district]).setY(0).sub(hp);
      pos = hp.clone().addScaledVector(d.normalize(), gap);
    }
    return { pos, yaw: Math.atan2(hp.x - pos.x, hp.z - pos.z), sit: false, seatY: 0 };
  }
  // ---- WALKING (§9e) --------------------------------------------------
  // A lane walk follows lanes.route between the intent's path nodes and
  // fills the life engine's phase for it (a stroll: 20 s for a delivery,
  // 12 s to a neighbour, 120 s for the Guardian's lap), never faster than
  // 0.9 tile-widths a second; a step on a tile goes at an amble and round
  // the set pieces. A walk once started is finished before the next one is
  // planned, so a being never doubles back mid-stride.
  const TILE_W = 2.0;                                   // a tile, flat edge to flat edge ~1.7, corner to corner 2
  const MAX_SPEED = 0.9 * TILE_W, MIN_LANE_SPEED = 0.12, STEP_SPEED = 0.28;
  const STRIDE = 0.12 * BEING_SCALE;                    // one step: a boot's 0.06 swing each way
  const cadenceOf = (speed) => Math.max(1.4, Math.min(3.4, speed / STRIDE));
  const pathKey = (st) => `${st.actSince}:${(st.path || []).join('>')}`;
  const VIAS = Object.keys(habitat.lanes.nodes).filter((k) => k.startsWith('home:')).map((k) => habitat.lanes.nodes[k]);
  const BODY_R = 0.11, SEAT_SKIP = 0.2;
  let CLOUD = null;                                      // built with the fit points, once the world is placed
  function stepTo(from, to) {
    const r = stepPoints(from, to, CLOUD || [], VIAS, BODY_R, SEAT_SKIP);
    return r.pts;
  }
  function startWalk(x, pts, speed, key) {
    const w = makeWalk(THREE, [x.holder.position.clone().setY(0), ...pts], speed);
    if (w.len < 0.02) { x.walk = null; return false; }
    w.key = key || null; w.cadence = cadenceOf(speed);
    x.walk = w;
    return true;
  }
  function startLaneWalk(x, st) {
    const nodes = habitat.lanes.nodes, from = x.holder.position.clone().setY(0);
    const n0 = nodes[st.path[0]];
    const pts = n0 && flatDist(from, n0) > 0.03 ? stepTo(from, n0) : [];
    for (let i = 0; i + 1 < st.path.length; i++) {
      const r = habitat.lanes.route(st.path[i], st.path[i + 1]);
      if (!r) break;
      pts.push(...r);
    }
    const len = makeWalk(THREE, [from, ...pts], 1).len;
    const secs = Math.max(1, (st.actUntil - lifeNow()) / 1000);
    const speed = Math.max(MIN_LANE_SPEED, Math.min(MAX_SPEED, len / secs));
    if (!startWalk(x, pts, speed, pathKey(st))) x.pathDone = pathKey(st);
  }
  // an intent becomes a goal, and a walk to it
  function planBeing(x, snap) {
    const st = x.intent;
    const g = resolveTarget(x, st);
    if (!g) return;
    if (snap) {
      x.walk = null; x.perf = null; x.replan = false;
      // a snap is a cut: the seat's eased value jumps with it
      const seat = (v) => { x.seatK = v; x.b.pose.v('seat', v, 0, 0).x = v; };
      if (x.snapStart && st.path) {
        const n0 = habitat.lanes.nodes[st.path[0]];
        x.holder.position.set(n0.x, 0, n0.z);
        x.snapStart = false; x.goal = g; x.placed = true; seat(0);
        startLaneWalk(x, st);
        if (x.walk) x.yaw = walkHeading(x.walk, 0, 0.08) ?? x.yaw;
        return;
      }
      x.goal = g; x.placed = true;
      x.holder.position.set(g.pos.x, 0, g.pos.z);
      if (g.yaw != null) x.yaw = g.yaw;
      if (st.path) x.pathDone = pathKey(st);
      x.seatY = g.sit ? seatLift(x, g) : 0; seat(g.sit ? 1 : 0);
      return;
    }
    if (x.walk) { x.replan = true; return; }            // finish this walk first
    // a performance in hand is finished before a mere rest walks it home;
    // anything else (work, a marker, an event, a visit) cuts it short
    if (x.perf) {
      if (st.act === 'rest') { x.replan = true; return; }
      x.perf = null;
    }
    x.goal = g;
    if (st.path && st.path.length > 1 && pathKey(st) !== x.pathDone) { startLaneWalk(x, st); return; }
    const from = x.holder.position.clone().setY(0);
    if (flatDist(from, g.pos) > 0.03) startWalk(x, stepTo(from, g.pos), STEP_SPEED, null);
    else if (g.perform) startPerf(x, g.perform);
  }
  const _wp = new THREE.Vector3();
  // one frame of a walk: turn in place toward the way ahead first (at the
  // start and at any corner sharper than ~60 degrees), then go
  function advanceWalk(x, dt) {
    const w = x.walk;
    const head = walkHeading(w, w.s, 0.08);
    const err = head == null ? 0 : wrapA(head - x.yaw);
    const turning = Math.abs(err) > (w.s === 0 ? 0.3 : 1.05);
    if (!turning && dt > 0) w.s = Math.min(w.len, w.s + w.speed * dt);
    walkPoint(w, w.s, _wp);
    x.holder.position.x = _wp.x; x.holder.position.z = _wp.z;
    x.walkYaw = head == null ? x.yaw : head;
    x.striding = !turning;
    if (w.s >= w.len - 1e-5) {
      if (w.key) x.pathDone = w.key;
      x.walk = null; x.striding = false;
      // arrived where an act happens: do it (the walk back waits for it),
      // unless what the engine wants now matters more than a rest
      const perform = x.goal && x.goal.perform;
      if (perform && (!x.replan || !x.intent || x.intent.act === 'rest' || x.intent.act === perform)) { startPerf(x, perform); return; }
      if (x.replan) { x.replan = false; planBeing(x, false); }
    }
  }
  // which way a being should face this frame, in the world group's frame
  // (the world turns with view.spin; -spin faces the camera)
  function facingYaw(x) {
    const st = x.intent;
    if (x.walk) return x.walkYaw;
    if (selected === x.a.id) return -view.spin;
    if (st && st.facing === 'camera') return -view.spin;
    if (st && st.facing === 'partner' && st.partner && beings[st.partner]) {
      const p = beings[st.partner].holder.position, q = x.holder.position;
      if (flatDist(p, q) > 1e-3) return Math.atan2(p.x - q.x, p.z - q.z);
    }
    return x.goal && x.goal.yaw != null ? x.goal.yaw : x.yaw;
  }
  // sat on a seat: the foot of the body rests on the seat's height
  function seatLift(x, g) {
    if (x.bodyMin == null) { x.b.body.geometry.computeBoundingBox(); x.bodyMin = x.b.body.geometry.boundingBox.min.y; }
    return Math.max(0, g.seatY - x.bodyMin * BEING_SCALE);
  }
  const wrapA = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

  // the daypart: the lights fade to it over LIGHT_FADE_S (snapped on the
  // first frame and for a capture's setHour), the sets' lamps follow it
  function setDaypart(part, snap) {
    if (part === lightFade.part && !snap) return false;
    lightFade.part = part;
    habitat.setDaypart(part);
    if (snap || lightFade.from == null) {
      lightFade.from = LIGHT[part]; lightFade.to = LIGHT[part]; lightFade.p = 1;
      mixLight(LIGHT[part], LIGHT[part], 1);
      habitat.settle();
    } else {
      lightFade.from = snapLight(); lightFade.to = LIGHT[part]; lightFade.p = 0;
    }
    Object.values(beings).forEach(rimOf);
    invalidate();
    return true;
  }

  // ---- camera: a turntable, fitted by projection -------------------
  // Fit by projecting sampled geometry into the view, never a bounding
  // sphere: a sphere around a flat ring over-reads by ~40% (the character
  // sheet's first pass), which is how a map ends up small in the middle.
  // The sets are sampled too (vertices, not boxes): the mast's rose and the
  // tower's lantern stand taller than any being, at the back of their tiles,
  // and a district's name plate is a sprite as wide as the tile.
  const FIT_PTS = [];
  ORDER.forEach((id) => {
    const d = districtAt[id];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; FIT_PTS.push(new THREE.Vector3(d.pos.x + Math.cos(a) * d.r, -0.2, d.pos.z + Math.sin(a) * d.r)); }
    FIT_PTS.push(new THREE.Vector3(d.pos.x, 1.55, d.pos.z));
  });
  FIT_PTS.push(new THREE.Vector3(0, 1.2, 0));
  world.updateMatrixWorld(true);
  function samplePoints(obj, want, out) {
    const meshes = [];
    let total = 0;
    obj.traverse((o) => { if (o.isMesh && o.geometry?.attributes.position && !o.userData.contact) { meshes.push(o); total += o.geometry.attributes.position.count; } });
    meshes.forEach((o) => {
      const pa = o.geometry.attributes.position, share = Math.max(2, Math.round(want * pa.count / Math.max(1, total))), st = Math.max(1, Math.floor(pa.count / share));
      for (let i = 0; i < pa.count; i += st) out.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld));
    });
  }
  ORDER.forEach((id) => samplePoints(habitat.districts[id].group, 160, FIT_PTS));
  samplePoints(habitat.plaza.group, 80, FIT_PTS);
  // and what a being walks round: every set piece, the plaza's benches and lamps
  CLOUD = obstacleCloud(THREE, [...ORDER.flatMap((id) => habitat.districts[id].pieces), habitat.plaza.group], world, 140);
  ORDER.forEach((id) => {
    const lb = districtAt[id].label, p = new THREE.Vector3();
    lb.getWorldPosition(p);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => FIT_PTS.push(new THREE.Vector3(p.x + sx * lb.scale.x / 2, p.y + sy * lb.scale.y / 2, p.z))));
  });
  const view = { spin: 0, spinT: 0, elev: 0.74, dist: 14, distT: 14, tx: 0, ty: 0.3, tz: 0, txT: 0, tyT: 0.3, tzT: 0, lift: 0, liftT: 0 };
  const probe = new THREE.PerspectiveCamera(), pv = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0);
  function fitDistance(pts, target, spin, bandY = 0.88) {
    probe.fov = camera.fov; probe.aspect = camera.aspect; probe.near = 0.1; probe.far = 200;
    const fits = (d) => {
      probe.position.set(target.x, target.y + Math.sin(view.elev) * d, target.z + Math.cos(view.elev) * d);
      probe.lookAt(target.x, target.y, target.z); probe.updateMatrixWorld(true); probe.updateProjectionMatrix();
      return pts.every((p) => { pv.copy(p).applyAxisAngle(YAX, spin).project(probe); return pv.z < 1 && Math.abs(pv.x) < 0.86 && Math.abs(pv.y) < bandY; });
    };
    let lo = 1, hi = 80;
    for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    return hi;
  }
  let selected = null, ringDist = 14, devLook = null;
  const FOCUS_BAND = 0.34, FOCUS_LIFT = 0.3;
  function frame(snap) {
    if (selected && (beings[selected] || selected === 'core')) {
      const p = selected === 'core' ? new THREE.Vector3(0, 0, 0) : beings[selected].holder.position.clone();
      p.applyAxisAngle(YAX, view.spinT);
      view.txT = p.x; view.tyT = 0.35; view.tzT = p.z;
      const near = [];
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; near.push(new THREE.Vector3(p.x + Math.cos(a) * 1.05, -0.1, p.z + Math.sin(a) * 1.05)); }
      near.push(new THREE.Vector3(p.x, 1.45, p.z));
      // the card covers the lower half, so the being is fitted into a band
      // and the band is lifted into the clear space above the card
      view.distT = fitDistance(near, new THREE.Vector3(view.txT, view.tyT, view.tzT), 0, FOCUS_BAND);
      view.liftT = FOCUS_LIFT;
    } else {
      view.txT = 0; view.tyT = 0.3; view.tzT = 0;
      view.distT = fitDistance(FIT_PTS, new THREE.Vector3(0, 0.3, 0), view.spinT);
      view.liftT = 0;
      ringDist = view.distT;
    }
    if (snap) Object.assign(view, { spin: view.spinT, dist: view.distT, tx: view.txT, ty: view.tyT, tz: view.tzT, lift: view.liftT });
    invalidate();
  }

  // ---- input --------------------------------------------------------
  const el = renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hits = [coreHit, ...Object.values(beings).map((x) => x.hit)];
  const ptr = { id: null, x: 0, y: 0, moved: 0, axis: null, t: 0 };
  let lastTap = 0;
  function pick(cx, cy) {
    const r = el.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(hits, false)[0];
    return h ? h.object.userData.pick : null;
  }
  const onDown = (e) => {
    ptr.id = e.pointerId; ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = 0; ptr.axis = null; ptr.t = performance.now();
  };
  const onMove = (e) => {
    if (ptr.id !== e.pointerId) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    ptr.moved += Math.abs(dx) + Math.abs(dy);
    // lock to an axis after a few pixels: sideways turns the map, up or
    // down is the page's, and the browser already has it (pan-y)
    if (!ptr.axis && ptr.moved > 8) ptr.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (ptr.axis === 'x') {
      try { el.setPointerCapture(e.pointerId); } catch { /* already captured or gone */ }
      view.spinT += dx * 0.008; view.spin += dx * 0.008;
      if (selected) frame(false);
      invalidate();
    }
    ptr.x = e.clientX; ptr.y = e.clientY;
  };
  const onUp = (e) => {
    if (ptr.id !== e.pointerId) return;
    ptr.id = null;
    if (ptr.moved < 8 && performance.now() - ptr.t < 600) {
      const now = performance.now();
      if (now - lastTap < 320) { lastTap = 0; view.spinT = 0; if (onSelect) onSelect(null); return; }
      lastTap = now;
      const id = pick(e.clientX, e.clientY);
      if (onSelect) onSelect(id);
    }
  };
  const onCancel = () => { ptr.id = null; };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);

  // ---- the loop -----------------------------------------------------
  let running = false, dirty = true, lastT = performance.now() / 1000, lastDraw = 0, frames = 0, lastLive = false;
  // why the last frame asked for another (a count per reason; liveReport)
  let liveWhy = {}, noRender = false;
  const mark = (tag) => { liveWhy[tag] = (liveWhy[tag] || 0) + 1; return true; };
  let visible = true, wakeTimer = null, disposed = false;
  function invalidate() { dirty = true; if (!running && visible && !disposed) { running = true; requestAnimationFrame(tick); } }
  const approach = (cur, tgt, dt, k) => cur + (tgt - cur) * (1 - Math.exp(-dt * k));

  function updateFace(x, now, dt, working) {
    const face = x.face;
    let live = false;
    // asleep, a being does not blink (and its blink does not wake the loop)
    if (x.asleep) { face.blink = 0; face.nextBlink = now + 4 + Math.random() * 4; }
    else if (!reduceMotion) {
      if (face.blink > 0) {
        face.blink -= dt; live = mark('blink');
        if (face.blink <= 0) { face.blink = 0; face.nextBlink = now + (working ? 5.5 : 2.5) + Math.random() * 5; }
      } else if (now > face.nextBlink) { face.blink = 0.3; live = mark('blink'); }
      if (now > face.nextSacc) {
        face.saccT.set((Math.random() - 0.5) * 0.026, (Math.random() - 0.5) * 0.014);
        face.nextSacc = now + (working ? 0.7 : 1.5) + Math.random() * 2.4;
      }
      face.sacc.lerp(face.saccT, Math.min(1, dt * 9));
      // a saccade finishes on whatever frame comes next; on its own it is
      // not a reason to draw (nine beings' saccades kept the loop awake for good)
    } else { face.blink = 0; face.sacc.set(0, 0); }
    if (kit.face3(face, working, reduceMotion ? 0 : dt)) live = mark('face');
    return live;
  }

  // one being, one frame: the life engine's intent acted out. Returns
  // whether it still moves (so the loop may not sleep).
  function frameBeing(x, now, dt) {
    const b = x.b, st = x.intent, id = x.a.id;
    const ln = lifeNow();
    // which act plays: a relocating act plays once the being has arrived
    // (until then it is walking there at rest); off the engine, the pose
    let act = x.perf ? x.perf.act : st ? st.act : x.pose === 'work' ? 'work' : 'rest';
    if (!x.perf && st && ACT_SPOTS[st.act] && ACT_SPOTS[st.act][id] && (x.walk || x.performedSince === st.actSince)) act = 'rest';
    if (reduceMotion && act !== 'work') act = 'rest';
    if (!ACT_FRAMES[act]) act = 'rest';
    const working = act === 'work';
    x.asleep = act === 'sleep';
    let live = false;
    if (!reduceMotion) {
      // breathing; slower and deeper asleep
      const br = x.asleep ? 1.5 * Math.sin(now * 0.5 + x.index * 1.7) : Math.sin(now * 0.85 + x.index * 1.7);
      b.body.scale.set(1 + br * 0.012, 1 + br * 0.006, 1 + br * 0.012);
      b.head.position.y = b.headY * (1 + br * 0.006);
    }
    const ease = (cur, tgt, rate) => (reduceMotion ? tgt : dt > 0 ? cur + (tgt - cur) * (1 - Math.exp(-dt * rate)) : cur);

    // 1 · WHERE: the walk along its polyline (turning in place first), the
    // facing, the seat
    if (x.walk) { advanceWalk(x, dt); live = mark('walk'); }
    const want = facingYaw(x), err = wrapA(want - x.yaw);
    if (reduceMotion) x.yaw = want;
    else if (dt > 0) x.yaw += err * (1 - Math.exp(-dt * (x.walk ? 8 : 6)));
    if (!reduceMotion && Math.abs(wrapA(want - x.yaw)) > 0.004) live = mark('turn');
    x.holder.rotation.y = x.yaw;
    // on a seat anchor the foot of the body rests on the seat and the boots
    // come forward; asleep on a spot with no seat, or a gag that sits, it
    // sits where it is
    const atGoal = !x.walk && x.goal && flatDist(x.holder.position, x.goal.pos) < 0.05;
    const seatWant = atGoal && x.goal.sit ? 1 : 0;
    if (seatWant) x.seatY = seatLift(x, x.goal);
    x.seatK = ease(x.seatK || 0, seatWant, 7);
    const groundWant = atGoal && !x.goal.sit && x.asleep ? 1 : 0;
    x.groundK = ease(x.groundK || 0, groundWant, 5);
    const ov = x.ov, sitK = Math.max(x.seatK, x.groundK, ov.v.sit);
    x.holder.position.y = (x.seatY || 0) * x.seatK - 0.03 * Math.max(x.groundK, ov.v.sit);
    if (Math.abs(x.seatK - seatWant) > 1e-3 || Math.abs(x.groundK - groundWant) > 1e-3) live = mark('seat');

    // 2 · THE GAIT'S WHOLE-BODY PART: bob, waddle, the act's body handles
    // (last frame's eased values), set before the act so a docked thing is
    // placed against this frame's body
    const pacing = ov.v.gait > 0.02;
    if (dt > 0 && ((x.walk && x.striding) || pacing)) x.gait = (x.gait || 0) + dt * (x.walk ? x.walk.cadence : 2.4) * Math.PI;
    const amp = Math.max(x.amp || 0, ov.v.gait);
    const s = Math.sin(x.gait || 0), c = Math.cos(x.gait || 0);
    b.group.position.set(ov.v.bx, 0.02 * Math.abs(s) * amp + ov.v.by, 0);
    b.group.rotation.set(ov.v.bp - 0.06 * sitK, 0.035 * s * amp + ov.v.byaw, 0.045 * s * amp + ov.v.br);
    x.headLevel = -0.045 * s * amp;
    x.holder.updateMatrixWorld(true);

    // 3 · THE ACT (acts.js): the tell, then the act's handles through the
    // rig's pose. The working tell plays only when the record says working
    // (§9a rule 2); two tells report ambient flicker as motion, which off
    // duty is not a reason to keep drawing.
    const t01 = x.perf ? Math.min(1, (now - x.perf.t0) / x.perf.dur)
      : st && st.actUntil > st.actSince ? Math.max(0, Math.min(1, (ln - st.actSince) / (st.actUntil - st.actSince))) : 0;
    resetOverlay(ov);
    const role = st && st.partner && act.startsWith('gag:') ? (act === 'gag:' + id ? 'host' : 'visitor') : null;
    const dock = DOCKS[id], docked = !!(dock && dock.when(act));
    const ctx = {
      ...x.writers, now, dt, rm: reduceMotion, id, role, place: st ? st.place : 'home',
      dock: dock && act === 'tap-racked-bar' ? localOf(x, dockPoint(x, dock)) : null,
      aim: (name) => aimAt(x, name),
    };
    if (b.tell) {
      const tl0 = b.tell;
      let tl = false;
      b.tell = (t, w, rm) => { tl = tl0(t, w, rm); return tl; };
      ACT_FRAMES[act](b, t01, ctx);
      b.tell = tl0;
      if (working && tl) live = mark('work');
    }
    // what it carries home from a visit (popcorn, a bowl), in its right hand;
    // during the gag the act says when it has been handed over
    const carry = st && st.carry;
    if (carry && !ov.t.props[carry]) {
      const handed = act.startsWith('gag:') ? ov.t.props.carry || 0 : 1;
      if (handed) ov.t.props[carry] = { k: 1, at: 'handR' };
    }
    const dp = dock ? dockPoint(x, dock) : null;
    applyOverlay(b, ov, {
      id, docked, beingDim: x.dim, held: (kind) => heldProp(x, kind),
      dockLocal: dp ? localOf(x, dp) : null, dockYaw: wrapA(-x.yaw),
    });
    if (x.perf || (actMoves(act, st) && st && ln < st.actUntil)) live = mark('act');
    fxPuff(x, ov.v.puff);

    // 4 · THE GAIT'S FEET AND HANDS: boots alternating +-0.06 with a +-0.35
    // toe pitch, a hand that holds nothing swinging, the head kept level.
    // Only the amplitude is eased (through the rig's pose), so stopping
    // settles the boots instead of freezing them mid-stride.
    const P = b.pose;
    x.amp = reduceMotion ? 0 : P.s('walk:amp', x.walk && x.striding ? 1 : 0);
    if (x.amp > 1e-3) live = mark('gait');
    if (b.feet && b.feet.length === 2) {
      if (!x.footBase) x.footBase = b.feet.map((f) => ({ y: f.position.y, z: f.position.z, rx: f.rotation.x }));
      [[1, Math.max(0, c)], [-1, Math.max(0, -c)]].forEach(([sg, lift], i) => {
        const f = b.feet[i], fb = x.footBase[i];
        f.position.z = fb.z + 0.06 * sg * s * amp + 0.1 * sitK;
        f.position.y = fb.y + 0.022 * lift * amp + 0.015 * sitK;
        f.rotation.x = fb.rx - 0.35 * sg * s * amp - 0.45 * sitK;
      });
    }
    if (amp > 0.01 && b.arms) {
      (FREE_HAND[id] || []).forEach((side) => {
        if (ov.t.arms[side]) return;
        const arm = b.arms[side], sg = side === 'L' ? 1 : -1;
        _wp.copy(arm.last.H); _wp.z += 0.055 * sg * s * amp; _wp.y += 0.012 * Math.abs(s) * amp;
        arm.set(side === 'L' ? b.arms.SL : b.arms.SR, _wp, arm.last.pole, arm.last.palm);
      });
    }
    // a being with company looks at it (the host, while its visitor walks up)
    const lookWant = st && st.partner && st.facing !== 'partner' && !x.walk && beings[st.partner] ? Math.max(-0.9, Math.min(0.9, aimAt(x, beings[st.partner].holder.position).yaw)) : 0;
    x.look = P.s('look', lookWant);
    if (x.perf && now - x.perf.t0 >= x.perf.dur) endPerf(x);
    if (P.moving()) live = mark('pose');
    return { live, working };
  }
  // the hands a walk may swing: the ones not holding the being's own thing
  // (the book, the bucket, the pot, the orb and the lantern stay held)
  const FREE_HAND = { commander: ['R'], coach: ['L', 'R'], cfo: ['R'], guardian: ['R'], librarian: ['R'] };

  // a point in the world group's frame, in this being's rig frame (b.group)
  const _lp = new THREE.Vector3();
  function localOf(x, p) {
    _lp.copy(p); world.localToWorld(_lp); x.b.group.worldToLocal(_lp);
    return [_lp.x, _lp.y, _lp.z];
  }
  function dockPoint(x, dock) {
    const a = habitat.districts[x.district] && habitat.districts[x.district].anchors[dock.anchor];
    return a ? a.pos : null;
  }
  // head angles (rig frame) that look at a named thing on the tile, or a point
  const AIM = {
    safe: () => habitat.districts.money.props.safe, crate: () => habitat.districts.fuel.props.produce,
    pool: () => habitat.districts.mind.props.pool,
  };
  const _ap = new THREE.Vector3();
  function aimAt(x, what) {
    if (typeof what === 'string') {
      const o = AIM[what] && AIM[what]();
      if (!o) return { yaw: 0, pitch: 0 };
      o.getWorldPosition(_ap); world.worldToLocal(_ap);
    } else _ap.copy(what);
    const l = localOf(x, _ap);
    const yaw = Math.atan2(l[0], l[2]), flat = Math.hypot(l[0], l[2]) || 1e-3;
    // a head turns so far and no further (a being turns its body for more)
    return { yaw: Math.max(-0.85, Math.min(0.85, yaw)), pitch: Math.max(-0.5, Math.min(0.5, Math.atan2(x.b.headY - l[1], flat))) };
  }
  // a gag's thing in the hand, made the first time it is asked for
  function heldProp(x, kind) {
    x.heldProps = x.heldProps || {};
    if (!x.heldProps[kind]) {
      const o = PROPS.make(kind);
      if (!o) return null;
      o.scale.setScalar(1); x.b.group.add(o); x.heldProps[kind] = o;
    }
    return x.heldProps[kind];
  }
  // the chalk puff off the Coach's clap
  function fxPuff(x, v) {
    if (!x.puff && v < 0.01) return;
    if (!x.puff) { x.puff = kit.halo(lighter(TK.ink, 0.2), 0.16, 0.5); x.puff.position.set(0, 0.46, 0.36); x.b.group.add(x.puff); }
    x.puff.visible = v > 0.01;
    x.puff.material.opacity = 0.55 * v;
    x.puff.scale.setScalar(0.16 + 0.22 * (1 - v));
  }

  function tick() {
    if (disposed) return;
    const now = sceneNow();
    if (!dirty && now - lastDraw < MIN_DT - 0.002 && !clock.manual) { requestAnimationFrame(tick); return; }
    drawFrame(now);
  }
  function drawFrame(now) {
    // a hand-driven step may be longer than a real frame; the walks and the
    // engine then advance by the same time the clock did
    const dt = Math.max(0, Math.min(clock.manual ? 0.5 : 0.08, now - lastT)); lastT = now;
    let live = false;
    liveWhy = {};
    stepLifeNow(false);
    // a tapped being that walks off is followed, not lost
    const follow = devLook ? devLook.id : selected;
    if (follow && beings[follow] && (beings[follow].walk || devLook)) {
      const p = beings[follow].holder.position.clone().setY(0).applyAxisAngle(YAX, view.spinT);
      view.txT = p.x; view.tzT = p.z;
      if (devLook) { view.tx = p.x; view.tz = p.z; }
    }
    ['spin', 'dist', 'tx', 'ty', 'tz', 'lift'].forEach((k) => {
      const n = approach(view[k], view[k + 'T'], dt, k === 'spin' ? 8 : 6);
      if (Math.abs(n - view[k + 'T']) > 1e-4) live = mark('camera');
      view[k] = n;
    });
    world.rotation.y = view.spin;
    // this frame's turn, before any being places a docked thing against it
    // (the world hangs off the scene root, so its own matrix is its world one)
    world.updateMatrix(); world.matrixWorld.copy(world.matrix);
    const W = renderer.domElement.width, H = renderer.domElement.height;
    if (Math.abs(view.lift) > 1e-3) camera.setViewOffset(W, H, 0, view.lift * H, W, H); else camera.clearViewOffset();
    // a marker keeps its size on screen as the camera comes in, so a close-up
    // is not a wall of bubbles
    const mk = MARKER_SCALE * Math.min(1, Math.max(0.42, view.dist / ringDist));
    camera.position.set(view.tx, view.ty + Math.sin(view.elev) * view.dist, view.tz + Math.cos(view.elev) * view.dist);
    camera.lookAt(view.tx, view.ty, view.tz);

    Object.values(beings).forEach((x) => {
      const b = x.b;
      const fb = frameBeing(x, now, dt), working = fb.working;
      if (fb.live) live = true;
      const hv = x.ov.v;
      b.head.rotation.y = (b.headYaw || 0) + b.face.sacc.x * 3 + hv.hy + (x.look || 0);
      b.head.rotation.x = (b.headPitch || 0) - view.elev * 0.12 + hv.hp;
      b.head.rotation.z = (b.headRoll || 0) + (x.headLevel || 0) + hv.hr;
      if (updateFace(x, now, dt, working)) live = true;
      if (b.marker.visible) {
        b.marker.scale.setScalar(mk);
        if (reduceMotion) b.marker.position.y = b.markerY + 0.2;
        else { b.marker.position.y = b.markerY + 0.2 + Math.sin(now * 1.9 + x.index) * 0.06; b.marker.rotation.y = -view.spin + Math.sin(now * 0.9 + x.index) * 0.15; live = mark('marker'); }
      }
      const want = selected === x.a.id ? 0.85 : 0;
      x.sel.material.opacity = approach(x.sel.material.opacity, want, dt, 8);
      if (Math.abs(x.sel.material.opacity - want) > 0.01) live = mark('select');
    });
    if (coreMarker.visible) {
      coreMarker.position.y = 1.2 + (reduceMotion ? 0 : Math.sin(now * 1.9) * 0.05);
      coreMarker.rotation.y = -view.spin;
      if (!reduceMotion) live = mark('marker');
    }
    if (!reduceMotion) { coreRing.rotation.z = now * 0.3; }
    // the sets' lamps fade and the plaza pulses; each says when it is done
    if (habitat.tick(now, dt)) live = mark('lamps');
    // a change of daypart is acted out, not cut; zero elapsed time moves nothing
    if (lightFade.p < 1) {
      if (dt > 0) {
        lightFade.p = Math.min(1, lightFade.p + dt / LIGHT_FADE_S);
        const e = lightFade.p * lightFade.p * (3 - 2 * lightFade.p);
        mixLight(lightFade.from, lightFade.to, e);
        Object.values(beings).forEach(rimOf);
      }
      if (lightFade.p < 1) live = mark('daylight');
    }

    if (!noRender) { renderer.render(scene, camera); frames++; }
    lastDraw = now; dirty = false;
    lastLive = live;
    if (clock.manual) { running = false; return; }
    if (live && visible && !document.hidden) requestAnimationFrame(tick);
    else { running = false; scheduleWake(); }
  }
  // When nothing moves, the loop sleeps until the next thing that is due:
  // a blink, the end of any being's current act (the life engine's next
  // decision), the next visit check. The daypart has its own minute timer.
  function scheduleWake() {
    clearTimeout(wakeTimer);
    if (disposed || clock.manual) return;
    const now = sceneNow(), ln = lifeNow();
    let next = Infinity;
    if (!reduceMotion) Object.values(beings).forEach((x) => { if (!x.asleep) next = Math.min(next, x.face.nextBlink); });
    if (life && !lifeHold.on) {
      Object.values(life.beings).forEach((st) => { if (st.actUntil > ln) next = Math.min(next, now + (st.actUntil - ln) / 1000); });
      const nv = life.meta && life.meta.nextVisitCheckAt;
      if (nv) next = Math.min(next, now + Math.max(0, nv - ln) / 1000);
    }
    if (!Number.isFinite(next)) return;
    wakeTimer = setTimeout(() => invalidate(), Math.max(50, (next - now) * 1000 + 30));
  }

  // ---- size and visibility ------------------------------------------
  function resize() {
    const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`; renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.fov = w < 520 ? 38 : 32;
    camera.updateProjectionMatrix();
    frame(true);
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(mount);
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) invalidate();
  });
  io.observe(mount);
  const onVis = () => { if (!document.hidden) invalidate(); };
  document.addEventListener('visibilitychange', onVis);
  // the daypart is looked at once a minute and draws only when it changes
  setDaypart(daypartOf(hourNow()), true);
  const dayTimer = setInterval(() => { if (!disposed) setDaypart(daypartOf(hourNow()), false); }, 60e3);
  resize();

  return {
    // apply the view model: poses, markers with real counts, dimming
    update(vm) {
      (vm.beings || []).forEach((v) => {
        const x = beings[v.id];
        if (!x) return;
        x.pose = v.pose;
        x.b.marker.visible = v.waiting > 0;
        if (v.waiting > 0 && v.waiting !== x.waiting) x.b.setCount(v.waiting);
        x.waiting = v.waiting;
        if (v.dim !== x.dim) { x.dim = v.dim; applyDim(x, v.dim); }
      });
      coreMarker.visible = (vm.core?.waiting || 0) > 0;
      if (coreMarker.visible) { corePlate.material.map = kit.numeralTexFor(vm.core.waiting > 9 ? '9+' : String(vm.core.waiting)); corePlate.material.needsUpdate = true; }
      lampsFromRecord(vm);
      lastVm = vm;
      stepLifeNow(true);
      invalidate();
    },
    select(id) {
      selected = id || null;
      frame(false);
    },
    // where a being is on screen, in CSS pixels (for the capture scripts)
    screenOf(id) {
      const x = beings[id];
      if (!x) return null;
      const v = new THREE.Vector3(0, 0.5, 0).applyMatrix4(x.holder.matrixWorld).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    },
    frames: () => frames,
    // whether a frame loop is live right now: it must be false when the map
    // is off screen or nothing moves (headless rAF is too slow to count on)
    running: () => running,
    // dev hook (window.__novaOrgMap is only set in dev): show any daypart,
    // a float hour, or null to go back to the device's own clock
    setHour(h) {
      if (h == null) clock.shiftMs = 0;
      else {
        clock.shiftMs = 0;
        let d = ((Number(h) % 24) + 24) % 24 - hourNow();
        if (d > 12) d -= 24; else if (d < -12) d += 24;
        clock.shiftMs = d * 3600e3;
      }
      setDaypart(daypartOf(hourNow()), true);
      // the engine's timers were set on the old clock; start it afresh on
      // the new one (a forced, held capture state is left alone)
      if (!lifeHold.on) { life = null; stepLifeNow(true); }
      return lightFade.part;
    },
    daypart: () => lightFade.part,
    // dev hook: force a being's act, place or path for a capture, e.g.
    //   setLife({ coach: { act: 'deliver', place: 'lane', path: ['home:coach', 'ring:train', 'spoke:train', 'post'] } }, { snap: true })
    // `world: { pulse: true }` fires the plaza. The engine is held (not
    // stepped) until setLife(null) hands the map back to it; `snap` puts
    // the forced beings at the start of their path (or on their spot).
    setLife(partial, opts = {}) {
      if (partial == null) {
        lifeHold.on = false; life = null;
        Object.values(beings).forEach((x) => { x.intentKey = null; });
        stepLifeNow(true);
        return 'released';
      }
      if (!life) {
        if (!lastVm) return 'no view model yet';
        const input = lifeInput();
        life = stepLife(initLife({ seed: input.seed, beings: input.beings }), input);
      }
      const now = lifeNow();
      const next = { ...life, beings: { ...life.beings }, world: { ...life.world } };
      Object.entries(partial).forEach(([id, p]) => {
        if (id === 'world') { Object.assign(next.world, p, { pulse: p.pulse === true ? now : (p.pulse ?? null) }); return; }
        if (!next.beings[id] || !beings[id]) return;
        const { durationMs, ...rest } = p;
        const dur = durationMs || (rest.path ? 20000 : 4000);
        next.beings[id] = {
          ...next.beings[id], place: 'home', spot: 'rest', facing: null, partner: null, path: null, carry: null,
          actSince: now, actUntil: now + dur, _seq: [], ...rest,
        };
        if (opts.snap) { beings[id].placed = false; beings[id].snapStart = !!rest.path; }
      });
      life = next;
      lifeHold.on = opts.hold !== false;
      applyLife(false);
      return Object.fromEntries(Object.keys(partial).filter((id) => next.beings[id]).map((id) => [id, next.beings[id].act]));
    },
    // dev hook: take the clock by hand, advance it dt seconds and draw one
    // frame now (headless Chrome barely runs requestAnimationFrame)
    // (draw = false skips only the GPU render, for counting live frames fast)
    step(dtSec = 1 / 15, draw = true) {
      if (!clock.manual) {
        clearTimeout(wakeTimer);
        clock.manual = true; clock.t0 = clock.t = performance.now() / 1000; clock.date = Date.now(); lastT = clock.t;
      }
      clock.t += Math.max(0, Number(dtSec) || 0);
      noRender = !draw;
      drawFrame(clock.t);
      noRender = false;
      return { frames, live: lastLive, why: Object.keys(liveWhy) };
    },
    // dev hook: give the clock back to real time, where it left off
    realtime() {
      if (!clock.manual) return 'already real';
      clock.shiftMs = lifeNow() - Date.now();
      clock.manual = false; lastT = performance.now() / 1000;
      invalidate();
      return 'real';
    },
    // dev read: where every being is and what the engine has it doing
    lifeState: () => ({
      held: lifeHold.on, manual: clock.manual, daypart: lightFade.part,
      beings: Object.fromEntries(Object.values(beings).map((x) => [x.a.id, {
        act: x.intent?.act || null, place: x.intent?.place || null, spot: x.intent?.spot || null, path: x.intent?.path || null,
        carry: x.intent?.carry || null, pos: [+x.holder.position.x.toFixed(3), +x.holder.position.y.toFixed(3), +x.holder.position.z.toFixed(3)],
        yaw: +x.yaw.toFixed(3), walking: !!x.walk, until: x.intent ? Math.round((x.intent.actUntil - lifeNow()) / 100) / 10 : null,
      }])),
    }),
    lastVm: () => lastVm,
    // dev read: what kept the last frame live, per reason (for the
    // running() measurement)
    liveReport: () => ({ ...liveWhy }),
    // dev hook: turn the map to an angle at once (a walk seen from the side)
    spin(rad) { view.spinT = view.spin = Number(rad) || 0; frame(true); return view.spin; },
    // dev hook: a close camera on one being (distance in world units), for
    // looking at a gait or a gesture; follows it while it walks. null ends it
    look(id, dist = 3.2) {
      devLook = id && beings[id] ? { id, dist } : null;
      if (!devLook) { frame(true); return 'ring'; }
      const p = beings[id].holder.position.clone().setY(0).applyAxisAngle(YAX, view.spin);
      Object.assign(view, { tx: p.x, txT: p.x, tz: p.z, tzT: p.z, ty: 0.3, tyT: 0.3, dist, distT: dist, lift: 0, liftT: 0 });
      invalidate();
      return id;
    },
    // which record lamps are on, per district (for the capture scripts)
    lampsLit: () => Object.fromEntries(Object.entries(habitat.districts).map(([id, d]) => [id, d.lamps.filter((L) => L.lit).map((L) => `${L.who || id}:${L.litOn ? 'on' : 'off'}`)])),
    dispose() {
      disposed = true;
      clearTimeout(wakeTimer);
      clearInterval(dayTimer);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      habitat.dispose();
      PROPS.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      envScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      envRT.dispose(); pmrem.dispose(); renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
