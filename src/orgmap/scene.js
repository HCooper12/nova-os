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
import { LAYOUT, createHabitat } from '../agentWorld/habitat.js';
import { daypartOf } from '../agentWorld/life.js';

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
  const hourOverride = { h: null };
  function hourNow() {
    if (hourOverride.h != null) return hourOverride.h;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
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
    beings[a.id] = { a, b, holder, hit, sel, mats, index: i, pose: 'wait', waiting: 0, dim: 0, face: b.face };
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
  let selected = null, ringDist = 14;
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
  let running = false, dirty = true, lastT = performance.now() / 1000, lastDraw = 0, frames = 0;
  let visible = true, wakeTimer = null, disposed = false;
  function invalidate() { dirty = true; if (!running && visible && !disposed) { running = true; requestAnimationFrame(tick); } }
  const approach = (cur, tgt, dt, k) => cur + (tgt - cur) * (1 - Math.exp(-dt * k));

  function updateFace(x, now, dt, working) {
    const face = x.face;
    let live = false;
    if (!reduceMotion) {
      if (face.blink > 0) {
        face.blink -= dt; live = true;
        if (face.blink <= 0) { face.blink = 0; face.nextBlink = now + (working ? 5.5 : 2.5) + Math.random() * 5; }
      } else if (now > face.nextBlink) { face.blink = 0.3; live = true; }
      if (now > face.nextSacc) {
        face.saccT.set((Math.random() - 0.5) * 0.026, (Math.random() - 0.5) * 0.014);
        face.nextSacc = now + (working ? 0.7 : 1.5) + Math.random() * 2.4;
      }
      face.sacc.lerp(face.saccT, Math.min(1, dt * 9));
      if (face.sacc.distanceTo(face.saccT) > 1e-4) live = true;
    } else { face.blink = 0; face.sacc.set(0, 0); }
    if (kit.face3(face, working, reduceMotion ? 0 : dt)) live = true;
    return live;
  }

  function tick() {
    if (disposed) return;
    const now = performance.now() / 1000;
    if (!dirty && now - lastDraw < MIN_DT - 0.002) { requestAnimationFrame(tick); return; }
    const dt = Math.min(0.08, now - lastT); lastT = now;
    let live = false;
    ['spin', 'dist', 'tx', 'ty', 'tz', 'lift'].forEach((k) => {
      const n = approach(view[k], view[k + 'T'], dt, k === 'spin' ? 8 : 6);
      if (Math.abs(n - view[k + 'T']) > 1e-4) live = true;
      view[k] = n;
    });
    world.rotation.y = view.spin;
    const W = renderer.domElement.width, H = renderer.domElement.height;
    if (Math.abs(view.lift) > 1e-3) camera.setViewOffset(W, H, 0, view.lift * H, W, H); else camera.clearViewOffset();
    // a marker keeps its size on screen as the camera comes in, so a close-up
    // is not a wall of bubbles
    const mk = MARKER_SCALE * Math.min(1, Math.max(0.42, view.dist / ringDist));
    camera.position.set(view.tx, view.ty + Math.sin(view.elev) * view.dist, view.tz + Math.cos(view.elev) * view.dist);
    camera.lookAt(view.tx, view.ty, view.tz);

    Object.values(beings).forEach((x) => {
      const b = x.b, working = x.pose === 'work';
      if (!reduceMotion) {
        const br = Math.sin(now * 0.85 + x.index * 1.7);
        b.body.scale.set(1 + br * 0.012, 1 + br * 0.006, 1 + br * 0.012);
        b.head.position.y = b.headY * (1 + br * 0.006);
      }
      if (b.tell && b.tell(now, working, reduceMotion)) live = true;
      b.head.rotation.y = (b.headYaw || 0) + b.face.sacc.x * 3;
      b.head.rotation.x = (b.headPitch || 0) - view.elev * 0.12;
      b.head.rotation.z = b.headRoll || 0;
      if (updateFace(x, now, dt, working)) live = true;
      if (b.marker.visible) {
        b.marker.scale.setScalar(mk);
        if (reduceMotion) b.marker.position.y = b.markerY + 0.2;
        else { b.marker.position.y = b.markerY + 0.2 + Math.sin(now * 1.9 + x.index) * 0.06; b.marker.rotation.y = -view.spin + Math.sin(now * 0.9 + x.index) * 0.15; live = true; }
      }
      const want = selected === x.a.id ? 0.85 : 0;
      x.sel.material.opacity = approach(x.sel.material.opacity, want, dt, 8);
      if (Math.abs(x.sel.material.opacity - want) > 0.01) live = true;
    });
    if (coreMarker.visible) {
      coreMarker.position.y = 1.2 + (reduceMotion ? 0 : Math.sin(now * 1.9) * 0.05);
      coreMarker.rotation.y = -view.spin;
      if (!reduceMotion) live = true;
    }
    if (!reduceMotion) { coreRing.rotation.z = now * 0.3; }
    // the sets' lamps fade and the plaza pulses; each says when it is done
    if (habitat.tick(now, dt)) live = true;
    // a change of daypart is acted out, not cut; zero elapsed time moves nothing
    if (lightFade.p < 1) {
      if (dt > 0) {
        lightFade.p = Math.min(1, lightFade.p + dt / LIGHT_FADE_S);
        const e = lightFade.p * lightFade.p * (3 - 2 * lightFade.p);
        mixLight(lightFade.from, lightFade.to, e);
        Object.values(beings).forEach(rimOf);
      }
      if (lightFade.p < 1) live = true;
    }

    renderer.render(scene, camera);
    frames++; lastDraw = now; dirty = false;
    if (live && visible && !document.hidden) requestAnimationFrame(tick);
    else { running = false; scheduleBlink(); }
  }
  // when nothing moves, the next blink is the only reason to draw
  function scheduleBlink() {
    clearTimeout(wakeTimer);
    if (reduceMotion || disposed) return;
    const now = performance.now() / 1000;
    const next = Math.min(...Object.values(beings).map((x) => x.face.nextBlink));
    wakeTimer = setTimeout(() => invalidate(), Math.max(50, (next - now) * 1000));
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
      hourOverride.h = h == null ? null : ((Number(h) % 24) + 24) % 24;
      setDaypart(daypartOf(hourNow()), true);
      return lightFade.part;
    },
    daypart: () => lightFade.part,
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
